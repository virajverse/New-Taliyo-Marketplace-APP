'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Mic, Loader2, X, ArrowRight } from 'lucide-react';

interface SearchBarProps {
  defaultValue?: string;
  placeholder?: string;
}

export default function SearchBar({
  defaultValue = '',
  placeholder = 'Search services, technologies, or solutions...',
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/search');
    }
  };

  const handleVoiceSearch = () => {
    if (typeof window === 'undefined') return;

    interface SpeechRecognitionEventLike {
      results: ArrayLike<ArrayLike<{ transcript?: string }>>;
    }

    interface SpeechRecognitionInstance {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onstart: (() => void) | null;
      onresult: ((event: SpeechRecognitionEventLike) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    }

    type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceNotice('Voice search is not supported on this browser. Please type to search.');
      inputRef.current?.focus();
      setTimeout(() => setVoiceNotice(null), 3500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setQuery(transcript);
          setIsListening(false);
          router.push(`/search?q=${encodeURIComponent(transcript.trim())}`);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  return (
    <div className="w-full space-y-1.5">
      <form
        onSubmit={handleSubmit}
        className={`relative w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#111222]/90 border shadow-lg shadow-black/40 backdrop-blur-md transition-all ${
          isListening
            ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/40'
            : 'border-purple-500/20 focus-within:border-purple-500/60 focus-within:shadow-[0_0_20px_-3px_rgba(168,85,247,0.3)]'
        }`}
      >
        <Search className="w-5 h-5 text-purple-300/60 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isListening ? 'Listening... Speak now' : placeholder}
          className="w-full bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleVoiceSearch}
          title={isListening ? 'Listening...' : 'Voice Search'}
          aria-label="Voice Search"
          className={`p-1.5 rounded-full transition-all flex-shrink-0 cursor-pointer ${
            isListening
              ? 'bg-fuchsia-500 text-white animate-pulse'
              : 'text-purple-400/80 hover:text-fuchsia-400 hover:bg-purple-500/10'
          }`}
        >
          {isListening ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>
        {query.trim() && (
          <button
            type="submit"
            aria-label="Search now"
            className="p-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer flex-shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </form>
      {voiceNotice && (
        <p className="text-[11px] text-amber-300 px-2 font-medium">{voiceNotice}</p>
      )}
    </div>
  );
}
