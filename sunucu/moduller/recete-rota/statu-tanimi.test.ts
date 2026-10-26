import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { StatuTanimiCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';

// Geçiş planı adım 4: elle tanımlanan statüde tablo tek kaynaktır. Ekran listeyi durumdan okur, ekleme, değişiklik ve silme komutla gider;
// ana kaydın JSON'u tabloda olmayan statüyü yalnız ekler (ilk kurulumun varsayılanları), var olanı değiştirmez ve silmez. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('recete-rota statü tanımı komutları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  let surum: number | null = null;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const gonder = (url: string, payload: Record<string, unknown>) => {
    const headers: Record<string, string> = { cookie: cerez };
    return app.inject({ method: 'POST', url: `/api${url}`, headers, payload });
  };
  const kaydetKomutu = (id: string, alanlar: Record<string, unknown>) => gonder(`/recete-rota/statu-tanimlari/${id}/kaydet`, alanlar);
  const liste = async () => {
    const headers: Record<string, string> = { cookie: cerez };
    const r = await app.inject({ method: 'GET', url: '/api/recete-rota/durum', headers });
    assert.equal(r.statusCode, 200, r.body);
    return ((r.json() as DurumCevabi).statuses ?? []).map((x) => [x.id, x.code, x.name, x.kind, x.color, x.surum]);
  };
  const belgeYaz = async (deger: unknown) => {
    const c = await gonder('/recete-rota/kayitlar/yaz', { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: surum });
    assert.equal(c.statusCode, 200, c.body);
    surum = (c.json() as { kayit: { surum: number } }).kayit.surum;
  };
  let sira = 0;
  const kartAc = async (): Promise<number> => {
    sira += 1;
    return (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'TST-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`tst-${String(sira)}`, sira, JSON.stringify({ id: `tst-${String(sira)}`, com: { ad: 'Statü deneme' } }), yoneticiId]))!.no;
  };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_statu_tanimi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TST-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await ortam?.kaldir(); });

  test('ST-1: ilk kayıt varsayılanları ekler; sonraki kayıtta belgedeki farklı ad, kalkan statü tabloyu değiştirmez, yeni statü sona eklenir', async () => {
    const kkb = { id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' };
    const ret = { id: 'RET', code: 'RET', name: 'Ret / hurda', kind: 'ret', color: '#C8102E' };
    await belgeYaz({ statuses: [kkb, ret] });
    assert.deepEqual(await liste(), [['KKB', 'KKB', 'Kalite bekliyor', 'kalite', '#9A7400', 1], ['RET', 'RET', 'Ret / hurda', 'ret', '#C8102E', 1]]);
    await belgeYaz({ statuses: [{ ...ret, name: 'Belgedeki ad' }, { id: 'S9', code: 'S9', name: 'Belgeden yeni', kind: 'uretim', color: '#2F6FDE' }] });
    assert.deepEqual((await liste()).map((x) => [x[0], x[2], x[5]]), [['KKB', 'Kalite bekliyor', 1], ['RET', 'Ret / hurda', 1], ['S9', 'Belgeden yeni', 1]]);
  });

  test('ST-2: ekleme ve değişiklik; aynı kimlikle ikinci ekleme ve eski sürüm 409, bozuk alan 400', async () => {
    let r = await kaydetKomutu('S10', { code: 'S10', name: 'Yeni statü', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual((r.json() as StatuTanimiCevabi).statuses.at(-1), { id: 'S10', code: 'S10', name: 'Yeni statü', kind: 'uretim', color: '#1F9E6A', surum: 1 });
    assert.equal((await kaydetKomutu('S10', { code: 'S10', name: 'Tekrar', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null })).statusCode, 409);
    r = await kaydetKomutu('S10', { code: 'S10', name: '  Boya bekliyor ', kind: 'kalite', color: '#1F9E6A', beklenenSurum: 1 });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual((r.json() as StatuTanimiCevabi).statuses.find((x) => x.id === 'S10'), { id: 'S10', code: 'S10', name: 'Boya bekliyor', kind: 'kalite', color: '#1F9E6A', surum: 2 });
    assert.equal((await kaydetKomutu('S10', { code: 'S10', name: 'Eski', kind: 'kalite', color: '#1F9E6A', beklenenSurum: 1 })).statusCode, 409);
    assert.equal((await kaydetKomutu('YOK', { code: 'YOK', name: 'Yok', kind: 'kalite', color: '#1F9E6A', beklenenSurum: 1 })).statusCode, 404);
    for (const [id, alan] of [['S11', { code: 'UZUNKOD' }], ['S11', { color: 'mavi' }], ['S11', { kind: 'baska' }], ['S11', { name: ' ' }], ['S 1', {}]] as const) {
      const c = await kaydetKomutu(encodeURIComponent(id), Object.assign({ code: 'S11', name: 'Ad', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null }, alan));
      assert.equal(c.statusCode, 400, `${id} ${JSON.stringify(alan)}`);
    }
  });

  test('ST-3: silme bağlardan da kaldırır (statü bağı boşalır, yalnız statülü bağ silinir, giren statüsü ve statülü kart silinir); eski sürüm 409', async () => {
    const mm = await kartAc();
    const hm = await kartAc();
    const r0 = await kaydetKomutu('SIL', { code: 'SIL', name: 'Silinecek', kind: 'uretim', color: '#8A4FD3', beklenenSurum: null });
    assert.equal(r0.statusCode, 200, r0.body);
    const rev = (await vt().tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [mm, yoneticiId]))!.id;
    await vt().sorgu('INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_malzeme_id, cikti_statu, guncelleyen_kisi_id) VALUES ($5, $1, 10, NULL, $2, $3), ($5, $1, 20, $4, $2, $3)', [mm, 'SIL', yoneticiId, hm, rev]);
    await vt().sorgu('INSERT INTO recete_rota_giren_statusu (rota_revizyonu_id, malzeme_id, op_no, giren_malzeme_id, statu, guncelleyen_kisi_id) VALUES ($5, $1, 10, $2, $3, $4)', [mm, hm, 'SIL', yoneticiId, rev]);
    await vt().sorgu('INSERT INTO recete_rota_statu_karti (malzeme_id, statu, guncelleyen_kisi_id) VALUES ($1, $2, $3)', [mm, 'SIL', yoneticiId]);
    assert.equal((await gonder('/recete-rota/statu-tanimlari/SIL/sil', { beklenenSurum: 2 })).statusCode, 409);
    const r = await gonder('/recete-rota/statu-tanimlari/SIL/sil', { beklenenSurum: 1 });
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(!(r.json() as StatuTanimiCevabi).statuses.some((x) => x.id === 'SIL'));
    assert.deepEqual(await vt().sorgu('SELECT op_no, cikti_malzeme_id, cikti_statu FROM recete_rota_adim_bagi WHERE malzeme_id = $1 ORDER BY op_no', [mm]),
      [{ op_no: 20, cikti_malzeme_id: hm, cikti_statu: null }]);
    assert.deepEqual(await vt().sorgu('SELECT 1 FROM recete_rota_giren_statusu WHERE malzeme_id = $1', [mm]), []);
    assert.deepEqual(await vt().sorgu('SELECT 1 FROM recete_rota_statu_karti WHERE malzeme_id = $1', [mm]), []);
    assert.equal((await gonder('/recete-rota/statu-tanimlari/SIL/sil', { beklenenSurum: 1 })).statusCode, 404);
  });

  test('ST-5: statü yalnız rota tanımından gelir (Soru 256 a): elle statülü kart açma ve kaldırma ucu yoktur, durum statülü kart taşımaz', async () => {
    const mm = await kartAc();
    for (const yol of ['/recete-rota/statu-kartlari/ac', '/recete-rota/statu-kartlari/kaldir']) {
      assert.equal((await gonder(yol, { malzemeId: mm, statu: 'KKB' })).statusCode, 404, yol);
    }
    await belgeYaz({ statusCards: [{ itemId: String(mm), status: 'KKB' }] });
    const r = await app.inject({ method: 'GET', url: '/api/recete-rota/durum', headers: { cookie: cerez } });
    assert.equal(r.statusCode, 200);
    assert.ok(!('statusCards' in (r.json() as Record<string, unknown>)), 'eski belgedeki statülü kart durumda görünmez');
  });

  test('ST-4: oturumsuz 401', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/recete-rota/statu-tanimlari/S1/kaydet', payload: { code: 'S1', name: 'Ad', kind: 'uretim', color: '#1F9E6A', beklenenSurum: null } });
    assert.equal(r.statusCode, 401);
  });
});
