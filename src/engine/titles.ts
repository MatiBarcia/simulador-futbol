// Quién juega los títulos que se definen entre temporadas (art. 20–23 y 29–31 del reglamento LPF 2026).
// Ver docs/REGLAS-2026.md, secciones 7 a 10.
import type { TeamId } from '../domain/types.ts';

export interface Finalists {
  champion: TeamId;
  runnerUp: TeamId;
}

export type TrofeoPlan =
  /** Final directa entre los dos que corresponden. */
  | { kind: 'final'; teams: [TeamId, TeamId] }
  /** El mismo club ganó Apertura y Clausura: su rival sale de un desempate entre los dos subcampeones (art. 21). */
  | { kind: 'tiebreak'; champion: TeamId; tiebreak: [TeamId, TeamId] };

/** Trofeo de Campeones: campeón del Apertura vs. campeón del Clausura. */
export function trofeoPlan(apertura: Finalists, clausura: Finalists): TrofeoPlan {
  if (apertura.champion !== clausura.champion) return { kind: 'final', teams: [apertura.champion, clausura.champion] };
  // Si además el subcampeón fue el mismo club en los dos torneos, va directo a la final.
  if (apertura.runnerUp === clausura.runnerUp) return { kind: 'final', teams: [apertura.champion, apertura.runnerUp] };
  return { kind: 'tiebreak', champion: apertura.champion, tiebreak: [apertura.runnerUp, clausura.runnerUp] };
}

/** Supercopa Argentina (N+1): ganador del Trofeo vs. campeón de la Copa Argentina; si es el mismo club, el subcampeón del Trofeo (art. 29). */
export function supercopaArgentinaTeams(trofeo: Finalists, copaArgentinaChampion: TeamId): [TeamId, TeamId] {
  return [trofeo.champion, copaArgentinaChampion === trofeo.champion ? trofeo.runnerUp : copaArgentinaChampion];
}

/**
 * Supercopa Internacional (N+1): ganador del Trofeo vs. Campeón de Liga; si es el mismo club, el 2° de la Tabla General.
 * Un descendido lo reemplaza el siguiente de Primera mejor ubicado en la Tabla General (art. 30).
 */
export function supercopaInternacionalTeams(trofeoChampion: TeamId, annual: TeamId[], relegated: Set<TeamId>): [TeamId, TeamId] {
  const league = annual[0];
  const teams = [trofeoChampion, league === trofeoChampion ? annual[1] : league];
  const replaced = teams.map((t) => (relegated.has(t) ? undefined : t));
  for (let i = 0; i < replaced.length; i++) {
    if (replaced[i]) continue;
    replaced[i] = annual.find((t) => !relegated.has(t) && !replaced.includes(t) && !teams.includes(t));
  }
  return replaced as [TeamId, TeamId];
}

/**
 * Recopa de Campeones (N+2): campeones de la Copa Argentina, la Supercopa Argentina y la Supercopa Internacional de N+1.
 * Si un club se repite, entra el subcampeón de la Supercopa que repite y, si sigue repitiéndose, el subcampeón de la Copa Argentina (art. 31).
 */
export function recopaTeams(copaArgentina: Finalists, supercopaArgentina: Finalists, supercopaInternacional: Finalists): TeamId[] {
  const a = copaArgentina.champion;
  const b = supercopaArgentina.champion === a ? supercopaArgentina.runnerUp : supercopaArgentina.champion;
  let c = [a, b].includes(supercopaInternacional.champion) ? supercopaInternacional.runnerUp : supercopaInternacional.champion;
  if ([a, b].includes(c)) c = copaArgentina.runnerUp;
  return [a, b, c];
}
