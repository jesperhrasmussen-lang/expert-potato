#!/usr/bin/env python3
import argparse
import json
import os
import tempfile
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, Dict, List, Tuple

from direct_chain_collect_dk import collect_chain, normalize_chain
from etilbudsavis_collect import collect as et_collect
from nearby_offer_db import upsert_offers
from ingredient_catalog_dk import infer_attributes, query_to_family
from nearby_offer_report import infer_group, build_summary, render_text

USER_AGENT = 'meal-optimizer/1.0 (nearby-offers-dk)'
OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
OSRM_FOOT_URLS = [
    'https://router.project-osrm.org/route/v1/foot',
]


def fetch_json(url: str, data: bytes = None, headers: Dict[str, str] = None) -> Any:
    hdrs = {'User-Agent': USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode('utf-8', 'ignore'))


def geocode(address: str) -> Tuple[float, float, str]:
    attempts = [
        {'q': address, 'format': 'jsonv2', 'limit': 1, 'countrycodes': 'dk'},
        {'q': address, 'format': 'jsonv2', 'limit': 1},
        {'q': address.replace('København S', 'Kobenhavn S').replace('København', 'Kobenhavn'), 'format': 'jsonv2', 'limit': 1},
        {'q': address.replace('Tingvej 4A, 2300 København S', 'Tingvej 4A, 2300 Kobenhavn S, Denmark'), 'format': 'jsonv2', 'limit': 1},
        {'q': 'Tingvej, 2300 Copenhagen, Denmark', 'format': 'jsonv2', 'limit': 1},
    ]
    for params in attempts:
        qs = urllib.parse.urlencode(params)
        data = fetch_json(f'{NOMINATIM_URL}?{qs}')
        if data:
            row = data[0]
            return float(row['lat']), float(row['lon']), row.get('display_name') or address
    raise SystemExit(f'Could not geocode address: {address}')


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def walking_distance_km(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> Tuple[float, str]:
    coords = f'{origin_lon},{origin_lat};{dest_lon},{dest_lat}'
    last_error = None
    for base in OSRM_FOOT_URLS:
        url = f'{base}/{coords}?overview=false&steps=false'
        try:
            data = fetch_json(url)
            routes = data.get('routes') or []
            if routes:
                return round((routes[0].get('distance') or 0) / 1000, 3), 'osrm-foot'
        except Exception as e:
            last_error = e
            continue
    return round(haversine_km(origin_lat, origin_lon, dest_lat, dest_lon), 3), 'haversine-fallback'


def nearby_places(lat: float, lon: float, radius_km: float) -> List[Dict[str, Any]]:
    radius_m = int(radius_km * 1000)
    query = f'''
    [out:json][timeout:25];
    (
      node["shop"="supermarket"](around:{radius_m},{lat},{lon});
      way["shop"="supermarket"](around:{radius_m},{lat},{lon});
    );
    out center tags;
    '''
    last_error = None
    data = None
    for url in OVERPASS_URLS:
        try:
            data = fetch_json(url, data=query.encode('utf-8'), headers={'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'})
            break
        except Exception as e:
            last_error = e
            continue
    if data is None:
        raise SystemExit(f'Could not fetch nearby places: {last_error}')
    rows = []
    for el in data.get('elements', []):
        tags = el.get('tags') or {}
        name = tags.get('name') or tags.get('brand') or 'Unknown'
        el_lat = el.get('lat', (el.get('center') or {}).get('lat'))
        el_lon = el.get('lon', (el.get('center') or {}).get('lon'))
        if el_lat is None or el_lon is None:
            continue
        distance = haversine_km(lat, lon, float(el_lat), float(el_lon))
        rows.append({
            'name': name,
            'brand': tags.get('brand'),
            'address': ', '.join([tags.get('addr:street',''), tags.get('addr:housenumber',''), tags.get('addr:postcode',''), tags.get('addr:city','')]).replace(' ,', '').strip(', '),
            'lat': float(el_lat),
            'lon': float(el_lon),
            'distanceKm': round(distance, 3),
        })
    rows.sort(key=lambda x: x['distanceKm'])
    return rows


def apply_access_filters(places: List[Dict[str, Any]], origin_lat: float, origin_lon: float, max_walk_km: float = None, max_transit_min: int = None) -> List[Dict[str, Any]]:
    rows = list(places)

    if max_walk_km is not None:
        filtered = []
        for place in rows:
            walk_km, source = walking_distance_km(origin_lat, origin_lon, place['lat'], place['lon'])
            place = dict(place)
            place['walkDistanceKm'] = walk_km
            place['walkDistanceSource'] = source
            if walk_km <= max_walk_km:
                filtered.append(place)
        rows = filtered

    if max_transit_min is not None:
        access_id = os.environ.get('REJSEPLANEN_ACCESS_ID')
        if not access_id:
            raise SystemExit('Public transport filtering requires REJSEPLANEN_ACCESS_ID. Walking filter works now; transit filter is gated on Rejseplanen access.')
        raise SystemExit('Transit backend hook is recognized, but the concrete Rejseplanen journey integration still needs to be wired and tested with a real accessId.')

    return rows


def dedupe_chains(places: List[Dict[str, Any]]) -> List[str]:
    seen = []
    used = set()
    for place in places:
        chain = normalize_chain(place.get('brand') or place.get('name') or '')
        if not chain or chain in used:
            continue
        used.add(chain)
        seen.append(chain)
    return seen


def add_groups(offers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for offer in offers:
        row = dict(offer)
        group, label = infer_group(row.get('productName'), row.get('description'), row.get('query'))
        row['comparisonGroup'] = group
        row['comparisonLabel'] = label
        row['normalizedAttributes'] = infer_attributes(row.get('productName'), row.get('description'), group)
        out.append(row)
    return out


def direct_collect(chains: List[str], queries: List[str]) -> List[Dict[str, Any]]:
    offers = []
    for query in queries:
        for chain in chains:
            offers.extend(collect_chain(chain, query))
    return offers


def fallback_collect(chains: List[str], queries: List[str]) -> List[Dict[str, Any]]:
    offers = []
    vegetable_families = {'broccoli', 'cauliflower', 'white-cabbage', 'red-cabbage'}
    for query in queries:
        payload = et_collect(query, include_business_products=query_to_family(query) in vegetable_families)
        for offer in payload.get('offers', []):
            if normalize_chain(offer.get('storeNormalized') or offer.get('store') or '') in chains:
                offers.append(offer)
    return offers


def dedupe_offers(offers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for offer in offers:
        family = infer_group(offer.get('productName'), offer.get('description'), offer.get('query'))[0]
        key = (
            normalize_chain(offer.get('storeNormalized') or offer.get('store') or ''),
            family,
            offer.get('productName'),
            offer.get('sizeText'),
            offer.get('effectivePrice') if offer.get('effectivePrice') is not None else offer.get('price'),
            offer.get('sourceKind'),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(offer)
    return out


def merge_offers(direct_offers: List[Dict[str, Any]], fallback_offers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    direct_keys = defaultdict(set)
    for offer in direct_offers:
        family = infer_group(offer.get('productName'), offer.get('description'), offer.get('query'))[0]
        chain = normalize_chain(offer.get('storeNormalized') or offer.get('store') or '')
        direct_keys[chain].add(family)

    merged = list(direct_offers)
    for offer in fallback_offers:
        family = infer_group(offer.get('productName'), offer.get('description'), offer.get('query'))[0]
        chain = normalize_chain(offer.get('storeNormalized') or offer.get('store') or '')
        if family in direct_keys.get(chain, set()):
            continue
        merged.append(offer)
    return dedupe_offers(merged)


def payload_from_offers(offers: List[Dict[str, Any]], query: str = 'multiple') -> Dict[str, Any]:
    return {
        'source': 'nearby-offers-pipeline',
        'query': query,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'offerCount': len(offers),
        'offers': offers,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='End-to-end nearby Danish supermarket offer pipeline: geocode -> nearby stores -> direct chain routing -> fallback -> DB -> report.')
    parser.add_argument('--address', required=True)
    parser.add_argument('--radius-km', type=float, default=3.0)
    parser.add_argument('--query', action='append', required=True, help='Repeat for each product family')
    parser.add_argument('--max-walk-km', type=float, help='Optional maximum walking distance filter after nearby discovery')
    parser.add_argument('--max-transit-min', type=int, help='Optional maximum public transport time filter (requires transit backend access)')
    parser.add_argument('--db', help='Optional SQLite database path for ingest/prune')
    parser.add_argument('--json', action='store_true', help='Emit JSON instead of text')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    lat, lon, display_name = geocode(args.address)
    places = nearby_places(lat, lon, args.radius_km)
    places = apply_access_filters(places, lat, lon, max_walk_km=args.max_walk_km, max_transit_min=args.max_transit_min)
    chains = dedupe_chains(places)

    direct = direct_collect(chains, args.query)
    fallback = fallback_collect(chains, args.query)
    merged = add_groups(merge_offers(direct, fallback))

    payload = {
        'address': args.address,
        'resolvedAddress': display_name,
        'radiusKm': args.radius_km,
        'maxWalkKm': args.max_walk_km,
        'maxTransitMin': args.max_transit_min,
        'lat': lat,
        'lon': lon,
        'chains': chains,
        'places': places,
        'directOfferCount': len(direct),
        'fallbackOfferCount': len(fallback),
        'mergedOfferCount': len(merged),
        'offers': merged,
        'summary': build_summary(merged),
    }

    if args.db:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as fh:
            json.dump(payload_from_offers(merged), fh, ensure_ascii=False, indent=2)
            temp_path = fh.name
        upsert_offers(args.db, [temp_path])

    if args.json:
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
        sys.stdout.write('\n')
    else:
        access_bits = [f'Radius: {args.radius_km} km']
        if args.max_walk_km is not None:
            access_bits.append(f'Max walk: {args.max_walk_km} km')
        if args.max_transit_min is not None:
            access_bits.append(f'Max transit: {args.max_transit_min} min')
        lines = [
            f'Address: {display_name}',
            ' | '.join(access_bits),
            f'Chains: {", ".join(chains) or "-"}',
            f'Direct offers: {len(direct)} | fallback offers: {len(fallback)} | merged: {len(merged)}',
            '',
            render_text(payload['summary']),
        ]
        print('\n'.join(lines))


if __name__ == '__main__':
    import sys
    main()

