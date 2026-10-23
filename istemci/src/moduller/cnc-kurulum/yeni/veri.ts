import { createContext, useContext, useEffect, useState } from 'react';
import type {
  BenCevabi, EmirSecenegi, EmirlerCevabi, HazirlikCevabi, KayitlarCevabi, KurulumDurumu, KurulumTamamCevabi, StokKarti,
  StokKartiBaglaCevabi, StokKartlariCevabi,
} from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { KopruIsleyici } from '../kopru.ts';
import { DURUM_ANAHTARI } from './durum.ts';
import type { KayitYazici } from './kayit.ts';

// Sunucu uçları. Bütün yazmalar kopru.ts'teki işleyiciden geçer (eski ekranla aynı yol ve kurallar); ekran yalnız gizler,
// asıl denetim sunucudadır.

// Sözleşmedeki ANAHTAR_ONEKI, EMIR_ANAHTARI ve SECIM_ANAHTARI ile aynı; istemci sözleşmeyi değer olarak ithal etmez.
export const ONEK = 'cnc-kurulum-motoru.';
export const EMIR = `${ONEK}emir`;
export const SECIM = `${ONEK}secim`;
const KUTUPHANE_KIMLIGI = /^[A-Za-z0-9_.-]{1,64}$/;

export interface CncYetkisi {
  kisi: BenCevabi['kisi'];
  yazabilir: boolean;
  hazirlikOnaylayabilir: boolean;
  takimDegistirebilir: boolean;
  stokDusebilir: boolean;
  stokKartiBaglayabilir: boolean;
  emirGorebilir: boolean;
  // Yazma işlemi yok, hazırlık onayı var: yalnız Hazırlık açılır, seçimler kilitlidir.
  saltOnay: boolean;
}

export function yetkiKur(ben: BenCevabi): CncYetkisi {
  return {
    kisi: ben.kisi, yazabilir: ben.yazabilir, hazirlikOnaylayabilir: ben.hazirlikOnaylayabilir, takimDegistirebilir: ben.takimDegistirebilir,
    stokDusebilir: ben.stokDusebilir, stokKartiBaglayabilir: ben.stokKartiBaglayabilir, emirGorebilir: ben.emirGorebilir,
    saltOnay: !ben.yazabilir && ben.hazirlikOnaylayabilir,
  };
}

const YETKISIZ: CncYetkisi = {
  kisi: { id: 0, ad: '' }, yazabilir: false, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false,
};
export const CncYetkiBaglami = createContext<CncYetkisi>(YETKISIZ);
export function useCncYetkisi(): CncYetkisi { return useContext(CncYetkiBaglami); }

// Kayıtlar yazma katmanına açılış değeri olarak geçer: json biçimi metne, metin biçimi olduğu gibi (eski ekranla aynı).
export function yerelDegerler(cevap: KayitlarCevabi): Record<string, { deger: string; surum: number }> {
  const sonuc: Record<string, { deger: string; surum: number }> = {};
  for (const k of cevap.kayitlar) {
    if (!k.anahtar.startsWith(ONEK)) continue;
    if (k.bicim === 'metin' && typeof k.deger !== 'string') continue;
    sonuc[k.anahtar] = { deger: k.bicim === 'metin' ? k.deger as string : JSON.stringify(k.deger), surum: k.surum };
  }
  return sonuc;
}

// ----- açık bağlantı (kabuk kurar) -----
export interface Baglanti {
  yetki: CncYetkisi;
  isle: KopruIsleyici;
  yazici: KayitYazici;
}
let baglanti: Baglanti | null = null;
const yazilinca = new Set<(anahtar: string) => void>();
export function baglantiKur(b: Baglanti | null): void { baglanti = b; }
// Kabuk yazma katmanının `yazildi` geri çağrısına bağlar.
export function kayitYazildi(anahtar: string): void { for (const f of yazilinca) f(anahtar); }
function bag(): Baglanti {
  if (baglanti === null) throw new Error('CNC Kurulum bağlantısı kurulmadı.');
  return baglanti;
}

// ----- iş emri -----
// 266 a öncesinin seçimi (üretim emri, operasyonsuz) seçim sayılmaz; sunucu da saymaz.
export function seciliEmir(): EmirSecenegi | null {
  const metin = baglanti?.yazici.deger(EMIR);
  if (metin == null) return null;
  try {
    const e = JSON.parse(metin) as Partial<EmirSecenegi> | null;
    return e !== null && typeof e.id === 'number' && typeof e.uretimEmriId === 'number' && typeof e.emirNo === 'string' ? e as EmirSecenegi : null;
  } catch { return null; }
}

// Açık iş emirleri; listeyi görme yetkisi yoksa istenmez (sunucu reddederdi).
export async function emirler(): Promise<EmirSecenegi[]> {
  const b = bag();
  if (!b.yetki.emirGorebilir) return [];
  return (await b.isle('emirler', {}) as EmirlerCevabi).emirler;
}

// Emir seçilince sunucu eski emrin kurulumunu saklar, yenisininkini açar; kabuk ekranı yeni kayıtlarla yeniden kurar.
// Bekleyen değişiklik önce yazılır; sonra yazma durur (eski durum yeni emrin kurulumunun üstüne yazılmasın).
export async function emirSec(isEmriId: number): Promise<void> {
  const b = bag();
  await b.yazici.bosalt();
  b.yazici.durdur();
  await b.isle('emir-sec', { isEmriId, beklenenSurum: b.yazici.surum(DURUM_ANAHTARI) });
}

export const KAYDEDILMEDI_ILETISI = 'Kurulum henüz kaydedilmedi; bir seçim yapıp yeniden deneyin.';
// "Kurulum tamam": kişi kendi gördüğü durumu tamamlar (sunucu sürümü denetler).
export async function kurulumTamam(): Promise<KurulumDurumu> {
  const b = bag();
  await b.yazici.bosalt();
  const surum = b.yazici.surum(DURUM_ANAHTARI);
  if (surum === null) throw Object.assign(new Error(KAYDEDILMEDI_ILETISI), { durum: 400 });
  return (await b.isle('kurulum-tamam', { beklenenSurum: surum }) as KurulumTamamCevabi).kurulum;
}

// ----- "seçildi" işaretleri (emirle birlikte saklanır) -----
export function secimIsaretleri(): Record<string, unknown> {
  try {
    const d = JSON.parse(baglanti?.yazici.deger(SECIM) ?? 'null') as { adimlar?: unknown } | null;
    return d !== null && typeof d.adimlar === 'object' && d.adimlar !== null ? d.adimlar as Record<string, unknown> : {};
  } catch { return {}; }
}
export function secimIsaretle(anahtar: string): void {
  const b = baglanti;
  if (b === null || !b.yetki.yazabilir || b.yetki.saltOnay || anahtar === '') return;
  const a = secimIsaretleri();
  if (a[anahtar] === true) return;
  b.yazici.degistir(SECIM, JSON.stringify({ adimlar: { ...a, [anahtar]: true } }));
}

// ----- hazırlık onay defteri -----
export async function hazirlikKaydi(): Promise<HazirlikCevabi> {
  return await bag().isle('hazirlik', {}) as HazirlikCevabi;
}
// Onay defteri ve kurulum durumu; durum kaydı her yazılınca yenilenir (onaylar durumla birlikte gider).
export function useHazirlikKaydi(): HazirlikCevabi | null {
  const [kayit, setKayit] = useState<HazirlikCevabi | null>(null);
  useEffect(() => {
    let bitti = false, istekte = false;
    const al = (): void => {
      if (istekte || baglanti === null) return;
      istekte = true;
      hazirlikKaydi().then((c) => { if (!bitti) setKayit(c); }, () => { /* kayıt alınamazsa liste boş kalır */ }).finally(() => { istekte = false; });
    };
    const dinle = (anahtar: string): void => { if (anahtar === DURUM_ANAHTARI) al(); };
    yazilinca.add(dinle);
    al();
    return () => { bitti = true; yazilinca.delete(dinle); };
  }, []);
  return kayit;
}

// ----- takım stoğu (153 a, 163 b) -----
export async function stokKartlari(metin: string, sayfa = 1): Promise<StokKartlariCevabi> {
  return await bag().isle('stok-kartlari', { metin, sayfa }) as StokKartlariCevabi;
}
// Kalem stok kartına bağlanınca ekran Kütüphane'de yeniden kurulur: adet ve bağ okumayla gelir. Bekleyen değişiklik önce yazılır.
export async function stokKartiBagla(kimlik: string, malzemeId: number | null): Promise<StokKarti | null> {
  if (!KUTUPHANE_KIMLIGI.test(kimlik)) throw new Error('Geçersiz kütüphane kimliği.');
  const b = bag();
  await b.yazici.bosalt();
  return (await b.isle('stok-karti-bagla', { kimlik, malzemeId }) as StokKartiBaglaCevabi).kart;
}
