// 3063 dilim 3: fotoğraftan okunan irsaliye metninden öneriler. Saf kural: okunan değer yalnız öneridir, kişi "Kullan" demeden
// hiçbir alana yazılmaz (3054 a). Tesseract satır satır metin verir; etiket ile değer aynı satırdadır ya da etiket satır sonundadır.

export interface OkunanBilgiler { irsaliyeNo: string | null; siparisNo: string | null; tarih: string | null }

export const BOS_OKUMA: OkunanBilgiler = { irsaliyeNo: null, siparisNo: null, tarih: null };

const NO_SINIRI = 30;

// Türkçe büyük/küçük harf ve OCR'ın sık karıştırdığı noktalı/noktasız harfler aynı sayılır; etiket eşlemesi için.
function sade(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/[ıi̇]/g, 'i').replace(/[şs]/g, 's').replace(/[ğg]/g, 'g').replace(/[üu]/g, 'u').replace(/[öo]/g, 'o').replace(/[çc]/g, 'c');
}

const IRSALIYE_ETIKETI = /(?:e-?\s*)?irsaliye\s*(?:no|numarasi|nu)\b|seri\s*(?:-|\/)?\s*sira\s*no\b|belge\s*no\b/;
const SIPARIS_ETIKETI = /siparis\s*(?:no|numarasi)\b|sip\.?\s*no\b/;
const TARIH_ETIKETI = /irsaliye\s*tarihi|duzenleme\s*tarihi|sevk\s*tarihi|\btarih(?:i)?\b/;
// e-İrsaliye numarası: 3 harf, 4 hane yıl, 9 hane sıra (16 karakter). VARSAYIM (GİB e-belge biçimi); yalnız etiket yoksa aranır.
const E_BELGE_NO = /\b([A-Z0-9]{3}20\d{2}\d{9})\b/;
const NO_DEGERI = /^[\s:.;=#-]*([A-Za-z0-9ÇĞİÖŞÜçğıöşü][A-Za-z0-9ÇĞİÖŞÜçğıöşü/._-]*)/;
const TARIH = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/;

// Etiketin hemen arkasındaki değer; satırda yoksa sonraki satırın başı (tablo biçimli irsaliyelerde değer alttadır).
function etikettenSonra(satirlar: readonly string[], etiket: RegExp): string[] {
  const sonuc: string[] = [];
  satirlar.forEach((satir, i) => {
    const m = etiket.exec(sade(satir));
    if (!m) return;
    const kalan = satir.slice(m.index + m[0].length);
    sonuc.push(kalan.trim() === '' || /^[\s:.;=#-]*$/.test(kalan) ? (satirlar[i + 1] ?? '') : kalan);
  });
  return sonuc;
}

function noDegeri(metin: string): string | null {
  const m = NO_DEGERI.exec(metin);
  const deger = m?.[1]?.replace(/[._/-]+$/, '') ?? '';
  return deger.length >= 3 && deger.length <= NO_SINIRI && /\d/.test(deger) ? deger : null;
}

export function gecerliTarih(gun: number, ay: number, yil: number): boolean {
  if (yil < 2000 || yil > 2099 || ay < 1 || ay > 12 || gun < 1) return false;
  return gun <= new Date(Date.UTC(yil, ay, 0)).getUTCDate();
}

function tarihDegeri(metin: string): string | null {
  // OCR rakam yerine harf okuyabilir: yalnız tarih beklenen yerde O->0, l/I->1.
  const m = TARIH.exec(metin.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1'));
  if (!m) return null;
  const [gun, ay, yil] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return gecerliTarih(gun, ay, yil) ? `${String(gun).padStart(2, '0')}.${String(ay).padStart(2, '0')}.${yil}` : null;
}

function ilki<T>(adaylar: readonly string[], ayikla: (s: string) => T | null): T | null {
  for (const a of adaylar) {
    const d = ayikla(a);
    if (d !== null) return d;
  }
  return null;
}

export function okunanBilgiler(metin: string): OkunanBilgiler {
  const satirlar = metin.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '');
  const irsaliyeNo = ilki(etikettenSonra(satirlar, IRSALIYE_ETIKETI), noDegeri) ?? E_BELGE_NO.exec(metin)?.[1] ?? null;
  return {
    irsaliyeNo,
    siparisNo: ilki(etikettenSonra(satirlar, SIPARIS_ETIKETI), noDegeri),
    tarih: ilki(etikettenSonra(satirlar, TARIH_ETIKETI), tarihDegeri),
  };
}

// Çok sayfalı irsaliyede her bilgi ilk bulunduğu sayfadan alınır.
export function sayfalariBirlestir(sayfalar: readonly OkunanBilgiler[]): OkunanBilgiler {
  const al = (k: keyof OkunanBilgiler) => sayfalar.find((s) => s[k] !== null)?.[k] ?? null;
  return { irsaliyeNo: al('irsaliyeNo'), siparisNo: al('siparisNo'), tarih: al('tarih') };
}

// Okunan tarih (GG.AA.YYYY) tarih alanının değerine (YYYY-AA-GG) çevrilir.
export function tarihGirdisi(tarih: string): string {
  const [g, a, y] = tarih.split('.');
  return `${y ?? ''}-${a ?? ''}-${g ?? ''}`;
}

export function bilgiVarMi(b: OkunanBilgiler): boolean {
  return b.irsaliyeNo !== null || b.siparisNo !== null || b.tarih !== null;
}

// Alandaki irsaliye no okunanla aynı mı (boşluk ve harf büyüklüğü sayılmaz).
export function ayniNo(a: string, b: string): boolean {
  const n = (s: string) => sade(s.replace(/\s+/g, ''));
  return n(a) !== '' && n(a) === n(b);
}

// PDF metin katmanı parça parça gelir; aynı yükseklikteki parçalar soldan sağa tek satır olur (etiket ve değer aynı satırda aranır).
export interface PdfMetinParcasi { str: string; x: number; y: number }
export function pdfSatirlari(parcalar: readonly PdfMetinParcasi[]): string {
  const satirlar: { y: number; p: PdfMetinParcasi[] }[] = [];
  for (const p of parcalar) {
    if (p.str.trim() === '') continue;
    const s = satirlar.find((x) => Math.abs(x.y - p.y) <= 2);
    if (s) s.p.push(p); else satirlar.push({ y: p.y, p: [p] });
  }
  // PDF'te y aşağıdan yukarı artar: üst satır önce gelir.
  return satirlar.sort((a, b) => b.y - a.y).map((s) => s.p.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(' ')).join('\n');
}

// Taranmış PDF'te metin katmanı yoktur ya da birkaç harftir; o sayfa resim olarak okunur.
export function metinYeterli(metin: string): boolean {
  return metin.replace(/[^\p{L}\p{N}]/gu, '').length >= 20;
}

// Tesseract sayfasının çözünürlüğü: sayfanın uzun kenarı A4 uzun kenarı (842 pt) olur; PDF'te sayfa bugünkü A4 sayfayla aynı boyda durur.
export function sayfaCozunurlugu(en: number, boy: number): number {
  return Math.max(72, Math.round((Math.max(en, boy) * 72) / 841.89));
}
