import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tezgahEslemeCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adAnahtari, eslemeOnerisi } from './kurallar.ts';
import { okumaYaz } from './sorgular.ts';

// Kart 3811: deneme sayfası, gerçek PostgreSQL. Makine kodları ve cihaz adları uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('Tezgâh eşleme önerisi (kart 3811)', () => {
  test('ad benzerliği büyük harf, harf ve rakamla; tek uyan makine önerilir, birden çok uyarsa öneri yok', () => {
    assert.equal(adAnahtari('orn-002'), 'ORN002');
    const m = [{ id: 1, kod: 'ORN-002' }, { id: 2, kod: 'ORN-003' }];
    assert.equal(eslemeOnerisi('ORN002', m), 1);
    assert.equal(eslemeOnerisi('ORN 003', m), 2);
    assert.equal(eslemeOnerisi('ORN004', m), null);
    assert.equal(eslemeOnerisi('ORN002', [...m, { id: 3, kod: 'ORN_002' }]), null);
  });
});

describe('Tezgâh deneme sayfası eşleme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  const makineIdleri: number[] = [];
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const getir = async () => {
    const c = await app.inject({ method: 'GET', url: '/api/tezgah-baglantisi/deneme/esleme', headers: { cookie: yonetici } });
    assert.equal(c.statusCode, 200, c.body);
    return tezgahEslemeCevabi.parse(c.json());
  };
  const kaydet = (cihaz: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/tezgah-baglantisi/deneme/esleme/${cihaz}/kaydet`, headers: { cookie: yonetici }, payload });

  before(async () => {
    ortam = await testVeritabaniKur('tezdnm');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'deneme-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'deneme-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    for (const kod of ['ORN-002', 'ORN-003']) {
      makineIdleri.push((await ortam.sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad) VALUES ($1, $2) RETURNING id', [kod, 'ORN tezgah']))!.id);
    }
    const ozet = { durum: 'calisiyor' as const, calisma: 'ACTIVE', mod: 'AUTOMATIC', program: null, sayac: 1, takim: null, isMiliHizi: null, isMiliYuku: null, ilerleme: null, alarm: null };
    await vt().tx(async (db) => {
      await okumaYaz(db, 'ORN002', ozet, [], new Date('2026-11-27T08:00:00Z'));
      await okumaYaz(db, 'ORN-X9', ozet, [], new Date('2026-11-27T08:00:00Z'));
    });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('okunan her cihaz listelenir; ad benzerse öneri gelir ama onaylanmadıkça eşleme yoktur; varsayılanlar 1 parça ve 5 dk', async () => {
    const v = await getir();
    const c = v.cihazlar.find((x) => x.cihazAdi === 'ORN002');
    assert.deepEqual(
      [c?.makineId, c?.oneriMakineId, c?.cevrimdeParca, c?.durusEsigiDk, c?.degistiren],
      [null, makineIdleri[0], 1, 5, null],
    );
    assert.equal(v.cihazlar.find((x) => x.cihazAdi === 'ORN-X9')?.oneriMakineId, null);
  });

  test('onay yazılır, yazan ve deneme ayarları görünür; bir makine ikinci cihaza eşlenemez; olmayan tezgâh ve makine reddedilir', async () => {
    const k = await kaydet('ORN002', { makineId: makineIdleri[0], cevrimdeParca: 2, durusEsigiDk: 7 });
    assert.equal(k.statusCode, 200, k.body);
    const c = tezgahEslemeCevabi.parse(k.json()).cihazlar.find((x) => x.cihazAdi === 'ORN002');
    assert.deepEqual([c?.makineId, c?.cevrimdeParca, c?.durusEsigiDk, c?.degistiren], [makineIdleri[0], 2, 7, 'Deneme Yonetici']);
    const ikinci = await kaydet('ORN-X9', { makineId: makineIdleri[0], cevrimdeParca: 1, durusEsigiDk: 5 });
    assert.equal(ikinci.statusCode, 400, ikinci.body);
    assert.match(ikinci.body, /ORN002 tezgâhına eşli/);
    assert.equal((await kaydet('ORN-YOK', { makineId: null, cevrimdeParca: 1, durusEsigiDk: 5 })).statusCode, 404);
    assert.equal((await kaydet('ORN-X9', { makineId: 999_999, cevrimdeParca: 1, durusEsigiDk: 5 })).statusCode, 400);
    assert.equal((await kaydet('ORN-X9', { makineId: null, cevrimdeParca: 0, durusEsigiDk: 5 })).statusCode, 400);
    // Eşlemeyi kaldırmak ayarları korur.
    const kaldir = await kaydet('ORN002', { makineId: null, cevrimdeParca: 2, durusEsigiDk: 7 });
    assert.equal(tezgahEslemeCevabi.parse(kaldir.json()).cihazlar.find((x) => x.cihazAdi === 'ORN002')?.makineId, null);
  });
});
