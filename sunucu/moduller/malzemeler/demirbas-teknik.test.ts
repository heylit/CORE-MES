import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { DemirbasMakineSecenekleriCevabi, DemirbasTeknikAlanlari, DemirbasTeknikCevabi, DemirbasTeknikKaydetGovdesi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { demirbasTeknikYazilabilirMi, demirbasTeknikYazimi, tekrarlananOzellik } from './kurallar.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';
interface Oturum { cerez: string }

const BOS: DemirbasTeknikAlanlari = {
  tezgahTuru: null, eksenSayisi: null, xKursuMm: null, yKursuMm: null, zKursuMm: null, tablaEnMm: null, tablaBoyMm: null, tablaYukuKg: null,
  azamiDevir: null, isMiliGucuKw: null, isMiliKonigi: null, takimCebi: null, tornalamaCapiMm: null, tornalamaBoyuMm: null, cubukGecisCapiMm: null,
  konumlamaHassasiyetiMm: null, calismaTuketimiKwh: null, beklemeTuketimiKwh: null,
};
const CNC: DemirbasTeknikAlanlari = {
  ...BOS, tezgahTuru: 'dik_isleme', eksenSayisi: 3, xKursuMm: 1020, yKursuMm: 510, zKursuMm: 510, tablaEnMm: 500, tablaBoyMm: 1200,
  tablaYukuKg: 800, azamiDevir: 12000, isMiliGucuKw: 18.5, isMiliKonigi: 'BT40', takimCebi: 24, konumlamaHassasiyetiMm: 0.005,
  calismaTuketimiKwh: 11.2, beklemeTuketimiKwh: 1.4,
};

describe('Demirbaş teknik kuralları (1595)', () => {
  test('ilk kayıt sürümsüz, sonraki okunan sürümle; karışan istek eski sürüm sayılır', () => {
    assert.equal(demirbasTeknikYazimi(null, null), 'ekle');
    assert.equal(demirbasTeknikYazimi(null, 3), 'eski-surum');
    assert.equal(demirbasTeknikYazimi(2, 2), 'guncelle');
    assert.equal(demirbasTeknikYazimi(2, null), 'eski-surum');
    assert.equal(demirbasTeknikYazimi(2, 1), 'eski-surum');
  });
  test('yalnız demirbaş kartına ve silinmemiş karta yazılır', () => {
    assert.equal(demirbasTeknikYazilabilirMi('demirbas', 'aktif'), null);
    assert.equal(demirbasTeknikYazilabilirMi('demirbas', 'taslak'), null);
    assert.match(demirbasTeknikYazilabilirMi('hammadde', 'aktif') ?? '', /yalnız demirbaş/);
    assert.match(demirbasTeknikYazilabilirMi('demirbas', 'iptal') ?? '', /Silinmiş/);
  });
  test('aynı adlı özellik Türkçe harf ve büyüklük farkı gözetmeden yakalanır', () => {
    assert.equal(tekrarlananOzellik(['Palet sayısı', 'Soğutma']), null);
    assert.equal(tekrarlananOzellik(['İç basınç', 'iç basınç']), 'iç basınç');
  });
});

describe('Demirbaş teknik bilgisi uçları (1595, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum = { cerez: '' };
  let yoneticiId = 0;
  let sira = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (o: Oturum, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: o.cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function giris(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const rol = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const yoneticiRolu = await rol('yonetici');
    const hedef = await rol(rolKodu);
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedef !== yoneticiRolu) {
        await rolAta(db, yoneticiId || id, id, hedef);
        await rolAl(db, yoneticiId || id, id, yoneticiRolu);
      }
      if (yoneticiId === 0) yoneticiId = id;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }
  async function kart(tur = 'demirbas'): Promise<string> {
    sira += 1;
    const kimlik = `dbt${sira}`;
    const onek = tur === 'demirbas' ? 'DB-DBT' : 'HM-DBT';
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = tamGovde(url, {
      kayit: { id: kimlik, tur, com: { kod: `${onek}-0000${sira}`, birim: 'adet' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `${tur}|dbt|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    });
    const c = await istek(yonetici, 'POST', url, govde);
    assert.equal(c.statusCode, 200, c.body);
    return kimlik;
  }
  const makine = async (kod: string): Promise<number> =>
    (await vt().tek<{ id: number }>('INSERT INTO makine (kod, ad) VALUES ($1, $2) RETURNING id', [kod, `Deneme tezgah ${kod}`]))!.id;
  const kaydet = (o: Oturum, kimlik: string, g: DemirbasTeknikKaydetGovdesi): Promise<LightMyRequestResponse> =>
    istek(o, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/demirbas-teknik/kaydet`, g);
  const oku = async (kimlik: string): Promise<DemirbasTeknikCevabi> => {
    const c = await istek(yonetici, 'GET', `/malzeme-katalogu-kartlari/${kimlik}/demirbas-teknik`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as DemirbasTeknikCevabi;
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemedemirbas');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await giris('dbt-yonetici', 'yonetici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('girilmemiş teknik bilgi null döner; kayıt, makine bağı ve özellikler okunur, sürüm artar', async () => {
    const kimlik = await kart();
    const makineId = await makine('DBT-M1');
    assert.deepEqual(await oku(kimlik), { teknik: null });
    const ilk = await kaydet(yonetici, kimlik, {
      surum: null, makineId, alanlar: CNC,
      ozellikler: [{ ad: 'Palet sayısı', deger: '2', birim: null }, { ad: 'Soğutma basıncı', deger: '20', birim: 'bar' }],
    });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const t = (await oku(kimlik)).teknik!;
    assert.equal(t.surum, 1);
    assert.deepEqual(t.alanlar, CNC);
    assert.deepEqual(t.makine, { id: makineId, kod: 'DBT-M1', ad: 'Deneme tezgah DBT-M1', aktif: true });
    assert.deepEqual(t.ozellikler.map((o) => o.ad), ['Palet sayısı', 'Soğutma basıncı']);
    const ikinci = await kaydet(yonetici, kimlik, { surum: 1, makineId: null, alanlar: { ...CNC, azamiDevir: 15000 }, ozellikler: [] });
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    const t2 = (await oku(kimlik)).teknik!;
    assert.equal(t2.surum, 2);
    assert.equal(t2.alanlar.azamiDevir, 15000);
    assert.equal(t2.makine, null);
    assert.deepEqual(t2.ozellikler, []);
  });

  test('eski sürümle ve sürümsüz ikinci kayıt reddedilir (409), kayıt değişmez', async () => {
    const kimlik = await kart();
    assert.equal((await kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: CNC, ozellikler: [] })).statusCode, 200);
    assert.equal((await kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: BOS, ozellikler: [] })).statusCode, 409);
    assert.equal((await kaydet(yonetici, kimlik, { surum: 7, makineId: null, alanlar: BOS, ozellikler: [] })).statusCode, 409);
    assert.deepEqual((await oku(kimlik)).teknik!.alanlar, CNC);
  });

  test('bir makine iki karta bağlanamaz; seçenek listesi bağlı kartı gösterir', async () => {
    const a = await kart();
    const b = await kart();
    const makineId = await makine('DBT-M2');
    assert.equal((await kaydet(yonetici, a, { surum: null, makineId, alanlar: BOS, ozellikler: [] })).statusCode, 200);
    const red = await kaydet(yonetici, b, { surum: null, makineId, alanlar: BOS, ozellikler: [] });
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.body, /başka bir demirbaş kartına bağlı/);
    assert.equal((await oku(b)).teknik, null);
    const secenek = (await istek(yonetici, 'GET', '/malzeme-demirbas-makineleri')).json() as DemirbasMakineSecenekleriCevabi;
    assert.equal(secenek.makineler.find((m) => m.id === makineId)?.bagliKart, a);
  });

  test('demirbaş olmayan karta, olmayan makineye, tekrarlanan özelliğe ve sınır dışı değere yazılmaz', async () => {
    const hm = await kart('hammadde');
    const c1 = await kaydet(yonetici, hm, { surum: null, makineId: null, alanlar: BOS, ozellikler: [] });
    assert.equal(c1.statusCode, 422, c1.body);
    const kimlik = await kart();
    assert.equal((await kaydet(yonetici, kimlik, { surum: null, makineId: 999999, alanlar: BOS, ozellikler: [] })).statusCode, 400);
    const c3 = await kaydet(yonetici, kimlik, {
      surum: null, makineId: null, alanlar: BOS, ozellikler: [{ ad: 'Basınç', deger: '1', birim: null }, { ad: 'basınç', deger: '2', birim: null }],
    });
    assert.equal(c3.statusCode, 400, c3.body);
    assert.equal((await kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: { ...BOS, azamiDevir: 0 }, ozellikler: [] })).statusCode, 400);
    assert.equal((await kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: { ...BOS, xKursuMm: -5 }, ozellikler: [] })).statusCode, 400);
    // Para ve yetki taşımayan gövdede de bilinmeyen alan reddedilir: fiyat bu uca gönderilmez (1599 a).
    const fiyatli = { surum: null, makineId: null, alanlar: BOS, ozellikler: [], bedel: '100' };
    assert.equal((await istek(yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/demirbas-teknik/kaydet`, fiyatli)).statusCode, 400);
    assert.equal((await oku(kimlik)).teknik, null);
    assert.equal((await istek(yonetici, 'GET', '/malzeme-katalogu-kartlari/yok-boyle/demirbas-teknik')).statusCode, 404);
  });

  test('yetki: kartı yazan rol girer ve okur; malzeme sayfası olmayan rol ne okur ne yazar ne makine listesi alır', async () => {
    const kimlik = await kart();
    const depo = await giris('dbt-depo', 'depo');
    const muhasebe = await giris('dbt-muhasebe', 'muhasebe_finans');
    const operator = await giris('dbt-operator', 'operator');
    for (const o of [muhasebe, operator]) {
      assert.equal((await kaydet(o, kimlik, { surum: null, makineId: null, alanlar: CNC, ozellikler: [] })).statusCode, 403);
      assert.equal((await istek(o, 'GET', '/malzeme-demirbas-makineleri')).statusCode, 403);
      assert.equal((await istek(o, 'GET', `/malzeme-katalogu-kartlari/${kimlik}/demirbas-teknik`)).statusCode, 403);
    }
    assert.equal((await kaydet(depo, kimlik, { surum: null, makineId: null, alanlar: CNC, ozellikler: [] })).statusCode, 200);
    assert.equal((await istek(depo, 'GET', `/malzeme-katalogu-kartlari/${kimlik}/demirbas-teknik`)).statusCode, 200);
    assert.equal((await istek(depo, 'GET', '/malzeme-demirbas-makineleri')).statusCode, 200);
  });

  test('eşzamanlı iki ilk kayıttan yalnız biri yazar; öteki tutarlı biçimde reddedilir', async () => {
    const kimlik = await kart();
    const [a, b] = await Promise.all([
      kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: CNC, ozellikler: [{ ad: 'A', deger: '1', birim: null }] }),
      kaydet(yonetici, kimlik, { surum: null, makineId: null, alanlar: BOS, ozellikler: [{ ad: 'B', deger: '2', birim: null }] }),
    ]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
    const t = (await oku(kimlik)).teknik!;
    assert.equal(t.surum, 1);
    const kazanan = a.statusCode === 200 ? 'A' : 'B';
    assert.deepEqual(t.ozellikler.map((o) => o.ad), [kazanan]);
  });
});
