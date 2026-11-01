// Plan motorunun girdisinin (st.D) tipli tanımı ve her alanın kaynağı (1683 b). Motor (motor/*.betik) değişmez; bu dosya ona giden verinin
// sözleşmesidir. Eski yol (motor/girdi.betik) bu biçimi tipsiz kurar; yeni yol alanları sahibi modüllerin tablolarından bu tiplerle kurar.
// Alanlar motorun ve eski yolun okuduğu adlardır (motorun dili), bu yüzden Türkçe tanımlayıcı kuralına uymayan kısa adlar (k, bag) kalır.

export const GUN_ADLARI = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
export type GunAdi = (typeof GUN_ADLARI)[number];

// Motor kimlikleri metindir (çerçevenin biçimi); sunucunun sayı kimliği String() ile geçer.
export type MotorKimligi = string;
// 'GGGG-AA-GG' ya da 'GGGG-AA-GG SS:DD' (tesisin duvar saati); motor parseT ile planın saat eksenine çevirir.
export type DuvarSaati = string;

export interface MotorVardiyasi { id: MotorKimligi; bas: string; bit: string; molalar: { bas: string; bit: string }[] }

export interface MotorTezgahi {
  id: MotorKimligi;
  ad: string;
  grup: MotorKimligi;
  // Saat ücreti (TL). Okunamazsa null: motor tutarı bilinmez sayar, sıfır uydurulmaz.
  ucret: number | null;
  ucretIst?: number | null;
  verim: number;
  vardiyalar?: MotorKimligi[];
  opOran: number;
  hafta?: Partial<Record<GunAdi, MotorKimligi[]>>;
  isiksiz?: boolean;
  arizaGun?: number;
  onarimSaat?: number;
}

export interface MotorKisisi {
  id: MotorKimligi;
  ad: string;
  vardiya: MotorKimligi;
  gruplar: MotorKimligi[];
  makineler: MotorKimligi[];
  enCok: number | null;
  ayar: boolean;
}

// [öncül adım anahtarı, 'b' bitişi bekler | 'o' akışlı devri bekler, ...sayfanın eklediği ek değerler]
export type MotorBagi = [string, 'b' | 'o', ...unknown[]];
export interface MotorTezgahSuresi { id: MotorKimligi; ayar: number; cevrim: number }

export interface MotorRotaAdimi {
  k: string;
  ad: string;
  tezgahlar?: MotorTezgahSuresi[];
  fason?: MotorKimligi;
  ortusebilir?: boolean;
  transfer?: number;
  ayarci?: false;
  minParti?: number;
  bag: MotorBagi[];
  aile: string;
  aparat?: string;
  fai?: boolean;
  program?: boolean;
  fasonIzin?: boolean;
}

export interface MotorUrunu {
  id: MotorKimligi;
  ad: string;
  rota: MotorRotaAdimi[];
  bilesenler?: { urun: MotorKimligi; miktar: number; adim: string }[];
}

export interface MotorMalzemesi {
  kod: MotorKimligi;
  ad: string;
  birim: string;
  // 1459 a: stok satırı yoksa null; 0 sayılmaz.
  stok: number | null;
  birimFiyat: number | null;
  fiyatTahmini?: true;
  kgRef?: { kalite: string; form: string; tarih: string; tlKg: number | null; kgFiyati: number; paraBirimi: string };
  saTermin?: string | null;
  saSurum?: number;
  saAciklama?: string;
  tedarikGun: number;
  muayeneGun: number;
}

export interface MotorMalzemeSatiri { kod: MotorKimligi; miktar: number; adim: string }

export interface MotorSiparisi {
  id: MotorKimligi;
  urun: MotorKimligi;
  adet: number;
  termin: DuvarSaati | null;
  serbest: DuvarSaati | null;
  // 815: emrin önceliği motorun sınıfına (1-3); önceliği olmayan 0.
  oncelik: 0 | 1 | 2 | 3;
  havuz?: boolean;
  ad: string;
  gelir: number | null;
  cezaGun: number | null;
  cezaOran?: number | null;
  cezaTavan?: number | null;
  malzeme: MotorMalzemeSatiri[];
  // 1476-D: çok katmanlı emrin alt düğümü ayrı siparişdir.
  dugum?: string;
  ust?: MotorKimligi;
  ustAdim?: string;
  birim?: number;
  dugumBiten?: string[];
  // Sayfanın öncelik ağırlığı (durum.betik agHazirla): elle çarpan, gerekçesi, giren ve geçişte saklanan eski sınıf.
  elle?: number;
  elleGerekce?: string;
  elleKim?: string;
  onc0?: number;
  musteri?: string;
  erkenSevk?: boolean;
}

export interface MotorFasoncusu {
  id: MotorKimligi;
  ad: string;
  kapasite: number;
  sureGun: number;
  cikisGunleri: GunAdi[];
  cikisSaat: number;
  sapmaGun?: number;
}

export interface MotorDevamsizligi { personel: MotorKimligi; gun: string; sunucu?: true }
export interface MotorSatinAlmasi { kod: MotorKimligi; miktar: number; gelis: DuvarSaati | null; tedarikci: string; no?: string; sunucu?: true; tb?: boolean }
export interface MotorAyarlari { tasimaSaat?: number; programSaat?: number; faiSaat?: number; transferOran?: number; fasonTalas?: MotorKimligi; mesaiUcret?: number }
export interface MotorAparati { id: string; adet: number }
export interface MotorAyarGecisi { den: string; ye: string; dk: number }
export interface MotorTedarikcisi { id: string; ortGecikmeGun?: number; sapmaGun?: number }

// Motorun okuduğu üst düzey alanlar (st.D). Sayfanın yalnız kendi hesabında kullandığı ayarlar (plan dengesi, yıllık çözüm, maliyet
// sistemi) tipsiz kalır: yeni yol onları açık çalışmadan olduğu gibi taşır (SAYFA_ALANLARI).
export interface MotorVerisi {
  meta: { ad: string; baslangic: string };
  vardiyalar: MotorVardiyasi[];
  calismaGunleri: Partial<Record<GunAdi, MotorKimligi[]>>;
  tatiller: string[];
  tezgahlar: MotorTezgahi[];
  personel: MotorKisisi[];
  urunler: MotorUrunu[];
  malzemeler: MotorMalzemesi[];
  siparisler: MotorSiparisi[];
  fasoncular?: MotorFasoncusu[];
  opAdet?: Record<string, number>;
  devamsizlik?: MotorDevamsizligi[];
  satinalma?: MotorSatinAlmasi[];
  ayarlar: MotorAyarlari;
  aparatlar?: MotorAparati[];
  ayarMatrisi?: MotorAyarGecisi[];
  tedarikciler?: MotorTedarikcisi[];
}

// Alanın kaynağı. sunucu: sahibi modülün tablosundan, her okumada yeniden; elle: planlamacının girdiği ana veri (bugün Planlama
// sayfasının JSON kaydında, 1719 ile sahibinin tablosuna); karma: sunucudan gelir, planlamacının elle değeri onu ezer ya da ilk kurulumdan
// sonra sayfada kalır; sayfa: sayfanın kendi ayarı, JSON kaydında kalır.
export type Kaynak = 'sunucu' | 'elle' | 'karma' | 'sayfa';
export interface AlanKaynagi {
  kaynak: Kaynak;
  // Verinin sahibi modül (klasör adı); sayfa alanında 'plan'. elle alanda önerilen sahiptir: kesin sahip 1719'un sahiplik sorusuyla belli olur.
  sahip: string;
  // Yeni yolu kuran kart (1683 b planı).
  kart: 1716 | 1717 | 1718 | 1719 | 1720;
}

// Üst düzey alanların kaynak tablosu; satisfies her MotorVerisi alanının yazılmasını zorlar (TASARIM.md 3).
export const UST_ALAN_KAYNAKLARI = {
  meta: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  vardiyalar: { kaynak: 'sunucu', sahip: 'vardiya', kart: 1716 },
  calismaGunleri: { kaynak: 'sunucu', sahip: 'vardiya', kart: 1716 },
  tatiller: { kaynak: 'sunucu', sahip: 'vardiya', kart: 1716 },
  tezgahlar: { kaynak: 'karma', sahip: 'istasyonlar', kart: 1716 },
  personel: { kaynak: 'karma', sahip: 'kisiler', kart: 1716 },
  devamsizlik: { kaynak: 'karma', sahip: 'vardiya', kart: 1716 },
  urunler: { kaynak: 'karma', sahip: 'rota', kart: 1717 },
  siparisler: { kaynak: 'karma', sahip: 'uretim-emirleri', kart: 1717 },
  opAdet: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  fasoncular: { kaynak: 'karma', sahip: 'musteri-tedarikci', kart: 1717 },
  malzemeler: { kaynak: 'karma', sahip: 'malzemeler', kart: 1718 },
  satinalma: { kaynak: 'karma', sahip: 'satin-alma', kart: 1718 },
  ayarlar: { kaynak: 'elle', sahip: 'plan', kart: 1719 },
  aparatlar: { kaynak: 'elle', sahip: 'plan', kart: 1719 },
  ayarMatrisi: { kaynak: 'elle', sahip: 'plan', kart: 1719 },
  tedarikciler: { kaynak: 'elle', sahip: 'musteri-tedarikci', kart: 1719 },
} as const satisfies Record<keyof MotorVerisi, AlanKaynagi>;

export const MOTOR_VERISI_ALANLARI = Object.keys(UST_ALAN_KAYNAKLARI) as (keyof MotorVerisi)[];

// Motorun okuduğu ama sayfanın kendi hesabına ait üst alanlar: tiplenmez, JSON kaydında kalır, yeni yol açık çalışmadan aynen taşır.
export const SAYFA_ALANLARI = [
  'planTL', 'planDenge', 'planAgirlik', 'musteriler', 'fasonTermin', 'fasonKarar', 'yillik', 'ortusAcik', 'agGoc', 'terminAyar',
  'talasFiyat', 'mesaiSis', 'mesaiKarar', 'maliyetSis', 'kgFiyat',
] as const;

// Karma ve elle kaynaklı varlık alanlarının satır düzeyi kaynağı (TASARIM.md 3.2). Anahtar varlığın alanıdır; satisfies yalnız var olan
// alanların yazılmasını zorlar, yazılmayan alan varlığın kaynağını (UST_ALAN_KAYNAKLARI) alır.
type AlanTablosu<T> = Partial<Record<keyof T, AlanKaynagi>>;
export const TEZGAH_ALANLARI = {
  id: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  ad: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  grup: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  ucret: { kaynak: 'karma', sahip: 'finans', kart: 1716 },
  ucretIst: { kaynak: 'sunucu', sahip: 'finans', kart: 1716 },
  verim: { kaynak: 'karma', sahip: 'istasyonlar', kart: 1716 },
  vardiyalar: { kaynak: 'karma', sahip: 'vardiya', kart: 1716 },
  opOran: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  hafta: { kaynak: 'sunucu', sahip: 'vardiya', kart: 1716 },
  isiksiz: { kaynak: 'elle', sahip: 'istasyonlar', kart: 1719 },
  arizaGun: { kaynak: 'elle', sahip: 'istasyonlar', kart: 1719 },
  onarimSaat: { kaynak: 'elle', sahip: 'istasyonlar', kart: 1719 },
} as const satisfies AlanTablosu<MotorTezgahi>;

export const KISI_ALANLARI = {
  id: { kaynak: 'sunucu', sahip: 'kisiler', kart: 1716 },
  ad: { kaynak: 'sunucu', sahip: 'kisiler', kart: 1716 },
  vardiya: { kaynak: 'sunucu', sahip: 'vardiya', kart: 1716 },
  gruplar: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  makineler: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  enCok: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1716 },
  ayar: { kaynak: 'karma', sahip: 'kisiler', kart: 1716 },
} as const satisfies AlanTablosu<MotorKisisi>;

// 1609 a: açık emrin adımları plana emrin sabit kopyasıyla (iş emirleri) girer; yürürlükteki rota yalnız emri açılmamış iş (taslak, teklif
// denemesi) içindir. Sahip bu yüzden uretim-emirleri'dir; eski yol yürürlükteki rotayı okur, fark 1717'de izinli farktır (TASARIM.md 4.4).
export const ROTA_ADIMI_ALANLARI = {
  k: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ad: { kaynak: 'sunucu', sahip: 'istasyonlar', kart: 1717 },
  tezgahlar: { kaynak: 'karma', sahip: 'uretim-emirleri', kart: 1717 },
  fason: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ortusebilir: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  transfer: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ayarci: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  minParti: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  bag: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  aile: { kaynak: 'elle', sahip: 'rota', kart: 1719 },
  aparat: { kaynak: 'elle', sahip: 'rota', kart: 1719 },
  fai: { kaynak: 'elle', sahip: 'rota', kart: 1719 },
  program: { kaynak: 'elle', sahip: 'rota', kart: 1719 },
  fasonIzin: { kaynak: 'elle', sahip: 'rota', kart: 1719 },
} as const satisfies AlanTablosu<MotorRotaAdimi>;

export const MALZEME_ALANLARI = {
  kod: { kaynak: 'sunucu', sahip: 'malzemeler', kart: 1718 },
  ad: { kaynak: 'sunucu', sahip: 'malzemeler', kart: 1718 },
  birim: { kaynak: 'sunucu', sahip: 'malzemeler', kart: 1718 },
  stok: { kaynak: 'sunucu', sahip: 'stok', kart: 1718 },
  birimFiyat: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  fiyatTahmini: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  kgRef: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  saTermin: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  saSurum: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  saAciklama: { kaynak: 'sunucu', sahip: 'satin-alma', kart: 1718 },
  tedarikGun: { kaynak: 'elle', sahip: 'malzemeler', kart: 1719 },
  muayeneGun: { kaynak: 'elle', sahip: 'malzemeler', kart: 1719 },
} as const satisfies AlanTablosu<MotorMalzemesi>;

export const SIPARIS_ALANLARI = {
  id: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  urun: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  adet: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  termin: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  serbest: { kaynak: 'karma', sahip: 'uretim-emirleri', kart: 1717 },
  oncelik: { kaynak: 'karma', sahip: 'uretim-emirleri', kart: 1717 },
  havuz: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ad: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  gelir: { kaynak: 'karma', sahip: 'siparisler', kart: 1717 },
  cezaGun: { kaynak: 'karma', sahip: 'siparisler', kart: 1717 },
  cezaOran: { kaynak: 'sunucu', sahip: 'siparisler', kart: 1717 },
  cezaTavan: { kaynak: 'sunucu', sahip: 'siparisler', kart: 1717 },
  malzeme: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  dugum: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ust: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  ustAdim: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  birim: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  dugumBiten: { kaynak: 'sunucu', sahip: 'uretim-emirleri', kart: 1717 },
  elle: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  elleGerekce: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  elleKim: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  onc0: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  musteri: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
  erkenSevk: { kaynak: 'sayfa', sahip: 'plan', kart: 1720 },
} as const satisfies AlanTablosu<MotorSiparisi>;

export const FASONCU_ALANLARI = {
  id: { kaynak: 'sunucu', sahip: 'musteri-tedarikci', kart: 1717 },
  ad: { kaynak: 'sunucu', sahip: 'musteri-tedarikci', kart: 1717 },
  sureGun: { kaynak: 'karma', sahip: 'rota', kart: 1717 },
  kapasite: { kaynak: 'elle', sahip: 'musteri-tedarikci', kart: 1719 },
  cikisGunleri: { kaynak: 'elle', sahip: 'musteri-tedarikci', kart: 1719 },
  cikisSaat: { kaynak: 'elle', sahip: 'musteri-tedarikci', kart: 1719 },
  sapmaGun: { kaynak: 'elle', sahip: 'musteri-tedarikci', kart: 1719 },
} as const satisfies AlanTablosu<MotorFasoncusu>;

// Yeni yolun bir dilimi: sahibi modüllerin okumasından (O) ve elle verinin kaynağından (E) MotorVerisi'nin kendi alanlarını kurar. kur saftır
// (veritabanı ve saat yok); okuma ayrı (sorgu ya da disari.ts) yapılır, böylece eşdeğerlik testi kur'u eski yolla aynı veride sınar.
export interface Dilim<O, E, A extends keyof MotorVerisi> {
  ad: string;
  kart: AlanKaynagi['kart'];
  alanlar: readonly A[];
  kur: (okuma: O, elle: E) => Pick<MotorVerisi, A>;
}
