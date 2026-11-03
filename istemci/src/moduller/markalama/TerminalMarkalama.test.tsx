import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarkalamaTanimi } from '#paylasilan/sozlesme/markalama.ts';
import { terminalMarkalamaOku } from './TerminalMarkalama.ts';

// Terminalin okuması tek işlevdedir (2048): tanım malzeme ve operasyondan, istasyon kimliği terminalin istasyon kodundan bulunur.
afterEach(() => { vi.unstubAllGlobals(); });

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
const TANIM: MarkalamaTanimi = {
  id: 7, malzemeId: 11, malzemeKodu: 'ORN-A', opNo: 40, seriSablonu: '{PARCA}-{SEQ:5}', sayacKapsami: 'malzeme', baslangicSirasi: 1, dogrulama: false, aktif: true,
  model: null, surum: 1, degismeZamani: '2026-10-27T08:00:00Z', alanlar: [],
};

function sunucuKur(tanimlar: MarkalamaTanimi[]) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/markalama/tanimlar?')) return json({ tanimlar });
    if (yol === '/istasyonlar/secim') {
      return json({ gruplar: [{ isMerkeziId: 1, isMerkeziKod: 'DNM', isMerkeziAd: 'Deneme', istasyonlar: [{ id: 21, kod: 'DNM-L1', ad: 'Lazer 1', isMerkeziId: 1, tip: 'markalama', aktif: true }] }] });
    }
    if (yol.includes('/onizleme')) return json({ numaralar: ['ORN-A-00005'] });
    if (yol.includes('/ozet')) return json({ uretimEmriId: 5, sayilar: { saglam: 2, red: 0, rework: 0, hurda: 1 }, dogrulanan: 0 });
    if (yol.startsWith('/markalama/birimler?')) return json({ birimler: [] });
    return new Response('{}', { status: 404 });
  }));
  return yollar;
}

describe('terminal markalama okuması', () => {
  it('aktif ve aynı operasyonlu tanımı seçer; istasyon kimliğini koddan bulur', async () => {
    sunucuKur([{ ...TANIM, id: 6, opNo: 40, aktif: false }, { ...TANIM, id: 8, opNo: 50 }, TANIM]);
    const v = await terminalMarkalamaOku({ uretimEmriId: 5, opNo: 40, malzemeId: 11, istasyonKodu: 'DNM-L1' });
    expect(v.tanim?.id).toBe(7);
    expect(v.istasyonId).toBe(21);
    expect(v.siradakiler).toEqual(['ORN-A-00005']);
    expect(v.sayilar).toEqual({ saglam: 2, hurda: 1, dogrulanan: 0 });
  });

  it('tanım yoksa seri, sayı ve birim okunmaz; istasyon bilinmiyorsa kimlik boştur', async () => {
    const yollar = sunucuKur([{ ...TANIM, opNo: 50 }]);
    const v = await terminalMarkalamaOku({ uretimEmriId: 5, opNo: 40, malzemeId: 11, istasyonKodu: 'YOK-1' });
    expect(v.tanim).toBeNull();
    expect(v.istasyonId).toBeNull();
    expect(v.sayilar).toBeNull();
    expect(yollar.filter((y) => y.includes('/onizleme') || y.includes('/ozet') || y.startsWith('/markalama/birimler'))).toEqual([]);
  });
});
