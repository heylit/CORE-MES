import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { arkonAc, OPERATOR, sunucuKur } from '../test-ortak.tsx';

// 3575: uzak modun dev sayacı üretim istasyonunun işidir; depo istasyonunda (toplama, mal kabul, yükleme) operatörde 45 sn
// dokunulmasa da kendiliğinden açılmaz, elle düğme açar. Kalite istasyonu kurallar.test.ts'te. Tesis ayarı dosya içinde önbelleğe
// alındığı için bu dosya yalnız depo istasyonuyla açılır. Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const PAKET = {
  id: 'pk-deneme-depo', no: 'IE-DENEME-D1', opType: 'depo', st: {}, partNo: 'DN-D1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Toplama', machine: 'IST-D',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: '',
  plan: [], steps: [{ id: 's1', t: 'Topla', d: '', r: true }],
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'DEP', name: 'Deneme depo' }], sts: [{ id: 'IST-D', name: 'Deneme depo yeri', wc: 'DEP', t: 'depo' }], mcs: [] };
const sunucu = { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } };

describe('Uzak mod depo istasyonunda (3575)', () => {
  it('operatörde 45 sn dokunulmasa da kendiliğinden açılmaz; elle düğme açar (reddedilen)', async () => {
    sunucuKur({ ...OPERATOR, istasyon: 'IST-D' }, sunucu);
    arkonAc('/uretim-terminali');
    await screen.findAllByRole('button', { name: 'Uzak mod' }, { timeout: 10000 });
    await act(async () => {});
    const gercekSimdi = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => gercekSimdi() + 120000);
    await new Promise((r) => setTimeout(r, 3000));
    expect(screen.queryByRole('dialog', { name: 'Uzak mod' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Uzak mod' })[0]!);
    expect(screen.getByRole('dialog', { name: 'Uzak mod' })).toBeTruthy();
  }, 40000);
});
