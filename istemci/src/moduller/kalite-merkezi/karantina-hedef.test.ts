import { describe, expect, it, vi } from 'vitest';
import { KARANTINA_HEDEF_BETIGI } from './acilis.ts';

const ILETI = 'Partinin karantinadan önceki konumu bilinmiyor; serbest bırakılacak konumu seçin.';
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });

// KM-K90: önceki konum bilinmiyorsa NCR kapanışı konum seçimiyle bir kez daha gider; vazgeçilirse ilk ret uygulamaya döner.
describe('Kalite Merkezi karantina hedef konumu', () => {
  function kur(ilk: Response) {
    const dugmeler: Record<string, { onclick?: () => void }> = { '[data-no]': {}, '[data-yes]': {} };
    const secim = { value: '' };
    const pencere = {
      hidden: true, innerHTML: '',
      querySelector: (s: string) => (s === '#tmiKarantinaHedef' ? secim : dugmeler[s]),
    };
    const asil = vi.fn(async (adres: string, _s?: unknown) => {
      if (adres === 'api/karantina-konumlari') return json(200, { konumlar: [{ id: 7, kod: 'DEP-1', ad: 'Ana depo' }] });
      if (adres.includes('karantinaHedef=')) return json(200, { version: 12 });
      return ilk.clone();
    });
    const g: { fetch: (a: string, s?: unknown) => Promise<Response> } = { fetch: asil };
    const toast = vi.fn();
    const kapat = vi.fn(() => { pencere.hidden = true; });
    new Function('window', 'document', 'esc', 'toast', 'closeConfirm', KARANTINA_HEDEF_BETIGI)(
      g, { getElementById: (k: string) => (k === 'modal2' ? pencere : null) }, (m: string) => m, toast, kapat,
    );
    const bekle = () => new Promise((r) => setTimeout(r, 0));
    return { g, asil, pencere, dugmeler, secim, toast, bekle };
  }
  const put = { method: 'PUT', body: '{"durum":"Kapalı"}' };

  it('seçilen konumla aynı yazma bir kez daha gider ve onun cevabı döner', async () => {
    const k = kur(json(422, { hata: ILETI }));
    const cevap = k.g.fetch('api/doc/ncr/ncr_1', put);
    await k.bekle(); await k.bekle();
    expect(k.pencere.hidden).toBe(false);
    expect(k.pencere.innerHTML).toContain('DEP-1 Ana depo');
    k.dugmeler['[data-yes]']!.onclick!();
    expect(k.toast).toHaveBeenCalledWith('Konum seçin.', 'bad');
    k.secim.value = '7';
    k.dugmeler['[data-yes]']!.onclick!();
    expect((await cevap).status).toBe(200);
    expect(k.asil).toHaveBeenLastCalledWith('api/doc/ncr/ncr_1?karantinaHedef=7', put);
  });

  it('kapanış partiyi serbest bırakamadıysa nedeni tek satır gösterilir; uyarısız kayıtta gösterilmez', async () => {
    const k = kur(json(200, { version: 3, uyari: 'Parti karantinada kaldı: NCR dışı red var.' }));
    expect((await k.g.fetch('api/doc/ncr/ncr_1', put)).status).toBe(200);
    expect(k.toast).toHaveBeenCalledWith('Parti karantinada kaldı: NCR dışı red var.', 'bad');
    const d = kur(json(200, { version: 4 }));
    await d.g.fetch('api/doc/ncr/ncr_1', put);
    expect(d.toast).not.toHaveBeenCalled();
  });

  it('vazgeçilirse ilk ret döner; başka ret, başka koleksiyon ve okuma dokunulmadan geçer', async () => {
    const k = kur(json(422, { hata: ILETI }));
    const cevap = k.g.fetch('api/doc/ncr/ncr_1', put);
    await k.bekle(); await k.bekle();
    k.dugmeler['[data-no]']!.onclick!();
    expect((await cevap).status).toBe(422);
    for (const [ilk, adres, s] of [
      [json(422, { hata: 'Başka bir neden.' }), 'api/doc/ncr/ncr_2', put],
      [json(422, { hata: ILETI }), 'api/doc/capa/c1', put],
      [json(422, { hata: ILETI }), 'api/doc/ncr/ncr_3', { method: 'DELETE' }],
    ] as const) {
      const d = kur(ilk);
      expect((await d.g.fetch(adres, s)).status).toBe(422);
      expect(d.asil).toHaveBeenCalledTimes(1);
    }
  });
});
