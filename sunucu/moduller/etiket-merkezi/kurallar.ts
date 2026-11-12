import qrcode from 'qrcode-generator';
import { adresAraliktaMi, adresCoz, type AgAraligi } from '#paylasilan/ag-araligi.ts';
import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { KaliteDurumu } from '#paylasilan/sozlesme/stok.ts';
import type { Bekleyen, Koli } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import type { HataliKaydiOzeti, RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EN_COK_ADET, QR_KENAR_MODUL, SATIR_ARALIGI, type KayitTuru, type OnizlemeOgesi, type OzelOlcu, type Sablon, type SablonTuru, type SablonOgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { REFAKAT_KOPYA_SAYISI } from '#paylasilan/etiket-sabitleri.ts';
import { simgeCoz } from '#paylasilan/etiket-piktogramlari.ts';
import { KALIN_GENIS, NORMAL_GENIS, OLCULEN_HARFLER } from './harf-genislikleri.ts';
import { YAZICI_AGI_DEGISKENI } from './ag.ts';

// Saf kurallar: yerleşim (mm -> satır ve QR matrisi), sınır denetimi ve yazıcıya giden metnin arındırılması.
// Kural numaraları KURAL-TEST.md'deki testlere bağlıdır.

export type AlanDegerleri = Readonly<Record<string, string | null>>;

// EM-1: öğe etiketin dışına taşmaz; taşan şablon basılmaz.
export function sablonHatalari(s: Sablon): string[] {
  const hatalar: string[] = [];
  if (s.genislik <= 0 || s.yukseklik <= 0) hatalar.push('Etiket ölçüsü sıfırdan büyük olmalı.');
  s.ogeler.forEach((o, i) => {
    const [gen, yuk] = o.tur === 'qr' || o.tur === 'simge' ? [o.boyut, o.boyut] : [o.genislik, o.yukseklik];
    if (o.x + gen > s.genislik + 1e-9 || o.y + yuk > s.yukseklik + 1e-9) hatalar.push(`${i + 1}. öğe etiketin dışına taşıyor.`);
    if (o.tur === 'metin' && o.yaziMm > o.yukseklik + 1e-9) hatalar.push(`${i + 1}. öğenin yazısı kutusundan büyük.`);
  });
  return hatalar;
}

// EM-37: standart dışı rulo. Tasarım girilen ölçüye en ve boydan küçük kalan oranla (orantılı) ölçeklenir ve ortalanır; QR kare,
// yerleşim aynı kalır, artan kenar boş kalır.
const yuvarla = (v: number) => Math.round(v * 1e4) / 1e4;
export function olcekle(s: Sablon, olcu: OzelOlcu): { sablon: Sablon; olcek: number } {
  const olcek = Math.min(olcu.genislik / s.genislik, olcu.yukseklik / s.yukseklik);
  const dx = (olcu.genislik - s.genislik * olcek) / 2;
  const dy = (olcu.yukseklik - s.yukseklik * olcek) / 2;
  const x = (v: number) => yuvarla(dx + v * olcek);
  const y = (v: number) => yuvarla(dy + v * olcek);
  const o = (v: number) => Math.floor(v * olcek * 1e4) / 1e4;
  const ogeler = s.ogeler.map((g): SablonOgesi => {
    if (g.tur === 'qr' || g.tur === 'simge') return { ...g, x: x(g.x), y: y(g.y), boyut: o(g.boyut) };
    if (g.tur === 'metin') return { ...g, x: x(g.x), y: y(g.y), genislik: o(g.genislik), yukseklik: o(g.yukseklik), yaziMm: o(g.yaziMm) };
    // Kalınlık da aynı oranla küçülür (dolu kutu dolu kalır); yazıcı dili çizgiyi en az bir noktayla basar.
    return { ...g, x: x(g.x), y: y(g.y), genislik: o(g.genislik), yukseklik: o(g.yukseklik), kalinlik: o(g.kalinlik) };
  });
  return { sablon: { ...s, genislik: olcu.genislik, yukseklik: olcu.yukseklik, ogeler }, olcek };
}

// EM-38: okunurluk. QR karesi (modül) ve en küçük yazı ölçekle küçülür. Sınırın altı basılmaz (yazıcı 203 dpi'de bir kareyi iki
// noktadan az basar, tarayıcı okumaz); uyarı aralığında basılır, okutup denemesi söylenir. Eşikler denemeyle değişebilir.
export const QR_KARE_EN_AZ_MM = 0.25;
export const QR_KARE_UYARI_MM = 0.38;
export const YAZI_EN_AZ_MM = 1;
export const YAZI_UYARI_MM = 1.5;
const sayiYaz = (v: number) => String(Math.floor(v * 100) / 100).replace('.', ',');
export const qrKaresi = (o: Extract<OnizlemeOgesi, { tur: 'qr' }>): number => o.boyut / (o.kareler.length + 2 * QR_KENAR_MODUL);
const enKucukYazi = (s: Sablon): number | null => {
  const yazilar = s.ogeler.flatMap((g) => (g.tur === 'metin' ? [g.yaziMm] : []));
  return yazilar.length === 0 ? null : Math.min(...yazilar);
};
const enKucukKare = (ogeler: readonly OnizlemeOgesi[]): number | null => {
  const kareler = ogeler.flatMap((g) => (g.tur === 'qr' ? [qrKaresi(g)] : []));
  return kareler.length === 0 ? null : Math.min(...kareler);
};
// Tasarım ölçüsündeki yerleşimden: QR karesi ve yazı ölçekle doğru orantılıdır; en küçük ölçü yukarı yuvarlanır.
export function enKucukOlcu(tasarim: Sablon, tasarimOgeleri: readonly OnizlemeOgesi[]): { genislik: number; yukseklik: number } {
  const kare = enKucukKare(tasarimOgeleri);
  const yazi = enKucukYazi(tasarim);
  const oran = Math.max(kare === null ? 0 : QR_KARE_EN_AZ_MM / kare, yazi === null ? 0 : YAZI_EN_AZ_MM / yazi) * 1.02;
  return { genislik: Math.max(10, Math.ceil(tasarim.genislik * oran)), yukseklik: Math.max(10, Math.ceil(tasarim.yukseklik * oran)) };
}
export function okunurluk(olcekli: Sablon, ogeler: readonly OnizlemeOgesi[], enKucuk: { genislik: number; yukseklik: number }): { engel: string | null; uyarilar: string[] } {
  const kare = enKucukKare(ogeler);
  const yazi = enKucukYazi(olcekli);
  const sinir = `Bu etiket için en küçük ölçü ${enKucuk.genislik}x${enKucuk.yukseklik} mm.`;
  if (kare !== null && kare < QR_KARE_EN_AZ_MM - 1e-9) return { engel: `Bu ölçüde QR okunmaz (kare ${sayiYaz(kare)} mm, en az ${sayiYaz(QR_KARE_EN_AZ_MM)} mm). ${sinir}`, uyarilar: [] };
  if (yazi !== null && yazi < YAZI_EN_AZ_MM - 1e-9) return { engel: `Bu ölçüde yazı okunmaz (${sayiYaz(yazi)} mm, en az ${sayiYaz(YAZI_EN_AZ_MM)} mm). ${sinir}`, uyarilar: [] };
  const uyarilar: string[] = [];
  if (kare !== null && kare < QR_KARE_UYARI_MM) uyarilar.push(`QR küçük (kare ${sayiYaz(kare)} mm): ilk etiketi basıp okutarak deneyin.`);
  if (yazi !== null && yazi < YAZI_UYARI_MM) uyarilar.push(`En küçük yazı ${sayiYaz(yazi)} mm: yakından okunur.`);
  return { engel: null, uyarilar };
}

// EM-2: milimetre yazıcı noktasına en yakın tam noktaya yuvarlanır (203 dpi'de 1 mm = 8 nokta).
export const noktaya = (mm: number, dpi: number): number => Math.round((mm * dpi) / 25.4);

// EM-3: yazıcının yerleşik yazı tipinde Türkçe harf olmayabilir; sadeleştirme harfi en yakın ASCII harfe çevirir.
const SADE: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
export const sadelestir = (metin: string): string => metin.replace(/[çÇğĞıİöÖşŞüÜ]/g, (h) => SADE[h] ?? h);

// Satır sonu ve denetim karakteri yazıcı komutunu böler; etikete giden her metinden önce atılır.
export const tekSatir = (metin: string): string => metin.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

// Metin satırlara sözcük sınırından bölünür; sığmayan son satır "..." ile kesilir. Satır genişliği harf başına ölçülür
// (harf-genislikleri.ts): tek bir ortalama oran büyük ve kalın harfi dar sayıp yazıyı kutudan ve simgenin altına taşırıyordu.
// SATIR_BASI zorunlu satır başıdır (refakat rotası adım başına satır basar, kart #707). Satır sonu karakteri değildir: tekSatir onu
// atmaz, gelen veride satır sonu eskisi gibi boşluk olur.
export const HARF_ORANI = 0.6;
export const SATIR_BASI = ' ';
const OLCULEN = new Set(OLCULEN_HARFLER);
export function harfGenisligi(harf: string, kalin: boolean): number {
  return (kalin ? KALIN_GENIS : NORMAL_GENIS)[harf] ?? (OLCULEN.has(harf) ? HARF_ORANI : 1);
}
export function metinGenisligi(metin: string, yaziMm: number, kalin = false): number {
  let toplam = 0;
  for (const harf of metin) toplam += harfGenisligi(harf, kalin);
  return toplam * yaziMm;
}
type Sigar = (metin: string) => boolean;
const sigdiran = (genislikMm: number, yaziMm: number, kalin: boolean): Sigar => (metin) => metinGenisligi(metin, yaziMm, kalin) <= genislikMm + 1e-9;
// Satıra sığmayan sözcük, satıra sığan son ayıraçtan (- / . _) sonra bölünür; ayıraç yoksa satır sonundan.
const AYIRACLAR = new Set(['-', '/', '.', '_']);
function kesimYeri(harfler: readonly string[], sigar: Sigar): number {
  let sigan = 1;
  while (sigan < harfler.length && sigar(harfler.slice(0, sigan + 1).join(''))) sigan++;
  for (let i = sigan - 1; i > 0; i--) if (AYIRACLAR.has(harfler[i] ?? '')) return i + 1;
  return sigan;
}
// Satır, sonraki satırla aynı sözcüğün parçasıysa bitisik, aynı paragraftaysa devam taşır; kesilen son satır bunlarla doldurulur.
type Satir = { metin: string; bitisik: boolean; devam: boolean };
// Sayı ile birimi ("12 adet", "6 bölme × 4 kat") satır sonu ayırmaz: bu sözcükler bir öbek olur. Öbek satıra tek başına da
// sığmıyorsa sözcüklerine ayrılır.
const SAYI = /^[\d.,x×/-]*\d[\d.,x×/-]*$/;
function obekler(sozcukler: readonly string[]): string[][] {
  const sonuc: string[][] = [];
  for (const [i, sozcuk] of sozcukler.entries()) {
    const onceki = sozcukler[i - 1];
    const son = sonuc[sonuc.length - 1];
    if (son && onceki !== undefined && (SAYI.test(onceki) || onceki === '×' || sozcuk === '×')) son.push(sozcuk);
    else sonuc.push([sozcuk]);
  }
  return sonuc;
}
function paragrafiBol(paragraf: string, sigar: Sigar): Satir[] {
  const satirlar: Satir[] = [];
  let satir = '';
  const ekle = (sozcuk: string) => {
    let kalan = [...sozcuk];
    while (kalan.length > 0) {
      const aday = satir === '' ? kalan.join('') : `${satir} ${kalan.join('')}`;
      if (sigar(aday)) { satir = aday; kalan = []; continue; }
      if (satir !== '') { satirlar.push({ metin: satir, bitisik: false, devam: true }); satir = ''; continue; }
      const kesim = kesimYeri(kalan, sigar);
      satirlar.push({ metin: kalan.slice(0, kesim).join(''), bitisik: true, devam: true });
      kalan = kalan.slice(kesim);
    }
  };
  for (const obek of obekler(paragraf.split(/\s+/).filter(Boolean))) {
    const metin = obek.join(' ');
    if (obek.length === 1 || sigar(satir === '' ? metin : `${satir} ${metin}`)) { ekle(metin); continue; }
    if (satir !== '' && sigar(metin)) { satirlar.push({ metin: satir, bitisik: false, devam: true }); satir = ''; ekle(metin); continue; }
    for (const sozcuk of obek) ekle(sozcuk);
  }
  if (satir !== '') satirlar.push({ metin: satir, bitisik: false, devam: true });
  const son = satirlar[satirlar.length - 1];
  if (son) son.devam = false;
  return satirlar;
}
const satirSayisi = (yukseklikMm: number, yaziMm: number) => Math.max(1, Math.floor(yukseklikMm / (yaziMm * SATIR_ARALIGI) + 1e-9));
const bol = (metin: string, genislikMm: number, yaziMm: number, kalin: boolean): Satir[] =>
  metin.split(SATIR_BASI).flatMap((p) => paragrafiBol(p, sigdiran(genislikMm, yaziMm, kalin)));
// EM-3: metin kutusunun satırlarına sözcük bölmeden sığmıyorsa yazı 0,1 mm adımlarla küçülür; en çok tasarım boyunun
// EN_KUCUK_YAZI_ORANI'na kadar (okunurluk); kod daha da küçülebilir (aşağıda). O da yetmezse sözcük ayıraçtan bölünür, artan satır kesilir.
export const EN_KUCUK_YAZI_ORANI = 0.6;
export function sigdirilmisYazi(metin: string, genislikMm: number, yukseklikMm: number, yaziMm: number, kalin = false): number {
  const sigar = (y: number) => { const b = bol(metin, genislikMm, y, kalin); return b.every((s) => !s.bitisik) && b.length <= satirSayisi(yukseklikMm, y); };
  if (metin === '' || sigar(yaziMm)) return yaziMm;
  for (let y = Math.floor(yaziMm * 10 - 1e-6) / 10; y >= yaziMm * EN_KUCUK_YAZI_ORANI - 1e-9; y = Math.round((y - 0.1) * 10) / 10) {
    if (sigar(y)) return y;
  }
  // Hiçbir boyda sığmıyorsa ad tasarım boyunda kesilir. Boşluksuz kod kimliktir, kesilmesin: okunurluk uyarı sınırına
  // (YAZI_UYARI_MM) kadar küçülmeye devam eder; o da yetmezse en küçük boyda daha çok harfi görünüyorsa o boyda kalır.
  if (/\s/.test(metin)) return yaziMm;
  const taban = Math.min(yaziMm, YAZI_UYARI_MM);
  for (let y = Math.floor(yaziMm * EN_KUCUK_YAZI_ORANI * 10 - 1e-6) / 10; y >= taban - 1e-9; y = Math.round((y - 0.1) * 10) / 10) {
    if (sigar(y)) return y;
  }
  const enKucuk = Math.ceil(yaziMm * EN_KUCUK_YAZI_ORANI * 10 - 1e-6) / 10;
  const gorunen = (y: number) => satirlaraBol(metin, genislikMm, yukseklikMm, y, kalin).join('').replace(/\.\.\.$/, '').length;
  return gorunen(enKucuk) > gorunen(yaziMm) ? enKucuk : yaziMm;
}
export function satirlaraBol(metin: string, genislikMm: number, yukseklikMm: number, yaziMm: number, kalin = false): string[] {
  const enCokSatir = satirSayisi(yukseklikMm, yaziMm);
  const satirlar = bol(metin, genislikMm, yaziMm, kalin);
  if (satirlar.length <= enCokSatir) return satirlar.map((s) => s.metin);
  // Son satır paragrafın kalanıyla doldurulup "..." sığana kadar kısaltılır; yer varken erken kesilmez.
  let dolu = '';
  for (let i = enCokSatir - 1; i < satirlar.length; i++) {
    const s = satirlar[i];
    if (!s) break;
    dolu += s.metin;
    if (!s.devam) break;
    if (!s.bitisik) dolu += ' ';
  }
  const sigar = sigdiran(genislikMm, yaziMm, kalin);
  let son = [...dolu];
  while (son.length > 0 && !sigar(`${son.join('').trimEnd()}...`)) son = son.slice(0, -1);
  return [...satirlar.slice(0, enCokSatir - 1).map((s) => s.metin), `${son.join('').trimEnd()}...`];
}
// QR bugünkü etiketlerle aynı düzeltme düzeyindedir (M); kenarda iki modül boşluk kalır.
export function qrMatrisi(veri: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(veri);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => q.isDark(y, x)));
}

// EM-4: değeri olmayan alan basılmaz (null sıfıra ya da "yok"a çevrilmez); sabit metin "=" ile başlar.
export function alanDegeri(alan: string, veri: AlanDegerleri): string | null {
  if (alan.startsWith('=')) return alan.slice(1);
  const deger = veri[alan];
  return deger === undefined || deger === null || deger.trim() === '' ? null : deger;
}

export function yerlesim(s: Sablon, veri: AlanDegerleri, sade: boolean): OnizlemeOgesi[] {
  const ogeler: OnizlemeOgesi[] = [];
  for (const o of s.ogeler) {
    const oge = ogeYerlesimi(o, veri, sade);
    if (oge === null) continue;
    if (oge.tur === 'qr') ogeler.push(...qrVeKodu(s, o, oge)); else ogeler.push(oge);
  }
  return ogeler;
}

// EM-34 (2885, 2885-1 a): kamerayla okutamayan kodu elle yazabilsin diye QR'ın taşıdığı metin QR'ın hemen altına basılır.
// QR'ın altında, QR genişliğinde başka öğeye ve etiket kenarına değmeden yer varsa yazı oraya girer, QR boyutu değişmez; yoksa QR kendi
// kutusunda yazı satırı kadar küçülür ve ortalanır (2885-1 a, 2168-2 b'deki 46 mm bu kartla yaklaşık 43 mm olur). Yer hesabı şablonun
// düzeninden yapılır; koşullu öğeler de varmış sayılır (basılan etiket veriye göre kaymaz).
export const QR_ALTI_EN_KUCUK_YAZI = 1.6;
export const QR_ALTI_EN_BUYUK_YAZI = 2.2;
const QR_ALTI_YAZI_ORANI = 0.07;
const QR_ALTI_ARALIK = 0.15;
const ETIKET_KENAR_PAYI = 0.5;
type Kutu = { x: number; y: number; genislik: number; yukseklik: number };
const kutusu = (o: SablonOgesi): Kutu => (o.tur === 'qr' || o.tur === 'simge' ? { x: o.x, y: o.y, genislik: o.boyut, yukseklik: o.boyut } : o);
export function qrAltiYeri(s: Sablon, qrOgesi: SablonOgesi): number {
  const qr = kutusu(qrOgesi);
  const ust = qr.y + qr.yukseklik;
  const ortusur = (k: Kutu) => k.x < qr.x + qr.genislik - 1e-9 && k.x + k.genislik > qr.x + 1e-9;
  let alt = s.yukseklik - ETIKET_KENAR_PAYI;
  for (const o of s.ogeler) {
    const k = kutusu(o);
    if (o === qrOgesi || !ortusur(k)) continue;
    if (k.y >= ust - 1e-9) alt = Math.min(alt, k.y);
    // QR'ı içine alan çerçevenin alt çizgisi de sınırdır (durum etiketinin red çerçevesi).
    else if (o.tur === 'kutu' && k.y + k.yukseklik > ust && k.x <= qr.x && k.x + k.genislik >= qr.x + qr.genislik) alt = Math.min(alt, k.y + k.yukseklik - o.kalinlik);
  }
  return Math.max(0, alt - ust - QR_ALTI_ARALIK);
}
type QrYerlesimi = Extract<OnizlemeOgesi, { tur: 'qr' }>;
function qrVeKodu(s: Sablon, o: SablonOgesi, qr: QrYerlesimi): OnizlemeOgesi[] {
  if (o.tur !== 'qr' || qr.veri === '') return [qr];
  const yer = qrAltiYeri(s, o);
  const istenen = Math.min(QR_ALTI_EN_BUYUK_YAZI, Math.max(QR_ALTI_EN_KUCUK_YAZI, Math.round(o.boyut * QR_ALTI_YAZI_ORANI * 10) / 10));
  const disari = yer >= QR_ALTI_EN_KUCUK_YAZI;
  const yazi = disari ? Math.min(istenen, Math.floor(yer * 10) / 10) : istenen;
  const boyut = disari ? o.boyut : Math.round((o.boyut - yazi - QR_ALTI_ARALIK) * 100) / 100;
  const kare: QrYerlesimi = { ...qr, x: o.x + (o.boyut - boyut) / 2, boyut };
  const yaziMm = sigdirilmisYazi(qr.veri, o.boyut, yazi, yazi);
  // Yazıcının yerleşik yazı tipi ortalama komutu bilmez; ölçülen harf genişliğiyle ortalanır.
  const genislik = Math.min(o.boyut, metinGenisligi(qr.veri, yaziMm));
  return [kare, {
    tur: 'metin', x: o.x + (o.boyut - genislik) / 2, y: Math.round((o.y + boyut + QR_ALTI_ARALIK) * 100) / 100, genislik, yaziMm, kalin: false,
    satirlar: satirlaraBol(qr.veri, o.boyut, yaziMm, yaziMm),
  }];
}

// EM-26 (kart 2168): koşullu öğe yalnız koşul alanının değeri varken basılır; tanınmayan simge değeri basılmaz.
function ogeYerlesimi(o: SablonOgesi, veri: AlanDegerleri, sade: boolean): OnizlemeOgesi | null {
  if (o.tur !== 'qr' && o.kosul !== undefined && alanDegeri(o.kosul, veri) === null) return null;
  if (o.tur === 'kutu') return { tur: 'kutu', x: o.x, y: o.y, genislik: o.genislik, yukseklik: o.yukseklik, kalinlik: o.kalinlik };
  const ham = alanDegeri(o.alan, veri);
  if (ham === null) return null;
  // QR içeriği kimliktir ve ASCII'dir; sadeleştirme yalnız okunan yazıya uygulanır.
  if (o.tur === 'qr') { const v = tekSatir(ham); return { tur: 'qr', x: o.x, y: o.y, boyut: o.boyut, veri: v, kareler: qrMatrisi(v) }; }
  if (o.tur === 'simge') { const c = simgeCoz(tekSatir(ham)); return c === null ? null : { tur: 'simge', x: o.x, y: o.y, boyut: o.boyut, ...c }; }
  const metin = tekSatir(sade ? sadelestir(ham) : ham);
  const yaziMm = sigdirilmisYazi(metin, o.genislik, o.yukseklik, o.yaziMm, o.kalin);
  return {
    tur: 'metin', x: o.x, y: o.y, genislik: o.genislik, yaziMm, kalin: o.kalin, satirlar: satirlaraBol(metin, o.genislik, o.yukseklik, yaziMm, o.kalin), ...(o.ters ? { ters: true } : {}),
  };
}

// Koyu modüller satır satır birleşik dikdörtgenlere çevrilir; iki dil de QR'ı yazıcının QR komutuyla değil, kutu komutuyla basar.
// Böylece basılan QR önizlemeyle aynı matristir ve yazıcı modeline göre değişen QR komutuna bağlı kalınmaz.
export interface Dikdortgen { x: number; y: number; genislik: number; yukseklik: number }
export function qrDikdortgenleri(kareler: boolean[][], x: number, y: number, modul: number): Dikdortgen[] {
  const sonuc: Dikdortgen[] = [];
  kareler.forEach((satir, sy) => {
    let bas = -1;
    for (let sx = 0; sx <= satir.length; sx++) {
      const koyu = satir[sx] === true;
      if (koyu && bas < 0) bas = sx;
      if (!koyu && bas >= 0) {
        sonuc.push({ x: x + (bas + QR_KENAR_MODUL) * modul, y: y + (sy + QR_KENAR_MODUL) * modul, genislik: (sx - bas) * modul, yukseklik: modul });
        bas = -1;
      }
    }
  });
  return sonuc;
}

// Modül genişliği tam noktadır; QR kutusuna (kenar boşluğu dahil) sığan en büyük değer, en az 1.
export const qrModulNoktasi = (boyutNokta: number, modulSayisi: number): number =>
  Math.max(1, Math.floor(boyutNokta / (modulSayisi + 2 * QR_KENAR_MODUL)));

// EM-8: ağ yazıcısının adresi tek IP'dir (ad çözülmez) ve doğrudan baskı aralığının içindedir; aralık tanımlı değilse ağ yazıcısı kaydedilmez.
// Dosya ile basan yazıcı adres taşımaz.
export function yaziciAdresHatasi(baglanti: 'ag' | 'dosya', adres: string | null, araliklar: readonly AgAraligi[] | null): string | null {
  if (baglanti === 'dosya') return adres === null || adres === '' ? null : 'Dosya ile basan yazıcıya adres yazılmaz.';
  if (adres === null || adres === '') return 'Ağ yazıcısının IP adresi zorunlu.';
  if (adresCoz(adres) === null) return 'Adres tek bir IP adresi olmalı (örnek 10.0.5.20).';
  if (araliklar === null) return `Doğrudan baskı aralığı tanımlı değil (${YAZICI_AGI_DEGISKENI}); ağ yazıcısı kaydedilemez.`;
  if (!adresAraliktaMi(adres, araliklar)) return 'Adres doğrudan baskı aralığının dışında.';
  return null;
}

// EM-9: doğrudan baskı ancak ayar açık ve aralık tanımlıyken açıktır; neden metni adres ya da değer taşımaz.
export function dogrudanBaskiDurumu(ayarAcik: boolean, araliklar: readonly AgAraligi[] | null): { acik: boolean; neden: string | null } {
  if (!ayarAcik) return { acik: false, neden: 'Sistem Ayarları\'nda "Etiket yazıcısına doğrudan baskı" kapalı.' };
  if (araliklar === null) return { acik: false, neden: `Sunucuda ${YAZICI_AGI_DEGISKENI} tanımlı değil.` };
  return { acik: true, neden: null };
}

// EM-10: gönderimden hemen önce her koşul yeniden sınanır (aralık ya da ayar sonradan değişmiş olabilir).
// Doğrudan basılan etiket ya deneme etiketidir ya da şablon türüyle aynı türden gerçek kayıttır (EM-11).
export function baskiEngeli(
  y: { baglanti: 'ag' | 'dosya'; adres: string | null; aktif: boolean },
  durum: { acik: boolean; neden: string | null },
  araliklar: readonly AgAraligi[] | null,
  sablonTuru: string,
  kayitTuru: KayitTuru | null = null,
): string | null {
  if (!y.aktif) return 'Yazıcı pasif.';
  if (y.baglanti !== 'ag' || y.adres === null) return 'Bu yazıcı dosya ile basar; komut dosyasını indirin.';
  if (!durum.acik) return durum.neden;
  if (araliklar === null || !adresAraliktaMi(y.adres, araliklar)) return 'Adres doğrudan baskı aralığının dışında.';
  return kayitUyumHatasi(sablonTuru, kayitTuru);
}

// EM-14: komut dosyası yalnız kullanımdaki dosya yazıcısı için iner; ağ yazıcısı sunucudan basar.
export function indirmeEngeli(y: { baglanti: 'ag' | 'dosya'; aktif: boolean }, sablonTuru: string, kayitTuru: KayitTuru | null = null): string | null {
  if (!y.aktif) return 'Yazıcı pasif.';
  if (y.baglanti !== 'dosya') return 'Bu yazıcı ağdan basar; Yazıcıya gönder ile basın.';
  return kayitUyumHatasi(sablonTuru, kayitTuru);
}

// EM-11: örnek değerli etiket yalnız deneme şablonundan basılır; gerçek kayıt yalnız kendi türündeki şablonla.
export function kayitUyumHatasi(sablonTuru: string, kayitTuru: KayitTuru | null): string | null {
  if (kayitTuru === null) return sablonTuru === 'deneme' ? null : 'Örnek değerli etiket yalnız yazıcı denemesinde basılır; kayıt seçin.';
  return sablonTuru === kayitSablonTuru(kayitTuru) ? null : 'Şablon seçilen kayıtların türünde değil.';
}

// EM-19: mal kabul seçimi o kabulden açılan lotların etiketidir: lot şablonuyla basılır, deftere lot olarak yazılır (270 a).
// Refakat partisi refakat şablonuyla basılır, deftere emrin refakat kartı olarak yazılır (kart #127).
export function kayitSablonTuru(kayitTuru: KayitTuru): SablonTuru {
  if (kayitTuru === 'mal-kabul') return 'lot';
  return kayitTuru === 'refakat-partisi' ? 'refakat' : kayitTuru;
}

// EM-12: bir baskıda kayıt sayısı x adet en çok EN_COK_ADET etikettir (yanlışlıkla rulo bitirilmesin).
// EM-24: koli sayısı ve koli içi adet yalnız sevk kolisinde girilir.
export const koliHatasi = (kayitTuru: KayitTuru, koli: Koli | undefined): string | null =>
  koli !== undefined && kayitTuru !== 'sevk-koli' ? 'Koli sayısı yalnız sevk kolisi etiketinde girilir.' : null;

export function toplamEtiketHatasi(kayitSayisi: number, adet: number): string | null {
  return kayitSayisi * adet > EN_COK_ADET ? `Bir baskıda en çok ${EN_COK_ADET} etiket basılır (${kayitSayisi} kayıt x ${adet} adet).` : null;
}

// EM-13: konum etiketi stoktaki konum kodunu basar ve QR'ı kod sözlüğündeki konum önekiyle kurar (94 a).
// Ad ve yer stoktan gelmez; boş alan basılmaz (EM-4).
export function konumDegerleri(kod: string): AlanDegerleri {
  return { qr: `${KOD_ONEKI.konum}:${kod}`, kod, ad: null, yer: null };
}

const birlestir = (parcalar: readonly (string | null | false)[]): string | null => {
  const dolu = parcalar.filter((p): p is string => typeof p === 'string' && p !== '');
  return dolu.length === 0 ? null : dolu.join(' · ');
};
// Sunucunun ondalık metni ("12.5000") etikette Türkçe yazılır ("12,5"); sondaki sıfırlar atılır.
const miktarYazisi = (m: string): string => m.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');

// Stok ekranındaki adlarla aynı (stok/gorunum.ts MALZEME_TURU); ortak sözlük çekirdek isteği.
const MALZEME_TURU_ADLARI: Record<KatalogTuru, string> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};

// EM-15: lot etiketi stokun lot etiketiyle aynı satırları basar (stok/LotEtiketi.tsx), malzeme türü adı dahil (271 a).
export function lotDegerleri(e: {
  lotNo: string; malzemeId: number; malzemeAd: string | null; malzemeKod: string | null; malzemeTuru: KatalogTuru | null; tedarikciPartiNo: string | null; dokumNo: string | null;
  sertifikaNo: string | null; giris: string; miktar: string | null; birim: string | null; belgeNo: string | null;
}): AlanDegerleri {
  const [yil, ay, gun] = tesisGunu(new Date(e.giris)).split('-');
  return {
    qr: `${KOD_ONEKI.lot}:${e.lotNo}`,
    lotNo: e.lotNo,
    malzeme: birlestir([e.malzemeAd, e.malzemeKod]),
    kart: birlestir([`Kart ${e.malzemeId}`, e.malzemeTuru && MALZEME_TURU_ADLARI[e.malzemeTuru]]),
    parti: birlestir([e.tedarikciPartiNo && `Parti ${e.tedarikciPartiNo}`, e.dokumNo && `Döküm ${e.dokumNo}`, e.sertifikaNo && `Sertifika ${e.sertifikaNo}`]),
    giris: birlestir([`${gun}.${ay}.${yil}`, e.miktar === null ? null : [miktarYazisi(e.miktar), e.birim].filter(Boolean).join(' '), e.belgeNo]),
  };
}

// EM-18: malzeme etiketi stoktaki malzeme etiketiyle aynı içeriği basar (stok/Etiketler.tsx): QR kart no, ad, stok kodu (269 a).
export function malzemeDegerleri(o: { id: number; kod: string; ad: string | null }): AlanDegerleri {
  return { qr: `${KOD_ONEKI.malzeme}:${o.id}`, ad: o.ad, kod: o.kod, kart: `Kart ${o.id}` };
}

// EM-20 (#116): raf etiketi rafın kodunu, adını ve yerini basar; QR raf önekiyle kurulur. Raf stok konumu değildir
// (stok gözdedir), okutan taraf rafın gözlerini gösterir.
export function rafDegerleri(r: { kod: string; ad: string; salonKodu: string | null; bolmeSayisi: number; katSayisi: number }): AlanDegerleri {
  return {
    qr: `${KOD_ONEKI.raf}:${r.kod}`, kod: r.kod, ad: r.ad === r.kod ? null : r.ad,
    yer: birlestir([r.salonKodu, r.bolmeSayisi > 0 && `${r.bolmeSayisi} bölme × ${r.katSayisi} kat`]),
  };
}

// EM-16: istasyon etiketi istasyonun stok konum kodunu basar; teslim bu kodla okutulur.
export function istasyonDegerleri(kod: string, ad: string | null): AlanDegerleri {
  return { qr: `${KOD_ONEKI.konum}:${kod}`, kod, ad };
}

const gunAyYil = (gun: string): string => gun.split('-').reverse().join('.');

// EM-17: refakat kartı etiketi stoktaki refakat kartıyla aynı satırları basar (stok/RefakatKarti.tsx); işlem tablosu tek metinde sıralanır.
// 2907 (2912 a): "Parti" yalnız tedarikçi partisidir; bölünmüş emrin satırı "Alt parti N · üst UE-…" diye, yalnız alt partide basılır.
export function refakatDegerleri(k: RefakatKartiCevabi, basim: Date): AlanDegerleri {
  const { ustEmirNo, bolunmeSira } = k.parti;
  const parti = ustEmirNo === null ? null : `${bolunmeSira === null ? 'Alt parti' : `Alt parti ${bolunmeSira}`} · üst ${ustEmirNo}`;
  const adim = (a: RefakatKartiCevabi['adimlar'][number]): string => {
    const yer = [a.yer, a.fason && 'fason'].filter(Boolean).join(', ');
    return yer === '' ? `${a.opNo} ${a.ad}` : `${a.opNo} ${a.ad} (${yer})`;
  };
  return {
    qr: k.qr,
    emirNo: k.emirNo,
    urunAd: k.urun.ad,
    urunKod: `Parça no: ${k.urun.kod}`,
    // 2907 D4 (2887 a): ekranlardaki gibi "Rev <kod>", parça nodan ayrı kutuda (uzun parça no kısaltılsa da kod kaybolmaz); kodsuz kartta yok.
    revizyon: k.revizyon === null ? null : `Rev ${k.revizyon}`,
    adetTermin: `Adet ${k.adet} · Termin ${k.teslim === null ? 'yok' : gunAyYil(k.teslim)}`,
    parti,
    basim: `Basım ${gunAyYil(tesisGunu(basim))}`,
    adimlar: k.adimlar.length === 0 ? null : k.adimlar.map(adim).join(' · '),
    rota: k.adimlar.length === 0 ? null : k.adimlar.map(adim).join(SATIR_BASI),
    lot: null,
    lotNo: null,
    lotEk: null,
    adet: String(k.adet),
    termin: k.teslim === null ? null : gunAyYil(k.teslim),
    ...refakatAdimlari(k.adimlar),
  };
}

// EM-27 (kart 2168, sade düzen 2907 / 2907-1 a): refakat kartında her işlem kendi satırındadır (no, ad, yer, işaret); adım başına imza
// kutusu yoktur, kayıt okutmadır. Kartta REFAKAT_ADIM_SAYISI satır vardır; daha çok işlem varsa son satır kalan işlem sayısını yazar.
// Fason işlem kamyon, diğerleri tezgâh piktogramıyla (Simge); İşaret yalnız fason işlemde ve son işlemden sonraki çıkış satırındadır.
// Boş satır kaldıysa son işlemin altına çıkış satırı ("Mamul deposu / sevk") yazılır.
export const REFAKAT_ADIM_SAYISI = 10;
export const REFAKAT_CIKIS_SATIRI = 'Mamul deposu / sevk';
export function refakatAdimlari(adimlar: RefakatKartiCevabi['adimlar']): Record<string, string | null> {
  const sonuc: Record<string, string | null> = {};
  const tasan = adimlar.length > REFAKAT_ADIM_SAYISI;
  for (let i = 1; i <= REFAKAT_ADIM_SAYISI; i++) {
    const a = adimlar[i - 1];
    const ozet = tasan && i === REFAKAT_ADIM_SAYISI;
    sonuc[`adim${i}No`] = a === undefined || ozet ? null : String(a.opNo);
    sonuc[`adim${i}Ad`] = a === undefined ? null : ozet ? `+${adimlar.length - REFAKAT_ADIM_SAYISI + 1} işlem daha` : a.ad;
    sonuc[`adim${i}Yer`] = a === undefined || ozet ? null : [a.yer, a.fason && 'fason'].filter(Boolean).join(' · ') || null;
    sonuc[`adim${i}Simge`] = a === undefined || ozet ? null : a.fason ? 'siyah:fason' : 'siyah:tezgah';
    sonuc[`adim${i}Isaret`] = a === undefined || ozet || !a.fason ? null : 'siyah:fason';
  }
  if (!tasan && adimlar.length > 0 && adimlar.length < REFAKAT_ADIM_SAYISI) {
    sonuc[`adim${adimlar.length + 1}Ad`] = REFAKAT_CIKIS_SATIRI;
    sonuc[`adim${adimlar.length + 1}Isaret`] = 'siyah:bayrak';
  }
  return sonuc;
}

// EM-20 (kart #127): refakat partisinin kartı emrin kartıdır; QR ve başlık partinin (RP, emir no-P sıra), lot satırı depodan verilen lotun
// bilgisidir (lot no, tedarikçi partisi, döküm, sertifika).
export function refakatPartisiDegerleri(
  k: RefakatKartiCevabi, r: { qr: string; etiket: string }, lot: { lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null }, basim: Date,
): AlanDegerleri {
  return {
    ...refakatDegerleri(k, basim),
    qr: r.qr,
    emirNo: r.etiket,
    lot: birlestir([`Lot ${lot.lotNo}`, lot.tedarikciPartiNo && `Parti ${lot.tedarikciPartiNo}`, lot.dokumNo && `Döküm ${lot.dokumNo}`, lot.sertifikaNo && `Sertifika ${lot.sertifikaNo}`]),
    lotNo: lot.lotNo,
    lotEk: birlestir([lot.dokumNo && `Döküm ${lot.dokumNo}`, lot.sertifikaNo && `Sertifika ${lot.sertifikaNo}`, lot.tedarikciPartiNo && `Tedarikçi partisi ${lot.tedarikciPartiNo}`]),
  };
}

// 2929 a: refakat kartı varsayılan iki kopya basılır. Kopyalar aynı kartın (QR aynı) ayrı kâğıtlarıdır; bölünen teslimde hangi kâğıdın
// hangisi olduğu görünsün diye her biri "Kopya n/N" taşır. Tek kopyada yazı yoktur. Öteki türlerde adet kopyası özdeştir (yazıcı çoğaltır).
export function kopyaDegerleri(degerler: readonly AlanDegerleri[], adet: number): AlanDegerleri[] {
  if (adet <= 1) return [...degerler];
  return degerler.flatMap((d) => Array.from({ length: adet }, (_, i) => ({ ...d, kopya: `Kopya ${i + 1}/${adet}` })));
}

// EM-21 (1285 a): hatalı parça etiketi Üretim Emirleri'nin hatalı kaydını basar. Durum karardan gelir, elle seçilmez; karar yoksa
// "Karar bekliyor". QR parçanın bulunduğu emri gösterir (kol ya da emrin kendisi); yeni kod öneki açılmaz.
export const HATALI_DURUM_ADLARI: Record<NonNullable<HataliKaydiOzeti['karar']>, string> = {
  rework: 'REWORK', hurda: 'HURDA', red: 'RED', kabul: 'KABUL', sartli_kabul: 'ŞARTLI KABUL',
};
const anYazisi = (an: string): string => { const [gun = '', saat = ''] = tesisSaati(new Date(an)).split(' '); return `${gunAyYil(gun)} ${saat}`; };
export function hataliParcaDegerleri(h: HataliKaydiOzeti): AlanDegerleri {
  const kol = h.hedefEmir.id === h.uretimEmri.id ? null : `kol ${h.hedefEmir.emirNo}`;
  return {
    qr: `${KOD_ONEKI['uretim-emri']}:${h.hedefEmir.id}`,
    durum: h.karar === null ? 'KARAR BEKLİYOR' : HATALI_DURUM_ADLARI[h.karar],
    emirNo: birlestir([h.uretimEmri.emirNo, kol]),
    parca: birlestir([h.uretimEmri.parcaNo, h.uretimEmri.parcaAd]),
    islem: `OP ${h.isEmri.opNo} ${h.isEmri.ad}`,
    adetNeden: birlestir([`${h.adet} adet`, h.hurdaNedeni.ad]),
    ayiran: birlestir([h.kisi.ad && `Ayıran ${h.kisi.ad}`, anYazisi(h.zaman)]),
    karar: h.karar === null ? null : birlestir([
      h.kararKisi?.ad ? `Karar ${h.kararKisi.ad}` : null, h.kararZamani && anYazisi(h.kararZamani), h.ncrKimlik && `NCR ${h.ncrKimlik}`, h.kararNotu,
    ]),
    kararSimge: HATALI_KARAR_SIMGESI[h.karar ?? 'bekliyor'],
    redCerceve: h.karar === 'red' ? 'evet' : null,
  };
}

// EM-28 (2168-3 a): karar sağ üst karoda resimle ve karonun dolgusuyla ayrılır; red etiketin tamamı kalın çerçeve alır.
export const HATALI_KARAR_SIMGESI: Record<NonNullable<HataliKaydiOzeti['karar']> | 'bekliyor', string> = {
  bekliyor: 'cizgili:bekliyor', kabul: 'beyaz:onay', sartli_kabul: 'siyah:uyari', rework: 'beyaz:rework', hurda: 'siyah:hurda', red: 'siyah:red',
};
export const KALITE_KARAR_SIMGESI: Record<KaliteDurumu, string> = { karar_bekliyor: 'cizgili:bekliyor', serbest: 'beyaz:onay', sartli: 'siyah:uyari', red: 'siyah:red' };

// EM-22 (1286 a): kalite durum etiketi stokun bakiye satırını basar; durum satırdan okunur, elle seçilmez. Adlar stok ekranındaki
// hal adlarıdır (stok/ortak.tsx KALITE_ROZETI); yalnız şartlı karar etikette tam adıyla basılır (2168-4), ekranda kısadır.
// Ortak sözlük çekirdek isteği. QR lotu gösterir.
export const KALITE_DURUM_ADLARI: Record<KaliteDurumu, string> = { serbest: 'SERBEST', karar_bekliyor: 'KARAR BEKLİYOR', sartli: 'ŞARTLI KABUL', red: 'RED' };
export function kaliteDurumDegerleri(e: {
  lotNo: string; malzemeId: number; malzemeAd: string | null; malzemeKod: string | null; birim: string | null; konumKod: string; miktar: string; kaliteDurumu: KaliteDurumu;
}): AlanDegerleri {
  return {
    qr: `${KOD_ONEKI.lot}:${e.lotNo}`,
    durum: KALITE_DURUM_ADLARI[e.kaliteDurumu],
    lotNo: e.lotNo,
    malzeme: birlestir([e.malzemeAd ?? `Kart ${e.malzemeId}`, e.malzemeKod]),
    miktar: birlestir([[miktarYazisi(e.miktar), e.birim].filter(Boolean).join(' '), `Konum ${e.konumKod}`]),
    kararSimge: KALITE_KARAR_SIMGESI[e.kaliteDurumu],
    redCerceve: e.kaliteDurumu === 'red' ? 'evet' : null,
  };
}

// EM-41 (3124 a): malzeme etiketi lot ve kalite durum etiketini tek etikette toplar. Durum bakiye satırınındır; üst bandın adı GKK ile
// birlikte okunur: GKK'sı yazılmamış karar bekleyen mal kabul "MAL KABUL", GKK'da hatalı çıkıp karar bekleyen "HATALI" basılır. Hatalı
// ve red etiketi kalın çerçeve alır. Stoğu kalmamış lotta durum bandı basılmaz. Alan adları eski lot ve kalite şablonlarıyla çakışmaz,
// iki şablon da aynı değerlerle basılabilir. Saat etiketin basıldığı andır (eski etiket yenisinden ayrılsın).
export interface MalzemeGirisOzeti {
  gkkNo: string | null; gkkZaman: string | null; kabulMiktar: string | null; hataliMiktar: string | null;
  karar: 'kabul' | 'sartli_kabul' | 'red' | null; ncrNo: string | null; not: string | null;
}
export interface MalzemeEtiketiGirdisi {
  lotNo: string; malzemeId: number; malzemeAd: string | null; malzemeKod: string | null; malzemeTuru: KatalogTuru | null; birim: string | null;
  tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null; giris: string; girisMiktar: string | null; belgeNo: string | null;
  konumKod: string | null; miktar: string | null; kaliteDurumu: KaliteDurumu | null; malKabulSatirId: number | null;
  ozellik: { kalite: string | null; durum: string | null; islem: string | null; olcu: string | null } | null;
  // gkkyeGirdi: mal kabul bu satırı GKK'ya gönderdi mi (girişte olan; ilk mal kabul satırı yoksa null).
  tedarikci: string | null; gkkyeGirdi: boolean | null; gkk: MalzemeGirisOzeti | null;
}
type Bant = { ad: string; alt: string; simge: string; cerceve: boolean };
const KULLANILAMAZ = 'kullanılamaz';
export function malzemeBandi(kalite: KaliteDurumu | null, gkkyeGirdi: boolean, gkk: MalzemeGirisOzeti | null): Bant | null {
  if (kalite === null) return null;
  if (kalite === 'serbest') return { ad: 'SERBEST', alt: 'Kullanılabilir', simge: 'beyaz:onay', cerceve: false };
  if (kalite === 'sartli') return { ad: 'ŞARTLI KABUL', alt: gkk?.karar === 'sartli_kabul' && gkk.not !== null ? `Şart: ${gkk.not}` : 'Şartla kullanılır', simge: 'siyah:uyari', cerceve: false };
  if (kalite === 'red') return { ad: 'RED', alt: `${gkk?.karar === 'red' ? 'Tedarikçiye iade' : 'Red'} · ${KULLANILAMAZ}`, simge: 'siyah:red', cerceve: true };
  if (gkk !== null) return { ad: 'HATALI', alt: `Kalite kararı bekliyor · ${KULLANILAMAZ}`, simge: 'siyah:hatali', cerceve: true };
  if (gkkyeGirdi) return { ad: 'MAL KABUL', alt: `GKK bekliyor · ${KULLANILAMAZ}`, simge: 'cizgili:bekliyor', cerceve: false };
  return { ad: KALITE_DURUM_ADLARI.karar_bekliyor, alt: `Kalite kararı bekliyor · ${KULLANILAMAZ}`, simge: 'cizgili:bekliyor', cerceve: false };
}
// 3118: kısmi kabul ve ret ayrı değer değildir, miktar ve karardan çıkar.
export function gkkSonucu(g: MalzemeGirisOzeti, birim: string | null): string {
  const m = (x: string | null) => [miktarYazisi(x ?? '0'), birim].filter(Boolean).join(' ');
  const hatali = Number(g.hataliMiktar ?? '0'), kabul = Number(g.kabulMiktar ?? '0');
  if (hatali <= 0) return `kabul ${m(g.kabulMiktar)}`;
  if (g.karar === null) return `hatalı ${m(g.hataliMiktar)}`;
  if (g.karar === 'sartli_kabul') return `şartlı ${m(g.hataliMiktar)}`;
  if (g.karar === 'kabul') return `hatalı kabul ${m(g.hataliMiktar)}`;
  return kabul > 0 ? `kısmi kabul ${miktarYazisi(g.kabulMiktar ?? '0')}/${m(String(kabul + hatali))}` : 'ret';
}
const buyukHarf = (m: string) => m.toLocaleUpperCase('tr-TR');
export function malzemeEtiketiDegerleri(e: MalzemeEtiketiGirdisi, basim: Date): AlanDegerleri {
  const bant = malzemeBandi(e.kaliteDurumu, e.gkkyeGirdi === true, e.gkk);
  const miktar = (x: string | null) => (x === null ? null : [miktarYazisi(x), e.birim].filter(Boolean).join(' '));
  const gkk = e.gkk === null
    ? e.gkkyeGirdi === null ? null : e.gkkyeGirdi ? 'Bekliyor' : 'Gerekmez'
    : birlestir([e.gkk.gkkNo, e.gkk.gkkZaman && gunAyYil(tesisGunu(new Date(e.gkk.gkkZaman))), gkkSonucu(e.gkk, e.birim), e.gkk.ncrNo]);
  const [gun, saat] = tesisSaati(basim).split(' ');
  return {
    ...lotDegerleri({ ...e, miktar: e.girisMiktar }),
    durumBant: bant?.ad ?? null, durumAlt: bant?.alt ?? null, bantSimge: bant?.simge ?? null, cerceve: bant?.cerceve ? 'evet' : null,
    bakiye: birlestir([miktar(e.miktar), e.konumKod]), basimZamani: bant === null ? null : `${gunAyYil(gun ?? '')} ${saat ?? ''}`,
    tur: e.malzemeTuru && buyukHarf(MALZEME_TURU_ADLARI[e.malzemeTuru]),
    olcu: e.ozellik?.olcu ?? null, kalite: e.ozellik?.kalite ?? null, temper: e.ozellik?.durum ?? null, islem: e.ozellik?.islem ?? null,
    tedarikci: e.tedarikci,
    sertifika: birlestir([e.sertifikaNo, e.dokumNo && `Döküm ${e.dokumNo}`, e.tedarikciPartiNo && `Parti ${e.tedarikciPartiNo}`]),
    girisSatiri: birlestir([gunAyYil(tesisGunu(new Date(e.giris))), miktar(e.girisMiktar), e.belgeNo]),
    gkk,
  };
}

// EM-23 (1287 a): sevk koli etiketi Sevkiyat'ın giden kalemini basar; her koli ayrı etikettir (n/N). Koli içi adet elle girilir;
// girilmezse kalemin adedi basılır. QR kalemin emridir (`UE:`; 1287 a: QR yeter, yeni önek yok); emirsiz kalemde QR basılmaz.
// İrsaliye no uydurulmaz: belge no işin belge numarasıdır, yoksa boş kalır.
export function sevkKoliDegerleri(k: {
  firmaAdi: string | null; tarih: string | null; belgeNo: string | null; adet: string | null; aciklama: string | null; uretimEmriId: number | null;
}, emirNo: string | null, malzeme: { ad: string | null; kod: string | null } | null, sira: number, toplam: number, ici: number | null): AlanDegerleri {
  const adet = ici !== null ? miktarYazisi(String(ici)) : k.adet === null ? null : miktarYazisi(k.adet);
  return {
    qr: k.uretimEmriId === null ? null : `${KOD_ONEKI['uretim-emri']}:${k.uretimEmriId}`,
    musteri: k.firmaAdi,
    parca: malzeme === null ? k.aciklama : birlestir([malzeme.kod, malzeme.ad]),
    adet: adet === null ? null : `${ici !== null ? 'Koli içi ' : ''}${adet} adet`,
    koli: `Koli ${sira}/${toplam}`,
    koliSira: `${sira}/${toplam}`,
    adetSayi: adet,
    // Koli içi girilmediyse ve birden çok koli varsa sayı kalemin toplamıdır; koli içi diye basılmaz.
    adetBaslik: ici !== null || toplam === 1 ? 'KOLİ İÇİ' : 'KALEM TOPLAMI',
    emirNo,
    sevk: birlestir([k.tarih && gunAyYil(k.tarih), k.belgeNo && `Belge ${k.belgeNo}`]),
  };
}

// EM-30 (2223-1 a): bekleyen etiket kaynak kayıttan türetilir. Liste BEKLEYEN_GUN geriye bakar; kayıt, açıldığı ya da durumu
// değiştiği andan sonra basılmadıysa bekler. Zaman metinleri ISO'dur; karşılaştırma ana çevrilerek yapılır.
export const BEKLEYEN_GUN = 30;
export function bekleyenBaslangici(simdi: Date): string {
  return new Date(simdi.getTime() - BEKLEYEN_GUN * 86_400_000).toISOString();
}
const sonra = (basim: string | undefined, olay: string): boolean => basim !== undefined && Date.parse(basim) >= Date.parse(olay);

// EM-31 (2223-4 a): basılmayacak işareti olaydan sonra verildiyse kayıt düşer; olay işaretten sonraysa yeniden bekler.
export function malKabulBekleyenleri(
  kabuller: readonly { malKabulId: number; no: string; irsaliyeNo: string | null; zaman: string; partiIdler: readonly number[] }[],
  lotBasimlari: ReadonlyMap<number, string>,
  atlamalar: ReadonlyMap<number, string> = new Map(),
): Bekleyen[] {
  return kabuller.flatMap((k) => {
    if (sonra(atlamalar.get(k.malKabulId), k.zaman)) return [];
    const lotlar = [...new Set(k.partiIdler)];
    const basilmamis = lotlar.filter((p) => !sonra(lotBasimlari.get(p), k.zaman)).length;
    if (basilmamis === 0) return [];
    const ayrinti = [`${String(basilmamis)}/${String(lotlar.length)} lot etiketi basılmadı`, k.irsaliyeNo === null ? null : `İrsaliye ${k.irsaliyeNo}`].filter(Boolean).join(' · ');
    return [{ tur: 'mal-kabul' as const, id: k.malKabulId, baslik: k.no, ayrinti, zaman: k.zaman, etiketSayisi: basilmamis }];
  });
}

export function kaliteBekleyenleri(
  degisimler: readonly { bakiyeId: number; lotNo: string; malzemeAd: string | null; konumKod: string; kaliteDurumu: KaliteDurumu; degisim: string }[],
  basimlar: ReadonlyMap<number, string>,
  atlamalar: ReadonlyMap<number, string> = new Map(),
): Bekleyen[] {
  return degisimler.flatMap((d) => (sonra(basimlar.get(d.bakiyeId), d.degisim) || sonra(atlamalar.get(d.bakiyeId), d.degisim) ? [] : [{
    tur: 'kalite-durum' as const, id: d.bakiyeId, baslik: `${d.lotNo} ${d.konumKod}`,
    ayrinti: [KALITE_DURUM_ADLARI[d.kaliteDurumu], d.malzemeAd].filter(Boolean).join(' · '), zaman: d.degisim, etiketSayisi: 1,
  }]));
}

// EM-32 (2223-2 a): depodan emre verilen lotun refakat kartı. Basım deftere emrin refakat kartı olarak yazılır (kaynak 'refakat',
// kimlik emir); emrin kartı verilişten sonra basıldıysa kart basılmış sayılır.
export function refakatBekleyenleri(
  verilisler: readonly { refakatPartisiId: number; uretimEmriId: number; sira: number; lotNo: string; malzemeAd: string | null; emirNo: string | null; verilis: string }[],
  emirBasimlari: ReadonlyMap<number, string>,
  atlamalar: ReadonlyMap<number, string> = new Map(),
): Bekleyen[] {
  return verilisler.flatMap((v) => (sonra(emirBasimlari.get(v.uretimEmriId), v.verilis) || sonra(atlamalar.get(v.refakatPartisiId), v.verilis) ? [] : [{
    tur: 'refakat-partisi' as const, id: v.refakatPartisiId, baslik: `${v.emirNo ?? `Emir #${String(v.uretimEmriId)}`}-P${String(v.sira)}`,
    ayrinti: [`Lot ${v.lotNo}`, v.malzemeAd].filter(Boolean).join(' · '), zaman: v.verilis, etiketSayisi: REFAKAT_KOPYA_SAYISI,
  }]));
}

// EM-33 (2223-2 a): hatalı parça etiketi terminalde ayrılınca ve kalite rework, hurda ya da red deyince basılır. Kabul ve şartlı kabul
// parçayı hattına döndürür; etiket beklemez. Olay zamanı karar varsa karar anı, yoksa ayrılma anıdır.
const HATALI_ETIKETLI_KARAR: ReadonlySet<string> = new Set(['rework', 'hurda', 'red']);
export function hataliBekleyenleri(
  kayitlar: readonly Pick<HataliKaydiOzeti, 'id' | 'uretimEmri' | 'isEmri' | 'hurdaNedeni' | 'adet' | 'zaman' | 'karar' | 'kararZamani'>[],
  baslangic: string,
  basimlar: ReadonlyMap<number, string>,
  atlamalar: ReadonlyMap<number, string> = new Map(),
): Bekleyen[] {
  return kayitlar.flatMap((h) => {
    if (h.karar !== null && !HATALI_ETIKETLI_KARAR.has(h.karar)) return [];
    const olay = h.kararZamani ?? h.zaman;
    if (Date.parse(olay) < Date.parse(baslangic) || sonra(basimlar.get(h.id), olay) || sonra(atlamalar.get(h.id), olay)) return [];
    return [{
      tur: 'hatali-parca' as const, id: h.id, baslik: `${h.uretimEmri.emirNo} OP ${String(h.isEmri.opNo)}`,
      ayrinti: [h.karar === null ? 'KARAR BEKLİYOR' : HATALI_DURUM_ADLARI[h.karar], `${String(h.adet)} adet`, h.hurdaNedeni.ad].join(' · '), zaman: olay, etiketSayisi: 1,
    }];
  });
}

export const bekleyenSirasi = (a: Bekleyen, b: Bekleyen): number => Date.parse(b.zaman) - Date.parse(a.zaman) || a.tur.localeCompare(b.tur) || b.id - a.id;
