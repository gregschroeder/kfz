type SpeechCtor = SpeechRecognitionConstructor;

const LISTEN_TIMEOUT_MS = 10_000;

function getSpeechRecognition(): SpeechCtor | null {
  const w = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return getSpeechRecognition() != null;
}

export type SpeechSession = {
  stop: () => void;
  result: Promise<string>;
};

export function startPrefixListen(onInterim?: (text: string) => void): SpeechSession {
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    throw new Error("Speech recognition not supported");
  }

  let rec: SpeechRecognition;
  let settled = false;
  let latest = "";
  let timeoutId: number | undefined;

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    fn();
  };

  const result = new Promise<string>((resolve, reject) => {
    rec = new Ctor();
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (!last?.[0]) return;

      latest = last[0].transcript;
      onInterim?.(latest);

      if (last.isFinal) {
        finish(() => resolve(latest));
        rec.stop();
      }
    };

    rec.onerror = () => {
      finish(() => {
        if (latest) {
          resolve(latest);
          return;
        }
        reject(new Error("Could not recognize speech"));
      });
    };

    rec.onend = () => {
      finish(() => {
        if (latest) {
          resolve(latest);
          return;
        }
        reject(new Error("No speech heard"));
      });
    };

    timeoutId = window.setTimeout(() => {
      rec.stop();
    }, LISTEN_TIMEOUT_MS);

    rec.start();
  });

  return {
    stop: () => rec.stop(),
    result,
  };
}

/** @deprecated Use startPrefixListen for tap-to-stop. */
export function listenForPrefix(): Promise<string> {
  return startPrefixListen().result;
}
