import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="home-page">
      <div className="hero-card">
        <p className="eyebrow">V1 prototype</p>
        <h1>Nearby Meals</h1>
        <p className="hero-copy">
          DB-først webapp som finder de billigste mulige måltider nær brugeren ud fra aktuelle tilbud.
        </p>
        <div className="hero-actions">
          <Link href="/search" className="primary-button link-button">
            Gå til søgning
          </Link>
          <Link href="/results" className="secondary-button link-button">
            Se resultater
          </Link>
        </div>
      </div>
    </main>
  );
}

