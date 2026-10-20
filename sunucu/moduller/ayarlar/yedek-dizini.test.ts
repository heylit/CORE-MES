import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { YedekDiziniCevabi, YedeklerCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { YEDEK_DIZINI_DOSYASI, yedekDizini } from './disari.ts';
import { yedekAdi } from './kurallar.ts';
import { guncellemeDosyasiniEsitle } from './yedek-dizini.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/yedekler/dizin/degistir';

describe('ayarlar yedek klasörü seçimi (gerçek PostgreSQL, geçici dizin)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kok = '';
  let yonetici = '';
  let yoneticiId = 0;
  const bayraksizlar: { rol: { id: number; ad: string }; cerez: string }[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez }, payload: payload as object | undefined });
  const degistir = (dizin: unknown, cerez: string | null = yonetici) => istek(cerez, 'POST', YOL, { dizin });
  const liste = async (): Promise<YedeklerCevabi> => (await istek(yonetici, 'GET', '/yedekler')).json() as YedeklerCevabi;
  const kayitlar = () => vt().sorgu<{ kisi_id: number; govde: unknown }>(
    "SELECT kisi_id, govde FROM denetim_kaydi WHERE yol = $1 AND govde ? 'eski' ORDER BY id", [YOL],
  );

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_yedek_dizini');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    const roller = ((await istek(yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string; yonetici: boolean | null }[] }).roller;
    for (const rol of roller.filter((r) => r.yonetici !== true)) {
      const kullaniciAdi = `rol-${String(rol.id)}`;
      await ortam.vt.tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rol.id);
        for (const r of kisi.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      });
      bayraksizlar.push({ rol, cerez: await girisCerezi(kullaniciAdi) });
    }
  });

  after(async () => {
    await ortam?.kaldir();
    if (kok !== '') await rm(kok, { recursive: true, force: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    delete process.env['TMIV2_GUNCELLEME_DIZINI'];
    delete process.env['TMIV2_YEDEK_ANAHTARI'];
  });

  beforeEach(async () => {
    if (kok !== '') await rm(kok, { recursive: true, force: true });
    kok = await mkdtemp(path.join(tmpdir(), 'tmiv2-yedek-dizini-'));
    for (const ad of ['ortam', 'secilen', 'guncelleme']) await mkdir(path.join(kok, ad));
    process.env['TMIV2_YEDEK_DIZINI'] = path.join(kok, 'ortam');
    process.env['TMIV2_GUNCELLEME_DIZINI'] = path.join(kok, 'guncelleme');
    // Yedek açık sayılsın diye yalnız test anahtarı.
    process.env['TMIV2_YEDEK_ANAHTARI'] = Buffer.alloc(32, 7).toString('base64');
    assert.equal((await degistir(null)).statusCode, 200, 'önceki testin seçimi kaldırılır');
  });

  test('klasörü yalnız yönetici değiştirir; bayraksız hiçbir rol değiştiremez; oturumsuz istek 401 alır', async () => {
    assert.equal(bayraksizlar.length > 0, true, 'bütün işlemleri vermeyen rol yok');
    for (const { rol, cerez } of bayraksizlar) {
      assert.equal((await degistir(path.join(kok, 'secilen'), cerez)).statusCode, 403, rol.ad);
    }
    assert.equal((await degistir(path.join(kok, 'secilen'), null)).statusCode, 401);
    assert.equal((await liste()).kaynak, 'ortam', 'reddedilen istek klasörü değiştirmedi');
    assert.equal((await degistir(path.join(kok, 'secilen'))).statusCode, 200);
  });

  test('seçilen klasör ortamın yerine geçer: liste, yedekler ve güncelleyicinin dosyası onu gösterir; kaldırınca ortama döner', async () => {
    const secilen = path.join(kok, 'secilen');
    const ad = yedekAdi(String(process.env['TMIV2_PG_DATABASE']), 'gece', new Date('2026-10-13T23:00:00Z'));
    await writeFile(path.join(secilen, ad), 'yedek');
    let cevap = await degistir(secilen);
    assert.deepEqual(cevap.json() as YedekDiziniCevabi, { dizin: secilen, kaynak: 'ayar' });
    const sonra = await liste();
    assert.deepEqual({ dizin: sonra.dizin, kaynak: sonra.kaynak, durum: sonra.durum }, { dizin: secilen, kaynak: 'ayar', durum: 'acik' });
    assert.deepEqual(sonra.yedekler.map((y) => y.ad), [ad]);
    assert.equal(await yedekDizini(path.join(kok, 'guncelleme'), {}), secilen, 'güncelleyici seçileni okur');
    cevap = await degistir(null);
    assert.deepEqual(cevap.json() as YedekDiziniCevabi, { dizin: path.join(kok, 'ortam'), kaynak: 'ortam' });
    assert.deepEqual((await liste()).yedekler, []);
    assert.equal(await yedekDizini(path.join(kok, 'guncelleme'), { TMIV2_YEDEK_DIZINI: path.join(kok, 'ortam') }), path.join(kok, 'ortam'));
    // Ortamda da yoksa yedek kapalıdır.
    delete process.env['TMIV2_YEDEK_DIZINI'];
    assert.deepEqual(await liste().then((l) => ({ dizin: l.dizin, kaynak: l.kaynak, durum: l.durum })), { dizin: null, kaynak: null, durum: 'dizin-yok' });
  });

  test('her değişiklik kişi, eski ve yeni klasörle denetim kaydına düşer; aynı klasörü yeniden seçmek kayıt bırakmaz', async () => {
    const secilen = path.join(kok, 'secilen');
    const once = (await kayitlar()).length;
    await degistir(secilen);
    await degistir(secilen);
    await degistir(null);
    const yeni = (await kayitlar()).slice(once);
    assert.deepEqual(yeni, [
      { kisi_id: yoneticiId, govde: { eski: null, yeni: secilen } },
      { kisi_id: yoneticiId, govde: { eski: secilen, yeni: null } },
    ]);
  });

  test('göreli, olmayan, dosya olan ya da boş yol reddedilir ve hiçbir şey değişmez; genel ayar ucu bu anahtara yazamaz', async () => {
    const dosya = path.join(kok, 'dosya.txt');
    await writeFile(dosya, 'x');
    for (const [ad, deger, kod] of [
      ['göreli', 'yedekler', 400], ['olmayan', path.join(kok, 'yok'), 400], ['dosya', dosya, 400], ['boş', '   ', 400],
      ['uzun', `/${'a'.repeat(600)}`, 400], ['sayı', 5, 400],
    ] as const) {
      const cevap = await degistir(deger);
      assert.equal(cevap.statusCode, kod, `${ad}: ${cevap.body}`);
    }
    assert.equal((await liste()).kaynak, 'ortam');
    assert.deepEqual(await readdir(path.join(kok, 'secilen')), [], 'yazma denemesi dosyası kalmadı');
    assert.equal((await istek(yonetici, 'POST', '/ayarlar/yedek.dizin/degistir', { deger: path.join(kok, 'secilen') })).statusCode, 404);
    const ayarlar = ((await istek(yonetici, 'GET', '/ayarlar')).json() as { ayarlar: { anahtar: string }[] }).ayarlar;
    assert.equal(ayarlar.some((a) => a.anahtar === 'yedek.dizin'), false);
  });

  test('güncelleyicinin dosyası bozuksa ortam okunur; silinen dosyayı gece işinin eşitlemesi yeniden yazar', async () => {
    const guncelleme = path.join(kok, 'guncelleme');
    const ortamDizin = { TMIV2_YEDEK_DIZINI: path.join(kok, 'ortam') };
    await writeFile(path.join(guncelleme, YEDEK_DIZINI_DOSYASI), '{bozuk');
    assert.equal(await yedekDizini(guncelleme, ortamDizin), path.join(kok, 'ortam'));
    await writeFile(path.join(guncelleme, YEDEK_DIZINI_DOSYASI), JSON.stringify({ dizin: 'goreli' }));
    assert.equal(await yedekDizini(guncelleme, ortamDizin), path.join(kok, 'ortam'), 'göreli yol kabul edilmez');
    assert.equal(await yedekDizini(guncelleme, {}), null);
    await degistir(path.join(kok, 'secilen'));
    await rm(path.join(guncelleme, YEDEK_DIZINI_DOSYASI));
    assert.equal(await yedekDizini(guncelleme, ortamDizin), path.join(kok, 'ortam'), 'dosya yokken ortam');
    await vt().tx((db) => guncellemeDosyasiniEsitle(db));
    assert.equal(await yedekDizini(guncelleme, ortamDizin), path.join(kok, 'secilen'));
    assert.deepEqual((await readdir(guncelleme)).sort(), [YEDEK_DIZINI_DOSYASI], 'yarım dosya kalmadı');
  });
});
