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

// ---- Heidenhain LSV2 (kart 3753) ----
// lsv2.ts'in okuduğu ham değerler; okunamayan alan null. Durum ve kip Heidenhain kodudur (PgmState, ExecState), metne burada çevrilir.
export const LSV2_OKUMA_AYARI = 'tezgah-baglantisi.lsv2-okuma';
export const LSV2_PLC_SAYACI_AYARI = 'tezgah-baglantisi.lsv2-plc-sayaci';
export const LSV2_MAKINELERI_AYARI = 'tezgah-baglantisi.lsv2-makineleri';

// Kumanda saati bundan fazla saparsa uyarı verilir (kart 3790).
export const AZAMI_SAAT_FARKI_SN = 60;
export type Lsv2Uyarisi = 'kapali-ya-da-mesgul' | 'dnc-yok' | 'sayac-yetki-yok' | 'sayac-adresi-yok' | 'sayac-kapali' | 'saat-farki';
export const LSV2_UYARI_METNI: Record<Lsv2Uyarisi, string> = {
  'kapali-ya-da-mesgul': 'Makine kapalı ya da meşgul (bağlantı reddedildi)',
  'dnc-yok': 'Makine DNC okumasına izin vermiyor: durum, program ve takım okunamadı',
  'sayac-yetki-yok': 'Sayaç için yetki yok (PLC okuması daha yüksek giriş düzeyi istiyor)',
  'sayac-adresi-yok': 'Sayaç adresi makinenin PLC belleğinde yok',
  'sayac-kapali': 'PLC sayacı okuması kapalı (Sistem Ayarları)',
  'saat-farki': `Kumanda saati sunucu saatinden ${String(AZAMI_SAAT_FARKI_SN)} saniyeden fazla farklı`,
};

export interface Lsv2Hatasi {
  sinif: number;
  grup: number;
  no: number;
  metin: string;
}

// Okunamayan alanın tanısı: alan adı ve kumandanın T_ER cevabındaki hata kodu (kart 3790). Bilinen kodlar Türkçe yazılır, bilinmeyen
// kod sayıyla kalır; değer uydurulmaz.
export const LSV2_TANI_ALANI = {
  kip: 'Çalışma kipi', 'program-durumu': 'Program durumu', program: 'Seçili program', oranlar: 'Oranlar', alarm: 'Alarm', takim: 'Takım',
  eksenler: 'Eksenler', surum: 'Kumanda sürümü', parametre: 'Sistem parametreleri', sayac: 'Sayaç', 'takim-tablosu': 'Takım tablosu', saat: 'Kumanda saati', 'program-listesi': 'Program listesi',
} as const;
export type Lsv2TaniAlani = keyof typeof LSV2_TANI_ALANI;
export interface Lsv2Tanisi { alan: Lsv2TaniAlani; kod: number }
export const LSV2_KUMANDA_KODU: Readonly<Record<number, string>> = { 20: 'telgraf biçimi kabul edilmedi', 22: 'kumanda desteklemiyor', 23: 'yetki yok', 46: 'DNC durumu', 57: 'sonraki hata yok', 80: 'çok fazla bağlantı' };
// Eksi kodlar kumandadan gelmez, istemcinin kendi nedenleridir.
export const LSV2_ISTEMCI_KODU = { beklenmeyen: -1, cikisReddedildi: -2, sinirAsildi: -3, donulemedi: -4 } as const;
const ISTEMCI_KODU_METNI: Readonly<Record<number, string>> = {
  [-1]: 'beklenmeyen cevap', [-2]: 'önceki çıkış reddedildiği için okunmuyor', [-3]: 'boyut sınırı aşıldı; aktarım kesildi, bağlantı kapatıldı',
  [-4]: 'açılış klasörüne dönülemedi; bağlantı kapatıldı',
};
export function lsv2TaniMetni(t: Lsv2Tanisi): string {
  if (t.kod < 0) return `${LSV2_TANI_ALANI[t.alan]}: ${ISTEMCI_KODU_METNI[t.kod] ?? 'okunamadı'}`;
  const ad = LSV2_KUMANDA_KODU[t.kod];
  return `${LSV2_TANI_ALANI[t.alan]}: ${ad === undefined ? `kumanda kodu ${String(t.kod)}` : `${ad} (kod ${String(t.kod)})`}`;
}

export interface Lsv2TakimBilgisi {
  no: number;
  indeks: number | null;
  // İş mili ekseni: X, Y ya da Z; kumanda başka kod verirse null.
  eksen: string | null;
  boy: number | null;
  yaricap: number | null;
}

export interface Lsv2Ekseni { ad: string; deger: number }

// Takım tablosunun (TOOL.T) okunan sütunları; ömür ve kullanılan süre dakikadır, kilit TL sütunudur.
export interface Lsv2TakimSatiri {
  no: number;
  ad: string | null;
  boy: number | null;
  yaricap: number | null;
  omur: number | null;
  kullanilan: number | null;
  kilitli: boolean | null;
}

export interface Lsv2Okumasi {
  kontrol: string | null;
  ncSurumu: string | null;
  plcSurumu: string | null;
  secenekler: string | null;
  // Sistem parametrelerinden (R_PR): LSV2 protokol sürümü ve en büyük telgraf boyu (bayt).
  lsv2Surumu: number | null;
  enBuyukBlok: number | null;
  // ExecState: 0 elle, 1 MDI, 2 referans, 3 tek tümce, 4 otomatik.
  kip: number | null;
  // PgmState: 0 başladı, 1 durdu, 2 bitti, 3 iptal, 4 kesildi, 5 hata, 6 hata silindi, 7 boşta, 8 tanımsız.
  programDurumu: number | null;
  program: string | null;
  // Çalışan tümce numarası: yalnız son durumda tutulur, geçmişe yazılmaz.
  tumce: number | null;
  // Yüzde (100 = %100).
  ilerlemeOrani: number | null;
  isMiliOrani: number | null;
  hizliOrani: number | null;
  takim: Lsv2TakimBilgisi | null;
  // Eksen konumları: yalnız son durumda tutulur, geçmişe yazılmaz. Okunamadıysa null.
  eksenler: Lsv2Ekseni[] | null;
  // Kumandanın hata penceresindeki iletiler; okunamadıysa null, ileti yoksa boş.
  hatalar: Lsv2Hatasi[] | null;
  sayac: number | null;
  uyarilar: Lsv2Uyarisi[];
  tani: Lsv2Tanisi[];
  // Bağlantı başında DIAGNOSTICS düzeyinde okunan kumanda saati (ISO) ve sunucu saatine göre farkı (saniye); okunamadıysa null.
  kumandaSaati: string | null;
  saatFarki: number | null;
  // Yalnız seyrek okuma turunda: okunan takım tablosu; okunamadıysa null (neden tanıda), bu turda okunmadıysa undefined.
  takimTablosu?: Lsv2TakimSatiri[] | null;
  // Yalnız seyrek okuma turunda: oturumun açılış klasöründeki dosyalar (ad, boyut, tarih); içerik okunmaz.
  programListesi?: Lsv2ProgramDosyasi[] | null;
}

export interface Lsv2ProgramDosyasi {
  ad: string;
  boyut: number;
  // Kumandanın verdiği değişme zamanı (ISO).
  tarih: string | null;
}

const PROGRAM_DURUMU_CALISMA: Readonly<Record<number, string>> = {
  0: 'ACTIVE', 1: 'STOPPED', 2: 'PROGRAM_COMPLETED', 3: 'STOPPED', 4: 'INTERRUPTED', 5: 'STOPPED', 6: 'READY', 7: 'READY',
};
const KIP_MODU: Readonly<Record<number, string>> = { 0: 'MANUAL', 1: 'MANUAL_DATA_INPUT', 2: 'MANUAL', 3: 'SEMI_AUTOMATIC', 4: 'AUTOMATIC' };

// LSV2 öğeleri MTConnect adlarıyla kurulur: özet, farklar, geçmiş süzgeci ve ekranlar değişmeden çalışır. Kimlikler sabittir.
// Bileşenler ekranın gruplarıdır: Tool "Takım", Axes "Eksenler", Control "Kumanda", Controller "Denetleyici".
interface Lsv2Alani { kimlik: string; tur: string; bilesen: string; kategori: AlanTanimi['kategori']; birim: string | null }
const LSV2_ALANLARI = {
  erisim: { kimlik: 'lsv2-erisim', tur: 'Availability', bilesen: 'Device', kategori: 'EVENT', birim: null },
  calisma: { kimlik: 'lsv2-calisma', tur: 'Execution', bilesen: 'Path', kategori: 'EVENT', birim: null },
  mod: { kimlik: 'lsv2-mod', tur: 'ControllerMode', bilesen: 'Controller', kategori: 'EVENT', birim: null },
  program: { kimlik: 'lsv2-program', tur: 'Program', bilesen: 'Path', kategori: 'EVENT', birim: null },
  tumce: { kimlik: 'lsv2-tumce', tur: 'BlockNumber', bilesen: 'Path', kategori: 'EVENT', birim: null },
  sayac: { kimlik: 'lsv2-sayac', tur: 'PartCount', bilesen: 'Path', kategori: 'EVENT', birim: null },
  ilerlemeOrani: { kimlik: 'lsv2-ilerleme-orani', tur: 'PathFeedrateOverride', bilesen: 'Path', kategori: 'SAMPLE', birim: 'PERCENT' },
  hizliOrani: { kimlik: 'lsv2-hizli-orani', tur: 'RapidOverride', bilesen: 'Path', kategori: 'SAMPLE', birim: 'PERCENT' },
  isMiliOrani: { kimlik: 'lsv2-is-mili-orani', tur: 'RotaryVelocityOverride', bilesen: 'Rotary', kategori: 'SAMPLE', birim: 'PERCENT' },
  takim: { kimlik: 'lsv2-takim', tur: 'ToolNumber', bilesen: 'Tool', kategori: 'EVENT', birim: null },
  takimIndeksi: { kimlik: 'lsv2-takim-indeksi', tur: 'ToolIndex', bilesen: 'Tool', kategori: 'EVENT', birim: null },
  takimEkseni: { kimlik: 'lsv2-takim-ekseni', tur: 'ToolAxis', bilesen: 'Tool', kategori: 'EVENT', birim: null },
  takimBoyu: { kimlik: 'lsv2-takim-boyu', tur: 'ToolLength', bilesen: 'Tool', kategori: 'EVENT', birim: 'MILLIMETER' },
  takimYaricapi: { kimlik: 'lsv2-takim-yaricapi', tur: 'ToolRadius', bilesen: 'Tool', kategori: 'EVENT', birim: 'MILLIMETER' },
  kontrol: { kimlik: 'lsv2-kumanda-tipi', tur: 'ControlType', bilesen: 'Controller', kategori: 'EVENT', birim: null },
  ncSurumu: { kimlik: 'lsv2-nc-surumu', tur: 'NcVersion', bilesen: 'Controller', kategori: 'EVENT', birim: null },
  plcSurumu: { kimlik: 'lsv2-plc-surumu', tur: 'PlcVersion', bilesen: 'Controller', kategori: 'EVENT', birim: null },
  secenekler: { kimlik: 'lsv2-secenekler', tur: 'Options', bilesen: 'Controller', kategori: 'EVENT', birim: null },
  lsv2Surumu: { kimlik: 'lsv2-protokol-surumu', tur: 'Lsv2Version', bilesen: 'Control', kategori: 'EVENT', birim: null },
  enBuyukBlok: { kimlik: 'lsv2-en-buyuk-blok', tur: 'MaxBlockLength', bilesen: 'Control', kategori: 'EVENT', birim: 'BYTE' },
  tani: { kimlik: 'lsv2-tani', tur: 'Diagnosis', bilesen: 'Control', kategori: 'EVENT', birim: null },
  kumandaSaati: { kimlik: 'lsv2-kumanda-saati', tur: 'ControlClock', bilesen: 'Control', kategori: 'EVENT', birim: null },
  saatFarki: { kimlik: 'lsv2-saat-farki', tur: 'ClockOffset', bilesen: 'Control', kategori: 'EVENT', birim: 'SECOND' },
  alarm: { kimlik: 'lsv2-alarm', tur: 'SYSTEM', bilesen: 'Controller', kategori: 'CONDITION', birim: null },
} as const satisfies Record<string, Lsv2Alani>;

const EKSEN_ONEKI = 'lsv2-eksen-';
const eksenAlani = (ad: string): Lsv2Alani => ({ kimlik: `${EKSEN_ONEKI}${ad}`, tur: 'Position', bilesen: 'Axes', kategori: 'SAMPLE', birim: null });
// Eksen adı kumandadan gelir; kimliğe yalnız harf, rakam ve alt çizgi girer.
const eksenAdi = (ad: string): string | null => {
  const a = ad.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
  return a === '' ? null : a;
};

const tanim = (a: Lsv2Alani): AlanTanimi => ({ kimlik: a.kimlik, tur: a.tur, altTur: null, bilesen: a.bilesen, bilesenAdi: null, birim: a.birim, kategori: a.kategori });
export const LSV2_ALAN_TANIMLARI: AlanTanimi[] = Object.values(LSV2_ALANLARI).map(tanim);
// Okunan eksenlerle birlikte tanımlar: eksen takımı değişince tanım yeniden yazılır.
export function lsv2AlanTanimlari(o: Lsv2Okumasi | null): AlanTanimi[] {
  const eksenler = (o?.eksenler ?? []).map((e) => eksenAdi(e.ad)).filter((a) => a !== null);
  return [...LSV2_ALAN_TANIMLARI, ...[...new Set(eksenler)].map((a) => tanim(eksenAlani(a)))];
}
export const lsv2TanimImzasi = (o: Lsv2Okumasi | null): string => lsv2AlanTanimlari(o).map((a) => a.kimlik).join(',');
export const LSV2_KATEGORILERI: ReadonlyMap<string, GecmisKategorisi> = new Map(LSV2_ALAN_TANIMLARI.map((a) => [a.kimlik, a.kategori]));
// Yalnız son durumda tutulan öğeler: eksen konumu, tümce numarası, tanı ve kumanda saati geçmişe hiç yazılmaz. Sürüm ve seçenek
// metinleri de yazılmaz: rakamlı metin geçmişte sayıya çevrilip anlamsız değer olur (seçenek dizisi "1.1e+175", 3811).
const GECMISSIZ: ReadonlySet<string> = new Set([
  LSV2_ALANLARI.tumce.kimlik, LSV2_ALANLARI.tani.kimlik, LSV2_ALANLARI.kumandaSaati.kimlik, LSV2_ALANLARI.saatFarki.kimlik,
  LSV2_ALANLARI.kontrol.kimlik, LSV2_ALANLARI.ncSurumu.kimlik, LSV2_ALANLARI.plcSurumu.kimlik, LSV2_ALANLARI.secenekler.kimlik, LSV2_ALANLARI.lsv2Surumu.kimlik,
]);
export const lsv2GecmisteYok = (kimlik: string | null): boolean => kimlik === null || kimlik.startsWith(EKSEN_ONEKI) || GECMISSIZ.has(kimlik);

const metin = (n: number | null): string | null => (n === null ? null : String(n));
const bos = (s: string | null): string | null => (s === null || s.trim() === '' ? null : s.trim());

// Okuma yoksa (makineye bağlanılamadı) yalnız erişim öğesi kalır, değeri null: durum "bağlantı yok" olur, öteki değerler uydurulmaz.
// Hata iletileri tek koşul öğesinde birleşir: ileti varsa Fault, yoksa Normal; okunamadıysa Unavailable ve değeri nedenidir.
export function lsv2Ogeleri(o: Lsv2Okumasi | null, zaman: Date): TezgahOgesi[] {
  const z = zaman.toISOString();
  const sira = zaman.getTime();
  const oge = (a: Lsv2Alani, deger: string | null, kosul: string | null = null, ad: string | null = null): TezgahOgesi => ({
    tur: a.tur, ad, bilesen: a.bilesen, deger: deger === null ? null : deger.slice(0, AZAMI_DEGER_UZUNLUGU), zaman: z, kosul, kimlik: a.kimlik, sira,
  });
  if (o === null) return [oge(LSV2_ALANLARI.erisim, null)];
  const hatalar = o.hatalar;
  const alarmTanisi = o.tani.find((t) => t.alan === 'alarm');
  const alarm = hatalar === null ? oge(LSV2_ALANLARI.alarm, alarmTanisi === undefined ? null : lsv2TaniMetni(alarmTanisi), 'Unavailable')
    : hatalar.length === 0 ? oge(LSV2_ALANLARI.alarm, null, 'Normal')
      : oge(LSV2_ALANLARI.alarm, hatalar.map((h) => (h.metin === '' ? `Hata ${String(h.no)}` : h.metin)).join(' · '), 'Fault');
  const t = o.takim;
  const eksenler: TezgahOgesi[] = [];
  for (const e of o.eksenler ?? []) {
    const ad = eksenAdi(e.ad);
    if (ad !== null) eksenler.push(oge(eksenAlani(ad), String(e.deger), null, ad));
  }
  return [
    oge(LSV2_ALANLARI.erisim, 'AVAILABLE'),
    oge(LSV2_ALANLARI.calisma, o.programDurumu === null ? null : PROGRAM_DURUMU_CALISMA[o.programDurumu] ?? null),
    oge(LSV2_ALANLARI.mod, o.kip === null ? null : KIP_MODU[o.kip] ?? null),
    oge(LSV2_ALANLARI.program, bos(o.program)),
    oge(LSV2_ALANLARI.tumce, metin(o.tumce)),
    oge(LSV2_ALANLARI.sayac, metin(o.sayac)),
    oge(LSV2_ALANLARI.ilerlemeOrani, metin(o.ilerlemeOrani)),
    oge(LSV2_ALANLARI.hizliOrani, metin(o.hizliOrani)),
    oge(LSV2_ALANLARI.isMiliOrani, metin(o.isMiliOrani)),
    oge(LSV2_ALANLARI.takim, metin(t?.no ?? null)),
    oge(LSV2_ALANLARI.takimIndeksi, metin(t?.indeks ?? null)),
    oge(LSV2_ALANLARI.takimEkseni, t?.eksen ?? null),
    oge(LSV2_ALANLARI.takimBoyu, metin(t?.boy ?? null)),
    oge(LSV2_ALANLARI.takimYaricapi, metin(t?.yaricap ?? null)),
    ...eksenler,
    oge(LSV2_ALANLARI.kontrol, bos(o.kontrol)),
    oge(LSV2_ALANLARI.ncSurumu, bos(o.ncSurumu)),
    oge(LSV2_ALANLARI.plcSurumu, bos(o.plcSurumu)),
    oge(LSV2_ALANLARI.secenekler, bos(o.secenekler)),
    oge(LSV2_ALANLARI.lsv2Surumu, metin(o.lsv2Surumu)),
    oge(LSV2_ALANLARI.enBuyukBlok, metin(o.enBuyukBlok)),
    oge(LSV2_ALANLARI.kumandaSaati, o.kumandaSaati),
    oge(LSV2_ALANLARI.saatFarki, metin(o.saatFarki)),
    oge(LSV2_ALANLARI.tani, o.tani.length === 0 ? null : o.tani.map(lsv2TaniMetni).join(' · ')),
    alarm,
  ];
}

// ---- Takım tablosu (kart 3790) ----
export const LSV2_SEYREK_OKUMA_AYARI = 'tezgah-baglantisi.lsv2-seyrek-okuma';
export const LSV2_SEYREK_ARALIK_AYARI = 'tezgah-baglantisi.lsv2-seyrek-aralik-dk';
export const VARSAYILAN_SEYREK_ARALIK_DK = 10;
export const EN_AZ_SEYREK_ARALIK_DK = 2;
export const AZAMI_TAKIM_SATIRI = 5_000;
// takim_no sütunu integer'dır; aralık dışı numara satırı yazımı düşürmesin diye çözümde atlanır.
export const AZAMI_TAKIM_NO = 2_147_483_647;
export const seyrekAralikMs = (dk: number | null): number => Math.max(EN_AZ_SEYREK_ARALIK_DK, dk ?? VARSAYILAN_SEYREK_ARALIK_DK) * 60_000;

const sayiMi = (s: string | undefined): number | null => {
  const t = (s ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Heidenhain tablo dosyası: "BEGIN TOOL.T ..." başlığı, isteğe bağlı açıklama bloğu, sütun adları satırı, sabit genişlikli satırlar,
// "[END]". Sütun sınırı ad satırındaki konumdur (ad + ardından gelen boşluklar). Ad satırı bulunamazsa ya da T sütunu yoksa null.
export function takimTablosunuCoz(metin: string): Lsv2TakimSatiri[] | null {
  const satirlar = metin.split(/\r?\n|\0/);
  if (!/^BEGIN\s/i.test(satirlar[0]?.trim() ?? '')) return null;
  let i = 1;
  if (satirlar[i]?.includes('#STRUCTBEGIN') === true) {
    while (i < satirlar.length && !(satirlar[i]?.startsWith('#STRUCTEND') ?? false)) i += 1;
    i += 1;
  } else if (satirlar[i]?.includes('TableDescription') === true) {
    while (i < satirlar.length && !(satirlar[i]?.startsWith(')') ?? false)) i += 1;
    i += 1;
  }
  const baslik = satirlar[i] ?? '';
  const sutunlar: { ad: string; bas: number; son: number }[] = [];
  for (const m of baslik.matchAll(/([A-Za-z\d_:.-]+)\s*/g)) sutunlar.push({ ad: (m[1] ?? '').toUpperCase(), bas: m.index, son: m.index + m[0].length });
  const sutun = (...adlar: string[]) => sutunlar.find((s) => adlar.includes(s.ad));
  const tNo = sutun('T');
  if (tNo === undefined) return null;
  const al = (satir: string, s: { bas: number; son: number } | undefined, son: boolean): string | undefined =>
    (s === undefined ? undefined : satir.slice(s.bas, son ? undefined : s.son));
  const sonSutun = sutunlar[sutunlar.length - 1];
  const hucre = (satir: string, s: ReturnType<typeof sutun>) => al(satir, s, s === sonSutun);
  const [ad, boy, yaricap, kilit, omur, kullanilan] = [sutun('NAME'), sutun('L'), sutun('R'), sutun('TL'), sutun('TIME1'), sutun('CUR_TIME', 'CUR.TIME')];
  const sonuc: Lsv2TakimSatiri[] = [];
  for (const satir of satirlar.slice(i + 1)) {
    if (satir.startsWith('[END]') || sonuc.length >= AZAMI_TAKIM_SATIRI) break;
    const no = sayiMi(hucre(satir, tNo));
    if (no === null || !Number.isInteger(no) || no < 0 || no > AZAMI_TAKIM_NO) continue;
    const k = hucre(satir, kilit);
    sonuc.push({
      no, ad: ad === undefined ? null : bos(hucre(satir, ad) ?? null), boy: sayiMi(hucre(satir, boy)), yaricap: sayiMi(hucre(satir, yaricap)),
      omur: sayiMi(hucre(satir, omur)), kullanilan: sayiMi(hucre(satir, kullanilan)), kilitli: kilit === undefined ? null : (k ?? '').trim().toUpperCase() === 'L',
    });
  }
  return sonuc;
}

// Geçmişe yalnız ömür sınırı (TIME1) ya da kilidi değişen takım yazılır. İlk okumada ve yeni görülen takımda
// geçmiş satırı yazılmaz: değişiklik değil, başlangıç durumudur.
// Kullanılan süre her kesimde artar; geçmişe yazılsa her seyrek okumada satır olurdu. Son durumda zaten vardır.
export function takimDegisenleri(onceki: ReadonlyMap<number, Lsv2TakimSatiri> | null, yeni: readonly Lsv2TakimSatiri[]): Lsv2TakimSatiri[] {
  if (onceki === null) return [];
  return yeni.filter((t) => {
    const e = onceki.get(t.no);
    return e !== undefined && (e.omur !== t.omur || e.kilitli !== t.kilitli);
  });
}

// Anlık görüntüde değeri ya da koşulu değişen (ya da ilk kez görülen) öğeler: son duruma ve değer geçmişine yalnız bunlar işlenir.
export function lsv2Degisenler(onceki: TezgahOgeleriHaritasi, yeni: readonly TezgahOgesi[]): TezgahOgesi[] {
  return yeni.filter((o) => {
    const e = onceki.get(ogeAnahtari(o));
    return e === undefined || e.deger !== o.deger || e.kosul !== o.kosul;
  });
}

// Okuma yoksa son durum yalnız erişim öğesine iner: önceki program, sayaç ve alarm "bağlantı yok" iken gösterilmez.
export function lsv2Durumu(onceki: TezgahOgeleriHaritasi, yeni: readonly TezgahOgesi[], okundu: boolean): TezgahOgeleriHaritasi {
  const durum = okundu ? new Map(onceki) : new Map<string, TezgahOgesi>();
  durumaIsle(durum, okundu ? lsv2Degisenler(onceki, yeni) : yeni);
  return durum;
}

export const lsv2UyariMetni = (uyarilar: readonly Lsv2Uyarisi[]): string | null =>
  (uyarilar.length === 0 ? null : uyarilar.map((u) => LSV2_UYARI_METNI[u]).join(' · '));

/* ---------------- deneme sayfası (kart 3811) ---------------- */
// Ad benzerliği: büyük harf, yalnız harf ve rakam ("CNC002" = "cnc-002"). Tek makine uyarsa öneridir; birden çok uyarsa öneri yok.
export const adAnahtari = (ad: string): string => ad.toLocaleUpperCase('tr-TR').replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '');
export function eslemeOnerisi(cihazAdi: string, makineler: readonly { id: number; kod: string }[]): number | null {
  const a = adAnahtari(cihazAdi);
  if (a === '') return null;
  const uyan = makineler.filter((m) => adAnahtari(m.kod) === a);
  return uyan.length === 1 ? uyan[0]!.id : null;
}

// Alarm olayı (3811): Fault hâlindeki koşul ve tetiklenmiş acil stop; Warning ve Unavailable alarm değildir. Öğe başına tek açık olay.
export const ALARM_SAKLAMA_GUNU = 90;
export interface AktifAlarm { oge: string; kod: string | null; metin: string }
export function aktifAlarmlar(ogeler: readonly TezgahOgesi[]): AktifAlarm[] {
  const sonuc = new Map<string, AktifAlarm>();
  for (const o of ogeler) {
    const oge = o.kimlik ?? `${o.bilesen ?? ''}:${o.tur}`;
    if (o.kosul === 'Fault') sonuc.set(oge, { oge, kod: null, metin: (o.deger ?? '').trim() || o.tur });
    else if (o.kosul === null && o.tur === 'EmergencyStop' && o.deger === 'TRIGGERED') sonuc.set(oge, { oge, kod: null, metin: 'Acil stop' });
  }
  return [...sonuc.values()];
}
// Açık olaylarla karşılaştırma: biten (öğe artık alarmda değil ya da metni değişti) kapanır, yeni olan açılır.
export function alarmFarki(acik: readonly AktifAlarm[], aktif: readonly AktifAlarm[]): { kapanan: string[]; acilan: AktifAlarm[] } {
  const simdi = new Map(aktif.map((a) => [a.oge, a]));
  const kapanan = acik.filter((a) => simdi.get(a.oge)?.metin !== a.metin).map((a) => a.oge);
  const surer = new Set(acik.filter((a) => !kapanan.includes(a.oge)).map((a) => a.oge));
  return { kapanan, acilan: aktif.filter((a) => !surer.has(a.oge)) };
}

// Sayaç değişimi bağlamı (3811-2): program, kip, Dryrun ve Singleblock. Dryrun ve Singleblock MTConnect'te ControllerModeOverride öğesinin
// DRY_RUN ve SINGLE_BLOCK alt türüdür (ON/OFF); yoksa null. Heidenhain'de kip R_RI 23'ten gelir, Singleblock "tek tümce" kipidir.
export const SAYAC_SAKLAMA_GUNU = 90;
export interface SayacBaglami { program: string | null; kip: string | null; dryrun: boolean | null; singleblock: boolean | null }
const acikKapali = (d: string | null | undefined): boolean | null => {
  const t = (d ?? '').trim().toUpperCase();
  return t === 'ON' ? true : t === 'OFF' ? false : null;
};
export function sayacBaglami(ozet: Pick<TezgahOzeti, 'program' | 'mod'>, ogeler: readonly TezgahOgesi[], tanimlar: readonly { kimlik: string; tur: string; altTur: string | null }[]): SayacBaglami {
  const deger = (alt: string): boolean | null => {
    const kimlikler = new Set(tanimlar.filter((t) => t.tur === 'ControllerModeOverride' && t.altTur === alt).map((t) => t.kimlik));
    const o = ogeler.find((x) => x.kimlik !== null && kimlikler.has(x.kimlik));
    return o === undefined ? null : acikKapali(o.deger);
  };
  return { program: ozet.program, kip: ozet.mod, dryrun: deger('DRY_RUN'), singleblock: deger('SINGLE_BLOCK') };
}
// Üretim artışı: kip otomatik, Dryrun ve Singleblock kapalı. Kip okunamıyorsa (null) üretim sayılır; Dryrun ya da Singleblock okunamıyorsa
// kapalı sayılır. Yarı otomatik (Heidenhain tek tümce) ve elle kipler deneme/ayardır.
export const uretimArtisiMi = (b: Pick<SayacBaglami, 'kip' | 'dryrun' | 'singleblock'>): boolean =>
  (b.kip === null || b.kip.toUpperCase() === 'AUTOMATIC') && b.dryrun !== true && b.singleblock !== true;
