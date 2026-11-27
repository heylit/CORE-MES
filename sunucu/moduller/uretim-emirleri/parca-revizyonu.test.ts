import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimliEmirAyrintisi, IzlemeListeCevabi, ParcaRevizyonlariCevabi, RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimliEmirCevabi, parcaRevizyonlariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirlerinBaskiRevizyonlari, emirlerinParcaRevizyonlari, rotaYururlukCozucusuKaydet } from './disari.ts';
import { PARCA_REVIZYONU_KAPALI, PARCA_REVIZYONU_SABIT } from './kurallar.ts';
import { acilisParcaRevizyonu } from './parca-revizyonu.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3755: emre sabitlenen parça (çizim) revizyonu. Emir rotasız yoldan açılır: parça revizyonu bütün açılış yollarında aynı başlık yazımından geçer.
describe('3755: üretim emrinde parça revizyonu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kisiId = 0;
  let cerez = '';
  let urunNo = 0;
  let belgeId = 0;
  let rev00 = 0;

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
  const ac = async (): Promise<number> => {
    const c = await istek<{ uretimEmriId: number }>('POST', '/adimli-emirler/rotasiz', { malzemeNo: urunNo, adet: 3, teslim: null, projeId: null, emirTuru: 'stok' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.uretimEmriId;
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir;
  };
  // Yeni revizyon yayınlanınca öncekisi eskiye geçer (Belge Merkezi kuralı); yayın zamanı sırayı verir.
  async function revizyonYayinla(sira: number, antet: string, zaman: string): Promise<number> {
    const ozet = randomUUID().replaceAll('-', '').padEnd(64, '0');
    await o().sahip.sorgu('INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, 1, $2, $3)', [ozet, 'pdf', kisiId]);
    const rev = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO belge_merkezi_revizyon (belge_id, sira, ozet, dosya_turu, "not", antet_rev, yukleyen_id) VALUES ($1, $2, $3, 'pdf', NULL, $4, $5) RETURNING id`,
      [belgeId, sira, ozet, antet, kisiId]))!.id;
    await o().sahip.sorgu('INSERT INTO belge_merkezi_onizleme (revizyon_id, kare, ozet, kisi_id) VALUES ($1, 0, $2, $3)', [rev, ozet, kisiId]);
    await o().sahip.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'eski' WHERE belge_id = $1 AND durum = 'yayinda'", [belgeId]);
    await o().sahip.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'yayinda', yayinlayan_id = $2, yayinlandi = $3::timestamptz WHERE id = $1", [rev, kisiId, zaman]);
    return rev;
  }

  before(async () => {
    ortam = await testVeritabaniKur('uretim_parca_revizyonu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme parça rev', kullaniciAdi: 'parca-rev', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'parca-rev', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-PREV-', 0) ON CONFLICT (onek) DO NOTHING");
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [kisiId]);
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('parca-rev-1', 'mamul', 'ORN-PREV-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'parca-rev-1', com: { ad: 'ORN Flanş gövde' }, g: {} }), kisiId],
    ))!.no;
    belgeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO belge_merkezi_belge (ad, tur, olusturan_id) VALUES ('ORN-RES-1001', 'teknik-resim', $1) RETURNING id", [kisiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO belge_merkezi_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, 'malzemeler', $2, $3)", [belgeId, urunNo, kisiId]);
    rev00 = await revizyonYayinla(1, '00', '2026-10-02T08:00:00Z');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('emir kartın yayındaki çizimiyle açılır; R01 yayınlanınca emir 00 da kalır, uyarı çıkar, refakat 00 basar', async () => {
    const id = await ac();
    const e = await ayrinti(id);
    assert.deepEqual(e.parcaRevizyonu, { kod: '00', belgeId, revizyonId: rev00 });
    assert.deepEqual(e.parcaRevizyonuDurumu, { yeniRevizyon: null, secimGerekli: false });

    const rev01 = await revizyonYayinla(2, 'R01', '2026-11-20T08:00:00Z');
    const sonra = await ayrinti(id);
    assert.deepEqual(sonra.parcaRevizyonu, { kod: '00', belgeId, revizyonId: rev00 }, 'emir değişmez');
    assert.deepEqual(sonra.parcaRevizyonuDurumu, { yeniRevizyon: 'Rev 01', secimGerekli: false });
    const kart = await istek<RefakatKartiCevabi>('GET', `/adimli-emirler/${id}/refakat-karti`);
    assert.equal(kart.durum, 200, JSON.stringify(kart.govde));
    assert.equal(kart.govde.revizyon, '00', 'refakat emre sabitlenen revizyonu basar');
    assert.deepEqual((await o().vt.okumaTx((db) => emirlerinParcaRevizyonlari(db, [id]))).get(id), { kod: '00', belgeId, revizyonId: rev00 });

    const yeni = await ayrinti(await ac());
    assert.deepEqual(yeni.parcaRevizyonu, { kod: 'R01', belgeId, revizyonId: rev01 }, 'yeni emir yayındaki çizimle açılır');

    const liste = await istek<ParcaRevizyonlariCevabi>('GET', `/adimli-emirler/parca-revizyonlari?malzemeNo=${urunNo}`);
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const l = parcaRevizyonlariCevabi.parse(liste.govde);
    assert.deepEqual([l.cizim?.belgeId, l.revizyonlar.map((r) => [r.revizyonId, r.kod, r.durum]), l.varsayilanRevizyonId],
      [belgeId, [[rev01, '01', 'yayinda'], [rev00, '00', 'eski']], rev01]);
  });

  test('rotanın çizimi seçilenden farklıysa açılışta uyarı döner; listede olmayan revizyon 400', async () => {
    const rev01 = (await o().sahip.tek<{ id: number }>("SELECT id FROM belge_merkezi_revizyon WHERE belge_id = $1 AND durum = 'yayinda'", [belgeId]))!.id;
    const onceki = rotaYururlukCozucusuKaydet(async (_db, idler) => new Map(idler.map((i) => [i, { harf: 'B', yururlugeAlma: '2026-11-25T00:00:00Z' }])));
    try {
      const eskiyle = await o().vt.tx((db) => acilisParcaRevizyonu(db, urunNo, rev00, 999));
      assert.equal(eskiyle.yazi?.revizyonId, rev00);
      assert.match(eskiyle.uyari ?? '', /^Rota B, Rev 01 çizimi yayındayken yürürlüğe alındı; seçilen Rev 00\./);
      assert.equal((await o().vt.tx((db) => acilisParcaRevizyonu(db, urunNo, rev01, 999))).uyari, null);
      await assert.rejects(o().vt.tx((db) => acilisParcaRevizyonu(db, urunNo, 2_000_000, 999)), (h: Error & { durum?: number }) => h.durum === 400);
    } finally {
      rotaYururlukCozucusuKaydet(onceki);
    }
  });

  test('revizyonu boş açık emirde uyarı ve seçim; seçim geçmişe yazılır, sabittir; kapalı emirde istenmez', async () => {
    const id = await ac();
    // Göçten önce açılmış emir: alanlar boş.
    await o().sahip.sorgu('UPDATE uretim_emri SET parca_revizyon_kodu = NULL, parca_cizim_belge_id = NULL, parca_cizim_revizyon_id = NULL WHERE id = $1', [id]);
    const e = await ayrinti(id);
    assert.equal(e.parcaRevizyonu, null);
    assert.deepEqual(e.parcaRevizyonuDurumu, { yeniRevizyon: null, secimGerekli: true });

    const satir = async () => (await istek<IzlemeListeCevabi>('GET', '/uretim-emirleri?istasyonsuz=1')).govde.emirler.find((x) => x.id === id);
    const once = await satir();
    assert.deepEqual([once?.parcaRevizyonu, once?.parcaRevizyonuSecimGerekli], [null, true], 'liste süzgeci seçilmemiş açık emri bulur');
    assert.equal((await o().vt.okumaTx((db) => emirlerinBaskiRevizyonlari(db, [id]))).get(id), '01', 'seçilmemiş emirde baskı kartın yayındaki çizimidir');
    const sec = await istek<{ emir: AdimliEmirAyrintisi }>('POST', `/adimli-emirler/${id}/parca-revizyonu`, { revizyonId: rev00, surum: e.surum });
    assert.equal(sec.durum, 200, JSON.stringify(sec.govde));
    assert.deepEqual(sec.govde.emir.parcaRevizyonu, { kod: '00', belgeId, revizyonId: rev00 });
    const defter = await o().sahip.tek<{ alanlar: Record<string, { eski: unknown; yeni: unknown }> }>(
      `SELECT alanlar FROM denetim_degisiklik WHERE anahtar->>'id' = $1 AND alanlar ? 'parca_cizim_revizyon_id' ORDER BY id DESC LIMIT 1`, [String(id)]);
    assert.deepEqual(defter?.alanlar['parca_cizim_revizyon_id'], { eski: null, yeni: rev00 }, 'seçim emrin geçmişinde');

    const sonra = await satir();
    assert.deepEqual([sonra?.parcaRevizyonu, sonra?.parcaRevizyonuSecimGerekli], ['00', false]);
    assert.equal((await o().vt.okumaTx((db) => emirlerinBaskiRevizyonlari(db, [id]))).get(id), '00');

    const ikinci = await istek<{ mesaj: string }>('POST', `/adimli-emirler/${id}/parca-revizyonu`, { revizyonId: rev00, surum: sec.govde.emir.surum });
    assert.deepEqual([ikinci.durum, ikinci.govde.mesaj], [409, PARCA_REVIZYONU_SABIT]);

    const kapali = await ac();
    await o().sahip.sorgu("UPDATE uretim_emri SET parca_revizyon_kodu = NULL, parca_cizim_belge_id = NULL, parca_cizim_revizyon_id = NULL, durum = 'iptal', iptal = now() WHERE id = $1", [kapali]);
    const k = await ayrinti(kapali);
    assert.equal(k.parcaRevizyonuDurumu?.secimGerekli, false, 'kapalı emirde seçim istenmez');
    const red = await istek<{ mesaj: string }>('POST', `/adimli-emirler/${kapali}/parca-revizyonu`, { revizyonId: rev00, surum: k.surum });
    assert.deepEqual([red.durum, red.govde.mesaj], [409, PARCA_REVIZYONU_KAPALI]);
  });

  test('göç: kod ve kaynak birlikte; kaynaksız kod yazılamaz', async () => {
    const id = await ac();
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET parca_cizim_revizyon_id = NULL WHERE id = $1', [id]), /uretim_emri_parca_cizim_butun|uretim_emri_parca_revizyon_kaynakli/);
  });
});
