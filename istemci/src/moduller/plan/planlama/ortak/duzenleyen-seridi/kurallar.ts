import type { DuzenleyenCevabi } from '#paylasilan/sozlesme/planlama.ts';

// 2311 S1, 2311-1 b: birden çok planlayıcı aynı çalışmayı yazar; canlıya almadan önce sözlü haber kuralı. Şerit, çalışmayı son DUZENLIYOR_DK
// dakikada başka biri yazdıysa onu gösterir. Bu, açık oturum değil son yazmadır: kişi sayfayı açıp yazmıyorsa görünmez.
export const DUZENLIYOR_DK = 10;
// Sayfanın sorma aralığı: yazıcının bekleme süresinin (2 sn) çok üstünde, sunucuya yük olmayacak kadar seyrek.
export const SORMA_MS = 30_000;

export interface Duzenleyen { kisi: string; zaman: number; eski: boolean }

// benimSurum: sayfanın elindeki çalışma sürümü. Sunucudaki farklıysa (başkası yazdı) sayfanın sonraki yazması reddedilir; şerit yenilemeyi önerir.
export function duzenleyen(c: DuzenleyenCevabi | null, benId: number, benimSurum: number | null, simdi: number): Duzenleyen | null {
  if (c === null || c.kisiId === null || c.zaman === null || c.kisiId === benId) return null;
  const zaman = Date.parse(c.zaman);
  if (!Number.isFinite(zaman) || simdi - zaman > DUZENLIYOR_DK * 60_000) return null;
  return { kisi: c.kisi ?? 'Başka bir kişi', zaman, eski: benimSurum !== null && c.surum !== null && c.surum !== benimSurum };
}

const saat = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
export function duzenleyenMetni(d: Duzenleyen): string {
  const bas = `Şu an ${d.kisi} bu planı düzenliyor (son değişiklik ${saat(d.zaman)}).`;
  return d.eski
    ? `${bas} Sayfanızdaki çalışma eski; yenilemeden yaptığınız değişiklik kaydedilmez.`
    : `${bas} Canlıya almadan önce ona haber verin.`;
}
