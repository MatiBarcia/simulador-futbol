import type { Team } from '../domain/types.ts';

/** Los escudos de ESPN vienen en 500 px; el combiner de ESPN los achica. */
const smallLogo = (url: string) => {
  const path = /a\.espncdn\.com(\/i\/teamlogos\/.+\.png)$/.exec(url)?.[1];
  return path ? `https://a.espncdn.com/combiner/i?img=${path}&w=48&h=48` : url;
};

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
