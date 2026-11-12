import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { IRSALIYE_SINIRI, irsaliyePdfi, kucukOlcu, sayfaReddi, sayfaYerlesimi } from './irsaliye-pdf.ts';
import { IrsaliyeSecici, type IrsaliyeSayfasi } from './IrsaliyeBelgesi.tsx';

afterEach(cleanup);

describe('3063 irsaliye sayfaları', () => {
  it('yalnız fotoğraf ya da PDF kabul edilir; büyük dosya ve 20. sayfadan sonrası reddedilir', () => {
    expect(sayfaReddi({ type: 'image/jpeg', size: 10, name: 'a.jpg' }, 0)).toBeNull();
    expect(sayfaReddi({ type: '', size: 10, name: 'IRS.PDF' }, 0)).toBeNull();
    expect(sayfaReddi({ type: 'text/plain', size: 10, name: 'a.txt' }, 0)).toMatch(/fotoğraf ya da PDF/);
    expect(sayfaReddi({ type: 'image/png', size: IRSALIYE_SINIRI.dosyaBayt + 1, name: 'a.png' }, 0)).toMatch(/30 MB/);
    expect(sayfaReddi({ type: 'image/png', size: 10, name: 'a.png' }, IRSALIYE_SINIRI.sayfa)).toMatch(/20 sayfa/);
  });

  it('fotoğraf en uzun kenarda küçülür, küçük fotoğraf büyütülmez; yatay fotoğraf yatay A4 sayfaya ortalanır', () => {
    expect(kucukOlcu(4000, 3000)).toEqual({ en: 2000, boy: 1500 });
    expect(kucukOlcu(800, 600)).toEqual({ en: 800, boy: 600 });
    const dikey = sayfaYerlesimi(1500, 2000);
    expect(dikey.sayfa[0]).toBeLessThan(dikey.sayfa[1]);
    const yatay = sayfaYerlesimi(2000, 1000);
    expect(yatay.sayfa[0]).toBeGreaterThan(yatay.sayfa[1]);
    expect(yatay.g).toBeCloseTo(yatay.sayfa[0]);
    expect(yatay.y).toBeCloseTo((yatay.sayfa[1] - yatay.h) / 2);
  });

  it('seçilen PDF sayfaları sırasıyla tek PDF olur; bozuk PDF adıyla reddedilir', async () => {
    // jsdom'un File'ında arrayBuffer yok; tarayıcıdaki gibi davranan küçük karşılık.
    const dosya = (veri: Uint8Array, name: string): File => ({ name, type: 'application/pdf', size: veri.byteLength, arrayBuffer: async () => veri.slice().buffer }) as unknown as File;
    const pdf = async (n: number): Promise<File> => {
      const d = await PDFDocument.create();
      for (let i = 0; i < n; i++) d.addPage([100 + i, 200]);
      return dosya(await d.save(), `s${n}.pdf`);
    };
    const cikti = await PDFDocument.load(await irsaliyePdfi([await pdf(2), await pdf(1)]));
    expect(cikti.getPages().map((s) => Math.round(s.getWidth()))).toEqual([100, 101, 100]);
    expect(cikti.getTitle()).toBe('İrsaliye');
    await expect(irsaliyePdfi([dosya(new TextEncoder().encode('bozuk'), 'orn.pdf')])).rejects.toThrow(/orn\.pdf okunamadı/);
    await expect(irsaliyePdfi([])).rejects.toThrow();
  });

  it('seçici sayfayı sıraya alır, tek tek çıkarır; desteklenmeyen dosyada uyarı verir', () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:orn', revokeObjectURL: () => undefined }));
    function Kap() {
      const [s, set] = useState<IrsaliyeSayfasi[]>([]);
      return <IrsaliyeSecici sayfalar={s} degistir={set} />;
    }
    render(<Kap />);
    expect(screen.getByRole('button', { name: /Fotoğraf çek/ })).toBeTruthy();
    const girdi = screen.getByLabelText('Dosya seç');
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['y'], 'b.pdf', { type: 'application/pdf' })] } });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: "Sayfa 1'i çıkar" }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(girdi, { target: { files: [new File(['z'], 'c.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert').textContent).toMatch(/fotoğraf ya da PDF/);
    vi.unstubAllGlobals();
  });
});
