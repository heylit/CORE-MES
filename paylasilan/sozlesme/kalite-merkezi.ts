import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';
import { dosyaOzeti } from './dosya.ts';
import { KALITE_KARARLARI } from './uretim-emirleri.ts';

// Kalite Merkezi değiştirilmeden çerçevede çalışır; kayıtları kendi biçimindedir ve TMI'de yorumlanmaz: olduğu gibi saklanır,
// olduğu gibi döner (Arkon kalıbı). Koleksiyon adları uygulamanındır (COLS ve ayarlar).
export const KALITE_MERKEZI_KOLEKSIYONLARI = [
  'ncr', 'capa', 'insp', 'dev', 'sup', 'frm', 'lot', 'tpl', 'spc', 'cizim', 'parca', 'kullanici', 'iz', 'belge', 'emir', 'bayrak',
  'settings',
] as const;
export type KaliteMerkeziKoleksiyonu = (typeof KALITE_MERKEZI_KOLEKSIYONLARI)[number];

// Kimlik biçimi uygulamanın yerel sunucusundakiyle aynıdır (sunucu.py SAFE): kayıt ve dosya kimliği.
export const KM_KIMLIK_BICIMI = /^[A-Za-z0-9_\-.:@+~|]{1,200}$/;
const kimlik = z.string().regex(KM_KIMLIK_BICIMI, 'Kimlik biçimi geçersiz.');
const koleksiyon = z.enum(KALITE_MERKEZI_KOLEKSIYONLARI);
// Kayıt gövdesi uygulamanın JSON nesnesidir.
const govde = z.record(z.string(), z.unknown());

export const kmBelgeParametresi = z.object({ koleksiyon, kimlik });
export const kmDosyaParametresi = z.object({ kimlik });

// Değişiklik akışı: `sonra` sürümünden sonra değişen kayıtlar, sürüm sırasıyla. Silinen kaydın gövdesi null'dır. Kaydın
// sürümü, yazarken beklenen sürüm olarak geri gönderilir.
export const kmDegisiklikSorgusu = z.object({ sonra: z.coerce.number().int().nonnegative().default(0) });
const kayitSurumu = z.number().int().positive();
const degisiklik = z.object({ koleksiyon: z.string(), kimlik: z.string(), govde: govde.nullable(), surum: kayitSurumu });
export const kmDegisiklikCevabi = z.object({ surum: z.number().int().nonnegative(), degisiklikler: z.array(degisiklik) });

// Beklenen sürüm zorunludur: istemcinin gördüğü kayıt sürümü, kaydı yok (ya da silinmiş) biliyorsa null. Arada başkası
// yazdıysa ya da sildiyse yazma 409 alır, üzerine yazılmaz. Sürüm genel sayaçtandır (bigint), satır sürümü değildir.
const beklenen = { surum: kayitSurumu.nullable() };
export const kmYazGovdesi = z.object({ govde, ...beklenen });
export const kmSilGovdesi = z.object(beklenen);
// Onay ucu: NCR kapanışı karantinadaki partiyi serbest bırakıyorsa ve partinin önceki konumu bilinmiyorsa hedef konum burada gelir.
// 320 a: kapanan NCR'nin parti başına serbest bıraktığı miktar; verilmeyen parti bütünüyle bırakılır, kalan red ve yerinde kalır.
const serbestMiktar = z.object({
  partiId: z.number().int().positive(),
  miktar: z.string().trim().regex(/^\d{1,11}(\.\d{1,3})?$/, 'Miktar en çok üç ondalıklı bir sayı olmalı (örnek: 12.5).'),
});
export const kmOnaylaGovdesi = kmYazGovdesi.extend({
  karantinaHedefKonumId: z.number().int().positive().nullish(),
  serbestMiktarlar: z.array(serbestMiktar).max(50).refine((l) => new Set(l.map((m) => m.partiId)).size === l.length, 'Her parti bir kez verilir.').optional(),
});
// Kapanışta serbest bırakılabilecek partiler ve red miktarları (kullanılabilir: yoldaki teslime ayrılan düşülmüş).
export const kmKarantinaPartileriCevabi = z.object({
  partiler: z.array(z.object({ partiId: z.number().int(), lotNo: z.string().nullable(), redMiktar: z.string() })),
});
export type KmKarantinaPartileriCevabi = z.output<typeof kmKarantinaPartileriCevabi>;
// Serbest bırakılacak konum seçimi: karantina, hurda, fason ve yolda dışındaki aktif konumlar.
export const kmKarantinaKonumlariCevabi = z.object({ konumlar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable() })) });
// Genel yazma onay ve kapanış alanını değiştirmek isterse 403 bu `alan` ile döner; aynı gövde onay ucuna (`/onayla`) gider.
export type KmOnayReddiAlani = 'onay';
// Onaylı formun onayını geri alma: beklenen sürüm zorunludur (form o sürümde onaylı olmalı).
export const kmOnayGeriAlGovdesi = z.object({ surum: kayitSurumu });
export type KmOnayGeriAlGovdesi = z.input<typeof kmOnayGeriAlGovdesi>;
export const kmSurumCevabi = z.object({ surum: z.number().int().nonnegative() });
// Kapanan NCR partiyi serbest bırakamadıysa nedeni tek satır döner; kapanış yine yazılmıştır.
export const kmOnaylaCevabi = kmSurumCevabi.extend({ uyari: z.string().optional() });
export type KmOnaylaCevabi = z.infer<typeof kmOnaylaCevabi>;

// Yedekten geri yükleme parça parça gelir (gövde sınırı 1 MB). İlk parçanın cevabı geri yüklemenin başladığı sürümü verir;
// sonraki parçalar onu taşır. Yedekte olmayan kayıtlar yalnız son parçada silinir: bir parça düşerse eski kayıtlar yerinde kalır.
export const kmGeriYukleGovdesi = z.object({
  baslangic: z.number().int().nonnegative().nullable(),
  son: z.boolean(),
  belgeler: z.array(z.object({ koleksiyon, kimlik, govde })).max(5000),
});
export const kmGeriYukleCevabi = z.object({ surum: z.number().int().nonnegative(), baslangic: z.number().int().nonnegative() });

// Dosya içeriği ortak dosya deposuna (`/dosyalar`) yüklenir; bu uç onu uygulamanın dosya kimliğine bağlar.
export const kmDosyaBaglaGovdesi = z.object({ ozet: dosyaOzeti, ad: z.string().trim().min(1).max(200) });
export const kmDosyaCevabi = z.object({ kimlik: z.string(), ozet: z.string(), boyut: z.number().int().nonnegative(), tur: z.string() });
export const kmOzetCevabi = z.object({ acikUygunsuzluk: z.number().int().nonnegative() });
export const kmTamamCevabi = z.object({ tamam: z.literal(true) });

// Uygulamanın girişi TMI oturumudur (ayrı PIN yok). `kisiler` uygulamada rol verilecek etkin kişilerdir; yalnız yöneticiye dolu gelir.
const kmKisi = z.object({ id: z.number().int(), ad: z.string() });
// `onaylayabilir`: kişide onay işlemi var; uygulama "Onayı geri al" düğmesini yalnız ona gösterir (sunucu ayrıca denetler).
export const kmKimlikCevabi = z.object({ kisi: kmKisi, yonetici: z.boolean(), kisiler: z.array(kmKisi), onaylayabilir: z.boolean() });

// İlk parça (FAI) kararı (229 a): emrin karar bekleyen sayımı onayda sağlama, retde redde geçer; `adet` geçen parça sayısıdır.
export const kmIlkParcaParametresi = z.object({ uretimEmriId: z.coerce.number().int().positive() });
export const kmIlkParcaGovdesi = z.object({ karar: z.enum(KALITE_KARARLARI) });
export const kmIlkParcaCevabi = z.object({ adet: z.number().int().nonnegative() });

// 325 a: ilk parça kararı bekleyen açık emirler (karar bekleyen sayımı olanlar). Karar yukarıdaki karar ucuyla verilir.
export const kmIlkParcaBekleyenCevabi = z.object({
  emirler: z.array(z.object({
    uretimEmriId: z.number().int().positive(), emirNo: z.string(), parcaNo: z.string(), parcaAd: z.string(),
    adet: z.number().int().positive(), kararBekleyenAdet: z.number().int().positive(),
  })),
});

// 326 a: kaydın geçmişi, yeniden eskiye. Her satır kaydın bir önceki hâlidir: sürümü, o hâli yazan kişi ve an, onun yerine yazan kişi
// ve an (silmeyi yapan da bir değiştirendir; satır veritabanında doğrudan silinmişse `degistiren` null). Geçmiş yalnız okunur.
export const KM_GECMIS_SINIRI = 50;
export const kmGecmisCevabi = z.object({
  surumler: z.array(z.object({
    surum: z.number().int().positive(), yazan: z.string().nullable(), yazildi: zamanSemasi, degistiren: z.string().nullable(), degisti: zamanSemasi, govde,
  })),
});

export type KmDegisiklikCevabi = z.output<typeof kmDegisiklikCevabi>;
export type KmYazGovdesi = z.input<typeof kmYazGovdesi>;
export type KmSilGovdesi = z.input<typeof kmSilGovdesi>;
export type KmOnaylaGovdesi = z.input<typeof kmOnaylaGovdesi>;
export type KmSurumCevabi = z.output<typeof kmSurumCevabi>;
export type KmGeriYukleGovdesi = z.input<typeof kmGeriYukleGovdesi>;
export type KmGeriYukleCevabi = z.output<typeof kmGeriYukleCevabi>;
export type KmDosyaCevabi = z.output<typeof kmDosyaCevabi>;
export type KmOzetCevabi = z.output<typeof kmOzetCevabi>;
export type KmKimlikCevabi = z.output<typeof kmKimlikCevabi>;
export type KmKarantinaKonumlariCevabi = z.output<typeof kmKarantinaKonumlariCevabi>;
export type KmIlkParcaBekleyenCevabi = z.output<typeof kmIlkParcaBekleyenCevabi>;
export type KmGecmisCevabi = z.output<typeof kmGecmisCevabi>;
export type KmIlkParcaCevabi = z.output<typeof kmIlkParcaCevabi>;
export type KmIlkParcaGovdesi = z.input<typeof kmIlkParcaGovdesi>;
