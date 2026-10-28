import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// Güvenlik Merkezi: giriş ve oturum sinyallerinden açılan alarm defteri ve izleme ekranları. Alarmda parola, oturum anahtarı ya
// da özeti yoktur; kaynak yalnız kullanıcı adı, cihaz adresi (IP) ve kişi kimliğidir.

export const SINYALLER = ['hatali-giris-serisi', 'yayilan-deneme', 'hedefli-hesap', 'cok-oturum', 'hesap-kilidi'] as const;
export const ONEMLER = ['kritik', 'yuksek', 'orta'] as const;
export const ALARM_DURUMLARI = ['acik', 'onaylandi', 'kapandi'] as const;
// Liste görünümü: "etkin" açık ve onaylanmış alarmlardır (varsayılan).
export const ALARM_GORUNUMLERI = ['etkin', 'acik', 'onaylandi', 'kapandi', 'hepsi'] as const;
export const KAPANIS_NOTU_EN_COK = 2000;
export const KORUMA_DURUMLARI = ['acik', 'uyari', 'kapali', 'bilinmiyor'] as const;
export const DENEME_SONUCLARI = ['basarili', 'hatali'] as const;

export type Sinyal = (typeof SINYALLER)[number];
export type Onem = (typeof ONEMLER)[number];
export type AlarmDurumu = (typeof ALARM_DURUMLARI)[number];
export type AlarmGorunumu = (typeof ALARM_GORUNUMLERI)[number];
export type KorumaDurumu = (typeof KORUMA_DURUMLARI)[number];

export const guvenlikKimligi = z.object({ id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

const metinVeyaYok = z.string().nullable();
const sayi = z.number().int().nonnegative();

export const alarmSemasi = z.object({
  id: z.number().int(),
  sinyal: z.enum(SINYALLER),
  onem: z.enum(ONEMLER),
  kullaniciAdi: metinVeyaYok,
  ip: metinVeyaYok,
  kisiId: z.number().int().nullable(),
  kisiAdi: metinVeyaYok,
  gozlenenSayi: z.number().int().min(1),
  tekrarSayisi: z.number().int().min(1),
  ilkGoruldu: zamanSemasi,
  sonGoruldu: zamanSemasi,
  durum: z.enum(ALARM_DURUMLARI),
  onaylayanAdi: metinVeyaYok,
  onaylandi: zamanSemasi.nullable(),
  kapatanAdi: metinVeyaYok,
  kapandi: zamanSemasi.nullable(),
  kapanisNotu: metinVeyaYok,
  surum: surumSemasi,
});

export const alarmListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  gorunum: z.enum(ALARM_GORUNUMLERI).default('etkin'),
});
export const alarmListeCevabi = listeCevapSemasi(alarmSemasi);

export const alarmOnaylaGovdesi = z.object({ ...beklenenSurum }).strict();
export const alarmKapatGovdesi = z.object({
  ...beklenenSurum,
  not: z.string().trim()
    .min(1, 'Kapatmak için ne bulunduğunu ve ne yapıldığını yazın.')
    .max(KAPANIS_NOTU_EN_COK, `En çok ${KAPANIS_NOTU_EN_COK} karakter yazılabilir.`),
}).strict();

export const saatlikGirisSemasi = z.object({ saat: zamanSemasi, basarili: sayi, hatali: sayi });

export const ozetCevabi = z.object({
  acikAlarm: z.object({ kritik: sayi, yuksek: sayi, orta: sayi }),
  onaylanmisAlarm: sayi,
  sonTarama: zamanSemasi.nullable(),
  // Son tarama 5 dakikadan eskiyse ya da hiç tarama yoksa true.
  taramaDurdu: z.boolean(),
  girisler: z.object({ basarili: sayi, hatali: sayi, kullaniciAdi: sayi, cihaz: sayi }),
  saatlik: z.array(saatlikGirisSemasi),
  acikOturum: z.object({ oturum: sayi, kisi: sayi }),
  // Etkin (açılmamış, süresi dolmamış) hesap kilidi sayısı.
  kilitliHesap: sayi,
  sonAlarmlar: z.array(alarmSemasi),
});

export const girisListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  sonuc: z.enum(DENEME_SONUCLARI).optional(),
  ara: z.string().trim().max(80).optional(),
});
export const girisSatiri = z.object({
  id: z.number().int(),
  kullaniciAdi: z.string(),
  ip: metinVeyaYok,
  sonuc: z.enum(DENEME_SONUCLARI),
  zaman: zamanSemasi,
});
export const girisListeCevabi = listeCevapSemasi(girisSatiri);

export const oturumSatiri = z.object({
  id: z.number().int(),
  kisiId: z.number().int(),
  kisiAdi: z.string(),
  acildi: zamanSemasi,
  sonGorulme: zamanSemasi,
  // Girişteki cihaz (386 a); bu bilgiden önce açılmış oturumda boştur.
  ip: z.string().nullable(),
  tarayici: z.string().nullable(),
  buOturum: z.boolean(),
});
export const oturumlarCevabi = z.object({ oturumlar: z.array(oturumSatiri) });

// Etkin hesap kilitleri (oturum modülünün kilidi); açma adın bütün etkin kilitlerini açar.
export const kilitListeSorgusu = z.object({ ...sayfaSorguAlanlari });
export const kilitSatiri = z.object({ id: z.number().int(), kullaniciAdi: z.string(), kilitlendi: zamanSemasi, bitis: zamanSemasi });
export const kilitListeCevabi = listeCevapSemasi(kilitSatiri);
export const kilitAcCevabi = z.object({ acilan: z.number().int().positive() });
export const oturumKapatCevabi = z.object({ id: z.number().int() });

const korumaMaddesi = z.object({
  anahtar: z.string(),
  baslik: z.string(),
  aciklama: z.string(),
  durum: z.enum(KORUMA_DURUMLARI),
  deger: metinVeyaYok,
});

export const korumaCevabi = z.object({ maddeler: z.array(korumaMaddesi) });

// Sunucu durumu kartı: günlük, olay günlüğü, yedek, disk ve sertifika maddeleri koruma maddesi biçimindedir; son sunucu hataları
// günlük dosyasından okunur. Hata metni yalnız ileti ve hata türüdür; istek gövdesi ya da başlığı taşımaz.
export const sunucuHatasiSemasi = z.object({
  zaman: zamanSemasi,
  ileti: z.string(),
  hata: metinVeyaYok,
  // Ekrandaki "Hata kodu" (5xx cevabının x-hata-kodu başlığı).
  kod: metinVeyaYok,
});
export const sunucuDurumuCevabi = z.object({ maddeler: z.array(korumaMaddesi), sonHatalar: z.array(sunucuHatasiSemasi) });

export const kurallarCevabi = z.object({
  kurallar: z.array(z.object({
    sinyal: z.enum(SINYALLER),
    baslik: z.string(),
    kosul: z.string(),
    onem: z.enum(ONEMLER),
  })),
  saklamaGun: z.number().int(),
  // VPN adres aralığı ayarı: doluysa bu aralıklardan gelen deneme cihaza bağlı kurallarda sayılmaz. Boş liste: muafiyet yok.
  vpnAraliklari: z.array(z.string()),
  muafSinyaller: z.array(z.enum(SINYALLER)),
  taramaAraligiSn: z.number().int(),
  durmaEsigiDk: z.number().int(),
});

export type Alarm = z.output<typeof alarmSemasi>;
export type AlarmListeCevabi = z.output<typeof alarmListeCevabi>;
export type AlarmListeSorgusu = z.input<typeof alarmListeSorgusu>;
export type AlarmOnaylaGovdesi = z.input<typeof alarmOnaylaGovdesi>;
export type AlarmKapatGovdesi = z.input<typeof alarmKapatGovdesi>;
export type OzetCevabi = z.output<typeof ozetCevabi>;
export type GirisListeSorgusu = z.input<typeof girisListeSorgusu>;
export type GirisListeCevabi = z.output<typeof girisListeCevabi>;
export type OturumlarCevabi = z.output<typeof oturumlarCevabi>;
export type KilitListeCevabi = z.output<typeof kilitListeCevabi>;
export type KilitAcCevabi = z.output<typeof kilitAcCevabi>;
export type KorumaCevabi = z.output<typeof korumaCevabi>;
export type SunucuDurumuCevabi = z.output<typeof sunucuDurumuCevabi>;
export type KurallarCevabi = z.output<typeof kurallarCevabi>;
