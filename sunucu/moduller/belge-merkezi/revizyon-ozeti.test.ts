import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BelgeAyrintisi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { alinanRevizyonDosyasi, yayindakiBelgeDosyasi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2500)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

// 604 (597 a): başka modülün aldığı revizyon belge yeni revizyona geçse de verilir; kural yayındaki dosyayla aynıdır (arşivdeki belge ve
// taslak revizyon verilmez).
describe('çizim merkezi alınan revizyonun dosyası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function gonder<T>(yol: string, govde: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }
  async function yukle(icerik: Buffer): Promise<string> {
    const ozet = ozetOf(icerik);
    await gonder(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    return ozet;
  }
  async function icerik(db: Db, belgeId: number, ozet: string): Promise<Buffer | null> {
    const d = await alinanRevizyonDosyasi(db, belgeId, ozet);
    if (d === null) return null;
    const parcalar: Buffer[] = [];
    for await (const p of d.dosya.akis(db)) parcalar.push(p);
    return Buffer.concat(parcalar);
  }
  const oku = (belgeId: number, ozet: string) => vt().tx((db) => icerik(db, belgeId, ozet));
  const ayrinti = async (id: number): Promise<BelgeAyrintisi> =>
    (await app.inject({ method: 'GET', url: `/api/cizimler/${id}`, headers: { cookie: cerez } })).json() as BelgeAyrintisi;

  before(async () => {
    ortam = await testVeritabaniKur('belge_merkezi_revizyon_ozeti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'czr-yon', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'czr-yon', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('CZ-17 alınan A revizyonu B yayına girince de verilir; yayındaki dosya B olur; taslak, başka belgenin özeti ve arşivdeki belge null', async () => {
    const a = pdf();
    const b = pdf();
    const taslak = pdf();
    const ilk = await gonder<BelgeAyrintisi>('/cizimler', { ad: 'Deneme resmi', tur: 'teknik-resim', ozet: await yukle(a), dosyaAdi: 'a.pdf' });
    await gonder(`/cizimler/${ilk.id}/revizyonlar/${ilk.revizyonlar[0]!.id}/yayinla`, { surum: ilk.surum });
    assert.equal((await oku(ilk.id, ozetOf(a)))?.equals(a), true, 'yayındaki revizyon');

    const r = await gonder<BelgeAyrintisi>(`/cizimler/${ilk.id}/revizyon-ekle`, { ozet: await yukle(b), dosyaAdi: 'b.pdf', surum: (await ayrinti(ilk.id)).surum });
    await gonder(`/cizimler/${ilk.id}/revizyonlar/${r.revizyonlar.find((x) => x.harf === 'B')!.id}/yayinla`, { surum: r.surum });
    assert.equal((await oku(ilk.id, ozetOf(a)))?.equals(a), true, 'eski revizyon yine verilir');
    assert.equal((await oku(ilk.id, ozetOf(b)))?.equals(b), true);
    assert.equal((await vt().tx((db) => yayindakiBelgeDosyasi(db, ilk.id)))?.ozet, ozetOf(b));

    await gonder(`/cizimler/${ilk.id}/revizyon-ekle`, { ozet: await yukle(taslak), dosyaAdi: 't.pdf', surum: (await ayrinti(ilk.id)).surum });
    assert.equal(await oku(ilk.id, ozetOf(taslak)), null, 'taslak verilmez');

    const baska = await gonder<BelgeAyrintisi>('/cizimler', { ad: 'Başka resim', tur: 'teknik-resim', ozet: await yukle(pdf()), dosyaAdi: 'c.pdf' });
    assert.equal(await oku(baska.id, ozetOf(a)), null, 'başka belgenin özeti verilmez');
    assert.equal(await oku(999999, ozetOf(a)), null);

    await gonder(`/cizimler/${ilk.id}/arsivle`, { surum: (await ayrinti(ilk.id)).surum });
    assert.equal(await oku(ilk.id, ozetOf(a)), null, 'arşivdeki belge verilmez');
  });
});
