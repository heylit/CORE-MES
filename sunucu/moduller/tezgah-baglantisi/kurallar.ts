import type { TezgahDurumu, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { XmlOgesi } from './xml.ts';

// Okuma aralığı Sistem Ayarları'ndadır (5-60 sn, varsayılan 5). Servis başka sistemleri de besleyebilir: yineleme yok, art arda
// hatada aralık 60 saniyeye kadar ikiye katlanır.
export const VARSAYILAN_ARALIK_SN = 5;
export const EN_UZUN_ARALIK_MS = 60_000;
export const ISTEK_SURESI_MS = 5_000;
export const VARLIK_ARALIGI_MS = 60_000;
export const TEMIZLIK_ARALIGI_MS = 3_600_000;
// /sample tek istekte bu kadar kayıt ister; geride kalınmışsa bir turda en çok SAYFA kadar istek atılır.
export const SAMPLE_SAYISI = 1000;
export const AZAMI_SAMPLE_SAYFASI = 5;
// Durum örnekleri bu süreden sonra silinir; değer geçmişi ve veri boşlukları 24 saat saklanır.
export const ORNEK_SAKLAMA_GUNU = 30;
export const GECMIS_SAKLAMA_MS = 24 * 3_600_000;
export const AZAMI_TEZGAH = 64;
export const AZAMI_DEGER_UZUNLUGU = 200;
export const OKUMA_AYARI = 'tezgah-baglantisi.okuma';
export const ARALIK_AYARI = 'tezgah-baglantisi.okuma-araligi';

// Art arda hata sayısına göre bir sonraki turun aralığı.
export const etkinAralikMs = (aralikMs: number, ardisikHata: number): number => Math.min(EN_UZUN_ARALIK_MS, Math.max(aralikMs, aralikMs * 2 ** Math.min(ardisikHata, 6)));

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
  // Servisin öğe kimliği (dataItemId) ve değerin sıra numarası.
  kimlik: string | null;
  sira: number | null;
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

const tamSayi = (m: string | undefined): number | null => {
  const n = Number(m ?? '');
  return m !== undefined && m.trim() !== '' && Number.isSafeInteger(n) && n >= 0 ? n : null;
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
            const kosul = kap.ad === 'Condition';
            ogeler.push({
              tur: kirp(kosul ? o.nitelikler['type'] : o.ad, 60) ?? o.ad,
              ad: kirp(o.nitelikler['name'], 60),
              bilesen: bilesenAdi,
              deger: kosul ? kirp(o.metin) : degerOku(o.metin),
              zaman: kirp(o.nitelikler['timestamp'], 40),
              kosul: kosul ? o.ad : null,
              kimlik: kirp(o.nitelikler['dataItemId'], 100),
              sira: tamSayi(o.nitelikler['sequence']),
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

// Son okuma iki turdan eskiyse "eski okuma".
export const eskiMi = (okundu: string | Date, simdi: Date, aralikSn: number): boolean => simdi.getTime() - new Date(okundu).getTime() > 2 * aralikSn * 1000;

export interface AkisBasligi {
  instanceId: string | null;
  firstSequence: number | null;
  lastSequence: number | null;
  nextSequence: number | null;
}

// MTConnectStreams başlığı: sıra numaraları /sample sürekliliğini, instanceId servisin yeniden başladığını söyler.
export function baslikOku(kok: XmlOgesi): AkisBasligi {
  const b = kok.cocuklar.find((c) => c.ad === 'Header')?.nitelikler ?? {};
  return { instanceId: kirp(b['instanceId'], 40), firstSequence: tamSayi(b['firstSequence']), lastSequence: tamSayi(b['lastSequence']), nextSequence: tamSayi(b['nextSequence']) };
}

// İstenen sıradan sonra okunacak sıra: başlıktaki nextSequence; yoksa görülen en büyük sıra + 1.
export function sonrakiSira(baslik: AkisBasligi, ogeler: readonly TezgahOgesi[], onceki: number): number {
  if (baslik.nextSequence !== null) return baslik.nextSequence;
  return Math.max(onceki, ...ogeler.map((o) => (o.sira ?? 0) + 1));
}

export type TezgahOgeleriHaritasi = Map<string, TezgahOgesi>;
const ogeAnahtari = (o: TezgahOgesi): string => o.kimlik ?? `${o.bilesen ?? ''}|${o.tur}|${o.ad ?? ''}`;

// /sample değişiklikleri son duruma işler: aynı kimlikli öğenin yeni değeri eskisinin yerine geçer.
export function durumaIsle(durum: TezgahOgeleriHaritasi, yeni: readonly TezgahOgesi[]): void {
  for (const o of yeni) durum.set(ogeAnahtari(o), o);
}
export const durumdanDiziye = (durum: TezgahOgeleriHaritasi): TezgahOgesi[] => [...durum.values()];
export const diziyiDurumaCevir = (ogeler: readonly TezgahOgesi[]): TezgahOgeleriHaritasi => new Map(ogeler.map((o) => [ogeAnahtari(o), o]));

export interface AlanTanimi {
  kimlik: string;
  tur: string;
  altTur: string | null;
  bilesen: string | null;
  bilesenAdi: string | null;
  birim: string | null;
  kategori: 'SAMPLE' | 'EVENT' | 'CONDITION';
}
export interface TezgahTanimi {
  cihazAdi: string;
  alanlar: AlanTanimi[];
}

const KATEGORILER = new Set(['SAMPLE', 'EVENT', 'CONDITION']);

function tanimTopla(oge: XmlOgesi, bilesen: string | null, bilesenAdi: string | null, cikti: AlanTanimi[]): void {
  for (const c of oge.cocuklar) {
    if (c.ad === 'DataItems') {
      for (const d of c.cocuklar) {
        const kimlik = kirp(d.nitelikler['id'], 100);
        const tur = kirp(d.nitelikler['type'], 80);
        const kategori = d.nitelikler['category'] ?? '';
        if (d.ad !== 'DataItem' || kimlik === null || tur === null || !KATEGORILER.has(kategori)) continue;
        cikti.push({ kimlik, tur, altTur: kirp(d.nitelikler['subType'], 80), bilesen, bilesenAdi, birim: kirp(d.nitelikler['units'], 40), kategori: kategori as AlanTanimi['kategori'] });
      }
    } else if (c.ad === 'Components') {
      for (const k of c.cocuklar) tanimTopla(k, kirp(k.ad, 60), kirp(k.nitelikler['name'], 60), cikti);
    }
  }
}

// /probe cevabı: cihazlar ve alan tanımları (bileşen ağacı gezilir). Cihaz adı yalnız saklanır; günlüğe ve iletiye girmez.
export function tanimlariOku(kok: XmlOgesi): TezgahTanimi[] | null {
  if (kok.ad !== 'MTConnectDevices') return null;
  const sonuc: TezgahTanimi[] = [];
  for (const cihazlar of kok.cocuklar) {
    if (cihazlar.ad !== 'Devices') continue;
    for (const c of cihazlar.cocuklar) {
      const cihazAdi = kirp(c.nitelikler['name'], 100);
      if (c.ad !== 'Device' || cihazAdi === null || sonuc.length >= AZAMI_TEZGAH) continue;
      const alanlar: AlanTanimi[] = [];
      tanimTopla(c, 'Device', null, alanlar);
      sonuc.push({ cihazAdi, alanlar });
    }
  }
  return sonuc;
}

export interface OmurDegeri {
  tur: string | null;
  yon: string | null;
  deger: number | null;
  baslangic: number | null;
  uyari: number | null;
  sinir: number | null;
}
export interface TezgahVarligi {
  kimlik: string;
  tur: string;
  takimNo: string | null;
  omurler: OmurDegeri[];
  zaman: string | null;
}

function altOgeler(oge: XmlOgesi, ad: string, cikti: XmlOgesi[] = [], derinlik = 0): XmlOgesi[] {
  if (derinlik > 8) return cikti;
  for (const c of oge.cocuklar) {
    if (c.ad === ad) cikti.push(c);
    altOgeler(c, ad, cikti, derinlik + 1);
  }
  return cikti;
}

// /assets cevabı: MTConnectAssets > Assets > (CuttingTool, ...). Ömür yoksa liste boş kalır; sıfır uydurulmaz.
export function varliklariOku(kok: XmlOgesi): TezgahVarligi[] | null {
  if (kok.ad !== 'MTConnectAssets') return null;
  const sonuc: TezgahVarligi[] = [];
  for (const kap of kok.cocuklar) {
    if (kap.ad !== 'Assets') continue;
    for (const v of kap.cocuklar) {
      const kimlik = kirp(v.nitelikler['assetId'], 100);
      if (kimlik === null) continue;
      const takim = altOgeler(v, 'ProgramToolNumber')[0]?.metin;
      sonuc.push({
        kimlik, tur: v.ad,
        takimNo: kirp(v.nitelikler['toolId'] ?? takim, 60),
        zaman: kirp(v.nitelikler['timestamp'], 40),
        omurler: altOgeler(v, 'ToolLife').map((t) => ({
          tur: kirp(t.nitelikler['type'], 40), yon: kirp(t.nitelikler['countDirection'], 20), deger: sayi(kirp(t.metin)),
          baslangic: sayi(kirp(t.nitelikler['initial'])), uyari: sayi(kirp(t.nitelikler['warning'])), sinir: sayi(kirp(t.nitelikler['limit'])),
        })),
      });
    }
  }
  return sonuc;
}

// Servis tamponundan düşmüş sıra isteniyor mu (başlık): ilk sıra istenenden büyükse aradaki kayıtlar kaybolmuştur.
export const tamponAsildiMi = (istenen: number, b: AkisBasligi): boolean => b.firstSequence !== null && istenen < b.firstSequence;
