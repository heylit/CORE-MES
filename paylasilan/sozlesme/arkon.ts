import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { makineDoluAyrintisi } from './uretim-emirleri.ts';

// Arkon MES, TMI içinde değiştirilmeden çalışır; kendi sunucu sözleşmesini istemcideki bağlantı katmanı bu uçlara çevirir.
// Belge gövdeleri Arkon'un biçimidir ve TMI'de yorumlanmaz: olduğu gibi saklanır, olduğu gibi döner.

export const ARKON_ROLLERI = ['admin', 'plan', 'prep', 'quality', 'maint', 'lead', 'operator'] as const;
export const ARKON_DEPOLARI = ['pkgs', 'results', 'requests', 'draws', 'downs', 'maint', 'gauges', 'logi', 'kv'] as const;
export const ARKON_KAYIT_TURLERI = ['events', 'counts', 'meas', 'calls', 'audit'] as const;

// Dosya içeriği JSON gövdesinde parça parça taşınır: her parça gövde sınırının (1 MB) altında kalır.
export const DOSYA_PARCASI = 512 * 1024;
export const AZAMI_DOSYA = 200 * 1024 * 1024;
const AZAMI_PARCA_SAYISI = Math.ceil(AZAMI_DOSYA / DOSYA_PARCASI);

export const arkonRolu = z.enum(ARKON_ROLLERI);
export const arkonDeposu = z.enum(ARKON_DEPOLARI);
export const arkonKayitTuru = z.enum(ARKON_KAYIT_TURLERI);

const belgeKimligi = z.string().min(1).max(200);
const ozet = z.string().regex(/^[0-9a-f]{64}$/, 'Özet 64 haneli onaltılık olmalı.');
// Arkon her isteğe cihaz kimliğini ekler; anlık iletide cihaz kendi iletisini geri almaz.
const kaynak = z.string().min(1).max(80);
const sayi = (alan: string) => z.coerce.number({ message: `${alan} sayı olmalı.` }).int().nonnegative();

export const arkonKisiSemasi = z.object({
  kimlik: z.string(),
  ad: z.string(),
  rol: arkonRolu,
  isMerkezleri: z.array(z.string()),
  // Kişinin TMI'de en yüksek yüzdeyle atandığı aktif istasyonun kodu; operatör ekranı kayıtlı istasyon yoksa bununla açılır.
  istasyon: z.string().nullable(),
  // Kişinin çalışabildiği aktif istasyonların kodları: Vardiya ataması ve Reçete ve Rota yetkinliği (istasyonlar modülü) birlikte.
  istasyonlar: z.array(z.string()).optional(),
  aktif: z.boolean(),
});
export const arkonBenCevabi = z.object({ kisi: arkonKisiSemasi });
export const arkonKisilerCevabi = z.object({ kisiler: z.array(arkonKisiSemasi) });

export const depoParametresi = z.object({ depo: arkonDeposu });
export const belgeParametresi = z.object({ depo: arkonDeposu, kimlik: belgeKimligi });

const belgeSemasi = z.object({ kimlik: z.string(), surum: z.number().int(), govde: z.unknown() });
export const belgelerCevabi = z.object({ belgeler: z.array(belgeSemasi) });
export const belgeCevabi = z.object({ belge: z.object({ surum: z.number().int(), govde: z.unknown() }).nullable() });

// taban: istemcinin bildiği sürüm; null ilk yazımdır. Sunucudaki sürüm farklıysa yazılmaz, güncel belge döner.
// Belge gövdesi Arkon'undur; yalnız TMI'nin okuduğu ve kural kurduğu alanlar türüyle denetlenir, öteki alanlar olduğu gibi kalır.
// Sonuç: işin hâli ve sayaçları (rapor, OEE, biten iş kilidi); paket: emir no, istasyon, sürüm (kapsam, yayın günlüğü).
export const ARKON_IS_DURUMLARI = ['queued', 'setup', 'running', 'paused', 'stopped', 'done'] as const;
const belgeAdedi = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const arkonBelgeAlanlari: Partial<Record<ArkonDeposu, z.ZodType>> = {
  results: z.object({
    no: z.string().optional(), state: z.enum(ARKON_IS_DURUMLARI).optional(),
    good: belgeAdedi.optional(), scrap: belgeAdedi.optional(), baseGood: belgeAdedi.optional(),
  }).passthrough(),
  pkgs: z.object({
    no: z.string().optional(), machine: z.string().nullable().optional(), version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    fpRe: z.object({ on: z.boolean(), key: z.string().max(200), why: z.enum(['red', 'revizyon', 'degisiklik']) }).passthrough().nullable().optional(),
  }).passthrough(),
};
export const belgeYazGovdesi = z.object({ taban: z.number().int().nonnegative().nullable(), govde: z.unknown(), kaynak });
export const belgeYazCevabi = z.discriminatedUnion('sonuc', [
  z.object({ sonuc: z.literal('yazildi'), surum: z.number().int() }),
  z.object({ sonuc: z.literal('cakisma'), guncel: z.object({ surum: z.number().int(), govde: z.unknown() }) }),
]);
// taban: Arkon silmede sürüm göndermez (store.ts DB.del); verilirse belgenin sürümüyle eşleşmelidir.
export const belgeSilGovdesi = z.object({ kaynak, taban: z.number().int().nonnegative().optional() });

export const kayitParametresi = z.object({ tur: arkonKayitTuru });
const kayitSatiri = z.record(z.string(), z.unknown());
export const kayitEkleGovdesi = z.object({ satirlar: z.array(kayitSatiri).min(1).max(500), kaynak });
// Makine başka işte doluyken reddedilen başlatma: kimin hangi işi başlattığı (`doluOlan`) ve devralınırsa başlayacak emir. Ekran kullanıcıya
// "<kişi> <iş> başlattı, önce durdurulmalı" diye sorar; onay `makineDevralGovdesi` ile gelir. Aynı işin kendi makinesinde başlaması devralınamaz,
// bu alan o ret için dolmaz.
export const makineDoluRedAyrintisi = z.object({ devralEmirId: z.number().int().positive(), doluOlan: makineDoluAyrintisi });
export const kayitEkleCevabi = z.object({
  eklenen: z.number().int(),
  // TMI'nin bu istekte reddettiği kayıtlar (ileti TMI kuralının metni).
  // tmiDurum: reddedilen durum kaydında işin TMI'deki hâli (Arkon durumu); ekran kendi gösterdiğini buna eşitler.
  reddedilen: z.array(z.object({
    cid: z.string(), ileti: z.string(), makineDolu: makineDoluRedAyrintisi.optional(),
    tmiDurum: z.enum(['running', 'paused', 'stopped', 'queued', 'done']).optional(),
  })),
  // TMI'nin yazdığı ama kullanıcıya söylenmesi gereken kayıtlar (insanlı istasyonda başkası da çalışıyor).
  uyarilar: z.array(z.object({ cid: z.string(), ileti: z.string() })),
});
// cid: devralmayı doğuran reddedilmiş başlatma kaydı; devralma yazılınca o yansıma satırı çözülmüş sayılır.
// durdurulanEmirId: makineyi tutan iş (`doluOlan.emir.id`); verilirse onun yeni hâli de istasyonun tabletlerine iletilir.
export const makineDevralGovdesi = z.object({
  emirId: z.number().int().positive(), kullanimId: z.number().int().positive(), cid: z.string().min(1).max(200).optional(),
  durdurulanEmirId: z.number().int().positive().optional(),
}).strict();
export const kayitSorgusu = z.object({
  makine: z.string().max(60).optional(),
  isMerkezi: z.string().max(60).optional(),
  baslangic: sayi('Başlangıç').optional(),
  bitis: sayi('Bitiş').optional(),
  emirNo: z.string().max(60).optional(),
  paketId: z.string().max(200).optional(),
  madde: sayi('Madde').optional(),
  sinir: z.coerce.number().int().min(1).max(20000).optional(),
});
// kesildi: liste sınıra ulaştı (en yeniler döner); ekran daha eskisi için aralığı daraltmalıdır.
export const kayitlarCevabi = z.object({ satirlar: z.array(kayitSatiri), kesildi: z.boolean().optional() });

export const eksikDosyaGovdesi = z.object({ ozetler: z.array(ozet).max(1000) });
export const eksikDosyaCevabi = z.object({ eksikler: z.array(z.string()) });
export const dosyaParametresi = z.object({ ozet });
export const dosyaParcasiGovdesi = z.object({
  sira: z.number().int().nonnegative().max(AZAMI_PARCA_SAYISI - 1),
  toplam: z.number().int().positive().max(AZAMI_PARCA_SAYISI),
  veri: z.string().max(Math.ceil(DOSYA_PARCASI / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Parça base64 olmalı.'),
}).refine((g) => g.sira < g.toplam, { message: 'Parça sırası toplamdan küçük olmalı.', path: ['sira'] });
// tamam: bütün parçalar geldi ve içerik özetle doğrulandı.
export const dosyaParcasiCevabi = z.object({ tamam: z.boolean() });

export const iletiSorgusu = z.object({ son: sayi('Son').optional(), kaynak: kaynak.optional() });
export const iletilerCevabi = z.object({ son: z.number().int(), iletiler: z.array(z.record(z.string(), z.unknown())) });
export const iletiGovdesi = z.object({
  ileti: z.record(z.string(), z.unknown()).refine((i) => typeof i['type'] === 'string', 'İleti türü yok.'),
  kaynak,
});

export const tamamCevabi = z.object({ tamam: z.literal(true) });
// Malzeme isteği formunun seçicisi (stoklanan aktif kartlar).
export const malzemeAramaSorgusu = z.object({ ara: z.string().trim().max(80).optional() });
export const arkonMalzemelerCevabi = z.object({
  malzemeler: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable(), birim: z.string().nullable() })),
});
export type ArkonMalzemelerCevabi = z.output<typeof arkonMalzemelerCevabi>;

// TMI üretim emrine yazılamayan Arkon kayıtları (kart #243): yazılan dışındaki her yansıma sonucu.
export const YANSIMA_SONUCLARI = ['bekliyor', 'reddedildi', 'eslenemedi', 'hatali'] as const;
export const yansimaSonucu = z.enum(YANSIMA_SONUCLARI);
// Beklenen ve kendiliğinden çözülecek satır türleri varsayılan olarak gizlenir (#199 3. tur, TA2); `gizlenenler=true` onları da listeler.
export const yansimaSorgusu = z.object({
  ...sayfaSorguAlanlari, sonuc: yansimaSonucu.optional(), gizlenenler: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
});
export const yansimaSatiri = z.object({
  id: z.number().int(),
  sonuc: yansimaSonucu,
  // Kullanıcıya yönelik neden: ret ya da eşlenememe nedeni, bekleyen satırda neden beklediği. İç hata özeti ve kişi dönmez (#243).
  neden: z.string().nullable(),
  deneme: z.number().int().nonnegative(),
  zaman: zamanSemasi,
  sonDeneme: zamanSemasi.nullable(),
  emirId: z.number().int().nullable(),
  kayit: z.object({ tur: arkonKayitTuru, cid: z.string(), zaman: zamanSemasi, paketId: z.string().nullable(), emirNo: z.string().nullable() }),
  // Satır gizlenen türlerdense türün adı; görünen satırda null.
  gizliTur: z.string().nullable(),
});
// Gizlenen türler tek tek, sayısıyla (sayı sıfır olabilir); durum süzgeci ve veri kapsamı sayıya da uygulanır.
export const yansimalarCevabi = listeCevapSemasi(yansimaSatiri).extend({
  gizlenenler: z.array(z.object({ kod: z.string(), ad: z.string(), adet: z.number().int().nonnegative() })),
});
// Yeniden kuyruğa alma (#243): satırın aynı istekteki denemeden sonraki sonucu.
export const yansimaParametresi = z.object({ id: z.coerce.number().int().positive() });
export const yansimaYenidenCevabi = z.object({ sonuc: z.enum([...YANSIMA_SONUCLARI, 'yazildi']), neden: z.string().nullable() });

// Son terminal olayları (kart #1122): Fabrika Haritası'nın "Son hareketler" listesi istemciden okur (atolye sunucusu Arkon'u ithal edemez, ADR 0006).
// Yoklayan son gördüğü `id`'yi `sonraId` olarak verir. `istasyonKodu` Arkon'un makine alanıdır; kod çözülemediyse `istasyonId` boştur.
export const SON_OLAY_TURLERI = ['events', 'counts', 'meas', 'calls'] as const;
export const AZAMI_SON_OLAY = 200;
export const sonOlaylarSorgusu = z.object({
  sonraId: z.coerce.number().int().nonnegative().optional(),
  sayi: z.coerce.number().int().min(1).max(AZAMI_SON_OLAY).default(50),
});
export const sonOlaylarCevabi = z.object({
  olaylar: z.array(z.object({
    id: z.number().int().positive(),
    tur: z.enum(SON_OLAY_TURLERI),
    zaman: zamanSemasi,
    istasyonKodu: z.string().nullable(),
    istasyonId: z.number().int().nullable(),
    emirNo: z.string().nullable(),
    kisi: z.object({ id: z.number().int(), ad: z.string().nullable() }),
  })),
});
export type SonOlaylarCevabi = z.output<typeof sonOlaylarCevabi>;

export type ArkonRolu = z.output<typeof arkonRolu>;
export type ArkonDeposu = z.output<typeof arkonDeposu>;
export type ArkonKayitTuru = z.output<typeof arkonKayitTuru>;
export type ArkonKisi = z.output<typeof arkonKisiSemasi>;
export type BelgelerCevabi = z.output<typeof belgelerCevabi>;
export type BelgeCevabi = z.output<typeof belgeCevabi>;
export type BelgeYazGovdesi = z.input<typeof belgeYazGovdesi>;
export type BelgeYazCevabi = z.output<typeof belgeYazCevabi>;
export type KayitSorgusu = z.input<typeof kayitSorgusu>;
export type IletilerCevabi = z.output<typeof iletilerCevabi>;
export type ArkonBenCevabi = z.output<typeof arkonBenCevabi>;
export type ArkonKisilerCevabi = z.output<typeof arkonKisilerCevabi>;
export type KayitlarCevabi = z.output<typeof kayitlarCevabi>;
export type EksikDosyaCevabi = z.output<typeof eksikDosyaCevabi>;
export type YansimaSonucu = z.output<typeof yansimaSonucu>;
export type YansimaSorgusu = z.input<typeof yansimaSorgusu>;
export type YansimaSatiri = z.output<typeof yansimaSatiri>;
export type YansimalarCevabi = z.output<typeof yansimalarCevabi>;
export type MakineDoluRedAyrintisi = z.output<typeof makineDoluRedAyrintisi>;
export type KayitEkleCevabi = z.output<typeof kayitEkleCevabi>;
export type MakineDevralGovdesi = z.input<typeof makineDevralGovdesi>;
export type YansimaYenidenCevabi = z.output<typeof yansimaYenidenCevabi>;

// Arkon Planlama'dan TMI işinin sırası (A4): ekranın gördüğü canlı sıra ve yeni sıra; sonuç plan taslağıdır.
const isEmriKimlikleri = z.array(z.number().int().positive()).min(1).max(200);
export const planSiralaGovdesi = z.object({
  kaynak: z.object({ tur: z.enum(['makine', 'kisi']), id: z.number().int().positive() }).strict(),
  onceki: isEmriKimlikleri,
  yeni: isEmriKimlikleri,
  // Ekranın yüklendiği andaki canlı plan sürümü (`planSiraSurumuCevabi`): arada canlıya alınan her değişiklik, kuyruğa giren yeni iş dahil, sıralamayı reddettirir.
  planSurumu: z.number().int().nonnegative(),
}).strict();
// Rol panosu kartları (kart #489): her sayı kendi Arkon işlemiyle verilir; işlemi ya da depoyu okuma rolü olmayana null (kart görünmez ya da "Veri yok").
export const arkonOzetiCevabi = z.object({
  hazirlikBekleyen: z.number().int().nullable(),
  kaliteBekleyen: z.number().int().nullable(),
  bakimAcik: z.number().int().nullable(),
});
export type ArkonOzetiCevabi = z.output<typeof arkonOzetiCevabi>;

// Üretim anomalisi (kart #1149): plandaki sıraya göre şu ana kadar üretilebilecek adet ("beklenen") ile üretilen adet. Bilinmeyen değer null'dır
// (sıfır uydurulmaz). İşaret alanları true: anomali, false: yok, null: hüküm verilemedi ya da kural kapalı.
export const ANOMALI_DURUMLARI = ['normal', 'isaret', 'izinli', 'bilinmiyor'] as const;
const anomaliAdedi = z.number().nonnegative().nullable();
const anomaliFarki = z.number().nullable();
export const anomaliIstasyonSatiri = z.object({
  istasyonId: z.number().int().positive(),
  kod: z.string(),
  ad: z.string(),
  // Kapasiteyi makineli istasyonda makine, insanlı istasyonda kişi belirler.
  kapasiteKaynagi: z.enum(['makine', 'insan']),
  beklenen: anomaliAdedi,
  uretilen: anomaliAdedi,
  // Üretilen / beklenen; beklenen sıfırsa ya da biri bilinmiyorsa null.
  oran: z.number().nonnegative().nullable(),
  // AR-AN-1: son girişten beri geçen net aktif dakika; giriş zamanı okunamıyorsa null.
  girisYokDk: anomaliAdedi,
  girisYok: z.boolean().nullable(),
  // AR-AN-2.
  adetEksik: z.boolean().nullable(),
  // Günün net hurdası (kart #1306); eksik adedin nedeni olarak gösterilir.
  hurda: anomaliAdedi,
  // AR-AN-10: plana girmemiş iş emirlerinin sağlamı; orana girmez. İş emri sayımı bilinmiyorsa null.
  planDisi: anomaliAdedi,
});
export const anomaliMakineSatiri = z.object({
  makineId: z.number().int().positive(),
  kod: z.string(),
  ad: z.string(),
  istasyonId: z.number().int().positive(),
  beklenen: anomaliAdedi,
  uretilen: anomaliAdedi,
  hurda: anomaliAdedi,
  fark: anomaliFarki,
  durum: z.enum(ANOMALI_DURUMLARI),
});
export const anomaliKisiSatiri = z.object({
  kisiId: z.number().int().positive(),
  ad: z.string(),
  beklenen: anomaliAdedi,
  uretilen: anomaliAdedi,
  hurda: anomaliAdedi,
  fark: anomaliFarki,
  durum: z.enum(ANOMALI_DURUMLARI),
  // AR-AN-6: üretilen sağlamın standart süresi / çalışılan süre; çalışma kaydı yoksa null.
  performans: z.number().nonnegative().nullable(),
  // AR-AN-12 (kart #1324): standart süre / vardiya mesaisi (izinli gün hariç); mesai bilinmiyorsa null.
  emekVerimi: z.number().nonnegative().nullable(),
});
export const anomaliCevabi = z.object({
  // Tesis günü ve hesabın yapıldığı an.
  tarih: z.string(),
  hesaplama: zamanSemasi,
  esikler: z.object({
    // AR-AN-1 eşiği, net aktif dakika; boşsa kural kapalı.
    girisYokDk: z.number().nonnegative().nullable(),
    // AR-AN-2 toleransı, yüzde; boşsa kural kapalı.
    adetToleransYuzde: z.number().nonnegative().nullable(),
  }),
  // AR-AN-3: toplam üretilen / toplam plan (yalnız ikisi de bilinen istasyonlarla).
  toplam: z.object({
    beklenen: z.number().nonnegative(), uretilen: z.number().nonnegative(), oran: z.number().nonnegative().nullable(),
    hurda: z.number().nonnegative(),
    // AR-AN-6, planda ya da atamada olan kişilerin toplamı; ölçüm yoksa null.
    performans: z.number().nonnegative().nullable(),
    planDisi: z.number().nonnegative(),
  }),
  istasyonlar: z.array(anomaliIstasyonSatiri),
  makineler: z.array(anomaliMakineSatiri),
  // Kişi kırılımı yalnız arkon.anomali-kisi işlemiyle gelir (kart #1306: yalnız yönetici); işlemi olmayana null.
  kisiler: z.array(anomaliKisiSatiri).nullable(),
  // Istasyonu çözülemeyen canlı plan yerleşimi sayısı (hesaba girmez).
  atlanan: z.number().int().nonnegative(),
});
export type AnomaliCevabi = z.output<typeof anomaliCevabi>;

// Operatör Özetim (kart #1295): kişinin kendi üretimi uretim-emirleri sayımından okunur. Kişi verilmezse oturumdaki kişi; başkasını yalnız
// amir, yalnız kendi iş merkezi kapsamındaki kişi için ister. Veri yoksa alan boş gelir: sıfır uydurulmaz.
export const OZET_DONEMLERI = ['gun', 'hafta', 'ay'] as const;
export const operatorOzetiSorgusu = z.object({
  donem: z.enum(OZET_DONEMLERI).default('gun'),
  kisiId: z.coerce.number().int().positive().optional(),
});
const ozetAdedi = z.number().int().nullable();
export const operatorOzetiCevabi = z.object({
  kisi: z.object({ id: z.number().int().positive(), ad: z.string() }),
  donem: z.enum(OZET_DONEMLERI),
  // Tesis günleri, ikisi de dahil.
  baslangic: z.string(),
  bitis: z.string(),
  hesaplama: zamanSemasi,
  saglam: ozetAdedi,
  hurda: ozetAdedi,
  // sağlam / (sağlam + hurda), 0-1; sayım yoksa boş.
  kalite: z.number().min(0).max(1).nullable(),
  // Katılım aralıklarından çalışılan süre (saniye); açık iş şimdiye kadar.
  calismaSn: z.number().int().nonnegative().nullable(),
  saatlikSaglam: z.number().nonnegative().nullable(),
  // Plana göre başarı. Bugün Üretim Anomalisi'nin kişi hesabıdır; geçmiş gün, kişinin çalıştığı iş emirlerinin plan yerleşiminden
  // (yerleşimi olmayan iş emri katılım süresi / birim süreyle: `standartla`). Beklenen adedi bilinmeyen kayıtlı gün hesaba girmez (`eksikGun`).
  basari: z.object({
    uretilen: z.number().nonnegative(), beklenen: z.number().nonnegative(), oran: z.number().nonnegative(),
    eksikGun: z.number().int().nonnegative(), standartla: z.number().int().nonnegative(),
  }).nullable(),
  // Standart süreye göre verim: sağlam x birim süre / çalışılan süre. Birim süresi olmayan işteki sağlam verime girmez (`suresizSaglam`).
  verim: z.object({ oran: z.number().nonnegative(), suresizSaglam: z.number().int() }).nullable(),
  // Emek verimi (kart #1324, Anomali ile aynı hesap `emekVerimleri`): dönemde girilen sağlamın standart süresi / vardiya mesaisi (izinli gün hariç,
  // şimdiye kadar). Mesai bilinmiyorsa oran boş. Yalnız kişinin kendisi; ekip ortalaması yok.
  emekVerimi: z.object({
    oran: z.number().nonnegative().nullable(), standartSn: z.number().nonnegative(), mesaiSn: z.number().nonnegative().nullable(),
  }),
  // Dönemde sayımı ya da katılımı olan işler, en son çalışılan önce.
  isler: z.array(z.object({
    isEmriId: z.number().int().nullable(), emirNo: z.string(), parca: z.string(), opNo: z.number().int().nullable(), adimAdi: z.string().nullable(),
    durum: z.enum(['bekliyor', 'calisiyor', 'tamam']), saglam: ozetAdedi, hurda: ozetAdedi, saniye: z.number().int().nonnegative().nullable(),
  })),
  // Dönemin net hurdası neden başına, çoktan aza.
  hurdaNedenleri: z.array(z.object({ kod: z.string().nullable(), ad: z.string(), adet: z.number().int() })),
  // İsimsiz ekip ortalaması (aynı iş merkezi, başarısı hesaplanan en az 3 kişi), yalnız bugün; tek sayı, kişi listesi gelmez.
  ekipOrtalamasi: z.number().nonnegative().nullable(),
  // Son 7 tesis günü; kaydı olmayan günde sayılar boş.
  gunler: z.array(z.object({ tarih: z.string(), saglam: ozetAdedi, hurda: ozetAdedi, beklenen: z.number().nonnegative().nullable() })),
  rozetler: z.array(z.object({ kod: z.string(), baslik: z.string(), aciklama: z.string() })),
  // Kişinin bugün atandığı (yetkili olduğu) istasyonlar ve makineler; makine istasyon koduyla.
  yetkiler: z.object({
    istasyonlar: z.array(z.object({ id: z.number().int().positive(), kod: z.string(), ad: z.string() })),
    makineler: z.array(z.object({ id: z.number().int().positive(), kod: z.string(), ad: z.string(), istasyonKodu: z.string().nullable() })),
  }),
  // Bugünden başlayan 7 günün planlı mesaisi (Vardiya takvimi; gerçek giriş-çıkış değil). Kişi iş merkezine bağlanamıyorsa null.
  // baslangic/bitis o gün başlayan vardiyanın ilk ve son anı (mola dahil); çalışma yoksa null.
  mesailer: z.array(z.object({
    tarih: tarihSemasi, dakika: z.number().int().nonnegative(),
    kapali: z.object({ tur: z.enum(['tatil', 'kapali']), ad: z.string().nullable() }).nullable(),
    baslangic: zamanSemasi.nullable(), bitis: zamanSemasi.nullable(),
  })).nullable(),
  // İK fazla mesai kaydı (onaylı ve bekleyen). Toplamlar saati girilmemiş satır varsa null; kişinin İK kaydı yoksa tümü null.
  fazlaMesai: z.object({
    aySaat: z.number().nonnegative().nullable(),
    yilSaat: z.number().nonnegative().nullable(),
    bekleyenSaat: z.number().nonnegative().nullable(),
    yillikSinirSaat: z.number().nonnegative().nullable(),
    // Bu ayın satırları, yeniden eskiye.
    satirlar: z.array(z.object({
      tarih: tarihSemasi, tur: z.string(), saat: z.number().nonnegative().nullable(), onay: z.enum(['Onaylandı', 'Beklemede']).nullable(),
    })),
  }).nullable(),
  // İK izin kaydı: kalan yıllık izin ve bugünden sonraki 180 gündeki onaylı ya da bekleyen izinler. İK kaydı yoksa null.
  izinler: z.object({
    hakGun: z.number().nullable(), kalanGun: z.number().nullable(), kullanilanGun: z.number(), bekleyenGun: z.number(),
    sonrakiHakTarihi: tarihSemasi.nullable(), sonrakiHakGun: z.number().nullable(),
    yaklasan: z.array(z.object({
      tur: z.string(), baslangic: tarihSemasi, bitis: tarihSemasi, gun: z.number().nullable(), durum: z.enum(['Beklemede', 'Onaylandı']),
    })),
  }).nullable(),
  // Amirin özetini görebildiği kişiler (kendi iş merkezi kapsamı); amir olmayana boş.
  ekip: z.array(z.object({ id: z.number().int().positive(), ad: z.string() })),
});
export type OperatorOzetiCevabi = z.output<typeof operatorOzetiCevabi>;
export type OzetDonemi = (typeof OZET_DONEMLERI)[number];
export type AnomaliIstasyonSatiri = z.output<typeof anomaliIstasyonSatiri>;
export type AnomaliMakineSatiri = z.output<typeof anomaliMakineSatiri>;
export type AnomaliKisiSatiri = z.output<typeof anomaliKisiSatiri>;

// Üretim anomalisi gün, hafta, ay istatistiği (kart #1306): kaydedilmiş günlerden. Kaydı olmayan gün boş satırdır (durum null), sıfır sayılmaz.
export const ANOMALI_DONEM_ADLARI = ['gun', 'hafta', 'ay'] as const;
export const anomaliIstatistikSorgusu = z.object({ donem: z.enum(ANOMALI_DONEM_ADLARI), tarih: tarihSemasi });
const donemOlcusu = {
  beklenen: z.number().nonnegative(),
  uretilen: z.number().nonnegative(),
  hurda: z.number().nonnegative(),
  // Σ üretilen / Σ beklenen; plan yoksa null.
  oran: z.number().nonnegative().nullable(),
  // Σ standart süre / Σ çalışılan süre; ölçüm yoksa null.
  performans: z.number().nonnegative().nullable(),
};
const donemKirilimi = { ...donemOlcusu, isaretliGun: z.number().int().nonnegative(), gun: z.number().int().nonnegative() };
export const anomaliIstatistikCevabi = z.object({
  donem: z.enum(ANOMALI_DONEM_ADLARI),
  bas: tarihSemasi,
  bit: tarihSemasi,
  gunler: z.array(z.object({
    tarih: tarihSemasi,
    // acik: gün sürüyor (son hesap); kesin: kapandı; null: kayıt yok.
    durum: z.enum(['acik', 'kesin']).nullable(),
    beklenen: z.number().nonnegative().nullable(),
    uretilen: z.number().nonnegative().nullable(),
    hurda: z.number().nonnegative().nullable(),
    oran: z.number().nonnegative().nullable(),
    performans: z.number().nonnegative().nullable(),
    planDisi: z.number().nonnegative().nullable(),
    isaretliIstasyon: z.number().int().nonnegative().nullable(),
  })),
  // Plan dışı yalnız istasyon kırılımında ve toplamda vardır (AR-AN-10); iş emri sayımı olmayan eski kayıtta bilinmez, toplama girmez.
  toplam: z.object({ ...donemOlcusu, planDisi: z.number().nonnegative(), kayitliGun: z.number().int().nonnegative() }),
  istasyonlar: z.array(z.object({ istasyonId: z.number().int().positive(), kod: z.string(), ad: z.string(), ...donemKirilimi, planDisi: z.number().nonnegative() })),
  makineler: z.array(z.object({ makineId: z.number().int().positive(), kod: z.string(), ad: z.string(), istasyonId: z.number().int().positive().nullable(), ...donemKirilimi })),
  // Yalnız arkon.anomali-kisi işlemiyle; işlemi olmayana null.
  kisiler: z.array(z.object({ kisiId: z.number().int().positive(), ad: z.string(), ...donemKirilimi, emekVerimi: z.number().nonnegative().nullable() })).nullable(),
});
export type AnomaliIstatistikSorgusu = z.input<typeof anomaliIstatistikSorgusu>;
export type AnomaliIstatistikCevabi = z.output<typeof anomaliIstatistikCevabi>;
// 393 d sonrası terminalin makine seçicisi: emrin istasyonundaki makinelerden başlatmayı reddettirecek ayrımı olanlar (makine başına ilki,
// uretim-emirleri'nin başlatma denetimiyle aynı kural). `planMakinesi` emrin başlatılacak iş emrinin makinesidir; kodlar TMI makine kodlarıdır.
export const makineAyrimlariSorgusu = z.object({ emirId: z.coerce.number().int().positive() });
export const makineAyrimlariCevabi = z.object({
  planMakinesi: z.string().nullable(),
  ayrimlar: z.array(z.object({ mc: z.string(), emirNo: z.string(), opNo: z.number().int(), baslangic: zamanSemasi })),
});
export type MakineAyrimlariCevabi = z.infer<typeof makineAyrimlariCevabi>;
export const planSiraSurumuCevabi = z.object({ planSurumu: z.number().int().nonnegative() });
export const planSiralaCevabi = z.object({ taslakId: z.number().int(), taslakAcildi: z.boolean() });

// Çizim Merkezi'nden dosya alma (kart #800): Arkon yalnız yayındaki belgeyi, yalnız okuyabildiği türde (PDF, 3B model) alır.
// Alınan dosya Arkon'un kendi dosya deposuna kopyalanır (özetle tekil); paketin dosya kaydını ekran kurar.
export const MERKEZ_DOSYA_TIPLERI = ['pdf', 'model'] as const;
export const merkezBelgeSorgusu = z.object({ ara: z.string().trim().max(80).optional() });
export const merkezBelgeSatiri = z.object({
  id: z.number().int().positive(),
  ad: z.string(),
  tur: z.string(),
  harf: z.string(),
  tip: z.enum(MERKEZ_DOSYA_TIPLERI),
  dosyaAdi: z.string(),
  ozet,
});
export const merkezBelgelerCevabi = z.object({ belgeler: z.array(merkezBelgeSatiri) });
export const merkezBelgeParametresi = z.object({ belgeId: z.coerce.number().int().positive() });
// `kayit` paketin `files` listesine girer (bayt hariç: ekran içeriği özetle depodan okur).
export const merkezEkleCevabi = z.object({
  ozet,
  boyut: z.number().int().positive(),
  kayit: z.object({ kind: z.enum(MERKEZ_DOSYA_TIPLERI), name: z.string(), merkez: z.number().int().positive(), merkezOzet: ozet }),
});
// Okuma ucu (GET): `dosyalar=<belgeId>:<ozet>,<belgeId>:<ozet>` en çok 50 çift.
export const merkezKontrolSorgusu = z.object({
  dosyalar: z.string().regex(/^[1-9]\d{0,9}:[0-9a-f]{64}(,[1-9]\d{0,9}:[0-9a-f]{64}){0,49}$/, 'Dosyalar belgeNo:özet çiftleri olmalı (en çok 50).')
    .transform((metin) => metin.split(',').map((cift) => {
      const [belgeId, ozet] = cift.split(':');
      return { belgeId: Number(belgeId), ozet: String(ozet) };
    })),
});
export const MERKEZ_DURUMLARI = ['guncel', 'yeni-revizyon', 'yayindan-kalkti'] as const;
export const merkezKontrolCevabi = z.object({
  durumlar: z.array(z.object({
    belgeId: z.number().int().positive(),
    durum: z.enum(MERKEZ_DURUMLARI),
    // Merkezdeki yayındaki dosyanın özeti; belge yayında değilse null.
    ozet: ozet.nullable(),
  })),
});
export type MerkezBelgeSatiri = z.output<typeof merkezBelgeSatiri>;
export type MerkezBelgelerCevabi = z.output<typeof merkezBelgelerCevabi>;
export type MerkezEkleCevabi = z.output<typeof merkezEkleCevabi>;
export type MerkezKontrolCevabi = z.output<typeof merkezKontrolCevabi>;
export type MerkezDurumu = (typeof MERKEZ_DURUMLARI)[number];
