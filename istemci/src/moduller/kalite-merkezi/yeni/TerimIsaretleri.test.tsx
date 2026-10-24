import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { TERIM_SINIFI, TerimIsaretleri, isaretle } from './TerimIsaretleri.tsx';

afterEach(cleanup);

const isaretler = (el: Element) => [...el.querySelectorAll(`.${TERIM_SINIFI}`)].map((s) => s.textContent);

describe('terim işaretleri', () => {
  it('başlıkta terimin ilk geçişini işaretler; düğme içini ve kelime içini atlar', () => {
    const kok = document.createElement('div');
    kok.className = 'tc-km';
    kok.innerHTML = '<h2>AQL planı ve AQL</h2><h3>REVİZYON</h3><button><h3>AQL</h3></button><p>AQL</p>';
    isaretle(kok, []);
    expect(isaretler(kok)).toEqual(['AQL']);
    expect(kok.querySelector('h2')?.textContent).toBe('AQL planı ve AQL');
    isaretle(kok, []);
    expect(isaretler(kok)).toEqual(['AQL']);
  });

  function Deneme() {
    const [metin, metinYaz] = useState('AQL planı');
    const [tek, tekYaz] = useState('Re sayısı');
    return (
      <div className="tc-km">
        <h2>{metin} <i>ek</i></h2>
        <h3>{tek}</h3>
        <button type="button" onClick={() => { metinYaz('Ac ve Re'); tekYaz('Yeni AQL'); }}>değiştir</button>
        <TerimIsaretleri kapali={false} />
      </div>
    );
  }

  it('React metni değiştirince metin bozulmaz ve yeniden işaretlenir', async () => {
    const { container } = render(<Deneme />);
    const h2 = container.querySelector('h2')!;
    const h3 = container.querySelector('h3')!;
    await waitFor(() => expect(isaretler(h2)).toEqual(['AQL']));
    expect(isaretler(h3)).toEqual(['Re']);
    fireEvent.click(screen.getByRole('button', { name: 'değiştir' }));
    await waitFor(() => expect(isaretler(h2)).toEqual(['Ac']));
    expect(h2.textContent).toBe('Ac ve Re ek');
    await waitFor(() => expect(isaretler(h3)).toEqual(['AQL']));
    expect(h3.textContent).toBe('Yeni AQL');
  });

  it('odaklanınca açıklama çıkar; kapalıyken ve kaldırılınca işaret kalmaz', async () => {
    const { container, rerender, unmount } = render(<div className="tc-km"><h2>AQL</h2><TerimIsaretleri kapali={false} /></div>);
    const isaret = await waitFor(() => container.querySelector<HTMLElement>(`.${TERIM_SINIFI}`)!);
    act(() => { isaret.focus(); });
    expect((await screen.findByRole('tooltip')).textContent).toMatch(/^AQLKabul edilebilir kalite seviyesi/);
    rerender(<div className="tc-km"><h2>AQL</h2><TerimIsaretleri kapali /></div>);
    expect(isaretler(container)).toEqual([]);
    expect(container.querySelector('h2')?.textContent).toBe('AQL');
    unmount();
  });
});
