import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { hasLocalOfferDb, localOfferDbPath } from '@/lib/db-search';
import { loadMealCatalog } from '@/lib/meal-catalog';
import { computeMealPricing, type SelectedRecipeIngredient } from '@/lib/meal-pricing';
import type {
  AllowedIngredientFamily,
  IngredientFamily,
  IngredientQuantity,
  MealCandidate,
  MealSearchRequest,
  MealSearchResponse,
  QuantityUnit,
  RecipeSlot,
  RecipeTemplate,
  StoreOption,
} from '@/types/meal-optimizer-types';

const execFileAsync = promisify(execFile);
const MAX_STORE_PAIR_METERS = 600;
const DEFAULT_CHAIN_DISTANCE_RADIUS_KM = 20;
const RESULT_LIMIT = 5;
const PIECE_GRAMS_ASSUMPTIONS: Record<string, number> = {
  broccoli: 500,
  cauliflower: 650,
  'white-cabbage': 1000,
  'red-cabbage': 1000,
};

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
}

interface RawPayload {
  resolvedAddress: string;
  places: RawPlace[];
  offers: RawOffer[];
}

interface CandidateStoreSet {
  key: string;
  stores: StoreOption[];
  interStoreDistanceMeters: number | null;
  walkingDistanceMeters: number;
}

interface FamilyOfferChoice {
  ingredientFamily: IngredientFamily;
  requiredQuantity: IngredientQuantity;
  offer: RawOffer;
  store: StoreOption;
  packageQuantity: number;
  packageUnit: QuantityUnit;
}

export async function executeMealSearch(request: MealSearchRequest): Promise<MealSearchResponse> {
  if (!hasLocalOfferDb()) {
    throw new Error('Lokal tilbudsdatabase mangler. Kør DB refresh-jobbet først.');
  }

  const catalog = loadMealCatalog();
  const payload = await runRawDbSearch(request, catalog.ingredientFamilies.flatMap((family) => family.searchTerms));
  const stores = buildStores(payload.places, payload.offers);
  const storeSets = buildStoreSets(stores, request.includeStorePairs);
  const activeOffers = payload.offers.filter((offer) => offer.offerState === 'active');

  const candidates = storeSets.flatMap((storeSet) =>
    catalog.recipeTemplates.flatMap((recipeTemplate) =>
      buildCandidatesForStoreSet({
        storeSet,
        recipeTemplate,
        storesByChainId: new Map(stores.map((store) => [store.chainId, store])),
        activeOffers,
        ingredientFamilyById: catalog.ingredientFamilyById,
        conversionRules: catalog.conversionRules,
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
      totalStorePairsConsidered: storeSets.filter((set) => set.stores.length === 2).length,
    },
  };
}

async function runRawDbSearch(request: MealSearchRequest, queries: string[]): Promise<RawPayload> {
  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'search_offer_db_dk.py');
  const args = [
    scriptPath,
    localOfferDbPath(),
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--all-chains',
    '--skip-quality-filters',
    '--json',
  ];

  for (const query of queries) {
    args.push('--query', query);
  }

  const { stdout } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as RawPayload;
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

function buildStoreSets(stores: StoreOption[], includePairs: boolean): CandidateStoreSet[] {
  const singles = stores.map((store) => ({
    key: store.storeId,
    stores: [store],
    interStoreDistanceMeters: null,
    walkingDistanceMeters: store.distanceMeters,
  }));

  if (!includePairs) return singles;

  const pairs: CandidateStoreSet[] = [];
  for (let i = 0; i < stores.length; i += 1) {
    for (let j = i + 1; j < stores.length; j += 1) {
      const a = stores[i];
      const b = stores[j];
      const pairDistanceMeters = haversineMeters((a as StoreOption & { lat?: number; lon?: number }).lat, (a as StoreOption & { lat?: number; lon?: number }).lon, (b as StoreOption & { lat?: number; lon?: number }).lat, (b as StoreOption & { lat?: number; lon?: number }).lon);
      if (pairDistanceMeters === null || pairDistanceMeters > MAX_STORE_PAIR_METERS) continue;
      pairs.push({
        key: `${a.storeId}+${b.storeId}`,
        stores: [a, b],
        interStoreDistanceMeters: pairDistanceMeters,
        walkingDistanceMeters: Math.min(a.distanceMeters, b.distanceMeters) + pairDistanceMeters,
      });
    }
  }

  return [...singles, ...pairs];
}

function buildCandidatesForStoreSet(params: {
  storeSet: CandidateStoreSet;
  recipeTemplate: RecipeTemplate;
  storesByChainId: Map<string, StoreOption>;
  activeOffers: RawOffer[];
  ingredientFamilyById: Map<string, IngredientFamily>;
  conversionRules: Parameters<typeof computeMealPricing>[0]['conversionRules'];
}): MealCandidate[] {
  const { storeSet, recipeTemplate, storesByChainId, activeOffers, ingredientFamilyById, conversionRules } = params;
  const scopedOffers = activeOffers.filter((offer) =>
    storeSet.stores.some((store) => normalizeChainId(offer.storeNormalized || offer.store || '') === store.chainId),
  );

  const slotChoices = recipeTemplate.slots.map((slot) =>
    resolveSlotChoices(slot, scopedOffers, ingredientFamilyById, storesByChainId),
  );

  if (slotChoices.some((choices) => choices.length === 0)) {
    return [];
  }

  const combinations = cartesianProduct(slotChoices);
  const candidates: MealCandidate[] = [];

  for (const combination of combinations) {
    const selectedStores = new Map<string, StoreOption>();
    for (const choice of combination) {
      selectedStores.set(choice.store.storeId, choice.store);
    }

    if (storeSet.stores.length === 2 && selectedStores.size < 2) {
      continue;
    }

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

    candidates.push({
      candidateId: `${recipeTemplate.id}:${[...selectedStores.keys()].sort().join('+')}:${chosenIngredients.map((item) => item.ingredientFamilyId).join('+')}`,
      recipeTemplateId: recipeTemplate.id,
      recipeName: renderRecipeName(chosenIngredients),
      servingsPerBatch: recipeTemplate.servingsPerBatch,
      basketCostDkk: pricing.basketCostDkk,
      recipeCostDkk: pricing.recipeCostDkk,
      pricePerMealDkk: pricing.pricePerMealDkk,
      storesUsed: [...selectedStores.values()].sort((a, b) => a.distanceMeters - b.distanceMeters),
      interStoreDistanceMeters: selectedStores.size === 2 ? storeSet.interStoreDistanceMeters : null,
      walkingDistanceMeters:
        selectedStores.size === 2
          ? storeSet.walkingDistanceMeters
          : [...selectedStores.values()][0]?.distanceMeters ?? storeSet.walkingDistanceMeters,
      chosenIngredients,
      basketLines: pricing.basketLines,
    });
  }

  return candidates;
}

function resolveSlotChoices(
  slot: RecipeSlot,
  offers: RawOffer[],
  ingredientFamilyById: Map<string, IngredientFamily>,
  storesByChainId: Map<string, StoreOption>,
) {
  return slot.allowedFamilies.flatMap((allowed) => {
    const ingredientFamily = ingredientFamilyById.get(allowed.ingredientFamilyId);
    if (!ingredientFamily) return [];

    const requiredQuantity = resolveRequiredQuantity(slot, allowed);
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

    return matchingOffers.length ? [matchingOffers[0]] : [];
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

function parsePackageMeasurement(offer: RawOffer): { value: number; unit: QuantityUnit } | null {
  if (offer.sizeGramsMin && offer.sizeGramsMin > 0) {
    return { value: offer.sizeGramsMin, unit: 'g' };
  }
  if (offer.sizeGramsMax && offer.sizeGramsMax > 0) {
    return { value: offer.sizeGramsMax, unit: 'g' };
  }

  const text = (offer.sizeText || '').toLowerCase();
  if (!text) return null;

  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(\d+(?:[.,]\d+)?)?\s*(g|kg|ml|cl|dl|l)\b/);
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

  const pieceMatch = text.match(/(\d+)\s*(pcs|stk|st\.)\b/);
  if (pieceMatch && offer.comparisonGroup) {
    const assumedGrams = PIECE_GRAMS_ASSUMPTIONS[offer.comparisonGroup];
    if (assumedGrams) {
      return { value: Number(pieceMatch[1]) * assumedGrams, unit: 'g' };
    }
  }

  return null;
}

function renderRecipeName(chosenIngredients: { ingredientFamilyName: string; slotKey: string }[]) {
  const bySlot = new Map(chosenIngredients.map((item) => [item.slotKey, item.ingredientFamilyName]));
  const protein = bySlot.get('meat') || bySlot.get('protein') || 'Protein';
  const vegetable = bySlot.get('vegetable') || 'grøntsag';
  const dairy = bySlot.get('dairy') || 'sauce';
  return `${protein} med ${vegetable} og ${dairy}-sauce`;
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

function haversineMeters(lat1?: number, lon1?: number, lat2?: number, lon2?: number) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === undefined || value === null)) {
    return null;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad((lat2 as number) - (lat1 as number));
  const dLon = toRad((lon2 as number) - (lon1 as number));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1 as number)) *
      Math.cos(toRad(lat2 as number)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

function cartesianProduct<T>(collections: T[][]): T[][] {
  return collections.reduce<T[][]>(
    (acc, collection) => acc.flatMap((prefix) => collection.map((item) => [...prefix, item])),
    [[]],
  );
}

