import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Db, Veritabani } from './db.ts';
import { bulunamadi } from './hata.ts';
import { ikiliCevap, ikiliCevapYaDaBos, uc, uclariKaydet } from './uc.ts';
import type { Denetle, DenetimGirdisi, Kimlik, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const okuyan: Kimlik = async () => ({ id: 2, ad: 'okuyan', islemler: ['kisiler.oku'] });
const yetkisiz: Kimlik = async () => ({ id: 3, ad: 'yetkisiz', islemler: [] });

function kur(uclar: readonly Uc[], kimlik: Kimlik = okuyan, denetle?: Denetle): { app: FastifyInstance; gunluk: string[] } {
  const gunluk: string[] = [];
  const db: Db = {
    sorgu: async <T>(): Promise<T[]> => { gunluk.push('SORGU'); return []; },
    tek: async <T>(): Promise<T | null> => null,
  };
  const sar = async <T>(is: (db: Db) => Promise<T>): Promise<T> => {
    gunluk.push('BEGIN');
    try {
      const sonuc = await is(db);
      gunluk.push('COMMIT');
      return sonuc;
    } catch (hata) {
      gunluk.push('ROLLBACK');
      throw hata;
    }
  };
  const vt: Veritabani = { ...db, tx: sar, okumaTx: sar, kapat: async () => undefined };
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik, modul: 'deneme', ...(denetle === undefined ? {} : { denetle }) });
  return { app, gunluk };
}

const PARCALAR = [Buffer.from('%PDF-1.7\n'), Buffer.from('gövde'), Buffer.from('%%EOF')];
const BOYUT = PARCALAR.reduce((t, p) => t + p.length, 0);

const indir = (yol: string, ad: string, parcalar: readonly Buffer[] = PARCALAR, boyut = BOYUT): Uc =>
  uc({
    yontem: 'GET', yol, yetki: 'kisiler.oku', cevap: ikiliCevap,
    isle: () => ({
      tur: 'application/pdf', ad, boyut,
      // Şemada olmayan alan cevaba çıkmaz.
      gizli: 'sızmamalı',
      akis: async function* (db: Db) {
        await db.sorgu('SELECT parca');
        for (const p of parcalar) yield p;
      },
    }),
  });

test('ikili cevap: içerik transaction bittikten sonra parça parça akar; tür, boyut, nosniff ve kaçırılmış ad başlıkta', async () => {
  const { app, gunluk } = kur([indir('/belge', 'Çizim "A"\r\nX-Sahte: 1;ç.pdf')]);
  const cevap = await app.inject({ method: 'GET', url: '/api/belge' });
  assert.equal(cevap.statusCode, 200, cevap.body);
  assert.deepEqual(cevap.rawPayload, Buffer.concat(PARCALAR));
  assert.equal(cevap.headers['content-type'], 'application/pdf');
  assert.equal(cevap.headers['content-length'], String(BOYUT));
  assert.equal(cevap.headers['x-content-type-options'], 'nosniff');
  assert.equal(cevap.headers['cache-control'], 'private, no-store');
  const ad = String(cevap.headers['content-disposition']);
  assert.match(ad, /^attachment; filename="Cizim _A_X-Sahte: 1_c.pdf"; filename\*=UTF-8''/);
  assert.equal(/[\r\n]/.test(ad), false);
  assert.equal(cevap.headers['x-sahte'], undefined);
  assert.equal(decodeURIComponent(ad.split("UTF-8''")[1] ?? ''), 'Çizim "A"\r\nX-Sahte: 1;ç.pdf');
  assert.equal(JSON.stringify(cevap.headers).includes('sızmamalı'), false);
  assert.equal(cevap.body.includes('sızmamalı'), false);
  // Üst bilgi okuma transaction'ında, içerik ondan sonra: akış transaction'ı açık tutmaz.
  assert.deepEqual(gunluk, ['BEGIN', 'COMMIT', 'SORGU']);
});

test('ikili cevap: yetkisiz 403 alır, işleyici ve akış koşmaz; işleyicinin reddi JSON hata olarak döner', async () => {
  const yetkisizde = kur([indir('/belge', 'a.pdf')], yetkisiz);
  const ret = await yetkisizde.app.inject({ method: 'GET', url: '/api/belge' });
  assert.equal(ret.statusCode, 403);
  assert.equal(ret.json().kod, 'YETKI_YOK');
  assert.deepEqual(yetkisizde.gunluk, []);

  const yok = kur([uc({ yontem: 'GET', yol: '/yok', yetki: 'kisiler.oku', cevap: ikiliCevap, isle: () => { throw bulunamadi('Dosya yok.'); } })]);
  const bulunamaz = await yok.app.inject({ method: 'GET', url: '/api/yok' });
  assert.equal(bulunamaz.statusCode, 404);
  assert.equal(bulunamaz.json().kod, 'BULUNAMADI');
});

test('ikili cevap: bildirilen boyutu tutmayan akış bağlantıyı keser, cevap tamamlanmış görünmez', async () => {
  const { app } = kur([
    indir('/kisa', 'a.pdf', PARCALAR, BOYUT + 10),
    indir('/uzun', 'b.pdf', PARCALAR, BOYUT - 1),
    indir('/tam', 'c.pdf'),
  ]);
  // Önce tutan boyut tamamlanır: aşağıdaki kesilme her cevapta olan bir şey değildir.
  assert.equal((await app.inject({ method: 'GET', url: '/api/tam' })).statusCode, 200);
  for (const yol of ['/kisa', '/uzun']) {
    await assert.rejects(app.inject({ method: 'GET', url: `/api${yol}` }), /destroyed/, yol);
  }
});

test('ikili cevap tanımı: yalnız okuma ucunda ve transaction içinde', () => {
  const akis = async function* () { yield Buffer.alloc(0); };
  const isle = () => ({ tur: 'application/pdf', ad: 'a', boyut: 0, akis });
  assert.throws(() => uc({ yontem: 'POST', yol: '/x', yetki: 'kisiler.oku', cevap: ikiliCevap, isle }), /yalnız okuma ucunda/);
  assert.throws(() => uc({ yontem: 'GET', yol: '/x', yetki: 'kisiler.oku', txDisi: true, cevap: ikiliCevap, isle }), /transaction dışında/);
  assert.equal(uc({ yontem: 'GET', yol: '/x', yetki: 'kisiler.oku', cevap: ikiliCevap, isle }).ikili, true);
});

// Olmayabilen görsel (giriş logosu) yoksa hata değildir: 404 tarayıcı konsolunda ve günlükte hata gibi görünür.
test('boş olabilen ikili cevap: işleyici null verirse gövdesiz 204 ve önbelleğe alınmaz; dosya varsa 200', async () => {
  let var_ = false;
  const { app } = kur([uc({
    yontem: 'GET', yol: '/gorsel', yetki: 'kisiler.oku', cevap: ikiliCevapYaDaBos,
    isle: () => (var_ ? { tur: 'image/png', ad: 'g.png', boyut: 1, akis: async function* () { yield Buffer.from('x'); } } : null),
  })]);
  const bos = await app.inject({ method: 'GET', url: '/api/gorsel' });
  assert.equal(bos.statusCode, 204, bos.body);
  assert.equal(bos.body, '');
  assert.equal(bos.headers['cache-control'], 'private, no-store');
  var_ = true;
  const dolu = await app.inject({ method: 'GET', url: '/api/gorsel' });
  assert.equal(dolu.statusCode, 200, dolu.body);
  assert.equal(dolu.headers['content-type'], 'image/png');
  assert.equal(dolu.headers['x-content-type-options'], 'nosniff');
});

// 385 a: dosya cevabı veren okuma ucu, dosya verilmeden önce denetim kaydına yazılır (kim, ne zaman, hangi uç, hangi kayıt, dosya).
function kaydeden(gunluk: string[], hata?: Error): { denetle: Denetle; kayitlar: DenetimGirdisi[] } {
  const kayitlar: DenetimGirdisi[] = [];
  return {
    kayitlar,
    denetle: async (_db, girdi) => {
      gunluk.push('DENETIM');
      if (hata) throw hata;
      kayitlar.push(girdi);
    },
  };
}

const parametreliIndir = (): Uc =>
  uc({
    yontem: 'GET', yol: '/belgeler/:id', yetki: 'kisiler.oku', parametre: z.object({ id: z.coerce.number().int() }), cevap: ikiliCevap,
    isle: () => ({ tur: 'application/pdf', ad: 'Çizim A.pdf', boyut: BOYUT, akis: async function* (db: Db) { await db.sorgu('SELECT parca'); yield* PARCALAR; } }),
  });

test('385 a: oturumlu kişiye verilen dosya ayrı yazma transaction\'ında denetime yazılır; içerik ondan sonra akar', async () => {
  const gunluk: string[] = [];
  const { denetle, kayitlar } = kaydeden(gunluk);
  const { app, gunluk: vtGunlugu } = kur([parametreliIndir()], okuyan, denetle);
  const cevap = await app.inject({ method: 'GET', url: '/api/belgeler/7' });
  assert.equal(cevap.statusCode, 200, cevap.body);
  assert.deepEqual(cevap.rawPayload, Buffer.concat(PARCALAR));
  assert.deepEqual(kayitlar, [{
    kisiId: 2, yontem: 'GET', yol: '/belgeler/:id', parametre: { id: 7 }, govde: undefined, yetki: 'kisiler.oku', modul: 'deneme',
    ek: [{ ad: 'Çizim A.pdf', tur: 'application/pdf', boyut: BOYUT }],
  }]);
  // Okuma, sonra denetim kendi transaction'ında, sonra içerik.
  assert.deepEqual(vtGunlugu, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'SORGU']);
  assert.deepEqual(gunluk, ['DENETIM']);
});

test('385 a: denetim yazılamazsa dosya verilmez (500) ve içerik okunmaz', async () => {
  const gunluk: string[] = [];
  const { denetle } = kaydeden(gunluk, new Error('defter yazılamadı'));
  const { app, gunluk: vtGunlugu } = kur([parametreliIndir()], okuyan, denetle);
  const cevap = await app.inject({ method: 'GET', url: '/api/belgeler/7' });
  assert.equal(cevap.statusCode, 500);
  assert.equal(cevap.rawPayload.includes(Buffer.from('%PDF')), false);
  assert.equal(vtGunlugu.includes('SORGU'), false);
  assert.deepEqual(gunluk, ['DENETIM']);
});

test('385 a: dosya verilmeyen istek (yetkisiz, 204) ve kimliksiz açık uç denetime yazılmaz', async () => {
  const gunluk: string[] = [];
  const { denetle, kayitlar } = kaydeden(gunluk);
  const yetkisizde = kur([parametreliIndir()], yetkisiz, denetle);
  assert.equal((await yetkisizde.app.inject({ method: 'GET', url: '/api/belgeler/7' })).statusCode, 403);
  const bosta = kur([uc({ yontem: 'GET', yol: '/gorsel', yetki: 'kisiler.oku', cevap: ikiliCevapYaDaBos, isle: () => null })], okuyan, denetle);
  assert.equal((await bosta.app.inject({ method: 'GET', url: '/api/gorsel' })).statusCode, 204);
  const acik = kur([uc({
    yontem: 'GET', yol: '/logo', yetki: 'acik', cevap: ikiliCevapYaDaBos,
    isle: () => ({ tur: 'image/png', ad: 'l.png', boyut: 1, akis: async function* () { yield Buffer.from('x'); } }),
  })], async () => null, denetle);
  assert.equal((await acik.app.inject({ method: 'GET', url: '/api/logo' })).statusCode, 200);
  assert.deepEqual(kayitlar, []);
  assert.deepEqual(gunluk, []);
});

test('385 a kapsamı: ekranın kendiliğinden yüklediği dosya (atölye 3B modeli) denetime yazılmaz; seçenek yalnız dosya ucunda geçer', async () => {
  const gunluk: string[] = [];
  const { denetle, kayitlar } = kaydeden(gunluk);
  const akis = async function* () { yield Buffer.from('x'); };
  const { app } = kur([uc({
    yontem: 'GET', yol: '/model', yetki: 'kisiler.oku', kendiligindenYuklenir: true, cevap: ikiliCevap,
    isle: () => ({ tur: 'model/step', ad: 'm.step', boyut: 1, akis }),
  })], okuyan, denetle);
  assert.equal((await app.inject({ method: 'GET', url: '/api/model' })).statusCode, 200);
  assert.deepEqual(kayitlar, []);
  assert.throws(() => uc({ yontem: 'GET', yol: '/x', yetki: 'kisiler.oku', kendiligindenYuklenir: true, cevap: z.object({}), isle: () => ({}) }),
    /yalnız dosya ucunda/);
});
