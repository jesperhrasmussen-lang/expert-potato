import { MealSearchForm } from '@/components/meal-search-form';

export default function HomePage() {
  return (
    <main className="page-stack">
      <section className="intro-block">
        <p className="page-subtitle">
          Billigste kødtilbud nær dig med nemme og lækre opskrifter
        </p>
      </section>
      <MealSearchForm />
    </main>
  );
}
