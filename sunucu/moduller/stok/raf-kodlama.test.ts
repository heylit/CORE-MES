import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { rafKodlamaOnizlemeCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { RafKodlamaCevabi, RafKodlamaOnizlemeCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { haritaEslemeCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { HaritaEslemeCevabi } from '#paylasilan/sozlesme/stok.ts';
import { gozBul } from '../atolye/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 3168 a, 3171 a: raf kodlaması Stok > Ayarlar'dan değişir; bütün göz konumlarının kodu aynı kayıtta değişir (R1), önce kuru deneme
// (R3), değişenler cevapta ve denetim kaydında (R4, R6), eski koda takma ad yok (R5), kod geri çözülür (R7). Sıra numarası göze
// bir kez verilir; yeniden numaralama ayrı komuttur ve zincirleme kod değişimi tek eşlemede biter.
const PAROLA = 'dogru-parola-1';

describe('stok raf kodlama (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async <T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(kim === null ? {} : { cookie: cerezler.get(kim) ?? '' }), ...(yontem === 'POST' ? { 'istek-kimligi': randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: c.json() as T };
  };
  const salon = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>(
    'INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ($1, $1, 20, 20, 4, (SELECT min(id) FROM kisi)) RETURNING id', [kod]))!.id;
  // Göz satırları gözleriEsitle'nin verdiği gibi numaralı: bölme sırasıyla 1, 2, ...
  const raf = async (salonId: number, kod: string, bolme: number): Promise<number> => {
    const r = (await o().vt.tek<{ id: number }>(
      `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus, son_duz_no)
       VALUES ($1, $2, 'Deneme rafı', 'palet', $3, 1, 1, 2, 1, 2, 5, 5, 0, $3) RETURNING id`, [salonId, kod, bolme]))!.id;
    for (let b = 1; b <= bolme; b++) await o().vt.sorgu('INSERT INTO atolye_goz (raf_id, bolme, kat, goz, duz_no) VALUES ($1, $2, 1, 1, $2)', [r, b]);
    return r;
  };
  const kodlar = async (rafKodu: string): Promise<string[]> => (await o().vt.sorgu<{ kod: string }>(
    `SELECT k.kod FROM stok_konum k JOIN atolye_goz g ON g.id = k.atolye_goz_id JOIN atolye_raf r ON r.id = g.raf_id
      WHERE r.kod = $1 ORDER BY g.bolme`, [rafKodu])).map((k) => k.kod);
  const numaraVer = async (rafId: number, numaralar: readonly number[]): Promise<void> => {
    await o().vt.tx(async (db) => {
      for (const [i, n] of numaralar.entries()) await db.sorgu('UPDATE atolye_goz SET duz_no = $3 WHERE raf_id = $1 AND bolme = $2', [rafId, i + 1, n]);
    });
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_raf_kodlama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'kalite']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('kodlama değişir: önce kuru deneme, rakamlı raf kodu engeller; bütün göz konumları tek kayıtta değişir, denetime düşer; eski kod çözülmez', async () => {
    const a = await salon('RK-A');
    await raf(a, 'RKA', 3);
    const b = await salon('RK-B');
    await raf(b, 'R7', 1);
    for (const s of [a, b]) assert.equal((await iste('depo', 'POST', `/stok/harita-bolumleri/${s}/depo`, { depo: true })).durum, 200);
    assert.deepEqual(await kodlar('RKA'), ['RKA-01-1-1', 'RKA-02-1-1', 'RKA-03-1-1']);
    assert.deepEqual((await iste<RafKodlamaCevabi>('kalite', 'GET', '/stok/raf-kodlama')).govde, { kodlama: 'bolme-kat-goz' });

    // Kuru deneme yalnız stok.tanim ile; hiçbir şey yazmaz.
    assert.equal((await iste('kalite', 'GET', '/stok/raf-kodlama/onizleme?kodlama=duz-sayi')).durum, 403);
    const on = await iste<RafKodlamaOnizlemeCevabi>('depo', 'GET', '/stok/raf-kodlama/onizleme?kodlama=duz-sayi');
    assert.equal(on.durum, 200, JSON.stringify(on.govde));
    rafKodlamaOnizlemeCevabi.parse(on.govde);
    assert.deepEqual(on.govde, {
      kodlama: 'duz-sayi', rafSayisi: 2, gozSayisi: 4, degisenKonum: 4, stokluKonum: 0, ornek: { eski: 'R7-01-1-1', yeni: 'R71' }, engelliRaflar: ['R7'],
    });
    assert.deepEqual(await kodlar('RKA'), ['RKA-01-1-1', 'RKA-02-1-1', 'RKA-03-1-1']);

    // Rakamlı raf kodu varken geçilmez; yetkisiz ve eski görünümle gelen komut da reddedilir.
    const engel = await iste<{ mesaj: string }>('depo', 'POST', '/stok/raf-kodlama/degistir', { kodlama: 'duz-sayi', beklenen: 'bolme-kat-goz' });
    assert.equal(engel.durum, 422, JSON.stringify(engel.govde));
    assert.match(engel.govde.mesaj, /R7/);
    await o().vt.sorgu("UPDATE atolye_raf SET kod = 'RKB' WHERE kod = 'R7'");
    assert.equal((await iste('kalite', 'POST', '/stok/raf-kodlama/degistir', { kodlama: 'duz-sayi', beklenen: 'bolme-kat-goz' })).durum, 403);
    assert.equal((await iste('depo', 'POST', '/stok/raf-kodlama/degistir', { kodlama: 'duz-sayi', beklenen: 'duz-sayi' })).durum, 409);

    const d = await iste<HaritaEslemeCevabi>('depo', 'POST', '/stok/raf-kodlama/degistir', { kodlama: 'duz-sayi', beklenen: 'bolme-kat-goz' });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    haritaEslemeCevabi.parse(d.govde);
    // Rafın kodu R7 iken açılan konum eski adresini taşıyordu; yeni kod yeni raf kodundan.
    assert.deepEqual(d.govde.koduDegisenler.map((k) => [k.eskiKod, k.yeniKod]),
      [['RKA-01-1-1', 'RKA1'], ['RKA-02-1-1', 'RKA2'], ['RKA-03-1-1', 'RKA3'], ['R7-01-1-1', 'RKB1']]);
    assert.deepEqual(d.govde.atlanan, []);
    assert.deepEqual(await kodlar('RKA'), ['RKA1', 'RKA2', 'RKA3']);
    assert.deepEqual((await iste<RafKodlamaCevabi>('kalite', 'GET', '/stok/raf-kodlama')).govde, { kodlama: 'duz-sayi' });

    // R6: ayar değişikliği komutun yolu ve yetkisiyle; uç kaydına özet ve kod değişimleri eklenir.
    const ayarKaydi = await o().vt.tek<{ yetki: string; govde: { eski: string; yeni: string } }>(
      "SELECT yetki, govde FROM denetim_kaydi WHERE yol = '/stok/raf-kodlama/degistir' AND parametre->>'anahtar' = 'atolye.raf-kodlama'");
    assert.deepEqual([ayarKaydi?.yetki, ayarKaydi?.govde], ['stok.tanim', { eski: 'bolme-kat-goz', yeni: 'duz-sayi' }]);
    const ucKaydi = await o().vt.tek<{ govde: unknown }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/stok/raf-kodlama/degistir' AND parametre->>'anahtar' IS NULL ORDER BY id DESC LIMIT 1");
    assert.match(JSON.stringify(ucKaydi?.govde), /"degisenKonum":4/);
    assert.match(JSON.stringify(ucKaydi?.govde), /"eskiKod":"RKA-02-1-1","konumId":\d+,"yeniKod":"RKA2"/);

    // R5, R7: yeni kod göze çözülür; eski kod hiçbir göze çözülmez.
    assert.equal((await o().vt.tx((db) => gozBul(db, 'rka2')))?.bolme, 2);
    assert.equal(await o().vt.tx((db) => gozBul(db, 'RKA-02-1-1')), null);
  });

  test('yer değiştiren ve zincirleme kodlar tek eşlemede değişir (R1); yeniden numaralama sırayı kurar, yalnız sıra numaralı kodlamada', async () => {
    const rafId = (await o().vt.tek<{ id: number }>("SELECT id FROM atolye_raf WHERE kod = 'RKA'"))!.id;
    // Numaralar sonradan değişmiş gibi: 1. ve 3. göz yer değiştirir, 2. göz rafın yeni numarasını alır (zincir: RKA2 -> RKA4).
    await numaraVer(rafId, [3, 4, 1]);
    const e = await iste<HaritaEslemeCevabi>('depo', 'POST', '/stok/konumlar/haritadan-esle');
    assert.equal(e.durum, 200, JSON.stringify(e.govde));
    assert.deepEqual(e.govde.atlanan, []);
    assert.deepEqual(await kodlar('RKA'), ['RKA3', 'RKA4', 'RKA1']);

    assert.equal((await iste('kalite', 'POST', `/stok/harita-raflari/${rafId}/yeniden-numarala`)).durum, 403);
    const y = await iste<HaritaEslemeCevabi>('depo', 'POST', `/stok/harita-raflari/${rafId}/yeniden-numarala`);
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    assert.deepEqual(y.govde.koduDegisenler.map((k) => [k.eskiKod, k.yeniKod]), [['RKA3', 'RKA1'], ['RKA4', 'RKA2'], ['RKA1', 'RKA3']]);
    assert.deepEqual(y.govde.atlanan, []);
    assert.deepEqual(await kodlar('RKA'), ['RKA1', 'RKA2', 'RKA3']);
    assert.equal((await o().vt.tek<{ n: number }>('SELECT son_duz_no AS n FROM atolye_raf WHERE id = $1', [rafId]))?.n, 3);

    // Eski düzene dönüş: kodlar eski adrese döner; yeniden numaralama bu kodlamada yapılmaz.
    const geri = await iste<HaritaEslemeCevabi>('depo', 'POST', '/stok/raf-kodlama/degistir', { kodlama: 'bolme-kat-goz', beklenen: 'duz-sayi' });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.deepEqual(await kodlar('RKA'), ['RKA-01-1-1', 'RKA-02-1-1', 'RKA-03-1-1']);
    assert.equal((await iste('depo', 'POST', `/stok/harita-raflari/${rafId}/yeniden-numarala`)).durum, 422);
  });
});
