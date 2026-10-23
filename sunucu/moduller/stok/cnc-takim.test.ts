import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cncTakimCikisi } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 153 a, 164 b: CNC kurulumunun takım değişimi ve uç seti kullanımı kartın serbest bakiyesinden ilk giren önce düşer; yetmezse düşmez.
describe('stok CNC takım çıkışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kisiId = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  let sira = 0;
  async function kart(): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['CNC-TKM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'CNC-TKM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`cnc-tkm-${sira}`, sira, JSON.stringify({ id: `cnc-tkm-${sira}`, com: { ad: `Takım ${sira}`, birim: 'adet' } }), kisiId],
    );
    return r!.no;
  }
  async function malKabul(malzemeId: number, miktar: string): Promise<void> {
    const c = await app.inject({
      method: 'POST', url: '/api/stok/mal-kabul', headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      payload: { tur: 'diger', satirlar: [{ malzemeId, miktar }] },
    });
    assert.equal(c.statusCode, 200, c.body);
  }
  const toplam = async (malzemeId: number): Promise<string | null> =>
    (await o().vt.tek<{ m: string | null }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [malzemeId]))?.m ?? null;
  const cikislar = async (malzemeId: number) => o().vt.sorgu<{ miktar: string; neden: string; aciklama: string | null; kisi: number }>(
    "SELECT miktar::text AS miktar, cikis_nedeni AS neden, aciklama, kisi_id AS kisi FROM stok_hareketi WHERE malzeme_id = $1 AND tur = 'cikis' ORDER BY id", [malzemeId]);
  const dus = (malzemeId: number, miktar: string) => o().vt.tx((db) => cncTakimCikisi(db, kisiId, { malzemeId, miktar, aciklama: 'CNC kurulum: T3 değişti' }));

  before(async () => {
    ortam = await testVeritabaniKur('stokcnctakim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme CNC stok', kullaniciAdi: 'cnc-stok', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'cnc-stok', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ilk giren önce düşer, birden çok partiden; hareket kişi ve açıklamayla "diğer" çıkıştır', async () => {
    const k = await kart();
    await malKabul(k, '3');
    await malKabul(k, '2');
    const r = await dus(k, '4');
    assert.equal(r.yeterli, true);
    assert.equal(r.yeterli && r.hareketIdler.length, 2);
    assert.equal(Number(await toplam(k)), 1);
    assert.deepEqual((await cikislar(k)).map((c) => [Number(c.miktar), c.neden, c.aciklama, c.kisi]),
      [[3, 'diger', 'CNC kurulum: T3 değişti', kisiId], [1, 'diger', 'CNC kurulum: T3 değişti', kisiId]]);
  });

  test('yetmezse hiç düşmez, eksiye inmez, mevcut miktar döner; stoğu olmayan kart da düşmez', async () => {
    const k = await kart();
    await malKabul(k, '2');
    assert.deepEqual(await dus(k, '3'), { yeterli: false, mevcut: '2' });
    assert.equal(Number(await toplam(k)), 2);
    assert.deepEqual(await cikislar(k), []);
    const bos = await kart();
    assert.deepEqual(await dus(bos, '1'), { yeterli: false, mevcut: '0' });
    assert.equal(await toplam(bos), null);
  });
});
