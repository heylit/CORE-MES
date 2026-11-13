import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, SahneAdimi, SeceneklerCevabi, TalimatAdimiGirdisi, TalimatSahneleriCevabi } from '#paylasilan/sozlesme/rota.ts';
import { talimatSahnesiKaydetGovdesi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { talimatSahnesi } from './disari.ts';
import { sahneHatasi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

const hareket = (parcalar: number[], p: Partial<SahneAdimi['hareket']> = {}): SahneAdimi['hareket'] =>
  ({ parcalar, yon: '+Y', mesafeMm: 60, sureSn: 1.4, sirali: false, kamera: null, ...p });

describe('RT-90, RT-91: sahne kuralları (saf)', () => {
  test('RT-90: adım sırası talimatın adımlarından biridir ve bir kez geçer', () => {
    assert.equal(sahneHatasi([{ sira: 1, hareket: hareket([0]) }, { sira: 2, hareket: hareket([1]) }], 2), null);
    assert.match(sahneHatasi([{ sira: 3, hareket: hareket([0]) }], 2) ?? '', /2 adımı var/);
    assert.match(sahneHatasi([{ sira: 1, hareket: hareket([0]) }, { sira: 1, hareket: hareket([1]) }], 2) ?? '', /iki kez/);
  });
  test('RT-91: parça adım içinde tekrarlanmaz ve tek adımda girer', () => {
    assert.equal(sahneHatasi([{ sira: 1, hareket: hareket([0, 1, 2]) }, { sira: 2, hareket: hareket([]) }], 2), null);
    assert.match(sahneHatasi([{ sira: 1, hareket: hareket([0, 0]) }], 1) ?? '', /aynı parça/);
    assert.match(sahneHatasi([{ sira: 1, hareket: hareket([4]) }, { sira: 2, hareket: hareket([4]) }], 2) ?? '', /5\. parça hem 1\. hem 2\./);
  });
  test('sözleşme: bilinmeyen alan, sınır dışı yön, mesafe ve süre reddedilir', () => {
    const govde = { opNo: 10, talimatSurum: 1, okunanSahneSurum: null, modelRevizyonId: 7, adimlar: [{ sira: 1, hareket: hareket([0]) }] };
    assert.ok(talimatSahnesiKaydetGovdesi.safeParse(govde).success);
    assert.ok(!talimatSahnesiKaydetGovdesi.safeParse({ ...govde, fazla: 1 }).success);
    for (const h of [{ yon: '+W' }, { mesafeMm: 2001 }, { sureSn: 0.1 }, { parcalar: [-1] }, { kamera: { yatay: 0, dikey: 3, uzaklik: 100 } }]) {
      assert.ok(!talimatSahnesiKaydetGovdesi.safeParse({ ...govde, adimlar: [{ sira: 1, hareket: { ...hareket([0]), ...h } }] }).success, JSON.stringify(h));
    }
  });
});

describe('talimatın 3B sahnesi (gerçek PostgreSQL, 3209 a)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'operator', string> = { yonetici: '', kartOnaycisi: '', planlama: '', operator: '' };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let makine = 0;
  let hammadde = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string = randomUUID()) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: kimlik } : {}) },
    });
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }
  async function red(cerez: string, url: string, payload: unknown, durum: number, ileti?: RegExp): Promise<void> {
    const cevap = await istek(cerez, 'POST', url, payload);
    assert.equal(cevap.statusCode, durum, `${url}: ${cevap.body}`);
    if (ileti) assert.match(cevap.json<{ mesaj: string }>().mesaj, ileti);
  }

  async function kartAc(tur: 'mamul' | 'hammadde'): Promise<number> {
    const kimlik = `sh${++sayac}`;
    const kod = `${tur === 'mamul' ? 'MM' : 'HM'}-SHN-00001`;
    const zorunlu = tur === 'hammadde' ? { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 3000 + sayac } } : { g: { ad: `Deneme montaj ${sayac}` } };
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d }, ...zorunlu },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
    await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    return (await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
  }
  const adim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tipler[0]!.id, ad: 'Montaj', kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 10, birimSureDk: 5,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [], ...p,
  });
  const talimatAdimi = (baslik: string): TalimatAdimiGirdisi => ({ baslik, metin: null, kontrol: { tur: 'onay' }, zorunlu: true, medya: [] });

  // Ürün, OP 10 ve üç adımlı yayınlanmış talimat (1. sürüm).
  async function montaj(): Promise<number> {
    const urun = await kartAc('mamul');
    const { id } = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar: [adim()] });
    await tamam(c.planlama, 'POST', `/rota/urunler/${urun}/talimat-adimli-yaz`, {
      opNo: 10, okunanSurum: null, adimlar: ['Tabanı koy', 'Gövdeyi oturt', 'Cıvataları sık'].map(talimatAdimi),
    });
    return urun;
  }
  const kaydetUrl = (urun: number) => `/rota/urunler/${urun}/talimat-sahnesi-kaydet`;
  const govde = (p: Record<string, unknown> = {}) => ({
    opNo: 10, talimatSurum: 1, okunanSahneSurum: null, modelRevizyonId: 7,
    adimlar: [{ sira: 1, hareket: hareket([0]) }, { sira: 2, hareket: hareket([1]) }, { sira: 3, hareket: hareket([2, 3, 4, 5], { sirali: true, mesafeMm: 50 }) }],
    ...p,
  });

  before(async () => {
    ortam = await testVeritabaniKur('rota_sahne');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.revizyon-yaz'), ('planlama_proje', 'rota.taslak-ac'), ('planlama_proje', 'rota.talimat-yaz')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string }[] }).roller;
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['operator', 'Operatör']] as const) {
      const rolId = roller.find((x) => x.ad === rolAdi)!.id;
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rolId);
        for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
      });
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.yonetici, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'SH-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'SH-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'SH-MA', ad: 'Deneme makine', istasyonId: istasyon })).id;
    hammadde = await kartAc('hammadde');
  });

  after(async () => { await ortam?.kaldir(); });

  test('yazma talimat yazma yetkisi ister: operatör reddedilir, okuma operatöre açılmaz; planlama yazar ve okur', async () => {
    const urun = await montaj();
    await red(c.operator, kaydetUrl(urun), govde(), 403);
    assert.equal((await istek(c.operator, 'GET', `/rota/urunler/${urun}/talimatlar/10/sahneler`)).statusCode, 403);
    const k = await tamam<TalimatSahneleriCevabi>(c.planlama, 'POST', kaydetUrl(urun), govde());
    assert.deepEqual(k.sahneler.map((x) => [x.talimatSurum, x.sahneSurum, x.modelRevizyonId, x.adimlar.length, x.yazan.ad]), [[1, 1, 7, 3, 'Deneme planlama']]);
    const o = await tamam<TalimatSahneleriCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}/talimatlar/10/sahneler`);
    assert.deepEqual(o.sahneler[0]?.adimlar[2]?.hareket, hareket([2, 3, 4, 5], { sirali: true, mesafeMm: 50 }));
  });

  test('sürüm denetimi: yeni sahne sürüm açar, eski okunanla yazma reddedilir; eski sürüm satırı yerinde kalır (yalnız ekleme)', async () => {
    const urun = await montaj();
    await tamam(c.planlama, 'POST', kaydetUrl(urun), govde());
    await red(c.planlama, kaydetUrl(urun), govde(), 409);
    const k = await tamam<TalimatSahneleriCevabi>(c.planlama, 'POST', kaydetUrl(urun), govde({ okunanSahneSurum: 1, modelRevizyonId: 8 }));
    assert.deepEqual(k.sahneler.map((x) => [x.sahneSurum, x.modelRevizyonId]), [[2, 8]]);
    await red(c.planlama, kaydetUrl(urun), govde({ okunanSahneSurum: 1 }), 409);
    const sayi = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM rota_talimat_sahnesi WHERE malzeme_id = $1', [urun]));
    assert.equal(sayi?.n, 2);
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE rota_talimat_sahnesi SET model_revizyon_id = 9 WHERE malzeme_id = $1', [urun])));
    await assert.rejects(vt().tx((db) => db.sorgu('DELETE FROM rota_talimat_sahnesi WHERE malzeme_id = $1', [urun])));
  });

  test('RT-90/RT-91 sunucuda: yayınlanmamış sürüm 404, talimatta olmayan adım ve iki adımda giren parça 400', async () => {
    const urun = await montaj();
    await red(c.planlama, kaydetUrl(urun), govde({ talimatSurum: 2 }), 404, /yayınlanmamış/);
    await red(c.planlama, kaydetUrl(urun), govde({ adimlar: [{ sira: 4, hareket: hareket([0]) }] }), 400, /3 adımı var/);
    await red(c.planlama, kaydetUrl(urun), govde({ adimlar: [{ sira: 1, hareket: hareket([0]) }, { sira: 2, hareket: hareket([0]) }] }), 400, /tek adımda/);
    await red(c.planlama, kaydetUrl(urun), govde({ fazla: true }), 400);
  });

  test('aynı istek kimliği ikinci sahne sürümü açmaz (tekrar koruması)', async () => {
    const urun = await montaj();
    const kimlik = randomUUID();
    for (let i = 0; i < 2; i++) assert.equal((await istek(c.planlama, 'POST', kaydetUrl(urun), govde(), kimlik)).statusCode, 200);
    const sayi = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM rota_talimat_sahnesi WHERE malzeme_id = $1', [urun]));
    assert.equal(sayi?.n, 1);
  });

  test('disari talimatSahnesi: emre sabitlenen sürümün en son sahnesi; sahne yoksa null', async () => {
    const urun = await montaj();
    assert.equal(await vt().tx((db) => talimatSahnesi(db, urun, 10, 1)), null);
    await tamam(c.planlama, 'POST', kaydetUrl(urun), govde());
    await tamam(c.planlama, 'POST', kaydetUrl(urun), govde({ okunanSahneSurum: 1, adimlar: [{ sira: 2, hareket: hareket([9]) }] }));
    const s = await vt().tx((db) => talimatSahnesi(db, urun, 10, 1));
    assert.deepEqual([s?.sahneSurum, s?.adimlar.map((a) => a.sira)], [2, [2]]);
    assert.equal(await vt().tx((db) => talimatSahnesi(db, urun, 10, 2)), null);
  });
});
