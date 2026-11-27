import { describe, expect, it } from 'vitest';
import { anaSayfaKaynaklari, aylikOlcu, onayBekleyenKalemleri, terminKalemleri, terminSatirlari } from './pano-kaynaklari.tsx';

const ozet = { acikTeklif: 0, yaklasanTermin: 3, gecikenSiparis: 1, aylik: [{ ay: '2026-09', sayi: 20 }, { ay: '2026-10', sayi: 18 }] };

describe('siparisler pano kaynaklari (kart 1585)', () => {
  it('geciken gecikmis, yaklasan bu hafta; sifirlar kalem vermez', () => {
    expect(terminKalemleri(ozet).map((k) => k.aciliyet)).toEqual(['gecikmis', 'hafta']);
    expect(terminKalemleri({ ...ozet, yaklasanTermin: 0, gecikenSiparis: 0 })).toEqual([]);
  });
  it('aylik siparis onceki ayla yonsuz kiyas', () => {
    expect(aylikOlcu(ozet)[0]).toMatchObject({ deger: 18, kiyas: { etiket: '09.26', deger: 20, iyiYon: null }, seri: [20, 18] });
    expect(aylikOlcu({ ...ozet, aylik: [] })).toEqual([]);
  });
});

describe('termin grafigi (kart 1773)', () => {
  it('araliklar dogal sirasiyla adlandirilir', () => {
    const c = { araliklar: [{ aralik: 'gecikmis', sayi: 2 }, { aralik: '0-3', sayi: 0 }, { aralik: '15+', sayi: 5 }] } as const;
    expect(terminSatirlari({ araliklar: [...c.araliklar] }).map((s) => [s.etiket, s.deger])).toEqual([['Gecikmiş', 2], ['0-3 gün', 0], ['15 gün ve sonrası', 5]]);
  });
});

describe('onay bekleyen sipariş (3773 b)', () => {
  const simdi = Date.parse('2026-11-27T10:00:00+03:00');
  const taslak = { id: 9, no: 'SS-2026-0009', firmaId: 7, firmaAd: 'ORN Musteri A', termin: '2026-12-20', olusturma: '2026-11-26T09:00:00+03:00' };
  it('her taslak bekliyor kalemi olur, kaydı açar; gün ve termin yazılır, firma adı yoksa numarası', () => {
    const [k] = onayBekleyenKalemleri([taslak], simdi);
    expect(k).toMatchObject({
      anahtar: 'taslak-9', baslik: 'SS-2026-0009 · ORN Musteri A', aciliyet: 'bekliyor', yol: '/siparisler/9', eylem: 'Aç',
      ayrinti: 'Onay bekleyen sipariş · termin 20.12.2026 · 1 gündür taslak', sonTarih: '2026-12-20T00:00:00+03:00',
    });
    const bugun = onayBekleyenKalemleri([{ ...taslak, firmaAd: null, olusturma: '2026-11-27T08:00:00+03:00' }], simdi)[0]!;
    expect(bugun.baslik).toBe('SS-2026-0009 · Firma 7');
    expect(bugun.ayrinti).toContain('bugün açıldı');
    expect(onayBekleyenKalemleri([], simdi)).toEqual([]);
  });
  it('kaynak yalnız onaylama yetkisinde görünür', () => {
    expect(anaSayfaKaynaklari.find((k) => k.anahtar === 'siparisler-onay-is')).toMatchObject({ tur: 'is', islem: 'siparisler.onayla' });
  });
});
