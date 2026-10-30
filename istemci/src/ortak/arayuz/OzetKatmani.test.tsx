import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { OzetKatmani } from './OzetKatmani.tsx';

afterEach(cleanup);

// 1337 a: özetin ek alanı satırlarla eylemler arasındadır; verilmezse özet eskisi gibi çizilir.
describe('OzetKatmani ek alan', () => {
  const SATIRLAR = [{ etiket: 'Sağlam', deger: '38' }];

  it('ek içerik satırlardan sonra, eylemlerden önce durur; odak yine birincil eylemdedir', () => {
    render(
      <OzetKatmani acik baslik="İş tamamlandı" satirlar={SATIRLAR} birincil={{ metin: 'Sıradaki işe geç', tikla: () => {} }} kapat={() => {}}
        ek={<button type="button">Sonraki istasyona</button>} />,
    );
    const pencere = screen.getByRole('dialog', { name: 'İş tamamlandı' });
    const sira = within(pencere).getAllByRole('button').map((d) => d.textContent);
    expect(sira).toEqual(['Sonraki istasyona', 'Kapat', 'Sıradaki işe geç']);
    expect(pencere.querySelector('.tc-ozet-satirlar + .tc-ozet-ek + .tc-ozet-eylemler')).not.toBeNull();
    expect(document.activeElement).toBe(within(pencere).getByRole('button', { name: 'Sıradaki işe geç' }));
  });

  it('ek verilmezse ek alanı çizilmez', () => {
    render(<OzetKatmani acik baslik="Bitti" satirlar={SATIRLAR} kapat={() => {}} />);
    expect(screen.getByRole('dialog').querySelector('.tc-ozet-ek')).toBeNull();
  });
});
