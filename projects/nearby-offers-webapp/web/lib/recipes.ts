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

export interface Recipe {
  meatFamily: string;
  title: string;
  subtitle: string;
  time: string;
  servings: number;
  nutrition: Nutrition;
  ingredients: IngredientLine[];
  preparation?: string[];
  steps: RecipeStep[];
}

export const RECIPES: Recipe[] = [
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce · 2 personer',
    time: '20 min',
    servings: 2,
    nutrition: { kj: '2580', fat: '16–22', carbs: '72', protein: '40–46', fiber: '5' },
    ingredients: [
      { name: 'Kyllingebryst eller inderfilet', quantity: '250g', note: 'tilbud' },
      { name: 'Pasta', quantity: '150g', note: 'penne eller fusilli' },
      { name: 'Broccoli', quantity: '400g', note: 'i små buketter' },
      { name: 'Fløde', quantity: '1 dl' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
      { name: 'Citronsaft', quantity: '1–2 tsk' },
      { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
      { name: 'Salt og peber', quantity: 'efter smag' },
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
    meatFamily: 'minced-pork',
    title: 'Asiatisk svinekød med spidskål og ris',
    subtitle: 'Soja, honning og ingefær · 2 personer',
    time: '20 min',
    servings: 2,
    nutrition: { kj: '2800', fat: '25', carbs: '72', protein: '38', fiber: '4' },
    ingredients: [
      { name: 'Hakket svinekød', quantity: '350g', note: 'tilbud' },
      { name: 'Jasminris', quantity: '150g' },
      { name: 'Spidskål', quantity: '400g', note: 'fintsnittet' },
      { name: 'Sojasauce', quantity: '2 spsk' },
      { name: 'Honning', quantity: '2 tsk' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
      { name: 'Friskrevet ingefær', quantity: '2 tsk' },
      { name: 'Riseddike eller saft af ½ lime', quantity: '1–2 tsk' },
      { name: 'Extra virgin olivenolie', quantity: '2 tsk' },
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
    meatFamily: 'minced-beef',
    title: 'Kødsauce med pasta',
    subtitle: 'Løg, gulerødder og tomater · 2 personer',
    time: '25 min',
    servings: 2,
    nutrition: { kj: '3130', fat: '24–30', carbs: '75–82', protein: '40–45', fiber: '5–7' },
    ingredients: [
      { name: 'Hakket oksekød', quantity: '300g', note: 'tilbud' },
      { name: 'Pasta', quantity: '150g', note: 'fusilli, penne eller spaghetti' },
      { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
      { name: 'Gulerødder', quantity: '200g', note: 'i små tern' },
      { name: 'Løg', quantity: '1 stk', note: 'finthakket' },
      { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
      { name: 'Oregano', quantity: '1 tsk' },
      { name: 'Koncentreret tomatpuré', quantity: '1 spsk', note: 'valgfrit' },
      { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
      { name: 'Salt og peber', quantity: 'efter smag' },
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
    meatFamily: 'minced-veal-pork',
    title: 'Tortilla wraps med krydret kød',
    subtitle: 'Spidskål, tomat, agurk og dressing · 2 personer',
    time: '15 min',
    servings: 2,
    nutrition: { kj: '3050', fat: '35', carbs: '65', protein: '38', fiber: '5' },
    ingredients: [
      { name: 'Hakket kalv/flæsk', quantity: '350g', note: 'tilbud' },
      { name: 'Tortilla wraps', quantity: '4 stk' },
      { name: 'Spidskål', quantity: '300g', note: 'fintskåret' },
      { name: 'Tomat', quantity: '2 stk', note: 'i tern' },
      { name: 'Agurk', quantity: '1 stk', note: 'i skiver' },
      { name: 'Dressing', quantity: '2 spsk', note: 'yoghurt, mayo eller salsa' },
      { name: 'Spidskommen', quantity: '1 tsk' },
      { name: 'Paprika', quantity: '1 tsk' },
      { name: 'Salt og peber', quantity: 'efter smag' },
      { name: 'Olie', quantity: '1 spsk' },
    ],
    steps: [
      { text: 'Steg kødet i olie, bræk det i stykker.' },
      { text: 'Krydr med spidskommen, paprika, salt og peber.' },
      { text: 'Varm tortillas på en tør pande 30 sek. per side.' },
      { text: 'Fyld wraps med kød, spidskål, tomat, agurk og dressing.' },
      { text: 'Rul sammen og server.' },
    ],
  },
];

export function getRecipeForMeat(meatFamilyId: string): Recipe | undefined {
  return RECIPES.find((r) => r.meatFamily === meatFamilyId);
}
