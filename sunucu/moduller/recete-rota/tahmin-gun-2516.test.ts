import assert from 'node:assert/strict';
import { test } from 'node:test';
import { durumEmirlerSemasi } from '#paylasilan/sozlesme/recete-rota.ts';
import { emirleriCevir, type EmirKaydi } from './kurallar.ts';

// 2516-2, B-2483-11: termini girilmemiş fason adımın Satın Alma tahmini plan motoruna opYer.tahminGun ile gider. Veriler uydurmadır.
const adim = (sira: number, ek: Partial<EmirKaydi['isEmirleri'][number]> = {}): EmirKaydi['isEmirleri'][number] => ({
  sira, opNo: sira * 10, durum: 'bekliyor', saglamAdet: null, canliAdet: null, ad: `OP ${String(sira)}`, operasyonTipiId: 3,
  istasyonId: 10, ayarSuresiDk: '0', birimSureDk: '1', ...ek,
});
const emir = (isEmirleri: EmirKaydi['isEmirleri']): EmirKaydi => ({
  id: 1, emirNo: 'E-1', malzemeNo: 50, adet: 4, baslangic: null, teslim: null, oncelik: 1, aciklama: null, kaynakRotaRevizyonId: 7,
  durum: 'planli', emirTuru: 'normal', acilma: '2026-10-19T05:00:00.000Z', bitis: null, ustEmirId: null, bolunmeSira: null,
  birlestigiEmirId: null, birlesmeOpNo: null, surum: 1, isEmirleri,
});

test('termini olmayan fason adım tahmini taşır; termin girildiyse ya da tahmin yoksa alan yok; sözleşmeden geçer', () => {
  const d = emirleriCevir([emir([
    adim(1, { kaynak: { tur: 'fason', id: 9 }, terminGun: null, tahminGun: 3.5, istasyonId: null }),
    adim(2, { kaynak: { tur: 'fason', id: 9 }, terminGun: 2, tahminGun: 3.5, istasyonId: null }),
    adim(3, { kaynak: { tur: 'fason', id: 9 }, terminGun: null, tahminGun: null, istasyonId: null }),
    adim(4, { tahminGun: 5 }),
  ])]);
  assert.equal(d.opYer?.['1|root|1']?.tahminGun, 3.5);
  assert.equal(d.opYer?.['1|root|2']?.tahminGun, undefined);
  assert.equal(d.opYer?.['1|root|3']?.tahminGun, undefined);
  assert.equal(d.opYer?.['1|root|4']?.tahminGun, undefined);
  assert.doesNotThrow(() => durumEmirlerSemasi.parse(d));
});
