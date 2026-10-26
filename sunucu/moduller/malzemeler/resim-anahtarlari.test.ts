import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeResimAnahtarlari } from './disari.ts';

describe('Çizim merkezi için teknik resim no ve revizyon (kart #688, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let sira = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Kayıt doğrudan yazılır: bu dosya okumayı ölçer, kart kaydetme kurallarını değil.
  const kart = async (tur: string, g: Record<string, unknown>, durum = 'aktif'): Promise<number> => {
    sira += 1;
    const kimlik = `ra${sira}`;
    const onek = `${{ hammadde: 'HM', sarf: 'SF', mamul: 'MM', yarimamul: 'YM' }[tur] ?? 'HM'}-RSA-`;
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 1000) ON CONFLICT (onek) DO NOTHING', [onek]);
    const kayit = { id: kimlik, tur, g, com: { kod: `${onek}${String(sira).padStart(5, '0')}`, birim: 'adet' }, onay: { durum }, rev: [{ not: 'geçmiş' }] };
    return (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING no`,
      [kimlik, tur, onek, sira, durum, JSON.stringify(kayit), kisiId],
    ))!.no;
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemeresim');
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme resim', kullaniciAdi: 'ra-yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('yarı mamul ve mamulde resim no ve revizyon kırpılarak döner; boş ya da yalnız boşluk null; geçmiş (kayit.rev) okunmaz', async () => {
    const ym = await kart('yarimamul', { ad: 'Braket', resim: ' TR-1 ', rev: 'B' });
    const mm = await kart('mamul', { ad: 'Ünite', resim: 'TR-2', rev: '   ' });
    const resimsiz = await kart('yarimamul', { ad: 'Resimsiz', resim: '', rev: 'A' });
    const gsiz = await kart('mamul', {});
    const pasif = await kart('mamul', { resim: 'TR-3', rev: '01' }, 'pasif');
    const m = await vt().tx((db) => malzemeResimAnahtarlari(db, [ym, mm, resimsiz, gsiz, pasif]));
    assert.deepEqual(m.get(ym), { resimNo: 'TR-1', revizyon: 'B' });
    assert.deepEqual(m.get(mm), { resimNo: 'TR-2', revizyon: null });
    assert.deepEqual(m.get(resimsiz), { resimNo: null, revizyon: 'A' });
    assert.deepEqual(m.get(gsiz), { resimNo: null, revizyon: null });
    assert.deepEqual(m.get(pasif), { resimNo: 'TR-3', revizyon: '01' });
  });

  test('başka türde kart null değerlerle yer alır; olmayan kart haritada yok; yinelenen kimlik tek kayıt; boş listede harita boş', async () => {
    const hm = await kart('hammadde', { resim: 'TR-9', rev: 'A' });
    const sf = await kart('sarf', { resim: 'TR-8' });
    const ym = await kart('yarimamul', { resim: 'TR-7', rev: 'C' });
    const m = await vt().tx((db) => malzemeResimAnahtarlari(db, [hm, sf, ym, ym, 2147483000]));
    assert.deepEqual([...m.keys()].sort((a, b) => a - b), [hm, sf, ym].sort((a, b) => a - b));
    assert.deepEqual(m.get(hm), { resimNo: null, revizyon: null });
    assert.deepEqual(m.get(sf), { resimNo: null, revizyon: null });
    assert.deepEqual(m.get(ym), { resimNo: 'TR-7', revizyon: 'C' });
    assert.equal((await vt().tx((db) => malzemeResimAnahtarlari(db, []))).size, 0);
  });
});
