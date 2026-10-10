// Web Speech API dictation. Finalised phrases are committed through onFinal; the in-progress
// (interim) phrase is exposed separately so the caller can show it live without committing it.
import { useCallback, useEffect, useRef, useState } from 'react';

// Resolved lazily so feature detection reflects the current browser (and can be stubbed in tests)
const getRecognition = () => (typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);

const ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow it in site settings.',
  'service-not-allowed': 'Speech recognition is disabled in this browser.',
  'no-speech': 'No speech detected. Move closer to the microphone and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection.'
};

export default function useSpeechRecognition({ lang = 'en-US', onFinal } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition || recRef.current) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) onFinalRef.current?.(text.trim());
        else live += text;
      }
      setInterim(live.trim());
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted') setError(ERRORS[event.error] || `Voice input error: ${event.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim('');
    };

    setError(null);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      recRef.current = null;
      setError(err.message);
    }
  }, [lang]);

  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: !!getRecognition(), listening, interim, error, start, stop, toggle, clearError: () => setError(null) };
}
