import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { seriListeCevabi, seriListelerCevabi, type SeriListeCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { seriEklemeleri } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('seri liste kurali (saf)', () => {
  test('ayni sayilan etiket ust uste adet artirir; goz ve taninmayan kod sayilmaz; komut ve bos kod atlanir', () => {
    const e = seriEklemeleri(null, ['LOC:A-1', 'LOT:LT-1', 'LOTŞLT*1', 'LOT:LT-1', 'LOC:A-1', 'LOC:A-1', 'XYZ', 'CMD:KAYDET', ' ']);
    assert.deepEqual(e, { sonAdet: null, atlanan: 2, yeni: [
      { kod: 'LOC:A-1', adet: null }, { kod: 'LOT:LT-1', adet: '3' }, { kod: 'LOC:A-1', adet: null }, { kod: 'LOC:A-1', adet: null }, { kod: 'XYZ', adet: null },
    ] });
  });
  test('listenin son satiriyla ayni etiket o satiri artirir; araya baska kod girince yeni satir', () => {
    assert.deepEqual(seriEklemeleri({ kod: 'LOT:LT-1', adet: '2.000' }, ['LOT:LT-1', 'LOT:LT-1']), { sonAdet: '4', yeni: [], atlanan: 0 });
    assert.deepEqual(seriEklemeleri({ kod: 'LOT:LT-1', adet: '2' }, ['MLZ:9', 'LOT:LT-1']), { sonAdet: null, yeni: [{ kod: 'MLZ:9', adet: '1' }, { kod: 'LOT:LT-1', adet: '1' }], atlanan: 0 });
  });
});

// Seri liste (1915, 1914 teyit): kişinin taslağı; stok yazılmaz, liste yalnız sahibine görünür.
describe('stok seri liste (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      const yonetici = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  const ekle = async (kim: string, govde: unknown): Promise<SeriListeCevabi> => {
    const c = await istek<SeriListeCevabi>(kim, 'POST', '/stok/seri-listeler/okutma-ekle', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return seriListeCevabi.parse(c.govde);
  };
  const stokSatiri = async (): Promise<number> => Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_hareketi'))!.n);

  before(async () => {
    ortam = await testVeritabaniKur('stok_seri_liste');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [ad, rol] of [['depo', 'depo'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('telefon okutmasi liste acar, sirayla ekler, ayni lot adet artirir; stok yazilmaz', async () => {
    const once = await stokSatiri();
    const l = await ekle('operator', { kodlar: ['LOC:A-01-1'] });
    assert.equal(l.liste.kaynak, 'okutma');
    const id = l.liste.id;
    const s = await ekle('operator', { listeId: id, kodlar: ['LOT:LT-9'] });
    const t = await ekle('operator', { listeId: id, kodlar: ['LOT:LT-9'] });
    assert.deepEqual(t.satirlar.map((x) => [x.sira, x.kod, x.adet]), [[1, 'LOC:A-01-1', null], [2, 'LOT:LT-9', '2']]);
    assert.equal(s.satirlar.length, 2);
    assert.equal(t.liste.acikSatir, 2);
    assert.equal(await stokSatiri(), once, 'seri liste stok yazmaz');
    const listeler = seriListelerCevabi.parse((await istek('operator', 'GET', '/stok/seri-listeler')).govde);
    assert.deepEqual(listeler.listeler.map((x) => x.id), [id]);
  });

  test('1914 hafiza aktarimi tek istekle yeni liste acar; satir duzeltilir, silinir, islenen satir degismez; kapanan listeye eklenmez', async () => {
    const l = await ekle('depo', { kaynak: 'hafiza', kodlar: ['LOC:A-01-2', 'MLZ:7', 'MLZ:7', 'MLZ:7', 'RP:000045', 'XYZ-99'] });
    assert.equal(l.liste.kaynak, 'hafiza');
    assert.deepEqual(l.satirlar.map((x) => x.adet), [null, '3', null, null]);
    const [goz, mlz, kart, bozuk] = l.satirlar;
    const d = await istek<SeriListeCevabi>('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/satirlar/${mlz!.id}/degistir`, { adet: '2.5' });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.satirlar[1]!.adet, '2.5');
    assert.equal((await istek('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/satirlar/${bozuk!.id}/sil`)).durum, 200);
    const i = await istek<SeriListeCevabi>('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/islendi`, { satirIdler: [goz!.id, mlz!.id] });
    assert.equal(i.durum, 200);
    assert.equal(i.govde.liste.acikSatir, 1);
    assert.equal((await istek('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/satirlar/${mlz!.id}/degistir`, { adet: '9' })).durum, 404, 'islenen satir degismez');
    assert.equal((await istek('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/satirlar/${mlz!.id}/sil`)).durum, 404);
    const k = await istek<SeriListeCevabi>('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/kapat`);
    assert.equal(k.durum, 200);
    assert.notEqual(k.govde.liste.kapanis, null);
    assert.equal((await istek('depo', 'POST', '/stok/seri-listeler/okutma-ekle', { listeId: l.liste.id, kodlar: ['LOC:A-01-3'] })).durum, 422);
    assert.ok(!seriListelerCevabi.parse((await istek('depo', 'GET', '/stok/seri-listeler')).govde).listeler.some((x) => x.id === l.liste.id), 'kapanan liste acik listede yok');
    assert.equal(kart!.kod, 'RP:000045');
  });

  test('liste yalniz sahibine gorunur (reddedilen); komut barkodu listeye girmez; sinir asilamaz', async () => {
    const l = await ekle('operator', { kodlar: ['LOC:B-1', 'CMD:KAYDET'] });
    assert.equal(l.satirlar.length, 1);
    assert.equal((await istek('depo', 'GET', `/stok/seri-listeler/${l.liste.id}`)).durum, 404);
    assert.equal((await istek('depo', 'POST', '/stok/seri-listeler/okutma-ekle', { listeId: l.liste.id, kodlar: ['LOC:B-2'] })).durum, 404);
    assert.equal((await istek('depo', 'POST', `/stok/seri-listeler/${l.liste.id}/kapat`)).durum, 404);
    assert.equal((await istek('operator', 'POST', '/stok/seri-listeler/okutma-ekle', { kodlar: Array.from({ length: 501 }, (_, i) => `LOC:C-${i}`) })).durum, 400);
  });
});
