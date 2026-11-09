import { afterEach, describe, expect, it, vi } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, backend } from './store.ts';
import './ui.ts';
import { nextStep } from './views.ts';
import type { PurchaseRequest } from './tipler.ts';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

const talep = (status: string) => ({ id: 't1', no: 'ST-DEN-001', title: 'Deneme', status, cancelReason: 'Deneme ihtiyaç kalktı', items: [{ id: 'k' }], quotes: [], rfqs: [], log: [] }) as unknown as PurchaseRequest;
const ac = (r: PurchaseRequest, govde: string) => {
  S.requests[r.id] = r;
  S.ready = true;
  V.page = 'request'; V.id = r.id;
  document.body.innerHTML = `<div data-sa-merkez><div id="gres"></div><div id="modal-root">${govde}</div></div>`;
};

describe('2413 a: elle durum yerine İptali geri al', () => {
  it('iptal talepte sıradaki iş "İptali geri al"; başka durumda yok', () => {
    expect(nextStep(talep('cancelled')).b.map((b) => b[0])).toEqual(['req-uncancel']);
    expect(nextStep(talep('draft')).b.some((b) => b[0] === 'req-uncancel')).toBe(false);
  });

  it('gerekçesiz gönderilmez, uyarı görünür; gerekçeyle gider, pencere kapanır', async () => {
    const gonder = vi.spyOn(backend, 'iptaliGeriAl').mockResolvedValue({ durum: 'eval', turetildi: true });
    ac(talep('cancelled'), `<input id="ucx-reason" value=" "><p id="ucx-hata" hidden></p><button data-act="uncancel-req">İptali geri al</button>`);
    const dugme = document.querySelector<HTMLButtonElement>('[data-act="uncancel-req"]')!;
    dugme.click();
    expect(gonder).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('#ucx-hata')!.hidden).toBe(false);
    document.querySelector<HTMLInputElement>('#ucx-reason')!.value = 'İhtiyaç yeniden doğdu';
    dugme.click();
    expect(gonder).toHaveBeenCalledWith('t1', 'İhtiyaç yeniden doğdu');
    await vi.waitFor(() => expect(document.querySelector('#modal-root')!.innerHTML).toBe(''));
  });

  it('sunucu reddederse pencere açık kalır, düğme yeniden basılabilir', async () => {
    vi.spyOn(backend, 'iptaliGeriAl').mockResolvedValue(null);
    ac(talep('cancelled'), `<input id="ucx-reason" value="Gerekçe"><p id="ucx-hata" hidden></p><button data-act="uncancel-req">İptali geri al</button>`);
    const dugme = document.querySelector<HTMLButtonElement>('[data-act="uncancel-req"]')!;
    dugme.click();
    expect(dugme.disabled).toBe(true);
    await vi.waitFor(() => expect(dugme.disabled).toBe(false));
    expect(document.querySelector('#modal-root')!.innerHTML).not.toBe('');
  });
});
