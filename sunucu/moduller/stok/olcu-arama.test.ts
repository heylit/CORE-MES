import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { artikParcaCevabi, artikParcalarCevabi, olcuAramaCevabi } from '#paylasilan/sozlesme/stok-kontrol.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 3398 (surum 4 a): ölçüyle arama ve artık parça uçları, gerçek PostgreSQL ile. Kartlar ORN- uydurma.
const PAROLA = 'dogru-parola-1';

describe('stok kontrol: ölçüyle arama ve artık parça (3398, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let kisi = 0;
  let raf = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const al = async (kim: string | null, yol: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: kim === null ? {} : { cookie: cerezler.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const gonder = async (kim: string, yol: string, payload: unknown) => {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: payload as object,
      headers: { cookie: cerezler.get(kim) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  async function kart(kalite: string, form: string, dims: Record<string, number>, birim = 'adet', onay = 'aktif'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ORN-HM-']);
    const kimlik = `orn-hm-${sira}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ORN-HM-', $2, $3, $4, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [kimlik, sira, onay, JSON.stringify({ id: kimlik, form, grade: kalite, dims, com: { ad: `ORN ${form} ${sira}`, birim } })],
    ))!.no;
  }
  async function giris(m: number, miktar: string, konum = raf): Promise<void> {
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, konum, miktar, kisi]);
      await bakiyeDegistir(db, { malzemeId: m, konumId: konum, partiId: null, kaliteDurumu: 'serbest', fark: binde(miktar) });
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_olcu_arama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'operator', 'satin_alma', 'planlama_muduru']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol.replaceAll('_', '-'), parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol.replaceAll('_', '-'), parola: PAROLA } });
      assert.equal(g.statusCode, 200, g.body);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    kisi = (await ortam.vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    raf = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-R1', 'depo_zemini', 'Deneme zemini') RETURNING id",
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: girişsiz 401, operatör 403; depo, satın alma ve planlama okur; artığı yalnız stok çıkışı yazan kaydeder', async () => {
    const yol = '/stok/olcu-arama?form=cubuk&d=50';
    assert.equal((await al(null, yol)).durum, 401);
    assert.equal((await al('operator', yol)).durum, 403);
    for (const k of ['depo', 'satin_alma', 'planlama_muduru']) assert.equal((await al(k, yol)).durum, 200, k);
    const m = await kart('ORN-K1', 'cubuk', { d: 50, l: 3000 });
    const govde = { malzemeNo: m, konumId: raf, boy: 1250 };
    assert.equal((await gonder('satin_alma', '/stok/artik-parcalar', govde)).durum, 403);
    const y2 = await gonder('depo', '/stok/artik-parcalar', govde); assert.equal(y2.durum, 200, JSON.stringify(y2.govde));
  });

  test('arama: aynı form ve kalite; artık, tam, yakın sırası; pay dışı sonda, küçük ve başka kalite yok; karşılanan gerekende', async () => {
    const tam = await kart('ORN-C45', 'cubuk', { d: 60, l: 3000 });
    const yakin = await kart('ORN-C45', 'cubuk', { d: 65, l: 3000 });
    const disi = await kart('ORN-C45', 'cubuk', { d: 90, l: 3000 });
    const kucuk = await kart('ORN-C45', 'cubuk', { d: 55, l: 3000 });
    const baska = await kart('ORN-S235', 'cubuk', { d: 60, l: 3000 });
    const olcusuz = await kart('ORN-C45', 'cubuk', { l: 3000 });
    const stoksuz = await kart('ORN-C45', 'cubuk', { d: 60, l: 6000 });
    for (const m of [tam, disi, kucuk, baska, olcusuz]) await giris(m, '1');
    await giris(yakin, '3');
    const artik = await gonder('depo', '/stok/artik-parcalar', { malzemeNo: tam, konumId: raf, boy: 1250 });
    assert.equal(artik.durum, 200, JSON.stringify(artik.govde));
    const c = await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&parcaBoyu=180&adet=40');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const g = olcuAramaCevabi.parse(c.govde);
    assert.deepEqual(g.adaylar.map((a) => [a.malzemeNo, a.kaynak, a.durum, a.parcaSayisi]), [
      [tam, 'artik', 'tam', 6], [tam, 'stok', 'tam', 16], [yakin, 'stok', 'yakin', 48], [disi, 'stok', 'pay-disi', 16],
    ]);
    assert.ok(!g.adaylar.some((a) => a.malzemeNo === kucuk || a.malzemeNo === baska || a.malzemeNo === stoksuz));
    assert.equal(g.karsilanan, 40);
    assert.equal(g.gereken, 40);
    assert.equal(g.olcusuzKart, 1);
    assert.ok(g.kaliteler.includes('ORN-C45') && g.kaliteler.includes('ORN-S235'));
    assert.deepEqual(g.adaylar[2]?.konumlar, ['ORN-R1']);
    // Yalnız tam ölçü: yakın da pay dışına düşer.
    const t = olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&parcaBoyu=180&adet=40&pay=tam')).govde);
    assert.equal(t.karsilanan, 22);
    // Artıksız arama
    const a = olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&artik=hayir')).govde);
    assert.ok(!a.adaylar.some((x) => x.kaynak === 'artik'));
    assert.equal(a.karsilanan, null);
  });

  test('girdi: kesitsiz arama 400, levhada parça eni zorunlu', async () => {
    assert.equal((await al('depo', '/stok/olcu-arama?form=cubuk&l=100')).durum, 400);
    assert.equal((await al('depo', '/stok/olcu-arama?form=levha&t=20&parcaBoyu=400')).durum, 400);
  });

  test('artık: kart boyunu aşan ya da ölçüsüz kartta reddedilir; listelenir; kapatılınca aramadan düşer; eski sürüm 409', async () => {
    const m = await kart('ORN-K2', 'cubuk', { d: 40, l: 3000 });
    const olcusuz = await kart('ORN-K2', 'cubuk', { l: 3000 });
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: raf, boy: 3500 })).durum, 400);
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: olcusuz, konumId: raf, boy: 500 })).durum, 400);
    const y = await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: raf, boy: 900, aciklama: 'ORN kesim' });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const { id, surum } = artikParcaCevabi.parse(y.govde);
    const l = artikParcalarCevabi.parse((await al('satin_alma', `/stok/artik-parcalar?malzemeNo=${m}`)).govde);
    assert.deepEqual(l.satirlar.map((r) => [r.id, r.olcu, r.konumKod, r.form, r.kaydeden]), [[id, { d: 40, l: 900 }, 'ORN-R1', 'cubuk', 'Deneme depo']]);
    const ara = () => al('depo', '/stok/olcu-arama?form=cubuk&kalite=ORN-K2&d=40&parcaBoyu=100');
    assert.equal(olcuAramaCevabi.parse((await ara()).govde).adaylar.length, 1);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'kullanildi', surum: surum + 1 })).durum, 409);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'kullanildi', surum })).durum, 200);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'hurda', surum: surum + 1 })).durum, 422);
    assert.equal(olcuAramaCevabi.parse((await ara()).govde).adaylar.length, 0);
    const kapali = artikParcalarCevabi.parse((await al('depo', `/stok/artik-parcalar?malzemeNo=${m}&durum=kullanildi`)).govde);
    assert.equal(kapali.satirlar.length, 1);
  });
});
