#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description='Show basic health/status for the Nearby Offers SQLite DB.')
    parser.add_argument('db')
    args = parser.parse_args()

    db_path = Path(args.db)
    result = {
        'db': str(db_path),
        'exists': db_path.exists(),
    }

    if not db_path.exists():
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute('SELECT COUNT(*) AS count FROM chains')
        result['chains'] = cur.fetchone()['count']

        cur.execute('SELECT COUNT(*) AS count FROM offers')
        result['offers'] = cur.fetchone()['count']

        cur.execute('SELECT COUNT(*) AS count FROM offer_observations')
        result['observations'] = cur.fetchone()['count']

        cur.execute('SELECT MAX(last_seen_at) AS value FROM offers')
        result['last_seen_at'] = cur.fetchone()['value']

        cur.execute(
            '''
            SELECT query_family, COUNT(*) AS count
            FROM offers
            GROUP BY query_family
            ORDER BY count DESC, query_family ASC
            '''
        )
        result['query_families'] = [dict(row) for row in cur.fetchall()]

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

