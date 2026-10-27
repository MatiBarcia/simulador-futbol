import { useState } from 'react';
import type { Match, SeasonData, Team, TeamId } from '../domain/types.ts';
import { buildBracket } from '../engine/bracket.ts';
import type { LeagueView } from '../engine/league.ts';
import { Bracket } from './Bracket.tsx';
import { dateFormat } from './format.ts';
import { TeamCell } from './TeamCell.tsx';

const PLAYOFFS = 'playoffs';

interface Stage {
  key: string; // `r<fecha>` o 'playoffs'
  label: string;
  matches: Match[];
}

function stagesOf(matches: Match[], hasPlayoffs: boolean): Stage[] {
  const stages = new Map<string, Stage>();
  for (const m of matches) {
    const key = m.phase === 'regular' ? `r${m.round}` : PLAYOFFS;
    const label = m.phase === 'regular' ? String(m.round) : 'Playoffs';
    if (!stages.has(key)) stages.set(key, { key, label, matches: [] });
    stages.get(key)!.matches.push(m);
  }
  if (hasPlayoffs && !stages.has(PLAYOFFS)) stages.set(PLAYOFFS, { key: PLAYOFFS, label: 'Playoffs', matches: [] });
  const order = (s: Stage) => (s.key === PLAYOFFS ? Infinity : Number(s.key.slice(1)));
  return [...stages.values()].sort((a, b) => order(a) - order(b));
}

/** La fecha que conviene mostrar primero: la primera con partidos sin terminar, o la última. */
const defaultStage = (stages: Stage[]) =>
  (stages.find((s) => s.key !== PLAYOFFS && s.matches.some((m) => m.status !== 'finished')) ?? stages.at(-1))?.key;

export function Fixture({ season, view, teams }: { season: SeasonData; view: LeagueView; teams: Map<TeamId, Team> }) {
  const tournaments = season.tournaments.filter((t) => season.matches.some((m) => m.tournamentId === t.id));
  const [tournamentId, setTournamentId] = useState(tournaments.at(-1)?.id);
  const tournamentMatches = season.matches.filter((m) => m.tournamentId === tournamentId);
  const zones = tournamentId ? view.zones[tournamentId] : undefined;
  const stages = stagesOf(tournamentMatches, zones !== undefined);
  const [picked, setPicked] = useState<string | undefined>();
  const stageKey = stages.some((s) => s.key === picked) ? picked : defaultStage(stages);
  const stage = stages.find((s) => s.key === stageKey);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {tournaments.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tournamentId}
              onClick={() => {
                setTournamentId(t.id);
                setPicked(undefined);
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="rounds" role="tablist" aria-label="Fecha">
        {stages.map((s) => (
          <button key={s.key} role="tab" aria-selected={s.key === stageKey} onClick={() => setPicked(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {stage?.key === PLAYOFFS && zones && (
        <>
          <h3>Playoffs</h3>
          {stage.matches.length === 0 && (
            <p className="note">Todavía no empezaron: así quedarían los cruces si la fase de zonas terminara hoy.</p>
          )}
          <Bracket rounds={buildBracket(zones, stage.matches)} teams={teams} />
        </>
      )}
      {stage && stage.key !== PLAYOFFS && (
        <>
          <h3>Fecha {stage.label}</h3>
          <ul className="matches">
            {stage.matches.map((m) => (
              <MatchRow key={m.id} match={m} teams={teams} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MatchRow({ match: m, teams }: { match: Match; teams: Map<TeamId, Team> }) {
  const played = m.homeGoals !== undefined && m.awayGoals !== undefined;
  const status =
    m.status === 'live' ? (m.clock ?? 'En juego') : m.status === 'postponed' ? 'Postergado' : m.status === 'suspended' ? 'Suspendido' : m.status === 'cancelled' ? 'Cancelado' : null;
  return (
    <li className={`match ${m.status === 'live' ? 'is-live' : ''}`}>
      <span className="match-date">{status ?? dateFormat.format(new Date(m.date))}</span>
      <span className="match-home">
        <TeamCell team={teams.get(m.homeId)} />
      </span>
      <span className="match-score">{played ? `${m.homeGoals} - ${m.awayGoals}` : 'vs'}</span>
      <span className="match-away">
        <TeamCell team={teams.get(m.awayId)} />
      </span>
    </li>
  );
}
