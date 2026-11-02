import pg from 'pg';
import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';
import { GOC_DEGISKENLERI } from './ayar.ts';
import type { GocAyari, PgAyari, PgGocKimligi } from './ayar.ts';
import { UygulamaHatasi, bagimliKayit, cakisma, gecersiz, mesgul } from './hata.ts';
import { sorguSayildi } from './istek-olcumu.ts';

export interface Db {
  sorgu<T>(sql: string, parametreler?: readonly unknown[]): Promise<T[]>;
  tek<T>(sql: string, parametreler?: readonly unknown[]): Promise<T | null>;
}

export interface Veritabani extends Db {
  tx<T>(is: (db: Db) => Promise<T>): Promise<T>;
  // Tek tutarlı görüntüde okur; yazma denemesini veritabanı reddeder. Kapanış kuralları tx ile aynıdır.
  okumaTx<T>(is: (db: Db) => Promise<T>): Promise<T>;
  // Transaction açmadan tek bağlantıda sorgu: oturum düzeyindeki durum (danışma kilidi) iş boyunca aynı bağlantıda kalır.
  // İsteğe bağlıdır: elle kurulmuş test veritabanları onu taşımak zorunda değildir; kullanan, yokluğunu açık hatayla bildirir.
  oturumda?<T>(is: (db: Db) => Promise<T>): Promise<T>;
  kapat(): Promise<void>;
}

export interface VeritabaniSecenegi {
  sema?: string;
  // Aynı anda açık bağlantı üst sınırı; verilmezse ayardaki havuz boyutu.
  havuzBoyutu?: number;
  // Bir istek havuz dolu olduğu için reddedildiğinde, o an sırada bekleyen istek sayısıyla çağrılır.
  mesgulBildir?: (bekleyen: number) => void;
  // Boştaki bağlantı koptuğunda çağrılır; sunucu uygulama günlüğünü verir. Verilmezse (göç, araç) standart hataya yazılır.
  baglantiHatasiBildir?: (hata: Error) => void;
}

export const baglantiHatasiniYaz = (hata: Error): void => {
  process.stderr.write(`Veritabanı bağlantı hatası: ${hata.message}\n`);
};

export interface UyariGunlugu {
  warn(nesne: { bekleyen: number }, mesaj: string): void;
}

const MESGUL_GUNLUK_ARALIGI_MS = 60_000;

// Havuz dolunca reddedilen her istek bir satır yazarsa günlük yük altında dolar; aralıkta bir satır
// doluluğun sürdüğünü göstermeye yeter. Günlükleyici hata verse de reddedilen istek cevabını alır.
export function mesgulGunlugu(gunluk: UyariGunlugu, simdi: () => number = () => performance.now()): (bekleyen: number) => void {
  let sonYazi = Number.NEGATIVE_INFINITY;
  return (bekleyen) => {
    const an = simdi();
    if (an - sonYazi < MESGUL_GUNLUK_ARALIGI_MS) return;
    sonYazi = an;
    try {
      gunluk.warn({ bekleyen }, 'Veritabanı havuzu dolu: istek reddedildi');
    } catch {
      // Bildirim sıra zamanlayıcısında koşar; oradan çıkan hata yakalanmamış istisna olur.
    }
  };
}

export const GOC_OTURUM_ADI = 'tmiv2_goc';
const TX_IPTAL = 'Transaction iptal durumundaydı: yazılanlar geri alındı';
const BEKLENMEMIS_SORGU = 'İşleyici beklenmemiş sorgu bıraktı: transaction geri alındı';
// Görüntü ilk sorguda alınır ve transaction boyunca değişmez: işleyicinin okumaları birbiriyle tutarlıdır.
const OKUMA_BASLANGICI = 'BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY';
const OTURUM_BITTI = 'Oturum bitti: bu db ile artık sorgu çalıştırılamaz (beklenmemiş bir sorgu kalmış olabilir)';
const TX_BITTI = 'Transaction bitti: bu db ile artık sorgu çalıştırılamaz (beklenmemiş bir sorgu kalmış olabilir)';
export const KAYIT_NOKTASI_TX_DISI = 'Kayıt noktası yalnız yazma transaction\'ının db\'siyle açılır (tx ya da yazma ucunun verdiği db)';
export const KAYIT_NOKTASI_OKUMADA = 'Kayıt noktası okuma transaction\'ında açılamaz: orada geri alınacak yazı yoktur';

// Tek bayrak: ara nokta adı sabittir (aynı adlı iç içe nokta en içtekini gösterir), transaction başına sayaç tutulmaz.
const txler = new WeakMap<Db, { okuma: boolean }>();
const NOKTA = 'kayit_noktasi';

export type KayitNoktasiSonucu<T> =
  | { tamam: true; deger: T }
  // Kısıt ihlali istek sınırındaki karşılığıyla (409/422) döner; `kisit` yalnız günlük içindir.
  | { tamam: false; hata: UygulamaHatasi; kisit: KisitIhlali['iz'] | null };

// Reddedilen alt işin yazılarını geri alır, transaction'ı ve çağıranın önceki yazılarını korur: kısıt ihlali
// transaction'ı iptal durumuna sokar, ara nokta olmadan çağıranın sonraki her sorgusu reddedilirdi.
// Yalnız iş kuralı reddi döner (uygulama hatası ya da kısıt ihlali): çağıran `tamam: false`'u kalıcı ret sayabilir.
// Başka her hata (süre aşımı, kilitlenme, sıralama çakışması, beklenmeyen hata) noktaya dönüldükten sonra yeniden
// fırlar: yeniden denenince geçecek hata "reddedildi" diye kaydedilmesin. Yakalayan çağıranın transaction'ı kullanılır kalır.
// Noktaya dönülemiyorsa (kopan bağlantı, biten transaction) korunacak bir şey kalmamıştır: özgün hata fırlar.
export async function kayitNoktasi<T>(db: Db, is: () => Promise<T>): Promise<KayitNoktasiSonucu<T>> {
  const tx = txler.get(db);
  if (tx === undefined) throw new Error(KAYIT_NOKTASI_TX_DISI);
  if (tx.okuma) throw new Error(KAYIT_NOKTASI_OKUMADA);
  await db.sorgu(`SAVEPOINT ${NOKTA}`);
  let deger: T;
  try {
    deger = await is();
  } catch (hata) {
    try {
      await db.sorgu(`ROLLBACK TO SAVEPOINT ${NOKTA}`);
      await db.sorgu(`RELEASE SAVEPOINT ${NOKTA}`);
    } catch {
      throw hata;
    }
    // Sunucu hatası sınıfındaki uygulama hatası (meşgul, veritabanı yok) kural reddi değildir.
    if (hata instanceof UygulamaHatasi && hata.durum < 500) return { tamam: false, hata, kisit: null };
    const ihlal = kisitIhlali(hata);
    if (ihlal !== null) return { tamam: false, hata: ihlal.hata, kisit: ihlal.iz };
    throw hata;
  }
  // İş, transaction'ı iptal eden hatayı yutup döndüyse bırakma reddedilir: başarı bildirilmez.
  await db.sorgu(`RELEASE SAVEPOINT ${NOKTA}`);
  return { tamam: true, deger };
}

export interface KisitIhlali {
  hata: UygulamaHatasi;
  // Yalnız günlük içindir; cevaba girmez. Satır değeri taşıyan ayrıntı metni bilerek alınmaz.
  iz: { pgKodu: string; kisit: string | null; tablo: string | null };
}

const KISIT_HATALARI: Record<string, () => UygulamaHatasi> = {
  '23505': () => cakisma('Aynı bilgilerle bir kayıt zaten var.'),
  '23503': () => bagimliKayit(),
  // PostgreSQL 18, RESTRICT eylemli yabancı anahtar ihlalini 23503 yerine 23001 ile bildirir.
  '23001': () => bagimliKayit(),
  '23514': () => gecersiz(),
};

// Kısıt ihlali kullanıcının düzeltebileceği bir durumdur; iletisi tablo ve kısıt adı taşıdığından aynen verilmez.
// Sunucu iletisi dile göre değiştiği için yalnız hata koduna bakılır.
export function kisitIhlali(hata: unknown): KisitIhlali | null {
  if (!(hata instanceof pg.DatabaseError) || hata.code === undefined) return null;
  const kur = KISIT_HATALARI[hata.code];
  if (kur === undefined) return null;
  return { hata: kur(), iz: { pgKodu: hata.code, kisit: hata.constraint ?? null, tablo: hata.table ?? null } };
}

const VERI_HATALARI: Record<string, string> = {
  '22003': 'Girilen sayı izin verilen aralığın dışında. Değeri kontrol edip yeniden deneyin.',
  '22P02': 'Girilen değerin biçimi geçersiz. Sayı ve seçim alanlarını kontrol edip yeniden deneyin.',
  '22001': 'Girilen metin çok uzun. Kısaltıp yeniden deneyin.',
  '22007': 'Girilen tarih ya da saat okunamadı. Kontrol edip yeniden deneyin.',
  '22008': 'Girilen tarih ya da saat geçerli aralıkta değil. Kontrol edip yeniden deneyin.',
  '23502': 'Zorunlu bir alan boş bırakıldı. Bilgileri tamamlayıp yeniden deneyin.',
};

// Kullanıcının girmediği değerden doğan hata (kimlik çözücü) kod kusurudur: "girdiğiniz değer" iletisi yanıltır.
const girdiDisi = new WeakSet<object>();
export function girdiHatasiSayma(hata: unknown): void {
  if (typeof hata === 'object' && hata !== null) girdiDisi.add(hata);
}

// Ön denetimden kaçan bozuk değer: istek kusurludur, kullanıcı düzeltebilir; 500 "beklenmeyen hata" yanıltır.
// Sunucu iletisi girilen değeri ve tablo adını taşıdığından cevaba yalnız koda göre seçilen ileti girer.
export function vtVeriHatasi(hata: unknown): UygulamaHatasi | null {
  if (!(hata instanceof pg.DatabaseError) || hata.code === undefined || girdiDisi.has(hata)) return null;
  const ileti = VERI_HATALARI[hata.code];
  return ileti === undefined ? null : gecersiz(ileti);
}

export interface VtHataIzi {
  type: string;
  message: string;
  stack: string | undefined;
  code: string | undefined;
  constraint: string | undefined;
  schema: string | undefined;
  table: string | undefined;
  column: string | undefined;
}

const VERI_BICIMI_SINIFI = '22';
export const VERI_BICIMI_ILETISI = 'Veri biçimi hatası (sunucu iletisi girilen değeri taşıdığı için yazılmadı)';

// Yığının başlığı iletinin kopyasıdır. İleti yığında bulunamazsa hangi satırın değer taşıdığı
// bilinemez; yığın hiç yazılmaz.
function iletisizYigin(hata: Error): string | undefined {
  const yer = hata.stack?.indexOf(hata.message) ?? -1;
  if (hata.stack === undefined || yer < 0 || hata.message === '') return undefined;
  return hata.stack.slice(0, yer) + VERI_BICIMI_ILETISI + hata.stack.slice(yer + hata.message.length);
}

// Günlüğe yazılacak veritabanı hatası: sunucunun ayrıntı alanları (detail, where, internalQuery, hint)
// satır değerini ve sorgu metnini taşır; yalnız tanıya yeten, değer taşımayan alanlar alınır.
// Veri biçimi hatalarında (sınıf 22) iletinin kendisi de reddedilen değeri taşır.
export function vtHataIzi(hata: unknown): VtHataIzi | null {
  if (!(hata instanceof pg.DatabaseError)) return null;
  const degerTasir = hata.code?.startsWith(VERI_BICIMI_SINIFI) === true;
  return {
    type: hata.name,
    message: degerTasir ? VERI_BICIMI_ILETISI : hata.message,
    stack: degerTasir ? iletisizYigin(hata) : hata.stack,
    code: hata.code,
    constraint: hata.constraint,
    schema: hata.schema,
    table: hata.table,
    column: hata.column,
  };
}

const AG_KODLARI = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
]);
const BAGLANTI_SINIFI = '08';
// Sunucu kapanıyor, yeniden başlıyor ya da henüz bağlantı kabul etmiyor.
const SUNUCU_HAZIR_DEGIL = new Set(['57P01', '57P02', '57P03']);

// Süre aşımı ve sürücünün bağlantı hataları kod taşımaz, yalnız ileti metniyle ayrılır; metne bakmamak
// için hata doğduğu yerde işaretlenir. İşaret hatanın kendisini değiştirmez: günlüğe aynı hata yazılır.
const ulasilamayanlar = new WeakSet<object>();

function ulasilamadiIsaretle<T>(hata: T): T {
  if (typeof hata === 'object' && hata !== null && !(hata instanceof pg.DatabaseError)) ulasilamayanlar.add(hata);
  return hata;
}

// Veritabanına ulaşılamadı mı? Sunucunun cevap verip reddettiği sorgu (eksik tablo, bozuk değer, yanlış
// parola) ulaşılamama değildir: o yapılandırma ya da kod kusurudur, beklemekle geçmez.
export function vtUlasilamadi(hata: unknown): boolean {
  if (typeof hata !== 'object' || hata === null) return false;
  const kod = (hata as { code?: unknown }).code;
  if (hata instanceof pg.DatabaseError) {
    return typeof kod === 'string' && (kod.startsWith(BAGLANTI_SINIFI) || SUNUCU_HAZIR_DEGIL.has(kod));
  }
  return ulasilamayanlar.has(hata) || (typeof kod === 'string' && AG_KODLARI.has(kod));
}

// Disk dolu (53100): her yazma aynı hatayı verir; ne istek kusurudur ne de beklemekle geçer, yer açılması gerekir.
export function vtDiskDolu(hata: unknown): boolean {
  return hata instanceof pg.DatabaseError && hata.code === '53100';
}

const SURE_SINIRI_KODLARI = new Set(['57014', '55P03']);

// Sunucu sorguyu süre sınırıyla kesti mi (ifade süresi ya da kilit bekleme süresi)? Bağlantı sağlamdır.
export function vtSureDoldu(hata: unknown): boolean {
  return hata instanceof pg.DatabaseError && hata.code !== undefined && SURE_SINIRI_KODLARI.has(hata.code);
}

// Kilitlenme (40P01) ve serileştirme hatası (40001): sunucu transaction'ı yarışı kaybettiği için düşürdü; aynı iş
// yeniden koşunca geçebilir. Kısıt ihlali ve süre aşımı bu sınıfa girmez: yeniden koşmak sonucu değiştirmez.
const GECICI_CAKISMA_KODLARI = new Set(['40P01', '40001']);

export function vtGeciciCakisma(hata: unknown): boolean {
  return hata instanceof pg.DatabaseError && hata.code !== undefined && GECICI_CAKISMA_KODLARI.has(hata.code);
}

function tamSayi(deger: string): number {
  const sayi = Number(deger);
  // Hassasiyetini yitiren sayı yanlış sayıdır; sessizce yuvarlamak yerine durulur.
  if (!Number.isSafeInteger(sayi)) throw new Error(`int8 değeri güvenli tam sayı aralığının dışında: ${deger}`);
  return sayi;
}

// date metin kalır: Date nesnesine çevrilirse saat dilimi günü kaydırır.
// numeric metin kalır: number'a çevrilirse 15-17 basamaktan sonrası sessizce yuvarlanır.
const metin = (deger: string): string => deger;

const METIN_DIZISI: number = 1009;

type Dizi<T> = Array<T | null | Dizi<T>>;

// Dizi sütunu öğe tipinin kuralını izler: sürücü varsayılanı date[] öğesini Date'e, numeric[] öğesini
// number'a çevirir, int8[] öğesini metin bırakır. Dizi metnini sürücünün text[] ayrıştırıcısı böler.
function dizi<T>(oge: (deger: string) => T): (deger: string) => Dizi<T> {
  const bol = pg.types.getTypeParser(METIN_DIZISI, 'text') as (deger: string) => Dizi<string>;
  const cevir = (liste: Dizi<string>): Dizi<T> =>
    liste.map((parca) => (parca === null ? null : Array.isArray(parca) ? cevir(parca) : oge(parca)));
  return (deger) => cevir(bol(deger));
}

const AYRISTIRICILAR = new Map<number, (deger: string) => unknown>([
  [1082, metin],
  [1182, dizi(metin)],
  [20, tamSayi],
  [1016, dizi(tamSayi)],
  [1700, metin],
  [1231, dizi(metin)],
]);

const tipler = {
  getTypeParser(oid: number, bicim?: string): unknown {
    const ozel = bicim === 'binary' ? undefined : AYRISTIRICILAR.get(oid);
    return ozel ?? pg.types.getTypeParser(oid, bicim as 'text');
  },
} as unknown as pg.CustomTypesConfig;

type Calistir = (sql: string, parametreler?: readonly unknown[]) => Promise<unknown>;

function satirlar<T>(sonuc: unknown): T[] {
  // Parametresiz çok ifadeli metin (göç dosyası) sonuç dizisi döndürür; son ifadenin satırları geçerlidir.
  const son = Array.isArray(sonuc) ? sonuc[sonuc.length - 1] : sonuc;
  return ((son as { rows?: T[] } | undefined)?.rows ?? []) as T[];
}

function dbKur(calistir: Calistir): Db {
  const sorgu = async <T>(sql: string, parametreler?: readonly unknown[]): Promise<T[]> => {
    sorguSayildi();
    return satirlar<T>(await calistir(sql, parametreler));
  };
  return {
    sorgu,
    async tek<T>(sql: string, parametreler?: readonly unknown[]): Promise<T | null> {
      const liste = await sorgu<T>(sql, parametreler);
      if (liste.length > 1) throw new Error(`tek() birden fazla satır aldı (${liste.length})`);
      return liste[0] ?? null;
    },
  };
}

// Süre dolunca reddeder; iş önce biterse zamanlayıcı temizlenir, yoksa süreç onu bekleyerek açık kalır.
function sureli<T>(is: Promise<T>, sureMs: number): Promise<T> {
  let zamanlayici: NodeJS.Timeout | undefined;
  const sureDoldu = new Promise<never>((_coz, reddet) => {
    zamanlayici = setTimeout(() => { reddet(ulasilamadiIsaretle(new Error(`Veritabanı ${sureMs} ms içinde cevap vermedi`))); }, sureMs);
  });
  return Promise.race([is, sureDoldu]).finally(() => { clearTimeout(zamanlayici); });
}

interface Sira {
  al(): Promise<void>;
  birak(): void;
  cevapGeldi(): void;
  durum(): HavuzDurumu;
}

// Havuzun o anki doluluğu ve açılıştan beri doluluk yüzünden reddedilen istek sayısı (artan sayaç; fark ölçen çağıranın işi).
export interface HavuzDurumu {
  boyut: number;
  kullanimda: number;
  bekleyen: number;
  mesgulToplam: number;
}

// Bağlantı sırası sürücüde değil burada tutulur: "sıra beklerken süre doldu" ile "sunucuya bağlanılamadı"
// sürücüde yalnız hata metniyle ayrılır.
function siraKur(boyut: number, sureMs: number, mesgulBildir: (bekleyen: number) => void): Sira {
  let bos = boyut;
  let sonCevap = Number.NEGATIVE_INFINITY;
  let mesgulToplam = 0;
  const bekleyenler: Array<() => void> = [];
  return {
    al(): Promise<void> {
      if (bos > 0) {
        bos -= 1;
        return Promise.resolve();
      }
      const baslangic = performance.now();
      return new Promise<void>((coz, reddet) => {
        const devral = (): void => { clearTimeout(zamanlayici); coz(); };
        const zamanlayici = setTimeout(() => {
          // Reddedilen istek de sayılır: bildirilen sayı o an sırada duranların tamamıdır.
          const bekleyen = bekleyenler.length;
          bekleyenler.splice(bekleyenler.indexOf(devral), 1);
          // Yerler cevap vermeyen sunucuya takılı denemelerle de dolar; o doluluk değil, ulaşılamamadır.
          // Bekleme boyunca sunucu hiç konuşmadıysa hangisi olduğu bilinemez: beklenmeyen hata sayılır.
          if (sonCevap > baslangic) {
            mesgulToplam += 1;
            mesgulBildir(bekleyen);
            reddet(mesgul());
          } else {
            reddet(ulasilamadiIsaretle(new Error(`Veritabanı bağlantı sırasında ${sureMs} ms beklendi; sunucu bu sürede hiç cevap vermedi`)));
          }
        }, sureMs);
        bekleyenler.push(devral);
      });
    },
    birak(): void {
      const siradaki = bekleyenler.shift();
      if (siradaki) siradaki();
      else bos += 1;
    },
    cevapGeldi(): void {
      sonCevap = performance.now();
    },
    durum(): HavuzDurumu {
      return { boyut, kullanimda: boyut - bos, bekleyen: bekleyenler.length, mesgulToplam };
    },
  };
}

const havuzDurumlari = new WeakMap<object, () => HavuzDurumu>();
let surecHavuzu: Veritabani | null = null;

// Elle kurulmuş (test) veritabanında null: doluluk bilinmiyor.
export function havuzDurumu(vt: object): HavuzDurumu | null {
  return havuzDurumlari.get(vt)?.() ?? null;
}

// Sunucunun uygulama havuzu; sağlık ölçümü isteğin transaction'ından değil buradan okur. Süreçte açılmadıysa null.
export function surecHavuzDurumu(): HavuzDurumu | null {
  return surecHavuzu === null ? null : havuzDurumu(surecHavuzu);
}

export function veritabaniAc(ayar: { pg: PgAyari }, secenek: VeritabaniSecenegi = {}): Veritabani {
  return ac(ayar.pg, ayar.pg, secenek, false);
}

export const SEMA_DEGISTIREBILIR =
  'Uygulama havuzu şemayı değiştirebilen kullanıcıyla açılamaz (tabloların sahibi yalnız göç ve test fikstürü içindir)';

// Uygulama süreci göç kullanıcısının adını bilmez; ad karşılaştırmak yerine bağlı kullanıcının bu şemada
// ne yapabildiği sorulur: tablo açabiliyor mu, şemanın ya da bir tablosunun sahibi mi. Sahiplik üyelikle
// sorulur: hakları devralmayan üye de sahibin kimliğine geçip şemayı değiştirebilir. Süper kullanıcı her
// soruya evet der. Cevap alınamazsa (şema yok) da reddedilir.
export async function uygulamaKimliginiDogrula(db: Db): Promise<void> {
  const satir = await db.tek<{ degistirebilir: boolean | null }>(
    `SELECT has_schema_privilege(current_schema(), 'CREATE')
         OR pg_has_role(n.nspowner, 'MEMBER')
         OR EXISTS (SELECT FROM pg_class c WHERE c.relnamespace = n.oid AND pg_has_role(c.relowner, 'MEMBER'))
       AS degistirebilir
     FROM (SELECT 1) tek LEFT JOIN pg_namespace n ON n.oid = to_regnamespace(current_schema())`,
  );
  if (satir?.degistirebilir !== false) throw new Error(SEMA_DEGISTIREBILIR);
}

export const GOC_KIMLIGI_SURECTE =
  `Göç kimliği bu süreçte tanımlı (${GOC_DEGISKENLERI.join(', ')}): sunucu ve yönetici aracı onu taşımaz. ` +
  'Komutu "npm run" ile başlatın ya da iki değişkeni sürecin ortamından kaldırın';

// Sunucunun ve araçların uygulama havuzu buradan açılır; iki denetim açılıştan ayrılamaz. Ön yükleme göç
// kimliğini süreçten düşürür: hâlâ tanımlıysa süreç yanlış ön yüklemeyle ya da ön yüklemesiz başlatılmıştır.
export async function uygulamaHavuzuAc(
  ayar: { pg: PgAyari },
  secenek: VeritabaniSecenegi = {},
  env: Record<string, string | undefined> = process.env,
): Promise<Veritabani> {
  if (GOC_DEGISKENLERI.some((ad) => env[ad] !== undefined)) throw new Error(GOC_KIMLIGI_SURECTE);
  const vt = veritabaniAc(ayar, secenek);
  try {
    await uygulamaKimliginiDogrula(vt);
  } catch (hata) {
    await vt.kapat();
    throw hata;
  }
  surecHavuzu = vt;
  return vt;
}

// Göçün bağlantısı uygulama havuzundan ayrıdır: uzun süren göç (dizin kurma, veri dönüşümü) sorgu süre
// sınırıyla kesilmez; buna karşılık kilidi sınırlı bekler ki kuyruğa giren DDL uygulamayı durdurmasın.
export function gocBaglantisiAc(ayar: GocAyari, secenek: { sema?: string } = {}): Veritabani {
  return ac(ayar.pg, ayar.goc, { ...secenek, havuzBoyutu: 1 }, true);
}

function ac(pgAyari: PgAyari, kimlik: PgGocKimligi, secenek: VeritabaniSecenegi, goc: boolean): Veritabani {
  const { sema } = secenek;
  if (sema !== undefined && !/^[a-z_][a-z0-9_]*$/.test(sema)) {
    throw new Error(`Geçersiz şema adı: ${sema}`);
  }
  const havuzBoyutu = secenek.havuzBoyutu ?? pgAyari.havuzBoyutu;
  if (!Number.isInteger(havuzBoyutu) || havuzBoyutu < 1) {
    throw new Error(`Geçersiz havuz boyutu: ${havuzBoyutu}`);
  }
  const { baglantiSureMs, sorguSureMs, okumaSureMs, kilitSureMs, bosTxSureMs } = pgAyari;
  // Oturum ayarları açılış iletisiyle gider: sıfır ("sınırsız") dahil her değer açıkça yazılır, sunucunun
  // rol ya da veritabanı varsayılanına bırakılmaz.
  const oturumAyarlari = [
    ...(sema === undefined ? [] : [`search_path=${sema}`]),
    `statement_timeout=${goc ? 0 : sorguSureMs}`,
    // Göç oturumu pg_stat_activity'de adıyla ayırt edilir: süren ya da asılı kalan koşu oradan görülür.
    ...(goc ? [`lock_timeout=${kilitSureMs}`, `application_name=${GOC_OTURUM_ADI}${sema === undefined ? '' : `:${sema}`}`] : []),
    `idle_in_transaction_session_timeout=${bosTxSureMs}`,
    // `current_date`, tarih ile zaman arası çevirme ve zaman çıktısının saat farkı tesisin gününü izler; sunucu kurulumunun
    // saat dilimine bırakılırsa gün sınırı kayar.
    `TimeZone=${TESIS_SAAT_DILIMI}`,
  ];
  const sira = siraKur(havuzBoyutu, baglantiSureMs, secenek.mesgulBildir ?? (() => undefined));
  const havuz = new pg.Pool({
    host: pgAyari.host,
    port: pgAyari.port,
    user: kimlik.kullanici,
    password: kimlik.parola,
    database: pgAyari.veritabani,
    max: havuzBoyutu,
    connectionTimeoutMillis: baglantiSureMs,
    types: tipler,
    options: oturumAyarlari.map((a) => `-c ${a}`).join(' '),
  });
  // Boştaki bağlantının kopması dinleyicisiz kalırsa süreci düşürür.
  const baglantiHatasi = secenek.baglantiHatasiBildir ?? baglantiHatasiniYaz;
  havuz.on('error', (hata) => {
    try {
      baglantiHatasi(hata);
    } catch {
      // Dinleyiciden çıkan hata süreci düşürür; bildirim yazılamasa da havuz sürer.
    }
  });

  // statement_timeout'u sunucu uygular; sunucu susarsa o da işlemez. İstemci sınırı ağ payı kadar
  // geç dolar ki yavaş sorguyu önce sunucu iptal etsin ve bağlantı kullanılır kalsın.
  // Göçte istemci sınırı da yoktur: sunucu sınırlamadığı sorguyu istemci kesmemeli.
  const istemciSureMs = goc ? null : sorguSureMs + baglantiSureMs;

  async function baglantida<T>(is: (calistir: Calistir, bozukSay: () => void) => Promise<T>): Promise<T> {
    await sira.al();
    try {
      return await yerAlinmis(is);
    } finally {
      sira.birak();
    }
  }

  async function yerAlinmis<T>(is: (calistir: Calistir, bozukSay: () => void) => Promise<T>): Promise<T> {
    // Bağlantı kurulamadıysa sunucunun bildirdiği ret dışında her neden ulaşılamamadır (süre aşımı, ağ).
    const istemci = await havuz.connect().catch((hata: unknown) => { throw ulasilamadiIsaretle(hata); });
    let bozuk = false;
    // Bağlantı sunucu ya da ağ yüzünden mi bozuldu: öyleyse sonraki hatalar da ulaşılamamadır, kod kusuru değildir.
    let ulasilamadi = false;
    // Sunucu ödünçteki bağlantıyı sorgu yokken de kesebilir (boş transaction sınırı, sunucu kapanışı);
    // havuz yalnız boştaki bağlantıyı dinler, dinleyicisiz kalan hata süreci düşürür.
    const koptu = (): void => { bozuk = true; ulasilamadi = true; };
    istemci.on('error', koptu);
    const calistir: Calistir = async (sql, parametreler) => {
      if (bozuk) {
        const hata = new Error('Veritabanı bağlantısı kullanılamaz durumda');
        throw ulasilamadi ? ulasilamadiIsaretle(hata) : hata;
      }
      const sorgu = parametreler === undefined ? istemci.query(sql) : istemci.query(sql, [...parametreler]);
      try {
        const sonuc = await (istemciSureMs === null ? sorgu : sureli(sorgu, istemciSureMs));
        sira.cevapGeldi();
        return sonuc;
      } catch (hata) {
        // Yalnız sunucunun bildirdiği hata bağlantının hâlâ konuştuğunu gösterir; süre aşımı ve kopma göstermez.
        if (hata instanceof pg.DatabaseError) sira.cevapGeldi();
        else {
          bozuk = true;
          // Kopan bağlantıdaki ret sürücünün kodsuz hatasıdır; bağlantı sağlamken atılan hata (bozuk parametre) kod kusurudur.
          if (ulasilamadi || vtUlasilamadi(hata)) {
            ulasilamadi = true;
            ulasilamadiIsaretle(hata);
          }
        }
        throw hata;
      }
    };
    try {
      return await is(calistir, () => { bozuk = true; });
    } finally {
      // Kopan bağlantı kapanırken hata vermeyi sürdürebilir; dinleyici yalnız sağlam bağlantıdan alınır.
      if (!bozuk) istemci.removeListener('error', koptu);
      // Bozuk bağlantı havuza dönmez, kapatılır; açık transaction'ı sunucu kendisi geri alır.
      istemci.release(bozuk);
    }
  }

  // Okuma transaction'ı kendi kısa süre sınırıyla açılır; aynı iletide gider, ek gidiş dönüş yoktur. Göçte süre sınırı yoktur.
  const okumaBaslangici = goc ? OKUMA_BASLANGICI : `${OKUMA_BASLANGICI}; SET LOCAL statement_timeout = ${okumaSureMs}`;

  function txKos<T>(okuma: boolean, is: (db: Db) => Promise<T>): Promise<T> {
    return baglantida(async (calistir, bozukSay) => {
      // İşleyicinin beklemeden bıraktığı sorgu, bağlantı havuza döndükten sonra başka isteğin
      // transaction'ında koşardı. Kapanış COMMIT gönderilmeden önce olur: araya giren sorgu COMMIT'in
      // ardına sıralanıp transaction dışında kalıcı olmasın.
      let kapali = false;
      const ic = dbKur(async (sql, parametreler) => {
        if (kapali) throw new Error(TX_BITTI);
        return calistir(sql, parametreler);
      });
      // İşleyicinin eline geçen sözün kendisi izlenir: yakalanmamış ret o söze bakılarak sayılır.
      const bekleyenler = new Set<Promise<unknown>>();
      const izle = <S>(baslat: () => Promise<S>): Promise<S> => {
        let kendisi: Promise<S> | undefined;
        const soz = (async () => {
          try {
            return await baslat();
          } finally {
            if (kendisi) bekleyenler.delete(kendisi);
          }
        })();
        kendisi = soz;
        bekleyenler.add(soz);
        return soz;
      };
      const db: Db = {
        sorgu: <S>(sql: string, parametreler?: readonly unknown[]) => izle(() => ic.sorgu<S>(sql, parametreler)),
        tek: <S>(sql: string, parametreler?: readonly unknown[]) => izle(() => ic.tek<S>(sql, parametreler)),
      };
      txler.set(db, { okuma });
      try {
        await calistir(okuma ? okumaBaslangici : 'BEGIN');
        let sonuc: T;
        try {
          sonuc = await is(db);
        } finally {
          kapali = true;
          // Transaction zaten geri alınacak; sahipsiz sözün reddi süreci düşürmesin.
          for (const soz of bekleyenler) soz.catch(() => undefined);
        }
        // Beklenmemiş sorgu sürücü kuyruğunda COMMIT'in önündedir: sonucu görülmeden kalıcı olurdu.
        if (bekleyenler.size > 0) throw new Error(BEKLENMEMIS_SORGU);
        // İptal durumundaki transaction'da COMMIT hata vermez, geri alır; yalnız komut etiketi ele verir.
        const bitis = await calistir('COMMIT');
        if ((bitis as { command?: unknown }).command === 'ROLLBACK') throw new Error(TX_IPTAL);
        return sonuc;
      } catch (hata) {
        // Geri alma da başarısız olursa asıl hata örtülmesin; geri alınamayan bağlantı yeniden kullanılmaz.
        await calistir('ROLLBACK').catch(bozukSay);
        throw hata;
      }
    });
  }

  // Bağlantı havuza oturum durumu taşımadan döner: iş başarıyla bitince DISCARD ALL kilitleri, SET'leri bırakır (açılış
  // iletisindeki ayarlar oturumun varsayılanıdır, kalır). Açık transaction bırakan iş orada hata alır; iş ya da temizlik
  // hata verirse bağlantı havuza dönmez, kapatılır: sunucu oturumla birlikte kilitleri ve transaction'ı düşürür.
  function oturumKos<T>(is: (db: Db) => Promise<T>): Promise<T> {
    return baglantida(async (calistir, bozukSay) => {
      let kapali = false;
      const db = dbKur(async (sql, parametreler) => {
        if (kapali) throw new Error(OTURUM_BITTI);
        return calistir(sql, parametreler);
      });
      try {
        const sonuc = await is(db);
        kapali = true;
        await calistir('DISCARD ALL');
        return sonuc;
      } catch (hata) {
        kapali = true;
        bozukSay();
        throw hata;
      }
    });
  }

  const vt: Veritabani = {
    ...dbKur((sql, parametreler) => baglantida((calistir) => calistir(sql, parametreler))),
    tx: (is) => txKos(false, is),
    okumaTx: (is) => txKos(true, is),
    oturumda: oturumKos,
    async kapat(): Promise<void> {
      if (surecHavuzu === vt) surecHavuzu = null;
      await havuz.end();
    },
  };
  havuzDurumlari.set(vt, () => sira.durum());
  return vt;
}
