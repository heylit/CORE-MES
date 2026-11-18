import { z } from 'zod';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { KADEME_BIRIMLERI, KADEME_GUN_EN_COK, KADEME_KAYNAK_ANAHTARLARI, KADEME_SAYACLARI } from './kademe-sabitleri.ts';

export * from './kademe-sabitleri.ts';

// Kademeli uyarı (3405 a): kaynak başına ayar, Açık takipler ve kişinin Gecikenlerim listesi. Ayar okuma ve yazma
// `bildirim.kademe-yonet` ister; kişinin listesi yalnız oturumdur ve yalnız kaynağı okuyabildiği kayıtları verir (Risk K2).

const KIMLIK = z.number().int().positive().max(2147483647);
const gun = z.number().int().min(0).max(KADEME_GUN_EN_COK).nullable();
const kademeNo = z.number().int().min(0).max(5);

export const kademeKaynagiParametresi = z.object({ kaynak: z.enum(KADEME_KAYNAK_ANAHTARLARI) });

export const kademeAyarSatiri = z.object({
  kaynak: z.enum(KADEME_KAYNAK_ANAHTARLARI),
  ad: z.string(),
  grup: z.string(),
  sayac: z.enum(KADEME_SAYACLARI),
  asama: z.union([z.literal(1), z.literal(2)]),
  para: z.boolean(),
  acik: z.boolean(),
  k2Gun: gun,
  k3Gun: gun,
  k3Birim: z.enum(KADEME_BIRIMLERI),
  k4Gun: gun,
  k5Gun: gun,
  epostaKademe: z.number().int().min(2).max(5),
  serit: z.boolean(),
  kapatilamaz: z.boolean(),
  yoneticiRolId: KIMLIK.nullable(),
  // Satırı yoksa katalog varsayılanı geçer.
  varsayilan: z.boolean(),
  surum: surumSemasi,
  degistiren: z.string().nullable(),
  degisti: zamanSemasi.nullable(),
  // Açık takipteki ve Gecikti ya da sonrasındaki kayıt sayısı; kaynak kablosuzsa (sorgusu bağlı değil) null.
  takipte: z.number().int().nonnegative().nullable(),
  gecikti: z.number().int().nonnegative().nullable(),
});
export type KademeAyarSatiri = z.output<typeof kademeAyarSatiri>;

export const kademeAyarlariCevabi = z.object({
  kaynaklar: z.array(kademeAyarSatiri),
  roller: z.array(z.object({ id: KIMLIK, ad: z.string() })),
});
export type KademeAyarlariCevabi = z.output<typeof kademeAyarlariCevabi>;

export const kademeAyarDegistirGovdesi = z.object({
  acik: z.boolean(),
  k2Gun: gun,
  k3Gun: gun,
  // Eski istemci birimi göndermez: gün sayılır.
  k3Birim: z.enum(KADEME_BIRIMLERI).default('gun'),
  k4Gun: gun,
  k5Gun: gun,
  epostaKademe: z.number().int().min(2).max(5),
  serit: z.boolean(),
  kapatilamaz: z.boolean(),
  yoneticiRolId: KIMLIK.nullable(),
  surum: surumSemasi,
}).strict();
export type KademeAyarDegistirGovdesi = z.output<typeof kademeAyarDegistirGovdesi>;

export const kademeTakipSatiri = z.object({
  kaynak: z.enum(KADEME_KAYNAK_ANAHTARLARI),
  kayit: z.string(),
  no: z.string(),
  baslik: z.string(),
  yol: z.string(),
  sonGun: tarihSemasi.nullable(),
  baslangic: tarihSemasi.nullable(),
  kademe: kademeNo,
  // İş günü; gecikmenin ilk günü 1. Gecikmemiş kayıtta null.
  gecikmeGun: z.number().int().nonnegative().nullable(),
});
export type KademeTakipSatiri = z.output<typeof kademeTakipSatiri>;

export const gecikenlerimCevabi = z.object({ kayitlar: z.array(kademeTakipSatiri) });
export type GecikenlerimCevabi = z.output<typeof gecikenlerimCevabi>;

// Açık takipler en çok 500 satırdır (en geciken önde); kesik true ise liste tam değildir.
// Kimde: işi yapanlar, K4 ve sonrasında yöneticiler de (ad); kişi listesi yalnız bütün takipleri görene döner.
export const acikTakiplerCevabi = z.object({ kayitlar: z.array(kademeTakipSatiri.extend({ kimde: z.array(z.string()) })), kesik: z.boolean() });
export type AcikTakiplerCevabi = z.output<typeof acikTakiplerCevabi>;

export const ACIK_TAKIP_EN_COK = 500;
