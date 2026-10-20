import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoyaGidecekMalzemeler, malzemeAra, malzemeOzetleri } from './disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Ticari mal kartı (kart #1218, TM1-TM3, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<string> {
    const c = await istek(yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return String(c.json().mesaj);
  }

  // Onay akışı kapalı: kart doğrudan aktif açılır.
  let sayac = 0;
  interface Kart { tur?: string; kod?: string; birim?: string; bom?: unknown[]; ops?: unknown[] }
  const govde = (kimlik: string, o: Kart) => {
    const tur = o.tur ?? 'ticari_mal';
    return {
      kayit: {
        id: kimlik, tur, com: { kod: o.kod ?? 'TM-GEN-00001', ad: `Ticari ${kimlik}`, birim: o.birim ?? 'adet' },
        ...(o.bom ? { bom: o.bom } : {}), ...(o.ops ? { ops: o.ops } : {}), onay: { durum: 'aktif' },
      },
      ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null },
      surum: null,
    };
  };
  async function kartAc(o: Kart): Promise<{ kimlik: string; no: number; kod: string }> {
    const kimlik = `tm${++sayac}`;
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde(kimlik, o));
    const no = (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
    return { kimlik, no, kod: r.stok_kodu };
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemeticari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme ticari', kullaniciAdi: 'tm-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'tm-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('TM1: ticari mal kartı TM önekiyle açılır; özet ve arama türü verir; yanlış önek reddedilir, satır yazılmaz', async () => {
    const t = await kartAc({});
    assert.equal(t.kod, 'TM-GEN-00001');
    const o = (await vt().tx((db) => malzemeOzetleri(db, [t.no]))).get(t.no);
    assert.deepEqual([o?.tur, o?.hizmetYonu, o?.kategori, o?.birim], ['ticari_mal', null, null, 'adet']);
    const r = await vt().tx((db) => malzemeAra(db, { metin: null, turler: ['ticari_mal'], yalnizAktif: true, sayfa: 1, sayfaBoyu: 50 }));
    assert.deepEqual(r.satirlar.map((x) => x.id), [t.no]);
    assert.match(await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/tm-onek/kaydet', govde('tm-onek', { kod: 'HM-GEN-00001' })), /türüne uymuyor/);
    assert.match(await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/tm-onek2/kaydet', govde('tm-onek2', { tur: 'yarimamul', kod: 'TM-GEN-00001' })), /türüne uymuyor/);
    assert.equal(await vt().tek(`SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ('tm-onek', 'tm-onek2')`), null);
  });

  test('TM2: ticari malın Logo karşılığı yalnız 1 (422 ve adlı kısıt); 1 başka türe yazılamaz; kart karşılıkla Logo kuyruğuna eksiksiz girer', async () => {
    const t = await kartAc({ kod: 'TM-LGO-00001' });
    const yaz = (tmiDegeri: string, logoDegeri: string | null) => istek('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri, logoDegeri });
    for (const kod of ['10', '13', '4']) {
      const m = await ret(422, 'GECERSIZ', 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'ticari_mal', logoDegeri: kod });
      assert.match(m, /Ticari malın Logo kart türü 1/, kod);
    }
    await ret(422, 'GECERSIZ', 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '1' });
    const kisit = (h: { constraint?: string }) => h.constraint === 'malzeme_logo_karsiligi_izinli';
    const kisiId = (await vt().tek<{ id: number }>(`SELECT id FROM kisi WHERE kullanici_adi = 'tm-yonetici'`))!.id;
    await assert.rejects(vt().sorgu(
      `INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('tur', 'sarf', '1', $1)`, [kisiId]), kisit);
    await assert.rejects(vt().sorgu(
      `INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('tur', 'ticari_mal', '12', $1)`, [kisiId]), kisit);

    assert.equal((await yaz('ticari_mal', '1')).statusCode, 200);
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'adet', logoDegeri: 'ADET' });
    const d = await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu');
    assert.equal(d.karsiliklar.find((k) => k.cesit === 'tur' && k.tmiDegeri === 'ticari_mal')?.logoDegeri, '1');
    const k = (await vt().tx((db) => logoyaGidecekMalzemeler(db, 500))).find((x) => x.no === t.no);
    assert.deepEqual([k?.tur, k?.logoKartTuru, k?.eksikler], ['ticari_mal', '1', []]);
  });

  test('TM3: ticari mal reçete bileşeni ve operasyon sarfı olamaz (422, satır yazılmaz); yarı mamul bileşen olur', async () => {
    const t = await kartAc({ kod: 'TM-RCT-00001' });
    const h = await kartAc({ tur: 'yarimamul', kod: 'YM-GEN-00001' });
    const mamul = (kimlik: string, o: Pick<Kart, 'bom' | 'ops'>) => govde(kimlik, { tur: 'mamul', kod: 'MM-GEN-00001', ...o });
    let m = await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/tm-bom/kaydet', mamul('tm-bom', { bom: [{ ref: t.kimlik, miktar: 1 }, { ref: h.kimlik, miktar: 1 }] }));
    assert.match(m, new RegExp(`Hizmet ve ticari mal kartı reçeteye ya da operasyon sarfına girmez: ${t.kod}\\.`));
    m = await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/tm-ops/kaydet', mamul('tm-ops', { ops: [{ ad: 'Montaj', sarf: [{ ref: t.kimlik, miktar: 1 }] }] }));
    assert.match(m, /operasyon sarfına girmez/);
    assert.equal(await vt().tek(`SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ('tm-bom', 'tm-ops')`), null);
    const r = await istek('POST', '/malzeme-katalogu-kartlari/tm-bom2/kaydet', mamul('tm-bom2', { bom: [{ ref: h.kimlik, miktar: 1 }] }));
    assert.equal(r.statusCode, 200, r.body);
  });
});

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TICARI_MAL_GOCU = '_malzemeler_ticari_mal.sql';

// Ticari mal göçünden önceki bütün göçler uygulanmış şema; `doldur` göçten önceki satırları yazar.
async function oncekiSema(ad: string, doldur: (db: Db, kisiId: number) => Promise<void>): Promise<{ ortam: TestVeritabani; klasor: string; goc: string }> {
  const ortam = await testSemasiAc(ad);
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-ticarigoc-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((x) => x.endsWith('.sql')).sort();
  const goc = hepsi.find((x) => x.endsWith(TICARI_MAL_GOCU));
  assert.ok(goc, `${TICARI_MAL_GOCU} göçü bulunamadı`);
  for (const x of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, x), join(klasor, x));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  await ortam.vt.tx(async (db) => doldur(db, await yoneticiOlustur(db, { ad: `${ad}-kisi`, kullaniciAdi: `${ad}-kisi`, parola: PAROLA })));
  await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
  return { ortam, klasor, goc };
}

async function kartEkle(db: Db, kisiId: number, kimlik: string, onek: string): Promise<void> {
  await db.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 99) ON CONFLICT (onek) DO NOTHING', [onek]);
  await db.sorgu(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'hammadde', $2, 1, 'taslak', $3, $4, $4)`,
    [kimlik, onek, JSON.stringify({ id: kimlik, com: { ad: 'Göç', birim: 'kg' } }), kisiId],
  );
}

describe('Ticari mal göçü dolu tabloda (kart #1218, TM4, gerçek PostgreSQL)', () => {
  test('TM önekli kart varsa göç sayıyla durur; tür kısıtı değişmez', async () => {
    const { ortam, klasor } = await oncekiSema('ticarigoconek', (db, kisi) => kartEkle(db, kisi, 't-tm', 'TM-ESK-'));
    try {
      await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /1 malzeme kartı TM önekini taşıyor \(TM-ESK-00001\)/);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_katalog_karti SET tur = 'ticari_mal' WHERE kimlik = 't-tm'`),
        (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_tur');
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });

  test('göç geçer: kartlar ve karşılıklar değişmez; ticari mal türü ve karşılığı kabul edilir', async () => {
    const { ortam, klasor, goc } = await oncekiSema('ticarigocgecer', async (db, kisi) => {
      await kartEkle(db, kisi, 'g-hm', 'HM-GEN-');
      await db.sorgu(`INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('tur', 'hammadde', '10', $1)`, [kisi]);
    });
    try {
      const kartlar = 'SELECT kimlik, tur, onay_durumu, kayit, surum FROM malzeme_katalog_karti ORDER BY kimlik';
      const karsiliklar = 'SELECT cesit, tmi_degeri, logo_degeri FROM malzeme_logo_karsiligi ORDER BY cesit, tmi_degeri';
      const once = await Promise.all([kartlar, karsiliklar].map((q) => ortam.vt.sorgu(q)));
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      assert.deepEqual(await ortam.vt.sorgu(kartlar), once[0]);
      assert.deepEqual(await ortam.vt.sorgu(karsiliklar), once[1]);
      const kisi = (await ortam.vt.tek<{ id: number }>(`SELECT id FROM kisi WHERE kullanici_adi = 'ticarigocgecer-kisi'`))!.id;
      await ortam.vt.sorgu(`INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('tur', 'ticari_mal', '1', $1)`, [kisi]);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '1' WHERE tmi_degeri = 'hammadde'`), /malzeme_logo_karsiligi_izinli/);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});
