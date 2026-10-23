import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { firmaEtiketleri } from './akislar.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { SEKMELER } from './sekmeler.ts';
import { FIRMACI, finansAc, json, KAPISIZ, OKUYAN, sunucuKur, YAZAN } from './test-ortak.tsx';
import { finansiKur } from './veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Firma 1'in listede görünen etiketi (aynı adlı iki firma kodla ayrılır).
const MUSTERI = firmaEtiketleri(finansiKur(ornekHamVeri()).V, 'gelir').find((e) => e.includes('M1'))!;

const okundu = () => waitFor(() => expect(screen.getByText(/Ana sayfa: bu bölüm yeni ekranda hazırlanıyor/)).toBeTruthy());

describe('yeni finans ekranı: kapı', () => {
  it('kapı işlemi olmayana yeni ekran açılmaz, finans verisi okunmaz', async () => {
    const istekler = sunucuKur(KAPISIZ);
    finansAc();
    await screen.findByText(YENI_EKRAN_ILETISI);
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('kapı işlemi olana açılır; sekmeler ikinci menünün sırasıyla gelir', async () => {
    sunucuKur(OKUYAN);
    finansAc();
    await okundu();
    const sekmeler = within(screen.getByRole('tablist', { name: 'Finans bölümleri' })).getAllByRole('tab').map((s) => s.textContent);
    // Okuyan: Genel gider (finans.maliyet-oku) ve Ayarlar (finans.yonet) görünmez.
    expect(sekmeler).toEqual(SEKMELER.filter((s) => !['genel-gider', 'ayarlar'].includes(s.anahtar)).map((s) => s.baslik));
  });

  it('yalnız firma yetkisi olan Firmalar sekmesine düşer, rakam okunmaz', async () => {
    const istekler = sunucuKur(FIRMACI);
    finansAc();
    await screen.findByText(/Firmalar: bu bölüm yeni ekranda hazırlanıyor/);
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
    sunucuKur(OKUYAN);
    finansAc();
    await okundu();
    expect(screen.queryByRole('button', { name: /Kayıt gir/ })).toBeNull();
  });

  it('finans.yaz varsa görünür; olay seçilir, form doğru uca tek komut gönderir', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/belgeler/ekle': () => json(200, { belge: {} }) });
    finansAc();
    await okundu();
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
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    const yazma = istekler.find((i) => i.yontem === 'POST')!;
    expect(yazma.yol).toBe('/finans/belgeler/ekle');
    expect(yazma.govde).toMatchObject({ yon: 'gelir', tur: 'fatura', firmaId: 1, tutar: 1000, paraBirimi: 'TRY' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('eksik girişte uca gitmez, nedenini formda söyler', async () => {
    const istekler = sunucuKur(YAZAN);
    finansAc();
    await okundu();
    const dugme = await screen.findByRole('button', { name: /Kayıt gir/ });
    await waitFor(() => expect((dugme as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme);
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Satış yaptım/ }));
    const form = screen.getByRole('dialog');
    fireEvent.click(within(form).getByRole('button', { name: /Satışı kaydet/ }));
    await within(form).findByText(/Firmayı listeden seçin/);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });
});
