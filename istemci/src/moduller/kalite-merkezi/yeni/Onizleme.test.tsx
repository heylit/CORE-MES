import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { OnizlemeSaglayici, belgeHtml, useOnizleme } from './Onizleme.tsx';

// "HTML indir" önizleme kutusunun innerHTML'ini okur (değerlendirme 2197 R08). Kutu React ile çizilir: metin kaçırılmış gelir,
// serileştirme de kaçırır. Kullanıcının yazdığı metin indirilen belgede etiket olarak ayrıştırılmamalı.
// </title> başlıktan çıkmayı dener: başlığın içi düz metin olarak ayrıştırıldığından yalnız kapanış etiketi kaçış ister.
const X = '"\'></title><img src=x onerror=alert(1)><script>alert(2)</script>';

function enjeksiyon(kok: ParentNode): string[] {
  const bulgu: string[] = [];
  for (const el of kok.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT') bulgu.push('script');
    if (el.tagName === 'IMG' && el.getAttribute('src') === 'x') bulgu.push('img');
    for (const a of el.attributes) if (a.name.startsWith('on')) bulgu.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  }
  return bulgu;
}

function Ac() {
  const onizle = useOnizleme();
  useEffect(() => { onizle(X, 'belge', <table><tbody><tr><td title={X}>{X}</td></tr></tbody></table>); }, [onizle]);
  return null;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// jsdom'un Blob'unda text() yok; FileReader okur.
const oku = (b: Blob): Promise<string> => new Promise((tamam, hata) => {
  const r = new FileReader();
  r.onload = () => { tamam(String(r.result)); };
  r.onerror = () => { hata(r.error); };
  r.readAsText(b);
});

describe('kalite merkezi önizlemesi kötü niyetli metni etiket olarak ayrıştırmaz (2201c)', () => {
  it('belge başlığı kaçırılır', () => {
    const belge = new DOMParser().parseFromString(belgeHtml(X, ''), 'text/html');
    expect(belge.title).toBe(X);
    expect(enjeksiyon(belge)).toEqual([]);
  });

  it('indirilen HTML belgesinde metin metin olarak kalır', async () => {
    let blob: Blob | null = null;
    const ozgun = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => { blob = b as Blob; return 'blob:deneme'; };
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      render(<OnizlemeSaglayici><Ac /></OnizlemeSaglayici>);
      fireEvent.click(await screen.findByRole('button', { name: /HTML indir/ }));
    } finally {
      URL.createObjectURL = ozgun;
    }
    expect(blob).not.toBeNull();
    const belge = new DOMParser().parseFromString(await oku(blob!), 'text/html');
    expect(enjeksiyon(belge)).toEqual([]);
    expect(belge.querySelector('td')?.textContent).toBe(X);
    expect(belge.querySelector('td')?.getAttribute('title')).toBe(X);
  });
});
