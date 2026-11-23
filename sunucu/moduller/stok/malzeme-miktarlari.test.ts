import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { malzemeMiktarlariCevabi, type MalzemeMiktari } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 3582: alternatif kartların toplu stok miktarı. Miktar istek seçicisiyle aynı tanımdır (depo konumundaki serbest ve şartlı bakiye);
// statülü bakiye adıyla ayrı; stoklanmayan ya da bulunmayan kart null, stoklanan bakiyesiz kart "0". Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
type Kalite = 'serbest' | 'sartli' | 'karar_bekliyor';

describe('stok malzeme miktarları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let kisi = 0;
  let raf = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async (kim: string | null, yol: string): Promise<{ durum: number; govde: unknown }> => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: kim === null ? {} : { cookie: cerezler.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  let sira = 0;
  async function kart(tur: 'hammadde' | 'hizmet' = 'hammadde'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['MMK-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, hizmet_yonu, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $4, 'MMK-DNM-', $2, 'aktif', $3, CASE WHEN $4 = 'hizmet' THEN 'alinan' END, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [`mmk-dnm-${sira}`, sira, JSON.stringify({ id: `mmk-dnm-${sira}`, com: { ad: `Deneme ${sira}`, birim: 'kg' } }), tur],
    );
    return r!.no;
  }
  // Giriş hareketi ve bakiyesi aynı işlemde (hareket defteri tetiği işlem sonunda eşitliği denetler), servisin tek yazım yolundan.
  async function gir(m: number, miktar: string, kalite: Kalite = 'serbest', statuId: number | null = null): Promise<void> {
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi, hedef_kalite_durumu, hedef_statu_id)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul', $5, $6) RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`,
        [m, raf, miktar, kisi, kalite, statuId],
      );
      await bakiyeDegistir(db, { malzemeId: m, konumId: raf, partiId: null, statuId, kaliteDurumu: kalite, fark: binde(miktar) });
    });
  }
  const oku = async (idler: number[]): Promise<MalzemeMiktari[]> => {
    const c = await iste('depo', `/stok/malzeme-miktarlari?idler=${idler.join(',')}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malzemeMiktarlariCevabi.parse(c.govde).satirlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_malzeme_miktari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    kisi = (await ortam.vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    raf = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'D-MMK1', 'depo_zemini', 'Deneme zemini') RETURNING id",
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: girişsiz 401, stok okuması olmayan 403, depo 200', async () => {
    const m = await kart();
    assert.equal((await iste(null, `/stok/malzeme-miktarlari?idler=${m}`)).durum, 401);
    assert.equal((await iste('operator', `/stok/malzeme-miktarlari?idler=${m}`)).durum, 403);
    assert.equal((await iste('depo', `/stok/malzeme-miktarlari?idler=${m}`)).durum, 200);
  });

  test('en çok 50 kart; boş, sıfır ve harfli liste 400', async () => {
    const elli = Array.from({ length: 50 }, (_, i) => i + 1);
    assert.equal((await iste('depo', `/stok/malzeme-miktarlari?idler=${elli.join(',')}`)).durum, 200);
    assert.equal((await iste('depo', `/stok/malzeme-miktarlari?idler=${[...elli, 51].join(',')}`)).durum, 400);
    assert.equal((await iste('depo', '/stok/malzeme-miktarlari?idler=')).durum, 400);
    assert.equal((await iste('depo', '/stok/malzeme-miktarlari?idler=0')).durum, 400);
    assert.equal((await iste('depo', '/stok/malzeme-miktarlari?idler=1,a')).durum, 400);
    assert.equal((await iste('depo', '/stok/malzeme-miktarlari')).durum, 400);
  });

  test('stoklanan bakiyesiz kart "0", hizmet ve bulunmayan kart null; sıra istenen sıradır', async () => {
    const bos = await kart();
    const hizmet = await kart('hizmet');
    const yok = 2_000_000_000;
    const s = await oku([hizmet, yok, bos]);
    assert.deepEqual(s.map((x) => x.malzemeId), [hizmet, yok, bos]);
    assert.deepEqual(s[0], { malzemeId: hizmet, birim: 'kg', kullanilabilir: null, statuler: [] });
    assert.deepEqual(s[1], { malzemeId: yok, birim: null, kullanilabilir: null, statuler: [] });
    assert.deepEqual(s[2], { malzemeId: bos, birim: 'kg', kullanilabilir: '0', statuler: [] }, 'sıfır uydurulmaz ama bakiyesiz stoklanan kart gerçekten 0');
  });

  test('serbest ve şartlı kullanılabilir toplanır, karar bekleyen sayılmaz; statülü miktar adıyla ayrı', async () => {
    const m = await kart();
    await gir(m, '12.5');
    await gir(m, '2.5', 'sartli');
    await gir(m, '100', 'karar_bekliyor');
    const statu = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('MMK', 'ORN OP 10', 'mmk-op10', '#2F6FDE', 'HM') RETURNING id",
    ))!.id;
    await gir(m, '4', 'serbest', statu);
    const [s] = await oku([m]);
    assert.equal(Number(s!.kullanilabilir), 15);
    assert.deepEqual(s!.statuler.map((x) => ({ ...x, miktar: Number(x.miktar) })), [{ statuId: statu, ad: 'ORN OP 10', miktar: 4 }]);
  });

  test('aynı kart iki kez istenirse tek satır döner', async () => {
    const m = await kart();
    await gir(m, '3');
    const s = await oku([m, m]);
    assert.equal(s.length, 1);
    assert.equal(Number(s[0]!.kullanilabilir), 3);
  });
});
