import { afterEach, describe, expect, it, vi } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, backend } from './store.ts';
import './ui.ts';
import type { PurchaseRequest } from './tipler.ts';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('KD-019 siparişteki kalemi değiştir', () => {
  it('"Değiştir" seçilen kalemi, miktarı, birimi ve gerekçeyi gönderir; pencere kapanınca seçim kaybolmaz', async () => {
    const r = { id: 't1', no: 'ST-2026-001', title: 'Deneme', items: [], quotes: [], rfqs: [], log: [] } as unknown as PurchaseRequest;
    S.requests[r.id] = r;
    S.ready = true;
    V.page = 'request'; V.id = r.id;
    const gonder = vi.spyOn(backend, 'siparisKalemiDegistir').mockResolvedValue(false);
    document.body.innerHTML = `<div data-sa-merkez><div id="gres"></div><div id="modal-root">
      <select id="oc-item"><option value="k1">Birinci</option><option value="k2" selected>İkinci</option></select>
      <input id="oc-qty" value="5"><input id="oc-unit" value="adet"><input id="oc-reason" value="İhtiyaç arttı">
      <button data-act="order-item-save">Değiştir</button></div></div>`;
    document.querySelector<HTMLButtonElement>('[data-act="order-item-save"]')!.click();
    expect(gonder).toHaveBeenCalledWith('t1', 'k2', 5, 'adet', 'İhtiyaç arttı');
    expect(document.querySelector('#modal-root')!.innerHTML).toBe('');
  });
});
