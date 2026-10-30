import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { istasyon360Cevabi, kaynakAramaCevabi, kisi360Cevabi, makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// Kart 1325: Kaynak 360 uçları yalnız okur; sayfa işlemiyle açılır, her bölüm sahibinin okuma işlemini ister (1322 a).
describe('kaynak-izi uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let kisiId = 0;
  let istasyonId = 0;
  let makineId = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: unknown }> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', 'istek-kimligi': randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: c.body ? c.json() : undefined };
  }
  const oku = (ad: string, yol: string) => istek(ad, 'GET', yol);
  async function yaz(yol: string, govde: unknown): Promise<unknown> {
    const c = await istek('yonetici', 'POST', yol, govde);
    assert.equal(c.durum, 200, `${yol}: ${JSON.stringify(c.govde)}`);
    return c.govde;
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  // Geçici rol: verilen işlemleri taşır; kişi yönetici rolüyle doğar, o rol alınır.
  async function kisiKur(kullaniciAdi: string, islemler: readonly string[]): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
    });
    await giris(kullaniciAdi);
  }

  before(async () => {
    ortam = await testVeritabaniKur('kaynak_izi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisiKur('sayfasiz', ['sayfa.istasyonlar']);
    await kisiKur('yalin', ['sayfa.kaynak-izi']);
    await kisiKur('tesisci', ['sayfa.kaynak-izi', 'sayfa.istasyonlar']);
    const im = (await yaz('/is-merkezleri', { kod: 'KIZ-IM', ad: 'Deneme Merkezi' })) as { id: number };
    istasyonId = ((await yaz('/istasyonlar', { kod: 'KIZ-IS', ad: 'Deneme Torna', isMerkeziId: im.id })) as { id: number }).id;
    makineId = ((await yaz('/makineler', { kod: 'KIZ-MK', ad: 'Deneme Tezgah', istasyonId })) as { id: number }).id;
    kisiId = ((await yaz('/kisiler', { ad: 'Deneme Işıl Usta' })) as { id: number }).id;
    await yaz(`/istasyonlar/${String(istasyonId)}/kisiler/ata`, { kisiId, yuzde: '60' });
    await yaz(`/kisi-yetkinlikleri/${String(kisiId)}/belirle`, { istasyonIdleri: [istasyonId] });
    await yaz(`/kisi-yetkinlikleri/${String(kisiId)}/makineler/belirle`, { makineIdleri: [makineId] });
    await yaz(`/makineler/${String(makineId)}/durum`, { durum: 'ariza', aciklama: 'Deneme arıza' });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KI-U1 sayfa işlemi olmayan 403, oturumsuz 401; olmayan kaynak 404, geçersiz kimlik 400', async () => {
    for (const yol of ['/kaynak-izi/kaynaklar', `/kaynak-izi/istasyonlar/${String(istasyonId)}`, `/kaynak-izi/makineler/${String(makineId)}`, `/kaynak-izi/kisiler/${String(kisiId)}`]) {
      assert.equal((await oku('sayfasiz', yol)).durum, 403, yol);
      assert.equal((await oku('yok', yol)).durum, 401, yol);
    }
    for (const yol of ['/kaynak-izi/istasyonlar/999999', '/kaynak-izi/makineler/999999', '/kaynak-izi/kisiler/999999']) assert.equal((await oku('yonetici', yol)).durum, 404, yol);
    assert.equal((await oku('yonetici', '/kaynak-izi/kisiler/abc')).durum, 400);
  });

  test('KI-U2 arama istasyon, makine ve kişiyi kodda ya da adda bulur, üst kaydıyla', async () => {
    const c = await oku('yalin', '/kaynak-izi/kaynaklar?metin=deneme');
    assert.equal(c.durum, 200);
    const l = kaynakAramaCevabi.parse(c.govde);
    const bulunan = l.satirlar.map((s) => [s.tur, s.kod, s.ust]);
    assert.ok(bulunan.some(([t, k, u]) => t === 'istasyon' && k === 'KIZ-IS' && u === 'KIZ-IM'));
    assert.ok(bulunan.some(([t, k, u]) => t === 'makine' && k === 'KIZ-MK' && u === 'KIZ-IS'));
    assert.deepEqual(kaynakAramaCevabi.parse((await oku('yalin', '/kaynak-izi/kaynaklar?metin=isil usta')).govde).satirlar.map((s) => [s.tur, s.id]), [['kisi', kisiId]]);
  });

  test('KI-U3 1322 a: yalnız sayfa işlemi olana kimlik döner, bütün bölümler null ve sorgusu atılmaz', async () => {
    const i = istasyon360Cevabi.parse((await oku('yalin', `/kaynak-izi/istasyonlar/${String(istasyonId)}`)).govde);
    assert.deepEqual([i.kaynak.kod, i.isMerkezi?.kod, i.tesis, i.oee, i.maliyet, i.gorunurBolumler], ['KIZ-IS', 'KIZ-IM', null, null, null, []]);
    const m = makine360Cevabi.parse((await oku('yalin', `/kaynak-izi/makineler/${String(makineId)}`)).govde);
    assert.deepEqual([m.kaynak.kod, m.istasyon?.kod, m.tesis], ['KIZ-MK', 'KIZ-IS', null]);
    const k = kisi360Cevabi.parse((await oku('yalin', `/kaynak-izi/kisiler/${String(kisiId)}`)).govde);
    assert.deepEqual([k.kaynak.ad, k.kaynak.aktif, k.tesis, k.vardiya, k.izin, k.isler, k.maliyet], ['Deneme Işıl Usta', true, null, null, null, null, null]);
  });

  test('KI-U4 istasyonlar okuması olana tesis bölümü: makine durumu, atanan ve yetkin kişiler; öteki bölümler kapalı', async () => {
    const i = istasyon360Cevabi.parse((await oku('tesisci', `/kaynak-izi/istasyonlar/${String(istasyonId)}`)).govde);
    assert.deepEqual(i.gorunurBolumler, ['tesis']);
    assert.deepEqual(i.tesis?.makineler.map((x) => [x.kod, x.durum?.durum, x.durum?.aciklama]), [['KIZ-MK', 'ariza', 'Deneme arıza']]);
    assert.deepEqual(i.tesis?.atananlar, [{ kisiId, ad: 'Deneme Işıl Usta', yuzde: '60.00' }]);
    assert.deepEqual(i.tesis?.yetkinler, [{ kisiId, ad: 'Deneme Işıl Usta' }]);
    assert.equal(i.oee, null);
    const m = makine360Cevabi.parse((await oku('tesisci', `/kaynak-izi/makineler/${String(makineId)}`)).govde);
    assert.deepEqual([m.tesis?.durum?.durum, m.tesis?.atananlar, m.tesis?.yetkinler.map((y) => y.kisiId)], ['ariza', [], [kisiId]]);
    const k = kisi360Cevabi.parse((await oku('tesisci', `/kaynak-izi/kisiler/${String(kisiId)}`)).govde);
    assert.deepEqual(k.tesis?.atamalar, [{ tur: 'istasyon', id: istasyonId, kod: 'KIZ-IS', ad: 'Deneme Torna', yuzde: '60.00' }]);
    assert.deepEqual([k.tesis?.istasyonYetkinlikleri.map((x) => x.kod), k.tesis?.makineYetkinlikleri.map((x) => x.kod)], [['KIZ-IS'], ['KIZ-MK']]);
    assert.deepEqual([k.vardiya, k.izin, k.isler, k.maliyet], [null, null, null, null]);
  });

  test('KI-U5 bütün işlemleri taşıyan yönetici bütün bölümleri görür; veri yoksa null ya da boş, sıfır uydurulmaz', async () => {
    const i = istasyon360Cevabi.parse((await oku('yonetici', `/kaynak-izi/istasyonlar/${String(istasyonId)}`)).govde);
    assert.deepEqual(i.gorunurBolumler, ['tesis', 'vardiya', 'izin', 'isler', 'oee', 'maliyet']);
    assert.ok(i.oee !== null);
    assert.deepEqual([i.oee.oee, i.maliyet], [null, null]);
    const k = kisi360Cevabi.parse((await oku('yonetici', `/kaynak-izi/kisiler/${String(kisiId)}`)).govde);
    assert.deepEqual([k.vardiya, k.izin, k.isler, k.maliyet], [null, { bugunIzinli: false }, [], null]);
  });
});
