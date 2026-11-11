import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NumunePenceresi } from './Pencereler.tsx';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { arkonAc, OPERATOR, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';

// Üretim Terminali: açılışta yazma yok; üretim yetkisi olan başlatır; yetkisi olmayan yalnız görür; önizleme hiç yazmaz.
// Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

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

  it('790: çark başka işe yalnız bakar; resim ve adımlar önizlenir; geçiş "Bu işe geç" ile, yazma yok', async () => {
    const ikinci = { ...PAKET, id: 'pk-deneme-cark', no: 'IE-DENEME-3', part: 'Deneme ikinci parça' };
    const istekler = sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }, { kimlik: ikinci.id, surum: 1, govde: ikinci }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    arkonAc('/uretim-terminali');
    const cark = await screen.findByRole('region', { name: 'İş ve makine çarkı' }, { timeout: 10000 });
    expect(within(cark).getByText(/Ekranda · sayaç/)).toBeTruthy();
    expect(within(cark).getByText('Ekranda')).toBeTruthy();
    // 828 a: ekrandaki işin tam kartı çarkın altındadır; çevirmek onu değiştirmez.
    const ilk = within(screen.getByRole('region', { name: 'Aktif iş emri' })).getByRole('heading').textContent;
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: işler' }));
    expect(within(cark).getByText(/Önizleme · ekrandaki iş değişmez/)).toBeTruthy();
    expect(screen.getByText(/Önizleme · IE-DENEME-(1|3) · teknik resim ve adımlar salt okunur/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Aktif iş emri' })).getByRole('heading').textContent).toBe(ilk);
    fireEvent.click(within(cark).getByRole('button', { name: 'Ekrandakine dön' }));
    expect(screen.queryByText(/teknik resim ve adımlar salt okunur/)).toBeNull();
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: işler' }));
    fireEvent.click(within(cark).getByRole('button', { name: 'Bu işe geç' }));
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
    const cark = await screen.findByRole('region', { name: 'İş ve makine çarkı' }, { timeout: 10000 });
    const makineler = () => fireEvent.click(within(within(cark).getByRole('group', { name: 'Çark şeridi' })).getByRole('button', { name: /Makineler/ }));
    const isler = () => fireEvent.click(within(within(cark).getByRole('group', { name: 'Çark şeridi' })).getByRole('button', { name: /İşler/ }));
    // Önceki testlerin yerel kopyası kalabilir: tesis yeni sürümle gelir, listede en az iki iş yeter.
    await within(cark).findByRole('button', { name: /^İşler · ([2-9]|\d{2,})$/ }, { timeout: 10000 });
    makineler();
    fireEvent.click(within(cark).getByRole('button', { name: 'Bu makinede çalış' }));
    expect(within(cark).getByText('1 makine seçili')).toBeTruthy();
    isler();
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: işler' }));
    fireEvent.click(within(cark).getByRole('button', { name: 'Bu işe geç' }));
    makineler();
    await waitFor(() => { expect(within(cark).queryByText('1 makine seçili')).toBeNull(); });
    expect(within(cark).getByRole('button', { name: 'Bu makinede çalış' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }));
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
    const baslatma = olaylar(istekler).find((e) => e.state === 'running') as { mcs?: unknown } | undefined;
    expect(baslatma?.mcs).toBeUndefined();
  }, 40000);

  it('2125-1 b: İşlerim şeridi başka istasyondaki makinede çalışan işi gösterir; "İstasyona geç" cihazın istasyonunu değiştirir, yazma yok', async () => {
    const tesis = { ...TESIS, sts: [...TESIS.sts, { id: 'IST-2', name: 'Deneme ikinci tezgah', wc: 'TAL', t: 'cnc' }] };
    const istekler = sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 3, govde: { v: tesis } }] } });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      if (new URL(adres, 'http://tmi.yerel').pathname === '/api/arkon/islerim') {
        istekler.push({ yontem: 'GET', yol: '/arkon/islerim', govde: null });
        return new Response(JSON.stringify({ isler: [{
          emirId: 55, emirNo: 'UE-DENEME-55', isEmriId: 550, opNo: 30, istasyon: 'IST-2', istasyonAd: 'Deneme ikinci tezgah', mc: 'MK-9', makineAd: 'Deneme makine 9',
          giris: new Date(Date.now() - 25 * 60_000).toISOString(),
        }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return asil(adres, ayar);
    }));
    arkonAc('/uretim-terminali');
    const cark = await screen.findByRole('region', { name: 'İş ve makine çarkı' }, { timeout: 10000 });
    fireEvent.click(await within(cark).findByRole('button', { name: /İşlerim · 1/ }, { timeout: 10000 }));
    expect(within(cark).getByText('MK-9')).toBeTruthy();
    expect(within(cark).getByText(/UE-DENEME-55 · Op 30/)).toBeTruthy();
    expect(within(cark).getByText(/Çalışıyor · 2\d dk/)).toBeTruthy();
    fireEvent.click(within(cark).getByRole('button', { name: 'İstasyona geç' }));
    await waitFor(() => { expect(JSON.parse(window.localStorage.getItem('arkon:station') ?? 'null')).toBe('IST-2'); });
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('820 b, 848 a: genişte Menü düğmesi yalnız geçiş varsa; yönetici Çizim\'e geçer', async () => {
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    fireEvent.click(screen.getByRole('button', { name: 'Menü' }));
    const menu = await screen.findByRole('dialog', { name: 'Menü' });
    expect(within(menu).queryByRole('button', { name: /Vardiya özeti/ })).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: /^Çizim/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/arkon/cizim'); });
  }, 40000);

  it('820 b, 848 a: geçişi olmayan operatörde genişte Menü düğmesi yok (reddedilen)', async () => {
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    expect(screen.queryByRole('button', { name: 'Menü' })).toBeNull();
  }, 40000);

  // 2001 b: istasyonu belli olmayan operatörde üst şerit listedeki ilk istasyonu seçilmiş gibi göstermiyordu; seçici "atanmış istasyon
  // yok" derken üstte başka istasyon yazıyordu.
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

  it('2001 b: yetkili istasyonu olan operatör onunla açılır, seçici açılmaz', async () => {
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await ekran();
    const ust = document.querySelector('.tc-ay1-ust') as HTMLElement;
    expect(within(ust).getByText('IST-1')).toBeTruthy();
    expect(within(ust).queryByText('İstasyon seçilmedi')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Hangi istasyonda?' })).toBeNull();
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

  it('793 b: istasyon çarkın İstasyonlar şeridinden değişir; geçiş cihazın istasyonunu yazar, üst çubuk yalnız adı gösterir', async () => {
    const ikiIstasyon = { ...TESIS, sts: [...TESIS.sts, { id: 'IST-2', name: 'Deneme ikinci tezgah', wc: 'TAL', t: 'cnc' }] };
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 7, govde: { v: ikiIstasyon } }] } });
    window.localStorage.setItem('arkon:station', JSON.stringify('IST-1'));
    arkonAc('/uretim-terminali');
    const cark = await screen.findByRole('region', { name: 'İş ve makine çarkı' }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: /İstasyonu değiştir/ })).toBeNull();
    fireEvent.click(within(cark).getByRole('button', { name: /İstasyonlar · 2/ }));
    expect(within(cark).getByText(/Bu cihazın istasyonu/)).toBeTruthy();
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: istasyonlar' }));
    fireEvent.click(within(cark).getByRole('button', { name: 'Bu istasyona geç' }));
    expect(JSON.parse(window.localStorage.getItem('arkon:station') ?? 'null')).toBe('IST-2');
    await waitFor(() => { expect(screen.getAllByText('IST-2').length).toBeGreaterThan(0); }, { timeout: 10000 });
  }, 40000);

  it('793 b: yalnız kendi istasyonu olan operatörde İstasyonlar şeridi yok (reddedilen)', async () => {
    telefon();
    const ikiIstasyon = { ...TESIS, sts: [...TESIS.sts, { id: 'IST-2', name: 'Deneme ikinci tezgah', wc: 'TAL', t: 'cnc' }] };
    sunucuKur(ISTASYONLU, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 7, govde: { v: ikiIstasyon } }] } });
    arkonAc('/uretim-terminali');
    await screen.findByRole('group', { name: 'İş eylemleri' }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: /İstasyonlar ·/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bu istasyona geç' })).toBeNull();
  }, 40000);

  // 820 b: Menü'den öteki Arkon sayfalarına geçiş; satır yalnız sayfayı açabilene görünür (yetki genişlemez).
  const menuAc = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Menü' }, { timeout: 10000 }));
    return screen.findByRole('dialog', { name: 'Menü' });
  };
  const GECIS_ADLARI = [/Kalite istasyonu/, /Üretim Terminali Hazırlık/, /^Çizim/, /^Kuyruk/];

  it('820 b: yönetici Menü\'den Kalite, Hazırlık, Çizim ve Kuyruk\'a geçer', async () => {
    telefon();
    sunucuKur({ ...YONETICI, istasyon: 'IST-1' }, sunucu());
    arkonAc('/uretim-terminali');
    const menu = await menuAc();
    for (const ad of GECIS_ADLARI) expect(within(menu).getByRole('button', { name: ad })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: /Kalite istasyonu/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/arkon/kalite'); });
  }, 40000);

  it('820 b: amir yalnız açabildiği Kalite ve Kuyruk\'u görür; Hazırlık ve Çizim yok (reddedilen)', async () => {
    telefon();
    sunucuKur({ rol: 'lead', istasyon: 'IST-1', kullanici: { id: 6, ad: 'Deneme Amir', islemler: ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk', 'arkon.amir', YENI_EKRAN_ISLEMI] } }, sunucu());
    arkonAc('/uretim-terminali');
    const menu = await menuAc();
    expect(within(menu).getByRole('button', { name: /Kalite istasyonu/ })).toBeTruthy();
    expect(within(menu).queryByRole('button', { name: /Üretim Terminali Hazırlık/ })).toBeNull();
    expect(within(menu).queryByRole('button', { name: /^Çizim/ })).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: /^Kuyruk/ }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/kuyruk'); });
  }, 40000);

  it('820 b: operatörde geçiş satırı yok; CORE işlemi olmayan sayfa Arkon yetkisi olsa da gösterilmez (reddedilen)', async () => {
    telefon();
    // Arkon yetkisi Kalite'yi açsa da TMI menü işlemi (arkon.kalite) yok: satır çıkmaz.
    sunucuKur(ISTASYONLU, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { operator: ['page.op', 'page.quality', 'prod.run'] } } }]));
    arkonAc('/uretim-terminali');
    const menu = await menuAc();
    expect(within(menu).getByRole('button', { name: /Vardiya özeti/ })).toBeTruthy();
    for (const ad of GECIS_ADLARI) expect(within(menu).queryByRole('button', { name: ad })).toBeNull();
  }, 40000);

  it('üretim yetkisi olmayan kişide eylem çubuğu yok (reddedilen)', async () => {
    telefon();
    sunucuKur(ISTASYONLU, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { operator: ['page.op'] } } }]));
    arkonAc('/uretim-terminali');
    expect(await screen.findByText('Bu rol üretim kaydı yapamaz', undefined, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'İş eylemleri' })).toBeNull();
  }, 40000);
});

describe('A1 Kaliteye numune penceresi (A4 NumunePenceresi)', () => {
  it('kontrol planı varsa gönderir ve kapanır; plan yoksa ya da önceki numune bekliyorsa düğme kapalı', async () => {
    const gonder = vi.fn(), kapat = vi.fn();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: true, bekliyor: false, gonder }} kapat={kapat} />);
    const pencere = await screen.findByRole('dialog', { name: 'Kaliteye numune · IST-1' }, { timeout: 10000 });
    fireEvent.click(within(pencere).getByRole('button', { name: /Numune gönder/ }));
    expect(gonder).toHaveBeenCalledTimes(1);
    expect(kapat).toHaveBeenCalled();
    cleanup();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: false, bekliyor: false, gonder }} kapat={kapat} />);
    expect((await screen.findByRole('button', { name: /Numune gönder/ }, { timeout: 10000 })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/kontrol planı yok/)).toBeTruthy();
    cleanup();
    render(<NumunePenceresi istasyon="IST-1" numune={{ hazir: true, bekliyor: true, gonder }} kapat={kapat} />);
    expect((await screen.findByRole('button', { name: /Numune gönder/ }, { timeout: 10000 })).hasAttribute('disabled')).toBe(true);
    expect(gonder).toHaveBeenCalledTimes(1);
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
    await waitFor(() => { expect(olaylar(istekler).some((e) => e.state === 'running')).toBe(true); }, { timeout: 10000 });
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
    ],
    muafiyetler,
    isEmirleri: [
      { isEmriId: 90, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc }] },
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

  it('eksik maddede çip ve sekme sayıyı gösterir; liste bu iş emrinin satırıdır; Başlat açık kalır; Sorumluya haber ver çağrı açar', async () => {
    const { istekler, okunan } = kur(cevap('eksik'));
    const d = await ekran();
    const cip = await within(d).findByRole('button', { name: 'Hazırlık listesi: Hazırlık · 1 eksik' }, { timeout: 10000 });
    expect(okunan.length).toBeGreaterThan(0);
    expect(within(screen.getByRole('group', { name: 'İş durumu' })).getByRole('button', { name: /Başlat/ }).getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(cip);
    const l = await screen.findByRole('region', { name: 'Hazırlık' });
    const satirlar = within(l).getAllByRole('listitem');
    expect(satirlar.map((x) => x.getAttribute('data-hal'))).toEqual(['eksik', 'bilinmiyor', 'gerekmez']);
    expect(within(satirlar[0]!).getByText('CNC kurulumu')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('bu iş emri')).toBeTruthy();
    expect(within(l).queryByRole('button', { name: /muaf tut/i })).toBeNull();
    fireEvent.click(within(satirlar[0]!).getByRole('button', { name: /Sorumluya haber ver/ }));
    await waitFor(() => {
      const c = istekler.filter((i) => i.yol === '/arkon/kayitlar/calls/ekle').flatMap((i) => (i.govde as { satirlar?: { team?: string; note?: string }[] }).satirlar ?? []);
      expect(c.some((x) => x.team === 'amir' && x.note === 'Hazırlık eksik: CNC kurulumu')).toBe(true);
    }, { timeout: 10000 });
  }, 40000);

  it('muaf madde kişi, zaman ve gerekçeyle görünür; çip muafiyetle hazır der', async () => {
    kur(cevap('muaf', [{ madde: 'cnc', isEmriId: 90, kisiId: 3, kisiAdi: 'Deneme Müdür', gerekce: 'Program tezgâhta doğrulandı.', zaman: '2026-11-04T08:40:00.000Z' }]));
    const d = await ekran();
    fireEvent.click(await within(d).findByRole('button', { name: 'Hazırlık listesi: Hazır · muafiyetle' }, { timeout: 10000 }));
    const l = await screen.findByRole('region', { name: 'Hazırlık' });
    expect(within(l).getByText(/Müdür muaf tuttu · Deneme Müdür/)).toBeTruthy();
    expect(within(l).getByText(/Gerekçe: Program tezgâhta doğrulandı\./)).toBeTruthy();
    expect(within(l).queryByRole('button', { name: /Sorumluya haber ver/ })).toBeNull();
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
        return new Response(JSON.stringify({ kartlar: [{ id: 4, uretimEmriId: 8, etiket: 'UE-DENEME-8-P4', lotNo: 'LT-1', malzemeKod: null, malzemeAd: null, birim: null, verilen: '10', istasyondaSatirVar: true, sayilan: null, sinir: null }] }), { status: 200 });
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
});

// 2928 a, 2933 a: stok.istek olan operatörde okutulan kart önce bu istasyona gelen teslimleri alır; iş yalnız belirsizlik yoksa açılır.
describe('A1 Üretim Terminali kart okutma: teslim al ve iş aç (2928 a)', () => {
  const okut = (kod: string) => { for (const c of [...kod, 'Enter']) fireEvent.keyDown(document.body, { key: c }); };
  const STOKLU: Deneme = { ...ISTASYONLU, kullanici: { ...ISTASYONLU.kullanici, islemler: [...ISTASYONLU.kullanici.islemler, 'stok.istek'] } };
  const paket = (id: string, no: string, emirId: number, opNo: number, ek: Record<string, unknown> = {}) => ({ ...PAKET, id, no, tmi: { emirId, opNo }, ...ek });
  const teslim = (malzemeId: number, id = 70, istasyonId = 4) => ({ id, no: `TS-0000${id}`, malzemeId, miktar: '5', surum: 1, hedef: { konumId: 1, kod: `IST-${istasyonId}`, ad: null, istasyonId } });
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
  const coz = (k: Record<string, unknown>, malzemeId: number, gelenler = [teslim(malzemeId)]) => ({ tur: 'malzeme', malzeme: { id: 1, kod: null, ad: null, birim: 'adet' }, parti: null, yerler: [], refakat: k, gelenler, kartSatirlari: [] });

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
