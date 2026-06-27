import { useState, useRef, useCallback } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useSaveState(autoResetMs = 2000) {
  const [state, setState] = useState<SaveState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setState('saving');
    try {
      await fn();
      setState('saved');
      timerRef.current = setTimeout(() => setState('idle'), autoResetMs);
    } catch (err) {
      setState('error');
      timerRef.current = setTimeout(() => setState('idle'), autoResetMs * 1.5); // error gets slightly longer
      throw err; // let the caller's own onError (toast, field error) still fire
    }
  }, [autoResetMs]);

  return { state, run };
}
