import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Emir türü listesi ve bölme kuralları Üretim Emirleri'nindir: köprüsüz açılışta bölme yapılmaz; bölünmüş eski kayıt (kol, parti)
// planda ve stokta aynı kurallarla yürür. Bağlı kipteki bölme ekranı Emirler.test.tsx'tedir. Örnek veriler uydurmadır: beş adımlı tek
// mamul, tek vardiyalı iş merkezi, üç istasyon.
const ADIMLAR = ['KES', 'TRN', 'FRZ', 'TAS', 'KON'] as const;

type Kayit = { id: string; qty: number; parentId?: string; kol?: { n: number; m: number }; status?: string };
interface Secenek { eskiEmir?: boolean; girdiStok?: number; araStok?: number; altlar?: Kayit[] }
const kayitEmri = (k: Kayit, i: number) => ({ no: `UE-2020-${String(i + 2).padStart(3, '0')}`, itemId: 'i1', start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: i + 2, tur: 'seri', ...k });
function depo({ eskiEmir = true, girdiStok, araStok, altlar = [] }: Secenek) {
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
    // Türsüz eski kayıt: Seri sayılmalı. Alt emirler bölünmüş eski kayıttır (kol ya da parti).
    orders: eskiEmir ? [{ id: 'o_eski', no: 'UE-2020-001', itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1 }, ...altlar.map(kayitEmri)] : [],
  };
}

type Emir = { id: string; no: string; qty: number; status: string; tur: string; priority: number; parentId?: string; kol?: { n: number; m: number } };
type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc(secenek: Secenek | boolean = {}) {
  const sec = typeof secenek === 'boolean' ? { eskiEmir: secenek } : secenek;
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(sec), surum: 1 }]);
  ac('/recete-rota');
  const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const tikla = (k: string) => { belge.querySelector('#toasts')?.replaceChildren(); const el = belge.querySelector<HTMLElement>(k); expect(el, k).not.toBeNull(); fireEvent.click(el!); };
  const yaz = (k: string, v: string) => { const el = belge.querySelector<HTMLInputElement | HTMLSelectElement>(k); expect(el, k).not.toBeNull(); el!.value = v; };
  const degis = (k: string, v: string) => { yaz(k, v); fireEvent.change(belge.querySelector(k)!); };
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
  return { belge, ifade, tikla, yaz, degis, bildirim, emirler, emirAc, detayAc, plan };
}
type Ekran = Awaited<ReturnType<typeof ekranAc>>;
const acik = (e: Ekran) => e.ifade<string | null>('ui.openOrder || null');
const git = (e: Ekran, id: string) => { if (acik(e) !== id) e.tikla(`[data-act="orderDetail"][data-id="${id}"]`); };
const adimOf = (p: { adimlar: { seq: number; start: number; end: number; qty: number }[] }, seq: number) => p.adimlar.find((a) => a.seq === seq)!;
const toplam = (e: Ekran, seq: number) => e.plan().reduce((t, p) => t + (p.adimlar.find((a) => a.seq === seq)?.qty ?? 0), 0);
const KOL = (qty = 20, n = 2, m = 4, parentId = 'o_eski', id = 'o_kol'): Kayit => ({ id, qty, parentId, kol: { n, m } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Emir türü Üretim Emirleri sözleşmesindedir', () => {
  it('emir türü açarken sözleşmedeki adlarla seçilir (varsayılan Seri), listede görünür ve süzülür; türsüz eski kayıt Seri sayılır', async () => {
    const e = await ekranAc();
    expect(e.emirler()[0]!.tur).toBe('seri');
    e.tikla('[data-act="newOrderToggle"]');
    expect(Array.from(e.belge.querySelectorAll<HTMLOptionElement>('#noTur option')).map((o) => o.textContent)).toEqual(['Seri', 'FAI', 'Numune', 'Prototip', 'Stoğa üretim', 'Rework', 'Bakım ve deneme', 'Fason']);
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
    e.tikla('[data-act="orderTur"][data-v="fason"]');
    expect(e.belge.querySelectorAll('.orow')).toHaveLength(0);
    e.tikla('[data-act="orderTur"][data-v="seri"]');
    expect(e.belge.querySelectorAll('.orow')).toHaveLength(1);
    // Açık emrin ayrıntısında tür değiştirilebilir.
    e.tikla('[data-act="orderTur"][data-v="tum"]');
    e.detayAc('o_eski');
    e.degis('select[data-f="tur"]', 'rework');
    expect(e.emirler()[0]!.tur).toBe('rework');
    expect(e.ifade('normalize({orders:[{id:"x",itemId:"i1",qty:1}]}).orders[0].tur')).toBe('seri');
  }, 40000);

  it('emir türünü değiştirmek planı etkilemez: canlı plan taslak senaryoya alınmaz', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    e.degis('select[data-f="tur"]', 'prototip');
    expect(e.ifade('!!ui.studio')).toBe(false);
    expect(e.emirler()[0]!.tur).toBe('prototip');
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
});

describe('Köprüsüz açılışta bölme yapılmaz: kural Üretim Emirleri\'ndedir', () => {
  it('yeni emir formunda bölme seçicisi yoktur, emir tek açılır; mevcut emirde Böl bölümü nedenini söyler', async () => {
    const e = await ekranAc(false);
    e.tikla('[data-act="newOrderToggle"]');
    expect(e.belge.querySelector('[data-bolme="yeni"]')).toBeNull();
    e.emirAc({}, '80');
    await waitFor(() => { expect(e.emirler()).toHaveLength(1); });
    expect(e.emirler()[0]).toMatchObject({ qty: 80 });
    expect(e.emirler()[0]!.parentId).toBeUndefined();
    git(e, e.emirler()[0]!.id);
    const id = e.emirler()[0]!.id;
    expect(e.belge.querySelector(`[data-bolme="${id}"]`)?.textContent).toBe("Bölme, kol ve geri katma Üretim Emirleri'ne bağlıyken yapılır.");
    expect(e.belge.querySelector(`[data-act="bolmeTur"][data-h="${id}"]`)).toBeNull();
  }, 40000);

  it('bölme, kol, katılma ve geri katma eylemleri yerelde emir değiştirmez', async () => {
    const e = await ekranAc({ altlar: [KOL(), { id: 'o_parti', qty: 10, parentId: 'o_eski' }] });
    const once = e.emirler();
    for (const [a, id] of [['emirBolMiktar', 'o_eski'], ['emirBolKol', 'o_eski'], ['emirAltGeri', 'o_parti'], ['emirAltGeri', 'o_kol']] as const) {
      e.ifade(`(bolmeDurum("${id}").tur = "parti", bolmeDurum("${id}").partiler = ["5"], bolmeDurum("${id}").n = 1, bolmeDurum("${id}").m = 3, bolmeDurum("${id}").kolQ = "5", act("${a}", {id:"${id}"}), 1)`);
      expect(e.bildirim()).toContain("Üretim Emirleri'ne bağlıyken");
    }
    e.ifade('(act("emirKolBirlestir", {id:"o_kol", m:"5"}), 1)');
    expect(e.emirler()).toEqual(once);
  }, 40000);

  it('bölünmüş emrin ve alt emrinin miktarı burada değişmez; bölünmemiş emrin miktarı değişir', async () => {
    const e = await ekranAc({ altlar: [KOL()] });
    e.detayAc('o_eski');
    e.degis('input[data-f="qty"]', '60');
    expect(e.bildirim()).toContain('Bölünmüş emrin miktarı burada değişmez.');
    git(e, 'o_kol');
    e.degis('input[data-f="qty"]', '25');
    expect(e.emirler().map((x) => x.qty)).toEqual([50, 20]);
  }, 40000);

  it('bölünmemiş emrin miktarı burada değişir', async () => {
    const e = await ekranAc();
    e.detayAc('o_eski');
    e.degis('input[data-f="qty"]', '60');
    expect(e.bildirim()).not.toContain('Bölünmüş emrin');
    expect(e.emirler()[0]!.qty).toBe(60);
  }, 40000);
});

describe('Bölünmüş eski kayıt: kol ve parti planda ve stokta', () => {
  it('adım kolu miktar taşır: kol N+1..M-1 adımlarını q adetle yapar, ana emir kalanla aynı adımları sürdürür, M. adımda ikisini bekler', async () => {
    const e = await ekranAc({ altlar: [KOL(20, 2, 4)] });
    const ana = e.plan().find((p) => p.id === 'o_eski')!, kp = e.plan().find((p) => p.id === 'o_kol')!;
    expect(ana.adimlar.map((a) => a.seq)).toEqual([10, 20, 30, 40, 50]);
    expect(ana.adimlar.map((a) => a.qty)).toEqual([50, 50, 30, 50, 50]);
    expect(kp.adimlar.map((a) => [a.seq, a.qty])).toEqual([[30, 20]]);
    expect(adimOf(kp, 30).start).toBeGreaterThanOrEqual(adimOf(ana, 20).end - 1e-6);
    expect(adimOf(ana, 40).start).toBeGreaterThanOrEqual(Math.max(adimOf(ana, 30).end, adimOf(kp, 30).end) - 1e-6);
    expect(adimOf(kp, 30)).toMatchObject({ outCard: { itemId: HAM.id, status: 'step:p3' } });
    expect(e.belge.querySelector('.orow.alt .aralik')?.textContent).toBe('3 FRZ, 4 TAS adımında katılır');
  }, 40000);

  it('kolun kolu planda zincirlenir: iç kol dış kolun adımını bekler, dış kol iç kolu bekler', async () => {
    const e = await ekranAc({ altlar: [KOL(20, 1, 5), KOL(5, 2, 4, 'o_kol', 'o_ic')] });
    const p = e.plan(), kp = p.find((q) => q.id === 'o_kol')!, ip = p.find((q) => q.id === 'o_ic')!;
    expect(ip.adimlar.map((a) => a.seq)).toEqual([30]);
    expect(adimOf(ip, 30).start).toBeGreaterThanOrEqual(adimOf(kp, 20).end - 1e-6);
    expect(adimOf(kp, 40).start).toBeGreaterThanOrEqual(adimOf(ip, 30).end - 1e-6);
    expect(adimOf(kp, 30).qty).toBe(15);
    for (const seq of [10, 20, 30, 40, 50]) expect(toplam(e, seq)).toBe(50);
  }, 40000);

  it('aynı noktadan çıkan ikiz kollar farklı adımlarda birleşir ve her adımda miktar korunur', async () => {
    const e = await ekranAc({ altlar: [KOL(10, 2, 5, 'o_eski', 'o_k1'), KOL(10, 2, 4, 'o_eski', 'o_k2')] });
    for (const seq of [10, 20, 30, 40, 50]) expect(toplam(e, seq)).toBe(50);
  }, 40000);

  it('bekleyen ara stok kollu emirde iki ağaçta harcanmaz: adım miktarları toplamı emir miktarını aşmaz', async () => {
    const e = await ekranAc({ araStok: 20, altlar: [KOL(30, 2, 4)] });
    const ana = e.plan().find((p) => p.id === 'o_eski')!, kp = e.plan().find((p) => p.id === 'o_kol')!;
    expect(adimOf(ana, 20).qty).toBe(50);
    expect(adimOf(ana, 30).qty + adimOf(kp, 30).qty).toBe(50);
  }, 40000);

  it('kolun girdisi kendi miktarına göre alınır ve tamamlamada stoktan düşer', async () => {
    const e = await ekranAc({ girdiStok: 100, altlar: [KOL()] });
    expect(e.ifade('curPlan().orders["o_kol"].raw["h1|"].gross')).toBe(20);
    expect(e.ifade('curPlan().orders["o_eski"].raw["h1|"].gross')).toBe(30);
    e.detayAc('o_eski');
    e.tikla('[data-act="completeOrder"]'); e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam']); });
    expect(e.ifade('st.items.find(i=>i.id==="h1").stock')).toBe(50);
    expect(e.ifade('st.items.find(i=>i.id==="i1").stock')).toBe(50);
  }, 60000);

  it('eksik girdide kollu ana emir tamamlanamaz', async () => {
    const k = await ekranAc({ girdiStok: 35, altlar: [KOL()] });
    k.detayAc('o_eski');
    k.tikla('[data-act="completeOrder"]'); k.tikla('[data-act="completeOrder"]');
    expect(k.bildirim()).toContain('Stokta eksik malzeme var');
    expect(k.emirler().map((x) => x.status)).toEqual(['serbest', 'serbest']);
  }, 40000);

  it('ana emir tamamlanınca kol da tamamlanır, mamul stoğuna yalnız ana emrin miktarı girer; kol tek başına tamamlanamaz', async () => {
    const e = await ekranAc({ altlar: [KOL()] });
    e.detayAc('o_eski');
    git(e, 'o_kol');
    expect(e.belge.querySelector('[data-act="completeOrder"]')).toBeNull();
    expect(e.belge.querySelector('.odet')?.textContent).toContain('Bu kol ana emre bağlıdır');
    e.tikla('[data-act="emirGit"]');
    e.tikla('[data-act="completeOrder"]');
    e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam']); });
    expect(e.ifade('st.items[0].stock')).toBe(50);
  }, 40000);

  it('kolun durum, tarih, öncelik alanları ana emirden gelir ve kolda düzenlenemez; ana emirdeki değişim kolun koluna da yayılır', async () => {
    const e = await ekranAc({ altlar: [KOL(30, 1, 5), KOL(5, 2, 4, 'o_kol', 'o_ic')] });
    e.detayAc('o_eski');
    e.degis('select[data-f="priority"]', '1');
    e.degis('select[data-f="status"]', 'taslak');
    expect(e.emirler().filter((x) => x.kol).map((x) => [x.status, x.priority])).toEqual([['taslak', 1], ['taslak', 1]]);
    await waitFor(() => { expect(e.belge.querySelector('[data-act="releaseOrder"]')).not.toBeNull(); });
    e.tikla('[data-act="releaseOrder"]');
    expect(e.emirler().filter((x) => x.kol).map((x) => x.status)).toEqual(['serbest', 'serbest']);
    git(e, 'o_kol');
    expect(e.belge.querySelector('select[data-f="status"]')!.hasAttribute('disabled')).toBe(true);
    e.degis('select[data-f="status"]', 'tamam');
    expect(e.bildirim()).toContain('Kol bu alanı ana emirden alır.');
    expect(e.emirler().find((x) => x.id === 'o_kol')!.status).toBe('serbest');
    // Tamamlama torunu da tamamlar.
    e.tikla('[data-act="emirGit"][data-id="o_eski"]');
    e.tikla('[data-act="completeOrder"]'); e.tikla('[data-act="completeOrder"]');
    await waitFor(() => { expect(e.emirler().map((x) => x.status)).toEqual(['tamam', 'tamam', 'tamam']); });
    expect(e.ifade('st.items[0].stock')).toBe(50);
  }, 60000);

  it('ana emir silinince bütün kol soyu silinir', async () => {
    const d = await ekranAc({ altlar: [KOL(30, 1, 5), KOL(5, 2, 4, 'o_kol', 'o_ic')] });
    d.detayAc('o_eski');
    expect(d.emirler()).toHaveLength(3);
    d.tikla('[data-act="del"][data-kind="order"][data-id="o_eski"]'); d.tikla('[data-act="del"][data-kind="order"][data-id="o_eski"]');
    expect(d.emirler()).toHaveLength(0);
  }, 40000);

  it('ağaçta alt emirler ana emrin altında tür, adım aralığı, miktar ve durumla görünür; köprüsüz açılışta bölme düğmeleri yoktur', async () => {
    const e = await ekranAc({ altlar: [KOL(15, 1, 4), { id: 'o_parti', qty: 10, parentId: 'o_eski' }] });
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
    expect(e.belge.querySelector('.orow.alt .or-eylem')).toBeNull();
    git(e, 'o_kol');
    expect(e.belge.querySelector('.bl-katil')?.textContent).toContain('Bu kol ana emre 4 TAS adımında katılır.');
    expect(e.belge.querySelector('[data-act="katilAc"]')).toBeNull();
    expect(e.belge.querySelector('[data-act="emirAltGeri"]')).toBeNull();
    git(e, 'o_eski');
    expect(e.belge.querySelector('.eyap')?.textContent).toContain('Parti toplamı: ana emir 50 + alt emirler 10 = 60');
  }, 40000);

  it('ana emri silinmiş alt emir listede kök satır olarak görünür, girintisiz', async () => {
    const e = await ekranAc({ altlar: [KOL()] });
    e.ifade('(st.orders = st.orders.filter(o => o.id !== "o_eski"), render(), 1)');
    const satirlar = Array.from(e.belge.querySelectorAll('.orow'));
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]!.classList.contains('alt')).toBe(false);
    expect(satirlar[0]!.querySelector('.altchip')?.getAttribute('title')).toBe('Ana emri silinmiş kol');
  }, 40000);
});
