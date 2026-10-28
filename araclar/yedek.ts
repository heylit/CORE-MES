import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from '#cekirdek/ayar.ts';
import { gocBaglantisiAc } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import {
  MEDYA_AYNA_KLASORU, medyaAynala, medyaDiziniOku, medyaGeriYukle, yedekAl, yedekOrtamiOku, yedekSifresiniCoz, type YedekOrtami,
} from '../sunucu/moduller/ayarlar/disari.ts';
import { yedegiGeriYukle } from './guncelleyici.ts';

// Komut satırından veritabanı yedeği ve geri yükleme: `npm run yedek`, `npm run geri-yukle -- <dosya>`; yeni yedek anahtarı
// `npm run yedek-anahtari` (yalnız ekrana yazar, hiçbir yere kaydetmez: anahtarı bilgi işlem saklar). Elle pg_restore için şifreli
// yedek düz dosyaya açılır: `npm run yedek-coz -- <yedek> <hedef>`. Talimat medyası (1004 a, 1008 a): `npm run yedek -- medya
// [--hedef <klasör>]` aynayı elle ya da ikinci diske (haftalık dış kopya) yazar, `npm run geri-yukle-medya [-- --kaynak <klasör>]`
// aynadan eksik dosyaları geri yazar; veritabanı geri yüklemesi de ardından medyayı geri yazar. Sunucu ve yönetici
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

function secenek(argumanlar: readonly string[], ad: string): string | null {
  const sira = argumanlar.indexOf(ad);
  if (sira === -1) return null;
  const deger = argumanlar[sira + 1];
  if (deger === undefined || deger.startsWith('--')) throw new Error(`${ad} için klasör verin.`);
  return path.resolve(deger);
}

function medyaIste(ortam: YedekOrtami): { medya: string; anahtar: Buffer } {
  const medya = medyaDiziniOku();
  if (medya === null) throw new Error('Talimat medyası klasörü yok: .env dosyasında TMIV2_MEDYA_DIZINI mutlak yol olmalı.');
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  return { medya, anahtar: ortam.anahtar.anahtar };
}

// Komut satırının medya işleri veritabanının denetim kaydına yazamaz (sunucu kapalı olabilir); her çalıştırma aynanın yanındaki
// kayıt dosyasına bir satır bırakır: ne zaman, hangi işletim sistemi kullanıcısı, hangi komut, sonuç.
async function medyaKaydiYaz(yedekDizini: string, komut: string, sonuc: string): Promise<void> {
  const kullanici = process.env['USERNAME'] ?? process.env['USER'] ?? '?';
  const satir = `${new Date().toISOString()}\t${kullanici}\t${komut}\t${sonuc}\n`;
  await mkdir(path.join(yedekDizini, MEDYA_AYNA_KLASORU), { recursive: true });
  await appendFile(path.join(yedekDizini, MEDYA_AYNA_KLASORU, 'islem-kaydi.txt'), satir);
}

const konsolGunlugu = { uyar: (m: string) => { console.warn(m); }, hata: (m: string) => { console.error(m); } };

async function medyaAl(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const { medya, anahtar } = medyaIste(ortam);
  const hedef = secenek(argumanlar, '--hedef') ?? yedekKlasoru(process.env, kok);
  await mkdir(hedef, { recursive: true });
  const s = await medyaAynala(anahtar, medya, hedef, new Date(), konsolGunlugu);
  const ozet = `kopyalanan ${String(s.kopyalanan)} (${(s.kopyalananBayt / 1024 / 1024).toFixed(1)} MB), zaten var ${String(s.zatenVar)}, `
    + `silindi işaretlenen ${String(s.silindiIsaretlenen)}, 30 günü geçip silinen ${String(s.silinen)}, bozuk ${String(s.bozuk.length)}`;
  await medyaKaydiYaz(hedef, 'medya-ayna', ozet);
  console.log(`Medya aynalandı: ${path.join(hedef, MEDYA_AYNA_KLASORU)}; ${ozet}.`);
  if (s.bozuk.length > 0) {
    console.error(`Özetiyle tutmayan medya (aynaya alınmadı): ${s.bozuk.join(', ')}`);
    process.exitCode = 1;
  }
}

async function medyaGeriYaz(ortam: YedekOrtami, kaynak: string): Promise<void> {
  const { medya, anahtar } = medyaIste(ortam);
  if (!existsSync(path.join(kaynak, MEDYA_AYNA_KLASORU))) {
    throw new Error(`Medya aynası yok: ${path.join(kaynak, MEDYA_AYNA_KLASORU)}. Aynanın bulunduğu klasörü --kaynak ile verin.`);
  }
  const s = await medyaGeriYukle(anahtar, kaynak, medya);
  const ozet = `yazılan ${String(s.yazilan)}, zaten var ${String(s.zatenVar)}, açılamayan ${String(s.bozuk.length)}`;
  await medyaKaydiYaz(kaynak, 'medya-geri-yukle', ozet);
  console.log(`Medya geri yüklendi: ${medya} <- ${path.join(kaynak, MEDYA_AYNA_KLASORU)}; ${ozet}.`);
  if (s.bozuk.length > 0) {
    console.error(`Açılamayan ya da özetiyle tutmayan medya (yazılmadı): ${s.bozuk.join(', ')}. Anahtarı ve aynayı denetleyin.`);
    process.exitCode = 1;
  }
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
  // Önce veritabanı, sonra medya: geri gelen künyelerin dosyası aynadan tamamlanır. Dump elle başka yere kopyalanmış olabilir;
  // ayna her zaman yedek klasöründedir.
  if (medyaDiziniOku() !== null) await medyaGeriYaz(ortam, yedekKlasoru(process.env, kok));
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
    if (komut === 'al' && argumanlar[0] === 'medya') await medyaAl(ortam, argumanlar.slice(1));
    else if (komut === 'al') await al(ortam);
    else if (komut === 'medya-geri-yukle') await medyaGeriYaz(ortam, secenek(argumanlar, '--kaynak') ?? yedekKlasoru(process.env, kok));
    else if (komut === 'geri-yukle') await geriYukle(ortam, argumanlar);
    else if (komut === 'coz') await coz(ortam, argumanlar);
    else {
      throw new Error('Kullanım: npm run yedek | npm run yedek -- medya [--hedef <klasör>] | npm run geri-yukle -- <dosya> | '
        + 'npm run geri-yukle-medya [-- --kaynak <klasör>] | npm run yedek-anahtari | npm run yedek-coz -- <yedek> <hedef>');
    }
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
