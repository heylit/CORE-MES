import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const TALIMAT: TalimatlarCevabi = { surumler: [], taslak: null };
const TURLER = { turler: [{ id: 3, ad: 'Mikrometre' }, { id: 4, ad: 'Tampon mastar' }] };
const kart = { id: 501, stokKodu: 'DM-DNM-1', ad: 'Deneme aparat', tur: 'demirbas', stokBirimi: 'adet', onayDurumu: 'aktif' };

function kur() {
  let ekipman: unknown[] = [];
  const yazilan: unknown[] = [];
  sunucuKur(YONETICI, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4)])),
    yazmalar: {
      'GET /rota/sartnameler': () => json(200, { kategoriler: [], standartlar: [], sartnameler: [] }),
      'GET /rota/revizyonlar/72/sartnameler': () => json(200, { adimlar: [] }),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, TALIMAT),
      'GET /rota/revizyonlar/72': () => json(200, { adimlar: [{ opNo: 10, ekipman }] }),
      'GET /rota/olcu-aleti-turleri': () => json(200, TURLER),
      'GET /rota/malzeme-ara': () => json(200, { satirlar: [kart], toplam: 1, sayfaBoyu: 20 }),
      'POST /rota/revizyonlar/72/adim-ekipmani': (g) => {
        yazilan.push(g);
        const x = g as { ekipman: { tur: string; aletTuruId?: number; malzemeId?: number; aciklama: string | null }[] };
        ekipman = x.ekipman.map((y) => ({
          tur: y.tur, aciklama: y.aciklama, malzeme: y.malzemeId ? kart : null, aletTuru: y.aletTuruId ? TURLER.turler.find((t) => t.id === y.aletTuruId) ?? null : null,
        }));
        return json(200, { id: 72, durum: 'taslak', surum: 5 });
      },
    },
  });
  return yazilan;
}

const adimAc = async () => {
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('Rota adımının aparat ve ölçü aleti listesi (2893-4 a)', () => {
  it('ölçü aleti türü ve aparat eklenir, liste OP numarası ve revizyon sürümüyle bütün yazılır; çıkarılır', async () => {
    const yazilan = kur();
    const panel = await adimAc();
    await within(panel).findByText('Bu adımda aparat ya da ölçü aleti istenmiyor.');
    const secim = within(panel).getByLabelText('Ölçü aleti türü');
    await within(secim).findByRole('option', { name: 'Mikrometre' });
    fireEvent.change(secim, { target: { value: '3' } });
    fireEvent.change(within(panel).getByLabelText('Not (isteğe bağlı)'), { target: { value: '0-25 mm' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Adıma ekle' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    expect(yazilan[0]).toEqual({ surum: 4, opNo: 10, ekipman: [{ tur: 'olcu_aleti', aletTuruId: 3, aciklama: '0-25 mm' }] });
    await within(panel).findByText('Mikrometre');

    fireEvent.change(within(panel).getByLabelText('Tür'), { target: { value: 'aparat' } });
    fireEvent.change(within(panel).getByLabelText('Aparat kartı ara'), { target: { value: 'DNM' } });
    const aparat = within(panel).getByLabelText('Aparat');
    await within(aparat).findByRole('option', { name: 'DM-DNM-1 Deneme aparat' });
    fireEvent.change(aparat, { target: { value: '501' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Adıma ekle' }));
    await waitFor(() => { expect(yazilan).toHaveLength(2); });
    // Sürüm ilk yazımdan dönen sürümdür: düzenleyicinin kaydı da aynı sürümü kullanır.
    expect(yazilan[1]).toEqual({ surum: 5, opNo: 10, ekipman: [{ tur: 'olcu_aleti', aletTuruId: 3, aciklama: '0-25 mm' }, { tur: 'aparat', malzemeId: 501, aciklama: null }] });
    await within(panel).findByText('DM-DNM-1 Deneme aparat');

    fireEvent.click(within(panel).getByRole('button', { name: 'Mikrometre adımdan çıkar' }));
    await waitFor(() => { expect(yazilan).toHaveLength(3); });
    expect(yazilan[2]).toEqual({ surum: 5, opNo: 10, ekipman: [{ tur: 'aparat', malzemeId: 501, aciklama: null }] });
  });
});
