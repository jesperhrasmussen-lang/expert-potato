"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { searchMeals } from '@/lib/meal-search-api';
import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';
import { MealResultsView } from '@/components/meal-results-view';

function SearchSummaryBanner({ request }: { request: MealSearchRequest }) {
  return (
    <header className="summary-bar summary-bar-compact">
      <div>
        <p className="summary-eyebrow">Din søgning</p>
        <h1 className="summary-address">{request.address}</h1>
        <p className="summary-subline">5 billigste måltider på tværs af kæder · afstand vises som gåafstand</p>
        <div className="summary-chip-row">
          <span className="badge badge-neutral">Kædebrede tilbud</span>
          <span className="badge badge-neutral">
            {request.includeStorePairs ? '1-2 kæder' : 'Kun 1 kæde'}
          </span>
        </div>
      </div>
      <Link className="secondary-button link-button" href="/search">
        Redigér søgning
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
            <h2>Finder måltider</h2>
          </div>
          <p className="page-copy">
            Finder de billigste mulige måltider på tværs af kædernes tilbud og tilføjer afstand til nærmeste butik…
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
            <h2>Søgning fejlede</h2>
          </div>
          <p className="page-copy">{error}</p>
          <div className="state-actions">
            <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
              Prøv igen
            </button>
            <Link className="secondary-button link-button" href="/search">
              Redigér søgning
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

