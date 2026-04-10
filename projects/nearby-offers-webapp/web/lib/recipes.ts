// Recipes use a kJ-based scaling model.
// Each ingredient has a base amount at 2000 kJ per portion.
// Linear scaling: amount(kj) = baseAmount × (kj / 2000)
// Recipes serve 2 people. Ingredient amounts are for the whole batch (2 portions).

export type Kj = 2000 | 2500 | 3000 | 3500 | 4000;
export const KJ_LEVELS: Kj[] = [2000, 2500, 3000, 3500, 4000];

export interface IngredientLine {
  name: string;
  quantity: string;
  note?: string;
}

export interface Nutrition {
  kj: string;
  fat: string;
  carbs: string;
  protein: string;
  fiber: string;
}

export interface RecipeStep {
  heading?: string;
  text: string;
}

export interface PortionVariant {
  nutrition: Nutrition;
  ingredients: IngredientLine[];
}

// Base ingredient defined at 2000 kJ. Scales linearly with kJ if scales=true.
export interface BaseIngredient {
  name: string;
  amount?: number;
  unit?: 'g' | 'dl' | 'spsk' | 'tsk' | 'fed' | 'stk' | 'dåse';
  quantityText?: string; // overrides amount/unit if set (e.g. "efter smag")
  scales: boolean;
  isMeat?: boolean;
  note?: string;
}

// Base nutrition at 2000 kJ. Scales linearly with kJ.
export interface BaseNutrition {
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
  baseIngredients: BaseIngredient[];
  baseNutrition: BaseNutrition;
  preparation?: string[];
  steps: RecipeStep[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatGrams(amount: number): string {
  return `${Math.round(amount / 5) * 5}g`;
}

function formatDl(amount: number): string {
  // Round to nearest quarter dl
  const r = Math.round(amount * 4) / 4;
  const map: Record<string, string> = {
    '0.25': '¼ dl', '0.5': '½ dl', '0.75': '¾ dl',
    '1': '1 dl', '1.25': '1¼ dl', '1.5': '1½ dl', '1.75': '1¾ dl',
    '2': '2 dl', '2.25': '2¼ dl', '2.5': '2½ dl',
  };
  return map[r.toString()] || `${r.toString().replace('.', ',')} dl`;
}

function formatSpsk(amount: number): string {
  // Round to half spsk
  const r = Math.round(amount * 2) / 2;
  if (r === 0.5) return '½ spsk';
  if (r === 1) return '1 spsk';
  if (r === 1.5) return '1½ spsk';
  if (r === 2) return '2 spsk';
  if (r === 2.5) return '2½ spsk';
  if (r === 3) return '3 spsk';
  if (r === 3.5) return '3½ spsk';
  if (r === 4) return '4 spsk';
  if (r === 4.5) return '4½ spsk';
  if (r === 5) return '5 spsk';
  return `${r} spsk`;
}

function formatTsk(amount: number): string {
  const r = Math.round(amount * 2) / 2;
  if (r === 0.5) return '½ tsk';
  if (r === 1) return '1 tsk';
  if (r === 1.5) return '1½ tsk';
  if (r === 2) return '2 tsk';
  if (r === 2.5) return '2½ tsk';
  if (r === 3) return '3 tsk';
  return `${r} tsk`;
}

function formatStk(amount: number): string {
  const r = Math.round(amount * 2) / 2;
  if (r === 0.5) return '½ stk';
  if (r === 1) return '1 stk';
  if (r === 1.5) return '1½ stk';
  if (r === 2) return '2 stk';
  if (r === 2.5) return '2½ stk';
  if (r === 3) return '3 stk';
  if (r === 3.5) return '3½ stk';
  if (r === 4) return '4 stk';
  if (r === 5) return '5 stk';
  return `${Math.round(r)} stk`;
}

function formatFed(amount: number): string {
  const r = Math.round(amount);
  return `${r} fed`;
}

function formatQuantity(amount: number, unit: BaseIngredient['unit']): string {
  switch (unit) {
    case 'g': return formatGrams(amount);
    case 'dl': return formatDl(amount);
    case 'spsk': return formatSpsk(amount);
    case 'tsk': return formatTsk(amount);
    case 'stk': return formatStk(amount);
    case 'fed': return formatFed(amount);
    case 'dåse': return `${Math.round(amount)} dåse`;
    default: return String(amount);
  }
}

export function getPortionForKj(recipe: Recipe, kj: Kj): PortionVariant {
  const factor = kj / 2000;
  const ingredients: IngredientLine[] = recipe.baseIngredients.map((ing) => {
    let quantity: string;
    if (ing.quantityText) {
      quantity = ing.quantityText;
    } else if (ing.amount !== undefined && ing.unit) {
      const scaledAmount = ing.scales ? ing.amount * factor : ing.amount;
      quantity = formatQuantity(scaledAmount, ing.unit);
    } else {
      quantity = '';
    }
    return { name: ing.name, quantity, note: ing.note };
  });

  const n = recipe.baseNutrition;
  return {
    nutrition: {
      kj: String(kj),
      fat: String(Math.round(n.fat * factor)),
      carbs: String(Math.round(n.carbs * factor)),
      protein: String(Math.round(n.protein * factor)),
      fiber: String(Math.round(n.fiber * factor)),
    },
    ingredients,
  };
}

// Returns meat grams for the whole recipe batch (2 servings) at given kJ
export function getMeatGramsAtKj(recipe: Recipe, kj: Kj): number {
  const meat = recipe.baseIngredients.find((i) => i.isMeat);
  if (!meat || meat.amount === undefined) return 250;
  return Math.round(meat.amount * (kj / 2000));
}

// Average meat grams per portion across all 4 meat families at a given kJ.
// Base values at 2000 kJ per batch (2 portions):
//   chicken 200, pork 250, beef 200, veal/pork 250 → avg 225 per batch = 112.5 per portion
export function getAverageMeatGramsAtKj(kj: Kj): number {
  const factor = kj / 2000;
  return Math.round((112.5 * factor) / 5) * 5;
}

// ─────────────────────────────────────────────────────────────
// Recipes
// ─────────────────────────────────────────────────────────────

export const RECIPES: Recipe[] = [
  // ═══ CHICKEN-FILLET ═══
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce · 2 personer',
    time: '20 min',
    servings: 2,
    baseNutrition: { fat: 13, carbs: 48, protein: 35, fiber: 7 },
    baseIngredients: [
      { name: 'Kyllingebryst eller inderfilet', amount: 200, unit: 'g', scales: true, isMeat: true, note: 'tilbud' },
      { name: 'Pasta', amount: 100, unit: 'g', scales: true, note: 'penne eller fusilli' },
      { name: 'Broccoli', amount: 350, unit: 'g', scales: true, note: 'i små buketter' },
      { name: 'Fløde', amount: 0.75, unit: 'dl', scales: true },
      { name: 'Hvidløg', amount: 2, unit: 'fed', scales: true, note: 'fintrevet eller finthakket' },
      { name: 'Citronsaft', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Sæt en gryde vand over, og kog pastaen efter pakkens anvisning. Når der er 2 minutter tilbage af kogetiden, tilsætter du broccoli i samme gryde som pastaen.' },
      { text: 'Gem 1 dl pastavand, før du hælder vandet fra.' },
      { text: 'Imens skærer du kyllingen i mundrette stykker. Varm en stor pande op på middel varme, tilsæt olivenolien, og kom kyllingen på panden. Krydr med lidt salt og peber.' },
      { text: 'Lad kyllingen stege ca. 1 minut uden at røre for meget. Vend den derefter rundt og steg videre 3–5 minutter, til den er gennemstegt og let gylden nogle steder.' },
      { text: 'Lad kyllingen blive på panden. Tilsæt hvidløget og rør rundt i 20–30 sekunder. Hvidløget skal dufte, men må ikke blive brunt.' },
      { text: 'Tilsæt fløden og 2–4 spsk pastavand. Lad det småsimre 1–2 minutter, til saucen bliver let cremet. Hvis den virker for tyk, tilsæt lidt mere pastavand.' },
      { text: 'Lad kylling og sauce blive på panden. Tilsæt den kogte pasta og broccoli til panden, og vend det hele sammen i 30–60 sekunder.' },
      { text: 'Tag panden ned på lav varme eller sluk. Tilsæt citronsaften, og smag til med mere salt og peber.' },
      { text: 'Server med det samme.' },
    ],
  },

  {
    meatFamily: 'chicken-fillet',
    title: 'Kylling med feta, tomat og pasta',
    subtitle: 'Cherrytomater, spinat og smeltet feta · 2 personer',
    time: '20 min',
    servings: 2,
    baseNutrition: { fat: 15, carbs: 44, protein: 36, fiber: 5 },
    baseIngredients: [
      { name: 'Kyllingebryst eller inderfilet', amount: 200, unit: 'g', scales: true, isMeat: true, note: 'tilbud' },
      { name: 'Pasta', amount: 100, unit: 'g', scales: true, note: 'penne eller fusilli' },
      { name: 'Cherrytomater', amount: 300, unit: 'g', scales: true, note: 'halveret' },
      { name: 'Feta', amount: 60, unit: 'g', scales: true, note: 'smuldret' },
      { name: 'Frisk spinat', amount: 100, unit: 'g', scales: true },
      { name: 'Hvidløg', amount: 2, unit: 'fed', scales: true, note: 'finthakket' },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Kog pastaen efter pakkens anvisning. Gem 1 dl pastavand, før du hælder vandet fra.' },
      { text: 'Skær kyllingen i mundrette stykker. Varm en stor pande op på middel varme med olivenolien. Steg kyllingen 5–6 minutter med lidt salt og peber, til den er gennemstegt og gylden.' },
      { text: 'Tilsæt hvidløget og rør rundt i 20–30 sekunder.' },
      { text: 'Tilsæt cherrytomaterne. Lad dem stege 2–3 minutter, til de begynder at blive bløde og afgive saft.' },
      { text: 'Tilsæt spinaten og vend rundt, til den er faldet sammen — ca. 1 minut.' },
      { text: 'Kom den kogte pasta i panden sammen med 2–3 spsk pastavand. Vend det hele sammen.' },
      { text: 'Fordel den smuldrede feta over retten. Lad den varme 30 sekunder uden at røre, så den lige begynder at smelte.' },
      { text: 'Smag til med salt og peber. Server med det samme.' },
    ],
  },

  // ═══ MINCED-PORK ═══
  {
    meatFamily: 'minced-pork',
    title: 'Asiatisk svinekød med spidskål og ris',
    subtitle: 'Soja, honning og ingefær · 2 personer',
    time: '20 min',
    servings: 2,
    baseNutrition: { fat: 17, carbs: 52, protein: 30, fiber: 3 },
    baseIngredients: [
      { name: 'Hakket svinekød', amount: 250, unit: 'g', scales: true, isMeat: true, note: 'tilbud' },
      { name: 'Jasminris', amount: 90, unit: 'g', scales: true },
      { name: 'Spidskål', amount: 300, unit: 'g', scales: true, note: 'fintsnittet' },
      { name: 'Sojasauce', amount: 2, unit: 'spsk', scales: true },
      { name: 'Honning', amount: 2, unit: 'tsk', scales: true },
      { name: 'Hvidløg', amount: 2, unit: 'fed', scales: true, note: 'fintrevet eller finthakket' },
      { name: 'Friskrevet ingefær', amount: 2, unit: 'tsk', scales: true },
      { name: 'Riseddike eller saft af ½ lime', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 2, unit: 'tsk', scales: false },
    ],
    preparation: [
      'Snit spidskålen fint.',
      'Riv eller hak hvidløg og ingefær fint.',
      'Bland soja, honning, hvidløg og ingefær i en lille skål.',
      'Hvis du bruger riseddike, så bland den i skålen nu.',
      'Hvis du bruger lime, så vent med limesaften til allersidst.',
    ],
    steps: [
      { heading: 'Kog risene', text: 'Kog risene efter pakkens anvisning. Når de er færdige, så lad dem stå med låg i 5 minutter.' },
      { heading: 'Varm panden roligt op', text: 'Sæt en stor pande på middel varme. Lad den blive varm i ca. 30–60 sekunder. Panden skal være varm, men ikke brændende hed.' },
      { heading: 'Tilsæt olien kort før kødet', text: 'Hæld extra virgin olivenolie på panden. Så snart olien ser blank og mere flydende ud, tilsætter du kødet. Vent ikke, til olien ryger.' },
      { heading: 'Steg kødet ved moderat varme', text: 'Kom kødet på panden og fordel det i et lag. Lad det ligge i ca. 1 minut uden at røre for meget. Bryd det derefter op og steg videre 3–5 minutter, til det ikke længere er rosa, og noget af det har fået let brun farve.' },
      { heading: 'Tilsæt spidskålen til kødet', text: 'Lad kødet blive på panden. Kom spidskålen i panden sammen med kødet. Vend rundt i 2–3 minutter, til kålen er faldet lidt sammen, men stadig har lidt bid.' },
      { heading: 'Tilsæt saucen kort', text: 'Hæld sauceblandingen over kød og kål i panden. Vend rundt i 30–45 sekunder. Saucen skal kun lige fordeles og varmes igennem.' },
      { heading: 'Tilsæt lime til sidst (hvis du bruger lime)', text: 'Sluk eller sænk varmen først og tilsæt limesaften nu. Vend hurtigt rundt. Det bevarer friskheden bedre.' },
      { heading: 'Server', text: 'Løsn risene med en gaffel og server dem sammen med kødet og kålen.' },
    ],
  },

  {
    meatFamily: 'minced-pork',
    title: 'Svinekød med feta, spinat og ris',
    subtitle: 'Hvidløg, citron og smuldret feta · 2 personer',
    time: '20 min',
    servings: 2,
    baseNutrition: { fat: 18, carbs: 46, protein: 30, fiber: 3 },
    baseIngredients: [
      { name: 'Hakket svinekød', amount: 250, unit: 'g', scales: true, isMeat: true },
      { name: 'Jasminris', amount: 90, unit: 'g', scales: true },
      { name: 'Frisk spinat', amount: 200, unit: 'g', scales: true },
      { name: 'Feta', amount: 60, unit: 'g', scales: true, note: 'smuldret' },
      { name: 'Hvidløg', amount: 2, unit: 'fed', scales: true, note: 'fintrevet eller finthakket' },
      { name: 'Citronsaft', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 2, unit: 'tsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Kog risene efter pakkens anvisning. Når de er færdige, lader du dem stå med låg i 5 minutter, så de sætter sig lidt. Løsn dem derefter med en gaffel.' },
      { text: 'Imens varmer du en stor pande op på middel varme. Tilsæt olivenolien. Når olien ser blank ud, tilsætter du svinekødet. Lad det stege ca. 1 minut uden at røre for meget. Bryd det derefter i mindre stykker og steg videre 3–4 minutter, til det ikke længere er rosa og har fået lidt brun farve nogle steder.' },
      { text: 'Lad kødet blive på panden. Tilsæt hvidløget og rør rundt i 20–30 sekunder. Hvidløget skal dufte, men må ikke blive brunt.' },
      { text: 'Tilsæt spinaten lidt ad gangen, hvis den fylder meget. Vend rundt i 1–2 minutter, til den lige er faldet sammen.' },
      { text: 'Sluk eller sænk varmen helt. Tilsæt citronsaften, og smag til med salt og peber.' },
      { text: 'Fordel risene på tallerkenerne. Læg svinekød og spinat ovenpå, og smuldr fetaen over til sidst.' },
      { text: 'Server med det samme.' },
    ],
  },

  // ═══ MINCED-BEEF ═══
  {
    meatFamily: 'minced-beef',
    title: 'Kødsauce med pasta',
    subtitle: 'Løg, gulerødder og tomater · 2 personer',
    time: '25 min',
    servings: 2,
    baseNutrition: { fat: 19, carbs: 50, protein: 28, fiber: 6 },
    baseIngredients: [
      { name: 'Hakket oksekød', amount: 200, unit: 'g', scales: true, isMeat: true, note: 'tilbud' },
      { name: 'Pasta', amount: 80, unit: 'g', scales: true, note: 'fusilli, penne eller spaghetti' },
      { name: 'Flåede tomater', amount: 1, unit: 'dåse', scales: false, note: '400g' },
      { name: 'Gulerødder', amount: 150, unit: 'g', scales: true, note: 'i små tern' },
      { name: 'Løg', amount: 1, unit: 'stk', scales: false, note: 'finthakket' },
      { name: 'Hvidløg', amount: 2, unit: 'fed', scales: true, note: 'fintrevet eller finthakket' },
      { name: 'Oregano', amount: 1, unit: 'tsk', scales: false },
      { name: 'Koncentreret tomatpuré', amount: 1, unit: 'spsk', scales: false, note: 'valgfrit' },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Sæt en gryde vand over, og kog pastaen efter pakkens anvisning. Gem 1 dl pastavand, før du hælder vandet fra.' },
      { text: 'Imens varmer du en stor pande eller gryde op på middel varme. Tilsæt olivenolien, løg og gulerødder. Steg 5–7 minutter, til løgene er bløde og gulerødderne er begyndt at blive møre. Rør jævnligt.' },
      { text: 'Lad løg og gulerødder blive i panden. Tilsæt oksekødet. Bryd det i mindre stykker, og steg videre 4–5 minutter, til kødet ikke længere er rødt og har fået lidt brun farve nogle steder.' },
      { text: 'Tilsæt hvidløget, og rør rundt i 20–30 sekunder. Hvidløget skal dufte, men må ikke blive brunt.' },
      { text: 'Hvis du bruger tomatpuré, tilsætter du den nu og rører rundt i 20–30 sekunder.' },
      { text: 'Tilsæt de flåede tomater. Knus dem med skeen direkte i panden. Tilsæt oregano, lidt salt og peber.' },
      { text: 'Lad saucen småsimre uden låg i 10–12 minutter. Rør et par gange undervejs. Hvis den bliver for tyk, tilsæt lidt af det gemte pastavand.' },
      { text: 'Smag til med mere salt og peber. Saucen skal smage tydeligt af tomat og oksekød og ikke være vandet.' },
      { text: 'Server kødsaucen over pastaen. Du kan også vende pastaen direkte i saucen sammen med 2–4 spsk pastavand lige før servering.' },
    ],
  },

  {
    meatFamily: 'minced-beef',
    title: 'Krydret oksekød med feta og bulgur',
    subtitle: 'Spidskommen, tomat, agurk og smuldret feta · 2 personer',
    time: '20 min',
    servings: 2,
    baseNutrition: { fat: 19, carbs: 44, protein: 30, fiber: 5 },
    baseIngredients: [
      { name: 'Hakket oksekød', amount: 200, unit: 'g', scales: true, isMeat: true },
      { name: 'Bulgur', amount: 80, unit: 'g', scales: true },
      { name: 'Feta', amount: 60, unit: 'g', scales: true, note: 'smuldret' },
      { name: 'Tomat', amount: 2, unit: 'stk', scales: true, note: 'i små tern' },
      { name: 'Agurk', amount: 0.5, unit: 'stk', scales: true, note: 'i små tern' },
      { name: 'Spidskommen', amount: 1, unit: 'tsk', scales: false },
      { name: 'Paprika', amount: 1, unit: 'tsk', scales: false },
      { name: 'Citronsaft', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Kom bulguren i en skål eller gryde, og tilbered den efter pakkens anvisning. De fleste typer skal bare overhældes med kogende vand og stå tildækket i 10–12 minutter. Når den er færdig, løsner du den med en gaffel.' },
      { text: 'Imens varmer du en stor pande op på middel varme. Tilsæt olivenolien. Når olien ser blank ud, tilsætter du oksekødet. Lad det stege ca. 1 minut uden at røre for meget. Bryd det derefter i mindre stykker og steg videre 3–4 minutter, til det ikke længere er rødt og har fået lidt brun farve nogle steder.' },
      { text: 'Lad kødet blive på panden. Tilsæt spidskommen, paprika, lidt salt og peber. Vend rundt i 30 sekunder, til krydderierne dufter.' },
      { text: 'Imens skærer du tomat og agurk i små tern. Bland dem i en skål med citronsaften og en lille smule salt.' },
      { text: 'Fordel bulguren på tallerkenerne. Læg det krydrede oksekød ovenpå.' },
      { text: 'Top med tomat-agurk-blandingen og smuldr fetaen over.' },
      { text: 'Smag til med lidt ekstra peber og evt. mere citronsaft. Server med det samme.' },
    ],
  },

  // ═══ MINCED-VEAL-PORK ═══
  {
    meatFamily: 'minced-veal-pork',
    title: 'Tortilla wraps med krydret kød',
    subtitle: 'Spidskål, tomat, agurk og yoghurt-dressing · 2 personer',
    time: '15–20 min',
    servings: 2,
    baseNutrition: { fat: 24, carbs: 37, protein: 30, fiber: 5 },
    baseIngredients: [
      { name: 'Hakket kalv/flæsk', amount: 250, unit: 'g', scales: true, isMeat: true, note: 'tilbud' },
      { name: 'Tortilla wraps', amount: 2, unit: 'stk', scales: true },
      { name: 'Spidskål', amount: 200, unit: 'g', scales: true, note: 'fintsnittet' },
      { name: 'Tomat', amount: 1, unit: 'stk', scales: true, note: 'i små tern' },
      { name: 'Agurk', amount: 1, unit: 'stk', scales: false, note: 'i tynde skiver eller små tern' },
      { name: 'Yoghurt', amount: 2, unit: 'spsk', scales: true },
      { name: 'Spidskommen', amount: 1, unit: 'tsk', scales: false },
      { name: 'Paprika', amount: 1, unit: 'tsk', scales: false },
      { name: 'Citron- eller limesaft', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Snit spidskålen fint. Skær tomat og agurk ud. Bland yoghurt med citron- eller limesaft, lidt salt og lidt peber.' },
      { text: 'Varm en stor pande op på middel varme, tilsæt olivenolien, og kom kødet på panden. Lad det stege ca. 1 minut uden at røre for meget. Bryd det derefter i mindre stykker og steg videre 4–5 minutter, til det ikke længere er råt og har fået lidt brun farve nogle steder.' },
      { text: 'Lad kødet blive på panden. Tilsæt spidskommen, paprika, lidt salt og peber. Vend rundt i 30 sekunder.' },
      { text: 'Varm tortillaerne på en tør pande 20–30 sekunder per side, til de bliver bløde og nemme at folde.' },
      { text: 'Fordel lidt spidskål på hver tortilla. Kom derefter kød, tomat og agurk på. Top med lidt yoghurt-dressing.' },
      { text: 'Fold siderne lidt ind, og rul tortillaerne stramt sammen. Server med det samme.' },
    ],
  },

  {
    meatFamily: 'minced-veal-pork',
    title: 'Kødboller med feta og couscous',
    subtitle: 'Bagt feta i kødbollerne, tomat-agurk-salat · 2 personer',
    time: '25 min',
    servings: 2,
    baseNutrition: { fat: 22, carbs: 40, protein: 32, fiber: 4 },
    baseIngredients: [
      { name: 'Hakket kalv/flæsk', amount: 250, unit: 'g', scales: true, isMeat: true },
      { name: 'Couscous', amount: 80, unit: 'g', scales: true },
      { name: 'Feta', amount: 60, unit: 'g', scales: true, note: 'i små tern' },
      { name: 'Tomat', amount: 2, unit: 'stk', scales: true, note: 'i små tern' },
      { name: 'Agurk', amount: 0.5, unit: 'stk', scales: true, note: 'i små tern' },
      { name: 'Spidskommen', amount: 1, unit: 'tsk', scales: false },
      { name: 'Paprika', amount: 1, unit: 'tsk', scales: false },
      { name: 'Citronsaft', quantityText: '1–2 tsk', scales: false },
      { name: 'Extra virgin olivenolie', amount: 1, unit: 'spsk', scales: false },
      { name: 'Salt og peber', quantityText: 'efter smag', scales: false },
    ],
    steps: [
      { text: 'Kom couscous i en skål. Hæld samme mængde kogende vand over som mængden af couscous, dæk til, og lad den stå i 5 minutter. Løsn den derefter med en gaffel.' },
      { text: 'Kom kødet i en skål. Tilsæt spidskommen, paprika, lidt salt og peber, og bland det kort sammen.' },
      { text: 'Tilsæt fetaen, og fold den forsigtigt ind i kødet, så ternene ikke smadres helt.' },
      { text: 'Form kødet til 8 små kødboller eller små flade kødboller. Hvis du gør dem lidt flade, steger de mere jævnt.' },
      { text: 'Varm en stor pande op på middel varme. Tilsæt olivenolien. Når olien ser blank ud, lægger du kødbollerne på panden.' },
      { text: 'Steg kødbollerne 3–4 minutter på første side. Vend dem forsigtigt, og steg dem derefter 3–4 minutter på den anden side, til de er gyldne og gennemstegte.' },
      { text: 'Imens skærer du tomat og agurk i små tern. Bland dem med citronsaft og en lille smule salt.' },
      { text: 'Fordel couscous på tallerkenerne. Læg kødbollerne ovenpå eller ved siden af. Top med tomat-agurk-salaten.' },
      { text: 'Smag til med lidt ekstra peber og evt. mere citronsaft. Server med det samme.' },
    ],
  },
];

export function getRecipesForMeat(meatFamilyId: string): Recipe[] {
  return RECIPES.filter((r) => r.meatFamily === meatFamilyId);
}
