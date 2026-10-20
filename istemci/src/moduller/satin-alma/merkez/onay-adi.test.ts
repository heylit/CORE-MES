import { afterEach, describe, expect, it, vi } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V } from './store.ts';
import { transport } from './tasiyici.ts';
import './ui.ts';
import type { PurchaseRequest } from './tipler.ts';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; S.me = null; });

const kur = (alanDegeri: string, not: string) => {
  const r = { id: 't1', no: 'ST-2026-001', title: 'Deneme', status: 'approval', items: [], quotes: [], rfqs: [], log: [], award: { mode: 'single', quoteId: 'q1', approvals: [] } } as unknown as PurchaseRequest;
  S.requests[r.id] = r; S.ready = true; S.me = { id: 'u7', email: 'm@x', name: 'Oturum Kişisi' };
  V.page = 'request'; V.id = r.id;
  const yaz = vi.spyOn(transport, 'write').mockImplementation(() => undefined);
  vi.spyOn(transport, 'canWrite').mockReturnValue(true);
  document.body.innerHTML = `<div data-sa-merkez><div id="gres"></div><div id="toast"></div><div id="undo"></div>
    <input id="ap-name" value="${alanDegeri}" readonly><input id="ap-note" value="${not}">
    <button data-act="approve">Onayla</button><button data-act="reject">Reddet</button></div>`;
  return { yaz };
};

describe('SA onaylayan adı: oturumdan gelir, alandaki metin yok sayılır', () => {
  it('onay: yazılan kayıtta ve hareket metninde elle yazılan ad yok, oturum kişisi var', () => {
    const { yaz } = kur('Uydurma Kisi', 'tamam');
    document.querySelector<HTMLButtonElement>('[data-act="approve"]')!.click();
    const yazilan = yaz.mock.calls[0]![2] as PurchaseRequest;
    expect(yazilan.award!.approvals![0]!.name).toBe('Oturum Kişisi');
    expect(yazilan.log.at(-1)!.t).toBe('Onaylandı: tamam');
    expect(JSON.stringify(yazilan)).not.toContain('Uydurma Kisi');
  });
  it('ret: aynı kural', () => {
    const { yaz } = kur('Uydurma Kisi', 'vade kısa');
    document.querySelector<HTMLButtonElement>('[data-act="reject"]')!.click();
    const yazilan = yaz.mock.calls[0]![2] as PurchaseRequest;
    expect(yazilan.award!.approvals![0]!.name).toBe('Oturum Kişisi');
    expect(yazilan.log.at(-1)!.t).toBe('Reddedildi: vade kısa');
    expect(JSON.stringify(yazilan)).not.toContain('Uydurma Kisi');
  });
});
