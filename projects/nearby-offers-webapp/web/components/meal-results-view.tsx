"use client";

import Link from 'next/link';

import type { BasketLine, MealCandidate, MealSearchResponse } from '@/types/meal-optimizer-types';

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return 'Ukendt afstand';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatPrice(price: number) {
  return `${price.toFixed(0)} kr`;
}

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderStores(candidate: MealCandidate) {
  return candidate.storesUsed.map((store) => store.storeName).join(' + ');
}

function EmptySection({ text }: { text: string }) {
  return <div className="empty-box">{text}</div>;
}

function BasketLineRow({ line }: { line: BasketLine }) {
  return (
    <div className="detail-note">
      <strong>{line.ingredientFamilyName}:</strong> {line.productName} · {formatPrice(line.packagePriceDkk)} · bruger{' '}
      {line.requiredAmountForRecipe} {line.requiredAmountUnit} · rest {Math.round(line.leftoverAmount)} {line.leftoverUnit}
    </div>
  );
}

function MealCard({ candidate }: { candidate: MealCandidate }) {
  return (
    <article className="offer-card compact-offer-card">
      <div className="offer-card-top">
        <div>
          <p className="offer-chain">{renderStores(candidate)}</p>
          <h3 className="offer-title">{candidate.recipeName}</h3>
        </div>
        <div className="offer-price-block">
          <div className="offer-price">{formatPrice(candidate.pricePerMealDkk)}</div>
          <div className="offer-unit-price">pr. måltid</div>
        </div>
      </div>

      <div className="offer-meta-row compact-meta-row">
        <span>Kurv: {formatPrice(candidate.basketCostDkk)}</span>
        <span>Opskrift: {formatPrice(candidate.recipeCostDkk)}</span>
        <span>{formatDistance(candidate.walkingDistanceMeters)}</span>
      </div>

      <div className="badge-row">
        {candidate.chosenIngredients.map((ingredient) => (
          <span key={ingredient.slotKey} className="badge badge-neutral">
            {ingredient.ingredientFamilyName}
          </span>
        ))}
        {candidate.interStoreDistanceMeters !== null ? (
          <span className="badge badge-direct">2 butikker · {formatDistance(candidate.interStoreDistanceMeters)}</span>
        ) : (
          <span className="badge badge-direct">1 butik</span>
        )}
      </div>

      <div className="stack-list">
        {candidate.basketLines.map((line) => (
          <BasketLineRow key={`${candidate.candidateId}-${line.ingredientFamilyId}-${line.storeId}`} line={line} />
        ))}
      </div>
    </article>
  );
}

export function MealResultsView({ data }: { data: MealSearchResponse }) {
  return (
    <div className="results-layout">
      <header className="summary-bar">
        <div>
          <p className="summary-eyebrow">Billigste måltider</p>
          <h1 className="summary-address">{data.resolvedAddress}</h1>
          <p className="summary-subline">
            {data.summary.totalCandidates} billigste måltider · {data.summary.totalStoresInScope} kæder med afstandsdata ·{' '}
            {data.search.includeStorePairs ? 'to-kæde-kombinationer tilladt' : 'kun enkeltkæder'}
          </p>
        </div>
        <Link className="secondary-button link-button" href="/search">
          Redigér søgning
        </Link>
      </header>

      <section className="panel transparency-panel">
        <div className="section-head">
          <h2>Resultatkvalitet</h2>
        </div>
        <div className="transparency-grid">
          <div>
            <p className="transparency-label">Senest opdateret</p>
            <p>{formatGeneratedAt(data.summary.generatedAt)}</p>
          </div>
          <div>
            <p className="transparency-label">Kæder med afstandsdata</p>
            <p>{data.summary.totalStoresInScope}</p>
          </div>
          <div>
            <p className="transparency-label">Butikspar vurderet</p>
            <p>{data.summary.totalStorePairsConsidered}</p>
          </div>
          <div>
            <p className="transparency-label">Kildeprincip</p>
            <p>DB-først med direkte kædekilder og fallback-enrichment</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Måltidskandidater</h2>
          <span>{data.candidates.length} fund</span>
        </div>
        <div className="stack-list">
          {data.candidates.length ? (
            data.candidates.map((candidate) => <MealCard key={candidate.candidateId} candidate={candidate} />)
          ) : (
            <EmptySection text="Ingen måltider kunne sammensættes fra de aktuelle tilbud i søgeområdet." />
          )}
        </div>
      </section>
    </div>
  );
}

