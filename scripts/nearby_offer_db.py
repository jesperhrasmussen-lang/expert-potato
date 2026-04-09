#!/usr/bin/env python3
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from ingredient_catalog_dk import infer_attributes, normalize_text, query_to_family

def detect_organic(product_name: str, description: str = '') -> bool:
    text = f"{product_name or ''} {description or ''}"
    low = text.lower()
    # Danish ø/Ø doesn't lowercase properly in all environments, check both cases
    if 'kologisk' in low or 'kologisk' in text:
        return True
    if 'øko ' in low or 'øko-' in low or 'Øko ' in text or 'Øko-' in text:
        return True
    words = low.split()
    if 'øgo' in words or 'ØGO' in text.split():
        return True
    return False


SCHEMA_SQL = '''
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chains (
  chain_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_type TEXT,
  source_locator_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_key TEXT NOT NULL,
  store_name TEXT,
  address_text TEXT,
  lat REAL,
  lon REAL,
  source TEXT,
  last_seen_at TEXT,
  FOREIGN KEY (chain_key) REFERENCES chains(chain_key)
);

CREATE TABLE IF NOT EXISTS search_runs (
  id TEXT PRIMARY KEY,
  query_address TEXT,
  radius_km REAL,
  product_queries_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS nearby_store_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_run_id TEXT,
  store_id INTEGER,
  chain_key TEXT NOT NULL,
  distance_km REAL,
  included INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  FOREIGN KEY (search_run_id) REFERENCES search_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
  FOREIGN KEY (chain_key) REFERENCES chains(chain_key)
);

CREATE TABLE IF NOT EXISTS offers (
  offer_key TEXT PRIMARY KEY,
  chain_key TEXT NOT NULL,
  store_id INTEGER,
  query_family TEXT,
  product_name TEXT NOT NULL,
  description TEXT,
  price_regular REAL,
  price_effective REAL,
  price_effective_kind TEXT,
  currency TEXT,
  size_text TEXT,
  size_grams_min INTEGER,
  size_grams_max INTEGER,
  unit_price REAL,
  unit_price_unit TEXT,
  offer_start_at TEXT,
  offer_end_at TEXT,
  offer_state TEXT,
  source_system TEXT,
  source_kind TEXT,
  source_url TEXT,
  source_offer_id TEXT,
  source_catalog_id TEXT,
  confidence TEXT,
  is_organic INTEGER NOT NULL DEFAULT 0,
  raw_payload_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (chain_key) REFERENCES chains(chain_key),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_chain_query_state ON offers(chain_key, query_family, offer_state);
CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON offers(expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_source_offer_id ON offers(source_offer_id);
CREATE INDEX IF NOT EXISTS idx_offers_source_catalog_id ON offers(source_catalog_id);
CREATE INDEX IF NOT EXISTS idx_stores_chain_key ON stores(chain_key);
CREATE INDEX IF NOT EXISTS idx_nearby_chain ON nearby_store_sets(search_run_id, chain_key);

CREATE TABLE IF NOT EXISTS offer_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_system TEXT,
  source_kind TEXT,
  source_url TEXT,
  raw_payload_json TEXT,
  FOREIGN KEY (offer_key) REFERENCES offers(offer_key) ON DELETE CASCADE
);
'''


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def infer_query_family(query: Optional[str]) -> Optional[str]:
    return query_to_family(query) or normalize_text(query) or None


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = str(value).strip()
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def compute_expiry(offer: Dict[str, Any], now: datetime) -> datetime:
    end = parse_dt(offer.get('offerEndDate') or offer.get('offer_end_at'))
    if end:
        return end
    start = parse_dt(offer.get('offerStartDate') or offer.get('offer_start_at'))
    if start:
        return start + timedelta(days=1)
    return now + timedelta(days=1)


def offer_key(offer: Dict[str, Any]) -> str:
    explicit = offer.get('source_offer_id') or offer.get('sourceOfferId') or offer.get('source_offer_id')
    if explicit:
        return str(explicit)
    parts = [
        offer.get('chain_key') or offer.get('chainKey') or offer.get('storeNormalized') or offer.get('store'),
        infer_query_family(offer.get('query')),
        offer.get('productName') or offer.get('product_name'),
        offer.get('sizeText') or offer.get('size_text'),
        offer.get('sourceKind') or offer.get('source_kind'),
        offer.get('source') or offer.get('source_system'),
        offer.get('productUrl') or offer.get('source_url'),
    ]
    raw = '|'.join(str(x or '') for x in parts)
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()


def iter_offers(paths: Iterable[str]) -> Iterable[Dict[str, Any]]:
    for path in paths:
        with open(path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        payloads = data if isinstance(data, list) else [data]
        for payload in payloads:
            for offer in payload.get('offers', []) or []:
                yield offer


def ensure_chain(cur: sqlite3.Cursor, offer: Dict[str, Any], now_iso: str) -> str:
    chain_key = normalize_text(offer.get('storeNormalized') or offer.get('chain_key') or offer.get('store') or '')
    chain_key = {
        'foetex': 'foetex',
        'netto': 'netto',
        'rema 1000': 'rema 1000',
        'brugsen': 'brugsen',
        'superbrugsen': 'superbrugsen',
        '365discount': '365discount',
        'meny': 'meny',
        'lidl': 'lidl',
    }.get(chain_key, chain_key)
    display = offer.get('store') or chain_key
    source_type = offer.get('sourceKind') or offer.get('source_kind')
    source_locator = json.dumps({'source': offer.get('source'), 'source_url': offer.get('productUrl') or offer.get('source_url')}, ensure_ascii=False)
    cur.execute(
        '''
        INSERT INTO chains (chain_key, display_name, source_type, source_locator_json, active, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(chain_key) DO UPDATE SET
          display_name=excluded.display_name,
          source_type=excluded.source_type,
          source_locator_json=excluded.source_locator_json,
          updated_at=excluded.updated_at,
          active=1
        ''',
        (chain_key, display, source_type, source_locator, now_iso),
    )
    return chain_key


def upsert_offers(db_path: str, json_paths: List[str]) -> None:
    now = utc_now()
    now_iso = to_iso(now)
    with sqlite3.connect(db_path) as conn:
        conn.execute('PRAGMA foreign_keys = ON')
        conn.executescript(SCHEMA_SQL)
        cur = conn.cursor()
        for offer in iter_offers(json_paths):
            chain_key = ensure_chain(cur, offer, now_iso)
            key = offer_key({**offer, 'chain_key': chain_key})
            expiry = compute_expiry(offer, now)
            raw_json = json.dumps(offer, ensure_ascii=False)
            row = {
                'offer_key': key,
                'chain_key': chain_key,
                'query_family': infer_query_family(offer.get('query')),
                'product_name': offer.get('productName') or offer.get('product_name'),
                'description': offer.get('description'),
                'price_regular': offer.get('price'),
                'price_effective': offer.get('effectivePrice') if offer.get('effectivePrice') is not None else offer.get('price_effective'),
                'price_effective_kind': offer.get('effectivePriceKind') or offer.get('price_effective_kind'),
                'currency': offer.get('currency') or 'DKK',
                'size_text': offer.get('sizeText') or offer.get('size_text'),
                'size_grams_min': offer.get('sizeGramsMin') or offer.get('size_grams_min'),
                'size_grams_max': offer.get('sizeGramsMax') or offer.get('size_grams_max'),
                'unit_price': offer.get('unitPrice') if offer.get('unitPrice') is not None else offer.get('unit_price'),
                'unit_price_unit': offer.get('unitPriceUnit') or offer.get('unit_price_unit'),
                'offer_start_at': offer.get('offerStartDate') or offer.get('offer_start_at'),
                'offer_end_at': offer.get('offerEndDate') or offer.get('offer_end_at'),
                'offer_state': offer.get('offerState') or offer.get('offer_state'),
                'source_system': offer.get('source') or offer.get('source_system'),
                'source_kind': offer.get('sourceKind') or offer.get('source_kind'),
                'source_url': offer.get('productUrl') or offer.get('source_url'),
                'source_offer_id': offer.get('publicId') or offer.get('source_offer_id'),
                'source_catalog_id': offer.get('publicationPublicId') or offer.get('source_catalog_id'),
                'confidence': offer.get('confidence') or 'high',
                'is_organic': 1 if detect_organic(
                    offer.get('productName') or offer.get('product_name') or '',
                    offer.get('description') or '',
                ) else 0,
                'raw_payload_json': raw_json,
                'first_seen_at': now_iso,
                'last_seen_at': now_iso,
                'expires_at': to_iso(expiry),
            }
            cur.execute(
                '''
                INSERT INTO offers (
                  offer_key, chain_key, query_family, product_name, description,
                  price_regular, price_effective, price_effective_kind, currency,
                  size_text, size_grams_min, size_grams_max, unit_price, unit_price_unit,
                  offer_start_at, offer_end_at, offer_state,
                  source_system, source_kind, source_url, source_offer_id, source_catalog_id,
                  confidence, is_organic, raw_payload_json, first_seen_at, last_seen_at, expires_at
                ) VALUES (
                  :offer_key, :chain_key, :query_family, :product_name, :description,
                  :price_regular, :price_effective, :price_effective_kind, :currency,
                  :size_text, :size_grams_min, :size_grams_max, :unit_price, :unit_price_unit,
                  :offer_start_at, :offer_end_at, :offer_state,
                  :source_system, :source_kind, :source_url, :source_offer_id, :source_catalog_id,
                  :confidence, :is_organic, :raw_payload_json, :first_seen_at, :last_seen_at, :expires_at
                )
                ON CONFLICT(offer_key) DO UPDATE SET
                  chain_key=excluded.chain_key,
                  query_family=excluded.query_family,
                  product_name=excluded.product_name,
                  description=excluded.description,
                  price_regular=excluded.price_regular,
                  price_effective=excluded.price_effective,
                  price_effective_kind=excluded.price_effective_kind,
                  currency=excluded.currency,
                  size_text=excluded.size_text,
                  size_grams_min=excluded.size_grams_min,
                  size_grams_max=excluded.size_grams_max,
                  unit_price=excluded.unit_price,
                  unit_price_unit=excluded.unit_price_unit,
                  offer_start_at=excluded.offer_start_at,
                  offer_end_at=excluded.offer_end_at,
                  offer_state=excluded.offer_state,
                  source_system=excluded.source_system,
                  source_kind=excluded.source_kind,
                  source_url=excluded.source_url,
                  source_offer_id=excluded.source_offer_id,
                  source_catalog_id=excluded.source_catalog_id,
                  confidence=excluded.confidence,
                  is_organic=excluded.is_organic,
                  raw_payload_json=excluded.raw_payload_json,
                  last_seen_at=excluded.last_seen_at,
                  expires_at=excluded.expires_at
                ''',
                row,
            )
            cur.execute(
                'INSERT INTO offer_observations (offer_key, observed_at, source_system, source_kind, source_url, raw_payload_json) VALUES (?, ?, ?, ?, ?, ?)',
                (key, now_iso, row['source_system'], row['source_kind'], row['source_url'], raw_json),
            )
        prune_expired(conn)
        conn.commit()


def prune_expired(conn: sqlite3.Connection) -> int:
    now_iso = to_iso(utc_now())
    cur = conn.cursor()
    cur.execute('DELETE FROM offers WHERE expires_at <= ?', (now_iso,))
    deleted = cur.rowcount if cur.rowcount is not None else 0
    cur.execute('DELETE FROM offer_observations WHERE offer_key NOT IN (SELECT offer_key FROM offers)')
    return deleted


def show_counts(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute('PRAGMA foreign_keys = ON')
        conn.executescript(SCHEMA_SQL)
        cur = conn.cursor()
        for table in ['chains', 'stores', 'offers', 'offer_observations']:
            cur.execute(f'SELECT COUNT(*) FROM {table}')
            print(f'{table}: {cur.fetchone()[0]}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Initialize, ingest, and prune the nearby-offer SQLite database.')
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_init = sub.add_parser('init')
    p_init.add_argument('db')

    p_ingest = sub.add_parser('ingest')
    p_ingest.add_argument('db')
    p_ingest.add_argument('json_paths', nargs='+')

    p_prune = sub.add_parser('prune')
    p_prune.add_argument('db')

    p_counts = sub.add_parser('counts')
    p_counts.add_argument('db')

    args = parser.parse_args()
    db_path = args.db

    if args.cmd == 'init':
        with sqlite3.connect(db_path) as conn:
            conn.execute('PRAGMA foreign_keys = ON')
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        print(db_path)
        return

    if args.cmd == 'ingest':
        upsert_offers(db_path, args.json_paths)
        show_counts(db_path)
        return

    if args.cmd == 'prune':
        with sqlite3.connect(db_path) as conn:
            conn.execute('PRAGMA foreign_keys = ON')
            conn.executescript(SCHEMA_SQL)
            deleted = prune_expired(conn)
            conn.commit()
        print(f'deleted_offers: {deleted}')
        return

    if args.cmd == 'counts':
        show_counts(db_path)
        return


if __name__ == '__main__':
    main()

