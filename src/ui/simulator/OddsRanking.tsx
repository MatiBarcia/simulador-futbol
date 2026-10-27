import type { Team, TeamId } from '../../domain/types.ts';
import type { Goal } from '../../engine/analysis.ts';
import type { Clinched } from '../../engine/exact.ts';
import type { TeamOdds } from '../../engine/simulate.ts';
import { TeamCell } from '../TeamCell.tsx';
import { pct, type GoalOption } from './labels.ts';

export type RankingId = Goal | 'leagueChampion' | 'copaArgentina' | 'relegated';

export interface RankingOption {
  id: RankingId;
  label: string;
  group: string;
}

const value = (o: TeamOdds, id: RankingId) => (id === 'safe' ? 1 - o.relegated : o[id]);

interface Props {
  odds: TeamOdds[];
  teams: Map<TeamId, Team>;
  options: RankingOption[];
  selected: RankingId;
  onSelect: (id: RankingId) => void;
  /** Al tocar un equipo: abrir "¿Qué necesita?" con ese equipo. */
  onTeam: (id: TeamId, goal: Goal | undefined) => void;
  goals: GoalOption[];
  /** Quién ya tiene copa asegurada: se marca en los rankings de la Libertadores y la Sudamericana. */
  clinched: Clinched[];
}

/** Marca para un equipo que ya tiene copa asegurada, en el ranking de esa copa. */
function clinchedMark(c: Clinched | undefined, selected: RankingId): { kind: 'in' | 'cup'; ties: boolean; title: string } | undefined {
  if (!c) return undefined;
  const ties = c.certainty === 'ties';
  const unless = ties ? ', salvo un desempate en contra' : '';
  if (c.cup === 'libertadores' && selected === 'libertadores') return { kind: 'in', ties, title: `Ya clasificado${unless}` };
  if (c.cup === 'copa') return { kind: 'cup', ties, title: `Juega la Libertadores o la Sudamericana${unless}` };
  return undefined;
}

/** Ranking de un solo objetivo a la vez: más fácil de leer que una tabla con muchas columnas. */
export function OddsRanking({ odds, teams, options, selected, onSelect, onTeam, goals, clinched }: Props) {
  const sorted = [...odds].sort((a, b) => value(b, selected) - value(a, selected) || b.expectedPoints - a.expectedPoints);
  const withChances = sorted.filter((o) => value(o, selected) > 0);
  const without = sorted.filter((o) => value(o, selected) === 0);
  const goal = goals.find((g) => g.id === selected)?.id ?? (selected === 'relegated' ? 'safe' : undefined);
  const bad = selected === 'relegated';
  const marks = selected === 'libertadores' || selected === 'sudamericana';
  const markOf = (id: TeamId) => (marks ? clinchedMark(clinched.find((c) => c.teamId === id), selected) : undefined);
  const shown = odds.map((o) => markOf(o.teamId)).filter((m) => m !== undefined);

  return (
    <>
      <div className="chip-groups" role="radiogroup" aria-label="Qué ver">
        {[...new Set(options.map((o) => o.group))].map((group) => (
          <div key={group} className="chip-group">
            <span className="chip-group-label">{group}</span>
            <div className="chips">
              {options
                .filter((o) => o.group === group)
                .map((o) => (
                  <button key={o.id} role="radio" aria-checked={o.id === selected} className="chip" onClick={() => onSelect(o.id)}>
                    {o.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <ol className="ranking">
        {withChances.map((o) => {
          const p = value(o, selected);
          return (
            <li key={o.teamId}>
              <button className={`ranking-row ${marks ? 'with-mark' : ''}`} onClick={() => onTeam(o.teamId, goal)} title="Ver qué necesita">
                <TeamCell team={teams.get(o.teamId)} />
                <span className="bar-track" aria-hidden>
                  <span className={`bar ${bad ? 'bar-bad' : ''}`} style={{ width: `${Math.max(p * 100, 1)}%` }} />
                </span>
                <span className="ranking-value">{pct(p)}</span>
                {marks && <Mark mark={markOf(o.teamId)} />}
              </button>
            </li>
          );
        })}
      </ol>
      {shown.length > 0 && (
        <ul className="mark-legend note">
          {shown.some((m) => m.kind === 'in') && (
            <li>
              <Mark mark={{ kind: 'in', ties: false, title: '' }} /> Ya clasificado, pase lo que pase
            </li>
          )}
          {shown.some((m) => m.kind === 'cup') && (
            <li>
              <Mark mark={{ kind: 'cup', ties: false, title: '' }} /> Copa asegurada: juega la Libertadores o la Sudamericana, falta saber cuál
            </li>
          )}
          {shown.some((m) => m.ties) && <li>* salvo que un desempate (diferencia de gol, etc.) le salga en contra</li>}
        </ul>
      )}
      {without.length > 0 && (
        <p className="note">
          Sin chances en ninguna simulación: {without.map((o) => teams.get(o.teamId)?.shortName ?? o.teamId).join(', ')}.
        </p>
      )}
    </>
  );
}

function Mark({ mark }: { mark: ReturnType<typeof clinchedMark> }) {
  if (!mark) return <span />;
  return (
    <span className="clinched" title={mark.title} aria-label={mark.title}>
      <span className={`clinched-mark mark-${mark.kind}`}>✓</span>
      {mark.ties && <span className="clinched-ties">*</span>}
    </span>
  );
}
