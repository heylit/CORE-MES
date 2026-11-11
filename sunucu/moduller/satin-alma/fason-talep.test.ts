import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, DisOperasyonAyrintisiCevabi, DisOperasyonlarCevabi, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ILETILER } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 2428 p2: fason talebi dış işlem emri açar ya da bağlar (SA-FAS-1). Kişi, firma, parça ve parti uydurmadır.
describe('satin-alma fason talebi ve dış işlem emri (2428, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let talepKisiId = 0;
  let cerezYonetici = '';
  let cerezTalep = '';
  let cerezOkur = '';
  let firmaId = 0;
  let parcaNo = 0;
  let hizmetNo = 0;
  let tipId = 0;
  let istasyonId = 0;

  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const kisiKur = async (kullaniciAdi: string, islemler: readonly string[]): Promise<{ cerez: string; id: number }> => {
    const sahip = ortam!.sahip;
    const yoneticiRolu = (await sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!;
    const gecici = (await sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]))!;
    for (const islem of islemler) await sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await ortam!.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await giris(kullaniciAdi), id };
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: object) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': crypto.randomUUID() } : {}) },
    ...(govde === undefined ? {} : { payload: govde }),
  });
  const fasonTalebi = (kalemler: object[], ek: object = {}) => ({
    id: crypto.randomUUID(), tur: 'fason', ihtiyacTarihi: '2026-12-01', aciklama: '', uretimEmriId: null, kalemler, ...ek,
  });
  const partiKalemi = (ek: object = {}) => ({ malzemeNo: hizmetNo, miktar: '5', aciklama: 'Deneme not', uygulananMalzemeNo: parcaNo, partiId: 900001, konumId: 7, ...ek });
  const emirKalemi = (isEmriId: number, ek: object = {}) => ({ ad: 'Deneme ısıl işlem', birim: 'adet', miktar: '12', isEmriId, ...ek });
  const red = async (govde: object, ileti: string) => {
    const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', govde);
    assert.equal(r.statusCode, 400, r.body);
    assert.equal((r.json() as { mesaj: string }).mesaj, ileti);
  };
  const belgeSayisi = async () => Number((await ortam!.sahip.tek<{ n: string }>('SELECT count(*) AS n FROM uretim_emirleri_dis_islem_emri'))!.n);
  const kalemDiesi = async (talepId: string) => (await ortam!.sahip.sorgu<{ dieId: number | null; isEmriId: number | null }>(
    'SELECT die_id AS "dieId", is_emri_id AS "isEmriId" FROM satin_alma_talep_kalemi WHERE talep_id = $1 ORDER BY sira', [talepId]));

  // Fason iş emri doğrudan yazılır (on-talep.test.ts ile aynı kalıp); plandan açılma tetikleyicisi belgeyi kendisi açar.
  async function fasonIsEmri(): Promise<{ isEmriId: number; emirId: number }> {
    const sahip = ortam!.sahip;
    const e = (await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no)
       VALUES ('P-FT', 'Deneme parça', 12, $1, $2, 'planli', $3) RETURNING id`, [istasyonId, yoneticiId, parcaNo]))!;
    const ie = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun) VALUES ($1, 1, 30, $2, 'Deneme fason', $3, 4) RETURNING id",
      [e.id, tipId, firmaId]))!;
    return { isEmriId: ie.id, emirId: e.id };
  }
  const kartKaydet = async (kimlik: string, kayit: object, anahtar: string | null) => {
    const r = await istek(cerezYonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, ...kayit, onay: { durum: 'aktif' } }, ozet: { benzersiz_anahtar: anahtar, mukerrer_gerekcesi: null }, surum: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    return (await ortam!.sahip.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  };

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_fason_talep');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerezYonetici = await giris('yonetici');
    ({ cerez: cerezTalep, id: talepKisiId } = await kisiKur('talep', ['satin-alma.talep-ac']));
    cerezOkur = (await kisiKur('okur', ['satin-alma.oku'])).cerez;
    const firma = await istek(cerezYonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Fason A', tur: 'tedarikci' });
    assert.equal(firma.statusCode, 200, firma.body);
    firmaId = (firma.json() as { firma: { id: number } }).firma.id;
    const ayar = await istek(cerezYonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(ayar.statusCode, 200, ayar.body);
    parcaNo = await kartKaydet('ft-parca-1', {
      tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 }, com: { kod: 'HM-SAT-00001', ad: 'Deneme mil', birim: 'adet' },
    }, 'hammadde|fason-talep|ft-parca-1');
    hizmetNo = await kartKaydet('ft-hizmet-1', {
      tur: 'hizmet', com: { kod: 'HZ-SAT-00001', ad: 'Deneme ısıl işlem', birim: 'adet' }, g: { kat: 'fason', yon: 'Alınan', cesit: 'Isıl işlem' },
    }, null);
    tipId = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('FTM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('FTI', 'Deneme istasyon', $1, true) RETURNING id", [im!.id]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('SA-FAS-1: fason kalemi tek kaynak taşır; partide işlem kartı, parça ve tam sayı adet zorunlu; parti yalnız fasonda; reddedilen talep belge açmaz', async () => {
    const { isEmriId } = await fasonIsEmri();
    const once = await belgeSayisi();
    await red(fasonTalebi([{ ad: 'Deneme', birim: 'adet', miktar: '1' }]), ILETILER.fasonKaynakTek);
    await red(fasonTalebi([partiKalemi({ isEmriId })]), ILETILER.fasonKaynakTek);
    await red(fasonTalebi([partiKalemi({ malzemeNo: null, ad: 'Deneme', birim: 'adet' })]), ILETILER.fasonIslemYok);
    await red(fasonTalebi([partiKalemi({ uygulananMalzemeNo: null })]), ILETILER.fasonParcaYok);
    await red(fasonTalebi([partiKalemi({ miktar: '2.5' })]), ILETILER.fasonAdetTam);
    await red(fasonTalebi([emirKalemi(isEmriId, { konumId: 7 })]), ILETILER.partiYalnizFasonda);
    await red(fasonTalebi([partiKalemi()], { tur: 'hizmet' }), ILETILER.partiYalnizFasonda);
    await red(fasonTalebi([partiKalemi()], { tur: 'malzeme' }), ILETILER.partiYalnizFasonda);
    await red(fasonTalebi([partiKalemi({ malzemeNo: parcaNo })]), ILETILER.kartTuruTalepteYok);
    // Bir kalem düşünce talep de diğer kalemin belgesi de açılmaz.
    await red(fasonTalebi([partiKalemi(), emirKalemi(2147483647)]), ILETILER.fasonOnTalepYok);
    assert.equal(await belgeSayisi(), once);
    assert.equal((await istek(cerezOkur, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([partiKalemi()]))).statusCode, 403);
  });

  test('emrin fason adımında var olan belge bağlanır, ikincisi açılmaz; partide talepten yeni belge açılır', async () => {
    const { isEmriId } = await fasonIsEmri();
    const plandan = (await ortam!.sahip.tek<{ id: number; acilis: string }>(
      'SELECT id, acilis FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [isEmriId]))!;
    assert.equal(plandan.acilis, 'plan');
    const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([emirKalemi(isEmriId, { uygulananMalzemeNo: parcaNo }), partiKalemi()]));
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    assert.equal(t.kaynak, 'fason');
    const [emirBagi, partiBagi] = await kalemDiesi(t.id);
    assert.deepEqual(emirBagi, { dieId: plandan.id, isEmriId });
    assert.equal(Number((await ortam!.sahip.tek<{ n: string }>('SELECT count(*) AS n FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [isEmriId]))!.n), 1);
    const parti = (await ortam!.sahip.tek<Record<string, unknown>>(
      `SELECT parti_id AS "partiId", konum_id AS "konumId", malzeme_no AS "malzemeNo", hizmet_no AS "hizmetNo", adet, termin::text AS termin,
              aciklama, acilis, olusturan_kisi_id AS kisi, fason_firma_id AS firma FROM uretim_emirleri_dis_islem_emri WHERE id = $1`, [partiBagi!.dieId]))!;
    assert.deepEqual(parti, {
      partiId: 900001, konumId: 7, malzemeNo: parcaNo, hizmetNo, adet: 5, termin: '2026-12-01', aciklama: 'Deneme not', acilis: 'talep', kisi: talepKisiId, firma: null,
    });
    assert.equal(partiBagi!.isEmriId, null);
  });

  test('Dış operasyonlar emir satırında belgeyi, parti belgesini ayrı listede verir; ayrıntı bağlı kalem ve sipariş satırını taşır', async () => {
    const { isEmriId } = await fasonIsEmri();
    const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([partiKalemi({ partiId: 900002, konumId: null, miktar: '3' })]));
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    const dieId = (await kalemDiesi(t.id))[0]!.dieId!;
    const s = ortam!.sahip;
    const kalemId = (await s.tek<{ id: string }>('SELECT id FROM satin_alma_talep_kalemi WHERE talep_id = $1', [t.id]))!.id;
    const teklif = crypto.randomUUID();
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, tedarikci_adi, teklif_tarihi, para_birimi, kur) VALUES ($1, $2, 'Deneme fasoncu', current_date, 'TRY', 1)", [t.id, teklif]);
    await s.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, 10)', [t.id, teklif, kalemId]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t.id, teklif]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, 'SA-FT-1', 'SA-FT-1', current_date)", [t.id, teklif]);
    const satir = (await s.tek<{ id: number }>(
      "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 3, 'adet') RETURNING id", [t.id, teklif, kalemId]))!.id;

    assert.equal((await istek(cerezTalep, 'GET', '/satin-alma-dis-operasyonlar')).statusCode, 403);
    const l = await istek(cerezOkur, 'GET', '/satin-alma-dis-operasyonlar');
    assert.equal(l.statusCode, 200, l.body);
    const c = l.json() as DisOperasyonlarCevabi;
    const emirSatiri = c.operasyonlar.find((x) => x.isEmriId === isEmriId);
    assert.match(emirSatiri?.dieNo ?? '', /^DIE-\d{6}$/);
    assert.equal(emirSatiri?.durum, 'acik');
    const p = c.partiOperasyonlari.find((x) => x.id === dieId);
    assert.deepEqual(p && [p.kaynak, p.durum, p.adet, p.malzeme?.kod, p.hizmet?.kod, p.siparisSatirId, p.firmaAdi],
      [{ tur: 'parti', partiId: 900002, konumId: null }, 'acik', 3, 'HM-SAT-00001', 'HZ-SAT-00001', satir, null]);

    const a = await istek(cerezOkur, 'GET', `/satin-alma-dis-operasyonlar/${dieId}`);
    assert.equal(a.statusCode, 200, a.body);
    const ay = a.json() as DisOperasyonAyrintisiCevabi;
    assert.equal(ay.disIslemEmri.id, dieId);
    assert.deepEqual(ay.talepKalemleri.map((x) => [x.talepId, x.kalemId, x.miktar, x.durum]), [[t.id, kalemId, '3', 'taslak']]);
    assert.deepEqual(ay.siparisSatirlari, [{ id: satir, talepId: t.id, siparisNo: 'SA-FT-1', miktar: '3', birim: 'adet', tedarikciAdi: 'Deneme fasoncu' }]);
    assert.equal((await istek(cerezOkur, 'GET', '/satin-alma-dis-operasyonlar/2147483647')).statusCode, 404);
    assert.equal((await istek(cerezTalep, 'GET', `/satin-alma-dis-operasyonlar/${dieId}`)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api/satin-alma-dis-operasyonlar/${dieId}` })).statusCode, 401);
  });

  test('Mimar p2 notu: taslakta silinen fason iş emri belgesini götürür; talep kalemi kalır, bağları boşalır', async () => {
    const { isEmriId } = await fasonIsEmri();
    const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([emirKalemi(isEmriId)]));
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    assert.notEqual((await kalemDiesi(t.id))[0]!.dieId, null);
    await ortam!.sahip.sorgu('DELETE FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]);
    assert.deepEqual(await kalemDiesi(t.id), [{ dieId: null, isEmriId: null }]);
  });
  // 2881 (karar 2879 a): fason kaleminin revizyonu hizmet kartının değil uygulanacak parçanındır. Teklif anında yürürlükteki revizyon
  // kalem bağında gelir; sipariş satırına sipariş anında parçanın revizyonu sabitlenir; stoka giden satır revizyonun kartını taşır.
  test('2881: fason sipariş satırının revizyonu uygulanacak parçadan; teklifte o anki, siparişte sabitlenen', async () => {
    const revizyon = new Map<number, string>([[parcaNo, 'C'], [hizmetNo, 'HZ']]);
    servis.parcaRevizyonuCozucusuKaydet(async (_db, nolar) => new Map(nolar.flatMap((n): [number, string][] => (revizyon.has(n) ? [[n, revizyon.get(n)!]] : []))));
    try {
      const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([partiKalemi({ partiId: 900003, konumId: null, miktar: '2' })]));
      assert.equal(r.statusCode, 200, r.body);
      const t = r.json() as Talebim;
      const s = ortam!.sahip;
      const kalemId = (await s.tek<{ id: string }>('SELECT id FROM satin_alma_talep_kalemi WHERE talep_id = $1', [t.id]))!.id;
      const teklif = crypto.randomUUID();
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, tedarikci_adi, teklif_tarihi, para_birimi, kur) VALUES ($1, $2, 'Deneme fasoncu', current_date, 'TRY', 1)", [t.id, teklif]);
      await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t.id, teklif]);
      await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, 'SA-FT-2', 'SA-FT-2', current_date)", [t.id, teklif]);
      const satir = (await s.tek<{ id: number }>(
        "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 2, 'adet') RETURNING id", [t.id, teklif, kalemId]))!.id;

      // Kataloğa bağlanmamış (kart bekleyen) ama uygulanacak parçası seçilmiş kalem de parçasının revizyonunu alır (Test 2).
      const kartsizKalem = crypto.randomUUID();
      await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, uygulanan_malzeme_no) VALUES ($1, $2, 2, 'Deneme kartsız işlem', $3)", [t.id, kartsizKalem, parcaNo]);
      const kartsiz = (await s.tek<{ id: number }>(
        "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 1, 'adet') RETURNING id", [t.id, teklif, kartsizKalem]))!.id;

      // Revizyonu yazılacak satırın kartı parçadır, hizmet kartı değil.
      assert.deepEqual(await ortam!.vt.tx((db) => sorgular.revizyonsuzSiparisSatirlari(db, t.id)),
        [{ id: satir, malzemeNo: parcaNo }, { id: kartsiz, malzemeNo: parcaNo }]);
      // Bu kayıttan önce var olan satır yazılmaz (Test B1).
      assert.deepEqual(await ortam!.vt.tx((db) => sorgular.revizyonsuzSiparisSatirlari(db, t.id, [satir])), [{ id: kartsiz, malzemeNo: parcaNo }]);
      await s.sorgu('DELETE FROM satin_alma_siparis_satiri WHERE id = $1', [kartsiz]);
      // Stok: eşleşme hizmet kartıyla kalır, revizyon parçadan sorulur.
      const [okunan] = await ortam!.vt.tx((db) => servis.siparisSatirlari(db, [satir]));
      assert.deepEqual([okunan?.malzemeNo, okunan?.revizyonMalzemeNo], [hizmetNo, parcaNo]);

      await s.sorgu("UPDATE satin_alma_siparis_satiri SET parca_revizyonu = 'B' WHERE id = $1", [satir]);
      assert.deepEqual(await ortam!.vt.tx((db) => sorgular.revizyonsuzSiparisSatirlari(db, t.id)), []);
      const a = await istek(cerezOkur, 'GET', '/satin-alma-acilis');
      assert.equal(a.statusCode, 200, a.body);
      const talep = (a.json() as AcilisCevabi).talepler.find((x) => x.id === t.id)!;
      assert.equal(talep.kalemBaglari?.[0]?.uygulanan?.revizyon, 'C');
      assert.equal(talep.karar?.siparisler[0]?.satirlar[0]?.parcaRevizyonu, 'B');
    } finally {
      servis.parcaRevizyonuCozucusuKaydet(async () => new Map());
    }
  });

  // 2881 Test B1: revizyon yalnız o kayıtta yeni açılan sipariş satırına yazılır. Revizyonsuz kalmış eski satır (2881 öncesi fason
  // siparişi) talep sonradan kaydedilince kayıt anının revizyonuyla dolmaz; sipariş anındaki revizyon bilinmez, boş kalır.
  test('2881: talep yeniden kaydedilince revizyonsuz eski sipariş satırı dolmaz', async () => {
    servis.parcaRevizyonuCozucusuKaydet(async (_db, nolar) => new Map(nolar.map((n): [number, string] => [n, 'D'])));
    try {
      const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', fasonTalebi([partiKalemi({ partiId: 900004, konumId: null, miktar: '2' })]));
      assert.equal(r.statusCode, 200, r.body);
      const t = r.json() as Talebim;
      const s = ortam!.sahip;
      const kalemId = (await s.tek<{ id: string }>('SELECT id FROM satin_alma_talep_kalemi WHERE talep_id = $1', [t.id]))!.id;
      const teklif = crypto.randomUUID();
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, tedarikci_adi, teklif_tarihi, para_birimi, kur) VALUES ($1, $2, 'Deneme fasoncu', current_date, 'TRY', 1)", [t.id, teklif]);
      await s.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, 10)', [t.id, teklif, kalemId]);
      await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t.id, teklif]);
      await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, 'SA-FT-3', 'SA-FT-3', current_date)", [t.id, teklif]);
      const satir = (await s.tek<{ id: number }>(
        "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 2, 'adet') RETURNING id", [t.id, teklif, kalemId]))!.id;
      await s.sorgu("UPDATE satin_alma_talep SET durum = 'siparis_verildi' WHERE id = $1", [t.id]);

      const a = await istek(cerezYonetici, 'GET', '/satin-alma-acilis');
      assert.equal(a.statusCode, 200, a.body);
      const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...govde } = (a.json() as AcilisCevabi).talepler.find((x) => x.id === t.id)!;
      const k = await istek(cerezYonetici, 'POST', `/satin-alma-talepleri/${t.id}/kaydet`, { ...govde, notlar: 'Deneme yeniden kayıt' });
      assert.equal(k.statusCode, 200, k.body);
      const rev = await s.tek<{ rev: string | null; n: number }>(
        'SELECT parca_revizyonu AS rev, (SELECT count(*)::int FROM satin_alma_siparis_satiri WHERE talep_id = $2) AS n FROM satin_alma_siparis_satiri WHERE id = $1', [satir, t.id]);
      assert.deepEqual(rev, { rev: null, n: 1 }, 'satır yerinde kalır, revizyonu boş kalır');
    } finally {
      servis.parcaRevizyonuCozucusuKaydet(async () => new Map());
    }
  });
});
