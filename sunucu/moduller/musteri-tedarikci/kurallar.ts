import {
  ADRES_SINIRI, FIRMA_ARAMA_SINIRI, HIZMET_PUANI_EN_AZ, KARNE_BILESEN_GRUPLARI, KARNE_BILESENLERI, KARNE_DONEM_AYI, KARNE_EN_AZ_LOT, KARNE_EN_AZ_TESLIM, KARNE_SINIFLARI,
  KARNE_SINIF_ALT_SINIRLARI, LOT_KARARLARI, LOT_KARAR_PUANI, TESLIM_TOLERANS_GUNU,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type {
  FirmaKimligi, FirmaTuru, KarneAgirliklari, KarneBileseni, KarneBilesenGrubu, KarneBilesenSatiri, KarneOlayKaynagi, KarneOzeti, KarneSinifi, LogoCariEslesmesi, LogoCariOnerisi, LotKarari,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';

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

// MT-20: fason işi yaptırılan firmadır; yalnız tedarikçi ya da ikisi türünde olur. Müşteri kartındaki işaret onu fason
// seçicilerine sokardı.
export const FASON_TUR_ILETISI = 'Fason işareti yalnız tedarikçi ya da müşteri ve tedarikçi türündeki firmada olur.';
export function fasonTuruHatasi(k: { tur: FirmaTuru; fason: boolean }): AlanHatasi | null {
  return k.fason && k.tur === 'musteri' ? { alan: 'fason', ileti: FASON_TUR_ILETISI } : null;
}

// FNS-51'in alış yanı: tedarikçi seçicileri (malzemeler, satın alma) yalnız tedarikçi ya da "ikisi" türündeki firmayı alır.
// Firmanın sahibi bu modüldür; kural burada tek yerdedir, çağıranlar kopyalamaz.
export const tedarikciOlabilirMi = (tur: FirmaTuru): boolean => tur === 'tedarikci' || tur === 'ikisi';

// MT-21: müşteri sınıfı plan bedelinin çarpanıdır; tedarikçide anlamı yoktur, boş tutulur (tür değişince de silinir).
export function musteriSinifiTuru<T>(tur: FirmaTuru, sinif: T | null): T | null {
  return tur === 'tedarikci' ? null : sinif;
}

export function firmaKaydiHatasi(k: Pick<FirmaKimligi, 'ulkeKodu' | 'vergiNo' | 'enlem' | 'boylam' | 'tur' | 'fason'>): AlanHatasi | null {
  const vergi = vergiNoHatasi(k.ulkeKodu, k.vergiNo);
  if (vergi !== null) return { alan: 'vergiNo', ileti: vergi };
  const fason = fasonTuruHatasi(k);
  if (fason !== null) return fason;
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

// MT-22 (kart 1812): fason seçicisi (rota, reçete-rota, üretim emirleri) bütün aktif fason firmaları listeler; MT-3'ün 50 sınırı
// yazılarak yapılan aramaya aittir, seçiciye uygulanınca 50'den sonraki fason firma seçilemiyordu. Bu üst sınır yalnız güvenlik
// payıdır: bir atölyenin fason firma sayısı bunun çok altındadır.
export const FASON_SECIM_SINIRI = 1000;

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

// MT-15 (sürüm 2, 2456): zamanlılık yalnız tarihe bakar; teslim termin + tolerans gününü geçmediyse zamanındadır. Eksikliği ayrı
// "tam teslim" bileşeni ölçer; aynı eksik teslim iki bileşenden birden düşmez (2411 Tur 2 dışı nokta, tamlık çift sayımı).
export function zamanindaMi(o: { termin: string; teslimGunu: string }): boolean {
  const gun = (t: string): number => Date.parse(`${t}T00:00:00Z`) / 86_400_000;
  return gun(o.teslimGunu) - gun(o.termin) <= TESLIM_TOLERANS_GUNU;
}

export interface ElleSayilar { sayi: number; toplam: number }
export interface KarneSayilari {
  teslimToplam: number;
  teslimZamaninda: number;
  teslimTam: number;
  lotKararlari: Partial<Record<LotKarari, number>>;
  satinAlma: ElleSayilar;
  kalite: ElleSayilar;
}

const ondalik1 = (n: number): number => Math.round(n * 10) / 10;

export function karneSinifiBul(puan: number): KarneSinifi {
  return KARNE_SINIFLARI.find((s) => puan >= KARNE_SINIF_ALT_SINIRLARI[s]) ?? 'D';
}

// MT-31: elle 1-5 puan 0-100'e (p - 1) x 25 ile çevrilir; en kötü puan 0, en iyi 100 (2456 önizlemesi, Maliyet 2411).
export function ellePuani(e: ElleSayilar): { ortalama: number | null; puan: number | null } {
  if (e.sayi <= 0) return { ortalama: null, puan: null };
  const ortalama = e.toplam / e.sayi;
  return { ortalama: ondalik1(ortalama), puan: ondalik1((ortalama - HIZMET_PUANI_EN_AZ) * 25) };
}

// MT-32: ağırlıklı ortalama yalnız verisi olan bileşenler üzerinden alınır; null bileşenin ağırlığı ötekilere oranla dağılır (sıfır
// sayılmaz). Otomatik bileşenlerin (lot, PPM, zamanında, tam, teklif) hiçbirinde veri yoksa puan null'dır: tek kişinin elle puanı
// tedarikçiye karne puanı vermez (Maliyet ön bakışı A1). Hiçbir bileşenin verisi ya da ağırlığı yoksa da puan null'dır.
export function bilesenPuani(degerler: Record<KarneBileseni, number | null>, agirliklar: KarneAgirliklari): {
  puan: number | null; bilesenler: KarneBilesenSatiri[]; gruplar: Record<KarneBilesenGrubu, number | null>;
} {
  const ortalama = (secilen: readonly KarneBileseni[]): { puan: number | null; toplamAgirlik: number } => {
    const dolu = secilen.filter((b) => degerler[b] !== null);
    const toplamAgirlik = dolu.reduce((t, b) => t + agirliklar[b], 0);
    return { toplamAgirlik, puan: toplamAgirlik > 0 ? ondalik1(dolu.reduce((t, b) => t + degerler[b]! * agirliklar[b], 0) / toplamAgirlik) : null };
  };
  const otomatikVar = KARNE_BILESENLERI.some((b) => KARNE_BILESEN_GRUPLARI[b] !== 'elle' && degerler[b] !== null);
  const genel = ortalama(KARNE_BILESENLERI);
  const puan = otomatikVar ? genel.puan : null;
  const grup = (g: KarneBilesenGrubu) => ortalama(KARNE_BILESENLERI.filter((b) => KARNE_BILESEN_GRUPLARI[b] === g)).puan;
  return {
    puan,
    bilesenler: KARNE_BILESENLERI.map((b) => ({
      anahtar: b,
      deger: degerler[b],
      agirlik: agirliklar[b],
      etkinAgirlik: degerler[b] === null || puan === null ? null : ondalik1((agirliklar[b] / genel.toplamAgirlik) * 100),
    })),
    gruplar: { kalite: grup('kalite'), teslim: grup('teslim'), elle: grup('elle') },
  };
}

// MT-16 (sürüm 2, 2456): bileşenler lot kabul (lot başına karar puanı: kabul 1, şartlı ve hatalı kabul 0,5, red ve iade 0), zamanında,
// tam teslim, satın alma ve Kalite değerlendirmesi. PPM ve teklife yanıt için olay henüz gelmez: null (UYUM-BORCU). 12 ayda 3 teslim
// ve 3 lot yoksa "yetersiz veri": puan verisi olan bileşenlerle hesaplanır ama sınıf verilmez (az veriyle yanlış sınıf bildirimi gitmesin).
export function karneHesapla(s: KarneSayilari, agirliklar: KarneAgirliklari, hesapSurumu: number): Omit<KarneOzeti, 'firmaId' | 'donemBasi' | 'donemSonu'> {
  const lot = LOT_KARARLARI.reduce((t, k) => t + (s.lotKararlari[k] ?? 0), 0);
  const lotPuani = LOT_KARARLARI.reduce((t, k) => t + (s.lotKararlari[k] ?? 0) * LOT_KARAR_PUANI[k], 0);
  const oran = s.teslimToplam > 0 ? ondalik1((s.teslimZamaninda / s.teslimToplam) * 100) : null;
  const tamOrani = s.teslimToplam > 0 ? ondalik1((s.teslimTam / s.teslimToplam) * 100) : null;
  const kalite = lot > 0 ? ondalik1((lotPuani / lot) * 100) : null;
  const satinAlma = ellePuani(s.satinAlma);
  const kaliteDeg = ellePuani(s.kalite);
  const { puan, bilesenler, gruplar } = bilesenPuani(
    { lot: kalite, ppm: null, zamaninda: oran, tam: tamOrani, teklif: null, satinAlma: satinAlma.puan, kalite: kaliteDeg.puan }, agirliklar);
  const yetersizVeri = s.teslimToplam < KARNE_EN_AZ_TESLIM || lot < KARNE_EN_AZ_LOT;
  const kararlar = Object.fromEntries(LOT_KARARLARI.filter((k) => (s.lotKararlari[k] ?? 0) > 0).map((k) => [k, s.lotKararlari[k]!]));
  return {
    teslim: { toplam: s.teslimToplam, zamaninda: s.teslimZamaninda, tam: s.teslimTam, oran },
    kalite: { lot, kararlar, puan: kalite },
    hizmet: { sayi: s.satinAlma.sayi, ...satinAlma },
    kaliteDegerlendirmesi: { sayi: s.kalite.sayi, ...kaliteDeg },
    bilesenler,
    gruplar,
    hesapSurumu,
    puan,
    sinif: puan === null || yetersizVeri ? null : karneSinifiBul(puan),
    yetersizVeri,
  };
}

// MT-33: ağırlık değişikliği okunan geçerli sürüm üzerine yapılır (arada başkası değiştirdiyse çakışma); toplam 100'dür (şema ve kısıt).
export function agirlikSurumHatasi(okunan: number, gecerli: number): string | null {
  return okunan === gecerli ? null : 'Ağırlıklar siz okuduktan sonra değişti; sayfayı yenileyin.';
}

// MT-17: hizmet puanı ve yıllık karne yalnız tedarikçi ya da ikisi türündeki firmaya yazılır.
export function karneYazmaHatasi(tur: FirmaTuru): string | null {
  return tur === 'musteri' ? 'Karne yalnız tedarikçi firmada tutulur.' : null;
}

// ---- Teslim gecikmesi (kart 1474) ----

// MT-18: gecikme günü teslim günü eksi termindir (takvim günü; erken teslim eksi). Karnenin toleransı burada uygulanmaz:
// plan ve malzeme planlaması gerçek kaymayı okur.
export function teslimGecikmesi(termin: string, teslimGunu: string): number {
  const gun = (t: string): number => Date.parse(`${t}T00:00:00Z`) / 86_400_000;
  return Math.round(gun(teslimGunu) - gun(termin));
}

export interface GecikmeOrnegi { kaynak: KarneOlayKaynagi; termin: string; teslimGunu: string; sayi: number }
export interface GecikmeOzeti {
  kaynak: KarneOlayKaynagi;
  teslimSayisi: number;
  gecKalanSayisi: number;
  // İşaretli ortalama: erken teslim eksi, geç teslim artı.
  ortalamaFarkGun: number;
  // Erken teslim 0 sayılarak; planın tampon payı buradan okunur.
  ortalamaGecikmeGun: number;
  yuzde80GecikmeGun: number;
  enCokGecikmeGun: number;
}

// MT-19: özet kaynak başına (satın alma ile fason ayrı süreçtir) ve yalnız tam teslimden çıkar; eksik teslim sonucu belli
// olmadığından sayılmaz. %80 değeri en yakın sıra yöntemiyle, erken teslim 0 sayılarak alınır. Örnek yoksa kaynak listede yoktur.
export function gecikmeOzetleri(ornekler: readonly GecikmeOrnegi[]): GecikmeOzeti[] {
  const kaynaklar = new Map<KarneOlayKaynagi, number[]>();
  for (const o of ornekler) {
    if (!(o.sayi > 0)) continue;
    const fark = teslimGecikmesi(o.termin, o.teslimGunu);
    if (!Number.isFinite(fark)) continue;
    const l = kaynaklar.get(o.kaynak) ?? [];
    for (let i = 0; i < o.sayi; i += 1) l.push(fark);
    kaynaklar.set(o.kaynak, l);
  }
  return [...kaynaklar.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([kaynak, farklar]) => {
      const gecikmeler = farklar.map((f) => Math.max(0, f)).sort((a, b) => a - b);
      const n = farklar.length;
      return {
        kaynak,
        teslimSayisi: n,
        gecKalanSayisi: farklar.filter((f) => f > 0).length,
        ortalamaFarkGun: ondalik1(farklar.reduce((t, f) => t + f, 0) / n),
        ortalamaGecikmeGun: ondalik1(gecikmeler.reduce((t, f) => t + f, 0) / n),
        yuzde80GecikmeGun: gecikmeler[Math.ceil(0.8 * n) - 1]!,
        enCokGecikmeGun: gecikmeler[n - 1]!,
      };
    });
}

// MT-30 (2118): Logo carisi. Logo modülünün okuduğu cari burada kendi tipiyle tutulur; modül logoyu ithal etmez (ters bağ kablolamada).
export interface LogoCariBilgisi {
  logoKayitNo: number;
  kod: string;
  ad: string | null;
  kartTuru: number | null;
  vergiNo: string | null;
  tcKimlikNo: string | null;
  vergiDairesi: string | null;
  adres: string | null;
  ilce: string | null;
  il: string | null;
  postaKodu: string | null;
  telefon: string | null;
  ePosta: string | null;
  aktif: boolean;
}

// VARSAYIM (Logo CLCARD.CARDTYPE): 1 alıcı, 2 satıcı, 3 alıcı + satıcı; bilinmeyen tür "ikisi" önerilir, kullanıcı formda düzeltir.
export function logoCariTuru(kartTuru: number | null): FirmaTuru {
  if (kartTuru === 1) return 'musteri';
  if (kartTuru === 2) return 'tedarikci';
  return 'ikisi';
}

const kirp = (m: string | null, azami: number): string | null => {
  const t = m?.trim() ?? '';
  return t === '' ? null : t.slice(0, azami);
};
const EPOSTA = /^[^@\s]+@[^@\s]+$/;

// Kod TMI firma kodu kısıtına (1-40 karakter, baştaki ve sondaki boşluk yok) sığmazsa cari alınamaz ve bağlanamaz.
export function logoCariKoduHatasi(kod: string): string | null {
  if (kod.length === 0 || kod.length > 40) return 'Logo cari kodu 1-40 karakter olmalı; bu cari TMI\'ye alınamaz.';
  if (kod.trim() !== kod) return 'Logo cari kodunun başında ya da sonunda boşluk var; bu cari TMI\'ye alınamaz.';
  return null;
}

// Forma öneri (2118-1 a: kod Logo kodudur). Vergi numarası Türkiye biçimine uymuyorsa önerilmez (kısıt reddederdi); ülke TR varsayılır.
export function logoCariOnerisi(c: LogoCariBilgisi): LogoCariOnerisi {
  const vergi = [c.vergiNo, c.tcKimlikNo].map((v) => v?.trim() ?? '').find((v) => TR_VERGI_NO.test(v)) ?? null;
  const ePosta = kirp(c.ePosta, 200);
  return {
    kod: c.kod, ad: kirp(c.ad, 200) ?? c.kod.slice(0, 200), tur: logoCariTuru(c.kartTuru), ulkeKodu: 'TR', vergiNo: vergi,
    vergiDairesi: kirp(c.vergiDairesi, 100), adres: kirp(c.adres, 500), ilce: kirp(c.ilce, 100), il: kirp(c.il, 100),
    postaKodu: kirp(c.postaKodu, 20), telefon: kirp(c.telefon, 40), ePosta: ePosta !== null && EPOSTA.test(ePosta) ? ePosta : null,
    logoCariKodu: c.kod,
  };
}

// 2118-2 a: eşleşen firma varsa yeni kart açılmaz. Sıra: Logo kayıt numarası, Logo cari kodu, firma kodu, vergi numarası
// (kod karşılaştırması büyük/küçük harfe duyarsızdır, tekil indeks gibi).
type LogoCariEslesmeNedeni = LogoCariEslesmesi['neden'];
export interface LogoCariAdayi {
  id: number; kod: string | null; ad: string; vergiNo: string | null; logoKayitNo: number | null; logoCariKodu: string | null; surum: number;
}
const ayni = (a: string | null, b: string): boolean => a !== null && a.toUpperCase() === b.toUpperCase();
export function logoCariEslesmesi(c: LogoCariBilgisi, adaylar: readonly LogoCariAdayi[]): LogoCariEslesmesi | null {
  const vergi = logoCariOnerisi(c).vergiNo;
  const sira: [LogoCariEslesmeNedeni, (a: LogoCariAdayi) => boolean][] = [
    ['kayit-no', (a) => a.logoKayitNo === c.logoKayitNo],
    ['cari-kodu', (a) => ayni(a.logoCariKodu, c.kod)],
    ['kod', (a) => ayni(a.kod, c.kod)],
    ['vergi-no', (a) => vergi !== null && a.vergiNo === vergi],
  ];
  for (const [neden, uyar] of sira) {
    const a = adaylar.find(uyar);
    if (a) return { firmaId: a.id, kod: a.kod, ad: a.ad, neden, baglanabilir: logoyaBaglanabilir(a, c.kod), surum: a.surum };
  }
  return null;
}

// Bağlama yalnız Logo alanlarını yazar (TMI kazanır, 2116-2 a ile aynı): firma Logo'ya bağlı olmamalı, cari kodu boş ya da aynı olmalı;
// kodu doluysa ve Logo kodundan farklıysa kod korunur (bağlama kodu değiştirmez). Kodu TMI'ye sığmayan cari bağlanmaz.
export function logoyaBaglanabilir(a: Pick<LogoCariAdayi, 'logoKayitNo' | 'logoCariKodu'>, logoKodu: string): boolean {
  return a.logoKayitNo === null && (a.logoCariKodu === null || ayni(a.logoCariKodu, logoKodu)) && logoCariKoduHatasi(logoKodu) === null;
}

// Alma ve bağlama komutu köprüye gitmez (POST transaction'ında 60 saniyelik köprü beklenmez): aynı kişinin aramasında görülen cari
// bu süre içinde kullanılır, sonra yeniden aranır.
export const LOGO_CARI_BELLEK_MS = 10 * 60_000;
export function logoCariBellegiGecerliMi(zaman: number, simdi: number): boolean {
  return simdi - zaman >= 0 && simdi - zaman < LOGO_CARI_BELLEK_MS;
}
