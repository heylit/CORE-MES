import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { PAROLA, planTestOrtami } from './plan-ortak.test.ts';

// 3607: kişi kaynağı atanırken boşalan istasyonlar göçle rotadan geri yazılır. Veriler uydurmadır.
const GOC = fileURLToPath(new URL('../../gocler/20261123083000_uretim_emirleri_kisi_istasyonu_geri_doldur.sql', import.meta.url));

describe('plan (gerçek PostgreSQL): kişi istasyonu geri doldurma göçü (3607)', () => {
  const { vt, yeniAdim, isEmirleriAc, durum } = planTestOrtami();

  test('bekleyen kişi kaynaklı boş istasyonlu adım rotadan dolar, emir istasyonu gelir, defter yazılır; öteki satırlar değişmez', async () => {
    const { istasyonA } = durum();
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme geri doldur', kullaniciAdi: 'gerid', parola: PAROLA }));
    const [bozuk] = await isEmirleriAc([yeniAdim()]);
    const [saglam] = await isEmirleriAc([yeniAdim()]);
    const emirOf = async (id: number) => (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [id])))!.u;
    // Canlıdaki bozuk hâl: adım kişiye atanmış, istasyon boş. Sağlam emrin adımı da kişide ama istasyonu dolu kalır.
    await vt().tx(async (db) => {
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = NULL, kisi_id = $2, istasyon_id = NULL WHERE id = $1', [bozuk, kisi]);
      await db.sorgu('UPDATE uretim_emri SET istasyon_id = NULL WHERE id = $1', [await emirOf(bozuk!)]);
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = NULL, kisi_id = $2 WHERE id = $1', [saglam, kisi]);
    });
    const onceDefter = (await vt().tx((db) => db.tek<{ n: string }>("SELECT count(*)::text AS n FROM denetim_degisiklik WHERE tablo = 'uretim_emirleri_is_emri'")))!.n;

    const sql = await readFile(GOC, 'utf8');
    await vt().tx((db) => db.sorgu(sql));

    const oku = async (id: number) => (await vt().tx((db) => db.tek<{ ist: number | null; emirIst: number | null; kisi: number | null }>(
      'SELECT i.istasyon_id AS ist, e.istasyon_id AS "emirIst", i.kisi_id AS kisi FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [id])))!;
    assert.deepEqual(await oku(bozuk!), { ist: istasyonA, emirIst: istasyonA, kisi });
    assert.deepEqual(await oku(saglam!), { ist: istasyonA, emirIst: istasyonA, kisi });
    const sonDefter = (await vt().tx((db) => db.tek<{ n: string }>("SELECT count(*)::text AS n FROM denetim_degisiklik WHERE tablo = 'uretim_emirleri_is_emri'")))!.n;
    assert.equal(Number(sonDefter) - Number(onceDefter), 1, 'yalnız bozuk adım deftere yazıldı');

    // İkinci koşu bir şey değiştirmez.
    await vt().tx((db) => db.sorgu(sql));
    const ikinci = (await vt().tx((db) => db.tek<{ n: string }>("SELECT count(*)::text AS n FROM denetim_degisiklik WHERE tablo = 'uretim_emirleri_is_emri'")))!.n;
    assert.equal(ikinci, sonDefter);
  });

  test('çalışan adıma dokunmaz', async () => {
    const [is] = await isEmirleriAc([yeniAdim()]);
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme geri doldur 2', kullaniciAdi: 'gerid2', parola: PAROLA }));
    await vt().tx((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET makine_id = NULL, kisi_id = $2, istasyon_id = NULL, durum = 'calisiyor', baslama = now() WHERE id = $1", [is, kisi]));
    await vt().tx(async (db) => db.sorgu(await readFile(GOC, 'utf8')));
    const r = await vt().tx((db) => db.tek<{ ist: number | null }>('SELECT istasyon_id AS ist FROM uretim_emirleri_is_emri WHERE id = $1', [is]));
    assert.equal(r!.ist, null);
  });
});
