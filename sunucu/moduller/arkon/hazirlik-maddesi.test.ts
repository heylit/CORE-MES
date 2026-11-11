import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { AZAMI_HAZIRLIK_MADDESI, hazirlikMaddeleriCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { HazirlikMaddeleriCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { hazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ekMaddeHazirlikCozucusu, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { isEmriEkMaddeDurumlari } from './disari.ts';
import { ekMaddeHazirligi, hazirlikMaddesiOlayReddi } from './kurallar.ts';

// 2227-1 b: Üretim Hazırlık'ın iş emrine özel hazırlık maddesi. Hazırlık (CAM) ve yönetici yazar, planlama okur, operatör hiçbirini yapamaz.
// Matriste "Ek madde" yalnız uyarır. Kişi, parça ve emir verisi uydurmadır.
describe('arkon iş emrine özel hazırlık maddesi (2227, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
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
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const liste = (g: unknown): HazirlikMaddeleriCevabi => hazirlikMaddeleriCevabi.parse(g);
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = async () => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1)],
  }));

  before(async () => {
    ortam = await testVeritabaniKur('arkon_hazirlik_maddesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerezler.set('yonetici', String(giris.headers['set-cookie']).split(';')[0] ?? '');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AR.HZM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('cam', 'cam');
    await kisiEkle('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZM-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzm-dnm-1', 'mamul', 'HZM-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hzm-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZMM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZMI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZM1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kural: madde yoksa gerekmez, hepsi tamamsa tamam; kaldırılan değişmez, aynı hâle ikinci kez geçilmez', () => {
    assert.deepEqual(ekMaddeHazirligi([]), { durum: 'yok', secildi: false });
    assert.deepEqual(ekMaddeHazirligi([{ tamam: false }]), { durum: 'yok', secildi: true });
    assert.deepEqual(ekMaddeHazirligi([{ tamam: true }, { tamam: false }]), { durum: 'suruyor', secildi: true });
    assert.deepEqual(ekMaddeHazirligi([{ tamam: true }]), { durum: 'tamam', secildi: true });
    assert.equal(hazirlikMaddesiOlayReddi(null, 'tamamla'), null);
    assert.equal(hazirlikMaddesiOlayReddi('tamamla', 'tamamla'), 'zaten');
    assert.equal(hazirlikMaddesiOlayReddi(null, 'geri-al'), 'zaten');
    assert.equal(hazirlikMaddesiOlayReddi('tamamla', 'geri-al'), null);
    assert.equal(hazirlikMaddesiOlayReddi('geri-al', 'kaldir'), null);
    assert.equal(hazirlikMaddesiOlayReddi('kaldir', 'tamamla'), 'maddeYok');
  });

  test('hazırlık ekler ve işaretler, kişi ve zaman sunucudan; matriste ek madde yalnız uyarır; kaldırılan listeden çıkar', async () => {
    const e = await emirAc();
    const [ie] = e.isEmriIdleri;
    const yol = `/arkon/hazirlik-maddeleri?isEmriId=${String(ie)}`;
    assert.deepEqual(liste((await istek('cam', 'GET', yol)).govde), { isEmriId: ie, kapali: false, maddeler: [] });

    const ekle = await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', { isEmriId: ie, ad: '  Bağlama aparatını getir  ', kisiId: yoneticiId });
    assert.equal(ekle.durum, 200, JSON.stringify(ekle.govde));
    const [m] = liste(ekle.govde).maddeler;
    assert.equal(m?.ad, 'Bağlama aparatını getir');
    assert.equal(m?.ekleyenAdi, 'Deneme cam', 'kişi gövdeden değil oturumdan');
    assert.equal(m?.tamam, false);
    await istek('yonetici', 'POST', '/arkon/hazirlik-maddeleri', { isEmriId: ie, ad: 'Ölçü aletini ayarla' });

    // Matris: çözücü kablolamadaki gibi bağlanır (kablolamasız koşuda da); ek madde iş emri düzeyinde ve yalnız uyarır.
    ekMaddeHazirlikCozucusu(isEmriEkMaddeDurumlari);
    const matris = async () => hazirlikCevabi.parse((await istek('cam', 'GET', `/adimli-emirler/${String(e.uretimEmriId)}/hazirlik`)).govde)
      .maddeler.find((x) => x.madde === 'ek-madde');
    assert.deepEqual(await matris(), { madde: 'ek-madde', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true });
    const tamam = await istek('cam', 'POST', `/arkon/hazirlik-maddeleri/${String(m?.id)}/isaretle`, { olay: 'tamamla' });
    assert.equal(tamam.durum, 200);
    const t = liste(tamam.govde).maddeler[0];
    assert.equal(t?.tamam, true);
    assert.equal(t?.tamamlayanAdi, 'Deneme cam');
    assert.ok(t?.tamamlanma);
    assert.equal((await istek('cam', 'POST', `/arkon/hazirlik-maddeleri/${String(m?.id)}/isaretle`, { olay: 'tamamla' })).durum, 409, 'aynı hâle ikinci kez');
    assert.equal((await matris())?.durum, 'eksik', 'öteki madde açık');
    const ikinci = liste((await istek('cam', 'GET', yol)).govde).maddeler[1];
    await istek('cam', 'POST', `/arkon/hazirlik-maddeleri/${String(ikinci?.id)}/isaretle`, { olay: 'kaldir' });
    assert.equal((await matris())?.durum, 'tamam', 'kaldırılan madde sayılmaz');
    assert.deepEqual(liste((await istek('cam', 'GET', yol)).govde).maddeler.map((x) => x.id), [m?.id]);
    assert.equal((await istek('cam', 'POST', `/arkon/hazirlik-maddeleri/${String(ikinci?.id)}/isaretle`, { olay: 'tamamla' })).durum, 404, 'kaldırılan madde değişmez');
    await istek('cam', 'POST', `/arkon/hazirlik-maddeleri/${String(m?.id)}/isaretle`, { olay: 'geri-al' });
    assert.equal((await matris())?.durum, 'eksik', 'geri alınan madde tamam değil');
    const bos = await emirAc();
    assert.equal((await istek('cam', 'GET', `/adimli-emirler/${String(bos.uretimEmriId)}/hazirlik`)).durum, 200);
    assert.equal(hazirlikCevabi.parse((await istek('cam', 'GET', `/adimli-emirler/${String(bos.uretimEmriId)}/hazirlik`)).govde)
      .maddeler.find((x) => x.madde === 'ek-madde')?.durum, 'gerekmez', 'maddesiz iş emrinde gerekmez');
    await assert.rejects(o().sahip.sorgu('DELETE FROM arkon_hazirlik_maddesi_olayi'), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu("UPDATE arkon_hazirlik_maddesi SET ad = 'x'"), /yalnız ekleme/);
  });

  test('yetki: planlama okur yazamaz, operatör ve oturumsuz hiçbirini yapamaz; bilinmeyen, bitmiş ve dolu iş emri; bozuk gövde', async () => {
    const e = await emirAc();
    const [ie] = e.isEmriIdleri;
    const govde = { isEmriId: ie, ad: 'Deneme maddesi' };
    const ilk = liste((await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', govde)).govde).maddeler[0];
    const isaretle = `/arkon/hazirlik-maddeleri/${String(ilk?.id)}/isaretle`;
    assert.equal((await istek('planlama_proje', 'GET', `/arkon/hazirlik-maddeleri?isEmriId=${String(ie)}`)).durum, 200);
    assert.equal((await istek('planlama_proje', 'POST', '/arkon/hazirlik-maddeleri', govde)).durum, 403);
    assert.equal((await istek('planlama_proje', 'POST', isaretle, { olay: 'tamamla' })).durum, 403);
    for (const [ad, beklenen] of [['operator', 403], [null, 401]] as const) {
      assert.equal((await istek(ad, 'GET', `/arkon/hazirlik-maddeleri?isEmriId=${String(ie)}`)).durum, beklenen);
      assert.equal((await istek(ad, 'POST', '/arkon/hazirlik-maddeleri', govde)).durum, beklenen);
      assert.equal((await istek(ad, 'POST', isaretle, { olay: 'tamamla' })).durum, beklenen);
    }
    assert.equal((await istek('cam', 'GET', '/arkon/hazirlik-maddeleri?isEmriId=2147480000')).durum, 404);
    assert.equal((await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', { isEmriId: 2147480000, ad: 'x' })).durum, 404);
    assert.equal((await istek('cam', 'POST', '/arkon/hazirlik-maddeleri/2147480000/isaretle', { olay: 'tamamla' })).durum, 404);
    for (const bozuk of [{ isEmriId: ie, ad: '   ' }, { isEmriId: ie, ad: 'x'.repeat(121) }, { isEmriId: 0, ad: 'x' }, { ad: 'x' }]) {
      assert.equal((await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', bozuk)).durum, 400, JSON.stringify(bozuk));
    }
    assert.equal((await istek('cam', 'POST', isaretle, { olay: 'sil' })).durum, 400);
    assert.equal((await istek('cam', 'GET', '/arkon/hazirlik-maddeleri?isEmriId=abc')).durum, 400);

    for (let i = 1; i < AZAMI_HAZIRLIK_MADDESI; i += 1) await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', { isEmriId: ie, ad: `Madde ${String(i)}` });
    assert.equal((await istek('cam', 'POST', '/arkon/hazirlik-maddeleri', govde)).durum, 409, 'iş emri başına sınır');

    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 10 WHERE id = $1", [ie]);
    const kapali = liste((await istek('cam', 'GET', `/arkon/hazirlik-maddeleri?isEmriId=${String(ie)}`)).govde);
    assert.equal(kapali.kapali, true);
    assert.equal((await istek('cam', 'POST', isaretle, { olay: 'tamamla' })).durum, 409, 'bitmiş iş emri');
  });
});
