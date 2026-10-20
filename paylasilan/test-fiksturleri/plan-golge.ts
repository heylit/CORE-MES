// Plan motorları gölge testi: sunucu motoru (plan/kurallar.ts oner) ile tarayıcı motoru (recete-rota-motoru.html planRun) aynı fikstürle
// çalıştırılır; iki test de çıktısını bu dosyadaki ortak normal biçime çevirir. Veriler uydurmadır.

import fiksturJson from './plan-golge.json' with { type: 'json' };

export type MotorKurali = 'oncelik' | 'edd' | 'cr' | 'spt' | 'fifo';

export interface Takvim { baslangicTarihi: string; vardiyaBaslangicDk: number; vardiyaBitisDk: number; calismaGunleri: number[]; gunSayisi: number }
export interface Istasyon { kod: string; makine: number }
// Adımın isteğe bağlı alanları: akışlı adım (devirAdet), alternatif istasyon, elle bölme (parça adetleri), kişi kaynağı.
export interface Adim {
  seq: number; istasyon?: string; hazirlikDk?: number; cevrimDk?: number; fasonGun?: number;
  bagimlilik?: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdet?: number; alternatifler?: string[]; parcaAdetleri?: number[]; kisi?: string;
}
export interface Emir { no: string; adet: number; oncelik: number; baslangicGun: number; teslimGun: number; elleSira?: number; adimlar: Adim[] }
// Kilitli ya da dondurulmuş iş: kod senaryodaki bir adımsa o adım yerinde kalır, değilse kaynağı yalnız işgal eder.
export interface SabitIs { kod: string; kaynak: string; basDk: number; bitDk: number }
export interface Ayar { kural: MotorKurali; yon: 'ileri' | 'geri'; tamponGun: number }

// Kaynak adı `<istasyon kodu>/<sıra>`; zaman ekseni 0 = ilk gün 00:00, dakika. Tarayıcıda gün kesri vardiya içi orana çevrilir.
export interface Normal {
  kaynakSirasi: Record<string, string[]>;
  isKaynak: Record<string, string>;
  sureDk: Record<string, number>;
  mutlak: Record<string, [number, number]>;
  ihlal: string[];
  yerlesmeyen: string[];
}
export interface Senaryo {
  ad: string; aciklama: string; ayar: Ayar; emirler: Emir[];
  // Genişleme alanları: tatil günü (fikstürün ilk gününden), istasyon verimi (%), kişi kaynakları, sabit işler.
  tatilGunleri?: number[]; verimYuzde?: Record<string, number>; kisiler?: string[]; sabitler?: SabitIs[];
  sunucuAltin: Normal | null; tarayiciAltin: Normal | null; beklenenFark: string[] | null;
}
// genisleme: yalnız sunucu motorunda ölçülmüş senaryolar (tarayiciAltin ve beklenenFark null). Tarayıcı testi bu alanları depoya
// koyunca senaryo senaryolar listesine taşınır ve fark yazılır.
export interface Fikstur { takvim: Takvim; istasyonlar: Istasyon[]; senaryolar: Senaryo[]; genisleme: Senaryo[] }
export interface Satir { kod: string; kaynak: string; bas: number; bit: number; dk: number }

const GUN_DK = 24 * 60;

export const isKodu = (e: Emir, a: Adim): string => `${e.no}/${a.seq}`;
export const adimSuresiDk = (e: Emir, a: Adim): number => (a.hazirlikDk ?? 0) + e.adet * (a.cevrimDk ?? 0);
export const baslangicDk = (e: Emir): number => e.baslangicGun * GUN_DK;
export const teslimDk = (t: Takvim, e: Emir): number => e.teslimGun * GUN_DK + t.vardiyaBitisDk;
export const yuvarla = (x: number): number => Math.round(x * 100) / 100;

export function tarih(t: Takvim, gun: number): string {
  const [y, a, g] = t.baslangicTarihi.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10);
}

// Çalışma günleri fikstürün ilk gününden sayılır (0 = pazartesi); tatil günü çalışma vermez.
export function takvimAraliklari(t: Takvim, tatilGunleri: readonly number[] = []): { baslangic: number; bitis: number }[] {
  const l: { baslangic: number; bitis: number }[] = [];
  for (let g = 0; g < t.gunSayisi; g += 1) {
    if (t.calismaGunleri.includes(g % 7) && !tatilGunleri.includes(g)) l.push({ baslangic: g * GUN_DK + t.vardiyaBaslangicDk, bitis: g * GUN_DK + t.vardiyaBitisDk });
  }
  return l;
}

// Tarayıcı zamanı gün cinsindendir (tam sayı gün, kesir vardiyanın o günkü kapasitesine oranı); tam sayıda başlangıç o günün başına,
// bitiş önceki günün sonuna düşer.
export function tarayiciDakikasi(t: Takvim, gun: number, bitis: boolean): number {
  const vardiya = t.vardiyaBitisDk - t.vardiyaBaslangicDk;
  const g = bitis ? Math.ceil(gun - 1e-9) - 1 : Math.floor(gun + 1e-9);
  return yuvarla(g * GUN_DK + t.vardiyaBaslangicDk + (gun - g) * vardiya);
}

export function normalBicim(emirler: readonly Emir[], satirlar: readonly Satir[], yerlesmeyen: readonly string[]): Normal {
  const sirali = [...satirlar].sort((a, b) => a.bas - b.bas || (a.kod < b.kod ? -1 : 1));
  const n: Normal = { kaynakSirasi: {}, isKaynak: {}, sureDk: {}, mutlak: {}, ihlal: [], yerlesmeyen: [...yerlesmeyen].sort() };
  for (const s of sirali) {
    (n.kaynakSirasi[s.kaynak] ??= []).push(s.kod);
    n.isKaynak[s.kod] = s.kaynak;
    n.sureDk[s.kod] = yuvarla((n.sureDk[s.kod] ?? 0) + s.dk);
    n.mutlak[s.kod] = [Math.min(n.mutlak[s.kod]?.[0] ?? Infinity, s.bas), Math.max(n.mutlak[s.kod]?.[1] ?? -Infinity, s.bit)];
  }
  for (const e of emirler) {
    const adimlar = e.adimlar.filter((a) => a.fasonGun === undefined);
    const kodlar = adimlar.map((a) => isKodu(e, a));
    // Bekleyen adım öncülü bitmeden başlayamaz; akışlı adım başlayabilir ama öncülü bitmeden bitemez; bağımsız adımda sınır yok.
    for (let i = 1; i < kodlar.length; i += 1) {
      const tur = adimlar[i]!.bagimlilik ?? 'bekleyen';
      const onceki = n.mutlak[kodlar[i - 1]!];
      const simdiki = n.mutlak[kodlar[i]!];
      if (!onceki || !simdiki || tur === 'bagimsiz') continue;
      if (tur === 'bekleyen' ? simdiki[0] < onceki[1] - 0.01 : simdiki[1] < onceki[1] - 0.01) n.ihlal.push(`${kodlar[i]} < ${kodlar[i - 1]}`);
    }
  }
  return n;
}

// İki normal çıktının ayrıştığı alanlar (kaynakSirasi[IS-1/1], mutlak[E1/20] ...); boşsa fark yok.
export function farklar(a: Normal, b: Normal): string[] {
  const f: string[] = [];
  const ayri = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
  for (const alan of ['kaynakSirasi', 'isKaynak', 'sureDk', 'mutlak'] as const) {
    const x: Record<string, unknown> = a[alan];
    const y: Record<string, unknown> = b[alan];
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) if (ayri(x[k], y[k])) f.push(`${alan}[${k}]`);
  }
  if (ayri(a.ihlal, b.ihlal)) f.push('ihlal');
  if (ayri(a.yerlesmeyen, b.yerlesmeyen)) f.push('yerlesmeyen');
  return f;
}

export const fikstur = fiksturJson as unknown as Fikstur;
