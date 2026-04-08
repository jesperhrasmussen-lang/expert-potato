"use client";

import Link from 'next/link';
import { useState } from 'react';

import type { BasketLine, MealCandidate, MealSearchResponse } from '@/types/meal-optimizer-types';

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return '?';
  if (distanceMeters < 1000) return `${distanceMeters}m`;
  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

function formatPrice(price: number) {
  return `${price.toFixed(0)}kr`;
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

function renderStoreDistance(candidate: MealCandidate) {
  const nearest = candidate.storesUsed[0];
  return nearest ? formatDistance(nearest.distanceMeters) : '';
}

function BasketLineRow({ line, showStore }: { line: BasketLine; showStore: boolean }) {
  return (
    <div className={`detail-note${line.estimated ? ' detail-note-estimated' : ''}`}>
      <strong>{line.ingredientFamilyName}{showStore ? ` (${line.storeName})` : ''}:</strong> {line.productName} · {line.estimated ? '~' : ''}{formatPrice(line.packagePriceDkk)} · bruger{' '}
      {line.requiredAmountForRecipe}{line.requiredAmountUnit} · rest {Math.round(line.leftoverAmount)}{line.leftoverUnit}
    </div>
  );
}

function MealCard({ candidate, rank }: { candidate: MealCandidate; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className="meal-card-compact"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
    >
      <div className="meal-card-summary">
        <span className="meal-card-rank">{rank}</span>
        <div className="meal-card-lines">
          <p className="meal-card-line1">
            {renderStores(candidate)} · {renderStoreDistance(candidate)}
            {candidate.hasEstimatedPrice && <span className="badge badge-warn meal-card-est-badge">est. pris</span>}
          </p>
          <p className="meal-card-line2">
            {candidate.recipeName} · {candidate.hasEstimatedPrice ? '~' : ''}{formatPrice(candidate.pricePerMealDkk)}/m · {formatPrice(candidate.basketCostDkk)} · {candidate.servingsPerBatch}m
          </p>
        </div>
      </div>

      {expanded && (
        <div className="meal-card-detail">
          {candidate.pantryItems && candidate.pantryItems.length > 0 && (
            <div className="meal-card-pantry">
              <span className="meal-card-pantry-label">Derhjemme:</span>
              {candidate.pantryItems.map((item) => (
                <span key={item.displayName} className="badge badge-neutral">
                  {item.displayName}{item.note ? ` (${item.note})` : ''}
                </span>
              ))}
            </div>
          )}
          <div className="stack-list">
            {candidate.basketLines.map((line) => (
              <BasketLineRow key={`${candidate.candidateId}-${line.ingredientFamilyId}-${line.storeId}`} line={line} showStore={candidate.storesUsed.length > 1} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty-box empty-state-large">
      <p><strong>Fa tilbud denne uge</strong></p>
      <p>Der er for fa tilbud til at sammensaette maltider lige nu. Prov igen mandag, nar nye tilbudsaviser udkommer.</p>
    </div>
  );
}

export function MealResultsView({ data }: { data: MealSearchResponse }) {
  const hasEnoughResults = data.candidates.length >= 3;

  return (
    <div className="results-layout">
      <header className="summary-bar">
        <div>
          <p className="summary-eyebrow">Billigste maltider</p>
          <h1 className="summary-address">{data.resolvedAddress}</h1>
          <p className="summary-subline">
            {data.summary.totalCandidates} maltider fundet · {data.summary.totalStoresInScope} kaeder ·{' '}
            {data.search.includeStorePairs ? 'to-kaede-kombinationer tilladt' : 'kun enkelkaeder'}
          </p>
        </div>
        <Link className="secondary-button link-button" href="/">
          Rediger sogning
        </Link>
      </header>

      <section className="panel">
        <div className="section-head">
          <h2>Maltidskandidater</h2>
          <span>{data.candidates.length} fund</span>
        </div>

        {hasEnoughResults ? (
          <div className="stack-list">
            {data.candidates.map((candidate, index) => (
              <MealCard key={candidate.candidateId} candidate={candidate} rank={index + 1} />
            ))}
          </div>
        ) : data.candidates.length > 0 ? (
          <>
            <div className="stack-list">
              {data.candidates.map((candidate, index) => (
                <MealCard key={candidate.candidateId} candidate={candidate} rank={index + 1} />
              ))}
            </div>
            <EmptyState />
          </>
        ) : (
          <EmptyState />
        )}
      </section>

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
            <p className="transparency-label">Kaeder med afstandsdata</p>
            <p>{data.summary.totalStoresInScope}</p>
          </div>
          <div>
            <p className="transparency-label">Butikspar vurderet</p>
            <p>{data.summary.totalStorePairsConsidered}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
