import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MalzemeSecenekleriCevabi, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { birimKarsiligi, birimFiyati, kalemKarsiligi, parcaKarsiligi, stokBirimiBasinaKg } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('SAT-78 (2871): kalemin kg ile stok birimi karşılığı (saf)', () => {
  const adetli = { stokBirimi: 'adet', birimKg: 2.5 };
  test('izinli: stok biriminde girilen miktar kg olur; kg girilen miktar stok birimine çevrilir; birim adı büyük-küçük harf duyarsız', () => {
    assert.deepEqual(birimKarsiligi('4', 'adet', adetli), { miktar: '10', birim: 'kg' });
    assert.deepEqual(birimKarsiligi('10', 'KG', adetli), { miktar: '4', birim: 'adet' });
    assert.deepEqual(birimKarsiligi('3', 'rulo', { stokBirimi: 'rulo', birimKg: 12.5 }), { miktar: '37.5', birim: 'kg' });
  });
  test('yasak: ağırlık bilinmiyor, kart yok, miktar yok, stok birimi kg ya da kalem başka birimde ise karşılık uydurulmaz', () => {
    assert.equal(birimKarsiligi('4', 'adet', { stokBirimi: 'adet', birimKg: null }), null);
    assert.equal(birimKarsiligi('4', 'adet', { stokBirimi: 'adet', birimKg: 0 }), null);
    assert.equal(birimKarsiligi('4', 'adet', undefined), null);
    assert.equal(birimKarsiligi(null, 'adet', adetli), null);
    assert.equal(birimKarsiligi('4', 'kg', { stokBirimi: 'kg', birimKg: 1 }), null);
    assert.equal(birimKarsiligi('4', 'paket', adetli), null);
    assert.equal(birimKarsiligi('4', 'adet', { stokBirimi: null, birimKg: 2 }), null);
  });
  test('yasak: birim ağırlık parça başınadır; uzunluk ya da alan stoklu kartta (m, mm, m², m2) karşılık yok', () => {
    for (const b of ['m', 'M', 'mm', 'metre', 'm²', 'm2']) {
      assert.equal(birimKarsiligi('1.5', b, { stokBirimi: b, birimKg: 2.466 }), null, b);
      assert.equal(birimKarsiligi('10', 'kg', { stokBirimi: b, birimKg: 2.466 }), null, b);
    }
  });
});

describe('3100: kg stoklu hammaddede kg miktarın parça (adet) karşılığı (saf)', () => {
  const cubuk = { stokBirimi: 'kg', birimKg: 2.5 };
  test('izinli: kg stoklu kartta kg kalem parça ağırlığına bölünür; birim adı büyük-küçük harf duyarsız', () => {
    assert.deepEqual(parcaKarsiligi('10', 'kg', cubuk), { miktar: '4', birim: 'adet' });
    assert.deepEqual(parcaKarsiligi('11', 'KG', { stokBirimi: 'Kg', birimKg: 2.5 }), { miktar: '4.4', birim: 'adet' });
    assert.deepEqual(kalemKarsiligi('10', 'kg', cubuk), { miktar: '4', birim: 'adet' });
  });
  test('yasak: ağırlık yok ya da sıfır, kart yok, miktar yok, kalem kg değil ya da stok birimi kg değil ise parça karşılığı yok', () => {
    assert.equal(parcaKarsiligi('10', 'kg', { stokBirimi: 'kg', birimKg: null }), null);
    assert.equal(parcaKarsiligi('10', 'kg', { stokBirimi: 'kg', birimKg: 0 }), null);
    assert.equal(parcaKarsiligi('10', 'kg', undefined), null);
    assert.equal(parcaKarsiligi(null, 'kg', cubuk), null);
    assert.equal(parcaKarsiligi('10', 'adet', cubuk), null);
    assert.equal(parcaKarsiligi('10', 'kg', { stokBirimi: null, birimKg: 2.5 }), null);
    assert.equal(parcaKarsiligi('10', 'kg', { stokBirimi: 'm', birimKg: 2.5 }), null);
  });
  test('kalemKarsiligi adet stoklu kartta SAT-78 karşılığını değiştirmez', () => {
    assert.deepEqual(kalemKarsiligi('4', 'adet', { stokBirimi: 'adet', birimKg: 2.5 }), { miktar: '10', birim: 'kg' });
  });
  test('2891-1 korunur: kg stoklu kartta stok birimi başına kg 1, birim fiyat kg fiyatıdır (parça ağırlığı fiyata girmez)', () => {
    assert.equal(stokBirimiBasinaKg('kg', 2.5), 1);
    assert.equal(birimFiyati('100', 'kg', 2.5), birimFiyati('100', 'kg', null));
  });
});

describe('SAT-78 (2871): Taleplerim ve kart seçeneklerinde kg karşılığı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  async function kartAc(sira: number, ad: string, birim: string, birimKg: number | null): Promise<number> {
    const kimlik = `bk-kart-${sira}`;
    const r = await post(c.yonetici, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira }, com: { kod: `HM-BKA-0000${sira}`, ad, birim }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: `hammadde|birim-karsiligi|${kimlik}`, mukerrer_gerekcesi: null, birim_agirlik_kg: birimKg }, surum: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    return (await ortam!.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = $1", [`HM-BKA-0000${sira}`]))!.no;
  }

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_birim_karsiligi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    assert.equal((await post(c.yonetici, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })).statusCode, 200);
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: ağırlığı bilinen kartlı kalem karşılığıyla gelir; kart seçeneği stok birimi ve birim ağırlığı taşır', async () => {
    const agirlikli = await kartAc(1, 'Deneme çubuk', 'adet', 2.5);
    const secenek = await get(c.talep, '/satin-alma-malzeme-secenekleri?ara=HM-BKA-00001');
    assert.equal(secenek.statusCode, 200, secenek.body);
    const s = (secenek.json() as MalzemeSecenekleriCevabi).malzemeler.find((x) => x.no === agirlikli);
    assert.deepEqual([s?.stokBirimi, s?.birimKg], ['adet', 2.5]);
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: agirlikli, miktar: '4' }] });
    assert.equal(acilan.statusCode, 200, acilan.body);
    const liste = (await get(c.talep, '/satin-alma-taleplerim')).json() as TaleplerimCevabi;
    assert.deepEqual(liste.talepler[0]?.kalemler.map((k) => k.karsilik), [{ miktar: '10', birim: 'kg' }]);
    assert.doesNotMatch(JSON.stringify(liste), /"birimFiyat"|"teklifler"|"karar"|"kgFiyati"/);
  });

  test('yasak: ağırlığı bilinmeyen kartta ve kartsız kalemde karşılık boştur', async () => {
    const agirliksiz = await kartAc(2, 'Deneme levha', 'adet', null);
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', {
      id: randomUUID(), kalemler: [{ malzemeNo: agirliksiz, miktar: '3' }, { ad: 'Deneme kartsız', birim: 'adet', miktar: '2' }],
    });
    assert.equal(acilan.statusCode, 200, acilan.body);
    assert.deepEqual((acilan.json() as TaleplerimCevabi['talepler'][number]).kalemler.map((k) => k.karsilik), [null, null]);
  });

  test('3100 izinli: kg stoklu çubukta kg kalem adet karşılığıyla gelir (Taleplerim ve satın alma merkezi); seçenek hammadde olduğunu söyler', async () => {
    const cubuk = await kartAc(3, 'Deneme kg çubuk', 'kg', 2.5);
    const s = ((await get(c.talep, '/satin-alma-malzeme-secenekleri?ara=HM-BKA-00003')).json() as MalzemeSecenekleriCevabi).malzemeler.find((x) => x.no === cubuk);
    assert.deepEqual([s?.stokBirimi, s?.birimKg, s?.hammadde], ['kg', 2.5, true]);
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: cubuk, miktar: '10' }] });
    assert.equal(acilan.statusCode, 200, acilan.body);
    const talep = acilan.json() as TaleplerimCevabi['talepler'][number];
    assert.deepEqual(talep.kalemler.map((k) => k.karsilik), [{ miktar: '4', birim: 'adet' }]);
    const acilis = await get(c.yonetici, '/satin-alma-acilis');
    assert.equal(acilis.statusCode, 200, acilis.body);
    const merkez = (acilis.json() as { talepler: { id: string; kalemKarsiliklari?: { miktar: string; birim: string }[] }[] }).talepler.find((t) => t.id === talep.id);
    assert.deepEqual(merkez?.kalemKarsiliklari?.map((k) => [k.miktar, k.birim]), [['4', 'adet']]);
  });

  test('3100 yasak: kg stoklu kartta parça ağırlığı yoksa adet karşılığı yoktur (uydurulmaz)', async () => {
    const levha = await kartAc(4, 'Deneme kg levha', 'kg', null);
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: levha, miktar: '10' }] });
    assert.equal(acilan.statusCode, 200, acilan.body);
    assert.deepEqual((acilan.json() as TaleplerimCevabi['talepler'][number]).kalemler.map((k) => k.karsilik), [null]);
  });
});
