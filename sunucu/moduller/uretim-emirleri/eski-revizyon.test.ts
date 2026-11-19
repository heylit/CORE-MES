import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirEskiRevizyonIhlali } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('3438 a: emir yürürlükteki revizyonla açılır (kural)', () => {
  const r = { kod: 'ORN-MM-00001', etiket: 'R01', yururlukte: false, yururluktekiKodu: 'ORN-MM-00002', yururluktekiEtiketi: 'R02' };
  test('eski revizyon gerekçesiz açılmaz; gerekçeyle, sipariş kalemine bağlıyken, yürürlükteki ve ailesiz kartta açılır', () => {
    assert.match(emirEskiRevizyonIhlali(r, null, false) ?? '', /ORN-MM-00001 \(R01\) yürürlükteki revizyon değil; yürürlükteki ORN-MM-00002 \(R02\)/);
    assert.notEqual(emirEskiRevizyonIhlali(r, ' ', false), null);
    assert.match(emirEskiRevizyonIhlali(r, 'x'.repeat(301), false) ?? '', /en çok 300/);
    assert.equal(emirEskiRevizyonIhlali(r, 'Müşteri R01 istedi', false), null);
    assert.equal(emirEskiRevizyonIhlali(r, null, true), null);
    assert.equal(emirEskiRevizyonIhlali({ ...r, yururlukte: true }, null, false), null);
    assert.equal(emirEskiRevizyonIhlali(null, null, false), null);
  });
});

describe('3438 a: emir ve revizyon ailesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kisiId = 0;
  let cerez = '';
  let sayac = 0;
  let anaNo = 0;
  let r2No = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kartAc(bag: { ana: number; etiket: string; durum: string } | null, revDurumu: string | null): Promise<number> {
    sayac += 1;
    const kimlik = `rev-emir-${sayac}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, ana_kart_no, alt_tur, alt_etiket, rev_durumu)
       VALUES ($1, 'mamul', 'ORN-REVE-', $2, 'aktif', $3, $4, $4, $5, $6, $7, $8) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'ORN Revizyonlu mil' }, g: { rev: 'R01' } }), kisiId, bag?.ana ?? null, bag === null ? null : 'revizyon', bag?.etiket ?? null, bag?.durum ?? revDurumu],
    ))!.no;
  }
  // Stok emri projesiz açılır.
  const ac = (malzemeNo: number, ek: Record<string, unknown> = {}) =>
    istek<{ uretimEmriId: number; mesaj?: string }>('POST', '/adimli-emirler/rotasiz', { malzemeNo, adet: 3, teslim: null, projeId: null, emirTuru: 'stok', ...ek });

  before(async () => {
    ortam = await testVeritabaniKur('uretim_eski_revizyon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme revizyon', kullaniciAdi: 'rev-emir', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'rev-emir', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-REVE-', 0) ON CONFLICT (onek) DO NOTHING");
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [kisiId]);
    anaNo = await kartAc(null, 'eski');
    r2No = await kartAc({ ana: anaNo, etiket: 'R02', durum: 'yururlukte' }, null);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('açılış seçenekleri revizyonu verir; eski revizyon gerekçesiz 400, gerekçeyle açılır ve gerekçe emirde; yürürlükteki kartta gerekçe yazılmaz', async () => {
    const s = await istek<AcilisSecenekleri>('GET', `/adimli-emirler/acilis-secenekleri?malzemeNo=${anaNo}&emirTuru=stok`);
    assert.equal(s.durum, 200, JSON.stringify(s.govde));
    assert.deepEqual([s.govde.revizyon?.yururlukte, s.govde.revizyon?.yururluktekiNo, s.govde.revizyon?.yururluktekiEtiketi], [false, r2No, 'R02']);

    const ret = await ac(anaNo);
    assert.equal(ret.durum, 400, JSON.stringify(ret.govde));
    assert.match(ret.govde.mesaj ?? '', /yürürlükteki revizyon değil/);

    const eski = await ac(anaNo, { eskiRevizyonGerekcesi: 'Müşteri R01 istedi' });
    assert.equal(eski.durum, 200, JSON.stringify(eski.govde));
    const yeni = await ac(r2No, { eskiRevizyonGerekcesi: 'unutulan metin' });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    const satirlar = await o().sahip.sorgu<{ id: number; g: string | null }>(
      'SELECT id, eski_revizyon_gerekcesi AS g FROM uretim_emri WHERE id = ANY($1::int[]) ORDER BY id', [[eski.govde.uretimEmriId, yeni.govde.uretimEmriId]],
    );
    assert.deepEqual(satirlar.map((x) => x.g), ['Müşteri R01 istedi', null]);
  });
});
