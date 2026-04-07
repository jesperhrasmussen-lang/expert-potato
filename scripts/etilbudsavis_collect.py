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
