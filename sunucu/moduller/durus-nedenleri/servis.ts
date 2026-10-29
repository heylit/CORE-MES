import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type {
  DurusNedeni, DurusNedeniGuncelleGovdesi, DurusNedeniOlusturGovdesi, DurusNedenleriCevabi,
  HurdaNedeni, HurdaNedeniGuncelleGovdesi, HurdaNedeniOlusturGovdesi, HurdaNedenleriCevabi,
} from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { DURUS_ONEKI, HURDA_ONEKI, cagriyiDuzenle, kodOner, sabitKodEngeli } from './kurallar.ts';
import {
  durusKodlariniOku, durusNedeniEkle, durusNedeniVarMi, durusNedeniniGuncelle, durusNedeniniOku, durusNedenleriniOku,
  hurdaKodlariniOku, hurdaNedeniEkle, hurdaNedeniVarMi, hurdaNedeniniGuncelle, hurdaNedeniniOku, hurdaNedenleriniOku,
} from './sorgular.ts';

const KOD_CAKISMASI = 'Bu kod başka bir nedende kullanılıyor.';
const NEDEN_YOK = 'Neden bulunamadı.';
const KODLAR = ['durus_nedeni_kod_benzersiz', 'hurda_nedeni_kod_benzersiz'];

// Benzersiz kod çakışması kullanıcının düzeltebileceği durumdur; iletiyi kısıt adından seçeriz.
async function kodCakismasiniCevir<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    const ihlal = kisitIhlali(hata);
    if (ihlal !== null && ihlal.iz.pgKodu === '23505' && ihlal.iz.kisit !== null && KODLAR.includes(ihlal.iz.kisit)) {
      throw cakisma(KOD_CAKISMASI);
    }
    throw hata;
  }
}

function varOlan<T>(kayit: T | null): T {
  if (kayit === null) throw bulunamadi(NEDEN_YOK);
  return kayit;
}

export function durusNedenleriniListele(db: Db, { yalnizAktif }: { yalnizAktif: boolean }): Promise<DurusNedeni[]> {
  return durusNedenleriniOku(db, yalnizAktif);
}

export function durusNedeniGetir(db: Db, id: number): Promise<DurusNedeni | null> {
  return durusNedeniniOku(db, id);
}

export async function durusNedenleriCevabi(db: Db, yalnizAktif: boolean): Promise<DurusNedenleriCevabi> {
  return {
    nedenler: await durusNedenleriniOku(db, yalnizAktif),
    onerilenKod: kodOner(DURUS_ONEKI, await durusKodlariniOku(db)),
  };
}

function cagriyiCoz(govde: DurusNedeniOlusturGovdesi) {
  const sonuc = cagriyiDuzenle({
    kategori: govde.kategori, cagriEkibi: govde.cagriEkibi ?? null, cagriGecikmeDk: govde.cagriGecikmeDk ?? null,
  });
  if ('hata' in sonuc) throw dogrulama(sonuc.hata, 'cagriEkibi');
  return sonuc;
}

function durusYazimi(govde: DurusNedeniOlusturGovdesi) {
  return {
    kod: govde.kod, ad: govde.ad, simge: govde.simge ?? null, kategori: govde.kategori, ...cagriyiCoz(govde),
  };
}

export async function durusNedeniOlustur(db: Db, govde: DurusNedeniOlusturGovdesi): Promise<DurusNedeni> {
  return varOlan(await kodCakismasiniCevir(() => durusNedeniEkle(db, durusYazimi(govde))));
}

export function durusNedeniGuncelle(db: Db, id: number, govde: DurusNedeniGuncelleGovdesi): Promise<DurusNedeni> {
  return kodCakismasiniCevir(() => surumluGuncelle({
    guncelle: () => durusNedeniniGuncelle(db, id, { ...durusYazimi(govde), aktif: govde.aktif, surum: govde.surum }),
    varMi: () => durusNedeniVarMi(db, id),
    bulunamadiIletisi: NEDEN_YOK,
  }));
}

export function hurdaNedenleriniListele(db: Db, { yalnizAktif }: { yalnizAktif: boolean }): Promise<HurdaNedeni[]> {
  return hurdaNedenleriniOku(db, yalnizAktif);
}

export function hurdaNedeniGetir(db: Db, id: number): Promise<HurdaNedeni | null> {
  return hurdaNedeniniOku(db, id);
}

export async function hurdaNedenleriCevabi(db: Db, yalnizAktif: boolean): Promise<HurdaNedenleriCevabi> {
  return {
    nedenler: await hurdaNedenleriniOku(db, yalnizAktif),
    onerilenKod: kodOner(HURDA_ONEKI, await hurdaKodlariniOku(db)),
  };
}

export async function hurdaNedeniOlustur(db: Db, govde: HurdaNedeniOlusturGovdesi): Promise<HurdaNedeni> {
  return varOlan(await kodCakismasiniCevir(() => hurdaNedeniEkle(db, govde.kod, govde.ad)));
}

export async function hurdaNedeniGuncelle(db: Db, id: number, govde: HurdaNedeniGuncelleGovdesi): Promise<HurdaNedeni> {
  const eski = await hurdaNedeniniOku(db, id);
  const engel = eski === null ? null : sabitKodEngeli(eski.kod, govde.kod);
  if (engel !== null) throw cakisma(engel);
  return kodCakismasiniCevir(() => surumluGuncelle({
    guncelle: () => hurdaNedeniniGuncelle(db, id, govde),
    varMi: () => hurdaNedeniVarMi(db, id),
    bulunamadiIletisi: NEDEN_YOK,
  }));
}
