import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Cek } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cekVadeHatasi, kasaBakiyesiHatasi } from './kurallar.ts';

// K12 a: kasa eksiye düşmez, banka düşebilir; çekte vade düzenlemeden önce olamaz; K11 a: ay sonu maddeleri sabit listedir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hesap { id: number; bakiye: string; surum: number }

describe('kasa, çek vadesi ve ay sonu maddesi kuralları (saf)', () => {
  test('kasa eksiye düşmez, banka ve kredi kartı düşebilir', () => {
    assert.ok(kasaBakiyesiHatasi('kasa', '-0.01'));
    assert.equal(kasaBakiyesiHatasi('kasa', '0.00'), null);
    assert.equal(kasaBakiyesiHatasi('banka', '-500.00'), null);
    assert.equal(kasaBakiyesiHatasi('kredi_karti', '-500.00'), null);
  });
  test('çek vadesi düzenleme tarihinden önce olamaz, aynı gün olur', () => {
    assert.ok(cekVadeHatasi('2026-10-20', '2026-10-19'));
    assert.equal(cekVadeHatasi('2026-10-20', '2026-10-20'), null);
  });
});

describe('kasa, çek vadesi ve ay sonu maddesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let firma = 0;
  let kasa = 0;
  let banka = 0;

  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  const yaz = <T = unknown>(yol: string, govde: unknown) => istek<T>('POST', yol, govde);
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, JSON.stringify(c.govde)); return c.govde; };
  const hesap = async (id: number): Promise<Hesap> => {
    const h = tamam(await istek<{ satirlar: (Hesap & { id: number })[] }>('GET', '/finans/hesaplar?sayfaBoyu=200')).satirlar.find((x) => x.id === id);
    if (!h) throw new Error(`hesap ${id} yok`);
    return h;
  };
  const odeme = (hesapId: number, yontem: string, tutar: number, yon = 'gider') =>
    yaz<{ odeme: { id: number; surum: number } }>('/finans/odemeler/ekle', { yon, firmaId: firma, tarih: '2026-10-10', yontem, hesapId, tutar });

  before(async () => {
    ortam = await testVeritabaniKur('finanskasacek');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firma = (await ortam.vt.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'ikisi', $1) RETURNING id", [kisi]))?.id ?? 0;
    kasa = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme Kasa', tur: 'kasa', acilisBakiyesi: 1000, acilisTarihi: '2026-01-01' })).hesap.id;
    banka = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme Banka', tur: 'banka', acilisBakiyesi: 1000, acilisTarihi: '2026-01-01' })).hesap.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kasadan bakiyeyi aşan ödeme reddedilir, yazılmaz; bakiye kadar ödeme geçer', async () => {
    const red = await odeme(kasa, 'nakit', 1000.01);
    assert.equal(red.durum, 422, JSON.stringify(red.govde));
    assert.equal((await hesap(kasa)).bakiye, '1000.00');
    tamam(await odeme(kasa, 'nakit', 1000));
    assert.equal((await hesap(kasa)).bakiye, '0.00');
  });
  test('bankadan bakiyeyi aşan ödeme geçer (banka eksi olabilir)', async () => {
    tamam(await odeme(banka, 'banka', 5000));
    assert.equal((await hesap(banka)).bakiye, '-4000.00');
  });
  test('kasadan bakiyeyi aşan virman ve peşin gider reddedilir; kasaya giriş geçer', async () => {
    assert.equal((await yaz('/finans/virmanlar/ekle', { kaynakHesapId: kasa, hedefHesapId: banka, tarih: '2026-10-11', tutar: 1 })).durum, 422);
    const pesin = await yaz('/finans/belgeler/ekle', { yon: 'gider', tur: 'faturasiz', kategori: 'personel', belgeTarihi: '2026-10-11', vade: '2026-10-11',
      tutar: 10, kdvOrani: 0, pesin: { yontem: 'nakit', hesapId: kasa, tarih: '2026-10-11' } });
    assert.equal(pesin.durum, 422, JSON.stringify(pesin.govde));
    tamam(await odeme(kasa, 'nakit', 300, 'gelir'));
    assert.equal((await hesap(kasa)).bakiye, '300.00');
  });
  test('kasaya girişin iptali ve kasadan çıkan virmanın geri dönmesi kasayı eksiye düşüremez', async () => {
    const giris = tamam(await odeme(kasa, 'nakit', 200, 'gelir')).odeme;
    tamam(await odeme(kasa, 'nakit', 450));
    assert.equal((await hesap(kasa)).bakiye, '50.00');
    assert.equal((await yaz(`/finans/odemeler/${giris.id}/iptal`, { surum: giris.surum, neden: null })).durum, 422);
    const v = tamam(await yaz<{ virman: { id: number; surum: number } }>('/finans/virmanlar/ekle', { kaynakHesapId: banka, hedefHesapId: kasa, tarih: '2026-10-12', tutar: 100 })).virman;
    tamam(await odeme(kasa, 'nakit', 120));
    assert.equal((await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum })).durum, 422);
  });
  test('kasa eksi açılış bakiyesiyle açılmaz ve eksiye eşitlenmez', async () => {
    assert.equal((await yaz('/finans/hesaplar/ekle', { ad: 'Deneme Kasa 2', tur: 'kasa', acilisBakiyesi: -1, acilisTarihi: '2026-01-01' })).durum, 422);
    assert.equal((await yaz(`/finans/hesaplar/${kasa}/esitle`, { tarih: '2026-10-31', gercekBakiye: -5 })).durum, 422);
  });
  test('eşzamanlı iki kasa çıkışından yalnız biri geçer', async () => {
    const once = Number((await hesap(kasa)).bakiye);
    const [a, b] = await Promise.all([odeme(kasa, 'nakit', once), odeme(kasa, 'nakit', once)]);
    assert.deepEqual([a.durum, b.durum].sort(), [200, 422]);
    assert.equal((await hesap(kasa)).bakiye, '0.00');
  });
  // Yukarıdaki test yarışı yalnız zamanlama tutarsa üretir. Burada hesap satırı dışarıdan tutulur ve iki istek de kilitte
  // bekleyene kadar bırakılmaz: ikisi yazım adımına aynı anda girer. Kilitlenme olursa kaybeden 503 alırdı.
  test('eşzamanlı iki kasa çıkışı aynı anda yazıma girse de kilitlenmez: biri geçer, öteki 422', async () => {
    const vt = ortam!.vt;
    const yeni = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme Kasa Yaris', tur: 'kasa', acilisBakiyesi: 1000, acilisTarihi: '2026-01-01' })).hesap.id;
    let istekler: Promise<Cevap[]> | undefined;
    await vt.tx(async (db) => {
      await db.sorgu('SELECT id FROM finans_hesap WHERE id = $1 FOR UPDATE', [yeni]);
      istekler = Promise.all([odeme(yeni, 'nakit', 1000), odeme(yeni, 'nakit', 1000)]);
      const son = Date.now() + 5000;
      for (;;) {
        // pg_stat_activity transaction boyunca ilk okumadaki anlık görüntüyü verir; her turda bırakılır.
        await db.sorgu('SELECT pg_stat_clear_snapshot()');
        const s = await db.tek<{ n: number }>(`WITH RECURSIVE b(pid) AS (SELECT pg_backend_pid() UNION SELECT a.pid FROM pg_stat_activity a JOIN b ON b.pid = ANY(pg_blocking_pids(a.pid)))
          SELECT count(*)::int - 1 AS n FROM b`);
        if ((s?.n ?? 0) >= 2) break;
        assert.ok(Date.now() < son, 'iki istek 5 sn içinde hesap kilidinde beklemeye geçmedi');
        await new Promise((coz) => { setTimeout(coz, 20); });
      }
    });
    const [a, b] = await istekler!;
    assert.deepEqual([a!.durum, b!.durum].sort(), [200, 422], JSON.stringify([a!.govde, b!.govde]));
    assert.equal((await hesap(yeni)).bakiye, '0.00');
  });
  test('çekte vade düzenlemeden önce reddedilir; düzeltmede de', async () => {
    const cek = (vade: string) => yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: firma, duzenlemeTarihi: '2026-10-20', vade, tutar: 5 });
    const red = await cek('2026-01-01');
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    assert.equal((red.govde as unknown as { alan?: string }).alan, 'vade');
    const c = tamam(await cek('2026-10-20')).cek;
    assert.equal((await yaz(`/finans/cekler/${c.id}/duzelt`, { surum: c.surum, banka: null, seriNo: null, vade: '2026-10-19' })).durum, 400);
    const cekli = await yaz('/finans/belgeler/ekle', { yon: 'gelir', tur: 'fatura', kategori: 'urun_satisi', firmaId: firma, belgeTarihi: '2026-10-20', vade: '2026-10-20',
      tutar: 10, kdvOrani: 0, cek: { tur: 'cek', banka: null, seriNo: null, vade: '2026-10-01' } });
    assert.equal(cekli.durum, 400, JSON.stringify(cekli.govde));
  });
  test('ay sonu yalnız listedeki maddeyi işaretler', async () => {
    tamam(await yaz('/finans/kapanis/isaretle', { donem: '2026-10', madde: 'kasa', isaretli: true }));
    assert.equal((await yaz('/finans/kapanis/isaretle', { donem: '2026-10', madde: 'zzz', isaretli: true })).durum, 400);
  });
});
