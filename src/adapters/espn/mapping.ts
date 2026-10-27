// Traducción pura (sin red) de ESPN a nuestro modelo. Testeable con fixtures.
import type { Match, MatchStatus, Phase, Team, TeamId } from '../../domain/types.ts';
import { slugify, teamByEspnId } from '../teamIds.ts';
import type { EspnEvent, EspnStandings, EspnTeam } from './types.ts';

export const PROVIDER_ID = 'espn';

/** Ligas de ESPN que forman cada temporada de la LPF. En 2024 la Copa de la Liga estaba en otra liga de ESPN. */
export const espnLeaguesForSeason = (season: number): string[] =>
  season === 2024 ? ['arg.copa_lpf', 'arg.1'] : ['arg.1'];

export const TOURNAMENT_NAMES: Record<string, string> = {
  'copa-de-la-liga': 'Copa de la Liga',
  liga: 'Liga Profesional',
  apertura: 'Torneo Apertura',
  clausura: 'Torneo Clausura',
};

const PHASES: Record<string, Phase> = {
  'round-of-16': 'round-of-16',
  quarterfinals: 'quarterfinals',
  semifinals: 'semifinals',
  final: 'final',
};

/** `season.slug` de ESPN → torneo y fase. Tira error con un slug desconocido para enterarnos si ESPN cambia algo. */
export function mapSlug(league: string, slug: string): { tournamentId: string; phase: Phase } {
  if (league === 'arg.copa_lpf') {
    if (slug === 'group-stage') return { tournamentId: 'copa-de-la-liga', phase: 'regular' };
    if (PHASES[slug]) return { tournamentId: 'copa-de-la-liga', phase: PHASES[slug] };
  }
  if (/^\d{4}-argentine-liga-profesional$/.test(slug)) return { tournamentId: 'liga', phase: 'regular' };
  const regular = /^torneo-(apertura|clausura)$/.exec(slug);
  if (regular) return { tournamentId: regular[1], phase: 'regular' };
  const playoff = /^(apertura|clausura)---(.+)$/.exec(slug);
  if (playoff && PHASES[playoff[2]]) return { tournamentId: playoff[1], phase: PHASES[playoff[2]] };
  throw new Error(`ESPN: season.slug desconocido "${slug}" (liga ${league})`);
}

const FINISHED = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN']);

export function mapStatus(name: string, state: 'pre' | 'in' | 'post'): MatchStatus {
  if (FINISHED.has(name)) return 'finished';
  if (name === 'STATUS_POSTPONED') return 'postponed';
  if (name === 'STATUS_SUSPENDED' || name === 'STATUS_ABANDONED') return 'suspended';
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'cancelled';
  // Default seguro para estados nuevos: nos guiamos por el estado general.
  return state === 'in' ? 'live' : state === 'post' ? 'finished' : 'scheduled';
}

export function mapTeam(t: EspnTeam): Team {
  const known = teamByEspnId(t.id);
  return {
    id: known?.id ?? slugify(t.displayName),
    name: known?.name ?? t.displayName.trim(),
    shortName: known?.shortName ?? t.shortDisplayName.trim(),
    logoUrl: t.logo,
  };
}

export const unknownTeams = (teams: EspnTeam[]) => teams.filter((t) => !teamByEspnId(t.id));

export function mapEvent(league: string, e: EspnEvent): Match {
  const { tournamentId, phase } = mapSlug(league, e.season.slug);
  const competitors = e.competitions[0].competitors;
  const home = competitors.find((c) => c.homeAway === 'home')!;
  const away = competitors.find((c) => c.homeAway === 'away')!;
  const status = mapStatus(e.status.type.name, e.status.type.state);
  const hasScore = status === 'finished' || status === 'live';
  const match: Match = {
    id: `${PROVIDER_ID}-${e.id}`,
    tournamentId,
    phase,
    date: e.date,
    homeId: mapTeam(home.team).id,
    awayId: mapTeam(away.team).id,
    status,
    source: { provider: PROVIDER_ID, externalId: e.id },
  };
  if (hasScore && home.score !== undefined && away.score !== undefined) {
    match.homeGoals = Number(home.score);
    match.awayGoals = Number(away.score);
  }
  if (e.status.type.name === 'STATUS_FINAL_PEN' && home.shootoutScore !== undefined && away.shootoutScore !== undefined) {
    match.penalties = { home: home.shootoutScore, away: away.shootoutScore };
  }
  if (status === 'live') match.clock = e.status.type.shortDetail ?? e.status.displayClock;
  return match;
}

/** Zonas de la fase regular: "Group A" → "A". */
export function mapGroups(standings: EspnStandings): Record<string, TeamId[]> | undefined {
  if (!standings.children?.length) return undefined;
  return Object.fromEntries(
    standings.children.map((g) => [
      g.name.replace(/^Group\s+/i, ''),
      g.standings.entries.map((e) => mapTeam(e.team).id),
    ]),
  );
}
