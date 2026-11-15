import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { otomatikUygulaIste, otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { planKurSifirla } from '../motor/coz.ts';
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
function ac(oz: Partial<PlanlamaEkranOzellikleri> = {}, yaz = true) {
  const sec = vi.fn();
  render(
    <MemoryRouter><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={yaz ? komutKur(0) : null} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={sec} {...oz}
      />
    </BildirimSaglayici></MemoryRouter>,
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

  it('seçili emrin ayrıntısı adımları ve yerlerini gösterir; kapatmak seçimi kaldırır', () => {
    const { sec } = ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    const ayr = screen.getByRole('complementary', { name: /ayrıntısı/ });
    expect(within(ayr).getByRole('button', { name: /1\. / }).getAttribute('aria-current')).toBe('true');
    expect(within(ayr).getByText('Başlamış iş taşınmaz')).toBeTruthy();
    fireEvent.click(within(ayr).getByRole('button', { name: 'Ayrıntıyı kapat' }));
    expect(sec).toHaveBeenCalledWith({ siparis: null, adim: null });
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

  it('Matriste seçili emrin ayrıntısı aynı ekranda açılır; çözüm adımlardan önce gelir', () => {
    ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Matris' }));
    const ayr = screen.getByRole('complementary', { name: /ayrıntısı/ });
    expect(within(ayr).getAllByRole('heading', { level: 3 }).map((x) => x.textContent)).toEqual([expect.stringContaining('tezgâh seçenekleri'), 'Adımlar', 'Planlama yönü']);
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

  // Risk 3282 1d-3 N1: tek düğme ortak plana yazar; Onay ve canlı bunu kalıcı söyler, canlı değişince ya da bölüm kapanınca söylemez.
  it('taslak çubuğundan yazılınca Onay ve canlıda taslağın yazıldığı satırı durur; canlı değişince ve üst düğmeyle açılınca yoktur', async () => {
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
    expect(await screen.findByText(/Canlı plan yalnız burada onaylanınca değişir/, {}, { timeout: 5000 })).toBeTruthy();
    expect(satirVar()).toBe(true);
    rerender(sayfa(4));
    await waitFor(() => { expect(satirVar()).toBe(false); });
    fireEvent.click(screen.getByRole('button', { name: 'Planı düzenle' }));
    fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
    expect(await screen.findByText(/Canlı plan yalnız burada onaylanınca değişir/, {}, { timeout: 5000 })).toBeTruthy();
    expect(satirVar()).toBe(false);
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
    cleanup();
    ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer }, secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).className).not.toContain('tc-dugme-birincil');
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

  // 3282-4 a: canlıya alma yetkisi olana düğme Canlıya al'dır; Onay ve canlı bölümü Kokpit'te açılır, tahtaya düğmeyle dönülür.
  it('Canlıya al Onay ve canlı bölümünü Kokpit\'te açar; onay bekleyen sayısı düğmededir; Planı düzenle tahtaya döner', async () => {
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
    expect(await screen.findByText(/Canlı plan yalnız burada onaylanınca değişir/, {}, { timeout: 5000 })).toBeTruthy();
    expect(document.querySelector('.tc-pyq-tahta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Planı düzenle' }));
    expect(document.querySelector('.tc-pyq-tahta')).not.toBeNull();
  });

  it('Stüdyo\'dan "Kokpit\'te aç" ile gelinince Onay ve canlı açık başlar; istek bir kez alınır', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    onayAcIste();
    ac();
    expect(await screen.findByText(/Canlı plan yalnız burada onaylanınca değişir/, {}, { timeout: 5000 })).toBeTruthy();
    cleanup();
    ac();
    expect(document.querySelector('.tc-pyq-tahta')).not.toBeNull();
  });

  it('Gelenler: saha olayları emir Kokpit\'teyse Göster ile emri seçer; emri olmayan olayda düğme yok; liste kapanır', () => {
    const bayat = { bayat: true, sonCanliyaAlma: '2026-10-20T06:00:00Z', olaylar: [
      { neden: 'durus', zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'ORN-T01' },
      { neden: 'satin-alma-termini', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 3, emirNo: '3', makineId: null, makineKod: null },
    ] };
    vi.stubGlobal('CSS', { escape: (x: string) => x });
    const { sec } = ac({ depo: { ...DEPO, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat } } as unknown as PlanlamaDeposu });
    const kutu = screen.getByRole('region', { name: 'Gelenler' });
    const satirlar = within(kutu).getAllByRole('listitem');
    expect(satirlar.map((x) => x.textContent)).toEqual([expect.stringContaining('ORN-T01'), expect.stringContaining('Satın alma termini')]);
    expect(within(satirlar[0]!).queryByRole('button')).toBeNull();
    expect(satirlar[0]!.textContent).toContain('Arıza / bakım');
    fireEvent.click(within(kutu).getByRole('button', { name: 'Göster' }));
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: null });
    fireEvent.click(within(kutu).getByRole('button', { name: /Gelenler/ }));
    expect(within(kutu).queryAllByRole('listitem')).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  // 3282 2a-1: Kapasite üst şeritten açılır (düğme basılı görünür) ve seçimi kaldırır; Ayarlar açılınca kapanır.
  it('Kapasite üst şeritteki düğmeyle açılır ve kapanır; Ayarlar onu kapatır', () => {
    ac();
    const dugme = screen.getByTitle('Tezgâhın arıza ve bakım duruşları');
    expect(dugme.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dugme);
    expect(screen.getByRole('complementary', { name: 'Duruşlar' })).toBeTruthy();
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTitle('Plan ayarları'));
    expect(screen.queryByRole('complementary', { name: 'Duruşlar' })).toBeNull();
    expect(dugme.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dugme);
    expect(screen.getByRole('complementary', { name: 'Duruşlar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duruşları kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Duruşlar' })).toBeNull();
  });

  // 3282 1b: Ayarlar paneli seçili emrin yerinde açılır; panel ve Onay ve canlı açıkken sayfanın birincili üst düğme değildir.
  it('Ayarlar paneli seçimi kaldırıp açılır, düğme basılı görünür; Onay ve canlı açıkken üst düğme ikincildir ve Ayarlar kapalıdır', async () => {
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const c = ornekCalisma();
    const { sec } = ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer }, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al']) });
    const ust = (): HTMLElement => screen.getByRole('button', { name: /^Canlıya al/ });
    expect(ust().className).toContain('tc-dugme-birincil');
    const ayar = screen.getByRole('button', { name: 'Ayarlar' });
    fireEvent.click(ayar);
    expect(ayar.getAttribute('aria-pressed')).toBe('true');
    expect(sec).toHaveBeenCalledWith({ siparis: null, adim: null });
    expect(screen.getByRole('complementary', { name: 'Plan ayarları' })).toBeTruthy();
    expect(ust().className).not.toContain('tc-dugme-birincil');
    fireEvent.click(screen.getByRole('button', { name: 'Ayarları kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Plan ayarları' })).toBeNull();
    fireEvent.click(ust());
    expect(await screen.findByText(/Canlı plan yalnız burada onaylanınca değişir/, {}, { timeout: 5000 })).toBeTruthy();
    expect(ust().className).not.toContain('tc-dugme-birincil');
    expect(screen.getByTitle('Plan ayarları').hasAttribute('disabled')).toBe(true);
  });

  it('çalışma yokken boş durum gösterir', () => {
    ac({ calisma: null });
    expect(screen.getByText(/Henüz plan yok/)).toBeTruthy();
  });
});
