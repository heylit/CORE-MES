import type { Islem } from '../islemler.ts';

// Kademeli uyarı (3405): bekleyen iş yapılmadıkça uyarı kademe kademe sertleşir. Motor bildirim modülündedir; her kaynak (hazırlık
// görevi, satın alma onayı, kalibrasyon vadesi...) açık kayıtlarını kablolamayla bildirir. Bu dosya zod taşımaz: istemci de değer
// olarak ithal eder (ayar ekranı, Gecikenlerim).

export const KADEMELER = [1, 2, 3, 4, 5] as const;
export type Kademe = (typeof KADEMELER)[number];
// Ad kataloğu tektir (3405 Arayüz ön bakışı 5): ekran, e-posta ve şerit aynı adı kullanır.
export const KADEME_ADLARI: Record<Kademe, string> = { 1: 'Atandı', 2: 'Yaklaşıyor', 3: 'Gecikti', 4: 'Yöneticide', 5: 'Devret' };

// Son gün sayacı: kaydın son günü (termin, vade) vardır; K2 son günden önce, K3 son gün geçince. Bekleme sayacı: kaydın beklemeye
// başladığı gün vardır (onay bekliyor gibi); K2 yoktur, K3 `k3Gun` iş günü bekleyince.
export const KADEME_SAYACLARI = ['son-gun', 'bekleme'] as const;
export type KademeSayaci = (typeof KADEME_SAYACLARI)[number];

// 3418 a: bekleme sayacında Gecikti sınırı gün ya da saat olabilir. Saat, iş günlerinde (hafta sonu ve resmi tatil dışı) geçen
// saattir; mesai dışı saatler de sayılır. Yöneticide ve Devret her zaman iş günüdür.
export const KADEME_BIRIMLERI = ['gun', 'saat'] as const;
export type KademeBirimi = (typeof KADEME_BIRIMLERI)[number];

export interface KademeVarsayilani {
  acik: boolean;
  // Son gün sayacında son günden kaç iş günü önce hatırlatılır; null K2 kapalı (bekleme sayacında hep null).
  k2Gun: number | null;
  // Bekleme sayacında kaç iş günü bekleyince gecikti sayılır; son gün sayacında null (son gün geçince).
  k3Gun: number | null;
  // k3Gun'un birimi (yalnız bekleme sayacında saat olabilir).
  k3Birim: KademeBirimi;
  // Gecikmeden (K3'ün başladığı günden) sonraki iş günü; null o kademe kapalı.
  k4Gun: number | null;
  k5Gun: number | null;
  // Bu kademeden itibaren e-posta da gider.
  epostaKademe: 2 | 3 | 4 | 5;
  // K3 ve sonrası kişisel oturumda kırmızı şeritte görünür.
  serit: boolean;
  // K3 ve sonrasının e-postası kişi tercihinden kapatılamaz (3405-2 a: varsayılan kapatılamaz, kaynak ayarından açılabilir).
  kapatilamaz: boolean;
}

export interface KademeKaynagiTanimi {
  ad: string;
  // Ekranda grup başlığı.
  grup: string;
  sayac: KademeSayaci;
  // 1: bu işte açılan kaynak; 2: kodda var, ayarda kapalı gelir (3405 a).
  asama: 1 | 2;
  // Risk K1: alıcı bu işlemlerden birini taşımalıdır; Açık takipler satırı yalnız bunları taşıyana görünür (K2).
  okumaIslemleri: readonly Islem[];
  // Bildirimin ve satırın açtığı ekran kökü; kaydın yolu bunun altındadır.
  yol: `/${string}`;
  // Para taşıyan kaynakta e-posta varsayılan kapalıdır (Risk K3).
  para?: true;
  varsayilan: KademeVarsayilani;
}

const sonGun = (k2: number, k4: number, k5: number | null, ek: Partial<KademeVarsayilani> = {}): KademeVarsayilani => ({
  acik: true, k2Gun: k2, k3Gun: null, k3Birim: 'gun', k4Gun: k4, k5Gun: k5, epostaKademe: 3, serit: true, kapatilamaz: true, ...ek,
});
const bekleme = (k3: number, k4: number, k5: number | null, ek: Partial<KademeVarsayilani> = {}): KademeVarsayilani => ({
  acik: true, k2Gun: null, k3Gun: k3, k3Birim: 'gun', k4Gun: k4, k5Gun: k5, epostaKademe: 3, serit: true, kapatilamaz: true, ...ek,
});

// Anahtar `<modül>.<kaynak>`; bildirim türleri bu anahtardan türetilir (kademeTuru). Hazırlık görevi 3396'nın türlerini korur.
export const KADEME_KAYNAKLARI = {
  'projeler.hazirlik': {
    ad: 'Hazırlık görevi', grup: 'Projeler', sayac: 'son-gun', asama: 1, okumaIslemleri: ['projeler.gorev-isle', 'projeler.gorev-kontrol', 'projeler.hazirlik-dagit', 'projeler.oku'],
    yol: '/proje-gorevlerim', varsayilan: sonGun(1, 1, 2, { epostaKademe: 2 }),
  },
  'projeler.gorev': {
    ad: 'Proje görevi', grup: 'Projeler', sayac: 'son-gun', asama: 1, okumaIslemleri: ['projeler.gorev-isle', 'projeler.gorev-kontrol', 'projeler.oku'],
    yol: '/proje-gorevlerim', varsayilan: sonGun(1, 3, 5),
  },
  'satin-alma.talep-onay': {
    ad: 'Satın alma talebi onay bekliyor', grup: 'Satın alma', sayac: 'bekleme', asama: 1, okumaIslemleri: ['satin-alma.onayla'],
    yol: '/satin-alma/onaylar', varsayilan: bekleme(2, 2, 5),
  },
  'satin-alma.siparis-verilmedi': {
    ad: 'Onaylı talebe sipariş verilmedi', grup: 'Satın alma', sayac: 'bekleme', asama: 1, okumaIslemleri: ['satin-alma.yaz', 'satin-alma.ayar'],
    yol: '/satin-alma/talepler', varsayilan: bekleme(1, 2, 5),
  },
  'satin-alma.teklif-cevapsiz': {
    ad: 'Teklif isteği cevapsız', grup: 'Satın alma', sayac: 'bekleme', asama: 1, okumaIslemleri: ['satin-alma.yaz', 'satin-alma.ayar'],
    yol: '/satin-alma/talepler', varsayilan: bekleme(3, 3, null, { serit: false, kapatilamaz: false }),
  },
  'satin-alma.teslim': {
    ad: 'Satın alma siparişi teslimi', grup: 'Satın alma', sayac: 'son-gun', asama: 1, okumaIslemleri: ['satin-alma.yaz', 'satin-alma.ayar'],
    yol: '/satin-alma/talepler', varsayilan: sonGun(3, 3, 5),
  },
  'kalibrasyon.vade': {
    ad: 'Kalibrasyon vadesi', grup: 'Kalibrasyon', sayac: 'son-gun', asama: 1, okumaIslemleri: ['kalibrasyon.oku', 'kalibrasyon.yaz'],
    yol: '/kalibrasyon', varsayilan: sonGun(10, 3, 7, { epostaKademe: 2 }),
  },
  'arkon.bakim-vade': {
    ad: 'Bakım vadesi', grup: 'Bakım', sayac: 'son-gun', asama: 1, okumaIslemleri: ['arkon.bakim', 'arkon.amir', 'arkon.yonetici'],
    yol: '/arkon/bakim', varsayilan: sonGun(5, 2, 5),
  },
  'kalite-merkezi.dof': {
    ad: 'DÖF termini', grup: 'Kalite', sayac: 'son-gun', asama: 1, okumaIslemleri: ['kalite-merkezi.oku', 'kalite-merkezi.yaz'],
    yol: '/kalite-merkezi/dof', varsayilan: sonGun(3, 3, 7),
  },
  'kalite-merkezi.hatali-parca': {
    ad: 'Hatalı parça kararı bekliyor', grup: 'Kalite', sayac: 'bekleme', asama: 1, okumaIslemleri: ['kalite-merkezi.yaz', 'kalite-merkezi.onayla'],
    yol: '/kalite-merkezi/uygunsuzluklar', varsayilan: bekleme(1, 1, 3),
  },
  'siparisler.onay': {
    ad: 'Satış siparişi onay bekliyor', grup: 'Satış', sayac: 'bekleme', asama: 1, okumaIslemleri: ['siparisler.onayla'],
    yol: '/siparisler', varsayilan: bekleme(1, 2, 4),
  },
  'siparisler.termin': {
    ad: 'Satış siparişi termini', grup: 'Satış', sayac: 'son-gun', asama: 1, okumaIslemleri: ['siparisler.oku', 'siparisler.yaz'],
    yol: '/siparisler', varsayilan: sonGun(3, 1, 3),
  },
  // 3416-1 a: bekletilen üretim emri, neden başına (İş Akışı v4.7 bekleme tablosu). K3 ilk sınır, K4 ikinci sınır: gecikmenin
  // k4'üncü günü ikinci sınırın günüdür (malzeme 2 / 5 iş günü: k3 2, k4 4). Motor iş günü sayar; saatli sınır en yakın iş gününe iner.
  'uretim-emirleri.bekleme-malzeme': {
    ad: 'Emir malzeme bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(2, 4, null),
  },
  'uretim-emirleri.bekleme-fason': {
    ad: 'Emir fason dönüşü bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(2, 4, null),
  },
  'uretim-emirleri.bekleme-takim': {
    ad: 'Emir tezgah, takım ya da aparat bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    // 3418 a: 4 saat bekleyince Gecikti, başlangıçtan bir iş günü sonra (gecikmenin 2. iş günü) Yöneticide.
    yol: '/uretim-emirleri', varsayilan: bekleme(4, 2, null, { k3Birim: 'saat' }),
  },
  'uretim-emirleri.bekleme-kalite': {
    ad: 'Emir kalite kararı bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(1, 2, null),
  },
  'uretim-emirleri.bekleme-muhendislik': {
    ad: 'Emir mühendislik kararı bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(1, 2, null),
  },
  'uretim-emirleri.bekleme-teslim': {
    ad: 'Emir teslim edilmedi', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(1, 2, null),
  },
  // Aynı neden iki iş günü sürerse kendi sınırı dolmasa da yöneticiye çıkar (k3 2, k4 1: ikinci gün doğrudan Yöneticide). Yalnız
  // kendi kaynağı ikinci güne kadar yöneticiye çıkmayan nedenler girer (beklemeSuruyorNedenleri).
  'uretim-emirleri.bekleme-suruyor': {
    ad: 'Emir aynı nedenle iki gündür bekliyor', grup: 'Üretim', sayac: 'bekleme', asama: 1, okumaIslemleri: ['sayfa.uretim-emirleri'],
    yol: '/uretim-emirleri', varsayilan: bekleme(2, 1, null),
  },
  'degisiklik-yonetimi.gorev': {
    ad: 'Değişiklik görevi hedef süresi', grup: 'Değişiklik yönetimi', sayac: 'bekleme', asama: 2, okumaIslemleri: ['degisiklik-yonetimi.talep-ac', 'degisiklik-yonetimi.siniflandir'],
    yol: '/degisiklik-yonetimi', varsayilan: bekleme(5, 2, 5, { acik: false, serit: false, kapatilamaz: false }),
  },
  'malzemeler.kart-onay': {
    ad: 'Malzeme kartı onay bekliyor', grup: 'Malzemeler', sayac: 'bekleme', asama: 2, okumaIslemleri: ['malzemeler.onayla'],
    yol: '/malzemeler', varsayilan: bekleme(2, 2, null, { acik: false, serit: false, kapatilamaz: false }),
  },
  'ik.izin-onay': {
    ad: 'İzin onayı bekliyor', grup: 'İK', sayac: 'bekleme', asama: 2, okumaIslemleri: ['ik.izin-onay'],
    yol: '/ik-islemlerim/onaylar', varsayilan: bekleme(2, 1, null, { acik: false, serit: false, kapatilamaz: false }),
  },
  'finans.tahsilat': {
    ad: 'Tahsilat vadesi', grup: 'Finans', sayac: 'son-gun', asama: 2, okumaIslemleri: ['finans.oku', 'finans.yaz'], para: true,
    yol: '/finans', varsayilan: sonGun(3, 5, 10, { acik: false, serit: false, kapatilamaz: false, epostaKademe: 5 }),
  },
  'finans.odeme': {
    ad: 'Ödeme vadesi', grup: 'Finans', sayac: 'son-gun', asama: 2, okumaIslemleri: ['finans.oku', 'finans.yaz'], para: true,
    yol: '/finans', varsayilan: sonGun(3, 1, 3, { acik: false, serit: false, kapatilamaz: false, epostaKademe: 5 }),
  },
} as const satisfies Record<string, KademeKaynagiTanimi>;

export type KademeKaynagi = keyof typeof KADEME_KAYNAKLARI;
export const KADEME_KAYNAK_ANAHTARLARI = Object.keys(KADEME_KAYNAKLARI) as [KademeKaynagi, ...KademeKaynagi[]];
export const kademeKaynagiMi = (d: string): d is KademeKaynagi => Object.hasOwn(KADEME_KAYNAKLARI, d);

// Türün son eki kademe adından (ASCII).
export const KADEME_TUR_EKLERI = { 2: 'yaklasiyor', 3: 'gecikti', 4: 'yoneticide', 5: 'devret' } as const;
type Ek = (typeof KADEME_TUR_EKLERI)[keyof typeof KADEME_TUR_EKLERI];
type Modul<K extends string> = K extends `${infer M}.${string}` ? M : never;
type Ad<K extends string> = K extends `${string}.${infer A}` ? A : never;
// Bekleme sayacında K2 yoktur: türü de yoktur (tercih ekranında hiç gelmeyecek bir satır olmasın).
type KaynakEkleri<K extends KademeKaynagi> = (typeof KADEME_KAYNAKLARI)[K]['sayac'] extends 'son-gun' ? Ek : Exclude<Ek, 'yaklasiyor'>;
type TurAdi<K extends KademeKaynagi> = K extends KademeKaynagi ? `${Modul<K>}.kademe-${Ad<K>}-${KaynakEkleri<K>}` : never;
export type KademeTuruAdi = TurAdi<Exclude<KademeKaynagi, 'projeler.hazirlik'>>;

// Kaynağın bildirim ürettiği kademeler (K1 hiç bildirilmez; bekleme sayacında K2 yoktur).
export const kaynakKademeleri = (kaynak: KademeKaynagi): (2 | 3 | 4 | 5)[] =>
  KADEME_KAYNAKLARI[kaynak].sayac === 'son-gun' ? [2, 3, 4, 5] : [3, 4, 5];

// 3396'nın türleri korunur: kişi tercihleri ve e-posta tetikleyicileri onlara yazılmıştır.
const HAZIRLIK_TURLERI = { 2: 'projeler.hazirlik-hatirlatma', 3: 'projeler.hazirlik-gecikti', 4: 'projeler.hazirlik-yoneticiye', 5: 'projeler.hazirlik-devret' } as const;
export type HazirlikKademeTuru = (typeof HAZIRLIK_TURLERI)[keyof typeof HAZIRLIK_TURLERI];
export function kademeTuru(kaynak: KademeKaynagi, kademe: 2 | 3 | 4 | 5): KademeTuruAdi | HazirlikKademeTuru {
  if (kaynak === 'projeler.hazirlik') return HAZIRLIK_TURLERI[kademe];
  const nokta = kaynak.indexOf('.');
  return `${kaynak.slice(0, nokta)}.kademe-${kaynak.slice(nokta + 1)}-${KADEME_TUR_EKLERI[kademe]}` as KademeTuruAdi;
}

// Gün sınırları (ayar ekranı ve sunucu aynı sınırı kullanır).
export const KADEME_GUN_EN_COK = 60;
