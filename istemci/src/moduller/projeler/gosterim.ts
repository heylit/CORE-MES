import type { Gorev, GorevDurumu, ProjeDurumu, StatuTonu } from '#paylasilan/sozlesme/projeler.ts';
import type { HAZIRLIK_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
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
  yapilacak: 'Yapılacak', suruyor: 'Sürüyor', bekliyor: 'Bekliyor', kontrolde: 'Kontrolde', bitti: 'Bitti', iptal: 'İptal',
};
export const GOREV_DURUM_TONU: Record<GorevDurumu, RozetTonu> = {
  yapilacak: 'pasif', suruyor: 'bilgi', bekliyor: 'uyari', kontrolde: 'uyari', bitti: 'tamam', iptal: 'hata',
};
// 3269: kontrol edenin onayıyla biten görev "Onaylandı", kontrolsüz biten görev "Bitti".
export const gorevDurumMetni = (g: Pick<Gorev, 'durum' | 'onaylandi'>): string => (g.durum === 'bitti' && g.onaylandi ? 'Onaylandı' : GOREV_DURUM_METNI[g.durum]);
export const STATU_TON_METNI: Record<StatuTonu, string> = {
  tamam: 'Yeşil', uyari: 'Turuncu', hata: 'Kırmızı', pasif: 'Gri', bilgi: 'Mavi', vurgu: 'Sarı',
};

// Sıra metin tablolarının sırasıdır; tablo sözleşmedeki her değeri tuttuğu için liste eksik kalmaz.
export const GOREV_DURUMLARI = Object.keys(GOREV_DURUM_METNI) as GorevDurumu[];
export const STATU_TONLARI = Object.keys(STATU_TON_METNI) as StatuTonu[];

export const GOREV_ISLEMI = 'projeler.gorev-yaz';
export const GOREV_ISLE_ISLEMI = 'projeler.gorev-isle';
export const GOREV_KONTROL_ISLEMI = 'projeler.gorev-kontrol';
export const SABLON_ISLEMI = 'projeler.sablon-yaz';
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

// 3269: yapan ve kontrol eden kişi ya da roldür; rol adının önünde "Rol:" yazar, atanmamışsa tire.
export function atamaMetni(kisiAd: string | null, rolAd: string | null, bos = '—'): string {
  if (kisiAd !== null) return kisiAd;
  return rolAd === null ? bos : `Rol: ${rolAd}`;
}

// 3269: şablon kaleminin bağlanabildiği hazırlık maddeleri (sahibi Üretim Emirleri); bağlı kalem emir başına görev doğurur (3269-B).
export const HAZIRLIK_METNI: Record<(typeof HAZIRLIK_MADDELERI)[number], string> = {
  cnc: 'CNC kurulumu', cizim: 'Çizim revizyonu', yayin: 'Terminale gönderildi', rota: 'Rota yürürlükte', malzeme: 'Malzeme (girdi stoğu)',
  'takim-omru': 'Takım ömrü', 'takim-hazirla': 'Takım hazırla', makine: 'Makine durumu', talimat: 'Hazırlık talimatı',
  'ek-madde': 'Ek hazırlık maddesi', aparat: 'Aparat', 'olcu-aleti': 'Ölçü aleti (kalibrasyon)',
};
