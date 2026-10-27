import type { ReactNode } from 'react';

/** Mientras `loading`, el contenido se ve borroso y aparece un indicador girando encima. */
export function Loading({ loading, label, children }: { loading: boolean; label: string; children?: ReactNode }) {
  return (
    <div className={`loading-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <div className="loading-content" inert={loading}>
        {children}
      </div>
      {loading && (
        <div className="loading-overlay" role="status">
          <div className="loading-indicator">
            <span className="spinner" aria-hidden />
            <span className="loading-label">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
