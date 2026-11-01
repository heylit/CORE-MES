import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { ayarEkranlari } from '../ayar-ekranlari.tsx';
import { firmaEtiketleri } from './akislar.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { skorTonu } from './FinansYeni.tsx';
import { openFindings } from './gorunum.ts';
import { SEKMELER } from './sekmeler.ts';
import { BOLUMSUZ, FIRMACI, finansAc, json, komutToplayici, OKUYAN, sunucuKur, YAZAN, YONETEN, type Istek } from './test-ortak.tsx';
import { finansiKur } from './veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Firma 1'in listede görünen etiketi (aynı adlı iki firma kodla ayrılır).
const MUSTERI = firmaEtiketleri(finansiKur(ornekHamVeri()).V, 'gelir').find((e) => e.includes('M1'))!;

// Bölüm içerikleri parçalarca doldurulur: testler yer tutucu metnine değil, seçili sekmeye ve bölümün çizilmesine bakar.
// Tek bölüm görenlerde sekme şeridi çizilmez; bölüm yine adıyla açılır.
const acikBolum = async (ad: string) => {
  await screen.findByRole('region', { name: ad });
  if (screen.queryByRole('tablist')) expect(screen.getByRole('tab', { selected: true }).textContent).toContain(ad);
};
// Günlük skor açılışta kendiliğinden yazılır; kayıt testleri onu saymaz.
const kayitYazmalari = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST');

// Finans verisinin son okuması şirket adıdır; okununca bölüm veriyle çizilir.
const okundu = async (istekler: readonly Istek[]) => {
  await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
  await acikBolum('Ana sayfa');
};

describe('finans ekranı: adresler ve açılış', () => {
  it('kapı yoktur: sayfa işlemi olan okuyan menünün kökünde açılır; sekmeler ikinci menünün sırasıyla gelir', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans');
    await okundu(istekler);
    expect(screen.queryByText(YENI_EKRAN_ILETISI)).toBeNull();
    // Sekmedeki sayı (kritik öneri) ad sayılmaz.
    const sekmeler = within(screen.getByRole('tablist', { name: 'Finans bölümleri' })).getAllByRole('tab').map((s) => s.textContent?.replace(/\d+ \(\d+\)$/, ''));
    // Okuyan: Genel gider (finans.maliyet-oku) ve Ayarlar (finans.yonet) görünmez.
    expect(sekmeler).toEqual(SEKMELER.filter((s) => !['genel-gider', 'ayarlar'].includes(s.anahtar)).map((s) => s.baslik));
  });

  it('her bölüm menü maddesinin adresinde açılır; sekmeye tıklamak o adrese gider', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/nakit');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    await acikBolum('Nakit planı');
    fireEvent.click(screen.getByRole('tab', { name: /Bütçe/ }));
    await acikBolum('Bütçe');
    expect(screen.getByTestId('adres').textContent).toBe('/finans/butce');
  });

  it.each([
    ['/finans/yeni', '/finans'],
    ['/finans/yeni/kayitlar', '/finans/kayitlar'],
    ['/finans/yeni/firmalar?firma=1', '/finans/firmalar?firma=1'],
    ['/finans/yeni/olmayan', '/finans'],
  ])('deneme adresi %s aynı bölümün adresine düşer (%s)', async (eski, yeni) => {
    sunucuKur(OKUYAN);
    finansAc(eski);
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe(yeni));
  });

  it('menüde olmayan alt adres finans ekranı açmaz', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/olmayan');
    await screen.findByText('Başka sayfa');
  });

  it('Genel gider oranı ekranın sekmesidir: yetkisi olmayana sekme görünmez, adresi açılmaz', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/genel-gider');
    await screen.findByText('Genel gider oranı için yetkiniz yok.');
  });

  it('yalnız firma yetkisi olan Firmalar sekmesine düşer, rakam okunmaz', async () => {
    const istekler = sunucuKur(FIRMACI);
    finansAc();
    await acikBolum('Firmalar');
    expect(screen.getByTestId('adres').textContent).toBe('/finans/firmalar');
    expect(istekler.some((i) => i.yol === '/finans/belgeler')).toBe(false);
  });

  it('hiçbir bölümün işlemi yoksa ekran açılmaz, nedeni yazılır', async () => {
    const istekler = sunucuKur(BOLUMSUZ);
    finansAc();
    await screen.findByText('Finans bölümünü görme yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
  });

  it('yetkisi olmayan bölüm adresi açılmaz', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/ayarlar');
    await screen.findByText('Ayarlar için yetkiniz yok.');
  });
});

describe('yeni finans ekranı: Kayıt gir', () => {
  it('finans.yaz yoksa "Kayıt gir" görünmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await okundu(istekler);
    expect(screen.queryByRole('button', { name: /Kayıt gir/ })).toBeNull();
  });

  it('finans.yaz varsa görünür; olay seçilir, form doğru uca tek komut gönderir', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/belgeler/ekle': () => json(200, { belge: {} }) });
    finansAc();
    await okundu(istekler);
    const dugme = await screen.findByRole('button', { name: /Kayıt gir/ });
    await waitFor(() => expect((dugme as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme);
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText('Ne oldu?')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: /Satış yaptım/ }));
    const form = screen.getByRole('dialog');
    fireEvent.change(within(form).getByLabelText(/Müşteri/), { target: { value: MUSTERI } });
    fireEvent.change(within(form).getByLabelText(/^Tutar/), { target: { value: '1000' } });
    fireEvent.click(within(form).getByRole('button', { name: /Satışı kaydet/ }));
    await waitFor(() => expect(kayitYazmalari(istekler)).toHaveLength(1));
    const yazma = kayitYazmalari(istekler)[0]!;
    expect(yazma.yol).toBe('/finans/belgeler/ekle');
    expect(yazma.govde).toMatchObject({ yon: 'gelir', tur: 'fatura', firmaId: 1, tutar: 1000, paraBirimi: 'TRY' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('eksik girişte uca gitmez, nedenini formda söyler', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await okundu(istekler);
    const dugme = await screen.findByRole('button', { name: /Kayıt gir/ });
    await waitFor(() => expect((dugme as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme);
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Satış yaptım/ }));
    const form = screen.getByRole('dialog');
    fireEvent.click(within(form).getByRole('button', { name: /Satışı kaydet/ }));
    await within(form).findByText(/Firmayı listeden seçin/);
    expect(kayitYazmalari(istekler)).toEqual([]);
  });
});

// 1456 b: günlük skoru sunucu zamanlayıcısı yazar; ekran açılışta yazmaz, kayıtları yalnız okur.
describe('yeni finans ekranı: günlük skor', () => {
  it('yazma yetkisi olan açınca skor yazılmaz', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await okundu(istekler);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('yalnız okuyan açınca skor yazılmaz', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await okundu(istekler);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });
});

describe('finans ekranı: Ctrl K komutları', () => {
  const basliklar = (l: readonly { baslik: string }[]) => l.map((k) => k.baslik);

  it('yazana kayıt olayları, bölümler, Excel ve cari işlemleri listelenir; seçilen olay kayıt penceresini o olayla açar', async () => {
    const t = komutToplayici();
    const istekler = sunucuKur(YAZAN);
    finansAc('/finans/durum', t.yaz);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    await waitFor(() => expect(basliklar(t.liste())).toContain('Kayıt gir: Satış yaptım'));
    const l = basliklar(t.liste());
    expect(l.slice(0, 2)).toEqual(['Kayıt gir: Satış yaptım', 'Kayıt gir: Müşteriden para geldi']);
    expect(l).toEqual(expect.arrayContaining(['Kayıtlar', 'Nakit planı', "Kayıtları Excel'e aktar", 'Raporu yazdır / PDF', `${MUSTERI}: tahsilat gir`, 'Deneme Tedarik: ödeme gir']));
    // Açık bölüme git komutu, yetkisi olmayan bölüm ve müşteriye ödeme komutu yoktur.
    expect(l).not.toContain('Durum ve öneriler');
    expect(l).not.toContain('Ayarlar');
    expect(l).not.toContain(`${MUSTERI}: ödeme gir`);
    act(() => { t.liste().find((k) => k.baslik === 'Kayıt gir: Müşteriden para geldi')!.calistir(); });
    const form = await screen.findByRole('dialog');
    expect(within(form).getByRole('form', { name: 'Müşteriden para geldi' })).toBeTruthy();
  });

  it('cari tahsilat komutu formu firmayla açar; bölüm komutu adrese gider', async () => {
    const t = komutToplayici();
    const istekler = sunucuKur(YAZAN);
    finansAc('/finans', t.yaz);
    await okundu(istekler);
    await waitFor(() => expect(basliklar(t.liste())).toContain(`${MUSTERI}: tahsilat gir`));
    act(() => { t.liste().find((k) => k.baslik === `${MUSTERI}: tahsilat gir`)!.calistir(); });
    const form = await screen.findByRole('dialog');
    expect((within(form).getByLabelText(/Kimden geldi/) as HTMLInputElement).value).toBe(MUSTERI);
    fireEvent.click(within(form).getByRole('button', { name: 'Vazgeç' }));
    act(() => { t.liste().find((k) => k.baslik === 'Çek ve senet')!.calistir(); });
    await acikBolum('Çek ve senet');
    expect(screen.getByTestId('adres').textContent).toBe('/finans/cekler');
  });

  it('yalnız okuyana yazma komutu çıkmaz; yazdır yalnız rapor bölümünde', async () => {
    const t = komutToplayici();
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/kayitlar', t.yaz);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    await waitFor(() => expect(basliklar(t.liste())).toContain("Kayıtları Excel'e aktar"));
    const l = basliklar(t.liste());
    expect(l.some((b) => b.startsWith('Kayıt gir'))).toBe(false);
    expect(l.some((b) => b.endsWith('tahsilat gir') || b.endsWith('ödeme gir'))).toBe(false);
    expect(l).not.toContain('Raporu yazdır / PDF');
    expect(l).toContain(MUSTERI);
  });

  it('yalnız firma yetkisi olana yalnız açabildiği bölüm kalır, rakamlı komut çıkmaz', async () => {
    const t = komutToplayici();
    sunucuKur(FIRMACI);
    finansAc('/finans/firmalar', t.yaz);
    await acikBolum('Firmalar');
    expect(basliklar(t.liste())).toEqual([]);
  });
});

describe('finans ekranı: N kısayolu', () => {
  const n = (hedef: EventTarget = document.body) => { act(() => { hedef.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })); }); };

  it('yazan N ile "Ne oldu?" seçicisini açar', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await okundu(istekler);
    await waitFor(() => expect((screen.getByRole('button', { name: /Kayıt gir/ }) as HTMLButtonElement).disabled).toBe(false));
    n();
    expect(within(await screen.findByRole('dialog')).getByText('Ne oldu?')).toBeTruthy();
  });

  it('yazı alanında, Ctrl ile ya da açık pencerede N seçici açmaz', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc('/finans/kayitlar');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    const arama = await screen.findByLabelText('Kayıtlarda ara');
    n(arama);
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    n();
    await screen.findByRole('dialog');
    n();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('yalnız okuyanda N bir şey açmaz', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await okundu(istekler);
    n();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('finans ekranı: skor ve kritik öneri rozeti', () => {
  const ornek = finansiKur(ornekHamVeri());
  const A = ornek.motor.runAnalysis();
  const kritik = openFindings(ornek.motor, A).filter((f) => f.sev === 3).length;

  it('başlıkta sağlık skoru notuyla durur ve Durum ve öneriler\'e götürür; kritik öneri sayısı o sekmededir', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/kayitlar');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    const bag = await screen.findByRole('link', { name: new RegExp(`Sağlık skoru ${A.score}`) });
    expect(bag.textContent).toContain(A.grade);
    expect(kritik).toBeGreaterThan(0);
    const durum = screen.getByRole('tab', { name: new RegExp('Durum ve öneriler') });
    expect(durum.textContent).toContain(`(${kritik})`);
    expect(screen.getByRole('tab', { name: /Kayıtlar/ }).textContent).not.toMatch(/\(\d+\)/);
    fireEvent.click(bag);
    await acikBolum('Durum ve öneriler');
  });

  it('skor yüzdelik notu prototip eşikleriyle tonlanır', () => {
    expect([skorTonu(65), skorTonu(64), skorTonu(50), skorTonu(49)]).toEqual(['tamam', 'uyari', 'uyari', 'hata']);
  });

  it('rakam yetkisi olmayana skor gösterilmez', async () => {
    sunucuKur(FIRMACI);
    finansAc();
    await acikBolum('Firmalar');
    expect(screen.queryByRole('link', { name: /Sağlık skoru/ })).toBeNull();
  });
});

describe('finans ekranı: kurulum uyarısı', () => {
  const kurulmamis = () => { const h = ornekHamVeri(); h.ayar = { ...h.ayar, kurulumTamam: false }; return h; };

  it('kurulum yapılmadıysa Plan bölümlerinde uyarı çıkar; yöneten Ayarlar > İlk kurulum\'a gider', async () => {
    const istekler = sunucuKur(YONETEN, {}, kurulmamis());
    finansAc('/finans/butce');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    const uyari = await screen.findByText(/Finans ilk kurulumu yapılmadı/);
    fireEvent.click(within(uyari.parentElement!).getByRole('button', { name: "Ayarlar'da tamamla" }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/finans/ayarlar?sekme=kurulum'));
  });

  it('yönetmeyene kimin tamamlayacağı yazılır; kurulum yapıldıysa ya da Plan dışı bölümde uyarı yoktur', async () => {
    const istekler = sunucuKur(OKUYAN, {}, kurulmamis());
    finansAc('/finans/vergi');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    await screen.findByText("Finans yöneticisi Ayarlar'dan tamamlar.");
    cleanup();
    sunucuKur(OKUYAN, {}, kurulmamis());
    finansAc('/finans/kayitlar');
    await screen.findByRole('button', { name: "Excel'e aktar" });
    expect(screen.queryByText(/Finans ilk kurulumu yapılmadı/)).toBeNull();
    cleanup();
    const i2 = sunucuKur(OKUYAN);
    finansAc('/finans/nakit');
    await waitFor(() => expect(i2.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
    await acikBolum('Nakit planı');
    expect(screen.queryByText(/Finans ilk kurulumu yapılmadı/)).toBeNull();
  });
});

describe('Sistem Ayarları > Finans ve Muhasebe', () => {
  const ayarAc = () => {
    const Ekran = ayarEkranlari[0]!.ekran;
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/ayarlar']}><Ekran /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  };

  it('ekranın Ayarlar bölümünü çerçevesiz açar; görünürlük finans.yonet ile kalır', async () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem])).toEqual([['finans', 'finans.yonet']]);
    sunucuKur(YONETEN);
    ayarAc();
    expect(await screen.findByRole('tablist', { name: 'Ayar bölümleri' })).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Finans bölümleri' })).toBeNull();
  });

  it('finans okuma yetkisi yoksa veri okunmaz, nedeni yazılır', async () => {
    const istekler = sunucuKur(FIRMACI);
    ayarAc();
    await screen.findByText('Finans ayarları için finans okuma yetkisi gerekir.');
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
  });
});

describe('finans ekranı: menü sayaçları sekmelerde', () => {
  it('kabuk şeridinin sayıları aynı uçtan sekmelere yazılır; boş (null) sayı rozet çizmez', async () => {
    const istekler = sunucuKur(OKUYAN, { 'GET /finans/menu-sayaclari': () => json(200, { firmalar: 3, cekler: null }) });
    finansAc('/finans/kayitlar');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Firmalar/ }).textContent).toContain('(3)'));
    expect(screen.getByRole('tab', { name: /Çek ve senet/ }).textContent).not.toMatch(/\(\d+\)/);
    expect(istekler.filter((i) => i.yol === '/finans/menu-sayaclari' && i.yontem === 'GET').length).toBeGreaterThan(0);
  });

  it('sayaç okunamazsa sekmeler sayısız açılır', async () => {
    sunucuKur(OKUYAN, { 'GET /finans/menu-sayaclari': () => json(500, { kod: 'HATA', mesaj: 'x' }) });
    finansAc('/finans/kayitlar');
    await acikBolum('Kayıtlar');
    expect(screen.getByRole('tab', { name: /Firmalar/ }).textContent).not.toMatch(/\(\d+\)/);
  });

  it('tek bölüm görene (şerit yok) sayaç okunmaz', async () => {
    const istekler = sunucuKur(FIRMACI);
    finansAc('/finans/firmalar');
    await acikBolum('Firmalar');
    expect(istekler.some((i) => i.yol === '/finans/menu-sayaclari')).toBe(false);
  });
});
