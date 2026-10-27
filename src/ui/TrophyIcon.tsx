import type { ReactElement } from 'react';
import type { TitleKind } from '../engine/titleGraph.ts';

// Ilustraciones propias (no son fotos de los trofeos reales): una forma distinta por título para reconocerlos de un vistazo.

/** Copa clásica: copa con asas, pie y base. */
function Cup({ handles = true, band }: { handles?: boolean; band?: 'argentina' }) {
  return (
    <>
      {handles && (
        <path className="trophy-line" d="M13 10H7a5 5 0 0 0 6 10M35 10h6a5 5 0 0 1-6 10" fill="none" strokeWidth="2.5" strokeLinecap="round" />
      )}
      <path className="trophy-main" d="M12 5h24v11a12 12 0 0 1-24 0z" />
      {band === 'argentina' && (
        <>
          <path className="trophy-celeste" d="M12 9h24v4H12z" />
          <path className="trophy-celeste" d="M13.2 19.5h21.6a12 12 0 0 1-1.6 3.5H14.8a12 12 0 0 1-1.6-3.5z" />
        </>
      )}
      <path className="trophy-main" d="M21.5 27h5v7h-5z" />
      <path className="trophy-main" d="M16 34h16v4H16z" />
      <path className="trophy-base" d="M12 39h24v10H12z" />
    </>
  );
}

const ICONS: Record<TitleKind, () => ReactElement> = {
  // Recopa: la copa más grande, con una estrella en el centro.
  recopa: () => (
    <>
      <Cup />
      <path className="trophy-shine" d="M24 9.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" />
    </>
  ),
  // Copa Argentina: copa clásica con los colores de la bandera.
  copaArgentina: () => <Cup band="argentina" />,
  // Supercopa Argentina: copa alta y fina, sin asas.
  supercopaArgentina: () => (
    <>
      <path className="trophy-main" d="M16 3h16l-2 14a6 6 0 0 1-12 0z" />
      <path className="trophy-celeste" d="M16.6 7.5h14.8l-.4 3H17z" />
      <path className="trophy-main" d="M22.5 23h3v12h-3z" />
      <path className="trophy-main" d="M17 35h14v4H17z" />
      <path className="trophy-base" d="M13 39h22v10H13z" />
    </>
  ),
  // Supercopa Internacional: un globo sobre un pie.
  supercopaInternacional: () => (
    <>
      <circle className="trophy-main" cx="24" cy="15" r="11" />
      <path className="trophy-line" d="M13 15h22M24 4c-5 4-5 18 0 22M24 4c5 4 5 18 0 22M15 9.5h18M15 20.5h18" fill="none" strokeWidth="1.3" />
      <path className="trophy-main" d="M21 26h6l2 9H19z" />
      <path className="trophy-main" d="M16 35h16v4H16z" />
      <path className="trophy-base" d="M12 39h24v10H12z" />
    </>
  ),
  // Trofeo de Campeones: una estrella sobre una columna.
  trofeo: () => (
    <>
      <path className="trophy-main" d="M24 2l4.4 8.9 9.8 1.4-7.1 6.9 1.7 9.8L24 24.4l-8.8 4.6 1.7-9.8-7.1-6.9 9.8-1.4z" />
      <path className="trophy-main" d="M21.5 27h5v8h-5z" />
      <path className="trophy-main" d="M16 35h16v4H16z" />
      <path className="trophy-base" d="M12 39h24v10H12z" />
    </>
  ),
  // Campeón de Liga: un escudo con una estrella.
  liga: () => (
    <>
      <path className="trophy-main" d="M24 3l17 6v13c0 12-8 20-17 25-9-5-17-13-17-25V9z" />
      <path className="trophy-shine" d="M24 14l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L24 28.9l-5.8 3 1.1-6.5-4.7-4.6 6.5-.9z" />
    </>
  ),
  // Apertura y Clausura: copa clásica con la inicial en la base.
  apertura: () => (
    <>
      <Cup />
      <text className="trophy-letter" x="24" y="47.5" textAnchor="middle">
        A
      </text>
    </>
  ),
  clausura: () => (
    <>
      <Cup />
      <text className="trophy-letter" x="24" y="47.5" textAnchor="middle">
        C
      </text>
    </>
  ),
};

export function TrophyIcon({ kind, muted }: { kind: TitleKind; muted?: boolean }) {
  const Icon = ICONS[kind];
  return (
    <svg className={`trophy trophy-${kind} ${muted ? 'is-muted' : ''}`} viewBox="0 0 48 52" width="40" height="44" aria-hidden>
      <Icon />
    </svg>
  );
}
