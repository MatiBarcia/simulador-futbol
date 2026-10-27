# Simulador de Fútbol Argentino — Plan de trabajo

Sitio estilo promiedos / elnine que, además de mostrar tablas y fixture de la Liga Profesional,
permite **simular el futuro**: fijar resultados, simular el resto y responder preguntas como
"¿River todavía puede clasificar a la Libertadores?" y "¿con qué probabilidad?".

Alcance inicial: Liga Profesional (Primera División). Diseñado para sumar otras ligas y copas después.

---

## 1. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Fuente de datos | API no oficial de ESPN (gratis, sin key) | Única opción gratis con LPF completa, fixture futuro, historial y copas |
| Desacople | **Patrón adapter**: la app solo conoce nuestro modelo de dominio | ESPN puede cambiar sin aviso; poder cambiar a API-Football / Sportmonks / otra |
| Stack | React 19 + TypeScript + Vite (igual que UNLaM Organizer) | Stack conocido |
| Backend | **Serverless, sin servidor propio**: JSON estáticos para el histórico + proxy con caché para el vivo | Costo cero; los usuarios nunca le pegan a ESPN |
| En vivo | **Polling** (como promiedos) contra nuestro proxy, que tiene caché | Simple; SSE/WebSockets no aportan nada porque la fuente igual se consulta por polling |
| Simulación | En el navegador, dentro de un Web Worker | No requiere servidor; la UI no se congela |
| Hosting | **Cloudflare**: Pages (sitio) + Workers (proxy en vivo) + Cron Triggers (ingesta), plan gratis | Costo cero, todo en un lugar, cron más puntual que GitHub Actions |
| Servidor de casa | Solo para desarrollo / tareas pesadas puntuales, **no** para producción | No está siempre prendido, posible CGNAT, seguridad, upload limitado |
| Reglas de clasificación | **Se investigan después** (fase 5) | Primero los datos |

Descartadas por ahora: API interna de Promiedos (no documentada, posible violación de términos),
football-data.org (no tiene Argentina gratis), API-Football gratis (100 req/día; queda como adapter de respaldo).

---

## 2. Hallazgos sobre la API de ESPN (verificado el 26/10/2026)

Base: `https://site.api.espn.com/apis`

| Recurso | URL |
|---|---|
| Tabla | `/v2/sports/soccer/arg.1/standings` |
| Partidos de una temporada | `/site/v2/sports/soccer/arg.1/scoreboard?dates=2026&limit=1000` |
| Equipos | `/site/v2/sports/soccer/arg.1/teams` |

- Códigos de liga: `arg.1` (LPF), `arg.2` (Primera Nacional), `arg.copa` (Copa Argentina),
  `conmebol.libertadores`, `conmebol.sudamericana`.
- `dates` acepta **año** (`2026`), **mes** (`202611`) o **día** (`20261101`).
  Los rangos (`20261001-20261231`) devuelven `{"code":400,"message":"Failed to get events endpoint."}`.
- Usar `curl --compressed` (la respuesta viene comprimida con gzip).
- Standings: `children[]` = zonas ("Group A", "Group B", 15 equipos cada una). Cada `entries[]` tiene
  `team` y `stats[]` con `name`: `gamesPlayed, wins, ties, losses, pointsFor, pointsAgainst, pointDifferential, points, rank`.
- Scoreboard: `events[]` → `date`, `season.slug`, `status.type.name`, `competitions[0].competitors[]` (`team`, `score`, local/visitante).
  - `season.slug` vistos: `torneo-apertura`, `torneo-clausura`, `apertura---round-of-16`, `apertura---quarterfinals`, `apertura---semifinals`, `apertura---final`.
  - `status.type.name` vistos: `STATUS_SCHEDULED`, `STATUS_FULL_TIME`, `STATUS_FINAL_AET`, `STATUS_FINAL_PEN`, `STATUS_SECOND_HALF`
    (seguramente también hay otros: entretiempo, postergado, suspendido; mapearlos con un default seguro).
- Volumen: 2026 = 495 partidos (240 Apertura + 240 Clausura + 15 playoffs; 33 pendientes hasta el 08/11).
  2025 = 510, 2024 = 378, 2023 = 378. Libertadores 2026 = 155, Copa Argentina 2026 = 62.
- Equipos: 30, con escudos (`logos`).
- No trae tabla anual ni promedios: **se calculan con los resultados**.

---

## 3. Arquitectura

```
                ┌── Cron Trigger (cada X h) ──► data/*.json (histórico + fixture)
ESPN API ──► adapters/espn ──► modelo de dominio                      │
(otra API ►  adapters/xxx  ─┘)       │                                ▼
                                     └── Worker /live (caché ~20 s) ──► app React
                                                    ▲                  (polling cada ~30 s
                                                    └──────────────────  solo con partidos en juego)
                                     engine (Web Worker): tablas + Monte Carlo
```

El adapter se comparte entre la ingesta y el Worker en vivo (mismo código TS).

### Estructura de carpetas propuesta

```
simulador-futbol/
├─ src/
│  ├─ domain/        # tipos puros: Team, Match, Competition, Season, Stage, Standing
│  ├─ adapters/
│  │  ├─ DataProvider.ts   # interfaz
│  │  ├─ espn/             # implementación ESPN + mapeos
│  │  └─ teamIds.ts        # tabla de equivalencias id propio ↔ id de cada proveedor
│  ├─ engine/        # cálculo de tablas, desempates, simulación (sin React)
│  ├─ rules/         # reglas de clasificación por temporada (fase 5)
│  ├─ ui/            # componentes React
│  └─ workers/       # Web Worker de simulación
├─ scripts/
│  └─ ingest.ts      # baja datos con un adapter y escribe data/
├─ worker/           # Cloudflare Worker: /live (proxy + caché) y cron de ingesta
├─ data/             # JSON generados (temporadas, equipos)
└─ tests/fixtures/   # respuestas reales de ESPN guardadas para testear sin red
```

### Interfaz del adapter (borrador)

```ts
interface DataProvider {
  readonly id: string;                                   // 'espn', 'api-football', ...
  getTeams(competition: CompetitionId, season: number): Promise<Team[]>;
  getMatches(competition: CompetitionId, season: number): Promise<Match[]>;
  getStandings?(competition: CompetitionId, season: number): Promise<Standing[]>; // opcional, solo para validar
}
```

### Modelo de dominio (borrador)

```ts
type TeamId = string;            // id PROPIO y estable, ej. 'river-plate' (no el id de ESPN)
type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'suspended' | 'cancelled';

interface Team   { id: TeamId; name: string; shortName: string; logoUrl?: string }
interface Stage  { id: string; name: string; kind: 'league' | 'groups' | 'knockout'; groups?: Record<string, TeamId[]> }
interface Match  {
  id: string; competition: CompetitionId; season: number; stageId: string; round?: number;
  date: string; homeId: TeamId; awayId: TeamId; status: MatchStatus;
  homeGoals?: number; awayGoals?: number;
  penalties?: { home: number; away: number };
  source: { provider: string; externalId: string };
}
```

Regla clave: **nada fuera de `adapters/` conoce el formato de ESPN.**

---

## 4. Fases

### Fase 0: Setup  ⏱ ~1 sesión
- [x] `npm create vite@latest` (React + TS), oxlint (el template actual de Vite trae oxlint en vez de ESLint), Vitest.
- [x] Inicializar la estructura de carpetas de arriba.
- [x] Repo propio (`github.com/MatiBarcia/simulador-futbol`).

### Fase 1: Datos (adapter ESPN + ingesta)  ⏱ 2–3 sesiones
- [x] Definir tipos de `domain/`.
- [x] Guardar respuestas reales de ESPN en `tests/fixtures/espn/` (recortadas; se regeneran con `node scripts/save-fixtures.ts`).
- [x] Implementar `EspnProvider` (mapeo de estados, etapas, ids de equipos).
- [x] Tabla `teamIds.ts`: ESPN id → id propio (32 equipos de 2024–2026).
- [x] Tests del adapter contra los fixtures (sin red).
- [x] `npm run ingest`: baja 2024–2026 y escribe `public/data/lpf/<año>.json` + `index.json`.
  ESPN no da el número de fecha: se infiere (`engine/rounds.ts`); perfecto en 2025–2026, aproximado en la Liga 2024.
- [x] Validar el JSON generado con un schema (zod).

### Fase 2: Motor de tablas  ⏱ 1–2 sesiones
- [x] `computeStandings(matches, teams, tiebreak)`: puntos, PJ, PG, PE, PP, GF, GC, DG, últimos 5.
- [x] Desempates `zone` (art. 10, con mini-torneo recursivo) y `general` (art. 24). Falta fair play (no hay datos).
- [x] Tabla por zona, tabla anual, promedios (últimas 3 temporadas) y **promedios del año próximo** (`engine/league.ts`).
- [x] **Test de validación**: nuestra tabla del Clausura 2026 = tabla de ESPN, y los promedios = los publicados por La Nación.

### Fase 3: UI de consulta (estilo promiedos)  ⏱ 2–3 sesiones
- [x] Tabla por zonas con escudos, tabla anual, promedios.
- [x] **Promedios del año próximo** (pedido de los amigos): misma pestaña, con selector de año; muestra con qué promedio arranca cada equipo en N+1.
- [x] Fixture por fecha, con resultados y partidos pendientes.
- [x] Llave de playoffs (`engine/bracket.ts`): cruces reales y, si todavía no empezaron, proyectados desde la tabla de hoy.
- [x] Diseño responsive con modo oscuro (falta probarlo en un celular real).

### Fase 4: Simulador  ⏱ 3–4 sesiones
- [x] Modo manual: el usuario carga resultados de partidos pendientes y la tabla se recalcula en vivo (se guardan en `localStorage`).
- [x] Modelo de probabilidad por partido: **Poisson** con ataque/defensa por equipo, ventaja de local y corrección de Dixon-Coles
      (`engine/model.ts`). Calibrado con validación hacia adelante (`scripts/calibrate.ts`): log-loss 1,065 vs. 1,086 de la línea base,
      empates predichos 30% vs. 31% reales.
- [x] Monte Carlo en un Web Worker (`engine/simulate.ts`), por tandas: muestra un resultado con 5.000 simulaciones (~1,2 s) y lo afina
      hasta 200.000 (~45 s, error ±0,1 puntos; el tope es por memoria). Recorrer todas las combinaciones no es posible
      (3^31 ≈ 6×10^14 con 31 partidos; 1 fecha sola ya son 14 millones). Mientras recalcula, contenido borroso + indicador girando. → % de playoffs, campeón del torneo en curso
      (con la llave: alargue y penales), campeón de Liga, descenso (por promedio y por anual, con partido de desempate) y posición final.
- [x] Combinar ambos: resultados fijados por el usuario + el resto simulado.
- [x] Los empates que irían a fair play/sorteo se ordenan al azar en cada simulación.
- [x] Rediseño de la pestaña (pedido del usuario): 3 secciones — **¿Qué necesita mi equipo?**, **Probabilidades** (un objetivo a la vez, con barras)
      y **Jugá los partidos** (botones local/empate/visitante con la probabilidad del modelo).

### Fase 5: Reglas, títulos y clasificación  ⏱ 3–4 sesiones
- [x] Investigación inicial → **`docs/REGLAS-2026.md`** (7 títulos en 2026, 8 desde 2027 con la Recopa de Campeones).
- [x] Puntos ⚠️ resueltos con los reglamentos oficiales (LPF 2026 y Copa Argentina 2026; texto en `docs/fuentes/`).
- [x] Validar los promedios contra una tabla publicada (coinciden; ver sección 4 de `docs/REGLAS-2026.md`).
- [x] Simular Clausura (con playoffs), Campeón de Liga y Copa Argentina (penales directos, `engine/cups.ts`).
- [x] Finales de Libertadores y Sudamericana (dan plaza extra): 50/50, porque no hay datos para comparar con equipos de otros países.
- [x] Simular el Trofeo de Campeones 2026 (con el desempate entre subcampeones si el mismo club gana Apertura y Clausura)
      y la Supercopa Argentina 2026 (de ESPN, `arg.supercopa`).
- [x] Quién juega en 2027 la Supercopa Argentina, la Supercopa Internacional (con reemplazo de descendidos) y la
      Recopa de Campeones (con los subcampeones cuando se repite un club). Reglas en `engine/titles.ts`, con tests.
      La Supercopa Internacional 2026 (ya jugada) se carga a mano en `rules/lpf.ts` (`knownTitles`).
- [x] Pestaña **Copas**: árbol de títulos con la Recopa arriba (`engine/titleGraph.ts`), para la Recopa del año que viene y la siguiente.
      Cada título muestra su campeón, el partido si ya tiene rivales, o la chance de cada equipo (de la simulación de la nube).
      El Trofeo, las Supercopas y la Recopa ya no están en el Simulador: dependen de ganar otro título, así que se ven en el árbol.
      Títulos ya jugados que ESPN no trae (Trofeo 2025, Copa Argentina 2025, Supercopa Internacional 2026): `knownTitle` en `rules/lpf.ts`.
- [ ] Simular la Recopa misma (triangular con puntos 3/2/1/0): se juega en 2027, cuando haya fixture.
- [x] Modelar la cadena entre temporadas para 2026 → 2027 (Trofeo, Copa Argentina y Supercopas definen las copas nacionales de 2027).
- [x] Reglas como **configuración por temporada** en `rules/lpf.ts` (falta cargar las de 2027 cuando salga el reglamento).
- [x] Simular también los playoffs (eliminación directa, alargue y penales).
- [x] Reparto de cupos a Libertadores/Sudamericana 2027 con todas las reasignaciones del art. 27–28 (`engine/qualification.ts`, con tests).
- [x] Mostrar "% de clasificar a Libertadores / Sudamericana / descender".
- [ ] Cuadro real de la Copa Argentina: ESPN no trae el diagrama; si falta una ronda, los ganadores se cruzan en orden de fecha.

### Fase 6: "¿Todavía puede?" (cálculo exacto)  ⏱ 2+ sesiones
- [x] Versión por simulación (`engine/analysis.ts`): para un equipo y un objetivo, probabilidad, si depende de sí mismo,
      cómo cambia con cada resultado de sus partidos, qué otros resultados le convienen y un camino de resultados que lo logra.
- [ ] Responder de forma **exacta** si un equipo puede o no alcanzar un objetivo (no por probabilidad).
- [ ] Enfoque: problema de eliminación matemática → flujo máximo (*max-flow*) para "terminar entre los primeros k";
      para reglas combinadas, programación entera (ILP) con un solver en JS (ej. `javascript-lp-solver` o HiGHS en wasm).
- [x] Mostrar un escenario de ejemplo ("River clasifica si pasa esto"): sale de la simulación.

### Fase 7: Resultados en vivo  ⏱ 2 sesiones
- [ ] Verificar si ESPN permite CORS desde el navegador (sirve para el prototipo; igual usamos el proxy).
- [ ] Worker `GET /live?competition=arg.1`: llama al `scoreboard` de hoy vía adapter y devuelve nuestro modelo.
- [ ] Caché con la Cache API (~20 s en vivo, más largo sin partidos). **No usar KV para esto** (plan gratis: ~1.000 escrituras/día).
- [ ] Devolver un TTL / `Cache-Control` para que el cliente sepa cuándo volver a consultar (como promiedos).
- [ ] Cliente: polling solo si hay partidos en juego o por empezar; pausar con la pestaña oculta (Page Visibility API).
- [ ] Tabla "en vivo" (cómo quedaría si terminara así) y simulador partiendo del resultado parcial.

### Fase 8: Automatización y deploy  ⏱ 1 sesión
**Cambio de decisión (27/10/2026):** en vez de Cloudflare, **GitHub Actions + GitHub Pages con el repo público** (gratis, sin límite de minutos).
- [x] Workflow `.github/workflows/update.yml`, cada 5 minutos (GitHub no garantiza la puntualidad):
      ingesta → si los datos cambiaron respecto del sitio publicado (`contentHash` en `index.json`), simulación completa
      (`npm run precompute`: 200.000 simulaciones + análisis de los 30 equipos × 5 objetivos, ~2 min) → build → deploy a Pages.
      Si solo cambió el minuto de un partido en juego, reutiliza la simulación publicada.
- [x] Los datos generados **no se commitean**: van directo al sitio. `public/data/lpf/simulation.json` está en `.gitignore`.
- [x] El dispositivo **no simula nunca**: las probabilidades son siempre las de la nube (escenario real). Los resultados que elige el
      usuario solo cambian las tablas de "Jugá los partidos" (zonas, anual y promedios), que se calculan al instante.
- [ ] Hacer el repo público y activar Pages (Settings → Pages → Source: GitHub Actions). Lo hace el dueño del repo.
- [ ] Ojo: GitHub desactiva los workflows programados de un repo público tras 60 días sin actividad en el repo.
- [ ] (Opcional, con costo) dominio propio.

### Fase 9: Expansión (futuro)
- [ ] Primera Nacional (`arg.2`), Copa Argentina, Libertadores y Sudamericana.
- [ ] Segundo adapter (API-Football) como respaldo y para probar que el desacople funciona.
- [ ] Otras ligas.

---

## 5. Primer paso al volver a la PC

1. `npm install`, `npm run ingest` (actualiza los datos) y `npm run dev`.
2. Pedir: *"Seguimos con PLAN.md"*: falta la fase 5 (supercopas), la 6 exacta, la 7 (en vivo) y la 8 (deploy). Antes, `npm test` para confirmar que ESPN no cambió.
