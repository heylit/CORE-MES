import {
  ADRES_SINIRI, FIRMA_ARAMA_SINIRI, KARNE_AGIRLIKLARI, KARNE_DONEM_AYI, KARNE_EN_AZ_LOT, KARNE_EN_AZ_TESLIM, KARNE_SINIFLARI,
  KARNE_SINIF_ALT_SINIRLARI, LOT_KARARLARI, LOT_KARAR_PUANI, TESLIM_TOLERANS_GUNU,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { FirmaKimligi, FirmaTuru, KarneOzeti, KarneSinifi, LotKarari } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Müşteri ve tedarikçi iş kuralları (saf). Numara (MT-n) KURAL-TEST.md ile aynıdır; finanstan gelenlerin eski numarası parantezde.

export interface AlanHatasi { alan: string; ileti: string }

// MT-1 (D-9): vergi numarası biçimi yalnız Türkiye'deki firmada denetlenir (10 hane vergi kimlik, 11 hane T.C. kimlik);
// yabancı firmada uzunluk sınırlı serbest metindir. Tekillik ikisinde de vardır (kısıt).
export const TR_VERGI_NO = /^[0-9]{10,11}$/;
export const YABANCI_VERGI_NO_EN_FAZLA = 30;

export function vergiNoHatasi(ulkeKodu: string, vergiNo: string | null): string | null {
  if (vergiNo === null) return null;
  if (ulkeKodu === 'TR') return TR_VERGI_NO.test(vergiNo) ? null : 'Türkiye\'deki firmada vergi numarası 10, T.C. kimlik numarası 11 rakamdır.';
  return vergiNo.length <= YABANCI_VERGI_NO_EN_FAZLA ? null : `Vergi numarası en çok ${YABANCI_VERGI_NO_EN_FAZLA} karakterdir.`;
}

// MT-7: enlem ve boylam ya ikisi birlikte verilir ya hiçbiri; yarım koordinat haritada yer göstermez.
export function koordinatHatasi(k: { enlem: number | null; boylam: number | null }): AlanHatasi | null {
  if ((k.enlem === null) === (k.boylam === null)) return null;
  return { alan: k.enlem === null ? 'enlem' : 'boylam', ileti: 'Enlem ve boylam birlikte girilir.' };
}

export function firmaKaydiHatasi(k: Pick<FirmaKimligi, 'ulkeKodu' | 'vergiNo' | 'enlem' | 'boylam'>): AlanHatasi | null {
  const vergi = vergiNoHatasi(k.ulkeKodu, k.vergiNo);
  if (vergi !== null) return { alan: 'vergiNo', ileti: vergi };
  return koordinatHatasi(k);
}

// MT-5 (FNS-45): Logo'ya gönderilmiş (Logo kayıt numarası dolu) firmanın kodu ve Logo cari kodu değişmez. Büyük/küçük harf farkı da değişikliktir.
export interface LogoKimligi { logoKayitNo: number | null; kod: string | null; logoCariKodu: string | null }
export function logoKilidiIhlali(eski: LogoKimligi, yeni: Pick<LogoKimligi, 'kod' | 'logoCariKodu'>): boolean {
  return eski.logoKayitNo !== null && (eski.kod !== yeni.kod || eski.logoCariKodu !== yeni.logoCariKodu);
}
export const LOGO_KILIDI_ILETISI = 'Logo\'ya gönderilmiş firmanın kodu ve Logo cari kodu değiştirilemez.';

// MT-8 (FNS-53): pasife alma yalnız aktif firmada, aktif yapma yalnız pasif firmada.
export type FirmaDurumu = 'aktif' | 'pasif';
export function durumGecisiHatasi(aktif: boolean, hedef: FirmaDurumu): string | null {
  if (hedef === 'pasif' && !aktif) return 'Firma zaten pasif.';
  if (hedef === 'aktif' && aktif) return 'Firma zaten aktif.';
  return null;
}

// MT-2: tür süzgeci: müşteri ya da tedarikçi isteyen "ikisi" türündeki firmayı da görür; "ikisi" yalnız kendisini getirir.
export function turKapsami(tur: FirmaTuru | undefined): FirmaTuru[] | null {
  if (tur === undefined) return null;
  return tur === 'ikisi' ? ['ikisi'] : [tur, 'ikisi'];
}

// MT-3 (FNS-49): arama en çok 50 satır döndürür; daha büyük istek reddedilmez, sınıra çekilir.
export function aramaSiniri(istenen: number): number {
  if (!Number.isFinite(istenen)) return FIRMA_ARAMA_SINIRI;
  return Math.max(1, Math.min(FIRMA_ARAMA_SINIRI, Math.trunc(istenen)));
}

// MT-10: bir firmanın en çok 50 adresi olur (kartın merkez adresi sayılmaz).
export function adresSiniriHatasi(mevcut: number): string | null {
  return mevcut >= ADRES_SINIRI ? `Bir firmaya en çok ${ADRES_SINIRI} adres eklenir.` : null;
}

// Kart düzeltmesinin denetim eki: değişen alan başına bir satır. Biçim finansın defteriyle aynıdır (ekran ikisini aynı okur);
// finansın kuralı ithal edilmez, bağımlılık finans -> musteri-tedarikci yönündedir.
type DefterDegeri = string | number | boolean | null;
export type DefterSatiri = Readonly<Record<string, DefterDegeri>>;
export const DEFTER_SATIR_SINIRI = 100;
export const DEFTER_DEGER_BAYT_SINIRI = 200;
const DEFTER_DISI = new Set(['surum', 'olusturma', 'guncelleme']);
const kodlayici = new TextEncoder();
const jsonBayti = (metin: string): number => kodlayici.encode(JSON.stringify(metin)).length;

function defterDegeri(deger: unknown): DefterDegeri {
  if (deger === undefined || deger === null) return null;
  if (typeof deger === 'boolean' || (typeof deger === 'number' && Number.isFinite(deger))) return deger;
  const metin = typeof deger === 'string' ? deger : JSON.stringify(deger);
  if (jsonBayti(metin) <= DEFTER_DEGER_BAYT_SINIRI) return metin;
  let kisa = '';
  for (const harf of metin) {
    if (jsonBayti(`${kisa}${harf}…`) > DEFTER_DEGER_BAYT_SINIRI) break;
    kisa += harf;
  }
  return `${kisa}…`;
}

export function defterFarki(kayit: string, onceki: Readonly<Record<string, unknown>>, sonraki: Readonly<Record<string, unknown>>): DefterSatiri[] {
  const alanlar = [...new Set([...Object.keys(onceki), ...Object.keys(sonraki)])].filter((a) => !DEFTER_DISI.has(a));
  const satirlar = alanlar
    .filter((alan) => JSON.stringify(onceki[alan] ?? null) !== JSON.stringify(sonraki[alan] ?? null))
    .map((alan) => ({ kayit, alan, onceki: defterDegeri(onceki[alan]), yeni: defterDegeri(sonraki[alan]) }));
  if (satirlar.length <= DEFTER_SATIR_SINIRI) return satirlar;
  return [...satirlar.slice(0, DEFTER_SATIR_SINIRI - 1), { kayit, alan: 'kesildi', onceki: null, yeni: satirlar.length }];
}

const TUR_ADI: Record<FirmaTuru, string> = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', ikisi: 'Müşteri ve tedarikçi' };

// Ctrl K sonucu (kart 1235): başlık kod (kodsuz kartta ad), açıklama ad, tür, fason ve pasif; tıklanınca liste kartı açar.
export function firmaAramaSonucu(f: { id: number; kod: string | null; ad: string; tur: FirmaTuru; fason: boolean; aktif: boolean }) {
  const kod = f.kod?.trim() ? f.kod : null;
  return {
    anahtar: String(f.id),
    baslik: kod ?? f.ad,
    aciklama: [kod === null ? null : f.ad, TUR_ADI[f.tur], f.fason ? 'Fason' : null, f.aktif ? null : 'Pasif'].filter((p) => p !== null).join(' · '),
    yol: `/musteri-tedarikci?firma=${f.id}` as const,
  };
}

// ---- Tedarikçi karnesi (1259 c, 1260 a) ----

// MT-14: karne dönemi tesis gününde biten kayan 12 aydır; ayın son günleri kısa ayda o ayın son gününe çekilir (29 Şubat gibi).
export function karneDonemi(bugun: string): { donemBasi: string; donemSonu: string } {
  const [yil, ay, gun] = bugun.split('-').map(Number) as [number, number, number];
  const hedefAy = ay - KARNE_DONEM_AYI;
  const basYil = yil + Math.floor((hedefAy - 1) / 12);
  const basAy = ((((hedefAy - 1) % 12) + 12) % 12) + 1;
  const ayinSonu = new Date(Date.UTC(basYil, basAy, 0)).getUTCDate();
  const iki = (n: number): string => String(n).padStart(2, '0');
  return { donemBasi: `${basYil}-${iki(basAy)}-${iki(Math.min(gun, ayinSonu))}`, donemSonu: bugun };
}

// MT-15: teslim tamsa ve termin + tolerans gününü geçmediyse zamanındadır; eksik teslim zamanında sayılmaz.
export function zamanindaMi(o: { termin: string; teslimGunu: string; tam: boolean }): boolean {
  if (!o.tam) return false;
  const gun = (t: string): number => Date.parse(`${t}T00:00:00Z`) / 86_400_000;
  return gun(o.teslimGunu) - gun(o.termin) <= TESLIM_TOLERANS_GUNU;
}

export interface KarneSayilari {
  teslimToplam: number;
  teslimZamaninda: number;
  lotKararlari: Partial<Record<LotKarari, number>>;
  hizmetSayisi: number;
  hizmetToplami: number;
}

const ondalik1 = (n: number): number => Math.round(n * 10) / 10;

export function karneSinifiBul(puan: number): KarneSinifi {
  return KARNE_SINIFLARI.find((s) => puan >= KARNE_SINIF_ALT_SINIRLARI[s]) ?? 'D';
}

// MT-16: puan = teslim 40 + kalite 40 + hizmet 20 (1260 a). Kalite lot başına kararın puanıdır (kabul 1, şartlı ve hatalı kabul 0,5,
// red ve iade 0). Hizmet puanı girilmemişse ağırlığı öteki ikisine paylaştırılır (50/50). 12 ayda 3 teslim ve 3 lot yoksa
// "yetersiz veri": puan ve sınıf null'dır, sıfır uydurulmaz.
export function karneHesapla(s: KarneSayilari): Omit<KarneOzeti, 'firmaId' | 'donemBasi' | 'donemSonu'> {
  const lot = LOT_KARARLARI.reduce((t, k) => t + (s.lotKararlari[k] ?? 0), 0);
  const lotPuani = LOT_KARARLARI.reduce((t, k) => t + (s.lotKararlari[k] ?? 0) * LOT_KARAR_PUANI[k], 0);
  const oran = s.teslimToplam > 0 ? ondalik1((s.teslimZamaninda / s.teslimToplam) * 100) : null;
  const kalite = lot > 0 ? ondalik1((lotPuani / lot) * 100) : null;
  const hizmet = s.hizmetSayisi > 0 ? ondalik1((s.hizmetToplami / s.hizmetSayisi) * 20) : null;
  const yetersizVeri = s.teslimToplam < KARNE_EN_AZ_TESLIM || lot < KARNE_EN_AZ_LOT;
  let puan: number | null = null;
  if (!yetersizVeri && oran !== null && kalite !== null) {
    const { teslim: a, kalite: b, hizmet: c } = KARNE_AGIRLIKLARI;
    puan = hizmet === null ? ondalik1((oran + kalite) / 2) : ondalik1((oran * a + kalite * b + hizmet * c) / (a + b + c));
  }
  return {
    teslim: { toplam: s.teslimToplam, zamaninda: s.teslimZamaninda, oran },
    kalite: { lot, puan: kalite },
    hizmet: { sayi: s.hizmetSayisi, puan: hizmet },
    puan,
    sinif: puan === null ? null : karneSinifiBul(puan),
    yetersizVeri,
  };
}

// MT-17: hizmet puanı ve yıllık karne yalnız tedarikçi ya da ikisi türündeki firmaya yazılır.
export function karneYazmaHatasi(tur: FirmaTuru): string | null {
  return tur === 'musteri' ? 'Karne yalnız tedarikçi firmada tutulur.' : null;
}
