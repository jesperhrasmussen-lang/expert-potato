import { MealSearchForm } from '@/components/meal-search-form';

export default function SearchPage() {
  return (
    <main className="page-stack">
      <section className="intro-block">
        <p className="eyebrow">Søg</p>
        <h1>Find 5 billigste måltider</h1>
        <p className="page-copy">
          Indtast adresse, og lad appen beregne de billigste mulige måltider på tværs af kædernes tilbud. Afstand vises som ekstra information.
        </p>
      </section>
      <MealSearchForm />
    </main>
  );
}

