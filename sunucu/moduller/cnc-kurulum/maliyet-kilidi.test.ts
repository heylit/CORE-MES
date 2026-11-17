import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { PARA_ALANLARI, paraAlanlariniCikar, paraAlanlariniKoru } from './kurallar.ts';

// 3401-1 a: kg fiyatı, takım fiyatı, tezgâh ücreti ve hesaplanan maliyet yalnız finans.maliyet-oku olana gelir ve yalnız o yazar.
const PAROLA = 'dogru-parola-1';
interface Kayit { anahtar: string; bicim: 'json' | 'metin'; deger: Record<string, Record<string, unknown>>; surum: number }

const PARALI = {
  machine: 'f5a',
  stock: { type: 'bar', ax: 40, qty: 5, price: 92.5 },
  life: { vc: 180, tp: 12, price: 840, rate: 1750, uses: 3 },
};
// Para içermeyen (süre ve ölçü) alanlar her rolde görünür.
const OLCULER = { machine: 'f5a', stock: { type: 'bar', ax: 40, qty: 5 }, life: { vc: 180, tp: 12, uses: 3 } };
// Para adı taşıyan anahtar: yeni bir para alanı eklenip listeye girmezse bu yürüyüş yakalar.
const PARA_ADI = /fiyat|ucret|maliyet|price|rate$|cost/i;

function paraliAnahtarlar(d: unknown, yol = ''): string[] {
  if (d === null || typeof d !== 'object') return [];
  return Object.entries(d).flatMap(([a, v]) => {
    const burasi = `${yol}.${a}`;
    const dolu = v !== null && v !== undefined && v !== '' && typeof v !== 'object';
    return [...(PARA_ADI.test(a) && dolu ? [burasi] : []), ...paraliAnahtarlar(v, burasi)];
  });
}

describe('cnc-kurulum maliyet kilidi (3401-1 a)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.vt;
  };
  const cerezler: Record<string, string> = {};

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Rol bazında: işlemler role yazılır (rol_islemi), kişi yalnız o rolü taşır.
  async function rolluKisi(ad: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${ad}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    cerezler[ad] = await girisCerezi(ad);
  }

  const istek = (ad: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezler[ad] ?? '' }, payload: payload as object | undefined });
  const durumOku = async (ad: string): Promise<Kayit | undefined> => {
    const c = await istek(ad, 'GET', '/cnc-kurulum/kayitlar');
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as { kayitlar: Kayit[] }).kayitlar.find((k) => k.anahtar === DURUM_ANAHTARI);
  };
  const durumYaz = (ad: string, deger: unknown, beklenenSurum: number | null) =>
    istek(ad, 'POST', '/cnc-kurulum/kayitlar/yaz', { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum });

  before(async () => {
    ortam = await testVeritabaniKur('cnc_maliyet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerezler['yonetici'] = await girisCerezi('yonetici');
    await rolluKisi('cam', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz']);
    await rolluKisi('planlama', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku']);
    await rolluKisi('mudur', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz', 'finans.maliyet-oku']);
    await rolluKisi('muhasebe', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'finans.maliyet-oku']);
    await rolluKisi('onaylayan', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('MK-01: para alanlarını çıkaran ve koruyan kural listedeki her alanı kapsar', () => {
    const tam: Record<string, Record<string, unknown>> = {};
    for (const [g, a] of PARA_ALANLARI) tam[g] = { ...tam[g], [a]: 7, olcu: 1 };
    const cikan = paraAlanlariniCikar(tam) as Record<string, Record<string, unknown>>;
    for (const [g, a] of PARA_ALANLARI) assert.deepEqual([a in (cikan[g] ?? {}), cikan[g]?.['olcu']], [false, 1]);
    assert.deepEqual(paraAlanlariniKoru(tam, { stock: { price: 1, olcu: 2 }, life: { rate: 1, olcu: 2 } }), { stock: { price: 7, olcu: 2 }, life: { price: 7, rate: 7, olcu: 2 } });
    assert.deepEqual(paraAlanlariniKoru(null, { stock: { price: 1, olcu: 2 } }), { stock: { olcu: 2 } });
    assert.equal(paraAlanlariniCikar(null), null);
  });

  test('MK-02: para adı taşıyan her dolu alan listededir (yeni para alanı unutulursa düşer)', () => {
    const listede = PARA_ALANLARI.map(([g, a]) => `.${g}.${a}`).sort();
    assert.deepEqual(paraliAnahtarlar(PARALI).sort(), listede);
    assert.deepEqual(paraliAnahtarlar(paraAlanlariniCikar(PARALI)), []);
  });

  test('MK-03: maliyet görmeyen rol (cam, planlama) süre ve ölçüleri görür, para alanları yoktur; maliyet görenler ve yönetici hepsini görür', async () => {
    const ilk = await durumYaz('yonetici', PARALI, null);
    assert.equal(ilk.statusCode, 200, ilk.body);
    for (const ad of ['mudur', 'muhasebe', 'yonetici']) assert.deepEqual((await durumOku(ad))?.deger, PARALI, ad);
    for (const ad of ['cam', 'planlama']) {
      const k = await durumOku(ad);
      assert.deepEqual(k?.deger, OLCULER, ad);
      for (const [g, a] of PARA_ALANLARI) assert.equal(k?.deger[g]?.[a] ?? null, null);
      assert.deepEqual(paraliAnahtarlar(k?.deger), [], ad);
    }
  });

  test('MK-04: yazma cevabında da para yoktur; cam kaydedince eski değerler korunur, gönderdiği para alanı yok sayılır', async () => {
    const onceki = await durumOku('yonetici');
    const gonderilen = { ...OLCULER, machine: 'puma', stock: { ...OLCULER.stock, ax: 55, price: 1 }, life: { ...OLCULER.life, vc: 200, price: 2, rate: 3 } };
    const c = await durumYaz('cam', gonderilen, onceki?.surum ?? null);
    assert.equal(c.statusCode, 200, c.body);
    const cevap = (c.json() as { kayit: Kayit }).kayit;
    assert.deepEqual(paraliAnahtarlar(cevap.deger), []);
    assert.equal(cevap.deger['stock']?.['ax'], 55);
    const sonra = await durumOku('mudur');
    assert.deepEqual(sonra?.deger, { machine: 'puma', stock: { type: 'bar', ax: 55, qty: 5, price: 92.5 }, life: { vc: 200, tp: 12, uses: 3, price: 840, rate: 1750 } });
    // Para alanını hiç göndermeyen kayıt (ekranda eski değer yoktu) de kayıttakini silmez.
    const bos = await durumYaz('cam', { machine: 'puma', stock: { type: 'bar' } }, sonra?.surum ?? null);
    assert.equal(bos.statusCode, 200, bos.body);
    const son = await durumOku('muhasebe');
    assert.deepEqual([son?.deger['stock']?.['price'], son?.deger['life']?.['price'], son?.deger['life']?.['rate']], [92.5, 840, 1750]);
  });

  test('MK-05: maliyet görebilen kişi para alanını yazar; hazırlık onayı cevabı yetkisize para vermez', async () => {
    const onceki = await durumOku('mudur');
    const c = await durumYaz('mudur', { ...onceki?.deger, life: { ...onceki?.deger['life'], rate: 2000 } }, onceki?.surum ?? null);
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await durumOku('yonetici'))?.deger['life']?.['rate'], 2000);
    assert.equal((await durumOku('cam'))?.deger['life']?.['rate'], undefined);
    const guncel = await durumOku('yonetici');
    const o = await istek('onaylayan', 'POST', '/cnc-kurulum/hazirlik/onayla', { hazirlik: { done: { machine: 'x' } }, beklenenSurum: guncel?.surum });
    assert.equal(o.statusCode, 200, o.body);
    assert.deepEqual(paraliAnahtarlar((o.json() as { kayit: Kayit }).kayit.deger), []);
    assert.equal((await durumOku('yonetici'))?.deger['life']?.['rate'], 2000);
  });

  test('MK-06: yetkisiz rolün okuma cevaplarında fiyat, ücret ya da maliyet adlı dolu alan kalmaz', async () => {
    for (const ad of ['cam', 'planlama']) {
      for (const url of ['/cnc-kurulum/kayitlar', '/cnc-kurulum/hazirlik', '/cnc-kurulum/ham-analizi', '/cnc-kurulum/tezgahlar', `/cnc-kurulum/kayitlar/gecmis?anahtar=${DURUM_ANAHTARI}`]) {
        const c = await istek(ad, 'GET', url);
        assert.equal(c.statusCode, 200, `${ad} ${url} ${c.body}`);
        assert.deepEqual(paraliAnahtarlar(c.json()), [], `${ad} ${url}`);
      }
    }
  });
});
