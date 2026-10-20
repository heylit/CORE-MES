import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Tesis talebi (bina, tesisat, temizlik, yemekhane); makine arızası burada değil (Arkon/bakım).
export const TALEP_KATEGORILERI = ['elektrik', 'su', 'klima', 'bina', 'temizlik', 'yemekhane', 'kirtasiye', 'diger'] as const;
export const talepKategorisiSemasi = z.enum(TALEP_KATEGORILERI);

// IDR-02: yeni -> yapiliyor (üstlen) -> kapandi; reddedildi ve geri_cekildi de son durumdur.
export const TALEP_DURUMLARI = ['yeni', 'yapiliyor', 'kapandi', 'reddedildi', 'geri_cekildi'] as const;
export const talepDurumuSemasi = z.enum(TALEP_DURUMLARI);

export const TALEP_ACILIYETLERI = ['normal', 'acil'] as const;
export const talepAciliyetiSemasi = z.enum(TALEP_ACILIYETLERI);

export const YER_EN_UZUN = 120;
export const ACIKLAMA_EN_UZUN = 1000;
export const NOT_EN_UZUN = 500;

// Boş ya da yalnız boşluk "yok" demektir; boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami, `En çok ${azami} karakter.`).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

export const idParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });

// Talep açan yalnız konu, yer ve aciliyeti seçer; açan kişi ve zaman sunucudan (IDR-01).
export const talepAcGovdesi = z.object({
  kategori: talepKategorisiSemasi,
  yer: z.string().trim().min(1, 'Yer boş olamaz.').max(YER_EN_UZUN, `En çok ${YER_EN_UZUN} karakter.`),
  aciklama: istege(ACIKLAMA_EN_UZUN),
  aciliyet: talepAciliyetiSemasi.default('normal'),
});

export const durumGovdesi = z.object({ ...beklenenSurum });
// Boş kişi: üstlenen komutu veren kişidir.
export const ustlenGovdesi = z.object({ ...beklenenSurum, kisiId: z.number().int().positive().max(2147483647).nullish().transform((k) => k ?? null) });
export const kapatGovdesi = z.object({ ...beklenenSurum, sonucNotu: istege(NOT_EN_UZUN) });
// IDR-04: red nedensiz olmaz.
export const reddetGovdesi = z.object({
  ...beklenenSurum,
  neden: z.string().trim().min(1, 'Red nedeni zorunlu.').max(NOT_EN_UZUN, `En çok ${NOT_EN_UZUN} karakter.`),
});

export const talepSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  kategori: talepKategorisiSemasi,
  yer: z.string(),
  aciklama: z.string().nullable(),
  aciliyet: talepAciliyetiSemasi,
  durum: talepDurumuSemasi,
  acanKisiId: z.number().int(),
  // Adlar kişilerden okunur; bulunamazsa null.
  acanAd: z.string().nullable(),
  acilma: zamanSemasi,
  ustlenenKisiId: z.number().int().nullable(),
  ustlenenAd: z.string().nullable(),
  ustlenme: zamanSemasi.nullable(),
  kapatanAd: z.string().nullable(),
  kapanma: zamanSemasi.nullable(),
  sonucNotu: z.string().nullable(),
  surum: surumSemasi,
});
export const talepCevabi = z.object({ talep: talepSemasi });

// Pano: açık talepler ve son yedi günde kapananlar. Her sütun en yeni PANO_EN_COK kayıtla gelir; toplam ayrıca sayılır.
export const PANO_EN_COK = 200;
const panoSutunu = z.object({ talepler: z.array(talepSemasi), toplam: z.number().int().nonnegative() });
export const talepPanosuCevabi = z.object({ yeni: panoSutunu, yapiliyor: panoSutunu, kapanan: panoSutunu });

export const taleplerimSorgusu = z.object({
  ...listeSorguAlanlari(['acilma', 'no']),
  durum: talepDurumuSemasi.optional(),
});
export const taleplerimCevabi = listeCevapSemasi(talepSemasi);

// Son kullanılan yerler: kişinin kendi taleplerinden, en yeniden eskiye, yinelenmeden.
export const SON_YER_EN_COK = 6;
export const sonYerlerCevabi = z.object({ yerler: z.array(z.string()) });

export const kisiSecenekleriCevabi = z.object({ kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })) });

// Periyodik kontroller (188 a, 190 a): yasal kontrol, sözleşme ve poliçe bitişi, atık teslimi.
export const KONTROL_TURLERI = ['yasal', 'sozlesme', 'atik'] as const;
export const kontrolTuruSemasi = z.enum(KONTROL_TURLERI);
export const SIKLIK_BIRIMLERI = ['gun', 'hafta', 'ay', 'yil'] as const;
export const siklikBirimiSemasi = z.enum(SIKLIK_BIRIMLERI);
// Atık birimi sabit listedir; birim tanımları bağlamada Malzemeler'den gelir (uyum borcu).
export const ATIK_BIRIMLERI = ['kg', 'ton', 'lt', 'm3', 'adet'] as const;
export const atikBirimiSemasi = z.enum(ATIK_BIRIMLERI);
// IDR-12: süresi geçti, 30 gün içinde, daha sonra.
export const KONTROL_GRUPLARI = ['gecti', 'yakin', 'sonra'] as const;
export const kontrolGrubuSemasi = z.enum(KONTROL_GRUPLARI);

export const KONTROL_AD_EN_UZUN = 120;
export const BELGE_NO_EN_UZUN = 60;

const kimlik = z.number().int().positive().max(2147483647);
const kontrolAlanlari = {
  ad: z.string().trim().min(1, 'Ad boş olamaz.').max(KONTROL_AD_EN_UZUN, `En çok ${KONTROL_AD_EN_UZUN} karakter.`),
  // Sıklıksız kalem her kayıtta yeni tarihi elle alır (sözleşme bitişi).
  siklikDeger: z.number().int().min(1).max(120).nullish().transform((d) => d ?? null),
  siklikBirim: siklikBirimiSemasi.nullish().transform((b) => b ?? null),
  sonrakiTarih: tarihSemasi,
  firmaId: kimlik.nullish().transform((f) => f ?? null),
  aciklama: istege(NOT_EN_UZUN),
};
const siklikButun = (g: { siklikDeger: number | null; siklikBirim: string | null }) => (g.siklikDeger === null) === (g.siklikBirim === null);
const SIKLIK_ILETISI = { message: 'Sıklık sayı ve birimle birlikte girilir.', path: ['siklikDeger'] };

export const kontrolEkleGovdesi = z.object({ tur: kontrolTuruSemasi, ...kontrolAlanlari }).refine(siklikButun, SIKLIK_ILETISI);
// Tür değişmez: atık kaydı ile yasal kontrolün geçmişi karışmaz.
export const kontrolGuncelleGovdesi = z.object({ ...beklenenSurum, ...kontrolAlanlari }).refine(siklikButun, SIKLIK_ILETISI);

// IDR-13: "yapıldı" kaydı. Boş sonraki tarih sıklıktan hesaplanır; atıkta miktar ve birim zorunludur (sunucu kuralı).
export const yapildiGovdesi = z.object({
  ...beklenenSurum,
  yapilma: tarihSemasi,
  sonrakiTarih: tarihSemasi.nullish().transform((t) => t ?? null),
  belgeNo: istege(BELGE_NO_EN_UZUN),
  not: istege(NOT_EN_UZUN),
  miktar: ondalikMetinSemasi.nullish().transform((m) => m ?? null),
  birim: atikBirimiSemasi.nullish().transform((b) => b ?? null),
  firmaId: kimlik.nullish().transform((f) => f ?? null),
});
export const bitirGovdesi = z.object({ ...beklenenSurum, neden: istege(NOT_EN_UZUN) });

export const kontrolSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  tur: kontrolTuruSemasi,
  siklikDeger: z.number().int().nullable(),
  siklikBirim: siklikBirimiSemasi.nullable(),
  sonrakiTarih: tarihSemasi,
  // Etkin kalemin bugüne göre grubu ve kalan günü (geçmişse eksi); sunucu tarihinden.
  grup: kontrolGrubuSemasi,
  kalanGun: z.number().int(),
  firmaId: z.number().int().nullable(),
  firmaAd: z.string().nullable(),
  aciklama: z.string().nullable(),
  aktif: z.boolean(),
  surum: surumSemasi,
});
export const kontrolCevabi = z.object({ kontrol: kontrolSemasi });
export const KONTROL_EN_COK = 500;
export const kontrollerCevabi = z.object({ kontroller: z.array(kontrolSemasi) });

export const kontrolKaydiSemasi = z.object({
  id: z.number().int(),
  yapilma: tarihSemasi,
  oncekiTarih: tarihSemasi,
  sonrakiTarih: tarihSemasi,
  belgeNo: z.string().nullable(),
  not: z.string().nullable(),
  miktar: ondalikMetinSemasi.nullable(),
  birim: atikBirimiSemasi.nullable(),
  firmaAd: z.string().nullable(),
  kaydedenAd: z.string().nullable(),
  kayit: zamanSemasi,
});
export const kontrolKayitlariCevabi = z.object({ kayitlar: z.array(kontrolKaydiSemasi) });

export const firmaSecimSorgusu = z.object({ ara: z.string().trim().max(100).default('') });
export const firmaSecenekleriCevabi = z.object({ firmalar: z.array(z.object({ id: z.number().int(), ad: z.string() })) });

// Filo araç kartı (172 a). Plaka sunucuda biçimlenir ("34 ABC 123"); km azalmaz. Görev ve masraf sonraki parçalarda.
export const ARAC_TURLERI = ['binek', 'kamyonet', 'kamyon', 'minibus', 'diger'] as const;
export const aracTuruSemasi = z.enum(ARAC_TURLERI);
export const SAHIPLIKLER = ['sirket', 'kiralik'] as const;
export const sahiplikSemasi = z.enum(SAHIPLIKLER);
export const ARAC_DURUMLARI = ['musait', 'gorevde', 'serviste', 'pasif'] as const;
export const aracDurumuSemasi = z.enum(ARAC_DURUMLARI);
// IDR-19: muayene, sigorta ve bakım uyarısı.
export const ARAC_UYARI_TURLERI = ['muayene', 'sigorta', 'bakim'] as const;
export const aracUyariTuruSemasi = z.enum(ARAC_UYARI_TURLERI);
export const PLAKA_EN_UZUN = 14;
export const MARKA_MODEL_EN_UZUN = 80;
export const KM_EN_COK = 9_999_999;

const kmSemasi = z.number().int().min(0).max(KM_EN_COK).nullish().transform((k) => k ?? null);
const aracAlanlari = {
  plaka: z.string().trim().min(1, 'Plaka boş olamaz.').max(PLAKA_EN_UZUN, `En çok ${PLAKA_EN_UZUN} karakter.`),
  tur: aracTuruSemasi,
  markaModel: istege(MARKA_MODEL_EN_UZUN),
  sahiplik: sahiplikSemasi,
  durum: aracDurumuSemasi.default('musait'),
  km: kmSemasi,
  sonrakiBakimKm: kmSemasi,
  muayeneTarihi: tarihSemasi.nullish().transform((t) => t ?? null),
  sigortaTarihi: tarihSemasi.nullish().transform((t) => t ?? null),
  sevkiyatta: z.boolean().default(false),
  aciklama: istege(NOT_EN_UZUN),
};
export const aracEkleGovdesi = z.object(aracAlanlari);
export const aracGuncelleGovdesi = z.object({ ...beklenenSurum, ...aracAlanlari });

export const aracUyarisiSemasi = z.object({
  tur: aracUyariTuruSemasi,
  gecti: z.boolean(),
  // Tarih uyarısında kalan gün, bakım uyarısında kalan km (geçmişse eksi); öteki null.
  kalanGun: z.number().int().nullable(),
  kalanKm: z.number().int().nullable(),
});
export const aracSemasi = z.object({
  id: z.number().int(),
  plaka: z.string(),
  tur: aracTuruSemasi,
  markaModel: z.string().nullable(),
  sahiplik: sahiplikSemasi,
  durum: aracDurumuSemasi,
  km: z.number().int().nullable(),
  sonrakiBakimKm: z.number().int().nullable(),
  muayeneTarihi: tarihSemasi.nullable(),
  sigortaTarihi: tarihSemasi.nullable(),
  sevkiyatta: z.boolean(),
  aciklama: z.string().nullable(),
  uyarilar: z.array(aracUyarisiSemasi),
  surum: surumSemasi,
});
export const aracCevabi = z.object({ arac: aracSemasi });
export const ARAC_EN_COK = 500;
export const araclarCevabi = z.object({ araclar: z.array(aracSemasi) });

// Araç görev talebi (247 a): her çalışan kendi adına açar; idari işler araç verip onaylar ya da reddeder, çıkış ve dönüş km'sini yazar.
// IDR-23: bekliyor -> onaylandi (araç) -> yolda (çıkış km) -> tamamlandi (dönüş km); reddedildi ve geri_cekildi de son durumdur.
export const GOREV_DURUMLARI = ['bekliyor', 'onaylandi', 'yolda', 'tamamlandi', 'reddedildi', 'geri_cekildi'] as const;
export const gorevDurumuSemasi = z.enum(GOREV_DURUMLARI);
export const AMAC_EN_UZUN = 200;
export const VARIS_EN_UZUN = 120;
// IDR-24: görev en çok 30 gün sürer; talep en çok 60 gün sonrasına açılır.
export const GOREV_EN_UZUN_GUN = 30;
export const GOREV_ILERI_GUN = 60;

export const aracTalebiAcGovdesi = z.object({
  amac: z.string().trim().min(1, 'Amaç boş olamaz.').max(AMAC_EN_UZUN, `En çok ${AMAC_EN_UZUN} karakter.`),
  varis: z.string().trim().min(1, 'Gidilecek yer boş olamaz.').max(VARIS_EN_UZUN, `En çok ${VARIS_EN_UZUN} karakter.`),
  tarih: tarihSemasi,
  donusTarihi: tarihSemasi,
  aciklama: istege(NOT_EN_UZUN),
});
export const gorevOnaylaGovdesi = z.object({ ...beklenenSurum, aracId: kimlik });
export const gorevKmGovdesi = z.object({ ...beklenenSurum, km: z.number().int().min(0).max(KM_EN_COK) });

export const aracGoreviSemasi = z.object({
  id: z.number().int(),
  talepEdenKisiId: z.number().int(),
  talepEdenAd: z.string().nullable(),
  amac: z.string(),
  varis: z.string(),
  tarih: tarihSemasi,
  donusTarihi: tarihSemasi,
  aciklama: z.string().nullable(),
  durum: gorevDurumuSemasi,
  talep: zamanSemasi,
  aracId: z.number().int().nullable(),
  plaka: z.string().nullable(),
  onaylayanAd: z.string().nullable(),
  onay: zamanSemasi.nullable(),
  redNedeni: z.string().nullable(),
  cikisKm: z.number().int().nullable(),
  cikis: zamanSemasi.nullable(),
  donusKm: z.number().int().nullable(),
  donus: zamanSemasi.nullable(),
  kapanma: zamanSemasi.nullable(),
  surum: surumSemasi,
});
export const aracGoreviCevabi = z.object({ gorev: aracGoreviSemasi });
// Liste: açık görevler (bekleyen, onaylı, yolda) ve son 14 günde kapananlar; kişinin kendi listesi en yeni GOREV_EN_COK kayıt.
export const GOREV_EN_COK = 200;
export const GOREV_KAPANAN_GUN = 14;
export const aracGorevleriCevabi = z.object({ gorevler: z.array(aracGoreviSemasi) });

// Araç masrafı (172 a, 3. dilim): tutar TL; kayıt değişmez, gerekçeyle iptal edilir. Tutarı idari-isler.oku okur.
export const MASRAF_TURLERI = ['yakit', 'bakim', 'onarim', 'lastik', 'muayene', 'sigorta', 'ceza', 'otoyol', 'kira', 'diger'] as const;
export const masrafTuruSemasi = z.enum(MASRAF_TURLERI);
// IDR-27: tutar 0'dan büyük, en çok 9.999.999.999,99 ve en çok iki kuruş basamağı; tarih bugünden ileri değil.
export const TUTAR_EN_COK = '9999999999.99';

export const masrafEkleGovdesi = z.object({
  tarih: tarihSemasi,
  tur: masrafTuruSemasi,
  tutar: ondalikMetinSemasi,
  km: kmSemasi,
  belgeNo: istege(BELGE_NO_EN_UZUN),
  aciklama: istege(NOT_EN_UZUN),
});
export const masrafIptalGovdesi = z.object({
  ...beklenenSurum,
  neden: z.string().trim().min(1, 'İptal nedeni zorunlu.').max(NOT_EN_UZUN, `En çok ${NOT_EN_UZUN} karakter.`),
});

export const masrafSemasi = z.object({
  id: z.number().int(),
  aracId: z.number().int(),
  tarih: tarihSemasi,
  tur: masrafTuruSemasi,
  tutar: ondalikMetinSemasi,
  km: z.number().int().nullable(),
  belgeNo: z.string().nullable(),
  aciklama: z.string().nullable(),
  kaydedenAd: z.string().nullable(),
  kayit: zamanSemasi,
  iptal: zamanSemasi.nullable(),
  iptalNedeni: z.string().nullable(),
  surum: surumSemasi,
});
export const masrafCevabi = z.object({ masraf: masrafSemasi });
// Aracın en yeni MASRAF_EN_COK kaydı; yıl toplamı bu yılın iptal edilmemiş kayıtlarıdır, kayıt yoksa null.
export const MASRAF_EN_COK = 200;
export const masraflarCevabi = z.object({ masraflar: z.array(masrafSemasi), yilToplami: ondalikMetinSemasi.nullable() });

// Demirbaş ve zimmet (170 a, 244 a): seri numaralı tekil eşya ve kime verildiği. İK'daki zimmet kayıtları buraya taşınır; İK buradan okur.
export const DEMIRBAS_TURLERI = ['dizustu', 'masaustu', 'monitor', 'telefon', 'hat', 'arac', 'giris_karti', 'anahtar', 'kkd', 'diger'] as const;
export const demirbasTuruSemasi = z.enum(DEMIRBAS_TURLERI);
// IDR-30: zimmetli yalnız zimmetle olur, iadeyle biter; öteki durumlar elle seçilir. Hurda son durumdur.
export const DEMIRBAS_DURUMLARI = ['bosta', 'zimmetli', 'bakimda', 'kayip', 'hurda'] as const;
export const demirbasDurumuSemasi = z.enum(DEMIRBAS_DURUMLARI);
export const ELLE_DURUMLAR = ['bosta', 'bakimda', 'kayip', 'hurda'] as const;
export const elleDurumSemasi = z.enum(ELLE_DURUMLAR);
// IDR-31: iade sağlamsa demirbaş boşa, hasarlıysa bakıma, kayıpsa kayba düşer.
export const IADE_DURUMLARI = ['saglam', 'hasarli', 'kayip'] as const;
export const iadeDurumuSemasi = z.enum(IADE_DURUMLARI);
export const SERI_NO_EN_UZUN = 80;
// IDR-29: değer TL, sıfırdan büyük, en çok iki kuruş basamağı.
export const DEGER_EN_COK = '999999999999.99';

const demirbasAlanlari = {
  tur: demirbasTuruSemasi,
  markaModel: istege(MARKA_MODEL_EN_UZUN),
  seriNo: istege(SERI_NO_EN_UZUN),
  deger: ondalikMetinSemasi.nullish().transform((d) => d ?? null),
  aciklama: istege(NOT_EN_UZUN),
};
export const demirbasEkleGovdesi = z.object(demirbasAlanlari);
// Durum yoksa değişmez; zimmetli demirbaşın öteki alanları durumsuz düzenlenir.
export const demirbasGuncelleGovdesi = z.object({ ...beklenenSurum, ...demirbasAlanlari, durum: elleDurumSemasi.nullish().transform((d) => d ?? null) });
// Zimmetleme demirbaşın sürümüyle; iade ve kişiye bağlama zimmetin sürümüyle gider.
export const zimmetleGovdesi = z.object({ ...beklenenSurum, kisiId: kimlik, verilis: tarihSemasi, aciklama: istege(NOT_EN_UZUN) });
export const iadeGovdesi = z.object({ ...beklenenSurum, iade: tarihSemasi, iadeDurumu: iadeDurumuSemasi, iadeNotu: istege(NOT_EN_UZUN) });
export const kisiyeBaglaGovdesi = z.object({ ...beklenenSurum, kisiId: kimlik });

export const zimmetSemasi = z.object({
  id: z.number().int(),
  demirbasId: z.number().int(),
  // Taşınan kayıtta kişi bağı yoksa kisiId null, personelAdi İK'daki addır.
  kisiId: z.number().int().nullable(),
  kisiAd: z.string().nullable(),
  personelAdi: z.string().nullable(),
  verilis: tarihSemasi.nullable(),
  iade: tarihSemasi.nullable(),
  iadeDurumu: iadeDurumuSemasi.nullable(),
  iadeNotu: z.string().nullable(),
  aciklama: z.string().nullable(),
  verenAd: z.string().nullable(),
  iadeAlanAd: z.string().nullable(),
  ikdenTasindi: z.boolean(),
  surum: surumSemasi,
});
export const zimmetCevabi = z.object({ zimmet: zimmetSemasi });
export const zimmetlerCevabi = z.object({ zimmetler: z.array(zimmetSemasi) });
export const demirbasSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  tur: demirbasTuruSemasi,
  markaModel: z.string().nullable(),
  seriNo: z.string().nullable(),
  deger: ondalikMetinSemasi.nullable(),
  durum: demirbasDurumuSemasi,
  aciklama: z.string().nullable(),
  acikZimmet: zimmetSemasi.nullable(),
  surum: surumSemasi,
});
export const demirbasCevabi = z.object({ demirbas: demirbasSemasi });
export const DEMIRBAS_EN_COK = 1000;
export const demirbaslarCevabi = z.object({ demirbaslar: z.array(demirbasSemasi) });

// Bugün: senden beklenen işler (aciliyet ve zamana göre sıralı) ve günün sayıları. Kontrol, süresi geçen ya da 7 gün içindeki kalemdir.
// Araç, süresi geçen ya da 7 gün içindeki muayene ve sigortası ya da bakım km'si geçen araçtır.
export const BUGUN_IS_TURLERI = ['talep', 'kontrol', 'arac'] as const;
export const bugunIsiSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('talep'), talep: talepSemasi }),
  z.object({ tur: z.literal('kontrol'), kontrol: kontrolSemasi }),
  z.object({ tur: z.literal('arac'), arac: aracSemasi }),
]);
export const bugunCevabi = z.object({
  isler: z.array(bugunIsiSemasi),
  sayilar: z.object({
    acikTalep: z.number().int().nonnegative(),
    acilTalep: z.number().int().nonnegative(),
    bugunAcilan: z.number().int().nonnegative(),
    bugunKapanan: z.number().int().nonnegative(),
    gecenKontrol: z.number().int().nonnegative(),
    yakinKontrol: z.number().int().nonnegative(),
    aracUyarisi: z.number().int().nonnegative(),
  }),
});

// Yemek sayısı (171 a): günün vardiya kadrosu - izinli + fazla mesaiye kalan + yemeğe kalan ziyaretçi + gerekçeli düzeltme.
// Kadro ve izinli sunucuda Vardiya ve İK'dan hesaplanır; fazla mesai ve ziyaretçi bağlamaya kadar elle girilir (uyum borcu).
export const YEMEK_ADET_EN_COK = 999;
export const DUZELTME_NEDENI_EN_UZUN = 200;
// IDR-17: bugün ve sonraki 7 gün bildirilebilir; geçmiş güne bildirim yazılmaz.
export const YEMEK_ILERI_GUN = 7;
export const YEMEK_GECMIS_GUN = 14;

const adet = z.number().int().min(0).max(YEMEK_ADET_EN_COK);
export const yemekSorgusu = z.object({ tarih: tarihSemasi.optional() });
// Ekranın gösterdiği kadro ve izinli de gelir: bildirim anında değişmişse sunucu reddeder, ekran yenilenir (IDR-17).
export const yemekBildirGovdesi = z.object({
  tarih: tarihSemasi,
  kadro: adet,
  izinli: adet,
  fazlaMesai: adet,
  ziyaretci: adet,
  duzeltme: z.number().int().min(-YEMEK_ADET_EN_COK).max(YEMEK_ADET_EN_COK).default(0),
  duzeltmeNedeni: istege(DUZELTME_NEDENI_EN_UZUN),
});

export const yemekBildirimiSemasi = z.object({
  id: z.number().int(),
  tarih: tarihSemasi,
  kadro: z.number().int(),
  izinli: z.number().int(),
  fazlaMesai: z.number().int(),
  ziyaretci: z.number().int(),
  duzeltme: z.number().int(),
  duzeltmeNedeni: z.string().nullable(),
  sayi: z.number().int(),
  bildirenAd: z.string().nullable(),
  bildirim: zamanSemasi,
});
// Son günler: günün son bildirimi; hesaplanan, düzeltmesiz sayıdır.
export const yemekGecmisiSatiri = z.object({ tarih: tarihSemasi, hesaplanan: z.number().int(), sayi: z.number().int() });
export const yemekGunuCevabi = z.object({
  tarih: tarihSemasi,
  bugun: tarihSemasi,
  kadro: z.number().int().nonnegative(),
  izinli: z.number().int().nonnegative(),
  fazlaMesai: z.number().int().nonnegative(),
  son: yemekBildirimiSemasi.nullable(),
  gecmis: z.array(yemekGecmisiSatiri),
});

export type TalepKategorisi = z.output<typeof talepKategorisiSemasi>;
export type TalepDurumu = z.output<typeof talepDurumuSemasi>;
export type TalepAciliyeti = z.output<typeof talepAciliyetiSemasi>;
export type TalepAcGovdesi = z.input<typeof talepAcGovdesi>;
export type TalepAcVerisi = z.output<typeof talepAcGovdesi>;
export type UstlenGovdesi = z.input<typeof ustlenGovdesi>;
export type KapatGovdesi = z.input<typeof kapatGovdesi>;
export type ReddetGovdesi = z.input<typeof reddetGovdesi>;
export type Talep = z.output<typeof talepSemasi>;
export type TalepCevabi = z.output<typeof talepCevabi>;
export type TalepPanosuCevabi = z.output<typeof talepPanosuCevabi>;
export type TaleplerimSorgusu = z.input<typeof taleplerimSorgusu>;
export type TaleplerimSuzgeci = z.output<typeof taleplerimSorgusu>;
export type TaleplerimCevabi = z.output<typeof taleplerimCevabi>;
export type SonYerlerCevabi = z.output<typeof sonYerlerCevabi>;
export type KisiSecenekleriCevabi = z.output<typeof kisiSecenekleriCevabi>;
export type BugunIsi = z.output<typeof bugunIsiSemasi>;
export type BugunCevabi = z.output<typeof bugunCevabi>;
export type KontrolTuru = z.output<typeof kontrolTuruSemasi>;
export type SiklikBirimi = z.output<typeof siklikBirimiSemasi>;
export type AtikBirimi = z.output<typeof atikBirimiSemasi>;
export type KontrolGrubu = z.output<typeof kontrolGrubuSemasi>;
export type KontrolEkleGovdesi = z.input<typeof kontrolEkleGovdesi>;
export type KontrolEkleVerisi = z.output<typeof kontrolEkleGovdesi>;
export type KontrolGuncelleGovdesi = z.input<typeof kontrolGuncelleGovdesi>;
export type KontrolGuncelleVerisi = z.output<typeof kontrolGuncelleGovdesi>;
export type YapildiGovdesi = z.input<typeof yapildiGovdesi>;
export type YapildiVerisi = z.output<typeof yapildiGovdesi>;
export type BitirGovdesi = z.input<typeof bitirGovdesi>;
export type Kontrol = z.output<typeof kontrolSemasi>;
export type KontrolCevabi = z.output<typeof kontrolCevabi>;
export type KontrollerCevabi = z.output<typeof kontrollerCevabi>;
export type KontrolKaydi = z.output<typeof kontrolKaydiSemasi>;
export type KontrolKayitlariCevabi = z.output<typeof kontrolKayitlariCevabi>;
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
export type YemekBildirGovdesi = z.input<typeof yemekBildirGovdesi>;
export type YemekBildirVerisi = z.output<typeof yemekBildirGovdesi>;
export type YemekBildirimi = z.output<typeof yemekBildirimiSemasi>;
export type YemekGecmisiSatiri = z.output<typeof yemekGecmisiSatiri>;
export type YemekGunuCevabi = z.output<typeof yemekGunuCevabi>;
export type AracTuru = z.output<typeof aracTuruSemasi>;
export type Sahiplik = z.output<typeof sahiplikSemasi>;
export type AracDurumu = z.output<typeof aracDurumuSemasi>;
export type AracUyariTuru = z.output<typeof aracUyariTuruSemasi>;
export type AracEkleGovdesi = z.input<typeof aracEkleGovdesi>;
export type AracEkleVerisi = z.output<typeof aracEkleGovdesi>;
export type AracGuncelleGovdesi = z.input<typeof aracGuncelleGovdesi>;
export type AracGuncelleVerisi = z.output<typeof aracGuncelleGovdesi>;
export type AracUyarisi = z.output<typeof aracUyarisiSemasi>;
export type Arac = z.output<typeof aracSemasi>;
export type AracCevabi = z.output<typeof aracCevabi>;
export type AraclarCevabi = z.output<typeof araclarCevabi>;
export type GorevDurumu = z.output<typeof gorevDurumuSemasi>;
export type MasrafTuru = z.output<typeof masrafTuruSemasi>;
export type MasrafEkleGovdesi = z.input<typeof masrafEkleGovdesi>;
export type MasrafEkleVerisi = z.output<typeof masrafEkleGovdesi>;
export type Masraf = z.output<typeof masrafSemasi>;
export type MasrafCevabi = z.output<typeof masrafCevabi>;
export type MasraflarCevabi = z.output<typeof masraflarCevabi>;
export type DemirbasTuru = z.output<typeof demirbasTuruSemasi>;
export type DemirbasDurumu = z.output<typeof demirbasDurumuSemasi>;
export type ElleDurum = z.output<typeof elleDurumSemasi>;
export type IadeDurumu = z.output<typeof iadeDurumuSemasi>;
export type DemirbasEkleGovdesi = z.input<typeof demirbasEkleGovdesi>;
export type DemirbasEkleVerisi = z.output<typeof demirbasEkleGovdesi>;
export type DemirbasGuncelleVerisi = z.output<typeof demirbasGuncelleGovdesi>;
export type ZimmetleVerisi = z.output<typeof zimmetleGovdesi>;
export type IadeVerisi = z.output<typeof iadeGovdesi>;
export type Zimmet = z.output<typeof zimmetSemasi>;
export type ZimmetCevabi = z.output<typeof zimmetCevabi>;
export type ZimmetlerCevabi = z.output<typeof zimmetlerCevabi>;
export type Demirbas = z.output<typeof demirbasSemasi>;
export type DemirbasCevabi = z.output<typeof demirbasCevabi>;
export type DemirbaslarCevabi = z.output<typeof demirbaslarCevabi>;
export type AracTalebiAcGovdesi = z.input<typeof aracTalebiAcGovdesi>;
export type AracTalebiAcVerisi = z.output<typeof aracTalebiAcGovdesi>;
export type AracGorevi = z.output<typeof aracGoreviSemasi>;
export type AracGoreviCevabi = z.output<typeof aracGoreviCevabi>;
export type AracGorevleriCevabi = z.output<typeof aracGorevleriCevabi>;
