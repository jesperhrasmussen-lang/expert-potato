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

export type SizeKey = 'small' | 'large' | 'combined';

export interface Recipe {
  meatFamily: string;
  title: string;
  subtitle: string;
  time: string;
  servings: number;
  portions: {
    small: PortionVariant;
    large: PortionVariant;
    combined: PortionVariant;
  };
  preparation?: string[];
  steps: RecipeStep[];
}

// Nutrition calculated per portion (recipe ÷ 2) using standard Danish food tables.
// Meat fat%: svinekød 10%, oksekød 12%, kalv/flæsk 12%. Fløde 13%.
// Small portions target ~2000 kJ per portion. Large portions target ~3500 kJ.
// Combined = 1 softgirl + 1 gymbro portion. Ingredients are midpoint.

export const RECIPES: Recipe[] = [
  // ─── CHICKEN-FILLET: Original ───
  {
    meatFamily: 'chicken-fillet',
    title: 'Cremet kylling med pasta',
    subtitle: 'Broccoli, hvidløg og flødesauce · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '13', carbs: '48', protein: '35', fiber: '7' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '200g', note: 'tilbud' },
          { name: 'Pasta', quantity: '100g', note: 'penne eller fusilli' },
          { name: 'Broccoli', quantity: '350g', note: 'i små buketter' },
          { name: 'Fløde', quantity: '¾ dl' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
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
      combined: {
        nutrition: { kj: '2000 / 3480', fat: '13 / 22', carbs: '48 / 90', protein: '35 / 64', fiber: '7 / 11' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '275g', note: 'tilbud' },
          { name: 'Pasta', quantity: '160g', note: 'penne eller fusilli' },
          { name: 'Broccoli', quantity: '425g', note: 'i små buketter' },
          { name: 'Fløde', quantity: '1 dl' },
          { name: 'Hvidløg', quantity: '2–3 fed', note: 'fintrevet eller finthakket' },
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
      { text: 'Server med det samme. Den ene portion er lidt mindre end den anden.' },
    ],
  },

  // ─── CHICKEN-FILLET: Feta variant ───
  {
    meatFamily: 'chicken-fillet',
    title: 'Kylling med feta, tomat og pasta',
    subtitle: 'Cherrytomater, spinat og smeltet feta · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '15', carbs: '44', protein: '36', fiber: '5' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '200g', note: 'tilbud' },
          { name: 'Pasta', quantity: '100g', note: 'penne eller fusilli' },
          { name: 'Cherrytomater', quantity: '300g', note: 'halveret' },
          { name: 'Feta', quantity: '60g', note: 'smuldret' },
          { name: 'Frisk spinat', quantity: '100g' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'finthakket' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        nutrition: { kj: '3450', fat: '24', carbs: '78', protein: '62', fiber: '8' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '350g', note: 'tilbud' },
          { name: 'Pasta', quantity: '190g', note: 'penne eller fusilli' },
          { name: 'Cherrytomater', quantity: '400g', note: 'halveret' },
          { name: 'Feta', quantity: '100g', note: 'smuldret' },
          { name: 'Frisk spinat', quantity: '150g' },
          { name: 'Hvidløg', quantity: '3 fed', note: 'finthakket' },
          { name: 'Extra virgin olivenolie', quantity: '1,5 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      combined: {
        nutrition: { kj: '2000 / 3450', fat: '15 / 24', carbs: '44 / 78', protein: '36 / 62', fiber: '5 / 8' },
        ingredients: [
          { name: 'Kyllingebryst eller inderfilet', quantity: '275g', note: 'tilbud' },
          { name: 'Pasta', quantity: '145g', note: 'penne eller fusilli' },
          { name: 'Cherrytomater', quantity: '350g', note: 'halveret' },
          { name: 'Feta', quantity: '80g', note: 'smuldret' },
          { name: 'Frisk spinat', quantity: '125g' },
          { name: 'Hvidløg', quantity: '2–3 fed', note: 'finthakket' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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

  // ─── MINCED-PORK: Original ───
  {
    meatFamily: 'minced-pork',
    title: 'Asiatisk svinekød med spidskål og ris',
    subtitle: 'Soja, honning og ingefær · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '17', carbs: '52', protein: '30', fiber: '3' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '250g', note: 'tilbud' },
          { name: 'Jasminris', quantity: '90g' },
          { name: 'Spidskål', quantity: '300g', note: 'fintsnittet' },
          { name: 'Sojasauce', quantity: '2 spsk' },
          { name: 'Honning', quantity: '2 tsk' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Friskrevet ingefær', quantity: '2 tsk' },
          { name: 'Riseddike eller saft af ½ lime', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '2 tsk' },
        ],
      },
      large: {
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
      combined: {
        nutrition: { kj: '2000 / 3540', fat: '17 / 30', carbs: '52 / 90', protein: '30 / 52', fiber: '3 / 6' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '350g', note: 'tilbud' },
          { name: 'Jasminris', quantity: '130g' },
          { name: 'Spidskål', quantity: '400g', note: 'fintsnittet' },
          { name: 'Sojasauce', quantity: '2–3 spsk' },
          { name: 'Honning', quantity: '1 spsk' },
          { name: 'Hvidløg', quantity: '2–3 fed', note: 'fintrevet eller finthakket' },
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

  // ─── MINCED-PORK: Feta variant ───
  {
    meatFamily: 'minced-pork',
    title: 'Svinekød med feta, spinat og ris',
    subtitle: 'Hvidløg, citron og smuldret feta · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '18', carbs: '46', protein: '30', fiber: '3' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '250g' },
          { name: 'Jasminris', quantity: '90g' },
          { name: 'Frisk spinat', quantity: '200g' },
          { name: 'Feta', quantity: '60g', note: 'smuldret' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '2 tsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        nutrition: { kj: '3500', fat: '32', carbs: '82', protein: '52', fiber: '5' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '450g' },
          { name: 'Jasminris', quantity: '170g' },
          { name: 'Frisk spinat', quantity: '300g' },
          { name: 'Feta', quantity: '100g', note: 'smuldret' },
          { name: 'Hvidløg', quantity: '3 fed', note: 'fintrevet eller finthakket' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      combined: {
        nutrition: { kj: '2000 / 3500', fat: '18 / 32', carbs: '46 / 82', protein: '30 / 52', fiber: '3 / 5' },
        ingredients: [
          { name: 'Hakket svinekød', quantity: '350g' },
          { name: 'Jasminris', quantity: '130g' },
          { name: 'Frisk spinat', quantity: '250g' },
          { name: 'Feta', quantity: '80g', note: 'smuldret' },
          { name: 'Hvidløg', quantity: '2–3 fed', note: 'fintrevet eller finthakket' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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

  // ─── MINCED-BEEF: Original ───
  {
    meatFamily: 'minced-beef',
    title: 'Kødsauce med pasta',
    subtitle: 'Løg, gulerødder og tomater · 2 personer',
    time: '25 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '19', carbs: '50', protein: '28', fiber: '6' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '200g', note: 'tilbud' },
          { name: 'Pasta', quantity: '80g', note: 'fusilli, penne eller spaghetti' },
          { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
          { name: 'Gulerødder', quantity: '150g', note: 'i små tern' },
          { name: 'Løg', quantity: '1 stk', note: 'finthakket' },
          { name: 'Hvidløg', quantity: '2 fed', note: 'fintrevet eller finthakket' },
          { name: 'Oregano', quantity: '1 tsk' },
          { name: 'Koncentreret tomatpuré', quantity: '1 spsk', note: 'valgfrit' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
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
      combined: {
        nutrition: { kj: '2000 / 3600', fat: '19 / 32', carbs: '50 / 86', protein: '28 / 54', fiber: '6 / 9' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '300g', note: 'tilbud' },
          { name: 'Pasta', quantity: '125g', note: 'fusilli, penne eller spaghetti' },
          { name: 'Flåede tomater', quantity: '1 dåse', note: '400g' },
          { name: 'Gulerødder', quantity: '200g', note: 'i små tern' },
          { name: 'Løg', quantity: '1 stk', note: 'finthakket' },
          { name: 'Hvidløg', quantity: '2–3 fed', note: 'fintrevet eller finthakket' },
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

  // ─── MINCED-BEEF: Feta variant ───
  {
    meatFamily: 'minced-beef',
    title: 'Krydret oksekød med feta og bulgur',
    subtitle: 'Spidskommen, tomat, agurk og smuldret feta · 2 personer',
    time: '20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '19', carbs: '44', protein: '30', fiber: '5' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '200g' },
          { name: 'Bulgur', quantity: '80g' },
          { name: 'Feta', quantity: '60g', note: 'smuldret' },
          { name: 'Tomat', quantity: '2 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '½ stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        nutrition: { kj: '3500', fat: '33', carbs: '78', protein: '52', fiber: '8' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '400g' },
          { name: 'Bulgur', quantity: '150g' },
          { name: 'Feta', quantity: '100g', note: 'smuldret' },
          { name: 'Tomat', quantity: '3 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1,5 tsk' },
          { name: 'Paprika', quantity: '1,5 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      combined: {
        nutrition: { kj: '2000 / 3500', fat: '19 / 33', carbs: '44 / 78', protein: '30 / 52', fiber: '5 / 8' },
        ingredients: [
          { name: 'Hakket oksekød', quantity: '300g' },
          { name: 'Bulgur', quantity: '115g' },
          { name: 'Feta', quantity: '80g', note: 'smuldret' },
          { name: 'Tomat', quantity: '2–3 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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

  // ─── MINCED-VEAL-PORK: Original ───
  {
    meatFamily: 'minced-veal-pork',
    title: 'Tortilla wraps med krydret kød',
    subtitle: 'Spidskål, tomat, agurk og yoghurt-dressing · 2 personer',
    time: '15–20 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '24', carbs: '37', protein: '30', fiber: '5' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '250g', note: 'tilbud' },
          { name: 'Tortilla wraps', quantity: '2 stk' },
          { name: 'Spidskål', quantity: '200g', note: 'fintsnittet' },
          { name: 'Tomat', quantity: '1 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i tynde skiver eller små tern' },
          { name: 'Yoghurt', quantity: '2 spsk' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citron- eller limesaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
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
      combined: {
        nutrition: { kj: '2000 / 3620', fat: '24 / 42', carbs: '37 / 64', protein: '30 / 52', fiber: '5 / 9' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '350g', note: 'tilbud' },
          { name: 'Tortilla wraps', quantity: '3 stk' },
          { name: 'Spidskål', quantity: '275g', note: 'fintsnittet' },
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

  // ─── MINCED-VEAL-PORK: Feta variant ───
  {
    meatFamily: 'minced-veal-pork',
    title: 'Kødboller med feta og couscous',
    subtitle: 'Bagt feta i kødbollerne, tomat-agurk-salat · 2 personer',
    time: '25 min',
    servings: 2,
    portions: {
      small: {
        nutrition: { kj: '2000', fat: '22', carbs: '40', protein: '32', fiber: '4' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '250g' },
          { name: 'Couscous', quantity: '80g' },
          { name: 'Feta', quantity: '60g', note: 'i små tern' },
          { name: 'Tomat', quantity: '2 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '½ stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      large: {
        nutrition: { kj: '3500', fat: '40', carbs: '70', protein: '54', fiber: '7' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '450g' },
          { name: 'Couscous', quantity: '150g' },
          { name: 'Feta', quantity: '100g', note: 'i små tern' },
          { name: 'Tomat', quantity: '3 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1,5 tsk' },
          { name: 'Paprika', quantity: '1,5 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
      combined: {
        nutrition: { kj: '2000 / 3500', fat: '22 / 40', carbs: '40 / 70', protein: '32 / 54', fiber: '4 / 7' },
        ingredients: [
          { name: 'Hakket kalv/flæsk', quantity: '350g' },
          { name: 'Couscous', quantity: '115g' },
          { name: 'Feta', quantity: '80g', note: 'i små tern' },
          { name: 'Tomat', quantity: '2–3 stk', note: 'i små tern' },
          { name: 'Agurk', quantity: '1 stk', note: 'i små tern' },
          { name: 'Spidskommen', quantity: '1 tsk' },
          { name: 'Paprika', quantity: '1 tsk' },
          { name: 'Citronsaft', quantity: '1–2 tsk' },
          { name: 'Extra virgin olivenolie', quantity: '1 spsk' },
          { name: 'Salt og peber', quantity: 'efter smag' },
        ],
      },
    },
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
