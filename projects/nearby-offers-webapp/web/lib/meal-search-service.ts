import { loadMealCatalog } from '@/lib/meal-catalog';
import { computeMealPricing, type SelectedRecipeIngredient } from '@/lib/meal-pricing';
import type {
  AllowedIngredientFamily,
  IngredientFamily,
  IngredientQuantity,
  MealCandidate,
  MealSearchRequest,
  MealSearchResponse,
  PortionSize,
  QuantityUnit,
  RecipeSlot,
  RecipeTemplate,
  StoreOption,
} from '@/types/meal-optimizer-types';

const VPS_API_URL = process.env.VPS_API_URL || 'http://187.124.179.86:8081';
const DEFAULT_CHAIN_DISTANCE_RADIUS_KM = 20;
const RESULT_LIMIT = 10;

const PORTION_MULTIPLIERS: Record<PortionSize, { meat: number; vegetable: number }> = {
  small:    { meat: 125 / 150, vegetable: 250 / 300 },
  medium:   { meat: 1,         vegetable: 1 },
  large:    { meat: 210 / 150, vegetable: 400 / 300 },
  combined: { meat: 1,         vegetable: 1 },
};
const PIECE_GRAMS_ASSUMPTIONS: Record<string, number> = {};

interface RawPlace {
  name?: string;
  brand?: string | null;
  address?: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  walkDistanceKm?: number;
}

interface RawOffer {
  query?: string;
  store?: string;
  storeNormalized?: string;
  productName?: string;
  description?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  currency?: string;
  sizeText?: string | null;
  sizeGramsMin?: number | null;
  sizeGramsMax?: number | null;
  unitPrice?: number | null;
  unitPriceUnit?: string | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  offerState?: string | null;
  productUrl?: string | null;
  comparisonGroup?: string | null;
  isOrganic?: boolean;
}

interface RawPayload {
  resolvedAddress: string;
  places: RawPlace[];
  offers: RawOffer[];
}

interface FamilyOfferChoice {
  ingredientFamily: IngredientFamily;
  requiredQuantity: IngredientQuantity;
  offer: RawOffer;
  store: StoreOption;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  estimated?: boolean;
}

const ESTIMATED_PRICE_MARKUP = 1.2;

export async function executeMealSearch(request: MealSearchRequest): Promise<MealSearchResponse> {
  const catalog = loadMealCatalog();
  const portionSize = request.portionSize || 'medium';
  const payload = await fetchFromVpsApi(request);
  const stores = buildStores(payload.places, payload.offers);
  const activeOffers = payload.offers.filter((offer) => offer.offerState === 'active');
  const storesByChainId = new Map(stores.map((store) => [store.chainId, store]));

  const candidates = stores.flatMap((store) =>
    catalog.recipeTemplates.flatMap((recipeTemplate) =>
      buildCandidatesForStore({
        store,
        recipeTemplate,
        storesByChainId,
        activeOffers,
        ingredientFamilyById: catalog.ingredientFamilyById,
        conversionRules: catalog.conversionRules,
        portionSize,
      }),
    ),
  );

  const deduped = dedupeCandidates(candidates).sort(compareCandidates);
  const limited = deduped.slice(0, RESULT_LIMIT);

  return {
    resolvedAddress: payload.resolvedAddress,
    search: request,
    candidates: limited,
    summary: {
      generatedAt: new Date().toISOString(),
      totalCandidates: limited.length,
      totalStoresInScope: stores.length,
    },
  };
}

async function fetchFromVpsApi(request: MealSearchRequest): Promise<RawPayload> {
  const response = await fetch(`${VPS_API_URL}/api/meal-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: request.address,
      radiusKm: resolveRadiusKm(request),
      maxWalkKm: request.maxWalkKm,
      maxTransitMin: request.maxTransitMin,
      portionSize: request.portionSize,
      organicOnly: request.organicOnly,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail || `VPS API returned ${response.status}`);
  }

  return (await response.json()) as RawPayload;
}

function buildStores(places: RawPlace[], offers: RawOffer[]): StoreOption[] {
  const relevantChains = new Set(
    offers
      .filter((offer) => offer.offerState === 'active' && offer.comparisonGroup && offer.comparisonGroup !== 'other')
      .map((offer) => normalizeChainId(offer.storeNormalized || offer.store || '')),
  );

  const stores = new Map<string, StoreOption & { lat?: number; lon?: number }>();

  for (const place of places) {
    const chainId = normalizeChainId(place.brand || place.name || '');
    if (!chainId || !relevantChains.has(chainId)) continue;

    const distanceMeters = Math.round((place.walkDistanceKm ?? place.distanceKm ?? 0) * 1000);
    const existing = stores.get(chainId);
    if (!existing || distanceMeters < existing.distanceMeters) {
      stores.set(chainId, {
        storeId: chainId,
        chainId,
        storeName: displayChainName(chainId, place.brand || place.name || chainId),
        distanceMeters,
        lat: place.lat,
        lon: place.lon,
      });
    }
  }

  return [...stores.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function buildCandidatesForStore(params: {
  store: StoreOption;
  recipeTemplate: RecipeTemplate;
  storesByChainId: Map<string, StoreOption>;
  activeOffers: RawOffer[];
  ingredientFamilyById: Map<string, IngredientFamily>;
  conversionRules: Parameters<typeof computeMealPricing>[0]['conversionRules'];
  portionSize: PortionSize;
}): MealCandidate[] {
  const { store, recipeTemplate, storesByChainId, activeOffers, ingredientFamilyById, conversionRules, portionSize } = params;
  const scopedOffers = activeOffers.filter((offer) =>
    normalizeChainId(offer.storeNormalized || offer.store || '') === store.chainId,
  );

  const slotChoices = recipeTemplate.slots.map((slot) =>
    resolveSlotChoices(slot, scopedOffers, ingredientFamilyById, storesByChainId, portionSize, store),
  );

  if (slotChoices.some((choices) => choices.length === 0)) {
    return [];
  }

  const combinations = cartesianProduct(slotChoices);
  const candidates: MealCandidate[] = [];

  for (const combination of combinations) {
    const pricing = computeMealPricing({
      recipeTemplate,
      selectedIngredients: combination.map<SelectedRecipeIngredient>((choice) => ({
        slotKey: choice.slotKey,
        ingredientFamilyId: choice.ingredientFamily.id,
        ingredientFamilyName: choice.ingredientFamily.displayName,
        quantity: choice.requiredQuantity,
        offer: {
          ingredientFamilyId: choice.ingredientFamily.id,
          ingredientFamilyName: choice.ingredientFamily.displayName,
          productName: choice.offer.productName || choice.ingredientFamily.displayName,
          storeId: choice.store.storeId,
          storeName: choice.store.storeName,
          packageQuantity: choice.packageQuantity,
          packageUnit: choice.packageUnit,
          packagePriceDkk: Number(choice.offer.effectivePrice ?? choice.offer.price ?? 0),
        },
      })),
      conversionRules,
    });

    const chosenIngredients = combination.map((choice) => ({
      slotKey: choice.slotKey,
      ingredientFamilyId: choice.ingredientFamily.id,
      ingredientFamilyName: choice.ingredientFamily.displayName,
      requiredQuantity: choice.requiredQuantity,
    }));

    const hasEstimatedPrice = combination.some((choice) => choice.estimated);

    // Mark estimated basket lines
    const basketLines = pricing.basketLines.map((line) => {
      const matchingChoice = combination.find((c) => c.ingredientFamily.id === line.ingredientFamilyId);
      return matchingChoice?.estimated ? { ...line, estimated: true } : line;
    });

    candidates.push({
      candidateId: `${recipeTemplate.id}:${store.storeId}:${chosenIngredients.map((item) => item.ingredientFamilyId).join('+')}`,
      recipeTemplateId: recipeTemplate.id,
      recipeName: renderRecipeName(chosenIngredients),
      servingsPerBatch: recipeTemplate.servingsPerBatch,
      basketCostDkk: pricing.basketCostDkk,
      recipeCostDkk: pricing.recipeCostDkk,
      pricePerMealDkk: pricing.pricePerMealDkk,
      storesUsed: [store],
      walkingDistanceMeters: store.distanceMeters,
      chosenIngredients,
      basketLines,
      sauceType: recipeTemplate.sauceType,
      pantryItems: recipeTemplate.pantryItems,
      hasEstimatedPrice,
    });
  }

  return candidates;
}

function resolveSlotChoices(
  slot: RecipeSlot,
  offers: RawOffer[],
  ingredientFamilyById: Map<string, IngredientFamily>,
  storesByChainId: Map<string, StoreOption>,
  portionSize: PortionSize = 'medium',
  fallbackStore?: StoreOption,
) {
  return slot.allowedFamilies.flatMap((allowed) => {
    const ingredientFamily = ingredientFamilyById.get(allowed.ingredientFamilyId);
    if (!ingredientFamily) return [];

    const baseQuantity = resolveRequiredQuantity(slot, allowed);
    const slotRole = slot.role === 'protein' ? 'meat' : slot.role === 'vegetable' ? 'vegetable' : null;
    const multiplier = slotRole ? PORTION_MULTIPLIERS[portionSize][slotRole] : 1;
    const requiredQuantity: IngredientQuantity = {
      value: Math.round(baseQuantity.value * multiplier),
      unit: baseQuantity.unit,
    };
    const matchingOffers = offers
      .filter((offer) => offer.comparisonGroup === ingredientFamily.id)
      .map((offer) => {
        const packageMeasurement = parsePackageMeasurement(offer);
        const store = storesByChainId.get(normalizeChainId(offer.storeNormalized || offer.store || ''));
        if (!packageMeasurement || !store) return null;
        if (packageMeasurement.value < requiredQuantity.value) return null;
        const price = Number(offer.effectivePrice ?? offer.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
          slotKey: slot.slotKey,
          ingredientFamily,
          requiredQuantity,
          offer,
          store,
          packageQuantity: packageMeasurement.value,
          packageUnit: packageMeasurement.unit,
        } satisfies FamilyOfferChoice & { slotKey: string };
      })
      .filter((value): value is FamilyOfferChoice & { slotKey: string } => value !== null)
      .sort((a, b) => {
        const aPrice = Number(a.offer.effectivePrice ?? a.offer.price ?? Number.POSITIVE_INFINITY);
        const bPrice = Number(b.offer.effectivePrice ?? b.offer.price ?? Number.POSITIVE_INFINITY);
        if (aPrice !== bPrice) return aPrice - bPrice;
        return a.store.distanceMeters - b.store.distanceMeters;
      });

    if (matchingOffers.length) return [matchingOffers[0]];

    // Fallback: generate estimated offer from reference price when no real offer exists
    if (ingredientFamily.referencePricePerKg && ingredientFamily.referencePackageG && fallbackStore) {
      const packageG = ingredientFamily.referencePackageG;
      const estimatedPrice = Math.round(ingredientFamily.referencePricePerKg * (packageG / 1000) * ESTIMATED_PRICE_MARKUP);
      const syntheticOffer: RawOffer = {
        productName: `${ingredientFamily.displayName} (estimeret pris)`,
        effectivePrice: estimatedPrice,
        price: estimatedPrice,
        sizeGramsMin: packageG,
        comparisonGroup: ingredientFamily.id,
        offerState: 'active',
      };
      return [{
        slotKey: slot.slotKey,
        ingredientFamily,
        requiredQuantity,
        offer: syntheticOffer,
        store: fallbackStore,
        packageQuantity: packageG,
        packageUnit: 'g' as QuantityUnit,
        estimated: true,
      }];
    }

    return [];
  });
}

function resolveRequiredQuantity(slot: RecipeSlot, allowed: AllowedIngredientFamily): IngredientQuantity {
  if (allowed.quantityOverride) {
    return allowed.quantityOverride;
  }
  if (slot.quantity) {
    return slot.quantity;
  }
  throw new Error(`Slot ${slot.slotKey} is missing quantity configuration`);
}

// Default package sizes when no size data is available (conservative estimates)
const DEFAULT_PACKAGE_GRAMS: Record<string, number> = {
  'minced-beef': 400,
  'minced-pork': 400,
  'minced-veal-pork': 400,
  'chicken-fillet': 400,
};

function tryParseGramsFromText(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(\d+(?:[.,]\d+)?)?\s*(g|kg|ml|cl|dl|l)\b/i);
  if (match) {
    const first = Number(match[1].replace(',', '.'));
    const second = match[2] ? Number(match[2].replace(',', '.')) : first;
    const unit = match[3].toLowerCase();
    const conservative = Math.min(first, second);
    if (unit === 'kg') return conservative * 1000;
    if (unit === 'g') return conservative;
  }
  return null;
}

function parsePackageMeasurement(offer: RawOffer): { value: number; unit: QuantityUnit } | null {
  if (offer.sizeGramsMin && offer.sizeGramsMin > 0) {
    return { value: offer.sizeGramsMin, unit: 'g' };
  }
  if (offer.sizeGramsMax && offer.sizeGramsMax > 0) {
    return { value: offer.sizeGramsMax, unit: 'g' };
  }

  // Try parsing from sizeText
  const sizeText = (offer.sizeText || '').toLowerCase();
  if (sizeText) {
    const match = sizeText.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(\d+(?:[.,]\d+)?)?\s*(g|kg|ml|cl|dl|l)\b/);
    if (match) {
      const first = Number(match[1].replace(',', '.'));
      const second = match[2] ? Number(match[2].replace(',', '.')) : first;
      const unit = match[3] as QuantityUnit | 'cl' | 'l';
      const conservative = Math.min(first, second);

      if (unit === 'kg') return { value: conservative * 1000, unit: 'g' };
      if (unit === 'g') return { value: conservative, unit: 'g' };
      if (unit === 'l') return { value: conservative * 1000, unit: 'ml' };
      if (unit === 'cl') return { value: conservative * 10, unit: 'ml' };
      if (unit === 'dl') return { value: conservative * 100, unit: 'ml' };
      return { value: conservative, unit: 'ml' };
    }

    const pieceMatch = sizeText.match(/(\d+)\s*(pcs|stk|st\.)\b/);
    if (pieceMatch && offer.comparisonGroup) {
      const assumedGrams = PIECE_GRAMS_ASSUMPTIONS[offer.comparisonGroup];
      if (assumedGrams) {
        return { value: Number(pieceMatch[1]) * assumedGrams, unit: 'g' };
      }
    }
  }

  // Try parsing grams from product name (e.g. "Hakket oksekød 400 g")
  const nameGrams = tryParseGramsFromText(offer.productName || '');
  if (nameGrams && nameGrams > 0) {
    return { value: nameGrams, unit: 'g' };
  }

  // Fall back to default package size for the ingredient family
  if (offer.comparisonGroup) {
    const defaultG = DEFAULT_PACKAGE_GRAMS[offer.comparisonGroup];
    if (defaultG) {
      return { value: defaultG, unit: 'g' };
    }
  }

  return null;
}

function renderRecipeName(chosenIngredients: { ingredientFamilyName: string; slotKey: string }[]) {
  const bySlot = new Map(chosenIngredients.map((item) => [item.slotKey, item.ingredientFamilyName]));
  const protein = bySlot.get('meat') || bySlot.get('protein') || 'Protein';
  const vegetable = bySlot.get('vegetable') || 'grontsag';
  return `${protein} & ${vegetable}`;
}

function dedupeCandidates(candidates: MealCandidate[]) {
  const byKey = new Map<string, MealCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.candidateId);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      byKey.set(candidate.candidateId, candidate);
    }
  }
  return [...byKey.values()];
}

function compareCandidates(a: MealCandidate, b: MealCandidate) {
  if (a.pricePerMealDkk !== b.pricePerMealDkk) return a.pricePerMealDkk - b.pricePerMealDkk;
  if (a.basketCostDkk !== b.basketCostDkk) return a.basketCostDkk - b.basketCostDkk;
  if (a.walkingDistanceMeters !== b.walkingDistanceMeters) return a.walkingDistanceMeters - b.walkingDistanceMeters;
  return a.recipeName.localeCompare(b.recipeName, 'da');
}

function normalizeChainId(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function displayChainName(chainId: string, fallback: string) {
  const known = new Map<string, string>([
    ['netto', 'Netto'],
    ['lidl', 'Lidl'],
    ['foetex', 'føtex'],
    ['rema-1000', 'REMA 1000'],
    ['meny', 'Meny'],
    ['superbrugsen', 'SuperBrugsen'],
    ['brugsen', 'Brugsen'],
    ['365discount', '365discount'],
  ]);
  return known.get(chainId) || fallback;
}

function resolveRadiusKm(request: MealSearchRequest): number {
  if (request.radiusKm !== null) return Math.max(request.radiusKm, DEFAULT_CHAIN_DISTANCE_RADIUS_KM);
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, DEFAULT_CHAIN_DISTANCE_RADIUS_KM);
  if (request.maxTransitMin !== null) return DEFAULT_CHAIN_DISTANCE_RADIUS_KM;
  return DEFAULT_CHAIN_DISTANCE_RADIUS_KM;
}

function cartesianProduct<T>(collections: T[][]): T[][] {
  return collections.reduce<T[][]>(
    (acc, collection) => acc.flatMap((prefix) => collection.map((item) => [...prefix, item])),
    [[]],
  );
}

