import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GOC = '20261125125000';

// SmartES'ten gelen 41 duruş ve (rework hariç) 18 fire adı; göç adları aynen taşır.
describe('3692: duruş ve hata nedenleri SmartES adlarıyla eşit (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = () => { if (!ortam) throw new Error('Test veritabanı kurulmadı.'); return ortam.vt; };

  before(async () => { ortam = await testVeritabaniKur('durus_adlari_goc'); });
  after(async () => { await ortam?.kaldir(); });

  test('SG-1: aktif ve pasif 41 SmartES duruş adı tam bir kez bulunur, kategorileri SmartES grubuyla aynıdır', async () => {
    const satirlar = await vt().sorgu<{ ad: string; kategori: string; aktif: boolean }>('SELECT ad, kategori, aktif FROM durus_nedeni');
    const bakim = satirlar.find((s) => s.ad === 'Bakım');
    assert.equal(bakim?.kategori, 'planli');
    assert.equal(satirlar.find((s) => s.ad === 'Makine Arızası')?.kategori, 'plansiz');
    assert.equal(satirlar.find((s) => s.ad === 'Gece Tasarımcı Eksikliği')?.aktif, false);
    assert.equal(satirlar.find((s) => s.ad === 'Kalite Onay Bekleme (Gece Kalite Per. Olmaması)')?.aktif, false);
    assert.equal(satirlar.find((s) => s.ad === 'Kalite Onay Bekleme')?.kategori, 'planli');
    // Aktif satırlar: SmartES'in 39 aktif adı + kurulumdan kalan karşılıksız satır yok (hepsi pasif).
    const aktifler = satirlar.filter((s) => s.aktif);
    assert.equal(aktifler.length, 39);
    assert.equal(new Set(satirlar.map((s) => s.ad.toLowerCase())).size, satirlar.length);
  });

  test('SG-2: kod ve kimlik değişmez; D-01 aynı satırda yeni adı taşır, kurulumda karşılığı olmayanlar adını koruyarak pasife alınır', async () => {
    const [d01, d10, d11] = await Promise.all(['D-01', 'D-10', 'D-11'].map((k) => vt().sorgu<{ ad: string; aktif: boolean; surum: number }>('SELECT ad, aktif, surum FROM durus_nedeni WHERE kod = $1', [k])));
    assert.deepEqual([d01?.[0]?.ad, d01?.[0]?.aktif, d01?.[0]?.surum], ['Malzeme Bekleme (Depodan)', true, 2]);
    assert.deepEqual([d10?.[0]?.ad, d10?.[0]?.aktif], ['Toplantı / eğitim', false]);
    assert.deepEqual([d11?.[0]?.ad, d11?.[0]?.aktif], ['İş emri yok', false]);
  });

  test('SG-3: hata nedenlerinde 18 SmartES fire adı var, Rework ve fazla M30 eklenmez, FSN kodları ve H-01 kimliği yerinde kalır', async () => {
    const satirlar = await vt().sorgu<{ kod: string; ad: string; aktif: boolean }>('SELECT kod, ad, aktif FROM hurda_nedeni');
    assert.equal(satirlar.find((s) => s.kod === 'H-03')?.ad, 'Ham Malzeme Kaynaklı (Kılcal Çatlak, boşluk vb.)');
    assert.equal(satirlar.find((s) => s.kod === 'H-05')?.ad, 'Kılavuzun Parça İçerisinde Kırılması');
    assert.equal(satirlar.find((s) => s.kod === 'H-01')?.ad, 'Ölçü dışı');
    assert.equal(satirlar.find((s) => s.kod === 'H-01')?.aktif, false);
    assert.equal(satirlar.some((s) => /rework|fazla m30/i.test(s.ad)), false);
    assert.equal(satirlar.filter((s) => s.aktif && s.kod.startsWith('FSN-')).length, 2);
    assert.equal(satirlar.filter((s) => s.aktif && !s.kod.startsWith('FSN-')).length, 18);
  });

  test('SG-4: geri alma yedekteki eski değerleri yazar, eklenen satırları silmez pasife alır (başka kayıt bağlı olsa da durur)', async () => {
    const sonuc = await vt().tx(async (db) => {
      await db.sorgu(
        `UPDATE durus_nedeni d SET ad = y.eski_ad, kategori = y.eski_kategori, aktif = y.eski_aktif,
           cagri_ekibi = y.eski_cagri_ekibi, cagri_gecikme_dk = y.eski_cagri_gecikme_dk
           FROM durus_nedeni_goc_yedek y WHERE y.goc = $1 AND y.neden_id = d.id AND NOT y.eklendi`, [GOC]);
      await db.sorgu(
        `UPDATE durus_nedeni d SET aktif = false FROM durus_nedeni_goc_yedek y WHERE y.goc = $1 AND y.neden_id = d.id AND y.eklendi`, [GOC]);
      return db.sorgu<{ kod: string; ad: string; aktif: boolean }>('SELECT kod, ad, aktif FROM durus_nedeni ORDER BY sira');
    });
    assert.equal(sonuc.length, 12 + 31);
    assert.deepEqual(sonuc.slice(0, 3).map((s) => s.ad), ['Malzeme bekleniyor', 'Mekanik arıza', 'Elektrik / kontrol arızası']);
    assert.equal(sonuc.slice(0, 12).every((s) => s.aktif), true);
    assert.equal(sonuc.slice(12).some((s) => s.aktif), false);
  });

  test('SG-5: hata nedenlerinde de geri alma eski adı ve aktifliği döndürür, eklenenler pasife alınır, FSN kodları aktif kalır', async () => {
    const sonuc = await vt().tx(async (db) => {
      await db.sorgu(
        `UPDATE hurda_nedeni h SET ad = y.eski_ad, aktif = y.eski_aktif
           FROM hurda_nedeni_goc_yedek y WHERE y.goc = $1 AND y.neden_id = h.id AND NOT y.eklendi`, [GOC]);
      await db.sorgu(
        `UPDATE hurda_nedeni h SET aktif = false FROM hurda_nedeni_goc_yedek y WHERE y.goc = $1 AND y.neden_id = h.id AND y.eklendi`, [GOC]);
      return db.sorgu<{ kod: string; ad: string; aktif: boolean }>('SELECT kod, ad, aktif FROM hurda_nedeni ORDER BY sira');
    });
    assert.equal(sonuc.find((s) => s.kod === 'H-03')?.ad, 'Malzeme hatası');
    assert.equal(sonuc.find((s) => s.kod === 'H-05')?.ad, 'Takım kırılması');
    assert.equal(sonuc.filter((s) => /^H-0[1-7]$/.test(s.kod)).every((s) => s.aktif), true);
    assert.equal(sonuc.filter((s) => /^H-(0[89]|[1-9]\d)$/.test(s.kod)).some((s) => s.aktif), false);
    assert.equal(sonuc.filter((s) => s.kod.startsWith('FSN-')).every((s) => s.aktif), true);
  });
});
