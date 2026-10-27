import { useEffect, useMemo, useState } from 'react';
import type { SeasonData, Team, TeamId } from '../domain/types.ts';
import { analyzeGoal, type Goal } from '../engine/analysis.ts';
import { buildLeagueView } from '../engine/league.ts';
import { DEFAULT_FIT, fitRatings } from '../engine/model.ts';
import { hydrateAnalysis } from '../engine/precomputed.ts';
import { applyFixed, currentTournament, type FixedResults } from '../engine/simulate.ts';
import { goalOptions } from './simulator/labels.ts';
import { OddsRanking, type RankingId } from './simulator/OddsRanking.tsx';
import { PlayMatches, type Draft } from './simulator/PlayMatches.tsx';
import { TeamGoal, type GoalSource } from './simulator/TeamGoal.tsx';
import { Loading } from './Loading.tsx';
import { usePrecomputed } from './usePrecomputed.ts';
import { DEVICE_MAX_ITERATIONS, useSimulation } from './useSimulation.ts';

const SECTIONS = [
  { id: 'goal', label: '¿Qué necesita mi equipo?' },
  { id: 'odds', label: 'Probabilidades' },
  { id: 'play', label: 'Jugá los partidos' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

// Preferencias de cada visitante (equipo elegido, resultados cargados): solo en su navegador.
function useStored<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sin storage (modo privado): dura lo que dure la pestaña
    }
  }, [key, value]);
  return [value, setValue];
}

interface Props {
  seasons: SeasonData[];
  cups: SeasonData[];
  current: number;
  teams: Map<TeamId, Team>;
}

export function Simulator({ seasons, cups, current, teams }: Props) {
  const season = seasons.find((s) => s.season === current)!;
  const tournamentId = currentTournament(season);
  const tournamentName = season.tournaments.find((t) => t.id === tournamentId)?.name ?? '';
  const goals = goalOptions(current, tournamentName);

  const [section, setSection] = useState<SectionId>('goal');
  const [teamId, setTeamId] = useStored<TeamId | undefined>('simulador:equipo', undefined);
  const [goal, setGoal] = useStored<Goal>('simulador:objetivo', 'libertadores');
  const [ranking, setRanking] = useState<RankingId>('champion');

  const matches = season.matches;
  const pending = useMemo(() => matches.filter((m) => m.phase === 'regular' && m.status !== 'finished' && m.status !== 'cancelled'), [matches]);
  const [storedDraft, setDraft] = useStored<Draft>(`simulador:fijados:${current}`, {});
  // Descarta resultados guardados de partidos que ya se jugaron.
  const draft = useMemo(() => {
    const ids = new Set(pending.map((m) => m.id));
    return Object.fromEntries(Object.entries(storedDraft).filter(([id]) => ids.has(id)));
  }, [storedDraft, pending]);

  // Solo cuentan los partidos con los dos goles cargados. La clave estable evita re-simular por un gol a medio cargar.
  const completeKey = JSON.stringify(Object.entries(draft).filter(([, r]) => r.home !== undefined && r.away !== undefined));
  const fixed = useMemo(() => Object.fromEntries(JSON.parse(completeKey) as [string, { home: number; away: number }][]) as FixedResults, [completeKey]);
  const fixedCount = Object.keys(fixed).length;
  // Sin resultados elegidos por el usuario, se usa la simulación de la nube (si está al día con los datos).
  // Con resultados propios, o si la de la nube está desactualizada, se simula en el dispositivo.
  const { precomputed, checked } = usePrecomputed(seasons, cups);
  const cloud = fixedCount === 0 ? precomputed : undefined;
  const sim = useSimulation(seasons, cups, current, fixed, checked && !cloud);
  const odds = cloud ? cloud.teams : sim.result?.teams;
  const simResult = sim.result;
  const source = useMemo<GoalSource | undefined>(() => {
    if (cloud) return { leagueTeams: cloud.teams.map((t) => t.teamId), allTeams: cloud.allTeams, analyze: (t, g) => hydrateAnalysis(cloud, t, g) };
    if (simResult) return { leagueTeams: simResult.samples.teams, allTeams: simResult.samples.allTeams, analyze: (t, g) => analyzeGoal(simResult.samples, t, g) };
    return undefined;
  }, [cloud, simResult]);
  const loading = !checked || (!cloud && sim.loading);

  const ratings = useMemo(() => {
    const all = [...seasons, ...cups.filter((c) => c.competition === 'copa-argentina')].flatMap((s) => s.matches);
    const lastPlayed = all.filter((m) => m.status === 'finished').reduce((max, m) => (m.date > max ? m.date : max), '');
    return fitRatings(all, { ...DEFAULT_FIT, asOf: lastPlayed });
  }, [seasons, cups]);

  const fixedView = useMemo(
    () => buildLeagueView(seasons.map((s) => (s.season === current ? { ...s, matches: applyFixed(s.matches, fixed) } : s)), current),
    [seasons, current, fixed],
  );

  if (pending.length === 0) return <p className="status">La fase regular terminó: no quedan partidos para simular.</p>;

  const rankingOptions: { id: RankingId; label: string }[] = [
    { id: 'champion', label: goals.find((g) => g.id === 'champion')!.label },
    { id: 'playoffs', label: goals.find((g) => g.id === 'playoffs')!.label },
    { id: 'leagueChampion', label: 'Campeón de Liga' },
    { id: 'libertadores', label: goals.find((g) => g.id === 'libertadores')!.label },
    { id: 'sudamericana', label: goals.find((g) => g.id === 'sudamericana')!.label },
    { id: 'relegated', label: 'Descenso' },
  ];

  return (
    <section className="card simulator">
      <div className="sim-intro">
        <h3>Simulador</h3>
        <p>
          Jugamos muchas veces lo que falta de la temporada — los {pending.length} partidos del {tournamentName.replace('Torneo ', '')}, los
          playoffs, la Copa Argentina y las finales de la Libertadores y la Sudamericana — y contamos qué pasa en cada caso. Los porcentajes se
          van afinando a medida que se suman simulaciones.
        </p>
        {cloud ? (
          <div className="sim-progress">
            {cloud.iterations.toLocaleString('es-AR')} simulaciones calculadas en la nube · {timeAgo(cloud.generatedAt)}
          </div>
        ) : (
          sim.result && (
            <div className="sim-progress" aria-live="polite">
              <span className="sim-progress-track" aria-hidden>
                <span className="sim-progress-bar" style={{ width: `${(sim.progress / DEVICE_MAX_ITERATIONS) * 100}%` }} />
              </span>
              <span>
                {sim.progress.toLocaleString('es-AR')} de {DEVICE_MAX_ITERATIONS.toLocaleString('es-AR')} simulaciones en tu dispositivo
                {sim.refining ? ' · afinando…' : ' · listo'}
              </span>
            </div>
          )
        )}
      </div>

      <div className="sim-tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === section} onClick={() => setSection(s.id)}>
            {s.label}
            {s.id === 'play' && fixedCount > 0 && <span className="badge">{fixedCount}</span>}
          </button>
        ))}
      </div>

      {fixedCount > 0 && section !== 'play' && (
        <div className="banner">
          Usando {fixedCount} resultado{fixedCount > 1 ? 's' : ''} que elegiste.{' '}
          <button className="link-button" onClick={() => setSection('play')}>
            Ver
          </button>
          <button className="link-button" onClick={() => setDraft({})}>
            Borrar
          </button>
        </div>
      )}

      <div className="sim-body">
        {!cloud && sim.error && <p className="status error">Error en la simulación: {sim.error}</p>}
        {section === 'play' ? (
          <PlayMatches
            pending={pending}
            draft={draft}
            onChange={(id, r) =>
              setDraft((prev) => {
                const next = { ...prev };
                if (r) next[id] = r;
                else delete next[id];
                return next;
              })
            }
            ratings={ratings}
            teams={teams}
            zones={tournamentId ? fixedView.zones[tournamentId] : undefined}
            relegated={tournamentId === 'clausura' ? new Set([...fixedView.relegated.byPromedio, ...fixedView.relegated.byAnnualTable]) : new Set()}
          />
        ) : !odds || !source ? (
          <Loading loading label="Simulando…">
            <div className="loading-placeholder" />
          </Loading>
        ) : (
          <Loading loading={loading} label="Recalculando…">
            {section === 'goal' && (
              <TeamGoal source={source} teams={teams} goals={goals} teamId={teamId} goal={goal} onTeam={setTeamId} onGoal={setGoal} />
            )}
            {section === 'odds' && (
              <OddsRanking
                odds={odds}
                teams={teams}
                options={rankingOptions}
                selected={ranking}
                onSelect={setRanking}
                goals={goals}
                onTeam={(id, g) => {
                  setTeamId(id);
                  if (g) setGoal(g);
                  setSection('goal');
                }}
              />
            )}
          </Loading>
        )}
      </div>
    </section>
  );
}

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
};
