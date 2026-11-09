import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeKategorileri } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 2478: kart başına kategori; anahtar kategori ağacının (tür, kod) düğümüdür.
describe('malzemeler kart kategorisi (2478, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  async function kart(tur: string, kayit: Record<string, unknown>, durum = 'aktif'): Promise<number> {
    sira += 1;
    const onek = `KKT-${tur.slice(0, 3).toUpperCase()}-`;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', [onek]);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8) RETURNING no`,
      [`kkt-${sira}`, tur, onek, sira, durum, JSON.stringify({ id: `kkt-${sira}`, ...kayit }), kisiId, tur === 'hizmet' ? 'alinan' : null],
    );
    return r!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemekkat');
    kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kategori', kullaniciAdi: 'kkt-yonetici', parola: PAROLA }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('türe göre (tür, kod); kategorisiz tür ve boş kategori null; olmayan kart yok; iptal kart döner', async () => {
    const hm = await kart('hammadde', { fam: 'metal', com: { ad: 'Çubuk' } });
    const sf = await kart('sarf', { g: { kat: 'takim' }, com: { ad: 'Freze' } });
    const db = await kart('demirbas', { g: { kat: 'olcu' }, com: { ad: 'Mikrometre' } }, 'iptal');
    const hz = await kart('hizmet', { g: { kat: 'isil', yon: 'alinan' }, com: { ad: 'Islah' } });
    const mm = await kart('mamul', { g: { kat: 'takim' }, fam: 'metal', com: { ad: 'Mamul' } });
    const bos = await kart('sarf', { g: { kat: '  ' }, com: { ad: 'Boş' } });
    const sayi = await kart('hammadde', { fam: 5, com: { ad: 'Bozuk' } });
    const m = await o().vt.tx((d) => malzemeKategorileri(d, [hm, sf, db, hz, mm, bos, sayi, hm, 999999]));
    assert.deepEqual(m.get(hm), { tur: 'hammadde', kod: 'metal' });
    assert.deepEqual(m.get(sf), { tur: 'sarf', kod: 'takim' });
    assert.deepEqual(m.get(db), { tur: 'demirbas', kod: 'olcu' });
    assert.deepEqual(m.get(hz), { tur: 'hizmet', kod: 'isil' });
    assert.equal(m.get(mm), null);
    assert.equal(m.get(bos), null);
    assert.equal(m.get(sayi), null);
    assert.equal(m.has(999999), false);
    assert.equal(m.size, 7);
  });

  test('boş liste boş harita', async () => {
    assert.equal((await o().vt.tx((d) => malzemeKategorileri(d, []))).size, 0);
  });
});
