import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UretimHazirligiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { MALZEME_TESLIM_AC, cevapla } from './baglanti.ts';
import type { Istemci, IstekGirdisi } from './baglanti.ts';
import { hazirlikMetni } from './kurallar.ts';
import { adimCevabiUygula, adimYaz, tmiEmirId } from '../../../../arkon/web/src/data/tmi-adim.ts';

// Arkon operatör ekranı Üretim Terminali'nin yaptığını yapar: talimat adımı TMI'ye yazılır, başlatmadan önce girdi istasyonda mı sorulur.

interface Cagri { yontem: 'GET' | 'POST'; yol: string; govde?: unknown }
function istemciKur(cevaplar: Record<string, unknown>): { istemci: Istemci; cagrilar: Cagri[] } {
  const cagrilar: Cagri[] = [];
  const bul = (yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    cagrilar.push({ yontem, yol, ...(govde === undefined ? {} : { govde }) });
    const anahtar = Object.keys(cevaplar).find((k) => `${yontem} ${yol}` === k);
    if (anahtar === undefined) throw new Error(`beklenmeyen istek: ${yontem} ${yol}`);
    return cevaplar[anahtar];
  };
  const istemci = { get: async <T,>(yol: string) => bul('GET', yol) as T, post: async <T,>(yol: string, govde?: unknown) => bul('POST', yol, govde) as T } as Istemci;
  return { istemci, cagrilar };
}
const istek = (yontem: string, yol: string, govde?: unknown): IstekGirdisi => ({ yontem, yol, sorgu: new URLSearchParams('c=c1'), govde });

const ADIM = (id: number, tamam: boolean) => ({ id, sira: id, ad: `Adım ${id}`, aciklama: null, tamam, tamamlayan: null, tamamlanma: null });
const SECIM = { gruplar: [{ isMerkeziId: 1, isMerkeziKod: 'TAL', isMerkeziAd: 'Talaşlı', istasyonlar: [{ id: 9, kod: 'TZG-04', ad: 'Torna', isMerkeziId: 1 }] }] };
const EKSIK: UretimHazirligiCevabi = {
  hazir: false,
  eksikler: [{ malzemeId: 31, kod: 'HM-1', ad: null, gereken: '1', istasyonda: '0', yerler: [{ konum: 'A-01', miktar: '5', konumId: 4, istasyonId: null, buEmrin: false }], istek: { id: 2, no: 'MI-7', durum: 'acik' } }],
};

afterEach(() => { vi.restoreAllMocks(); });

describe('talimat adımı TMI\'ye yazılır', () => {
  it('adımlar emrin ayrıntısından okunur, işaret Üretim Terminali\'nin tamamla ucuna gider', async () => {
    const { istemci, cagrilar } = istemciKur({
      'GET /uretim-emirleri/12': { emir: {}, kayitlar: [], adimlar: [ADIM(1, false), ADIM(2, true)] },
      'POST /uretim-emirleri/12/adimlar/1/tamamla': { emir: {}, adimlar: [ADIM(1, true), ADIM(2, true)] },
    });
    expect((await cevapla(istemci, istek('GET', '/tmi-adimlar/12'))).govde).toEqual([ADIM(1, false), ADIM(2, true)]);
    const c = await cevapla(istemci, istek('POST', '/tmi-adimlar/12/1', JSON.stringify({ tamam: true })));
    expect(c.govde).toEqual([ADIM(1, true), ADIM(2, true)]);
    expect(cagrilar[1]).toEqual({ yontem: 'POST', yol: '/uretim-emirleri/12/adimlar/1/tamamla', govde: { tamam: true } });
  });

  it('işaretsiz ya da geçersiz emirli istek TMI\'ye gitmez', async () => {
    const { istemci, cagrilar } = istemciKur({});
    expect((await cevapla(istemci, istek('POST', '/tmi-adimlar/12/1', JSON.stringify({})))).durum).toBe(400);
    expect((await cevapla(istemci, istek('GET', '/tmi-adimlar/abc'))).durum).toBe(400);
    expect(cagrilar).toEqual([]);
  });

  it('iyimser işaret: cevaptan yalnız o adım alınır, öbür bekleyen işaret ezilmez', () => {
    const l = adimYaz(adimYaz([ADIM(1, false), ADIM(2, false)], 1, (a) => ({ ...a, tamam: true })), 2, (a) => ({ ...a, tamam: true }));
    // Sunucu 1'i yazdı, 2 henüz yazılmadı: cevaptaki 2 eski haliyle gelir.
    expect(adimCevabiUygula(l, 1, [ADIM(1, true), ADIM(2, false)]).map((a) => a.tamam)).toEqual([true, true]);
  });

  it('emir paketten bulunur: tmi-ue doğrudan, tmi-ie paketinde tmi.emirId; yerel paket null', () => {
    expect(tmiEmirId({ id: 'tmi-ue-12' })).toBe(12);
    expect(tmiEmirId({ id: 'tmi-ie-40', tmi: { emirId: 12 } })).toBe(12);
    expect(tmiEmirId({ id: 'seed-fln120' })).toBeNull();
    expect(tmiEmirId(null)).toBeNull();
  });
});

describe('başlatmadan önce eksik girdi', () => {
  it('olay adı Malzeme · Teslim panelinin dinlediği ad', () => { expect(MALZEME_TESLIM_AC).toBe('tmi:malzeme-teslim-ac'); });

  it('eksikse uyarı metni döner (110 b), Malzeme · Teslim paneli o malzemeyle açılır', async () => {
    const olaylar: unknown[] = [];
    const dinle = (e: Event) => { olaylar.push((e as CustomEvent).detail); };
    window.addEventListener(MALZEME_TESLIM_AC, dinle);
    const { istemci, cagrilar } = istemciKur({ 'GET /istasyonlar/secim': SECIM, 'POST /stok/uretim-hazirligi': EKSIK });
    const c = await cevapla(istemci, istek('POST', '/uretim-hazirligi', JSON.stringify({ emirId: 12, istasyon: 'TZG-04' })));
    window.removeEventListener(MALZEME_TESLIM_AC, dinle);
    expect(c.govde).toEqual({ hazir: false, metin: hazirlikMetni(EKSIK) });
    expect(hazirlikMetni(EKSIK)).toBe('Girdi istasyonda yok: HM-1 (A-01 konumunda, istek MI-7). İstasyona istek açıldı; Teslim al ekranında görünür. İş uyarıyla başladı; depo isteği karşılayınca stok düzelir.');
    expect(cagrilar[1]).toEqual({ yontem: 'POST', yol: '/stok/uretim-hazirligi', govde: { uretimEmriId: 12, istasyonId: 9 } });
    expect(olaylar).toEqual([{ istasyonId: 9, uretimEmriId: 12, malzemeId: 31 }]);
  });

  it('hazırsa başlatılır; istasyon kişinin seçebildikleri arasında yoksa denetlenmez, sunucu karar verir', async () => {
    const hazir = istemciKur({ 'GET /istasyonlar/secim': SECIM, 'POST /stok/uretim-hazirligi': { hazir: true, eksikler: [] } });
    expect((await cevapla(hazir.istemci, istek('POST', '/uretim-hazirligi', JSON.stringify({ emirId: 12, istasyon: 'TZG-04' })))).govde).toEqual({ hazir: true });
    const yok = istemciKur({ 'GET /istasyonlar/secim': SECIM });
    expect((await cevapla(yok.istemci, istek('POST', '/uretim-hazirligi', JSON.stringify({ emirId: 12, istasyon: 'FRZ-01' })))).govde).toEqual({ hazir: true, denetlenmedi: true });
    expect(yok.cagrilar.map((x) => x.yol)).toEqual(['/istasyonlar/secim']);
  });
});
