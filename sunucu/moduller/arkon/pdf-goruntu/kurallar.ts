// Sunucunun PDF sayfa görüntüsü (ADR 0032, kart 2339-S): sınırlar, hangi görüntülerin hazırlanacağı ve imzaları. Saf kurallar.
import { z } from 'zod';
import { gorunus, renkImzasi, type RenkAyari, type Rgb } from '#paylasilan/pdf-renk.ts';

export const IS_SURE_SINIRI_MS = 90_000;
export const SUREC_BELLEK_ESIGI_BAYT = 1536 * 1024 * 1024;
export const PDF_AZAMI_BAYT = 100 * 1024 * 1024;
// Bir zamanlayıcı turunda en çok bu kadar kaynak işlenir: sunucu PDF yağmurunda bile ötekilere zaman bırakır.
export const TUR_BASINA_KAYNAK = 2;
// Tabletin ekrana sığdırdığı görüntü (lo). Tablet kendi genişliğine göre 1200 px'ten başlayarak çizer; 1600 px tipik 1280 px ekranı (dpr 1,25) karşılar.
export const LO_GENISLIK = 1600;
// Okuma ayarındaki çözünürlük (istemci/src/ortak/cizim/kurallar.ts OKUMA_VARSAYILANI.res) ve sayfa ölçeği üst sınırı (pdf.ts pdfCiz).
export const VARSAYILAN_RES = 4200;
export const AZAMI_OLCEK = 8;
// Paket ayarındaki çözünürlük güvenilmeyen girdidir: çok büyük değer sürecin tuvalini ve belleğini şişirmesin. Görüntü tablette sayfa
// kutusuna ölçeklenir; daha büyük ayarda yalnız yakınlaşma netliği bu sınırda kalır.
export const AZAMI_RES = 8000;

// Tablet mürekkep rengini o anki tasarım değişkeninden okur (pdf.ts degiskenRengi). Burada iki tema için aynı değerler durur
// (istemci/src/ortak/tasarim/tokens.css [data-theme="light"] ve :root/[data-theme="dark"]; tasarım değişkeni değişirse burası da değişir). Değer tutmazsa
// imza tutmaz, tablet görüntüyü kendisi üretir: yanlış renk gösterilmez.
export const TEMA_RENKLERI: Readonly<Record<'light' | 'dark', { ink: Rgb; bp: Rgb }>> = {
  light: { ink: [0x14, 0x17, 0x1c], bp: [0x12, 0x30, 0x5e] },
  dark: { ink: [0xf2, 0xf4, 0xf7], bp: [0xcf, 0xe3, 0xff] },
};

export const ILETILER = {
  sureAsimi: `Görüntü ${String(IS_SURE_SINIRI_MS / 1000)} saniyede hazırlanamadı.`,
  surecDustu: 'Görüntü süreci beklenmedik biçimde kapandı.',
  okunamadi: 'PDF görüntüye çevrilemedi.',
  pdfDegil: 'Dosya PDF değil.',
  cokBuyuk: `PDF ${String(PDF_AZAMI_BAYT / 1024 / 1024)} MB'tan büyük.`,
  sayfaYok: 'PDF\'te bu sayfa yok.',
  telefon: 'Çizim görüntüsü telefonda açılmaz.',
} as const;

// Paket belgesinin okuma ayarından görüntüyü belirleyen alanlar (tabletin cfgOf'u ayarDuzelt ile aynı varsayılanları kullanır).
export interface GoruntuAyari { res: number; look: RenkAyari['look']; bold: number }
export function goruntuAyari(readCfg: unknown): GoruntuAyari {
  const c = readCfg !== null && typeof readCfg === 'object' ? readCfg as Record<string, unknown> : {};
  const res = typeof c['res'] === 'number' && Number.isFinite(c['res']) && c['res'] > 0 ? Math.min(AZAMI_RES, c['res']) : VARSAYILAN_RES;
  const bold = c['bold'] != null && Number.isFinite(+(c['bold'] as number)) ? +(c['bold'] as number) : 1;
  return { res, look: gorunus(c['look']), bold };
}

export interface GoruntuIsi { imza: string; ayar: RenkAyari }
// Bir kaynak için hazırlanan görüntüler: iki tema x (ekrana sığan, yakınlaşma).
export function goruntuIsleri(a: GoruntuAyari): GoruntuIsi[] {
  const isler: GoruntuIsi[] = [];
  for (const tema of ['light', 'dark'] as const) {
    const renk = a.look === 'blue' ? TEMA_RENKLERI[tema].bp : TEMA_RENKLERI[tema].ink;
    for (const lo of [true, false]) {
      const ayar: RenkAyari = { koyu: tema === 'dark', look: a.look, bold: a.bold, lo, renk };
      isler.push({ imza: renkImzasi(ayar), ayar });
    }
  }
  return isler;
}

// pdf.js sayfa ölçeği: tabletteki pdfCiz ile aynı formül (yakınlaşma görüntüsü tabletin sayfa kaydıyla aynı boyda olsun).
export const sayfaOlcegi = (enBuyukKenar: number, res: number): number => Math.min(AZAMI_OLCEK, res / enBuyukKenar);
export const loOlcegi = (sayfaGenisligi: number): number => LO_GENISLIK / sayfaGenisligi;

export function pdfBasligiVar(veri: Uint8Array): boolean {
  // Başlık ilk 1024 baytta herhangi bir yerde olabilir (PDF 1.7, 7.5.2).
  const bas = Buffer.from(veri.subarray(0, 1024)).toString('latin1');
  return bas.includes('%PDF-');
}

export const IMZA_DESENI = /^r\d+\.[ak]\.(net|blue|orig)\.b[0-9.]{1,6}\.(lo|hi)\.[0-9a-f]{6}$/;
export const goruntuSorgusu = z.object({
  imza: z.string().regex(IMZA_DESENI),
  sayfa: z.coerce.number().int().min(1).max(9999).default(1),
});
