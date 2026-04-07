import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';

export async function searchMeals(request: MealSearchRequest): Promise<MealSearchResponse> {
  const response = await fetch('/api/meal-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Meal search failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // keep generic message
    }

    throw new Error(message);
  }

  return (await response.json()) as MealSearchResponse;
}

