import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';

export function generateMockMealResponse(request: MealSearchRequest): MealSearchResponse {
  return {
    resolvedAddress: request.address || 'Tingvej 4A, 2300 København S',
    search: request,
    candidates: [
      {
        candidateId: 'mock-chicken',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Kyllingefilet',
        servingsPerBatch: 2,
        basketCostDkk: 20,
        recipeCostDkk: 20,
        pricePerMealDkk: 10,
        storesUsed: [{ storeId: 'rema-1000', chainId: 'rema-1000', storeName: 'REMA 1000', distanceMeters: 112 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 112,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'chicken-fillet', ingredientFamilyName: 'Kyllingefilet', requiredQuantity: { value: 300, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'chicken-fillet', ingredientFamilyName: 'Kyllingefilet',
            productName: 'Hakket dansk grisekød eller kyllingekød', storeId: 'rema-1000', storeName: 'REMA 1000',
            packageQuantity: 400, packageUnit: 'g', packageBaseAmount: 400,
            requiredAmountForRecipe: 300, requiredAmountUnit: 'g',
            packagePriceDkk: 20, apportionedCostDkk: 15, leftoverAmount: 100, leftoverUnit: 'g',
          },
        ],
        pantryItems: [],
      },
      {
        candidateId: 'mock-pork',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Hakket svinekød',
        servingsPerBatch: 2,
        basketCostDkk: 20,
        recipeCostDkk: 20,
        pricePerMealDkk: 10,
        storesUsed: [{ storeId: 'rema-1000', chainId: 'rema-1000', storeName: 'REMA 1000', distanceMeters: 112 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 112,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'minced-pork', ingredientFamilyName: 'Hakket svinekød', requiredQuantity: { value: 300, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'minced-pork', ingredientFamilyName: 'Hakket svinekød',
            productName: 'Hakket dansk grisekød eller kyllingekød', storeId: 'rema-1000', storeName: 'REMA 1000',
            packageQuantity: 400, packageUnit: 'g', packageBaseAmount: 400,
            requiredAmountForRecipe: 300, requiredAmountUnit: 'g',
            packagePriceDkk: 20, apportionedCostDkk: 15, leftoverAmount: 100, leftoverUnit: 'g',
          },
        ],
        pantryItems: [],
      },
      {
        candidateId: 'mock-beef',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Hakket oksekød',
        servingsPerBatch: 2,
        basketCostDkk: 29,
        recipeCostDkk: 29,
        pricePerMealDkk: 14.5,
        storesUsed: [{ storeId: 'lidl', chainId: 'lidl', storeName: 'Lidl', distanceMeters: 210 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 210,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'minced-beef', ingredientFamilyName: 'Hakket oksekød', requiredQuantity: { value: 300, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'minced-beef', ingredientFamilyName: 'Hakket oksekød',
            productName: 'MADVÆRKET Hakket oksekød', storeId: 'lidl', storeName: 'Lidl',
            packageQuantity: 400, packageUnit: 'g', packageBaseAmount: 400,
            requiredAmountForRecipe: 300, requiredAmountUnit: 'g',
            packagePriceDkk: 29, apportionedCostDkk: 21.75, leftoverAmount: 100, leftoverUnit: 'g',
          },
        ],
        pantryItems: [],
      },
      {
        candidateId: 'mock-veal-pork',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Hakket kalv/flæsk',
        servingsPerBatch: 3,
        basketCostDkk: 49,
        recipeCostDkk: 49,
        pricePerMealDkk: 16.3,
        storesUsed: [{ storeId: 'foetex', chainId: 'foetex', storeName: 'føtex', distanceMeters: 417 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 417,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'minced-veal-pork', ingredientFamilyName: 'Hakket kalv/flæsk', requiredQuantity: { value: 450, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'minced-veal-pork', ingredientFamilyName: 'Hakket kalv/flæsk',
            productName: 'Hakket grise-/kalvekød', storeId: 'foetex', storeName: 'føtex',
            packageQuantity: 800, packageUnit: 'g', packageBaseAmount: 800,
            requiredAmountForRecipe: 450, requiredAmountUnit: 'g',
            packagePriceDkk: 49, apportionedCostDkk: 27.56, leftoverAmount: 350, leftoverUnit: 'g',
          },
        ],
        pantryItems: [],
      },
    ],
    summary: {
      generatedAt: new Date().toISOString(),
      totalCandidates: 4,
      totalStoresInScope: 6,
      totalStorePairsConsidered: 0,
    },
  };
}
