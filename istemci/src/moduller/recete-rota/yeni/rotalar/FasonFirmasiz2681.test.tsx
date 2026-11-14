import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { fasonaCevir, fasonMu, istasyonYaz, kaydetGovdesi, rotaFarki, rotaSorunlari, yeniAdim, type Adim, type Operasyon } from './kurallar.ts';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

// 2681 (2682 a): fason adım firma seçilmeden kaydedilir; firma sonra seçilir; emir firmasız da açılır (2874). Veri uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* depo kapalı */ } });

const op = { id: '21', code: 'TOR', name: 'Tornalama', stationId: '31', setup: 30, cycle: 5 } as unknown as Operasyon;
const adim = (ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op, 'a'), seq: 10, opNo: 10, ...ek });

describe('2681 firmasız fason kuralları', () => {
  it('dış üretime firmasız geçilir; kaynak { tur: fason, id: null } gider; istasyon seçilince içeri döner', () => {
    const f = fasonaCevir(adim(), null, op, true);
    expect([fasonMu(f), f.fason, f.fasonId, f.stationId, f.machineId]).toEqual([true, true, null, null, null]);
    expect(kaydetGovdesi([f], [10], () => op)[0]).toMatchObject({ kaynak: { tur: 'fason', id: null }, ayarSuresiDk: null });
    const firmali = fasonaCevir(f, '7', op, true);
    expect(kaydetGovdesi([firmali], [10], () => op)[0]).toMatchObject({ kaynak: { tur: 'fason', id: 7 } });
    const ic = istasyonYaz(f, '32');
    expect([fasonMu(ic), ic.fason, ic.stationId]).toEqual([false, false, '32']);
    const geri = fasonaCevir(f, null, op);
    expect([fasonMu(geri), geri.stationId]).toEqual([false, '31']);
  });

  it('sorunlar listesi firmasız fasonu yazar; fark üretim yerini ve firma seçimini ayrı yazar', () => {
    const f = fasonaCevir(adim(), null, op, true);
    expect(rotaSorunlari([f], () => true, () => 'Tornalama').map((x) => x.metin).join()).toContain('fason firma seçilmedi');
    expect(rotaSorunlari([fasonaCevir(f, '7', op, true)], () => true, () => 'Tornalama').map((x) => x.metin).join()).not.toContain('fason firma');
    const ad = { op: () => 'Tornalama', istasyon: (id: string | null) => id ?? 'yok', malzeme: (id: string) => id };
    expect(rotaFarki([adim()], [f], ad).join()).toContain('üretim yeri iç üretim → dış üretim');
    expect(rotaFarki([f], [fasonaCevir(f, '7', op, true)], ad).join()).toContain('fason firma seçildi');
  });
});

const panelAc = async (ek: Parameters<typeof adimOrnegi>[0]) => {
  sunucuKur(YONETICI, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1, [adimOrnegi(ek)])])),
  });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenleme panelini aç: OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('2681 düzenleme paneli', () => {
  it('kayıtlı firmasız fason adım dış üretimde açılır, uyarı yazılır', async () => {
    const panel = await panelAc({ stationId: null, fason: true, fasonId: null });
    await waitFor(() => expect(within(panel).getByText(/Fason firma seçilmedi\. Rota böyle kaydedilir/)).toBeTruthy());
    expect(within(panel).getByRole('button', { name: /Dış üretim/ }).getAttribute('aria-pressed')).toBe('true');
    expect((within(panel).getByRole('combobox', { name: 'Fason firma' }) as HTMLSelectElement).value).toBe('');
  });

  it('fason firma yokken de dış üretim seçilir ve taslağa yazılır (yalnız ekran durumu değil)', async () => {
    const panel = await panelAc({});
    const dis = await within(panel).findByRole('button', { name: /Dış üretim/ });
    expect((dis as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(dis);
    await waitFor(() => expect(within(panel).getByText(/Fason firma seçilmedi\. Rota böyle kaydedilir/)).toBeTruthy());
    expect(within(panel).getByText(/Fason işaretli firma yok/)).toBeTruthy();
    expect(dis.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(panel).getByRole('button', { name: /İç üretim/ }));
    await waitFor(() => expect(within(panel).queryByText(/Fason firma seçilmedi/)).toBeNull());
  });
});
