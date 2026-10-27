// Corre el Monte Carlo fuera del hilo principal para que la página no se congele.
// Simula por tandas y manda cada tanda apenas termina: la página muestra un primer resultado rápido y lo va afinando.
import { createSimulation, type SimulationInput } from '../engine/simulate.ts';

export interface SimulationRequest extends Omit<SimulationInput, 'iterations'> {
  batchSize: number;
  maxIterations: number;
}

self.onmessage = (e: MessageEvent<SimulationRequest>) => {
  const { batchSize, maxIterations, ...input } = e.data;
  const simulation = createSimulation(input);
  let done = 0;
  const next = () => {
    const result = simulation.run(Math.min(batchSize, maxIterations - done));
    done += result.iterations;
    self.postMessage(result);
    // setTimeout deja que el worker reciba un terminate() entre tandas.
    if (done < maxIterations) setTimeout(next, 0);
  };
  next();
};
