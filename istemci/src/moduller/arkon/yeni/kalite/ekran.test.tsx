import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// A4 sayfaları: açılışta yazmaz (numune açılınca "Ölçülüyor" yazılmaz, seçilince yazılır), düğmeler yetkiye göre çizilir.
// Kişi, iş ve ölçü adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const KALITE: Deneme = { rol: 'quality', kullanici: { id: 7, ad: 'Deneme Kalite', islemler: ['sayfa.arkon', 'arkon.kalite', YENI_EKRAN_ISLEMI] } };
const AMIR: Deneme = { rol: 'lead', kullanici: { id: 6, ad: 'Deneme Amir', islemler: ['sayfa.arkon', 'arkon.amir', YENI_EKRAN_ISLEMI] } };
const BAKIM: Deneme = { rol: 'maint', kullanici: { id: 8, ad: 'Deneme Bakim', islemler: ['sayfa.arkon', 'arkon.bakim', YENI_EKRAN_ISLEMI] } };
const bolum = async (ad: string) => screen.findByRole('region', { name: ad }, { timeout: 10000 });
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem === 'POST' && /\/(yaz|sil)$/.test(i.yol));
const bekle = () => new Promise((r) => { setTimeout(r, 400); });

const TESIS = { wcs: [{ id: 'W1', name: 'Talaşlı' }], sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }], mcs: [{ id: 'M1', name: 'Tezgah', st: 'S1' }] };
const plan = [{ id: 1, nom: 'Ø20 h7', tol: 'h7', min: 19.979, max: 20, tool: 'Mikrometre' }];
// kv belgeleri depoda { v } sarmalıyla durur (store.ts).
const belgeler = {
  kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, { kimlik: 'shifts', surum: 1, govde: { v: [{ name: 'A', start: '00:00', end: '23:59', breaks: [] }] } }],
  pkgs: [{ kimlik: 'p1', surum: 1, govde: { id: 'p1', no: 'E-1', part: 'Parça A', rev: 'A', machine: 'S1', status: 'published', target: 10, cycle: 30, plan, steps: [], files: [], due: '' } }],
  requests: [{ kimlik: 'r1', surum: 1, govde: { id: 'r1', pkgId: 'p1', no: 'E-1', part: 'Parça A', rev: 'A', machine: 'S1', by: 'Deneme Operator', at: Date.now() - 60_000, reason: 'İlk parça', items: [1], crit: false, cnt: 1, status: 'waiting', results: {} } }],
  maint: [
    { kimlik: 'a1', surum: 1, govde: { id: 'a1', type: 'ariza', st: 'S1', mc: 'M1', title: 'Kaçak', openedAt: Date.now() - 3_600_000, status: 'open' } },
    { kimlik: 'pl1', surum: 1, govde: { id: 'pl1', type: 'plan', mc: 'M1', st: 'S1', title: 'Yağ değişimi', everyDays: 30, lastAt: Date.now() - 40 * 864e5 } },
  ],
};

describe('A4 sayfaları', () => {
  it('Kalite: açılışta ilk numune görünür ama yazılmaz; kalite seçince "Ölçülüyor" yazar ve ölçüm girer', async () => {
    const istekler = sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/yeni/kalite');
    const b = await bolum('Kalite');
    const sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    const numune = await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 });
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(numune);
    expect(await within(b).findByRole('textbox', { name: 'Ölçülen Ø20 h7' }, { timeout: 10000 })).toBeTruthy();
    await vi.waitFor(() => { expect(yazmalar(istekler).some((i) => i.yol.startsWith('/arkon/belgeler/requests/'))).toBe(true); });
  }, 30000);

  it('Kalite: ölçme yetkisi olmayan amir ölçüm girişini ve karar düğmelerini görmez, seçince yazmaz', async () => {
    const istekler = sunucuKur(AMIR, { belgeler });
    arkonAc('/arkon/yeni/kalite');
    const b = await bolum('Kalite');
    const sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 }));
    await bekle();
    expect(within(b).queryByRole('textbox', { name: 'Ölçülen Ø20 h7' })).toBeNull();
    expect(within(b).queryByRole('button', { name: /^Onayla$/ })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Bakım: bakımcı arıza açar ve plan ekler; amir arıza açar ama plan ekleyemez; açılış yazmaz', async () => {
    let istekler = sunucuKur(BAKIM, { belgeler });
    arkonAc('/arkon/yeni/bakim');
    let b = await bolum('Bakım');
    expect(await within(b).findByText('Kaçak', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).getByRole('button', { name: /Arıza kaydı aç/ })).toBeTruthy();
    expect(within(b).getByRole('button', { name: /Üstlen/ })).toBeTruthy();
    fireEvent.click(within(b).getByRole('button', { name: /Periyodik bakım/ }));
    expect(await within(b).findByRole('button', { name: /Bakım planı ekle/ })).toBeTruthy();
    expect(within(b).getByText(/gün gecikti/)).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    window.localStorage.clear();

    istekler = sunucuKur(AMIR, { belgeler });
    arkonAc('/arkon/yeni/bakim');
    b = await bolum('Bakım');
    expect(await within(b).findByRole('button', { name: /Arıza kaydı aç/ }, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(within(b).getByRole('button', { name: /Periyodik bakım/ }));
    expect(await within(b).findByText('Yağ değişimi')).toBeTruthy();
    expect(within(b).queryByRole('button', { name: /Bakım planı ekle/ })).toBeNull();
    expect(within(b).queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(within(b).getByRole('button', { name: /Yapıldı/ })).toBeTruthy();
  }, 30000);

  it('Bakım: kalite rolüne açık değildir', async () => {
    sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/yeni/bakim');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('Raporlar: bölümler çizilir, açılış yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/yeni/raporlar');
    const b = await bolum('Raporlar');
    expect(await within(b).findByRole('region', { name: 'OEE · günlük' }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).getByRole('region', { name: 'Duruş nedenleri · Pareto' })).toBeTruthy();
    expect(within(b).getByRole('table', { name: 'İstasyonlar' })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
  }, 20000);
});
