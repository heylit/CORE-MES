import { kapaliGun, kapaliGunEtiketi, type Tatiller } from '../../../../../../arkon/web/src/data/tatil.ts';
import { istasyonBul } from './tesis.ts';
import type { Plant, PlannedDown, Shift } from './tipler.ts';

// Vardiya ve planlı duruş hesapları (ortak-ayarlar.ts hm2min, currentShift, shiftWindows, expandDown, downWindows, downNow,
// downNext, unionMs). Eski ekranda ayarlar modül değişkenindeydi; burada girdi olarak verilir, sonuç aynıdır (esitlik testi).

export interface Aralik { s: number; e: number }
export interface VardiyaPenceresi extends Aralik { breaks: Aralik[]; name: string }
export interface AnlikVardiya extends Aralik { name: string; breaks: Aralik[]; label: string; tanimsiz: boolean }
export interface DurusGerceklesmesi extends Aralik { d: PlannedDown }

const GUN = 864e5;

export const saatDakika = (t: unknown): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

const vardiyaUzunlugu = (a: number, b: number): number => (((b - a + 1440) % 1440) || 1440) * 60e3;

// Aktif vardiya tanımı yoksa varsayılan uydurulmaz: "Vardiya tanımsız" döner, OEE ve vardiya süresi hesaplanmaz.
export function anlikVardiya(simdi: number, vardiyalar: readonly Shift[], tatiller: Tatiller): AnlikVardiya {
  const d = new Date(simdi);
  const dakika = d.getHours() * 60 + d.getMinutes();
  const gun0 = new Date(d).setHours(0, 0, 0, 0);
  if (!vardiyalar.length) return { name: '—', s: gun0, e: gun0 + GUN, breaks: [], label: 'Vardiya tanımsız', tanimsiz: true };
  for (const v of vardiyalar) {
    const a = saatDakika(v.start);
    const b = saatDakika(v.end);
    const gecer = a >= b;
    const icinde = gecer ? (dakika >= a || dakika < b) : (dakika >= a && dakika < b);
    if (!icinde) continue;
    let s = gun0 + a * 60e3;
    if (gecer && dakika < b) s -= GUN;
    if (kapaliGun(tatiller, s)) continue;
    const e = s + vardiyaUzunlugu(a, b);
    const breaks = (v.breaks ?? []).map((x) => {
      let t = new Date(s).setHours(0, 0, 0, 0) + saatDakika(x.at) * 60e3;
      if (t < s) t += GUN;
      return { s: t, e: t + (Number(x.min) || 0) * 60e3 };
    }).filter((x) => x.s < e);
    return { name: v.name, s, e, breaks, label: `Vardiya ${v.name} · ${v.start} – ${v.end}`, tanimsiz: false };
  }
  const kapali = kapaliGun(tatiller, gun0);
  return { name: '—', s: gun0, e: gun0 + GUN, breaks: [], label: kapali ? kapaliGunEtiketi(kapali) : 'Vardiya dışı', tanimsiz: false };
}

// Rapor aralığındaki vardiya pencereleri; kapalı günde başlayan vardiya yoktur.
export function vardiyaPencereleri(from: number, to: number, vardiyalar: readonly Shift[], tatiller: Tatiller): VardiyaPenceresi[] {
  const cikti: VardiyaPenceresi[] = [];
  for (let gun = new Date(from).setHours(0, 0, 0, 0) - GUN; gun < to; gun += GUN) {
    for (const v of kapaliGun(tatiller, gun) ? [] : vardiyalar) {
      const a = saatDakika(v.start);
      const b = saatDakika(v.end);
      const s0 = gun + a * 60e3;
      const e0 = s0 + vardiyaUzunlugu(a, b);
      if (e0 <= from || s0 >= to) continue;
      const breaks = (v.breaks ?? []).map((x) => {
        let t = gun + saatDakika(x.at) * 60e3;
        if (t < s0) t += GUN;
        return { s: t, e: t + (Number(x.min) || 0) * 60e3 };
      });
      cikti.push({ s: s0, e: e0, breaks, name: v.name });
    }
  }
  return cikti.sort((x, y) => x.s - y.s);
}

export function durusUygulanir(d: PlannedDown | null | undefined, istasyon: string, tesis: Plant): boolean {
  if (!d || d.active === false) return false;
  if (d.scope === 'all') return true;
  return d.scope === 'wc' ? d.target === istasyonBul(tesis, istasyon).wc : d.target === istasyon;
}

// Bir planlı duruş kaydının [from, to) içindeki gerçekleşmeleri (tekrarlı kayıtlar günlük ya da haftalık açılır).
export function durusGerceklesmeleri(d: PlannedDown, from: number, to: number): DurusGerceklesmesi[] {
  const cikti: DurusGerceklesmesi[] = [];
  const uzunluk = d.to - d.from;
  if (!(uzunluk > 0) || d.active === false) return cikti;
  if (!d.rep || d.rep === 'none') {
    if (d.to > from && d.from < to) cikti.push({ s: d.from, e: d.to, d });
    return cikti;
  }
  const t0 = new Date(d.from);
  const saat = t0.getHours();
  const dk = t0.getMinutes();
  for (let gun = new Date(from - uzunluk).setHours(0, 0, 0, 0); gun < to; gun += GUN) {
    const s0 = new Date(gun).setHours(saat, dk, 0, 0);
    if (s0 < d.from - 60e3 || (d.until && s0 > d.until)) continue;
    if (d.rep === 'weekly' && !(d.days ?? []).includes(new Date(s0).getDay())) continue;
    if (s0 + uzunluk > from && s0 < to) cikti.push({ s: s0, e: s0 + uzunluk, d });
  }
  return cikti;
}

export function durusPencereleri(istasyon: string, from: number, to: number, duruslar: readonly PlannedDown[], tesis: Plant): DurusGerceklesmesi[] {
  return duruslar.filter((d) => durusUygulanir(d, istasyon, tesis)).flatMap((d) => durusGerceklesmeleri(d, from, to)).sort((a, b) => a.s - b.s);
}

export const suankiDurus = (istasyon: string, t: number, duruslar: readonly PlannedDown[], tesis: Plant): DurusGerceklesmesi | null =>
  durusPencereleri(istasyon, t, t + 1, duruslar, tesis).find((w) => w.s <= t && w.e > t) ?? null;

export const siradakiDurus = (istasyon: string, t: number, duruslar: readonly PlannedDown[], tesis: Plant, icinde?: number): DurusGerceklesmesi | null =>
  durusPencereleri(istasyon, t, t + (icinde || 8 * 3600e3), duruslar, tesis).find((w) => w.s > t) ?? null;

// Aralıkların birleşiminin [a, b] içindeki toplam süresi.
export function birlesimSuresi(liste: readonly Aralik[], a: number, b: number): number {
  const kirpik = liste.map((x): [number, number] => [Math.max(a, x.s), Math.min(b, x.e)]).filter((x) => x[1] > x[0]).sort((x, y) => x[0] - y[0]);
  let toplam = 0;
  let cs = -1;
  let ce = -1;
  for (const [s0, e0] of kirpik) {
    if (s0 > ce) {
      if (ce > cs) toplam += ce - cs;
      cs = s0;
      ce = e0;
    } else ce = Math.max(ce, e0);
  }
  if (ce > cs) toplam += ce - cs;
  return toplam;
}
