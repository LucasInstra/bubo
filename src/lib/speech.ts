import { useEffect, useState } from "react";

/**
 * Small wrapper over the Web Speech API. The webview ships Windows voices, so
 * the app can read English without a backend or a download.
 */
const ENGLISH_LANG = /^en([-_]|$)/i;

let voices: SpeechSynthesisVoice[] = [];
let listening = false;
let pendingSpeak: number | null = null;

export function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function readVoices() {
  if (!speechSupported()) return;
  voices = window.speechSynthesis.getVoices();
}

/**
 * WebView2 fills the voice list asynchronously, so the first read is empty on a
 * cold start. Read again and keep a module listener for `voiceschanged`.
 */
function loadVoices() {
  if (!speechSupported()) return;
  readVoices();
  if (listening) return;
  listening = true;
  window.speechSynthesis.addEventListener("voiceschanged", readVoices);
}

/** True when the webview exposes at least one installed voice. */
export function speechReady(): boolean {
  if (!speechSupported()) return false;
  if (voices.length === 0) loadVoices();
  return voices.length > 0;
}

/** Re-renders when the voice list arrives (or never does). */
export function useSpeechReady(): boolean {
  const [ready, setReady] = useState(() => speechReady());

  useEffect(() => {
    if (!speechSupported()) return;
    loadVoices();
    const update = () => setReady(speechReady());
    update();
    // Some webviews never fire `voiceschanged`; one late re-check is enough to
    // keep the button from staying hidden when the list was just slow.
    const timer = window.setTimeout(update, 600);
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", update);
    };
  }, []);

  return ready;
}

/**
 * Markdown is for the eyes: `**bold**`, headings and links would be read as
 * symbols or URLs, so the voice gets a plain sentence. Code-like text such as
 * `C#` or `snake_case` must survive, so only real emphasis is removed.
 */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*[>#]+[ \t]*/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/g, "$1$2")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefers an installed American voice, then any English voice. */
export function pickEnglishVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = list.filter((voice) => ENGLISH_LANG.test(voice.lang));
  const american = english.find((voice) => voice.lang.toLowerCase().startsWith("en-us"));
  return american ?? english[0] ?? null;
}

export interface SpeakOptions {
  lang?: string;
  rate?: number;
}

/** Reads the text out loud, replacing whatever was being spoken. */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!speechSupported()) return false;
  const plain = speechText(text);
  if (!plain) return false;

  const synth = window.speechSynthesis;
  if (voices.length === 0) loadVoices();
  if (pendingSpeak !== null) {
    window.clearTimeout(pendingSpeak);
    pendingSpeak = null;
  }
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = options.lang ?? "en-US";
  utterance.rate = options.rate ?? 0.95;
  const voice = pickEnglishVoice(voices);
  if (voice) utterance.voice = voice;

  // Chromium sometimes drops a `speak` issued in the same tick as `cancel`.
  pendingSpeak = window.setTimeout(() => {
    pendingSpeak = null;
    synth.speak(utterance);
  }, 0);
  return true;
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  if (pendingSpeak !== null) {
    window.clearTimeout(pendingSpeak);
    pendingSpeak = null;
  }
  window.speechSynthesis.cancel();
}
