export type AccessMode = 'radius' | 'walk' | 'transit';

export type IngredientCategory = 'meat' | 'vegetable' | 'dairy';
export type SlotRole = 'protein' | 'vegetable' | 'dairy' | 'other';
export type QuantityUnit = 'g' | 'kg' | 'ml' | 'dl' | 'piece';
export type PortionSize = 'small' | 'medium' | 'large';
export type SauceType = 'cream' | 'asian' | 'tomato';

export interface PantryItem {
  displayName: string;
  note?: string;
}

export interface SauceDefinition {
  displayName: string;
  pantryIngredients: string[];
}

export interface PortionProfile {
  meat: { value: number; unit: QuantityUnit };
  vegetable: { value: number; unit: QuantityUnit };
  starch: { value: number; unit: QuantityUnit };
}

export interface MealSearchRequest {
  address: string;
  accessMode: AccessMode;
  radiusKm: number | null;
  maxWalkKm: number | null;
  maxTransitMin: number | null;
  includeStorePairs: boolean;
  portionSize: PortionSize;
}

export interface IngredientFamily {
  id: string;
  category: IngredientCategory;
  displayName: string;
  searchTerms: string[];
  referencePricePerKg?: number;
  referencePackageG?: number;
}

export interface IngredientQuantity {
  value: number;
  unit: QuantityUnit;
}

export interface AllowedIngredientFamily {
  ingredientFamilyId: string;
  quantityOverride?: IngredientQuantity;
}

export interface RecipeSlot {
  slotKey: string;
  role: SlotRole;
  quantity?: IngredientQuantity;
  allowedFamilies: AllowedIngredientFamily[];
}

export interface RecipeTemplate {
  id: string;
  slug: string;
  displayName: string;
  quantityBasis: 'perMeal' | 'perBatch';
  servingsPerBatch: number;
  slots: RecipeSlot[];
  sauceType?: SauceType;
  pantryItems?: PantryItem[];
}

export interface StoreOption {
  storeId: string;
  chainId: string;
  storeName: string;
  distanceMeters: number;
}

export interface StorePairOption {
  storeA: StoreOption;
  storeB: StoreOption;
  interStoreDistanceMeters: number;
}

export interface BasketLine {
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  productName: string;
  storeId: string;
  storeName: string;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  packageBaseAmount: number;
  requiredAmountForRecipe: number;
  requiredAmountUnit: QuantityUnit;
  packagePriceDkk: number;
  apportionedCostDkk: number;
  leftoverAmount: number;
  leftoverUnit: QuantityUnit;
  estimated?: boolean;
}

export interface MealCandidate {
  candidateId: string;
  recipeTemplateId: string;
  recipeName: string;
  servingsPerBatch: number;
  basketCostDkk: number;
  recipeCostDkk: number;
  pricePerMealDkk: number;
  storesUsed: StoreOption[];
  interStoreDistanceMeters: number | null;
  walkingDistanceMeters: number;
  chosenIngredients: {
    slotKey: string;
    ingredientFamilyId: string;
    ingredientFamilyName: string;
    requiredQuantity: IngredientQuantity;
  }[];
  basketLines: BasketLine[];
  sauceType?: SauceType;
  pantryItems?: PantryItem[];
  hasEstimatedPrice?: boolean;
}

export interface MealSearchSummary {
  generatedAt: string;
  totalCandidates: number;
  totalStoresInScope: number;
  totalStorePairsConsidered: number;
}

export interface MealSearchResponse {
  resolvedAddress: string;
  search: MealSearchRequest;
  candidates: MealCandidate[];
  summary: MealSearchSummary;
}

