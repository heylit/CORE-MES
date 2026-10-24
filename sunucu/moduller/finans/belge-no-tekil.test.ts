import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 243 a: aynı firmanın aynı yöndeki belge numarası bir kez girilir, iptal edilen sayılmaz. Firmalar ve numaralar uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TEKIL_GOCU = '_finans_belge_no_tekil.sql';
const PAROLA = 'dogru-parola-1';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('fnbelgeno');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-fnbelgeno-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(TEKIL_GOCU)) ?? '';
  assert.ok(goc, 'belge no tekillik göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}
async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}
async function dizinVarMi(o: Ortam): Promise<boolean> {
  return (await o.ortam.vt.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'finans_belge_no_tekil'"))?.n === 1;
}
// Göçten önceki şemada, kısıt yokken girilmiş belgeler.
async function belgelerKur(o: Ortam): Promise<{ kisi: number; ids: Record<string, number> }> {
  return o.ortam.vt.tx(async (db) => {
    const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: PAROLA });
    const firma = async (ad: string) => (await db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'ikisi', $2) RETURNING id", [ad, kisi]))?.id;
    const f1 = await firma('Deneme Bir');
    const f2 = await firma('Deneme Iki');
    const belge = async (firmaId: number | undefined, yon: string, no: string | null) => (await db.tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_no, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, olusturan_id)
       VALUES ($1, 'fatura', $2, $3, $4, '2026-10-01', '2026-10-31', 'TRY', 1, 100, 0, $5) RETURNING id`,
      [yon, yon === 'gelir' ? 'urun_satisi' : 'mal_alimi', firmaId, no, kisi]))?.id ?? 0;
    const ids = {
      a: await belge(f1, 'gider', 'DN-1'),
      b: await belge(f1, 'gider', 'DN-1'),
      gelir: await belge(f1, 'gelir', 'DN-1'),
      oteki: await belge(f2, 'gider', 'DN-1'),
      bos1: await belge(f1, 'gider', null),
      bos2: await belge(f1, 'gider', null),
    };
    return { kisi, ids };
  });
}

describe('finans belge no tekilliği göçü (243 a, gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('mükerrer varsa göç çakışan belge kimliklerini yazıp durur; satır silinmez, dizin kurulmaz', async () => {
    const x = al();
    const { ids } = await belgelerKur(x);
    await assert.rejects(gocuDene(x), new RegExp(`finans_belge: 1 mükerrer belge no grubu var.*belge ${ids.a}, ${ids.b}$`));
    assert.equal(await dizinVarMi(x), false);
    assert.equal((await x.ortam.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n, 6);
  });

  test('fazlası iptal edilince göç uygulanır; yön, firma ve boş numara ayrı sayılır', async () => {
    const x = al();
    const { kisi, ids } = await belgelerKur(x);
    await x.ortam.vt.sorgu("UPDATE finans_belge SET durum = 'iptal', iptal_zamani = now(), iptal_eden_id = $2 WHERE id = $1", [ids.b, kisi]);
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.equal(await dizinVarMi(x), true);
  });
});

describe('finans belge no tekilliği (243 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let firma = 0;
  let baskaFirma = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T>(yol: string, govde: unknown): Promise<{ durum: number; govde: T }> {
    const basliklar: Record<string, string> = { cookie: cerez };
    if (/\/(ekle|toplu-ice-aktar)$/.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: basliklar, payload: govde as object });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  type Cevap = { belge: Belge; kod: string; mesaj: string; alan?: string };
  const ekle = (g: Record<string, unknown>) => istek<Cevap>('/finans/belgeler/ekle', {
    yon: 'gider', kategori: 'mal_alimi', firmaId: firma, belgeTarihi: '2026-10-05', vade: '2026-11-05', tutar: 1000, kdvOrani: 20, ...g,
  });
  const tamam = (c: { durum: number; govde: Cevap }): Belge => { assert.equal(c.durum, 200, JSON.stringify(c.govde)); return c.govde.belge; };
  const mukerrer = (c: { durum: number; govde: { mesaj: string; alan?: string } }) => {
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.deepEqual([c.govde.mesaj, c.govde.alan], ['Bu belge no bu firmada zaten var.', 'belgeNo']);
  };

  before(async () => {
    ortam = await testVeritabaniKur('finansbelgeno');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const yeniFirma = async (ad: string) => (await vt().tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'ikisi', $2) RETURNING id", [ad, kisi]))?.id ?? 0;
    firma = await yeniFirma('Deneme Tedarikçi');
    baskaFirma = await yeniFirma('Deneme Öteki');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('aynı firma, yön ve numarayla ikinci belge 409; başka yön, başka firma ve numarasız belge girer', async () => {
    tamam(await ekle({ belgeNo: 'TK-100' }));
    mukerrer(await ekle({ belgeNo: 'TK-100' }));
    tamam(await ekle({ belgeNo: 'TK-100', yon: 'gelir', kategori: 'urun_satisi' }));
    tamam(await ekle({ belgeNo: 'TK-100', firmaId: baskaFirma }));
    tamam(await ekle({ belgeNo: null }));
    tamam(await ekle({ belgeNo: null }));
  });

  test('düzeltmede başka belgenin numarası 409; kendi numarasıyla düzeltme geçer', async () => {
    tamam(await ekle({ belgeNo: 'TK-200' }));
    const b = tamam(await ekle({ belgeNo: 'TK-201' }));
    const govde = { kategori: b.kategori, firmaId: firma, belgeTarihi: b.belgeTarihi, vade: b.vade, tutar: 1000, kdvOrani: 20, surum: b.surum };
    mukerrer(await istek(`/finans/belgeler/${b.id}/duzelt`, { ...govde, belgeNo: 'TK-200' }));
    assert.equal(tamam(await istek<Cevap>(`/finans/belgeler/${b.id}/duzelt`, { ...govde, belgeNo: 'TK-201', aciklama: 'Düzeltildi' })).aciklama, 'Düzeltildi');
  });

  test('iptal edilen belgenin numarası yeniden girilir', async () => {
    const b = tamam(await ekle({ belgeNo: 'TK-300' }));
    mukerrer(await ekle({ belgeNo: 'TK-300' }));
    tamam(await istek<Cevap>(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum, neden: 'Deneme' }));
    tamam(await ekle({ belgeNo: 'TK-300' }));
  });

  test('toplu aktarımda var olan numara bütün aktarımı 409 ile reddeder', async () => {
    tamam(await ekle({ belgeNo: 'TK-400' }));
    const satir = (no: string) => ({ belgeTarihi: '2026-10-05', yon: 'gider', kategori: 'mal_alimi', firma: 'Deneme Tedarikçi', belgeNo: no, tutar: 10, kdvOrani: 20, vade: '2026-10-05' });
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n;
    mukerrer(await istek('/finans/toplu-ice-aktar', { satirlar: [satir('TK-401'), satir('TK-400')] }));
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n, once);
  });
});
