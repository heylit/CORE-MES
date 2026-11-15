import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

// 3279 a: Satın Alma > Tedarikçiler > Onaylı liste satırları. Kaynak Kalite Merkezi; satın alma yazmaz. Tek sözlük: Onaylı, Şartlı,
// Onaysız, Karar yok, Kalite kaydı yok. Ad ile eşlenen kayıt yazdırma ve CSV'de onaylı sayılmaz (Risk K3).

export type Firma = OnayliListeCevabi['firmalar'][number];
export type Ton = 'tamam' | 'uyari' | 'hata' | 'pasif' | 'bilgi';
export type DurumSuzgeci = 'hepsi' | 'onayli' | 'sartli' | 'onaysiz' | 'kayitsiz' | 'sertifika';
export const TUM_FIRMALAR = '';
export const SERTIFIKA_ESIGI_GUN = 30;

export interface Satir {
  firmaId: number;
  ad: string;
  kritiklik: string | null;
  adIleEslendi: boolean;
  /** Seçili kategoride karar; kategori seçilmediyse firma geneli durum. */
  durum: { metin: string; ton: Ton; sinif: Exclude<DurumSuzgeci, 'hepsi' | 'sertifika'> };
  /** Firma geneli durum (Kalite'nin tedarikçi kaydı). */
  genel: Satir['durum'];
  satinAlmaTedarikcisi: boolean;
  sart: string | null;
  /** Kategori durumunun alt satırı: karar tarihi ve kararı veren, firma askısı ya da Kalite kaydı yok; firma genelinde null. */
  kararAlt: string | null;
  /** Özet sayımı için: en az bir kategoride onaylı ya da şartlı karar (firma askıdaysa kararlar zaten onaysız gelir). */
  kategorideOnayli: boolean;
  kategorideSartli: boolean;
  sertifikalar: string[];
  sertifikaBitisi: string | null;
  /** Sertifika bitişine kalan gün (geçtiyse eksi); bitiş yoksa null. */
  sertifikaGun: number | null;
  sonDenetim: string | null;
  sonYil: Firma['sonYil'];
  /** 3279-2 a: bu kategoride (kategori seçilmediyse bütün) onaylar; ilki şirket onayı (Kalite kaydı varsa). */
  onaylar: OnayRozeti[];
}

export type OnayTuru = 'sirket' | 'musteri' | 'diger';
export interface OnayRozeti { tur: OnayTuru; kim: string; musteriFirmaId: number | null; metin: string; ton: Ton; sart: string | null }
type DigerOnay = NonNullable<Firma['kalite']>['onaylar'][number];
const DURUM_METNI = { onayli: 'Onaylı', sartli: 'Şartlı', onaysiz: 'Onaysız' } as const;
const DURUM_TONU = { onayli: 'tamam', sartli: 'uyari', onaysiz: 'hata' } as const;
const tarih = (g: string): string => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;
const onayKimi = (o: DigerOnay): string => (o.tur === 'musteri' ? o.musteriAd ?? 'Müşteri' : o.ad ?? 'Diğer');
const onayMetni = (o: DigerOnay): string => (o.suresiGecti ? `Onaysız · süresi geçti ${o.bitis === null ? '' : tarih(o.bitis)}`.trim()
  : o.bitis === null ? DURUM_METNI[o.durum] : `${DURUM_METNI[o.durum]} · ${tarih(o.bitis)}`);
const kapsar = (o: DigerOnay, kategori: string): boolean =>
  kategori === TUM_FIRMALAR || o.kapsamTumu || o.kapsam.some((k) => kategoriAnahtari(k.kategoriTuru, k.kategoriKodu) === kategori);
function onayRozetleri(f: Firma, durum: Satir['durum'], sart: string | null, kategori: string): OnayRozeti[] {
  if (f.kalite === null) return [];
  return [
    { tur: 'sirket', kim: 'Şirket', musteriFirmaId: null, metin: durum.metin, ton: durum.ton, sart },
    ...f.kalite.onaylar.filter((o) => kapsar(o, kategori)).map((o): OnayRozeti => ({
      tur: o.tur, kim: onayKimi(o), musteriFirmaId: o.musteriFirmaId, metin: onayMetni(o), ton: DURUM_TONU[o.durum], sart: o.durum === 'sartli' ? o.aciklama : null,
    })),
  ];
}

const gunFarki = (bugun: string, gun: string): number => Math.round((Date.parse(`${gun}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / 86_400_000);
export const kategoriAnahtari = (tur: string, kod: string): string => `${tur}|${kod}`;
const gunMetni = (g: string): string => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;
const zamanGunu = (z: string): string => gunMetni(tesisGunu(Date.parse(z)));

function genelDurum(f: Firma): Satir['durum'] {
  const d = f.kalite?.durum ?? null;
  if (f.kalite === null) return { metin: 'Kalite kaydı yok', ton: 'pasif', sinif: 'kayitsiz' };
  if (d === 'Onaylı') return { metin: 'Onaylı', ton: 'tamam', sinif: 'onayli' };
  if (d === 'Şartlı onaylı') return { metin: 'Şartlı onaylı', ton: 'uyari', sinif: 'sartli' };
  if (d === 'Aday' || d === 'Askıda') return { metin: d, ton: 'hata', sinif: 'onaysiz' };
  return { metin: 'Karar yok', ton: 'pasif', sinif: 'onaysiz' };
}

/** Seçili kategori (`TUM_FIRMALAR` ise firma geneli) için satırlar; kategoride yalnız kararı olan firmalar ve Kalite kaydı olmayan satın alma tedarikçileri. */
export function satirlar(c: OnayliListeCevabi, kategori: string, bugun: string): Satir[] {
  const sonuc: Satir[] = [];
  for (const f of c.firmalar) {
    const k = f.kalite;
    const genel = genelDurum(f);
    let durum = genel;
    let sart: string | null = null;
    let kararAlt: string | null = null;
    if (kategori !== TUM_FIRMALAR) {
      const karar = k?.kategoriler.find((x) => kategoriAnahtari(x.kategoriTuru, x.kategoriKodu) === kategori);
      // 3279-2 a: şirket kararı olmasa da kategoride müşteri ya da diğer onayı olan firma listededir (şirket rozeti "Karar yok").
      const digerVar = (k?.onaylar ?? []).some((o) => kapsar(o, kategori));
      if (karar === undefined && k !== null && !digerVar) continue;
      if (k === null && !f.satinAlmaTedarikcisi) continue;
      if (karar === undefined && k !== null) durum = { metin: 'Karar yok', ton: 'pasif', sinif: 'onaysiz' };
      if (karar !== undefined) {
        durum = karar.durum === 'onayli' ? { metin: 'Onaylı', ton: 'tamam', sinif: 'onayli' }
          : karar.durum === 'sartli' ? { metin: 'Şartlı', ton: 'uyari', sinif: 'sartli' }
            : { metin: 'Onaysız', ton: 'hata', sinif: 'onaysiz' };
        sart = karar.durum === 'sartli' ? karar.aciklama : null;
        kararAlt = karar.durum === 'sartli' ? null
          : k?.firmaAskida != null && karar.durum === 'onaysiz' ? `Firma askıda: ${zamanGunu(k.firmaAskida)}`
            : [zamanGunu(karar.tarih), karar.kisiAd].filter((v) => v !== null).join(' · ');
      } else if (k === null) kararAlt = "Firmanın Kalite Merkezi'nde kaydı yok";
    }
    const bitis = k?.sertifikaBitisi ?? null;
    sonuc.push({
      firmaId: f.firmaId, ad: f.ad, kritiklik: k?.kritiklik ?? null, adIleEslendi: k?.adIleEslendi ?? false, durum, genel, satinAlmaTedarikcisi: f.satinAlmaTedarikcisi, sart, kararAlt,
      kategorideOnayli: (k?.kategoriler ?? []).some((x) => x.durum === 'onayli'), kategorideSartli: (k?.kategoriler ?? []).some((x) => x.durum === 'sartli'),
      sertifikalar: k?.sertifikalar ?? [], sertifikaBitisi: bitis, sertifikaGun: bitis === null ? null : gunFarki(bugun, bitis), sonDenetim: k?.sonDenetim ?? null, sonYil: f.sonYil, onaylar: onayRozetleri(f, durum, sart, kategori),
    });
  }
  return sonuc;
}

/** 3279-2 a: onay süzgeci; `musteri:<firma>` o müşterinin onayı olan firmalar. */
export type OnaySuzgeci = 'hepsi' | 'sirket' | 'diger' | `musteri:${number}`;
const onayaUyar = (x: Satir, o: OnaySuzgeci): boolean => o === 'hepsi'
  || x.onaylar.some((r) => (o === 'sirket' ? r.tur === 'sirket' : o === 'diger' ? r.tur === 'diger' : r.tur === 'musteri' && `musteri:${String(r.musteriFirmaId)}` === o));
export function onaySecenekleri(c: OnayliListeCevabi): { deger: OnaySuzgeci; baslik: string }[] {
  const musteriler = new Map<number, string>();
  let diger = false;
  for (const f of c.firmalar) for (const o of f.kalite?.onaylar ?? []) {
    if (o.tur === 'musteri' && o.musteriFirmaId !== null) musteriler.set(o.musteriFirmaId, o.musteriAd ?? 'Müşteri');
    if (o.tur === 'diger') diger = true;
  }
  return [
    { deger: 'hepsi', baslik: 'Bütün onaylar' }, { deger: 'sirket', baslik: 'Şirket onayı' },
    ...[...musteriler].sort((a, b) => a[1].localeCompare(b[1], 'tr')).map(([id, ad]) => ({ deger: `musteri:${id}` as const, baslik: `Müşteri: ${ad}` })),
    ...(diger ? [{ deger: 'diger' as const, baslik: 'Diğer onaylar' }] : []),
  ];
}

export function suz(s: readonly Satir[], durum: DurumSuzgeci, ara: string, onay: OnaySuzgeci = 'hepsi'): Satir[] {
  const a = ara.trim().toLocaleLowerCase('tr-TR');
  return s.filter((x) => (a === '' || x.ad.toLocaleLowerCase('tr-TR').includes(a)) && onayaUyar(x, onay)
    && (durum === 'hepsi' || (durum === 'sertifika' ? x.sertifikaGun !== null && x.sertifikaGun <= SERTIFIKA_ESIGI_GUN : x.durum.sinif === durum)));
}

/** Yazdırma ve CSV'deki durum: ad ile eşlenen kayıt onaylı sayılmaz (Risk K3). */
const k3 = (x: Satir, metin: string): string => (x.adIleEslendi ? `${metin} (ad ile eşlendi, onaylı sayılmaz)` : metin);
export const csvDurumu = (x: Satir): string => k3(x, x.durum.metin);

export const CSV_BASLIKLARI = [
  'Firma', 'Kritiklik', 'Kategori', 'Bu kategoride', 'Firma geneli', 'Şart', 'Sertifikalar', 'Sertifika bitişi', 'Son denetim', 'Son 12 ay sipariş', 'Zamanında teslim (%)',
  'Müşteri ve diğer onaylar',
] as const;
/** "Son 12 ay" alt satırı: zamanında oranı; teslim karnenin en az sayısının altındaysa "veri az". */
export const sonYilNotu = (x: Pick<Satir, 'sonYil'>): string =>
  (x.sonYil.yetersizVeri || x.sonYil.zamanindaYuzde === null ? 'veri az' : `%${x.sonYil.zamanindaYuzde.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} zamanında`);
/** CSV satırları; kategori seçilmediyse kategori ve kategori durumu boş. */
export function csvSatirlari(s: readonly Satir[], kategoriAdi: string | null): (string | number | null)[][] {
  return s.map((x) => [
    x.ad, x.kritiklik, kategoriAdi, kategoriAdi === null ? null : csvDurumu(x), k3(x, x.genel.metin), x.sart,
    x.sertifikalar.join(', '), x.sertifikaBitisi, x.sonDenetim, x.sonYil.siparis, x.sonYil.yetersizVeri ? null : x.sonYil.zamanindaYuzde,
    x.onaylar.filter((o) => o.tur !== 'sirket').map((o) => `${o.kim}: ${o.metin}`).join('; ') || null,
  ]);
}

export function sertifikaMetni(x: Satir): string | null {
  if (x.sertifikaGun === null || x.sertifikaBitisi === null) return null;
  const t = `${x.sertifikaBitisi.slice(8, 10)}.${x.sertifikaBitisi.slice(5, 7)}.${x.sertifikaBitisi.slice(0, 4)}`;
  return x.sertifikaGun < 0 ? `bitti ${t}` : x.sertifikaGun <= SERTIFIKA_ESIGI_GUN ? `bitiş ${t}, ${x.sertifikaGun} gün` : `bitiş ${t}`;
}

/** Kategori seçenekleri: önce kararı olan kategoriler (üst başlıkla), sonra ötekiler; pasif kategori yalnız kararı varsa. */
export interface KategoriSecenegi { deger: string; ad: string; ust: string; kisa: string; kararli: boolean; sayi: number }
export function kategoriSecenekleri(c: OnayliListeCevabi): KategoriSecenegi[] {
  const sayi = new Map<string, number>();
  for (const f of c.firmalar) for (const k of f.kalite?.kategoriler ?? []) {
    const a = kategoriAnahtari(k.kategoriTuru, k.kategoriKodu);
    sayi.set(a, (sayi.get(a) ?? 0) + 1);
  }
  return c.kategoriler
    .filter((k) => k.aktif || sayi.has(kategoriAnahtari(k.tur, k.kod)))
    .map((k) => {
      const deger = kategoriAnahtari(k.tur, k.kod);
      return { deger, ad: `${k.ustAd} · ${k.ad}`, ust: k.ustAd, kisa: k.ad, kararli: sayi.has(deger), sayi: sayi.get(deger) ?? 0 };
    })
    .sort((a, b) => Number(b.kararli) - Number(a.kararli) || a.ad.localeCompare(b.ad, 'tr'));
}

/** Firma x kategori tablosu: sütun kararı olan kategoriler (üst başlıkla), satır Kalite kaydı olan firmalar ve Kalite kaydı olmayan satın alma
 * tedarikçileri (hücreleri "kayitsiz"). Hücre null: bu kategoride karar yok. */
export interface MatrisHucresi { durum: 'onayli' | 'sartli' | 'onaysiz' | 'kayitsiz'; aciklama: string | null }
export interface MatrisSatiri { firmaId: number; ad: string; alt: string; satir: Satir; hucreler: (MatrisHucresi | null)[] }
export function matris(c: OnayliListeCevabi, bugun: string): { sutunlar: { deger: string; ad: string; ust: string }[]; satirlar: MatrisSatiri[] } {
  const sutunlar = kategoriSecenekleri(c).filter((k) => k.kararli).map(({ deger, kisa, ust }) => ({ deger, ad: kisa, ust }));
  const genel = new Map(satirlar(c, TUM_FIRMALAR, bugun).map((x) => [x.firmaId, x]));
  const sonuc = c.firmalar.filter((f) => f.kalite !== null || f.satinAlmaTedarikcisi).map((f): MatrisSatiri => {
    const x = genel.get(f.firmaId)!;
    return {
      firmaId: f.firmaId, ad: f.ad, alt: [x.genel.metin, x.kritiklik].filter((v) => v !== null).join(' · '), satir: x,
      hucreler: sutunlar.map((s) => {
        if (f.kalite === null) return { durum: 'kayitsiz', aciklama: null };
        const k = f.kalite.kategoriler.find((y) => kategoriAnahtari(y.kategoriTuru, y.kategoriKodu) === s.deger);
        return k === undefined ? null : { durum: k.durum, aciklama: k.aciklama };
      }),
    };
  });
  return { sutunlar, satirlar: sonuc };
}

/** Üstteki özet (kategori seçiminden bağımsız): onaylı ve şartlı, en az bir kategoride o kararı olan firma. Kategori kararı firma kimliğiyle
 * verildiğinden ad ile eşlenen kayıt bu sayıma girmez (Risk K3). */
export function ozet(s: readonly Satir[]): { onayli: number; sartli: number; sertifika: number; sertifikaGecmis: number; kayitsiz: number } {
  return {
    onayli: s.filter((x) => x.kategorideOnayli).length,
    sartli: s.filter((x) => x.kategorideSartli).length,
    sertifika: s.filter((x) => x.sertifikaGun !== null && x.sertifikaGun <= SERTIFIKA_ESIGI_GUN).length,
    sertifikaGecmis: s.filter((x) => x.sertifikaGun !== null && x.sertifikaGun < 0).length,
    kayitsiz: s.filter((x) => x.genel.sinif === 'kayitsiz').length,
  };
}

/** 3279-2 a: firmaya tıklanınca açılan onay tablosu (salt okunur). Şirket kararları duruma göre tek satırda toplanır; belge açılmaz (Risk K3). */
export interface FirmaOnaySatiri { anahtar: string; tur: string; kim: string; kapsam: string; durum: { metin: string; ton: Ton }; sart: string | null; gecerlilik: string; belge: boolean }
export function firmaOnaylari(c: OnayliListeCevabi, firmaId: number): FirmaOnaySatiri[] {
  const k = c.firmalar.find((f) => f.firmaId === firmaId)?.kalite ?? null;
  if (k === null) return [];
  const ad = (tur: string, kod: string) => c.kategoriler.find((x) => x.tur === tur && x.kod === kod)?.ad ?? kod;
  const sirket = (['onayli', 'sartli', 'onaysiz'] as const).flatMap((d): FirmaOnaySatiri[] => {
    const l = k.kategoriler.filter((x) => x.durum === d);
    return l.length === 0 ? [] : [{
      anahtar: `sirket-${d}`, tur: 'Şirket onayı', kim: 'Şirket (Kalite kararı)', kapsam: l.map((x) => ad(x.kategoriTuru, x.kategoriKodu)).join(', '),
      durum: { metin: DURUM_METNI[d], ton: DURUM_TONU[d] }, sart: [...new Set(l.flatMap((x) => (x.aciklama === null || d !== 'sartli' ? [] : [x.aciklama])))].join('; ') || null,
      gecerlilik: 'süresiz', belge: false,
    }];
  });
  const digerleri = k.onaylar.map((o, i): FirmaOnaySatiri => ({
    anahtar: `diger-${i}`, tur: o.tur === 'musteri' ? 'Müşteri onayı' : 'Diğer', kim: onayKimi(o),
    kapsam: o.kapsamTumu ? 'Bütün kategoriler' : o.kapsam.map((x) => ad(x.kategoriTuru, x.kategoriKodu)).join(', '),
    durum: { metin: o.suresiGecti ? 'Onaysız' : DURUM_METNI[o.durum], ton: DURUM_TONU[o.durum] }, sart: o.durum === 'sartli' && !o.suresiGecti ? o.aciklama : null,
    gecerlilik: o.bitis === null ? 'süresiz' : o.suresiGecti ? `${tarih(o.bitis)} · süresi geçti` : tarih(o.bitis), belge: o.belgeVar,
  }));
  return [...sirket, ...digerleri];
}
