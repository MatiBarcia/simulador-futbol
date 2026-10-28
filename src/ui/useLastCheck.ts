import { useEffect, useState } from 'react';

/**
 * Cuándo revisó la nube por última vez si había datos nuevos (la última corrida terminada del workflow), aunque no haya
 * publicado nada. Sale de la API pública de GitHub: el repo se pasa al compilar (VITE_REPO, ver .github/workflows/update.yml).
 * Sin VITE_REPO (en desarrollo) o si la API no responde, no se muestra.
 */
export function useLastCheck(): string | undefined {
  const [at, setAt] = useState<string>();
  useEffect(() => {
    const repo = import.meta.env.VITE_REPO as string | undefined;
    if (!repo) return;
    let cancelled = false;
    fetch(`https://api.github.com/repos/${repo}/actions/workflows/update.yml/runs?status=success&per_page=1`)
      .then((res) => (res.ok ? (res.json() as Promise<{ workflow_runs: { updated_at: string }[] }>) : undefined))
      .then((json) => {
        const last = json?.workflow_runs[0]?.updated_at;
        if (!cancelled && last) setAt(last);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return at;
}
