import { describe, expect, it } from 'vitest';
import type { OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { ornekOzet, ozetAdet, ozetGrafikUstu, ozetGunEtiketi, ozetSure } from '../../../../arkon/web/src/data/ozetim.ts';
import type { OperatorOzeti } from '../../../../arkon/web/src/data/ozetim.ts';
import { cevapla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

describe('Operatör Özetim (kart #1295)', () => {
  it('gösterim: veri yoksa tire, sıfır uydurulmaz; süre saat ve dakika', () => {
    expect(ozetAdet(null)).toBe('–');
    expect(ozetAdet(0)).toBe('0');
    expect(ozetAdet(1414)).toBe('1.414');
    expect(ozetSure(null)).toBe('–');
    expect(ozetSure(19200)).toBe('5 sa 20 dk');
    expect(ozetSure(1500)).toBe('25 dk');
    expect(ozetGunEtiketi('2026-10-14', '2026-10-14')).toBe('Bugün');
    expect(ozetGunEtiketi('2026-10-12', '2026-10-14')).toBe('Pzt');
  });

  it('grafik üst sınırı: en büyük sağlam + hurda 10\'a yuvarlanır; plan adedi sınırı etkilemez; kayıt yoksa boş', () => {
    expect(ozetGrafikUstu([{ tarih: '2026-10-14', saglam: null, hurda: null, beklenen: null }])).toBeNull();
    expect(ozetGrafikUstu([{ tarih: '2026-10-13', saglam: 214, hurda: 3, beklenen: 900 }, { tarih: '2026-10-14', saglam: 331, hurda: 0, beklenen: null }])).toBe(340);
  });

  it('gösterim kipi örneği yedi gün döner; ekip ortalaması yalnız bugün', () => {
    expect(ornekOzet('gun', '2026-10-14').gunler.map((g) => g.tarih)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(ornekOzet('hafta', '2026-10-14').ekipOrtalamasi).toBeNull();
  });

  it('köprü: Arkon /operator-ozeti isteği dönem ve kişiyle TMI ucuna gider; başka sorgu taşınmaz, yazma eşlenmez', async () => {
    const cevap = {
      kisi: { id: 3, ad: 'Deneme Kişi' }, donem: 'hafta', baslangic: '2026-10-12', bitis: '2026-10-14', hesaplama: '2026-10-14T07:00:00.000Z',
      saglam: 120, hurda: null, kalite: 1, calismaSn: 7200, saatlikSaglam: 60, basari: null, ekipOrtalamasi: null, verim: null, isler: [], hurdaNedenleri: [], yetkiler: { istasyonlar: [], makineler: [] }, mesailer: null, fazlaMesai: null, izinler: null, emekVerimi: { oran: null, standartSn: 0, mesaiSn: null },
      gunler: [{ tarih: '2026-10-14', saglam: 120, hurda: null, beklenen: null }], rozetler: [], ekip: [],
    } satisfies OperatorOzetiCevabi;
    const yollar: string[] = [];
    const istemci = { get: async <T,>(yol: string) => { yollar.push(yol); return cevap as T; }, post: async () => { throw new Error('yazma yok'); } } as unknown as Istemci;
    const c = await cevapla(istemci, { yontem: 'GET', yol: '/operator-ozeti', sorgu: new URLSearchParams('donem=hafta&kisiId=3&c=c1'), govde: undefined });
    expect(c.durum).toBe(200);
    expect(c.govde).toEqual(cevap);
    const ekran: OperatorOzeti = c.govde as OperatorOzeti;
    expect(ekran.kisi.ad).toBe('Deneme Kişi');
    await cevapla(istemci, { yontem: 'GET', yol: '/operator-ozeti', sorgu: new URLSearchParams('c=c1'), govde: undefined });
    expect(yollar).toEqual(['/arkon/operator-ozeti?donem=hafta&kisiId=3', '/arkon/operator-ozeti']);
    expect((await cevapla(istemci, { yontem: 'POST', yol: '/operator-ozeti', sorgu: new URLSearchParams(''), govde: '{}' })).durum).toBe(404);
  });
});
