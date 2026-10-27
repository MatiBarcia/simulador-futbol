import { useMemo } from 'react';
import type { Team, TeamId } from '../../domain/types.ts';
import { resultFor, type EventEffect, type Goal, type GoalAnalysis } from '../../engine/analysis.ts';
import { ROUTE_NAMES } from '../../engine/qualification.ts';
import { TeamCell } from '../TeamCell.tsx';
import { championOf, eventContext, outcomeText, pct, teamNamer, type GoalOption, type TeamName } from './labels.ts';

/** De dónde sale el análisis: de la simulación en el dispositivo o de la precalculada en la nube. */
export interface GoalSource {
  leagueTeams: TeamId[];
  allTeams: TeamId[];
  analyze: (teamId: TeamId, goal: Goal) => GoalAnalysis | undefined;
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

export function TeamGoal({ source, teams, goals, teamId, goal, onTeam, onGoal }: Props) {
  const name = teamNamer(teams);
  const leagueTeams = [...source.leagueTeams].sort((a, b) => (teams.get(a)?.name ?? a).localeCompare(teams.get(b)?.name ?? b));
  const analysis = useMemo(() => (teamId ? source.analyze(teamId, goal) : undefined), [source, teamId, goal]);
  const option = goals.find((g) => g.id === goal)!;

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
        <GoalReport teamId={teamId} analysis={analysis} option={option} samples={source} teams={teams} name={name} />
      )}
    </div>
  );
}

function GoalReport({ teamId, analysis: a, option, samples, teams, name }: {
  teamId: TeamId;
  analysis: GoalAnalysis;
  option: GoalOption;
  samples: { allTeams: TeamId[] };
  teams: Map<TeamId, Team>;
  name: TeamName;
}) {
  const status = STATUS[a.status];
  const decided = a.status === 'done' || a.status === 'out';
  // Salir campeón de algo es "propio" aunque no sea un partido.
  const ownTitles = a.helpers.filter((h) => h.event.kind === 'champion' && samples.allTeams[h.best.value] === teamId);
  const helpers = a.helpers.filter((h) => !ownTitles.includes(h)).slice(0, 6);

  return (
    <>
      <section className="goal-summary">
        <TeamCell team={teams.get(teamId)} />
        <p className="goal-number">
          <strong>{pct(a.probability)}</strong> {option.phrase}
        </p>
        <span className={`status-pill tone-${status.tone}`}>{status.label}</span>
        {!decided && a.ifWinsAll !== undefined && a.status !== 'own-hands' && (
          <p className="goal-hint">Si gana todos sus partidos de liga que faltan: {pct(a.ifWinsAll)}</p>
        )}
        {a.routes.length > 0 && (
          <p className="goal-hint">
            Cómo llega: {a.routes.map((r) => `${ROUTE_NAMES[r.route]} (${pct(r.probability)})`).join(' · ')}
          </p>
        )}
      </section>

      {!decided && (
        <>
          <h4 className="goal-heading">Sus partidos</h4>
          <p className="note">Cómo queda su chance según lo que pase en cada partido (hoy: {pct(a.probability)}).</p>
          {a.ownMatches.length === 0 && ownTitles.length === 0 && <p className="note">No le quedan partidos: depende de lo que hagan los demás.</p>}
          <ul className="effects">
            {a.ownMatches.map((m) => (
              <OwnMatch key={m.index} effect={m} teamId={teamId} name={name} today={a.probability} />
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

          {helpers.length > 0 && (
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

          {a.path && (
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

function OwnMatch({ effect, teamId, name, today }: { effect: EventEffect; teamId: TeamId; name: TeamName; today: number }) {
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
            return (
              <span key={r} className={`own-result result-${r}`} title={`Pasa en el ${pct(o.frequency)} de las simulaciones`}>
                {label} → <strong>{pct(o.probability)}</strong> <small>({delta(o.probability, today)})</small>
              </span>
            );
          })}
      </span>
    </li>
  );
}
