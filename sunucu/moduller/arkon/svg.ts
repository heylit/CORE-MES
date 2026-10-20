// Arkon çiziminin svg metni ekranda `dangerouslySetInnerHTML` ile basılır (arkon/web/src/app/teknik-resim.ts); hazır sonuç
// paket belgesinden gelebildiği için metin yazılırken denetlenir. Katı ayrıştırıcı: beyaz liste dışı her şey ret, şüphede ret.
// Biçim Arkon'un üretecinden çıkarıldı (core/stepdraw.ts): çift tırnaklı öznitelikler, `&amp; &lt; &gt; &quot;` varlıkları,
// g, path, line, circle, rect, text etiketleri ve `style` içinde yalnız animation-delay ile font-size.

const ETIKETLER = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'defs', 'clipPath', 'use', 'title', 'desc',
]);
const METIN_ETIKETLERI = new Set(['text', 'tspan', 'title', 'desc']);

const OZNITELIKLER = new Set([
  'class', 'id', 'style', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'transform',
  'viewBox', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'font-size', 'font-family', 'font-weight',
  'text-anchor', 'dominant-baseline', 'pathLength', 'clip-path', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'vector-effect',
  'shape-rendering', 'xmlns', 'xmlns:xlink', 'href', 'xlink:href',
]);

const STIL_OZELLIKLERI = new Set([
  'animation-delay', 'font-size', 'font-weight', 'fill', 'stroke', 'stroke-width', 'opacity', 'text-anchor', 'stroke-dasharray',
]);

const VARLIKLAR: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const AZAMI_UZUNLUK = 4 * 1024 * 1024;
const AZAMI_DERINLIK = 64;

// Yalnız beş adlı varlık çözülür; sayısal ya da başka varlık (&#x6A; vb.) kabul edilmez. Çözülemezse null.
function varlikCoz(metin: string): string | null {
  let cikti = '';
  let son = 0;
  for (const eslesme of metin.matchAll(/&([^;& \t\n\f\r]{1,8});?/g)) {
    const ad = eslesme[1];
    if (ad === undefined || !Object.hasOwn(VARLIKLAR, ad) || !eslesme[0].endsWith(';')) return null;
    cikti += metin.slice(son, eslesme.index) + VARLIKLAR[ad];
    son = (eslesme.index ?? 0) + eslesme[0].length;
  }
  if (metin.slice(son).includes('&')) return null;
  return cikti + metin.slice(son);
}

const KONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ID = /^cz-[A-Za-z0-9_-]{1,60}$/;
const IC_BASVURU = /^#cz-[A-Za-z0-9_-]{1,60}$/;
const SINIF = /^[A-Za-z0-9 _-]{0,120}$/;
// Sayı, yol komutu, birim, renk, dönüşüm işlevi: tırnak, iki nokta, noktalı virgül, eğik çizgi, ters eğik çizgi ve açılı ayraç yok.
const GENEL = /^[-+0-9A-Za-z.,# \t\n\f\r%()]*$/;
const TEHLIKELI = /javascript|vbscript|data|expression|import|script/;
// Ayırıcı yalnız HTML boşluğudur (boşluk, sekme, satır sonu, form besleme, satır başı): NBSP, VT, BOM ve öteki Unicode boşlukları ayırıcı değildir.
const kirp = (s: string): string => s.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');

// `url(` yalnız aynı belgedeki `url(#cz-...)` olabilir.
const IC_URL = /url\(#cz-[A-Za-z0-9_-]{1,60}\)/gi;
function urlGuvenli(deger: string): boolean {
  const kalan = deger.replaceAll(IC_URL, '');
  return !/url[ \t\n\f\r]*\(/i.test(kalan);
}

// Stil değerinde işlev yalnız iç `url(#cz-...)` olabilir; image-set(, element(, cross-fade( gibi her başka işlev reddedilir.
function stilGuvenli(deger: string): boolean {
  if (/[\\@/<>"'`&]/.test(deger)) return false;
  for (const bildirim of deger.split(';')) {
    if (kirp(bildirim) === '') continue;
    const bolum = bildirim.split(':');
    const ozellik = kirp(bolum[0] ?? '');
    const icerik = bolum[1];
    if (bolum.length !== 2 || icerik === undefined || !STIL_OZELLIKLERI.has(ozellik)) return false;
    if (!GENEL.test(icerik) || !urlGuvenli(icerik) || icerik.replaceAll(IC_URL, '').includes('(') || TEHLIKELI.test(icerik.toLowerCase())) return false;
  }
  return true;
}

function ozellikGuvenli(etiket: string, ad: string, ham: string): boolean {
  if (!OZNITELIKLER.has(ad)) return false;
  const deger = varlikCoz(ham);
  if (deger === null || KONTROL.test(deger) || /[<>"'`\\]/.test(deger)) return false;
  switch (ad) {
    case 'href':
    case 'xlink:href': return etiket === 'use' && IC_BASVURU.test(deger);
    case 'id': return ID.test(deger);
    case 'class': return SINIF.test(deger);
    case 'style': return stilGuvenli(deger);
    case 'xmlns': return deger === 'http://www.w3.org/2000/svg';
    case 'xmlns:xlink': return deger === 'http://www.w3.org/1999/xlink';
    default: {
      const sade = deger.replaceAll(/[ \t\n\f\r]+/g, '').toLowerCase();
      return GENEL.test(deger) && urlGuvenli(deger) && !TEHLIKELI.test(sade);
    }
  }
}

const ACILIS = /<([A-Za-z][A-Za-z0-9]*)/y;
const OZNITELIK = /[ \t\n\f\r]+([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/y;
const ACILIS_SONU = /[ \t\n\f\r]*(\/?)>/y;
const KAPANIS = /<\/([A-Za-z][A-Za-z0-9]*)[ \t\n\f\r]*>/y;

function sabitle(kalip: RegExp, metin: string, konum: number): RegExpExecArray | null {
  kalip.lastIndex = konum;
  return kalip.exec(metin);
}

// Güvenliyse null, değilse nedenini döner.
export function svgHatasi(metin: string): string | null {
  if (metin.length > AZAMI_UZUNLUK) return 'svg çok büyük';
  const yigin: string[] = [];
  let konum = 0;
  while (konum < metin.length) {
    if (metin[konum] !== '<') {
      const son = metin.indexOf('<', konum);
      const parca = metin.slice(konum, son === -1 ? undefined : son);
      if (parca.includes('>') || KONTROL.test(parca)) return 'svg metninde ham ">" ya da denetim karakteri var';
      const yazi = varlikCoz(parca);
      if (yazi === null) return 'svg metninde izinli olmayan varlık var';
      const ust = yigin.at(-1);
      if (kirp(yazi) !== '' && (ust === undefined || !METIN_ETIKETLERI.has(ust))) return 'svg metni etiket dışında';
      konum += parca.length;
      continue;
    }
    const kapanis = sabitle(KAPANIS, metin, konum);
    if (kapanis !== null) {
      if (yigin.pop() !== kapanis[1]) return 'svg etiketleri eşleşmiyor';
      konum += kapanis[0].length;
      continue;
    }
    const acilis = sabitle(ACILIS, metin, konum);
    const etiket = acilis?.[1];
    if (acilis === null || etiket === undefined || !ETIKETLER.has(etiket)) return 'svg etiketi izinli değil';
    konum += acilis[0].length;
    const goruldu = new Set<string>();
    for (;;) {
      const oz = sabitle(OZNITELIK, metin, konum);
      if (oz === null) break;
      const ad = oz[1];
      const deger = oz[2];
      if (ad === undefined || deger === undefined || goruldu.has(ad) || !ozellikGuvenli(etiket, ad, deger)) return `svg özniteliği izinli değil: ${ad ?? ''}`;
      goruldu.add(ad);
      konum += oz[0].length;
    }
    const sonu = sabitle(ACILIS_SONU, metin, konum);
    if (sonu === null) return 'svg etiketi bozuk';
    konum += sonu[0].length;
    if (sonu[1] !== '/') {
      yigin.push(etiket);
      if (yigin.length > AZAMI_DERINLIK) return 'svg çok derin';
    }
  }
  return yigin.length === 0 ? null : 'svg etiketleri kapanmamış';
}
