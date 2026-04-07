import { MealResultsPageClient } from '@/components/meal-results-page-client';
import type { MealSearchRequest } from '@/types/meal-optimizer-types';

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const request: MealSearchRequest = {
    address: typeof params.address === 'string' ? params.address : 'Tingvej 4A, 2300 København S',
    accessMode: 'walk',
    radiusKm: null,
    maxWalkKm: null,
    maxTransitMin: null,
    includeStorePairs: params.includeStorePairs !== '0',
  };

  return (
    <main className="page-stack">
      <MealResultsPageClient initialRequest={request} />
    </main>
  );
}

