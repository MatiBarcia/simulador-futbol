import { useEffect, useMemo, useState } from 'react';
import type { SeasonData, Team, TeamId } from '../domain/types.ts';
import { buildLeagueView, type LeagueView } from '../engine/league.ts';
import { truncate } from '../engine/promedios.ts';
import { promediosRules } from '../rules/lpf.ts';
import { Copas } from './Copas.tsx';
import { Fixture } from './Fixture.tsx';
import { Loading } from './Loading.tsx';
import { Simulator } from './Simulator.tsx';
import { AnnualTable, PromediosTable, ZoneTables } from './tables.tsx';
import { useLeagueData } from './useLeagueData.ts';

const TABS = [
  { id: 'zonas', label: 'Zonas' },
  { id: 'anual', label: 'Anual' },
  { id: 'promedios', label: 'Promedios' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'copas', label: 'Copas' },
  { id: 'simulador', label: 'Simulador' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === window.location.hash)?.id ?? 'zonas';

function useHashTab() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return tab;
}

export function App() {
  const data = useLeagueData();
  const tab = useHashTab();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1>
            Simulador <span>Liga Profesional</span>
          </h1>
          <nav className="tabs" aria-label="Secciones">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">
        {data.status === 'loading' && (
          <Loading loading label="Cargando datos…">
            <div className="loading-placeholder" />
          </Loading>
        )}
        {data.status === 'error' && <p className="status error">No se pudieron cargar los datos: {data.message}</p>}
        {data.status === 'ready' && <Content tab={tab} seasons={data.seasons} cups={data.cups} current={data.current} updatedAt={data.updatedAt} />}
      </main>
    </div>
  );
}

function Content({ tab, seasons, cups, current, updatedAt }: { tab: TabId; seasons: SeasonData[]; cups: SeasonData[]; current: number; updatedAt: string }) {
  const view = useMemo(() => buildLeagueView(seasons, current), [seasons, current]);
  const teams = useMemo(() => {
    const map = new Map<TeamId, Team>();
    for (const s of [...cups, ...[...seasons].sort((a, b) => a.season - b.season)]) for (const t of s.teams) map.set(t.id, t);
    return map;
  }, [seasons, cups]);
  const season = seasons.find((s) => s.season === current)!;
  const relegated = new Set([...view.relegated.byPromedio, ...view.relegated.byAnnualTable]);

  return (
    <>
      {tab === 'zonas' && <ZonesTab view={view} season={season} teams={teams} relegated={relegated} />}
      {tab === 'anual' && <AnnualTable view={view} teams={teams} />}
      {tab === 'promedios' && <PromediosTab view={view} teams={teams} />}
      {tab === 'fixture' && <Fixture season={season} view={view} teams={teams} />}
      {tab === 'copas' && <Copas seasons={seasons} cups={cups} current={current} teams={teams} />}
      {tab === 'simulador' && <Simulator seasons={seasons} cups={cups} current={current} teams={teams} />}
      <p className="updated">
        Datos: ESPN · actualizado {new Date(updatedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' })}
      </p>
    </>
  );
}

function ZonesTab({ view, season, teams, relegated }: { view: LeagueView; season: SeasonData; teams: Map<TeamId, Team>; relegated: Set<TeamId> }) {
  const ids = Object.keys(view.zones);
  const [picked, setPicked] = useState(ids.at(-1));
  const tournamentId = picked && view.zones[picked] ? picked : ids.at(-1);
  if (!tournamentId) return <p className="status">Todavía no hay tablas de zonas.</p>;
  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {ids.map((id) => (
            <button key={id} role="tab" aria-selected={id === tournamentId} onClick={() => setPicked(id)}>
              {season.tournaments.find((t) => t.id === id)?.name ?? id} {view.season}
            </button>
          ))}
        </div>
      </div>
      <ZoneTables zones={view.zones[tournamentId]} teams={teams} relegated={tournamentId === 'clausura' ? relegated : new Set()} />
    </>
  );
}

function PromediosTab({ view, teams }: { view: LeagueView; teams: Map<TeamId, Team> }) {
  const [year, setYear] = useState(view.season);
  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {[view.season, view.season + 1].map((y) => (
            <button key={y} role="tab" aria-selected={y === year} onClick={() => setYear(y)}>
              Promedios {y}
              {y > view.season}
            </button>
          ))}
        </div>
      </div>
      {year === view.season ? <CurrentPromedios view={view} teams={teams} /> : <NextPromedios view={view} teams={teams} />}
    </>
  );
}

function CurrentPromedios({ view, teams }: { view: LeagueView; teams: Map<TeamId, Team> }) {
  const { seasons } = promediosRules(view.season);
  return (
    <section className="card">
      <h3>Promedios {view.season}</h3>
      <p className="note">
        Puntos ÷ partidos de la fase regular de {seasons.join(', ')}. Desciende el último. Los recién ascendidos promedian solo lo que
        jugaron en Primera. Se publica truncado a 3 decimales.
      </p>
      <PromediosTable rows={view.promedios} seasons={seasons} teams={teams} relegated={new Set(view.relegated.byPromedio)} />
    </section>
  );
}

function NextPromedios({ view, teams }: { view: LeagueView; teams: Map<TeamId, Team> }) {
  const next = view.season + 1;
  const { seasons } = promediosRules(next);
  const carried = seasons.filter((s) => s <= view.season);
  // Los que hoy descenderían no van a estar en Primera el año que viene: se muestran aparte.
  const goingDown = new Map<TeamId, string>([
    ...view.relegated.byPromedio.map((id): [TeamId, string] => [id, `hoy desciende en ${view.season}`]),
    ...view.relegated.byAnnualTable.map((id): [TeamId, string] => [id, `hoy desciende en ${view.season}`]),
  ]);
  const staying = view.nextPromedios.filter((r) => !goingDown.has(r.teamId));
  const last = staying.at(-1);
  const tiedWithLast = last ? staying.filter((r) => truncate(r.average, 3) === truncate(last.average, 3)) : [];
  const rows = [...staying, ...view.nextPromedios.filter((r) => goingDown.has(r.teamId))];

  return (
    <section className="card">
      <h3>Promedios {next}</h3>
      <p className="note">
        En {next} se promedian {seasons.join(', ')}: {seasons[0] - 1} deja de contar. Esta tabla muestra con qué promedio arranca cada equipo
        el año que viene ({carried.join(' + ')}), antes de jugar {next}.
      </p>
      <ul className="facts">
        <li>
          Los 2 ascendidos de la Primera Nacional arrancan {next} sin promedio: se calcula solo con lo que jueguen en {next}.
        </li>
        <li>Los equipos que hoy descenderían en {view.season} figuran abajo, sin posición.</li>
        {last && tiedWithLast.length === 1 && (
          <li>
            Hoy el último sería <strong>{teams.get(last.teamId)?.name}</strong> con {truncate(last.average, 3)}.
          </li>
        )}
        {tiedWithLast.length > 1 && (
          <li>
            Hoy comparten el último lugar con {truncate(last!.average, 3)}:{' '}
            <strong>{tiedWithLast.map((r) => teams.get(r.teamId)?.name).join(' y ')}</strong>. Si terminara así, habría partido de desempate.
          </li>
        )}
      </ul>
      <PromediosTable
        rows={rows}
        seasons={carried}
        futureSeason={next}
        teams={teams}
        relegated={new Set(tiedWithLast.map((r) => r.teamId))}
        muted={goingDown}
      />
    </section>
  );
}
