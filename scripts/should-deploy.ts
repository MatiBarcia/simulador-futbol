// Decide si hay que publicar: compara la huella de los datos recién bajados con la del sitio publicado.
// Uso (en GitHub Actions): node scripts/should-deploy.ts <url del sitio>   → escribe deploy=true|false en $GITHUB_OUTPUT
import { appendFile, readFile } from 'node:fs/promises';

const site = process.argv[2];
const current = JSON.parse(await readFile(new URL('../public/data/lpf/index.json', import.meta.url), 'utf8')) as { contentHash: string };
let published: string | undefined;
try {
  const res = await fetch(`${site}/data/lpf/index.json`, { cache: 'no-store' });
  if (res.ok) published = ((await res.json()) as { contentHash?: string }).contentHash;
} catch {
  // el sitio todavía no existe: hay que publicar
}

const deploy = published !== current.contentHash;
console.log(deploy ? `Datos nuevos (${published ?? 'sin publicar'} → ${current.contentHash}): se publica.` : 'Sin cambios en los datos: no se publica.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
