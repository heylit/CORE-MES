import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { aramaSade, basDeseni, icindeDeseni, type KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import type { AdimGirdisi, KomutCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';

// Genel aramanın rota kaynağı (kart #1241): kalem kodu ya da adıyla yürürlükte rotası olan kalem bulunur. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const OKUYAN: Islem[] = ['sayfa.recete-rota', 'sayfa.malzemeler', 'sayfa.rota'];

describe('recete-rota genel arama kaynağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let sayac = 0;
  let istasyon = 0;
  let tipId = 0;
  let hammadde = 0;
  let rotali = 0;
  let taslakli = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kaynak = kayitAramaKaynaklari.find((k) => k.tur === 'rota');
  const ara = (islemler: Islem[], q: string, sinir = 5) => {
    const istek: KayitAramaIstegi = { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: yoneticiId, islemler } };
    if (!kaynak) throw new Error('rota kaynağı yok');
    return vt().tx((db) => kaynak.ara(db, istek));
  };
  async function tamamIstek<T>(yol: string, payload: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: tam, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: payload as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  async function kart(tur: string, onek: string, ad: string): Promise<number> {
    sayac += 1;
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', [onek]);
    const r = await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, $4, 'aktif', $5, $6, $6) RETURNING no`,
      [`rra-${String(sayac)}`, tur, onek, sayac, JSON.stringify({ id: `rra-${String(sayac)}`, com: { ad, birim: 'adet' } }), yoneticiId],
    );
    return r?.no ?? 0;
  }
  const adim = (): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tipId, ad: 'Deneme adım', kaynak: { tur: 'istasyon', id: istasyon }, ayarSuresiDk: 10, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
  });
  const taslak = async (urun: number): Promise<KomutCevabi> => {
    const ac = await tamamIstek<KomutCevabi>(`/rota/urunler/${String(urun)}/taslak-ac`, { kaynak: { tur: 'bos' } });
    return tamamIstek<KomutCevabi>(`/rota/revizyonlar/${String(ac.id)}/kaydet`, { surum: ac.surum, aciklama: null, adimlar: [adim()] });
  };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_arama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    tam = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('RRA-IM', 'Deneme merkez') RETURNING id");
    istasyon = (await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('RRA-I', 'RRA-I', $1, true) RETURNING id", [merkez?.id]))?.id ?? 0;
    tipId = (await vt().tek<{ id: number }>(
      "INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, aktif, kisaltma) VALUES ('RRA-OP', 'Deneme operasyonu', 'KES', true, 'DOP') RETURNING id"))?.id ?? 0;
    hammadde = await kart('hammadde', 'DNMHAM-', 'Deneme hammadde');
    rotali = await kart('mamul', 'DNMMIL-', 'Deneme mil');
    taslakli = await kart('mamul', 'DNMMIL-', 'Deneme mil taslak');
    await kart('mamul', 'DNMMIL-', 'Deneme mil rotasız');

    const k = await taslak(rotali);
    await tamamIstek('/ayarlar/rota.dort-goz/degistir', { deger: false });
    try {
      const gonder = await tamamIstek<KomutCevabi>(`/rota/revizyonlar/${String(k.id)}/onaya-gonder`, { surum: k.surum });
      await tamamIstek(`/rota/revizyonlar/${String(k.id)}/onayla`, { surum: gonder.surum, yururlugeAl: true });
    } finally {
      await tamamIstek('/ayarlar/rota.dort-goz/degistir', { deger: true });
    }
    await taslak(taslakli);
  });

  after(async () => { await ortam?.kaldir(); });

  test('RRA-0: kaynak rota türündedir ve Reçete ve Rota okumasını ister', () => {
    assert.deepEqual(kayitAramaKaynaklari.map((k) => ({ tur: k.tur, yetki: k.yetki })),
      [{ tur: 'rota', yetki: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'] }]);
  });

  test('RRA-1 izinli: yalnız yürürlükte rotası olan kalem gelir; kod, ad, rota harfi ve Ürün ve rotalar yolu', async () => {
    const sonuc = await ara(OKUYAN, 'dnmmil');
    assert.deepEqual(sonuc, [{
      anahtar: String(rotali), baslik: 'DNMMIL-00002', aciklama: 'Deneme mil · Rota A · yürürlükte', yol: `/recete-rota/schema?kayit=${String(rotali)}`,
    }]);
  });

  test('RRA-2 izinli: adla da bulunur; eşleşmeyen metin boş döner', async () => {
    assert.deepEqual((await ara(OKUYAN, 'deneme mil')).map((s) => s.baslik), ['DNMMIL-00002']);
    assert.deepEqual(await ara(OKUYAN, 'yok-boyle-kod'), []);
  });

  test('RRA-3 reddedilen: malzeme ya da rota okuması olmayan kişi sonuç görmez', async () => {
    assert.deepEqual(await ara(['sayfa.recete-rota', 'sayfa.rota'], 'dnmmil'), []);
    assert.deepEqual(await ara(['sayfa.recete-rota', 'sayfa.malzemeler'], 'dnmmil'), []);
    assert.deepEqual(await ara([], 'dnmmil'), []);
  });
});
