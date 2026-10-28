import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku, testAyari } from './ayar.ts';
import type { Ayar, GocAyari } from './ayar.ts';
import { veritabaniAc } from './db.ts';
import type { Db, Veritabani, VeritabaniSecenegi } from './db.ts';
import { gocleriUygula } from './goc.ts';

const GOC_KLASORU = fileURLToPath(new URL('../gocler/', import.meta.url));

// Bu yaştan genç şema başka bir koşunun (öteki worktree, paralel test dosyası) canlı şeması olabilir; silinmez.
export const ARTIK_SEMA_YASI_SN = 600;

// Aynı anda açılan test dosyaları aynı artığı silmeye kalkmasın diye temizlik sıraya girer. Kapanıştaki silme de
// aynı sıraya girer: tam şemayı silen transaction yüzlerce kilit tutar; eşzamanlı dosyaların kapanışları üst üste
// binince sunucunun ortak kilit tablosu dolar ve silme 53200 (out of shared memory) ile düşer.
export const TEMIZLIK_KILIDI = 7402100002;

const ZAMANLI_AD = /_(\d{9,11})_[0-9a-f]{12}$/;

// Sunucunun kilit tablosu bütün bağlantılarca paylaşılır (yaklaşık max_locks_per_transaction x bağlantı sayısı; varsayılanda
// ~6400) ve transaction'ın aldığı her kilit bitene dek orada durur. Tam şemayı tek transaction'da silmek 400 tabloda ~10 bin
// kilit (tablo başına ~26: dizinler, toast, satır tipi, kısıtlar, diziler), sıfırlamak ~1900 kilit tutuyordu; eşzamanlı
// dosyalarla tablo doldu ve ilgisiz sorgular 53200 ile düştü. İş tablo kümelerine bölünür; transaction başına kilit tablo
// sayısıyla değil küme boyuyla büyür.
export const SILME_KUMESI = 10;
export const SIFIRLAMA_KUMESI = 50;

// Testin her transaction'ın kapanmadan önceki hâlini (örn. tuttuğu kilitler) ölçebilmesi için.
export type IslemSonu = (db: Db) => Promise<void>;

const tirnakla = (ad: string): string => `"${ad.replaceAll('"', '""')}"`;

function kumele<T>(dizi: T[], boy: number): T[][] {
  const kumeler: T[][] = [];
  for (let i = 0; i < dizi.length; i += boy) kumeler.push(dizi.slice(i, i + boy));
  return kumeler;
}

// Sıra beklemesi sorgu süre sınırına sayılmaz: bekleme, önde kaç dosyanın silme yaptığına bağlıdır ve eşzamanlılıkla büyür.
// Silmenin kendisi oturumun sınırıyla koşar; takılan silme yine yakalanır.
async function temizlikSirasinaGir(db: Db): Promise<void> {
  await db.sorgu('SET LOCAL statement_timeout = 0');
  await db.sorgu('SELECT pg_advisory_xact_lock($1)', [TEMIZLIK_KILIDI]);
  await db.sorgu('RESET statement_timeout');
}

// Şema önce tablo kümeleriyle, en son kalan nesneleriyle (işlevler, tipler) silinir; her küme kendi transaction'ında ve
// temizlik sırasında. Yarıda kesilen silme şemayı eksik bırakır; şema adı yerinde kaldığı için artık temizliği onu yine bulur.
export async function semayiSil(vt: Veritabani, sema: string, islemSonu?: IslemSonu): Promise<void> {
  for (let bitti = false; !bitti;) {
    bitti = await vt.tx(async (db) => {
      await temizlikSirasinaGir(db);
      // Önce başka tablonun başvurmadığı tablolar: çok başvurulan tablo (kişi gibi) erken silinirse CASCADE, başvuran
      // her tablonun kısıtını da siler ve o tabloları da kilitler; tek tablo binden çok kilit tutar. Döngüde sıra yoktur,
      // kalanlar ad sırasıyla gider. Bölüm ana tablosuyla silinir.
      const tablolar = (await db.sorgu<{ ad: string }>(
        `SELECT c.relname::text AS ad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN (SELECT DISTINCT confrelid FROM pg_constraint
                       WHERE contype = 'f' AND confrelid <> conrelid AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1::text)) b
                  ON b.confrelid = c.oid
          WHERE n.nspname = $1::text AND c.relkind IN ('r', 'p') AND NOT c.relispartition
          ORDER BY b.confrelid IS NOT NULL, 1 LIMIT $2`,
        [sema, SILME_KUMESI],
      )).map((t) => `${tirnakla(sema)}.${tirnakla(t.ad)}`);
      if (tablolar.length > 0) await db.sorgu(`DROP TABLE IF EXISTS ${tablolar.join(', ')} CASCADE`);
      else await db.sorgu(`DROP SCHEMA IF EXISTS ${tirnakla(sema)} CASCADE`);
      await islemSonu?.(db);
      return tablolar.length === 0;
    });
  }
}

// Hakkı olmayan işi sunucu bu kodla reddeder; ileti dile göre değiştiği için koda bakılır.
export const izinYok = (hata: unknown): boolean => (hata as { code?: unknown } | null)?.code === '42501';

export interface TestVeritabani {
  // Uygulama kullanıcısı: uç ve servis testleri bununla koşar; şema değiştiremez.
  vt: Veritabani;
  // Göç kullanıcısı (tabloların sahibi): yalnız fikstür DDL'i ve sahiplik isteyen ölçümler için.
  sahip: Veritabani;
  // Test süreci iki kimliği de taşır: göç koşusuna olduğu gibi verilir.
  ayar: Ayar & GocAyari;
  sema: string;
  kaldir(): Promise<void>;
}

// Fikstür DDL'i ve sahiplik isteyen ölçümler sahibin kimliğiyle, uygulama havuzunun süre sınırlarıyla koşar.
// Göç bağlantısı bu işe uymaz: tek bağlantılıdır ve oturum adı göç koşusu sayılır.
function sahipHavuzuAc(ayar: GocAyari, secenek: VeritabaniSecenegi): Veritabani {
  return veritabaniAc({ pg: { ...ayar.pg, ...ayar.goc } }, secenek);
}

// Oluşturulma zamanı ada gömülür: yarıda kesilen koşunun artığını canlı koşudan ayıran tek bilgi budur.
export function testSemaAdi(onek: string, simdiMs: number = Date.now()): string {
  return `t_${onek}_${Math.floor(simdiMs / 1000)}_${randomBytes(6).toString('hex')}`;
}

function artikMi(ad: string, simdiSn: number): boolean {
  const zaman = ZAMANLI_AD.exec(ad)?.[1];
  // Adında zaman olmayan şemayı hiçbir canlı koşu üretmez; eski sayılır.
  return zaman === undefined || simdiSn - Number(zaman) > ARTIK_SEMA_YASI_SN;
}

// Kapanış kancası yarıda kesilen koşuda çalışmaz; artığı bir sonraki koşunun açılışı siler.
// Her artık ayrı silinir: birikmiş artıkların hepsi tek transaction'da silinirse sunucunun kilit tablosu dolar.
async function artiklariTemizle(vt: Veritabani): Promise<void> {
  const semalar = await vt.sorgu<{ ad: string }>("SELECT nspname::text AS ad FROM pg_namespace WHERE left(nspname, 2) = 't_' ORDER BY 1");
  const simdiSn = Math.floor(Date.now() / 1000);
  for (const { ad } of semalar) {
    if (!artikMi(ad, simdiSn)) continue;
    await semayiSil(vt, ad);
  }
}

// Yalnız test veritabanında, koşuya özel boş bir şema açar; açılışta önceki koşuların artıklarını temizler.
// Şemayı göç kullanıcısı açar ve siler; uygulama kullanıcısı ona veritabanının varsayılan yetkileriyle erişir.
export async function testSemasiAc(onek: string): Promise<TestVeritabani> {
  const ayar = { ...testAyari(ayarOku()), goc: gocKimligiOku() };
  const sema = testSemaAdi(onek);
  const sahip = sahipHavuzuAc(ayar, { sema });
  try {
    await artiklariTemizle(sahip);
    await sahip.sorgu(`CREATE SCHEMA ${sema}`);
  } catch (hata) {
    await sahip.kapat();
    throw hata;
  }
  const vt = veritabaniAc(ayar, { sema });
  return {
    vt,
    sahip,
    ayar,
    sema,
    async kaldir(): Promise<void> {
      try {
        await vt.kapat();
        await semayiSil(sahip, sema);
      } finally {
        await sahip.kapat();
      }
    },
  };
}

// Her test dosyası kendi şemasında, bütün göçler uygulanmış boş bir veritabanıyla çalışır.
export async function testVeritabaniKur(onek: string): Promise<TestVeritabani> {
  const ortam = await testSemasiAc(onek);
  await gocleriUygula(ortam.ayar, GOC_KLASORU, { sema: ortam.sema });
  return ortam;
}

interface Tohum {
  tablolar: string[];
  tetikli: string[];
  satirlar: { tablo: string; sutunlar: string; json: string }[];
  diziler: { ad: string; deger: string | null; baslangic: string }[];
}

// Göçlerin bıraktığı durum (tohum satırları ve dizi değerleri) bir kez okunur; her test başında şema ona döner.
// Bütün göçleri yeniden uygulamaktan çok daha ucuzdur; her test yine boş, göç sonrası veritabanıyla başlar.
// Sahip yapar: tetikler (yalnız ekleme kuralı dahil) kapalıyken silinir ve yazılır, yabancı anahtar denetimi açık kalır.
// Kümeler sırayla ayrı transaction'lardadır: çocuk tablolar ebeveynden önceki kümelerde boşalır, ebeveynler önceki kümelerde
// dolar; her küme tetiklerini kendi transaction'ında kapatıp açar, kapalı tetik hiçbir bağlantıya görünmez.
export async function sifirlamaHazirla(
  ortam: Pick<TestVeritabani, 'sahip'>,
  islemSonu?: IslemSonu,
): Promise<() => Promise<void>> {
  const { sahip } = ortam;
  const tablolar = (await sahip.sorgu<{ ad: string }>(
    `SELECT c.relname::text AS ad FROM pg_class c
      WHERE c.relnamespace = current_schema()::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'goc_kaydi' ORDER BY 1`,
  )).map((t) => t.ad);
  const tetikli = (await sahip.sorgu<{ ad: string }>(
    `SELECT DISTINCT c.relname::text AS ad FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = current_schema()::regnamespace ORDER BY 1`,
  )).map((t) => t.ad);
  // Ebeveyn önce: tohum satırları yabancı anahtar sırasıyla geri yazılır.
  const baglar = await sahip.sorgu<{ cocuk: string; ebeveyn: string }>(
    `SELECT conrelid::regclass::text AS cocuk, confrelid::regclass::text AS ebeveyn FROM pg_constraint
      WHERE contype = 'f' AND connamespace = current_schema()::regnamespace AND conrelid <> confrelid`,
  );
  const sirali: string[] = [];
  const ziyaret = new Set<string>();
  const gez = (tablo: string): void => {
    if (ziyaret.has(tablo)) return;
    ziyaret.add(tablo);
    for (const b of baglar) if (b.cocuk === tablo) gez(b.ebeveyn);
    sirali.push(tablo);
  };
  for (const t of tablolar) gez(t);
  const silinecek = sirali.filter((t) => tablolar.includes(t));
  const satirlar: Tohum['satirlar'] = [];
  for (const tablo of silinecek) {
    const satir = await sahip.tek<{ json: string | null }>(`SELECT json_agg(t)::text AS json FROM ${tirnakla(tablo)} t`);
    if (!satir?.json) continue;
    // Üretilen sütun yazılamaz; değeri geri yazılan sütunlardan yeniden hesaplanır.
    const sutunlar = (await sahip.sorgu<{ ad: string }>(
      `SELECT attname::text AS ad FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum`,
      [tirnakla(tablo)],
    )).map((s) => tirnakla(s.ad)).join(', ');
    satirlar.push({ tablo, sutunlar, json: satir.json });
  }
  const diziler = await sahip.sorgu<Tohum['diziler'][number]>(
    `SELECT format('%I', sequencename) AS ad, last_value::text AS deger, start_value::text AS baslangic
       FROM pg_sequences WHERE schemaname = current_schema()`,
  );
  const kume = (tablolar: string[], is: (db: Db) => Promise<void>): Promise<void> =>
    sahip.tx(async (db) => {
      const kapanacak = tablolar.filter((t) => tetikli.includes(t));
      for (const t of kapanacak) await db.sorgu(`ALTER TABLE ${tirnakla(t)} DISABLE TRIGGER USER`);
      await is(db);
      for (const t of kapanacak) await db.sorgu(`ALTER TABLE ${tirnakla(t)} ENABLE TRIGGER USER`);
      await islemSonu?.(db);
    });
  return async () => {
    // Küçük tablolarda DELETE, TRUNCATE'ten ucuzdur (TRUNCATE her tablo ve dizin için yeni dosya açar). Çocuk önce silinir.
    for (const k of kumele([...silinecek].reverse(), SIFIRLAMA_KUMESI)) {
      await kume(k, async (db) => {
        for (const tablo of k) await db.sorgu(`DELETE FROM ${tirnakla(tablo)}`);
      });
    }
    for (const k of kumele(satirlar, SIFIRLAMA_KUMESI)) {
      await kume(k.map((s) => s.tablo), async (db) => {
        for (const { tablo, sutunlar, json } of k) {
          await db.sorgu(
            `INSERT INTO ${tirnakla(tablo)} (${sutunlar}) OVERRIDING SYSTEM VALUE
               SELECT ${sutunlar} FROM json_populate_recordset(null::${tirnakla(tablo)}, $1::json)`,
            [json],
          );
        }
      });
    }
    for (const k of kumele(diziler, SIFIRLAMA_KUMESI)) {
      await kume([], async (db) => {
        for (const d of k) await db.sorgu('SELECT setval($1::regclass, $2::bigint, $3)', [d.ad, d.deger ?? d.baslangic, d.deger !== null]);
      });
    }
  };
}
