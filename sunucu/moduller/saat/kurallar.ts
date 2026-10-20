import type { Islem } from '#paylasilan/islemler.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { IstasyonDurumu, SaatIstasyonu, SaatUyarisi } from '#paylasilan/sozlesme/saat.ts';

export type CalismaDurumu = 'calisiyor' | 'durakli' | 'durdu';
export type MakineDurumuDegeri = 'calisir' | 'ariza' | 'bakim';

export interface KaynakEmir {
  id: number;
  emirNo: string;
  istasyonId: number;
  durum: string;
  baslama: string | null;
  adet: number;
  saglam: number | null;
  calisma: CalismaDurumu | null;
  durusNedeni: string | null;
  durusBaslangic: string | null;
  // Emrin çalışmaya son geçiş anı (başlatma ya da duruştan devam); yalnız çalışan emirde doldurulur.
  calismaBaslangic: string | null;
}

export interface KaynakMakineDurumu {
  istasyonId: number;
  durum: MakineDurumuDegeri;
  aciklama: string | null;
  degisme: string;
}

export interface KaynakMakine {
  id: number;
  istasyonId: number | null;
  ad: string;
  tur: string | null;
}

export interface KaynakAlet {
  id: number;
  no: string;
  ad: string | null;
  tur: string;
  vade: string | null;
  durum: string;
}

export type Tezgah = { ad: string; tur: string | null };

// Kalibrasyon modülünün okuma ucundaki işlemlerle aynı küme (kalibrasyon/uclar.ts OKUMA): saat kişiye modülün göstermediği aleti göstermez.
export const KALIBRASYON_OKUMA_ISLEMLERI = ['sayfa.kalibrasyon', 'kalibrasyon.oku'] as const satisfies readonly Islem[];

export const kalibrasyonuGorebilirMi = (islemler: readonly string[]): boolean =>
  KALIBRASYON_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));

// Birim süre veritabanında dakika (numeric metin) olarak durur; saat saniye ister. Girilmemiş ya da sıfır süre ölçü değildir.
export function birimSaniye(birimSureDk: string | null): number | null {
  if (birimSureDk === null) return null;
  const dk = Number(birimSureDk);
  if (!Number.isFinite(dk) || dk <= 0) return null;
  return Math.round(dk * 60);
}

// Hedefe kalan sağlam adet x birim süre. Hedef aşıldıysa kalan sıfırdır (gerçek sıfır: iş bitti).
// Sayacı açılmamış (başlamamış) emirde üretilmiş parça yoktur; kalan bütün adettir.
export function kalanSaniye(hedef: number, saglam: number | null, birim: number | null): number | null {
  if (birim === null) return null;
  return Math.max(0, hedef - (saglam ?? 0)) * birim;
}

// Önce başlamış emir; hiç başlamamışlar en sonda, kendi aralarında kimlik sırasıyla.
function oncelikliEmir(emirler: readonly KaynakEmir[]): KaynakEmir | null {
  const sirali = [...emirler].sort((a, b) => {
    if (a.baslama !== b.baslama) {
      if (a.baslama === null) return 1;
      if (b.baslama === null) return -1;
      return Date.parse(a.baslama) - Date.parse(b.baslama);
    }
    return a.id - b.id;
  });
  return sirali[0] ?? null;
}

export function istasyonDurumu(emir: KaynakEmir | null, makineDurumlari: readonly MakineDurumuDegeri[]): IstasyonDurumu {
  if (makineDurumlari.includes('ariza')) return 'ariza';
  if (makineDurumlari.includes('bakim')) return 'bakim';
  if (emir === null) return 'bos';
  return emir.calisma ?? 'bekliyor';
}

// İstasyonun makinesi: birden çok aktif makine varsa liste sırasındaki (koda göre) ilki.
export function istasyonTezgahi(istasyonId: number, makineler: readonly KaynakMakine[]): Tezgah | null {
  const m = makineler.find((x) => x.istasyonId === istasyonId);
  return m === undefined ? null : { ad: m.ad, tur: m.tur };
}

// Emrin tezgahı: çalışan iş emrinin makinesi bilinirse o, bilinmezse istasyonun ilk makinesi.
export function emirTezgahi(isEmriMakineId: number | null, istasyonId: number, makineler: readonly KaynakMakine[]): Tezgah | null {
  const m = isEmriMakineId === null ? undefined : makineler.find((x) => x.id === isEmriMakineId);
  return m === undefined ? istasyonTezgahi(istasyonId, makineler) : { ad: m.ad, tur: m.tur };
}

// Arıza ve bakımda makine durumunun değiştiği an (aynı durumdaki makinelerin en eskisi: en uzun süredir bekleyen); durdu ve durakli'de
// emrin duruş anı; calisiyor'da çalışmaya son geçiş anı. Öbür durumlarda null (uydurulmaz).
export function durumBaslangici(durum: IstasyonDurumu, emir: KaynakEmir | null, makineler: readonly KaynakMakineDurumu[]): string | null {
  if (durum === 'ariza' || durum === 'bakim') {
    const anlar = makineler.filter((m) => m.durum === durum).map((m) => m.degisme);
    return anlar.reduce<string | null>((en, an) => (en === null || Date.parse(an) < Date.parse(en) ? an : en), null);
  }
  if (durum === 'durdu' || durum === 'durakli') return emir?.durusBaslangic ?? null;
  if (durum === 'calisiyor') return emir?.calismaBaslangic ?? null;
  return null;
}

// Duruş saniyesi penceresinin başı: şimdinin düştüğü tesis gününün başı. Vardiya modülü "o anki vardiyanın başı"nı veren işlev açmadığı için gün başı alınır.
export const pencereBaslangici = (simdi: string): string => new Date(tesisGunBasi(tesisGunu(Date.parse(simdi)))).toISOString();

export function istasyonlariKur(
  istasyonlar: readonly { id: number; kod: string; ad: string }[],
  emirler: readonly KaynakEmir[],
  makineler: readonly KaynakMakineDurumu[],
  tezgahlar: readonly KaynakMakine[] = [],
  durusSaniyeleri: ReadonlyMap<number, number> = new Map(),
  bugunAdetleri: ReadonlyMap<number, { saglam: number; hurda: number }> = new Map(),
): SaatIstasyonu[] {
  return istasyonlar.map((i) => {
    const emir = oncelikliEmir(emirler.filter((e) => e.istasyonId === i.id));
    const durumlari = makineler.filter((m) => m.istasyonId === i.id);
    const durum = istasyonDurumu(emir, durumlari.map((m) => m.durum));
    return {
      id: i.id,
      kod: i.kod,
      ad: i.ad,
      durum,
      durumBaslangic: durumBaslangici(durum, emir, durumlari),
      tezgah: istasyonTezgahi(i.id, tezgahlar),
      emir: emir === null ? null : { id: emir.id, emirNo: emir.emirNo, saglam: emir.saglam, hedef: emir.adet },
      durusSaniye: durusSaniyeleri.get(i.id) ?? null,
      bugun: bugunAdetleri.get(i.id) ?? null,
    };
  });
}

// Ondalık metin x10000 tam sayı (brüt ihtiyaç dört haneli); dört haneden fazlası ya da bozuk metin ölçülemez (null).
function olcekli(metin: string): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(metin.trim());
  if (m === null) return null;
  const sayi = BigInt(`${m[2]}${(m[3] ?? '').padEnd(4, '0')}`);
  return m[1] === '-' ? -sayi : sayi;
}

// Emrin bütün adımlarının brüt malzeme ihtiyacı, emre şimdiye kadar verilen net sarf düşülerek, kullanılabilir stokla karşılaştırılır.
// İhtiyaç verisi yoksa (ürün kartı olmayan emir) ya da emrin malzemesi yoksa null: hazır diye bir şey söylenmez.
// Stoğu olmayan malzeme haritada yoktur ve sıfır sayılır (stok modülünün sözleşmesi); ölçülemeyen miktar null verir.
export function malzemeHazirMi(
  ihtiyaclar: readonly { malzemeNo: number; brut: string }[] | null,
  verilen: ReadonlyMap<number, string>,
  kullanilabilir: ReadonlyMap<number, string>,
): boolean | null {
  if (ihtiyaclar === null || ihtiyaclar.length === 0) return null;
  const toplam = new Map<number, bigint>();
  for (const i of ihtiyaclar) {
    const brut = olcekli(i.brut);
    if (brut === null) return null;
    toplam.set(i.malzemeNo, (toplam.get(i.malzemeNo) ?? 0n) + brut);
  }
  for (const [malzemeNo, brut] of toplam) {
    const verilmis = olcekli(verilen.get(malzemeNo) ?? '0');
    const eldeki = olcekli(kullanilabilir.get(malzemeNo) ?? '0');
    if (verilmis === null || eldeki === null) return null;
    const kalan = brut - verilmis;
    if (kalan > eldeki) return false;
  }
  return true;
}

const UYARI_SIRASI: Record<SaatUyarisi['tur'], number> = { ariza: 0, durus: 1, bakim: 2, kalite: 3, malzeme: 4, bitti: 5, kalibrasyon: 6 };

export interface UyariEkleri {
  // Emir kimliği -> karar bekleyen adet.
  kararBekleyen?: ReadonlyMap<number, number>;
  // Emir kimliği -> malzemeHazirMi sonucu.
  malzemeHazir?: ReadonlyMap<number, boolean | null>;
  // Pencerede biten emirler (bitenEmirler); bitis uyarının başlangıcı olur.
  biten?: readonly { emirNo: string; istasyonId: number; bitis: string }[];
  // Yalnız kişi kalibrasyonu görebiliyorsa verilir.
  aletler?: readonly KaynakAlet[];
}

const KALIBRASYON_ACIKLAMASI: Record<string, string> = {
  gecmis: 'Kalibrasyon vadesi geçti',
  yaklasan: 'Kalibrasyon vadesi yaklaşıyor',
};

const uyariAnahtari = (u: SaatUyarisi): number => u.istasyon?.id ?? u.alet?.id ?? 0;

// Arıza önce, sonra duruş, bakım, kalite, malzeme, bitti, kalibrasyon; her türde en eski önce (en uzun süredir bekleyen).
// Kalite ve malzeme yalnız açık emirlerden, bitti yalnız pencerede biten emirlerden, hepsi listedeki (kapsamdaki) istasyonlarda; malzeme yalnız başlamamış emirde.
export function uyarilariKur(
  istasyonlar: readonly { id: number; ad: string }[],
  emirler: readonly KaynakEmir[],
  makineler: readonly KaynakMakineDurumu[],
  ekler: UyariEkleri = {},
): SaatUyarisi[] {
  const adlar = new Map(istasyonlar.map((i) => [i.id, i.ad]));
  const uyarilar: SaatUyarisi[] = [];
  for (const m of makineler) {
    const ad = adlar.get(m.istasyonId);
    if (ad === undefined || m.durum === 'calisir') continue;
    uyarilar.push({ tur: m.durum, istasyon: { id: m.istasyonId, ad }, alet: null, emirNo: null, aciklama: m.aciklama, baslangic: m.degisme });
  }
  for (const e of emirler) {
    const ad = adlar.get(e.istasyonId);
    if (ad === undefined) continue;
    const istasyon = { id: e.istasyonId, ad };
    if (e.calisma === 'durdu') {
      uyarilar.push({ tur: 'durus', istasyon, alet: null, emirNo: e.emirNo, aciklama: e.durusNedeni, baslangic: e.durusBaslangic });
    }
    const bekleyen = ekler.kararBekleyen?.get(e.id) ?? 0;
    if (bekleyen > 0) {
      uyarilar.push({ tur: 'kalite', istasyon, alet: null, emirNo: e.emirNo, aciklama: `${bekleyen} adet kalite kararı bekliyor`, baslangic: null });
    }
    if (e.baslama === null && ekler.malzemeHazir?.get(e.id) === false) {
      uyarilar.push({ tur: 'malzeme', istasyon, alet: null, emirNo: e.emirNo, aciklama: 'Malzeme stoğu yetersiz', baslangic: null });
    }
  }
  for (const b of ekler.biten ?? []) {
    const ad = adlar.get(b.istasyonId);
    if (ad === undefined) continue;
    uyarilar.push({ tur: 'bitti', istasyon: { id: b.istasyonId, ad }, alet: null, emirNo: b.emirNo, aciklama: null, baslangic: b.bitis });
  }
  for (const a of ekler.aletler ?? []) {
    const aciklama = KALIBRASYON_ACIKLAMASI[a.durum];
    if (aciklama === undefined) continue;
    uyarilar.push({
      tur: 'kalibrasyon', istasyon: null, alet: { id: a.id, no: a.no, ad: a.ad ?? a.tur, vade: a.vade }, emirNo: null, aciklama, baslangic: null,
    });
  }
  return uyarilar.sort((a, b) => {
    if (a.tur !== b.tur) return UYARI_SIRASI[a.tur] - UYARI_SIRASI[b.tur];
    if (a.baslangic === b.baslangic) return uyariAnahtari(a) - uyariAnahtari(b);
    if (a.baslangic === null) return 1;
    if (b.baslangic === null) return -1;
    return Date.parse(a.baslangic) - Date.parse(b.baslangic);
  });
}
