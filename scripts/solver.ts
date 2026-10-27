// Solver de programación entera para engine/exact.ts: HiGHS compilado a wasm. Solo se usa en la nube y en los tests.
import highsModule from 'highs';
import type { FeasibilitySolver } from '../src/engine/exact.ts';

// El paquete es CommonJS: al importarlo desde Node, el default ya es la función que lo carga.
const loadHighs = highsModule as unknown as typeof highsModule.default;

export async function createSolver(): Promise<FeasibilitySolver> {
  const highs = await loadHighs();
  return (lp) => {
    const r = highs.solve(lp);
    if (r.Status !== 'Optimal' && r.Status !== 'Infeasible') throw new Error(`HiGHS: ${r.Status}`);
    return r.Status === 'Optimal';
  };
}
