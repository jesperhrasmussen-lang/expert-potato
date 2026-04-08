import { MealSearchForm } from '@/components/meal-search-form';

export default function HomePage() {
  return (
    <main className="page-stack">
      <section className="intro-block">
        <h1>Nearby Meals</h1>
        <p className="page-copy">
          Find de billigste måltider ud fra aktuelle tilbud nær dig.
        </p>
      </section>
      <MealSearchForm />
    </main>
  );
}
