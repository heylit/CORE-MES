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
