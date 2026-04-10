import { NextResponse } from 'next/server';

import { executeMealSearch } from '@/lib/meal-search-service';
import type { MealSearchRequest, PortionSize } from '@/types/meal-optimizer-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VALID_PORTION_SIZES: PortionSize[] = ['2000', '2500', '3000', '3500', '4000'];

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
      body.portionSize = '2000';
    }
    validateMealSearchRequest(body);

    try {
      const response = await executeMealSearch(body);
      return NextResponse.json(response, { status: 200 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isTimeout = msg.includes('timeout') || msg.includes('abort');
      return NextResponse.json(
        { error: isTimeout
            ? 'Søgningen tog for lang tid. Prøv igen — andet forsøg er hurtigere.'
            : 'Servicen er midlertidigt nede. Prøv igen om lidt.'
        },
        { status: 503 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Meal search failed',
      },
      { status: 422 },
    );
  }
}
