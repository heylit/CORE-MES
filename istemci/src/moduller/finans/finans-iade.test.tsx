import { afterEach, describe, expect, it, vi } from 'vitest';
import { sayfaKur } from './FinansCercevesi.tsx';
import { prototipYukle } from './prototip.ts';

// 260 a, soru 273: iade olayları ve satış formundaki sipariş seçimi tam kipte köprüye doğru gövdeyi gönderir. Firma, belge ve
// sipariş uydurmadır.
type JsdomSinifi = new (html: string, secenek: Record<string, unknown>) => { window: Window & typeof globalThis };
const KOKEN = 'https://tmi.invalid';
const AYAR = {
  sirketAdi: 'Deneme', sektor: 'uretim', nakitEsigi: '0', beklenenAylikSatis: null, beklenenTahsilGunu: null, riskToleransi: 50, simulasyonSayisi: 100,
  cekKarsiliksizOlasiligi: '0.05', batikGunu: 180, anomaliEsigi: '3', agirlikLikidite: 20, agirlikNakit: 20, agirlikKarlilik: 20, agirlikVerimlilik: 20,
  agirlikBorcluluk: 20, bilancoDonen: null, bilancoStok: null, bilancoKvb: null, bilancoToplamBorc: null, bilancoOzkaynak: null, bilancoBirikmisKar: null,
  kurulumTamam: true, caprazKurPayi: '0.02', surum: 1,
};
const belge = (ek: Record<string, unknown>) => ({
  id: 1, yon: 'gelir', tur: 'fatura', kategori: 'urun_satisi', firmaId: 7, belgeNo: 'SF-1', aciklama: null, belgeTarihi: '2026-10-01', vade: '2026-11-01',
  paraBirimi: 'EUR', kur: '35.500000', tutar: '100.00', kdvOrani: '20.00', tevkifatPay: null, tevkifatPayda: null, kdvTutari: '20.00', tevkifatTutari: '0.00',
  toplam: '120.00', toplamTl: '4260.00', kapanan: '0.00', kalan: '120.00', durum: 'acik', kaynak: 'elle', logoKayitNo: null, logoEsleme: null,
  duzenliOdemeId: null, iptalNedeni: null, siparisId: 3, sevkiyatIsiId: null, iadeBelgeId: null, satinAlmaSiparisi: null, olusturma: '2026-10-01T08:00:00Z', surum: 1,
  ...ek,
});
const VERI = {
  belgeler: [belge({}), belge({ id: 2, yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', belgeNo: null, tutar: '10.00', toplam: '12.00', toplamTl: '426.00', kalan: '12.00', iadeBelgeId: 1 })],
  odemeler: [], dagitimlar: [], mahsuplar: [], cekler: [], hesaplar: [], virmanlar: [], kurlar: [], faizler: [], duzenliOdemeler: [], butce: [], esitlemeler: [],
  oneriler: [], kapanis: [], skorlar: [], sabitKiymetler: [],
  kdvOranlari: [{ oran: '20.00', gecerlilikBaslangic: '2000-01-01', gecerlilikBitis: null, surum: 1 }],
  firmalar: [{ id: 7, ad: 'Deneme Müşteri', kod: 'M1', tur: 'ikisi', aktif: true }],
  ayar: AYAR, amortisman: [], kurOzeti: { kurlar: [], faizler: [], sonGiris: null }, beklenenOdemeler: [], sirketAdi: 'Deneme',
};

let pencere: (Window & typeof globalThis) | null = null;
afterEach(() => { pencere?.close(); pencere = null; });

async function ac(): Promise<{ p: Window & typeof globalThis; istekler: { tip: string; veri: Record<string, unknown> }[] }> {
  const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
  const html = sayfaKur(await prototipYukle(), { koken: KOKEN, kapsam: 'tam', islemler: ['finans.oku', 'finans.yaz'], kullanici: { id: 5, ad: 'Deneme Muhasebe' }, tema: 'light' });
  const istekler: { tip: string; veri: Record<string, unknown> }[] = [];
  // Çerçevenin üstü kendisidir: kabuğun yerine köprü istekleri burada, betikler koşmadan kurulan yakalayıcıyla yanıtlanır.
  const yakala = (w: Window & typeof globalThis) => {
    w.scrollTo = () => undefined;
    w.postMessage = ((ileti: { kanal?: string; yon?: string; id?: number; tip?: string; veri?: Record<string, unknown> }) => {
      if (ileti?.kanal !== 'finans' || ileti.yon !== 'istek') return;
      istekler.push({ tip: String(ileti.tip), veri: ileti.veri ?? {} });
      const veri = ileti.tip === 'finans-yukle' ? VERI
        : ileti.tip === 'satis-siparisleri' ? { siparisler: [{ id: 3, no: 'SS-2026-001', durum: 'onayli', siparisTarihi: '2026-09-20', musteriSiparisNo: 'PO-9' }] }
          : ileti.tip === 'satis-sevkleri' ? { sevkler: [{ id: 11, tarih: '2026-10-08', belgeNo: 'IR-5', durum: 'tamamlandi' }, { id: 12, tarih: '2026-10-09', belgeNo: null, durum: 'planlandi' }] }
          : { belge: belge({ id: 9 }) };
      setTimeout(() => { w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'finans', yon: 'yanit', id: ileti.id, ok: true, veri }, origin: KOKEN, source: w })); }, 0);
    }) as typeof w.postMessage;
  };
  const p = new Sinif(html, { url: `${KOKEN}/`, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: yakala }).window;
  pencere = p;
  await vi.waitFor(() => { expect(istekler.some((i) => i.tip === 'finans-yukle')).toBe(true); });
  return { p, istekler };
}
// Prototipin üst düzey let/const bağları pencere özelliği değildir; genel kapsamda değerlendirilerek okunur.
const degerlendir = <T,>(p: Window & typeof globalThis, ifade: string): T => (p as unknown as { eval: (k: string) => T }).eval(ifade);
const olay = (p: Window & typeof globalThis, ad: string, firma = '') => { degerlendir(p, `openFlow(${JSON.stringify(ad)}, { party: ${JSON.stringify(firma)} })`); };
const gonder = (p: Window & typeof globalThis, id: string) => {
  const f = p.document.getElementById(id) as HTMLFormElement;
  f.dispatchEvent(new p.Event('submit', { bubbles: true, cancelable: true }));
};

describe('finans prototipi: iade ve sipariş seçimi (260 a)', () => {
  it('"Müşteri iade etti" asıl satış faturasının ters yönünde iade gövdesi gönderir; para birimi, kur ve KDV asıldan gelir', async () => {
    const { p, istekler } = await ac();
    await vi.waitFor(() => { expect(degerlendir(p, 'V !== null')).toBe(true); });
    olay(p, 'iadesat');
    const f = p.document.getElementById('ekCekmece') as HTMLFormElement;
    expect(f.querySelector('select[name=asil]')?.textContent).toContain('SF-1');
    (f.querySelector('[name=tutar]') as HTMLInputElement).value = '40';
    (f.querySelector('[name=tarih]') as HTMLInputElement).value = '2026-10-10';
    gonder(p, 'ekCekmece');
    await vi.waitFor(() => { expect(istekler.some((i) => i.tip === 'belge-ekle')).toBe(true); });
    expect(istekler.find((i) => i.tip === 'belge-ekle')?.veri['govde']).toEqual({
      yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', firmaId: 7, iadeBelgeId: 1, aciklama: null, belgeTarihi: '2026-10-10', vade: '2026-10-10',
      paraBirimi: 'EUR', kur: 35.5, tutar: 40, kdvOrani: 20,
    });
  });

  it('iade satırı asıl faturayı anar; "Tedarikçiye iade ettim" yalnız alış faturası arar', async () => {
    const { p } = await ac();
    await vi.waitFor(() => { expect(degerlendir<number>(p, 'state.tx.length')).toBeGreaterThan(0); });
    const aciklamalar = degerlendir<string[]>(p, 'state.tx.map((t) => t.desc)');
    expect(aciklamalar).toContain('İade: SF-1 (siparişe bağlı)');
    expect(aciklamalar).toContain('SF-1 (siparişe bağlı)');
    olay(p, 'iadealis');
    expect(p.document.getElementById('ekCekmece')?.textContent).toContain('iade edilecek alış faturası yok');
  });

  it('satış formu firmanın siparişlerini listeler; seçilen sipariş gövdeye siparisId olarak girer', async () => {
    const { p, istekler } = await ac();
    await vi.waitFor(() => { expect(degerlendir(p, 'V !== null')).toBe(true); });
    olay(p, 'satis', 'Deneme Müşteri');
    const f = p.document.getElementById('flowForm') as HTMLFormElement;
    await vi.waitFor(() => { expect(f.querySelector('select[name=siparis]')?.textContent).toContain('SS-2026-001 · Onaylı'); });
    expect(istekler.find((i) => i.tip === 'satis-siparisleri')?.veri).toEqual({ firmaId: 7 });
    const sevk = f.querySelector('select[name=sevk]') as HTMLSelectElement;
    expect(sevk.disabled).toBe(true);
    const siparisSec = f.querySelector('select[name=siparis]') as HTMLSelectElement;
    siparisSec.value = '3';
    siparisSec.dispatchEvent(new p.Event('change', { bubbles: true }));
    await vi.waitFor(() => { expect(sevk.textContent).toContain('IR-5'); });
    expect(istekler.find((i) => i.tip === 'satis-sevkleri')?.veri).toEqual({ siparisId: 3 });
    expect(sevk.disabled).toBe(false);
    expect(sevk.textContent).toContain('Planlandı');
    sevk.value = '11';
    (f.querySelector('[name=amount]') as HTMLInputElement).value = '100';
    gonder(p, 'flowForm');
    await vi.waitFor(() => { expect(istekler.some((i) => i.tip === 'belge-ekle')).toBe(true); });
    const govde = istekler.find((i) => i.tip === 'belge-ekle')?.veri['govde'] as Record<string, unknown>;
    expect([govde['siparisId'], govde['sevkiyatIsiId']]).toEqual([3, 11]);
  });
});
