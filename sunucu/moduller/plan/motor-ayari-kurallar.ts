import { MOTOR_AYARI_VARSAYILAN, motorAyarlari, type MotorAyariGovdesi, type MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';
import type { OgrenilenSure } from './ogrenme-kurallar.ts';

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
// D.planAgirlik.fin'de okur (durum.betik agAyar). Finansta TRY faizi yoksa (null) çalışma kaydındaki oran kalır; plan bedel ayarının elle
// finansman oranı 1448 a ile salt okunurdur ve buraya gelmez.
// 1477 a: motorun ufku ve dilimi sistem ayarındandır; motor w.ufukGun ve w.dilimDk'yı okur (engine.betik olcekKur;
// girdi birleşmesi D'yi yeniden kurar, w kalır). Verilmezse kayıttaki kalır.
export interface MotorOlcegi { ufukGun: number; dilimDk: number }
// 1714 (1684 b): öğrenme açıksa ürün ve adım başına süre belirsizliği çalışmanın `ogren` alanıyla gider (girdi.betik stKur motora verir);
// kapalıysa alan boştur, motor varsayılan belirsizlikle (w.mcSigma) kurar. Kayıttan okuyan girdi değeri hep açıkça verir (yoksa null):
// sayfa kaydederse kayda geçen eski değer sonraki planda kullanılmaz. Verilmezse (undefined) çalışmadaki değer korunur; taslağın kendi
// ayar sürümüyle ikinci kez uygulanan çözücü girdisi (plan-cozucusu) taze değeri böyle taşır, taslakta öğrenme kapalıysa boşaltır.
export function calismayaMotorAyari(
  calisma: unknown, ayar: MotorAyarlari, finansmanOraniGun: number | null = null, olcek: MotorOlcegi | null = null,
  ogren?: Readonly<Record<string, OgrenilenSure>> | null,
): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const c = calisma as { D?: unknown };
  if (c.D === null || typeof c.D !== 'object') return calisma;
  const D = c.D as { planTL?: unknown; planAgirlik?: unknown };
  const planTL = D.planTL !== null && typeof D.planTL === 'object' ? D.planTL : {};
  const agirlik = finansmanOraniGun === null ? {}
    : { planAgirlik: { ...(D.planAgirlik !== null && typeof D.planAgirlik === 'object' ? D.planAgirlik : {}), fin: finansmanOraniGun } };
  const w = (c as { w?: unknown }).w;
  const onceki = (c as { ogren?: unknown }).ogren;
  const ogrenilen = ogren !== undefined ? ogren
    : onceki !== null && typeof onceki === 'object' ? onceki as Readonly<Record<string, OgrenilenSure>> : null;
  return {
    ...c, D: { ...D, ...agirlik, planTL: { ...planTL, amac: ayar.amac === 'tl' ? 'tl' : 'sira' } },
    w: { ...(w !== null && typeof w === 'object' ? w : {}), rule: ayar.kural, amac: ayar.amac, ...(olcek ?? {}) },
    ogren: ayar.ogrenme === 'acik' && ogrenilen !== null ? { ...ogrenilen } : {},
  };
}
