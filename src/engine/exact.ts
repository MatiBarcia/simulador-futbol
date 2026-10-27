// "¿Todavía puede?" exacto: si existe (o no) alguna combinación de resultados de lo que falta que le dé el objetivo a un equipo.
// No es una probabilidad: se plantea como programación entera (cada partido pendiente es gana local / empate / gana visitante)
// y un solver dice si el problema tiene solución. Solo se miran puntos: lo que quede empatado en puntos lo definen la diferencia
// de gol, el mini-torneo, el fair play o un desempate, y eso se informa aparte ('ties').
import type { Match, SeasonData, TeamId } from '../domain/types.ts';
import { promediosRules, seasonRules } from '../rules/lpf.ts';
import { matchWinner } from './bracket.ts';
import { cupProgress } from './cups.ts';
import { seasonTotals } from './promedios.ts';
import { applyFixed, currentTournament, type FixedResults } from './simulate.ts';
import { tally } from './standings.ts';

/** 'yes' = seguro; 'ties' = solo si los desempates salen a favor (o, en `guaranteed`, salvo que salgan en contra); 'no' = imposible. */
export type Certainty = 'yes' | 'ties' | 'no';

export interface ExactAnswer {
  /** ¿Hay alguna combinación de resultados con la que lo logra? */
  possible: Certainty;
  /** ¿Lo logra pase lo que pase? */
  guaranteed: Certainty;
}

export type ExactGoal = 'playoffs' | 'champion' | 'safe' | 'libertadores';
export const EXACT_GOALS: ExactGoal[] = ['playoffs', 'champion', 'safe', 'libertadores'];

/** Cómo se aseguró el lugar en una copa del año que viene. */
export type ClinchRoute = 'apertura' | 'clausura' | 'copa-argentina' | 'libertadores' | 'sudamericana' | 'tabla';

/**
 * Un equipo que ya tiene asegurada una copa del año que viene, pase lo que pase.
 * `cup: 'copa'` = juega la Libertadores o la Sudamericana (todavía no se sabe cuál).
 */
export interface Clinched {
  teamId: TeamId;
  cup: 'libertadores' | 'copa';
  route: ClinchRoute;
  /** 'ties' = salvo que un desempate le salga en contra. */
  certainty: Exclude<Certainty, 'no'>;
}

/** Recibe un modelo en formato LP (CPLEX) y dice si tiene solución. */
export type FeasibilitySolver = (lp: string) => boolean;

export interface ExactInput {
  seasons: SeasonData[];
  season: number;
  /** Copas de la temporada: sus campeones ya tienen lugar en la Libertadores. */
  cups?: SeasonData[];
  fixed?: FixedResults;
}

type Term = [coef: number, variable: string];
/** Expresión lineal: constante + Σ coef·variable. */
interface Lin {
  c: number;
  terms: Term[];
}

/** Modelo entero en formato LP. Las restricciones se escriben como `lhs - rhs (op) 0`. */
class Model {
  private readonly rows: string[] = [];
  private readonly binaries = new Set<string>();
  private readonly integers = new Map<string, [number, number]>();

  binary(name: string) {
    this.binaries.add(name);
    return name;
  }

  integer(name: string, lo: number, hi: number) {
    this.integers.set(name, [lo, hi]);
    return name;
  }

  /** Σ terms (op) rhs. */
  add(terms: Term[], op: '>=' | '<=' | '=', rhs: number) {
    const merged = new Map<string, number>();
    for (const [k, v] of terms) merged.set(v, (merged.get(v) ?? 0) + k);
    const text = [...merged].filter(([, k]) => k !== 0).map(([v, k]) => `${k < 0 ? '-' : '+'} ${Math.abs(k)} ${v}`);
    // Una restricción sin variables se cumple o no: si no se cumple, el modelo es imposible.
    if (text.length === 0) {
      const ok = op === '>=' ? 0 >= rhs : op === '<=' ? 0 <= rhs : rhs === 0;
      if (!ok) this.rows.push(`c${this.rows.length}: + 1 z0 <= -1`);
      return;
    }
    this.rows.push(`c${this.rows.length}: ${text.join(' ')} ${op} ${rhs}`);
  }

  /** a - b ≥ rhs, con a y b expresiones lineales. */
  diff(a: Lin, b: Lin, extra: Term[], rhs: number) {
    this.add([...a.terms, ...b.terms.map(([k, v]): Term => [-k, v]), ...extra], '>=', rhs - a.c + b.c);
  }

  toLP(): string {
    const ints = [...this.integers];
    return [
      'Minimize',
      ' obj: 0 z0',
      'Subject To',
      ...this.rows.map((r) => ` ${r}`),
      'Bounds',
      ' 0 <= z0 <= 0',
      ...ints.map(([v, [lo, hi]]) => ` ${lo} <= ${v} <= ${hi}`),
      'Binaries',
      ...[...this.binaries].map((v) => ` ${v}`),
      'Generals',
      ...ints.map(([v]) => ` ${v}`),
      'End',
    ].join('\n');
  }
}

/** Cota para las restricciones "si esta variable vale 1, no hace falta cumplir esto". Más que cualquier diferencia de puntos. */
const M_POINTS = 1000;

export function createExactAnalysis(
  input: ExactInput,
  solve: FeasibilitySolver,
): { answer: (teamId: TeamId, goal: ExactGoal) => ExactAnswer | undefined; clinched: () => Clinched[] } {
  const current = input.seasons.find((s) => s.season === input.season)!;
  const rules = seasonRules(input.season);
  const p = promediosRules(input.season);
  const tournamentId = currentTournament(current)!;
  const tournament = current.tournaments.find((t) => t.id === tournamentId)!;
  const groups = tournament.groups ?? { '': current.teams.map((t) => t.id) };
  const teamIds = current.teams.map((t) => t.id);
  const factor = 10 ** p.decimals;
  const M_PROMEDIO = 4 * factor;

  const matches = applyFixed(current.matches, input.fixed ?? {});
  const isAnnual = (m: Match) => m.phase === 'regular' && rules.annualTournaments.includes(m.tournamentId);
  const isPending = (m: Match) => m.status !== 'finished' && m.status !== 'cancelled';
  const pending = matches.filter((m) => isAnnual(m) && isPending(m));
  const finished = matches.filter((m) => isAnnual(m) && m.status === 'finished');
  const zoneBase = tally(
    finished.filter((m) => m.tournamentId === tournamentId),
    teamIds,
  );
  const annualBase = tally(finished, teamIds);
  const history = new Map(teamIds.map((t) => [t, { points: 0, played: 0 }]));
  for (const s of input.seasons) {
    if (s.season === input.season || !p.seasons.includes(s.season)) continue;
    for (const [t, x] of seasonTotals(s.matches, teamIds, p.counts)) {
      history.get(t)!.points += x.points;
      history.get(t)!.played += x.played;
    }
  }

  // Puntos que suma cada equipo en lo que falta, en función de las variables de cada partido (h/d/a = local/empate/visitante).
  const gained = new Map<TeamId, Term[]>(teamIds.map((t) => [t, []]));
  pending.forEach((m, i) => {
    gained.get(m.homeId)?.push([3, `m${i}h`], [1, `m${i}d`]);
    gained.get(m.awayId)?.push([3, `m${i}a`], [1, `m${i}d`]);
  });
  const zonePoints = (t: TeamId): Lin => ({ c: zoneBase.get(t)!.points, terms: gained.get(t)! });
  const annualPoints = (t: TeamId): Lin => ({ c: annualBase.get(t)!.points, terms: gained.get(t)! });
  const played = (t: TeamId) => history.get(t)!.played + annualBase.get(t)!.played + pending.filter((m) => m.homeId === t || m.awayId === t).length;

  const newModel = () => {
    const model = new Model();
    pending.forEach((_, i) => {
      for (const r of ['h', 'd', 'a']) model.binary(`m${i}${r}`);
      model.add([[1, `m${i}h`], [1, `m${i}d`], [1, `m${i}a`]], '=', 1);
    });
    return model;
  };

  /**
   * Descensos (como en la simulación): p_j = j es el último de promedios; q_j = j es el último de la anual sin contar a ese.
   * Con `ties`, un empate puede resolverse para cualquier lado (sería un partido de desempate); sin `ties`, tiene que ser por puntos.
   */
  const addRelegation = (model: Model, ties: boolean) => {
    const c = ties ? 0 : 1;
    // t_j = promedio truncado como se publica (×1000): 1000·puntos − partidos·t_j entre 0 y partidos − 1.
    for (const t of teamIds) {
      const g = played(t);
      const n = annualPoints(t);
      const v = model.integer(`t_${idOf(t)}`, 0, 3 * factor);
      model.add([...n.terms.map(([k, x]): Term => [k * factor, x]), [-g, v]], '>=', -(history.get(t)!.points + n.c) * factor);
      model.add([...n.terms.map(([k, x]): Term => [k * factor, x]), [-g, v]], '<=', g - 1 - (history.get(t)!.points + n.c) * factor);
      model.binary(`p_${idOf(t)}`);
      model.binary(`q_${idOf(t)}`);
      model.add([[1, `p_${idOf(t)}`], [1, `q_${idOf(t)}`]], '<=', 1);
    }
    model.add(teamIds.map((t): Term => [1, `p_${idOf(t)}`]), '=', 1);
    model.add(teamIds.map((t): Term => [1, `q_${idOf(t)}`]), '=', 1);
    for (const j of teamIds) {
      for (const k of teamIds) {
        if (j === k) continue;
        // p_j ⇒ t_k − t_j ≥ c
        model.add([[1, `t_${idOf(k)}`], [-1, `t_${idOf(j)}`], [-M_PROMEDIO, `p_${idOf(j)}`]], '>=', c - M_PROMEDIO);
        // q_j ⇒ anual_k − anual_j ≥ c, salvo que k sea el descendido por promedio.
        model.diff(annualPoints(k), annualPoints(j), [[-M_POINTS, `q_${idOf(j)}`], [M_POINTS, `p_${idOf(k)}`]], c - M_POINTS);
      }
    }
  };
  const relegatedTerms = (t: TeamId, k: number): Term[] => [[k, `p_${idOf(t)}`], [k, `q_${idOf(t)}`]];

  const zoneOf = (t: TeamId) => Object.values(groups).find((ids) => ids.includes(t)) ?? teamIds;
  const skipRelegated = rules.relegatedSkipPlayoffs.includes(tournamentId);
  const spots = rules.playoffSpotsPerZone;

  /** Lo logra (`success`) o no lo logra (`!success`), con o sin empates de por medio. */
  const feasible = (teamId: TeamId, goal: 'playoffs' | 'safe', success: boolean, ties: boolean): boolean => {
    const c = ties ? 0 : 1;
    const check = (build: (model: Model) => void) => {
      const model = newModel();
      build(model);
      return solve(model.toLP());
    };
    if (goal === 'safe') {
      return check((model) => {
        addRelegation(model, ties);
        model.add(relegatedTerms(teamId, 1), success ? '=' : '>=', success ? 0 : 1);
      });
    }
    const rivals = zoneOf(teamId).filter((t) => t !== teamId);
    if (success) {
      // Como mucho `spots − 1` rivales de la zona por encima (los descendidos no cuentan).
      return check((model) => {
        if (skipRelegated) {
          addRelegation(model, ties);
          model.add(relegatedTerms(teamId, 1), '=', 0);
        }
        for (const r of rivals) {
          const u = model.binary(`u_${idOf(r)}`);
          model.diff(zonePoints(teamId), zonePoints(r), [[M_POINTS, u], ...(skipRelegated ? relegatedTerms(r, M_POINTS) : [])], c);
        }
        model.add(rivals.map((r): Term => [1, `u_${idOf(r)}`]), '<=', spots - 1);
      });
    }
    // No entra: desciende, o quedan `spots` rivales (no descendidos) por encima.
    if (skipRelegated && feasible(teamId, 'safe', false, ties)) return true;
    return check((model) => {
      if (skipRelegated) addRelegation(model, ties);
      for (const r of rivals) {
        const v = model.binary(`v_${idOf(r)}`);
        model.diff(zonePoints(r), zonePoints(teamId), [[-M_POINTS, v]], c - M_POINTS);
        if (skipRelegated) model.add([[1, v], ...relegatedTerms(r, 1)], '<=', 1);
      }
      model.add(rivals.map((r): Term => [1, `v_${idOf(r)}`]), '>=', spots);
    });
  };

  /** ¿Puede terminar con `k` o más de `rivals` por encima en la tabla anual? */
  const canMissAnnualTop = (teamId: TeamId, rivals: TeamId[], k: number, ties: boolean) => {
    const model = newModel();
    for (const r of rivals) {
      const v = model.binary(`v_${idOf(r)}`);
      model.diff(annualPoints(r), annualPoints(teamId), [[-M_POINTS, v]], (ties ? 0 : 1) - M_POINTS);
    }
    model.add(rivals.map((r): Term => [1, `v_${idOf(r)}`]), '>=', k);
    return solve(model.toLP());
  };
  const annualTop = (teamId: TeamId, rivals: TeamId[], k: number): Certainty =>
    canMissAnnualTop(teamId, rivals, k, false) ? 'no' : canMissAnnualTop(teamId, rivals, k, true) ? 'ties' : 'yes';

  const cache = new Map<string, ExactAnswer>();
  const exact = (teamId: TeamId, goal: 'playoffs' | 'safe'): ExactAnswer => {
    const key = `${teamId}|${goal}`;
    let a = cache.get(key);
    if (!a) {
      const possible: Certainty = feasible(teamId, goal, true, false) ? 'yes' : feasible(teamId, goal, true, true) ? 'ties' : 'no';
      // "Lo logra pase lo que pase" = no hay forma de que no lo logre. Si puede fallar sin empates de por medio, no está
      // asegurado; si solo falla con desempates en contra, está asegurado salvo eso.
      const guaranteed: Certainty =
        possible === 'no' || feasible(teamId, goal, false, false) ? 'no' : feasible(teamId, goal, false, true) ? 'ties' : 'yes';
      cache.set(key, (a = { possible, guaranteed }));
    }
    return a;
  };

  // Campeones ya definidos de esta temporada: el Apertura / Clausura, la Copa Argentina y (si son de acá) la Libertadores y la Sudamericana.
  const titles: { teamId: TeamId; route: ClinchRoute }[] = [];
  for (const t of rules.zoneTournaments) {
    const final = current.matches.find((m) => m.tournamentId === t && m.phase === 'final');
    const winner = final && matchWinner(final);
    if (winner && (t === 'apertura' || t === 'clausura')) titles.push({ teamId: winner, route: t });
  }
  for (const route of ['copa-argentina', 'libertadores', 'sudamericana'] as const) {
    const champion = cupProgress(input.cups?.find((c) => c.competition === route)?.matches ?? []).champion;
    if (champion) titles.push({ teamId: champion, route });
  }

  let clinchedCache: Clinched[] | undefined;
  /**
   * Quién ya tiene copa asegurada (alcanza con que se cumpla algo de esto; no es la lista completa de lo que podría asegurarlo):
   * - Un título que da lugar en la Libertadores, si no puede descender (los campeones de la CONMEBOL entran igual, art. 27.9–27.10).
   * - Terminar entre los 3 primeros de la anual: la tabla da al menos 3 lugares y los que clasificaron por otro lado se saltean.
   * - Terminar entre los 9 primeros: si no entra por la tabla a la Libertadores, es porque al menos 3 de arriba lo hicieron,
   *   así que queda entre los 6 primeros de los que van a la Sudamericana.
   * Las dos últimas, sin descender (nada impide en teoría estar arriba en la anual y último en promedios). Los que ya entraron
   * seguro por un título no cuentan entre los de arriba: se saltean al repartir los lugares de la tabla.
   */
  const clinched = (): Clinched[] => {
    if (clinchedCache) return clinchedCache;
    const out: Clinched[] = [];
    const weakest = (...cs: Certainty[]): Certainty => (cs.includes('no') ? 'no' : cs.includes('ties') ? 'ties' : 'yes');
    const byTitle = new Map<TeamId, Omit<Clinched, 'teamId'>>();
    for (const title of titles) {
      if (!teamIds.includes(title.teamId) || byTitle.has(title.teamId)) continue;
      const certainty = title.route === 'libertadores' || title.route === 'sudamericana' ? 'yes' : exact(title.teamId, 'safe').guaranteed;
      if (certainty !== 'no') byTitle.set(title.teamId, { cup: 'libertadores', route: title.route, certainty });
    }
    for (const teamId of teamIds) {
      const options: Omit<Clinched, 'teamId'>[] = [];
      const title = byTitle.get(teamId);
      if (title) options.push(title);
      if (title?.certainty !== 'yes') {
        const safe = exact(teamId, 'safe').guaranteed;
        const rivals = teamIds.filter((t) => t !== teamId && byTitle.get(t)?.certainty !== 'yes');
        const top3 = weakest(safe, annualTop(teamId, rivals, 3));
        if (top3 !== 'no') options.push({ cup: 'libertadores', route: 'tabla', certainty: top3 });
        else {
          const top9 = weakest(safe, annualTop(teamId, rivals, 9));
          if (top9 !== 'no') options.push({ cup: 'copa', route: 'tabla', certainty: top9 });
        }
      }
      // Lo más fuerte: Libertadores antes que "una copa", y 'yes' antes que 'ties'.
      const best = options.sort((a, b) => Number(a.cup === 'copa') - Number(b.cup === 'copa') || Number(a.certainty === 'ties') - Number(b.certainty === 'ties'))[0];
      if (best) out.push({ teamId, ...best });
    }
    return (clinchedCache = out);
  };

  const tournamentPending = pending.some((m) => m.tournamentId === tournamentId);
  return {
    clinched,
    answer(teamId, goal) {
      if (!teamIds.includes(teamId)) return undefined;
      if (goal === 'libertadores') {
        // Solo se sabe cuándo está asegurada; si no, queda la simulación.
        const c = clinched().find((x) => x.teamId === teamId && x.cup === 'libertadores');
        return c && { possible: 'yes', guaranteed: c.certainty };
      }
      if (goal !== 'champion') return exact(teamId, goal);
      // Con la fase regular en juego, cualquiera que entre a los playoffs puede ganarlos (y perderlos).
      if (!tournamentPending) return undefined;
      return { possible: exact(teamId, 'playoffs').possible, guaranteed: 'no' };
    },
  };
}

/** Nombre de variable válido en formato LP a partir de un id de equipo ('river-plate' → 'river_plate'). */
const idOf = (t: TeamId) => t.replace(/[^A-Za-z0-9]/g, '_');
