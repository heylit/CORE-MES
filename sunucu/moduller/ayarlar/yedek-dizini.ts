import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '#cekirdek/db.ts';
import { dogrulama } from '#cekirdek/hata.ts';
import type { YedekDiziniCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { ortamdanOku as guncellemeOrtami } from './guncelleme.ts';
import { ayarDegeriniOku, ayarDegeriniSil, ayarDegeriniYaz, ayarKilitle } from './sorgular.ts';
import { yedekOrtamiOku, type YedekOrtami } from './yedek.ts';

// Yedek klasörü ekrandan seçilir (kart #1205 eki; kullanıcı kararı: var olan ve yazılabilir her mutlak klasör). Ayar tanımı değildir:
// genel ayar listesinde görünmez, genel değiştirme ucu yazamaz; yalnız yedek işlemi olan (bayraklı yönetici) değiştirir.
// Boşsa sunucunun TMIV2_YEDEK_DIZINI değeri geçerlidir.
const ANAHTAR = 'yedek.dizin';
const DEGISTIR_YOLU = '/yedekler/dizin/degistir';
// Güncelleyici veritabanını okumadan çalışır; seçilen klasörü güncelleme klasöründeki bu dosyadan okur.
export const YEDEK_DIZINI_DOSYASI = 'yedek-dizini.json';

const mutlakMetin = (deger: unknown): string | null =>
  typeof deger === 'string' && deger.trim() !== '' && path.isAbsolute(deger.trim()) ? deger.trim() : null;

async function ayardakiDizin(db: Db): Promise<string | null> {
  const saklanan = await ayarDegeriniOku(db, ANAHTAR);
  return saklanan === null ? null : mutlakMetin(saklanan.deger);
}

// Geçerli yedek ortamı: ayar doluysa ayar, boşsa ortam.
export async function yedekOrtaminiKur(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<YedekOrtami> {
  const ortam = yedekOrtamiOku(env);
  const ayar = await ayardakiDizin(db);
  return ayar === null ? ortam : { ...ortam, dizin: ayar, kaynak: 'ayar' };
}

// Seçilen klasör gerçekten kullanılabilir olmalı: var, klasör ve sunucu servis hesabı oraya yazabiliyor. Yazma hakkı denenerek
// anlaşılır; Windows'ta izin listesi erişim bayrağından okunamaz.
async function klasoruDenetle(dizin: string): Promise<void> {
  if (!path.isAbsolute(dizin)) throw dogrulama('Klasörün tam adresini sürücü harfiyle yazın (örnek: D:\\TMIV2-YEDEK).', 'dizin');
  const bilgi = await stat(dizin).catch(() => null);
  if (bilgi === null || !bilgi.isDirectory()) throw dogrulama('Klasör sunucuda bulunamadı.', 'dizin');
  const deneme = path.join(dizin, `.tmiv2-yazma-denemesi-${randomUUID()}`);
  try {
    await writeFile(deneme, '');
  } catch {
    throw dogrulama('Sunucu bu klasöre yazamıyor; servis hesabına yazma izni verin.', 'dizin');
  } finally {
    await rm(deneme, { force: true });
  }
}

// Dosya önce yarım adla yazılır, sonra taşınır: güncelleyici yarım dosya okumasın. Güncelleme klasörü yoksa yazılacak yer yoktur.
async function guncellemeDosyasiniYaz(dizin: string | null, env: NodeJS.ProcessEnv): Promise<void> {
  const hedef = guncellemeOrtami(env).dizin;
  if (hedef === null || !path.isAbsolute(hedef)) return;
  const bilgi = await stat(hedef).catch(() => null);
  if (bilgi === null || !bilgi.isDirectory()) return;
  const yol = path.join(hedef, YEDEK_DIZINI_DOSYASI);
  await writeFile(`${yol}.yarim`, `${JSON.stringify({ dizin })}\n`);
  await rename(`${yol}.yarim`, yol);
}

const gorunum = (o: YedekOrtami): YedekDiziniCevabi => ({ dizin: o.dizin, kaynak: o.kaynak });

export async function yedekDiziniDegistir(
  db: Db, kisiId: number, dizin: string | null, env: NodeJS.ProcessEnv = process.env,
): Promise<YedekDiziniCevabi> {
  if (dizin !== null) await klasoruDenetle(dizin);
  // Eski değer kilitten sonra okunur: aynı anda iki değiştirmede ikincinin kaydı birincinin yazdığını eski değer olarak taşır.
  await ayarKilitle(db, ANAHTAR);
  const eski = await ayardakiDizin(db);
  if (eski !== dizin) {
    if (dizin === null) await ayarDegeriniSil(db, ANAHTAR);
    else await ayarDegeriniYaz(db, ANAHTAR, dizin, kisiId);
    await denetimYaz(db, {
      kisiId, yontem: 'POST', yol: DEGISTIR_YOLU, parametre: {}, govde: { eski, yeni: dizin }, modul: 'ayarlar', yetki: 'ayarlar.yedek-indir',
    });
  }
  // Dosya yazılamazsa komut düşer: güncelleyici ile sunucu farklı klasör bilmesin.
  await guncellemeDosyasiniYaz(dizin, env);
  return gorunum(await yedekOrtaminiKur(db, env));
}

// Gece işi her turda dosyayı veritabanıyla eşitler: güncelleme klasörü sonradan tanımlanırsa ya da dosya silinirse yeniden yazılır.
export async function guncellemeDosyasiniEsitle(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const dizin = await ayardakiDizin(db);
  const hedef = guncellemeOrtami(env).dizin;
  if (hedef === null || !path.isAbsolute(hedef)) return;
  const metin = await readFile(path.join(hedef, YEDEK_DIZINI_DOSYASI), 'utf8').catch(() => null);
  if (metin !== null && metin === `${JSON.stringify({ dizin })}\n`) return;
  await guncellemeDosyasiniYaz(dizin, env);
}

// Güncelleyicinin okuması (veritabanısız): güncelleme klasöründeki dosyada seçilmiş klasör varsa o, yoksa TMIV2_YEDEK_DIZINI.
// Bozuk ya da okunamayan dosya ortama düşer; klasörün varlığını çağıran denetler.
export async function yedekDizini(guncellemeDizini: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const metin = await readFile(path.join(guncellemeDizini, YEDEK_DIZINI_DOSYASI), 'utf8').catch(() => null);
  if (metin !== null) {
    try {
      const secilen = mutlakMetin((JSON.parse(metin) as { dizin?: unknown }).dizin);
      if (secilen !== null) return secilen;
    } catch {
      // Bozuk dosya: ortama düşülür.
    }
  }
  return mutlakMetin(env['TMIV2_YEDEK_DIZINI']);
}
