#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from direct_chain_collect_dk import normalize_chain
from find_nearby_offers_dk import direct_collect, fallback_collect
from ingredient_catalog_dk import family_label, query_to_family

# FIX: added 'kvickly' — was missing from original list
DEFAULT_CHAINS = [
    'lidl',
    'netto',
    'rema 1000',
    'brugsen',
    'superbrugsen',
    'kvickly',           # <-- added
    '365discount',
    'foetex',
    'meny',
    'bilka',
]
DEFAULT_QUERY_FILE = Path(__file__).resolve().parent.parent / 'projects' / 'nearby-offers-webapp' / 'tracked-queries-v1.json'


def load_queries(cli_queries: List[str]) -> List[str]:
    if cli_queries:
        return cli_queries
    return json.loads(DEFAULT_QUERY_FILE.read_text(encoding='utf-8'))


def summarize_rows(rows: List[Dict[str, Any]], limit: int = 5) -> Dict[str, Any]:
    return {
        'count': len(rows),
        'chains': sorted({normalize_chain(r.get('storeNormalized') or r.get('store') or '') for r in rows if r.get('store') or r.get('storeNormalized')}),
        'samples': [
            {
                'chain': normalize_chain(r.get('storeNormalized') or r.get('store') or ''),
                'productName': r.get('productName'),
                'comparisonGroup': r.get('comparisonGroup'),
                'sizeText': r.get('sizeText'),
                'price': r.get('effectivePrice') if r.get('effectivePrice') is not None else r.get('price'),
            }
            for r in rows[:limit]
        ],
    }


def audit_queries(queries: List[str], chains: List[str]) -> Dict[str, Any]:
    rows = []
    for query in queries:
        family = query_to_family(query)
        direct_error = None
        fallback_error = None
        direct_rows: List[Dict[str, Any]] = []
        fallback_rows: List[Dict[str, Any]] = []

        try:
            direct_rows = direct_collect(chains, [query])
        except Exception as exc:  # noqa: BLE001
            direct_error = str(exc)

        try:
            fallback_rows = fallback_collect(chains, [query])
        except Exception as exc:  # noqa: BLE001
            fallback_error = str(exc)

        rows.append(
            {
                'query': query,
                'family': family,
                'familyLabel': family_label(family) if family else query,
                'direct': summarize_rows(direct_rows),
                'fallback': summarize_rows(fallback_rows),
                'directError': direct_error,
                'fallbackError': fallback_error,
            }
        )

    return {
        'chains': chains,
        'queries': queries,
        'rows': rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Audit direct/fallback ingredient coverage for the meal-optimizer tracked query set.')
    parser.add_argument('--query', action='append', default=[])
    parser.add_argument('--chain', action='append', default=[])
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    queries = load_queries(args.query)
    chains = [normalize_chain(chain) for chain in (args.chain or DEFAULT_CHAINS)]

    payload = audit_queries(queries, chains)
    json.dump(payload, fp=__import__('sys').stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    __import__('sys').stdout.write('\n')


if __name__ == '__main__':
    main()
