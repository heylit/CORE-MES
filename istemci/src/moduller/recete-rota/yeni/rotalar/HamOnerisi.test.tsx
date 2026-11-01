import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 1709 (1726 a, 1727 a): ürünün 3B analizinden hammadde önerisi. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
const ONERI_YOLU = '/rota/urunler/11/ham-onerisi';
const kayitlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/rota/revizyonlar/72/kaydet');
const ONERI: HamOnerisiCevabi = {
  model: { belgeAdi: 'Model mil.step', harf: 'A' }, payMm: 2, neden: null,
  oneriler: [{ malzemeNo: 12, kod: 'HM-0012', ad: null, kalite: 'C45', form: 'cubuk', olcu: { d: 30, l: 3000 }, aile: 'metal', kaliteKodu: 'C45', yogunluk: 7.85, kesimBoyuMm: 44, hamHacimMm3: 100_000 }],
};

function kur(ins: { itemId: string; qty: number; scrap: number }[], kisi: Kullanici = YONETICI) {
  return sunucuKur(kisi, {
    durum: rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi({ ins })])]),
    yazmalar: {
      [`GET ${ONERI_YOLU}`]: () => json(200, ONERI),
      'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 5 }),
    },
  });
}
const adimPaneli = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('1709 rota bileşeninde hammadde önerisi', () => {
  it('ham girdisi olmayan taslakta öneri ve kg miktarı görünür; Ekle girdiyi miktarıyla rotaya kaydeder', async () => {
    const istekler = kur([]);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    const grup = await within(panel).findByRole('group', { name: 'Önerilen hammadde' });
    expect(within(grup).getByText('0,785 kg')).toBeTruthy();
    expect(within(grup).getByText(/Model mil.step \(A\)/)).toBeTruthy();
    fireEvent.click(within(grup).getByRole('button', { name: 'HM-0012 önerisini giren olarak ekle' }));
    await within(panel).findByText('Girenler (1)');
    // Ham girdi eklenince öneri kalkar (sunucu taklidi kayıttan sonra eski durumu döndürdüğü için kayıttan önce bakılır).
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    await waitFor(() => { expect(kayitlar(istekler)).toHaveLength(1); }, BEKLE);
    expect(kayitlar(istekler)[0]?.govde).toMatchObject({ adimlar: [{ bilesenler: [{ malzemeId: 12, miktar: 0.785 }] }] });
  });

  it('rotada ham girdi varken öneri istenmez ve görünmez', async () => {
    const istekler = kur([{ itemId: '12', qty: 2, scrap: 0 }]);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    await within(panel).findByText('Girenler (1)');
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    expect(istekler.some((i) => i.yol === ONERI_YOLU)).toBe(false);
  });

  it('rota yazma yetkisi olmayan okuyucu öneriyi görmez, istek de gitmez', async () => {
    const istekler = kur([], OKUYAN);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    await within(panel).findByText('Girenler (0)');
    expect(within(panel).queryByRole('group', { name: 'Önerilen hammadde' })).toBeNull();
    expect(istekler.some((i) => i.yol === ONERI_YOLU)).toBe(false);
  });
});
