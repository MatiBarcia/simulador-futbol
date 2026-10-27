import type { Match, Team, TeamId } from '../../domain/types.ts';
import type { LeagueView } from '../../engine/league.ts';
import { expectedGoals, outcomeProbabilities, scoreGrid, type Ratings } from '../../engine/model.ts';
import { dateFormat, smallLogo } from '../format.ts';
import { promediosRules } from '../../rules/lpf.ts';
import { AnnualTable, PromediosTable, ZoneTables } from '../tables.tsx';
import { pct } from './labels.ts';

/** Lo que el usuario va cargando: un partido cuenta como fijado recién cuando tiene los dos goles. */
export type Draft = Record<string, { home?: number; away?: number }>;

interface Props {
  pending: Match[];
  draft: Draft;
  onChange: (id: string, result: { home?: number; away?: number } | undefined) => void;
  onClearAll: () => void;
  ratings: Ratings;
  teams: Map<TeamId, Team>;
  /** Tablas con los resultados elegidos. */
  view: LeagueView;
  tournamentId: string | undefined;
}

// Resultado por defecto al tocar un botón; después se pueden cambiar los goles.
const QUICK = { home: { home: 1, away: 0 }, draw: { home: 1, away: 1 }, away: { home: 0, away: 1 } };

export function PlayMatches({ pending, draft, onChange, onClearAll, ratings, teams, view, tournamentId }: Props) {
  const chosen = Object.keys(draft).length;
  const zones = tournamentId ? view.zones[tournamentId] : undefined;
  const relegated = new Set([...view.relegated.byPromedio, ...view.relegated.byAnnualTable]);
  const rounds = new Map<number, Match[]>();
  for (const m of pending) rounds.set(m.round ?? 0, [...(rounds.get(m.round ?? 0) ?? []), m]);

  return (
    <>
      <div className="play-toolbar">
        <p className="note">
          Elegí quién gana cada partido (o cargá el resultado exacto) y mirá abajo cómo quedarían las zonas, la tabla anual y los promedios.
          En cada botón, la chance de ese resultado según el modelo.
        </p>
        {chosen > 0 && (
          <button className="clear-all" onClick={onClearAll}>
            {chosen === 1 ? 'Borrar el resultado' : `Borrar los ${chosen} resultados`}
          </button>
        )}
      </div>
      {[...rounds].sort((a, b) => a[0] - b[0]).map(([round, matches]) => (
        <div key={round}>
          <h4 className="round-title">Fecha {round}</h4>
          <ul className="play-list">
            {matches.map((m) => (
              <PlayMatch key={m.id} match={m} result={draft[m.id]} onChange={(r) => onChange(m.id, r)} ratings={ratings} teams={teams} />
            ))}
          </ul>
        </div>
      ))}
      {zones && (
        <>
          <h4 className="goal-heading">Así quedarían las zonas</h4>
          <ZoneTables zones={zones} teams={teams} relegated={tournamentId === 'clausura' ? relegated : new Set()} />
        </>
      )}
      <h4 className="goal-heading">Así quedaría la tabla anual</h4>
      <AnnualTable view={view} teams={teams} />
      <h4 className="goal-heading">Así quedarían los promedios {view.season}</h4>
      <section className="card">
        <PromediosTable rows={view.promedios} seasons={promediosRules(view.season).seasons} teams={teams} relegated={new Set(view.relegated.byPromedio)} />
      </section>
    </>
  );
}

function PlayMatch({ match: m, result, onChange, ratings, teams }: {
  match: Match;
  result: { home?: number; away?: number } | undefined;
  onChange: (r: { home?: number; away?: number } | undefined) => void;
  ratings: Ratings;
  teams: Map<TeamId, Team>;
}) {
  const [lh, la] = expectedGoals(ratings, m.homeId, m.awayId);
  const p = outcomeProbabilities(scoreGrid(lh, la, ratings.rho));
  const complete = result?.home !== undefined && result?.away !== undefined;
  const picked = complete ? (result.home! > result.away! ? 'home' : result.home === result.away ? 'draw' : 'away') : undefined;
  const home = teams.get(m.homeId);
  const away = teams.get(m.awayId);
  const choices = [
    { id: 'home' as const, label: home?.shortName ?? m.homeId, logo: home?.logoUrl, p: p.home },
    { id: 'draw' as const, label: 'Empate', logo: undefined, p: p.draw },
    { id: 'away' as const, label: away?.shortName ?? m.awayId, logo: away?.logoUrl, p: p.away },
  ];
  const setGoals = (side: 'home' | 'away', v: string) => {
    const goals = v === '' ? undefined : Math.max(0, Math.min(20, Math.trunc(Number(v))));
    const next = { ...result, [side]: goals };
    onChange(next.home === undefined && next.away === undefined ? undefined : next);
  };

  return (
    <li className={`play ${complete ? 'is-fixed' : ''}`}>
      <div className="play-head">
        <span>{dateFormat.format(new Date(m.date))}</span>
        {result && (
          <button className="link-button" onClick={() => onChange(undefined)}>
            Quitar
          </button>
        )}
      </div>
      <div className="play-choices" role="radiogroup" aria-label={`${home?.name} vs ${away?.name}`}>
        {choices.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={picked === c.id}
            className={`play-choice choice-${c.id}`}
            onClick={() => onChange(picked === c.id ? undefined : QUICK[c.id])}
          >
            {c.logo && <img src={smallLogo(c.logo)} alt="" width={18} height={18} />}
            <span className="play-label">{c.label}</span>
            <span className="play-prob">{pct(c.p)}</span>
          </button>
        ))}
      </div>
      {result && (
        <div className="play-score">
          <span>Resultado:</span>
          <input type="number" inputMode="numeric" min={0} max={20} value={result.home ?? ''} onChange={(e) => setGoals('home', e.target.value)} aria-label={`Goles de ${home?.name}`} />
          <span>-</span>
          <input type="number" inputMode="numeric" min={0} max={20} value={result.away ?? ''} onChange={(e) => setGoals('away', e.target.value)} aria-label={`Goles de ${away?.name}`} />
        </div>
      )}
    </li>
  );
}
