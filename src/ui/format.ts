export const dateFormat = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
});

/** Los escudos de ESPN vienen en 500 px; el combiner de ESPN los achica. */
export const smallLogo = (url: string) => {
  const path = /a\.espncdn\.com(\/i\/teamlogos\/.+\.png)$/.exec(url)?.[1];
  return path ? `https://a.espncdn.com/combiner/i?img=${path}&w=48&h=48` : url;
};

/** "29/10" */
export const shortDate = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
