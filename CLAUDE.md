# Meal Optimizer - Danish Supermarket Offer Aggregator

## What this is

A Next.js frontend + Python backend that finds the 5 cheapest meals a user can cook from current Danish supermarket offers near their address.

## Meal model

Three interchangeable ingredient slots per meal:
- **Meat**: hakket oksekod / hakket svinekod / hakket kalv og flaesk
- **Vegetable**: broccoli / blomkal / hvidkal / rodkal
- **Dairy**: piskeflode / creme fraiche / skyr

## Business rules

- Chain pamphlets apply chain-wide (not branch-specific)
- User address is for nearest-branch distance only, not offer eligibility
- Show 5 cheapest meals, with full basket cost + prorated recipe cost + leftovers
- ml and grams treated 1:1 in V1
- App can use one store or a practical two-store combination

## Architecture

```
Next.js frontend (Vercel)
  /api/meal-search -> meal-search-service.ts -> search_offer_db_dk.py
  /api/search      -> pipeline-search.ts     -> find_nearby_offers_dk.py

Python pipeline (Hostinger VPS, cron)
  refresh_offer_db_dk.py
    direct_collect()   -> direct_chain_collect_dk.py
      Lidl       -> Schwarz flyer API
      Netto/Rema/Brugsen/SuperBrugsen/365discount -> Tjek API
      Fotex/Meny -> iPaper HTML scrape
    fallback_collect() -> etilbudsavis_collect.py (Tjek search API, paginated)
    salling_fallback() -> salling_collect_dk.py (BilkaToGo catalog, zero-result fallback)
  -> nearby_offer_db.py (SQLite write)

DB: SQLite on VPS (Postgres schema ready in meal-optimizer-v1.sql, migration not done)
```

## Key files

### Python scripts (`scripts/`)
| File | Purpose |
|---|---|
| `ingredient_catalog_dk.py` | Family definitions, text matching, normalization |
| `direct_chain_collect_dk.py` | Direct chain-specific scrapers (Lidl/Tjek/iPaper) |
| `etilbudsavis_collect.py` | Tjek search API fallback (paginated) |
| `salling_collect_dk.py` | Salling Group API fallback (BilkaToGo catalog prices) |
| `find_nearby_offers_dk.py` | End-to-end pipeline: geocode -> stores -> collect -> merge |
| `refresh_offer_db_dk.py` | Cron job: refresh SQLite DB from all sources |
| `nearby_offer_db.py` | SQLite schema + upsert logic |
| `nearby_offer_report.py` | Text/summary report builder |
| `search_offer_db_dk.py` | DB query for the web API |
| `audit_meal_ingredient_coverage_dk.py` | Coverage audit across chains/ingredients |
| `check_offer_db_dk.py` | DB health check |

### Frontend (`projects/nearby-offers-webapp/web/`)
| File | Purpose |
|---|---|
| `app/api/meal-search/route.ts` | Meal search API endpoint |
| `app/api/search/route.ts` | General search API endpoint |
| `lib/meal-search-service.ts` | Meal search orchestration |
| `lib/pipeline-search.ts` | Pipeline search orchestration |
| `lib/meal-pricing.ts` | Meal cost calculation logic |
| `lib/meal-catalog.ts` | Meal definitions |
| `components/meal-results-page-client.tsx` | Meal results UI |
| `components/search-form.tsx` | Search form UI |

## Tracked chains

lidl, netto, rema 1000, brugsen, superbrugsen, kvickly, 365discount, foetex, meny, bilka

## Key commands

```bash
# Audit ingredient coverage across all chains
python3 scripts/audit_meal_ingredient_coverage_dk.py --pretty

# Test etilbudsavis fallback collector
python3 scripts/etilbudsavis_collect.py "broccoli" --pretty

# Test direct chain collector
python3 scripts/direct_chain_collect_dk.py "hakket oksekod" --chain lidl --chain netto --pretty

# Test Salling API fallback (requires SALLING_API_TOKEN)
python3 scripts/salling_collect_dk.py "broccoli" --pretty

# Full pipeline for an address
python3 scripts/find_nearby_offers_dk.py --address "Tingvej 4A, 2300 Kobenhavn S" --query "hakket oksekod" --query "broccoli" --query "skyr"

# Refresh the offer DB
python3 scripts/refresh_offer_db_dk.py /path/to/nearby-offers.db

# Frontend dev
cd projects/nearby-offers-webapp/web && npm run dev
```

## Environment variables

- `SALLING_API_TOKEN` - Salling Group API token (optional, for BilkaToGo fallback)
- `REJSEPLANEN_ACCESS_ID` - Public transport filtering (not yet implemented)

## Recent fixes (do not redo)

1. **Pagination fix** in `etilbudsavis_collect.py` - was fetching only offset=0&limit=24, now loops all pages
2. **Added kvickly** to DEFAULT_CHAINS in `refresh_offer_db_dk.py` and `audit_meal_ingredient_coverage_dk.py`
3. **New `salling_collect_dk.py`** - BilkaToGo catalog prices as fallback for zero-result ingredients

## Audit results (2026-04-07)

Coverage from `audit_meal_ingredient_coverage_dk.py --pretty`:

| Ingredient | Direct hits | Chains |
|---|---|---|
| hakket oksekod | 6 | foetex, lidl, meny, netto, rema 1000 |
| hakket svinekod | 4 | brugsen, foetex, lidl, rema 1000 |
| hakket kalv og flaesk | 1 | foetex |
| broccoli | 1 | superbrugsen |
| **blomkal** | **0** | **none** |
| hvidkal | 1 | lidl |
| **rodkal** | **0** | **none** |
| **piskeflode** | **0** | **none** |
| **creme fraiche** | **0** | **none** |
| skyr | 6 | 365discount, lidl, superbrugsen |

**Main challenge**: 4/10 ingredients have zero results. Dairy (except skyr) and half the vegetables are missing. Data coverage quality is the primary blocker, not missing structure.
