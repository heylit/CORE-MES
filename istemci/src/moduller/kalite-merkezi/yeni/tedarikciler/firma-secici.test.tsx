import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { kayitYazmalari, kmAc, MUHENDIS } from '../test-ortak.tsx';
import { firmaKimligi, firmaSecenekleri } from './index.tsx';

// 236 a: tedarikçi kaydı Müşteri-Tedarikçi firmasına `firmaId` ile bağlanır; eski çerçevedeki seçicinin yeni ekrandaki yeri. Veri uydurmadır.
// jsdom tuval çizmez; ekrandaki grafik kurulmaz.
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

const FIRMALAR = [{ id: 7, kod: 'T-7', ad: 'Deneme Tedarik' }, { id: 9, kod: null, ad: 'Deneme Alfa' }];
const TED = { _id: 's1', kod: 'TED-001', ad: 'Deneme Tedarik', onay: 'Onaylı' };

// Firma listesi ucu test sunucusunun dışındadır; öteki istekler ona gider.
function firmaUcu(cevap: () => Response) {
  const asil = globalThis.fetch;
  const sahte = vi.fn(async (adres: string, istek?: RequestInit) =>
    (adres.endsWith('/kalite-merkezi/tedarikci-firmalari') ? cevap() : asil(adres, istek)));
  vi.stubGlobal('fetch', sahte);
  return sahte;
}
const firmalarCevabi = () => new Response(JSON.stringify({ firmalar: FIRMALAR }), { status: 200 });
const kaydedilen = (yazmalar: Parameters<typeof kayitYazmalari>[0]) => {
  const y = kayitYazmalari(yazmalar, 'sup');
  return (y.at(-1)?.govde as { govde: Record<string, unknown> } | undefined)?.govde;
};

describe('tedarikçi firma seçicisi', () => {
  it('seçenekler: "Bağlı değil", ad ve kod; listede olmayan bağ korunur', () => {
    expect(firmaSecenekleri(FIRMALAR, null)).toEqual([['', 'Bağlı değil'], ['7', 'Deneme Tedarik (T-7)'], ['9', 'Deneme Alfa']]);
    expect(firmaSecenekleri(FIRMALAR, 42).at(-1)).toEqual(['42', 'Firma #42 (listede yok)']);
    expect(firmaSecenekleri(FIRMALAR, 7)).toHaveLength(3);
  });

  it('seçim sayı olarak yazılır; boş ve bozuk değer null', () => {
    expect([firmaKimligi('7'), firmaKimligi(7), firmaKimligi(''), firmaKimligi('bozuk'), firmaKimligi(0), firmaKimligi('1.5'), firmaKimligi(undefined)])
      .toEqual([7, 7, null, null, null, null, null]);
  });

  it('düzenlemede seçilen firma kayda yazılır', async () => {
    const { yazmalar } = kmAc('tedarikciler', MUHENDIS, { sup: [TED] });
    firmaUcu(firmalarCevabi);
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    const secici = await screen.findByLabelText(/Bağlı firma/);
    fireEvent.change(secici, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydedilen(yazmalar)).toBeDefined());
    expect(kaydedilen(yazmalar)).toMatchObject({ kod: 'TED-001', firmaId: 9 });
  });

  it('var olan bağ dokunulmadan kaydedilince korunur; listede olmayan bağ da', async () => {
    for (const firmaId of [7, 42]) {
      const { yazmalar } = kmAc('tedarikciler', MUHENDIS, { sup: [{ ...TED, firmaId }] });
      firmaUcu(firmalarCevabi);
      fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
      expect((await screen.findByLabelText<HTMLSelectElement>(/Bağlı firma/)).value).toBe(String(firmaId));
      fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
      await waitFor(() => expect(kaydedilen(yazmalar)).toBeDefined());
      expect(kaydedilen(yazmalar)?.firmaId).toBe(firmaId);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('liste açılamazsa alan çıkmaz, kayıttaki bağ olduğu gibi gider', async () => {
    const { yazmalar } = kmAc('tedarikciler', MUHENDIS, { sup: [{ ...TED, firmaId: 7 }] });
    const uc = firmaUcu(() => new Response(JSON.stringify({ kod: 'YETKI', mesaj: 'yetki yok' }), { status: 403 }));
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    await waitFor(() => expect(uc.mock.calls.some(([a]) => String(a).endsWith('/tedarikci-firmalari'))).toBe(true));
    expect(screen.queryByLabelText(/Bağlı firma/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydedilen(yazmalar)).toBeDefined());
    expect(kaydedilen(yazmalar)?.firmaId).toBe(7);
  });
});
