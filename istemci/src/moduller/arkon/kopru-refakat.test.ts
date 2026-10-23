import { describe, expect, it } from 'vitest';
import type { RefakatKartlariCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { RefakatKarti } from '../../../../arkon/web/src/data/refakat-karti.ts';
import { cevapla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

// Arkon'un kart listesi isteği köprüde karşılıksız kalırsa iş kartsız açılır ve kart hiç görünmez; köprünün bu yolu taşıdığı burada sabitlenir.
const cevap = {
  kartlar: [{
    id: 4, uretimEmriId: 7, etiket: 'UE-000007-P4', lotNo: 'LT-1', malzemeKod: null, malzemeAd: null, birim: null, verilen: '10',
    istasyondaSatirVar: true, sayilan: null, sinir: null,
  }],
} satisfies RefakatKartlariCevabi;

const istemciKur = () => {
  const yollar: string[] = [];
  const istemci = { get: async <T,>(yol: string) => { yollar.push(yol); return cevap as T; }, post: async () => { throw new Error('yazma yok'); } } as unknown as Istemci;
  return { istemci, yollar };
};

describe('köprü: refakat kartları (kart #156)', () => {
  it('Arkon /refakat-kartlari isteği istasyon ve emirlerle TMI /arkon/refakat-kartlari ucuna gider; cevap olduğu gibi döner', async () => {
    const { istemci, yollar } = istemciKur();
    const c = await cevapla(istemci, { yontem: 'GET', yol: '/refakat-kartlari', sorgu: new URLSearchParams('istasyon=T 1&emirler=7,9'), govde: undefined });
    expect(c.durum).toBe(200);
    expect(c.govde).toEqual(cevap);
    expect(yollar).toHaveLength(1);
    const [yol, sorgu] = yollar[0]!.split('?');
    expect(yol).toBe('/arkon/refakat-kartlari');
    // Sorgu yalnız istasyon ve emirleri taşır; doğrulamayı TMI ucu yapar.
    expect(Object.fromEntries(new URLSearchParams(sorgu))).toEqual({ istasyon: 'T 1', emirler: '7,9' });
    // Ekranın kart tipi sunucu sözleşmesiyle aynı biçimdir.
    const ekran: RefakatKarti[] = cevap.kartlar;
    expect(ekran[0]!.id).toBe(4);
  });

  it('yazma yöntemi bu yolda tanınmaz', async () => {
    const { istemci, yollar } = istemciKur();
    const c = await cevapla(istemci, { yontem: 'POST', yol: '/refakat-kartlari', sorgu: new URLSearchParams(), govde: {} });
    expect(c.durum).toBe(404);
    expect(yollar).toEqual([]);
  });
});
