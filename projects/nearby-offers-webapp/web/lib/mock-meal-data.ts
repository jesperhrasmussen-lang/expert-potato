import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';

export function generateMockMealResponse(request: MealSearchRequest): MealSearchResponse {
  return {
    resolvedAddress: request.address || 'Tingvej 4A, 2300 København S',
    search: request,
    candidates: [
      {
        candidateId: 'mock-1',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Hakket oksekød & Broccoli',
        servingsPerBatch: 2,
        basketCostDkk: 49,
        recipeCostDkk: 39,
        pricePerMealDkk: 19.5,
        storesUsed: [{ storeId: 'netto', chainId: 'netto', storeName: 'Netto', distanceMeters: 650 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 650,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'minced-beef', ingredientFamilyName: 'Hakket oksekød', requiredQuantity: { value: 300, unit: 'g' } },
          { slotKey: 'vegetable', ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli', requiredQuantity: { value: 500, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'minced-beef', ingredientFamilyName: 'Hakket oksekød',
            productName: 'Hakket oksekød 14-18%', storeId: 'netto', storeName: 'Netto',
            packageQuantity: 400, packageUnit: 'g', packageBaseAmount: 400,
            requiredAmountForRecipe: 300, requiredAmountUnit: 'g',
            packagePriceDkk: 39, apportionedCostDkk: 29.25, leftoverAmount: 100, leftoverUnit: 'g',
          },
          {
            ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli',
            productName: 'Broccoli', storeId: 'superbrugsen', storeName: 'SuperBrugsen',
            packageQuantity: 500, packageUnit: 'g', packageBaseAmount: 500,
            requiredAmountForRecipe: 500, requiredAmountUnit: 'g',
            packagePriceDkk: 10, apportionedCostDkk: 10, leftoverAmount: 0, leftoverUnit: 'g',
          },
        ],
        pantryItems: [{ displayName: 'Sauce (fløde-, tomat- eller asiatisk)' }, { displayName: 'Ris eller pasta' }],
      },
      {
        candidateId: 'mock-2',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Kyllingefilet & Broccoli',
        servingsPerBatch: 2,
        basketCostDkk: 30,
        recipeCostDkk: 25,
        pricePerMealDkk: 12.5,
        storesUsed: [{ storeId: 'rema-1000', chainId: 'rema-1000', storeName: 'REMA 1000', distanceMeters: 700 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 700,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'chicken-fillet', ingredientFamilyName: 'Kyllingefilet', requiredQuantity: { value: 300, unit: 'g' } },
          { slotKey: 'vegetable', ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli', requiredQuantity: { value: 500, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'chicken-fillet', ingredientFamilyName: 'Kyllingefilet',
            productName: 'Hakket dansk grisekød eller kyllingekød', storeId: 'rema-1000', storeName: 'REMA 1000',
            packageQuantity: 400, packageUnit: 'g', packageBaseAmount: 400,
            requiredAmountForRecipe: 300, requiredAmountUnit: 'g',
            packagePriceDkk: 20, apportionedCostDkk: 15, leftoverAmount: 100, leftoverUnit: 'g',
          },
          {
            ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli',
            productName: 'Broccoli', storeId: 'superbrugsen', storeName: 'SuperBrugsen',
            packageQuantity: 500, packageUnit: 'g', packageBaseAmount: 500,
            requiredAmountForRecipe: 500, requiredAmountUnit: 'g',
            packagePriceDkk: 10, apportionedCostDkk: 10, leftoverAmount: 0, leftoverUnit: 'g',
          },
        ],
        pantryItems: [{ displayName: 'Sauce (fløde-, tomat- eller asiatisk)' }, { displayName: 'Ris eller pasta' }],
      },
      {
        candidateId: 'mock-3',
        recipeTemplateId: 'generic-meal',
        recipeName: 'Hakket svinekød & Broccoli',
        servingsPerBatch: 3,
        basketCostDkk: 59,
        recipeCostDkk: 42,
        pricePerMealDkk: 14,
        storesUsed: [{ storeId: 'foetex', chainId: 'foetex', storeName: 'føtex', distanceMeters: 1200 }],
        interStoreDistanceMeters: null,
        walkingDistanceMeters: 1200,
        chosenIngredients: [
          { slotKey: 'meat', ingredientFamilyId: 'minced-pork', ingredientFamilyName: 'Hakket svinekød', requiredQuantity: { value: 450, unit: 'g' } },
          { slotKey: 'vegetable', ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli', requiredQuantity: { value: 500, unit: 'g' } },
        ],
        basketLines: [
          {
            ingredientFamilyId: 'minced-pork', ingredientFamilyName: 'Hakket svinekød',
            productName: 'Hakket grisekød eller grise-/kalvekød', storeId: 'foetex', storeName: 'føtex',
            packageQuantity: 800, packageUnit: 'g', packageBaseAmount: 800,
            requiredAmountForRecipe: 450, requiredAmountUnit: 'g',
            packagePriceDkk: 49, apportionedCostDkk: 27.56, leftoverAmount: 350, leftoverUnit: 'g',
          },
          {
            ingredientFamilyId: 'broccoli', ingredientFamilyName: 'Broccoli',
            productName: 'Broccoli', storeId: 'superbrugsen', storeName: 'SuperBrugsen',
            packageQuantity: 500, packageUnit: 'g', packageBaseAmount: 500,
            requiredAmountForRecipe: 500, requiredAmountUnit: 'g',
            packagePriceDkk: 10, apportionedCostDkk: 10, leftoverAmount: 0, leftoverUnit: 'g',
          },
        ],
        pantryItems: [{ displayName: 'Sauce (fløde-, tomat- eller asiatisk)' }, { displayName: 'Ris eller pasta' }],
      },
    ],
    summary: {
      generatedAt: new Date().toISOString(),
      totalCandidates: 3,
      totalStoresInScope: 4,
      totalStorePairsConsidered: 0,
    },
  };
}
