import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { ArkonRolu } from '#paylasilan/sozlesme/arkon.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { ArkonCercevesi, UretimTerminali, arkonGirisSayfasi, operatorTerminaleGirer } from './ArkonCercevesi.tsx';

// TMI menüsünden Arkon MES'e giriş: açılan ekran Arkon rolündendir (sunucu rolü kişinin rolünden çözer); operatör operatör
// ekranından, Pano'yu gören öteki roller Pano'dan girer.
describe('Arkon MES girişi', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Pano maddesini gören rol Pano\'dan, görmeyen operatör ekranından girer', () => {
    expect(arkonGirisSayfasi('admin', ['sayfa.arkon', 'arkon.yonetici'])).toBe('pano');
    expect(arkonGirisSayfasi('lead', ['sayfa.arkon', 'arkon.amir'])).toBe('pano');
    expect(arkonGirisSayfasi('operator', ['sayfa.arkon', 'arkon.operator'])).toBe('operator');
  });

  // Kullanıcı kararı (soru 38/49 A): operatöre ek verilen planlama işlemi açılan ekranı değiştirmez.
  it('ek Arkon işlemi taşıyan operatör yine operatör ekranından girer', () => {
    expect(arkonGirisSayfasi('operator', ['sayfa.arkon', 'arkon.operator', 'arkon.planlama'])).toBe('operator');
    expect(operatorTerminaleGirer('operator', ['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.operator', 'arkon.yonetici'])).toBe(true);
  });

  function ac(islemler: Islem[], baslangic: string, rol: ArkonRolu = islemler.includes('arkon.yonetici') ? 'admin' : 'operator') {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol, isMerkezleri: [], aktif: true } }))));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={[baslangic]}>
            <Routes>
              <Route path="/arkon" element={<ArkonCercevesi />} />
              <Route path="/arkon/:sayfa" element={<ArkonCercevesi />} />
              <Route path="/uretim-terminali" element={<UretimTerminali />} />
            </Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    return { ekran, adres: () => adres };
  }

  it('/arkon yöneticide adresi değiştirmeden Pano\'yu açar', async () => {
    const { ekran, adres } = ac(['sayfa.arkon', 'arkon.yonetici'], '/arkon');
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(adres()).toBe('/arkon');
    expect(cerceve.getAttribute('src')).toMatch(/#pano$/);
  });

  it('/arkon operatörde, /arkon/operator herkeste Arkon\'un operatör ekranını açar', async () => {
    const op = ac(['sayfa.arkon', 'arkon.operator'], '/arkon');
    const c1 = await waitFor(() => { const c = op.ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(op.adres()).toBe('/arkon');
    expect(c1.getAttribute('src')).toMatch(/#$/);
    cleanup();
    const yon = ac(['sayfa.arkon', 'arkon.yonetici'], '/arkon/operator');
    const c2 = await waitFor(() => { const c = yon.ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    expect(yon.adres()).toBe('/arkon/operator');
    expect(c2.getAttribute('src')).toMatch(/#$/);
  });

  it('Arkon rolü operatör olan Üretim Terminali\'ne girer; yönetim rolleri ve terminal sayfası olmayan girmez', () => {
    expect(operatorTerminaleGirer('operator', ['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.operator'])).toBe(true);
    expect(operatorTerminaleGirer('admin', ['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.operator', 'arkon.yonetici'])).toBe(false);
    expect(operatorTerminaleGirer('lead', ['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.amir'])).toBe(false);
    expect(operatorTerminaleGirer('operator', ['sayfa.arkon', 'arkon.operator'])).toBe(false);
  });

  it('/arkon operatörü Üretim Terminali\'ne götürür, yöneticiyi Pano\'da tutar', async () => {
    const op = ac(['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.operator'], '/arkon');
    await waitFor(() => { expect(op.adres()).toBe('/uretim-terminali'); });
    const t = await waitFor(() => { const e = op.ekran.container.querySelector('iframe'); if (!e) throw new Error('çerçeve yok'); return e; });
    expect(t.getAttribute('src')).toMatch(/#$/);
    cleanup();
    const yon = ac(['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.yonetici'], '/arkon');
    const c = await waitFor(() => { const e = yon.ekran.container.querySelector('iframe'); if (!e) throw new Error('çerçeve yok'); return e; });
    expect(yon.adres()).toBe('/arkon');
    expect(c.getAttribute('src')).toMatch(/#pano$/);
  });

  it('Üretim Terminali Pano\'yu gören rolde de operatör ekranını açar', async () => {
    const yon = ac(['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.yonetici'], '/uretim-terminali');
    const c = await waitFor(() => { const e = yon.ekran.container.querySelector('iframe'); if (!e) throw new Error('çerçeve yok'); return e; });
    expect(yon.adres()).toBe('/uretim-terminali');
    expect(c.getAttribute('src')).toMatch(/#$/);
  });
});
