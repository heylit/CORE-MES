import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Akış tablosu eski sayfanın düzenindedir: Girenler | Rota adımları | Çıkanlar; adım kartı yerinde düzenlenir. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
const rotaYazmalari = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && /^\/rota\/(urunler|revizyonlar)\//.test(i.yol));
const tabloAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: /Akış tablosu/ }));
  return within(bolge).findByRole('region', { name: 'MM-0001 rotası' });
};

describe('R1 akış tablosu: izinli', () => {
  it('üç sütunlu satır çizilir; adım kartında hazırlık yerinde değişince taslak açılır ve aynı kayıt yoluyla yazılır', async () => {
    let durum = rotaDurumu();
    let kaydet: unknown = null;
    const istekler = sunucuKur(YONETICI, {
      durum: () => json(200, durum),
      yazmalar: {
        'POST /rota/urunler/11/taslak-ac': () => {
          durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
          return json(200, { id: 72, durum: 'taslak', surum: 1 });
        },
        'POST /rota/revizyonlar/72/kaydet': (g) => { kaydet = g; return json(200, { id: 72, durum: 'taslak', surum: 2 }); },
      },
    });
    rrAc('/recete-rota/yeni/schema');
    const tablo = await tabloAc();
    for (const baslik of ['Girenler', 'Rota adımları', 'Çıkanlar']) expect(within(tablo).getByText(baslik)).toBeTruthy();
    expect(within(tablo).getByText('HM-0012')).toBeTruthy();
    expect(within(tablo).getByText('ürün, stoğa girer')).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: 'OP 10 Tornalama' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Adımı silmek için buraya sürükle' })).toBeTruthy();
    expect(rotaYazmalari(istekler)).toEqual([]);

    const hazirlik = within(tablo).getByLabelText('Hazırlık dk');
    fireEvent.change(hazirlik, { target: { value: '45' } });
    fireEvent.blur(hazirlik);
    await waitFor(() => { expect(kaydet).not.toBeNull(); }, BEKLE);
    expect(rotaYazmalari(istekler)[0]?.yol).toBe('/rota/urunler/11/taslak-ac');
    expect(kaydet).toMatchObject({ surum: 1, adimlar: [{ opNo: 10, ayarSuresiDk: 45, islemSuresiDk: 5, bilesenler: [{ malzemeId: 12, miktar: 2 }] }] });
  });
});

describe('R1 akış tablosu: reddedilen', () => {
  it('yalnız okuyan kişide alanlar kapalıdır, ekleme ve silme düğmesi yoktur, yazma gitmez', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/yeni/schema');
    const tablo = await tabloAc();
    expect((within(tablo).getByLabelText('Hazırlık dk') as HTMLInputElement).disabled).toBe(true);
    expect((within(tablo).getByLabelText('Operasyon') as HTMLSelectElement).disabled).toBe(true);
    expect(within(tablo).queryByRole('button', { name: /Giren$/ })).toBeNull();
    expect(within(tablo).queryByRole('button', { name: 'OP 10 sil' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Adımı silmek için buraya sürükle' })).toBeNull();
    expect(rotaYazmalari(istekler)).toEqual([]);
  });
});
