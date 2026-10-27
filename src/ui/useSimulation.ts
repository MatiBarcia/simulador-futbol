import { useEffect, useState } from 'react';
import type { SeasonData } from '../domain/types.ts';
import { mergeResults, type FixedResults, type SimulationResult } from '../engine/simulate.ts';
import type { SimulationRequest } from '../workers/simulation.worker.ts';

/** Primera tanda: lo que se muestra rápido. */
export const BATCH_SIZE = 5_000;
/**
 * Tope en el dispositivo: 50.000 (error de ±0,4 puntos, ~12 s). La simulación completa (200.000) se hace en la nube;
 * acá solo se simula cuando el usuario elige resultados propios o si los datos son más nuevos que la simulación de la nube.
 */
export const DEVICE_MAX_ITERATIONS = 50_000;
/**
 * Cuándo se actualizan los números en pantalla. Analizar muchos escenarios tarda, así que no se hace en cada tanda
 * (la página se trabaría); la barra de progreso sí avanza siempre.
 */
const CHECKPOINTS = [5_000, 20_000, DEVICE_MAX_ITERATIONS];

export type SimulationState = {
  result?: SimulationResult;
  /** Todavía no hay ningún resultado para estos datos (la primera tanda está corriendo). */
  loading: boolean;
  /** Ya hay resultado, pero se siguen sumando simulaciones. */
  refining: boolean;
  /** Simulaciones hechas hasta ahora (puede ir por delante de `result.iterations`). */
  progress: number;
  error?: string;
};

/**
 * Corre la simulación en un Web Worker cada vez que cambian los resultados fijados (con un pequeño debounce).
 * Con `enabled` en false no hace nada (se usa la simulación de la nube).
 */
export function useSimulation(seasons: SeasonData[], cups: SeasonData[], season: number, fixed: FixedResults, enabled: boolean): SimulationState {
  // `for` dice para qué resultados fijados es el estado: si cambiaron, lo que hay es viejo y se está recalculando.
  const [state, setState] = useState<SimulationState & { for?: FixedResults }>({ loading: true, refining: false, progress: 0 });
  useEffect(() => {
    if (!enabled) return;
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      let acc: SimulationResult | undefined;
      worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<SimulationResult>) => {
        acc = acc ? mergeResults(acc, e.data) : e.data;
        const finished = acc.iterations >= DEVICE_MAX_ITERATIONS;
        const shown = acc;
        if (CHECKPOINTS.includes(acc.iterations) || finished) {
          setState({ result: shown, loading: false, refining: !finished, progress: shown.iterations, for: fixed });
        } else {
          setState((s) => ({ ...s, progress: shown.iterations }));
        }
        if (finished) worker?.terminate();
      };
      worker.onerror = (e) => setState((s) => ({ ...s, loading: false, refining: false, error: e.message, for: fixed }));
      const request: SimulationRequest = { seasons, cups, season, fixed, batchSize: BATCH_SIZE, maxIterations: DEVICE_MAX_ITERATIONS };
      worker.postMessage(request);
    }, 300);
    return () => {
      clearTimeout(timer);
      worker?.terminate(); // si cambian los resultados a mitad de camino, se descarta la corrida anterior
    };
  }, [seasons, cups, season, fixed, enabled]);
  const stale = state.for !== fixed;
  return { result: state.result, error: state.error, loading: stale || state.loading, refining: !stale && state.refining, progress: stale ? 0 : state.progress };
}
