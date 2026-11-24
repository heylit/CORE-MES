import type { BildirimTuru } from './bildirim.ts';

// E-posta kanalının (ADR 0015, 3397) zod'suz sabitleri: istemci de değer olarak ithal eder (canlı ön izleme, seçenekler).

// Şablon konusu olayın kaynak modülünden gelir; gecikme ve hatırlatma konu değil süzgeçtir (olayın sınıfı ve adı).
export const EPOSTA_KONULARI = ['satin-alma', 'proje', 'satis', 'planlama', 'uretim', 'toplanti', 'genel'] as const;
export type EpostaKonusu = (typeof EPOSTA_KONULARI)[number];
export const EPOSTA_KONU_ADLARI: Record<EpostaKonusu, string> = {
  'satin-alma': 'Satın alma', proje: 'Proje', satis: 'Satış', planlama: 'Planlama', uretim: 'Üretim devir alma', toplanti: 'Toplantı', genel: 'Genel',
};
const KONU_MODULLERI: Record<string, EpostaKonusu> = {
  'satin-alma': 'satin-alma', malzemeler: 'satin-alma', projeler: 'proje', 'uretim-emirleri': 'proje', siparisler: 'satis',
  arkon: 'planlama', plan: 'planlama', stok: 'uretim', istasyonlar: 'uretim', 'cnc-kurulum': 'uretim', toplantilar: 'toplanti',
};
export const turKonusu = (tur: BildirimTuru | string): EpostaKonusu => KONU_MODULLERI[tur.slice(0, tur.indexOf('.'))] ?? 'genel';

// E-postanın ikonu bu listedendir; her biri sunucuda gömülü küçük resimdir (dış adres yok).
export const EPOSTA_SIMGELERI = ['cart', 'clipboard-check', 'tag', 'calendar', 'route', 'clock', 'bell', 'alert'] as const;
export type EpostaSimgesi = (typeof EPOSTA_SIMGELERI)[number];

// Gövdeye yalnız bu alanlar girer (ADR 0015 md 6, 3397): müşteri ve tedarikçi adı, fiyat, parça no ve serbest metin yer tutucusu yoktur.
// Son dördü (3448, md 6 eki) yalnız toplantı davetinde dolar: başlık, saat aralığı, yer, düzenleyen; öteki olaylarda boştur.
export const EPOSTA_YER_TUTUCULARI = [
  'alici_adi', 'olay', 'kayit_no', 'tarih', 'gecikme_gunu', 'istasyon', 'kayit_baglantisi', 'onem', 'kademe', 'kayit_basligi', 'zaman_araligi', 'yer', 'duzenleyen',
] as const;
export type EpostaYerTutucusu = (typeof EPOSTA_YER_TUTUCULARI)[number];
// Kalıpta yalnız izinli yer tutucu geçer; bilinmeyen {ad} kaydı reddeder (müşteri adı gibi alan sonradan sızmasın).
export function bilinmeyenYerTutucular(metin: string): string[] {
  const izinli = new Set<string>(EPOSTA_YER_TUTUCULARI);
  return [...new Set([...metin.matchAll(/\{([^{}\s]*)\}/g)].map((e) => e[1] ?? '').filter((ad) => !izinli.has(ad)))];
}
export type EpostaDegerleri = Record<EpostaYerTutucusu, string | null>;
// Boş değer boş metin olur; yer tutucunun kendisi e-postada kalmaz.
export const sablonDoldur = (kalip: string, d: EpostaDegerleri): string =>
  kalip.replace(/\{([a-z_]+)\}/g, (butun, ad: string) => ((EPOSTA_YER_TUTUCULARI as readonly string[]).includes(ad) ? d[ad as EpostaYerTutucusu] ?? '' : butun));
// Bilgi tablosunun satırları; boş değerli satır e-postaya yazılmaz.
export const EPOSTA_TABLO_ALANLARI = ['kayit_no', 'olay', 'tarih', 'gecikme_gunu', 'istasyon', 'onem', 'kademe', 'zaman_araligi', 'yer', 'duzenleyen'] as const;
export type EpostaTabloAlani = (typeof EPOSTA_TABLO_ALANLARI)[number];
export const EPOSTA_TABLO_ADLARI: Record<EpostaTabloAlani, string> = {
  kayit_no: 'Kayıt no', olay: 'Olay', tarih: 'Tarih', gecikme_gunu: 'Gecikme günü', istasyon: 'İstasyon', onem: 'Önem', kademe: 'Kademe',
  zaman_araligi: 'Zaman', yer: 'Yer', duzenleyen: 'Düzenleyen',
};
export const EPOSTA_KONU_EN_UZUN = 150;
export const EPOSTA_GOVDE_EN_UZUN = 2000;
export const EPOSTA_BASLIK_EN_UZUN = 150;
export const EPOSTA_DUGME_EN_UZUN = 40;
export const EPOSTA_ALT_BILGI_EN_UZUN = 300;
export const EPOSTA_SABLON_AD_EN_UZUN = 80;
export const EPOSTA_VARSAYILAN_DUGME = 'Kayda git';

// 3435-2 a: şablonun renk şeridi. 'onem' bildirimin önem rengini kullanır; 'yok' şerit çizmez.
export const EPOSTA_SERITLERI = ['onem', 'sari', 'turuncu', 'kirmizi', 'mavi', 'yesil', 'yok'] as const;
export type EpostaSeridi = (typeof EPOSTA_SERITLERI)[number];
export const EPOSTA_SERIT_ADLARI: Readonly<Record<EpostaSeridi, string>> = {
  onem: 'Önemden', sari: 'Sarı', turuncu: 'Turuncu', kirmizi: 'Kırmızı', mavi: 'Mavi', yesil: 'Yeşil', yok: 'Yok',
};

// Bir şablonun düzenlenen her parçası. Boş başlık olayın adı, boş düğme yazısı "Kayda git", boş alt bilgi sistemin cümlesidir.
// logo: Sistem Ayarları'ndaki kurum logosu e-postanın üst bilgisine gömülür (yüklü değilse yazılmaz).
export interface EpostaSablonIcerigi {
  simge: EpostaSimgesi; konuKalibi: string; baslikKalibi: string | null; govde: string; tabloAlanlari: EpostaTabloAlani[];
  dugmeYazisi: string | null; onayDugmesi: boolean; altBilgi: string | null; serit: EpostaSeridi; logo: boolean;
  duzen: EpostaDuzeni;
}

// 3639: şablonun üst bant metni, önem rozeti, başlık altı satırı, tablo satır adları ve düğme rengi. Tek jsonb sütunudur; boş alan
// kod varsayılanı demektir (üst bant gönderen adı, rozet açık, alt satır "{kayit_no} · {tarih}", satır adı alanın adı, düğme koyu).
// "Bu e-posta CORE MES tarafından gönderildi" cümlesi ve onay düğmelerinin bağlantısı burada yoktur: iletilen e-posta yönlendirme
// aracı olmasın.
export const EPOSTA_DUGME_RENKLERI = ['koyu', 'yesil', 'mavi'] as const;
export type EpostaDugmeRengi = (typeof EPOSTA_DUGME_RENKLERI)[number];
export const EPOSTA_DUGME_RENK_ADLARI: Readonly<Record<EpostaDugmeRengi, string>> = { koyu: 'Koyu', yesil: 'Yeşil', mavi: 'Mavi' };
export const EPOSTA_UST_BANT_EN_UZUN = 60;
export const EPOSTA_ALT_SATIR_EN_UZUN = 150;
export const EPOSTA_SATIR_ADI_EN_UZUN = 40;
export interface EpostaDuzeni {
  ustBant: string | null;
  onemRozeti: boolean;
  altSatir: string | null;
  tabloAdlari: Partial<Record<EpostaTabloAlani, string>>;
  dugmeRengi: EpostaDugmeRengi;
}
export const EPOSTA_VARSAYILAN_DUZEN: EpostaDuzeni = { ustBant: null, onemRozeti: true, altSatir: null, tabloAdlari: {}, dugmeRengi: 'koyu' };
export const EPOSTA_VARSAYILAN_ALT_SATIR = '{kayit_no} · {tarih}';
// Kayıtlı (ya da gövdeden gelen) değeri tam düzene çevirir: eksik ya da geçersiz alan varsayılandır.
export function epostaDuzeni(ham: unknown): EpostaDuzeni {
  const o = typeof ham === 'object' && ham !== null && !Array.isArray(ham) ? ham as Record<string, unknown> : {};
  const metin = (x: unknown, en: number): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim().slice(0, en) : null);
  const adlar: Partial<Record<EpostaTabloAlani, string>> = {};
  const ham2 = typeof o['tabloAdlari'] === 'object' && o['tabloAdlari'] !== null ? o['tabloAdlari'] as Record<string, unknown> : {};
  for (const a of EPOSTA_TABLO_ALANLARI) { const m = metin(ham2[a], EPOSTA_SATIR_ADI_EN_UZUN); if (m !== null) adlar[a] = m; }
  const renk = EPOSTA_DUGME_RENKLERI.find((r) => r === o['dugmeRengi']);
  return {
    ustBant: metin(o['ustBant'], EPOSTA_UST_BANT_EN_UZUN), onemRozeti: o['onemRozeti'] !== false,
    altSatir: metin(o['altSatir'], EPOSTA_ALT_SATIR_EN_UZUN), tabloAdlari: adlar, dugmeRengi: renk ?? 'koyu',
  };
}

// Posta sunucusu kipi (3397-4 a): kurum içi sunucu ve yerel aktarıcı kurum içi adresi, dış servis tek tanımlı dış adresi kullanır.
export const EPOSTA_KIPLERI = ['kurum-ici', 'yerel-aktarici', 'dis-servis'] as const;
export type EpostaKipi = (typeof EPOSTA_KIPLERI)[number];
export const EPOSTA_KIP_ADLARI: Readonly<Record<EpostaKipi, string>> = {
  'kurum-ici': 'Kurum içi posta sunucusu',
  'yerel-aktarici': 'Yerel aktarıcı (dış servise BT aktarır)',
  'dis-servis': 'Dış posta servisi',
};

export const EPOSTA_ZAMANLARI = ['hemen', 'ozet'] as const;
export type EpostaZamani = (typeof EPOSTA_ZAMANLARI)[number];
export const EPOSTA_TEKRAR_EN_COK = 10;
export const EPOSTA_GUN_EN_COK = 60;
export const EPOSTA_YUKSELT_ROL_EN_COK = 20;
export const EPOSTA_YUKSELT_KISI_EN_COK = 50;

export const EPOSTA_SONUCLARI = ['gonderildi', 'gonderilemedi', 'atlandi'] as const;
export type EpostaSonucu = (typeof EPOSTA_SONUCLARI)[number];

// 3431 a: onay bekleyen türlerin e-postasında Onayla ve Reddet düğmesi vardır. Düğme yalnız kaydın ekranını `?eylem=` ile açar;
// onay uygulamada, girişle ve kişinin kendi yetkisiyle verilir (adres onay vermez, iletilen e-posta yetki taşımaz).
// Ret, onaycının ekranında ret düğmesi olan türde vardır (sipariş, iskonto ve termin onayında onaycı reddetmez).
export const EPOSTA_ONAY_TURLERI: Readonly<Partial<Record<BildirimTuru, { reddet: boolean }>>> = {
  'satin-alma.talep-onay-bekliyor': { reddet: true }, 'malzemeler.kart-onay-bekliyor': { reddet: true }, 'ik.izin-onay-bekliyor': { reddet: true },
  'siparisler.onay-bekliyor': { reddet: false }, 'siparisler.iskonto-onay-bekliyor': { reddet: false }, 'siparisler.termin-onay-bekliyor': { reddet: false },
};
export const turOnayi = (tur: string): { reddet: boolean } | null => EPOSTA_ONAY_TURLERI[tur as BildirimTuru] ?? null;
export const ONAY_EYLEMLERI = ['onayla', 'reddet'] as const;
export type OnayEylemi = (typeof ONAY_EYLEMLERI)[number];
export const ONAY_EYLEMI_PARAMETRESI = 'eylem';
// Kaydın yoluna eylem eklenir; yolda zaten sorgu varsa `&` ile.
export const onayEylemiYolu = (yol: string, eylem: OnayEylemi): string => `${yol}${yol.includes('?') ? '&' : '?'}${ONAY_EYLEMI_PARAMETRESI}=${eylem}`;
// Ekran adresindeki eylem; bilinmeyen değer yok sayılır.
export function adrestekiOnayEylemi(arama: string | URLSearchParams): OnayEylemi | null {
  const d = (typeof arama === 'string' ? new URLSearchParams(arama) : arama).get(ONAY_EYLEMI_PARAMETRESI);
  return (ONAY_EYLEMLERI as readonly string[]).includes(d ?? '') ? d as OnayEylemi : null;
}
