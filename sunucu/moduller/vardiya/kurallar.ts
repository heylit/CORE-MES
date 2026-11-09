// Vardiya kuralları (saf). Saat "SS:DD" metnidir; gün 1 pazartesi ... 7 pazar; tarih "YYYY-AA-GG".

const GUN_DK = 24 * 60;

export interface Mola { baslangic: string; bitis: string }
export interface VardiyaTanimi { id: number; baslangic: string; bitis: string; aktif: boolean; molalar: readonly Mola[] }
export interface MatrisSatiri { isMerkeziId: number; gun: number; vardiyaId: number }
// Dakika ekseni: aralığın ilk gününün 00:00'ı sıfırdır.
export interface DakikaAraligi { bas: number; bit: number }

// Takvim hesabı aynı birkaç saat metnini kaynak x gün kez çevirir; sonuç metnin kendisinden bellidir, tablo yalnız tekrarı keser.
const SAAT_TABLOSU_SINIRI = 4096;
const saatDakikalari = new Map<string, number>();
export const dakika = (saat: string): number => {
  const bilinen = saatDakikalari.get(saat);
  if (bilinen !== undefined) return bilinen;
  const [s, d] = saat.split(':').map(Number);
  const sonuc = (s ?? 0) * 60 + (d ?? 0);
  if (saatDakikalari.size >= SAAT_TABLOSU_SINIRI) saatDakikalari.clear();
  saatDakikalari.set(saat, sonuc);
  return sonuc;
};

// Başlangıçtan bitişe süre; bitiş önceyse gece yarısını geçer.
export const aralik = (bas: string, bit: string): number => {
  const f = dakika(bit) - dakika(bas);
  return f > 0 ? f : f + GUN_DK;
};

// Vardiya başlangıcına göre konum (gece yarısını geçen vardiyada ertesi günün saatleri sona eklenir).
const konum = (bas: string, saat: string): number => aralik(bas, saat) % GUN_DK;

function molaParcalari(bas: string, molalar: readonly Mola[]): DakikaAraligi[] {
  return molalar.map((m) => {
    const b = konum(bas, m.baslangic);
    return { bas: b, bit: b + aralik(m.baslangic, m.bitis) };
  }).sort((x, y) => x.bas - y.bas);
}

// VR-05: mola vardiyanın içinde olmalı ve molalar birbiriyle çakışmamalı; hata iletisi ya da null.
export function molaDenetle(bas: string, bit: string, molalar: readonly Mola[]): string | null {
  if (molalar.some((m) => m.baslangic === m.bitis)) return 'Molanın başlangıç ve bitişi aynı olamaz.';
  const uzunluk = aralik(bas, bit);
  const parcalar = molaParcalari(bas, molalar);
  for (const [i, p] of parcalar.entries()) {
    if (p.bit > uzunluk) return 'Mola vardiyanın içinde olmalı.';
    const onceki = parcalar[i - 1];
    if (onceki && p.bas < onceki.bit) return 'Molalar çakışmamalı.';
  }
  return null;
}

// VR-05: molalar vardiyanın tamamını kaplayamaz; net süresi sıfır olan vardiya kapasite vermez, matriste yanlış görünür.
export const netSureHatasi = (bas: string, bit: string, molalar: readonly Mola[]): string | null =>
  netDakika(bas, bit, molalar) > 0 ? null : 'Molalar vardiyanın tamamını kaplıyor; net süre sıfırdan büyük olmalı.';

// VR-01: net süre = vardiya süresi - molalar.
export function netDakika(bas: string, bit: string, molalar: readonly Mola[]): number {
  return aralik(bas, bit) - molalar.reduce((t, m) => t + aralik(m.baslangic, m.bitis), 0);
}

// ISO hafta günü: 1 pazartesi ... 7 pazar.
export function haftaGunu(tarih: string): number {
  const g = new Date(`${tarih}T00:00:00Z`).getUTCDay();
  return g === 0 ? 7 : g;
}

export function tarihEkle(tarih: string, gun: number): string {
  const t = new Date(`${tarih}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + gun);
  return t.toISOString().slice(0, 10);
}

// Bitiş dahil gün sayısı; bitiş başlangıçtan önceyse sıfır ya da eksi.
export const gunFarki = (baslangic: string, bitis: string): number =>
  Math.round((Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000) + 1;

// VR-01, VR-02, VR-08: bir iş merkezinde o gün başlayan vardiyalar: matriste açık ve aktif; tatil ya da kapalı günde hiçbiri.
// Kişinin vardiyası verilirse (yalnizVardiyaId) yalnız o vardiya sayılır.
export function gununVardiyalari<V extends { id: number; aktif: boolean }>(
  tarih: string,
  isMerkeziId: number,
  matris: readonly MatrisSatiri[],
  vardiyalar: ReadonlyMap<number, V>,
  kapaliGunler: ReadonlySet<string>,
  yalnizVardiyaId: number | null = null,
): V[] {
  if (kapaliGunler.has(tarih)) return [];
  const gun = haftaGunu(tarih);
  return matris
    .filter((m) => m.isMerkeziId === isMerkeziId && m.gun === gun && (yalnizVardiyaId === null || m.vardiyaId === yalnizVardiyaId))
    .map((m) => vardiyalar.get(m.vardiyaId))
    .filter((v): v is V => v?.aktif === true);
}

// VR-01, VR-02: bir iş merkezinin bir günkü çalışma süresi; tatil ya da kapalı günde sıfır.
export function gunlukDakika(
  tarih: string,
  isMerkeziId: number,
  matris: readonly MatrisSatiri[],
  vardiyalar: ReadonlyMap<number, { id: number; aktif: boolean; netDakika: number }>,
  kapaliGunler: ReadonlySet<string>,
  yalnizVardiyaId: number | null = null,
): number {
  return gununVardiyalari(tarih, isMerkeziId, matris, vardiyalar, kapaliGunler, yalnizVardiyaId).reduce((t, v) => t + v.netDakika, 0);
}

// Vardiyanın o günün 00:00'ına göre çalışma parçaları; molalar dışarıda, gece vardiyası 24:00'ı geçer.
export function vardiyaParcalari(v: Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>): DakikaAraligi[] {
  const bas = dakika(v.baslangic);
  const son = bas + aralik(v.baslangic, v.bitis);
  const parcalar: DakikaAraligi[] = [];
  let t = bas;
  for (const m of molaParcalari(v.baslangic, v.molalar)) {
    if (m.bas + bas > t) parcalar.push({ bas: t, bit: m.bas + bas });
    t = Math.max(t, m.bit + bas);
  }
  if (son > t) parcalar.push({ bas: t, bit: son });
  return parcalar;
}

// Sıralı, örtüşen ve bitişik parçaları birleşmiş liste (yeni nesneler).
export function birlestir(liste: DakikaAraligi[]): DakikaAraligi[] {
  const sirali = [...liste].sort((x, y) => x.bas - y.bas);
  const sonuc: DakikaAraligi[] = [];
  for (const a of sirali) {
    const son = sonuc[sonuc.length - 1];
    if (son && a.bas <= son.bit) son.bit = Math.max(son.bit, a.bit);
    else sonuc.push({ ...a });
  }
  return sonuc;
}

// VR-07: aralıktaki çalışma aralıkları (ilk günün 00:00'ından dakika): her gün o gün başlayan vardiyaların parçaları. İlk günden
// önceki gün başlayıp taşan gece vardiyası dahildir; son günden sonrasına taşan kısım ve ilk günden önceki kısım kesilir. Bitişik
// ya da örtüşen parçalar (iki vardiya art arda) tek aralıktır.
export function takvimAraliklari(
  baslangic: string,
  gunSayisi: number,
  gununVardiyalariniVer: (tarih: string) => readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[],
): DakikaAraligi[] {
  const ust = gunSayisi * GUN_DK;
  const parcalar: DakikaAraligi[] = [];
  for (let i = -1; i < gunSayisi; i += 1) {
    for (const v of gununVardiyalariniVer(tarihEkle(baslangic, i))) {
      for (const p of vardiyaParcalari(v)) {
        const bas = Math.max(0, p.bas + i * GUN_DK);
        const bit = Math.min(ust, p.bit + i * GUN_DK);
        if (bit > bas) parcalar.push({ bas, bit });
      }
    }
  }
  return birlestir(parcalar);
}

// Planlı duruş (kart #519). Zaman ISO metnidir; dakika ekseni takvimin ekseniyle aynıdır (ilk günün 00:00'ı, tesis duvar saati).
export type DurusTekrari = 'yok' | 'gunluk' | 'haftalik';
export type DurusKapsami = 'tesis' | 'is-merkezi' | 'istasyon';
export interface DurusGirdisi {
  kapsam: DurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  baslangic: string; bitis: string; tekrar: DurusTekrari; gunler: readonly number[]; tekrarBitis: string | null;
}
export interface DurusTanimi { basDk: number; sureDk: number; sonDk: number | null; tekrar: DurusTekrari; gunler: readonly number[] }
export interface KuralHatasi { ileti: string; alan: string }

const DK_MS = 60_000;

// Tekrarın ayrıntısı tekrar türüne bağlıdır: haftalık olmayan duruş gün taşımaz, tekrar etmeyen bitiş taşımaz; günler sıralı ve tekildir.
export function durusuDuzenle<G extends DurusGirdisi>(g: G): G {
  return {
    ...g,
    gunler: g.tekrar === 'haftalik' ? [...new Set(g.gunler)].sort((a, b) => a - b) : [],
    tekrarBitis: g.tekrar === 'yok' ? null : g.tekrarBitis,
  };
}

// VR-11: hedef kapsamla tutarlıdır (tesis geneli hedefsiz, iş merkezi ya da istasyon tek hedefli).
// VR-12: bitiş başlangıçtan sonradır, zamanlar dakika hassasiyetindedir; tekrar eden duruş bir günden kısadır, haftalıkta en az bir gün
// seçilir, tekrar başlangıçtan önce bitmez. Düzenlenmiş girdi alır (`durusuDuzenle`); hata iletisi ya da null.
export function durusHatasi(g: DurusGirdisi): KuralHatasi | null {
  if (g.kapsam === 'tesis' && (g.isMerkeziId !== null || g.istasyonId !== null)) return { ileti: 'Tesis geneli duruşta iş merkezi ve istasyon seçilmez.', alan: 'kapsam' };
  if (g.kapsam === 'is-merkezi' && g.isMerkeziId === null) return { ileti: 'İş merkezi seçin.', alan: 'isMerkeziId' };
  if (g.kapsam === 'is-merkezi' && g.istasyonId !== null) return { ileti: 'İş merkezi duruşunda istasyon seçilmez.', alan: 'istasyonId' };
  if (g.kapsam === 'istasyon' && g.istasyonId === null) return { ileti: 'İstasyon seçin.', alan: 'istasyonId' };
  if (g.kapsam === 'istasyon' && g.isMerkeziId !== null) return { ileti: 'İstasyon duruşunda iş merkezi seçilmez.', alan: 'isMerkeziId' };
  const bas = Date.parse(g.baslangic);
  const bit = Date.parse(g.bitis);
  const son = g.tekrarBitis === null ? null : Date.parse(g.tekrarBitis);
  for (const [an, alan] of [[bas, 'baslangic'], [bit, 'bitis'], [son, 'tekrarBitis']] as const) {
    if (an !== null && an % DK_MS !== 0) return { ileti: 'Zaman dakika hassasiyetinde olmalı.', alan };
  }
  if (bit <= bas) return { ileti: 'Bitiş başlangıçtan sonra olmalı.', alan: 'bitis' };
  if (g.tekrar !== 'yok' && bit - bas >= GUN_DK * DK_MS) return { ileti: 'Tekrar eden duruş bir günden kısa olmalı.', alan: 'bitis' };
  if (g.tekrar === 'haftalik' && g.gunler.length === 0) return { ileti: 'Haftalık tekrarda en az bir gün seçin.', alan: 'gunler' };
  if (son !== null && son < bas) return { ileti: 'Tekrar başlangıçtan önce bitemez.', alan: 'tekrarBitis' };
  return null;
}

// VR-15: kaynağın takviminden düşen duruşlar: tesis geneli her kaynakta; iş merkezi duruşu o merkezin kaynaklarında; istasyon duruşu
// yalnız o istasyonda ve makinelerinde (kişi takviminde düşmez: kişi başka istasyonda çalışabilir).
export function kaynagaUyanlar<D extends { kapsam: DurusKapsami; isMerkeziId: number | null; istasyonId: number | null }>(
  duruslar: readonly D[], isMerkeziId: number, istasyonId: number | null,
): D[] {
  return duruslar.filter((d) => d.kapsam === 'tesis'
    || (d.kapsam === 'is-merkezi' && d.isMerkeziId === isMerkeziId)
    || (d.kapsam === 'istasyon' && istasyonId !== null && d.istasyonId === istasyonId));
}

// VR-15: duruşun gerçekleşmeleri, [0, (gunSayisi + 1) gün) içinde kesilmiş (son günün gece vardiyası ertesi güne taşar). Tekrar her gün
// aynı duvar saatinde başlar (haftalıkta yalnız seçili ISO günlerde), ilk başlangıçtan önce ve tekrar bitişinden sonra başlamaz.
export function durusAraliklari(d: DurusTanimi, baslangic: string, gunSayisi: number): DakikaAraligi[] {
  const ust = (gunSayisi + 1) * GUN_DK;
  const kes = (bas: number): DakikaAraligi[] => {
    const b = Math.max(0, bas);
    const e = Math.min(ust, bas + d.sureDk);
    return e > b ? [{ bas: b, bit: e }] : [];
  };
  if (d.tekrar === 'yok') return kes(d.basDk);
  const saat = ((d.basDk % GUN_DK) + GUN_DK) % GUN_DK;
  const sonuc: DakikaAraligi[] = [];
  for (let i = Math.max(-1, Math.floor(d.basDk / GUN_DK)); i <= gunSayisi; i += 1) {
    const bas = i * GUN_DK + saat;
    if (d.sonDk !== null && bas > d.sonDk) break;
    if (d.tekrar === 'haftalik' && !d.gunler.includes(haftaGunu(tarihEkle(baslangic, i)))) continue;
    sonuc.push(...kes(bas));
  }
  return sonuc;
}

// Aralıklardan çıkarılacakların düştüğü parçalar; sıra korunur.
// Takvim hesabı bu işlevi kaynak x gün kez, bir yıllık duruş listesiyle çağırır: liste zaten sıralı ve birleşikse yeniden sıralanmaz.
const birlesikMi = (l: readonly DakikaAraligi[]): boolean => l.every((a, i) => a.bit >= a.bas && (i === 0 || a.bas > l[i - 1]!.bit));
// Ters (bitişi başından önce) parça varsa sıralı tarama geçerli değildir: her kesik her parçaya tek tek uygulanır.
const tekTekCikar = (araliklar: readonly DakikaAraligi[], kesik: readonly DakikaAraligi[]): DakikaAraligi[] =>
  araliklar.flatMap((a) => kesik.reduce<DakikaAraligi[]>((parcalar, k) => parcalar.flatMap((p) => {
    if (k.bit <= p.bas || k.bas >= p.bit) return [p];
    return [...(k.bas > p.bas ? [{ bas: p.bas, bit: k.bas }] : []), ...(k.bit < p.bit ? [{ bas: k.bit, bit: p.bit }] : [])];
  }), [{ ...a }]));
// kesik sıralı ve birleşik olduğundan aralığa değmeyen ilk kısım ikili aramayla atlanır, değenler sırayla kesilir. Önceki kesilenler
// yalnız son parçaya değebilir (her kesik, öncekinin bitişinden sonra başlar); sonuç her kesiği bütün parçalara uygulamakla aynıdır.
export function araliklardanCikar(araliklar: readonly DakikaAraligi[], cikarilacak: readonly DakikaAraligi[]): DakikaAraligi[] {
  const kesik = birlesikMi(cikarilacak) ? cikarilacak : birlestir([...cikarilacak]);
  if (!kesik.every((k) => k.bit >= k.bas)) return tekTekCikar(araliklar, kesik);
  return araliklar.flatMap((a) => {
    let alt = 0;
    let ust = kesik.length;
    while (alt < ust) { const orta = (alt + ust) >> 1; if (kesik[orta]!.bit <= a.bas) alt = orta + 1; else ust = orta; }
    const parcalar: DakikaAraligi[] = [];
    let p: DakikaAraligi | null = { ...a };
    for (let i = alt; i < kesik.length && p !== null; i += 1) {
      const k = kesik[i]!;
      if (k.bas >= a.bit) break;
      if (k.bit <= p.bas || k.bas >= p.bit) continue;
      if (k.bas > p.bas) parcalar.push({ bas: p.bas, bit: k.bas });
      p = k.bit < p.bit ? { bas: k.bit, bit: p.bit } : null;
    }
    if (p !== null) parcalar.push(p);
    return parcalar;
  });
}

// Günlük mesai: o gün (gün sırası) başlayan vardiyaların net çalışma aralıkları; molalar ve duruşlar dışarıda, gece yarısını geçen kısım
// dahil. Takvim aralıklarından ayrıdır: orada önceki günün taşan gece vardiyası ve ertesi günün vardiyası aynı aralığa birleşebilir.
export function gununCalismaAraliklari(gunSirasi: number, vardiyalar: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[], duruslar: readonly DakikaAraligi[]): DakikaAraligi[] {
  const parcalar = vardiyalar.flatMap((v) => vardiyaParcalari(v).map((p) => ({ bas: p.bas + gunSirasi * GUN_DK, bit: p.bit + gunSirasi * GUN_DK })));
  return birlestir(araliklardanCikar(parcalar, duruslar));
}

// Günlük mesai: o gün (gün sırası) başlayan vardiyaların molaları; aynı dakikada başka bir vardiya ya da fazla mesai çalışıyorsa o kısım
// mola değildir. Puantaj molayı bununla düşer: vardiyalar arasındaki boşluk mola sayılmaz.
export function gununMolaAraliklari(gunSirasi: number, vardiyalar: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[]): DakikaAraligi[] {
  const kaydir = (a: DakikaAraligi, bas: number) => ({ bas: a.bas + bas + gunSirasi * GUN_DK, bit: a.bit + bas + gunSirasi * GUN_DK });
  const molalar = vardiyalar.flatMap((v) => molaParcalari(v.baslangic, v.molalar).map((m) => kaydir(m, dakika(v.baslangic))));
  const parcalar = vardiyalar.flatMap((v) => vardiyaParcalari(v).map((p) => kaydir(p, 0)));
  return birlestir(araliklardanCikar(birlestir(molalar), parcalar));
}

// Gün kaydının kapanışı: o gün (gün sırası, ilk gün 0) başlayan vardiyaların en geç bitişi; gece vardiyası 24:00'ı geçer. Vardiya yoksa null.
export function gununSonDakikasi(gunSirasi: number, vardiyalar: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis'>[]): number | null {
  if (vardiyalar.length === 0) return null;
  return Math.max(...vardiyalar.map((v) => dakika(v.baslangic) + aralik(v.baslangic, v.bitis))) + gunSirasi * GUN_DK;
}

// VR-01, VR-15: o gün (gün sırası, ilk gün 0) başlayan vardiyaların net dakikası, planlı duruşlar düşülmüş. Örtüşen vardiyaların aynı
// dakikası bir kez sayılır: gün dakikası takvim aralıklarıyla aynı süreyi verir (iki ekip aynı tezgahı aynı dakikada iki kez çalıştıramaz).
export function gunNetDakikasi(gunSirasi: number, vardiyalar: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[], duruslar: readonly DakikaAraligi[]): number {
  const parcalar = birlestir(vardiyalar.flatMap((v) => vardiyaParcalari(v).map((p) => ({ bas: p.bas + gunSirasi * GUN_DK, bit: p.bit + gunSirasi * GUN_DK }))));
  return araliklardanCikar(parcalar, duruslar).reduce((t, p) => t + p.bit - p.bas, 0);
}

// VR-06: haftayı uygula: kaynak iş merkezinin satırları hedeflerin her birine kopyalanır; hedefin eski satırları gider.
export function haftaKopyasi(matris: readonly MatrisSatiri[], kaynakIsMerkeziId: number, hedefler: readonly number[]): MatrisSatiri[] {
  const kaynak = matris.filter((m) => m.isMerkeziId === kaynakIsMerkeziId);
  return hedefler.filter((h) => h !== kaynakIsMerkeziId).flatMap((h) => kaynak.map((m) => ({ ...m, isMerkeziId: h })));
}

export type TopluMatrisKipi = 'ekle' | 'kaldir' | 'ayarla';

// VR-18: seçilen iş merkezlerinin seçilen günlerinde seçilen vardiyalar eklenir, kaldırılır ya da gün yalnız onlardan oluşur (ayarla).
// Dönen liste hedef iş merkezlerinin yeni düzeninin tamamıdır; seçilmeyen günler ve öbür iş merkezleri değişmez.
export function topluMatris(
  matris: readonly MatrisSatiri[], hedefler: readonly number[], gunler: readonly number[], vardiyalar: readonly number[], kip: TopluMatrisKipi,
): MatrisSatiri[] {
  const hedef = new Set(hedefler);
  const gun = new Set(gunler);
  const vardiya = new Set(vardiyalar);
  const anahtar = (m: MatrisSatiri) => `${m.isMerkeziId}:${m.gun}:${m.vardiyaId}`;
  const sonuc = new Map<string, MatrisSatiri>();
  for (const m of matris) {
    if (!hedef.has(m.isMerkeziId)) continue;
    const secili = gun.has(m.gun);
    if (secili && kip === 'ayarla') continue;
    if (secili && kip === 'kaldir' && vardiya.has(m.vardiyaId)) continue;
    sonuc.set(anahtar(m), { isMerkeziId: m.isMerkeziId, gun: m.gun, vardiyaId: m.vardiyaId });
  }
  if (kip !== 'kaldir') {
    for (const isMerkeziId of hedef) for (const g of gun) for (const vardiyaId of vardiya) {
      const m = { isMerkeziId, gun: g, vardiyaId };
      sonuc.set(anahtar(m), m);
    }
  }
  return [...sonuc.values()].sort((a, b) => a.isMerkeziId - b.isMerkeziId || a.gun - b.gun || a.vardiyaId - b.vardiyaId);
}

// VR-08: kişinin iş merkezi, istasyon atamalarından en büyük yüzdeli istasyonunkidir (eşitlikte küçük istasyon kimliği); atama yoksa null.
// Yüzde iki ondalıklı metindir; sente çevrilip karşılaştırılır (ondalık hatası olmasın).
export function kisininIstasyonu(atamalar: readonly { istasyonId: number; yuzde: string }[]): number | null {
  const sent = (y: string): number => Math.round(Number(y) * 100);
  let secilen: { istasyonId: number; sent: number } | null = null;
  for (const a of atamalar) {
    const s = sent(a.yuzde);
    if (!secilen || s > secilen.sent || (s === secilen.sent && a.istasyonId < secilen.istasyonId)) secilen = { istasyonId: a.istasyonId, sent: s };
  }
  return secilen?.istasyonId ?? null;
}

// VR-28 (soru 142 b): resmî tatilin sahibi İK'dır; takvim İK'nın tatillerini ve Vardiya'nın kendi günlerini birleştirir. Vardiya yeni tatil
// yazmaz; 142'den önce girilmiş tatil satırı tatil kalır (planlama yalnız tatili tatil sayar) ve Vardiya'dan silinebilir. Aynı gün İK'da
// tatilse İK'nın satırı görünür (bordro ve fazla mesai türü bunu ister). İK satırı `kaynak: 'ik'` taşır; Vardiya'nın kendi satırı alansızdır.
export interface TakvimGunu { tarih: string; tur: 'tatil' | 'kapali'; ad: string | null; kaynak?: 'ik' }
export function takvimGunleriniBirlestir(
  kendi: readonly { tarih: string; tur: 'tatil' | 'kapali'; ad: string | null }[], tatiller: readonly { tarih: string; ad: string | null }[],
): TakvimGunu[] {
  const gunler = new Map<string, TakvimGunu>();
  for (const g of kendi) gunler.set(g.tarih, { tarih: g.tarih, tur: g.tur, ad: g.ad });
  for (const t of tatiller) gunler.set(t.tarih, { tarih: t.tarih, tur: 'tatil', ad: t.ad, kaynak: 'ik' });
  return [...gunler.values()].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
}

// VR-03: bugünden önceki tarih geçmiştir (tarih metinleri karşılaştırılabilir).
export const gecmisMi = (tarih: string, bugun: string): boolean => tarih < bugun;

// Fazla mesai planı (kart #1324).
export type FazlaMesaiKapsami = 'is-merkezi' | 'istasyon';
export interface FazlaMesaiTanimi {
  tarih: string; baslangic: string; bitis: string; kapsam: FazlaMesaiKapsami; isMerkeziId: number | null; istasyonId: number | null; kisiIdleri: readonly number[];
}

// VR-21: kapsam hedefini belirler; iş merkezinde yalnız iş merkezi, istasyonda yalnız istasyon. Başlangıç ve bitiş aynı olmaz.
export function fazlaMesaiHatasi(g: Omit<FazlaMesaiTanimi, 'tarih' | 'kisiIdleri'>): KuralHatasi | null {
  if (g.baslangic === g.bitis) return { ileti: 'Başlangıç ve bitiş aynı olamaz.', alan: 'bitis' };
  if (g.kapsam === 'is-merkezi' && (g.isMerkeziId === null || g.istasyonId !== null)) return { ileti: 'İş merkezi seçilmeli.', alan: 'isMerkeziId' };
  if (g.kapsam === 'istasyon' && (g.istasyonId === null || g.isMerkeziId !== null)) return { ileti: 'İstasyon seçilmeli.', alan: 'istasyonId' };
  return null;
}

// VR-30: fazla mesainin kendi gününün 00:00'ından dakika aralığı; gece yarısını geçen kayıt ertesi güne uzanır. Gün farkı (öbür kaydın günü
// eksi bu günü) verilirse aynı eksene kaydırılır.
export function fazlaMesaiDakikaAraligi(f: { baslangic: string; bitis: string }, gunFarkiDk = 0): DakikaAraligi {
  const bas = dakika(f.baslangic) + gunFarkiDk * GUN_DK;
  return { bas, bit: bas + aralik(f.baslangic, f.bitis) };
}

// VR-30: vardiyanın (molalar dahil) başladığı günün 00:00'ından dakika aralığı, gün sırasıyla kaydırılmış.
export function vardiyaDakikaAraligi(v: Pick<VardiyaTanimi, 'baslangic' | 'bitis'>, gunSirasi: number): DakikaAraligi {
  const bas = dakika(v.baslangic) + gunSirasi * GUN_DK;
  return { bas, bit: bas + aralik(v.baslangic, v.bitis) };
}

export const araliklarCakisir = (a: DakikaAraligi, b: DakikaAraligi): boolean => a.bas < b.bit && b.bas < a.bit;

// VR-29 (W8, 18.1): kişinin son çalışma günü. İK çıkış günü çalışma günüdür (puantaj da yalnız sonrasını reddeder). Pasif kişi bugünden
// itibaren çalışmaz; geçmiş günleri değişmez, çünkü Arkon emek verimi ve OEE geçmiş ayları da takvimden okur. Sınır yoksa null.
export function sonCalismaGunu(k: { aktif: boolean; cikisTarihi: string | null; bugun: string }): string | null {
  const pasifSonu = k.aktif ? null : tarihEkle(k.bugun, -1);
  if (pasifSonu === null) return k.cikisTarihi;
  return k.cikisTarihi === null || pasifSonu < k.cikisTarihi ? pasifSonu : k.cikisTarihi;
}

export const ayrildiMi = (sonGun: string | null, tarih: string): boolean => sonGun !== null && tarih > sonGun;

// VR-29: ayrılmış (son çalışma gününden sonraki tarih) ya da pasif kişiye fazla mesai yazılmaz.
export function fazlaMesaiKisiHatasi(tarih: string, kisiler: readonly { kisiId: number; sonGun: string | null }[]): KuralHatasi | null {
  return kisiler.some((k) => ayrildiMi(k.sonGun, tarih))
    ? { ileti: 'İşten ayrılmış ya da pasif kişiye fazla mesai yazılamaz.', alan: 'kisiIdleri' }
    : null;
}

// VR-24: kaynağa uyan fazla mesailer. Kişi takvimine yalnız listesinde olduğu kayıtlar; öbür kaynaklara iş merkezi kaydı o merkeze ve
// istasyonlarına, istasyon kaydı yalnız o istasyona ve makinelerine (planlı duruşun kapsam kuralı gibi, VR-15).
export function fazlaMesaiUyanlar<F extends FazlaMesaiTanimi>(
  liste: readonly F[], kaynak: { isMerkeziId: number; istasyonId: number | null; kisiId: number | null },
): F[] {
  if (kaynak.kisiId !== null) return liste.filter((f) => f.kisiIdleri.includes(kaynak.kisiId!));
  return liste.filter((f) => (f.kapsam === 'is-merkezi' && f.isMerkeziId === kaynak.isMerkeziId)
    || (f.kapsam === 'istasyon' && kaynak.istasyonId !== null && f.istasyonId === kaynak.istasyonId));
}

// Fazla mesai vardiya gibi okunur (molasız): tatil ve kapalı günde de çalışılır, çünkü bilerek planlanmıştır.
export const fazlaMesaiVardiyasi = (f: Pick<FazlaMesaiTanimi, 'baslangic' | 'bitis'>): Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'> =>
  ({ baslangic: f.baslangic, bitis: f.bitis, molalar: [] });

// VR-24: günün net dakikası; vardiyaların toplamına fazla mesainin vardiyalarla örtüşmeyen kısmı eklenir (aynı dakika iki kez sayılmaz),
// planlı duruşlar ikisinden de düşülür.
export function gunNetDakikasiEk(
  gunSirasi: number, vardiyalar: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[],
  ekler: readonly Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>[], duruslar: readonly DakikaAraligi[],
): number {
  const kaydir = (v: Pick<VardiyaTanimi, 'baslangic' | 'bitis' | 'molalar'>) =>
    vardiyaParcalari(v).map((p) => ({ bas: p.bas + gunSirasi * GUN_DK, bit: p.bit + gunSirasi * GUN_DK }));
  // Önce duruşlar sonra vardiyalar çıkar: kalan dakikalar aynıdır, uzun duruş listesi her gün yeniden sıralanmaz.
  const ek = araliklardanCikar(araliklardanCikar(birlestir(ekler.flatMap(kaydir)), duruslar), vardiyalar.flatMap(kaydir));
  return gunNetDakikasi(gunSirasi, vardiyalar, duruslar) + ek.reduce((t, p) => t + p.bit - p.bas, 0);
}

// VR-26: kişinin çalışma payı istasyon atama yüzdelerinin toplamıdır (1 tam zaman); atama yoksa null. Yüzde iki ondalıklı metindir.
export function atamaPayi(atamalar: readonly { yuzde: string }[]): number | null {
  if (atamalar.length === 0) return null;
  return atamalar.reduce((t, a) => t + Math.round(Number(a.yuzde) * 100), 0) / 10000;
}

// VR-25: aralıktaki onaylı izin günleri (iki uç dahil) ve günün izinli oranı (1 tam gün). Bekleyen, reddedilen ve iptal izin çalışmayı düşürmez.
// Soru 54: tek günlük izinde gün sayısı 1'den azsa (yarım gün) oran odur; kaydın hangi saatler olduğu bilinmez. Çok günlük izin her gün tamdır.
export function onayliIzinGunleri(
  izinler: readonly { baslangic: string; bitis: string; gun?: number | null; durum: string }[], ilk: string, son: string,
): Map<string, number> {
  const gunler = new Map<string, number>();
  for (const i of izinler) {
    if (i.durum !== 'Onaylandı') continue;
    const oran = i.baslangic === i.bitis && typeof i.gun === 'number' && i.gun > 0 && i.gun < 1 ? i.gun : 1;
    for (let g = i.baslangic < ilk ? ilk : i.baslangic; g <= i.bitis && g <= son; g = tarihEkle(g, 1)) gunler.set(g, Math.min(1, (gunler.get(g) ?? 0) + oran));
  }
  return gunler;
}

// Soru 54: kısmi izinde çalışmadan çıkan kısım, günün planlı çalışmasının oranı kadardır; saat kayıtta olmadığı için günün sonundan alınır.
export function izinliKisim(plan: readonly DakikaAraligi[], oran: number): DakikaAraligi[] {
  let kalan = Math.round(plan.reduce((t, p) => t + p.bit - p.bas, 0) * oran);
  const sonuc: DakikaAraligi[] = [];
  for (const p of [...plan].sort((a, b) => b.bit - a.bit)) {
    if (kalan <= 0) break;
    const sure = Math.min(kalan, p.bit - p.bas);
    sonuc.unshift({ bas: p.bit - sure, bit: p.bit });
    kalan -= sure;
  }
  return sonuc;
}

// Vardiya kadrosu (tek tanım, kullanıcı kararı "Tek tanım"): bir iş merkezinin bir vardiyasındaki kişiler. Kişi istasyon, makine ya da ekip
// atamasıyla iş merkezine girer (birden çok iş merkezinde olabilir). Vardiyası seçilen kişi yalnız o vardiyada, seçilmeyen kişi iş merkezinin
// bütün açık vardiyalarında (matriste en az bir günü olan aktif vardiya) sayılır; vardiyaId null satırı seçilmeyenlerin kendisidir. Pay, kişinin
// o iş merkezindeki atama yüzdelerinin toplamıdır (sent; #1324: %50 atanan yarım). Kişiler kimlik sırasıyla.
export interface KadroAtamasi { kisiId: number; isMerkeziId: number; yuzde: string }
export interface KadroSatiri { isMerkeziId: number; vardiyaId: number | null; kisiIdleri: number[]; paySent: number }

export function vardiyaKadrosu(
  atamalar: readonly KadroAtamasi[], kisiVardiyasi: ReadonlyMap<number, number>, acikVardiyalar: readonly { isMerkeziId: number; vardiyaId: number }[],
): KadroSatiri[] {
  const pay = new Map<number, Map<number, number>>();
  for (const a of atamalar) {
    const m = pay.get(a.isMerkeziId) ?? new Map<number, number>();
    m.set(a.kisiId, (m.get(a.kisiId) ?? 0) + Math.round(Number(a.yuzde) * 100));
    pay.set(a.isMerkeziId, m);
  }
  const satirlar = new Map<string, KadroSatiri>();
  const ekle = (isMerkeziId: number, vardiyaId: number | null, kisiId: number, sent: number) => {
    const anahtar = `${isMerkeziId}:${vardiyaId ?? '-'}`;
    const s = satirlar.get(anahtar) ?? { isMerkeziId, vardiyaId, kisiIdleri: [], paySent: 0 };
    s.kisiIdleri.push(kisiId);
    s.paySent += sent;
    satirlar.set(anahtar, s);
  };
  for (const [isMerkeziId, kisiler] of pay) {
    const acik = [...new Set(acikVardiyalar.filter((x) => x.isMerkeziId === isMerkeziId).map((x) => x.vardiyaId))];
    for (const [kisiId, sent] of [...kisiler].sort((a, b) => a[0] - b[0])) {
      const vardiyaId = kisiVardiyasi.get(kisiId);
      if (vardiyaId !== undefined) { ekle(isMerkeziId, vardiyaId, kisiId, sent); continue; }
      ekle(isMerkeziId, null, kisiId, sent);
      for (const v of acik) ekle(isMerkeziId, v, kisiId, sent);
    }
  }
  return [...satirlar.values()].sort((a, b) => a.isMerkeziId - b.isMerkeziId || (a.vardiyaId ?? 0) - (b.vardiyaId ?? 0));
}

// VR-27 (karar 140 a): kişinin çalışma takvimi onaylı izin günlerini taşır. Kişinin kendisi ve İK (`ik.oku`) her zaman görür; amir
// (`arkon.amir`) ve planlama (`vardiya.yaz`) yalnız kişinin iş merkezi kendi kapsamındaysa görür. Kalan herkes reddedilir.
export function kisiTakvimiGorunur(d: { kendisi: boolean; ikOkur: boolean; amirVeyaPlanlama: boolean; kapsamda: boolean }): boolean {
  return d.kendisi || d.ikOkur || (d.amirVeyaPlanlama && d.kapsamda);
}

// 2452: kişinin iş günleri. İş merkezi olan kişi üretim matrisinden çalışır (kişi vardiyası varsa yalnız o); olmayan kişinin vardiyası
// kişi atamasından, yoksa departmanının varsayılanından, o da yoksa tesis varsayılanından gelir ve günleri vardiyanın kendi günleridir
// (2452-2 a). Hiçbiri yoksa İK ayarı: pazartesi-cuma, ayar açıksa cumartesi (2452-3 a). Pasif vardiya yok sayılır.
export type IsGunuKaynagi = 'kisi' | 'departman' | 'is-merkezi' | 'varsayilan-vardiya' | 'ik-ayari';
export interface IsGunuBagi { kaynak: IsGunuKaynagi; vardiyaId: number | null; acik: (gun: number) => boolean }

export function isGunuBagi(k: {
  isMerkeziId: number | null; kisiVardiyasi: number | null; departmanVardiyasi: number | null; varsayilanVardiya: number | null;
  aktifVardiyalar: ReadonlySet<number>; matris: readonly MatrisSatiri[]; vardiyaGunleri: readonly { vardiyaId: number; gun: number }[];
  cumartesiIsGunu: boolean;
}): IsGunuBagi {
  const aktif = (id: number | null): number | null => (id !== null && k.aktifVardiyalar.has(id) ? id : null);
  if (k.isMerkeziId !== null) {
    const vardiyaId = aktif(k.kisiVardiyasi);
    const acikGunler = new Set(k.matris.filter((m) => m.isMerkeziId === k.isMerkeziId && k.aktifVardiyalar.has(m.vardiyaId)
      && (vardiyaId === null || m.vardiyaId === vardiyaId)).map((m) => m.gun));
    // Matrisi hiç açık günü olmayan iş merkezi (düzeni girilmemiş) iş günü bilgisi taşımaz: kişi ofis sırasına düşer.
    if (acikGunler.size > 0) return { kaynak: 'is-merkezi', vardiyaId, acik: (g) => acikGunler.has(g) };
  }
  const secim: [IsGunuKaynagi, number | null][] = [['kisi', aktif(k.kisiVardiyasi)], ['departman', aktif(k.departmanVardiyasi)], ['varsayilan-vardiya', aktif(k.varsayilanVardiya)]];
  const bulunan = secim.find(([, id]) => id !== null);
  if (bulunan) {
    const vardiyaId = bulunan[1]!;
    const acikGunler = new Set(k.vardiyaGunleri.filter((v) => v.vardiyaId === vardiyaId).map((v) => v.gun));
    return { kaynak: bulunan[0], vardiyaId, acik: (g) => acikGunler.has(g) };
  }
  return { kaynak: 'ik-ayari', vardiyaId: null, acik: (g) => g <= 5 || (g === 6 && k.cumartesiIsGunu) };
}

// Aralığın iş günleri (iki uç dahil, artan): vardiyası o gün açık, tesis kapalı günü ya da resmî tatil değil, son çalışma gününden sonra değil.
export function isGunleriniSec(baslangic: string, bitis: string, acik: (gun: number) => boolean, kapali: ReadonlySet<string>, sonGun: string | null): string[] {
  const sonuc: string[] = [];
  for (let i = 0, n = gunFarki(baslangic, bitis); i < n; i++) {
    const tarih = tarihEkle(baslangic, i);
    if (acik(haftaGunu(tarih)) && !kapali.has(tarih) && !ayrildiMi(sonGun, tarih)) sonuc.push(tarih);
  }
  return sonuc;
}

// Tarihten sonraki n'inci iş günü (n >= 1; tarihin kendisi sayılmaz); gün listesi yetmezse null.
export function isGunuSonrasi(gunler: readonly string[], tarih: string, n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  return gunler.filter((g) => g > tarih)[n - 1] ?? null;
}
