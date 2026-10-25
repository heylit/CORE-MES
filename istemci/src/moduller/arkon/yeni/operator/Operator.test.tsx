import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, OPERATOR, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// Üretim Terminali: açılışta yazma yok; üretim yetkisi olan başlatır; yetkisi olmayan yalnız görür; önizleme hiç yazmaz.
// Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const ISTASYONLU: Deneme = { ...OPERATOR, istasyon: 'IST-1' };
const PAKET = {
  id: 'pk-deneme-1', no: 'IE-DENEME-1', opType: 'cnc', st: {}, partNo: 'DN-1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: '',
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const sunucu = (ek: { kimlik: string; surum: number; govde: unknown }[] = []) => ({
  belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...ek] },
});
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const olaylar = (l: Istek[]) => l.filter((i) => i.yol === '/arkon/kayitlar/events/ekle').flatMap((i) => (i.govde as { satirlar?: { state?: string; orderNo?: string }[] }).satirlar ?? []);
const sonuclar = (l: Istek[]) => l.filter((i) => i.yol === `/arkon/belgeler/results/${PAKET.id}/yaz`).map((i) => (i.govde as { govde: { state?: string } }).govde);
const ekran = async () => screen.findByRole('region', { name: 'Aktif iş emri' }, { timeout: 10000 });

describe('A1 Üretim Terminali', () => {
  it('açılışta yazmaz; istasyonun yayınlı işi açılır; başlatma durum kaydı yazar', async () => {
    const istekler = sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/arkon/yeni/operator');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    // Bağlantı durumu üst çubukta saatin yanında (soru 488 a); testte cihaz deposu yok, kayıt riski yazar.
    expect(screen.getByRole('status', { name: /Cihaz deposu açılamadı/ }).closest('.tc-ay1-ust')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running' && e.orderNo === 'IE-DENEME-1')).toBe(true); }, { timeout: 10000 });
    await waitFor(() => { expect(sonuclar(istekler).some((r) => r.state === 'running')).toBe(true); }, { timeout: 10000 });
  }, 40000);

  it('üretim yetkisi olmayan kişi yalnız görür: sayım ve durum düğmeleri yok, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(ISTASYONLU, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { operator: ['page.op'] } } }]));
    arkonAc('/arkon/yeni/operator');
    await ekran();
    expect(await screen.findByText('Bu rol üretim kaydı yapamaz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Başlat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /İyi \+1/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Toplu giriş' })).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('okutma penceresi kamerayı kendiliğinden açar (eski davranış, 283.5)', async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    try {
      // Ayrı kimlik: önceki testlerin yerel kopyasındaki CNC paketi yerine geçmesin.
      const depo = { ...PAKET, id: 'pk-deneme-depo', no: 'IE-DENEME-2', opType: 'depo', st: { items: [{ id: 'k1', code: 'DN-K1', name: 'Deneme kalem', qty: 2, loc: 'R-1', unit: 'adet' }] } };
      sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: depo.id, surum: 1, govde: depo }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
      arkonAc('/arkon/yeni/operator');
      await ekran();
      fireEvent.click(await screen.findByRole('button', { name: /QR/ }, { timeout: 10000 }));
      expect(await screen.findByRole('dialog', { name: 'Ürün kodunu okut' })).toBeTruthy();
      await waitFor(() => { expect(getUserMedia).toHaveBeenCalled(); });
    } finally {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  }, 40000);

  it('önizleme paketi kimliğiyle açar, yazma düğmesi göstermez ve yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc(`/arkon/yeni/onizle/${PAKET.id}`);
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Başlat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çağrı' })).toBeNull();
    expect(screen.queryByText('Bu rol üretim kaydı yapamaz')).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);
});
