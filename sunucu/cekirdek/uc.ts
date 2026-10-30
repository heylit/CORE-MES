import { createHash } from 'node:crypto';
import { Readable, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { constants as zlibSabitleri, createGzip, gzip } from 'node:zlib';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { semayaGoreGizle } from '#paylasilan/gizli.ts';
import { islemMi, veriIslemiMi } from '#paylasilan/islemler.ts';
import type { Islem, VeriIslemi } from '#paylasilan/islemler.ts';
import { cerezBasligi, cerezOku } from './cerez.ts';
import { girdiHatasiSayma, vtHataIzi, vtSureDoldu, vtUlasilamadi } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { turkceIleti } from './dogrulama-iletisi.ts';
import { gunlukKur } from './gunluk.ts';
import type { Gunluk } from './gunluk.ts';
import { kilitlenmedeYinele } from './kilitlenme.ts';
import { UygulamaHatasi, dogrulama, gecersiz, mesgul, oturumYok, veritabaniYok, yetkiYok } from './hata.ts';
import { baslikKimligi, istekOzeti } from './tekrar.ts';
import type { SakliCevap, TekrarDeposu, TekrarIstegi } from './tekrar.ts';
import { islemVarMi } from './yetki.ts';
import type { Kullanici } from './yetki.ts';

type Sema = z.ZodTypeAny;

export type Yontem = 'GET' | 'POST' | 'PUT' | 'DELETE';
// Uç ya kayıtlı bir veri işlemi ister ya da ayrıca işaretlenir: 'acik' kimlik istemez, 'oturum' yalnız giriş ister
// (kişinin kendi kaydı üzerindeki işler). Sayfa işlemini uç yalnız listede isteyebilir (ADR 0007).
export type UcYetkisi = VeriIslemi | 'acik' | 'oturum' | OkumaYetkisi;

// Listedeki işlemlerden biri yeter. Aynı veriyi birden çok sayfa okur (emir açma ekranı istasyonları okur); aynı komutu
// birden çok ekran verir (Arkon, Üretim Terminali, kuyruk). Sayfası ya da veri işlemi olmayan oturum erişemez.
export interface OkumaYetkisi {
  readonly biri: readonly [Islem, ...Islem[]];
}

const okumaYetkisiMi = (yetki: unknown): yetki is OkumaYetkisi =>
  typeof yetki === 'object' && yetki !== null && 'biri' in yetki;

export function yetkiMetni(yetki: UcYetkisi): string {
  return okumaYetkisiMi(yetki) ? `biri:${yetki.biri.join('|')}` : yetki;
}

function yetkisiVarMi(kullanici: Kullanici, yetki: Exclude<UcYetkisi, 'acik'>): boolean {
  if (yetki === 'oturum') return true;
  if (okumaYetkisiMi(yetki)) return yetki.biri.some((islem) => islemVarMi(kullanici, islem));
  return islemVarMi(kullanici, yetki);
}

// Dış izleyicinin (1224 a) girebildiği modüller. Rolüne iç işlem verilmiş olsa da öteki uçlar ona kapalıdır; modülü bilinmeyen
// kayıtta da kapalıdır.
export const DIS_IZLEYICI_MODULLERI: readonly string[] = ['portal', 'oturum'];

function disIzleyiciGirerMi(kullanici: Kullanici, modul: string | undefined): boolean {
  return kullanici.disIzleyici !== true || (modul !== undefined && DIS_IZLEYICI_MODULLERI.includes(modul));
}

// Yazma komutunun denetim kaydındaki kapsamı; tanımda verilmezse 'tam'.
export type DenetimKipi = 'tam' | 'govdesiz' | 'yok';

// Gövdesiz uçta gövdeden deftere seçilen: ilkel değerli düz nesne. Küçük tutulur ki seçici gövdeyi deftere geri taşıyamasın.
export type DenetimSecimi = Readonly<Record<string, string | number | boolean | null>>;
export const DENETIM_SECIMI_ALAN_SINIRI = 8;
export const DENETIM_SECIMI_BAYT_SINIRI = 512;
// Alt çizgiyle başlayan ad defterin kendi anahtarlarına ayrılmıştır.
const SECIM_ANAHTARI = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

// Sınırı aşan seçim kısaltılmaz: kırpılmış değer deftere yanlış kayıt olarak girerdi.
// Seçicinin fırlattığı hiçbir hata olduğu gibi geçmez: uygulama hatası "ret" sayılıp yazıyı denetimsiz kalıcı kılardı, iletisi
// de gövde değeri taşıyabilir. Her hata, nedeni sabit sözcüklerle söyleyen düz hataya döner (500, geri alma).
// Alanlar bir kez okunur ve kopyası döner: sonraki okumada başka değer veren nesne (getter, vekil) denetimden kaçamaz.
// Hata iletisi yalnız sabit sözcüklerdir: değer taşımaz.
class SecimHatasi extends Error {}

function secimiKopyala(secim: unknown): DenetimSecimi {
  const duz = typeof secim === 'object' && secim !== null && !Array.isArray(secim)
    && (Object.getPrototypeOf(secim) === Object.prototype || Object.getPrototypeOf(secim) === null);
  if (!duz) throw new SecimHatasi('düz nesne değil');
  const alanlar = Object.entries(secim as Record<string, unknown>);
  if (alanlar.length > DENETIM_SECIMI_ALAN_SINIRI) throw new SecimHatasi(`en çok ${DENETIM_SECIMI_ALAN_SINIRI} alan`);
  for (const [anahtar, deger] of alanlar) {
    if (!SECIM_ANAHTARI.test(anahtar)) throw new SecimHatasi('geçersiz alan adı');
    const ilkel = deger === null || typeof deger === 'string' || typeof deger === 'boolean'
      || (typeof deger === 'number' && Number.isFinite(deger));
    if (!ilkel) throw new SecimHatasi('ilkel olmayan değer');
  }
  const kopya = Object.fromEntries(alanlar) as DenetimSecimi;
  if (Buffer.byteLength(JSON.stringify(kopya), 'utf8') > DENETIM_SECIMI_BAYT_SINIRI) {
    throw new SecimHatasi(`en çok ${DENETIM_SECIMI_BAYT_SINIRI} bayt`);
  }
  return kopya;
}

function denetimSeciminiAl(secici: (govde: unknown) => unknown, govde: unknown, ad: string): DenetimSecimi {
  let neden = 'seçici hata verdi';
  try {
    const secim = secici(govde);
    neden = 'seçim okunamadı';
    return secimiKopyala(secim);
  } catch (hata) {
    throw new Error(`Denetim özeti seçilemedi: ${ad} (${hata instanceof SecimHatasi ? hata.message : neden})`);
  }
}

// Denetim eki: işleyicinin kayda bıraktığı satırlar (ör. önceki ve yeni değer). Her satır seçimle aynı sınırdadır.
export const DENETIM_EKI_SATIR_SINIRI = 100;

// Liste bir kez okunur ve kopyalanır; hata sabit sözcüklerle döner (seçiciyle aynı gerekçe).
function denetimEkiniKopyala(satirlar: unknown): readonly DenetimSecimi[] {
  if (!Array.isArray(satirlar)) throw new SecimHatasi('liste değil');
  const kopya = Array.from(satirlar as unknown[]);
  if (kopya.length === 0) throw new SecimHatasi('boş liste');
  if (kopya.length > DENETIM_EKI_SATIR_SINIRI) throw new SecimHatasi(`en çok ${DENETIM_EKI_SATIR_SINIRI} satır`);
  return Object.freeze(kopya.map((satir) => secimiKopyala(satir)));
}

// İkili cevap (dosya indirme, ADR 0009). İşleyici üst bilgiyi transaction içinde verir; içerik transaction bittikten sonra
// `akis` ile parça parça okunur: uzun indirme okuma transaction'ını açık tutmaz ve boşta transaction süresine takılmaz. Bu yüzden
// yalnız değişmeyen içerik (özetle adreslenmiş dosya) böyle verilir. Cevap yalnız bu dört alandır; şemada olmayan alan çıkmaz.
export interface IkiliCevap {
  tur: string;
  ad: string;
  boyut: number;
  akis: (db: Db) => AsyncIterable<Buffer>;
}

export const ikiliCevap = z.object({
  tur: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  ad: z.string().min(1).max(255),
  boyut: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  akis: z.custom<IkiliCevap['akis']>((deger) => typeof deger === 'function'),
});

// Olmayabilen dosya (giriş logosu): işleyici null verirse gövdesiz 204 döner. Yokluk hata değildir; 404 tarayıcı konsolunda
// ve günlükte hata gibi görünür (kural 5: veri yoksa null).
export const ikiliCevapYaDaBos = ikiliCevap.nullable();

const ikiliMi = (sema: Sema): boolean => sema === ikiliCevap || sema === ikiliCevapYaDaBos;

// Başlığa ham ad girmez: satır sonu ya da tırnak başlığı bölebilir. ASCII karşılığı eski istemciler, `filename*` asıl ad içindir.
export function dosyaAdiBasligi(ad: string): string {
  const ascii = ad.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\/;]/g, '_').trim() || 'dosya';
  const kodlu = encodeURIComponent(ad).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${kodlu}`;
}

// Bildirilen boyuttan fazla ya da eksik içerik akışı keser: Content-Length tutmayan cevap istemcide yarım dosya olarak kalır,
// eksik gelen parça sessizce kısa dosya olmasın.
async function* ikiliAkis(cevap: IkiliCevap, db: Db, ad: string): AsyncGenerator<Buffer> {
  let gelen = 0;
  for await (const parca of cevap.akis(db)) {
    if (!Buffer.isBuffer(parca)) throw new Error(`İkili akış Buffer dışında değer verdi: ${ad}`);
    gelen += parca.length;
    if (gelen > cevap.boyut) throw new Error(`İkili akış bildirilen boyutu aştı: ${ad}`);
    yield parca;
  }
  if (gelen !== cevap.boyut) throw new Error(`İkili akış bildirilen boyuttan kısa kaldı: ${ad}`);
}

export interface IstekBilgisi {
  ip: string;
  // İsteğin User-Agent başlığı olduğu gibi; yoksa null. Kısaltma ve saklama kuralı kullanan modülündür.
  tarayici: string | null;
  cerez(ad: string): string | null;
  // Çerezler yalnız komut kalıcı olduysa cevaba eklenir.
  cerezYaz(ad: string, deger: string, azamiSn: number): void;
  cerezSil(ad: string): void;
  // Başarılı cevabın durum kodu (200-599); yalnız okuma (GET) ucunda. Yazma komutu başarısızlığı hata fırlatarak
  // bildirir; aksi halde transaction'ın kalıp kalmayacağı belirsizleşir.
  durumKoduYaz(kod: number): void;
}

export interface IsleBaglami<P, S, G, Y extends UcYetkisi> {
  istek: IstekBilgisi;
  parametre: P;
  sorgu: S;
  govde: G;
  db: Db;
  // Korumalı uçta kullanıcı kayıt katmanında doğrulanmıştır; işleyici null denetimi yazmaz.
  kullanici: Y extends 'acik' ? Kullanici | null : Kullanici;
  // Yalnız denetlenen yazma komutunda, bir kez: kayda ilkel değerli küçük satırlar bırakır (en çok 100 satır, satır başına 8 alan
  // ve 512 bayt). Okuma ucunda, denetimsiz uçta, ikinci çağrıda ya da sınır aşılınca komut 500 ile düşer ve geri alınır;
  // işleyici hatayı yakalasa da düşer (eki kaybolan komut kalıcı olmaz).
  denetimEki: (satirlar: readonly DenetimSecimi[]) => void;
  // Yakalanıp sürdürülen hata buraya yazılır; satır ucun adını taşır.
  gunluk: Gunluk;
}

export interface UcTanimi<
  P extends Sema,
  S extends Sema,
  G extends Sema,
  C extends Sema,
  Y extends UcYetkisi,
> {
  yontem: Yontem;
  yol: string;
  yetki: Y;
  // Yalnız GET, transaction açılmaz: veritabanı yokken de cevap vermesi gereken uçlar içindir; salt okuma güvencesi yoktur.
  txDisi?: true;
  // Yalnız oturumlu POST/PUT/DELETE: aynı kişinin aynı `istek-kimligi` başlığıyla yinelediği istek komutu ikinci kez
  // uygulamaz, ilk cevabı alır. Başlık zorunlu olur. Çerez yazan komutta kullanılamaz (çerez saklanmaz).
  tekrarKorumali?: true;
  // Yalnız yazma ucu: kilitlenme ya da serileştirme hatasında bütün transaction (işleyici, denetim, tekrar koruması) baştan
  // yeniden koşar. İşleyici her denemede baştan çağrılır; transaction dışına yan etki bırakan işleyiciye konmaz.
  kilitlenmedeYinele?: true;
  // Yalnız oturumlu POST/PUT/DELETE; verilmezse gövde denetim kaydına tam girer. Her kullanım kullanıcı kararıdır ve çekirdeğin
  // sabit liste testinde görünür.
  // 'govdesiz': satır yine yazılır (kişi, yöntem, yol, parametre); gövdenin yerine boyutu ve özeti girer.
  // 'yok': satır hiç yazılmaz; yalnız kendi değişmez defterini tutan komut; kullanıcı kararı gerekir.
  denetim?: Exclude<DenetimKipi, 'tam'>;
  // Yalnız 'govdesiz' ve gövde şemasıyla: şemadan geçmiş gövdeden, özetin yanında deftere yazılacak birkaç alanı seçen saf
  // fonksiyon (kim neye çevirdi okunabilsin diye). Düz, ilkel değerli, küçük nesne döndürür; aksi halde ya da fırlatırsa
  // komut 500 ile düşer ve geri alınır (denetlenemeyen yazma kalıcı olmaz).
  denetimOzeti?: (govde: z.output<G>) => DenetimSecimi;
  // Yalnız GET: büyük ve seyrek değişen cevap (harita gibi) aynıysa yeniden inmesin. Etiket yetki denetiminden sonra kullanıcıya
  // dönen gövdeden üretilir; önbellek özeldir, paylaşılan vekil saklamaz.
  onbellek?: 'etag';
  // Yalnız dosya ucu: ekranın kişi istemeden kendiliğinden yüklediği dosya (atölye haritasının 3B modeli) indirme denetimine
  // yazılmaz (385 a, ADR 0002 eki). Her kullanım kararla ve çekirdeğin sabit liste testindedir.
  kendiligindenYuklenir?: true;
  parametre?: P;
  sorgu?: S;
  govde?: G;
  cevap: C;
  isle: (
    baglam: IsleBaglami<z.output<P>, z.output<S>, z.output<G>, Y>,
  ) => Promise<z.input<C>> | z.input<C>;
}

export interface Uc {
  readonly yontem: Yontem;
  readonly yol: string;
  readonly yetki: UcYetkisi;
  readonly txDisi: boolean;
  readonly tekrarKorumali: boolean;
  readonly kilitlenmedeYinele: boolean;
  readonly denetim: DenetimKipi;
  readonly denetimOzeti: ((govde: unknown) => DenetimSecimi) | null;
  readonly parametre: Sema | null;
  readonly sorgu: Sema | null;
  readonly govde: Sema | null;
  readonly cevap: Sema;
  // Cevap `ikiliCevap` ise: gövde JSON değil, dosyadır.
  readonly ikili: boolean;
  readonly kendiligindenYuklenir: boolean;
  readonly onbellek: boolean;
  readonly isle: (baglam: IsleBaglami<unknown, unknown, unknown, UcYetkisi>) => unknown;
}

export interface UcOzeti {
  yontem: Yontem;
  yol: string;
  yetki: UcYetkisi;
  txDisi: boolean;
  // Yalnız 'tam' değilse vardır.
  denetim?: Exclude<DenetimKipi, 'tam'>;
  // Yalnız gövdesiz uç gövdeden deftere alan seçiyorsa vardır.
  denetimSecimi?: true;
  // Yalnız indirme denetimine yazılmayan dosya ucunda vardır.
  kendiligindenYuklenir?: true;
}

export type Kimlik = (istek: FastifyRequest) => Promise<Kullanici | null>;

export interface DenetimGirdisi {
  kisiId: number | null;
  yontem: Yontem;
  yol: string;
  parametre: unknown;
  govde: unknown;
  // Yalnız gövdesiz uçta vardır: gövdenin yerine ne yazılacağını denetimi yazan belirler.
  kip?: 'govdesiz';
  // Yalnız seçicisi olan gövdesiz uçta vardır; sınırları çekirdek denetlemiştir, gizli adlı alanı denetimi yazan maskeler.
  secilen?: DenetimSecimi;
  // Uç katmanı doldurur: ucun modülü (keşifte) ve istediği yetki. Uç dışından yazılan kayıtta yoktur.
  modul?: string;
  yetki?: string;
  // Yalnız işleyici denetim eki bıraktıysa vardır; sınırları çekirdek denetlemiştir, gizli adlı alanı denetimi yazan maskeler.
  ek?: readonly DenetimSecimi[];
}

export type Denetle = (db: Db, girdi: DenetimGirdisi) => Promise<void>;

export interface KayitSecenegi {
  vt: Veritabani;
  kimlik: Kimlik;
  // Başarılı her yazma komutu, komutla aynı transaction içinde kaydedilir.
  denetle?: Denetle;
  // Verilmezse tekrar korumalı uç istek anında hata verir (işleyici koşmaz); cevaplar komutla aynı transaction'da saklanır.
  tekrar?: TekrarDeposu;
  // Uçların ait olduğu modül; denetim kaydına yazılır.
  modul?: string;
  // Çerez her istekte Secure konur. Canlıda HTTPS'i ters vekil bitirir; sunucuya gelen istek düz HTTP görünür ama tarayıcı
  // HTTPS'tedir, çerez şifresiz kapıya hiç gitmemelidir.
  guvenliCerez?: boolean;
}

// Bu boyutun altındaki cevapta sıkıştırmanın işlemci maliyeti kazandırdığından fazladır.
export const SIKISTIRMA_ESIGI = 64 * 1024;
const gzipla = promisify(gzip);

// `gzip;q=0` açıkça reddetmektir; yalnız adın geçmesi yetmez.
function gzipKabul(baslik: string | undefined): boolean {
  return (baslik ?? '').split(',').some((parca) => {
    const [ad, ...ayar] = parca.trim().toLowerCase().split(';').map((p) => p.trim());
    if (ad !== 'gzip' && ad !== '*') return false;
    const q = ayar.find((a) => a.startsWith('q='));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

// Metin ya da sıkıştırılmamış ikili biçimde gelen dosyalar (STEP, IGES, STL, glTF, DXF, türü bilinmeyen ağ verisi) ağda küçülür. PDF ve
// resimler zaten içten sıkıştırılmıştır; onları yeniden sıkıştırmak işlemci harcar, kazandırmaz.
const SIKISAN_DOSYALAR: ReadonlySet<string> = new Set([
  'model/step', 'model/iges', 'model/stl', 'model/gltf+json', 'image/vnd.dxf', 'application/octet-stream',
]);
// En hızlı düzey: 200 MB'lık dosya da tek indirmede saniyeler içinde sıkışır; kazancın çoğu ilk düzeyde gelir.
const DOSYA_SIKISTIRMA_DUZEYI = zlibSabitleri.Z_BEST_SPEED;

function etiketTutar(baslik: string | undefined, etiket: string): boolean {
  if (baslik === undefined) return false;
  return baslik.split(',').some((e) => {
    const t = e.trim();
    return t === '*' || t === etiket || t === `W/${etiket}`;
  });
}

export function uc<
  P extends Sema = z.ZodUndefined,
  S extends Sema = z.ZodUndefined,
  G extends Sema = z.ZodUndefined,
  C extends Sema = Sema,
  Y extends UcYetkisi = UcYetkisi,
>(tanim: UcTanimi<P, S, G, C, Y>): Uc {
  const ad = `${tanim.yontem} ${tanim.yol}`;
  if (!tanim.yol.startsWith('/')) throw new Error(`Uç yolu '/' ile başlamalı: ${ad}`);
  // Tip denetimi derleme anındadır; tipi aşan tanım (dönüştürme, hesaplanmış değer) burada durur.
  if (okumaYetkisiMi(tanim.yetki)) {
    const { biri } = tanim.yetki;
    // Boş liste "kimse" mi "herkes" mi okunamaz; tipi aşan değer burada durur.
    if (!Array.isArray(biri) || biri.length === 0) throw new Error(`İşlem listesi boş olamaz: ${ad}`);
    for (const islem of biri as unknown[]) {
      if (!islemMi(islem)) throw new Error(`Uç kayıtlı olmayan işlem istiyor (${String(islem)}): ${ad}`);
    }
    if (new Set(biri).size !== biri.length) throw new Error(`İşlem listesinde yinelenen işlem var: ${ad}`);
  } else if (tanim.yetki !== 'acik' && tanim.yetki !== 'oturum' && !veriIslemiMi(tanim.yetki)) {
    throw new Error(`Uç kayıtlı olmayan işlem istiyor (${String(tanim.yetki)}): ${ad}`);
  }
  if (tanim.onbellek !== undefined && tanim.yontem !== 'GET') throw new Error(`Önbellek etiketi yalnız GET ucunda verilebilir: ${ad}`);
  if (tanim.txDisi === true && tanim.yontem !== 'GET') {
    throw new Error(`Yalnız GET ucu transaction dışında koşabilir: ${ad}`);
  }
  if (tanim.tekrarKorumali === true) {
    if (tanim.yontem === 'GET') throw new Error(`GET ucu tekrar korumalı olamaz: ${ad}`);
    // Anahtarın yarısı kişidir: kimliksiz istekte başkasının kimliğiyle çakışan cevap dönerdi.
    if (tanim.yetki === 'acik') throw new Error(`Açık uç tekrar korumalı olamaz: ${ad}`);
  }
  if (tanim.kilitlenmedeYinele === true && tanim.yontem === 'GET') {
    throw new Error(`Kilitlenmede yineleme yalnız yazma ucunda verilebilir: ${ad}`);
  }
  if (tanim.denetim !== undefined) {
    if (tanim.yontem === 'GET') throw new Error(`GET ucu denetim kipi alamaz (okuma denetlenmez): ${ad}`);
    // Kimliksiz komutun satırında kişi yoktur: gövde de düşerse geriye kimin ne yaptığına dair hiçbir şey kalmaz.
    if (tanim.yetki === 'acik') throw new Error(`Açık uç denetim kipi alamaz: ${ad}`);
    // Tipi aşan değer sessizce 'tam' sayılmasın: yanlış yazılmış kip gövdeyi deftere sokardı.
    if (tanim.denetim !== 'govdesiz' && tanim.denetim !== 'yok') {
      throw new Error(`Bilinmeyen denetim kipi (${String(tanim.denetim)}): ${ad}`);
    }
  }
  if (tanim.kendiligindenYuklenir !== undefined && !ikiliMi(tanim.cevap as Sema)) {
    throw new Error(`Kendiliğinden yükleme seçeneği yalnız dosya ucunda verilebilir: ${ad}`);
  }
  if (ikiliMi(tanim.cevap as Sema)) {
    if (tanim.yontem !== 'GET') throw new Error(`İkili cevap yalnız okuma ucunda verilebilir: ${ad}`);
    // Akış transaction bittikten sonra veritabanına gider; transaction dışı uç veritabanı yokken cevap vermek içindir.
    if (tanim.txDisi === true) throw new Error(`İkili cevaplı uç transaction dışında koşamaz: ${ad}`);
  }
  if (tanim.denetimOzeti !== undefined) {
    // Tam denetimde gövde zaten defterdedir; denetimsiz uçta satır yoktur.
    if (tanim.denetim !== 'govdesiz') throw new Error(`Denetim özeti seçicisi yalnız gövdesiz uçta verilebilir: ${ad}`);
    if (tanim.govde === undefined) throw new Error(`Denetim özeti seçicisi gövde şeması ister: ${ad}`);
    if (typeof tanim.denetimOzeti !== 'function') throw new Error(`Denetim özeti seçicisi fonksiyon olmalı: ${ad}`);
  }
  return {
    yontem: tanim.yontem,
    yol: tanim.yol,
    // Liste kopyalanıp dondurulur: kayıttan sonra değişen dizi yetkiyi genişletemez.
    yetki: okumaYetkisiMi(tanim.yetki)
      ? Object.freeze({ biri: Object.freeze([...tanim.yetki.biri]) as OkumaYetkisi['biri'] })
      : tanim.yetki,
    txDisi: tanim.txDisi === true,
    tekrarKorumali: tanim.tekrarKorumali === true,
    kilitlenmedeYinele: tanim.kilitlenmedeYinele === true,
    denetim: tanim.denetim ?? 'tam',
    denetimOzeti: (tanim.denetimOzeti as Uc['denetimOzeti'] | undefined) ?? null,
    parametre: tanim.parametre ?? null,
    sorgu: tanim.sorgu ?? null,
    govde: tanim.govde ?? null,
    cevap: tanim.cevap,
    ikili: ikiliMi(tanim.cevap as Sema),
    kendiligindenYuklenir: tanim.kendiligindenYuklenir === true,
    onbellek: tanim.onbellek === 'etag',
    isle: tanim.isle as unknown as Uc['isle'],
  };
}

export function ucEnvanteri(uclar: readonly Uc[]): UcOzeti[] {
  return uclar.map(({ yontem, yol, yetki, txDisi, denetim, denetimOzeti, kendiligindenYuklenir }) => ({
    yontem, yol, yetki, txDisi, ...(denetim === 'govdesiz' || denetim === 'yok' ? { denetim } : {}),
    // Modül dosyasından `uc()` ile kurulmamış düz nesne de gelebilir (harita): alanı olmayan uç seçicili sayılmaz.
    ...(typeof denetimOzeti === 'function' ? { denetimSecimi: true as const } : {}),
    ...(kendiligindenYuklenir === true ? { kendiligindenYuklenir: true as const } : {}),
  }));
}

function semadanGecir(sema: Sema | null, deger: unknown, kaynak: string): unknown {
  if (sema === null) return undefined;
  const sonuc = sema.safeParse(deger, { errorMap: turkceIleti });
  if (sonuc.success) return sonuc.data;
  const sorunlar = sonuc.error.issues.map((s) => ({ alan: s.path.join('.') || kaynak, mesaj: s.message }));
  const ilk = sorunlar[0];
  throw dogrulama(ilk?.mesaj ?? 'Geçersiz istek.', ilk?.alan ?? kaynak, sorunlar);
}

// Aynı kimlik hâlâ işlenirken gelen istek ilk transaction'ı bekler; sunucunun süre sınırı beklemeyi keserse sonuç
// bilinmiyordur: istemci 4xx'i kalıcı sayar, bu yüzden yeniden denenebilir 503 döner.
async function anahtarAyir(depo: TekrarDeposu, db: Db, istek: TekrarIstegi): Promise<SakliCevap | null> {
  try {
    return await depo.ayir(db, istek);
  } catch (hata) {
    if (vtSureDoldu(hata)) throw mesgul();
    throw hata;
  }
}

function sakliCevabiCoz(sakli: SakliCevap, istek: TekrarIstegi, ad: string): { cevap: unknown } {
  // Özet yöntemi ve yol kalıbını da taşır: başka uçta kullanılan kimlik de burada ayrılır.
  if (sakli.govdeOzeti !== istek.govdeOzeti) {
    throw gecersiz('Bu istek kimliği başka bir istekte kullanılmış.');
  }
  if (sakli.durumKodu === null) throw new Error(`İstek kimliği satırı cevapsız kalmış: ${ad}`);
  // Gövdesiz cevap ile gövdesi null olan cevap sütunda aynı görünür; durum kodu ayırır.
  return { cevap: sakli.durumKodu === 204 ? undefined : sakli.cevap };
}

// Aynı uygulamaya ayrı çağrılarla (modül modül) kayıt yapılsa da çift tanım yakalanır.
const kayitlilar = new WeakMap<FastifyInstance, Set<string>>();

export function uclariKaydet(app: FastifyInstance, uclar: readonly Uc[], secenek: KayitSecenegi): void {
  const { vt, kimlik, denetle, tekrar, modul, guvenliCerez = false } = secenek;
  const gorulen = kayitlilar.get(app) ?? new Set<string>();
  kayitlilar.set(app, gorulen);

  for (const tanim of uclar) {
    const anahtar = `${tanim.yontem} ${tanim.yol}`;
    if (gorulen.has(anahtar)) throw new Error(`Uç iki kez kaydedildi: ${anahtar}`);
    gorulen.add(anahtar);

    app.route({
      method: tanim.yontem,
      url: `/api${tanim.yol}`,
      handler: async (istek, yanit) => {
        // Veritabanına ulaşılamadığı için kimlik çözülemeyince 401 de 500 de yanıltır: oturum bitmemiştir,
        // istek de sunucu da kusurlu değildir. Çözücünün başka her hatası beklenmeyen hata yoluna gider.
        const kullanici = await kimlik(istek).catch((hata: unknown) => {
          if (!vtUlasilamadi(hata)) {
            girdiHatasiSayma(hata);
            throw hata;
          }
          istek.log.error({ err: vtHataIzi(hata) ?? hata }, 'Kimlik çözülemedi');
          // Veritabanı yokken de cevap vermesi gereken açık uç kimliğe bağlı değildir; kendi cevabını verir.
          if (tanim.txDisi && tanim.yetki === 'acik') return null;
          throw veritabaniYok();
        });
        if (tanim.yetki !== 'acik') {
          if (kullanici === null) throw oturumYok();
          if (!yetkisiVarMi(kullanici, tanim.yetki) || !disIzleyiciGirerMi(kullanici, modul)) throw yetkiYok();
        }
        // Kayıtta durulmaz: uygulama bütün modüllerin uçlarını keşfeder, bayraklı tek uç deposuz kurulan her testi
        // düşürürdü. Deposuz kurulumda uç korumasız koşmaz, açık hatayla cevap verir.
        if (tanim.tekrarKorumali && tekrar === undefined) {
          throw new Error(`Tekrar korumalı uç çağrıldı ama tekrar deposu verilmemiş: ${anahtar}`);
        }

        const istekKimligi = tanim.tekrarKorumali ? baslikKimligi(istek.headers) : null;
        const parametre = semadanGecir(tanim.parametre, istek.params, 'parametre');
        const sorgu = semadanGecir(tanim.sorgu, istek.query, 'sorgu');
        const govde = semadanGecir(tanim.govde, istek.body, 'govde');
        const tekrarIstegi: TekrarIstegi | null = istekKimligi === null || kullanici === null ? null : {
          kisiId: kullanici.id,
          istekKimligi,
          uc: anahtar,
          govdeOzeti: istekOzeti({ yontem: tanim.yontem, yol: tanim.yol, parametre, sorgu, govde }),
        };

        const yazma = tanim.yontem !== 'GET';
        const cerezler: string[] = [];
        let durumKodu: number | null = null;
        const cerezEkle = (baslik: string): void => {
          if (tanim.tekrarKorumali) throw new Error(`Tekrar korumalı uç çerez yazamaz (yinelenen istekte çerez dönmez): ${anahtar}`);
          cerezler.push(baslik);
        };
        const gunluk = gunlukKur(istek.log, { uc: anahtar });
        // Reddedilmez: istemci kimliği korunduğunu sanarak yolluyor olabilir; uyarı, korumanın eksik olduğu ucu gösterir.
        if (yazma && !tanim.tekrarKorumali && istek.headers['istek-kimligi'] !== undefined) {
          gunluk.uyar('Korumasız uca istek kimliği geldi; yineleme koruması yok');
        }
        const istekBilgisi: IstekBilgisi = {
          ip: istek.ip,
          tarayici: istek.headers['user-agent'] ?? null,
          cerez: (ad) => cerezOku(istek.headers.cookie, ad),
          cerezYaz: (ad, deger, azamiSn) => { cerezEkle(cerezBasligi(ad, deger, azamiSn, guvenliCerez || istek.protocol === 'https')); },
          cerezSil: (ad) => { cerezEkle(cerezBasligi(ad, '', 0, guvenliCerez || istek.protocol === 'https')); },
          durumKoduYaz: (kod) => {
            if (yazma) throw new Error(`Durum kodu yalnız GET ucunda yazılabilir: ${anahtar}`);
            // 1xx ara cevaptır: gerçek bağlantıda istemci asıl cevabı beklerken kopar.
            if (!Number.isInteger(kod) || kod < 200 || kod > 599) {
              throw new Error(`Geçersiz durum kodu (200-599 arası tam sayı olmalı): ${anahtar}`);
            }
            durumKodu = kod;
          },
        };

        // Cevap şeması transaction içinde uygulanır: sözleşmeye uymayan sonuç yazıyı da geri alır.
        // Okuma tek görüntüde ve salt okunur koşar: iki sorgu arasında başkasının yazdığı cevaba karışmaz.
        const calistir = async (db: Db): Promise<{ cevap: unknown } | { ret: UygulamaHatasi }> => {
          // Yinelenen denemede önceki denemenin çerezleri geri alınan transaction'a aittir.
          cerezler.length = 0;
          let ayrildi = false;
          let ek: readonly DenetimSecimi[] | undefined;
          let ekHatasi: string | null = null;
          try {
            // Değişiklik defterinin tetikleri yazanı buradan okur (392 a). Yerel ayar transaction bitince düşer: havuzdaki
            // bağlantı sonraki isteğe kişi taşımaz. Kimliksiz yazma, göç ve arka iş ayarı boş bırakır; defterde kişi boş kalır.
            if (yazma && kullanici !== null) {
              await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(kullanici.id)]);
            }
            if (tekrar !== undefined && tekrarIstegi !== null) {
              const sakli = await anahtarAyir(tekrar, db, tekrarIstegi);
              // Saklı cevap dönerken işleyici ve denetim koşmaz: komut bir kez uygulanmış, bir kez kaydedilmiştir.
              if (sakli !== null) return sakliCevabiCoz(sakli, tekrarIstegi, anahtar);
              ayrildi = true;
            }
            const denetimEki = (satirlar: readonly DenetimSecimi[]): void => {
              if (!yazma) ekHatasi = 'okuma ucu';
              else if (tanim.denetim === 'yok') ekHatasi = 'denetimsiz uç';
              else if (ek !== undefined || ekHatasi !== null) ekHatasi = 'ikinci çağrı';
              else {
                try { ek = denetimEkiniKopyala(satirlar); } catch (hata) { ekHatasi = hata instanceof SecimHatasi ? hata.message : 'ek okunamadı'; }
              }
              if (ekHatasi !== null) throw new Error(`Denetim eki yazılamadı: ${anahtar} (${ekHatasi})`);
            };
            const sonuc = await tanim.isle({ istek: istekBilgisi, parametre, sorgu, govde, db, kullanici, denetimEki, gunluk });
            if (ekHatasi !== null) throw new Error(`Denetim eki yazılamadı: ${anahtar} (${ekHatasi})`);
            const cevap = tanim.cevap.parse(sonuc);
            if (yazma && tanim.denetim !== 'yok') {
              // Denetim verilmemiş kurulumda da koşar: bozuk seçici denetimsiz testte de görünür.
              const secilen = tanim.denetimOzeti === null ? null : denetimSeciminiAl(tanim.denetimOzeti, govde, anahtar);
              // Sözleşmede gizli işaretli alan kayda değeriyle girmez; denetimi yazan ayrıca adına göre maskeler.
              await denetle?.(db, {
                kisiId: kullanici?.id ?? null, yontem: tanim.yontem, yol: tanim.yol,
                parametre: semayaGoreGizle(tanim.parametre, parametre), govde: semayaGoreGizle(tanim.govde, govde), yetki: yetkiMetni(tanim.yetki),
                ...(modul === undefined ? {} : { modul }),
                ...(ek === undefined ? {} : { ek }),
                ...(tanim.denetim === 'govdesiz' ? { kip: 'govdesiz' as const } : {}),
                ...(secilen === null ? {} : { secilen }),
              });
            }
            // Şemadan geçmiş hal saklanır: şemada olmayan alan yinelenen istekte de dışarı çıkmaz.
            if (tekrar !== undefined && tekrarIstegi !== null) {
              await tekrar.sonucYaz(db, tekrarIstegi, { durumKodu: cevap === undefined ? 204 : 200, cevap });
            }
            return { cevap };
          } catch (hata) {
            // Eki düşen komutun yazıları kalmaz: işleyici hatayı yakalayıp yazıları koruyan ret fırlatsa da geri alınır.
            if (ekHatasi !== null) throw new Error(`Denetim eki yazılamadı: ${anahtar} (${ekHatasi})`);
            if (yazma && hata instanceof UygulamaHatasi && hata.yazilarKalir) {
              // Yazılar kalır ama hata cevabı saklanmaz: anahtar bırakılmazsa yeniden deneme cevapsız satıra çarpar.
              if (ayrildi && tekrar !== undefined && tekrarIstegi !== null) await tekrar.birak(db, tekrarIstegi);
              return { ret: hata };
            }
            throw hata;
          }
        };
        // Transaction dışı işleyici veritabanının kendisini almaz: eline geçen nesneden transaction açamaz, havuzu kapatamaz.
        const dogrudan: Db = {
          sorgu: <T>(sql: string, parametreler?: readonly unknown[]) => vt.sorgu<T>(sql, parametreler),
          tek: <T>(sql: string, parametreler?: readonly unknown[]) => vt.tek<T>(sql, parametreler),
        };
        const yaz = (): Promise<{ cevap: unknown } | { ret: UygulamaHatasi }> =>
          (tanim.kilitlenmedeYinele ? kilitlenmedeYinele(vt, calistir) : vt.tx(calistir));
        const bitti = yazma ? await yaz() : tanim.txDisi ? await calistir(dogrudan) : await vt.okumaTx(calistir);

        if (cerezler.length > 0) void yanit.header('set-cookie', cerezler);
        if ('ret' in bitti) throw bitti.ret;
        const sonuc = bitti.cevap;

        if (tanim.ikili) {
          if (durumKodu !== null) throw new Error(`İkili cevapta durum kodu yazılamaz: ${anahtar}`);
          if (sonuc === null) return yanit.code(204).header('cache-control', 'private, no-store').send();
          const dosya = sonuc as IkiliCevap;
          // 385 a (ADR 0002 eki): oturumlu kişiye verilen her dosya, içerik akmadan önce kendi yazma transaction'ında deftere
          // girer; yazılamazsa dosya verilmez. Satırı uç katmanı kurar: ad şemada 255 karakterle sınırlıdır, seçim sınırı
          // işleyicinin bıraktığı ek içindir. Kimliksiz açık uçta (giriş logosu) kişi yoktur, ekranın kendiliğinden yüklediği
          // dosyayı kişi açmamıştır; ikisinde de satır yazılmaz.
          if (denetle !== undefined && kullanici !== null && !tanim.kendiligindenYuklenir) {
            const ek: readonly DenetimSecimi[] = Object.freeze([Object.freeze({ ad: dosya.ad, tur: dosya.tur, boyut: dosya.boyut })]);
            await vt.tx((db) => denetle(db, {
              kisiId: kullanici.id, yontem: tanim.yontem, yol: tanim.yol, parametre: semayaGoreGizle(tanim.parametre, parametre),
              govde: undefined, yetki: yetkiMetni(tanim.yetki), ...(modul === undefined ? {} : { modul }), ek,
            }));
          }
          void yanit.code(200)
            .header('content-type', dosya.tur)
            .header('content-disposition', dosyaAdiBasligi(dosya.ad))
            .header('x-content-type-options', 'nosniff')
            // Dosya tarayıcıda doğrudan açılsa da betik ya da alt kaynak çalıştıramaz.
            .header('content-security-policy', "default-src 'none'; sandbox")
            .header('cache-control', 'private, no-store');
          const akis = Readable.from(ikiliAkis(dosya, dogrudan, anahtar));
          const sikisir = SIKISAN_DOSYALAR.has(dosya.tur) && dosya.boyut >= SIKISTIRMA_ESIGI;
          if (sikisir) void yanit.header('vary', 'accept-encoding');
          if (!sikisir || !gzipKabul(istek.headers['accept-encoding'])) return yanit.header('content-length', String(dosya.boyut)).send(akis);
          // Sıkışmış boy önceden bilinmez: Content-Length yazılmaz. Kaynak akış koparsa (eksik ya da fazla içerik) pipeline sıkıştırıcıyı da
          // bozar ve bağlantı kesilir; istemci yarım dosyayı tam sanmaz.
          return yanit.header('content-encoding', 'gzip').send(pipeline(akis, createGzip({ level: DOSYA_SIKISTIRMA_DUZEYI }), () => undefined));
        }
        if (sonuc === undefined) return yanit.code(durumKodu ?? 204).send();
        // 204 ve 304 gövde taşımaz; gövde sessizce düşmesin diye tanım hatası sayılır.
        if (durumKodu === 204 || durumKodu === 304) {
          throw new Error(`Gövdeli cevapta ${durumKodu} yazılamaz: ${anahtar}`);
        }
        const metin = JSON.stringify(sonuc);
        if (tanim.onbellek && (durumKodu ?? 200) === 200) {
          const etiket = `"${createHash('sha256').update(metin).digest('base64url').slice(0, 27)}"`;
          void yanit.header('etag', etiket).header('cache-control', 'private, no-cache');
          if (etiketTutar(istek.headers['if-none-match'], etiket)) return yanit.code(304).send();
        }
        void yanit.code(durumKodu ?? 200).type('application/json; charset=utf-8');
        if (Buffer.byteLength(metin) < SIKISTIRMA_ESIGI) return yanit.send(metin);
        void yanit.header('vary', 'accept-encoding');
        if (!gzipKabul(istek.headers['accept-encoding'])) return yanit.send(metin);
        return yanit.header('content-encoding', 'gzip').send(await gzipla(metin));
      },
    });
  }
}
