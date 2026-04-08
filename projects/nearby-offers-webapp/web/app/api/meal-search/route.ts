import { NextResponse } from 'next/server';

import { hasLocalOfferDb } from '@/lib/db-search';
import { generateMockMealResponse } from '@/lib/mock-meal-data';
import type { MealSearchRequest, PortionSize } from '@/types/meal-optimizer-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PORTION_SIZES: PortionSize[] = ['small', 'medium', 'large'];

function validateMealSearchRequest(request: MealSearchRequest) {
  if (!request.address.trim()) {
    throw new Error('address is required');
  }
  if (request.portionSize && !VALID_PORTION_SIZES.includes(request.portionSize)) {
    throw new Error(`portionSize must be one of: ${VALID_PORTION_SIZES.join(', ')}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MealSearchRequest;
    if (!body.portionSize) {
      body.portionSize = 'medium';
    }
    validateMealSearchRequest(body);

    if (hasLocalOfferDb()) {
      const { executeMealSearch } = await import('@/lib/meal-search-service');
      const response = await executeMealSearch(body);
      return NextResponse.json(response, { status: 200 });
    }

    // No local DB (e.g. Vercel) — return mock data
    const response = generateMockMealResponse(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Meal search failed',
      },
      { status: 422 },
    );
  }
}
