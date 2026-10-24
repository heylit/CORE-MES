import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fmtN } from '../bicim.ts';
import { HamFormu } from './HamFormu.tsx';
import { HamSonucu } from './HamSonucu.tsx';
import { STOCK_DEF, sCompute } from '../hesap/ham.ts';

afterEach(cleanup);

const sonuc = (degis: Partial<typeof STOCK_DEF>) =>
  sCompute({ st: { ...STOCK_DEF, mx: 100, my: 50, mz: 20, ...degis }, parca: null, rho: 7.85, fmtN }, 0).res;

function sonucCiz(yazabilir: boolean, eylem = vi.fn()) {
  render(
    <HamSonucu
      r={sonuc({ qty: 4, price: 10, mvol: 40 })} geo={null} otomatikEksen malzeme="C45" model={null}
      govdeler={null} govdeSecili={0} govdeSec={() => undefined} eylem={eylem} yazabilir={yazabilir}
    />,
  );
  return eylem;
}

describe('Ham Malzeme sonuc bolumu', () => {
  it('olcu, agirlik ve parti satirlari prototip metniyle', () => {
    sonucCiz(true);
    expect(screen.getByText('110 × 60 × 30 mm')).toBeTruthy();
    expect(screen.getByText('Parti · 4 adet')).toBeTruthy();
    expect(screen.getByText(/TL\/adet · .* TL toplam/)).toBeTruthy();
  });

  it('izinli: Kurulum kartina aktar gorunur ve eylemi cagirir', () => {
    const eylem = sonucCiz(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kurulum kartına aktar' }));
    expect(eylem).toHaveBeenCalledWith('toSetup');
  });

  it('reddedilen: yazma yetkisi yoksa Kurulum kartina aktar gizli, CSV ve simulasyon kalir', () => {
    sonucCiz(false);
    expect(screen.queryByRole('button', { name: 'Kurulum kartına aktar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'G-Kod simülasyonunda kullan' })).toBeTruthy();
  });

  it('sonuc yoksa yonlendirme notu', () => {
    render(<HamSonucu r={null} geo={null} otomatikEksen malzeme="" model={null} govdeler={null} govdeSecili={0} govdeSec={() => undefined} eylem={() => undefined} yazabilir />);
    expect(screen.getByText(/STEP \/ STL yükleyin/)).toBeTruthy();
  });

  it('boru: delik bulunamazsa uyari', () => {
    render(
      <HamSonucu r={sonuc({ type: 'tube' })} geo={null} otomatikEksen malzeme="C45" model={null} govdeler={null} govdeSecili={0} govdeSec={() => undefined} eylem={() => undefined} yazabilir />,
    );
    expect(screen.getByText(/Parçada boydan boya eksenel delik bulunamadı/)).toBeTruthy();
  });
});

describe('Ham Malzeme formu', () => {
  it('tip degisince ilgili alanlar acilir, alan anahtariyla yazilir', () => {
    const degistir = vi.fn();
    const ciz = (type: 'block' | 'bar' | 'tube') => render(
      <HamFormu
        st={{ ...STOCK_DEF, type }} malzemeler={[]} seciliMalzeme="" varsayilanRho={7.85} modelVar={false} mesaj={null}
        degistir={degistir} malzemeSec={() => undefined} eylem={() => undefined} sonuc={null}
      />,
    );
    ciz('block');
    expect(screen.getByLabelText('Pay X (mm / yüz)')).toBeTruthy();
    expect(screen.queryByLabelText('Pay Y')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Boru' }));
    expect(degistir).toHaveBeenCalledWith('type', 'tube');
    fireEvent.change(screen.getByLabelText('X (mm)'), { target: { value: '120' } });
    expect(degistir).toHaveBeenCalledWith('mx', '120');
    cleanup();
    ciz('tube');
    expect(screen.getByLabelText('İç çap (elle)')).toBeTruthy();
    expect(screen.queryByLabelText('Pay X (mm / yüz)')).toBeNull();
  });
});
