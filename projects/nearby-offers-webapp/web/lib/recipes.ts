export interface IngredientLine {
  name: string;
  quantity: string;
  note?: string;
}

export interface Nutrition {
  kj: number;
  fat: number;
  carbs: number;
  protein: number;
  fiber: number;
}

export interface Recipe {
  meatFamily: string;
  title: string;
  subtitle: string;
  time: string;
  servings: number;
  nutrition: Nutrition;
  ingredients: IngredientLine[];
  steps: string[];
}

export const RECIPES: Recipe[] = [
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce',
    time: '20 min',
    servings: 2,
    nutrition: { kj: 2680, fat: 10, carbs: 84, protein: 52, fiber: 3 },
    ingredients: [
      { name: 'Kyllingekød', quantity: '300g', note: 'tilbud' },
      { name: 'Pasta', quantity: '200g', note: 'penne eller fusilli' },
      { name: 'Broccoli', quantity: '200g', note: 'i små buketter' },
      { name: 'Fløde', quantity: '1 dl' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'hakket' },
      { name: 'Salt og peber', quantity: 'efter smag' },
      { name: 'Olie', quantity: '1 spsk' },
    ],
    steps: [
      'Kog pasta efter anvisning. Tilføj broccoli de sidste 3 min.',
      'Steg kyllingekødet i olie på høj varme. Krydr med salt og peber.',
      'Skru ned, tilføj hvidløg og steg 30 sek.',
      'Tilføj fløde, lad simre 2 min.',
      'Bland pasta og broccoli i saucen. Server.',
    ],
  },
  {
    meatFamily: 'minced-pork',
    title: 'Asiatisk wok med ris',
    subtitle: 'Spidskål, soja og honning',
    time: '15 min',
    servings: 2,
    nutrition: { kj: 2630, fat: 16, carbs: 86, protein: 34, fiber: 2 },
    ingredients: [
      { name: 'Hakket svinekød', quantity: '300g', note: 'tilbud' },
      { name: 'Ris', quantity: '200g' },
      { name: 'Spidskål', quantity: '200g', note: 'i strimler' },
      { name: 'Soja', quantity: '2 spsk' },
      { name: 'Honning', quantity: '1 spsk' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'hakket' },
      { name: 'Ingefær', quantity: '1 tsk', note: 'revet eller pulver' },
      { name: 'Olie', quantity: '1 spsk' },
    ],
    steps: [
      'Kog ris efter anvisning.',
      'Steg svinekødet i olie på høj varme, bræk det i stykker.',
      'Tilføj hvidløg og ingefær, steg 30 sek.',
      'Tilføj spidskål, steg 2 min — den skal stadig have bid.',
      'Tilføj soja og honning, vend rundt. Server med ris.',
    ],
  },
  {
    meatFamily: 'minced-beef',
    title: 'Kødsauce med pasta',
    subtitle: 'Løg, hvidløg og flåede tomater',
    time: '20 min',
    servings: 2,
    nutrition: { kj: 2970, fat: 22, carbs: 83, protein: 44, fiber: 3 },
    ingredients: [
      { name: 'Hakket oksekød', quantity: '300g', note: 'tilbud' },
      { name: 'Pasta', quantity: '200g', note: 'spaghetti eller penne' },
      { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
      { name: 'Løg', quantity: '1 stk', note: 'hakket' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'hakket' },
      { name: 'Oregano', quantity: '1 tsk' },
      { name: 'Salt og peber', quantity: 'efter smag' },
      { name: 'Olie', quantity: '1 spsk' },
    ],
    steps: [
      'Kog pasta efter anvisning.',
      'Steg løg i olie til de er bløde. Tilføj oksekødet og bræk det i stykker.',
      'Tilføj hvidløg, steg 30 sek.',
      'Tilføj flåede tomater, oregano, salt og peber.',
      'Lad simre 10 min. Server over pasta.',
    ],
  },
  {
    meatFamily: 'minced-veal-pork',
    title: 'Tortilla wraps med krydret kød',
    subtitle: 'Spidskål, tomat, agurk og dressing',
    time: '15 min',
    servings: 2,
    nutrition: { kj: 2310, fat: 22, carbs: 56, protein: 32, fiber: 2 },
    ingredients: [
      { name: 'Hakket kalv/flæsk', quantity: '300g', note: 'tilbud' },
      { name: 'Tortilla wraps', quantity: '4 stk' },
      { name: 'Spidskål', quantity: '150g', note: 'fintskåret' },
      { name: 'Tomat', quantity: '1 stk', note: 'i tern' },
      { name: 'Agurk', quantity: '½ stk', note: 'i skiver' },
      { name: 'Dressing', quantity: '2 spsk', note: 'yoghurt, mayo eller salsa' },
      { name: 'Spidskommen', quantity: '1 tsk' },
      { name: 'Paprika', quantity: '1 tsk' },
      { name: 'Salt og peber', quantity: 'efter smag' },
      { name: 'Olie', quantity: '1 spsk' },
    ],
    steps: [
      'Steg kødet i olie, bræk det i stykker.',
      'Krydr med spidskommen, paprika, salt og peber.',
      'Varm tortillas på en tør pande 30 sek. per side.',
      'Fyld wraps med kød, spidskål, tomat, agurk og dressing.',
      'Rul sammen og server.',
    ],
  },
];

export function getRecipeForMeat(meatFamilyId: string): Recipe | undefined {
  return RECIPES.find((r) => r.meatFamily === meatFamilyId);
}
