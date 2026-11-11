import type {
  GeometriDurumu, GeometriMontajDugumu, GeometriOzellik, GeometriYuzeyAdimi, GeometriYuzeyCevabi, GeometriYuzeyIslemi, HamStokOnerisi,
} from '#paylasilan/sozlesme/geometri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const DURUM_ADI: Readonly<Record<GeometriDurumu, string>> = {
  yok: 'Sıraya alınıyor', bekliyor: 'Kuyrukta', calisiyor: 'Hesaplanıyor', bitti: 'Hesaplandı', hata: 'Hata',
};
export const DURUM_TONU: Readonly<Record<GeometriDurumu, RozetTonu>> = {
  yok: 'pasif', bekliyor: 'bilgi', calisiyor: 'bilgi', bitti: 'tamam', hata: 'hata',
};
export const DURUMLAR: readonly GeometriDurumu[] = ['bitti', 'bekliyor', 'calisiyor', 'hata', 'yok'];
// Hesap sürerken ekran kendini yeniler; bitince durur.
export const suruyorMu = (d: GeometriDurumu | undefined): boolean => d === 'bekliyor' || d === 'calisiyor' || d === 'yok';

const bicim = (basamak: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: 0 });
const mm = bicim(1);
const tam = bicim(0);
export const uzunluk = (x: number): string => mm.format(x);
export const kutuMetni = (a: number, b: number, c: number): string => `${uzunluk(a)} x ${uzunluk(b)} x ${uzunluk(c)} mm`;
export const buyukSayi = (x: number | null, birim: string): string => (x === null ? '-' : `${tam.format(x)} ${birim}`);

// Hammadde formlarının adı Malzemeler'deki gibi.
export const FORM_ADI: Readonly<Record<HamStokOnerisi['form'], string>> = {
  cubuk: 'Yuvarlak çubuk', altigen: 'Altıgen çubuk', lama: 'Lama / kare', levha: 'Levha / sac', blok: 'Blok',
};
// Kartın ölçüsü, formun alışılmış yazımıyla (çubukta çap, altıgende anahtar ağzı önde).
export function stokOlcuMetni(o: HamStokOnerisi): string {
  const d = (k: string): string => uzunluk(o.olcu[k] ?? 0);
  switch (o.form) {
    case 'cubuk': return `Ø ${d('d')} x ${d('l')} mm`;
    case 'altigen': return `SW ${d('s')} x ${d('l')} mm`;
    case 'lama': return `${d('a')} x ${d('b')} x ${d('l')} mm`;
    case 'levha': return `${d('t')} x ${d('w')} x ${d('l')} mm`;
    case 'blok': return `${d('a')} x ${d('b')} x ${d('h')} mm`;
  }
}

// Net ağırlık (1446 a): hacim x yoğunluk, yalnız ekranda öneri. Yoğunluk g/cm³ (1 g/cm³ = 1e-6 kg/mm³); hacim ya da yoğunluk yoksa null.
export const yogunlukOku = (metin: string): number | null => {
  const x = Number(metin.trim().replace(',', '.'));
  return metin.trim() === '' || !Number.isFinite(x) || x <= 0 ? null : x;
};
export const agirlikKg = (hacimMm3: number | null, yogunluk: number | null): number | null =>
  (hacimMm3 === null || yogunluk === null ? null : (hacimMm3 * yogunluk) / 1e6);
const kg = bicim(3);
export const agirlikMetni = (x: number): string => `${kg.format(x)} kg`;
export const yogunlukBicimi = (x: number): string => kg.format(x);

// Özellik kartı (2044-2): satır metinleri. Ölçü yoksa parça yazılmaz (sıfır uydurulmaz).
const aci = (x: number): string => `${uzunluk(x)}°`;
// Girişin yüzü eksen yönünden (prototip 2044-2): eksen girişten içeri doğrudur; Z bileşeni baskınsa eksi Z üst, artı Z alt yüzdür,
// X ya da Y baskınsa yan yüz.
export function girisYuzu(e: readonly number[] | null): string | null {
  if (e === null || e.length !== 3) return null;
  const m = e.map(Math.abs);
  const i = m.indexOf(Math.max(...m));
  if (i === 2) return (e[2] ?? 0) < 0 ? 'Üst yüz (Z)' : 'Alt yüz (Z)';
  return `Yan yüz (${i === 0 ? 'X' : 'Y'})`;
}
export function delikMetni(d: GeometriOzellik): { ust: string; alt: string } {
  const parca = [d.capMm === null ? null : `Ø${uzunluk(d.capMm)}`, d.gecis === null ? null : d.gecis ? 'geçiş' : 'kör'].filter((x) => x !== null).join(' ');
  const ust = d.derinlikMm === null ? parca : `${parca} · ${uzunluk(d.derinlikMm)} mm`;
  const alt = [girisYuzu(d.eksen), d.dip === 'matkap' ? `matkap ucu${d.aciDerece === null ? '' : ` ${aci(d.aciDerece)}`}` : d.dip === 'duz' ? 'düz dip' : null]
    .filter((x) => x !== null).join(' · ');
  return { ust, alt };
}
export function bagliMetni(o: GeometriOzellik): string {
  if (o.tur === 'havsa') return `Havşa${o.capMm === null ? '' : ` Ø${uzunluk(o.capMm)}`}${o.aciDerece === null ? '' : ` x ${aci(o.aciDerece)}`}`;
  return `Kademe${o.capMm === null ? '' : ` Ø${uzunluk(o.capMm)}`}${o.derinlikMm === null ? '' : ` x ${uzunluk(o.derinlikMm)} mm`}`;
}
// Pah ölçüsü büyük komşu yüzdeki bacak boyu x açı: bacak = yüz genişliği x cos(açı). Mil ucunda (çapı olan pah) aynı yazım.
export function pahMetni(o: GeometriOzellik): { ust: string; alt: string } {
  const bacak = o.genislikMm !== null && o.aciDerece !== null ? o.genislikMm * Math.cos((o.aciDerece * Math.PI) / 180) : null;
  const ust = `Pah${bacak === null ? '' : ` ${uzunluk(bacak)}`}${o.aciDerece === null ? '' : ` x ${aci(o.aciDerece)}`}`;
  const alt = [o.capMm === null ? null : `Ø${uzunluk(o.capMm)} mil ucu`, o.boyMm === null ? null : `Boy ${uzunluk(o.boyMm)} mm`,
    o.genislikMm === null ? null : `yüz genişliği ${uzunluk(o.genislikMm)} mm`].filter((x) => x !== null).join(' · ');
  return { ust, alt };
}
export function radyusMetni(o: GeometriOzellik): { ust: string; alt: string } {
  const ust = `R${o.yaricapMm === null ? '' : uzunluk(o.yaricapMm)}${o.ic === null ? '' : o.ic ? ' iç köşe' : ' dış kenar'}`;
  return { ust, alt: o.boyMm === null ? '' : `Boy ${uzunluk(o.boyMm)} mm` };
}

// Montaj (2113): düğümün altındaki parça düğümleri (parçada kendisi); ön sıra korunur.
export function altParcalar(dugumler: readonly GeometriMontajDugumu[], sira: number): number[] {
  const altlar = new Map<number, number[]>();
  for (const d of dugumler) if (d.ust !== null) altlar.set(d.ust, [...(altlar.get(d.ust) ?? []), d.sira]);
  const tur = new Map(dugumler.map((d) => [d.sira, d.tur]));
  const sonuc: number[] = [];
  const yigin = [sira];
  while (yigin.length > 0) {
    const s = yigin.pop()!;
    if (tur.get(s) === 'parca') sonuc.push(s);
    yigin.push(...[...(altlar.get(s) ?? [])].reverse());
  }
  return sonuc;
}
export const hacimMetni = (h: number | null): string => (h === null ? 'Yok (açık yüzey)' : buyukSayi(h, 'mm³'));

// Patlatma (2139-1 c): parça, kendi merkezinden modelin merkezine çizilen doğru boyunca dışa kayar; kayma uzaklıkla orantılıdır.
// Oran 0-1; 1'de kenardaki parça modelin yarı köşegeninin bir buçuk katı uzaklaşır (kamera çerçevesinde kalsın diye). Merkezi modelin merkezinde olan parça yerinde kalır.
export const PATLATMA_KATI = 1.5;
export function patlatmaKaymasi(parca: readonly number[], merkez: readonly number[], oran: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, oran)) * PATLATMA_KATI;
  // + 0: eksi sıfır yazılmasın.
  return [0, 1, 2].map((i) => ((parca[i] ?? 0) - (merkez[i] ?? 0)) * k + 0) as [number, number, number];
}

// Yüzey işaretleri (2144). Bir yüz tek işleme atanır (2144-1 a); anahtar işlemi ayırt eder (rota adımı ve şartnamesi ya da maske).
export const islemAnahtari = (i: GeometriYuzeyIslemi): string => (i.tur === 'maske' ? 'maske' : `rota:${String(i.opNo)}:${String(i.sartnameId)}`);
export interface TaslakIsaret { islem: GeometriYuzeyIslemi; oneri: boolean }
// Renk yalnız ekranda ayırt etmek içindir; işlemler rota sırasıyla bu değişkenleri döner. Maske koyu düz renktir (listede taralı).
export const ISLEM_RENKLERI = ['--grafik', '--run', '--grafik-2', '--done', '--grafik-3'] as const;
export const MASKE_RENGI = '--sahne3b-tarama';
const m2Bicimi = bicim(4);
export const m2Metni = (mm2: number): string => `${m2Bicimi.format(mm2 / 1e6)} m²`;
export const YUZ_TURU_ADI: Readonly<Record<GeometriYuzeyCevabi['yuzler'][number]['tur'], string>> = {
  duzlem: 'Düzlem', silindir: 'Silindir', koni: 'Koni', kure: 'Küre', torus: 'Torus', bezier: 'Serbest', bspline: 'Serbest', donel: 'Dönel',
  ekstruzyon: 'Süpürme', ofset: 'Ofset', diger: 'Diğer',
};

// Taslağın alanları: işlem başına yüz sayısı ve alan, işaretsiz ve toplam (sunucudaki yuzeyAlanlari ile aynı hesap; kaydetmeden görünür).
export function taslakAlanlari(yuzler: GeometriYuzeyCevabi['yuzler'], isaretler: ReadonlyMap<number, TaslakIsaret>):
{ islemler: Map<string, { yuzSayisi: number; alanMm2: number }>; isaretsizMm2: number; toplamMm2: number } {
  const islemler = new Map<string, { yuzSayisi: number; alanMm2: number }>();
  let isaretsizMm2 = 0, toplamMm2 = 0;
  for (const y of yuzler) {
    toplamMm2 += y.alanMm2;
    const i = isaretler.get(y.sira);
    if (i === undefined) { isaretsizMm2 += y.alanMm2; continue; }
    const a = islemAnahtari(i.islem);
    const o = islemler.get(a) ?? { yuzSayisi: 0, alanMm2: 0 };
    islemler.set(a, { yuzSayisi: o.yuzSayisi + 1, alanMm2: o.alanMm2 + y.alanMm2 });
  }
  return { islemler, isaretsizMm2, toplamMm2 };
}

// Görüntüdeki yüz sırası (okuyucunun B-rep yüz aralıkları) sunucunun yüz sırasıyla denetlenir: sayı aynı ve her yüzün üçgen alanı
// sunucu alanına yakın olmalı. Üçgenleme eğri yüzde alanı biraz küçültür; pay yüzde 5, en az 0,5 mm². Uymazsa modelde boyama ve
// tıklama kapanır (yanlış yüzü işaretlemek hiç işaretlememekten kötüdür); seçim tablodan sürer.
export function agYuzAlanlari(konum: ArrayLike<number>, dizin: ArrayLike<number>, araliklar: ArrayLike<number>): number[] {
  const n = (i: number): number => konum[i] ?? 0;
  const alanlar: number[] = [];
  for (let k = 0; k + 1 < araliklar.length; k += 2) {
    let alan = 0;
    for (let t = araliklar[k] ?? 0; t <= (araliklar[k + 1] ?? -1); t++) {
      const a = 3 * (dizin[3 * t] ?? 0), b = 3 * (dizin[3 * t + 1] ?? 0), c = 3 * (dizin[3 * t + 2] ?? 0);
      const ux = n(b) - n(a), uy = n(b + 1) - n(a + 1), uz = n(b + 2) - n(a + 2);
      const vx = n(c) - n(a), vy = n(c + 1) - n(a + 1), vz = n(c + 2) - n(a + 2);
      alan += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    alanlar.push(alan);
  }
  return alanlar;
}
export const YUZ_ALAN_PAYI = 0.05;
export function yuzSirasiUyar(goruntu: readonly number[], sunucu: readonly number[]): boolean {
  if (goruntu.length === 0 || goruntu.length !== sunucu.length) return false;
  return goruntu.every((a, i) => Math.abs(a - (sunucu[i] ?? 0)) <= Math.max(YUZ_ALAN_PAYI * (sunucu[i] ?? 0), 0.5));
}
// Üçgenin yüzü: aralıklar sıralıdır, ikili arama.
export function ucgeninYuzu(araliklar: ArrayLike<number>, ucgen: number): number | null {
  let alt = 0, ust = araliklar.length / 2 - 1;
  while (alt <= ust) {
    const o = (alt + ust) >> 1;
    if (ucgen < (araliklar[2 * o] ?? 0)) ust = o - 1;
    else if (ucgen > (araliklar[2 * o + 1] ?? 0)) alt = o + 1;
    else return o;
  }
  return null;
}

// Yüzün yönü (prototip v3 grupları): görüntü ağındaki üçgenlerin alanla ağırlıklı normali, model koordinatında. Düzlemde tek
// normaldir; eğri yüzde anlamsızdır ve yalnız düzlemde kullanılır. Üçgeni olmayan yüz null.
export type Yon3 = readonly [number, number, number];
export function agYuzNormalleri(konum: ArrayLike<number>, dizin: ArrayLike<number>, araliklar: ArrayLike<number>): (Yon3 | null)[] {
  const n = (i: number): number => konum[i] ?? 0;
  const sonuc: (Yon3 | null)[] = [];
  for (let k = 0; k + 1 < araliklar.length; k += 2) {
    let x = 0, y = 0, z = 0;
    for (let t = araliklar[k] ?? 0; t <= (araliklar[k + 1] ?? -1); t++) {
      const a = 3 * (dizin[3 * t] ?? 0), b = 3 * (dizin[3 * t + 1] ?? 0), c = 3 * (dizin[3 * t + 2] ?? 0);
      const ux = n(b) - n(a), uy = n(b + 1) - n(a + 1), uz = n(b + 2) - n(a + 2);
      const vx = n(c) - n(a), vy = n(c + 1) - n(a + 1), vz = n(c + 2) - n(a + 2);
      x += uy * vz - uz * vy; y += uz * vx - ux * vz; z += ux * vy - uy * vx;
    }
    const u = Math.hypot(x, y, z);
    sonuc.push(u === 0 ? null : [x / u + 0, y / u + 0, z / u + 0]);
  }
  return sonuc;
}

// Yüz grupları (prototip v3): kullanıcı tek tek yüz aramaz, gruba dokunur. Delikler Özellikler'den çapa göre (delikle birlikte ona bağlı
// kademe ve havşa yüzleri; tapa sayısı delik sayısıdır), pah ve radyüs Özellikler'den, kalan yüzler tür ve yönden. Model Z ekseni
// yukarı kabul edilir: normali +Z üst, -Z alt (oturma, bant), yatay yan yüzdür. Yön bilinmiyorsa (modelde yüz gösterilemiyor)
// düzlemler tek gruptur. Boş grup yazılmaz.
export interface YuzGrubu {
  anahtar: string;
  ad: string;
  simge: 'target' | 'cube' | 'layers' | 'list' | 'ruler';
  yuzler: number[];
  // Maskelenince takılacak tapa sayısı (delik grubunda delik sayısı).
  tapa: number;
  // Maskelenince bantlanan oturma yüzü grubu.
  bant: boolean;
}
type YuzSatiri = GeometriYuzeyCevabi['yuzler'][number];
const DUSEY = 0.9;
const sayili = (ad: string, n: number): string => (n > 1 ? `${ad} × ${String(n)}` : ad);
export function yuzGruplari(yuzler: readonly YuzSatiri[], ozellikler: readonly GeometriOzellik[] | null, normaller: readonly (Yon3 | null)[] | null): YuzGrubu[] {
  const mevcut = new Set(yuzler.map((y) => y.sira));
  const kullanilan = new Set<number>();
  const al = (liste: readonly number[]): number[] => {
    const s = [...new Set(liste)].filter((x) => mevcut.has(x) && !kullanilan.has(x)).sort((a, b) => a - b);
    for (const x of s) kullanilan.add(x);
    return s;
  };
  const gruplar: YuzGrubu[] = [];
  const ekle = (g: YuzGrubu) => { if (g.yuzler.length > 0) gruplar.push(g); };
  const oz = ozellikler ?? [];
  const delikler = oz.filter((o) => o.tur === 'delik' && o.ust === null);
  const capa = new Map<string, { cap: number | null; delikler: GeometriOzellik[] }>();
  for (const d of delikler) {
    const k = d.capMm === null ? 'yok' : d.capMm.toFixed(1);
    capa.set(k, { cap: d.capMm, delikler: [...(capa.get(k)?.delikler ?? []), d] });
  }
  for (const [k, g] of [...capa].sort(([, a], [, b]) => (b.cap ?? -1) - (a.cap ?? -1))) {
    const yz = g.delikler.flatMap((d) => [...d.yuzler, ...oz.filter((o) => o.ust === d.sira).flatMap((o) => o.yuzler)]);
    ekle({ anahtar: `delik:${k}`, ad: sayili(g.cap === null ? 'Delik' : `Delik Ø${uzunluk(g.cap)}`, g.delikler.length), simge: 'target', yuzler: al(yz), tapa: g.delikler.length, bant: false });
  }
  const kalan = (f: (y: YuzSatiri) => boolean): number[] => yuzler.filter((y) => !kullanilan.has(y.sira) && f(y)).map((y) => y.sira);
  const turle = (anahtar: string, ad: string, simge: YuzGrubu['simge'], liste: number[], bant = false) => {
    const yz = al(liste);
    ekle({ anahtar, ad: sayili(ad, yz.length), simge, yuzler: yz, tapa: 0, bant });
  };
  const yon = (y: YuzSatiri): Yon3 | null => normaller?.[y.sira - 1] ?? null;
  const pahlar = al(oz.filter((o) => o.tur === 'pah').flatMap((o) => o.yuzler));
  const radyuslar = al(oz.filter((o) => o.tur === 'radyus').flatMap((o) => o.yuzler));
  turle('dis', 'Dış silindir', 'cube', kalan((y) => y.tur === 'silindir' && !y.ters));
  if (normaller !== null) {
    turle('ust', 'Üst yüz', 'layers', kalan((y) => y.tur === 'duzlem' && (yon(y)?.[2] ?? 0) > DUSEY));
    turle('alt', 'Alt yüz (oturma)', 'layers', kalan((y) => y.tur === 'duzlem' && (yon(y)?.[2] ?? 0) < -DUSEY), true);
    turle('yan', 'Yan yüz', 'layers', kalan((y) => y.tur === 'duzlem' && Math.abs(yon(y)?.[2] ?? 1) < 1 - DUSEY));
    turle('egik', 'Eğik düzlem', 'layers', kalan((y) => y.tur === 'duzlem'));
  } else {
    turle('duzlem', 'Düzlem', 'layers', kalan((y) => y.tur === 'duzlem'));
  }
  // Pah ve radyüs yüzleri yukarıda alındı; burada yalnız gruba yazılır (sıra prototipteki gibi silindir ve düzlemlerden sonra).
  ekle({ anahtar: 'pah', ad: sayili('Pah', pahlar.length), simge: 'ruler', yuzler: pahlar, tapa: 0, bant: false });
  ekle({ anahtar: 'radyus', ad: sayili('Radyüs', radyuslar.length), simge: 'ruler', yuzler: radyuslar, tapa: 0, bant: false });
  turle('ic', 'İç silindir', 'target', kalan((y) => y.tur === 'silindir' && y.ters));
  turle('diger', 'Diğer yüz', 'list', kalan(() => true));
  return gruplar;
}

// Şartname değerinden hesap girdisi (2144-3 b). Alan adı şartnameye göre değişir; birim ve anahtarla tanınır: kalınlık µm (mm ise
// bine çarpılır) ya da anahtarı "kalinlik", yoğunluk g/cm³ ya da anahtarı "yogunluk", verim anahtarı "verim". Değer sayı, aralık
// (ortası), metin (ilk sayı, örn. "12 µm (Fe/Zn12)") ya da çoklu seçim (ilk seçenek) olabilir; okunamayan alan yok sayılır.
export type HesapAlani = 'kalinlik' | 'yogunluk' | 'verim';
type SartnameDegeri = GeometriYuzeyAdimi['parametreler'][number];
const ilkSayi = (m: string): number | null => {
  const e = /\d+(?:[.,]\d+)?/.exec(m);
  return e === null ? null : Number(e[0].replace(',', '.'));
};
const degerSayisi = (d: SartnameDegeri['deger']): number | null => {
  if (typeof d === 'number') return d;
  if (Array.isArray(d)) {
    const [a, b] = d;
    if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2;
    return typeof a === 'string' ? ilkSayi(a) : null;
  }
  return typeof d === 'string' ? ilkSayi(d) : null;
};
const sade = (m: string | null): string => (m ?? '').toLocaleLowerCase('tr-TR').replace(/\s/g, '');
export function sartnameSayisi(parametreler: readonly SartnameDegeri[], alan: HesapAlani): number | null {
  for (const p of parametreler) {
    const b = sade(p.birim), a = sade(p.anahtar);
    let kat: number | null = null;
    if (alan === 'kalinlik') kat = b === 'µm' || b === 'μm' || b === 'um' || b === 'mikron' ? 1 : a.includes('kalinlik') ? (b === 'mm' ? 1000 : 1) : null;
    if (alan === 'yogunluk') kat = b === 'g/cm³' || b === 'g/cm3' || a.includes('yogunluk') ? 1 : null;
    if (alan === 'verim') kat = a.includes('verim') ? 1 : null;
    if (kat === null) continue;
    const x = degerSayisi(p.deger);
    if (x !== null && Number.isFinite(x) && x > 0) return x * kat;
  }
  return null;
}
// Kullanıcının yazdığı pozitif sayı; boş ya da geçersizse null.
export const pozitifSayi = (m: string): number | null => {
  const x = Number(m.trim().replace(',', '.'));
  return m.trim() === '' || !Number.isFinite(x) || x <= 0 ? null : x;
};
// Toz miktarı (prototip v3): kg = m² x µm x g/cm³ / 1000 / (verim / 100) x adet. Yalnız hesaptır, kaydedilmez. Eksik girdi null.
export function tozKg(alanMm2: number, kalinlikUm: number | null, yogunluk: number | null, verimYuzde: number | null, adet: number): number | null {
  if (kalinlikUm === null || yogunluk === null || verimYuzde === null) return null;
  return ((alanMm2 / 1e6) * kalinlikUm * yogunluk) / 1000 / (verimYuzde / 100) * adet;
}
export const tozMetni = (kg: number): string => `${bicim(2).format(kg)} kg`;
export const m2Kisa = (mm2: number): string => `${bicim(3).format(mm2 / 1e6)} m²`;

// Önizleme (2396): çalışmanın sonucu modelin üstünde çizilir; ölçü sunucudandır, yer (merkez) görüntünün ağından bulunur, çünkü sözleşme
// döndürülmüş kutunun ve kapsayan dairenin merkezini taşımaz. Yalnız görsel yardımdır (yaklaşık); hesap ve kesim planı değildir.
export type Nokta2 = readonly [number, number];
const ic3 = (p: ArrayLike<number>, i: number, e: Yon3): number => (p[i] ?? 0) * e[0] + (p[i + 1] ?? 0) * e[1] + (p[i + 2] ?? 0) * e[2];

// Noktaların (x, y, z dizisi) her eksen üzerindeki izdüşüm aralığı.
export function eksenAraliklari(noktalar: ArrayLike<number>, eksenler: readonly Yon3[]): { en: number[]; ust: number[] } | null {
  if (noktalar.length < 3) return null;
  const en = eksenler.map(() => Infinity), ust = eksenler.map(() => -Infinity);
  for (let i = 0; i + 2 < noktalar.length; i += 3) {
    eksenler.forEach((e, k) => {
      const d = ic3(noktalar, i, e);
      if (d < en[k]!) en[k] = d;
      if (d > ust[k]!) ust[k] = d;
    });
  }
  return { en, ust };
}

// Eksen katsayılarından model koordinatında nokta: toplam (katsayı x eksen).
export function eksendenNokta(katsayilar: readonly number[], eksenler: readonly Yon3[]): [number, number, number] {
  const p: [number, number, number] = [0, 0, 0];
  eksenler.forEach((e, k) => { const c = katsayilar[k] ?? 0; p[0] += c * e[0]; p[1] += c * e[1]; p[2] += c * e[2]; });
  return p;
}

function zarf(noktalar: readonly Nokta2[]): Nokta2[] {
  const iz = [...noktalar].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (iz.length < 3) return iz;
  const yon = (o: Nokta2, a: Nokta2, b: Nokta2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const alt: Nokta2[] = [], ust: Nokta2[] = [];
  for (const p of iz) { while (alt.length >= 2 && yon(alt[alt.length - 2]!, alt[alt.length - 1]!, p) <= 0) alt.pop(); alt.push(p); }
  for (let i = iz.length - 1; i >= 0; i--) { const p = iz[i]!; while (ust.length >= 2 && yon(ust[ust.length - 2]!, ust[ust.length - 1]!, p) <= 0) ust.pop(); ust.push(p); }
  return [...alt.slice(0, -1), ...ust.slice(0, -1)];
}

export interface Daire { x: number; y: number; r: number }
const icinde = (d: Daire, p: Nokta2): boolean => Math.hypot(p[0] - d.x, p[1] - d.y) <= d.r * (1 + 1e-9) + 1e-9;
const ikiden = (a: Nokta2, b: Nokta2): Daire => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, r: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 });
function ucten(a: Nokta2, b: Nokta2, c: Nokta2): Daire {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return [ikiden(a, b), ikiden(a, c), ikiden(b, c)].reduce((en, x) => (x.r > en.r ? x : en));
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}

// Noktaları kapsayan en küçük daire (Welzl, zarf üzerinde); sunucunun çubuk çapı hesabıyla aynı yöntem. Çubuk hamının merkezi budur,
// kutu merkezi değildir (L ya da eksantrik kesitte ikisi ayrılır).
export function kapsayanDaire(noktalar: readonly Nokta2[]): Daire | null {
  const z = zarf(noktalar);
  if (z.length === 0) return null;
  let d: Daire = { x: z[0]![0], y: z[0]![1], r: 0 };
  for (let i = 1; i < z.length; i++) {
    if (icinde(d, z[i]!)) continue;
    d = { x: z[i]![0], y: z[i]![1], r: 0 };
    for (let j = 0; j < i; j++) {
      if (icinde(d, z[j]!)) continue;
      d = ikiden(z[i]!, z[j]!);
      for (let k = 0; k < j; k++) if (!icinde(d, z[k]!)) d = ucten(z[i]!, z[j]!, z[k]!);
    }
  }
  return d;
}

// Önizlemede çizilecek katı: eksenler model koordinatında (birim), boyut her eksende (mm), merkez model koordinatında.
export interface OnizlemeKatisi { sekil: 'kutu' | 'silindir' | 'altigen'; merkez: [number, number, number]; eksenler: readonly Yon3[]; boyut: [number, number, number] }

const sirala = (x: readonly number[]): [number, number, number] => {
  const s = [...x].sort((a, b) => b - a);
  return [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0];
};

// Ham önerisinin katısı: döndürülmüş kutunun eksenlerinde (a uzun eksen). Çubuk ve altıgen a çevresinde, merkezleri dik düzlemde
// kapsayan dairenin merkezidir; lama, levha ve blok kutudur, merkezi izdüşüm aralıklarının ortasıdır. Pay her yüzde eşit varsayılır.
export function hamKatisi(o: HamStokOnerisi, yon: readonly Yon3[], noktalar: ArrayLike<number>): OnizlemeKatisi | null {
  const ar = eksenAraliklari(noktalar, yon);
  if (ar === null || yon.length !== 3) return null;
  const orta = ar.en.map((e, k) => (e + ar.ust[k]!) / 2);
  const olcu = (k: string): number => o.olcu[k] ?? 0;
  if (o.form === 'cubuk' || o.form === 'altigen') {
    const iz: Nokta2[] = [];
    // Büyük ağda her noktayı almak gerekmez: zarf için 20 000 civarı yeter.
    const adim = Math.max(1, Math.floor(noktalar.length / 3 / 20000)) * 3;
    for (let i = 0; i + 2 < noktalar.length; i += adim) iz.push([ic3(noktalar, i, yon[1]!), ic3(noktalar, i, yon[2]!)]);
    const d = kapsayanDaire(iz);
    if (d === null) return null;
    const boy = o.kesimBoyuMm ?? olcu('l');
    const cap = o.form === 'cubuk' ? olcu('d') : olcu('s');
    return { sekil: o.form === 'cubuk' ? 'silindir' : 'altigen', merkez: eksendenNokta([orta[0]!, d.x, d.y], yon), eksenler: yon, boyut: [boy, cap, cap] };
  }
  const boyut: [number, number, number] = o.form === 'lama' ? [o.kesimBoyuMm ?? olcu('l'), ...sirala([olcu('a'), olcu('b')]).slice(0, 2) as [number, number]]
    : o.form === 'levha' ? [o.kesimBoyuMm ?? olcu('l'), ...sirala([olcu('w'), olcu('t')]).slice(0, 2) as [number, number]]
      : sirala([olcu('a'), olcu('b'), olcu('h')]);
  return { sekil: 'kutu', merkez: eksendenNokta(orta, yon), eksenler: yon, boyut };
}

export const BIRIM_EKSENLER: readonly Yon3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// Analizin iki kutusu: eksenlere hizalı dış kutu ve döndürülmüş kutu; ikisi de ağın izdüşüm aralığının ortasında.
export function analizKatilari(obbYon: readonly Yon3[], obb: readonly [number, number, number], kutu: readonly [number, number, number], noktalar: ArrayLike<number>): OnizlemeKatisi[] {
  const sonuc: OnizlemeKatisi[] = [];
  const dis = eksenAraliklari(noktalar, BIRIM_EKSENLER);
  if (dis !== null) sonuc.push({ sekil: 'kutu', merkez: eksendenNokta(dis.en.map((e, k) => (e + dis.ust[k]!) / 2), BIRIM_EKSENLER), eksenler: BIRIM_EKSENLER, boyut: [...kutu] });
  const don = obbYon.length === 3 ? eksenAraliklari(noktalar, obbYon) : null;
  if (don !== null) sonuc.push({ sekil: 'kutu', merkez: eksendenNokta(don.en.map((e, k) => (e + don.ust[k]!) / 2), obbYon), eksenler: obbYon, boyut: [...obb] });
  return sonuc;
}

// Standart görünümler: kameranın modele baktığı yön, görüntü koordinatında (Y yukarı; model Z yukarıdan X ekseni çevresinde döner,
// modelin -Y yönü görüntünün +Z'sidir). Ön: modelin -Y'sinden, üst: +Z'den, sağ: +X'ten.
export const GORUNUMLER = {
  on: { baslik: 'Ön', yon: [0, 0, 1] },
  ust: { baslik: 'Üst', yon: [0, 1, 0.0001] },
  sag: { baslik: 'Sağ', yon: [1, 0, 0] },
  izo: { baslik: 'İzometrik', yon: [1, 1, 1] },
} as const satisfies Record<string, { baslik: string; yon: Yon3 }>;
export type GorunumAdi = keyof typeof GORUNUMLER;
