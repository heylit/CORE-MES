import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { DegisiklikDefteriCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { defterSatirlari } from './degisiklik-defteri-kurallar.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 2129-2 b: planı etkileyen değişikliklerin kalıcı defteri. Satırı sunucu çalışma yazmasında önceki ve yeni bekleyen listesinden yazar;
// kişi ve zaman sunucudandır, defter yalnız eklenir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const b = (id: string, ek: Record<string, unknown> = {}) => ({ id, ne: `Değişiklik ${id}`, ayrinti: '', kim: 'Deneme', t: 1, isler: ['S1'], geri: [], ...ek });
const calisma = (dataVer: number, planVer: number | null, bekleyen: unknown[]) =>
  ({ surum: 2, dataVer, plan: planVer === null ? null : { dataVer: planVer, ops: {} }, bekleyen });

describe('değişiklik defteri kuralı', () => {
  test('DD-01: eklenen bekleyen değişiklik, başka sayfanın farkı kaynak; eski satırı eklenmez', () => {
    const l = defterSatirlari(calisma(1, 1, []), calisma(3, 1, [b('eski'), b('a'), b('k', { dis: true })]));
    assert.deepEqual(l.map((x) => [x.olay, x.bekleyenId]), [['degisiklik', 'a'], ['kaynak', 'k']]);
  });

  test('DD-02: düşen satır bildirilen kararla; karar yoksa plan güncellendiyse uygulandı, değilse geri alındı', () => {
    const once = calisma(4, 1, [b('a'), b('r'), b('g')]);
    const kararlar = [{ id: 'r', karar: 'reddedildi' as const, gerekce: 'Müşteri vazgeçti' }];
    assert.deepEqual(defterSatirlari(once, calisma(5, 1, [b('a')]), kararlar).map((x) => [x.olay, x.bekleyenId, x.gerekce]),
      [['reddedildi', 'r', 'Müşteri vazgeçti'], ['geri-alindi', 'g', null]]);
    assert.deepEqual(defterSatirlari(once, calisma(5, 5, []), kararlar).map((x) => [x.olay, x.bekleyenId]),
      [['uygulandi', 'a'], ['reddedildi', 'r'], ['uygulandi', 'g']]);
  });

  test('DD-03: değişmeyen liste ve bozuk satır deftere girmez; düşmeyen satırın kararı yok sayılır', () => {
    const once = calisma(2, 1, [b('a'), { id: 3 }, null]);
    assert.deepEqual(defterSatirlari(once, calisma(2, 1, [b('a')]), [{ id: 'a', karar: 'uygulandi' }]), []);
    assert.deepEqual(defterSatirlari(null, null), []);
  });
});

describe('değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let planci = '';
  let okuyan = '';
  let yetkisiz = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const yaz = (cerez: string, deger: unknown, beklenenSurum: number | null, kararlar?: unknown) => app.inject({
    method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
    payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum, ...(kararlar === undefined ? {} : { kararlar }) },
  });
  const oku = (cerez: string, once?: number) =>
    app.inject({ method: 'GET', url: `/api/plan/degisiklik-defteri${once === undefined ? '' : `?once=${String(once)}`}`, headers: { cookie: cerez } });
  async function calismaKur(deger: unknown): Promise<number> {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const k = await vt().tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId }));
    return k?.surum ?? -1;
  }
  const surumu = (r: { json: () => unknown }) => (r.json() as { kayit: { surum: number } }).kayit.surum;

  before(async () => {
    ortam = await testVeritabaniKur('plan_degisiklik_defteri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    planci = await islemliKisi('planci', ['plan.yaz', 'plan.planlama-oku']);
    okuyan = await islemliKisi('okuyan', ['plan.planlama-oku']);
    yetkisiz = await islemliKisi('yetkisiz', ['recete-rota.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('DD-10: eklenen, reddedilen (gerekçeyle) ve uygulanan değişiklik deftere kişi ve zamanla girer; en yeni önde', async () => {
    let s = await calismaKur(calisma(1, 1, []));
    let r = await yaz(planci, calisma(3, 1, [b('a'), b('r')]), s);
    assert.equal(r.statusCode, 200, r.body); s = surumu(r);
    r = await yaz(planci, calisma(4, 1, [b('a')]), s, [{ id: 'r', karar: 'reddedildi', gerekce: 'Termin değişmedi' }]);
    assert.equal(r.statusCode, 200, r.body); s = surumu(r);
    r = await yaz(planci, calisma(5, 5, []), s, [{ id: 'a', karar: 'uygulandi' }]);
    assert.equal(r.statusCode, 200, r.body);
    const d = await oku(okuyan);
    assert.equal(d.statusCode, 200, d.body);
    const c = d.json() as DegisiklikDefteriCevabi;
    assert.deepEqual(c.satirlar.map((x) => [x.olay, x.bekleyenId, x.gerekce, x.kisi]), [
      ['uygulandi', 'a', null, 'Deneme planci'],
      ['reddedildi', 'r', 'Termin değişmedi', 'Deneme planci'],
      ['degisiklik', 'r', null, 'Deneme planci'],
      ['degisiklik', 'a', null, 'Deneme planci'],
    ]);
    assert.deepEqual(c.satirlar[0]!.isler, ['S1']);
    assert.ok(!Number.isNaN(Date.parse(c.satirlar[0]!.zaman)));
    assert.equal(c.dahaVar, false);
    const once = await oku(okuyan, c.satirlar[1]!.id);
    assert.deepEqual((once.json() as DegisiklikDefteriCevabi).satirlar.map((x) => x.bekleyenId), ['r', 'a']);
  });

  test('DD-11: gerekçesiz ret ve tanımsız karar 400; çalışma ve defter değişmez', async () => {
    const s = await calismaKur(calisma(2, 1, [b('x')]));
    const sayi = async () => Number((await vt().tek<{ n: string }>('SELECT count(*) AS n FROM plan_degisiklik_defteri'))!.n);
    const n = await sayi();
    assert.equal((await yaz(planci, calisma(3, 1, []), s, [{ id: 'x', karar: 'reddedildi', gerekce: '  ' }])).statusCode, 400);
    assert.equal((await yaz(planci, calisma(3, 1, []), s, [{ id: 'x', karar: 'sildim' }])).statusCode, 400);
    assert.equal(await sayi(), n);
  });

  test('DD-12: çakışan yazma deftere satır bırakmaz; okumayı planlama-oku taşımayan göremez', async () => {
    const s = await calismaKur(calisma(2, 1, []));
    const n = (await oku(okuyan).then((r) => r.json() as DegisiklikDefteriCevabi)).satirlar.length;
    assert.equal((await yaz(planci, calisma(3, 1, [b('y')]), s + 1000)).statusCode, 409);
    assert.equal((await oku(okuyan).then((r) => r.json() as DegisiklikDefteriCevabi)).satirlar.length, n);
    assert.equal((await oku(yetkisiz)).statusCode, 403);
  });

  test('DD-13: defter yalnız eklenir: satır değiştirilemez, silinemez', async () => {
    await ortam!.sahip.sorgu("INSERT INTO plan_degisiklik_defteri (olay, bekleyen_id, ne, kisi_id) VALUES ('degisiklik', 'z', 'Deneme', $1)", [yoneticiId]);
    await assert.rejects(ortam!.sahip.sorgu("UPDATE plan_degisiklik_defteri SET ne = 'x'"), /yalnız ekleme|değişmez/);
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM plan_degisiklik_defteri'), /yalnız ekleme|değişmez/);
  });
});
