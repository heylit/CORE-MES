import type { Db } from '#cekirdek/db.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import {
  PLAN_SISTEM_AYARI_KAPISI, PLAN_SISTEM_AYARLARI, type PlanSistemAyari, type PlanSistemAyariSatiri, type PlanSistemAyarlariCevabi,
} from '#paylasilan/sozlesme/plan.ts';
import { ayarSonlari, modulAyariDegistir, type AyarSonu } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';

// Planlama ayarları sayfasının sistem bölümü (3561; 3557 c, 3560): yalnız plan. ayarları okunur ve yazılır. Ufuk ve dilim plan.sistem-ayari
// (planlama müdürü, yönetici), ötekiler ayarlar.yaz ister; ayarlar.yaz hiçbir planlama rolüne verilmez, yönetici iki kapıyı da taşır.

// Kapı anahtar başınadır: uç ikisinden birini ister, hangisinin yeteceğini bu işlev söyler.
export function sistemAyariYazabilir(k: Kullanici, anahtar: PlanSistemAyari): boolean {
  return islemVarMi(k, PLAN_SISTEM_AYARI_KAPISI[anahtar]) || islemVarMi(k, 'ayarlar.yaz');
}

async function satirlar(db: Db, sonlar: readonly AyarSonu[]): Promise<PlanSistemAyariSatiri[]> {
  const adlar = await kisiAdlari(db, sonlar.flatMap((x) => (x.guncelleyenKisiId === null ? [] : [x.guncelleyenKisiId])));
  return sonlar.map((x) => ({ ayar: x.ayar, guncelleyen: x.guncelleyenKisiId === null ? null : adlar.get(x.guncelleyenKisiId) ?? null, zaman: x.zaman }));
}

export async function sistemAyarlari(db: Db): Promise<PlanSistemAyarlariCevabi> {
  return { ayarlar: await satirlar(db, await ayarSonlari(db, PLAN_SISTEM_AYARLARI)) };
}

export async function sistemAyariniDegistir(
  db: Db, k: Kullanici, anahtar: PlanSistemAyari, deger: boolean | number | string, beklenen: boolean | number | string,
): Promise<PlanSistemAyariSatiri> {
  if (!sistemAyariYazabilir(k, anahtar)) throw yetkiYok();
  await modulAyariDegistir(db, k.id, anahtar, deger as never, beklenen as never, {
    modul: 'plan', yol: '/plan/sistem-ayarlari/:anahtar/degistir', yetki: PLAN_SISTEM_AYARI_KAPISI[anahtar],
  });
  const [satir] = await satirlar(db, await ayarSonlari(db, [anahtar]));
  return satir!;
}
