import type { Team, TeamId } from '../domain/types.ts';
import type { LeagueView, ZoneTable } from '../engine/league.ts';
import { truncate, type PromedioRow } from '../engine/promedios.ts';
import type { RankedRow } from '../engine/standings.ts';
import { TeamCell } from './TeamCell.tsx';

type TeamsById = Map<TeamId, Team>;

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="legend">
      {items.map(([cls, text]) => (
        <li key={cls}>
          <span className={`swatch ${cls}`} /> {text}
        </li>
      ))}
    </ul>
  );
}

export function ZoneTables({ zones, teams, relegated }: { zones: ZoneTable[]; teams: TeamsById; relegated: Set<TeamId> }) {
  return (
    <>
      <div className="zones">
        {zones.map((zone) => (
          <section key={zone.group} className="card">
            <h3>Zona {zone.group}</h3>
            <table className="standings">
              <thead>
                <tr>
                  <th className="pos">#</th>
                  <th className="team-col">Equipo</th>
                  <th>Pts</th>
                  <th>PJ</th>
                  <th className="wide">G</th>
                  <th className="wide">E</th>
                  <th className="wide">P</th>
                  <th className="wide">Goles</th>
                  <th>Dif</th>
                  <th className="wide form-col">Últimos</th>
                </tr>
              </thead>
              <tbody>
                {zone.rows.map((r) => (
                  <tr key={r.teamId} className={zone.playoffs.has(r.teamId) ? 'is-playoffs' : relegated.has(r.teamId) ? 'is-relegated' : ''}>
                    <td className="pos">{r.position}</td>
                    <td className="team-col">
                      <TeamCell team={teams.get(r.teamId)} tag={relegated.has(r.teamId) ? 'desc.' : undefined} />
                    </td>
                    <td className="pts">{r.points}</td>
                    <td>{r.played}</td>
                    <td className="wide">{r.won}</td>
                    <td className="wide">{r.drawn}</td>
                    <td className="wide">{r.lost}</td>
                    <td className="wide">
                      {r.goalsFor}:{r.goalsAgainst}
                    </td>
                    <td>{sign(r.goalDiff)}</td>
                    <td className="wide form-col">
                      <Form form={r.form} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <Legend
        items={[
          ['is-playoffs', 'Playoffs (8 por zona)'],
          ['is-relegated', 'En zona de descenso: no juega los playoffs del Clausura (art. 14.1.2)'],
        ]}
      />
    </>
  );
}

function Form({ form }: { form: RankedRow['form'] }) {
  return (
    <span className="form">
      {form.slice(-5).map((f, i) => (
        <span key={i} className={`form-${f}`} title={f === 'W' ? 'Ganó' : f === 'D' ? 'Empató' : 'Perdió'}>
          {f === 'W' ? 'G' : f === 'D' ? 'E' : 'P'}
        </span>
      ))}
    </span>
  );
}

export function AnnualTable({ view, teams }: { view: LeagueView; teams: TeamsById }) {
  const relegated = new Set(view.relegated.byAnnualTable);
  const byPromedio = new Set(view.relegated.byPromedio);
  return (
    <section className="card">
      <h3>Tabla anual {view.season}</h3>
      <p className="note">Suma la fase de zonas del Apertura y el Clausura. Los playoffs no cuentan.</p>
      <table className="standings">
        <thead>
          <tr>
            <th className="pos">#</th>
            <th className="team-col">Equipo</th>
            <th>Pts</th>
            <th>PJ</th>
            <th className="wide">G</th>
            <th className="wide">E</th>
            <th className="wide">P</th>
            <th className="wide">Goles</th>
            <th>Dif</th>
          </tr>
        </thead>
        <tbody>
          {view.annual.map((r) => (
            <tr key={r.teamId} className={r.position === 1 ? 'is-leader' : relegated.has(r.teamId) ? 'is-relegated' : byPromedio.has(r.teamId) ? 'is-muted' : ''}>
              <td className="pos">{r.position}</td>
              <td className="team-col">
                <TeamCell team={teams.get(r.teamId)} tag={byPromedio.has(r.teamId) ? 'desc. por promedio' : undefined} />
              </td>
              <td className="pts">{r.points}</td>
              <td>{r.played}</td>
              <td className="wide">{r.won}</td>
              <td className="wide">{r.drawn}</td>
              <td className="wide">{r.lost}</td>
              <td className="wide">
                {r.goalsFor}:{r.goalsAgainst}
              </td>
              <td>{sign(r.goalDiff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Legend
        items={[
          ['is-leader', 'Campeón de Liga'],
          ['is-relegated', 'Desciende por tabla anual (el último, sin contar al que baja por promedio)'],
        ]}
      />
    </section>
  );
}

interface PromediosProps {
  rows: PromedioRow[];
  seasons: number[];
  teams: TeamsById;
  /** Equipos que se marcan en rojo: descienden por promedio. */
  relegated: Set<TeamId>;
  /** Equipos que se muestran apagados, con una etiqueta (ej. "desciende en 2026"). */
  muted?: Map<TeamId, string>;
  /** Temporada que todavía no empezó: se muestra la columna vacía. */
  futureSeason?: number;
}

export function PromediosTable({ rows, seasons, teams, relegated, muted, futureSeason }: PromediosProps) {
  const allSeasons = futureSeason ? [...seasons, futureSeason] : seasons;
  let position = 0;
  return (
    <table className="standings promedios">
      <thead>
        <tr>
          <th className="pos">#</th>
          <th className="team-col">Equipo</th>
          {allSeasons.map((s) => (
            <th key={s} className="wide">
              {s}
            </th>
          ))}
          <th>Pts</th>
          <th>PJ</th>
          <th>Prom.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const mutedTag = muted?.get(r.teamId);
          if (!mutedTag) position++;
          return (
            <tr key={r.teamId} className={mutedTag ? 'is-muted' : relegated.has(r.teamId) ? 'is-relegated' : ''}>
              <td className="pos">{mutedTag ? '–' : position}</td>
              <td className="team-col">
                <TeamCell team={teams.get(r.teamId)} tag={mutedTag ?? (r.tied ? 'empate' : undefined)} />
              </td>
              {allSeasons.map((s) => (
                <td key={s} className="wide">
                  {s === futureSeason ? '·' : (r.bySeason[s]?.points ?? '–')}
                </td>
              ))}
              <td>{r.points}</td>
              <td>{r.played}</td>
              <td className="pts">{truncate(r.average, 3)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
