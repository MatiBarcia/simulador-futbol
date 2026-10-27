import { useMemo, useState } from 'react';
import type { Team, TeamId } from '../../domain/types.ts';
import { conditionalProbability, resultFor, type EventEffect, type Goal, type GoalAnalysis, type Scenarios } from '../../engine/analysis.ts';
import type { Clinched, ClinchRoute } from '../../engine/exact.ts';
import { ROUTE_NAMES } from '../../engine/qualification.ts';
import { TeamCell } from '../TeamCell.tsx';
import { championOf, eventContext, outcomeText, pct, teamNamer, type GoalOption, type TeamName } from './labels.ts';

/** De dónde sale el análisis: de la simulación en el dispositivo o de la precalculada en la nube. */
export interface GoalSource {
  leagueTeams: TeamId[];
  allTeams: TeamId[];
  analyze: (teamId: TeamId, goal: Goal) => GoalAnalysis | undefined;
  /** Quién ya tiene copa asegurada para el año que viene. */
  clinched: Clinched[];
}

interface Props {
  source: GoalSource;
  teams: Map<TeamId, Team>;
  goals: GoalOption[];
  teamId: TeamId | undefined;
  goal: Goal;
  onTeam: (id: TeamId) => void;
  onGoal: (goal: Goal) => void;
}

const STATUS: Record<GoalAnalysis['status'], { label: string; tone: string }> = {
  done: { label: 'Lo logra en todas las simulaciones', tone: 'good' },
  'own-hands': { label: 'Depende de sí mismo', tone: 'good' },
  'needs-help': { label: 'Necesita ayuda de otros resultados', tone: 'warn' },
  out: { label: 'No lo logra en ninguna simulación', tone: 'bad' },
};

const CLINCHED_BY: Record<ClinchRoute, string> = {
  apertura: 'campeón del Apertura',
  clausura: 'campeón del Clausura',
  'copa-argentina': 'campeón de la Copa Argentina',
  libertadores: 'campeón de la Libertadores',
  sudamericana: 'campeón de la Sudamericana',
  tabla: 'por la tabla anual',
};

const TIES_HINT = 'Quedaría igualado en puntos: lo definen la diferencia de gol, los goles a favor, los partidos entre ellos o un desempate.';

/**
 * El cartel de estado: si hay respuesta exacta (engine/exact.ts), manda sobre lo que dicen las simulaciones.
 * `libertadores`: si el objetivo es la Libertadores y ya está clasificado, por dónde.
 */
function statusOf(a: GoalAnalysis, libertadores: Clinched | undefined): { label: string; tone: string; hint?: string } {
  const e = a.exact;
  if (libertadores?.cup === 'libertadores') {
    const how = CLINCHED_BY[libertadores.route];
    return libertadores.certainty === 'yes'
      ? { label: `Ya está clasificado (${how})`, tone: 'good' }
      : { label: `Clasificado (${how}), salvo un desempate en contra`, tone: 'good', hint: TIES_HINT };
  }
  if (!e) return STATUS[a.status];
  if (e.guaranteed === 'yes') return { label: 'Ya lo tiene asegurado', tone: 'good' };
  if (e.guaranteed === 'ties') return { label: 'Asegurado, salvo un desempate en contra', tone: 'good', hint: TIES_HINT };
  if (e.possible === 'no') return { label: 'Ya no puede: es matemáticamente imposible', tone: 'bad' };
  if (e.possible === 'ties') return { label: 'Solo puede con un desempate a favor', tone: 'bad', hint: TIES_HINT };
  if (a.status === 'out') return { label: 'Todavía puede, aunque no pasó en ninguna simulación', tone: 'warn' };
  if (a.status === 'done') return { label: 'Pasó en todas las simulaciones, pero todavía no está asegurado', tone: 'good' };
  return STATUS[a.status];
}

export function TeamGoal({ source, teams, goals, teamId, goal, onTeam, onGoal }: Props) {
  const name = teamNamer(teams);
  const leagueTeams = [...source.leagueTeams].sort((a, b) => (teams.get(a)?.name ?? a).localeCompare(teams.get(b)?.name ?? b));
  const analysis = useMemo(() => (teamId ? source.analyze(teamId, goal) : undefined), [source, teamId, goal]);
  const option = goals.find((g) => g.id === goal)!;
  // Resultados que eligió el usuario para los partidos del equipo (índice de evento → resultado). Se mantienen al cambiar de
  // objetivo y se borran al cambiar de equipo.
  const [choice, setChoice] = useState<{ teamId?: TeamId; chosen: ReadonlyMap<number, number> }>({ chosen: NO_CHOICE });
  const chosen = choice.teamId === teamId ? choice.chosen : NO_CHOICE;
  const choose = (index: number, value: number | undefined) => {
    const next = new Map(chosen);
    if (value === undefined) next.delete(index);
    else next.set(index, value);
    setChoice({ teamId, chosen: next });
  };

  return (
    <div className="goal">
      <div className="goal-pickers">
        <label className="field">
          <span>Equipo</span>
          <select value={teamId ?? ''} onChange={(e) => onTeam(e.target.value)}>
            <option value="" disabled>
              Elegí un equipo
            </option>
            {leagueTeams.map((id) => (
              <option key={id} value={id}>
                {teams.get(id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Objetivo</span>
          <div className="chip-groups" role="radiogroup" aria-label="Objetivo">
            {(['copas', 'torneo'] as const).map((group) => (
              <div key={group} className="chips">
                {goals
                  .filter((g) => g.group === group)
                  .map((g) => (
                    <button key={g.id} role="radio" aria-checked={g.id === goal} className="chip" onClick={() => onGoal(g.id)}>
                      {g.label}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!teamId || !analysis ? (
        <p className="empty">Elegí un equipo para ver qué resultados necesita.</p>
      ) : (
        <GoalReport
          teamId={teamId}
          analysis={analysis}
          option={option}
          samples={source}
          teams={teams}
          name={name}
          clinched={source.clinched.find((c) => c.teamId === teamId)}
          chosen={chosen}
          onChoose={choose}
          onClear={() => setChoice({ chosen: NO_CHOICE })}
        />
      )}
    </div>
  );
}

const NO_CHOICE: ReadonlyMap<number, number> = new Map();

/** Menos simulaciones que esto con los resultados elegidos: el número es aproximado. */
const FEW_SIMULATIONS = 1000;

function GoalReport({ teamId, analysis: a, option, samples, teams, name, clinched, chosen, onChoose, onClear }: {
  teamId: TeamId;
  clinched?: Clinched;
  chosen: ReadonlyMap<number, number>;
  onChoose: (index: number, value: number | undefined) => void;
  onClear: () => void;
  analysis: GoalAnalysis;
  option: GoalOption;
  samples: { allTeams: TeamId[] };
  teams: Map<TeamId, Team>;
  name: TeamName;
}) {
  const status = statusOf(a, option.id === 'libertadores' ? clinched : undefined);
  const decided = a.status === 'done' || a.status === 'out';
  // Salir campeón de algo es "propio" aunque no sea un partido.
  const ownTitles = a.helpers.filter((h) => h.event.kind === 'champion' && samples.allTeams[h.best.value] === teamId);
  const helpers = a.helpers.filter((h) => !ownTitles.includes(h)).slice(0, 6);
  // Solo cuentan los resultados elegidos de partidos que tienen escenarios en este análisis.
  const scenarios = a.scenarios;
  const active = new Map([...chosen].filter(([e]) => scenarios?.events.includes(e)));
  const withChoice = scenarios && active.size > 0 ? conditionalProbability(scenarios, active) : undefined;

  return (
    <>
      <section className="goal-summary">
        <TeamCell team={teams.get(teamId)} />
        {withChoice ? (
          <>
            <p className="goal-number">
              <strong>{withChoice.simulations ? pct(withChoice.probability) : '?'}</strong> {option.phrase}{' '}
              <span className="goal-choice">con los resultados que elegiste (hoy: {pct(a.probability)})</span>
            </p>
            <p className="goal-hint">
              {withChoice.simulations === 0
                ? 'Esa combinación no salió en ninguna simulación.'
                : `Sale de las ${withChoice.simulations.toLocaleString('es-AR')} simulaciones en que se dieron esos resultados` +
                  (withChoice.simulations < FEW_SIMULATIONS ? ': son pocas, tomalo como aproximado.' : '.')}{' '}
              <button className="link-button" onClick={onClear}>
                Borrar resultados
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="goal-number">
              <strong>{pct(a.probability)}</strong> {option.phrase}
            </p>
            <span className={`status-pill tone-${status.tone}`}>{status.label}</span>
            {status.hint && <p className="goal-hint">{status.hint}</p>}
          </>
        )}
        {clinched?.cup === 'copa' && (option.id === 'libertadores' || option.id === 'sudamericana') && (
          <p className="goal-hint">
            Ya tiene asegurado jugar la Libertadores o la Sudamericana
            {clinched.certainty === 'ties' ? ', salvo un desempate en contra' : ', pase lo que pase'}: falta saber cuál.
          </p>
        )}
        {!withChoice && !decided && a.ifWinsAll !== undefined && a.status !== 'own-hands' && (
          <p className="goal-hint">Si gana todos sus partidos de liga que faltan: {pct(a.ifWinsAll)}</p>
        )}
        {!withChoice && a.routes.length > 0 && (
          <p className="goal-hint">
            Cómo llega: {a.routes.map((r) => `${ROUTE_NAMES[r.route]} (${pct(r.probability)})`).join(' · ')}
          </p>
        )}
      </section>

      {!decided && (
        <>
          <h4 className="goal-heading">Sus partidos</h4>
          <p className="note">
            Cómo queda su chance según lo que pase en cada partido (hoy: {pct(a.probability)}).
            {scenarios && scenarios.events.length > 0 && ' Tocá un resultado para fijarlo y ver cómo cambia.'}
          </p>
          {a.ownMatches.length === 0 && ownTitles.length === 0 && <p className="note">No le quedan partidos: depende de lo que hagan los demás.</p>}
          <ul className="effects">
            {a.ownMatches.map((m) => (
              <OwnMatch
                key={m.index}
                effect={m}
                teamId={teamId}
                name={name}
                today={a.probability}
                scenarios={scenarios?.events.includes(m.index) ? scenarios : undefined}
                chosen={active}
                onChoose={(value) => onChoose(m.index, value)}
              />
            ))}
            {ownTitles.map((t) => (
              <li key={t.index} className="effect">
                <span className="effect-context">{eventContext(t.event)}</span>
                <span className="effect-text">Si sale campeón {championOf(t.event.competition)}</span>
                <span className="effect-value">
                  <Change from={a.probability} to={t.best.probability} />
                </span>
              </li>
            ))}
          </ul>

          {withChoice && (helpers.length > 0 || a.path) && (
            <p className="note">Borrá los resultados elegidos para ver qué otros resultados le convienen y un camino posible.</p>
          )}

          {!withChoice && helpers.length > 0 && (
            <>
              <h4 className="goal-heading">Le conviene que…</h4>
              <p className="note">Cómo cambia su chance si se da cada uno de estos resultados.</p>
              <ul className="effects">
                {helpers.map((h) => (
                  <li key={h.index} className="effect">
                    <span className="effect-context">{eventContext(h.event)}</span>
                    <span className="effect-text">Si {outcomeText(h.event, h.best.value, name, samples)}</span>
                    <span className="effect-value">
                      <Change from={a.probability} to={h.best.probability} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!withChoice && a.path && (
            <>
              <h4 className="goal-heading">Un camino posible</h4>
              <p className="note">
                Si se dan todos estos resultados, {name(teamId)} tiene {pct(a.path.probability)} {option.phrase}:
              </p>
              <ol className="path">
                {[...a.path.steps]
                  .sort((x, y) => eventDate(x.effect).localeCompare(eventDate(y.effect)))
                  .map(({ effect, value }) => (
                    <li key={effect.index}>
                      <span className="effect-context">{eventContext(effect.event)}</span> {outcomeText(effect.event, value, name, samples)}
                    </li>
                  ))}
              </ol>
            </>
          )}
        </>
      )}
    </>
  );
}

const eventDate = (x: EventEffect) => (x.event.kind === 'match' ? x.event.date : '9999');

/** "23% → 26%" con la diferencia en puntos. */
function Change({ from, to }: { from: number; to: number }) {
  const diff = Math.round((to - from) * 100);
  return (
    <span className="change">
      <span className="change-from">{pct(from)} →</span> <strong className={diff > 0 ? 'tone-up' : diff < 0 ? 'tone-down' : ''}>{pct(to)}</strong>
    </span>
  );
}

/** Diferencia en puntos: "+27", "−5" o "=". */
const delta = (to: number, from: number) => {
  const diff = Math.round((to - from) * 100);
  return diff === 0 ? '=' : diff > 0 ? `+${diff}` : `−${-diff}`;
};

/**
 * Un partido del equipo, con su chance según el resultado. Si hay escenarios, cada resultado se puede tocar para fijarlo,
 * y las chances tienen en cuenta los otros resultados elegidos.
 */
function OwnMatch({ effect, teamId, name, today, scenarios, chosen, onChoose }: {
  effect: EventEffect;
  teamId: TeamId;
  name: TeamName;
  today: number;
  scenarios?: Scenarios;
  chosen: ReadonlyMap<number, number>;
  onChoose: (value: number | undefined) => void;
}) {
  const e = effect.event;
  if (e.kind !== 'match') return null;
  const rival = e.homeId === teamId ? e.awayId : e.homeId;
  const where = e.homeId === teamId ? 'de local' : 'de visitante';
  const byResult = new Map(effect.outcomes.map((o) => [resultFor(e, o.value, teamId), o]));
  const cells: ['win' | 'draw' | 'loss', string][] = [
    ['win', 'Si gana'],
    ['draw', 'Si empata'],
    ['loss', 'Si pierde'],
  ];
  // Con otros resultados elegidos, se compara contra la chance con esos (sin fijar este partido).
  const others = new Map([...chosen].filter(([i]) => i !== effect.index));
  const from = scenarios && others.size > 0 ? conditionalProbability(scenarios, others).probability : today;
  const selected = chosen.get(effect.index);
  return (
    <li className="effect own">
      <span className="effect-context">{eventContext(e)}</span>
      <span className="effect-text">
        vs {name(rival)} <small>({where})</small>
      </span>
      <span className="own-results">
        {cells
          .filter(([r]) => byResult.has(r))
          .map(([r, label]) => {
            const o = byResult.get(r)!;
            const p = scenarios && conditionalProbability(scenarios, new Map([...others, [effect.index, o.value]]));
            const probability = p ? p.probability : o.probability;
            const none = p?.simulations === 0;
            const text = (
              <>
                {label} → <strong>{none ? '?' : pct(probability)}</strong> <small>({none ? 'sin casos' : delta(probability, from)})</small>
              </>
            );
            if (!scenarios) {
              return (
                <span key={r} className={`own-result result-${r}`} title={`Pasa en el ${pct(o.frequency)} de las simulaciones`}>
                  {text}
                </span>
              );
            }
            const isSelected = selected === o.value;
            return (
              <button
                key={r}
                className={`own-result result-${r}`}
                aria-pressed={isSelected}
                title={isSelected ? 'Tocá de nuevo para soltarlo' : 'Fijar este resultado'}
                onClick={() => onChoose(isSelected ? undefined : o.value)}
              >
                {text}
              </button>
            );
          })}
      </span>
    </li>
  );
}
