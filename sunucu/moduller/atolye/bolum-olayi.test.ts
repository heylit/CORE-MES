import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { kablola } from '../../kablolama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bolumAcildiDinle } from './olaylar.ts';
import { salonEkle } from './servis.ts';

// 2902 (madde 1): her bölüm varsayılan olarak stok deposudur. Fabrika Haritası'nda açılan bölüm, açan kişide stok.tanim varsa deposuyla
// açılır (kod bölüm kodundan); yoksa depo açılmaz (sonra toplu düğmeyle ya da tek tek açılır). Dinleyicinin reddi bölüm kaydını da geri alır.
const PAROLA = 'dogru-parola-1';

describe('atölye yeni bölüm -> stok deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const salonAc = async (kim: string, kod: string): Promise<{ durum: number; govde: { id?: number } }> => {
    const c = await app.inject({
      method: 'POST', url: '/api/atolye/salonlar', headers: { cookie: cerezler.get(kim) ?? '' },
      payload: { kod, ad: `Deneme ${kod}`, genislik: 20, derinlik: 20, hucreBoyu: 4 },
    });
    return { durum: c.statusCode, govde: c.json() as { id?: number } };
  };
  const depo = async (salonId: number): Promise<{ kod: string; ad: string; aktif: boolean } | null> =>
    (await o().vt.tek<{ kod: string; ad: string; aktif: boolean }>('SELECT kod, ad, aktif FROM stok_depo WHERE atolye_salon_id = $1', [salonId])) ?? null;

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('atolye_bolum_olayi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    const r = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_muduru'"))!.id;
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme Planlama', kullaniciAdi: 'planlama', parola: PAROLA });
      await rolAta(db, yonetici, k, r);
      await rolAl(db, yonetici, k, yon);
    });
    for (const kim of ['yonetici', 'planlama']) {
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: kim, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(kim, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('stok.tanim olan kişinin açtığı bölüm deposuyla açılır; kod bölüm kodundan, doluysa sıra ekiyle', async () => {
    const a = await salonAc('yonetici', 'YB-1');
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.deepEqual(await depo(a.govde.id!), { kod: 'YB1', ad: 'YB-1', aktif: true });
    const b = await salonAc('yonetici', 'YB1');
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    assert.deepEqual(await depo(b.govde.id!), { kod: 'YB12', ad: 'YB1', aktif: true });
  });

  test('stok.tanim olmayan (atolye.yaz) kişinin açtığı bölümde depo açılmaz; bölüm açılır', async () => {
    const a = await salonAc('planlama', 'YB-PLN');
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.equal(await depo(a.govde.id!), null);
  });

  test('işlemsiz çağrı (örnek veri, testler) depo açmaz', async () => {
    const kisi = (await o().vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    const s = await o().vt.tx((db) => salonEkle(db, { kod: 'YB-ORN', ad: 'Deneme örnek', genislik: 20, derinlik: 20, hucreBoyu: 4 }, kisi));
    assert.equal(await depo(s.id), null);
  });

  test('dinleyicinin reddi bölüm kaydını da geri alır', async () => {
    const birak = bolumAcildiDinle(async () => { throw new Error('deneme reddi'); });
    try {
      assert.notEqual((await salonAc('yonetici', 'YB-RED')).durum, 200);
    } finally {
      birak();
    }
    assert.equal(await o().vt.tek("SELECT id FROM atolye_salon WHERE kod = 'YB-RED'"), null);
  });
});
