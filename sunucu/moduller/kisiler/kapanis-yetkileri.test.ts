import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const KAPANIS = ['uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-oku', 'uretim-emirleri.kapanis-onay'] as const;

// Kullanıcı kararı 1078 a (okuma teyitli): kalite onayı kalitede, müdür onayı müdürde, sayfa ikisinde ve planlamada; başka rol almaz.
// Yetkiler yalnız göçten gelir; ölçülen girişte alınan işlem kümesidir (uçlar bu kümeyle denetler).
describe('emir kapanışı rol yetkileri (gerçek PostgreSQL, gerçek giriş)', () => {
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
  async function kapanisIslemleri(rolKodu: string, ekRolKodu?: string): Promise<string[]> {
    const kullaniciAdi = `k${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const ekRol = ekRolKodu === undefined ? null : await rolId(ekRolKodu);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId === 0) yoneticiId = yeni;
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      if (ekRol !== null) await rolAta(db, yoneticiId, yeni, ekRol);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    const islemler = c.json().kullanici.islemler as string[];
    return islemler.filter((i) => (KAPANIS as readonly string[]).includes(i)).sort();
  }

  before(async () => {
    ortam = await testVeritabaniKur('kapanisyetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await kapanisIslemleri('yonetici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kalite kalite onayını, müdür müdür onayını alır; ikisi ve planlama sayfayı görür; yönetici hepsini taşır; öteki roller hiçbirini almaz', async () => {
    const BEKLENEN: Record<string, string[]> = {
      yonetici: [...KAPANIS],
      kalite: ['uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-oku'],
      mudur: ['uretim-emirleri.kapanis-oku', 'uretim-emirleri.kapanis-onay'],
      planlama_proje: ['uretim-emirleri.kapanis-oku'],
    };
    const roller = (await vt().sorgu<{ kod: string }>('SELECT kod FROM rol ORDER BY kod')).map((r) => r.kod);
    for (const kod of Object.keys(BEKLENEN)) assert.ok(roller.includes(kod), kod);
    for (const kod of roller) assert.deepEqual(await kapanisIslemleri(kod), BEKLENEN[kod] ?? [], kod);
  });

  test('kalite ve müdür rolü olan kişi iki onayı da taşır (1077 b); kalite müdür onayını, müdür kalite onayını tek başına almaz', async () => {
    assert.deepEqual(await kapanisIslemleri('kalite', 'mudur'), [...KAPANIS]);
    assert.equal((await kapanisIslemleri('kalite')).includes('uretim-emirleri.kapanis-onay'), false);
    assert.equal((await kapanisIslemleri('mudur')).includes('uretim-emirleri.kapanis-kalite'), false);
  });
});
