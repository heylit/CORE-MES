import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KurFaizAraligi } from '#paylasilan/sozlesme/finans.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ileriTarihliKurSirasi, topluKurFaizKarari } from './kurallar.ts';

// Kurlar ve oranlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/finans/kur-faiz/toplu-yukle';
interface Cevap<T = unknown> { durum: number; govde: T }
const kod = (c: Cevap): unknown => (c.govde as { kod?: unknown } | undefined)?.kod;

describe('kur ve faiz toplu yükleme (1083-1087, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, istekKimligi: string = randomUUID()): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (kim) basliklar['cookie'] = cerez.get(kim) ?? '';
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = istekKimligi;
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yukle = (satirlar: unknown[], kim = 'yukleyen', istekKimligi: string = randomUUID()) => istek<{ eklenen: number; ayni: number; farkli: number }>(kim, 'POST', YOL, { satirlar }, istekKimligi);
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const aralik = (baslangic: string, bitis: string, kim = 'yukleyen') => istek<KurFaizAraligi>(kim, 'GET', `/finans/kur-faiz-araligi?baslangic=${baslangic}&bitis=${bitis}`);
  const kurSayisi = async (pb: string): Promise<number> => Number((await vt().tek<{ n: string }>('SELECT count(*)::text AS n FROM finans_kur WHERE para_birimi = $1', [pb]))?.n);

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
    ortam = await testVeritabaniKur('finanskurtoplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Satın alma gibi: kur ve faiz yazar, finans rakamı okumaz.
    await girisliKisi('yukleyen', ['finans.kur-yaz']);
    await girisliKisi('okuyan', ['finans.oku', 'finans.yaz']);
    await girisliKisi('firmaci', ['musteri-tedarikci.oku']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('kural: kayıtlı olmayan eklenir, aynı ve farklı değer atlanır (1085 a); ileri tarihli kur bulunur, faiz serbesttir (1086 a)', () => {
    assert.equal(topluKurFaizKarari('41.850000', undefined), 'ekle');
    assert.equal(topluKurFaizKarari('41.850000', '41.8500'), 'ayni');
    assert.equal(topluKurFaizKarari('41.900000', '41.850000'), 'farkli');
    assert.equal(ileriTarihliKurSirasi([{ tur: 'faiz', tarih: '2026-11-01' }, { tur: 'kur', tarih: '2026-10-28' }], '2026-10-28'), null);
    assert.equal(ileriTarihliKurSirasi([{ tur: 'kur', tarih: '2026-10-27' }, { tur: 'kur', tarih: '2026-10-29' }], '2026-10-28'), 1);
  });

  test('izinli: kur yazan kişi kur ve faizi birlikte yükler; değerler aralık okumasında görünür, faizde aralıktan önceki oran da gelir', async () => {
    tamam(await yukle([{ tur: 'faiz', paraBirimi: 'CHF', tarih: '2026-01-01', deger: 1.5 }]));
    const c = tamam(await yukle([
      { tur: 'kur', paraBirimi: 'CHF', tarih: '2026-03-02', deger: 38.1234 },
      { tur: 'kur', paraBirimi: 'chf', tarih: '2026-03-03', deger: 38.2 },
      { tur: 'faiz', paraBirimi: 'CHF', tarih: '2026-03-02', deger: 1.75 },
      { tur: 'faiz', paraBirimi: 'CHF', tarih: '2099-01-01', deger: 1.8 },
    ]));
    assert.deepEqual(c, { eklenen: 4, ayni: 0, farkli: 0 });
    const a = tamam(await aralik('2026-03-01', '2026-03-31'));
    assert.deepEqual(a.kurlar.filter((k) => k.paraBirimi === 'CHF').map((k) => [k.tarih, Number(k.kur)]), [['2026-03-02', 38.1234], ['2026-03-03', 38.2]]);
    assert.deepEqual(a.faizler.filter((f) => f.paraBirimi === 'CHF').map((f) => [f.gecerlilikBaslangic, Number(f.aylikYuzde)]), [['2026-01-01', 1.5], ['2026-03-02', 1.75]]);
    const giren = await vt().tek<{ ad: string }>("SELECT k.ad FROM finans_kur f JOIN kisi k ON k.id = f.olusturan_id WHERE f.para_birimi = 'CHF' AND f.tarih = '2026-03-02'");
    assert.equal(giren?.ad, 'Deneme yukleyen', 'her satır yükleyen kişiyle yazılır');
  });

  test('kayıtlı güne aynı değer de farklı değer de atlanır, kayıtlı kur değişmez (1085 a)', async () => {
    tamam(await yukle([{ tur: 'kur', paraBirimi: 'AUD', tarih: '2026-04-01', deger: 27.5 }, { tur: 'faiz', paraBirimi: 'AUD', tarih: '2026-04-01', deger: 2 }]));
    const c = tamam(await yukle([
      { tur: 'kur', paraBirimi: 'AUD', tarih: '2026-04-01', deger: 27.5 },
      { tur: 'kur', paraBirimi: 'AUD', tarih: '2026-04-02', deger: 27.6 },
      { tur: 'faiz', paraBirimi: 'AUD', tarih: '2026-04-01', deger: 2.5 },
    ]));
    assert.deepEqual(c, { eklenen: 1, ayni: 1, farkli: 1 });
    const a = tamam(await aralik('2026-04-01', '2026-04-30'));
    assert.deepEqual(a.kurlar.filter((k) => k.paraBirimi === 'AUD').map((k) => Number(k.kur)), [27.5, 27.6]);
    assert.deepEqual(a.faizler.filter((f) => f.paraBirimi === 'AUD').map((f) => Number(f.aylikYuzde)), [2]);
  });

  test('hepsi ya da hiçbiri: ileri tarihli kur, TRY kuru, dosyada tekrar eden satır ya da sınır aşımı bütün dosyayı reddeder', async () => {
    const ileri = await yukle([{ tur: 'kur', paraBirimi: 'NOK', tarih: '2026-05-01', deger: 3.9 }, { tur: 'kur', paraBirimi: 'NOK', tarih: '2099-01-01', deger: 4 }]);
    assert.equal(ileri.durum, 422);
    assert.equal(kod(ileri), 'GECERSIZ');
    assert.match(JSON.stringify(ileri.govde), /2\. satır: ileri tarihli kur/);
    assert.equal(await kurSayisi('NOK'), 0, 'geçerli ilk satır da yazılmaz');
    const bugun = tesisGunu(new Date());
    tamam(await yukle([{ tur: 'kur', paraBirimi: 'NOK', tarih: bugun, deger: 3.95 }]));
    assert.equal((await yukle([{ tur: 'kur', paraBirimi: 'TRY', tarih: '2026-05-01', deger: 1 }])).durum, 400);
    assert.equal((await yukle([
      { tur: 'kur', paraBirimi: 'SEK', tarih: '2026-05-01', deger: 3.5 }, { tur: 'kur', paraBirimi: 'sek', tarih: '2026-05-01', deger: 3.6 },
    ])).durum, 400);
    assert.equal(await kurSayisi('SEK'), 0);
    assert.equal((await yukle([])).durum, 400);
    const cok = Array.from({ length: 401 }, (_, i) => ({ tur: 'kur', paraBirimi: 'DKK', tarih: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), deger: 5 }));
    assert.equal((await yukle(cok)).durum, 400);
    assert.equal(await kurSayisi('DKK'), 0);
    assert.equal((await yukle([{ tur: 'faiz', paraBirimi: 'SEK', tarih: '2026-05-01', deger: 101 }])).durum, 400);
    assert.equal((await yukle([{ tur: 'oran', paraBirimi: 'SEK', tarih: '2026-05-01', deger: 1 }])).durum, 400);
  });

  test('aynı istek kimliğiyle ikinci gönderim satırları ikinci kez yazmaz', async () => {
    const kimlik = randomUUID();
    const satirlar = [{ tur: 'faiz', paraBirimi: 'PLN', tarih: '2026-06-01', deger: 1.1 }];
    assert.deepEqual(tamam(await yukle(satirlar, 'yukleyen', kimlik)), { eklenen: 1, ayni: 0, farkli: 0 });
    tamam(await yukle(satirlar, 'yukleyen', kimlik));
    assert.equal(Number((await vt().tek<{ n: string }>("SELECT count(*)::text AS n FROM finans_faiz WHERE para_birimi = 'PLN'"))?.n), 1);
  });

  test('reddedilen: kur yazma işlemi olmayan finans kullanıcısı ve oturumsuz istek yükleyemez; aralık okuması oturum ister, aralık sınırlıdır', async () => {
    const satir = [{ tur: 'kur', paraBirimi: 'HUF', tarih: '2026-07-01', deger: 0.12 }];
    assert.equal((await yukle(satir, 'okuyan')).durum, 403);
    assert.equal((await yukle(satir, 'firmaci')).durum, 403);
    assert.equal((await istek(null, 'POST', YOL, { satirlar: satir })).durum, 401);
    assert.equal(await kurSayisi('HUF'), 0);
    // 952 a: şerit gibi giriş yapan herkes okur; finans rakamı yoktur.
    assert.equal((await aralik('2026-01-01', '2026-12-31', 'firmaci')).durum, 200);
    assert.equal((await istek(null, 'GET', '/finans/kur-faiz-araligi?baslangic=2026-01-01&bitis=2026-12-31')).durum, 401);
    assert.equal((await aralik('2026-12-31', '2026-01-01')).durum, 400);
    assert.equal((await aralik('2020-01-01', '2026-01-01')).durum, 400);
  });
});
