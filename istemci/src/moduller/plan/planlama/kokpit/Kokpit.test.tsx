import { useMemo, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { bekleyenListesi, type CalismaKomutu } from '../kayit.ts';
import type { BekleyenDegisiklik } from '../tipler.ts';
import { kaynakSatiri } from '../ortak/degisiklik-seridi/kurallar.ts';
import { otomatikUygulaIste, otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { SeritYuvasi, type SeritYuvalari } from '../motor/ust/yuva.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';
import { onayAcIste } from './istek.ts';

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
  render(
    <MemoryRouter><BildirimSaglayici><Yuvali dis={dis}>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={yaz ? komutKur(0) : null} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={sec} {...oz}
      />
    </Yuvali></BildirimSaglayici></MemoryRouter>,
  );
  return { sec };
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
    // Başlamış iş ve fason adım taşınmaz diye işaretlidir.
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sabit')).toBe(true);
    expect(document.querySelector('[data-is="2.30"]')?.hasAttribute('data-sabit')).toBe(true);
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

  it('taslak varken Geri taslağın değişiklik sayısını gösterir, son değişikliği dizmesiyle birlikte geri alır; Canlıya al yalnız taslak çubuğundadır', async () => {
    const { post } = taslakSunucusu([satir(AYAR, 'Plan ayarı'), satir(TASI, '3.10 → T2'), satir({ tur: 'diz', isler: ['*'] }, 'Plan yeniden dizildi')]);
    ac({ yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al']) });
    const cubuk = await screen.findByRole('region', { name: 'Taslak' });
    expect(within(cubuk).getByText('Taslak · 2 değişiklik')).toBeTruthy();
    const geri = within(screen.getByRole('group', { name: 'Geri' })).getByRole('button', { name: /Geri/ });
    expect(geri.querySelector('.tc-pyq-rozet')?.textContent).toBe('2');
    // Taslak varken canlıya alma taslak çubuğundaki tek düğmededir; üst şeritte ikincisi yoktur.
    expect(screen.getAllByRole('button', { name: /Canlıya al/ }).map((b) => cubuk.contains(b))).toEqual([true]);
    fireEvent.click(geri);
    await waitFor(() => { expect(within(cubuk).getByText('Taslak · 1 değişiklik')).toBeTruthy(); });
    // Geri alınca kalan taslak yeniden dizilir: önce iki geri-al, sonra taslağın görünümünde değerlendirme.
    await waitFor(() => { expect(post.mock.calls.length).toBeGreaterThanOrEqual(3); });
    expect(post.mock.calls.slice(0, 3).map((c) => [c[0], c[1]])).toEqual([
      ['/plan/taslagim/geri-al', { taslakSurumu: 13 }], ['/plan/taslagim/geri-al', { taslakSurumu: 12 }],
      ['/plan/taslagim/degerlendirme', { taslakSurumu: 11, istek: { tur: 'plan-uygula', isler: ['*'] } }],
    ]);
  });

  // Risk 3282 1d-3 N1: tek düğme ortak plana yazar; onay sayfası bunu kalıcı söyler, canlı değişince ya da sayfa kapanınca söylemez.
  it('taslak çubuğundan yazılınca onay sayfasında taslağın yazıldığı satırı durur; canlı değişince ve üst düğmeyle açılınca yoktur', async () => {
    taslakSunucusu([satir(TASI, '3.10 → T2')]);
    const sen = (canliSurum: number) => ({ canli: null, canliSurum, senaryolar: [] });
    const sayfa = (canliSurum: number) => (
      <MemoryRouter><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar: sen(canliSurum) } as unknown as PlanlamaDeposu} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>
    );
    const { rerender } = render(sayfa(3));
    const SATIR = 'Taslak ortak plana yazıldı; canlı plan değişmedi.';
    const satirVar = () => screen.queryAllByRole('status').some((e) => e.textContent === SATIR);
    fireEvent.click(within(await screen.findByRole('region', { name: 'Taslak' })).getByRole('button', { name: 'Canlıya al' }));
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
      <MemoryRouter><BildirimSaglayici>
        <Kokpit
          depo={{ ...DEPO, senaryolar: { canli: null, canliSurum: 3, senaryolar: [eski] } } as unknown as PlanlamaDeposu} calisma={ornekCalisma()} komut={komutKur(0)} git={vi.fn()} yenile={vi.fn()}
          yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])} olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
        />
      </BildirimSaglayici></MemoryRouter>,
    );
    if (taslaktan) fireEvent.click(within(await screen.findByRole('region', { name: 'Taslak' })).getByRole('button', { name: 'Canlıya al' }));
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
    if (taslakVar) await screen.findByRole('region', { name: 'Taslak' });
    await waitFor(() => { expect(kaydet).toHaveBeenCalledTimes(n); });
    expect(kaydet).toHaveBeenCalledTimes(n);
  });

  it('taslak yokken Geri pasiftir ve taslak çubuğu görünmez', async () => {
    taslakSunucusu([]);
    ac();
    await waitFor(() => { expect(api.get).toHaveBeenCalledWith('/plan/taslagim'); });
    expect(within(screen.getByRole('group', { name: 'Geri' })).getByRole('button', { name: /Geri/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Taslak' })).toBeNull();
  });

  it('yazamayan kişide tutma kapalıdır: sağ tık menü açmaz, Onaya gönder yoktur', () => {
    ac({}, false);
    expect(document.querySelectorAll('.tc-pyq-is').length).toBe(5);
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (is) fireEvent.contextMenu(is);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onaya gönder' })).toBeNull();
  });

  it('yazabilen kişide sağ tık menüsü Yapışarak tut ve Ayrıntı sunar; tutulan iş için ipucu çıkar, Esc vazgeçer', () => {
    ac();
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (!is) throw new Error('iş yok');
    fireEvent.contextMenu(is);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((x) => x.textContent)).toEqual([expect.stringContaining('Yapışarak tut'), expect.stringContaining('Ayrıntı')]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Yapışarak tut/ }));
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
      <MemoryRouter><BildirimSaglayici>
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
    expect(ozet.textContent).toBe('3 değişiklik1 veri · 2 sahaGör ve uygula');
    const serit = screen.getByRole('region', { name: 'Siparişler, sırasıyla' });
    expect(serit.querySelector('[data-kart="3"] [data-olay]')?.textContent).toContain('1 değişiklik');
    expect(screen.queryByRole('region', { name: 'Planı etkileyen değişiklikler' })).toBeNull();
    const dugme = within(ozet).getByRole('button', { name: 'Gör ve uygula' });
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
    // Veri değişikliği emre bağlı değildir; toplu düğmenin ne uygulayacağı notta yazar.
    expect(within(within(liste).getByRole('region', { name: 'Veri değişti' })).queryByRole('button')).toBeNull();
    expect(liste.textContent).toContain('"Planı güncelle (1)" yalnız "Veri değişti" satırlarının');
    fireEvent.click(within(satirlar[1] as HTMLElement).getByRole('button', { name: 'Göster' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Gör ve uygula' }));
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect(liste.textContent).not.toContain('Planı güncelle');
    expect(liste.textContent).toContain('"Sahada oldu" ve "Plan geride" satırları bilgi içindir');
  });

  // Salt okunur kişide başka sayfadaki değişiklik kayda yazılmaz; sayfa üstündeki satır Kokpit'te çizilmediği için liste onu da taşır.
  it('yazılmamış başka sayfa değişikliği plan güncelken de listede "Veri değişti" altında görünür; kayıtlıysa ikinci kez yazılmaz', () => {
    const guncel = ornekCalisma();
    const c = { ...guncel, dataVer: guncel.plan?.dataVer ?? guncel.dataVer } as ReturnType<typeof ornekCalisma>;
    const dis = kaynakSatiri({ alanlar: ['urunler'], farklar: [], kesik: false } as unknown as Parameters<typeof kaynakSatiri>[0], 0, c.dataVer);
    ac({ calisma: c }, false, dis);
    expect((document.querySelector('[data-degisiklik-ozeti] b') as HTMLElement).textContent).toBe('1 değişiklik');
    fireEvent.click(screen.getByRole('button', { name: 'Gör ve uygula' }));
    const veri = within(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' })).getByRole('region', { name: 'Veri değişti' });
    expect(within(veri).getAllByRole('listitem')).toHaveLength(1);
    expect(veri.textContent).toContain(dis.ne);
    cleanup();
    ac({}, false);
    fireEvent.click(screen.getByRole('button', { name: 'Gör ve uygula' }));
    const once = within(screen.getByRole('region', { name: 'Veri değişti' })).getAllByRole('listitem').length;
    cleanup();
    const kayitli = bekleyenListesi(ornekCalisma())[0]!;
    ac({}, false, kayitli);
    fireEvent.click(screen.getByRole('button', { name: 'Gör ve uygula' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Gör ve uygula' }));
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
  it('Araçlar menüsü: Duruş ve mesai açılır ve kapanır; Ayarlar onu kapatır; menü seçimle kapanır', () => {
    ac();
    expect(within(screen.getByRole('button', { name: 'Araçlar' })).queryByText('Araçlar')).not.toBeNull();
    expect(arac('Duruş ve mesai').getAttribute('aria-checked')).toBe('false');
    arac('Ayarlar');
    // Tüm planın yönü de bu menüdedir (3335-2); açıklaması küçük yazıdadır.
    const adi = (x: Element): string => (x.textContent ?? '').slice(0, (x.textContent ?? '').length - (x.querySelector('small')?.textContent?.length ?? 0));
    expect([...screen.getByRole('menu', { name: 'Araçlar' }).querySelectorAll('button')].map(adi)).toEqual(['Önce / sonra', 'Duruş ve mesai', 'Tüm plan: İleriye', 'Tüm plan: Teslimden geriye', 'Ayarlar']);
    // Sorun turu şimdilik kapalıdır: üst şeritte düğmesi yoktur.
    expect(screen.queryByRole('button', { name: 'Sorunları sırayla çöz' })).toBeNull();
    fireEvent.click(arac('Duruş ve mesai'));
    expect(screen.queryByRole('menu', { name: 'Araçlar' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Araçlar' }).hasAttribute('data-etkin')).toBe(true);
    expect(arac('Duruş ve mesai').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(arac('Ayarlar'));
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Plan ayarları' })).toBeTruthy();
    fireEvent.click(arac('Duruş ve mesai'));
    expect(screen.getByRole('complementary', { name: 'Duruş ve mesai' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duruş ve mesaiyi kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Duruş ve mesai' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Araçlar' }).hasAttribute('data-etkin')).toBe(false);
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
  });

  it('Tüm planın yönü Araçlar menüsündedir (3335-2): iki yön açıklamasıyla durur; geçerli yön bir şey açmaz, öteki yön yalnız yön panelini açar', () => {
    ac({ yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']) });
    expect(screen.queryByRole('button', { name: /Tüm plan:/ })).toBeNull();
    const yon = screen.getByRole('button', { name: 'Araçlar' });
    fireEvent.click(yon);
    const menu = screen.getByRole('menu', { name: 'Araçlar' });
    const l = within(menu).getAllByRole('menuitemradio');
    expect(l.map((x) => x.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(l[1]!.textContent).toContain('iş termine yetişecek en geç saatte başlar');
    fireEvent.click(l[0]!);
    expect(screen.queryByRole('menu', { name: 'Araçlar' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    fireEvent.click(yon);
    fireEvent.click(within(screen.getByRole('menu', { name: 'Araçlar' })).getAllByRole('menuitemradio')[1]!);
    expect(screen.queryByRole('menu', { name: 'Araçlar' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Tüm planın yönü' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
  });

  // 3282 1b: Ayarlar paneli seçili emrin yerinde açılır; panel açıkken sayfanın birincili üst düğme değildir. Onay sayfası açılınca üst çubuk yoktur.
  it('Ayarlar paneli seçimi kaldırıp açılır, düğme basılı görünür; onay sayfası açılınca üst çubuk ve Ayarlar yoktur', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const c = ornekCalisma();
    const { sec } = ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer }, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al']) });
    const ust = (): HTMLElement => screen.getByRole('button', { name: /^Canlıya al/ });
    expect(ust().className).toContain('tc-dugme-birincil');
    fireEvent.click(arac('Ayarlar'));
    expect(arac('Ayarlar').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sec).toHaveBeenCalledWith({ siparis: null, adim: null });
    expect(screen.getByRole('complementary', { name: 'Plan ayarları' })).toBeTruthy();
    expect(ust().className).not.toContain('tc-dugme-birincil');
    fireEvent.click(screen.getByRole('button', { name: 'Ayarları kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
    fireEvent.click(ust());
    expect(await screen.findByText(/O zamana kadar atölye eski planı görür/, {}, { timeout: 5000 })).toBeTruthy();
    expect(document.querySelector('.tc-pyq-ust')).toBeNull();
  });

  // 3330: vurgu ve okun çizilmediği durumlar. Hiç adımı planda olmayan kart tahtayı soldurmaz (yer aranırken dolu yerler olduğu gibi görünür);
  // Ay ve Yıl ölçeğinde (yük hücreleri) ok yoktur; seçim başka yerden (arama, liste) gelince de sipariş yanar.
  it('plansız kart tahtayı soldurmaz ve ok çizmez; uzak ölçekte ok yoktur; dışarıdan seçilen sipariş yanar (3330)', () => {
    const c = ornekCalisma();
    const plansiz = { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
    // Sahadan okunan emir durumu boş: planda işi olmayan emir bitmiş sayılmaz, plansız görünür.
    ac({ calisma: plansiz, depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu });
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

// Kart 3335 a, 2. dilim: "Planla" menüsü. Yer verme var olan plana alma yolunu kullanır; toplu ve yeniden planlama taslağa
// "yeniden-planla" komutu yazar (dizme onu izler, Geri ikisini birlikte alır). Veriler uydurmadır.
describe('Kokpit Planla menüsü (3335-2)', () => {
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
    const d = await screen.findByRole('button', { name: 'Planla' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); }, { timeout: 4000 });
    if (d.getAttribute('aria-expanded') !== 'true') fireEvent.click(d);
    return screen.getByRole('menu', { name: 'Planla' });
  };
  const satir = (m: HTMLElement, ad: RegExp): HTMLButtonElement => within(m).getByRole('menuitem', { name: ad }) as HTMLButtonElement;
  const birPlansiz = (): ReturnType<typeof ornekCalisma> => {
    const c = ornekCalisma();
    return { ...c, plan: { ...c.plan, ops: Object.fromEntries(Object.entries((c.plan as unknown as { ops: Record<string, { job: string }> }).ops).filter(([, r]) => r.job !== '2')) } } as typeof c;
  };
  const SAHA = { depo: { ...DEPO, durum: { emirler: [] } } as unknown as PlanlamaDeposu };

  it('toplu ve yeniden planlama taslağa yeniden-planla komutu yazar: plansızların hepsi, seçili sipariş, bütün plan', async () => {
    const komutlar = kur(birPlansiz(), SAHA);
    let m = await menu();
    const hepsi = satir(m, /Plansızların hepsini planla \(\d+\)/);
    expect(hepsi.disabled).toBe(false);
    fireEvent.click(hepsi);
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    // İstek yalnız plansız emirleri taşır; sayı düğmedeki sayıdır.
    const isler = komutlar[0]?.['isler'] as string[];
    expect(komutlar[0]?.tur).toBe('yeniden-planla');
    expect(isler).toContain('2');
    expect(isler).not.toContain('3');
    expect(hepsi.textContent).toContain(`(${String(isler.length)})`);
    expect(screen.queryByRole('menu', { name: 'Planla' })).toBeNull();
    // Planlı kart seçilince yer verme pasiftir ve nedenini yazar; yeniden planlama o kartın emirlerini verir.
    fireEvent.click(document.querySelector('[data-kart="3"]') as HTMLElement);
    m = await menu();
    const secili = within(m).getByRole('group', { name: 'Seçili siparişi planla' });
    await waitFor(() => { expect(secili.textContent).toContain('Zaten planlı; yeniden planlayın'); });
    expect((within(secili).getByRole('menuitem', { name: 'İleriye' }) as HTMLButtonElement).disabled).toBe(true);
    // Risk K1: dizme plansız emirlere de yer bulur; satır bunu açıkça yazar.
    expect(satir(m, /Seçili siparişi yeniden planla/).textContent).toMatch(/Plansız \d+ emre de yer verilir\./);
    fireEvent.click(satir(m, /Seçili siparişi yeniden planla/));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['3'] }); });
    fireEvent.click(satir(await menu(), /Bütün planı baştan kur/));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['*'] }); });
    expect(komutlar).toHaveLength(3);
  });

  it('seçili plansız siparişte yön satırın içinde seçilir: İleriye plana alır, Teslimden geriye onay sorar; plan yokken yeniden dizme pasiftir', async () => {
    const taban = ornekCalisma();
    const komutlar = kur({ ...taban, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    let m = await menu();
    const secili = (): HTMLElement => within(m).getByRole('group', { name: 'Seçili siparişi planla' });
    await waitFor(() => { expect(secili().textContent).toContain('yönü seçin'); }, { timeout: 4000 });
    expect(satir(m, /Bütün planı baştan kur/).disabled).toBe(true);
    expect(satir(m, /Bütün planı baştan kur/).textContent).toContain('Henüz plan yok');
    // Üç adım ve taslak cümlesi şeridin altında bir kez yazar.
    const akis = document.querySelector('[data-akis]') as HTMLElement;
    expect(within(akis).getByRole('list', { name: 'Plan adımları' }).textContent).toBe('1 Planla2 Kontrol et3 Canlıya al');
    expect(akis.textContent).toContain('atölyenin gördüğü plan yalnız Canlıya al ile değişir');
    expect(satir(m, /Plansızların hepsini planla/).disabled).toBe(true);
    expect(satir(m, /İşaretli adımları planla \(0\)/).disabled).toBe(true);
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
    await waitFor(() => { expect(satir(m, /Seçili siparişi yeniden planla/).disabled).toBe(false); });
    fireEvent.click(satir(m, /Seçili siparişi yeniden planla/));
    await waitFor(() => { expect(komutlar.at(-1)).toEqual({ tur: 'yeniden-planla', isler: ['3'] }); });
  });

  // Test T2: istek numarasıyla bir kez işlenir; başka karta gidip dönünce aynı istek yeniden yazılmaz.
  it('menü isteği bir kez işlenir: kart değişip geri gelince plana alma ikinci kez gitmez', async () => {
    const taban = ornekCalisma();
    const komutlar = kur({ ...taban, plan: null, bekleyen: [] } as unknown as ReturnType<typeof ornekCalisma>);
    const m = await menu();
    const ileri = within(within(m).getByRole('group', { name: 'Seçili siparişi planla' })).getByRole('menuitem', { name: 'İleriye' }) as HTMLButtonElement;
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
    const grup = within(m).getByRole('group', { name: 'Seçili siparişi planla' });
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
    expect(satir(m, /İşaretli adımları planla \(0\)/).textContent).toContain('İşaretli adım yok');
    const kutu = (await screen.findAllByRole('combobox', { name: /tezgâhı$/ }))[0] as HTMLSelectElement;
    const secenek = [...kutu.options].find((o2) => o2.value !== '' && o2.value !== kutu.value)!;
    fireEvent.change(kutu, { target: { value: secenek.value } });
    m = await menu();
    await waitFor(() => { expect(satir(m, /İşaretli adımları planla \(1\)/).disabled).toBe(false); }, { timeout: 4000 });
    fireEvent.click(satir(m, /İşaretli adımları planla \(1\)/));
    await waitFor(() => { expect(komutlar).toHaveLength(1); });
    expect(komutlar[0]).toMatchObject({ tur: 'plana-al', tezgah: secenek.value });
  });
});
