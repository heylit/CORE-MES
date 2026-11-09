import { kesisimDakika } from '../kurallar.ts';
import type { NetAralik } from '../kurallar.ts';

// Eksik iş kuralları (kart 2421 c, AR-EK-1..7). Saftır: zamanlar milisaniye, süreler vardiya takviminden, tarihler YYYY-AA-GG. Her kural plandan bağımsız bir yükümlülüğü
// gerçekleşenle karşılaştırır; eşik boşsa kural kapalıdır (null), bilinmeyen veride hüküm yoktur (null): eksik uydurulmaz.

const SAAT_MS = 3_600_000;
const GUN_MS = 24 * SAAT_MS;

export interface EksikHukum {
  // Birim türündedir: dakika, saat ya da gün.
  deger: number;
  kalanAdet: number | null;
  planaGore: boolean;
  // Olaya bakılan an (plan bitişi, son hareket, son giriş, son canlıya alma, teslim günü sonu).
  dayanak: number | null;
}

const hukum = (deger: number, dayanak: number | null, ek: Partial<Pick<EksikHukum, 'kalanAdet' | 'planaGore'>> = {}): EksikHukum =>
  ({ deger, dayanak, kalanAdet: ek.kalanAdet ?? null, planaGore: ek.planaGore ?? false });

// AR-EK-1, plan gerisi: canlı plandaki bitişi geçmiş, bitmemiş iş. Gecikme bitişten şu ana kadarki net aktif dakikadır (kaynağın vardiyası);
// vardiya bilinmiyorsa hüküm yoktur. Plan yeniden canlıya alınmasa da iş her gün gecikmesiyle görünür (bugünkü anomali hesabında beklenen sıfır
// olduğu için kayboluyordu).
export function planGerisi(g: { planBitis: number; simdi: number; araliklar: readonly NetAralik[] | null; kalanAdet: number; esikDk: number | null }): EksikHukum | null {
  if (g.esikDk === null || g.araliklar === null || !(g.kalanAdet > 0) || g.planBitis >= g.simdi) return null;
  const dk = kesisimDakika(g.araliklar, g.planBitis, g.simdi);
  return dk >= g.esikDk && dk > 0 ? hukum(Math.round(dk), g.planBitis, { kalanAdet: g.kalanAdet }) : null;
}

export interface IstasyonGunu {
  // İstasyonun makinelerinin o günkü net aktif dakikası (birleşik); vardiya bilinmiyorsa null.
  aktifDk: number | null;
  // O gün açık işi var mıydı (emri gün bitmeden açılmış, bugün hâlâ bitmemiş adım).
  acikIs: boolean;
  // O günkü net sayım girişi var mı.
  girisVar: boolean;
  // O gün istasyonda kayıtlı duruş (durdurma olayı) var mı; duruş günü kayıtsız sayılmaz.
  durusVar: boolean;
}

// AR-EK-2, kayıtsız iş günü: son kapanmış günden geriye, giriş olan ilk güne kadar, vardiyası ve açık işi olup hiç girişi olmayan gün sayısı.
// Vardiyası olmayan (tatil, bütün gün planlı duruş ya da bakım), açık işi olmayan ya da duruş kaydı girilmiş gün sayılmaz ama zinciri kırmaz;
// vardiyası bilinmeyen gün hüküm vermez, zinciri keser.
// Günler eskiden yeniye verilir.
export function kayitsizGunSayisi(gunler: readonly IstasyonGunu[]): number {
  let sayi = 0;
  for (let n = gunler.length - 1; n >= 0; n -= 1) {
    const g = gunler[n]!;
    if (g.girisVar || g.aktifDk === null) break;
    if (g.aktifDk > 0 && g.acikIs && !g.durusVar) sayi += 1;
  }
  return sayi;
}

export function kayitsizGun(g: { gunler: readonly IstasyonGunu[]; sonGiris: number | null; esikGun: number | null }): EksikHukum | null {
  if (g.esikGun === null) return null;
  const sayi = kayitsizGunSayisi(g.gunler);
  return sayi > 0 && sayi >= g.esikGun ? hukum(sayi, g.sonGiris) : null;
}

// Vardiya saati: iki an arasındaki net aktif süre (gece, tatil, mola ve planlı duruş düşülmüş). Atölyede bekleyiş iş saatiyle ölçülür;
// takvim saati geceyi ve hafta sonunu gecikme gibi gösterir.
const vardiyaSaati = (araliklar: readonly NetAralik[], bas: number, bit: number): number => kesisimDakika(araliklar, bas, bit) / 60;

// AR-EK-3, yarım kalan iş: başlamış adım tezgahta açık değil (açık kullanım yok) ve son hareketinden (son sayım, yoksa başlama) bu yana
// eşik kadar vardiya saati geçti. Vardiyası bilinmeyen kaynakta hüküm yoktur.
export function yarimIs(g: {
  calisiyor: boolean; tezgahtaAcik: boolean; sonHareket: number | null; simdi: number; araliklar: readonly NetAralik[] | null; kalanAdet: number; esikSaat: number | null;
}): EksikHukum | null {
  if (g.esikSaat === null || g.araliklar === null || !g.calisiyor || g.tezgahtaAcik || g.sonHareket === null || !(g.kalanAdet > 0)) return null;
  const saat = vardiyaSaati(g.araliklar, g.sonHareket, g.simdi);
  return saat >= g.esikSaat && saat > 0 ? hukum(Math.floor(saat), g.sonHareket, { kalanAdet: g.kalanAdet }) : null;
}

// AR-EK-4, plana girmemiş açık iş: planlı ya da başlamış emrin bitmemiş adımı canlı planda yerleşmemiş (ya da kaynaksız); emrin açılışından
// bu yana eşik kadar vardiya saati geçti. Takvim adımın kaynağından, yoksa istasyonundan, yoksa tesisten gelir; bilinmiyorsa hüküm yoktur.
export function plansizIs(g: { yerlesimVar: boolean; acilma: number; simdi: number; araliklar: readonly NetAralik[] | null; esikSaat: number | null }): EksikHukum | null {
  if (g.esikSaat === null || g.yerlesimVar || g.araliklar === null) return null;
  const saat = vardiyaSaati(g.araliklar, g.acilma, g.simdi);
  return saat >= g.esikSaat && saat > 0 ? hukum(Math.floor(saat), g.acilma) : null;
}

const gunNo = (tarih: string): number => Date.UTC(Number(tarih.slice(0, 4)), Number(tarih.slice(5, 7)) - 1, Number(tarih.slice(8, 10))) / GUN_MS;

// AR-EK-5, geciken emir: bitmemiş emrin teslim günü eşik kadar gün geçti (bugün - teslim > eşik); geçmediyse ve canlı plandaki son bitişin
// tesis günü teslimden sonraysa plana göre geciken (gün farkıyla). Teslimsiz emirde hüküm yoktur.
export function gecikenEmir(g: { teslim: string | null; bugun: string; teslimSonu: number | null; planBitisGunu: string | null; esikGun: number | null }): EksikHukum | null {
  if (g.esikGun === null || g.teslim === null) return null;
  const gecen = gunNo(g.bugun) - gunNo(g.teslim);
  if (gecen > g.esikGun) return hukum(gecen, g.teslimSonu);
  if (gecen > 0 || g.planBitisGunu === null) return null;
  const kayma = gunNo(g.planBitisGunu) - gunNo(g.teslim);
  return kayma > 0 ? hukum(kayma, g.teslimSonu, { planaGore: true }) : null;
}

// AR-EK-6, bayat plan: son canlıya almadan eşik kadar vardiya saati (tesis takvimi) geçti ve plan gerisinde iş var. Plan hiç canlıya
// alınmadıysa ve açık iş varsa da bayattır (dayanak yok, değer 0). Tesis takvimi bilinmiyorsa canlıya alınmış planda hüküm yoktur.
export function bayatPlan(g: {
  sonCanliyaAlma: number | null; simdi: number; araliklar: readonly NetAralik[] | null; planGerisi: number; acikIs: number; esikSaat: number | null;
}): EksikHukum | null {
  if (g.esikSaat === null) return null;
  if (g.sonCanliyaAlma === null) return g.acikIs > 0 ? hukum(0, null) : null;
  if (g.araliklar === null) return null;
  const saat = vardiyaSaati(g.araliklar, g.sonCanliyaAlma, g.simdi);
  return g.planGerisi > 0 && saat >= g.esikSaat && saat > 0 ? hukum(Math.floor(saat), g.sonCanliyaAlma) : null;
}

export type EksikEylem = { tur: 'ac'; h: EksikHukum } | { tur: 'guncelle'; h: EksikHukum } | { tur: 'kapat' } | { tur: 'yok' };

// AR-EK-7: açık olay sürerken güncellenir, hüküm kalkınca (iş bitti, giriş geldi, kural kapandı) kapanır; kapanmış konu yeniden eksik düşerse
// yeni olay açılır.
export function eksikEylemi(acik: boolean, h: EksikHukum | null): EksikEylem {
  if (h === null) return acik ? { tur: 'kapat' } : { tur: 'yok' };
  return acik ? { tur: 'guncelle', h } : { tur: 'ac', h };
}
