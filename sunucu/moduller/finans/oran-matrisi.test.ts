import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OranAraligi, OranOzeti } from '#paylasilan/sozlesme/finans.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kurCiftiGetir, kurCiftleri, oranGetir, oranlar } from './disari.ts';
import { topluKurCiftiKarari } from './kurallar.ts';

// Kart 2238, kur ve faiz matrisi. Kurlar ve oranlar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('kur ve faiz matrisi (kart 2238, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const yaz = (yol: string, govde: unknown, kim = 'yazan') => istek(kim, 'POST', yol, govde);

  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('finansoranmatrisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('yazan', ['finans.kur-yaz']);
    await girisliKisi('okuyan', ['finans.oku', 'finans.yaz']);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kural: kur çifti alış ve satışıyla birlikte karşılaştırılır', () => {
    assert.equal(topluKurCiftiKarari({ alis: '41.1', satis: '41.2' }, undefined), 'ekle');
    assert.equal(topluKurCiftiKarari({ alis: '41.1', satis: '41.2' }, { alis: '41.100000', satis: '41.200000' }), 'ayni');
    assert.equal(topluKurCiftiKarari({ alis: '41.1', satis: '41.3' }, { alis: '41.100000', satis: '41.200000' }), 'farkli');
  });

  test('izinli: kur yazan alış ve satışı birlikte girer, düzeltir; dışarı alış ve satışı ayrı verir, eski tek kura düşmez', async () => {
    tamam(await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.25, satis: 34.4 }));
    assert.equal((await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.3, satis: 34.5 })).durum, 409);
    tamam(await yaz('/finans/kur-ciftleri/guncelle', { paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.3, satis: 34.5, surum: 1 }));
    assert.equal((await yaz('/finans/kur-ciftleri/guncelle', { paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.3, satis: 34.6, surum: 1 })).durum, 409);
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-10-01', kur: 37 }));
    await vt().tx(async (db) => {
      assert.deepEqual(await kurCiftiGetir(db, 'USD', '2026-10-05', 'alis'), { kur: '34.300000', tarih: '2026-10-01' });
      assert.deepEqual(await kurCiftiGetir(db, 'USD', '2026-10-05', 'satis'), { kur: '34.500000', tarih: '2026-10-01' });
      assert.equal(await kurCiftiGetir(db, 'USD', '2026-09-30', 'alis'), null);
      assert.equal(await kurCiftiGetir(db, 'EUR', '2026-10-05', 'alis'), null);
      assert.deepEqual(await kurCiftiGetir(db, 'TRY', '2026-10-05', 'satis'), { kur: '1', tarih: '2026-10-05' });
      assert.deepEqual([...(await kurCiftleri(db, '2026-10-05', 'satis')).keys()].sort(), ['TRY', 'USD']);
    });
  });

  test('reddedilen: kur yazma yetkisi olmayan giremez; satış alıştan küçük, TRY kuru ve eksik satış reddedilir', async () => {
    assert.equal((await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'GBP', tarih: '2026-10-01', alis: 50, satis: 50.2 }, 'okuyan')).durum, 403);
    assert.equal((await yaz('/finans/oranlar/ekle', { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: 40 }, 'okuyan')).durum, 403);
    assert.equal((await yaz('/finans/oranlar/toplu-yukle', { satirlar: [{ tur: 'kredi', paraBirimi: 'TRY', tarih: '2026-10-01', yillikYuzde: 40 }] }, 'okuyan')).durum, 403);
    assert.equal((await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'GBP', tarih: '2026-10-01', alis: 50.2, satis: 50 })).durum, 400);
    assert.equal((await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'TRY', tarih: '2026-10-01', alis: 1, satis: 1 })).durum, 400);
    assert.equal((await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'GBP', tarih: '2026-10-01', alis: 50 })).durum, 400);
    const kisit = await vt().sorgu("INSERT INTO finans_kur_cifti (para_birimi, tarih, alis, satis, olusturan_id) VALUES ('GBP', '2026-10-01', 2, 1, $1)", [yoneticiId]).then(() => null, (h: { constraint?: string }) => h.constraint);
    assert.equal(kisit, 'finans_kur_cifti_sira');
  });

  test('oran: türlü yıllık oran eklenir, değişmez; dışarı günlük karşılığı yıllık / 365 verir; aynı güne sonra girilen geçerlidir', async () => {
    tamam(await yaz('/finans/oranlar/ekle', { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: 36.5, not: 'deneme kaynağı' }));
    tamam(await yaz('/finans/oranlar/ekle', { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-10', yillikYuzde: 40 }));
    tamam(await yaz('/finans/oranlar/ekle', { tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-10', yillikYuzde: 41 }));
    tamam(await yaz('/finans/oranlar/ekle', { tur: 'mevduat', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: 30 }));
    assert.equal((await yaz('/finans/oranlar/ekle', { tur: 'aylik', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: 3 })).durum, 400);
    await vt().tx(async (db) => {
      const k = await oranGetir(db, 'kredi', 'TRY', '2026-10-05');
      assert.deepEqual(k, { yillikYuzde: '36.5000', gunlukYuzde: 0.1, gecerlilikBaslangic: '2026-10-01' });
      assert.equal((await oranGetir(db, 'kredi', 'TRY', '2026-10-11'))?.yillikYuzde, '41.0000');
      assert.equal(await oranGetir(db, 'politika', 'TRY', '2026-10-11'), null);
      assert.equal((await oranlar(db, 'mevduat', '2026-10-11')).get('TRY')?.yillikYuzde, '30.0000');
    });
    const degisti = await vt().sorgu("UPDATE finans_oran SET yillik_yuzde = 1 WHERE tur = 'kredi'").then(() => true, () => false);
    assert.equal(degisti, false);
  });

  test('özet: giriş yapan herkes okur; kur çifti önceki değeriyle, oran türüyle ve notuyla, son giriş ve geçmiş', async () => {
    tamam(await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih: '2026-10-02', alis: 34.6, satis: 34.8 }));
    const o = tamam(await istek<OranOzeti>('okuyan', 'GET', '/finans/oran-ozeti'));
    assert.equal(o.bugun, tesisGunu(new Date()));
    const usd = o.kurlar.find((k) => k.paraBirimi === 'USD');
    assert.deepEqual([usd?.alis, usd?.satis, usd?.oncekiAlis, usd?.oncekiSatis, usd?.girenAd], ['34.600000', '34.800000', '34.300000', '34.500000', 'Deneme yazan']);
    const kredi = o.faizler.find((f) => f.tur === 'kredi' && f.paraBirimi === 'TRY');
    assert.deepEqual([kredi?.yillikYuzde, kredi?.oncekiYillikYuzde], ['41.0000', '36.5000']);
    assert.equal(o.sonGiris?.tur, 'kur');
    assert.deepEqual([o.gecmis[0]?.deger, o.gecmis[0]?.ikinciDeger], ['34.600000', '34.800000']);
  });

  test('toplu yükleme: kur çifti ve türlü oranlar birlikte; kayıtlı aynı ve farklı atlanır, ileri tarihli kur ya da hatalı satırda hiçbiri yazılmaz', async () => {
    const satirlar = [
      { tur: 'kur', paraBirimi: 'CHF', tarih: '2026-03-02', alis: 38.1, satis: 38.3 },
      { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-02', alis: 34.6, satis: 34.8 },
      { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.3, satis: 34.9 },
      { tur: 'kredi', paraBirimi: 'EUR', tarih: '2026-03-01', yillikYuzde: 5.88 },
      { tur: 'mevduat', paraBirimi: 'EUR', tarih: '2026-03-01', yillikYuzde: 0.98, not: 'stopaj sonrası' },
      { tur: 'politika', paraBirimi: 'EUR', tarih: '2099-01-01', yillikYuzde: 2.5 },
      { tur: 'kredi', paraBirimi: 'TRY', tarih: '2026-10-01', yillikYuzde: 36.5 },
    ];
    assert.deepEqual(tamam(await yaz('/finans/oranlar/toplu-yukle', { satirlar })), { eklenen: 4, ayni: 2, farkli: 1 });
    const once = Number((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_oran'))?.n);
    const ileri = await yaz('/finans/oranlar/toplu-yukle', { satirlar: [{ tur: 'politika', paraBirimi: 'USD', tarih: '2026-10-01', yillikYuzde: 4 }, { tur: 'kur', paraBirimi: 'CHF', tarih: '2099-01-01', alis: 1, satis: 1 }] });
    assert.equal(ileri.durum, 422);
    const ters = await yaz('/finans/oranlar/toplu-yukle', { satirlar: [{ tur: 'politika', paraBirimi: 'USD', tarih: '2026-10-01', yillikYuzde: 4 }, { tur: 'kur', paraBirimi: 'CHF', tarih: '2026-03-03', alis: 2, satis: 1 }] });
    assert.equal(ters.durum, 400);
    assert.equal(Number((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_oran'))?.n), once);
    const a = tamam(await istek<OranAraligi>('okuyan', 'GET', '/finans/oran-araligi?baslangic=2026-03-02&bitis=2026-03-31'));
    assert.deepEqual(a.kurlar, [{ paraBirimi: 'CHF', tarih: '2026-03-02', alis: '38.100000', satis: '38.300000' }]);
    assert.deepEqual(a.faizler.map((f) => [f.tur, f.paraBirimi, f.gecerlilikBaslangic]), [['kredi', 'EUR', '2026-03-01'], ['mevduat', 'EUR', '2026-03-01']]);
  });

  test('çapraz kur referansı o günün alış kurudur', async () => {
    const r = await vt().tek<{ k: string }>("SELECT finans_referans_kur('USD', '2026-10-02', 99)::text AS k");
    assert.equal(r?.k, '34.600000');
    const y = await vt().tek<{ k: string }>("SELECT finans_referans_kur('EUR', '2026-10-01', 99)::text AS k");
    assert.equal(y?.k, '99');
  });
});
