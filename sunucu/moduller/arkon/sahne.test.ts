import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { isEmriSahnesiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isEmriTalimatKunyesi, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

// 3209 a, 3213: operatör 3B modeli yalnız işinin rota adımına bağlı talimattan açar. Sahne emir açılırken sabitlenen talimat sürümünündür;
// iş terminalde görünmüyorsa (iptal, kapsam) 404; model dosyası yalnız sahnenin modelidir ve ürünün yayındaki modeli olmalıdır. Veri uydurmadır.
describe('arkon terminal 3B montaj sahnesi (3209, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
  let model = 0;
  const PAROLA = 'dogru-parola-1';
  const kisiler = new Map<string, Kullanici>();
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kisiler.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kisiler.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }
  const istek = async (ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, ...(govde === undefined ? {} : { payload: govde as object }),
      headers: { cookie: ad === null ? '' : (cerezler.get(ad) ?? ''), [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    });
    return { durum: c.statusCode, ham: c.rawPayload, govde: c.headers['content-type']?.toString().includes('json') ? (c.json() as unknown) : null };
  };
  const tamam = async <T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> => {
    const c = await istek('yonetici', yontem, yol, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde as T;
  };
  // Ürüne Belge Merkezi'nin kendi uçlarıyla sahte ORN- STEP başlıklı 3B model eklenir ve yayınlanır.
  let modelSayaci = 0;
  async function modelEkle(urun: number): Promise<{ rev: number; icerik: Buffer }> {
    modelSayaci += 1;
    const icerik = Buffer.from(`ISO-10303-21;\nHEADER;\nFILE_NAME('ORN-T${String(modelSayaci)}');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n`);
    const ozet = createHash('sha256').update(icerik).digest('hex');
    await tamam('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    const ad = `Model ORN-T${String(modelSayaci)}`;
    const b = (await tamam<{ belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] }>('POST',
      `/cizimler/malzemeler/${String(urun)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi: `orn-t${String(modelSayaci)}.step` })).belgeler.find((x) => x.ad === ad)!;
    const rev = b.revizyonlar[0]!.id;
    await tamam('POST', `/cizimler/${String(b.id)}/revizyonlar/${String(rev)}/yayinla`, { surum: b.surum });
    return { rev, icerik };
  }
  const adim = (talimatSurumu: number | null): IsEmriGirdisi => ({
    sira: 1, opNo: 10, ad: 'Montaj', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu, kontrolListesi: [],
  });
  const emirAc = async (talimatSurumu: number | null) => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(talimatSurumu)],
  }));
  const isEmriOf = async (uretimEmriId: number) =>
    (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [uretimEmriId]))!.id;
  // Sahne satırı rota'nın tablosuna doğrudan yazılır: kaydetme kuralları rota/sahne.test.ts'tedir, burada yalnız okuma bağı denenir.
  const sahneYaz = (talimatSurum: number, sahneSurum: number, modelRevizyonId: number) => o().sahip.sorgu(
    `INSERT INTO rota_talimat_sahnesi (malzeme_id, op_no, talimat_surum, sahne_surum, model_revizyon_id, adimlar, yazan_kisi_id)
     VALUES ($1, 10, $2, $3, $4, $5::jsonb, $6)`,
    [urunNo, talimatSurum, sahneSurum, modelRevizyonId,
      JSON.stringify([{ sira: 1, hareket: { parcalar: [1], yon: '+Z', mesafeMm: 80, sureSn: 1.6, sirali: false, kamera: null } }]), yoneticiId],
  );
  const sahneUrl = (ie: number) => `/arkon/is-emirleri/${String(ie)}/sahne`;

  before(async () => {
    ortam = await testVeritabaniKur('arkon_sahne');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerezler.set('yonetici', String(giris.headers['set-cookie']).split(';')[0] ?? '');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AR.SHN', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SHN-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SHN-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('shn-dnm-1', 'mamul', 'SHN-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'shn-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await ortam.sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, 10, $2)', [urunNo, revId]);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SHNM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SHNI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SHN1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
    model = (await modelEkle(urunNo)).rev;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('künye: iş emrinin rota adımı ve sabitlenen talimat sürümü; sürüm sabitlenmemişse null', async () => {
    const e = await emirAc(1);
    assert.deepEqual(await o().vt.tx(async (db) => isEmriTalimatKunyesi(db, await isEmriOf(e.uretimEmriId))), { malzemeNo: urunNo, opNo: 10, surum: 1 });
    const bos = await emirAc(null);
    assert.equal(await o().vt.tx(async (db) => isEmriTalimatKunyesi(db, await isEmriOf(bos.uretimEmriId))), null);
  });

  test('operatör işinin sabitlenen sürümünün en son sahnesini okur; sonraki sürümün sahnesi bu işe gelmez; sahne yoksa null', async () => {
    const e = await emirAc(2);
    const ie = await isEmriOf(e.uretimEmriId);
    assert.deepEqual(isEmriSahnesiCevabi.parse((await istek('operator', 'GET', sahneUrl(ie))).govde), { sahne: null });
    await sahneYaz(2, 1, model);
    await sahneYaz(2, 2, model);
    await sahneYaz(3, 1, model);
    const c = await istek('operator', 'GET', sahneUrl(ie));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const s = isEmriSahnesiCevabi.parse(c.govde).sahne;
    assert.deepEqual([s?.talimatSurum, s?.sahneSurum, s?.modelRevizyonId], [2, 2, model]);
    const m = await istek('operator', 'GET', `${sahneUrl(ie)}-modeli`);
    assert.equal(m.durum, 200);
    assert.ok(m.ham.toString('latin1').startsWith('ISO-10303-21;'));
  });

  test('görünmeyen iş 404 (olmayan, iptal edilen); oturumsuz 401; sahnesiz işte model dosyası 404', async () => {
    assert.equal((await istek('operator', 'GET', sahneUrl(999999))).durum, 404);
    assert.equal((await istek(null, 'GET', sahneUrl(999999))).durum, 401);
    const e = await emirAc(4);
    const ie = await isEmriOf(e.uretimEmriId);
    assert.equal((await istek('operator', 'GET', `${sahneUrl(ie)}-modeli`)).durum, 404);
    await sahneYaz(4, 1, model);
    assert.equal((await istek('operator', 'GET', sahneUrl(ie))).durum, 200);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [e.uretimEmriId]);
    assert.equal((await istek('operator', 'GET', sahneUrl(ie))).durum, 404);
    assert.equal((await istek('operator', 'GET', `${sahneUrl(ie)}-modeli`)).durum, 404);
  });

  test('model artık ürünün yayındaki modeli değilse (başka ürünün modeli) dosya verilmez', async () => {
    const e = await emirAc(5);
    const ie = await isEmriOf(e.uretimEmriId);
    const baskaUrun = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('shn-dnm-2', 'mamul', 'SHN-DNM-', 2, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'shn-dnm-2', com: { ad: 'Deneme mamul 2' } }), yoneticiId]))!.no;
    await sahneYaz(5, 1, (await modelEkle(baskaUrun)).rev);
    assert.equal((await istek('operator', 'GET', sahneUrl(ie))).durum, 200);
    assert.equal((await istek('operator', 'GET', `${sahneUrl(ie)}-modeli`)).durum, 404);
  });
});
