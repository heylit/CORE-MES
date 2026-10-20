import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Hedef göçten önceki şema kurulur; hedef göç henüz uygulanmaz.
async function hazirla(sonEk: string): Promise<Ortam> {
  const ortam = await testSemasiAc('sabagla');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-sabagla-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(sonEk)) ?? '';
  assert.ok(goc, `${sonEk} göçü bulunamadı`);
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}
async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}
async function kisitVarMi(o: Ortam, ad: string): Promise<boolean> {
  return (await o.ortam.vt.sorgu('SELECT 1 FROM pg_constraint WHERE conname = $1 AND connamespace = current_schema()::regnamespace', [ad])).length > 0;
}

describe('satın alma bağla göçleri (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarlarını denetleyin).'); return o; };
  afterEach(async () => { if (!o) return; await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); o = undefined; });

  test('SA1: finansta firması olan tedarikçiyle göç geçer, yabancı anahtar gelir; firması olmayan tedarikçi eklenemez', async () => {
    o = await hazirla('_satin_alma_tedarikci_firma.sql');
    const firma = await al().ortam.vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
      return (await db.tek<{ id: number }>("INSERT INTO finans_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarik', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
    });
    await al().ortam.vt.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    assert.deepEqual(await gocuDene(al()), [al().goc]);
    assert.equal(await kisitVarMi(al(), 'satin_alma_tedarikci_firma'), true);
    await assert.rejects(al().ortam.vt.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES (999999)'), /satin_alma_tedarikci_firma/);
  });

  test('SA1: finansta firması olmayan tedarikçi varken göç sayıyı ve kimliği yazıp durur, hiçbir şey değişmez', async () => {
    o = await hazirla('_satin_alma_tedarikci_firma.sql');
    await al().ortam.vt.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES (910001)');
    await assert.rejects(gocuDene(al()), /satin_alma_tedarikci: 1 tedarikçinin finansta firması yok \(firma_id: 910001\)/);
    assert.equal(await kisitVarMi(al(), 'satin_alma_tedarikci_firma'), false);
    assert.equal((await al().ortam.vt.sorgu('SELECT 1 FROM satin_alma_tedarikci')).length, 1);
  });
  // Döviz teklifi, bağımlı tablolarla birlikte en az alanla kurulur.
  async function dovizTeklifi(o: Ortam, kur: string | null): Promise<void> {
    await o.ortam.vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
      await db.sorgu("INSERT INTO satin_alma_kur (para_birimi, kur, sira) VALUES ('USD', 40, 1)");
      await db.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id) VALUES ('00000000-0000-4000-8000-000000000001', 2026, 1, 'Deneme', $1, $1)", [kisi]);
      await db.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, teklif_tarihi, para_birimi, kur) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '2026-10-01', 'USD', $1)", [kur]);
    });
  }
  async function sutunVarMi(o: Ortam, tablo: string, sutun: string): Promise<boolean> {
    return (await o.ortam.vt.sorgu('SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [tablo, sutun])).length > 0;
  }

  test('SA3: kurlu döviz teklifiyle göç geçer; güncel kur sütunu düşer, teklifin kuru kalır, kursuz döviz teklifi yazılamaz', async () => {
    o = await hazirla('_satin_alma_kur_finanstan.sql');
    await dovizTeklifi(al(), '41.5');
    assert.deepEqual(await gocuDene(al()), [al().goc]);
    assert.equal(await sutunVarMi(al(), 'satin_alma_kur', 'kur'), false);
    assert.deepEqual(await al().ortam.vt.sorgu('SELECT kur::text AS kur FROM satin_alma_teklif'), [{ kur: '41.500000' }]);
    await assert.rejects(al().ortam.vt.sorgu("UPDATE satin_alma_teklif SET kur = NULL"), /satin_alma_teklif_doviz_kuru/);
  });

  test('SA3: kursuz döviz teklifi varken göç sayıyı ve teklifi yazıp durur, hiçbir şey değişmez', async () => {
    o = await hazirla('_satin_alma_kur_finanstan.sql');
    await dovizTeklifi(al(), null);
    await assert.rejects(gocuDene(al()), /satin_alma_teklif: 1 döviz teklifinin kuru yok \(ST-2026-001 USD teklifi 00000000-0000-4000-8000-0000000000a1\)/);
    assert.equal(await sutunVarMi(al(), 'satin_alma_kur', 'kur'), true);
    assert.equal(await kisitVarMi(al(), 'satin_alma_teklif_doviz_kuru'), false);
  });
  // Malzeme kartı ve katalog kalemi en az alanla kurulur; malzemeNo verilmezse kalem karta bağlı değildir.
  async function katalogKalemi(o: Ortam, kartli: boolean): Promise<void> {
    await o.ortam.vt.tx(async (db) => {
      let no: number | null = null;
      if (kartli) {
        const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
        await db.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-DNM-', 1) ON CONFLICT (onek) DO NOTHING");
        no = (await db.tek<{ no: number }>(
          `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
           VALUES ('dnm-1', 'hammadde', 'HM-DNM-', 1, 'aktif', '{"id":"dnm-1"}', $1, $1) RETURNING no`, [kisi]))!.no;
      }
      await db.sorgu("INSERT INTO satin_alma_katalog (id, kod, ad, malzeme_no) VALUES ('00000000-0000-4000-8000-0000000000c1', 'M-0001', 'Deneme kalem', $1)", [no]);
    });
  }

  test('SA2: karta bağlı kalemle göç geçer; bağ zorunlu olur, olmayan karta bağlanamaz', async () => {
    o = await hazirla('_satin_alma_katalog_malzeme_bagi.sql');
    await katalogKalemi(al(), true);
    assert.deepEqual(await gocuDene(al()), [al().goc]);
    assert.equal(await kisitVarMi(al(), 'satin_alma_katalog_malzeme'), true);
    await assert.rejects(al().ortam.vt.sorgu('UPDATE satin_alma_katalog SET malzeme_no = 999999'), /satin_alma_katalog_malzeme/);
    await assert.rejects(al().ortam.vt.sorgu('UPDATE satin_alma_katalog SET malzeme_no = NULL'), /malzeme_no/);
  });

  test('SA2: karta bağlı olmayan kalem varken göç sayıyı ve kalemi yazıp durur, hiçbir şey değişmez', async () => {
    o = await hazirla('_satin_alma_katalog_malzeme_bagi.sql');
    await katalogKalemi(al(), false);
    await assert.rejects(gocuDene(al()), /satin_alma_katalog: 1 kalem bir malzeme kartına bağlı değil \(M-0001 Deneme kalem\)/);
    assert.equal(await kisitVarMi(al(), 'satin_alma_katalog_malzeme'), false);
  });
});
