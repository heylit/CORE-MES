import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { ACIK_DEGIL, TUR_ANA_EMIR, TUR_PROJESIZ, turDegisimIhlali } from './kurallar.ts';

// UE-TUR (3099): parti ve kol bölünürken kendi türünü alır, sonradan da değiştirilir; değişiklik kayda girer. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-TUR kuralı (saf)', () => {
  const alt = { durum: 'planli' as const, arsiv: false, ustEmirId: 1, projeId: 5 };
  test('açık alt emirde değişir; başlamış alt emirde de serbesttir', () => {
    assert.equal(turDegisimIhlali(alt, 'numune'), null);
    assert.equal(turDegisimIhlali({ ...alt, durum: 'basladi' }, 'stok'), null);
    assert.equal(turDegisimIhlali({ ...alt, projeId: null }, 'stok'), null);
  });
  test('ana emirde, bitmiş, iptal ya da arşivdeki emirde ve projesiz emirde proje isteyen türde değişmez', () => {
    assert.equal(turDegisimIhlali({ ...alt, ustEmirId: null }, 'numune'), TUR_ANA_EMIR);
    for (const d of ['bitti', 'iptal'] as const) assert.equal(turDegisimIhlali({ ...alt, durum: d }, 'numune'), ACIK_DEGIL, d);
    assert.equal(turDegisimIhlali({ ...alt, arsiv: true }, 'numune'), ACIK_DEGIL);
    for (const t of ['seri', 'fai', 'numune', 'prototip', 'fason']) assert.equal(turDegisimIhlali({ ...alt, projeId: null }, t), TUR_PROJESIZ, t);
  });
});

describe('UE-TUR parti türü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let istasyonId = 0;
  let urunNo = 0;
  // Emrin kaynak rota revizyonu gerçek satırdır (278 a).
  let rev = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlikli = false): Promise<Cevap<T>> {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', ...(kimlikli ? { 'istek-kimligi': randomUUID() } : {}) }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

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
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  const adim: IsEmriGirdisi = {
    sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: 0, kaynak: null, ayarSuresiDk: '10.00', birimSureDk: '1.5000',
    terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  };
  const ac = async (projeli = true): Promise<number> => {
    const k = kullanicilar.get('planlama_proje');
    if (k === undefined) throw new Error('kişi yok');
    return (await o().vt.tx((db) => uretimEmriAc(db, k, {
      ...(projeli ? { projeId: denemeProjeId } : { emirTuru: 'stok' as const }), malzemeNo: urunNo, adet: 10, teslim: null, oncelik: 3,
      kaynakRotaRevizyonId: rev, isEmirleri: [{ ...adim, operasyonTipiId: tipId }],
    }))).uretimEmriId;
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.emir;
  };
  const degistir = (kisi: string, id: number, govde: Record<string, unknown>) =>
    istek<{ emir: AdimliEmirAyrintisi } & Hata>(kisi, 'POST', `/adimli-emirler/${id}/emir-turu`, govde, true);
  const bol = (id: number, govde: Record<string, unknown>) =>
    istek<{ emir: AdimliEmirAyrintisi; altEmirId: number } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, { adimSira: 1, ...govde }, true);
  const kayitlar = async (id: number) => (await o().sahip.sorgu<{ eski: string; yeni: string; kisi: number }>(
    'SELECT eski_tur AS eski, yeni_tur AS yeni, kisi_id AS kisi FROM uretim_emirleri_tur_degisimi WHERE uretim_emri_id = $1 ORDER BY id', [id]))
    .map((r) => [r.eski, r.yeni, r.kisi]);
  const turu = async (id: number) => (await o().sahip.tek<{ t: string }>('SELECT emir_turu AS t FROM uretim_emri WHERE id = $1', [id]))?.t;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_tur');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.TUR', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['mudur', 'mudur'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TURM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('TURI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
       VALUES ('TUR-T', 'Deneme tipi', 'TAL', 7, 2, $1) RETURNING id`, [istasyonId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TUR-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('tur-1', 'mamul', 'TUR-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'tur-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: bölerken parti kendi türünü alır, türsüz parti ana emrin türünü alır', async () => {
    const id = await ac();
    let e = await ayrinti(id);
    const p1 = await bol(id, { adet: 2, surum: e.surum, emirTuru: 'numune' });
    assert.equal(p1.durum, 200, JSON.stringify(p1.govde));
    e = p1.govde.emir;
    const p2 = await bol(id, { adet: 3, surum: e.surum });
    assert.equal(p2.durum, 200, JSON.stringify(p2.govde));
    assert.equal(await turu(p1.govde.altEmirId), 'numune');
    assert.equal(await turu(p2.govde.altEmirId), 'seri');
    assert.equal(await turu(id), 'seri');
    assert.deepEqual(await kayitlar(p1.govde.altEmirId), []);
  });

  test('reddedilen: projesiz emirden proje isteyen türde parti açılmaz 409; projesiz türde açılır', async () => {
    const id = await ac(false);
    const e = await ayrinti(id);
    const red = await bol(id, { adet: 2, surum: e.surum, emirTuru: 'seri' });
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal(red.govde.mesaj, TUR_PROJESIZ);
    assert.equal((await ayrinti(id)).adet, 10);
    const izinli = await bol(id, { adet: 2, surum: e.surum, emirTuru: 'rework' });
    assert.equal(izinli.durum, 200, JSON.stringify(izinli.govde));
    assert.equal(await turu(izinli.govde.altEmirId), 'rework');
  });

  test('izinli: bölündükten sonra partinin türü değişir; her değişiklik eski, yeni ve kişiyle kayda girer, ana emir değişmez', async () => {
    const id = await ac();
    const p = await bol(id, { adet: 2, surum: (await ayrinti(id)).surum });
    assert.equal(p.durum, 200, JSON.stringify(p.govde));
    const altId = p.govde.altEmirId;
    let a = await ayrinti(altId);
    const c = await degistir('planlama_proje', altId, { emirTuru: 'stok', surum: a.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.emir.emirTuru, 'stok');
    assert.equal(c.govde.emir.surum, a.surum + 1);
    a = c.govde.emir;
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'basladi', istasyon_id = $2, baslama = now() WHERE id = $1", [altId, istasyonId]);
    const m = await degistir('mudur', altId, { emirTuru: 'fai', surum: a.surum });
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    const ayni = await degistir('mudur', altId, { emirTuru: 'fai', surum: m.govde.emir.surum });
    assert.equal(ayni.govde.emir.surum, m.govde.emir.surum);
    assert.deepEqual(await kayitlar(altId), [['seri', 'stok', kullanicilar.get('planlama_proje')?.id], ['stok', 'fai', kullanicilar.get('mudur')?.id]]);
    assert.equal(await turu(id), 'seri');
  });

  test('reddedilen: ana emir 409, iptal parti 409, eski sürüm 409, listede olmayan tür 400, yetkisiz rol 403; hiçbiri kayda girmez', async () => {
    const id = await ac();
    const ana = await degistir('planlama_proje', id, { emirTuru: 'numune', surum: (await ayrinti(id)).surum });
    assert.equal(ana.durum, 409, JSON.stringify(ana.govde));
    assert.equal(ana.govde.mesaj, TUR_ANA_EMIR);
    const altId = (await bol(id, { adet: 2, surum: (await ayrinti(id)).surum })).govde.altEmirId;
    const a = await ayrinti(altId);
    const eski = await degistir('planlama_proje', altId, { emirTuru: 'numune', surum: a.surum + 5 });
    assert.equal(eski.durum, 409, JSON.stringify(eski.govde));
    const yok = await degistir('planlama_proje', altId, { emirTuru: 'baska', surum: a.surum });
    assert.equal(yok.durum, 400, JSON.stringify(yok.govde));
    const yetkisiz = await degistir('operator', altId, { emirTuru: 'numune', surum: a.surum });
    assert.equal(yetkisiz.durum, 403, JSON.stringify(yetkisiz.govde));
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [altId]);
    const kapali = await degistir('planlama_proje', altId, { emirTuru: 'numune', surum: a.surum });
    assert.equal(kapali.durum, 409, JSON.stringify(kapali.govde));
    assert.equal(kapali.govde.mesaj, ACIK_DEGIL);
    assert.deepEqual(await kayitlar(altId), []);
    assert.deepEqual(await kayitlar(id), []);
    assert.equal(await turu(altId), 'seri');
  });

  test('kayıt yalnız eklenir: güncelleme, silme ve aynı türe geçiş satırı reddedilir', async () => {
    await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_tur_degisimi SET yeni_tur = 'seri'"));
    await assert.rejects(o().sahip.sorgu('DELETE FROM uretim_emirleri_tur_degisimi'));
    const id = await ac();
    await assert.rejects(o().sahip.sorgu(
      "INSERT INTO uretim_emirleri_tur_degisimi (uretim_emri_id, eski_tur, yeni_tur, kisi_id, zaman) VALUES ($1, 'seri', 'seri', $2, now())", [id, yoneticiId]),
    /uretim_emirleri_tur_degisimi_farkli/);
    await assert.rejects(o().sahip.sorgu(
      "INSERT INTO uretim_emirleri_tur_degisimi (uretim_emri_id, eski_tur, yeni_tur, kisi_id, zaman) VALUES ($1, 'seri', 'baska', $2, now())", [id, yoneticiId]),
    /uretim_emirleri_tur_degisimi_yeni/);
  });
});
