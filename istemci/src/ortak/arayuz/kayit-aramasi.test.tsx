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

const BOS_GENEL = { sonuclar: [], eksik: [] };

// Çekirdeğin tek ucu (`/api/arama`) ayrı cevap verir; verilmezse boştur.
function sunucu(govde: (adres: string) => unknown, genel: unknown = BOS_GENEL) {
  const cagri = vi.fn(async (adres: string) => new Response(JSON.stringify(adres.startsWith('/api/arama?') ? genel : govde(adres)), { status: 200 }));
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
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/arama?q=mil', '/api/stok/ara?q=mil']);
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
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/arama?q=%C3%BCretim', '/api/uretim-emirleri/ara?q=%C3%BCretim']);
    fireEvent.click(kayit);
    expect(screen.getByTestId('adres').textContent).toBe('/uretim-terminali?emir=5');
  });

  it('reddedilen: arama işlemi olsa da sayfası kapalı modülün eski ucuna sorulmaz; yalnız çekirdeğe sorulur', async () => {
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
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/arama?q=emir']);
  });

  it('reddedilen: sayfayı görmeyen kişi için eski uca sorulmaz (çekirdek kişinin işlemlerine göre süzer); tek harf sunucuya gitmez', async () => {
    const cagri = sunucu(() => ({ sonuclar: [] }));
    ciz(SAYFALAR_ARAMALI.filter((s) => s.yol !== '/stok'));
    expect(ust().getByRole('combobox', { name: 'Sayfa ya da menü ara' })).toBeTruthy();
    yaz('mil');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/arama?q=mil']);
    expect(screen.getByText('Sonuç yok')).toBeTruthy();
    cleanup();
    ciz();
    yaz('m');
    await new Promise((r) => { setTimeout(r, 400); });
    expect(cagri).toHaveBeenCalledTimes(1);
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

  it('çekirdeğin sonucu tür adıyla çıkar ve önde durur; aynı adrese giden eski sonuç yinelenmez', async () => {
    const yol = '/stok/kart/7';
    sunucu(
      () => ({ sonuclar: [{ anahtar: '7', baslik: 'MIL-01', aciklama: null, yol }, { anahtar: '8', baslik: 'MIL-02', aciklama: null, yol: '/stok/kart/8' }] }),
      { sonuclar: [{ tur: 'parti', anahtar: 'parti#3', baslik: 'MIL-01', aciklama: 'Parti', yol }], eksik: [] },
    );
    ciz();
    yaz('mil');
    await screen.findByRole('option', { name: /MIL-02/ });
    const kayitlar = screen.getAllByRole('option').filter((o) => /MIL-0/.test(o.textContent ?? ''));
    expect(kayitlar.map((o) => o.textContent)).toEqual([expect.stringContaining('Parti / lot'), expect.stringContaining('MIL-02')]);
  });

  it('önek tek türü seçer: eski uca ve sayfa listesine bakılmaz, süzgeç yazılır, işaret öneksiz metindedir', async () => {
    const cagri = sunucu(() => ({ sonuclar: [] }), { sonuclar: [{ tur: 'emir', anahtar: 'emir#1', baslik: 'UE-0001', aciklama: null, yol: '/uretim-emirleri/1' }], eksik: [] });
    ciz();
    yaz('e:stok');
    expect(screen.getByText('Yalnız Üretim emri')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Stok Merkezi/ })).toBeNull();
    await screen.findByRole('option', { name: /UE-0001/ });
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/arama?q=e%3Astok']);
  });

  it('çekirdek cevap vermezse "Sonuç yok" değil hata yazılır; cevap vermeyen türler adıyla bildirilir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    ciz(SAYFALAR_ARAMALI.filter((s) => s.yol !== '/stok'));
    yaz('qqzz');
    expect(screen.getByText('Kayıtlar aranıyor')).toBeTruthy();
    expect(await screen.findByText('Kayıt araması cevap vermedi')).toBeTruthy();
    expect(screen.queryByText('Sonuç yok')).toBeNull();
    cleanup();
    sunucu(() => ({ sonuclar: [] }), { sonuclar: [], eksik: ['firma', 'ncr'] });
    ciz(SAYFALAR_ARAMALI.filter((s) => s.yol !== '/stok'));
    yaz('qqzz');
    expect(await screen.findByText('Cevap vermeyen: Firma, NCR')).toBeTruthy();
  });
});
