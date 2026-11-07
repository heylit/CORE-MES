import assert from 'node:assert/strict';
import { after, before, describe, it, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur } from '#cekirdek/uygulama.ts';
import { acikOturumlarCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { CEREZ_ADI, tarayiciOzeti } from './kurallar.ts';
import { kimlikCozucu } from './servis.ts';
import { oturumUclari } from './uclar.ts';

describe('tarayıcı özeti (2226-7 a)', () => {
  it('yaygın tarayıcı ve sistemler kısa adla; bilinmeyen ve boş metin', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
    assert.equal(tarayiciOzeti(chrome), 'Chrome · Windows');
    assert.equal(tarayiciOzeti(`${chrome} Edg/146.0.0.0`), 'Edge · Windows');
    assert.equal(tarayiciOzeti('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/146.0 Mobile Safari/537.36'), 'Chrome · Android');
    assert.equal(tarayiciOzeti('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari · iOS');
    assert.equal(tarayiciOzeti('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'), 'Firefox · Linux');
    assert.equal(tarayiciOzeti('curl/8.0'), 'Diğer tarayıcı');
    assert.equal(tarayiciOzeti(null), null);
    assert.equal(tarayiciOzeti('  '), null);
  });
});

const PAROLA = 'dogru-parola-1';

describe('açık oturumlarım ve diğerlerini kapat (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const giris = async (kullaniciAdi: string, tarayici: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', headers: { 'user-agent': tarayici }, payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const liste = async (cerez: string) => {
    const c = await app.inject({ method: 'GET', url: '/api/hesabim/oturumlar', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200);
    return acikOturumlarCevabi.parse(c.json()).oturumlar;
  };
  const durum = async (cerez: string) => (await app.inject({ method: 'GET', url: '/api/hesabim/oturumlar', headers: { cookie: cerez } })).statusCode;

  before(async () => {
    ortam = await testVeritabaniKur('oturum_acik_oturumlar');
    app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, oturumUclari(), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt) });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'ao-kisi', parola: PAROLA }));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'ao-baska', parola: PAROLA }));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('kişi yalnız kendi açık oturumlarını görür; bu cihaz işaretlidir, tam tarayıcı metni ve adres gitmez', async () => {
    const bilgisayar = await giris('ao-kisi', 'Mozilla/5.0 (Windows NT 10.0) Chrome/146.0 Safari/537.36');
    await giris('ao-kisi', 'Mozilla/5.0 (Linux; Android 14) Chrome/146.0 Mobile Safari/537.36');
    await giris('ao-baska', 'Mozilla/5.0 (Windows NT 10.0) Chrome/146.0 Safari/537.36');
    assert.ok(bilgisayar.startsWith(`${CEREZ_ADI}=`));

    const oturumlar = await liste(bilgisayar);
    assert.equal(oturumlar.length, 2);
    assert.deepEqual(oturumlar.filter((o) => o.buCihaz).map((o) => o.tarayici), ['Chrome · Windows']);
    assert.deepEqual(oturumlar.filter((o) => !o.buCihaz).map((o) => o.tarayici), ['Chrome · Android']);
    assert.equal(oturumlar.every((o) => !o.cihazaBagli), true);
    const ham = JSON.stringify(oturumlar);
    assert.equal(ham.includes('Mozilla'), false);
    assert.equal(ham.includes('127.0.0.1'), false);
  });

  test('diğerlerini kapat: bu cihaz açık kalır, öbürleri 401 olur, başkasının oturumu etkilenmez', async () => {
    const a = await giris('ao-kisi', 'A');
    const b = await giris('ao-kisi', 'B');
    const baska = await giris('ao-baska', 'C');
    const c = await app.inject({ method: 'POST', url: '/api/hesabim/oturumlar/digerlerini-kapat', headers: { cookie: a } });
    assert.equal(c.statusCode, 200);
    assert.ok(c.json().kapanan >= 1);
    assert.equal(await durum(a), 200);
    assert.equal(await durum(b), 401);
    assert.equal(await durum(baska), 200);
    assert.deepEqual((await liste(a)).map((o) => o.buCihaz), [true]);
  });

  test('oturumsuz istek 401', async () => {
    assert.equal(await durum(''), 401);
    const c = await app.inject({ method: 'POST', url: '/api/hesabim/oturumlar/digerlerini-kapat' });
    assert.equal(c.statusCode, 401);
  });
});
