import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import type { Db } from '#cekirdek/db.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// 3405: kademe göçü dolu tabanda. Hazırlık kademesinin değiştirilmiş ayarı, defteri ve özeti, satın alma hatırlatmalarının gün
// ayarları ortak tablolara geçer; eski tablolar değişmez. Değiştirilmemiş tabanda ayar satırı yazılmaz. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const KADEME_GOCU = '_bildirim_kademe.sql';

const ayarlar = (db: Db) => db.sorgu<Record<string, unknown>>(
  'SELECT kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, yonetici_rol_id FROM bildirim_kademe_ayari ORDER BY kaynak');

describe('kademe göçü (3405, gerçek PostgreSQL)', () => {
  const acilan: { ortam: TestVeritabani; klasor: string }[] = [];
  after(async () => {
    for (const a of acilan) {
      await rm(a.klasor, { recursive: true, force: true });
      await a.ortam.kaldir();
    }
  });

  // Göçten önceki şemayı kurar; doldur o tabana veri yazar; sonra yalnız kademe göçü uygulanır.
  async function gocle(onek: string, doldur: (ortam: TestVeritabani, kisi: number) => Promise<void>): Promise<TestVeritabani> {
    const ortam = await testSemasiAc(onek);
    const klasor = await mkdtemp(join(tmpdir(), `tmiv2-${onek}-`));
    acilan.push({ ortam, klasor });
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(KADEME_GOCU));
    assert.ok(goc, 'kademe göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: `${onek}-y`, parola: 'dogru-parola-1' }));
    await doldur(ortam, kisi);
    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
    return ortam;
  }

  test('dolu taban: değişmiş hazırlık ayarı, defter ve özet taşınır, kaynak başlamış sayılır; satın alma günleri ve boş değer (kapalı) taşınır', async () => {
    let gorev = 0;
    let rol = 0;
    const { sahip } = await gocle('kademegoc', async ({ sahip: s }, kisi) => {
      rol = (await s.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'"))!.id;
      await s.sorgu('UPDATE projeler_hazirlik_kademe_ayari SET hatirlat_gun = 2, yonetici_gun = 3, devret_gun = 3, yonetici_rol_id = $1, degistiren_id = $2, degisti = now() WHERE id = 1', [rol, kisi]);
      const proje = (await s.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.1', 'Göç', $1) RETURNING id", [kisi]))!.id;
      gorev = (await s.tek<{ id: number }>(
        `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_maddesi, hazirlik_emri_id)
         VALUES ($1, 'CNC kurulumu · ORN-UE-1', current_date - 10, current_date - 3, $2, 'cnc', 901) RETURNING id`, [proje, kisi]))!.id;
      await s.sorgu('INSERT INTO projeler_hazirlik_kademe (gorev_id, kademe, bildirildi, alici_sayisi) VALUES ($1, 1, false, 0), ($1, 3, true, 2)', [gorev]);
      await s.sorgu("INSERT INTO projeler_hazirlik_ozet (gun, gorev_sayisi) VALUES ('2030-01-07', 4)");
      await s.sorgu(`INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES
        ('satin-alma.hatirlatma-onay-bekliyor', '4', $1), ('satin-alma.hatirlatma-siparis-bekliyor', 'null', $1),
        ('satin-alma.hatirlatma-teslim-gecikti-yonetici', '5', $1)`, [kisi]);
    });
    const satir = (kaynak: string, acik: boolean, k2: number | null, k3: number | null, k4: number, k5: number | null, eposta: number, serit: boolean, rolId: number | null = null) =>
      ({ kaynak, acik, k2_gun: k2, k3_gun: k3, k4_gun: k4, k5_gun: k5, eposta_kademe: eposta, serit, kapatilamaz: serit, yonetici_rol_id: rolId });
    assert.deepEqual(await ayarlar(sahip), [
      satir('projeler.hazirlik', true, 2, null, 3, 4, 2, true, rol),
      satir('satin-alma.siparis-verilmedi', false, null, 1, 2, 5, 3, true),
      satir('satin-alma.talep-onay', true, null, 4, 2, 5, 3, true),
      satir('satin-alma.teklif-cevapsiz', true, null, 3, 3, null, 3, false),
      satir('satin-alma.teslim', true, 3, null, 5, 6, 3, true),
    ], 'hazırlıkta K5 K4\'ten sonra; onay 4 gün; boş sipariş ayarı kaynağı kapatır; teslimde yaklaşma ayarı yoksa K2 3');
    assert.deepEqual(await sahip.sorgu("SELECT kayit, kademe, bildirildi, alici_sayisi FROM bildirim_kademe_defteri WHERE kaynak = 'projeler.hazirlik' ORDER BY kademe"),
      [{ kayit: String(gorev), kademe: 1, bildirildi: false, alici_sayisi: 0 }, { kayit: String(gorev), kademe: 3, bildirildi: true, alici_sayisi: 2 }]);
    assert.deepEqual(await sahip.sorgu("SELECT gun::text AS gun, kayit_sayisi FROM bildirim_kademe_ozet WHERE kaynak = 'projeler.hazirlik'"), [{ gun: '2030-01-07', kayit_sayisi: 4 }]);
    assert.deepEqual(await sahip.sorgu('SELECT kaynak FROM bildirim_kademe_baslangic'), [{ kaynak: 'projeler.hazirlik' }], 'ilk çalışma sessiz geçmez');
    assert.equal((await sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_hazirlik_kademe'))?.n, 2, 'eski defter yerinde');
  });

  test('değiştirilmemiş taban: ayar satırı yazılmaz (katalog varsayılanı geçer); hazırlık yine başlamış sayılır', async () => {
    const { sahip } = await gocle('kademegocbos', async () => {});
    assert.deepEqual(await ayarlar(sahip), []);
    assert.deepEqual(await sahip.sorgu('SELECT kaynak FROM bildirim_kademe_baslangic'), [{ kaynak: 'projeler.hazirlik' }]);
  });
});
