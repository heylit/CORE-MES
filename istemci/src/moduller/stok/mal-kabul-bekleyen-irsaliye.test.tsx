import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import type { KonumlarCevabi, MalKabulCevabi, MalKabullerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { depoAyarla, type BekleyenIrsaliye, type IrsaliyeDeposu } from './irsaliye-kuyrugu.ts';
import type * as PdfModulu from './irsaliye-pdf.ts';
import { DEPOCU, ac, json, sunucuKur, type Istek } from './test-ortak.tsx';

// 3063 dilim 2: mal kabul formunda cihazda bekleyen irsaliye. Fotoğrafın PDF'e çevrilmesi tuval ister (jsdom'da yok): yerine hazır PDF.
let ornekPdf: Uint8Array;
vi.mock('./irsaliye-pdf.ts', async (asil) => ({ ...(await asil<typeof PdfModulu>()), irsaliyePdfi: async () => ornekPdf }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function bellek(): IrsaliyeDeposu & { m: Map<string, BekleyenIrsaliye> } {
  const m = new Map<string, BekleyenIrsaliye>();
  return { m, hepsi: async () => [...m.values()], yaz: async (k) => { m.set(k.id, k); }, sil: async (id) => { m.delete(id); } };
}
let d: ReturnType<typeof bellek>;
beforeEach(async () => {
  const p = await PDFDocument.create(); p.addPage([100, 200]); p.addPage([100, 200]); ornekPdf = await p.save();
  d = bellek(); depoAyarla(d);
});

const BELGE = { belge: { id: 5, no: 'MK-000005' }, hareketIdler: [] } as unknown as MalKabulCevabi;

function kur(irsaliyeEkle: () => Response): Istek[] {
  const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  return sunucuKur(DEPOCU, {
    'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
    'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
    'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] }),
    'GET /stok/mal-kabul-taslagi': () => json(200, { taslak: null }),
    'POST /stok/mal-kabul-taslagi/kaydet': () => json(200, { surum: 1, guncellendi: '2026-11-12T09:45:00+03:00' }),
    'POST /stok/mal-kabul': () => json(200, BELGE),
    'POST /dosyalar/eksikler': () => json(200, { eksikler: [] }),
    'POST /stok/mal-kabuller/5/irsaliye-ekle': irsaliyeEkle,
  });
}
const form = async () => (await screen.findByRole('button', { name: 'Teslim al' })).closest('form')!;

describe('Mal kabulde cihazda bekleyen irsaliye (3063 dilim 2)', () => {
  it('irsaliye bağlantı yüzünden yüklenemezse mal kabule bağlı olarak cihazda bekler; uyarı yerine bekliyor bilgisi çıkar', async () => {
    kur(() => { throw new TypeError('Failed to fetch'); });
    ac('/stok/mal-kabul');
    const secici = await screen.findByLabelText('Dosya seç');
    fireEvent.change(secici, { target: { files: [new File(['x'], 'irsaliye.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(screen.getByLabelText('İrsaliye no'), { target: { value: 'ORN-IRS-30' } });
    fireEvent.submit(await form());
    expect(await screen.findByText(/İrsaliye bu cihazda bekliyor; bağlantı gelince MK-000005 numaralı mal kabule eklenecek/, undefined, { timeout: 9000 })).toBeTruthy();
    expect(screen.queryByText(/İrsaliye belgesi eklenemedi/)).toBeNull();
    const [k] = [...d.m.values()];
    expect(k).toMatchObject({ kisiId: DEPOCU.id, malKabul: { id: 5, no: 'MK-000005' }, irsaliyeNo: 'ORN-IRS-30', sayfa: 2, hata: null });
  }, 15000);

  it('sunucu irsaliyeyi reddederse cihazda beklemez, bugünkü uyarı çıkar', async () => {
    kur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }));
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [new File(['x'], 'irsaliye.pdf', { type: 'application/pdf' })] } });
    fireEvent.submit(await form());
    expect(await screen.findByText(/İrsaliye belgesi eklenemedi/, undefined, { timeout: 5000 })).toBeTruthy();
    expect(d.m.size).toBe(0);
  });

  it('kapıda saklanan irsaliye "Bu mal kabule ekle" ile forma girer, irsaliye no dolar; teslimle gidince cihazdan silinir', async () => {
    await d.yaz({
      id: 'b1', kisiId: DEPOCU.id, zaman: '2026-11-12T05:00:00.000Z', irsaliyeNo: 'ORN-IRS-21', sayfa: 2, pdf: new Blob(['x'], { type: 'application/pdf' }),
      malKabul: null, istekKimligi: '00000000-0000-4000-8000-0000000000b1', hata: null,
    });
    await d.yaz({
      id: 'b2', kisiId: 99, zaman: '2026-11-12T05:00:00.000Z', irsaliyeNo: 'ORN-IRS-99', sayfa: 1, pdf: new Blob(['x'], { type: 'application/pdf' }),
      malKabul: null, istekKimligi: '00000000-0000-4000-8000-0000000000b2', hata: null,
    });
    const istekler = kur(() => json(200, { belgeler: [{ id: 3, ad: 'İrsaliye ORN-IRS-21 (MK-000005)' }] }));
    ac('/stok/mal-kabul');
    const liste = await screen.findByRole('region', { name: 'Bu cihazda bekleyen irsaliyeler' });
    expect(liste.textContent).toContain('İrsaliye ORN-IRS-21 · 2 sayfa');
    expect(liste.textContent).not.toContain('ORN-IRS-99');
    fireEvent.click(screen.getByRole('button', { name: 'Bu mal kabule ekle' }));
    await waitFor(() => expect((screen.getByLabelText('İrsaliye no') as HTMLInputElement).value).toBe('ORN-IRS-21'));
    expect(screen.getByText('Forma eklendi')).toBeTruthy();
    expect(screen.getAllByRole('listitem', { name: undefined }).some((li) => li.textContent?.includes('PDF'))).toBe(true);
    fireEvent.submit(await form());
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabuller/5/irsaliye-ekle')).toBe(true));
    await waitFor(() => expect([...d.m.keys()]).toEqual(['b2']));
  }, 10000);

  it('"Bu cihazda sakla" sayfaları irsaliye no ile bağsız saklar ve alanı boşaltır', async () => {
    kur(() => json(200, { belgeler: [] }));
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [new File(['x'], 'irsaliye.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(screen.getByLabelText('İrsaliye no'), { target: { value: 'ORN-IRS-40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bu cihazda sakla' }));
    const liste = await screen.findByRole('region', { name: 'Bu cihazda bekleyen irsaliyeler' });
    expect(liste.textContent).toContain('İrsaliye ORN-IRS-40 · 2 sayfa');
    expect([...d.m.values()][0]).toMatchObject({ malKabul: null, irsaliyeNo: 'ORN-IRS-40' });
    expect(screen.queryByRole('button', { name: 'Bu cihazda sakla' })).toBeNull();
  });
});
