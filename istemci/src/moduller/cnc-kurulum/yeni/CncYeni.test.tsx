import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ILETISI, YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { state } from './depo.ts';

// Kişi adları uydurmadır. Testler görünüm içeriğine bakmaz (parçalar doldurur); yalnız kabuğu, adresi ve şeridi sınar.
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz', YENI_EKRAN_ISLEMI] };
const KULLANICI: Kullanici = { id: 2, ad: 'Deneme Kullanici', islemler: ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'] };
const OKUMASIZ: Kullanici = { id: 3, ad: 'Deneme Okumasiz', islemler: [YENI_EKRAN_ISLEMI] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(
  kullanici: Kullanici, kayitlar: KayitlarCevabi['kayitlar'] = [],
  yetki: Pick<BenCevabi, 'yazabilir' | 'hazirlikOnaylayabilir'> = { yazabilir: true, hazirlikOnaylayabilir: false },
): string[] {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/cnc-kurulum/ben') return json(200, {
      kisi: { id: kullanici.id, ad: kullanici.ad }, takimDegistirebilir: false, stokDusebilir: false, stokKartiBaglayabilir: false, emirGorebilir: true, ...yetki,
    } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/cnc-kurulum/kayitlar') return json(200, { kayitlar } satisfies KayitlarCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function Adres() { return <output data-testid="adres">{useLocation().pathname}</output>; }

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
      <Adres />
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CncYeni', () => {
  it('kök adres Ana Sayfa görünümüne düşer; görünüm şeridi prototipin sırasıyla gelir, kayıt duruma kurulur', async () => {
    sunucuKur(YONETICI, [{ anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: { machine: 't2' }, surum: 4 }]);
    ac('/cnc-kurulum/yeni');
    expect(await screen.findByRole('tab', { name: 'Ana Sayfa', selected: true }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/cnc-kurulum/yeni/ana-sayfa');
    expect(screen.getAllByRole('tab').map((s) => s.textContent)).toEqual(
      ['Ana Sayfa', 'Kurulum', 'Hazırlık', 'Kütüphane', 'Ham Malzeme', 'Oto-CAM', 'G-Kod Sim.', 'Takım Ömrü'],
    );
    expect(screen.getByRole('button', { name: /Tanımlar/ })).toBeTruthy();
    expect(state.machine).toBe('t2');
  }, 20000);

  it('şeritten görünüm değişir, adres prototipin adıdır; bakmak sunucuya yazmaz', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/cnc-kurulum/yeni/ana-sayfa');
    fireEvent.click(await screen.findByRole('tab', { name: 'Takım Ömrü' }, { timeout: 10000 }));
    expect(await screen.findByRole('tab', { name: 'Takım Ömrü', selected: true })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/cnc-kurulum/yeni/takim-omru');
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('Tanımlar penceresi açılır ve kapanır', async () => {
    sunucuKur(YONETICI);
    ac('/cnc-kurulum/yeni/kurulum');
    fireEvent.click(await screen.findByRole('button', { name: /Tanımlar/ }, { timeout: 10000 }));
    expect(await screen.findByRole('dialog', { name: 'Tanımlar' })).toBeTruthy();
  }, 20000);

  it('yalnız hazırlık onayı olan kişi Hazırlık görünümünde açılır, öteki görünümler ve Tanımlar yoktur', async () => {
    sunucuKur(YONETICI, [], { yazabilir: false, hazirlikOnaylayabilir: true });
    ac('/cnc-kurulum/yeni/kurulum');
    expect(await screen.findByRole('tab', { name: 'Hazırlık', selected: true }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/cnc-kurulum/yeni/hazirlik');
    expect(screen.getAllByRole('tab').map((s) => s.textContent)).toEqual(['Hazırlık']);
    expect(screen.queryByRole('button', { name: /Tanımlar/ })).toBeNull();
  }, 20000);

  it('menünün kökü yönlenmeden Ana Sayfa görünümünü açar; görünüme geçince ekran yeniden kurulmaz', async () => {
    const istekler = sunucuKur(KULLANICI);
    ac('/cnc-kurulum');
    expect(await screen.findByRole('tab', { name: 'Ana Sayfa', selected: true }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/cnc-kurulum');
    fireEvent.click(screen.getByRole('tab', { name: 'Takım Ömrü' }));
    expect(await screen.findByRole('tab', { name: 'Takım Ömrü', selected: true }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/cnc-kurulum/yeni/takim-omru');
    expect(istekler.filter((i) => i === 'GET /cnc-kurulum/ben')).toHaveLength(1);
  }, 20000);

  it('yeni ekran kapısı istemez: sayfa yetkisi olan yönetici olmayan kişide de açılır (1272 a)', async () => {
    const istekler = sunucuKur(KULLANICI);
    ac('/cnc-kurulum/yeni/ana-sayfa');
    expect(await screen.findByRole('tab', { name: 'Ana Sayfa', selected: true }, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(YENI_EKRAN_ILETISI)).toBeNull();
    expect(istekler.some((i) => i.includes('/cnc-kurulum/'))).toBe(true);
  }, 20000);

  it('okuma işlemi olmayan kişide yetki iletisi gösterir', async () => {
    sunucuKur(OKUMASIZ);
    ac('/cnc-kurulum/yeni/ana-sayfa');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);
});
