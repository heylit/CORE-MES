import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { kablola } from '../../kablolama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 2902 (madde 5, karar 2903 a): istasyonun stok konumu (IST-<no>, ANA depoda, adı istasyonun adı) ilk teslimi beklemez. İstasyon açılınca
// aynı işlemde açılır; eşleme konumsuz aktif istasyonlarınkini açar. Pasif istasyonda açılmaz. Hiç kullanılmamış konum istasyon silinirken
// kalkar; kullanılmış konum kalır ve istasyon silinmez.
const PAROLA = 'dogru-parola-1';

describe('stok istasyon konumu baştan (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let isMerkezi = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async <T = unknown>(yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body === '' ? undefined : c.json()) as T };
  };
  const konum = async (istasyonId: number) =>
    (await o().vt.tek<{ kod: string; ad: string | null; depo: string; tur: string }>(
      'SELECT k.kod, k.ad, d.kod AS depo, k.tur FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id WHERE k.istasyon_id = $1', [istasyonId])) ?? null;
  const istasyonAc = async (ad: string, aktif = true): Promise<number> => {
    sira += 1;
    const c = await iste<{ id: number }>('/istasyonlar', { kod: `IKT-${sira}`, ad, isMerkeziId: isMerkezi, kapasiteKaynagi: 'makine', aktif });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  };

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('stok_istasyon_konumu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    isMerkezi = (await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKT-IM', 'Deneme merkezi') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('açılan aktif istasyonun konumu hemen açılır; pasif istasyonunki açılmaz', async () => {
    const id = await istasyonAc('Deneme tezgâhı');
    assert.deepEqual(await konum(id), { kod: `IST-${id}`, ad: 'Deneme tezgâhı', depo: 'ANA', tur: 'istasyon' });
    const pasif = await istasyonAc('Deneme pasif', false);
    assert.equal(await konum(pasif), null);
  });

  test('eşleme konumsuz aktif istasyonun konumunu açar; kodu başka konumdaysa atlar, eşleme düşmez', async () => {
    const eski = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('IKT-ESKI', 'Deneme eski', $1, true) RETURNING id", [isMerkezi]))!.id;
    const dolu = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('IKT-DOLU', 'Deneme dolu', $1, true) RETURNING id", [isMerkezi]))!.id;
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT id FROM stok_depo WHERE kod = 'ANA'), $1, 'depo_zemini', 'Elle açılmış')", [`IST-${dolu}`]);
    assert.equal(await konum(eski), null);
    assert.equal((await iste('/stok/konumlar/haritadan-esle')).durum, 200);
    assert.deepEqual(await konum(eski), { kod: `IST-${eski}`, ad: 'Deneme eski', depo: 'ANA', tur: 'istasyon' });
    assert.equal(await konum(dolu), null);
  });

  test('hiç kullanılmamış konum istasyonla silinir; kullanılmış konum kalır, istasyon "kullanımda" diye silinmez', async () => {
    const bos = await istasyonAc('Deneme silinecek');
    assert.ok([200, 204].includes((await iste(`/istasyonlar/${bos}/sil`)).durum));
    assert.equal(await o().vt.tek('SELECT id FROM stok_konum WHERE kod = $1', [`IST-${bos}`]), null);

    const dolu = await istasyonAc('Deneme kullanılmış');
    const konumId = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE istasyon_id = $1', [dolu]))!.id;
    const kisi = (await o().vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('IKT-', 0) ON CONFLICT (onek) DO NOTHING");
    const m = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ikt-1', 'hammadde', 'IKT-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ikt-1', com: { ad: 'Deneme malzeme' } }), kisi]))!.no;
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $3) RETURNING id),
           h AS (INSERT INTO stok_hareketi (tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi) VALUES ('giris', $1, $2, '1', $3, 'mal_kabul') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, konumId, kisi]);
      await bakiyeDegistir(db, { malzemeId: m, konumId, partiId: null, kaliteDurumu: 'serbest', fark: binde('1'), ilkGiris: new Date().toISOString() });
    });
    assert.equal((await iste(`/istasyonlar/${dolu}/sil`)).durum, 409);
    assert.notEqual(await konum(dolu), null);
  });
});
