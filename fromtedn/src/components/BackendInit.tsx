import { useEffect, useRef } from 'react';
import { useTrainingStore } from '../store/training';
import { useModelStore } from '../store/models';

/**
 * Invisible client component that checks backend connectivity on app mount.
 * Logs connection status to console once, then silently polls.
 */
export default function BackendInit() {
  const checkBackend = useTrainingStore((s) => s.checkBackend);
  const fetchOllamaModels = useModelStore((s) => s.fetchOllamaModels);
  const fetchRegistryModels = useModelStore((s) => s.fetchRegistryModels);
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!hasLogged.current) {
      hasLogged.current = true;
      console.log('[FORGE] Checking backend at http://localhost:8421...');
      checkBackend().then(() => {
        fetchOllamaModels();
        fetchRegistryModels();
      });
    }
  }, [checkBackend, fetchOllamaModels, fetchRegistryModels]);

  return null;
}
