"use client";

import Link from 'next/link';
import { useState } from 'react';

import type { MeatDeal, MealCandidate, MealSearchResponse } from '@/types/meal-optimizer-types';
import { getRecipeForMeat } from '@/lib/recipes';
import type { Recipe } from '@/lib/recipes';

function formatDistance(meters: number) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

interface ExtendedDeal extends MeatDeal {
  servings: number;
  pricePerMeal: number;
}

function extractBestDeals(candidates: MealCandidate[]): ExtendedDeal[] {
  const bestByMeat = new Map<string, ExtendedDeal>();

  for (const c of candidates) {
    const meatLine = c.basketLines.find((l) =>
      ['minced-beef', 'minced-pork', 'minced-veal-pork', 'chicken-fillet'].includes(l.ingredientFamilyId),
    );
    if (!meatLine) continue;

    const recipe = getRecipeForMeat(meatLine.ingredientFamilyId);
    const servings = recipe?.servings || c.servingsPerBatch || 2;
    const pricePerMeal = Math.round(meatLine.packagePriceDkk / servings);

    const deal: ExtendedDeal = {
      meatFamilyId: meatLine.ingredientFamilyId,
      meatFamilyName: meatLine.ingredientFamilyName,
      productName: meatLine.productName,
      priceDkk: meatLine.packagePriceDkk,
      packageGrams: meatLine.packageQuantity,
      chainId: c.storesUsed[0]?.chainId || '',
      storeName: c.storesUsed[0]?.storeName || '',
      distanceMeters: c.storesUsed[0]?.distanceMeters || 0,
      servings,
      pricePerMeal,
    };

    const existing = bestByMeat.get(deal.meatFamilyId);
    if (!existing || deal.priceDkk < existing.priceDkk) {
      bestByMeat.set(deal.meatFamilyId, deal);
    }
  }

  return [...bestByMeat.values()].sort((a, b) => a.priceDkk - b.priceDkk);
}

function DealCard({ deal, rank }: { deal: ExtendedDeal; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const recipe = getRecipeForMeat(deal.meatFamilyId);

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
          <p className="meal-card-line2">
            {deal.meatFamilyName} · {deal.priceDkk}kr
          </p>
          <p className="meal-card-line1">
            {deal.storeName} · {formatDistance(deal.distanceMeters)} · {deal.servings} mltd · ~{deal.pricePerMeal}kr/mltd
          </p>
        </div>
      </div>

      {expanded && recipe && (
        <>
          <RecipeDetail recipe={recipe} />
          <button
            type="button"
            className="secondary-button recipe-back-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          >
            Luk opskrift
          </button>
        </>
      )}
    </article>
  );
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const n = recipe.nutrition;

  return (
    <div className="meal-card-detail">
      <div className="recipe-header">
        <h3 className="recipe-title">{recipe.title}</h3>
        <p className="recipe-subtitle">{recipe.subtitle} · {recipe.time}</p>
      </div>

      <div className="nutrition-bar">
        <span>{n.kj} kJ</span>
        <span>{n.fat}g fedt</span>
        <span>{n.carbs}g kulhydrat</span>
        <span>{n.protein}g protein</span>
        <span>{n.fiber}g fiber</span>
      </div>

      <div className="recipe-section">
        <span className="meal-card-pantry-label">Ingredienser</span>
        <ul className="recipe-list">
          {recipe.ingredients.map((item, i) => (
            <li key={i}>
              <strong>{item.quantity}</strong> {item.name}{item.note ? ` (${item.note})` : ''}
            </li>
          ))}
        </ul>
      </div>

      {recipe.preparation && recipe.preparation.length > 0 && (
        <div className="recipe-section">
          <span className="meal-card-pantry-label">Forberedelse</span>
          <ol className="recipe-list recipe-steps">
            {recipe.preparation.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="recipe-section">
        <span className="meal-card-pantry-label">Fremgangsmåde</span>
        <ol className="recipe-list recipe-steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>
              {step.heading && <strong>{step.heading}: </strong>}
              {step.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-box empty-state-large">
      <p><strong>Få tilbud denne uge</strong></p>
      <p>Der er for få tilbud til at vise resultater lige nu. Prøv igen mandag, når nye tilbudsaviser udkommer.</p>
    </div>
  );
}

export function MealResultsView({ data }: { data: MealSearchResponse }) {
  const deals = extractBestDeals(data.candidates);

  return (
    <div className="results-layout">
      {deals.length > 0 ? (
        <section className="panel">
          <div className="section-head">
            <h3 className="section-title-sm">Kødtilbud nær dig · <span className="muted-inline">tryk for opskrift</span></h3>
            <Link className="link-button section-back-link" href="/">Ny søgning</Link>
          </div>
          <p className="section-note">Køb kød på tilbud + selvvalgte grøntsager (~25kr) + sauce fra skabet</p>
          <div className="stack-list">
            {deals.map((deal, i) => (
              <DealCard key={deal.meatFamilyId} deal={deal} rank={i + 1} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
