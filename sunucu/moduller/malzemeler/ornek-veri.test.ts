import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { malzemeNoKoddan, ORNEK_MALZEME_ANAHTARLARI, ornekMalzemeNo } from './disari.ts';

interface KartSatiri { kimlik: string; stok_kodu: string; tur: string; onay_durumu: string; acan: string | null; onaylayan: string | null }

describe('Malzemeler örnek verisi (kart #906, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Kişiler payı çekirdeğin keşfiyle alınır: modül başka modülün yalnız disari.ts'ini ithal eder.
  const yukle = async () => {
    const zincir = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'kisiler' || t.modul === 'malzemeler');
    return ornekVeriYukle(vt(), zincir, { ortam: 'gelistirme', bildir: () => undefined });
  };

  before(async () => { ortam = await testVeritabaniKur('malzemeornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('kişilerden sonra hikayenin yedi kartı aktif açılır: üç mamul, iki hammadde, bir sarf, bir alınan hizmet; planlama açar, müdür onaylar', async () => {
    assert.deepEqual(await yukle(), { durum: 'yuklendi', moduller: ['kisiler', 'malzemeler'] });
    const kartlar = await vt().sorgu<KartSatiri>(
      `SELECT k.kimlik, k.stok_kodu, k.tur, k.onay_durumu, a.kullanici_adi AS acan, o.kullanici_adi AS onaylayan
         FROM malzeme_katalog_karti k LEFT JOIN kisi a ON a.id = k.acan_kisi_id LEFT JOIN kisi o ON o.id = k.onaylayan_kisi_id
        ORDER BY k.no`);
    assert.deepEqual(kartlar.slice(0, 7).map((k) => [k.kimlik, k.stok_kodu, k.tur, k.onay_durumu]), [
      ['ornek-mil', 'MM-ORN-00001', 'mamul', 'aktif'],
      ['ornek-flans', 'MM-ORN-00002', 'mamul', 'aktif'],
      ['ornek-burc', 'MM-ORN-00003', 'mamul', 'aktif'],
      ['ornek-cubuk', 'HM-ORN-00001', 'hammadde', 'aktif'],
      ['ornek-levha', 'HM-ORN-00002', 'hammadde', 'aktif'],
      ['ornek-kesme-yagi', 'SF-ORN-00001', 'sarf', 'aktif'],
      ['ornek-isil-islem', 'HZ-ORN-00001', 'hizmet', 'aktif'],
    ]);
    for (const k of kartlar.slice(0, 7)) assert.deepEqual([k.acan, k.onaylayan], ['ornek.planlama', 'ornek.mudur'], k.kimlik);
    assert.equal((await vt().tek<{ yon: string }>(`SELECT hizmet_yonu AS yon FROM malzeme_katalog_karti WHERE kimlik = 'ornek-isil-islem'`))?.yon, 'alinan');
  });

  test('sayfalamaya yetecek dolgu kartı: altı türden 45 uydurma kart, listedeki kategorilerle; çoğu aktif, bir kısmı onayda ya da taslak', async () => {
    const dolgu = await vt().sorgu<KartSatiri & { kat: string | null }>(
      `SELECT k.kimlik, k.stok_kodu, k.tur, k.onay_durumu, a.kullanici_adi AS acan, o.kullanici_adi AS onaylayan, k.kayit->'g'->>'kat' AS kat
         FROM malzeme_katalog_karti k LEFT JOIN kisi a ON a.id = k.acan_kisi_id LEFT JOIN kisi o ON o.id = k.onaylayan_kisi_id
        WHERE k.kimlik LIKE 'ornek-dolgu-%' ORDER BY k.no`);
    assert.equal(dolgu.length, 45);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM malzeme_katalog_karti'))!.n, 52);
    const say = (f: (k: KartSatiri) => string) => dolgu.reduce<Record<string, number>>((o, k) => ({ ...o, [f(k)]: (o[f(k)] ?? 0) + 1 }), {});
    assert.deepEqual(say((k) => k.onay_durumu), { aktif: 29, onayda: 10, taslak: 6 });
    assert.deepEqual(say((k) => k.tur), { hammadde: 8, yarimamul: 8, mamul: 8, sarf: 7, demirbas: 7, hizmet: 7 });
    for (const k of dolgu) {
      assert.match(k.stok_kodu, /^(HM|YM|MM|SF|DB|HZ)-ORN-\d{5}$/, k.kimlik);
      assert.deepEqual([k.acan, k.onaylayan], ['ornek.planlama', k.onay_durumu === 'aktif' ? 'ornek.mudur' : null], k.kimlik);
    }
    assert.ok(new Set(dolgu.filter((k) => k.tur === 'sarf').map((k) => k.kat)).size > 1);
  });

  test('başka modüller kartı anahtarla ya da stok koduyla bulur; olmayan kod null', async () => {
    for (const a of ORNEK_MALZEME_ANAHTARLARI) {
      const no = await vt().tx((db) => ornekMalzemeNo(db, a));
      assert.equal(typeof no, 'number', a);
    }
    const mil = await vt().tx((db) => ornekMalzemeNo(db, 'mil'));
    assert.equal(await vt().tx((db) => malzemeNoKoddan(db, ' mm-orn-00001 ')), mil);
    assert.equal(await vt().tx((db) => malzemeNoKoddan(db, 'MM-ORN-99999')), null);
    assert.equal(await vt().tx((db) => malzemeNoKoddan(db, '  ')), null);
  });

  test('ikinci koşu hiçbir şey yazmaz', async () => {
    const once = (await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM malzeme_katalog_karti'))!.sayi;
    assert.equal((await yukle()).durum, 'yuklu');
    assert.equal((await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM malzeme_katalog_karti'))!.sayi, once);
  });
});
