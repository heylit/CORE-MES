import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KmIlkParcaKaynagiCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3689-2: rota adımında ilk parça onayı değiştirilmez; kaynak Kalite Merkezi numune planıdır, plan yoksa eski rota seçimi gösterilir.
function kur(kullanici: Kullanici, kaynak: KmIlkParcaKaynagiCevabi) {
  sunucuKur(kullanici, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3)])),
    yazmalar: {
      'GET /rota/sartnameler': () => json(200, { kategoriler: [], standartlar: [], sartnameler: [] }),
      'GET /rota/revizyonlar/71/sartnameler': () => json(200, { adimlar: [] }),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, { surumler: [], taslak: null }),
      'GET /kalite-merkezi/ilk-parca/11': () => json(200, kaynak),
    },
  });
}
const ayarlar = async () => {
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
  fireEvent.click(within(panel).getByRole('button', { name: /^Planlama ayarları/ }));
  return panel;
};

describe('Rota adımında ilk parça kaynağı (3689-2)', () => {
  it('planı olan opta onay kutusu yok; satır planı gösterir, Kalite Merkezi yetkisi yoksa "Stüdyoda aç" kapalı', async () => {
    kur(YONETICI, { operasyonlar: [{ opNo: 10, ad: 'Tornalama', plan: { ilkParca: false, surum: 4 } }] });
    const panel = await ayarlar();
    expect(await within(panel).findByText('İlk parça: Kalite Merkezi numune planı (kapalı)')).toBeTruthy();
    expect(within(panel).queryByLabelText(/ilk parça onayı istensin/i)).toBeNull();
    expect((within(panel).getByRole('button', { name: 'Stüdyoda aç' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('plansız opta eski rota seçimi "plan yokken geçerli" diye salt okunur; Kalite Merkezi okuyan stüdyoyu açabilir', async () => {
    kur({ ...YONETICI, islemler: [...YONETICI.islemler, 'kalite-merkezi.oku'] }, { operasyonlar: [{ opNo: 10, ad: 'Tornalama', plan: null }] });
    const panel = await ayarlar();
    expect(await within(panel).findByText(/İlk parça: rota seçimi \(plan yokken geçerli\)/)).toBeTruthy();
    expect((within(panel).getByRole('button', { name: 'Stüdyoda aç' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('kapılı ilk parça taşımayan planda rota seçimi geçerli kalır (R1 geçiş)', async () => {
    kur(YONETICI, { operasyonlar: [{ opNo: 10, ad: 'Tornalama', plan: { ilkParca: null, surum: 2 } }] });
    const panel = await ayarlar();
    expect(await within(panel).findByText(/İlk parça: rota seçimi \(planda kapılı ilk parça yok\)/)).toBeTruthy();
    expect(within(panel).getByText(/Plan sürüm 2 · kapılı ilk parça kuralı eklenir/)).toBeTruthy();
  });
});
