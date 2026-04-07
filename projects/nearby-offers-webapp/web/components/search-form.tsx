"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { AccessMode, SearchRequest } from '@/types/search-types';

const suggestedQueries = ['hakket oksekød', 'kyllingebrystfilet', 'skyr'];
const activeModes: AccessMode[] = ['radius', 'walk'];

export function SearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('Tingvej 4A, 2300 København S');
  const [accessMode, setAccessMode] = useState<AccessMode>('walk');
  const [radiusKm, setRadiusKm] = useState('3');
  const [maxWalkKm, setMaxWalkKm] = useState('1');
  const [maxTransitMin, setMaxTransitMin] = useState('15');
  const [queryInput, setQueryInput] = useState('');
  const [queries, setQueries] = useState<string[]>(['hakket oksekød', 'kyllingebrystfilet']);

  const thresholdLabel = useMemo(() => {
    if (accessMode === 'radius') return 'Radius (km)';
    if (accessMode === 'walk') return 'Max gåafstand (km)';
    return 'Max transittid (min)';
  }, [accessMode]);

  const thresholdValue = useMemo(() => {
    if (accessMode === 'radius') return radiusKm;
    if (accessMode === 'walk') return maxWalkKm;
    return maxTransitMin;
  }, [accessMode, radiusKm, maxWalkKm, maxTransitMin]);

  const canSubmit = address.trim().length > 0 && queries.length > 0 && thresholdValue.trim().length > 0;

  function addQuery(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    if (queries.some((query) => query.toLowerCase() === normalized.toLowerCase())) return;
    setQueries((current) => [...current, normalized]);
    setQueryInput('');
  }

  function removeQuery(value: string) {
    setQueries((current) => current.filter((query) => query !== value));
  }

  function buildRequest(): SearchRequest {
    return {
      address,
      accessMode,
      radiusKm: accessMode === 'radius' ? Number(radiusKm) : null,
      maxWalkKm: accessMode === 'walk' ? Number(maxWalkKm) : null,
      maxTransitMin: accessMode === 'transit' ? Number(maxTransitMin) : null,
      queries,
    };
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const request = buildRequest();
    const params = new URLSearchParams({
      address: request.address,
      accessMode: request.accessMode,
      queries: request.queries.join('|'),
    });

    if (request.radiusKm !== null) params.set('radiusKm', String(request.radiusKm));
    if (request.maxWalkKm !== null) params.set('maxWalkKm', String(request.maxWalkKm));
    if (request.maxTransitMin !== null) params.set('maxTransitMin', String(request.maxTransitMin));

    router.push(`/results?${params.toString()}`);
  }

  return (
    <form className="search-card" onSubmit={onSubmit}>
      <div className="field-group">
        <label className="field-label" htmlFor="address">Adresse</label>
        <input
          id="address"
          className="text-input"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Indtast adresse"
        />
      </div>

      <div className="field-group">
        <span className="field-label">Adgangsfilter</span>
        <div className="segmented-control segmented-control-two">
          {activeModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`segment ${mode === accessMode ? 'segment-active' : ''}`}
              onClick={() => setAccessMode(mode)}
            >
              {mode === 'radius' ? 'Radius' : 'Gåafstand'}
            </button>
          ))}
          <button type="button" className="segment segment-disabled" disabled aria-disabled="true">
            Transit · snart
          </button>
        </div>
        <p className="input-help">
          {accessMode === 'radius'
            ? 'Søg inden for en simpel radius omkring adressen.'
            : 'Brug gåafstand for mere praktiske resultater.'}
        </p>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="threshold">{thresholdLabel}</label>
        <input
          id="threshold"
          className="text-input"
          inputMode="decimal"
          value={thresholdValue}
          onChange={(event) => {
            const value = event.target.value;
            if (accessMode === 'radius') setRadiusKm(value);
            else if (accessMode === 'walk') setMaxWalkKm(value);
            else setMaxTransitMin(value);
          }}
        />
        <p className="input-help">Aktiv søgemåde: {accessMode === 'radius' ? 'radius' : 'gåafstand'}</p>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="queries">Produktforespørgsler</label>
        <div className="query-entry-row">
          <input
            id="queries"
            className="text-input"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addQuery(queryInput);
              }
            }}
            placeholder="Tilføj produkt"
          />
          <button type="button" className="secondary-button" onClick={() => addQuery(queryInput)}>
            + Tilføj
          </button>
        </div>
        <p className="input-help">Tilføj flere varer med Enter eller + Tilføj.</p>
        <div className="chip-section">
          <p className="chip-section-label">Dine produkter ({queries.length})</p>
          <div className="chip-row" aria-live="polite">
            {queries.length > 0 ? (
              queries.map((query) => (
                <button key={query} type="button" className="chip" onClick={() => removeQuery(query)}>
                  {query} ×
                </button>
              ))
            ) : (
              <span className="input-help">Ingen produkter endnu.</span>
            )}
          </div>
        </div>
        <div className="chip-section chip-section-muted">
          <p className="chip-section-label">Hurtige forslag</p>
          <div className="chip-row chip-row-muted">
            {suggestedQueries.map((query) => (
            <button
              key={query}
              type="button"
              className="chip chip-suggested"
              onClick={() => addQuery(query)}
              aria-label={`Tilføj ${query}`}
            >
              + {query}
            </button>
          ))}
          </div>
        </div>
      </div>

      <button className="primary-button" type="submit" disabled={!canSubmit}>
        Find tilbud i nærheden
      </button>
    </form>
  );
}

