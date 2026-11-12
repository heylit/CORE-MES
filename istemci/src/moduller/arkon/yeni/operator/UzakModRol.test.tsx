import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { arkonAc, OPERATOR, sunucuKur, YONETICI, type Deneme } from '../test-ortak.tsx';

// 2031 a: 45 sn dokunulmayan Üretim Terminali uzak moda kendiliğinden yalnız operatörde geçer; öteki rollerde ekran olduğu gibi kalır.
// Süre Date.now ileri alınarak geçirilir. Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const PAKET = {
  id: 'pk-deneme-uzak', no: 'IE-DENEME-U1', opType: 'cnc', st: {}, partNo: 'DN-U1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: '',
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const sunucu = { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } };

let ileri = 0;
const gercekSimdi = Date.now.bind(Date);
async function bekletVeAc(d: Deneme, kabuktaki = false) {
  sunucuKur({ ...d, istasyon: 'IST-1' }, sunucu);
  arkonAc('/uretim-terminali', { kabuktaki });
  await screen.findByRole('region', { name: 'Aktif iş emri' }, { timeout: 10000 });
  ileri = 60000;
  vi.spyOn(Date, 'now').mockImplementation(() => gercekSimdi() + ileri);
}

describe('Uzak mod kendiliğinden açılması (2031 a)', () => {
  it('operatörde 45 sn dokunulmazsa uzak mod açılır (izinli)', async () => {
    await bekletVeAc(OPERATOR);
    await waitFor(() => { expect(screen.getByRole('dialog', { name: 'Uzak mod' })).toBeTruthy(); }, { timeout: 5000 });
  }, 40000);

  it('yöneticide 45 sn dokunulmasa da uzak mod açılmaz (reddedilen)', async () => {
    await bekletVeAc(YONETICI);
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.queryByRole('dialog', { name: 'Uzak mod' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Aktif iş emri' })).toBeTruthy();
  }, 40000);

  // 3110: terminal kalıcı rotadır, başka sayfadayken gizli kurulu kalır; uzak mod yalnız terminal sayfasındayken açılır.
  it('terminal sayfasındayken (kabuktaki gibi) uzak mod açılır; başka sayfaya geçince kapanır', async () => {
    await bekletVeAc(OPERATOR, true);
    await waitFor(() => { expect(screen.getByRole('dialog', { name: 'Uzak mod' })).toBeTruthy(); }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: 'Başka sayfaya git' }));
    await screen.findByText('Başka sayfa');
    expect(screen.queryByRole('dialog', { name: 'Uzak mod' })).toBeNull();
  }, 40000);

  it('başka sayfadayken 45 sn geçse de uzak mod açılmaz; dönüşte süre yeniden sayılır', async () => {
    await bekletVeAc(OPERATOR, true);
    ileri = 0;
    // Arkon sayfaları operatörü terminale geri yönlendirebilir; Arkon dışı bir sayfaya gidilir ki terminal gerçekten gizli kalsın.
    fireEvent.click(screen.getByRole('link', { name: 'Başka sayfaya git' }));
    await screen.findByText('Başka sayfa');
    expect(screen.getByRole('region', { name: 'Aktif iş emri', hidden: true }).closest('[hidden]')).not.toBeNull();
    ileri = 120000;
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.getByTestId('adres').textContent).toBe('/baska-sayfa');
    expect(screen.queryByRole('dialog', { name: 'Uzak mod' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Terminale dön' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/uretim-terminali'); });
    await new Promise((r) => setTimeout(r, 2500));
    expect(screen.queryByRole('dialog', { name: 'Uzak mod' })).toBeNull();
    ileri = 180000;
    await waitFor(() => { expect(screen.getByRole('dialog', { name: 'Uzak mod' })).toBeTruthy(); }, { timeout: 5000 });
  }, 60000);
});
