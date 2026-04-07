#!/usr/bin/env python3
"""
salling_collect_dk.py

Salling Group API collector — fallback price source when no pamphlet offer exists.

API: https://developer.sallinggroup.com (new portal: developer.sallinggroup.dev)
Token: register at the developer portal, then set env var SALLING_API_TOKEN.

Endpoint used:
  GET https://api.sallinggroup.com/v1-beta/product-suggestions/relevant-products?query={term}

Returns BilkaToGo catalog (everyday) prices. These are NOT promotional prices —
they are the regular shelf price. Tag them source='salling_api' so the UI can
distinguish them from offer prices.

Usage as fallback:
  Call salling_fallback_for_missing(merged_offers, queries) after the main
  collect/merge pipeline. It adds Salling results only for query families
  that returned zero offers from other sources.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


SALLING_API_BASE = 'https://api.sallinggroup.com'
SUGGESTIONS_ENDPOINT = '/v1-beta/product-suggestions/relevant-products'


def _get_token() -> Optional[str]:
    token = os.environ.get('SALLING_API_TOKEN', '').strip()
    return token if token else None


def _fetch_suggestions(query: str, token: str) -> List[Dict[str, Any]]:
    url = SALLING_API_BASE + SUGGESTIONS_ENDPOINT + '?' + urllib.parse.urlencode({'query': query})
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
        'User-Agent': 'meal-optimizer/1.0',
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    # Response shape: {"suggestions": [...]}
    return data.get('suggestions', []) if isinstance(data, dict) else []


def _normalize_suggestion(item: Dict[str, Any], query: str) -> Dict[str, Any]:
    """Convert a Salling API suggestion to the same shape as other collectors."""
    price = item.get('price')
    title = item.get('title') or item.get('description') or ''
    description = item.get('description') or ''
    size_text = None

    # Try to extract size from title/description (e.g. "Broccoli 500 g")
    import re
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b', title + ' ' + description, re.I)
    if m:
        size_text = f'{m.group(1)} {m.group(2).lower()}'

    return {
        'source': 'salling_api',
        'sourceKind': 'salling-catalog',
        'query': query,
        'store': 'BilkaToGo',
        'storeNormalized': 'bilka',
        'productName': title,
        'description': description or None,
        'price': price,
        'effectivePrice': price,
        'effectivePriceKind': 'catalog',   # not a promotional price
        'appPrice': None,
        'membershipPrice': None,
        'currency': 'DKK',
        'sizeText': size_text,
        'sizeGramsMin': None,
        'sizeGramsMax': None,
        'unitPrice': None,
        'unitPriceMin': None,
        'unitPriceMax': None,
        'unitPriceUnit': None,
        'offerStartDate': None,
        'offerEndDate': None,
        'offerState': 'catalog',           # special state — not a time-limited offer
        'productUrl': item.get('link'),
        'comparisonGroup': None,
        'comparisonLabel': None,
        'normalizedAttributes': {},
        'sallingProdId': item.get('prod_id'),
    }


def collect(query: str) -> List[Dict[str, Any]]:
    """
    Fetch Salling Group catalog prices for a query term.
    Returns empty list if SALLING_API_TOKEN is not set (non-fatal).
    """
    token = _get_token()
    if not token:
        print(
            '[salling_collect_dk] SALLING_API_TOKEN not set — skipping Salling API. '
            'Register at developer.sallinggroup.dev to get a free token.',
            file=sys.stderr,
        )
        return []

    try:
        suggestions = _fetch_suggestions(query, token)
    except Exception as exc:
        print(f'[salling_collect_dk] API call failed for "{query}": {exc}', file=sys.stderr)
        return []

    return [_normalize_suggestion(item, query) for item in suggestions if item.get('price') is not None]


def salling_fallback_for_missing(
    merged_offers: List[Dict[str, Any]],
    queries: List[str],
) -> List[Dict[str, Any]]:
    """
    Called after the main pipeline merge.
    For each query that has zero results in merged_offers, fetch Salling API prices
    and append them, tagged as source='salling_api'.

    This means Salling prices only appear when nothing else was found —
    they never displace actual offer prices.
    """
    from ingredient_catalog_dk import normalize_text  # noqa: PLC0415

    # Count offers per query family
    covered_queries = set()
    for offer in merged_offers:
        q = normalize_text(offer.get('query') or '')
        if q:
            covered_queries.add(q)

    extra: List[Dict[str, Any]] = []
    for query in queries:
        q_norm = normalize_text(query)
        if q_norm in covered_queries:
            continue  # already have results for this query
        print(f'[salling_collect_dk] No offers found for "{query}" — trying Salling API fallback', file=sys.stderr)
        salling_results = collect(query)
        if salling_results:
            print(f'[salling_collect_dk] Got {len(salling_results)} catalog prices for "{query}" from Salling API', file=sys.stderr)
        extra.extend(salling_results)

    return merged_offers + extra


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description='Fetch BilkaToGo catalog prices via Salling Group API as fallback.')
    parser.add_argument('queries', nargs='+', help='Search terms, e.g. "broccoli" "hakket oksekød"')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    all_results = []
    for query in args.queries:
        results = collect(query)
        all_results.extend(results)
        print(f'[salling_collect_dk] {query}: {len(results)} results', file=sys.stderr)

    json.dump(all_results, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
