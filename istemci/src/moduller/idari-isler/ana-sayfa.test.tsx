import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { BugunCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevap: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return yol === '/idari-isler/bugun' ? cevap() : json(404, { kod: 'YOK', mesaj: yol });
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
const bugun = (sayilar: Partial<BugunCevabi['sayilar']>): BugunCevabi => ({
  isler: [],
  sayilar: { acikTalep: 0, acilTalep: 0, bugunAcilan: 0, bugunKapanan: 0, gecenKontrol: 0, yakinKontrol: 0, aracUyarisi: 0, ...sayilar },
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('İdari İşler pano kartları', () => {
  it('üç kart Bugün ucunu bir kez okur; talep acili, kontrol geçen ve yakını ayrı yazar', async () => {
    const yollar = sunucuKur(() => json(200, bugun({ acikTalep: 5, acilTalep: 2, gecenKontrol: 1, yakinKontrol: 3, aracUyarisi: 1 })));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Açık tesis talebi').textContent).toContain('5'));
    expect(kart('Açık tesis talebi').textContent).toContain('2 acil');
    expect(kart('Periyodik kontrol').textContent).toContain('4');
    expect(kart('Periyodik kontrol').textContent).toContain('1 süresi geçmiş, 3 yedi gün içinde');
    expect(kart('Araç uyarısı').getAttribute('data-ton')).toBe('uyari');
    expect(kart('Açık tesis talebi').getAttribute('href')).toBe('/idari-isler/talepler');
    expect(kart('Periyodik kontrol').getAttribute('href')).toBe('/idari-isler/periyodik');
    expect(kart('Araç uyarısı').getAttribute('href')).toBe('/idari-isler/filo');
    expect(yollar).toEqual(['/idari-isler/bugun']);
  });

  it('sıfırda uyarı tonu yok; uç reddederse "Alınamadı"', async () => {
    sunucuKur(() => json(200, bugun({})));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Açık tesis talebi').textContent).toContain('Acil talep yok'));
    expect(kart('Periyodik kontrol').getAttribute('data-ton')).toBeNull();
    cleanup();
    sunucuKur(() => json(403, { kod: 'YETKI', mesaj: 'x' }));
    panoyuAc();
    await vi.waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(3));
  });

  it('kartlar Bugün ucunun yetkisiyle görünür; yalnız talep açan görmez', () => {
    const gorunen = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((k) => k.anahtar);
    expect(gorunen(['idari-isler.oku'])).toEqual(['idari-isler-acik-talep', 'idari-isler-kontrol', 'idari-isler-arac']);
    expect(gorunen(['sayfa.idari-isler', 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac'])).toEqual([]);
  });
});
