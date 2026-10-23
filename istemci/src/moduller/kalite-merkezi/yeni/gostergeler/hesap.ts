import { devDurumu, icinde, karantina, tedarikciPpm, bugun, type KmTon } from '../kurallar.ts';
import { INSP_TUR, KAPALI } from '../sabitler.ts';
import { seriler, type Seri } from '../spc.ts';
import type { KmVerisi } from '../veri.ts';

// Kalite göstergelerinin hesapları (uygulamadaki vDash): oranlar yüzde tam sayı; kayıt yoksa null, sıfır uydurulmaz.
export interface Gostergeler {
  ilkGecis: number | null; ilkGecisSayisi: number;
  lotKabul: number | null; lotSayisi: number;
  ppm: ReturnType<typeof tedarikciPpm>;
  karantinaSayisi: number; karantinaMiktari: number; karantinaTonu: KmTon;
  acikNcr: number; kritikNcr: number;
  gecersizCihaz: number; yaklasanCihaz: number;
  kapilar: { tur: string; n: number; ret: number }[];
  sevkeHazir: number;
  yetenekUyarilari: Seri[];
  olculenVar: boolean;
  bos: boolean;
}

const oran = (pay: number, payda: number): number | null => (payda ? Math.round((100 * pay) / payda) : null);

export function gostergeleriHesapla(v: KmVerisi, simdi: string = bugun()): Gostergeler {
  const acik = v.ncr.filter((x) => x.durum !== KAPALI);
  const i30 = v.insp.filter((i) => icinde(i.tarih, 30, simdi) && i.sonuc !== 'Devam ediyor');
  const l90 = v.lot.filter((l) => l.tip !== 'reset' && !l.yenidenSunum && icinde(l.tarih, 90, simdi));
  const q = karantina(v, simdi);
  const cihaz = v.dev.map((d) => devDurumu(d, simdi));
  const i90 = v.insp.filter((i) => icinde(i.tarih, 90, simdi));
  return {
    ilkGecis: oran(i30.filter((i) => i.sonuc === 'Kabul').length, i30.length), ilkGecisSayisi: i30.length,
    lotKabul: oran(l90.filter((l) => l.karar === 'Kabul').length, l90.length), lotSayisi: l90.length,
    ppm: tedarikciPpm(v, 90, simdi),
    karantinaSayisi: q.length, karantinaMiktari: q.reduce((a, x) => a + x.miktar, 0),
    karantinaTonu: q.some((x) => x.ton === 'kotu') ? 'kotu' : q.length ? 'uyari' : 'iyi',
    acikNcr: acik.length, kritikNcr: acik.filter((x) => x.ciddiyet === 'Kritik').length,
    gecersizCihaz: cihaz.filter((s) => s.ton === 'kotu').length, yaklasanCihaz: cihaz.filter((s) => s.ton === 'uyari').length,
    kapilar: INSP_TUR.map((t) => {
      const a = i90.filter((i) => i.tur === t);
      return { tur: t, n: a.length, ret: a.filter((i) => i.sonuc === 'Ret').length };
    }),
    sevkeHazir: i90.filter((i) => i.tur === 'Final' && i.sonuc === 'Kabul').length,
    olculenVar: seriler(v).some((s) => s.n >= 10),
    yetenekUyarilari: seriler(v).filter((s) => s.n >= 10 && s.durum.ton !== 'iyi').sort((a, b) => (a.cpk ?? 9) - (b.cpk ?? 9)),
    bos: !v.ncr.length && !v.dev.length && !v.insp.length && !v.sup.length,
  };
}

// Eşik tonları uygulamadaki gibi: oran 95 ve üstü iyi, 85 ve üstü uyarı; ppm 500 ve altı iyi, 2000 ve altı uyarı.
export const oranTonu = (v: number | null): KmTon => (v === null ? '' : v >= 95 ? 'iyi' : v >= 85 ? 'uyari' : 'kotu');
export const ppmTonu = (v: number | null): KmTon => (v === null ? '' : v <= 500 ? 'iyi' : v <= 2000 ? 'uyari' : 'kotu');

// Aylık ilk geçiş: muayene (devam eden hariç) ve lot birlikte; ayda kayıt yoksa null.
export function aylikIlkGecis(v: Pick<KmVerisi, 'insp' | 'lot'>, anahtarlar: readonly string[]): (number | null)[] {
  return anahtarlar.map((k) => {
    const a = v.insp.filter((i) => (i.tarih ?? '').startsWith(k) && i.sonuc !== 'Devam ediyor');
    const l = v.lot.filter((x) => x.tip !== 'reset' && !x.yenidenSunum && (x.tarih ?? '').startsWith(k));
    return oran(a.filter((i) => i.sonuc === 'Kabul').length + l.filter((x) => x.karar === 'Kabul').length, a.length + l.length);
  });
}

// Hata tipi Pareto: adet azalan, kümülatif yüzde.
export function pareto(ncr: KmVerisi['ncr']): { etiket: string; adet: number; kumulatif: number }[] {
  const m = new Map<string, number>();
  ncr.forEach((n) => { const k = n.hataTipi || 'Diğer'; m.set(k, (m.get(k) ?? 0) + 1); });
  const L = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const top = L.reduce((s, a) => s + a[1], 0) || 1;
  let c = 0;
  return L.map(([k, adet]) => { c += adet; return { etiket: k.split(' (')[0] ?? k, adet, kumulatif: Math.round((100 * c) / top) }; });
}
