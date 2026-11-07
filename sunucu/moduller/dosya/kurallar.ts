import { inflateRawSync } from 'node:zlib';
import { AZAMI_DOSYA } from '#paylasilan/sozlesme/dosya.ts';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';

export const ILETILER = {
  ozetTutmuyor: 'Dosya içeriği özetle uyuşmuyor; yükleme baştan yapılmalı.',
  parcaUyusmuyor: 'Parça sayısı önceki parçalarla uyuşmuyor.',
  turYok: 'Dosya türü desteklenmiyor (PDF, PNG, JPEG, WEBP, STEP, STL, IGES, GLB, GLTF, DXF, MP4, DOCX, XLSX, PPTX, TXT, CSV; makrolu belge kabul edilmez).',
  dosyaBuyuk: 'Dosya boyut sınırını aşıyor.',
  kotaYukleme: 'Açık yükleme sayısı sınırına ulaşıldı; önce başlattığınız yüklemeleri tamamlayın.',
  kotaBayt: 'Açık yüklemelerinizin toplam boyutu sınırı aştı.',
  kotaDepo: 'Dosya deposu dolu.',
  kotaBagsiz: 'Henüz bir kayda bağlanmamış dosyalarınızın toplam boyutu sınırı aştı; önce onları bağlayın.',
  yuklenmemis: 'Dosya yüklenmemiş.',
  turIzinsiz: 'Bu kayda bu türde dosya eklenemez.',
} as const;

// Sınırlar (kullanıcı kararları DS1-DS10; Arkon'daki onaylı kotayla aynı): tek dosya 200 MB, kişi başına 5 açık yükleme ve 1 GiB açık
// parça (VARSAYIM, Arkon'dan), kişinin yükleyip bağlamadığı dosyalar 2 GiB (VARSAYIM: tek kişi depoyu bağsız dosyayla dolduramasın),
// depo toplamı (tamamlanan dosyalar ve açık parçalar) 50 GB.
export const DOSYA_SINIRI = {
  dosyaBayt: AZAMI_DOSYA, kisiAcikYukleme: 5, kisiAcikBayt: 1024 ** 3, kisiBagsizBayt: 2 * 1024 ** 3, depoBayt: 50 * 1024 ** 3,
} as const;
export type DosyaSiniri = Readonly<Record<keyof typeof DOSYA_SINIRI, number>>;

// Yarım yükleme 1 gün, bağı kalmamış dosya 7 gün sonra silinir (DS4 a). Temizlik zamanlanmış işte saatte bir koşar (isler.ts).
export const BAYAT_SERIT_GUN = 1;
export const SAHIPSIZ_GUN = 7;
// Künyesi silinen diskteki dosya en az bu kadar bekler (1005 a): gece yedeğinin saklama süresinden (14 gün) uzun.
export const DISK_BEKLEME_GUN = 30;
// Tek silme sorgusu en çok bu kadar sahipsiz dosya ve bayat şerit siler: büyük dosyalarda da sorgu süre sınırına sığsın.
export const TEMIZLIK_SINIRI = { dosya: 2, serit: 10, diskDosyasi: 50 } as const;
// Bir turda her silme sorgusu en çok bu kadar yinelenir: birikmiş temizlik turu uzatmaz, kalanı sonraki tura kalır.
export const TEMIZLIK_TUR_SORGUSU = 10;

// Kart #732, karar 743 a: imzasız ikili içerik (Arkon'un 3B ağ dizileri gibi) yalnız modülün kendi şeridinden ortak depoya girer.
// Kişinin yükleme ucu bu türü hiç üretmez (turBul tanımazsa ret); sözleşmedeki DosyaTuru bu yüzden onu içermez.
export const IKILI = 'ikili' as const;
export type SaklananTur = DosyaTuru | typeof IKILI;

export const DOSYA_MIME: Readonly<Record<SaklananTur, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  step: 'model/step',
  stl: 'model/stl',
  iges: 'model/iges',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  dxf: 'image/vnd.dxf',
  mp4: 'video/mp4',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  ikili: 'application/octet-stream',
};

const basliyorMu = (b: Buffer, imza: readonly number[] | string, konum = 0): boolean => {
  const beklenen = typeof imza === 'string' ? Buffer.from(imza, 'latin1') : Buffer.from(imza);
  return b.length >= konum + beklenen.length && b.subarray(konum, konum + beklenen.length).equals(beklenen);
};

// Tür içerikten bulunur: yükleyenin bildirdiği ad ya da MIME tarayıcıda çalışan içerik kaçırabilir.
// İkili STL'nin imzası yoktur; boyutu üçgen sayısıyla tutarsa STL sayılır. ASCII STL "solid" ile başlar; ikili başlık da bu
// sözcükle başlayabildiği için önce boyut kuralına bakılır.
// `kuyruk`: ilk parçada bitmeyen dosyanın son baytları (yükleme şeridi son iki parçayı verir); yalnız zip'in merkez dizini için okunur.
export function turBul(ilk: Buffer, boyut: number, kuyruk?: Buffer): DosyaTuru | null {
  if (basliyorMu(ilk, '%PDF-')) return 'pdf';
  if (basliyorMu(ilk, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (basliyorMu(ilk, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (basliyorMu(ilk, 'RIFF') && basliyorMu(ilk, 'WEBP', 8)) return 'webp';
  if (basliyorMu(ilk, 'ISO-10303-21')) return 'step';
  // ISO taban ortam dosyası: ilk kutu `ftyp`. Yalnız MP4 marka ailesi kabul edilir (MOV ve 3GP dışarıda).
  if (basliyorMu(ilk, 'ftyp', 4) && /^(?:isom|iso[2-9]|mp41|mp42|avc1|dash|M4V )$/.test(ilk.subarray(8, 12).toString('latin1'))) return 'mp4';
  if (basliyorMu(ilk, 'glTF')) return 'glb';
  if (basliyorMu(ilk, 'AutoCAD Binary DXF\r\n\x1a\x00')) return 'dxf';
  if (ilk.length >= 84 && boyut === 84 + 50 * ilk.readUInt32LE(80)) return 'stl';
  // IGES başlangıç bölümü: 80 sütunluk satırın 73. sütunu 'S', ardından sıra numarası 1.
  if (ilk.length >= 80 && ilk[72] === 0x53 && /^ *0*1$/.test(ilk.subarray(73, 80).toString('latin1'))) return 'iges';
  if (/^\s*solid[ \t\r\n]/.test(ilk.subarray(0, 80).toString('latin1'))) return 'stl';
  const bas = ilk.subarray(0, 4096).toString('latin1');
  // ASCII DXF grup kodu 0 ve SECTION ile açılır; önünde 999 yorum satırları olabilir.
  if (/^(?:[ \t]*999\r?\n[^\n]*\n)*[ \t]*0\r?\n[ \t]*SECTION\r?\n/.test(bas)) return 'dxf';
  // glTF JSON'da `asset` zorunlu üst alandır; yalnız JSON olmak yetmez.
  if (/^\uFEFF?\s*\{/.test(ilk.subarray(0, 1024).toString('utf8')) && /"asset"\s*:\s*\{/.test(ilk.toString('utf8'))) return 'gltf';
  if (basliyorMu(ilk, [0x50, 0x4b, 0x03, 0x04])) return ofisTuru(ilk, boyut, kuyruk);
  return metinTuru(ilk, boyut);
}

// Ofis belgeleri (ADR 0030, 9) yalnız Ortak Dosyalar'ın sınırındadır. Modülün kendi şeridi (Arkon) ve ek uçları bu türleri eskisi gibi
// ikili sayar: öteki modüllerin bağ sınırı ve ek davranışı değişmez.
export const YALNIZ_ORTAK_TURLER: ReadonlySet<DosyaTuru> = new Set<DosyaTuru>(['docx', 'xlsx', 'pptx', 'txt', 'csv']);
const eskiTur = (tur: DosyaTuru | null): DosyaTuru | null => (tur === null || YALNIZ_ORTAK_TURLER.has(tur) ? null : tur);
export const seritTuru = (icerik: Buffer): SaklananTur => eskiTur(turBul(icerik, icerik.length)) ?? IKILI;

// OOXML bir zip'tir; tür, zip'teki `[Content_Types].xml` içindeki ana parçanın türünden bulunur. Girdiler zip'in sonundaki merkez
// dizininden okunur: LibreOffice bu dosyayı sona yazar ve boyutu yerel başlıkta vermez (bayrak 3; denendi). Dizin ya da içerik türleri
// eldeki baytlarda (ilk parça, kuyruk) değilse, makro (vbaProject, macroEnabled) bulunursa ya da tür belirsizse dosya tanınmaz.
const ZIP_YEREL = 0x04034b50;
const ZIP_MERKEZ = 0x02014b50;
const ZIP_SON = 0x06054b50;
const ICERIK_TURLERI = '[Content_Types].xml';
const ICERIK_TURLERI_AZAMI = 1024 * 1024;
const MAKRO_PARCASI = /(?:^|\/)vba(?:Project\.bin|Data\.xml)$/i;
const OFIS_ANA_PARCASI: readonly [RegExp, DosyaTuru][] = [
  [/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/, 'docx'],
  [/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml/, 'xlsx'],
  [/application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation\.main\+xml/, 'pptx'],
];

// Dosyadaki [konum, konum + uzunluk) aralığı ilk parçada ya da kuyrukta bütünse döner.
function aralik(ilk: Buffer, boyut: number, kuyruk: Buffer, konum: number, uzunluk: number): Buffer | null {
  if (konum < 0 || uzunluk < 0 || konum + uzunluk > boyut) return null;
  if (konum + uzunluk <= ilk.length) return ilk.subarray(konum, konum + uzunluk);
  const kuyrukBasi = boyut - kuyruk.length;
  if (konum >= kuyrukBasi) return kuyruk.subarray(konum - kuyrukBasi, konum - kuyrukBasi + uzunluk);
  return null;
}

interface ZipGirdisi { ad: string; yontem: number; sikisik: number; yerel: number }

function merkezDizini(ilk: Buffer, boyut: number, kuyruk: Buffer): ZipGirdisi[] | null {
  const kuyrukBasi = boyut - kuyruk.length;
  const enErken = Math.max(0, kuyruk.length - 22 - 0xffff);
  let sonKayit = -1;
  for (let i = kuyruk.length - 22; i >= enErken; i -= 1) {
    if (kuyruk.readUInt32LE(i) === ZIP_SON) { sonKayit = i; break; }
  }
  if (sonKayit < 0) return null;
  const adet = kuyruk.readUInt16LE(sonKayit + 10);
  const dizinBoyu = kuyruk.readUInt32LE(sonKayit + 12);
  const dizinBasi = kuyruk.readUInt32LE(sonKayit + 16);
  // ZIP64 (4 GB üstü) bu sınırda (200 MB) olmaz; işaretli değer tanınmaz.
  if (dizinBasi === 0xffffffff || dizinBasi + dizinBoyu > kuyrukBasi + sonKayit) return null;
  const dizin = aralik(ilk, boyut, kuyruk, dizinBasi, dizinBoyu);
  if (dizin === null) return null;
  const girdiler: ZipGirdisi[] = [];
  let k = 0;
  while (girdiler.length < adet) {
    if (k + 46 > dizin.length || dizin.readUInt32LE(k) !== ZIP_MERKEZ) return null;
    const adUzunlugu = dizin.readUInt16LE(k + 28);
    const sonrakine = 46 + adUzunlugu + dizin.readUInt16LE(k + 30) + dizin.readUInt16LE(k + 32);
    if (k + sonrakine > dizin.length) return null;
    girdiler.push({
      ad: dizin.subarray(k + 46, k + 46 + adUzunlugu).toString('utf8'),
      yontem: dizin.readUInt16LE(k + 10), sikisik: dizin.readUInt32LE(k + 20), yerel: dizin.readUInt32LE(k + 42),
    });
    k += sonrakine;
  }
  return girdiler;
}

function ofisTuru(ilk: Buffer, boyut: number, kuyruk: Buffer = ilk.subarray(0, boyut)): DosyaTuru | null {
  const girdiler = merkezDizini(ilk, boyut, kuyruk);
  if (girdiler === null || girdiler.some((g) => MAKRO_PARCASI.test(g.ad))) return null;
  const girdi = girdiler.find((g) => g.ad === ICERIK_TURLERI);
  if (girdi === undefined) return null;
  const baslik = aralik(ilk, boyut, kuyruk, girdi.yerel, 30);
  if (baslik === null || baslik.readUInt32LE(0) !== ZIP_YEREL) return null;
  const veriBasi = girdi.yerel + 30 + baslik.readUInt16LE(26) + baslik.readUInt16LE(28);
  const veri = aralik(ilk, boyut, kuyruk, veriBasi, girdi.sikisik);
  const turler = veri === null ? null : icerikTurleriniAc(veri, girdi.yontem);
  if (turler === null || /macroEnabled|vbaProject/i.test(turler)) return null;
  const bulunan = OFIS_ANA_PARCASI.filter(([desen]) => desen.test(turler)).map(([, tur]) => tur);
  return bulunan.length === 1 ? bulunan[0] ?? null : null;
}

function icerikTurleriniAc(veri: Buffer, yontem: number): string | null {
  try {
    if (yontem === 0) return veri.subarray(0, ICERIK_TURLERI_AZAMI).toString('utf8');
    if (yontem === 8) return inflateRawSync(veri, { maxOutputLength: ICERIK_TURLERI_AZAMI }).toString('utf8');
  } catch {
    return null;
  }
  return null;
}

// Düz metin ve csv: imza yoktur. Denetim karakteri (sekme, satır sonu dışında) bulunmayan içerik metindir; UTF-8 ya da Türkçe
// Windows kod sayfası olabilir (Excel'in csv'si; VARSAYIM). İşaretleme (`<` ile başlayan: HTML, SVG, XML) ve betik (`#!`) metin sayılmaz.
// Uzantının içerikle uyuşması bağlayan modülün işidir (Ortak Dosyalar: `.bat` adlı metin reddedilir).
const METIN_ORNEGI = 64 * 1024;
const METIN_YUKSEK_ORANI = 0.2;
const AYIRICILAR = [';', ',', '\t'] as const;

// Örnek dosyanın ortasında kesilebilir: sondaki yarım karakter hata sayılmaz (stream).
const utf8Mi = (b: Buffer): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b, { stream: true });
    return true;
  } catch {
    return false;
  }
};

function metinTuru(ilk: Buffer, boyut: number): 'txt' | 'csv' | null {
  if (boyut === 0 || ilk.length === 0) return null;
  const ornek = ilk.subarray(0, METIN_ORNEGI);
  let yuksek = 0;
  for (const b of ornek) {
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) return null;
    if (b >= 0x80) yuksek += 1;
  }
  // Geçerli UTF-8 metindir. Değilse (Türkçe Windows kod sayfası) ASCII dışı bayt az olmalıdır; ikili içerikte yarıya yakındır. Sınır VARSAYIM.
  if (!utf8Mi(ornek) && yuksek > ornek.length * METIN_YUKSEK_ORANI) return null;
  const yazi = ornek.toString('latin1').replace(/^\xEF\xBB\xBF/, '');
  const bas = yazi.trimStart();
  if (bas.startsWith('<') || bas.startsWith('#!')) return null;
  return csvMi(yazi, ornek.length < boyut) ? 'csv' : 'txt';
}

// En az iki dolu satırda aynı ayırıcı, her satırda aynı sayıda (en az bir) geçiyorsa csv'dir. Örnek dosyanın tamamı değilse son satır
// yarım olabilir, sayılmaz. Tırnak içindeki ayırıcı ayrılmaz (VARSAYIM: sezgi; yanlış ayrım yalnız türü txt yapar, dosya yine kabul edilir).
function csvMi(yazi: string, yarim: boolean): boolean {
  const satirlar = yazi.split(/\r?\n/);
  if (yarim) satirlar.pop();
  const dolu = satirlar.filter((s) => s.trim() !== '').slice(0, 10);
  if (dolu.length < 2) return false;
  return AYIRICILAR.some((a) => {
    const sayilar = dolu.map((s) => s.split(a).length - 1);
    return sayilar[0] !== undefined && sayilar[0] > 0 && sayilar.every((n) => n === sayilar[0]);
  });
}

// İçeriği base64 JSON ile taşıyan ek uçları (Denetim Hazırlığı; Mesaj ve Portal da aynı kalıptadır) için tür. Yükleyenin bildirdiği
// tür HTML ya da SVG olabilir ve tarayıcıda Blob olarak açılınca betik çalıştırır; tür içerikten bulunur, tanınmayan içerik indirilir.
export function ekMime(icerik: Buffer): string {
  return DOSYA_MIME[seritTuru(icerik)];
}

export type KotaReddi = 'kotaYukleme' | 'kotaBayt' | 'kotaBagsiz' | 'kotaDepo';
// kisiAdet: kişinin açık yükleme sayısı (zaten açık bir yüklemeye devam ediyorsa 0 verilir); kisiBagsizBayt: kişinin yükleyip
// bağlamadığı dosyaların toplamı; yeniBayt: bu parçanın ekleyeceği bayt.
export function kotaHatasi(
  d: { kisiAdet: number; kisiBayt: number; kisiBagsizBayt: number; depoBayt: number; yeniBayt: number }, sinir: DosyaSiniri = DOSYA_SINIRI,
): KotaReddi | null {
  if (d.kisiAdet >= sinir.kisiAcikYukleme) return 'kotaYukleme';
  if (d.kisiBayt + d.yeniBayt > sinir.kisiAcikBayt) return 'kotaBayt';
  if (d.kisiBagsizBayt + d.yeniBayt > sinir.kisiBagsizBayt) return 'kotaBagsiz';
  if (d.depoBayt + d.yeniBayt > sinir.depoBayt) return 'kotaDepo';
  return null;
}

// Bağlayan modülün sınırı: hangi türler, en çok kaç bayt.
export interface BagSiniri<T extends SaklananTur = SaklananTur> {
  turler: readonly T[];
  azamiBayt: number;
}

export function bagReddi(dosya: { tur: SaklananTur; boyut: number }, sinir: BagSiniri): 'turIzinsiz' | 'dosyaBuyuk' | null {
  if (!sinir.turler.includes(dosya.tur)) return 'turIzinsiz';
  if (dosya.boyut > sinir.azamiBayt) return 'dosyaBuyuk';
  return null;
}

// Tutamağın modül adı bir klasör adıdır: küçük harf, rakam, tek tire. Göreli yol (`..`, `/`) bu biçime girmez.
export const modulAdiBicimli = (ad: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ad);
