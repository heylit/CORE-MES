import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER, talebimDuzenlenirMi, talebimKalemReddi } from './kurallar.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

describe('SAT-79 (2871-1 a): talep edenin kendi taslağını düzenlemesi (saf)', () => {
  test('izinli: yalnız taslak ve birleştirilmemiş talep düzenlenir; bağsız kalem eklenir, çıkar, miktarı değişir', () => {
    assert.equal(talebimDuzenlenirMi({ durum: 'taslak', birlesme: null }), true);
    const eski = [{ id: 'a', miktar: '2', bagli: false }, { id: 'b', miktar: '5', bagli: true }];
    assert.equal(talebimKalemReddi(eski, [{ id: 'b', miktar: '5' }, { id: null, miktar: '1' }]), null);
    assert.equal(talebimKalemReddi(eski, [{ id: 'a', miktar: '7' }, { id: 'b', miktar: '5.000' }]), null);
  });
  test('yasak: teklif istenen, onaydaki ve birleştirilmiş talep; olmayan ya da tekrar eden kalem; bağlı kalemin çıkması ya da miktarı', () => {
    for (const durum of ['teklif_isteniyor', 'degerlendirme', 'onayda', 'siparis_verildi', 'iptal'] as const) assert.equal(talebimDuzenlenirMi({ durum, birlesme: null }), false);
    assert.equal(talebimDuzenlenirMi({ durum: 'taslak', birlesme: { talepId: randomUUID(), no: 'ST-1', durum: 'taslak' } }), false);
    const eski = [{ id: 'a', miktar: '2', bagli: false }, { id: 'b', miktar: '5', bagli: true }];
    assert.equal(talebimKalemReddi(eski, [{ id: 'x', miktar: '1' }, { id: 'b', miktar: '5' }]), ILETILER.talebimKalemYok);
    assert.equal(talebimKalemReddi(eski, [{ id: 'b', miktar: '5' }, { id: 'b', miktar: '5' }]), ILETILER.talebimKalemYok);
    assert.equal(talebimKalemReddi(eski, [{ id: 'a', miktar: '2' }]), ILETILER.talebimBagliKalem);
    assert.equal(talebimKalemReddi(eski, [{ id: 'a', miktar: '2' }, { id: 'b', miktar: '6' }]), ILETILER.talebimBagliKalem);
  });
});

describe('SAT-79 (2871-1 a): POST /satin-alma-talepleri/:id/talebimi-duzenle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', talep2: '', operator: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const kisiIdleri = new Map<string, number>();
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      kisiIdleri.set(kullaniciAdi, id);
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  let kartNo = 0;
  async function talepAc(cerez = c.talep): Promise<Talebim> {
    const r = await post(cerez, '/satin-alma-talepleri/hizli-ac', {
      id: randomUUID(), aciklama: 'Deneme not', kalemler: [{ malzemeNo: kartNo, miktar: '4' }, { ad: 'Deneme eldiven', birim: 'çift', miktar: '2' }],
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as Talebim;
  }
  const duzenle = (cerez: string, t: Talebim, ek: Record<string, unknown> = {}) => post(cerez, `/satin-alma-talepleri/${t.id}/talebimi-duzenle`, {
    surum: t.surum, ihtiyacTarihi: '2026-12-01', aciklama: 'Deneme yeni not',
    kalemler: [{ id: t.kalemler[0]!.id, miktar: '6', aciklama: 'Deneme ölçü' }, { ad: 'Deneme maske', birim: 'adet', miktar: '10' }], ...ek,
  });

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_talebim_duzenle');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    c.talep2 = await rolluKisi('bakim', 'bakim');
    c.operator = await rolluKisi('operator', 'operator');
    assert.equal((await post(c.yonetici, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })).statusCode, 200);
    const kimlik = 'td-kart-1';
    const r = await post(c.yonetici, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1001 }, com: { kod: 'HM-TDA-00001', ad: 'Deneme çubuk', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: `hammadde|talebim-duzenle|${kimlik}`, mukerrer_gerekcesi: null, birim_agirlik_kg: 2.5 }, surum: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    kartNo = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = 'HM-TDA-00001'"))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('uç tanımı: var olan talep-ac işlemi, yeni işlem yok', () => {
    const u = uclar.find((x) => x.yol === '/satin-alma-talepleri/:id/talebimi-duzenle')!;
    assert.equal(u.yetki, 'satin-alma.talep-ac');
  });

  test('izinli: sahibi taslağını düzenler; kalemin kartı korunur, miktar ve açıklama değişir, kalem eklenir ve çıkar; cevap fiyatsız, Taleplerim aynı', async () => {
    const t = await talepAc();
    assert.equal(t.duzenlenebilir, true);
    const r = await duzenle(c.talep, t);
    assert.equal(r.statusCode, 200, r.body);
    const d = r.json() as Talebim;
    assert.deepEqual(d.kalemler.map((k) => [k.ad, k.miktar, k.birim, k.aciklama, k.kartBekliyor]),
      [['Deneme çubuk', '6', 'adet', 'Deneme ölçü', false], ['Deneme maske', '10', 'adet', '', true]]);
    assert.deepEqual([d.ihtiyacTarihi?.slice(0, 10), d.aciklama, d.durum, d.surum! > t.surum!], ['2026-12-01', 'Deneme yeni not', 'taslak', true]);
    assert.deepEqual(d.kalemler[0]!.karsilik, { miktar: '15', birim: 'kg' });
    assert.doesNotMatch(JSON.stringify(d), /"birimFiyat"|"teklifler"|"karar"|"tedarikci/);
    const liste = JSON.parse((await app.inject({ method: 'GET', url: '/api/satin-alma-taleplerim', headers: { cookie: c.talep } })).body) as TaleplerimCevabi;
    assert.deepEqual(liste.talepler.find((x) => x.id === t.id)?.kalemler.map((k) => k.miktar), ['6', '10']);
  });

  test('yasak: başkasının talebi 403, yetkisiz 403, kimliksiz 401; kayıt değişmez', async () => {
    const t = await talepAc();
    const baskasi = await duzenle(c.talep2, t);
    assert.equal(baskasi.statusCode, 403);
    assert.equal((baskasi.json() as { mesaj: string }).mesaj, ILETILER.talebimSahibiDegil);
    assert.equal((await duzenle(c.operator, t)).statusCode, 403);
    assert.equal((await duzenle('', t)).statusCode, 401);
    const satir = await ortam!.sahip.tek<{ surum: number }>('SELECT surum FROM satin_alma_talep WHERE id = $1', [t.id]);
    assert.equal(satir!.surum, t.surum);
  });

  test('yasak: teklif istenen talep 422 (aşama dışı), eski sürüm 409, olmayan kalem 422', async () => {
    const t = await talepAc();
    assert.equal((await duzenle(c.talep, t, { kalemler: [{ id: randomUUID(), miktar: '1' }] })).statusCode, 422);
    const ilk = await duzenle(c.talep, t);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal((await duzenle(c.talep, t)).statusCode, 409);
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'teklif_isteniyor' WHERE id = $1", [t.id]);
    const yeni = ilk.json() as Talebim;
    const red = await duzenle(c.talep, yeni);
    assert.equal(red.statusCode, 422, red.body);
    assert.equal((red.json() as { mesaj: string }).mesaj, ILETILER.talebimDuzenlenmez);
    const liste = JSON.parse((await app.inject({ method: 'GET', url: '/api/satin-alma-taleplerim', headers: { cookie: c.talep } })).body) as TaleplerimCevabi;
    assert.equal(liste.talepler.find((x) => x.id === t.id)?.duzenlenebilir, false);
  });

  test('izinli: başkası adına açılan talebi talep eden de açan da düzenler', async () => {
    const t = await talepAc();
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep SET talep_eden_kisi_id = $2 WHERE id = $1', [t.id, kisiIdleri.get('bakim')]);
    const r = await duzenle(c.talep2, t);
    assert.equal(r.statusCode, 200, r.body);
    const r2 = await duzenle(c.talep, r.json() as Talebim, { aciklama: 'Deneme açan notu' });
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal((r2.json() as Talebim).aciklama, 'Deneme açan notu');
  });

  test('yasak: bağlı kalem (uygulanacak malzeme ya da iş emri) çıkmaz ve miktarı değişmez; açıklaması değişir', async () => {
    const t = await talepAc();
    const bagli = t.kalemler[0]!.id!;
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET uygulanan_malzeme_no = $2 WHERE id = $1', [bagli, kartNo]);
    const miktar = await duzenle(c.talep, t);
    assert.equal(miktar.statusCode, 422, miktar.body);
    assert.equal((miktar.json() as { mesaj: string }).mesaj, ILETILER.talebimBagliKalem);
    const cikar = await duzenle(c.talep, t, { kalemler: [{ id: t.kalemler[1]!.id, miktar: '2' }] });
    assert.equal(cikar.statusCode, 422, cikar.body);
    assert.equal((cikar.json() as { mesaj: string }).mesaj, ILETILER.talebimBagliKalem);
    const not = await duzenle(c.talep, t, { kalemler: [{ id: bagli, miktar: '4', aciklama: 'Deneme ölçü' }, { id: t.kalemler[1]!.id, miktar: '2' }] });
    assert.equal(not.statusCode, 200, not.body);
  });
});
