import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ozetle, sunucuOzeti, tabloMetni, yuzdelik } from './olcum.ts';
import type { Ornek } from './olcum.ts';
import { tohumluUretec } from './senaryo.ts';

describe('yük ölçümü', () => {
  it('yüzdelik en yakın sıra yöntemiyle ölçülmüş bir örneği verir; boşta null', () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.equal(yuzdelik(s, 50), 50);
    assert.equal(yuzdelik(s, 95), 95);
    assert.equal(yuzdelik(s, 99), 99);
    assert.equal(yuzdelik([7], 99), 7);
    assert.equal(yuzdelik([], 95), null);
  });

  it('yüzdelikler sıralıdır ve en çoku aşmaz (tohumlu çok tur)', () => {
    const r = tohumluUretec(1669);
    for (let tur = 0; tur < 100; tur += 1) {
      const ornekler: Ornek[] = Array.from({ length: 1 + Math.floor(r() * 500) }, () => ({ kalip: 'GET /a', durum: 200, sureMs: Math.floor(r() * 2000) }));
      const o = ozetle(ornekler, 10).toplam;
      assert.ok((o.p50Ms ?? 0) <= (o.p95Ms ?? 0) && (o.p95Ms ?? 0) <= (o.p99Ms ?? 0) && (o.p99Ms ?? 0) <= (o.enCokMs ?? 0), `tohum 1669, tur ${String(tur)}`);
    }
  });

  it('hataları sınıfına göre sayar; cevapsız istek süre hesabına girmez', () => {
    const ornekler: Ornek[] = [
      { kalip: 'GET /a', durum: 200, sureMs: 10 },
      { kalip: 'GET /a', durum: 403, sureMs: 5 },
      { kalip: 'GET /a', durum: 503, sureMs: 2000 },
      { kalip: 'GET /a', durum: 500, sureMs: 40 },
      { kalip: 'GET /b', durum: null, sureMs: 30_000 },
    ];
    const { toplam, uclar } = ozetle(ornekler, 5);
    assert.equal(toplam.sayi, 5);
    assert.equal(toplam.saniyede, 1);
    assert.equal(toplam.istemciHatasi, 1);
    assert.equal(toplam.sunucuHatasi, 2);
    assert.equal(toplam.mesgul, 1);
    assert.equal(toplam.cevapsiz, 1);
    assert.equal(toplam.enCokMs, 2000);
    const b = uclar.find((u) => u.kalip === 'GET /b');
    assert.equal(b?.p95Ms, null);
    assert.equal(uclar[0]?.kalip, 'GET /a');
  });

  it('tablo her uç ve toplam için bir satır yazar, ölçülmeyeni tire gösterir', () => {
    const metin = tabloMetni(ozetle([{ kalip: 'GET /b', durum: null, sureMs: 1 }], 1));
    const satirlar = metin.split('\n');
    assert.equal(satirlar.length, 3);
    assert.match(satirlar[1] ?? '', /^GET \/b\s+1\s+1\s+-/);
  });

  it('sunucu özeti ölçülemeyeni atlar, hiç ölçü yoksa null verir', () => {
    assert.deepEqual(sunucuOzeti([]), { olcumSayisi: 0, enCokOlayDongusuMs: null, enCokVtBaglanti: null, enCokRssBayt: null });
    const o = sunucuOzeti([
      { an: 1, olayDongusuMs: 12, vtBaglanti: null, rssBayt: 100 },
      { an: 2, olayDongusuMs: null, vtBaglanti: 8, rssBayt: 300 },
    ]);
    assert.deepEqual(o, { olcumSayisi: 2, enCokOlayDongusuMs: 12, enCokVtBaglanti: 8, enCokRssBayt: 300 });
  });
});
