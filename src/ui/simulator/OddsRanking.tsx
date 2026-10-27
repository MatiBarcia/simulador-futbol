import type { Team, TeamId } from '../../domain/types.ts';
import type { Goal } from '../../engine/analysis.ts';
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
}

/** Ranking de un solo objetivo a la vez: más fácil de leer que una tabla con muchas columnas. */
export function OddsRanking({ odds, teams, options, selected, onSelect, onTeam, goals }: Props) {
  const sorted = [...odds].sort((a, b) => value(b, selected) - value(a, selected) || b.expectedPoints - a.expectedPoints);
  const withChances = sorted.filter((o) => value(o, selected) > 0);
  const without = sorted.filter((o) => value(o, selected) === 0);
  const goal = goals.find((g) => g.id === selected)?.id ?? (selected === 'relegated' ? 'safe' : undefined);
  const bad = selected === 'relegated';

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
              <button className="ranking-row" onClick={() => onTeam(o.teamId, goal)} title="Ver qué necesita">
                <TeamCell team={teams.get(o.teamId)} />
                <span className="bar-track" aria-hidden>
                  <span className={`bar ${bad ? 'bar-bad' : ''}`} style={{ width: `${Math.max(p * 100, 1)}%` }} />
                </span>
                <span className="ranking-value">{pct(p)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {without.length > 0 && (
        <p className="note">
          Sin chances en ninguna simulación: {without.map((o) => teams.get(o.teamId)?.shortName ?? o.teamId).join(', ')}.
        </p>
      )}
    </>
  );
}
