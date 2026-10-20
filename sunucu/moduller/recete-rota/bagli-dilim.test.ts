import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { bagliDilimleriAyikla } from './kurallar.ts';

// Ekranın açılışta sahibinden okuyup olduğu gibi değiştirdiği dilimler ana kayıtta tutulmaz (309 b): yeni yazmada ayıklanır, eski satırdaki kopyayı
// tek seferlik göç siler. Yalnız kayıtta duran veri korunur: kartsız kalem, adımın çıktı kartı ve statüleri (ekran yeniden açılışta onları yalnız
// kayıttan okur, tablo eşitlemesi her yazmada belgeyi izler), rota modülüne gitmemiş yerel revizyon, takvimin ve plan ayarının yerel alanları.
// Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TEMIZLIK_GOCU = '_recete_rota_kayit_temizligi.sql';
const PAROLA = 'dogru-parola-1';

const ADIM = { id: '7-o10', opNo: 10, outItem: '12', outStatus: 'KKB', ins: [{ itemId: '5', qty: 1, status: 'step:5-o20' }] };
const KAYDA_OZGU = {
  items: [{ id: '7', code: 'MM-DEN-1', type: 'mamul', bagli: true }, { id: 'k-yerel', code: 'YEREL-1', type: 'ham', bagli: false }],
  routes: { 7: { base: 2, steps: [ADIM] }, 8: { steps: [] } },
  routeRevs: [{ id: '31', itemId: '7', status: 'yururlukte', sunucu: true, data: { base: 2, steps: [ADIM] } },
    { id: 'rv-yerel', itemId: '8', status: 'taslak', data: { base: 1, steps: [{ id: 'o10', opNo: 10 }] } }],
  statusStock: { 7: { KKB: 3 } }, gercekSure: { '7-o10': { taban: 'gerceklesen' } }, splitManual: { k: [1, 2] },
  statuses: [{ id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }], opdefs: [{ id: 'o1', name: 'Torna' }],
};
const BELGE = {
  ...KAYDA_OZGU,
  wcs: [{ id: 'w1' }], stations: [{ id: 's1' }], machines: [{ id: 'm1' }], people: [{ id: 'p1' }], emirler: { liste: [] },
  cal: { shifts: [{ id: 'v1' }], holidays: ['2026-10-29'], workdays: [1, 2, 3, 4, 5] },
  settings: { rule: 'edd', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, orderItem: '7', useStock: true },
};
const KALAN = { ...KAYDA_OZGU, cal: { workdays: [1, 2, 3, 4, 5] }, settings: { orderItem: '7', useStock: true } };

describe('ana kayıtta bağlı dilimler (kural)', () => {
  test('kaynak dilimleri ve takvim/ayardaki sahip alanları çıkar; malzeme, rota, revizyon ve yerel alanlar olduğu gibi kalır', () => {
    assert.deepEqual(bagliDilimleriAyikla(BELGE), KALAN);
    // Revizyonlu üründe base'i olmayan rota da adımlarıyla kalır: çıktı kartı ve statüler yalnız burada durur.
    const tabansiz = { routes: { 7: { steps: [ADIM] } }, routeRevs: [{ itemId: '7' }] };
    assert.deepEqual(bagliDilimleriAyikla(tabansiz), tabansiz);
    assert.deepEqual(bagliDilimleriAyikla({ cal: { shifts: [] }, settings: { rule: 'edd' }, statusStock: {} }), { statusStock: {} }, 'boşalan dilim kalmaz');
    assert.deepEqual(bagliDilimleriAyikla({ cal: 'bozuk' }), { cal: 'bozuk' });
    assert.deepEqual(bagliDilimleriAyikla([1]), [1]);
    assert.equal(bagliDilimleriAyikla('metin'), 'metin');
  });
});

describe('ana kayıtta bağlı dilimler (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yaz = async (anahtar: string, deger: unknown, beklenenSurum: number | null) => {
    const c = await app.inject({ method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: cerez }, payload: { anahtar, bicim: 'json', deger, beklenenSurum } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const oku = async (anahtar: string) => (await vt().tek<{ deger: unknown }>('SELECT deger FROM recete_rota_kayit WHERE anahtar = $1', [anahtar]))?.deger;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_bagli_dilim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('yeni yazmada bağlı dilim kaydedilmez, kayda özgü alanlar kalır; senaryo kaydı olduğu gibi yazılır', async () => {
    await yaz(DURUM_ANAHTARI, BELGE, null);
    assert.deepEqual(await oku(DURUM_ANAHTARI), KALAN);
    await yaz(`${DURUM_ANAHTARI}:studio:1`, BELGE, null);
    assert.deepEqual(await oku(`${DURUM_ANAHTARI}:studio:1`), BELGE, 'senaryo anahtarı ayıklanmaz');
  });
});

describe('kayıt temizliği göçü dolu kayıtta (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';
  before(async () => {
    ortam = await testSemasiAc('rrbagli');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rrbagli-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göçten sonra eski ana kayıtta bağlı dilim kalmaz, kayda özgü alanlar ve öteki anahtarlar değişmez, sürüm artar; kişi bağı yeni yazmayı denetler', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(TEMIZLIK_GOCU));
    assert.ok(goc, 'temizlik göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'rrbagli', parola: PAROLA }));
    const ekle = (anahtar: string, deger: unknown) => sahip.sorgu(
      "INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)", [anahtar, JSON.stringify(deger), kisi]);
    await ekle(DURUM_ANAHTARI, BELGE);
    await ekle(`${DURUM_ANAHTARI}:studio:1`, BELGE);
    await ekle(`${DURUM_ANAHTARI}:tercih`, BELGE);
    // Kişisi kisi tablosunda olmayan eski satır göçü durdurmaz ve silinmez (312 b, NOT VALID).
    await sahip.sorgu("INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', '{}'::jsonb, nextval('recete_rota_surum'), $2)", [`${DURUM_ANAHTARI}:yetim`, kisi + 1000]);
    const surumler = async () => new Map((await sahip.sorgu<{ anahtar: string; surum: string }>('SELECT anahtar, surum::text FROM recete_rota_kayit')).map((r) => [r.anahtar, r.surum]));
    const once = await surumler();

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const deger = async (anahtar: string) => (await sahip.tek<{ deger: unknown }>('SELECT deger FROM recete_rota_kayit WHERE anahtar = $1', [anahtar]))?.deger;
    const sonra = await surumler();
    assert.deepEqual(await deger(DURUM_ANAHTARI), KALAN);
    assert.notEqual(sonra.get(DURUM_ANAHTARI), once.get(DURUM_ANAHTARI), 'açık ekran eski sürümle yazamaz');
    assert.deepEqual(await deger(`${DURUM_ANAHTARI}:studio:1`), BELGE);
    assert.deepEqual(await deger(`${DURUM_ANAHTARI}:tercih`), BELGE);
    assert.deepEqual(await deger(`${DURUM_ANAHTARI}:yetim`), {});
    for (const k of [`${DURUM_ANAHTARI}:studio:1`, `${DURUM_ANAHTARI}:tercih`, `${DURUM_ANAHTARI}:yetim`]) assert.equal(sonra.get(k), once.get(k), `${k} sürümü değişmez`);
    await assert.rejects(ekle(`${DURUM_ANAHTARI}:yeni`, {}).then(() => sahip.sorgu('UPDATE recete_rota_kayit SET guncelleyen_kisi_id = $1 WHERE anahtar = $2', [kisi + 1000, `${DURUM_ANAHTARI}:yeni`])),
      /recete_rota_kayit_guncelleyen_kisi_fk/, 'yeni yazmada kişi denetlenir');
  });
});
