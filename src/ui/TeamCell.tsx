import type { Team } from '../domain/types.ts';
import { smallLogo } from './format.ts';

export function TeamCell({ team, tag }: { team: Team | undefined; tag?: string }) {
  if (!team) return <span className="team">?</span>;
  return (
    <span className="team">
      {team.logoUrl ? <img src={smallLogo(team.logoUrl)} alt="" width={20} height={20} loading="lazy" /> : <span className="logo-placeholder" />}
      <span className="team-name" title={team.name}>
        {team.shortName}
      </span>
      {tag && <span className="tag">{tag}</span>}
    </span>
  );
}
