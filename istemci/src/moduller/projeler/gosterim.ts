import type { GorevDurumu, ProjeDurumu, StatuTonu } from '#paylasilan/sozlesme/projeler.ts';
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

// 890 c: görev durumları ve statü tonları. Statü tonu "vurgu" ortak rozette yoktur; statü çipi kendi rengini tasarım değişkeninden alır.
export const GOREV_DURUM_METNI: Record<GorevDurumu, string> = {
  yapilacak: 'Yapılacak', suruyor: 'Sürüyor', bekliyor: 'Bekliyor', bitti: 'Bitti', iptal: 'İptal',
};
export const GOREV_DURUM_TONU: Record<GorevDurumu, RozetTonu> = {
  yapilacak: 'pasif', suruyor: 'bilgi', bekliyor: 'uyari', bitti: 'tamam', iptal: 'hata',
};
export const STATU_TON_METNI: Record<StatuTonu, string> = {
  tamam: 'Yeşil', uyari: 'Turuncu', hata: 'Kırmızı', pasif: 'Gri', bilgi: 'Mavi', vurgu: 'Sarı',
};

// Sıra metin tablolarının sırasıdır; tablo sözleşmedeki her değeri tuttuğu için liste eksik kalmaz.
export const GOREV_DURUMLARI = Object.keys(GOREV_DURUM_METNI) as GorevDurumu[];
export const STATU_TONLARI = Object.keys(STATU_TON_METNI) as StatuTonu[];

export const GOREV_ISLEMI = 'projeler.gorev-yaz';
export const STATU_ISLEMI = 'projeler.statu-yaz';
export const STATU_AYAR_ISLEMI = 'projeler.statu-ayar';

// Gün farkı (b - a); tarihlerden biri yoksa null.
export function gunFarki(a: string | null, b: string | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}
// Gösterilen "bugün" tarayıcının yerel günüdür; yalnız gecikme işareti içindir, kayıtlara zaman sunucudan yazılır.
export function bugun(): string {
  const s = new Date();
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}
export function sapmaMetni(gun: number | null): string {
  if (gun === null) return '—';
  if (gun === 0) return 'Zamanında';
  return gun > 0 ? `+${gun} gün` : `${gun} gün`;
}
