# Cron externo: que el sitio se actualice cada 5 minutos

El `schedule` de GitHub Actions no es confiable: con `*/5` llega a correr cada varias horas. Por eso un servicio externo
(gratis) dispara el workflow a mano (`workflow_dispatch`) cada 5 minutos. Esas corridas se comportan como las programadas:
bajan los datos y solo recalculan y publican si algo cambió (una corrida sin cambios tarda ~30 s).

Además, la página consulta a ESPN los resultados del día mientras hay partidos en juego (`src/ui/useLeagueData.ts`), así que
tablas y fixture están al día aunque la publicación se atrase. Lo único que espera al workflow es la simulación.

## 1. Token de GitHub (solo puede disparar este workflow)

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nombre: `cron simulador-futbol`. Vencimiento: el más largo que permita (anotá la fecha: cuando vence, el cron deja de andar).
3. **Repository access → Only select repositories →** `MatiBarcia/simulador-futbol`.
4. **Permissions → Repository permissions → Actions: Read and write**. Nada más.
5. Generar y copiar el token (empieza con `github_pat_`). No se vuelve a mostrar.

## 2. cron-job.org

1. Crear una cuenta en https://cron-job.org (gratis).
2. **Create cronjob**:
   - **URL:** `https://api.github.com/repos/MatiBarcia/simulador-futbol/actions/workflows/update.yml/dispatches`
   - **Execution schedule:** every 5 minutes.
3. Pestaña **Advanced**:
   - **Request method:** `POST`
   - **Headers:**
     - `Accept: application/vnd.github+json`
     - `Authorization: Bearer <el token>`
     - `X-GitHub-Api-Version: 2022-11-28`
     - `Content-Type: application/json`
   - **Request body:** `{"ref":"main"}`
4. Guardar y usar **Test run**: tiene que responder **204**. En GitHub → Actions aparece una corrida "workflow_dispatch".
5. (Recomendado) Activar el aviso por mail si falla: así te enterás cuando venza el token.

## Publicar a mano

GitHub → Actions → "Actualizar y publicar" → **Run workflow**, con **force** marcado si querés publicar aunque no haya cambios
(también corre los tests). Desde la terminal: `gh workflow run update.yml -f force=true`.
