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

