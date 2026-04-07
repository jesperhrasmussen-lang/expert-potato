import { hasLocalOfferDb, runDbSearch } from '@/lib/db-search';
import { runPipelineSearch } from '@/lib/pipeline-search';
import type { SearchRequest, SearchResponse } from '@/types/search-types';

export async function executeSearch(request: SearchRequest): Promise<SearchResponse> {
  if (hasLocalOfferDb()) {
    return runDbSearch(request);
  }

  if (process.env.ALLOW_LIVE_SEARCH_FALLBACK === '1') {
    return runPipelineSearch(request);
  }

  throw new Error(
    'Lokal tilbudsdatabase mangler. Kør DB refresh-jobbet først, eller sæt ALLOW_LIVE_SEARCH_FALLBACK=1 for eksplicit live fallback.',
  );
}

