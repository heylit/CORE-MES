import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import {
  MEDYA_SILINEN_SAKLAMA_GUN, YEDEK_EN_AZ_BOS_BAYT, medyaAynasiGerekliMi, medyaOzetiMi, medyaYeriEksigi, medyaYeriTutarMi,
  silinenMedyaSilinsinMi, yedekAdi, yedekAnahtariCoz,
} from './kurallar.ts';
import { dosyasiOlmayanlar, geceMedyaTuru, medyaAynala, medyaDiziniOku, medyaGeriYukle } from './medya-yedek.ts';
import type { YedekOrtami } from './yedek.ts';

// Yalnız test anahtarı; gerçek anahtar bilgi işlemdedir ve depoya girmez.
const ANAHTAR = Buffer.alloc(32, 7);
const BASKA_ANAHTAR = Buffer.alloc(32, 9);
const GUN = 24 * 60 * 60 * 1000;
const VT = 'tmiv2';
const BOL_YER = async (): Promise<number> => 100 * 1024 ** 3;

const ozetOf = (icerik: Buffer): string => createHash('sha256').update(icerik).digest('hex');
const altYol = (ozet: string): string[] => [ozet.slice(0, 2), ozet.slice(2, 4), ozet];

const hatalar: string[] = [];
const gunluk: Gunluk = { uyar: () => undefined, hata: (m) => { hatalar.push(m); } };

let kok: string;
let medya: string;
let yedek: string;

async function medyaYaz(icerik: string): Promise<string> {
  const tampon = Buffer.from(icerik, 'utf8');
  const ozet = ozetOf(tampon);
  await mkdir(path.join(medya, ...altYol(ozet).slice(0, 2)), { recursive: true });
  await writeFile(path.join(medya, ...altYol(ozet)), tampon);
  return ozet;
}

const aynaYolu = (ozet: string): string => path.join(yedek, 'medya', ...altYol(ozet));

async function varMi(yol: string): Promise<boolean> {
  return stat(yol).then(() => true, () => false);
}

// Ayna ya da geri yüklenen medya dosyasının baytları (kaynak dosya değil).
async function baytOku(yol: string): Promise<Buffer> {
  const dosya = await open(yol, 'r');
  try {
    const tampon = Buffer.alloc((await dosya.stat()).size);
    await dosya.read(tampon, 0, tampon.length, 0);
    return tampon;
  } finally {
    await dosya.close();
  }
}

const metinOku = async (yol: string): Promise<string> => (await baytOku(yol)).toString('utf8');

beforeEach(async () => {
  kok = await mkdtemp(path.join(tmpdir(), 'tmiv2-medya-yedek-'));
  medya = path.join(kok, 'medya');
  yedek = path.join(kok, 'yedek');
  await mkdir(medya);
  await mkdir(yedek);
  hatalar.length = 0;
});

afterEach(async () => {
  await rm(kok, { recursive: true, force: true });
});

describe('medya aynası kuralları (saf)', () => {
  test('medya adı 64 küçük hex özettir ve ilk dört hanesi klasörlerle tutar', () => {
    const ozet = 'ab'.repeat(32);
    assert.equal(medyaOzetiMi(ozet), true);
    assert.equal(medyaOzetiMi(ozet.toUpperCase()), false);
    assert.equal(medyaOzetiMi(`${ozet}.tmp`), false);
    assert.equal(medyaOzetiMi(ozet.slice(1)), false);
    assert.equal(medyaYeriTutarMi('ab', 'ab', ozet), true);
    assert.equal(medyaYeriTutarMi('ab', 'cd', ozet), false);
  });

  test('silinen medya 30 gün aynada kalır, sonra silinir', () => {
    const silinme = new Date('2026-10-01T00:00:00Z');
    assert.equal(MEDYA_SILINEN_SAKLAMA_GUN, 30);
    assert.equal(silinenMedyaSilinsinMi(silinme, new Date(silinme.getTime() + 30 * GUN)), false);
    assert.equal(silinenMedyaSilinsinMi(silinme, new Date(silinme.getTime() + 30 * GUN + 1)), true);
  });

  test('ayna gece yedeğinden sonra koşar: gece yedeği yoksa ya da ayna ondan yeniyse gerekmez', () => {
    const gece = new Date('2026-10-28T23:00:00Z');
    assert.equal(medyaAynasiGerekliMi(null, null), false);
    assert.equal(medyaAynasiGerekliMi(gece, null), true);
    assert.equal(medyaAynasiGerekliMi(gece, new Date(gece.getTime() - 1)), true);
    assert.equal(medyaAynasiGerekliMi(gece, new Date(gece.getTime() + 1)), false);
  });

  test('ayna yeni medyanın yanında 1 GB boş yer bırakır; boş yer bilinmiyorsa denetlenmez', () => {
    assert.equal(medyaYeriEksigi(null, 10 * YEDEK_EN_AZ_BOS_BAYT), null);
    assert.equal(medyaYeriEksigi(2 * YEDEK_EN_AZ_BOS_BAYT, YEDEK_EN_AZ_BOS_BAYT), null);
    assert.match(medyaYeriEksigi(2 * YEDEK_EN_AZ_BOS_BAYT - 1, YEDEK_EN_AZ_BOS_BAYT) ?? '', /medya için yer yetmiyor/);
  });

  test('medya klasörü yalnız mutlak yolla açılır', () => {
    assert.equal(medyaDiziniOku({}), null);
    assert.equal(medyaDiziniOku({ TMIV2_MEDYA_DIZINI: '  ' }), null);
    assert.equal(medyaDiziniOku({ TMIV2_MEDYA_DIZINI: 'medya' }), null);
    assert.equal(medyaDiziniOku({ TMIV2_MEDYA_DIZINI: kok }), kok);
  });
});

describe('medya aynası', () => {
  test('yalnız yeni özetler kopyalanır, şifreli yazılır; geçici ve yabancı dosya atlanır', async () => {
    const a = await medyaYaz('resim-a');
    const b = await medyaYaz('video-b');
    const klasor = path.join(medya, ...altYol(a).slice(0, 2));
    await writeFile(path.join(klasor, `.${a}.x1.tmp`), 'yarim');
    await writeFile(path.join(klasor, 'not.txt'), 'yabanci');
    await writeFile(path.join(medya, 'kok.txt'), 'yabanci');

    const ilk = await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    assert.equal(ilk.kopyalanan, 2);
    assert.equal(ilk.kopyalananBayt, 'resim-a'.length + 'video-b'.length);
    const sifreli = await baytOku(aynaYolu(a));
    assert.equal(sifreli.subarray(0, 8).toString('ascii'), 'TMIV2Y1\n');
    assert.equal(sifreli.includes(Buffer.from('resim-a')), false, 'düz içerik aynada görünmemeli');
    assert.deepEqual((await readdir(path.join(yedek, 'medya', ...altYol(a).slice(0, 2)))).sort(), [a].sort());

    await medyaYaz('resim-c');
    const ikinci = await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    assert.equal(ikinci.kopyalanan, 1, 'yalnız yeni dosya');
    assert.equal(ikinci.zatenVar, 2);
    assert.equal(await varMi(aynaYolu(b)), true);
  });

  test('içeriği adıyla tutmayan dosya aynaya alınmaz ve günlüğe düşer', async () => {
    const ozet = await medyaYaz('saglam');
    await writeFile(path.join(medya, ...altYol(ozet)), 'bozulmus');
    const sonuc = await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    assert.deepEqual(sonuc.bozuk, [ozet]);
    assert.equal(sonuc.kopyalanan, 0);
    assert.equal(await varMi(aynaYolu(ozet)), false);
    assert.equal((await readdir(path.dirname(aynaYolu(ozet)))).length, 0, 'yarım dosya kalmamalı');
    assert.equal(hatalar.length, 1);
  });

  test('kaynaktan silinen medya aynada 30 gün işaretli kalır, sonra silinir; kaynağa dönen işaretten çıkar', async () => {
    const ozet = await medyaYaz('silinecek');
    const donen = await medyaYaz('geri-donecek');
    const t0 = new Date('2026-10-01T00:00:00Z');
    await medyaAynala(ANAHTAR, medya, yedek, t0, gunluk, BOL_YER);
    await rm(path.join(medya, ...altYol(ozet)));
    await rm(path.join(medya, ...altYol(donen)));

    const isaret = await medyaAynala(ANAHTAR, medya, yedek, t0, gunluk, BOL_YER);
    assert.equal(isaret.silindiIsaretlenen, 2);
    assert.equal(await varMi(aynaYolu(ozet)), false);
    assert.equal(await varMi(`${aynaYolu(ozet)}.silindi`), true);
    // Dosya zamanı işaret anıdır; test zamanı dosyaya yazılan zamanla aynı saatten sayılsın.
    await utimes(`${aynaYolu(ozet)}.silindi`, t0, t0);

    await medyaYaz('geri-donecek');
    const gun29 = await medyaAynala(ANAHTAR, medya, yedek, new Date(t0.getTime() + 29 * GUN), gunluk, BOL_YER);
    assert.equal(gun29.silinen, 0);
    assert.equal(gun29.geriGelen, 1);
    assert.equal(gun29.kopyalanan, 0, 'dönen dosya yeniden kopyalanmaz');
    assert.equal(await varMi(aynaYolu(donen)), true);

    const gun31 = await medyaAynala(ANAHTAR, medya, yedek, new Date(t0.getTime() + 31 * GUN), gunluk, BOL_YER);
    assert.equal(gun31.silinen, 1);
    assert.equal(await varMi(`${aynaYolu(ozet)}.silindi`), false);
    assert.equal(await varMi(aynaYolu(donen)), true);
  });

  test('yer yetmiyorsa hiçbir dosya kopyalanmaz', async () => {
    const ozet = await medyaYaz('buyuk');
    await assert.rejects(medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, async () => YEDEK_EN_AZ_BOS_BAYT), /yer yetmiyor/);
    assert.equal(await varMi(aynaYolu(ozet)), false);
  });
});

describe('medya geri yükleme', () => {
  test('aynadaki ve 30 günlük silinenlerdeki eksik özetler yazılır; var olana dokunulmaz', async () => {
    const a = await medyaYaz('resim-a');
    const b = await medyaYaz('resim-b');
    const kalan = await medyaYaz('kalan');
    await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    await rm(path.join(medya, ...altYol(b)));
    await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    await rm(path.join(medya, ...altYol(a)));
    await writeFile(path.join(medya, ...altYol(kalan)), 'kalan');

    const sonuc = await medyaGeriYukle(ANAHTAR, yedek, medya);
    assert.deepEqual(sonuc, { yazilan: 2, zatenVar: 1, bozuk: [] });
    assert.equal(await metinOku(path.join(medya, ...altYol(a))), 'resim-a');
    assert.equal(await metinOku(path.join(medya, ...altYol(b))), 'resim-b', 'işaretli (silinmiş) dosya da gelir');
    assert.equal((await readdir(path.dirname(path.join(medya, ...altYol(a))))).some((ad) => ad.endsWith('.tmp')), false);
  });

  test('yanlış anahtarla hiçbir dosya yazılmaz, geçici dosya kalmaz', async () => {
    const a = await medyaYaz('resim-a');
    await medyaAynala(ANAHTAR, medya, yedek, new Date(), gunluk, BOL_YER);
    await rm(path.join(medya, ...altYol(a)));
    const sonuc = await medyaGeriYukle(BASKA_ANAHTAR, yedek, medya);
    assert.deepEqual(sonuc, { yazilan: 0, zatenVar: 0, bozuk: [a] });
    assert.deepEqual(await readdir(path.join(medya, ...altYol(a).slice(0, 2))), []);
  });
});

describe('gece medya turu', () => {
  const db = { tek: async () => null } as unknown as Db;
  const ortam = (): YedekOrtami => ({
    dizin: yedek, kaynak: 'ortam',
    pg: { host: 'localhost', port: 5432, kullanici: 'u', parola: '', veritabani: VT },
    pgDump: { dosya: 'pg_dump', onEk: [] },
    anahtar: yedekAnahtariCoz(ANAHTAR.toString('base64')),
  });

  test('gece yedeğinden sonra bir kez koşar; medya klasörü ya da gece yedeği yoksa koşmaz', async () => {
    const ozet = await medyaYaz('gece');
    const simdi = new Date('2026-10-28T23:30:00Z');
    await geceMedyaTuru(db, gunluk, ortam(), simdi, {});
    await geceMedyaTuru(db, gunluk, ortam(), simdi, { TMIV2_MEDYA_DIZINI: medya });
    assert.equal(await varMi(aynaYolu(ozet)), false, 'gece yedeği yokken ayna beklenir');

    await writeFile(path.join(yedek, yedekAdi(VT, 'gece', new Date('2026-10-28T23:00:00Z'))), '');
    await geceMedyaTuru(db, gunluk, ortam(), simdi, { TMIV2_MEDYA_DIZINI: medya });
    assert.equal(await varMi(aynaYolu(ozet)), true);

    const ikinci = await medyaYaz('ikinci');
    await geceMedyaTuru(db, gunluk, ortam(), new Date(simdi.getTime() + 600_000), { TMIV2_MEDYA_DIZINI: medya });
    assert.equal(await varMi(aynaYolu(ikinci)), false, 'aynı gece yedeğinden sonra ikinci tur yok');

    await writeFile(path.join(yedek, yedekAdi(VT, 'gece', new Date('2026-10-29T23:00:00Z'))), '');
    await geceMedyaTuru(db, gunluk, ortam(), new Date('2026-10-29T23:30:00Z'), { TMIV2_MEDYA_DIZINI: medya });
    assert.equal(await varMi(aynaYolu(ikinci)), true);
  });
});

describe('künyesi olup dosyası olmayan medya', () => {
  test('medya klasöründe dosyası olmayan özetler döner', async () => {
    const var1 = await medyaYaz('var');
    const yok = 'ff'.repeat(32);
    assert.deepEqual(await dosyasiOlmayanlar(medya, [var1, yok]), [yok]);
    assert.deepEqual(await dosyasiOlmayanlar(medya, []), []);
  });
});
