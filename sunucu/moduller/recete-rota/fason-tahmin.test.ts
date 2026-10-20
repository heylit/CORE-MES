import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { FasonTahminCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Termini girilmemiş fason adımın plan süresi ekranda satın almanın geçmiş teslimat tahmininden gelir (kullanıcı kararı 16.10.2026).
// Hesabın kendisi satın almanın testindedir; burada uç sorguyu doğru çözer, sırayı korur ve veri yokken null döner. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('recete-rota fason termin tahmini ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  let firmaId = 0;
  let malzemeNo = 0;
  let tipId = 0;

  const al = (url: string, c = cerez) => {
    const headers: Record<string, string> = c ? { cookie: c } : {};
    return app.inject({ method: 'GET', url: `/api${url}`, headers });
  };
  const yaz = async (url: string, payload: Record<string, unknown>): Promise<unknown> => {
    const r = await app.inject({ method: 'POST', url: `/api${url}`, payload, headers: { cookie: cerez, 'istek-kimligi': crypto.randomUUID() } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };

  // Fason iş emri: gidiş "basla" gün önce, dönüş "sure" gün sonra.
  async function fasonIsEmri(adet: number, basla: number, sure: number): Promise<void> {
    const sahip = ortam!.sahip;
    const n = Math.random().toString(36).slice(2, 10).toUpperCase();
    const im = await sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`RM${n}`, 'Deneme merkezi']);
    const ist = await sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`RI${n}`, 'Deneme istasyon', im!.id]);
    const e = await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no) VALUES ('P-FT', 'Deneme', $1, $2, $3, 'planli', $4) RETURNING id",
      [adet, ist!.id, yoneticiId, malzemeNo]);
    const ie = await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun) VALUES ($1, 1, 10, $2, 'Deneme fason', $3, NULL) RETURNING id",
      [e!.id, tipId, firmaId]);
    await sahip.sorgu(
      "INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, kisi_id, zaman) VALUES ($1, 'gidis', $2, $3, now() - make_interval(days => $4))", [ie!.id, adet, yoneticiId, basla]);
    await sahip.sorgu(
      "INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, hurda_adet, kisi_id, zaman) VALUES ($1, 'donus', $2, 0, $3, now() - make_interval(days => $4))", [ie!.id, adet, yoneticiId, basla - sure]);
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_fason_tahmin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firmaId = ((await yaz('/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Fason', tur: 'tedarikci' })) as { firma: { id: number } }).firma.id;
    await yaz('/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await yaz('/malzeme-katalogu-kartlari/ft-kart-1/kaydet', {
      kayit: { id: 'ft-kart-1', tur: 'hammadde', fam: 'metal', com: { kod: 'HM-FTA-00001', ad: 'Deneme mil', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: 'hammadde|fason-tahmin|ft-kart-1', mukerrer_gerekcesi: null }, surum: null,
    });
    malzemeNo = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'ft-kart-1'"))!.no;
    tipId = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('FT-1: geçmiş yokken null; geçmiş gelince aynı sırada gün döner, eşleşmeyen sorgu null kalır', async () => {
    const s = (adet: number, firma = firmaId) => `${malzemeNo}-${tipId}-${firma}-${adet}`;
    let r = await al(`/recete-rota/fason-tahminleri?s=${s(10)}`);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { gunler: [null] } satisfies FasonTahminCevabi);

    await fasonIsEmri(10, 30, 4);
    await fasonIsEmri(10, 20, 6);
    r = await al(`/recete-rota/fason-tahminleri?s=${[s(10, firmaId + 1000), s(10), s(12.5)].join(',')}`);
    assert.equal(r.statusCode, 200, r.body);
    const { gunler } = r.json() as FasonTahminCevabi;
    assert.equal(gunler.length, 3);
    assert.equal(gunler[0], null);
    assert.ok(gunler[1] !== null && Math.abs(gunler[1]! - 5) < 1e-6, String(gunler[1]));
    // tek yan: en yakın adetin süresi
    assert.ok(gunler[2] !== null && Math.abs(gunler[2]! - 5) < 1e-6, String(gunler[2]));
  });

  test('FT-2: oturumsuz 401; bozuk ya da 100den uzun sorgu 400', async () => {
    assert.equal((await al(`/recete-rota/fason-tahminleri?s=1-1-1-1`, '')).statusCode, 401);
    for (const s of ['', '1-1-1', '1-1-1-x', '1-1-1-1,', Array.from({ length: 101 }, () => '1-1-1-1').join(',')]) {
      assert.equal((await al(`/recete-rota/fason-tahminleri?s=${s}`)).statusCode, 400, s);
    }
  });
});
