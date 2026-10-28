import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Kayıt 800 ms sonra gider: bekleme süresi ondan uzun.
const BEKLE = { timeout: 4000 };
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  return bolge;
};
// jsdom'da DataTransfer yok; sürükle-bırak verisi bu nesneyle taşınır.
const tasima = () => {
  const veri: Record<string, string> = {};
  return { dataTransfer: { effectAllowed: '', dropEffect: '', setData: (k: string, v: string) => { veri[k] = v; }, getData: (k: string) => veri[k] ?? '' } };
};
const kaydedici = () => {
  let durum = rotaDurumu();
  const k: { govde: unknown } = { govde: null };
  sunucuKur(YONETICI, {
    durum: () => json(200, durum),
    yazmalar: {
      'POST /rota/urunler/11/taslak-ac': () => {
        durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
        return json(200, { id: 72, durum: 'taslak', surum: 1 });
      },
      'POST /rota/revizyonlar/72/kaydet': (g) => { k.govde = g; return json(200, { id: 72, durum: 'taslak', surum: 2 }); },
    },
  });
  return k;
};
const adimlar = (g: unknown) => (g as { adimlar: { opNo: number | null }[] }).adimlar.map((a) => a.opNo);

describe('R1 operasyon paleti (1110 a, 1111 b, 1112 a, 1113 a)', () => {
  it('palet varsayılan kapalı; "Adım ekle" paleti açar, sağ panel adımda kalır ve dokunulan operasyon ardına eklenir', async () => {
    const k = kaydedici();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByRole('complementary', { name: 'Operasyon paleti' })).toBeNull();
    expect(within(bolge).getByRole('button', { name: 'Operasyon paleti' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(within(bolge).getByRole('button', { name: 'Adım ekle' }));
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    expect(within(palet).getByText('MM-0001: OP 10 Tornalama ardına (sona)')).toBeTruthy();
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(within(panel).getByLabelText('Hazırlık (dk / parti)')).toBeTruthy();

    fireEvent.click(within(palet).getByRole('button', { name: /Tornalama/ }));
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(adimlar(k.govde)).toEqual([10, null]);
  });

  it('palet tercihi yalnız üst düğmeyle yazılır; "Adım ekle" ile açılan palet yeniden açılışta kapalıdır', async () => {
    kaydedici();
    rrAc('/recete-rota/schema');
    let bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Adım ekle' }));
    expect(within(bolge).getByRole('complementary', { name: 'Operasyon paleti' })).toBeTruthy();
    cleanup();
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByRole('complementary', { name: 'Operasyon paleti' })).toBeNull();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Operasyon paleti' }));
    cleanup();
    rrAc('/recete-rota/schema');
    bolge = await bolumAc();
    expect(await within(bolge).findByRole('complementary', { name: 'Operasyon paleti' })).toBeTruthy();
  });

  it('gruplama operasyon grubuna göre; iş merkezine geçilir, başlık kapanınca kutucuk gizlenir', async () => {
    kaydedici();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Operasyon paleti' }));
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    const grup = within(palet).getByRole('button', { name: /Talaşlı\s*1/ });
    expect(grup.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(grup);
    expect(within(palet).queryByRole('button', { name: /^T\s*Tornalama/ })).toBeNull();

    fireEvent.click(within(palet).getByRole('button', { name: 'İş merkezi' }));
    expect(within(palet).getByRole('button', { name: /IM1 Talaşlı imalat/ })).toBeTruthy();
    expect(within(palet).getByRole('button', { name: /^T\s*Tornalama/ })).toBeTruthy();
  });

  it('sürüklerken bırakma şeridi çıkar; rota başlığına bırakılan operasyon başa eklenir', async () => {
    const k = kaydedici();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Operasyon paleti' }));
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    const t = tasima();
    fireEvent.dragStart(within(palet).getByRole('button', { name: /^T\s*Tornalama/ }), t);
    await within(bolge).findByText('Bırak: OP 10 ardına');
    expect(within(bolge).queryByRole('button', { name: 'Adım ekle' })).toBeNull();
    const baslik = within(bolge).getByText('Başa eklemek için buraya bırak').closest('button');
    if (!baslik) throw new Error('rota başlığı yok');
    fireEvent.dragOver(baslik, t);
    fireEvent.drop(baslik, t);
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(adimlar(k.govde)).toEqual([null, 10]);
    expect(within(bolge).queryByText('Bırak: OP 10 ardına')).toBeNull();
  });
});

describe('R1 operasyon paleti: reddedilen', () => {
  it('okuma yetkisinde palet düğmesi ve adım ekleme yok', async () => {
    sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByRole('button', { name: 'Operasyon paleti' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Adım ekle' })).toBeNull();
  });
});
