import { AZAMI_DOSYA } from '#paylasilan/sozlesme/dosya.ts';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';

export const ILETILER = {
  ozetTutmuyor: 'Dosya içeriği özetle uyuşmuyor; yükleme baştan yapılmalı.',
  parcaUyusmuyor: 'Parça sayısı önceki parçalarla uyuşmuyor.',
  turYok: 'Dosya türü desteklenmiyor (PDF, PNG, JPEG, WEBP, STEP, STL, IGES, GLB, GLTF, DXF).',
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
// Tek silme sorgusu en çok bu kadar sahipsiz dosya ve bayat şerit siler: büyük dosyalarda da sorgu süre sınırına sığsın.
export const TEMIZLIK_SINIRI = { dosya: 2, serit: 10 } as const;
// Bir turda her silme sorgusu en çok bu kadar yinelenir: birikmiş temizlik turu uzatmaz, kalanı sonraki tura kalır.
export const TEMIZLIK_TUR_SORGUSU = 10;

export const DOSYA_MIME: Readonly<Record<DosyaTuru, string>> = {
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
};

const basliyorMu = (b: Buffer, imza: readonly number[] | string, konum = 0): boolean => {
  const beklenen = typeof imza === 'string' ? Buffer.from(imza, 'latin1') : Buffer.from(imza);
  return b.length >= konum + beklenen.length && b.subarray(konum, konum + beklenen.length).equals(beklenen);
};

// Tür içerikten bulunur: yükleyenin bildirdiği ad ya da MIME tarayıcıda çalışan içerik kaçırabilir.
// İkili STL'nin imzası yoktur; boyutu üçgen sayısıyla tutarsa STL sayılır. ASCII STL "solid" ile başlar; ikili başlık da bu
// sözcükle başlayabildiği için önce boyut kuralına bakılır.
export function turBul(ilk: Buffer, boyut: number): DosyaTuru | null {
  if (basliyorMu(ilk, '%PDF-')) return 'pdf';
  if (basliyorMu(ilk, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (basliyorMu(ilk, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (basliyorMu(ilk, 'RIFF') && basliyorMu(ilk, 'WEBP', 8)) return 'webp';
  if (basliyorMu(ilk, 'ISO-10303-21')) return 'step';
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
  return null;
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
export interface BagSiniri {
  turler: readonly DosyaTuru[];
  azamiBayt: number;
}

export function bagReddi(dosya: { tur: DosyaTuru; boyut: number }, sinir: BagSiniri): 'turIzinsiz' | 'dosyaBuyuk' | null {
  if (!sinir.turler.includes(dosya.tur)) return 'turIzinsiz';
  if (dosya.boyut > sinir.azamiBayt) return 'dosyaBuyuk';
  return null;
}

// Tutamağın modül adı bir klasör adıdır: küçük harf, rakam, tek tire. Göreli yol (`..`, `/`) bu biçime girmez.
export const modulAdiBicimli = (ad: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ad);
