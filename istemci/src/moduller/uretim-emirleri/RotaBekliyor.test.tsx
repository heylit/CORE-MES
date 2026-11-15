import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Emir, EmirAyrintiCevabi, EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

// 3272-2 a: siparişten rotasız açılmış emir "Rota bekliyor" taşır; listede rozet, emir sayfasında şerit ve "Rotayı uygula".
// Düğme rotadan emir açma yetkisi olmayana pasiftir ve nedeni yanında yazar. Veriler uydurmadır.
const TEMEL = {
  parcaNo: 'ORN-001', parcaAd: 'Deneme mil', adet: 10, istasyon: { id: 3, ad: 'Deneme Tezgah 1' }, acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-11-15T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
};
const BEKLEYEN = { ...TEMEL, id: 2, emirNo: 'ORN-2', durum: 'taslak', rotaBekliyor: true } satisfies Emir;
const DOLU = { ...TEMEL, id: 1, emirNo: 'ORN-1', durum: 'taslak', rotaBekliyor: false } satisfies Emir;
const ROTACI: Kullanici = { ...YAZAR, islemler: [...YAZAR.islemler, 'rota.emre-kopyala'] };
const ekran = [{ yol: '/uretim-emirleri', ekran: UretimEmirleri }, { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
const ayrinti = (emir: Emir) => json(200, { emir, kayitlar: [] } satisfies EmirAyrintiCevabi);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3272 rota bekleyen emir', () => {
  it('listede durumun yanında "Rota bekliyor" rozeti; dolu emirde yok', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, { emirler: [DOLU, BEKLEYEN] } satisfies EmirlerCevabi) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('ORN-2');
    expect(screen.getByText('ORN-2').closest('tr')!.querySelector('td[data-baslik="Durum"]')?.textContent).toBe('Taslak Rota bekliyor');
    expect(screen.getByText('ORN-1').closest('tr')!.querySelector('td[data-baslik="Durum"]')?.textContent).toBe('Taslak');
  });

  it('emir sayfasında şerit; "Rotayı uygula" rota ucunu istek kimliğiyle çağırır', async () => {
    let emir: Emir = BEKLEYEN;
    const istekler = sunucuKur(ROTACI, {
      'GET /uretim-emirleri/2': () => ayrinti(emir),
      'POST /rota/emirler/2/bekleyen-rotayi-uygula': () => { emir = { ...BEKLEYEN, rotaBekliyor: false }; return json(200, { degisenler: [], kaynakRevizyon: { id: 4, harf: 'B' } }); },
    });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', { name: 'Emir rota bekliyor' });
    expect(within(serit).getByText(/adımı yok, planlanmaz/)).toBeTruthy();
    fireEvent.click(within(serit).getByRole('button', { name: 'Rotayı uygula' }));
    await waitFor(() => { expect(screen.queryByRole('status', { name: 'Emir rota bekliyor' })).toBeNull(); });
    const komut = istekler.find((i) => i.yontem === 'POST')!;
    expect(komut.yol).toBe('/rota/emirler/2/bekleyen-rotayi-uygula');
    expect(komut.kimlik).toBeTruthy();
  });

  it('yetkisiz kişide "Rotayı uygula" pasif ve nedeni yazılı; sunucu reddi şeritte görünür', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/2': () => ayrinti(BEKLEYEN) });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', { name: 'Emir rota bekliyor' });
    expect((within(serit).getByRole('button', { name: 'Rotayı uygula' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(serit).getByText(/rotadan emir açma yetkisi gerekir/)).toBeTruthy();
    cleanup();
    sunucuKur(ROTACI, {
      'GET /uretim-emirleri/2': () => ayrinti(BEKLEYEN),
      'POST /rota/emirler/2/bekleyen-rotayi-uygula': () => json(422, { kod: 'GECERSIZ', mesaj: 'Bu emrin türüne düşen rotanın yürürlükte revizyonu yok; rota yürürlüğe girince uygulanır.' }),
    });
    ac(ekran, '/uretim-emirleri/2');
    const serit2 = await screen.findByRole('status', { name: 'Emir rota bekliyor' });
    fireEvent.click(within(serit2).getByRole('button', { name: 'Rotayı uygula' }));
    expect((await within(serit2).findByRole('alert')).textContent).toContain('yürürlükte revizyonu yok');
  });
});
