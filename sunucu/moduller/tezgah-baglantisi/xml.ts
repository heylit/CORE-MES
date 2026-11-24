// MTConnect cevabı için küçük, saf XML okuyucu: yalnız öğe, nitelik ve metin. DTD, ENTITY ve işleme bildirimi dışındaki "<!" reddedilir;
// tanımsız varlık çözülmez. Alan sayısı sınırlı değildir (kart 3659); cevap boyu okunurken ve ayrıştırmadan önce sınırlanır.
export const AZAMI_CEVAP_UZUNLUGU = 8 * 1024 * 1024;
export const AZAMI_DERINLIK = 64;

export interface XmlOgesi {
  ad: string;
  nitelikler: Record<string, string>;
  cocuklar: XmlOgesi[];
  metin: string;
}

export class XmlHatasi extends Error {}

const VARLIKLAR: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function varlikCoz(metin: string): string {
  return metin.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]+);/g, (tam, ad: string) => {
    if (ad.startsWith('#')) {
      const n = ad[1] === 'x' ? Number.parseInt(ad.slice(2), 16) : Number.parseInt(ad.slice(1), 10);
      const gecerli = Number.isInteger(n) && n >= 0x20 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
      return gecerli ? String.fromCodePoint(n) : '�';
    }
    return VARLIKLAR[ad] ?? tam;
  });
}

const yerelAd = (ad: string): string => {
  const i = ad.indexOf(':');
  return i === -1 ? ad : ad.slice(i + 1);
};

const NITELIK = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function xmlAyristir(ham: string): XmlOgesi {
  if (ham.length > AZAMI_CEVAP_UZUNLUGU) throw new XmlHatasi('Cevap çok büyük.');
  const metin = ham.split('\u0000').join('�');
  const n = metin.length;
  let i = metin.charCodeAt(0) === 0xfeff ? 1 : 0;
  const yigin: XmlOgesi[] = [];
  let kok: XmlOgesi | null = null;
  const bul = (aranan: string, bas: number): number => {
    const j = metin.indexOf(aranan, bas);
    if (j === -1) throw new XmlHatasi('Cevap yarım kalmış.');
    return j;
  };
  while (i < n) {
    const lt = metin.indexOf('<', i);
    const parca = lt === -1 ? metin.slice(i) : metin.slice(i, lt);
    const ust = yigin[yigin.length - 1];
    if (parca !== '') {
      if (ust) ust.metin += varlikCoz(parca);
      else if (parca.trim() !== '') throw new XmlHatasi('Kök öğe dışında metin.');
    }
    if (lt === -1) break;
    i = lt;
    if (metin.startsWith('<?', i)) {
      i = bul('?>', i + 2) + 2;
    } else if (metin.startsWith('<!--', i)) {
      i = bul('-->', i + 4) + 3;
    } else if (metin.startsWith('<![CDATA[', i)) {
      const son = bul(']]>', i + 9);
      if (!ust) throw new XmlHatasi('Kök öğe dışında CDATA.');
      ust.metin += metin.slice(i + 9, son);
      i = son + 3;
    } else if (metin.startsWith('<!', i)) {
      throw new XmlHatasi('DTD ve bildirimler kabul edilmez.');
    } else if (metin.startsWith('</', i)) {
      const son = bul('>', i + 2);
      const kapanan = yigin.pop();
      if (!kapanan || kapanan.ad !== yerelAd(metin.slice(i + 2, son).trim())) throw new XmlHatasi('Kapanış etiketi eşleşmiyor.');
      i = son + 1;
    } else {
      const son = bul('>', i + 1);
      const kendiKapanir = metin[son - 1] === '/';
      const ic = metin.slice(i + 1, kendiKapanir ? son - 1 : son);
      const bosluk = ic.search(/\s/);
      const ad = bosluk === -1 ? ic : ic.slice(0, bosluk);
      if (ad === '' || /[<&"']/.test(ad)) throw new XmlHatasi('Etiket adı okunamadı.');
      const nitelikler: Record<string, string> = {};
      if (bosluk !== -1) for (const e of ic.slice(bosluk).matchAll(NITELIK)) nitelikler[yerelAd(e[1] ?? '')] = varlikCoz(e[2] ?? e[3] ?? '');
      const oge: XmlOgesi = { ad: yerelAd(ad), nitelikler, cocuklar: [], metin: '' };
      if (ust) ust.cocuklar.push(oge);
      else if (kok === null) kok = oge;
      else throw new XmlHatasi('Birden çok kök öğe.');
      if (!kendiKapanir) {
        if (yigin.length >= AZAMI_DERINLIK) throw new XmlHatasi('Cevap çok derin.');
        yigin.push(oge);
      }
      i = son + 1;
    }
  }
  if (kok === null || yigin.length > 0) throw new XmlHatasi('Cevap yarım kalmış.');
  return kok;
}
