import { z } from 'zod';
import { gizli } from '../gizli.ts';
import { kullaniciSemasi } from '../kullanici.ts';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { zamanSemasi } from '../zaman.ts';

const KULLANICI_ADI = z.string().trim().min(1, 'Kullanıcı adı zorunlu.').max(80);

// Yönetici parolayla, öteki kullanıcı PIN'le girer (ADR 0012); hangisinin geçerli olduğuna sunucu karar verir.
export const girisGovdesi = z
  .object({
    kullaniciAdi: KULLANICI_ADI,
    parola: gizli(z.string().min(1, 'Parola zorunlu.').max(200)).optional(),
    pin: gizli(z.string().min(1, 'PIN zorunlu.').max(20)).optional(),
  })
  .refine((g) => (g.parola === undefined) !== (g.pin === undefined), { message: 'PIN ya da parola girin.', path: ['pin'] });

// Yöneticinin verdiği geçici PIN oturum açmaz: kişi aynı ekranda kendi PIN'ini belirler, oturum o zaman açılır.
export const pinBelirleGovdesi = z.object({
  kullaniciAdi: KULLANICI_ADI,
  geciciPin: gizli(z.string().min(1, 'Geçici PIN zorunlu.').max(20)),
  yeniPin: gizli(z.string().max(20)),
});

// Kişinin kendi parolasını değiştirmesi: eski parola girişle aynı bekleme kuralına tabidir.
export const kendiParolaGovdesi = z.object({ eskiParola: gizli(z.string().max(200)), yeniParola: gizli(z.string().max(200)) });
export const parolaCevabi = z.object({ tamam: z.literal(true) });

// Kişinin kendi PIN'i: eski olarak geçerli PIN ya da parola; girişle aynı bekleme kuralına tabidir.
export const kendiPinGovdesi = z.object({ eski: gizli(z.string().max(200)), yeniPin: gizli(z.string().max(20)) });

// Oturum yoksa kullanici null döner; açılış sorgusu 401 üretmez.
export const oturumCevabi = z.object({ kullanici: kullaniciSemasi.nullable() });
export const girisCevabi = oturumCevabi.extend({ pinBelirlenecek: z.literal(true).optional() });

// Çıkış gövdesiz cevap verir (204).
export const cikisCevabi = z.undefined();

// Hesap kilidi: ad, bütün cihazlardan art arda hatalı denemeden sonra bir süre kilitlenir. Liste yalnız etkin kilitleri verir;
// açma kilidin kimliğiyle yapılır (ad bir kişiye bağlı olmayabilir). Açan kişi ve an sunucudan gelir.
export const hesapKilidiSemasi = z.object({
  id: z.number().int(),
  kullaniciAdi: z.string(),
  kilitlendi: zamanSemasi,
  bitis: zamanSemasi,
});
export const hesapKilitleriSorgusu = z.object({ ...sayfaSorguAlanlari });
export const hesapKilitleriCevabi = listeCevapSemasi(hesapKilidiSemasi);
export const hesapKilidiParametresi = z.object({ id: z.coerce.number().int().positive() });
export const hesapKilidiAcCevabi = z.object({ acilan: z.number().int().min(1) });

// Akıllı saat (kart #1632). Saat eşleşme isteği açar ve 6 rakamlı kodu gösterir; kişi kodu Profil'de onaylar; saat isteğin
// gizli anahtarıyla sorar ve onaylanmışsa yalnız saat okuma uçlarını açan, en çok 12 saat geçerli belirteci bir kez alır.
// Kod, anahtar ve belirteç denetim kaydına girmez (gizli gövde alanı; cevaplar kaydedilmez).
const SAAT_KODU = z.string().regex(/^[0-9]{6}$/, 'Kod 6 rakam olmalı.');
const SAAT_ANAHTARI = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/, 'Geçersiz istek.');
export const saatIstegiCevabi = z.object({ istek: SAAT_ANAHTARI, kod: SAAT_KODU, son: zamanSemasi });
export const saatIstegiSorGovdesi = z.object({ istek: gizli(SAAT_ANAHTARI) }).strict();
// Bilinmeyen ya da süresi dolmuş istek 401 alır (cevap değil hata: denetim kaydına girmez).
export const saatIstegiSorCevabi = z.discriminatedUnion('durum', [
  z.object({ durum: z.literal('bekliyor') }),
  z.object({ durum: z.literal('onaylandi'), belirtec: z.string(), son: zamanSemasi, kisi: z.object({ ad: z.string() }) }),
]);
export const saatOnaylaGovdesi = z.object({ kod: gizli(SAAT_KODU) }).strict();
export const saatCihaziSemasi = z.object({ id: z.number().int(), kisiId: z.number().int(), acildi: zamanSemasi, son: zamanSemasi });
export const saatCihazlariCevabi = z.object({ cihazlar: z.array(saatCihaziSemasi) });
export const saatCihaziParametresi = z.object({ id: z.coerce.number().int().positive() });
export const saatCihaziKapatCevabi = z.object({ tamam: z.literal(true) });

// Ortak cihaz (kart #739, karar 738 a). Cihaz belirteci HttpOnly çerezdedir, cevaba girmez. `GET /oturum/cihaz` oturumdaki cihazın
// ortak olup olmadığını verir; kayıtsız ya da iptal edilmiş cihaz kişiseldir (kalıcı yerel veri tutmaz).
const ORTAK_CIHAZ_ADI = z.string().trim().min(1, 'Cihaz adı boş olamaz.').max(80, 'Cihaz adı en çok 80 karakter.');
export const cihazDurumuCevabi = z.object({ ortak: z.boolean(), id: z.number().int().nullable(), ad: z.string().nullable() });
export const ortakCihazSemasi = z.object({
  id: z.number().int(), ad: z.string(), kaydedenKisiId: z.number().int(), kaydedildi: zamanSemasi, buCihaz: z.boolean(),
});
export const ortakCihazlarCevabi = z.object({ cihazlar: z.array(ortakCihazSemasi) });
export const ortakCihazKaydetGovdesi = z.object({ ad: ORTAK_CIHAZ_ADI }).strict();
export const ortakCihazKaydetCevabi = z.object({ cihaz: ortakCihazSemasi });
export const ortakCihazParametresi = z.object({ id: z.coerce.number().int().positive() });
export const ortakCihazKapatCevabi = z.object({ tamam: z.literal(true) });
export type CihazDurumu = z.output<typeof cihazDurumuCevabi>;
export type OrtakCihaz = z.output<typeof ortakCihazSemasi>;
export type OrtakCihazlarCevabi = z.output<typeof ortakCihazlarCevabi>;
export type OrtakCihazKaydetCevabi = z.output<typeof ortakCihazKaydetCevabi>;
export type OrtakCihazKapatCevabi = z.output<typeof ortakCihazKapatCevabi>;

export type GirisGovdesi = z.input<typeof girisGovdesi>;
export type PinBelirleGovdesi = z.input<typeof pinBelirleGovdesi>;
export type GirisCevabi = z.output<typeof girisCevabi>;
export type KendiParolaGovdesi = z.input<typeof kendiParolaGovdesi>;
export type KendiPinGovdesi = z.input<typeof kendiPinGovdesi>;
export type OturumCevabi = z.output<typeof oturumCevabi>;
export type CikisCevabi = z.output<typeof cikisCevabi>;
export type HesapKilidi = z.output<typeof hesapKilidiSemasi>;
export type HesapKilitleriSorgusu = z.input<typeof hesapKilitleriSorgusu>;
export type HesapKilitleriCevabi = z.output<typeof hesapKilitleriCevabi>;
export type HesapKilidiAcCevabi = z.output<typeof hesapKilidiAcCevabi>;
export type SaatIstegiCevabi = z.output<typeof saatIstegiCevabi>;
export type SaatIstegiSorCevabi = z.output<typeof saatIstegiSorCevabi>;
export type SaatOnaylaGovdesi = z.input<typeof saatOnaylaGovdesi>;
export type SaatCihazi = z.output<typeof saatCihaziSemasi>;
export type SaatCihazlariCevabi = z.output<typeof saatCihazlariCevabi>;
