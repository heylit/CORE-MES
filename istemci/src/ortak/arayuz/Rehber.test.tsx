import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { tanitimGorulduMu } from '../veri/tanitim.ts';
import { Kabuk } from './Kabuk.tsx';

const ISLEMLER = ['sayfa.stok', 'sayfa.ik-islemlerim'];
const sayfalar = SAYFALAR.filter((s) => ISLEMLER.includes(s.islem));

function ciz(yol = '/stok', kisiId?: number) {
  return render(
    <MemoryRouter initialEntries={[yol]}>
      <Kabuk sayfalar={sayfalar} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={ISLEMLER} kisiId={kisiId}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
}

beforeEach(() => { localStorage.clear(); });

// Yardım çubukta düğme değil (516 a): F1 ile ya da Hesap menüsünden açılır.
function yardimiAc() {
  fireEvent.click(screen.getByRole('button', { name: /^Hesap/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Yardım ve rehber' }));
}

describe('Yardim ve tanitim', () => {
  it('Yardim acildigi sayfanin tarifini ustte gosterir; yalniz kisinin sayfalarini listeler', () => {
    ciz('/stok');
    yardimiAc();
    const pencere = within(screen.getByRole('dialog', { name: 'Yardım ve rehber' }));
    expect(pencere.getByRole('heading', { name: 'Bu sayfa: Stok Merkezi' })).toBeTruthy();
    expect(pencere.getByText('İK İşlemlerim')).toBeTruthy();
    expect(pencere.queryByText('Finans ve Muhasebe')).toBeNull();
  });

  it('F1 Yardim\'i acar; arama sonucundan sayfaya gidilir', () => {
    ciz('/stok');
    fireEvent.keyDown(document, { key: 'F1' });
    const pencere = within(screen.getByRole('dialog', { name: 'Yardım ve rehber' }));
    fireEvent.change(pencere.getByRole('searchbox', { name: 'Rehberde ara' }), { target: { value: 'izin' } });
    fireEvent.click(pencere.getByRole('button', { name: 'Sayfaya git' }));
    expect(screen.queryByRole('dialog', { name: 'Yardım ve rehber' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('İK İşlemlerim');
  });

  it('ilk giriste tanitim onerilir; "Simdi degil" bir daha onermez', () => {
    const ilk = ciz('/stok', 7);
    // Davet açıkken içerik altına pay alır (TMI A7); kapanınca pay kalkar.
    expect(screen.getByRole('main').hasAttribute('data-davet')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi değil' }));
    expect(screen.getByRole('main').hasAttribute('data-davet')).toBe(false);
    expect(screen.queryByRole('complementary', { name: 'Tanıtım önerisi' })).toBeNull();
    expect(tanitimGorulduMu(7)).toBe(true);
    ilk.unmount();
    ciz('/stok', 7);
    expect(screen.queryByRole('complementary', { name: 'Tanıtım önerisi' })).toBeNull();
    // Davet yokken içerik alanı eskisi gibidir: pay işareti hiç konmaz.
    expect(screen.getByRole('main').hasAttribute('data-davet')).toBe(false);
  });

  it('tanitim kisinin sayfalarini anlatir ve sonuna kadar ilerler', () => {
    ciz('/stok', 8);
    fireEvent.click(screen.getByRole('button', { name: 'Başla' }));
    let adim = 0;
    while (screen.queryByRole('button', { name: 'Bitti' }) === null && adim < 10) {
      if (screen.queryByRole('heading', { name: 'Sizin sayfalarınız' })) {
        const p = within(screen.getByRole('dialog'));
        expect(p.getByText('Stok Merkezi')).toBeTruthy();
        expect(p.queryByText('Finans ve Muhasebe')).toBeNull();
      }
      fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
      adim += 1;
    }
    fireEvent.click(screen.getByRole('button', { name: 'Bitti' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tanitimGorulduMu(8)).toBe(true);
  });

  it('kitapcik butun sayfalari acik ve yazdirilabilir gosterir', () => {
    ciz('/stok');
    yardimiAc();
    fireEvent.click(screen.getByRole('button', { name: 'Kitapçık' }));
    const kitap = within(screen.getByRole('dialog', { name: 'Kullanım kitapçığı' }));
    expect(kitap.getByRole('heading', { name: 'Stok Merkezi' })).toBeTruthy();
    expect(kitap.getByRole('button', { name: 'Yazdır / PDF' })).toBeTruthy();
  });
});
