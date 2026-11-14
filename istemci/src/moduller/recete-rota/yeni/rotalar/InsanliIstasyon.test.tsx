import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

// 2685: insanlı istasyonda rota adımının adayları yetkin kişilerdir; makine seçimi çıkmaz (2482 kapasite-insan.md madde 2). Veri uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* depo kapalı */ } });

const istasyon = (kapasiteKaynagi: string | null) => () => json(200, {
  istasyonlar: [{ id: 31, surum: 4, kod: 'TZ1', ad: 'Torna 1', isMerkeziId: 41, tip: 'talasli', kapasiteKaynagi, aktif: true }],
});
const panelAc = async (kapasiteKaynagi: string | null, makine: string | null = null) => {
  sunucuKur(YONETICI, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1, [adimOrnegi({ machineId: makine })])])),
    yazmalar: { 'GET /istasyonlar': istasyon(kapasiteKaynagi) },
  });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  // 2558 b/5: sayfa görüntüleme kipinde açılır; düzenleme kipine geçilir.
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenleme panelini aç: OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('2685 insanlı istasyonda makine seçimi', () => {
  it('insanlı istasyonda makine seçicisi yok, nedeni yazılı; makine kullanımı kişi kullanımı olur', async () => {
    const panel = await panelAc('insan');
    await waitFor(() => expect(within(panel).getByText(/İnsanlı istasyon: iş, istasyonda yetkin/)).toBeTruthy());
    expect(within(panel).queryByRole('combobox', { name: 'Makine' })).toBeNull();
    expect(within(panel).getByRole('combobox', { name: 'Kişi kullanımı' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Makine seçimini kaldır' })).toBeNull();
  });

  it('2698 c: insanlı istasyonda başlık İstasyon; akış tablosunda da makine seçicisi yok', async () => {
    const panel = await panelAc('insan');
    const bilgi = await within(panel).findByText(/İnsanlı istasyon: iş, istasyonda yetkin/);
    const alan = bilgi.closest('.tc-rr1-alan');
    expect(alan?.querySelector('.tc-rr1-lbl')?.textContent).toBe('İstasyon');
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Akış tablosu' }));
    await within(bolge).findByText('İnsanlı istasyon: makine seçilmez.');
    expect(within(bolge).queryByRole('combobox', { name: 'Makine' })).toBeNull();
  });

  it('eskiden makine seçilmiş insanlı adımda seçim kaldırılabilir', async () => {
    const panel = await panelAc('insan', '51');
    const kaldir = await within(panel).findByRole('button', { name: 'Makine seçimini kaldır' });
    expect(within(panel).getByText(/eskiden seçilmiş bir makine var/)).toBeTruthy();
    fireEvent.click(kaldir);
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Makine seçimini kaldır' })).toBeNull());
  });

  it('makineli ya da kapasite kaynağı boş istasyonda makine seçicisi kalır (boş planda makine sayılır)', async () => {
    for (const k of ['makine', null]) {
      const panel = await panelAc(k);
      await within(panel).findByRole('combobox', { name: 'Makine' });
      expect(within(panel).queryByText(/İnsanlı istasyon/)).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
