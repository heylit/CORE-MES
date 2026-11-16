import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3320-2 a: adım paneli katlanır bölümlerle; seyrek değişen üç bölüm kapalı gelir, başlığında tek satır özet. Veriler uydurmadır (ORN-).
const kisi = { id: 1, ad: 'Deneme 1' };
const sartname = {
  id: 7, kod: 'ORN-SRT', ad: 'Deneme şartname', kategoriId: 1, kapsam: 'ic', kaynak: 'varsayilan', musteriFirma: null, musteriBelgeNo: null,
  aktif: true, surum: 1, yururlukteSurumNo: 1, taslakSurumNo: null, kullanim: 0,
};
const surumu = {
  id: 21, surumNo: 1, durum: 'yururlukte', istenenBelgeler: [], terminalNotu: null, degisiklikNotu: null, acan: kisi, acilma: '2026-10-28T08:00:00.000Z',
  yayinlayan: kisi, yayin: '2026-10-28T09:00:00.000Z', atiflar: [], parametreler: [],
};
const kur = () => {
  const d = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] })])]);
  sunucuKur(YONETICI, {
    durum: { ...d, items: [...(d.items ?? []), { id: '14', kayitNo: 14, code: 'ORN-YM-0101', name: 'Deneme YM', type: 'yari', unit: 'adet', cost: null, stock: null, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }] },
    yazmalar: {
      'GET /rota/revizyonlar/72/sartnameler': () => json(200, { adimlar: [{ opNo: 10, sartnameler: [{ sira: 1, sartname, degerler: {}, yururlukte: surumu, eksikler: [], kapsamUyumsuz: false }] }] }),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, { surumler: [], taslak: null }),
    },
  });
};
const adimPaneli = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const dugme = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (dugme) fireEvent.click(dugme);
  fireEvent.click((await within(bolge).findAllByRole('button', { name: 'OP 10 Tornalama' }))[0]!);
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};
const bolum = (panel: HTMLElement, ad: RegExp) => within(panel).getByRole('button', { name: ad });

describe('3320-2 a adım paneli katlanır bölümler', () => {
  it('iş sırasıyla beş bölüm; seyrek değişen üçü kapalı ve özetli, gizli alanı erişilemez; şartname varsa rozet', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const adlar = within(panel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(adlar).toEqual(['Operasyon ve yer', 'Malzeme', 'Akış ve dal', 'Planlama ayarları', 'Belgeler']);
    expect(bolum(panel, /^Operasyon ve yer/).getAttribute('aria-expanded')).toBe('true');
    expect(bolum(panel, /^Malzeme/).getAttribute('aria-expanded')).toBe('true');
    for (const ad of [/^Akış ve dal/, /^Planlama ayarları/, /^Belgeler/]) expect(bolum(panel, ad).getAttribute('aria-expanded')).toBe('false');
    expect(bolum(panel, /^Planlama ayarları/).textContent).toMatch(/Fire %0 · tek makine · alternatif yok/);
    expect(within(panel).queryByRole('combobox', { name: 'Makine kullanımı' })).toBeNull();
    await waitFor(() => { expect(bolum(panel, /^Belgeler/).textContent).toMatch(/1 şartname.*Şartname 1 · aparat/); });
    expect(within(panel).getByText('Fire %')).toBeTruthy();
    expect(within(panel).getByLabelText('Hazırlık / parti')).toBeTruthy();
  });

  it('açılan bölüm sonraki açılışta açık gelir; kapatılan kapalı', async () => {
    kur();
    rrAc('/recete-rota/schema');
    let panel = await adimPaneli();
    fireEvent.click(bolum(panel, /^Planlama ayarları/));
    expect(within(panel).getByRole('combobox', { name: 'Makine kullanımı' })).toBeTruthy();
    fireEvent.click(bolum(panel, /^Operasyon ve yer/));
    expect(within(panel).queryByRole('combobox', { name: 'Operasyon' })).toBeNull();
    cleanup();
    kur();
    rrAc('/recete-rota/schema');
    panel = await adimPaneli();
    expect(bolum(panel, /^Planlama ayarları/).getAttribute('aria-expanded')).toBe('true');
    expect(bolum(panel, /^Operasyon ve yer/).getAttribute('aria-expanded')).toBe('false');
    expect(bolum(panel, /^Operasyon ve yer/).textContent).toMatch(/İç üretim/);
  });

  it('başlıktaki çıktı şeridi Malzeme bölümünü açar ve çıktı alanına götürür; seçici tek yerde', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    fireEvent.click(bolum(panel, /^Malzeme/));
    expect(within(panel).queryByRole('textbox', { name: 'Çıktı malzemesi' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: /^Adımın çıktısı: .*Malzeme bölümündeki çıktı alanına git/ }));
    expect(bolum(panel, /^Malzeme/).getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => { expect(document.activeElement).toBe(within(panel).getByLabelText('Çıktı malzemesi')); });
    expect(within(panel).getAllByRole('textbox', { name: 'Çıktı malzemesi' })).toHaveLength(1);
  });
});
