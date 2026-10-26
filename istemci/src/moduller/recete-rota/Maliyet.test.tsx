import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Birim maliyetler Finans'tan gelir ve oraya yazılır (kart #1187). Prototip gerçekten koşar; köprü gerçektir, sunucu taklittir. Veriler uydurmadır.
type Kalem = NonNullable<DurumCevabi['items']>[number];
type Maliyet = NonNullable<DurumCevabi['maliyet']>;
const kalem = (kayitNo: number, code: string, name: string, type: Kalem['type']): Kalem => (
  { id: String(kayitNo), kayitNo, code, name, type, unit: 'adet', cost: null, stock: 10, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true });
const girdi = (birimMaliyet: string, surum: number, paraBirimi = 'TRY') => ({ birimMaliyet, paraBirimi, surum });

function durumKur(maliyet: Maliyet | null): DurumCevabi {
  return {
    items: [kalem(11, 'HM-0001', 'Deneme sac', 'ham'), kalem(12, 'HM-101', 'Deneme boru', 'ham'), kalem(13, 'HM-0003', 'Deneme profil', 'ham')],
    units: [{ kod: 'adet', aktif: true }],
    opdefs: [],
    wcs: [{ id: '1', code: 'IM-1', name: 'Talaşlı', week: null, aktif: true }],
    stations: [{ id: '31', code: 'IS-31', name: 'Lazer', wcId: '1', eff: 100, opPer: 1, count: 1, cost: null, aktif: true }],
    machines: [],
    people: [{ id: '21', name: 'Ayşe Deneme', code: null, role: null, stationId: '31', stationAtama: false, wcId: '1', shiftId: null, skills: ['31'], cost: null, active: true }],
    cal: { shifts: [], holidays: [] }, routes: null, routeRevs: null, maliyet, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], malzemeKesildi: false,
  };
}

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Gerçek biçimli sunucu taklidi: durum ucu bellekteki duruma bakar, yazmalar onu değiştirir.
function sunucuKur(baslangic: Record<string, unknown>, durum: () => unknown, yaz: (yontem: string, yol: string, govde: unknown) => Response | null = () => null): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici: YAZAR } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: baslangic, surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, durum());
    const ozel = yaz(yontem, yol, govde);
    if (ozel) return ozel;
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Eski belge: kimlikleri uid biçiminde; bir kalem ve bir operasyon kartla/katalogla aynı kodda, biri değil.
function eskiBelge(): Record<string, unknown> {
  const adim = (id: string, opId: string, girdi: string) => ({ id, seq: 10, opId, stationId: 's1', setup: 5, cycle: 2, proc: 2, chg: null, ins: [{ id: `n${id}`, itemId: girdi, qty: 1, scrap: 0, status: '' }], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', outItem: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-31', name: 'Lazer', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    opdefs: [{ id: 'dEsli', code: 'KES-LZR', abbr: 'LZR', name: 'Eski lazer', stationId: 's1', setup: 9, cycle: 3, proc: 3, chg: null }, { id: 'dYalniz', code: 'OP-010', abbr: 'XYZ', name: 'Eski yalnız', stationId: 's1', setup: 1, cycle: 1, proc: 1, chg: null }],
    items: [
      { id: 'iEsli', code: 'YM-0001', name: 'Eski gövde', type: 'yari', unit: 'adet', cost: 7, stock: 0, min: 0 },
      { id: 'iHam', code: 'HM-101', name: 'Eski ham', type: 'ham', unit: 'kg', cost: 3, stock: 0, min: 0 },
      { id: 'iMM', code: 'MM-301', name: 'Eski ürün', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 },
    ],
    routes: { iEsli: { base: 1, steps: [adim('p1', 'dEsli', 'iHam')] }, iMM: { base: 1, steps: [adim('p2', 'dYalniz', 'iEsli')] } },
  };
}

async function ekranAc(durum: () => unknown, yaz?: (y: string, yol: string, g: unknown) => Response | null, belge: Record<string, unknown> = eskiBelge()) {
  const istekler = sunucuKur(belge, durum, yaz);
  koprusunuKur();
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const sekme = (ad: string) => { ifade(`(act("tab", {tab:"${ad}"}), 1)`); };
  const tikla = (k: string) => { const el = b.querySelector<HTMLElement>(k); expect(el, k).not.toBeNull(); fireEvent.click(el!); };
  const degistir = (k: string, v: string) => { const el = b.querySelector<HTMLInputElement | HTMLSelectElement>(k); expect(el, k).not.toBeNull(); fireEvent.change(el!, { target: { value: v } }); };
  const yaz2 = (k: string, v: string) => { const el = b.querySelector<HTMLInputElement>(k); expect(el, k).not.toBeNull(); el!.value = v; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  // Bağlı durum köprüden gelince bağlı işareti oluşur.
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  return { b, ifade, sekme, tikla, degistir, yaz2, bildirim, istekler };
}

// Gerçek kabuğun yaptığını yapar: çerçevenin köprü isteklerini gerçek köprüyle (kopruKur) yanıtlar; kayıt yazma iletileri yanıtsız kalır.
let koprusuDinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI);
  koprusuDinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown } | null;
    if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || typeof m.id !== 'number' || (m.tip !== 'durum-oku' && m.tip !== 'komut' && m.tip !== 'kaynak-oku')) return;
    // jsdom iletinin kaynağını doldurmaz; yanıt, prototipi koşturan çerçeveye kaynağı ana pencere olarak elle iletilir.
    const cerceve = Array.from(document.querySelectorAll('iframe')).reverse().find((f) => f.getAttribute('srcdoc') === null);
    const yanit = (govde: Record<string, unknown>) => {
      const w = cerceve?.contentWindow as (Window & { MessageEvent: typeof MessageEvent }) | null | undefined;
      if (!w) return;
      w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: w.parent }));
    };
    isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (h: unknown) => { yanit({ ok: false, ...kopruHatasi(h) }); });
  };
  window.addEventListener('message', koprusuDinleyici);
}

afterEach(() => { if (koprusuDinleyici !== null) window.removeEventListener('message', koprusuDinleyici); koprusuDinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

const girisler = (e: Awaited<ReturnType<typeof ekranAc>>, tur: 'item' | 'station' | 'person') => Array.from(e.b.querySelectorAll<HTMLInputElement>(`input[data-s="${tur}"][data-f="cost"]`));
const kaynaklar = async (e: Awaited<ReturnType<typeof ekranAc>>, alt: 'wcs' | 'people') => {
  await waitFor(() => { expect(e.ifade<boolean>('KB.bagli')).toBe(true); }, { timeout: 10000 });
  e.ifade(`(ui.tab = "res", ui.resTab = "${alt}", render(), 1)`);
};
const yazilanMaliyet = (e: Awaited<ReturnType<typeof ekranAc>>) => e.istekler.filter((i) => i.yontem === 'POST' && i.yol.startsWith('/finans/maliyetler/'));

describe('birim maliyetler Finans diliminden gelir (kart #1187)', () => {
  it('dilim null (görme yetkisi yok): bağlı kalemlerin maliyet alanı boş ve kapalıdır, yerel kayıttaki örnek maliyetler taşınmaz; hiçbir yazma gitmez', async () => {
    const e = await ekranAc(() => durumKur(null));
    e.sekme('items');
    const alanlar = girisler(e, 'item');
    expect(alanlar).toHaveLength(3);
    expect(alanlar.map((a) => [a.value, a.disabled])).toEqual([['', true], ['', true], ['', true]]);
    expect(e.ifade<Array<number | null>>('st.items.filter(x=>x.bagli).map(x=>x.cost)')).toEqual([null, null, null]);
    expect(yazilanMaliyet(e)).toEqual([]);
  }, 40000);

  it('dilim dolu: satırı olan kalem değerini gösterir; satırı olmayan ve TRY dışı olan boştur (0 uydurulmaz); eski yerel maliyet (7) taşınmaz', async () => {
    const maliyet: Maliyet = { yazabilir: true, malzeme: { '11': girdi('12.5000', 3), '13': girdi('9.0000', 1, 'EUR') }, istasyon: {}, kisi: {} };
    const e = await ekranAc(() => durumKur(maliyet));
    e.sekme('items');
    const deger = (kod: string) => e.b.querySelector<HTMLInputElement>(`input[data-s="item"][data-f="cost"][data-id="${kod}"]`)?.value;
    expect([deger('11'), deger('12'), deger('13')]).toEqual(['12,5', '', '']);
    expect(e.ifade<Array<number | null>>('st.items.filter(x=>x.bagli).map(x=>x.cost)')).toEqual([12.5, null, null]);
    expect(girisler(e, 'item').every((a) => !a.disabled)).toBe(true);
  }, 40000);

  it('yazma yetkisi yoksa (yazabilir false) değer görünür ama alan kapalıdır', async () => {
    const e = await ekranAc(() => durumKur({ yazabilir: false, malzeme: { '11': girdi('12.5000', 3) }, istasyon: {}, kisi: {} }));
    e.sekme('items');
    const a = girisler(e, 'item').find((x) => x.dataset['id'] === '11');
    expect([a?.value, a?.disabled]).toEqual(['12,5', true]);
  }, 40000);

  it('malzeme maliyeti Finans ucuna köprünün sürümüyle gider: ilk giriş sürümsüz, düzeltme sürümlü; başarıda dilimden yeniden okunur', async () => {
    let maliyet: Maliyet = { yazabilir: true, malzeme: { '11': girdi('12.5000', 3) }, istasyon: {}, kisi: {} };
    const e = await ekranAc(() => durumKur(maliyet), (yontem, yol, g) => {
      const m = /^\/finans\/maliyetler\/(malzeme|istasyon|kisi)\/yaz$/.exec(yol);
      if (yontem !== 'POST' || !m) return null;
      const x = g as { anahtar: number; birimMaliyet: number; surum: number | null };
      const tur = m[1] as 'malzeme' | 'istasyon' | 'kisi';
      maliyet = { ...maliyet, [tur]: { ...maliyet[tur], [String(x.anahtar)]: girdi(x.birimMaliyet.toFixed(4), (x.surum ?? 0) + 1) } };
      return json(200, { maliyet: { anahtar: x.anahtar } });
    });
    e.sekme('items');
    const yeni = e.b.querySelector<HTMLInputElement>('input[data-s="item"][data-f="cost"][data-id="12"]')!;
    yeni.value = '8,25';
    fireEvent.change(yeni);
    await waitFor(() => { expect(e.ifade<number | null>('st.items.find(x=>x.id==="12").cost')).toBe(8.25); });
    const eski = e.b.querySelector<HTMLInputElement>('input[data-s="item"][data-f="cost"][data-id="11"]')!;
    eski.value = '20';
    fireEvent.change(eski);
    await waitFor(() => { expect(e.ifade<number | null>('st.items.find(x=>x.id==="11").cost')).toBe(20); });
    expect(yazilanMaliyet(e).map((i) => [i.yol, i.govde])).toEqual([
      ['/finans/maliyetler/malzeme/yaz', { anahtar: 12, birimMaliyet: 8.25, paraBirimi: 'TRY', surum: null }],
      ['/finans/maliyetler/malzeme/yaz', { anahtar: 11, birimMaliyet: 20, paraBirimi: 'TRY', surum: 3 }],
    ]);
    expect(e.b.querySelector<HTMLInputElement>('input[data-s="item"][data-f="cost"][data-id="12"]')?.value).toBe('8,25');
  }, 40000);

  it('boş bırakılan alan komut atmaz; sunucu reddederse (sürüm ya da yetki) iletisi gösterilir ve alan sunucudaki değerle yenilenir', async () => {
    const maliyet: Maliyet = { yazabilir: true, malzeme: { '11': girdi('12.5000', 3) }, istasyon: {}, kisi: {} };
    const e = await ekranAc(() => durumKur(maliyet), (yontem, yol) => (
      yontem === 'POST' && yol === '/finans/maliyetler/malzeme/yaz' ? json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka yerde değişti.' }) : null));
    e.sekme('items');
    const alan = () => e.b.querySelector<HTMLInputElement>('input[data-s="item"][data-f="cost"][data-id="11"]')!;
    alan().value = '';
    fireEvent.change(alan());
    expect(yazilanMaliyet(e)).toEqual([]);
    expect(alan().value).toBe('12,5');
    alan().value = '30';
    fireEvent.change(alan());
    await waitFor(() => { expect(e.bildirim()).toContain('Kayıt başka yerde değişti.'); });
    await waitFor(() => { expect(alan().value).toBe('12,5'); });
    expect(yazilanMaliyet(e)).toHaveLength(1);
  }, 40000);

  it('istasyon ve kişi saatlik maliyeti Kaynaklar sekmesinde aynı yoldan yazılır; dilim null iken alanlar boş ve kapalıdır', async () => {
    let maliyet: Maliyet | null = { yazabilir: true, malzeme: {}, istasyon: { '31': girdi('450.0000', 2) }, kisi: {} };
    const e = await ekranAc(() => durumKur(maliyet), (yontem, yol, g) => {
      if (yontem !== 'POST' || !yol.startsWith('/finans/maliyetler/') || maliyet === null) return null;
      const x = g as { anahtar: number; birimMaliyet: number; surum: number | null };
      const tur = yol.split('/')[3] as 'istasyon' | 'kisi';
      maliyet = { ...maliyet, [tur]: { ...maliyet[tur], [String(x.anahtar)]: girdi(x.birimMaliyet.toFixed(4), (x.surum ?? 0) + 1) } };
      return json(200, { maliyet: { anahtar: x.anahtar } });
    });
    await kaynaklar(e, 'wcs');
    const istasyon = girisler(e, 'station');
    expect(istasyon.map((a) => a.value)).toEqual(['450']);
    istasyon[0]!.value = '500,5';
    fireEvent.change(istasyon[0]!);
    await waitFor(() => { expect(e.ifade<number | null>('st.stations.find(x=>x.id==="31").cost')).toBe(500.5); });
    await kaynaklar(e, 'people');
    const kisi = girisler(e, 'person');
    expect(kisi.map((a) => a.value)).toEqual(['']);
    kisi[0]!.value = '95';
    fireEvent.change(kisi[0]!);
    await waitFor(() => { expect(e.ifade<number | null>('st.people.find(x=>x.id==="21").cost')).toBe(95); });
    expect(yazilanMaliyet(e).map((i) => [i.yol, i.govde])).toEqual([
      ['/finans/maliyetler/istasyon/yaz', { anahtar: 31, birimMaliyet: 500.5, paraBirimi: 'TRY', surum: 2 }],
      ['/finans/maliyetler/kisi/yaz', { anahtar: 21, birimMaliyet: 95, paraBirimi: 'TRY', surum: null }],
    ]);
    maliyet = null;
    await e.ifade('(kaynakYukle(), 1)');
    await waitFor(() => { expect(e.ifade<boolean>('MAL.m === null')).toBe(true); });
    await kaynaklar(e, 'people');
    expect(girisler(e, 'person').map((a) => [a.value, a.disabled])).toEqual([['', true]]);
  }, 60000);

  it('211 a: istasyon saat maliyetinin yalnız doğrudan gider olduğu Kaynaklar sekmesinde ve adım ayrıntısında yazar', async () => {
    const e = await ekranAc(() => durumKur({ yazabilir: true, malzeme: {}, istasyon: {}, kisi: {} }));
    await kaynaklar(e, 'wcs');
    const not = 'Doğrudan gider: enerji, bakım, sarf (amortisman ve kira genel giderde)';
    expect(e.b.body.textContent).toContain(not);
  }, 60000);
});
