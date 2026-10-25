// Plan kuralları (saf). Zaman ekseni dakikadır (0 = şimdi); takvim verilmezse sürekli çalışma (UYUM-BORCU: vardiya gelince takvim).

import { ELLE_CARPAN, PLAN_ONAY_KOMUTLARI } from '#paylasilan/sozlesme/plan.ts';
import type { PlanOnayKomutu, SenaryoDurumu, SenaryoYapabilir } from '#paylasilan/sozlesme/plan.ts';

export interface Kaynak { tur: 'makine' | 'kisi'; id: number }
export const kaynakAnahtari = (k: Kaynak): string => `${k.tur}:${k.id}`;
export const ayniKaynak = (a: Kaynak, b: Kaynak): boolean => a.tur === b.tur && a.id === b.id;

export interface Aralik { baslangic: number; bitis: number }
export const cakisirMi = (a: Aralik, b: Aralik): boolean => a.baslangic < b.bitis && b.baslangic < a.bitis;

// İşin süresi: ayar + adet x birim süre (dakika). Süresi bilinmeyen iş motorca yerleşmez.
export function isSuresi(ayarDk: number | null, birimDk: number | null, adet: number): number | null {
  if (birimDk === null) return null;
  return (ayarDk ?? 0) + adet * birimDk;
}

// Kaynaktaki süre: verim yalnız işlemeye uygulanır, ayar verimden bağımsızdır (prototip: ayar + işleme / verim).
export const verimliSure = (sureDk: number, ayarDk: number | null | undefined, verim: number): number => (ayarDk ?? 0) + (sureDk - (ayarDk ?? 0)) / verim;

export type Kural = 'oncelik' | 'edd' | 'cr' | 'spt' | 'fifo';
// sira: TL iyileştirmesinin denediği emir sırası (emir kimliği -> yer); verilince 'oncelik' kuralında teslim ve önceliğin yerine geçer.
// personel (282 a): kısıt açıkken kaynağın iş merkezinde kişi-dakikası dolmuş güne yeni iş başlamaz, işin dokunduğu dolu günden sonraya kayar.
// kapasite gün başına (gun0'dan) kişi-dakikasıdır; kapasitesi verilmeyen merkez ve ufuk dışı gün kısıtsızdır.
export interface PersonelKisiti {
  gun0: number; merkezi: (k: Kaynak) => { id: number; operator: number } | null; kapasite: ReadonlyMap<number, readonly number[]>;
}
export interface MotorAyari { kural: Kural; yon: 'ileri' | 'geri'; tamponDk: number; sira?: ReadonlyMap<number, number>; personel?: PersonelKisiti }
export const VARSAYILAN_MOTOR: MotorAyari = { kural: 'oncelik', yon: 'ileri', tamponDk: 0 };
const GUN_DK = 24 * 60;

export interface MotorIsi {
  id: number;
  uretimEmriId: number;
  sira: number;
  teslimDk: number | null;
  // Emir düzeyinde: öncelik 1 acil - 4 düşük (bilinmiyorsa en sona), başlangıç tarihi (dakika), elle sıra (KY-03; küçük önce).
  oncelik?: number | null;
  // Emrin açıldığı an, şimdiye göre dakika (FIFO: en eski önce).
  acilmaDk?: number | null;
  emirBaslangicDk?: number | null;
  elleSira?: number | null;
  kaynak: Kaynak | null;
  adaylar: readonly Kaynak[];
  sureDk: number | null;
  // sureDk'nın ayar kısmı; verim ona uygulanmaz. Yoksa bütün süre işlemedir.
  ayarDk?: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  // Akışlı iş: öncülün devir adedini üretme süresi (öncülün ayarı + devir adedi x öncülün birim süresi, verimsiz çalışma dakikası). Ardıl
  // en erken öncülün bu kadar çalışmasından sonra başlar.
  devirDk: number | null;
  // devirDk'nın öncülün ayarından gelen kısmı; öncülün verimi ona uygulanmaz.
  devirAyarDk?: number | null;
  // Akışlı iş: son devir partisini işleme süresi (devir adedi x kendi birim süresi, verimsiz). Ardıl öncülün bitişinden bu kadar
  // çalışma dakikası önce bitemez: öncülün son parçası ancak öncül bitince gelir.
  devirSonDk?: number | null;
  // Başka emirdeki öncüller (parti kolu): kolun ilk adımı üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler.
  // Bağımlılık türü işin kendi bağımlılığıdır (bekleyen, akışlı, bağımsız).
  bagli?: readonly number[];
  // Hemen önündeki fason adımların termin toplamı (takvim dakikası). Fason atölye kapasitesi tüketmez: işi kendi kaynağına yazılmaz,
  // yalnız sonraki adım öncülün bitişinden bu kadar sonra başlar (prototip motoruyla aynı, kullanıcı kararı 14.10.2026). Bağımsız adım beklemez.
  fasonBekleDk?: number;
  // Elle bölme (kart #1572): iş parça parça, her parça kendi süresiyle (ayar dahil) ayrı yer bulur; kaynağı verilen parça orada kalır.
  // Sonraki adım bütün parçaları bekler.
  parcalar?: readonly { no: number; sureDk: number | null; kaynak: Kaynak | null }[];
}
// Bölünmüş sabit iş parça başına bir sabittir (aynı iş emri kimliğiyle).
export interface Sabit extends Aralik { isEmriId: number; uretimEmriId: number; sira: number; kaynak: Kaynak }
export interface YerlesimParcasi extends Aralik { no: number; kaynak: Kaynak }
// Bölünmüş işte yer zarftır (ilk parçanın kaynağı, ilk başlangıç, son bitiş).
export interface Yerlesim extends Aralik { isEmriId: number; kaynak: Kaynak; parcalar?: YerlesimParcasi[] }

// Öncülün işe koyduğu en erken başlangıç (PL-02): bekleyen öncül bitince, akışlı devir kadar sonra, bağımsız hemen. Devir öncülün
// takviminde ve veriminde sayılır (vardiya dışı beklenir); öncülün bitişini geçmez.
export function enErkenBaslangic(is: Pick<MotorIsi, 'bagimlilik' | 'devirDk' | 'devirAyarDk'>, oncul: Aralik | null, simdi: number,
  onculTakvimi: Takvim = null, onculVerimi = 1,
): number {
  if (!oncul || is.bagimlilik === 'bagimsiz') return simdi;
  if (is.bagimlilik === 'akisli') {
    const bas = calismaBasi(onculTakvimi, oncul.baslangic);
    const devir = bas === null ? null : calismaBitisi(onculTakvimi, bas, verimliSure(is.devirDk ?? 0, is.devirAyarDk, onculVerimi));
    return Math.max(simdi, Math.min(devir ?? oncul.bitis, oncul.bitis));
  }
  return Math.max(simdi, oncul.bitis);
}

// Akışlı işin en erken bitişi: öncül bitince son devir partisi kendi takviminde ve veriminde işlenir. Bekleyen ve bağımsız işte sınır
// yok (bekleyen zaten öncül bitince başlar). Ufka sığmazsa null.
export function enErkenBitis(is: Pick<MotorIsi, 'bagimlilik' | 'devirSonDk'>, oncul: Aralik | null, takvim: Takvim = null, verim = 1): number | null {
  if (!oncul || is.bagimlilik !== 'akisli') return Number.NEGATIVE_INFINITY;
  const bas = calismaBasi(takvim, oncul.bitis);
  return bas === null ? null : calismaBitisi(takvim, bas, (is.devirSonDk ?? 0) / verim);
}

// Akışlı iş ilk devir partisi gelince başlar ve öncülünden önce bitemez (prototip): süresi bitiş sınırına yetmiyorsa iş parça bekleyerek
// sınıra kadar uzar ve kaynağı baştan sona tutar. Uzamış hâli boşluğa sığmazsa arama sığdığı ilk başlangıçtan sürer.
export function uzayanBosluk(dolu: readonly Aralik[], takvim: Takvim, enErken: number, sure: number, bitisSiniri: number, siraliMi = false): Aralik | null {
  let bas = enErken;
  for (;;) {
    const a = takvimliBosluk(dolu, takvim, bas, sure, siraliMi);
    if (!a || a.bitis >= bitisSiniri) return a;
    const uzun = takvimliBosluk(dolu, takvim, a.baslangic, kesisimDk(takvim, a.baslangic, bitisSiniri), siraliMi);
    if (!uzun || uzun.baslangic === a.baslangic) return uzun;
    bas = uzun.baslangic;
  }
}

// Kaynakta en erken boşluk: dolu aralıklara değmeyen, en erken başlangıçtan sonraki ilk yer (PL-01: kaynak aynı anda tek iş).
export function bosluk(dolu: readonly Aralik[], enErken: number, sure: number): number {
  let t = enErken;
  for (const a of [...dolu].sort((x, y) => x.baslangic - y.baslangic)) {
    if (a.bitis <= t) continue;
    if (a.baslangic >= t + sure) break;
    t = Math.max(t, a.bitis);
  }
  return t;
}

// Takvim (PL-04): kaynağın çalışma aralıkları, sıralı ve örtüşmez; null sürekli çalışmadır. Tatil ve kapalı gün aralık vermez.
export type Takvim = readonly Aralik[] | null;

// t anından sonraki ilk çalışma anı; ufukta çalışma yoksa null.
export function calismaBasi(takvim: Takvim, t: number): number | null {
  if (takvim === null) return t;
  for (const a of takvim) if (a.bitis > t) return Math.max(a.baslangic, t);
  return null;
}

// Çalışma anından başlayıp sure kadar çalışma dakikası tüketen işin duvar saatindeki bitişi (vardiya arası beklenir); sığmazsa null.
export function calismaBitisi(takvim: Takvim, bas: number, sure: number): number | null {
  if (takvim === null) return bas + sure;
  let kalan = sure;
  for (const a of takvim) {
    if (a.bitis <= bas) continue;
    const b = Math.max(a.baslangic, bas);
    if (kalan <= a.bitis - b) return b + kalan;
    kalan -= a.bitis - b;
  }
  return null;
}

// Geri yön (K2, kullanıcı kararı 16.10.2026): bitişe kadar sure kadar çalışma dakikası tüketen işin en geç başlangıcı; vardiya dışı
// (gece, hafta sonu, tatil) sayılmaz. Takvimsiz kaynak sürekli çalışır; ufkun başına sığmazsa null.
export function calismaBasiGeri(takvim: Takvim, bitis: number, sure: number): number | null {
  if (takvim === null) return bitis - sure;
  let kalan = sure;
  for (let i = takvim.length - 1; i >= 0; i -= 1) {
    const a = takvim[i]!;
    if (a.baslangic >= bitis) continue;
    const z = Math.min(a.bitis, bitis);
    if (kalan <= z - a.baslangic) return z - kalan;
    kalan -= z - a.baslangic;
  }
  return null;
}

// Aralıkların [a, z) içinde kalan dakikası; takvim null ise sürekli çalışmadır.
export const kesisimDk = (takvim: Takvim, a: number, z: number): number =>
  takvim === null ? z - a : takvim.reduce((t, x) => t + Math.max(0, Math.min(x.bitis, z) - Math.max(x.baslangic, a)), 0);

// 481 a: teslime kalan bolluk eski Reçete ve Rota motorundaki gibi vardiya kapasitesi günüyle sayılır (recete-rota-motoru.html anKesri,
// R.slack): an, o gün BAŞLAYAN vardiyaların net dakikasının dolan payıyla gün kesrine çevrilir. Önceki günün gece yarısını geçen vardiyası
// bitmeden gelen an o güne düşer. gunler: gün numarasının (tesis günü) o gün başlayan çalışma aralıkları; null takvimsiz kaynaktır, kesir
// duvar saatidir. Okunmamış gün (undefined) de duvar saatiyle sayılır. gunBasi: g gününün 00:00'ı, aynı dakika ekseninde.
export function kapasiteKesri(gunler: ((g: number) => readonly Aralik[] | undefined) | null, g: number, gunBasi: number, t: number): number {
  const saat = g + (t - gunBasi) / GUN_DK;
  if (gunler === null) return saat;
  const dun = gunler(g - 1) ?? [];
  const dunKap = kesisimDk(dun, -Infinity, Infinity);
  const dunDolan = kesisimDk(dun, -Infinity, t);
  if (dunKap > 0 && dunDolan < dunKap && dun.some((a) => a.bitis > gunBasi && t < a.bitis)) return g - 1 + dunDolan / dunKap;
  const bugun = gunler(g);
  if (bugun === undefined) return saat;
  const kap = kesisimDk(bugun, -Infinity, Infinity);
  return g + (kap > 0 ? Math.min(1, kesisimDk(bugun, -Infinity, t) / kap) : 0);
}

// Bolluk = teslim günü sonu (gün + 1) - adımların en geç kesri (eski R.dueEnd - R.makespan); teslim ya da yerleşen adım yoksa null.
export const kapasiteBollugu = (teslimGun: number | null, kesirler: readonly number[]): number | null =>
  teslimGun === null || kesirler.length === 0 ? null : teslimGun + 1 - Math.max(...kesirler);

// 493 1 a: bölünmüş işin canlıya yazılacak parça adetleri (eski Reçete ve Rota bolmeAdetleri): kayıtlı parçaların oranı adımın adedine
// en büyük kalanla tam sayı olarak dağıtılır, toplamı adım adedidir. Adım adedi tam sayı değilse, parçadan azsa ya da bir parça bir tam
// adetten az kalırsa bölme yazılamaz (null).
export function bolmeAdetleri(oranlar: readonly number[], toplam: number): number[] | null {
  if (oranlar.length < 2 || !Number.isInteger(toplam) || toplam < oranlar.length || oranlar.some((q) => !(q > 0))) return null;
  const top = oranlar.reduce((a, b) => a + b, 0);
  const ham = oranlar.map((q) => (q * toplam) / top);
  const adet = ham.map(Math.floor);
  let kalan = toplam - adet.reduce((a, b) => a + b, 0);
  ham.map((h, i) => [h - adet[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (kalan > 0) { adet[i]! += 1; kalan -= 1; } });
  return adet.every((x) => x >= 1) ? adet : null;
}

// İşin çalışma takvimindeki parçaları: vardiya dışında kalan süre (gece, mola) yük sayılmaz. Takvimsiz kaynak sürekli çalışır.
export const calisilanParcalar = (takvim: Takvim, is: Aralik): Aralik[] =>
  takvim === null ? [is] : takvim.flatMap((x) => {
    const a = Math.max(x.baslangic, is.baslangic);
    const z = Math.min(x.bitis, is.bitis);
    return a < z ? [{ baslangic: a, bitis: z }] : [];
  });

// Çalışma aralıklarından kapalı aralıklar çıkarılır (stüdyonun "gün kapalı" denemesi); sıra ve örtüşmezlik korunur.
export function araliktanCikar(araliklar: readonly Aralik[], cikan: readonly Aralik[]): Aralik[] {
  let l: Aralik[] = [...araliklar];
  for (const c of cikan) {
    l = l.flatMap((x) => (!cakisirMi(x, c) ? [x] : [
      ...(x.baslangic < c.baslangic ? [{ baslangic: x.baslangic, bitis: c.baslangic }] : []),
      ...(x.bitis > c.bitis ? [{ baslangic: c.bitis, bitis: x.bitis }] : []),
    ]));
  }
  return l;
}

// Takvimli boşluk: çalışma anında başlar, dolu aralıklara değmez; ufukta sığmazsa null (PL-05).
// Motor kendi listesini başlangıca göre sıralı ve örtüşmesiz tutar (sirali): kopya ve sıralama yapılmaz, t'den önce biten baş kısım
// ikili aramayla atlanır (hız). Örtüşmesiz sıralı listede bitişler de sıralıdır.
export function takvimliBosluk(dolu: readonly Aralik[], takvim: Takvim, enErken: number, sure: number, siraliMi = false): Aralik | null {
  const sirali = siraliMi ? dolu : [...dolu].sort((x, y) => x.baslangic - y.baslangic);
  const enBuyukBitis: number[] = [];
  if (!siraliMi) for (const x of sirali) enBuyukBitis.push(Math.max(enBuyukBitis[enBuyukBitis.length - 1] ?? Number.NEGATIVE_INFINITY, x.bitis));
  const bitisi = (m: number) => (siraliMi ? sirali[m]!.bitis : enBuyukBitis[m]!);
  let t = calismaBasi(takvim, enErken);
  while (t !== null) {
    const bitis = calismaBitisi(takvim, t, sure);
    if (bitis === null) return null;
    const a = { baslangic: t, bitis: Math.max(bitis, t) };
    const b = a.bitis === a.baslangic ? { baslangic: a.baslangic, bitis: a.baslangic + 1e-9 } : a;
    let lo = 0;
    for (let hi = sirali.length; lo < hi;) { const m = (lo + hi) >> 1; if (bitisi(m) > b.baslangic) hi = m; else lo = m + 1; }
    let engel = Number.NEGATIVE_INFINITY;
    let i = lo;
    for (; i < sirali.length && sirali[i]!.baslangic < b.bitis; i += 1) if (cakisirMi(sirali[i]!, b)) engel = Math.max(engel, sirali[i]!.bitis);
    if (engel === Number.NEGATIVE_INFINITY) return a;
    t = calismaBasi(takvim, engel);
    // Hız: engelin ardına bitişik (aradaki çalışma anından önce başlayan) aralıklar tek atlamada geçilir; arada boşluk yoktur.
    for (; t !== null && i < sirali.length && sirali[i]!.baslangic <= t; i += 1) if (sirali[i]!.bitis > t) t = calismaBasi(takvim, sirali[i]!.bitis);
  }
  return null;
}

// 196 a ara adım (öncelik ağırlığı, kurgu §2 ve §7.2): emrin 1 saat gecikmesinin bedeli (TL/saat) sipariş satırının tutarı ve günlük ceza
// oranından, en az taban. Tutar (201 a: fiyatsız satır), ceza ya da TL olmayınca taban kullanılır: kur verisi yok, yabancı para TL sayılırsa ağırlık yanlış olur.
// Siparişin gerekçeli elle çarpanı varsa o, yoksa emrin elle önceliği çarpandır (195 a: 1 ve 2 Yüksek, 3 Normal, 4 Düşük).
// Finansman ve müşteri sınıfı plan ayarıyla girer (6b); kâr riski 6c'de (194 a).
export const TABAN_BEDEL_SAAT = 150;
// Öncelik ve müşteri sınıfı çarpanları müdürün bedel ayarındadır (denetim #21, 265 a); bunlar ayar satırının varsayılanlarıdır.
// Bedel = (...) × müşteri sınıfı × (elle çarpan, yoksa öncelik çarpanı); sınıfı boş müşteri 1,0 sayılır.
export type MusteriSinifi = 'A' | 'B' | 'C';
export interface Carpanlar {
  yuksekCarpani: number; normalCarpani: number; dusukCarpani: number; sinifACarpani: number; sinifBCarpani: number; sinifCCarpani: number;
}
export const VARSAYILAN_CARPANLAR: Carpanlar = { yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 };
export function oncelikCarpani(oncelik: number | null, c: Carpanlar = VARSAYILAN_CARPANLAR): number {
  if (oncelik === 1 || oncelik === 2) return c.yuksekCarpani;
  return oncelik === 4 ? c.dusukCarpani : c.normalCarpani;
}
export function sinifCarpani(sinif: MusteriSinifi | null, c: Carpanlar = VARSAYILAN_CARPANLAR): number {
  return sinif === null ? 1 : { A: c.sinifACarpani, B: c.sinifBCarpani, C: c.sinifCCarpani }[sinif];
}
export interface BedelSatiri { tutar: string | null; paraBirimi: string; cezaOraniGun: string | null }
export const bedelCarpani = (
  oncelik: number | null, elleCarpan: number | null, sinif: MusteriSinifi | null = null, c: Carpanlar = VARSAYILAN_CARPANLAR,
): number => sinifCarpani(sinif, c) * (elleCarpan ?? oncelikCarpani(oncelik, c));
export function gecikmeBedeli(
  satir: BedelSatiri | null, oncelik: number | null, elleCarpan: number | null = null, taban: number = TABAN_BEDEL_SAAT,
  sinif: MusteriSinifi | null = null, c: Carpanlar = VARSAYILAN_CARPANLAR,
): number {
  const tutar = satir && satir.tutar != null && satir.paraBirimi === 'TRY' ? Number(satir.tutar) : 0;
  const oran = satir?.cezaOraniGun == null ? 0 : Number(satir.cezaOraniGun);
  return Math.max(taban, (tutar * oran) / 100 / 24) * bedelCarpani(oncelik, elleCarpan, sinif, c);
}

// Elle çarpanın üst sınırı (kurgu §7): plan.yaz 2'ye, siparişi onaylayabilen (müdür) 3'e kadar verir; alt sınır her ikisinde 0,5.
export const elleCarpanSiniri = (genis: boolean): number => (genis ? ELLE_CARPAN.enCok : ELLE_CARPAN.planlama);

// 6c, planın TL amacı (203 a, kurgu §2 ve §7): emrin maliyeti = çarpan × (en az(taban × gecikme, ceza + kâr riski × gecikme)
// + finansman × şimdiden bitişe ya da termine (hangisi sonraysa) kadar saat). Ödeme vadesi terminde başlar (3b): erken biten mamul
// termine kadar bekler, erken bitiş tahsilatı öne çekmez. Ceza tavanı dolunca plan bedeli tabana düşmez, ceza son oranıyla sürer (2b):
// düşseydi motor gecikmiş müşteriyi daha da geciktirirdi; tavan sözleşmedeki tutardır, sıralamayı yönetmez. Ceza ve kâr riski yalnız
// teslimi geçen saatte işler. Hepsi yalnız TL satırda hesaplanır: kur verisi yok. Oranı boş olan parça girmez; sıfır uydurulmaz ama taban
// her geciken emre işler (196 a). 35 b: taban, emrin sipariş satırı adedindeki payıyla ağırlanır (ceza, kâr ve finansman emrin tutar payıyla
// zaten ağırlıdır, 225); bölünen sipariş tabanı parça sayısı kadar saymaz. Satırsız emrin payı 1.
export interface MaliyetAyari { tabanSaat: number; finansmanOraniGun: number | null; karRiskiOraniGun: number }
export interface MaliyetSatiri extends BedelSatiri { cezaTavaniOrani: string | null; katkiPayi: string | null }
export function gecikmeMaliyeti(
  satir: MaliyetSatiri | null, carpan: number, zaman: { bitisSaat: number; teslimSaat: number | null }, ayar: MaliyetAyari, pay = 1,
): number {
  const tl = satir !== null && satir.paraBirimi === 'TRY';
  const tutar = tl && satir.tutar != null ? Number(satir.tutar) : 0;
  const saatlik = (taban: number, oranGun: number | null) => (oranGun == null ? 0 : (taban * oranGun) / 100 / 24);
  const finansman = saatlik(tutar, ayar.finansmanOraniGun) * Math.max(0, zaman.bitisSaat, zaman.teslimSaat ?? 0);
  const gecikme = zaman.teslimSaat === null ? 0 : Math.max(0, zaman.bitisSaat - zaman.teslimSaat);
  if (gecikme === 0) return finansman * carpan;
  const ceza = saatlik(tutar, satir?.cezaOraniGun == null ? null : Number(satir.cezaOraniGun)) * gecikme;
  const katki = tl && satir.katkiPayi != null ? Number(satir.katkiPayi) : 0;
  return (Math.max(ayar.tabanSaat * pay * gecikme, ceza + saatlik(katki, ayar.karRiskiOraniGun) * gecikme) + finansman) * carpan;
}

// 35 b: emrin sipariş satırı adedindeki payı (0-1]; satırsız, miktarı bilinmeyen ya da satırdan büyük emirde 1.
export function adetPayi(satir: { miktar: string } | null, adet: number): number {
  const miktar = satir === null ? 0 : Number(satir.miktar);
  return miktar > 0 && adet > 0 ? Math.min(1, adet / miktar) : 1;
}

// 225: aynı satıra bağlı her emir satırın birim fiyatıyla kendi adedi kadar tutar taşır; satırın tamamı her emre yazılmaz (bölünen parti
// ya da elle açılan ikinci emir ceza ve kârı iki kez saymasın). Miktarı sıfır ya da tutarı boş satırda tutar bilinmez.
export function emirTutari(satir: { tutar: string | null; miktar: string }, adet: number): string | null {
  const miktar = Number(satir.miktar);
  return satir.tutar == null || !(miktar > 0) ? null : String((Number(satir.tutar) * adet) / miktar);
}

// Kâr riskinin tabanı (194 a, 227 a): emrin katkı payı = emrin TL tutarı (225) − emrin plandaki iş emirlerinin tahmini maliyeti − emrin plan
// malzeme maliyeti (Proje maliyet). Bir kalem bilinmiyorsa, emir TL değilse ya da fiyatsızsa katkı payı bilinmez (null); kâr riski işlemez.
export function katkiPaylari(
  emirler: ReadonlyMap<number, { tutar: string | null; paraBirimi: string }>, isler: readonly { id: number; uretimEmriId: number }[],
  maliyet: ReadonlyMap<number, number | null>, malzeme: ReadonlyMap<number, number | null>,
): Map<number, string | null> {
  const toplam = new Map<number, number | null>();
  for (const i of isler) {
    if (!emirler.has(i.uretimEmriId)) continue;
    const m = maliyet.get(i.id) ?? null;
    const t = toplam.has(i.uretimEmriId) ? toplam.get(i.uretimEmriId)! : (malzeme.get(i.uretimEmriId) ?? null);
    toplam.set(i.uretimEmriId, t === null || m === null ? null : t + m);
  }
  return new Map([...toplam].map(([id, m]) => {
    const e = emirler.get(id)!;
    return [id, m === null || e.tutar == null || e.paraBirimi !== 'TRY' ? null : String(Number(e.tutar) - m)];
  }));
}

// Planın TL toplamı (203 a): yerleşen emirlerin maliyetleri toplanır. Tam yerleşmemiş emrin bitişi bilinmez, toplama girmez; yerleşmeyen
// emir sayısı göstergelerde ayrıca görünür.
export function planMaliyeti(
  emirler: readonly { bitDk: number | null; teslimDk: number | null; satir: MaliyetSatiri | null; carpan: number; pay?: number }[], ayar: MaliyetAyari,
): number {
  let toplam = 0;
  for (const e of emirler) {
    if (e.bitDk === null) continue;
    toplam += gecikmeMaliyeti(e.satir, e.carpan, { bitisSaat: e.bitDk / 60, teslimSaat: e.teslimDk === null ? null : e.teslimDk / 60 }, ayar, e.pay);
  }
  return Math.round(toplam);
}

// Öncelik sınıfı bedelden çıkar (195 a): ortanca bedelin yüksek eşik katı ve üstü Yüksek (1), düşük eşik katı ve altı Düşük (3), arası
// Normal (2). Eşikler plan ayarındadır (209 a); varsayılan 1,5 ve 0,6.
export const SINIF_ESIGI = { yuksek: 1.5, dusuk: 0.6 } as const;
export function oncelikSiniflari(
  bedeller: ReadonlyMap<number, number>, esik: { yuksek: number; dusuk: number } = SINIF_ESIGI,
): Map<number, 1 | 2 | 3> {
  const s = bantSinirlari(bedeller, esik);
  return new Map([...bedeller].map(([id, b]) => [id, b >= s.yuksek ? 1 : b <= s.dusuk ? 3 : 2]));
}

// Sınıf sınırları TL olarak (306 a): bedel yuksek ve üstü Yüksek, dusuk ve altı Düşük. Sipariş ekranı çarpanın düştüğü bandı gösterir.
export function bantSinirlari(bedeller: ReadonlyMap<number, number>, esik: { yuksek: number; dusuk: number } = SINIF_ESIGI): { yuksek: number; dusuk: number } {
  const l = [...bedeller.values()].sort((a, b) => a - b);
  const orta = l.length === 0 ? 0 : l.length % 2 ? l[(l.length - 1) / 2]! : (l[l.length / 2 - 1]! + l[l.length / 2]!) / 2;
  return { yuksek: orta * esik.yuksek, dusuk: orta * esik.dusuk };
}

// PL-07: emir sırası. Elle sırası olan emir önce (KY-03); sonra kural: öncelik (teslim, öncelik; karar: elle > teslim > öncelik), EDD (en erken teslim), CR (teslime
// kalan / kalan iş), SPT (en kısa iş), FIFO (en eski açılan emir önce). Eşitlikte emir numarası.
export function emirSirasi<E extends { id: number; oncelik: number | null; teslimDk: number | null; sureDk: number; elleSira: number | null; acilmaDk?: number | null }>(
  emirler: readonly E[], kural: Kural, simdi: number, sira?: ReadonlyMap<number, number>,
): E[] {
  const son = Number.POSITIVE_INFINITY;
  const anahtar: Record<Kural, (e: E) => number[]> = {
    oncelik: (e) => [e.teslimDk ?? son, e.oncelik ?? 9],
    edd: (e) => [e.teslimDk ?? son, e.oncelik ?? 9],
    cr: (e) => [e.teslimDk === null ? son : (e.teslimDk - simdi) / Math.max(e.sureDk, 1)],
    spt: (e) => [e.sureDk],
    fifo: (e) => [e.acilmaDk ?? son],
  };
  const k = (e: E) => [e.elleSira ?? son, ...(sira && kural === 'oncelik' ? [sira.get(e.id) ?? son] : anahtar[kural](e)), e.id];
  return [...emirler].sort((a, b) => {
    const x = k(a); const y = k(b);
    for (let i = 0; i < x.length; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
    return 0;
  });
}

// Planın amacı tek TL toplamıdır (203 a, denetim #21): kuralın (teslim, öncelik) kurduğu plan başlangıçtır. Sonra aynı kaynağı kullanan
// ardışık iki emir yer değiştirilip motor yeniden koşar; TL toplamı düşerse değişiklik kalır. Arada başka kaynaktaki emir olabilir: ancak
// kaynağı paylaşan emirlerin sırası planı değiştirir. Elle sıralı emir yerinde kalır. Koşu sayısı sınırlıdır (süre değil): aynı girdi her
// zaman aynı planı verir. Yalnız 'oncelik' kuralında çalışır; öteki kurallar kullanıcının açık seçimidir.
export const TL_IYILESTIRME_KOSUSU = 40;
// Koşu sayısı plandaki iş sayısıyla küçülür: koşu süresi işle doğrusal büyür (ölçüm 19.10: 200 iş ~0,1 sn, 2.000 iş ~0,45 sn); toplam
// iyileştirme büyük planda da birkaç saniyeyi geçmesin. Gerçek atölye boyutunda süre ölçülmedi (BİLMİYORUM).
export const TL_IS_BUTCESI = 8000;
export const tlKosuSiniri = (isSayisi: number): number => Math.max(2, Math.min(TL_IYILESTIRME_KOSUSU, Math.floor(TL_IS_BUTCESI / Math.max(1, isSayisi))));
export function tlIyilestir<R extends { yerlesimler: readonly Yerlesim[] }>(
  kos: (sira?: ReadonlyMap<number, number>) => R, maliyet: (r: R) => number, emirOf: (isEmriId: number) => number,
  sabitEmirler: ReadonlySet<number>, kosuSiniri: number = TL_IYILESTIRME_KOSUSU,
): R {
  let enIyi = kos();
  let enIyiMaliyet = maliyet(enIyi);
  // Başlangıç sırası kural planındaki ilk başlangıçtır; elle sıralı emirler sırada yer almaz. Emrin kaynakları kural planındandır.
  const ilk = new Map<number, number>();
  const kaynaklar = new Map<number, Set<string>>();
  for (const y of enIyi.yerlesimler) {
    const e = emirOf(y.isEmriId);
    ilk.set(e, Math.min(ilk.get(e) ?? Number.POSITIVE_INFINITY, y.baslangic));
    const k = kaynaklar.get(e) ?? new Set<string>();
    for (const x of [y.kaynak, ...(y.parcalar ?? []).map((p) => p.kaynak)]) k.add(kaynakAnahtari(x));
    kaynaklar.set(e, k);
  }
  const sira = [...ilk].filter(([e]) => !sabitEmirler.has(e)).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([e]) => e);
  const paylasir = (a: number, b: number) => [...kaynaklar.get(a) ?? []].some((k) => kaynaklar.get(b)?.has(k));
  let kalan = kosuSiniri - 1;
  for (let iyilesti = true; iyilesti && kalan > 0;) {
    iyilesti = false;
    for (let i = 0; i < sira.length && kalan > 0; i += 1) {
      const j = sira.findIndex((e, n) => n > i && paylasir(sira[i]!, e));
      if (j < 0) continue;
      const aday = [...sira];
      [aday[i], aday[j]] = [aday[j]!, aday[i]!];
      kalan -= 1;
      const r = kos(new Map(aday.map((e, n) => [e, n])));
      const m = maliyet(r);
      if (m < enIyiMaliyet - 1e-6) { enIyi = r; enIyiMaliyet = m; sira.splice(0, sira.length, ...aday); iyilesti = true; }
    }
  }
  return enIyi;
}

// Motor (P1 "öner", PL-01..PL-08): sabitler (kilitli, dondurulmuş, başlamış, bitmiş) yerinde kalır (PL-08). Emirler kural ve elle sırayla
// (PL-07, KY-03), işleri rota sırasıyla, kendi kaynağına ya da adaylardan en erken bitirene (PL-06) takvime göre (PL-04) yerleşir. Geri
// yönde emir teslimden tampon kadar önce bitecek gibi başlar: adımlar sondan geriye kendi kaynaklarının takviminde sayılır (K2). Kaynağı ve adayı olmayan, süresi bilinmeyen ya da ufukta yer bulamayan iş
// yerleşmez ve nedeni döner; öncülü (başka emirdeki parti öncülü dahil) yerleşmeyen iş de yerleşmez (PL-05).
type Oneri = { yerlesimler: Yerlesim[]; yerlesmeyen: { isEmriId: number; neden: string }[] };
// 241 a: geri yönde kaynak doluysa emir önce erkene kaydırılır, sığmazsa ileri itilir. Geç kalan emrin hedefi gecikmesi kadar erkene
// alınıp plan yeniden kurulur; en az geciken (sayı, sonra toplam dakika) tur kalır. Tur sayısı sınırlıdır: kaydırma başka emri
// geciktirebilir, sonsuz arama yok.
const GERI_KAYDIRMA_TURU = 8;
export function oner(isler: readonly MotorIsi[], sabitler: readonly Sabit[], simdi: number, ayar: MotorAyari = VARSAYILAN_MOTOR,
  takvim: (k: Kaynak) => Takvim = () => null, verim: (k: Kaynak) => number = () => 1,
): Oneri {
  if (ayar.yon !== 'geri') return onerTuru(isler, sabitler, simdi, ayar, takvim, verim, new Map());
  const hedef = new Map<number, number>();
  for (const is of isler) if (is.teslimDk !== null && !hedef.has(is.uretimEmriId)) hedef.set(is.uretimEmriId, is.teslimDk - ayar.tamponDk);
  const erkene = new Map<number, number>();
  let en: { o: Oneri; puan: [number, number] } | null = null;
  for (let tur = 0; tur < GERI_KAYDIRMA_TURU; tur += 1) {
    const o = onerTuru(isler, sabitler, simdi, ayar, takvim, verim, erkene);
    const bitis = new Map<number, number>();
    const emri = new Map(isler.map((x) => [x.id, x.uretimEmriId]));
    for (const y of o.yerlesimler) { const e = emri.get(y.isEmriId)!; bitis.set(e, Math.max(bitis.get(e) ?? Number.NEGATIVE_INFINITY, y.bitis)); }
    let sayi = 0;
    let toplam = 0;
    let kaydi = false;
    for (const [e, b] of bitis) {
      const h = hedef.get(e);
      if (h === undefined || b <= h + 1e-9) continue;
      sayi += 1;
      toplam += b - h;
      erkene.set(e, (erkene.get(e) ?? 0) + (b - h));
      kaydi = true;
    }
    if (!en || sayi < en.puan[0] || (sayi === en.puan[0] && toplam < en.puan[1] - 1e-9)) en = { o, puan: [sayi, toplam] };
    if (!kaydi) break;
  }
  return en!.o;
}

function onerTuru(isler: readonly MotorIsi[], sabitler: readonly Sabit[], simdi: number, ayar: MotorAyari,
  takvim: (k: Kaynak) => Takvim, verim: (k: Kaynak) => number, erkene: ReadonlyMap<number, number>,
): Oneri {
  const dolu = new Map<string, Aralik[]>();
  // Kaynağın dolu aralıkları başlangıca göre sıralı tutulur (takvimliBosluk sıralamaz).
  const ekle = (k: Kaynak, a: Aralik) => {
    const l = dolu.get(kaynakAnahtari(k)) ?? [];
    let lo = 0;
    for (let hi = l.length; lo < hi;) { const m = (lo + hi) >> 1; if (l[m]!.baslangic <= a.baslangic) lo = m + 1; else hi = m; }
    l.splice(lo, 0, a);
    dolu.set(kaynakAnahtari(k), l);
  };
  const yer = new Map<number, Aralik & { uretimEmriId: number; sira: number; kaynak: Kaynak }>();
  // Emir başına yerleşmiş işler ve rota sırasıyla işler (hız: öncül araması bütün işleri taramaz).
  const yerEmir = new Map<number, Set<number>>();
  const yerYaz = (id: number, v: Aralik & { uretimEmriId: number; sira: number; kaynak: Kaynak }) => {
    yer.set(id, v);
    yerEmir.set(v.uretimEmriId, (yerEmir.get(v.uretimEmriId) ?? new Set()).add(id));
  };
  const emirIsleri = new Map<number, MotorIsi[]>();
  for (const is of isler) { const l = emirIsleri.get(is.uretimEmriId); if (l) l.push(is); else emirIsleri.set(is.uretimEmriId, [is]); }
  // 282 a: merkezin gün başına kullanılan kişi-dakikası (istasyon yüküyle aynı hesap: çalışılan dakika × operatör ihtiyacı).
  const kullanim = new Map<number, number[]>();
  const pk = ayar.personel;
  const gunYuku = (k: Kaynak, a: Aralik): { id: number; gunler: [number, number][] } | null => {
    const m = pk?.merkezi(k);
    const kap = m ? pk!.kapasite.get(m.id) : undefined;
    if (!m || !kap) return null;
    const parcalar = calisilanParcalar(takvim(k), a);
    const gunler: [number, number][] = [];
    const ilk = Math.max(0, Math.floor((a.baslangic - pk!.gun0) / GUN_DK));
    for (let g = ilk; g < kap.length && pk!.gun0 + g * GUN_DK < a.bitis; g += 1) {
      const d = kesisimDk(parcalar, pk!.gun0 + g * GUN_DK, pk!.gun0 + (g + 1) * GUN_DK);
      if (d > 0) gunler.push([g, d * m.operator]);
    }
    return { id: m.id, gunler };
  };
  const yukYaz = (k: Kaynak, a: Aralik) => {
    const y = gunYuku(k, a);
    if (!y) return;
    const l = kullanim.get(y.id) ?? [];
    for (const [g, d] of y.gunler) l[g] = (l[g] ?? 0) + d;
    kullanim.set(y.id, l);
  };
  // İşin dokunduğu dolu günlerin en sonuncusu; yoksa null.
  const doluGun = (k: Kaynak, a: Aralik): number | null => {
    const y = gunYuku(k, a);
    if (!y) return null;
    const kap = pk!.kapasite.get(y.id)!;
    let son: number | null = null;
    for (const [g] of y.gunler) if ((kullanim.get(y.id)?.[g] ?? 0) >= (kap[g] ?? 0) - 1e-9) son = g;
    return son;
  };
  for (const s of sabitler) {
    ekle(s.kaynak, s);
    yukYaz(s.kaynak, s);
    const z = yer.get(s.isEmriId);
    yerYaz(s.isEmriId, z ? { ...z, baslangic: Math.min(z.baslangic, s.baslangic), bitis: Math.max(z.bitis, s.bitis) } : s);
  }
  const oncul = (uretimEmriId: number, sira: number): (Aralik & { kaynak: Kaynak }) | null | 'yok' => {
    let once: MotorIsi | undefined;
    for (const x of emirIsleri.get(uretimEmriId) ?? []) if (x.sira < sira && (!once || x.sira > once.sira)) once = x;
    let en: (Aralik & { sira: number; kaynak: Kaynak }) | null = null;
    for (const id of yerEmir.get(uretimEmriId) ?? []) { const v = yer.get(id)!; if (v.sira < sira && (!en || v.sira > en.sira)) en = v; }
    if (once && !yer.has(once.id) && (!en || once.sira > en.sira)) return 'yok';
    return en;
  };
  const gruplar = new Map<number, MotorIsi[]>();
  for (const is of isler) gruplar.set(is.uretimEmriId, [...(gruplar.get(is.uretimEmriId) ?? []), is]);
  const emirler = [...gruplar].map(([id, l]) => ({
    id, isler: [...l].sort((a, b) => a.sira - b.sira),
    oncelik: l.find((x) => x.oncelik != null)?.oncelik ?? null,
    teslimDk: l.find((x) => x.teslimDk !== null)?.teslimDk ?? null,
    acilmaDk: l.find((x) => x.acilmaDk != null)?.acilmaDk ?? null,
    emirBaslangicDk: l.find((x) => x.emirBaslangicDk != null)?.emirBaslangicDk ?? null,
    elleSira: Math.min(...l.map((x) => x.elleSira ?? Number.POSITIVE_INFINITY)),
    sureDk: l.reduce((t, x) => t + (yer.has(x.id) ? 0 : x.sureDk ?? 0), 0),
  })).map((e) => ({ ...e, elleSira: Number.isFinite(e.elleSira) ? e.elleSira : null }));
  const yerlesimler: Yerlesim[] = [];
  const yerlesmeyen: { isEmriId: number; neden: string }[] = [];
  const kalan = new Set(isler.map((x) => x.id));
  const birak = (isEmriId: number, neden: string) => { yerlesmeyen.push({ isEmriId, neden }); kalan.delete(isEmriId); };
  // Başka emirdeki öncüllerin koyduğu en erken başlangıç; öncül henüz sırası gelmemişse 'bekle', yerleşemediyse 'yok'.
  const bagliSinir = (is: MotorIsi): number | 'bekle' | 'yok' => {
    let t = simdi;
    for (const id of is.bagli ?? []) {
      const a = yer.get(id);
      if (a) t = Math.max(t, enErkenBaslangic(is, a, simdi, takvim(a.kaynak), verim(a.kaynak)));
      else if (kalan.has(id)) return 'bekle';
      else if (yerlesmeyen.some((x) => x.isEmriId === id)) return 'yok';
    }
    return t;
  };
  // İşin yeri denenir, yazılmaz: en erken başlangıcı ve hazır olduğu an döner; isle() yeri yazar. Yerleşemeyen iş nedeniyle döner.
  type Deneme = { neden: string } | { bas: number; hazir: number; isle: () => void };
  // İpucu (hız): işin kaynaktaki son denemesinin başlangıcı. Dolu aralıklar yalnız artar, öncül yeri değişmez: yeni deneme bundan önce
  // başlayamaz, arama oradan sürer.
  const ipuclari = new Map<number, Map<string, number>>();
  // Denetim #19: elle sıra kaynakta da korunur; elle sıralı iş aynı kaynakta elle sırası önce gelen işlerden önce başlamaz (boşluk
  // doldururken öne geçmez). Sıra işin kendisinindir (276 a): emrin en küçük elle sırası emrin bütün işlerine verilseydi emrin sonraki
  // işi başka emrin daha önceki elle işinin önüne geçerdi. Elle sırasız işler boşluğu doldurmaya devam eder.
  const elleYerler = new Map<string, { sira: number; bitis: number }[]>();
  const elleYaz = (sira: number | null, k: Kaynak, bitis: number) => {
    if (sira === null) return;
    const l = elleYerler.get(kaynakAnahtari(k));
    if (l) l.push({ sira, bitis }); else elleYerler.set(kaynakAnahtari(k), [{ sira, bitis }]);
  };
  const elleSiniri = (sira: number | null, k: Kaynak): number => {
    let t = Number.NEGATIVE_INFINITY;
    if (sira !== null) for (const x of elleYerler.get(kaynakAnahtari(k)) ?? []) if (x.sira < sira) t = Math.max(t, x.bitis);
    return t;
  };
  const dene = (is: MotorIsi, emirHazir: number, bagli: number | 'yok', elleSira: number | null): Deneme => {
    if (is.sureDk === null) return { neden: 'Süre bilinmiyor.' };
    const adaylar = [...(is.kaynak ? [is.kaynak] : []), ...is.adaylar.filter((a) => !is.kaynak || !ayniKaynak(a, is.kaynak))];
    if (adaylar.length === 0 && !is.parcalar?.every((p) => p.kaynak)) return { neden: 'Makine ya da kişi atanmamış, aday da yok.' };
    const o = oncul(is.uretimEmriId, is.sira);
    if (o === 'yok') return { neden: 'Önceki iş emri yerleşmedi.' };
    if (bagli === 'yok') return { neden: 'Bağlı parti yerleşmedi.' };
    const fason = is.bagimlilik === 'bagimsiz' ? 0 : is.fasonBekleDk ?? 0;
    const onculSiniri = fason > 0 ? Math.max(simdi, o?.bitis ?? emirHazir) + fason
      : enErkenBaslangic(is, o, simdi, o ? takvim(o.kaynak) : null, o ? verim(o.kaynak) : 1);
    const enErken = Math.max(emirHazir, onculSiniri, bagli);
    // Akışlı iş öncülünden (başka emirdeki parti öncülü dahil) önce bitemez: iş ilk partiyle başlar, gerekirse bu bitişe kadar uzar.
    const bitisOnculleri = fason > 0 ? [] : [...(o ? [o] : []), ...(is.bagli ?? []).flatMap((id) => yer.get(id) ?? [])];
    const bitisSiniri = (k: Kaynak): number | null => {
      let t = Number.NEGATIVE_INFINITY;
      for (const a of bitisOnculleri) {
        const b = enErkenBitis(is, a, takvim(k), verim(k));
        if (b === null) return null;
        t = Math.max(t, b);
      }
      return t;
    };
    const sec = (l: readonly Kaynak[], sure: number, sonSinir = true) => {
      let secim: { k: Kaynak; a: Aralik } | null = null;
      const ipucu = sonSinir ? ipuclari.get(is.id) ?? new Map<string, number>() : null;
      if (ipucu) ipuclari.set(is.id, ipucu);
      for (const k of l) {
        const sinir = sonSinir ? bitisSiniri(k) : Number.NEGATIVE_INFINITY;
        const bas = sinir === null ? null : Math.max(enErken, ipucu?.get(kaynakAnahtari(k)) ?? enErken, elleSiniri(elleSira, k));
        const bul = (b: number) => uzayanBosluk(dolu.get(kaynakAnahtari(k)) ?? [], takvim(k), b, verimliSure(sure, is.ayarDk, verim(k)), sinir!, true);
        let a = bas === null || sinir === null ? null : bul(bas);
        for (let g = a ? doluGun(k, a) : null; a && g !== null; g = a ? doluGun(k, a) : null) a = bul(pk!.gun0 + (g + 1) * GUN_DK);
        if (a && ipucu) ipucu.set(kaynakAnahtari(k), a.baslangic);
        if (a && (!secim || a.bitis < secim.a.bitis)) secim = { k, a };
      }
      return secim;
    };
    if (is.parcalar?.length) {
      // Parçalar sırayla yer alır; sonraki parça öncekinin doldurduğu kaynağı görür. Denemede eklenenler geri alınır; isle() aynı yerleri yazar.
      const parcalar: YerlesimParcasi[] = [];
      const geriAl = () => { for (const x of parcalar) { const l = dolu.get(kaynakAnahtari(x.kaynak))!; l.splice(l.findIndex((a) => a.baslangic === x.baslangic && a.bitis === x.bitis), 1); } };
      for (const p of is.parcalar) {
        // Bölünmüş işte bitiş sınırı konmaz: parça öncülün son parçalarını işlemeyebilir (hangi parçanın işleyeceği bilinmez).
        const secim = p.sureDk === null ? null : sec(p.kaynak ? [p.kaynak] : adaylar, p.sureDk, false);
        if (!secim) { geriAl(); return { neden: p.sureDk === null ? 'Süre bilinmiyor.' : 'Plan ufkunda çalışma zamanı bulunamadı.' }; }
        ekle(secim.k, secim.a);
        parcalar.push({ no: p.no, kaynak: secim.k, ...secim.a });
      }
      geriAl();
      const zarf = { baslangic: Math.min(...parcalar.map((x) => x.baslangic)), bitis: Math.max(...parcalar.map((x) => x.bitis)) };
      return {
        bas: zarf.baslangic, hazir: enErken,
        isle: () => {
          for (const x of parcalar) { ekle(x.kaynak, { baslangic: x.baslangic, bitis: x.bitis }); yukYaz(x.kaynak, x); elleYaz(elleSira, x.kaynak, x.bitis); }
          yerYaz(is.id, { ...zarf, uretimEmriId: is.uretimEmriId, sira: is.sira, kaynak: parcalar[0]!.kaynak });
          kalan.delete(is.id);
          yerlesimler.push({ isEmriId: is.id, kaynak: parcalar[0]!.kaynak, ...zarf, parcalar });
        },
      };
    }
    const secim = sec(adaylar, is.sureDk);
    if (!secim) return { neden: 'Plan ufkunda çalışma zamanı bulunamadı.' };
    return {
      bas: secim.a.baslangic, hazir: enErken,
      isle: () => {
        ekle(secim.k, secim.a);
        yukYaz(secim.k, secim.a);
        elleYaz(elleSira, secim.k, secim.a.bitis);
        yerYaz(is.id, { ...secim.a, uretimEmriId: is.uretimEmriId, sira: is.sira, kaynak: secim.k });
        kalan.delete(is.id);
        yerlesimler.push({ isEmriId: is.id, kaynak: secim.k, ...secim.a });
      },
    };
  };
  // Geri yön: son adımdan başa, her adım kendi kaynağının (yoksa ilk adayın) takviminde biter-başlar; fason beklemesi takvim günüdür.
  // Takvimin başına sığmazsa emir hemen hazırdır.
  const geriBaslangic = (l: readonly MotorIsi[], son: number): number => {
    let t = son;
    for (const is of [...l].reverse()) {
      if (yer.has(is.id) || is.sureDk === null) continue;
      const k = is.kaynak ?? is.adaylar[0];
      const bas = k ? calismaBasiGeri(takvim(k), t, verimliSure(is.sureDk, is.ayarDk, verim(k))) : t - is.sureDk;
      if (bas === null) return Number.NEGATIVE_INFINITY;
      t = bas - (is.bagimlilik === 'bagimsiz' ? 0 : is.fasonBekleDk ?? 0);
    }
    return t;
  };
  // Karar 72 b (ekran yöntemi): zaman ilerler; her turda her emrin sıradaki işi denenir, en erken başlayabilenler yarışır ve kural
  // (adım düzeyinde, S1 a) birini seçer. Kaynak boş kalmaz: hazır iş, sonra gelecek acil iş için bekletilmez. Elle sıralı emirler
  // (KY-03) önce, elle sırayla yer alır. Eşitlikte emir sırası (emirSirasi), sonra rota sırası.
  const sirali = emirSirasi(emirler, ayar.kural, simdi, ayar.sira).map((e, rank) => {
    const geri = ayar.yon === 'geri' && e.teslimDk !== null ? geriBaslangic(e.isler, e.teslimDk - ayar.tamponDk - (erkene.get(e.id) ?? 0)) : Number.NEGATIVE_INFINITY;
    return { ...e, rank, hazir: Math.max(simdi, e.emirBaslangicDk ?? simdi, geri) };
  });
  const bekleyen = (x: MotorIsi) => kalan.has(x.id) && !yer.has(x.id);
  const sonraki = (e: (typeof sirali)[number]) => e.isler.find(bekleyen);
  // Kalan iş: emrin yerleşmemiş işlerinin süresi (CR paydası).
  const kalanIs = (e: (typeof sirali)[number]) => e.isler.reduce((t, x) => t + (bekleyen(x) ? x.sureDk ?? 0 : 0), 0);
  const anahtar = (y: { e: (typeof sirali)[number]; is: MotorIsi; hazir: number }, t: number): number[] => {
    const son = Number.POSITIVE_INFINITY;
    const k = y.is.kaynak ?? y.is.adaylar[0] ?? null;
    switch (ayar.kural) {
      // 218 a: teslime kalan süre kaynağın vardiya takviminde sayılır; geçmiş teslim eksi kalır, en önce gelir.
      case 'cr': return [y.e.teslimDk === null ? son
        : (y.e.teslimDk >= t ? kesisimDk(k ? takvim(k) : null, t, y.e.teslimDk) : y.e.teslimDk - t) / Math.max(kalanIs(y.e), 1)];
      case 'spt': return [y.is.sureDk ?? son];
      case 'fifo': return [y.hazir];
      default: return ayar.sira ? [ayar.sira.get(y.e.id) ?? son] : [y.e.teslimDk ?? son, y.e.oncelik ?? 9];
    }
  };
  const kiyas = (x: number[], y: number[]) => { for (let i = 0; i < x.length; i += 1) if (Math.abs(x[i]! - y[i]!) > 1e-9) return x[i]! - y[i]!; return 0; };
  // Deneme önbelleği (hız): bir yerleşim kaynağı yalnız doldurur, öteki denemelerin başlangıcını ancak geciktirir. Kullanılan kaynağa
  // aday olan deneme bayatlar ama başlangıcı alt sınır kalır: yalnız en erken taze denemeden önce başlayabilecek bayatlar yeniden denenir.
  // Başka emirdeki öncülü bekleyen (bağlı) iş önbelleğe girmez, her tur yeniden bakılır.
  type Aday = { e: (typeof sirali)[number]; is: MotorIsi; kaynaklar: Set<string>; merkezler: Set<number>; taze: boolean } & Exclude<Deneme, { neden: string }>;
  const isKaynaklari = (is: MotorIsi) => [is.kaynak, ...is.adaylar, ...(is.parcalar ?? []).map((p) => p.kaynak)].flatMap((k) => (k ? [k] : []));
  const kaynaklari = (is: MotorIsi) => new Set(isKaynaklari(is).map(kaynakAnahtari));
  // 282 a: aynı iş merkezindeki yerleşim kişi-dakikasını tüketir, o merkezin kaynaklarındaki denemeler de bayatlar.
  const merkezleri = (l: readonly Kaynak[]) => new Set(pk ? l.flatMap((k) => { const m = pk.merkezi(k); return m ? [m.id] : []; }) : []);
  const onbellek = new Map<number, Aday>();
  // Denemeyi yeniler; yerleşemeyen iş bırakılır (false).
  const yenile = (e: (typeof sirali)[number], is: MotorIsi): Aday | null | false => {
    const b = bagliSinir(is);
    if (b === 'bekle') return null;
    const d = dene(is, e.hazir, b, is.elleSira ?? null);
    if ('neden' in d) { birak(is.id, d.neden); onbellek.delete(e.rank); return false; }
    const y: Aday = { e, is, kaynaklar: kaynaklari(is), merkezler: merkezleri(isKaynaklari(is)), taze: true, ...d };
    if (is.bagli?.length) onbellek.delete(e.rank); else onbellek.set(e.rank, y);
    return y;
  };
  for (;;) {
    const yaris: Aday[] = [];
    const bayat: Aday[] = [];
    let degisti = false;
    for (const e of sirali) {
      const is = sonraki(e);
      if (!is) continue;
      const o = onbellek.get(e.rank);
      if (o && o.is.id === is.id) { (o.taze ? yaris : bayat).push(o); continue; }
      const y = yenile(e, is);
      if (y === false) degisti = true;
      else if (y) yaris.push(y);
    }
    // Elle sıralı emirler zamandan bağımsız önce gelir: bayatları hemen yenilenir.
    for (const o of bayat.filter((x) => x.e.elleSira !== null)) { const y = yenile(o.e, o.is); if (y) yaris.push(y); else if (y === false) degisti = true; }
    let kalanBayat = bayat.filter((x) => x.e.elleSira === null).sort((x, y) => x.bas - y.bas);
    let t = Math.min(...yaris.map((y) => y.bas));
    while (kalanBayat.length && kalanBayat[0]!.bas <= t + 1e-9) {
      const o = kalanBayat.shift()!;
      const y = yenile(o.e, o.is);
      if (y === false) { degisti = true; continue; }
      if (y) { yaris.push(y); t = Math.min(t, y.bas); }
    }
    if (yaris.length === 0) { if (degisti || kalanBayat.length) { for (const o of kalanBayat) o.taze = true; continue; } break; }
    const isSirasi = (y: Aday) => y.is.elleSira ?? Number.MAX_SAFE_INTEGER;
    const elle = yaris.filter((y) => y.e.elleSira !== null).sort((x, y) => isSirasi(x) - isSirasi(y) || x.e.elleSira! - y.e.elleSira! || x.e.rank - y.e.rank)[0];
    const secilen = elle ?? yaris.filter((y) => y.bas <= t + 1e-9)
      .sort((x, y) => kiyas(anahtar(x, t), anahtar(y, t)) || x.e.rank - y.e.rank || x.is.sira - y.is.sira)[0]!;
    secilen.isle();
    const son = yerlesimler[yerlesimler.length - 1]!;
    const kullanilan = new Set([son.kaynak, ...(son.parcalar ?? []).map((p) => p.kaynak)].map(kaynakAnahtari));
    onbellek.delete(secilen.e.rank);
    const merkez = merkezleri([son.kaynak, ...(son.parcalar ?? []).map((p) => p.kaynak)]);
    for (const o of onbellek.values()) if (o.taze && ([...o.kaynaklar].some((k) => kullanilan.has(k)) || [...o.merkezler].some((m) => merkez.has(m)))) o.taze = false;
  }
  // Döngüde birbirini bekleyen işler kalırsa yerleşmez.
  for (const e of sirali) for (const is of e.isler) if (bekleyen(is)) birak(is.id, 'Bağlı parti yerleşmedi.');
  // Sonuç emir sırasıyla (yerleşme anına göre değil) döner: çağıranlar ve testler emir, rota sırası bekler.
  const sira = new Map(sirali.flatMap((e) => e.isler.map((x) => [x.id, [e.rank, x.sira]] as const)));
  yerlesimler.sort((a, b) => sira.get(a.isEmriId)![0] - sira.get(b.isEmriId)![0] || sira.get(a.isEmriId)![1] - sira.get(b.isEmriId)![1]);
  return { yerlesimler, yerlesmeyen };
}

// Uyarılar (P5; kayıt geçer): teslim gecikmesi, sıraya aykırı başlangıç, akışlı işin öncülünden önce bitmesi, rotadaki kaynak ve adaylar
// dışında kaynak. 308 b: elle taşıma ve yerleştirmede ve canlıya almada sıraya aykırı başlangıç reddedilir (servis); burada kalan uyarı
// motorun ya da eski kaydın bıraktığı aykırılık içindir. Rota dışı kaynak uyarıyla geçer.
export function uyarilar(y: Aralik & { kaynak: Kaynak }, b: {
  teslimDk: number | null; enErken: number | null; enErkenBitis?: number | null; rotaKaynaklari: readonly Kaynak[];
}): string[] {
  const u: string[] = [];
  if (b.teslimDk !== null && y.bitis > b.teslimDk) u.push('Teslim tarihinden sonra bitiyor.');
  if (b.enErken !== null && y.baslangic < b.enErken) u.push('Önceki iş emri bitmeden (sıraya aykırı) başlıyor.');
  // Yerleşim tarihten (milisaniye) okunur; dakikanın yüzde biri tolerans.
  else if (b.enErkenBitis != null && y.bitis < b.enErkenBitis - 0.01) u.push('Önceki iş emri bitmeden bitiyor (akışlı devir).');
  if (b.rotaKaynaklari.length > 0 && !b.rotaKaynaklari.some((k) => ayniKaynak(k, y.kaynak))) u.push('Kaynak rotadaki makine, kişi ya da adaylar arasında değil.');
  return u;
}

// Sıralama ve elle yerleştirme (PL-04): verilen sırayla, başlangıçtan sonraki ilk çalışma anından arka arkaya dizilir; süre çalışma
// dakikasıdır, vardiya arası beklenir. Biri ufukta sığmazsa null (sürüm denetimi serviste).
export function arkaArkaya(sureler: readonly number[], baslangic: number, takvim: Takvim = null): Aralik[] | null {
  let t = baslangic;
  const l: Aralik[] = [];
  for (const s of sureler) {
    const bas = calismaBasi(takvim, t);
    const bitis = bas === null ? null : calismaBitisi(takvim, bas, s);
    if (bas === null || bitis === null) return null;
    l.push({ baslangic: bas, bitis });
    t = bitis;
  }
  return l;
}

// Göstergeler (ilk sistem, P1 ile birlikte): emir düzeyinde zamanında oran ve geciken (yerleşmemiş işi olan emir engellidir ve
// zamanında sayılmaz, PL-05), ortalama atölyede kalma (ilk işin başlangıcından son işin bitişine, gün), darboğaz (PL-11: en dolu
// istasyon), en dolu kaynak. Personelin sınırladığı gün istasyon plan ayarı (operatör ihtiyacı) gelince hesaplanır; o zamana dek null.
// Doluluk çalışma dakikasıdır (PL-04): işin vardiya dışında kalan süresi (gece, hafta sonu) yük, kaynağın vardiya dışı kapasite sayılmaz.
// Çalışma kapasitesi olmayan kaynak ve istasyon sıralamaya girmez.
export interface GostergeIsi extends Aralik { isEmriId: number; uretimEmriId: number; anahtar: string; ad: string; istasyon: { id: number; ad: string } | null }
export function gostergeler(y: readonly GostergeIsi[], emirler: readonly { id: number; teslimDk: number | null; isSayisi: number }[], ufukDk: number,
  kaynakSayisi: (istasyonId: number) => number = () => 1,
  kapasite: { takvim?: (anahtar: string) => Takvim; istasyon?: (istasyonId: number) => number } = {},
  maliyet: (emirler: readonly { id: number; teslimDk: number | null; bit: number | null }[]) => number | null = () => null,
) {
  const takvimi = kapasite.takvim ?? (() => null);
  const calisma = (anahtar: string, a: number, z: number) => Math.max(0, kesisimDk(takvimi(anahtar), Math.max(a, 0), Math.min(z, ufukDk)));
  const dolu = new Map<string, { ad: string; dk: number }>();
  const istasyon = new Map<number, { ad: string; dk: number }>();
  for (const x of y) {
    const dk = calisma(x.anahtar, x.baslangic, x.bitis);
    const d = dolu.get(x.anahtar) ?? { ad: x.ad, dk: 0 };
    d.dk += dk;
    dolu.set(x.anahtar, d);
    if (x.istasyon) { const i = istasyon.get(x.istasyon.id) ?? { ad: x.istasyon.ad, dk: 0 }; i.dk += dk; istasyon.set(x.istasyon.id, i); }
  }
  const oranli = <T extends { dk: number; kap: number }>(l: T[]) => l.filter((x) => x.kap > 0).map((x) => ({ ...x, oran: x.dk / x.kap })).sort((a, b) => b.oran - a.oran);
  const en = oranli([...dolu].map(([anahtar, v]) => ({ ...v, kap: calisma(anahtar, 0, ufukDk) })))[0];
  const dar = oranli([...istasyon].map(([id, v]) => ({ id, ...v, kap: kapasite.istasyon?.(id) ?? ufukDk * Math.max(1, kaynakSayisi(id)) })))[0];
  const emirSonu = emirler.map((e) => {
    const l = y.filter((x) => x.uretimEmriId === e.id);
    const tam = new Set(l.map((x) => x.isEmriId)).size === e.isSayisi && e.isSayisi > 0;
    return { ...e, tam, bas: l.length ? Math.min(...l.map((x) => x.baslangic)) : null, bit: tam ? Math.max(...l.map((x) => x.bitis)) : null };
  });
  const teslimli = emirSonu.filter((e) => e.teslimDk !== null);
  const zamaninda = teslimli.filter((e) => e.bit !== null && e.bit <= (e.teslimDk ?? 0));
  const kalma = emirSonu.filter((e) => e.bas !== null && e.bit !== null).map((e) => (e.bit! - e.bas!) / GUN_DK);
  return {
    isEmriSayisi: emirler.reduce((t, e) => t + e.isSayisi, 0), yerlesen: new Set(y.map((x) => x.isEmriId)).size, emirSayisi: emirler.length,
    geciken: teslimli.length - zamaninda.length,
    zamanindaYuzde: teslimli.length ? Math.round((zamaninda.length / teslimli.length) * 100) : null,
    ortAtolyeGun: kalma.length ? Math.round((kalma.reduce((t, x) => t + x, 0) / kalma.length) * 10) / 10 : null,
    darbogaz: dar && dar.oran > 0 ? { istasyonId: dar.id, ad: dar.ad, dolulukYuzde: Math.round(dar.oran * 100) } : null,
    enDoluKaynak: en ? { ad: en.ad, dolulukYuzde: Math.round(en.oran * 100) } : null,
    personelGun: null as number | null,
    maliyetTl: maliyet(emirSonu),
  };
}

// PL-09: iş merkezinin günlük kişi-dakika ihtiyacı (istasyon yükü x operatör ihtiyacı; 1 kişi 3 makineye bakıyorsa 0,33) ve kapasitesi
// (kişilerin o günkü çalışma dakikası x o merkezdeki payı). İhtiyacın kapasiteyi aştığı gün personelin sınırladığı gündür; aynı gün birden
// çok iş merkezinde aşılsa da bir gün sayılır.
export interface PersonelKatkisi { calismaDk: readonly number[]; pay: number }
export interface PersonelMerkezi { isMerkeziId: number; gunSayisi: number; kisiler: readonly PersonelKatkisi[]; istasyonlar: readonly { yuk: readonly number[]; operator: number }[] }
export function personelYuku(merkezler: readonly PersonelMerkezi[]) {
  const gunler = (n: number) => Array.from({ length: n }, (_, g) => g);
  return merkezler.map((m) => ({
    isMerkeziId: m.isMerkeziId,
    ihtiyac: gunler(m.gunSayisi).map((g) => Math.round(m.istasyonlar.reduce((t, i) => t + (i.yuk[g] ?? 0) * i.operator, 0))),
    kapasite: gunler(m.gunSayisi).map((g) => Math.round(m.kisiler.reduce((t, k) => t + (k.calismaDk[g] ?? 0) * k.pay, 0))),
  }));
}
// İstasyon yükünün yüzdesi (önizleme ve senaryo etkisi tek yuvarlamayla): kapasitesi olmayan yerde doluluk bilinmez (null), sıfır uydurulmaz.
export const yukYuzdesi = (dolu: readonly number[], kapasite: readonly number[]): number | null => {
  const kap = kapasite.reduce((t, v) => t + v, 0);
  return kap > 0 ? Math.round((dolu.reduce((t, v) => t + v, 0) / kap) * 100) : null;
};

// 307 a: kısıt açık ama kişi verisi olan iş merkezi yoksa motor hiçbir günü sınırlamaz; bu sessiz kalmasın.
export const PERSONEL_TANIMSIZ = 'Personel kısıtı açık ama tanımlı personel yok; personel sınırı uygulanmadı.';
export function motorUyarilari(d: { personelKisiti: boolean; personelMerkeziSayisi: number }): string[] {
  return d.personelKisiti && d.personelMerkeziSayisi === 0 ? [PERSONEL_TANIMSIZ] : [];
}

export const sinirliGunSayisi = (yuk: readonly { ihtiyac: readonly number[]; kapasite: readonly number[] }[]): number =>
  new Set(yuk.flatMap((m) => m.ihtiyac.flatMap((x, g) => (x > (m.kapasite[g] ?? 0) ? [g] : [])))).size;

// Seçenekleri karşılaştır (motor paneli): her sıralama kuralının sonucu yan yana; son bitiş, geciken, darboğaz, bugünkü plana göre
// başlangıcı değişen emir sayısı.
export function karsilastir(kurallar: readonly Kural[], calistir: (k: Kural) => { yerlesimler: readonly Yerlesim[] }, simdiki: ReadonlyMap<number, number>,
  emirOf: (isEmriId: number) => number, ozet: (y: readonly Yerlesim[]) => { geciken: number; darbogaz: string | null; maliyetTl?: number | null },
) {
  return kurallar.map((k) => {
    const s = calistir(k);
    const etkilenen = new Set(s.yerlesimler.filter((y) => simdiki.has(y.isEmriId) && Math.abs((simdiki.get(y.isEmriId) ?? 0) - y.baslangic) > 1).map((y) => emirOf(y.isEmriId)));
    const o = ozet(s.yerlesimler);
    return { kural: k, sonBitisDk: s.yerlesimler.length ? Math.max(...s.yerlesimler.map((y) => y.bitis)) : null, geciken: o.geciken, darbogaz: o.darbogaz, maliyetTl: o.maliyetTl ?? null, etkilenenEmir: etkilenen.size };
  });
}

// Dondurma (prototip "dondurulmuş bölge"): şimdiden N gün içinde başlayan, değişebilir yerleşimler.
export const dondurulacaklar = <Y extends Aralik & { isEmriId: number }>(y: readonly Y[], gun: number, simdi: number, degisebilir: (id: number) => boolean): Y[] =>
  y.filter((x) => degisebilir(x.isEmriId) && x.baslangic < simdi + gun * GUN_DK);

// PL-ONAY (hedef 23.10.2026, 146): canlı plana tek kapı. Sahip (taslağı açan, stüdyo işlemiyle) açık taslağını onaya gönderir ve onaydakini
// geri çeker; canlıya alma işlemini taşıyan onaydaki taslağı canlıya alır ya da geri gönderir. Dört göz ayarı açıkken son gönderen onaylayan
// olamaz. Geçiş yapılamıyorsa nedeni döner; ekranın bayrakları (`yapabilir`) aynı kuraldan çıkar.
export interface OnayBaglami {
  durum: SenaryoDurumu; sahipMi: boolean; gonderenMi: boolean; studyo: boolean; canliyaAlir: boolean; dortGozAcik: boolean;
}
export function onayGecisiReddi(komut: PlanOnayKomutu, b: OnayBaglami): string | null {
  const k = PLAN_ONAY_KOMUTLARI[komut];
  if (k.kim === 'sahip' ? !b.studyo : !b.canliyaAlir) return k.kim === 'sahip' ? 'Taslağı onaya göndermek plan stüdyosu yetkisi ister.' : 'Onaylamak planı canlıya alma yetkisi ister.';
  if (b.durum !== k.durumdan) {
    if (k.durumdan === 'onayda') return b.durum === 'acik' ? 'Taslak onayda değil; önce onaya gönderilmeli.' : 'Senaryo kapanmış.';
    return b.durum === 'onayda' ? 'Taslak onayda; değiştirmek için önce onaydan çek.' : 'Senaryo kapanmış; yalnız açık taslak onaya gider.';
  }
  if (k.kim === 'sahip' && !b.sahipMi) return 'Bu senaryo başka bir planlamacının taslağı.';
  if (k.kim === 'onaylayan' && b.dortGozAcik && b.gonderenMi) return 'Dört göz kuralı açık: onaya gönderdiğin taslağı başka biri onaylar.';
  return null;
}
export const onayGecisleri = (b: OnayBaglami): SenaryoYapabilir => ({
  onayaGonder: onayGecisiReddi('onaya-gonder', b) === null, onaydanCek: onayGecisiReddi('onaydan-cek', b) === null,
  geriGonder: onayGecisiReddi('geri-gonder', b) === null, canliyaAl: onayGecisiReddi('canliya-al', b) === null,
});
