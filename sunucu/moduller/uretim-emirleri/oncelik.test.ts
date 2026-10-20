import assert from 'node:assert/strict';
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
import { ONCELIK_BASLAMIS, oncelikDegisimIhlali } from './kurallar.ts';

// UE-ONC (163 a): başlamamış emrin önceliği plan senaryosu açmadan doğrudan değişir; değişiklik kayda girer. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-ONC kuralı (saf)', () => {
  test('taslak ve planlı emirde değişir; başlamış, bitmiş, iptal ya da arşivdeki emirde değişmez', () => {
    assert.equal(oncelikDegisimIhlali('taslak', false), null);
    assert.equal(oncelikDegisimIhlali('planli', false), null);
    for (const d of ['basladi', 'bitti', 'iptal'] as const) assert.equal(oncelikDegisimIhlali(d, false), ONCELIK_BASLAMIS, d);
    assert.equal(oncelikDegisimIhlali('planli', true), ONCELIK_BASLAMIS);
  });
});

describe('UE-ONC emir önceliği doğrudan (gerçek PostgreSQL)', () => {
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

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
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
  const ac = async (oncelik = 3): Promise<number> => {
    const k = kullanicilar.get('planlama_proje');
    if (k === undefined) throw new Error('kişi yok');
    return (await o().vt.tx((db) => uretimEmriAc(db, k, {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, oncelik, kaynakRotaRevizyonId: rev, isEmirleri: [{ ...adim, operasyonTipiId: tipId }],
    }))).uretimEmriId;
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.emir;
  };
  const degistir = (kisi: string, id: number, govde: Record<string, unknown>) =>
    istek<{ emir: AdimliEmirAyrintisi } & Hata>(kisi, 'POST', `/adimli-emirler/${id}/oncelik`, govde);
  const kayitlar = async (id: number) => (await o().sahip.sorgu<{ eski: number; yeni: number; kisi: number }>(
    'SELECT eski_oncelik AS eski, yeni_oncelik AS yeni, kisi_id AS kisi FROM uretim_emirleri_oncelik_degisimi WHERE uretim_emri_id = $1 ORDER BY id', [id]))
    .map((r) => [r.eski, r.yeni, r.kisi]);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_oncelik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ONCELIK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['mudur', 'mudur'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ONCM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('ONCI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
       VALUES ('ONC-T', 'Deneme tipi', 'TAL', 7, 2, $1) RETURNING id`, [istasyonId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ONC-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('onc-1', 'mamul', 'ONC-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'onc-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: planlama ve müdür planlı emrin önceliğini değiştirir; her değişiklik eski, yeni ve kişiyle kayda girer', async () => {
    const id = await ac(3);
    let e = await ayrinti(id);
    assert.equal(e.durum, 'planli');
    const c = await degistir('planlama_proje', id, { oncelik: 1, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.emir.oncelik, 1);
    assert.equal(c.govde.emir.surum, e.surum + 1);
    e = c.govde.emir;
    const m = await degistir('mudur', id, { oncelik: 4, surum: e.surum });
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    const planlama = kullanicilar.get('planlama_proje')?.id;
    const mudur = kullanicilar.get('mudur')?.id;
    assert.deepEqual(await kayitlar(id), [[3, 1, planlama], [1, 4, mudur]]);
  });

  test('aynı değer yazılırsa emir ve kayıt değişmez', async () => {
    const id = await ac(2);
    const e = await ayrinti(id);
    const c = await degistir('planlama_proje', id, { oncelik: 2, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.emir.surum, e.surum);
    assert.deepEqual(await kayitlar(id), []);
  });

  test('reddedilen: başlamış emir 409, eski sürüm 409, aralık dışı 400, yetkisiz rol 403; hiçbiri kayda girmez', async () => {
    const id = await ac(3);
    const e = await ayrinti(id);
    const eski = await degistir('planlama_proje', id, { oncelik: 1, surum: e.surum + 5 });
    assert.equal(eski.durum, 409, JSON.stringify(eski.govde));
    const disarida = await degistir('planlama_proje', id, { oncelik: 5, surum: e.surum });
    assert.equal(disarida.durum, 400, JSON.stringify(disarida.govde));
    const yetkisiz = await degistir('operator', id, { oncelik: 1, surum: e.surum });
    assert.equal(yetkisiz.durum, 403, JSON.stringify(yetkisiz.govde));
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'basladi', istasyon_id = $2, baslama = now() WHERE id = $1", [id, istasyonId]);
    const basladi = await degistir('planlama_proje', id, { oncelik: 1, surum: e.surum });
    assert.equal(basladi.durum, 409, JSON.stringify(basladi.govde));
    assert.equal(basladi.govde.mesaj, ONCELIK_BASLAMIS);
    assert.deepEqual(await kayitlar(id), []);
    assert.equal((await o().sahip.tek<{ oncelik: number }>('SELECT oncelik FROM uretim_emri WHERE id = $1', [id]))?.oncelik, 3);
  });

  test('kayıt yalnız eklenir: güncelleme ve silme reddedilir', async () => {
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_oncelik_degisimi SET yeni_oncelik = 2'));
    await assert.rejects(o().sahip.sorgu('DELETE FROM uretim_emirleri_oncelik_degisimi'));
  });
});
