import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { defterFarklariCevabi, isKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import * as servis from './servis.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Gece defter karşılaştırması (1692 a). Roller göçlerden gelir: farkları müdür görür (stok.eksi-onayla), depo görmez.
describe('stok gece defter karşılaştırması (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      const yonetici = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let kartSira = 0;
  async function kart(): Promise<number> {
    kartSira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['DK-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'DK-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`dk-dnm-${kartSira}`, kartSira, JSON.stringify({ id: `dk-dnm-${kartSira}`, com: { ad: `Deneme sarf ${kartSira}` } }), kisiler.get('yonetici')],
    );
    return r!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_defter_karsilastirma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [ad, rol] of [['depo', 'depo'], ['mudur', 'mudur']] as const) await kisiEkle(ad, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('1692 a: karşılaştırma yokken liste boş ve sayaç null; fark kaydedilir, müdür görür, depo görmez; aynı gün ikinci tur koşmaz', async () => {
    const bos = await istek('mudur', 'GET', '/stok/defter-farklari');
    assert.equal(bos.durum, 200, JSON.stringify(bos.govde));
    assert.deepEqual(defterFarklariCevabi.parse(bos.govde), { karsilastirma: null, farklar: [] });
    const once = isKutusuCevabi.parse((await istek('mudur', 'GET', '/stok/is-kutusu')).govde);
    assert.equal(once.defterFarki ?? null, null, 'hiç karşılaştırma yokken sıfır uydurulmaz');

    // Hareketsiz bakiye yalnız tablo sahibiyle açılabilir (1692 b tetiği uygulama kullanıcısını reddeder): geçmişte oluşmuş farkın benzeri.
    const k = await kart();
    const z = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    await o().sahip.sorgu("INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, '4', now())", [k, z]);

    const tur = await o().vt.tx((db) => servis.geceDefterKarsilastirmasi(db, 0));
    assert.ok(tur, 'eşik saati geçti, bugün tur yok: karşılaştırır');
    assert.equal(await o().vt.tx((db) => servis.geceDefterKarsilastirmasi(db, 0)), null, 'aynı gün ikinci tur koşmaz');
    assert.equal(await o().vt.tx((db) => servis.geceDefterKarsilastirmasi(db, 24)), null, 'eşik saatinden önce koşmaz');

    const c = await istek('mudur', 'GET', '/stok/defter-farklari');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const l = defterFarklariCevabi.parse(c.govde);
    assert.equal(l.karsilastirma?.farkSayisi, tur.farkSayisi);
    const f = l.farklar.find((x) => x.malzemeId === k);
    assert.deepEqual(f && { konumId: f.konumId, partiId: f.partiId, kaliteDurumu: f.kaliteDurumu, bakiye: f.bakiye, defter: f.defter },
      { konumId: z, partiId: null, kaliteDurumu: 'serbest', bakiye: '4.000', defter: '0.000' });
    assert.equal(f?.malzemeAd, `Deneme sarf ${kartSira}`);

    const kutu = isKutusuCevabi.parse((await istek('mudur', 'GET', '/stok/is-kutusu')).govde);
    assert.equal(kutu.defterFarki, tur.farkSayisi);
    assert.equal((await istek('depo', 'GET', '/stok/defter-farklari')).durum, 403);
    assert.equal(isKutusuCevabi.parse((await istek('depo', 'GET', '/stok/is-kutusu')).govde).defterFarki ?? null, null);
  });

  test('1692 a: karşılaştırma kaydı değiştirilmez ve silinmez', async () => {
    await assert.rejects(o().vt.sorgu('DELETE FROM stok_defter_karsilastirma'), /yalnız ekleme/);
    await assert.rejects(o().vt.sorgu("UPDATE stok_defter_farki SET bakiye = '0'"), /yalnız ekleme/);
  });
});
