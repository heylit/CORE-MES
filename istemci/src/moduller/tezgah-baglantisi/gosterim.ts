import type { TezgahDurumu, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const YOK = '—';

// Renk tek başına anlam taşımaz: durum kelimeyle yazılır.
export const DURUM: Record<TezgahDurumu, { metin: string; ton: RozetTonu }> = {
  calisiyor: { metin: 'Çalışıyor', ton: 'tamam' },
  bekliyor: { metin: 'Bekliyor', ton: 'uyari' },
  alarm: { metin: 'Alarm', ton: 'hata' },
  'baglanti-yok': { metin: 'Bağlantı yok', ton: 'pasif' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'pasif' },
};

// SmartES kendi durum adlarını verir; "kapalı" yalnız SmartES'te vardır.
const SMARTES_DURUM: Record<string, string> = { ...Object.fromEntries(Object.entries(DURUM).map(([k, v]) => [k, v.metin])), kapali: 'Kapalı' };
export const smartesDurumMetni = (d: string): string => SMARTES_DURUM[d] ?? d;

export const ALAN_ADI: Record<TezgahKarsilastirmaAlani, string> = {
  durum: 'Durum', program: 'Program', sayac: 'Sayaç', isMiliHizi: 'İş mili', isMiliYuku: 'Yük',
};

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export const sayiMetni = (n: number | null, birim = ''): string => (n === null ? YOK : `${SAYI.format(n)}${birim}`);
export const yukMetni = (n: number | null): string => (n === null ? YOK : `%${SAYI.format(n)}`);
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const saatMetni = (z: string | null): string => (z === null ? YOK : SAAT.format(new Date(z)));

// MTConnect birimleri büyük harf ve İngilizce gelir; bilinenler kısa Türkçe yazılır, bilinmeyen olduğu gibi (küçük harf) kalır.
const BIRIM: Record<string, string> = {
  PERCENT: '%', 'REVOLUTION/MINUTE': 'dev/dk', MILLIMETER: 'mm', 'MILLIMETER/SECOND': 'mm/sn', 'MILLIMETER/MINUTE': 'mm/dk', CELSIUS: '°C', AMPERE: 'A', VOLT: 'V',
  WATT: 'W', HERTZ: 'Hz', SECOND: 'sn', MINUTE: 'dk', COUNT: 'adet', DEGREE: '°', NEWTON_METER: 'Nm', KILOWATT_HOUR: 'kWh', PASCAL: 'Pa',
};
export const birimMetni = (b: string | null): string => (b === null ? '' : BIRIM[b] ?? b.toLowerCase());

const BILESEN: Record<string, string> = { Device: 'Tezgâh', Controller: 'Denetleyici', Linear: 'Doğrusal eksen', Rotary: 'Dönel eksen', Path: 'Yol', Axes: 'Eksenler', Systems: 'Sistemler' };
export const BILESEN_SIRASI = ['Device', 'Controller', 'Path', 'Axes', 'Linear', 'Rotary'];
export function bilesenMetni(bilesen: string | null, ad: string | null): string {
  const b = bilesen === null ? 'Diğer' : BILESEN[bilesen] ?? bilesen;
  return ad === null || ad.toLowerCase() === (bilesen ?? '').toLowerCase() ? b : `${b} · ${ad}`;
}

const ONDALIK = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
// Sayı gibi görünen değer yerel biçimle, diğerleri olduğu gibi yazılır; değer yoksa "—".
export function degerMetni(deger: string | null, birim: string | null): string {
  if (deger === null) return YOK;
  const n = Number(deger);
  const metin = deger.trim() !== '' && Number.isFinite(n) ? ONDALIK.format(n) : deger;
  const b = birimMetni(birim);
  return b === '' ? metin : `${metin} ${b}`;
}

export const KOSUL_TONU = { Normal: 'tamam', Warning: 'uyari', Fault: 'hata', Unavailable: 'pasif' } as const;
export const KOSUL_ADI = { Normal: 'Normal', Warning: 'Uyarı', Fault: 'Hata', Unavailable: 'Yok' } as const;
export const BOSLUK_NEDENI = { 'tampon-asildi': 'Servis tamponundan düştü', 'servis-yeniden-basladi': 'Servis yeniden başladı', 'satir-siniri': 'Satır sınırı aşıldı, eski kayıtlar silindi' } as const;

const SAAT_DK = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
export const dakikaMetni = (z: string): string => SAAT_DK.format(new Date(z));

// "5 sn önce", "2 dk önce"; gelecekteki küçük saat farkı "şimdi" sayılır.
export function yasMetni(z: string | null, simdi: number): string {
  if (z === null) return 'henüz okunmadı';
  const sn = Math.max(0, Math.round((simdi - new Date(z).getTime()) / 1000));
  if (sn < 60) return `${sn} sn önce`;
  if (sn < 3600) return `${Math.floor(sn / 60)} dk önce`;
  return `${Math.floor(sn / 3600)} sa önce`;
}

// Okunur ad: bilinen MTConnect türleri Türkçe yazılır, ham ad ipucunda (title) kalır; bilinmeyen tür olduğu gibi görünür.
const TUR_ADI: Record<string, string> = {
  Availability: 'Erişim', Execution: 'Çalışma durumu', ControllerMode: 'Çalışma kipi', Program: 'Program', PartCount: 'Sayaç', ToolNumber: 'Takım',
  PathFeedrate: 'İlerleme hızı', Load: 'Yük', SpindleSpeed: 'İş mili hızı', RotaryVelocity: 'İş mili hızı', Position: 'Konum', EmergencyStop: 'Acil durdurma',
  Temperature: 'Sıcaklık', Block: 'Satır', Line: 'Satır no',
};
export const turAdi = (tur: string): string => TUR_ADI[tur] ?? tur;

const DEGER_ADI: Record<string, string> = {
  AVAILABLE: 'Erişilebilir', UNAVAILABLE: 'Erişilemez', ACTIVE: 'Etkin', READY: 'Hazır', STOPPED: 'Durdu', INTERRUPTED: 'Kesildi', FEED_HOLD: 'İlerleme bekletildi',
  PROGRAM_STOPPED: 'Program durdu', PROGRAM_COMPLETED: 'Program bitti', OPTIONAL_STOP: 'İsteğe bağlı durma', WAIT: 'Bekliyor', AUTOMATIC: 'Otomatik', MANUAL: 'Elle',
  MANUAL_DATA_INPUT: 'Elle veri girişi', EDIT: 'Düzenleme', ARMED: 'Hazır', TRIGGERED: 'Basılı',
};
const ADLANDIRILAN_TURLER = new Set(['Availability', 'Execution', 'ControllerMode', 'EmergencyStop']);
// Yalnız sabit sözlüklü türlerin değeri çevrilir; program adı, sayaç gibi serbest değerler olduğu gibi kalır.
export const degerAdi = (tur: string, deger: string | null): string | null => (deger !== null && ADLANDIRILAN_TURLER.has(tur) ? DEGER_ADI[deger] ?? deger : deger);

// Kayıt yoksa "kayıt yok", tezgâhtan değer gelmiyorsa "—".
export const KAYIT_YOK = 'kayıt\u00a0yok';

// Sorunlu tezgâh üstte: alarm, SmartES'ten farklı, eski ya da bağlantısız, sonra diğerleri; eşitlikte ada göre.
interface Siralanabilir { cihazAdi: string; durum: TezgahDurumu; eski: boolean; farklar: readonly unknown[] }
export const sorunDerecesi = (t: Siralanabilir): number => (t.durum === 'alarm' ? 0 : t.farklar.length > 0 ? 1 : t.eski || t.durum === 'baglanti-yok' ? 2 : 3);
export const sorunaGoreSirala = <T extends Siralanabilir>(liste: readonly T[]): T[] =>
  [...liste].sort((a, b) => sorunDerecesi(a) - sorunDerecesi(b) || a.cihazAdi.localeCompare(b.cihazAdi, 'tr'));

const GUN_SAAT = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const gunSaatMetni = (z: string): string => GUN_SAAT.format(new Date(z));
