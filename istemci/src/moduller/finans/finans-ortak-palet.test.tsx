import { describe, expect, it, vi } from 'vitest';
import { sayfaKur } from './FinansCercevesi.tsx';
import { prototipYukle } from './prototip.ts';

// Karar 102 a: Ctrl K kabuğun ortak paletidir. Finansın paleti çerçevede kalmaz: Ctrl K kabuğa gider, "Kayıt" ve "Komut"
// grupları paletin "Bu sayfa" grubuna, yazılanın sonuçları önerilere. Kişi adı uydurmadır.
type JsdomSinifi = new (html: string, secenek: Record<string, unknown>) => { window: Window & typeof globalThis };
const KOKEN = 'https://tmi.invalid';
interface Ileti { kanal?: unknown; yon?: unknown; tip?: unknown; sira?: unknown; komutlar?: { anahtar: string; baslik: string }[] }

// Tam kapsam açılışta finans verisini köprüden okur; boş defter yeter.
const AYAR = {
  sirketAdi: 'Deneme', sektor: 'uretim', nakitEsigi: '0', beklenenAylikSatis: null, beklenenTahsilGunu: null, riskToleransi: 50, simulasyonSayisi: 100,
  cekKarsiliksizOlasiligi: '0.05', batikGunu: 180, anomaliEsigi: '3', agirlikLikidite: 20, agirlikNakit: 20, agirlikKarlilik: 20, agirlikVerimlilik: 20,
  agirlikBorcluluk: 20, bilancoDonen: null, bilancoStok: null, bilancoKvb: null, bilancoToplamBorc: null, bilancoOzkaynak: null, bilancoBirikmisKar: null,
  kurulumTamam: true, caprazKurPayi: '0.02', surum: 1,
};
const VERI = {
  belgeler: [], odemeler: [], dagitimlar: [], mahsuplar: [], cekler: [], hesaplar: [], virmanlar: [], kurlar: [], faizler: [], duzenliOdemeler: [], butce: [],
  esitlemeler: [], oneriler: [], kapanis: [], skorlar: [], sabitKiymetler: [], kdvOranlari: [{ oran: '20.00', gecerlilikBaslangic: '2000-01-01', gecerlilikBitis: null, surum: 1 }],
  firmalar: [{ id: 7, ad: 'Deneme Müşteri', kod: 'M1', tur: 'ikisi', aktif: true }], ayar: AYAR, amortisman: [], kurOzeti: { kurlar: [], faizler: [], sonGiris: null },
  beklenenOdemeler: [], sirketAdi: 'Deneme',
};

async function cerceve(kapsam: 'tam' | 'firma') {
  const Sinif = (globalThis as unknown as { jsdom: { constructor: JsdomSinifi } }).jsdom.constructor;
  const html = sayfaKur(await prototipYukle(), { koken: KOKEN, kapsam, islemler: kapsam === 'tam' ? ['finans.oku', 'finans.yaz'] : [], kullanici: { id: 5, ad: 'Deneme Okuyan' }, tema: 'light' });
  const giden: Ileti[] = [];
  // Üst pencere testte çerçevenin kendisidir: giden iletiler betikler koşmadan kurulan yakalayıcıdan okunur, köprü istekleri yanıtlanır.
  const yakala = (w: Window & typeof globalThis) => {
    w.scrollTo = () => undefined;
    w.postMessage = ((ileti: Ileti & { id?: number }) => {
      giden.push(ileti);
      if (ileti.kanal !== 'finans' || ileti.yon !== 'istek') return;
      const veri = ileti.tip === 'finans-yukle' ? VERI : {};
      setTimeout(() => { w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'finans', yon: 'yanit', id: ileti.id, ok: true, veri }, origin: KOKEN, source: w })); }, 0);
    }) as typeof w.postMessage;
  };
  const p = new Sinif(html, { url: `${KOKEN}/`, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: yakala }).window;
  const ilet = (data: unknown, origin = KOKEN) => { p.dispatchEvent(new p.MessageEvent('message', { data, origin, source: p })); };
  await vi.waitFor(() => { expect(giden.some((i) => i.tip === 'komutlar')).toBe(true); });
  return { p, giden, ilet };
}

describe('Finans paleti ortak palette', () => {
  it('Ctrl K finansın paletini açmaz, kabuğa gider; başka tuş kabuğa gitmez', async () => {
    const { p, giden } = await cerceve('tam');
    for (const ayar of [{ ctrlKey: true }, { metaKey: true }]) {
      const tus = new p.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...ayar });
      p.document.body.dispatchEvent(tus);
      expect(tus.defaultPrevented).toBe(true);
    }
    expect(p.document.getElementById('palette')).toBeNull();
    expect(giden.filter((i) => i.yon === 'kisayol')).toEqual([
      { kanal: 'finans', yon: 'kisayol', tus: 'arama' }, { kanal: 'finans', yon: 'kisayol', tus: 'arama' },
    ]);
    p.document.body.dispatchEvent(new p.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
    p.document.body.dispatchEvent(new p.KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(giden.filter((i) => i.yon === 'kisayol')).toHaveLength(2);
    p.close();
  });

  it('kayıt ve komutlar listelenir; yazılana öneri döner, seçilen öneri kaydı açar; bilinmeyen anahtar ve yabancı köken çalışmaz', async () => {
    const { p, giden, ilet } = await cerceve('tam');
    const liste = giden.filter((i) => i.tip === 'komutlar').at(-1)?.komutlar ?? [];
    expect(liste.map((k) => k.baslik)).toEqual(expect.arrayContaining(['Satış yaptım', 'Müşteriden para geldi', 'Kayıtları Excel\'e aktar']));
    expect(liste.length).toBeLessThanOrEqual(40);
    ilet({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'para geldi', sira: 3 });
    const oneri = giden.filter((i) => i.tip === 'komut-onerileri').at(-1);
    expect(oneri?.sira).toBe(3);
    const geldi = oneri?.komutlar?.find((k) => k.baslik === 'Müşteriden para geldi');
    expect(geldi).toBeDefined();
    const cekmece = p.document.getElementById('drawer')!;
    expect(cekmece.hidden).toBe(true);
    ilet({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: 'oneri-99' });
    ilet({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: geldi!.anahtar }, 'https://baska.invalid');
    expect(cekmece.hidden).toBe(true);
    ilet({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-calistir', anahtar: geldi!.anahtar });
    expect(cekmece.hidden).toBe(false);
    p.close();
  });

  it('firma kapsamında palet kapalıdır: komut listesi ve öneriler boş, Ctrl K yine kabuğa gider', async () => {
    const { p, giden, ilet } = await cerceve('firma');
    expect(giden.filter((i) => i.tip === 'komutlar').every((i) => i.komutlar?.length === 0)).toBe(true);
    ilet({ kanal: 'tmi-gorunum', surum: 1, tip: 'komut-metni', metin: 'satış', sira: 1 });
    expect(giden.filter((i) => i.tip === 'komut-onerileri').at(-1)?.komutlar).toEqual([]);
    p.document.body.dispatchEvent(new p.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(giden.filter((i) => i.yon === 'kisayol')).toHaveLength(1);
    p.close();
  });
});
