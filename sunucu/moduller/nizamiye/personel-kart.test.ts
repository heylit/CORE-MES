import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PersonelKart, PersonelKartlariCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { personelKartSahibi } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('nizamiye personel kartı (1326, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let pdksci = '';
  let kartci = '';
  let kisiA = 0;
  let kisiB = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const oku = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez } });

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    const id = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, kisi, rol!.id);
      for (const r of k.roller) if (r.id !== rol!.id) await rolAl(db, yoneticiId, kisi, r.id);
      return kisi;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  const liste = async (): Promise<PersonelKartlariCevabi> => (await oku(pdksci, '/nizamiye/personel-kartlari')).json();

  before(async () => {
    ortam = await testVeritabaniKur('nizamiye_pk');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    pdksci = (await islemliKisi('pdksci', ['nizamiye.pdks-aktar'])).cerez;
    kartci = (await islemliKisi('kartci', ['sayfa.nizamiye', 'nizamiye.oku', 'nizamiye.kart-yonet'])).cerez;
    kisiA = (await islemliKisi('isci_a', ['sayfa.mesaj'])).id;
    kisiB = (await islemliKisi('isci_b', ['sayfa.mesaj'])).id;
  });

  after(async () => { await ortam?.kaldir(); });

  test('PDKS aktaran kart kaydeder; başka yetki okuyamaz ve yazamaz; numara düz saklanmaz ve denetim kaydına girmez', async () => {
    assert.equal((await oku(kartci, '/nizamiye/personel-kartlari')).statusCode, 403);
    assert.equal((await yaz(kartci, '/nizamiye/personel-kartlari', { kisiId: kisiA, kartNo: '0004123456' })).statusCode, 403);

    assert.ok((await liste()).kisiler.some((k) => k.id === kisiA));
    const cevap = await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiA, kartNo: ' 0004123456 ' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const kart: PersonelKart = cevap.json();
    assert.equal(kart.kisiId, kisiA);
    assert.equal(kart.kartSon4, '3456');
    assert.equal(kart.kisiAd, 'Deneme isci_a');
    const l = await liste();
    assert.ok(l.kartlar.some((k) => k.id === kart.id));
    assert.ok(!l.kisiler.some((k) => k.id === kisiA), 'kartı olan kişi seçeneklerde görünmez');

    const ham = await ortam!.sahip.sorgu<{ kart_ozeti: string }>('SELECT kart_ozeti FROM nizamiye_personel_kart');
    assert.ok(ham.every((s) => !s.kart_ozeti.includes('4123456')));
    const kayit = await ortam!.sahip.tek<{ govde: unknown }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/nizamiye/personel-kartlari' ORDER BY id DESC LIMIT 1");
    assert.doesNotMatch(JSON.stringify(kayit?.govde), /4123456/);
  });

  test('aynı kart ikinci kişiye, ikinci kart aynı kişiye verilmez; biçimsiz numara ve etkin olmayan kişi reddedilir', async () => {
    const ilk = await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiB, kartNo: 'a1b2c3d4' });
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiA, kartNo: 'A1B2C3D4' })).statusCode, 409);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiB, kartNo: '99887766' })).statusCode, 409);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiB, kartNo: 'kart-12' })).statusCode, 400);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: 2147483000, kartNo: '11223344' })).statusCode, 400);
  });

  test('kart sahibi kayıtlı karttan bulunur; kaldırılan kart kimseyi bulmaz, eski sürümle kaldırılmaz, yeniden verilebilir', async () => {
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '0004123456')), kisiA);
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '4123456')), null, 'okuyucunun yazdığı numara olduğu gibi eşleşir');
    assert.equal(await vt().tx((db) => personelKartSahibi(db, 'zz')), null);
    const kart = (await liste()).kartlar.find((k) => k.kisiId === kisiA)!;
    assert.equal((await yaz(pdksci, `/nizamiye/personel-kartlari/${String(kart.id)}/kaldir`, { surum: kart.surum + 1 })).statusCode, 409);
    assert.equal((await yaz(kartci, `/nizamiye/personel-kartlari/${String(kart.id)}/kaldir`, { surum: kart.surum })).statusCode, 403);
    const kaldir = await yaz(pdksci, `/nizamiye/personel-kartlari/${String(kart.id)}/kaldir`, { surum: kart.surum });
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    assert.equal((await yaz(pdksci, `/nizamiye/personel-kartlari/${String(kart.id)}/kaldir`, { surum: kart.surum + 1 })).statusCode, 404);
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '0004123456')), null);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiA, kartNo: '0004123456' })).statusCode, 200);
  });
});
