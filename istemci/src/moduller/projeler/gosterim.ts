import type { ProjeDurumu } from '#paylasilan/sozlesme/projeler.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Sözleşmeyle aynı sıra; derlemede sözleşmenin durum tipine bağlıdır.
export const DURUMLAR = ['aktif', 'tamamlandi', 'iptal'] as const satisfies readonly ProjeDurumu[];
export const KOD_EN_COK = 24;

export const DURUM_METNI: Record<ProjeDurumu, string> = { aktif: 'Aktif', tamamlandi: 'Tamamlandı', iptal: 'İptal' };
export const DURUM_TONU: Record<ProjeDurumu, RozetTonu> = { aktif: 'tamam', tamamlandi: 'pasif', iptal: 'hata' };

// GGGG-AA-GG -> GG.AA.GGGG; tarih yoksa tire.
export const tarihMetni = (t: string | null): string => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);

// Bütçe ve maliyet yalnız bu işlemle görünür (180); sunucu da alanı yalnız bu işlemde gönderir.
export const MALIYET_ISLEMI = 'finans.maliyet-oku';

// Tutar sunucudan iki ondalıklı metin gelir; tr biçimiyle gösterilir, girilmediyse "plan maliyeti" hedeftir (198 a).
export function butceMetni(tutar: string | null | undefined, paraBirimi: string | null | undefined): string {
  if (tutar === null || tutar === undefined) return 'Girilmedi (hedef plan maliyeti)';
  const [tam = '0', kesir = '00'] = tutar.split('.');
  return `${tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${kesir} ${paraBirimi ?? ''}`.trim();
}
