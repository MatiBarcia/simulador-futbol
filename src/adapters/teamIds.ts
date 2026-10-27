import type { TeamId } from '../domain/types.ts';

export interface TeamInfo {
  id: TeamId;
  name: string;
  shortName: string;
  /** Id del equipo en cada proveedor. */
  providers: { espn?: string };
}

// Equipos que jugaron en Primera desde 2024. Al aparecer uno nuevo, el adapter avisa y hay que sumarlo acá.
export const TEAMS: TeamInfo[] = [
  { id: 'aldosivi', name: 'Aldosivi', shortName: 'Aldosivi', providers: { espn: '9739' } },
  { id: 'argentinos-juniors', name: 'Argentinos Juniors', shortName: 'Argentinos', providers: { espn: '3' } },
  { id: 'atletico-tucuman', name: 'Atlético Tucumán', shortName: 'Atl. Tucumán', providers: { espn: '9785' } },
  { id: 'banfield', name: 'Banfield', shortName: 'Banfield', providers: { espn: '235' } },
  { id: 'barracas-central', name: 'Barracas Central', shortName: 'Barracas C.', providers: { espn: '10060' } },
  { id: 'belgrano', name: 'Belgrano', shortName: 'Belgrano', providers: { espn: '4' } },
  { id: 'boca-juniors', name: 'Boca Juniors', shortName: 'Boca', providers: { espn: '5' } },
  { id: 'central-cordoba-sde', name: 'Central Córdoba (SdE)', shortName: 'Central Cba.', providers: { espn: '11989' } },
  { id: 'defensa-y-justicia', name: 'Defensa y Justicia', shortName: 'Defensa', providers: { espn: '8950' } },
  { id: 'deportivo-riestra', name: 'Deportivo Riestra', shortName: 'Riestra', providers: { espn: '17702' } },
  { id: 'estudiantes-lp', name: 'Estudiantes (LP)', shortName: 'Estudiantes', providers: { espn: '8' } },
  { id: 'estudiantes-rc', name: 'Estudiantes (Río Cuarto)', shortName: 'Est. Río IV', providers: { espn: '19685' } },
  { id: 'gimnasia-mendoza', name: 'Gimnasia (Mendoza)', shortName: 'Gimnasia (M)', providers: { espn: '11972' } },
  { id: 'gimnasia-lp', name: 'Gimnasia (LP)', shortName: 'Gimnasia', providers: { espn: '9' } },
  { id: 'godoy-cruz', name: 'Godoy Cruz', shortName: 'Godoy Cruz', providers: { espn: '6756' } },
  { id: 'huracan', name: 'Huracán', shortName: 'Huracán', providers: { espn: '10' } },
  { id: 'independiente', name: 'Independiente', shortName: 'Independiente', providers: { espn: '11' } },
  { id: 'independiente-rivadavia', name: 'Independiente Rivadavia', shortName: 'Ind. Rivadavia', providers: { espn: '9744' } },
  { id: 'instituto', name: 'Instituto', shortName: 'Instituto', providers: { espn: '2975' } },
  { id: 'lanus', name: 'Lanús', shortName: 'Lanús', providers: { espn: '12' } },
  { id: 'newells-old-boys', name: "Newell's Old Boys", shortName: "Newell's", providers: { espn: '14' } },
  { id: 'platense', name: 'Platense', shortName: 'Platense', providers: { espn: '7764' } },
  { id: 'racing-club', name: 'Racing Club', shortName: 'Racing', providers: { espn: '15' } },
  { id: 'river-plate', name: 'River Plate', shortName: 'River', providers: { espn: '16' } },
  { id: 'rosario-central', name: 'Rosario Central', shortName: 'Central', providers: { espn: '17' } },
  { id: 'san-lorenzo', name: 'San Lorenzo', shortName: 'San Lorenzo', providers: { espn: '18' } },
  { id: 'san-martin-sj', name: 'San Martín (San Juan)', shortName: 'San Martín SJ', providers: { espn: '7845' } },
  { id: 'sarmiento', name: 'Sarmiento (Junín)', shortName: 'Sarmiento', providers: { espn: '10158' } },
  { id: 'talleres', name: 'Talleres (Córdoba)', shortName: 'Talleres', providers: { espn: '19' } },
  { id: 'tigre', name: 'Tigre', shortName: 'Tigre', providers: { espn: '7767' } },
  { id: 'union', name: 'Unión (Santa Fe)', shortName: 'Unión', providers: { espn: '20' } },
  { id: 'velez-sarsfield', name: 'Vélez Sarsfield', shortName: 'Vélez', providers: { espn: '21' } },
];

const byEspnId = new Map(TEAMS.filter((t) => t.providers.espn).map((t) => [t.providers.espn!, t]));

export const teamByEspnId = (espnId: string): TeamInfo | undefined => byEspnId.get(espnId);

/** Id provisorio para un equipo que todavía no está en la tabla: 'Club Atlético X' → 'club-atletico-x'. */
export const slugify = (name: string): TeamId =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
