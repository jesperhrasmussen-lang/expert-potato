"use client";

import Link from 'next/link';
import { useState } from 'react';

import type { MeatDeal, MealCandidate, MealSearchResponse, PortionSize } from '@/types/meal-optimizer-types';
import { getRecipesForMeat } from '@/lib/recipes';
import type { Recipe } from '@/lib/recipes';

type SizeKey = 'small' | 'large';

function formatDistance(meters: number) {
  return `${meters} meter`;
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

    const recipes = getRecipesForMeat(meatLine.ingredientFamilyId);
    const servings = recipes[0]?.servings || c.servingsPerBatch || 2;
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

type CardState = 'collapsed' | 'choosing' | 'viewing';

function DealCard({ deal, rank, organicOnly, sizeKey }: { deal: ExtendedDeal; rank: number; organicOnly?: boolean; sizeKey: SizeKey }) {
  const [state, setState] = useState<CardState>('collapsed');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const recipes = getRecipesForMeat(deal.meatFamilyId);

  function onSummaryClick() {
    setState(state === 'collapsed' ? 'choosing' : 'collapsed');
  }

  function onRecipeSelect(idx: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIdx(idx);
    setState('viewing');
  }

  function onCloseRecipe(e: React.MouseEvent) {
    e.stopPropagation();
    setState('choosing');
  }

  return (
    <article className="meal-card-compact">
      <div
        className="meal-card-summary"
        onClick={onSummaryClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSummaryClick(); }}
      >
        <span className="meal-card-rank">{rank}</span>
        <div className="meal-card-lines">
          <p className="meal-card-line2">
            {organicOnly ? `Økologisk ${deal.meatFamilyName.toLowerCase()}` : deal.meatFamilyName} · {deal.priceDkk}kr
          </p>
          <p className="meal-card-line1">
            {deal.storeName} · {formatDistance(deal.distanceMeters)} · ~{deal.pricePerMeal}kr/måltid · {deal.servings} måltider
          </p>
        </div>
      </div>

      {state === 'choosing' && recipes.length > 0 && (
        <div className="meal-card-detail">
          <span className="meal-card-pantry-label">Vælg opskrift</span>
          <div className="recipe-chooser">
            {recipes.map((r, i) => (
              <button
                key={i}
                type="button"
                className="recipe-option"
                onClick={(e) => onRecipeSelect(i, e)}
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {state === 'viewing' && recipes[selectedIdx] && (
        <>
          <button
            type="button"
            className="secondary-button recipe-back-btn"
            onClick={onCloseRecipe}
          >
            ← Vælg opskrift
          </button>
          <RecipeDetail recipe={recipes[selectedIdx]} sizeKey={sizeKey} />
        </>
      )}
    </article>
  );
}

function RecipeDetail({ recipe, sizeKey }: { recipe: Recipe; sizeKey: SizeKey }) {
  const variant = recipe.portions[sizeKey];
  const n = variant.nutrition;

  return (
    <div className="meal-card-detail">
      <div className="recipe-header">
        <h3 className="recipe-title">{recipe.title}</h3>
        <p className="recipe-subtitle">{recipe.subtitle} · {recipe.time}</p>
      </div>

      <div className="nutrition-bar">
        <span className="nutrition-label">Pr. portion:</span>
        <span>{n.kj} kJ</span>
        <span>{n.fat}g fedt</span>
        <span>{n.carbs}g kulhydrat</span>
        <span>{n.protein}g protein</span>
        <span>{n.fiber}g fiber</span>
      </div>

      <div className="recipe-section">
        <span className="meal-card-pantry-label">Ingredienser</span>
        <ul className="recipe-list">
          {variant.ingredients.map((item, i) => (
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

export function MealResultsView({ data, organicOnly, portionSize }: { data: MealSearchResponse; organicOnly?: boolean; portionSize?: PortionSize }) {
  const deals = extractBestDeals(data.candidates);
  const sizeKey: SizeKey = portionSize === 'large' ? 'large' : 'small';

  return (
    <div className="results-layout">
      {deals.length > 0 ? (
        <section className="panel">
          <div className="section-head section-head-right">
            <Link className="link-button section-back-link" href="/">Ny søgning</Link>
          </div>
          <div className="stack-list">
            {deals.map((deal, i) => (
              <DealCard key={deal.meatFamilyId} deal={deal} rank={i + 1} organicOnly={organicOnly} sizeKey={sizeKey} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
