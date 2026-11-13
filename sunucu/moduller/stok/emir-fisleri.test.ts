import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { emirFisKartlari, emirHareketiTuru, hareketYazani, rezerveYazani } from './kurallar.ts';

// 3175 a: emrin Fişler sekmesinin saf kuralları. Uç ve yetki testi malzeme-fisi.test.ts'tedir (gerçek PostgreSQL).
describe('stok emrin fişleri kuralları (3175)', () => {
  test('hareketin fişi asıl hareketten: üretimden giriş, sarf, fire; teslimli transfer teslim, teslimsiz ambar; ötekiler yok', () => {
    const t = (asilTur: string, p: { cikisNedeni?: string; girisKaynagi?: string; teslimNo?: string } = {}) =>
      emirHareketiTuru({ asilTur, cikisNedeni: p.cikisNedeni ?? null, girisKaynagi: p.girisKaynagi ?? null, teslimNo: p.teslimNo ?? null });
    assert.equal(t('giris', { girisKaynagi: 'uretim' }), 'uretim_girisi');
    assert.equal(t('giris', { girisKaynagi: 'mal_kabul' }), null);
    assert.equal(t('cikis', { cikisNedeni: 'uretime_sarf' }), 'sarf');
    assert.equal(t('cikis', { cikisNedeni: 'fire' }), 'fire');
    assert.equal(t('cikis', { cikisNedeni: 'sevk' }), null);
    assert.equal(t('transfer'), 'ambar');
    assert.equal(t('transfer', { teslimNo: 'TS-000001' }), 'teslim');
    assert.equal(t('sayim_fazla'), null);
  });
  test('kaynak: akış yoksa elle; bilinmeyen akış elle sayılır', () => {
    assert.equal(hareketYazani(null), 'elle');
    assert.equal(hareketYazani('terminal'), 'terminal');
    assert.equal(hareketYazani('emir'), 'emir');
    assert.equal(hareketYazani('bilinmeyen'), 'elle');
    // 3179 a: ayırma kaydında akış yok; kendiliğinden yazılan nedenler sistem, gerisi elle.
    for (const n of ['Emir açılışı', 'Mal kabul', 'Emir bitti', 'Emir iptal edildi', 'Parti birleşti: ORN-1 -> ORN-2']) assert.equal(rezerveYazani(n), 'emir', n);
    assert.equal(rezerveYazani(null), 'elle');
    assert.equal(rezerveYazani('Yanlış emre ayrıldı'), 'elle');
  });
  test('kartlar: her tür bir kart; boş emir fişi numarasıyla durur; toplam tek birimde; Logo en kötü durum; teslim Logo\'suz', () => {
    const h = (tur: 'sarf' | 'fire' | 'teslim' | 'ambar' | 'rezerve', miktar: string, birim: string | null, belgeNo: string | null, zaman = '2030-01-01T08:00:00Z') => ({ tur, miktar, birim, belgeNo, zaman });
    const kartlar = emirFisKartlari(
      [h('sarf', '4', 'adet', 'SR-000001'), h('sarf', '-1.5', 'adet', 'SR-000001', '2030-01-02T08:00:00Z'), h('fire', '1', 'kg', 'FR-000002'), h('fire', '2', 'adet', 'FR-000002'),
        h('teslim', '3', 'adet', 'TS-1'), h('ambar', '1', 'adet', 'AF-1'), h('ambar', '1', 'adet', 'AF-2'),
        h('rezerve', '10', 'kg', null), h('rezerve', '-4', 'kg', null)],
      [{ tur: 'sarf', no: 'SR-000001', logo: 'gonderildi' }, { tur: 'uretim_girisi', no: 'UG-000003', logo: 'bekliyor' }, { tur: 'fire', no: 'FR-000002', logo: 'gonderilmez' },
        { tur: 'ambar', no: 'AF-1', logo: 'gonderildi' }, { tur: 'ambar', no: 'AF-2', logo: 'hata' }],
    );
    const k = (t: string) => kartlar.find((x) => x.tur === t)!;
    assert.deepEqual(kartlar.map((x) => x.tur), ['uretim_girisi', 'fire', 'sarf', 'ambar', 'teslim', 'rezerve']);
    assert.deepEqual([k('sarf').no, k('sarf').satirSayisi, k('sarf').toplam, k('sarf').birim, k('sarf').sonHareket, k('sarf').logo],
      ['SR-000001', 2, '2.5', 'adet', '2030-01-02T08:00:00Z', 'gonderildi']);
    assert.deepEqual([k('uretim_girisi').no, k('uretim_girisi').satirSayisi, k('uretim_girisi').toplam, k('uretim_girisi').sonHareket], ['UG-000003', 0, null, null],
      'boş emir fişi numarasıyla durur');
    assert.deepEqual([k('fire').toplam, k('fire').birim], [null, null], 'karışık birimde toplam uydurulmaz');
    assert.deepEqual([k('ambar').no, k('ambar').belgeSayisi, k('ambar').logo], [null, 2, 'hata'], 'iki fişte numara yok, en kötü Logo durumu');
    assert.deepEqual([k('teslim').no, k('teslim').logo], ['TS-1', null]);
    assert.deepEqual([k('rezerve').no, k('rezerve').satirSayisi, k('rezerve').toplam, k('rezerve').birim, k('rezerve').logo], [null, 2, '6', 'kg', null],
      'rezerve toplamı emre ayrılı kalandır; belge ve Logo yok');
  });
});
