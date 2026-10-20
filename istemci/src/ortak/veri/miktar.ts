// Kullanıcının yazdığı miktar sunucuya noktalı ondalıkla gider: "12,5" ve "12.5" "12.5" olur; virgül varsa noktalar binliktir ("1.250,5").
// Virgülsüz "1.250" binlik de üç ondalık da okunur ve sunucu ikisini ayıramaz (kullanıcı kararı, soru 71): işaretlenir, komut gitmeden durur.
// Fiyat girişi bu ayrıştırıcıdan geçmez.
const BELIRSIZ = /^-?\d+\.\d{3}$/;
const BELIRSIZ_IMI = '?';
export const BELIRSIZ_MIKTAR = 'Miktardaki nokta binlik mi ondalık mı belli değil. Bin iki yüz elli için 1250, bir virgül yirmi beş için 1,25 yazın.';
export class BelirsizMiktarHatasi extends Error {
  constructor() { super(BELIRSIZ_MIKTAR); }
}
export function miktarGirdisi(v: string): string {
  const t = v.trim();
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  return BELIRSIZ.test(t) ? `${BELIRSIZ_IMI}${t}` : t;
}
// Gövdenin herhangi bir yerinde işaretli miktar varsa komut gönderilmez.
export function belirsizMiktarVar(govde: unknown): boolean {
  if (typeof govde === 'string') return govde.startsWith(BELIRSIZ_IMI) && BELIRSIZ.test(govde.slice(BELIRSIZ_IMI.length));
  if (Array.isArray(govde)) return govde.some(belirsizMiktarVar);
  return govde !== null && typeof govde === 'object' && Object.values(govde).some(belirsizMiktarVar);
}
