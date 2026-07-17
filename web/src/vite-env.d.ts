/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FUNCTIONS_URL?: string;
  readonly VITE_KFZ_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}
