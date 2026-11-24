import { ilkMetin, ilkSayi, ISO_TARIH, kayitNumarasi, sayfaAyikla, tamSayi } from './kurallar.ts';
import type { Sayfa } from './kurallar.ts';

// 3675: Logo fatura başlığı ve cari hareket okuması (yalnız GET) için köprü sözleşmesi. DOĞRULANMADI: yardımcının bu uçları ve alan adları
// henüz yok ya da ölçülmedi; aşağıdaki yollar ve JSON adları önerilen sözleşmedir. Yardımcı ucu belli olunca değişiklik yalnız bu dosyada kalır
// (yol, alan adı, ayıklama); sunucu işi, ayna ve testler buradaki tiplere dayanır. C# yardımcısı bu kartta yazılmadı.

export const FATURA_TURLERI = ['satis', 'alis', 'satis-iade', 'alis-iade'] as const;
export type FaturaTuru = (typeof FATURA_TURLERI)[number];

export const FATURA_LISTESI_YOLU = '/api/Invoice/list';
export const CARI_HAREKET_YOLU = '/api/Arp/movements';

// Önceki dönem (Risk N4): `period` verilirse yardımcı o dönemin tablosunu okur; verilmezse açık dönemi.
const donemEki = (donem: number | null): string => (donem === null ? '' : `&period=${donem}`);
export const faturaListesiYolu = (tur: FaturaTuru, since: number, from: string, donem: number | null = null): string =>
  `${FATURA_LISTESI_YOLU}?type=${tur}&since=${since}&from=${encodeURIComponent(from)}${donemEki(donem)}`;
export const cariHareketYolu = (since: number, from: string): string => `${CARI_HAREKET_YOLU}?since=${since}&from=${encodeURIComponent(from)}`;
// Sonradan değişen faturalar (iptal dahil; Risk N3): değişme zamanından (ISO) sonra değişenler, (modifiedAt, logicalRef) sırasıyla; her kayıt kendi türünü taşır.
// SÖZLEŞME ŞARTI (doğrulanmadı; yardımcıdan istenir): değişen faturalar ucu yalnız istenen dönemin kayıtlarını verir; cevabın `period` alanı o dönemdir. Açık dönem numarasıyla
// önceki dönemin kaydı dönerse (firma, dönem, kayıt no) anahtarı başka bir faturanın üstüne yazılırdı. Uç dönem taşımadığı için yalnız açık dönem izlenir; önceki dönemde sonradan iptal edilen fatura okunmaz.
export const FATURA_DEGISEN_YOLU = '/api/Invoice/changed';
export const faturaDegisenYolu = (sonra: string, since: number, from: string): string =>
  `${FATURA_DEGISEN_YOLU}?after=${encodeURIComponent(sonra)}&since=${since}&from=${encodeURIComponent(from)}`;

export interface FaturaBasligi {
  logoKayitNo: number;
  // Yalnız değişen faturalar uçunda gelir (`type`, `modifiedAt`); liste ucunda tür istekten bilinir.
  tur: FaturaTuru | null;
  degisme: string | null;
  faturaNo: string;
  tarih: string;
  cariKodu: string | null;
  dovizTuru: number | null;
  net: string;
  kdv: string;
  brut: string;
  iptal: boolean;
}
export interface CariHareketi {
  logoKayitNo: number;
  cariKodu: string;
  tarih: string;
  tur: string | null;
  belgeNo: string | null;
  borc: string;
  alacak: string;
  dovizTuru: number | null;
}
// Kayıt numarası dönem tablosunundur: firma ya da dönem yoksa sayfa okunmamış sayılır (diğer okumalarla aynı kural).
export interface FaturaSayfasi extends Sayfa<FaturaBasligi> { firma: number; donem: number }
export interface CariHareketSayfasi extends Sayfa<CariHareketi> { firma: number; donem: number }

const parasal = (n: number | null): string | null => (n === null ? null : String(n));

function faturaAyikla(o: Record<string, unknown>): FaturaBasligi | null {
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const faturaNo = ilkMetin(o, ['invoiceNo'], 40);
  const tarih = ilkMetin(o, ['date'], 10);
  const net = parasal(ilkSayi(o, ['netAmount']));
  const kdv = parasal(ilkSayi(o, ['vatAmount']));
  const brut = parasal(ilkSayi(o, ['grossAmount']));
  if (logoKayitNo === null || faturaNo === null || tarih === null || !ISO_TARIH.test(tarih) || net === null || kdv === null || brut === null) return null;
  const doviz = tamSayi(ilkSayi(o, ['currencyType']));
  const t = ilkMetin(o, ['type'], 20);
  const degisme = ilkMetin(o, ['modifiedAt'], 40);
  return { logoKayitNo, tur: (FATURA_TURLERI as readonly string[]).includes(t ?? '') ? (t as FaturaTuru) : null, degisme, faturaNo, tarih, cariKodu: ilkMetin(o, ['arpCode'], 64), dovizTuru: doviz !== null && doviz > 0 ? doviz : null, net, kdv, brut, iptal: o['cancelled'] === true };
}

function cariHareketAyikla(o: Record<string, unknown>): CariHareketi | null {
  const logoKayitNo = kayitNumarasi(o, ['logicalRef']);
  const cariKodu = ilkMetin(o, ['arpCode'], 64);
  const tarih = ilkMetin(o, ['date'], 10);
  const borc = ilkSayi(o, ['debit']) ?? 0;
  const alacak = ilkSayi(o, ['credit']) ?? 0;
  if (logoKayitNo === null || cariKodu === null || tarih === null || !ISO_TARIH.test(tarih) || borc < 0 || alacak < 0) return null;
  const doviz = tamSayi(ilkSayi(o, ['currencyType']));
  return {
    logoKayitNo, cariKodu, tarih, tur: ilkMetin(o, ['kind'], 40), belgeNo: ilkMetin(o, ['documentNo'], 40),
    borc: String(borc), alacak: String(alacak), dovizTuru: doviz !== null && doviz > 0 ? doviz : null,
  };
}

// Ayıklanamayan tek satır bile sayfayı okunmamış sayar (Risk N2): satır sessizce atlanıp imleç üstünden geçmez; sonuç "belirsiz" olur,
// akış günlüğünde görünür ve imleç aynı yerde kalır (yardımcı düzelene kadar bekleme süresiyle yinelenir).
function donemli<T>(govde: unknown, satir: (o: Record<string, unknown>) => T | null): (Sayfa<T> & { firma: number; donem: number }) | null {
  if (govde === null || typeof govde !== 'object' || Array.isArray(govde)) return null;
  const g = govde as Record<string, unknown>;
  const ham = g['data'];
  if (!Array.isArray(ham)) return null;
  const sayfa = sayfaAyikla(govde, satir);
  if (sayfa === null || sayfa.kayitlar.length !== ham.length) return null;
  const firma = g['firm'];
  const donem = g['period'];
  if (!(typeof firma === 'number' && Number.isSafeInteger(firma) && firma > 0 && typeof donem === 'number' && Number.isSafeInteger(donem) && donem > 0)) return null;
  return { ...sayfa, firma, donem };
}

// Cevap { firm, period, data: [...], next } biçimindedir (Material/purchases ile aynı); biçim bozuksa null (imleç ilerlemez, satır yazılmaz).
export const faturaSayfasiniAyikla = (govde: unknown): FaturaSayfasi | null => donemli(govde, faturaAyikla);
// Değişen faturalarda tür ve ISO değişme zamanı zorunludur (yoksa ya da ayrıştırılamazsa sayfa okunmamış sayılır; imleç NaN ile kalıp aynı sayfayı yinelemesin, Risk N3).
const ISO_ZAMAN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
export const faturaDegisenSayfasiniAyikla = (govde: unknown): FaturaSayfasi | null => donemli(govde, (o) => {
  const f = faturaAyikla(o);
  return f !== null && f.tur !== null && f.degisme !== null && ISO_ZAMAN.test(f.degisme) && !Number.isNaN(Date.parse(f.degisme)) ? f : null;
});
export const cariHareketSayfasiniAyikla = (govde: unknown): CariHareketSayfasi | null => donemli(govde, cariHareketAyikla);

// Okuma sırası: son sayfa doluysa hemen devam, değilse en çok saatte bir; ilk gün son 12 ay başındandır.
export const FATURA_CARI_ARALIGI_MS = 60 * 60 * 1000;
export function faturaCariOkunmaliMi(imlec: { dolu: boolean; sonOkuma: Date } | null, simdi: Date, zorlaAni: Date | null = null): boolean {
  if (zorlaAni !== null && imlec !== null && imlec.sonOkuma.getTime() < zorlaAni.getTime()) return true;
  return imlec === null || imlec.dolu || simdi.getTime() - imlec.sonOkuma.getTime() >= FATURA_CARI_ARALIGI_MS;
}
export const faturaCariBaslangicGunu = (simdi: Date): string => {
  const d = new Date(Date.UTC(simdi.getUTCFullYear() - 1, simdi.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
};

export type FaturaCariAkisi = `fatura-${FaturaTuru}` | 'fatura-degisen' | 'cari-hareket';
// Önceki dönem, yeni dönemin imleci açıldıktan sonra bu kadar gün daha okunur (geç girilen faturalar).
export const FATURA_ONCEKI_DONEM_GUNU = 90;
