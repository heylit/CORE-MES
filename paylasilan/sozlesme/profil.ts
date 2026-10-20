import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Profil: her çalışanın kendi sayfası (İK bilgileri, izin, fazla mesai, şikayet/istek/öneri geçmişi) ve üst çubuktaki
// şikayet/istek/öneri kutusu. Kişi her zaman oturumdan gelir: gövde ve adres başka kişiyi seçemez.

export const GERI_BILDIRIM_KONULARI = ['sirket', 'uygulama'] as const;
export const GERI_BILDIRIM_TURLERI = ['sikayet', 'istek', 'oneri'] as const;
export type GeriBildirimKonusu = (typeof GERI_BILDIRIM_KONULARI)[number];
export type GeriBildirimTuru = (typeof GERI_BILDIRIM_TURLERI)[number];
export const GERI_BILDIRIM_METIN_EN_AZ = 3;
export const GERI_BILDIRIM_METIN_EN_COK = 2000;

export const geriBildirimGonderGovdesi = z.object({
  konu: z.enum(GERI_BILDIRIM_KONULARI),
  tur: z.enum(GERI_BILDIRIM_TURLERI),
  metin: z.string().trim()
    .min(GERI_BILDIRIM_METIN_EN_AZ, `En az ${GERI_BILDIRIM_METIN_EN_AZ} karakter yazın.`)
    .max(GERI_BILDIRIM_METIN_EN_COK, `En çok ${GERI_BILDIRIM_METIN_EN_COK} karakter yazılabilir.`),
}).strict();

export const geriBildirimSemasi = z.object({
  id: z.number().int(),
  konu: z.enum(GERI_BILDIRIM_KONULARI),
  tur: z.enum(GERI_BILDIRIM_TURLERI),
  metin: z.string(),
  gonderildi: zamanSemasi,
});
export const geriBildirimGonderCevabi = geriBildirimSemasi;

// Okuyanın listesi: yazanın adıyla. Süzgeç isteğe bağlı.
export const geriBildirimListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  konu: z.enum(GERI_BILDIRIM_KONULARI).optional(),
  tur: z.enum(GERI_BILDIRIM_TURLERI).optional(),
});
export const geriBildirimListeCevabi = listeCevapSemasi(geriBildirimSemasi.extend({ kisiAdi: z.string() }));

const metinVeyaYok = z.string().nullable();
export const profilCevabi = z.object({
  kisi: z.object({ id: z.number().int(), ad: z.string(), gorev: metinVeyaYok }),
  // İK'nın girdiği kart; kişi bir personel kaydına bağlı değilse null.
  personel: z.object({
    ad: z.string(), sicilNo: metinVeyaYok, pozisyon: metinVeyaYok, departman: metinVeyaYok, yonetici: metinVeyaYok,
    iseGiris: tarihSemasi.nullable(), calismaSekli: metinVeyaYok, telefon: metinVeyaYok, eposta: metinVeyaYok, adres: metinVeyaYok,
    acilKisi: metinVeyaYok, acilYakinlik: metinVeyaYok, acilTelefon: metinVeyaYok,
  }).nullable(),
  izin: z.object({
    hakGun: z.number().nullable(), kalanGun: z.number().nullable(), kullanilanGun: z.number(), bekleyenGun: z.number(),
    sonrakiHakTarihi: tarihSemasi.nullable(), sonrakiHakGun: z.number().nullable(),
  }).nullable(),
  // Son bir yıl ve önümüzdeki izinler, yeniden eskiye.
  izinler: z.array(z.object({
    tur: z.string(), baslangic: tarihSemasi, bitis: tarihSemasi, gun: z.number().nullable(),
    durum: z.enum(['Beklemede', 'Onaylandı', 'Reddedildi', 'İptal']),
  })).nullable(),
  // Bu yılın fazla mesaisi (fazla mesai, hafta tatili ve resmi tatil çalışması), yeniden eskiye.
  fazlaMesai: z.object({
    satirlar: z.array(z.object({ tarih: tarihSemasi, tur: z.string(), saat: z.number().nullable(), onay: z.enum(['Onaylandı', 'Beklemede']).nullable() })),
    toplamSaat: z.number().nullable(),
    yillikSinirSaat: z.number().nullable(),
  }).nullable(),
  geriBildirimler: z.array(geriBildirimSemasi),
  // Okuyan kutusunu açabilir mi (profil.geri-bildirim-oku); yalnız bağlantıyı göstermek içindir, yetki uçtadır.
  geriBildirimOkur: z.boolean(),
});

export type GeriBildirimGonderGovdesi = z.input<typeof geriBildirimGonderGovdesi>;
export type GeriBildirim = z.output<typeof geriBildirimSemasi>;
export type GeriBildirimListeSorgusu = z.input<typeof geriBildirimListeSorgusu>;
export type GeriBildirimListeCevabi = z.output<typeof geriBildirimListeCevabi>;
export type ProfilCevabi = z.output<typeof profilCevabi>;
