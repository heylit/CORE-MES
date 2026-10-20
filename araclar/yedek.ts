import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from '#cekirdek/ayar.ts';
import { gocBaglantisiAc } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { yedekAl, yedekOrtamiOku, yedekSifresiniCoz, type YedekOrtami } from '../sunucu/moduller/ayarlar/disari.ts';
import { yedegiGeriYukle } from './guncelleyici.ts';

// Komut satırından veritabanı yedeği ve geri yükleme: `npm run yedek`, `npm run geri-yukle -- <dosya>`; yeni yedek anahtarı
// `npm run yedek-anahtari` (yalnız ekrana yazar, hiçbir yere kaydetmez: anahtarı bilgi işlem saklar). Elle pg_restore için şifreli
// yedek düz dosyaya açılır: `npm run yedek-coz -- <yedek> <hedef>`. Sunucu ve yönetici
// ekranı gerekmez; göç taşıyan bir `git pull` öncesi tek komutla yedek alınsın diye. Yönetici (Windows) yetkisi ve PostgreSQL
// süper kullanıcısı istemez: yedeği uygulama kullanıcısı, geri yüklemeyi şemanın sahibi göç kullanıcısı yapar.
const kok = fileURLToPath(new URL('../', import.meta.url));

// Klasör seçilmediyse depo klasörünün yanına yazılır: yedek bütün veriyi taşır, deponun içine girmemeli.
export function yedekKlasoru(env: NodeJS.ProcessEnv, depoKoku: string): string {
  const secili = env['TMIV2_YEDEK_DIZINI']?.trim() ?? '';
  return secili !== '' ? secili : path.resolve(depoKoku, '..', 'TMIV2-YEDEK');
}

// Sunucu (ve gece yedeği, zamanlayıcı) uygulama kullanıcısıyla bağlıdır. Açıkken geri yükleme ya kilitte takılır ya da
// geri yüklenen veritabanına eski bağlantılar yazmayı sürdürür; "sunucu kapalı olmalı" yazmak yetmedi (kesinti tatbikatı D2).
export async function uygulamaOturumuSay(db: Pick<Db, 'tek'>, kullanici: string): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    'SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE usename = $1 AND datname = current_database() AND pid <> pg_backend_pid()',
    [kullanici],
  );
  return satir?.sayi ?? 0;
}

export function geriYuklemeEngeli(oturum: number): string | null {
  if (oturum === 0) return null;
  return `Sunucu açık: veritabanında uygulamanın ${String(oturum)} bağlantısı var. Sunucuyu (ve bekçi penceresini) kapatıp yeniden deneyin; `
    + 'hiçbir şey değişmedi.';
}

async function al(ortam: YedekOrtami): Promise<string> {
  const dizin = yedekKlasoru(process.env, kok);
  await mkdir(dizin, { recursive: true });
  const dosya = await yedekAl(ortam, dizin, 'elle', new Date());
  const yol = path.join(dizin, dosya.ad);
  const { size } = await stat(yol);
  console.log(`Yedek alındı: ${yol} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return yol;
}

async function geriYukle(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const dosya = argumanlar.find((a) => !a.startsWith('--'));
  if (dosya === undefined) throw new Error('Geri yüklenecek yedek dosyasını verin: npm run geri-yukle -- <dosya>');
  const yedek = path.resolve(dosya);
  if (!existsSync(yedek)) throw new Error(`Yedek dosyası yok: ${yedek}`);
  const vt = ortam.pg.veritabani;
  const denetim = gocBaglantisiAc({ ...ayarOku(), goc: gocKimligiOku() });
  try {
    const engel = geriYuklemeEngeli(await uygulamaOturumuSay(denetim, ortam.pg.kullanici));
    if (engel !== null) throw new Error(engel);
  } finally {
    await denetim.kapat();
  }
  if (!argumanlar.includes('--evet')) {
    console.log(`"${vt}" veritabanının bütün içeriği silinip ${yedek} yedeğiyle değiştirilecek. Sunucu kapalı olmalı.`);
    const satir = createInterface({ input: process.stdin, output: process.stdout });
    const cevap = await satir.question(`Onaylıyorsanız veritabanı adını yazın (${vt}): `);
    satir.close();
    if (cevap.trim() !== vt) { console.log('Vazgeçildi; hiçbir şey değişmedi.'); return; }
  }
  // Yanlış dosya seçilirse geri dönülebilsin: bugünkü hal önce yedeklenir.
  console.log('Önce bugünkü veritabanı yedekleniyor...');
  await al(ortam);
  const goc = { kullanici: process.env['TMIV2_PG_GOC_USER']?.trim() ?? '', parola: process.env['TMIV2_PG_GOC_PASSWORD'] ?? '' };
  await yedegiGeriYukle(ortam, goc, yedek, kok);
  console.log(`Geri yüklendi: ${vt} <- ${yedek}`);
  console.log('Kod yedekten yeniyse önce eski koda dönün; sonra "npm run goc" ve "npm run baslat".');
}

async function coz(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const [kaynak, hedef] = argumanlar;
  if (kaynak === undefined || hedef === undefined) throw new Error('Kullanım: npm run yedek-coz -- <şifreli yedek> <düz hedef dosya>');
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  await yedekSifresiniCoz(ortam.anahtar.anahtar, path.resolve(kaynak), path.resolve(hedef));
  console.log(`Açıldı: ${path.resolve(hedef)}. Düz dosya bütün veriyi şifresiz taşır; işiniz bitince silin.`);
}

const dogrudanKosuyor = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const [komut, ...argumanlar] = process.argv.slice(2);
  try {
    if (komut === 'anahtar') {
      console.log(`TMIV2_YEDEK_ANAHTARI=${randomBytes(32).toString('base64')}`);
      console.log('Bu satırı sunucunun .env dosyasına ekleyin ve bilgi işlemde ayrıca saklayın: anahtar kaybolursa yedekler açılmaz.');
      process.exit(0);
    }
    const ortam = yedekOrtamiOku();
    if (komut === 'al') await al(ortam);
    else if (komut === 'geri-yukle') await geriYukle(ortam, argumanlar);
    else if (komut === 'coz') await coz(ortam, argumanlar);
    else throw new Error('Kullanım: npm run yedek | npm run geri-yukle -- <dosya> | npm run yedek-anahtari | npm run yedek-coz -- <yedek> <hedef>');
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
