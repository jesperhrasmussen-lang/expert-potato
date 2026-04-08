import fs from 'node:fs';
import path from 'node:path';

import type {
  IngredientFamily,
  PantryItem,
  PortionProfile,
  PortionSize,
  RecipeTemplate,
  SauceDefinition,
  SauceType,
} from '@/types/meal-optimizer-types';
import type { IngredientConversionRule } from '@/lib/meal-pricing';

interface CatalogIngredientFamily extends IngredientFamily {}

interface CatalogRule extends IngredientConversionRule {
  assumptionStatus?: string;
}

interface CatalogV2Payload {
  ingredientFamilies: CatalogIngredientFamily[];
  unitConversionRules: CatalogRule[];
  recipes: (RecipeTemplate & { sauceType?: SauceType; pantryItems?: PantryItem[] })[];
  sauceDefinitions: Record<SauceType, SauceDefinition>;
  portionProfiles: Record<PortionSize, PortionProfile>;
}

export interface MealCatalog {
  ingredientFamilies: CatalogIngredientFamily[];
  ingredientFamilyById: Map<string, CatalogIngredientFamily>;
  conversionRules: CatalogRule[];
  recipeTemplates: RecipeTemplate[];
  sauceDefinitions: Record<SauceType, SauceDefinition>;
  portionProfiles: Record<PortionSize, PortionProfile>;
}

export function mealCatalogPath() {
  return path.resolve(process.cwd(), '..', 'config', 'meal-optimizer-v2-catalog.json');
}

export function loadMealCatalog(): MealCatalog {
  const payload = JSON.parse(fs.readFileSync(mealCatalogPath(), 'utf-8')) as CatalogV2Payload;

  return {
    ingredientFamilies: payload.ingredientFamilies,
    ingredientFamilyById: new Map(payload.ingredientFamilies.map((family) => [family.id, family])),
    conversionRules: payload.unitConversionRules,
    recipeTemplates: payload.recipes,
    sauceDefinitions: payload.sauceDefinitions,
    portionProfiles: payload.portionProfiles,
  };
}
