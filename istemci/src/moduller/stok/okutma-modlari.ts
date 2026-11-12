import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Okut modları (1912): mod okutmanın ne yapacağını söyler; panelin geri kalanı moda göre değişir. Otomatik bugünkü davranıştır.
// Say ve Topla mevcut sayfaların motorunu panelde çalıştırır; sayfalar kalır. Mod cihazda kalır (1912 varsayımı): her açılışta
// son mod gelir ve üstte yazar ki yanlış modda okutulmasın. Mod yalnız işlemi olana görünür.
export type OkutModu = 'otomatik' | 'bilgi' | 'seri' | 'tasi' | 'yerlestir' | 'say' | 'topla' | 'al';
export interface ModTanimi {
  mod: OkutModu;
  // Komut kartındaki barkod: CMD:MOD:<komut>.
  komut: string;
  ad: string;
  simge: SimgeAdi;
  aciklama: string;
  adimlar: readonly string[];
  // Biri yeter; null herkesin.
  islemler: readonly string[] | null;
}

export const OKUT_MODLARI: readonly ModTanimi[] = [
  { mod: 'otomatik', komut: 'OTOMATIK', ad: 'Otomatik', simge: 'bolt', aciklama: 'Okuttuğunu sepete alır, sonra nereye bırakacağını sorar.', adimlar: ['Herhangi bir etiket'], islemler: null },
  { mod: 'bilgi', komut: 'BILGI', ad: 'Bilgi', simge: 'eye', aciklama: 'Yalnız okur: ne olduğu, nerede ve ne kadar. Hiçbir şey yazılmaz.', adimlar: ['Herhangi bir etiket'], islemler: null },
  { mod: 'seri', komut: 'SERI', ad: 'Seri', simge: 'list', aciklama: 'Art arda okut, seçim sorulmaz; liste hesabına kaydedilir, stok değişmez. Bilgisayarda Seri listeler\'den devam edilir.', adimlar: ['Etiketler art arda', 'Bilgisayarda karar'], islemler: ['stok.istek'] },
  { mod: 'tasi', komut: 'TASI', ad: 'Taşı', simge: 'cart', aciklama: 'Önce malzemeler sepete, sonra bırakılacak yer ya da kişi.', adimlar: ['Malzeme / lot', 'Hedef yer'], islemler: ['stok.transfer'] },
  { mod: 'yerlestir', komut: 'YERLESTIR', ad: 'Yerleştir', simge: 'target', aciklama: 'Önce göz, sonra o göze konanlar (mal kabulden rafa). Kaydet her satırı kayıtlı tek yerinden göze taşır.', adimlar: ['Göz', 'Malzeme / lot', 'Kaydet'], islemler: ['stok.transfer'] },
  { mod: 'say', komut: 'SAY', ad: 'Say', simge: 'clipboard-check', aciklama: 'Önce göz, sonra gözdeki lotlar; her okutma bir sayılır.', adimlar: ['Göz', 'Lot / malzeme', 'Kaydet'], islemler: ['stok.sayim'] },
  { mod: 'topla', komut: 'TOPLA', ad: 'Topla', simge: 'truck', aciklama: 'Açık hazırlık listesinin sıradaki adımı: göz, lot, Toplandı.', adimlar: ['Göz', 'Lot', 'Toplandı'], islemler: ['stok.toplama'] },
  { mod: 'al', komut: 'AL', ad: 'Al', simge: 'download', aciklama: 'Başka istasyondaki malzemeyi al: malzeme, sonra aldığın istasyon. Kaynak taraf bildirim alır.', adimlar: ['Malzeme / lot', 'Aldığın yer', 'Kaydet'], islemler: ['stok.istek'] },
];

export const modTanimi = (m: OkutModu): ModTanimi => OKUT_MODLARI.find((x) => x.mod === m)!;
export const izinliModlar = (islemVar: (islem: string) => boolean): ModTanimi[] =>
  OKUT_MODLARI.filter((m) => m.islemler === null || m.islemler.some(islemVar));
export const komuttanMod = (komut: string): ModTanimi | null => OKUT_MODLARI.find((m) => m.komut === komut) ?? null;

const ANAHTAR = 'tmiv2.okut-modu';
export function kayitliMod(): OkutModu {
  try {
    const m = localStorage.getItem(ANAHTAR);
    return OKUT_MODLARI.some((x) => x.mod === m) ? (m as OkutModu) : 'otomatik';
  } catch { return 'otomatik'; }
}
export function moduKaydet(m: OkutModu): void {
  try { localStorage.setItem(ANAHTAR, m); } catch { /* depolama kapalı: mod bu açılışta kalır */ }
}

// Kayıtlı mod artık izinli değilse (yetki alındı) Otomatik açılır.
export const acilisModu = (kayitli: OkutModu, izinli: readonly ModTanimi[]): OkutModu =>
  (izinli.some((m) => m.mod === kayitli) ? kayitli : 'otomatik');
