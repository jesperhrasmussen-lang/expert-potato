import { MealResultsPageClient } from '@/components/meal-results-page-client';
import type { MealSearchRequest, PortionSize } from '@/types/meal-optimizer-types';

const VALID_PORTION_SIZES: PortionSize[] = ['2000', '2500', '3000', '3500', '4000'];

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawPortion = typeof params.portionSize === 'string' ? params.portionSize : '2000';
  const portionSize: PortionSize = (VALID_PORTION_SIZES as string[]).includes(rawPortion)
    ? (rawPortion as PortionSize)
    : '2000';

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
