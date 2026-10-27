import { MOTOR_AYARI_VARSAYILAN, motorAyarlari, type MotorAyariGovdesi, type MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';

// Plan motoru ayarları (kart 811), saf. Sürüm satırının değerleri jsonb'dir: sonradan eklenen anahtar eski satırda yoktur, o anahtar
// koddaki varsayılanı alır; tanınmayan değer de varsayılana düşer (satır değiştirilemez, düzeltilemez).
export function motorAyariCoz(degerler: Record<string, unknown> | null): MotorAyarlari {
  const sonuc = { ...MOTOR_AYARI_VARSAYILAN };
  if (degerler === null) return sonuc;
  for (const k of Object.keys(MOTOR_AYARI_VARSAYILAN) as (keyof MotorAyarlari)[]) {
    const r = motorAyarlari.shape[k].safeParse(degerler[k]);
    if (r.success) Object.assign(sonuc, { [k]: r.data });
  }
  return sonuc;
}

// Verilen alanlar güncelin üstüne yazılır; değişen yoksa boş (yeni sürüm yazılmaz).
export function motorAyariBirlestir(guncel: MotorAyarlari, g: MotorAyariGovdesi): MotorAyarlari | null {
  const yeni = { ...guncel };
  for (const k of Object.keys(guncel) as (keyof MotorAyarlari)[]) if (g[k] !== undefined) Object.assign(yeni, { [k]: g[k] });
  return motorAyariEsit(guncel, yeni) ? null : yeni;
}

export const motorAyariEsit = (a: MotorAyarlari, b: MotorAyarlari): boolean =>
  (Object.keys(a) as (keyof MotorAyarlari)[]).every((k) => a[k] === b[k]);

// Motor ayarı planlama çalışmasının üstüne yazılır (771 a): TL amacını kayıttaki D.planTL.amac açar ('tl'; durum.betik ymUygula),
// sıralı ayarda kayıt ne derse desin kapalıdır. Okunan kopya değişir; sayfa kaydederse kayıt da bu amacı taşır, motor yine ayarı okur.
export function calismayaMotorAyari(calisma: unknown, ayar: MotorAyarlari): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const c = calisma as { D?: unknown };
  if (c.D === null || typeof c.D !== 'object') return calisma;
  const D = c.D as { planTL?: unknown };
  const planTL = D.planTL !== null && typeof D.planTL === 'object' ? D.planTL : {};
  return { ...c, D: { ...D, planTL: { ...planTL, amac: ayar.amac === 'tl' ? 'tl' : 'sira' } } };
}
