import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { PlanVerisi } from '../tipler.ts';
import { tedarikTerminiSatirlari, type AlimPlaniSatiri } from './kurallar.ts';
import { TedarikTerminiKarti } from './TedarikTermini.tsx';

// 533 a, 534 1 a, 554 a: malzeme başına tedarik termini satırı; yazılan Satın Alma'nın ucudur. Veri uydurmadır.
const G = 24;
const D: PlanVerisi = {
  siparisler: [], tezgahlar: [], urunler: [],
  malzemeler: [{ kod: '11', ad: 'Deneme cubuk', saTermin: '2026-01-09', saSurum: 3, saAciklama: 'Deneme not' }, { kod: 'EL-1', ad: 'Deneme elle' }],
};
const satir = (x: Partial<AlimPlaniSatiri>): AlimPlaniSatiri => ({
  tur: 'sa', alimNo: 0, src: null, tm: 'siparis-yok', tb: true, kod: '11', miktar: 1, tedarikci: null, no: null, verildi: null, ref: null, isler: [],
  gerekli: null, enGec: null, soz: null, etkin: null, siparisGun: null, durum: 'bekleniyor', ...x,
});
const L = [
  satir({ isler: ['E2'], gerekli: 4 * G, durum: 'bekleniyor' }),
  satir({ src: 0, tm: 'sa-termin', tb: false, isler: ['E1', 'E2'], gerekli: 2 * G, durum: 'geciktirir' }),
  satir({ kod: 'EL-1', isler: ['E3'], gerekli: 6 * G }),
];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('tedarik termini satırı', () => {
  it('malzeme başına tek satır: en kötü durum, en erken olması gereken, Satın Alma kaydı; katalog numarası olmayana giriş yok', () => {
    expect(tedarikTerminiSatirlari(D, L)).toEqual([
      { kod: '11', ad: 'Deneme cubuk', malzemeNo: 11, termin: '2026-01-09', surum: 3, aciklama: 'Deneme not', gerekli: 2 * G, isler: ['E2', 'E1'], durum: 'geciktirir' },
      { kod: 'EL-1', ad: 'Deneme elle', malzemeNo: null, termin: null, surum: null, aciklama: '', gerekli: 6 * G, isler: ['E3'], durum: 'bekleniyor' },
    ]);
  });

  it('yazar termini Satın Alma ucuna sürümle yazar ve yeniden okur; yazmayan yalnız görür', async () => {
    const istekler: { yol: string; govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      istekler.push({ yol: adres.replace(/^\/api/, ''), govde: typeof istek?.body === 'string' ? JSON.parse(istek.body) as unknown : undefined });
      return json(200, { termin: {} });
    }));
    const yenile = vi.fn();
    render(<BildirimSaglayici><TedarikTerminiKarti D={D} l={L} taban={0} yazar yenile={yenile} /></BildirimSaglayici>);
    const tablo = screen.getByRole('table', { name: 'Tedarik terminleri' });
    expect(within(tablo).queryByLabelText('EL-1 tedarik termini')).toBeNull();
    fireEvent.change(within(tablo).getByLabelText('11 tedarik termini'), { target: { value: '2026-01-12' } });
    await waitFor(() => { expect(yenile).toHaveBeenCalled(); });
    expect(istekler).toEqual([{ yol: '/satin-alma-tedarik-terminleri/kaydet', govde: { malzemeNo: 11, termin: '2026-01-12', aciklama: 'Deneme not', surum: 3 } }]);
    cleanup();
    render(<BildirimSaglayici><TedarikTerminiKarti D={D} l={L} taban={0} yazar={false} yenile={yenile} /></BildirimSaglayici>);
    expect(screen.queryByLabelText('11 tedarik termini')).toBeNull();
    expect(screen.getByText('09.01.2026')).toBeTruthy();
  });
});
