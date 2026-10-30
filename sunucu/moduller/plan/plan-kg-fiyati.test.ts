import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { satinAlmaEkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// 1280 a, kart 1329: planın malzeme fiyatı Satın Alma'dandır. Ek, kg fiyatını tarihiyle başvuru olarak taşır; teslimi olmayan malzemede alış
// fiyatı null (sıfır uydurulmaz). Fiyat yalnız finans.maliyet-oku taşıyana dolar. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/satin-alma-eki';

describe('Planlama satın alma eki: malzeme fiyatları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cubuk = 0;
  let fiyatsiz = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }
  const oku = async (cerez: string) => {
    const c = await app.inject({ method: 'GET', url: YOL, headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return satinAlmaEkiCevabi.parse(c.json());
  };
  const kart = async (sira: number, kalite: string) => (await ortam!.sahip.tek<{ no: number }>(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'hammadde', 'PKG-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
    [`pkg-dnm-${String(sira)}`, sira, JSON.stringify({ id: `pkg-dnm-${String(sira)}`, grade: kalite, form: 'cubuk', com: { ad: `Deneme ${kalite}`, birim: 'kg' } }), yoneticiId],
  ))?.no ?? 0;

  before(async () => {
    ortam = await testVeritabaniKur('plan_kg_fiyati');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PKG-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    cubuk = await kart(1, 'DENEME-PK');
    fiyatsiz = await kart(2, 'DENEME-YOK');
  });
  after(async () => { await ortam?.kaldir(); });

  test('PKG-01: kg fiyatı tarihiyle eke gelir, teslimsiz malzemede alış fiyatı null; fiyatı hiç olmayan malzeme listede yok', async () => {
    const yonetici = await girisCerezi('yonetici');
    const bugun = (await vt().tek<{ g: string }>('SELECT current_date::text AS g'))!.g;
    const ekle = await app.inject({
      method: 'POST', url: '/api/satin-alma-kg-fiyatlari/ekle', headers: { cookie: yonetici, 'istek-kimligi': crypto.randomUUID() },
      payload: { satirlar: [{ kaliteKodu: 'DENEME-PK', form: 'cubuk', kgFiyati: '150', paraBirimi: 'TRY', gecerlilik: bugun, aciklama: '' }] },
    });
    assert.equal(ekle.statusCode, 200, ekle.body);
    const f = (await oku(yonetici)).malzemeFiyatlari;
    assert.ok(f);
    assert.deepEqual(f.find((x) => x.kod === String(cubuk)), {
      kod: String(cubuk), alisFiyati: null, teslimSayisi: 0,
      kg: { kaliteKodu: 'DENEME-PK', form: 'cubuk', gecerlilik: bugun, kgFiyati: 150, paraBirimi: 'TRY', tlKgFiyati: 150, tlBirimFiyati: 150 },
    });
    assert.equal(f.some((x) => x.kod === String(fiyatsiz)), false);
  });

  test('PKG-02: maliyeti görmeyen plan okuyucusu fiyat almaz; maliyeti gören alır', async () => {
    const planci = await oku(await islemliKisi('planci', ['recete-rota.oku', 'sayfa.malzemeler']));
    assert.equal(planci.malzemeFiyatlari, null);
    assert.ok(planci.tedarikTerminleri);
    const maliyetci = await oku(await islemliKisi('maliyetci', ['recete-rota.oku', 'sayfa.malzemeler', 'finans.maliyet-oku']));
    assert.equal(maliyetci.malzemeFiyatlari?.find((x) => x.kod === String(cubuk))?.kg?.tlBirimFiyati, 150);
  });
});
