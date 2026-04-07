export type AccessMode = 'radius' | 'walk' | 'transit';

export type SourceKind = 'direct' | 'fallback';

export type OfferFlag =
  | 'direct_source'
  | 'fallback_source'
  | 'app_price'
  | 'membership_price'
  | 'ambiguous_match'
  | 'starts_soon'
  | 'ends_soon';

export type Confidence = 'high' | 'medium' | 'low';

export interface SearchRequest {
  address: string;
  accessMode: AccessMode;
  radiusKm: number | null;
  maxWalkKm: number | null;
  maxTransitMin: number | null;
  queries: string[];
}

export interface ChainRow {
  chainId: string;
  name: string;
}

export interface StoreRow {
  storeId: string;
  chainId: string;
  name: string;
  distanceMeters: number;
  accessQualified: boolean;
  relevantOfferCount: number;
}

export interface Offer {
  offerId: string;
  query: string;
  chainId: string;
  chainName: string;
  storeId: string | null;
  storeName: string | null;
  productTitle: string;
  price: number;
  currency: string;
  sizeText: string | null;
  unitPriceText: string | null;
  distanceMeters: number | null;
  validFrom: string | null;
  validTo: string | null;
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceUrl: string;
  flags: OfferFlag[];
  confidence: Confidence;
}

export interface OfferGroup {
  query: string;
  offers: Offer[];
}

export interface SearchSummary {
  totalStoresInScope: number;
  totalOffersMatched: number;
  generatedAt: string;
}

export interface SearchResponse {
  resolvedAddress: string;
  search: SearchRequest;
  chains: ChainRow[];
  stores: StoreRow[];
  bestNow: Offer[];
  upcoming: Offer[];
  offerGroups: OfferGroup[];
  summary: SearchSummary;
}

export function validateSearchRequest(request: SearchRequest): void {
  if (!request.address.trim()) {
    throw new Error('address is required');
  }

  if (!request.queries.length) {
    throw new Error('at least one query is required');
  }

  const activeThresholds = [request.radiusKm, request.maxWalkKm, request.maxTransitMin].filter(
    (value) => value !== null,
  );

  if (activeThresholds.length !== 1) {
    throw new Error('exactly one threshold must be set');
  }

  if (request.accessMode === 'radius' && request.radiusKm === null) {
    throw new Error('radiusKm is required when accessMode=radius');
  }

  if (request.accessMode === 'walk' && request.maxWalkKm === null) {
    throw new Error('maxWalkKm is required when accessMode=walk');
  }

  if (request.accessMode === 'transit' && request.maxTransitMin === null) {
    throw new Error('maxTransitMin is required when accessMode=transit');
  }
}

