import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LogoRozeti, LogoRozetHucresi } from './LogoRozeti.tsx';

afterEach(cleanup);

describe('LogoRozeti (3344)', () => {
  it('kayıt yoksa listede "—" ve "gönderilmez" açıklaması, başlıkta hiçbir şey', () => {
    const { container } = render(<><LogoRozeti bilgi={null} /><span data-testid="b"><LogoRozeti bilgi={null} baslik /></span></>);
    expect(screen.getByLabelText('Logo\'ya gönderilmez').textContent).toBe('—');
    expect(screen.getByTestId('b').textContent).toBe('');
    expect(container.querySelectorAll('.tc-logo-rozet')).toHaveLength(0);
  });

  it('başlıkta "Logo: " öneki, Logo\'da durumunda kayıt no ipucu; hata "Okunamadı"', () => {
    render(<>
      <LogoRozeti bilgi={{ id: 1, durum: 'sirada', kayitNo: null, neden: null }} baslik />
      <LogoRozeti bilgi={{ id: 2, durum: 'logoda', kayitNo: '77', neden: null }} baslik />
      <LogoRozeti bilgi={{ id: 3, durum: 'durdu', kayitNo: null, neden: 'x' }} hata />
    </>);
    expect(screen.getByText('Logo: Sırada')).toBeTruthy();
    expect(screen.getByTitle('Logo kayıt 77').textContent).toBe('Logo\'da');
    expect(screen.getByText('Okunamadı')).toBeTruthy();
  });

  it('Logo\'da olmayan rozetin ipucu nedendir', () => {
    render(<LogoRozeti bilgi={{ id: 4, durum: 'yeniden-denenecek', kayitNo: null, neden: 'Yardımcıya ulaşılamadı' }} />);
    expect(screen.getByTitle('Yardımcıya ulaşılamadı').textContent).toBe('Yeniden denenecek');
  });

  it('hücre nedeni rozetin altında yazar, hata varken yazmaz', () => {
    render(<LogoRozetHucresi bilgi={{ id: 1, durum: 'kart-bekliyor', kayitNo: null, neden: 'Malzeme kartı Logo\'da yok' }} hata={false} />);
    expect(screen.getByText('Kart bekliyor')).toBeTruthy();
    expect(screen.getByText('Malzeme kartı Logo\'da yok')).toBeTruthy();
    cleanup();
    render(<LogoRozetHucresi bilgi={{ id: 1, durum: 'durdu', kayitNo: null, neden: 'gizli' }} hata />);
    expect(screen.queryByText('gizli')).toBeNull();
  });
});
