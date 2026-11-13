import type { SahneAdimi, SahneHareketi, SahneYonu } from '#paylasilan/sozlesme/rota.ts';
import type { ParcaKutusu, Uc } from '../../../belge-merkezi/disari.ts';

// Talimatın 3B sahnesinin saf kuralları (3209 a): sıra ve yön önerisi, kayıt kuralları. Sunucu RT-90/RT-91'i ayrıca denetler.
// Oynatma kuralları oynatıcıyla birlikte Belge Merkezi'ndedir (terminal de kullanır); stüdyo ve testleri buradan da alır.
export { ADIM_BEKLEMESI_SN, YON_VEKTORU, donguSuresi, modelBicimiBul, parcaHali, parcaIlerleyisi, type ParcaHali, type ParcaKutusu, type Uc } from '../../../belge-merkezi/disari.ts';

const kisit = (x: number, alt: number, ust: number): number => Math.min(ust, Math.max(alt, x));

// Sözleşmedeki sınırların ekrandaki kopyası (istemci sözleşmeyi yalnız tip olarak alır); asıl denetim sunucudadır.
export const SAHNE_YONLERI: readonly SahneYonu[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
export const SAHNE_SINIRI = { adim: 100, parca: 100, parcaNo: 9999, mesafeMm: 2000, sureSnAlt: 0.3, sureSnUst: 10 } as const;

export const VARSAYILAN_HAREKET: SahneHareketi = { parcalar: [], yon: '+Z', mesafeMm: 80, sureSn: 1.6, sirali: false, kamera: null };

const hacim = (k: ParcaKutusu): number => Math.max(0, k.ust[0] - k.en[0]) * Math.max(0, k.ust[1] - k.en[1]) * Math.max(0, k.ust[2] - k.en[2]);
const merkez = (k: ParcaKutusu): Uc => [(k.en[0] + k.ust[0]) / 2, (k.en[1] + k.ust[1]) / 2, (k.en[2] + k.ust[2]) / 2];

// Parça, montajın merkezinden kendi merkezine doğru en baskın eksenden girer; merkezdeyse üstten (+Z).
export function yonOner(parca: ParcaKutusu, montaj: ParcaKutusu): SahneYonu {
  const p = merkez(parca), m = merkez(montaj);
  const fark = [p[0] - m[0], p[1] - m[1], p[2] - m[2]] as const;
  let eksen = 2;
  for (const e of [0, 1]) if (Math.abs(fark[e] ?? 0) > Math.abs(fark[eksen] ?? 0)) eksen = e;
  const d = fark[eksen] ?? 0;
  if (Math.abs(d) < 1e-6) return '+Z';
  const ad = ['X', 'Y', 'Z'][eksen] ?? 'Z';
  return `${d >= 0 ? '+' : '-'}${ad}` as SahneYonu;
}

// Öneri: en büyük parça gövdedir ve hareket etmez; kalanlar büyükten küçüğe talimat adımlarına sırayla dağıtılır, artan parçalar son adımda
// sıralı girer. Mesafe montaj boyunun yarısıdır. İnsan sonra düzeltir; öneri kayıtlı sahneyi kendiliğinden değiştirmez.
export function sahneOner(kutular: readonly ParcaKutusu[], adimSiralari: readonly number[]): SahneAdimi[] {
  if (kutular.length === 0 || adimSiralari.length === 0) return [];
  const montaj: ParcaKutusu = {
    en: [Math.min(...kutular.map((k) => k.en[0])), Math.min(...kutular.map((k) => k.en[1])), Math.min(...kutular.map((k) => k.en[2]))],
    ust: [Math.max(...kutular.map((k) => k.ust[0])), Math.max(...kutular.map((k) => k.ust[1])), Math.max(...kutular.map((k) => k.ust[2]))],
  };
  const boy = Math.hypot(montaj.ust[0] - montaj.en[0], montaj.ust[1] - montaj.en[1], montaj.ust[2] - montaj.en[2]);
  const mesafe = Math.round(kisit(boy / 2, 10, SAHNE_SINIRI.mesafeMm));
  const sirali = kutular.map((k, i) => ({ i, v: hacim(k) })).sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.i).slice(1);
  const adimlar: SahneAdimi[] = adimSiralari.map((sira) => ({ sira, hareket: { ...VARSAYILAN_HAREKET, mesafeMm: mesafe, parcalar: [] } }));
  sirali.forEach((p, j) => {
    const a = adimlar[Math.min(j, adimlar.length - 1)];
    if (a !== undefined && a.hareket.parcalar.length < SAHNE_SINIRI.parca) a.hareket.parcalar.push(p);
  });
  for (const a of adimlar) {
    const ilk = a.hareket.parcalar[0];
    const k = ilk === undefined ? undefined : kutular[ilk];
    if (k !== undefined) a.hareket.yon = yonOner(k, montaj);
    a.hareket.sirali = a.hareket.parcalar.length > 1;
  }
  return adimlar;
}

// Kaydedilecek adımlar: hareketi boş (parçasız) adım yazılmaz; sıra artan.
export const kaydedilecekler = (adimlar: readonly SahneAdimi[]): SahneAdimi[] =>
  adimlar.filter((a) => a.hareket.parcalar.length > 0).sort((a, b) => a.sira - b.sira);

// Ekranda sunucuya gitmeden gösterilen eksik: parça iki adımda girerse (RT-91 ile aynı ileti).
export function sahneEksigi(adimlar: readonly SahneAdimi[]): string | null {
  const ilk = new Map<number, number>();
  for (const a of [...adimlar].sort((x, y) => x.sira - y.sira)) {
    for (const p of a.hareket.parcalar) {
      const once = ilk.get(p);
      if (once !== undefined && once !== a.sira) return `${String(p + 1)}. parça hem ${String(once)}. hem ${String(a.sira)}. adımda giriyor; parça tek adımda takılır.`;
      ilk.set(p, a.sira);
    }
  }
  return null;
}

// Parçayı adıma ekler ya da çıkarır; başka adımda giriyorsa oradan alınır (tek adımda girer).
export function parcaDegistir(adimlar: readonly SahneAdimi[], sira: number, parca: number): SahneAdimi[] {
  const vardi = adimlar.find((a) => a.sira === sira)?.hareket.parcalar.includes(parca) ?? false;
  const yeni = adimlar.map((a) => ({ ...a, hareket: { ...a.hareket, parcalar: a.hareket.parcalar.filter((p) => p !== parca) } }));
  if (vardi) return yeni;
  const hedef = yeni.find((a) => a.sira === sira);
  if (hedef === undefined) return [...yeni, { sira, hareket: { ...VARSAYILAN_HAREKET, parcalar: [parca] } }];
  if (hedef.hareket.parcalar.length < SAHNE_SINIRI.parca) hedef.hareket.parcalar = [...hedef.hareket.parcalar, parca];
  return yeni;
}

export const hareketYaz = (adimlar: readonly SahneAdimi[], sira: number, degisiklik: Partial<SahneHareketi>): SahneAdimi[] =>
  adimlar.some((a) => a.sira === sira)
    ? adimlar.map((a) => (a.sira === sira ? { ...a, hareket: { ...a.hareket, ...degisiklik } } : a))
    : [...adimlar, { sira, hareket: { ...VARSAYILAN_HAREKET, ...degisiklik } }];

