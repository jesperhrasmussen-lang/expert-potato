#!/usr/bin/env python3
import argparse
import json
import sqlite3
from typing import Any, Dict, List

from ingredient_catalog_dk import is_textually_ambiguous, normalize_text, query_to_family

from find_nearby_offers_dk import (
    add_groups,
    apply_access_filters,
    dedupe_chains,
    geocode,
    nearby_places,
)
from nearby_offer_report import build_summary


def infer_query_family(query: str) -> str:
    return query_to_family(query) or normalize_text(query)


def apply_query_quality_filters(offers: List[Dict[str, Any]], queries: List[str]) -> List[Dict[str, Any]]:
    if not offers:
        return offers

    by_query = {}
    for offer in offers:
        key = normalize_text(offer.get('query'))
        by_query.setdefault(key, []).append(offer)

    kept: List[Dict[str, Any]] = []
    for query in queries:
        key = normalize_text(query)
        family = infer_query_family(query)
        candidates = by_query.get(key, [])
        if not candidates:
            continue

        exact_present = any(offer.get('comparisonGroup') == family for offer in candidates)
        for offer in candidates:
            group = offer.get('comparisonGroup')
            if exact_present and group != family:
                continue
            if is_textually_ambiguous(offer.get('productName'), offer.get('description'), family):
                continue
            kept.append(offer)

    return kept


def load_matching_offers(db_path: str, chains: List[str], queries: List[str], apply_quality_filters: bool = True) -> List[Dict[str, Any]]:
    if not queries:
        return []

    normalized_chains = [normalize_text(chain) for chain in chains]
    normalized_queries = [normalize_text(query) for query in queries]
    query_families = [infer_query_family(query) for query in queries]

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    if normalized_chains:
        chain_placeholders = ','.join('?' for _ in normalized_chains)
        cur.execute(
            f'''
            SELECT raw_payload_json
            FROM offers
            WHERE chain_key IN ({chain_placeholders})
              AND offer_state != 'expired'
            ''',
            normalized_chains,
        )
    else:
        cur.execute(
            '''
            SELECT raw_payload_json
            FROM offers
            WHERE offer_state != 'expired'
            '''
        )

    offers: List[Dict[str, Any]] = []
    for row in cur.fetchall():
        raw = json.loads(row['raw_payload_json'])
        raw_query = normalize_text(raw.get('query'))
        raw_family = infer_query_family(raw.get('query') or '')
        if raw_query in normalized_queries or raw_family in query_families:
            offers.append(raw)
    conn.close()
    offers = add_groups(offers)
    if apply_quality_filters:
        return apply_query_quality_filters(offers, queries)
    return offers


def main() -> None:
    parser = argparse.ArgumentParser(description='Search nearby offers from the local SQLite DB instead of live fetching prices per user request.')
    parser.add_argument('db')
    parser.add_argument('--address', required=True)
    parser.add_argument('--radius-km', type=float, default=3.0)
    parser.add_argument('--max-walk-km', type=float)
    parser.add_argument('--max-transit-min', type=float)
    parser.add_argument('--query', action='append', required=True)
    parser.add_argument('--all-chains', action='store_true', help='Do not filter offers by nearby chains; use address only for place/distance context')
    parser.add_argument('--skip-quality-filters', action='store_true', help='Return raw matching DB rows without per-query ambiguity pruning')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    lat, lon, resolved = geocode(args.address)

    places = []
    chains = []
    nearby_error = None
    try:
        places = nearby_places(lat, lon, args.radius_km)
        if not args.all_chains:
            places = apply_access_filters(places, lat, lon, args.max_walk_km, args.max_transit_min)
        chains = dedupe_chains(places)
    except BaseException as exc:
        nearby_error = str(exc)

    offers = load_matching_offers(
        args.db,
        [] if args.all_chains else chains,
        args.query,
        apply_quality_filters=not args.skip_quality_filters,
    )

    payload = {
        'address': args.address,
        'resolvedAddress': resolved,
        'radiusKm': args.radius_km,
        'maxWalkKm': args.max_walk_km,
        'maxTransitMin': args.max_transit_min,
        'lat': lat,
        'lon': lon,
        'chains': chains,
        'places': places,
        'dbOfferCount': len(offers),
        'offers': offers,
        'summary': build_summary(offers),
    }
    if nearby_error:
        payload['nearbyError'] = nearby_error

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None))
    else:
        print(f"Address: {resolved}")
        print(f"Chains: {', '.join(chains)}")
        print(f"DB offers: {len(offers)}")


if __name__ == '__main__':
    main()

