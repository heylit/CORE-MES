import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { OnTalepleriCevabi, TaleplerimCevabi, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('satin-alma fason ön talep (898 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerezYonetici = '';
  let cerezTalep = '';
  let cerezOkur = '';
  let firmaId = 0;
  let parcaNo = 0;
  let tipId = 0;
  let istasyonId = 0;
  let acik = 0;
  let acikEmir = 0;
  let gonderilmis = 0;
  let digerEmir = 0;

  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const kisiKur = async (kullaniciAdi: string, islemler: readonly string[]): Promise<string> => {
    const sahip = ortam!.sahip;
    const yoneticiRolu = (await sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!;
    const gecici = (await sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]))!;
    for (const islem of islemler) await sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    await ortam!.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    return giris(kullaniciAdi);
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: object) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': crypto.randomUUID() } : {}) },
    ...(govde === undefined ? {} : { payload: govde }),
  });
  const onTalepler = async (cerez = cerezTalep): Promise<OnTalepleriCevabi> => {
    const r = await istek(cerez, 'GET', '/satin-alma-on-talepleri');
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const hizmetTalebi = (kalemler: object[], uretimEmriId: number | null = null) => ({
    id: crypto.randomUUID(), tur: 'hizmet', ihtiyacTarihi: null, aciklama: '', uretimEmriId, kalemler,
  });
  const fasonKalemi = (ek: object = {}) => ({ ad: 'Deneme ısıl işlem', birim: 'adet', miktar: '12', ...ek });

  // Fason iş emri doğrudan yazılır: emir ve rota akışı bu testin konusu değildir (fason-sure.test.ts ile aynı kalıp).
  async function fasonIsEmri(g: { durum?: string; teslim?: string | null; gonderilen?: number }): Promise<{ isEmriId: number; emirId: number }> {
    const sahip = ortam!.sahip;
    const e = (await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no, teslim, iptal)
       VALUES ('P-OT', 'Deneme parça', 12, $1, $2, $3, $4, $5, CASE WHEN $3 = 'iptal' THEN now() END) RETURNING id`,
      [istasyonId, yoneticiId, g.durum ?? 'planli', parcaNo, g.teslim ?? null]))!;
    const ie = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun) VALUES ($1, 1, 30, $2, 'Deneme fason', $3, 4) RETURNING id",
      [e.id, tipId, firmaId]))!;
    if (g.gonderilen) {
      await sahip.sorgu("INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, kisi_id, zaman) VALUES ($1, 'gidis', $2, $3, now())", [ie.id, g.gonderilen, yoneticiId]);
    }
    return { isEmriId: ie.id, emirId: e.id };
  }

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_on_talep');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerezYonetici = await giris('yonetici');
    cerezTalep = await kisiKur('talep', ['satin-alma.talep-ac']);
    cerezOkur = await kisiKur('okur', ['satin-alma.oku']);
    const firma = await istek(cerezYonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Fason A', tur: 'tedarikci' });
    assert.equal(firma.statusCode, 200, firma.body);
    firmaId = (firma.json() as { firma: { id: number } }).firma.id;
    const ayar = await istek(cerezYonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(ayar.statusCode, 200, ayar.body);
    const kart = await istek(cerezYonetici, 'POST', '/malzeme-katalogu-kartlari/ot-kart-1/kaydet', {
      kayit: { id: 'ot-kart-1', tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 }, com: { kod: 'HM-SAT-00001', ad: 'Deneme mil', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: 'hammadde|on-talep|ot-kart-1', mukerrer_gerekcesi: null }, surum: null,
    });
    assert.equal(kart.statusCode, 200, kart.body);
    parcaNo = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'ot-kart-1'"))!.no;
    tipId = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('OTM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('OTI', 'Deneme istasyon', $1, true) RETURNING id", [im!.id]))!.id;
    ({ isEmriId: acik, emirId: acikEmir } = await fasonIsEmri({ teslim: '2026-11-03' }));
    gonderilmis = (await fasonIsEmri({ gonderilen: 3 })).isEmriId;
    await fasonIsEmri({ durum: 'iptal' });
    await fasonIsEmri({ durum: 'taslak', teslim: '2026-10-01' });
    digerEmir = (await fasonIsEmri({})).emirId;
  });
  after(async () => { await ortam?.kaldir(); });

  test('talep açabilen açık, gönderilmemiş fason adımları görür; satın almayı yalnız okuyan ve oturumsuz göremez', async () => {
    const l = await onTalepler();
    const ilk = l.onTalepler.find((x) => x.isEmriId === acik);
    assert.deepEqual(ilk && [ilk.kaynak, ilk.uretimEmriId, ilk.opNo, ilk.adim, ilk.miktar, ilk.birim, ilk.gerekenTarih, ilk.terminGun, ilk.firmaAdi, ilk.parca?.kod],
      ['fason', acikEmir, 30, 'Deneme fason', 12, 'adet', '2026-11-03', 4, 'Deneme Fason A', 'HM-SAT-00001']);
    assert.equal(l.onTalepler.some((x) => x.isEmriId === gonderilmis), false, 'firmaya gönderilmiş adım ön talep değildir');
    assert.equal(l.onTalepler.filter((x) => x.gerekenTarih === null).length, 1, 'iptal ve taslak emrin adımı gelmez; teslimsiz emir sonda');
    assert.equal(l.onTalepler.at(-1)?.gerekenTarih, null);
    assert.equal(l.onTalepler.some((x) => x.gerekenTarih === '2026-10-01'), false);
    assert.deepEqual(l.yoksayilanlar, []);
    assert.equal((await istek(cerezOkur, 'GET', '/satin-alma-on-talepleri')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/satin-alma-on-talepleri' })).statusCode, 401);
  });

  test('yoksayma nedenle yazılır, kişi sunucudan; geri alınır; açık olmayan adım ve boş neden reddedilir', async () => {
    assert.equal((await istek(cerezOkur, 'POST', '/satin-alma-on-talepleri/yoksay', { kaynak: 'fason', isEmriId: acik, neden: 'Deneme' })).statusCode, 403);
    assert.equal((await istek(cerezTalep, 'POST', '/satin-alma-on-talepleri/yoksay', { kaynak: 'fason', isEmriId: acik, neden: '  ' })).statusCode, 400);
    const yok = await istek(cerezTalep, 'POST', '/satin-alma-on-talepleri/yoksay', { kaynak: 'fason', isEmriId: 2147483647, neden: 'Deneme' });
    assert.equal(yok.statusCode, 400);
    assert.equal((yok.json() as { mesaj: string }).mesaj, ILETILER.fasonOnTalepYok);
    for (let i = 0; i < 2; i++) {
      assert.equal((await istek(cerezTalep, 'POST', '/satin-alma-on-talepleri/yoksay', { kaynak: 'fason', isEmriId: acik, neden: i === 0 ? 'Atölyede yapılacak' : 'İkinci' })).statusCode, 200);
    }
    const l = await onTalepler();
    assert.equal(l.onTalepler.some((x) => x.isEmriId === acik), false);
    assert.equal(l.yoksayilanlar.length, 1, 'ikinci yoksayma ilk kararı bozmaz');
    const y = l.yoksayilanlar[0]!;
    assert.deepEqual([y.neden, y.kisiAdi, y.baslik.includes('Op 30')], ['Atölyede yapılacak', 'Deneme talep', true]);
    assert.equal((await istek(cerezOkur, 'POST', '/satin-alma-on-talepleri/geri-al', { id: y.id })).statusCode, 403);
    assert.equal((await istek(cerezTalep, 'POST', '/satin-alma-on-talepleri/geri-al', { id: y.id })).statusCode, 200);
    assert.equal((await istek(cerezTalep, 'POST', '/satin-alma-on-talepleri/geri-al', { id: y.id })).statusCode, 404);
    assert.equal((await onTalepler()).onTalepler.some((x) => x.isEmriId === acik), true);
  });

  test('talebe çevrilen fason adım ön talepten düşer, ikinci kez çevrilmez; talep iptal olunca geri gelir', async () => {
    assert.equal((await istek(cerezOkur, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ isEmriId: acik })]))).statusCode, 403);
    const farkli = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ isEmriId: acik })], digerEmir));
    assert.equal(farkli.statusCode, 400);
    assert.equal((farkli.json() as { mesaj: string }).mesaj, ILETILER.fasonEmirFarkli);
    const r = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ isEmriId: acik, uygulananMalzemeNo: parcaNo })], acikEmir));
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    assert.equal(t.kaynak, 'fason');
    assert.deepEqual([t.kalemler[0]!.uygulanan, t.kalemler[0]!.fasonAdim?.endsWith('· Op 30')], ['HM-SAT-00001 · Deneme mil', true]);
    assert.equal((await onTalepler()).onTalepler.some((x) => x.isEmriId === acik), false);
    const ikinci = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ isEmriId: acik })]));
    assert.equal(ikinci.statusCode, 400);
    assert.equal((ikinci.json() as { mesaj: string }).mesaj, ILETILER.fasonOnTalepYok);
    const liste = await istek(cerezTalep, 'GET', '/satin-alma-taleplerim');
    const bulunan = (liste.json() as TaleplerimCevabi).talepler.find((x) => x.id === t.id);
    assert.deepEqual(bulunan && [bulunan.kaynak, bulunan.kalemler[0]!.uygulanan], ['fason', 'HM-SAT-00001 · Deneme mil']);
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [t.id]);
    assert.equal((await onTalepler()).onTalepler.some((x) => x.isEmriId === acik), true, 'iptal talebin bağı ön talebi tutmaz');
  });

  test('bağlar yalnız hizmette; uygulanan kart var olmalı; bağsız elle talep "elle" kalır', async () => {
    const malzeme = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', { ...hizmetTalebi([fasonKalemi({ uygulananMalzemeNo: parcaNo })]), tur: 'malzeme' });
    assert.equal(malzeme.statusCode, 400);
    assert.equal((malzeme.json() as { mesaj: string }).mesaj, ILETILER.bagYalnizHizmette);
    const kartsiz = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ uygulananMalzemeNo: 2147483647 })]));
    assert.equal(kartsiz.statusCode, 400);
    assert.equal((kartsiz.json() as { mesaj: string }).mesaj, ILETILER.uygulananKartYok);
    const ayni = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ isEmriId: acik }), fasonKalemi({ isEmriId: acik })]));
    assert.equal((ayni.json() as { mesaj: string }).mesaj, ILETILER.fasonTekrar);
    const elle = await istek(cerezTalep, 'POST', '/satin-alma-talepleri/hizli-ac', hizmetTalebi([fasonKalemi({ uygulananMalzemeNo: parcaNo })]));
    assert.equal(elle.statusCode, 200, elle.body);
    const t = elle.json() as Talebim;
    assert.deepEqual([t.kaynak, t.kalemler[0]!.uygulanan, t.kalemler[0]!.fasonAdim], ['elle', 'HM-SAT-00001 · Deneme mil', null]);
  });
});
