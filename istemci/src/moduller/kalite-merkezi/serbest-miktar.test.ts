import { describe, expect, it, vi } from 'vitest';
import { SERBEST_MIKTAR_BETIGI } from './acilis.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });

// 320 a: Tamir ya da Olduğu gibi kullan kapanışında parti başına serbest bırakılan miktar sorulur; bütünü bırakılan parti gönderilmez.
describe('Kalite Merkezi kısmi serbest bırakma penceresi', () => {
  function kur(partiler: unknown[]) {
    const dugmeler: Record<string, { onclick?: () => void }> = { '[data-no]': {}, '[data-yes]': {} };
    const alanlar: Record<string, { value: string }> = {};
    const pencere = {
      hidden: true, innerHTML: '',
      querySelector: (s: string) => dugmeler[s] ?? (alanlar[s] ??= { value: '' }),
    };
    const asil = vi.fn(async (adres: string, _s?: unknown) => {
      if (adres.startsWith('api/karantina-partileri/')) return json(200, { partiler });
      return json(200, { version: 12 });
    });
    const g: { fetch: (a: string, s?: unknown) => Promise<Response> } = { fetch: asil };
    const toast = vi.fn();
    const kapat = vi.fn(() => { pencere.hidden = true; });
    new Function('window', 'document', 'esc', 'toast', 'closeConfirm', SERBEST_MIKTAR_BETIGI)(
      g, { getElementById: (k: string) => (k === 'modal2' ? pencere : null) }, (m: string) => m, toast, kapat,
    );
    const bekle = () => new Promise((r) => setTimeout(r, 0));
    return { g, asil, pencere, dugmeler, alanlar, toast, bekle };
  }
  const kapanis = { method: 'PUT', body: JSON.stringify({ durum: 'Kapalı', mrb: 'Tamir (müşteri onaylı)' }) };
  const partiler = [{ partiId: 4, lotNo: 'L-1', redMiktar: '5' }, { partiId: 6, lotNo: null, redMiktar: '3' }];

  it('azaltılan parti miktarıyla gider; bütünü bırakılan parti gönderilmez; geçersiz miktar uyarılır', async () => {
    const k = kur(partiler);
    const cevap = k.g.fetch('api/doc/ncr/ncr_1', kapanis);
    await k.bekle(); await k.bekle();
    expect(k.pencere.hidden).toBe(false);
    expect(k.pencere.innerHTML).toContain('Lot L-1 (red: 5)');
    expect(k.pencere.innerHTML).toContain('Lot 6 (red: 3)');
    k.alanlar['#tmiSerbest0'] = { value: '6' };
    k.alanlar['#tmiSerbest1'] = { value: '3' };
    k.dugmeler['[data-yes]']!.onclick!();
    expect(k.toast).toHaveBeenCalledWith('Miktar sıfırdan büyük ve red miktarından az ya da eşit olmalı.', 'bad');
    k.alanlar['#tmiSerbest0'] = { value: '2,5' };
    k.dugmeler['[data-yes]']!.onclick!();
    expect((await cevap).status).toBe(200);
    expect(k.asil).toHaveBeenLastCalledWith(`api/doc/ncr/ncr_1?serbest=${encodeURIComponent(JSON.stringify([{ partiId: 4, miktar: '2.5' }]))}`, kapanis);
  });

  it('vazgeçilirse kapanış gitmez; hepsi bütün bırakılırsa ve partisiz kapanışta yazma olduğu gibi gider; başka kararlar sorulmaz', async () => {
    const k = kur(partiler);
    const cevap = k.g.fetch('api/doc/ncr/ncr_1', kapanis);
    await k.bekle(); await k.bekle();
    k.dugmeler['[data-no]']!.onclick!();
    expect((await cevap).status).toBe(400);
    expect(k.asil).toHaveBeenCalledTimes(1);

    const t = kur(partiler);
    const tum = t.g.fetch('api/doc/ncr/ncr_1', kapanis);
    await t.bekle(); await t.bekle();
    t.alanlar['#tmiSerbest0'] = { value: '5' };
    t.alanlar['#tmiSerbest1'] = { value: '3' };
    t.dugmeler['[data-yes]']!.onclick!();
    await tum;
    expect(t.asil).toHaveBeenLastCalledWith('api/doc/ncr/ncr_1', kapanis);

    const bos = kur([{ partiId: 4, lotNo: 'L-1', redMiktar: '0' }]);
    await bos.g.fetch('api/doc/ncr/ncr_1', kapanis);
    expect(bos.pencere.hidden).toBe(true);
    expect(bos.asil).toHaveBeenLastCalledWith('api/doc/ncr/ncr_1', kapanis);

    for (const s of [{ method: 'PUT', body: JSON.stringify({ durum: 'Kapalı', mrb: 'Hurda' }) }, { method: 'PUT', body: JSON.stringify({ durum: 'Açık', mrb: 'Tamir' }) }]) {
      const d = kur(partiler);
      await d.g.fetch('api/doc/ncr/ncr_2', s);
      expect(d.asil).toHaveBeenCalledTimes(1);
    }
  });
});
