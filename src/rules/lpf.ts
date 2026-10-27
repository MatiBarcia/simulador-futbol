// Reglas de la Liga Profesional que cambian por temporada. Ver docs/REGLAS-2026.md.
import type { Match } from '../domain/types.ts';

export interface PromediosRules {
  /** Temporadas que se promedian (las últimas 3, incluida la actual). */
  seasons: number[];
  /** Qué partidos suman: solo la fase regular de cada torneo (art. 26; los playoffs no cuentan). */
  counts: (m: Match) => boolean;
  /** Decimales con los que se publica y compara el promedio. Se trunca, no se redondea (validado contra La Nación, 2026). */
  decimals: number;
}

export const promediosRules = (season: number): PromediosRules => ({
  seasons: [season - 2, season - 1, season],
  counts: (m) => m.phase === 'regular',
  decimals: 3,
});

/** Una posición de la fase de zonas: [zona, puesto]. */
export type Seed = [group: string, position: number];

/**
 * Cuadro fijo de los playoffs del Apertura/Clausura (art. 10–11 / 16–17), en el orden en que se dibuja la llave:
 * cada par consecutivo se cruza en la ronda siguiente (C1 = P1-P8, C4 = P4-P5, S1 = C1-C4, S2 = C2-C3).
 */
export const PLAYOFF_BRACKET_R16: [Seed, Seed][] = [
  [['A', 1], ['B', 8]], // P1
  [['B', 4], ['A', 5]], // P8
  [['B', 2], ['A', 7]], // P4
  [['A', 3], ['B', 6]], // P5
  [['B', 1], ['A', 8]], // P2
  [['A', 4], ['B', 5]], // P7
  [['A', 2], ['B', 7]], // P3
  [['B', 3], ['A', 6]], // P6
];

export interface SeasonRules {
  /** Torneos cuya fase regular forma la Tabla General (anual). */
  annualTournaments: string[];
  /** Torneos con zonas y playoffs, en orden. */
  zoneTournaments: string[];
  playoffSpotsPerZone: number;
  /** En el Clausura, los equipos en zona de descenso no juegan los playoffs (art. 14.1.2). */
  relegatedSkipPlayoffs: string[];
  relegation: { byPromedio: number; byAnnualTable: number };
}

export function seasonRules(season: number): SeasonRules {
  if (season === 2024) {
    return {
      annualTournaments: ['copa-de-la-liga', 'liga'],
      zoneTournaments: ['copa-de-la-liga'],
      playoffSpotsPerZone: 4,
      relegatedSkipPlayoffs: [],
      relegation: { byPromedio: 1, byAnnualTable: 1 },
    };
  }
  return {
    annualTournaments: ['apertura', 'clausura'],
    zoneTournaments: ['apertura', 'clausura'],
    playoffSpotsPerZone: 8,
    relegatedSkipPlayoffs: ['clausura'],
    relegation: { byPromedio: 1, byAnnualTable: 1 },
  };
}
