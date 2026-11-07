import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  DosyaListesiCevabi, DosyalarCevabi, GecmisCevabi, Klasor, KlasorlerCevabi, OrtakDosya, SurumlerCevabi, YetkiCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

interface Oturum { cerez: string; id: number }

// Sentetik içerik: imza türü belirler (dosya modülü türü içerikten bulur), gerisi rastgele.
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(1200)]);
const step = (): Buffer => Buffer.concat([Buffer.from('ISO-10303-21;\nHEADER;\n'), randomBytes(800)]);
// Sentetik ofis belgesi: tek girdili zip (içerik türleri), sıkıştırmasız; sonda merkez dizini. Gerçek belge içeriği yoktur.
const ofis = (anaTur: string, ekGirdi?: string): Buffer => {
  const girdiler: [string, Buffer][] = [
    ['[Content_Types].xml', Buffer.from(`<Types><Override PartName="/a.xml" ContentType="application/vnd.${anaTur}.main+xml"/></Types>`)],
    ...(ekGirdi === undefined ? [] : [[ekGirdi, randomBytes(64)] as [string, Buffer]]),
  ];
  const yereller: Buffer[] = [];
  const merkez: Buffer[] = [];
  let konum = 0;
  for (const [ad, veri] of girdiler) {
    const adB = Buffer.from(ad);
    const y = Buffer.alloc(30);
    y.writeUInt32LE(0x04034b50, 0); y.writeUInt32LE(veri.length, 18); y.writeUInt32LE(veri.length, 22); y.writeUInt16LE(adB.length, 26);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt32LE(veri.length, 20); m.writeUInt32LE(veri.length, 24); m.writeUInt16LE(adB.length, 28);
    m.writeUInt32LE(konum, 42);
    yereller.push(y, adB, veri);
    merkez.push(m, adB);
    konum += 30 + adB.length + veri.length;
  }
  const dizin = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(girdiler.length, 10); son.writeUInt32LE(dizin.length, 12); son.writeUInt32LE(konum, 16);
  return Buffer.concat([...yereller, dizin, son]);
};
const WORD = 'openxmlformats-officedocument.wordprocessingml.document';
const EXCEL = 'openxmlformats-officedocument.spreadsheetml.sheet';
const metin = (s: string): Buffer => Buffer.from(`${s}\n${randomUUID()}\n`, 'utf8');
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('ortak dosyalar (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let kalite: Oturum;
  let operator: Oturum;
  let mudur: Oturum;
  let sayfasiz: Oturum;
  const rolId = new Map<string, number>();
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Göçten sonra açılan rol sayfayı kendiliğinden almaz; deneme rolü sayfa işlemini burada alır ya da almaz (OD-8).
  async function rolAc(kod: string, sayfa: boolean): Promise<number> {
    const r = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    assert.ok(r);
    if (sayfa) await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.ortak-dosyalar')", [r.id]);
    rolId.set(kod, r.id);
    return r.id;
  }

  async function girisYap(rolKodu: string | null): Promise<Oturum> {
    const kullaniciAdi = `ortak-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yonetici.id, yeni, rolId.get(rolKodu) ?? 0);
        await rolAl(db, yonetici.id, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });

  async function icerikGonder(o: Oturum, icerik: Buffer): Promise<string> {
    const ozet = ozetOf(icerik);
    const c = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozet}/parca`, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') }, headers: { cookie: o.cerez },
    });
    assert.equal(c.statusCode, 200, c.body);
    return ozet;
  }

  async function klasorAc(o: Oturum, ustId: number | null, ad: string): Promise<Klasor> {
    const c = await gonder(o, '/ortak-dosyalar/klasorler', { ustId, ad });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<Klasor>();
  }

  async function yetkiVer(klasorId: number, ozelYetki: boolean, satirlar: Record<string, 'gorur' | 'ekler' | 'yonetir'>): Promise<YetkiCevabi> {
    const once = (await oku(yonetici, `/ortak-dosyalar/klasorler/${klasorId}/yetki`)).json<YetkiCevabi>();
    const c = await gonder(yonetici, `/ortak-dosyalar/klasorler/${klasorId}/yetki`, {
      surum: once.surum, ozelYetki, satirlar: Object.entries(satirlar).map(([kod, duzey]) => ({ rolId: rolId.get(kod) ?? 0, duzey })),
    });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<YetkiCevabi>();
  }

  async function yukle(o: Oturum, klasorId: number, ad: string, icerik: Buffer = pdf()): Promise<LightMyRequestResponse> {
    const ozet = await icerikGonder(o, icerik);
    return gonder(o, `/ortak-dosyalar/klasorler/${klasorId}/yukle`, { ad, ozet });
  }

  const klasorIdleri = async (o: Oturum): Promise<number[]> =>
    (await oku(o, '/ortak-dosyalar/klasorler')).json<KlasorlerCevabi>().klasorler.map((k) => k.id).sort((a, b) => a - b);

  let ortak: Klasor;
  let duyurular: Klasor;
  let gizli: Klasor;

  before(async () => {
    ortam = await testVeritabaniKur('ortak_dosyalar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const ilkId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ortak-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ortak-yonetici', parola: PAROLA } });
    yonetici = { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id: ilkId };
    await rolAc('deneme_kalite', true);
    await rolAc('deneme_operator', true);
    await rolAc('deneme_mudur', true);
    await rolAc('deneme_sayfasiz', false);
    kalite = await girisYap('deneme_kalite');
    operator = await girisYap('deneme_operator');
    mudur = await girisYap('deneme_mudur');
    sayfasiz = await girisYap('deneme_sayfasiz');
    ortak = await klasorAc(yonetici, null, 'Ortak');
    duyurular = await klasorAc(yonetici, ortak.id, 'Duyurular');
    gizli = await klasorAc(yonetici, ortak.id, 'Gizli');
    await yetkiVer(ortak.id, true, { deneme_kalite: 'ekler', deneme_operator: 'gorur', deneme_mudur: 'yonetir' });
    await yetkiVer(gizli.id, true, { deneme_mudur: 'yonetir' });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('OD-8 sayfa işlemi olmayan kişi hiçbir uca giremez (403)', async () => {
    assert.equal((await oku(sayfasiz, '/ortak-dosyalar/klasorler')).statusCode, 403);
    assert.equal((await gonder(sayfasiz, '/ortak-dosyalar/klasorler', { ustId: ortak.id, ad: 'X' })).statusCode, 403);
  });

  test('OD-17 göçle var olan her yönetici olmayan rol sayfayı alır; yetki-ver yalnız yönetici rolünde kalır', async () => {
    const eksik = await vt().sorgu<{ kod: string }>(
      `SELECT r.kod FROM rol r
        WHERE NOT r.yonetici AND r.kod NOT LIKE 'deneme\\_%'
          AND NOT EXISTS (SELECT 1 FROM rol_islemi ri WHERE ri.rol_id = r.id AND ri.islem = 'sayfa.ortak-dosyalar')`,
    );
    assert.deepEqual(eksik, []);
    assert.ok(((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM rol WHERE NOT yonetici AND kod NOT LIKE 'deneme\\_%'"))?.n ?? 0) > 0);
    const yetkiVeren = await vt().sorgu("SELECT 1 FROM rol_islemi WHERE islem = 'ortak-dosyalar.yetki-ver'");
    assert.deepEqual(yetkiVeren, []);
  });

  test('OD-9 üst düzey klasör: yönetici açar, özel yetkiyle ve satırsız; başkası açamaz', async () => {
    const yeni = await klasorAc(yonetici, null, 'Yalnız yönetici');
    assert.equal(yeni.ozelYetki, true);
    assert.equal(yeni.duzey, 'yonetir');
    assert.ok(!(await klasorIdleri(mudur)).includes(yeni.id));
    const c = await gonder(mudur, '/ortak-dosyalar/klasorler', { ustId: null, ad: 'Müdür kökü' });
    assert.equal(c.statusCode, 403, c.body);
    assert.equal(c.json<{ mesaj: string }>().mesaj, ILETILER.kokYalnizYonetici);
  });

  test('OD-2/5 miras ve görünmezlik: alt klasör üstün yetkisini alır; özel yetkili klasör listede yok ve doğrudan istek 404', async () => {
    assert.deepEqual(await klasorIdleri(operator), [ortak.id, duyurular.id]);
    assert.deepEqual(await klasorIdleri(mudur), [ortak.id, duyurular.id, gizli.id]);
    assert.equal((await oku(operator, `/ortak-dosyalar/klasorler/${gizli.id}/dosyalar`)).statusCode, 404);
    assert.equal((await oku(operator, `/ortak-dosyalar/klasorler/${gizli.id}/gecmis`)).statusCode, 404);
    assert.equal((await oku(operator, '/ortak-dosyalar/klasorler/999999/dosyalar')).statusCode, 404);
    const k = (await oku(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar`)).json<DosyalarCevabi>();
    assert.equal(k.klasor.duzey, 'ekler');
  });

  test('OD-10 alt klasör açmak üstte yonetir ister; aynı ebeveynde aynı ad (tr-TR, harf duyarsız) 409', async () => {
    const red = await gonder(kalite, '/ortak-dosyalar/klasorler', { ustId: duyurular.id, ad: 'Kalite alt' });
    assert.equal(red.statusCode, 403, red.body);
    const alt = await klasorAc(mudur, duyurular.id, 'İzinler');
    assert.equal(alt.ozelYetki, false);
    const ayni = await gonder(mudur, '/ortak-dosyalar/klasorler', { ustId: duyurular.id, ad: 'izinler' });
    assert.equal(ayni.statusCode, 409, ayni.body);
    assert.equal(ayni.json<{ mesaj: string }>().mesaj, ILETILER.klasorAdiVar);
    assert.equal((await gonder(mudur, '/ortak-dosyalar/klasorler', { ustId: duyurular.id, ad: 'a/b' })).statusCode, 400);
  });

  test('OD-11 yükleme ekler ister: gorur 403, ekler yükler; aynı ad yeni sürüm, eski sürüm aynı içerikle iner', async () => {
    assert.equal((await yukle(operator, duyurular.id, 'Plan.pdf')).statusCode, 403);
    const ilk = pdf();
    const c1 = await yukle(kalite, duyurular.id, 'Plan.pdf', ilk);
    assert.equal(c1.statusCode, 200, c1.body);
    const d1 = c1.json<OrtakDosya>();
    assert.equal(d1.surumSirasi, 1);
    assert.equal(d1.boyut, ilk.length);
    const ikinci = pdf();
    const c2 = await yukle(kalite, duyurular.id, 'PLAN.pdf', ikinci);
    assert.equal(c2.statusCode, 200, c2.body);
    const d2 = c2.json<OrtakDosya>();
    assert.equal(d2.id, d1.id);
    assert.equal(d2.surumSirasi, 2);
    assert.equal(d2.ad, 'Plan.pdf');
    const surumler = (await oku(operator, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${d1.id}/surumler`)).json<SurumlerCevabi>();
    assert.deepEqual(surumler.surumler.map((s) => s.sira), [2, 1]);
    const eski = await oku(operator, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${d1.id}/surumler/1/dosya`);
    assert.equal(eski.statusCode, 200);
    assert.ok(eski.rawPayload.equals(ilk));
    const yeni = await oku(operator, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${d1.id}/surumler/2/dosya`);
    assert.ok(yeni.rawPayload.equals(ikinci));
    assert.equal((await oku(operator, `/ortak-dosyalar/klasorler/${gizli.id}/dosyalar/${d1.id}/surumler/1/dosya`)).statusCode, 404);
  });

  test('OD-7 tür sınırı: kabul edilmeyen tür (STEP) 400; başkasının yüklediği içerik bağlanamaz', async () => {
    const c = await yukle(kalite, duyurular.id, 'Model.step', step());
    assert.equal(c.statusCode, 400, c.body);
    const baskasi = pdf();
    const ozet = await icerikGonder(mudur, baskasi);
    const red = await gonder(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/yukle`, { ad: 'Kopya.pdf', ozet });
    assert.equal(red.statusCode, 400, red.body);
  });

  test('OD-7 ofis belgesi, düz metin ve csv yüklenir; makrolu belge reddedilir', async () => {
    const durumlar: [string, Buffer][] = [
      ['Talimat.docx', ofis(WORD)], ['Liste.xlsx', ofis(EXCEL)], ['Not.txt', metin('Vardiya notu')], ['Sayim.csv', metin('kod;adet\nA1;4\nA2;6')],
    ];
    for (const [ad, icerik] of durumlar) {
      const c = await yukle(kalite, duyurular.id, ad, icerik);
      assert.equal(c.statusCode, 200, `${ad} ${c.body}`);
      const inen = await oku(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${c.json<OrtakDosya>().id}/surumler/1/dosya`);
      assert.equal(inen.statusCode, 200, `${ad} ${inen.body}`);
      assert.ok(inen.rawPayload.equals(icerik), ad);
      assert.match(String(inen.headers['content-disposition']), /^attachment;/);
    }
    // Makrolu belge dosya modülünce tanınmaz: içerik daha depoya girerken reddedilir.
    const makro = ofis(WORD, 'word/vbaProject.bin');
    const red = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozetOf(makro)}/parca`, payload: { sira: 0, toplam: 1, veri: makro.toString('base64') }, headers: { cookie: kalite.cerez },
    });
    assert.equal(red.statusCode, 400, red.body);
  });

  test('OD-18 dosya adının uzantısı içerikle uyuşmalı: .bat adlı metin, .exe adlı PDF, uzantısız ad 400; hiçbir kayıt kalmaz', async () => {
    const once = (await oku(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar`)).json<DosyalarCevabi>().dosyalar.length;
    for (const [ad, icerik] of [['Calistir.bat', metin('@echo off')], ['Rapor.exe', pdf()], ['Rapor', pdf()], ['Liste.docx', ofis(EXCEL)]] as const) {
      const c = await yukle(kalite, duyurular.id, ad, icerik);
      assert.equal(c.statusCode, 400, `${ad} ${c.body}`);
      assert.match(c.body, new RegExp(ILETILER.uzantiUyusmuyor.slice(0, 20)));
    }
    const sonra = (await oku(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar`)).json<DosyalarCevabi>().dosyalar.length;
    assert.equal(sonra, once);
    assert.equal((await yukle(kalite, duyurular.id, 'Buyuk Harf.PDF')).statusCode, 200);
  });

  test('OD-12 arşiv yonetir ister; arşivdeki dosya listelenmez, indirilmez; geri alınır; aynı adlı etkin dosya varken geri alma 409', async () => {
    const d = (await yukle(kalite, duyurular.id, 'Arsiv deneme.pdf')).json<OrtakDosya>();
    const yol = `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${d.id}`;
    assert.equal((await gonder(kalite, `${yol}/arsivle`, { surum: d.surum })).statusCode, 403);
    const a = await gonder(mudur, `${yol}/arsivle`, { surum: d.surum });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal((await gonder(mudur, `${yol}/arsivle`, { surum: d.surum })).statusCode, 409);
    const liste = (await oku(kalite, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar`)).json<DosyalarCevabi>();
    assert.ok(!liste.dosyalar.some((x) => x.id === d.id));
    assert.equal((await oku(mudur, `${yol}/surumler/1/dosya`)).statusCode, 404);
    assert.ok((await oku(mudur, '/ortak-dosyalar/arsiv')).json<DosyaListesiCevabi>().dosyalar.some((x) => x.id === d.id));
    assert.equal((await oku(kalite, '/ortak-dosyalar/arsiv')).json<DosyaListesiCevabi>().dosyalar.length, 0);
    const yeniAyni = (await yukle(kalite, duyurular.id, 'Arsiv deneme.pdf')).json<OrtakDosya>();
    assert.notEqual(yeniAyni.id, d.id);
    const cakisan = await gonder(mudur, `${yol}/arsivden-cikar`, { surum: a.json<OrtakDosya>().surum });
    assert.equal(cakisan.statusCode, 409, cakisan.body);
    await gonder(mudur, `/ortak-dosyalar/klasorler/${duyurular.id}/dosyalar/${yeniAyni.id}/arsivle`, { surum: yeniAyni.surum });
    const geri = await gonder(mudur, `${yol}/arsivden-cikar`, { surum: a.json<OrtakDosya>().surum });
    assert.equal(geri.statusCode, 200, geri.body);
    assert.equal(geri.json<OrtakDosya>().arsiv, false);
  });

  test('OD-13 yetki sekmesi yalnız yetki-ver işleminde; yönetici satırı ve köke miras reddedilir; eski sürüm 409', async () => {
    assert.equal((await oku(mudur, `/ortak-dosyalar/klasorler/${ortak.id}/yetki`)).statusCode, 403);
    assert.equal((await gonder(mudur, `/ortak-dosyalar/klasorler/${ortak.id}/yetki`, { surum: 1, ozelYetki: true, satirlar: [] })).statusCode, 403);
    const y = (await oku(yonetici, `/ortak-dosyalar/klasorler/${duyurular.id}/yetki`)).json<YetkiCevabi>();
    assert.equal(y.ozelYetki, false);
    assert.equal(y.kaynakId, ortak.id);
    const yonRol = y.roller.find((r) => r.yonetici);
    assert.ok(yonRol);
    const yonSatiri = await gonder(yonetici, `/ortak-dosyalar/klasorler/${ortak.id}/yetki`, {
      surum: (await oku(yonetici, `/ortak-dosyalar/klasorler/${ortak.id}/yetki`)).json<YetkiCevabi>().surum,
      ozelYetki: true, satirlar: [{ rolId: yonRol.id, duzey: 'gorur' }],
    });
    assert.equal(yonSatiri.statusCode, 400, yonSatiri.body);
    const kok = await gonder(yonetici, `/ortak-dosyalar/klasorler/${ortak.id}/yetki`, { surum: 1, ozelYetki: false, satirlar: [] });
    assert.equal(kok.statusCode, 400, kok.body);
    const eski = await gonder(yonetici, `/ortak-dosyalar/klasorler/${duyurular.id}/yetki`, { surum: y.surum + 5, ozelYetki: true, satirlar: [] });
    assert.equal(eski.statusCode, 409, eski.body);
  });

  test('OD-14 yetki değişince görünürlük sunucuda hemen değişir; miras alana dönünce özel satırlar silinir', async () => {
    const alt = await klasorAc(yonetici, ortak.id, 'Geçici özel');
    assert.ok((await klasorIdleri(operator)).includes(alt.id));
    await yetkiVer(alt.id, true, { deneme_kalite: 'gorur' });
    assert.ok(!(await klasorIdleri(operator)).includes(alt.id));
    assert.equal((await oku(operator, `/ortak-dosyalar/klasorler/${alt.id}/dosyalar`)).statusCode, 404);
    const geri = await yetkiVer(alt.id, false, { deneme_kalite: 'yonetir' });
    assert.equal(geri.ozelYetki, false);
    assert.equal(geri.kaynakId, ortak.id);
    const satir = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM ortak_dosyalar_yetki WHERE klasor_id = $1', [alt.id]);
    assert.equal(satir?.n, 0);
    assert.ok((await klasorIdleri(operator)).includes(alt.id));
  });

  test('OD-15 Son eklenenler yalnız görünen klasörlerden; arama ad içinde, harf duyarsız', async () => {
    const g = (await yukle(mudur, gizli.id, 'Gizli rapor.pdf')).json<OrtakDosya>();
    const op = (await oku(operator, '/ortak-dosyalar/son-eklenenler')).json<DosyaListesiCevabi>();
    assert.ok(!op.dosyalar.some((d) => d.id === g.id));
    const md = (await oku(mudur, '/ortak-dosyalar/son-eklenenler?ara=GİZLİ')).json<DosyaListesiCevabi>();
    assert.deepEqual(md.dosyalar.map((d) => d.id), [g.id]);
    assert.deepEqual(md.dosyalar[0]?.klasorYolu, ['Ortak', 'Gizli']);
  });

  test('OD-16 Geçmiş: klasör açma, yükleme, yeni sürüm ve yetki değişikliği kişisiyle görünür; indirme denetim kaydına yazılır', async () => {
    const g = (await oku(operator, `/ortak-dosyalar/klasorler/${duyurular.id}/gecmis`)).json<GecmisCevabi>();
    const olaylar = new Set(g.olaylar.map((o) => o.olay));
    for (const o of ['klasor-acildi', 'yuklendi', 'yeni-surum', 'arsivlendi', 'geri-alindi'] as const) assert.ok(olaylar.has(o), o);
    assert.ok(g.olaylar.every((o) => o.kisiAd !== null));
    const y = (await oku(operator, `/ortak-dosyalar/klasorler/${ortak.id}/gecmis`)).json<GecmisCevabi>();
    assert.ok(y.olaylar.some((o) => o.olay === 'yetki-degisti'));
    const d = await vt().tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM denetim_kaydi WHERE yontem = 'GET' AND yol = '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/surumler/:sira/dosya'",
    );
    assert.ok((d?.n ?? 0) > 0);
    const yuklemeIzi = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM denetim_kaydi WHERE yontem = 'POST' AND yol = '/ortak-dosyalar/klasorler/:klasorId/yukle'");
    assert.ok((yuklemeIzi?.n ?? 0) > 0);
  });
});
