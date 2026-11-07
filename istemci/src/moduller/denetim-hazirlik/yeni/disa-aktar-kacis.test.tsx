import { afterEach, describe, expect, it, vi } from 'vitest';
import { yazdir } from './disa-aktar.ts';
import { htmlUret } from './kys/ortak.tsx';
import { basimHtml } from './kys/dokuman-uretici.tsx';
import { DOCT } from './kys/dokuman-sablonlari.ts';
import { bosProfil } from './normalize.ts';

// Yazdırma alanı innerHTML ile kurulur (değerlendirme 2197 R08). Gelen işaret yalnız htmlUret'ten çıkar: React metni kaçırır,
// ağaçta dangerouslySetInnerHTML yoktur. Kullanıcının yazdığı metin yazdırma alanında etiket olarak ayrıştırılmamalı.
// </textarea> ve </title> düz metin olarak ayrıştırılan öğeden çıkmayı dener.
const X = '"\'></textarea></title><img src=x onerror=alert(1)><script>alert(2)</script>';

function enjeksiyon(kok: ParentNode): string[] {
  const bulgu: string[] = [];
  for (const el of kok.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT') bulgu.push('script');
    if (el.tagName === 'IMG' && el.getAttribute('src') === 'x') bulgu.push('img');
    for (const a of el.attributes) if (a.name.startsWith('on')) bulgu.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  }
  return bulgu;
}

afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll('.tc-dhy-yazdirma-alani').forEach((x) => { x.remove(); }); });

describe('denetim hazırlık yazdırma alanı kötü niyetli metni etiket olarak ayrıştırmaz (2201b)', () => {
  it('htmlUret metni ve öznitelikleri kaçırır', () => {
    const html = htmlUret(<p title={X}>{X}</p>);
    const kok = document.createElement('div');
    kok.innerHTML = html;
    expect(enjeksiyon(kok)).toEqual([]);
    expect(kok.querySelector('p')?.textContent).toBe(X);
    expect(kok.querySelector('p')?.getAttribute('title')).toBe(X);
  });

  it('firma bilgileri kötü niyetli olan dokümanın baskısı', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const profil = bosProfil();
    profil.profile = { firma: X, tesis: X, kapsam: X, kurulus: X, hazirlayan: X };
    const dok = DOCT[0];
    if (!dok) throw new Error('şablon yok');
    yazdir(basimHtml([dok], profil, []), X);
    const alan = document.querySelector('.tc-dhy-yazdirma-alani');
    expect(alan).not.toBeNull();
    expect(enjeksiyon(alan!)).toEqual([]);
    expect(alan!.textContent).toContain(X);
    vi.useRealTimers();
  });
});
