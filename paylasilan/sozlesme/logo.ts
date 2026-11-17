import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { LOGO_CRM_SINIRI } from './logo-gecisi-sabitleri.ts';

// Logo birim seti listesi (kart #207, LB6 c): köprüden okunan ve yönetici eliyle girilen kodlar.
// Köprüden liste hiç okunmadıysa elle girilen kod geçerlidir; okunduysa yalnız listede olan geçerlidir.
export const LOGO_BAGLANTI_DURUMLARI = ['kapali', 'acik', 'ortam-degiskeni-yok'] as const;

const kodSemasi = z.string().trim().min(1, 'Kod zorunlu.').max(40).regex(/^\S+$/, 'Kod boşluk taşımaz.');

export const birimSetleriCevabi = z.object({
  setler: z.array(z.object({
    kod: z.string(),
    ad: z.string().nullable(),
    elle: z.boolean(),
    kopruListesinde: z.boolean(),
    gecerli: z.boolean(),
  })),
  // Köprüden son liste okuma zamanı; hiç okunmadıysa null.
  sonOkuma: zamanSemasi.nullable(),
  baglanti: z.enum(LOGO_BAGLANTI_DURUMLARI),
});

export const birimSetiEkleGovdesi = z.object({
  kod: kodSemasi,
  ad: z.string().trim().min(1).max(80).nullable().prefault(null),
});
export const birimSetiParametresi = z.object({ kod: kodSemasi });
export const birimSetiCevabi = z.object({ kod: z.string() });

export type BirimSetleriCevabi = z.output<typeof birimSetleriCevabi>;
export type BirimSetiEkleGovdesi = z.input<typeof birimSetiEkleGovdesi>;
export type LogoBaglantiDurumu = (typeof LOGO_BAGLANTI_DURUMLARI)[number];

// Bağlantı hazırlığı ve canlı kontrol (Sistem Ayarları > Bağlantılar > Hazırlık). Anahtarın kendisi hiç dışarı çıkmaz.
// hazir: kod, ayar ve ortam tamam; kapali: ayar anahtarı kapalı; ayar-eksik: ortam değişkeni yok;
// baglanmadi: kod var, kaynağı olan modül henüz bağlanmadı; kodda-yok: bu akış yazılmadı.
export const BAGLANTI_AKIS_DURUMLARI = ['hazir', 'kapali', 'ayar-eksik', 'baglanmadi', 'kodda-yok'] as const;
export const LOGO_AKIS_YONLERI = ['tmi-logo', 'logo-tmi'] as const;

// 3314: çalışan yardımcının kaynak özeti paketteki kaynağınkiyle aynı mı. "eski": sürüm ucu yok; "bilinmiyor": ulaşılamadı ya da karşılaştırılamadı.
export const LOGO_YARDIMCI_SURUM_DURUMLARI = ['ayni', 'farkli', 'eski', 'bilinmiyor'] as const;
export const logoYardimciSurumu = z.object({
  durum: z.enum(LOGO_YARDIMCI_SURUM_DURUMLARI),
  ileti: z.string(),
  calisanOzet: z.string().nullable(),
  derlemeZamani: z.string().nullable(),
  pakettekiOzet: z.string().nullable(),
  sonBakis: zamanSemasi,
});
export type LogoYardimciSurumu = z.output<typeof logoYardimciSurumu>;

export const logoHazirlikCevabi = z.object({
  baglanti: z.enum(LOGO_BAGLANTI_DURUMLARI),
  ortam: z.object({
    // Köprünün kök adresi (kurum içi); tanımlı değilse null.
    adres: z.string().nullable(),
    anahtarTanimli: z.boolean(),
  }),
  ayarlar: z.array(z.object({ anahtar: z.string(), baslik: z.string(), acik: z.boolean() })),
  akislar: z.array(z.object({
    anahtar: z.string(),
    yon: z.enum(LOGO_AKIS_YONLERI),
    baslik: z.string(),
    aciklama: z.string(),
    durum: z.enum(BAGLANTI_AKIS_DURUMLARI),
    // Logo'ya giden belgelerin son durumu; akışın giden kaydı yoksa null.
    gonderilen: z.number().int().nullable(),
    hatali: z.number().int().nullable(),
    sonDeneme: zamanSemasi.nullable(),
  })),
  sonBirimSetiOkuma: zamanSemasi.nullable(),
  // 3314: son sürüm bakışı (saatte bir ve canlı kontrolde); henüz bakılmadıysa null. Alan sonradan eklendi, eski istemci görmezden gelir.
  yardimci: logoYardimciSurumu.nullable().optional(),
});

export const BAGLANTI_KONTROL_SONUCLARI = ['tamam', 'hata', 'atlandi'] as const;

export const logoKontrolCevabi = z.object({
  zaman: zamanSemasi,
  // Köprüye en az bir istek ulaşıp anahtar kabul edildiyse true.
  ulasildi: z.boolean(),
  adimlar: z.array(z.object({
    ad: z.string(),
    yol: z.string(),
    sonuc: z.enum(BAGLANTI_KONTROL_SONUCLARI),
    sureMs: z.number().int().nullable(),
    ileti: z.string(),
  })),
});

// 3313: bağlantı izleme, Logo'ya gitmeyen belgeler. Tutar, fiyat ve firma adı yoktur (K8); deneme kaydı olmayan belgede deneme alanları null.
export const LOGO_GIDEN_IZLEME_DURUMLARI = ['durdu', 'yeniden-denenecek', 'kart-bekliyor', 'proje-bekliyor', 'sirada'] as const;
export const logoGidenIzlemeCevabi = z.object({
  sayac: z.object({ durdu: z.number().int(), yenidenDenenecek: z.number().int(), kartBekliyor: z.number().int(), projeBekliyor: z.number().int(), sirada: z.number().int() }),
  belgeler: z.array(z.object({
    belge: z.string(),
    belgeAdi: z.string(),
    no: z.number().int(),
    islem: z.enum(['gonder', 'pasif']),
    durum: z.enum(LOGO_GIDEN_IZLEME_DURUMLARI),
    neden: z.string().nullable(),
    neYapmali: z.string(),
    yenidenGonderilebilir: z.boolean(),
    denemeSayisi: z.number().int().nullable(),
    sonDeneme: zamanSemasi.nullable(),
    sonrakiDeneme: zamanSemasi.nullable(),
  }).strict()),
  // Liste sınırı aşıldıysa true; sayaçlar listedeki belgeleri sayar.
  kesildi: z.boolean(),
});
export type LogoGidenIzlemeCevabi = z.output<typeof logoGidenIzlemeCevabi>;
export type LogoGidenIzlemeDurumu = (typeof LOGO_GIDEN_IZLEME_DURUMLARI)[number];

export type LogoHazirlikCevabi = z.output<typeof logoHazirlikCevabi>;
export type LogoKontrolCevabi = z.output<typeof logoKontrolCevabi>;
export type BaglantiAkisDurumu = (typeof BAGLANTI_AKIS_DURUMLARI)[number];

// D7 (kartlar 2986 a, 2987 a): Logo'da CORE MES dışında açılmış satın alma siparişini okuma ve düzeltme. Yalnız `logo.siparis-duzelt`;
// özellik ayrıca TMIV2_LOGO_SIPARIS_DUZELTME=acik ile açılır (kapalıyken uçlar yok sayılır, 404).
const fisNoSemasi = z.string().trim().min(1, 'Fiş numarası zorunlu.').max(16, 'Fiş numarası en çok 16 karakter.');
const pozitifOndalik = ondalikMetinSemasi.refine((d) => !d.startsWith('-'), 'Değer eksi olamaz.');
const aciklamaSemasi = z.string().max(250);

export const disSiparisSorgusu = z.object({ no: fisNoSemasi });

export const DIS_SIPARIS_OKUMA_DURUMLARI = ['tamam', 'yok', 'kapali', 'ortam-degiskeni-yok', 'hata'] as const;

const disSiparisSatiri = z.object({
  ref: z.number().int().positive(),
  turKodu: z.number().int(),
  kod: z.string().nullable(),
  ad: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  birim: z.string().nullable(),
  fiyat: ondalikMetinSemasi.nullable(),
  dovizFiyati: ondalikMetinSemasi.nullable(),
  kdv: ondalikMetinSemasi.nullable(),
  termin: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
  kapali: z.boolean(),
});

export const disSiparisCevabi = z.object({
  durum: z.enum(DIS_SIPARIS_OKUMA_DURUMLARI),
  ileti: z.string().nullable(),
  siparis: z.object({
    ref: z.number().int().positive(),
    no: z.string(),
    tarih: tarihSemasi.nullable(),
    cariKodu: z.string().nullable(),
    dovizTuru: z.number().int().nullable(),
    kur: ondalikMetinSemasi.nullable(),
    durum: z.number().int().nullable(),
    iptal: z.boolean(),
    satirlar: z.array(disSiparisSatiri),
  }).nullable(),
  // Okuma anının izi: düzeltme komutu bunu geri yollar; iş gönderimden önce Logo'yu yeniden okur, iz tutmazsa yazmaz.
  iz: z.string().nullable(),
});

export const disSiparisDuzeltGovdesi = z.object({
  no: fisNoSemasi,
  iz: z.string().regex(/^[0-9a-f]{64}$/, 'Okuma izi geçersiz; siparişi yeniden açın.'),
  tarih: tarihSemasi.optional(),
  satirlar: z.array(z.object({
    ref: z.number().int().positive(),
    miktar: pozitifOndalik.optional(),
    fiyat: pozitifOndalik.optional(),
    termin: tarihSemasi.optional(),
    aciklama: aciklamaSemasi.optional(),
    kapat: z.boolean().optional(),
  })).max(500),
  yeniSatirlar: z.array(z.object({
    hizmet: z.boolean(),
    kod: z.string().trim().min(1).max(24),
    miktar: pozitifOndalik,
    fiyat: pozitifOndalik,
    birim: z.string().trim().min(1).max(40),
    kdv: z.number().min(0).max(100),
    termin: tarihSemasi.optional(),
    aciklama: aciklamaSemasi.optional(),
  })).max(100),
});

export const DIS_DUZELTME_DURUMLARI = ['bekliyor', 'gonderildi', 'reddedildi', 'hata'] as const;

// Fiyat taşımaz: yalnız hangi satırın değiştiği, kapandığı ve kaç satır eklendiği.
const disDuzeltmeKaydi = z.object({
  id: z.number().int().positive(),
  fisNo: z.string(),
  durum: z.enum(DIS_DUZELTME_DURUMLARI),
  hata: z.string().nullable(),
  ozet: z.object({ tarih: z.boolean(), degisen: z.array(z.number().int()), kapanan: z.array(z.number().int()), yeni: z.number().int() }).nullable(),
  kisiId: z.number().int().positive(),
  olusturma: zamanSemasi,
  sonucZamani: zamanSemasi.nullable(),
});

export const disDuzeltmeCevabi = z.object({ kayit: disDuzeltmeKaydi });
export const disDuzeltmelerCevabi = z.object({ kayitlar: z.array(disDuzeltmeKaydi) });

export type DisSiparisCevabi = z.output<typeof disSiparisCevabi>;
export type DisSiparisDuzeltGovdesi = z.input<typeof disSiparisDuzeltGovdesi>;
export type DisDuzeltmeKaydi = z.output<typeof disDuzeltmeKaydi>;

// 3077 a: "Logo geçişi" sayfasındaki "Şimdi oku" ve "Geçişi bitir" komutlarının cevabı.
export const logoGecisKomutuCevabi = z.object({ tamam: z.literal(true) });

// 3313: duran (Logo'nun kalıcı reddiyle bekleyen) belgeleri yeniden gönderme; tek belge ya da seçilenler. Belge, giden kutusundaki türdür.
export const LOGO_YENIDEN_GONDER_AZAMI = 200;
export const logoYenidenGonderGovdesi = z.object({
  belgeler: z.array(z.object({
    belge: z.string().trim().min(1).max(40),
    no: z.number().int().positive(),
    islem: z.enum(['gonder', 'pasif']).default('gonder'),
  }).strict()).min(1).max(LOGO_YENIDEN_GONDER_AZAMI),
}).strict();
export type LogoYenidenGonderGovdesi = z.input<typeof logoYenidenGonderGovdesi>;
// sirada: yeniden sıraya giren; durmayan: durmadığı için (gönderilmiş, kendiliğinden yinelenecek ya da arada değişmiş) dokunulmayan.
export const logoYenidenGonderCevabi = z.object({ sirada: z.number().int(), durmayan: z.number().int() });
export type LogoYenidenGonderCevabi = z.output<typeof logoYenidenGonderCevabi>;

// 3080 a: Logo geçişinde tek kart canlı araması. Arama yalnız okur ve sonucu kişinin süreç belleğinde tutar; "ekle" bulunan kartı
// okunmuş kopyaya yazar (köprüye gitmez). Kapalıysa ya da köprü yoksa durum ve ileti döner, kart dönmez.
export const LOGO_MALZEME_ARAMA_EN_AZ = 3;
export const LOGO_MALZEME_ARAMA_EN_COK = 100;
export const LOGO_MALZEME_ARAMA_SONUCU = 20;
export const logoMalzemeAramaSorgusu = z.object({
  q: z.string().trim().min(LOGO_MALZEME_ARAMA_EN_AZ, `En az ${LOGO_MALZEME_ARAMA_EN_AZ} karakter yazın.`).max(LOGO_MALZEME_ARAMA_EN_COK),
});
export const logoMalzemeAramaCevabi = z.object({
  durum: z.enum(['tamam', 'kapali', 'ortam-degiskeni-yok', 'hata']),
  ileti: z.string().nullable(),
  kartlar: z.array(z.object({ logoKayitNo: z.number().int(), kod: z.string(), ad: z.string().nullable() })).max(LOGO_MALZEME_ARAMA_SONUCU),
});
export type LogoMalzemeAramaCevabi = z.output<typeof logoMalzemeAramaCevabi>;
// 3319: katalogdaki "Logo'da da ara" düğmesi açık mı; kapalıysa neden düğmenin yanında yazar. Logo'ya istek gitmez.
export const logoMalzemeAramaDurumuCevabi = z.object({ acik: z.boolean(), neden: z.string().nullable() });
export type LogoMalzemeAramaDurumuCevabi = z.output<typeof logoMalzemeAramaDurumuCevabi>;
export const logoMalzemeEkleGovdesi = z.object({
  kartlar: z.array(z.number().int().positive()).min(1).max(LOGO_MALZEME_ARAMA_SONUCU),
}).strict();
export const logoMalzemeEkleCevabi = z.object({ eklenen: z.number().int() });
export type LogoMalzemeEkleCevabi = z.output<typeof logoMalzemeEkleCevabi>;

// 3201: malzeme kartının "Logo'da" bölümü (yalnız okuma). Miktar ve fiyat işaretli ondalık metin; veri yoksa null.
const kartMiktari = z.string().regex(/^-?\d+(\.\d+)?$/);
export const logoKartParametresi = z.object({ kod: z.string().trim().min(1).max(64) });
export const logoKartBolumuCevabi = z.object({
  // Açık parçalar: anahtar kapalı olan parça ekranda yoktur. fiyat yalnız fiyat görebilen kişide true.
  parcalar: z.object({ stok: z.boolean(), hareket: z.boolean(), fiyat: z.boolean() }),
  // Logo'daki kart kodu (CORE kodundan farklıysa eşlemeden).
  logoKodu: z.string(),
  stok: z.object({
    // Stok aynasının son tam turu; hiç bitmediyse null (ekranda "henüz okunmadı").
    sonOkuma: zamanSemasi.nullable(),
    ambarlar: z.array(z.object({
      ambarNo: z.number().int(), ambarAdi: z.string().nullable(), logo: kartMiktari.nullable(),
      depo: z.object({ kod: z.string(), ad: z.string() }).nullable(), core: kartMiktari.nullable(), fark: kartMiktari.nullable(),
    })),
    eslenen: z.object({ logo: kartMiktari, core: kartMiktari, fark: kartMiktari }).nullable(),
    eslenmemis: kartMiktari.nullable(),
  }).nullable(),
});
export type LogoKartBolumuCevabi = z.output<typeof logoKartBolumuCevabi>;

const kartOkumaDurumu = z.enum(['tamam', 'kapali', 'ortam-degiskeni-yok', 'hata', 'kart-yok']);
export const logoKartHareketSorgusu = z.object({ once: z.coerce.number().int().positive().optional() });
export const logoKartHareketleriCevabi = z.object({
  durum: kartOkumaDurumu,
  ileti: z.string().nullable(),
  kayitlar: z.array(z.object({
    logoKayitNo: z.number().int(), tarih: tarihSemasi, fisTuru: z.number().int(), fisAdi: z.string(),
    yon: z.enum(['giris', 'cikis']).nullable(), fisNo: z.string().nullable(), ambarNo: z.number().int().nullable(),
    miktar: kartMiktari, birim: z.string().nullable(),
  })),
  // Daha eski hareketlerin imleci; yoksa null.
  dahaEski: z.number().int().positive().nullable(),
});
export type LogoKartHareketleriCevabi = z.output<typeof logoKartHareketleriCevabi>;
export const logoKartAlislariCevabi = z.object({
  durum: kartOkumaDurumu,
  ileti: z.string().nullable(),
  kayitlar: z.array(z.object({
    logoKayitNo: z.number().int(), tarih: tarihSemasi, tedarikci: z.string().nullable(), faturaNo: z.string().nullable(),
    miktar: kartMiktari, birim: z.string().nullable(), fiyat: kartMiktari, dovizTuru: z.number().int().nullable(), dovizFiyati: kartMiktari.nullable(),
  })),
});
export type LogoKartAlislariCevabi = z.output<typeof logoKartAlislariCevabi>;

// 3315: proje kartının Logo durumu (proje kartı "Genel" bölümü). Logo kodu CORE kodudur (aynen gider); yalnız "logoda"da dolu.
export const LOGO_PROJE_DURUMLARI = ['logoda', 'sirada', 'yeniden-denenecek', 'durdu', 'gonderilmez'] as const;
export const logoProjeParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const logoProjeDurumuCevabi = z.object({ durum: z.enum(LOGO_PROJE_DURUMLARI), logoKodu: z.string().nullable(), metin: z.string().nullable() });
export type LogoProjeDurumuCevabi = z.output<typeof logoProjeDurumuCevabi>;

// 3344: belgenin Logo'ya gidiş rozeti (liste ve ayrıntı). Logo'ya istek atılmaz; giden kutusu ve bekleme izinden okunur.
// Logo'ya hiç gitmeyecek belge listede yoktur (rozet çizilmez).
export const LOGO_ROZET_TURLERI = ['malzeme', 'proje', 'satis-siparisi', 'teklif', 'satin-alma-siparisi'] as const;
export const LOGO_ROZET_DURUMLARI = ['logoda', 'sirada', 'yeniden-denenecek', 'kart-bekliyor', 'proje-bekliyor', 'durdu'] as const;
export const LOGO_ROZET_SINIRI = 200;
export const logoRozetSorgusu = z.object({
  tur: z.enum(LOGO_ROZET_TURLERI),
  id: z.string().trim().min(1, 'En az bir kimlik verin.')
    .transform((v) => v.split(',').map((p) => Number(p.trim())))
    .pipe(z.array(z.number().int().positive()).max(LOGO_ROZET_SINIRI, `En çok ${LOGO_ROZET_SINIRI} kimlik.`)),
});
export type LogoRozetSorgusu = z.input<typeof logoRozetSorgusu>;
export type LogoRozetTuru = (typeof LOGO_ROZET_TURLERI)[number];
export type LogoRozetDurumu = (typeof LOGO_ROZET_DURUMLARI)[number];
export const logoRozetCevabi = z.object({
  durumlar: z.array(z.object({
    id: z.number().int().positive(),
    durum: z.enum(LOGO_ROZET_DURUMLARI),
    // Logo'daki belgenin kayıt numarası; yalnız "logoda" durumunda ve biliniyorsa.
    kayitNo: z.string().nullable(),
    // Gitmeyen belgenin nedeni (Logo'nun ya da CORE'un iletisi); "logoda" ve "sirada"da null.
    neden: z.string().nullable(),
  })),
});
export type LogoRozetCevabi = z.output<typeof logoRozetCevabi>;

// 3359 a: cari Logo'da CRM satış müşterisine bağlı mı (satış teklifi bunu ister, validate 4208). Firma kimliğiyle sorulur; yalnız Logo cari
// kodu olan ve tedarikçi olmayan firma cevapta yer alır. Okunamazsa neden yazar.
export { LOGO_CRM_SINIRI };
export const LOGO_CRM_DURUMLARI = ['var', 'yok', 'okunamadi'] as const;
export type LogoCrmDurumu = (typeof LOGO_CRM_DURUMLARI)[number];
export const logoCrmSorgusu = z.object({
  id: z.string().trim().min(1, 'En az bir kimlik verin.')
    .transform((v) => v.split(',').map((p) => Number(p.trim())))
    .pipe(z.array(z.number().int().positive()).max(LOGO_CRM_SINIRI, `En çok ${LOGO_CRM_SINIRI} kimlik.`)),
});
export type LogoCrmSorgusu = z.input<typeof logoCrmSorgusu>;
export const logoCrmCevabi = z.object({
  durumlar: z.array(z.object({
    firmaId: z.number().int().positive(),
    durum: z.enum(LOGO_CRM_DURUMLARI),
    neden: z.string().nullable(),
  })),
});
export type LogoCrmCevabi = z.output<typeof logoCrmCevabi>;

// 3345 a: Logo irsaliyeleri, yalnız okuma. Tür Logo STFICHE.TRCODE'dur. Fiyat ve tutar yalnız fiyat yetkisi olana dolu gelir
// (alışta satin-alma.oku, satışta siparisler.fiyat-oku); yetkisizde null ve fiyatGorunur false.
export const LOGO_IRSALIYE_TURLERI = [1, 3, 4, 5, 6, 8, 9, 10] as const;
export const IRSALIYE_YONLERI = ['alis', 'satis'] as const;
export const IRSALIYE_ESLESME_DURUMLARI = ['eslesti', 'fark', 'eslesmedi', 'karsiligi-yok', 'iptal', 'logoda-yok'] as const;
export const IRSALIYE_GUN_SECENEKLERI = [7, 30, 90] as const;
const imzaliMiktar = z.string().regex(/^-?\d+(\.\d+)?$/);

export const irsaliyeListesiSorgusu = z.object({
  sayfa: z.coerce.number<number>().int().min(1).max(100_000).prefault(1),
  sayfaBoyu: z.coerce.number<number>().int().min(1).max(200).optional(),
  yon: z.enum(IRSALIYE_YONLERI).prefault('alis'),
  tur: z.coerce.number<number>().int().optional(),
  gun: z.coerce.number<number>().int().refine((g) => (IRSALIYE_GUN_SECENEKLERI as readonly number[]).includes(g), 'Gün 7, 30 ya da 90 olmalı.').prefault(30),
  durum: z.enum(IRSALIYE_ESLESME_DURUMLARI).optional(),
  ara: z.string().trim().max(64).optional(),
});

const coreKarsiligi = z.object({ tur: z.enum(['siparis', 'sevk', 'mal-kabul']), id: z.number().int(), no: z.string() });

export const irsaliyeListeSatiri = z.object({
  firma: z.number().int(),
  donem: z.number().int(),
  kayitNo: z.number().int(),
  tur: z.number().int(),
  turAdi: z.string(),
  fisNo: z.string().nullable(),
  belgeNo: z.string().nullable(),
  tarih: tarihSemasi,
  cariKodu: z.string().nullable(),
  cariAdi: z.string().nullable(),
  eIrsaliye: z.boolean(),
  faturaNo: z.string().nullable(),
  satirSayisi: z.number().int(),
  durum: z.enum(IRSALIYE_ESLESME_DURUMLARI),
  ozet: z.string(),
});
export type IrsaliyeListeSatiri = z.output<typeof irsaliyeListeSatiri>;

const irsaliyeOkumasi = z.object({
  // "Logo bağlantısı" ve "Logo: irsaliye okuması" ikisi de açık mı.
  acik: z.boolean(),
  sonOkuma: zamanSemasi.nullable(),
});

export const irsaliyeListesiCevabi = z.object({
  satirlar: z.array(irsaliyeListeSatiri),
  toplam: z.number().int().min(0).nullable(),
  sayfa: z.number().int().min(1),
  sayfaBoyu: z.number().int().min(1),
  // Seçili yön, gün ve aramayla tür başına irsaliye sayısı; görünmeyen (ölçülmemiş konsinye) türler yoktur.
  turler: z.array(z.object({ tur: z.number().int(), ad: z.string(), sayi: z.number().int() })),
  durumlar: z.array(z.object({ durum: z.enum(IRSALIYE_ESLESME_DURUMLARI), sayi: z.number().int() })),
  okuma: irsaliyeOkumasi,
});
export type IrsaliyeListesiCevabi = z.output<typeof irsaliyeListesiCevabi>;

export const irsaliyeParametresi = z.object({
  firma: z.coerce.number<number>().int().min(0),
  donem: z.coerce.number<number>().int().min(0),
  kayitNo: z.coerce.number<number>().int().positive(),
});

export const irsaliyeCevabi = z.object({
  baslik: irsaliyeListeSatiri.extend({
    ambar: z.string().nullable(),
    iptal: z.boolean(),
    logodaYok: z.boolean(),
    okumaZamani: zamanSemasi,
  }),
  fiyatGorunur: z.boolean(),
  satirlar: z.array(z.object({
    kayitNo: z.number().int(),
    malzemeKodu: z.string().nullable(),
    malzemeAdi: z.string().nullable(),
    miktar: imzaliMiktar.nullable(),
    birim: z.string().nullable(),
    fiyat: imzaliMiktar.nullable(),
    tutar: imzaliMiktar.nullable(),
    dovizTuru: z.number().int().nullable(),
    dovizFiyati: imzaliMiktar.nullable(),
    siparisNo: z.string().nullable(),
    durum: z.enum(IRSALIYE_ESLESME_DURUMLARI),
    neden: z.string().nullable(),
    core: coreKarsiligi.nullable(),
    coreMiktari: imzaliMiktar.nullable(),
    coreBirimi: z.string().nullable(),
  })),
});
export type IrsaliyeCevabi = z.output<typeof irsaliyeCevabi>;
