import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Proje, ProjeListesiCevabi, SiparisProjeleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { projeAdlari, projeGetir, projeKoduIleBul, projeNo, projeSecenekleri, siparisinProjeleri, siparistenProjeAc } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('projeler (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let maliyetsizYazar = '';
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(rolKodu: string | null, yoneticiId: number | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `proje-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yoneticiId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  // Finans firma ekleme tekrar korumalıdır; her POST kendi istek kimliğiyle gider.
  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  // 224: yeni proje onaylı siparişle açılır; konusu sipariş olmayan testler ortak siparişi kullanır.
  let ortakSiparis = 0;
  async function ortak(): Promise<number> {
    if (ortakSiparis === 0) ortakSiparis = (await siparisAc(await firmaAc('Deneme Müşteri Ortak'), true)).id;
    return ortakSiparis;
  }
  async function projeAc(govde: Record<string, unknown>): Promise<Proje> {
    const c = await gonder(yonetici, '/projeler', { siparisId: await ortak(), ...govde });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<Proje>();
  }
  // 224 öncesi açılmış siparişsiz proje: bugün yalnız veritabanında var olabilir.
  async function eskiProjeAc(kod: string, ad: string, firmaId: number | null = null): Promise<Proje> {
    const satir = await vt().tek<{ id: number }>(
      'INSERT INTO projeler_proje (kod, ad, firma_id, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [kod, ad, firmaId, yoneticiId],
    );
    return (await oku(yonetici, `/projeler/${satir?.id ?? 0}`)).json<Proje>();
  }
  const guncelle = (p: Proje, degisen: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    gonder(yonetici, `/projeler/${p.id}/guncelle`, {
      ad: p.ad, firmaId: p.firmaId, baslangic: p.baslangic, bitis: p.bitis, aciklama: p.aciklama, durum: p.durum, surum: p.surum, ...degisen,
    });
  async function firmaAc(ad: string): Promise<number> {
    const c = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'musteri' });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<{ firma: { id: number } }>().firma.id;
  }
  async function firmaPasif(id: number): Promise<void> {
    const f = (await oku(yonetici, `/musteri-tedarikci/firmalar/${id}`)).json<{ firma: { surum: number } }>();
    assert.equal((await gonder(yonetici, `/finans/firmalar/${id}/pasif`, { surum: f.firma.surum })).statusCode, 200);
  }

  // Sipariş Siparişler'in uçlarıyla açılır ve onaylanır; malzeme kartı doğrudan yazılır (kart açılışı bu testin konusu değil).
  async function mamulAc(): Promise<number> {
    if (!ortam) throw new Error('Test veritabanı yok');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PRJ-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kimlik = `prj-dnm-${(sayac += 1)}`;
    const satir = await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'PRJ-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme mamul' } }), yoneticiId],
    );
    return satir?.no ?? 0;
  }
  async function siparisAc(firmaId: number, onayla: boolean): Promise<SiparisAyrintisi> {
    const c = await gonder(yonetici, '/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: await mamulAc(), miktar: '10', birimFiyat: '1', termin: null, aciklama: null }],
    });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<SiparisAyrintisi>();
    if (!onayla) return s;
    const o = await gonder(yonetici, `/siparisler/${s.id}/onayla`, { surum: s.surum });
    assert.equal(o.statusCode, 200, o.body);
    return o.json<SiparisAyrintisi>();
  }
  const siparistenAc = (cerez: string, siparisId: number, govde: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    gonder(cerez, `/projeler/siparisten/${siparisId}/ac`, govde);

  before(async () => {
    ortam = await testVeritabaniKur('projeler');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null, null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    operator = (await girisYap('operator', y.id)).cerez;
    // Projeyi yazan ama maliyet görmeyen rol (180): bugün böyle yerleşik rol yok, test kendi rolünü açar.
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('prj_maliyetsiz', 'Deneme proje yazarı') RETURNING id");
    for (const islem of ['sayfa.projeler', 'projeler.yaz']) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    maliyetsizYazar = (await girisYap('prj_maliyetsiz', y.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: yönetici açar ve listeler; sayfası olmayan rol 403 alır ve kayıt açılmaz; girişsiz 401', async () => {
    const p = await projeAc({ kod: 'YT.01', ad: 'Yetki projesi' });
    assert.equal((await oku(yonetici, '/projeler')).statusCode, 200);
    assert.equal((await oku(yonetici, `/projeler/${p.id}`)).statusCode, 200);
    assert.equal((await oku(operator, '/projeler')).statusCode, 403);
    assert.equal((await oku(operator, `/projeler/${p.id}`)).statusCode, 403);
    assert.equal((await oku(operator, '/projeler/firma-secenekleri')).statusCode, 403);
    const once = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_proje');
    assert.equal((await gonder(operator, '/projeler', { kod: 'YT.02', ad: 'Yetkisiz', siparisId: await ortak() })).statusCode, 403);
    assert.equal((await gonder(operator, `/projeler/${p.id}/guncelle`, { ad: 'X', durum: 'aktif', surum: p.surum })).statusCode, 403);
    assert.deepEqual(await vt().tek('SELECT count(*)::int AS n FROM projeler_proje'), once);
    assert.equal((await app.inject({ method: 'GET', url: '/api/projeler' })).statusCode, 401);
  });

  test('PRJ-01 kod büyük harfe çevrilir; tire, boşluk ve 24 karakteri aşan kod reddedilir', async () => {
    const p = await projeAc({ kod: ' ab.12_x ', ad: 'Biçim projesi' });
    assert.equal(p.kod, 'AB.12_X');
    for (const kod of ['AB-12', 'A B', 'A'.repeat(25), '', 'ÇAĞ']) {
      assert.equal((await gonder(yonetici, '/projeler', { kod, ad: 'Ret', siparisId: await ortak() })).statusCode, 400, kod);
    }
    await assert.rejects(vt().tx((db) => db.sorgu(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) SELECT 'a-b', 'Doğrudan', id FROM kisi LIMIT 1",
    )), /projeler_proje_kod_bicim/);
  });

  test('PRJ-02 kod tekildir: ikinci açılış 409 ve alanı gösterir', async () => {
    await projeAc({ kod: 'TEK.1', ad: 'İlk' });
    const c = await gonder(yonetici, '/projeler', { kod: 'tek.1', ad: 'İkinci', siparisId: await ortak() });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Bu proje kodu kullanılıyor.');
  });

  test('PRJ-03 kod açıldıktan sonra değişmez: güncelleme gövdesindeki kod yok sayılır, doğrudan yazma reddedilir', async () => {
    const p = await projeAc({ kod: 'SABIT.1', ad: 'Sabit' });
    const c = await guncelle(p, { kod: 'BASKA.1', ad: 'Sabit 2' });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual([c.json<Proje>().kod, c.json<Proje>().ad], ['SABIT.1', 'Sabit 2']);
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE projeler_proje SET kod = 'BASKA.2' WHERE id = $1", [p.id])), /değişmez/);
    await vt().tx((db) => db.sorgu("UPDATE projeler_proje SET ad = 'Ad değişir' WHERE id = $1", [p.id]));
  });

  test('PRJ-04 bitiş başlangıçtan önce olamaz (uçta ve veritabanında); aynı gün ve sonrası kabul', async () => {
    const c = await gonder(yonetici, '/projeler', { kod: 'TRH.1', ad: 'Tarih', baslangic: '2026-11-10', bitis: '2026-11-09', siparisId: await ortak() });
    assert.equal(c.statusCode, 400, c.body);
    const p = await projeAc({ kod: 'TRH.2', ad: 'Tarih', baslangic: '2026-11-10', bitis: '2026-11-10' });
    assert.equal((await guncelle(p, { bitis: '2026-11-01' })).statusCode, 400);
    assert.equal((await guncelle(p, { bitis: '2026-12-01' })).statusCode, 200);
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE projeler_proje SET bitis = '2026-01-01' WHERE id = $1", [p.id])), /projeler_proje_tarih_sirasi/);
  });

  test('PRJ-05 siparişsiz eski projede firma finanstan: olmayan ve pasif firma seçilemez; bağlı firma pasifleşse de proje onda kalır', async () => {
    const firma = await firmaAc('Deneme Müşteri A');
    const p = await eskiProjeAc('FRM.1', 'Firmalı', firma);
    assert.deepEqual([p.firmaId, p.firmaAd], [firma, 'Deneme Müşteri A']);
    const olmayan = await guncelle(p, { firmaId: 999999 });
    assert.deepEqual([olmayan.statusCode, olmayan.json().mesaj], [400, 'Firma bulunamadı.']);
    const baska = await firmaAc('Deneme Müşteri A2');
    await firmaPasif(baska);
    const pasif = await guncelle(p, { firmaId: baska });
    assert.deepEqual([pasif.statusCode, pasif.json().mesaj], [400, 'Pasif firma projeye seçilemez.']);
    await firmaPasif(firma);
    assert.equal((await guncelle(p, { ad: 'Firmalı 2' })).statusCode, 200, 'mevcut bağ kalır');
    const secenek = (await oku(yonetici, '/projeler/firma-secenekleri?ara=Deneme')).json<{ firmalar: { id: number }[] }>();
    assert.ok(!secenek.firmalar.some((f) => f.id === firma), 'pasif firma seçicide yok');
  });

  test('PRJ-06 sürüm: eski sürümle güncelleme 409, kayıt değişmez; olmayan proje 404', async () => {
    const p = await projeAc({ kod: 'SRM.1', ad: 'Sürüm' });
    assert.equal((await guncelle(p, { ad: 'Birinci' })).statusCode, 200);
    const eski = await guncelle(p, { ad: 'İkinci' });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal((await oku(yonetici, `/projeler/${p.id}`)).json<Proje>().ad, 'Birinci');
    assert.equal((await gonder(yonetici, '/projeler/999999/guncelle', { ad: 'X', durum: 'aktif', surum: 1 })).statusCode, 404);
  });

  test('liste: arama kod ve adda, durum süzgeci, sayfalı cevap; açan ve zaman sunucudan', async () => {
    const p = await projeAc({ kod: 'LST.1', ad: 'Listelenen gövde' });
    await projeAc({ kod: 'LST.2', ad: 'Kapanacak' }).then((k) => guncelle(k, { durum: 'tamamlandi' }));
    const ara = (await oku(yonetici, '/projeler?ara=listelenen')).json<ProjeListesiCevabi>();
    assert.deepEqual(ara.satirlar.map((s) => s.kod), ['LST.1']);
    const tamam = (await oku(yonetici, '/projeler?ara=LST&durum=tamamlandi')).json<ProjeListesiCevabi>();
    assert.deepEqual(tamam.satirlar.map((s) => s.kod), ['LST.2']);
    assert.equal(tamam.toplam, 1);
    const kayit = await vt().tek<{ olusturan_id: number }>('SELECT olusturan_id FROM projeler_proje WHERE id = $1', [p.id]);
    assert.ok((kayit?.olusturan_id ?? 0) > 0);
    assert.match(p.olusturma, /T\d{2}:\d{2}/);
    assert.equal((await oku(yonetici, '/projeler?ara=%25')).json<ProjeListesiCevabi>().toplam, 0, 'joker karakter metin gibi aranır');
  });

  test('disari.ts: kod, özet, seçenekler (varsayılan yalnız aktif) ve adlar', async () => {
    const a = await projeAc({ kod: 'DIS.A', ad: 'Dış A' });
    const b = await eskiProjeAc('DIS.B', 'Dış B');
    await guncelle(b, { durum: 'iptal' });
    await vt().tx(async (db) => {
      assert.equal(await projeNo(db, a.id), 'DIS.A');
      assert.equal(await projeNo(db, 999999), null);
      assert.deepEqual(await projeGetir(db, b.id), {
        id: b.id, kod: 'DIS.B', ad: 'Dış B', durum: 'iptal', firmaId: null, siparisId: null, butceTutari: null, butceParaBirimi: null,
      });
      assert.equal(await projeGetir(db, 999999), null);
      assert.equal((await projeKoduIleBul(db, ' dis.a '))?.id, a.id);
      assert.equal(await projeKoduIleBul(db, 'dis-a'), null);
      const aktifler = (await projeSecenekleri(db)).map((p) => p.kod);
      assert.ok(aktifler.includes('DIS.A') && !aktifler.includes('DIS.B'));
      assert.ok((await projeSecenekleri(db, { yalnizAktif: false })).some((p) => p.kod === 'DIS.B'));
      const adlar = await projeAdlari(db, [a.id, a.id, 999999]);
      assert.deepEqual([...adlar], [[a.id, 'Dış A']]);
      assert.equal((await projeAdlari(db, [])).size, 0);
    });
  });

  test('PRJ-07 proje onaylı siparişten açılır: firma siparişten gelir, bağ kaydedilir; taslak sipariş 400, olmayan 404', async () => {
    const firma = await firmaAc('Deneme Müşteri S');
    const onayli = await siparisAc(firma, true);
    const c = await siparistenAc(yonetici, onayli.id, { kod: 'SIP.1', ad: 'Siparişten', firmaId: 999999 });
    assert.equal(c.statusCode, 200, c.body);
    const p = c.json<Proje>();
    assert.deepEqual([p.siparisId, p.firmaId, p.firmaAd], [onayli.id, firma, 'Deneme Müşteri S'], 'gövdedeki firma yok sayılır');
    const taslak = await siparisAc(firma, false);
    const ret = await siparistenAc(yonetici, taslak.id, { kod: 'SIP.2', ad: 'Taslaktan' });
    assert.deepEqual([ret.statusCode, ret.json().mesaj], [400, 'Proje yalnız onaylı siparişten açılır.']);
    assert.equal((await siparistenAc(yonetici, 999999, { kod: 'SIP.3', ad: 'Yok' })).statusCode, 404);
    assert.equal((await vt().tek('SELECT 1 AS var FROM projeler_proje WHERE kod IN ($1, $2)', ['SIP.2', 'SIP.3'])), null);
    const formdan = await projeAc({ kod: 'SIP.FORM', ad: 'Formdan', siparisId: onayli.id, firmaId: 999999 });
    assert.deepEqual([formdan.siparisId, formdan.firmaId], [onayli.id, firma], 'proje formu da aynı kuralla açar');
  });

  test('PRJ-07 disari.ts siparistenProjeAc (281): onaylı siparişe bağlı açar, firma siparişten; bütçe yalnız maliyet görenden; taslak reddedilir', async () => {
    const firma = await firmaAc('Deneme Müşteri Dis');
    const s = await siparisAc(firma, true);
    const temel = { baslangic: null, bitis: null, aciklama: null, butceTutari: '900', butceParaBirimi: null };
    const goren: Kullanici = { id: yoneticiId, ad: 'Deneme', islemler: ['projeler.yaz', 'finans.maliyet-oku'] };
    const gormeyen: Kullanici = { ...goren, islemler: ['projeler.yaz'] };
    const a = await vt().tx((db) => siparistenProjeAc(db, goren, s.id, { ...temel, kod: 'DSA.1', ad: 'Acil 1' }));
    const b = await vt().tx((db) => siparistenProjeAc(db, gormeyen, s.id, { ...temel, kod: 'DSA.2', ad: 'Acil 2' }));
    assert.deepEqual(Object.keys(a), ['projeId']);
    const pa = (await oku(yonetici, `/projeler/${a.projeId}`)).json<Proje>();
    const pb = (await oku(yonetici, `/projeler/${b.projeId}`)).json<Proje>();
    assert.deepEqual([pa.siparisId, pa.firmaId, pa.butceTutari], [s.id, firma, '900.00']);
    assert.deepEqual([pb.siparisId, pb.firmaId, pb.butceTutari], [s.id, firma, null], 'maliyet görmeyenin bütçesi yazılmaz');
    const taslak = await siparisAc(firma, false);
    await assert.rejects(vt().tx((db) => siparistenProjeAc(db, goren, taslak.id, { ...temel, kod: 'DSA.3', ad: 'Taslak' })), /yalnız onaylı siparişten/);
    assert.equal(await vt().tek("SELECT 1 AS var FROM projeler_proje WHERE kod = 'DSA.3'"), null);
  });

  test('PRJ-07 yetki: proje yazmayan rol siparişten açamaz (403, kayıt açılmaz); siparişin projelerini okuyamaz', async () => {
    const s = await siparisAc(await firmaAc('Deneme Müşteri Y'), true);
    assert.equal((await siparistenAc(operator, s.id, { kod: 'SIP.Y1', ad: 'Yetkisiz' })).statusCode, 403);
    assert.equal(await vt().tek("SELECT 1 AS var FROM projeler_proje WHERE kod = 'SIP.Y1'"), null);
    assert.equal((await oku(operator, `/projeler/siparis/${s.id}`)).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/api/projeler/siparisten/${s.id}/ac`, payload: { kod: 'SIP.Y2', ad: 'Girişsiz' } })).statusCode, 401);
  });

  test('siparişin projeleri: bir siparişten birden çok proje açılır; uç ve disari.ts açılış sırasıyla verir', async () => {
    const s = await siparisAc(await firmaAc('Deneme Müşteri C'), true);
    const bos = (await oku(yonetici, `/projeler/siparis/${s.id}`)).json<SiparisProjeleriCevabi>();
    assert.deepEqual(bos.projeler, []);
    const a = (await siparistenAc(yonetici, s.id, { kod: 'COK.A', ad: 'Birinci' })).json<Proje>();
    const b = (await siparistenAc(yonetici, s.id, { kod: 'COK.B', ad: 'İkinci' })).json<Proje>();
    const cevap = (await oku(yonetici, `/projeler/siparis/${s.id}`)).json<SiparisProjeleriCevabi>();
    assert.deepEqual(cevap.projeler.map((p) => p.kod), ['COK.A', 'COK.B']);
    await vt().tx(async (db) => {
      const ozet = await siparisinProjeleri(db, s.id);
      assert.deepEqual(ozet.map((p) => [p.id, p.siparisId]), [[a.id, s.id], [b.id, s.id]]);
      assert.deepEqual(await siparisinProjeleri(db, 999999), []);
      assert.equal((await projeGetir(db, a.id))?.siparisId, s.id);
    });
  });

  test('PRJ-08 siparişe bağlı projede firma değişmez; bağ doğrudan yazmayla da değişmez', async () => {
    const firma = await firmaAc('Deneme Müşteri D');
    const baska = await firmaAc('Deneme Müşteri E');
    const s = await siparisAc(firma, true);
    const p = (await siparistenAc(yonetici, s.id, { kod: 'SBT.1', ad: 'Bağlı' })).json<Proje>();
    const ret = await guncelle(p, { firmaId: baska });
    assert.deepEqual([ret.statusCode, ret.json().mesaj], [400, 'Siparişe bağlı projenin firması siparişin firmasıdır; değiştirilemez.']);
    assert.equal((await guncelle(p, { firmaId: null })).statusCode, 400, 'firma boşaltılamaz');
    const tamam = await guncelle(p, { ad: 'Bağlı 2' });
    assert.equal(tamam.statusCode, 200, tamam.body);
    assert.deepEqual([tamam.json<Proje>().firmaId, tamam.json<Proje>().siparisId], [firma, s.id]);
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE projeler_proje SET siparis_id = NULL WHERE id = $1', [p.id])), /sipariş değişmez/);
    const elle = await eskiProjeAc('SBT.ELLE', 'Elle');
    assert.equal((await guncelle(elle, { firmaId: baska })).statusCode, 200, 'siparişsiz projede firma serbest');
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE projeler_proje SET siparis_id = $2 WHERE id = $1', [elle.id, s.id])), /sipariş değişmez/);
  });

  test('PRJ-09 bütçe: maliyet gören girer ve görür; para birimi verilmezse TRY; biçimsiz ve eksi tutar reddedilir', async () => {
    const p = await projeAc({ kod: 'BTC.1', ad: 'Bütçeli', butceTutari: '250000.50' });
    assert.deepEqual([p.butceTutari, p.butceParaBirimi], ['250000.50', 'TRY']);
    const bos = await projeAc({ kod: 'BTC.2', ad: 'Bütçesiz' });
    assert.deepEqual([bos.butceTutari, bos.butceParaBirimi], [null, null], 'girilmeyen bütçe null kalır, sıfır uydurulmaz');
    const usd = await guncelle(p, { butceTutari: '1000', butceParaBirimi: 'usd' });
    assert.equal(usd.statusCode, 200, usd.body);
    assert.deepEqual([usd.json<Proje>().butceTutari, usd.json<Proje>().butceParaBirimi], ['1000.00', 'USD']);
    const sil = await guncelle(usd.json<Proje>(), { butceTutari: null, butceParaBirimi: 'USD' });
    assert.deepEqual([sil.json<Proje>().butceTutari, sil.json<Proje>().butceParaBirimi], [null, null], 'tutarsız para birimi saklanmaz');
    for (const butceTutari of ['-5', '1,5', '1.234', 'abc']) {
      assert.equal((await gonder(yonetici, '/projeler', { kod: 'BTC.X', ad: 'Ret', butceTutari, siparisId: await ortak() })).statusCode, 400, butceTutari);
    }
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE projeler_proje SET butce_tutari = 10 WHERE id = $1", [bos.id])), /projeler_proje_butce_butun/);
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE projeler_proje SET butce_tutari = -1, butce_para_birimi = 'TRY' WHERE id = $1", [bos.id])), /projeler_proje_butce_tutar/);
    await vt().tx(async (db) => {
      const ozet = await projeGetir(db, p.id);
      assert.deepEqual([ozet?.butceTutari, ozet?.butceParaBirimi], [null, null], 'disari.ts güncel bütçeyi verir');
    });
  });

  test('PRJ-09 bütçe gizliliği: maliyet görmeyen alanı hiç almaz; gönderdiği bütçe yok sayılır ve var olan değer kalır', async () => {
    const p = await projeAc({ kod: 'GZL.1', ad: 'Gizli bütçe', butceTutari: '5000' });
    const ayrinti = await oku(maliyetsizYazar, `/projeler/${p.id}`);
    assert.equal(ayrinti.statusCode, 200, ayrinti.body);
    const gorunen = ayrinti.json<Record<string, unknown>>();
    assert.ok(!('butceTutari' in gorunen) && !('butceParaBirimi' in gorunen), 'ayrıntıda bütçe yok');
    const liste = (await oku(maliyetsizYazar, '/projeler?ara=GZL')).json<ProjeListesiCevabi>();
    assert.ok(liste.satirlar.every((s) => !('butceTutari' in s)), 'listede bütçe yok');
    const c = await gonder(maliyetsizYazar, `/projeler/${p.id}/guncelle`, {
      ad: 'Gizli bütçe 2', firmaId: p.firmaId, baslangic: null, bitis: null, aciklama: null, durum: 'aktif', surum: p.surum, butceTutari: '1',
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.ok(!('butceTutari' in c.json<Record<string, unknown>>()));
    const sonra = (await oku(yonetici, `/projeler/${p.id}`)).json<Proje>();
    assert.deepEqual([sonra.ad, sonra.butceTutari, sonra.butceParaBirimi], ['Gizli bütçe 2', '5000.00', 'TRY'], 'bütçe değişmedi, ad değişti');
    const yeni = await gonder(maliyetsizYazar, '/projeler', { kod: 'GZL.2', ad: 'Yeni', butceTutari: '9', siparisId: await ortak() });
    assert.equal(yeni.statusCode, 200, yeni.body);
    const kayit = await vt().tek<{ butce_tutari: string | null }>("SELECT butce_tutari FROM projeler_proje WHERE kod = 'GZL.2'");
    assert.equal(kayit?.butce_tutari, null, 'görmeyenin açtığı projede bütçe yazılmaz');
  });

  test('PRJ-10 proje sipariş seçmeden açılmaz (224): siparişsiz 400 ve kayıt yok; taslak sipariş 400; seçici yalnız onaylıları verir', async () => {
    const once = await vt().tek('SELECT count(*)::int AS n FROM projeler_proje');
    const yok = await gonder(yonetici, '/projeler', { kod: 'ZRN.1', ad: 'Siparişsiz' });
    assert.equal(yok.statusCode, 400, yok.body);
    assert.match(yok.body, /Sipariş seçimi zorunlu/);
    const firma = await firmaAc('Deneme Müşteri Z');
    const taslak = await siparisAc(firma, false);
    const ret = await gonder(yonetici, '/projeler', { kod: 'ZRN.2', ad: 'Taslak', siparisId: taslak.id });
    assert.deepEqual([ret.statusCode, ret.json().mesaj], [400, 'Proje yalnız onaylı siparişten açılır.']);
    assert.equal((await gonder(yonetici, '/projeler', { kod: 'ZRN.3', ad: 'Olmayan', siparisId: 999999 })).statusCode, 404);
    assert.deepEqual(await vt().tek('SELECT count(*)::int AS n FROM projeler_proje'), once);
    const onayli = await siparisAc(firma, true);
    const secenek = await oku(yonetici, `/projeler/siparis-secenekleri?ara=${encodeURIComponent(onayli.no)}`);
    assert.equal(secenek.statusCode, 200, secenek.body);
    const siparisler = secenek.json<{ siparisler: { id: number; no: string; firmaAd: string | null }[] }>().siparisler;
    assert.deepEqual(siparisler.map((x) => [x.id, x.firmaAd]), [[onayli.id, 'Deneme Müşteri Z']]);
    const hepsi = (await oku(yonetici, '/projeler/siparis-secenekleri')).json<{ siparisler: { id: number }[] }>().siparisler;
    assert.ok(!hepsi.some((x) => x.id === taslak.id), 'taslak sipariş seçicide yok');
    assert.equal((await oku(operator, '/projeler/siparis-secenekleri')).statusCode, 403);
  });
});
