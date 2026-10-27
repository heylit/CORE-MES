import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { RollerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import type { KatalogKartiKaydetCevabi, OlcuAletiSecenekleriCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

// 885 a: demirbaş kartı ölçü aletini Kalibrasyon'daki numarasıyla anar; vade ve durum Kalibrasyon'dan okunur, karttaki eski
// kalibrasyon alanları salt okunurdur.
describe('Malzeme kartı ölçü aleti bağı (885 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let turId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown, cerez = yonetici): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown, cerez = yonetici): Promise<T> {
    const c = await istek(yontem, url, govde, cerez);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<string> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, durum, `${yontem} ${url}: ${c.body}`);
    return String(c.json().mesaj);
  }

  let sayac = 0;
  const kartGovdesi = (kimlik: string, o: { tur?: 'demirbas' | 'sarf'; g?: Record<string, unknown>; talep?: Record<string, unknown> }, surum: number | null = null) => {
    const tur = o.tur ?? 'demirbas';
    return {
      kayit: {
        id: kimlik, tur,
        com: { kod: `${tur === 'demirbas' ? 'DB' : 'SF'}-ALT-00001`, ad: `Alet kartı ${kimlik}`, birim: 'adet' },
        g: { kat: tur === 'demirbas' ? 'olcu' : 'takim', ...o.g }, onay: { durum: 'aktif' }, ...(o.talep ? { talep: o.talep } : {}),
      },
      ozet: { benzersiz_anahtar: `${tur}|alet|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    };
  };
  const kayitli = async (kimlik: string): Promise<{ g: Record<string, unknown>; aletId: number | null }> => {
    const r = await vt().tek<{ g: Record<string, unknown>; alet_id: number | null }>(
      "SELECT kayit -> 'g' AS g, olcu_aleti_id AS alet_id FROM malzeme_katalog_karti WHERE kimlik = $1", [kimlik]);
    assert.ok(r, kimlik);
    return { g: r.g, aletId: r.alet_id };
  };
  const surumu = async (kimlik: string): Promise<number> =>
    (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.surum;
  const aletAc = async (no: string): Promise<number> =>
    (await ortam!.sahip.tek<{ id: number }>('INSERT INTO olcu_aleti (no, tur_id, periyot_gun) VALUES ($1, $2, 100) RETURNING id', [no, turId]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('malzemealet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme alet', kullaniciAdi: 'al-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'al-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    turId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('Alet bağı türü') RETURNING id"))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kart aleti numarasıyla bağlanır; numara Kalibrasyondaki yazımına çekilir, sütun aleti tutar; boşaltınca bağ düşer', async () => {
    const id = await aletAc('ALT-001');
    const kimlik = `al${++sayac}`;
    await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, { g: { aletNo: ' alt-001 ' } }));
    const k = await kayitli(kimlik);
    assert.deepEqual({ no: k.g['aletNo'], id: k.aletId }, { no: 'ALT-001', id });

    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, { g: { aletNo: '' } }, await surumu(kimlik)));
    const bos = await kayitli(kimlik);
    assert.deepEqual({ no: bos.g['aletNo'], id: bos.aletId }, { no: undefined, id: null });
  });

  test('Kalibrasyonda olmayan numara, demirbaş dışı kart ve talebin önerdiği olmayan alet 400 alır; kart yazılmaz', async () => {
    const yok = `al${++sayac}`;
    assert.match(await ret(400, 'POST', `/malzeme-katalogu-kartlari/${yok}/kaydet`, kartGovdesi(yok, { g: { aletNo: 'YOK-999' } })), /Kalibrasyon'da yok/);
    const sarf = `al${++sayac}`;
    await aletAc('ALT-002');
    assert.match(await ret(400, 'POST', `/malzeme-katalogu-kartlari/${sarf}/kaydet`, kartGovdesi(sarf, { tur: 'sarf', g: { aletNo: 'ALT-002' } })), /yalnız demirbaş/);
    const bicim = `al${++sayac}`;
    assert.match(await ret(400, 'POST', `/malzeme-katalogu-kartlari/${bicim}/kaydet`, kartGovdesi(bicim, { g: { aletNo: 12 } })), /geçersiz/);
    const talep = `al${++sayac}`;
    const govde = kartGovdesi(talep, { talep: { yeni: { g: { kat: 'olcu', aletNo: 'YOK-998' } } } });
    assert.match(await ret(400, 'POST', `/malzeme-katalogu-kartlari/${talep}/kaydet`, govde), /Kalibrasyon'da yok/);
    for (const k of [yok, sarf, bicim, talep]) assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik = $1', [k]), null);
  });

  test('eski kalibrasyon alanları salt okunur: yeni kartta boş başlar, kayıtlı değer gelen değerle değişmez', async () => {
    const kimlik = `al${++sayac}`;
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, { g: { kalibrasyon: 'Gerekli', kalAy: 12, sonKal: '2026-01-01', kalKurulus: 'X' } }));
    const yeni = await kayitli(kimlik);
    assert.deepEqual([yeni.g['kalibrasyon'], yeni.g['kalAy'], yeni.g['sonKal'], yeni.g['kalKurulus']], ['Gerekli', undefined, undefined, undefined]);

    // Bağdan önce yazılmış eski kart: değerler korunur, ekranın gönderdiği yeni değer yok sayılır.
    await vt().sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{g}', (kayit -> 'g') || '{"kalAy": 6, "sonKal": "2025-05-05"}') WHERE kimlik = $1`, [kimlik]);
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, { g: { kalAy: 24, sonKal: '2026-02-02' } }, await surumu(kimlik)));
    const eski = await kayitli(kimlik);
    assert.deepEqual([eski.g['kalAy'], eski.g['sonKal']], [6, '2025-05-05']);
  });

  test('alet silinirse kart bağsız kalır; Kalibrasyonun silme kuralı kartla engellenmez', async () => {
    const id = await aletAc('ALT-003');
    const kimlik = `al${++sayac}`;
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, kartGovdesi(kimlik, { g: { aletNo: 'ALT-003' } }));
    assert.equal((await istek('POST', `/olcu-aletleri/${id}/sil`)).statusCode, 204);
    assert.equal((await kayitli(kimlik)).aletId, null);
  });

  test('alet listesi malzemeler sayfasıyla okunur: Kalibrasyon yetkisi olmayan kişi de görür; sayfası olmayan 403', async () => {
    await aletAc('ALT-004');
    const roller = (await tamam<RollerCevabi>('GET', '/roller')).roller;
    const yoneticiRolu = roller.find((r) => r.yonetici === true)!.id;
    const rolAc = async (kod: string, islem: string): Promise<number> => {
      const r = (await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]))!.id;
      await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r, islem]);
      return r;
    };
    const kisiEkle = async (kullaniciAdi: string, rolId: number): Promise<string> => {
      const id = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));
      await vt().tx(async (db) => { await rolAta(db, yoneticiId, id, rolId); await rolAl(db, yoneticiId, id, yoneticiRolu); });
      const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      return String(c.headers['set-cookie']).split(';')[0] ?? '';
    };
    const malzemeci = await kisiEkle('al-malzeme', await rolAc('test_al_malzeme', 'sayfa.malzemeler'));
    const liste = await tamam<OlcuAletiSecenekleriCevabi>('GET', '/malzeme-olcu-aletleri', undefined, malzemeci);
    assert.deepEqual(liste.aletler.find((a) => a.no === 'ALT-004'), { no: 'ALT-004', tur: 'Alet bağı türü', vade: null, durum: 'kayit-yok' });
    assert.equal((await istek('GET', '/olcu-aletleri', undefined, malzemeci)).statusCode, 403);
    const baskasi = await kisiEkle('al-baska', await rolAc('test_al_baska', 'sayfa.kalibrasyon'));
    assert.equal((await istek('GET', '/malzeme-olcu-aletleri', undefined, baskasi)).statusCode, 403);
  });
});
