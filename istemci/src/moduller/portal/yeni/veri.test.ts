import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { siparis } from './ornek-veri.ts';
import { json } from './test-ortak.tsx';
import { CATISMA_ILETISI, hataMetni, kaydet, koleksiyonOku, onayKarari } from './veri.ts';

afterEach(() => { vi.unstubAllGlobals(); });

function yakala(cevap: Response = json(200, { belge: null, damga: 1 })) {
  const istekler: { adres: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => {
    istekler.push({ adres, govde: typeof s?.body === 'string' ? JSON.parse(s.body) : null });
    return cevap.clone();
  }));
  return istekler;
}

describe('portal veri katmanı', () => {
  it('var olan kaydı okunduğu sürümle, yeni kaydı "yoksa" koşuluyla yazar; kimlik ve sürüm gövdeye girmez', async () => {
    const istekler = yakala();
    await kaydet('orders', siparis({ id: 'o1', type: 'sales', surum: 4 }));
    const { surum: _s, ...yeni } = siparis({ id: 'o9', type: 'sales' });
    await kaydet('orders', yeni);
    const [ilk, ikinci] = istekler.map((i) => i.govde as { yol: string; veri: Record<string, unknown>; beklenenSurum: number | null; kip: string });
    expect(ilk?.yol).toBe('orders/o1');
    expect(ilk?.beklenenSurum).toBe(4);
    expect(ilk?.kip).toBe('tam');
    expect(ilk?.veri).not.toHaveProperty('id');
    expect(ilk?.veri).not.toHaveProperty('surum');
    expect(ikinci?.beklenenSurum).toBeNull();
  });

  it('sorgu cevabını kimlik ve sürümlü kayıtlara çevirir', async () => {
    yakala(json(200, { belgeler: [{ yol: 'ncrs/n1', kimlik: 'n1', veri: { no: 'KK-1' }, surum: 2 }], damga: 3 }));
    expect(await koleksiyonOku('ncrs')).toEqual({ n1: { no: 'KK-1', id: 'n1', surum: 2 } });
  });

  it('onay kararı yalnız karar ve notu taşır; kişi ve zaman gövdede yoktur', async () => {
    const istekler = yakala();
    await onayKarari('a1', true, 'uygun');
    expect(istekler[0]?.adres).toContain('/portal/onaylar/a1/karar');
    expect(istekler[0]?.govde).toEqual({ onay: true, not: 'uygun' });
  });

  it('sürüm çatışması ortak iletiyle, diğer hata kendi iletisiyle gösterilir', () => {
    expect(hataMetni(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'x' }), 'Kaydedilemedi.')).toBe(CATISMA_ILETISI);
    expect(hataMetni(new ApiHatasi(400, { kod: 'GECERSIZ', mesaj: 'Tutar geçersiz.' }), 'Kaydedilemedi.')).toBe('Tutar geçersiz.');
  });
});
