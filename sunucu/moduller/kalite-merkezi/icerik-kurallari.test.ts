import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { karakteristikSonucu as ekranKarakteristikSonucu } from '../../../istemci/src/moduller/kalite-merkezi/yeni/kurallar.ts';
import { FAI_CHK, GIRIS_CHK } from '../../../istemci/src/moduller/kalite-merkezi/yeni/sabitler.ts';
import type { Karakteristik } from '../../../istemci/src/moduller/kalite-merkezi/yeni/tipler.ts';
import { FAI_KONTROL_SAYISI, GIRIS_KONTROL_SAYISI, karakteristikSonucu, muayeneSonucu } from './kurallar.ts';

describe('Kalite Merkezi içerik kuralları', () => {
  // K2 a (kart 1779e): sunucu muayene sonucunu ekranın kuralıyla yeniden hesaplar; iki kopya aynı kalmalı.
  test('KM-1 ekran eşitliği: karakteristik sonucu ekranın hesabıyla, muayene sonucu ekranın sırasıyla aynıdır', () => {
    assert.deepEqual([GIRIS_KONTROL_SAYISI, FAI_KONTROL_SAYISI], [GIRIS_CHK.length, FAI_CHK.length]);
    const satirlar: Karakteristik[] = [];
    for (const tip of [undefined, 'Değişken', 'Nitel'] as const) {
      for (const olcum of ['', '10', '10,1', '10.1000001', '9.9', '10.2', 'abc', 'Uygun', 'Uygun değil']) {
        for (const [nominal, alt, ust] of [['10', '0.1', '0.1'], ['10', '-0.1', ''], ['', '0.1', '0.1'], ['10', 'x', '0,2']] as const) {
          satirlar.push({ ad: 'Ç', ...(tip === undefined ? {} : { tip }), olcum, nominal, alt, ust } as Karakteristik);
        }
      }
    }
    for (const c of satirlar) assert.equal(karakteristikSonucu(c as Record<string, unknown>), ekranKarakteristikSonucu(c), JSON.stringify(c));
    // Ekranın `muayeneTopla` sırası (muayene/hesap.ts; arayüz ithal ettiği için burada kopya tabloyla): eksik ölçüm, ret, belge, kabul.
    const ok = { ad: 'Ç', nominal: '10', alt: '0.1', ust: '0.1', olcum: '10', sonuc: 'OK' };
    const nok = { ...ok, olcum: '11', sonuc: 'NOK' };
    const bos = { ...ok, olcum: '', sonuc: '' };
    const durumlar: [Record<string, unknown>, string][] = [
      [{ chars: [] }, 'Devam ediyor'], [{ chars: [ok, bos] }, 'Devam ediyor'], [{ chars: [nok, bos] }, 'Devam ediyor'],
      [{ chars: [ok, nok] }, 'Ret'], [{ tur: 'Giriş', chars: [nok], gchk: [] }, 'Ret'],
      [{ tur: 'Giriş', chars: [ok], gchk: [0, 1, 2, 3] }, 'Beklemede'], [{ tur: 'Giriş', chars: [ok], gchk: [0, 1, 2, 3, 4] }, 'Kabul'],
      [{ tur: 'FAI', chars: [ok], fchk: [0, 1] }, 'Beklemede'], [{ tur: 'FAI', chars: [ok], fchk: [0, 1, 2] }, 'Kabul'],
      [{ tur: 'Proses', chars: [ok] }, 'Kabul'], [{ tur: 'Giriş', chars: [ok] }, 'Beklemede'],
    ];
    for (const [g, beklenen] of durumlar) assert.equal(muayeneSonucu(g), beklenen, JSON.stringify(g));
  });
});
