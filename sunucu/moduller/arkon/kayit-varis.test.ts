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
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const VARIS_GOCU = '_arkon_kayit_varis.sql';

interface Satir { zaman: Date; varis: Date | null; istemci: number | null; govdeVaris: unknown }

describe('arkon kayıt varış göçü (gerçek PostgreSQL)', () => {
  test('var olan satır değişmez ve varış boş kalır; sütun boş olabilir', async () => {
    const ortam = await testSemasiAc('arkonvarisgoc');
    const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-arkonvarisgoc-'));
    try {
      const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
      const goc = hepsi.find((ad) => ad.endsWith(VARIS_GOCU)) ?? '';
      assert.ok(goc, 'varış göçü bulunamadı');
      for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
      await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
      const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: PAROLA }));
      await ortam.vt.sorgu(
        "INSERT INTO arkon_kayit (tur, cid, zaman, govde, kisi_id) VALUES ('counts', 'v1', '2026-10-01T08:00:00Z', '{\"delta\":1}', $1)", [kisiId]);
      const once = await ortam.vt.tek<Record<string, unknown>>("SELECT * FROM arkon_kayit WHERE cid = 'v1'");

      await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
      await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });

      const sutun = await ortam.vt.tek<{ tip: string; bos: string }>(
        `SELECT data_type AS tip, is_nullable AS bos FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'arkon_kayit' AND column_name = 'varis'`);
      assert.deepEqual(sutun, { tip: 'timestamp with time zone', bos: 'YES' });
      const sonra = await ortam.vt.tek<Record<string, unknown>>("SELECT * FROM arkon_kayit WHERE cid = 'v1'");
      assert.deepEqual(sonra, { ...once, varis: null });
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

describe('arkon kayıt varış zamanı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let operator = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function giris(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const sayimYaz = async (cid: string, at: number, ek: Record<string, unknown> = {}) => {
    const cevap = await app.inject({
      method: 'POST', url: '/api/arkon/kayitlar/counts/ekle', headers: { cookie: operator },
      payload: { satirlar: [{ cid, at, kind: 'good', delta: 1, ...ek }], kaynak: 'k1' },
    });
    assert.equal(cevap.statusCode, 200);
  };

  const oku = async (cid: string): Promise<Satir> => {
    const satir = await vt().tek<Satir>(
      `SELECT zaman, varis, (govde->>'istemciZamani')::float8 AS istemci, govde->'varis' AS "govdeVaris"
         FROM arkon_kayit WHERE tur = 'counts' AND cid = $1`, [cid]);
    assert.ok(satir, `${cid} yazılmadı`);
    return satir;
  };

  before(async () => {
    ortam = await testVeritabaniKur('arkonvaris');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const gecici = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!gecici || !yoneticiRolu) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator'), ($1, 'sayfa.arkon')", [gecici.id]);
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'operator1', parola: PAROLA });
      await rolAta(db, yoneticiId, id, gecici.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
    });
    operator = await giris('operator1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('pencere içindeki geri tarihli kayıtta zaman tabletin, varış sunucunun anıdır', async () => {
    const once = Date.now();
    const tablet = once - 6 * 3600e3;
    await sayimYaz('gt1', tablet);
    const s = await oku('gt1');
    assert.equal(s.zaman.getTime(), tablet);
    assert.equal(s.istemci, tablet);
    assert.ok(s.varis, 'varış boş');
    assert.ok(s.varis.getTime() >= once - 1000 && s.varis.getTime() <= Date.now() + 1000, 'varış sunucu anı değil');
  });

  test('pencere dışındaki kayıtta zaman da sunucu saatidir; varış dolu', async () => {
    const once = Date.now();
    await sayimYaz('gt2', once - 13 * 3600e3);
    const s = await oku('gt2');
    assert.ok(s.varis);
    assert.ok(s.zaman.getTime() >= once - 1000 && s.zaman.getTime() <= Date.now() + 1000);
  });

  test('istemcinin gönderdiği varış alanı sütuna yazılmaz', async () => {
    const once = Date.now();
    await sayimYaz('gt3', once, { varis: '2020-01-01T00:00:00Z' });
    const s = await oku('gt3');
    assert.ok(s.varis);
    assert.ok(s.varis.getTime() >= once - 1000, 'varış istemciden alındı');
  });
});
