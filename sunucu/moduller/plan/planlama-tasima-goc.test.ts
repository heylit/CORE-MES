import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// Planlama çalışmasının plan modülüne taşınması (658 b, 662 a, 663 a) dolu veritabanında: `:planlama` satırları ve geçmişleri aynen
// plan tablosuna geçer, Reçete ve Rota'da silinir, ana kayıt kalır; planlama işlemi rol ve kişide yeni adına geçer. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TASIMA = ['_plan_planlama_kaydi.sql', '_recete_rota_planlama_kaydi_cikar.sql', '_kisiler_plan_planlama_islemi.sql'];
const ANA = 'recete-rota-motoru-v1';
const PLANLAMA = `${ANA}:planlama`;
const TERCIH = `${ANA}:planlama-ui4`;

describe('planlama kaydı ve işlemi plan modülüne taşınır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('pltasi');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-pltasi-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('satırlar, sürümler ve geçmiş aynen geçer; eski satırlar silinir ve bir daha yazılamaz; işlem adı rolde ve kişide değişir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const tasima = TASIMA.map((son) => hepsi.find((ad) => ad.endsWith(son)));
    assert.ok(tasima.every((x) => x !== undefined), 'taşıma göçleri bulunamadı');
    const ilk = tasima[0]!;
    for (const ad of hepsi.filter((a) => a < ilk)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'pltasi', parola: 'dogru-parola-1' }));
    const yaz = (anahtar: string, deger: unknown, surum: number) => sahip.sorgu(
      `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, $3, $4)
       ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, surum = EXCLUDED.surum`,
      [anahtar, JSON.stringify(deger), surum, kisi]);
    await yaz(ANA, { orders: [] }, 3);
    await yaz(PLANLAMA, { surum: 2, D: { meta: { baslangic: '2026-10-26' } }, adim: 1 }, 5);
    await yaz(PLANLAMA, { surum: 2, D: { meta: { baslangic: '2026-10-26' } }, adim: 2 }, 9);
    await yaz(TERCIH, { tema: 'acik' }, 6);
    const rol = async (kod: string) => (await sahip.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    await sahip.sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'recete-rota.planlama-oku', $1)", [kisi]);
    const once = await sahip.sorgu<{ rol_id: number }>("SELECT rol_id FROM rol_islemi WHERE islem = 'recete-rota.planlama-oku' ORDER BY rol_id");
    assert.ok(once.length > 0, 'ortak matris göçü planlama işlemini rollere vermiş olmalı');
    const gecmisOnce = await sahip.sorgu('SELECT anahtar, surum, deger FROM recete_rota_kayit_gecmisi WHERE anahtar = $1 ORDER BY id', [PLANLAMA]);

    for (const ad of hepsi.filter((a) => a >= ilk)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    assert.deepEqual(
      await sahip.sorgu('SELECT anahtar, surum, deger, guncelleyen_kisi_id FROM plan_planlama_kaydi ORDER BY anahtar'),
      [
        { anahtar: PLANLAMA, surum: 9, deger: { surum: 2, D: { meta: { baslangic: '2026-10-26' } }, adim: 2 }, guncelleyen_kisi_id: kisi },
        { anahtar: TERCIH, surum: 6, deger: { tema: 'acik' }, guncelleyen_kisi_id: kisi },
      ]);
    assert.deepEqual(await sahip.sorgu('SELECT anahtar, surum, deger FROM plan_planlama_kaydi_gecmisi ORDER BY id'), gecmisOnce);
    assert.equal(gecmisOnce.length, 1, 'ikinci yazma ilkini geçmişe düşürmüştü');
    assert.deepEqual(await sahip.sorgu('SELECT anahtar FROM recete_rota_kayit ORDER BY anahtar'), [{ anahtar: ANA }], 'ana kayıt kalır');
    await assert.rejects(yaz(PLANLAMA, {}, 10), /recete_rota_kayit_planlama_yok/);
    const sonraki = await sahip.tek<{ n: string }>("SELECT nextval('plan_planlama_surum') AS n");
    assert.equal(Number(sonraki!.n), 10, 'sürüm taşınan en büyük sürümden devam eder');

    assert.deepEqual(await sahip.sorgu("SELECT islem FROM rol_islemi WHERE islem = 'recete-rota.planlama-oku'"), []);
    assert.deepEqual(await sahip.sorgu("SELECT rol_id FROM rol_islemi WHERE islem = 'plan.planlama-oku' ORDER BY rol_id"), once);
    assert.deepEqual(await sahip.sorgu("SELECT kisi_id FROM kisi_islemi WHERE islem LIKE '%planlama-oku'"), [{ kisi_id: kisi }]);
    assert.deepEqual(await sahip.sorgu("SELECT islem FROM kisi_islemi WHERE kisi_id = $1", [kisi]), [{ islem: 'plan.planlama-oku' }]);
    assert.deepEqual(
      await sahip.sorgu("SELECT rol_id FROM rol_islemi WHERE islem = 'sayfa.plan' ORDER BY rol_id"),
      [{ rol_id: await rol('mudur') }, { rol_id: await rol('planlama_proje') }].sort((a, b) => a.rol_id - b.rol_id));
  });
});
