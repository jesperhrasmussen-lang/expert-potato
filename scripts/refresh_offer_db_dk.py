#!/usr/bin/env python3
import argparse
import json
import tempfile
from pathlib import Path
from typing import List

from find_nearby_offers_dk import add_groups, direct_collect, fallback_collect, merge_offers, payload_from_offers
from nearby_offer_db import show_counts, upsert_offers

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


def refresh_offer_db(db_path: str, queries: List[str], chains: List[str]) -> dict:
    direct = direct_collect(chains, queries)
    fallback = fallback_collect(chains, queries)
    merged = add_groups(merge_offers(direct, fallback))

    # --- Salling API fallback for zero-result ingredient families ---
    # For any query that produced no offers at all, try the Salling Group
    # product suggestions API (BilkaToGo catalog prices — real prices, not guesses).
    # Requires SALLING_API_TOKEN env var. Gracefully skipped if token is absent.
    try:
        from salling_collect_dk import salling_fallback_for_missing  # noqa: PLC0415
        merged = salling_fallback_for_missing(merged, queries)
    except ImportError:
        pass  # salling_collect_dk not yet available — skip silently
    except Exception as exc:  # noqa: BLE001
        import sys
        print(f'[refresh_offer_db] Salling fallback error (non-fatal): {exc}', file=sys.stderr)

    payload = payload_from_offers(merged, query='multiple')

    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        temp_path = fh.name

    upsert_offers(db_path, [temp_path])

    return {
        'db': db_path,
        'queries': queries,
        'chains': chains,
        'directOfferCount': len(direct),
        'fallbackOfferCount': len(fallback),
        'mergedOfferCount': len(merged),
        'tempPayload': temp_path,
    }


def load_queries(cli_queries: List[str]) -> List[str]:
    if cli_queries:
        return cli_queries
    if DEFAULT_QUERY_FILE.exists():
        return json.loads(DEFAULT_QUERY_FILE.read_text(encoding='utf-8'))
    raise SystemExit('No queries provided and no default tracked query file found.')


def main() -> None:
    parser = argparse.ArgumentParser(description='Refresh the local nearby-offers SQLite DB from direct sources plus fallback enrichment.')
    parser.add_argument('db')
    parser.add_argument('--query', action='append', default=[], help='Repeat for each tracked product query')
    parser.add_argument('--chain', action='append', default=[], help='Optional explicit chains')
    parser.add_argument('--reset', action='store_true', help='Delete and recreate the DB before refreshing')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    queries = load_queries(args.query)
    chains = args.chain or DEFAULT_CHAINS

    db_path = Path(args.db)
    if args.reset and db_path.exists():
        db_path.unlink()

    result = refresh_offer_db(args.db, queries, chains)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    else:
        print(f"DB refreshed: {args.db}")
        print(f"Queries: {', '.join(queries)}")
        print(f"Chains: {', '.join(chains)}")
        print(
            f"Direct: {result['directOfferCount']} | fallback: {result['fallbackOfferCount']} | merged: {result['mergedOfferCount']}"
        )
        show_counts(args.db)


if __name__ == '__main__':
    main()
