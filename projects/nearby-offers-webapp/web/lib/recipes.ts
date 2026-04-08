export interface Recipe {
  meatFamily: string;
  title: string;
  subtitle: string;
  time: string;
  ingredients: string[];
  steps: string[];
}

export const RECIPES: Recipe[] = [
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce',
    time: '20 min',
    ingredients: [
      'Kyllingekød (tilbud)',
      'Pasta (penne eller fusilli)',
      'Broccoli — skær i små buketter',
      'Fløde eller creme fraiche',
      'Hvidløg — 2 fed, hakket',
      'Salt og peber',
      'Lidt olie til stegning',
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
    ingredients: [
      'Hakket svinekød (tilbud)',
      'Ris',
      'Spidskål — skåret i strimler',
      'Soja — 2-3 spsk.',
      'Honning — 1 spsk.',
      'Hvidløg — 2 fed, hakket',
      'Ingefær — 1 tsk. revet (eller pulver)',
      'Olie til stegning',
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
    ingredients: [
      'Hakket oksekød (tilbud)',
      'Pasta (spaghetti eller penne)',
      'Flåede tomater — 1 dåse',
      'Løg — 1 stk., hakket',
      'Hvidløg — 2 fed, hakket',
      'Oregano eller italienske krydderier',
      'Salt og peber',
      'Olie til stegning',
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
    ingredients: [
      'Hakket kalv/flæsk (tilbud)',
      'Tortilla wraps — 4 stk.',
      'Spidskål — fintskåret',
      'Tomat — 1-2 stk., i tern',
      'Agurk — halv, i skiver',
      'Dressing (yoghurt, mayo eller salsa)',
      'Spidskommen og paprika',
      'Salt og peber',
      'Olie til stegning',
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
