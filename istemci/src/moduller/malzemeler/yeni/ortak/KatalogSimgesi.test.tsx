import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ICON, TUR_ICON } from '../sabitler/index.ts';
import { KatalogSimgesi, svgParcalari } from './KatalogSimgesi.tsx';

afterEach(cleanup);

describe('KatalogSimgesi', () => {
  test('prototipin simge parçasını şekil öğesi olarak çizer', () => {
    const { container } = render(<KatalogSimgesi yol={ICON.cubuk as string} etiket="Çubuk" />);
    expect(container.querySelector('svg[role="img"][aria-label="Çubuk"] circle')?.getAttribute('r')).toBe('10');
  });

  test('her tür simgesi en az bir öğeye çevrilir', () => {
    for (const yol of Object.values(TUR_ICON as Record<string, string>)) expect(svgParcalari(yol).length).toBeGreaterThan(0);
  });

  test('izinsiz öğe, olay niteliği ve sabit renk düşer', () => {
    const { container } = render(<KatalogSimgesi yol={'<script>x()</script><path d="M0 0" onclick="x()" fill="#f00"/><a href="#"><circle r="1"/></a>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    const yol = container.querySelector('path');
    expect(yol?.getAttribute('onclick')).toBeNull();
    expect(yol?.getAttribute('fill')).toBeNull();
  });

  test('boş yol hiçbir şey çizmez', () => {
    const { container } = render(<KatalogSimgesi yol={null} />);
    expect(container.innerHTML).toBe('');
  });
});
