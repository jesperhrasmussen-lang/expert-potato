# Claude Code Handoff - Nearby Offers / Meal Optimizer
# Version: April 2026

## What this project is

A Next.js frontend + Python backend for a Danish meal optimizer app. Users enter an
address and the app finds the 5 cheapest meals they can cook based on current
supermarket offers nearby.

## Meal model

Three interchangeable ingredient slots per meal:
- meat: hakket oksekød / hakket svinekød / hakket kalv og flæsk
- vegetable: broccoli / blomkål / hvidkål / rødkål
- dairy: piskefløde / creme fraiche / skyr

## Business rules

- Chain pamphlets apply chain-wide regardless of branch location
- User address is for nearest-branch distance annotation only, not offer eligibility
- Show 5 cheapest meals
- Show full basket cost + prorated recipe cost + leftovers
- ml and grams treated 1:1 in V1
- App can use one store or a practical two-store combination

## Architecture

```
Next.js frontend (Vercel)
  └── /api/meal-search → meal-search-service.ts → search_offer_db_dk.py
  └── /api/search      → pipeline-search.ts     → find_nearby_offers_dk.py

Python pipeline (Hostinger VPS, runs on cron)
  refresh_offer_db_dk.py
    ├── direct_collect()   → direct_chain_collect_dk.py
    │     ├── Lidl         → Schwarz flyer API
    │     ├── Netto/Rema/Brugsen/SuperBrugsen/365discount → Tjek API (squid-api.tjek.com)
    │     ├── Føtex        → iPaper HTML scrape
    │     └── Meny         → iPaper HTML scrape
    ├── fallback_collect() → etilbudsavis_collect.py (Tjek search API, paginated)
    └── salling_fallback() → salling_collect_dk.py (BilkaToGo catalog, zero-result fallback)
  → nearby_offer_db.py (SQLite write)

DB: SQLite on VPS (migration to Postgres planned, schema in meal-optimizer-v1.sql)
```

## Current state

- Frontend meal flow exists and works end-to-end
- DB-backed meal engine exists
- Offer refresh/scrape pipeline exists
- Main challenge: data coverage quality, not missing structure

## What was just fixed (do not redo)

1. **etilbudsavis_collect.py** — pagination fix. Old code fetched offset=0&limit=24 only,
   silently dropping results beyond 24. Now loops offset+=24 until page < PAGE_LIMIT.
   This was the root cause of the Bilka broccoli miss.

2. **refresh_offer_db_dk.py** — added 'kvickly' to DEFAULT_CHAINS (was missing).
   Wired salling_fallback_for_missing() after main merge (non-fatal if token absent).

3. **audit_meal_ingredient_coverage_dk.py** — added 'kvickly' to DEFAULT_CHAINS.

4. **salling_collect_dk.py** — NEW file. Uses Salling Group API to fetch BilkaToGo
   catalog prices as fallback when an ingredient has zero offer results from other sources.
   Requires SALLING_API_TOKEN env var. Token: register free at developer.sallinggroup.dev
   (if portal is broken, email apisupport@sallinggroup.com).

## What to do first

1. Recreate all files below by path
2. Run: `python3 scripts/etilbudsavis_collect.py "broccoli" --pretty`
   — verify you get results from multiple chains
3. Run: `python3 scripts/audit_meal_ingredient_coverage_dk.py --pretty`
   — verify kvickly appears in chain list and coverage looks reasonable
4. Continue from there

## Deployment

- Frontend: GitHub → Vercel (auto-deploy)
- Backend scripts: Hostinger VPS, cron via nearby-offers-refresh.cron
- DB: SQLite on VPS (path: /data/.openclaw/workspace/projects/nearby-offers-webapp/data/nearby-offers.db)
- Postgres schema ready (meal-optimizer-v1.sql) but migration not yet done

## Environment variables needed on VPS

- SALLING_API_TOKEN — Salling Group API token (optional but recommended)
- REJSEPLANEN_ACCESS_ID — public transport filtering (not yet implemented, skip for now)

---

## File: `scripts/ingredient_catalog_dk.py`

````python
#!/usr/bin/env python3
import re
import unicodedata
from typing import Any, Dict, Iterable, Optional, Tuple


FAMILY_DEFS: Dict[str, Dict[str, Any]] = {
    'minced-beef': {
        'label': 'Hakket oksekød',
        'queries': ['hakket oksekød'],
    },
    'minced-pork': {
        'label': 'Hakket svinekød',
        'queries': ['hakket svinekød'],
    },
    'minced-veal-pork': {
        'label': 'Hakket kalv og flæsk',
        'queries': ['hakket kalv og flæsk', 'hakket kalv/flæsk', 'hakket grisekalvekød', 'hakket grise kalvekød'],
    },
    'broccoli': {
        'label': 'Broccoli',
        'queries': ['broccoli'],
    },
    'cauliflower': {
        'label': 'Blomkål',
        'queries': ['blomkål'],
    },
    'white-cabbage': {
        'label': 'Hvidkål',
        'queries': ['hvidkål'],
    },
    'red-cabbage': {
        'label': 'Rødkål',
        'queries': ['rødkål'],
    },
    'heavy-cream': {
        'label': 'Piskefløde',
        'queries': ['piskefløde'],
    },
    'creme-fraiche': {
        'label': 'Crème fraîche',
        'queries': ['creme fraiche', 'crème fraîche'],
    },
    'skyr': {
        'label': 'Skyr',
        'queries': ['skyr'],
    },
}

VEGETABLE_FAMILIES = {'broccoli', 'cauliflower', 'white-cabbage', 'red-cabbage'}
DAIRY_FAMILIES = {'heavy-cream', 'creme-fraiche', 'skyr'}
MEAT_FAMILIES = {'minced-beef', 'minced-pork', 'minced-veal-pork'}


def clean_text(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalize_text(value: Any) -> str:
    text = clean_text(value).lower()
    text = text.replace('æ', 'ae').replace('ø', 'oe').replace('å', 'aa')
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def family_label(family: str) -> str:
    return FAMILY_DEFS.get(family, {}).get('label') or family


def query_to_family(query: Any) -> Optional[str]:
    q = normalize_text(query)
    if not q:
        return None
    for family, meta in FAMILY_DEFS.items():
        for alias in meta.get('queries', []):
            if q == normalize_text(alias):
                return family
    return None


def _contains_any(text: str, tokens: Iterable[str]) -> bool:
    return any(token in text for token in tokens)


def text_matches_family(text: Any, family: str) -> bool:
    low = normalize_text(text)
    if not low:
        return False
    if family == 'minced-beef':
        return 'hakket' in low and 'okse' in low and 'kalv' not in low and 'svin' not in low and 'gris' not in low and 'flaesk' not in low
    if family == 'minced-pork':
        return 'hakket' in low and ('svin' in low or 'svine' in low or 'grise' in low or 'gris' in low)
    if family == 'minced-veal-pork':
        return ('hakket' in low and (('kalv' in low and ('flaesk' in low or 'svin' in low)) or 'grisekalve' in low or 'grise kalve' in low))
    if family == 'broccoli':
        return 'broccoli' in low
    if family == 'cauliflower':
        return 'blomkaal' in low
    if family == 'white-cabbage':
        return 'hvidkaal' in low
    if family == 'red-cabbage':
        return 'roedkaal' in low
    if family == 'heavy-cream':
        return 'piskefloede' in low
    if family == 'creme-fraiche':
        return 'creme fraiche' in low or 'cremefraiche' in low
    if family == 'skyr':
        return 'skyr' in low
    return False


def infer_family(product_name: Any, description: Any = None, query: Any = None) -> Optional[str]:
    query_family = query_to_family(query)
    text = ' '.join(x for x in [normalize_text(product_name), normalize_text(description)] if x)
    if query_family and text_matches_family(text, query_family):
        return query_family
    for family in FAMILY_DEFS.keys():
        if text_matches_family(text, family):
            return family
    return query_family


def is_textually_ambiguous(product_name: Any, description: Any, family: str) -> bool:
    text = f" {normalize_text(product_name)} {normalize_text(description)} "
    if ' eller ' in text and family in MEAT_FAMILIES:
        return True
    if family == 'minced-beef':
        return _contains_any(text, [' kalv ', ' flaesk ', ' svin ', ' gris '])
    if family == 'minced-pork':
        return _contains_any(text, [' okse ', ' kalv '])
    if family == 'minced-veal-pork':
        return ' okse ' in text
    vegetable_exclusions = ['wokmix', 'blanding', 'salat', 'coleslaw', 'suppe', 'pizza', 'lasagne', 'gratin', 'babymos', 'kapsler', 'cleanse', 'shampoo', 'conditioner', 'bodyscrub', 'spiring']
    if family == 'red-cabbage':
        return _contains_any(text, [' syltet ', ' glas ', ' paa glas ', ' roedkaal paa glas ']) or _contains_any(text, vegetable_exclusions)
    if family in VEGETABLE_FAMILIES:
        return _contains_any(text, vegetable_exclusions)
    return False


def infer_attributes(product_name: Any, description: Any, family: Optional[str]) -> Dict[str, str]:
    if not family:
        return {}
    text = f" {normalize_text(product_name)} {normalize_text(description)} "
    attrs: Dict[str, str] = {}
    if family in VEGETABLE_FAMILIES:
        if _contains_any(text, [' frost ', ' frossen ', ' frozen ']):
            attrs['temperatureState'] = 'frozen'
        else:
            attrs['temperatureState'] = 'fresh'
        if _contains_any(text, ['buketter', 'buket', 'snittet', 'strimlet', 'tern', 'skiver', 'chopped', 'florets', 'ris']):
            attrs['cutState'] = 'chopped'
        else:
            attrs['cutState'] = 'whole'
        if family == 'white-cabbage':
            attrs['cabbageVariant'] = 'white'
        if family == 'red-cabbage':
            attrs['cabbageVariant'] = 'red'
    return attrs


def infer_group(product_name: Any, description: Any, query: Any) -> Tuple[str, str]:
    family = infer_family(product_name, description, query)
    if not family:
        return 'other', 'Andet'
    return family, family_label(family)


def is_relevant_for_query(product_name: Any, description: Any, query: Any) -> bool:
    family = query_to_family(query)
    text = f"{clean_text(product_name)} {clean_text(description)}"
    if family:
        return text_matches_family(text, family) and not is_textually_ambiguous(product_name, description, family)
    q = normalize_text(query)
    hay = normalize_text(text)
    return all(token in hay for token in q.split())


def query_families_from_queries(queries: Iterable[str]) -> Dict[str, Optional[str]]:
    return {str(query): query_to_family(query) for query in queries}
````

## File: `scripts/etilbudsavis_collect.py`

````python
#!/usr/bin/env python3
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from ingredient_catalog_dk import (
    infer_attributes,
    infer_group,
    is_relevant_for_query,
    normalize_text,
    query_to_family,
    text_matches_family,
)


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; meal-optimizer/1.0)',
        'Accept-Language': 'da-DK,da;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='replace')


def fetch_json(url: str, *, params: Optional[Dict[str, str]] = None) -> Any:
    if params:
        url = url + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; meal-optimizer/1.0)',
        'Accept': 'application/json',
        'Accept-Language': 'da-DK,da;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def extract_app_data(html_text: str) -> List[Dict[str, Any]]:
    blobs = []
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html_text, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            blobs.append({'source': '__NEXT_DATA__', 'payload': data})
        except json.JSONDecodeError:
            pass
    for chunk_match in re.finditer(r'self\.__next_f\.push\(\[.*?\]\)', html_text, re.DOTALL):
        raw = chunk_match.group(0)
        inner = re.search(r'\[1,"(.+?)"\]\)', raw, re.DOTALL)
        if not inner:
            continue
        try:
            text = inner.group(1).encode('utf-8').decode('unicode_escape')
        except Exception:
            text = inner.group(1)
        for json_match in re.finditer(r'\{[^{}]{20,}\}', text):
            try:
                obj = json.loads(json_match.group(0))
                if isinstance(obj, dict) and 'data' in obj:
                    blobs.append({'source': 'rsc_chunk', 'payload': obj})
            except json.JSONDecodeError:
                pass
    return blobs


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = value.strip()
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S.%f%z'):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    return None


def state_for_offer(valid_from: Optional[str], valid_until: Optional[str], now: datetime) -> str:
    start = parse_dt(valid_from)
    end = parse_dt(valid_until)
    if start and now < start:
        return 'upcoming'
    if end and now > end:
        return 'expired'
    if start or end:
        return 'active'
    return 'undated'


def clean_text(value: Any) -> str:
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def normalize_store_name(value: str) -> str:
    text = clean_text(value).lower()
    text = text.replace('æ', 'ae').replace('ø', 'oe').replace('å', 'aa')
    text = text.replace('&', ' and ')
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    aliases = {
        'rema1000': 'rema 1000',
        'rema': 'rema 1000',
        'fotex': 'foetex',
        'meny amager': 'meny',
        'super brugsen': 'superbrugsen',
        'min koebmand': 'min koebmand',
        '365 discount': '365discount',
    }
    return aliases.get(text, text)


def offer_url(offer: Dict[str, Any]) -> Optional[str]:
    business = ((offer.get('business') or {}).get('slugs') or [None])[0]
    publication = offer.get('publicationPublicId')
    public_id = offer.get('publicId')
    if business and publication and public_id:
        return f'https://etilbudsavis.dk/{business}?publication={publication}&offer={public_id}'
    business_name = clean_text((offer.get('business') or {}).get('name'))
    if business_name and public_id:
        slug = business_name.replace(' ', '-')
        return f'https://etilbudsavis.dk/{urllib.parse.quote(slug)}?offer={public_id}'
    return None


def build_size_text(offer: Dict[str, Any]) -> Optional[str]:
    unit_from = offer.get('unitSizeFrom')
    unit_to = offer.get('unitSizeTo')
    symbol = offer.get('unitSymbol')
    if unit_from is None or unit_to is None or not symbol:
        return None
    if unit_from == unit_to:
        return f'{unit_from} {symbol}'
    return f'{unit_from}-{unit_to} {symbol}'


def unit_price_range(offer: Dict[str, Any]) -> Dict[str, Any]:
    unit_price = offer.get('unitPrice')
    base_unit = offer.get('baseUnit')
    if unit_price is None:
        return {'unitPrice': None, 'unitPriceMin': None, 'unitPriceMax': None, 'unitPriceUnit': None}
    if base_unit == 'kilogram':
        return {'unitPrice': unit_price, 'unitPriceMin': unit_price, 'unitPriceMax': unit_price, 'unitPriceUnit': 'DKK/kg'}
    return {'unitPrice': unit_price, 'unitPriceMin': unit_price, 'unitPriceMax': unit_price, 'unitPriceUnit': f'DKK/{base_unit or "unit"}'}


def normalize_offer(offer: Dict[str, Any], query: str, source_kind: str, now: datetime) -> Dict[str, Any]:
    business = offer.get('business') or {}
    size_text = build_size_text(offer)
    comparison_group, comparison_label = infer_group(offer.get('name'), offer.get('description'), query)
    attributes = infer_attributes(offer.get('name'), offer.get('description'), comparison_group)
    size_min = offer.get('unitSizeFrom')
    size_max = offer.get('unitSizeTo')
    symbol = offer.get('unitSymbol')
    if symbol == 'kg':
        size_grams_min = int(round(size_min * 1000)) if size_min is not None else None
        size_grams_max = int(round(size_max * 1000)) if size_max is not None else None
    elif symbol == 'g':
        size_grams_min = int(size_min) if size_min is not None else None
        size_grams_max = int(size_max) if size_max is not None else None
    else:
        size_grams_min = None
        size_grams_max = None
    regular_price = offer.get('price')
    app_price = offer.get('appPrice')
    membership_price = offer.get('membershipPrice')
    effective_price = regular_price
    effective_price_kind = 'regular' if regular_price is not None else None
    if effective_price is None and app_price is not None:
        effective_price = app_price
        effective_price_kind = 'app'
    if effective_price is None and membership_price is not None:
        effective_price = membership_price
        effective_price_kind = 'membership'

    normalized = {
        'source': 'etilbudsavis',
        'sourceKind': source_kind,
        'query': query,
        'publicId': offer.get('publicId'),
        'store': business.get('name'),
        'storeNormalized': normalize_store_name(business.get('name') or ''),
        'productName': offer.get('name'),
        'description': clean_text(offer.get('description')) or None,
        'price': regular_price,
        'effectivePrice': effective_price,
        'effectivePriceKind': effective_price_kind,
        'currency': offer.get('currencyCode') or 'DKK',
        'appPrice': app_price,
        'membershipPrice': membership_price,
        'sizeText': size_text,
        'sizeGramsMin': size_grams_min,
        'sizeGramsMax': size_grams_max,
        'offerStartDate': offer.get('validFrom'),
        'offerEndDate': offer.get('validUntil'),
        'offerState': state_for_offer(offer.get('validFrom'), offer.get('validUntil'), now),
        'productUrl': offer_url(offer),
        'publicationPublicId': offer.get('publicationPublicId'),
        'departmentSlug': offer.get('departmentSlug'),
        'comparisonGroup': comparison_group,
        'comparisonLabel': comparison_label,
        'normalizedAttributes': attributes,
    }
    normalized.update(unit_price_range(offer))
    return normalized


# ---------------------------------------------------------------------------
# PAGINATION FIX
# Old code: single call with offset=0&limit=24 — silently dropped results >24
# New code: loop until page size < limit (signals last page)
# ---------------------------------------------------------------------------
ETILBUDSAVIS_SEARCH_API = 'https://squid-api.tjek.com/v2/offers/search'
PAGE_LIMIT = 24


def fetch_all_search_offers(query: str) -> List[Dict[str, Any]]:
    """Fetch all pages of offers for a query from the Tjek search API."""
    all_offers: List[Dict[str, Any]] = []
    offset = 0
    while True:
        params = {
            'query': query,
            'offset': str(offset),
            'limit': str(PAGE_LIMIT),
            'r_locale': 'da_DK',
        }
        try:
            page = fetch_json(ETILBUDSAVIS_SEARCH_API, params=params)
        except Exception as exc:
            print(f'[etilbudsavis_collect] API page failed (offset={offset}): {exc}', file=sys.stderr)
            break
        if not isinstance(page, list):
            break
        all_offers.extend(page)
        if len(page) < PAGE_LIMIT:
            break  # last page
        offset += PAGE_LIMIT
    return all_offers


def collect(query: str, include_business_products: bool = False, keep_expired: bool = False) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    offers: List[Dict[str, Any]] = []
    seen: set = set()

    # Primary: paginated API (catches all publication offers regardless of count)
    api_raw = fetch_all_search_offers(query)
    for item in api_raw:
        public_id = item.get('publicId')
        if public_id in seen:
            continue
        source_kind = 'publication-search' if item.get('publicationPublicId') else 'business-product-search'
        if source_kind == 'business-product-search' and not include_business_products:
            continue
        normalized = normalize_offer(item, query, source_kind, now)
        if normalized['offerState'] == 'expired' and not keep_expired:
            continue
        if not is_relevant_for_query(normalized.get('productName'), normalized.get('description'), query):
            continue
        seen.add(public_id)
        offers.append(normalized)

    # Secondary: HTML scrape for business-product results not in search API
    if include_business_products:
        encoded_query = urllib.parse.quote(query)
        url = f'https://etilbudsavis.dk/soeg/{encoded_query}'
        try:
            html_text = fetch_html(url)
            blobs = extract_app_data(html_text)
            for blob in blobs:
                payload = blob['payload']
                if not isinstance(payload, dict):
                    continue
                data = payload.get('data')
                if not isinstance(data, list) or not data:
                    continue
                if not all(isinstance(item, dict) and 'publicId' in item and 'business' in item for item in data):
                    continue
                source_kind = 'publication-search' if any(item.get('publicationPublicId') for item in data) else 'business-product-search'
                if source_kind != 'business-product-search':
                    continue
                for item in data:
                    public_id = item.get('publicId')
                    if public_id in seen:
                        continue
                    normalized = normalize_offer(item, query, source_kind, now)
                    if normalized['offerState'] == 'expired' and not keep_expired:
                        continue
                    if not is_relevant_for_query(normalized.get('productName'), normalized.get('description'), query):
                        continue
                    seen.add(public_id)
                    offers.append(normalized)
        except Exception as exc:
            print(f'[etilbudsavis_collect] HTML fallback failed: {exc}', file=sys.stderr)

    return {
        'source': 'etilbudsavis',
        'query': query,
        'generatedAt': now.isoformat(),
        'offerCount': len(offers),
        'offers': offers,
    }


# Alias used by find_nearby_offers_dk.py
def et_collect(query: str, include_business_products: bool = False, keep_expired: bool = False) -> Dict[str, Any]:
    return collect(query, include_business_products=include_business_products, keep_expired=keep_expired)


def chain_filter(offers: Iterable[Dict[str, Any]], chains: List[str]) -> List[Dict[str, Any]]:
    if not chains:
        return list(offers)
    allowed = {normalize_store_name(chain) for chain in chains}
    out = []
    for offer in offers:
        store = offer.get('storeNormalized') or normalize_store_name(offer.get('store') or '')
        if store in allowed:
            out.append(offer)
    return out


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description='Collect structured Danish supermarket offer results from eTilbudsavis.')
    parser.add_argument('queries', nargs='+', help='Search terms, e.g. "hakket oksekød"')
    parser.add_argument('--chain', action='append', default=[], help='Filter to allowed chain/store names (repeatable)')
    parser.add_argument('--include-business-products', action='store_true')
    parser.add_argument('--keep-expired', action='store_true')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    results = []
    for query in args.queries:
        result = collect(query, include_business_products=args.include_business_products, keep_expired=args.keep_expired)
        result['offers'] = chain_filter(result['offers'], args.chain)
        result['offerCount'] = len(result['offers'])
        results.append(result)

    payload = results if len(results) > 1 else results[0]
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
````

## File: `scripts/refresh_offer_db_dk.py`

````python
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
````

## File: `scripts/audit_meal_ingredient_coverage_dk.py`

````python
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
````

## File: `scripts/salling_collect_dk.py`

````python
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
````

## File: `scripts/direct_chain_collect_dk.py`

````python
#!/usr/bin/env python3
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ingredient_catalog_dk import normalize_text, query_to_family, text_matches_family

USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'

TJEK_DEALERS = {
    'netto': '9ba51',
    'rema 1000': '11deC',
    'brugsen': 'd311fg',
    'superbrugsen': '0b1e8',
    '365discount': 'DWZE1w',
}

IPAPER_URLS = {
    'foetex': 'https://avis.foetex.dk/naeste-uges-avis/uge-1516/',
    'meny': 'https://ugensavis.meny.dk/',
}


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', 'ignore')


def fetch_json(url: str) -> Any:
    return json.loads(fetch_text(url))


def clean_text(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalize_chain(value: str) -> str:
    text = normalize_text(value)
    aliases = {
        'føtex': 'foetex',
        'fotex': 'foetex',
        'rema1000': 'rema 1000',
        '365 discount': '365discount',
        'meny amager': 'meny',
        'lidl danmark': 'lidl',
    }
    return aliases.get(text, text)


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def offer_state(run_from: Optional[str], run_till: Optional[str]) -> str:
    now = datetime.now(timezone.utc)
    start = parse_dt(run_from)
    end = parse_dt(run_till)
    if start and now < start:
        return 'upcoming'
    if end and now > end:
        return 'expired'
    if start or end:
        return 'active'
    return 'undated'


def normalize_tjek_offer(offer: Dict[str, Any], query: str) -> Dict[str, Any]:
    qty = offer.get('quantity') or {}
    size = qty.get('size') or {}
    unit = qty.get('unit') or {}
    symbol = unit.get('symbol')
    size_from = size.get('from')
    size_to = size.get('to')
    if symbol == 'g':
        size_text = f"{size_from} g" if size_from == size_to else f"{size_from}-{size_to} g"
        grams_min = size_from
        grams_max = size_to
    elif symbol == 'kg':
        size_text = f"{size_from} kg" if size_from == size_to else f"{size_from}-{size_to} kg"
        grams_min = int(size_from * 1000) if size_from is not None else None
        grams_max = int(size_to * 1000) if size_to is not None else None
    else:
        size_text = None
        grams_min = None
        grams_max = None

    price = (offer.get('pricing') or {}).get('price')
    app_price = None
    desc = clean_text(offer.get('description'))
    app_match = re.search(r'App-pris\s+([0-9]+(?:[.,][0-9]+)?)', desc, re.I)
    if app_match:
        app_price = float(app_match.group(1).replace('.', '').replace(',', '.')) if ',' in app_match.group(1) else float(app_match.group(1))
        if app_price.is_integer():
            app_price = int(app_price)
    unit_price = None
    kg_match = re.search(r'(?:Pr\.|Kg-pris|kg pris|pr\. kg|max\. kg)\s*(?:kg\s*)?(?:maks\.?\s*)?([0-9]+(?:[.,][0-9]+)?)', desc, re.I)
    if kg_match:
        unit_price = float(kg_match.group(1).replace('.', '').replace(',', '.')) if ',' in kg_match.group(1) else float(kg_match.group(1))
    elif price is not None and grams_max:
        unit_price = round((price / (grams_max / 1000)), 2)

    effective_price = app_price if app_price is not None else price
    effective_price_kind = 'app' if app_price is not None else ('regular' if price is not None else None)

    return {
        'source': 'direct-chain',
        'sourceKind': 'tjek-direct',
        'query': query,
        'store': ((offer.get('dealer') or {}).get('name')),
        'storeNormalized': normalize_chain(((offer.get('dealer') or {}).get('name')) or ''),
        'productName': offer.get('heading'),
        'description': desc or None,
        'price': price,
        'effectivePrice': effective_price,
        'effectivePriceKind': effective_price_kind,
        'appPrice': app_price,
        'currency': (offer.get('pricing') or {}).get('currency') or 'DKK',
        'sizeText': size_text,
        'sizeGramsMin': grams_min,
        'sizeGramsMax': grams_max,
        'unitPrice': unit_price,
        'unitPriceMin': unit_price,
        'unitPriceMax': unit_price,
        'unitPriceUnit': 'DKK/kg' if unit_price is not None else None,
        'offerStartDate': offer.get('run_from'),
        'offerEndDate': offer.get('run_till'),
        'offerState': offer_state(offer.get('run_from'), offer.get('run_till')),
        'productUrl': None,
        'catalogPage': offer.get('catalog_page'),
    }


def collect_tjek(chain: str, query: str) -> List[Dict[str, Any]]:
    dealer_id = TJEK_DEALERS.get(chain)
    if not dealer_id:
        return []
    offers = fetch_json(f'https://squid-api.tjek.com/v2/offers?dealer_id={dealer_id}')
    out = []
    query_family = query_to_family(query)
    for offer in offers:
        text = f"{offer.get('heading','')} {offer.get('description','')}"
        if query_family and text_matches_family(text, query_family):
            out.append(normalize_tjek_offer(offer, query))
    return out


def extract_page_texts(html: str) -> List[str]:
    marker = '"pageTexts":['
    start = html.find(marker)
    if start == -1:
        return []
    i = start + len('"pageTexts":')
    depth = 0
    in_str = False
    escape = False
    out = []
    for j in range(i, len(html)):
        ch = html[j]
        out.append(ch)
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == '[':
                depth += 1
            elif ch == ']':
                depth -= 1
                if depth == 0:
                    break
    try:
        return json.loads(''.join(out))
    except json.JSONDecodeError:
        return []


def normalize_ipaper_offer(chain: str, query: str, product_name: str, price: Optional[float], size_text: Optional[str], unit_price: Optional[float], start_date: Optional[str], end_date: Optional[str], raw_text: str, effective_price: Optional[float] = None, effective_kind: Optional[str] = None) -> Dict[str, Any]:
    size_match = None
    grams_min = grams_max = None
    if size_text:
        m = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(\d+(?:[.,]\d+)?)?\s*(g|kg)', size_text, re.I)
        if m:
            a = float(m.group(1).replace(',', '.'))
            b = float(m.group(2).replace(',', '.')) if m.group(2) else a
            unit = m.group(3).lower()
            factor = 1000 if unit == 'kg' else 1
            grams_min = int(round(a * factor))
            grams_max = int(round(b * factor))
    return {
        'source': 'direct-chain',
        'sourceKind': 'ipaper-direct',
        'query': query,
        'store': chain if chain != 'foetex' else 'føtex',
        'storeNormalized': chain,
        'productName': product_name,
        'description': clean_text(raw_text),
        'price': price,
        'effectivePrice': effective_price if effective_price is not None else price,
        'effectivePriceKind': effective_kind if effective_kind is not None else ('regular' if price is not None else None),
        'appPrice': effective_price if effective_kind == 'app' else None,
        'currency': 'DKK',
        'sizeText': size_text,
        'sizeGramsMin': grams_min,
        'sizeGramsMax': grams_max,
        'unitPrice': unit_price,
        'unitPriceMin': unit_price,
        'unitPriceMax': unit_price,
        'unitPriceUnit': 'DKK/kg' if unit_price is not None else None,
        'offerStartDate': start_date,
        'offerEndDate': end_date,
        'offerState': offer_state(start_date, end_date),
        'productUrl': IPAPER_URLS.get(chain),
        'catalogPage': None,
    }


def collect_foetex(query: str) -> List[Dict[str, Any]]:
    html = fetch_text(IPAPER_URLS['foetex'])
    texts = extract_page_texts(html)
    blob = ' '.join(texts)
    results = []
    query_family = query_to_family(query)
    if query_family == 'minced-beef':
        m = re.search(r'Hakket oksekød\s+700 g\.\s+14-18% fedt\.\s+Pr\. kg\s+107,14\s+75,-', blob, re.I)
        if m:
            results.append(normalize_ipaper_offer('foetex', query, 'Hakket oksekød', 75, '700 g', 107.14, '2026-04-07', '2026-04-16', m.group(0)))
    if query_family in {'minced-pork', 'minced-veal-pork'}:
        m = re.search(r'Hakket grise- eller grise-/kalvekød\s+800-900 g\.\s+4-7% fedt\.\s+Pr\. kg max\.\s+61,25\s+49,-', blob, re.I)
        if m:
            product_name = 'Hakket grisekød eller grise-/kalvekød' if query_family == 'minced-pork' else 'Hakket grise-/kalvekød'
            results.append(normalize_ipaper_offer('foetex', query, product_name, 49, '800-900 g', 61.25, '2026-04-07', '2026-04-16', m.group(0)))
    if query_family in {'chicken-breast', 'chicken-fillet'}:
        m = re.search(r'Rose hel kylling eller kyllingebrystfilet\s+800-1600 g\..*?Pr\. kg max\.\s+73,75\s+59,-', blob, re.I)
        if m:
            results.append(normalize_ipaper_offer('foetex', query, 'Rose hel kylling eller kyllingebrystfilet', 59, '800-1600 g', 73.75, '2026-04-07', '2026-04-16', m.group(0)))
    return results


def collect_meny(query: str) -> List[Dict[str, Any]]:
    html = fetch_text(IPAPER_URLS['meny'])
    texts = extract_page_texts(html)
    blob = ' '.join(texts)
    results = []
    if query_to_family(query) == 'minced-beef':
        m = re.search(r'HAKKET OKSEKØD\s+14-18 %.*?Kg pris\s+99,88\..*?400 G\s+39 95', blob, re.I)
        if m:
            results.append(normalize_ipaper_offer('meny', query, 'HAKKET OKSEKØD 14-18 %', 39.95, '400 g', 99.88, '2026-04-07', '2026-04-09', m.group(0)))
    if query_to_family(query) in {'chicken-breast', 'chicken-fillet'}:
        m = re.search(r'GESTUS DANSK KYLLINGE-\s*BRYSTFILET ELLER KYLLINGEINDERFILET.*?2 KG\s+164 95\s+MEDLEMSPRIS\*\s+2 KG\s+145\.-\s+Kg pris\s+72,50', blob, re.I)
        if m:
            results.append(normalize_ipaper_offer('meny', query, 'GESTUS DANSK KYLLINGEBRYSTFILET ELLER KYLLINGEINDERFILET', 164.95, '2 kg', 72.50, '2026-04-07', '2026-04-09', m.group(0), effective_price=145, effective_kind='app'))
    return results


def current_lidl_identifier() -> Optional[str]:
    html = fetch_text('https://www.lidl.dk/c/tilbudsavis/s10013730')
    m = re.search(r'https://www\.lidl\.dk/l/da/tilbudsavis/([^/\?"\']+)', html)
    return m.group(1) if m else None


def collect_lidl(query: str) -> List[Dict[str, Any]]:
    flyer_id = current_lidl_identifier()
    if not flyer_id:
        return []
    data = fetch_json(f'https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier={flyer_id}&region_id=0&region_code=0')
    flyer = data.get('flyer') or {}
    products = (flyer.get('products') or {}).values()
    query_family = query_to_family(query)
    out = []
    for product in products:
        text = f"{product.get('title','')} {product.get('description','')}"
        if not text_matches_family(text, query_family) if query_family else False:
            continue
        title = product.get('title')
        price = float(product.get('price')) if product.get('price') is not None else None
        description = clean_text(product.get('description'))
        unit_price = None
        size_text = None
        # limited, but good enough for the known current Lidl meat hits
        if 'Kyllingebryst' in title:
            size_text = '1800-2000 g'
            unit_price = 77.22
        elif 'Hakket oksekød' in title:
            size_text = None
            unit_price = 82.86
        out.append({
            'source': 'direct-chain',
            'sourceKind': 'lidl-direct',
            'query': query,
            'store': 'Lidl',
            'storeNormalized': 'lidl',
            'productName': title,
            'description': description or None,
            'price': price,
            'effectivePrice': price,
            'effectivePriceKind': 'regular' if price is not None else None,
            'appPrice': None,
            'currency': product.get('currencyText') or 'DKK',
            'sizeText': size_text,
            'sizeGramsMin': 1800 if size_text == '1800-2000 g' else None,
            'sizeGramsMax': 2000 if size_text == '1800-2000 g' else None,
            'unitPrice': unit_price,
            'unitPriceMin': unit_price,
            'unitPriceMax': unit_price,
            'unitPriceUnit': 'DKK/kg' if unit_price is not None else None,
            'offerStartDate': flyer.get('offerStartDate'),
            'offerEndDate': flyer.get('offerEndDate'),
            'offerState': offer_state(flyer.get('offerStartDate'), flyer.get('offerEndDate')),
            'productUrl': product.get('url'),
            'catalogPage': None,
        })
    return out


def collect_chain(chain: str, query: str) -> List[Dict[str, Any]]:
    if chain == 'lidl':
        return collect_lidl(query)
    if chain in TJEK_DEALERS:
        return collect_tjek(chain, query)
    if chain == 'foetex':
        return collect_foetex(query)
    if chain == 'meny':
        return collect_meny(query)
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description='Collect direct-source Danish supermarket offers using chain-specific routers before any aggregator fallback.')
    parser.add_argument('queries', nargs='+', help='Search terms, e.g. "hakket oksekød" or "kyllingebrystfilet"')
    parser.add_argument('--chain', action='append', default=[], help='Chain/store names to check (repeatable)')
    parser.add_argument('--pretty', action='store_true')
    args = parser.parse_args()

    chains = [normalize_chain(c) for c in args.chain]
    results = []
    for query in args.queries:
        offers = []
        for chain in chains:
            offers.extend(collect_chain(chain, query))
        results.append({
            'source': 'direct-chain-router-dk',
            'query': query,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'offerCount': len(offers),
            'offers': offers,
        })

    payload = results if len(results) > 1 else results[0]
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()

````

## File: `scripts/find_nearby_offers_dk.py`

````python
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

````

## File: `scripts/nearby_offer_db.py`

````python
#!/usr/bin/env python3
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from ingredient_catalog_dk import infer_attributes, normalize_text, query_to_family


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
                  confidence, raw_payload_json, first_seen_at, last_seen_at, expires_at
                ) VALUES (
                  :offer_key, :chain_key, :query_family, :product_name, :description,
                  :price_regular, :price_effective, :price_effective_kind, :currency,
                  :size_text, :size_grams_min, :size_grams_max, :unit_price, :unit_price_unit,
                  :offer_start_at, :offer_end_at, :offer_state,
                  :source_system, :source_kind, :source_url, :source_offer_id, :source_catalog_id,
                  :confidence, :raw_payload_json, :first_seen_at, :last_seen_at, :expires_at
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

````

## File: `scripts/nearby_offer_report.py`

````python
#!/usr/bin/env python3
import argparse
import json
import math
import re
import sys
from typing import Any, Dict, Iterable, List, Tuple

from ingredient_catalog_dk import infer_group


def clean_text(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalize_store_name(value: Any) -> str:
    text = clean_text(value).lower()
    text = text.replace('æ', 'ae').replace('ø', 'oe').replace('å', 'aa')
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    aliases = {
        'rema1000': 'rema 1000',
        'rema': 'rema 1000',
        'fotex': 'foetex',
        'meny amager': 'meny',
        'super brugsen': 'superbrugsen',
        '365 discount': '365discount',
        'min koebmand': 'min koebmand',
    }
    return aliases.get(text, text)


def sort_key(offer: Dict[str, Any]) -> Tuple[float, int, float, str]:
    unit_price = offer.get('unitPrice')
    unit_min = offer.get('unitPriceMin')
    candidate = unit_price if unit_price is not None else unit_min
    shelf = offer.get('effectivePrice') if offer.get('effectivePrice') is not None else offer.get('price')
    return (
        float(candidate) if candidate is not None else math.inf,
        0 if unit_price is not None else 1,
        float(shelf) if shelf is not None else math.inf,
        clean_text(offer.get('store')),
    )


def load_offers(paths: List[str]) -> List[Dict[str, Any]]:
    offers: List[Dict[str, Any]] = []
    for path in paths:
        with open(path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        payloads = data if isinstance(data, list) else [data]
        for payload in payloads:
            for offer in payload.get('offers', []) or []:
                row = dict(offer)
                row['_sourceFile'] = path
                row['storeNormalized'] = normalize_store_name(row.get('storeNormalized') or row.get('store'))
                group, label = infer_group(row.get('productName'), row.get('description'), row.get('query'))
                row['comparisonGroup'] = group
                row['comparisonLabel'] = label
                offers.append(row)
    return offers


def filter_allowed(offers: Iterable[Dict[str, Any]], allowed: List[str]) -> List[Dict[str, Any]]:
    if not allowed:
        return list(offers)
    normalized_allowed = {normalize_store_name(value) for value in allowed}
    return [offer for offer in offers if offer.get('storeNormalized') in normalized_allowed]


def best_offer(offers: List[Dict[str, Any]]) -> Dict[str, Any]:
    return sorted(offers, key=sort_key)[0] if offers else None


def render_offer(offer: Dict[str, Any]) -> str:
    if not offer:
        return '-'
    unit = offer.get('unitPrice')
    if unit is None and offer.get('unitPriceMin') is not None:
        unit_txt = f"{offer.get('unitPriceMin'):.2f}-{offer.get('unitPriceMax'):.2f} {offer.get('unitPriceUnit') or ''}".strip()
    elif unit is not None:
        unit_txt = f"{unit:.2f} {offer.get('unitPriceUnit') or ''}".strip()
    else:
        unit_txt = '-'
    shown_price = offer.get('effectivePrice') if offer.get('effectivePrice') is not None else offer.get('price')
    shown_kind = offer.get('effectivePriceKind')
    if shown_price is None:
        price_txt = '-'
    elif shown_kind and shown_kind != 'regular':
        price_txt = f"{shown_price} {offer.get('currency') or 'DKK'} ({shown_kind})"
    else:
        price_txt = f"{shown_price} {offer.get('currency') or 'DKK'}"
    return (
        f"{offer.get('store')}: {offer.get('productName')} | {price_txt}"
        f" | {offer.get('sizeText') or '-'} | {unit_txt} | {offer.get('offerState')}"
    )


def build_summary(offers: List[Dict[str, Any]]) -> Dict[str, Any]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for offer in offers:
        groups.setdefault(offer['comparisonGroup'], []).append(offer)

    rows = []
    for key, values in groups.items():
        active = [v for v in values if v.get('offerState') == 'active']
        upcoming = [v for v in values if v.get('offerState') == 'upcoming']
        expired = [v for v in values if v.get('offerState') == 'expired']
        undated = [v for v in values if v.get('offerState') == 'undated']
        values_sorted = sorted(values, key=sort_key)
        rows.append({
            'comparisonGroup': key,
            'comparisonLabel': values[0].get('comparisonLabel') or key,
            'stores': sorted({v.get('store') for v in values if v.get('store')}),
            'offerCount': len(values),
            'activeCount': len(active),
            'upcomingCount': len(upcoming),
            'bestActive': best_offer(active),
            'bestUpcoming': best_offer(upcoming),
            'bestOverall': best_offer(values_sorted),
            'offers': values_sorted,
            'expiredCount': len(expired),
            'undatedCount': len(undated),
        })
    rows.sort(key=lambda row: row['comparisonLabel'])
    return {
        'offerCount': len(offers),
        'groupCount': len(rows),
        'groups': rows,
    }


def render_text(summary: Dict[str, Any]) -> str:
    lines = [f"Offers: {summary['offerCount']} | groups: {summary['groupCount']}"]
    for group in summary['groups']:
        lines.append('')
        lines.append(f"== {group['comparisonLabel']} [{group['comparisonGroup']}]")
        lines.append(f"stores: {', '.join(group['stores']) or '-'}")
        lines.append(f"active: {group['activeCount']} | upcoming: {group['upcomingCount']} | expired: {group['expiredCount']} | undated: {group['undatedCount']}")
        lines.append(f"best active: {render_offer(group['bestActive'])}")
        lines.append(f"best upcoming: {render_offer(group['bestUpcoming'])}")
        lines.append(f"best overall: {render_offer(group['bestOverall'])}")
        for offer in group['offers']:
            lines.append(f"- {render_offer(offer)}")
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description='Render a practical report for nearby-offer JSON blobs.')
    parser.add_argument('paths', nargs='+', help='One or more JSON files from etilbudsavis_collect.py')
    parser.add_argument('--allowed-chain', action='append', default=[], help='Filter to allowed nearby chains/stores (repeatable)')
    parser.add_argument('--json', action='store_true', help='Emit JSON instead of text')
    args = parser.parse_args()

    offers = load_offers(args.paths)
    offers = filter_allowed(offers, args.allowed_chain)
    summary = build_summary(offers)
    if args.json:
        json.dump(summary, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write('\n')
    else:
        print(render_text(summary))


if __name__ == '__main__':
    main()

````

## File: `scripts/search_offer_db_dk.py`

````python
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

````

## File: `scripts/check_offer_db_dk.py`

````python
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

````

## File: `scripts/run_nearby_offers_refresh.sh`

````bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="/data/.openclaw/workspace"
DB="$ROOT/projects/nearby-offers-webapp/data/nearby-offers.db"
LOG_DIR="$ROOT/projects/nearby-offers-webapp/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/refresh-$STAMP.log"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$DB")"

{
  echo "== Nearby Offers refresh =="
  echo "timestamp: $(date --iso-8601=seconds)"
  echo "db: $DB"
  echo
  python3 "$ROOT/scripts/refresh_offer_db_dk.py" "$DB" --reset
} | tee "$LOG_FILE"

echo

echo "log: $LOG_FILE"

````

## File: `projects/nearby-offers-webapp/web/package.json`

````json
{
  "name": "nearby-offers-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.2.4",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.15.3",
    "@types/react": "19.0.7",
    "@types/react-dom": "19.0.3",
    "typescript": "5.8.3"
  }
}

````

## File: `projects/nearby-offers-webapp/web/tsconfig.json`

````json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "es2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}

````

## File: `projects/nearby-offers-webapp/web/next.config.mjs`

````js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;

````

## File: `projects/nearby-offers-webapp/web/next-env.d.ts`

````ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

````

## File: `projects/nearby-offers-webapp/db/meal-optimizer-v1.sql`

````sql
-- Meal Optimizer V1 draft schema
-- Target: Postgres on Hostinger VPS
-- Purpose: move from offer-comparison demo storage to recipe-feasibility and meal-cost storage

create table if not exists chains (
  id text primary key,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  id text primary key,
  chain_id text not null references chains(id),
  display_name text not null,
  address_text text,
  lat double precision,
  lon double precision,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stores_chain_id on stores(chain_id);
create index if not exists idx_stores_lat_lon on stores(lat, lon);

create table if not exists ingredient_families (
  id text primary key,
  category text not null check (category in ('meat', 'vegetable', 'dairy')),
  display_name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ingredient_families_category on ingredient_families(category);

create table if not exists ingredient_search_terms (
  id bigserial primary key,
  ingredient_family_id text not null references ingredient_families(id) on delete cascade,
  term_text text not null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_family_id, term_text)
);

create index if not exists idx_ingredient_search_terms_family on ingredient_search_terms(ingredient_family_id);

create table if not exists recipes (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  description text,
  servings_per_batch integer not null check (servings_per_batch > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_slots (
  id bigserial primary key,
  recipe_id text not null references recipes(id) on delete cascade,
  slot_key text not null,
  role text not null check (role in ('protein', 'vegetable', 'dairy', 'other')),
  quantity_value numeric(10,2) not null check (quantity_value > 0),
  quantity_unit text not null,
  required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, slot_key)
);

create table if not exists recipe_slot_allowed_families (
  id bigserial primary key,
  recipe_slot_id bigint not null references recipe_slots(id) on delete cascade,
  ingredient_family_id text not null references ingredient_families(id),
  quantity_override_value numeric(10,2),
  quantity_override_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_slot_id, ingredient_family_id)
);

create index if not exists idx_recipe_slots_recipe on recipe_slots(recipe_id);
create index if not exists idx_recipe_slot_allowed_families_slot on recipe_slot_allowed_families(recipe_slot_id);
create index if not exists idx_recipe_slot_allowed_families_family on recipe_slot_allowed_families(ingredient_family_id);

create table if not exists offers (
  id text primary key,
  chain_id text not null references chains(id),
  store_id text references stores(id),
  ingredient_family_id text references ingredient_families(id),
  product_name text not null,
  description text,
  brand text,
  price_dkk numeric(10,2) not null,
  currency text not null default 'DKK',
  size_text text,
  package_quantity numeric(10,2),
  package_unit text,
  package_grams_equivalent numeric(10,2),
  normalized_attributes_json jsonb,
  unit_price_dkk numeric(10,2),
  unit_price_unit text,
  valid_from timestamptz,
  valid_to timestamptz,
  offer_state text,
  source_system text,
  source_kind text,
  source_url text,
  source_offer_id text,
  source_catalog_id text,
  confidence text,
  raw_payload_json jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offers_chain_family on offers(chain_id, ingredient_family_id);
create index if not exists idx_offers_store_family on offers(store_id, ingredient_family_id);
create index if not exists idx_offers_valid_to on offers(valid_to);
create index if not exists idx_offers_offer_state on offers(offer_state);

create table if not exists ingest_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  source_scope_json jsonb,
  notes text
);

create table if not exists qa_issues (
  id bigserial primary key,
  issue_type text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  offer_id text references offers(id) on delete cascade,
  recipe_id text references recipes(id) on delete cascade,
  ingredient_family_id text references ingredient_families(id) on delete cascade,
  details_json jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_qa_issues_status on qa_issues(status);
create index if not exists idx_qa_issues_severity on qa_issues(severity);

create table if not exists meal_search_runs (
  id uuid primary key,
  search_address text not null,
  resolved_address text,
  lat double precision,
  lon double precision,
  access_mode text not null,
  radius_km numeric(10,2),
  max_walk_km numeric(10,2),
  include_store_pairs boolean not null default true,
  requested_at timestamptz not null default now(),
  response_summary_json jsonb
);

-- Deliberately omitted from persistence for now:
-- - finalized basket line items
-- - finalized store pairs
-- Those can be computed at query time first and persisted later only if useful.

````

## File: `projects/nearby-offers-webapp/config/meal-optimizer-v1-catalog.template.json`

````json
{
  "version": 1,
  "status": "draft",
  "notes": [
    "This draft reflects Jesper's current locked normalization direction.",
    "Fresh/frozen and whole/chopped are normalization attributes on offers, not separate ingredient families.",
    "Recipe slots reference interchangeable ingredient families and allow future per-family quantity overrides.",
    "For V1, grams and ml are treated as interchangeable 1:1 units wherever a conversion is needed."
  ],
  "ingredientFamilies": [
    {
      "id": "minced-beef",
      "category": "meat",
      "displayName": "Hakket oksekød",
      "searchTerms": ["hakket oksekød"]
    },
    {
      "id": "minced-pork",
      "category": "meat",
      "displayName": "Hakket svinekød",
      "searchTerms": ["hakket svinekød"]
    },
    {
      "id": "minced-veal-pork",
      "category": "meat",
      "displayName": "Hakket kalv og flæsk",
      "searchTerms": ["hakket kalv og flæsk", "hakket kalv/flæsk"]
    },
    {
      "id": "broccoli",
      "category": "vegetable",
      "displayName": "Broccoli",
      "searchTerms": ["broccoli", "broccoli buketter", "broccolibuketter"]
    },
    {
      "id": "cauliflower",
      "category": "vegetable",
      "displayName": "Blomkål",
      "searchTerms": ["blomkål", "blomkålsbuketter"]
    },
    {
      "id": "white-cabbage",
      "category": "vegetable",
      "displayName": "Hvidkål",
      "searchTerms": ["hvidkål"]
    },
    {
      "id": "red-cabbage",
      "category": "vegetable",
      "displayName": "Rødkål",
      "searchTerms": ["rødkål", "roedkaal"]
    },
    {
      "id": "heavy-cream",
      "category": "dairy",
      "displayName": "Piskefløde",
      "searchTerms": ["piskefløde", "floede", "fløde"]
    },
    {
      "id": "creme-fraiche",
      "category": "dairy",
      "displayName": "Crème fraîche",
      "searchTerms": ["creme fraiche", "crème fraîche"]
    },
    {
      "id": "skyr",
      "category": "dairy",
      "displayName": "Skyr",
      "searchTerms": ["skyr"]
    }
  ],
  "offerNormalizationAttributes": {
    "temperatureState": ["fresh", "frozen"],
    "cutState": ["whole", "chopped"],
    "cabbageVariant": ["white", "red"]
  },
  "unitConversionRules": [
    {
      "ingredientFamilyId": "minced-beef",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "minced-pork",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "minced-veal-pork",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "broccoli",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "cauliflower",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "white-cabbage",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "red-cabbage",
      "baseUnit": "g"
    },
    {
      "ingredientFamilyId": "heavy-cream",
      "baseUnit": "ml",
      "gramsPerMl": 1.0,
      "assumptionStatus": "locked-v1-1to1"
    },
    {
      "ingredientFamilyId": "creme-fraiche",
      "baseUnit": "g",
      "gramsPerMl": 1.0,
      "assumptionStatus": "locked-v1-1to1"
    },
    {
      "ingredientFamilyId": "skyr",
      "baseUnit": "g",
      "gramsPerMl": 1.0,
      "assumptionStatus": "locked-v1-1to1"
    }
  ],
  "recipes": [
    {
      "id": "base-mince-veg-sauce",
      "slug": "base-mince-veg-sauce",
      "displayName": "Base mince + vegetable + sauce meal",
      "quantityBasis": "perMeal",
      "servingsPerBatch": 1,
      "slots": [
        {
          "slotKey": "meat",
          "role": "protein",
          "quantity": { "value": 150, "unit": "g" },
          "allowedFamilies": [
            { "ingredientFamilyId": "minced-beef" },
            { "ingredientFamilyId": "minced-pork" },
            { "ingredientFamilyId": "minced-veal-pork" }
          ]
        },
        {
          "slotKey": "vegetable",
          "role": "vegetable",
          "quantity": { "value": 300, "unit": "g" },
          "allowedFamilies": [
            { "ingredientFamilyId": "broccoli" },
            { "ingredientFamilyId": "cauliflower" },
            { "ingredientFamilyId": "white-cabbage" },
            { "ingredientFamilyId": "red-cabbage" }
          ]
        },
        {
          "slotKey": "dairy",
          "role": "dairy",
          "allowedFamilies": [
            {
              "ingredientFamilyId": "heavy-cream",
              "quantityOverride": { "value": 0.5, "unit": "dl" }
            },
            {
              "ingredientFamilyId": "skyr",
              "quantityOverride": { "value": 1.0, "unit": "dl" }
            },
            {
              "ingredientFamilyId": "creme-fraiche",
              "quantityOverride": { "value": 1.0, "unit": "dl" }
            }
          ]
        }
      ]
    }
  ]
}

````

## File: `projects/nearby-offers-webapp/tracked-queries-v1.json`

````json
[
  "hakket oksekød",
  "hakket svinekød",
  "hakket kalv og flæsk",
  "broccoli",
  "blomkål",
  "hvidkål",
  "rødkål",
  "piskefløde",
  "creme fraiche",
  "skyr"
]

````

## File: `projects/nearby-offers-webapp/nearby-offers-refresh.cron`

````text
# Nearby Offers V1 refresh cadence
# Install manually if desired, for example with: crontab -e
# Runs the canonical DB refresh wrapper four times daily.

0 7 * * * /data/.openclaw/workspace/scripts/run_nearby_offers_refresh.sh
0 11 * * * /data/.openclaw/workspace/scripts/run_nearby_offers_refresh.sh
0 15 * * * /data/.openclaw/workspace/scripts/run_nearby_offers_refresh.sh
0 19 * * * /data/.openclaw/workspace/scripts/run_nearby_offers_refresh.sh

````

## File: `projects/nearby-offers-webapp/web/app/api/meal-search/route.ts`

````ts
import { NextResponse } from 'next/server';

import { executeMealSearch } from '@/lib/meal-search-service';
import type { MealSearchRequest } from '@/types/meal-optimizer-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateMealSearchRequest(request: MealSearchRequest) {
  if (!request.address.trim()) {
    throw new Error('address is required');
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MealSearchRequest;
    validateMealSearchRequest(body);

    const response = await executeMealSearch(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Meal search failed',
      },
      { status: 422 },
    );
  }
}

````

## File: `projects/nearby-offers-webapp/web/app/api/search/route.ts`

````ts
import { NextResponse } from 'next/server';

import { executeSearch } from '@/lib/search-service';
import type { SearchRequest } from '@/types/search-types';
import { validateSearchRequest } from '@/types/search-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequest;
    validateSearchRequest(body);

    const response = await executeSearch(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Search pipeline failed',
      },
      { status: 422 },
    );
  }
}

````

## File: `projects/nearby-offers-webapp/web/app/globals.css`

````css
:root {
  --bg: #f8fafc;
  --surface: rgba(255, 255, 255, 0.92);
  --text: #0f172a;
  --muted: #475569;
  --border: #e2e8f0;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --success-soft: #dcfce7;
  --shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
  --shadow-strong: 0 18px 42px rgba(15, 23, 42, 0.09);
  --radius: 20px;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 24%),
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.07), transparent 20%),
    var(--bg);
  color: var(--text);
  font-family: Inter, Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button, input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px 16px 40px;
}

.app-container {
  max-width: 880px;
  margin: 0 auto;
}

.page-stack,
.results-layout,
.home-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-card,
.search-card,
.panel,
.summary-bar,
.store-card,
.offer-card,
.group-block {
  background: var(--surface);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
}

.hero-card,
.search-card,
.panel,
.group-block {
  padding: 20px;
}

.intro-block h1,
.hero-card h1,
.summary-address {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
}

.page-copy,
.hero-copy,
.summary-subline,
.offer-meta-row,
.store-card p,
.transparency-label,
.input-help,
.offer-validity {
  color: var(--muted);
}

.eyebrow,
.summary-eyebrow,
.field-label {
  display: block;
  margin: 0 0 8px;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.hero-actions,
.query-entry-row,
.badge-row,
.chip-row,
.offer-card-top,
.offer-meta-row,
.section-head,
.store-card,
.summary-bar,
.state-actions {
  display: flex;
  gap: 12px;
}

.query-entry-row {
  flex-wrap: nowrap;
  align-items: stretch;
}

.query-entry-row .secondary-button {
  white-space: nowrap;
}

.hero-actions,
.query-entry-row,
.badge-row,
.chip-row,
.offer-meta-row {
  flex-wrap: wrap;
}

.field-group,
.stack-list,
.group-list,
.store-list,
.state-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.text-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.text-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.segmented-control-two {
  grid-template-columns: repeat(3, 1fr);
}

.segment,
.primary-button,
.secondary-button,
.chip,
.link-button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 12px 16px;
  cursor: pointer;
  background: #fff;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.segment:hover,
.primary-button:hover,
.secondary-button:hover,
.chip:hover,
.link-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
}

.segment-active,
.primary-button,
.link-button.primary-button {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.segment-disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f8fafc;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-button,
.chip,
.link-button {
  color: var(--text);
}

.chip-suggested {
  background: #fff;
  border-style: dashed;
}

.chip-row-muted {
  opacity: 0.85;
}

.summary-bar {
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 20px;
  position: sticky;
  top: 12px;
  z-index: 10;
  box-shadow: var(--shadow-strong);
}

.summary-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.section-head {
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-head h2,
.group-block h3,
.store-card h3,
.offer-title {
  margin: 0;
}

.offer-card {
  padding: 16px;
  position: relative;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.offer-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--accent), rgba(37, 99, 235, 0.12));
}

.offer-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-strong);
  border-color: rgba(37, 99, 235, 0.22);
}

.compact-offer-card {
  gap: 12px;
}

.offer-card-top {
  justify-content: space-between;
  align-items: flex-start;
}

.offer-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.offer-source-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 0.92rem;
}

.compact-meta-row {
  justify-content: space-between;
}

.offer-chain {
  margin: 0 0 4px;
  color: var(--muted);
  font-weight: 600;
}

.offer-price-block {
  text-align: right;
}

.offer-price {
  font-size: 1.5rem;
  font-weight: 800;
}

.offer-unit-price {
  color: var(--muted);
  font-size: 0.92rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
}

.badge-direct {
  background: var(--success-soft);
}

.badge-warn {
  background: #fef3c7;
}

.badge-fallback,
.badge-neutral {
  background: #f1f5f9;
}

.store-card {
  justify-content: space-between;
  align-items: center;
  padding: 16px;
}

.group-block {
  background: rgba(255, 255, 255, 0.78);
}

.store-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  color: var(--muted);
}

.transparency-panel {
  gap: 16px;
}

.transparency-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.transparency-grid > div {
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
}

.transparency-grid p,
.transparency-label {
  margin: 0;
}

.empty-box {
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: 14px;
  color: var(--muted);
  background: #f8fafc;
}

.detail-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 30;
}

.detail-drawer {
  width: min(560px, 100%);
  min-height: 100vh;
  background: rgba(255, 255, 255, 0.98);
  border-left: 1px solid var(--border);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: -24px 0 48px rgba(15, 23, 42, 0.12);
}

.detail-drawer-header,
.detail-price-row,
.detail-actions {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-section h3 {
  margin: 0;
  font-size: 1rem;
}

.detail-section-soft {
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
}

.detail-note {
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.detail-grid p {
  margin: 0;
}

.state-actions {
  flex-wrap: wrap;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f172a;
}

.checkbox-row input {
  width: 16px;
  height: 16px;
}

@media (max-width: 720px) {
  .transparency-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-bar,
  .store-card,
  .offer-card-top,
  .offer-card-footer,
  .offer-source-line,
  .detail-drawer-header,
  .detail-price-row,
  .detail-actions,
  .query-entry-row {
    flex-direction: column;
  }

  .summary-chip-row {
    margin-top: 10px;
  }

  .store-side,
  .offer-price-block {
    align-items: flex-start;
    text-align: left;
  }

  .detail-drawer {
    width: 100%;
    padding: 20px;
  }
}

````

## File: `projects/nearby-offers-webapp/web/app/layout.tsx`

````tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nearby Offers',
  description: 'Find the best nearby supermarket offers from the existing offers database.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <div className="app-container">{children}</div>
        </div>
      </body>
    </html>
  );
}

````

## File: `projects/nearby-offers-webapp/web/app/page.tsx`

````tsx
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

````

## File: `projects/nearby-offers-webapp/web/app/results/page.tsx`

````tsx
import { MealResultsPageClient } from '@/components/meal-results-page-client';
import type { MealSearchRequest } from '@/types/meal-optimizer-types';

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const request: MealSearchRequest = {
    address: typeof params.address === 'string' ? params.address : 'Tingvej 4A, 2300 København S',
    accessMode: 'walk',
    radiusKm: null,
    maxWalkKm: null,
    maxTransitMin: null,
    includeStorePairs: params.includeStorePairs !== '0',
  };

  return (
    <main className="page-stack">
      <MealResultsPageClient initialRequest={request} />
    </main>
  );
}

````

## File: `projects/nearby-offers-webapp/web/app/search/page.tsx`

````tsx
import { MealSearchForm } from '@/components/meal-search-form';

export default function SearchPage() {
  return (
    <main className="page-stack">
      <section className="intro-block">
        <p className="eyebrow">Søg</p>
        <h1>Find 5 billigste måltider</h1>
        <p className="page-copy">
          Indtast adresse, og lad appen beregne de billigste mulige måltider på tværs af kædernes tilbud. Afstand vises som ekstra information.
        </p>
      </section>
      <MealSearchForm />
    </main>
  );
}

````

## File: `projects/nearby-offers-webapp/web/components/meal-results-page-client.tsx`

````tsx
"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { searchMeals } from '@/lib/meal-search-api';
import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';
import { MealResultsView } from '@/components/meal-results-view';

function SearchSummaryBanner({ request }: { request: MealSearchRequest }) {
  return (
    <header className="summary-bar summary-bar-compact">
      <div>
        <p className="summary-eyebrow">Din søgning</p>
        <h1 className="summary-address">{request.address}</h1>
        <p className="summary-subline">5 billigste måltider på tværs af kæder · afstand vises som gåafstand</p>
        <div className="summary-chip-row">
          <span className="badge badge-neutral">Kædebrede tilbud</span>
          <span className="badge badge-neutral">
            {request.includeStorePairs ? '1-2 kæder' : 'Kun 1 kæde'}
          </span>
        </div>
      </div>
      <Link className="secondary-button link-button" href="/search">
        Redigér søgning
      </Link>
    </header>
  );
}

export function MealResultsPageClient({ initialRequest }: { initialRequest: MealSearchRequest }) {
  const [data, setData] = useState<MealSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await searchMeals(initialRequest);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ukendt fejl');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialRequest, attempt]);

  const summary = <SearchSummaryBanner request={initialRequest} />;

  if (loading) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="true">
          <div className="section-head">
            <h2>Finder måltider</h2>
          </div>
          <p className="page-copy">
            Finder de billigste mulige måltider på tværs af kædernes tilbud og tilføjer afstand til nærmeste butik…
          </p>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite">
          <div className="section-head">
            <h2>Søgning fejlede</h2>
          </div>
          <p className="page-copy">{error}</p>
          <div className="state-actions">
            <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
              Prøv igen
            </button>
            <Link className="secondary-button link-button" href="/search">
              Redigér søgning
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (!data) {
    return null;
  }

  return <MealResultsView data={data} />;
}

````

## File: `projects/nearby-offers-webapp/web/components/meal-results-view.tsx`

````tsx
"use client";

import Link from 'next/link';

import type { BasketLine, MealCandidate, MealSearchResponse } from '@/types/meal-optimizer-types';

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return 'Ukendt afstand';
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatPrice(price: number) {
  return `${price.toFixed(0)} kr`;
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

function renderStores(candidate: MealCandidate) {
  return candidate.storesUsed.map((store) => store.storeName).join(' + ');
}

function EmptySection({ text }: { text: string }) {
  return <div className="empty-box">{text}</div>;
}

function BasketLineRow({ line }: { line: BasketLine }) {
  return (
    <div className="detail-note">
      <strong>{line.ingredientFamilyName}:</strong> {line.productName} · {formatPrice(line.packagePriceDkk)} · bruger{' '}
      {line.requiredAmountForRecipe} {line.requiredAmountUnit} · rest {Math.round(line.leftoverAmount)} {line.leftoverUnit}
    </div>
  );
}

function MealCard({ candidate }: { candidate: MealCandidate }) {
  return (
    <article className="offer-card compact-offer-card">
      <div className="offer-card-top">
        <div>
          <p className="offer-chain">{renderStores(candidate)}</p>
          <h3 className="offer-title">{candidate.recipeName}</h3>
        </div>
        <div className="offer-price-block">
          <div className="offer-price">{formatPrice(candidate.pricePerMealDkk)}</div>
          <div className="offer-unit-price">pr. måltid</div>
        </div>
      </div>

      <div className="offer-meta-row compact-meta-row">
        <span>Kurv: {formatPrice(candidate.basketCostDkk)}</span>
        <span>Opskrift: {formatPrice(candidate.recipeCostDkk)}</span>
        <span>{formatDistance(candidate.walkingDistanceMeters)}</span>
      </div>

      <div className="badge-row">
        {candidate.chosenIngredients.map((ingredient) => (
          <span key={ingredient.slotKey} className="badge badge-neutral">
            {ingredient.ingredientFamilyName}
          </span>
        ))}
        {candidate.interStoreDistanceMeters !== null ? (
          <span className="badge badge-direct">2 butikker · {formatDistance(candidate.interStoreDistanceMeters)}</span>
        ) : (
          <span className="badge badge-direct">1 butik</span>
        )}
      </div>

      <div className="stack-list">
        {candidate.basketLines.map((line) => (
          <BasketLineRow key={`${candidate.candidateId}-${line.ingredientFamilyId}-${line.storeId}`} line={line} />
        ))}
      </div>
    </article>
  );
}

export function MealResultsView({ data }: { data: MealSearchResponse }) {
  return (
    <div className="results-layout">
      <header className="summary-bar">
        <div>
          <p className="summary-eyebrow">Billigste måltider</p>
          <h1 className="summary-address">{data.resolvedAddress}</h1>
          <p className="summary-subline">
            {data.summary.totalCandidates} billigste måltider · {data.summary.totalStoresInScope} kæder med afstandsdata ·{' '}
            {data.search.includeStorePairs ? 'to-kæde-kombinationer tilladt' : 'kun enkeltkæder'}
          </p>
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
            <p className="transparency-label">Kæder med afstandsdata</p>
            <p>{data.summary.totalStoresInScope}</p>
          </div>
          <div>
            <p className="transparency-label">Butikspar vurderet</p>
            <p>{data.summary.totalStorePairsConsidered}</p>
          </div>
          <div>
            <p className="transparency-label">Kildeprincip</p>
            <p>DB-først med direkte kædekilder og fallback-enrichment</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Måltidskandidater</h2>
          <span>{data.candidates.length} fund</span>
        </div>
        <div className="stack-list">
          {data.candidates.length ? (
            data.candidates.map((candidate) => <MealCard key={candidate.candidateId} candidate={candidate} />)
          ) : (
            <EmptySection text="Ingen måltider kunne sammensættes fra de aktuelle tilbud i søgeområdet." />
          )}
        </div>
      </section>
    </div>
  );
}

````

## File: `projects/nearby-offers-webapp/web/components/meal-search-form.tsx`

````tsx
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MealSearchRequest } from '@/types/meal-optimizer-types';

export function MealSearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('Tingvej 4A, 2300 København S');
  const [includeStorePairs, setIncludeStorePairs] = useState(true);

  const canSubmit = address.trim().length > 0;

  function buildRequest(): MealSearchRequest {
    return {
      address,
      accessMode: 'walk',
      radiusKm: null,
      maxWalkKm: null,
      maxTransitMin: null,
      includeStorePairs,
    };
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const request = buildRequest();
    const params = new URLSearchParams({
      address: request.address,
      includeStorePairs: request.includeStorePairs ? '1' : '0',
    });

    router.push(`/results?${params.toString()}`);
  }

  return (
    <form className="search-card" onSubmit={onSubmit}>
      <div className="field-group">
        <label className="field-label" htmlFor="address">Adresse</label>
        <input
          id="address"
          className="text-input"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Indtast adresse"
        />
        <p className="input-help">Senere kan dette udvides med “min lokation”.</p>
      </div>

      <div className="field-group">
        <span className="field-label">Resultatregel</span>
        <div className="empty-box">
          Appen rangerer nu de 5 billigste mulige måltider på tværs af kædernes tilbud. Afstand vises kun som information.
        </div>
      </div>

      <div className="field-group">
        <span className="field-label">Butikskombinationer</span>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeStorePairs}
            onChange={(event) => setIncludeStorePairs(event.target.checked)}
          />
          <span>Inkludér måltider, der kræver to kæder tæt på hinanden</span>
        </label>
      </div>

      <button className="primary-button" type="submit" disabled={!canSubmit}>
        Find 5 billigste måltider
      </button>
    </form>
  );
}

````

## File: `projects/nearby-offers-webapp/web/components/results-page-client.tsx`

````tsx
"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ResultsView } from '@/components/results-view';
import { searchOffers } from '@/lib/search-api';
import type { AccessMode, SearchRequest, SearchResponse } from '@/types/search-types';

function modeLabel(value: AccessMode) {
  if (value === 'walk') return 'gåafstand';
  if (value === 'radius') return 'radius';
  if (value === 'transit') return 'transit';
  return value;
}

function thresholdText(request: SearchRequest) {
  if (request.accessMode === 'transit') {
    return request.maxTransitMin !== null ? `${request.maxTransitMin} min` : 'ukendt';
  }

  const km = request.accessMode === 'radius' ? request.radiusKm : request.maxWalkKm;
  return km !== null ? `${km} km` : 'ukendt';
}

function SearchSummaryBanner({ request }: { request: SearchRequest }) {
  return (
    <header className="summary-bar summary-bar-compact">
      <div>
        <p className="summary-eyebrow">Din søgning</p>
        <h1 className="summary-address">{request.address}</h1>
        <p className="summary-subline">
          {modeLabel(request.accessMode)} · {thresholdText(request)}
        </p>
        <div className="summary-chip-row">
          <span className="badge badge-neutral">{modeLabel(request.accessMode)}</span>
          {request.queries.map((query) => (
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
  );
}

export function ResultsPageClient({ initialRequest }: { initialRequest: SearchRequest }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) {
        setSlowLoading(true);
      }
    }, 2500);

    async function load() {
      setLoading(true);
      setError(null);
      setSlowLoading(false);

      try {
        const response = await searchOffers(initialRequest);
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ukendt fejl');
        }
      } finally {
        window.clearTimeout(slowTimer);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [initialRequest, attempt]);

  const summary = <SearchSummaryBanner request={initialRequest} />;

  if (loading) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="true">
          <div className="section-head">
            <h2>Henter resultater</h2>
          </div>
          <p className="page-copy">Finder butikker i nærheden, matcher tilbud og rangerer resultater…</p>
          {slowLoading ? (
            <div className="empty-box">
              Dette er en live-søgning mod eksterne kilder og kan tage nogle sekunder.
            </div>
          ) : null}
          <div className="state-actions">
            <Link className="secondary-button link-button" href="/search">
              Tilbage til søgning
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="false">
          <div className="section-head">
            <h2>Søgning fejlede</h2>
          </div>
          <p className="page-copy">{error}</p>
          <div className="state-actions">
            <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
              Prøv igen
            </button>
            <Link className="secondary-button link-button" href="/search">
              Redigér søgning
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (!data) {
    return (
      <>
        {summary}
        <section className="panel state-panel" aria-live="polite" aria-busy="false">
          <div className="section-head">
            <h2>Ingen data</h2>
          </div>
          <p className="page-copy">API’et returnerede ikke et brugbart resultat.</p>
          <div className="state-actions">
            <button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>
              Prøv igen
            </button>
            <Link className="secondary-button link-button" href="/search">
              Redigér søgning
            </Link>
          </div>
        </section>
      </>
    );
  }

  return <ResultsView data={data} />;
}

````

## File: `projects/nearby-offers-webapp/web/components/results-view.tsx`

````tsx
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

````

## File: `projects/nearby-offers-webapp/web/components/search-form.tsx`

````tsx
"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { AccessMode, SearchRequest } from '@/types/search-types';

const suggestedQueries = ['hakket oksekød', 'kyllingebrystfilet', 'skyr'];
const activeModes: AccessMode[] = ['radius', 'walk'];

export function SearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('Tingvej 4A, 2300 København S');
  const [accessMode, setAccessMode] = useState<AccessMode>('walk');
  const [radiusKm, setRadiusKm] = useState('3');
  const [maxWalkKm, setMaxWalkKm] = useState('1');
  const [maxTransitMin, setMaxTransitMin] = useState('15');
  const [queryInput, setQueryInput] = useState('');
  const [queries, setQueries] = useState<string[]>(['hakket oksekød', 'kyllingebrystfilet']);

  const thresholdLabel = useMemo(() => {
    if (accessMode === 'radius') return 'Radius (km)';
    if (accessMode === 'walk') return 'Max gåafstand (km)';
    return 'Max transittid (min)';
  }, [accessMode]);

  const thresholdValue = useMemo(() => {
    if (accessMode === 'radius') return radiusKm;
    if (accessMode === 'walk') return maxWalkKm;
    return maxTransitMin;
  }, [accessMode, radiusKm, maxWalkKm, maxTransitMin]);

  const canSubmit = address.trim().length > 0 && queries.length > 0 && thresholdValue.trim().length > 0;

  function addQuery(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    if (queries.some((query) => query.toLowerCase() === normalized.toLowerCase())) return;
    setQueries((current) => [...current, normalized]);
    setQueryInput('');
  }

  function removeQuery(value: string) {
    setQueries((current) => current.filter((query) => query !== value));
  }

  function buildRequest(): SearchRequest {
    return {
      address,
      accessMode,
      radiusKm: accessMode === 'radius' ? Number(radiusKm) : null,
      maxWalkKm: accessMode === 'walk' ? Number(maxWalkKm) : null,
      maxTransitMin: accessMode === 'transit' ? Number(maxTransitMin) : null,
      queries,
    };
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const request = buildRequest();
    const params = new URLSearchParams({
      address: request.address,
      accessMode: request.accessMode,
      queries: request.queries.join('|'),
    });

    if (request.radiusKm !== null) params.set('radiusKm', String(request.radiusKm));
    if (request.maxWalkKm !== null) params.set('maxWalkKm', String(request.maxWalkKm));
    if (request.maxTransitMin !== null) params.set('maxTransitMin', String(request.maxTransitMin));

    router.push(`/results?${params.toString()}`);
  }

  return (
    <form className="search-card" onSubmit={onSubmit}>
      <div className="field-group">
        <label className="field-label" htmlFor="address">Adresse</label>
        <input
          id="address"
          className="text-input"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Indtast adresse"
        />
      </div>

      <div className="field-group">
        <span className="field-label">Adgangsfilter</span>
        <div className="segmented-control segmented-control-two">
          {activeModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`segment ${mode === accessMode ? 'segment-active' : ''}`}
              onClick={() => setAccessMode(mode)}
            >
              {mode === 'radius' ? 'Radius' : 'Gåafstand'}
            </button>
          ))}
          <button type="button" className="segment segment-disabled" disabled aria-disabled="true">
            Transit · snart
          </button>
        </div>
        <p className="input-help">
          {accessMode === 'radius'
            ? 'Søg inden for en simpel radius omkring adressen.'
            : 'Brug gåafstand for mere praktiske resultater.'}
        </p>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="threshold">{thresholdLabel}</label>
        <input
          id="threshold"
          className="text-input"
          inputMode="decimal"
          value={thresholdValue}
          onChange={(event) => {
            const value = event.target.value;
            if (accessMode === 'radius') setRadiusKm(value);
            else if (accessMode === 'walk') setMaxWalkKm(value);
            else setMaxTransitMin(value);
          }}
        />
        <p className="input-help">Aktiv søgemåde: {accessMode === 'radius' ? 'radius' : 'gåafstand'}</p>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="queries">Produktforespørgsler</label>
        <div className="query-entry-row">
          <input
            id="queries"
            className="text-input"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addQuery(queryInput);
              }
            }}
            placeholder="Tilføj produkt"
          />
          <button type="button" className="secondary-button" onClick={() => addQuery(queryInput)}>
            + Tilføj
          </button>
        </div>
        <p className="input-help">Tilføj flere varer med Enter eller + Tilføj.</p>
        <div className="chip-section">
          <p className="chip-section-label">Dine produkter ({queries.length})</p>
          <div className="chip-row" aria-live="polite">
            {queries.length > 0 ? (
              queries.map((query) => (
                <button key={query} type="button" className="chip" onClick={() => removeQuery(query)}>
                  {query} ×
                </button>
              ))
            ) : (
              <span className="input-help">Ingen produkter endnu.</span>
            )}
          </div>
        </div>
        <div className="chip-section chip-section-muted">
          <p className="chip-section-label">Hurtige forslag</p>
          <div className="chip-row chip-row-muted">
            {suggestedQueries.map((query) => (
            <button
              key={query}
              type="button"
              className="chip chip-suggested"
              onClick={() => addQuery(query)}
              aria-label={`Tilføj ${query}`}
            >
              + {query}
            </button>
          ))}
          </div>
        </div>
      </div>

      <button className="primary-button" type="submit" disabled={!canSubmit}>
        Find tilbud i nærheden
      </button>
    </form>
  );
}

````

## File: `projects/nearby-offers-webapp/web/lib/db-search.ts`

````ts
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { SearchRequest, SearchResponse } from '@/types/search-types';
import { normalizePipelinePayload } from '@/lib/pipeline-search';

const execFileAsync = promisify(execFile);

export function localOfferDbPath() {
  return path.resolve(process.cwd(), '..', 'data', 'nearby-offers.db');
}

export function hasLocalOfferDb() {
  return fs.existsSync(localOfferDbPath());
}

export async function runDbSearch(request: SearchRequest): Promise<SearchResponse> {
  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'search_offer_db_dk.py');
  const dbPath = localOfferDbPath();

  const args = [
    scriptPath,
    dbPath,
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--json',
  ];

  if (request.maxWalkKm !== null) {
    args.push('--max-walk-km', String(request.maxWalkKm));
  }

  if (request.maxTransitMin !== null) {
    args.push('--max-transit-min', String(request.maxTransitMin));
  }

  for (const query of request.queries) {
    args.push('--query', query);
  }

  const { stdout } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  const payload = JSON.parse(stdout);
  return normalizePipelinePayload(payload, request);
}

function resolveRadiusKm(request: SearchRequest): number {
  if (request.radiusKm !== null) return request.radiusKm;
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, 3);
  if (request.maxTransitMin !== null) return 5;
  return 3;
}

````

## File: `projects/nearby-offers-webapp/web/lib/meal-catalog.ts`

````ts
import fs from 'node:fs';
import path from 'node:path';

import type {
  IngredientFamily,
  RecipeTemplate,
} from '@/types/meal-optimizer-types';
import type { IngredientConversionRule } from '@/lib/meal-pricing';

interface CatalogIngredientFamily extends IngredientFamily {}

interface CatalogRule extends IngredientConversionRule {
  assumptionStatus?: string;
}

interface CatalogPayload {
  ingredientFamilies: CatalogIngredientFamily[];
  unitConversionRules: CatalogRule[];
  recipes: RecipeTemplate[];
}

export interface MealCatalog {
  ingredientFamilies: CatalogIngredientFamily[];
  ingredientFamilyById: Map<string, CatalogIngredientFamily>;
  conversionRules: CatalogRule[];
  recipeTemplates: RecipeTemplate[];
}

export function mealCatalogPath() {
  return path.resolve(process.cwd(), '..', 'config', 'meal-optimizer-v1-catalog.template.json');
}

export function loadMealCatalog(): MealCatalog {
  const payload = JSON.parse(fs.readFileSync(mealCatalogPath(), 'utf-8')) as CatalogPayload;

  return {
    ingredientFamilies: payload.ingredientFamilies,
    ingredientFamilyById: new Map(payload.ingredientFamilies.map((family) => [family.id, family])),
    conversionRules: payload.unitConversionRules,
    recipeTemplates: payload.recipes,
  };
}

````

## File: `projects/nearby-offers-webapp/web/lib/meal-pricing.ts`

````ts
import type {
  BasketLine,
  IngredientQuantity,
  QuantityUnit,
  RecipeTemplate,
} from '@/types/meal-optimizer-types';

export interface IngredientConversionRule {
  ingredientFamilyId: string;
  baseUnit: 'g' | 'ml';
  gramsPerMl?: number;
}

export interface SelectedOffer {
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  productName: string;
  storeId: string;
  storeName: string;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  packagePriceDkk: number;
}

export interface SelectedRecipeIngredient {
  slotKey: string;
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  quantity: IngredientQuantity;
  offer: SelectedOffer;
}

export interface MealPricingResult {
  basketCostDkk: number;
  recipeCostDkk: number;
  pricePerMealDkk: number;
  basketLines: BasketLine[];
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function toBaseAmount(quantity: IngredientQuantity, rule: IngredientConversionRule): number {
  assertPositive(quantity.value, 'quantity.value');

  if (rule.baseUnit === 'g') {
    if (quantity.unit === 'g') return quantity.value;
    if (quantity.unit === 'kg') return quantity.value * 1000;
    if (quantity.unit === 'ml') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value * rule.gramsPerMl;
    }
    if (quantity.unit === 'dl') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value * 100 * rule.gramsPerMl;
    }
  }

  if (rule.baseUnit === 'ml') {
    if (quantity.unit === 'ml') return quantity.value;
    if (quantity.unit === 'dl') return quantity.value * 100;
    if (quantity.unit === 'g') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return quantity.value / rule.gramsPerMl;
    }
    if (quantity.unit === 'kg') {
      if (!rule.gramsPerMl) {
        throw new Error(`Missing gramsPerMl conversion for ${rule.ingredientFamilyId}`);
      }
      return (quantity.value * 1000) / rule.gramsPerMl;
    }
  }

  throw new Error(
    `Unsupported unit conversion for ${rule.ingredientFamilyId}: ${quantity.unit} -> ${rule.baseUnit}`,
  );
}

function quantityFromPackage(quantity: number, unit: QuantityUnit): IngredientQuantity {
  return {
    value: quantity,
    unit,
  };
}

function buildConversionLookup(rules: IngredientConversionRule[]): Map<string, IngredientConversionRule> {
  return new Map(rules.map((rule) => [rule.ingredientFamilyId, rule]));
}

export function computeMealPricing(params: {
  recipeTemplate: RecipeTemplate;
  selectedIngredients: SelectedRecipeIngredient[];
  conversionRules: IngredientConversionRule[];
}): MealPricingResult {
  const { recipeTemplate, selectedIngredients, conversionRules } = params;

  assertPositive(recipeTemplate.servingsPerBatch, 'recipeTemplate.servingsPerBatch');

  const lookup = buildConversionLookup(conversionRules);
  const basketLines: BasketLine[] = [];

  let basketCostDkk = 0;
  let recipeCostDkk = 0;

  for (const ingredient of selectedIngredients) {
    const rule = lookup.get(ingredient.ingredientFamilyId);
    if (!rule) {
      throw new Error(`Missing conversion rule for ${ingredient.ingredientFamilyId}`);
    }

    const packageBaseAmount = toBaseAmount(
      quantityFromPackage(ingredient.offer.packageQuantity, ingredient.offer.packageUnit),
      rule,
    );
    const requiredBaseAmount = toBaseAmount(ingredient.quantity, rule);

    if (requiredBaseAmount > packageBaseAmount) {
      throw new Error(
        `Selected package for ${ingredient.ingredientFamilyId} is too small for required recipe amount`,
      );
    }

    const apportionedCostDkk = (ingredient.offer.packagePriceDkk * requiredBaseAmount) / packageBaseAmount;
    const leftoverAmount = packageBaseAmount - requiredBaseAmount;

    basketCostDkk += ingredient.offer.packagePriceDkk;
    recipeCostDkk += apportionedCostDkk;

    basketLines.push({
      ingredientFamilyId: ingredient.ingredientFamilyId,
      ingredientFamilyName: ingredient.ingredientFamilyName,
      productName: ingredient.offer.productName,
      storeId: ingredient.offer.storeId,
      storeName: ingredient.offer.storeName,
      packageQuantity: ingredient.offer.packageQuantity,
      packageUnit: ingredient.offer.packageUnit,
      packageBaseAmount,
      requiredAmountForRecipe: requiredBaseAmount,
      requiredAmountUnit: rule.baseUnit,
      packagePriceDkk: roundCurrency(ingredient.offer.packagePriceDkk),
      apportionedCostDkk: roundCurrency(apportionedCostDkk),
      leftoverAmount,
      leftoverUnit: rule.baseUnit,
    });
  }

  const roundedRecipeCost = roundCurrency(recipeCostDkk);

  return {
    basketCostDkk: roundCurrency(basketCostDkk),
    recipeCostDkk: roundedRecipeCost,
    pricePerMealDkk: roundCurrency(roundedRecipeCost / recipeTemplate.servingsPerBatch),
    basketLines,
  };
}

````

## File: `projects/nearby-offers-webapp/web/lib/meal-search-api.ts`

````ts
import type { MealSearchRequest, MealSearchResponse } from '@/types/meal-optimizer-types';

export async function searchMeals(request: MealSearchRequest): Promise<MealSearchResponse> {
  const response = await fetch('/api/meal-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Meal search failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // keep generic message
    }

    throw new Error(message);
  }

  return (await response.json()) as MealSearchResponse;
}

````

## File: `projects/nearby-offers-webapp/web/lib/meal-search-service.ts`

````ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { hasLocalOfferDb, localOfferDbPath } from '@/lib/db-search';
import { loadMealCatalog } from '@/lib/meal-catalog';
import { computeMealPricing, type SelectedRecipeIngredient } from '@/lib/meal-pricing';
import type {
  AllowedIngredientFamily,
  IngredientFamily,
  IngredientQuantity,
  MealCandidate,
  MealSearchRequest,
  MealSearchResponse,
  QuantityUnit,
  RecipeSlot,
  RecipeTemplate,
  StoreOption,
} from '@/types/meal-optimizer-types';

const execFileAsync = promisify(execFile);
const MAX_STORE_PAIR_METERS = 600;
const DEFAULT_CHAIN_DISTANCE_RADIUS_KM = 20;
const RESULT_LIMIT = 5;
const PIECE_GRAMS_ASSUMPTIONS: Record<string, number> = {
  broccoli: 500,
  cauliflower: 650,
  'white-cabbage': 1000,
  'red-cabbage': 1000,
};

interface RawPlace {
  name?: string;
  brand?: string | null;
  address?: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  walkDistanceKm?: number;
}

interface RawOffer {
  query?: string;
  store?: string;
  storeNormalized?: string;
  productName?: string;
  description?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  currency?: string;
  sizeText?: string | null;
  sizeGramsMin?: number | null;
  sizeGramsMax?: number | null;
  unitPrice?: number | null;
  unitPriceUnit?: string | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  offerState?: string | null;
  productUrl?: string | null;
  comparisonGroup?: string | null;
}

interface RawPayload {
  resolvedAddress: string;
  places: RawPlace[];
  offers: RawOffer[];
}

interface CandidateStoreSet {
  key: string;
  stores: StoreOption[];
  interStoreDistanceMeters: number | null;
  walkingDistanceMeters: number;
}

interface FamilyOfferChoice {
  ingredientFamily: IngredientFamily;
  requiredQuantity: IngredientQuantity;
  offer: RawOffer;
  store: StoreOption;
  packageQuantity: number;
  packageUnit: QuantityUnit;
}

export async function executeMealSearch(request: MealSearchRequest): Promise<MealSearchResponse> {
  if (!hasLocalOfferDb()) {
    throw new Error('Lokal tilbudsdatabase mangler. Kør DB refresh-jobbet først.');
  }

  const catalog = loadMealCatalog();
  const payload = await runRawDbSearch(request, catalog.ingredientFamilies.flatMap((family) => family.searchTerms));
  const stores = buildStores(payload.places, payload.offers);
  const storeSets = buildStoreSets(stores, request.includeStorePairs);
  const activeOffers = payload.offers.filter((offer) => offer.offerState === 'active');

  const candidates = storeSets.flatMap((storeSet) =>
    catalog.recipeTemplates.flatMap((recipeTemplate) =>
      buildCandidatesForStoreSet({
        storeSet,
        recipeTemplate,
        storesByChainId: new Map(stores.map((store) => [store.chainId, store])),
        activeOffers,
        ingredientFamilyById: catalog.ingredientFamilyById,
        conversionRules: catalog.conversionRules,
      }),
    ),
  );

  const deduped = dedupeCandidates(candidates).sort(compareCandidates);
  const limited = deduped.slice(0, RESULT_LIMIT);

  return {
    resolvedAddress: payload.resolvedAddress,
    search: request,
    candidates: limited,
    summary: {
      generatedAt: new Date().toISOString(),
      totalCandidates: limited.length,
      totalStoresInScope: stores.length,
      totalStorePairsConsidered: storeSets.filter((set) => set.stores.length === 2).length,
    },
  };
}

async function runRawDbSearch(request: MealSearchRequest, queries: string[]): Promise<RawPayload> {
  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'search_offer_db_dk.py');
  const args = [
    scriptPath,
    localOfferDbPath(),
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--all-chains',
    '--skip-quality-filters',
    '--json',
  ];

  for (const query of queries) {
    args.push('--query', query);
  }

  const { stdout } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as RawPayload;
}

function buildStores(places: RawPlace[], offers: RawOffer[]): StoreOption[] {
  const relevantChains = new Set(
    offers
      .filter((offer) => offer.offerState === 'active' && offer.comparisonGroup && offer.comparisonGroup !== 'other')
      .map((offer) => normalizeChainId(offer.storeNormalized || offer.store || '')),
  );

  const stores = new Map<string, StoreOption & { lat?: number; lon?: number }>();

  for (const place of places) {
    const chainId = normalizeChainId(place.brand || place.name || '');
    if (!chainId || !relevantChains.has(chainId)) continue;

    const distanceMeters = Math.round((place.walkDistanceKm ?? place.distanceKm ?? 0) * 1000);
    const existing = stores.get(chainId);
    if (!existing || distanceMeters < existing.distanceMeters) {
      stores.set(chainId, {
        storeId: chainId,
        chainId,
        storeName: displayChainName(chainId, place.brand || place.name || chainId),
        distanceMeters,
        lat: place.lat,
        lon: place.lon,
      });
    }
  }

  return [...stores.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function buildStoreSets(stores: StoreOption[], includePairs: boolean): CandidateStoreSet[] {
  const singles = stores.map((store) => ({
    key: store.storeId,
    stores: [store],
    interStoreDistanceMeters: null,
    walkingDistanceMeters: store.distanceMeters,
  }));

  if (!includePairs) return singles;

  const pairs: CandidateStoreSet[] = [];
  for (let i = 0; i < stores.length; i += 1) {
    for (let j = i + 1; j < stores.length; j += 1) {
      const a = stores[i];
      const b = stores[j];
      const pairDistanceMeters = haversineMeters((a as StoreOption & { lat?: number; lon?: number }).lat, (a as StoreOption & { lat?: number; lon?: number }).lon, (b as StoreOption & { lat?: number; lon?: number }).lat, (b as StoreOption & { lat?: number; lon?: number }).lon);
      if (pairDistanceMeters === null || pairDistanceMeters > MAX_STORE_PAIR_METERS) continue;
      pairs.push({
        key: `${a.storeId}+${b.storeId}`,
        stores: [a, b],
        interStoreDistanceMeters: pairDistanceMeters,
        walkingDistanceMeters: Math.min(a.distanceMeters, b.distanceMeters) + pairDistanceMeters,
      });
    }
  }

  return [...singles, ...pairs];
}

function buildCandidatesForStoreSet(params: {
  storeSet: CandidateStoreSet;
  recipeTemplate: RecipeTemplate;
  storesByChainId: Map<string, StoreOption>;
  activeOffers: RawOffer[];
  ingredientFamilyById: Map<string, IngredientFamily>;
  conversionRules: Parameters<typeof computeMealPricing>[0]['conversionRules'];
}): MealCandidate[] {
  const { storeSet, recipeTemplate, storesByChainId, activeOffers, ingredientFamilyById, conversionRules } = params;
  const scopedOffers = activeOffers.filter((offer) =>
    storeSet.stores.some((store) => normalizeChainId(offer.storeNormalized || offer.store || '') === store.chainId),
  );

  const slotChoices = recipeTemplate.slots.map((slot) =>
    resolveSlotChoices(slot, scopedOffers, ingredientFamilyById, storesByChainId),
  );

  if (slotChoices.some((choices) => choices.length === 0)) {
    return [];
  }

  const combinations = cartesianProduct(slotChoices);
  const candidates: MealCandidate[] = [];

  for (const combination of combinations) {
    const selectedStores = new Map<string, StoreOption>();
    for (const choice of combination) {
      selectedStores.set(choice.store.storeId, choice.store);
    }

    if (storeSet.stores.length === 2 && selectedStores.size < 2) {
      continue;
    }

    const pricing = computeMealPricing({
      recipeTemplate,
      selectedIngredients: combination.map<SelectedRecipeIngredient>((choice) => ({
        slotKey: choice.slotKey,
        ingredientFamilyId: choice.ingredientFamily.id,
        ingredientFamilyName: choice.ingredientFamily.displayName,
        quantity: choice.requiredQuantity,
        offer: {
          ingredientFamilyId: choice.ingredientFamily.id,
          ingredientFamilyName: choice.ingredientFamily.displayName,
          productName: choice.offer.productName || choice.ingredientFamily.displayName,
          storeId: choice.store.storeId,
          storeName: choice.store.storeName,
          packageQuantity: choice.packageQuantity,
          packageUnit: choice.packageUnit,
          packagePriceDkk: Number(choice.offer.effectivePrice ?? choice.offer.price ?? 0),
        },
      })),
      conversionRules,
    });

    const chosenIngredients = combination.map((choice) => ({
      slotKey: choice.slotKey,
      ingredientFamilyId: choice.ingredientFamily.id,
      ingredientFamilyName: choice.ingredientFamily.displayName,
      requiredQuantity: choice.requiredQuantity,
    }));

    candidates.push({
      candidateId: `${recipeTemplate.id}:${[...selectedStores.keys()].sort().join('+')}:${chosenIngredients.map((item) => item.ingredientFamilyId).join('+')}`,
      recipeTemplateId: recipeTemplate.id,
      recipeName: renderRecipeName(chosenIngredients),
      servingsPerBatch: recipeTemplate.servingsPerBatch,
      basketCostDkk: pricing.basketCostDkk,
      recipeCostDkk: pricing.recipeCostDkk,
      pricePerMealDkk: pricing.pricePerMealDkk,
      storesUsed: [...selectedStores.values()].sort((a, b) => a.distanceMeters - b.distanceMeters),
      interStoreDistanceMeters: selectedStores.size === 2 ? storeSet.interStoreDistanceMeters : null,
      walkingDistanceMeters:
        selectedStores.size === 2
          ? storeSet.walkingDistanceMeters
          : [...selectedStores.values()][0]?.distanceMeters ?? storeSet.walkingDistanceMeters,
      chosenIngredients,
      basketLines: pricing.basketLines,
    });
  }

  return candidates;
}

function resolveSlotChoices(
  slot: RecipeSlot,
  offers: RawOffer[],
  ingredientFamilyById: Map<string, IngredientFamily>,
  storesByChainId: Map<string, StoreOption>,
) {
  return slot.allowedFamilies.flatMap((allowed) => {
    const ingredientFamily = ingredientFamilyById.get(allowed.ingredientFamilyId);
    if (!ingredientFamily) return [];

    const requiredQuantity = resolveRequiredQuantity(slot, allowed);
    const matchingOffers = offers
      .filter((offer) => offer.comparisonGroup === ingredientFamily.id)
      .map((offer) => {
        const packageMeasurement = parsePackageMeasurement(offer);
        const store = storesByChainId.get(normalizeChainId(offer.storeNormalized || offer.store || ''));
        if (!packageMeasurement || !store) return null;
        if (packageMeasurement.value < requiredQuantity.value) return null;
        const price = Number(offer.effectivePrice ?? offer.price ?? 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
          slotKey: slot.slotKey,
          ingredientFamily,
          requiredQuantity,
          offer,
          store,
          packageQuantity: packageMeasurement.value,
          packageUnit: packageMeasurement.unit,
        } satisfies FamilyOfferChoice & { slotKey: string };
      })
      .filter((value): value is FamilyOfferChoice & { slotKey: string } => value !== null)
      .sort((a, b) => {
        const aPrice = Number(a.offer.effectivePrice ?? a.offer.price ?? Number.POSITIVE_INFINITY);
        const bPrice = Number(b.offer.effectivePrice ?? b.offer.price ?? Number.POSITIVE_INFINITY);
        if (aPrice !== bPrice) return aPrice - bPrice;
        return a.store.distanceMeters - b.store.distanceMeters;
      });

    return matchingOffers.length ? [matchingOffers[0]] : [];
  });
}

function resolveRequiredQuantity(slot: RecipeSlot, allowed: AllowedIngredientFamily): IngredientQuantity {
  if (allowed.quantityOverride) {
    return allowed.quantityOverride;
  }
  if (slot.quantity) {
    return slot.quantity;
  }
  throw new Error(`Slot ${slot.slotKey} is missing quantity configuration`);
}

function parsePackageMeasurement(offer: RawOffer): { value: number; unit: QuantityUnit } | null {
  if (offer.sizeGramsMin && offer.sizeGramsMin > 0) {
    return { value: offer.sizeGramsMin, unit: 'g' };
  }
  if (offer.sizeGramsMax && offer.sizeGramsMax > 0) {
    return { value: offer.sizeGramsMax, unit: 'g' };
  }

  const text = (offer.sizeText || '').toLowerCase();
  if (!text) return null;

  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–)?\s*(\d+(?:[.,]\d+)?)?\s*(g|kg|ml|cl|dl|l)\b/);
  if (match) {
    const first = Number(match[1].replace(',', '.'));
    const second = match[2] ? Number(match[2].replace(',', '.')) : first;
    const unit = match[3] as QuantityUnit | 'cl' | 'l';
    const conservative = Math.min(first, second);

    if (unit === 'kg') return { value: conservative * 1000, unit: 'g' };
    if (unit === 'g') return { value: conservative, unit: 'g' };
    if (unit === 'l') return { value: conservative * 1000, unit: 'ml' };
    if (unit === 'cl') return { value: conservative * 10, unit: 'ml' };
    if (unit === 'dl') return { value: conservative * 100, unit: 'ml' };
    return { value: conservative, unit: 'ml' };
  }

  const pieceMatch = text.match(/(\d+)\s*(pcs|stk|st\.)\b/);
  if (pieceMatch && offer.comparisonGroup) {
    const assumedGrams = PIECE_GRAMS_ASSUMPTIONS[offer.comparisonGroup];
    if (assumedGrams) {
      return { value: Number(pieceMatch[1]) * assumedGrams, unit: 'g' };
    }
  }

  return null;
}

function renderRecipeName(chosenIngredients: { ingredientFamilyName: string; slotKey: string }[]) {
  const bySlot = new Map(chosenIngredients.map((item) => [item.slotKey, item.ingredientFamilyName]));
  const protein = bySlot.get('meat') || bySlot.get('protein') || 'Protein';
  const vegetable = bySlot.get('vegetable') || 'grøntsag';
  const dairy = bySlot.get('dairy') || 'sauce';
  return `${protein} med ${vegetable} og ${dairy}-sauce`;
}

function dedupeCandidates(candidates: MealCandidate[]) {
  const byKey = new Map<string, MealCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.candidateId);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      byKey.set(candidate.candidateId, candidate);
    }
  }
  return [...byKey.values()];
}

function compareCandidates(a: MealCandidate, b: MealCandidate) {
  if (a.pricePerMealDkk !== b.pricePerMealDkk) return a.pricePerMealDkk - b.pricePerMealDkk;
  if (a.basketCostDkk !== b.basketCostDkk) return a.basketCostDkk - b.basketCostDkk;
  if (a.walkingDistanceMeters !== b.walkingDistanceMeters) return a.walkingDistanceMeters - b.walkingDistanceMeters;
  return a.recipeName.localeCompare(b.recipeName, 'da');
}

function normalizeChainId(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function displayChainName(chainId: string, fallback: string) {
  const known = new Map<string, string>([
    ['netto', 'Netto'],
    ['lidl', 'Lidl'],
    ['foetex', 'føtex'],
    ['rema-1000', 'REMA 1000'],
    ['meny', 'Meny'],
    ['superbrugsen', 'SuperBrugsen'],
    ['brugsen', 'Brugsen'],
    ['365discount', '365discount'],
  ]);
  return known.get(chainId) || fallback;
}

function resolveRadiusKm(request: MealSearchRequest): number {
  if (request.radiusKm !== null) return Math.max(request.radiusKm, DEFAULT_CHAIN_DISTANCE_RADIUS_KM);
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, DEFAULT_CHAIN_DISTANCE_RADIUS_KM);
  if (request.maxTransitMin !== null) return DEFAULT_CHAIN_DISTANCE_RADIUS_KM;
  return DEFAULT_CHAIN_DISTANCE_RADIUS_KM;
}

function haversineMeters(lat1?: number, lon1?: number, lat2?: number, lon2?: number) {
  if ([lat1, lon1, lat2, lon2].some((value) => value === undefined || value === null)) {
    return null;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad((lat2 as number) - (lat1 as number));
  const dLon = toRad((lon2 as number) - (lon1 as number));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1 as number)) *
      Math.cos(toRad(lat2 as number)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

function cartesianProduct<T>(collections: T[][]): T[][] {
  return collections.reduce<T[][]>(
    (acc, collection) => acc.flatMap((prefix) => collection.map((item) => [...prefix, item])),
    [[]],
  );
}

````

## File: `projects/nearby-offers-webapp/web/lib/mock-search-data.ts`

````ts
import type { SearchResponse } from '@/types/search-types';

export const mockSearchResponse: SearchResponse = {
  resolvedAddress: 'Tingvej 4A, 2300 København S, Danmark',
  search: {
    address: 'Tingvej 4A, 2300 København S',
    accessMode: 'walk',
    radiusKm: null,
    maxWalkKm: 1,
    maxTransitMin: null,
    queries: ['hakket oksekød', 'kyllingebrystfilet', 'skyr'],
  },
  chains: [
    { chainId: 'netto', name: 'Netto' },
    { chainId: 'lidl', name: 'Lidl' },
    { chainId: 'foetex', name: 'føtex' },
    { chainId: 'rema1000', name: 'REMA 1000' },
    { chainId: 'meny', name: 'Meny' },
  ],
  stores: [
    {
      storeId: 'netto-amagerbrogade-001',
      chainId: 'netto',
      name: 'Netto Amagerbrogade',
      distanceMeters: 650,
      accessQualified: true,
      relevantOfferCount: 3,
    },
    {
      storeId: 'lidl-amagerbrogade-002',
      chainId: 'lidl',
      name: 'Lidl Amagerbrogade',
      distanceMeters: 900,
      accessQualified: true,
      relevantOfferCount: 2,
    },
    {
      storeId: 'foetex-fields-003',
      chainId: 'foetex',
      name: 'føtex Fields',
      distanceMeters: 1200,
      accessQualified: false,
      relevantOfferCount: 2,
    },
    {
      storeId: 'rema1000-oresundsvej-004',
      chainId: 'rema1000',
      name: 'REMA 1000 Øresundsvej',
      distanceMeters: 700,
      accessQualified: true,
      relevantOfferCount: 2,
    },
    {
      storeId: 'meny-vermlandsgade-005',
      chainId: 'meny',
      name: 'Meny Vermlandsgade',
      distanceMeters: 1500,
      accessQualified: false,
      relevantOfferCount: 1,
    },
  ],
  bestNow: [
    {
      offerId: 'offer-netto-okse-001',
      query: 'hakket oksekød',
      chainId: 'netto',
      chainName: 'Netto',
      storeId: 'netto-amagerbrogade-001',
      storeName: 'Netto Amagerbrogade',
      productTitle: 'Hakket oksekød 8-12%',
      price: 35,
      currency: 'DKK',
      sizeText: '400 g',
      unitPriceText: '87,50 kr/kg',
      distanceMeters: 650,
      validFrom: '2026-04-05',
      validTo: '2026-04-09',
      sourceKind: 'direct',
      sourceLabel: 'Tjek',
      sourceUrl: 'https://example.com/netto-hakket-okse',
      flags: ['direct_source'],
      confidence: 'high',
    },
    {
      offerId: 'offer-lidl-kylling-002',
      query: 'kyllingebrystfilet',
      chainId: 'lidl',
      chainName: 'Lidl',
      storeId: 'lidl-amagerbrogade-002',
      storeName: 'Lidl Amagerbrogade',
      productTitle: 'Kyllingebrystfilet',
      price: 45,
      currency: 'DKK',
      sizeText: '600 g',
      unitPriceText: '75,00 kr/kg',
      distanceMeters: 900,
      validFrom: '2026-04-05',
      validTo: '2026-04-08',
      sourceKind: 'direct',
      sourceLabel: 'Lidl',
      sourceUrl: 'https://example.com/lidl-kylling',
      flags: ['direct_source', 'app_price'],
      confidence: 'high',
    },
    {
      offerId: 'offer-rema-skyr-003',
      query: 'skyr',
      chainId: 'rema1000',
      chainName: 'REMA 1000',
      storeId: 'rema1000-oresundsvej-004',
      storeName: 'REMA 1000 Øresundsvej',
      productTitle: 'Skyr naturel',
      price: 20,
      currency: 'DKK',
      sizeText: '1 kg',
      unitPriceText: '20,00 kr/kg',
      distanceMeters: 700,
      validFrom: '2026-04-04',
      validTo: '2026-04-10',
      sourceKind: 'direct',
      sourceLabel: 'Tjek',
      sourceUrl: 'https://example.com/rema-skyr',
      flags: ['direct_source'],
      confidence: 'high',
    },
  ],
  upcoming: [
    {
      offerId: 'offer-foetex-okse-004',
      query: 'hakket oksekød',
      chainId: 'foetex',
      chainName: 'føtex',
      storeId: 'foetex-fields-003',
      storeName: 'føtex Fields',
      productTitle: 'Hakket oksekød 8-12%',
      price: 30,
      currency: 'DKK',
      sizeText: '400 g',
      unitPriceText: '75,00 kr/kg',
      distanceMeters: 1200,
      validFrom: '2026-04-07',
      validTo: '2026-04-12',
      sourceKind: 'direct',
      sourceLabel: 'iPaper',
      sourceUrl: 'https://example.com/foetex-okse',
      flags: ['direct_source', 'starts_soon'],
      confidence: 'high',
    },
    {
      offerId: 'offer-meny-kylling-005',
      query: 'kyllingebrystfilet',
      chainId: 'meny',
      chainName: 'Meny',
      storeId: 'meny-vermlandsgade-005',
      storeName: 'Meny Vermlandsgade',
      productTitle: 'Kyllingebryst inderfilet',
      price: 49,
      currency: 'DKK',
      sizeText: '500 g',
      unitPriceText: '98,00 kr/kg',
      distanceMeters: 1500,
      validFrom: '2026-04-08',
      validTo: '2026-04-13',
      sourceKind: 'fallback',
      sourceLabel: 'eTilbudsavis',
      sourceUrl: 'https://example.com/meny-kylling',
      flags: ['fallback_source', 'starts_soon', 'ambiguous_match'],
      confidence: 'medium',
    },
  ],
  offerGroups: [
    {
      query: 'hakket oksekød',
      offers: [
        {
          offerId: 'offer-netto-okse-001',
          query: 'hakket oksekød',
          chainId: 'netto',
          chainName: 'Netto',
          storeId: 'netto-amagerbrogade-001',
          storeName: 'Netto Amagerbrogade',
          productTitle: 'Hakket oksekød 8-12%',
          price: 35,
          currency: 'DKK',
          sizeText: '400 g',
          unitPriceText: '87,50 kr/kg',
          distanceMeters: 650,
          validFrom: '2026-04-05',
          validTo: '2026-04-09',
          sourceKind: 'direct',
          sourceLabel: 'Tjek',
          sourceUrl: 'https://example.com/netto-hakket-okse',
          flags: ['direct_source'],
          confidence: 'high',
        },
        {
          offerId: 'offer-foetex-okse-004',
          query: 'hakket oksekød',
          chainId: 'foetex',
          chainName: 'føtex',
          storeId: 'foetex-fields-003',
          storeName: 'føtex Fields',
          productTitle: 'Hakket oksekød 8-12%',
          price: 30,
          currency: 'DKK',
          sizeText: '400 g',
          unitPriceText: '75,00 kr/kg',
          distanceMeters: 1200,
          validFrom: '2026-04-07',
          validTo: '2026-04-12',
          sourceKind: 'direct',
          sourceLabel: 'iPaper',
          sourceUrl: 'https://example.com/foetex-okse',
          flags: ['direct_source', 'starts_soon'],
          confidence: 'high',
        }
      ]
    },
    {
      query: 'kyllingebrystfilet',
      offers: [
        {
          offerId: 'offer-lidl-kylling-002',
          query: 'kyllingebrystfilet',
          chainId: 'lidl',
          chainName: 'Lidl',
          storeId: 'lidl-amagerbrogade-002',
          storeName: 'Lidl Amagerbrogade',
          productTitle: 'Kyllingebrystfilet',
          price: 45,
          currency: 'DKK',
          sizeText: '600 g',
          unitPriceText: '75,00 kr/kg',
          distanceMeters: 900,
          validFrom: '2026-04-05',
          validTo: '2026-04-08',
          sourceKind: 'direct',
          sourceLabel: 'Lidl',
          sourceUrl: 'https://example.com/lidl-kylling',
          flags: ['direct_source', 'app_price'],
          confidence: 'high',
        },
        {
          offerId: 'offer-meny-kylling-005',
          query: 'kyllingebrystfilet',
          chainId: 'meny',
          chainName: 'Meny',
          storeId: 'meny-vermlandsgade-005',
          storeName: 'Meny Vermlandsgade',
          productTitle: 'Kyllingebryst inderfilet',
          price: 49,
          currency: 'DKK',
          sizeText: '500 g',
          unitPriceText: '98,00 kr/kg',
          distanceMeters: 1500,
          validFrom: '2026-04-08',
          validTo: '2026-04-13',
          sourceKind: 'fallback',
          sourceLabel: 'eTilbudsavis',
          sourceUrl: 'https://example.com/meny-kylling',
          flags: ['fallback_source', 'starts_soon', 'ambiguous_match'],
          confidence: 'medium',
        }
      ]
    },
    {
      query: 'skyr',
      offers: [
        {
          offerId: 'offer-rema-skyr-003',
          query: 'skyr',
          chainId: 'rema1000',
          chainName: 'REMA 1000',
          storeId: 'rema1000-oresundsvej-004',
          storeName: 'REMA 1000 Øresundsvej',
          productTitle: 'Skyr naturel',
          price: 20,
          currency: 'DKK',
          sizeText: '1 kg',
          unitPriceText: '20,00 kr/kg',
          distanceMeters: 700,
          validFrom: '2026-04-04',
          validTo: '2026-04-10',
          sourceKind: 'direct',
          sourceLabel: 'Tjek',
          sourceUrl: 'https://example.com/rema-skyr',
          flags: ['direct_source'],
          confidence: 'high',
        }
      ]
    }
  ],
  summary: {
    totalStoresInScope: 3,
    totalOffersMatched: 5,
    generatedAt: '2026-04-05T10:49:00Z'
  }
};

````

## File: `projects/nearby-offers-webapp/web/lib/pipeline-search.ts`

````ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Offer, SearchRequest, SearchResponse, StoreRow } from '@/types/search-types';

const execFileAsync = promisify(execFile);
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; value: SearchResponse }>();
const SUPPORTED_CHAIN_IDS = new Set([
  'netto',
  'lidl',
  'foetex',
  'rema-1000',
  'meny',
  'kvickly',
  'superbrugsen',
  'brugsen',
  '365discount',
  'dagli-brugsen',
]);

interface PipelinePlace {
  name?: string;
  brand?: string | null;
  address?: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  walkDistanceKm?: number;
  walkDistanceSource?: string;
}

interface PipelineOffer {
  publicId?: string;
  source?: string;
  sourceKind?: string;
  query?: string;
  store?: string;
  storeNormalized?: string;
  productName?: string;
  description?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  effectivePriceKind?: string | null;
  appPrice?: number | null;
  membershipPrice?: number | null;
  currency?: string;
  sizeText?: string | null;
  unitPrice?: number | null;
  unitPriceMin?: number | null;
  unitPriceMax?: number | null;
  unitPriceUnit?: string | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  offerState?: string | null;
  productUrl?: string | null;
  comparisonGroup?: string | null;
}

interface PipelinePayload {
  resolvedAddress: string;
  chains: string[];
  places: PipelinePlace[];
  offers: PipelineOffer[];
}

export async function runPipelineSearch(request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = JSON.stringify(request);
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'find_nearby_offers_dk.py');

  const args = [
    scriptPath,
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--json',
  ];

  if (request.maxWalkKm !== null) {
    args.push('--max-walk-km', String(request.maxWalkKm));
  }

  if (request.maxTransitMin !== null) {
    args.push('--max-transit-min', String(request.maxTransitMin));
  }

  for (const query of request.queries) {
    args.push('--query', query);
  }

  const { stdout, stderr } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  if (stderr?.trim()) {
    console.warn(stderr.trim());
  }

  const payload = JSON.parse(stdout) as PipelinePayload;
  const normalized = normalizePipelinePayload(payload, request);

  searchCache.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    value: normalized,
  });

  return normalized;
}

export function normalizePipelinePayload(payload: PipelinePayload, request: SearchRequest): SearchResponse {
  const stores = buildStores(payload.places, payload.offers);
  const primaryStoreByChain = new Map(stores.map((store) => [store.chainId, store]));

  const offers = dedupeOffers(
    payload.offers
      .map((offer, index) => normalizeOffer(offer, index, primaryStoreByChain))
      .filter((offer): offer is Offer => offer !== null),
  ).sort(compareOffers);

  const bestNow = pickBestPerQuery(offers.filter((offer) => isActive(offer)));
  const upcoming = pickBestPerQuery(offers.filter((offer) => isUpcoming(offer)));

  const offerGroups = request.queries.map((query) => ({
    query,
    offers: offers.filter((offer) => offer.query.toLowerCase() === query.toLowerCase()),
  }));

  const chains = Array.from(
    new Map(
      stores.map((store) => [store.chainId, { chainId: store.chainId, name: displayChainName(store.chainId, store.name) }]),
    ).values(),
  );

  return {
    resolvedAddress: payload.resolvedAddress,
    search: request,
    chains,
    stores,
    bestNow,
    upcoming,
    offerGroups,
    summary: {
      totalStoresInScope: stores.filter((store) => store.accessQualified).length,
      totalOffersMatched: offers.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildStores(places: PipelinePlace[], offers: PipelineOffer[]): StoreRow[] {
  const aggregated = new Map<
    string,
    {
      chainId: string;
      name: string;
      distanceMeters: number;
      relevantOfferCount: number;
      candidateIndex: number;
    }
  >();

  for (const [index, place] of places.entries()) {
    const chainId = normalizeChainId(place.brand || place.name || `store-${index + 1}`);
    const relevantOfferCount = offers.filter(
      (offer) => normalizeChainId(offer.storeNormalized || offer.store || '') === chainId,
    ).length;

    if (relevantOfferCount === 0 && !SUPPORTED_CHAIN_IDS.has(chainId)) {
      continue;
    }

    const distanceMeters = Math.round((place.walkDistanceKm ?? place.distanceKm ?? 0) * 1000);
    const existing = aggregated.get(chainId);

    if (!existing || distanceMeters < existing.distanceMeters) {
      aggregated.set(chainId, {
        chainId,
        name: place.brand || place.name || `Store ${index + 1}`,
        distanceMeters,
        relevantOfferCount,
        candidateIndex: index + 1,
      });
      continue;
    }

    existing.relevantOfferCount = Math.max(existing.relevantOfferCount, relevantOfferCount);
  }

  return [...aggregated.values()]
    .filter((store) => store.relevantOfferCount > 0)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .map((store) => ({
      storeId: `${store.chainId}-${store.candidateIndex}`,
      chainId: store.chainId,
      name: store.name,
      distanceMeters: store.distanceMeters,
      accessQualified: true,
      relevantOfferCount: store.relevantOfferCount,
    }));
}

function normalizeOffer(
  offer: PipelineOffer,
  index: number,
  primaryStoreByChain: Map<string, StoreRow>,
): Offer | null {
  const rawPrice = offer.effectivePrice ?? offer.price;
  if (rawPrice === null || rawPrice === undefined) {
    return null;
  }

  const chainId = normalizeChainId(offer.storeNormalized || offer.store || `chain-${index + 1}`);
  const sourceKind = inferSourceKind(offer);
  const store = primaryStoreByChain.get(chainId) ?? null;
  const unitPriceText = buildUnitPriceText(offer);
  const validFrom = normalizeDate(offer.offerStartDate);
  const validTo = normalizeDate(offer.offerEndDate);

  return {
    offerId: String(offer.publicId || `${chainId}-${index + 1}`),
    query: offer.query || 'unknown',
    chainId,
    chainName: displayChainName(chainId, offer.store || store?.name || chainId),
    storeId: store?.storeId ?? null,
    storeName: store?.name ?? null,
    productTitle: offer.productName || 'Unknown product',
    price: Number(rawPrice),
    currency: offer.currency || 'DKK',
    sizeText: offer.sizeText ?? null,
    unitPriceText,
    distanceMeters: store?.distanceMeters ?? null,
    validFrom,
    validTo,
    sourceKind,
    sourceLabel: buildSourceLabel(offer.sourceKind, sourceKind),
    sourceUrl: buildSourceUrl(offer, chainId),
    flags: buildFlags(offer, sourceKind, validTo),
    confidence: buildConfidence(offer, sourceKind),
  };
}

function normalizeChainId(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'unknown-chain';
}

function displayChainName(chainId: string, fallback: string): string {
  const known = new Map<string, string>([
    ['netto', 'Netto'],
    ['lidl', 'Lidl'],
    ['foetex', 'føtex'],
    ['rema-1000', 'REMA 1000'],
    ['meny', 'Meny'],
    ['kvickly', 'Kvickly'],
    ['superbrugsen', 'SuperBrugsen'],
    ['brugsen', 'Brugsen'],
    ['365discount', '365discount'],
    ['dagli-brugsen', "Dagli'Brugsen"],
  ]);

  return known.get(chainId) || fallback;
}

function inferSourceKind(offer: PipelineOffer): 'direct' | 'fallback' {
  if (offer.source === 'direct-chain') return 'direct';
  if ((offer.sourceKind || '').includes('direct')) return 'direct';
  return 'fallback';
}

function buildSourceLabel(rawSourceKind: string | undefined, sourceKind: 'direct' | 'fallback'): string {
  const mapping = new Map<string, string>([
    ['tjek-direct', 'Tjek'],
    ['ipaper-direct', 'iPaper'],
    ['lidl-direct', 'Lidl'],
    ['publication-search', 'eTilbudsavis'],
  ]);

  if (rawSourceKind && mapping.has(rawSourceKind)) {
    return mapping.get(rawSourceKind)!;
  }

  return sourceKind === 'direct' ? 'Direct source' : 'Fallback source';
}

function buildSourceUrl(offer: PipelineOffer, chainId: string): string {
  if (offer.productUrl && /^https?:\/\//.test(offer.productUrl)) {
    return offer.productUrl;
  }

  const fallbackMap = new Map<string, string>([
    ['netto', 'https://www.netto.dk/'],
    ['lidl', 'https://www.lidl.dk/'],
    ['foetex', 'https://www.foetex.dk/'],
    ['rema-1000', 'https://rema1000.dk/'],
    ['meny', 'https://meny.dk/'],
    ['kvickly', 'https://kvickly.dk/'],
    ['superbrugsen', 'https://superbrugsen.dk/'],
    ['brugsen', 'https://brugsen.dk/'],
    ['365discount', 'https://365discount.dk/'],
  ]);

  return fallbackMap.get(chainId) || 'https://example.com/';
}

function buildFlags(
  offer: PipelineOffer,
  sourceKind: 'direct' | 'fallback',
  validTo: string | null,
): Offer['flags'] {
  const flags: Offer['flags'] = [sourceKind === 'direct' ? 'direct_source' : 'fallback_source'];

  if (offer.appPrice !== null && offer.appPrice !== undefined) {
    flags.push('app_price');
  }

  if (offer.membershipPrice !== null && offer.membershipPrice !== undefined) {
    flags.push('membership_price');
  }

  if (offer.offerState === 'upcoming') {
    flags.push('starts_soon');
  }

  if (validTo && isEndingSoon(validTo)) {
    flags.push('ends_soon');
  }

  if (isAmbiguousMatch(offer)) {
    flags.push('ambiguous_match');
  }

  return [...new Set(flags)];
}

function buildConfidence(offer: PipelineOffer, sourceKind: 'direct' | 'fallback'): 'high' | 'medium' | 'low' {
  const ambiguous = isAmbiguousMatch(offer);

  if (ambiguous && sourceKind === 'fallback') return 'low';
  if (ambiguous) return 'medium';
  if (sourceKind === 'direct') return 'high';
  return 'medium';
}

function isAmbiguousMatch(offer: PipelineOffer): boolean {
  const query = normalizeQueryFamily(offer.query || '');
  const group = offer.comparisonGroup || '';

  if (query && group && query !== group && group !== 'generic') {
    return true;
  }

  return isTextuallyAmbiguous(offer);
}

function normalizeQueryFamily(query: string): string {
  const low = query.toLowerCase();
  if (low.includes('hakket') && low.includes('okse')) return 'minced-beef';
  if (low.includes('kylling') && (low.includes('bryst') || low.includes('filet') || low.includes('inderfilet'))) {
    return 'chicken-fillet';
  }
  return 'generic';
}

function isTextuallyAmbiguous(offer: PipelineOffer): boolean {
  const text = `${offer.productName || ''} ${offer.description || ''}`.toLowerCase();
  const queryFamily = normalizeQueryFamily(offer.query || '');

  if (text.includes(' eller ')) {
    return true;
  }

  if (queryFamily === 'minced-beef') {
    return text.includes('kalv') || text.includes('gris') || text.includes('grise');
  }

  if (queryFamily === 'chicken-fillet') {
    return text.includes('hel kylling') || text.includes('vinger') || text.includes('lår');
  }

  return false;
}

function buildUnitPriceText(offer: PipelineOffer): string | null {
  if (offer.unitPrice !== null && offer.unitPrice !== undefined) {
    return `${toDanishNumber(offer.unitPrice)} ${offer.unitPriceUnit || ''}`.trim();
  }

  if (offer.unitPriceMin !== null && offer.unitPriceMin !== undefined) {
    const max = offer.unitPriceMax ?? offer.unitPriceMin;
    return `${toDanishNumber(offer.unitPriceMin)}-${toDanishNumber(max)} ${offer.unitPriceUnit || ''}`.trim();
  }

  return null;
}

function toDanishNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function compareOffers(a: Offer, b: Offer): number {
  const aAmbiguous = a.flags.includes('ambiguous_match');
  const bAmbiguous = b.flags.includes('ambiguous_match');
  if (aAmbiguous !== bAmbiguous) return aAmbiguous ? 1 : -1;

  if (a.sourceKind !== b.sourceKind) return a.sourceKind === 'direct' ? -1 : 1;

  const aUnit = parseUnitPrice(a.unitPriceText);
  const bUnit = parseUnitPrice(b.unitPriceText);
  if (aUnit !== bUnit) return aUnit - bUnit;
  if (a.price !== b.price) return a.price - b.price;
  if ((a.distanceMeters ?? Number.POSITIVE_INFINITY) !== (b.distanceMeters ?? Number.POSITIVE_INFINITY)) {
    return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY);
  }
  return a.chainName.localeCompare(b.chainName);
}

function parseUnitPrice(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const match = value.match(/[0-9]+(?:,[0-9]+)?/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[0].replace(',', '.'));
}

function isActive(offer: Offer): boolean {
  if (!offer.validFrom || !offer.validTo) return false;
  const now = new Date();
  return new Date(offer.validFrom) <= now && now <= new Date(offer.validTo);
}

function isUpcoming(offer: Offer): boolean {
  if (!offer.validFrom) return false;
  return new Date(offer.validFrom) > new Date();
}

function isEndingSoon(validTo: string): boolean {
  const now = new Date();
  const then = new Date(validTo);
  const diffMs = then.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 2 * 24 * 60 * 60 * 1000;
}

function dedupeOffers(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  const deduped: Offer[] = [];

  for (const offer of offers) {
    const key = [offer.query, offer.chainId, offer.productTitle, offer.price, offer.sizeText, offer.validFrom, offer.validTo].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(offer);
  }

  return deduped;
}

function pickBestPerQuery(offers: Offer[]): Offer[] {
  const byQuery = new Map<string, Offer[]>();

  for (const offer of offers) {
    const key = offer.query.toLowerCase();
    const existing = byQuery.get(key) || [];
    existing.push(offer);
    byQuery.set(key, existing);
  }

  return [...byQuery.values()]
    .map((group) => [...group].sort(compareOffers)[0])
    .filter(Boolean)
    .sort(compareOffers);
}

function resolveRadiusKm(request: SearchRequest): number {
  if (request.radiusKm !== null) return request.radiusKm;
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, 3);
  if (request.maxTransitMin !== null) return 5;
  return 3;
}

````

## File: `projects/nearby-offers-webapp/web/lib/search-api.ts`

````ts
import { mockSearchResponse } from '@/lib/mock-search-data';
import type { SearchRequest, SearchResponse } from '@/types/search-types';
import { validateSearchRequest } from '@/types/search-types';

export interface SearchApiOptions {
  endpoint?: string;
  useMock?: boolean;
  fetchImpl?: typeof fetch;
}

export async function searchOffers(
  request: SearchRequest,
  options: SearchApiOptions = {},
): Promise<SearchResponse> {
  validateSearchRequest(request);

  const { endpoint = '/api/search', useMock = false, fetchImpl = fetch } = options;

  if (useMock) {
    return buildMockResponse(request);
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = `Search request failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody?.error) {
        message = errorBody.error;
      }
    } catch {
      // ignore JSON parse failure and keep generic message
    }

    throw new Error(message);
  }

  return (await response.json()) as SearchResponse;
}

export function buildMockResponse(request: SearchRequest): SearchResponse {
  validateSearchRequest(request);

  const normalizedQueries = request.queries.map((query) => query.toLowerCase());
  const filteredGroups = mockSearchResponse.offerGroups.filter((group) =>
    normalizedQueries.includes(group.query.toLowerCase()),
  );

  const filteredOffers = filteredGroups.flatMap((group) => group.offers);
  const visibleStoreIds = new Set(filteredOffers.map((offer) => offer.storeId).filter(Boolean));
  const visibleOfferIds = new Set(filteredOffers.map((offer) => offer.offerId));

  return {
    ...mockSearchResponse,
    search: request,
    bestNow: mockSearchResponse.bestNow.filter((offer) => visibleOfferIds.has(offer.offerId)),
    upcoming: mockSearchResponse.upcoming.filter((offer) => visibleOfferIds.has(offer.offerId)),
    stores: mockSearchResponse.stores.filter((store) => visibleStoreIds.has(store.storeId)),
    chains: mockSearchResponse.chains.filter((chain) =>
      filteredOffers.some((offer) => offer.chainId === chain.chainId),
    ),
    offerGroups: filteredGroups,
    summary: {
      totalStoresInScope: mockSearchResponse.stores.filter(
        (store) => store.accessQualified && visibleStoreIds.has(store.storeId),
      ).length,
      totalOffersMatched: filteredOffers.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

````

## File: `projects/nearby-offers-webapp/web/lib/search-service.ts`

````ts
import { hasLocalOfferDb, runDbSearch } from '@/lib/db-search';
import { runPipelineSearch } from '@/lib/pipeline-search';
import type { SearchRequest, SearchResponse } from '@/types/search-types';

export async function executeSearch(request: SearchRequest): Promise<SearchResponse> {
  if (hasLocalOfferDb()) {
    return runDbSearch(request);
  }

  if (process.env.ALLOW_LIVE_SEARCH_FALLBACK === '1') {
    return runPipelineSearch(request);
  }

  throw new Error(
    'Lokal tilbudsdatabase mangler. Kør DB refresh-jobbet først, eller sæt ALLOW_LIVE_SEARCH_FALLBACK=1 for eksplicit live fallback.',
  );
}

````

## File: `projects/nearby-offers-webapp/web/types/meal-optimizer-types.ts`

````ts
export type AccessMode = 'radius' | 'walk' | 'transit';

export type IngredientCategory = 'meat' | 'vegetable' | 'dairy';
export type SlotRole = 'protein' | 'vegetable' | 'dairy' | 'other';
export type QuantityUnit = 'g' | 'kg' | 'ml' | 'dl' | 'piece';

export interface MealSearchRequest {
  address: string;
  accessMode: AccessMode;
  radiusKm: number | null;
  maxWalkKm: number | null;
  maxTransitMin: number | null;
  includeStorePairs: boolean;
}

export interface IngredientFamily {
  id: string;
  category: IngredientCategory;
  displayName: string;
  searchTerms: string[];
}

export interface IngredientQuantity {
  value: number;
  unit: QuantityUnit;
}

export interface AllowedIngredientFamily {
  ingredientFamilyId: string;
  quantityOverride?: IngredientQuantity;
}

export interface RecipeSlot {
  slotKey: string;
  role: SlotRole;
  quantity?: IngredientQuantity;
  allowedFamilies: AllowedIngredientFamily[];
}

export interface RecipeTemplate {
  id: string;
  slug: string;
  displayName: string;
  quantityBasis: 'perMeal' | 'perBatch';
  servingsPerBatch: number;
  slots: RecipeSlot[];
}

export interface StoreOption {
  storeId: string;
  chainId: string;
  storeName: string;
  distanceMeters: number;
}

export interface StorePairOption {
  storeA: StoreOption;
  storeB: StoreOption;
  interStoreDistanceMeters: number;
}

export interface BasketLine {
  ingredientFamilyId: string;
  ingredientFamilyName: string;
  productName: string;
  storeId: string;
  storeName: string;
  packageQuantity: number;
  packageUnit: QuantityUnit;
  packageBaseAmount: number;
  requiredAmountForRecipe: number;
  requiredAmountUnit: QuantityUnit;
  packagePriceDkk: number;
  apportionedCostDkk: number;
  leftoverAmount: number;
  leftoverUnit: QuantityUnit;
}

export interface MealCandidate {
  candidateId: string;
  recipeTemplateId: string;
  recipeName: string;
  servingsPerBatch: number;
  basketCostDkk: number;
  recipeCostDkk: number;
  pricePerMealDkk: number;
  storesUsed: StoreOption[];
  interStoreDistanceMeters: number | null;
  walkingDistanceMeters: number;
  chosenIngredients: {
    slotKey: string;
    ingredientFamilyId: string;
    ingredientFamilyName: string;
    requiredQuantity: IngredientQuantity;
  }[];
  basketLines: BasketLine[];
}

export interface MealSearchSummary {
  generatedAt: string;
  totalCandidates: number;
  totalStoresInScope: number;
  totalStorePairsConsidered: number;
}

export interface MealSearchResponse {
  resolvedAddress: string;
  search: MealSearchRequest;
  candidates: MealCandidate[];
  summary: MealSearchSummary;
}

````

## File: `projects/nearby-offers-webapp/web/types/search-types.ts`

````ts
export type AccessMode = 'radius' | 'walk' | 'transit';

export type SourceKind = 'direct' | 'fallback';

export type OfferFlag =
  | 'direct_source'
  | 'fallback_source'
  | 'app_price'
  | 'membership_price'
  | 'ambiguous_match'
  | 'starts_soon'
  | 'ends_soon';

export type Confidence = 'high' | 'medium' | 'low';

export interface SearchRequest {
  address: string;
  accessMode: AccessMode;
  radiusKm: number | null;
  maxWalkKm: number | null;
  maxTransitMin: number | null;
  queries: string[];
}

export interface ChainRow {
  chainId: string;
  name: string;
}

export interface StoreRow {
  storeId: string;
  chainId: string;
  name: string;
  distanceMeters: number;
  accessQualified: boolean;
  relevantOfferCount: number;
}

export interface Offer {
  offerId: string;
  query: string;
  chainId: string;
  chainName: string;
  storeId: string | null;
  storeName: string | null;
  productTitle: string;
  price: number;
  currency: string;
  sizeText: string | null;
  unitPriceText: string | null;
  distanceMeters: number | null;
  validFrom: string | null;
  validTo: string | null;
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceUrl: string;
  flags: OfferFlag[];
  confidence: Confidence;
}

export interface OfferGroup {
  query: string;
  offers: Offer[];
}

export interface SearchSummary {
  totalStoresInScope: number;
  totalOffersMatched: number;
  generatedAt: string;
}

export interface SearchResponse {
  resolvedAddress: string;
  search: SearchRequest;
  chains: ChainRow[];
  stores: StoreRow[];
  bestNow: Offer[];
  upcoming: Offer[];
  offerGroups: OfferGroup[];
  summary: SearchSummary;
}

export function validateSearchRequest(request: SearchRequest): void {
  if (!request.address.trim()) {
    throw new Error('address is required');
  }

  if (!request.queries.length) {
    throw new Error('at least one query is required');
  }

  const activeThresholds = [request.radiusKm, request.maxWalkKm, request.maxTransitMin].filter(
    (value) => value !== null,
  );

  if (activeThresholds.length !== 1) {
    throw new Error('exactly one threshold must be set');
  }

  if (request.accessMode === 'radius' && request.radiusKm === null) {
    throw new Error('radiusKm is required when accessMode=radius');
  }

  if (request.accessMode === 'walk' && request.maxWalkKm === null) {
    throw new Error('maxWalkKm is required when accessMode=walk');
  }

  if (request.accessMode === 'transit' && request.maxTransitMin === null) {
    throw new Error('maxTransitMin is required when accessMode=transit');
  }
}

````

