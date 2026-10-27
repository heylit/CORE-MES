import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  // 789, 798: sayfa salt okunurdur; ölçüm tek kalite formudur (terminal "Ölç" ya da Kalite Merkezi), ilk parça kararı Kalite Merkezi'nde.
  it('Kalite: sayfa salt okunur; numune seçilince ölçüm girişi ve karar düğmesi yok, hiçbir şey yazılmaz (reddedilen)', async () => {
    const istekler = sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/kalite');
    const b = await bolum('Kalite');
    const sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 }));
    const olcum = await within(b).findByRole('region', { name: 'Ölçüm' }, { timeout: 10000 });
    expect(await within(olcum).findByText('Ø20 h7', undefined, { timeout: 10000 })).toBeTruthy();
    expect(within(olcum).getByText('ölçülmedi')).toBeTruthy();
    expect(within(b).queryByRole('textbox', { name: 'Ölçülen Ø20 h7' })).toBeNull();
    expect(within(b).queryByRole('button', { name: /^(Onayla|Red|CMM dosyası)$/ })).toBeNull();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Kalite: eski numunenin kayıtlı ölçüsü salt okunur görünür', async () => {
    const olculmus = { ...belgeler, // Önceki denemenin cihazda kalan numunesiyle karışmasın diye ayrı kimlik.
    requests: [{ ...belgeler.requests[0]!, kimlik: 'r2', govde: { ...belgeler.requests[0]!.govde, id: 'r2', no: 'E-2', status: 'approved', decidedBy: 'Deneme Kalite', decidedAt: Date.now(), results: { 1: { v: 19.99, ok: true, by: 'Deneme Kalite' } } } }] };
    sunucuKur(KALITE, { belgeler: olculmus });
    arkonAc('/arkon/kalite');
    const b = await bolum('Kalite');
    const sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /Tamamlanan/ }, { timeout: 10000 }));
    fireEvent.click(await within(sira).findByRole('button', { name: /E-2/ }, { timeout: 10000 }));
    const olcum = await within(b).findByRole('region', { name: 'Ölçüm' }, { timeout: 10000 });
    expect(await within(olcum).findByText('19.99', undefined, { timeout: 10000 })).toBeTruthy();
    expect(within(olcum).getByText(/Onaylandı|Onay/)).toBeTruthy();
  }, 30000);

  it('Kalite: seçilen numunenin teknik resmi orta alanda açılır (yer tutucu yok)', async () => {
    sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/kalite');
    const b = await bolum('Kalite');
    const sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 }));
    expect(await within(b).findByRole('toolbar', { name: 'Teknik resim araçları' }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryByText('Bu bölüm hazırlanıyor')).toBeNull();
  }, 30000);

  it('Kalite: ölçümün ve ilk parça kararının yeri yazar; bağlantı yalnız Kalite Merkezi\'ni görene (501 a)', async () => {
    sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/kalite');
    let b = await bolum('Kalite');
    let sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 }));
    const not = await within(b).findByRole('note', {}, { timeout: 10000 });
    expect(not.textContent).toContain('salt okunur');
    expect(not.textContent).toContain('ilk parça kararı Kalite Merkezi\'nde');
    expect(within(not).queryByRole('link')).toBeNull();
    cleanup();

    sunucuKur({ ...KALITE, kullanici: { ...KALITE.kullanici, islemler: [...KALITE.kullanici.islemler, 'sayfa.kalite-merkezi'] } }, { belgeler });
    arkonAc('/arkon/kalite');
    b = await bolum('Kalite');
    sira = await within(b).findByRole('region', { name: 'Numune sırası' }, { timeout: 10000 });
    fireEvent.click(await within(sira).findByRole('button', { name: /E-1/ }, { timeout: 10000 }));
    const baglanti = await within(await within(b).findByRole('note', {}, { timeout: 10000 })).findByRole('link', { name: 'Kalite Merkezi\'ni aç' }, { timeout: 10000 });
    expect(baglanti.getAttribute('href')).toBe('/kalite-merkezi');
  }, 30000);

  it('Bakım: bakımcı arıza açar ve plan ekler; amir arıza açar ama plan ekleyemez; açılış yazmaz', async () => {
    let istekler = sunucuKur(BAKIM, { belgeler });
    arkonAc('/arkon/bakim');
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
    arkonAc('/arkon/bakim');
    b = await bolum('Bakım');
    expect(await within(b).findByRole('button', { name: /Arıza kaydı aç/ }, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(within(b).getByRole('button', { name: /Periyodik bakım/ }));
    expect(await within(b).findByText('Yağ değişimi')).toBeTruthy();
    expect(within(b).queryByRole('button', { name: /Bakım planı ekle/ })).toBeNull();
    expect(within(b).queryByRole('button', { name: /Düzenle/ })).toBeNull();
    expect(within(b).getByRole('button', { name: /Yapıldı/ })).toBeTruthy();
  }, 30000);

  it('Bakım: kalite rolüne açık değildir, ilk açık sayfasına geçer (eski firstPage)', async () => {
    sunucuKur(KALITE, { belgeler });
    arkonAc('/arkon/bakim');
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).not.toBe('/arkon/bakim'); }, { timeout: 10000 });
    expect(screen.queryByRole('region', { name: 'Bakım' })).toBeNull();
  }, 20000);

  it('Raporlar: bölümler çizilir, açılış yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/raporlar');
    const b = await bolum('Raporlar');
    expect(await within(b).findByRole('region', { name: 'OEE · günlük' }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).getByRole('region', { name: 'Duruş nedenleri · Pareto' })).toBeTruthy();
    expect(within(b).getByRole('table', { name: 'İstasyonlar' })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
  }, 20000);
});
