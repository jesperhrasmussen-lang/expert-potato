"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ResultsView } from '@/components/results-view';
import { searchOffers } from '@/lib/search-api';
import type { AccessMode, SearchRequest, SearchResponse } from '@/types/search-types';

function modeLabel(value: AccessMode) {
  if (value === 'walk') return 'gåafstand';
  if (value === 'radius') return 'radius';
  if (value === 'transit') return 'transit';
  return value;
}

function thresholdText(request: SearchRequest) {
  if (request.accessMode === 'transit') {
    return request.maxTransitMin !== null ? `${request.maxTransitMin} min` : 'ukendt';
  }

  const km = request.accessMode === 'radius' ? request.radiusKm : request.maxWalkKm;
  return km !== null ? `${km} km` : 'ukendt';
}

function SearchSummaryBanner({ request }: { request: SearchRequest }) {
  return (
    <header className="summary-bar summary-bar-compact">
      <div>
        <p className="summary-eyebrow">Din søgning</p>
        <h1 className="summary-address">{request.address}</h1>
        <p className="summary-subline">
          {modeLabel(request.accessMode)} · {thresholdText(request)}
        </p>
        <div className="summary-chip-row">
          <span className="badge badge-neutral">{modeLabel(request.accessMode)}</span>
          {request.queries.map((query) => (
            <span key={query} className="badge badge-neutral">
              {query}
            </span>
          ))}
        </div>
      </div>
      <Link className="secondary-button link-button" href="/search">
        Redigér søgning
      </Link>
    </header>
  );
}

export function ResultsPageClient({ initialRequest }: { initialRequest: SearchRequest }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) {
        setSlowLoading(true);
      }
    }, 2500);

    async function load() {
      setLoading(true);
      setError(null);
      setSlowLoading(false);

      try {
        const response = await searchOffers(initialRequest);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ukendt fejl');
        }
      } finally {
        window.clearTimeout(slowTimer);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [initialRequest, attempt]);

  const summary = <SearchSummaryBanner request={initialRequest} />;

  if (loading) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="true">
          <div className="section-head">
            <h2>Henter resultater</h2>
          </div>
          <p className="page-copy">Finder butikker i nærheden, matcher tilbud og rangerer resultater…</p>
          {slowLoading ? (
            <div className="empty-box">
              Dette er en live-søgning mod eksterne kilder og kan tage nogle sekunder.
            </div>
          ) : null}
          <div className="state-actions">
            <Link className="secondary-button link-button" href="/search">
              Tilbage til søgning
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="false">
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
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="false">
          <div className="section-head">
            <h2>Ingen data</h2>
          </div>
          <p className="page-copy">API’et returnerede ikke et brugbart resultat.</p>
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

  return <ResultsView data={data} />;
}

