import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// BES hareketleri (kart 1939): tablonun kendi korumaları. Uç sınamaları sunucu parçasıyla bu dosyaya eklenir.
const kisit = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;

describe('İK BES hareketi tablosu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let personel = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ekle = async (tur: string, tarih: string, ek: { oran?: number | null; sirket?: string | null } = {}): Promise<number> =>
    (await vt().tek<{ no: number }>(
      'INSERT INTO ik_bes_hareket (personel_no, tur, tarih, katki_orani, emeklilik_sirketi, yazan_kisi_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING no',
      [personel, tur, tarih, ek.oran ?? null, ek.sirket ?? null, kisi],
    ))!.no;

  before(async () => {
    ortam = await testVeritabaniKur('ik_bes');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme BES', kullaniciAdi: 'bes-yon', parola: 'dogru-parola-1' }));
    const im = (await ortam.vt.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('BESM', 'Merkez') RETURNING id"))!.id;
    personel = (await ortam.vt.tek<{ no: number }>(
      `INSERT INTO ik_personel (kimlik, ad, soyad, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ('emp_bes', 'Ad', 'Deneme', $1, $2, $2) RETURNING no`, [im, kisi],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('giriş oranlı ve şirketli yazılır; çıkışta oran ve şirket yazılmaz', async () => {
    await ekle('otomatik_katilim', '2026-01-05', { oran: 3, sirket: 'Deneme Emeklilik' });
    await assert.rejects(ekle('cayma', '2026-02-01', { oran: 3 }), kisit('ik_bes_hareket_oran_yalniz_giriste'));
    await assert.rejects(ekle('gonullu_katilim', '2026-02-01', { oran: 0 }), kisit('ik_bes_hareket_oran_araligi'));
    await assert.rejects(ekle('baska', '2026-02-01'), kisit('ik_bes_hareket_tur_secenek'));
  });

  test('aynı gün aynı türde ikinci geçerli hareket olmaz; iptal edilen yer açar', async () => {
    const no = await ekle('ayrilma', '2026-03-01');
    await assert.rejects(ekle('ayrilma', '2026-03-01'), kisit('ik_bes_hareket_gunde_tek'));
    await vt().sorgu('UPDATE ik_bes_hareket SET iptal = true, surum = surum + 1 WHERE no = $1', [no]);
    await ekle('ayrilma', '2026-03-01');
  });

  test('hareket silinmez, tarihi ve türü değişmez, iptali geri alınmaz', async () => {
    const no = await ekle('gonullu_katilim', '2026-04-01', { oran: 5 });
    await assert.rejects(vt().sorgu('DELETE FROM ik_bes_hareket WHERE no = $1', [no]), kisit('ik_bes_hareket_silinmez'));
    await assert.rejects(vt().sorgu("UPDATE ik_bes_hareket SET tarih = '2026-04-02' WHERE no = $1", [no]), kisit('ik_bes_hareket_degismez'));
    await assert.rejects(vt().sorgu("UPDATE ik_bes_hareket SET tur = 'cayma', katki_orani = NULL WHERE no = $1", [no]), kisit('ik_bes_hareket_degismez'));
    await vt().sorgu('UPDATE ik_bes_hareket SET iptal = true WHERE no = $1', [no]);
    await assert.rejects(vt().sorgu('UPDATE ik_bes_hareket SET iptal = false WHERE no = $1', [no]), kisit('ik_bes_hareket_iptal_kesin'));
  });
});
