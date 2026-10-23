import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { StokYokIstekleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';

const PAROLA = 'dogru-parola-1';

describe('satın alma: stokta olmayan malzeme istekleri (kart #435, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', sa: '', operator: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const al = (cerez: string) => app.inject({ method: 'GET', url: '/api/satin-alma-stok-yok-istekleri', headers: { cookie: cerez } });
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  async function kartAc(sira: number, ad: string, birim: string): Promise<number> {
    const kimlik = `sy-kart-${sira}`;
    const r = await post(c.yonetici, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      // Malzeme sihirbazının zorunlu alanları (malzemeler B11): aile, kalite ve kart başına ayrı ölçü.
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira }, com: { kod: `HM-SYI-0000${sira}`, ad, birim }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: `hammadde|stok-yok|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    return (await ortam!.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = $1", [`HM-SYI-0000${sira}`]))!.no;
  }
  let istasyonId = 0;
  let emirId = 0;
  const istek = (kaynak: string, malzemeId: number, miktar: string, durum: string, acilis: string, uretimEmriId: number | null) =>
    ortam!.sahip.sorgu(
      `INSERT INTO stok_malzeme_istegi (no, kaynak_kimligi, malzeme_id, miktar, istasyon_id, uretim_emri_id, durum, kisi_id, acilis)
       VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`, [kaynak, malzemeId, miktar, istasyonId, uretimEmriId, durum, yoneticiId, acilis, `MI-${kaynak}`]);

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_stok_yok');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.operator = await rolluKisi('operator', 'operator');
    assert.equal((await post(c.yonetici, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })).statusCode, 200);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SYM1', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('SYI1', 'Deneme istasyon', $1, true) RETURNING id", [im!.id]))!.id;
    emirId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('P-SY', 'Deneme', 1, $1, $2, 'planli') RETURNING id", [istasyonId, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('stok_yok istekleri en eski üstte, malzeme kodu ve adı ile emir no ile gelir; diğer durumlar gelmez', async () => {
    const bos = await kartAc(1, 'Deneme çubuk', 'kg');
    const baska = await kartAc(2, 'Deneme levha', 'adet');
    await istek('sy-yeni', baska, '1.5', 'stok_yok', '2026-10-15T09:00:00Z', null);
    await istek('sy-eski', bos, '3', 'stok_yok', '2026-10-14T08:00:00Z', emirId);
    await istek('sy-acik', bos, '2', 'acik', '2026-10-13T08:00:00Z', null);
    const r = await al(c.sa);
    assert.equal(r.statusCode, 200, r.body);
    const { istekler } = r.json() as StokYokIstekleriCevabi;
    assert.equal(istekler.length, 2, 'yalnız stok_yok');
    assert.deepEqual(istekler.map((i) => [i.malzemeKodu, i.malzemeAdi, i.miktar, i.birim]), [['HM-SYI-00001', 'Deneme çubuk', '3.000', 'kg'], ['HM-SYI-00002', 'Deneme levha', '1.500', 'adet']]);
    assert.match(istekler[0]!.emirNo ?? '', /^UE-\d+$/);
    assert.equal(istekler[1]!.emirNo, null, 'emri olmayan istekte emir no boş');
    assert.match(istekler[0]!.no, /^MI-sy-/);
    assert.match(istekler[0]!.acilma, /^2026-10-14T/);
  });

  test('satin-alma.yaz olmayan 403 alır; yazan 200 alır', async () => {
    assert.equal((await al(c.operator)).statusCode, 403);
    assert.equal((await al(c.sa)).statusCode, 200);
  });

  test('çözücü kayıtlı değilse (kablolanmamış süreç) açık hata atılır, sessizce boş dönmez', () => {
    const url = pathToFileURL(join(import.meta.dirname, 'servis.ts')).href;
    const betik = `
      const { stokYokIstekleri } = await import(${JSON.stringify(url)});
      try { await stokYokIstekleri({ sorgu: async () => [], tek: async () => null }); console.log('ATILMADI'); } catch (h) { console.log('HATA=' + h.message); }`;
    const kos = spawnSync(process.execPath, ['--import', './araclar/ortam-yukle-goc.ts', '--input-type=module', '-e', betik], {
      cwd: join(import.meta.dirname, '..', '..', '..'), encoding: 'utf8',
    });
    assert.equal(kos.status, 0, kos.stderr);
    assert.match(kos.stdout, /HATA=.*çözücü/);
  });
});
