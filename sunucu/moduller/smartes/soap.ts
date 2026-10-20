// SmartES SOAP 1.1 (ASMX) zarfı ve cevap ayrıştırıcısı (kart #778). Saf: ağ, saat ve veritabanı yok.
// Yeni paket yok: SmartES'in ürettiği dar XML alt kümesini (öğe, nitelik, metin, CDATA, yorum, işleme talimatı) okur;
// DTD ve tanımsız varlık reddedilir (varlık genişletme saldırısı yok).

export const SOAP_ZARF_AD_ALANI = 'http://schemas.xmlsoap.org/soap/envelope/';
// Cevap metninin üst sınırı: liste metotları büyük gelebilir, sınırsız okuma belleği tüketir.
export const AZAMI_CEVAP_UZUNLUGU = 32 * 1024 * 1024;
const AZAMI_DERINLIK = 256;
// SmartES sunucusunun saat dilimi (VARSAYIM: atölyeyle aynı yerde). Tarih parametreleri ofsetsiz bu saatle yazılır (brief tuzak 4).
export const VARSAYILAN_SAAT_DILIMI = 'Europe/Istanbul';

export interface XmlOgesi {
  // Öneksiz ad (soap:Body -> Body); ad alanı çözülmez, SmartES cevabında yerel adlar tekil.
  ad: string;
  nitelikler: Record<string, string>;
  cocuklar: XmlOgesi[];
  // Doğrudan metin içeriği (çocuk öğelerin metni dahil değil), varlıkları çözülmüş.
  metin: string;
}

export class XmlHatasi extends Error {
  constructor(ileti: string) {
    super(ileti);
    this.name = 'XmlHatasi';
  }
}

const AD_KALIBI = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;
const PARAMETRE_ADI = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function xmlKacir(metin: string): string {
  return metin.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// XML 1.0'da yazılamayan denetim karakterleri (sekme, satır sonu hariç) SOAP ayrıştırıcısını düşürür; gönderimden önce atılır.
function yazilabilir(metin: string): string {
  let sonuc = '';
  for (const k of metin) {
    const n = k.codePointAt(0) ?? 0;
    if ((n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0xfffe || n === 0xffff) continue;
    sonuc += k;
  }
  return sonuc;
}

const VARLIKLAR: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function varlikCoz(ham: string): string {
  if (/&(?![^;&\s]{1,10};)/.test(ham)) throw new XmlHatasi('Kaçırılmamış & işareti.');
  return ham.replace(/&([^;&\s]{1,10});/g, (_, ad: string) => {
    if (ad.startsWith('#x') || ad.startsWith('#X')) return kodNoktasi(Number.parseInt(ad.slice(2), 16));
    if (ad.startsWith('#')) return kodNoktasi(Number.parseInt(ad.slice(1), 10));
    const k = VARLIKLAR[ad];
    if (k === undefined) throw new XmlHatasi(`Tanımsız XML varlığı: &${ad};`);
    return k;
  });
}

// XML'de yasak karakter başvurusu (&#0;, vekil, aralık dışı) cevabı düşürmez, yerine U+FFFD yazılır: tek bozuk alan bütün
// okuma penceresini her turda reddettirirdi (KD-044) ve NUL veritabanı metnine yazılamaz.
const YERINE = '\uFFFD';
function kodNoktasi(n: number): string {
  if (!Number.isInteger(n) || n < 0x09 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) || n === 0xfffe || n === 0xffff) return YERINE;
  if (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) return YERINE;
  return String.fromCodePoint(n);
}

const yerelAd = (ad: string): string => {
  const i = ad.indexOf(':');
  return i === -1 ? ad : ad.slice(i + 1);
};

export function xmlAyristir(metin: string): XmlOgesi {
  if (metin.length > AZAMI_CEVAP_UZUNLUGU) throw new XmlHatasi('Cevap çok büyük.');
  // Ham NUL da aynı nedenle yer değiştirir.
  metin = metin.split('\u0000').join(YERINE);
  let i = metin.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = metin.length;
  const yigin: XmlOgesi[] = [];
  const adlar: string[] = [];
  let kok: XmlOgesi | null = null;

  const bul = (aranan: string, baslangic: number): number => {
    const j = metin.indexOf(aranan, baslangic);
    if (j === -1) throw new XmlHatasi(`Beklenen "${aranan}" bulunamadı.`);
    return j;
  };

  while (i < n) {
    const lt = metin.indexOf('<', i);
    const metinParcasi = lt === -1 ? metin.slice(i) : metin.slice(i, lt);
    if (metinParcasi !== '') {
      const ust = yigin[yigin.length - 1];
      if (ust) ust.metin += varlikCoz(metinParcasi);
      else if (metinParcasi.trim() !== '') throw new XmlHatasi('Kök öğe dışında metin.');
    }
    if (lt === -1) break;
    i = lt;
    if (metin.startsWith('<?', i)) {
      i = bul('?>', i + 2) + 2;
    } else if (metin.startsWith('<!--', i)) {
      i = bul('-->', i + 4) + 3;
    } else if (metin.startsWith('<![CDATA[', i)) {
      const son = bul(']]>', i + 9);
      const ust = yigin[yigin.length - 1];
      if (!ust) throw new XmlHatasi('Kök öğe dışında CDATA.');
      ust.metin += metin.slice(i + 9, son);
      i = son + 3;
    } else if (metin.startsWith('<!', i)) {
      throw new XmlHatasi('DTD ve bildirimler kabul edilmez.');
    } else if (metin.startsWith('</', i)) {
      const son = bul('>', i + 2);
      const ad = metin.slice(i + 2, son).trim();
      const beklenen = adlar.pop();
      if (beklenen !== ad) throw new XmlHatasi(`Kapanış etiketi eşleşmiyor: ${ad}`);
      yigin.pop();
      i = son + 1;
    } else {
      // Açılış etiketi: ad, nitelikler, isteğe bağlı '/'.
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(metin[j] ?? '')) j++;
      const ad = metin.slice(i + 1, j);
      if (!AD_KALIBI.test(ad)) throw new XmlHatasi('Geçersiz öğe adı.');
      const nitelikler: Record<string, string> = {};
      let kendiKapali = false;
      for (;;) {
        while (j < n && /\s/.test(metin[j] ?? '')) j++;
        if (j >= n) throw new XmlHatasi('Etiket kapanmadan bitti.');
        if (metin[j] === '>') { j++; break; }
        if (metin.startsWith('/>', j)) { kendiKapali = true; j += 2; break; }
        const esit = metin.indexOf('=', j);
        if (esit === -1) throw new XmlHatasi('Nitelik değeri yok.');
        const nAd = metin.slice(j, esit).trim();
        if (!AD_KALIBI.test(nAd)) throw new XmlHatasi('Geçersiz nitelik adı.');
        let k = esit + 1;
        while (k < n && /\s/.test(metin[k] ?? '')) k++;
        const tirnak = metin[k];
        if (tirnak !== '"' && tirnak !== "'") throw new XmlHatasi('Nitelik değeri tırnaksız.');
        const kapanis = bul(tirnak, k + 1);
        const deger = metin.slice(k + 1, kapanis);
        if (deger.includes('<')) throw new XmlHatasi('Nitelik değerinde <.');
        nitelikler[nAd] = varlikCoz(deger);
        j = kapanis + 1;
      }
      const oge: XmlOgesi = { ad: yerelAd(ad), nitelikler, cocuklar: [], metin: '' };
      const ust = yigin[yigin.length - 1];
      if (ust) ust.cocuklar.push(oge);
      else if (kok) throw new XmlHatasi('Birden çok kök öğe.');
      else kok = oge;
      if (!kendiKapali) {
        if (yigin.length >= AZAMI_DERINLIK) throw new XmlHatasi('XML çok derin.');
        yigin.push(oge);
        adlar.push(ad);
      }
      i = j;
    }
  }
  if (adlar.length > 0) throw new XmlHatasi(`Kapanmamış öğe: ${adlar[adlar.length - 1] ?? ''}`);
  if (!kok) throw new XmlHatasi('Boş belge.');
  return kok;
}

export const cocuk = (oge: XmlOgesi | undefined, ad: string): XmlOgesi | undefined => oge?.cocuklar.find((c) => c.ad === ad);

function torunBul(oge: XmlOgesi, ad: string): XmlOgesi | undefined {
  for (const c of oge.cocuklar) {
    if (c.ad === ad) return c;
    const d = torunBul(c, ad);
    if (d) return d;
  }
  return undefined;
}

// WSDL'deki metot adları: portType altındaki operation öğelerinin name niteliği (SOAP 1.1 ve 1.2 portType'ı aynı adları taşır).
export function wsdlMetotlari(metin: string): string[] {
  const kok = xmlAyristir(metin);
  if (kok.ad !== 'definitions') throw new XmlHatasi('WSDL değil: kök öğe definitions değil.');
  const adlar = new Set<string>();
  for (const p of kok.cocuklar.filter((c) => c.ad === 'portType')) {
    for (const o of p.cocuklar) if (o.ad === 'operation' && o.nitelikler['name']) adlar.add(o.nitelikler['name']);
  }
  return [...adlar].sort();
}

// --- Gönderim ---------------------------------------------------------------

export type ParametreDegeri = string | number | boolean | Date | null;
export type Parametreler = readonly (readonly [string, ParametreDegeri])[];

// SmartES ofsetsiz yerel saat bekler (yyyy-MM-ddTHH:mm:ss); Z ya da +03:00 yazılmaz (brief tuzak 4).
export function smartesTarihi(an: Date, saatDilimi: string = VARSAYILAN_SAAT_DILIMI): string {
  if (Number.isNaN(an.getTime())) throw new RangeError('Geçersiz tarih.');
  const parcalar = new Intl.DateTimeFormat('en-CA', {
    timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(an);
  const p = (tur: Intl.DateTimeFormatPartTypes): string => parcalar.find((x) => x.type === tur)?.value ?? '00';
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}`;
}

function parametreMetni(deger: ParametreDegeri, saatDilimi: string): string {
  if (deger === null) return '';
  if (typeof deger === 'boolean') return deger ? 'true' : 'false';
  if (typeof deger === 'number') {
    if (!Number.isFinite(deger)) throw new RangeError('Sayı parametresi sonlu olmalı.');
    // Nokta ayraçlı, üstel gösterimsiz (invariant culture).
    return Number.isInteger(deger) ? String(deger) : deger.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (deger instanceof Date) return smartesTarihi(deger, saatDilimi);
  return xmlKacir(yazilabilir(deger));
}

export interface SoapIstegi {
  govde: string;
  soapAction: string;
}

export function soapIstegiKur(metot: string, adAlani: string, parametreler: Parametreler, saatDilimi: string = VARSAYILAN_SAAT_DILIMI): SoapIstegi {
  if (!PARAMETRE_ADI.test(metot)) throw new RangeError('Geçersiz metot adı.');
  const satirlar = parametreler.map(([ad, deger]) => {
    if (!PARAMETRE_ADI.test(ad)) throw new RangeError(`Geçersiz parametre adı: ${ad}`);
    return `      <${ad}>${parametreMetni(deger, saatDilimi)}</${ad}>`;
  });
  const govde = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="${SOAP_ZARF_AD_ALANI}">`,
    '  <soap:Body>',
    `    <${metot} xmlns="${xmlKacir(adAlani)}">`,
    ...satirlar,
    `    </${metot}>`,
    '  </soap:Body>',
    '</soap:Envelope>',
  ].join('\n');
  // SOAPAction tırnak içinde gider; boş ya da tırnaksız başlıkta ASMX 500 dönebilir (brief 3.2).
  return { govde, soapAction: `"${adAlani}${metot}"` };
}

// --- Cevap ------------------------------------------------------------------

export type CevapYorumu<T> = { tur: 'basarili'; deger: T } | { tur: 'fault'; ileti: string } | { tur: 'bozuk'; ileti: string };

const AZAMI_ILETI = 500;
const kirp = (s: string): string => (s.length > AZAMI_ILETI ? `${s.slice(0, AZAMI_ILETI)}…` : s);

function govdeAl(metin: string): CevapYorumu<XmlOgesi> {
  let kok: XmlOgesi;
  try {
    kok = xmlAyristir(metin);
  } catch (h) {
    return { tur: 'bozuk', ileti: h instanceof XmlHatasi ? `Cevap XML değil: ${h.message}` : 'Cevap XML değil.' };
  }
  const govde = kok.ad === 'Envelope' ? cocuk(kok, 'Body') : undefined;
  if (!govde) return { tur: 'bozuk', ileti: 'SOAP zarfı yok.' };
  const fault = cocuk(govde, 'Fault');
  if (fault) {
    const ileti = cocuk(fault, 'faultstring')?.metin.trim() || cocuk(fault, 'faultcode')?.metin.trim() || 'SOAP hatası.';
    return { tur: 'fault', ileti: kirp(ileti) };
  }
  return { tur: 'basarili', deger: govde };
}

function sonucOgesi(metin: string, metot: string): CevapYorumu<XmlOgesi> {
  const g = govdeAl(metin);
  if (g.tur !== 'basarili') return g;
  const cevap = cocuk(g.deger, `${metot}Response`);
  if (!cevap) return { tur: 'bozuk', ileti: `${metot}Response öğesi yok.` };
  const sonuc = cocuk(cevap, `${metot}Result`);
  if (!sonuc) return { tur: 'bozuk', ileti: `${metot}Result öğesi yok.` };
  return { tur: 'basarili', deger: sonuc };
}

export interface SkalerSonuc {
  etkilenen: number;
  // Boş değilse SmartES işlemi reddetti.
  hata: string | null;
}

// Create/Update/Delete cevabı: AffectedRows + ErrorMessage. AffectedRows=0 ve boş hata "değişiklik yok"tur, hata değil (brief tuzak 6).
export function skalerSonucuOku(metin: string, metot: string): CevapYorumu<SkalerSonuc> {
  const s = sonucOgesi(metin, metot);
  if (s.tur !== 'basarili') return s;
  const etkilenenMetni = cocuk(s.deger, 'AffectedRows')?.metin.trim();
  if (etkilenenMetni === undefined || !/^-?\d+$/.test(etkilenenMetni)) return { tur: 'bozuk', ileti: 'AffectedRows okunamadı.' };
  const hata = cocuk(s.deger, 'ErrorMessage')?.metin.trim() ?? '';
  return { tur: 'basarili', deger: { etkilenen: Number(etkilenenMetni), hata: hata === '' ? null : kirp(hata) } };
}

// Satır alanları SmartES'teki adlarıyla (BÜYÜK_HARF_SNAKE_CASE); boş ya da gelmeyen alan satırda yoktur.
export type TabloSatiri = Readonly<Record<string, string>>;

const DIFFGRAM_YAN_OGELERI = new Set(['before', 'errors']);

// DataSet cevabı: diffgram/NewDataSet/Table satırları. Diffgram yoksa ya da boşsa liste boştur.
export function tabloSatirlariniOku(metin: string, metot: string): CevapYorumu<TabloSatiri[]> {
  const s = sonucOgesi(metin, metot);
  if (s.tur !== 'basarili') return s;
  const diffgram = torunBul(s.deger, 'diffgram');
  if (!diffgram) return { tur: 'basarili', deger: [] };
  const veri = diffgram.cocuklar.find((c) => !DIFFGRAM_YAN_OGELERI.has(c.ad));
  if (!veri) return { tur: 'basarili', deger: [] };
  const satirlar = veri.cocuklar.map((satir) => {
    const alanlar: Record<string, string> = {};
    for (const alan of satir.cocuklar) {
      if (alan.metin !== '' && alan.cocuklar.length === 0) alanlar[alan.ad] = alan.metin;
    }
    return alanlar;
  });
  return { tur: 'basarili', deger: satirlar };
}

// --- Alan dönüştürücüler (satırdan tipli değere; yoksa ya da bozuksa null) ----

export function tamSayi(satir: TabloSatiri, alan: string): number | null {
  const d = satir[alan]?.trim();
  if (d === undefined || !/^-?\d+$/.test(d)) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}

export function mantiksal(satir: TabloSatiri, alan: string): boolean | null {
  const d = satir[alan]?.trim().toLowerCase();
  if (d === 'true' || d === '1') return true;
  if (d === 'false' || d === '0') return false;
  return null;
}

export function metinAlani(satir: TabloSatiri, alan: string): string | null {
  const d = satir[alan]?.trim();
  return d === undefined || d === '' ? null : d;
}

// DataSet tarihleri ofsetli (2026-10-07T08:00:00+03:00) ya da ofsetsiz gelebilir; ofsetsizi SmartES'in saat dilimiyle yorumlar.
export function tarihAlani(satir: TabloSatiri, alan: string, saatDilimi: string = VARSAYILAN_SAAT_DILIMI): Date | null {
  const d = satir[alan]?.trim();
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(d);
  if (!m) return null;
  if (m[8]) {
    const an = new Date(d);
    return Number.isNaN(an.getTime()) ? null : an;
  }
  const [yil, ay, gun, saat, dakika, saniye] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const milisaniye = m[7] ? Math.round(Number(m[7]) * 1000) : 0;
  const duvar = Date.UTC(yil, ay - 1, gun, saat, dakika, saniye, milisaniye);
  // Duvar saatini o dilimdeki ana çevir: ofseti tahminde ölç, bir kez düzelt (yaz saati geçişinde de tutar).
  let an = duvar - ofsetMs(duvar, saatDilimi);
  an = duvar - ofsetMs(an, saatDilimi);
  return new Date(an);
}

function ofsetMs(an: number, saatDilimi: string): number {
  const yerel = smartesTarihi(new Date(an), saatDilimi);
  const [t, s] = yerel.split('T') as [string, string];
  const [y, a, g] = t.split('-').map(Number) as [number, number, number];
  const [sa, dk, sn] = s.split(':').map(Number) as [number, number, number];
  return Date.UTC(y, a - 1, g, sa, dk, sn) - Math.floor(an / 1000) * 1000;
}
