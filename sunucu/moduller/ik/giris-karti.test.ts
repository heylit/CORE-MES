import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { GirisKartiCevabi } from '#paylasilan/sozlesme/ik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { personelKartSahibi } from '../nizamiye/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 1902 b, 1903 b: personel giriş kartını yalnız İK personel yazan verir; Nizamiye'de bu yol kalmaz. Kişi ve kart numaraları uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('İK personel giriş kartı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let ikci = '';
  let pdksci = '';
  let kisiA = 0;
  let kisiB = 0;
  let uzaktaki = 0;
  let personelsiz = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const oku = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string, url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, payload, headers: { cookie: cerez } });

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    const id = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, kisi, rol!.id);
      for (const r of k.roller) if (r.id !== rol!.id) await rolAl(db, yoneticiId, kisi, r.id);
      return kisi;
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return { cerez: String(cevap.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const personelKaydi = (kimlik: string, kisiId: number, isMerkeziId: number) => vt().sorgu(
    `INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'Ad', 'Deneme', $2, $3, $4, $4)`, [kimlik, kisiId, isMerkeziId, yoneticiId]);

  before(async () => {
    ortam = await testVeritabaniKur('ik_giris_karti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const [im1, im2] = (await vt().sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GKM1', 'Merkez 1'), ('GKM2', 'Merkez 2') RETURNING id")).map((m) => m.id);
    const ik = await islemliKisi('ikci', ['sayfa.ik', 'ik.oku', 'ik.personel-yaz']);
    ikci = ik.cerez;
    await vt().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [ik.id, im1]);
    pdksci = (await islemliKisi('pdksci', ['sayfa.nizamiye', 'nizamiye.oku', 'nizamiye.pdks-aktar', 'nizamiye.kart-yonet', 'ik.oku'])).cerez;
    kisiA = (await islemliKisi('isci_a', ['sayfa.mesaj'])).id;
    kisiB = (await islemliKisi('isci_b', ['sayfa.mesaj'])).id;
    uzaktaki = (await islemliKisi('isci_c', ['sayfa.mesaj'])).id;
    personelsiz = (await islemliKisi('isci_d', ['sayfa.mesaj'])).id;
    await personelKaydi('emp_gk_a', kisiA, im1!);
    await personelKaydi('emp_gk_b', kisiB, im1!);
    await personelKaydi('emp_gk_c', uzaktaki, im2!);
  });

  after(async () => { await ortam?.kaldir(); });

  test('İK personel yazan kartı verir; numara düz saklanmaz, cevapta ve denetim kaydında görünmez', async () => {
    assert.deepEqual((await oku(ikci, `/ik/giris-karti/${String(kisiA)}`)).json(), { kart: null });
    const cevap = await yaz(ikci, `/ik/giris-karti/${String(kisiA)}`, { kartNo: ' 0004123456 ' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const { kart } = cevap.json<GirisKartiCevabi>();
    assert.equal(kart?.kartSon4, '3456');
    assert.doesNotMatch(cevap.body, /4123456/);
    assert.equal((await oku(ikci, `/ik/giris-karti/${String(kisiA)}`)).json<GirisKartiCevabi>().kart?.surum, kart?.surum);
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '0004123456')), kisiA);

    const ham = await ortam!.sahip.sorgu<{ kart_ozeti: string }>('SELECT kart_ozeti FROM nizamiye_personel_kart');
    assert.ok(ham.every((s) => !s.kart_ozeti.includes('4123456')));
    const kayit = await ortam!.sahip.sorgu<{ govde: unknown }>("SELECT govde FROM denetim_kaydi WHERE yol LIKE '/ik/giris-karti/%'");
    assert.ok(kayit.length > 0);
    assert.doesNotMatch(JSON.stringify(kayit), /4123456/);
  });

  test('Nizamiye kartı veremez: eski yol yok, PDKS ve kart yöneten İK yolunu kullanamaz', async () => {
    assert.equal((await oku(pdksci, '/nizamiye/personel-kartlari')).statusCode, 404);
    assert.equal((await yaz(pdksci, '/nizamiye/personel-kartlari', { kisiId: kisiB, kartNo: '11223344' })).statusCode, 404);
    assert.equal((await oku(pdksci, `/ik/giris-karti/${String(kisiB)}`)).statusCode, 403);
    assert.equal((await yaz(pdksci, `/ik/giris-karti/${String(kisiB)}`, { kartNo: '11223344' })).statusCode, 403);
    assert.equal((await yaz(pdksci, `/ik/giris-karti/${String(kisiA)}/kaldir`, { surum: 1 })).statusCode, 403);
    assert.deepEqual((await oku(ikci, `/ik/giris-karti/${String(kisiB)}`)).json(), { kart: null });
  });

  test('aynı kart ikinci kişiye, ikinci kart aynı kişiye verilmez; biçimsiz numara, İK kaydı olmayan ve kapsam dışı kişi reddedilir', async () => {
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiB)}`, { kartNo: '0004123456' })).statusCode, 409);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiA)}`, { kartNo: '99887766' })).statusCode, 409);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiB)}`, { kartNo: 'kart-12' })).statusCode, 400);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiB)}`, { kartNo: '11223344', kisiId: kisiA })).statusCode, 400);
    const yok = await yaz(ikci, `/ik/giris-karti/${String(personelsiz)}`, { kartNo: '11223344' });
    assert.equal(yok.statusCode, 404);
    assert.match(yok.json().mesaj, /İK personel kaydı yok/);
    assert.equal((await oku(ikci, `/ik/giris-karti/${String(uzaktaki)}`)).statusCode, 403);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(uzaktaki)}`, { kartNo: '11223344' })).statusCode, 403);
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '11223344')), null);
  });

  test('kart eski sürümle kaldırılmaz; kaldırılan kart kimseyi bulmaz ve yeniden verilebilir', async () => {
    const { kart } = (await oku(ikci, `/ik/giris-karti/${String(kisiA)}`)).json<GirisKartiCevabi>();
    assert.ok(kart);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiA)}/kaldir`, { surum: kart.surum + 1 })).statusCode, 409);
    const kaldir = await yaz(ikci, `/ik/giris-karti/${String(kisiA)}/kaldir`, { surum: kart.surum });
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    assert.deepEqual(kaldir.json(), { kart: null });
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiA)}/kaldir`, { surum: kart.surum })).statusCode, 404);
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '0004123456')), null);
    assert.equal((await yaz(ikci, `/ik/giris-karti/${String(kisiB)}`, { kartNo: '0004123456' })).statusCode, 200);
  });
});
