import { z } from 'zod';
import type { SeasonData } from './types.ts';

const teamId = z.string().regex(/^[a-z0-9-]+$/);

export const seasonDataSchema = z.object({
  competition: z.literal('lpf'),
  season: z.number().int(),
  provider: z.string(),
  generatedAt: z.iso.datetime(),
  teams: z.array(
    z.object({ id: teamId, name: z.string(), shortName: z.string(), logoUrl: z.url().optional() }),
  ),
  tournaments: z.array(
    z.object({ id: z.string(), name: z.string(), groups: z.record(z.string(), z.array(teamId)).optional() }),
  ),
  matches: z.array(
    z.object({
      id: z.string(),
      tournamentId: z.string(),
      phase: z.enum(['regular', 'round-of-16', 'quarterfinals', 'semifinals', 'final']),
      round: z.number().int().positive().optional(),
      date: z.string(),
      homeId: teamId,
      awayId: teamId,
      status: z.enum(['scheduled', 'live', 'finished', 'postponed', 'suspended', 'cancelled']),
      homeGoals: z.number().int().nonnegative().optional(),
      awayGoals: z.number().int().nonnegative().optional(),
      penalties: z.object({ home: z.number().int(), away: z.number().int() }).optional(),
      clock: z.string().optional(),
      source: z.object({ provider: z.string(), externalId: z.string() }),
    }),
  ),
}) satisfies z.ZodType<SeasonData>;

export const parseSeasonData = (json: unknown): SeasonData => seasonDataSchema.parse(json);
