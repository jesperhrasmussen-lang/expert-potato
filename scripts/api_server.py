#!/usr/bin/env python3
"""FastAPI server wrapping the meal search pipeline.

Exposes POST /api/meal-search for the Vercel-hosted frontend.
"""
import datetime
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add scripts dir to path so we can import local modules
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from functools import lru_cache
from find_nearby_offers_dk import geocode as _geocode_raw, nearby_places as _nearby_raw, dedupe_chains, apply_access_filters


@lru_cache(maxsize=128)
def geocode_cached(address: str):
    return _geocode_raw(address)


_nearby_cache: dict = {}

def nearby_cached(lat: float, lon: float, radius_km: float):
    key = (round(lat, 4), round(lon, 4), radius_km)
    if key not in _nearby_cache:
        _nearby_cache[key] = _nearby_raw(lat, lon, radius_km)
    return _nearby_cache[key]
from ingredient_catalog_dk import query_to_family

DB_PATH = SCRIPTS_DIR.parent / "projects" / "nearby-offers-webapp" / "data" / "nearby-offers.db"
CATALOG_PATH = SCRIPTS_DIR.parent / "projects" / "nearby-offers-webapp" / "config" / "meal-optimizer-v2-catalog.json"

app = FastAPI(title="Nearby Meals API", version="1.0")

ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class MealSearchRequest(BaseModel):
    address: str
    radiusKm: Optional[float] = 20.0
    maxWalkKm: Optional[float] = None
    maxTransitMin: Optional[float] = None
    includeStorePairs: bool = True
    portionSize: str = "medium"
    organicOnly: bool = False


@app.post("/api/meal-search")
async def meal_search(req: MealSearchRequest):
    if not Path(DB_PATH).exists():
        raise HTTPException(status_code=503, detail="Offer database not found")

    # 1. Geocode (cached)
    try:
        lat, lon, resolved_address = geocode_cached(req.address)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not geocode address: {req.address}")

    # 2. Find nearby places (cached, rounded to ~11m for sharing)
    rlat = round(lat, 4)
    rlon = round(lon, 4)
    radius = req.radiusKm or 20.0
    places = list(nearby_cached(rlat, rlon, radius))

    # 3. Apply access filters if needed
    if req.maxWalkKm is not None or req.maxTransitMin is not None:
        places = apply_access_filters(places, lat, lon, req.maxWalkKm, req.maxTransitMin)

    # 4. Get chains
    chains = dedupe_chains(places)

    # 5. Load catalog to get search terms
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)

    queries = []
    for family in catalog.get("ingredientFamilies", []):
        queries.extend(family.get("searchTerms", []))

    # 6. Query DB for offers — get all active offers and match by family + product name
    today = datetime.date.today().isoformat()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    valid_states = ('active', 'undated', 'upcoming')
    placeholders = ','.join('?' for _ in valid_states)
    if req.organicOnly:
        all_active = conn.execute(
            f"SELECT * FROM offers WHERE expires_at >= ? AND offer_state IN ({placeholders}) AND is_organic = 1",
            [today, *valid_states],
        ).fetchall()
    else:
        all_active = conn.execute(
            f"SELECT * FROM offers WHERE expires_at >= ? AND offer_state IN ({placeholders})",
            [today, *valid_states],
        ).fetchall()
    conn.close()

    # Build family ID set from catalog
    family_ids = {f["id"] for f in catalog.get("ingredientFamilies", [])}

    offers = []
    seen_keys = set()
    for row in all_active:
        offer = dict(row)
        qf = offer.get("query_family", "")

        # Direct family match
        if qf in family_ids:
            key = (offer.get("offer_key", ""), qf)
            if key not in seen_keys:
                seen_keys.add(key)
                offer["query"] = qf
                offers.append(offer)

        # Cross-match: if product name contains "kylling", also emit as chicken-fillet
        pname = (offer.get("product_name") or "").lower()
        if "chicken-fillet" in family_ids and "kylling" in pname:
            key = (offer.get("offer_key", ""), "chicken-fillet")
            if key not in seen_keys:
                seen_keys.add(key)
                chicken_offer = dict(offer)
                chicken_offer["query"] = "kyllingekød"
                chicken_offer["query_family"] = "chicken-fillet"
                offers.append(chicken_offer)

    # 7. Map to frontend format (skip add_groups — we set comparisonGroup from query_family directly)
    mapped_offers = []
    for o in offers:
        mapped_offers.append({
            "query": o.get("query", ""),
            "store": o.get("chain_key", ""),
            "storeNormalized": o.get("chain_key", ""),
            "productName": o.get("product_name", ""),
            "description": o.get("description"),
            "price": o.get("price_regular"),
            "effectivePrice": o.get("price_effective"),
            "currency": o.get("currency", "DKK"),
            "sizeText": o.get("size_text"),
            "sizeGramsMin": o.get("size_grams_min"),
            "sizeGramsMax": o.get("size_grams_max"),
            "unitPrice": o.get("unit_price"),
            "unitPriceUnit": o.get("unit_price_unit"),
            "offerStartDate": o.get("offer_start_at"),
            "offerEndDate": o.get("offer_end_at"),
            "offerState": o.get("offer_state", "active"),
            "comparisonGroup": o.get("query_family"),
            "sourceKind": o.get("source_kind"),
            "confidence": o.get("confidence"),
            "isOrganic": bool(o.get("is_organic")),
        })

    mapped_places = []
    for p in places:
        mapped_places.append({
            "name": p.get("name", ""),
            "brand": p.get("brand"),
            "address": p.get("address", ""),
            "lat": p.get("lat"),
            "lon": p.get("lon"),
            "distanceKm": p.get("distanceKm"),
            "walkDistanceKm": p.get("walkDistanceKm"),
        })

    return {
        "address": req.address,
        "resolvedAddress": resolved_address,
        "radiusKm": req.radiusKm,
        "maxWalkKm": req.maxWalkKm,
        "maxTransitMin": req.maxTransitMin,
        "lat": lat,
        "lon": lon,
        "chains": chains,
        "places": mapped_places,
        "dbOfferCount": len(mapped_offers),
        "offers": mapped_offers,
        "summary": {},
    }


@app.get("/health")
async def health():
    db_exists = Path(DB_PATH).exists()
    offer_count = 0
    if db_exists:
        try:
            conn = sqlite3.connect(str(DB_PATH))
            offer_count = conn.execute("SELECT COUNT(*) FROM offers").fetchone()[0]
            conn.close()
        except Exception:
            pass
    return {"status": "ok", "db_exists": db_exists, "offer_count": offer_count}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("API_PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)
