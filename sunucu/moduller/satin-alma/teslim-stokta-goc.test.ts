import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TESLIM_GOCU = '_satin_alma_teslim_stokta.sql';
const TESLIM_SUTUNLARI = ['kalite', 'teslim_alan_kisi_id', 'teslim_tarihi'];

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Göçten önceki şema kurulur; teslimi stoka taşıyan göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('sateslim');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-sateslim-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(TESLIM_GOCU)) ?? '';
  assert.ok(goc, 'teslim göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}
async function bitir(o: Ortam | undefined): Promise<void> {
  if (!o) return;
  await rm(o.klasor, { recursive: true, force: true });
  await o.ortam.kaldir();
}
async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}
async function sutunlar(o: Ortam, tablo: string, adlar: string[]): Promise<string[]> {
  return (await o.ortam.vt.sorgu<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2::text[]) ORDER BY column_name',
    [tablo, adlar],
  )).map((r) => r.column_name);
}
async function tabloVarMi(o: Ortam, tablo: string): Promise<boolean> {
  return (await o.ortam.vt.tek<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [tablo]))?.t != null;
}

// Kararı verilmiş, siparişi açılmış tek talep; teslim sütunları istenen değerle.
async function siparisKur(o: Ortam, teslim: { tarih?: string; kalite?: string; alan?: boolean }): Promise<string> {
  const talepId = randomUUID();
  const teklifId = randomUUID();
  await o.ortam.vt.tx(async (db) => {
    const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
    await db.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES (910001)');
    await db.sorgu(
      "INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, 1, 'Deneme talep', $2, $2, 'siparis_verildi')",
      [talepId, kisi],
    );
    await db.sorgu(
      "INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, 910001, '2026-10-01', 'TRY')", [talepId, teklifId],
    );
    await db.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-10-02')", [talepId, teklifId]);
    await db.sorgu(
      `INSERT INTO satin_alma_siparis (talep_id, teklif_id, siparis_no, siparis_tarihi, teslim_tarihi, kalite, teslim_alan_kisi_id)
       VALUES ($1, $2, 'SA-1', '2026-10-03', $3, $4, $5)`,
      [talepId, teklifId, teslim.tarih ?? null, teslim.kalite ?? null, teslim.alan ? kisi : null],
    );
  });
  return talepId;
}

describe('satın almada teslimi stoka taşıyan göç (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => { await bitir(o); o = undefined; });

  // Göç durunca hiçbir şey değişmemiştir: teslim sütunları ve malzeme_id yerinde, sipariş satırı ve malzeme_no yok.
  async function hicbirSeyDegismedi(): Promise<void> {
    assert.deepEqual(await sutunlar(al(), 'satin_alma_siparis', TESLIM_SUTUNLARI), TESLIM_SUTUNLARI);
    assert.deepEqual(await sutunlar(al(), 'satin_alma_katalog', ['malzeme_id', 'malzeme_no']), ['malzeme_id']);
    assert.equal(await tabloVarMi(al(), 'satin_alma_siparis_satiri'), false);
  }

  test('teslim bilgisi olmayan şemada göç geçer: teslim sütunları düşer, sipariş satırı açılır, malzeme_no yabancı anahtarsız tamsayıdır; sipariş korunur', async () => {
    const talepId = await siparisKur(al(), {});
    assert.deepEqual(await gocuDene(al()), [al().goc]);
    assert.deepEqual(await sutunlar(al(), 'satin_alma_siparis', TESLIM_SUTUNLARI), []);
    assert.equal(await tabloVarMi(al(), 'satin_alma_siparis_satiri'), true);
    const malzeme = await al().ortam.vt.tek<{ tur: string; bos: string }>(
      "SELECT data_type AS tur, is_nullable AS bos FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'satin_alma_katalog' AND column_name = 'malzeme_no'");
    assert.deepEqual(malzeme, { tur: 'integer', bos: 'YES' });
    const yabanci = await al().ortam.vt.sorgu(
      "SELECT 1 FROM pg_constraint WHERE conrelid = 'satin_alma_katalog'::regclass AND contype = 'f'");
    assert.deepEqual(yabanci, []);
    assert.deepEqual(await al().ortam.vt.sorgu('SELECT siparis_no FROM satin_alma_siparis WHERE talep_id = $1', [talepId]), [{ siparis_no: 'SA-1' }]);
  });

  test('teslim tarihi ve kalitesi dolu sipariş varken göç sayıyı yazıp durur, hiçbir şey değişmez', async () => {
    await siparisKur(al(), { tarih: '2026-10-05', kalite: 'sorunsuz' });
    await assert.rejects(gocuDene(al()), /satin_alma_siparis: 1 siparişte teslim bilgisi/);
    await hicbirSeyDegismedi();
    const [s] = await al().ortam.vt.sorgu<{ kalite: string }>('SELECT kalite FROM satin_alma_siparis');
    assert.equal(s?.kalite, 'sorunsuz');
  });

  test('yalnız teslim alan kişi dolu siparişte de göç durur', async () => {
    await siparisKur(al(), { alan: true });
    await assert.rejects(gocuDene(al()), /satin_alma_siparis: 1 siparişte teslim bilgisi/);
    await hicbirSeyDegismedi();
  });

  test('katalogda eski malzeme_id dolu kayıt varken göç durur, hiçbir şey değişmez', async () => {
    await al().ortam.vt.sorgu("INSERT INTO satin_alma_katalog (id, kod, ad, malzeme_id) VALUES ($1, 'M-0001', 'Deneme kalem', 7)", [randomUUID()]);
    await assert.rejects(gocuDene(al()), /satin_alma_katalog: 1 kayıtta malzeme_id dolu/);
    await hicbirSeyDegismedi();
  });
});
