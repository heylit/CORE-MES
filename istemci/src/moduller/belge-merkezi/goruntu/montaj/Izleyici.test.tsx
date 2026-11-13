import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import SahneIzleyici from './Izleyici.tsx';

// WebGL testte yoktur: oynatıcı yerine etkin adımı ve oynama hâlini yazan benzeri.
vi.mock('./Sahne3B.tsx', () => ({
  default: ({ aktifSira, oynuyor, bicim }: { aktifSira: number; oynuyor: boolean; bicim: string }) => <p>{`sahne ${String(aktifSira)} ${oynuyor ? 'oynuyor' : 'durdu'} ${bicim}`}</p>,
}));
afterEach(cleanup);

// Uydurma veri: üç talimat adımı, 2. adımda iki parça +X'ten girer.
const hareket = { parcalar: [1, 2], yon: '+X' as const, mesafeMm: 80, sureSn: 1.6, sirali: true, kamera: null };
const SAHNE: SahneAdimi[] = [{ sira: 2, hareket }];
const ADIMLAR = [{ sira: 1, baslik: 'Tabanı koy' }, { sira: 2, baslik: 'Pimleri tak' }, { sira: 3, baslik: 'Kapağı vidala' }];
const STEP = new TextEncoder().encode('ISO-10303-21;');

describe('terminal 3B montaj izleyici (3209 a)', () => {
  it('ilk yapılmamış adımda açılır ve oynar; Önceki/Sonraki adım değiştirir, uçlarda kapalıdır', async () => {
    render(<SahneIzleyici sahne={SAHNE} veri={STEP} adimlar={ADIMLAR} ilkSira={2} />);
    expect(await screen.findByText('sahne 2 oynuyor step')).toBeTruthy();
    expect(screen.getByText('Adım 2 / 3')).toBeTruthy();
    expect(screen.getByText('2 parça · +X yönünden girer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Durdur' }));
    expect(screen.getByText('sahne 2 durdu step')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(screen.getByText('sahne 3 oynuyor step')).toBeTruthy();
    expect(screen.getByText('Bu adımda parça hareketi yok.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sonraki' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }));
    expect(screen.getByText('sahne 1 oynuyor step')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Önceki' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('talimatta olmayan başlangıç adımı ilk adıma düşer', async () => {
    render(<SahneIzleyici sahne={SAHNE} veri={STEP} adimlar={ADIMLAR} ilkSira={9} />);
    expect(await screen.findByText('sahne 1 oynuyor step')).toBeTruthy();
  });
});
