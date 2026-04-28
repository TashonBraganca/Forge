import { useEffect, useRef } from 'react';
import { useTrainingStore } from '../store/training';

/**
 * Invisible client component that checks backend connectivity on app mount.
 * Logs connection status to console once, then silently polls.
 */
export default function BackendInit() {
  const checkBackend = useTrainingStore((s) => s.checkBackend);
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!hasLogged.current) {
      hasLogged.current = true;
      console.log('[FORGE] Checking backend at http://localhost:8421...');
      checkBackend();
    }
  }, [checkBackend]);

  return null;
}
