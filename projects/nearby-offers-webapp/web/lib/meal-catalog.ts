import fs from 'node:fs';
import path from 'node:path';

import type {
  IngredientFamily,
  RecipeTemplate,
} from '@/types/meal-optimizer-types';
import type { IngredientConversionRule } from '@/lib/meal-pricing';

interface CatalogIngredientFamily extends IngredientFamily {}

interface CatalogRule extends IngredientConversionRule {
  assumptionStatus?: string;
}

interface CatalogPayload {
  ingredientFamilies: CatalogIngredientFamily[];
  unitConversionRules: CatalogRule[];
  recipes: RecipeTemplate[];
}

export interface MealCatalog {
  ingredientFamilies: CatalogIngredientFamily[];
  ingredientFamilyById: Map<string, CatalogIngredientFamily>;
  conversionRules: CatalogRule[];
  recipeTemplates: RecipeTemplate[];
}

export function mealCatalogPath() {
  return path.resolve(process.cwd(), '..', 'config', 'meal-optimizer-v1-catalog.template.json');
}

export function loadMealCatalog(): MealCatalog {
  const payload = JSON.parse(fs.readFileSync(mealCatalogPath(), 'utf-8')) as CatalogPayload;

  return {
    ingredientFamilies: payload.ingredientFamilies,
    ingredientFamilyById: new Map(payload.ingredientFamilies.map((family) => [family.id, family])),
    conversionRules: payload.unitConversionRules,
    recipeTemplates: payload.recipes,
  };
}

