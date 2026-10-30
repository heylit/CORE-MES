import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { aramaSade, basDeseni, icindeDeseni, KAYIT_TURLERI, type KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';

// Genel arama (Ctrl K, kart 1234): parti/lot ve depo konumu (raf dahil) kaynakları gerçek PostgreSQL'de.
// Çekirdek, kişide kaynağın işlemlerinden biri yoksa kaynağı çağırmaz; burada o seçimin girdisi (yetki listesi) ve kaynağın kendisi denenir.
const kaynak = (tur: 'parti' | 'konum') => {
  const k = kayitAramaKaynaklari.find((x) => x.tur === tur);
  assert.ok(k, `stok ${tur} kaynağı yok`);
  return k;
};
const cagrilir = (tur: 'parti' | 'konum', islemler: readonly string[]): boolean => kaynak(tur).yetki.some((i) => islemler.includes(i));

describe('stok: genel arama kaynakları', () => {
  test('türler stoğundur, işlemler kayıtlı; okuyabilen çağrılır, stok işlemi olmayan çağrılmaz', () => {
    for (const k of kayitAramaKaynaklari) {
      assert.equal(KAYIT_TURLERI[k.tur].modul, 'stok');
      for (const i of k.yetki) assert.equal(islemMi(i), true, i);
    }
    for (const tur of ['parti', 'konum'] as const) {
      assert.equal(cagrilir(tur, ['sayfa.stok']), true);
      assert.equal(cagrilir(tur, ['stok.giris']), true);
      assert.equal(cagrilir(tur, ['sayfa.uretim-emirleri', 'uretim-emirleri.ara-istasyon']), false);
      assert.equal(cagrilir(tur, []), false);
    }
  });
});

describe('stok: genel arama kaynakları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  let kisiId = 0;
  let malzemeId = 0;
  const partiler: Record<string, number> = {};
  let konumId = 0;
  let rafId = 0;

  const istek = (q: string, sinir = 5): KayitAramaIstegi => ({
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: kisiId, islemler: ['sayfa.stok' as Islem] },
  });
  const ara = (tur: 'parti' | 'konum', q: string, sinir?: number) => o().vt.tx((db) => kaynak(tur).ara(db, istek(q, sinir)));

  after(async () => { await ortam?.kaldir(); });

  before(async () => {
    ortam = await testVeritabaniKur('stok_kayit_ara');
    kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Arama', kullaniciAdi: 'arama', parola: 'dogru-parola-1' }));
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KAR-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    malzemeId = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kar-dnm-1', 'hammadde', 'KAR-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kar-dnm-1', com: { ad: 'Deneme sac' } }), kisiId],
    ))!.no;
    for (const [lot, tedarikci] of [['LT-900001', 'TP-55'], ['LT-900002', null], ['LT-100%', 'X_Y']] as const) {
      const p = await o().sahip.tek<{ id: number }>(
        'INSERT INTO stok_parti (malzeme_id, lot_no, tedarikci_parti_no, dokum_no, acan_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id::int',
        [malzemeId, lot, tedarikci ?? `TP-${lot}`, null, kisiId],
      );
      partiler[lot] = p!.id;
    }
    const depo = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_depo WHERE kod = 'ANA'"))!.id;
    konumId = (await o().sahip.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'KZ-ARAMA', 'depo_zemini', 'Arama deneme alanı') RETURNING id", [depo]))!.id;
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, aktif) VALUES ($1, 'KZ-PASIF', 'depo_zemini', false)", [depo]);
    rafId = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_raf (depo_id, kod, tur, numaralama, bolme_sayisi, kat_sayisi, bolme_genislik_m, derinlik_m, kat_araligi_m)
       VALUES ($1, 'KZ', 'palet', 'sirali', 2, 1, 1, 1, 1) RETURNING id`, [depo]))!.id;
  });

  test('parti lot numarasının ortasından ve tedarikçi parti nosundan bulunur; tam eşleşme önde, yol hareketler', async () => {
    const lotla = await ara('parti', '90000');
    assert.deepEqual(lotla.map((s) => s.baslik).sort(), ['LT-900001', 'LT-900002']);
    const tam = await ara('parti', 'lt-900002');
    assert.equal(tam[0]?.baslik, 'LT-900002');
    const tedarikci = await ara('parti', 'TP-55');
    assert.equal(tedarikci[0]?.anahtar, String(partiler['LT-900001']));
    assert.match(tedarikci[0]!.aciklama ?? '', /Deneme sac/);
    assert.equal(tedarikci[0]?.yol, `/stok/hareketler?partiId=${partiler['LT-900001']}`);
    for (const s of [...lotla, ...tam, ...tedarikci]) assert.equal(kayitYoluMu(s.yol), true, s.yol);
  });

  test('joker karakter düz harf aranır ("%", "_"), sınır uygulanır', async () => {
    assert.deepEqual((await ara('parti', '0%')).map((s) => s.baslik), ['LT-100%']);
    assert.deepEqual((await ara('parti', 'X_Y')).map((s) => s.baslik), ['LT-100%']);
    assert.deepEqual(await ara('parti', 'T-%%'), []);
    assert.equal((await ara('parti', 'LT-', 2)).length, 2);
  });

  test('konum kod ve addan bulunur, pasif konum bulunmaz; raf aynı türde "Raf" başlığıyla gelir', async () => {
    const kodla = await ara('konum', 'KZ-AR');
    assert.deepEqual(kodla.map((s) => [s.baslik, s.yol]), [['KZ-ARAMA', `/stok/konumlar/${konumId}`]]);
    assert.match(kodla[0]!.aciklama ?? '', /Arama deneme alanı · Boş/);
    assert.equal((await ara('konum', 'deneme alan'))[0]?.baslik, 'KZ-ARAMA');
    // Türkçe harf dil ayarına bırakılmaz: "ALANI" ve "alanı" aynı konumu bulur.
    assert.ok((await ara('konum', 'DENEME ALANI')).some((x) => x.baslik === 'KZ-ARAMA'));
    assert.equal((await ara('konum', 'kz-ARAMA'))[0]?.baslik, 'KZ-ARAMA');
    assert.deepEqual(await ara('konum', 'KZ-PAS'), []);
    const raf = await ara('konum', 'KZ');
    assert.equal(raf[0]?.baslik, 'Raf KZ');
    assert.equal(raf[0]?.yol, `/stok/raflar/${rafId}`);
    assert.equal((await ara('konum', 'raf kz'))[0]?.baslik, 'Raf KZ');
  });

  test('aramalar trigram dizinini kullanabilir (göç 126000)', async () => {
    const dizinler = await o().sahip.sorgu<{ ad: string }>(
      "SELECT indexname AS ad FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE '%\\_trgm' ESCAPE '\\' AND tablename IN ('stok_parti', 'stok_konum') ORDER BY 1");
    assert.deepEqual(dizinler.map((d) => d.ad), [
      'stok_konum_ad_trgm', 'stok_konum_kod_trgm', 'stok_parti_dokum_no_trgm', 'stok_parti_lot_no_trgm', 'stok_parti_tedarikci_parti_no_trgm',
    ]);
  });
});
