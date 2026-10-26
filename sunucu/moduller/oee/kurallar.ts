// OEE kuralları (kart #1330). Saf: veritabanı ve saat yok. Süreler dakika, tutarlar TRY.
import type { OeeOlcusu } from '#paylasilan/sozlesme/oee.ts';

const DK_MS = 60_000;

export interface Aralik { bas: number; bit: number }

// OE-01: aralıkların [bas, bit) penceresine düşen süresi (dakika). Takvim aralıkları sıralı ve örtüşmezdir (vardiya sözleşmesi).
export function penceredekiDakika(araliklar: readonly Aralik[], bas: number, bit: number): number {
  let ms = 0;
  for (const a of araliklar) ms += Math.max(0, Math.min(a.bit, bit) - Math.max(a.bas, bas));
  return ms / DK_MS;
}

// Kişinin bir makinedeki payı: o makinedeki yüzdesinin, bütün makine atamalarının yüzde toplamına oranı (OE-05).
// Yüzde zamanın bölüşümüdür: 3 makineye eşit atanmış kişi her makinede 1/3 sayılır. Toplamı sıfır olan kişinin payı yoktur.
export function kisiPaylari(atamalar: readonly { kisiId: number; makineId: number; yuzde: number }[]): Map<number, { kisiId: number; pay: number }[]> {
  const toplam = new Map<number, number>();
  for (const a of atamalar) toplam.set(a.kisiId, (toplam.get(a.kisiId) ?? 0) + a.yuzde);
  const sonuc = new Map<number, { kisiId: number; pay: number }[]>();
  for (const a of atamalar) {
    const t = toplam.get(a.kisiId) ?? 0;
    if (!(t > 0) || !(a.yuzde > 0)) continue;
    sonuc.set(a.makineId, [...(sonuc.get(a.makineId) ?? []), { kisiId: a.kisiId, pay: a.yuzde / t }]);
  }
  return sonuc;
}

export interface SayimAni { an: number; saglam: number; hurda: number; red: number; standartSaniye: number; suresizSaglam: number }
export interface VardiyaDisi { calismaDk: number; standartDk: number; saglam: number; hurda: number; red: number }
export interface Ayrim {
  ici: Pick<HamOlcu, 'calismaDk' | 'standartDk' | 'saglam' | 'hurda' | 'red' | 'suresizSaglam'>;
  disi: VardiyaDisi;
}

// Sıralı ve örtüşmeyen iki aralık listesinin kesişen süresi (ms).
function kesisenMs(a: readonly Aralik[], b: readonly Aralik[]): number {
  let ms = 0;
  for (const x of a) for (const y of b) ms += Math.max(0, Math.min(x.bit, y.bit) - Math.max(x.bas, y.bas));
  return ms;
}

// OE-16 (kullanıcı kararı 644 a): çalışma ve sayım vardiya takvimiyle kesişir; takvim dışında kalan (vardiya dışı, mola, planlı duruş)
// OEE'ye girmez, ayrıca döner. Sayım anı aralığın iki ucu dahil içeridedir: vardiyanın son anında bitirilen parça vardiyanındır.
// Takvim bilinmiyorsa (null) ayrılamaz: hepsi içeride sayılır, planlı süre zaten bilinmediğinden oranlar null kalır.
export function vardiyaIleAyir(plan: readonly Aralik[] | null, kullanimlar: readonly Aralik[], sayimlar: readonly SayimAni[]): Ayrim {
  const toplamMs = kullanimlar.reduce((t, k) => t + Math.max(0, k.bit - k.bas), 0);
  const iciMs = plan === null ? toplamMs : kesisenMs(kullanimlar, plan);
  const iceride = (an: number) => plan === null || plan.some((a) => an >= a.bas && an <= a.bit);
  const ici = { calismaDk: iciMs / DK_MS, standartDk: 0, saglam: 0, hurda: 0, red: 0, suresizSaglam: 0 };
  const disi = { calismaDk: (toplamMs - iciMs) / DK_MS, standartDk: 0, saglam: 0, hurda: 0, red: 0 };
  for (const s of sayimlar) {
    const h = iceride(s.an) ? ici : disi;
    h.standartDk += s.standartSaniye / 60;
    h.saglam += s.saglam;
    h.hurda += s.hurda;
    h.red += s.red;
    if (h === ici) ici.suresizSaglam += s.suresizSaglam;
  }
  return { ici, disi };
}

export interface Iscilik { pay: number; mesaiDk: number | null; saatMaliyeti: number | null }

export interface HamOlcu {
  planliDk: number | null;
  takvimDk: number;
  calismaDk: number;
  standartDk: number;
  saglam: number;
  hurda: number;
  // Kalite kararıyla reddedilen adet: hurda gibi kalite kaybıdır (OE-15).
  red: number;
  suresizSaglam: number;
  vardiyaDisi: VardiyaDisi;
  kisiPayi: number | null;
  makineMaliyeti: number | null;
  iscilikMaliyeti: number | null;
}

// OE-06: makine maliyeti = planlı saat x istasyonun saat maliyeti. Planlı süre ya da maliyet yoksa null.
export function makineMaliyeti(planliDk: number | null, saatMaliyeti: number | null): number | null {
  return planliDk === null || saatMaliyeti === null ? null : (planliDk / 60) * saatMaliyeti;
}

// OE-07: işçilik = makineye atanmış her kişinin mesaisi x payı x saat maliyeti. Ataması olmayan makinenin işçiliği bilinmez (null);
// bir kişinin mesaisi ya da maliyeti bilinmiyorsa toplam da bilinmez.
export function iscilikMaliyeti(kisiler: readonly Iscilik[]): number | null {
  if (kisiler.length === 0) return null;
  let toplam = 0;
  for (const k of kisiler) {
    if (k.mesaiDk === null || k.saatMaliyeti === null) return null;
    toplam += (k.mesaiDk / 60) * k.pay * k.saatMaliyeti;
  }
  return toplam;
}

export const kisiPayiToplami = (kisiler: readonly Iscilik[]): number | null => (kisiler.length === 0 ? null : kisiler.reduce((t, k) => t + k.pay, 0));

const bolum = (pay: number, payda: number | null): number | null => (payda === null || !(payda > 0) ? null : pay / payda);
const yuvarla = (x: number | null, basamak: number): number | null => (x === null ? null : Math.round(x * 10 ** basamak) / 10 ** basamak);

// OE-10 (kullanıcı kararı "Veri eksik"): sağlamın standart süresi makinenin çalışma süresinden büyükse sayım çalışma kaydıyla
// açıklanamaz (çalışma kaydı yok ya da az, birim süre yanlış); performans sınırsız büyür. Bu kayıtta performans, OEE ve TEEP hesaplanmaz.
// Üretimsiz makine (standart 0) eksik sayılmaz: OEE'si gerçek sıfırdır. Çalışma planlı süreden uzunsa kullanılabilirlik %100'ü aşardı;
// bu kayıtta kullanılabilirlik de hesaplanmaz. Çalışma takvimle kesiştiğinden (OE-16) bu kol takvim tutarsızlığına karşı korumadır.
const planliSureEksikMi = (h: Pick<HamOlcu, 'planliDk' | 'calismaDk'>): boolean => h.planliDk !== null && h.calismaDk > h.planliDk;
export const veriEksikMi = (h: Pick<HamOlcu, 'planliDk' | 'calismaDk' | 'standartDk'>): boolean =>
  (h.standartDk > 0 && h.calismaDk < h.standartDk) || planliSureEksikMi(h);

// OE-02: OEE = sağlam standart süre / planlı süre; kullanılabilirlik = çalışma / planlı; kalite = sağlam / (sağlam + hurda + red) (OE-15);
// performans = OEE / (kullanılabilirlik x kalite). TEEP aynı payın takvim süresine oranıdır (OE-03). Payda yoksa ya da sıfırsa null.
// OE-08: birim maliyet = (makine + işçilik) / sağlam; ikisinden biri bilinmiyorsa ya da sağlam yoksa null.
export function olcuHesapla(h: HamOlcu): OeeOlcusu {
  const veriEksik = veriEksikMi(h);
  const kullanilabilirlik = planliSureEksikMi(h) ? null : bolum(h.calismaDk, h.planliDk);
  const kalite = bolum(h.saglam, h.saglam + h.hurda + h.red);
  const oee = veriEksik ? null : bolum(h.standartDk, h.planliDk);
  const performans = oee === null || kullanilabilirlik === null || kalite === null ? null : bolum(oee, kullanilabilirlik * kalite);
  const birim = h.makineMaliyeti === null || h.iscilikMaliyeti === null ? null : bolum(h.makineMaliyeti + h.iscilikMaliyeti, h.saglam);
  return {
    planliDk: yuvarla(h.planliDk, 1),
    takvimDk: yuvarla(h.takvimDk, 1)!,
    calismaDk: yuvarla(h.calismaDk, 1)!,
    standartDk: yuvarla(h.standartDk, 1)!,
    saglam: h.saglam,
    hurda: h.hurda,
    red: h.red,
    suresizSaglam: h.suresizSaglam,
    vardiyaDisi: {
      calismaDk: yuvarla(h.vardiyaDisi.calismaDk, 1)!,
      standartDk: yuvarla(h.vardiyaDisi.standartDk, 1)!,
      saglam: h.vardiyaDisi.saglam,
      hurda: h.vardiyaDisi.hurda,
      red: h.vardiyaDisi.red,
    },
    kullanilabilirlik: yuvarla(kullanilabilirlik, 4),
    veriEksik,
    performans: yuvarla(performans, 4),
    kalite: yuvarla(kalite, 4),
    oee: yuvarla(oee, 4),
    teep: veriEksik ? null : yuvarla(bolum(h.standartDk, h.takvimDk), 4),
    kisiPayi: yuvarla(h.kisiPayi, 3),
    makineMaliyeti: yuvarla(h.makineMaliyeti, 2),
    iscilikMaliyeti: yuvarla(h.iscilikMaliyeti, 2),
    birimMaliyet: yuvarla(birim, 2),
  };
}

const toplaBilinen = (degerler: readonly (number | null)[]): number | null =>
  (degerler.some((d) => d === null) ? null : degerler.reduce<number>((t, d) => t + (d ?? 0), 0));

// OE-04: üst düzey (istasyon, iş merkezi, tesis) makinelerin ham değerlerinin toplamıdır, oranların ortalaması değil.
// Bir makinenin planlı süresi ya da maliyeti bilinmiyorsa üst düzeyde de bilinmez: eksik toplam doğru gibi gösterilmez.
// Verisi eksik makine (OE-10) üst düzeye hiç girmez; toplam yalnız geçerli kayıtlardır.
export const ortalamayaGirenler = (hamlar: readonly HamOlcu[]): HamOlcu[] => hamlar.filter((h) => !veriEksikMi(h));
export function topla(hamlar: readonly HamOlcu[]): HamOlcu {
  const sayi = (f: (h: HamOlcu) => number) => hamlar.reduce((t, h) => t + f(h), 0);
  const paylar = hamlar.map((h) => h.kisiPayi).filter((p): p is number => p !== null);
  return {
    planliDk: hamlar.length === 0 ? null : toplaBilinen(hamlar.map((h) => h.planliDk)),
    takvimDk: sayi((h) => h.takvimDk),
    calismaDk: sayi((h) => h.calismaDk),
    standartDk: sayi((h) => h.standartDk),
    saglam: sayi((h) => h.saglam),
    hurda: sayi((h) => h.hurda),
    red: sayi((h) => h.red),
    suresizSaglam: sayi((h) => h.suresizSaglam),
    vardiyaDisi: {
      calismaDk: sayi((h) => h.vardiyaDisi.calismaDk),
      standartDk: sayi((h) => h.vardiyaDisi.standartDk),
      saglam: sayi((h) => h.vardiyaDisi.saglam),
      hurda: sayi((h) => h.vardiyaDisi.hurda),
      red: sayi((h) => h.vardiyaDisi.red),
    },
    kisiPayi: paylar.length === 0 ? null : paylar.reduce((t, p) => t + p, 0),
    makineMaliyeti: hamlar.length === 0 ? null : toplaBilinen(hamlar.map((h) => h.makineMaliyeti)),
    iscilikMaliyeti: hamlar.length === 0 ? null : toplaBilinen(hamlar.map((h) => h.iscilikMaliyeti)),
  };
}

// Maliyet görme yetkisi olmayana tutarlar boş döner (OE-09); oranlar ve süreler aynı kalır.
export const maliyetsiz = <O extends OeeOlcusu>(o: O): O => ({ ...o, makineMaliyeti: null, iscilikMaliyeti: null, birimMaliyet: null });
