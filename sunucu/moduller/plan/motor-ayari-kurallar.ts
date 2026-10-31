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

// Motor ayarı planlama çalışmasının üstüne yazılır (771 a, 776 b): TL amacını kayıttaki D.planTL.amac açar ('tl'; durum.betik ymUygula),
// sıralı ayarda kayıt ne derse desin kapalıdır; sıralama kuralı w.rule'dur (girdi.betik stKur). Girdi birleşmesi D'yi Reçete ve Rota kaydından
// yeniden kurunca planTL düşebilir: amaç w.amac ile de gider, motor onu kayıttakinin önüne koyar (durum.betik ymUygula). Okunan kopya değişir;
// sayfa kaydederse kayıt da bunları taşır, motor yine ayarı okur.
// 1383 a: finansman oranı finansın TRY faizinden gelir (günlük yüzde, finansmanın tek tanımıyla); motor ve planlama sayfası onu
// D.planAgirlik.fin'de okur (durum.betik agAyar). Finansta TRY faizi yoksa (null) kayıttaki elle oran kalır.
export function calismayaMotorAyari(calisma: unknown, ayar: MotorAyarlari, finansmanOraniGun: number | null = null): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const c = calisma as { D?: unknown };
  if (c.D === null || typeof c.D !== 'object') return calisma;
  const D = c.D as { planTL?: unknown; planAgirlik?: unknown };
  const planTL = D.planTL !== null && typeof D.planTL === 'object' ? D.planTL : {};
  const agirlik = finansmanOraniGun === null ? {}
    : { planAgirlik: { ...(D.planAgirlik !== null && typeof D.planAgirlik === 'object' ? D.planAgirlik : {}), fin: finansmanOraniGun } };
  const w = (c as { w?: unknown }).w;
  return {
    ...c, D: { ...D, ...agirlik, planTL: { ...planTL, amac: ayar.amac === 'tl' ? 'tl' : 'sira' } },
    w: { ...(w !== null && typeof w === 'object' ? w : {}), rule: ayar.kural, amac: ayar.amac },
  };
}
