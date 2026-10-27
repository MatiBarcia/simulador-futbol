# Fútbol argentino: reglas de la temporada 2026 (y lo que ya se sabe de 2027–2028)

Actualizado el 26/10/2026 con los **reglamentos oficiales**:
- Reglamento de Torneos LPF Primera División 2026 → texto en `docs/fuentes/reglamento-lpf-primera-2026.txt`
  ([PDF](https://www.ligaprofesional.ar/wp-content/uploads/2026/01/Reglamento-Torneos-LPF-Primera-2026-1.pdf))
- Reglamento de la Copa Argentina 2026, AFA Boletín Especial N° 6811 → texto en `docs/fuentes/reglamento-copa-argentina-2026.txt`
  ([PDF](https://assets1.afa.com.ar/2025/Boletin-Especial-6811---Reglamento-de-la-Copa-Argentina-2026.pdf))

Las citas "art. X" son del reglamento LPF salvo que diga otra cosa. ⚠️ = interpretación propia o dato no oficial.

**Idea central para el simulador:** las reglas cambian casi todos los años y los títulos de una temporada definen
quién juega las copas de la siguiente. Todo esto va como **configuración por temporada**
(`rules/2026.ts`, `rules/2027.ts`), nunca hardcodeado en el motor.

---

## 1. Títulos que se entregan

| # | Título | Quién lo juega | Formato | Estado 2026 |
|---|---|---|---|---|
| 1 | **Torneo Apertura** | 30 equipos de la LPF | Fase de zonas + playoffs | ✅ Belgrano (3-2 a River, 24/05) |
| 2 | **Torneo Clausura** | 30 equipos de la LPF | Fase de zonas + playoffs | ⏳ Fase de zonas hasta el 08/11; final el 12/12 en La Plata |
| 3 | **Campeón de Liga** | 1° de la Tabla General | Sin partido (art. 24.2) | ⏳ |
| 4 | **Trofeo de Campeones** | Campeón Apertura vs. campeón Clausura | Partido único, neutral, 19/12 (art. 20–23) | ⏳ Belgrano vs. campeón del Clausura, Estadio Kempes |
| 5 | **Copa Argentina** | 64 equipos de 5 categorías | Eliminación directa, partido único | ⏳ Quedan 2 partidos |
| 6 | **Supercopa Argentina** | Ganador del Trofeo de Campeones (N-1) vs. campeón de la Copa Argentina (N-1) | Partido único, neutral (art. 29) | ⏳ 2026: Estudiantes vs. Ind. Rivadavia, 12/11 en Córdoba ⚠️ (la fecha cambió varias veces) |
| 7 | **Supercopa Internacional** | Ganador del Trofeo de Campeones (N-1) vs. Campeón de Liga (N-1) | Partido único, neutral y en el exterior (art. 30) | ✅ Rosario Central (3-1 a Estudiantes, 26/09) |
| 8 | **Recopa de Campeones** | Campeones de Copa Argentina, Supercopa Argentina y Supercopa Internacional (N-1) | Triangular (art. 31) | 🆕 **Desde 2027** |

En 2026 son 7 títulos. Desde 2027 son 8.

**Ojo con los nombres de las ediciones:** el reglamento 2026 llama "Supercopa Argentina 2027" y "Supercopa Internacional 2027"
a las que se juegan con los campeones de 2026. Pero la Recopa 2027 se juega con los ganadores de las Supercopas "2026",
que son las que se están jugando este año (Estudiantes/Ind. Rivadavia y Rosario Central).

Títulos internacionales que también puede ganar un equipo de Primera (fuera de la AFA, para más adelante):
Copa Libertadores, Copa Sudamericana, Recopa Sudamericana e Intercontinental / Mundial de Clubes.

### Cadena de clasificación entre temporadas

```
Temporada N:   Apertura ─┐
               Clausura ─┴─► Trofeo de Campeones N ──┬──► Supercopa Argentina (N+1) ◄── Copa Argentina N
               Tabla General ─► Campeón de Liga N ───┴──► Supercopa Internacional (N+1)
Temporada N+1: Copa Argentina N+1 + Supercopa Argentina N+1 + Supercopa Internacional N+1 ─► Recopa de Campeones N+2
```

---

## 2. Torneos Apertura y Clausura (art. 8–10 y 14–16)

**Fase de zonas**
- 2 zonas (A y B) de 15 equipos, a una rueda, todos contra todos.
- Como cada zona tiene un número impar de equipos, en cada fecha un equipo de cada zona queda libre, y esos dos juegan entre sí
  un **"clásico" o interzonal**. Además hay **una fecha completa de interzonales**. Total: **16 fechas**.
- El Clausura tiene el **mismo fixture que el Apertura con las localías invertidas** (art. 14.1.1).
- Puntos 3 / 1 / 0 (art. 9).
- **Desempate en la zona (art. 10 / 16):**
  1. Diferencia de gol.
  2. Goles a favor.
  3. Puntos en los partidos entre los empatados; después diferencia de gol y goles a favor entre ellos. Se repite cuantas veces haga falta
     (es un mini-torneo recursivo).
  4. Tabla General de Fair Play 2026 (al cierre de la fase de zonas).
  5. Sorteo.
- **Regla especial del Clausura (art. 14.1.2):** un club que esté **en zona de descenso o que deba jugar un desempate por el descenso
  no juega los playoffs**, aunque haya terminado entre los 8 primeros. Su lugar lo toma el siguiente de su zona.
  No pasa lo mismo en el Apertura.

**Playoffs (cuadro fijo, todo a partido único)**

| Octavos | Cuartos | Semis |
|---|---|---|
| P1: 1°A – 8°B | C1: G1 – G8 | S1: GC1 – GC4 |
| P2: 1°B – 8°A | C2: G2 – G7 | S2: GC2 – GC3 |
| P3: 2°A – 7°B | C3: G3 – G6 | Final: GS1 – GS2 |
| P4: 2°B – 7°A | C4: G4 – G5 | |
| P5: 3°A – 6°B | | |
| P6: 3°B – 6°A | | |
| P7: 4°A – 5°B | | |
| P8: 4°B – 5°A | | |

- Octavos, cuartos y semis se juegan en el **estadio del mejor ubicado en la fase de zonas**.
  La final es en un estadio que designa la LPF. La localía de la final es solo organizativa y le corresponde al de mejor posición en su zona.
- Empate en los 90' → **alargue de 30'** → penales. Esto vale en todas las rondas.
- Comparar equipos de zonas distintas: gana el de mejor posición en su zona (1° > 2° > ...). Si ocupan la misma posición, art. 10 a), b), d), e):
  diferencia de gol, goles a favor, fair play, sorteo.
  ⚠️ El texto no menciona los puntos para este caso. Interpretación razonable: comparar primero puntos y después seguir con el art. 10.
  Para la simulación solo cambia la localía, no quién juega contra quién.

---

## 3. Tabla General de Posiciones y Campeón de Liga (art. 24–25)

- Suma los puntos de la **fase de zonas** del Apertura y el Clausura (32 partidos). Los playoffs no cuentan.
- El 1° es **Campeón de Liga 2026** (título nacional).
- **Desempate (excepto en posiciones de descenso):** diferencia de gol → goles a favor → Fair Play → sorteo.
  A diferencia de las zonas, acá **no** se usa el resultado entre los empatados.
- **Desempate en posiciones de descenso:** partido(s) de desempate (art. 24.4, art. 111 del Reglamento General de la AFA).
- **Tabla de Fair Play (art. 25):** cada equipo arranca con 1000 puntos y se le descuenta 1 por amarilla, 3 más por roja por doble amarilla
  (4 en total, contando la primera amarilla) y 5 por roja directa. Si hay empate, gana el que tenga menos rojas.
  ESPN probablemente no da tarjetas por partido ⚠️: en la simulación, el fair play se reemplaza por un sorteo.

---

## 4. Descensos (art. 26 + art. 93 del Estatuto de la AFA)

- Bajan **2 equipos**:
  1. El **último en la tabla de promedios**: puntos ÷ partidos de las últimas 3 temporadas (2024, 2025, 2026), contando solo la fase regular.
  2. El **último de la Tabla General 2026**, sin contar al que ya descendió por promedio. Es decir, si el último de las dos tablas es el
     mismo club, desciende también el penúltimo de la Tabla General.
- **Empate en puntos en posición de descenso**, en cualquiera de las dos tablas: **partido de desempate** (art. 26.2).
  En el promedio, "empate" significa igual promedio ⚠️ (con cuántos decimales se compara: a confirmar).
- Los ascendidos cuentan solo sus temporadas en Primera (práctica histórica ⚠️; no encontré el texto completo del art. 93).
- Ascienden 2 de la Primera Nacional, así que siguen siendo 30 equipos.
- ✅ **Qué partidos de 2024 cuentan:** la fase regular de la Copa de la Liga 2024 (en ESPN: `arg.copa_lpf`) **y** la Liga 2024 (`arg.1`).
- ✅ **Se trunca a 3 decimales, no se redondea** (Newell's 100/91 = 1,0989 se publica 1.098).
  Validado el 26/10/2026: con los datos de ESPN hasta la fecha 2 del Clausura, nuestros promedios coinciden exactamente con los
  publicados por [La Nación](https://www.lanacion.com.ar/deportes/futbol/tabla-de-promedios-2026-asi-estan-las-posiciones-que-definen-un-descenso-en-la-fecha-2-del-clausura-nid31072026/)
  (test en `tests/engine.test.ts`). Los recién ascendidos promedian solo lo jugado en Primera (Est. Río Cuarto: 8 pts / 18 PJ = 0.444).

---

## 5. Clasificación a copas internacionales 2027 (art. 27–28)

**Copa Libertadores 2027: 6 cupos**

| Cupo | Cómo se gana | Fase de entrada |
|---|---|---|
| Argentina 1 | Campeón del Apertura 2026 (Belgrano ✅) | Grupos |
| Argentina 2 | Campeón del Clausura 2026 | Grupos |
| Argentina 3 | Campeón de la Copa Argentina 2026. El cupo **siempre** es de la Copa Argentina | Grupos |
| Argentina 4 | 1° de la Tabla General entre los no clasificados | Grupos |
| Argentina 5 | 2° de la Tabla General entre los no clasificados | Grupos |
| Argentina 6 | 3° de la Tabla General entre los no clasificados | **Fase 2 (repechaje)** |

La fase de entrada de cada cupo sale de Wikipedia y de la prensa ⚠️, porque lo define la CONMEBOL y no la AFA.

**Copa Sudamericana 2027: 6 cupos**
- Los 6 siguientes de la Tabla General que no clasificaron a la Libertadores por ninguna vía (art. 28.1).
- En la Sudamericana 2026 los 6 argentinos entraron directo a la **fase de grupos** ⚠️ (la fase preliminar es para los otros países).

**Reasignaciones (hay que implementarlas como un algoritmo que llena cupos en orden):**
- **El mismo club gana Apertura y Clausura (27.7):** se queda con Argentina 1. Argentina 2 pasa al siguiente de la Tabla General
  y se reacomodan todos los cupos, incluidos los de la Sudamericana.
- **El campeón de la Copa Argentina ya tiene Argentina 1 o 2 (27.8):** se queda con su cupo, y Argentina 3 pasa al
  **siguiente equipo de Primera mejor ubicado en la Copa Argentina**, y así sucesivamente.
  - **27.8.1:** "mejor ubicado" significa que llegó más lejos (eliminado en una ronda posterior). Si quedaron eliminados en la misma ronda,
    decide la Tabla General. **No cuentan goles ni puntos.**
- **Campeón argentino de la Libertadores 2026 o de la Sudamericana 2026 (27.9 / 27.10):** gana una **plaza adicional** a la Libertadores 2027.
  Si ya tenía un cupo por otra vía, su cupo pasa al siguiente de la Tabla General. Si su cupo era el de la Copa Argentina, pasa al siguiente en la Copa Argentina.
- **Descendidos (28.2):** no pueden jugar copas internacionales.
  - Si el campeón del Apertura o del Clausura desciende, su cupo pasa al siguiente de la Tabla General.
  - Si el campeón de la Copa Argentina desciende o es del ascenso, su cupo pasa al siguiente equipo de **Primera** en la Copa Argentina.
- Las Libertadores y Sudamericanas 2026 todavía se están jugando: el simulador debe contemplar los "cupos extra".

### Cambio aprobado para las copas **2028** (temporada 2027)
- El cupo de repechaje de la Libertadores pasa del 3° de la Tabla General al **último equipo que entra a copas (el 9°)**.
  La Sudamericana queda para los mejores entre el 3° y el 8° que no entraron directo a la Libertadores.
- Va en el reglamento 2027 y **se aplica a las copas 2028**. Algunos medios lo informaron mal como "2027".

---

## 6. Copa Argentina 2026 (Boletín 6811)

- **64 equipos en la fase final:** los 30 de la LPF 2025, 24 de la fase preliminar metropolitana (15 de la Primera Nacional, 5 de la B Metropolitana
  y 4 de la C) y 10 del Torneo Federal A.
- **Cuadro fijo:** se sortean los 32vos. Los 30 de la LPF 2025 y los 2 ascendidos de la Primera Nacional 2025 ocupan los lugares 1 a 32 de la grilla,
  y se les sortean los otros 32 equipos. A partir de 16vos, los cruces siguen el diagrama de ese sorteo, **no hay nuevos sorteos**.
- **Todo a partido único en un estadio designado por la AFA** (neutral en la práctica).
- Empate en los 90' → **penales directos, sin alargue, en todas las rondas, incluida la final** (art. 8).
- El que figura primero en el diagrama elige vestuario y camiseta. No hay ventaja deportiva.
- Da: Libertadores 2027 (Argentina 3), Supercopa Argentina y Recopa de Campeones.
- Para el simulador alcanza con tomar el cuadro actual (quedan semis y/o final) y simular hacia adelante.

---

## 7. Trofeo de Campeones 2026 (art. 20–23)

- Final única en cancha neutral el **19/12**: campeón del Apertura vs. campeón del Clausura.
- **Si el mismo club gana los dos torneos:** el otro finalista sale de un **partido de desempate entre el subcampeón del Apertura y el subcampeón
  del Clausura** (16/12). Si el mismo club fue subcampeón de los dos, va directo a la final.
- La localía organizativa es del mejor ubicado en la Tabla General.
- Empate → alargue de 30' → penales (en el desempate y en la final).

## 8. Supercopa Argentina (art. 29)

- Final única en cancha neutral: ganador del Trofeo de Campeones vs. campeón de la Copa Argentina.
- **Si son el mismo club**, la juega el **subcampeón del Trofeo de Campeones**.
- Empate → alargue de 30' → penales. La AFA fija la fecha y la sede.

## 9. Supercopa Internacional (art. 30)

- Final única en **estadio neutral en el exterior**: ganador del Trofeo de Campeones vs. Campeón de Liga.
- **Si son el mismo club**, la juega el **2° de la Tabla General**.
- **Si alguno de los dos desciende**, lo reemplaza el siguiente de Primera mejor ubicado en la Tabla General (art. 30.5).
- Empate → alargue de 30' → penales. La localía organizativa es del ganador del Trofeo de Campeones.

## 10. Recopa de Campeones (art. 31, desde 2027)

- **Participantes** (con los títulos de 2026):
  - a. ganador de la Copa Argentina;
  - b. ganador de la Supercopa Argentina. Si es el mismo que a., entra el subcampeón de la Supercopa Argentina;
  - c. ganador de la Supercopa Internacional. Si repite con a. o b., entra el subcampeón de la Supercopa Internacional;
  - d. si después de eso sigue repitiéndose algún equipo, entra el subcampeón de la Copa Argentina.
  - Ejemplo real para 2027: la Supercopa Internacional 2026 la ganó Rosario Central, y la Supercopa Argentina 2026 (Estudiantes vs. Ind. Rivadavia)
    y la Copa Argentina 2026 todavía están en juego.
- **Triangular** en estadios que designa la AFA:
  1. Ganador Supercopa Argentina vs. ganador Supercopa Internacional.
  2. Ganador Copa Argentina vs. **perdedor** del partido 1.
  3. Ganador Copa Argentina vs. **ganador** del partido 1.
- **Empate en los 90' → penales directos** (sin alargue), así que siempre hay ganador y perdedor del partido 1.
- **Puntos:** 3 por ganar en los 90', 2 por ganar por penales, 1 por perder por penales, 0 por perder en los 90'.
- **Desempate** (con goles en los 90' de sus 2 partidos): diferencia de gol → goles a favor → **menos** goles en contra → fair play
  (cada equipo arranca con 30 puntos; se resta 1 por amarilla, 2 por roja, 1,5 por amonestación al cuerpo técnico y 3 por expulsión del cuerpo técnico).
  ⚠️ Si persiste el empate, el reglamento no dice nada más. Para la simulación: sorteo.

---

## 11. Resumen de reglas de empate por competencia (para el motor)

| Competencia | Empate en los 90' |
|---|---|
| Fase de zonas (Apertura/Clausura) | Queda empate (1 punto cada uno) |
| Playoffs Apertura/Clausura | Alargue → penales |
| Trofeo de Campeones (y su desempate) | Alargue → penales |
| Supercopa Argentina / Internacional | Alargue → penales |
| Copa Argentina | **Penales directos** |
| Recopa de Campeones | **Penales directos** + puntos 3/2/1/0 |
| Desempate por el descenso | Art. 111 del Reglamento General de la AFA (⚠️ no leído; se asume alargue y penales) |

El modelo de partido tiene que poder simular: resultado en los 90', alargue (si corresponde) y penales (≈ 50/50, quizás con un leve sesgo).

---

## 12. Lo que todavía queda abierto ⚠️

1. ~~Partidos computables de 2024 y redondeo de los promedios~~ → resuelto empíricamente (sección 4). Queda leer el art. 93 para el caso de
   empate exacto en el último puesto.
2. Si ESPN trae tarjetas por partido (para el fair play). Si no, usar sorteo en la simulación.
3. Las fases de entrada de la CONMEBOL 2027 (pueden cambiar con el reglamento de la CONMEBOL 2027).
4. La fecha definitiva de la Supercopa Argentina 2026 (cambió varias veces).

## Fuentes
- Oficiales: [Reglamento LPF Primera 2026](https://www.ligaprofesional.ar/wp-content/uploads/2026/01/Reglamento-Torneos-LPF-Primera-2026-1.pdf) ·
  [Reglamento Copa Argentina 2026 (Boletín 6811)](https://assets1.afa.com.ar/2025/Boletin-Especial-6811---Reglamento-de-la-Copa-Argentina-2026.pdf) ·
  [LPF: final de la Supercopa Internacional 2026](https://www.ligaprofesional.ar/notas/supercopa-internacional/2026/09/26/hoy-se-juega-la-final-de-la-supercopa-internacional/)
- Cambio de cupos 2028: [Infobae, comunicado LPF](https://www.infobae.com/deportes/2026/03/05/el-cambio-de-reglamentacion-para-clasificar-a-la-copa-libertadores-y-la-sudamericana-el-comunicado-de-la-liga-profesional/) ·
  [El Litoral](https://www.ellitoral.com/deportes/liga-profesional-copas-conmebol-clasificacion-2027-libertadores-sudamericana-repechaje-tablaanual_0_EmrbZJc7ZA.html)
- Promedios: [Contragolpe](https://contragolpe.com.ar/nota/como-se-define-el-descenso-en-el-futbol-argentino-las-dos-tablas-que-bajan-a-dos-equipos) ·
  [ESPN, tabla del descenso](https://www.espn.com.ar/futbol/argentina/nota/_/id/12190419/tabla-descenso-primera-division-futbol-argentino-liga-profesional-afa) ·
  [PromediosInfo](https://promediosinfo.com/simulador-promedios-liga-argentina)
- Supercopa Argentina 2026: [Cadena 3](https://www.cadena3.com/noticia/deportes/la-supercopa-argentina-2026-se-jugara-el-12-de-noviembre-entre-estudiantes-e-independiente-rivadavia_604239)
- CONMEBOL: [Wikipedia, Libertadores 2027](https://en.wikipedia.org/wiki/2027_Copa_Libertadores) · [Wikipedia, Sudamericana 2026](https://en.wikipedia.org/wiki/2026_Copa_Sudamericana)
- Contexto: [Infobae, los 7 títulos de 2026](https://www.infobae.com/deportes/2026/01/22/la-afa-oficializo-los-7-titulos-que-entregara-el-futbol-argentino-esta-temporada-la-copa-que-fue-postergada-hasta-el-2027/) ·
  [El Gráfico, guía del reglamento 2026](https://www.elgrafico.com.ar/articulo/primera-division/99695/guia-para-entender-el-reglamento-de-la-temporada-2026)
