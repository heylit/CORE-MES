import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, guncellemeIptalleri, guncellemeReddi } from './kurallar.ts';

describe('SAT-80 (2876, 2871-1 b): güncelleme talebi açılabilir mi (saf)', () => {
  const t = (durum: Parameters<typeof guncellemeReddi>[0]['durum'], ek: Partial<Parameters<typeof guncellemeReddi>[0]> = {}) => ({ durum, birlesme: null, kaynaklar: [], ...ek });
  test('izinli: teklif isteniyor ve değerlendirmede, bağsız ve birleşmemiş talep', () => {
    assert.equal(guncellemeReddi(t('teklif_isteniyor'), false), null);
    assert.equal(guncellemeReddi(t('degerlendirme'), false), null);
  });
  test('yasak: taslak, onayda, siparişte, iptal; birleştirilmiş ya da birleşik; bağlı kalemli', () => {
    for (const d of ['taslak', 'onayda', 'siparis_verildi', 'teslim_alindi', 'iptal'] as const) assert.equal(guncellemeReddi(t(d), false), ILETILER.guncellemeAsamasi, d);
    assert.equal(guncellemeReddi(t('teklif_isteniyor', { birlesme: { talepId: '00000000-0000-4000-8000-000000000001', no: 'ST-1', durum: 'taslak' } }), false), ILETILER.guncellemeBirlesik);
    const kaynak = { talepId: '00000000-0000-4000-8000-000000000002', no: 'ST-2', talepEdenAdi: null, kalemIdleri: [], ihtiyacTarihi: null, birim: null, uretimEmriNo: null };
    assert.equal(guncellemeReddi(t('degerlendirme', { kaynaklar: [kaynak] }), false), ILETILER.guncellemeBirlesik);
    assert.equal(guncellemeReddi(t('teklif_isteniyor'), true), ILETILER.guncellemeBagli);
  });
});

describe('SAT-81 (2871-2 a): siparişe geçişte iptal edilecek grup üyeleri (saf)', () => {
  test('siparişe geçen, siparişteki ve iptal olan dışındaki açık talepler', () => {
    const grup = [
      { id: 'a', durum: 'teklif_isteniyor' }, { id: 'b', durum: 'siparis_verildi' }, { id: 'c', durum: 'taslak' },
      { id: 'd', durum: 'iptal' }, { id: 'e', durum: 'onayda' }, { id: 'f', durum: 'teslim_alindi' },
    ];
    assert.deepEqual(guncellemeIptalleri(grup, 'b').map((x) => x.id), ['a', 'c', 'e']);
    assert.deepEqual(guncellemeIptalleri([{ id: 'b', durum: 'siparis_verildi' }], 'b'), []);
  });
});
