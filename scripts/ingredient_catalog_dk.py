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
    'chicken-fillet': {
        'label': 'Kyllingefilet',
        'queries': ['kyllingefilet', 'kyllingekød', 'kyllingebrystfilet', 'kyllingebryst'],
    },
}

VEGETABLE_FAMILIES = {'broccoli', 'cauliflower', 'white-cabbage', 'red-cabbage'}
DAIRY_FAMILIES = {'heavy-cream', 'creme-fraiche', 'skyr'}
MEAT_FAMILIES = {'minced-beef', 'minced-pork', 'minced-veal-pork', 'chicken-fillet'}


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


def _has_minced(text: str) -> bool:
    """Check if text indicates minced/hakket meat — includes 'hk ' abbreviation used by Rema 1000."""
    return 'hakket' in text or text.startswith('hk ') or ' hk ' in text


def text_matches_family(text: Any, family: str) -> bool:
    low = normalize_text(text)
    if not low:
        return False
    if family == 'minced-beef':
        has_beef = 'okse' in low and 'kalv' not in low and 'svin' not in low and 'gris' not in low and 'flaesk' not in low
        return has_beef and (_has_minced(low) or 'kologisk' in low)
    if family == 'minced-pork':
        return _has_minced(low) and ('svin' in low or 'svine' in low or 'grise' in low or 'gris' in low)
    if family == 'minced-veal-pork':
        return (_has_minced(low) and (('kalv' in low and ('flaesk' in low or 'svin' in low)) or 'grisekalve' in low or 'grise kalve' in low))
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
    if family == 'chicken-fillet':
        return 'kylling' in low and ('filet' in low or 'bryst' in low or 'koed' in low)
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
