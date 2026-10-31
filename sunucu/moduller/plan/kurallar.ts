// Plan kuralları (saf). Zaman ekseni dakikadır (0 = şimdi); takvim verilmezse sürekli çalışma (UYUM-BORCU: vardiya gelince takvim).

import { PLAN_ONAY_KOMUTLARI } from '#paylasilan/sozlesme/plan.ts';
import type { PlanOnayKomutu, SenaryoDurumu, SenaryoYapabilir } from '#paylasilan/sozlesme/plan.ts';

export interface Kaynak { tur: 'makine' | 'kisi'; id: number }
export const kaynakAnahtari = (k: Kaynak): string => `${k.tur}:${k.id}`;
export const ayniKaynak = (a: Kaynak, b: Kaynak): boolean => a.tur === b.tur && a.id === b.id;

export interface Aralik { baslangic: number; bitis: number }
export const cakisirMi = (a: Aralik, b: Aralik): boolean => a.baslangic < b.bitis && b.baslangic < a.bitis;

// 879 a: aynı kaynakta kilitli iki iş üst üste binemez; motor kilidi yerinden oynatmadığı için ikisini aynı anda çalıştırırdı.
// Bölünmüş işin her parçası ayrı aralıktır. Dönen: çakıştığı ilk kilitli işin kimliği, yoksa null.
export interface KaynakAraligi extends Aralik { kaynak: Kaynak }
export function kilitCakisani(yeni: readonly KaynakAraligi[], kilitliler: readonly { isEmriId: number; araliklar: readonly KaynakAraligi[] }[]): number | null {
  for (const k of kilitliler) if (k.araliklar.some((x) => yeni.some((y) => ayniKaynak(x.kaynak, y.kaynak) && cakisirMi(x, y)))) return k.isEmriId;
  return null;
}

// 248 a: başlamasına 4 saatten az kalan planlı işin önüne iş konamaz. Korunan iş canlıdaki yerindedir (başlangıcı geçmiş ama başlamamış iş
// de korunur); yazımdan sonra planda ve aynı kaynakta kalır, önüne canlıda önünde olmayan iş girmez. Saat ölçüt değildir: eskimiş canlıda
// başlangıcı geçmiş işler yeniden dizilince zorunlu olarak kayar; korunan iş boş bir yere ileri ya da geri alınabilir.
// 990 a: arızalı ya da pasif kaynaktaki işin koruması kendiliğinden kalkar (çalışmayan makinede bekleyen iş başka yere alınabilmeli).
// Dönen: ihlal eden korunan işin kimliği ve nedeni (kimliğe göre sıralı).
export const DORT_SAAT_DK = 240;
export interface PlanYeri { isEmriId: number; kaynak: Kaynak; baslangic: number }
export type DortSaatNedeni = 'kaldirildi' | 'kaynak' | 'onune-is';
const hepsiCalisir = (): boolean => true;
export const korunanIsler = (
  canli: readonly PlanYeri[], planliMi: (isEmriId: number) => boolean, calisirMi: (k: Kaynak) => boolean = hepsiCalisir, ufukDk: number = DORT_SAAT_DK,
): PlanYeri[] => canli.filter((p) => p.baslangic < ufukDk && planliMi(p.isEmriId) && calisirMi(p.kaynak));
export function dortSaatIhlalleri(
  canli: readonly PlanYeri[], sonra: readonly PlanYeri[], planliMi: (isEmriId: number) => boolean, calisirMi: (k: Kaynak) => boolean = hepsiCalisir,
  ufukDk: number = DORT_SAAT_DK,
): { isEmriId: number; neden: DortSaatNedeni }[] {
  const yeni = new Map(sonra.map((y) => [y.isEmriId, y]));
  // Başlamış iş önde sayılmaz: makinede zaten çalışıyordur, önüne konan iş değildir.
  const onundekiler = (l: readonly PlanYeri[], p: PlanYeri) =>
    l.filter((y) => y.isEmriId !== p.isEmriId && planliMi(y.isEmriId) && ayniKaynak(y.kaynak, p.kaynak) && y.baslangic < p.baslangic).map((y) => y.isEmriId);
  const ihlaller: { isEmriId: number; neden: DortSaatNedeni }[] = [];
  for (const p of korunanIsler(canli, planliMi, calisirMi, ufukDk)) {
    const q = yeni.get(p.isEmriId);
    const neden: DortSaatNedeni | null = !q ? 'kaldirildi' : !ayniKaynak(q.kaynak, p.kaynak) ? 'kaynak'
      : onundekiler(sonra, q).some((x) => !onundekiler(canli, p).includes(x)) ? 'onune-is' : null;
    if (neden) ihlaller.push({ isEmriId: p.isEmriId, neden });
  }
  return ihlaller.sort((x, y) => x.isEmriId - y.isEmriId);
}

// 990 a: canlıya alan kişi zorunlu durumda kuralı gerekçeyle aşar; boşluktan ibaret gerekçe gerekçe sayılmaz. Gerekçe ve kişi onay kaydına yazılır.
export const DORT_SAAT_GEREKCE_EN_COK = 500;
export const dortSaatGerekcesi = (g: string | null | undefined): string | null => {
  const t = g?.trim() ?? '';
  return t.length > 0 ? t.slice(0, DORT_SAAT_GEREKCE_EN_COK) : null;
};

// İşin süresi: ayar + adet x birim süre (dakika). Süresi bilinmeyen iş motorca yerleşmez.
export function isSuresi(ayarDk: number | null, birimDk: number | null, adet: number): number | null {
  if (birimDk === null) return null;
  return (ayarDk ?? 0) + adet * birimDk;
}

// Kaynaktaki süre: verim yalnız işlemeye uygulanır, ayar verimden bağımsızdır (prototip: ayar + işleme / verim).
export const verimliSure = (sureDk: number, ayarDk: number | null | undefined, verim: number): number => (ayarDk ?? 0) + (sureDk - (ayarDk ?? 0)) / verim;

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
  // 1248 a: emir içi öncüller (çok dallı rota, iş emrinin öncül listesi). Verilirse "emirdeki bir önceki sıra" yerine bunlar beklenir ve
  // bagimlilik kullanılmaz; boş liste işin hiçbir emir içi adımı beklemediğidir (dalın ilk adımı). Öncül her zaman küçük sıralıdır.
  onculler?: readonly MotorOnculu[];
}
// Akışlı öncülün devri o öncülün süresiyledir (devirDk, devirAyarDk: MotorIsi'deki gibi); son devir partisi işin kendi devirSonDk'sıdır.
export interface MotorOnculu { id: number; tur: 'bekleyen' | 'akisli'; devirDk?: number | null; devirAyarDk?: number | null }
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

// 815 (699/3 a): plana yalnız emrin önceliği girer. Emrin önceliği (1-4; 195 a: 1 ve 2 Yüksek, 3 Normal, 4 Düşük) motorun sınıfına (1-3)
// ve gecikme maliyetinin çarpanına çevrilir; siparişin elle çarpanı, tutarı ve müşteri sınıfı sıraya girmez. Çarpanlar müdürün bedel
// ayarındadır (denetim #21); bunlar ayar satırının varsayılanlarıdır.
export interface BedelSatiri { tutar: string | null; paraBirimi: string; cezaOraniGun: string | null }
export interface Carpanlar { yuksekCarpani: number; normalCarpani: number; dusukCarpani: number }
export const VARSAYILAN_CARPANLAR: Carpanlar = { yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5 };
export function oncelikCarpani(oncelik: number | null, c: Carpanlar = VARSAYILAN_CARPANLAR): number {
  if (oncelik === 1 || oncelik === 2) return c.yuksekCarpani;
  return oncelik === 4 ? c.dusukCarpani : c.normalCarpani;
}
// Önceliği olmayan emir sınıfsızdır (null): motor onu önceliği en düşük sayar.
export function oncelikSinifi(oncelik: number | null): 1 | 2 | 3 | null {
  if (oncelik === 1 || oncelik === 2) return 1;
  if (oncelik === 3) return 2;
  return oncelik === 4 ? 3 : null;
}

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

// Kâr riskinin tabanı (194 a, 227 a, 1379 a): emrin katkı payı = emrin TL tutarı (225) − emrin bütün iş emirlerinin (bitmiş ve fason dahil)
// tahmini maliyeti − emrin plan malzeme maliyeti (Proje maliyet). Tutar emrin tamamınındır; maliyet de tamamı olmalı, yoksa yarı bitmiş emir
// kârlı görünür. Bir kalem bilinmiyorsa, emir TL değilse ya da fiyatsızsa katkı payı bilinmez (null); kâr riski işlemez.
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

// 507 1 a: eski Reçete ve Rota motorunun özetindeki iki gösterge (evaluate suH ve wT), salt okuma. Ayar saati: yerleşen işlerin (bölünmüş
// işte her parçanın) ayar süresi toplamı; başlamış ve sayımı olan işin ayarı yapılmıştır, sayılmaz. Öncelik ağırlıklı gecikme: emrin bütün
// işleri yerleşmişse son bitişin teslim günü sonunu aştığı saat x öncelik ağırlığı x sipariş satırındaki adet payı. Ağırlık eski motorun
// PW'si (1: 4, 2: 2, 3: 1); tanımsız öncelik (4 dahil) 1. Yerleşmemiş işi olan ya da teslimsiz emir gecikmeye girmez. Saatler bir ondalık.
export const ONCELIK_AGIRLIGI: Readonly<Record<number, number>> = { 1: 4, 2: 2, 3: 1 };
export function ayarVeGecikme(
  y: readonly (Aralik & { isEmriId: number; uretimEmriId: number; ayarDk: number | null })[],
  emirler: readonly { id: number; teslimDk: number | null; isSayisi: number; oncelik: number | null; pay: number }[],
): { ayarSaat: number; agirlikliGecikmeSaat: number } {
  const ayarDk = y.reduce((t, x) => t + (x.ayarDk ?? 0), 0);
  let gecikme = 0;
  for (const e of emirler) {
    const l = y.filter((x) => x.uretimEmriId === e.id);
    if (e.teslimDk === null || e.isSayisi === 0 || new Set(l.map((x) => x.isEmriId)).size !== e.isSayisi) continue;
    const bit = Math.max(...l.map((x) => x.bitis));
    gecikme += (Math.max(0, bit - e.teslimDk) / 60) * (ONCELIK_AGIRLIGI[e.oncelik ?? 0] ?? 1) * e.pay;
  }
  const bir = (x: number) => Math.round(x * 10) / 10;
  return { ayarSaat: bir(ayarDk / 60), agirlikliGecikmeSaat: bir(gecikme) };
}

// 507 2 a: ek vardiyaların haftalık bütçesi (eski motorun mesaiHafta'sı, kontroldeki "haftalık ek mesai bütçesi aşılıyor"). Hafta
// pazartesi başlar (gün takvim günüdür, saat dilimi yok); sınırı aşan hafta asanHaftalar'dadır. Sınır 0 sınır yok demektir (eski motorun fits'i: butH <= 0 her
// vardiyayı sığdırır); boş sınırı çağıran 8 saate çevirir.
export const EK_MESAI_HAFTA_SAAT = 8;
// 512 1 a: kabul edilmiş ek vardiyanın penceresi makinenin çalışma aralıklarına katılır; çakışan ve bitişik aralıklar birleşir, sıralı döner.
export function araliklaraEkle(l: readonly Aralik[], ek: readonly Aralik[]): Aralik[] {
  const y: Aralik[] = [];
  for (const a of [...l, ...ek].sort((x, z) => x.baslangic - z.baslangic)) {
    const son = y[y.length - 1];
    if (son && a.baslangic <= son.bitis) son.bitis = Math.max(son.bitis, a.bitis);
    else y.push({ baslangic: a.baslangic, bitis: a.bitis });
  }
  return y;
}
export function vardiyaSaati(baslangic: string, bitis: string): number {
  const dk = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const fark = dk(bitis) - dk(baslangic);
  return (fark <= 0 ? fark + 1440 : fark) / 60;
}
export function haftaBasi(gun: string): string {
  const t = Date.UTC(Number(gun.slice(0, 4)), Number(gun.slice(5, 7)) - 1, Number(gun.slice(8, 10)));
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}
export function ekMesaiButcesi(satirlar: readonly { gun: string; saat: number }[], sinirSaat: number) {
  const hafta = new Map<string, number>();
  for (const x of satirlar) hafta.set(haftaBasi(x.gun), (hafta.get(haftaBasi(x.gun)) ?? 0) + x.saat);
  const bir = (x: number) => Math.round(x * 10) / 10;
  const haftalar = [...hafta].sort(([a], [b]) => a.localeCompare(b)).map(([h, saat]) => ({ hafta: h, saat: bir(saat) }));
  const asanHaftalar = sinirSaat > 0 ? haftalar.filter((h) => h.saat > sinirSaat) : [];
  return { toplamSaat: bir(satirlar.reduce((t, x) => t + x.saat, 0)), haftaSiniriSaat: sinirSaat, haftalar, asanHaftalar, asildi: asanHaftalar.length > 0 };
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
