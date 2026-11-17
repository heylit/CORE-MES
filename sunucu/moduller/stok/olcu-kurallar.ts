// 3398 (surum 4 a): stokta ölçü ve kaliteyle eşleştirme, saf. Aynı form ve kalite; kesit ölçüsü istenenden küçük olamaz, en çok fazla
// pay kadar büyük olabilir. Boy formunda parça boyu artı kesme payı adaydan kaç parça çıktığını verir. Sıra: artık parça, tam ölçü,
// yakın ölçü en az fireyle; eşitte ilk giren. Pay dışı (daha büyük) adaylar ekranda gri gösterilir, karşılanana sayılmaz.
// 3D ham önerisindeki kartaSigar (geometri) kart tanımını ölçer; bu kural stoktaki miktarı ve artığı da sayar (VARSAYIM: iki kural ayrı
// kalır, geometri stoğu ithal etmez).
import { FORM_OLCULERI, type AdayDurumu, type OlculuForm, type OlcuAnahtari, type PayTuru } from '#paylasilan/sozlesme/stok-kontrol.ts';

const AYNI = 1e-6;

export interface OlcuIstegi {
  form: OlculuForm;
  olcu: Partial<Record<OlcuAnahtari, number>>;
  parcaBoyu: number | null;
  parcaEni: number | null;
  adet: number | null;
  pay: { tur: PayTuru; deger: number; enAzMm: number };
  kesmeMm: number;
}

export interface EslesmeAdayi {
  kaynak: 'stok' | 'artik';
  olcu: Readonly<Record<string, unknown>>;
  // Stokta kartın stok birimindeki kullanılabilir miktar; artıkta parça adedi ("adet").
  miktar: number;
  birim: string | null;
  // g/cm³; kg birimli kartta boy hesabı için. Bilinmiyorsa null.
  yogunluk: number | null;
  ilkGiris: string | null;
}

export interface Eslesme {
  durum: AdayDurumu;
  fazla: Record<string, number>;
  fireYuzde: number | null;
  parcaSayisi: number | null;
}

const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const yuvarla = (x: number) => Math.round(x * 100) / 100;

// Fazla payın mm karşılığı: yüzdede istenenin yüzdesi, en az enAzMm.
export function payMm(pay: OlcuIstegi['pay'], istenen: number): number {
  if (pay.tur === 'tam') return 0;
  if (pay.tur === 'mm') return pay.deger;
  return Math.max((istenen * pay.deger) / 100, pay.enAzMm);
}

// Kesit alanı (mm²; blok ve diskte hacim yerine yüz alanı x kalınlık): fire oranı yalnız aynı formda karşılaştırılır.
export function kesitAlani(form: OlculuForm, o: Readonly<Record<string, number>>): number | null {
  const g = (k: string) => o[k] ?? null;
  const d = g('d'), s = g('s'), a = g('a'), b = g('b'), t = g('t'), D = g('D'), h = g('h');
  switch (form) {
    case 'cubuk': return d === null ? null : (Math.PI * d * d) / 4;
    case 'altigen': return s === null ? null : (Math.sqrt(3) / 2) * s * s;
    case 'lama': return a === null || b === null ? null : a * b;
    case 'levha': return t;
    case 'boru': return D === null || t === null || 2 * t >= D ? null : (Math.PI / 4) * (D * D - (D - 2 * t) * (D - 2 * t));
    case 'kutu': return a === null || b === null || t === null ? null : a * b - Math.max(a - 2 * t, 0) * Math.max(b - 2 * t, 0);
    case 'kosebent': return a === null || b === null || t === null ? null : (a + b - t) * t;
    case 'blok': return a === null || b === null || h === null ? null : a * b * h;
    case 'disk': return d === null || t === null ? null : ((Math.PI * d * d) / 4) * t;
  }
}

// Kesit karşılaştırması. Lamada ve blokta ölçüler sıralanıp eşlenir (90 derece döndürülebilir). Boruda iç çap istenenden büyük olamaz:
// dış çap pay içinde, et ise iç çapı daraltmayacak kadar kalın olabilir.
function kesitKarsilastir(form: OlculuForm, istek: OlcuIstegi, aday: Record<string, number>): { durum: AdayDurumu; fazla: Record<string, number> } | 'kucuk' | 'eksik' {
  const anahtarlar = FORM_OLCULERI[form].kesit;
  const istenen: Record<string, number> = {};
  for (const k of anahtarlar) {
    const v = istek.olcu[k];
    if (v !== undefined) istenen[k] = v;
  }
  if (Object.keys(istenen).length === 0) return 'eksik';
  let ciftler: [string, number, number][] = [];
  if (form === 'lama' || form === 'blok') {
    const ik = anahtarlar.filter((k) => istenen[k] !== undefined);
    if (ik.length !== anahtarlar.length) return 'eksik';
    const iv = ik.map((k) => istenen[k]!).sort((x, y) => y - x);
    const av = anahtarlar.map((k) => aday[k]);
    if (av.some((v) => v === undefined)) return 'eksik';
    const as = (av as number[]).sort((x, y) => y - x);
    ciftler = ik.map((k, i) => [k, iv[i]!, as[i]!]);
  } else {
    for (const [k, iv] of Object.entries(istenen)) {
      const av = aday[k];
      if (av === undefined) return 'eksik';
      ciftler.push([k, iv, av]);
    }
  }
  const fazla: Record<string, number> = {};
  let payDisi = false;
  for (const [k, iv, av] of ciftler) {
    if (form === 'boru' && k === 't') continue;
    if (av + AYNI < iv) return 'kucuk';
    const f = av - iv;
    fazla[k] = yuvarla(f);
    if (f > payMm(istek.pay, iv) + AYNI) payDisi = true;
  }
  if (form === 'boru' && istenen['D'] !== undefined && istenen['t'] !== undefined) {
    const icIstek = istenen['D'] - 2 * istenen['t'];
    const icAday = aday['D']! - 2 * (aday['t'] ?? 0);
    if (icAday > icIstek + AYNI) return 'kucuk';
    fazla['t'] = yuvarla((aday['t'] ?? 0) - istenen['t']);
  }
  const tam = Object.values(fazla).every((f) => Math.abs(f) < AYNI);
  return { durum: payDisi ? 'pay-disi' : tam ? 'tam' : 'yakin', fazla };
}

// Bir stok parçasından (boy L) çıkan parça: her kesimde parça + kesme payı harcanır.
const boydanParca = (L: number, parca: number, kesme: number) => Math.floor((L + kesme + AYNI) / (parca + kesme));

// Levhadan çıkan parça: iki yönden büyüğü; kesme payı her kenarda.
function levhadanParca(W: number, L: number, en: number, boy: number, kesme: number): number {
  const yon = (x: number, y: number) => Math.floor((x + kesme + AYNI) / (en + kesme)) * Math.floor((y + kesme + AYNI) / (boy + kesme));
  return Math.max(yon(W, L), yon(L, W));
}

// Adaydan çıkan parça sayısı. Stok birimi adet, levha ya da m'de bilinir; kg'da yoğunluk ve kesit alanından boya çevrilir.
// Bilinmeyen birimde ya da ölçüde null.
function parcaSayisi(istek: OlcuIstegi, aday: EslesmeAdayi, o: Record<string, number>): number | null {
  const f = FORM_OLCULERI[istek.form];
  const birim = aday.kaynak === 'artik' ? 'adet' : aday.birim;
  if (f.boy === null) {
    return birim === 'adet' ? Math.floor(aday.miktar + AYNI) : null;
  }
  if (istek.parcaBoyu === null) return null;
  const L = o[f.boy];
  if (f.en !== null) {
    const W = o[f.en];
    if (L === undefined || W === undefined || istek.parcaEni === null) return null;
    const plakaBasi = levhadanParca(W, L, istek.parcaEni, istek.parcaBoyu, istek.kesmeMm);
    if (birim === 'adet' || birim === 'levha') return plakaBasi * Math.floor(aday.miktar + AYNI);
    return null;
  }
  if (birim === 'adet') {
    if (L === undefined) return null;
    return boydanParca(L, istek.parcaBoyu, istek.kesmeMm) * Math.floor(aday.miktar + AYNI);
  }
  if (birim === 'm') return boydanParca(aday.miktar * 1000, istek.parcaBoyu, istek.kesmeMm);
  if (birim === 'kg') {
    const alan = kesitAlani(istek.form, o);
    if (alan === null || aday.yogunluk === null || aday.yogunluk <= 0) return null;
    // g/cm³ = 1e-6 kg/mm³
    const toplamBoy = aday.miktar / (aday.yogunluk * 1e-6 * alan);
    return boydanParca(toplamBoy, istek.parcaBoyu, istek.kesmeMm);
  }
  return null;
}

// Adayın istekle eşleşmesi; küçük, ölçüsü eksik ya da boyu/eni parçaya yetmeyen aday null (önerilmez).
export function olcuEslestir(istek: OlcuIstegi, aday: EslesmeAdayi): Eslesme | null {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(aday.olcu)) {
    const n = sayi(v);
    if (n !== null) o[k] = n;
  }
  const k = kesitKarsilastir(istek.form, istek, o);
  if (k === 'kucuk' || k === 'eksik') return null;
  const f = FORM_OLCULERI[istek.form];
  if (f.boy !== null && istek.parcaBoyu !== null) {
    const L = o[f.boy];
    if (f.en !== null) {
      const W = o[f.en];
      if (L !== undefined && W !== undefined && istek.parcaEni !== null && levhadanParca(W, L, istek.parcaEni, istek.parcaBoyu, istek.kesmeMm) === 0) return null;
    } else if (L !== undefined && L + AYNI < istek.parcaBoyu) return null;
  }
  const istenenAlan = kesitAlani(istek.form, istek.olcu as Record<string, number>);
  const adayAlan = kesitAlani(istek.form, o);
  const fireYuzde = istenenAlan === null || adayAlan === null || istenenAlan <= 0 ? null : Math.round(((adayAlan - istenenAlan) / istenenAlan) * 100);
  return { durum: k.durum, fazla: k.fazla, fireYuzde, parcaSayisi: parcaSayisi(istek, aday, o) };
}

const DURUM_SIRASI: Readonly<Record<AdayDurumu, number>> = { tam: 0, yakin: 1, 'pay-disi': 2 };

// Sıra: pay içindekiler önce; içlerinde artık parça, sonra tam, sonra yakın (en az fire); eşitte ilk giren. Pay dışı en sonda.
export function adaySirala<T extends { kaynak: 'stok' | 'artik'; durum: AdayDurumu; fireYuzde: number | null; ilkGiris: string | null }>(l: readonly T[]): T[] {
  const anahtar = (x: T): [number, number, number, number] => [
    x.durum === 'pay-disi' ? 1 : 0,
    x.kaynak === 'artik' ? 0 : 1,
    DURUM_SIRASI[x.durum],
    x.fireYuzde ?? Number.MAX_SAFE_INTEGER,
  ];
  return [...l].sort((x, y) => {
    const a = anahtar(x), b = anahtar(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return (x.ilkGiris ?? '9').localeCompare(y.ilkGiris ?? '9');
  });
}

// Sıralı pay içi adaylardan gerekene kadar alınan parça; adet yoksa ya da parça sayısı bilinmeyen aday çıkarsa sayılan kadar.
export function karsilanan(gereken: number | null, l: readonly { durum: AdayDurumu; parcaSayisi: number | null }[]): number | null {
  if (gereken === null) return null;
  let toplam = 0;
  let bilinen = false;
  for (const a of l) {
    if (a.durum === 'pay-disi' || a.parcaSayisi === null) continue;
    bilinen = true;
    toplam += a.parcaSayisi;
    if (toplam >= gereken) return gereken;
  }
  return bilinen ? toplam : null;
}

// Artığın ölçüsü: kartın ölçüsü, boyu (levhada eni de) kalan ölçüyle. Kalan, kartın ölçüsünü aşamaz (kartın ölçüsü bilinmiyorsa sınır yok).
export function artikOlcusu(form: OlculuForm, kart: Readonly<Record<string, unknown>>, boy: number, en: number | null): { olcu: Record<string, number> } | { hata: string } {
  const f = FORM_OLCULERI[form];
  if (f.boy === null) return { hata: 'Bu formda artık parça boyla tutulmaz.' };
  if (f.en !== null && en === null) return { hata: 'Levhada kalan en de yazılmalı.' };
  if (f.en === null && en !== null) return { hata: 'Bu formda yalnız kalan boy yazılır.' };
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(kart)) {
    const n = sayi(v);
    if (n !== null) o[k] = n;
  }
  for (const k of f.kesit) if (o[k] === undefined) return { hata: 'Kartın kesit ölçüsü girilmemiş; önce Malzemeler\'de ölçüyü tamamlayın.' };
  const kartBoy = o[f.boy];
  if (kartBoy !== undefined && boy > kartBoy + AYNI) return { hata: `Kalan boy kartın boyundan (${kartBoy} mm) uzun olamaz.` };
  o[f.boy] = boy;
  if (f.en !== null && en !== null) {
    const kartEn = o[f.en];
    if (kartEn !== undefined && en > kartEn + AYNI) return { hata: `Kalan en kartın eninden (${kartEn} mm) büyük olamaz.` };
    o[f.en] = en;
  }
  return { olcu: o };
}

// Artık bakiyenin içindedir (3398 KURGU): stok adayından düşülecek payı kartın stok biriminde verir; adet ve levhada artık bir
// boy ya da plaka sayılır, m'de boyu, kg'da hacmi ve yoğunluğu. Hesaplanamıyorsa null (çağıran artığı ayrıca saymaz).
export function artikPayi(form: OlculuForm, olcu: Readonly<Record<string, number>>, adet: number, birim: string | null, yogunluk: number | null): number | null {
  const f = FORM_OLCULERI[form];
  if (birim === 'adet' || birim === 'levha') return adet;
  if (f.boy === null) return null;
  const L = olcu[f.boy];
  if (L === undefined) return null;
  if (birim === 'm' && f.en === null) return (L * adet) / 1000;
  if (birim === 'kg') {
    const alan = f.en === null ? kesitAlani(form, olcu) : (olcu.t !== undefined && olcu[f.en] !== undefined ? olcu.t * olcu[f.en]! : null);
    if (alan === null || yogunluk === null || yogunluk <= 0) return null;
    return alan * L * yogunluk * 1e-6 * adet;
  }
  return null;
}
