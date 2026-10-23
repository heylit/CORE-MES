import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { firmaEtiketleri } from './akislar.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { SEKMELER } from './sekmeler.ts';
import { FIRMACI, finansAc, json, KAPISIZ, OKUYAN, sunucuKur, YAZAN, type Istek } from './test-ortak.tsx';
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
const kayitYazmalari = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol !== '/finans/skorlar/kaydet');

// Finans verisinin son okuması şirket adıdır; okununca bölüm veriyle çizilir.
const okundu = async (istekler: readonly Istek[]) => {
  await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-ayarlari/sirket-adi')).toBe(true));
  await acikBolum('Ana sayfa');
};

describe('yeni finans ekranı: kapı', () => {
  it('kapı işlemi olmayana yeni ekran açılmaz, finans verisi okunmaz', async () => {
    const istekler = sunucuKur(KAPISIZ);
    finansAc();
    await screen.findByText(YENI_EKRAN_ILETISI);
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('kapı işlemi olana açılır; sekmeler ikinci menünün sırasıyla gelir', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await okundu(istekler);
    const sekmeler = within(screen.getByRole('tablist', { name: 'Finans bölümleri' })).getAllByRole('tab').map((s) => s.textContent);
    // Okuyan: Genel gider (finans.maliyet-oku) ve Ayarlar (finans.yonet) görünmez.
    expect(sekmeler).toEqual(SEKMELER.filter((s) => !['genel-gider', 'ayarlar'].includes(s.anahtar)).map((s) => s.baslik));
  });

  it('yalnız firma yetkisi olan Firmalar sekmesine düşer, rakam okunmaz', async () => {
    const istekler = sunucuKur(FIRMACI);
    finansAc();
    await acikBolum('Firmalar');
    expect(istekler.some((i) => i.yol === '/finans/belgeler')).toBe(false);
  });

  it('yetkisi olmayan bölüm adresi açılmaz', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/yeni/ayarlar');
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

describe('yeni finans ekranı: günlük skor', () => {
  it('yazma yetkisi olan açınca bugünün skoru bir kez kaydedilir', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/skorlar/kaydet': () => json(200, {}) });
    finansAc();
    await okundu(istekler);
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/finans/skorlar/kaydet')).toHaveLength(1));
    const skor = istekler.find((i) => i.yol === '/finans/skorlar/kaydet')!.govde as { gun: string; skor: number; nakit: number };
    expect(skor.skor).toBeGreaterThanOrEqual(0);
    expect(skor.skor).toBeLessThanOrEqual(100);
    expect(typeof skor.nakit).toBe('number');
  });

  it('yalnız okuyan açınca skor yazılmaz', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc();
    await okundu(istekler);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });
});
