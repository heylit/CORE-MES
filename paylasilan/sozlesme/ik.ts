import { z } from 'zod';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

/* İnsan Kaynakları: ekran çerçevedeki uygulamadır (istemci/src/moduller/ik); kayıtlarını bütün olarak saklar, sunucu
   denetlenen alanları ayrı sütunlarda tutar ve kuralları uygular. Kayıt biçimi: docs/VERI-MODELI.md (ik-modulu). */

// Kaydın türü uygulamanın `kind` alanıdır. Bordro (`pay`) yalnız kesinleştirme ucuyla yazılır.
export const IK_TURLERI = ['emp', 'dept', 'leave', 'att', 'pay', 'perf', 'train', 'job', 'cand', 'intv'] as const;
export type IkTuru = (typeof IK_TURLERI)[number];

// Yazma uçlarının adres parçası -> tür. Her alanın kendi yazma işlemi vardır (sunucu/moduller/ik/kurallar.ts IK_ALANLARI).
export const IK_ALAN_ADLARI = ['personel', 'departmanlar', 'izinler', 'devam', 'performans', 'egitimler', 'pozisyonlar', 'adaylar', 'gorusmeler'] as const;
export type IkAlani = (typeof IK_ALAN_ADLARI)[number];
export const IK_ALAN_TURU = {
  personel: 'emp', departmanlar: 'dept', izinler: 'leave', devam: 'att', performans: 'perf', egitimler: 'train',
  pozisyonlar: 'job', adaylar: 'cand', gorusmeler: 'intv',
} as const satisfies Record<IkAlani, Exclude<IkTuru, 'pay'>>;

export const IZIN_DURUMLARI = ['Beklemede', 'Onaylandı', 'Reddedildi', 'İptal'] as const;
export const POZISYON_DURUMLARI = ['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı'] as const;
export const IK_ROLLERI = ['ik', 'yonetici', 'calisan'] as const;
export type IkRolu = (typeof IK_ROLLERI)[number];

// Çerçevedeki uygulamanın ürettiği kimlikler (`emp_x1y2`, `pay_<personel>_<ay>`).
export const ikKimligi = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Kayıt kimliği geçersiz.');
// Kaydın alanlarını uygulama belirler; sunucu denetlediği alanları ayrıca okur (kurallar.ts), kalanı olduğu gibi saklar.
export const ikGovdesi = z.record(z.string(), z.unknown());
const donemSemasi = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, 'Dönem GGGG-AA biçiminde olmalı.');

export const ikKimlikParametresi = z.object({ kimlik: ikKimligi });
export const ikDonemParametresi = z.object({ donem: donemSemasi });

// Yeni kayıtta sürüm null; var olan kayıtta okunan sürüm.
export const ikKaydetGovdesi = z.object({ govde: ikGovdesi, surum: surumSemasi.nullable() });
export const ikIptalGovdesi = z.object({ surum: surumSemasi });
export const IK_TOPLU_SINIR = 500;
export const ikTopluGovde = z.object({
  kayitlar: z.array(z.object({ kimlik: ikKimligi, govde: ikGovdesi, surum: surumSemasi.nullable() })).min(1).max(IK_TOPLU_SINIR),
});
export const ikOnayGovdesi = z.object({ surum: surumSemasi });
// Bordro onayı okunan bordronun sürümünü taşır: arada yeniden kesinleşen bordro onaylanmaz (IK-43).
export const ikBordroGordumGovdesi = z.object({ surum: surumSemasi });
export const ikKararGovdesi = z.object({ durum: z.enum(['Onaylandı', 'Reddedildi']), surum: surumSemasi });
// Devam kaydının onayı (IK-77, IK-78): onay verilir ya da geri alınır; kaydın içeriği gönderilmez.
export const ikDevamOnayGovdesi = z.object({ durum: z.enum(['Onaylandı', 'Beklemede']), surum: surumSemasi });
const iletisimAlani = z.string().trim().max(300);
export const ikIletisimGovdesi = z.object({
  alanlar: z.object({
    telefon: iletisimAlani, eposta: iletisimAlani, adres: iletisimAlani, acilKisi: iletisimAlani, acilYakinlik: iletisimAlani, acilTelefon: iletisimAlani,
  }).partial(),
  surum: surumSemasi,
});
// Kesinleştirmede istemci yalnız girdileri yollar; vergi, SGK ve net sunucuda hesaplanır.
const tutar = z.number().finite().min(0).max(1_000_000_000);
export const ikBordroGirdisi = z.object({
  brut: tutar, gun: z.number().int().min(0).max(31).optional(), ek: tutar, mesaiSaat: z.number().finite().min(0).max(744),
  tatilSaat: z.number().finite().min(0).max(744), kesinti: tutar,
}).strict();
export const ikKesinlestirGovdesi = z.object({
  girdiler: z.record(ikKimligi, ikBordroGirdisi).refine((g) => Object.keys(g).length > 0 && Object.keys(g).length <= 2000, 'En az bir çalışan gerekli.'),
});
export const ikAyarKaydetGovdesi = z.object({ govde: ikGovdesi, surum: surumSemasi.nullable() });

/* ---------------- cevaplar ---------------- */

export const ikKayitSemasi = z.object({ kimlik: ikKimligi, tur: z.enum(IK_TURLERI), surum: surumSemasi, govde: ikGovdesi });
// Değişiklik geçmişinin satırı, uygulamanın günlük kaydı biçimindedir (`kind: 'log'`); geçmişi sunucu yazar.
export const ikGecmisSemasi = z.object({
  id: z.string(),
  kind: z.literal('log'),
  t: zamanSemasi,
  by: z.object({ id: z.number().int(), name: z.string(), role: z.string() }),
  op: z.enum(['ekle', 'guncelle', 'sil', 'geri', 'ayarlar', 'toplu']),
  rk: z.string(),
  rid: z.string(),
  label: z.string(),
  changes: z.array(z.object({ f: z.string(), from: z.unknown().optional(), to: z.unknown().optional(), big: z.boolean().optional(), gizli: z.boolean().optional() })),
  snap: ikGovdesi.nullable(),
  note: z.string().optional(),
});
export const ikBenSemasi = z.object({
  kisi: z.object({ id: z.number().int(), ad: z.string() }),
  rol: z.enum(IK_ROLLERI),
  // Kişinin personel kaydı (personel kartındaki TMI kullanıcısı alanı); yoksa null.
  personelKimlik: ikKimligi.nullable(),
  // Hiçbir İK yazma işlemi yoksa ekran salt okunur açılır; kısmi yetkiyi her uç ayrıca denetler.
  saltOkunur: z.boolean(),
  // Personel kartındaki "TMI kullanıcısı" ve "İş merkezi" seçimleri (yalnız İK; iş merkezleri kişinin kapsamındakiler).
  secenekler: z.object({
    kisiler: z.array(z.object({ id: z.number().int(), ad: z.string(), sicilNo: z.string().nullable() })),
    isMerkezleri: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string() })),
  }),
});
export const ikBenCevabi = ikBenSemasi;
export const ikVeriCevabi = z.object({
  ben: ikBenSemasi,
  kayitlar: z.array(ikKayitSemasi),
  ayarlar: z.object({ govde: ikGovdesi.nullable(), surum: surumSemasi.nullable() }),
  gecmis: z.array(ikGecmisSemasi),
});
// IK-74: kayıt yazıldı ama yazanın bilmesi gereken bir durum var (çıkışta iade edilmemiş zimmet).
export const ikYazCevabi = z.object({ kayit: ikKayitSemasi, gecmis: z.array(ikGecmisSemasi), uyari: z.string().optional() });
export const ikTopluCevabi = z.object({ kayitlar: z.array(ikKayitSemasi), gecmis: z.array(ikGecmisSemasi) });
export const ikAyarCevabi = z.object({ ayarlar: z.object({ govde: ikGovdesi, surum: surumSemasi }), gecmis: z.array(ikGecmisSemasi) });
// Yönetici paneli: bugün onaylı izinde ve raporda olan kişi sayısı (IK-53); kişi adı dönmez.
export const ikOzetiCevabi = z.object({ izinli: z.number().int().nonnegative(), raporlu: z.number().int().nonnegative() });

/* ---------------- puantaj (kart #1571) ---------------- */

// Günün durumu; giriş ve çıkış saati yalnız çalışılan günde yazılır (IK-61).
export const PUANTAJ_DURUMLARI = ['calisti', 'izinli', 'raporlu', 'devamsiz', 'hafta_tatili', 'resmi_tatil'] as const;
export type PuantajDurumu = (typeof PUANTAJ_DURUMLARI)[number];
// Puantajdan önerilen fazla mesai türü; İK "Devam kaydına aktar" ile devam kaydı açar (otomatik yazılmaz, kullanıcı kararı 16.10.2026).
export const PUANTAJ_FAZLA_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'] as const;
const saatMetni = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Saat SS:DD biçiminde olmalı.');

export const ikPuantajSorgusu = z.object({ ay: donemSemasi, personel: ikKimligi.optional() });
// Soru 74: izin ekranının gün önerisi; kaydı sınırlayan iş günü hesabının aynısıdır (kişinin vardiya takvimi).
export const ikIzinGunuSorgusu = z.object({ personel: ikKimligi, baslangic: tarihSemasi, bitis: tarihSemasi });
export const ikIzinGunuCevabi = z.object({ isGunu: z.number().int().min(0) });
// Soru 75: kişi sayfasının salt okunur Vardiya bölümü; vardiya Vardiya modülünündür. İş merkezine bağlanamayan kişide null.
// secili null: kişiye vardiya seçilmemiş, iş merkezinin bütün vardiyalarında sayılır. Hafta pazartesiden (1) pazara (7).
export const ikKisiVardiyasiSorgusu = z.object({ personel: ikKimligi });
const haftaVardiyasi = z.object({ ad: z.string(), baslangic: z.string(), bitis: z.string() });
export const ikKisiVardiyasiCevabi = z.object({
  vardiya: z.object({
    isMerkezi: z.object({ id: z.number().int().positive(), kod: z.string(), ad: z.string() }),
    secili: z.string().nullable(),
    hafta: z.array(z.object({ gun: z.number().int().min(1).max(7), vardiyalar: z.array(haftaVardiyasi) })).length(7),
  }).nullable(),
});
const puantajKaydi = z.object({
  tarih: tarihSemasi,
  durum: z.enum(PUANTAJ_DURUMLARI),
  giris: saatMetni.nullable(),
  // Çıkış girişten önceyse çalışma ertesi güne uzanır.
  cikis: saatMetni.nullable(),
  aciklama: z.string().nullable(),
  surum: surumSemasi,
  yazan: z.string(),
  yazildi: zamanSemasi,
  // Mola düşülmüş çalışma; çıkış girilmemişse ya da gün çalışılmadıysa null (IK-68).
  calismaDakika: z.number().int().nullable(),
  // Planın üstündeki çalışma; kişinin vardiya planı bilinmiyorsa null, sıfır uydurulmaz (IK-68).
  fazlaDakika: z.number().int().nullable(),
  fazlaTuru: z.enum(PUANTAJ_FAZLA_TURLERI).nullable(),
});
// Kişinin o günkü vardiya planı (Vardiya modülünden): net dakika, ilk başlangıç ve son bitiş, tatil ya da kapalı gün.
const puantajPlanGunu = z.object({
  tarih: tarihSemasi,
  dakika: z.number().int(),
  baslangic: saatMetni.nullable(),
  bitis: saatMetni.nullable(),
  kapali: z.enum(['tatil', 'kapali']).nullable(),
  ad: z.string().nullable(),
});
export const ikPuantajCevabi = z.object({
  ay: donemSemasi,
  gunler: z.array(tarihSemasi),
  kisiler: z.array(z.object({
    personel: ikKimligi,
    // Bu ayın bordrosu kesinleşmiş: kilit açma yetkisi olmadan değişmez (IK-65).
    kilitli: z.boolean(),
    // Kişinin vardiyası (ya da TMI kullanıcısı) yoksa null.
    plan: z.array(puantajPlanGunu).nullable(),
    kayitlar: z.array(puantajKaydi),
  })),
});
// Tek hücre de toplu seçim de aynı uçtan yazılır; durum null günü temizler (kaydı siler). Yeni gün sürüm null taşır.
export const ikPuantajGunuGirdisi = z.object({
  personel: ikKimligi,
  tarih: tarihSemasi,
  durum: z.enum(PUANTAJ_DURUMLARI).nullable(),
  giris: saatMetni.nullable(),
  cikis: saatMetni.nullable(),
  aciklama: z.string().trim().max(300).nullable().transform((a) => (a ? a : null)),
  surum: surumSemasi.nullable(),
}).strict();
export const ikPuantajYazGovdesi = z.object({ gunler: z.array(ikPuantajGunuGirdisi).min(1).max(IK_TOPLU_SINIR) });
export const ikPuantajYazCevabi = z.object({
  kayitlar: z.array(puantajKaydi.extend({ personel: ikKimligi })),
  silinen: z.array(z.object({ personel: ikKimligi, tarih: tarihSemasi })),
});

export type IkKayit = z.output<typeof ikKayitSemasi>;
export type IkGecmis = z.output<typeof ikGecmisSemasi>;
export type IkBen = z.output<typeof ikBenSemasi>;
export type IkVeriCevabi = z.output<typeof ikVeriCevabi>;
export type IkYazCevabi = z.output<typeof ikYazCevabi>;
export type IkTopluCevabi = z.output<typeof ikTopluCevabi>;
export type IkAyarCevabi = z.output<typeof ikAyarCevabi>;
export type IkOzetiCevabi = z.output<typeof ikOzetiCevabi>;
export type IkBordroGirdisi = z.output<typeof ikBordroGirdisi>;
export type IkPuantajCevabi = z.output<typeof ikPuantajCevabi>;
export type IkIzinGunuCevabi = z.output<typeof ikIzinGunuCevabi>;
export type IkKisiVardiyasiCevabi = z.output<typeof ikKisiVardiyasiCevabi>;
export type IkPuantajKaydi = IkPuantajCevabi['kisiler'][number]['kayitlar'][number];
export type IkPuantajPlanGunu = z.output<typeof puantajPlanGunu>;
export type IkPuantajGunuGirdisi = z.output<typeof ikPuantajGunuGirdisi>;
export type IkPuantajYazCevabi = z.output<typeof ikPuantajYazCevabi>;
