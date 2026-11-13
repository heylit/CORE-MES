import type { TeslimLotlariCevabi } from '#paylasilan/sozlesme/stok.ts';

// Teslim penceresinin planı (3187 a): hangi lottan ne kadar verilecek ve satır okutularak mı elle mi onaylandı. Saf; ekran durumu tutar.
// Miktarlar binde tutulur: stok üç ondalıklıdır, kayan noktayla toplamak eksik ya da fazla gösterirdi.
export type TeslimLotu = TeslimLotlariCevabi['lotlar'][number];
export type Onay = null | 'okut' | 'el';
export interface PlanSatiri { bakiyeId: number; miktar: number; onay: Onay }

export const binde = (m: string): number => Math.round(Number(m) * 1000);
export const bindenMetin = (b: number): string => (b / 1000).toFixed(3);
export const planToplami = (plan: readonly PlanSatiri[]): number => plan.reduce((t, s) => t + s.miktar, 0);

// Pencere öneriyle dolu açılır: sunucunun önerdiği lotlar, önerdiği miktarla, onaysız.
export const oneriPlani = (lotlar: readonly TeslimLotu[]): PlanSatiri[] =>
  lotlar.flatMap((l) => (l.onerilen === null ? [] : [{ bakiyeId: l.bakiyeId, miktar: binde(l.onerilen), onay: null }]));

// Planda olmayan lot gelirse onaylanmamış satırların yerini sondan başlayarak alır: raftan başka lot alan kişi ayrıca silmekle
// uğraşmaz. Onaylanmış satıra dokunulmaz. İstenen onaylılarla zaten tamamsa lot eklenmez (null); fazlası miktar artırılarak verilir.
export function planaEkle(plan: readonly PlanSatiri[], lot: TeslimLotu, istenen: number, onay: Exclude<Onay, null>): PlanSatiri[] | null {
  const onayli = planToplami(plan.filter((s) => s.onay !== null));
  const ihtiyac = istenen - onayli;
  if (ihtiyac <= 0) return null;
  const verilecek = Math.min(binde(lot.miktar), ihtiyac);
  let dus = Math.max(0, planToplami(plan) + verilecek - istenen);
  const yeni = [...plan];
  for (let n = yeni.length - 1; n >= 0 && dus > 0; n -= 1) {
    const s = yeni[n]!;
    if (s.onay !== null) continue;
    const d = Math.min(dus, s.miktar);
    dus -= d;
    if (s.miktar - d <= 0) yeni.splice(n, 1); else yeni[n] = { ...s, miktar: s.miktar - d };
  }
  return [...yeni, { bakiyeId: lot.bakiyeId, miktar: verilecek, onay }];
}

// Miktar lotta olanı aşamaz; sıfıra inen satır plandan çıkar.
export function miktarAyarla(plan: readonly PlanSatiri[], lot: TeslimLotu, miktar: number): PlanSatiri[] {
  const m = Math.min(binde(lot.miktar), Math.max(0, miktar));
  return plan.flatMap((s) => (s.bakiyeId !== lot.bakiyeId ? [s] : m <= 0 ? [] : [{ ...s, miktar: m }]));
}
// − ve + tam birim adımlar: küsuratlı miktar önce tam sayıya iner ya da çıkar (2,5 → 2 ya da 3).
export const adim = (miktar: number, yon: -1 | 1): number => (yon < 0 ? Math.ceil(miktar / 1000) - 1 : Math.floor(miktar / 1000) + 1) * 1000;

// Okutulan lot birden çok konumdaysa önce planda onay bekleyen satırı, sonra plandaki satırı, yoksa sıradaki ilk konumu karşılar.
export function okutulanSatir(lotlar: readonly TeslimLotu[], plan: readonly PlanSatiri[], partiId: number | null): TeslimLotu | null {
  const adaylar = lotlar.filter((l) => l.partiId === partiId);
  const planda = (l: TeslimLotu) => plan.find((s) => s.bakiyeId === l.bakiyeId);
  return adaylar.find((l) => planda(l)?.onay === null) ?? adaylar.find((l) => planda(l) !== undefined) ?? adaylar[0] ?? null;
}
