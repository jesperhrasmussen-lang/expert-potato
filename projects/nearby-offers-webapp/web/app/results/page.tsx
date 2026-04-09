import { MealResultsPageClient } from '@/components/meal-results-page-client';
import type { MealSearchRequest, PortionSize } from '@/types/meal-optimizer-types';

const VALID_PORTION_SIZES = ['small', 'medium', 'large'];

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawPortion = typeof params.portionSize === 'string' ? params.portionSize : 'medium';
  const portionSize: PortionSize = VALID_PORTION_SIZES.includes(rawPortion)
    ? (rawPortion as PortionSize)
    : 'medium';

  const request: MealSearchRequest = {
    address: typeof params.address === 'string' ? params.address : 'Tingvej 4A, 2300 Kobenhavn S',
    accessMode: 'walk',
    radiusKm: null,
    maxWalkKm: null,
    maxTransitMin: null,
    portionSize,
    organicOnly: params.organicOnly === '1',
  };

  return (
    <main className="page-stack">
      <MealResultsPageClient initialRequest={request} />
    </main>
  );
}
