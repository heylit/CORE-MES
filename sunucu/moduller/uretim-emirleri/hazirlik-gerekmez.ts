import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { HazirlikGerekmezCevabi, HazirlikGerekmezGovdesi, HazirlikGerekmezKaldirGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { hazirlikGerekmezIsaretle, hazirlikGerekmezKaldir } from '../projeler/disari.ts';
import { acikEmirIhlali } from './kurallar.ts';
import { durduranMaddeKodlari, hazirlikMaddeTanimlari } from './hazirlik-maddeleri.ts';
import * as s from './sorgular.ts';

// 3642: "Bu emirde gerekmez" işareti. Yetki tek yerdedir: uç bu işlemi ister (GEREKMEZ_YETKISI), matris aynı işlemden `gerekmezYazar` üretir.
// Seçenek değişirse (ör. emir sorumlusu) yalnız bu iki satır değişir. Emir sorumlusu alanı emirde yoktur; ilk sürümde yalnız bu işlem.
export const GEREKMEZ_YETKISI = 'projeler.hazirlik-dagit' as const;
export const gerekmezYazarMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, GEREKMEZ_YETKISI);

export const GEREKMEZ_DURDURAN = 'Durduran madde (CNC, çizim, yayın) "bu emirde gerekmez" ile kapatılamaz.';
export const GEREKMEZ_MADDE_YOK = 'Hazırlık maddesi bulunamadı ya da kapalı.';
const EMIR_YOK = 'Üretim emri bulunamadı.';

async function emirVeMadde(db: Db, emirId: number, madde: string): Promise<void> {
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const ihlal = acikEmirIhlali(e.durum, e.arsiv);
  if (ihlal !== null) throw cakisma(ihlal);
  const tanim = (await hazirlikMaddeTanimlari(db)).find((m) => m.kod === madde);
  if (tanim === undefined || !(tanim.acik || tanim.durduran)) throw dogrulama(GEREKMEZ_MADDE_YOK, 'madde');
  if ((await durduranMaddeKodlari(db)).has(madde)) throw dogrulama(GEREKMEZ_DURDURAN, 'madde');
}

export async function gerekmezIsaretle(db: Db, kullanici: Kullanici, emirId: number, g: HazirlikGerekmezGovdesi): Promise<HazirlikGerekmezCevabi> {
  await emirVeMadde(db, emirId, g.madde);
  return hazirlikGerekmezIsaretle(db, kullanici.id, { emriId: emirId, madde: g.madde, gerekce: g.gerekce });
}

export async function gerekmezKaldir(db: Db, kullanici: Kullanici, emirId: number, g: HazirlikGerekmezKaldirGovdesi): Promise<HazirlikGerekmezCevabi> {
  await emirVeMadde(db, emirId, g.madde);
  await hazirlikGerekmezKaldir(db, kullanici.id, { emriId: emirId, madde: g.madde });
  return { iptalEdilen: 0 };
}
