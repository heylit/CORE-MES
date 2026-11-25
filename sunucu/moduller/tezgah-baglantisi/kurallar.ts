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
export const SATIR_SINIRI_AYARI = 'tezgah-baglantisi.satir-siniri';
export const VARSAYILAN_SATIR_SINIRI = 2_000_000;
// Temizlik büyük tek DELETE yerine bu kadar satırlık parçalarla yapılır; bir tur en çok bu süre ve parça kadar silebilir.
export const TEMIZLIK_PARCASI = 10_000;
export const TEMIZLIK_TUR_BUTCESI_MS = 500;
export const TEMIZLIK_TUR_PARCASI = 5;
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
  if (m === null || m.trim() === '') return null;
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

// ---- Değer geçmişi süzgeci (kart 3680) ----
// EVENT ve CONDITION her değişimde saklanır. SAMPLE (sayısal) yalnız son saklanan değere göre anlamlı değişimde saklanır; aynı öğe
// GECMIS_EN_SIK_MS'den sık yazılmaz (aradaki son değer bekletilir), değişmese de GECMIS_EN_UZUN_ARA_MS'de bir değer yazılır.
export const GECMIS_ORAN_ESIGI = 0.01;
export const GECMIS_EN_SIK_MS = 6_000;
export const GECMIS_EN_UZUN_ARA_MS = 60_000;

export interface GecmisKaydi {
  cihazAdi: string;
  kimlik: string;
  sira: number;
  zaman: Date;
  deger: string | null;
  kosul: string | null;
}

export type GecmisKategorisi = 'SAMPLE' | 'EVENT' | 'CONDITION';

// Akıştaki öğe adı (SpindleSpeed) ve probe adı (SPINDLE_SPEED) aynı türe çıkar.
const turAdi = (tur: string): string => tur.replace(/_/g, '').toLowerCase();
const HIZ_TURLERI = new Set(['rotaryvelocity', 'spindlespeed']);

const sayisalDeger = (m: string | null): number | null => sayi(m);

// Son saklanan değerden yeni değere geçiş saklanmaya değer mi: hız yüzde 2, yük 5 puan, öteki sayısallar yüzde 1'den fazla ayrışırsa.
// Sayıya çevrilemeyen ya da değer yok (UNAVAILABLE) olan taraf varsa her değişim anlamlıdır.
export function anlamliDegisim(tur: string, onceki: string | null, yeni: string | null): boolean {
  if (onceki === yeni) return false;
  const a = sayisalDeger(onceki);
  const b = sayisalDeger(yeni);
  if (a === null || b === null) return true;
  const fark = Math.abs(b - a);
  const t = turAdi(tur);
  if (HIZ_TURLERI.has(t)) return fark > Math.abs(a) * HIZ_ESIGI_ORANI;
  if (t === 'load') return fark > YUK_ESIGI_PUANI;
  return fark > Math.abs(a) * GECMIS_ORAN_ESIGI;
}

// Öğe başına süzgeç durumu. Nesneler değiştirilmez, yenisiyle değiştirilir: işlem geri alınırsa bellek eski haliyle kalır.
export interface GecmisOgeDurumu {
  tur: string;
  // Son saklanan değer: verinin kendi zamanı ve saklandığı tur anı (ms).
  son: { zaman: number; deger: string | null; ani: number };
  // En son görülen değer (saklansın ya da atlansın).
  guncel: GecmisKaydi;
  // Pencerede son saklanana en uzak değer: kısa bir tepe (çıkıp dönen sıçrama) kaybolmasın, kendi zamanıyla yazılır.
  bekleyen: GecmisKaydi | null;
}
export type GecmisSuzgeci = ReadonlyMap<string, GecmisOgeDurumu>;

export interface SuzulecekOge {
  kayit: GecmisKaydi;
  tur: string;
  // Probe'da tanımı yoksa null: veri yitmesin diye olduğu gibi saklanır.
  kategori: GecmisKategorisi | null;
}

export interface SuzmeSonucu {
  yazilacak: GecmisKaydi[];
  atlanan: number;
  suzgec: Map<string, GecmisOgeDurumu>;
}

const anahtar = (k: GecmisKaydi): string => `${k.cihazAdi}\u0000${k.kimlik}`;

// `a`, son saklanan değerden `b`'den daha uzakta mı (sayısal değilse yenisi sayılır).
function dahaUc(son: string | null, a: GecmisKaydi, b: GecmisKaydi): boolean {
  const s = sayisalDeger(son);
  const x = sayisalDeger(a.deger);
  const y = sayisalDeger(b.deger);
  if (s === null || x === null || y === null) return false;
  return Math.abs(x - s) > Math.abs(y - s);
}

// Bir turun öğelerini süzer. `simdi` turun anıdır (verinin saatinden bağımsız: saat farkı süzgeci kilitlemesin).
export function gecmisiSuz(onceki: GecmisSuzgeci, ogeler: readonly SuzulecekOge[], simdi: Date): SuzmeSonucu {
  const suzgec = new Map(onceki);
  const yazilacak: GecmisKaydi[] = [];
  let atlanan = 0;
  const ani = simdi.getTime();
  for (const { kayit, tur, kategori } of [...ogeler].sort((x, y) => x.kayit.sira - y.kayit.sira)) {
    if (kategori !== 'SAMPLE') {
      yazilacak.push(kayit);
      continue;
    }
    const k = anahtar(kayit);
    const d = suzgec.get(k);
    const zaman = kayit.zaman.getTime();
    const yaz = (r: GecmisKaydi, bekleyen: GecmisKaydi | null): void => {
      yazilacak.push(r);
      suzgec.set(k, { tur, son: { zaman: r.zaman.getTime(), deger: r.deger, ani }, guncel: kayit, bekleyen });
    };
    if (d === undefined) { yaz(kayit, null); continue; }
    const bekleyen = d.bekleyen;
    if (!anlamliDegisim(tur, d.son.deger, kayit.deger)) {
      // Son saklanana yaklaştı; bekleyen tepe varsa korunur (geri dönüş değeri bir sonraki boşaltmada yazılır).
      atlanan += 1;
      suzgec.set(k, { ...d, guncel: kayit });
    } else if (zaman - d.son.zaman >= GECMIS_EN_SIK_MS) {
      if (bekleyen !== null && dahaUc(d.son.deger, bekleyen, kayit)) {
        // Pencerenin tepesi kendi zamanıyla yazılır; dönüş değeri hâlâ anlamlıysa sıradaki pencerede yazılır.
        yazilacak.push(bekleyen);
        const donus = anlamliDegisim(tur, bekleyen.deger, kayit.deger) ? kayit : null;
        if (donus === null) atlanan += 1;
        suzgec.set(k, { tur, son: { zaman: bekleyen.zaman.getTime(), deger: bekleyen.deger, ani }, guncel: kayit, bekleyen: donus });
      } else {
        if (bekleyen !== null) atlanan += 1;
        yaz(kayit, null);
      }
    } else if (bekleyen === null || !dahaUc(d.son.deger, bekleyen, kayit)) {
      if (bekleyen !== null) atlanan += 1;
      suzgec.set(k, { ...d, guncel: kayit, bekleyen: kayit });
    } else {
      atlanan += 1;
      suzgec.set(k, { ...d, guncel: kayit });
    }
  }
  return { yazilacak, atlanan, suzgec };
}

// Tur sonunda: GECMIS_EN_SIK_MS'yi dolduran bekleyen değer (pencerenin tepesi) kendi zamanıyla yazılır; güncel değer ondan anlamlı ayrışıyorsa
// sıradaki boşaltmada yazılmak üzere bekler. 60 saniyedir hiçbir şey yazılmayan SAMPLE öğesinin güncel değeri yazılır (grafik ve tekrar
// oynatma boşluk göstermesin). Tekrar satırının zamanı verinin saatinde ilerler.
export function gecmisiBosalt(onceki: GecmisSuzgeci, simdi: Date): { yazilacak: GecmisKaydi[]; suzgec: Map<string, GecmisOgeDurumu> } {
  const suzgec = new Map(onceki);
  const yazilacak: GecmisKaydi[] = [];
  const ani = simdi.getTime();
  for (const [k, d] of onceki) {
    const gecen = ani - d.son.ani;
    if (d.bekleyen !== null) {
      if (gecen < GECMIS_EN_SIK_MS) continue;
      const b = d.bekleyen;
      yazilacak.push(b);
      const donus = b.sira !== d.guncel.sira && anlamliDegisim(d.tur, b.deger, d.guncel.deger) ? d.guncel : null;
      suzgec.set(k, { ...d, son: { zaman: b.zaman.getTime(), deger: b.deger, ani }, bekleyen: donus });
    } else if (gecen >= GECMIS_EN_UZUN_ARA_MS) {
      const zaman = d.son.zaman + gecen;
      yazilacak.push({ ...d.guncel, zaman: new Date(zaman), kosul: null });
      suzgec.set(k, { ...d, son: { zaman, deger: d.guncel.deger, ani } });
    }
  }
  return { yazilacak, suzgec };
}

// ---- Doluluk (kart 3680) ----
export const DOLULUK_UYARI_YUZDESI = 80;
export const DOLULUK_KRITIK_YUZDESI = 95;

export const dolulukYuzdesi = (satir: number, sinir: number): number => Math.round((satir / sinir) * 1000) / 10;
export const dolulukSeviyesi = (yuzde: number): 'normal' | 'uyari' | 'kritik' =>
  (yuzde >= DOLULUK_KRITIK_YUZDESI ? 'kritik' : yuzde >= DOLULUK_UYARI_YUZDESI ? 'uyari' : 'normal');

// Dakika kovaları: son bir saatte yazılan ve süzgeçle atlanan satır sayısı (sunucu belleğinde).
export interface DakikaKovasi { dakika: number; yazilan: number; atlanan: number }
export interface SatirSayaci { baslangic: number | null; kovalar: DakikaKovasi[] }
export const yeniSatirSayaci = (): SatirSayaci => ({ baslangic: null, kovalar: [] });
const DAKIKA_MS = 60_000;
const SAYAC_DAKIKASI = 60;

export function sayaciArttir(c: SatirSayaci, simdi: number, yazilan: number, atlanan: number): SatirSayaci {
  const dakika = Math.floor(simdi / DAKIKA_MS);
  const kovalar = c.kovalar.filter((k) => k.dakika > dakika - SAYAC_DAKIKASI);
  const son = kovalar[kovalar.length - 1];
  if (son !== undefined && son.dakika === dakika) kovalar[kovalar.length - 1] = { dakika, yazilan: son.yazilan + yazilan, atlanan: son.atlanan + atlanan };
  else kovalar.push({ dakika, yazilan, atlanan });
  return { baslangic: c.baslangic ?? simdi, kovalar };
}

export function sayaciOzetle(c: SatirSayaci, simdi: number): { pencereDakika: number; yazilan: number; atlanan: number; yazilanDakikada: number; atlananDakikada: number } | null {
  if (c.baslangic === null) return null;
  const dakika = Math.floor(simdi / DAKIKA_MS);
  const icinde = c.kovalar.filter((k) => k.dakika > dakika - SAYAC_DAKIKASI);
  const yazilan = icinde.reduce((t, k) => t + k.yazilan, 0);
  const atlanan = icinde.reduce((t, k) => t + k.atlanan, 0);
  const pencereDakika = Math.min(SAYAC_DAKIKASI, Math.max(1, dakika - Math.floor(c.baslangic / DAKIKA_MS) + 1));
  const bir = (n: number): number => Math.round((n / pencereDakika) * 10) / 10;
  return { pencereDakika, yazilan, atlanan, yazilanDakikada: bir(yazilan), atlananDakikada: bir(atlanan) };
}
