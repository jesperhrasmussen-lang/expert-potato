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

export interface Recipe {
  meatFamily: string;
  title: string;
  subtitle: string;
  time: string;
  servings: number;
  portions: {
    small: PortionVariant;
    large: PortionVariant;
  };
  preparation?: string[];
  steps: RecipeStep[];
}

// Nutrition calculated per portion (recipe ÷ 2) using standard Danish food tables.
// Meat fat%: svinekød 10%, oksekød 12%, kalv/flæsk 12%. Fløde 13%.

export const RECIPES: Recipe[] = [
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        // 250g kylling + 150g pasta + 400g broccoli + 1dl fløde 13% + 1spsk olie
        nutrition: { kj: '2510', fat: '17', carbs: '63', protein: '46', fiber: '8' },
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
      },
      large: {
        // 350g kylling + 220g pasta + 500g broccoli + 1.5dl fløde + 1spsk olie
        nutrition: { kj: '3480', fat: '22', carbs: '90', protein: '64', fiber: '11' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '350g', note: 'tilbud' },
          { name: 'Pasta', quantity: '220g', note: 'penne eller fusilli' },
          { name: 'Broccoli', quantity: '500g', note: 'i små buketter' },
          { name: 'Fløde', quantity: '1,5 dl' },
          { name: 'Hvidløg', quantity: '3 fed', note: 'fintrevet eller finthakket' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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
    portions: {
      small: {
        // 350g svinekød 10% + 120g ris + 350g spidskål + soja/honning + 2tsk olie
        nutrition: { kj: '2600', fat: '23', carbs: '63', protein: '40', fiber: '4' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '350g', note: 'tilbud' },
          { name: 'Jasminris', quantity: '120g' },
          { name: 'Spidskål', quantity: '350g', note: 'fintsnittet' },
          { name: 'Sojasauce', quantity: '2 spsk' },
          { name: 'Honning', quantity: '2 tsk' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Friskrevet ingefær', quantity: '2 tsk' },
          { name: 'Riseddike eller saft af ½ lime', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '2 tsk' },
        ],
      },
      large: {
        // 450g svinekød + 170g ris + 500g spidskål + soja/honning + 1spsk olie
        nutrition: { kj: '3540', fat: '30', carbs: '90', protein: '52', fiber: '6' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '450g', note: 'tilbud' },
          { name: 'Jasminris', quantity: '170g' },
          { name: 'Spidskål', quantity: '500g', note: 'fintsnittet' },
          { name: 'Sojasauce', quantity: '3 spsk' },
          { name: 'Honning', quantity: '1 spsk' },
          { name: 'Hvidløg', quantity: '3 fed', note: 'fintrevet eller finthakket' },
          { name: 'Friskrevet ingefær', quantity: '1 spsk' },
          { name: 'Riseddike eller saft af ½ lime', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
        ],
      },
    },
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
    portions: {
      small: {
        // 300g oksekød 12% + 120g pasta + 200g gulerødder + 400g tomater + 1 løg + 1spsk olie
        nutrition: { kj: '2800', fat: '26', carbs: '66', protein: '41', fiber: '8' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '300g', note: 'tilbud' },
          { name: 'Pasta', quantity: '120g', note: 'fusilli, penne eller spaghetti' },
          { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
          { name: 'Gulerødder', quantity: '200g', note: 'i små tern' },
          { name: 'Løg', quantity: '1 stk', note: 'finthakket' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Oregano', quantity: '1 tsk' },
          { name: 'Koncentreret tomatpuré', quantity: '1 spsk', note: 'valgfrit' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        // 400g oksekød + 170g pasta + 250g gulerødder + 400g tomater + 1 løg + 1spsk olie
        nutrition: { kj: '3600', fat: '32', carbs: '86', protein: '54', fiber: '9' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '400g', note: 'tilbud' },
          { name: 'Pasta', quantity: '170g', note: 'fusilli, penne eller spaghetti' },
          { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
          { name: 'Gulerødder', quantity: '250g', note: 'i små tern' },
          { name: 'Løg', quantity: '1 stk', note: 'finthakket' },
          { name: 'Hvidløg', quantity: '3 fed', note: 'fintrevet eller finthakket' },
          { name: 'Oregano', quantity: '1 tsk' },
          { name: 'Koncentreret tomatpuré', quantity: '1 spsk', note: 'valgfrit' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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
    subtitle: 'Spidskål, tomat, agurk og yoghurt-dressing · 2 personer',
    time: '15–20 min',
    servings: 2,
    portions: {
      small: {
        // 350g kalv/flæsk 12% + 3 wraps + 250g spidskål + 2 tomat + 1 agurk + 3spsk yoghurt + 1spsk olie
        nutrition: { kj: '2830', fat: '32', carbs: '53', protein: '40', fiber: '7' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '350g', note: 'tilbud' },
          { name: 'Tortilla wraps', quantity: '3 stk' },
          { name: 'Spidskål', quantity: '250g', note: 'fintsnittet' },
          { name: 'Tomat', quantity: '2 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i tynde skiver eller små tern' },
          { name: 'Yoghurt', quantity: '3 spsk' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citron- eller limesaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        // 450g kalv/flæsk + 4 wraps + 350g spidskål + 3 tomat + 1 agurk + 4spsk yoghurt + 1spsk olie
        nutrition: { kj: '3620', fat: '42', carbs: '64', protein: '52', fiber: '9' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '450g', note: 'tilbud' },
          { name: 'Tortilla wraps', quantity: '4 stk' },
          { name: 'Spidskål', quantity: '350g', note: 'fintsnittet' },
          { name: 'Tomat', quantity: '3 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i tynde skiver eller små tern' },
          { name: 'Yoghurt', quantity: '4 spsk' },
          { name: 'Spidskommen', quantity: '1,5 tsk' },
          { name: 'Paprika', quantity: '1,5 tsk' },
          { name: 'Citron- eller limesaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
    steps: [
      { text: 'Snit spidskålen fint. Skær tomat og agurk ud. Bland yoghurt med citron- eller limesaft, lidt salt og lidt peber.' },
      { text: 'Varm en stor pande op på middel varme, tilsæt olivenolien, og kom kødet på panden. Lad det stege ca. 1 minut uden at røre for meget. Bryd det derefter i mindre stykker og steg videre 4–5 minutter, til det ikke længere er råt og har fået lidt brun farve nogle steder.' },
      { text: 'Lad kødet blive på panden. Tilsæt spidskommen, paprika, lidt salt og peber. Vend rundt i 30 sekunder.' },
      { text: 'Varm tortillaerne på en tør pande 20–30 sekunder per side, til de bliver bløde og nemme at folde.' },
      { text: 'Fordel lidt spidskål på hver tortilla. Kom derefter kød, tomat og agurk på. Top med lidt yoghurt-dressing.' },
      { text: 'Fold siderne lidt ind, og rul tortillaerne stramt sammen. Server med det samme.' },
    ],
  },
];

export function getRecipeForMeat(meatFamilyId: string): Recipe | undefined {
  return RECIPES.find((r) => r.meatFamily === meatFamilyId);
}
