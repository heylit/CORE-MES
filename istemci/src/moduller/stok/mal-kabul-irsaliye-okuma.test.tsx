import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KonumlarCevabi, MalKabullerCevabi } from '#paylasilan/sozlesme/stok.ts';
import type * as PdfModulu from './irsaliye-pdf.ts';
import type { OkunanBilgiler } from './irsaliye-okuma.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3063 dilim 3: fotoğraftan ya da seçilen PDF'ten okunan bilgiler formda yalnız öneri olarak görünür. Okuma cihazdadır (çalışan, jsdom'da yok): sonucu sahte.
// Gerçekteki gibi aynı dosya tek okumadır (form ve seçici aynı sözü bekler).
const okumalar = new Map<File, { soz: Promise<OkunanBilgiler | null>; coz: (s: OkunanBilgiler | null) => void }>();
const bitir = (s: OkunanBilgiler | null) => { for (const o of okumalar.values()) o.coz(s); };
vi.mock('./irsaliye-pdf.ts', async (asil) => ({
  ...(await asil<typeof PdfModulu>()),
  belgeyiOkut: (f: File) => {
    let o = okumalar.get(f);
    if (!o) { let coz: (s: OkunanBilgiler | null) => void = () => undefined; const soz = new Promise<OkunanBilgiler | null>((c) => { coz = c; }); o = { soz, coz }; okumalar.set(f, o); }
    return o.soz;
  },
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); okumalar.clear(); });

function kur(): void {
  const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  sunucuKur(DEPOCU, {
    'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
    'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
    'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] }),
    'GET /stok/mal-kabul-taslagi': () => json(200, { taslak: null }),
    'POST /stok/mal-kabul-taslagi/kaydet': () => json(200, { surum: 1, guncellendi: '2026-11-12T09:45:00+03:00' }),
  });
}

const foto = () => new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
const okunan = (b: Partial<OkunanBilgiler>): OkunanBilgiler => ({ irsaliyeNo: null, siparisNo: null, tarih: null, ...b });
const pdfDosyasi = () => new File(['%PDF'], 'irsaliye.pdf', { type: 'application/pdf' });

describe('Mal kabulde okunan irsaliye bilgileri (3063 dilim 3)', () => {
  it('fotoğraf okunurken sayfada "Okunuyor…" durur; okunan no yalnız "Kullan" ile alana yazılır, sonra "Alanla aynı" olur', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:orn', revokeObjectURL: () => undefined }));
    kur();
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [foto()] } });
    expect(await screen.findByText('Okunuyor…')).toBeTruthy();
    bitir(okunan({ irsaliyeNo: 'ORN-IRS-50', tarih: '12.11.2026' }));
    const kutu = await screen.findByRole('region', { name: 'Okunan bilgiler' });
    expect(screen.queryByText('Okunuyor…')).toBeNull();
    expect(kutu.textContent).toContain('ORN-IRS-50');
    expect(kutu.textContent).toContain('12.11.2026');
    expect(within(kutu).queryByRole('button', { name: 'Siparişlerde ara' })).toBeNull();
    const alan = screen.getByLabelText('İrsaliye no') as HTMLInputElement;
    expect(alan.value).toBe('');
    fireEvent.click(within(kutu).getByRole('button', { name: "İrsaliye no'yu kullan" }));
    expect(alan.value).toBe('ORN-IRS-50');
    expect(within(kutu).getByText('Alanla aynı')).toBeTruthy();
    expect(within(kutu).queryByRole('button', { name: "İrsaliye no'yu kullan" })).toBeNull();
    expect(within(kutu).getByRole('button', { name: 'Tarihi kullan' })).toBeTruthy();
  });

  it('satın alma kabulünde okunan sipariş no "Siparişlerde ara" ile açık sipariş aramasına yazılır; hiçbir şey okunmazsa kutu çıkmaz', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:orn', revokeObjectURL: () => undefined }));
    kur();
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Tür'), { target: { value: 'satin_alma' } });
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [foto()] } });
    await screen.findByText('Okunuyor…');
    bitir(okunan({ siparisNo: 'ORN-SAS-0815' }));
    const kutu = await screen.findByRole('region', { name: 'Okunan bilgiler' });
    fireEvent.click(within(kutu).getByRole('button', { name: 'Siparişlerde ara' }));
    await waitFor(() => expect((screen.getByLabelText('Açık siparişlerde ara') as HTMLInputElement).value).toBe('ORN-SAS-0815'));
    cleanup();
    okumalar.clear();
    kur();
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [foto()] } });
    await screen.findByText('Okunuyor…');
    bitir(null);
    await waitFor(() => expect(screen.queryByText('Okunuyor…')).toBeNull());
    expect(screen.queryByRole('region', { name: 'Okunan bilgiler' })).toBeNull();
    expect(screen.getByText('Fotoğraf okunamadı; irsaliye görüntü olarak eklenir.')).toBeTruthy();
  });

  it('seçilen PDF de okunur; okunamazsa PDF olduğu gibi eklenir notu çıkar', async () => {
    kur();
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [pdfDosyasi()] } });
    await screen.findByText('Okunuyor…');
    bitir(okunan({ irsaliyeNo: 'ORN-IRS-PDF-1' }));
    expect((await screen.findByRole('region', { name: 'Okunan bilgiler' })).textContent).toContain('ORN-IRS-PDF-1');
    cleanup();
    okumalar.clear();
    kur();
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [pdfDosyasi()] } });
    await screen.findByText('Okunuyor…');
    bitir(null);
    expect(await screen.findByText('PDF okunamadı; dosya olduğu gibi eklenir.')).toBeTruthy();
    expect(screen.queryByText('Fotoğraf okunamadı; irsaliye görüntü olarak eklenir.')).toBeNull();
  });

  it('ilk sayfa okunurken ikinci sayfa eklenirse ilk sayfanın sonucu kaybolmaz', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:orn', revokeObjectURL: () => undefined }));
    kur();
    ac('/stok/mal-kabul');
    const ilk = foto();
    fireEvent.change(await screen.findByLabelText('Dosya seç'), { target: { files: [ilk] } });
    await screen.findByText('Okunuyor…');
    fireEvent.change(screen.getByLabelText('Dosya seç'), { target: { files: [pdfDosyasi()] } });
    await waitFor(() => expect(screen.getAllByText('Okunuyor…')).toHaveLength(2));
    okumalar.get(ilk)?.coz(okunan({ irsaliyeNo: 'ORN-IRS-ILK' }));
    expect((await screen.findByRole('region', { name: 'Okunan bilgiler' })).textContent).toContain('ORN-IRS-ILK');
    expect(screen.getAllByText('Okunuyor…')).toHaveLength(1);
  });

  it('okunan tarih "Kullan" ile irsaliye tarihi alanına yazılır; ileri tarihte uyarı çıkar', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:orn', revokeObjectURL: () => undefined }));
    kur();
    ac('/stok/mal-kabul');
    const alan = await screen.findByLabelText('İrsaliye tarihi') as HTMLInputElement;
    expect(alan.value).toBe('');
    fireEvent.change(screen.getByLabelText('Dosya seç'), { target: { files: [foto()] } });
    await screen.findByText('Okunuyor…');
    bitir(okunan({ tarih: '10.11.2026' }));
    const kutu = await screen.findByRole('region', { name: 'Okunan bilgiler' });
    fireEvent.click(within(kutu).getByRole('button', { name: 'Tarihi kullan' }));
    expect(alan.value).toBe('2026-11-10');
    expect(within(kutu).getByText('Alanla aynı')).toBeTruthy();
    expect(screen.queryByText('Tarih bugünden sonra; kontrol edin.')).toBeNull();
    fireEvent.change(alan, { target: { value: '2099-01-01' } });
    expect(screen.getByText('Tarih bugünden sonra; kontrol edin.')).toBeTruthy();
  });
});
