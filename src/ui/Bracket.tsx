import type { Team, TeamId } from '../domain/types.ts';
import { goalsOf, type BracketRound, type BracketSlot } from '../engine/bracket.ts';
import { dateFormat } from './format.ts';
import { TeamCell } from './TeamCell.tsx';

const ROUND_NAMES: Record<BracketRound['phase'], string> = {
  'round-of-64': '32avos',
  'round-of-32': '16avos',
  'round-of-16': 'Octavos',
  quarterfinals: 'Cuartos',
  semifinals: 'Semis',
  final: 'Final',
};

export function Bracket({ rounds, teams }: { rounds: BracketRound[]; teams: Map<TeamId, Team> }) {
  return (
    <div className="bracket-scroll">
      <div className="bracket">
        {rounds.map((round, r) => (
          <div key={round.phase} className="bracket-round">
            <h4>{ROUND_NAMES[round.phase]}</h4>
            <div className="bracket-slots">
              {r === rounds.length - 1 ? (
                <div className="bracket-pair is-last">
                  <Slot slot={round.slots[0]} teams={teams} hasFeeder={r > 0} />
                </div>
              ) : (
                pairs(round.slots).map((pair, i) => (
                  <div key={i} className="bracket-pair">
                    {pair.map((slot, j) => (
                      <Slot key={j} slot={slot} teams={teams} hasFeeder={r > 0} />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slot({ slot, teams, hasFeeder }: { slot: BracketSlot; teams: Map<TeamId, Team>; hasFeeder: boolean }) {
  const m = slot.match;
  const live = m?.status === 'live';
  return (
    <div className={`bracket-slot ${hasFeeder ? 'has-feeder' : ''}`}>
      <div className={`bracket-match ${live ? 'is-live' : ''}`}>
        {slot.teams.map((id, i) => {
          const score = m && id ? goalsOf(m, id) : undefined;
          const decided = slot.winner !== undefined;
          return (
            <div key={i} className={`bracket-team ${decided && slot.winner === id ? 'is-winner' : decided ? 'is-loser' : ''}`}>
              {slot.seeds && <span className="seed">{slot.seeds[i]}</span>}
              {id ? <TeamCell team={teams.get(id)} /> : <span className="team tbd">A definir</span>}
              <span className="bracket-score">
                {score?.goals ?? ''}
                {score?.penalties !== undefined && <sup>({score.penalties})</sup>}
              </span>
            </div>
          );
        })}
        {m && m.status !== 'finished' && (
          <div className="bracket-date">{live ? (m.clock ?? 'En juego') : dateFormat.format(new Date(m.date))}</div>
        )}
      </div>
    </div>
  );
}

function pairs<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 2) result.push(items.slice(i, i + 2));
  return result;
}
