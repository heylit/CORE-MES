import type { Ben } from './tipler.ts';

// Ekran yalnız gizler; asıl denetim sunucudadır (yazma `mesaj.yaz`, sahiplik KD-050 ve 225 a).
export interface MesajYetkisi {
  oku: boolean;
  yaz: boolean;
  // Eski ekranın `isAdmin`'i: başkasının görevini, toplantısını, zamanlı mesajını ve kuralını düzenler.
  yonetici: boolean;
}

export const mesajYetkisi = (ben: Ben | null | undefined): MesajYetkisi =>
  ben ? { oku: true, yaz: ben.yazabilir, yonetici: ben.yonetici } : { oku: false, yaz: false, yonetici: false };

// Kaydın sahibi: yazan (`by`) ya da kanalı açan (`createdBy`).
export const sahipMi = (kayit: { by?: string | null; createdBy?: string | null }, ben: string): boolean =>
  (kayit.by ?? kayit.createdBy ?? null) === ben;

// 225 a: sahipli kayıtta içerik değişikliği ve silme yalnız sahipte ve yöneticide.
export const duzenleyebilir = (kayit: { by?: string | null; createdBy?: string | null }, yetki: MesajYetkisi, ben: string): boolean =>
  yetki.yaz && (yetki.yonetici || sahipMi(kayit, ben));
