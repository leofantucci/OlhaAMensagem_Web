import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapPin, Loader2, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function LocationAutocomplete({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const debounceTimer = useRef(null);
  const requestId = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      requestId.current += 1;
    };
  }, []);

  const handleInputChange = (event) => {
    const inputValue = event.target.value;
    onChange(inputValue);
    setHighlightedIndex(-1);
    setShowDropdown(false);
    setSuggestions([]);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const currentRequest = ++requestId.current;

    if (inputValue.trim().length < 3) {
      setLoading(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/api/autocomplete`, {
          params: { input: inputValue.trim() },
          timeout: 10000
        });

        // Ignora respostas antigas caso o usuário já tenha digitado outro texto.
        if (currentRequest !== requestId.current) return;
        const data = Array.isArray(response.data) ? response.data : [];
        setSuggestions(data);
        setShowDropdown(data.length > 0);
      } catch (error) {
        if (currentRequest === requestId.current) {
          console.error('Erro no autocomplete:', error.response?.data?.error || error.message);
          setSuggestions([]);
          setShowDropdown(false);
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 450);
  };

  const handleSelect = (suggestion) => {
    // A API já devolve a UF; o backend converte a sigla para o nome oficial ao geocodificar.
    const location = suggestion.location ||
      `${suggestion.mainText}${suggestion.stateCode ? `, ${suggestion.stateCode}` : ''}`;
    onChange(location);
    setShowDropdown(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setShowDropdown(false);
      return;
    }
    if (!showDropdown || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex(index => index < suggestions.length - 1 ? index + 1 : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex(index => index > 0 ? index - 1 : suggestions.length - 1);
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    }
  };

  const clearInput = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    requestId.current += 1;
    onChange('');
    setSuggestions([]);
    setShowDropdown(false);
    setLoading(false);
    setHighlightedIndex(-1);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-jarvis-muted" size={16} />
        <input
          type="text"
          className="input-jarvis w-full pl-10 pr-8"
          value={value || ''}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder || 'Digite a cidade (ex: Birigui, SP)...'}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-jarvis-cyan animate-spin" size={16} />
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={clearInput}
            aria-label="Limpar localização"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-jarvis-muted hover:text-jarvis-cyan"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 glass rounded-lg border border-jarvis-cyan/30 shadow-2xl max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.location || suggestion.mainText}-${suggestion.lat || index}`}
              type="button"
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-slate-700/50 last:border-0 ${
                index === highlightedIndex
                  ? 'bg-jarvis-cyan/10 text-jarvis-cyan'
                  : 'text-jarvis-text hover:bg-slate-800/50'
              }`}
            >
              <MapPin size={14} className={index === highlightedIndex ? 'text-jarvis-cyan' : 'text-jarvis-muted'} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{suggestion.mainText}</div>
                <div className="text-xs text-jarvis-muted truncate">{suggestion.secondaryText}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
