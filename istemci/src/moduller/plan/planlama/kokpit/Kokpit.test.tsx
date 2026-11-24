import { useMemo, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaSecimi } from '../gorunumler.ts';
import { bekleyenListesi, type CalismaKomutu } from '../kayit.ts';
import type { BekleyenDegisiklik } from '../tipler.ts';
import { kaynakSatiri } from '../ortak/degisiklik-seridi/kurallar.ts';
import { otomatikUygulaIste, otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { SeritYuvasi, type SeritYuvalari } from '../motor/ust/yuva.ts';
import { saatYaz } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';
import { onayAcIste } from './istek.ts';
import * as gonder from '../motor/atolye/gonder.ts';
import { etkiCumlesi, gecikenler, onayCumlesi } from './Tahta.tsx';
import type { KokpitEmri, KokpitIsi } from './kurallar.ts';

// Oklar seçimi Araçlar menüsündedir (3365).
function okKipiSec(ad: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Araçlar' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(ad) }));
}

// Örnek çalışma uydurmadır (iki emir: biri geç, biri riskli). Sunucu çağrısı yapılmaz; taşıma ve tur ekran testindedir
// (ekran-testleri/planlama-kokpit.spec.ts).
saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); otomatikUygulaSifirla(); planKurSifirla(); });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
function komutKur(adim: number): CalismaKomutu {
  return {
    degistir: () => false, geriAl: vi.fn(() => true), geriAlinabilir: () => adim > 0, geriAdimlari: () => Array.from({ length: adim }, (_, i) => ({ ne: `Değişiklik ${String(i)}`, t: 0 })),
    geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4),
  };
}
// Plan şeridi iskelettedir; Kokpit değişiklik özetini ve listesini şeridin iki yuvasına taşır (3317). Testte yuvalar burada kurulur.
function Yuvali({ children, dis = null }: { children: ReactNode; dis?: BekleyenDegisiklik | null }) {
  const [y, kur] = useState<SeritYuvalari>({ satir: null, alt: null });
  // Bağlar sabit kalmalı: her çizimde yeni işlev verilirse React önce null sonra öğeyle çağırır ve çizim döner.
  const bag = useMemo(() => ({
    satir: (el: HTMLElement | null) => { kur((x) => (x.satir === el ? x : { ...x, satir: el })); },
    alt: (el: HTMLElement | null) => { kur((x) => (x.alt === el ? x : { ...x, alt: el })); },
  }), []);
  return (
    <SeritYuvasi.Provider value={{ ...y, dis }}>
      <div data-test-yuva="satir" ref={bag.satir} />
      <div data-test-yuva="alt" ref={bag.alt} />
      {children}
    </SeritYuvasi.Provider>
  );
}
function ac(oz: Partial<PlanlamaEkranOzellikleri> = {}, yaz = true, dis: BekleyenDegisiklik | null = null) {
  const sec = vi.fn();
  const git = vi.fn();
  render(
    <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici><Yuvali dis={dis}>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={yaz ? komutKur(0) : null} git={git} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={sec} {...oz}
      />
    </Yuvali></BildirimSaglayici></MemoryRouter>,
  );
  return { sec, git };
}

// Seçimi tutan sarmal: tıklama seçimi gerçekten değiştirir (çoklu seçim seçili işe bakar).
function SecimliKokpit() {
  const [secim, kur] = useState<PlanlamaSecimi>(BOS_SECIM);
  return (
    <Kokpit
      depo={DEPO} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
      olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={secim} sec={(x) => { kur((y) => ({ ...y, ...x })); }}
    />
  );
}
function acSecimli() {
  render(<MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici><Yuvali><SecimliKokpit /></Yuvali></BildirimSaglayici></MemoryRouter>);
}

describe('Kokpit', () => {
  it('tahtayı, sayıları ve işleri çizer; işe tıklamak emri ve adımı seçer', () => {
    const { sec } = ac();
    const suzgec = screen.getByRole('group', { name: 'Durum süzgeci' });
    expect(within(suzgec).getByRole('button', { name: /Geç/ }).textContent).toContain('1');
    expect(within(suzgec).getByRole('button', { name: /Riskli/ }).textContent).toContain('1');
    const isler = document.querySelectorAll('.tc-pyq-is');
    expect(isler.length).toBe(5);
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    expect(is?.dataset.d).toBe('risk');
    if (is) fireEvent.click(is);
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: '3.10' });
    // Fason adım taşınmaz diye işaretlidir; süren iş taşınır (durdurulur, kalanı gider) ve bunu adında söyler.
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sabit')).toBe(false);
    expect(document.querySelector('[data-is="2.20"]')?.getAttribute('title')).toContain('sürüyor, taşınırsa durdurulur');
    expect(document.querySelector('[data-is="2.30"]')?.hasAttribute('data-sabit')).toBe(true);
  });

  it('durdurulup taşınan iş sahada sürerken çubuk adında "terminalde durdurulmayı bekliyor" yazar (3414-7 a)', () => {
    const c = ornekCalisma();
    ac({ calisma: { ...c, w: { ...c.w, durdurulan: { '2.20': 1 } }, gercek: { '2.20': { m: '3', S: 138.5, A: 10, n: 4 } } } as typeof c });
    const cubuk = document.querySelector('[data-is="2.20"]');
    expect(cubuk?.hasAttribute('data-durdurma-bekliyor')).toBe(true);
    expect(cubuk?.getAttribute('title')).toContain('terminalde durdurulmayı bekliyor');
    expect(document.querySelector('[data-is="3.10"]')?.hasAttribute('data-durdurma-bekliyor')).toBe(false);
  });

  it('süzgeç uymayan emrin işlerini soluklaştırır, listeyi daraltır', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Durum süzgeci' })).getByRole('button', { name: /Geç/ }));
    expect(document.querySelector('[data-is="3.10"]')?.hasAttribute('data-sonuk')).toBe(true);
    expect(document.querySelector('[data-is="2.40"]')?.hasAttribute('data-sonuk')).toBe(false);
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Sipariş' }));
    expect(within(screen.getByRole('list', { name: 'Emirler' })).getAllByRole('button')).toHaveLength(1);
  });

  it('telefon listesi: Tezgâh gözünde işler tezgâha göre toplanır, ilk üçten sonrası düğmeyle açılır', () => {
    const { sec } = ac();
    const liste = screen.getByRole('group', { name: 'Tezgâhlar ve işler' });
    const basliklar = within(liste).getAllByRole('heading', { level: 3 });
    expect(basliklar.length).toBeGreaterThan(1);
    const satir = liste.querySelector<HTMLElement>('section ul button:not(.tc-pyq-liste-daha)');
    expect(satir).not.toBeNull();
    if (satir) fireEvent.click(satir);
    expect(sec).toHaveBeenCalledTimes(1);
    expect(sec.mock.calls[0]?.[0]).toMatchObject({ adim: expect.any(String) as unknown });
  });

  // 3304 a: ayrı ayrıntı paneli yoktur; seçili emrin kartı açılır, bilgileri ve seçili işi Operasyonlar bölümündedir.
  it('seçili emrin ayrıntı paneli açılmaz; kartı seçilir, operasyonu bölümde işaretlenir, durum ve termin emrin satırındadır', () => {
    ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    expect(screen.queryByRole('complementary', { name: /ayrıntısı/ })).toBeNull();
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-emir="2"]')).not.toBeNull();
    expect(bolum.querySelector('[data-adim="2.20"]')?.getAttribute('aria-current')).toBe('true');
    expect(bolum.querySelector('[data-emir="2"] [data-emir-ozet]')?.textContent).toMatch(/adet · .* · termin /);
    expect(within(bolum).queryByRole('button', { name: /ayrıntısını aç/ })).toBeNull();
  });

  it('Matris yükü ve emirleri tek tabloda gösterir; tıklama görünümü değiştirmez, emri ve adımı seçer', () => {
    const { sec } = ac();
    const goz = within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Matris' });
    fireEvent.click(goz);
    expect(screen.getByRole('status').textContent).toContain('1 emir geç.');
    const akis = screen.getByRole('region', { name: 'Tezgâh yükü ve emirler, gün gün' });
    // Gün başlıkları (tezgâh sütunu + 14 gün) ve "Emirler" bölüm başlığı.
    expect(within(akis).getAllByRole('columnheader')).toHaveLength(16);
    // Fason satırı yük şeridinde yoktur (kapasitesi izlenmez): beş tezgâh, iki emir.
    expect(akis.querySelectorAll('tr[data-yuk-satiri]')).toHaveLength(5);
    expect(akis.querySelectorAll('tbody tr[data-emir]')).toHaveLength(2);
    const emirDugmesi = akis.querySelector<HTMLElement>('[data-emir-sec="2"]');
    if (emirDugmesi) fireEvent.click(emirDugmesi);
    expect(sec).toHaveBeenLastCalledWith({ siparis: '2', adim: null });
    const cip = akis.querySelector<HTMLElement>('[data-hucre="3.10"]');
    if (cip) fireEvent.click(cip);
    expect(sec).toHaveBeenLastCalledWith({ siparis: '3', adim: '3.10' });
    expect(goz.getAttribute('aria-pressed')).toBe('true');
    // Yük hücresi o tezgâhta o gün işi olan emirleri süzer.
    const yukDugmesi = akis.querySelector<HTMLElement>('tr[data-yuk-satiri] td:not([data-yuk="bos"]):not([data-yuk="kapali"]) button');
    if (!yukDugmesi) throw new Error('dolu yük hücresi yok');
    fireEvent.click(yukDugmesi);
    expect(screen.getByText(/süzgeci/)).toBeTruthy();
    expect(akis.querySelectorAll('tbody tr[data-emir]').length).toBeLessThan(3);
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci kaldır' }));
    expect(akis.querySelectorAll('tbody tr[data-emir]')).toHaveLength(2);
  });

  it('Matris Yan yana düzeninde yük tablosu ve emir × adım tablosu ayrıdır', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Matris' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Düzen' })).getByRole('button', { name: 'Yan yana' }));
    const em = screen.getByRole('region', { name: 'Emir × adım matrisi' });
    expect(within(em).getAllByRole('row')).toHaveLength(3);
    expect(within(em).getAllByRole('columnheader').map((x) => x.textContent)).toEqual(['Emir', '1. adım', '2. adım', '3. adım', 'Bitiş / termin']);
    const yuk = screen.getByRole('region', { name: 'Tezgâh × gün yükü' });
    expect(within(yuk).getAllByRole('columnheader')).toHaveLength(15);
    expect(within(yuk).getAllByRole('row')).toHaveLength(6);
  });

  it('Matriste seçili emir aynı ekranda işaretlenir; ayrı panel açılmaz', () => {
    ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Matris' }));
    expect(screen.queryByRole('complementary', { name: /ayrıntısı/ })).toBeNull();
    expect(document.querySelector('tbody tr[data-emir="2"]')?.hasAttribute('data-sec')).toBe(true);
    // Seçili emrin geçtiği tezgâh-günler yükte çerçevelidir.
    expect(document.querySelectorAll('tr[data-yuk-satiri] td[data-iz]').length).toBeGreaterThan(0);
  });

  // 3282 1d-2b: Kokpit kişinin taslağıyla çalışır. Sunucu sahtedir; taslağın görünümü örnek çalışmadır.
  const satir = (komut: Record<string, unknown>, ne: string) => ({ komut, ne, t: 1, hata: null });
  const AYAR = { tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, ayrinti: '' };
  const TASI = { tur: 'tasi', isId: '3.10', tezgah: 'T2', baslangic: 40 };
  // Görünüm sunucunun kayıt biçimindedir: eksik alanı (burada duruşlar) olabilir; sayfa onu ortak çalışma gibi okur.
  const gorunum = () => { const { down: _, ...c } = { ...ornekCalisma(), bekleyen: [] }; return c; };
  const taslakCevabi = (l: unknown[]) => ({ taslak: l.length === 0 ? null : { surum: 10 + l.length, tabanSurum: 4, satirlar: l }, calisma: gorunum(), surum: 4 });
  function taslakSunucusu(l: unknown[]) {
    let simdi = [...l];
    vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve((yol === '/plan/taslagim' ? taslakCevabi(simdi) : null) as never));
    const post = vi.spyOn(api, 'post').mockImplementation((yol: string) => {
      if (yol === '/plan/taslagim/geri-al') simdi = simdi.slice(0, -1);
      if (yol === '/plan/taslagim/uygula') { simdi = []; return Promise.resolve({ durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 0 } as never); }
      return Promise.resolve(taslakCevabi(simdi) as never);
    });
    return { post };
  }

  // 3317 a (2. adım): satır taslakta uygulandıysa (görünümün bekleyenlerinde yok) listede durmaz; toplu düğme ortak planı sayar, not farkı söyler.
  it('taslakta uygulanan veri değişikliği listeden düşer; not toplu düğmenin ortak plandaki sayısını ve taslaktaki satırı söyler', async () => {
    const b = (id: string, isler: string[]): BekleyenDegisiklik => ({ id, ne: `Değişti ${id}`, ayrinti: '', kim: 'Deneme Kisi', t: 1, isler, geri: [] });
    const temel = ornekCalisma();
    const ortak = { ...temel, bekleyen: [b('ORN-a', ['1']), b('ORN-b', ['2'])] } as ReturnType<typeof ornekCalisma>;
    expect(ortak.plan?.dataVer).not.toBe(ortak.dataVer);
    // Görünüm: ORN-a dizildi ve düştü, ORN-b bekliyor; plan hâlâ veriden eski.
    const g = { ...ortak, dataVer: ortak.dataVer + 2, bekleyen: [b('ORN-b', ['2'])] };
    vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve((yol === '/plan/taslagim' ? { taslak: { surum: 12, tabanSurum: 4, satirlar: [satir({ tur: 'yeniden-planla', isler: ['1'] }, 'Yeniden planlama istendi'), satir({ tur: 'diz', isler: ['1'] }, 'Plan yeniden dizildi')] }, calisma: g, surum: 4 } : null) as never));
    ac({ calisma: ortak });
    await screen.findByRole('region', { name: 'Değişiklikleriniz' });
    await waitFor(() => { expect((document.querySelector('[data-degisiklik-ozeti] b') as HTMLElement).textContent).toBe('1 değişiklik'); });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    const veri = within(liste).getByRole('region', { name: 'Veri değişti' });
    expect(within(veri).getAllByRole('listitem').map((x) => x.querySelector('b')?.textContent)).toEqual(['Değişti ORN-b']);
    expect(within(veri).getAllByRole('button', { name: 'Etkisini gör' })).toHaveLength(1);
    expect(liste.textContent).toContain('"Planı güncelle (2)"');
    expect(liste.textContent).toContain('1 veri değişikliği taslağınızda uygulandı, listede durmaz');
  });

  it('taslak varken Geri taslağın değişiklik sayısını gösterir, son değişikliği dizmesiyle birlikte geri alır; Canlıya al yalnız taslak çubuğundadır', async () => {
    const { post } = taslakSunucusu([satir(AYAR, 'Plan ayarı'), satir(TASI, '3.10 → T2'), satir({ tur: 'diz', isler: ['*'] }, 'Plan yeniden dizildi')]);
    ac({ yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al']) });
    const cubuk = await screen.findByRole('region', { name: 'Değişiklikleriniz' });
    expect(within(cubuk).getByText('2 değişiklik · canlıya alınmadı')).toBeTruthy();
    const geri = within(screen.getByRole('group', { name: 'Geri ve İleri' })).getByRole('button', { name: /Geri/ });
    expect(geri.querySelector('.tc-pyq-rozet')?.textContent).toBe('2');
    // Taslak varken canlıya alma taslak çubuğundaki tek düğmededir; üst şeritte ikincisi yoktur.
    expect(screen.getAllByRole('button', { name: /Canlıya al/ }).map((b) => cubuk.contains(b))).toEqual([true]);
    fireEvent.click(geri);
    await waitFor(() => { expect(within(cubuk).getByText('1 değişiklik · canlıya alınmadı')).toBeTruthy(); });
    // Geri alınca kalan taslak yeniden dizilir: önce iki geri-al, sonra taslağın görünümünde değerlendirme.
    await waitFor(() => { expect(post.mock.calls.length).toBeGreaterThanOrEqual(3); });
    expect(post.mock.calls.slice(0, 3).map((c) => [c[0], c[1]])).toEqual([
      ['/plan/taslagim/geri-al', { taslakSurumu: 13 }], ['/plan/taslagim/geri-al', { taslakSurumu: 12 }],
      ['/plan/taslagim/degerlendirme', { taslakSurumu: 11, istek: { tur: 'plan-uygula', isler: ['*'] } }],
    ]);
    // İleri (3365): geri alınan taşıma görünür olur; Ctrl+Y onu taslağa yeniden yazar, sonra İleri kalkar.
    const ileri = await within(screen.getByRole('group', { name: 'Geri ve İleri' })).findByRole('button', { name: /İleri/ });
    expect(ileri.querySelector('.tc-pyq-rozet')?.textContent).toBe('1');
    await waitFor(() => { expect(ileri.hasAttribute('disabled')).toBe(false); });
    post.mockClear();
    // Yazma sürerken (meşgul) ikinci Ctrl+Y aynı değişikliği yeniden yazmaz (Test T2).
    const asil = post.getMockImplementation()!;
    let birak = (): void => undefined;
    post.mockImplementation(((yol: string, ...r: unknown[]) => (yol === '/plan/taslagim/komut'
      ? new Promise((t) => { birak = () => { t((asil as (...x: unknown[]) => unknown)(yol, ...r)); }; })
      : (asil as (...x: unknown[]) => unknown)(yol, ...r))) as never);
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    await waitFor(() => { expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/plan/taslagim/komut', { taslakSurumu: 11, komut: TASI }]); });
    await waitFor(() => { expect(ileri.hasAttribute('disabled')).toBe(true); });
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(post.mock.calls.filter((c) => c[0] === '/plan/taslagim/komut')).toHaveLength(1);
    birak();
    await waitFor(() => { expect(within(screen.getByRole('group', { name: 'Geri ve İleri' })).queryByRole('button', { name: /İleri/ })).toBeNull(); });
  });

  // Risk 3282 1d-3 N1: tek düğme ortak plana yazar; onay sayfası bunu kalıcı söyler, canlı değişince ya da sayfa kapanınca söylemez.
  it('taslak çubuğundan yazılınca onay sayfasında taslağın yazıldığı satırı durur; canlı değişince ve üst düğmeyle açılınca yoktur', async () => {
    taslakSunucusu([satir(TASI, '3.10 → T2')]);
    const sen = (canliSurum: number) => ({ canli: null, canliSurum, senaryolar: [] });
    const sayfa = (canliSurum: number) => (
      <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar: sen(canliSurum) } as unknown as PlanlamaDeposu} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>
    );
    const { rerender } = render(sayfa(3));
    const SATIR = 'Değişiklikleriniz ortak plana yazıldı; canlı plan değişmedi.';
    const satirVar = () => screen.queryAllByRole('status').some((e) => e.textContent === SATIR);
    fireEvent.click(within(await screen.findByRole('region', { name: 'Değişiklikleriniz' })).getByRole('button', { name: 'Canlıya al' }));
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    expect(satirVar()).toBe(true);
    rerender(sayfa(4));
    await waitFor(() => { expect(satirVar()).toBe(false); });
    fireEvent.click(screen.getByRole('button', { name: 'Kokpit\'e dön' }));
    fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    expect(satirVar()).toBe(false);
  });

  // Onayda bekleyen eski bir plan varken (3333, 3335 a): sayfa nereden açılırsa açılsın kişinin kendi planıyla ("Planım") açılır; eski plan
  // ayrı sekmededir, kendi planı sanılıp canlıya alınmaz.
  it.each([[true], [false]])('onayda plan varken taslaktan gelindi mi %s: sayfa "Planım" ile açılır, onaydaki plan "Onay bekleyenler (1)" sekmesindedir', async (taslaktan) => {
    taslakSunucusu(taslaktan ? [satir(TASI, '3.10 → T2')] : []);
    // Onaydaki planın motor ayarı bu testte okunmaz.
    const temel = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(((yol: string) => (yol.startsWith('/plan/motor-ayarlari') ? Promise.reject(new Error('yok')) : temel(yol))) as never);
    const eski = {
      id: 7, ad: 'ORN-Eski plan', aciklama: null, durum: 'onayda', acan: 'ORN-Planlamaci', benim: true, acilma: '2026-10-01T05:00:00Z', surum: 2, tabanPlanSurumu: 2, canliDegisti: false,
      gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: true, geriGonder: true, canliyaAl: true },
    };
    render(
      <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar: { canli: null, canliSurum: 3, senaryolar: [eski] } } as unknown as PlanlamaDeposu} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>,
    );
    if (taslaktan) fireEvent.click(within(await screen.findByRole('region', { name: 'Değişiklikleriniz' })).getByRole('button', { name: 'Canlıya al' }));
    else fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
    await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 });
    expect(screen.getByRole('tab', { name: 'Planım' }).getAttribute('aria-selected')).toBe('true');
    const karar = (await screen.findByRole('heading', { name: 'Karar' })).closest('.tc-kart') as HTMLElement;
    expect(within(karar).getByRole('heading', { name: 'Planı canlıya al' })).toBeTruthy();
    expect(screen.queryByText('ORN-Eski plan')).toBeNull();
    // Öteki plan kendi sekmesindedir; orada seçili gelir ve kararı kendi düğmeleriyle verilir.
    fireEvent.click(screen.getByRole('tab', { name: 'Onay bekleyenler (1)' }));
    expect((await screen.findAllByText('ORN-Eski plan')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Onayla ve canlıya al' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Planı canlıya al' })).toBeNull();
  });

  // Komut başka sayfada çalışmayı değiştirdiyse ortak plan kendiliğinden yeniden dizilir; taslak varken dizilmez (örnek çalışmanın planı bayattır).
  it.each([[true, 0], [false, 1]])('taslak %s iken ortak çalışmanın kendiliğinden dizilmesi %i kez başlar', async (taslakVar, n) => {
    taslakSunucusu(taslakVar ? [satir(TASI, '3.10 → T2')] : []);
    const kaydet = vi.fn(() => new Promise<number>(() => undefined));
    otomatikUygulaIste({ calismaSurumu: 4, oncekiSurum: 3 });
    ac({ komut: { ...komutKur(0), kaydet } });
    if (taslakVar) await screen.findByRole('region', { name: 'Değişiklikleriniz' });
    await waitFor(() => { expect(kaydet).toHaveBeenCalledTimes(n); });
    expect(kaydet).toHaveBeenCalledTimes(n);
  });

  it('taslak yokken Geri pasiftir ve taslak çubuğu görünmez', async () => {
    taslakSunucusu([]);
    ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    expect(within(screen.getByRole('group', { name: 'Geri ve İleri' })).getByRole('button', { name: /Geri/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Değişiklikleriniz' })).toBeNull();
  });

  it('yazamayan kişide tutma kapalıdır: sağ tık menü açmaz, Onaya gönder yoktur', () => {
    ac({}, false);
    expect(document.querySelectorAll('.tc-pyq-is').length).toBe(5);
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (is) fireEvent.contextMenu(is);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onaya gönder' })).toBeNull();
  });

  it('yazabilen kişide sağ tık menüsü yalnız Ayrıntı sunar (3365); çift tık işi tutar, ipucu çıkar, Esc vazgeçer', () => {
    ac();
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (!is) throw new Error('iş yok');
    fireEvent.contextMenu(is);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((x) => x.textContent)).toEqual([expect.stringContaining('Ayrıntı')]);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.doubleClick(is);
    expect(screen.getByText(/Bırakmak için tıklayın/)).toBeTruthy();
    expect(document.querySelector('[data-satir="1"]')?.getAttribute('data-aday')).toBe('evet');
    expect(document.querySelector('[data-satir="3"]')?.getAttribute('data-aday')).toBe('hayir');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Bırakmak için tıklayın/)).toBeNull();
  });

  it('Onaya gönder yalnız gönderilebilirken birincildir: plan güncel değilken sayfanın birincili plan çubuğundadır', () => {
    // Örnek çalışmada veri plandan sonra değişmiştir.
    const c = ornekCalisma();
    ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer } });
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).className).toContain('tc-dugme-birincil');
    cleanup();
    ac();
    const d = screen.getByRole('button', { name: 'Onaya gönder' });
    expect(d.className).not.toContain('tc-dugme-birincil');
    // 3282: engel varken de bölüm açılır (müdür onaydakini onaylar); nedeni ipucundadır.
    expect(d.hasAttribute('disabled')).toBe(false);
    expect(d.getAttribute('title')).toMatch(/^Gönderilemez/);
  });

  it('3B görünümünde WebGL yoksa sahne açılmaz, Matris önerilir; emirler ve bakışlar yine çalışır', async () => {
    // Onaylı plan okuması bekletilir: sunucu yok, bakış "okunuyor" der.
    const oku = vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    const { sec } = ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: '3B' }));
    expect(oku).toHaveBeenCalledWith('/plan/planlama-calismasi/taban-ve-canli');
    expect(await screen.findByText(/3B çizim açılamıyor/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Kamera' })).toBeNull();
    // 2B / 3B Matris: sağda açıklama paneli, altta emir tablosu (geç olan üstte); emre tıklamak onu seçer.
    expect(screen.getByRole('complementary', { name: 'Açıklama' }).textContent).toContain('2B/3B geçişli Matris');
    const satirlar = within(screen.getByRole('region', { name: 'Emirler' })).getAllByRole('button');
    expect(satirlar).toHaveLength(2);
    fireEvent.click(satirlar[0] as HTMLElement);
    expect(sec).toHaveBeenCalledWith({ siparis: '2', adim: null });
    const bakis = screen.getByRole('group', { name: '3B bakış' });
    fireEvent.click(within(bakis).getByRole('button', { name: 'Yük ve gecikme' }));
    expect(screen.getByText(/Saydamlık/).parentElement?.textContent).toContain('taslakta yeri değişen');
    expect(screen.getByRole('complementary', { name: 'Açıklama' }).textContent).toContain('Onaylı plan okunuyor.');
    expect(screen.queryByRole('region', { name: 'Emirler' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Matris'e geç" }));
    expect(document.querySelector('.tc-pyq-mat-kap')).not.toBeNull();
  });

  // 3282-4 a, 3335 a: canlıya alma yetkisi olana düğme Canlıya al'dır; onay sayfası Kokpit'in yerine açılır (üst çubuk ve tahta yok), düğmeyle dönülür.
  it('Canlıya al onay sayfasını Kokpit\'in yerine açar; onay bekleyen sayısı düğmede ve sekmededir; Kokpit\'e dön tahtaya döner', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const senaryo = (id: number, ad: string, durum: string) => ({
      id, ad, aciklama: null, durum, acan: 'ORN-Planlamaci', benim: false, acilma: '2026-10-20T08:00:00Z', surum: 1, tabanPlanSurumu: 3, canliDegisti: false,
      gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: false, canliyaAl: false },
    });
    const senaryolar = { canli: null, canliSurum: 3, senaryolar: [senaryo(1, 'Onay Pzt', 'onayda'), senaryo(2, 'Deneme', 'acik')] };
    render(
      <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar } as unknown as PlanlamaDeposu} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /^Onaya gönder/ })).toBeNull();
    const d = screen.getByRole('button', { name: /^Canlıya al/ });
    expect(d.textContent).toBe('Canlıya al1');
    fireEvent.click(d);
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    expect(document.querySelector('.tc-pyq-tahta')).toBeNull();
    expect(document.querySelector('.tc-pyq-ust')).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Planım', 'Onay bekleyenler (1)', 'Geçmiş']);
    expect([...document.querySelectorAll('.tc-pyq-onay-adimlar li[aria-current]')].map((e) => e.textContent)).toEqual(['2 Kontrol et', '3 Canlıya al']);
    // Canlı planla fark okunamadı: yeri değişen ve yeni yerleşen sayı bilinmez, sıfır yazılmaz.
    expect([...document.querySelectorAll('.tc-pym-pa-ozet dd')].slice(0, 2).map((e) => e.textContent)).toEqual(['—', '—']);
    // Geçmiş: eski sürümler ve canlıdan sonra yapılanlar; Planım'da bu kutular yoktur.
    expect(screen.queryByRole('heading', { name: 'Geçmiş planlar' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Geçmiş' }));
    expect(screen.getByRole('heading', { name: 'Geçmiş planlar' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Canlıdan sonra yapılanlar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Planım' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kokpit\'e dön' }));
    expect(document.querySelector('.tc-pyq-tahta')).not.toBeNull();
    expect(document.querySelector('.tc-pyq-ust')).not.toBeNull();
    // İlk adım Kokpit'e dönen düğmedir; öteki iki adım düz yazıdır.
    fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
    fireEvent.click(await screen.findByRole('button', { name: '1 Planla Kokpit' }));
    expect(document.querySelector('.tc-pyq-tahta')).not.toBeNull();
    expect(document.querySelectorAll('.tc-pyq-onay-adimlar button')).toHaveLength(0);
  });

  // Müdürün işi: çalışma planı kurulmamışken onayda plan varsa sayfa "Onay bekleyenler" ile açılır; plan varken "Planım" ile (yukarıdaki test).
  it('çalışma planı yokken ve onayda plan varken onay sayfası "Onay bekleyenler" sekmesiyle açılır', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const bekleyen = {
      id: 1, ad: 'ORN-Onay plani', aciklama: null, durum: 'onayda', acan: 'ORN-Planlamaci', benim: false, acilma: '2026-10-20T08:00:00Z', surum: 1, tabanPlanSurumu: 3, canliDegisti: false,
      gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true },
    };
    render(
      <MemoryRouter initialEntries={['/plan?sayfa=onay']}><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar: { canli: null, canliSurum: 3, senaryolar: [bekleyen] } } as unknown as PlanlamaDeposu} calisma={{ ...ornekCalisma(), plan: null }} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>,
    );
    expect((await screen.findByRole('tab', { name: 'Onay bekleyenler (1)' }, { timeout: 5000 })).getAttribute('aria-selected')).toBe('true');
    expect((await screen.findAllByText('ORN-Onay plani')).length).toBeGreaterThan(0);
  });

  // 3335 a: canlıya alma yetkisi olmayan kişide sayfanın birincil düğmesi Onaya gönder'dir; Canlıya al yoktur.
  it('canlıya alma yetkisi olmayan kişide onay sayfasının birincil düğmesi Onaya gönder\'dir', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const c = ornekCalisma();
    ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer } });
    fireEvent.click(screen.getByRole('button', { name: /^Onaya gönder/ }));
    expect(await screen.findByRole('heading', { name: 'Planı onaya gönder' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).className).toContain('tc-dugme-birincil');
    expect(screen.queryByRole('button', { name: 'Canlıya al' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Not (isteğe bağlı)' })).toBeTruthy();
    expect([...document.querySelectorAll('.tc-pym-pa-ozet dt')].map((e) => e.textContent)).toEqual(['işin yeri değişti', 'yeni yerleşen iş', 'geciken sipariş', 'plansız kalan sipariş']);
  });

  it('Stüdyo\'dan "Kokpit\'te aç" ile gelinince onay sayfası açık başlar; istek bir kez alınır', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    onayAcIste();
    ac();
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    cleanup();
    ac();
    expect(document.querySelector('.tc-pyq-tahta')).not.toBeNull();
  });

  // 3317 a (1. adım): Gelenler ve "Tümü" kalktı; planı etkileyen değişiklikler plan şeridindeki özet ve listededir. Olaylar kaybolmaz: emre
  // bağlanamayan olay listede "Göster"siz durur, emre bağlı olay kartında sayıyla görünür.
  it('değişiklikler şeritte özetlenir; liste üç başlıkta açılır; emre bağlı olmayan satırda Göster yok; Göster emri seçer ve listeyi kapatır', () => {
    const bayat = { bayat: true, sonCanliyaAlma: '2026-10-20T06:00:00Z', olaylar: [
      { neden: 'durus', zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'ORN-T01' },
      { neden: 'satin-alma-termini', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 3, emirNo: '3', makineId: null, makineKod: null },
    ] };
    vi.stubGlobal('CSS', { escape: (x: string) => x });
    const { sec } = ac({ depo: { ...DEPO, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat } } as unknown as PlanlamaDeposu });
    expect(screen.queryByRole('complementary', { name: 'Gelenler' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tümü \(/ })).toBeNull();
    const ozet = document.querySelector('[data-test-yuva="satir"] [data-degisiklik-ozeti]') as HTMLElement;
    expect(ozet.textContent).toBe('3 değişiklik· 2 iş etkilendi1 veri · 2 sahaAç');
    const serit = screen.getByRole('region', { name: 'Siparişler, sırasıyla' });
    expect(serit.querySelector('[data-kart="3"] [data-olay]')?.textContent).toContain('1 değişiklik');
    expect(screen.queryByRole('region', { name: 'Planı etkileyen değişiklikler' })).toBeNull();
    const dugme = within(ozet).getByRole('button', { name: 'Değişiklikleri aç' });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme);
    const liste = within(document.querySelector('[data-test-yuva="alt"]') as HTMLElement).getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect([...liste.querySelectorAll('[data-baslik]')].map((x) => [x.getAttribute('data-baslik'), x.querySelectorAll('li').length])).toEqual([['veri', 1], ['saha', 2]]);
    const saha = within(liste).getByRole('region', { name: 'Sahada oldu' });
    const satirlar = within(saha).getAllByRole('listitem');
    // Yeniden eskiye: duruş (09:00) önce. Emre bağlanamadığı için "Göster" yok.
    expect(satirlar[0]?.textContent).toContain('Duruş: ORN-T01');
    expect(within(satirlar[0] as HTMLElement).queryByRole('button')).toBeNull();
    expect(satirlar[1]?.textContent).toContain('Malzemenin geliş tarihi değişti: 3');
    expect(satirlar[1]?.textContent).toContain('Satın alma');
    // Veri değişikliği emre bağlı değildir ("Göster" yok), etkisi satırdan görülür (2. adım); toplu düğmenin ne uygulayacağı notta yazar.
    expect(within(within(liste).getByRole('region', { name: 'Veri değişti' })).getAllByRole('button').map((x) => x.textContent)).toEqual(['Etkisini gör']);
    expect(liste.textContent).toContain('"Planı güncelle (1)" başka sayfalarda yapılan 1 değişikliği plana işler');
    fireEvent.click(within(satirlar[1] as HTMLElement).getByRole('button', { name: 'Emre git' }));
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: null });
    expect(screen.queryByRole('region', { name: 'Planı etkileyen değişiklikler' })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('değişiklik yokken şeritte "Plan güncel" yazar, düğme yoktur; yazamayan kişide toplu uygulama notu çıkmaz', () => {
    const guncel = ornekCalisma();
    const c = { ...guncel, dataVer: guncel.plan?.dataVer ?? guncel.dataVer } as ReturnType<typeof ornekCalisma>;
    ac({ calisma: c });
    const ozet = document.querySelector('[data-degisiklik-ozeti]') as HTMLElement;
    expect(ozet.textContent).toBe('Plan güncel');
    expect(within(ozet).queryByRole('button')).toBeNull();
    cleanup();
    ac({}, false);
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect(liste.textContent).not.toContain('Planı güncelle');
    // Yazamayan kişi taslak açamaz: satırın etkisi de istenemez (2. adım).
    expect(within(liste).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(liste).queryByRole('button', { name: 'Etkisini gör' })).toBeNull();
    expect(liste.textContent).toContain('"Sahada oldu" ve "Plan geride" satırları bilgi içindir');
  });

  // Salt okunur kişide başka sayfadaki değişiklik kayda yazılmaz; sayfa üstündeki satır Kokpit'te çizilmediği için liste onu da taşır.
  it('yazılmamış başka sayfa değişikliği plan güncelken de listede "Veri değişti" altında görünür; kayıtlıysa ikinci kez yazılmaz', () => {
    const guncel = ornekCalisma();
    const c = { ...guncel, dataVer: guncel.plan?.dataVer ?? guncel.dataVer } as ReturnType<typeof ornekCalisma>;
    const dis = kaynakSatiri({ alanlar: ['urunler'], farklar: [], kesik: false } as unknown as Parameters<typeof kaynakSatiri>[0], 0, c.dataVer);
    ac({ calisma: c }, false, dis);
    expect((document.querySelector('[data-degisiklik-ozeti] b') as HTMLElement).textContent).toBe('1 değişiklik');
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    const veri = within(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' })).getByRole('region', { name: 'Veri değişti' });
    expect(within(veri).getAllByRole('listitem')).toHaveLength(1);
    expect(veri.textContent).toContain(dis.ne);
    cleanup();
    ac({}, false);
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    const once = within(screen.getByRole('region', { name: 'Veri değişti' })).getAllByRole('listitem').length;
    cleanup();
    const kayitli = bekleyenListesi(ornekCalisma())[0]!;
    ac({}, false, kayitli);
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    expect(within(screen.getByRole('region', { name: 'Veri değişti' })).getAllByRole('listitem')).toHaveLength(once);
  });

  // 3297-5 (Test T2): emir siparişe bağlıysa değişiklik sayısı emrin kök kartında değil sipariş kartında durur; liste o karta süzülür.
  it('siparişe bağlı emrin olayı sipariş kartında sayılır; liste seçili karta süzülür ve "Tümünü göster" ile açılır', () => {
    const bayat = { bayat: true, sonCanliyaAlma: '2026-10-20T06:00:00Z', olaylar: [
      { neden: 'durus', zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'ORN-T01' },
      { neden: 'satin-alma-termini', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 3, emirNo: '3', makineId: null, makineKod: null },
    ] };
    const durum = { siparisBaglari: { '3': { siparis: '50', no: 'ORN-SP-50', musteri: 'Deneme Müşteri A', kalem: 1 } } };
    ac({ depo: { ...DEPO, durum, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat } } as unknown as PlanlamaDeposu });
    const serit = screen.getByRole('region', { name: 'Siparişler, sırasıyla' });
    expect(serit.querySelector('[data-kart="3"]')).toBeNull();
    expect(serit.querySelector('[data-kart="sp:50"] [data-olay]')?.textContent).toContain('1 değişiklik');
    fireEvent.click(serit.querySelector('[data-kart="sp:50"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri aç' }));
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect(liste.querySelectorAll('li')).toHaveLength(3);
    fireEvent.click(within(liste).getByRole('button', { name: 'Yalnız ORN-SP-50' }));
    expect(liste.querySelectorAll('li')).toHaveLength(1);
    expect(liste.textContent).toContain('ORN-SP-50 için · 1 değişiklik');
    fireEvent.click(within(liste).getByRole('button', { name: 'Tümünü göster' }));
    expect(liste.querySelectorAll('li')).toHaveLength(3);
  });

  it('gövde yukarıdan aşağıdır: sıra kartları, seçilen kartın operasyonları, plan bölümü; yan sütun yoktur', () => {
    ac();
    const ana = document.querySelector('.tc-pyq-ana');
    expect([...(ana?.children ?? [])].map((x) => x.getAttribute('aria-label'))).toEqual(['Siparişler, sırasıyla', 'Emirler ve operasyonlar', 'Tezgâhlar']);
    expect(document.querySelector('.tc-pyq-govde')?.children).toHaveLength(1);
    expect(ana?.querySelector('.tc-pyq-tahta')).not.toBeNull();
  });

  // 3297, 3304 a: Önce / sonra, Duruş ve mesai ve Ayarlar tek "Araçlar" menüsündedir (Plan iyileştirme ara Kokpit'te yoktur); menü seçimle kapanır, açık araç işaretlidir.
  const arac = (ad: string): HTMLElement => {
    if (!screen.queryByRole('menu', { name: 'Araçlar' })) fireEvent.click(screen.getByRole('button', { name: 'Araçlar' }));
    return within(screen.getByRole('menu', { name: 'Araçlar' })).getByText(ad).closest('button')!;
  };
  it('Araçlar menüsü: Duruş ve mesai açılır ve kapanır; Ayarlar sayfaya gider; menü seçimle kapanır', () => {
    const { git } = ac();
    expect(within(screen.getByRole('button', { name: 'Araçlar' })).queryByText('Araçlar')).not.toBeNull();
    expect(arac('Duruş ve mesai').getAttribute('aria-checked')).toBe('false');
    arac('Ayarlar');
    // Araçlar yalnız görünüm ve ayar taşır; tüm planın yönü Plan menüsündedir (3365-4, 3504 b), iki menüde planlama durmaz.
    const adi = (x: Element): string => (x.textContent ?? '').slice(0, (x.textContent ?? '').length - (x.querySelector('small')?.textContent?.length ?? 0));
    expect([...screen.getByRole('menu', { name: 'Araçlar' }).querySelectorAll('button')].map(adi)).toEqual(['Önce / sonra', 'Oklar: seçili iş', 'Oklar: seçili sipariş', 'Oklar kapalı', 'Sıkı satırlar', 'Duruş ve mesai', 'Ayarlar']);
    // Sorun turu şimdilik kapalıdır: üst şeritte düğmesi yoktur.
    expect(screen.queryByRole('button', { name: 'Sorunları sırayla çöz' })).toBeNull();
    fireEvent.click(arac('Duruş ve mesai'));
    expect(screen.queryByRole('menu', { name: 'Araçlar' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Araçlar' }).hasAttribute('data-etkin')).toBe(true);
    expect(arac('Duruş ve mesai').getAttribute('aria-checked')).toBe('true');
    // Ayarlar panel değil sayfadır: seçilince Planlama ayarları sayfasına gider, Kokpit'te panel açmaz.
    fireEvent.click(arac('Ayarlar'));
    expect(git).toHaveBeenCalledWith('ayarlar');
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Duruş ve mesaiyi kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Araçlar' }).hasAttribute('data-etkin')).toBe(false);
  });

  // Risk Y1: Ay ve Yıl'da çubuk çizilir ama taşınmaz; çift tık ve sağ tık "yakınlaşın" der, iş elde kalmaz.
  // Dilim 3c: Tezgâh gözünde Ay'da iş kutusu yok, doluluk hücresi var; hücreye çift tık ve sağ tık bir şey tutmaz, menü açmaz.
  it('uzak ölçekte çift tık ve sağ tık işi tutmaz; Tezgâh gözünde Ay hücre gösterir', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: 'Ay' }));
    expect(document.querySelector('[data-is="3.10"]')).toBeNull();
    const h = document.querySelector<HTMLElement>('[data-hucre]:not([disabled])');
    if (!h) throw new Error('hücre yok');
    fireEvent.doubleClick(h);
    expect(screen.queryByText(/Bırakmak için tıklayın/)).toBeNull();
    expect(document.querySelector('[data-tasinan]')).toBeNull();
    fireEvent.contextMenu(h);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // Risk Y1 (Test bakışı): plansız emrin fişi de Ay'da tutulmaz; yakında tutulan iş uzak ölçekte bırakılmaz.
  it('uzak ölçekte fiş tutulmaz, tutulan iş bırakılmaz; yakınlaşın uyarısı verir', () => {
    const c = ornekCalisma();
    const plansiz = { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
    ac({ calisma: plansiz, depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu });
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    fireEvent.click(olcek('Ay'));
    const fis = document.querySelector<HTMLElement>('[data-fis="2"]');
    if (!fis) throw new Error('fiş yok');
    fireEvent.doubleClick(fis);
    expect(screen.getAllByText('Planlamak için yakınlaşın').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-tasinan]')).toBeNull();
    fireEvent.click(olcek('3 gün'));
    fireEvent.doubleClick(document.querySelector<HTMLElement>('[data-is="3.10"]')!);
    expect(document.querySelector('[data-tasinan]')).not.toBeNull();
    fireEvent.click(olcek('Ay'));
    // Ay'da satır doluluk hücresidir (dilim 3c); tutulan iş hücreye bırakılmaz.
    fireEvent.click(document.querySelector<HTMLElement>('[data-hucre]:not([disabled])')!);
    expect(screen.getAllByText('Bırakmak için yakınlaşın').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-hucre-paneli]')).toBeNull();
  });

  // Yıl ölçeği Tahta'dan erken döner; sonra hook kalırsa ölçek değişince sayfa çöker (React #300).
  it('Ay, Yıl ve 3 gün ölçekleri arasında gidip gelmek sayfayı çökertmez', () => {
    ac();
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    fireEvent.click(olcek('Ay'));
    fireEvent.click(olcek('Yıl'));
    expect(document.querySelectorAll('.tc-pyq-hucre').length).toBeGreaterThan(0);
    fireEvent.click(olcek('3 gün'));
    expect(document.querySelectorAll('.tc-pyq-is').length).toBeGreaterThan(0);
  });

  // Dilim 3 (E, S2 a): Ay'da sipariş başına tek çubuk; basınca Hafta'da o siparişin emirleri, emre basınca Gün'de adımları; yol izi geri döner.
  it('kademe çubukları siparişten emre, emirden adıma iner; yol izi Tüm plan\'a döner', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Sipariş' }));
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    const tahta = () => document.querySelector('.tc-pyq-tahta') as HTMLElement;
    fireEvent.click(olcek('Ay'));
    const sp = [...tahta().querySelectorAll<HTMLElement>('[data-kademe="siparis"]')];
    expect(sp.length).toBeGreaterThan(0);
    expect(tahta().querySelector('[data-is]')).toBeNull();
    expect(document.querySelector('[data-yol-izi] [aria-current]')?.textContent).toBe('Tüm plan');
    const ikinci = sp.find((b) => b.getAttribute('data-kademe-id') === '2')!;
    fireEvent.click(ikinci);
    // Z1: ölçek siparişin aralığına sığar; kademe odaktan gelir (emir). Z4: odak yol izinin yeni halkasındadır.
    expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
    const yol = () => document.querySelector<HTMLElement>('[data-yol-izi]');
    expect(yol()?.textContent).toContain('Tüm plan');
    const em = [...tahta().querySelectorAll<HTMLElement>('[data-kademe="emir"]')];
    expect(em.map((b) => b.getAttribute('data-kademe-id'))).toEqual(['2']);
    fireEvent.click(em[0]!);
    expect(document.activeElement?.closest('[data-yol-izi]')).not.toBeNull();
    expect(tahta().querySelectorAll('[data-is]').length).toBeGreaterThan(0);
    expect([...tahta().querySelectorAll('[data-is]')].every((b) => b.getAttribute('data-is')?.startsWith('2.'))).toBe(true);
    fireEvent.click(within(yol()!).getByRole('button', { name: /Tüm plan/ }));
    expect(yol()?.querySelector('[aria-current]')?.textContent).toBe('Tüm plan');
    expect(tahta().dataset.olcek).toBe('A');
    expect(tahta().querySelectorAll('[data-kademe="siparis"]').length).toBe(sp.length);
    // Yıl'da da sipariş kademesi; Yıl ve 3 gün arasında gidip gelmek çökertmez (kanca sırası).
    fireEvent.click(olcek('Yıl'));
    expect(tahta().querySelectorAll('[data-kademe="siparis"]').length).toBe(sp.length);
    fireEvent.click(olcek('3 gün'));
    expect(tahta().querySelectorAll('[data-is]').length).toBeGreaterThan(0);
    fireEvent.click(olcek('Yıl'));
    fireEvent.click(olcek('Ay'));
    expect(tahta().querySelectorAll('[data-kademe="siparis"]').length).toBe(sp.length);
  });

  // 3570: Hafta'da emir satırı tek çubuktur; emrin adımları zamanda üst üste binse de satır adımların şerit sayısıyla uzamaz.
  it('emir kademesinde satır adım şeritleriyle uzamaz', () => {
    const c = ornekCalisma();
    type Op = { S: number; C: number; m: string; Su: number; lot1: number; job: string };
    const ops = structuredClone((c.plan as unknown as { ops: Record<string, Op> }).ops);
    const adimlar = Object.entries(ops).filter(([, x]) => x.job === '2' && !x.m.startsWith('@'));
    const [a, b] = adimlar.map(([, x]) => x);
    expect(a && b).toBeTruthy();
    Object.assign(b!, { S: a!.S, Su: a!.S, C: a!.S + 30, lot1: a!.S + 30 });
    ac({ calisma: { ...c, plan: { ...c.plan, ops } } as typeof c });
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Sipariş' }));
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    fireEvent.click(olcek('Ay'));
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.tc-pyq-tahta [data-kademe="siparis"]')].find((x) => x.getAttribute('data-kademe-id') === '2')!);
    const satir = document.querySelector<HTMLElement>('.tc-pyq-tahta [data-kademe="emir"]')!.closest<HTMLElement>('[data-satir]')!;
    expect(satir.hasAttribute('data-seritli')).toBe(false);
    expect(satir.style.getPropertyValue('--seritler')).toBe('1');
  });

  // Dilim 3b (F): genel bakış şeridi tahtanın görünen aralığını pencere olarak çizer; pencere klavyeyle kayınca tahta o saate kayar. Şerit kapanır ve kapalı kalır.
  it('genel bakış penceresi tahtayı kaydırır; şerit kapanır ve tarayıcıda hatırlanır', async () => {
    localStorage.removeItem('coremes.kokpit-genel-bakis');
    const en = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    const kaydir = vi.fn();
    const eski = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = kaydir as never;
    try {
      ac();
      const ac_ = (): HTMLElement => screen.getByRole('button', { name: 'Genel bakış' });
      expect(ac_().getAttribute('aria-expanded')).toBe('true');
      expect(document.querySelectorAll('.tc-pyq-genel-gun').length).toBeGreaterThan(0);
      const pencere = await screen.findByRole('slider', { name: 'Görünen aralık' });
      // Arayüz 3b Z1, Z2: işaretlerin anlamı görünür; şerit adlı grup, özeti ekran okuyucuya; kaydırıcının talimatı açıklamada.
      const grup = screen.getByRole('group', { name: 'Plan genel bakışı' });
      expect(grup.querySelector('[data-genel-ozet]')?.textContent).toMatch(/^En yoğun gün \d\d\.\d\d %\d+/);
      expect(document.querySelector('[data-genel-lejant]')?.textContent).toContain('termini kaçan emir');
      expect(pencere.getAttribute('aria-describedby')).not.toBeNull();
      expect(document.getElementById(pencere.getAttribute('aria-describedby')!)?.textContent).toContain('Page Up');
      expect(pencere.getAttribute('aria-valuenow')).toBe('0');
      kaydir.mockClear();
      fireEvent.keyDown(pencere, { key: 'PageDown' });
      const son = kaydir.mock.calls.at(-1)?.[0] as { left: number } | undefined;
      expect(son?.left).toBeCloseTo(168 * 15);
      fireEvent.keyDown(pencere, { key: 'Home' });
      expect((kaydir.mock.calls.at(-1)?.[0] as { left: number }).left).toBe(0);
      // ARIA kaydırıcı kalıbı: yukarı ok ileri, aşağı ok geri (bir gün).
      fireEvent.keyDown(pencere, { key: 'ArrowUp' });
      expect((kaydir.mock.calls.at(-1)?.[0] as { left: number }).left).toBeCloseTo(24 * 15);
      fireEvent.keyDown(pencere, { key: 'ArrowDown' });
      expect((kaydir.mock.calls.at(-1)?.[0] as { left: number }).left).toBe(0);
      // Shift ve sağ ok pencereyi bir gün genişletir: saat eni daralır, başı yerinde kalır.
      const slider = (): HTMLElement => screen.getByRole('slider', { name: /Görünen aralık/ });
      const once = slider().getAttribute('aria-valuetext');
      fireEvent.keyDown(pencere, { key: 'ArrowRight', shiftKey: true });
      await waitFor(() => { expect(slider().getAttribute('aria-valuetext')).not.toBe(once); });
      expect(slider().getAttribute('aria-valuenow')).toBe('0');
      expect(slider().getAttribute('aria-valuetext')?.slice(0, 5)).toBe(once?.slice(0, 5));
      fireEvent.click(ac_());
      expect(document.querySelector('[data-genel]')).toBeNull();
      expect(localStorage.getItem('coremes.kokpit-genel-bakis')).toBe('kapali');
      cleanup();
      ac();
      expect(ac_().getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelector('[data-genel]')).toBeNull();
    } finally {
      en.mockRestore();
      HTMLElement.prototype.scrollTo = eski;
      localStorage.removeItem('coremes.kokpit-genel-bakis');
    }
  });

  // Dilim 3c (G): Tezgâh gözünde Hafta ve Ay'da satır tezgâh x gün doluluk hücresidir; hücre basılınca o gün yan panelde açılır, işe basmak emri seçer,
  // Esc kapatır ve odak hücreye döner. Gün ve 3 gün'de adım kutuları kalır.
  it('tezgâh doluluk hücresi o günü yan panelde açar; Esc kapatır, odak hücreye döner', async () => {
    const { sec } = ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tezgâh' }));
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    const tahta = (): HTMLElement => document.querySelector<HTMLElement>('.tc-pyq-tahta')!;
    fireEvent.click(olcek('Hafta'));
    const hucreler = [...tahta().querySelectorAll<HTMLButtonElement>('[data-hucre]')];
    expect(hucreler.length).toBeGreaterThan(0);
    const dolu = hucreler.find((h) => !h.disabled && /\d+ iş/.test(h.getAttribute('aria-label') ?? ''))!;
    expect(dolu.getAttribute('aria-label')).toMatch(/^.+ \d\d\.\d\d: doluluk %\d+ \(\d+ \/ \d+ sa\), \d+ iş/);
    expect(dolu.getAttribute('aria-expanded')).toBe('false');
    dolu.focus();
    fireEvent.click(dolu);
    const panel = document.querySelector<HTMLElement>('[data-hucre-paneli]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe('tc-pyq-hpanel-baslik');
    expect(panel.getAttribute('data-hucre-paneli')).toBe(dolu.getAttribute('data-hucre'));
    expect(dolu.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('tc-pyq-hpanel-baslik');
    expect(dolu.getAttribute('aria-controls')).toBe(panel.id);
    // Z6: özet açık saati ve kapalı saatin yüke sayılmadığını yazar; Z1: çubuktaki saat tam (SS:DD).
    expect(panel.querySelector('[data-panel-ozet]')?.textContent).toMatch(/^Doluluk %\d+ \(\d+ \/ \d+ sa\).*Açık saat \d\d:\d\d–\d\d:\d\d/);
    for (const c of panel.querySelectorAll('.tc-pyq-hpanel-is')) if (c.textContent) expect(c.textContent).toMatch(/^\d\d:\d\d$/);
    for (const k of panel.querySelectorAll('[data-durus] small')) expect(k.textContent).toMatch(/^\d\d\.\d\d \S+ \d\d:\d\d – \d\d\.\d\d \S+ \d\d:\d\d$/);
    const is = (): HTMLElement => panel.querySelector<HTMLElement>('[data-panel-is]')!;
    expect(is().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(is());
    const [emirId, adimId] = (is().getAttribute('data-panel-is') ?? '').split('.');
    expect(sec).toHaveBeenLastCalledWith({ siparis: emirId, adim: `${emirId ?? ''}.${adimId ?? ''}` });
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(document.querySelector('[data-hucre-paneli]')).toBeNull();
    await waitFor(() => { expect(document.activeElement?.getAttribute('data-hucre')).toBe(dolu.getAttribute('data-hucre')); });
    // Z3: hücre ağı tek Tab durağı; oklar gün ve tezgâh arasında gezer, Home satır başına.
    const duraklar = (): HTMLButtonElement[] => [...tahta().querySelectorAll<HTMLButtonElement>('[data-hucre]')].filter((h) => h.tabIndex === 0);
    expect(duraklar()).toHaveLength(1);
    expect(duraklar()[0]?.getAttribute('data-hucre')).toBe(dolu.getAttribute('data-hucre'));
    const [satir, gunNo] = (dolu.getAttribute('data-hucre') ?? '').split('|');
    const etkin = (t: string) => [...tahta().querySelectorAll<HTMLButtonElement>('[data-hucre]')].filter((h) => !h.disabled && h.getAttribute('data-hucre')?.startsWith(`${t}|`));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    const sag = etkin(satir ?? '').find((h) => Number(h.getAttribute('data-hucre')?.split('|')[1]) > Number(gunNo));
    if (sag) expect(document.activeElement).toBe(sag);
    expect(duraklar()).toHaveLength(1);
    expect(duraklar()[0]).toBe(document.activeElement);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(etkin(satir ?? '')[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-hucre')?.split('|')[0]).not.toBe(satir);
    expect(duraklar()).toHaveLength(1);
    // Z4: hücre kipinde lejant; 3 gün'de yok.
    expect(document.querySelector('[data-hucre-lejant]')?.textContent).toMatch(/günlük doluluk %.*termini kaçan/);
    // Ay'da da hücre; 3 gün'de adım kutuları.
    fireEvent.click(olcek('Ay'));
    expect(tahta().querySelectorAll('[data-hucre]').length).toBeGreaterThan(0);
    fireEvent.click(olcek('3 gün'));
    expect(tahta().querySelectorAll('[data-hucre]').length).toBe(0);
    expect(tahta().querySelectorAll('[data-is]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-hucre-lejant]')).toBeNull();
  });

  // Gantt dilim 2 (T4): Sıkı satırlar Araçlar'dan açılır, kapanır ve bu tarayıcıda hatırlanır; sayfa yeniden açılınca Sıkı kalır.
  it('Sıkı satırlar seçilir, kök satır boyunu taşır ve tarayıcıda saklanır', () => {
    localStorage.removeItem('coremes.kokpit-satir-boyu');
    ac();
    const kok = (): HTMLElement => document.querySelector<HTMLElement>('.tc-pyq')!;
    expect(kok().getAttribute('data-satir-boyu')).toBe('rahat');
    fireEvent.click(arac('Sıkı satırlar'));
    expect(kok().getAttribute('data-satir-boyu')).toBe('siki');
    expect(localStorage.getItem('coremes.kokpit-satir-boyu')).toBe('siki');
    expect(arac('Sıkı satırlar').getAttribute('aria-checked')).toBe('true');
    cleanup();
    ac();
    expect(kok().getAttribute('data-satir-boyu')).toBe('siki');
    fireEvent.click(arac('Sıkı satırlar'));
    expect(kok().getAttribute('data-satir-boyu')).toBe('rahat');
    localStorage.removeItem('coremes.kokpit-satir-boyu');
  });

  // 3457-1 A: Engeller düğmesi hep durur, sayısını taşır; panel açılır, Duruş ve mesai onu kapatır, kapat düğmesi kapatır.
  it('Engeller düğmesi paneli açar ve kapatır; Duruş ve mesai açılınca Engeller kapanır', () => {
    ac();
    const dugme = (): HTMLElement => document.querySelector<HTMLElement>('.tc-pyq-ust .tc-pyq-engel-dugme')!;
    expect(dugme().textContent).toMatch(/^\d+Engeller$/);
    fireEvent.click(dugme());
    expect(screen.getByRole('complementary', { name: 'Engeller' })).toBeTruthy();
    expect(dugme().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(arac('Duruş ve mesai'));
    expect(screen.queryByRole('complementary', { name: 'Engeller' })).toBeNull();
    fireEvent.click(dugme());
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Engelleri kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Engeller' })).toBeNull();
  });

  // 3457-1 A (Test T2, T3): panel Kokpit'in oturum yetkisini kullanır; Emri göster emri seçer.
  it('Engeller: düzeltme düğmesi kişinin açabildiği sayfada çıkar, açamadığında metin; Emri göster emri seçer', () => {
    const c = structuredClone(ornekCalisma());
    const plan = c.plan as unknown as { ops: Record<string, unknown>; fail: string[]; failNeden: Record<string, unknown> };
    delete plan.ops['2.20']; delete plan.ops['2.30']; delete plan.ops['2.40'];
    plan.fail = ['2.20', '2.30', '2.40'];
    plan.failNeden = { '2.20': { kod: 'zaman', tani: { alt: 'sure', m: '3', ad: 'ORN-Freze', gerek: 100, mevcut: 50, ufukGun: 120 } }, '2.30': { kod: 'oncul', oncul: '2.20' }, '2.40': { kod: 'oncul', oncul: '2.30' } };
    const panel = (islemler: string[]) => {
      const r = ac({ calisma: c, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', ...islemler]) });
      fireEvent.click(document.querySelector<HTMLElement>('.tc-pyq-ust .tc-pyq-engel-dugme')!);
      return { r, p: within(screen.getByRole('complementary', { name: 'Engeller' })) };
    };
    let { p } = panel(['sayfa.recete-rota']);
    expect(p.getByRole('button', { name: 'Süreleri aç' })).toBeTruthy();
    expect(p.queryByRole('button', { name: 'Vardiya takvimini aç' })).toBeNull();
    expect(p.getByText('Bu düzeltme Vardiyalar sayfasında yapılır; açma yetkiniz yok, planlama sorumlusuna başvurun.')).toBeTruthy();
    cleanup();
    const x = panel(['sayfa.vardiya']);
    p = x.p;
    expect(p.getByRole('button', { name: 'Vardiya takvimini aç' })).toBeTruthy();
    expect(p.queryByRole('button', { name: 'Süreleri aç' })).toBeNull();
    fireEvent.click(p.getByRole('button', { name: 'Emri göster' }));
    expect(x.r.sec).toHaveBeenLastCalledWith({ siparis: '2', adim: null });
    expect(screen.queryByRole('complementary', { name: 'Engeller' })).toBeNull();
  });

  // 3335 a: tahtada tezgâh adına basınca o tezgâhın arıza ve bakım formu açılır (Duruş ve mesai bölümü, aynı taslak komutu ve etki akışı).
  it('tezgâh adından sorun bildir: Duruş ve mesai o tezgâhla açılır, tür alanı odaktadır; başka tezgâha basınca tezgâh değişir; fason satırında düğme yok', () => {
    ac();
    const dugmeler = [...document.querySelectorAll<HTMLElement>('.tc-pyq-satir [data-sorun-bildir]')];
    expect(dugmeler.length).toBeGreaterThan(1);
    const satirlar = [...document.querySelectorAll<HTMLElement>('.tc-pyq-satir[data-satir]')].map((x) => x.dataset.satir ?? '');
    expect(satirlar.filter((x) => x.startsWith('@')).length).toBeGreaterThan(0);
    expect(dugmeler.map((x) => x.dataset.sorunBildir)).toEqual(satirlar.filter((x) => !x.startsWith('@')));
    const ikinci = dugmeler[1]!, kimlik = ikinci.dataset.sorunBildir!;
    expect(ikinci.getAttribute('aria-label')).toMatch(/ için sorun bildir$/);
    fireEvent.click(ikinci);
    const panel = screen.getByRole('complementary', { name: 'Duruş ve mesai' });
    expect((within(panel).getByLabelText('Tezgâh') as HTMLSelectElement).value).toBe(kimlik);
    expect(document.activeElement).toBe(within(panel).getByLabelText('Tür'));
    fireEvent.click(dugmeler[0]!);
    expect((within(panel).getByLabelText('Tezgâh') as HTMLSelectElement).value).toBe(dugmeler[0]!.dataset.sorunBildir);
    // Telefondaki listede aynı düğme tezgâh başlığındadır.
    const listede = [...document.querySelectorAll<HTMLElement>('.tc-pyq-liste [data-sorun-bildir]')].map((x) => x.dataset.sorunBildir ?? '');
    expect(listede).toContain(kimlik);
    expect(listede.some((x) => x.startsWith('@'))).toBe(false);
    fireEvent.click(document.querySelector<HTMLElement>(`.tc-pyq-liste [data-sorun-bildir="${kimlik}"]`)!);
    expect((within(panel).getByLabelText('Tezgâh') as HTMLSelectElement).value).toBe(kimlik);
    // Menüden açılınca istek taşınmaz: bölüm ilk tezgâhla gelir.
    fireEvent.click(screen.getByRole('button', { name: 'Duruş ve mesaiyi kapat' }));
    fireEvent.click(ikinci);
    fireEvent.click(arac('Duruş ve mesai'));
    fireEvent.click(arac('Duruş ve mesai'));
    expect((within(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).getByLabelText('Tezgâh') as HTMLSelectElement).value).toBe(dugmeler[0]!.dataset.sorunBildir);
  });

  it('sorun bildir düğmesi yazamayan kişide ve Sipariş gözünde yoktur', () => {
    ac({}, false);
    expect(document.querySelectorAll('.tc-pyq-satir[data-satir]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-sorun-bildir]')).toBeNull();
    cleanup();
    ac();
    expect(document.querySelector('.tc-pyq-satir [data-sorun-bildir]')).not.toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Sipariş' }));
    expect(document.querySelectorAll('.tc-pyq-satir[data-satir]').length).toBeGreaterThan(0);
    expect(document.querySelector('.tc-pyq-satir [data-sorun-bildir]')).toBeNull();
  });

  // 3335-3b: operasyon satırından adıma sorun bildirilir; panel Duruş ve mesai ile aynı yerdedir.
  it('adıma sorun bildir: yerleşmiş, fason olmayan adımın satırında düğme vardır; panel o adımla açılır, seçim durur; Duruş ve mesai onu kapatır; bildirilen uzama satırda yazar', () => {
    const c = ornekCalisma();
    (c.w as Record<string, unknown>)['adimEk'] = { '2.20': { ekSaat: 1.5, bitis0: 40 } };
    ac({ calisma: c, secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-adim-sorun="2.30"]')).toBeNull();
    expect(bolum.querySelector('[data-adim-satir="2.20"] [data-adim-ek]')?.textContent).toBe('uzadı +1,5 sa');
    expect(bolum.querySelector('[data-adim-satir="2.30"] [data-adim-ek]')).toBeNull();
    const dugme = bolum.querySelector<HTMLElement>('[data-adim-sorun="2.20"]')!;
    expect(dugme.getAttribute('aria-label')).toMatch(/ için sorun bildir$/);
    fireEvent.click(arac('Duruş ve mesai'));
    fireEvent.click(dugme);
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    const panel = screen.getByRole('complementary', { name: 'Adıma sorun bildir' });
    expect(document.activeElement).toBe(within(panel).getByLabelText('Toplam kaç saat uzadı'));
    expect((within(panel).getByLabelText('Toplam kaç saat uzadı') as HTMLInputElement).value).toBe('1,5');
    expect(bolum.querySelector('[data-adim="2.20"]')?.getAttribute('aria-current')).toBe('true');
    fireEvent.click(arac('Duruş ve mesai'));
    expect(screen.queryByRole('complementary', { name: 'Adıma sorun bildir' })).toBeNull();
    fireEvent.click(dugme);
    // Duruş ve mesai açıkken adım paneli açılınca Duruş kapanır: adım paneli kapatılınca geri gelmez, menüde işaretli değildir.
    fireEvent.click(arac('Duruş ve mesai'));
    fireEvent.click(dugme);
    fireEvent.click(screen.getByRole('button', { name: 'Adıma sorun bildirmeyi kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Adıma sorun bildir' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Araçlar' }).hasAttribute('data-etkin')).toBe(false);
  });

  // 3528: açılış düzeninde sorun bildirme Siparişler görünümünde adımın satırından açılır; panel eski düzendekiyle aynı paneldir.
  it('açılış düzeninde adımın satırındaki düğme Adıma sorun bildir panelini o adımla açar; sipariş satırı açık kalır; salt okuyan kişide düğme yoktur', () => {
    const kur = (yaz: boolean) => {
      const c = ornekCalisma();
      (c.w as Record<string, unknown>)['adimEk'] = { '2.20': { ekSaat: 1.5, bitis0: 40 } };
      render(
        <MemoryRouter initialEntries={['/']}><BildirimSaglayici><Yuvali>
          <Kokpit
            depo={DEPO} calisma={c} komut={yaz ? komutKur(0) : null} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
            olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={{ ...BOS_SECIM, siparis: '2' }} sec={vi.fn()}
          />
        </Yuvali></BildirimSaglayici></MemoryRouter>,
      );
      fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Siparişler' }));
      return document.querySelector<HTMLElement>('.tc-pyq-ld-kart[data-acik]')!;
    };
    const kart = kur(true);
    expect(screen.queryByRole('complementary', { name: 'Adıma sorun bildir' })).toBeNull();
    fireEvent.click(kart.querySelector<HTMLElement>('[data-adim-sorun="2.20"]')!);
    const panel = screen.getByRole('complementary', { name: 'Adıma sorun bildir' });
    expect((within(panel).getByLabelText('Toplam kaç saat uzadı') as HTMLInputElement).value).toBe('1,5');
    expect(document.querySelector('.tc-pyq-ld-kart[data-acik] [data-adim-sorun="2.20"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Adıma sorun bildirmeyi kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Adıma sorun bildir' })).toBeNull();
    // Panel açık satırın adımına bağlıdır: başka sipariş açılınca, satır kapanınca ve görünüm değişince kapanır.
    const sorunAc = (): void => { fireEvent.click(document.querySelector<HTMLElement>('.tc-pyq-ld-kart[data-acik] [data-adim-sorun]')!); };
    const panelVar = (): boolean => screen.queryByRole('complementary', { name: 'Adıma sorun bildir' }) !== null;
    const baska = document.querySelector<HTMLElement>('.tc-pyq-ld-kart:not([data-acik]) [data-kart] button[aria-expanded="false"]')!;
    sorunAc();
    expect(panelVar()).toBe(true);
    fireEvent.click(baska);
    expect([panelVar(), document.querySelector('.tc-pyq-ld-kart[data-acik] [data-kart]')?.getAttribute('data-kart') === '2']).toEqual([false, false]);
    sorunAc();
    expect(panelVar()).toBe(true);
    fireEvent.click(document.querySelector<HTMLElement>('.tc-pyq-ld-kart[data-acik] [data-kart] button[aria-expanded="true"]')!);
    expect([panelVar(), document.querySelector('.tc-pyq-ld-kart[data-acik]')]).toEqual([false, null]);
    fireEvent.click(document.querySelector<HTMLElement>('[data-kart="2"] button[aria-expanded="false"]')!);
    sorunAc();
    expect(panelVar()).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Emirler' }));
    expect(panelVar()).toBe(false);
    cleanup();
    const okur = kur(false);
    expect(okur.querySelector('.tc-pyq-ld-adimlar')).not.toBeNull();
    expect(okur.querySelector('[data-adim-sorun]')).toBeNull();
  });

  // 3335-3c: bildirilen bekleme operasyon satırının Başlangıç hücresinde yazar; başlamış adımın kaydı yazmaz.
  it('adıma bildirilen bekleme satırda nedeni ve anıyla yazar; başlamış adımın kaydı yazmaz', () => {
    const c = ornekCalisma();
    (c.w as Record<string, unknown>)['adimBekle'] = { '2.40': { kadar: 9000, neden: 'malzeme' }, '2.20': { kadar: 9000, neden: 'kisi' } };
    ac({ calisma: c, secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-adim-satir="2.40"] [data-adim-bekle]')?.textContent).toMatch(/^bekliyor: malzeme yok, .+'e kadar$/);
    // 2.20 başlamıştır: kaydı motor için etkisizdir, satırda yazmaz.
    expect(bolum.querySelector('[data-adim-satir="2.20"] [data-adim-bekle]')).toBeNull();
  });

  // 3526: açılış düzeninde adımları Siparişler görünümünün açık satırı listeler; bildirilen bekleme ve uzama orada da yazar.
  it('açılış düzeninde bildirilen bekleme ve uzama Siparişler görünümünde adımın satırında yazar', () => {
    const c = ornekCalisma();
    (c.w as Record<string, unknown>)['adimBekle'] = { '2.40': { kadar: 9000, neden: 'malzeme' }, '2.20': { kadar: 9000, neden: 'kisi' } };
    (c.w as Record<string, unknown>)['adimEk'] = { '2.20': { ekSaat: 1.5, bitis0: 40 } };
    render(
      <MemoryRouter initialEntries={['/']}><BildirimSaglayici><Yuvali>
        <Kokpit
          depo={DEPO} calisma={c} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
          olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={{ ...BOS_SECIM, siparis: '2' }} sec={vi.fn()}
        />
      </Yuvali></BildirimSaglayici></MemoryRouter>,
    );
    expect(document.querySelector('[data-adim-bekle], [data-adim-ek]')).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Siparişler' }));
    const kart = document.querySelector<HTMLElement>('.tc-pyq-ld-kart[data-acik]')!;
    expect([...kart.querySelectorAll('[data-adim-bekle]')].map((y) => [y.getAttribute('data-adim-bekle'), y.textContent])).toEqual([['2.40', `bekliyor: malzeme yok, ${saatYaz(c.D, 9000)}'e kadar`]]);
    expect([...kart.querySelectorAll('[data-adim-ek]')].map((y) => [y.getAttribute('data-adim-ek'), y.textContent])).toEqual([['2.20', 'uzadı +1,5 sa']]);
  });

  // 3523: adım ortasından bölünen parti (3512) yalnız kendi adımlarıyla görünür; bağ partinin satırında ve üst emrin katılma adımında yazar.
  it('adım ortasından bölünen partinin satırı öncesini ve sonrasını kimin yaptığını, üst emrin katılma adımı partiyi beklediğini yazar', () => {
    const kur = (siparis: string) => {
      const c = ornekCalisma();
      const s2 = c.D.siparisler.find((x) => x.id === '2')!, rota = c.D.urunler.find((u) => u.id === s2.urun)!.rota!;
      c.D.siparisler.push({ ...s2, id: '9' });
      const ops = (c.plan as unknown as { ops: Record<string, { id: string; job: string; S: number; C: number }> }).ops;
      for (const r of Object.values(ops).filter((x) => x.job === '2')) ops[`9${r.id.slice(1)}`] = { ...r, id: `9${r.id.slice(1)}`, job: '9', S: r.S + 400, C: r.C + 400 };
      // Parti ilk adımdan sonra ayrılır, son adımda üst emre katılır.
      const emirler = { orders: [{ id: '2', no: 'ORN-0002', status: 'serbest' }, { id: '9', no: 'ORN-0009', status: 'serbest', parentId: '2', kol: { n: 1, m: rota.length } }], opStatus: {}, opProg: {} };
      ac({ calisma: c, depo: { ...DEPO, durum: { emirler } } as unknown as PlanlamaDeposu, secim: { ...BOS_SECIM, siparis } });
      return { rota, bolum: screen.getByRole('region', { name: 'Emirler ve operasyonlar' }) };
    };
    const parti = kur('9'), ad = (i: number) => parti.rota[i]!.ad ?? parti.rota[i]!.k, n = parti.rota.length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(parti.bolum.querySelector('[data-emir="9"] [data-emir-kol]')?.textContent)
      .toBe(`${ad(0)} adımını üst emir (ORN-0002) yapar; bu parti ${ad(1)} adımından başlar. ${ad(n - 2)} adımından sonra üst emre (ORN-0002) katılır; ${ad(n - 1)} adımından itibaren üst emirle sürer.`);
    expect(parti.bolum.querySelectorAll('[data-emir="9"] [data-adim-satir]')).toHaveLength(n - 2);
    cleanup();
    const ust = kur('2'), son = `2.${ust.rota[n - 1]!.k}`;
    expect(ust.bolum.querySelector('[data-emir="2"] [data-emir-kol]')).toBeNull();
    expect([...ust.bolum.querySelectorAll('[data-adim-parti]')].map((x) => [x.getAttribute('data-adim-parti'), x.textContent])).toEqual([[son, 'bekliyor: parti ORN-0009']]);
  });

  // Emir 2'nin partisi (9, no ORN-0002/1) ilk adımdan sonra ayrılır ve son adımda üst emre katılır; üst emrin son adımı partiyi bekler.
  function partiliAc(adres: string, w: Record<string, unknown> = {}) {
    const c = ornekCalisma();
    Object.assign(c.w, w);
    const s2 = c.D.siparisler.find((x) => x.id === '2')!, rota = c.D.urunler.find((u) => u.id === s2.urun)!.rota!, n = rota.length;
    c.D.siparisler.push({ ...s2, id: '9' });
    const ops = (c.plan as unknown as { ops: Record<string, { id: string; job: string; S: number; C: number; why: unknown }> }).ops;
    for (const r of Object.values(ops).filter((x) => x.job === '2')) ops[`9${r.id.slice(1)}`] = { ...r, id: `9${r.id.slice(1)}`, job: '9', S: r.S + 400, C: r.C + 400 };
    // Üst emrin ilk adımı bitmiştir (partinin adediyle birlikte yaptı). Son adımı partinin son adımının bitişini bekler: motor nedeni öncülü partinin adımı olan rota diye yazar.
    const son = ops[`2.${rota[n - 1]!.k}`]!, partiSon = ops[`9.${rota[n - 2]!.k}`]!;
    Object.assign(son, { S: partiSon.C, C: partiSon.C + (son.C - son.S), why: { t: 'rota', r: partiSon.id } });
    const emirler = { orders: [{ id: '2', no: 'ORN-0002', status: 'serbest' }, { id: '9', no: 'ORN-0002/1', status: 'serbest', parentId: '2', kol: { n: 1, m: n } }], opStatus: { '2|root|1': 'tamam' }, opProg: {} };
    render(
      <MemoryRouter initialEntries={[adres]}><BildirimSaglayici><Yuvali>
        <Kokpit
          depo={{ ...DEPO, durum: { emirler } } as unknown as PlanlamaDeposu} calisma={c} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
          olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={{ ...BOS_SECIM, siparis: '2' }} sec={vi.fn()}
        />
      </Yuvali></BildirimSaglayici></MemoryRouter>,
    );
    return { rota, n, son: `2.${rota[n - 1]!.k}` };
  }

  // Açılıştaki düzende bölümlü eski düzen yoktur: notlar ve neden cümlesi Siparişler görünümündeki açık satırda durur.
  it('adım ortasından bölünen partinin notları ve geç üst emrin nedeni açılıştaki düzende Siparişler satırında, eski düzende Yol şeridinde yazar', () => {
    const NEDEN = /adım \(.+\) .+ bekledi: katılan partinin \(ORN-0002\/1\) son adımı bitince başladı\.$/;
    const x = partiliAc('/');
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Siparişler' }));
    const kart = document.querySelector<HTMLElement>('.tc-pyq-ld-kart[data-acik]')!;
    expect(kart.querySelector('[data-kart]')?.getAttribute('data-kart')).toBe('2');
    const ad = (i: number) => x.rota[i]!.ad ?? x.rota[i]!.k;
    expect(kart.querySelector('.tc-pyq-yol-govde small')?.textContent).toMatch(NEDEN);
    expect(kart.querySelector('.tc-pyq-yol-govde small')?.textContent).toContain(`adım (${ad(x.n - 1)}) `);
    expect(kart.querySelector('[data-emir="9"] [data-emir-kol]')?.textContent)
      .toBe(`${ad(0)} adımını üst emir (ORN-0002) yapar; bu parti ${ad(1)} adımından başlar. ${ad(x.n - 2)} adımından sonra üst emre (ORN-0002) katılır; ${ad(x.n - 1)} adımından itibaren üst emirle sürer.`);
    expect(kart.querySelector('[data-emir="2"] [data-emir-kol]')).toBeNull();
    expect([...kart.querySelectorAll('[data-adim-parti]')].map((y) => [y.closest('[data-emir]')?.getAttribute('data-emir'), y.getAttribute('data-adim-parti'), y.textContent])).toEqual([['2', x.son, 'bekliyor: parti ORN-0002/1']]);
    cleanup();
    partiliAc('/?duzen=klasik');
    expect(screen.getByRole('region', { name: 'Planlama yolu' }).textContent).toMatch(/Neden: .*bekledi: katılan partinin \(ORN-0002\/1\) son adımı bitince başladı\./);
  });

  // 3525: açılış görünümü Emirler ağacıdır. Açılan emrin adım satırlarının üstünde tek not satırı durur: önce emrin notları, sonra adım
  // notları adım satırının başlığıyla. Telefonda ağacın yerini tutan listede emir düzeyindeki not emrin kartının içindedir.
  it('Emirler ağacında açılan emrin not satırı partinin bağını ve adımların bekleme, parti ve uzama notlarını yazar; kapalı ve notsuz emirde satır yoktur', () => {
    const c0 = ornekCalisma(), rota0 = c0.D.urunler.find((u) => u.id === c0.D.siparisler.find((y) => y.id === '2')!.urun)!.rota!;
    const sonK = rota0.at(-1)!.k;
    const x = partiliAc('/', { adimBekle: { [`2.${sonK}`]: { kadar: 9000, neden: 'malzeme' }, '2.20': { kadar: 9000, neden: 'kisi' } }, adimEk: { [`2.${sonK}`]: { ekSaat: 1.5, bitis0: 40 }, '2.20': { ekSaat: 2, bitis0: 40 } } });
    const bolum = screen.getByRole('region', { name: 'Emirler' });
    const satirlar = () => [...bolum.querySelectorAll<HTMLElement>('[data-agac-not]')].map((r) => [r.getAttribute('data-satir'), [...r.querySelectorAll('.tc-pyq-alan > .tc-pyq-not')].map((y) => y.textContent)]);
    expect(satirlar()).toEqual([]);
    const ad = (i: number) => x.rota[i]!.ad ?? x.rota[i]!.k;
    const bag = `${ad(0)} adımını üst emir (ORN-0002) yapar; bu parti ${ad(1)} adımından başlar. ${ad(x.n - 2)} adımından sonra üst emre (ORN-0002) katılır; ${ad(x.n - 1)} adımından itibaren üst emirle sürer.`;
    fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="9"]')!);
    expect(satirlar()).toEqual([['9>not', [bag]]]);
    // Not satırı emrin satırının hemen altında, adım satırlarının üstündedir; başlığı boştur.
    const not = bolum.querySelector<HTMLElement>('[data-satir="9>not"]')!;
    expect(not.previousElementSibling?.getAttribute('data-satir')).toBe('9');
    // Notun altında adım sütun başlığı (3533), ondan sonra adım satırları gelir.
    expect(not.nextElementSibling?.getAttribute('data-satir')).toBe('9>ust');
    expect(not.nextElementSibling?.nextElementSibling?.hasAttribute('data-agac-adim')).toBe(true);
    expect(not.querySelector('.tc-pyq-bas')?.textContent).toBe('');
    expect(not.querySelector('button')).toBeNull();
    fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="2"]')!);
    // 2.20 başlamıştır: beklemesi yazmaz, uzaması yazar. Adım satırının başlığıyla aynı ad; aynı adımın notları tek satırda.
    const baslik = (id: string) => bolum.querySelector(`[data-satir="2>${id}"] .tc-pyq-bas b`)?.textContent;
    expect(satirlar().find((r) => r[0] === '2>not')?.[1]).toEqual([
      `${baslik('2.20') ?? ''}: uzadı +2 sa`,
      `${baslik(x.son) ?? ''}: bekliyor: malzeme yok, ${saatYaz(c0.D, 9000)}'e kadar · bekliyor: parti ORN-0002/1 · uzadı +1,5 sa`,
    ]);
    expect(baslik(x.son)).toMatch(new RegExp(`^\\d+\\. ${ad(x.n - 1)}$`));
    // Telefon listesi: yalnız emir düzeyindeki not, emrin kartının içinde kart gövdesinin (no, rozet, ürün, termin) altında.
    expect([...document.querySelectorAll('.tc-pyq-liste [data-emir-not]')].map((y) => [y.getAttribute('data-emir-not'), y.textContent, y.parentElement?.tagName, y.previousElementSibling?.classList.contains('tc-pyq-kart')])).toEqual([['9', bag, 'BUTTON', true]]);
    // Notu olmayan emir açılınca not satırı çizilmez; emir kapanınca not satırı da gider.
    fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="3"]')!);
    expect(bolum.querySelectorAll('[data-satir^="3>"]').length).toBeGreaterThan(0);
    expect(satirlar().map((r) => r[0])).toEqual(['2>not', '9>not']);
    fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="9"]')!);
    expect(satirlar().map((r) => r[0])).toEqual(['2>not']);
  });

  // 3527: duruşların okunduğu pencerenin sonu çalışmayla gelir (sunucunun okuması); Kokpit onu kendi saatinden hesaplamaz.
  it('bitişi çalışmadaki duruş okuma gününden sonra olan emrin notu Emirler ağacında ve Siparişler görünümünde yazar; gün ilerideyse ya da yoksa yazmaz', () => {
    const NOT = 'Bitiş bir yıldan ileride; o tarihlerdeki planlı duruşlar hesaba katılmadı, bitiş daha geç olabilir.';
    const notlar = (gun: string | undefined): [string[], (string | null | undefined)[]] => {
      const c = ornekCalisma();
      if (gun !== undefined) c.durusOkumaSonu = gun;
      render(
        <MemoryRouter initialEntries={['/']}><BildirimSaglayici><Yuvali>
          <Kokpit
            depo={DEPO} calisma={c} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
            olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={{ ...BOS_SECIM, siparis: '2' }} sec={vi.fn()}
          />
        </Yuvali></BildirimSaglayici></MemoryRouter>,
      );
      const bolum = screen.getByRole('region', { name: 'Emirler' });
      for (const id of ['2', '3']) fireEvent.click(bolum.querySelector<HTMLElement>(`button[data-agac="${id}"]`)!);
      const agac = [...bolum.querySelectorAll<HTMLElement>('[data-agac-not]')].flatMap((r) => [...r.querySelectorAll('.tc-pyq-not')].map((y) => `${r.getAttribute('data-satir') ?? ''}: ${y.textContent}`));
      fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Siparişler' }));
      const siparis = [...document.querySelectorAll('.tc-pyq-ld-kart[data-acik] [data-durus-okunmadi]')].map((y) => y.textContent);
      cleanup();
      return [agac, siparis];
    };
    // Örnek plan 19.10'da başlar; 2 numaralı emir 27.10 öğleden sonra, 3 numaralı emir ondan önce biter.
    expect(notlar('2026-10-27')).toEqual([[`2>not: ${NOT}`], [NOT]]);
    expect(notlar('2026-10-28')).toEqual([[], []]);
    expect(notlar(undefined)).toEqual([[], []]);
  });

  // 3513: bölünen emrin partisi üst emrin beklemesiyle dizilir (3511); satır ve form beklemenin üst emirden geldiğini söyler.
  it('üst emrin beklemesi partinin adım satırında kaynağıyla yazar; formu kutuyu gösterir ve üst emrin adımına götürür', () => {
    const c = ornekCalisma();
    // Parti 9: emir 2'nin rotasıyla, ondan bölünmüş; planda emir 2'nin adımlarından sonra.
    c.D.siparisler.push({ ...c.D.siparisler.find((x) => x.id === '2')!, id: '9' });
    const ops = (c.plan as unknown as { ops: Record<string, { id: string; job: string; S: number; C: number }> }).ops;
    for (const r of Object.values(ops).filter((x) => x.job === '2')) ops[`9${r.id.slice(1)}`] = { ...r, id: `9${r.id.slice(1)}`, job: '9', S: r.S + 400, C: r.C + 400 };
    (c.w as Record<string, unknown>)['adimBekle'] = { '2.40': { kadar: 9000, neden: 'malzeme' } };
    const emirler = { orders: [{ id: '2', no: 'ORN-0002', status: 'serbest' }, { id: '9', no: 'ORN-0009', status: 'serbest', parentId: '2' }], opStatus: {}, opProg: {} };
    ac({ calisma: c, depo: { ...DEPO, durum: { emirler } } as unknown as PlanlamaDeposu, secim: { ...BOS_SECIM, siparis: '9' } });
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-adim-satir="9.40"] [data-adim-bekle]')?.textContent).toMatch(/^bekliyor: malzeme yok, .+'e kadar · üst emirden \(ORN-0002\)$/);
    expect(bolum.querySelector('[data-adim-satir="9.20"] [data-adim-bekle]')).toBeNull();
    fireEvent.click(bolum.querySelector<HTMLElement>('[data-adim-satir="9.40"] [data-adim-sorun]')!);
    const panel = () => screen.getByRole('complementary', { name: 'Adıma sorun bildir' });
    expect(panel().querySelector('[data-ust-bekleme="2"]')?.textContent).toMatch(/^Üst emrin \(ORN-0002\) beklemesi bu adımda da geçerli: malzeme yok, /);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Üst emrin adımını aç' }));
    expect(panel().querySelector('dl')?.textContent).toContain('ORN-0002 ·');
    expect(document.activeElement).toBe(panel().querySelector('#tc-pyq-adim-bekle'));
    expect(panel().querySelector('[data-ust-bekleme]')).toBeNull();
    expect(panel().querySelector('[data-adim-bekle]')?.textContent).toMatch(/^malzeme yok, .+'e kadar$/);
  });

  it('adıma sorun bildir düğmesi planda yeri olmayan adımın satırında yoktur', () => {
    const c = ornekCalisma();
    const plansiz = { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
    ac({ calisma: plansiz, depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu, secim: { ...BOS_SECIM, siparis: '2' } });
    expect(document.querySelector('[data-adim-satir="2.20"]')).not.toBeNull();
    expect(document.querySelector('[data-adim-satir="2.20"] [data-adim-sorun]')).toBeNull();
  });

  it('adıma sorun bildir düğmesi yazamayan kişide yoktur', () => {
    ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } }, false);
    expect(document.querySelector('[data-adim-satir="2.20"]')).not.toBeNull();
    expect(document.querySelector('[data-adim-sorun]')).toBeNull();
  });

  it('arızalı tezgâh varken üst şeritte sayılı Arıza işareti durur ve Duruş ve mesaiyi açar; yokken görünmez', () => {
    ac();
    expect(screen.queryByRole('button', { name: /Arıza$/ })).toBeNull();
    cleanup();
    const c = ornekCalisma();
    ac({ calisma: { ...c, olaylar: [{ tip: 'ariza', m: c.D.tezgahlar[0]?.id ?? '', saat: 6 }] } as unknown as ReturnType<typeof ornekCalisma> });
    const isaret = screen.getByRole('button', { name: /Arıza$/ });
    expect(isaret.textContent).toBe('1Arıza');
    fireEvent.click(isaret);
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    // Tezgâh adından gelen istek bu düğmeyle taşınmaz: bölüm kapanıp yeniden açılınca ilk tezgâhla gelir.
    const dugmeler = [...document.querySelectorAll<HTMLElement>('.tc-pyq-satir [data-sorun-bildir]')];
    const tezgah = (): string => (within(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).getByLabelText('Tezgâh') as HTMLSelectElement).value;
    const ilkTezgah = tezgah();
    const baska = dugmeler.find((x) => x.dataset.sorunBildir !== ilkTezgah)!;
    fireEvent.click(baska);
    expect(tezgah()).toBe(baska.dataset.sorunBildir);
    fireEvent.click(isaret);
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    fireEvent.click(isaret);
    expect(tezgah()).toBe(ilkTezgah);
  });

  it('Tüm planın yönü Plan menüsünde işaretli ayardır (3365-4, 3504 b): Araçlar menüsünde yoktur; iki yön açıklamasıyla durur; geçerli yön bir şey açmaz, öteki yön yalnız yön panelini açar', async () => {
    ac({ yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']) });
    expect(screen.queryByRole('button', { name: /Tüm plan:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Araçlar' }));
    expect(within(screen.getByRole('menu', { name: 'Araçlar' })).queryAllByRole('menuitemradio').filter((x) => x.textContent.includes('Tüm plan'))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Araçlar' }));
    const yon = screen.getByRole('button', { name: 'Plan' }) as HTMLButtonElement;
    await waitFor(() => { expect(yon.disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(yon);
    const menu = screen.getByRole('menu', { name: 'Plan' });
    expect(within(menu).getByText('Ayar · tüm planın yönü')).toBeTruthy();
    const yonler = (m: HTMLElement) => within(m).getAllByRole('menuitemradio').filter((x) => /^(İleriye|Teslimden geriye)/.test(x.textContent));
    const l = yonler(menu);
    expect(l.map((x) => x.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(l[1]!.textContent).toContain('iş termine yetişecek en geç saatte başlar');
    fireEvent.click(l[0]!);
    expect(screen.queryByRole('menu', { name: 'Plan' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    fireEvent.click(yon);
    fireEvent.click(yonler(screen.getByRole('menu', { name: 'Plan' }))[1]!);
    expect(screen.queryByRole('menu', { name: 'Plan' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Aparat, takım ve ölçü aleti kısıtı' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
  });

  it('Plan menüsündeki "Aparat, takım ve ölçü aleti kısıtı" paneli yön değişmeden açar; seçim hesaplamaz (3650)', async () => {
    ac({ yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']) });
    const yon = screen.getByRole('button', { name: 'Plan' }) as HTMLButtonElement;
    await waitFor(() => { expect(yon.disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(yon);
    const m = within(screen.getByRole('menu', { name: 'Plan' })).getByRole('menuitem', { name: /Aparat, takım ve ölçü aleti kısıtı/ });
    expect(m.textContent).toContain('Aparat: Açık');
    expect(m.textContent).toContain('Takım: Açık');
    fireEvent.click(m);
    expect(screen.getByRole('radiogroup', { name: 'Ölçü aleti' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Ayarın etkisi' })).toBeNull();
  });

  // 3282 1b, 3561: Ayarlar artık sayfadır (panel yok); Canlıya al düğmesi birincil kalır. Onay sayfası açılınca üst çubuk yoktur.
  it('Ayarlar menü öğesi sayfaya gider, panel açmaz; onay sayfası açılınca üst çubuk yoktur', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const c = ornekCalisma();
    const { git } = ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer }, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al']) });
    const ust = (): HTMLElement => screen.getByRole('button', { name: /^Canlıya al/ });
    expect(ust().className).toContain('tc-dugme-birincil');
    fireEvent.click(arac('Ayarlar'));
    expect(git).toHaveBeenCalledWith('ayarlar');
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
    expect(ust().className).toContain('tc-dugme-birincil');
    fireEvent.click(ust());
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    expect(document.querySelector('.tc-pyq-ust')).toBeNull();
  });

  it('oklar varsayılan yalnız seçili işin önceki ve sonraki adımına çizilir; kart seçmek tek başına ok çizmez; Oklar kapalı hiç çizmez (3365)', () => {
    const oklar = () => [...document.querySelectorAll('.tc-pyq-tahta .tc-pyq-oklar [data-ok]')].map((el) => el.getAttribute('data-ok') ?? '');
    const { sec } = ac();
    fireEvent.click(document.querySelector('[data-kart="3"]') as HTMLElement);
    expect(oklar()).toEqual([]);
    fireEvent.click(document.querySelector('.tc-pyq-tahta [data-is="3.20"]') as HTMLElement);
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: '3.20' });
    cleanup();
    ac({ secim: { ...BOS_SECIM, siparis: '3', adim: '3.20' } });
    expect(document.querySelector('.tc-pyq-tahta [data-is="3.20"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(oklar().length).toBeGreaterThan(0);
    expect(oklar().length).toBeLessThanOrEqual(2);
    expect(oklar().every((k) => k.split('>').includes('3.20'))).toBe(true);
    expect(document.querySelectorAll('[data-ok-aciklama]').length).toBe(2);
    okKipiSec('Oklar kapalı');
    expect(document.querySelector('.tc-pyq-tahta .tc-pyq-oklar')).toBeNull();
    expect(document.querySelector('[data-ok-aciklama]')).toBeNull();
  });

  // jsdom'da PointerEvent yoktur; fare olayı üstüne pointerType eklenir.
  const imlecOlayiKur = (): (() => void) => {
    const eski = (window as { PointerEvent?: unknown }).PointerEvent;
    class Imlec extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? 'mouse'; } }
    (window as { PointerEvent?: unknown }).PointerEvent = Imlec;
    return () => { (window as { PointerEvent?: unknown }).PointerEvent = eski; };
  };

  it('iş basılıp sürüklenir: imleç kıpırdayınca tutulur, bırakınca taşıma önizlemesi sorulur; kıpırdamadan bırakmak yalnız seçer (3365)', async () => {
    const geriKur = imlecOlayiKur();
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] });
    ac();
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (!is) throw new Error('iş yok');
    const satir = is.closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
    // Kıpırdamadan bırakmak tutmaz.
    fireEvent.pointerDown(is, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    expect(screen.queryByText(/Bırakın/)).toBeNull();
    fireEvent.pointerDown(is, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(satir, { pointerType: 'mouse', clientX: 2, clientY: 0 });
    expect(screen.queryByText(/Bırakın/)).toBeNull();
    fireEvent.pointerMove(satir, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(satir, { pointerType: 'mouse', clientX: 400, clientY: 0 });
    expect(screen.getByText(/Bırakın: iş taşınır/)).toBeTruthy();
    expect(document.querySelector('.tc-pyq-tahta [data-tasinan]')?.getAttribute('data-is')).toBe('3.10');
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    expect(screen.queryByText(/Bırakın/)).toBeNull();
    await waitFor(() => { expect(oz).toHaveBeenCalledWith(expect.objectContaining({ isId: '3.10' })); });
    // Dokunmatikte basmak sürükleme başlatmaz (sayfa kayar).
    oz.mockClear();
    fireEvent.pointerDown(is, { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(satir, { pointerType: 'touch', clientX: 400, clientY: 0 });
    expect(screen.queryByText(/Bırakın/)).toBeNull();
    oz.mockRestore();
    geriKur();
  });

  it('yazma sürerken gelen taşıma reddedilmez, sıraya girer ve "1 taşıma sırada" görünür; art arda ok tuşu tek taşımaya birleşir, hedef iki adım kayar (3365)', async () => {
    let ilkBitir: (() => void) | null = null;
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockImplementation(() => new Promise((r) => {
      const cevap = { calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] };
      if (ilkBitir === null) ilkBitir = () => { r(cevap); }; else r(cevap);
    }));
    ac({ secim: { ...BOS_SECIM, siparis: '3', adim: '3.10' } });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(1); });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('1 taşıma sırada')).toBeTruthy();
    expect(oz).toHaveBeenCalledTimes(1);
    ilkBitir!();
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(2); });
    expect(screen.queryByText(/taşıma sırada/)).toBeNull();
    const [ilk, ikinci] = oz.mock.calls.map((c) => c[0]);
    expect(ikinci).toMatchObject({ isId: '3.10', tezgah: ilk!.tezgah });
    expect(ikinci!.baslangic - ilk!.baslangic).toBeCloseTo(1, 5);
    expect(screen.queryByText(/Önceki taşıma yazılıyor/)).toBeNull();
  });

  it('kısa iş okunur genişlikte çizilir; çakışan iki kısa iş iki şeride açılır; fason satırı şeritlenmez (3365)', () => {
    const c = ornekCalisma();
    type Op = { S: number; C: number; m: string; Su: number; lot1: number };
    const plan = c.plan as unknown as { ops: Record<string, Op> };
    const ops = structuredClone(plan.ops);
    // 3.20, 3.10'un hemen ardından aynı tezgâhta: gerçek genişlikte yan yana, okunur genişlikte üst üste biner.
    const a = ops['3.10']!, b = ops['3.20']!;
    Object.assign(b, { m: a.m, S: a.C, C: a.C + (b.C - b.S), Su: a.C, lot1: a.C });
    // Fason satırında iki kısa iş üst üste: fason satırı şeritlenmez.
    const f = ops['2.30']!, g = ops['2.40']!;
    Object.assign(f, { C: f.S + 0.5 });
    Object.assign(g, { m: f.m, S: f.S + 0.5, C: f.S + 1, Su: f.S + 0.5, lot1: f.S + 1 });
    ac({ calisma: { ...c, plan: { ...c.plan, ops } } as typeof c });
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    const en = (id: string) => parseFloat(is(id).style.getPropertyValue('--w'));
    const serit = (id: string) => is(id).style.getPropertyValue('--serit');
    expect(is('3.10').hasAttribute('data-kisa')).toBe(true);
    expect(en('3.10')).toBeGreaterThanOrEqual(64);
    expect(is('3.10').style.getPropertyValue('--gercek')).toMatch(/px$/);
    expect(new Set([serit('3.10'), serit('3.20')])).toEqual(new Set(['0', '1']));
    const satir = is('3.10').closest<HTMLElement>('[data-satir]')!;
    expect(satir.hasAttribute('data-seritli')).toBe(true);
    expect(satir.style.getPropertyValue('--seritler')).toBe('2');
    expect([serit('2.30'), serit('2.40')]).toEqual(['0', '0']);
    expect(is('2.30').closest('[data-satir]')?.hasAttribute('data-seritli')).toBe(false);
  });

  it('seçili işte uzak adımın oku çizilmez; üstüne gelinen işin oku çizilir (3365)', () => {
    const oklar = () => [...document.querySelectorAll('.tc-pyq-tahta .tc-pyq-oklar [data-ok]')].map((el) => el.getAttribute('data-ok') ?? '').sort();
    // Emir 2'nin üç adımı planda: 2.20 > 2.30 > 2.40. 2.20 seçiliyken yalnız 2.20 > 2.30 çizilir.
    ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    expect(oklar()).toEqual(['2.20>2.30']);
    cleanup();
    ac();
    expect(oklar()).toEqual([]);
    const is = document.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="3.20"]')!;
    fireEvent.pointerEnter(is);
    expect(oklar()).toEqual(['3.10>3.20']);
    fireEvent.pointerLeave(is);
    expect(oklar()).toEqual([]);
  });

  it('sürüklerken itilen iş önizlemedeki yerine akar ve kayma süresini yazar; ipucu kaç işin itildiğini söyler; bırakmadan vazgeçince yerine döner (3531)', async () => {
    const geriKur = imlecOlayiKur();
    // 3.20, 3.10'un ardından aynı tezgâhta: 3.10 sürüklenir, 3.20 itilir.
    const c = ornekCalisma();
    type Op = { S: number; C: number; m: string; Su: number; lot1: number };
    const ops = structuredClone((c.plan as unknown as { ops: Record<string, Op> }).ops);
    const a = ops['3.10']!, b = ops['3.20']!;
    Object.assign(b, { m: a.m, S: a.C + 1, C: a.C + 1 + (b.C - b.S), Su: a.C + 1, lot1: a.C + 1 });
    ac({ calisma: { ...c, plan: { ...c.plan, ops } } as typeof c });
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    const tasinanId = '3.10', komsu = '3.20';
    const satir = is(tasinanId).closest<HTMLElement>('[data-satir]')!;
    expect(is(komsu).closest('[data-satir]')).toBe(satir);
    const x0 = is(komsu!).style.getPropertyValue('--x');
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve({
      calismaSurumu: 1, gecerli: true, ileti: null,
      isler: [
        { isId: tasinanId!, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 1, eskiTezgah: g.tezgah, eskiS: 0, tur: 'tasinan' as const },
        // Uzak bitiş: emrin terminini (24.10) aşar, iş gecikir olarak işaretlenir.
        { isId: komsu!, tezgah: g.tezgah, S: 200, C: 100_000, eskiTezgah: g.tezgah, eskiS: 198, tur: 'itilen' as const },
      ],
    }));
    const alan = satir.querySelector<HTMLElement>('.tc-pyq-alan')!;
    fireEvent.pointerDown(is(tasinanId!), { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 60, clientY: 0 });
    await waitFor(() => { expect(is(komsu!).hasAttribute('data-kaydi')).toBe(true); });
    expect(is(komsu!).style.getPropertyValue('--x')).not.toBe(x0);
    expect(is(komsu!).textContent).toContain('gecikir · +2 sa');
    expect(is(komsu!).hasAttribute('data-gecikir')).toBe(true);
    expect(screen.getByText(/termini .* gecikir/)).toBeTruthy();
    expect(screen.getByText(/aynı tezgâhta 1 iş arkaya itilir/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => { expect(is(komsu!).style.getPropertyValue('--x')).toBe(x0); });
    expect(is(komsu!).hasAttribute('data-kaydi')).toBe(false);
    expect(is(komsu!).hasAttribute('data-gecikir')).toBe(false);
    // 3531 b: bırakınca taşıma hemen yazılmaz; önizleme yerinde durur, Vazgeç bırakır, Uygula yazar.
    const surukle = (): void => {
      fireEvent.pointerDown(is(tasinanId), { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 30, clientY: 0 });
      fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 60, clientY: 0 });
    };
    surukle();
    await waitFor(() => { expect(is(komsu!).hasAttribute('data-kaydi')).toBe(true); });
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    const onayGrubu = screen.getByRole('group', { name: 'Taşımayı onayla' });
    expect(onayGrubu.textContent).toContain('gecikir');
    // 3605: onay, tahtanın içinde değil gövdede sabit durur; tahtanın altında boşluk kalır.
    expect(onayGrubu.parentElement).toBe(document.body);
    expect(onayGrubu.classList.contains('tc-pyq-alt-panel')).toBe(true);
    expect(document.querySelector('.tc-pyq-alt-bosluk')).not.toBeNull();
    expect(onayGrubu.textContent).toMatch(/^\S+ · .+, .+ \(\d.* (erken|geç)\)/);
    expect(is(komsu!).hasAttribute('data-kaydi')).toBe(true);
    // Onay beklerken imleç hedefi değiştirmez.
    const sorulan = oz.mock.calls.length;
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 300, clientY: 0 });
    await new Promise((r) => setTimeout(r, 250));
    expect(oz.mock.calls.length).toBe(sorulan);
    fireEvent.click(within(onayGrubu).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    await waitFor(() => { expect(is(komsu!).style.getPropertyValue('--x')).toBe(x0); });
    expect(oz.mock.calls.length).toBe(sorulan);
    // Esc de onay çubuğunu kapatır, yazmaz ve itilen işi yerine döndürür.
    surukle();
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    expect(screen.getByRole('group', { name: 'Taşımayı onayla' })).toBeTruthy();
    const escOncesi = oz.mock.calls.length;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    await waitFor(() => { expect(is(komsu!).style.getPropertyValue('--x')).toBe(x0); });
    expect(oz.mock.calls.length).toBe(escOncesi);
    surukle();
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    const once = oz.mock.calls.length;
    const gosterilen = oz.mock.calls.at(-1)?.[0];
    // Gösterilen yer işin eski saati değildir; Uygula eski yere yazsaydı aşağıdaki eşitlik tutmazdı.
    expect(screen.getByRole('group', { name: 'Taşımayı onayla' }).textContent).toMatch(/\((\d.*) (erken|geç)\)/);
    fireEvent.click(within(screen.getByRole('group', { name: 'Taşımayı onayla' })).getByRole('button', { name: 'Uygula' }));
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    // Uygula taşımayı başlatır: Kokpit taşımadan önce yeri sunucuya bir kez daha sorar; sorulan yer onay çubuğunda gösterilen tezgâh ve saattir.
    await waitFor(() => { expect(oz.mock.calls.length).toBe(once + 1); });
    expect(oz.mock.calls.at(-1)?.[0]).toEqual(gosterilen);
    expect(oz.mock.calls.at(-1)![0]).toMatchObject({ isId: tasinanId });
    oz.mockRestore();
    geriKur();
  });

  // Onay çubuğu testleri: 3.20, 3.10'un ardından aynı tezgâhta; 3.10 sürüklenip bırakılır, çubuk açılır.
  const onayKur = () => {
    const c = ornekCalisma();
    type Op = { S: number; C: number; m: string; Su: number; lot1: number };
    const ops = structuredClone((c.plan as unknown as { ops: Record<string, Op> }).ops);
    const a = ops['3.10']!, b = ops['3.20']!;
    Object.assign(b, { m: a.m, S: a.C + 1, C: a.C + 1 + (b.C - b.S), Su: a.C + 1, lot1: a.C + 1 });
    const sec = vi.fn();
    const ciz = (o: Record<string, Op>, yaz = true) => (
      <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici><Yuvali>
        <Kokpit depo={DEPO} calisma={{ ...c, plan: { ...c.plan, ops: o } } as typeof c} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
          olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={sec} />
      </Yuvali></BildirimSaglayici></MemoryRouter>
    );
    const r = render(ciz(ops));
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve({
      calismaSurumu: 1, gecerli: true, ileti: null,
      isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 1, eskiTezgah: g.tezgah, eskiS: 0, tur: 'tasinan' as const }],
    }));
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    const alan = is('3.10').closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
    fireEvent.pointerDown(is('3.10'), { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 60, clientY: 0 });
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    return { r, ciz, ops, oz, is, sec };
  };

  it('onay açıkken başka işe çift tıklamak bekleyen taşımayı değiştirmez; Uygula ilk işi sorar (3531-1)', async () => {
    const geriKur = imlecOlayiKur();
    const { oz, is } = onayKur();
    const grup = await screen.findByRole('group', { name: 'Taşımayı onayla' });
    await waitFor(() => { expect(oz.mock.calls.length).toBeGreaterThan(0); });
    const metin = grup.textContent;
    const gosterilen = oz.mock.calls.at(-1)?.[0];
    fireEvent.doubleClick(is('3.20'));
    expect(screen.getByRole('group', { name: 'Taşımayı onayla' }).textContent).toBe(metin);
    expect(is('3.20').hasAttribute('data-tasinan')).toBe(false);
    const n = oz.mock.calls.length;
    fireEvent.click(within(screen.getByRole('group', { name: 'Taşımayı onayla' })).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(oz.mock.calls.length).toBe(n + 1); });
    expect(oz.mock.calls.at(-1)?.[0]).toEqual(gosterilen);
    expect(oz.mock.calls.at(-1)![0]).toMatchObject({ isId: '3.10' });
    geriKur();
  });

  it('onay açıkken iş plandan düşerse taşıma bırakılır, uyarı çıkar, tahta açılır; iş geri gelince çubuk açılmaz (3531-1)', async () => {
    const geriKur = imlecOlayiKur();
    const { r, ciz, ops, is, sec } = onayKur();
    await screen.findByRole('group', { name: 'Taşımayı onayla' });
    const dusuk = structuredClone(ops);
    delete (dusuk as Record<string, unknown>)['3.10'];
    r.rerender(ciz(dusuk));
    expect(await screen.findByText('İş planda yok; taşıma iptal edildi')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    expect(document.querySelector('.tc-pyq-tahta')?.hasAttribute('data-tasima')).toBe(false);
    sec.mockClear();
    fireEvent.click(is('3.20'));
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: '3.20' });
    r.rerender(ciz(ops));
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    geriKur();
  });

  it('onay açıkken taşıma yetkisi kalkarsa taşıma bırakılır, uyarı çıkar, Uygula yazmaz (3531-1)', async () => {
    const geriKur = imlecOlayiKur();
    const { r, ciz, ops, oz } = onayKur();
    await screen.findByRole('group', { name: 'Taşımayı onayla' });
    const n = oz.mock.calls.length;
    r.rerender(ciz(ops, false));
    expect(await screen.findByText('Taşıma şu an yapılamıyor; iptal edildi')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    expect(document.querySelector('.tc-pyq-tahta')?.hasAttribute('data-tasima')).toBe(false);
    r.rerender(ciz(ops));
    expect(screen.queryByRole('group', { name: 'Taşımayı onayla' })).toBeNull();
    await new Promise((res) => setTimeout(res, 250));
    expect(oz.mock.calls.length).toBe(n);
    geriKur();
  });

  it('gecikenler yalnız terminini ilk kez aşan işi sayar, emir başına bir kez; etki cümlesi itilen, çekilen ve geciken emri yazar (3531)', () => {
    // e1 zamanında; e2 zaten geç (bitişi 30 > termin 20; erken biten adımı f bile termini geçse yeniden sayılmaz); e3 terminsiz; e4'ün işi kayar ama termine yetişir.
    const isler = {
      a: { id: 'a', job: 'e1', C: 10 }, b: { id: 'b', job: 'e1', C: 11 }, c: { id: 'c', job: 'e2', C: 30 }, f: { id: 'f', job: 'e2', C: 15 },
      d: { id: 'd', job: 'e3', C: 5 }, h: { id: 'h', job: 'e4', C: 20 },
    } as unknown as Record<string, KokpitIsi>;
    const emirler = new Map([
      ['e1', { id: 'e1', no: 'ORN-1', termin: 12, bitis: 11 }], ['e2', { id: 'e2', no: 'ORN-2', termin: 20, bitis: 30 }], ['e3', { id: 'e3', no: 'ORN-3', termin: null, bitis: 5 }],
      ['e4', { id: 'e4', no: 'ORN-4', termin: 50, bitis: 20 }],
    ]) as unknown as Map<string, KokpitEmri>;
    const g = gecikenler([{ isId: 'a', C: 13 }, { isId: 'b', C: 14 }, { isId: 'c', C: 40 }, { isId: 'f', C: 25 }, { isId: 'd', C: 99 }, { isId: 'h', C: 45 }], isler, emirler);
    expect([...g.isler].sort()).toEqual(['a', 'b']);
    expect(g.emirler).toEqual([{ no: 'ORN-1', termin: 12 }]);
    // Saat 24'ten küçükse bugün (21.11 Cum), değilse ertesi gün (22.11 Cmt).
    const zaman = (t: number) => (t < 24 ? `21.11 Cum ${String(t).padStart(2, '0')}:00` : `22.11 Cmt ${String(t - 24).padStart(2, '0')}:00`);
    expect(etkiCumlesi({ kayan: { a: 1, b: 2, c: -1 }, geciken: g }, zaman, 8)).toBe(' · aynı tezgâhta 2 iş arkaya itilir · 1 iş öne çekilir · ORN-1 termini 12:00, gecikir');
    const uc = { isler: new Set(['a']), emirler: [{ no: 'ORN-1', termin: 12 }, { no: 'ORN-2', termin: 30 }, { no: 'ORN-3', termin: 40 }] };
    expect(etkiCumlesi({ kayan: {}, geciken: uc }, zaman, 8)).toBe(' · ORN-1 termini 12:00, gecikir; ORN-2 termini Cmt 06:00, gecikir; +1 emir daha gecikir');
    expect(onayCumlesi('S1', 'T-01', 'Sal 06:00', -2)).toBe('S1 · T-01, Sal 06:00 (2 sa erken)');
    expect(onayCumlesi('S1', 'F-01', 'Sal 09:15', 1.25)).toBe('S1 · F-01, Sal 09:15 (1 sa 15 dk geç)');
    expect(onayCumlesi('S1', 'T-01', 'Sal 06:00', 0)).toBe('S1 · T-01, Sal 06:00 (aynı saat)');
    expect(etkiCumlesi({ kayan: {}, geciken: { isler: new Set(), emirler: [] } }, zaman, 8)).toBe('');
    expect(etkiCumlesi(null, zaman, 8)).toBe('');
  });

  it('aday olmayan tezgâha bırakmak uyarır ve taşıma gitmez (3365)', async () => {
    const geriKur = imlecOlayiKur();
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: true, ileti: null, isler: [] });
    ac();
    const is = document.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="3.10"]')!;
    const baska = document.querySelector<HTMLElement>('.tc-pyq-tahta [data-is="3.20"]')!.closest<HTMLElement>('[data-satir]')!;
    expect(baska.dataset.satir).not.toBe(is.closest<HTMLElement>('[data-satir]')!.dataset.satir);
    const alan = baska.querySelector<HTMLElement>('.tc-pyq-alan')!;
    fireEvent.pointerDown(is, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 60, clientY: 0 });
    expect(screen.getByText(/Bırakın: iş taşınır/)).toBeTruthy();
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    expect(await screen.findByText('Bu adım bu tezgâhta yapılamaz')).toBeTruthy();
    expect(document.querySelector('.tc-pyq-tahta [data-tasinan]')).toBeNull();
    await new Promise((r) => setTimeout(r, 250));
    expect(oz).not.toHaveBeenCalled();
    oz.mockRestore();
    geriKur();
  });

  it('Ctrl ya da Shift ile tıklanan işler birlikte seçilir; ok tuşu hepsini aynı süre kaydırır, geç başlayan önce gider; düz tıklama kümeyi bırakır (3365)', async () => {
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] });
    acSecimli();
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    fireEvent.click(is('3.10'));
    expect(is('3.10').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(is('2.40'), { ctrlKey: true });
    expect(['3.10', '2.40'].every((id) => is(id).hasAttribute('data-coklu'))).toBe(true);
    expect(screen.getByText('2 iş seçili · birlikte kayar')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(2); });
    const c = oz.mock.calls.map((x) => x[0]);
    expect(c.map((x) => x.isId)).toEqual(['2.40', '3.10']);
    // Başlamamış işler yarım saat kayar (çeyrek saate oturur), tezgâhları değişmez.
    expect(c[0]).toMatchObject({ tezgah: '5' });
    expect(c[1]).toMatchObject({ tezgah: '1' });
    // ↑ ↓ çoklu seçimde tezgâh değiştirmez.
    oz.mockClear();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(await screen.findByText('Çoklu seçimde tezgâh değişmez; tek iş seçin.')).toBeTruthy();
    expect(oz).not.toHaveBeenCalled();
    // Shift ile tıklamak kümeden çıkarır; tek iş kalınca küme yazısı kalkar.
    fireEvent.click(is('2.40'), { shiftKey: true });
    expect(is('2.40').hasAttribute('data-coklu')).toBe(false);
    expect(screen.queryByText(/iş seçili/)).toBeNull();
    fireEvent.click(is('3.20'), { metaKey: true });
    expect(screen.getByText('2 iş seçili · birlikte kayar')).toBeTruthy();
    fireEvent.click(is('2.40'));
    expect(document.querySelectorAll('.tc-pyq-tahta [data-coklu]')).toHaveLength(0);
    expect(is('2.40').getAttribute('aria-pressed')).toBe('true');
  });

  it('çoklu seçimin bir işi sürüklenip bırakılınca hepsi aynı süre kayar (3365)', async () => {
    const geriKur = imlecOlayiKur();
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] });
    acSecimli();
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    fireEvent.click(is('3.10'));
    fireEvent.click(is('2.40'), { ctrlKey: true });
    const satir = is('3.10').closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
    fireEvent.pointerDown(is('3.10'), { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(satir, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(satir, { pointerType: 'mouse', clientX: 400, clientY: 0 });
    expect(screen.getByText(/seçili 2 iş aynı süre kayar/)).toBeTruthy();
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(2); });
    const c = Object.fromEntries(oz.mock.calls.map((x) => [x[0].isId, x[0]]));
    const S = (id: string) => (ornekCalisma().plan as unknown as { ops: Record<string, { S: number }> }).ops[id]!.S;
    const d1 = c['3.10']!.baslangic - S('3.10'), d2 = c['2.40']!.baslangic - S('2.40');
    expect(Math.abs(d1)).toBeGreaterThan(0.25);
    expect(Math.abs(d1 - d2)).toBeLessThanOrEqual(0.25);
    expect(c['2.40']!.tezgah).toBe('5');
    geriKur();
  });

  // Test T3, T4, T6: kümede süren iş kaymaz; Shift+ok dört saat kaydırır; küme dışı iş bırakılınca yalnız o taşınır.
  it('kümede süren iş atlanır, Shift+ok kümeyi dört saat kaydırır; küme dışı iş sürüklenince yalnız o taşınır (3365)', async () => {
    const geriKur = imlecOlayiKur();
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] });
    acSecimli();
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    const S = (id: string) => (ornekCalisma().plan as unknown as { ops: Record<string, { S: number }> }).ops[id]!.S;
    fireEvent.click(is('3.10'));
    fireEvent.click(is('2.20'), { ctrlKey: true });
    fireEvent.click(is('2.40'), { ctrlKey: true });
    expect(screen.getByText('3 iş seçili · birlikte kayar')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(2); });
    expect(await screen.findByText('1 iş kaymadı (süren, biten ya da fason); ötekiler kaydı. Süren işi tek başına taşıyın.')).toBeTruthy();
    const c = Object.fromEntries(oz.mock.calls.map((x) => [x[0].isId, x[0]]));
    expect(Object.keys(c).sort()).toEqual(['2.40', '3.10']);
    for (const id of ['2.40', '3.10']) expect(Math.abs(c[id]!.baslangic - S(id) - 4)).toBeLessThanOrEqual(0.25);
    // Küme dışındaki iş sürüklenip bırakılınca yalnız o taşınır; küme kaymaz.
    await new Promise((r) => setTimeout(r, 0));
    oz.mockClear();
    const alan = is('3.20').closest<HTMLElement>('[data-satir]')!.querySelector<HTMLElement>('.tc-pyq-alan')!;
    fireEvent.pointerDown(is('3.20'), { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 30, clientY: 0 });
    fireEvent.pointerMove(alan, { pointerType: 'mouse', clientX: 400, clientY: 0 });
    fireEvent.pointerUp(document, { pointerType: 'mouse' });
    await waitFor(() => { expect(oz).toHaveBeenCalled(); });
    await new Promise((r) => setTimeout(r, 250));
    expect(oz.mock.calls.map((x) => x[0].isId)).toEqual(['3.20']);
    geriKur();
  });

  // Çoklu kaydırmada "taslağa yazıldı" bildirimi iş başına değil, küme için tek satırdır (ayrı ayrı çıksa tahtayı örter).
  it('çoklu kaydırma bittiğinde tek bildirim çıkar (3365)', async () => {
    taslakSunucusu([]);
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: true, ileti: null, isler: [] });
    acSecimli();
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    fireEvent.click(is('3.10'));
    fireEvent.click(is('2.40'), { ctrlKey: true });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(await screen.findByText('2 iş birlikte taşındı; Geri al her birini ayrı alır.', undefined, { timeout: 4000 })).toBeTruthy();
    expect(oz).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('İş taşındı; Geri al ile alınır.')).toBeNull();
  });

  // Test T5: sığdır kümenin bütününü kapsar, yalnız seçili işi değil.
  it('çoklu seçimde F kümedeki bütün işleri sığdırır (3365)', () => {
    acSecimli();
    const is = (id: string) => document.querySelector<HTMLElement>(`.tc-pyq-tahta [data-is="${id}"]`)!;
    const en = () => parseFloat(is('3.10').style.getPropertyValue('--w'));
    fireEvent.click(is('3.10'));
    fireEvent.keyDown(document, { key: 'f' });
    const tek = en();
    fireEvent.click(is('2.40'), { ctrlKey: true });
    fireEvent.keyDown(document, { key: 'f' });
    expect(en()).toBeLessThan(tek);
  });

  it('yakınlaştırma sürekli: sürgü ve Ctrl+tekerlek saat enini değiştirir, en yakın ölçek basılı görünür, en uzakta Ay\'a geçer; F seçili işi sığdırır (3365)', () => {
    ac({ secim: { ...BOS_SECIM, siparis: '3', adim: '3.10' } });
    const tahta = () => document.querySelector('.tc-pyq-tahta') as HTMLElement;
    const en = (id = '2.20') => parseFloat(tahta().querySelector<HTMLElement>(`[data-is="${id}"]`)!.style.getPropertyValue('--w'));
    const surgu = screen.getByRole('slider', { name: 'Yakınlaştırma' }) as HTMLInputElement;
    const basili = () => within(screen.getByRole('group', { name: 'Ölçek' })).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
    expect(basili()).toEqual(['3 gün']);
    const ilk = en(), ilkDeger = Number(surgu.value);
    fireEvent.wheel(tahta(), { ctrlKey: true, deltaY: -100 });
    expect(en()).toBeCloseTo(ilk * 1.25, 1);
    expect(Number(surgu.value)).toBeGreaterThan(ilkDeger);
    expect(basili()).toEqual(['3 gün']);
    fireEvent.change(surgu, { target: { value: '100' } });
    expect(basili()).toEqual(['Gün']);
    fireEvent.change(surgu, { target: { value: '0' } });
    expect(basili()).toEqual(['Hafta']);
    // Ctrl'siz tekerlek yakınlaştırmaz; en uzaktan bir adım daha Ay'dır (sürgü kapanır).
    fireEvent.wheel(tahta(), { deltaY: 100 });
    expect(basili()).toEqual(['Hafta']);
    fireEvent.wheel(tahta(), { ctrlKey: true, deltaY: 100 });
    expect(basili()).toEqual(['Ay']);
    expect(surgu.disabled).toBe(true);
    // F: seçili iş görünür genişliğe sığar (en yakın ölçek sınırında).
    fireEvent.click(within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: '3 gün' }));
    const once = en(), kisa = en('3.10');
    fireEvent.keyDown(document, { key: 'f' });
    expect(en('3.10')).toBeGreaterThan(kisa * 2);
    expect(basili()).toEqual(['Gün']);
    // Ölçek düğmesi sabit ene döner.
    fireEvent.click(within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: '3 gün' }));
    expect(en()).toBeCloseTo(once, 1);
  });

  it('seçim yokken sığdır söyler; seçili sipariş varsa onun işleri sığar (3365)', async () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Seçileni sığdır' }));
    expect(await screen.findByText('Sığdırmak için bir iş ya da sipariş seçin.')).toBeTruthy();
    cleanup();
    ac({ secim: { ...BOS_SECIM, siparis: '2' } });
    const surgu = screen.getByRole('slider', { name: 'Yakınlaştırma' }) as HTMLInputElement;
    const once = Number(surgu.value);
    fireEvent.click(screen.getByRole('button', { name: 'Seçileni sığdır' }));
    // Emir 2'nin işleri üç günden uzun sürer: 3 günden biraz uzaklaşılır.
    expect(Number(surgu.value)).toBeLessThan(once);
  });

  // 3330: vurgu ve okun çizilmediği durumlar. Hiç adımı planda olmayan kart tahtayı soldurmaz (yer aranırken dolu yerler olduğu gibi görünür);
  // Ay ve Yıl ölçeğinde (yük hücreleri) ok yoktur; seçim başka yerden (arama, liste) gelince de sipariş yanar.
  it('plansız kart tahtayı soldurmaz ve ok çizmez; uzak ölçekte ok yoktur; dışarıdan seçilen sipariş yanar (3330)', () => {
    const c = ornekCalisma();
    const plansiz = { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
    // Sahadan okunan emir durumu boş: planda işi olmayan emir bitmiş sayılmaz, plansız görünür.
    ac({ calisma: plansiz, depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu });
    okKipiSec('Oklar: seçili sipariş');
    const tahta = () => document.querySelector('.tc-pyq-tahta') as HTMLElement;
    const kart = (k: string) => document.querySelector(`[data-kart="${k}"]`) as HTMLElement;
    fireEvent.click(kart('2'));
    expect(kart('2').getAttribute('aria-pressed')).toBe('true');
    expect(tahta().querySelectorAll('[data-sonuk], [data-yanan]')).toHaveLength(0);
    expect(tahta().querySelector('.tc-pyq-oklar')).toBeNull();
    expect(document.querySelector('[data-ok-aciklama]')).toBeNull();
    // Planlı kartta ok vardır; Ay ölçeğine geçince kalkar, 3 güne dönünce geri gelir.
    fireEvent.click(kart('3'));
    expect(tahta().querySelectorAll('.tc-pyq-oklar [data-ok]').length).toBeGreaterThan(0);
    const olcek = (ad: string) => within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { name: ad });
    fireEvent.click(olcek('Ay'));
    expect(tahta().querySelector('.tc-pyq-oklar')).toBeNull();
    fireEvent.click(olcek('3 gün'));
    expect(tahta().querySelectorAll('.tc-pyq-oklar [data-ok]').length).toBeGreaterThan(0);
    cleanup();
    ac({ secim: { ...BOS_SECIM, siparis: '3' } });
    expect([...tahta().querySelectorAll('[data-yanan]')].every((el) => el.getAttribute('data-is')?.startsWith('3.'))).toBe(true);
    expect(tahta().querySelectorAll('[data-yanan]').length).toBeGreaterThan(1);
    expect(tahta().querySelectorAll('[data-sonuk]').length).toBeGreaterThan(0);
  });

  it('kart seçilince o siparişin işleri yanar, ötekiler solar, adımlar arasına bağ oku ve açıklaması gelir; karta yeniden basınca, Esc ile ve boş alana tıklayınca kalkar (3330)', () => {
    ac();
    okKipiSec('Oklar: seçili sipariş');
    const tahta = document.querySelector('.tc-pyq-tahta') as HTMLElement;
    const yanan = () => [...tahta.querySelectorAll('[data-yanan]')].map((el) => el.getAttribute('data-is'));
    const sonuk = () => [...tahta.querySelectorAll('[data-sonuk]')].map((el) => el.getAttribute('data-is'));
    const kart = (k: string) => document.querySelector(`[data-kart="${k}"]`) as HTMLElement;
    // İlk kart kendiliğinden gösterilirken tahta solmaz, ok yoktur.
    expect(yanan()).toEqual([]);
    expect(sonuk()).toEqual([]);
    expect(tahta.querySelector('.tc-pyq-oklar')).toBeNull();
    expect(document.querySelector('[data-ok-aciklama]')).toBeNull();

    fireEvent.click(kart('3'));
    const uc = yanan();
    expect(uc.length).toBeGreaterThan(1);
    expect(uc.every((id) => id?.startsWith('3.'))).toBe(true);
    expect(sonuk().length).toBeGreaterThan(0);
    expect(sonuk().every((id) => id?.startsWith('2.'))).toBe(true);
    // Ok, planda yeri olan ardışık adımlar arasındadır; örnek rotada bütün bağlar "bitince"dir.
    const oklar = [...tahta.querySelectorAll('.tc-pyq-oklar [data-ok]')];
    expect(oklar.length).toBe(uc.length - 1);
    expect(oklar.every((el) => el.getAttribute('data-tur') === 'b' && /^3\.\d+>3\.\d+$/.test(el.getAttribute('data-ok') ?? '') && el.querySelectorAll('path').length === 2)).toBe(true);
    expect([...document.querySelectorAll('[data-ok-aciklama]')].map((el) => el.textContent)).toEqual(['Önceki adım bitince başlar', 'Örtüşmeli: önceki bitmeden başlayabilir']);
    // Telefon listesinde ok yoktur; seçili siparişin satırı öne çıkar ve bağ satırda yazar.
    const liste = document.querySelector('.tc-pyq-liste') as HTMLElement;
    expect(within(liste).getAllByRole('button').filter((b) => b.hasAttribute('data-yanan')).some((b) => / · \d+ .+ bitince$/.test(b.textContent))).toBe(true);
    expect(within(liste).getAllByRole('button').some((b) => b.hasAttribute('data-sonuk'))).toBe(true);

    fireEvent.click(kart('3'));
    expect(yanan()).toEqual([]);
    expect(tahta.querySelector('.tc-pyq-oklar')).toBeNull();

    fireEvent.click(kart('2'));
    expect(yanan().every((id) => id?.startsWith('2.'))).toBe(true);
    expect(sonuk().every((id) => id?.startsWith('3.'))).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(yanan()).toEqual([]);
    expect(sonuk()).toEqual([]);

    fireEvent.click(kart('2'));
    fireEvent.click(tahta.querySelector('[data-satir] .tc-pyq-alan') as HTMLElement);
    expect(yanan()).toEqual([]);
  });
  it('çalışma yokken boş durum gösterir', () => {
    ac({ calisma: null });
    expect(screen.getByText(/Henüz plan yok/)).toBeTruthy();
  });
});

// Kart 3318 a, 2. dilim: teslimden geriye yerleştirme taslağa iki komut yazar (emrin yönü, plana alma). Veri uydurmadır: örnek çalışmanın
// planı boşaltılır (bütün emirler plansız); önizleme ilk adımı istenen saate koyar, emir başlangıçtan on saat sonra biter.
describe('Kokpit teslimden geriye yerleştirme (3318 a, 2. dilim)', () => {
  type Komut = { tur: string } & Record<string, unknown>;
  function kur(o: { yon?: 'geri'; planaAlHata?: boolean } = {}) {
    const taban = ornekCalisma();
    const calisma = { ...taban, plan: null, bekleyen: [], w: { ...taban.w, ...(o.yon ? { yon: o.yon } : {}) } } as unknown as ReturnType<typeof ornekCalisma>;
    let satirlar: { komut: Komut; ne: string; t: number; hata: null }[] = [];
    const cevap = () => ({ taslak: satirlar.length === 0 ? null : { surum: 10 + satirlar.length, tabanSurum: 4, satirlar }, calisma, surum: 4 });
    vi.spyOn(api, 'get').mockImplementation((yol: string) => {
      if (yol === '/plan/taslagim') return Promise.resolve(cevap() as never);
      if (!yol.includes('plana-al-onizlemesi')) return Promise.resolve(null as never);
      const q = new URLSearchParams(yol.slice(yol.indexOf('?'))), S = Number(q.get('baslangic')), emirId = q.get('emirId') ?? '';
      return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: S + 10, isler: [{ isId: `${emirId}.10`, tezgah: q.get('tezgah'), S, C: S + 2 }] } as never);
    });
    const komutlar: Komut[] = [];
    const post = vi.spyOn(api, 'post').mockImplementation((yol: string, govde?: unknown) => {
      if (yol === '/plan/taslagim/geri-al') { satirlar = satirlar.slice(0, -1); return Promise.resolve(cevap() as never); }
      if (yol === '/plan/taslagim/komut') {
        const k = (govde as { komut: Komut }).komut;
        if (o.planaAlHata && k.tur === 'plana-al') return Promise.reject(new Error('ORN-yazılamadı'));
        // Yalnız bu akışın komutları sayılır (önceki testten kalan gecikmeli yazma karışmasın).
        if (k.tur === 'yon' || k.tur === 'plana-al') komutlar.push(k);
        satirlar = [...satirlar, { komut: k, ne: k.tur, t: 1, hata: null }];
      }
      return Promise.resolve(cevap() as never);
    });
    ac({ calisma });
    return { komutlar, geriAlSayisi: () => post.mock.calls.filter((c) => c[0] === '/plan/taslagim/geri-al').length };
  }
  const geriyeBas = async (): Promise<HTMLElement> => {
    const d = await screen.findByRole('button', { name: 'Teslimden geriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(d);
    return screen.findByRole('dialog', { name: 'Teslimden geriye yerleştir' }, { timeout: 4000 });
  };

  it('önce onay sorulur; Vazgeç hiçbir şey yazmaz; Yerleştir önce emrin yönünü geriye çevirir, sonra plana alır', async () => {
    const { komutlar, geriAlSayisi } = kur();
    let pencere = await geriyeBas();
    expect(pencere.textContent).toContain('Emrin yönü "Teslimden geriye" olur.');
    expect(komutlar).toEqual([]);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Teslimden geriye yerleştir' })).toBeNull(); });
    expect(komutlar).toEqual([]);
    pencere = await geriyeBas();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yerleştir' }));
    await waitFor(() => { expect(komutlar).toHaveLength(2); });
    const emirId = String(komutlar[0]?.['emirId']);
    expect(komutlar[0]).toEqual({ tur: 'yon', emirId, yon: 'geri' });
    expect(komutlar[1]).toMatchObject({ tur: 'plana-al', emirId });
    expect(geriAlSayisi()).toBe(0);
  });

  it('yönü zaten geriye olan emirde yalnız plana alma yazılır', async () => {
    const { komutlar } = kur({ yon: 'geri' });
    fireEvent.click(within(await geriyeBas()).getByRole('button', { name: 'Yerleştir' }));
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    expect(komutlar[0]).toMatchObject({ tur: 'plana-al' });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(komutlar).toHaveLength(1);
  });

  it('plana alma yazılamazsa yön değişikliği bir kez geri alınır', async () => {
    const { komutlar, geriAlSayisi } = kur({ planaAlHata: true });
    fireEvent.click(within(await geriyeBas()).getByRole('button', { name: 'Yerleştir' }));
    await waitFor(() => { expect(geriAlSayisi()).toBe(1); });
    expect(komutlar.map((k) => k.tur)).toEqual(['yon']);
    await new Promise((r) => { setTimeout(r, 50); });
    expect(geriAlSayisi()).toBe(1);
  });
});

// Kart 3335 a, 2. dilim: "Plan" menüsü (3504 b'den önce "Planla"). Yer verme var olan plana alma yolunu kullanır; toplu ve yeniden planlama taslağa
// "yeniden-planla" komutu yazar (dizme onu izler, Geri ikisini birlikte alır). Veriler uydurmadır.
describe('Kokpit Plan menüsü (3335-2, 3504 b)', () => {
  type Komut = { tur: string } & Record<string, unknown>;
  function kur(calisma: ReturnType<typeof ornekCalisma>, oz: Partial<PlanlamaEkranOzellikleri> = {}) {
    let satirlar: { komut: Komut; ne: string; t: number; hata: null }[] = [];
    const cevap = () => ({ taslak: satirlar.length === 0 ? null : { surum: 10 + satirlar.length, tabanSurum: 4, satirlar }, calisma, surum: 4 });
    vi.spyOn(api, 'get').mockImplementation((yol: string) => {
      if (yol === '/plan/taslagim') return Promise.resolve(cevap() as never);
      if (!yol.includes('plana-al-onizlemesi')) return Promise.resolve(null as never);
      const q = new URLSearchParams(yol.slice(yol.indexOf('?'))), S = Number(q.get('baslangic')), emirId = q.get('emirId') ?? '';
      return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: S + 10, isler: [{ isId: `${emirId}.10`, tezgah: q.get('tezgah'), S, C: S + 2 }] } as never);
    });
    const komutlar: Komut[] = [];
    vi.spyOn(api, 'post').mockImplementation((yol: string, govde?: unknown) => {
      if (yol === '/plan/taslagim/komut') {
        const k = (govde as { komut: Komut }).komut;
        if (k.tur === 'yeniden-planla' || k.tur === 'plana-al') komutlar.push(k);
        satirlar = [...satirlar, { komut: k, ne: k.tur, t: 1, hata: null }];
      }
      return Promise.resolve(cevap() as never);
    });
    ac({ calisma, ...oz });
    return komutlar;
  }
  const menu = async (): Promise<HTMLElement> => {
    const d = await screen.findByRole('button', { name: 'Plan' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); }, { timeout: 4000 });
    if (d.getAttribute('aria-expanded') !== 'true') fireEvent.click(d);
    return screen.getByRole('menu', { name: 'Plan' });
  };
  const satir = (m: HTMLElement, ad: RegExp): HTMLButtonElement => within(m).getByRole('menuitem', { name: ad }) as HTMLButtonElement;
  const birPlansiz = (): ReturnType<typeof ornekCalisma> => {
    const c = ornekCalisma();
    return { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
  };
  const SAHA = { depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu };

  it('menü üstüyle pencere altı arasındaki boşluğa sığar: yüksekliği --acilir-boy ile sınırlanır, en az 160 px (3510)', async () => {
    const yukseklik = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    try {
      // jsdom kutu ölçmez; menünün üst kenarı taklit edilir: 768 - 100 - 8 = 660; 768 - 700 - 8 = 60, alt sınır 160.
      for (const [ust, beklenen] of [[100, '660px'], [700, '160px']] as const) {
        cleanup();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
          const u = this.classList.contains('tc-pyq-acilir-menu') ? ust : 0;
          return { top: u, bottom: u + 300, left: 0, right: 200, width: 200, height: 300, x: 0, y: u, toJSON: () => ({}) } as DOMRect;
        });
        kur(ornekCalisma());
        const m = await menu();
        expect(m.classList.contains('tc-pyq-acilir-menu')).toBe(true);
        expect(m.style.getPropertyValue('--acilir-boy')).toBe(beklenen);
        vi.restoreAllMocks();
      }
    } finally {
      if (yukseklik) Object.defineProperty(window, 'innerHeight', yukseklik);
    }
  });

  it('toplu ve yeniden planlama taslağa yeniden-planla komutu yazar: plansızların hepsi, seçili sipariş, bütün plan', async () => {
    const komutlar = kur(birPlansiz(), SAHA);
    let m = await menu();
    const hepsi = satir(m, /Plansızları yerleştir \(\d+\)/);
    expect(hepsi.disabled).toBe(false);
    fireEvent.click(hepsi);
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    // İstek yalnız plansız emirleri taşır; sayı düğmedeki sayıdır.
    const isler = komutlar[0]?.['isler'] as string[];
    expect(komutlar[0]?.tur).toBe('yeniden-planla');
    expect(isler).toContain('2');
    expect(isler).not.toContain('3');
    expect(hepsi.textContent).toContain(`(${String(isler.length)})`);
    expect(screen.queryByRole('menu', { name: 'Plan' })).toBeNull();
    // Planlı kart seçilince yer verme pasiftir ve nedenini yazar; yeniden planlama o kartın emirlerini verir.
    fireEvent.click(document.querySelector('[data-kart="3"]') as HTMLElement);
    m = await menu();
    const secili = within(m).getByRole('group', { name: 'Seçili siparişi yerleştir' });
    await waitFor(() => { expect(secili.textContent).toContain('Zaten planda; baştan kurun'); });
    expect((within(secili).getByRole('menuitem', { name: 'İleriye' }) as HTMLButtonElement).disabled).toBe(true);
    // Risk K1: dizme plansız emirlere de yer bulur; satır bunu açıkça yazar.
    expect(satir(m, /Seçili siparişi baştan kur/).textContent).toMatch(/Plansız \d+ emir de yerleşir\./);
    // 3600: menüden seçili sipariş baştan kurma penceresini o sipariş işaretli açar; komut pencerede onaylanınca yazılır.
    fireEvent.click(satir(m, /Seçili siparişi baştan kur/));
    const sp = await screen.findByRole('dialog', { name: 'Planı baştan kur' });
    expect(within(sp).getByRole('radio', { name: /Seçili siparişler/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(sp).getAllByRole('checkbox').filter((x) => (x as HTMLInputElement).checked)).toHaveLength(1);
    fireEvent.click(within(sp).getByRole('button', { name: '1 siparişi baştan kur' }));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['3'] }); });
    expect(screen.queryByRole('dialog', { name: 'Planı baştan kur' })).toBeNull();
    fireEvent.click(satir(await menu(), /Baştan kur…/));
    // Baştan kurma onay ister (3504 b): Vazgeç hiçbir komut yazmaz; onaylanınca bütün planı taşıyan komut yazılır.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Planı baştan kur' })).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('dialog', { name: 'Planı baştan kur' })).toBeNull();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(komutlar).toHaveLength(2);
    fireEvent.click(satir(await menu(), /Baştan kur…/));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Planı baştan kur' })).getByRole('button', { name: 'Bütün planı baştan kur' }));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['*'] }); });
    expect(komutlar).toHaveLength(3);
  });

  // 3504 b: menüdeki Planı güncelle şeritteki düğmeyle aynı işi yapar: bekleyen veri değişikliklerini plana işler (önce taslak kaydedilir).
  it('menüdeki Planı güncelle (N) bekleyen değişiklikleri plana işletir; bekleyen yokken pasiftir ve nedenini yazar', async () => {
    const b = (id: string, isler: string[]): BekleyenDegisiklik => ({ id, ne: `Değişti ${id}`, ayrinti: '', kim: 'Deneme Kisi', t: 1, isler, geri: [] });
    const c = ornekCalisma();
    const bekleyenli = { ...c, bekleyen: [b('ORN-a', ['1']), b('ORN-b', ['2'])] } as ReturnType<typeof ornekCalisma>;
    expect(bekleyenli.plan?.dataVer).not.toBe(bekleyenli.dataVer);
    const kaydet = vi.fn(() => Promise.resolve(null));
    kur(bekleyenli, { ...SAHA, komut: { ...komutKur(0), kaydet } });
    const guncelle = satir(await menu(), /^Planı güncelle \(2\)/);
    expect(guncelle.disabled).toBe(false);
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.click(guncelle);
    await waitFor(() => { expect(kaydet).toHaveBeenCalledTimes(1); });
    expect(screen.queryByRole('menu', { name: 'Plan' })).toBeNull();
    cleanup();
    planKurSifirla();
    const guncel = { ...c, plan: { ...c.plan, dataVer: c.dataVer }, bekleyen: [] } as typeof c;
    kur(guncel, SAHA);
    const bos = satir(await menu(), /^Planı güncelle/);
    expect(bos.disabled).toBe(true);
    expect(bos.textContent).toContain('Plan güncel; işlenecek yeni kayıt yok');
  });

  // 3423: yarım planlı emir plana alınmaz; menü ve yol onu yeniden planlamaya yollar.
  it('yarım planlı emir: menü "Kısmen planda" der, "Seçili siparişi yeniden planla" ve yoldaki "Eksik adımları planla" o emri yeniden planlar; plana alma komutu yazılmaz', async () => {
    const c = ornekCalisma(), ops = (c.plan as unknown as { ops: Record<string, { job: string }> }).ops;
    const eksik = Object.keys(ops).filter((id) => ops[id]?.job === '3').sort().at(-1) as string;
    const yarim = { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries(ops).filter(([id]) => id !== eksik)), fail: [eksik] } } as typeof c;
    const komutlar = kur(yarim, SAHA);
    fireEvent.click(await screen.findByText('ORNEK Burç', { exact: false, selector: '[data-kart="3"] *' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eksik adımları planla' }));
    await waitFor(() => { expect(komutlar).toEqual([{ tur: 'yeniden-planla', isler: ['3'] }]); });
    const m = await menu();
    expect(within(m).getByRole('group', { name: 'Seçili siparişi yerleştir' }).textContent).toContain('Kısmen planda');
    const yeniden = satir(m, /Seçili siparişi baştan kur/);
    expect(yeniden.disabled).toBe(false);
    fireEvent.click(yeniden);
    const pencere = await screen.findByRole('dialog', { name: 'Planı baştan kur' });
    fireEvent.click(within(pencere).getByRole('button', { name: '1 siparişi baştan kur' }));
    await waitFor(() => { expect(komutlar).toHaveLength(2); });
    expect(komutlar[1]).toEqual({ tur: 'yeniden-planla', isler: ['3'] });
  });

  // 3335-2b: geride kalan (başlaması geçmiş, başlamamış) işlerin emirleri tek satırla yeniden planlanır.
  it('geride kalanları yeniden planla: sayı geride işi olan emir sayısıdır, komut o emirleri taşır; geride iş yokken satır pasiftir ve nedenini yazar', async () => {
    // Bütün işler başlamamış ve çok eskide: her planlı emir geridedir.
    const c = ornekCalisma();
    const ops = Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { m: string; S: number; C: number; act?: number; fas?: number }> }).ops).map(([id, r]) => [id, { ...r, act: 0, S: r.S - 5000, C: r.C - 5000 }]));
    const komutlar = kur({ ...c, plan: { ...c.plan, ops } } as typeof c, SAHA);
    const m = await menu();
    const geride = satir(m, /Geride kalanları baştan kur \(\d+\)/);
    const n = Number(/\((\d+)\)/.exec(geride.textContent ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(geride.disabled).toBe(false);
    expect(geride.textContent).toContain('şimdiden sonraya dizilir');
    fireEvent.click(geride);
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    expect(komutlar[0]?.tur).toBe('yeniden-planla');
    expect((komutlar[0]?.['isler'] as string[]).length).toBe(n);
    expect(komutlar[0]?.['isler']).not.toContain('*');
    cleanup();
    // Bütün işler ileride: geride iş yok.
    const ileri = Object.fromEntries(Object.entries(ops).map(([id, r]) => [id, { ...r, S: r.S + 15000, C: r.C + 15000 }]));
    kur({ ...c, plan: { ...c.plan, ops: ileri } } as typeof c, SAHA);
    const bos = satir(await menu(), /Geride kalanları baştan kur \(0\)/);
    expect(bos.disabled).toBe(true);
    expect(bos.textContent).toContain('Geride kalan iş yok');
    cleanup();
    // Geride işlerden biri elle kilitli: satır etkindir, kilitli işin yerinde kalacağını yazar.
    const idler = Object.keys(ops);
    const kilit = (l: string[]): Record<string, unknown> => Object.fromEntries(l.map((id) => [id, { m: ops[id]?.m, S: ops[id]?.S }]));
    kur({ ...c, plan: { ...c.plan, ops }, locks: kilit(idler.slice(0, 1)) } as typeof c, SAHA);
    const biri = satir(await menu(), /Geride kalanları baştan kur \(\d+\)/);
    expect(biri.disabled).toBe(false);
    expect(biri.textContent).toContain('Elle kilitli 1 iş yerinde kalır.');
    cleanup();
    // Geride işlerin hepsi elle kilitli: taşınacak emir yok, satır pasiftir ve nedenini yazar.
    kur({ ...c, plan: { ...c.plan, ops }, locks: kilit(idler) } as typeof c, SAHA);
    const hepsi = satir(await menu(), /Geride kalanları baştan kur \(0\)/);
    expect(hepsi.disabled).toBe(true);
    expect(hepsi.textContent).toMatch(/Geride kalan \d+ iş elle kilitli; kilidi kaldırmadan taşınmaz/);
  });

  // 3317 a (3. adım): "Plan geride" satırı tek başına uygulanır; istek yalnız o satırın emri içindir.
  it('plan geride satırında Etkisini gör yalnız o emri yeniden dizdirir', async () => {
    const c = ornekCalisma();
    const ops = Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string; S: number; C: number; act?: number }> }).ops).map(([id, r]) => [id, { ...r, act: 0, S: r.S - 5000, C: r.C - 5000 }]));
    const komutlar = kur({ ...c, plan: { ...c.plan, ops } } as typeof c, SAHA);
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri aç' }));
    const geride = within(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' })).getByRole('region', { name: 'Plan geride' });
    const satir = within(geride).getAllByRole('listitem')[0] as HTMLElement;
    fireEvent.click(within(satir).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    const isler = komutlar[0]?.['isler'] as string[];
    expect(komutlar[0]?.tur).toBe('yeniden-planla');
    expect(isler).toHaveLength(1);
    expect(Object.values(ops).some((r) => r.job === isler[0])).toBe(true);
  });

  it('seçili plansız siparişte yön satırın içinde seçilir: İleriye plana alır, Teslimden geriye onay sorar; plan yokken yeniden dizme pasiftir', async () => {
    const taban = ornekCalisma();
    const komutlar = kur({ ...taban, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    let m = await menu();
    const secili = (): HTMLElement => within(m).getByRole('group', { name: 'Seçili siparişi yerleştir' });
    await waitFor(() => { expect(secili().textContent).toContain('yönü seçin'); }, { timeout: 4000 });
    expect(satir(m, /Baştan kur…/).disabled).toBe(true);
    expect(satir(m, /Baştan kur…/).textContent).toContain('Henüz plan yok');
    expect(satir(m, /Geride kalanları baştan kur \(0\)/).disabled).toBe(true);
    expect(satir(m, /Geride kalanları baştan kur/).textContent).toContain('Henüz plan yok');
    // Dört adım ve taslak cümlesi şeridin altında bir kez yazar.
    const akis = document.querySelector('[data-akis]') as HTMLElement;
    expect(within(akis).getByRole('list', { name: 'Plan adımları' }).textContent).toBe('1 Seç2 Sistem önersin3 Düzelt4 Onayla');
    expect(akis.textContent).toContain('atölyenin gördüğü plan yalnız Canlıya al ile değişir');
    expect(satir(m, /Plansızları yerleştir/).disabled).toBe(true);
    expect(satir(m, /İşaretli adımları yerleştir \(0\)/).disabled).toBe(true);
    const ileri = within(secili()).getByRole('menuitem', { name: 'İleriye' }) as HTMLButtonElement;
    await waitFor(() => { expect(ileri.disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(ileri);
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    expect(komutlar[0]).toMatchObject({ tur: 'plana-al' });
    m = await menu();
    fireEvent.click(within(secili()).getByRole('menuitem', { name: 'Teslimden geriye' }));
    expect(await screen.findByRole('dialog', { name: 'Teslimden geriye yerleştir' }, { timeout: 4000 })).toBeTruthy();
  });

  // Test T1: kartta plansız emir de varsa yeniden planlama isteği yalnız planda yeri olan emirleri taşır.
  it('seçili siparişi yeniden planla yalnız kartın planlı emirlerini gönderir', async () => {
    const durum = { emirler: [], siparisBaglari: { '2': { siparis: '50', no: 'ORN-SP-50', musteri: 'Deneme Müşteri A', kalem: 1 }, '3': { siparis: '50', no: 'ORN-SP-50', musteri: 'Deneme Müşteri A', kalem: 2 } } };
    const komutlar = kur(birPlansiz(), { depo: { ...DEPO, durum } as unknown as PlanlamaDeposu });
    fireEvent.click(await waitFor(() => document.querySelector('[data-kart="sp:50"]') as HTMLElement));
    const m = await menu();
    await waitFor(() => { expect(satir(m, /Seçili siparişi baştan kur/).disabled).toBe(false); });
    fireEvent.click(satir(m, /Seçili siparişi baştan kur/));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Planı baştan kur' })).getByRole('button', { name: '1 siparişi baştan kur' }));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['3'] }); });
  });

  // Test T2: istek numarasıyla bir kez işlenir; başka karta gidip dönünce aynı istek yeniden yazılmaz.
  it('menü isteği bir kez işlenir: kart değişip geri gelince plana alma ikinci kez gitmez', async () => {
    const taban = ornekCalisma();
    const komutlar = kur({ ...taban, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    const m = await menu();
    const ileri = within(within(m).getByRole('group', { name: 'Seçili siparişi yerleştir' })).getByRole('menuitem', { name: 'İleriye' }) as HTMLButtonElement;
    await waitFor(() => { expect(ileri.disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(ileri);
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    const kartlar = [...document.querySelectorAll<HTMLElement>('[data-kart]')];
    const secili = kartlar.find((k) => k.getAttribute('aria-pressed') === 'true' || k.getAttribute('aria-current') === 'true') ?? kartlar[0]!;
    const oteki = kartlar.find((k) => k !== secili)!;
    fireEvent.click(oteki);
    await waitFor(() => { expect(document.querySelector('[data-emir]')?.getAttribute('data-emir')).not.toBe(komutlar[0]?.['emirId']); });
    fireEvent.click(secili);
    await waitFor(() => { expect(document.querySelector(`[data-emir="${String(komutlar[0]?.['emirId'])}"]`)).toBeTruthy(); });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(komutlar).toHaveLength(1);
  });

  // Test T4: termini olmayan emir teslimden geriye yerleştirilemez; düğme pasiftir ve nedenini yazar.
  it('termini olmayan plansız emirde Teslimden geriye pasiftir ve nedenini yazar', async () => {
    const taban = ornekCalisma();
    const D = { ...taban.D, siparisler: (taban.D as unknown as { siparisler: Record<string, unknown>[] }).siparisler.map((x) => ({ ...x, termin: null })) };
    kur({ ...taban, D, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    const m = await menu();
    const grup = within(m).getByRole('group', { name: 'Seçili siparişi yerleştir' });
    await waitFor(() => { expect(grup.textContent).toContain('yönü seçin'); }, { timeout: 4000 });
    const geri = within(grup).getByRole('menuitem', { name: 'Teslimden geriye' }) as HTMLButtonElement;
    expect(geri.disabled).toBe(true);
    expect(geri.title).toBe('Emrin termini yok; geriye yerleştirilemez.');
  });

  // Test T5: tabloda tezgâhı seçilen adım menüde sayılır; satır açılır ve seçimle plana alır.
  it('tabloda tezgâh seçilince "İşaretli adımları planla (1)" açılır ve plana alma komutunu yazar', async () => {
    const taban = ornekCalisma();
    const komutlar = kur({ ...taban, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    let m = await menu();
    expect(satir(m, /İşaretli adımları yerleştir \(0\)/).textContent).toContain('İşaretli adım yok');
    const kutu = (await screen.findAllByRole('combobox', { name: /tezgâhı$/ }))[0] as HTMLSelectElement;
    const secenek = [...kutu.options].find((o2) => o2.value !== '' && o2.value !== kutu.value)!;
    fireEvent.change(kutu, { target: { value: secenek.value } });
    m = await menu();
    await waitFor(() => { expect(satir(m, /İşaretli adımları yerleştir \(1\)/).disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(satir(m, /İşaretli adımları yerleştir \(1\)/));
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    expect(komutlar[0]).toMatchObject({ tur: 'plana-al', tezgah: secenek.value });
  });
});

// 3330-3c: fason adımın satırında firma tarihi. Örnekte ürün 2'nin üçüncü adımı (k 30) fasondur; sipariş numarası ve tarih uydurmadır.
describe('Kokpit fason adımında firma tarihi (3330-3c)', () => {
  const sip = ornekCalisma().D.siparisler.find((x) => x.urun === '2')!;
  const emirler = (fasonSiparis?: unknown): unknown => ({ orders: [], opStatus: {}, opYer: { [`${sip.id}|root|3`]: { fasonId: '5', terminGun: 2, stationId: null, setup: null, cycle: null, ...(fasonSiparis ? { fasonSiparis } : {}) } } });
  const satirNotu = async (): Promise<HTMLElement | null> => {
    fireEvent.click(await waitFor(() => document.querySelector(`[data-kart="${sip.id}"]`) as HTMLElement));
    const satir = await waitFor(() => { const x = document.querySelector(`[data-adim-satir="${sip.id}.30"]`); expect(x).toBeTruthy(); return x as HTMLElement; });
    return satir.querySelector<HTMLElement>('small[data-firma]');
  };

  it('açık siparişin firma tarihi ve numarası satırda yazar; tarihi geçmiş sipariş uyarıyla yazar', async () => {
    ac({ depo: { ...DEPO, durum: { emirler: emirler({ tarih: '2020-01-05', siparisNo: 'ORN-SA-7' }) } } as unknown as PlanlamaDeposu });
    const not = await satirNotu();
    expect(not?.textContent).toBe('Firma tarihi 05.01 · sipariş ORN-SA-7 · firma tarihi geçti');
    expect(not?.hasAttribute('data-gecti')).toBe(true);
  });

  // Plan firma tarihi girilmeden önce dizilmişse dönüş günü tarihten farklıdır: satır farkı açıklar; geçmiş tarihte bu yazı çıkmaz.
  it('planın dönüş günü firma tarihinden farklıysa satır planın güncellenince kayacağını yazar', async () => {
    ac({ depo: { ...DEPO, durum: { emirler: emirler({ tarih: '2099-01-05', siparisNo: null }) } } as unknown as PlanlamaDeposu });
    const not = await satirNotu();
    expect(not?.textContent).toBe('Firma tarihi 05.01 · plan güncellenince dönüş bu güne kayar');
    expect(not?.hasAttribute('data-eski')).toBe(true);
    expect(not?.hasAttribute('data-gecti')).toBe(false);
  });

  it('siparişi olmayan fason adımda dönüşün tahmin olduğu yazar; emir okunamadıysa satır yazmaz', async () => {
    ac({ depo: { ...DEPO, durum: { emirler: emirler() } } as unknown as PlanlamaDeposu });
    const not = await satirNotu();
    expect(not?.getAttribute('data-firma')).toBe('yok');
    expect(not?.textContent).toBe('Firma tarihi yok · dönüş tahmini');
    cleanup();
    ac({ depo: { ...DEPO, durum: null } as unknown as PlanlamaDeposu });
    expect(await satirNotu()).toBeNull();
  });
});

// Kokpit tek görünümdür: ayrıntılı düzene geçiş yoktur; araçları liste düzeninin "Diğer" menüsünden, liste düzeninin içinde açılır.
describe('Kokpit tek görünüm', () => {
  const gitSade = vi.fn();
  function SadeKokpit() {
    const [secim, kur] = useState<PlanlamaSecimi>(BOS_SECIM);
    return (
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={komutKur(0)} git={gitSade} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={secim} sec={(x) => { kur((y) => ({ ...y, ...x })); }}
      />
    );
  }
  // Açılış Emirler ağacıdır (3493 b); bu testler sipariş tablosunu Siparişler görünümünde dener.
  const sadeAc = (): void => {
    render(<MemoryRouter initialEntries={['/']}><BildirimSaglayici><Yuvali><SadeKokpit /></Yuvali></BildirimSaglayici></MemoryRouter>);
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Siparişler' }));
  };
  const diger = (ad: string): HTMLElement => {
    if (!screen.queryByRole('menu', { name: 'Diğer' })) fireEvent.click(screen.getByRole('button', { name: 'Diğer' }));
    return within(screen.getByRole('menu', { name: 'Diğer' })).getByText(ad).closest('button')!;
  };

  it('"Diğer" menüsünde ayrıntılı Kokpit yoktur; Ayarlar sayfaya gider, Duruş ve mesai liste düzeninde panel olarak açılır', () => {
    sadeAc();
    fireEvent.click(screen.getByRole('button', { name: 'Diğer' }));
    expect(screen.getByRole('menu', { name: 'Diğer' }).textContent).not.toContain('Ayrıntılı Kokpit');
    fireEvent.click(diger('Ayarlar'));
    expect(gitSade).toHaveBeenCalledWith('ayarlar');
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Siparişler' })).toBeTruthy();
    expect(document.querySelector('.tc-pyq')?.getAttribute('data-duzen')).toBe('liste');
    fireEvent.click(diger('Duruş ve mesai'));
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    expect(document.querySelector('.tc-pyq')?.getAttribute('data-duzen')).toBe('liste');
  });

  it('Matris liste düzeninde açılır; "Listeye dön" sipariş tablosunu geri getirir', () => {
    sadeAc();
    expect(screen.queryByRole('button', { name: 'Listeye dön' })).toBeNull();
    fireEvent.click(diger('Matris'));
    expect(screen.getByRole('region', { name: 'Matris' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Siparişler' })).toBeNull();
    expect(document.querySelector('.tc-pyq')?.getAttribute('data-duzen')).toBe('liste');
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    expect(screen.getByRole('table', { name: 'Siparişler' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Matris' })).toBeNull();
  });

  it('3B liste düzeninde açılır ve "Listeye dön" çıkar; "Önce / sonra" işaretlenir, ikinci basışta kalkar', () => {
    sadeAc();
    expect(diger('Önce / sonra').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(diger('Önce / sonra'));
    expect(diger('Önce / sonra').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(diger('Önce / sonra'));
    expect(diger('Önce / sonra').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(diger('3B'));
    expect(screen.getByRole('region', { name: '3B' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Siparişler' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Listeye dön' })).toBeTruthy();
    expect(document.querySelector('.tc-pyq')?.getAttribute('data-duzen')).toBe('liste');
  });

  it('açık satırda planda yeri olan adıma basınca iş seçilir; yeniden basınca bırakılır', () => {
    // Tahta seçilen işi görünüme getirirken CSS.escape kullanır; test ortamında yoktur.
    const kacis = vi.fn((x: string) => x);
    vi.stubGlobal('CSS', { escape: kacis });
    sadeAc();
    const satir = document.querySelector('.tc-pyq-ld-kart:not([data-d="plansiz"]) [data-kart]')!;
    fireEvent.click(within(satir as HTMLElement).getByRole('button'));
    const adim = document.querySelector<HTMLButtonElement>('.tc-pyq-ld-adimlar button[data-adim]')!;
    expect(adim.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(adim);
    expect(document.querySelector(`.tc-pyq-ld-adimlar button[data-adim="${adim.dataset['adim'] ?? ''}"]`)?.getAttribute('aria-pressed')).toBe('true');
    // Seçilen iş tezgâhlarda görünüme getirilir: tahta o işin kutusunu arar.
    expect(kacis).toHaveBeenCalledWith(adim.dataset['adim']);
    expect(document.querySelectorAll('.tc-pyq-ld-adimlar button[aria-pressed="true"]').length).toBe(1);
    fireEvent.click(document.querySelector<HTMLButtonElement>('.tc-pyq-ld-adimlar button[aria-pressed="true"]')!);
    expect(document.querySelectorAll('.tc-pyq-ld-adimlar button[aria-pressed="true"]').length).toBe(0);
    // Satır açık kalır: adımı bırakmak siparişi kapatmaz.
    expect(document.querySelector('.tc-pyq-ld-adimlar')).not.toBeNull();
    // Duruş ve mesai açıkken operasyona basmak paneli kapatmaz (yazılmakta olan giriş düşmez).
    fireEvent.click(diger('Duruş ve mesai'));
    fireEvent.click(document.querySelector<HTMLButtonElement>('.tc-pyq-ld-adimlar button[data-adim]')!);
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('Kokpit emir satırlı ağaç (3493 b)', () => {
  function acListe() {
    render(
      <MemoryRouter initialEntries={['/']}><BildirimSaglayici><Yuvali>
        <Kokpit
          depo={DEPO} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
          olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </Yuvali></BildirimSaglayici></MemoryRouter>,
    );
  }

  it('açılışta Emirler: her satır bir emir, adımlar kapalı; açınca adımlar alt satır olur, emir satırında özet çubuğu kalır; Tezgâhlar ve Siparişler ayrı sekme', () => {
    acListe();
    const gorunum = screen.getByRole('group', { name: 'Görünüm' });
    expect(within(gorunum).getAllByRole('button').map((x) => [x.textContent, x.getAttribute('aria-pressed')])).toEqual([['Emirler', 'true'], ['Tezgâhlar', 'false'], ['Siparişler', 'false']]);
    const bolum = screen.getByRole('region', { name: 'Emirler' });
    const emirler = [...bolum.querySelectorAll<HTMLButtonElement>('button[data-agac]')];
    expect(emirler.length).toBeGreaterThan(0);
    expect(emirler.every((x) => x.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(bolum.querySelectorAll('[data-agac-adim]').length).toBe(0);
    const ilk = emirler[0]!;
    const id = ilk.getAttribute('data-agac')!;
    const satir = ilk.closest<HTMLElement>('[data-satir]')!;
    const once = satir.querySelectorAll('[data-is]').length;
    expect(once).toBeGreaterThan(0);
    fireEvent.click(ilk);
    expect(ilk.getAttribute('aria-expanded')).toBe('true');
    const adimlar = [...bolum.querySelectorAll<HTMLElement>(`[data-agac-adim][data-satir^="${id}>"]`)];
    expect(adimlar.length).toBeGreaterThan(0);
    expect(adimlar[0]!.querySelector('.tc-pyq-bas b')?.textContent).toMatch(/^1\. /);
    expect(satir.querySelectorAll('[data-is]').length).toBe(0);
    expect(satir.querySelector(`[data-ozet="${id}"]`)).not.toBeNull();
    fireEvent.click(ilk);
    expect(bolum.querySelectorAll('[data-agac-adim]').length).toBe(0);
    fireEvent.click(within(gorunum).getByRole('button', { name: 'Tezgâhlar' }));
    expect(screen.getByRole('region', { name: 'Tezgâhlar' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Emirler' })).toBeNull();
    fireEvent.click(within(gorunum).getByRole('button', { name: 'Siparişler' }));
    expect(screen.getByRole('table', { name: 'Siparişler' })).toBeTruthy();
  });

  it('ağaçta taşıma: alt satırdaki çubuk kendi satırında bırakılınca aynı tezgâhla önizlenir; başka emrin satırına bırakılınca sorulmaz', async () => {
    const eski = (window as { PointerEvent?: unknown }).PointerEvent;
    class Imlec extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? 'mouse'; } }
    (window as { PointerEvent?: unknown }).PointerEvent = Imlec;
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue({ calismaSurumu: 1, gecerli: false, ileti: 'Örnek: yer dolu', isler: [] });
    acListe();
    const bolum = screen.getByRole('region', { name: 'Emirler' });
    const ac = [...bolum.querySelectorAll<HTMLButtonElement>('button[data-agac]')].find((b) => b.closest('[data-satir]')!.querySelectorAll('[data-is]').length > 0)!;
    const id = ac.getAttribute('data-agac')!;
    fireEvent.click(ac);
    const adimSatiri = bolum.querySelector<HTMLElement>(`[data-agac-adim][data-satir^="${id}>"]:has([data-is])`)!;
    const is = adimSatiri.querySelector<HTMLElement>('[data-is]')!;
    const isId = is.getAttribute('data-is')!;
    const tezgah = (ornekCalisma().plan as unknown as { ops: Record<string, { m: string }> }).ops[isId]!.m;
    const surukle = (hedef: HTMLElement, hayalet?: () => void) => {
      fireEvent.pointerDown(is, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 });
      fireEvent.pointerMove(hedef, { pointerType: 'mouse', clientX: 30, clientY: 0 });
      fireEvent.pointerMove(hedef, { pointerType: 'mouse', clientX: 400, clientY: 0 });
      hayalet?.();
      fireEvent.pointerUp(document, { pointerType: 'mouse' });
    };
    // Başka emrin satırı geçerli hedef değildir.
    const baska = [...bolum.querySelectorAll<HTMLElement>('[data-satir]')].find((r) => r.dataset.satir !== id && !r.dataset.satir!.startsWith(`${id}>`) && !r.hasAttribute('data-agac-adim'))!;
    surukle(baska.querySelector<HTMLElement>('.tc-pyq-alan')!);
    await new Promise((r) => setTimeout(r, 50));
    expect(oz).not.toHaveBeenCalled();
    // Hayalet emir satırına değil, adımın kendi alt satırına çizilir.
    surukle(adimSatiri.querySelector<HTMLElement>('.tc-pyq-alan')!, () => {
      expect(adimSatiri.querySelector('.tc-pyq-hayalet')).not.toBeNull();
      expect(bolum.querySelector(`[data-satir="${id}"] .tc-pyq-hayalet`)).toBeNull();
    });
    await waitFor(() => { expect(oz).toHaveBeenCalledTimes(1); });
    expect(oz.mock.calls[0]![0]).toMatchObject({ isId, tezgah });
    (window as { PointerEvent?: unknown }).PointerEvent = eski;
  });
});
