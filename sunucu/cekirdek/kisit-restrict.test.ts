import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { kisitIhlali } from './db.ts';
import type { Veritabani } from './db.ts';
import { testVeritabaniKur } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

// RESTRICT eylemli yabancı anahtar PostgreSQL 18'de 23001, öncekilerde 23503 bildirir. Bu listedeki her anahtar sınır katmanında
// 409 BAGIMLI_KAYIT olur; yeni RESTRICT anahtar eklenince liste ve aşağıdaki gerçek ihlal testi birlikte güncellenir. Modül kendi
// servisinde `pgKodu === '23503'` diye bakıyorsa RESTRICT anahtarında bu ret onu ıskalar: `hata.kod === 'BAGIMLI_KAYIT'` ile bakılır.
const RESTRICT_ANAHTARLARI = [
  'kalibrasyon_kaydi.alet_id -> olcu_aleti',
  // Gerçek ihlal testi stokta: `stok.test.ts` DEP-14/12/13, DEP-09/13 ve DEP-57 bakiyeli konumu kapatmayı uçtan 409 BAGIMLI_KAYIT ile sınar.
  'stok_bakiye.konum_aktif -> stok_konum',
  'stok_bakiye.konum_id -> stok_konum',
];

describe('RESTRICT yabancı anahtar (bütün göçler, gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let sahip: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): { vt: Veritabani; sahip: Veritabani } => {
    if (!vt || !sahip) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return { vt, sahip };
  };

  before(async () => {
    const ortam = await testVeritabaniKur('kisitr');
    ({ vt, sahip, kaldir } = ortam);
  });
  after(async () => { await kaldir?.(); });

  test('şemadaki RESTRICT anahtarlar bilinen listedir: yenisi bu dosyada gerçek ihlal testiyle eklenir', async () => {
    const satirlar = await acik().sahip.sorgu<{ anahtar: string }>(
      `SELECT c.conrelid::regclass::text || '.' || a.attname || ' -> ' || c.confrelid::regclass::text AS anahtar
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND (c.confdeltype = 'r' OR c.confupdtype = 'r')
          AND c.connamespace = current_schema()::regnamespace
        ORDER BY 1`,
    );
    assert.deepEqual(satirlar.map((s) => s.anahtar), RESTRICT_ANAHTARLARI);
  });

  test('kalibrasyon: kaydı olan aletin SQL ile silinmesi bu sunucuda hangi kodla düşerse düşsün 409 BAGIMLI_KAYIT; kaydı olmayan silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    const alet = async (no: string): Promise<number> => (await s.tek<{ id: number }>(
      'INSERT INTO olcu_aleti (no, tur_id) SELECT $1, min(id) FROM olcu_aleti_turu RETURNING id', [no]))?.id ?? 0;
    const kayitli = await alet('R-KAYITLI');
    const bos = await alet('R-BOS');
    await s.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, '2026-10-01', $2, 'uygun')", [kayitli, kisi?.id]);

    const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM olcu_aleti WHERE id = $1', [kayitli])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(ham);
    assert.notEqual(ihlal, null, 'sunucu kodu tanınmadı');
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.hata.durum, 409);
    assert.equal(ihlal?.iz.kisit, 'kalibrasyon_kaydi_alet_id_fkey');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));

    // Sınır katmanı: kural denetimi atlanmış bir yazma ucunda bile 500 değil 409.
    const app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, [uc({
      yontem: 'POST', yol: '/aletler/:id/sil', yetki: 'acik',
      parametre: z.object({ id: z.coerce.number().int() }), cevap: z.object({ tamam: z.literal(true) }),
      isle: async ({ db, parametre }) => { await db.sorgu('DELETE FROM olcu_aleti WHERE id = $1', [parametre.id]); return { tamam: true as const }; },
    })], { vt: uygulama, kimlik: async () => null });
    const red = await app.inject({ method: 'POST', url: `/api/aletler/${kayitli}/sil` });
    assert.equal(red.statusCode, 409, red.body);
    assert.equal(red.json().kod, 'BAGIMLI_KAYIT');
    assert.equal((await app.inject({ method: 'POST', url: `/api/aletler/${bos}/sil` })).statusCode, 200);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM olcu_aleti WHERE id = ANY($1)', [[kayitli, bos]]))?.n, 1);
    await app.close();
  });
});
