import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { hazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { isEmriIlerlemeleri, uretimEmriAc } from './disari.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';

// 2748: hazırlık matrisi tek okumada açık emirlerin hazırlığını ve iş emri ilerlemesini verir. Operatör de okur (2748-2 a, dar uç);
// emir listesi, emir ayrıntısı ve yazma uçları ona kapalı kalır (Güvenlik K1, K2). Kişi, parça ve emir verisi uydurmadır.
describe('uretim-emirleri hazırlık matrisi (2748, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
  let istasyonId = 0;
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
  const istek = async (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const oku = async (ad: string, yol: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = async (adimSayisi: number, kontrolListesi: IsEmriGirdisi['kontrolListesi'] = []) => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId,
    isEmirleri: Array.from({ length: adimSayisi }, (_, i) => ({ ...adim(i + 1), kontrolListesi })),
  }));

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_matrisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('mudur', 'mudur');
    await kisiEkle('cam', 'cam');
    await kisiEkle('operator', 'operator');
    await ortam.sahip.sorgu("INSERT INTO rol (kod, ad) VALUES ('hzm_bos', 'Deneme işlemsiz')");
    await kisiEkle('islemsiz', 'hzm_bos');
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
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZMI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZM1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const say = (emirId: number, isEmriId: number, tur: 'saglam' | 'hurda', adet: number) => o().sahip.sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'hurda' THEN (SELECT min(id) FROM hurda_nedeni) END, false, now(), $6)`,
    [emirId, yoneticiId, istasyonId, tur, adet, isEmriId]);

  test('ilerleme: hedef, sağlam, hurda, kalan ve hazır adet; ilk adımda giren hedeftir, sonraki adıma öncülün sağlamı girer', async () => {
    const e = await emirAc(2);
    const [ie1, ie2] = e.isEmriIdleri;
    await say(e.uretimEmriId, ie1!, 'saglam', 8);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 8 WHERE id = $1", [ie1]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() WHERE id = $1", [ie2]);
    await say(e.uretimEmriId, ie2!, 'saglam', 3);
    await say(e.uretimEmriId, ie2!, 'hurda', 1);
    const l = (await o().vt.okumaTx((db) => isEmriIlerlemeleri(db, [e.uretimEmriId, 2147480000]))).get(e.uretimEmriId) ?? [];
    assert.deepEqual(l.map((i) => ({ op: i.opNo, durum: i.durum, hedef: i.hedef, saglam: i.saglam, hurda: i.hurda, kalan: i.kalan, hazir: i.hazir, fasonda: i.fasonda })), [
      { op: 10, durum: 'tamam', hedef: 10, saglam: 8, hurda: 0, kalan: 2, hazir: 2, fasonda: 0 },
      { op: 20, durum: 'calisiyor', hedef: 10, saglam: 3, hurda: 1, kalan: 7, hazir: 4, fasonda: 0 },
    ]);
  });

  test('matris: açık emir teslime göre, iş emri ilerlemesi ve hazırlıkla; emir verilince yalnız o emir', async () => {
    const e = await emirAc(1);
    const c = await oku('cam', '/adimli-emirler/hazirlik-matrisi');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const v = hazirlikMatrisiCevabi.parse(c.govde);
    const satir = v.emirler.find((x) => x.id === e.uretimEmriId);
    assert.ok(satir, 'açık emir listede');
    assert.equal(satir.isEmirleri.length, 1);
    assert.equal(satir.isEmirleri[0]?.istasyon, 'Deneme İstasyonu');
    assert.ok(satir.hazirlik !== null, 'hazırlık aynı okumada');
    const tek = hazirlikMatrisiCevabi.parse((await oku('cam', `/adimli-emirler/hazirlik-matrisi?emirler=${String(e.uretimEmriId)}`)).govde);
    assert.deepEqual(tek.emirler.map((x) => x.id), [e.uretimEmriId]);
    assert.equal((await oku('cam', '/adimli-emirler/hazirlik-matrisi?emirler=1,x')).durum, 400);
  });

  // Güvenlik K1, K2 (meclis/yanit/2748-Guvenlik.md): operatör matrisi okur; emir listesi, hazırlık özeti ve yazma uçları kapalı kalır.
  test('operatör matrisi okur, emir listesini ve yazma uçlarını okuyamaz; işlemsiz kişi matrisi de okuyamaz', async () => {
    const e = await emirAc(1);
    const [ie] = e.isEmriIdleri;
    const izinli = await oku('operator', `/adimli-emirler/hazirlik-matrisi?emirler=${String(e.uretimEmriId)}`);
    assert.equal(izinli.durum, 200, JSON.stringify(izinli.govde));
    assert.deepEqual(hazirlikMatrisiCevabi.parse(izinli.govde).emirler.map((x) => x.id), [e.uretimEmriId]);
    assert.equal((await oku('operator', '/adimli-emirler/hazirlik-matrisi')).durum, 200, 'bütün açık emirler');
    assert.equal((await oku('operator', '/adimli-emirler')).durum, 403, 'emir listesi kapalı');
    assert.equal((await oku('operator', `/adimli-emirler/${String(e.uretimEmriId)}`)).durum, 403, 'emir ayrıntısı kapalı');
    assert.equal((await oku('operator', `/adimli-emirler/hazirlik-ozeti?emirler=${String(e.uretimEmriId)}`)).durum, 403);
    assert.equal((await istek('operator', 'POST', `/adimli-emirler/${String(e.uretimEmriId)}/hazirlik-muafiyeti`, { madde: 'cnc', isEmriId: ie, gerekce: 'Deneme' })).durum, 403, 'muafiyet');
    assert.equal((await istek('operator', 'POST', '/arkon/hazirlik-maddeleri', { isEmriId: ie, ad: 'Deneme madde' })).durum, 403, 'ek madde ekleme');
    assert.equal((await istek('operator', 'POST', '/arkon/hazirlik-maddeleri/1/isaretle', { olay: 'tamamla' })).durum, 403, 'ek madde işaretleme');
    assert.equal((await oku('islemsiz', '/adimli-emirler/hazirlik-matrisi')).durum, 403);
  });
  // Güvenlik K-kod-1: dar uç muafiyetin kişisini ve gerekçesini operatöre vermez; muaf hâli madde durumunda görünür.
  test('muafiyetli emirde operatörün gövdesinde kişi ve gerekçe yok, muaf hâli var', async () => {
    const e = await emirAc(1);
    const [ie] = e.isEmriIdleri;
    const cozucu: HazirlikCozucusu = async (_db, idler) => new Map(idler.filter((x) => x === ie).map((x) => [x, { durum: 'suruyor' as const, secildi: true }]));
    const onceki = hazirlikCozucusuKaydet('cnc', cozucu);
    try {
      const verildi = await istek('mudur', 'POST', `/adimli-emirler/${String(e.uretimEmriId)}/hazirlik-muafiyeti`, { madde: 'cnc', isEmriId: ie, gerekce: 'Deneme gerekçe metni' });
      assert.equal(verildi.durum, 200, JSON.stringify(verildi.govde));
      const c = await oku('operator', `/adimli-emirler/hazirlik-matrisi?emirler=${String(e.uretimEmriId)}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      const metin = JSON.stringify(c.govde);
      for (const yasak of ['muafiyetler', 'kisiId', 'kisiAdi', 'gerekce', 'Deneme gerekçe metni']) assert.equal(metin.includes(yasak), false, yasak);
      const v = hazirlikMatrisiCevabi.parse(c.govde);
      assert.equal(v.emirler[0]?.hazirlik?.isEmirleri.find((i) => i.isEmriId === ie)?.maddeler.find((m) => m.madde === 'cnc')?.durum, 'muaf');
    } finally {
      hazirlikCozucusuKaydet('cnc', onceki);
    }
  });
});
