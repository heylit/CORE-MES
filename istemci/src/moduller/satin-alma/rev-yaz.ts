// 3712: revizyon her yerde "Rev B"; boşsa hiç yazılmaz.
export const revYaz = (rev: string | null | undefined): string => {
  const r = rev?.trim();
  return r ? `Rev ${r}` : '';
};
