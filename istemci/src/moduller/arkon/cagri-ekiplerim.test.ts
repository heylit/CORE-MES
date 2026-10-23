import { describe, expect, it } from 'vitest';
import type { CagriEkiplerimCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { cagriBanaMi, cagriEkipleriniAl } from '../../../../arkon/web/src/data/cagri-ekiplerim.ts';
import { cevapla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

// Çağrı bandı alıcıyı TMI bildirim yönlendirmesinden alır (298, CEKIRDEK-ISTEKLERI 8); Arkon'da ayrı ekip -> rol eşlemesi kalmaz.
describe('çağrı bandı alıcısı', () => {
  it('yönlendirmenin verdiği ekipler görünür, ötekiler görünmez; yönlendirilmeyen kişi hiçbir çağrıyı görmez', () => {
    expect(cagriBanaMi('malzeme', 'plan', ['malzeme'])).toBe(true);
    expect(cagriBanaMi('bakim', 'plan', ['malzeme'])).toBe(false);
    // Eski kopya malzeme çağrısını yalnız plan rolüne verirdi; yönlendirme kaliteciye verdiyse bant da kaliteciye gösterir.
    expect(cagriBanaMi('malzeme', 'quality', ['malzeme'])).toBe(true);
    expect(cagriBanaMi('kalite', 'op', [])).toBe(false);
  });

  it('yönetici ve vardiya amiri yönlendirmeden bağımsız bütün çağrıları görür', () => {
    expect(cagriBanaMi('bakim', 'admin', [])).toBe(true);
    expect(cagriBanaMi('kalite', 'lead', [])).toBe(true);
  });

  it('yönlendirme okunamazsa bant çağrıyı gösterir (çağrı kaçmaz)', () => {
    expect(cagriBanaMi('bakim', 'op', null)).toBe(true);
    expect(cagriBanaMi('bakim', null, null)).toBe(true);
  });

  it('sunucu cevabı sözleşmeyle okunur; başka biçim okunamamış sayılır', () => {
    expect(cagriEkipleriniAl({ ekipler: ['bakim', 'ayarci'] } satisfies CagriEkiplerimCevabi)).toEqual(['bakim', 'ayarci']);
    expect(cagriEkipleriniAl({ ekipler: [] })).toEqual([]);
    expect(cagriEkipleriniAl(undefined)).toBeNull();
    expect(cagriEkipleriniAl({ ekipler: [1] })).toBeNull();
    expect(cagriEkipleriniAl({})).toBeNull();
  });
});

describe('köprü: çağrı ekiplerim (298)', () => {
  it("Arkon /cagri-ekiplerim isteği TMI /bildirimler/cagri-yonlendirme/benim ucuna gider; cevap olduğu gibi döner ve bant onu okur", async () => {
    const cevap = { ekipler: ['kalite'] } satisfies CagriEkiplerimCevabi;
    const yollar: string[] = [];
    const istemci = { get: async <T,>(yol: string) => { yollar.push(yol); return cevap as T; }, post: async () => { throw new Error('yazma yok'); } } as unknown as Istemci;
    const c = await cevapla(istemci, { yontem: 'GET', yol: '/cagri-ekiplerim', sorgu: new URLSearchParams('c=c1'), govde: undefined });
    expect(c.durum).toBe(200);
    expect(yollar).toEqual(['/bildirimler/cagri-yonlendirme/benim']);
    expect(cagriEkipleriniAl(c.govde)).toEqual(['kalite']);
    // Adresten kişi seçilmez: sorgu TMI'ye geçmez.
    await cevapla(istemci, { yontem: 'GET', yol: '/cagri-ekiplerim', sorgu: new URLSearchParams('kisiId=9'), govde: undefined });
    expect(yollar[1]).toBe('/bildirimler/cagri-yonlendirme/benim');
  });
});
