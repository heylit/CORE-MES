import { PLAN_ANALIZI_EWMA_EN_AZ, PLAN_ANALIZI_GECMIS_HAFTA, PLAN_ANALIZI_ILERI_HAFTA, type PlanAnaliziCevabi, type PlanAnaliziHucresi } from '#paylasilan/sozlesme/plan-analiz.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';

// 2151: Planlama analizinin saf hesapları. Zamanlar milisaniyedir; aralık [bas, bit).
export type Ms = readonly [number, number];
export interface Hafta { baslangic: string; bitis: string; ileri: boolean; bas: number; bit: number }

const GUN = 86_400_000;
const DK = 60_000;
const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN).toISOString().slice(0, 10);
const bir = (x: number): number => Math.round(x * 10) / 10;

// Haftalar tesis saatiyle pazartesi başlar. İlk sekizi geçmiş tam haftalar, sonrakiler bu hafta ve ilerisi; bu hafta "ileri" sayılır ve
// yalnız şimdiden sonrası ölçülür (geçmiş günleri gerçek kullanım değil plan sayılmasın diye).
export function haftaPenceresi(simdi: number): Hafta[] {
  const bugun = tesisGunu(simdi);
  const gun = new Date(`${bugun}T00:00:00Z`).getUTCDay();
  const buPazartesi = gunEkle(bugun, -((gun + 6) % 7));
  return Array.from({ length: PLAN_ANALIZI_GECMIS_HAFTA + PLAN_ANALIZI_ILERI_HAFTA }, (_, i) => {
    const baslangic = gunEkle(buPazartesi, (i - PLAN_ANALIZI_GECMIS_HAFTA) * 7);
    const sonraki = gunEkle(baslangic, 7);
    const ileri = i >= PLAN_ANALIZI_GECMIS_HAFTA;
    const bas = tesisGunBasi(baslangic);
    return { baslangic, bitis: gunEkle(sonraki, -1), ileri, bas: ileri ? Math.max(bas, simdi) : bas, bit: tesisGunBasi(sonraki) };
  });
}

// Bir aralık listesinin [bas, bit) içine düşen toplam süresi (ms). Liste kendi içinde çakışmaz varsayılır (takvim, plan parçaları).
export function pencereSuresi(liste: readonly Ms[], bas: number, bit: number): number {
  let t = 0;
  for (const [s, e] of liste) t += Math.max(0, Math.min(e, bit) - Math.max(s, bas));
  return t;
}

// İki aralık listesinin [bas, bit) içindeki ortak süresi (ms): planlı işin çalışma aralığına düşen kısmı.
export function ortakSure(a: readonly Ms[], b: readonly Ms[], bas: number, bit: number): number {
  let t = 0;
  for (const [s1, e1] of a) {
    const s = Math.max(s1, bas), e = Math.min(e1, bit);
    if (e <= s) continue;
    for (const [s2, e2] of b) t += Math.max(0, Math.min(e, e2) - Math.max(s, s2));
  }
  return t;
}

// Aynı makinede üst üste binen gerçek kullanım satırları (aynı anda iki emir) bir kez sayılır: makine o dakikada doludur.
export function birlestir(liste: readonly Ms[]): Ms[] {
  const s = [...liste].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const r: [number, number][] = [];
  for (const [a, b] of s) {
    const son = r.at(-1);
    if (son && a <= son[1]) son[1] = Math.max(son[1], b);
    else r.push([a, b]);
  }
  return r;
}

export interface MakineGirdisi {
  istasyonId: number;
  // Çalışma aralıkları; null: takvim okunamadı ya da hiç çalışma dakikası yok (kapasite uydurulmaz).
  takvim: readonly Ms[] | null;
  kullanim: readonly Ms[];
  plan: readonly Ms[];
}

export function hucre(kapasiteMs: number | null, yukMs: number): PlanAnaliziHucresi {
  const kapasiteDk = kapasiteMs === null ? null : Math.round(kapasiteMs / DK);
  const yukDk = Math.round(yukMs / DK);
  return { kapasiteDk, yukDk, oran: kapasiteDk === null || kapasiteDk === 0 ? null : bir((yukDk / kapasiteDk) * 100) };
}

// İstasyon x hafta: geçmişte gerçek dolu süre (vardiya dışı çalışma dahil, oran 100'ü geçebilir), ileride canlı planın çalışma aralığına
// düşen kısmı. Takvimsiz makine ne yüke ne kapasiteye girer.
export function istasyonHucreleri(makineler: readonly MakineGirdisi[], haftalar: readonly Hafta[]): Map<number, { makine: number; takvimsiz: number; hucreler: PlanAnaliziHucresi[] }> {
  const sonuc = new Map<number, { makine: number; takvimsiz: number; kap: (number | null)[]; yuk: number[] }>();
  for (const m of makineler) {
    const s = sonuc.get(m.istasyonId) ?? { makine: 0, takvimsiz: 0, kap: haftalar.map(() => null), yuk: haftalar.map(() => 0) };
    sonuc.set(m.istasyonId, s);
    s.makine += 1;
    if (m.takvim === null) { s.takvimsiz += 1; continue; }
    const kullanim = birlestir(m.kullanim);
    haftalar.forEach((h, i) => {
      s.kap[i] = (s.kap[i] ?? 0) + pencereSuresi(m.takvim!, h.bas, h.bit);
      s.yuk[i]! += h.ileri ? ortakSure(m.plan, m.takvim!, h.bas, h.bit) : pencereSuresi(kullanim, h.bas, h.bit);
    });
  }
  return new Map([...sonuc].map(([id, s]) => [id, { makine: s.makine, takvimsiz: s.takvimsiz, hucreler: haftalar.map((_, i) => hucre(s.kap[i] ?? null, s.yuk[i]!)) }]));
}

// İleri ilk dört haftada (bu hafta dahil) oranı olan haftaların ortalaması en yüksek istasyon. Ortalama yükü kapasiteye böler: boş geçen
// hafta darboğazı gizlemesin diye oranların değil, toplamların oranıdır.
export function darbogaz(istasyonlar: PlanAnaliziCevabi['istasyonlar'], haftalar: readonly Hafta[]): PlanAnaliziCevabi['darbogaz'] {
  const ilk = haftalar.findIndex((h) => h.ileri);
  let en: PlanAnaliziCevabi['darbogaz'] = null;
  for (const s of istasyonlar) {
    const h = s.hucreler.slice(ilk, ilk + 4).filter((x) => x.kapasiteDk !== null && x.kapasiteDk > 0);
    if (h.length === 0) continue;
    const oran = bir((h.reduce((t, x) => t + x.yukDk, 0) / h.reduce((t, x) => t + x.kapasiteDk!, 0)) * 100);
    if (en === null || oran > en.oran) en = { istasyonId: s.istasyonId, ad: s.ad, oran };
  }
  return en;
}

// Üstel düzeltilmiş ortalama (EWMA, lambda 0.3) ve kontrol sınırı (3 sigma, asimptotik). Temel düzey ilk `gereken` ölçümün ortalaması ve
// standart sapmasıdır; ölçüm bundan azsa eğri çizilir ama uyarı verilmez (2151-3 b: yetersiz veriyle sonuç uydurulmaz). Sapma sıfırsa
// sınır kurulamaz, uyarı yoktur.
export const EWMA_LAMBDA = 0.3;
export const EWMA_SINIR = 3;
export function ewmaEgilimi(olcumler: readonly { zaman: string; yuzde: number | null }[], gereken = PLAN_ANALIZI_EWMA_EN_AZ): PlanAnaliziCevabi['zamaninda'] {
  const x = olcumler.filter((o): o is { zaman: string; yuzde: number } => o.yuzde !== null).sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman));
  if (x.length === 0) return { noktalar: [], ornek: 0, gereken, uyari: null };
  const yeterli = x.length >= gereken;
  const taban = x.slice(0, yeterli ? gereken : x.length).map((o) => o.yuzde);
  const ort = taban.reduce((t, v) => t + v, 0) / taban.length;
  let z = yeterli ? ort : x[0]!.yuzde;
  const noktalar = x.map((o) => {
    z = EWMA_LAMBDA * o.yuzde + (1 - EWMA_LAMBDA) * z;
    return { zaman: o.zaman, yuzde: o.yuzde, ewma: bir(z) };
  });
  let uyari: 'dusus' | 'yukselis' | null = null;
  if (yeterli) {
    const sd = Math.sqrt(taban.reduce((t, v) => t + (v - ort) ** 2, 0) / (taban.length - 1));
    const sinir = EWMA_SINIR * sd * Math.sqrt(EWMA_LAMBDA / (2 - EWMA_LAMBDA));
    if (sd > 0 && z < ort - sinir) uyari = 'dusus';
    else if (sd > 0 && z > ort + sinir) uyari = 'yukselis';
  }
  return { noktalar, ornek: x.length, gereken, uyari };
}
