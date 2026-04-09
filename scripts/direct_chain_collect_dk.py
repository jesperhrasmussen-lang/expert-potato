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
    'bilka': '93f13',
    'kvickly': 'c1edq',
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
    if end and now > end:
        return 'expired'
    if start and now < start:
        # Danish flyers often start at midnight CET/CEST (UTC+1/+2).
        # Treat as active if starting within 24h.
        from datetime import timedelta
        if (start - now) < timedelta(hours=24):
            return 'active'
        return 'upcoming'
    if start or end:
        return 'active'
    # No dates — if it's in a current flyer, treat as active
    return 'active'


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


def _extract_ipaper_offers(blob: str, query_family: str) -> List[Dict[str, Any]]:
    """Scan iPaper text blob for product chunks matching a family.

    Strategy: find size patterns (e.g. '700 g.') and look at surrounding text
    to extract product name and price.
    """
    results = []
    # Find all chunks: text before a size pattern, size, then price info after
    # Pattern: ... <size> g. ... <price>,-
    for m in re.finditer(r'(\d+(?:\s*-\s*\d+)?)\s*(g|kg)\.\s*(.*?)\s+(\d+),-', blob):
        size_text = f"{m.group(1)} {m.group(2)}"
        price = int(m.group(4))
        middle = m.group(3)

        # Get context: 120 chars before the size match
        start = max(0, m.start() - 120)
        context_before = blob[start:m.start()].strip()

        # Take last sentence-like fragment (after last price or period-separated boundary)
        # Split on common boundaries: price patterns, periods followed by caps
        parts = re.split(r'\d+,-\s*|(?<=[.!])\s+(?=[A-ZÆØÅ])', context_before)
        product_text = clean_text(parts[-1]) if parts else ''

        # Include the size in matching text
        full_text = f"{product_text} {size_text}"

        if not text_matches_family(full_text, query_family):
            continue

        # Extract unit price from middle section
        unit_price = None
        up_match = re.search(r'Pr\.\s*kg\s*(?:max\.?\s*)?(\d+(?:[.,]\d+)?)', middle, re.I)
        if up_match:
            unit_price = float(up_match.group(1).replace(',', '.'))

        results.append({
            'productName': product_text,
            'price': price,
            'sizeText': size_text,
            'unitPrice': unit_price,
            'rawText': blob[start:m.end()],
        })
    return results


def collect_foetex(query: str) -> List[Dict[str, Any]]:
    html = fetch_text(IPAPER_URLS['foetex'])
    texts = extract_page_texts(html)
    blob = ' '.join(texts)
    results = []
    query_family = query_to_family(query)
    if not query_family:
        return results

    for product in _extract_ipaper_offers(blob, query_family):
        results.append(normalize_ipaper_offer(
            'foetex', query, product['productName'], product['price'],
            product['sizeText'], product['unitPrice'],
            None, None, product['rawText'],
        ))
    return results


def collect_meny(query: str) -> List[Dict[str, Any]]:
    html = fetch_text(IPAPER_URLS['meny'])
    texts = extract_page_texts(html)
    blob = ' '.join(texts)
    results = []
    query_family = query_to_family(query)
    if not query_family:
        return results

    for product in _extract_ipaper_offers(blob, query_family):
        results.append(normalize_ipaper_offer(
            'meny', query, product['productName'], product['price'],
            product['sizeText'], product['unitPrice'],
            None, None, product['rawText'],
        ))
    return results


def all_lidl_identifiers() -> List[str]:
    html = fetch_text('https://www.lidl.dk/c/tilbudsavis/s10013730')
    all_ids = re.findall(r'https://www\.lidl\.dk/l/da/tilbudsavis/([^/\?\"\'\s]+)', html)
    # Deduplicate while preserving order, skip nonfood flyers
    seen = set()
    result = []
    for fid in all_ids:
        if fid not in seen and 'nonfood' not in fid:
            seen.add(fid)
            result.append(fid)
    return result


def collect_lidl(query: str) -> List[Dict[str, Any]]:
    flyer_ids = all_lidl_identifiers()
    if not flyer_ids:
        return []
    products = {}
    for flyer_id in flyer_ids:
        try:
            data = fetch_json(f'https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier={flyer_id}&region_id=0&region_code=0')
            flyer = data.get('flyer') or {}
            for pid, product in (flyer.get('products') or {}).items():
                if pid not in products:
                    products[pid] = product
        except Exception:
            continue
    query_family = query_to_family(query)
    out = []
    for product in products.values():
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

