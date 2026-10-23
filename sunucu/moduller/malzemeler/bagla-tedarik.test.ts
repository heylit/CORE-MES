import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, OlcuBirimleriCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { malzemeAra, malzemeOzetleri, olcuBirimleri } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Bağlama tur 1, tedarik (kart #163, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<string> {
    const c = await istek(yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return String(c.json().mesaj);
  }

  // Onay akışı kapalı: kart doğrudan aktif açılır (bu dosya birim ve aramayı ölçer, onayı değil).
  let sayac = 0;
  const kartGovdesi = (kimlik: string, o: { tur?: string; kod?: string; ad?: string; birim?: string; kat?: string; durum?: string }, surum: number | null = null) => ({
    kayit: {
      id: kimlik, tur: o.tur ?? 'hammadde', fam: 'metal',
      com: { kod: o.kod ?? 'HM-BGL-00001', ...(o.ad ? { ad: o.ad } : {}), ...(o.birim ? { birim: o.birim } : {}) },
      ...(o.kat ? { g: { kat: o.kat } } : {}), onay: { durum: o.durum ?? 'aktif' },
    },
    ozet: { benzersiz_anahtar: `${o.tur ?? 'hammadde'}|bagla|${kimlik}`, mukerrer_gerekcesi: null },
    surum,
  });
  async function kartAc(o: Parameters<typeof kartGovdesi>[1]): Promise<{ kimlik: string; no: number; surum: number }> {
    const kimlik = `bg${++sayac}`;
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, o));
    const no = (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
    return { kimlik, no, surum: r.surum };
  }
  const malzemeAyari = (deger: Record<string, unknown>) => tamam('POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger });
  const birimler = async (): Promise<Record<string, boolean>> =>
    Object.fromEntries((await tamam<OlcuBirimleriCevabi>('GET', '/malzeme-birimleri')).birimler.map((b) => [b.kod, b.aktif]));

  before(async () => {
    ortam = await testVeritabaniKur('malzemebagla');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme bağla', kullaniciAdi: 'bg-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'bg-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('birim listesi: göç prototipin yerleşik birimlerini getirir; kart listedeki birimi alır, listede olmayanı 422 ile alamaz', async () => {
    const b = await birimler();
    for (const kod of ['adet', 'kg', 'm', 'm²', 'levha', 'rulo', 'torba', 'takım', 'set', 'kutu', 'paket', 'L', 'makara', 'çift', 'tüp']) {
      assert.equal(b[kod], true, kod);
    }
    await kartAc({ birim: 'kg' });
    const k = `bg${++sayac}`;
    const mesaj = await ret(422, 'GECERSIZ', 'POST', `/malzeme-katalogu-kartlari/${k}/kaydet`, kartGovdesi(k, { birim: 'koli' }));
    assert.match(mesaj, /"koli" birim listesinde yok/);
    assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik = $1', [k]), null);
  });

  test('birimi listede olmayan eski kart birimi değişmeden kaydedilir; birim değişirse listedeki birim gerekir', async () => {
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 10) ON CONFLICT (onek) DO NOTHING', ['HM-ESK-']);
    await vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('bg-eski', 'hammadde', 'HM-ESK-', 1, 'aktif', $1, $2, $2)`,
      [JSON.stringify({ id: 'bg-eski', tur: 'hammadde', fam: 'metal', com: { kod: 'HM-ESK-00001', birim: 'eski-birim' }, onay: { durum: 'aktif' } }), kisiId],
    );
    const surum = (await vt().tek<{ surum: number }>(`SELECT surum FROM malzeme_katalog_karti WHERE kimlik = 'bg-eski'`))!.surum;
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/bg-eski/kaydet',
      kartGovdesi('bg-eski', { kod: 'HM-ESK-00001', birim: 'eski-birim', ad: 'Eski kart' }, surum));
    await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/bg-eski/kaydet', kartGovdesi('bg-eski', { kod: 'HM-ESK-00001', birim: 'yeni-birim' }, r.surum));
    await tamam('POST', '/malzeme-katalogu-kartlari/bg-eski/kaydet', kartGovdesi('bg-eski', { kod: 'HM-ESK-00001', birim: 'adet' }, r.surum));
  });

  test('ML2 b: Ayarlar listesine eklenen birim aynı kayıtta tabloya girer; gizlenen yalnız bütün listelerinde gizliyse pasif olur', async () => {
    await malzemeAyari({ listeler: { 'birim|sarf': { ekle: ['koli'], gizle: [] } } });
    assert.equal((await birimler())['koli'], true);
    await kartAc({ tur: 'sarf', kod: 'SF-BGL-00001', birim: 'koli', kat: 'genel' });
    // kg yerleşik olarak beş listede (hizmet dahil): yalnız birinde gizlenince seçilebilir kalır, beşinde gizlenince pasif olur.
    await malzemeAyari({ listeler: { 'birim|sarf': { ekle: ['koli'], gizle: ['koli', 'kg'] } } });
    let b = await birimler();
    assert.deepEqual([b['koli'], b['kg']], [false, true]);
    const k = `bg${++sayac}`;
    await ret(422, 'GECERSIZ', 'POST', `/malzeme-katalogu-kartlari/${k}/kaydet`, kartGovdesi(k, { tur: 'sarf', kod: 'SF-BGL-00001', birim: 'koli' }));
    const hepsi = { ekle: [], gizle: ['kg'] };
    await malzemeAyari({ listeler: { birim: hepsi, 'birim|yarimamul': hepsi, 'birim|mamul': hepsi, 'birim|sarf': hepsi, 'birim|hizmet': hepsi } });
    b = await birimler();
    assert.deepEqual([b['kg'], b['koli']], [false, false], 'ayardan çıkan eklenmiş birim de pasif');
    await malzemeAyari({ listeler: {} });
    assert.equal((await birimler())['kg'], true);
    // Pasif birim satırı silinmez: eski kart ve Logo karşılığı ona bağlı kalır.
    assert.equal((await vt().tx((db) => olcuBirimleri(db))).some((x) => x.kod === 'koli' && !x.aktif), true);
  });

  test('ML2 b: geçersiz birim (41 karakter) ayar kaydını 400 ile durdurur; ayar ve tablo değişmez', async () => {
    await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { listeler: { birim: { ekle: ['x'.repeat(41), 'yeni-gecerli'] } } } });
    assert.equal((await birimler())['yeni-gecerli'], undefined);
    const ayar = await vt().tek<{ deger: Record<string, unknown> }>(`SELECT deger FROM malzeme_katalog_ayari WHERE anahtar = 'malzeme'`);
    assert.deepEqual(ayar?.deger, { listeler: {} });
  });

  test('ML2 b: Ayarlar\'a eklenen sarf kategorisi tabloya girer, özette adıyla döner; gizlenen yerleşik kategori pasif olur', async () => {
    await malzemeAyari({ kategoriler: { sarf: [{ key: 'ofis', ad: 'Ofis malzemesi', kod: 'OFS' }], demirbas: [] }, gizliKategoriler: ['sarf|kaynak'] });
    const satirlar = await vt().sorgu<{ kod: string; ad: string; kisa_kod: string; aktif: boolean }>(
      `SELECT kod, ad, kisa_kod, aktif FROM malzeme_kategorisi WHERE tur = 'sarf' AND kod IN ('ofis', 'kaynak', 'takim') ORDER BY kod`);
    assert.deepEqual(satirlar.map((x) => [x.kod, x.ad, x.kisa_kod, x.aktif]), [
      ['kaynak', 'Kaynak sarfı', 'KYN', false], ['ofis', 'Ofis malzemesi', 'OFS', true], ['takim', 'Kesici takım', 'TKM', true],
    ]);
    const ofis = await kartAc({ tur: 'sarf', kod: 'SF-OFS-00001', birim: 'paket', ad: 'Kağıt', kat: 'ofis' });
    // Listede olmayan kategoriyle kart artık kaydolmaz (malzeme denetimi 1/5); kuraldan önce kaydolmuş eski kart elle kurulur.
    const bilinmeyen = await kartAc({ tur: 'sarf', kod: 'SF-GEN-00001', birim: 'adet', ad: 'Bilinmeyen', kat: 'takim' });
    await vt().sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{g,kat}', '"yok-boyle"') WHERE no = $1`, [bilinmeyen.no]);
    const ham = await kartAc({ birim: 'kg', ad: 'Sac', kat: 'ofis' });
    const o = await vt().tx((db) => malzemeOzetleri(db, [ofis.no, bilinmeyen.no, ham.no]));
    assert.deepEqual([o.get(ofis.no)?.kategori, o.get(ofis.no)?.kategoriAdi], ['ofis', 'Ofis malzemesi']);
    assert.deepEqual([o.get(bilinmeyen.no)?.kategori, o.get(bilinmeyen.no)?.kategoriAdi], ['yok-boyle', null]);
    assert.deepEqual([o.get(ham.no)?.kategori, o.get(ham.no)?.kategoriAdi], [null, null], 'hammaddede kategori yok');
    await malzemeAyari({ kategoriler: { sarf: [] }, gizliKategoriler: [] });
    const sonra = await vt().sorgu<{ kod: string; aktif: boolean }>(`SELECT kod, aktif FROM malzeme_kategorisi WHERE tur = 'sarf' AND kod IN ('ofis', 'kaynak') ORDER BY kod`);
    assert.deepEqual(sonra.map((x) => [x.kod, x.aktif]), [['kaynak', true], ['ofis', false]]);
  });

  test('malzemeOzetleri: boş dizide boş harita; yinelenen kimlik tek kayıt; olmayan kimlik haritada yok', async () => {
    const a = await kartAc({ birim: 'kg', ad: 'Özet A' });
    await vt().tx(async (db) => {
      assert.equal((await malzemeOzetleri(db, [])).size, 0);
      const o = await malzemeOzetleri(db, [a.no, a.no, 999999]);
      assert.deepEqual([...o.keys()], [a.no]);
      assert.deepEqual(o.get(a.no), {
        id: a.no, kimlik: a.kimlik, kod: o.get(a.no)!.kod, tur: 'hammadde', ad: 'Özet A', birim: 'kg', onayDurumu: 'aktif', kategori: null, kategoriAdi: null, hizmetYonu: null,
      });
    });
  });

  test('malzemeAra: kodda ve adda harf duyarsız arar, sayı kart no da eşleşir; tür ve aktif süzgeci; iptal aranmaz; sayfalı ve toplamlı', async () => {
    const vida = await kartAc({ tur: 'sarf', kod: 'SF-ARA-00001', birim: 'adet', ad: 'Ara Vida M8', kat: 'baglanti' });
    const somun = await kartAc({ tur: 'sarf', kod: 'SF-ARA-00001', birim: 'adet', ad: 'Ara somun', kat: 'baglanti', durum: 'taslak' });
    const yuzde = await kartAc({ kod: 'HM-ARA-00001', birim: 'kg', ad: 'Ara %50 karışım' });
    const iptal = await kartAc({ kod: 'HM-ARA-00001', birim: 'kg', ad: 'Ara iptal', durum: 'taslak' });
    await tamam('POST', `/malzeme-katalogu-kartlari/${iptal.kimlik}/iptal`);
    await vt().tx(async (db) => {
      const adlar = async (g: Parameters<typeof malzemeAra>[1]) => (await malzemeAra(db, g)).satirlar.map((x) => x.ad);
      assert.deepEqual(await adlar({ metin: 'ARA ', sayfa: 1 }), ['Ara %50 karışım', 'Ara Vida M8', 'Ara somun']);
      assert.deepEqual(await adlar({ metin: 'sf-ara', sayfa: 1 }), ['Ara Vida M8', 'Ara somun']);
      assert.deepEqual(await adlar({ metin: 'ara', turler: ['sarf'], yalnizAktif: true, sayfa: 1 }), ['Ara Vida M8']);
      assert.ok((await malzemeAra(db, { metin: String(somun.no), sayfa: 1, sayfaBoyu: 200 })).satirlar.some((x) => x.id === somun.no), 'kart no');
      assert.deepEqual(await adlar({ metin: '%', sayfa: 1 }), ['Ara %50 karışım'], '% joker değil');
      assert.deepEqual(await adlar({ metin: 'a_a', sayfa: 1 }), [], '_ joker değil');
      const s1 = await malzemeAra(db, { metin: 'ara', sayfa: 1, sayfaBoyu: 2 });
      const s2 = await malzemeAra(db, { metin: 'ara', sayfa: 2, sayfaBoyu: 2 });
      assert.deepEqual([s1.toplam, s1.satirlar.length, s2.toplam, s2.satirlar.map((x) => x.id)], [3, 2, 3, [somun.no]]);
      assert.deepEqual({ sayfa: s2.sayfa, sayfaBoyu: s2.sayfaBoyu }, { sayfa: 2, sayfaBoyu: 2 });
      const bos = await malzemeAra(db, { metin: 'ara', sayfa: 9, sayfaBoyu: 2 });
      assert.deepEqual([bos.toplam, bos.satirlar.length], [3, 0], 'sayfa dışında toplam yine doğru');
      assert.ok((await malzemeAra(db, { metin: null, sayfa: 1, sayfaBoyu: 500 })).sayfaBoyu === 200, 'sayfa boyu en çok 200');
      assert.equal((await adlar({ metin: '  ', sayfa: 1 })).includes('Ara iptal'), false);
      void vida; void yuzde;
    });
  });

  test('ML1 a: Logo birim karşılığı listedeki birime bağlıdır; listede olmayan birime karşılık yazılamaz', async () => {
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    const mesaj = await ret(409, 'BAGIMLI_KAYIT', 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'listede-yok', logoDegeri: '06' });
    assert.equal(mesaj, 'Birim, birim listesinde yok.');
    await assert.rejects(
      vt().sorgu(`INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('birim', 'listede-yok', '06', $1)`, [kisiId]),
      /malzeme_logo_karsiligi_birim/,
    );
    // Tür karşılığı birim anahtarına bakmaz.
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: '13' });
  });
});
