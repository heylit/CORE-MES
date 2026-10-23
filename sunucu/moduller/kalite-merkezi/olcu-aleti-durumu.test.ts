import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DURUMLAR } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { cihazGecerliMi, olcuAletleriListesi } from './kurallar.ts';

// B17: ekran cihaz durumunu sunucunun gönderdiği Kalibrasyon durumundan gösterir; ölçüm denetimi (KM-K88) aynı durumla karar verir.
describe('B17 cihaz durumu: listedeki durum ölçüm denetiminin kullandığı durumdur', () => {
  const alet = (id: number, no: string, durum: (typeof DURUMLAR)[number], vade: string | null, kalanGun: number | null) => ({
    id, no, tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 365, kullanimDisi: durum === 'kullanim-disi',
    sonKalibrasyon: vade === null ? null : '2025-11-01', durum, vade, kalanGun, kayitlar: [],
  });

  test('her durum, vadesi ve kalan günüyle cihaz kaydına geçer; kullanılabilirlik denetimle aynıdır', () => {
    const aletler = DURUMLAR.map((d, i) => alet(i + 1, `B17-${String(i + 1)}`, d, d === 'kayit-yok' ? null : '2026-11-01', d === 'kayit-yok' ? null : i - 2));
    const liste = olcuAletleriListesi(aletler, []);
    const durumlar = new Map(aletler.map((a) => [a.no, a.durum]));
    for (const [i, a] of aletler.entries()) {
      const govde = liste[i]?.govde;
      assert.deepEqual(
        [govde?.['kalibrasyonDurumu'], govde?.['kalibrasyonVadesi'], govde?.['kalibrasyonKalanGun']],
        [a.durum, a.vade, a.kalanGun],
        a.durum,
      );
      assert.equal(cihazGecerliMi(govde ?? null, durumlar), a.durum === 'gecerli' || a.durum === 'yaklasan', a.durum);
    }
  });

  test('Kalibrasyonda eşi olmayan eski kayıt durum taşımaz: ekran kuralı yerelde koşar, sunucu cihazı geçersiz sayar', () => {
    const [eski] = olcuAletleriListesi([], [{ kimlik: 'dev_b17', govde: { kod: 'B17-YOK', sonKal: '2026-10-01', periyot: 12 } }]);
    assert.equal(eski?.govde['kalibrasyonDurumu'], undefined);
    assert.equal(eski?.govde['sonKal'], '');
    assert.equal(cihazGecerliMi(eski?.govde ?? null, new Map()), false);
  });
});
