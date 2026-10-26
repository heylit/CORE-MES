import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// A3 sayfaları: açılışta yazmaz, düğmeler yetkiye göre çizilir. Kişi, istasyon ve iş adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });

const HAZIRLIK: Deneme = { rol: 'prep', kullanici: { id: 5, ad: 'Deneme Hazirlik', islemler: ['sayfa.arkon', 'arkon.hazirlik', YENI_EKRAN_ISLEMI] } };
const AMIR: Deneme = { rol: 'lead', kullanici: { id: 6, ad: 'Deneme Amir', islemler: ['sayfa.arkon', 'arkon.amir', YENI_EKRAN_ISLEMI] } };
const bolum = async (ad: string) => screen.findByRole('region', { name: ad }, { timeout: 10000 });
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem === 'POST' && /\/(yaz|sil)$/.test(i.yol));
const bekle = () => new Promise((r) => { setTimeout(r, 400); });

const TESIS = { wcs: [{ id: 'W1', name: 'Talaşlı' }], sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }, { id: 'S2', name: 'Freze', wc: 'W1', t: 'cnc' }], mcs: [] };
const VARDIYA = [{ name: 'A', start: '00:00', end: '23:59', breaks: [] }];
// kv belgeleri depoda { v } sarmalıyla durur (store.ts).
const belgeler = {
  kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, { kimlik: 'shifts', surum: 1, govde: { v: VARDIYA } }, { kimlik: 'reasons', surum: 1, govde: { v: [{ code: 'D-07', l: 'Bakım', cat: 'p' }] } }],
  pkgs: [
    { kimlik: 'p1', surum: 1, govde: { id: 'p1', no: 'E-1', part: 'Parça A', machine: 'S1', status: 'published', target: 10, cycle: 30, plan: [], steps: [], files: [], due: '', seq: 10 } },
    { kimlik: 'p2', surum: 1, govde: { id: 'p2', no: 'E-2', part: 'Parça B', machine: 'S1', status: 'published', target: 5, cycle: 60, plan: [], steps: [], files: [], due: '', seq: 20 } },
  ],
};

describe('A3 sayfaları', () => {
  it('Pano açılır, istasyonları çizer ve açılışta kayıt yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/pano');
    const b = await bolum('Pano');
    expect(await within(b).findByText('Torna', { exact: false }, { timeout: 10000 })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
  }, 20000);

  it('Plan Kuyruğu: yönetici sıra değiştirir ve planlı duruş ekler; hazırlık rolü yalnız görür', async () => {
    let istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/planlama');
    let b = await bolum('Plan Kuyruğu');
    expect(await within(b).findByText('E-1', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).getAllByRole('button', { name: /aşağı|yukarı|Taşı/i }).length).toBeGreaterThan(0);
    fireEvent.click(within(b).getByRole('button', { name: /Planlı duruşlar/ }));
    expect(await within(b).findByRole('button', { name: /Planlı duruş ekle/ })).toBeTruthy();
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    // Seçili bölüm cihazda saklanır (eski planTab); ikinci kişi İş emirleri'nden başlasın.
    window.localStorage.clear();

    istekler = sunucuKur(HAZIRLIK, { belgeler });
    arkonAc('/arkon/planlama');
    b = await bolum('Plan Kuyruğu');
    expect(await within(b).findByText('E-1', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryAllByRole('button', { name: /aşağı|yukarı|Taşı/i })).toEqual([]);
    fireEvent.click(within(b).getByRole('button', { name: /Planlı duruşlar/ }));
    await bekle();
    expect(within(b).queryByRole('button', { name: /Planlı duruş ekle/ })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Plan Kuyruğu (kart 527): Hazırlık kuyruğu sıralar, plan kartta referans görünür; sıra plana değil kuyruk ucuna gider', async () => {
    const tp = (id: number, plan: number, kuyruk: number) => ({ kimlik: `tmi-ie-${id}`, surum: 1, govde: {
      id: `tmi-ie-${id}`, no: `E-${id}0`, part: `Parça ${id}`, machine: 'S1', status: 'published', target: 4, cycle: 30, plan: [], steps: [], files: [], due: '',
      tmi: { isEmriId: id, plan: { canli: true, sira: plan, eslesiyor: true, kaynak: { tur: 'makine', id: 5 } },
        kuyruk: { sira: kuyruk, kisi: 'Deneme Hazirlik', zaman: '2026-10-25T08:00:00Z' }, planSaati: { baslangic: '2026-10-25T07:30:00Z', bitis: '2026-10-25T09:40:00Z' } },
    } });
    const SIRALAYAN: Deneme = { ...HAZIRLIK, kullanici: { ...HAZIRLIK.kullanici, islemler: [...HAZIRLIK.kullanici.islemler, 'arkon.kuyruk-sirala'] } };
    const istekler = sunucuKur(SIRALAYAN, { belgeler: { ...belgeler, pkgs: [tp(1, 1, 2), tp(2, 2, 1)] } });
    arkonAc('/arkon/planlama');
    const b = await bolum('Plan Kuyruğu');
    const s1 = await within(b).findByRole('region', { name: 'Şerit S1' }, { timeout: 10000 });
    expect(await within(s1).findByText('Planda 2. · öne alındı')).toBeTruthy();
    expect(within(s1).getByText('Planda 1. · geri alındı')).toBeTruthy();
    expect(within(s1).getByText('Planla 2 fark: 2 iş sırası farklı')).toBeTruthy();
    expect(within(s1).getByRole('button', { name: /Plan sırasına dön/ })).toBeTruthy();
    expect(within(s1).queryByRole('button', { name: /Plana öner/ })).toBeNull();
    expect(within(s1).queryByRole('combobox', { name: 'İstasyona taşı' })).toBeNull();
    fireEvent.click(within(s1).getAllByRole('button', { name: 'Aşağı' })[0]!);
    await vi.waitFor(() => { expect(istekler.some((i) => i.yol === '/arkon/kuyruk-sira/sirala')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/arkon/kuyruk-sira/sirala')?.govde)
      .toMatchObject({ istasyon: 'S1', onceki: ['tmi-ie-2', 'tmi-ie-1'], yeni: ['tmi-ie-1', 'tmi-ie-2'] });
    expect(istekler.some((i) => i.yol.startsWith('/arkon/plan-sira'))).toBe(false);
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Plan Kuyruğu sürükleme: taşınan kart soluk, hedef kartta giriş çizgisi; kartın kendi üstünde çizgi yok, bırakınca ikisi de kalkar', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/planlama');
    const b = await bolum('Plan Kuyruğu');
    const s1 = await within(b).findByRole('region', { name: 'Şerit S1' }, { timeout: 10000 });
    const k1 = await within(s1).findByLabelText('E-1 Parça A');
    const k2 = within(s1).getByLabelText('E-2 Parça B');
    const dataTransfer = { setData: () => undefined, getData: () => 'p1' };
    fireEvent.dragStart(k1, { dataTransfer });
    await waitFor(() => { expect(k1.hasAttribute('data-suruklenen')).toBe(true); });
    fireEvent.dragOver(k1, { dataTransfer });
    expect(k1.hasAttribute('data-uzerinde')).toBe(false);
    fireEvent.dragOver(k2, { dataTransfer });
    await waitFor(() => { expect(k2.hasAttribute('data-uzerinde')).toBe(true); });
    expect(k2.hasAttribute('data-suruklenen')).toBe(false);
    fireEvent.dragEnd(k1, { dataTransfer });
    await waitFor(() => { expect(k1.hasAttribute('data-suruklenen')).toBe(false); });
    expect(k2.hasAttribute('data-uzerinde')).toBe(false);
  }, 20000);

  it('Planla karşılaştır (638 b): anahtar açıkken şeritte solda canlı plan sırası salt okunur, sağda kuyruk; farklı sıradaki iş vurgulu', async () => {
    const tp = (id: number, plan: number, kuyruk: number) => ({ kimlik: `tmi-ie-${id}`, surum: 1, govde: {
      id: `tmi-ie-${id}`, no: `E-${id}0`, part: `Parça ${id}`, machine: 'S1', status: 'published', target: 4, cycle: 30, plan: [], steps: [], files: [], due: '',
      tmi: { isEmriId: id, plan: { canli: true, sira: plan, eslesiyor: true, kaynak: { tur: 'makine', id: 5 } },
        kuyruk: { sira: kuyruk, kisi: 'Deneme Hazirlik', zaman: '2026-10-25T08:00:00Z' }, planSaati: { baslangic: '2026-10-25T07:30:00Z', bitis: '2026-10-25T09:40:00Z' } },
    } });
    const SIRALAYAN: Deneme = { ...HAZIRLIK, kullanici: { ...HAZIRLIK.kullanici, islemler: [...HAZIRLIK.kullanici.islemler, 'arkon.kuyruk-sirala'] } };
    const istekler = sunucuKur(SIRALAYAN, { belgeler: { ...belgeler, pkgs: [tp(1, 1, 2), tp(2, 2, 1), tp(3, 3, 3)] } });
    arkonAc('/arkon/planlama');
    const b = await bolum('Plan Kuyruğu');
    const s1 = await within(b).findByRole('region', { name: 'Şerit S1' }, { timeout: 10000 });
    expect(within(s1).queryByRole('group', { name: 'Canlı plan S1' })).toBeNull();
    fireEvent.click(within(b).getByRole('checkbox', { name: 'Planla karşılaştır' }));
    const plan = await within(s1).findByRole('group', { name: 'Canlı plan S1' });
    const satirlar = plan.querySelectorAll('.tc-ay3-plan-satir');
    expect([...satirlar].map((x) => x.getAttribute('aria-label'))).toEqual(['E-10 Planda 1. · geri alındı', 'E-20 Planda 2. · öne alındı', 'E-30 Planla aynı · 3.']);
    expect([...satirlar].map((x) => x.getAttribute('data-fark'))).toEqual(['farkli', 'farkli', null]);
    expect(within(plan).queryAllByRole('button')).toEqual([]);
    const kuyruk = within(s1).getByRole('group', { name: 'Kuyruk S1' });
    expect([...kuyruk.querySelectorAll('.tc-ay3-kart')].map((x) => x.getAttribute('data-kayma'))).toEqual(['tmi-ie-2', 'tmi-ie-1', 'tmi-ie-3']);
    expect(within(kuyruk).getAllByRole('button', { name: 'Aşağı' }).length).toBe(3);
    fireEvent.click(within(b).getByRole('checkbox', { name: 'Planla karşılaştır' }));
    await waitFor(() => { expect(within(s1).queryByRole('group', { name: 'Canlı plan S1' })).toBeNull(); });
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('Sıra değişince kartlar eski yerinden kayar: yer farkı karta yazılır', async () => {
    const yerler = new Map<string, number>();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const k = this.dataset.kayma;
      const ust = k ? [...(this.parentElement?.children ?? [])].indexOf(this) * 100 : 0;
      if (k) yerler.set(k, ust);
      return { top: ust, left: 0, right: 0, bottom: ust, width: 0, height: 0, x: 0, y: ust, toJSON: () => ({}) } as DOMRect;
    });
    const pkgs = belgeler.pkgs.map((x) => ({ ...x, govde: { ...x.govde } }));
    sunucuKur(YONETICI, { belgeler: { ...belgeler, pkgs } });
    arkonAc('/arkon/planlama');
    const b = await bolum('Plan Kuyruğu');
    const s1 = await within(b).findByRole('region', { name: 'Şerit S1' }, { timeout: 10000 });
    await within(s1).findByLabelText('E-1 Parça A');
    pkgs[0]!.govde.seq = 30;
    fireEvent.click(within(s1).getAllByRole('button', { name: 'Aşağı' })[0]!);
    await waitFor(() => {
      expect([...s1.querySelectorAll('.tc-ay3-kart')].map((x) => x.getAttribute('data-kayma'))).toEqual(['p2', 'p1']);
    }, { timeout: 10000 });
    const k1 = within(s1).getByLabelText('E-1 Parça A');
    const k2 = within(s1).getByLabelText('E-2 Parça B');
    expect(k1.style.getPropertyValue('--kayma-y')).toBe('-100px');
    expect(k2.style.getPropertyValue('--kayma-y')).toBe('100px');
  }, 30000);

  it('Kuyruk salt okunurdur: yönetici de taşıyamaz', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/kuyruk');
    const b = await bolum('Kuyruk');
    expect(await within(b).findByText('E-2', { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryAllByRole('button', { name: /aşağı|yukarı|Taşı/i })).toEqual([]);
  }, 20000);

  it('Kuyruk şeridi: istasyon kodu kendi satırında, boş istasyonda "İş yok" kutusu; dolu şeritte kutu yok', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/kuyruk');
    const b = await bolum('Kuyruk');
    const bos = await within(b).findByRole('region', { name: 'Şerit S2' }, { timeout: 10000 });
    expect(bos.querySelector('.tc-ay3-serit-bas > b')?.textContent).toBe('S2');
    expect(within(bos).getByText('İş yok').classList.contains('tc-ay3-serit-bos')).toBe(true);
    const dolu = within(b).getByRole('region', { name: 'Şerit S1' });
    expect(dolu.querySelector('.tc-ay3-serit-bos')).toBeNull();
  }, 20000);

  it('Kuyruk telefonda (618e): görünüm seçenekleri "Görünüm" düğmesinin altında, istasyonun şeridi en üstte; genişte seçenekler açıktır', async () => {
    vi.stubGlobal('innerWidth', 360);
    localStorage.setItem('arkon:station', JSON.stringify('S2'));
    try {
      sunucuKur(YONETICI, { belgeler });
      arkonAc('/kuyruk');
      const b = await bolum('Kuyruk');
      const gorunum = await within(b).findByRole('button', { name: 'Görünüm' }, { timeout: 10000 });
      expect(within(b).queryByRole('checkbox', { name: 'Tamamlananları göster' })).toBeNull();
      fireEvent.click(gorunum);
      expect(gorunum.getAttribute('aria-expanded')).toBe('true');
      expect(within(b).getByRole('checkbox', { name: 'Tamamlananları göster' })).toBeTruthy();
      const seritler = await within(b).findAllByRole('region', { name: /^Şerit / });
      expect(seritler.map((s) => s.getAttribute('aria-label'))).toEqual(['Şerit S2', 'Şerit S1']);
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  }, 20000);

  it('Kuyruk genişte: "Görünüm" düğmesi yok, seçenekler ve şerit sırası olduğu gibi', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/kuyruk');
    const b = await bolum('Kuyruk');
    expect(await within(b).findByRole('checkbox', { name: 'Tamamlananları göster' }, { timeout: 10000 })).toBeTruthy();
    expect(within(b).queryByRole('button', { name: 'Görünüm' })).toBeNull();
    const seritler = await within(b).findAllByRole('region', { name: /^Şerit / });
    expect(seritler.map((s) => s.getAttribute('aria-label'))).toEqual(['Şerit S1', 'Şerit S2']);
  }, 20000);

  it('bant "Diğer" düğmesi araç menüsünü açar, Escape ile kapanır', async () => {
    sunucuKur(YONETICI, { belgeler });
    arkonAc('/kuyruk');
    const b = await bolum('Kuyruk');
    const diger = await within(b).findByRole('button', { name: 'Diğer' }, { timeout: 10000 });
    const bant = diger.closest('.tc-ay-bant')!;
    expect(diger.getAttribute('aria-expanded')).toBe('false');
    expect(bant.hasAttribute('data-acik')).toBe(false);
    fireEvent.click(diger);
    expect(diger.getAttribute('aria-expanded')).toBe('true');
    expect(bant.hasAttribute('data-acik')).toBe(true);
    expect(document.getElementById(diger.getAttribute('aria-controls')!)?.querySelector('[aria-label="Tema değiştir"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(diger.getAttribute('aria-expanded')).toBe('false');
  }, 20000);

  it('Üretim Anomalisi açılır, kayıt yazmaz; amir rolünde sayfa açılmaz, ilk açık sayfasına geçer (eski firstPage)', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    arkonAc('/arkon/anomali');
    await bolum('Üretim Anomalisi');
    await bekle();
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    sunucuKur(AMIR, { belgeler });
    arkonAc('/arkon/anomali');
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).not.toBe('/arkon/anomali'); }, { timeout: 10000 });
    expect(screen.queryByRole('region', { name: 'Üretim Anomalisi' })).toBeNull();
  }, 30000);
});
