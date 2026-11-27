import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Emir, EmirAyrintiCevabi, ParcaRevizyonlariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

// 3755: parça revizyonu seçimi emrin ana yerindedir. Seçim gerekirse şerit ve düzenleme yetkisinde "Revizyonu seç"; seçilmişse ve kartta
// daha yeni revizyon yayındaysa bilgi notu. Veriler uydurmadır.
const TEMEL = {
  id: 2, emirNo: 'ORN-2', durum: 'taslak', parcaNo: 'ORN-001', parcaAd: 'Deneme mil', adet: 10, istasyon: { id: 3, ad: 'Deneme Tezgah 1' },
  acan: { id: 7, ad: 'Deneme Planlamaci' }, acilma: '2026-11-15T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
  malzemeNo: 41, surum: 5,
} satisfies Emir;
const SECILMEMIS = { ...TEMEL, parcaRevizyonu: null, parcaRevizyonuSecimGerekli: true } satisfies Emir;
const LISTE: ParcaRevizyonlariCevabi = {
  cizim: { belgeId: 9, ad: 'ORN-001 cizim' },
  revizyonlar: [
    { revizyonId: 12, kod: '01', durum: 'yayinda', yayinlandi: '2026-11-20T08:00:00+00:00', rotaUyarisi: null },
    { revizyonId: 11, kod: '00', durum: 'eski', yayinlandi: '2026-10-01T08:00:00+00:00', rotaUyarisi: null },
  ],
  varsayilanRevizyonId: 12, rotaCizimRevizyonId: null, rotaHarfi: null,
};
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
const ayrinti = (emir: Emir) => json(200, { emir, kayitlar: [] } satisfies EmirAyrintiCevabi);
const SERIT = { name: 'Parça revizyonu seçilmemiş' };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3755 emir sayfasında parça revizyonu', () => {
  it('düzenleme yetkisinde "Revizyonu seç" pencereyi açar; Kaydet revizyonu ve sürümü istek kimliğiyle yazar', async () => {
    let emir: Emir = SECILMEMIS;
    const istekler = sunucuKur(YAZAR, {
      'GET /uretim-emirleri/2': () => ayrinti(emir),
      'GET /adimli-emirler/parca-revizyonlari': () => json(200, LISTE),
      'POST /adimli-emirler/2/parca-revizyonu': () => { emir = { ...TEMEL, surum: 6, parcaRevizyonu: '00', parcaRevizyonuSecimGerekli: false }; return json(200, { emir: {} }); },
    });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', SERIT);
    const dugme = within(serit).getByRole('button', { name: 'Revizyonu seç' }) as HTMLButtonElement;
    await waitFor(() => { expect(dugme.disabled).toBe(false); });
    fireEvent.click(dugme);
    const secim = await screen.findByLabelText('Parça revizyonu (çizim)');
    expect(within(secim).getByRole('option', { name: 'Rev 00 · eski · 01.10.2026' })).toBeTruthy();
    fireEvent.change(secim, { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('status', SERIT)).toBeNull(); });
    const komut = istekler.find((i) => i.yontem === 'POST')!;
    expect(komut.govde).toEqual({ revizyonId: 11, surum: 5 });
    expect(komut.kimlik).toBeTruthy();
    expect(await screen.findByText(/Kartta yeni revizyon var: Rev 01/)).toBeTruthy();
  });

  it('yetkisiz kişide düğme pasif ve nedeni yazılı; seçilmiş ve güncel revizyonda şerit yok', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/2': () => ayrinti(SECILMEMIS), 'GET /adimli-emirler/parca-revizyonlari': () => json(200, LISTE) });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', SERIT);
    expect((within(serit).getByRole('button', { name: 'Revizyonu seç' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(serit).getByText(/emir düzenleme yetkisi gerekir/)).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, {
      'GET /uretim-emirleri/2': () => ayrinti({ ...TEMEL, parcaRevizyonu: '01', parcaRevizyonuSecimGerekli: false }),
      'GET /adimli-emirler/parca-revizyonlari': () => json(200, LISTE),
    });
    ac(ekran, '/uretim-emirleri/2');
    await screen.findByText('ORN-001');
    await waitFor(() => { expect(screen.queryByText(/Kartta yeni revizyon/)).toBeNull(); });
    expect(screen.queryByRole('status', SERIT)).toBeNull();
  });
});
