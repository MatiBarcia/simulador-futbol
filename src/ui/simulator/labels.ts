import type { Team, TeamId } from '../../domain/types.ts';
import type { Goal } from '../../engine/analysis.ts';
import { DRAW, HOME, type SimEvent, type SimulationSamples } from '../../engine/simulate.ts';

export interface GoalOption {
  id: Goal;
  label: string;
  /** Para agrupar los botones: copas del año que viene, el torneo en curso y títulos. */
  group: 'copas' | 'torneo';
  /** "de clasificar a la Libertadores 2027" — para la frase "X% de ..." */
  phrase: string;
}

export function goalOptions(season: number, tournamentName: string): GoalOption[] {
  const next = season + 1;
  const torneo = tournamentName.replace('Torneo ', '');
  return [
    { id: 'libertadores', group: 'copas', label: `Libertadores ${next}`, phrase: `de jugar la Libertadores ${next}` },
    { id: 'sudamericana', group: 'copas', label: `Sudamericana ${next}`, phrase: `de jugar la Sudamericana ${next}` },
    { id: 'playoffs', group: 'torneo', label: `Playoffs del ${torneo}`, phrase: `de entrar a los playoffs del ${torneo}` },
    { id: 'champion', group: 'torneo', label: `Campeón del ${torneo}`, phrase: `de salir campeón del ${torneo}` },
    { id: 'safe', group: 'torneo', label: 'No descender', phrase: 'de no descender' },
  ];
}

const COMPETITION_NAMES: Record<string, string> = {
  apertura: 'Apertura',
  clausura: 'Clausura',
  trofeo: 'Trofeo de Campeones',
  'copa-argentina': 'Copa Argentina',
  'supercopa-argentina': 'Supercopa Argentina',
  libertadores: 'Libertadores',
  sudamericana: 'Sudamericana',
};

const PHASE_NAMES: Record<string, string> = {
  'round-of-64': '32avos',
  'round-of-32': '16avos',
  'round-of-16': 'Octavos',
  quarterfinals: 'Cuartos',
  semifinals: 'Semifinal',
  final: 'Final',
};

export const competitionName = (id: string) => COMPETITION_NAMES[id] ?? id;

/** "Fecha 15" o "Semifinal de la Copa Argentina". */
export function eventContext(e: SimEvent): string {
  if (e.kind === 'champion') return competitionName(e.competition);
  if (e.phase === 'regular') return `Fecha ${e.round ?? '?'}`;
  return `${PHASE_NAMES[e.phase] ?? e.phase} · ${competitionName(e.competition)}`;
}

export type TeamName = (id: TeamId) => string;

export const teamNamer = (teams: Map<TeamId, Team>): TeamName => (id) => teams.get(id)?.shortName ?? id;

/** Un resultado contado en palabras: "Boca le gana a River", "Boca y River empatan", "Banfield campeón de la Copa Argentina". */
export function outcomeText(e: SimEvent, value: number, name: TeamName, samples: Pick<SimulationSamples, 'allTeams'>): string {
  if (e.kind === 'champion') return `${name(samples.allTeams[value])} sale campeón ${championOf(e.competition)}`;
  if (value === DRAW) return `${name(e.homeId)} y ${name(e.awayId)} empatan`;
  const [winner, loser] = value === HOME ? [e.homeId, e.awayId] : [e.awayId, e.homeId];
  return `${name(winner)} le gana a ${name(loser)}`;
}

/** "del Clausura", "de la Copa Argentina". */
export const championOf = (competition: string) =>
  ['apertura', 'clausura', 'trofeo'].includes(competition) ? `del ${competitionName(competition)}` : `de la ${competitionName(competition)}`;

export const pct = (p: number) => {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.005) return '<1%';
  if (p > 0.995) return '>99%';
  return `${Math.round(p * 100)}%`;
};
