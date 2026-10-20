import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Emir türü ve bölme kuralları prototipin kendi emirlerindedir (üretim-emirleri modülüne dokunmaz). Örnek veriler uydurmadır:
// beş adımlı tek mamul, tek vardiyalı iş merkezi, üç istasyon.
const ADIMLAR = ['KES', 'TRN', 'FRZ', 'TAS', 'KON'] as const;

interface Secenek { eskiEmir?: boolean; girdiStok?: number; araStok?: number }
function depo({ eskiEmir = true, girdiStok, araStok }: Secenek) {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${(i % 3) + 1}`, setup: 10, cycle: 1, ins: [...(i === 0 ? [HAM_GIRDISI] : []), ...(i === 2 && girdiStok !== undefined ? [{ id: 'n1', itemId: 'h1', qty: 1, scrap: 0, status: '' }] : [])], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 2, 3].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    opdefs: ADIMLAR.map((ad, i) => ({ id: `d${i + 1}`, code: `OP-${i + 1}`, abbr: ad, name: `Adım ${ad}`, stationId: `s${(i % 3) + 1}`, setup: 10, cycle: 1 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 },
      ...(girdiStok !== undefined ? [{ id: 'h1', code: 'HM-001', name: 'Deneme ham madde', type: 'ham', unit: 'kg', cost: 2, stock: girdiStok, min: 0 }] : []), HAM],
    statusStock: araStok ? { i1: { 'step:p3': araStok } } : {},
    routes: { i1: { base: 1, steps: ADIMLAR.map((_, i) => adim(i)) } },
    // Türsüz eski kayıt: Seri sayılmalı.
    orders: eskiEmir ? [{ id: 'o_eski', no: 'UE-2020-001', itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1 }] : [],
  };
}

type Emir = { id: string; no: string; qty: number; status: string; tur: string; priority: number; parentId?: string; kol?: { n: number; m: number } };
type Pencere = Window & { eval: (k: string) => unknown } & Record<string, (...a: unknown[]) => unknown>;

async function ekranAc(secenek: Secenek | boolean = {}) {
  const sec = typeof secenek === 'boolean' ? { eskiEmir: secenek } : secenek;
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(sec), surum: 1 }]);
  ac('/recete-rota');
  const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const saf = <T,>(ad: string, ...a: unknown[]): T => JSON.parse(JSON.stringify(pencere[ad]!(...a))) as T;
  const tikla = (k: string) => { belge.querySelector('#toasts')?.replaceChildren(); const el = belge.querySelector<HTMLElement>(k); expect(el, k).not.toBeNull(); fireEvent.click(el!); };
  const yaz = (k: string, v: string) => { const el = belge.querySelector<HTMLInputElement | HTMLSelectElement>(k); expect(el, k).not.toBeNull(); el!.value = v; };
  const bildirim = () => Array.from(belge.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  pencere.scrollTo = () => undefined;
  ifade('(act("tab", {tab:"orders"}), 1)');
  const emirler = () => ifade<Emir[]>('st.orders');
  const emirAc = (alanlar: Record<string, string>, miktar = '100') => {
    if (!belge.querySelector('#noQty')) tikla('[data-act="newOrderToggle"]');
    yaz('#noQty', miktar);
    for (const [k, v] of Object.entries(alanlar)) yaz(k, v);
    tikla('[data-act="createOrder"]');
  };
  const detayAc = (id: string) => { const el = belge.querySelector<HTMLElement>(`[data-act="orderDetail"][data-id="${id}"]`); if (el && el.getAttribute('aria-expanded') !== 'true') fireEvent.click(el); };
  const plan = () => ifade<{ id: string; adimlar: { seq: number; start: number; end: number; qty: number; outCard: { itemId: string; status: string } }[] }[]>('curPlan().list.map(R=>({id:R.order.id, adimlar:R.entries.map(x=>({seq:x.seq,start:x.start,end:x.end,qty:x.qty,outCard:x.outCard}))}))');
  return { belge, ifade, saf, tikla, yaz, bildirim, emirler, emirAc, detayAc, plan };
}
type Ekran = Awaited<ReturnType<typeof ekranAc>>;
// Bölme ekranı etkileşimleri: kol rota şeridinde iki dokunuşla, parti kutularla, katılma adımı tek dokunuşla seçilir.
const acik = (e: Ekran) => e.ifade<string>('ui.openOrder');
const girdi = (e: Ekran, k: string, v: string) => { const el = e.belge.querySelector<HTMLInputElement>(k); expect(el, k).not.toBeNull(); el!.value = v; fireEvent.input(el!); };
const git = (e: Ekran, id: string) => { if (acik(e) !== id) e.tikla(`[data-act="orderDetail"][data-id="${id}"]`); };
const turSec = (e: Ekran, h: string, tur: 'parti' | 'kol') => {
  const d = e.belge.querySelector<HTMLElement>(`[data-act="bolmeTur"][data-h="${h}"][data-v="${tur}"]`);
  expect(d, tur).not.toBeNull();
  if (d!.getAttribute('aria-pressed') !== 'true') fireEvent.click(d!);
};
const adimTikla = (e: Ekran, h: string, i: string) => e.tikla(`[data-act="bolmeAdim"][data-h="${h}"][data-i="${i}"]`);
const kolSec = (e: Ekran, h: string, n: string, m: string, q = '20') => {
  turSec(e, h, 'kol');
  e.tikla(`[data-act="bolmeTemizle"][data-h="${h}"]`);
  adimTikla(e, h, n); adimTikla(e, h, m);
  girdi(e, `[data-bolme="${h}"] [data-bolme-girdi="kolQ"]`, q);
};
const kolKur = (e: Ekran, n: string, m: string, q = '20') => { const h = acik(e); kolSec(e, h, n, m, q); e.tikla(`[data-act="emirBolKol"][data-id="${h}"]`); };
const partiSec = (e: Ekran, h: string, miktarlar: string[]) => {
  turSec(e, h, 'parti');
  while (e.belge.querySelectorAll(`[data-bolme="${h}"] [data-bolme-girdi="parti"]`).length < miktarlar.length) e.tikla(`[data-act="bolmePartiEkle"][data-h="${h}"]`);
  miktarlar.forEach((v, i) => { girdi(e, `[data-bolme="${h}"] [data-bolme-girdi="parti"][data-i="${i}"]`, v); });
};
const partiBol = (e: Ekran, metin: string) => { const h = acik(e); partiSec(e, h, metin.split(/\s+/)); e.tikla(`[data-act="emirBolMiktar"][data-id="${h}"]`); };
const katilBagla = (e: Ekran, m: string) => {
  const h = acik(e);
  if (e.ifade<string | null>('ui.katil || null') !== h) e.tikla(`[data-act="katilAc"][data-id="${h}"]`);
  e.tikla(`[data-act="emirKolBirlestir"][data-id="${h}"][data-m="${m}"]`);
};
const ozet = (e: Ekran, h: string) => Array.from(e.belge.querySelectorAll(`[data-bolme="${h}"] .bl-tablo tbody tr`)).map((tr) => [tr.querySelector('th')!.textContent, ...Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? '')]);
const adimOf = (p: { adimlar: { seq: number; start: number; end: number; qty: number }[] }, seq: number) => p.adimlar.find((a) => a.seq === seq)!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Reçete ve Rota emir kuralları (saf)', () => {
  it('parti miktarları: eşit bölme artanı ilk partiye verir, elle miktar toplamı tutmalı, geçersiz sayılar Türkçe reddedilir', async () => {
    const e = await ekranAc(false);
    expect(e.saf('partiMiktarlari', 100, 3, [])).toEqual({ ok: true, parcalar: [34, 33, 33] });
    expect(e.saf('partiMiktarlari', 100, 1, [])).toEqual({ ok: true, parcalar: [100] });
    expect(e.saf('partiMiktarlari', 100, 1, [40, 60])).toEqual({ ok: true, parcalar: [40, 60] });
    expect(e.saf('partiMiktarlari', 100, 1, [40, 50])).toEqual({ ok: false, ileti: 'Parti miktarları toplamı (90) emir miktarına (100) eşit olmalı.' });
    expect(e.saf('partiMiktarlari', 100, 0, [])).toEqual({ ok: false, ileti: 'Parti sayısı 1 ile 20 arasında olmalı.' });
    expect(e.saf('partiMiktarlari', 2, 3, [])).toEqual({ ok: false, ileti: 'Parti sayısı (3) emir miktarını (2) aşamaz.' });
    expect(e.saf('miktarListesiOku', '30; 20+10,5')).toEqual({ ok: true, liste: [30, 20, 10.5] });
    expect(e.saf('miktarListesiOku', '30 x')).toEqual({ ok: false, ileti: 'Miktarlar sayı olmalı: "x".' });
  }, 30000);

  it('miktarla bölme: toplam aşılamaz, ana emirde miktar kalmalı, kol miktarı kalandan küçük kalmalı; başlamış emir uyarı onayı ister; bitmiş emir bölünmez', async () => {
    const e = await ekranAc(false);
    const g = { qty: 100, bolunen: [30, 20], durum: 'serbest', baslamis: false, onay: false, parcaVar: false, enBuyukKol: 0 };
    const ileti = (a: object) => e.saf<{ ileti: string }>('emirMiktarBol', { ...g, ...a }).ileti;
    expect(e.saf('emirMiktarBol', g)).toEqual({ ok: true, kalan: 50, parcalar: [30, 20] });
    expect(ileti({ bolunen: [60, 50] })).toBe('Alt emir miktarları toplamı (110) emir miktarını (100) aşıyor.');
    expect(ileti({ bolunen: [100] })).toBe('Ana emirde en az bir miktar kalmalı: toplam 100 bölünemez.');
    expect(ileti({ bolunen: [0] })).toBe('Alt emir miktarlarının her biri sıfırdan büyük olmalı.');
    expect(ileti({ bolunen: [] })).toBe('Alt emir miktarını gir.');
    expect(ileti({ durum: 'tamam' })).toBe('Tamamlanan emir bölünemez.');
    expect(ileti({ enBuyukKol: 50 })).toContain('Kol miktarı (50) ana emirde kalan miktardan (50) küçük olmalı');
    expect(e.saf('emirMiktarBol', { ...g, enBuyukKol: 49 })).toEqual({ ok: true, kalan: 50, parcalar: [30, 20] });
    expect(e.saf('emirMiktarBol', { ...g, baslamis: true })).toMatchObject({ ok: false, onayGerek: true });
    expect(e.saf('emirMiktarBol', { ...g, baslamis: true, onay: true })).toEqual({ ok: true, kalan: 50, parcalar: [30, 20] });
    expect(ileti({ baslamis: true, onay: true, parcaVar: true })).toBe('Operasyon parçası bölünmüş adım var; önce parçaları birleştirin.');
  }, 30000);

  it('kol: M<=N, tek adımlık boşluk, rota dışı adım, miktar, başlamış adım, çakışma ve emrin kendi aralığı dışı engellenir', async () => {
    const e = await ekranAc(false);
    const g = { durum: 'serbest', adimSayisi: 5, n: 2, m: 4, q: 20, qty: 50, mevcut: [], baslamisAdimlar: [] };
    const ileti = (a: object) => e.saf<{ ileti: string }>('kolDogrula', { ...g, ...a }).ileti;
    expect(e.saf('kolDogrula', g)).toEqual({ ok: true });
    expect(ileti({ n: 4, m: 4 })).toBe('Birleşme adımı (4) ayrılma adımından (4) sonra olmalı.');
    expect(ileti({ n: 4, m: 2 })).toBe('Birleşme adımı (2) ayrılma adımından (4) sonra olmalı.');
    expect(ileti({ n: 2, m: 3 })).toBe('Kol en az bir adım taşımalı: birleşme adımı ayrılma adımından en az 2 sonra olmalı.');
    expect(ileti({ n: 2, m: 6 })).toBe('Birleşme adımı rotadaki adım sayısını (5) aşamaz.');
    expect(ileti({ n: 0, m: 3 })).toBe('Ayrılma adımı 1 ya da daha büyük olmalı.');
    expect(ileti({ n: 1.5, m: 4 })).toBe('Ayrılma ve birleşme adımı tam sayı olmalı.');
    expect(ileti({ q: null })).toBe('Kol miktarını gir.');
    expect(ileti({ q: 0 })).toBe('Kol miktarı sıfırdan büyük olmalı.');
    expect(ileti({ q: 50 })).toBe('Kol miktarı (50) ana emirde kalan miktarı (50) aşıyor; ana emirde en az bir miktar kalmalı.');
    expect(ileti({ baslamisAdimlar: [3] })).toBe('3. adımın üretimi başlamış ya da bitmiş; bu adım kola alınamaz.');
    expect(e.saf('kolDogrula', { ...g, baslamisAdimlar: [1, 2, 4] })).toEqual({ ok: true });
    expect(ileti({ mevcut: [{ n: 1, m: 3, qty: 5 }] })).toBe('Bu aralık 1. adımdan ayrılan mevcut kolla çakışıyor.');
    expect(e.saf('kolDogrula', { ...g, n: 1, m: 3, mevcut: [{ n: 3, m: 5, qty: 5 }] })).toEqual({ ok: true });
    expect(e.saf('kolDogrula', { ...g, mevcut: [{ n: 2, m: 4, qty: 20 }] })).toEqual({ ok: true });
    expect(ileti({ q: 31, mevcut: [{ n: 2, m: 4, qty: 20 }] })).toContain('ana emirde kalan miktarı (30) aşıyor');
    expect(ileti({ n: 1, m: 4, ust: { lo: 2, hi: 4 } })).toBe('Kol bu emrin adımları (2..4) içinde kalmalı.');
    expect(e.saf('kolDogrula', { ...g, n: 2, m: 4, ust: { lo: 2, hi: 4 } })).toEqual({ ok: true });
    expect(ileti({ durum: 'iptal' })).toBe('İptal edilen emirden kol ayrılamaz.');
  }, 30000);

  it('kolu ana emre başka adımda bağlama ve alt emri geri katma kuralları', async () => {
    const e = await ekranAc(false);
    const g = { durum: 'serbest', n: 2, mEski: 5, mYeni: 4, adimSayisi: 5, kolBaslamis: [], anaBaslamis: [], mevcut: [], kolKolMax: 0 };
    const ileti = (a: object) => e.saf<{ ileti: string }>('kolBirlestirDogrula', { ...g, ...a }).ileti;
    expect(e.saf('kolBirlestirDogrula', g)).toEqual({ ok: true });
    expect(ileti({ mYeni: 6 })).toBe('Birleşme adımı rotadaki adım sayısını (5) aşamaz.');
    expect(ileti({ mYeni: 5 })).toBe('Kol zaten 5. adımda birleşiyor.');
    expect(ileti({ mYeni: 3 })).toBe('Kol en az bir adım taşımalı: birleşme adımı ayrılma adımından en az 2 sonra olmalı.');
    expect(ileti({ kolBaslamis: [3, 4] })).toBe('Kol 4. adımın üretimine başlamış; en erken 5. adımda birleşebilir.');
    expect(ileti({ anaBaslamis: [4] })).toBe('Ana emir 4. adıma gelmiş; kol 4. adımda ana emre bağlanamaz.');
    expect(e.saf('kolBirlestirDogrula', { ...g, anaBaslamis: [3] })).toEqual({ ok: true });
    expect(ileti({ kolKolMax: 4 })).toContain('Kolun alt kolu 4. adıma kadar uzanıyor');
    expect(e.saf<{ ileti: string }>('altGeriDogrula', { kolMu: false, altDurum: 'serbest', altBaslamis: true, anaDurum: 'serbest' }).ileti).toBe('Üretime başlamış ya da tamamlanmış alt emir geri alınamaz.');
    expect(e.saf<{ ileti: string }>('altGeriDogrula', { kolMu: false, altDurum: 'serbest', altBaslamis: false, anaDurum: 'serbest', altKolVar: true }).ileti).toBe('Alt emrin kolları var; önce kolları geri alın.');
  }, 30000);
});

describe('Reçete ve Rota emir türü, parti ve adım kolu (ekran)', () => {
  it('emir türü açarken seçilir (varsayılan Seri), listede görünür ve süzülür; türsüz eski kayıt Seri sayılır', async () => {
    const e = await ekranAc();
    expect(e.emirler()[0]!.tur).toBe('seri');
    e.tikla('[data-act="newOrderToggle"]');
    expect(Array.from(e.belge.querySelectorAll<HTMLOptionElement>('#noTur option')).map((o) => o.textContent)).toEqual(['FAI', 'Seri', 'Prototip', 'Numune']);
    expect(e.belge.querySelector<HTMLSelectElement>('#noTur')!.value).toBe('seri');
    e.tikla('[data-act="newOrderToggle"]');
    e.emirAc({ '#noTur': 'fai' });
    await waitFor(() => { expect(e.emirler()).toHaveLength(2); });
    expect(e.emirler().map((x) => x.tur)).toEqual(['seri', 'fai']);
    expect(e.belge.querySelector('.orow .tur.t-fai')?.textContent).toBe('FAI');
    expect(e.belge.querySelector('.orow .tur.t-seri')?.textContent).toBe('Seri');
    e.tikla('[data-act="orderTur"][data-v="fai"]');
    expect(e.belge.querySelectorAll('.orow')).toHaveLength(1);
    expect(e.belge.querySelector('.orow .tur')?.textContent).toBe('FAI');
    e.tikla('[data-act="orderTur"][data-v="numune"]');
    expect(e.belge.querySelectorAll('.orow')).toHaveLength(0);
    e.tikla('[data-act="orderTur"][data-v="seri"]');
    expect(e.belge.querySelectorAll('.orow')).toHaveLength(1);
    // Açık emrin ayrıntısında tür değiştirilebilir.
    e.tikla('[data-act="orderTur"][data-v="tum"]');
    e.detayAc('o_eski');
    e.yaz('select[data-f="tur"]', 'numune');
    fireEvent.change(e.belge.querySelector('select[data-f="tur"]')!);
    expect(e.emirler()[0]!.tur).toBe('numune');
    expect(e.ifade('normalize({orders:[{id:"x",itemId:"i1",qty:1}]}).orders[0].tur')).toBe('seri');
  }, 40000);

  it('emir türünü değiştirmek planı etkilemez: canlı plan taslak senaryoya alınmaz', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    e.yaz('select[data-f="tur"]', 'prototip');
    fireEvent.change(e.belge.querySelector('select[data-f="tur"]')!);
    expect(e.ifade('!!ui.studio')).toBe(false);
    expect(e.emirler()[0]!.tur).toBe('prototip');
  }, 40000);

  it('partili açma: eşit bölünce artan ana emirde kalır, partiler ana emre bağlı alt emir olur, toplam korunur; aşan toplam reddedilir', async () => {
    const e = await ekranAc(false);
    e.tikla('[data-act="newOrderToggle"]');
    partiSec(e, 'yeni', ['', '']);
    e.tikla('[data-act="bolmeEsit"][data-h="yeni"]');
    expect(Array.from(e.belge.querySelectorAll<HTMLInputElement>('[data-bolme="yeni"] [data-bolme-girdi="parti"]')).map((i) => i.value)).toEqual(['33', '33']);
    expect(e.belge.querySelector<HTMLInputElement>('[data-bolme="yeni"] [data-bolme-kalan]')!.value).toBe('34');
    expect(e.belge.querySelector('#noPartiSay')).toBeNull();
    expect(e.belge.querySelector('#noKolN')).toBeNull();
    e.emirAc({ '#noTur': 'prototip' });
    await waitFor(() => { expect(e.emirler()).toHaveLength(3); });
    const [ana, a1, a2] = e.emirler() as [Emir, Emir, Emir];
    expect([ana.qty, a1.qty, a2.qty]).toEqual([34, 33, 33]);
    expect([a1.parentId, a2.parentId]).toEqual([ana.id, ana.id]);
    expect([a1.tur, a2.tur]).toEqual(['prototip', 'prototip']);
    expect(ana.parentId).toBeUndefined();
    expect(e.belge.querySelector('.eyap')?.textContent).toContain('Parti toplamı: ana emir 34 + alt emirler 66 = 100');
    // Alt emirler listede ana emrin altında girintili satırdır.
    const satirlar = Array.from(e.belge.querySelectorAll('.orow'));
    expect(satirlar.map((r) => r.classList.contains('alt'))).toEqual([false, true, true]);
    expect(satirlar[1]!.textContent).toContain('Parti');
    expect(satirlar[1]!.textContent).toContain('bütün adımlar');
    // Alt emirden ana emre gidilir.
    git(e, a1.id);
    expect(e.belge.querySelector(`[data-act="emirGit"][data-id="${ana.id}"]`)?.textContent).toBe(`Ana emir ${ana.no}`);
    e.tikla('[data-act="newOrderToggle"]');
    partiSec(e, 'yeni', ['60', '50']);
    expect(e.belge.querySelector('[data-bolme="yeni"] .bl-uyari')?.textContent).toContain('Alt emir miktarları toplamı (110) emir miktarını (100) aşıyor.');
    e.emirAc({});
    expect(e.bildirim()).toContain('Alt emir miktarları toplamı (110) emir miktarını (100) aşıyor.');
    expect(e.emirler()).toHaveLength(3);
  }, 40000);

  it('var olan emir sonradan miktarla bölünür; değişiklik taslak senaryoya yazılır ve stüdyoda onaylanınca canlıya geçer; alt emir geri katılabilir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    partiBol(e, '30 30');
    expect(e.bildirim()).toContain('Alt emir miktarları toplamı (60) emir miktarını (50) aşıyor.');
    expect(e.emirler()).toHaveLength(1);
    partiBol(e, '20 10');
    const [ana, a1, a2] = e.emirler() as [Emir, Emir, Emir];
    expect([ana.qty, a1.qty, a2.qty]).toEqual([20, 20, 10]);
    expect([a1.parentId, a2.parentId]).toEqual(['o_eski', 'o_eski']);
    expect(a1.no).not.toBe(a2.no);
    expect(e.ifade('!!ui.studio')).toBe(true);
    expect(e.ifade('live.orders.map(o=>o.qty)')).toEqual([50]);
    e.ifade('(() => { const i = ui.studio; studioAct("publishScenario", {id: i}); studioAct("publishScenario", {id: i}); return 1; })()');
    await waitFor(() => { expect(e.ifade('!!ui.studio')).toBe(false); });
    expect(e.emirler().map((x) => x.qty)).toEqual([20, 20, 10]);
    e.ifade('(ui.orderFilter = "tum", ui.openOrder = "o_eski", act("tab", {tab: "orders"}), 1)');
    git(e, a2.id);
    e.tikla(`[data-act="emirAltGeri"][data-id="${a2.id}"]`);
    expect(e.emirler().map((x) => x.qty)).toEqual([30, 20]);
  }, 40000);

  it('başlamış emir uyarı onayıyla bölünür: biten adım alt emirde de biter, ilerleme miktara oranla dağılır', async () => {
    const e = await ekranAc();
    e.ifade('(st.opStatus["o_eski|root|p1"]="tamam", st.opProg["o_eski|root|p2"]=20, 1)');
    e.detayAc('o_eski');
    partiBol(e, '10');
    expect(e.bildirim()).toContain('Üretime başlamış emir');
    expect(e.emirler()).toHaveLength(1);
    e.tikla('[data-act="emirBolMiktar"]');
    const l = e.emirler();
    expect(l.map((x) => x.qty)).toEqual([40, 10]);
    const alt = l[1]!.id;
    expect(e.ifade(`st.opStatus["${alt}|root|p1"]`)).toBe('tamam');
    expect(e.ifade('st.opStatus["o_eski|root|p1"]')).toBe('tamam');
    expect(e.ifade('st.opProg["o_eski|root|p2"]')).toBeCloseTo(16, 6);
    expect(e.ifade(`st.opProg["${alt}|root|p2"]`)).toBeCloseTo(4, 6);
  }, 40000);

  it('adım kolu miktar taşır: kol N+1..M-1 adımlarını q adetle yapar, ana emir kalanla aynı adımları sürdürür, M. adımda ikisini bekler', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    expect([kol.kol, kol.parentId, kol.qty, kol.tur]).toEqual([{ n: 2, m: 4 }, 'o_eski', 20, 'seri']);
    const ana = e.plan().find((p) => p.id === 'o_eski')!, kp = e.plan().find((p) => p.id === kol.id)!;
    expect(ana.adimlar.map((a) => a.seq)).toEqual([10, 20, 30, 40, 50]);
    expect(ana.adimlar.map((a) => a.qty)).toEqual([50, 50, 30, 50, 50]);
    expect(kp.adimlar.map((a) => [a.seq, a.qty])).toEqual([[30, 20]]);
    expect(adimOf(kp, 30).start).toBeGreaterThanOrEqual(adimOf(ana, 20).end - 1e-6);
    expect(adimOf(ana, 40).start).toBeGreaterThanOrEqual(Math.max(adimOf(ana, 30).end, adimOf(kp, 30).end) - 1e-6);
    expect(adimOf(kp, 30)).toMatchObject({ outCard: { itemId: HAM.id, status: 'step:p3' } });
    expect(e.belge.querySelector('.orow.alt .aralik')?.textContent).toBe('3 FRZ, 4 TAS adımında katılır');
    kolKur(e, '3', '3');
    expect(e.bildirim()).toContain('Birleşme adımı (3) ayrılma adımından (3) sonra olmalı.');
    kolKur(e, '1', '3', '5');
    expect(e.bildirim()).toContain('Bu aralık 2. adımdan ayrılan mevcut kolla çakışıyor.');
    kolKur(e, '2', '4', '30');
    expect(e.bildirim()).toContain('ana emirde kalan miktarı (30) aşıyor');
    kolKur(e, '2', '4', '');
    expect(e.bildirim()).toContain('Kol miktarını gir.');
    expect(e.emirler().filter((x) => x.kol)).toHaveLength(1);
    kolKur(e, '2', '4', '10');
    expect(e.emirler().filter((x) => x.kol)).toHaveLength(2);
    expect(adimOf(e.plan().find((p) => p.id === 'o_eski')!, 30).qty).toBe(20);
  }, 40000);

  it('kol sonradan başka adımda ana emre bağlanır; ana emir o adıma gelmişse ve kol başlamışsa engellenir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '5', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    expect(e.plan().find((p) => p.id === kol.id)!.adimlar.map((a) => a.seq)).toEqual([30, 40]);
    git(e, kol.id);
    katilBagla(e, '4');
    expect(e.emirler().find((x) => x.kol)!.kol).toEqual({ n: 2, m: 4 });
    const ana = e.plan().find((p) => p.id === 'o_eski')!, kp = e.plan().find((p) => p.id === kol.id)!;
    expect(kp.adimlar.map((a) => a.seq)).toEqual([30]);
    expect(ana.adimlar.map((a) => a.qty)).toEqual([50, 50, 30, 50, 50]);
    expect(adimOf(ana, 40).start).toBeGreaterThanOrEqual(adimOf(kp, 30).end - 1e-6);
    katilBagla(e, '4');
    expect(e.bildirim()).toContain('Kol zaten 4. adımda birleşiyor.');
    e.ifade(`(st.opStatus["${kol.id}|root|p3"]="tamam", 1)`);
    katilBagla(e, '3');
    expect(e.bildirim()).toContain('en az bir adım taşımalı');
    e.ifade('(st.opStatus["o_eski|root|p4"]="calisiyor", 1)');
    katilBagla(e, '5');
    expect(e.bildirim()).toContain('Ana emir 4. adıma gelmiş');
    expect(e.emirler().find((x) => x.kol)!.kol).toEqual({ n: 2, m: 4 });
  }, 40000);

  it('kollu emir ve kol emri de bölünür: kol emri aynı aralıkta kardeş kol açar; kolun kolu planda zincirlenir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '1', '5', '30');
    const kol = e.emirler().find((x) => x.kol)!;
    partiBol(e, '25');
    expect(e.bildirim()).toContain('Kol miktarı (30) ana emirde kalan miktardan (25) küçük olmalı');
    partiBol(e, '10');
    expect(e.emirler().find((x) => x.id === 'o_eski')!.qty).toBe(40);
    git(e, kol.id);
    partiBol(e, '10');
    const kardes = e.emirler().filter((x) => x.kol);
    expect(kardes.map((x) => [x.qty, x.parentId, x.kol])).toEqual([[20, 'o_eski', { n: 1, m: 5 }], [10, 'o_eski', { n: 1, m: 5 }]]);
    e.tikla('[data-act="emirGit"][data-id="o_eski"]');
    git(e, kol.id);
    kolKur(e, '1', '4', '5');
    expect(e.bildirim()).toContain('Kol bu emrin adımları (2..4) içinde kalmalı.');
    kolKur(e, '2', '4', '5');
    const ic = e.emirler().find((x) => x.parentId === kol.id)!;
    expect([ic.kol, ic.qty]).toEqual([{ n: 2, m: 4 }, 5]);
    const p = e.plan(), kp = p.find((q) => q.id === kol.id)!, ip = p.find((q) => q.id === ic.id)!;
    expect(ip.adimlar.map((a) => a.seq)).toEqual([30]);
    expect(adimOf(ip, 30).start).toBeGreaterThanOrEqual(adimOf(kp, 20).end - 1e-6);
    expect(adimOf(kp, 40).start).toBeGreaterThanOrEqual(adimOf(ip, 30).end - 1e-6);
    expect(adimOf(kp, 30).qty).toBe(15);
  }, 50000);

  it('bekleyen ara stok kollu emirde iki ağaçta harcanmaz: adım miktarları toplamı emir miktarını aşmaz', async () => {
    const e = await ekranAc({ araStok: 20 });
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '30');
    const ana = e.plan().find((p) => p.id === 'o_eski')!, kp = e.plan().find((p) => p.id === e.emirler().find((x) => x.kol)!.id)!;
    expect(adimOf(ana, 20).qty).toBe(50);
    expect(adimOf(ana, 30).qty + adimOf(kp, 30).qty).toBe(50);
  }, 40000);

  it('kolun girdisi kendi miktarına göre alınır ve tamamlamada stoktan düşer; eksik girdide ana emir tamamlanamaz', async () => {
    const e = await ekranAc({ girdiStok: 100 });
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    expect(e.ifade(`curPlan().orders["${kol.id}"].raw["h1|"].gross`)).toBe(20);
    expect(e.ifade('curPlan().orders["o_eski"].raw["h1|"].gross')).toBe(30);
    e.tikla('[data-act="completeOrder"]'); e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam']); });
    expect(e.ifade('st.items.find(i=>i.id==="h1").stock')).toBe(50);
    expect(e.ifade('st.items.find(i=>i.id==="i1").stock')).toBe(50);
  }, 60000);

  it('eksik girdide kollu ana emir tamamlanamaz', async () => {
    const k = await ekranAc({ girdiStok: 35 });
    k.detayAc('o_eski');
    kolKur(k, '2', '4', '20');
    k.tikla('[data-act="completeOrder"]'); k.tikla('[data-act="completeOrder"]');
    expect(k.bildirim()).toContain('Stokta eksik malzeme var');
    expect(k.emirler().map((x) => x.status)).toEqual(['serbest', 'serbest']);
  }, 40000);

  it('kolun durum, tarih, öncelik alanları ana emirden gelir ve kolda düzenlenemez; kol miktarı kurala uyarak değişir; ana emirdeki değişim kola yayılır', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    e.yaz('select[data-f="priority"]', '1'); fireEvent.change(e.belge.querySelector('select[data-f="priority"]')!);
    e.yaz('select[data-f="status"]', 'taslak'); fireEvent.change(e.belge.querySelector('select[data-f="status"]')!);
    expect(e.emirler().find((x) => x.id === kol.id)).toMatchObject({ status: 'taslak', priority: 1 });
    await waitFor(() => { expect(e.belge.querySelector('[data-act="releaseOrder"]')).not.toBeNull(); });
    e.tikla('[data-act="releaseOrder"]');
    expect(e.emirler().find((x) => x.id === kol.id)!.status).toBe('serbest');
    git(e, kol.id);
    expect(e.belge.querySelector('select[data-f="status"]')!.hasAttribute('disabled')).toBe(true);
    e.yaz('select[data-f="status"]', 'tamam'); fireEvent.change(e.belge.querySelector('select[data-f="status"]')!);
    expect(e.bildirim()).toContain('Kol bu alanı ana emirden alır.');
    expect(e.emirler().find((x) => x.id === kol.id)!.status).toBe('serbest');
    e.yaz('input[data-f="qty"]', '50'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    expect(e.bildirim()).toContain('Kol miktarı ana emirde kalan miktardan küçük olmalı');
    e.yaz('input[data-f="qty"]', '25'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    expect(e.emirler().find((x) => x.id === kol.id)!.qty).toBe(25);
    e.tikla('[data-act="emirGit"][data-id="o_eski"]');
    e.yaz('input[data-f="qty"]', '25'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    expect(e.bildirim()).toContain('Emir miktarı kolların toplamından (25) büyük olmalı');
    expect(e.emirler().find((x) => x.id === 'o_eski')!.qty).toBe(50);
  }, 50000);

  it('partiden açılan kol varken parti ana emre geri katılamaz; kol geri alınınca katılır ve miktar tutar', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    partiBol(e, '20');
    const parti = e.emirler().find((x) => x.parentId === 'o_eski')!;
    git(e, parti.id);
    kolKur(e, '2', '4', '5');
    const kol = e.emirler().find((x) => x.kol)!;
    expect(kol.parentId).toBe(parti.id);
    e.tikla(`[data-act="emirAltGeri"][data-id="${parti.id}"]`);
    expect(e.bildirim()).toContain('Alt emrin kolları var; önce kolları geri alın.');
    expect(e.emirler()).toHaveLength(3);
    git(e, kol.id);
    e.tikla(`[data-act="emirAltGeri"][data-id="${kol.id}"]`);
    e.tikla(`[data-act="emirAltGeri"][data-id="${parti.id}"]`);
    expect(e.emirler().map((x) => [x.id, x.qty])).toEqual([['o_eski', 50]]);
  }, 50000);

  it('ana emir tamamlanınca kol da tamamlanır, mamul stoğuna yalnız ana emrin miktarı girer; kol tek başına tamamlanamaz', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    git(e, kol.id);
    expect(e.belge.querySelector('[data-act="completeOrder"]')).toBeNull();
    expect(e.belge.querySelector('.odet')?.textContent).toContain('Bu kol ana emre bağlıdır');
    e.tikla('[data-act="emirGit"]');
    e.tikla('[data-act="completeOrder"]');
    e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam']); });
    expect(e.ifade('st.items[0].stock')).toBe(50);
  }, 40000);

  it('şema sekmesindeki "Üretim emri oluştur" düğmesi seçili ürün için Seri bir emir açar ve emirler sekmesine geçer', async () => {
    const e = await ekranAc(false);
    e.ifade('(window.CSS = window.CSS || { escape: (x) => String(x).replace(/["\\\\]/g, "\\\\$&") }, 1)');
    e.ifade('(ui.root = "i1", st.settings.orderItem = "i1", st.settings.start = "2030-03-04", st.settings.due = "2030-03-29", act("tab", {tab: "schema"}), 1)');
    await waitFor(() => { expect(e.belge.querySelector('[data-act="orderFromSchema"]')).not.toBeNull(); });
    e.tikla('[data-act="orderFromSchema"]');
    await waitFor(() => { expect(e.emirler()).toHaveLength(1); });
    expect(e.emirler()[0]).toMatchObject({ tur: 'seri', status: 'serbest' });
    expect(e.ifade('ui.tab')).toBe('orders');
  }, 40000);

  it('kolun kolu ust kolun adımları dışında birleşemez; ana emir, kollar ve torunlar her adımda emir miktarını korur', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '1', '5', '30');
    const k = e.emirler().find((x) => x.kol)!;
    git(e, k.id);
    kolKur(e, '2', '4', '5');
    const g = e.emirler().find((x) => x.parentId === k.id)!;
    git(e, g.id);
    katilBagla(e, '5');
    expect(e.bildirim()).toContain('Birleşme adımı bağlı olduğu emrin adımları (2..4) içinde kalmalı.');
    expect(e.emirler().find((x) => x.id === g.id)!.kol).toEqual({ n: 2, m: 4 });
    const toplam = (seq: number) => e.plan().reduce((t, p) => t + (p.adimlar.find((a) => a.seq === seq)?.qty ?? 0), 0);
    for (const seq of [10, 20, 30, 40, 50]) expect(toplam(seq)).toBe(50);
  }, 50000);

  it('aynı noktadan çıkan ikiz kollar bağımsız adımlarda birleşebilir ve her adımda miktar korunur; yük aşılırsa reddedilir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '5', '10');
    kolKur(e, '2', '5', '10');
    const [k1, k2] = e.emirler().filter((x) => x.kol) as [Emir, Emir];
    git(e, k2.id);
    katilBagla(e, '4');
    expect(e.emirler().find((x) => x.id === k2.id)!.kol).toEqual({ n: 2, m: 4 });
    expect(e.emirler().find((x) => x.id === k1.id)!.kol).toEqual({ n: 2, m: 5 });
    const toplam = (seq: number) => e.plan().reduce((t, p) => t + (p.adimlar.find((a) => a.seq === seq)?.qty ?? 0), 0);
    for (const seq of [10, 20, 30, 40, 50]) expect(toplam(seq)).toBe(50);
    expect(e.saf('kolBirlestirDogrula', { durum: 'serbest', n: 1, mEski: 5, mYeni: 4, adimSayisi: 5, kolBaslamis: [], anaBaslamis: [], mevcut: [{ n: 1, m: 5, qty: 10 }], kolKolMax: 0, q: 10, qty: 50 })).toEqual({ ok: true });
    expect(e.saf<{ ileti: string }>('kolBirlestirDogrula', { durum: 'serbest', n: 1, mEski: 5, mYeni: 4, adimSayisi: 5, kolBaslamis: [], anaBaslamis: [], mevcut: [{ n: 1, m: 5, qty: 45 }], kolKolMax: 0, q: 10, qty: 50 }).ileti).toContain('bu aralıkta ana emirde kalan miktarı (5) aşıyor');
  }, 50000);

  it('ana emir silinince bütün kol soyu silinir; torun kol da tamamlamada ve durum yayılımında ana emri izler', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '1', '5', '30');
    const k = e.emirler().find((x) => x.kol)!;
    git(e, k.id);
    kolKur(e, '2', '4', '5');
    const g = e.emirler().find((x) => x.parentId === k.id)!;
    // Durum yayılımı torunlara iner.
    e.tikla('[data-act="emirGit"][data-id="o_eski"]');
    e.yaz('select[data-f="status"]', 'taslak'); fireEvent.change(e.belge.querySelector('select[data-f="status"]')!);
    expect(e.emirler().filter((x) => x.kol).map((x) => x.status)).toEqual(['taslak', 'taslak']);
    await waitFor(() => { expect(e.belge.querySelector('[data-act="releaseOrder"]')).not.toBeNull(); });
    e.tikla('[data-act="releaseOrder"]');
    expect(e.emirler().filter((x) => x.kol).map((x) => x.status)).toEqual(['serbest', 'serbest']);
    // Tamamlama torunu da tamamlar.
    e.tikla('[data-act="completeOrder"]'); e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam', 'tamam']); });
    expect(e.ifade('st.items[0].stock')).toBe(50);
    // Silme: yeni ağaçta ana emir silinince kol soyu gider.
    const d = await ekranAc();
    d.detayAc('o_eski');
    kolKur(d, '1', '5', '30');
    const k2 = d.emirler().find((x) => x.kol)!;
    git(d, k2.id);
    kolKur(d, '2', '4', '5');
    expect(d.emirler()).toHaveLength(3);
    d.tikla('[data-act="emirGit"][data-id="o_eski"]');
    d.ifade('(st.orders.forEach(o => { if (o.id !== "o_eski") delete o.status; }), 1)');
    d.ifade('(st.orders.forEach(o => { o.status = o.status || "serbest"; }), 1)');
    d.tikla('[data-act="del"][data-kind="order"][data-id="o_eski"]'); d.tikla('[data-act="del"][data-kind="order"][data-id="o_eski"]');
    expect(d.emirler()).toHaveLength(0);
    expect(g.id).not.toBe(k2.id);
  }, 70000);

  it('kolu olmayan emirde miktar 0 girilince kol iletisi çıkmaz; kol miktarı 0 olamaz', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    e.yaz('input[data-f="qty"]', '0'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    expect(e.bildirim()).not.toContain('kolların toplamından');
    e.yaz('input[data-f="qty"]', '50'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    kolKur(e, '2', '4', '20');
    const kol = e.emirler().find((x) => x.kol)!;
    git(e, kol.id);
    e.yaz('input[data-f="qty"]', '0'); fireEvent.change(e.belge.querySelector('input[data-f="qty"]')!);
    expect(e.bildirim()).toContain('Kol miktarı sıfırdan büyük olmalı.');
    expect(e.emirler().find((x) => x.id === kol.id)!.qty).toBe(20);
  }, 50000);
});

describe('Emir bölme ekranı: rota şeridi, önizleme, ağaç', () => {
  const sinifi = (e: Ekran, h: string) => Array.from(e.belge.querySelectorAll(`[data-bolme="${h}"] .bl-adim`)).map((b) => (['ayril', 'kol', 'birles'].find((c) => b.classList.contains(c)) ?? '-'));

  it('kol iki dokunuşla seçilir: 1. dokunuş ayrılma, 2. birleşme, aradakiler "Kol yapar"; önizleme ve kalan miktar doğru; onayda {n,m,qty} ile bölünür', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    // Bölme türü seçilmeden yalnız açıklama görünür; N/M kutuları yoktur.
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-ipuc')?.textContent).toContain('Partilere böl');
    expect(e.belge.querySelector('#kolN')).toBeNull();
    turSec(e, 'o_eski', 'kol');
    expect(e.belge.querySelectorAll('[data-bolme="o_eski"] .bl-adim')).toHaveLength(5);
    expect(sinifi(e, 'o_eski')).toEqual(['-', '-', '-', '-', '-']);
    adimTikla(e, 'o_eski', '2');
    expect(sinifi(e, 'o_eski')).toEqual(['-', 'ayril', '-', '-', '-']);
    expect(e.belge.querySelector('[data-bolme="o_eski"]')?.textContent).toContain('1. tık · Ayrılma: 2 TRN sonrası');
    adimTikla(e, 'o_eski', '5');
    expect(sinifi(e, 'o_eski')).toEqual(['-', 'ayril', 'kol', 'kol', 'birles']);
    const yazilar = Array.from(e.belge.querySelectorAll('[data-bolme="o_eski"] .bl-adim .rz')).map((r) => r.textContent);
    expect(yazilar).toEqual(['', 'Kol bu adımdan sonra ayrılır', 'Kol yapar', 'Kol yapar', 'Ana emre birleşir']);
    // Miktar girilmeden önizleme yok, ileti miktarı ister.
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-uyari')?.textContent).toContain('Kol miktarını gir.');
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-tablo')).toBeNull();
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="kolQ"]', '20');
    expect(e.belge.querySelector<HTMLInputElement>('[data-bolme="o_eski"] [data-bolme-kalan]')!.value).toBe('30');
    expect(ozet(e, 'o_eski')).toEqual([
      ['UE-2020-001', '50', '50', '30', '30', '50'],
      ['Yeni kol', 'ana emirde', 'ana emirde', '20', '20', 'katıldı'],
    ]);
    expect(e.emirler()).toHaveLength(1);
    e.tikla('[data-act="emirBolKol"][data-id="o_eski"]');
    const kol = e.emirler().find((x) => x.kol)!;
    expect([kol.kol, kol.qty, kol.parentId]).toEqual([{ n: 2, m: 5 }, 20, 'o_eski']);
    // Başarıdan sonra seçici sıfırlanır.
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-tablo')).toBeNull();
  }, 40000);

  it('geçersiz kol seçimi mevcut kural iletisiyle gösterilir; seçimi temizle başa döndürür; üçüncü dokunuş yeni seçim başlatır', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    turSec(e, 'o_eski', 'kol');
    const uyari = () => e.belge.querySelector('[data-bolme="o_eski"] .bl-uyari')?.textContent ?? '';
    adimTikla(e, 'o_eski', '3'); adimTikla(e, 'o_eski', '4');
    expect(uyari()).toContain('Kol en az bir adım taşımalı: birleşme adımı ayrılma adımından en az 2 sonra olmalı.');
    adimTikla(e, 'o_eski', '4'); adimTikla(e, 'o_eski', '2');
    expect(uyari()).toContain('Birleşme adımı (2) ayrılma adımından (4) sonra olmalı.');
    adimTikla(e, 'o_eski', '3'); adimTikla(e, 'o_eski', '3');
    expect(uyari()).toContain('Birleşme adımı (3) ayrılma adımından (3) sonra olmalı.');
    adimTikla(e, 'o_eski', '1'); adimTikla(e, 'o_eski', '4');
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="kolQ"]', '50');
    expect(uyari()).toContain('Kol miktarı (50) ana emirde kalan miktarı (50) aşıyor');
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-tablo')).toBeNull();
    e.tikla('[data-act="bolmeTemizle"][data-h="o_eski"]');
    expect(sinifi(e, 'o_eski')).toEqual(['-', '-', '-', '-', '-']);
    expect(e.belge.querySelector('[data-bolme="o_eski"]')?.textContent).toContain('1. tık · Ayrılma: seçilmedi');
    e.tikla('[data-act="emirBolKol"][data-id="o_eski"]');
    expect(e.bildirim()).toContain('rota şeridinden seç');
    expect(e.emirler()).toHaveLength(1);
  }, 40000);

  it('parti kutuları: ana emirde kalan hesaplanır, parti eklenir/çıkarılır, eşit bölünür, önizleme her emrin miktarını gösterir; onayda bölünür', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    turSec(e, 'o_eski', 'parti');
    expect(e.belge.querySelectorAll('[data-bolme="o_eski"] [data-bolme-girdi="parti"]')).toHaveLength(2);
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="parti"][data-i="0"]', '20');
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="parti"][data-i="1"]', '10');
    expect(e.belge.querySelector<HTMLInputElement>('[data-bolme="o_eski"] [data-bolme-kalan]')!.value).toBe('20');
    expect(ozet(e, 'o_eski')).toEqual([
      ['UE-2020-001', '20', '20', '20', '20', '20'],
      ['Parti 1', '20', '20', '20', '20', '20'],
      ['Parti 2', '10', '10', '10', '10', '10'],
    ]);
    e.tikla('[data-act="bolmePartiEkle"][data-h="o_eski"]');
    expect(e.belge.querySelectorAll('[data-bolme="o_eski"] [data-bolme-girdi="parti"]')).toHaveLength(3);
    e.tikla('[data-act="bolmeEsit"][data-h="o_eski"]');
    expect(Array.from(e.belge.querySelectorAll<HTMLInputElement>('[data-bolme="o_eski"] [data-bolme-girdi="parti"]')).map((i) => i.value)).toEqual(['12', '12', '12']);
    expect(e.belge.querySelector<HTMLInputElement>('[data-bolme="o_eski"] [data-bolme-kalan]')!.value).toBe('14');
    e.tikla('[data-act="bolmePartiCikar"][data-h="o_eski"]');
    expect(e.belge.querySelectorAll('[data-bolme="o_eski"] [data-bolme-girdi="parti"]')).toHaveLength(2);
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="parti"][data-i="0"]', '30');
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="parti"][data-i="1"]', '20');
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-uyari')?.textContent).toContain('Ana emirde en az bir miktar kalmalı');
    girdi(e, '[data-bolme="o_eski"] [data-bolme-girdi="parti"][data-i="1"]', '15');
    e.tikla('[data-act="emirBolMiktar"][data-id="o_eski"]');
    expect(e.emirler().map((x) => x.qty)).toEqual([5, 30, 15]);
    expect(e.emirler().slice(1).map((x) => x.parentId)).toEqual(['o_eski', 'o_eski']);
  }, 40000);

  it('başlamış emirde önizleme mevcut uyarıyı ve biten adımın işaretini gösterir; onay ikinci basışta uygulanır', async () => {
    const e = await ekranAc();
    e.ifade('(st.opStatus["o_eski|root|p1"]="tamam", 1)');
    e.detayAc('o_eski');
    partiSec(e, 'o_eski', ['10']);
    expect(e.belge.querySelector('[data-bolme="o_eski"] .bl-onizle .bl-uyari')?.textContent).toContain('Üretime başlamış emir: tamamlanan adımlar alt emirlerde de tamamlanmış sayılır');
    expect(ozet(e, 'o_eski')[0]).toEqual(['UE-2020-001', '40 ✓', '40', '40', '40', '40']);
    expect(ozet(e, 'o_eski')[1]).toEqual(['Parti 1', '10 ✓', '10', '10', '10', '10']);
    e.tikla('[data-act="emirBolMiktar"][data-id="o_eski"]');
    expect(e.bildirim()).toContain('Üretime başlamış emir');
    expect(e.emirler()).toHaveLength(1);
    expect(e.belge.querySelector('[data-act="emirBolMiktar"]')?.textContent).toContain('onayla');
    e.tikla('[data-act="emirBolMiktar"][data-id="o_eski"]');
    expect(e.emirler().map((x) => x.qty)).toEqual([40, 10]);
  }, 40000);

  it('yeni emir formunda Tek emir / Partilere böl / Kol ayır seçilir: kolla açılan emir kol {n,m,qty} taşır, seçici ve önizleme formdadır', async () => {
    const e = await ekranAc(false);
    e.tikla('[data-act="newOrderToggle"]');
    expect(Array.from(e.belge.querySelectorAll('[data-bolme="yeni"] .bl-seg button')).map((b) => b.textContent)).toEqual(['Tek emir', 'Partilere böl', 'Kol ayır']);
    expect(e.belge.querySelector('[data-bolme="yeni"] .bl-seg [aria-pressed="true"]')?.textContent).toBe('Tek emir');
    expect(e.belge.querySelector('[data-bolme="yeni"] .bl-adim')).toBeNull();
    expect(e.belge.querySelector('#noKolN')).toBeNull();
    expect(e.belge.querySelector('#noPartiList')).toBeNull();
    e.yaz('#noQty', '80');
    turSec(e, 'yeni', 'kol');
    adimTikla(e, 'yeni', '1'); adimTikla(e, 'yeni', '4');
    girdi(e, '[data-bolme="yeni"] [data-bolme-girdi="kolQ"]', '30');
    expect(ozet(e, 'yeni')).toEqual([
      ['Ana emir', '80', '50', '50', '80', '80'],
      ['Yeni kol', 'ana emirde', '30', '30', 'katıldı', 'katıldı'],
    ]);
    e.emirAc({}, '80');
    await waitFor(() => { expect(e.emirler()).toHaveLength(2); });
    const [ana, kol] = e.emirler() as [Emir, Emir];
    expect([ana.qty, kol.qty, kol.kol, kol.parentId]).toEqual([80, 30, { n: 1, m: 4 }, ana.id]);
    // Emir açılınca seçici sıfırlanır: tekrar açılan form Tek emir ile başlar.
    e.tikla('[data-act="newOrderToggle"]');
    expect(e.belge.querySelector('[data-bolme="yeni"] .bl-seg [aria-pressed="true"]')?.textContent).toBe('Tek emir');
    // Seçilmemiş kol ile açma reddedilir.
    turSec(e, 'yeni', 'kol');
    e.tikla('[data-act="createOrder"]');
    expect(e.bildirim()).toContain('rota şeridinden seç');
    expect(e.emirler()).toHaveLength(2);
  }, 40000);

  it('ağaçta alt emirler ana emrin altında tür, adım aralığı, miktar ve durumla görünür; katılma adımı ve kolu geri al ağaç satırından erişilir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '1', '4', '15');
    partiBol(e, '10');
    const satirlar = Array.from(e.belge.querySelectorAll('.orow'));
    expect(satirlar).toHaveLength(3);
    expect(satirlar.map((r) => r.classList.contains('alt'))).toEqual([false, true, true]);
    const kolSatiri = satirlar[1]!, partiSatiri = satirlar[2]!;
    expect(kolSatiri.querySelector('.altur')?.textContent).toBe('Kol');
    expect(kolSatiri.querySelector('.aralik')?.textContent).toBe('2 TRN → 3 FRZ, 4 TAS adımında katılır');
    expect(kolSatiri.textContent).toContain('15');
    expect(kolSatiri.querySelector('.ostat')?.textContent).toBe('Serbest');
    expect(partiSatiri.querySelector('.altur')?.textContent).toBe('Parti');
    expect(partiSatiri.querySelector('.aralik')?.textContent).toBe('bütün adımlar');
    // Satır kapalıyken de katılma adımı değiştirilir: şerit açılır, tek dokunuş uygular.
    const kol = e.emirler().find((x) => x.kol)!;
    e.tikla(`.orow.alt .or-eylem [data-act="katilAc"][data-id="${kol.id}"]`);
    expect(e.belge.querySelectorAll(`[data-act="emirKolBirlestir"][data-id="${kol.id}"]`)).toHaveLength(5);
    expect(Array.from(e.belge.querySelectorAll(`[data-act="emirKolBirlestir"][data-id="${kol.id}"]`)).map((b) => (['ayril', 'kol', 'birles'].find((c) => b.classList.contains(c)) ?? '-'))).toEqual(['ayril', 'kol', 'kol', 'birles', '-']);
    e.tikla(`[data-act="emirKolBirlestir"][data-id="${kol.id}"][data-m="5"]`);
    expect(e.emirler().find((x) => x.id === kol.id)!.kol).toEqual({ n: 1, m: 5 });
    expect(e.belge.querySelector('.orow.alt .aralik')?.textContent).toBe('2 TRN → 4 TAS, 5 KON adımında katılır');
    // Geçersiz katılma adımı kural iletisiyle reddedilir.
    e.tikla(`[data-act="katilAc"][data-id="${kol.id}"]`);
    e.tikla(`[data-act="emirKolBirlestir"][data-id="${kol.id}"][data-m="2"]`);
    expect(e.bildirim()).toContain('Kol en az bir adım taşımalı');
    expect(e.emirler().find((x) => x.id === kol.id)!.kol).toEqual({ n: 1, m: 5 });
    // Kolu geri al da ağaç satırında.
    e.tikla(`.orow.alt .or-eylem [data-act="emirAltGeri"][data-id="${kol.id}"]`);
    expect(e.emirler().some((x) => x.kol)).toBe(false);
    expect(e.belge.querySelectorAll('.orow.alt')).toHaveLength(1);
  }, 50000);

  it('mevcut kolu olan emirde parti önizlemesi kolun adımlarında ana emir miktarını kol kadar düşük gösterir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    partiSec(e, 'o_eski', ['10']);
    expect(ozet(e, 'o_eski')).toEqual([
      ['UE-2020-001', '40', '40', '20', '40', '40'],
      ['Parti 1', '10', '10', '10', '10', '10'],
    ]);
  }, 40000);

  it('ana emri silinmiş alt emir listede kök satır olarak görünür, girintisiz', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    kolKur(e, '2', '4', '20');
    e.ifade('(st.orders = st.orders.filter(o => o.id !== "o_eski"), render(), 1)');
    const satirlar = Array.from(e.belge.querySelectorAll('.orow'));
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]!.classList.contains('alt')).toBe(false);
    expect(satirlar[0]!.querySelector('.altchip')?.getAttribute('title')).toBe('Ana emri silinmiş kol');
  }, 40000);

  it('ağaç satırındaki "Bu emri de böl" emrin kartını açar ve Böl bölümünü gösterir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    partiBol(e, '10');
    const alt = e.emirler().find((x) => x.parentId === 'o_eski')!;
    e.tikla(`.orow.alt .or-eylem [data-act="bolGit"][data-id="${alt.id}"]`);
    expect(acik(e)).toBe(alt.id);
    expect(e.belge.querySelector(`[data-bolme="${alt.id}"]`)).not.toBeNull();
  }, 40000);
});
