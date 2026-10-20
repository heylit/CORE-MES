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
const KALDIR_GOCU = '_malzemeler_eski_kart_kaldir.sql';

const KART_TABLOLARI = ['malzeme', 'malzeme_duzenleyen', 'malzeme_hammadde', 'malzeme_olcusu', 'malzeme_sarf', 'malzeme_sarf_degeri'];

// Tanım tablosu -> içeriğini değiştiren tek ifade. Hepsi göçün durmasını gerektirir.
const TANIM_DEGISIKLIKLERI: Record<string, string> = {
  malzeme_ailesi: "UPDATE malzeme_ailesi SET ad = ad || 'x' WHERE kod = 'metal'",
  kod_grubu: "UPDATE kod_grubu SET son_sira = 3 WHERE kod = 'PAS'",
  malzeme_sinifi: "UPDATE malzeme_sinifi SET ad = ad || 'x' WHERE grup_kodu = 'PAS'",
  kalite: "UPDATE kalite SET yogunluk = 9.999 WHERE ctid = (SELECT ctid FROM kalite LIMIT 1)",
  kalite_esdegeri: 'DELETE FROM kalite_esdegeri WHERE ctid = (SELECT ctid FROM kalite_esdegeri LIMIT 1)',
  form: "UPDATE form SET sira = sira + 100 WHERE kod = (SELECT kod FROM form LIMIT 1)",
  form_olcusu: "UPDATE form_olcusu SET ad = ad || 'x' WHERE ctid = (SELECT ctid FROM form_olcusu LIMIT 1)",
  aile_formu: 'DELETE FROM aile_formu WHERE ctid = (SELECT ctid FROM aile_formu LIMIT 1)',
  secenek: "UPDATE secenek SET ad = ad || 'x' WHERE ctid = (SELECT ctid FROM secenek LIMIT 1)",
  sarf_kategorisi: "UPDATE sarf_kategorisi SET ad = ad || 'x' WHERE ctid = (SELECT ctid FROM sarf_kategorisi LIMIT 1)",
  sarf_alani: "UPDATE sarf_alani SET ad = ad || 'x' WHERE ctid = (SELECT ctid FROM sarf_alani LIMIT 1)",
  sarf_alan_secenegi: "UPDATE sarf_alan_secenegi SET deger = deger || 'x' WHERE ctid = (SELECT ctid FROM sarf_alan_secenegi LIMIT 1)",
};
const ESKI_TABLOLAR = [...KART_TABLOLARI, ...Object.keys(TANIM_DEGISIKLIKLERI)];

// Kapatma izi taşıyan dört tablo.
const AKTIF_TABLOLARI = ['malzeme_sinifi', 'kalite', 'secenek', 'sarf_kategorisi'];
const ESKI_FONKSIYONLAR = ['malzeme_silinmez', 'malzeme_tanimi_kilitli', 'malzeme_karti_kilitli'];

interface Ortam { ortam: TestVeritabani; klasor: string; kaldir: string }

// Göçten önceki şema kurulur; kaldırma göçü henüz uygulanmaz.
async function hazirla(onek: string): Promise<Ortam> {
  const ortam = await testSemasiAc(onek);
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-eskikart-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const kaldir = hepsi.find((ad) => ad.endsWith(KALDIR_GOCU)) ?? '';
  assert.ok(kaldir, 'kaldırma göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < kaldir)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, kaldir };
}
async function bitir(o: Ortam | undefined): Promise<void> {
  if (!o) return;
  await rm(o.klasor, { recursive: true, force: true });
  await o.ortam.kaldir();
}
async function kaldirmayiDene(o: Ortam, pg: { kilitSureMs?: number } = {}): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.kaldir), join(o.klasor, o.kaldir));
  const { ayar } = o.ortam;
  return gocleriUygula({ ...ayar, pg: { ...ayar.pg, ...pg } }, o.klasor, { sema: o.ortam.sema });
}
async function varOlanlar(o: Ortam, tablolar: string[]): Promise<string[]> {
  return (await o.ortam.vt.sorgu<{ table_name: string }>(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) ORDER BY table_name', [tablolar],
  )).map((r) => r.table_name);
}
async function varOlanFonksiyonlar(o: Ortam): Promise<string[]> {
  return (await o.ortam.vt.sorgu<{ proname: string }>(
    'SELECT proname FROM pg_proc WHERE pronamespace = current_schema()::regnamespace AND proname = ANY($1::text[]) ORDER BY proname', [ESKI_FONKSIYONLAR],
  )).map((r) => r.proname);
}
async function hicbiriDusmedi(o: Ortam): Promise<void> {
  assert.deepEqual(await varOlanlar(o, ESKI_TABLOLAR), [...ESKI_TABLOLAR].sort(), 'göç durunca hiçbir eski tablo düşmedi');
  assert.deepEqual(await varOlanFonksiyonlar(o), [...ESKI_FONKSIYONLAR].sort(), 'göç durunca hiçbir eski fonksiyon düşmedi');
}
async function durmali(o: Ortam, ileti: RegExp): Promise<void> {
  await assert.rejects(kaldirmayiDene(o), ileti);
  await hicbiriDusmedi(o);
}

describe('eski malzeme kartını kaldıran göç (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla('eskikart'); });
  afterEach(async () => { await bitir(o); o = undefined; });

  test('temiz şemada göç geçer: 18 eski tablo ve 3 fonksiyon kalkar, yeni katalog tabloları ve yalniz_ekleme durur', async () => {
    assert.equal((await varOlanlar(al(), ESKI_TABLOLAR)).length, 18, 'göçten önce 18 tablo var');
    assert.deepEqual(await kaldirmayiDene(al()), [al().kaldir]);
    assert.deepEqual(await varOlanlar(al(), ESKI_TABLOLAR), []);
    assert.deepEqual(await varOlanFonksiyonlar(al()), []);
    assert.deepEqual(
      await varOlanlar(al(), ['malzeme_katalog_karti', 'malzeme_katalog_kod_sirasi', 'malzeme_katalog_sablonu', 'malzeme_katalog_ayari']),
      ['malzeme_katalog_ayari', 'malzeme_katalog_karti', 'malzeme_katalog_kod_sirasi', 'malzeme_katalog_sablonu'],
    );
    const yalnizEkleme = await al().ortam.vt.sorgu('SELECT 1 FROM pg_proc WHERE pronamespace = current_schema()::regnamespace AND proname = $1', ['yalniz_ekleme']);
    assert.equal(yalnizEkleme.length, 1, 'ortak yalniz_ekleme işlevi durur');
  });

  test('eski malzeme tablosunda satır varken göç durur ve hiçbir tablo düşmez', async () => {
    await al().ortam.vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'eski-kisi', kullaniciAdi: 'eski-kisi', parola: 'dogru-parola-1' });
      await db.sorgu(
        "INSERT INTO malzeme (tur, ad, benzersiz_anahtar, stok_birimi, acan_kisi_id) VALUES ('hammadde', 'Eski kart', 'eski-anahtar', 'kg', $1)", [kisi],
      );
    });
    await durmali(al(), /malzeme tablosunda 1 satır var/);
  });

  test('tanım tablolarının her birinde içerik değişince göç durur ve hiçbir tablo düşmez', async () => {
    for (const [tablo, ifade] of Object.entries(TANIM_DEGISIKLIKLERI)) {
      const yeni = await hazirla('eskitanim');
      try {
        await yeni.ortam.vt.sorgu(ifade);
        await assert.rejects(kaldirmayiDene(yeni), new RegExp(`Farklı tablolar:\\n  ${tablo} \\(özet`), `${tablo} değişince durmalıydı`);
        await hicbiriDusmedi(yeni);
      } finally {
        await bitir(yeni);
      }
    }
  });

  test('tanım tablosuna elle satır eklenmişse ya da tohum satırı silinmişse göç durur', async () => {
    await al().ortam.vt.sorgu("INSERT INTO malzeme_ailesi (kod, ad, sira) VALUES ('elle', 'Elle eklenen', 99)");
    await durmali(al(), /Farklı tablolar:\n {2}malzeme_ailesi \(özet/);
    await al().ortam.vt.sorgu("DELETE FROM malzeme_ailesi WHERE kod = 'elle'");
    await al().ortam.vt.sorgu("INSERT INTO kod_grubu (kod) VALUES ('ZZZ')");
    await durmali(al(), /Farklı tablolar:\n {2}kod_grubu \(özet/);
  });

  test('kapatma izi taşıyan dört tabloda kapatılmış kayıt göçü durdurur, yeniden açılınca göç geçer', async () => {
    for (const tablo of AKTIF_TABLOLARI) {
      const yeni = await hazirla('eskiaktif');
      try {
        await yeni.ortam.vt.sorgu(`UPDATE ${tablo} SET aktif = false WHERE ctid = (SELECT ctid FROM ${tablo} LIMIT 1)`);
        await assert.rejects(kaldirmayiDene(yeni), new RegExp(`Farklı tablolar:\\n  ${tablo} \\(özet`), `${tablo} kapatılınca durmalıydı`);
        await hicbiriDusmedi(yeni);
        await yeni.ortam.vt.sorgu(`UPDATE ${tablo} SET aktif = true`);
        assert.deepEqual(await kaldirmayiDene(yeni), [yeni.kaldir], `${tablo} yeniden açılınca geçmeliydi`);
      } finally {
        await bitir(yeni);
      }
    }
  });

  test('özet belirlenimcidir: iki ayrı temiz şemada aynı göç geçer (aynı beklenen özet)', async () => {
    const ikinci = await hazirla('eskiikinci');
    try {
      assert.notEqual(ikinci.ortam.sema, al().ortam.sema);
      assert.deepEqual(await kaldirmayiDene(al()), [al().kaldir]);
      assert.deepEqual(await kaldirmayiDene(ikinci), [ikinci.kaldir]);
    } finally {
      await bitir(ikinci);
    }
  });

  // Denetim düşürmeden önce biter; arada başka oturumun yazıp kaydettiği satırı yalnız önceden alınmış kilit korur.
  // Düzen: birinci tabloda okuyucu kilidi tutulur, göç oraya takılır; beklerken başka tabloya satır yazılır ve kaydedilir.
  // Kilitsiz göç denetimi o sırada çoktan geçmiş olur, sonra tabloyu satırıyla düşürürdü; kilitli göç denetimi kilitten sonra yapar ve durur.
  test('denetimle düşürme arasındaki yazma kaybolmaz: göç kilitleri aldıktan sonra denetler ve durur', async () => {
    const { vt } = al().ortam;
    let birak: () => void = () => undefined;
    let basladi: () => void = () => undefined;
    const kapi = new Promise<void>((coz) => { birak = coz; });
    const tuttu = new Promise<void>((coz) => { basladi = coz; });
    const okuyan = vt.tx(async (db) => {
      await db.sorgu('SELECT count(*) FROM malzeme_sarf_degeri');
      basladi();
      await kapi;
    });
    await tuttu;
    let kosu: Promise<unknown> = Promise.resolve();
    try {
      kosu = kaldirmayiDene(al(), { kilitSureMs: 20_000 }).then(() => 'uygulandı', (hata: unknown) => hata);
      const bekliyor = async (): Promise<boolean> => (await vt.sorgu(
        `SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
          WHERE NOT l.granted AND c.relname = 'malzeme_sarf_degeri' AND c.relnamespace = current_schema()::regnamespace`,
      )).length > 0;
      const son = performance.now() + 15_000;
      while (!(await bekliyor()) && performance.now() < son) await new Promise((coz) => setTimeout(coz, 20));
      assert.equal(await bekliyor(), true, 'göç birinci tabloda bekliyor olmalı');
      await vt.sorgu("INSERT INTO malzeme_ailesi (kod, ad, sira) VALUES ('arada', 'Arada yazılan', 97)");
    } finally {
      birak();
      await okuyan;
    }
    const sonuc = await kosu;
    assert.match(String(sonuc), /Farklı tablolar:\n {2}malzeme_ailesi \(özet/, 'göç satırı görüp durmalıydı');
    await hicbiriDusmedi(al());
    assert.equal((await vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM malzeme_ailesi WHERE kod = 'arada'"))!.n, 1);
  });

  test('başka oturum tabloya yazarken göç kilidi alamaz, lock_timeout ile durur; yazılan satır kaybolmaz', async () => {
    const { vt } = al().ortam;
    let birak: () => void = () => undefined;
    let basladi: () => void = () => undefined;
    const kapi = new Promise<void>((coz) => { birak = coz; });
    const yazdi = new Promise<void>((coz) => { basladi = coz; });
    // Denetimden önce başlamış, göç bitene kadar bitmeyen yazma: kilitsiz göç bu satırı sessizce silerdi.
    const yazan = vt.tx(async (db) => {
      await db.sorgu("INSERT INTO malzeme_ailesi (kod, ad, sira) VALUES ('yarisan', 'Yarışan yazma', 98)");
      basladi();
      await kapi;
    });
    await yazdi;
    let sonuc: unknown;
    try {
      sonuc = await kaldirmayiDene(al(), { kilitSureMs: 300 }).then(() => 'uygulandı', (hata: unknown) => hata);
    } finally {
      birak();
      await yazan;
    }
    // 55P03: lock_not_available.
    assert.equal((sonuc as { code?: string }).code, '55P03', `beklenen kilit süre aşımı, gelen: ${String(sonuc)}`);
    await hicbiriDusmedi(al());
    assert.equal((await vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM malzeme_ailesi WHERE kod = 'yarisan'"))!.n, 1);
  });
});
