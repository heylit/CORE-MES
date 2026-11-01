// 1477 a: plan motorunun ufku (gün) sistem ayarındandır (plan.motor-ufuk-gun); sunucu planlama çalışmasının w.ufukGun alanıyla verir,
// motor aynı sınırlarla okur (engine.betik olcekKur). Ekranlar ufku buradan okur; çalışma gelince sayfa kurar.
export const UFUK_VARSAYILAN = 120;
const UFUK_ENAZ = 28;
const UFUK_ENCOK = 182;
let ufuk = UFUK_VARSAYILAN;

export function ufukGecerli(w: { ufukGun?: unknown } | null | undefined): number {
  const u = Math.round(Number(w?.ufukGun));
  return u >= UFUK_ENAZ && u <= UFUK_ENCOK ? u : UFUK_VARSAYILAN;
}
export function ufukKur(w: { ufukGun?: unknown } | null | undefined): void { ufuk = ufukGecerli(w); }
export const ufukGunu = (): number => ufuk;
