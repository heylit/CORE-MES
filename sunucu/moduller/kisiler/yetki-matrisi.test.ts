import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// Matrisin her sütunu, o rolle giren kişinin girişte aldığı işlem kümesiyle aynıdır (gerçek giriş, küme eşitliği).
describe('yetki matrisi: GET /rol-islemleri (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  async function girisYap(rolKodu: string): Promise<{ cerez: string; islemler: string[] }> {
    const kullaniciAdi = `m${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId === 0) yoneticiId = yeni;
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', islemler: c.json().kullanici.islemler as string[] };
  }
  const oku = (cerez: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: '/api/rol-islemleri', headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('yetkimatris');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await girisYap('yonetici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('rol yöneten (yönetici) 200 alır: satırlar kayıtlı işlemler, planlama sütunu kendi girişindeki küme, bayraklı rol hepsi ve bayrağı görünür', async () => {
    const planlama = await girisYap('planlama_proje');
    const yonetici = await girisYap('yonetici');
    const cevap = await oku(yonetici.cerez);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const govde = cevap.json() as RolIslemleriCevabi;

    assert.deepEqual(govde.islemler, [...ISLEMLER]);
    assert.deepEqual(
      govde.roller.map((r) => r.ad).sort(),
      (await vt().sorgu<{ ad: string }>('SELECT ad FROM rol')).map((r) => r.ad).sort(),
    );
    const planlamaId = await rolId('planlama_proje');
    const planlamaSutunu = govde.roller.find((r) => r.id === planlamaId);
    assert.ok(planlamaSutunu);
    assert.ok(planlamaSutunu.islemler.length > 0);
    assert.deepEqual([...planlamaSutunu.islemler].sort(), [...planlama.islemler].sort());
    assert.ok(!planlamaSutunu.islemler.includes('kisiler.rol-yonet'));

    const bayrakliId = await rolId('yonetici');
    const bayrakli = govde.roller.find((r) => r.id === bayrakliId);
    assert.ok(bayrakli);
    assert.deepEqual(bayrakli.islemler, [...ISLEMLER]);
    for (const rol of govde.roller) assert.equal(rol.yonetici, rol.id === bayrakliId, rol.ad);
  });

  test('kişileri okuyup rol yönetmeyen (planlama, müdür) 403; kisiler.oku olmayan 403, oturumsuz 401', async () => {
    for (const kod of ['planlama_proje', 'mudur']) {
      const kisi = await girisYap(kod);
      assert.ok(kisi.islemler.includes('kisiler.oku'), kod);
      assert.ok(!kisi.islemler.includes('kisiler.rol-yonet'), kod);
      assert.equal((await oku(kisi.cerez)).statusCode, 403, kod);
    }
    const operator = await girisYap('operator');
    assert.equal((await oku(operator.cerez)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/rol-islemleri' })).statusCode, 401);
  });
});
