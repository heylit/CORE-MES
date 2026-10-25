import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Rozet } from './Rozet.tsx';

afterEach(cleanup);

describe('Rozet', () => {
  it('varsayılan dolu görünümdür; çizgi sınıfı yalnız istenince eklenir', () => {
    render(<><Rozet ton="tamam">Aktif</Rozet><Rozet gorunum="cizgi">Hammadde</Rozet></>);
    expect(screen.getByText('Aktif').className).toBe('tc-rozet tc-rozet-tamam');
    expect(screen.getByText('Hammadde').className).toBe('tc-rozet tc-rozet-bilgi tc-rozet-cizgi');
  });
});
