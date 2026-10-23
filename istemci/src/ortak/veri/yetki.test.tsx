import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { Yetkili, useYetki, yetkiKur } from './yetki.ts';

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Yazar', islemler: ['finans.oku', 'finans.yaz'] };
const OKUR: Kullanici = { id: 2, ad: 'Deneme Okur', islemler: ['finans.oku'] };

function oturumKur(kullanici: Kullanici | null, durum = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici } satisfies OturumCevabi), { status: durum })));
}

function ac(icerik: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}>{icerik}</QueryClientProvider>);
}

function Sonda() {
  const yetki = useYetki();
  return <output>{yetki.hazir ? `${yetki.var('finans.yaz')}/${yetki.herhangi('finans.yonet', 'finans.oku')}` : 'bekliyor'}</output>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('yetkiKur', () => {
  it('var tek işlemi, herhangi listeden birini arar', () => {
    const yetki = yetkiKur(['finans.oku']);
    expect(yetki.var('finans.oku')).toBe(true);
    expect(yetki.var('finans.yaz')).toBe(false);
    expect(yetki.herhangi('finans.yaz', 'finans.oku')).toBe(true);
    expect(yetki.herhangi('finans.yaz', 'finans.yonet')).toBe(false);
    expect(yetki.herhangi()).toBe(false);
  });

  it('oturum yoksa hiçbir işlem yoktur', () => {
    expect(yetkiKur(null).var('finans.oku')).toBe(false);
    expect(yetkiKur(undefined).herhangi('finans.oku')).toBe(false);
  });
});

describe('useYetki', () => {
  it('oturum gelene kadar hazır değildir, sonra kişinin işlemlerine bakar', async () => {
    oturumKur(YAZAR);
    ac(<Sonda />);
    expect(screen.getByText('bekliyor')).toBeTruthy();
    expect(await screen.findByText('true/true')).toBeTruthy();
  });

  it('oturum alınamazsa hazırdır ve yetkisizdir', async () => {
    oturumKur(null, 500);
    ac(<Sonda />);
    expect(await screen.findByText('false/false')).toBeTruthy();
  });
});

describe('Yetkili', () => {
  const dugme = (
    <Yetkili islem="finans.yaz" yoksa={<p>Yalnız okuma</p>}>
      <button type="button">Kayıt gir</button>
    </Yetkili>
  );

  it('izinli kişide içeriği gösterir', async () => {
    oturumKur(YAZAR);
    ac(dugme);
    expect(await screen.findByRole('button', { name: 'Kayıt gir' })).toBeTruthy();
    expect(screen.queryByText('Yalnız okuma')).toBeNull();
  });

  it('yetkisiz kişide içeriği gizler, varsa yerine geçeni gösterir', async () => {
    oturumKur(OKUR);
    ac(dugme);
    expect(await screen.findByText('Yalnız okuma')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kayıt gir' })).toBeNull();
  });

  it('dizi verilince işlemlerden biri yeter; yerine geçen yoksa hiçbir şey çizmez', async () => {
    oturumKur(OKUR);
    ac(<>
      <Yetkili islem={['finans.yonet', 'finans.oku']}><p>Okuyabilir</p></Yetkili>
      <Yetkili islem={['finans.yonet', 'finans.yaz']}><p>Yazabilir</p></Yetkili>
    </>);
    expect(await screen.findByText('Okuyabilir')).toBeTruthy();
    expect(screen.queryByText('Yazabilir')).toBeNull();
  });
});
