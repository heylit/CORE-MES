import { ROLLER, V24_YETKILERI, VARSAYILAN_YETKILER } from './sabitler.ts';
import type { Perm, PermMatrix, Role, User } from './tipler.ts';

// Arkon'un sayfa ve işlem yetkisi (ortak-ayarlar.ts permsFrom, can, canSee, firstPage, userInWc). Ekran yalnız gizler; denetim
// TMI uçlarındadır (sunucu Arkon rolünü TMI rolünden çözer, her uç rolGerekli ister).

type KayitliMatris = Partial<Record<string, unknown>> & { _known?: unknown };

// Kayıtlı matriste olmayan, sonradan eklenen yetkiler varsayılandan gelir.
export function yetkiMatrisi(kayitli: KayitliMatris | null | undefined): PermMatrix {
  if (!kayitli) return VARSAYILAN_YETKILER;
  const bilinen = new Set<string>(Array.isArray(kayitli._known) ? (kayitli._known as string[]) : V24_YETKILERI);
  const cikti: PermMatrix = {};
  for (const [rol] of ROLLER) {
    if (rol === 'admin') continue;
    const kendi = Array.isArray(kayitli[rol]) ? (kayitli[rol] as Perm[]) : (VARSAYILAN_YETKILER[rol] ?? []);
    cikti[rol] = kendi.concat((VARSAYILAN_YETKILER[rol] ?? []).filter((k) => !bilinen.has(k) && !kendi.includes(k)));
  }
  return cikti;
}

// Giriş yoksa (yerel kip, kullanıcı tanımsız) her şey açıktır; TMI içinde kişi hep vardır.
export function yetkiVar(kisi: Pick<User, 'role'> | null, matris: PermMatrix, k: Perm): boolean {
  if (!kisi || kisi.role === 'admin') return true;
  return (matris[kisi.role as Exclude<Role, 'admin'>] ?? []).includes(k);
}

// Arkon sayfa anahtarı (yeni ekranın adres parçası) -> sayfa yetkisi. Operatör ekranının eski işareti boştu, burada `operator`.
export const SAYFA_YETKISI: Readonly<Record<string, Perm>> = {
  operator: 'page.op', pano: 'page.board', planlama: 'page.plan', kuyruk: 'page.plan', hazirlik: 'page.prep', anomali: 'page.prep',
  kalite: 'page.quality', bakim: 'page.maint', raporlar: 'page.report', cizim: 'page.draw', onizle: 'page.prep',
};
const ILK_SAYFA_SIRASI = ['operator', 'pano', 'planlama', 'hazirlik', 'kalite', 'bakim', 'raporlar', 'cizim'] as const;

export function sayfaGorunur(sayfa: string, kisi: Pick<User, 'role'> | null, matris: PermMatrix): boolean {
  return sayfa === 'ayarlar' || yetkiVar(kisi, matris, SAYFA_YETKISI[sayfa] ?? 'page.op');
}

export function ilkSayfa(kisi: Pick<User, 'role'> | null, matris: PermMatrix): string {
  return ILK_SAYFA_SIRASI.find((s) => sayfaGorunur(s, kisi, matris)) ?? 'ayarlar';
}

// İş merkezi listesi boş kişi her yerde çalışır.
export function isMerkezinde(kisi: Pick<User, 'role' | 'wcs'> | null, isMerkezi: string | null | undefined): boolean {
  return !kisi || kisi.role === 'admin' || !(kisi.wcs && kisi.wcs.length) || !isMerkezi || kisi.wcs.includes(isMerkezi);
}
