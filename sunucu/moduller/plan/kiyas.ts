import type { Db } from '#cekirdek/db.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { bosluk, planOlcusu, type GoruntuSonucu, type PlanOlcusu } from './kiyas-kurallar.ts';
import { motorPlaniDenetle } from './motor-sinir.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle, type Motor, type MotorDurumu, type MotorPlani } from './plan-motoru.ts';
import { planCozumKaynagi } from './planlama-servis.ts';

// Plan motoru kıyas seti (1475 a). Görüntü, sunucu çözücüsünün aynı anda kuracağı motor girdisidir (sunucunun iç okuyucusuyla, motor ayarı ve
// ölçeğiyle) ve planlama çalışmasındaki plandır. Görüntü gerçek atölye verisi taşır: depoya girmez, komut onu depo dışındaki klasöre yazar.
export const GORUNTU_BICIMI = 'plan-kiyas-1';
export interface KiyasGoruntusu { bicim: typeof GORUNTU_BICIMI; alinma: string; st: MotorDurumu; calismaPlani: MotorPlani | null }

export async function kiyasGoruntusuAl(db: Db, simdi: number = Date.now()): Promise<KiyasGoruntusu | null> {
  const g = planGirdisi({ ...(await planCozumKaynagi(db, simdi)), bugun: tesisGunu(simdi) }, simdi);
  if (g === null) return null;
  return { bicim: GORUNTU_BICIMI, alinma: new Date(simdi).toISOString(), st: g.st, calismaPlani: calismaPlani(g.S['plan']) };
}

// Çalışmanın planı motorun taban biçiminde değilse (hiç plan kurulmamış, eski kayıt) kıyasta çalışma sütunu boş kalır.
function calismaPlani(p: unknown): MotorPlani | null {
  if (p === null || p === undefined) return null;
  try { return motorPlaniDenetle(p, 'taban'); } catch { return null; }
}

export function goruntuMu(x: unknown): x is KiyasGoruntusu {
  return typeof x === 'object' && x !== null && (x as { bicim?: unknown }).bicim === GORUNTU_BICIMI && typeof (x as { st?: unknown }).st === 'object';
}

// Her koşu yeni motor bağlamında, girdinin kopyasıyla: sunucu iş parçacığındaki gibi W0 ile birleşir (plan-motoru.ts ISCI).
function hazirla(m: Motor, st: MotorDurumu): MotorDurumu {
  const k = JSON.parse(JSON.stringify(st)) as MotorDurumu;
  return m.stHazirla({ ...k, w: { ...m.W0, ...((k['w'] as Record<string, unknown> | undefined) ?? {}) } });
}
function kos(st: MotorDurumu, kip: 'yeni' | 'sabit', taban: MotorPlani | null, ref: MotorPlani | null): { olcu: PlanOlcusu; islem: number; altSinir: number | null } {
  const m = motorYukle();
  const s = hazirla(m, st);
  const t0 = performance.now();
  const p = m.schedule(s, kip, taban);
  const sure = performance.now() - t0;
  const e = m.evaluate(p, s, ref, false) as Record<string, unknown>;
  const fail = (p.fail ?? []).length;
  const lb = m.lowerBound(s).wT;
  return { olcu: planOlcusu(e, fail, sure), islem: Object.keys(p.ops).length + fail, altSinir: Number.isFinite(lb) ? lb : null };
}

export function goruntuKos(ad: string, x: KiyasGoruntusu): GoruntuSonucu {
  const motor = kos(x.st, 'yeni', null, x.calismaPlani);
  const calisma = x.calismaPlani === null ? null : kos(x.st, 'sabit', x.calismaPlani, x.calismaPlani).olcu;
  const D = (x.st['D'] ?? {}) as { siparisler?: unknown[] };
  return {
    ad, islem: motor.islem, siparis: (D.siparisler ?? []).length, motor: motor.olcu, calisma, altSinir: motor.altSinir,
    bosluk: bosluk(motor.olcu.agirlikliGecikme, motor.altSinir),
  };
}
