import { describe, expect, it } from 'vitest';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { malzemeHazir, maliyetSistemi } from './kurallar.ts';
import { bugunIso, ekMesaiKaldirYaz, tezGiderYaz, tezUcretYaz, type Yaz } from './yazmalar.ts';
import { ornekCalisma } from './test-verisi.ts';

// Yazmalar tek alanı tek değişiklik olarak yazar; plan korunacak yazma bunu söyler. Malzeme sırası sunucu motorunun matAlloc'una uyar.
function kayitci(c: PlanlamaCalismasi) {
  const l: { ne: string; ayrinti: string; planKoru: boolean }[] = [];
  const yaz: Yaz = (ne, ayrinti, fn, s) => { if (fn(c) === false) return false; l.push({ ne, ayrinti, planKoru: s?.planKoru === true }); return true; };
  return { l, yaz };
}

describe('P3 yazmalar', () => {
  it('tezgâh saat ücreti tek değişiklik; plan korunmaz (plan yeniden çözülür)', () => {
    const c = ornekCalisma();
    const { l, yaz } = kayitci(c);
    expect(tezUcretYaz(yaz, c.D, 'T1', 130)).toBe(true);
    expect(c.D.tezgahlar.find((t) => t.id === 'T1')?.ucret).toBe(130);
    expect(l).toEqual([{ ne: 'Tezgâh saat maliyeti değişti', ayrinti: 'T1: 100 → 130 TL/sa', planKoru: false }]);
    expect(tezUcretYaz(yaz, c.D, 'YOK', 1)).toBe(false);
  });

  it('kaydı olmayan tezgâha ilk yazmada boş kayıt açılır, plan korunur; listede olmayan tezgâha yazılmaz (467 b)', () => {
    const c = ornekCalisma();
    const { l, yaz } = kayitci(c);
    expect(maliyetSistemi(c.D).tez.T2).toBeUndefined();
    expect(tezGiderYaz(yaz, c.D, 'T2', 'kw', 15)).toBe(true);
    expect(maliyetSistemi(c.D).tez.T2).toMatchObject({ kw: 15 });
    expect(l[0]?.planKoru).toBe(true);
    expect(tezGiderYaz(yaz, c.D, 'T9', 'kw', 15)).toBe(false);
    expect(l).toHaveLength(1);
  });

  it('ek mesai kaldırma süzülmüş sırayla kaydı bulur ve o vardiyanın kararını da siler', () => {
    const c = ornekCalisma({
      ekMesai: [{ m: 'T1', gun: 'bozuk', vardiya: 'V1' }, { m: 'T1', gun: 0, vardiya: 'V1' }, { m: 'T2', gun: 1, vardiya: 'V1' }],
      D: { mesaiKarar: [{ m: 'T2', gun: 1, vardiya: 'V1', karar: 'kabul', kim: 'Deneme' }, { m: 'T1', gun: 0, vardiya: 'V1', karar: 'kabul', kim: 'Deneme' }] },
    });
    const { yaz } = kayitci(c);
    expect(ekMesaiKaldirYaz(yaz, 1, 'T2 06.01 V1')).toBe(true);
    expect(c.ekMesai.map((e) => [e.m, e.gun])).toEqual([['T1', 'bozuk'], ['T1', 0]]);
    expect((c.D.mesaiKarar as { m: string }[]).map((k) => k.m)).toEqual(['T1']);
    expect(ekMesaiKaldirYaz(yaz, 5, 'yok')).toBe(false);
  });
});

describe('P3 malzemenin hazır olması (matAlloc kopyası)', () => {
  const D = (kip: string) => ({
    planAgirlik: { kip },
    malzemeler: [{ kod: 'M1', ad: 'Deneme çubuk', birim: 'kg', birimFiyat: 10, kalite: 'K1', form: 'Çubuk', stok: 3 }],
    siparisler: [
      { id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-09 16:00', oncelik: 1, malzeme: [{ kod: 'M1', miktar: 1.5 }] },
      { id: 'S2', urun: 'U1', adet: 2, termin: '2026-01-08 16:00', oncelik: 2, malzeme: [{ kod: 'M1', miktar: 1.5 }] },
    ],
    satinalma: [{ kod: 'M1', miktar: 3, gelis: '2026-01-07 08:00' }],
  });

  it('öncelik kipinde stok önce öncelikli siparişe gider; öteki satın almayı bekler', () => {
    const h = malzemeHazir(ornekCalisma({ D: D('oncelik') }), 7);
    expect(h).toEqual({ S1: 7, S2: 56 });
  });

  it('815: kayıtta kalan bedel kipi de öncelikle sıralar', () => {
    const h = malzemeHazir(ornekCalisma({ D: D('bedel') }), 7);
    expect(h).toEqual({ S1: 7, S2: 56 });
  });

  it('malzeme gecikmesi olayı satın almayı öteler; karşılanmayan ihtiyaç hazır olmaz', () => {
    const c = ornekCalisma({ D: D('oncelik') });
    c.olaylar = [{ tip: 'malzeme', kod: 'M1', gun: 1 }];
    expect(malzemeHazir(c, 7)).toEqual({ S1: 7, S2: 80 });
    const c2 = ornekCalisma({ D: { ...D('oncelik'), satinalma: [] } });
    expect(malzemeHazir(c2, 7).S2).toBe(Infinity);
  });
});

describe('fiyat kaydının günü', () => {
  it('gece yarısından sonra tesis gününü yazar', () => {
    expect(bugunIso(Date.parse('2026-10-28T22:30:00Z'))).toBe('2026-10-29');
  });
});
