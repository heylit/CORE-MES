import { z } from 'zod';
import type { Islem } from '../islemler.ts';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { kayitYoluMu } from '../sayfa-tanimi.ts';
import { zamanSemasi } from '../zaman.ts';

// Bildirim merkezi: kişiye gelen kalıcı haberler (zil). Kişi her zaman oturumdan gelir: adres ve gövde başka kişiyi seçemez,
// başkasının bildirimi hiçbir uçtan dönmez. Olay türünü üreten modüldür; bu modül olayın anlamını bilmez, yalnız taşır.

export const BILDIRIM_ONEMLERI = ['bilgi', 'uyari', 'acil'] as const;
export type BildirimOnemi = (typeof BILDIRIM_ONEMLERI)[number];
export const BILDIRIM_KANALLARI = ['mesaj', 'eposta'] as const;
export type BildirimKanali = (typeof BILDIRIM_KANALLARI)[number];

export interface BildirimTuruTanimi {
  // Tercih ekranında görünen ad.
  baslik: string;
  onem: BildirimOnemi;
  // Kim alır: bu işlemlerden birini taşıyan etkin her kişi. Kayda bağlı kişi (talebi açan gibi) çağıran modülce ayrıca verilir.
  alanIslemler: readonly Islem[];
  // Bildirimin açtığı ekran: gönderilen yol bu yol ya da altıdır. Alıcı rollerin bu ekranı açabildiğini
  // `araclar/bildirim-yollari.test.ts` ölçer; alıcıyı işlem, ekranı sayfa işlemi seçtiği için ikisi ayrışabiliyordu.
  yol: `/${string}`;
  // Kişi seçmediyse geçen kanallar; uygulama kanalı hep açıktır.
  varsayilan: Record<BildirimKanali, boolean>;
}

// Birinci aşamanın dört olayı (221 a). Anahtar `<modül>.<olay>`; modül adı kaynak modüldür.
export const BILDIRIM_TURLERI = {
  'satin-alma.talep-onay-bekliyor': {
    baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', alanIslemler: ['satin-alma.onayla'], yol: '/satin-alma/onaylar', varsayilan: { mesaj: false, eposta: true },
  },
  'siparisler.onay-bekliyor': {
    baslik: 'Sipariş onay bekliyor', onem: 'uyari', alanIslemler: ['siparisler.onayla'], yol: '/siparisler', varsayilan: { mesaj: false, eposta: true },
  },
  // 291 a: %10 üstü iskontolu teklif sürümü müdür onayını bekler.
  'siparisler.iskonto-onay-bekliyor': {
    baslik: 'Teklif iskonto onayı bekliyor', onem: 'uyari', alanIslemler: ['siparisler.iskonto-onayla'], yol: '/siparisler/teklifler', varsayilan: { mesaj: false, eposta: true },
  },
  'ik.izin-onay-bekliyor': {
    baslik: 'İzin talebi onay bekliyor', onem: 'uyari', alanIslemler: ['ik.izin-onay'], yol: '/ik-islemlerim/onaylar', varsayilan: { mesaj: false, eposta: true },
  },
  'istasyonlar.makine-durdu': {
    baslik: 'Makine durdu', onem: 'acil', alanIslemler: ['arkon.bakim', 'arkon.amir'], yol: '/istasyonlar', varsayilan: { mesaj: false, eposta: false },
  },
  // Ömür %20'nin altına indiğinde ve bittiğinde tetiklenir; alıcı takımı değiştirebilenlerdir.
  'cnc-kurulum.takim-omru': {
    baslik: 'Takım ömrü doluyor', onem: 'uyari', alanIslemler: ['cnc-kurulum.takim-degistir'], yol: '/cnc-kurulum', varsayilan: { mesaj: false, eposta: false },
  },
} as const satisfies Record<string, BildirimTuruTanimi>;

export type BildirimTuru = keyof typeof BILDIRIM_TURLERI;
export const BILDIRIM_TUR_ANAHTARLARI = Object.keys(BILDIRIM_TURLERI) as [BildirimTuru, ...BildirimTuru[]];
export const bildirimTuruMu = (deger: string): deger is BildirimTuru => Object.hasOwn(BILDIRIM_TURLERI, deger);

export const BILDIRIM_BASLIK_EN_COK = 200;
export const BILDIRIM_METIN_EN_COK = 1000;

const KIMLIK = z.number().int().positive().max(2147483647);
export const bildirimParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });

export const bildirimSemasi = z.object({
  id: z.number().int(),
  tur: z.string(),
  onem: z.enum(BILDIRIM_ONEMLERI),
  baslik: z.string(),
  metin: z.string().nullable(),
  // Uygulama içi adres; bildirim yetki vermez, kaydı açan ekran kendi yetkisini sorar.
  yol: z.string().refine(kayitYoluMu).nullable(),
  kaynakModul: z.string(),
  tekrarSayisi: z.number().int(),
  olusturuldu: zamanSemasi,
  okundu: zamanSemasi.nullable(),
  arsivlendi: zamanSemasi.nullable(),
});

// gelen: arşivlenmemiş hepsi; okunmamis; onemli: uyarı ve acil (arşivlenmemiş); arsiv: kişinin kaldırdıkları.
export const BILDIRIM_LISTE_DURUMLARI = ['gelen', 'okunmamis', 'onemli', 'arsiv'] as const;
export type BildirimListeDurumu = (typeof BILDIRIM_LISTE_DURUMLARI)[number];
export const bildirimListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  durum: z.enum(BILDIRIM_LISTE_DURUMLARI).default('gelen'),
});
export const bildirimListeCevabi = listeCevapSemasi(bildirimSemasi);

// Zil rozeti: okunmamış ve arşivlenmemiş sayı; acil olanı varsa rozet kırmızı.
export const bildirimSayacCevabi = z.object({ okunmamis: z.number().int().nonnegative(), acilVar: z.boolean() });

export const bildirimCevabi = bildirimSemasi;
export const tumunuOkunduCevabi = z.object({ isaretlenen: z.number().int().nonnegative() });

export const bildirimTercihSatiri = z.object({
  tur: z.enum(BILDIRIM_TUR_ANAHTARLARI),
  baslik: z.string(),
  onem: z.enum(BILDIRIM_ONEMLERI),
  kaynakModul: z.string(),
  mesaj: z.boolean(),
  // Kişi e-posta seçemiyorsa (operatör) null.
  eposta: z.boolean().nullable(),
  // Kişi bu olay için seçim yapmadı: olay türünün varsayılanı geçiyor.
  varsayilan: z.boolean(),
});
export const bildirimTercihleriCevabi = z.object({
  // Mesaj ve e-posta kanalları sonraki aşamalarda açılır; o zamana kadar seçim saklanır, gönderim yalnız uygulamadandır.
  kanallar: z.object({ mesaj: z.boolean(), eposta: z.boolean() }),
  epostaSecilebilir: z.boolean(),
  satirlar: z.array(bildirimTercihSatiri),
});
export const bildirimTercihDegistirGovdesi = z.object({
  tur: z.enum(BILDIRIM_TUR_ANAHTARLARI),
  mesaj: z.boolean(),
  eposta: z.boolean(),
}).strict();

export type Bildirim = z.output<typeof bildirimSemasi>;
export type BildirimListeSorgusu = z.input<typeof bildirimListeSorgusu>;
export type BildirimListeCevabi = z.output<typeof bildirimListeCevabi>;
export type BildirimSayacCevabi = z.output<typeof bildirimSayacCevabi>;
export type TumunuOkunduCevabi = z.output<typeof tumunuOkunduCevabi>;
export type BildirimTercihSatiri = z.output<typeof bildirimTercihSatiri>;
export type BildirimTercihleriCevabi = z.output<typeof bildirimTercihleriCevabi>;
export type BildirimTercihDegistirGovdesi = z.input<typeof bildirimTercihDegistirGovdesi>;
