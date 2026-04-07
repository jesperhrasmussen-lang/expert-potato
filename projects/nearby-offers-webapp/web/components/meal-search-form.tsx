"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MealSearchRequest } from '@/types/meal-optimizer-types';

export function MealSearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('Tingvej 4A, 2300 København S');
  const [includeStorePairs, setIncludeStorePairs] = useState(true);

  const canSubmit = address.trim().length > 0;

  function buildRequest(): MealSearchRequest {
    return {
      address,
      accessMode: 'walk',
      radiusKm: null,
      maxWalkKm: null,
      maxTransitMin: null,
      includeStorePairs,
    };
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const request = buildRequest();
    const params = new URLSearchParams({
      address: request.address,
      includeStorePairs: request.includeStorePairs ? '1' : '0',
    });

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
        <p className="input-help">Senere kan dette udvides med “min lokation”.</p>
      </div>

      <div className="field-group">
        <span className="field-label">Resultatregel</span>
        <div className="empty-box">
          Appen rangerer nu de 5 billigste mulige måltider på tværs af kædernes tilbud. Afstand vises kun som information.
        </div>
      </div>

      <div className="field-group">
        <span className="field-label">Butikskombinationer</span>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeStorePairs}
            onChange={(event) => setIncludeStorePairs(event.target.checked)}
          />
          <span>Inkludér måltider, der kræver to kæder tæt på hinanden</span>
        </label>
      </div>

      <button className="primary-button" type="submit" disabled={!canSubmit}>
        Find 5 billigste måltider
      </button>
    </form>
  );
}

