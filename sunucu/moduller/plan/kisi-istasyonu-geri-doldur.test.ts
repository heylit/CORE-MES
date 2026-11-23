import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { PAROLA, planTestOrtami } from './plan-ortak.test.ts';

// 3607: kişi kaynağı atanırken boşalan istasyonlar göçle rotadan geri yazılır. Göç, kurulu şemada kaydı silinip yeniden uygulanır.
// Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC_SONU = '_uretim_emirleri_kisi_istasyonu_geri_doldur.sql';

describe('plan (gerçek PostgreSQL): kişi istasyonu geri doldurma göçü (3607)', () => {
  const { ortamAl, vt, yeniAdim, isEmirleriAc, durum } = planTestOrtami();
  let klasor = '';
  after(async () => { if (klasor) await rm(klasor, { recursive: true, force: true }); });

  async function gocuYenidenUygula(): Promise<void> {
    const { ayar, sema, sahip } = ortamAl();
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(GOC_SONU));
    assert.ok(goc, 'geri doldurma göçü bulunamadı');
    if (klasor === '') {
      klasor = await mkdtemp(join(tmpdir(), 'tmiv2-kistas-'));
      for (const ad of hepsi.filter((a) => a <= goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    }
    // Canlıda göç rolünün geçici tablo hakkı yoktur: haklar aynen kaldırılır, göç geçici tabloya dayanırsa kırılır.
    await sahip.sorgu(`DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$`);
    await sahip.sorgu(`DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM %I', current_database(), (SELECT current_user)); END $$`).catch(() => undefined);
    // Göçten sonra damgalı göçler de kurulu olabilir: damga sırası bozulmasın diye kayıtları geçici alınır, klasörde yalnız göce kadar olanlar durur.
    await sahip.sorgu('CREATE TABLE goc_kaydi_yedek AS SELECT * FROM goc_kaydi WHERE ad >= $1', [goc]);
    await sahip.sorgu('DELETE FROM goc_kaydi WHERE ad >= $1', [goc]);
    try {
      assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    } finally {
      await sahip.sorgu('DELETE FROM goc_kaydi WHERE ad = $1', [goc]);
      await sahip.sorgu('INSERT INTO goc_kaydi SELECT * FROM goc_kaydi_yedek');
      await sahip.sorgu('DROP TABLE goc_kaydi_yedek');
    }
  }
  const defterSayisi = async () => Number((await vt().tx((db) => db.tek<{ n: string }>(
    "SELECT count(*)::text AS n FROM denetim_degisiklik WHERE tablo IN ('uretim_emirleri_is_emri', 'uretim_emri')")))!.n);
  const oku = async (id: number) => (await vt().tx((db) => db.tek<{ ist: number | null; emirIst: number | null; kisi: number | null }>(
    'SELECT i.istasyon_id AS ist, e.istasyon_id AS "emirIst", i.kisi_id AS kisi FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [id])))!;
  const emirOf = async (id: number) => (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [id])))!.u;

  test('bekleyen kişi kaynaklı boş istasyonlu adım rotadan dolar; koşulları dışında kalanlar değişmez; defter yazılır; ikinci koşu boş', async () => {
    const { istasyonA, istasyonB } = durum();
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme geri doldur', kullaniciAdi: 'gerid', parola: PAROLA }));
    const bozuk = (await isEmirleriAc([yeniAdim()]))[0]!;
    const emirDolu = (await isEmirleriAc([yeniAdim()]))[0]!;
    const rotasiz = (await isEmirleriAc([yeniAdim({ kaynak: null })]))[0]!;
    const calisan = (await isEmirleriAc([yeniAdim()]))[0]!;
    const iptalli = (await isEmirleriAc([yeniAdim()]))[0]!;
    const yenidenDizilmis = (await isEmirleriAc([yeniAdim()]))[0]!;
    const reworkAdimi = (await isEmirleriAc([yeniAdim()]))[0]!;
    // Canlıdaki bozuk hâl: adım kişiye atanmış, istasyon boş (emrin istasyonu da).
    await vt().tx(async (db) => {
      for (const id of [bozuk, emirDolu, rotasiz, calisan, iptalli, yenidenDizilmis, reworkAdimi]) {
        await db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = NULL, kisi_id = $2, istasyon_id = NULL WHERE id = $1', [id, kisi]);
        await db.sorgu('UPDATE uretim_emri SET istasyon_id = NULL WHERE id = $1', [await emirOf(id)]);
      }
      // Emrin istasyonu doluysa (başka istasyon) göç ona dokunmaz.
      await db.sorgu('UPDATE uretim_emri SET istasyon_id = $2 WHERE id = $1', [await emirOf(emirDolu), istasyonB]);
      // Revizyonda yeniden dizilen OP numarası: emirdeki op_no rota satırının numarasıyla artık tutmaz, operasyon kimliği tutar (3250-2).
      // (op_no ya da tur değişince tetikleyici kimliği yeniden hesaplar; kimlik canlıdaki gibi geri konur.)
      const kimlik = async (id: number) => (await db.tek<{ k: number }>('SELECT operasyon_id AS k FROM uretim_emirleri_is_emri WHERE id = $1', [id]))!.k;
      const dizilmisKimlik = await kimlik(yenidenDizilmis);
      const reworkKimlik = await kimlik(reworkAdimi);
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET op_no = 9990 WHERE id = $1', [yenidenDizilmis]);
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET operasyon_id = $2 WHERE id = $1', [yenidenDizilmis, dizilmisKimlik]);
      // Rework adımı rotadan gelmez; rota satırı olsa da göç dokunmaz.
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET tur = 'rework' WHERE id = $1", [reworkAdimi]);
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET operasyon_id = $2 WHERE id = $1', [reworkAdimi, reworkKimlik]);
      await db.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [await emirOf(iptalli)]);
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() WHERE id = $1", [calisan]);
    });
    const surumu = async (id: number) => (await vt().tx((db) => db.tek<{ s: number }>('SELECT surum AS s FROM uretim_emirleri_is_emri WHERE id = $1', [id])))!.s;
    const rotasizSurum = await surumu(rotasiz);
    const once = await defterSayisi();

    await gocuYenidenUygula();

    assert.deepEqual(await oku(bozuk), { ist: istasyonA, emirIst: istasyonA, kisi }, 'adım ve emir istasyonu rotadan');
    assert.deepEqual(await oku(emirDolu), { ist: istasyonA, emirIst: istasyonB, kisi }, 'dolu emir istasyonu değişmez');
    assert.equal((await oku(rotasiz)).ist, null, 'rotadan istasyon çıkmayan adım boş kalır, uydurulmaz');
    assert.deepEqual(await oku(yenidenDizilmis), { ist: istasyonA, emirIst: istasyonA, kisi }, 'op_no değişse de operasyon kimliğiyle eşlenir');
    assert.equal((await oku(reworkAdimi)).ist, null, 'rework adımı rotadan sayılmaz');
    assert.equal(await surumu(rotasiz), rotasizSurum, 'rotasız adıma yazılmadı (sürüm de artmadı)');
    assert.equal((await oku(iptalli)).ist, null, 'iptal emrin adımı değişmez');
    assert.equal((await oku(calisan)).ist, null, 'çalışan adım değişmez');
    const sonra = await defterSayisi();
    // Değişen satırlar: bozuk adım + emri, dolu emrin adımı, yeniden dizilmiş adım + emri. Rotasız, çalışan ve dolu emir istasyonu deftere girmez.
    assert.equal(sonra - once, 5, 'defter yalnız değişen satırlar için yazıldı');
    await gocuYenidenUygula();
    assert.equal(await defterSayisi(), sonra, 'ikinci koşu hiçbir şey değiştirmez');
  });
});
