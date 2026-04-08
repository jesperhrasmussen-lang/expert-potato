"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { searchMeals } from '@/lib/meal-search-api';
import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';
import { MealResultsView } from '@/components/meal-results-view';

const PORTION_LABELS: Record<string, string> = {
  small: 'Lille',
  medium: 'Medium',
  large: 'Stor',
};

function SearchSummaryBanner({ request }: { request: MealSearchRequest }) {
  return (
    <header className="summary-bar summary-bar-compact">
      <div>
        <p className="summary-eyebrow">Din sogning</p>
        <h1 className="summary-address">{request.address}</h1>
        <p className="summary-subline">10 billigste maltider pa tvaers af kaeder</p>
        <div className="summary-chip-row">
          <span className="badge badge-neutral">
            {request.includeStorePairs ? '1-2 kaeder' : 'Kun 1 kaede'}
          </span>
          <span className="badge badge-neutral">
            {PORTION_LABELS[request.portionSize] || 'Medium'} portion
          </span>
        </div>
      </div>
      <Link className="secondary-button link-button" href="/">
        Rediger sogning
      </Link>
    </header>
  );
}

export function MealResultsPageClient({ initialRequest }: { initialRequest: MealSearchRequest }) {
  const [data, setData] = useState<MealSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await searchMeals(initialRequest);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ukendt fejl');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialRequest, attempt]);

  const summary = <SearchSummaryBanner request={initialRequest} />;

  if (loading) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="true">
          <div className="section-head">
            <h2>Finder maltider</h2>
          </div>
          <p className="page-copy">
            Finder de billigste mulige maltider pa tvaers af kaedernes tilbud...
          </p>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite">
          <div className="section-head">
            <h2>Sogning fejlede</h2>
          </div>
          <p className="page-copy">{error}</p>
          <div className="state-actions">
            <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
              Prov igen
            </button>
            <Link className="secondary-button link-button" href="/">
              Rediger sogning
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (!data) {
    return null;
  }

  return <MealResultsView data={data} />;
}
