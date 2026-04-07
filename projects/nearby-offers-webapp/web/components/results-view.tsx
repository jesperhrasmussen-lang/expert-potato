"use client";

import Link from 'next/link';
import { useState } from 'react';

import type { Offer, SearchResponse } from '@/types/search-types';

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return 'Ukendt afstand';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatPrice(price: number, currency: string) {
  return `${price.toFixed(0)} ${currency}`;
}

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
}

function modeLabel(value: string) {
  if (value === 'walk') return 'gåafstand';
  if (value === 'radius') return 'radius';
  if (value === 'transit') return 'transit';
  return value;
}

function formatFilterSummary(search: SearchResponse['search']) {
  const threshold = search.maxWalkKm ?? search.radiusKm ?? search.maxTransitMin;
  const unit = search.accessMode === 'transit' ? 'min' : 'km';
  if (threshold === null || threshold === undefined) {
    return `ukendt ${unit}`;
  }
  return `${threshold} ${unit}`;
}

function flagLabel(flag: string) {
  const labels: Record<string, string> = {
    direct_source: 'Direkte kilde',
    fallback_source: 'Fallback-kilde',
    app_price: 'App-pris',
    membership_price: 'Medlemspris',
    ambiguous_match: 'Muligt upræcist match',
    starts_soon: 'Starter snart',
    ends_soon: 'Slutter snart',
  };

  return labels[flag] || flag.split('_').join(' ');
}

function EmptySection({ text }: { text: string }) {
  return <div className="empty-box">{text}</div>;
}

function OfferCard({ offer, onOpen }: { offer: Offer; onOpen: (offer: Offer) => void }) {
  return (
    <article className="offer-card compact-offer-card">
      <div className="offer-card-top">
        <div>
          <p className="offer-chain">{offer.chainName}</p>
          <h3 className="offer-title">{offer.productTitle}</h3>
        </div>
        <div className="offer-price-block">
          <div className="offer-price">{formatPrice(offer.price, offer.currency)}</div>
          {offer.unitPriceText ? <div className="offer-unit-price">{offer.unitPriceText}</div> : null}
        </div>
      </div>

      <div className="offer-meta-row compact-meta-row">
        <span>{offer.sizeText ?? 'Størrelse ukendt'}</span>
        <span>{formatDistance(offer.distanceMeters)}</span>
        <span>{offer.storeName ?? offer.chainName}</span>
      </div>

      <div className="offer-source-line">
        <span>Kilde: {offer.sourceLabel}</span>
        <span>{offer.sourceKind === 'direct' ? 'Direkte' : 'Fallback'}</span>
      </div>

      <div className="badge-row">
        <span className={`badge badge-${offer.sourceKind}`}>
          {offer.sourceKind === 'direct' ? 'Direkte kilde' : 'Fallback-kilde'}
        </span>
        <span
          className={`badge ${
            offer.confidence === 'high'
              ? 'badge-direct'
              : offer.confidence === 'medium'
                ? 'badge-warn'
                : 'badge-neutral'
          }`}
        >
          Sikkerhed: {offer.confidence}
        </span>
        {offer.flags.slice(0, 2).map((flag) => (
          <span key={flag} className="badge badge-neutral">
            {flagLabel(flag)}
          </span>
        ))}
      </div>

      <div className="offer-card-footer">
        <span className="offer-validity">
          {formatValidityRange(offer.validFrom, offer.validTo)}
        </span>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onOpen(offer)}
          aria-label={`Se detaljer for ${offer.productTitle}`}
        >
          Se detaljer
        </button>
      </div>
    </article>
  );
}

function formatValidityRange(from: string | null, to: string | null) {
  const formattedFrom = formatDateLabel(from);
  const formattedTo = formatDateLabel(to);
  if (formattedFrom && formattedTo) return `${formattedFrom} → ${formattedTo}`;
  if (formattedFrom && !formattedTo) return `Fra ${formattedFrom}`;
  if (!formattedFrom && formattedTo) return `Til ${formattedTo}`;
  return 'Ukendt periode';
}

function OfferDetailDrawer({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  return (
    <div className="detail-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="detail-drawer-header">
          <div>
            <p className="summary-eyebrow">Tilbudsdetaljer</p>
            <h2>{offer.productTitle}</h2>
            <p className="page-copy">{offer.chainName}</p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Luk
          </button>
        </div>

        <section className="detail-section">
          <h3>Butik og periode</h3>
          <div className="detail-grid">
            <div>
              <p className="transparency-label">Butik</p>
              <p className="page-copy">{offer.storeName ?? offer.chainName}</p>
              <p className="summary-subline">{formatDistance(offer.distanceMeters)}</p>
            </div>
            <div>
              <p className="transparency-label">Gyldighed</p>
              <p className="page-copy">{formatValidityRange(offer.validFrom, offer.validTo)}</p>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h3>Pris og størrelse</h3>
          <div className="detail-price-row">
            <div>
              <div className="offer-price">{formatPrice(offer.price, offer.currency)}</div>
              {offer.unitPriceText ? <div className="offer-unit-price">{offer.unitPriceText}</div> : null}
            </div>
            <div>
              <p className="transparency-label">Størrelse</p>
              <p>{offer.sizeText ?? 'Ukendt'}</p>
            </div>
          </div>
        </section>

        <section className="detail-section detail-section-soft">
          <h3>Kilde og sikkerhed</h3>
          <div className="detail-grid">
            <div>
              <p className="transparency-label">Kilde</p>
              <p>{offer.sourceLabel}</p>
              <p className="summary-subline">{offer.sourceKind === 'direct' ? 'Direkte kæde' : 'Fallback-kilde'}</p>
            </div>
            <div>
              <p className="transparency-label">Datasikkerhed</p>
              <p>{offer.confidence}</p>
            </div>
          </div>
          {offer.flags.length ? (
            <div className="badge-row">
              {offer.flags.map((flag) => (
                <span key={flag} className="badge badge-neutral">
                  {flagLabel(flag)}
                </span>
              ))}
            </div>
          ) : null}
          {offer.flags.includes('ambiguous_match') ? (
            <div className="detail-note">
              Dette tilbud ligner en relevant vare, men matchen er ikke helt præcis.
            </div>
          ) : null}
        </section>

        <div className="detail-actions">
          <a
          className="primary-button link-button"
          href={offer.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Åbn kilde for ${offer.productTitle} i nyt vindue`}
        >
            Åbn kilde
          </a>
        </div>
      </aside>
    </div>
  );
}

export function ResultsView({ data }: { data: SearchResponse }) {
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  return (
    <>
      <div className="results-layout">
        <header className="summary-bar">
          <div>
            <p className="summary-eyebrow">Søgning</p>
            <h1 className="summary-address">{data.resolvedAddress}</h1>
            <p className="summary-subline">
              {modeLabel(data.search.accessMode)} · {formatFilterSummary(data.search)} · {data.search.queries.length} produkter
            </p>
            <div className="summary-chip-row">
              <span className="badge badge-neutral">{modeLabel(data.search.accessMode)}</span>
              {data.search.queries.map((query) => (
                <span key={query} className="badge badge-neutral">
                  {query}
                </span>
              ))}
            </div>
          </div>
          <Link className="secondary-button link-button" href="/search">
            Redigér søgning
          </Link>
        </header>

        <section className="panel transparency-panel">
          <div className="section-head">
            <h2>Resultatkvalitet</h2>
          </div>
          <div className="transparency-grid">
            <div>
              <p className="transparency-label">Senest opdateret</p>
              <p>{formatGeneratedAt(data.summary.generatedAt)}</p>
            </div>
            <div>
              <p className="transparency-label">Butikker i søgeområdet</p>
              <p>{data.summary.totalStoresInScope}</p>
            </div>
            <div>
              <p className="transparency-label">Matchende tilbud</p>
              <p>{data.summary.totalOffersMatched}</p>
            </div>
            <div>
              <p className="transparency-label">Kildeprincip</p>
              <p>Direkte kædekilde først, fallback kun ved behov</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Kæder i søgningen</h2>
            <span>{data.chains.length} kæder</span>
          </div>
          <div className="chip-row chip-row-muted">
            {data.chains.length ? (
              data.chains.map((chain) => (
                <span key={chain.chainId} className="chip">
                  {chain.name}
                </span>
              ))
            ) : (
              <span className="input-help">Ingen kæder registreret.</span>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Bedste tilbud nu</h2>
            <span>{data.bestNow.length} fund</span>
          </div>
          <div className="stack-list">
            {data.bestNow.length ? (
              data.bestNow.map((offer) => <OfferCard key={offer.offerId} offer={offer} onOpen={setSelectedOffer} />)
            ) : (
              <EmptySection text="Ingen aktive tilbud matchede den nuværende søgning." />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Kommende tilbud</h2>
            <span>{data.upcoming.length} fund</span>
          </div>
          <div className="stack-list">
            {data.upcoming.length ? (
              data.upcoming.map((offer) => <OfferCard key={offer.offerId} offer={offer} onOpen={setSelectedOffer} />)
            ) : (
              <EmptySection text="Ingen kommende tilbud matchede den nuværende søgning." />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Nærliggende butikker</h2>
            <span>{data.summary.totalStoresInScope} butikker i søgeområdet</span>
          </div>
          <div className="store-list">
            {data.stores.length ? (
              data.stores.map((store) => (
                <article key={store.storeId} className="store-card">
                  <div>
                    <h3>{store.name}</h3>
                    <p>{formatDistance(store.distanceMeters)}</p>
                  </div>
                  <div className="store-side">
                    <span className={`badge ${store.accessQualified ? 'badge-direct' : 'badge-neutral'}`}>
                      {store.accessQualified ? 'Inde i filteret' : 'Uden for filteret'}
                    </span>
                    <span>{store.relevantOfferCount} relevante tilbud</span>
                  </div>
                </article>
              ))
            ) : (
              <EmptySection text="Ingen nærliggende butikker med relevante tilbud blev fundet." />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Grupperede resultater</h2>
            <span>{data.offerGroups.length} grupper</span>
          </div>
          <div className="group-list">
            {data.offerGroups.map((group) => (
              <div key={group.query} className="group-block">
                <h3>{group.query}</h3>
                <div className="stack-list">
                  {group.offers.length ? (
                    group.offers.map((offer) => <OfferCard key={offer.offerId} offer={offer} onOpen={setSelectedOffer} />)
                  ) : (
                    <EmptySection text="Ingen tilbud matchede denne forespørgsel." />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedOffer ? <OfferDetailDrawer offer={selectedOffer} onClose={() => setSelectedOffer(null)} /> : null}
    </>
  );
}

