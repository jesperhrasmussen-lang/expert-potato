import type {
  BasketLine,
  IngredientQuantity,
  QuantityUnit,
  RecipeTemplate,
} from '@/types/meal-optimizer-types';

export interface IngredientConversionRule {
  ingredientFamilyId: string;
  baseUnit: 'g' | 'ml';
  gramsPerMl?: number;
}

export interface SelectedOffer {
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  productName: string;
  storeId: string;
  storeName: string;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  packagePriceDkk: number;
}

export interface SelectedRecipeIngredient {
  slotKey: string;
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  quantity: IngredientQuantity;
  offer: SelectedOffer;
}

export interface MealPricingResult {
  basketCostDkk: number;
  recipeCostDkk: number;
  pricePerMealDkk: number;
  basketLines: BasketLine[];
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function toBaseAmount(quantity: IngredientQuantity, rule: IngredientConversionRule): number {
  assertPositive(quantity.value, 'quantity.value');

  if (rule.baseUnit === 'g') {
    if (quantity.unit === 'g') return quantity.value;
    if (quantity.unit === 'kg') return quantity.value * 1000;
    if (quantity.unit === 'ml') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value * rule.gramsPerMl;
    }
    if (quantity.unit === 'dl') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value * 100 * rule.gramsPerMl;
    }
  }

  if (rule.baseUnit === 'ml') {
    if (quantity.unit === 'ml') return quantity.value;
    if (quantity.unit === 'dl') return quantity.value * 100;
    if (quantity.unit === 'g') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value / rule.gramsPerMl;
    }
    if (quantity.unit === 'kg') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return (quantity.value * 1000) / rule.gramsPerMl;
    }
  }

  throw new Error(
    `Unsupported unit conversion for ${rule.ingredientFamilyId}: ${quantity.unit} -> ${rule.baseUnit}`,
  );
}

function quantityFromPackage(quantity: number, unit: QuantityUnit): IngredientQuantity {
  return {
    value: quantity,
    unit,
  };
}

function buildConversionLookup(rules: IngredientConversionRule[]): Map<string, IngredientConversionRule> {
  return new Map(rules.map((rule) => [rule.ingredientFamilyId, rule]));
}

export function computeMealPricing(params: {
  recipeTemplate: RecipeTemplate;
  selectedIngredients: SelectedRecipeIngredient[];
  conversionRules: IngredientConversionRule[];
}): MealPricingResult {
  const { recipeTemplate, selectedIngredients, conversionRules } = params;

  assertPositive(recipeTemplate.servingsPerBatch, 'recipeTemplate.servingsPerBatch');

  const lookup = buildConversionLookup(conversionRules);
  const basketLines: BasketLine[] = [];

  let basketCostDkk = 0;
  let recipeCostDkk = 0;

  for (const ingredient of selectedIngredients) {
    const rule = lookup.get(ingredient.ingredientFamilyId);
    if (!rule) {
      throw new Error(`Missing conversion rule for ${ingredient.ingredientFamilyId}`);
    }

    const packageBaseAmount = toBaseAmount(
      quantityFromPackage(ingredient.offer.packageQuantity, ingredient.offer.packageUnit),
      rule,
    );
    const requiredBaseAmount = toBaseAmount(ingredient.quantity, rule);

    if (requiredBaseAmount > packageBaseAmount) {
      throw new Error(
        `Selected package for ${ingredient.ingredientFamilyId} is too small for required recipe amount`,
      );
    }

    const apportionedCostDkk = (ingredient.offer.packagePriceDkk * requiredBaseAmount) / packageBaseAmount;
    const leftoverAmount = packageBaseAmount - requiredBaseAmount;

    basketCostDkk += ingredient.offer.packagePriceDkk;
    recipeCostDkk += apportionedCostDkk;

    basketLines.push({
      ingredientFamilyId: ingredient.ingredientFamilyId,
      ingredientFamilyName: ingredient.ingredientFamilyName,
      productName: ingredient.offer.productName,
      storeId: ingredient.offer.storeId,
      storeName: ingredient.offer.storeName,
      packageQuantity: ingredient.offer.packageQuantity,
      packageUnit: ingredient.offer.packageUnit,
      packageBaseAmount,
      requiredAmountForRecipe: requiredBaseAmount,
      requiredAmountUnit: rule.baseUnit,
      packagePriceDkk: roundCurrency(ingredient.offer.packagePriceDkk),
      apportionedCostDkk: roundCurrency(apportionedCostDkk),
      leftoverAmount,
      leftoverUnit: rule.baseUnit,
    });
  }

  const roundedRecipeCost = roundCurrency(recipeCostDkk);

  return {
    basketCostDkk: roundCurrency(basketCostDkk),
    recipeCostDkk: roundedRecipeCost,
    pricePerMealDkk: roundCurrency(roundedRecipeCost / recipeTemplate.servingsPerBatch),
    basketLines,
  };
}

