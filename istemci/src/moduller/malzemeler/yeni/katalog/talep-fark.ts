// Değişiklik talebinin farkını sunucu ham alan yoluyla yazar (`com.ad`, `g.ambalaj`; sunucu kurallar.ts MKK-16): onaycı ekranın
// biçimine güvenmeden gerçek farkı görür. Ekran bu yolu yalnız gösterirken okunur ada çevirir; satır atlanmaz, değer değişmez.
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';

const COM: Record<string, string> = {
  ad: 'Ad', ac: 'Açıklama', ac1: 'Açıklama 1', ac2: 'Açıklama 2', ac3: 'Açıklama 3', birim: 'Stok birimi', not: 'Notlar', std: 'Standart',
  ted: 'Tedarikçi', tedId: 'Tedarikçi firma', tkod: 'Teknik kod', sertifika: 'Sertifika ve uygunluk', eskiKod: 'Eski kod', fiyat: 'Fiyat',
  pb: 'Para birimi', moq: 'En az sipariş', fe: 'Fiyat esası', grup: 'Grup',
};
const UST: Record<string, string> = {
  tur: 'Malzeme türü', fam: 'Aile', cls: 'Sınıf', grade: 'Kalite', form: 'Form', tol: 'Tolerans', stds: 'Standartlar', ops: 'Operasyonlar',
  bom: 'Reçete', extra: 'Ek alanlar', kodManual: 'Kod elle girildi', adManual: 'Ad elle girildi', acManual: 'Açıklamalar elle girildi',
};
const OZEL: Record<string, string> = { ad: 'Özel malzeme adı', kod: 'Özel malzeme kodu', std: 'Özel malzeme standardı', eq: 'Özel malzeme eşdeğeri' };

// Sunucu nokta içeren parçayı köşeli ayraçla yazar (`[a.b]`); parçalara ayırırken ayraç korunur.
function parcalar(yol: string): string[] {
  const p: string[] = [];
  for (const m of yol.matchAll(/\[([^\]]*)\]|([^.]+)/g)) p.push(m[1] ?? m[2] ?? '');
  return p;
}

// Bilinmeyen yol olduğu gibi kalır: okunur ad yoksa ham yol, hiç yoktan iyidir.
export function farkAlanAdi(yol: string, x: KartKaydi, b: KuralBaglami): string {
  const [ilk, ikinci, ...kalan] = parcalar(yol);
  if (ilk === undefined) return yol;
  const ek = kalan.length ? ` (${kalan.join('.')})` : '';
  if (ikinci === undefined) return UST[ilk] ?? yol;
  if (ilk === 'com') return COM[ikinci] ? COM[ikinci] + ek : yol;
  if (ilk === 'g') {
    const a = K.turAlanlari(x.tur ?? '', b).find((y) => y.k === ikinci);
    return a ? a.ad + ek : yol;
  }
  if (ilk === 'dims') {
    const d = (x.form ? b.t.FORMS[x.form]?.dims : undefined)?.find(([k]) => k === ikinci);
    return `Ölçü: ${d ? d[1] : ikinci}${ek}`;
  }
  if (ilk === 'opts') {
    const o = (x.fam ? b.t.FAMS[x.fam]?.opts : undefined)?.find((y) => y.k === ikinci);
    return (o ? o.ad : ikinci) + ek;
  }
  if (ilk === 'ov') return `Teknik değer: ${ikinci}${ek}`;
  if (ilk === 'custom') return (ikinci === 'p' ? 'Özel malzeme özelliği' : OZEL[ikinci] ?? yol) + ek;
  if (UST[ilk]) return `${UST[ilk]} ${[ikinci, ...kalan].join('.')}`;
  return yol;
}

// Bayrak alanları "true/false" metniyle gelir.
const BAYRAKLAR = new Set(['kodManual', 'adManual']);
export function farkDegeri(yol: string, deger: string): string {
  if (BAYRAKLAR.has(yol) || /^acManual\b/.test(yol)) return deger === 'true' ? 'Evet' : deger === 'false' ? 'Hayır' : deger;
  return deger;
}
