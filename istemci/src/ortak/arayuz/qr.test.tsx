import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Qr } from './Qr.tsx';
import { QR_SESSIZ_PAY, qrKareleri, qrSvgMetni } from './qr.ts';

describe('ortak QR', () => {
  it('kareler sessiz paydan sonra başlar; görünüm kutusu iki yanda sessiz payı taşır', () => {
    const { modul, yol } = qrKareleri('LOT-0001');
    expect(modul).toBeGreaterThanOrEqual(21);
    const koseler = [...yol.matchAll(/M(\d+) (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(koseler.length).toBeGreaterThan(0);
    expect(Math.min(...koseler.map(([x]) => x!))).toBe(QR_SESSIZ_PAY);
    expect(Math.max(...koseler.map(([, y]) => y!))).toBe(QR_SESSIZ_PAY + modul - 1);
  });

  it('aynı metin aynı çizimi, farklı metin farklı çizimi verir', () => {
    expect(qrKareleri('A-1').yol).toBe(qrKareleri('A-1').yol);
    expect(qrKareleri('A-1').yol).not.toBe(qrKareleri('A-2').yol);
  });

  it('bileşen metni ekran okuyucuya verir ve verilen boyutta çizer', () => {
    render(<Qr metin="EMIR-7" boyut={120} />);
    const svg = screen.getByRole('img', { name: 'QR: EMIR-7' });
    expect(svg.getAttribute('width')).toBe('120');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${qrKareleri('EMIR-7').modul + 2 * QR_SESSIZ_PAY} ${qrKareleri('EMIR-7').modul + 2 * QR_SESSIZ_PAY}`);
  });

  it('baskı metni bağımsız SVG belgesidir; etiket metni kaçırılır', () => {
    const m = qrSvgMetni('a"<b>&');
    expect(m.startsWith('<svg ')).toBe(true);
    expect(m).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(m).toContain('aria-label="QR: a&quot;&lt;b&gt;&amp;"');
    expect(m).not.toContain('<b>');
  });
});
