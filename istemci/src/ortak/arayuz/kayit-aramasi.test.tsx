import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [{ maddeler: [{ anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'ornek.oku' }] }],
};

// Yalnız stok sayfası arama ucu bildirmiş gibi: gerçek modüllerin uçları bu testi etkilemesin.
const SAYFALAR_ARAMALI = SAYFALAR.map((s) => {
  const { aramaUcu: _uc, ...kalan } = s as Sayfa & { aramaUcu?: string };
  return s.yol === '/stok' ? { ...kalan, aramaUcu: '/stok/ara' } : kalan;
}) as readonly Sayfa[];

function Adres() {
  const { pathname, search } = useLocation();
  return <output data-testid="adres">{pathname}{search}</output>;
}

function sunucu(govde: (adres: string) => unknown) {
  const cagri = vi.fn(async (adres: string) => new Response(JSON.stringify(govde(adres)), { status: 200 }));
  vi.stubGlobal('fetch', cagri);
  return cagri;
}

function ciz(sayfalar: readonly Sayfa[] = SAYFALAR_ARAMALI) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Kabuk sayfalar={sayfalar} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[MENU]}>
        <Adres />
      </Kabuk>
    </MemoryRouter>,
  );
}

const ust = () => within(screen.getByRole('banner'));
const yaz = (metin: string) => {
  const kutu = ust().getByRole('combobox');
  fireEvent.focus(kutu);
  fireEvent.change(kutu, { target: { value: metin } });
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Genel aramada kayıtlar', () => {
  it('sayfası görülen modülün arama ucuna sorulur; kayıt modül adıyla çıkar ve tıklanınca adresine gidilir', async () => {
    const cagri = sunucu(() => ({ sonuclar: [{ anahtar: '7', baslik: 'MIL-01 Mil', aciklama: 'Mamul', yol: '/stok/kart/7' }] }));
    ciz();
    expect(ust().getByRole('combobox', { name: 'Sayfa ya da kayıt ara' })).toBeTruthy();
    yaz('mil');
    const kayit = await screen.findByRole('option', { name: /MIL-01 Mil/ });
    expect(kayit.textContent).toContain('Mamul');
    expect(kayit.textContent).toContain('Stok');
    expect(cagri).toHaveBeenCalledTimes(1);
    expect(cagri.mock.calls[0]![0]).toBe('/api/stok/ara?q=mil');
    fireEvent.click(kayit);
    expect(screen.getByTestId('adres').textContent).toBe('/stok/kart/7');
  });

  it('sayfayı görmeyen ama arama işlemi olan kişi (operatör) o sayfanın arama ucunu kullanır; sayfa listede çıkmaz', async () => {
    const cagri = sunucu(() => ({ sonuclar: [{ anahtar: '5', baslik: 'UE-0005', aciklama: 'P-1 Flanş · Planlı', yol: '/uretim-terminali?emir=5' }] }));
    render(
      <MemoryRouter initialEntries={['/']}>
        <Kabuk sayfalar={[]} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['uretim-emirleri.ara-istasyon']} ikinciMenuler={[]}>
          <Adres />
        </Kabuk>
      </MemoryRouter>,
    );
    expect(ust().getByRole('combobox', { name: 'Sayfa ya da kayıt ara' })).toBeTruthy();
    yaz('üretim');
    const kayit = await screen.findByRole('option', { name: /UE-0005/ });
    expect(kayit.textContent).toContain('Üretim Emirleri');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/uretim-emirleri/ara?q=%C3%BCretim']);
    fireEvent.click(kayit);
    expect(screen.getByTestId('adres').textContent).toBe('/uretim-terminali?emir=5');
  });

  it('reddedilen: arama işlemi olsa da sayfası kapalı modüle sorulmaz', async () => {
    const cagri = sunucu(() => ({ sonuclar: [] }));
    render(
      <MemoryRouter initialEntries={['/']}>
        <Kabuk sayfalar={[]} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['uretim-emirleri.ara-istasyon']} ikinciMenuler={[]} kapali={['/uretim-emirleri']}>
          <Adres />
        </Kabuk>
      </MemoryRouter>,
    );
    expect(ust().getByRole('combobox', { name: 'Sayfa ya da menü ara' })).toBeTruthy();
    yaz('emir');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(cagri).not.toHaveBeenCalled();
  });

  it('reddedilen: sayfayı görmeyen kişi için uca sorulmaz; tek harf sunucuya gitmez', async () => {
    const cagri = sunucu(() => ({ sonuclar: [] }));
    ciz(SAYFALAR_ARAMALI.filter((s) => s.yol !== '/stok'));
    expect(ust().getByRole('combobox', { name: 'Sayfa ya da menü ara' })).toBeTruthy();
    yaz('mil');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(cagri).not.toHaveBeenCalled();
    expect(screen.getByText('Sonuç yok')).toBeTruthy();
    cleanup();
    ciz();
    yaz('m');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(cagri).not.toHaveBeenCalled();
  });

  it('reddedilen: uygulama dışına giden kayıt listelenmez; uç hata verirse sayfa sonuçları kalır', async () => {
    sunucu(() => ({ sonuclar: [{ anahtar: '1', baslik: 'Kötü', aciklama: null, yol: '//dis.example/x' }] }));
    ciz();
    yaz('kötü');
    expect(await screen.findByText('Sonuç yok')).toBeTruthy();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    yaz('stok');
    expect(await screen.findByRole('option', { name: /Stok/ })).toBeTruthy();
    expect(screen.queryByText('Kötü')).toBeNull();
  });
});
