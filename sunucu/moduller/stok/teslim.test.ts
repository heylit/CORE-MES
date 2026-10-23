import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { gelecekSepetCevabi, isMalzemeleriCevabi, kodCozCevabi, lotBekleyenKartlarCevabi, refakatIziCevabi, refakatLotaBaglaCevabi, refakatKartSatirlariCevabi, refakatPartileriCevabi, refakatPartisiCevabi, refakatPartisiKartiCevabi, sepetTeslimEtCevabi, istasyonSepetiCevabi, istekMalzemeleriCevabi, malzemeIstegiCevabi, malzemeYerleriCevabi, kisiKoduCevabi, okutarakAlCevabi, okutCozCevabi, teslimCevabi, teslimKutusuCevabi, toplamaAyrintiCevabi, yerdekiStokCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { SepetTeslimEtCevabi, IsMalzemeleriCevabi, IstasyonSepetiCevabi, KodCozCevabi, RefakatPartisiCevabi, RefakatPartisiKartiCevabi, IstekMalzemeleriCevabi, MalzemeIstegiCevabi, MalzemeYerleriCevabi, OkutarakAlCevabi, OkutCozCevabi, TeslimCevabi, TeslimKutusuCevabi, ToplamaAyrintiCevabi, UretimHazirligiCevabi, YerdekiStokCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adimliEmirAyrintisi, emirIptalEt, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { adimCiktisiCozucusuKaydet, adimStatusuCozucusuKaydet, cikisYap, emirTamamlamaOku, geriAl, hurdaSayimiYansit, istasyondanTeslimEdilen, kaliteKarariYansit, kisiKodu, konumAc, statuDegistir, suresiDolanTeslimleriIptal, uretimGirdiUyarisi, uretimSayimiYansit } from './servis.ts';
import { emirlerinNetSarfi, emirMalzemeFisleri, emrinRefakatKartlari, istasyonKonumlari, malzemeStokDurumlari, numuneTeslimi } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Malzeme · Teslim (kart #1208): STK-T1 (stok yok), STK-T2 (yalnız yoldayken kapanır), STK-T3 (iptal gönderenin),
// STK-T4 (alan taraf: istasyon kapsamı ya da depo işlemi), STK-T5 (isteğe bağlı teslim); Hazırlık (STK-H1..H4): listedeki istek,
// kısmi toplama, yolda teslim ve bitişte dağıtım. Her kural için izinli ve reddedilen durum.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = {
  depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'],
  operator: ['stok.istek'],
  kalite: ['stok.istek'],
  // Hazırlık listesi açabilir ama istek karşılayamaz (stok.transfer yok).
  sevkiyat: ['stok.toplama'],
};

interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string; alan?: string }

describe('stok: malzeme · teslim (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let denemeProjeId = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  // Emrin kaynak rotası gerçek bir revizyon olmalı; iptal durumunda açılır ki testin kendi rotasıyla tekil dizinlere çarpmasın.
  const revizyonlar = new Map<number, Promise<number>>();
  const revizyon = (malzemeNo: number): Promise<number> => {
    let id = revizyonlar.get(malzemeNo);
    if (!id) {
      id = o().sahip.tek<{ id: number }>(
        `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
         SELECT k.no, CASE WHEN k.tur = 'mamul' THEN 'mamul' ELSE 'yarimamul' END, 'ZZ', 'iptal', p.id, p.id, now()
           FROM malzeme_katalog_karti k, (SELECT min(id) AS id FROM kisi) p WHERE k.no = $1 RETURNING id`, [malzemeNo]).then((r) => r!.id);
      revizyonlar.set(malzemeNo, id);
    }
    return id;
  };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let sira = 0;
  async function kart(tur: 'hammadde' | 'yarimamul' | 'mamul' | 'hizmet', birim?: string): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['TSL-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, 'TSL-DNM-', $3, 'aktif', $4, $5, $5, $6) RETURNING no`,
      [`tsl-dnm-${sira}`, tur, sira, JSON.stringify({ id: `tsl-dnm-${sira}`, com: { ad: `Teslim deneme ${sira}`, ...(birim ? { birim } : {}) } }), kisiler.get('yonetici'), tur === 'hizmet' ? 'alinan' : null],
    );
    return r!.no;
  }
  async function istasyon(): Promise<{ id: number; isMerkeziId: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`TIM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`TIS${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    // UE20: iş başlatan operatör bu istasyonda yetkindir. Kapsam testlerinin kişileri yetkin değildir: yetkinlik iş merkezi kapsamını genişletir.
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    return { id: ist!.id, isMerkeziId: im!.id };
  }
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string) => {
    const c = await istek<Hata>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  const bakiye = async (malzemeId: number, konumId: number, statuId: number | null = null): Promise<string | null> =>
    (await o().vt.tek<{ m: string | null }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3',
      [malzemeId, konumId, statuId]))?.m ?? null;
  const istasyonKonumu = async (istasyonId: number): Promise<number | null> => o().vt.tx((db) => sorgular.istasyonKonumu(db, istasyonId));
  const gonder = (kim: string, g: Record<string, unknown>) =>
    istek<TeslimCevabi & Hata>(kim, 'POST', '/stok/teslimler/gonder', { statuId: null, not: null, kaynakKimligi: randomUUID(), ...g });
  const kutu = async (kim: string): Promise<TeslimKutusuCevabi> => {
    const c = await istek<TeslimKutusuCevabi>(kim, 'GET', '/stok/teslim-kutusu');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return teslimKutusuCevabi.parse(c.govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_teslim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.TESLIM', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    // Yetkisiz rol: stok.istek kaldırılır (rol göçü bütün rollere verir).
    await ortam.sahip.sorgu("DELETE FROM rol_islemi WHERE islem = 'stok.istek' AND rol_id = (SELECT id FROM rol WHERE kod = 'sevkiyat')");
    for (const rol of ['depo', 'operator', 'kalite', 'sevkiyat']) await kisiEkle(rol, rol);
    await kisiEkle('operator_kisitli', 'operator');
    await kisiEkle('depo_kisitli', 'depo');
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: stok.istek olmayan kutuyu okuyamaz, istek ve teslim açamaz; stok.istek stok okumayı açmaz', async () => {
    assert.equal((await istek('sevkiyat', 'GET', '/stok/teslim-kutusu')).durum, 403);
    assert.equal((await istek('sevkiyat', 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: 1, miktar: '1', istasyonId: null, not: null, kaynakKimligi: 'x-1' })).durum, 403);
    assert.equal((await gonder('sevkiyat', { malzemeId: 1, miktar: '1', kaynak: { konumId: 1 }, hedef: { konumId: 2 } })).durum, 403);
    assert.equal((await istek('operator', 'GET', '/stok/malzemeler')).durum, 403, 'genel stok listesi açılmaz');
    assert.equal((await istek('operator', 'GET', '/stok/teslim-kutusu')).durum, 200);
    // Akış A provası D2: panel statü adını okur; stok.istek olmayan okuyamaz.
    assert.equal((await istek('operator', 'GET', '/stok/statuler')).durum, 200);
    assert.equal((await istek('oturumsuz', 'GET', '/stok/statuler')).durum, 401);
  });

  test('STK-T1 istek: stok yetmezse "stok yok", yeterse açık; hizmet ve kapsam dışı istasyon reddedilir; aynı kimlik tek kayıt', async () => {
    const h = await kart('hammadde');
    const ac = (kim: string, g: Record<string, unknown>) =>
      istek<MalzemeIstegiCevabi & Hata>(kim, 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: h, miktar: '5', istasyonId: null, not: null, kaynakKimligi: randomUUID(), ...g });
    const yok = await ac('kalite', {});
    assert.equal(yok.durum, 200, JSON.stringify(yok.govde));
    assert.equal(malzemeIstegiCevabi.parse(yok.govde).istek.durum, 'stok_yok');
    assert.equal(yok.govde.istek.istasyonId, null, 'istasyonsuz istek isteyen kişiye');
    await malKabul(h, '5');
    const var_ = await ac('kalite', { kaynakKimligi: 'tek-1' });
    assert.equal(var_.govde.istek.durum, 'acik');
    assert.equal((await ac('kalite', { kaynakKimligi: 'tek-1', miktar: '9' })).govde.istek.id, var_.govde.istek.id, 'aynı kimlik ilk kaydı döner');
    // Başka kişinin aynı kimliği ayrı kayıttır (kimlik kişiye bağlıdır).
    assert.notEqual((await ac('operator', { kaynakKimligi: 'tek-1' })).govde.istek.id, var_.govde.istek.id);
    const hizmet = await ac('kalite', { malzemeId: await kart('hizmet') });
    assert.equal(hizmet.durum, 400, JSON.stringify(hizmet.govde));
    const ist = await istasyon();
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('operator_kisitli'), (await istasyon()).isMerkeziId]);
    assert.equal((await ac('operator_kisitli', { istasyonId: ist.id })).durum, 403, 'kapsam dışı istasyon');
    assert.equal((await ac('operator', { istasyonId: ist.id })).durum, 200, 'kapsamı sınırsız kişi');
    // Depo "stok yok" isteği de hazırlar ve teslim eder.
    const hazir = await istek<MalzemeIstegiCevabi>('depo', 'POST', `/stok/malzeme-istekleri/${yok.govde.istek.id}/hazirla`, { surum: yok.govde.istek.surum });
    assert.equal(hazir.govde.istek.durum, 'hazirlaniyor');
    const isteklerim = (await kutu('kalite')).isteklerim.map((i) => i.id);
    assert.ok(isteklerim.includes(yok.govde.istek.id) && isteklerim.includes(var_.govde.istek.id));
    assert.ok(!(await kutu('depo')).isteklerim.some((i) => i.id === yok.govde.istek.id), 'kutu yalnız kişinin isteklerini gösterir');
  });

  test('istek seçicisi: onaylı stoklanan kartlar, serbest miktar ve statü kırılımı; stoğu olmayan kart da listelenir, onaysız kart listelenmez', async () => {
    const h = await kart('hammadde');
    const bos = await kart('hammadde');
    const onaysiz = await kart('hammadde');
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'taslak' WHERE no = $1", [onaysiz]);
    await malKabul(h, '7');
    const c = await istek<IstekMalzemeleriCevabi>('operator', 'GET', '/stok/istek-malzemeleri?ara=Teslim%20deneme');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const m = istekMalzemeleriCevabi.parse(c.govde).malzemeler;
    assert.equal(m.find((x) => x.id === h)?.kullanilabilir, '7.000');
    assert.equal(m.find((x) => x.id === bos)?.kullanilabilir, '0');
    assert.equal(m.some((x) => x.id === onaysiz), false, 'onaysız kart istenemez, sunulmaz');
  });

  test('STK-T7 nereden: kapsamda tek istasyon varsa o; birden çoksa açık işin istasyonu; ikisi de yoksa boş', async () => {
    await kisiEkle('operator_yerde', 'operator');
    const kisi = kisiler.get('operator_yerde')!;
    const a = await istasyon();
    const b = await istasyon();
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi, a.isMerkeziId]);
    assert.equal((await kutu('operator_yerde')).buradakiIstasyonId, a.id, 'tek istasyon');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi, b.isMerkeziId]);
    assert.equal((await kutu('operator_yerde')).buradakiIstasyonId, null, 'iki istasyon, açık iş yok');
    const e = await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-T7', 'Deneme', 5, $1, $2) RETURNING id", [b.id, kisiler.get('yonetici')]);
    await o().sahip.sorgu('INSERT INTO uretim_emirleri_katilim (emir_id, kisi_id, istasyon_id, giris) VALUES ($1, $2, $3, now())', [e!.id, kisi, b.id]);
    assert.equal((await kutu('operator_yerde')).buradakiIstasyonId, b.id, 'açık katılımın istasyonu');
  });

  test('STK-T2/T4 teslim: gönderince stok yerinde kalır; alan taraf alınca transfer yazılır, kapanan değişmez', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    // Depo konumundan göndermek depo işlemi ister.
    assert.equal((await gonder('operator', { malzemeId: h, miktar: '4', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).durum, 403);
    const g = await gonder('depo', { malzemeId: h, miktar: '4', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const t = teslimCevabi.parse(g.govde).teslim;
    assert.equal(t.durum, 'yolda');
    assert.match(t.no, /^TS-\d{6}$/);
    assert.equal(t.hedef.istasyonId, a.id);
    const istKonum = (await istasyonKonumu(a.id))!;
    assert.equal(t.hedef.konumId, istKonum, 'istasyon konumu kendiliğinden açıldı');
    // Etiket Merkezi istasyonun konum kodunu disari'dan okur; konumu olmayan istasyon haritada yok.
    const kod = (await o().vt.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE id = $1', [istKonum]))!.kod;
    assert.deepEqual([...(await o().vt.tx((db) => istasyonKonumlari(db, [a.id, 999999999])))], [[a.id, { konumId: istKonum, kod }]]);
    assert.equal((await o().vt.tx((db) => istasyonKonumlari(db, []))).size, 0);
    assert.equal(await bakiye(h, kabul), '10.000', 'gönderim stok yazmaz');
    // Gönderen kendi teslimini alamaz; kapsam dışındaki kişi alamaz; yetkili kişi kutuda görür.
    assert.equal((await istek('depo', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '4' })).durum, 403);
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('operator_kisitli'), (await istasyon()).isMerkeziId]);
    assert.equal((await istek('operator_kisitli', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '4' })).durum, 403);
    assert.ok(!(await kutu('operator_kisitli')).gelenler.some((x) => x.id === t.id));
    assert.ok((await kutu('operator')).gelenler.some((x) => x.id === t.id));
    // Kutunun hedef listeleri: bütün aktif istasyonlar ve rafsız depo alanları.
    const k = await kutu('operator');
    assert.ok(k.hedefIstasyonlar.some((x) => x.id === a.id));
    assert.ok(k.depoKonumlari.some((x) => x.id === kabul));
    const al = await istek<TeslimCevabi>('operator', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '3.5' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.equal(al.govde.teslim.durum, 'teslim');
    assert.equal(al.govde.teslim.alinan, '3.500');
    assert.equal(await bakiye(h, kabul), '6.500');
    assert.equal(await bakiye(h, istKonum), '3.500');
    const hrk = await o().vt.tek<{ tur: string; kaynak: number; hedef: number }>(
      'SELECT h.tur, h.kaynak_konum_id AS kaynak, h.hedef_konum_id AS hedef FROM stok_teslim t JOIN stok_hareketi h ON h.id = t.hareket_id WHERE t.id = $1', [t.id]);
    assert.deepEqual(hrk, { tur: 'transfer', kaynak: kabul, hedef: istKonum });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: al.govde.teslim.surum, alinan: '1' })).durum, 409, 'kapanan değişmez');
    // Yerdeki stok: kapsamdaki istasyonu okur; depo konumu depo işlemi ister; kapsam dışı istasyon reddedilir.
    const yer = await istek<YerdekiStokCevabi>('operator', 'GET', `/stok/teslim-kutusu/yerdeki-stok?istasyonId=${a.id}`);
    assert.equal(yer.durum, 200, JSON.stringify(yer.govde));
    assert.deepEqual(yerdekiStokCevabi.parse(yer.govde).satirlar.map((x) => [x.malzemeId, x.miktar, x.statuId]), [[h, '3.500', null]]);
    assert.equal((await istek('operator', 'GET', `/stok/teslim-kutusu/yerdeki-stok?konumId=${kabul}`)).durum, 403);
    assert.equal((await istek('depo', 'GET', `/stok/teslim-kutusu/yerdeki-stok?konumId=${kabul}`)).durum, 200);
    assert.equal((await istek('operator_kisitli', 'GET', `/stok/teslim-kutusu/yerdeki-stok?istasyonId=${a.id}`)).durum, 403);
    assert.equal((await istek('operator', 'GET', '/stok/teslim-kutusu/yerdeki-stok')).durum, 400);
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.id}/reddet`, { surum: al.govde.teslim.surum, neden: 'x' })).durum, 409);
    // İstasyon konumu çıkış önerisine ve kullanılabilir stoğa girmez.
    const m = istekMalzemeleriCevabi.parse((await istek('operator', 'GET', `/stok/istek-malzemeleri?ara=${encodeURIComponent('Teslim deneme')}`)).govde).malzemeler;
    assert.equal(m.find((x) => x.id === h)?.kullanilabilir, '6.500');
  });

  test('istasyondan istasyona: parça statüsüyle taşınır, statü değişmez; gönderilenden fazlası alınamaz', async () => {
    const ym = await kart('yarimamul');
    const a = await istasyon();
    const b = await istasyon();
    const st = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-1', 'OP 10 Torna', $1, '#2F6FDE', 'YM') RETURNING id`, [`adim-${randomBytes(4).toString('hex')}`]))!.id;
    await malKabul(ym, '5');
    const kabul = await kabulKonumu();
    const ilk = await gonder('depo', { malzemeId: ym, miktar: '5', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    await istek('operator', 'POST', `/stok/teslimler/${ilk.govde.teslim.id}/teslim-al`, { surum: ilk.govde.teslim.surum, alinan: '5' });
    const aKonum = (await istasyonKonumu(a.id))!;
    // Statüyü üretim verir; burada yalnız kurulum için servis doğrudan çağrılır (uç yetkisi bu testin konusu değil).
    await statuDegistir(o().vt, kisiler.get('yonetici')!, {
      malzemeId: ym, konumId: aKonum, partiId: (await o().vt.tek<{ p: number }>('SELECT parti_id AS p FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2', [ym, aKonum]))!.p,
      kaynakStatuId: null, hedefStatuId: st, miktar: '5',
    });
    const g = await gonder('operator', { malzemeId: ym, miktar: '5', statuId: st, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.statuId, st);
    // Kalite alır (kapsamı sınırsız). Gönderilenden fazlası reddedilir; eksi onayı gönderilse de yok sayılır.
    const fazla = await istek<Hata>('kalite', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '6', eksiOnay: true });
    assert.equal(fazla.durum, 400, JSON.stringify(fazla.govde));
    assert.equal(fazla.govde.kod, 'DOGRULAMA');
    assert.equal(await bakiye(ym, aKonum, st), '5.000', 'kaynak değişmedi');
    const al = await istek<TeslimCevabi>('kalite', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '5' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    const bKonum = (await istasyonKonumu(b.id))!;
    assert.equal(await bakiye(ym, bKonum, st), '5.000', 'statüyle geldi');
    assert.equal(await bakiye(ym, bKonum, null), null, 'serbeste dönmedi');
    assert.equal(await bakiye(ym, aKonum, st), null);
  });

  test('istasyon konumu ekranda istasyonun kendi koduyla görünür; saklı konum kodu değişmez', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '3');
    const a = await istasyon();
    const g = await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const t = teslimCevabi.parse(g.govde).teslim;
    const istKodu = (await o().sahip.tek<{ kod: string }>('SELECT kod FROM istasyon WHERE id = $1', [a.id]))!.kod;
    assert.equal(t.hedef.kod, istKodu);
    assert.equal((await o().sahip.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE id = $1', [t.hedef.konumId]))!.kod, `IST-${a.id}`);
    const yolda = (await kutu('operator')).gelenler.find((x) => x.id === t.id);
    assert.equal(yolda?.hedef.kod, istKodu, 'teslim kutusu da istasyon kodunu gösterir');
    assert.equal(t.kaynak.kod, 'KABUL', 'depo konumunun kodu olduğu gibi kalır');
  });

  test('STK-T3 iptal yalnız gönderenin; red nedenle kapanır ve stok yazmaz', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '3');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const g1 = (await gonder('depo', { malzemeId: h, miktar: '1', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).govde.teslim;
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g1.id}/iptal-et`, { surum: g1.surum })).durum, 403);
    const ip = await istek<TeslimCevabi>('depo', 'POST', `/stok/teslimler/${g1.id}/iptal-et`, { surum: g1.surum });
    assert.equal(ip.govde.teslim.durum, 'iptal');
    const g2 = (await gonder('depo', { malzemeId: h, miktar: '1', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).govde.teslim;
    assert.equal((await istek('depo', 'POST', `/stok/teslimler/${g2.id}/reddet`, { surum: g2.surum, neden: 'yanlış' })).durum, 403, 'gönderen reddedemez');
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g2.id}/reddet`, { surum: g2.surum, neden: ' ' })).durum, 400);
    const red = await istek<TeslimCevabi>('operator', 'POST', `/stok/teslimler/${g2.id}/reddet`, { surum: g2.surum, neden: 'Yanlış malzeme' });
    assert.equal(red.govde.teslim.durum, 'red');
    assert.equal(red.govde.teslim.redNedeni, 'Yanlış malzeme');
    assert.equal(await bakiye(h, kabul), '3.000');
    assert.equal((await istek('depo', 'POST', `/stok/teslimler/${g2.id}/iptal-et`, { surum: red.govde.teslim.surum })).durum, 409);
    const gonderdiklerim = (await kutu('depo')).gonderdiklerim.map((x) => x.id);
    assert.ok(gonderdiklerim.includes(g1.id) && gonderdiklerim.includes(g2.id));
  });

  test('depoya gelen teslimi depo işlemi olan alır; kaynakla hedef aynıysa reddedilir', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '2');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const g = (await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).govde.teslim;
    await istek('operator', 'POST', `/stok/teslimler/${g.id}/teslim-al`, { surum: g.surum, alinan: '2' });
    const geri = await gonder('operator', { malzemeId: h, miktar: '2', kaynak: { istasyonId: a.id }, hedef: { konumId: kabul } });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.equal((await istek('kalite', 'POST', `/stok/teslimler/${geri.govde.teslim.id}/teslim-al`, { surum: geri.govde.teslim.surum, alinan: '2' })).durum, 403, 'depo işlemi yok');
    assert.equal((await istek('depo', 'POST', `/stok/teslimler/${geri.govde.teslim.id}/teslim-al`, { surum: geri.govde.teslim.surum, alinan: '2' })).durum, 200);
    assert.equal(await bakiye(h, kabul), '2.000');
    assert.equal((await gonder('operator', { malzemeId: h, miktar: '1', kaynak: { istasyonId: a.id }, hedef: { istasyonId: a.id } })).durum, 400);
  });
  test('QR teslim: okutulan istasyon konumu istasyon olarak çözülür; kaynakta kapsam denetimi istasyonla aynıdır', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '3');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const ilk = (await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).govde.teslim;
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${ilk.id}/teslim-al`, { surum: ilk.surum, alinan: '2' })).durum, 200);
    const istKonum = (await istasyonKonumu(a.id))!;
    const g = await gonder('depo', { malzemeId: h, miktar: '1', kaynak: { konumId: kabul }, hedef: { konumId: istKonum } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.hedef.istasyonId, a.id);
    assert.equal(g.govde.teslim.durum, 'yolda', 'istasyona teslim alan taraf onaylayınca kapanır');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('operator_kisitli'), (await istasyon()).isMerkeziId]);
    assert.equal((await gonder('operator_kisitli', { malzemeId: h, miktar: '1', kaynak: { konumId: istKonum }, hedef: { konumId: kabul } })).durum, 403, 'kapsam dışı istasyon konumundan gönderilemez');
    const izinli = await gonder('operator', { malzemeId: h, miktar: '1', kaynak: { konumId: istKonum }, hedef: { konumId: kabul } });
    assert.equal(izinli.durum, 200, JSON.stringify(izinli.govde));
    assert.equal(izinli.govde.teslim.kaynak.istasyonId, a.id);
  });
  test('QR okut: konum her zaman çözülür, stok yalnız alınabilecek yerden; malzeme ve lot kişinin alabileceği yerlerle; bilinmeyen kod', async () => {
    const h = await kart('hammadde');
    const kabulKabul = await istek<Hata>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: h, miktar: '5', parti: { tedarikciPartiNo: `TP-${sira}` } }] });
    assert.equal(kabulKabul.durum, 200, JSON.stringify(kabulKabul.govde));
    const lot = (await o().sahip.tek<{ id: number; lot: string }>('SELECT id, lot_no AS lot FROM stok_parti WHERE malzeme_id = $1', [h]))!;
    const a = await istasyon();
    const t = (await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } })).govde.teslim;
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '2' })).durum, 200);
    const coz = async (kim: string, kod: string) => {
      const c = await istek<OkutCozCevabi & Hata>(kim, 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return okutCozCevabi.parse(c.govde);
    };
    const kabulOp = await coz('operator', 'KABUL');
    assert.deepEqual(kabulOp.tur === 'yer' ? [kabulOp.yer.tur, kabulOp.satirlar] : null, ['kabul', null], 'depo konumu hedef olur, stoğu depo işlemi olmayana açılmaz');
    const kabulDepo = await coz('depo', 'LOC:KABUL');
    assert.ok(kabulDepo.tur === 'yer' && kabulDepo.satirlar!.some((x) => x.malzemeId === h && x.miktar === '3.000'), 'depo işlemi olan konumun stoğunu görür');
    const istKod = (await o().sahip.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE istasyon_id = $1', [a.id]))!.kod;
    const ist = await coz('operator', istKod);
    const istasyonKodu = (await o().sahip.tek<{ kod: string }>('SELECT kod FROM istasyon WHERE id = $1', [a.id]))!.kod;
    assert.deepEqual(ist.tur === 'yer' ? [ist.yer.istasyonId, ist.yer.kod, ist.satirlar?.map((x) => [x.malzemeId, x.miktar])] : null, [a.id, istasyonKodu, [[h, '2.000']]], 'istasyon etiketi istasyonun koduyla');
    const mOp = await coz('operator', `MLZ:${h}`);
    assert.deepEqual(mOp.tur === 'malzeme' ? [mOp.malzeme.id, mOp.parti, mOp.yerler.map((y) => [y.istasyonId, y.miktar])] : null, [h, null, [[a.id, '2.000']]], 'operatör yalnız kapsamdaki istasyondan');
    const mDepo = await coz('depo', String(h));
    assert.deepEqual(mDepo.tur === 'malzeme' ? mDepo.yerler.map((y) => [y.tur, y.miktar]).sort() : null, [['istasyon', '2.000'], ['kabul', '3.000']], 'depo bütün yerleri görür');
    const l = await coz('depo', `LOT:${lot.lot}`);
    assert.deepEqual(l.tur === 'malzeme' ? [l.parti?.id, l.yerler.every((y) => y.partiId === lot.id)] : null, [lot.id, true], 'lot yalnız kendi partisiyle');
    assert.deepEqual(l.tur === 'malzeme' ? [l.malzeme.tur, l.parti?.uretimEmriId] : null, ['hammadde', null], 'kart #95: tür ve partinin emri, Teslim et yönlendirmesi için');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('operator_kisitli'), (await istasyon()).isMerkeziId]);
    const kisitli = await coz('operator_kisitli', istKod);
    assert.deepEqual([kisitli.tur, kisitli.tur === 'yer' ? kisitli.satirlar : 'x'], ['yer', null], 'kapsam dışı istasyonun stoğu açılmaz');
    assert.deepEqual(await coz('operator', 'YOK-BOYLE-KOD'), { tur: 'bilinmiyor', kod: 'YOK-BOYLE-KOD' });
    assert.equal((await istek('sevkiyat', 'GET', '/stok/teslim-kutusu/kod-coz?kod=KABUL')).durum, 403, 'stok.istek olmayan okutamaz');
    assert.equal((await istek('oturumsuz', 'GET', '/stok/teslim-kutusu/kod-coz?kod=KABUL')).durum, 401);
  });
  test('DEP-64 katalog etiketi: MK:<stok kodu> kartın kendisini çözer (küçük harf ve boşlukla da); bilinmeyen stok kodu ve boş MK tanınmaz', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '4');
    const stokKodu = (await o().sahip.tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [h]))!.kod;
    const coz = async (kod: string) => {
      const c = await istek<OkutCozCevabi & Hata>('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return okutCozCevabi.parse(c.govde);
    };
    for (const kod of [`MK:${stokKodu}`, ` mk: ${stokKodu.toLowerCase()} `]) {
      const m = await coz(kod);
      assert.deepEqual(m.tur === 'malzeme' ? [m.malzeme.id, m.parti, m.yerler.map((y) => [y.tur, y.miktar])] : m, [h, null, [['kabul', '4.000']]], kod);
    }
    assert.deepEqual(await coz('MK:YOK-00000'), { tur: 'bilinmiyor', kod: 'MK:YOK-00000' });
    assert.deepEqual(await coz('MK:'), { tur: 'bilinmiyor', kod: 'MK:' });
  });

  test('Akış A provası D1: iş kutusu teslim bekleyen isteği depo işlemi olana sayar, yolda teslimi olanı saymaz; depo işlemi olmayana null', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '2');
    const a = await istasyon();
    const ist = malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: h, miktar: '2', istasyonId: a.id, not: null, kaynakKimligi: randomUUID() })).govde).istek;
    const sayi = () => o().vt.tx((db) => sorgular.teslimBekleyenIstekSayisi(db, [a.id]));
    const once = await sayi();
    const g = await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id }, istekId: ist.id });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    // Kapsamdaki istasyonsuz istekler başka testlerle eşzamanlı değişebilir; bu isteğin düşmesi en az bir eksilmedir.
    assert.ok((await sayi()) <= once - 1);
    const depoKutusu = await istek<{ teslimBekleyenIstek: number | null }>('depo', 'GET', '/stok/is-kutusu');
    assert.equal(depoKutusu.durum, 200, JSON.stringify(depoKutusu.govde));
    assert.equal(typeof depoKutusu.govde.teslimBekleyenIstek, 'number');
    const kaliteKutusu = await istek<{ teslimBekleyenIstek: number | null }>('kalite', 'GET', '/stok/is-kutusu');
    assert.equal(kaliteKutusu.durum, 200, JSON.stringify(kaliteKutusu.govde));
    assert.equal(kaliteKutusu.govde.teslimBekleyenIstek, null);
  });

  test('STK-T5 isteğe bağlı teslim: depo isteğin istasyonuna gönderir; teslim alınınca istek alınan miktarla kapanır', async () => {
    const h = await kart('hammadde');
    const baska = await kart('hammadde');
    await malKabul(h, '4');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const b = await istasyon();
    const ac = async (istasyonId: number | null) => malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '3', istasyonId, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const ist = await ac(a.id);
    const istekli = (g: Record<string, unknown>) => gonder('depo', { malzemeId: h, miktar: '3', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: ist.id, ...g });
    assert.equal((await istekli({ hedef: { istasyonId: b.id } })).durum, 400, 'başka istasyona');
    assert.equal((await istekli({ malzemeId: baska })).durum, 400, 'başka malzeme');
    assert.equal((await gonder('operator', { malzemeId: h, miktar: '1', kaynak: { istasyonId: b.id }, hedef: { istasyonId: a.id }, istekId: ist.id })).durum, 400, 'depo değil');
    const kisiye = await ac(null);
    assert.equal((await istekli({ istekId: kisiye.id })).durum, 400, 'istasyonsuz istek teslimle bağlanmaz');
    const g = await istekli({});
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.istekId, ist.id);
    // Akış A provası D1: yoldaki teslim istekte görünür; istek açık kalır, teslim alınınca kapanır.
    const yoldaki = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ist.id}`)).govde).istek;
    assert.deepEqual([yoldaki.durum, yoldaki.yoldaTeslim], ['acik', { id: g.govde.teslim.id, no: g.govde.teslim.no }]);
    assert.equal(malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${kisiye.id}`)).govde).istek.yoldaTeslim, null);
    const al = await istek<TeslimCevabi>('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '2.5' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    const kapandi = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ist.id}`)).govde).istek;
    assert.equal(kapandi.durum, 'teslim');
    assert.equal(kapandi.karsilanan, '2.500');
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '2.500');
    assert.equal((await istekli({ kaynakKimligi: randomUUID() })).durum, 400, 'kapanan isteğe ikinci teslim bağlanmaz');
  });

  test('STK-U1/U2 üretim sayımı: girdisiz rotada ara adım ürün girmez, son adım istasyon konumuna girer; teslim edilen sayı kilitlidir', async () => {
    const ym = await kart('yarimamul');
    const a = await istasyon();
    const b = await istasyon();
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TT-${sira}`]);
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 10, $3, $4, $5, $6) RETURNING id',
      [`P-U${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const adim = async (opNo: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5) RETURNING id', [e, opNo / 10, opNo, tip!.id, `OP ${opNo}`]))!.id;
    const [op10, op20] = [await adim(10), await adim(20)];
    const statu = async (op: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-U', $1, $2, '#2F6FDE', 'YM') RETURNING id", [`OP ${op}`, `adim-${randomBytes(4).toString('hex')}`]))!.id;
    const [s10, s20] = [await statu(10), await statu(20)];
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo !== ym ? null : g.opNo === 10 ? s10 : s20));
    const kisi = kisiler.get('operator')!;
    const yansit = (isEmriId: number, fark: string) => o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: kisi, fark }));
    const sayi = async (st: number) => Number((await bakiye(ym, (await istasyonKonumu(a.id))!, st)) ?? '0');
    const girilen = async () => (await o().vt.tek<{ m: string }>(
      `SELECT coalesce(sum(CASE WHEN tur = 'giris' THEN miktar ELSE -miktar END), 0)::text AS m FROM stok_hareketi
        WHERE uretim_emri_id = $1 AND (tur = 'giris' OR tur = 'geri_alma')`, [e]))!.m;

    await yansit(op10, '4');
    assert.deepEqual([await sayi(s10), Number(await girilen())], [0, 0], 'ara adım: ürün girmez');
    await yansit(op20, '3');
    assert.deepEqual([await sayi(s10), await sayi(s20)], [0, 3], 'son adım: emrin partisiyle giriş');
    await yansit(op20, '2');
    assert.deepEqual([await sayi(s10), await sayi(s20)], [0, 5], 'son adımın her sayımı girer');

    const g = await gonder('operator', { malzemeId: ym, miktar: '3', statuId: s20, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(Number(await o().vt.tx((db) => istasyondanTeslimEdilen(db, { uretimEmriId: e, istasyonId: a.id }))), 3);
    const bos = await istasyon();
    assert.equal(await o().vt.tx((db) => istasyondanTeslimEdilen(db, { uretimEmriId: e, istasyonId: bos.id })), null, 'konumu olmayan istasyon');
    await assert.rejects(yansit(op20, '-3'), /adet teslim edildi; sayı bunun altına düşürülemez/, 'yoldaki 3 adet kilitli');
    assert.deepEqual([await sayi(s10), await sayi(s20)], [0, 5], 'reddedilen düşüş hiçbir şey yazmaz');

    await yansit(op20, '-2');
    assert.deepEqual([await sayi(s10), await sayi(s20)], [0, 3], 'son adımın düşüşü üretim girişinden geri alınır');
    await yansit(op10, '-2');
    assert.deepEqual([await sayi(s10), await sayi(s20)], [0, 3], 'ara adımın düşüşü stoğa dokunmaz');
    assert.equal(Number(await girilen()), 3, 'emrin girilen üretimi stoktakiyle tutarlı');
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('131 b ve 136 a: karar bekleyen sayım stoğa karar bekliyor girer; ret red, onay serbest yapar; teslim kalite durumunu taşır', async () => {
    const ym = await kart('yarimamul');
    const [a, b] = [await istasyon(), await istasyon()];
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TK-${sira}`]);
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 10, $3, $4, $5, $6) RETURNING id',
      [`P-K${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const op10 = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, $3) RETURNING id', [e, tip!.id, 'OP 10']))!.id;
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-K', 'OP 10', $1, '#2F6FDE', 'YM') RETURNING id", [`kalite-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym ? s10 : null));
    const kisi = kisiler.get('operator')!;
    const yansit = (fark: string, kaliteDurumu: 'serbest' | 'karar_bekliyor') =>
      o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId: op10, istasyonId: a.id, kisiId: kisi, fark, kaliteDurumu }));
    const karar = (karar: 'onay' | 'ret', adet: string) => o().vt.tx((db) => kaliteKarariYansit(db, { uretimEmriId: e, isEmriId: op10, kisiId: kisi, karar, adet }));
    const durumlar = async (istasyonId: number) => Object.fromEntries((await o().vt.sorgu<{ k: string; m: string }>(
      'SELECT kalite_durumu AS k, sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id = $3 AND miktar > 0 GROUP BY 1',
      [ym, await istasyonKonumu(istasyonId), s10])).map((r) => [r.k, Number(r.m)]));

    await yansit('3', 'serbest');
    await yansit('4', 'karar_bekliyor');
    assert.deepEqual(await durumlar(a.id), { serbest: 3, karar_bekliyor: 4 }, 'karar bekleyen sayım ayrı bakiye satırına girer');
    await yansit('-1', 'karar_bekliyor');
    assert.deepEqual(await durumlar(a.id), { serbest: 3, karar_bekliyor: 3 }, 'karar bekleyen düzeltme serbeste dokunmaz');

    await karar('ret', '2');
    assert.deepEqual(await durumlar(a.id), { serbest: 3, karar_bekliyor: 1, red: 2 }, 'ret: bekleyen red olur, akışta kalır (135)');
    const uyari = () => o().vt.tx((db) => uretimGirdiUyarisi(db, { uretimEmriId: e, isEmriId: op10, istasyonId: a.id, stokYok: true }));
    assert.equal(await uyari(), 'Bu istasyonda 2 red ve 1 karar bekleyen parça var; bu parçadan yapılan ürün de aynı durumu alır. Kalite kararını bekleyin.');
    const g = await gonder('operator', { malzemeId: ym, miktar: '2', statuId: s10, kaliteDurumu: 'red', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.kaliteDurumu, 'red');
    const fazla = await gonder('operator', { malzemeId: ym, miktar: '2', statuId: s10, kaliteDurumu: 'karar_bekliyor', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(fazla.durum, 400, 'karar bekleyenden fazlası gönderilemez');
    const al = await istek<TeslimCevabi>('depo', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '2' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.deepEqual(await durumlar(b.id), { red: 2 }, 'red parça red kalır');

    await karar('onay', '5');
    assert.deepEqual(await durumlar(a.id), { serbest: 4 }, 'onay: bulunan kadarı serbest olur');
    assert.deepEqual(await durumlar(b.id), { red: 2 }, 'onay redde dokunmaz');
    assert.equal(await uyari(), null, 'istasyonda karar bekleyen ya da red kalmadı');
    await yansit('-4', 'serbest');
    assert.deepEqual(await durumlar(a.id), {}, 'onaylanan parça sağlam düzeltmesiyle düşer');
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === ym), [], 'defter bakiyeyle tutarlı');
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('terminal üretim girişi: girdi istasyondan ya da en eski girişten düşülür, taşınan HM adım statüsüne çevrilir, son adımda YM girer; düşüş geri alır', async () => {
    const [ym, hm, hm2] = [await kart('yarimamul'), await kart('hammadde', 'kg'), await kart('hammadde')];
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TU-${sira}`]))!.id;
    const makine = async (istasyonId: number): Promise<number> =>
      (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TUM-${istasyonId}`, 'Tezgah', istasyonId]))!.id;
    const adim = async (sira: number, istasyonId: number, bilesenler: { malzemeNo: number; miktar: string }[]): Promise<IsEmriGirdisi> => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: await makine(istasyonId) }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const isEmirleri = [await adim(1, a.id, [{ malzemeNo: hm, miktar: '2.5' }]), await adim(2, b.id, []), await adim(3, c.id, [{ malzemeNo: hm2, miktar: '0.5' }])];
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri }));
    const statu = async (op: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', $1, $2, '#2F6FDE', 'HM') RETURNING id", [`OP ${op}`, `uretim-${randomBytes(4).toString('hex')}`]))!.id;
    const [s10, s20] = [await statu(10), await statu(20)];
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo !== ym ? null : g.opNo === 10 ? s10 : g.opNo === 20 ? s20 : null));
    await malKabul(hm, '100');
    await malKabul(hm2, '50');
    const kabul = await kabulKonumu();
    const [ka, kb, kc] = [await istasyonKonumu(a.id), await istasyonKonumu(b.id), await istasyonKonumu(c.id)];
    const sayi = async (m: number, k: number | null, st: number | null = null) => Number(k === null ? 0 : (await bakiye(m, k, st)) ?? '0');
    const terminal = async (yol: string, govde?: unknown) => {
      const r = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${e}${yol}`, govde);
      assert.equal(r.durum, 200, `${yol}: ${JSON.stringify(r.govde)}`);
    };
    // Başlatmadan önce hazırlık: eksik girdiye istasyon isteği açılır; depo isteği teslim eder, istasyon teslim alır (kart #1289).
    const hazirla = async (istasyonId: number) => {
      const h = await istek<UretimHazirligiCevabi & Hata>('operator', 'POST', '/stok/uretim-hazirligi', { uretimEmriId: e, istasyonId });
      assert.equal(h.durum, 200, JSON.stringify(h.govde));
      for (const x of h.govde.eksikler) {
        const g = await gonder('depo', { malzemeId: x.malzemeId, miktar: (await istek<MalzemeIstegiCevabi>('depo', 'GET', `/stok/malzeme-istekleri/${x.istek!.id}`)).govde.istek.miktar,
          kaynak: { konumId: kabul }, hedef: { istasyonId }, istekId: x.istek!.id });
        assert.equal(g.durum, 200, JSON.stringify(g.govde));
        // Akış A provası 2 Y2: depo "Yolda" görürken operatör panelindeki istek de yoldaki teslimi taşır.
        const yoldaki = (await isMalzemesi(istasyonId))[0]!.malzemeler.find((m) => m.malzemeId === x.malzemeId)!.istek;
        assert.deepEqual([yoldaki?.durum, yoldaki?.yoldaTeslim], ['acik', { id: g.govde.teslim.id, no: g.govde.teslim.no }]);
        const al = await istek<TeslimCevabi>('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: g.govde.teslim.miktar });
        assert.equal(al.durum, 200, JSON.stringify(al.govde));
      }
      return h.govde;
    };

    // Teslim al'daki iş malzemeleri: istasyonda bitmemiş adımın girdisi, bulunduğu yer ve istekle; adım bitene kadar.
    const isMalzemesi = async (istasyonId: number) =>
      isMalzemeleriCevabi.parse((await istek('operator', 'GET', `/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`)).govde).isler.filter((x) => x.uretimEmriId === e);
    const [is0] = await isMalzemesi(a.id);
    assert.deepEqual([is0?.opNo, is0?.kalanAdet, is0?.malzemeler.map((x) => [x.malzemeId, x.birAdet, x.gereken, x.istasyonda, x.eksik, x.istek])],
      [10, 10, [[hm, '2.5', '25', '0', true, null]]]);
    assert.ok(is0!.malzemeler[0]!.yerler.length > 0, 'bulunduğu yer');
    assert.equal(is0!.malzemeler[0]!.birim, 'kg', 'birim kartın biriminden gelir');
    assert.equal((await isMalzemesi(c.id))[0]!.malzemeler[0]!.birim, null, 'kartta birim yoksa null, uydurulmaz');
    // İstek kapanır ama girdi hâlâ eksikse bir sonraki başlatma denemesi yeni istek açar.
    const ilk = await istek<UretimHazirligiCevabi>('operator', 'POST', '/stok/uretim-hazirligi', { uretimEmriId: e, istasyonId: a.id });
    const ilkIstek = ilk.govde.eksikler[0]!.istek!;
    const surum = (await istek<MalzemeIstegiCevabi>('depo', 'GET', `/stok/malzeme-istekleri/${ilkIstek.id}`)).govde.istek.surum;
    assert.equal((await istek('depo', 'POST', `/stok/malzeme-istekleri/${ilkIstek.id}/iptal-et`, { surum })).durum, 200);
    const yeni = (await istek<UretimHazirligiCevabi>('operator', 'POST', '/stok/uretim-hazirligi', { uretimEmriId: e, istasyonId: a.id })).govde.eksikler[0]!.istek!;
    assert.notEqual(yeni.id, ilkIstek.id, 'kapanan istek yerine yenisi');
    assert.equal((await istek<UretimHazirligiCevabi>('operator', 'POST', '/stok/uretim-hazirligi', { uretimEmriId: e, istasyonId: a.id })).govde.eksikler[0]!.istek!.id, yeni.id, 'açık istek yinelenmez');
    assert.equal((await isMalzemesi(a.id))[0]!.malzemeler[0]!.istek?.id, yeni.id);
    const h1 = await hazirla(a.id);
    assert.deepEqual(h1.eksikler.map((x) => [x.malzemeId, x.gereken, x.istasyonda, x.yerler.length > 0]), [[hm, '2.5', '0', true]], 'bir adetlik HM eksik; depoda bulundu');
    assert.equal((await hazirla(a.id)).hazir, true, 'teslim alınınca hazır');
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 4 });
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; kapanış adedi onaylı sayımla ölçülür.
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, kisiler.get('yonetici')!, e, 'onay'));
    const ka2 = ka ?? await istasyonKonumu(a.id);
    assert.deepEqual([await sayi(hm, kabul), await sayi(hm, ka2), await sayi(hm, ka2, s10), await sayi(ym, ka2)], [75, 15, 10, 0], 'ilk adım: emrin 25 kg HM\'si istasyona çekildi; 4 x 2,5 kg OP 10 statüsüne çevrilir; ürün girmez');
    const durum = (await o().vt.tx((db) => malzemeStokDurumlari(db, [hm]))).get(hm);
    assert.deepEqual([durum?.toplam, durum?.serbest], ['100.000', '90.000'], 'statülü HM toplamdadır, serbest stokta değildir');
    await terminal('/bitir', { saglamAdet: 4 });
    assert.deepEqual(await isMalzemesi(a.id), [], 'adım bitince liste kalkar');
    const rezerve = async () => (await o().vt.sorgu<{ statu_id: number; miktar: string }>('SELECT statu_id, miktar::text FROM stok_rezerve WHERE uretim_emri_id = $1 AND malzeme_id = $2 ORDER BY statu_id', [e, hm]))
      .map((x) => [x.statu_id, Number(x.miktar)]);
    assert.deepEqual(await rezerve(), [[s10, 10]], 'statüye geçen HM emre ayrılır');

    // K2 (kart #1413): sonraki istasyon önceki adımın parçasını teslimsiz çekmez; parça istasyona teslim edilir.
    const ilet = async (m: number, kaynak: number, hedef: number, statuId: number | null, miktar: string) => {
      const g = await gonder('depo', { malzemeId: m, miktar, statuId, kaynak: { istasyonId: kaynak }, hedef: { istasyonId: hedef } });
      assert.equal(g.durum, 200, JSON.stringify(g.govde));
      const al = await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: miktar });
      assert.equal(al.durum, 200, JSON.stringify(al.govde));
    };
    await ilet(hm, a.id, b.id, s10, '7.5');
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 3 });
    const kb2 = kb ?? await istasyonKonumu(b.id);
    assert.deepEqual([await sayi(hm, ka2, s10), await sayi(hm, kb2, s20)], [2.5, 7.5], 'ara adım: buraya teslim edilen OP 10 HM, OP 20 olarak çevrilir');
    assert.deepEqual(await rezerve(), [[s10, 2.5], [s20, 7.5]], 'ayrılan statüyle birlikte ilerler');
    await terminal('/bitir', { saglamAdet: 3 });

    await ilet(hm, b.id, c.id, s20, '7.5');
    // Kart #1418: eksik girdi bulunduğu yerden tek dokunuşla istenir; rotadaki önceki istasyondan alınır, kalanı depodan istenir.
    const iki = await gonder('depo', { malzemeId: hm2, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${iki.govde.teslim.id}/teslim-al`, { surum: iki.govde.teslim.surum, alinan: '2' })).durum, 200);
    const yerler = (await isMalzemesi(c.id))[0]!.malzemeler[0]!.yerler;
    assert.ok(yerler.some((y) => y.konumId === ka2 && y.istasyonId === a.id && !y.buEmrin) && yerler.some((y) => y.konumId === kabul && y.istasyonId === null), 'yer türü ve emirsiz parti görünür');
    const iste = (kaynakKonumId: number | null, kaynakKimligi: string, buEmrin: boolean | null = null) =>
      istek<IsMalzemeleriCevabi & Hata>('operator', 'POST', '/stok/teslim-kutusu/is-malzemeleri/iste', { istasyonId: c.id, uretimEmriId: e, opNo: 30, malzemeId: hm2, kaynakKonumId, buEmrin, kaynakKimligi });
    assert.equal((await iste(ka2, 'al-0', true)).durum, 400, 'bu emrin partisi yokken emrinkini alma reddedilir');
    const al = await iste(ka2, 'al-1');
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.deepEqual([await sayi(hm2, ka2), await sayi(hm2, kc ?? await istasyonKonumu(c.id))], [0, 2], 'önceki istasyondaki girdi teslim kaydıyla geldi');
    assert.equal((await iste(kc ?? await istasyonKonumu(c.id), 'al-2')).durum, 400, 'kendi istasyonundan alınmaz');
    const depodan = await iste(kabul, 'depo-1');
    assert.equal(depodan.durum, 200, JSON.stringify(depodan.govde));
    const acilan = depodan.govde.isler[0]!.malzemeler[0]!.istek!;
    const acik = (await istek<MalzemeIstegiCevabi>('depo', 'GET', `/stok/malzeme-istekleri/${acilan.id}`)).govde.istek;
    assert.equal(Number(acik.miktar), 3, 'eksik miktarla: 5 gereken, 2 istasyonda');
    assert.equal((await iste(null, 'depo-2')).durum, 409, 'açık istek varken ikincisi açılmaz');
    const dt = await gonder('depo', { malzemeId: hm2, miktar: acik.miktar, kaynak: { konumId: kabul }, hedef: { istasyonId: c.id }, istekId: acilan.id });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${dt.govde.teslim.id}/teslim-al`, { surum: dt.govde.teslim.surum, alinan: acik.miktar })).durum, 200);
    await hazirla(c.id);
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 3 });
    const kc2 = kc ?? await istasyonKonumu(c.id);
    assert.deepEqual([await sayi(hm, kc2, s20), await sayi(hm2, kc2), await sayi(ym, kc2)], [0, 3.5, 3], 'son adım: taşınan HM ve istasyona çekilen öteki girdi düşülür, YM girer');
    await terminal('/sayim', { tur: 'saglam', adet: -1 });
    assert.deepEqual([await sayi(hm, kc2, s20), await sayi(hm2, kc2), await sayi(ym, kc2)], [2.5, 4, 2], 'düşüş: ürün girişi ve sarf geri alınır');
    assert.deepEqual(await rezerve(), [[s10, 2.5], [s20, 2.5]], 'sarf ayrılanı düşer, geri alma geri koyar');
    // Elle: müdür kaldırır (neden zorunlu) ve yeniden ayırır; ayrılmış statülü malzemenin statüsü elle değiştirilemez.
    if (!kisiler.has('mudur')) await kisiEkle('mudur', 'mudur');
    const ayrinti = async () => (await istek<{ rezerveler: { statuId: number; emirNo: string | null; miktar: string }[] }>('mudur', 'GET', `/stok/malzemeler/${hm}`)).govde.rezerveler;
    assert.deepEqual((await ayrinti()).map((x) => [x.statuId, Number(x.miktar), x.emirNo !== null]), [[s10, 2.5, true], [s20, 2.5, true]], 'ayrıntıda emir numarasıyla');
    const govde = { malzemeId: hm, statuId: s10, uretimEmriId: e };
    assert.equal((await istek('operator', 'POST', '/stok/rezerve-kaldir', { ...govde, neden: 'deneme' })).durum, 403, 'yalnız statü değiştirme yetkisi');
    assert.equal((await istek('mudur', 'POST', '/stok/statu-degistir', { malzemeId: hm, konumId: ka2, partiId: null, kaynakStatuId: s10, hedefStatuId: null, miktar: '2.5' })).durum, 400, 'ayrılmışken statü değişmez');
    assert.equal((await istek('mudur', 'POST', '/stok/rezerve-kaldir', { ...govde, neden: ' ' })).durum, 400, 'neden zorunlu');
    assert.equal((await istek('mudur', 'POST', '/stok/rezerve-kaldir', { ...govde, neden: 'Başka emirde kullanılacak' })).durum, 200);
    assert.deepEqual(await rezerve(), [[s20, 2.5]], 'kaldırılan ayrılan silinir');
    assert.equal(await sayi(hm, ka2, s10), 2.5, 'malzeme statüsünü korur');
    assert.equal((await o().vt.tek<{ n: string }>(`SELECT count(*)::text AS n FROM stok_rezerve_kaydi WHERE uretim_emri_id = $1 AND tur = 'kaldir' AND neden = 'Başka emirde kullanılacak'`, [e]))!.n, '1');
    assert.equal((await istek('mudur', 'POST', '/stok/rezerve-et', { ...govde, miktar: '3' })).durum, 400, 'statüdeki ayrılmamış kadar');
    assert.equal((await istek('mudur', 'POST', '/stok/rezerve-et', { ...govde, miktar: '2.5' })).durum, 200);
    assert.deepEqual(await rezerve(), [[s10, 2.5], [s20, 2.5]]);
    // Eşzamanlı ayırma statüdeki stoğu aşmaz: aynı anda gelen yirmi yarımlık istekten yalnız beşi yazar (2,5), ötekiler reddedilir.
    assert.equal((await istek('mudur', 'POST', '/stok/rezerve-kaldir', { ...govde, neden: 'yeniden ayırma' })).durum, 200);
    const yaris = await Promise.all(Array.from({ length: 20 }, () => istek('mudur', 'POST', '/stok/rezerve-et', { ...govde, miktar: '0.5' })));
    assert.deepEqual([yaris.filter((c) => c.durum === 200).length, yaris.filter((c) => c.durum === 400).length], [5, 15], JSON.stringify(yaris.map((c) => c.durum)));
    assert.deepEqual(await rezerve(), [[s10, 2.5], [s20, 2.5]], 'eşzamanlı ayırmadan sonra ayrılan statüdeki stoğu aşmaz');
    // Ayrılan, kaldırılmadıkça o emrindir: başka emre teslim yalnız ayrılmamış kısımdan olur; emrin kendisine gider.
    const baskaEmre = await gonder('mudur', { malzemeId: hm, miktar: '1', statuId: s10, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id }, uretimEmriId: e + 100000 });
    assert.equal(baskaEmre.durum, 400, 'başka emre ayrılanı aşan teslim reddedilir');
    assert.match(baskaEmre.govde.mesaj, /rezerve/);
    const kendine = await gonder('mudur', { malzemeId: hm, miktar: '1', statuId: s10, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id }, uretimEmriId: e });
    assert.equal(kendine.durum, 200, JSON.stringify(kendine.govde));
    assert.equal((await istek('mudur', 'POST', `/stok/teslimler/${kendine.govde.teslim.id}/iptal-et`, { surum: kendine.govde.teslim.surum })).durum, 200);
    assert.equal((await istek<{ satir: { rezerve: string } }>('mudur', 'GET', `/stok/malzemeler/${hm}`)).govde.satir.rezerve, '5', 'malzeme satırında açık emirlere ayrılan');
    const sarf = await o().vt.tek<{ m: string }>(
      `SELECT coalesce(sum(CASE WHEN h.tur = 'cikis' THEN h.miktar ELSE -h.miktar END), 0)::text AS m FROM stok_hareketi h
        WHERE h.uretim_emri_id = $1 AND h.malzeme_id = $2 AND (h.cikis_nedeni = 'uretime_sarf' OR (h.tur = 'geri_alma' AND h.hedef_konum_id IS NOT NULL))`, [e, hm]);
    assert.equal(Number(sarf?.m), 5, 'emre verilen net HM sarfı (tamamlamada verilen sayılır): 2 x 2,5');
    const disaridan = (await o().vt.tx((db) => emirlerinNetSarfi(db, [e]))).filter((x) => x.malzemeId === hm);
    assert.deepEqual(disaridan.map((x) => [x.emirId, Number(x.miktar)]), [[e, 5]], 'dışarıya açılan net sarf aynı sayıyı verir');
    // PM-B17: ilk sarf zamanı emrin ilk sarf çıkışıdır.
    const ilkSarf = await o().vt.tek<{ z: string }>(`SELECT to_json(min(zaman)) #>> '{}' AS z FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND tur = 'cikis' AND cikis_nedeni = 'uretime_sarf'`, [e, hm]);
    assert.equal(Date.parse(disaridan[0]!.ilkSarf!), Date.parse(ilkSarf!.z), 'ilk sarf zamanı');
    // Akış Süresi statüde kalışı emrin hareketlerinden okur: tedarikçi partisindeki HM'nin statü çevirmeleri de emre bağlıdır.
    const akis = await o().vt.tx((db) => sorgular.emrinAkisHareketleri(db, e));
    const cevirme = (k: number | null, h: number | null) => akis.filter((x) => x.tur === 'transfer' && x.malzemeId === hm && x.kaynakStatuId === k && x.hedefStatuId === h)
      .reduce((t, x) => t + Number(x.miktar), 0);
    assert.deepEqual([cevirme(null, s10), cevirme(s10, s20)], [10, 7.5], 'OP 10 statüsüne giriş ve OP 20\'ye çevirme emrin akışında');
    // 142 a: sarf ve istasyona teslim rota adımına bağlıdır; adım o istasyondaki emrin adımıdır.
    const adimlar = (await o().vt.tx((db) => adimliEmirAyrintisi(db, e))).isEmirleri.map((i) => ({ id: i.id, istasyonId: i.istasyon?.id ?? null }));
    const sarfAdimlari = await o().vt.sorgu<{ a: number | null }>(
      "SELECT DISTINCT is_emri_id AS a FROM stok_hareketi WHERE uretim_emri_id = $1 AND cikis_nedeni = 'uretime_sarf'", [e]);
    assert.ok(sarfAdimlari.length > 0 && sarfAdimlari.every((x) => x.a !== null), 'her sarf bir adıma bağlı');
    const teslimAdimlari = await o().vt.sorgu<{ a: number | null; k: number }>(
      'SELECT is_emri_id AS a, hedef_konum_id AS k FROM stok_teslim WHERE uretim_emri_id = $1 AND hedef_konum_id = $2', [e, await istasyonKonumu(a.id)]);
    assert.ok(teslimAdimlari.length > 0 && teslimAdimlari.every((x) => x.a !== null), 'istasyona teslim adıma bağlı');
    assert.ok(teslimAdimlari.every((x) => adimlar.some((d) => d.id === x.a && d.istasyonId === a.id)), 'adım hedef istasyonun adımı');
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('142 a: stok hareketi olan bekleyen iş emri silinmez; bağ reddeder (23503), değişmez hareket tetikleyicisine düşmez', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TS-${sira}`]);
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 10, $3, $4, $5, $6) RETURNING id',
      [`P-S${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const op10 = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, $3) RETURNING id', [e, tip!.id, 'OP 10']))!.id;
    const kabul = await kabulKonumu();
    await o().vt.tx((db) => sorgular.hareketYaz(db, {
      tur: 'cikis', malzemeId: hm, partiId: null, partiSecimi: null, kaynakKonumId: kabul, hedefKonumId: null, miktar: '1', onayliEksi: false,
      girisKaynagi: null, cikisNedeni: 'uretime_sarf', uretimEmriId: e, geriAlinanId: null, kisiId: kisiler.get('yonetici')!, aciklama: null,
      kaynakStatuId: null, hedefStatuId: null, kaynakKaliteDurumu: 'serbest', hedefKaliteDurumu: null, isEmriId: op10,
    }));
    await assert.rejects(o().vt.sorgu('DELETE FROM uretim_emirleri_is_emri WHERE id = $1', [op10]), (h: { code?: string }) => h.code === '23503');
    const kalan = await o().vt.tek<{ a: number | null }>('SELECT is_emri_id AS a FROM stok_hareketi WHERE uretim_emri_id = $1', [e]);
    assert.equal(kalan?.a, op10, 'hareketin adım bağı yerinde');
  });

  test('STK-U3 hurda: parçanın HM\'si serbestte kalmaz, fire çıkışıyla düşer; geri alma geri koyar; hurdasız sayım aynı; ilk ve son adım', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TH-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`THM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (sira: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '2.5' }]), adim(2, [])],
    }));
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`uretim-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '100');
    const g = await gonder('depo', { malzemeId: hm, miktar: '25', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '25' })).durum, 200);
    const ka = (await istasyonKonumu(a.id))!;
    const operator = kisiler.get('operator')!;
    const hurda = (isEmriId: number, fark: string) => o().vt.tx((db) => hurdaSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, hurdaNedeniId: 1, fark }));
    const saglam = (isEmriId: number, fark: string) => o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, fark }));
    const toplam = async () => (await o().vt.tx((db) => malzemeStokDurumlari(db, [hm]))).get(hm)?.toplam;
    const durum = async () => [Number(await bakiye(hm, ka) ?? 0), Number(await bakiye(hm, ka, s10) ?? 0), Number(await toplam())];

    assert.deepEqual(await durum(), [25, 0, 100]);
    // İlk adım: 2 hurda x 2,5 = 5 HM serbestten fire çıkışıyla düşer, toplam düşer.
    await hurda(op10!, '2');
    assert.deepEqual(await durum(), [20, 0, 95], 'ilk adım hurdası: HM serbestte kalmaz');
    const fire = await o().vt.sorgu<{ m: string; n: string }>("SELECT miktar::text AS m, cikis_nedeni AS n FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND tur = 'cikis'", [e, hm]);
    assert.deepEqual(fire.map((x) => [Number(x.m), x.n]), [[5, 'fire']]);
    // Hurda geri alma aynı miktarı geri koyar; sıfır fark hiçbir şey yazmaz.
    await hurda(op10!, '-1');
    assert.deepEqual(await durum(), [22.5, 0, 97.5], 'geri alma: 2,5 geri girer');
    await hurda(op10!, '0');
    assert.deepEqual(await durum(), [22.5, 0, 97.5]);
    // Hurdasız sayım bugünkü gibi: 4 sağlam 10 HM'yi OP 10 statüsüne çevirir, toplam değişmez.
    await saglam(op10!, '4');
    assert.deepEqual(await durum(), [12.5, 10, 97.5], 'sağlam çevirme aynı kalır');
    // Son adım: parçanın HM'si önceki adımın statüsünden (OP 10) düşer; serbest dokunulmaz.
    await hurda(op20!, '1');
    assert.deepEqual(await durum(), [12.5, 7.5, 95], 'son adım hurdası önceki statüden düşer');
    await hurda(op20!, '-1');
    assert.deepEqual(await durum(), [12.5, 10, 97.5], 'son adım geri alma statüye döner');
    // Yetersiz stok: bulunan kadarı düşer, eksiye inmez, hata yok (sağlam sarfla aynı kural).
    await hurda(op10!, '20');
    assert.deepEqual(await durum(), [0, 0, 75]);
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('335 emir başına fiş: sarf sağlam ve hurda düşümünün, üretimden giriş sağlam girişin net toplamı; düzeltme düşülür; hurda ayrıca verilir', async () => {
    const [ym, hm] = [await kart('yarimamul', 'ADET'), await kart('hammadde', 'KG')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TF-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TFM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (sira: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '2.5' }]), adim(2, [])],
    }));
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`uretim-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '100');
    const g = await gonder('depo', { malzemeId: hm, miktar: '25', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '25' })).durum, 200);
    const operator = kisiler.get('operator')!;
    const hurda = (isEmriId: number, fark: string) => o().vt.tx((db) => hurdaSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, hurdaNedeniId: 1, fark }));
    const saglam = (isEmriId: number, fark: string) => o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, fark }));
    const fis = async () => {
      const f = (await o().vt.tx((db) => emirMalzemeFisleri(db, [e, e + 100000]))).get(e)!;
      const satir = (x: { malzemeId: number; stokKodu: string | null; birim: string | null; miktar: string }) => [x.malzemeId, x.birim, Number(x.miktar), x.stokKodu?.startsWith('TSL-DNM-')];
      return { sarf: f.sarf.map(satir), giris: f.giris.map(satir), hurda: f.hurda.map(satir) };
    };
    const kodlar = new Map((await o().vt.sorgu<{ no: number; kod: string }>('SELECT no, stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = ANY($1::int[])', [[ym, hm]])).map((x) => [x.no, x.kod]));

    assert.deepEqual(await fis(), { sarf: [], giris: [], hurda: [] }, 'emir açılınca boş fiş');
    assert.deepEqual((await o().vt.tx((db) => emirMalzemeFisleri(db, [e + 100000]))).get(e + 100000), { sarf: [], giris: [], hurda: [] }, 'hareketi olmayan emir de boş fişle döner');
    await saglam(op10!, '4');
    assert.deepEqual(await fis(), { sarf: [], giris: [], hurda: [] }, 'ara adımın statü çevirmesi fişe girmez');
    await saglam(op20!, '3');
    assert.deepEqual(await fis(), { sarf: [[hm, 'KG', 7.5, true]], giris: [[ym, 'ADET', 3, true]], hurda: [] }, 'son adım: 3 x 2,5 sarf, 3 giriş');
    await hurda(op10!, '2');
    assert.deepEqual(await fis(), { sarf: [[hm, 'KG', 12.5, true]], giris: [[ym, 'ADET', 3, true]], hurda: [[hm, 'KG', 5, true]] }, 'hurda sarfı artırır, ayrıca da verilir');
    await saglam(op20!, '-1');
    await hurda(op10!, '-1');
    assert.deepEqual(await fis(), { sarf: [[hm, 'KG', 7.5, true]], giris: [[ym, 'ADET', 2, true]], hurda: [[hm, 'KG', 2.5, true]] }, 'düzeltme sarftan, girişten ve hurdadan düşer');
    const f = (await o().vt.tx((db) => emirMalzemeFisleri(db, [e]))).get(e)!;
    assert.deepEqual([f.sarf[0]!.stokKodu, f.giris[0]!.stokKodu], [kodlar.get(hm), kodlar.get(ym)], 'stok kodu kartın kodu');
    // 337 a: net sarf (saat, proje maliyeti) hurdada düşülen HM'yi de sayar; hurda geri alınınca yalnız geri alınan kadar düşer.
    assert.deepEqual((await o().vt.tx((db) => emirlerinNetSarfi(db, [e]))).map((x) => [x.malzemeId, Number(x.miktar)]), [[hm, 7.5]], 'net sarf fişin sarfıyla aynı');
    // 339 a: tamamlamanın verileni de hurdada düşülen HM'yi sayar; kalan yalnız ihtiyaçtan geri kalandır (10 x 2,5 - 7,5).
    const hmSatiri = (await o().vt.tx((db) => emirTamamlamaOku(db, e))).bilesenler.find((b) => b.malzemeId === hm);
    assert.deepEqual([Number(hmSatiri?.brut), Number(hmSatiri?.verilen), Number(hmSatiri?.kalan)], [25, 7.5, 17.5], 'tamamlama verileni net sarfla aynı');
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('kart #1289 girdi uyarısı: girdisiz rotada başlatmada söylenir; girdi hiçbir yerde serbest değilse stokta yok; stok gelince ve sonraki adımda yok', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TGU-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TGUM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (sira: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ac = (isEmirleri: IsEmriGirdisi[]) => o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: ym, adet: 5, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri }));
    const uyari = (e: { uretimEmriId: number; isEmriIdleri: number[] }, i: number, stokYok = false) =>
      o().vt.tx((db) => uretimGirdiUyarisi(db, { uretimEmriId: e.uretimEmriId, isEmriId: e.isEmriIdleri[i]!, istasyonId: a.id, stokYok }));

    const girdisiz = await ac([adim(1, []), adim(2, [])]);
    assert.match((await uyari(girdisiz, 0)) ?? '', /^OP 10: rotada girdi tanımlı değil; sayım stoktan malzeme düşmez/);
    assert.equal(await uyari(girdisiz, 0, true), null, 'sayımda girdisiz uyarısı yinelenmez');

    const girdili = await ac([adim(1, [{ malzemeNo: hm, miktar: '1' }]), adim(2, [])]);
    assert.match((await uyari(girdili, 0)) ?? '', /^OP 10: girdi stokta yok \(.+\); sayım bu malzemeyi düşemez/);
    assert.match((await uyari(girdili, 0, true)) ?? '', /girdi stokta yok/, 'sayımda da söylenir');
    assert.equal(await uyari(girdili, 1), null, 'kendi girdisi olmayan sonraki adım taşınanla yürür');
    await malKabul(hm, '3');
    assert.match((await uyari(girdili, 0)) ?? '', /^OP 10: girdi istasyona teslim edilmedi \(.+\); sayım depodaki en eski partiden düşer/, 'K3: depodan düşülür, uyarılır');
  });

  test('kart #1289 adım çıktısı: çıktılı ara adım taşınan HM\'yi düşer, çıktı YM\'yi girer; sonraki adım o YM\'yi taşır; düşüş geri alır', async () => {
    const [mm, ara, hm] = [await kart('mamul'), await kart('yarimamul'), await kart('hammadde')];
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TC-${sira}`]))!.id;
    const makine = async (istasyonId: number): Promise<number> =>
      (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TCM-${istasyonId}`, 'Tezgah', istasyonId]))!.id;
    const adim = async (sira: number, istasyonId: number, ek: Partial<IsEmriGirdisi> = {}): Promise<IsEmriGirdisi> => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: await makine(istasyonId) }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const isEmirleri = [await adim(1, a.id, { bilesenler: [{ malzemeNo: hm, miktar: '2' }] }), await adim(2, b.id), await adim(3, c.id)];
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: mm, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(mm), isEmirleri }));
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`cikti-${randomBytes(4).toString('hex')}`]))!.id;
    // Rotada OP 20'nin çıkan kalemi ara YM'dir; çıktılı adım statü açmaz (Reçete ve Rota statuleriTuret).
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === mm && g.opNo === 10 ? s10 : null));
    adimCiktisiCozucusuKaydet(async (_db, g) => (g.malzemeNo === mm && g.opNo === 20 ? ara : null));
    await malKabul(hm, '100');
    const kabul = await kabulKonumu();
    const sayi = async (m: number, k: number | null, st: number | null = null) => Number(k === null ? 0 : (await bakiye(m, k, st)) ?? '0');
    const terminal = async (yol: string, govde?: unknown) => {
      const r = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${e}${yol}`, govde);
      assert.equal(r.durum, 200, `${yol}: ${JSON.stringify(r.govde)}`);
    };

    // Başlatma girdiyi istasyonda ister (kart #1289): dört adetlik HM istasyona teslim edilir.
    const t = await gonder('depo', { malzemeId: hm, miktar: '8', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: '8' })).durum, 200);
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 4 });
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; adım çıktısı onaylı sayımla ölçülür.
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, kisiler.get('yonetici')!, e, 'onay'));
    const ka = (await istasyonKonumu(a.id))!;
    assert.deepEqual([await sayi(hm, kabul), await sayi(hm, ka), await sayi(hm, ka, s10)], [92, 0, 8], 'ilk adım: istasyondaki HM OP 10 statüsüne');
    await terminal('/bitir', { saglamAdet: 4 });

    // K2 (kart #1413): sonraki istasyon önceki adımın parçasını teslimsiz çekmez; parça istasyona teslim edilir.
    const ilet = async (m: number, kaynak: number, hedef: number, statuId: number | null, miktar: string) => {
      const g = await gonder('depo', { malzemeId: m, miktar, statuId, kaynak: { istasyonId: kaynak }, hedef: { istasyonId: hedef } });
      assert.equal(g.durum, 200, JSON.stringify(g.govde));
      const al = await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: miktar });
      assert.equal(al.durum, 200, JSON.stringify(al.govde));
    };
    await ilet(hm, a.id, b.id, s10, '8');
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 3 });
    const kb = (await istasyonKonumu(b.id))!;
    assert.deepEqual([await sayi(hm, kb, s10), await sayi(hm, kb), await sayi(ara, kb)], [2, 0, 3], 'çıktılı adım: 3 x 2 kg HM düşülür, 3 adet YM girer');
    await terminal('/sayim', { tur: 'saglam', adet: -1 });
    assert.deepEqual([await sayi(hm, kb, s10), await sayi(ara, kb)], [4, 2], 'çıktılı adımda düşüş: YM girişi ve HM sarfı geri alınır');
    await terminal('/sayim', { tur: 'saglam', adet: 1 });
    await terminal('/bitir', { saglamAdet: 3 });

    await ilet(ara, b.id, c.id, null, '3');
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 2 });
    const kc = (await istasyonKonumu(c.id))!;
    assert.deepEqual([await sayi(ara, kc), await sayi(mm, kc), await sayi(hm, kb, s10)], [1, 2, 2], 'son adım: teslim edilen çıktı YM düşülür, ürün girer; HM\'ye dokunulmaz');
    await terminal('/sayim', { tur: 'saglam', adet: -1 });
    assert.deepEqual([await sayi(ara, kc), await sayi(mm, kc)], [2, 1], 'son adımda düşüş: ürün girişi ve YM sarfı geri alınır');
    adimStatusuCozucusuKaydet(async () => null);
    adimCiktisiCozucusuKaydet(async () => null);
  });

  test('kart #1413 K3: istasyonda yetmeyen statüsüz girdi depodaki en eski partiden düşülür ve hareket kaydı teslimsiz olduğunu söyler', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TK3-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TK3M-${a.id}`, 'Tezgah', a.id]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const isEmirleri: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
    }];
    const { uretimEmriId: e, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: mm, adet: 5, teslim: null, kaynakRotaRevizyonId: await revizyon(mm), isEmirleri }));
    await malKabul(hm, '20');
    const kabul = await kabulKonumu();
    const t = await gonder('depo', { malzemeId: hm, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: '2' })).durum, 200);
    const terminal = async (yol: string, govde?: unknown) => {
      const r = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${e}${yol}`, govde);
      assert.equal(r.durum, 200, `${yol}: ${JSON.stringify(r.govde)}`);
    };
    await terminal('/baslat');
    await terminal('/sayim', { tur: 'saglam', adet: 3 });
    const ka = (await istasyonKonumu(a.id))!;
    assert.deepEqual([await bakiye(hm, ka), await bakiye(hm, kabul)], [null, '14.000'], 'istasyondaki 2 kg önce, kalan 4 kg depodan');
    const kayit = await o().vt.sorgu<{ k: number; m: string; a: string }>(
      "SELECT kaynak_konum_id AS k, miktar::text AS m, aciklama AS a FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND cikis_nedeni = 'uretime_sarf' ORDER BY id", [e, hm]);
    assert.deepEqual(kayit.map((x) => [x.k, x.m, x.a.endsWith('teslim edilmeden depodan')]), [[ka, '2.000', false], [kabul, '4.000', true]]);
    assert.match((await o().vt.tx((db) => uretimGirdiUyarisi(db, { uretimEmriId: e, isEmriId: isEmriIdleri[0]!, istasyonId: a.id, stokYok: true }))) ?? '',
      /girdi istasyona teslim edilmedi/, 'terminal uyarısı');
  });

  test('denetim #1: emre elle sarf edilen girdi sayımda yeniden düşülmez; sayım düşüşü elle sarfı geri almaz', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TD1-${sira}`]))!.id;
    const makineAc = async (kod: string) => (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`${kod}-${a.id}`, 'Tezgah', a.id]))!.id;
    for (const r of ['planlama_proje', 'mudur']) if (!kisiler.has(r)) await kisiEkle(r, r);
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ac = async () => { const makine = await makineAc(`TD1M${String(++sira)}`); return o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: mm, adet: 5, teslim: null, kaynakRotaRevizyonId: await revizyon(mm), isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    })); };
    await malKabul(hm, '50');
    const kabul = await kabulKonumu();
    const elleSarf = async (e: number, miktar: string) => {
      const r = await istek<Hata>('mudur', 'POST', '/stok/cikis', { malzemeId: hm, konumId: kabul, miktar, cikisNedeni: 'uretime_sarf', uretimEmriId: e });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
    };
    const terminal = async (e: number, yol: string, govde?: unknown) => {
      const r = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${e}${yol}`, govde);
      assert.equal(r.durum, 200, `${yol}: ${JSON.stringify(r.govde)}`);
    };

    // Emir 5 adet, reçete 2/adet: ihtiyaç 10. Elle 10 verilmiş emrin sayımı depodan bir şey düşmez.
    const { uretimEmriId: e1 } = await ac();
    await elleSarf(e1, '10');
    await terminal(e1, '/baslat');
    await terminal(e1, '/sayim', { tur: 'saglam', adet: 5 });
    assert.equal(await bakiye(hm, kabul), '40.000', 'elle sarf sayımda yeniden düşülmez');
    await terminal(e1, '/sayim', { tur: 'saglam', adet: -2 });
    assert.equal(await bakiye(hm, kabul), '40.000', 'sayım düşüşü elle sarfı depoya geri koymaz');
    await terminal(e1, '/sayim', { tur: 'saglam', adet: 2 });
    assert.equal(await bakiye(hm, kabul), '40.000');

    // Elle 4 verilmiş emrin sayımı kalan 6'yı düşer; toplam ihtiyacı aşmaz.
    const { uretimEmriId: e2 } = await ac();
    await elleSarf(e2, '4');
    await terminal(e2, '/baslat');
    await terminal(e2, '/sayim', { tur: 'saglam', adet: 5 });
    assert.equal(await bakiye(hm, kabul), '30.000', 'elle 4 + sayım 6');
  });

  test('denetim #35: elle çıkış ve taşıma yoldaki teslime ayrılanı yemez; emirsiz çıkış rezerve kilidini alır', async () => {
    const hm = await kart('hammadde');
    const a = await istasyon();
    if (!kisiler.has('mudur')) await kisiEkle('mudur', 'mudur');
    await malKabul(hm, '5');
    const kabul = await kabulKonumu();
    const t = await gonder('depo', { malzemeId: hm, miktar: '3', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const cik = (miktar: string) => istek<Hata>('mudur', 'POST', '/stok/cikis', { malzemeId: hm, konumId: kabul, miktar, cikisNedeni: 'diger', eksiOnay: true });
    const fazla = await cik('3');
    assert.deepEqual([fazla.durum, fazla.govde.mesaj], [400, 'Burada 2 serbest var (3 yolda); fazlası yoldaki teslime ayrılmış.']);
    const z = await istek<{ konum: { id: number } }>('mudur', 'POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `Z35-${sira}`, ad: null });
    const tasi = await istek<Hata>('mudur', 'POST', '/stok/tasima', { malzemeId: hm, kaynakKonumId: kabul, hedefKonumId: z.govde.konum.id, miktar: '2.5' });
    assert.equal(tasi.durum, 400, JSON.stringify(tasi.govde));
    assert.equal((await cik('2')).durum, 200);
    assert.equal(await bakiye(hm, kabul), '3.000', 'yoldaki teslimin 3 birimi yerinde');
    // Kilit: aynı malzemenin rezerve denetimi sıraya girer; işlem içinde kilit tutulur.
    const hm2 = await kart('hammadde');
    await malKabul(hm2, '1');
    const kilit = await o().vt.tx(async (db) => {
      await cikisYap(db, kisiler.get('mudur')!, { malzemeId: hm2, konumId: kabul, miktar: '0.5', cikisNedeni: 'diger' } as Parameters<typeof cikisYap>[2]);
      return db.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND objid = $1", [hm2]);
    });
    assert.equal(kilit?.n, 1);
  });

  test('karar 110 b, Soru 129: girdi istasyonda yokken iş uyarıyla başlar, eksik istasyona istek olarak açılır; sayım bulunanı düşer, kalanı istisna kartına lotsuz eksi düşer', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`T110-${sira}`]))!.id;
    const makineKur = async (istasyonId: number) => (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`T110M-${istasyonId}`, 'Tezgah', istasyonId]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ac = (makine: number) => o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: mm, adet: 5, teslim: null, kaynakRotaRevizyonId: await revizyon(mm), isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    }));
    const istekler = async (emirId: number) => o().sahip.sorgu<{ no: string; durum: string; istasyon: number; miktar: string; aciklama: string }>(
      'SELECT no, durum, istasyon_id AS istasyon, miktar::text AS miktar, aciklama FROM stok_malzeme_istegi WHERE uretim_emri_id = $1 ORDER BY id', [emirId]);
    await malKabul(hm, '1');
    const kabul = await kabulKonumu();
    const { uretimEmriId: e } = await ac(await makineKur(a.id));
    const b = await istek<{ uyari: string | null } & Hata>('operator', 'POST', `/uretim-emirleri/${e}/baslat`);
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const [ist] = await istekler(e);
    assert.deepEqual([ist?.durum, ist?.istasyon, ist?.miktar, ist?.aciklama.startsWith('Malzeme eksikken üretim başladı')], ['stok_yok', a.id, '10.000', true], 'eksik iz: istasyona istek');
    assert.match(b.govde.uyari ?? '', new RegExp(`^Malzeme eksik: .*\\(istek ${ist!.no}\\)\\. İş başladı`), 'cevapta uyarı ve istek no');
    const ka = await istasyonKonumu(a.id);
    assert.deepEqual([await bakiye(hm, kabul), ka === null ? null : await bakiye(hm, ka)], ['1.000', null], 'başlatma stok yazmaz');
    assert.equal((await istek('operator', 'POST', `/uretim-emirleri/${e}/sayim`, { tur: 'saglam', adet: 3 })).durum, 200);
    assert.equal(await bakiye(hm, kabul), null, 'sayım bulunan 1 kg\'ı düşer');
    const kaSonra = (await istasyonKonumu(a.id))!;
    assert.equal(await bakiye(hm, kaSonra), '-5.000', 'eksik 5 kg istasyonda lotsuz eksi düşer');
    const dusum = await o().sahip.sorgu<{ lotsuz: boolean; onayli: boolean }>(
      `SELECT r.parti_id IS NULL AS lotsuz, h.onayli_eksi AS onayli FROM stok_refakat_istisna_dusumu d
         JOIN stok_refakat_partisi r ON r.id = d.refakat_partisi_id JOIN stok_hareketi h ON h.id = d.hareket_id WHERE r.uretim_emri_id = $1`, [e]);
    assert.deepEqual(dusum, [{ lotsuz: true, onayli: true }], 'lotsuz düşüm emrin istisna kartına bağlı');
    assert.equal((await istekler(e)).length, 1, 'aynı adım ve malzeme ikinci istek açmaz');

    await malKabul(hm, '20');
    const c = await istasyon();
    const t = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: kabul }, hedef: { istasyonId: c.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: '10' })).durum, 200);
    const { uretimEmriId: e2 } = await ac(await makineKur(c.id));
    const b2 = await istek<{ uyari: string | null } & Hata>('operator', 'POST', `/uretim-emirleri/${e2}/baslat`);
    assert.deepEqual([b2.durum, b2.govde.uyari, (await istekler(e2)).length], [200, null, 0], 'girdi istasyondaysa uyarı ve istek yok');
  });

  test('kart #1413 istenenden fazla teslim: yapılır, teslim ve hareket kaydı "istenenden fazla" der', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const ist = malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '3', istasyonId: a.id, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const g = await gonder('depo', { malzemeId: h, miktar: '5', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: ist.id });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.aciklama, 'istenenden fazla (istenen 3)');
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '5' })).durum, 200);
    const hareket = await o().vt.tek<{ a: string }>('SELECT h.aciklama AS a FROM stok_hareketi h JOIN stok_teslim t ON t.hareket_id = h.id WHERE t.id = $1', [g.govde.teslim.id]);
    assert.match(hareket!.a, /istenenden fazla \(istenen 3\)$/);
    const kapandi = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ist.id}`)).govde).istek;
    assert.deepEqual([kapandi.durum, kapandi.karsilanan], ['teslim', '5.000']);
  });

  test('kart #1413 K5: emir iptal olunca açık istekleri iptal olur, yoldaki teslime uyarı yazılır; kapalı emre istek açılmaz', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TK5-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TK5M-${a.id}`, 'Tezgah', a.id]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: mm, adet: 5, teslim: null, kaynakRotaRevizyonId: await revizyon(mm), isEmirleri: [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '1' }],
    }] }));
    await malKabul(hm, '10');
    const kabul = await kabulKonumu();
    const ac = async () => istek<MalzemeIstegiCevabi & Hata>('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: hm, miktar: '2', istasyonId: a.id, uretimEmriId: e, not: null, kaynakKimligi: randomUUID(),
    });
    const [acik, yoldaki] = [(await ac()).govde.istek, (await ac()).govde.istek];
    const g = await gonder('depo', { malzemeId: hm, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: yoldaki.id });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    await o().vt.tx((db) => emirIptalEt(db, planlamaci, e));
    const oku = async (id: number) => malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${id}`)).govde).istek;
    assert.equal((await oku(acik.id)).durum, 'iptal');
    const t = (await o().vt.tx((db) => sorgular.teslimBul(db, g.govde.teslim.id)))!;
    assert.deepEqual([t.durum, t.surum, t.aciklama], ['yolda', g.govde.teslim.surum, 'Emir kapandı: teslimi alın ya da iptal edin'], 'yoldaki teslim elle kapanır');
    const red = await ac();
    assert.equal(red.durum, 400);
    assert.match(red.govde.mesaj, /iptal edildi; malzeme istenmez/);
  });

  test('kart #1353 istasyon sepeti: getiren kişi, rotada sonraki farklı istasyon; emirsiz malzeme rota dışı; kutuda harita', async () => {
    const ym = await kart('yarimamul');
    const [a, b] = [await istasyon(), await istasyon()];
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TS-${sira}`]);
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 10, $3, $4, $5, $6) RETURNING id',
      [`P-S${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const adim = async (opNo: number, istasyonId: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [e, opNo / 10, opNo, tip!.id, `OP ${opNo}`, istasyonId]))!.id;
    await adim(10, a.id);
    await adim(20, a.id);
    const op30 = await adim(30, b.id);
    const statu = async (op: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-S', $1, $2, '#2F6FDE', 'YM') RETURNING id", [`OP ${op}`, `adim-${randomBytes(4).toString('hex')}`]))!.id;
    const [s10, s20] = [await statu(10), await statu(20)];
    const yansit = (isEmriId: number, fark: string) =>
      o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: kisiler.get('operator')!, fark }));
    // Girdisiz rotada ara adım stok yazmaz; sepetteki ara statülü parçalar son adımın sayımıyla kurulur (4 adet OP 10, biri OP 20'ye çevrilir).
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym ? s10 : null));
    await yansit(op30, '4');
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym ? s20 : null));
    await yansit(op30, '1');
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo !== ym ? null : g.opNo === 10 ? s10 : g.opNo === 20 ? s20 : null));
    const h = await kart('hammadde');
    await malKabul(h, '5');
    const g = await gonder('depo', { malzemeId: h, miktar: '5', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    await istek('kalite', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '5' });

    const c = await istek<IstasyonSepetiCevabi>('operator', 'GET', `/stok/teslim-kutusu/sepet?istasyonId=${a.id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const sepet = istasyonSepetiCevabi.parse(c.govde);
    assert.equal(sepet.istasyon.id, a.id);
    const satir = (m: number, st: number | null) => sepet.satirlar.find((x) => x.malzemeId === m && x.statuId === st)!;
    assert.deepEqual([satir(ym, s10).miktar, satir(ym, s20).miktar], ['3.000', '1.000']);
    assert.equal(satir(ym, s10).getiren, 'Deneme operator', 'üreten kişi');
    assert.ok(satir(ym, s10).gelis);
    assert.deepEqual([satir(ym, s10).sonraki?.istasyonId, satir(ym, s10).sonraki?.opNo], [b.id, 30], 'aynı istasyondaki OP 20 atlanır');
    assert.match(satir(ym, s10).sonraki!.ad, /^Deneme istasyon/);
    assert.equal(satir(ym, s20).sonraki?.istasyonId, b.id);
    assert.equal(satir(ym, s10).uretimEmriId, e);
    assert.equal(satir(h, null).getiren, 'Deneme kalite', 'teslim alan kişi');
    // Sepet süzgeci (soru 89): üretim sayımıyla giren "üretilen", başka yerden teslim alınan "teslim alınan".
    assert.deepEqual([satir(ym, s10).koken, satir(h, null).koken], ['uretim', 'teslim']);
    assert.deepEqual([satir(h, null).sonraki, satir(h, null).sonrakiYok], [null, 'rota-disi']);

    // Sonraki istasyona tek dokunuş: sepet satırı olduğu gibi gönderilir.
    const s = satir(ym, s10);
    const t = await gonder('operator', { malzemeId: ym, miktar: s.miktar, partiId: s.partiId, statuId: s.statuId, kaynak: { istasyonId: a.id }, hedef: { istasyonId: s.sonraki!.istasyonId } });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));

    const disarida = await istasyon();
    await kisiEkle('operator_sepet', 'operator');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('operator_sepet'), disarida.isMerkeziId]);
    // Üretimde kullan ("İstasyondakiler"): yalnız bu istasyonda bitmemiş adımı olan emre, sepette olandan fazla değil.
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e]);
    assert.deepEqual(istasyonSepetiCevabi.parse((await istek('operator', 'GET', `/stok/teslim-kutusu/sepet?istasyonId=${a.id}`)).govde).emirler.map((x) => x.id), [e]);
    const kullan = (kim: string, g: Record<string, unknown>) => istek<Hata>(kim, 'POST', '/stok/teslim-kutusu/sepet/kullan',
      { istasyonId: a.id, malzemeId: h, partiId: satir(h, null).partiId, statuId: null, miktar: '2', uretimEmriId: e, ...g });
    assert.equal((await kullan('operator', { miktar: '9' })).durum, 400, 'sepetteki 5 adetten fazlası');
    const baskaEmir = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id, durum) VALUES ($1, 'Deneme', 1, $2, $3, $4, $5, 'planli') RETURNING id",
      [`P-SB${sira}`, b.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    await o().sahip.sorgu('INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 1, 10, $2, $3, $4)', [baskaEmir, tip!.id, 'OP 10', b.id]);
    assert.equal((await kullan('operator', { uretimEmriId: baskaEmir })).durum, 400, 'başka istasyonun emri');
    assert.equal((await kullan('operator_sepet', {})).durum, 403, 'kapsam dışı istasyon');
    const k = await kullan('operator', {});
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '3.000');
    const sarf = await o().vt.tek<{ n: string; e: number }>("SELECT cikis_nedeni AS n, uretim_emri_id AS e FROM stok_hareketi WHERE id = $1", [(k.govde as unknown as { hareketIdler: number[] }).hareketIdler[0]]);
    assert.deepEqual([sarf!.n, sarf!.e], ['uretime_sarf', e]);

    assert.equal((await istek('operator', 'GET', `/stok/teslim-kutusu/sepet?istasyonId=999999`)).durum, 404);
    assert.equal((await istek('operator_sepet', 'GET', `/stok/teslim-kutusu/sepet?istasyonId=${a.id}`)).durum, 403, 'kapsam dışı istasyonun sepeti');
    const harita = (await kutu('operator')).harita;
    assert.ok(harita === null || harita.kareBoyu > 0);
    // Taşıma yolu (#1304): istasyonun Fabrika Haritası karesi kutuda gelir.
    const salon = (await o().vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('TS-Z', 'Teslim zemini', 12, 8, 4, 900, 900, $1) RETURNING id", [kisiler.get('operator')]))!.id;
    await o().vt.sorgu('INSERT INTO atolye_istasyon_yeri (istasyon_id, salon_id, x, z, donus, genislik, derinlik) VALUES ($1, $2, 5, 5, 0, 2, 2)', [a.id, salon]);
    const zemin = (await kutu('operator')).zemin;
    assert.deepEqual(zemin?.bolumler.find((x) => x.salonId === salon), { salonId: salon, kod: 'TS-Z', sutunlar: ['A', 'B', 'C'], satirlar: ['1', '2'] });
    assert.deepEqual(zemin?.istasyonlar.find((x) => x.istasyonId === a.id), { istasyonId: a.id, salonId: salon, hucre: 'B2' });
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('kart #1289 teslim edilmeyen parça: kullanacak istasyon önceki sepetten görür ve teslim al ile çeker', async () => {
    const ym = await kart('yarimamul');
    const [a, b] = [await istasyon(), await istasyon()];
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TC-${sira}`]);
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 10, $3, $4, $5, $6) RETURNING id',
      [`P-C${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const adim = async (opNo: number, istasyonId: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [e, opNo / 10, opNo, tip!.id, `OP ${opNo}`, istasyonId]))!.id;
    await adim(10, a.id);
    const op20 = await adim(20, b.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-C', 'OP 10', $1, '#2F6FDE', 'YM') RETURNING id", [`adim-${randomBytes(4).toString('hex')}`]))!.id;
    // Girdisiz rotada ara adım stok yazmaz; A'daki OP 10 statülü 4 parça son adımın sayımıyla kurulur.
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym ? s10 : null));
    await o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId: op20, istasyonId: a.id, kisiId: kisiler.get('operator')!, fark: '4' }));
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [e]);

    const gelecek = async (istasyonId: number) => gelecekSepetCevabi.parse((await istek('operator', 'GET', `/stok/teslim-kutusu/sepet/gelecek?istasyonId=${istasyonId}`)).govde).satirlar;
    const [satir] = await gelecek(b.id);
    assert.deepEqual([satir?.kaynak.id, satir?.malzemeId, satir?.statuId, satir?.miktar, satir?.sonraki?.istasyonId], [a.id, ym, s10, '4.000', b.id]);
    assert.deepEqual(await gelecek(a.id), [], 'kendi sepeti ve sonraki adımı başka istasyon olan satır görünmez');

    const cek = (kim: string, g: Record<string, unknown>) => istek<TeslimCevabi | Hata>(kim, 'POST', '/stok/teslim-kutusu/sepet/cek',
      { istasyonId: b.id, kaynakIstasyonId: a.id, malzemeId: ym, partiId: satir!.partiId, statuId: s10, miktar: '3', kaynakKimligi: `cek-${sira}`, ...g });
    assert.equal((await cek('operator', { miktar: '5', kaynakKimligi: `cek-fazla-${sira}` })).durum, 400, 'sepettekinden fazlası');
    assert.equal((await cek('operator', { istasyonId: a.id, kaynakIstasyonId: b.id, kaynakKimligi: `cek-ters-${sira}` })).durum, 400, 'sonraki adımı olmayan istasyon çekemez');
    await kisiEkle('operator_cek', 'operator');
    const disarida = await istasyon();
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('operator_cek'), disarida.isMerkeziId]);
    assert.equal((await cek('operator_cek', { kaynakKimligi: `cek-kapsam-${sira}` })).durum, 403, 'kapsam dışı istasyon');

    const c = await cek('operator', {});
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const t = teslimCevabi.parse(c.govde).teslim;
    assert.deepEqual([t.durum, t.alinan, t.statuId], ['teslim', '3.000', s10], 'çeken hem gönderen hem alan; statü değişmez');
    const tekrar = teslimCevabi.parse((await cek('operator', {})).govde).teslim;
    assert.equal(tekrar.id, t.id, 'aynı kimlik ikinci kez taşımaz');
    assert.deepEqual([await bakiye(ym, (await istasyonKonumu(a.id))!, s10), await bakiye(ym, (await istasyonKonumu(b.id))!, s10)], ['1.000', '3.000']);
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('serbest ara alan: bırakılan teslim hemen alınmış sayılır ve transfer yazılır; oradan almak depo işlemi istemez', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '6');
    const a = await istasyon();
    const b = await istasyon();
    const kabul = await kabulKonumu();
    const ilk = await gonder('depo', { malzemeId: h, miktar: '6', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    await istek('operator', 'POST', `/stok/teslimler/${ilk.govde.teslim.id}/teslim-al`, { surum: ilk.govde.teslim.surum, alinan: '6' });
    const ara = (await o().vt.tx((db) => konumAc(db, { tur: 'ara_alan', kod: `B-${sira}`, ad: 'Bekleme' }))).konum.id;
    assert.ok((await kutu('operator')).araAlanlar.some((x) => x.id === ara), 'kutuda ara alan listelenir');

    const bos = await gonder('operator', { malzemeId: h, miktar: '9', kaynak: { istasyonId: a.id }, hedef: { konumId: ara } });
    assert.equal(bos.durum, 400, 'kaynakta olmayan miktar bırakılamaz');
    assert.match(bos.govde.mesaj, /Burada 6 var; fazlası gönderilemez/);
    const g = await gonder('operator', { malzemeId: h, miktar: '4', kaynak: { istasyonId: a.id }, hedef: { konumId: ara } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.teslim.durum, 'teslim', 'alan taraf beklenmez');
    assert.equal(g.govde.teslim.alinan, '4.000');
    assert.equal(await bakiye(h, ara), '4.000');
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '2.000');
    const fazla = await gonder('operator', { malzemeId: h, miktar: '4', kaynak: { istasyonId: a.id }, hedef: { konumId: ara } });
    assert.equal(fazla.durum, 400, 'kalan 2 adet; 4 bırakılamaz');
    // Ara alandan istasyona: depo işlemi olmayan operatör gönderir, istasyon teslimi alınca taşınır.
    assert.equal((await istek('operator', 'GET', `/stok/teslim-kutusu/yerdeki-stok?konumId=${ara}`)).durum, 200);
    const geri = await gonder('operator', { malzemeId: h, miktar: '4', kaynak: { konumId: ara }, hedef: { istasyonId: b.id } });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.equal(geri.govde.teslim.durum, 'yolda');
    assert.equal(await bakiye(h, ara), '4.000', 'istasyona gönderim alınana kadar yerinde kalır');
  });

  test('kişiye teslim (istasyonsuz istek): malzeme kişinin istasyonuna taşınır; istasyon bilinmiyorsa depo seçer', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    await kisiEkle('operator_tek', 'operator');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('operator_tek'), a.isMerkeziId]);
    const iste = async (kim: string): Promise<MalzemeIstegiCevabi['istek']> => {
      const c = await istek<MalzemeIstegiCevabi>(kim, 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: h, miktar: '3', istasyonId: null, not: null, kaynakKimligi: randomUUID() });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.istek;
    };
    const teslimEt = (i: MalzemeIstegiCevabi['istek'], g: Record<string, unknown>) =>
      istek<MalzemeIstegiCevabi & Hata>('depo', 'POST', `/stok/malzeme-istekleri/${i.id}/teslim-et`, { surum: i.surum, karsilanan: '3', ...g });

    const tek = await iste('operator_tek');
    assert.equal((await teslimEt(tek, {})).govde.alan, 'kaynakKonumId', 'konum seçilmeden kapanmaz');
    assert.equal((await teslimEt(tek, { kaynakKonumId: kabul, karsilanan: '30' })).govde.alan, 'karsilanan', 'konumda olmayan miktar');
    const t = await teslimEt(tek, { kaynakKonumId: kabul });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    assert.equal(t.govde.istek.durum, 'teslim');
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '3.000', 'kapsamındaki tek istasyona');
    assert.equal(await bakiye(h, kabul), '7.000');

    // Kapsamı sınırsız ve açık işi olmayan kişinin istasyonu bilinmez: depo seçer.
    const kalite = await iste('kalite');
    const sor = await teslimEt(kalite, { kaynakKonumId: kabul });
    assert.equal(sor.durum, 400);
    assert.equal(sor.govde.alan, 'istasyonId');
    const b = await istasyon();
    assert.equal((await teslimEt(kalite, { kaynakKonumId: kabul, istasyonId: b.id })).durum, 200);
    assert.equal(await bakiye(h, (await istasyonKonumu(b.id))!), '3.000');
    assert.equal(await bakiye(h, kabul), '4.000');
  });

  test('STK-T8 kişiye teslim (299 b): imzalı kısa süreli kişi kodu kişinin istasyonuna çözülür; teslimi yalnız o kişi görür ve alır', async () => {
    await kisiEkle('alici', 'operator');
    await kisiEkle('alici_yani', 'operator');
    await kisiEkle('alici_yersiz', 'operator');
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const b = await istasyon();
    for (const kim of ['alici', 'alici_yani']) await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get(kim), a.isMerkeziId]);
    for (const im of [a.isMerkeziId, b.isMerkeziId]) await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('alici_yersiz'), im]);
    const kc = await istek('alici', 'GET', '/stok/teslim-kutusu/kisi-kodu');
    assert.equal(kc.durum, 200, JSON.stringify(kc.govde));
    const { kod, gecerlilikSonu } = kisiKoduCevabi.parse(kc.govde);
    assert.match(kod, new RegExp(`^KSI-${kisiler.get('alici')}-[0-9A-Z]+-[0-9a-f]{32}$`));
    const kalan = Date.parse(gecerlilikSonu) - Date.now();
    assert.ok(kalan > 60_000 && kalan <= 121_000, `süre ${kalan}`);
    // Okutan, kişinin adını ve bulunduğu istasyonu görür; kod büyük harfle okunsa da geçerlidir.
    const coz = await istek<OkutCozCevabi>('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod.toUpperCase())}`);
    assert.equal(coz.durum, 200, JSON.stringify(coz.govde));
    assert.deepEqual(okutCozCevabi.parse(coz.govde), { tur: 'kisi', kod: kod.toUpperCase(), kisi: { id: kisiler.get('alici')!, ad: 'Deneme alici' }, istasyon: { id: a.id, kod: `TIS${sira - 1}`, ad: `Deneme istasyon ${sira - 1}` } });
    // Değiştirilmiş, süresi geçmiş ya da istasyonu belirsiz kişinin kodu reddedilir.
    const bozuk = `${kod.slice(0, -1)}${kod.endsWith('0') ? '1' : '0'}`;
    assert.equal((await istek<Hata>('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${bozuk}`)).govde.mesaj, 'Kişi kodu geçersiz; karşıdakinden ekrandaki kodu yeniden göstermesini isteyin.');
    const eski = kisiKodu({ id: kisiler.get('alici')! } as Parameters<typeof kisiKodu>[0], Date.now() - 200_000).kod;
    const eskiCevap = await istek<Hata>('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${eski}`);
    assert.equal(eskiCevap.durum, 400);
    assert.match(eskiCevap.govde.mesaj, /süresi geçti/);
    const yersiz = kisiKoduCevabi.parse((await istek('alici_yersiz', 'GET', '/stok/teslim-kutusu/kisi-kodu')).govde).kod;
    assert.match((await istek<Hata>('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${yersiz}`)).govde.mesaj, /bir istasyonda görünmüyor/);
    // Gönderim kodu yeniden doğrular: hedef kişinin istasyonu olmalı, bozuk kod ve kendine teslim reddedilir.
    const govde = { malzemeId: h, miktar: '4', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, aliciKodu: kod };
    assert.match((await gonder('depo', { ...govde, hedef: { istasyonId: b.id } })).govde.mesaj, /istasyonunda; teslim oraya gider/);
    assert.equal((await gonder('depo', { ...govde, aliciKodu: bozuk })).durum, 400);
    const kendi = kisiKoduCevabi.parse((await istek('depo', 'GET', '/stok/teslim-kutusu/kisi-kodu')).govde).kod;
    assert.match((await gonder('depo', { ...govde, aliciKodu: kendi })).govde.mesaj, /Kendinize teslim edemezsiniz|bir istasyonda görünmüyor/);
    const g = await gonder('depo', govde);
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const t = teslimCevabi.parse(g.govde).teslim;
    assert.equal(t.aliciAd, 'Deneme alici');
    assert.equal(t.hedef.istasyonId, a.id);
    // Soru 133: kişiye teslim istasyona teslimdir; aynı istasyondaki başka kişi de görür ve sayılır. Alıcı alır, stok istasyona geçer.
    assert.ok((await kutu('alici_yani')).gelenler.some((x) => x.id === t.id));
    const sayac = async (kim: string) => (await istek<{ gelen: number }>(kim, 'GET', '/stok/teslim-kutusu/sayac')).govde.gelen;
    assert.equal(await sayac('alici_yani'), 1);
    assert.equal(await sayac('alici'), 1);
    const gelen = (await kutu('alici')).gelenler.find((x) => x.id === t.id);
    assert.equal(gelen?.aliciAd, 'Deneme alici');
    const al = await istek<TeslimCevabi>('alici', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '4' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '4.000');
    // Kodsuz teslim eskisi gibi istasyondaki herkese gelir.
    const k2 = teslimCevabi.parse((await gonder('depo', { malzemeId: h, miktar: '1', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } })).govde).teslim;
    assert.equal(k2.aliciAd, null);
    assert.ok((await kutu('alici_yani')).gelenler.some((x) => x.id === k2.id));
  });

  test('STK-H1/H2/H4 hazırlık: istekler istasyona toplanır, listedeki istek tek başına teslim edilmez, kısmi toplanan sırayla dağıtılır', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const ac = async (miktar: string) => malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar, istasyonId: a.id, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const [i1, i2] = [await ac('3'), await ac('4')];
    const liste = (kim: string, g: Record<string, unknown>) => istek<ToplamaAyrintiCevabi & Hata>(kim, 'POST', '/stok/toplamalar', { ad: 'Torna hazırlığı', ...g });
    assert.equal((await liste('depo', { istekIdler: [i1.id, i2.id] })).durum, 400, 'istekli liste teslim yeri ister');
    assert.equal((await liste('sevkiyat', { istekIdler: [i1.id], hedef: { istasyonId: a.id } })).durum, 403, 'istek karşılamak depo işlemi ister');
    const t = await liste('depo', { istekIdler: [i1.id, i2.id], hedef: { istasyonId: a.id } });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const ayrinti = toplamaAyrintiCevabi.parse(t.govde);
    const istKonum = (await istasyonKonumu(a.id))!;
    assert.equal(ayrinti.hedef?.konumId, istKonum);
    assert.deepEqual(ayrinti.kalemler.map((k) => k.istenen), ['7'], 'aynı malzemenin istekleri tek kalem');
    assert.deepEqual(ayrinti.istekler.map((x) => x.durum), ['hazirlaniyor', 'hazirlaniyor']);
    // STK-H1: listedeki istek başka listeye girmez, tek başına teslim edilmez.
    assert.equal((await liste('depo', { istekIdler: [i1.id], hedef: { istasyonId: a.id } })).durum, 409);
    assert.equal((await gonder('depo', { malzemeId: h, miktar: '3', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: i1.id })).durum, 400);
    const adim = ayrinti.adimlar[0]!;
    const topla = (g: Record<string, unknown>) => istek<ToplamaAyrintiCevabi & Hata>('depo', 'POST', `/stok/toplamalar/${ayrinti.toplama.id}/adimlar/${adim.id}/topla`, { surum: ayrinti.toplama.surum, ...g });
    // STK-H2: planlanandan fazlası toplanmaz; azı kısmidir ve istasyona taşınır.
    assert.equal((await topla({ miktar: '7.5' })).durum, 400);
    const kismi = await topla({ miktar: '5' });
    assert.equal(kismi.durum, 200, JSON.stringify(kismi.govde));
    assert.equal(toplamaAyrintiCevabi.parse(kismi.govde).adimlar[0]!.toplanan, '5');
    assert.equal(await bakiye(h, istKonum), '5.000');
    assert.equal(await bakiye(h, kabul), '5.000');
    const bitti = await istek<ToplamaAyrintiCevabi>('depo', 'POST', `/stok/toplamalar/${ayrinti.toplama.id}/kapat`, { surum: kismi.govde.toplama.surum, durum: 'bitti' });
    assert.equal(bitti.durum, 200, JSON.stringify(bitti.govde));
    // STK-H4: 5 toplandı: önce açılan 3'ü tam, sonraki 2'sini alır.
    const oku = async (id: number) => malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${id}`)).govde).istek;
    assert.deepEqual([(await oku(i1.id)).karsilanan, (await oku(i2.id)).karsilanan], ['3.000', '2.000']);
    assert.equal((await oku(i2.id)).durum, 'teslim');
  });

  test('STK-H1/H3 iptal edilen liste isteği bırakır; yolda teslimi olan isteğe ikinci teslim açılmaz', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const ist = malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '2', istasyonId: a.id, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const t = toplamaAyrintiCevabi.parse((await istek('depo', 'POST', '/stok/toplamalar', { ad: 'İptal denemesi', istekIdler: [ist.id], hedef: { istasyonId: a.id } })).govde);
    const iptal = await istek('depo', 'POST', `/stok/toplamalar/${t.toplama.id}/kapat`, { surum: t.toplama.surum, durum: 'iptal' });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    const serbest = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ist.id}`)).govde).istek;
    assert.equal(serbest.toplamaId, null, 'iptal edilen liste isteği bırakır');
    const gonderIstekli = () => gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: ist.id });
    const ilk = await gonderIstekli();
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const ikinci = await gonderIstekli();
    assert.equal(ikinci.durum, 400);
    assert.match((ikinci.govde as unknown as Hata).mesaj, /yolda/);
  });

  test('kart #1323: teslim gönderimi aynı istek kimliğiyle bir kez uygulanır; kimliksiz komut reddedilir', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '5');
    const a = await istasyon();
    const govde = { malzemeId: h, miktar: '2', statuId: null, not: null, kaynakKimligi: randomUUID(), kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } };
    const kimlik = randomUUID();
    const gonderKimlikle = async () => app.inject({
      method: 'POST', url: '/api/stok/teslimler/gonder', headers: { cookie: cerezler.get('depo') ?? '', [ISTEK_KIMLIGI_BASLIGI]: kimlik }, payload: govde,
    });
    const [ilk, ikinci] = [await gonderKimlikle(), await gonderKimlikle()];
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.json().teslim.id, ilk.json().teslim.id, 'aynı kimlik ilk cevabı döner');
    const kimliksiz = await app.inject({ method: 'POST', url: '/api/stok/teslimler/gonder', headers: { cookie: cerezler.get('depo') ?? '' }, payload: { ...govde, kaynakKimligi: randomUUID() } });
    assert.equal(kimliksiz.statusCode, 400, kimliksiz.body);
  });

  test('kart #1323: ters yönlü eşzamanlı taşımalar birbirini kilitlemez; aynı yeni satıra eşzamanlı giriş tek satırda toplanır', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '40');
    const kabul = await kabulKonumu();
    const z = (await o().vt.tx((db) => konumAc(db, { tur: 'depo_zemini', kod: `KZ-${sira}`, ad: null }))).konum.id;
    const yeni = (await o().vt.tx((db) => konumAc(db, { tur: 'depo_zemini', kod: `KY-${sira}`, ad: null }))).konum.id;
    const tasi = (kaynak: number, hedef: number, miktar: string) => istek<Hata>('depo', 'POST', '/stok/tasima', { malzemeId: h, kaynakKonumId: kaynak, hedefKonumId: hedef, miktar });
    assert.equal((await tasi(kabul, z, '20')).durum, 200);
    const sonuclar = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? tasi(kabul, z, '1') : tasi(z, kabul, '1'))));
    assert.deepEqual(sonuclar.map((c) => c.durum), Array(10).fill(200), JSON.stringify(sonuclar.filter((c) => c.durum !== 200)));
    assert.equal(await bakiye(h, kabul), '20.000');
    assert.equal(await bakiye(h, z), '20.000');
    // İkisi de henüz olmayan satırı açar: biri bekler, ötekinin satırına ekler (409 "zaten var" değil).
    const acilis = await Promise.all([tasi(kabul, yeni, '3'), tasi(z, yeni, '4')]);
    assert.deepEqual(acilis.map((c) => c.durum), [200, 200], JSON.stringify(acilis));
    assert.equal(await bakiye(h, yeni), '7.000');
    assert.equal((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2', [h, yeni]))!.n, 1);
  });

  test('kart #1410 yolda ayrılan: yoldaki teslim kaynakta ayrılır; ikinci gönderim serbestle sınırlı, sepette ve seçicide yolda ayrı görünür', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '5');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const b = await istasyon();
    const ilk = await gonder('depo', { malzemeId: h, miktar: '5', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
    await istek('operator', 'POST', `/stok/teslimler/${ilk.govde.teslim.id}/teslim-al`, { surum: ilk.govde.teslim.surum, alinan: '5' });
    const yolda = await gonder('operator', { malzemeId: h, miktar: '3', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(yolda.durum, 200, JSON.stringify(yolda.govde));
    const ikinci = await gonder('operator', { malzemeId: h, miktar: '3', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal(ikinci.durum, 400, 'yoldaki 3 ayrıldı; 2 serbest');
    assert.match(ikinci.govde.mesaj, /2 serbest var \(3 yolda\)/);
    const sepet = istasyonSepetiCevabi.parse((await istek('operator', 'GET', `/stok/teslim-kutusu/sepet?istasyonId=${a.id}`)).govde);
    const satir = sepet.satirlar.find((x) => x.malzemeId === h)!;
    assert.deepEqual([satir.miktar, satir.yolda], ['2.000', '3.000']);
    const yer = yerdekiStokCevabi.parse((await istek('operator', 'GET', `/stok/teslim-kutusu/yerdeki-stok?istasyonId=${a.id}`)).govde);
    assert.equal(yer.satirlar.find((x) => x.malzemeId === h)?.miktar, '2.000', 'gönderim seçicisi serbesti gösterir');
    assert.equal(await bakiye(h, (await istasyonKonumu(a.id))!), '5.000', 'stok alınana kadar yerinde');
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${yolda.govde.teslim.id}/iptal-et`, { surum: yolda.govde.teslim.surum })).durum, 200);
    assert.equal((await gonder('operator', { malzemeId: h, miktar: '5', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } })).durum, 200, 'iptal ayrılanı bırakır');
  });

  test('kart #1410 kısmi teslim ve geri alma: kalan yeni istekle açık kalır; teslim hareketi geri alınınca teslim iptal, istek yeniden açık', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const ist = malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '10', istasyonId: a.id, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const g = await gonder('depo', { malzemeId: h, miktar: '6', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: ist.id });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '6' })).durum, 200);
    const kalan = (await o().vt.tx((db) => sorgular.istekleriKoktan(db, ist.kaynakKimligi))).filter((x) => x.id !== ist.id);
    assert.equal(kalan.length, 1, 'kalan için tek istek');
    assert.deepEqual([kalan[0]!.miktar, kalan[0]!.durum, kalan[0]!.istasyonId, kalan[0]!.kisiId], ['4.000', 'acik', a.id, kisiler.get('operator')]);

    const hareketId = (await o().vt.tek<{ h: number }>('SELECT hareket_id::int AS h FROM stok_teslim WHERE id = $1', [g.govde.teslim.id]))!.h;
    await o().vt.tx((db) => geriAl(db, kisiler.get('yonetici')!, hareketId, {}));
    const t = (await o().vt.tx((db) => sorgular.teslimBul(db, g.govde.teslim.id)))!;
    assert.deepEqual([t.durum, t.alinan], ['iptal', null]);
    const yeniden = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ist.id}`)).govde).istek;
    assert.deepEqual([yeniden.durum, yeniden.karsilanan], ['acik', null]);
    assert.equal((await o().vt.tx((db) => sorgular.istekBul(db, kalan[0]!.id)))!.durum, 'iptal', 'kalan isteği bütün istekle birleşir');
    assert.equal(await bakiye(h, kabul), '10.000');
  });

  test('kart #1410 hazırlık listesi: başka istasyonun isteği ve yolda teslimi olan istek alınmaz; listedeki istek iptal edilmez', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '10');
    const kabul = await kabulKonumu();
    const a = await istasyon();
    const b = await istasyon();
    const ac = async (istasyonId: number) => malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '2', istasyonId, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    const liste = (g: Record<string, unknown>) => istek<ToplamaAyrintiCevabi & Hata>('depo', 'POST', '/stok/toplamalar', { ad: 'Deneme', ...g });
    await istasyonKonumu(b.id);
    const ia = await ac(a.id);
    const ib = await ac(b.id);
    assert.equal((await gonder('depo', { malzemeId: h, miktar: '1', kaynak: { konumId: kabul }, hedef: { istasyonId: b.id } })).durum, 200);
    assert.equal((await liste({ istekIdler: [ia.id, ib.id], hedef: { istasyonId: a.id } })).durum, 400, 'b isteği a listesine girmez');
    assert.equal((await gonder('depo', { malzemeId: h, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, istekId: ia.id })).durum, 200);
    assert.equal((await liste({ istekIdler: [ia.id], hedef: { istasyonId: a.id } })).durum, 409, 'yolda teslimi olan istek');
    const t = await liste({ istekIdler: [ib.id], hedef: { istasyonId: b.id } });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const x = malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ib.id}`)).govde).istek;
    assert.equal((await istek('depo', 'POST', `/stok/malzeme-istekleri/${ib.id}/iptal-et`, { surum: x.surum })).durum, 409);
  });

  test('emir açılışında serbest stoktan rezerve; yetmeyen mal kabulde öncelik sırasıyla gelir; emirsiz çıkış ayrılanı aşamaz', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TRZ-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TRZM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adimlar: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
    }];
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    if (!kisiler.has('mudur')) await kisiEkle('mudur', 'mudur');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ac = async (adet: number, oncelik: number, stoktanRezerve: boolean) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet, oncelik, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: adimlar, stoktanRezerve }))).uretimEmriId;
    const ayrilan = async () => new Map((await o().vt.sorgu<{ e: number; m: string }>(
      'SELECT uretim_emri_id AS e, miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1 AND statu_id IS NULL', [hm])).map((x) => [x.e, Number(x.m)]));
    const partiler = async () => (await o().vt.sorgu<{ p: number }>('SELECT parti_id AS p FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 ORDER BY parti_id', [hm, kabul])).map((x) => x.p);
    const cikis = async (miktar: string, ek: Record<string, unknown> = {}) =>
      istek<Hata>('mudur', 'POST', '/stok/cikis', { malzemeId: hm, konumId: kabul, miktar, cikisNedeni: 'diger', partiId: (await partiler())[0], ...ek });
    const kabul = await kabulKonumu();

    await malKabul(hm, '6');
    const e1 = await ac(4, 3, true);
    const e2 = await ac(2, 1, true);
    const e3 = await ac(5, 1, false);
    assert.deepEqual(await ayrilan(), new Map([[e1, 6]]), 'açılışta serbest stok ayrılır; yetmeyen bekler, ikinci emre kalmaz, istemeyen emre ayrılmaz');
    const red = await cikis('1');
    assert.equal(red.durum, 400, 'emirsiz çıkış ayrılanı aşamaz');
    assert.match(red.govde.mesaj, /rezerve/);

    await malKabul(hm, '5');
    assert.deepEqual(await ayrilan(), new Map([[e1, 7], [e2, 4]]), 'gelen malzeme önce acil emre, kalanı sonrakine');
    const ayrinti = await istek<{ bekleyenler: { uretimEmriId: number; miktar: string }[] }>('mudur', 'GET', `/stok/malzemeler/${hm}`);
    assert.deepEqual(ayrinti.govde.bekleyenler.map((x) => [x.uretimEmriId, Number(x.miktar)]), [[e1, 1]], 'yalnız isteyen ve ihtiyacı kalan emir bekler');
    assert.ok(!ayrinti.govde.bekleyenler.some((x) => x.uretimEmriId === e3));

    await malKabul(hm, '2');
    assert.deepEqual(await ayrilan(), new Map([[e1, 8], [e2, 4]]));
    assert.match((await cikis('1.5')).govde.mesaj, /ayrılmamış 1 var/, 'ayrılmamış yalnız 1');
    const bir = await cikis('1');
    assert.equal(bir.durum, 200, JSON.stringify(bir.govde));
    const kendi = await cikis('3', { cikisNedeni: 'uretime_sarf', uretimEmriId: e2 });
    assert.equal(kendi.durum, 200, JSON.stringify(kendi.govde));
    assert.deepEqual(await ayrilan(), new Map([[e1, 8], [e2, 1]]), 'emrin kendi sarfı kendi ayrılanından düşer');
  });

  test('emrin rezerve bekleyeni tamamlama ihtiyacıyla aynı yuvarlanır: dört ondalıkta toplanır, üç ondalığa yukarı', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TRY-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TRYM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adimlar: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      bilesenler: [{ malzemeNo: hm, miktar: '0.0014' }],
    }];
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    await malKabul(hm, '1');
    const e = (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 1, oncelik: 1, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: adimlar, stoktanRezerve: true }))).uretimEmriId;
    const ayrilan = await o().vt.sorgu<{ m: string }>('SELECT miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1 AND uretim_emri_id = $2', [hm, e]);
    assert.deepEqual(ayrilan.map((x) => Number(x.m)), [0.002], '0,0014 tamamlamadaki gibi 0,002 ayrılır (en yakına 0,001 olurdu)');
  });

  test('birleşen partinin ayrılanı üst emre geçer ve deftere yazılır', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TRB-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TRBM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adimlar: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
    }];
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ust = (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 4, oncelik: 2, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: adimlar, stoktanRezerve: false }))).uretimEmriId;
    const surum = async (id: number) => (await o().vt.tek<{ surum: number }>('SELECT surum FROM uretim_emri WHERE id = $1', [id]))!.surum;
    const bol = await istek<{ altEmirId: number } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${ust}/bol`, { adimSira: 1, adet: 2, surum: await surum(ust) });
    assert.equal(bol.durum, 200, JSON.stringify(bol.govde));
    const alt = bol.govde.altEmirId;
    // Fikstür: alt partiye ayrılmış serbest stok ve bekleme isteği.
    await malKabul(hm, '3');
    await o().sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, NULL, $2, 3)', [hm, alt]);
    await o().sahip.sorgu('INSERT INTO stok_emir_rezerve_istegi (uretim_emri_id, kisi_id) VALUES ($1, $2)', [alt, kisiler.get('yonetici')]);

    const b = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${ust}/birlestir`, { kaynakEmirId: alt, surum: await surum(ust), kaynakSurum: await surum(alt) });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const ayrilan = await o().vt.sorgu<{ e: number; m: string }>('SELECT uretim_emri_id AS e, miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1', [hm]);
    assert.deepEqual(ayrilan.map((x) => [x.e, Number(x.m)]), [[ust, 3]], 'ayrılan üst emre geçer');
    const kayit = await o().vt.sorgu<{ e: number; t: string; n: string }>(
      'SELECT uretim_emri_id AS e, tur AS t, neden AS n FROM stok_rezerve_kaydi WHERE malzeme_id = $1 ORDER BY id', [hm]);
    assert.deepEqual(kayit.map((x) => [x.e, x.t]), [[alt, 'kaldir'], [ust, 'ayir']]);
    assert.match(kayit[0]!.n, /^Parti birleşti: .+ -> .+$/);
    const bekleyen = await o().vt.sorgu<{ e: number }>('SELECT uretim_emri_id AS e FROM stok_emir_rezerve_istegi WHERE uretim_emri_id = ANY($1::int[])', [[ust, alt]]);
    assert.deepEqual(bekleyen.map((x) => x.e), [ust], 'bekleme isteği de üst emre geçer');
  });

  test('talepte seçilen emir mal kabulde öne geçer, açılışta rezerve istemese de', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TRT-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TRTM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adimlar: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
    }];
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const ac = async (oncelik: number, stoktanRezerve: boolean) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 2, oncelik, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: adimlar, stoktanRezerve }))).uretimEmriId;
    const ayrilan = async () => new Map((await o().vt.sorgu<{ e: number; m: string }>(
      'SELECT uretim_emri_id AS e, miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1 AND statu_id IS NULL', [hm])).map((x) => [x.e, Number(x.m)]));
    const acil = await ac(1, true);
    const talepli = await ac(4, false);

    // Satın almanın tabloları (fikstür): talebe üretim emri bağlı, siparişin satırı bu hammaddenin.
    const sh = o().sahip;
    const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await sh.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, uretim_emri_id) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi', $4)",
      [t, 96000 + sira, kisiler.get('yonetici'), talepli]);
    await sh.sorgu("INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)", [katalog, hm]);
    await sh.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
    await sh.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
    await sh.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await sh.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    const siparisSatirId = (await sh.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet') RETURNING id", [t, tk, kl]))!.id;

    const c = await istek<Hata>('depo', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: hm, miktar: '5', siparisSatirId }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(await ayrilan(), new Map([[talepli, 4], [acil, 1]]), 'talepteki emir acil emrin önüne geçer; kalan sıradakine');
    await malKabul(hm, '5');
    assert.deepEqual(await ayrilan(), new Map([[talepli, 4], [acil, 4]]), 'talepsiz kabulde rezerve istemeyen emir sıraya girmez');

    await o().vt.tx((db) => emirIptalEt(db, planlamaci, acil));
    assert.deepEqual(await ayrilan(), new Map([[talepli, 4]]), 'iptal edilen emrin ayrılanı silinir');
    const kayit = await o().vt.sorgu<{ m: string; n: string }>(
      "SELECT miktar::text AS m, neden AS n FROM stok_rezerve_kaydi WHERE uretim_emri_id = $1 AND tur = 'kaldir'", [acil]);
    assert.deepEqual(kayit.map((x) => [Number(x.m), x.n]), [[4, 'Emir iptal edildi']], 'kaldırma defterde nedeniyle durur');
    assert.equal((await o().vt.sorgu('SELECT 1 FROM stok_emir_rezerve_istegi WHERE uretim_emri_id = $1', [acil])).length, 0, 'bekleme isteği de kalkar');
  });
  // Kart #436 (UYUM-BORCU 35): iş merkezine bağlı istasyonun isteği ve hazırlık listesi kişinin kapsamıyla sınırlıdır; sınırsız kapsam hepsini görür.
  async function kapsamKur() {
    const a = await istasyon();
    const b = await istasyon();
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('depo_kisitli'), a.isMerkeziId]);
    const h = await kart('hammadde');
    await malKabul(h, '50');
    const ac = async (istasyonId: number | null) => malzemeIstegiCevabi.parse((await istek('operator', 'POST', '/stok/malzeme-istekleri/ac', {
      malzemeId: h, miktar: '2', istasyonId, not: null, kaynakKimligi: randomUUID(),
    })).govde).istek;
    return { a, b, h, ia: await ac(a.id), ib: await ac(b.id), isiz: await ac(null) };
  }
  const idler = (g: unknown): number[] => (g as { satirlar: { id: number }[] }).satirlar.map((x) => x.id);

  test('STK-K1 istek listesi ve tekil okuma kişinin kapsamıyla süzülür; istasyonsuz istek süzülmez; sınırsız kapsam hepsini görür', async () => {
    const { ia, ib, isiz } = await kapsamKur();
    const kisitli = idler((await istek('depo_kisitli', 'GET', '/stok/malzeme-istekleri')).govde);
    assert.ok(kisitli.includes(ia.id) && kisitli.includes(isiz.id), 'kapsam içi ve istasyonsuz istek görünür');
    assert.ok(!kisitli.includes(ib.id), 'kapsam dışı istek listede yok');
    const hepsi = idler((await istek('depo', 'GET', '/stok/malzeme-istekleri')).govde);
    assert.ok([ia.id, ib.id, isiz.id].every((x) => hepsi.includes(x)), 'sınırsız kapsam hepsini görür');
    assert.equal((await istek('depo_kisitli', 'GET', `/stok/malzeme-istekleri/${ia.id}`)).durum, 200);
    const red = await istek<Hata>('depo_kisitli', 'GET', `/stok/malzeme-istekleri/${ib.id}`);
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal((await istek('depo_kisitli', 'GET', `/stok/malzeme-istekleri/${isiz.id}`)).durum, 200);
    assert.equal((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ib.id}`)).durum, 200);
    const sayac = async (kim: string) => ((await istek<{ hazirlik: number | null }>(kim, 'GET', '/stok/menu-sayaclari')).govde.hazirlik) ?? 0;
    assert.ok((await sayac('depo')) - (await sayac('depo_kisitli')) >= 1, 'sayaç da kapsamla sınırlı');
  });

  test('STK-K2 hazırla, teslim et ve iptal et: kapsam dışı istek 403 ve değişmez; kapsam içi geçer; sınırsız kapsam geçer', async () => {
    const { ia, ib } = await kapsamKur();
    const gec = (kim: string, id: number, eylem: string, surum: number, g: Record<string, unknown> = {}) =>
      istek<MalzemeIstegiCevabi & Hata>(kim, 'POST', `/stok/malzeme-istekleri/${id}/${eylem}`, { surum, ...g });
    for (const [eylem, g] of [['hazirla', {}], ['teslim-et', { karsilanan: '2' }], ['iptal-et', {}]] as const) {
      const red = await gec('depo_kisitli', ib.id, eylem, ib.surum, g);
      assert.equal(red.durum, 403, `${eylem}: ${JSON.stringify(red.govde)}`);
    }
    assert.equal(malzemeIstegiCevabi.parse((await istek('depo', 'GET', `/stok/malzeme-istekleri/${ib.id}`)).govde).istek.durum, 'acik', 'reddedilen komut yazmadı');
    const hazir = await gec('depo_kisitli', ia.id, 'hazirla', ia.surum);
    assert.equal(hazir.durum, 200, JSON.stringify(hazir.govde));
    assert.equal((await gec('depo_kisitli', ia.id, 'iptal-et', hazir.govde.istek.surum)).govde.istek.durum, 'iptal', 'kapsam içi iptal');
    assert.equal((await gec('depo', ib.id, 'hazirla', ib.surum)).durum, 200, 'sınırsız kapsam');
  });

  test('STK-K3 hazırlık listesi: kapsam dışı istasyona liste açılamaz, görünmez, toplanamaz ve kapatılamaz; kapsam içi ve istasyonsuz geçer; sınırsız kapsam hepsini görür', async () => {
    const { a, b, h, ia, ib } = await kapsamKur();
    const liste = (kim: string, g: Record<string, unknown>) => istek<ToplamaAyrintiCevabi & Hata>(kim, 'POST', '/stok/toplamalar', { ad: 'Kapsam hazırlığı', ...g });
    const redIstek = await liste('depo_kisitli', { istekIdler: [ib.id], hedef: { istasyonId: b.id } });
    assert.equal(redIstek.durum, 403, 'kapsam dışı isteği listeye alamaz');
    assert.equal((await liste('depo_kisitli', { kalemler: [{ malzemeId: h, miktar: '1' }], hedef: { istasyonId: b.id } })).durum, 403, 'kapsam dışı teslim yeri');
    const tb = await liste('depo', { istekIdler: [ib.id], hedef: { istasyonId: b.id } });
    assert.equal(tb.durum, 200, JSON.stringify(tb.govde));
    const ta = await liste('depo_kisitli', { istekIdler: [ia.id], hedef: { istasyonId: a.id } });
    assert.equal(ta.durum, 200, JSON.stringify(ta.govde));
    const ts = await liste('depo_kisitli', { kalemler: [{ malzemeId: h, miktar: '1' }] });
    assert.equal(ts.durum, 200, JSON.stringify(ts.govde));
    const kisitli = idler((await istek('depo_kisitli', 'GET', '/stok/toplamalar')).govde);
    assert.ok(kisitli.includes(ta.govde.toplama.id) && kisitli.includes(ts.govde.toplama.id), 'kapsam içi ve teslim yeri istasyon olmayan liste görünür');
    assert.ok(!kisitli.includes(tb.govde.toplama.id), 'kapsam dışı liste yok');
    const hepsi = idler((await istek('depo', 'GET', '/stok/toplamalar')).govde);
    assert.ok([ta, tb, ts].every((t) => hepsi.includes(t.govde.toplama.id)), 'sınırsız kapsam hepsini görür');
    assert.equal((await istek('depo_kisitli', 'GET', `/stok/toplamalar/${ta.govde.toplama.id}`)).durum, 200);
    assert.equal((await istek('depo_kisitli', 'GET', `/stok/toplamalar/${tb.govde.toplama.id}`)).durum, 403);
    assert.equal((await istek('depo', 'GET', `/stok/toplamalar/${tb.govde.toplama.id}`)).durum, 200);
    const adimB = toplamaAyrintiCevabi.parse(tb.govde).adimlar[0]!;
    const topla = (kim: string, t: ToplamaAyrintiCevabi, adimId: number) =>
      istek<Hata>(kim, 'POST', `/stok/toplamalar/${t.toplama.id}/adimlar/${adimId}/topla`, { surum: t.toplama.surum });
    assert.equal((await topla('depo_kisitli', tb.govde, adimB.id)).durum, 403, 'kapsam dışı adım toplanmaz');
    assert.equal((await istek('depo_kisitli', 'POST', `/stok/toplamalar/${tb.govde.toplama.id}/kapat`, { surum: tb.govde.toplama.surum, durum: 'iptal' })).durum, 403, 'kapsam dışı liste kapatılamaz');
    assert.equal((await topla('depo_kisitli', ta.govde, toplamaAyrintiCevabi.parse(ta.govde).adimlar[0]!.id)).durum, 200, 'kapsam içi adım toplanır');
    assert.equal((await istek('depo', 'POST', `/stok/toplamalar/${tb.govde.toplama.id}/kapat`, { surum: tb.govde.toplama.surum, durum: 'iptal' })).durum, 200, 'sınırsız kapsam kapatır');
  });
  test('numune teslimi (karar 115 a, 125 a): adımın bir adetlik parçası istasyondan "Kalite numune" kutusuna bırakılır; yeniden gönderim çift kayıt açmaz', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TN-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TNM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (sira: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '2.5' }]), adim(2, [])],
    }));
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`numune-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '100');
    const g = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '10' })).durum, 200);
    const ka = (await istasyonKonumu(a.id))!;
    const operator = kisiler.get('operator')!;
    const saglam = (isEmriId: number, fark: string) => o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, fark }));
    const numune = (isEmriId: number, kaynakKimligi: string) => o().vt.tx((db) => numuneTeslimi(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, adet: 1, kaynakKimligi }));
    const teslimSayisi = async () => Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_teslim WHERE uretim_emri_id = $1', [e]))!.n);
    await saglam(op10!, '1');
    assert.equal(await bakiye(hm, ka, s10), '2.500');

    // Kutu yoksa numune yine gider; stok yazılmaz, neden döner (karar 110 b gibi engel değildir).
    const kutusuz = await numune(op10!, randomUUID());
    assert.ok('atlandi' in kutusuz && kutusuz.atlandi.includes('Kalite numune'), JSON.stringify(kutusuz));
    assert.equal(await teslimSayisi(), 0);

    const kutu = (await o().vt.tx((db) => konumAc(db, { tur: 'ara_alan', kod: `KN-${sira}`, ad: 'Kalite numune' }))).konum.id;
    const kimlik = randomUUID();
    const ilk = await numune(op10!, kimlik);
    assert.ok('teslim' in ilk, JSON.stringify(ilk));
    const t = (await o().vt.tek<{ durum: string; malzemeId: number; statuId: number | null; miktar: string; uretimEmriId: number | null; gonderenKisiId: number }>(
      `SELECT durum, malzeme_id AS "malzemeId", statu_id AS "statuId", miktar::text, uretim_emri_id AS "uretimEmriId", gonderen_kisi_id AS "gonderenKisiId" FROM stok_teslim WHERE id = $1`, [ilk.teslim.id]))!;
    assert.deepEqual([t.durum, t.malzemeId, t.statuId, t.miktar, t.uretimEmriId, t.gonderenKisiId], ['teslim', hm, s10, '2.500', e, operator], 'ara alan kutusuna bırakılan numune hemen kapanır');
    assert.deepEqual([await bakiye(hm, ka, s10), await bakiye(hm, kutu, s10)], [null, '2.500'], 'parça statüsüyle kutuya geçer');
    // Bağlantı kopup yeniden gönderilen numune ikinci teslim açmaz (karar 95 a).
    assert.deepEqual(await numune(op10!, kimlik), ilk);
    assert.equal(await teslimSayisi(), 1);
    // İstasyonda parça kalmadıysa eksiye düşülmez; neden döner.
    const parcasiz = await numune(op10!, randomUUID());
    assert.ok('atlandi' in parcasiz, JSON.stringify(parcasiz));
    assert.deepEqual([await teslimSayisi(), await bakiye(hm, kutu, s10)], [1, '2.500']);
    // Yolda olan kısım alınamaz: istasyonda 2,5 var ama 1,5'i yolda; numunelik serbest parça yok.
    await saglam(op10!, '1');
    const yolda = await gonder('depo', { malzemeId: hm, miktar: '1.5', statuId: s10, kaynak: { istasyonId: a.id }, hedef: { konumId: await kabulKonumu() } });
    assert.equal(yolda.durum, 200, JSON.stringify(yolda.govde));
    assert.ok('atlandi' in await numune(op10!, randomUUID()));
    assert.deepEqual([await teslimSayisi(), await bakiye(hm, ka, s10)], [1, '2.500'], 'numune teslimi açılmadı');

    // Son adımın numunesi emrin ürünüdür (bir adet, statüsüz).
    await saglam(op10!, '1');
    await saglam(op20!, '1');
    const son = await numune(op20!, randomUUID());
    assert.ok('teslim' in son, JSON.stringify(son));
    assert.deepEqual([await bakiye(ym, ka), await bakiye(ym, kutu)], [null, '1.000']);

    // Aynı adlı iki kutu varsa hangisine gideceği belli değildir: teslim yazılmaz.
    await o().vt.tx((db) => konumAc(db, { tur: 'ara_alan', kod: `KN2-${sira}`, ad: 'KALİTE NUMUNE' }));
    await saglam(op10!, '1');
    const iki = await numune(op10!, randomUUID());
    assert.ok('atlandi' in iki && iki.atlandi.includes('birden çok'), JSON.stringify(iki));
    adimStatusuCozucusuKaydet(async () => null);
  });

  test('numune teslimi: rotasız emirde (iş emri yok) numune emrin ürünüdür, statüsüz', async () => {
    const ym = await kart('yarimamul');
    const a = await istasyon();
    const e = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 5, $3, $4, $5, $6) RETURNING id',
      [`P-N${sira}`, 'Deneme', a.id, kisiler.get('yonetici'), ym, await revizyon(ym)]))!.id;
    const operator = kisiler.get('operator')!;
    await o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId: null, istasyonId: a.id, kisiId: operator, fark: '2' }));
    const ka = (await istasyonKonumu(a.id))!;
    const kutu = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE ad = 'Kalite numune'"))!.id;
    await o().vt.sorgu("UPDATE stok_konum SET aktif = false WHERE ad = 'KALİTE NUMUNE'");
    const n = await o().vt.tx((db) => numuneTeslimi(db, { uretimEmriId: e, isEmriId: null, istasyonId: a.id, kisiId: operator, adet: 1, kaynakKimligi: randomUUID() }));
    assert.ok('teslim' in n, JSON.stringify(n));
    assert.deepEqual([await bakiye(ym, ka), await bakiye(ym, kutu)], ['1.000', '1.000']);
  });
  // Kart #95, soru 96: istasyon yetkilisi ve isteyen ayrı kapsamlarda iki operatördür.
  const istasyonluOperator = async (ad: string, isMerkeziId: number): Promise<void> => {
    await kisiEkle(ad, 'operator');
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get(ad), isMerkeziId]);
  };
  const istasyonaKoy = async (malzemeId: number, istasyonId: number, miktar: string): Promise<void> => {
    await malKabul(malzemeId, miktar);
    const g = await gonder('depo', { malzemeId, miktar, kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId } });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal((await istek('kalite', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: miktar })).durum, 200);
  };

  test('soru 96 a: istasyondan istek o istasyonun yetkilisine düşer; kabul teslimi istekle gönderir, alınınca kapanır; red nedenle iptal eder', async () => {
    const h = await kart('hammadde');
    const [a, b] = [await istasyon(), await istasyon()];
    await istasyonluOperator('op_a', a.isMerkeziId);
    await istasyonluOperator('op_b', b.isMerkeziId);
    await istasyonaKoy(h, a.id, '6');
    // Nerede var: istek isteyebilen herkes istasyonlardaki serbest miktarı görür (kapsam dışı da); stok.istek olmayan göremez.
    const yer = await istek<MalzemeYerleriCevabi>('op_b', 'GET', `/stok/teslim-kutusu/malzeme-yerleri?malzemeId=${h}`);
    assert.equal(yer.durum, 200, JSON.stringify(yer.govde));
    assert.deepEqual(malzemeYerleriCevabi.parse(yer.govde).istasyonlar.map((x) => [x.istasyonId, x.miktar]), [[a.id, '6']]);
    assert.equal((await istek('sevkiyat', 'GET', `/stok/teslim-kutusu/malzeme-yerleri?malzemeId=${h}`)).durum, 403);
    const ac = (g: Record<string, unknown>) => istek<MalzemeIstegiCevabi & Hata>('op_b', 'POST', '/stok/malzeme-istekleri/ac',
      { malzemeId: h, miktar: '4', istasyonId: b.id, kaynakIstasyonId: a.id, not: null, kaynakKimligi: randomUUID(), ...g });
    assert.equal((await ac({ istasyonId: null })).durum, 400, 'istasyondan istek istasyona teslim edilir');
    assert.equal((await ac({ istasyonId: a.id })).durum, 403, 'teslim yeri yine isteyenin kapsamında olmalı');
    const acilan = await ac({});
    assert.equal(acilan.durum, 200, JSON.stringify(acilan.govde));
    const i = malzemeIstegiCevabi.parse(acilan.govde).istek;
    assert.deepEqual([i.durum, i.kaynakIstasyonId], ['acik', a.id]);
    assert.match(i.kaynakIstasyonAd ?? '', /^Deneme istasyon/);
    // Depoya düşmez: depo listesinde yok, depo geçişleri reddedilir.
    const depoListesi = await istek<{ satirlar: { id: number }[] }>('depo', 'GET', '/stok/malzeme-istekleri?sayfa=1');
    assert.ok(!depoListesi.govde.satirlar.some((x) => x.id === i.id));
    assert.equal((await istek('depo', 'POST', `/stok/malzeme-istekleri/${i.id}/hazirla`, { surum: i.surum })).durum, 409);
    // Benden istenenler yalnız kaynak istasyonun kapsamındakine.
    assert.ok((await kutu('op_a')).bendenIstenenler?.some((x) => x.id === i.id));
    assert.ok(!(await kutu('op_b')).bendenIstenenler?.some((x) => x.id === i.id));
    const kabul = (kim: string, g: Record<string, unknown>) => istek<MalzemeIstegiCevabi & Hata>(kim, 'POST', `/stok/malzeme-istekleri/${i.id}/kabul-et`,
      { surum: i.surum, miktar: '4', kaynakKimligi: randomUUID(), ...g });
    assert.equal((await kabul('op_b', {})).durum, 403, 'isteyen kaynak istasyonun kapsamında değil');
    assert.equal((await kabul('operator_kisitli', {})).durum, 403, 'kapsam dışı kişi');
    assert.equal((await kabul('op_a', { surum: i.surum + 5 })).durum, 409, 'eski sürüm');
    assert.equal((await kabul('op_a', { miktar: '7' })).durum, 400, 'istasyondaki serbestten fazlası');
    const k = await kabul('op_a', {});
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(k.govde.istek.durum, 'hazirlaniyor');
    const yolda = k.govde.istek.yoldaTeslim!;
    assert.ok(yolda, 'teslim yolda');
    const t = (await kutu('op_b')).gelenler.find((x) => x.id === yolda.id)!;
    assert.equal(t.istekId, i.id);
    assert.equal((await istek('op_a', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '4' })).durum, 403, 'gönderen kendi teslimini almaz');
    const al = await istek<TeslimCevabi>('op_b', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: '4' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    const son = (await kutu('op_b')).isteklerim.find((x) => x.id === i.id);
    assert.deepEqual([son?.durum, son?.karsilanan], ['teslim', '4.000']);
    assert.deepEqual([await bakiye(h, (await istasyonKonumu(a.id))!), await bakiye(h, (await istasyonKonumu(b.id))!)], ['2.000', '4.000']);

    const ikinci = (await ac({ miktar: '1' })).govde.istek;
    const red = (kim: string, g: Record<string, unknown>) => istek<MalzemeIstegiCevabi & Hata>(kim, 'POST', `/stok/malzeme-istekleri/${ikinci.id}/reddet`, { surum: ikinci.surum, neden: 'Bu iş için ayrıldı', ...g });
    assert.equal((await red('op_b', {})).durum, 403);
    const r = await red('op_a', {});
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual([r.govde.istek.durum, r.govde.istek.redNedeni], ['iptal', 'Bu iş için ayrıldı']);
    assert.equal((await red('op_a', { surum: r.govde.istek.surum })).durum, 409, 'kapanan istek değişmez');
  });

  test('soru 96 b: malzeme ve yer okutularak başka istasyondan alınır (işaretli, bildirimli); itiraz süre içinde bir kez, iade teslimi açar', async () => {
    const h = await kart('hammadde');
    const [a, b] = [await istasyon(), await istasyon()];
    await istasyonluOperator('op_ka', a.isMerkeziId);
    await istasyonluOperator('op_kb', b.isMerkeziId);
    await o().sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2026-01-01', 100)", [a.id, kisiler.get('op_ka')]);
    await istasyonaKoy(h, a.id, '5');
    const aKonum = (await istasyonKonumu(a.id))!;
    const yerKodu = (await o().vt.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE id = $1', [aKonum]))!.kod;
    const on = await istek<OkutarakAlCevabi>('op_kb', 'GET', `/stok/teslim-kutusu/okutarak-al?kod=${h}&yerKodu=${encodeURIComponent(yerKodu)}`);
    assert.equal(on.durum, 200, JSON.stringify(on.govde));
    const satir = okutarakAlCevabi.parse(on.govde).satirlar[0]!;
    assert.deepEqual([okutarakAlCevabi.parse(on.govde).yer.istasyonId, satir.miktar], [a.id, '5.000']);
    assert.equal((await istek('op_kb', 'GET', `/stok/teslim-kutusu/okutarak-al?kod=${h}&yerKodu=KABUL`)).durum, 400, 'yer istasyon olmalı');
    assert.equal((await istek('sevkiyat', 'GET', `/stok/teslim-kutusu/okutarak-al?kod=${h}&yerKodu=${yerKodu}`)).durum, 403);
    const al = (kim: string, g: Record<string, unknown>) => istek<TeslimCevabi & Hata>(kim, 'POST', '/stok/teslim-kutusu/okutarak-al',
      { kod: String(h), yerKodu, istasyonId: b.id, partiId: satir.partiId, statuId: null, miktar: '3', kaynakKimligi: randomUUID(), ...g });
    assert.equal((await al('op_kb', { istasyonId: a.id })).durum, 403, 'hedef alan kişinin kapsamında olmalı');
    assert.equal((await al('op_kb', { miktar: '9' })).durum, 400, 'serbestten fazlası');
    assert.equal((await al('sevkiyat', {})).durum, 403);
    const c = await al('op_kb', {});
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const t = teslimCevabi.parse(c.govde).teslim;
    assert.deepEqual([t.durum, t.okutarak, t.aciklama, t.itiraz], ['teslim', true, 'Okutarak alındı, kaynak onayı yok', null]);
    assert.ok(t.itirazSonu && Date.parse(t.itirazSonu) > Date.now(), 'itiraz süresi açık');
    assert.deepEqual([await bakiye(h, aKonum), await bakiye(h, (await istasyonKonumu(b.id))!)], ['2.000', '3.000']);
    const bildirim = await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'stok.okutarak-alindi' AND kisi_id = $1", [kisiler.get('op_ka')]);
    assert.equal(bildirim?.n, 1, 'kaynak istasyona atanmış kişiye bildirim');
    assert.ok((await kutu('op_ka')).okutarakAlinanlar?.some((x) => x.id === t.id), 'kaynak taraf itiraz edilebilecekleri görür');

    const itiraz = (kim: string, g: Record<string, unknown>) => istek<TeslimCevabi & Hata>(kim, 'POST', `/stok/teslimler/${t.id}/itiraz`, { surum: t.surum, neden: 'Sorulmadan alındı', ...g });
    assert.equal((await itiraz('op_kb', {})).durum, 403, 'alan kişi kaynak istasyonun kapsamında değil');
    assert.equal((await itiraz('operator_kisitli', {})).durum, 403);
    const it = await itiraz('op_ka', {});
    assert.equal(it.durum, 200, JSON.stringify(it.govde));
    const itz = teslimCevabi.parse(it.govde).teslim.itiraz!;
    assert.equal(itz.neden, 'Sorulmadan alındı');
    assert.ok(itz.iadeTeslimId, 'iade teslimi açıldı');
    const iade = (await kutu('op_ka')).gelenler.find((x) => x.id === itz.iadeTeslimId)!;
    assert.deepEqual([iade.durum, iade.miktar, iade.kaynak.istasyonId, iade.hedef.istasyonId], ['yolda', '3.000', b.id, a.id]);
    assert.equal(await bakiye(h, aKonum), '2.000', 'itiraz geri almaz');
    assert.equal((await itiraz('op_ka', { surum: it.govde.teslim.surum })).durum, 409, 'ikinci itiraz');

    const ikinci = teslimCevabi.parse((await al('op_kb', { miktar: '1' })).govde).teslim;
    await o().sahip.sorgu("UPDATE stok_teslim SET itiraz_sonu = now() - interval '1 minute' WHERE id = $1", [ikinci.id]);
    assert.equal((await istek('op_ka', 'POST', `/stok/teslimler/${ikinci.id}/itiraz`, { surum: ikinci.surum, neden: 'Geç' })).durum, 409, 'süre bitti');
    assert.ok(!(await kutu('op_ka')).okutarakAlinanlar?.some((x) => x.id === ikinci.id));
    const okutmasiz = await gonder('op_ka', { malzemeId: h, miktar: '1', kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    assert.equal((await istek('op_ka', 'POST', `/stok/teslimler/${okutmasiz.govde.teslim.id}/itiraz`, { surum: okutmasiz.govde.teslim.surum, neden: 'x' })).durum, 409, 'okutarak alınmayan teslime itiraz yok');
  });
  test('kart #123 refakat partisi: lot okutularak emre ayrılır (116 b), aynı lot aynı kart, başka lot yeni kart; teslim kartla, alan kartı okutup alır (118 a); teslimli kart iptal edilmez', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde', 'kg')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TR-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TRM-${a.id}`, 'Tezgah', a.id]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const isEmirleri: IsEmriGirdisi[] = [{
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
    }];
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri }));
    await malKabul(hm, '30');
    await malKabul(hm, '20');
    const [l1, l2] = await o().vt.sorgu<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id', [hm]);
    const ac = (kim: string, lotKodu: string, emir = e) => istek<RefakatPartisiCevabi & Hata>(kim, 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu });

    // İzinli ve reddedilen: kart etiketi (MLZ) lot yerine geçmez; stok.transfer olmayan açamaz; bilinmeyen lot ve emir reddedilir.
    const kartEtiketi = await ac('depo', `MLZ:${hm}`);
    assert.deepEqual([kartEtiketi.durum, kartEtiketi.govde.alan], [400, 'lotKodu']);
    assert.equal((await ac('operator', `LOT:${l1!.lot_no}`)).durum, 403);
    assert.equal((await ac('depo', 'LOT:YOK-000000')).durum, 400);
    assert.equal((await ac('depo', `LOT:${l1!.lot_no}`, 999999)).govde.alan, 'uretimEmriId');
    const p1 = await ac('depo', `LOT:${l1!.lot_no}`);
    assert.equal(p1.durum, 200, JSON.stringify(p1.govde));
    const r1 = refakatPartisiCevabi.parse(p1.govde).refakat;
    assert.deepEqual([r1.qr, r1.sira, r1.partiId, r1.lotNo, r1.uretimEmriId, r1.verilen, r1.durum], [`RP:${r1.id}`, 1, l1!.id, l1!.lot_no, e, '0', 'acik']);
    assert.match(r1.etiket, /-P1$/);
    assert.equal((await ac('depo', ` lot:${l1!.lot_no} `)).govde.refakat.id, r1.id, 'aynı emir ve lot: aynı kart');
    const r2 = (await ac('depo', `LOT:${l2!.lot_no}`)).govde.refakat;
    assert.deepEqual([r2.sira, r2.partiId], [2, l2!.id], 'başka lot: yeni kart');
    const liste = refakatPartileriCevabi.parse((await istek('depo', 'GET', `/stok/uretim-emirleri/${e}/refakat-partileri`)).govde);
    assert.deepEqual(liste.partiler.map((x) => x.id), [r1.id, r2.id]);
    const kartC = await istek<RefakatPartisiKartiCevabi>('depo', 'GET', `/stok/refakat-partileri/${r1.id}/kart`);
    assert.equal(kartC.durum, 200, JSON.stringify(kartC.govde));
    assert.deepEqual([refakatPartisiKartiCevabi.parse(kartC.govde).kart.qr, kartC.govde.kart.emirId], [`RP:${r1.id}`, e]);

    // Veren kartı okutur: lotun alabileceği yerleri gelir; Okut sayfası lotu kartın partisiyle çözer.
    const okut = async (kim: string): Promise<Extract<OkutCozCevabi, { tur: 'malzeme' }>> => {
      const y = await istek(kim, 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(`RP:${r1.id}`)}`);
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
      const c = okutCozCevabi.parse(y.govde);
      assert.equal(c.tur, 'malzeme');
      return c as Extract<OkutCozCevabi, { tur: 'malzeme' }>;
    };
    const depoOkut = await okut('depo');
    assert.deepEqual([depoOkut.refakat?.id, depoOkut.parti?.id, depoOkut.yerler.map((y) => [y.partiId, y.miktar])], [r1.id, l1!.id, [[l1!.id, '30.000']]]);
    const stokCoz = kodCozCevabi.parse((await istek<KodCozCevabi>('depo', 'GET', `/stok/kod-coz?kod=RP:${r1.id}`)).govde);
    assert.deepEqual(stokCoz.tur === 'lot' ? [stokCoz.parti.id, stokCoz.refakat?.id] : null, [l1!.id, r1.id]);

    // Kartla teslim: lot ve emir karttan; kartla çelişen lot reddedilir.
    const kabul = await kabulKonumu();
    const yanlis = await gonder('depo', { malzemeId: hm, miktar: '5', partiId: l2!.id, kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r1.id });
    assert.deepEqual([yanlis.durum, yanlis.govde.alan], [400, 'refakatPartisiId']);
    const g = await gonder('depo', { malzemeId: hm, miktar: '12', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r1.id });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.deepEqual([g.govde.teslim.partiId, g.govde.teslim.uretimEmriId, g.govde.teslim.durum], [l1!.id, e, 'yolda']);

    // Alan kartı okutur, kendisine gelen teslim açılır; kapsamı dışındaki görmez. Liste de kalır.
    assert.deepEqual((await okut('operator')).gelenler?.map((t) => t.id), [g.govde.teslim.id]);
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('operator_kisitli'), (await istasyon()).isMerkeziId]);
    assert.deepEqual((await okut('operator_kisitli')).gelenler, []);
    assert.deepEqual((await okut('depo')).gelenler, [], 'gönderen kendi teslimini almaz');
    const al = await istek<TeslimCevabi>('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '12' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.equal((await istek<RefakatPartisiCevabi>('depo', 'GET', `/stok/refakat-partileri/${r1.id}`)).govde.refakat.verilen, '12');

    // Aynı lotun kalanı aynı kartla: parti değişmez, verilen artar.
    const g2 = await gonder('depo', { malzemeId: hm, miktar: '3', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r1.id });
    assert.equal(g2.durum, 200, JSON.stringify(g2.govde));
    assert.equal((await istek<RefakatPartisiCevabi>('depo', 'GET', `/stok/refakat-partileri/${r1.id}`)).govde.refakat.verilen, '15');
    // Alan taraf karta bağlı lotun etiketini okutursa kart söylenir; kartla alır (kullanıcı akışı 14:16). Teslim al listesi kalır.
    const lotla = await istek<Hata>('operator', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(`LOT:${l1!.lot_no}`)}`);
    assert.equal(lotla.durum, 400);
    assert.match(lotla.govde.mesaj, new RegExp(`${r1.etiket} refakat kartına bağlı`));
    assert.equal((await istek('depo', 'GET', `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(`LOT:${l1!.lot_no}`)}`)).durum, 200, 'gönderen lotu okutabilir');
    assert.deepEqual((await okut('operator')).gelenler?.map((t) => t.id), [g2.govde.teslim.id]);

    // İptal: teslimli kart kalır; teslimsiz kart iptal edilir, iptal kartla teslim edilmez, aynı lota yeni kart açılır.
    assert.equal((await istek('depo', 'POST', `/stok/refakat-partileri/${r1.id}/iptal-et`, { surum: r1.surum })).durum, 409);
    assert.equal((await istek('operator', 'POST', `/stok/refakat-partileri/${r2.id}/iptal-et`, { surum: r2.surum })).durum, 403);
    const iptal = await istek<RefakatPartisiCevabi>('depo', 'POST', `/stok/refakat-partileri/${r2.id}/iptal-et`, { surum: r2.surum });
    assert.deepEqual([iptal.durum, iptal.govde.refakat.durum], [200, 'iptal']);
    const iptalli = await gonder('depo', { malzemeId: hm, miktar: '1', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r2.id });
    assert.deepEqual([iptalli.durum, iptalli.govde.alan], [400, 'refakatPartisiId']);
    // Sepetten karta geçiş: lot okutularak eklenen satır karta geçer ve sepetten çıkar; lotsuz satır, başkasının satırı ve iki kaynak birden reddedilir.
    const sepeteEkle = async (kim: string, partiId: number | null) => {
      const c = await istek<{ satirlar: { id: number; partiId: number | null }[] }>(kim, 'POST', '/stok/sepet/satir-ekle', { malzemeId: hm, miktar: '2', kaynakKonumId: kabul, partiId });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.satirlar.find((x) => x.partiId === partiId)!.id;
    };
    const satir = await sepeteEkle('depo', l2!.id);
    assert.equal((await istek('depo_kisitli', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, sepetSatirId: satir })).durum, 404);
    assert.equal((await istek('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, sepetSatirId: satir, lotKodu: `LOT:${l2!.lot_no}` })).durum, 400);
    const sepettenKart = await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, sepetSatirId: satir });
    assert.equal(sepettenKart.durum, 200, JSON.stringify(sepettenKart.govde));
    const r3 = sepettenKart.govde.refakat;
    assert.deepEqual([r3.sira, r3.partiId, r3.id !== r2.id], [3, l2!.id, true]);
    assert.ok(!(await istek<{ satirlar: { id: number }[] }>('depo', 'GET', '/stok/sepet')).govde.satirlar.some((x) => x.id === satir), 'satır karta geçti');
    const lotsuz = await o().vt.tek<{ id: number }>('INSERT INTO stok_sepet_satiri (kisi_id, malzeme_id, kaynak_konum_id, parti_id, miktar) VALUES ($1, $2, $3, NULL, 1) RETURNING id', [kisiler.get('depo'), hm, kabul]);
    const lotsuzC = await istek<Hata>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, sepetSatirId: lotsuz!.id });
    assert.deepEqual([lotsuzC.durum, lotsuzC.govde.alan], [400, 'sepetSatirId']);
    // Üretim partisi (emrin çıktısı) kart açmaz.
    const uretimLotu = await o().vt.tx(async (db) => {
      const no = `LT-RP-${sira}`;
      return (await db.tek<{ lot_no: string }>('INSERT INTO stok_parti (malzeme_id, uretim_emri_id, acan_kisi_id, lot_no) VALUES ($1, $2, $3, $4) RETURNING lot_no', [ym, e, kisiler.get('depo'), no]))!.lot_no;
    });
    assert.equal((await ac('depo', `LOT:${uretimLotu}`)).durum, 400);
  });
  test('kart #155 kart satırları, Serbest Al, bırakınca teslim, herkese sepet ve yolda süresi (Soru 128, 133)', async () => {
    const [ym, hm, h2] = [await kart('yarimamul'), await kart('hammadde', 'kg'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    await istasyonluOperator('op_8a', a.isMerkeziId);
    await istasyonluOperator('op_8b', b.isMerkeziId);
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`T8-${sira}`]))!.id;
    const makine = async (ist: number) => (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`T8M-${ist}`, 'Tezgah', ist]))!.id;
    const adim = (n: number, mk: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira: n, opNo: n * 10, ad: `Adım ${n}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: mk }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const isEmirleri = [adim(1, await makine(a.id), [{ malzemeNo: hm, miktar: '1' }]), adim(2, await makine(b.id), [])];
    const { uretimEmriId: e } = await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, { projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri }));
    await malKabul(hm, '20');
    const lot = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1', [hm]))!;
    const r = refakatPartisiCevabi.parse((await istek('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${lot.lot_no}` })).govde).refakat;
    const g = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id });
    assert.equal((await istek('op_8a', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '10' })).durum, 200);
    const aKonum = (await istasyonKonumu(a.id))!;

    // Kartın satırları: malzeme rota boyunca nerede; depodaki lotun kalanı kartın satırı değildir.
    const sat = await istek('op_8b', 'GET', `/stok/refakat-partileri/${r.id}/satirlar`);
    assert.equal(sat.durum, 200, JSON.stringify(sat.govde));
    const satirlar = refakatKartSatirlariCevabi.parse(sat.govde).satirlar;
    assert.deepEqual(satirlar.map((x) => [x.konumId, x.istasyonId, x.partiId, Number(x.miktar), Number(x.alinabilir)]), [[aKonum, a.id, lot.id, 10, 10]]);
    const kod = okutCozCevabi.parse((await istek('op_8b', 'GET', `/stok/teslim-kutusu/kod-coz?kod=RP:${r.id}`)).govde);
    assert.equal(kod.tur === 'malzeme' ? kod.kartSatirlari?.length : null, 1, 'kart okutulunca satırlar da gelir');

    // Serbest Al: kaynak onayı yok, hemen alınır; satırın alınabilirinden fazlası ve kapsam dışı istasyon reddedilir.
    const serbestAl = (kim: string, ek: Record<string, unknown>) => istek<TeslimCevabi & Hata>(kim, 'POST', `/stok/refakat-partileri/${r.id}/serbest-al`,
      { konumId: aKonum, partiId: lot.id, statuId: null, miktar: '4', istasyonId: b.id, kaynakKimligi: randomUUID(), ...ek });
    assert.equal((await serbestAl('op_8b', { miktar: '11' })).durum, 400);
    assert.equal((await serbestAl('op_8b', { istasyonId: a.id })).durum, 403, 'hedef istasyon alanın kapsamında olmalı');
    const sa = await serbestAl('op_8b', {});
    assert.equal(sa.durum, 200, JSON.stringify(sa.govde));
    const st = teslimCevabi.parse(sa.govde).teslim;
    assert.deepEqual([st.durum, st.okutarak, st.uretimEmriId, st.partiId], ['teslim', true, e, lot.id]);
    const bKonum = (await istasyonKonumu(b.id))!;
    assert.deepEqual([await bakiye(hm, aKonum), await bakiye(hm, bKonum)], ['6.000', '4.000']);

    // Bırakınca teslim: hemen kapanır, hedef taraf itiraz eder; bırakan kendi teslimine itiraz edemez.
    const bi = await gonder('op_8b', { malzemeId: hm, miktar: '1', partiId: lot.id, kaynak: { istasyonId: b.id }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id, birak: true });
    assert.equal(bi.durum, 200, JSON.stringify(bi.govde));
    const bt = teslimCevabi.parse(bi.govde).teslim;
    assert.deepEqual([bt.durum, bt.okutarak], ['teslim', true]);
    assert.ok(bt.itirazSonu && Date.parse(bt.itirazSonu) > Date.now());
    assert.deepEqual([await bakiye(hm, aKonum), await bakiye(hm, bKonum)], ['7.000', '3.000']);
    const itirazEdilecek = (await kutu('op_8a')).okutarakAlinanlar?.map((x) => x.id) ?? [];
    assert.ok(itirazEdilecek.includes(st.id) && itirazEdilecek.includes(bt.id), 'kaynak taraf Serbest Al\'ı, hedef taraf bırakılanı görür');
    assert.ok(!(await kutu('op_8b')).okutarakAlinanlar?.some((x) => x.id === bt.id), 'bırakan kendi teslimini itiraz listesinde görmez');
    assert.equal((await istek('op_8b', 'POST', `/stok/teslimler/${bt.id}/itiraz`, { surum: bt.surum, neden: 'x' })).durum, 403);
    const it = await istek<TeslimCevabi>('op_8a', 'POST', `/stok/teslimler/${st.id}/itiraz`, { surum: st.surum, neden: 'Sorulmadan alındı' });
    assert.equal(it.durum, 200, JSON.stringify(it.govde));
    assert.ok(teslimCevabi.parse(it.govde).teslim.itiraz?.iadeTeslimId, 'iade teslimi açıldı');

    // Herkese sepet: kartla eklenen satıra rotada sonraki istasyon önerilir; hedefsiz satır gönderilmez, sepette kalır.
    await istasyonaKoy(h2, a.id, '3');
    const ekle = (g2: Record<string, unknown>) => istek<{ satirlar: { id: number; malzemeId: number; refakat?: { id: number } | null; hedef?: { istasyonId: number | null } | null }[] } & Hata>(
      'op_8a', 'POST', '/stok/sepet/satir-ekle', { miktar: '2', kaynakKonumId: aKonum, ...g2 });
    assert.deepEqual([(await ekle({ malzemeId: hm, partiId: lot.id, statuId: 1, refakatPartisiId: r.id })).govde.alan], ['statuId']);
    assert.equal((await ekle({ malzemeId: h2 })).durum, 200);
    const sp = await ekle({ malzemeId: hm, partiId: lot.id, refakatPartisiId: r.id });
    assert.equal(sp.durum, 200, JSON.stringify(sp.govde));
    const kartli = sp.govde.satirlar.find((x) => x.malzemeId === hm)!, hedefsiz = sp.govde.satirlar.find((x) => x.malzemeId === h2)!;
    assert.deepEqual([kartli.refakat?.id, kartli.hedef?.istasyonId, hedefsiz.hedef ?? null], [r.id, b.id, null]);
    const gn = await istek<SepetTeslimEtCevabi>('op_8a', 'POST', '/stok/sepet/gonder', { satirlar: [{ satirId: kartli.id }, { satirId: hedefsiz.id }], kaynakKimligi: randomUUID() });
    assert.equal(gn.durum, 200, JSON.stringify(gn.govde));
    const sonuc = sepetTeslimEtCevabi.parse(gn.govde);
    assert.deepEqual([sonuc.teslimler.map((x) => x.satirId), sonuc.kalanlar.map((x) => [x.satirId, x.neden])], [[kartli.id], [[hedefsiz.id, 'Hedef seçilmedi.']]]);
    assert.deepEqual((await istek<{ satirlar: { id: number }[] }>('op_8a', 'GET', '/stok/sepet')).govde.satirlar.map((x) => x.id), [hedefsiz.id]);
    const yolda = (await o().vt.tek<{ id: number; durum: string; uretim_emri_id: number; hedef_konum_id: number }>('SELECT id, durum, uretim_emri_id, hedef_konum_id FROM stok_teslim WHERE no = $1', [sonuc.teslimler[0]!.teslimNo]))!;
    assert.deepEqual([yolda.durum, yolda.uretim_emri_id, yolda.hedef_konum_id], ['yolda', e, bKonum]);

    // Yolda süresi: ayar boşken iş bir şey yapmaz; süresi dolan teslim "süre doldu" ile iptal olur, gönderene bildirim gider.
    await o().sahip.sorgu("UPDATE stok_teslim SET gonderim = now() - interval '3 hours' WHERE id = $1", [yolda.id]);
    assert.equal(await o().vt.tx((db) => suresiDolanTeslimleriIptal(db)), 0);
    await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('stok.yolda-suresi-dk', '120', $1)", [kisiler.get('yonetici')]);
    try {
      assert.ok((await o().vt.tx((db) => suresiDolanTeslimleriIptal(db))) >= 1);
    } finally {
      await o().sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'stok.yolda-suresi-dk'");
    }
    const iptal = (await o().vt.tek<{ durum: string; aciklama: string }>('SELECT durum, aciklama FROM stok_teslim WHERE id = $1', [yolda.id]))!;
    assert.equal(iptal.durum, 'iptal');
    assert.match(iptal.aciklama, /^Süre doldu/);
    const bildirim = await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'stok.teslim-suresi-doldu' AND kisi_id = $1", [kisiler.get('op_8a')]);
    assert.equal(bildirim?.n, 1);
  });
  test('kart #126 sayım partiye: kartla sayımda hammadde kartın lotundan işlenir, parça kartın partisine girer; geçersiz kart sayımı reddeder', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TS-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TSM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (n: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira: n, opNo: n * 10, ad: `Adım ${n}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const emirAc = async () => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '2' }]), adim(2, [])],
    }))).uretimEmriId;
    const [e, baska] = [await emirAc(), await emirAc()];
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`rp-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    try {
      await malKabul(hm, '10');
      await malKabul(hm, '10');
      const [l1, l2] = await o().vt.sorgu<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id', [hm]);
      const kabul = await kabulKonumu();
      const al = async (t: { id: number; surum: number }, alinan: string) =>
        assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan })).durum, 200);
      // Kartsız eski lot istasyona önce gelir: kartsız sayım en eskiyi (l1) işlerdi.
      const eski = await gonder('depo', { malzemeId: hm, miktar: '10', partiId: l1!.id, kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
      await al(eski.govde.teslim, '10');
      const ka = (await istasyonKonumu(a.id))!;
      const r = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${l2!.lot_no}` })).govde.refakat;
      const kartla = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id });
      assert.equal(kartla.durum, 200, JSON.stringify(kartla.govde));
      await al(kartla.govde.teslim, '10');
      const operator = kisiler.get('operator')!;
      const saglam = (isEmriId: number, fark: string, refakatPartisiId: number | null, emir = e) =>
        o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: emir, isEmriId, istasyonId: a.id, kisiId: operator, fark, refakatPartisiId }));
      const partide = async (malzemeId: number, partiId: number, statuId: number | null) => (await o().vt.tek<{ m: string | null }>(
        'SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND parti_id = $3 AND statu_id IS NOT DISTINCT FROM $4', [malzemeId, ka, partiId, statuId]))?.m ?? null;

      // Reddedilen: bilinmeyen kart, başka emrin kartı; ret sayımı (işlemi) geri alır.
      await assert.rejects(saglam(op10!, '1', 999999), /Refakat kartı bulunamadı/);
      const [b10] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [baska])).map((x) => x.id);
      await assert.rejects(saglam(b10!, '1', r.id, baska), /başka bir emrin/);
      assert.deepEqual([await partide(hm, l1!.id, s10), await partide(hm, l2!.id, s10)], [null, null]);

      // İzinli: kartla sayımda kartın lotu işlenir (l1 daha eski olsa da), son adımın parçası kartın partisine girer.
      await saglam(op10!, '2', r.id);
      assert.deepEqual([await partide(hm, l2!.id, s10), await partide(hm, l1!.id, s10), await partide(hm, l1!.id, null)], ['4.000', null, '10.000']);
      await saglam(op20!, '2', r.id);
      const cikti = (await o().vt.tek<{ id: number; uretimEmriId: number; refakat: number; lotNo: string }>(
        'SELECT id, uretim_emri_id AS "uretimEmriId", refakat_partisi_id AS refakat, lot_no AS "lotNo" FROM stok_parti WHERE malzeme_id = $1 AND refakat_partisi_id IS NOT NULL', [ym]))!;
      assert.deepEqual([cikti.uretimEmriId, cikti.refakat], [e, r.id]);
      assert.equal(await partide(ym, cikti.id, null), '2.000');
      // Kartsız sayım kartı kaynaktan bulur (Soru 129): istasyondaki en eski l1 işlenir, emre l1'in kartı açılır, parça o kartın partisine girer.
      await saglam(op10!, '1', null);
      await saglam(op20!, '1', null);
      const r1 = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_refakat_partisi WHERE uretim_emri_id = $1 AND parti_id = $2', [e, l1!.id]))!.id;
      const cikti1 = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND refakat_partisi_id = $2', [ym, r1]))!.id;
      assert.equal(await o().vt.tek('SELECT 1 AS x FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2 AND refakat_partisi_id IS NULL', [ym, e]), null, 'kartsız emir partisi açılmaz');
      assert.deepEqual([await partide(ym, cikti1, null), await partide(ym, cikti.id, null)], ['1.000', '2.000']);
      // Geri alma aynı modelle: kartla düzeltme kartın partisinden düşer.
      await saglam(op20!, '-1', r.id);
      assert.deepEqual([await partide(ym, cikti1, null), await partide(ym, cikti.id, null)], ['1.000', '1.000']);
      // Kartla üretim sayıldıysa kart iptal edilmez (teslimi olmasa da: kural testinde).
      assert.equal((await istek('depo', 'POST', `/stok/refakat-partileri/${r.id}/iptal-et`, { surum: r.surum })).durum, 409);
    } finally {
      adimStatusuCozucusuKaydet(async () => null);
    }
  });

  test('kart #126 Soru 126 b: kartın lotu istasyonda bitince sayım istasyondaki başka lottan düşer (depodaki kart lotundan değil), çıktı o lotun kartına girer (yoksa açılır), not harekete yazılır', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TB-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TBM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (n: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira: n, opNo: n * 10, ad: `Adım ${n}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const e = (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '2' }]), adim(2, [])],
    }))).uretimEmriId;
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`rb-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    try {
      await malKabul(hm, '10');
      await malKabul(hm, '10');
      const [l1, l2] = await o().vt.sorgu<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id', [hm]);
      const kabul = await kabulKonumu();
      const al = async (t: { id: number; surum: number }, alinan: string) =>
        assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan })).durum, 200);
      const r = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${l1!.lot_no}` })).govde.refakat;
      const kartla = await gonder('depo', { malzemeId: hm, miktar: '2', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id });
      await al(kartla.govde.teslim, '2');
      const diger = await gonder('depo', { malzemeId: hm, miktar: '10', partiId: l2!.id, kaynak: { konumId: kabul }, hedef: { istasyonId: a.id } });
      await al(diger.govde.teslim, '10');
      const operator = kisiler.get('operator')!;
      const saglam = (isEmriId: number, fark: string) =>
        o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId: a.id, kisiId: operator, fark, refakatPartisiId: r.id }));
      // Kartın lotunun istasyondaki 2 kg'ı bir parçaya yeter; üç parça 6 kg ister: 2 kartın lotundan, 4 istasyondaki diğer lottan.
      // Kartın lotunun depodaki 8 kg'ı düşülmez: operatör istasyondakini işler.
      await saglam(op10!, '3');
      const depoda = await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE parti_id = $1 AND konum_id = $2', [l1!.id, kabul]);
      assert.equal(depoda?.m, '8.000');
      assert.equal(await o().vt.tek('SELECT id FROM stok_refakat_partisi WHERE uretim_emri_id = $1 AND parti_id = $2', [e, l2!.id]), null, 'çıktısız adımda kart açılmaz');
      await saglam(op20!, '3');
      const yeni = (await o().vt.tek<{ id: number; sira: number }>('SELECT id, sira FROM stok_refakat_partisi WHERE uretim_emri_id = $1 AND parti_id = $2', [e, l2!.id]))!;
      assert.equal(yeni.sira, 2);
      const cikti = (await o().vt.tek<{ id: number; refakat: number }>('SELECT id, refakat_partisi_id AS refakat FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2', [ym, e]))!;
      assert.equal(cikti.refakat, yeni.id, 'malzemenin çoğunu veren lotun kartına girer');
      const not = (await o().vt.tek<{ aciklama: string }>("SELECT aciklama FROM stok_hareketi WHERE tur = 'giris' AND parti_id = $1", [cikti.id]))!.aciklama;
      assert.match(not, /· yeni kart .*-P2, LT-\d+ \(.*-P1 lotu bitti; kartı basın\)$/);
    } finally {
      adimStatusuCozucusuKaydet(async () => null);
    }
  });

  test('kart #126 alt parti kartı, birleşme ve iz: kol üst karttan kart alır ve onunla sayar; birleşen kolun kartı birleştiği karta yönlenir', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TK-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TKM-${a.id}`, 'Tezgah', a.id]))!.id;
    const adim = (n: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira: n, opNo: n * 10, ad: `Adım ${n}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const emirAc = async () => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [adim(1, [{ malzemeNo: hm, miktar: '1' }]), adim(2, [])],
    }))).uretimEmriId;
    const [e, baska] = [await emirAc(), await emirAc()];
    const surum = async (id: number) => (await o().vt.tek<{ surum: number }>('SELECT surum FROM uretim_emri WHERE id = $1', [id]))!.surum;
    const bol = async (adet: number) => {
      const c = await istek<{ altEmirId: number }>('planlama_proje', 'POST', `/adimli-emirler/${e}/bol`, { adimSira: 1, adet, surum: await surum(e) });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.altEmirId;
    };
    const adimlari = async (emir: number) => (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [emir])).map((x) => x.id);
    const operator = kisiler.get('operator')!;
    const saglam = (emir: number, isEmriId: number, fark: string, refakatPartisiId: number | null) =>
      o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: emir, isEmriId, istasyonId: a.id, kisiId: operator, fark, refakatPartisiId }));
    await malKabul(hm, '10');
    const lot = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1', [hm]))!;
    const r = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${lot.lot_no}` })).govde.refakat;
    const kartla = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id });
    assert.equal(kartla.durum, 200, JSON.stringify(kartla.govde));
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${kartla.govde.teslim.id}/teslim-al`, { surum: kartla.govde.teslim.surum, alinan: '10' })).durum, 200);
    const kolAc = (kartId: number, uretimEmriId: number) => istek<RefakatPartisiCevabi & { hata?: { mesaj: string } }>('depo', 'POST', `/stok/refakat-partileri/${kartId}/kol-ac`, { uretimEmriId });

    const [kol, kol2] = [await bol(4), await bol(2)];
    // Kol üst kartla sayamaz; kol kartı yalnız bu emrin kolu için açılır.
    const [k10, k20] = await adimlari(kol);
    await assert.rejects(saglam(kol, k10!, '1', r.id), /üst partinin/);
    assert.equal((await kolAc(r.id, baska)).durum, 400);
    const kk = await kolAc(r.id, kol);
    assert.equal(kk.durum, 200, JSON.stringify(kk.govde));
    assert.deepEqual([kk.govde.refakat.uretimEmriId, kk.govde.refakat.partiId, kk.govde.refakat.ust?.id], [kol, lot.id, r.id]);
    assert.equal((await kolAc(r.id, kol)).govde.refakat.id, kk.govde.refakat.id, 'aynı kolun açık kartı döner');

    // Birleşme: kolun kartı birleştiği emrin kartına (üst kart) bağlanır; eski kart okutulunca üst kart gelir, sayımda yönlenir.
    const kk2 = (await kolAc(r.id, kol2)).govde.refakat;
    const b = await istek('planlama_proje', 'POST', `/adimli-emirler/${e}/birlestir`, { kaynakEmirId: kol2, surum: await surum(e), kaynakSurum: await surum(kol2) });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const eski = refakatPartisiCevabi.parse((await istek('depo', 'GET', `/stok/refakat-partileri/${kk2.id}`)).govde).refakat;
    assert.equal(eski.birlestigi?.id, r.id);
    const coz = kodCozCevabi.parse((await istek('depo', 'GET', `/stok/kod-coz?kod=${encodeURIComponent(kk2.qr)}`)).govde);
    assert.equal(coz.tur === 'lot' ? coz.refakat?.id : null, r.id);
    const [e10] = await adimlari(e);
    await saglam(e, e10!, '1', kk2.id);

    // Kol kendi kartıyla sayar; parça kol kartının partisine girer.
    await saglam(kol, k10!, '2', kk.govde.refakat.id);
    await saglam(kol, k20!, '2', kk.govde.refakat.id);
    const kolCiktisi = (await o().vt.tek<{ id: number; uretimEmriId: number }>(
      'SELECT id, uretim_emri_id AS "uretimEmriId" FROM stok_parti WHERE malzeme_id = $1 AND refakat_partisi_id = $2', [ym, kk.govde.refakat.id]))!;
    assert.equal(kolCiktisi.uretimEmriId, kol);

    // İz: üst kart altları ve birleşeni görür; kol kartı üstünü ve kendi çıktısını görür.
    const iz = refakatIziCevabi.parse((await istek('depo', 'GET', `/stok/refakat-partileri/${r.id}/iz`)).govde);
    assert.deepEqual(iz.altlar.map((x) => x.id).sort(), [kk.govde.refakat.id, kk2.id].sort());
    assert.deepEqual(iz.birlesenler.map((x) => x.id), [kk2.id]);
    assert.deepEqual(iz.ayniLot.map((x) => x.id).sort(), [kk.govde.refakat.id, kk2.id].sort());
    const kolIzi = refakatIziCevabi.parse((await istek('depo', 'GET', `/stok/refakat-partileri/${kk.govde.refakat.id}/iz`)).govde);
    assert.deepEqual(kolIzi.ustler.map((x) => x.id), [r.id]);
    assert.deepEqual(kolIzi.ciktilar.map((c) => [c.partiId, c.eldeki]), [[kolCiktisi.id, '2']]);
    assert.deepEqual(kolIzi.sevkler, []);
    // Birleşmiş kartın altına kart açılmaz.
    assert.equal((await kolAc(kk2.id, kol)).govde.refakat.id, kk.govde.refakat.id, 'birleşmiş kart birleştiği karta yönlenir');
  });

  test('kart #154 istisna kartı (Soru 129): malzeme yokken sayım lotsuz eksi düşer; düzeltme bağı taşır; lota bağlama kısmi, kartla ve aynı lotlu karta birleşerek', async () => {
    const [ym, hm, baskaHm] = [await kart('yarimamul'), await kart('hammadde'), await kart('hammadde')];
    const a = await istasyon();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TI-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TIM-${a.id}`, 'Tezgah', a.id]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const e = (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    }))).uretimEmriId;
    const [op10] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const operator = kisiler.get('operator')!;
    const saglam = (fark: string) => o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId: op10!, istasyonId: a.id, kisiId: operator, fark, refakatPartisiId: null }));
    const dusumler = async () => o().sahip.sorgu<{ kart: number; miktar: string; bagli: boolean }>(
      `SELECT d.refakat_partisi_id AS kart, h.miktar::text AS miktar, d.lot_hareket_id IS NOT NULL AS bagli FROM stok_refakat_istisna_dusumu d
         JOIN stok_hareketi h ON h.id = d.hareket_id JOIN stok_refakat_partisi r ON r.id = d.refakat_partisi_id WHERE r.uretim_emri_id = $1 ORDER BY d.id`, [e]);
    const bekleyenKart = async () => lotBekleyenKartlarCevabi.parse((await istek('depo', 'GET', '/stok/lot-bekleyen-kartlar')).govde).kartlar.find((k) => k.refakat.uretimEmriId === e);
    const bagla = (id: number, kod: string, surum: number) => istek<{ hata?: { mesaj: string } }>('depo', 'POST', `/stok/refakat-partileri/${id}/lota-bagla`, { kod, surum });

    // İki sayım aynı istisna kartına yazılır; eksi istasyonda partisiz kalır. Sayım durmaz, cevap uyarı taşır (kart #157).
    assert.match((await saglam('1')).uyari ?? '', /^Stokta yok; istisna kartı .*-P1 açıldı\./);
    await saglam('2');
    const ka = (await istasyonKonumu(a.id))!;
    assert.equal(await bakiye(hm, ka), '-6.000');
    const ilk = await dusumler();
    assert.deepEqual(ilk.map((d) => [d.miktar, d.bagli]), [['2.000', false], ['4.000', false]]);
    assert.equal(new Set(ilk.map((d) => d.kart)).size, 1, 'emir ve malzeme başına tek istisna kartı');

    // Sayım düzeltmesi lotsuz düşümü geri alır; kalan onaylı eksiyle yeniden yazılır ve bağı ona geçer.
    await saglam('-1');
    assert.equal(await bakiye(hm, ka), '-4.000');
    const duz = await dusumler();
    assert.equal(duz.reduce((t, d) => t + Number(d.miktar), 0), 4, 'bağlı düşümler kalan eksiyle eşit');
    assert.equal((await o().sahip.tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM stok_refakat_istisna_dusumu d JOIN stok_hareketi h ON h.id = d.hareket_id WHERE d.refakat_partisi_id = $1 AND NOT h.onayli_eksi', [ilk[0]!.kart]))!.n, 0);

    const bk = (await bekleyenKart())!;
    assert.deepEqual([bk.refakat.id, bk.refakat.partiId, bk.refakat.lotNo, Number(bk.bekleyen)], [ilk[0]!.kart, null, null, 4]);

    // Bağlanamaz: başka malzemenin lotu, eski sürüm, lotu olmayan kod.
    await malKabul(baskaHm, '10');
    const yabanci = (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1', [baskaHm]))!.lot_no;
    assert.equal((await bagla(bk.refakat.id, `LOT:${yabanci}`, bk.refakat.surum)).durum, 400);
    await malKabul(hm, '3');
    const l1 = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!;
    assert.equal((await bagla(bk.refakat.id, `LOT:${l1.lot_no}`, bk.refakat.surum + 1)).durum, 400);
    assert.equal((await bagla(bk.refakat.id, 'LOT:YOK-000000', bk.refakat.surum)).durum, 400);

    // Kısmi: lot ilk düşüme yeter, ikincisine yetmez; kart lotsuz kalır, kalan bekler.
    const kismi = await bagla(bk.refakat.id, `LOT:${l1.lot_no}`, bk.refakat.surum);
    assert.equal(kismi.durum, 200, JSON.stringify(kismi.govde));
    const kc = refakatLotaBaglaCevabi.parse(kismi.govde);
    const kabul = await kabulKonumu();
    const [birinci] = duz;
    assert.deepEqual([kc.refakat.partiId, Number(kc.baglanan), Number(kc.bekleyen)], [null, Number(birinci!.miktar), 4 - Number(birinci!.miktar)]);
    assert.equal(await bakiye(hm, ka), `-${(4 - Number(birinci!.miktar)).toFixed(3)}`);
    assert.equal(await bakiye(hm, kabul), `${(3 - Number(birinci!.miktar)).toFixed(3)}`, 'lottan düşülen kadar azalır');

    // Kartla bağlama: emrin aynı lotlu açık kartı varsa istisna kartı ona birleşir.
    await malKabul(hm, '10');
    const l2 = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!;
    const r2 = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${l2.lot_no}` })).govde.refakat;
    const tam = await bagla(bk.refakat.id, r2.qr, kc.refakat.surum);
    assert.equal(tam.durum, 200, JSON.stringify(tam.govde));
    const tc = refakatLotaBaglaCevabi.parse(tam.govde);
    assert.deepEqual([tc.refakat.id, tc.refakat.partiId, Number(tc.bekleyen)], [r2.id, l2.id, 0]);
    assert.equal(await bakiye(hm, ka), null, 'istasyonda eksi kalmaz');
    assert.deepEqual((await dusumler()).map((d) => d.bagli), duz.map(() => true));
    const eski = refakatPartisiCevabi.parse((await istek('depo', 'GET', `/stok/refakat-partileri/${bk.refakat.id}`)).govde).refakat;
    assert.equal(eski.birlestigi?.id, r2.id);
    assert.equal(await bekleyenKart(), undefined, 'bağlanan kart listeden düşer');
    // Bağlanmış ve birleşmiş karta yeniden bağlama yok.
    assert.equal((await bagla(bk.refakat.id, `LOT:${l2.lot_no}`, eski.surum)).durum, 400);
  });

  test('kart #154 başka istasyondaki kart malzemesi: istasyonda ve depoda yoksa kartın lotu başka istasyondan "teslim edilmeden" düşülür; istisna açılmaz', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, c] = [await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`TD-${sira}`]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`TDM-${a.id}`, 'Tezgah', a.id]))!.id;
    if (!kisiler.has('planlama_proje')) await kisiEkle('planlama_proje', 'planlama_proje');
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const e = (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(ym), isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    }))).uretimEmriId;
    const [op10] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    await malKabul(hm, '10');
    const lot = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1', [hm]))!;
    const r = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${lot.lot_no}` })).govde.refakat;
    const t = await gonder('depo', { malzemeId: hm, miktar: '10', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: c.id }, refakatPartisiId: r.id });
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: '10' })).durum, 200);
    const sayim = await o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId: op10!, istasyonId: a.id, kisiId: kisiler.get('operator')!, fark: '2', refakatPartisiId: r.id }));
    assert.equal(sayim.uyari, 'Kartın malzemesi başka istasyonda; teslim edilmeden düşüldü, malzemeyi teslim alın.');
    const kc = (await istasyonKonumu(c.id))!;
    assert.equal(await bakiye(hm, kc), '6.000');
    // Arkon kart listesi (kart #156): kartın lotu c'de, kartla sayılan parça a'da durur; boş istasyonda satır yok.
    const liste = (istasyonId: number | null) => o().vt.tx((db) => emrinRefakatKartlari(db, e, istasyonId));
    assert.deepEqual((await liste(c.id)).map((k) => [k.id, k.lotNo, k.istasyondaSatirVar, k.sinir]), [[r.id, lot.lot_no, true, null]]);
    assert.deepEqual((await liste(a.id)).map((k) => k.istasyondaSatirVar), [true]);
    assert.deepEqual((await liste((await istasyon()).id)).map((k) => k.istasyondaSatirVar), [false]);
    assert.deepEqual((await liste(null)).map((k) => k.istasyondaSatirVar), [false]);
    const h = (await o().vt.tek<{ aciklama: string }>("SELECT aciklama FROM stok_hareketi WHERE tur = 'cikis' AND uretim_emri_id = $1 AND kaynak_konum_id = $2", [e, kc]))!;
    assert.match(h.aciklama, /teslim edilmeden başka istasyondan$/);
    assert.equal((await o().sahip.tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM stok_refakat_partisi WHERE uretim_emri_id = $1 AND parti_id IS NULL', [e]))!.n, 0, 'istisna kartı açılmaz');
  });
});
