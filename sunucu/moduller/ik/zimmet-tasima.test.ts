import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));
const KOPYA_GOCU = '20261019110500_idari_isler_zimmet_ik_kopyasi.sql';
const KALDIRMA_GOCU = '20261019120000_ik_zimmet_kaldir.sql';

// 244 a: İK zimmetleri İdari İşler'e iki adımda geçer. Kopya göçünden sonra İK'da yazılan kayıt kaldırma göçünde taşınır; tablo ve
// onu okuyan kopya işlevi birlikte düşer.
describe('244 zimmet taşıma göçleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('ikzt');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-ikzt-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  async function sirayaKadarUygula(hepsi: string[], son: string): Promise<void> {
    const sira = hepsi.indexOf(son);
    assert.equal(sira >= 0, true, `${son} göç klasöründe yok`);
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    await gocleriUygula(o().ayar, klasor, { sema: o().sema });
  }

  test('iptal edilmemiş her İK zimmeti bir kez demirbaş ve zimmet olur; kişisiz personel adla gelir; sonra tablo ve işlev kalkar', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    await sirayaKadarUygula(hepsi, KOPYA_GOCU);
    const s = o().sahip;
    const yonetici = await s.tx((db) => yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'ikzt-yon', parola: 'dogru-parola-1' }));
    const alan = await s.tx((db) => yoneticiOlustur(db, { ad: 'Deneme alan', kullaniciAdi: 'ikzt-alan', parola: 'dogru-parola-1' }));
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DNM-IM', 'Deneme iş merkezi') RETURNING id"))!.id;
    const personel = async (kimlik: string, kisiId: number | null) => (await s.tek<{ no: number }>(
      `INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'Deneme', $2, $3, $4, $5, $5) RETURNING no`, [kimlik, kimlik, kisiId, im, yonetici],
    ))!.no;
    const bagli = await personel('dnm_p_bagli', alan);
    const bagsiz = await personel('dnm_p_bagsiz', null);
    const zimmet = (kimlik: string, no: number, tur: string | null, iade: string | null, iptal = false) => s.sorgu(
      `INSERT INTO ik_zimmet (kimlik, personel_no, tur, marka, seri_no, verilis, iade, deger, iptal, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, 'DENEME', $4, '2026-01-05', $5, 0, $6, $7, $7)`, [kimlik, no, tur, `${kimlik}-sn`, iade, iptal, yonetici],
    );
    await zimmet('dnm_z_1', bagli, 'Dizüstü bilgisayar', null);
    await zimmet('dnm_z_2', bagsiz, null, null);
    await zimmet('dnm_z_3', bagsiz, 'Anahtar', '2026-02-01');
    await zimmet('dnm_z_4', bagli, 'Monitör', null, true);
    await sirayaKadarUygula(hepsi, KALDIRMA_GOCU);
    // Kopya göçünden sonra İK'da yazılan kayıt.
    await zimmet('dnm_z_5', bagli, 'Giriş kartı', null);
    await gocleriUygula(o().ayar, GERCEK_KLASOR, { sema: o().sema });

    const tasinan = await s.sorgu<{ kaynak_ik_kimlik: string; kisi_id: number | null; personel_adi: string | null; tur: string; durum: string; deger: string | null }>(
      `SELECT z.kaynak_ik_kimlik, z.kisi_id, z.personel_adi, d.tur, d.durum, d.deger::text AS deger
         FROM idari_isler_zimmet z JOIN idari_isler_demirbas d ON d.id = z.demirbas_id ORDER BY z.kaynak_ik_kimlik`,
    );
    assert.deepEqual(tasinan, [
      { kaynak_ik_kimlik: 'dnm_z_1', kisi_id: alan, personel_adi: null, tur: 'dizustu', durum: 'zimmetli', deger: null },
      { kaynak_ik_kimlik: 'dnm_z_2', kisi_id: null, personel_adi: 'Deneme dnm_p_bagsiz', tur: 'diger', durum: 'zimmetli', deger: null },
      { kaynak_ik_kimlik: 'dnm_z_3', kisi_id: null, personel_adi: 'Deneme dnm_p_bagsiz', tur: 'anahtar', durum: 'bosta', deger: null },
      { kaynak_ik_kimlik: 'dnm_z_5', kisi_id: alan, personel_adi: null, tur: 'giris_karti', durum: 'zimmetli', deger: null },
    ]);
    assert.equal((await s.tek<{ t: string | null }>("SELECT to_regclass('ik_zimmet')::text AS t"))?.t, null);
    assert.equal((await s.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'idari_isler_zimmet_ik_kopyala' AND pronamespace = $1::regnamespace", [o().sema],
    ))?.n, 0);
  });
});
