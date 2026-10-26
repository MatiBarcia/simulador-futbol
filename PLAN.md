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
- [ ] `npm create vite@latest` (React + TS), ESLint, Prettier, Vitest.
- [ ] Inicializar la estructura de carpetas de arriba.
- [ ] Decidir si `simulador-futbol` tiene su propio repo git (hoy está dentro del repo de `C:\VisualStudio`). **Recomendado: repo propio.**

### Fase 1: Datos (adapter ESPN + ingesta)  ⏱ 2–3 sesiones
- [ ] Definir tipos de `domain/`.
- [ ] Guardar respuestas reales de ESPN en `tests/fixtures/` (standings, scoreboard 2026, teams).
- [ ] Implementar `EspnProvider` (mapeo de estados, etapas, ids de equipos).
- [ ] Tabla `teamIds.ts`: ESPN id → id propio (30 equipos actuales + los que ascendieron o descendieron en 2023–2025).
- [ ] Tests del adapter contra los fixtures (sin red).
- [ ] `scripts/ingest.ts`: baja 2023–2026 de LPF y escribe `data/arg.1/2026.json`, etc.
- [ ] Validar el JSON generado con un schema (zod).

### Fase 2: Motor de tablas  ⏱ 1–2 sesiones
- [ ] `computeStandings(matches, teams, options)`: puntos, PJ, PG, PE, PP, GF, GC, DG.
- [ ] Criterios de desempate configurables (se completan en la fase 5).
- [ ] Tabla por zona, tabla anual, promedios (últimas 3 temporadas).
- [ ] **Test de validación**: nuestra tabla del Clausura 2026 = tabla de ESPN.

### Fase 3: UI de consulta (estilo promiedos)  ⏱ 2–3 sesiones
- [ ] Tabla por zonas con escudos, tabla anual, promedios.
- [ ] Fixture por fecha, con resultados y partidos pendientes.
- [ ] Diseño responsive, pensado primero para el celular.

### Fase 4: Simulador  ⏱ 3–4 sesiones
- [ ] Modo manual: el usuario carga resultados de partidos pendientes y la tabla se recalcula en vivo.
- [ ] Modelo de probabilidad por partido: empezar con **Elo** (simple) o **Poisson** con fuerza de ataque y defensa, calibrado con 2023–2025.
- [ ] Monte Carlo en un Web Worker: N = 10.000+ simulaciones del resto del torneo → % de cada posición final por equipo.
- [ ] Combinar ambos: resultados fijados por el usuario + el resto simulado.

### Fase 5: Reglas, títulos y clasificación  ⏱ 3–4 sesiones
- [x] Investigación inicial → **`docs/REGLAS-2026.md`** (7 títulos en 2026, 8 desde 2027 con la Recopa de Campeones).
- [x] Puntos ⚠️ resueltos con los reglamentos oficiales (LPF 2026 y Copa Argentina 2026; texto en `docs/fuentes/`).
- [ ] Cerrar los pocos puntos que quedan abiertos (sección 12 de `docs/REGLAS-2026.md`): validar los promedios contra una tabla publicada.
- [ ] Simular **cada título**: Clausura (con playoffs), Campeón de Liga, Trofeo de Campeones, Copa Argentina,
      Supercopa Argentina, Supercopa Internacional y Recopa de Campeones (triangular con puntos 3/2/1/0).
- [ ] Modelar la cadena entre temporadas (los títulos de N definen las supercopas de N+1 y la Recopa de N+2).
- [ ] Modelar las reglas como **configuración por temporada** en `rules/` (cambian casi todos los años).
- [ ] Simular también los playoffs (eliminación directa, penales).
- [ ] Mostrar "% de clasificar a Libertadores / Sudamericana / descender".

### Fase 6: "¿Todavía puede?" (cálculo exacto)  ⏱ 2+ sesiones
- [ ] Responder de forma **exacta** si un equipo puede o no alcanzar un objetivo (no por probabilidad).
- [ ] Enfoque: problema de eliminación matemática → flujo máximo (*max-flow*) para "terminar entre los primeros k";
      para reglas combinadas, programación entera (ILP) con un solver en JS (ej. `javascript-lp-solver` o HiGHS en wasm).
- [ ] Mostrar un escenario de ejemplo ("River clasifica si pasa esto").

### Fase 7: Resultados en vivo  ⏱ 2 sesiones
- [ ] Verificar si ESPN permite CORS desde el navegador (sirve para el prototipo; igual usamos el proxy).
- [ ] Worker `GET /live?competition=arg.1`: llama al `scoreboard` de hoy vía adapter y devuelve nuestro modelo.
- [ ] Caché con la Cache API (~20 s en vivo, más largo sin partidos). **No usar KV para esto** (plan gratis: ~1.000 escrituras/día).
- [ ] Devolver un TTL / `Cache-Control` para que el cliente sepa cuándo volver a consultar (como promiedos).
- [ ] Cliente: polling solo si hay partidos en juego o por empezar; pausar con la pestaña oculta (Page Visibility API).
- [ ] Tabla "en vivo" (cómo quedaría si terminara así) y simulador partiendo del resultado parcial.

### Fase 8: Automatización y deploy  ⏱ 1 sesión
- [ ] Cuenta gratis de Cloudflare; deploy del sitio en Pages (`*.pages.dev`) y del Worker con `wrangler`.
- [ ] Cron Trigger (ej. cada 2 h los días de partido, 1 vez por día el resto) que corre la ingesta.
- [ ] Decidir dónde se guardan los JSON generados: R2, o commit al repo + redeploy de Pages.
- [ ] Revisar los límites actuales del plan gratis de Cloudflare.
- [ ] (Opcional, con costo) dominio propio.

### Fase 9: Expansión (futuro)
- [ ] Primera Nacional (`arg.2`), Copa Argentina, Libertadores y Sudamericana.
- [ ] Segundo adapter (API-Football) como respaldo y para probar que el desacople funciona.
- [ ] Otras ligas.

---

## 5. Primer paso al volver a la PC

1. Abrir Claude Code en `C:\VisualStudio\simulador-futbol` y pedir: *"Seguimos con PLAN.md, fase 0 y 1"*.
2. Antes de programar el adapter, volver a bajar los fixtures de ESPN (comandos de la sección 2) y revisar que el formato no haya cambiado.
