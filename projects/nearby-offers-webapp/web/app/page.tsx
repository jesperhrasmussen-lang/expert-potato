import { MealSearchForm } from '@/components/meal-search-form';

export default function HomePage() {
  return (
    <main className="page-stack">
      <section className="intro-block">
        <p className="page-subtitle">
          Find det billigste kød fra lokale supermarkeder på sekunder.
        </p>
      </section>
      <MealSearchForm />
    </main>
  );
}
