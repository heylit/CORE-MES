import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ArkonOzetiCevabi, OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

function sunucuKur(cevap: () => Response, ozetim: () => Response = () => json(403, { kod: 'YETKI_YOK', mesaj: 'x' })): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    yollar.push(adres);
    if (adres.includes('/arkon/operator-ozeti')) return ozetim();
    return adres.endsWith('/arkon/ozet') ? cevap() : json(404, { kod: 'BULUNAMADI', mesaj: 'x' });
  }));
  return yollar;
}
function panoyuAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Arkon rol panosu kartları', () => {
  it('üç kart tek özet isteğiyle dolar; her kart kendi Arkon sayfasına gider', async () => {
    const yollar = sunucuKur(() => json(200, { hazirlikBekleyen: 4, kaliteBekleyen: 2, bakimAcik: 1 } satisfies ArkonOzetiCevabi));
    panoyuAc();
    await screen.findByText('4');
    expect(kart('Kalite bekleyen adım').textContent).toContain('2');
    expect(kart('Bakım işleri').textContent).toContain('1');
    expect(kart('Hazırlık bekleyen iş').getAttribute('href')).toBe('/arkon/hazirlik');
    expect(kart('Kalite bekleyen adım').getAttribute('href')).toBe('/arkon/kalite');
    expect(kart('Bakım işleri').getAttribute('href')).toBe('/arkon/bakim');
    expect(yollar.filter((y) => y.endsWith('/arkon/ozet'))).toHaveLength(1);
  });

  it('işlemi olmayan sayı "Veri yok" der, sıfır uydurmaz; uç hata verirse "Alınamadı"', async () => {
    sunucuKur(() => json(200, { hazirlikBekleyen: 0, kaliteBekleyen: null, bakimAcik: null } satisfies ArkonOzetiCevabi));
    panoyuAc();
    await screen.findByText('0');
    expect(kart('Bakım işleri').textContent).toContain('Veri yok');
    cleanup();
    sunucuKur(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    panoyuAc();
    await screen.findAllByText('Alınamadı');
    for (const b of ['Hazırlık bekleyen iş', 'Kalite bekleyen adım', 'Bakım işleri']) expect((await screen.findByText(b)).closest('.tc-sayi-karti')?.textContent).toContain('Alınamadı');
  });

  it('kart işlemleri rol tablosundaki gibi: bakım işi bana düşen, hazırlık ve kalite özet', () => {
    const k = Object.fromEntries(anaSayfaKartlari.map((x) => [x.anahtar, x]));
    expect(k['arkon-bakim']).toMatchObject({ bolum: 'is', islem: 'arkon.bakim' });
    expect(k['arkon-hazirlik']).toMatchObject({ bolum: 'is', islem: 'arkon.hazirlik' });
    expect(k['arkon-kalite']).toMatchObject({ bolum: 'ozet', islem: 'arkon.kalite' });
    expect(k['arkon-ozetim']).toMatchObject({ bolum: 'is', islem: 'sayfa.uretim-terminali', genis: true });
  });

  it('operatör panosu: terminale geçiş en üstte, bugünkü üretim, mesai, fazla mesai, izin ve istasyonlar; sıfır gizlenmez', async () => {
    const o = {
      kisi: { id: 7, ad: 'Op' }, donem: 'gun', baslangic: '2026-10-15', bitis: '2026-10-15', hesaplama: '2026-10-15T06:00:00.000Z',
      saglam: 0, hurda: 2, kalite: null, calismaSn: 3 * 3600 + 20 * 60, saatlikSaglam: null, basari: null, verim: null,
      emekVerimi: { oran: null, standartSn: 0, mesaiSn: null }, isler: [], hurdaNedenleri: [], ekipOrtalamasi: null, gunler: [], rozetler: [],
      yetkiler: { istasyonlar: [{ id: 1, kod: 'TZG-04', ad: 'Torna' }, { id: 2, kod: 'FRZ-01', ad: 'Freze' }], makineler: [] },
      mesailer: [{ tarih: '2026-10-15', dakika: 480, kapali: null, baslangic: '2026-10-15T05:00:00.000Z', bitis: '2026-10-15T14:00:00.000Z' }],
      fazlaMesai: { aySaat: 6.5, yilSaat: 40, bekleyenSaat: 2, yillikSinirSaat: 270, satirlar: [] },
      izinler: { hakGun: 14, kalanGun: 9, kullanilanGun: 5, bekleyenGun: 0, sonrakiHakTarihi: null, sonrakiHakGun: null, yaklasan: [] },
      ekip: [],
    } satisfies OperatorOzetiCevabi;
    sunucuKur(() => json(200, { hazirlikBekleyen: 0, kaliteBekleyen: 0, bakimAcik: 0 } satisfies ArkonOzetiCevabi), () => json(200, o));
    panoyuAc();
    expect(screen.getByRole('link', { name: /Üretim Terminali'ne geç/ }).getAttribute('href')).toBe('/uretim-terminali');
    expect(await screen.findByText('0 adet')).toBeTruthy();
    expect(kart('Bugün ürettiğim').textContent).toContain('Hurda 2 adet');
    expect(kart('Bugün çalıştığım').textContent).toContain('3 sa 20 dk');
    expect(kart('Bu ay fazla mesai').textContent).toContain('6,5 saat');
    expect(kart('Bu ay fazla mesai').textContent).toContain('Onay bekleyen 2 saat');
    expect(kart('Kalan yıllık izin').textContent).toContain('9 gün');
    expect(kart('Yetkili istasyonlarım').textContent).toContain('TZG-04, FRZ-01');
    expect(kart('Bugünkü mesaim').textContent).toMatch(/\d\d:\d\d – \d\d:\d\d/);
  });

  it('özet alınamazsa terminale geçiş yine çalışır, kartlar "Alınamadı" der', async () => {
    sunucuKur(() => json(200, { hazirlikBekleyen: 0, kaliteBekleyen: 0, bakimAcik: 0 } satisfies ArkonOzetiCevabi));
    panoyuAc();
    expect(screen.getByRole('link', { name: /Üretim Terminali'ne geç/ }).getAttribute('href')).toBe('/uretim-terminali');
    await screen.findAllByText('Alınamadı');
    expect(kart('Kalan yıllık izin').textContent).toContain('Alınamadı');
  });
});
