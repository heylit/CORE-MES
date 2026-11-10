import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { ONCELIK_BASLAMIS } from './kurallar.ts';

// 2627 2/2 c (kart 2704 a): Excel ile var olan emirlerde öncelik ve plana alma; satırlar tek kayıt komutlarından geçer, hepsi ya da hiçbiri. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('2627 emirleri toplu güncelleme (gerçek PostgreSQL)', () => {
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

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik: string | null = randomUUID()): Promise<Cevap<T>> {
    const headers = { cookie: cerezler.get(ad) ?? '', ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers, ...(govde === undefined ? {} : { payload: govde as object }) });
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
  const toplu = (kisi: string, satirlar: Record<string, unknown>[], kimlik?: string | null) =>
    istek<{ eklenen: number; guncellenen: number } & Hata>(kisi, 'POST', '/adimli-emirler/toplu-guncelle', { satirlar }, kimlik);
  const durumu = async (id: number) => (await o().sahip.tek<{ durum: string; oncelik: number; surum: number }>('SELECT durum, oncelik, surum FROM uretim_emri WHERE id = $1', [id]))!;
  const kayitlar = async (id: number) => (await o().sahip.sorgu<{ eski: number; yeni: number; kisi: number }>(
    'SELECT eski_oncelik AS eski, yeni_oncelik AS yeni, kisi_id AS kisi FROM uretim_emirleri_oncelik_degisimi WHERE uretim_emri_id = $1 ORDER BY id', [id]))
    .map((r) => [r.eski, r.yeni, r.kisi]);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_toplu_guncelle');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.TOPLU', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['mudur', 'mudur'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TGM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('TGI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
       VALUES ('TG-T', 'Deneme tipi', 'TAL', 7, 2, $1) RETURNING id`, [istasyonId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TG-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('tg-1', 'mamul', 'TG-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'tg-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: öncelik ve taslağı plana alma tek istekte; öncelik değişimi kayda girer, sürüm satırın ilk komutunda denetlenir', async () => {
    const a = await ac(3);
    const b = await ac(3);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'taslak' WHERE id = $1", [b]);
    const ea = await ayrinti(a);
    const eb = await ayrinti(b);
    const c = await toplu('planlama_proje', [
      { satir: 2, id: a, surum: ea.surum, oncelik: 1 },
      { satir: 3, id: b, surum: eb.surum, planaAl: true, oncelik: 2 },
    ]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde, { eklenen: 0, guncellenen: 2 });
    assert.deepEqual([(await durumu(a)).oncelik, (await durumu(b)).durum, (await durumu(b)).oncelik], [1, 'planli', 2]);
    const planlama = kullanicilar.get('planlama_proje')?.id;
    assert.deepEqual(await kayitlar(a), [[3, 1, planlama]]);
    assert.deepEqual(await kayitlar(b), [[3, 2, planlama]]);
  });

  test('reddedilen: tek satırın reddi hiçbirini yazmaz ve satır numarasını söyler (eski sürüm, başlamış emir, planlı emri yeniden plana alma)', async () => {
    const a = await ac(3);
    const b = await ac(3);
    const ea = await ayrinti(a);
    const eb = await ayrinti(b);
    const once = [await durumu(a), await durumu(b)];
    const eski = await toplu('planlama_proje', [{ satir: 2, id: a, surum: ea.surum, oncelik: 1 }, { satir: 3, id: b, surum: eb.surum + 5, oncelik: 1 }]);
    assert.equal(eski.durum, 409, JSON.stringify(eski.govde));
    assert.match(eski.govde.mesaj, /^Satır 3: /);
    const planli = await toplu('planlama_proje', [{ satir: 2, id: a, surum: ea.surum, oncelik: 1 }, { satir: 4, id: b, surum: eb.surum, planaAl: true }]);
    assert.equal(planli.durum, 409, JSON.stringify(planli.govde));
    assert.match(planli.govde.mesaj, /^Satır 4: /);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'basladi', istasyon_id = $2, baslama = now() WHERE id = $1", [b, istasyonId]);
    const basladi = await toplu('planlama_proje', [{ satir: 2, id: a, surum: ea.surum, oncelik: 1 }, { satir: 5, id: b, surum: eb.surum, oncelik: 1 }]);
    assert.equal(basladi.durum, 409, JSON.stringify(basladi.govde));
    assert.equal(basladi.govde.mesaj, `Satır 5: ${ONCELIK_BASLAMIS}`);
    assert.deepEqual([(await durumu(a)).oncelik, (await durumu(a)).surum], [once[0]!.oncelik, once[0]!.surum]);
    assert.deepEqual(await kayitlar(a), []);
  });

  test('gövde ve yetki: alansız satır, aynı emir iki kez 400; istek kimliği yok 400; operatör 403', async () => {
    const a = await ac(3);
    const e = await ayrinti(a);
    assert.equal((await toplu('planlama_proje', [{ satir: 2, id: a, surum: e.surum }])).durum, 400);
    assert.equal((await toplu('planlama_proje', [{ satir: 2, id: a, surum: e.surum, oncelik: 1 }, { satir: 3, id: a, surum: e.surum, oncelik: 2 }])).durum, 400);
    assert.equal((await toplu('planlama_proje', [{ satir: 2, id: a, surum: e.surum, oncelik: 1 }], null)).durum, 400);
    assert.equal((await toplu('operator', [{ satir: 2, id: a, surum: e.surum, oncelik: 1 }])).durum, 403);
    assert.equal((await durumu(a)).oncelik, 3);
  });
});
