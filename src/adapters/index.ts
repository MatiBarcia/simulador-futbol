// El proveedor de datos que usa la app. Cambiar de fuente (ESPN → otra API) es cambiar esta línea.
import type { DataProvider } from './DataProvider.ts';
import { EspnProvider } from './espn/EspnProvider.ts';

export const createProvider = (): DataProvider => new EspnProvider({ warn: () => {} });
