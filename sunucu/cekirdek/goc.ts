import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GocAyari } from './ayar.ts';
import { gocBaglantisiAc, vtSureDoldu } from './db.ts';
import type { Db, Veritabani } from './db.ts';

interface GocDosyasi {
  ad: string;
  sql: string;
  ozet: string;
}

// Kilit bekleme süresi (55P03), çalışan sunucu göçün değiştireceği tabloyu tuttuğunda dolar; sunucunun İngilizce iletisi
// ne yapılacağını söylemez. İfade süresi (57014) başka nedendir, iletisi kalır.
export function gocHataIletisi(hata: unknown): string {
  if (vtSureDoldu(hata) && (hata as { code?: string }).code === '55P03') {
    return 'Sunucu bir tabloyu kullanıyor, göç bekleyemedi. Sunucuyu (ve bekçi penceresini) kapatıp "npm run goc" komutunu yeniden çalıştırın.';
  }
  return hata instanceof Error ? hata.message : String(hata);
}

// Aynı şemadaki iki göç koşusunu sıraya sokan danışma kilidinin anahtarı. Danışma kilidi veritabanı geneline
// işler; aynı veritabanındaki ayrı şemalar (test şemaları gibi) ayrı kurulumdur, birbirini beklememeli.
// Anahtar bağlantının kendi şemasından türer, istemcideki ayardan değil: kilit, göçün yazdığı şemayı izler.
const KILIT_ANAHTARI_SQL =
  "('x' || left(encode(sha256(convert_to(coalesce(current_schema(), '') || ':goc_sirasi', 'UTF8')), 'hex'), 16))::bit(64)::bigint";

const KAYIT_TABLOSU = `CREATE TABLE IF NOT EXISTS goc_kaydi (
  ad text PRIMARY KEY,
  ozet text NOT NULL,
  uygulandi timestamptz NOT NULL DEFAULT now()
)`;

function ozetle(sql: string): string {
  // Satır sonu çalışma kopyasına göre değişebilir; özet bundan etkilenmemeli.
  return createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
}

async function dosyalariOku(klasor: string): Promise<GocDosyasi[]> {
  const adlar = (await readdir(klasor)).filter((ad) => ad.endsWith('.sql')).sort();
  const dosyalar: GocDosyasi[] = [];
  for (const ad of adlar) {
    const sql = await readFile(join(klasor, ad), 'utf8');
    dosyalar.push({ ad, sql, ozet: ozetle(sql) });
  }
  return dosyalar;
}

async function kayitlariOku(db: Db): Promise<Map<string, string>> {
  const satirlar = await db.sorgu<{ ad: string; ozet: string }>('SELECT ad, ozet FROM goc_kaydi');
  return new Map(satirlar.map((s) => [s.ad, s.ozet]));
}

function degismezligiDogrula(dosyalar: readonly GocDosyasi[], kayitlar: ReadonlyMap<string, string>): void {
  const dosyaOzeti = new Map(dosyalar.map((d) => [d.ad, d.ozet]));
  for (const [ad, ozet] of kayitlar) {
    const guncel = dosyaOzeti.get(ad);
    if (guncel === undefined) throw new Error(`Uygulanmış göç dosyası bulunamadı: ${ad}`);
    if (guncel !== ozet) throw new Error(`Uygulanmış göç değiştirilmiş: ${ad} (göç değişmezdir, yeni dosya ekleyin)`);
  }
}

// Uygulanmış son göçten eski damgalı yeni dosya, başka kurulumda o göçten ÖNCE koşar: aynı dosyalar iki
// veritabanında farklı sırayla uygulanmış olur. Sıra ada göredir; karşılaştırma da öyle.
function damgayiDogrula(ad: string, sonUygulanan: string | null, buKosudaUygulanan: readonly string[]): void {
  if (sonUygulanan !== null && ad < sonUygulanan) {
    const durum = buKosudaUygulanan.length === 0
      ? 'Hiçbir göç uygulanmadı.'
      : `Bu koşuda ondan önce uygulananlar kalıcıdır: ${buKosudaUygulanan.join(', ')}.`;
    throw new Error(
      `Göç damgası eski: ${ad}, uygulanmış son göçten (${sonUygulanan}) önce sıralanıyor. ` +
        `Damgayı yenile: dosyayı şimdiki zaman damgasıyla yeniden adlandır. ${durum}`,
    );
  }
}

// Koşular birbirini sırayla bekler; bağlantının kilit süre sınırı yalnız göçün kendi kilitleri içindir.
// Sınır danışma kilidine de işler, bu yüzden bekleme boyunca kaldırılır ve oturum değerine geri alınır.
async function sirayaGir(db: Db): Promise<void> {
  await db.sorgu('SET LOCAL lock_timeout = 0');
  await db.sorgu(`SELECT pg_advisory_xact_lock(${KILIT_ANAHTARI_SQL})`);
  await db.sorgu('RESET lock_timeout');
}

function sonuncu(adlar: Iterable<string>): string | null {
  let son: string | null = null;
  for (const ad of adlar) if (son === null || ad > son) son = ad;
  return son;
}

async function kayitTablosuVarMi(db: Db): Promise<boolean> {
  const satir = await db.tek<{ tablo: string | null }>("SELECT to_regclass('goc_kaydi')::text AS tablo");
  return satir?.tablo != null;
}

async function rolVarMi(db: Db, ad: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM pg_roles WHERE rolname = $1', [ad])) !== null;
}

export async function bekleyenGocler(vt: Veritabani, klasor: string): Promise<string[]> {
  const dosyalar = await dosyalariOku(klasor);
  if (!(await kayitTablosuVarMi(vt))) return dosyalar.map((d) => d.ad);
  const kayitlar = await kayitlariOku(vt);
  degismezligiDogrula(dosyalar, kayitlar);
  return dosyalar.filter((d) => !kayitlar.has(d.ad)).map((d) => d.ad);
}

export async function gocleriUygula(ayar: GocAyari, klasor: string, secenek: { sema?: string } = {}): Promise<string[]> {
  const dosyalar = await dosyalariOku(klasor);
  const vt = gocBaglantisiAc(ayar, secenek);
  try {
    return await uygula(vt, dosyalar, ayar.pg.kullanici);
  } finally {
    await vt.kapat();
  }
}

async function uygula(vt: Veritabani, dosyalar: readonly GocDosyasi[], uygulamaKullanicisi: string): Promise<string[]> {
  await vt.tx(async (db) => {
    await sirayaGir(db);
    await db.sorgu(KAYIT_TABLOSU);
    // Kaydı yalnız sahibi yazar; uygulama okur. Varsayılan yetki ya da taşıma betiği hakkı yeniden verebilir:
    // uygulanacak göç olmasa da her koşuda geri alınır.
    if (!(await rolVarMi(db, uygulamaKullanicisi))) {
      throw new Error(
        `Uygulama kullanıcısı veritabanında yok: TMIV2_PG_USER "${uygulamaKullanicisi}" rolünü gösteriyor. ` +
          'Göç kaydındaki yazma hakkı geri alınamadı, hiçbir göç uygulanmadı (roller: araclar/vt/kurulum.sql)',
      );
    }
    await db.sorgu(`REVOKE INSERT, UPDATE, DELETE ON goc_kaydi FROM "${uygulamaKullanicisi.replaceAll('"', '""')}"`);
    const kayitlar = await kayitlariOku(db);
    degismezligiDogrula(dosyalar, kayitlar);
    // Bütün bekleyenler ilk göçten önce denetlenir: biri reddedilirse hiçbiri uygulanmaz.
    const son = sonuncu(kayitlar.keys());
    for (const dosya of dosyalar) if (!kayitlar.has(dosya.ad)) damgayiDogrula(dosya.ad, son, []);
  });

  const uygulananlar: string[] = [];
  for (const dosya of dosyalar) {
    const uygulandi = await vt.tx(async (db) => {
      await sirayaGir(db);
      // Kilidi beklerken başka bir koşu bu dosyayı uygulamış olabilir; kayıt kilit altında yeniden okunur.
      const kayit = await db.tek<{ ozet: string }>('SELECT ozet FROM goc_kaydi WHERE ad = $1', [dosya.ad]);
      if (kayit) {
        if (kayit.ozet !== dosya.ozet) {
          throw new Error(`Uygulanmış göç değiştirilmiş: ${dosya.ad} (göç değişmezdir, yeni dosya ekleyin)`);
        }
        return false;
      }
      // İlk denetimden sonra başka bir koşu daha yeni damgalı göç uygulamış olabilir.
      damgayiDogrula(dosya.ad, sonuncu((await kayitlariOku(db)).keys()), uygulananlar);
      await db.sorgu(dosya.sql);
      await db.sorgu('INSERT INTO goc_kaydi (ad, ozet) VALUES ($1, $2)', [dosya.ad, dosya.ozet]);
      return true;
    });
    if (uygulandi) uygulananlar.push(dosya.ad);
  }
  return uygulananlar;
}
