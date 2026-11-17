// 3404: tedarikçinin PDF teklifinden okunan yazıların satırlara, alanlara ve talep kalemlerine dönüşmesi (saf; tarayıcı gerekmez).
// Okunan hiçbir değer kendiliğinden kaydedilmez: her değer bir durum taşır, kontrol isteyen her şey kullanıcının kararına düşer.
// Tedarikçi hiç kendiliğinden "emin" olmaz (Risk K2); para birimi bulunamazsa boş kalır, TRY varsayılmaz.

/** pdf.js metin katmanı ya da yazı tanıma öğesi: x, y yazının sol alt köşesi (y aşağı doğru artar), h yazı yüksekliği. */
export interface Oge { s: string; x: number; y: number; w: number; h: number; conf?: number }

export type Durum = 'emin' | 'kontrol' | 'yok';
export type ParaBirimi = 'TRY' | 'EUR' | 'USD' | 'GBP' | 'CHF';

export interface Satir { sayfa: number; y: number; ogeler: Oge[]; metin: string; kutu: [number, number, number, number] }

export interface SayiOkuma { deger: number; ham: string; duzeltildi: boolean; supheli: boolean; guvenDusuk?: boolean }

/* ---------------- metin ---------------- */

const TR: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u' };
// Yazı tanıma çap işaretini çoğu zaman @ okur ("@50"); rakamdan önceki @ çap sayılır.
export function sade(s: string): string {
  return s.replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (c) => TR[c] ?? c).toLowerCase().replace(/[øØ⌀]|@(?=\d)/g, ' o ').replace(/[^a-z0-9.,%]+/g, ' ').trim();
}

/* ---------------- sayı ---------------- */

// Yazı tanıma rakamı harfle karıştırır (2,1O). Çoğu rakam olan parçada harf rakama çevrilir; düzeltilen değer kontrol ister.
const HARF_RAKAM: Record<string, string> = { O: '0', o: '0', D: '0', Q: '0', l: '1', I: '1', '|': '1', S: '5', B: '8', Z: '2' };

/** Türkçe ve İngilizce yazılmış sayı. "1.226,07" 1226.07; "4,85" 4.85; "1,226.07" 1226.07; "1.500" 1500 (binlik). Sayı değilse null. */
export function sayiOku(ham0: string): SayiOkuma | null {
  const ham = ham0.trim().replace(/^[^\dOolI|SBZDQ]+|[^\dOolI|SBZDQ]+$/g, '');
  if (!ham) return null;
  const rakam = (ham.match(/\d/g) ?? []).length, harf = (ham.match(/[OolI|SBZDQ]/g) ?? []).length;
  if (rakam === 0 || harf > rakam || !/^[\dOolI|SBZDQ][\dOolI|SBZDQ.,' ]*$/.test(ham)) return null;
  const duzeltildi = harf > 0;
  const s = ham.replace(/[OolI|SBZDQ]/g, (c) => HARF_RAKAM[c] ?? c).replace(/[' ]/g, '');
  const sonNokta = s.lastIndexOf('.'), sonVirgul = s.lastIndexOf(',');
  let tam = s, supheli = duzeltildi;
  if (sonNokta >= 0 && sonVirgul >= 0) {
    const ondalik = sonVirgul > sonNokta ? ',' : '.';
    const binlik = ondalik === ',' ? '.' : ',';
    tam = s.split(binlik).join('').replace(ondalik, '.');
  } else if (sonVirgul >= 0) {
    const parca = s.split(',');
    // "1,500" Türkçede 1,5; İngilizcede bin beş yüz: kontrol ister.
    if (parca.length === 2 && parca[1]!.length === 3) supheli = true;
    tam = parca.length > 2 ? parca.join('') : s.replace(',', '.');
  } else if (sonNokta >= 0) {
    const parca = s.split('.');
    if (parca.length > 2 || (parca.length === 2 && parca[1]!.length === 3 && /^\d{1,3}$/.test(parca[0]!))) tam = parca.join('');
  }
  if (!/^\d+(\.\d+)?$/.test(tam)) return null;
  return { deger: Number(tam), ham, duzeltildi, supheli };
}

/* ---------------- birim, para, termin ---------------- */

const BIRIMLER: [RegExp, string][] = [
  [/^(kg|kgs|kilo|kilogram)$/, 'kg'], [/^(ad|adt|adet|pcs|pc|pce|ea|each|tane)$/, 'adet'], [/^(m|mt|mtr|metre|meter)$/, 'm'],
  [/^(m2|mt2|metrekare)$/, 'm2'], [/^(lt|l|litre|liter)$/, 'lt'], [/^(set|tk|takim)$/, 'set'], [/^(pk|pkt|paket)$/, 'paket'],
  [/^(ton|tn)$/, 'ton'], [/^(gr|g|gram)$/, 'gr'], [/^(boy)$/, 'boy'], [/^(plaka|levha)$/, 'plaka'],
];
export function birimOku(s: string): string | null {
  const b = sade(s).replace(/[.,]/g, '').replace(/\s+/g, '');
  for (const [d, ad] of BIRIMLER) if (d.test(b)) return ad;
  return null;
}
export const birimAyniMi = (a: string | null, b: string | null): boolean => a !== null && b !== null && (birimOku(a) ?? sade(a)) === (birimOku(b) ?? sade(b));

const PARALAR: [RegExp, ParaBirimi][] = [[/€|\beur(o)?\b/i, 'EUR'], [/\$|\busd\b|dolar/i, 'USD'], [/₺|\btl\b|\btry\b/i, 'TRY'], [/£|\bgbp\b|sterlin/i, 'GBP'], [/\bchf\b/i, 'CHF']];
export function paraOku(s: string): ParaBirimi | null {
  for (const [d, p] of PARALAR) if (d.test(s)) return p;
  return null;
}

/** "14 gün", "2 hafta", "3 iş günü", "stoktan" → gün; tarih yazılmışsa teklif tarihinden fark. Bulunamazsa null. */
export function terminOku(s: string, teklifTarihi: string | null = null): number | null {
  const t = sade(s);
  if (/\b(stok|stoktan|hemen|derhal)\b/.test(t)) return 0;
  const g = t.match(/(\d+)\s*(is\s*)?(gun|day)/); if (g) return Number(g[1]);
  const h = t.match(/(\d+)\s*(hafta|hft|week|wk)/); if (h) return Number(h[1]) * 7;
  const a = t.match(/(\d+)\s*(ay|month)\b/); if (a) return Number(a[1]) * 30;
  const d = tarihOku(s);
  if (d && teklifTarihi) { const fark = Math.round((Date.parse(d) - Date.parse(teklifTarihi)) / 86400000); return fark >= 0 ? fark : null; }
  return null;
}

/** dd.mm.yyyy, dd/mm/yyyy, dd-mm-yy → yyyy-mm-dd. */
export function tarihOku(s: string): string | null {
  const m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
  if (!m) return null;
  const gun = Number(m[1]), ay = Number(m[2]); let yil = Number(m[3]);
  if (yil < 100) yil += 2000;
  if (gun < 1 || gun > 31 || ay < 1 || ay > 12) return null;
  return `${String(yil)}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
}

/* ---------------- satırlar ---------------- */

const orta = (l: number[]): number => { const s = [...l].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };

/** Öğeler taban çizgisine göre satırlara toplanır; satır içinde soldan sağa. */
export function satirlaraAyir(ogeler: readonly Oge[], sayfa = 1): Satir[] {
  const l = ogeler.filter((o) => o.s.trim() !== '').slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const tol = Math.max(2, orta(l.map((o) => o.h)) * 0.45);
  const satirlar: Satir[] = [];
  for (const o of l) {
    const son = satirlar[satirlar.length - 1];
    if (son && Math.abs(o.y - son.y) <= tol) { son.ogeler.push(o); son.y = (son.y * (son.ogeler.length - 1) + o.y) / son.ogeler.length; } else satirlar.push({ sayfa, y: o.y, ogeler: [o], metin: '', kutu: [0, 0, 0, 0] });
  }
  for (const s of satirlar) {
    s.ogeler.sort((a, b) => a.x - b.x);
    s.metin = s.ogeler.map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim();
    s.kutu = [Math.min(...s.ogeler.map((o) => o.x)), Math.min(...s.ogeler.map((o) => o.y - o.h)), Math.max(...s.ogeler.map((o) => o.x + o.w)), Math.max(...s.ogeler.map((o) => o.y))];
  }
  return satirlar;
}

/* ---------------- tablo ---------------- */

export type Sutun = 'ad' | 'kod' | 'miktar' | 'birim' | 'fiyat' | 'tutar' | 'termin' | 'sira';
const BASLIKLAR: [RegExp, Sutun][] = [
  [/^(b\.?\s*fiyat|birim\s*fiyat|fiyat|price|unit\s*price|b\.?f\.?)$/, 'fiyat'], [/^(miktar|adet|qty|quantity|mik\.?)$/, 'miktar'],
  [/^(birim|unit|br\.?)$/, 'birim'], [/^(tutar|toplam|amount|total|net\s*tutar)$/, 'tutar'], [/^(termin|teslim|teslim\s*suresi|delivery|lead\s*time)$/, 'termin'],
  [/^(malzeme|aciklama|urun|tanim|description|cins|malzeme\s*adi|urun\s*adi|hizmet)$/, 'ad'], [/^(kod|stok\s*kodu|urun\s*kodu|code|part\s*no|parca\s*no)$/, 'kod'],
  [/^(#|no|sira|s\.?no|poz)$/, 'sira'],
];
export interface SutunKonumu { sutun: Sutun; x: number }
/** Başlık satırı: en az üç sütun adı (biri fiyat) taşıyan satır. Bitişik iki kelime ("Birim Fiyat") tek başlık sayılır. */
export function baslikBul(s: Satir): SutunKonumu[] | null {
  const bulunan: SutunKonumu[] = [];
  const o = s.ogeler;
  for (let i = 0; i < o.length; i++) {
    const ikili = i + 1 < o.length && sade(o[i]!.s) && sade(o[i + 1]!.s) ? sade(`${o[i]!.s} ${o[i + 1]!.s}`) : '';
    const tek = o[i]!.s.trim() === '#' ? 'no' : sade(o[i]!.s);
    const ikiliEs = ikili ? BASLIKLAR.find(([d]) => d.test(ikili)) : undefined;
    if (ikiliEs && ikiliEs[1] !== sutunBul(tek)) { bulunan.push({ sutun: ikiliEs[1], x: o[i]!.x }); i++; continue; }
    const es = sutunBul(tek);
    if (es) bulunan.push({ sutun: es, x: o[i]!.x });
  }
  const turler = new Set(bulunan.map((b) => b.sutun));
  return turler.size >= 3 && turler.has('fiyat') ? bulunan : null;
}
const sutunBul = (s: string): Sutun | null => BASLIKLAR.find(([d]) => d.test(s))?.[1] ?? null;

export interface OkunanSatir {
  satir: Satir;
  /** PDF'te görünen sıra (1'den). */
  no: number;
  ad: string;
  kod: string | null;
  miktar: SayiOkuma | null;
  birim: string | null;
  birimHam: string | null;
  fiyat: SayiOkuma | null;
  tutar: SayiOkuma | null;
  terminGun: number | null;
  terminHam: string | null;
  /** Başlıksız tahminle ayrıldı (sütunlar bilinmiyor). */
  tahmini: boolean;
  /** Kaleme bağlanmayacak satır türü. */
  ek: 'nakliye' | null;
}

const BITIS = /^(genel\s*toplam|ara\s*toplam|toplam|kdv|net\s*toplam|grand\s*total|sub\s*total|total|iskonto|yekun)\b/;
const NAKLIYE = /\b(nakliye|navlun|kargo|tasima|freight|shipping)\b/;

function hucreler(s: Satir, b: SutunKonumu[]): Map<Sutun, Oge[]> {
  const sirali = [...b].sort((p, q) => p.x - q.x);
  const m = new Map<Sutun, Oge[]>();
  for (const o of s.ogeler) {
    // Öğe, sol kenarı en yakın soldaki başlığın sütunundadır (sayılar sağa yaslı olsa da başlığın solunu geçmez).
    const merkez = o.x + o.w / 2;
    let sec = sirali[0]!;
    for (const h of sirali) if (h.x <= merkez + o.h * 0.5) sec = h;
    const l = m.get(sec.sutun) ?? []; l.push(o); m.set(sec.sutun, l);
  }
  return m;
}
const metni = (l: Oge[] | undefined): string => (l ?? []).map((o) => o.s).join(' ').trim();
const sayiBul = (s: string): SayiOkuma | null => {
  for (const p of s.split(/\s+/)) { const n = sayiOku(p); if (n) return n; }
  return null;
};
// Yazı tanımanın bu güvenin altında okuduğu sayı, düzgün görünse de kontrol ister.
export const TANIMA_GUVENI = 85;
const hucreSayisi = (l: Oge[] | undefined): SayiOkuma | null => {
  const n = sayiBul(metni(l));
  return n && (l ?? []).some((o) => o.conf !== undefined && o.conf < TANIMA_GUVENI) ? { ...n, supheli: true, guvenDusuk: true } : n;
};

/** Teklif satırları: başlık bulunursa sütunlara göre, bulunamazsa sayı ve birim sırasından tahminle. */
export function tabloOku(satirlar: readonly Satir[], teklifTarihi: string | null = null): OkunanSatir[] {
  const sonuc: OkunanSatir[] = [];
  let baslik: SutunKonumu[] | null = null;
  let bitti = false;
  for (const s of satirlar) {
    const yeni = baslikBul(s);
    if (yeni) { baslik = yeni; bitti = false; continue; }
    if (!baslik || bitti) continue;
    const sd = sade(s.metin);
    if (BITIS.test(sd)) { bitti = true; continue; }
    const h = hucreler(s, baslik);
    const fiyat = hucreSayisi(h.get('fiyat'));
    const miktarMetni = metni(h.get('miktar'));
    const miktar = hucreSayisi(h.get('miktar'));
    if (!fiyat && !miktar) continue;
    const birimHam = metni(h.get('birim')) || (miktarMetni.split(/\s+/).find((p) => birimOku(p) !== null) ?? '');
    const terminHam = metni(h.get('termin')) || null;
    const ad = metni(h.get('ad')) || metni(h.get('kod'));
    sonuc.push({
      satir: s, no: sonuc.length + 1, ad, kod: metni(h.get('kod')) || null, miktar, birim: birimHam ? birimOku(birimHam) : null, birimHam: birimHam || null,
      fiyat, tutar: hucreSayisi(h.get('tutar')), terminGun: terminHam ? terminOku(terminHam, teklifTarihi) : null, terminHam,
      tahmini: false, ek: NAKLIYE.test(sade(ad)) ? 'nakliye' : null,
    });
  }
  if (sonuc.length > 0) return sonuc;
  return tahminleOku(satirlar, teklifTarihi);
}

// Başlıksız teklif: en az iki sayı ve harf taşıyan satır kalem sayılır; birimden önceki sayı miktar, üç sayıda son tutar, sondan bir
// önceki fiyattır. Bütün satırlar kontrol ister.
function tahminleOku(satirlar: readonly Satir[], teklifTarihi: string | null): OkunanSatir[] {
  const sonuc: OkunanSatir[] = [];
  for (const s of satirlar) {
    const sd = sade(s.metin);
    if (BITIS.test(sd) || !/[a-z]{2}/.test(sd)) continue;
    const parcalar = s.ogeler.flatMap((o) => o.s.split(/\s+/)).filter(Boolean);
    const sayilar: { i: number; n: SayiOkuma }[] = [];
    parcalar.forEach((p, i) => { const n = /^[\d€$₺£]/.test(p) ? sayiOku(p) : null; if (n && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(p)) sayilar.push({ i, n }); });
    if (sayilar.length < 2) continue;
    const bi = parcalar.findIndex((p, i) => i > 0 && birimOku(p) !== null && sayiOku(parcalar[i - 1]!) !== null);
    const miktar = bi > 0 ? sayiOku(parcalar[bi - 1]!) : sayilar[0]!.n;
    const kalan = sayilar.filter((x) => x.n !== miktar && x.i !== bi - 1);
    const fiyat = kalan.length >= 2 ? kalan[kalan.length - 2]!.n : kalan[0]?.n ?? null;
    const tutar = kalan.length >= 2 ? kalan[kalan.length - 1]!.n : null;
    const ilkSayi = Math.min(...sayilar.map((x) => x.i), bi > 0 ? bi - 1 : Infinity);
    const ad = parcalar.slice(0, ilkSayi).join(' ').replace(/^\d+[.)]?\s*/, '');
    sonuc.push({
      satir: s, no: sonuc.length + 1, ad, kod: null, miktar, birim: bi > 0 ? birimOku(parcalar[bi]!) : null, birimHam: bi > 0 ? parcalar[bi]! : null,
      fiyat, tutar, terminGun: terminOku(s.metin, teklifTarihi), terminHam: null, tahmini: true, ek: NAKLIYE.test(sd) ? 'nakliye' : null,
    });
  }
  return sonuc;
}

/* ---------------- başlık bilgileri ---------------- */

export interface Alan<T> { deger: T | null; durum: Durum; not: string | null; satir: Satir | null }
export interface BaslikBilgileri {
  teklifNo: Alan<string>; tarih: Alan<string>; gecerlilik: Alan<string>; paraBirimi: Alan<ParaBirimi>; vadeGun: Alan<number>;
  iskontoYuzde: Alan<number>; toplam: Alan<number>; vergiNo: string | null; firmaAdi: string | null;
}
const alan = <T>(deger: T | null, satir: Satir | null = null, durum: Durum = deger === null ? 'yok' : 'emin', not: string | null = null): Alan<T> => ({ deger, durum, not, satir });

export function baslikOku(satirlar: readonly Satir[]): BaslikBilgileri {
  const bul = (d: RegExp) => satirlar.find((s) => d.test(sade(s.metin))) ?? null;
  const tarihS = bul(/\btarih\b|\bdate\b/);
  const tarih = tarihS ? tarihOku(tarihS.metin) : null;
  const ilkTarih = satirlar.map((s) => ({ s, t: tarihOku(s.metin) })).find((x) => x.t);
  const gecS = bul(/gecerli|gecerlilik|valid/);
  let gecerlilik = gecS ? tarihOku(gecS.metin) : null;
  const tarihSon = tarih ?? ilkTarih?.t ?? null;
  if (gecS && !gecerlilik && tarihSon) { const g = terminOku(gecS.metin); if (g !== null) gecerlilik = new Date(Date.parse(tarihSon) + g * 86400000).toISOString().slice(0, 10); }
  const vadeS = bul(/\bvade\b|odeme|payment/);
  const vade = vadeS ? (/\bpesin\b/.test(sade(vadeS.metin)) ? 0 : terminOku(vadeS.metin)) : null;
  const iskS = bul(/iskonto|indirim|discount/);
  const isk = iskS ? (sade(iskS.metin).match(/%\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%/) ?? null) : null;
  const iskDeger = isk ? sayiOku((isk[1] ?? isk[2])!)?.deger ?? null : null;
  const noS = bul(/teklif\s*no|offer\s*no|quotation\s*no/) ?? bul(/^no\s*[:.]/);
  const no = noS ? (noS.metin.match(/(?:teklif|offer|quotation)\s*no\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,40})/i)?.[1]
    ?? noS.metin.match(/^no\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,40})/i)?.[1] ?? null) : null;
  // Toplam: "genel toplam" öncelikli, yoksa son "toplam" satırı; satırdaki son sayı.
  const topS = bul(/genel\s*toplam|grand\s*total|net\s*toplam/) ?? [...satirlar].reverse().find((s) => /\btoplam\b|\btotal\b/.test(sade(s.metin))) ?? null;
  const topSayilari = topS ? topS.metin.split(/\s+/).map(sayiOku).filter((x): x is SayiOkuma => x !== null) : [];
  const toplam = topSayilari.length ? topSayilari[topSayilari.length - 1]! : null;
  // Para birimi: açık "para birimi" satırı, yoksa belgede en çok geçen simge.
  const pbS = bul(/para\s*birimi|currency|doviz/);
  let pb = pbS ? paraOku(pbS.metin) : null;
  if (!pb) {
    const say = new Map<ParaBirimi, number>();
    for (const s of satirlar) { const p = paraOku(s.metin); if (p) say.set(p, (say.get(p) ?? 0) + 1); }
    pb = [...say].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  const vergi = satirlar.map((s) => s.metin.match(/(?:vergi\s*no|vkn|v\.?\s*no|tax\s*(?:no|id))\s*[:.]?\s*(\d{10,11})/i)?.[1]).find(Boolean) ?? null;
  const firmaAdi = satirlar[0]?.metin ?? null;
  return {
    teklifNo: alan(no, noS), tarih: alan(tarih ?? ilkTarih?.t ?? null, tarihS ?? ilkTarih?.s ?? null, tarih ? 'emin' : ilkTarih ? 'kontrol' : 'yok', tarih ? null : ilkTarih ? 'Tarih satırı bulunamadı; belgedeki ilk tarih alındı.' : null),
    gecerlilik: alan(gecerlilik, gecS), paraBirimi: alan(pb, pbS, pb === null ? 'yok' : pbS ? 'emin' : 'kontrol', pb === null ? 'Para birimi bulunamadı; seçin.' : pbS ? null : 'Para birimi simgeden tahmin edildi.'),
    vadeGun: alan(vade, vadeS),
    // İskonto bulunsa da hiç "emin" değildir: fiyatlara uygulanmış mı, ayrıca mı uygulanacak kullanıcı seçer (varsayılan yok).
    iskontoYuzde: alan(iskDeger, iskS, iskDeger === null ? 'yok' : 'kontrol', iskDeger === null ? null : `Belgede "${iskS!.metin.slice(0, 80)}" yazıyor.`),
    toplam: alan(toplam?.deger ?? null, topS, toplam === null ? 'yok' : toplam.duzeltildi ? 'kontrol' : 'emin'),
    vergiNo: vergi, firmaAdi,
  };
}

/* ---------------- tedarikçi ---------------- */

export interface FirmaAdayi { id: string; ad: string; vergiNo: string }
/** Vergi numarası tutan ya da adı en çok benzeyen firma. Sonuç hiç "emin" değildir; kullanıcı onaylar. */
export function tedarikciBul(b: BaslikBilgileri, satirlar: readonly Satir[], firmalar: readonly FirmaAdayi[]): { id: string | null; neden: string } {
  if (b.vergiNo) {
    const f = firmalar.find((x) => x.vergiNo.replace(/\D/g, '') === b.vergiNo);
    if (f) return { id: f.id, neden: 'Vergi numarası eşleşti; onaylayın.' };
  }
  const ust = satirlar.slice(0, 8).map((s) => s.metin).join(' ');
  let en: { id: string; puan: number } | null = null;
  for (const f of firmalar) { const p = benzerlik(f.ad, ust); if (!en || p > en.puan) en = { id: f.id, puan: p }; }
  if (en && en.puan >= 0.6) return { id: en.id, neden: 'Firma adı belgedeki adla benziyor; onaylayın.' };
  return { id: null, neden: 'Tedarikçi tanınmadı; listeden seçin.' };
}

/* ---------------- eşleştirme ---------------- */

const DOLGU = new Set(['ve', 'ile', 'icin', 'mm', 'x', 'adet', 'kg', 'm', 'the', 'and']);
function kelimeler(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of sade(s).replace(/[.,%]/g, ' ').split(/\s+/)) {
    if (!k || DOLGU.has(k)) continue;
    m.set(k, /\d/.test(k) ? 2 : k.length <= 1 ? 0.3 : 1);
  }
  return m;
}
/** Kalem adının ağırlıklı kelimelerinden kaçı satırda var (0-1). Sayı taşıyan kelime (Ø50, 6061) iki kat sayılır. */
export function benzerlik(kalem: string, satir: string): number {
  const k = kelimeler(kalem), s = kelimeler(satir);
  let ortak = 0, toplam = 0;
  for (const [w, a] of k) { toplam += a; if (s.has(w)) ortak += a; }
  return toplam === 0 ? 0 : ortak / toplam;
}

export interface TalepKalemi { id: string; ad: string; kod: string | null; miktar: number | null; birim: string; karsilik: string | null }

export type KararTuru = 'satir' | 'birim' | 'fiyat' | 'tutar' | 'miktar';
export interface Eslesme {
  kalem: TalepKalemi;
  okunan: OkunanSatir | null;
  durum: Durum;
  nedenler: string[];
  /** Kalemin biriminde birim fiyat (çevrilmesi gerekirse çevirme kararından sonra). */
  fiyat: number | null;
  terminGun: number | null;
  /** Birim farkında kalem birimine çevirme çarpanı (kalem birimi başına teklif birimi), bilinmiyorsa null. */
  cevirmeCarpani: number | null;
  /** Kullanıcının vermesi gereken kararlar; boşalınca satır aktarılabilir. */
  bekleyen: KararTuru[];
}

const ESIK = 0.35, EMIN_ESIK = 0.6;

/** "≈ 14,2 kg" gibi karşılık metninden kalem birimi başına teklif birimi. */
export function karsilikCarpani(k: TalepKalemi, teklifBirimi: string | null): number | null {
  if (!k.karsilik || !k.miktar || !teklifBirimi) return null;
  const m = k.karsilik.match(/([\d.,]+)\s*([^\d\s]+)/);
  if (!m) return null;
  const n = sayiOku(m[1]!);
  if (!n || !birimAyniMi(m[2]!, teklifBirimi)) return null;
  return n.deger / k.miktar;
}

export function eslestir(kalemler: readonly TalepKalemi[], okunan: readonly OkunanSatir[]): { eslesmeler: Eslesme[]; artan: OkunanSatir[] } {
  const adaylar = okunan.filter((o) => o.ek === null);
  const ciftler: { k: number; o: number; p: number }[] = [];
  kalemler.forEach((k, ki) => adaylar.forEach((o, oi) => {
    const kodTutar = k.kod !== null && sade(o.satir.metin).includes(sade(k.kod));
    const p = kodTutar ? 1 : Math.max(benzerlik(k.ad, `${o.ad} ${o.kod ?? ''}`), benzerlik(k.ad, o.satir.metin) * 0.9)
      + (k.miktar !== null && o.miktar && Math.abs(o.miktar.deger - k.miktar) < 1e-9 ? 0.05 : 0);
    if (p >= ESIK) ciftler.push({ k: ki, o: oi, p });
  }));
  ciftler.sort((a, b) => b.p - a.p);
  const kAlindi = new Map<number, { o: number; p: number }>(), oAlindi = new Set<number>();
  for (const c of ciftler) if (!kAlindi.has(c.k) && !oAlindi.has(c.o)) { kAlindi.set(c.k, { o: c.o, p: c.p }); oAlindi.add(c.o); }
  const eslesmeler = kalemler.map((k, ki) => {
    const sec = kAlindi.get(ki);
    return satiriBagla(k, sec ? adaylar[sec.o]! : null, sec?.p ?? 0);
  });
  const artan = okunan.filter((o) => o.ek !== null || !oAlindi.has(adaylar.indexOf(o)));
  return { eslesmeler, artan };
}

/** Kalem ile PDF satırı bağı (kullanıcı başka satır seçtiğinde de bununla yeniden kurulur). */
export function satiriBagla(k: TalepKalemi, o: OkunanSatir | null, puan = 1): Eslesme {
  if (!o) return { kalem: k, okunan: null, durum: 'yok', nedenler: ['PDF\'te bu kaleme satır bulunamadı. Teklif verilmemiş sayılır; fiyat boş kalır.'], fiyat: null, terminGun: null, cevirmeCarpani: null, bekleyen: [] };
  const nedenler: string[] = [], bekleyen: KararTuru[] = [];
  if (puan < EMIN_ESIK) { nedenler.push('Ad tam tutmuyor; doğru satır mı bakın.'); bekleyen.push('satir'); }
  if (o.tahmini) { nedenler.push('Tablo başlığı bulunamadı; sütunlar tahminle ayrıldı.'); if (!bekleyen.includes('satir')) bekleyen.push('satir'); }
  if (!o.fiyat) { nedenler.push('Birim fiyat okunamadı; elle girin.'); bekleyen.push('fiyat'); }
  else if (o.fiyat.guvenDusuk && !o.fiyat.duzeltildi) { nedenler.push(`Fiyat taranmış sayfadan az güvenle okundu: ${sayiYaz(o.fiyat.deger)}. PDF'le karşılaştırıp onaylayın.`); bekleyen.push('fiyat'); }
  else if (o.fiyat.duzeltildi || o.fiyat.supheli) { nedenler.push(`Fiyatta "${o.fiyat.ham}" okundu; önerilen ${sayiYaz(o.fiyat.deger)}. PDF'le karşılaştırıp onaylayın.`); bekleyen.push('fiyat'); }
  if (o.miktar && (o.miktar.duzeltildi || o.miktar.supheli)) { nedenler.push(o.miktar.guvenDusuk && !o.miktar.duzeltildi ? `Miktar taranmış sayfadan az güvenle okundu: ${sayiYaz(o.miktar.deger)}.` : `Miktarda "${o.miktar.ham}" okundu; önerilen ${sayiYaz(o.miktar.deger)}.`); bekleyen.push('miktar'); }
  let carpan: number | null = null;
  if (o.birim !== null && !birimAyniMi(o.birim, k.birim)) {
    carpan = karsilikCarpani(k, o.birim);
    nedenler.push(carpan !== null
      ? `Birim farklı: teklif ${o.birim}, kalem ${k.birim}. Kalem kartına göre 1 ${k.birim} = ${sayiYaz(carpan)} ${o.birim}; fiyat ${sayiYaz((o.fiyat?.deger ?? 0) * carpan)} / ${k.birim} olarak çevrilsin mi?`
      : `Birim farklı: teklif ${o.birim}, kalem ${k.birim}. Karşılık bilinmiyor; fiyatı ${k.birim} başına elle girin.`);
    bekleyen.push('birim');
  }
  if (o.miktar && o.fiyat && o.tutar && !tutarTutar(o.miktar.deger * o.fiyat.deger, o.tutar.deger)) {
    nedenler.push(`Miktar × fiyat (${sayiYaz(o.miktar.deger * o.fiyat.deger)}) satır tutarını (${sayiYaz(o.tutar.deger)}) tutmuyor.`);
    bekleyen.push('tutar');
  }
  return { kalem: k, okunan: o, durum: bekleyen.length ? 'kontrol' : 'emin', nedenler, fiyat: o.fiyat?.deger ?? null, terminGun: o.terminGun, cevirmeCarpani: carpan, bekleyen };
}

const tutarTutar = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.005);

/** Kullanıcı bir kararı verince: bekleyen listeden düşer; birim kararında fiyat çevrilir ya da elle girilen kalır. */
export function kararVer(e: Eslesme, tur: KararTuru, secim: { cevir?: boolean; fiyat?: number | null } = {}): Eslesme {
  const bekleyen = e.bekleyen.filter((x) => x !== tur);
  let fiyat = e.fiyat;
  if (tur === 'birim' && secim.cevir && e.cevirmeCarpani !== null && e.okunan?.fiyat) fiyat = yuvarla(e.okunan.fiyat.deger * e.cevirmeCarpani, 4);
  if (secim.fiyat !== undefined) fiyat = secim.fiyat;
  // Birim farkında çevrilmeden ya da elle fiyat girilmeden karar kapanmaz: teklif satırı kalemin biriminde fiyat tutar.
  if (tur === 'birim' && !secim.cevir && secim.fiyat === undefined) return e;
  // Verilen karar sorusuyla kalmaz: çevirme sorusu yerine yapılan çevirme yazılır.
  const nedenler = tur === 'birim' && secim.cevir && fiyat !== null && e.okunan?.fiyat
    ? e.nedenler.map((n) => (n.endsWith('çevrilsin mi?') ? `Çevrildi: ${sayiYaz(e.okunan!.fiyat!.deger)} / ${e.okunan!.birim ?? e.okunan!.birimHam ?? ''} yerine ${sayiYaz(fiyat)} / ${e.kalem.birim}.` : n))
    : e.nedenler;
  return { ...e, bekleyen, fiyat, nedenler, durum: bekleyen.length ? 'kontrol' : e.okunan ? 'emin' : 'yok' };
}

/* ---------------- toplam ve kararlar ---------------- */

export type IskontoSecimi = 'uygulanmis' | 'ayrica' | null;
export interface OkumaKarari {
  tedarikciId: string | null; tedarikciOnay: boolean; paraBirimi: ParaBirimi | null; iskonto: IskontoSecimi;
}

/** PDF satırlarından hesaplanan toplam (PDF'in genel toplamıyla karşılaştırmak için): her satırda miktar × fiyat (kullanıcının
 * düzelttiği fiyat, birimi çevrilmemişse), yoksa satır tutarı; nakliye satırı dahil. İskonto ayrıca uygulanacaksa düşülür. */
export function hesaplananToplam(okunan: readonly OkunanSatir[], l: readonly Eslesme[], iskontoYuzde: number | null, iskonto: IskontoSecimi): number {
  let mal = 0;
  for (const o of okunan) {
    const e = l.find((x) => x.okunan === o);
    const f = e && e.cevirmeCarpani === null && e.fiyat !== null ? e.fiyat : o.fiyat?.deger ?? null;
    const m = o.miktar?.deger ?? (o.ek ? 1 : null);
    if (f !== null && m !== null) mal += f * m;
    else if (o.tutar) mal += o.tutar.deger;
  }
  if (iskonto === 'ayrica' && iskontoYuzde) mal *= 1 - iskontoYuzde / 100;
  return yuvarla(mal, 2);
}
export const toplamTutarMi = (pdf: number | null, hesap: number): boolean | null => (pdf === null ? null : tutarTutar(hesap, pdf));

/** Aktarmadan önce verilmesi gereken kararların sayısı; her karar ayrı sayılır. */
export function bekleyenKararlar(l: readonly Eslesme[], b: BaslikBilgileri, k: OkumaKarari): string[] {
  const liste: string[] = [];
  if (!k.tedarikciId) liste.push('Tedarikçi seçilmedi');
  else if (!k.tedarikciOnay) liste.push('Tedarikçi onaylanmadı');
  if (!k.paraBirimi) liste.push('Para birimi seçilmedi');
  if (b.iskontoYuzde.deger !== null && k.iskonto === null) liste.push('İskonto: uygulanmış mı, ayrıca mı?');
  for (const e of l) for (const t of e.bekleyen) liste.push(`${e.kalem.ad}: ${KARAR_ADI[t]}`);
  return liste;
}
const KARAR_ADI: Record<KararTuru, string> = { satir: 'satır onayı', birim: 'birim çevirme', fiyat: 'fiyat onayı', tutar: 'tutar farkı', miktar: 'miktar onayı' };

/* ---------------- yardımcılar ---------------- */

export const yuvarla = (n: number, b: number): number => Math.round(n * 10 ** b) / 10 ** b;
export function sayiYaz(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}
