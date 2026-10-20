import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Pencere } from './index.ts';

// Tam ekran pencere (borç 119, atölye isteği 7.1): başlık satırının yerine modülün araç çubuğu durur; pencerenin adı
// başlıktan gelir. Esc kapat'ı çağırır: kaydedilmemiş değişiklikte önce onay sormak kapat'ın işidir.
function Duzenleyici({ degisti }: { degisti: boolean }) {
  const [acik, acikYaz] = useState(true);
  const [onay, onayYaz] = useState(false);
  const kapat = () => (degisti ? onayYaz(true) : acikYaz(false));
  return (
    <>
      <Pencere acik={acik} kapat={kapat} baslik="Yerleşimi düzenle" tur="tam" ust={<div role="toolbar" aria-label="Araçlar"><button type="button">Ekle</button></div>}>
        <p>tuval</p>
      </Pencere>
      {onay && <p>Değişiklikler kaydedilmedi</p>}
    </>
  );
}

describe('Pencere tur="tam"', () => {
  it('başlık satırı yerine araç çubuğunu çizer; pencerenin adı başlıktır, başlık ve kendi Kapat düğmesi yoktur', () => {
    render(<Duzenleyici degisti={false} />);
    const pencere = screen.getByRole('dialog', { name: 'Yerleşimi düzenle' });
    expect(pencere.classList.contains('tc-pencere-tam')).toBe(true);
    expect(within(pencere).getByRole('toolbar', { name: 'Araçlar' })).toBeTruthy();
    expect(within(pencere).queryByRole('heading')).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Kapat' })).toBeNull();
    expect(within(pencere).getByText('tuval')).toBeTruthy();
    expect(document.activeElement).toBe(within(pencere).getByRole('button', { name: 'Ekle' }));
  });

  it('Esc kapat\'ı çağırır: değişiklik yoksa kapanır, varsa pencere açık kalır ve onay sorulur', () => {
    const { unmount } = render(<Duzenleyici degisti={false} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    render(<Duzenleyici degisti />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeTruthy();
    expect(screen.getByText('Değişiklikler kaydedilmedi')).toBeTruthy();
  });

  it('araç çubuğu verilmezse tam ekran pencere de başlık ve Kapat düğmesiyle çizilir', () => {
    render(<Pencere acik kapat={() => undefined} baslik="Kroki" tur="tam">içerik</Pencere>);
    const pencere = screen.getByRole('dialog', { name: 'Kroki' });
    expect(within(pencere).getByRole('heading', { name: 'Kroki' })).toBeTruthy();
    expect(within(pencere).getByRole('button', { name: 'Kapat' })).toBeTruthy();
  });
});
