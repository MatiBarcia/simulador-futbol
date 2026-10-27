import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SeasonData, Team, TeamId } from '../domain/types.ts';
import { buildTitleGraph, TITLE_NAMES, TITLE_RULES, type Odds, type TitleGraph, type TitleNode } from '../engine/titleGraph.ts';
import { dateFormat, shortDate } from './format.ts';
import { pct } from './simulator/labels.ts';
import { TeamCell } from './TeamCell.tsx';
import { TrophyIcon } from './TrophyIcon.tsx';
import { usePrecomputed } from './usePrecomputed.ts';

interface Props {
  seasons: SeasonData[];
  cups: SeasonData[];
  current: number;
  teams: Map<TeamId, Team>;
}

/** Árbol de títulos nacionales: la Recopa arriba y, hacia abajo, los títulos que definen quién la juega. */
export function Copas({ seasons, cups, current, teams }: Props) {
  const { precomputed } = usePrecomputed(seasons, cups);
  const years = [current + 1, current + 2];
  const [year, setYear] = useState(current + 2);
  const graph = useMemo(
    () => buildTitleGraph({ seasons, cups, current, odds: precomputed?.teams, tournamentId: precomputed?.tournamentId }, year),
    [seasons, cups, current, precomputed, year],
  );

  return (
    <section className="card">
      <h3>Camino a la Recopa de Campeones</h3>
      <p className="note">
        Cada título define quién juega el de arriba. Los que todavía no se definieron muestran la chance de cada equipo, según las simulaciones del
        Simulador.
      </p>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {years.map((y) => (
            <button key={y} role="tab" aria-selected={y === year} onClick={() => setYear(y)}>
              Recopa {y}
            </button>
          ))}
        </div>
      </div>
      <TitleTree graph={graph} teams={teams} />
    </section>
  );
}

/** Colores de las líneas: cada título que tiene títulos debajo usa uno, y su tarjeta lleva un borde del mismo color. */
const EDGE_COLORS = 4;

interface Line {
  key: string;
  d: string;
  done: boolean;
  color: number;
}

type Box = { left: number; top: number; bottom: number; width: number; center: number };

/** Punto de salida i de k en el borde de abajo de una tarjeta (para que cada línea salga por su propio lugar). */
const exitPoint = (box: Box, i: number, k: number) => box.left + (box.width * (i + 1)) / (k + 1);

/**
 * Punto de llegada i de k en el borde de arriba. Cuando a un título llegan varias líneas, entran más juntas que las
 * salidas (40% y 60% en vez de 33% y 66%), así una línea que llega nunca cae justo sobre una que sale de la tarjeta de arriba.
 */
const entryPoint = (box: Box, i: number, k: number) => (k === 1 ? box.center : box.left + box.width * (0.4 + (0.2 * i) / (k - 1)));

function TitleTree({ graph, teams }: { graph: TitleGraph; teams: Map<TeamId, Team> }) {
  const container = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);

  // Un color por cada título con títulos debajo, en el orden en que se dibujan.
  const colors = useMemo(() => {
    const parents = graph.levels.flat().filter((id) => graph.nodes[id].inputs.length > 0);
    return new Map(parents.map((id, i) => [id, i % EDGE_COLORS]));
  }, [graph]);

  // Las líneas se dibujan midiendo dónde quedó cada tarjeta (y se vuelven a medir si cambia el tamaño).
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const boxes = new Map<string, Box>();
      for (const [id, el] of cards.current) {
        const r = el.getBoundingClientRect();
        boxes.set(id, { left: r.left - base.left, top: r.top - base.top, bottom: r.bottom - base.top, width: r.width, center: r.left - base.left + r.width / 2 });
      }
      const byX = (a: string, b: string) => boxes.get(a)!.center - boxes.get(b)!.center;
      // Para cada título de abajo, quiénes lo usan (ordenados de izquierda a derecha).
      const parentsOf = new Map<string, string[]>();
      for (const node of Object.values(graph.nodes)) {
        for (const input of node.inputs) parentsOf.set(input, [...(parentsOf.get(input) ?? []), node.id]);
      }

      const next: Line[] = [];
      for (const node of Object.values(graph.nodes)) {
        const parent = boxes.get(node.id);
        if (!parent) continue;
        const inputs = node.inputs.filter((id) => boxes.has(id)).sort(byX);
        inputs.forEach((inputId, i) => {
          const child = boxes.get(inputId)!;
          const siblings = (parentsOf.get(inputId) ?? []).filter((id) => boxes.has(id)).sort(byX);
          const x1 = exitPoint(parent, i, inputs.length);
          const x2 = entryPoint(child, siblings.indexOf(node.id), siblings.length);
          const bend = (child.top - parent.bottom) / 2;
          next.push({
            key: `${node.id}-${inputId}`,
            // Una curva suave: sale vertical de la tarjeta de arriba y llega vertical a la de abajo.
            d: `M${x1},${parent.bottom} C${x1},${parent.bottom + bend} ${x2},${child.top - bend} ${x2},${child.top}`,
            done: graph.nodes[inputId].state.kind === 'decided',
            color: colors.get(node.id) ?? 0,
          });
        });
      }
      setLines(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const el of cards.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [graph, colors]);

  return (
    <div className="tree-scroll">
      <div className="title-tree" ref={container}>
        <svg className="tree-lines" aria-hidden>
          {lines.map((l) => (
            <path key={l.key} d={l.d} className={`edge-${l.color} ${l.done ? 'done' : ''}`} />
          ))}
        </svg>
        {graph.levels.map((level, i) => (
          <div key={i} className="tree-level" style={{ gridTemplateColumns: `repeat(${level.length}, minmax(0, 1fr))` }}>
            {level.map((id) => (
              <TitleCard
                key={id}
                node={graph.nodes[id]}
                teams={teams}
                edgeColor={colors.get(id)}
                ref={(el) => {
                  if (el) cards.current.set(id, el);
                  else cards.current.delete(id);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TitleCard({ node, teams, edgeColor, ref }: {
  node: TitleNode;
  teams: Map<TeamId, Team>;
  /** Color de las líneas que salen hacia abajo de esta tarjeta (si tiene títulos debajo). */
  edgeColor: number | undefined;
  ref: (el: HTMLElement | null) => void;
}) {
  const s = node.state;
  const name = (id: TeamId) => teams.get(id)?.shortName ?? id;
  return (
    <article ref={ref} className={`title-card state-${s.kind} ${edgeColor !== undefined ? `edge-${edgeColor}` : ''}`}>
      <header>
        <TrophyIcon kind={node.kind} muted={s.kind === 'future'} />
        <div>
          <h4>
            {TITLE_NAMES[node.kind]} {node.year}
          </h4>
          <p>{TITLE_RULES[node.kind]}</p>
        </div>
      </header>

      {s.kind === 'decided' && (
        <div className="title-result">
          <span className="title-label">Campeón</span>
          <TeamCell team={teams.get(s.champion)} />
          {s.runnerUp && (
            <small>
              a {name(s.runnerUp)}
              {s.score && ` · ${s.score}`}
            </small>
          )}
        </div>
      )}

      {s.kind === 'match' && (
        <div className="title-result">
          <span className="title-label">Se juega el {dateFormat.format(new Date(s.date))}</span>
          {s.teams.map((t, i) => (
            <div key={t} className="odds-row">
              <TeamCell team={teams.get(t)} />
              {s.odds && <strong>{pct(s.odds[i])}</strong>}
            </div>
          ))}
        </div>
      )}

      {s.kind === 'open' && (
        <div className="title-result">
          <span className="title-label">Chance de salir campeón</span>
          <OddsList odds={s.odds} teams={teams} />
          {s.matches && s.matches.length > 0 && (
            <small>
              Faltan: {s.matches.map((m) => `${name(m.homeId)} vs ${name(m.awayId)} (${shortDate.format(new Date(m.date))})`).join(' · ')}
            </small>
          )}
        </div>
      )}

      {s.kind === 'entrants' && (
        <div className="title-result">
          <span className="title-label">Chance de jugarla</span>
          <OddsList odds={s.odds} teams={teams} />
        </div>
      )}

      {s.kind === 'future' && <p className="title-future">Se define más adelante</p>}
    </article>
  );
}

const SHOWN = 4;

function OddsList({ odds, teams }: { odds: Odds[]; teams: Map<TeamId, Team> }) {
  if (odds.length === 0) return <p className="title-future">Todavía no hay probabilidades calculadas</p>;
  const rest = odds.length - SHOWN;
  return (
    <>
      {odds.slice(0, SHOWN).map((o) => (
        <div key={o.teamId} className="odds-row">
          <TeamCell team={teams.get(o.teamId)} />
          <strong>{o.probability >= 1 ? 'Seguro' : pct(o.probability)}</strong>
        </div>
      ))}
      {rest > 0 && <small>y {rest} más</small>}
    </>
  );
}
