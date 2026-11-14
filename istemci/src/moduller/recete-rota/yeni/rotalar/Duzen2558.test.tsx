import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Üç adımlı doğrusal rota: OP 10 > OP 20 > OP 30.
const ucAdim = () => rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [
  adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [] }),
])]);
const bolumAc = async () => {
  sunucuKur(YONETICI, { durum: () => json(200, ucAdim()) });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await within(bolge).findByRole('button', { name: 'OP 30 Tornalama' });
  // 2558 b/5: sayfa görüntüleme kipinde açılır; yazma yetkisi olan test "Düzenle" ile düzenleme kipine geçer.
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  return bolge;
};
const govde = (bolge: HTMLElement) => bolge.querySelector('.tc-rr1-body') as HTMLElement;
const ic = (bolge: HTMLElement) => bolge.querySelector('.tc-rr1-inner') as HTMLElement;
const kutu = (bolge: HTMLElement, no: number) => within(bolge).getByRole('button', { name: `OP ${String(no)} Tornalama` });

describe('Ürün ve rotalar düzeni: çekmeceler ve odak (2558 b)', () => {
  it('çift tık odaklar: panel açılır, yakınlaşır, öncül ve ardıl az, ötekiler çok solar; Esc çıkarır ve yakınlık geri döner', async () => {
    const bolge = await bolumAc();
    expect(within(bolge).getByText('100%')).toBeTruthy();
    fireEvent.click(kutu(bolge, 20));
    fireEvent.doubleClick(kutu(bolge, 20));
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(true);
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(false);
    expect(kutu(bolge, 20).getAttribute('data-odak-hucre')).toBe('oge');
    expect(kutu(bolge, 10).getAttribute('data-odak-hucre')).toBe('komsu');
    expect(kutu(bolge, 30).getAttribute('data-odak-hucre')).toBe('komsu');
    expect(within(bolge).getByText('Odak: OP 20 Tornalama')).toBeTruthy();
    expect(within(bolge).getByText('125%')).toBeTruthy();
    expect(within(bolge).getByRole('button', { name: 'Odaktan çık' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.keyDown(kutu(bolge, 20), { key: 'Escape' });
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(false);
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(true);
    expect(kutu(bolge, 10).hasAttribute('data-odak-hucre')).toBe(false);
    expect(within(bolge).getByText('100%')).toBeTruthy();
    // Seçim kalır; odak düğmesi yeniden odaklamayı sunar.
    expect(within(bolge).getByRole('button', { name: 'Odakla' })).toBeTruthy();
  });

  it('uzaktaki adım çok solar; Enter seçili kutuyu odaklar, başka adıma dokununca odak biter, panel açık kalır', async () => {
    const bolge = await bolumAc();
    fireEvent.click(kutu(bolge, 10));
    fireEvent.keyDown(kutu(bolge, 10), { key: 'Enter' });
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(true);
    expect(kutu(bolge, 30).getAttribute('data-odak-hucre')).toBe('diger');
    fireEvent.click(kutu(bolge, 30));
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(false);
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(false);
  });

  it('"Odakla" düğmesi yalnız adım seçiliyken görünür; boş alana kaydırmadan dokunmak odaktan çıkarır', async () => {
    if (typeof window.PointerEvent === 'undefined') {
      vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerId = i.pointerId ?? 0; } });
    }
    const bolge = await bolumAc();
    expect(within(bolge).queryByRole('button', { name: 'Odakla' })).toBeNull();
    fireEvent.click(kutu(bolge, 10));
    fireEvent.click(within(bolge).getByRole('button', { name: 'Odakla' }));
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(true);
    const tuval = within(bolge).getByRole('group', { name: /Akış şeması/ });
    fireEvent.pointerDown(tuval, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(tuval, { clientX: 51, clientY: 50, pointerId: 1 });
    expect(ic(bolge).classList.contains('tc-rr1-odakta')).toBe(false);
  });

  it('palet yan çekmecedir: şerit açar, çarpı kapatır; dar kapta biri açılınca öteki kapanır', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    const bolge = await bolumAc();
    const paletDugme = within(bolge).getByRole('button', { name: 'Operasyon paleti' });
    expect(paletDugme.getAttribute('aria-expanded')).toBe('false');
    expect(govde(bolge).classList.contains('tc-rr1-palet-dar')).toBe(true);
    fireEvent.click(within(bolge).getByRole('button', { name: 'Operasyon paletini aç' }));
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    expect(palet.id).toBe('tc-rr1-palet');
    expect(paletDugme.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenleme paneli' }));
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(false);
    expect(within(bolge).queryByRole('complementary', { name: 'Operasyon paleti' })).toBeNull();

    fireEvent.click(within(bolge).getByRole('button', { name: 'Operasyon paletini aç' }));
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(true);
    fireEvent.click(within(bolge).getByRole('button', { name: 'Operasyon paletini kapat' }));
    expect(within(bolge).queryByRole('complementary', { name: 'Operasyon paleti' })).toBeNull();
  });

  it('çöp kutusu yalnız sürükleme sürerken görünür', async () => {
    const bolge = await bolumAc();
    expect(within(bolge).queryByRole('region', { name: 'Adımı silmek için buraya sürükle' })).toBeNull();
    fireEvent.dragStart(kutu(bolge, 20), { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    expect(await within(bolge).findByRole('region', { name: 'Adımı silmek için buraya sürükle' })).toBeTruthy();
    fireEvent.dragEnd(kutu(bolge, 20));
    await waitFor(() => { expect(within(bolge).queryByRole('region', { name: 'Adımı silmek için buraya sürükle' })).toBeNull(); });
  });
});

describe('Ürün ve rotalar düzeni: tek satır, görüntüleme kipi, rozet, sorunlar (2558-2)', () => {
  const ac = async (durum = ucAdim()) => {
    sunucuKur(YONETICI, { durum: () => json(200, durum) });
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await within(bolge).findByRole('button', { name: /^OP 10 / });
    return bolge;
  };

  it('görüntüleme kipinde açılır: ekleme düğmesi ve palet yok; "Düzenle" açar ve kip yazıyla belli olur; tek birincil düğme', async () => {
    const bolge = await ac();
    const ust = bolge.querySelector('.tc-rr1-top') as HTMLElement;
    expect(ust.querySelectorAll('.tc-dugme-birincil')).toHaveLength(1);
    expect(within(ust).getByRole('button', { name: 'Üretim emri oluştur' })).toBeTruthy();
    expect(within(bolge).queryByRole('button', { name: 'Adım ekle' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Operasyon paleti' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'OP 10 sil' })).toBeNull();
    const duzenle = within(bolge).getByRole('button', { name: 'Düzenle' });
    expect(duzenle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(duzenle);
    expect(within(bolge).getByRole('button', { name: 'Düzenlemeyi bitir' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(bolge).getByRole('button', { name: 'Adım ekle' })).toBeTruthy();
    expect(within(bolge).getByRole('button', { name: 'Operasyon paleti' })).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenlemeyi bitir' }));
    expect(within(bolge).queryByRole('button', { name: 'Adım ekle' })).toBeNull();
  });

  it('açık taslak görüntüleme kipinde yazıyla belli olur', async () => {
    const bolge = await ac(rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]));
    expect(within(bolge).getByText('Taslak açık')).toBeTruthy();
  });

  it('ara kart kutuları varsayılan gizli, kutuda "Statülü" rozeti; ⋯ menüsünden açılır', async () => {
    const bolge = await ac();
    expect(bolge.querySelectorAll('.tc-rr1-cip-arahal')).toHaveLength(0);
    expect(within(kutu(bolge, 10)).getByText('Statülü')).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Diğer rota işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ara kartları göster' }));
    expect(bolge.querySelectorAll('.tc-rr1-cip-arahal').length).toBeGreaterThan(0);
  });

  it('"Sorunlar (n)": istasyonsuz ve süresiz adımı sayar; seçilince adım seçilir; sorun yoksa nötr', async () => {
    const bolge = await ac(rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [
      adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [], stationId: null, proc: null }),
    ])]));
    const ozet = within(bolge).getByRole('group', { name: 'Rota özeti' });
    fireEvent.click(within(ozet).getByRole('button', { name: 'Sorunlar: 1' }));
    const oge = screen.getByRole('menuitem', { name: 'OP 20 Tornalama: işlem süresi yok, istasyon yok' });
    fireEvent.click(oge);
    expect(kutu(bolge, 20).classList.contains('tc-rr1-secili')).toBe(true);
  });
});

