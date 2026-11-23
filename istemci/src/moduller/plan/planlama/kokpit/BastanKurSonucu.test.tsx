import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BastanKurSonucu } from './BastanKurSonucu.tsx';
import { KilitIhlali } from './KilitIhlali.tsx';
import { kilitIhlaliAyir } from './bastan-kur.ts';

afterEach(cleanup);

// Uydurma örnek (ORN-). Arayüz Y8 ve Y9.
describe('Baştan kur sonucu ve sıra hatası kısayolu (3600)', () => {
  it('Y9: kalıcı satır sonucu yazar, Geri al ve Kapat çalışır; geriAl yoksa (meşgul ya da yetkisiz) düğme görünmez', () => {
    const geriAl = vi.fn(() => true), kapat = vi.fn();
    render(<BastanKurSonucu ileti="Plan baştan kuruldu; 1 kilit kalktı." geriAl={geriAl} kapat={kapat} />);
    expect(screen.getByRole('group', { name: 'Son baştan kur' }).textContent).toContain('Plan baştan kuruldu; 1 kilit kalktı.');
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect(geriAl).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(kapat).toHaveBeenCalledTimes(1);
    cleanup();
    render(<BastanKurSonucu ileti="x" geriAl={null} kapat={kapat} />);
    expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
  });

  it('Y8: hata iletisinden kilitli adım ayrılır; kısayol kapsamı yazar, yetkisizde pasif ve nedeni yazılı, role=alert', () => {
    const ileti = 'Taslakta sıraya aykırı adım var: ORN-UE-0412 OP 20 elle kilitli (24.11 08:00) ve önceki adımı bitmeden başlıyor (sıraya aykırı). Öncül ORN-UE-0412 OP 10 24.11 14:30\'da bitiyor. Kilitli adım öncülden önce başlayamaz. Düzeltmeden canlıya alınmaz.';
    expect(kilitIhlaliAyir(ileti)).toEqual({ emirNo: 'ORN-UE-0412', opNo: 20 });
    expect(kilitIhlaliAyir('Taslakta sıraya aykırı adım var: ORN-UE-0412 OP 20 önceki adımı bitmeden başlıyor (sıraya aykırı); 24.11 08:00\'de başlıyor.')).toBeNull();
    const diz = vi.fn();
    render(<KilitIhlali ileti={ileti} emirNo="ORN-UE-0412" kilitYetkisi diz={diz} kapat={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toContain('ORN-UE-0412 OP 20 elle kilitli');
    const d = screen.getByRole('button', { name: 'Kilidi kaldır ve yeniden diz' }) as HTMLButtonElement;
    expect(d.title).toContain('Yalnız ORN-UE-0412 yeniden dizilir');
    fireEvent.click(d);
    expect(diz).toHaveBeenCalledTimes(1);
    cleanup();
    render(<KilitIhlali ileti={ileti} emirNo="ORN-UE-0412" kilitYetkisi={false} diz={diz} kapat={() => undefined} />);
    expect((screen.getByRole('button', { name: 'Kilidi kaldır ve yeniden diz' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('plan kilitleme yetkisi ister');
  });
});
