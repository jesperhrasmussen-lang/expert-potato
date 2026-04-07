import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Offer, SearchRequest, SearchResponse, StoreRow } from '@/types/search-types';

const execFileAsync = promisify(execFile);
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; value: SearchResponse }>();
const SUPPORTED_CHAIN_IDS = new Set([
  'netto',
  'lidl',
  'foetex',
  'rema-1000',
  'meny',
  'kvickly',
  'superbrugsen',
  'brugsen',
  '365discount',
  'dagli-brugsen',
]);

interface PipelinePlace {
  name?: string;
  brand?: string | null;
  address?: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  walkDistanceKm?: number;
  walkDistanceSource?: string;
}

interface PipelineOffer {
  publicId?: string;
  source?: string;
  sourceKind?: string;
  query?: string;
  store?: string;
  storeNormalized?: string;
  productName?: string;
  description?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  effectivePriceKind?: string | null;
  appPrice?: number | null;
  membershipPrice?: number | null;
  currency?: string;
  sizeText?: string | null;
  unitPrice?: number | null;
  unitPriceMin?: number | null;
  unitPriceMax?: number | null;
  unitPriceUnit?: string | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  offerState?: string | null;
  productUrl?: string | null;
  comparisonGroup?: string | null;
}

interface PipelinePayload {
  resolvedAddress: string;
  chains: string[];
  places: PipelinePlace[];
  offers: PipelineOffer[];
}

export async function runPipelineSearch(request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = JSON.stringify(request);
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'find_nearby_offers_dk.py');

  const args = [
    scriptPath,
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--json',
  ];

  if (request.maxWalkKm !== null) {
    args.push('--max-walk-km', String(request.maxWalkKm));
  }

  if (request.maxTransitMin !== null) {
    args.push('--max-transit-min', String(request.maxTransitMin));
  }

  for (const query of request.queries) {
    args.push('--query', query);
  }

  const { stdout, stderr } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  if (stderr?.trim()) {
    console.warn(stderr.trim());
  }

  const payload = JSON.parse(stdout) as PipelinePayload;
  const normalized = normalizePipelinePayload(payload, request);

  searchCache.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    value: normalized,
  });

  return normalized;
}

export function normalizePipelinePayload(payload: PipelinePayload, request: SearchRequest): SearchResponse {
  const stores = buildStores(payload.places, payload.offers);
  const primaryStoreByChain = new Map(stores.map((store) => [store.chainId, store]));

  const offers = dedupeOffers(
    payload.offers
      .map((offer, index) => normalizeOffer(offer, index, primaryStoreByChain))
      .filter((offer): offer is Offer => offer !== null),
  ).sort(compareOffers);

  const bestNow = pickBestPerQuery(offers.filter((offer) => isActive(offer)));
  const upcoming = pickBestPerQuery(offers.filter((offer) => isUpcoming(offer)));

  const offerGroups = request.queries.map((query) => ({
    query,
    offers: offers.filter((offer) => offer.query.toLowerCase() === query.toLowerCase()),
  }));

  const chains = Array.from(
    new Map(
      stores.map((store) => [store.chainId, { chainId: store.chainId, name: displayChainName(store.chainId, store.name) }]),
    ).values(),
  );

  return {
    resolvedAddress: payload.resolvedAddress,
    search: request,
    chains,
    stores,
    bestNow,
    upcoming,
    offerGroups,
    summary: {
      totalStoresInScope: stores.filter((store) => store.accessQualified).length,
      totalOffersMatched: offers.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildStores(places: PipelinePlace[], offers: PipelineOffer[]): StoreRow[] {
  const aggregated = new Map<
    string,
    {
      chainId: string;
      name: string;
      distanceMeters: number;
      relevantOfferCount: number;
      candidateIndex: number;
    }
  >();

  for (const [index, place] of places.entries()) {
    const chainId = normalizeChainId(place.brand || place.name || `store-${index + 1}`);
    const relevantOfferCount = offers.filter(
      (offer) => normalizeChainId(offer.storeNormalized || offer.store || '') === chainId,
    ).length;

    if (relevantOfferCount === 0 && !SUPPORTED_CHAIN_IDS.has(chainId)) {
      continue;
    }

    const distanceMeters = Math.round((place.walkDistanceKm ?? place.distanceKm ?? 0) * 1000);
    const existing = aggregated.get(chainId);

    if (!existing || distanceMeters < existing.distanceMeters) {
      aggregated.set(chainId, {
        chainId,
        name: place.brand || place.name || `Store ${index + 1}`,
        distanceMeters,
        relevantOfferCount,
        candidateIndex: index + 1,
      });
      continue;
    }

    existing.relevantOfferCount = Math.max(existing.relevantOfferCount, relevantOfferCount);
  }

  return [...aggregated.values()]
    .filter((store) => store.relevantOfferCount > 0)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .map((store) => ({
      storeId: `${store.chainId}-${store.candidateIndex}`,
      chainId: store.chainId,
      name: store.name,
      distanceMeters: store.distanceMeters,
      accessQualified: true,
      relevantOfferCount: store.relevantOfferCount,
    }));
}

function normalizeOffer(
  offer: PipelineOffer,
  index: number,
  primaryStoreByChain: Map<string, StoreRow>,
): Offer | null {
  const rawPrice = offer.effectivePrice ?? offer.price;
  if (rawPrice === null || rawPrice === undefined) {
    return null;
  }

  const chainId = normalizeChainId(offer.storeNormalized || offer.store || `chain-${index + 1}`);
  const sourceKind = inferSourceKind(offer);
  const store = primaryStoreByChain.get(chainId) ?? null;
  const unitPriceText = buildUnitPriceText(offer);
  const validFrom = normalizeDate(offer.offerStartDate);
  const validTo = normalizeDate(offer.offerEndDate);

  return {
    offerId: String(offer.publicId || `${chainId}-${index + 1}`),
    query: offer.query || 'unknown',
    chainId,
    chainName: displayChainName(chainId, offer.store || store?.name || chainId),
    storeId: store?.storeId ?? null,
    storeName: store?.name ?? null,
    productTitle: offer.productName || 'Unknown product',
    price: Number(rawPrice),
    currency: offer.currency || 'DKK',
    sizeText: offer.sizeText ?? null,
    unitPriceText,
    distanceMeters: store?.distanceMeters ?? null,
    validFrom,
    validTo,
    sourceKind,
    sourceLabel: buildSourceLabel(offer.sourceKind, sourceKind),
    sourceUrl: buildSourceUrl(offer, chainId),
    flags: buildFlags(offer, sourceKind, validTo),
    confidence: buildConfidence(offer, sourceKind),
  };
}

function normalizeChainId(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'unknown-chain';
}

function displayChainName(chainId: string, fallback: string): string {
  const known = new Map<string, string>([
    ['netto', 'Netto'],
    ['lidl', 'Lidl'],
    ['foetex', 'føtex'],
    ['rema-1000', 'REMA 1000'],
    ['meny', 'Meny'],
    ['kvickly', 'Kvickly'],
    ['superbrugsen', 'SuperBrugsen'],
    ['brugsen', 'Brugsen'],
    ['365discount', '365discount'],
    ['dagli-brugsen', "Dagli'Brugsen"],
  ]);

  return known.get(chainId) || fallback;
}

function inferSourceKind(offer: PipelineOffer): 'direct' | 'fallback' {
  if (offer.source === 'direct-chain') return 'direct';
  if ((offer.sourceKind || '').includes('direct')) return 'direct';
  return 'fallback';
}

function buildSourceLabel(rawSourceKind: string | undefined, sourceKind: 'direct' | 'fallback'): string {
  const mapping = new Map<string, string>([
    ['tjek-direct', 'Tjek'],
    ['ipaper-direct', 'iPaper'],
    ['lidl-direct', 'Lidl'],
    ['publication-search', 'eTilbudsavis'],
  ]);

  if (rawSourceKind && mapping.has(rawSourceKind)) {
    return mapping.get(rawSourceKind)!;
  }

  return sourceKind === 'direct' ? 'Direct source' : 'Fallback source';
}

function buildSourceUrl(offer: PipelineOffer, chainId: string): string {
  if (offer.productUrl && /^https?:\/\//.test(offer.productUrl)) {
    return offer.productUrl;
  }

  const fallbackMap = new Map<string, string>([
    ['netto', 'https://www.netto.dk/'],
    ['lidl', 'https://www.lidl.dk/'],
    ['foetex', 'https://www.foetex.dk/'],
    ['rema-1000', 'https://rema1000.dk/'],
    ['meny', 'https://meny.dk/'],
    ['kvickly', 'https://kvickly.dk/'],
    ['superbrugsen', 'https://superbrugsen.dk/'],
    ['brugsen', 'https://brugsen.dk/'],
    ['365discount', 'https://365discount.dk/'],
  ]);

  return fallbackMap.get(chainId) || 'https://example.com/';
}

function buildFlags(
  offer: PipelineOffer,
  sourceKind: 'direct' | 'fallback',
  validTo: string | null,
): Offer['flags'] {
  const flags: Offer['flags'] = [sourceKind === 'direct' ? 'direct_source' : 'fallback_source'];

  if (offer.appPrice !== null && offer.appPrice !== undefined) {
    flags.push('app_price');
  }

  if (offer.membershipPrice !== null && offer.membershipPrice !== undefined) {
    flags.push('membership_price');
  }

  if (offer.offerState === 'upcoming') {
    flags.push('starts_soon');
  }

  if (validTo && isEndingSoon(validTo)) {
    flags.push('ends_soon');
  }

  if (isAmbiguousMatch(offer)) {
    flags.push('ambiguous_match');
  }

  return [...new Set(flags)];
}

function buildConfidence(offer: PipelineOffer, sourceKind: 'direct' | 'fallback'): 'high' | 'medium' | 'low' {
  const ambiguous = isAmbiguousMatch(offer);

  if (ambiguous && sourceKind === 'fallback') return 'low';
  if (ambiguous) return 'medium';
  if (sourceKind === 'direct') return 'high';
  return 'medium';
}

function isAmbiguousMatch(offer: PipelineOffer): boolean {
  const query = normalizeQueryFamily(offer.query || '');
  const group = offer.comparisonGroup || '';

  if (query && group && query !== group && group !== 'generic') {
    return true;
  }

  return isTextuallyAmbiguous(offer);
}

function normalizeQueryFamily(query: string): string {
  const low = query.toLowerCase();
  if (low.includes('hakket') && low.includes('okse')) return 'minced-beef';
  if (low.includes('kylling') && (low.includes('bryst') || low.includes('filet') || low.includes('inderfilet'))) {
    return 'chicken-fillet';
  }
  return 'generic';
}

function isTextuallyAmbiguous(offer: PipelineOffer): boolean {
  const text = `${offer.productName || ''} ${offer.description || ''}`.toLowerCase();
  const queryFamily = normalizeQueryFamily(offer.query || '');

  if (text.includes(' eller ')) {
    return true;
  }

  if (queryFamily === 'minced-beef') {
    return text.includes('kalv') || text.includes('gris') || text.includes('grise');
  }

  if (queryFamily === 'chicken-fillet') {
    return text.includes('hel kylling') || text.includes('vinger') || text.includes('lår');
  }

  return false;
}

function buildUnitPriceText(offer: PipelineOffer): string | null {
  if (offer.unitPrice !== null && offer.unitPrice !== undefined) {
    return `${toDanishNumber(offer.unitPrice)} ${offer.unitPriceUnit || ''}`.trim();
  }

  if (offer.unitPriceMin !== null && offer.unitPriceMin !== undefined) {
    const max = offer.unitPriceMax ?? offer.unitPriceMin;
    return `${toDanishNumber(offer.unitPriceMin)}-${toDanishNumber(max)} ${offer.unitPriceUnit || ''}`.trim();
  }

  return null;
}

function toDanishNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function compareOffers(a: Offer, b: Offer): number {
  const aAmbiguous = a.flags.includes('ambiguous_match');
  const bAmbiguous = b.flags.includes('ambiguous_match');
  if (aAmbiguous !== bAmbiguous) return aAmbiguous ? 1 : -1;

  if (a.sourceKind !== b.sourceKind) return a.sourceKind === 'direct' ? -1 : 1;

  const aUnit = parseUnitPrice(a.unitPriceText);
  const bUnit = parseUnitPrice(b.unitPriceText);
  if (aUnit !== bUnit) return aUnit - bUnit;
  if (a.price !== b.price) return a.price - b.price;
  if ((a.distanceMeters ?? Number.POSITIVE_INFINITY) !== (b.distanceMeters ?? Number.POSITIVE_INFINITY)) {
    return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY);
  }
  return a.chainName.localeCompare(b.chainName);
}

function parseUnitPrice(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const match = value.match(/[0-9]+(?:,[0-9]+)?/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[0].replace(',', '.'));
}

function isActive(offer: Offer): boolean {
  if (!offer.validFrom || !offer.validTo) return false;
  const now = new Date();
  return new Date(offer.validFrom) <= now && now <= new Date(offer.validTo);
}

function isUpcoming(offer: Offer): boolean {
  if (!offer.validFrom) return false;
  return new Date(offer.validFrom) > new Date();
}

function isEndingSoon(validTo: string): boolean {
  const now = new Date();
  const then = new Date(validTo);
  const diffMs = then.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 2 * 24 * 60 * 60 * 1000;
}

function dedupeOffers(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  const deduped: Offer[] = [];

  for (const offer of offers) {
    const key = [offer.query, offer.chainId, offer.productTitle, offer.price, offer.sizeText, offer.validFrom, offer.validTo].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(offer);
  }

  return deduped;
}

function pickBestPerQuery(offers: Offer[]): Offer[] {
  const byQuery = new Map<string, Offer[]>();

  for (const offer of offers) {
    const key = offer.query.toLowerCase();
    const existing = byQuery.get(key) || [];
    existing.push(offer);
    byQuery.set(key, existing);
  }

  return [...byQuery.values()]
    .map((group) => [...group].sort(compareOffers)[0])
    .filter(Boolean)
    .sort(compareOffers);
}

function resolveRadiusKm(request: SearchRequest): number {
  if (request.radiusKm !== null) return request.radiusKm;
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, 3);
  if (request.maxTransitMin !== null) return 5;
  return 3;
}

