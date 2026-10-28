// Tüm işler ekranının saf görünüm hesapları (960): gün, süzgeç, rozet ve depo metni. Aşama ve yetki sunucudandır; burada yalnız gösterilir.
import type { KalemKaynagi, TumIsAsamasi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { gunKaydir } from './bicim.ts';

export type Gorunum = 'karar' | 'sevkiyat';
export type Gruplama = 'gun' | 'duz';
export type Hazirlik = 'hazir' | 'gelecek';
export type Yon = TumIsSatiri['yon'];

export const KAYNAKLAR: readonly { kod: KalemKaynagi; ad: string; simge: SimgeAdi; sahip: string; aciklama: string }[] = [
  { kod: 'urun', ad: 'Ürün', simge: 'box', sahip: 'Planlama', aciklama: 'Üretim emrinin sağlam adedi' },
  { kod: 'fason', ad: 'Fason gidişi', simge: 'upload', sahip: 'Üretim / Planlama', aciklama: 'Rotadaki fason adımına gidecek parça' },
  { kod: 'fason-donus', ad: 'Fason dönüşü', simge: 'download', sahip: 'Üretim / Planlama', aciklama: 'Fasona giden parçanın dönüşü' },
  { kod: 'alim', ad: 'Alım', simge: 'building', sahip: 'Satın alma', aciklama: 'Satın alma siparişinin malzemesi' },
  { kod: 'elle', ad: 'Elle iş', simge: 'list', sahip: 'Sevkiyat', aciklama: 'Elle girilen iş' },
];
export const KAYNAK = Object.fromEntries(KAYNAKLAR.map((k) => [k.kod, k])) as Record<KalemKaynagi, (typeof KAYNAKLAR)[number]>;

// Sevkiyattaki aşama çipleri; depoda bekleyen her zaman görünür (kapanmış sayılmaz).
export const ASAMALAR: readonly { kod: TumIsAsamasi; ad: string; ton: RozetTonu; cizgi?: true; aciklama: string }[] = [
  { kod: 'bekliyor', ad: 'Hazır olunca', ton: 'pasif', cizgi: true, aciklama: 'Serbest bırakıldı; kalem bitince havuza düşer' },
  { kod: 'havuzda', ad: 'Havuzda', ton: 'uyari', aciklama: 'Sevkiyat havuzunda; araca verilmedi' },
  { kod: 'planlandi', ad: 'Planlandı', ton: 'pasif', aciklama: 'Taslak planda bir araçta' },
  { kod: 'yolda', ad: 'Yolda', ton: 'tamam', aciklama: 'Plan onaylandı; araç yolda' },
  { kod: 'tamamlandi', ad: 'Tamamlandı', ton: 'tamam', aciklama: 'Depoda çıktı ya da kabul edildi' },
];
export const ASAMA_SIRASI: Record<TumIsAsamasi, number> = {
  'hazir-degil': 1, hazir: 0, bekliyor: 0, havuzda: 1, planlandi: 2, yolda: 3, depoda: 4, tamamlandi: 5,
};

export const DONEMLER = [
  { kod: 'yakin', ad: 'Son 7 gün ve sonraki 30 gün', aralik: (b: string) => [gunKaydir(b, -7), gunKaydir(b, 30)] },
  { kod: 'hafta', ad: 'Bu hafta', aralik: (b: string) => { const g = haftaGunu(b); return [gunKaydir(b, -g), gunKaydir(b, 6 - g)]; } },
  { kod: 'iki-hafta', ad: 'Sonraki 14 gün', aralik: (b: string) => [b, gunKaydir(b, 14)] },
  { kod: 'tumu', ad: 'Bütün tarihler', aralik: () => ['2000-01-01', '2099-12-31'] },
] as const satisfies readonly { kod: string; ad: string; aralik: (bugun: string) => string[] }[];
export type Donem = (typeof DONEMLER)[number]['kod'];
export const donemAraligi = (d: Donem, bugun: string): [string, string] => {
  const [a, b] = DONEMLER.find((x) => x.kod === d)!.aralik(bugun);
  return [a!, b!];
};

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_TAM = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const haftaGunu = (iso: string): number => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
export const fark = (a: string, b: string): number => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
export const kisaTarih = (iso: string): string => { const [, a, g] = iso.split('-'); return `${g}.${a}`; };
export const uzunTarih = (iso: string): string => {
  const [y, a, g] = iso.split('-').map(Number);
  return `${g} ${AYLAR[(a ?? 1) - 1]} ${y}, ${GUN_TAM[haftaGunu(iso)]}`;
};
export function farkYaz(iso: string, bugun: string): string {
  const n = fark(iso, bugun);
  if (n === 0) return 'bugün';
  if (n === 1) return 'yarın';
  if (n === -1) return 'dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}

export const adayMi = (r: TumIsSatiri): boolean => r.asama === 'hazir' || r.asama === 'hazir-degil';
export const kapali = (r: TumIsSatiri): boolean => r.asama === 'tamamlandi';
// Satırın günü: işin günü, yoksa kaynağın hazır olma ya da istenen günü; kapanmışta depo günü. Hiçbiri yoksa tarihsiz.
export function gunu(r: TumIsSatiri): string | null {
  if (r.is) return r.is.tarih;
  if (kapali(r) && r.depo?.zaman) return r.depo.zaman.slice(0, 10);
  return r.hazirTarihi ?? r.istenenTarih;
}
export function geciktiMi(r: TumIsSatiri, bugun: string): boolean {
  if (adayMi(r)) return r.asama === 'hazir' && r.istenenTarih !== null && r.istenenTarih < bugun;
  const g = gunu(r);
  return !kapali(r) && r.asama !== 'bekliyor' && g !== null && g < bugun;
}
// Kaynak istenen günden sonra hazır olacak (canlı planın tahmini).
export const gecKalacakMi = (r: TumIsSatiri): boolean =>
  r.asama === 'hazir-degil' && r.hazirTarihi !== null && r.istenenTarih !== null && r.hazirTarihi > r.istenenTarih;
// Dönüş, gidişi depodan çıkmadan alınmaz (sunucunun ilerleme metni).
export const GIDIS_CIKMADI = 'Gidiş henüz depodan çıkmadı';
export const gidisCiktiMi = (r: TumIsSatiri): boolean => r.ilerleme !== GIDIS_CIKMADI;
// Sevkiyat tetikler: araçla taşınan, işe çevrilmiş, henüz tetiklenmemiş kalem.
export const tetiklenebilir = (r: TumIsSatiri): boolean =>
  r.tasima === 'biz' && r.is !== null && r.is.tetiklendi === null && (r.asama === 'havuzda' || r.asama === 'planlandi' || r.asama === 'yolda');

export const OZETLER = [
  { kod: 'hazir', gorunum: 'karar', ad: 'Hazır, bırakılmadı', ton: 'uyari', suz: (r: TumIsSatiri) => r.asama === 'hazir' },
  { kod: 'gelecek', gorunum: 'karar', ad: '14 günde hazır', ton: null,
    suz: (r: TumIsSatiri, b: string) => r.asama === 'hazir-degil' && gunu(r) !== null && fark(gunu(r)!, b) <= 14 },
  { kod: 'gecikmis', gorunum: 'sevkiyat', ad: 'Geciken iş', ton: 'hata', suz: (r: TumIsSatiri, b: string) => !adayMi(r) && geciktiMi(r, b) },
  { kod: 'havuz', gorunum: 'sevkiyat', ad: 'Havuzda', ton: null, suz: (r: TumIsSatiri) => r.asama === 'havuzda' },
  { kod: 'yolda', gorunum: 'sevkiyat', ad: 'Yolda', ton: null, suz: (r: TumIsSatiri) => r.asama === 'yolda' },
  { kod: 'kabul', gorunum: 'sevkiyat', ad: 'Depoda bekleyen', ton: 'uyari', suz: (r: TumIsSatiri) => r.asama === 'depoda' },
] as const satisfies readonly { kod: string; gorunum: Gorunum; ad: string; ton: 'uyari' | 'hata' | null; suz: (r: TumIsSatiri, bugun: string) => boolean }[];
export type Ozet = (typeof OZETLER)[number]['kod'];

export interface Suzgec {
  gorunum: Gorunum; ara: string; ozet: Ozet | null; aralik: [string, string];
  hazirlik: ReadonlySet<Hazirlik>; asamalar: ReadonlySet<TumIsAsamasi>; kaynaklar: ReadonlySet<KalemKaynagi>; yonler: ReadonlySet<Yon>;
}
export const gorunumde = (r: TumIsSatiri, g: Gorunum): boolean => (g === 'karar' ? adayMi(r) : !adayMi(r));
const aramaMetni = (r: TumIsSatiri): string =>
  [r.emirNo, r.siparisNo, r.opNo === null ? null : `OP ${r.opNo}`, r.adim, r.malzemeAd, r.firmaAd, r.aciklama].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');

// kaynaksiz: kaynak ve yön çiplerini sayarken o çiplerin kendisi süzmez; filtresiz: durum çiplerini sayarken.
export function suz(satirlar: readonly TumIsSatiri[], s: Suzgec, bugun: string, { ozetsiz = false, filtresiz = false, kaynaksiz = false } = {}): TumIsSatiri[] {
  const ara = s.ara.trim().toLocaleLowerCase('tr-TR');
  const [a, b] = s.aralik;
  return satirlar.filter((r) => {
    if (!gorunumde(r, s.gorunum)) return false;
    const g = gunu(r);
    const aralikta = g === null || (g >= a && g <= b);
    if (!aralikta && !geciktiMi(r, bugun) && r.asama !== 'hazir' && r.asama !== 'depoda') return false;
    if (!kaynaksiz && (!s.kaynaklar.has(r.kaynak) || !s.yonler.has(r.yon))) return false;
    if (!filtresiz && s.ozet === null) {
      if (adayMi(r) && !s.hazirlik.has(r.asama === 'hazir' ? 'hazir' : 'gelecek')) return false;
      if (!adayMi(r) && r.asama !== 'depoda' && !s.asamalar.has(r.asama)) return false;
    }
    if (!ozetsiz && s.ozet !== null && !OZETLER.find((o) => o.kod === s.ozet)!.suz(r, bugun)) return false;
    if (ara && !aramaMetni(r).includes(ara)) return false;
    return true;
  });
}

export type DepoTonu = 'bilgi' | 'tamam' | 'uyari' | 'pasif';
// Depo hareketi (944, 943 a): gidiş son çıkışla, geliş kabulle biter. Firma taşımasında da depo hareketi yapılır.
export function depoDurumu(r: TumIsSatiri): { metin: string; alt: string | null; ton: DepoTonu } {
  const firma = r.tasima === 'firma';
  if (r.yon === 'gidis') {
    if (kapali(r)) return { metin: 'Çıktı', alt: r.kaynak === 'fason' ? (r.firmaAd ? `${r.firmaAd} konumunda` : 'firma konumunda') : r.kaynak === 'urun' ? 'stoktan düştü' : null, ton: 'tamam' };
    if (r.asama === 'depoda') return { metin: 'Son çıkış bekliyor', alt: firma ? 'firma alır' : null, ton: 'uyari' };
    return { metin: 'Çıkacak', alt: null, ton: 'bilgi' };
  }
  if (kapali(r)) return { metin: 'Kabul edildi', alt: null, ton: 'tamam' };
  if (r.depo?.kabulAdet != null) return { metin: 'Kısmi', alt: `${r.depo.kabulAdet}${r.adet === null ? '' : `/${r.adet}`} döndü`, ton: 'uyari' };
  if (r.asama === 'depoda') return { metin: 'Kabul bekliyor', alt: firma ? 'firma getirir' : null, ton: 'uyari' };
  if (!gidisCiktiMi(r)) return { metin: 'Bekliyor', alt: 'gidiş henüz depodan çıkmadı', ton: 'bilgi' };
  return { metin: 'Girecek', alt: r.kaynak === 'fason-donus' ? 'sarf + üretimden giriş' : 'mal kabul', ton: 'bilgi' };
}

// Satırın durum rozeti; gecikme her aşamada öne geçer.
export function rozetOf(r: TumIsSatiri, bugun: string): { ad: string; ton: RozetTonu; cizgi?: boolean } {
  if (geciktiMi(r, bugun)) return { ad: 'Gecikti', ton: 'hata' };
  if (r.asama === 'hazir') return { ad: 'Hazır', ton: 'uyari' };
  if (r.asama === 'hazir-degil') return gecKalacakMi(r) ? { ad: 'Geç kalacak', ton: 'uyari' } : { ad: 'Hazır değil', ton: 'pasif', cizgi: true };
  if (r.asama === 'depoda') return { ad: 'Depoda', ton: 'tamam' };
  if (r.asama === 'tamamlandi') return { ad: r.tasima === 'firma' ? 'Sevk yok' : r.yon === 'gelis' ? 'Kabul edildi' : 'Çıktı', ton: 'tamam' };
  const a = ASAMALAR.find((x) => x.kod === r.asama)!;
  return { ad: a.ad, ton: a.ton, ...(a.cizgi ? { cizgi: true } : {}) };
}

// Kalemi kimin serbest bıraktığı (941 c): sahibi modülün yazma işlemi ya da sevkiyat.is-yaz.
export const KALEM_SAHIBI: Record<KalemKaynagi, string> = {
  urun: 'uretim-emirleri.yaz', fason: 'uretim-emirleri.fason', 'fason-donus': 'uretim-emirleri.fason', alim: 'satin-alma.yaz', elle: 'sevkiyat.is-yaz',
};
