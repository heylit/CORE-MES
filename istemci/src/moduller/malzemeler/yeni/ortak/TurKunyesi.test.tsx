import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TurKunyesi, TurluKod } from './TurKunyesi.tsx';

afterEach(cleanup);

const metin = (c: HTMLElement) => c.querySelector('.tc-tk-metin');

describe('TurluKod', () => {
  test('kod tek metin kalır; baştaki tür öneki boyanır, ayrı tür etiketi çizilmez', () => {
    const { container } = render(<TurluKod kod="HM-ORN-00001" tur="hammadde" kisa="HM" ad="Hammadde" />);
    expect(screen.getByText('HM-ORN-00001')).toBeTruthy();
    expect(metin(container)?.getAttribute('data-onek')).toBe('0');
    expect(metin(container)?.getAttribute('data-kisa')).toBe('HM');
    expect(container.querySelector('.tc-tk-kod > .tc-tk-tur')).toBeNull();
    expect(container.querySelector('.tc-tk-kod')?.getAttribute('title')).toBe('Hammadde');
  });

  test('firma önekli kodda tür öneki kendi yerinde boyanır', () => {
    const { container } = render(<TurluKod kod="ORN-YM-00012" tur="yarimamul" kisa="YM" ad="Yarı mamul" />);
    expect(metin(container)?.getAttribute('data-onek')).toBe('4');
  });

  test('önek kodda yoksa (Logo kodu) tür kodu kodun önüne ayrı konur, kod değişmez', () => {
    const { container } = render(<TurluKod kod="ORN-LG-1040" tur="hammadde" kisa="HM" ad="Hammadde" />);
    expect(metin(container)?.hasAttribute('data-onek')).toBe(false);
    expect(container.querySelector('.tc-tk-kod > .tc-tk-tur')?.textContent).toBe('HM');
    expect(screen.getByText('ORN-LG-1040')).toBeTruthy();
  });

  test('kodun içinde geçen tür harfleri önek sayılmaz', () => {
    const { container } = render(<TurluKod kod="ORN-HMX-0001" tur="hammadde" kisa="HM" ad="Hammadde" />);
    expect(metin(container)?.hasAttribute('data-onek')).toBe(false);
  });
});

describe('TurKunyesi', () => {
  test('tam adla tür ve kategori yazılır; kısa kodla tam ad ekran okuyucuya gider', () => {
    render(<TurKunyesi tur="sarf" kisa="SF" ad="Sarf malzemesi" kategori="ORN Kategori" tamAd />);
    expect(screen.getByText('Sarf malzemesi')).toBeTruthy();
    expect(screen.getByText('ORN Kategori')).toBeTruthy();
    cleanup();
    const { container } = render(<TurKunyesi tur="mamul" kisa="MM" ad="Mamul" />);
    expect(container.querySelector('.tc-gizli-etiket')?.textContent).toBe('Mamul');
    expect(container.querySelector('.tc-tk-kat')).toBeNull();
  });
});
