import type { KokpitModeli } from './kurallar.ts';

// 3664: Uygula'ya basılınca işin yeri sunucu cevabını beklemeden çizilir. Yer, sunucunun taşıma önizlemesinin verdiği yerdir (komut
// aynı hesabı yazar); sunucu planı dizip cevap verince katman kalkar ve ekran sunucunun sonucunu gösterir (plan yerleştirmede sunucu esastır).
export interface IyimserYer { tezgah: string; S: number; C: number }
export type IyimserKatman = Readonly<Record<string, IyimserYer>>;

export function iyimserKatman(isler: readonly { isId: string; tezgah: string; S: number; C: number }[]): IyimserKatman | null {
  if (isler.length === 0) return null;
  return Object.fromEntries(isler.map((x) => [x.isId, { tezgah: x.tezgah, S: x.S, C: x.C }]));
}

// Modelde olmayan iş (yerleşmemiş adım) katmanda olsa bile eklenmez: yeri sunucu cevabıyla çizilir.
export function iyimserUygula(m: KokpitModeli, k: IyimserKatman | null): KokpitModeli {
  if (k === null) return m;
  const idler = Object.keys(k).filter((id) => m.isler[id] !== undefined);
  if (idler.length === 0) return m;
  const isler = { ...m.isler };
  for (const id of idler) { const y = k[id]!; isler[id] = { ...m.isler[id]!, m: y.tezgah, S: y.S, C: y.C }; }
  return { ...m, isler };
}

// Bayat planda (bekleyen değişiklik '*' ister) Uygula bütün planı yeniden dizer; kişi bunu önceden görür.
export const TUM_PLAN_NOTU = 'Tüm plan yeniden diziliyor; birkaç saniye sürebilir.';
export const tumPlanDiziliyor = (isler: readonly string[]): boolean => isler.includes('*');
