import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kartAlanDegerleri, kategoriKartlari, sktTakipliKartlar } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 2099-3 b: SKT takibi kartın kaydındaki işarettir; 2099-6 a: tür listeleri kategoriyle süzülür ve türe özel alanları okur.
describe('malzemeler SKT takibi, kategori süzgeci ve alan değerleri (2099, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  async function kart(tur: string, kayit: Record<string, unknown>, durum = 'aktif'): Promise<number> {
    sira += 1;
    const onek = `SKT-${tur.slice(0, 3).toUpperCase()}-`;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', [onek]);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING no`,
      [`skt-${sira}`, tur, onek, sira, durum, JSON.stringify({ id: `skt-${sira}`, ...kayit }), kisiId],
    );
    return r!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemesktt');
    kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme SKT', kullaniciAdi: 'skt-yonetici', parola: PAROLA }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('yalnız true işaretli ve parti alan kart SKT takiplidir; işaretsiz, yanlış değerli, demirbaş ve hizmet değildir', async () => {
    const acik = await kart('sarf', { g: { kat: 'kimyasal', tur: 'Gres' }, com: { ad: 'Gres', birim: 'kg', skt: true } });
    const ticari = await kart('ticari_mal', { g: {}, com: { ad: 'Ticari', birim: 'adet', skt: true } });
    const kapali = await kart('sarf', { g: { kat: 'kimyasal' }, com: { ad: 'Tiner', birim: 'L', skt: false } });
    const isaretsiz = await kart('sarf', { g: { kat: 'kimyasal' }, com: { ad: 'Boya', birim: 'L' } });
    const metin = await kart('sarf', { g: { kat: 'kimyasal' }, com: { ad: 'Yağ', birim: 'L', skt: 'true' } });
    const demirbas = await kart('demirbas', { g: { kat: 'kalip' }, com: { ad: 'Aparat', birim: 'adet', skt: true } });
    const takipli = await o().vt.tx((db) => sktTakipliKartlar(db, [acik, ticari, kapali, isaretsiz, metin, demirbas, acik, 999999]));
    assert.deepEqual([...takipli].sort((a, b) => a - b), [acik, ticari].sort((a, b) => a - b));
    assert.equal((await o().vt.tx((db) => sktTakipliKartlar(db, []))).size, 0);
  });

  test('kategori süzgeci türe ve kategoriye bakar, silinmiş kartı almaz', async () => {
    const takim = await kart('sarf', { g: { kat: 'takim', tur: 'Matkap' }, com: { ad: 'Matkap', birim: 'adet' } });
    const silinmis = await kart('sarf', { g: { kat: 'takim', tur: 'Rayba' }, com: { ad: 'Rayba', birim: 'adet' } }, 'iptal');
    const aparat = await kart('demirbas', { g: { kat: 'kalip' }, com: { ad: 'Bağlama aparatı', birim: 'adet' } });
    const takimlar = await o().vt.tx((db) => kategoriKartlari(db, 'sarf', 'takim'));
    assert.ok(takimlar.includes(takim));
    assert.ok(!takimlar.includes(silinmis), 'silinmiş kart listede yok');
    assert.ok(!takimlar.includes(aparat));
    assert.deepEqual(await o().vt.tx((db) => kategoriKartlari(db, 'demirbas', 'takim')), [], 'tür uymazsa kategori adı yetmez');
    assert.ok((await o().vt.tx((db) => kategoriKartlari(db, 'demirbas', 'kalip'))).includes(aparat));
  });

  test('alan değerleri kategori kodu ve nesne olmadan döner; metin dizisi kalır, karışık dizi atlanır', async () => {
    const k = await kart('sarf', {
      g: { kat: 'kimyasal', tur: 'Hidrolik yağı', marka: 'Örnek', raf: 24, ghs: ['Yanıcı (GHS02)'], karisik: ['a', 1], ic: { x: 1 }, bos: null },
      com: { ad: 'Hidrolik', birim: 'L' },
    });
    const gsiz = await kart('sarf', { com: { ad: 'Alanı yok', birim: 'adet' } });
    const alanlar = await o().vt.tx((db) => kartAlanDegerleri(db, [k, gsiz]));
    assert.deepEqual(alanlar.get(k), { tur: 'Hidrolik yağı', marka: 'Örnek', raf: 24, ghs: ['Yanıcı (GHS02)'] });
    assert.equal(alanlar.has(gsiz), false, 'alanı olmayan kart haritada yok');
    assert.equal((await o().vt.tx((db) => kartAlanDegerleri(db, []))).size, 0);
  });
});
