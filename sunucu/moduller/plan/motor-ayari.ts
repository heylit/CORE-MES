import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { MOTOR_KURALLARI, type MotorAyariGovdesi, type MotorAyarlari, type MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { motorAyariBirlestir, motorAyariCoz, motorAyariEsit } from './motor-ayari-kurallar.ts';
import * as s from './sorgular.ts';

// Plan motoru ayarları (kart 811; 773 a, 774 a, 775 b). Ayar değişince yeni sürüm yazılır; açık taslak kendi sürümünde kalır, canlı plan
// ve taslaksız hesap güncel sürümle kurulur.

// Motorun kullanacağı değerler: taslakta taslağın sürümü ve varsa taslağa özel kuralı (830 a), canlıda güncel sürüm.
export async function hedefMotorAyari(db: Db, hedef: s.Hedef): Promise<{ surumId: number | null; degerler: MotorAyarlari }> {
  const r = hedef === null ? await s.motorAyarGuncelSurumu(db) : await s.motorAyarSenaryoSurumu(db, hedef);
  const degerler = motorAyariCoz(r?.degerler ?? null);
  const kural = hedef === null ? null : taslakKurali(await s.motorSenaryoKurali(db, hedef));
  return { surumId: r?.id ?? null, degerler: kural === null ? degerler : { ...degerler, kural } };
}
const taslakKurali = (v: string | null): MotorAyarlari['kural'] | null => (MOTOR_KURALLARI as readonly string[]).includes(v ?? '') ? v as MotorAyarlari['kural'] : null;

export async function motorAyarlari(db: Db, taslak?: number): Promise<MotorAyarlariCevabi> {
  const guncel = await s.motorAyarGuncelSurumu(db);
  let t: s.MotorAyarSurumSatiri | null = null;
  if (taslak !== undefined) {
    if (!(await s.senaryo(db, taslak))) throw bulunamadi('Taslak bulunamadı.');
    t = await s.motorAyarSenaryoSurumu(db, taslak);
  }
  const adlar = await kisiAdlari(db, [guncel, t].flatMap((x) => (x ? [x.yazanKisiId] : [])));
  const disa = (r: s.MotorAyarSurumSatiri | null) => ({
    surumId: r?.id ?? null, degerler: motorAyariCoz(r?.degerler ?? null), yazan: r ? adlar.get(r.yazanKisiId) ?? null : null, zaman: r?.zaman ?? null,
  });
  const g = disa(guncel);
  if (taslak === undefined) return { guncel: g, taslak: null };
  const ts = disa(t);
  // Değerleri aynı olan eski sürüm farklı sayılmaz: "Güncel ayarları uygula" planı değiştirmeyecekse önerilmez.
  return { guncel: g, taslak: { id: taslak, surum: ts, farkli: !motorAyariEsit(g.degerler, ts.degerler), kural: taslakKurali(await s.motorSenaryoKurali(db, taslak)) } };
}

// Değişen alan yoksa sürüm yazılmaz. Açık taslaklar eski sürümde kalır (774 a).
export async function motorAyariYaz(db: Db, k: Kullanici, g: MotorAyariGovdesi): Promise<MotorAyarlariCevabi> {
  // 771 a, 832 a: TL amacı ayarda kapalıdır; para verisi dolunca ayrı kararla açılır.
  if (g.amac === 'tl') throw dogrulama('TL amacı şimdilik kapalı; para verisi dolunca açılır.', 'amac');
  await s.motorAyarYazmaKilidi(db);
  const guncel = await s.motorAyarGuncelSurumu(db);
  const yeni = motorAyariBirlestir(motorAyariCoz(guncel?.degerler ?? null), g);
  if (yeni !== null) await s.motorAyarSurumuYaz(db, yeni, k.id);
  return motorAyarlari(db);
}

// 830 a: taslağa özel kural; aynıysa yazılmaz.
export async function taslakKuraliYaz(db: Db, k: Kullanici, senaryoId: number, kural: MotorAyarlari['kural'] | null): Promise<boolean> {
  if (taslakKurali(await s.motorSenaryoKurali(db, senaryoId)) === kural) return false;
  await s.motorSenaryoKuraliYaz(db, senaryoId, kural, k.id);
  return true;
}

// "Güncel ayarları uygula" (774 a): taslak güncel sürüme bağlanır; hiç sürüm yoksa taslak zaten varsayılandadır.
export async function taslagiGuncelSurumeBagla(db: Db, k: Kullanici, senaryoId: number): Promise<boolean> {
  const guncel = await s.motorAyarGuncelSurumu(db);
  const once = await s.motorAyarSenaryoSurumu(db, senaryoId);
  if (guncel === null || once?.id === guncel.id) return false;
  await s.motorAyarSenaryoyaBagla(db, senaryoId, guncel.id, k.id);
  return true;
}
