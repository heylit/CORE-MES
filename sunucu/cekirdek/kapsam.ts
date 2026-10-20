import type { Db, Veritabani } from './db.ts';
import { kapsamDisi } from './hata.ts';

// İçerik özel alandadır: yayma ya da kopyalama onu taşımaz, dışarıdan okunamaz ve kurulamaz. Açık alan olsaydı
// `{ ...kapsam, izinli: null }` yazan modül kapsamı daraltırken sınırsız kapsam üretirdi.
class KapsamDegeri {
  // null sınırsızdır; dizi izinli iş merkezi kimlikleridir.
  readonly #izinli: readonly number[] | null;

  constructor(izinli: readonly number[] | null) {
    this.#izinli = izinli;
  }

  static izinli(kapsam: KapsamDegeri): readonly number[] | null {
    if (!(#izinli in kapsam)) throw new Error(SAHTE_KAPSAM);
    return kapsam.#izinli;
  }
}

export const SAHTE_KAPSAM = 'Kapsam yalnız kisininKapsami ile alınır; elle kurulan ya da kopyalanan nesne kapsam değildir.';

// Kişinin veri kapsamı (ADR 0003: işlem değil veri süzgeci). Ham kısıt listesi kapsam yerine verilemez,
// çünkü iki dilde boş liste zıt anlam taşır (kısıtta "kısıt yok", kapsamda "hiçbir iş merkezi").
export type Kapsam = KapsamDegeri;

const kapsamKur = (izinli: readonly number[] | null): Kapsam => new KapsamDegeri(izinli);

const SINIRSIZ = kapsamKur(null);

// Bugün hiçbir kaynak bunu üretmez; kapsamı daraltan modül için en dar değerdir.
export const HICBIR_YER = kapsamKur([]);

// Kısıtın sahibi modülün dışa açtığı fonksiyon. Çekirdek tablo sorgulamaz; muafiyet (bütün işlemleri taşıyan rol)
// kaynağın içinde çözülmüştür ve boş liste olarak gelir.
export type KisitKaynagi = (db: Db, kisiId: number) => Promise<readonly number[]>;

// Kaynağın dilinde boş liste "kısıt yok" demektir. Dışa açık değildir: kapsam ikinci kez çevrilirse boş kapsam sınırsıza döner.
function kisittanKapsam(kisit: readonly number[]): Kapsam {
  return kisit.length === 0 ? SINIRSIZ : kapsamKur([...new Set(kisit)]);
}

// İş merkezi olmayan kayıt (null) kimsenin kapsamı dışında değildir.
export function kapsamdaMi(kapsam: Kapsam, isMerkeziId: number | null): boolean {
  const izinli = KapsamDegeri.izinli(kapsam);
  return isMerkeziId === null || izinli === null || izinli.includes(isMerkeziId);
}

// Yazma komutu: kayıt kişinin kapsamı dışındaki iş merkezindeyse 403, tek ileti.
export function kapsamDisiysaReddet(kapsam: Kapsam, isMerkeziId: number | null): void {
  if (!kapsamdaMi(kapsam, isMerkeziId)) throw kapsamDisi();
}

// Liste sorgusunun parametresi; SQL metni modülün sorgular.ts dosyasındadır:
// `WHERE ($1::int[] IS NULL OR <is_merkezi_id> IS NULL OR <is_merkezi_id> = ANY($1::int[]))`.
// null koşulu kapatır; boş dizi yalnız iş merkezi olmayan satırları bırakır.
export function kapsamSuzgeci(kapsam: Kapsam): number[] | null {
  const izinli = KapsamDegeri.izinli(kapsam);
  return izinli === null ? null : [...izinli];
}

// Anahtar transaction'ın db nesnesidir: kapsam istek içinde bir kez okunur, denetim ile süzgeç aynı değeri görür.
// Aynı transaction'da kısıtı yazıp ardından okuyan komut bu yardımcıyı kullanmaz, kaynağı doğrudan çağırır.
const okunanlar = new WeakMap<Db, Map<KisitKaynagi, Map<number, Promise<Kapsam>>>>();

// Kök veritabanı nesnesi süreç boyu yaşar: orada belleklenen kapsam kısıt eklendikten sonra da sınırsız kalırdı.
// Transaction nesnesinin ayırt edici işareti yoktur: transaction dışı `Db` sarmalayıcısı istek ömründen uzun tutulmaz;
// kapsam belleği nesne ömrü kadardır.
const kokMu = (db: Db): boolean => typeof (db as Partial<Veritabani>).tx === 'function';

async function oku(db: Db, kisiId: number, kisitiVer: KisitKaynagi): Promise<Kapsam> {
  return kisittanKapsam(await kisitiVer(db, kisiId));
}

export function kisininKapsami(db: Db, kisiId: number, kisitiVer: KisitKaynagi): Promise<Kapsam> {
  if (kokMu(db)) return oku(db, kisiId, kisitiVer);
  const kaynaklar = okunanlar.get(db) ?? new Map<KisitKaynagi, Map<number, Promise<Kapsam>>>();
  okunanlar.set(db, kaynaklar);
  const kisiler = kaynaklar.get(kisitiVer) ?? new Map<number, Promise<Kapsam>>();
  kaynaklar.set(kisitiVer, kisiler);
  const onceki = kisiler.get(kisiId);
  if (onceki !== undefined) return onceki;
  const soz = oku(db, kisiId, kisitiVer);
  kisiler.set(kisiId, soz);
  // Okunamayan kapsam belleğe yerleşmez: sonraki çağrı kaynağı yeniden dener.
  soz.catch(() => {
    if (kisiler.get(kisiId) === soz) kisiler.delete(kisiId);
  });
  return soz;
}
