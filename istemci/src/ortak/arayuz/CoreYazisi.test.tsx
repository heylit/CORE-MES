import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CoreYazisi } from './CoreYazisi.tsx';

describe('CoreYazisi', () => {
  it('dort harfi giris ekranindaki hatlarla cizer; O ayri renk sinifi tasir; adi okunur', () => {
    const { container } = render(<CoreYazisi className="ek" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('tc-core-yazisi ek');
    expect(svg?.getAttribute('aria-label')).toBe('CORE');
    expect(svg?.textContent).toBe('CORE');
    expect(container.querySelectorAll('path')).toHaveLength(4);
    expect(container.querySelectorAll('.tc-core-yazisi-o')).toHaveLength(1);
  });
});
