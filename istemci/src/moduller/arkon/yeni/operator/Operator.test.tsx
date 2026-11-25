import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NumunePenceresi } from './Pencereler.tsx';
import { vardiyaOzetiAcilabilirMi, vardiyaOzetiniAc } from './vardiya-ozeti-istegi.ts';
import type * as KartDegistir from '../../../../ortak/veri/kart-degistir.ts';
import { arkonAc, OPERATOR, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// Üretim Terminali: açılışta yazma yok; üretim yetkisi olan başlatır; yetkisi olmayan yalnız görür; önizleme hiç yazmaz.
// Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); kartDinleyicileri.length = 0; });

// 3392 a madde 7: kişi kartı kabukta okunur; testte okutma dinleyicilere doğrudan bildirilir.
const kartDinleyicileri: ((k: { id: number }) => void)[] = [];
vi.mock('../../../../ortak/veri/kart-degistir.ts', async (asil) => ({
  ...(await asil<typeof KartDegistir>()),
  kartOkununca: (f: (k: { id: number }) => void) => { kartDinleyicileri.push(f); return () => { kartDinleyicileri.splice(kartDinleyicileri.indexOf(f), 1); }; },
}));
const kisiKartiOkut = (id: number) => { act(() => { for (const f of [...kartDinleyicileri]) f({ id }); }); };

const ISTASYONLU: Deneme = { ...OPERATOR, istasyon: 'IST-1' };
const PAKET = {
  id: 'pk-deneme-1', no: 'IE-DENEME-1', opType: 'cnc', st: {}, partNo: 'DN-1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: '',
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const sunucu = (ek: { kimlik: string; surum: number; govde: unknown }[] = []) => ({
  belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...ek] },
});
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const olaylar = (l: Istek[]) => l.filter((i) => i.yol === '/arkon/kayitlar/events/ekle').flatMap((i) => (i.govde as { satirlar?: { state?: string; orderNo?: string }[] }).satirlar ?? []);
const sonuclar = (l: Istek[]) => l.filter((i) => i.yol === `/arkon/belgeler/results/${PAKET.id}/yaz`).map((i) => (i.govde as { govde: { state?: string } }).govde);
const ekran = async () => screen.findByRole('region', { name: 'Aktif iş emri' }, { timeout: 10000 });

describe('A1 Üretim Terminali', () => {
  it('açılışta yazmaz; istasyonun yayınlı işi açılır; başlatma durum kaydı yazar', async () => {
    const istekler = sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    // Bağlantı durumu üst çubukta saatin yanında (soru 488 a); testte cihaz kişiseldir (ortak kaydı yok), bağlı yazar.
    expect(screen.getByRole('status', { name: /Sunucuya bağlı/ }).closest('.tc-ay1-ust')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running' && e.orderNo === 'IE-DENEME-1')).toBe(true); }, { timeout: 10000 });
    await waitFor(() => { expect(sonuclar(istekler).some((r) => r.state === 'running')).toBe(true); }, { timeout: 10000 });
  }, 40000);

  it('3158/3167: yeniden yazılan sayım adedi ekrana döner, yeni kayıt yazmaz; bekleyen işlemin reddi ayrı bildirim olmaz, özet bildirimle söylenir', async () => {
    const istekler = sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    const sayimlar = () => istekler.filter((i) => i.yol === '/arkon/kayitlar/counts/ekle').flatMap((i) => (i.govde as { satirlar?: unknown[] }).satirlar ?? []);
    const sayi = () => document.querySelector('.tc-ay1-kadran-sayi')?.textContent;
    fireEvent.click(screen.getAllByRole('button', { name: /İyi \+1/ })[0]!);
    await waitFor(() => { expect(sayimlar()).toHaveLength(1); }, { timeout: 10000 });
    expect(sayi()).toBe('1');
    const satir = (delta: number) => ({ kind: 'good', delta, orderNo: PAKET.no, pkgId: PAKET.id });

    window.dispatchEvent(new CustomEvent('arkon-sayim-yeniden-yazildi', { detail: { kind: 'counts', cid: 'orn-1', row: satir(3) } }));
    await waitFor(() => { expect(sayi()).toBe('4'); });
    window.dispatchEvent(new CustomEvent('arkon-rejected', { detail: { kind: 'counts', cid: 'orn-2', row: satir(2), msg: 'ORN ret', bekledi: true } }));
    await waitFor(() => { expect(sayi()).toBe('2'); });
    await new Promise((r) => setTimeout(r, 700));
    expect(sayimlar(), 'ekrana dönen ve geri alınan adet yeni kayıt yazmaz').toHaveLength(1);
    expect(screen.queryByText(/Sayım işlenmedi/)).toBeNull();

    window.dispatchEvent(new CustomEvent('arkon-kuyruk-bitti', { detail: { kesin: 1, karar: 1 } }));
    expect(await screen.findByText('1 işlem kesinleşti, 1 işlem karar bekliyor')).toBeTruthy();
    // İşin son hâli belgeye yazılmadan test bitmesin: gecikmeli yazım sonraki testin isteklerine düşer.
    await waitFor(() => { expect(sonuclar(istekler).some((r) => (r as { good?: number }).good === 2)).toBe(true); }, { timeout: 10000 });
  }, 40000);

  it('üretim yetkisi olmayan kişi yalnız görür: sayım ve durum düğmeleri yok, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(ISTASYONLU, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { operator: ['page.op'] } } }]));
    arkonAc('/uretim-terminali');
    await ekran();
    expect(await screen.findByText('Bu rol üretim kaydı yapamaz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Başlat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /İyi \+1/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Toplu giriş' })).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('okutma penceresi kamerayı kendiliğinden açar (283.5); dokunmatikte kod alanı odak almaz (492/1 a)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    try {
      // Ayrı kimlik: önceki testlerin yerel kopyasındaki CNC paketi yerine geçmesin.
      const depo = { ...PAKET, id: 'pk-deneme-depo', no: 'IE-DENEME-2', opType: 'depo', st: { items: [{ id: 'k1', code: 'DN-K1', name: 'Deneme kalem', qty: 2, loc: 'R-1', unit: 'adet' }] } };
      sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: depo.id, surum: 1, govde: depo }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
      arkonAc('/uretim-terminali');
      await ekran();
      fireEvent.click(await screen.findByRole('button', { name: /QR/ }, { timeout: 10000 }));
      expect(await screen.findByRole('dialog', { name: 'Ürün kodunu okut' })).toBeTruthy();
      await waitFor(() => { expect(getUserMedia).toHaveBeenCalled(); });
      // Pencere açılınca odağı ilk odaklanabilir öğeye (kamera düğmesi) verir; kod alanı dokunmatikte odak almaz, ekran klavyesi açılmaz.
      expect(document.activeElement).not.toBe(within(screen.getByRole('dialog', { name: 'Ürün kodunu okut' })).getByRole('textbox', { name: 'Kod' }));
    } finally {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  }, 40000);

  it('teknik resim sekmesi resmi açar (yer tutucu yok); paketsiz dosyada "Doküman yok"', async () => {
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    expect(await screen.findByRole('toolbar', { name: 'Teknik resim araçları' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getAllByText('Doküman yok').length).toBeGreaterThan(0);
    expect(screen.queryByText('Bu bölüm hazırlanıyor')).toBeNull();
  }, 40000);

  it('önizleme paketi kimliğiyle açar, yazma düğmesi göstermez ve yazmaz', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc(`/arkon/onizle/${PAKET.id}`);
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Başlat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çağrı' })).toBeNull();
    expect(screen.queryByText('Bu rol üretim kaydı yapamaz')).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('3338-6 a: Sıradaki işler şeridi başka işe yalnız bakar; resim ve adımlar önizlenir; geçiş "Bu işe geç" ile, yazma yok', async () => {
    const ikinci = { ...PAKET, id: 'pk-deneme-cark', no: 'IE-DENEME-3', part: 'Deneme ikinci parça' };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }, { kimlik: ikinci.id, surum: 1, govde: ikinci }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    arkonAc('/uretim-terminali');
    const serit = await screen.findByRole('region', { name: 'Sıradaki işler' }, { timeout: 10000 });
    expect(screen.queryByRole('region', { name: 'İş ve makine çarkı' })).toBeNull();
    expect(within(serit).getByRole('button', { name: /· ekranda$/ }).getAttribute('aria-pressed')).toBe('true');
    const ilk = within(screen.getByRole('region', { name: 'Aktif iş emri' })).getByRole('heading').textContent;
    const oteki = () => within(serit).getAllByRole('button', { pressed: false }).find((x) => /^IE-DENEME-(1|3)$/.test(x.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(oteki());
    expect(within(serit).getByText(/Önizleme · ekrandaki iş değişmez/)).toBeTruthy();
    expect(screen.getByText(/Önizleme · IE-DENEME-(1|3) · teknik resim ve adımlar salt okunur/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Aktif iş emri' })).getByRole('heading').textContent).toBe(ilk);
    fireEvent.click(within(serit).getByRole('button', { name: 'Ekrandakine dön' }));
    expect(screen.queryByText(/teknik resim ve adımlar salt okunur/)).toBeNull();
    fireEvent.click(oteki());
    fireEvent.click(within(serit).getByRole('button', { name: 'Bu işe geç' }));
    const yeni = await screen.findByRole('region', { name: 'Aktif iş emri' });
    expect(within(yeni).getByRole('heading').textContent).not.toBe(ilk);
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('2125: makine seçimi ekrandaki işindir; başka işe geçince bırakılır, yeni işin başlatması seçimsiz gider', async () => {
    const ikinci = { ...PAKET, id: 'pk-deneme-secim', no: 'IE-DENEME-4', part: 'Deneme dördüncü parça' };
    const tesis = { ...TESIS, mcs: [{ id: 'MK-1', name: 'Deneme makine 1', st: 'IST-1' }, { id: 'MK-2', name: 'Deneme makine 2', st: 'IST-1' }] };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }, { kimlik: ikinci.id, surum: 1, govde: ikinci }], kv: [{ kimlik: 'plant', surum: 2, govde: { v: tesis } }] } });
    arkonAc('/uretim-terminali');
    // 3338-6 a: makine üst çubuktaki kutudan seçilir; kural makine seçicininkidir.
    const makineler = async () => { fireEvent.click(await screen.findByTitle('Makine · dokununca seçilir', undefined, { timeout: 10000 })); return screen.findByRole('dialog', { name: 'İstasyon ve makine' }); };
    const serit = await screen.findByRole('region', { name: 'Sıradaki işler' }, { timeout: 10000 });
    await waitFor(() => { expect(within(serit).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2); }, { timeout: 10000 });
    let p = await makineler();
    fireEvent.click(within(p).getAllByRole('button', { name: 'Bu makinede çalış' })[0]!);
    expect(within(p).getAllByText('1 makine seçili').length).toBeGreaterThan(0);
    fireEvent.click(within(p).getByRole('button', { name: /Kapat/ }));
    fireEvent.click(within(serit).getAllByRole('button', { pressed: false })[0]!);
    fireEvent.click(within(serit).getByRole('button', { name: 'Bu işe geç' }));
    p = await makineler();
    await waitFor(() => { expect(within(p).queryByText('1 makine seçili')).toBeNull(); });
    expect(within(p).getAllByRole('button', { name: 'Bu makinede çalış' }).length).toBe(2);
    fireEvent.click(within(p).getByRole('button', { name: /Kapat/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    const baslatma = olaylar(istekler).find((e) => e.state === 'running') as { mcs?: unknown } | undefined;
    expect(baslatma?.mcs).toBeUndefined();
    // Durum belgesi gecikmeli yazılır; beklenmezse ekran kapanırken gider ve sıradaki testin sahte sunucusuna düşer.
    await waitFor(() => { expect(sonuclar(istekler).some((r) => r.state === 'running')).toBe(true); }, { timeout: 10000 });
  }, 40000);


  // 3298: üst şerit sade; tema kabuğun Hesap menüsünde, öteki Arkon sayfaları ana menüde, Vardiya özeti Hesap menüsündedir.
  it.each([['geniş ekranda', false], ['telefonda', true]] as const)('3298: %s üst şeritte Tema, Menü ve vardiya kişi düğmesi yok', async (_ad, dar) => {
    if (dar) {
      Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
    }
    try {
      sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, sunucu());
      arkonAc('/uretim-terminali');
      expect((await screen.findAllByRole('button', { name: 'İş kartı okut' }, { timeout: 10000 })).length).toBeGreaterThan(0);
      for (const ad of ['Tema değiştir', 'Menü', 'Vardiya özeti ve devir']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Kartı okut' })).toBeNull();
    } finally {
      Reflect.deleteProperty(window, 'innerWidth'); Reflect.deleteProperty(window, 'innerHeight');
    }
  }, 40000);

  it('3298: Hesap menüsünün isteği görünür terminalde Vardiya özeti penceresini açar; terminal yokken madde açılamaz', async () => {
    expect(vardiyaOzetiAcilabilirMi()).toBe(false);
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    await waitFor(() => { expect(vardiyaOzetiAcilabilirMi()).toBe(true); });
    act(() => { vardiyaOzetiniAc(); });
    expect(await screen.findByRole('dialog', { name: /Vardiya/ }, { timeout: 10000 })).toBeTruthy();
    cleanup();
    expect(vardiyaOzetiAcilabilirMi()).toBe(false);
  }, 40000);

  // 2001 b: istasyonu belli olmayan operatörde üst şerit listedeki ilk istasyonu seçilmiş gibi göstermiyordu; seçici "atanmış istasyon
  // yok" derken üstte başka istasyon yazıyordu.
  // 3392 a: cihaz makineye bağlıysa operatör makine seçmez; plan başka makinedeyse başlatmada tek dokunuşluk onay, iş cihazın makinesine yazılır.
  it('3392 a: makineye bağlı cihazda seçim yok; plan farkında "Burada başlat" cihazın makinesiyle başlatır', async () => {
    const tesis = { ...TESIS, mcs: [{ id: 'MK-1', name: 'Deneme makine 1', st: 'IST-1' }, { id: 'MK-2', name: 'Deneme makine 2', st: 'IST-1' }] };
    const planli = { ...PAKET, id: 'pk-deneme-plan', no: 'IE-DENEME-PLAN', mc: 'MK-1' };
    window.localStorage.setItem('arkon:station', JSON.stringify('IST-1'));
    window.localStorage.setItem('arkon:machine', JSON.stringify('MK-2'));
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: planli.id, surum: 1, govde: planli }], kv: [{ kimlik: 'plant', surum: 3, govde: { v: tesis } }] } });
    arkonAc('/uretim-terminali');
    await ekran();
    expect(await screen.findByText('Makine · bu cihaz', undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByTitle('Makine · dokununca seçilir')).toBeNull();
    expect(screen.queryByTitle('İstasyon · dokununca değişir')).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    const p = await screen.findByRole('dialog', { name: 'Plan başka makinede' });
    expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(false);
    fireEvent.click(within(p).getByRole('button', { name: /Burada başlat · MK-2/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    expect((olaylar(istekler).find((e) => e.state === 'running') as { mcs?: unknown } | undefined)?.mcs).toEqual(['MK-2']);
    const planSonucu = () => istekler.filter((i) => i.yol === `/arkon/belgeler/results/${planli.id}/yaz`).map((i) => (i.govde as { govde: { state?: string } }).govde);
    await waitFor(() => { expect(planSonucu().some((r) => r.state === 'running')).toBe(true); }, { timeout: 10000 });
  }, 40000);

  it('2001 b: istasyonu olmayan operatörde üst şerit "İstasyon seçilmedi" yazar ve seçici açılır (reddedilen)', async () => {
    const istekler = sunucuKur(OPERATOR, sunucu());
    arkonAc('/uretim-terminali');
    expect(await screen.findByRole('dialog', { name: 'Hangi istasyonda?' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText('Size atanmış istasyon yok')).toBeTruthy();
    const ust = document.querySelector('.tc-ay1-ust');
    expect(ust && within(ust as HTMLElement).getByText('İstasyon seçilmedi')).toBeTruthy();
    expect(ust && within(ust as HTMLElement).queryByText('IST-1')).toBeNull();
    expect(window.localStorage.getItem('arkon:station')).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('3392: istasyonu olmayan cihazda bağlama yetkilisine ilk açılışta yer penceresi açılır, eski seçici açılmaz', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/uretim-terminali');
    const p = await screen.findByRole('dialog', { name: 'Bu cihazı yere bağla' }, { timeout: 10000 });
    expect(within(p).getByRole('radiogroup', { name: 'İstasyon' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Hangi istasyonda?' })).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('2001 b: yetkili istasyonu olan operatör onunla açılır, seçici açılmaz', async () => {
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    const ust = document.querySelector('.tc-ay1-ust') as HTMLElement;
    expect(within(ust).getByText('IST-1')).toBeTruthy();
    expect(within(ust).queryByText('İstasyon seçilmedi')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Hangi istasyonda?' })).toBeNull();
  }, 40000);

  // 3568: talaşlı istasyonda kullanılmış cihazda depo operatörü kendi istasyonunda ve depo sekmeleriyle açılır; kayıt düzelir.
  const IKI_YER = {
    wcs: [{ id: 'ORN-TAL', name: 'ORN talaşlı' }, { id: 'ORN-DEP', name: 'ORN depo' }],
    sts: [{ id: 'ORN-TAL-1', name: 'ORN tezgah', wc: 'ORN-TAL', t: 'cnc' }, { id: 'ORN-DEPO-1', name: 'ORN depo yeri', wc: 'ORN-DEP', t: 'depo' }], mcs: [],
  };
  const ikiYer = () => ({ belgeler: { pkgs: [], kv: [{ kimlik: 'plant', surum: 3568, govde: { v: IKI_YER } }] } });

  it('3568: cihazda başka istasyon kayıtlıyken depo operatörü kendi istasyonunda ve depo sekmeleriyle açılır, kayıt güncellenir', async () => {
    // Depo sekmeleri stok.giris ya da stok.cikis olana görünür (3388 a).
    const depocu = { ...OPERATOR, istasyon: 'ORN-DEPO-1', kullanici: { ...OPERATOR.kullanici, islemler: [...OPERATOR.kullanici.islemler, 'stok.giris', 'stok.cikis'] } } as Deneme;
    sunucuKur(depocu, ikiYer());
    window.localStorage.setItem('arkon:station', JSON.stringify('ORN-TAL-1'));
    arkonAc('/uretim-terminali');
    expect(await screen.findByRole('tab', { name: /Toplama listesi/ }, { timeout: 10000 })).toBeTruthy();
    const ust = document.querySelector('.tc-ay1-ust') as HTMLElement;
    expect(within(ust).getByText('ORN-DEPO-1')).toBeTruthy();
    expect(within(ust).queryByText('ORN-TAL-1')).toBeNull();
    expect(screen.getByRole('tab', { name: /Mal kabul/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Yükle/ })).toBeTruthy();
    await waitFor(() => { expect(JSON.parse(window.localStorage.getItem('arkon:station') ?? 'null')).toBe('ORN-DEPO-1'); });
  }, 40000);

  it('3568: istasyon yönetimi olan kişide cihaz kaydı bugünkü gibi önce gelir, kayıt değişmez', async () => {
    sunucuKur({ ...YONETICI, istasyon: 'ORN-DEPO-1' }, ikiYer());
    window.localStorage.setItem('arkon:station', JSON.stringify('ORN-TAL-1'));
    arkonAc('/uretim-terminali');
    await ekran();
    const ust = document.querySelector('.tc-ay1-ust') as HTMLElement;
    expect(within(ust).getByText('ORN-TAL-1')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Toplama listesi/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(JSON.parse(window.localStorage.getItem('arkon:station') ?? 'null')).toBe('ORN-TAL-1');
  }, 40000);
});

describe('A1 Üretim Terminali telefonda (618, 615-1 b)', () => {
  const telefon = () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
  };
  afterEach(() => { Reflect.deleteProperty(window, 'innerWidth'); Reflect.deleteProperty(window, 'innerHeight'); });

  it('operatör işle açılır (Özetim değil); alt eylem çubuğundaki Başlat durum kaydı yazar, sonra Durdur ve Duraklat çıkar', async () => {
    telefon();
    const istekler = sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    const cubuk = await screen.findByRole('group', { name: 'İş eylemleri' }, { timeout: 10000 });
    expect(screen.getByRole('button', { name: /Aktif iş/ })).toBeTruthy();
    expect(within(cubuk).getByRole('button', { name: /İyi \+1/ })).toBeTruthy();
    expect(within(cubuk).getByRole('button', { name: /Hurda \+1/ })).toBeTruthy();
    expect(within(cubuk).queryByRole('button', { name: /Bitir/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(within(cubuk).getByRole('button', { name: /İşi Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running' && e.orderNo === 'IE-DENEME-1')).toBe(true); }, { timeout: 10000 });
    const sonra = screen.getByRole('group', { name: 'İş eylemleri' });
    expect(within(sonra).getByRole('button', { name: /Durdur/ })).toBeTruthy();
    expect(within(sonra).getByRole('button', { name: /Duraklat/ })).toBeTruthy();
    // Durdur dokunuşla duruş nedenini sorar; nedensiz durdurmaz.
    fireEvent.click(within(sonra).getByRole('button', { name: /Durdur/ }));
    expect(await screen.findByRole('dialog', { name: 'Neden durdu?' })).toBeTruthy();
    expect(olaylar(istekler).some((e) => e.state === 'stopped')).toBe(false);
    // Nedene tek dokunuş kaydeder; ayrı kaydet düğmesi yok (696).
    expect(within(screen.getByRole('dialog', { name: 'Neden durdu?' })).queryByRole('button', { name: /Duruşu kaydet/ })).toBeNull();
  }, 40000);

  it('3392 a: istasyon yönetimi olan kişi cihazı üst çubuktaki kutudan iki adımda bağlar; bağ cihazın istasyonunu yazar; çark yok', async () => {
    const ikiIstasyon = { ...TESIS, sts: [...TESIS.sts, { id: 'IST-2', name: 'Deneme ikinci tezgah', wc: 'TAL', t: 'cnc' }] };
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 7, govde: { v: ikiIstasyon } }] } });
    window.localStorage.setItem('arkon:station', JSON.stringify('IST-1'));
    arkonAc('/uretim-terminali');
    fireEvent.click(await screen.findByTitle('İstasyon · dokununca değişir', undefined, { timeout: 10000 }));
    expect(screen.queryByRole('region', { name: 'İş ve makine çarkı' })).toBeNull();
    // 3392 a: istasyon yönetimi olan kişi cihazı iki adımda bağlar; makinesiz istasyonda makine adımı yoktur.
    const p = await screen.findByRole('dialog', { name: 'Bu cihazı yere bağla' });
    expect(within(p).getByRole('radio', { name: /IST-1/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(p).getByRole('radio', { name: /IST-2/ }));
    fireEvent.click(within(p).getByRole('button', { name: /Bağla/ }));
    expect(JSON.parse(window.localStorage.getItem('arkon:station') ?? 'null')).toBe('IST-2');
    await waitFor(() => { expect(screen.getAllByText('IST-2').length).toBeGreaterThan(0); }, { timeout: 10000 });
  }, 40000);

  it('793 b: yalnız kendi istasyonu olan operatörde istasyon seçilmez (reddedilen)', async () => {
    telefon();
    const ikiIstasyon = { ...TESIS, sts: [...TESIS.sts, { id: 'IST-2', name: 'Deneme ikinci tezgah', wc: 'TAL', t: 'cnc' }] };
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 7, govde: { v: ikiIstasyon } }] } });
    arkonAc('/uretim-terminali');
    await screen.findByRole('group', { name: 'İş eylemleri' }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: /İstasyonlar ·/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bu istasyona geç' })).toBeNull();
    // 3338-6 a: seçecek istasyon ya da makine yoksa istasyon kutusu düz yazıdır.
    expect(screen.queryByTitle('İstasyon ve makine · dokununca seçilir')).toBeNull();
  }, 40000);

  it('üretim yetkisi olmayan kişide eylem çubuğu yok (reddedilen)', async () => {
    telefon();
    sunucuKur(ISTASYONLU, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { operator: ['page.op'] } } }]));
    arkonAc('/uretim-terminali');
    expect(await screen.findByText('Bu rol üretim kaydı yapamaz', undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'İş eylemleri' })).toBeNull();
  }, 40000);
});

describe('A1 Kaliteye numune penceresi (A4 NumunePenceresi; 3718 a okutma)', () => {
  it('birincil yol kart okutmak; kartsız gönderme gerekçe seçilmeden kapalı, seçilince gerekçeyle gönderir', async () => {
    const gonder = vi.fn(), kapat = vi.fn(), okut = vi.fn();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: true, bekliyor: false, gonder, okut }} kapat={kapat} />);
    const pencere = await screen.findByRole('dialog', { name: 'Kaliteye numune · IST-1' }, { timeout: 10000 });
    expect(within(pencere).getByRole('status').textContent).toContain('Okuyucu hazır · refakat kartı bekleniyor');
    expect(within(pencere).queryByText(/etiketle/)).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: /Kamerayla okut/ }));
    expect(okut).toHaveBeenCalledTimes(1);
    const kartsiz = within(pencere).getByRole('button', { name: 'Kartsız gönder' });
    expect(kartsiz.hasAttribute('disabled')).toBe(true);
    fireEvent.click(kartsiz);
    expect(gonder).not.toHaveBeenCalled();
    const gerekce = within(pencere).getByRole('button', { name: 'Kart okunmuyor' });
    fireEvent.click(gerekce);
    expect(gerekce.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(kartsiz);
    expect(gonder).toHaveBeenCalledWith({ yol: 'kartsiz', gerekce: 'Kart okunmuyor' });
    expect(kapat).toHaveBeenCalled();
  });
  it('plan yoksa ya da önceki numune bekliyorsa gönderilemez (reddedilen)', async () => {
    const gonder = vi.fn(), kapat = vi.fn(), okut = vi.fn();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: false, bekliyor: false, gonder, okut }} kapat={kapat} />);
    expect((await screen.findByRole('button', { name: /Kamerayla okut/ }, { timeout: 10000 })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/kontrol planı yok/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kartsız gönder' })).toBeNull();
    cleanup();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: true, bekliyor: true, gonder, okut }} kapat={kapat} />);
    expect((await screen.findByRole('button', { name: /Kamerayla okut/ }, { timeout: 10000 })).hasAttribute('disabled')).toBe(true);
    expect(gonder).not.toHaveBeenCalled();
  });
});


// 797: "bu durumda geçen süre" sunucudaki son durum kaydından (sunucu saati) gelir; bilinmiyorsa "—" yazılır, sıfırdan sayılmaz.
describe('797 durum süresi', () => {
  const sureler = () => screen.findAllByTitle(/Bu durumda geçen süre|Süre bilinmiyor/, undefined, { timeout: 10000 });
  const birSaatOnce = () => ({ events: [{ pkgId: PAKET.id, orderNo: PAKET.no, state: 'queued', at: Date.now() - 3_600_000 }] });

  it('kayıt yoksa süre bilinmez: "—", 00:00:00 değil', async () => {
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    const [s] = await sureler();
    expect(s!.textContent).toBe('—');
    expect(s!.getAttribute('title')).toMatch(/Süre bilinmiyor/);
  }, 40000);

  it('son kayıt bugünkü durumsa süre o kayıttan sayılır', async () => {
    sunucuKur(ISTASYONLU, { ...sunucu(), kayitlar: birSaatOnce() });
    arkonAc('/uretim-terminali');
    await ekran();
    await waitFor(async () => { expect((await sureler())[0]!.textContent).toMatch(/^01:00:0\d$/); }, { timeout: 10000 });
  }, 40000);

  it('son kayıt başka durumdaysa süre bilinmez', async () => {
    sunucuKur(ISTASYONLU, { ...sunucu(), kayitlar: { events: [{ pkgId: PAKET.id, state: 'running', at: Date.now() - 3_600_000 }] } });
    arkonAc('/uretim-terminali');
    await ekran();
    await new Promise((r) => setTimeout(r, 700));
    expect((await sureler())[0]!.textContent).toBe('—');
  }, 40000);

  it('önizleme de sunucudaki kaydı okur', async () => {
    const istekler = sunucuKur(YONETICI, { ...sunucu(), kayitlar: birSaatOnce() });
    arkonAc(`/arkon/onizle/${PAKET.id}`);
    await ekran();
    await waitFor(async () => { expect((await sureler())[0]!.textContent).toMatch(/^01:00:0\d$/); }, { timeout: 10000 });
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);
});

// 807: terminalin üst çubuğunda Hazırlık ve Kalite kısayolu yok; sayfalar Arkon sekmelerinden açılır, ölçü girişi resim sekmesindedir.
describe('807 üst çubuk kısayolları', () => {
  it('yöneticide de Hazırlık ve Kalite tuşu çıkmaz', async () => {
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    expect(screen.queryByRole('button', { name: 'Üretim Terminali Hazırlık' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kalite ölçüm istasyonu' })).toBeNull();
  }, 40000);
});

// Son blok: işin yerel kopyası (çalışıyor) sonraki testin açılışında sunucuya yazılır, öteki testlerden sonra durur.
describe('A1 Üretim Terminali hatalı parça (1034)', () => {
  it('CORE işinde Hurda yerine Hatalı: neden ve adetle kalite kolu açılır, hurda sayımı yazılmaz; kadranda hatalı adedi artar (1188)', async () => {
    const tmi = { ...PAKET, id: 'tmi-ie-70', no: 'UE-DENEME-7', tmi: { emirId: 7, hatali: 1 } };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: {
      pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }],
      kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, { kimlik: 'scraps', surum: 1, govde: { v: [{ code: 'TK', l: 'Takım kırılması' }] } }],
    } });
    const asil = globalThis.fetch;
    const hatali: { govde: unknown; kimlik: string | null }[] = [];
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      if (String(adres).includes('/uretim-emirleri/7/hatali')) {
        hatali.push({ govde: JSON.parse(String(istek?.body)), kimlik: new Headers(istek?.headers).get('istek-kimligi') });
        return new Response(JSON.stringify({ kayitId: 1, hedefEmir: { id: 8, emirNo: 'UE-DENEME-7-K1' }, kolAcildi: true, uyari: null }), { status: 200 });
      }
      return asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /UE-DENEME-7/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hurda \+1/ })).toBeNull();
    expect(document.querySelector('.tc-ay1-kadran-etiket')?.textContent).toBe('Hatalı1');
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    // 3337-2 a: kartsız CORE işinde önce kart sorulur; okutulan kart başlatma kaydıyla gider.
    const kartPenceresi = await screen.findByRole('dialog', { name: 'Refakat kartını okut' });
    expect(within(kartPenceresi).queryByRole('button', { name: /Kartsız başlat/ })).toBeNull();
    fireEvent.change(within(kartPenceresi).getByLabelText(/^Kart/), { target: { value: 'RP:5' } });
    fireEvent.click(within(kartPenceresi).getByRole('button', { name: /Kartla başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    expect(olaylar(istekler).find((e) => e.state === 'running')).toMatchObject({ refakatPartisiId: 5 });
    fireEvent.click(screen.getByRole('button', { name: /^Hatalı$/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Hatalı parça' });
    fireEvent.click(within(pencere).getByRole('radio', { name: /Takım kırılması/ }));
    fireEvent.change(within(pencere).getByLabelText('Hatalı adet'), { target: { value: '2' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Kaliteye ayır/ }));
    await waitFor(() => { expect(hatali).toHaveLength(1); });
    expect(hatali[0]?.govde).toEqual({ isEmriId: 70, hurdaNedeniKodu: 'TK', adet: 2, aciklama: null });
    expect(hatali[0]?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(/2 adet kaliteye ayrıldı · kol UE-DENEME-7-K1/)).toBeTruthy();
    expect(document.querySelector('.tc-ay1-kadran-etiket')?.textContent).toBe('Hatalı3');
    await new Promise((r) => setTimeout(r, 700));
    const sayimlar = istekler.filter((i) => i.yol === '/arkon/kayitlar/counts/ekle').flatMap((i) => (i.govde as { satirlar?: { kind?: string }[] }).satirlar ?? []);
    expect(sayimlar.some((c) => c.kind === 'scrap')).toBe(false);
  }, 40000);
});

describe('A1 Üretim Terminali hazırlık listesi (2079-1 b)', () => {
  const cevap = (cnc: string, muafiyetler: unknown[] = []) => ({
    maddeler: [
      { madde: 'cnc', durum: cnc, muafTutulur: true, isEmriDuzeyi: true }, { madde: 'cizim', durum: 'gerekmez', muafTutulur: false, isEmriDuzeyi: false },
      { madde: 'rota', durum: 'bilinmiyor', muafTutulur: false, isEmriDuzeyi: false },
      // Makine yalnız uyarır: eksik olsa da "Başlatılamaz" satırına girmez.
      { madde: 'makine', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true },
    ],
    muafiyetler,
    isEmirleri: [
      { isEmriId: 90, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc }, { madde: 'makine', durum: 'eksik' }] },
      { isEmriId: 91, opNo: 20, ad: 'Freze', bitti: false, maddeler: [{ madde: 'cnc', durum: 'tamam' }] },
    ],
  });
  const kur = (govde: unknown) => {
    const tmi = { ...PAKET, id: 'tmi-ie-90', no: 'UE-DENEME-9', tmi: { emirId: 9, isEmriId: 90 } };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    const okunan: string[] = [];
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      if (String(adres).includes('/adimli-emirler/9/hazirlik')) { okunan.push(String(adres)); return new Response(JSON.stringify(govde), { status: 200 }); }
      return asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    return { istekler, okunan };
  };

  // 3338-4 a: planlamanın hazırlık tablosu terminalde yok; işi durduran eksik madde sayacın üstünde tek satırdır, Başlat açık kalır.
  it('durduran eksik madde "Başlatılamaz" satırıdır, yalnız uyaran girmez; Hazırlık sekmesi ve listesi yok; Başlat açık kalır', async () => {
    const { okunan } = kur(cevap('eksik'));
    await ekran();
    expect(await screen.findByText('Başlatılamaz · eksik: CNC kurulumu', undefined, { timeout: 10000 })).toBeTruthy();
    expect(okunan.length).toBeGreaterThan(0);
    expect(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.queryByRole('tab', { name: /^Hazırlık/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Hazırlık' })).toBeNull();
    expect(screen.getByRole('tab', { name: /^Talimatlar/ })).toBeTruthy();
  }, 40000);

  it('muaf ya da tamam hazırlıkta, yalnız uyaran madde eksikken de satır yok', async () => {
    kur(cevap('muaf', [{ madde: 'cnc', isEmriId: 90, kisiId: 3, kisiAdi: 'Deneme Müdür', gerekce: 'Program tezgâhta doğrulandı.', zaman: '2026-11-04T08:40:00.000Z' }]));
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /UE-DENEME-9/ }, { timeout: 10000 })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/^Başlatılamaz/)).toBeNull();
  }, 40000);
});

describe('A1 Üretim Terminali talimatları (3338-4 a)', () => {
  // 3337-2 a: CORE işi refakat kartıyla başlar; talimat sorusundan sonra kart sorulur.
  const kartlaBaslat = () => {
    const k = screen.getByRole('dialog', { name: 'Refakat kartını okut' });
    fireEvent.change(within(k).getByLabelText(/^Kart/), { target: { value: 'RP:5' } });
    fireEvent.click(within(k).getByRole('button', { name: /Kartla başlat/ }));
  };
  const adim = (id: number, ad: string, asama: string, zorunlu: boolean, tamam = false) => ({
    id, sira: id, ad, aciklama: null, asama, zorunlu, kontrol: null, tamam, tamamlayan: null, tamamlanma: null, kanit: null, gecenNot: null, buNot: null, talimat: null,
  });
  it('zorunlu "Başlamadan önce" eksikken düğmelerin altında yazar; Başlat sorar; "Yine de başlat" başlatır ve CORE\'a yazar', async () => {
    const tmi = { ...PAKET, id: 'tmi-ie-95', no: 'UE-DENEME-95', tmi: { emirId: 95, isEmriId: 95 } };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    const atlama: unknown[] = [];
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      if (String(adres).endsWith('/uretim-emirleri/95/talimat-atlama')) { atlama.push(JSON.parse(String(istek?.body))); return new Response(JSON.stringify({ kayitId: 1 }), { status: 200 }); }
      return /\/uretim-emirleri\/95$/.test(String(adres))
        ? new Response(JSON.stringify({ adimlar: [adim(1, 'ORN aparatı bağla', 'on_hazirlik', true), adim(2, 'Talaşı temizle', 'bitis', true), adim(3, 'Takım boyu', 'hazirlik', true, true)] }), { status: 200 })
        : asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    await ekran();
    const not = await screen.findByRole('button', { name: '1 zorunlu madde eksik' }, { timeout: 10000 });
    expect(not).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    const p = await screen.findByRole('dialog', { name: '1 zorunlu madde eksik' });
    expect(within(p).getByRole('listitem').textContent).toBe('ORN aparatı bağla');
    expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(false);
    fireEvent.click(within(p).getByRole('button', { name: 'Yine de başlat' }));
    kartlaBaslat();
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    // Sapma kartı a: atlanan madde CORE'da adımın geçmişine yazılır.
    await waitFor(() => { expect(atlama).toEqual([{ eylem: 'baslat', adimIdler: [1] }]); }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: '1 zorunlu madde eksik' })).toBeNull();
  }, 40000);

  const talimatliIs = (adimlar: unknown[], ortak = true) => {
    const tmi = { ...PAKET, id: 'tmi-ie-96', no: 'UE-DENEME-96', tmi: { emirId: 96, isEmriId: 96 } };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    const atlama: unknown[] = [];
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      // 3392 a madde 7: kişi güvencesi yalnız ortak (istasyon) cihazda; bu iş ortak cihazda bitirilir.
      if (String(adres).endsWith('/oturum/cihaz')) return new Response(JSON.stringify(ortak ? { ortak: true, id: 1, ad: 'Deneme tableti', profil: 'istasyon' } : { ortak: false }), { status: 200 });
      if (String(adres).endsWith('/uretim-emirleri/96/talimat-atlama')) { atlama.push(JSON.parse(String(istek?.body))); return new Response(JSON.stringify({ kayitId: 1 }), { status: 200 }); }
      if (/\/uretim-emirleri\/96$/.test(String(adres))) return new Response(JSON.stringify({ adimlar }), { status: 200 });
      return asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    return { istekler, atlama };
  };

  it('"Bitince" zorunlu madde eksikken Başlat sormaz, Bitir sorar; "Yine de bitir" bitiş eylemiyle CORE\'a yazar', async () => {
    const { istekler, atlama } = talimatliIs([adim(1, 'ORN aparatı bağla', 'on_hazirlik', true, true), adim(2, 'Talaşı temizle', 'bitis', true)]);
    await ekran();
    const grup = () => within(screen.getByRole('group', { name: 'İş durumu' }));
    await waitFor(() => { expect(screen.getByRole('tab', { name: /^Talimatlar/ })).toBeTruthy(); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(grup().getByRole('button', { name: /Başlat/ }));
    expect(screen.queryByRole('dialog', { name: /zorunlu madde eksik/ })).toBeNull();
    kartlaBaslat();
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    expect(screen.queryByRole('dialog', { name: /zorunlu madde eksik/ })).toBeNull();
    // Bitir basılı tutulur; yardımcı teknolojinin iki tıklaması aynı yoldan tetikler.
    const bitir = await waitFor(() => grup().getByRole('button', { name: /Bitir/ }), { timeout: 10000 });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    // 3392 a madde 7: ortak cihazda Bitir her seferinde kart ister; aynı kişinin kartı bitişi sürdürür.
    expect(await screen.findByRole('dialog', { name: 'Kartınızı okutun' })).toBeTruthy();
    kisiKartiOkut(ISTASYONLU.kullanici.id);
    const p = await screen.findByRole('dialog', { name: '1 zorunlu madde eksik' });
    expect(within(p).getByRole('listitem').textContent).toBe('Talaşı temizle');
    fireEvent.click(within(p).getByRole('button', { name: 'Yine de bitir' }));
    await waitFor(() => { expect(atlama).toEqual([{ eylem: 'bitir', adimIdler: [2] }]); }, { timeout: 10000 });
  }, 40000);

  // 3392 a madde 7: kişisel cihazda kart girişi kapalıdır; oturum zaten kişinindir, Bitir kart istemeden sürer.
  it('kişisel cihazda Bitir kart istemez', async () => {
    talimatliIs([adim(2, 'Talaşı temizle', 'bitis', true)], false);
    await ekran();
    const grup = () => within(screen.getByRole('group', { name: 'İş durumu' }));
    await waitFor(() => { expect(screen.getByRole('tab', { name: /^Talimatlar/ })).toBeTruthy(); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(grup().getByRole('button', { name: /Başlat/ }));
    kartlaBaslat();
    const bitir = await waitFor(() => grup().getByRole('button', { name: /Bitir/ }), { timeout: 10000 });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    expect(await screen.findByRole('dialog', { name: '1 zorunlu madde eksik' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Kartınızı okutun' })).toBeNull();
  }, 40000);

  // 3392 a madde 7: ortak cihazda ekrana 20 dk dokunulmadıysa hurda da kart ister; dokunulduysa doğrudan açılır.
  it('ortak cihazda 20 dk boşluktan sonra hurda kart ister', async () => {
    talimatliIs([]);
    await ekran();
    const grup = () => within(screen.getByRole('group', { name: 'İş durumu' }));
    await waitFor(() => { expect(screen.getByRole('tab', { name: /^Talimatlar/ })).toBeTruthy(); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(grup().getByRole('button', { name: /Başlat/ }));
    kartlaBaslat();
    await waitFor(() => { expect(grup().getByRole('button', { name: /Bitir/ })).toBeTruthy(); }, { timeout: 10000 });
    const hurda = () => screen.getAllByRole('button', { name: /^(Hatalı|Hurda \+1)/ })[0]!;
    fireEvent.pointerDown(window);
    fireEvent.click(hurda());
    expect(screen.queryByRole('dialog', { name: 'Kartınızı okutun' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    const simdi = Date.now();
    const saat = vi.spyOn(Date, 'now').mockReturnValue(simdi + 21 * 60 * 1000);
    try {
      fireEvent.pointerDown(window);
      fireEvent.click(hurda());
      expect(await screen.findByRole('dialog', { name: 'Kartınızı okutun' })).toBeTruthy();
    } finally { saat.mockRestore(); }
  }, 40000);

  it('işaret CORE reddedince geri alınır ve neden yazar; yanıt gelmeden ikinci dokunuş gitmez', async () => {
    let birak: (r: Response) => void = () => undefined;
    const isaretler: unknown[] = [];
    talimatliIs([adim(1, 'ORN aparatı bağla', 'on_hazirlik', true)]);
    // Yanıtı test bırakır: istek askıdayken madde işaretli görünür.
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => (String(adres).endsWith('/uretim-emirleri/96/adimlar/1/tamamla')
      ? (isaretler.push(JSON.parse(String(istek?.body))), new Promise<Response>((r) => { birak = r; }))
      : asil(adres, istek)));
    await ekran();
    fireEvent.click(await screen.findByRole('tab', { name: /^Talimatlar/ }, { timeout: 10000 }));
    fireEvent.click(await screen.findByRole('button', { name: 'ORN aparatı bağla · zorunlu' }, { timeout: 10000 }));
    const isaretli = await screen.findByRole('button', { name: 'ORN aparatı bağla · zorunlu · işareti kaldır' });
    fireEvent.click(isaretli);
    await new Promise((r) => setTimeout(r, 200));
    expect(isaretler).toEqual([{ tamam: true }]);
    birak(new Response(JSON.stringify({ mesaj: 'Reddedildi' }), { status: 409 }));
    expect(await screen.findByRole('button', { name: 'ORN aparatı bağla · zorunlu' }, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText(/^Kaydedilmedi · /)).toBeTruthy();
  }, 40000);
});

describe('A1 Üretim Terminali üst düzen (3338-6 a)', () => {
  const ikinci = { ...PAKET, id: 'pk-deneme-ust', no: 'IE-DENEME-6', part: 'Deneme altıncı parça' };
  const ikiIs = (tesis: unknown = TESIS) => sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }, { kimlik: ikinci.id, surum: 1, govde: ikinci }], kv: [{ kimlik: 'plant', surum: 11, govde: { v: tesis } }] } });
  const telefon = () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
  };
  afterEach(() => { Reflect.deleteProperty(window, 'innerWidth'); Reflect.deleteProperty(window, 'innerHeight'); });

  it('genişte şerit varken "İşler" düğmesi yok; kartta bu istasyonun kodu yazmaz; sıradaki iş işaretli', async () => {
    ikiIs();
    arkonAc('/uretim-terminali');
    const serit = await screen.findByRole('region', { name: 'Sıradaki işler' }, { timeout: 10000 });
    await waitFor(() => { expect(within(serit).getAllByRole('listitem').length).toBe(2); }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: /^İşler · / })).toBeNull();
    expect(within(serit).queryByText('IST-1')).toBeNull();
    expect(within(serit).getByText('Sıradaki')).toBeTruthy();
  }, 40000);

  it('işsiz istasyonda sıra şeridi yerinde ("Sırada iş yok"), "İşler" düğmesi var (3583)', async () => {
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [], kv: [{ kimlik: 'plant', surum: 12, govde: { v: TESIS } }] } });
    arkonAc('/uretim-terminali');
    expect(await screen.findByRole('button', { name: /^İşler · 0/ }, { timeout: 10000 })).toBeTruthy();
    const serit = screen.getByRole('region', { name: 'Sıradaki işler' });
    expect(serit.hasAttribute('data-bos')).toBe(true);
    expect(within(serit).getByText('Sırada iş yok')).toBeTruthy();
    expect(within(serit).queryAllByRole('listitem')).toHaveLength(0);
    // Öteki bölgeler de iş yokken yerinde: durum şeridi ("İş yok"), uyarı ve Şimdi yuvası (boş), üç sabit eylem yuvası (pasif).
    expect(document.querySelector('.tc-ay1-ds')?.textContent).toContain('İş yok');
    expect(document.querySelector('.tc-ay1-uyari-seridi')?.hasAttribute('data-bos')).toBe(true);
    expect(document.querySelector('.tc-ay1-simdi')).toBeTruthy();
    const yuvalar = within(screen.getByRole('group', { name: 'İş durumu' })).getAllByRole('button') as HTMLButtonElement[];
    expect(yuvalar).toHaveLength(3);
    expect(yuvalar.every((b) => b.disabled)).toBe(true);
  }, 40000);

  it('telefonda tek işte de sıra şeridi yerinde (tek kart); iş satırı Bilgiler\'i açar; üst kutuda istasyonun altında makine kodu (3583)', async () => {
    telefon();
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 13, govde: { v: { ...TESIS, mcs: [{ id: 'MK-7', name: 'Deneme makine 7', st: 'IST-1' }] } } }] } });
    arkonAc('/uretim-terminali');
    const satir = await screen.findByRole('button', { name: /^Aktif iş: / }, { timeout: 10000 });
    const serit = screen.getByRole('region', { name: 'Sıradaki işler' });
    expect(serit.hasAttribute('data-bos')).toBe(false);
    expect(within(serit).getAllByRole('listitem')).toHaveLength(1);
    await waitFor(() => { expect(document.querySelector('.tc-ay1-mobil-ust .tc-ay1-istasyon-makine')?.textContent).toBe('MK-7'); }, { timeout: 10000 });
    fireEvent.click(satir);
    expect(await screen.findByRole('dialog', { name: 'Bilgiler' })).toBeTruthy();
  }, 40000);

  it('telefonda iki işte şerit var, iş satırı sırayı ("1 / 2") yinelemez', async () => {
    telefon();
    ikiIs();
    arkonAc('/uretim-terminali');
    const serit = await screen.findByRole('region', { name: 'Sıradaki işler' }, { timeout: 10000 });
    await waitFor(() => { expect(within(serit).getAllByRole('listitem').length).toBe(2); }, { timeout: 10000 });
    expect(screen.getByRole('button', { name: /^Aktif iş: / }).textContent).not.toMatch(/\d+ \/ \d+/);
  }, 40000);
});

describe('A1 Üretim Terminali rota akışı (3136 a)', () => {
  const ADIMLAR = { emirId: 8, adimlar: [
    { isEmriId: 79, opNo: 10, ad: 'Testere kesim', statu: 'bitti', elle: false, yuzde: 100, nedenler: [], tedarik: [] },
    { isEmriId: 80, opNo: 20, ad: 'CNC torna', statu: 'uretimde', elle: false, yuzde: 40, nedenler: [], tedarik: [] },
  ] };
  const kur = (adimCevabi: () => Response) => {
    const tmi = { ...PAKET, id: 'tmi-ie-80', no: 'UE-DENEME-8', tmi: { emirId: 8, isEmriId: 80 } };
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => (String(adres).includes('/adimli-emirler/8/adim-durumu/terminal') ? adimCevabi() : asil(adres, istek)));
  };

  it('durum çubuğunun yerinde rota: bu adım işaretli; karta dokununca Adımlar açılır', async () => {
    kur(() => new Response(JSON.stringify(ADIMLAR), { status: 200 }));
    arkonAc('/uretim-terminali');
    await ekran();
    const rota = await screen.findByRole('region', { name: 'Rota: 1/2 adım bitti, toplam yüzde 70' }, { timeout: 10000 });
    const kartlar = within(rota).getAllByRole('listitem');
    expect(kartlar.map((x) => x.getAttribute('aria-current'))).toEqual([null, 'step']);
    expect(screen.queryByRole('region', { name: 'Emrin adımları' })).toBeNull();
    // jsdom kaydırmayı bilmez; açılan listede bu adıma kaydırma çağrısı düşmesin.
    const kaydir = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: kaydir });
    try {
      fireEvent.click(kartlar[0]!);
      expect(await screen.findByRole('region', { name: 'Emrin adımları' })).toBeTruthy();
      await waitFor(() => { expect(kaydir).toHaveBeenCalled(); });
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  }, 40000);

  it('adımlar okunamazsa rota yerine durum şeridi kalır ve okunamadığı yazar', async () => {
    kur(() => new Response(JSON.stringify({ hata: 'x' }), { status: 500 }));
    arkonAc('/uretim-terminali');
    await ekran();
    expect(await screen.findByText('Rota adımları okunamadı', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^Rota:/ })).toBeNull();
  }, 40000);
});

describe('A1 Üretim Terminali el okuyucu (1337 a)', () => {
  const okut = (kod: string) => { for (const c of [...kod, 'Enter']) fireEvent.keyDown(document.body, { key: c }); };
  let kartOkundu = false;
  const kur = () => {
    kartOkundu = false;
    const tmi = { ...PAKET, id: 'tmi-ie-80', no: 'UE-DENEME-8', tmi: { emirId: 8 } };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      if (String(adres).includes('/arkon/refakat-kartlari')) {
        kartOkundu = true;
        return new Response(JSON.stringify({ kartlar: [
          { id: 4, uretimEmriId: 8, etiket: 'UE-DENEME-8-P4', lotNo: 'LT-1', malzemeKod: null, malzemeAd: null, birim: null, verilen: '10', istasyondaSatirVar: true, sayilan: null, sinir: null },
          { id: 6, uretimEmriId: 98, etiket: 'UE-DENEME-98-P6', lotNo: 'LT-2', malzemeKod: null, malzemeAd: null, birim: null, verilen: '10', istasyondaSatirVar: true, sayilan: null, sinir: null },
        ] }), { status: 200 });
      }
      return asil(adres, istek);
    });
    return istekler;
  };

  it('okutulan refakat kartı işi o kartla açar, başlatmaz (1062)', async () => {
    const istekler = kur();
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /UE-DENEME-8/ })).toBeTruthy();
    await waitFor(() => { expect(kartOkundu).toBe(true); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    okut('RP:4');
    expect(await screen.findByText(/İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
    expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(false);
  }, 40000);

  it('3337-2 a: kartla açılmış iş Başlat\'ta kart sormaz, kartıyla başlar; kartsız işte pencere yalnız bu işin kartlarını yazar', async () => {
    const istekler = kur();
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /UE-DENEME-8/ })).toBeTruthy();
    await waitFor(() => { expect(kartOkundu).toBe(true); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartını okut' });
    expect(within(pencere).getByText(/Bu işin kartları: UE-DENEME-8-P4\./)).toBeTruthy();
    expect(within(pencere).queryByText(/UE-DENEME-98-P6/)).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Refakat kartını okut' })).toBeNull(); });
    okut('RP:4');
    expect(await screen.findByText(/İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    expect(olaylar(istekler).find((e) => e.state === 'running')).toMatchObject({ refakatPartisiId: 4 });
    expect(screen.queryByRole('dialog', { name: 'Refakat kartını okut' })).toBeNull();
  }, 40000);

  it('kart dışı kod ve bu istasyonun olmayan kart işi açmaz, söyler (reddedilen)', async () => {
    kur();
    arkonAc('/uretim-terminali');
    await ekran();
    await waitFor(() => { expect(kartOkundu).toBe(true); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    okut('LOT:LT-1');
    expect(await screen.findByText(/Refakat kartı değil/, {}, { timeout: 10000 })).toBeTruthy();
    okut('RP:99');
    expect(await screen.findByText(/Bu kart bu istasyondaki işlerin kartı değil/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/İş emri açıldı/)).toBeNull();
  }, 40000);

  // 3155 (3157 a): el okuyucusu olmayan istasyonda aynı okutma "İş kartı okut" düğmesinden, kamera penceresiyle yapılır (3298 adı).
  const pencereyeOkut = async (kod: string) => {
    fireEvent.click((await screen.findAllByRole('button', { name: 'İş kartı okut' }))[0]!);
    const kutu = within(await screen.findByRole('dialog', { name: 'Refakat kartını okut' })).getByRole('textbox', { name: 'Kod' });
    fireEvent.change(kutu, { target: { value: kod } });
    fireEvent.submit(kutu.closest('form')!);
  };

  it('"İş kartı okut" düğmesiyle okutulan kart işi o kartla açar, başlatmaz; pencere kapanır', async () => {
    const istekler = kur();
    arkonAc('/uretim-terminali');
    const d = await ekran();
    expect(await within(d).findByRole('heading', { name: /UE-DENEME-8/ })).toBeTruthy();
    await waitFor(() => { expect(kartOkundu).toBe(true); }, { timeout: 10000 });
    await pencereyeOkut('RP:4');
    expect(await screen.findByText(/İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Refakat kartını okut' })).toBeNull();
    await new Promise((r) => setTimeout(r, 700));
    expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(false);
  }, 40000);

  it('"İş kartı okut" penceresinde kart dışı kod işi açmaz, sessiz de kalmaz', async () => {
    kur();
    arkonAc('/uretim-terminali');
    await ekran();
    await waitFor(() => { expect(kartOkundu).toBe(true); }, { timeout: 10000 });
    // Personel kartı biçimindeki kod el okuyucuda yok sayılır (kişi değiştirme yoluna bırakılır); pencerede söylenir.
    await pencereyeOkut('1234567890');
    expect(await screen.findByText(/Refakat kartı değil/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Refakat kartını okut' })).toBeNull();
    expect(screen.queryByText(/İş emri açıldı/)).toBeNull();
  }, 40000);

  // Düğme iki yerde çizilir (geniş şerit ve dar şerit); ikisi de önizlemede kapalı olmalı.
  it.each([['geniş ekranda', null], ['telefonda', 360]] as const)('önizleme kipinde "İş kartı okut" düğmesi yok (%s; önizleme teslim almaz, iş açmaz)', async (_ad, en) => {
    if (en !== null) {
      Object.defineProperty(window, 'innerWidth', { value: en, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
    }
    try {
      sunucuKur(YONETICI, sunucu());
      arkonAc('/arkon/onizle/IST-1');
      // Önizleme rozeti yalnız geniş şeritte yazar.
      if (en === null) expect(await screen.findByText('Önizleme · kayıt yapılmaz', {}, { timeout: 10000 })).toBeTruthy();
      // Şerit çizilmiş olmalı; yoksa "düğme yok" boş ekranda da geçerdi. Uzak mod yalnız geniş, dar şerit kendi başlığıyla.
      if (en === null) expect((await screen.findAllByRole('button', { name: 'Uzak mod' }, { timeout: 10000 })).length).toBeGreaterThan(0);
      else await waitFor(() => { expect(document.querySelector('.tc-ay1-mobil-ust')).not.toBeNull(); }, { timeout: 10000 });
      expect(screen.queryByRole('button', { name: 'İş kartı okut' })).toBeNull();
    } finally {
      Reflect.deleteProperty(window, 'innerWidth'); Reflect.deleteProperty(window, 'innerHeight');
    }
  }, 40000);
});

// 2928 a, 2933 a: stok.istek olan operatörde okutulan kart önce bu istasyona gelen teslimleri alır; iş yalnız belirsizlik yoksa açılır.
describe('A1 Üretim Terminali kart okutma: teslim al ve iş aç (2928 a)', () => {
  const okut = (kod: string) => { for (const c of [...kod, 'Enter']) fireEvent.keyDown(document.body, { key: c }); };
  const STOKLU: Deneme = { ...ISTASYONLU, kullanici: { ...ISTASYONLU.kullanici, islemler: [...ISTASYONLU.kullanici.islemler, 'stok.istek'] } };
  const paket = (id: string, no: string, emirId: number, opNo: number, ek: Record<string, unknown> = {}) => ({ ...PAKET, id, no, tmi: { emirId, opNo }, ...ek });
  const teslim = (malzemeId: number, id = 70, istasyonId = 4, miktar = '5') => ({ id, no: `TS-0000${id}`, malzemeId, miktar, surum: 1, hedef: { konumId: 1, kod: `IST-${istasyonId}`, ad: null, istasyonId } });
  const kart = (id: number, emirId: number, etiket: string) => ({ id, qr: `RP:${id}`, etiket, uretimEmriId: emirId });
  const kur = (o: {
    paketler: Record<string, unknown>[]; coz: Record<string, unknown> | (() => Record<string, unknown>); girdiler?: { uretimEmriId: number; opNo: number; malzemeler: { malzemeId: number }[] }[];
    tesAlDurumu?: number | ((id: number) => number | undefined);
  }) => {
    const istekler = sunucuKur(STOKLU, { belgeler: { pkgs: o.paketler.map((x) => ({ kimlik: x.id as string, surum: 1, govde: x })), kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    const cevap = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      const yol = new URL(adres, 'http://tmi.yerel').pathname.replace(/^\/api/, '');
      if (yol === '/arkon/refakat-kartlari') return cevap(200, { kartlar: [] });
      if (yol === '/stok/teslim-kutusu') return cevap(200, { gelenler: [], gonderdiklerim: [], isteklerim: [], istasyonlar: [{ id: 4, kod: 'IST-1', ad: 'Deneme tezgah' }], hedefIstasyonlar: [] });
      if (yol === '/stok/teslim-kutusu/is-malzemeleri') return cevap(200, { isler: (o.girdiler ?? []).map((x) => ({ ...x, emirNo: '', adimAd: '', calisiyor: false, kalanAdet: 1, malzemeler: x.malzemeler.map((m) => ({ ...m, kod: null, ad: null, birim: null, birAdet: '1', gereken: '1', istasyonda: '1', eksik: false, yerler: [], istek: null })) })) });
      if (yol === '/stok/teslim-kutusu/kod-coz') { await asil(adres, istek); return cevap(200, typeof o.coz === 'function' ? o.coz() : o.coz); }
      const al = /^\/stok\/teslimler\/(\d+)\/teslim-al$/.exec(yol);
      if (al) {
        await asil(adres, istek);
        const id = Number(al[1]);
        const durum = typeof o.tesAlDurumu === 'function' ? o.tesAlDurumu(id) : o.tesAlDurumu;
        return durum ? cevap(durum, { kod: 'CAKISMA', mesaj: 'Teslim değişti.' }) : cevap(200, { teslim: teslim(700, id) });
      }
      return asil(adres, istek);
    });
    return istekler;
  };
  const hazir = async (istekler: Istek[]) => {
    arkonAc('/uretim-terminali');
    await ekran();
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/arkon/belgeler/pkgs')).toBe(true); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1200));
  };
  const coz = (k: Record<string, unknown>, malzemeId: number, gelenler = [teslim(malzemeId)], birim = 'adet') => ({ tur: 'malzeme', malzeme: { id: 1, kod: null, ad: null, birim }, parti: null, yerler: [], refakat: k, gelenler, kartSatirlari: [] });

  it('tek işte kart gelen teslimi alır ve işi o kartla açar, başlatmaz', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500) });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/5 adet alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/stok/teslimler/70/teslim-al')?.govde).toEqual({ surum: 1, alinan: '5' });
    await new Promise((r) => setTimeout(r, 500));
    expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(false);
  }, 40000);

  it('emrin burada iki işi varsa sorar; en küçük OP önerilir, seçilen iş açılır', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-82', 'UE-DENEME-8 OP20', 8, 20), paket('tmi-ie-83', 'UE-DENEME-8 OP10', 8, 10)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500) });
    await hazir(istekler);
    okut('RP:4');
    const pencere = await screen.findByRole('dialog', { name: 'Hangi iş açılsın?' }, { timeout: 10000 });
    const satirlar = within(pencere).getAllByRole('listitem');
    expect(within(satirlar[0]!).getByText('UE-DENEME-8 OP10')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Önerilen')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'UE-DENEME-8 OP20 işini aç' }));
    expect(await screen.findByText(/İş emri açıldı: UE-DENEME-8 OP20 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
  }, 40000);

  it('montaja gelen alt parça kartı teslimi alır, parçayı kullanan montaj işini önerir; iş kartsız açılır (2933 a)', async () => {
    const istekler = kur({
      paketler: [paket('tmi-ie-90', 'UE-MONTAJ-9', 9, 10, { opType: 'montaj' })], coz: coz(kart(5, 99, 'UE-ALT-99-P1'), 700),
      girdiler: [{ uretimEmriId: 9, opNo: 10, malzemeler: [{ malzemeId: 700 }] }],
    });
    await hazir(istekler);
    okut('RP:5');
    const pencere = await screen.findByRole('dialog', { name: 'Montaj işini aç' }, { timeout: 10000 });
    expect(within(pencere).getByText(/5 adet alındı/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'UE-MONTAJ-9 işini aç' }));
    expect(await screen.findByText(/Montaj işi açıldı: UE-MONTAJ-9 · UE-ALT-99-P1 5 adet alındı/, {}, { timeout: 10000 })).toBeTruthy();
  }, 40000);

  it('montajda parçayı kullanan iş yoksa teslim alınır ve "montaj işi bulunamadı" denir', async () => {
    const istekler = kur({
      paketler: [paket('tmi-ie-90', 'UE-MONTAJ-9', 9, 10, { opType: 'montaj' })], coz: coz(kart(5, 99, 'UE-ALT-99-P1'), 700),
      girdiler: [{ uretimEmriId: 9, opNo: 10, malzemeler: [{ malzemeId: 701 }] }],
    });
    await hazir(istekler);
    okut('RP:5');
    expect(await screen.findByText('UE-ALT-99-P1: 5 adet alındı · montaj işi bulunamadı', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 40000);

  it('teslim alınamazsa iş açılmaz ve neden söylenir (reddedilen)', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500), tesAlDurumu: 409 });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/UE-DENEME-8-P4: hiçbir teslim alınmadı, 1 teslim alınamadı; iş açılmadı\. TS-000070/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/İş emri açıldı/)).toBeNull();
  }, 40000);

  it('yalnız bu istasyona gelen teslim alınır; başka istasyona giden alınmaz (yasak)', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500, [teslim(500, 70, 4), teslim(500, 71, 5)]) });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/5 adet alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/teslimler/70/teslim-al')).toBe(true);
    expect(istekler.some((i) => i.yol === '/stok/teslimler/71/teslim-al')).toBe(false);
  }, 40000);

  it('iki teslimden biri düşerse alınan alınmış kalır, iş açılmaz; yeniden okutunca kalan alınır ve iş açılır', async () => {
    let ilkOkutma = true;
    const istekler = kur({
      paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)],
      coz: () => coz(kart(4, 8, 'UE-DENEME-8-P4'), 500, ilkOkutma ? [teslim(500, 70), teslim(500, 72)] : [teslim(500, 72)]),
      tesAlDurumu: (id) => (id === 72 && ilkOkutma ? 409 : undefined),
    });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/UE-DENEME-8-P4: 5 adet alındı, 1 teslim alınamadı; iş açılmadı\. TS-000072/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByText(/İş emri açıldı/)).toBeNull();
    ilkOkutma = false;
    okut('RP:4');
    expect(await screen.findByText(/5 adet alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/stok/teslimler/70/teslim-al')).toHaveLength(1);
    expect(istekler.filter((i) => i.yol === '/stok/teslimler/72/teslim-al')).toHaveLength(2);
  }, 40000);

  it('iki teslim birlikte alınınca iletide toplam miktar söylenir', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500, [teslim(500, 70, 4, '10'), teslim(500, 73, 4, '30')]) });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/40 adet alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.filter((i) => /^\/stok\/teslimler\/(70|73)\/teslim-al$/.test(i.yol))).toHaveLength(2);
  }, 40000);

  it('ondalıklı teslimlerin toplamı artıksız yazılır (0,1 + 0,2 = 0,3)', async () => {
    const istekler = kur({ paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20)], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500, [teslim(500, 70, 4, '0.1'), teslim(500, 73, 4, '0.2')], 'kg') });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/0,3 kg alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
  }, 40000);

  it('kartın kendi emrinin işi montaj adayı sayılmaz; kendi işi kartla açılır', async () => {
    const istekler = kur({
      paketler: [paket('tmi-ie-80', 'UE-DENEME-8', 8, 20, { opType: 'montaj' })], coz: coz(kart(4, 8, 'UE-DENEME-8-P4'), 500),
      girdiler: [{ uretimEmriId: 8, opNo: 20, malzemeler: [{ malzemeId: 500 }] }],
    });
    await hazir(istekler);
    okut('RP:4');
    expect(await screen.findByText(/5 adet alındı · İş emri açıldı: UE-DENEME-8 · UE-DENEME-8-P4/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Montaj işini aç' })).toBeNull();
  }, 40000);
});

describe('A1 Üretim Terminali CORE reddi bildirimi', () => {
  const RET = 'Bu işte Deneme Kişi de çalışıyor.';
  const reddet = (durum: string, tmiDurum?: string) => (tur: string, satirlar: Record<string, unknown>[]) => {
    const red = tur === 'events' ? satirlar.filter((r) => r.state === durum) : [];
    return { eklenen: satirlar.length - red.length, reddedilen: red.map((r) => ({ cid: r.cid, ileti: RET, ...(tmiDurum ? { tmiDurum } : {}) })) };
  };
  const hazir = async () => {
    expect(await within(await ekran()).findByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
  };
  const bildirimler = () => Array.from(within(screen.getByRole('region', { name: 'Bildirimler' })).queryAllByText(/./, { selector: '.tc-bildirim-mesaj' })).map((p) => p.textContent);

  it('reddedilen duruşta yalnız ekranın ret iletisi kalır: "kaydedildi" ve köprünün aynı reti gösterilmez', async () => {
    // Telefonda Durdur dokunuşla neden sorar (genişte basılı tutulur).
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true });
    try {
      const nedenler = { kimlik: 'reasons', surum: 1, govde: { v: [{ code: 'D-01', l: 'Malzeme bekleniyor', i: 'truck', cat: 'u' }] } };
      sunucuKur(ISTASYONLU, { ...sunucu([nedenler]), kayitEkle: reddet('stopped', 'running') });
      arkonAc('/uretim-terminali');
      const cubuk = () => screen.getByRole('group', { name: 'İş eylemleri' });
      await screen.findByRole('group', { name: 'İş eylemleri' }, { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 700));
      fireEvent.click(within(cubuk()).getByRole('button', { name: /İşi Başlat/ }));
      fireEvent.click(await within(cubuk()).findByRole('button', { name: /Durdur/ }, { timeout: 10000 }));
      const pencere = await screen.findByRole('dialog', { name: 'Neden durdu?' });
      const neden = pencere.querySelector('.tc-ay1-neden');
      expect(neden).not.toBeNull();
      fireEvent.click(neden!);
      await waitFor(() => { expect(bildirimler()).toContain(`CORE kabul etmedi · ${RET}`); }, { timeout: 10000 });
      expect(bildirimler().filter((m) => m?.includes(RET))).toHaveLength(1);
      expect(bildirimler().some((m) => m?.startsWith('Duruş kaydedildi'))).toBe(false);
    } finally {
      Reflect.deleteProperty(window, 'innerWidth'); Reflect.deleteProperty(window, 'innerHeight');
    }
  }, 40000);

  it('reddedilen başlatmada yalnız "İş başlamadı" kalır', async () => {
    sunucuKur(ISTASYONLU, { ...sunucu(), kayitEkle: reddet('running') });
    arkonAc('/uretim-terminali');
    await hazir();
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(bildirimler()).toContain(`İş başlamadı · ${RET}`); }, { timeout: 10000 });
    expect(bildirimler()).toEqual([`İş başlamadı · ${RET}`]);
  }, 40000);
});

// 3703: depo istasyonunda adım "Mal kabul (giriş)" modundaysa Kabul +1 sayar, Bitir "Kabulü yaz" penceresini açar; ara stokta Stok'a kayıt yazılmaz.
describe('A1 Üretim Terminali mal kabul adımı (3703)', () => {
  const kabulIsi = (hedef: number, kimlik = 97, ortak = false) => {
    const tmi = { ...PAKET, id: `tmi-ie-${String(kimlik)}`, no: `UE-DENEME-${String(kimlik)}`, opType: 'depo', st: { mode: 'receive' }, target: hedef, malzemeNo: 305, tmi: { emirId: kimlik, isEmriId: kimlik } };
    const deneme = { ...ISTASYONLU, kullanici: { ...ISTASYONLU.kullanici, islemler: [...ISTASYONLU.kullanici.islemler, 'stok.giris'] } } as Deneme;
    const istekler = sunucuKur(deneme, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      const a = String(adres);
      if (a.endsWith('/oturum/cihaz')) return new Response(JSON.stringify(ortak ? { ortak: true, id: 1, ad: 'Deneme tableti', profil: 'istasyon' } : { ortak: false }), { status: 200 });
      if (new RegExp(`/uretim-emirleri/${String(kimlik)}$`).test(a)) return new Response(JSON.stringify({ adimlar: [] }), { status: 200 });
      if (a.endsWith('/stok/acik-siparis-satirlari')) return new Response(JSON.stringify({ satirlar: [] }), { status: 200 });
      if (a.includes('/stok/konumlar')) return new Response(JSON.stringify({ satirlar: [] }), { status: 200 });
      if (a.endsWith('/stok/mal-kabul') && istek?.method === 'POST') {
        istekler.push({ yontem: 'POST', yol: '/stok/mal-kabul', govde: JSON.parse(String(istek.body)) });
        return new Response(JSON.stringify({ belge: { id: 9, no: 'MK-000009', tur: 'diger', irsaliyeNo: null, zaman: '2026-11-25T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [1] }), { status: 200 });
      }
      return asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    return istekler;
  };
  const kartlaBaslat = () => {
    const k = screen.getByRole('dialog', { name: 'Refakat kartını okut' });
    fireEvent.change(within(k).getByLabelText(/^Kart/), { target: { value: 'RP:5' } });
    fireEvent.click(within(k).getByRole('button', { name: /Kartla başlat/ }));
  };
  const baslat = async () => {
    await ekran();
    const grup = () => within(screen.getByRole('group', { name: 'İş durumu' }));
    await waitFor(() => { expect(grup().getByRole('button', { name: /Başlat/ })).toBeTruthy(); }, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(grup().getByRole('button', { name: /Başlat/ }));
    kartlaBaslat();
    return grup;
  };

  it('Kabul +1 hedefte durur ve nedenini yazar; Bitir Kabulü yaz penceresini açar, ara stokta Stok kaydı yazılmaz ve iş biter', async () => {
    const istekler = kabulIsi(2);
    const grup = await baslat();
    const arti = await screen.findByRole('button', { name: 'Kabul +1' }, { timeout: 10000 });
    fireEvent.click(arti);
    expect((await screen.findAllByText(/Kabul \+1 · 1/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Toplanan \+1/)).toBeNull();
    fireEvent.click(arti);
    await waitFor(() => { expect((arti as HTMLButtonElement).disabled).toBe(true); }, { timeout: 10000 });
    expect(await screen.findByText(/Hedef 2 adet; fazlası kabul edilmez/)).toBeTruthy();
    const bitir = await waitFor(() => grup().getByRole('button', { name: /Bitir/ }), { timeout: 10000 });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    const p = await screen.findByRole('dialog', { name: 'Kabulü yaz' }, { timeout: 10000 });
    // Bitir onaydan önce işi kapatmaz.
    expect(olaylar(istekler).some((e) => e.state === 'done')).toBe(false);
    fireEvent.click(await within(p).findByRole('button', { name: 'Kabulü onayla' }, { timeout: 10000 }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'done')).toBe(true); }, { timeout: 10000 });
    expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(false);
  }, 60000);

  it('eksik adette kayıt yazılır ama iş açık kalır; sayaç sıfırlanmaz', async () => {
    const istekler = kabulIsi(5, 98);
    const grup = await baslat();
    const arti = await screen.findByRole('button', { name: 'Kabul +1' }, { timeout: 10000 });
    fireEvent.click(arti);
    fireEvent.click(arti);
    const bitir = await waitFor(() => grup().getByRole('button', { name: /Bitir/ }), { timeout: 10000 });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    const p = await screen.findByRole('dialog', { name: 'Kabulü yaz' }, { timeout: 10000 });
    expect(await within(p).findByText(/Yarım kabul/, undefined, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(await within(p).findByRole('button', { name: 'Kabulü onayla' }, { timeout: 10000 }));
    expect(await screen.findByText(/Kabul edilen: 2 adet/, undefined, { timeout: 10000 })).toBeTruthy();
    expect(olaylar(istekler).some((e) => e.state === 'done')).toBe(false);
  }, 60000);
});

// 3719: iş yüklenirken (istasyonun "iş yok" yer tutucusu varken) seçilen sekme, iş gelince varsayılana sıfırlanmaz.
describe('A1 Üretim Terminali sekme yarışı (3719)', () => {
  it('iş gelmeden seçilen Adımlar sekmesi iş yüklenince seçili kalır', async () => {
    const tmi = { ...PAKET, id: 'tmi-ie-301', no: 'UE-DENEME-301', tmi: { emirId: 301, isEmriId: 301 } };
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: tmi.id, surum: 1, govde: tmi }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    const asil = globalThis.fetch;
    let ac!: () => void;
    const kapi = new Promise<void>((r) => { ac = r; });
    vi.stubGlobal('fetch', async (adres: string, istek?: RequestInit) => {
      if (String(adres).includes('/arkon/belgeler/pkgs') && (istek?.method ?? 'GET') === 'GET') await kapi;
      return asil(adres, istek);
    });
    arkonAc('/uretim-terminali');
    const adimlar = await screen.findByRole('tab', { name: /^Adımlar/ }, { timeout: 10000 });
    fireEvent.click(adimlar);
    await waitFor(() => { expect(adimlar.getAttribute('aria-selected')).toBe('true'); });
    ac();
    expect((await screen.findAllByText(/UE-DENEME-301/, {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('tab', { name: /^Adımlar/ }).getAttribute('aria-selected')).toBe('true');
  });
});
