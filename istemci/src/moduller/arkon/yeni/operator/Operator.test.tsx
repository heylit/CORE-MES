import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NumunePenceresi } from './Pencereler.tsx';
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
    await ekran();
    const cark = await screen.findByRole('region', { name: 'İş ve makine çarkı' }, { timeout: 10000 });
    expect(within(cark).getByText(/Ekranda · sayaç/)).toBeTruthy();
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: işler' }));
    expect(within(cark).getByText(/Önizleme · ekrandaki iş değişmez/)).toBeTruthy();
    expect(screen.getByText(/Önizleme · IE-DENEME-(1|3) · teknik resim ve adımlar salt okunur/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Aktif iş emri' })).toBeNull();
    fireEvent.click(within(cark).getByRole('button', { name: 'Ekrandakine dön' }));
    expect(await screen.findByRole('region', { name: 'Aktif iş emri' })).toBeTruthy();
    expect(screen.queryByText(/teknik resim ve adımlar salt okunur/)).toBeNull();
    const ilk = within(screen.getByRole('region', { name: 'Aktif iş emri' })).getByRole('heading').textContent;
    fireEvent.click(within(cark).getByRole('button', { name: 'Sonraki: işler' }));
    fireEvent.click(within(cark).getByRole('button', { name: 'Bu işe geç' }));
    const yeni = await screen.findByRole('region', { name: 'Aktif iş emri' });
    expect(within(yeni).getByRole('heading').textContent).not.toBe(ilk);
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
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

  it('menüde istasyon değiştirme var; istasyon penceresi açılır', async () => {
    telefon();
    sunucuKur(ISTASYONLU, sunucu());
    arkonAc('/uretim-terminali');
    await screen.findByRole('group', { name: 'İş eylemleri' }, { timeout: 10000 });
    fireEvent.click(screen.getByRole('button', { name: 'Menü' }));
    fireEvent.click(await screen.findByRole('button', { name: /İstasyonu değiştir/ }));
    expect(await screen.findByRole('dialog', { name: /Hangi istasyonda/ })).toBeTruthy();
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
