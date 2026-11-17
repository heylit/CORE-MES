import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3248-2: yatay hatta bağımsız dal, yarı mamul akışı, kendi şeridinde sürükle-bırak ve mini harita. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
type Govde = { adimlar: { opNo: number | null; dal: string | null; birlesen: string[]; bagimlilik: string }[] };
const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-hatli')).not.toBeNull(); });
  const d = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (d) fireEvent.click(d);
  return bolge;
};
// Ana hat OP 10, 20; Dal A OP 30 (OP 20 ardından); ana hat OP 40 (yarı mamul YM-0013 girer) ve OP 50 (A'yı birleştirir).
const dalli = () => [
  adimOrnegi(),
  adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] }),
  adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [], dal: 'A' }),
  adimOrnegi({ id: 'o40', seq: 40, opNo: 40, ins: [{ itemId: '13', qty: 1, scrap: 0 }] }),
  adimOrnegi({ id: 'o50', seq: 50, opNo: 50, ins: [], birlesen: ['A'] }),
];
const kur = (adimlar = dalli()) => {
  const k: { govde: Govde | null } = { govde: null };
  const d = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4, adimlar)]);
  const ym = { ...revizyonOrnegi('81', 'A', 'yururlukte', 1, [adimOrnegi({ id: 'y10', ins: [] }), adimOrnegi({ id: 'y20', seq: 20, opNo: 20, ins: [] })]), itemId: '13' };
  d.items = [...(d.items ?? []), { id: '13', kayitNo: 13, code: 'YM-0013', name: 'Örnek burç', type: 'yari', unit: 'adet', cost: null, stock: null, min: null,
    aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
  d.routeRevs = [...(d.routeRevs ?? []), ym];
  d.routes = { ...d.routes, 13: ym.data };
  sunucuKur(YONETICI, {
    durum: d,
    yazmalar: { 'POST /rota/revizyonlar/72/kaydet': (g) => { k.govde = g as Govde; return json(200, { id: 72, durum: 'taslak', surum: 5 }); } },
  });
  return k;
};
const hatAl = (bolge: HTMLElement) => within(bolge).getByRole('group', { name: 'Yatay hat' });
const kart = (hat: HTMLElement, op: number) => within(hat).getByRole('button', { name: `OP ${String(op)} Tornalama` });
const arti = (hat: HTMLElement, op: number) => within(hat).getByRole('button', { name: `OP ${String(op)} ardına adım ekle` }).parentElement!;
// jsdom DataTransfer taşımaz: sürükleme verisi elle taşınır.
const surukle = (kaynak: HTMLElement, hedef: HTMLElement) => {
  const veri = new Map<string, string>();
  const dataTransfer = { setData: (t: string, v: string) => { veri.set(t, v); }, getData: (t: string) => veri.get(t) ?? '', effectAllowed: 'all', dropEffect: 'move' };
  fireEvent.dragStart(kaynak, { dataTransfer });
  const ust = createEvent.dragOver(hedef, { dataTransfer });
  fireEvent(hedef, ust);
  const kabul = ust.defaultPrevented;
  if (kabul) fireEvent.drop(hedef, { dataTransfer });
  fireEvent.dragEnd(kaynak, { dataTransfer });
  return kabul;
};
const sira = (g: Govde | null) => g?.adimlar.map((a) => [a.opNo, a.dal, a.birlesen.join(''), a.bagimlilik]);

describe('3248-2 çalışma alanı', () => {
  it('ana hat adımına katılan bağımsız dal: palet yeri söyler, eklenen adım bağımsızdır, hedef dalı birleştirir; hatta etiketi görünür', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(kart(hatAl(bolge), 40));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Akış ve dal/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Buraya katılan dal ekle' }));
    expect(within(bolge).getByText('Bu parça stoğa girecek ya da başka üründe de kullanılacaksa yarı mamul olarak açın.')).toBeTruthy();
    const palet = within(bolge).getByRole('dialog', { name: 'Adım ekle' });
    expect(within(palet).getByText('MM-0001: yeni bağımsız Dal B, OP 40 Tornalama adımında ana hatta katılır')).toBeTruthy();
    fireEvent.click(within(palet).getByRole('button', { name: /Tornalama/ }));
    expect(within(hatAl(bolge)).getByText(/Dal B \(bağımsız\) · ana hatta OP 50'de katılır/)).toBeTruthy();
    expect(within(within(bolge).getByRole('region', { name: 'Süre şeridi' })).getByText('Dal B (bağımsız)')).toBeTruthy();
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)).toEqual([
      [10, null, '', 'bekleyen'], [20, null, '', 'bekleyen'], [30, 'A', '', 'bekleyen'], [null, 'B', '', 'bagimsiz'], [40, null, 'B', 'bekleyen'], [50, null, 'A', 'bekleyen'],
    ]);
  }, 30000);

  it('ayrı başlayan dal hattaki + listesinden açılır: "Bu adıma katılan dal" (3295 a)', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(hatAl(bolge)).getByRole('button', { name: 'OP 40 ardına adım ekle' }));
    const liste = within(bolge).getByRole('dialog', { name: 'Adım ekle' });
    fireEvent.click(within(liste).getByRole('button', { name: /Bu adıma katılan dal \(OP 40; rotanın başından başlar\)/ }));
    const yeni = within(bolge).getByRole('dialog', { name: 'Adım ekle' });
    expect(within(yeni).getByText('MM-0001: yeni bağımsız Dal B, OP 40 Tornalama adımında ana hatta katılır')).toBeTruthy();
    expect(within(yeni).queryByRole('button', { name: /Bu adıma katılan dal/ })).toBeNull();
    fireEvent.click(within(yeni).getByRole('button', { name: /Tornalama/ }));
    expect(within(bolge).queryByRole('dialog', { name: 'Adım ekle' })).toBeNull();
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)).toEqual([
      [10, null, '', 'bekleyen'], [20, null, '', 'bekleyen'], [30, 'A', '', 'bekleyen'], [null, 'B', '', 'bagimsiz'], [40, null, 'B', 'bekleyen'], [50, null, 'A', 'bekleyen'],
    ]);
  }, 30000);

  it('adım yalnız kendi şeridine bırakılır; bırakınca Geri al bildirimi çıkar ve geri alır', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const hat = hatAl(bolge);
    // Dal adımı ana hattaki artıya bırakılamaz.
    expect(surukle(kart(hat, 30), arti(hat, 40))).toBe(false);
    // Ana hatta OP 40, OP 50'nin ardına: dal adımı ve dalın çatalı (OP 20) yerinde kalır.
    expect(surukle(kart(hat, 40), arti(hat, 50))).toBe(true);
    const bildirim = await screen.findByText('OP 40 OP 50 ardına taşındı.');
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([10, 20, 30, 50, 40]);
    k.govde = null;
    fireEvent.click(within(bildirim.closest('[role="status"], [role="alert"], div')!.parentElement!).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([10, 20, 30, 40, 50]);
  }, 30000);

  it('adımın üstüne bırakılan adım onun yerini alır; şeridin başına da taşınır (3295)', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const hat = hatAl(bolge);
    // Başka şeridin adımının üstüne bırakılmaz.
    expect(surukle(kart(hat, 30), kart(hat, 40).parentElement!)).toBe(false);
    // Arkadaki öne gelir: OP 20, OP 10'un üstüne bırakılınca şeridin başına geçer.
    // OP 20 dalın çatalı olduğundan taşıma önce onay ister (2542 E).
    expect(surukle(kart(hat, 20), kart(hat, 10).parentElement!)).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Taşı' }));
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([20, 10, 30, 40, 50]);
  }, 30000);

  // Test ön bakışı (3295 T1): ileri giden hedefin ardına, ortadaki hedefe geri gelen onun önüne geçer.
  it('ileri bırakılan adım hedefin ardına, ortadaki hedefe geri bırakılan onun önüne geçer (3295)', async () => {
    const duz = () => [10, 20, 30, 40].map((n) => adimOrnegi(n === 10 ? {} : { id: `o${String(n)}`, seq: n, opNo: n, ins: [] }));
    let k = kur(duz());
    rrAc('/recete-rota/schema');
    let hat = hatAl(await bolumAc());
    expect(surukle(kart(hat, 10), kart(hat, 30).parentElement!)).toBe(true);
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([20, 30, 10, 40]);
    cleanup();
    k = kur(duz());
    rrAc('/recete-rota/schema');
    hat = hatAl(await bolumAc());
    expect(surukle(kart(hat, 40), kart(hat, 20).parentElement!)).toBe(true);
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([10, 40, 20, 30]);
  }, 30000);

  it('Öne / Geriye yatay hatta kendi şeridinde yer değiştirir', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(kart(hatAl(bolge), 40));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(within(panel).queryByRole('button', { name: 'Yukarı' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Geriye' }));
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    // OP 40, ana hattaki sonraki adım OP 50 ile yer değiştirir; Dal A adımı (OP 30) yerinde kalır.
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([10, 20, 30, 50, 40]);
  }, 30000);

  it('ana hatta dalın çatal adımı taşınınca onay penceresi çıkar; Vazgeç sırayı korur, Taşı kaydeder', async () => {
    const k = kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    // Dal A OP 20 ardından başlar; OP 20, OP 40 ardına giderse çatal OP 40 olur.
    expect(surukle(kart(hatAl(bolge), 20), arti(hatAl(bolge), 40))).toBe(true);
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Dalın yeri değişsin mi?' })).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((r) => { setTimeout(r, 1500); });
    expect(k.govde).toBeNull();
    fireEvent.click(kart(hatAl(bolge), 20));
    fireEvent.click(within(within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' })).getByRole('button', { name: 'Geriye' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Dalın yeri değişsin mi?' })).getByRole('button', { name: 'Taşı' }));
    await waitFor(() => { expect(k.govde).not.toBeNull(); }, BEKLE);
    expect(sira(k.govde)?.map((x) => x[0])).toEqual([10, 40, 30, 20, 50]);
  }, 30000);

  it('yarı mamul akışı hattın üstünde açılır, salt okunurdur; süre şeridinde kendi satırı vardır; YM rotası kendi ekranında açılır', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const hat = hatAl(bolge);
    expect(within(hat).queryByRole('group', { name: 'YM-0013 yarı mamul akışı' })).toBeNull();
    const ac = within(hat).getByRole('button', { name: /2 adım/ });
    fireEvent.click(ac);
    expect(ac.getAttribute('aria-expanded')).toBe('true');
    const akis = within(hat).getByRole('group', { name: 'YM-0013 yarı mamul akışı' });
    expect(akis.textContent).toContain('OP 40 için · salt okunur');
    expect(akis.querySelectorAll('.tc-rr1-hk-ym')).toHaveLength(2);
    expect(within(akis).queryAllByRole('button', { name: /Tornalama/ })).toHaveLength(0);
    const serit = within(bolge).getByRole('region', { name: 'Süre şeridi' });
    expect(within(serit).getByText('YM-0013 (YM)')).toBeTruthy();
    expect(within(serit).getByRole('group', { name: 'YM-0013 yarı mamul akışı' }).children).toHaveLength(2);
    fireEvent.click(within(akis).getByRole('button', { name: /YM rotasını aç/ }));
    await waitFor(() => { expect(within(bolge).queryByRole('group', { name: 'YM-0013 yarı mamul akışı' })).toBeNull(); });
    expect(within(bolge).getAllByText(/YM-0013 rotası/).length).toBeGreaterThan(0);
  }, 30000);

  it('mini harita bütün adımları taşır ve hattı kaydırır; klavyeyle de kayar', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const harita = within(bolge).getByRole('scrollbar', { name: 'Mini harita: hattın görünen bölümü' });
    expect(harita.querySelectorAll('.tc-rr1-hrt-k')).toHaveLength(5);
    const hat = hatAl(bolge);
    expect(harita.getAttribute('aria-controls')).toBe(hat.id);
    Object.defineProperty(hat, 'scrollWidth', { configurable: true, value: 2000 });
    Object.defineProperty(hat, 'clientWidth', { configurable: true, value: 500 });
    fireEvent.keyDown(harita, { key: 'End' });
    expect(hat.scrollLeft).toBeGreaterThan(0);
    fireEvent.keyDown(harita, { key: 'Home' });
    expect(hat.scrollLeft).toBe(0);
  }, 30000);
});
