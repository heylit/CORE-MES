import type { TezgahDurumu, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { XmlOgesi } from './xml.ts';

// Okuma aralığı SmartES makine panosuyla aynıdır. Servis SmartES'in tezgahlarını da besler: dakikada tek istek, yineleme yok.
export const OKUMA_ARALIGI_MS = 60_000;
export const ISTEK_SURESI_MS = 5_000;
// Son okuma bu kadar eskiyse ekranda "eski okuma" yazar.
export const ESKI_OKUMA_MS = 2 * OKUMA_ARALIGI_MS;
// Durum örnekleri bu süreden sonra silinir.
export const ORNEK_SAKLAMA_GUNU = 30;
export const AZAMI_TEZGAH = 64;
export const AZAMI_OGE = 400;
export const AZAMI_DEGER_UZUNLUGU = 200;
export const OKUMA_AYARI = 'tezgah-baglantisi.okuma';

// Eşikler (kart 3373): iş mili hızı yüzde 2'den, yük 5 puandan fazla ayrışırsa fark sayılır.
export const HIZ_ESIGI_ORANI = 0.02;
export const YUK_ESIGI_PUANI = 5;

export interface TezgahOgesi {
  // MTConnect öğe türü, geldiği adla (ör. Execution, PartCount, Load); koşullarda `type` niteliği.
  tur: string;
  ad: string | null;
  // Öğenin bağlı olduğu bileşen (ör. Rotary, Linear, Controller).
  bilesen: string | null;
  deger: string | null;
  zaman: string | null;
  // Yalnız koşul öğelerinde: Normal, Warning, Fault, Unavailable.
  kosul: string | null;
}

export interface TezgahOkumasi {
  cihazAdi: string;
  ogeler: TezgahOgesi[];
}

const kirp = (m: string | undefined, sinir = AZAMI_DEGER_UZUNLUGU): string | null => {
  const t = (m ?? '').trim();
  return t === '' ? null : t.slice(0, sinir);
};

// MTConnect "yok" değerini UNAVAILABLE diye yayınlar; değer yok sayılır (sıfır uydurulmaz).
const degerOku = (m: string): string | null => {
  const t = kirp(m);
  return t === null || t.toUpperCase() === 'UNAVAILABLE' ? null : t;
};

const KAPLAR = new Set(['Samples', 'Events', 'Condition']);

// /current cevabı: MTConnectStreams > Streams > DeviceStream > ComponentStream > (Samples | Events | Condition) > öğe.
// Beklenen kök yoksa null: cevap MTConnect değildir.
export function akislariOku(kok: XmlOgesi): TezgahOkumasi[] | null {
  if (kok.ad !== 'MTConnectStreams') return null;
  const okumalar: TezgahOkumasi[] = [];
  for (const akislar of kok.cocuklar) {
    if (akislar.ad !== 'Streams') continue;
    for (const cihaz of akislar.cocuklar) {
      if (cihaz.ad !== 'DeviceStream' || okumalar.length >= AZAMI_TEZGAH) continue;
      const cihazAdi = kirp(cihaz.nitelikler['name'], 100);
      if (cihazAdi === null) continue;
      const ogeler: TezgahOgesi[] = [];
      for (const bilesen of cihaz.cocuklar) {
        if (bilesen.ad !== 'ComponentStream') continue;
        const bilesenAdi = kirp(bilesen.nitelikler['component'], 60);
        for (const kap of bilesen.cocuklar) {
          if (!KAPLAR.has(kap.ad)) continue;
          for (const o of kap.cocuklar) {
            if (ogeler.length >= AZAMI_OGE) break;
            const kosul = kap.ad === 'Condition';
            ogeler.push({
              tur: kirp(kosul ? o.nitelikler['type'] : o.ad, 60) ?? o.ad,
              ad: kirp(o.nitelikler['name'], 60),
              bilesen: bilesenAdi,
              deger: kosul ? kirp(o.metin) : degerOku(o.metin),
              zaman: kirp(o.nitelikler['timestamp'], 40),
              kosul: kosul ? o.ad : null,
            });
          }
        }
      }
      okumalar.push({ cihazAdi, ogeler });
    }
  }
  return okumalar;
}

// /probe cevabı: MTConnectDevices > Devices > Device. Yalnız cihaz sayısı okunur; cihaz adı, seri no ve uuid saklanmaz.
export function cihazSayisiOku(kok: XmlOgesi): number | null {
  if (kok.ad !== 'MTConnectDevices') return null;
  let n = 0;
  for (const c of kok.cocuklar) if (c.ad === 'Devices') n += c.cocuklar.filter((d) => d.ad === 'Device').length;
  return n;
}

export interface TezgahOzeti {
  durum: TezgahDurumu;
  calisma: string | null;
  mod: string | null;
  program: string | null;
  sayac: number | null;
  takim: string | null;
  isMiliHizi: number | null;
  isMiliYuku: number | null;
  ilerleme: number | null;
  alarm: string | null;
}

const sayi = (m: string | null): number | null => {
  if (m === null) return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
};

const esit = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// Tür adı sürüme göre değişir (1.2: SpindleSpeed; sonrası RotaryVelocity). İlk dolu değer alınır.
function ilk(ogeler: readonly TezgahOgesi[], turler: readonly string[], bilesen?: string): string | null {
  for (const tur of turler) {
    for (const o of ogeler) {
      if (o.kosul === null && esit(o.tur, tur) && o.deger !== null && (bilesen === undefined || (o.bilesen !== null && esit(o.bilesen, bilesen)))) return o.deger;
    }
  }
  return null;
}

const CALISAN = new Set(['ACTIVE']);
const BEKLEYEN = new Set(['READY', 'STOPPED', 'INTERRUPTED', 'FEED_HOLD', 'PROGRAM_STOPPED', 'PROGRAM_COMPLETED', 'OPTIONAL_STOP', 'WAIT']);

// Tezgahın yayınladığından durum çıkarılır. Değer biçimi bilinmeyen ya da hiç gelmeyen alan null kalır, durum "bilinmiyor" olur.
export function ozetle(ogeler: readonly TezgahOgesi[]): TezgahOzeti {
  const erisim = ilk(ogeler, ['Availability']);
  const calisma = ilk(ogeler, ['Execution']);
  const hatalar = ogeler.filter((o) => o.kosul === 'Fault');
  const alarm = hatalar.length === 0 ? null
    : hatalar.map((o) => (o.deger === null ? o.tur : `${o.tur}: ${o.deger}`)).join(' · ').slice(0, AZAMI_DEGER_UZUNLUGU);
  let durum: TezgahDurumu;
  if (erisim === null || !esit(erisim, 'AVAILABLE')) durum = 'baglanti-yok';
  else if (alarm !== null) durum = 'alarm';
  else if (calisma !== null && CALISAN.has(calisma.toUpperCase())) durum = 'calisiyor';
  else if (calisma !== null && BEKLEYEN.has(calisma.toUpperCase())) durum = 'bekliyor';
  else durum = 'bilinmiyor';
  const sayac = sayi(ilk(ogeler, ['PartCount']));
  return {
    durum,
    calisma,
    mod: ilk(ogeler, ['ControllerMode']),
    program: ilk(ogeler, ['Program']),
    sayac: sayac === null ? null : Math.trunc(sayac),
    takim: ilk(ogeler, ['ToolNumber', 'ToolId', 'ToolAssetId']),
    isMiliHizi: sayi(ilk(ogeler, ['SpindleSpeed', 'RotaryVelocity'])),
    isMiliYuku: sayi(ilk(ogeler, ['Load'], 'Rotary')),
    ilerleme: sayi(ilk(ogeler, ['PathFeedrate'])),
    alarm,
  };
}

export interface SmartesDegerleri {
  durum: string;
  program: string | null;
  sayac: number | null;
  isMiliHizi: number | null;
  isMiliYuku: number | null;
}

// SmartES "kapalı" ile tezgahın "bağlantı yok" hali aynı sayılır: ikisi de tezgahtan veri gelmediğini söyler.
const durumSinifi = (d: string): string => (d === 'kapali' ? 'baglanti-yok' : d);

// Karşılaştırma yalnız iki yanda da değer varken yapılır; tezgah bağlı değilken yalnız durum karşılaştırılır.
export function farklar(t: TezgahOzeti, s: SmartesDegerleri): TezgahKarsilastirmaAlani[] {
  const sonuc: TezgahKarsilastirmaAlani[] = [];
  if (durumSinifi(t.durum) !== durumSinifi(s.durum)) sonuc.push('durum');
  if (t.durum === 'baglanti-yok') return sonuc;
  if (t.program !== null && s.program !== null && t.program.trim() !== s.program.trim()) sonuc.push('program');
  if (t.sayac !== null && s.sayac !== null && t.sayac !== s.sayac) sonuc.push('sayac');
  if (t.isMiliHizi !== null && s.isMiliHizi !== null) {
    const buyuk = Math.max(Math.abs(t.isMiliHizi), Math.abs(s.isMiliHizi));
    if (Math.abs(t.isMiliHizi - s.isMiliHizi) > buyuk * HIZ_ESIGI_ORANI) sonuc.push('isMiliHizi');
  }
  if (t.isMiliYuku !== null && s.isMiliYuku !== null && Math.abs(t.isMiliYuku - s.isMiliYuku) > YUK_ESIGI_PUANI) sonuc.push('isMiliYuku');
  return sonuc;
}

export const eskiMi = (okundu: string | Date, simdi: Date): boolean => simdi.getTime() - new Date(okundu).getTime() > ESKI_OKUMA_MS;
