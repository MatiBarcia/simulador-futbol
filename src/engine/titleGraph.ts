// Árbol de títulos nacionales: la Recopa de Campeones arriba y, hacia abajo, los títulos que definen quién la juega
// (art. 20–31 del reglamento LPF 2026, docs/REGLAS-2026.md secciones 1 y 7–10).
import type { Match, SeasonData, TeamId } from '../domain/types.ts';
import { knownTitle, seasonRules } from '../rules/lpf.ts';
import { matchWinner } from './bracket.ts';
import type { Objective, TeamOdds } from './simulate.ts';
import { computeStandings } from './standings.ts';

export interface Odds {
  teamId: TeamId;
  probability: number;
}

export type TitleState =
  /** Ya se jugó. */
  | { kind: 'decided'; champion: TeamId; runnerUp?: TeamId; score?: string; date?: string }
  /** Ya se sabe quiénes la juegan (un partido). */
  | { kind: 'match'; teams: [TeamId, TeamId]; date: string; odds?: [number, number] }
  /** Se está jugando o falta definir quién la gana: candidatos con su probabilidad de salir campeón. */
  | { kind: 'open'; odds: Odds[]; matches?: Pick<Match, 'homeId' | 'awayId' | 'date' | 'phase'>[] }
  /** Falta definir quiénes la juegan: probabilidad de cada equipo de jugarla. */
  | { kind: 'entrants'; slots: number; odds: Odds[] }
  /** Depende de títulos que todavía ni empezaron. */
  | { kind: 'future' };

export type TitleKind = 'recopa' | 'supercopaArgentina' | 'supercopaInternacional' | 'trofeo' | 'copaArgentina' | 'liga' | 'apertura' | 'clausura';

export interface TitleNode {
  id: string;
  kind: TitleKind;
  year: number;
  /** Ids de los títulos que definen quién juega este. */
  inputs: string[];
  state: TitleState;
}

export interface TitleGraph {
  /** Año de la Recopa de arriba. */
  year: number;
  /** Filas de arriba hacia abajo, con los ids de los títulos en el orden en que se dibujan. */
  levels: string[][];
  nodes: Record<string, TitleNode>;
}

export const TITLE_NAMES: Record<TitleKind, string> = {
  recopa: 'Recopa de Campeones',
  supercopaArgentina: 'Supercopa Argentina',
  supercopaInternacional: 'Supercopa Internacional',
  trofeo: 'Trofeo de Campeones',
  copaArgentina: 'Copa Argentina',
  liga: 'Campeón de Liga',
  apertura: 'Torneo Apertura',
  clausura: 'Torneo Clausura',
};

/** Quién juega cada título (para mostrarlo debajo del nombre). */
export const TITLE_RULES: Record<TitleKind, string> = {
  recopa: 'Triangular entre los campeones de la Copa Argentina, la Supercopa Argentina y la Supercopa Internacional del año anterior',
  supercopaArgentina: 'Ganador del Trofeo de Campeones vs. campeón de la Copa Argentina del año anterior',
  supercopaInternacional: 'Ganador del Trofeo de Campeones vs. Campeón de Liga del año anterior',
  trofeo: 'Campeón del Apertura vs. campeón del Clausura',
  copaArgentina: '64 equipos de todas las categorías, eliminación directa',
  liga: '1° de la tabla anual',
  apertura: 'Zonas y playoffs',
  clausura: 'Zonas y playoffs',
};

const id = (kind: TitleKind, year: number) => `${kind}-${year}`;

export interface TitleGraphInput {
  seasons: SeasonData[];
  /** Copas del año actual (Copa Argentina, Supercopa Argentina, ...). */
  cups: SeasonData[];
  current: number;
  /** Probabilidades de la simulación de la nube, si están. */
  odds?: TeamOdds[];
  /** Torneo que se está jugando (las probabilidades de "champion" son de ese torneo). */
  tournamentId?: string;
}

/**
 * El árbol que termina en la Recopa de `recopaYear`. La Recopa de N+1 la juegan los campeones de la Copa Argentina y las
 * Supercopas de N; las Supercopas de N salen del Trofeo, la Copa Argentina y el Campeón de Liga de N-1; el Trofeo, del
 * Apertura y el Clausura.
 */
export function buildTitleGraph(input: TitleGraphInput, recopaYear: number): TitleGraph {
  const n = recopaYear - 1; // año de las supercopas que definen esta Recopa
  const prev = n - 1; // año de los títulos que definen esas supercopas
  const nodes: Record<string, TitleNode> = {};
  const add = (kind: TitleKind, year: number, inputs: string[] = []) => {
    nodes[id(kind, year)] = { id: id(kind, year), kind, year, inputs, state: titleState(input, kind, year) };
  };
  add('recopa', recopaYear, [id('copaArgentina', n), id('supercopaArgentina', n), id('supercopaInternacional', n)]);
  add('copaArgentina', n);
  add('supercopaArgentina', n, [id('copaArgentina', prev), id('trofeo', prev)]);
  add('supercopaInternacional', n, [id('trofeo', prev), id('liga', prev)]);
  add('copaArgentina', prev);
  add('trofeo', prev, [id('apertura', prev), id('clausura', prev)]);
  add('liga', prev);
  add('apertura', prev);
  add('clausura', prev);
  return {
    year: recopaYear,
    levels: [
      [id('recopa', recopaYear)],
      [id('copaArgentina', n), id('supercopaArgentina', n), id('supercopaInternacional', n)],
      [id('copaArgentina', prev), id('trofeo', prev), id('liga', prev)],
      [id('apertura', prev), id('clausura', prev)],
    ],
    nodes,
  };
}

function titleState(input: TitleGraphInput, kind: TitleKind, year: number): TitleState {
  const { current } = input;
  const odds = (objective: Objective) =>
    (input.odds ?? [])
      .map((o) => ({ teamId: o.teamId, probability: o[objective] }))
      .filter((o) => o.probability > 0)
      .sort((a, b) => b.probability - a.probability);
  const season = input.seasons.find((s) => s.season === year);

  switch (kind) {
    case 'apertura':
    case 'clausura': {
      const final = season?.matches.find((m) => m.tournamentId === kind && m.phase === 'final');
      const decided = final && finalResult(final);
      if (decided) return decided;
      if (year === current && input.tournamentId === kind) return { kind: 'open', odds: odds('champion') };
      return { kind: 'future' };
    }
    case 'liga': {
      if (season && year < current) return { kind: 'decided', champion: leagueChampion(season) };
      if (year === current) return { kind: 'open', odds: odds('leagueChampion') };
      return { kind: 'future' };
    }
    case 'trofeo': {
      const known = knownTitle(year, 'trofeo');
      if (known) return { kind: 'decided', ...known };
      return year === current ? { kind: 'open', odds: odds('trofeo') } : { kind: 'future' };
    }
    case 'copaArgentina': {
      const known = knownTitle(year, 'copaArgentina');
      if (known) return { kind: 'decided', ...known };
      if (year !== current) return { kind: 'future' };
      const matches = input.cups.find((c) => c.competition === 'copa-argentina')?.matches ?? [];
      const final = matches.find((m) => m.phase === 'final');
      const decided = final && finalResult(final);
      if (decided) return decided;
      const pending = matches.filter((m) => m.status !== 'finished' && m.status !== 'cancelled');
      return { kind: 'open', odds: odds('copaArgentina'), matches: pending.map(({ homeId, awayId, date, phase }) => ({ homeId, awayId, date, phase })) };
    }
    case 'supercopaArgentina': {
      if (year === current) {
        const final = input.cups.find((c) => c.competition === 'supercopa-argentina')?.matches.find((m) => m.phase === 'final');
        if (final) {
          const decided = finalResult(final);
          if (decided) return decided;
          const byTeam = new Map(odds('supercopaArgentina').map((o) => [o.teamId, o.probability]));
          const p: [number, number] | undefined = input.odds ? [byTeam.get(final.homeId) ?? 0, byTeam.get(final.awayId) ?? 0] : undefined;
          return { kind: 'match', teams: [final.homeId, final.awayId], date: final.date, odds: p };
        }
      }
      return year === current + 1 ? { kind: 'entrants', slots: 2, odds: odds('superArg') } : { kind: 'future' };
    }
    case 'supercopaInternacional': {
      const known = knownTitle(year, 'supercopaInternacional');
      if (known) return { kind: 'decided', ...known };
      return year === current + 1 ? { kind: 'entrants', slots: 2, odds: odds('superInt') } : { kind: 'future' };
    }
    case 'recopa':
      return year === current + 1 ? { kind: 'entrants', slots: 3, odds: odds('recopa') } : { kind: 'future' };
  }
}

function finalResult(final: Match): TitleState | undefined {
  const champion = matchWinner(final);
  if (!champion) return undefined;
  const home = champion === final.homeId;
  const runnerUp = home ? final.awayId : final.homeId;
  // El marcador, desde el lado del campeón.
  const [g1, g2] = home ? [final.homeGoals, final.awayGoals] : [final.awayGoals, final.homeGoals];
  const p = final.penalties && (home ? [final.penalties.home, final.penalties.away] : [final.penalties.away, final.penalties.home]);
  return { kind: 'decided', champion, runnerUp, score: `${g1}-${g2}${p ? ` (${p[0]}-${p[1]} pen.)` : ''}`, date: final.date };
}

/** 1° de la tabla anual de una temporada terminada. */
function leagueChampion(season: SeasonData): TeamId {
  const rules = seasonRules(season.season);
  const matches = season.matches.filter((m) => m.phase === 'regular' && rules.annualTournaments.includes(m.tournamentId));
  return computeStandings(matches, season.teams.map((t) => t.id), 'general')[0].teamId;
}
