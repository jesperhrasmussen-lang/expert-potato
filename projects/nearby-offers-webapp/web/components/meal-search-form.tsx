"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { PortionSize } from '@/types/meal-optimizer-types';

const STORAGE_KEY = 'meal-search-prefs';

interface StoredPrefs {
  address: string;
  portionSize: PortionSize;
  organicOnly?: boolean;
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

interface LocationOption {
  type: 'geolocation';
  label: string;
}

export function MealSearchForm() {
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [portionSize, setPortionSize] = useState<PortionSize>('small');
  const [organicOnly, setOrganicOnly] = useState(false);
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showLocationOption, setShowLocationOption] = useState(false);

  const { suggestions, showSuggestions, fetchSuggestions, clearSuggestions, setShowSuggestions } =
    useAddressAutocomplete();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) {
      setAddress(prefs.address);
      setPortionSize(prefs.portionSize);
      setOrganicOnly(prefs.organicOnly ?? false);
      setSaveOnDevice(true);
    }
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setShowLocationOption(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setShowSuggestions]);

  const canSubmit = address.trim().length > 0 && !locating;

  function onAddressChange(value: string) {
    setAddress(value);
    if (value.trim().length < 3) {
      setShowLocationOption(true);
    } else {
      setShowLocationOption(false);
    }
    fetchSuggestions(value);
  }

  function onAddressFocus() {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    } else if (address.trim().length < 3) {
      setShowLocationOption(true);
    }
  }

  function onSelectSuggestion(suggestion: AddressSuggestion) {
    setAddress(suggestion.tekst);
    clearSuggestions();
    setShowLocationOption(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation understøttes ikke af din browser.');
      return;
    }

    setLocating(true);
    setLocationError(null);
    clearSuggestions();
    setShowLocationOption(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // Reverse geocode via DAWA — this is the authoritative Denmark check.
        // DAWA returns 400 for coordinates far from Denmark.
        try {
          const res = await fetch(
            `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${longitude}&y=${latitude}&struktur=mini`,
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.betegnelse;
            if (addr) {
              setAddress(addr);
              setLocating(false);
              return;
            }
          }
        } catch {
          // Network error
        }

        // DAWA failed or returned no address — likely outside Denmark
        setLocationError('Din placering kunne ikke matches til en dansk adresse. Indtast en adresse manuelt.');
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
    setShowLocationOption(false);

    if (saveOnDevice) {
      savePrefs({ address, portionSize, organicOnly });
    } else {
      clearPrefs();
    }

    const params = new URLSearchParams({
      address,
      portionSize,
      organicOnly: organicOnly ? '1' : '0',
    });

    router.push(`/results?${params.toString()}`);
  }

  const showDropdown = showSuggestions || (showLocationOption && !showSuggestions);

  return (
    <form className="search-card" onSubmit={onSubmit}>
      {/* Address input with autocomplete + geolocation */}
      <div className="field-group" ref={wrapperRef}>
        <label className="field-label" htmlFor="address">📍 Adresse</label>
        <div className="autocomplete-wrapper">
          <input
            id="address"
            className="text-input"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            onFocus={onAddressFocus}
            placeholder={locating ? 'Finder placering...' : 'Din lokation'}
            autoComplete="off"
          />
          {showDropdown && (
            <ul className="autocomplete-list">
              {!showSuggestions && showLocationOption && (
                <li>
                  <button
                    type="button"
                    className="autocomplete-item autocomplete-location"
                    onClick={useCurrentLocation}
                    disabled={locating}
                  >
                    📍 {locating ? 'Finder placering...' : 'Brug din nuværende lokation'}
                  </button>
                </li>
              )}
              {showSuggestions && (
                <>
                  <li>
                    <button
                      type="button"
                      className="autocomplete-item autocomplete-location"
                      onClick={useCurrentLocation}
                      disabled={locating}
                    >
                      📍 {locating ? 'Finder...' : 'Brug nuværende lokation'}
                    </button>
                  </li>
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
                </>
              )}
            </ul>
          )}
        </div>
        {locationError && <p className="input-error">{locationError}</p>}
      </div>

      {/* Toggles — one per line, centered */}
      <div className="toggle-stack">
        <div className="toggle-group">
          <span className="toggle-label">Måltidsstørrelse</span>
          <div className="toggle-control">
            <button
              type="button"
              className={`toggle-btn ${portionSize === 'small' ? 'toggle-active' : ''}`}
              onClick={() => setPortionSize('small')}
            >
              soft girl
            </button>
            <button
              type="button"
              className={`toggle-btn ${portionSize === 'large' ? 'toggle-active' : ''}`}
              onClick={() => setPortionSize('large')}
            >
              gymbro
            </button>
          </div>
          <button
            type="button"
            className={`toggle-btn toggle-btn-wide ${portionSize === 'combined' ? 'toggle-active' : ''}`}
            onClick={() => setPortionSize('combined')}
          >
            soft girl + gymbro
          </button>
        </div>

        <div className="toggle-group">
          <span className="toggle-label">Økologisk</span>
          <div className="toggle-control">
            <button
              type="button"
              className={`toggle-btn ${!organicOnly ? 'toggle-active' : ''}`}
              onClick={() => setOrganicOnly(false)}
            >
              Alle tilbud
            </button>
            <button
              type="button"
              className={`toggle-btn ${organicOnly ? 'toggle-active' : ''}`}
              onClick={() => setOrganicOnly(true)}
            >
              Kun økologisk
            </button>
          </div>
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
        Start søgning &rsaquo;
      </button>
    </form>
  );
}
