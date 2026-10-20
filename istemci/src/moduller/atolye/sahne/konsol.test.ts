import { afterEach, describe, expect, it, vi } from 'vitest';
import { setConsoleFunction, warn } from 'three';
import { konsoluSuzgecle, yalnizHassasiyetUyarisi } from './konsol.ts';

const X4122 = '(210,81-129): warning X4122: sum of 0.996094 and -2.98545e-017 cannot be represented accurately in double precision\n'
  + '(209,37-61): warning X4122: sum of 1 and -1.49272e-017 cannot be represented accurately in double precision';

describe('three konsol süzgeci', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('yalnız X4122 uyarısından oluşan günlük tanınır; hata ya da başka satır varsa tanınmaz', () => {
    expect(yalnizHassasiyetUyarisi(X4122)).toBe(true);
    expect(yalnizHassasiyetUyarisi(`${X4122}\n(12,3): error X3004: undeclared identifier 'foo'`)).toBe(false);
    expect(yalnizHassasiyetUyarisi('(4,1): warning X3571: pow(f, e) will not work for negative f')).toBe(false);
    expect(yalnizHassasiyetUyarisi('  \n ')).toBe(false);
  });

  it('X4122 günlüğü susar; öbür three uyarıları konsola gider', () => {
    const uyari = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    konsoluSuzgecle();
    warn('WebGLProgram: Program Info Log:', X4122);
    expect(uyari).not.toHaveBeenCalled();
    warn('WebGLProgram: Program Info Log:', '(4,1): warning X3571: pow(f, e) will not work for negative f');
    warn('Texture: başka bir uyarı');
    expect(uyari).toHaveBeenCalledTimes(2);
    setConsoleFunction(null as unknown as (t: string, m: string) => void);
  });
});
