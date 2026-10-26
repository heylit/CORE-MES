import type { PlanGostergeleri, SenaryoDurumu, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { IzSatiri } from '../../tipler.ts';

// "Geçmiş" ekranı (bugünkü sayfa b-kabuk.betik EKRANLAR gecmis, 03-katman.betik sIz): bölümleri ve değişiklik izinin süzgeci.
export const GECMIS_BOLUMLERI = [['senaryolar', 'Senaryolar', 'flag'], ['iz', 'Değişiklik izi', 'book']] as const satisfies readonly (readonly [string, string, SimgeAdi])[];
export type GecmisBolumu = (typeof GECMIS_BOLUMLERI)[number][0];
export const ILK_GECMIS: GecmisBolumu = 'senaryolar';
export const gecmisBolumuOku = (v: unknown): GecmisBolumu | null => GECMIS_BOLUMLERI.find((x) => x[0] === v)?.[0] ?? null;

// Ekranda en çok 200 satır; kişi süzgeci izdeki kişilerden, ilk görünme sırasıyla.
export const IZ_GOSTERIM = 200;
export const izKisileri = (iz: readonly IzSatiri[]): string[] => [...new Set(iz.map((x) => x.kim))];
export const izSuz = (iz: readonly IzSatiri[], kim: string | null): IzSatiri[] => iz.filter((x) => !kim || x.kim === kim).slice(0, IZ_GOSTERIM);
export const izZamani = (t: number): string =>
  new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Senaryolar (221 c, 641 a): plan modülünün taslakları (`/plan/senaryolar`). Canlıya giden her değişiklik önce bir taslağa düşer; ekran
// taslakları listeler ve canlıyla yan yana karşılaştırır. Kaydetme, onaya gönderme ve canlıya alma Planlama atölyesindedir.
export type Senaryo = SenaryolarCevabi['senaryolar'][number];
export const SENARYO_DURUM_ADI: Record<SenaryoDurumu, [string, 'bilgi' | 'tamam' | 'uyari' | 'pasif']> = {
  acik: ['Taslak', 'bilgi'], onayda: ['Onayda', 'uyari'], canliya_alindi: ['Canlıya alındı', 'tamam'], vazgecildi: ['Vazgeçildi', 'pasif'],
};
// En yeni önde; vazgeçilen ve canlıya alınan sona.
const DURUM_SIRASI: Record<SenaryoDurumu, number> = { onayda: 0, acik: 1, canliya_alindi: 2, vazgecildi: 3 };
export const senaryoSirasi = (l: readonly Senaryo[]): Senaryo[] =>
  [...l].sort((a, b) => DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || b.acilma.localeCompare(a.acilma));
// Taslak canlının eski sürümü üstünde kurulduysa canlıya alırken uyarı çıkar; ekran bunu önceden söyler.
export const eskiTabanli = (s: Senaryo, canliSurum: number): boolean =>
  (s.durum === 'acik' || s.durum === 'onayda') && (s.canliDegisti || s.tabanPlanSurumu !== canliSurum);

// Karşılaştırma en çok üç taslakla; ilk sütun canlıdır.
export const KARSILASTIRMA_SINIRI = 3;
export const karsilastirmaSec = (sec: readonly number[], id: number): number[] =>
  sec.includes(id) ? sec.filter((x) => x !== id) : sec.length >= KARSILASTIRMA_SINIRI ? [...sec] : [...sec, id];

export interface GostergeSatiri { ad: string; birim: string; al: (g: PlanGostergeleri) => number | null; kucukIyi: boolean; basamak: number }
export const GOSTERGE_SATIRLARI: readonly GostergeSatiri[] = [
  { ad: 'Ağırlıklı gecikme', birim: 'sa', al: (g) => g.agirlikliGecikmeSaat ?? null, kucukIyi: true, basamak: 1 },
  { ad: 'Geciken emir', birim: '', al: (g) => g.geciken, kucukIyi: true, basamak: 0 },
  { ad: 'Zamanında', birim: '%', al: (g) => g.zamanindaYuzde, kucukIyi: false, basamak: 0 },
  { ad: 'Toplam ayar', birim: 'sa', al: (g) => g.ayarSaat ?? null, kucukIyi: true, basamak: 1 },
  { ad: 'Ortalama atölye süresi', birim: 'gün', al: (g) => g.ortAtolyeGun, kucukIyi: true, basamak: 1 },
  { ad: 'Yerleşen iş', birim: '', al: (g) => g.yerlesen, kucukIyi: false, basamak: 0 },
  { ad: 'Darboğaz doluluğu', birim: '%', al: (g) => g.darbogaz?.dolulukYuzde ?? null, kucukIyi: true, basamak: 0 },
];
// Canlıya göre fark; değer ya da canlı yoksa ya da fark yoksa null. `iyi` küçük-iyi yönüne göredir.
export function gostergeFarki(canli: number | null, v: number | null, kucukIyi: boolean): { d: number; iyi: boolean } | null {
  if (canli === null || v === null || Math.abs(v - canli) < 1e-6) return null;
  const d = v - canli; return { d, iyi: kucukIyi ? d < 0 : d > 0 };
}

// Tarihi değişen emirlerin birleşimi: her taslağın canlıya göre etkisinden; canlı bitiş ilk taslaktan (hepsinde aynıdır).
export interface EmirFarki { emirNo: string; canli: string | null; senaryo: (string | null | undefined)[] }
export function tarihiDegisenler(l: readonly Senaryo[]): EmirFarki[] {
  const m = new Map<string, EmirFarki>();
  l.forEach((s, i) => {
    for (const e of s.etki?.tarihiDegisenEmirler ?? []) {
      const x = m.get(e.emirNo) ?? { emirNo: e.emirNo, canli: e.canli, senaryo: l.map(() => undefined) };
      x.senaryo[i] = e.senaryo; m.set(e.emirNo, x);
    }
  });
  return [...m.values()].sort((a, b) => a.emirNo.localeCompare(b.emirNo, 'tr'));
}
export interface YukFarki { ad: string; canli: number | null; senaryo: (number | null | undefined)[] }
export function yukuDegisenler(l: readonly Senaryo[]): YukFarki[] {
  const m = new Map<string, YukFarki>();
  l.forEach((s, i) => {
    for (const e of s.etki?.yukuDegisenIstasyonlar ?? []) {
      const x = m.get(e.ad) ?? { ad: e.ad, canli: e.canliYuzde, senaryo: l.map(() => undefined) };
      x.senaryo[i] = e.senaryoYuzde; m.set(e.ad, x);
    }
  });
  return [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
export const senaryoZamani = (z: string | null | undefined): string =>
  !z ? '—' : new Date(z).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
