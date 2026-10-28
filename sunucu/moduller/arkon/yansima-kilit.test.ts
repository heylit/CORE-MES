import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// 883 a sondası: `arkon_tmi_yansima.emir_id` yabancı anahtar alırsa kilitlenme olur mu. Yansıma satırı, kilidi alınamamış emre de yazılır
// (servis.ts `emirKilitleriniAl`: "Alınamayan emrin satırları yine yazılır"); emri tutan istek ise komutta önce üst emri, sonra kolu
// FOR UPDATE kilitler (uretim-emirleri `ustuOnceKilitle`). Yabancı anahtar her yansıma eklemesinde emir satırına KEY SHARE alır ve
// FOR UPDATE ile çakışır. Sonda bu sırayı iki işlemle kurar; yabancı anahtar ayrı bir sonda tablosundadır, çünkü asıl tablo değişmedi.
describe('Arkon yansıma emir bağı kilitlenme sondası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let ust = 0;
  let kol = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('arkon_yansima_kilit');
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMSND', 'Deneme Merkezi') RETURNING id");
    const ist = await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TEISND', 'Deneme tezgah', $1, true) RETURNING id", [im!.id]);
    const emir = async () => (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('P-SONDA', 'Deneme', 1, $1, $2, 'planli') RETURNING id", [ist!.id, kisi]))!.id;
    ust = await emir();
    kol = await emir();
    const rol = (await ortam.vt.tek<{ r: string }>('SELECT current_user::text AS r'))?.r ?? '';
    await ortam.sahip.sorgu('CREATE TABLE sonda_bagsiz (emir_id int NOT NULL)');
    await ortam.sahip.sorgu('CREATE TABLE sonda_bagli (emir_id int NOT NULL CONSTRAINT sonda_bagli_emir REFERENCES uretim_emri (id))');
    await ortam.sahip.sorgu(`GRANT INSERT ON sonda_bagsiz, sonda_bagli TO "${rol}"`);
  });

  after(async () => { await ortam?.kaldir(); });

  // Arkon isteği önce kolun, sonra üstün yansımasını yazar; komut isteği üstü, sonra kolu kilitler. Arkon'un ikinci eklemesi komutun
  // kilidini beklerken komut kolu ister.
  async function iki(tablo: 'sonda_bagsiz' | 'sonda_bagli'): Promise<PromiseSettledResult<void>[]> {
    let arkonIlk!: () => void;
    let komutIlk!: () => void;
    const arkonEkledi = new Promise<void>((r) => { arkonIlk = r; });
    const komutKilitledi = new Promise<void>((r) => { komutIlk = r; });
    const arkon = o().vt.tx(async (db) => {
      await db.sorgu(`INSERT INTO ${tablo} (emir_id) VALUES ($1)`, [kol]);
      arkonIlk();
      await komutKilitledi;
      await db.sorgu(`INSERT INTO ${tablo} (emir_id) VALUES ($1)`, [ust]);
    });
    const komut = o().vt.tx(async (db) => {
      await arkonEkledi;
      await db.sorgu('SELECT id FROM uretim_emri WHERE id = $1 FOR UPDATE', [ust]);
      komutIlk();
      await db.sorgu('SELECT pg_sleep(0.3)');
      await db.sorgu('SELECT id FROM uretim_emri WHERE id = $1 FOR UPDATE', [kol]);
    });
    return Promise.allSettled([arkon, komut]);
  }

  const kod = (r: PromiseSettledResult<void>): string | null =>
    r.status === 'fulfilled' ? null : String((r.reason as { code?: unknown } | null)?.code ?? 'bilinmiyor');

  test('bugünkü hâl (yabancı anahtarsız): iki işlem de beklemeden biter', async () => {
    assert.deepEqual((await iki('sonda_bagsiz')).map(kod), [null, null]);
  });

  test('yabancı anahtarla: aynı sıra kilitlenmeye düşer, biri 40P01 ile kesilir', async () => {
    const sonuc = (await iki('sonda_bagli')).map(kod);
    assert.deepEqual(sonuc.filter((k) => k !== null), ['40P01'], JSON.stringify(sonuc));
  });
});
