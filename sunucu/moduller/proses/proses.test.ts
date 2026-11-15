import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('proses: parça dosyası ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let urunNo = 0;
  const cerez: Record<string, string> = {};

  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function kisi(ad: string, rolKodu: string): Promise<void> {
    const rol = await vt().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    await vt().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol!.id);
      for (const r of k.roller) if (r.id !== rol!.id) await rolAl(db, yoneticiId, id, r.id);
    });
    cerez[ad] = await giris(ad);
  }
  const oku = async (ad: string, malzemeNo: number) => {
    const c = await app.inject({ method: 'GET', url: `/api/proses/parca?malzemeNo=${String(malzemeNo)}`, headers: { cookie: cerez[ad] ?? '' } });
    return { durum: c.statusCode, govde: c.json() as ProsesParcaCevabi };
  };

  before(async () => {
    ortam = await testVeritabaniKur('proses');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerez['yonetici'] = await giris('yonetici');
    await kisi('proses', 'proses_muhendisi');
    await kisi('operator', 'operator');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PR-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('pr-dnm-1', 'mamul', 'PR-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'pr-dnm-1', com: { ad: 'Deneme parça' } }), yoneticiId],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('proses mühendisi rotasız parçanın dosyasını okur: halkalar sırayla, kaynağı olmayanlar kaynak-yok, operasyon yok', async () => {
    const c = await oku('proses', urunNo);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.malzeme.no, urunNo);
    assert.equal(c.govde.rota, null);
    assert.deepEqual(c.govde.operasyonlar, []);
    const durum = Object.fromEntries(c.govde.halkalar.map((h) => [h.anahtar, h.durum]));
    assert.deepEqual(durum, {
      cizim: 'yok', rota: 'yok', nc: 'kaynak-yok', takim: 'kaynak-yok', baglama: 'kaynak-yok', kurulum: 'kaynak-yok', kontrol: 'yok', 'ilk-parca': 'gerekmez',
    });
  });

  // Bağlama testi (3290 Test T1): rota, fason adım, talimat, boş kurallı ve dolu kurallı numune planı, iki açık emir sahiplerin
  // uçlarıyla kurulur; servisin her halkayı ve operasyon sütununu doğru sahipten okuduğu ölçülür.
  test('rotalı parça: tezgah, fason, talimat, numune planı ve karakteristik operasyon başına; kontrol ve ilk parça halkası sahibinden', async () => {
    const yonet = async <T>(yontem: 'GET' | 'POST', url: string, payload?: unknown, kim = 'yonetici'): Promise<T> => {
      const basliklar = { cookie: cerez[kim] ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
      const c = await app.inject({ method: yontem, url: `/api${url}`, headers: basliklar, ...(payload === undefined ? {} : { payload: payload as object }) });
      assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
      return c.json() as T;
    };
    const parca = (await vt().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('pr-dnm-2', 'mamul', 'PR-DNM-', 2, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'pr-dnm-2', com: { ad: 'Deneme rotalı parça' } }), yoneticiId],
    ))!.no;
    await vt().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PR-HM-', 0) ON CONFLICT (onek) DO NOTHING");
    const hammadde = (await vt().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('pr-hm-1', 'hammadde', 'PR-HM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'pr-hm-1', com: { ad: 'Deneme hammadde' } }), yoneticiId],
    ))!.no;
    const tip = (await yonet<{ operasyonTipleri: { id: number; kod: string }[] }>('GET', '/rota/secenekler')).operasyonTipleri[0]!.id;
    const merkez = await yonet<{ id: number }>('POST', '/is-merkezleri', { kod: 'PR-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await yonet<{ id: number }>('POST', '/istasyonlar', { kod: 'PR-I', ad: 'Deneme istasyon', isMerkeziId: merkez.id })).id;
    const makine = (await yonet<{ id: number }>('POST', '/makineler', { kod: 'PR-MK', ad: 'Deneme makine', istasyonId: istasyon })).id;
    const adim = (opNo: number, kaynak: unknown) => ({
      opNo: null, operasyonTipiId: tip, ad: `Deneme op ${String(opNo)}`, kaynak, ayarSuresiDk: 30, birimSureDk: 2, bagimlilik: 'bekleyen', devirAdedi: null,
      firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [],
    });
    // Proses mühendisi taslağı açar, yazar, onaya gönderir; onay ve yürürlük başkasındadır (3277-4 a).
    const { id } = await yonet<{ id: number }>('POST', `/rota/urunler/${String(parca)}/taslak-ac`, { kaynak: { tur: 'bos' } }, 'proses');
    const k = await yonet<{ surum: number }>('POST', `/rota/revizyonlar/${String(id)}/kaydet`,
      { surum: 1, aciklama: null, adimlar: [{ ...adim(10, { tur: 'makine', id: makine }), bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }] }, { ...adim(20, { tur: 'fason', id: null }), ayarSuresiDk: null, birimSureDk: null, terminGun: 5 }, adim(30, { tur: 'istasyon', id: istasyon })] }, 'proses');
    const g = await yonet<{ surum: number }>('POST', `/rota/revizyonlar/${String(id)}/onaya-gonder`, { surum: k.surum }, 'proses');
    await yonet('POST', `/rota/revizyonlar/${String(id)}/onayla`, { surum: g.surum, yururlugeAl: true });
    await yonet('POST', `/rota/urunler/${String(parca)}/talimat-yaz`, { opNo: 10, metin: 'Deneme talimatı', okunanSurum: null }, 'proses');
    await yonet('POST', `/kalite-merkezi/studyo/parcalar/${String(parca)}/numune-planlari/10`,
      { surum: null, kurallar: [{ kimlik: 'k1', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi' }] });
    await yonet('POST', `/kalite-merkezi/studyo/parcalar/${String(parca)}/numune-planlari/30`, { surum: null, kurallar: [] });
    for (const n of [1, 2]) {
      await vt().sahip.sorgu(
        "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, 'Deneme', 5, $2, $3, 'planli', $4, $5)",
        [`P-PR-${String(n)}`, istasyon, yoneticiId, parca, id],
      );
    }

    const c = await oku('proses', parca);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.notEqual(c.govde.rota, null);
    assert.deepEqual(c.govde.operasyonlar.map((o) => [o.opNo, o.fason, o.tezgah, o.talimat, o.numunePlani, o.karakteristik]), [
      [10, false, 'PR-MK', true, true, 0],
      [20, true, null, false, false, null],
      [30, false, 'Deneme istasyon', false, false, null],
    ]);
    assert.equal(c.govde.operasyonlar.every((o) => o.gercek === null), true, 'ölçüm yokken gerçek süre uydurulmaz');
    const h = Object.fromEntries(c.govde.halkalar.map((x) => [x.anahtar, x]));
    assert.equal(h['rota']?.durum, 'tamam');
    // Balonsuz parçada kontrol planı halkası yok kalır (karakteristik sahibinde 0); boş kurallı plan sütunda plan sayılmaz (OP 30).
    assert.equal(h['kontrol']?.durum, 'yok');
    assert.deepEqual([h['ilk-parca']?.durum, h['ilk-parca']?.ozet], ['eksik', '2/2 açık emirde karar yok']);
  });

  test('yetki: proses.oku olmayan rol 403; olmayan kart 404', async () => {
    assert.equal((await oku('operator', urunNo)).durum, 403);
    assert.equal((await oku('yonetici', 999999999)).durum, 404);
  });
});
