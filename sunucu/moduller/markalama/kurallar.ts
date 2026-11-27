import type { AlanGovdesi, BirimDurumu, DurumKomutu, SayacKapsami } from '#paylasilan/sozlesme/markalama.ts';

// MRK-01: şablonun parçaları bilinir, sıra numarası tek kez geçer. Sayaç malzeme başına olduğundan (806 2a) parça kodu
// zorunludur; emir ya da yıl kapsamında o kapsamın parçası da şablonda olmalıdır, yoksa iki kapsam aynı numarayı üretir.
// Sabit karakterler markalanabilir ASCII ile sınırlıdır.
const PARCA_DESENI = /\{([A-Z]+)(?::(\d))?\}/g;
const SABIT_DESENI = /^[A-Za-z0-9._/-]*$/;
// Sabit marka metni de markalanabilir ASCII'dir; okunaklık için tek boşluk da girer (ör. "REV C").
const SABIT_METIN_DESENI = /^[A-Za-z0-9._/ -]+$/;
const BILINEN = new Set(['PARCA', 'EMIR', 'YY', 'YYYY', 'WW', 'MM', 'DD', 'SEQ']);

export function sablonHatasi(sablon: string, kapsam: SayacKapsami): string | null {
  const parcalar = [...sablon.matchAll(PARCA_DESENI)];
  const bilinmeyen = parcalar.find((p) => !BILINEN.has(p[1] ?? '') || (p[2] !== undefined && p[1] !== 'SEQ'));
  if (bilinmeyen) return `Şablonda bilinmeyen parça var: ${bilinmeyen[0]}.`;
  if (!SABIT_DESENI.test(sablon.replace(PARCA_DESENI, ''))) return 'Şablonda yalnız harf, rakam ve - _ . / kullanılır.';
  const adlar = parcalar.map((p) => p[1]);
  const seq = adlar.filter((a) => a === 'SEQ').length;
  if (seq !== 1) return 'Şablonda sıra numarası ({SEQ} ya da {SEQ:5}) tam bir kez geçer.';
  if (!adlar.includes('PARCA')) return 'Şablonda parça kodu ({PARCA}) olmalı; sayaç malzeme başınadır.';
  if (kapsam === 'emir' && !adlar.includes('EMIR')) return 'Sayaç emir başınaysa şablonda {EMIR} olmalı.';
  if (kapsam === 'yil' && !adlar.includes('YY') && !adlar.includes('YYYY')) return 'Sayaç yıl başınaysa şablonda {YY} ya da {YYYY} olmalı.';
  return null;
}

// MRK-02: sabit içerikli markanın metni vardır, seri içerikli markanınki yoktur; en az bir marka seri no taşımıyorsa
// tanım birim izlemez ve seri verilmez (MRK-07).
export function alanHatasi(alanlar: readonly AlanGovdesi[]): string | null {
  for (const [i, a] of alanlar.entries()) {
    if (a.icerik === 'sabit' && a.sabitMetin === null) return `${i + 1}. markanın sabit metni boş.`;
    if (a.icerik === 'seri' && a.sabitMetin !== null) return `${i + 1}. marka seri no taşır; sabit metin yazılmaz.`;
    if (a.sabitMetin !== null && !SABIT_METIN_DESENI.test(a.sabitMetin)) {
      return `${i + 1}. markanın sabit metninde yalnız İngilizce harf, rakam, boşluk ve - _ . / kullanılır.`;
    }
  }
  return null;
}

// MRK-10: ölçüler veritabanında sabit ondalıkla saklanır (yükseklik, en, boy, açı 2; derinlik ve merkez 3 hane): yuvarlanınca 0'a
// ya da sınırın dışına düşen değer kısıtta genel hatayla reddedilmesin, markanın sırası ve alan adıyla burada reddedilsin.
const yuvarla = (d: number, hane: number): number => Math.round(d * 10 ** hane) / 10 ** hane;

export function olcuHatasi(alanlar: readonly AlanGovdesi[]): { ileti: string; alan: string } | null {
  for (const [i, a] of alanlar.entries()) {
    const yol = `alanlar.${i}`;
    const no = `${i + 1}. marka`;
    if (a.yaziYuksekligiMm !== null && yuvarla(a.yaziYuksekligiMm, 2) <= 0) {
      return { ileti: `${no}: yazı yüksekliği en az 0,01 mm olmalı.`, alan: `${yol}.yaziYuksekligiMm` };
    }
    if (a.yaziDerinligiMm !== null && yuvarla(a.yaziDerinligiMm, 3) <= 0) {
      return { ileti: `${no}: yazı derinliği en az 0,001 mm olmalı.`, alan: `${yol}.yaziDerinligiMm` };
    }
    const y = a.yer;
    if (y === null) continue;
    if (y.merkez.some((d) => Math.abs(yuvarla(d, 3)) >= 1e7)) return { ileti: `${no}: yer koordinatı modelin dışında.`, alan: `${yol}.yer.merkez` };
    if (yuvarla(y.enMm, 2) <= 0) return { ileti: `${no}: en en az 0,01 mm olmalı.`, alan: `${yol}.yer.enMm` };
    if (yuvarla(y.boyMm, 2) <= 0) return { ileti: `${no}: boy en az 0,01 mm olmalı.`, alan: `${yol}.yer.boyMm` };
    if (Math.abs(yuvarla(y.aciDerece, 2)) >= 360) return { ileti: `${no}: açı -360 ile 360 arasında olmalı.`, alan: `${yol}.yer.aciDerece` };
  }
  return null;
}

// MRK-11: seri no sütunu en çok 80 karakterdir; şablon parça kodu ve emir no ile uzar, sıra taşınca da uzar.
export const AZAMI_SERI_UZUNLUGU = 80;

export function seriUzunlukHatasi(seriNo: string): string | null {
  if (seriNo.length <= AZAMI_SERI_UZUNLUGU) return null;
  return `Seri no ${AZAMI_SERI_UZUNLUGU} karakteri aşıyor (${seriNo.length} karakter); şablonu kısaltın.`;
}

// MRK-09: başlangıç sırası sayacın ilerisine alınabilir; sayacın verdiği numaraya ya da gerisine alınırsa numara yinelenir.
export function baslangicHatasi(yeni: number, sonSira: number | null): string | null {
  if (sonSira === null || yeni > sonSira) return null;
  return `Sayaç ${sonSira} numarasına ulaştı; başlangıç sırası en az ${sonSira + 1} olabilir.`;
}

// MRK-12: işaretlenen yerin yüzey yönü sıfır olamaz; yönü olmayan marka 3B sahnede yere oturmaz.
export function normalHatasi(alanlar: readonly AlanGovdesi[]): { ileti: string; alan: string } | null {
  for (const [i, a] of alanlar.entries()) {
    if (a.yer !== null && Math.hypot(...a.yer.normal) < 1e-3) {
      return { ileti: `${i + 1}. marka: yüzey yönü (normal) sıfır olamaz.`, alan: `alanlar.${i}.yer.normal` };
    }
  }
  return null;
}

export const seriAlaniVarMi = (alanlar: readonly { icerik: string }[]): boolean => alanlar.some((a) => a.icerik === 'seri');

export interface SeriBaglami {
  parca: string;
  emir: string;
  // Tesis günü, YYYY-AA-GG.
  gun: string;
}

// ISO 8601 hafta numarası.
export function isoHafta(gun: string): number {
  const [y, a, g] = gun.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (a ?? 1) - 1, g ?? 1));
  const haftaGunu = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - haftaGunu);
  const yilBasi = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yilBasi) / 86400000 + 1) / 7);
}

// MRK-03: numara sunucuda, şablon ve sayaçtan üretilir; sıra şablondaki genişliğe sıfırla doldurulur, taşarsa kısalmaz.
export function seriNoUret(sablon: string, b: SeriBaglami, sira: number): string {
  const [yil = '', ay = '', gun = ''] = b.gun.split('-');
  const iki = (n: number) => String(n).padStart(2, '0');
  return sablon.replace(PARCA_DESENI, (_t, ad: string, genislik?: string) => {
    if (ad === 'SEQ') return String(sira).padStart(Number(genislik ?? 4), '0');
    if (ad === 'PARCA') return b.parca;
    if (ad === 'EMIR') return b.emir;
    if (ad === 'YYYY') return yil;
    if (ad === 'YY') return yil.slice(2);
    if (ad === 'MM') return ay;
    if (ad === 'DD') return gun;
    return iki(isoHafta(b.gun));
  });
}

export function kapsamAnahtari(kapsam: SayacKapsami, uretimEmriId: number, gun: string): string {
  if (kapsam === 'emir') return `E${uretimEmriId}`;
  if (kapsam === 'yil') return `Y${gun.slice(0, 4)}`;
  return '';
}

// MRK-04: birim durum geçişi. Red önce gelir; rework ancak red birime verilir; kabul red ya da rework birimi sağlama döndürür;
// hurda her açık durumdan verilir ve son durumdur.
const GECISLER: Readonly<Record<BirimDurumu, Partial<Record<DurumKomutu, BirimDurumu>>>> = {
  saglam: { red: 'red', hurda: 'hurda' },
  red: { rework: 'rework', kabul: 'saglam', hurda: 'hurda' },
  rework: { red: 'red', kabul: 'saglam', hurda: 'hurda' },
  hurda: {},
};

export function durumGecisi(durum: BirimDurumu, komut: DurumKomutu): BirimDurumu | null {
  return GECISLER[durum][komut] ?? null;
}

// MRK-05: hurdanın nedeni zorunludur; başka komutta neden yazılmaz.
export function hurdaNedeniHatasi(komut: DurumKomutu, hurdaNedeniId: number | null): string | null {
  if (komut === 'hurda' && hurdaNedeniId === null) return 'Hurda için neden seçilmeli.';
  if (komut !== 'hurda' && hurdaNedeniId !== null) return 'Hurda nedeni yalnız hurda kaydında yazılır.';
  return null;
}

// MRK-13 (3788): teknik resim revizyon kodu boşluk ve büyük-küçük harf ayırmadan karşılaştırılır ("c" ile "C" aynı revizyondur).
// Kod servise Üretim Emirleri'nin gösterim kuralıyla ("Rev C" -> "C") gelir; burada yalnız harf büyüklüğü eşitlenir.
// Veritabanındaki tekillik dizini upper(btrim()) ile karşılaştırır; aynı sonucu vermesi için dil kuralsız büyük harf (i -> I, ı ve İ ayrı kalır).
export const revizyonAnahtari = (kod: string | null): string | null => (kod === null ? null : kod.trim().toUpperCase());

export interface TanimAdayi { id: number; aktif: boolean; uretimEmriId: number | null; cizimRevizyonKodu: string | null }
export type TanimSecimi = { durum: 'bulundu'; id: number } | { durum: 'tanim-yok' | 'revizyon-tanimi-yok' };

// MRK-14 (3788): işin tanımı, aynı malzeme ve operasyonun aktif tanımlarından şu sırayla: bu emre özel, emrin teknik resim
// revizyonuna ait (emre özel olmayan), revizyonsuz genel. Başka revizyonun tanımı kullanılmaz: biçim revizyonla değişebilir.
// Emrin revizyonu sabitlenmemişse yalnız revizyonsuz genel tanım geçer. Başka revizyona ait aktif tanım varsa neden ayrıdır.
export function tanimSec(adaylar: readonly TanimAdayi[], emirId: number, emirRevizyonu: string | null): TanimSecimi {
  const aktif = adaylar.filter((a) => a.aktif && (a.uretimEmriId === null || a.uretimEmriId === emirId));
  const rev = revizyonAnahtari(emirRevizyonu);
  // Emre özel tanım emrin bugünkü revizyonuyla eşleşmeli: emrin revizyonu sonradan değişirse eski biçim kullanılmaz, genele düşülür.
  const emreOzel = aktif.find((a) => a.uretimEmriId === emirId && revizyonAnahtari(a.cizimRevizyonKodu) === rev);
  if (emreOzel !== undefined) return { durum: 'bulundu', id: emreOzel.id };
  const genel = aktif.filter((a) => a.uretimEmriId === null);
  const revizyonlu = rev === null ? undefined : genel.find((a) => revizyonAnahtari(a.cizimRevizyonKodu) === rev);
  if (revizyonlu !== undefined) return { durum: 'bulundu', id: revizyonlu.id };
  const revizyonsuz = genel.find((a) => a.cizimRevizyonKodu === null);
  if (revizyonsuz !== undefined) return { durum: 'bulundu', id: revizyonsuz.id };
  return { durum: genel.length > 0 ? 'revizyon-tanimi-yok' : 'tanim-yok' };
}

// MRK-15 (3788): emre özel tanım o emrin malzemesinde açılır ve revizyonu emrin sabitlenmiş revizyonudur; başka revizyon yazılamaz.
export function emreOzelRevizyonHatasi(govdedeki: string | null, emrinki: string | null): string | null {
  if (govdedeki === null || revizyonAnahtari(govdedeki) === revizyonAnahtari(emrinki)) return null;
  return emrinki === null
    ? 'Bu emre teknik resim revizyonu sabitlenmemiş; emre özel tanım revizyonsuz yazılır.'
    : `Emrin teknik resim revizyonu ${emrinki}; emre özel tanım başka revizyonla yazılamaz.`;
}
