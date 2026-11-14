import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { TeslimBagi } from './TeslimBagi.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR: AdimliEmirAyrintisi = {
  id: 5, emirNo: 'ORN-EMR-5', urun: { id: 501, kod: 'ORN-MAMUL-1', ad: 'Deneme mil' }, adet: 10, oncelik: 2, baslangic: null, teslim: '2026-11-10', durum: 'planli', arsiv: false,
  kaynakRotaRevizyonId: 1, adimSayisi: 2, tamamAdim: 0, siradaki: null, aciklama: null, acilma: '2026-10-06T08:00:00+00:00', surum: 4, eski: null, isEmirleri: [],
  siparisSatiriId: 41, teslimBagli: false,
};
const Ekran = () => <TeslimBagi emirId={5} />;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Emir teslimi sipariş terminine bağı (UE-TB, 3244 b)', () => {
  it('elle değişmiş teslim "Elle" görünür; yazan "Termine bağla" ile sürümüyle bağlar', async () => {
    let emir = EMIR;
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/5': () => json(200, { emir }),
      'POST /adimli-emirler/5/teslim-bagla': () => { emir = { ...EMIR, teslim: '2026-11-15', teslimBagli: true, surum: 5 }; return json(200, { emir }); },
    });
    ac([{ yol: '/e', ekran: Ekran }], '/e');
    expect(await screen.findByText('Elle')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Termine bağla/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ surum: 4 }));
    expect(await screen.findByText('Sipariş terminine bağlı')).toBeTruthy();
    expect(screen.getByText('Teslim 15.11.2026')).toBeTruthy();
  });

  it('okuyan bağlayamaz; başlamış emirde düğme yok; kalemsiz emirde görünmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /adimli-emirler/5': () => json(200, { emir: EMIR }) });
    ac([{ yol: '/e', ekran: Ekran }], '/e');
    await screen.findByText('Elle');
    expect(screen.queryByRole('button', { name: /Termine bağla/ })).toBeNull();
    cleanup();
    sunucuKur(YAZAR, { 'GET /adimli-emirler/5': () => json(200, { emir: { ...EMIR, durum: 'basladi' } }) });
    ac([{ yol: '/e', ekran: Ekran }], '/e');
    await screen.findByText('Elle');
    expect(screen.queryByRole('button', { name: /Termine bağla/ })).toBeNull();
    cleanup();
    const istekler = sunucuKur(YAZAR, { 'GET /adimli-emirler/5': () => json(200, { emir: { ...EMIR, siparisSatiriId: null } }) });
    ac([{ yol: '/e', ekran: Ekran }], '/e');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/5')).toBe(true));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByText('Elle')).toBeNull();
  });
});
