import { mockSearchResponse } from '@/lib/mock-search-data';
import type { SearchRequest, SearchResponse } from '@/types/search-types';
import { validateSearchRequest } from '@/types/search-types';

export interface SearchApiOptions {
  endpoint?: string;
  useMock?: boolean;
  fetchImpl?: typeof fetch;
}

export async function searchOffers(
  request: SearchRequest,
  options: SearchApiOptions = {},
): Promise<SearchResponse> {
  validateSearchRequest(request);

  const { endpoint = '/api/search', useMock = false, fetchImpl = fetch } = options;

  if (useMock) {
    return buildMockResponse(request);
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Search request failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // ignore JSON parse failure and keep generic message
    }

    throw new Error(message);
  }

  return (await response.json()) as SearchResponse;
}

export function buildMockResponse(request: SearchRequest): SearchResponse {
  validateSearchRequest(request);

  const normalizedQueries = request.queries.map((query) => query.toLowerCase());
  const filteredGroups = mockSearchResponse.offerGroups.filter((group) =>
    normalizedQueries.includes(group.query.toLowerCase()),
  );

  const filteredOffers = filteredGroups.flatMap((group) => group.offers);
  const visibleStoreIds = new Set(filteredOffers.map((offer) => offer.storeId).filter(Boolean));
  const visibleOfferIds = new Set(filteredOffers.map((offer) => offer.offerId));

  return {
    ...mockSearchResponse,
    search: request,
    bestNow: mockSearchResponse.bestNow.filter((offer) => visibleOfferIds.has(offer.offerId)),
    upcoming: mockSearchResponse.upcoming.filter((offer) => visibleOfferIds.has(offer.offerId)),
    stores: mockSearchResponse.stores.filter((store) => visibleStoreIds.has(store.storeId)),
    chains: mockSearchResponse.chains.filter((chain) =>
      filteredOffers.some((offer) => offer.chainId === chain.chainId),
    ),
    offerGroups: filteredGroups,
    summary: {
      totalStoresInScope: mockSearchResponse.stores.filter(
        (store) => store.accessQualified && visibleStoreIds.has(store.storeId),
      ).length,
      totalOffersMatched: filteredOffers.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

