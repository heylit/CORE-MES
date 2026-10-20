import type { AdimGirdisi, Bagimlilik, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';

export type KatalogTipi = SeceneklerCevabi['operasyonTipleri'][number];
import type { Degisiklik } from './useRotaCalisma.ts';

// Ekranın taslak üzerindeki işlemleri: listeyi değiştirir, karar vermez. Doğrulama ve numara sunucudadır.

// Bu ekran çevrimi tek alanla düzenler: birim süre elle değişince işlem ve değişim ayrımı kalkar (sunucu toplam ister).
export const BIRIM_ELLE = (v: number | null) => ({ birimSureDk: v, islemSuresiDk: null, degisimSuresiDk: null });

// Katalogdaki varsayılan süreler yeni adıma öneri olarak kopyalanır; makine ya da kişi sonra seçilir.
export function yeniAdim(t: KatalogTipi): AdimGirdisi {
  return {
    opNo: null, operasyonTipiId: t.id, ad: t.ad, kaynak: null,
    ayarSuresiDk: t.varsayilanAyarDk === null ? null : Number(t.varsayilanAyarDk),
    birimSureDk: t.varsayilanBirimDk === null ? null : Number(t.varsayilanBirimDk), bagimlilik: 'bekleyen', devirAdedi: null,
    firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [],
  };
}

const opIle = (opNo: number, f: (a: AdimGirdisi) => AdimGirdisi): Degisiklik => (l) => l.map((a) => (a.opNo === opNo ? f(a) : a));

export const araya = (sonra: number | null, adim: AdimGirdisi): Degisiklik => (l) => {
  if (sonra === null) return [adim, ...l];
  const i = l.findIndex((a) => a.opNo === sonra);
  return i < 0 ? [...l, adim] : [...l.slice(0, i + 1), adim, ...l.slice(i + 1)];
};

export const sil = (opNo: number): Degisiklik => (l) => l.filter((a) => a.opNo !== opNo);

export const cogalt = (opNo: number): Degisiklik => (l) => {
  const i = l.findIndex((a) => a.opNo === opNo);
  const a = l[i];
  return a ? [...l.slice(0, i + 1), { ...a, opNo: null }, ...l.slice(i + 1)] : l;
};

// Aşağı taşırken hedefin altına, yukarı taşırken üstüne yerleşir.
export const tasi = (opNo: number, hedef: number): Degisiklik => (l) => {
  const from = l.findIndex((a) => a.opNo === opNo);
  const to = l.findIndex((a) => a.opNo === hedef);
  const a = l[from];
  if (from < 0 || to < 0 || from === to || !a) return l;
  const kalan = l.filter((_, i) => i !== from);
  const yer = kalan.findIndex((x) => x.opNo === hedef);
  return from < to ? [...kalan.slice(0, yer + 1), a, ...kalan.slice(yer + 1)] : [...kalan.slice(0, yer), a, ...kalan.slice(yer)];
};

export const kaydir = (opNo: number, yon: -1 | 1): Degisiklik => (l) => {
  const i = l.findIndex((a) => a.opNo === opNo);
  const hedef = l[i + yon];
  return hedef?.opNo == null ? l : tasi(opNo, hedef.opNo)(l);
};

const SIRA: Bagimlilik[] = ['bekleyen', 'akisli', 'bagimsiz'];
// Etikete dokununca ilişki sırayla değişir: bekleyen -> akışlı -> bağımsız.
export const bagimlilikDegistir = (opNo: number, yeni?: Bagimlilik): Degisiklik => opIle(opNo, (a) => {
  const b = yeni ?? SIRA[(SIRA.indexOf(a.bagimlilik) + 1) % SIRA.length] ?? 'bekleyen';
  return { ...a, bagimlilik: b, devirAdedi: b === 'akisli' ? (a.devirAdedi ?? 1) : null };
});

export const alanYaz = (opNo: number, alan: Partial<AdimGirdisi>): Degisiklik => opIle(opNo, (a) => ({ ...a, ...alan }));

// Operasyon tipi değişince adım adı yeni tipin adını alır; ad elle değiştirilmişse (eski tipin adı değilse) korunur.
export const tipDegistir = (opNo: number, yeni: { id: number; ad: string }, eskiAd: string): Degisiklik => opIle(opNo, (a) => ({
  ...a, operasyonTipiId: yeni.id, ad: a.ad === eskiAd ? yeni.ad : a.ad,
}));

// Katalog değerlerine dön: adımın süreleri operasyon tipinin varsayılanlarına döner (makine ya da kişi seçimi kalır, K3).
export const kataloguUygula = (opNo: number, t: KatalogTipi): Degisiklik => opIle(opNo, (a) => ({
  ...a,
  ayarSuresiDk: t.varsayilanAyarDk === null ? null : Number(t.varsayilanAyarDk),
  ...BIRIM_ELLE(t.varsayilanBirimDk === null ? null : Number(t.varsayilanBirimDk)),
}));

// Yeni tanımlanan tip adıma uygulanır: tip, ad ve varsayılan süreler.
export const tipUygula = (opNo: number, t: KatalogTipi): Degisiklik => (l) => kataloguUygula(opNo, t)(alanYaz(opNo, { operasyonTipiId: t.id, ad: t.ad })(l));

export const bilesenEkle = (opNo: number, malzemeId: number, miktar = 1): Degisiklik => opIle(opNo, (a) => (
  a.bilesenler.some((b) => b.malzemeId === malzemeId) ? a : { ...a, bilesenler: [...a.bilesenler, { malzemeId, miktar, fireYuzde: 0 }] }));
export const bilesenYaz = (opNo: number, malzemeId: number, p: { miktar?: number; fireYuzde?: number }): Degisiklik => opIle(opNo, (a) => (
  { ...a, bilesenler: a.bilesenler.map((b) => (b.malzemeId === malzemeId ? { ...b, ...p } : b)) }));
export const bilesenSil = (opNo: number, malzemeId: number): Degisiklik => opIle(opNo, (a) => (
  { ...a, bilesenler: a.bilesenler.filter((b) => b.malzemeId !== malzemeId) }));
// Listeden değiştir: giren başka kartla değişir, miktar ve fire korunur; yeni kart adımda zaten varsa değişmez.
export const bilesenDegistir = (opNo: number, eskiId: number, yeniId: number): Degisiklik => opIle(opNo, (a) => (
  a.bilesenler.some((b) => b.malzemeId === yeniId) ? a : { ...a, bilesenler: a.bilesenler.map((b) => (b.malzemeId === eskiId ? { ...b, malzemeId: yeniId } : b)) }));

export const yanUrunEkle = (opNo: number, malzemeId: number, miktar = 1): Degisiklik => opIle(opNo, (a) => (
  a.yanUrunler.some((y) => y.malzemeId === malzemeId) ? a : { ...a, yanUrunler: [...a.yanUrunler, { malzemeId, miktar }] }));
export const yanUrunYaz = (opNo: number, malzemeId: number, miktar: number): Degisiklik => opIle(opNo, (a) => (
  { ...a, yanUrunler: a.yanUrunler.map((y) => (y.malzemeId === malzemeId ? { ...y, miktar } : y)) }));
export const yanUrunSil = (opNo: number, malzemeId: number): Degisiklik => opIle(opNo, (a) => (
  { ...a, yanUrunler: a.yanUrunler.filter((y) => y.malzemeId !== malzemeId) }));

type Kaynak = { tur: 'makine' | 'kisi' | 'istasyon'; id: number };
const ayni = (x: Kaynak, y: Kaynak) => x.tur === y.tur && x.id === y.id;
export const adayEkle = (opNo: number, kaynak: Kaynak): Degisiklik => opIle(opNo, (a) => (
  a.adaylar.some((x) => ayni(x.kaynak, kaynak)) ? a : { ...a, adaylar: [...a.adaylar, { kaynak, ayarSuresiDk: null, birimSureDk: null }] }));
export const adayYaz = (
  opNo: number, kaynak: Kaynak, p: { ayarSuresiDk?: number | null; birimSureDk?: number | null; islemSuresiDk?: number | null; degisimSuresiDk?: number | null },
): Degisiklik =>
  opIle(opNo, (a) => ({ ...a, adaylar: a.adaylar.map((x) => (ayni(x.kaynak, kaynak) ? { ...x, ...p } : x)) }));
export const adaySil = (opNo: number, kaynak: Kaynak): Degisiklik => opIle(opNo, (a) => (
  { ...a, adaylar: a.adaylar.filter((x) => !ayni(x.kaynak, kaynak)) }));
