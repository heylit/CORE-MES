import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MerkezKontrolCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { merkezDurumunuOkuyabilirMi, merkezdenAlabilirMi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// Soru 197 a (19.1): terminal eski revizyonu başlatmadan önce gösterir; merkez çiziminin durumunu paketi okuyabilen her Arkon rolü sorar.
// Merkezden listeleme ve dosya alma paket yazanlarda kalır.
describe('merkez çizimi durumu paketi okuyanlara açık', () => {
  test('kural: bütün Arkon rolleri durumu okur; dosya almayı yalnız paket yazanlar yapar', () => {
    for (const rol of ['admin', 'plan', 'prep', 'quality', 'operator', 'lead', 'maint'] as const) assert.equal(merkezDurumunuOkuyabilirMi(rol), true, rol);
    assert.equal(merkezdenAlabilirMi('operator'), false);
    assert.equal(merkezdenAlabilirMi('lead'), false);
  });

  describe('gerçek PostgreSQL', () => {
    let ortam: TestVeritabani | undefined;
    let app: FastifyInstance;
    let yoneticiId = 0;
    const vt = (): TestVeritabani['vt'] => {
      if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      return ortam.vt;
    };
    async function kisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
      const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
      if (!yoneticiRolu || !rol) throw new Error('rol kurulamadı');
      for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yoneticiId, id, rol.id);
        await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      });
      const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      assert.equal(c.statusCode, 200);
      return String(c.headers['set-cookie']).split(';')[0] ?? '';
    }
    const get = async (cerez: string, yol: string) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

    before(async () => {
      ortam = await testVeritabaniKur('arkonmerkez');
      app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
      yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    });
    after(async () => {
      await ortam?.kaldir();
    });

    test('operatör ve amir kontrolü okur; merkez listesine giremez; Arkon rolü olmayan 403', async () => {
      const ozet = 'a'.repeat(64);
      for (const [ad, islem] of [['mkop', 'arkon.operator'], ['mkam', 'arkon.amir']] as const) {
        const cerez = await kisi(ad, [islem, 'sayfa.arkon']);
        const c = await get(cerez, `/arkon/cizim-merkezi/kontrol?dosyalar=999999:${ozet}`);
        assert.equal(c.statusCode, 200, c.body);
        assert.deepEqual((c.json() as MerkezKontrolCevabi).durumlar, [{ belgeId: 999999, durum: 'yayindan-kalkti', ozet: null }]);
        assert.equal((await get(cerez, '/arkon/cizim-merkezi/belgeler')).statusCode, 403);
      }
      const rolsuz = await kisi('mkrs', ['sayfa.arkon']);
      assert.equal((await get(rolsuz, `/arkon/cizim-merkezi/kontrol?dosyalar=1:${ozet}`)).statusCode, 403);
    });
  });
});
