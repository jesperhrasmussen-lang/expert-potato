"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { PortionSize } from '@/types/meal-optimizer-types';

const STORAGE_KEY = 'meal-search-prefs';

interface StoredPrefs {
  address: string;
  includeStorePairs: boolean;
  portionSize: PortionSize;
}

interface AddressSuggestion {
  tekst: string;
  adresse: {
    vejnavn: string;
    husnr: string;
    postnr: string;
    postnrnavn: string;
  };
}

function loadPrefs(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return null;
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

function clearPrefs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({
          q: query,
          per_side: '6',
          fuzzy: '',
        });
        const res = await fetch(
          `https://api.dataforsyningen.dk/adresser/autocomplete?${params}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as AddressSuggestion[];
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // aborted or network error
      }
    }, 200);
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { suggestions, showSuggestions, fetchSuggestions, clearSuggestions, setShowSuggestions };
}

export function MealSearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [includeStorePairs, setIncludeStorePairs] = useState(false);
  const [portionSize, setPortionSize] = useState<PortionSize>('small');
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const { suggestions, showSuggestions, fetchSuggestions, clearSuggestions, setShowSuggestions } =
    useAddressAutocomplete();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) {
      setAddress(prefs.address);
      setIncludeStorePairs(prefs.includeStorePairs);
      setPortionSize(prefs.portionSize);
      setSaveOnDevice(true);
    }
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setShowSuggestions]);

  const canSubmit = address.trim().length > 0 && !locating;

  function onAddressChange(value: string) {
    setAddress(value);
    fetchSuggestions(value);
  }

  function onSelectSuggestion(suggestion: AddressSuggestion) {
    setAddress(suggestion.tekst);
    clearSuggestions();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation understøttes ikke af din browser.');
      return;
    }

    setLocating(true);
    setLocationError(null);
    clearSuggestions();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocating(false);
      },
      () => {
        setLocationError('Kunne ikke hente din placering. Indtast adresse manuelt.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    clearSuggestions();

    if (saveOnDevice) {
      savePrefs({ address, includeStorePairs, portionSize });
    } else {
      clearPrefs();
    }

    const params = new URLSearchParams({
      address,
      includeStorePairs: includeStorePairs ? '1' : '0',
      portionSize,
    });

    router.push(`/results?${params.toString()}`);
  }

  return (
    <form className="search-card" onSubmit={onSubmit}>
      {/* Address input with autocomplete */}
      <div className="field-group" ref={wrapperRef}>
        <label className="field-label" htmlFor="address">Adresse</label>
        <div className="autocomplete-wrapper">
          <input
            id="address"
            className="text-input"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder="Indtast din adresse..."
            autoComplete="off"
          />
          {showSuggestions && (
            <ul className="autocomplete-list">
              {suggestions.map((s, i) => (
                <li key={`${s.tekst}-${i}`}>
                  <button
                    type="button"
                    className="autocomplete-item"
                    onClick={() => onSelectSuggestion(s)}
                  >
                    {s.tekst}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="secondary-button location-button"
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {locating ? 'Finder placering...' : 'Brug nuværende placering'}
        </button>
        {locationError && <p className="input-error">{locationError}</p>}
      </div>

      {/* Meal size toggle */}
      <div className="field-group">
        <span className="field-label">Måltidsstørrelse</span>
        <div className="segmented-control segmented-control-two">
          <button
            type="button"
            className={`segment ${portionSize === 'small' ? 'segment-active' : ''}`}
            onClick={() => setPortionSize('small')}
          >
            Lille
          </button>
          <button
            type="button"
            className={`segment ${portionSize === 'large' ? 'segment-active' : ''}`}
            onClick={() => setPortionSize('large')}
          >
            Stor
          </button>
        </div>
      </div>

      {/* Shop count toggle */}
      <div className="field-group">
        <span className="field-label">Antal butikker</span>
        <div className="segmented-control segmented-control-two">
          <button
            type="button"
            className={`segment ${!includeStorePairs ? 'segment-active' : ''}`}
            onClick={() => setIncludeStorePairs(false)}
          >
            1 butik
          </button>
          <button
            type="button"
            className={`segment ${includeStorePairs ? 'segment-active' : ''}`}
            onClick={() => setIncludeStorePairs(true)}
          >
            2 butikker (300m)
          </button>
        </div>
      </div>

      {/* Save on device */}
      <div className="field-group">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={saveOnDevice}
            onChange={(e) => setSaveOnDevice(e.target.checked)}
          />
          <span>Gem mine valg på denne enhed</span>
        </label>
      </div>

      {/* Submit */}
      <button className="primary-button" type="submit" disabled={!canSubmit}>
        Find billigste måltider
      </button>
    </form>
  );
}
