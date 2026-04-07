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

