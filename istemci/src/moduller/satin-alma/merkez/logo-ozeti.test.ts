import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SiparisLogoOzeti } from '#paylasilan/sozlesme/logo.ts';
import { faturaOzeti, irsaliyeOzeti, logoOzetleriniOku } from './logo-ozeti.ts';

const ozet = (o: Partial<SiparisLogoOzeti>): SiparisLogoOzeti => ({
  siparisNo: 'SP-DEN-1', logoda: true, irsaliyeler: [], irsaliyeliKalem: 0, farkliKalem: 0, faturalar: null,
  kalemler: [{ siparisSatiriId: 1, kalemAdi: 'Deneme', siparisMiktari: '10', birim: 'adet', coreMiktari: '0', logoMiktari: '0', logoBirimi: 'adet', durum: 'bekliyor', fark: '0' }],
  ...o,
});
const ACIK = { irsaliye: true, fatura: true, sonOkuma: null };

afterEach(() => { vi.unstubAllGlobals(); });

describe('3384 a: Logo özeti metni', () => {
  it('fatura okunmadıysa (null) "Fatura yok" yazılmaz; okunmuş ve boşsa yazılır; birden çoksa ilki ve sayısı', () => {
    expect(faturaOzeti(ozet({ faturalar: null }))).toBeNull();
    expect(faturaOzeti(ozet({ faturalar: [] }))).toBe('Fatura yok');
    expect(faturaOzeti(ozet({ faturalar: ['ORN-F-1', 'ORN-F-2'] }))).toBe('Fatura ORN-F-1 +1');
    expect(faturaOzeti(ozet({ logoda: false, faturalar: [] }))).toBeNull();
  });

  it('irsaliye yoksa "İrsaliye bekleniyor"; varsa n/m kalem ve fark; okuma kapalıysa yazılmaz', () => {
    expect(irsaliyeOzeti(ozet({}), ACIK)).toEqual({ metin: 'İrsaliye bekleniyor', fark: false });
    expect(irsaliyeOzeti(ozet({ irsaliyeliKalem: 1, farkliKalem: 1 }), ACIK)).toEqual({ metin: 'İrsaliye 1/1 kalem · 1 kalemde fark', fark: true });
    expect(irsaliyeOzeti(ozet({}), { ...ACIK, irsaliye: false })).toBeNull();
  });

  it('200 siparişten çoğu parçalara bölünür (sunucu tek istekte 200 alır)', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      istekler.push(adres);
      return new Response(JSON.stringify({ okuma: ACIK, siparisler: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const nolar = Array.from({ length: 201 }, (_, i) => `SP-DEN-${String(i)}`);
    await logoOzetleriniOku([...nolar, 'SP-DEN-0', '']);
    expect(istekler).toHaveLength(2);
    expect(istekler.map((a) => decodeURIComponent(a.split('nolar=')[1] ?? '').split(',').length)).toEqual([200, 1]);
  });
});
