import assert from 'node:assert/strict';
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
const KOPYA_GOCU = '_kalibrasyon_arkon_kopyasi.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Kopya göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('kalkopya');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-kalkopya-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(KOPYA_GOCU)) ?? '';
  assert.ok(goc, 'kopya göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const arkonAleti = (o: Ortam, kimlik: string, g: unknown) => o.ortam.vt.sorgu(
  "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('gauges', $1, $2, 1, $3)", [kimlik, JSON.stringify(g), o.kisiId]);

// Tesis saatiyle (UTC+3) öğlen.
const AT = Date.UTC(2026, 2, 10, 9, 0, 0);
const AT2 = Date.UTC(2026, 5, 1, 9, 0, 0);

describe('Arkon ölçü aletlerinin Kalibrasyon modülüne kopya göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('alet, tür ve geçmiş kopyalanır; aynı numara korunur; bozuk alet ve kayıt atlanır; Arkon belgesi değişmez', async () => {
    const x = al();
    const tur = await x.ortam.vt.tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    await x.ortam.vt.sorgu("INSERT INTO olcu_aleti (no, tur_id, ad) VALUES ('KM-1', $1, 'TMI kaydı')", [tur!.id]);
    const kalite = await x.ortam.vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kalite') RETURNING id");
    const mk = {
      id: 'g-1', no: ' mk-7 ', type: 'mikrometre', name: '25-50', range: '0,001', loc: 'Dolap', interval: 180, last: AT2, status: 'ok',
      cals: [
        { at: AT, by: 'Deneme Kalite', res: 'ok', cert: 'S-1' }, { at: AT2, by: 'Bilinmeyen', res: 'nok', note: 'ayar' },
        // UTC 22:30 tesiste ertesi gündür: tarih tesis gününe çevrilir.
        { at: Date.UTC(2026, 3, 1, 22, 30), by: 'Deneme Kalite', res: 'ok' },
        { at: 'x', res: 'ok' }, { at: AT, res: 'belki' }, { at: Date.now() + 5 * 864e5, by: '', res: 'ok' },
      ],
    };
    await arkonAleti(x, 'g-1', mk);
    await arkonAleti(x, 'g-2', { id: 'g-2', no: 'KM-1', type: 'Kumpas', interval: 30, status: 'ok', cals: [{ at: AT, by: '', res: 'ok' }] });
    await arkonAleti(x, 'g-3', { id: 'g-3', no: 'YK-1', type: 'Yüzey ölçer', interval: -4, status: 'out', last: AT });
    await arkonAleti(x, 'g-4', { id: 'g-4', no: '', type: 'Kumpas' });
    await arkonAleti(x, 'g-5', { id: 'g-5', no: 'Z-1', type: ' ' });
    assert.deepEqual(await gocuDene(x), [x.goc]);

    assert.deepEqual(await x.ortam.vt.sorgu(
      `SELECT a.no, t.ad AS tur, a.ad, a.olcme_araligi, a.yer, a.periyot_gun, a.kullanim_disi, a.kullanim_disi_nedeni
         FROM olcu_aleti a JOIN olcu_aleti_turu t ON t.id = a.tur_id ORDER BY a.no`), [
      { no: 'KM-1', tur: 'Kumpas', ad: 'TMI kaydı', olcme_araligi: null, yer: null, periyot_gun: 365, kullanim_disi: false, kullanim_disi_nedeni: null },
      { no: 'MK-7', tur: 'Mikrometre', ad: '25-50', olcme_araligi: '0,001', yer: 'Dolap', periyot_gun: 180, kullanim_disi: false, kullanim_disi_nedeni: null },
      { no: 'YK-1', tur: 'Yüzey ölçer', ad: null, olcme_araligi: null, yer: null, periyot_gun: 365, kullanim_disi: true, kullanim_disi_nedeni: 'Arkon kaydında kullanım dışı.' },
    ]);
    assert.deepEqual(await x.ortam.vt.sorgu(
      `SELECT a.no, k.tarih::text AS tarih, k.sonuc, k.sertifika_no, k.aciklama, k.kisi_id
         FROM kalibrasyon_kaydi k JOIN olcu_aleti a ON a.id = k.alet_id ORDER BY a.no, k.tarih, k.id`), [
      { no: 'MK-7', tarih: '2026-03-10', sonuc: 'uygun', sertifika_no: 'S-1', aciklama: null, kisi_id: kalite!.id },
      { no: 'MK-7', tarih: '2026-04-02', sonuc: 'uygun', sertifika_no: null, aciklama: null, kisi_id: kalite!.id },
      { no: 'MK-7', tarih: '2026-06-01', sonuc: 'uygunsuz', sertifika_no: null, aciklama: 'ayar', kisi_id: x.kisiId },
      { no: 'MK-7', tarih: '2026-06-01', sonuc: 'uygun', sertifika_no: null, aciklama: 'Arkon kaydındaki son kalibrasyon tarihi.', kisi_id: x.kisiId },
      { no: 'YK-1', tarih: '2026-03-10', sonuc: 'uygun', sertifika_no: null, aciklama: 'Arkon kaydındaki son kalibrasyon tarihi.', kisi_id: x.kisiId },
    ]);
    const belge = await x.ortam.vt.tek<{ govde: unknown }>("SELECT govde FROM arkon_belge WHERE depo = 'gauges' AND kimlik = 'g-1'");
    assert.deepEqual(belge?.govde, mk);
  });

  test('durum alanı ya da kayıt tarihi olmayan belge zinciri durdurmaz: alet kullanımda sayılır, tarihsiz kayıt atlanır', async () => {
    const x = al();
    await arkonAleti(x, 'g-6', { id: 'g-6', no: 'DS-1', type: 'Kumpas', cals: [{ by: '', res: 'ok' }, { at: null, res: 'nok' }, { at: AT, res: 'ok' }] });
    await arkonAleti(x, 'g-7', { id: 'g-7', no: 'DS-2', type: 'Kumpas', status: null });
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await x.ortam.vt.sorgu('SELECT no, kullanim_disi, kullanim_disi_nedeni FROM olcu_aleti ORDER BY no'), [
      { no: 'DS-1', kullanim_disi: false, kullanim_disi_nedeni: null },
      { no: 'DS-2', kullanim_disi: false, kullanim_disi_nedeni: null },
    ]);
    assert.deepEqual(await x.ortam.vt.sorgu(
      "SELECT k.tarih::text AS tarih, k.sonuc FROM kalibrasyon_kaydi k JOIN olcu_aleti a ON a.id = k.alet_id WHERE a.no = 'DS-1'"),
    [{ tarih: '2026-03-10', sonuc: 'uygun' }]);
  });

  test('Arkon alet belgesi yoksa göç bir şey eklemez', async () => {
    const x = al();
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.equal((await x.ortam.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM olcu_aleti'))?.n, 0);
  });
});
