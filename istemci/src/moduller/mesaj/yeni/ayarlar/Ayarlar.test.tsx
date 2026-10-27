import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, mesajAc, sunucuKur } from '../test-ortak.tsx';
import { takvimimMetni } from './takvim-dosyasi.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SAAT = 3_600_000;

function ac(ben = YAZAN, ek: Record<string, Record<string, unknown>> = {}) {
  const s = sunucuKur({
    ben,
    belgeler: {
      ...ornekBelgeler(),
      'kurallar/r2': { type: 'appr_wait', cid: 'uretim', params: { hours: 6 }, on: false, by: BEN, createdAt: 2 },
      'kurallar/r3': { type: 'order_new', cid: 'genel', params: {}, on: true, by: BEN, createdAt: 3 },
      'zamanli/z1': { cid: 'genel', by: BEN, text: 'Haftalık not', sendAt: Date.now() + SAAT, repeat: 'weekly', ann: true, status: 'bekliyor', createdAt: 1 },
      'zamanli/z2': { cid: 'genel', by: KISI_A, text: 'Başkasının notu', sendAt: Date.now() + 2 * SAAT, status: 'bekliyor', createdAt: 1 },
      ...ek,
    },
  });
  mesajAc('/mesaj/yeni/ayarlar');
  return s;
}

describe('M3 Ayarlar ve otomasyon', () => {
  it('bölümler gelir; e-posta, cihaz bildirimi ve içe aktarma yoktur (208 a, 212 a)', async () => {
    ac();
    expect(await screen.findByRole('heading', { name: 'Bildirim ve hatırlatmalar' })).toBeTruthy();
    for (const b of ['Telefon ve takvim senkronu', 'Zamanlanmış mesajlar', 'Otomatik uyarılar', 'ERP ve MES bağlantısı']) expect(screen.getByRole('heading', { name: b })).toBeTruthy();
    expect(screen.queryByText(/E-posta/)).toBeNull();
    expect(screen.queryByText(/Cihaz bildirimleri/)).toBeNull();
    expect(screen.queryByText(/içe aktar/i)).toBeNull();
  });

  it('zamanlanmış mesaj satırı zamanı, kanalı, tekrarı ve duyuru işaretini gösterir; düzenle zamanla formunu açar', async () => {
    ac();
    const z = within(await screen.findByText('Haftalık not').then((e) => e.closest('li') as HTMLElement));
    expect(z.getByText('Duyuru')).toBeTruthy();
    expect(z.getByText('#genel')).toBeTruthy();
    expect(z.getByText('Her hafta')).toBeTruthy();
    fireEvent.click(z.getByRole('button', { name: 'Düzenle' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('başkasının zamanlanmış mesajında düzenle ve iptal yok (reddedilen); yönetici görür (izinli)', async () => {
    ac();
    const satir = await screen.findByText('Başkasının notu').then((e) => e.closest('li') as HTMLElement);
    expect(within(satir).queryByRole('button', { name: 'İptal et' })).toBeNull();
    cleanup();
    ac(YONETICI);
    const satir2 = await screen.findByText('Başkasının notu').then((e) => e.closest('li') as HTMLElement);
    expect(within(satir2).getByRole('button', { name: 'İptal et' })).toBeTruthy();
  });

  it('kendi zamanlanmış mesajını onayla iptal eder (silme)', async () => {
    const s = ac();
    const satir = await screen.findByText('Haftalık not').then((e) => e.closest('li') as HTMLElement);
    fireEvent.click(within(satir).getByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'Zamanlanmış mesaj iptal edilsin mi?' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => { expect(s.belgeler.has('zamanli/z1')).toBe(false); });
    expect(await screen.findByText('İptal edildi.')).toBeTruthy();
  });

  it('kendi uyarısını açıp kapar ve siler; başkasının uyarısında işlem yok (225 a)', async () => {
    const s = ac();
    const kendi = await screen.findByText('Onay bekletilirse hatırlat').then((e) => e.closest('li') as HTMLElement);
    expect(within(kendi).getByText('6')).toBeTruthy();
    fireEvent.click(within(kendi).getByRole('checkbox', { name: 'Kapalı' }));
    await waitFor(() => { expect(s.belgeler.get('kurallar/r2')?.veri).toMatchObject({ on: true }); });
    const baskasi = screen.getByText('Görev gecikince sorumluyu uyar').closest('li') as HTMLElement;
    expect(within(baskasi).queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(within(baskasi).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(kendi).getByRole('button', { name: 'Sil' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Uyarı silinsin mi?' })).getByRole('button', { name: 'Sil' }));
    await waitFor(() => { expect(s.belgeler.has('kurallar/r2')).toBe(false); });
  });

  it('sipariş verisi bekleyen uyarı işaretlenir; yeni uyarıda bütün türler kurulabilir (838 a)', async () => {
    ac();
    const satir = await screen.findByText('Yeni sipariş açılınca bildir').then((e) => e.closest('li') as HTMLElement);
    expect(within(satir).getByText('Siparişler verisi gelince çalışır')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uyarı ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Otomatik uyarı ekle' });
    for (const t of ['Sipariş hazır olunca haber ver', 'Yeni sipariş açılınca bildir', 'Üretim notunda uyarı kelimesi']) {
      expect(within(pencere).getByText(t)).toBeTruthy();
    }
  });

  it('salt okur kişide yazma düğmeleri yoktur (reddedilen)', async () => {
    ac(OKUYAN);
    await screen.findByRole('heading', { name: 'Otomatik uyarılar' });
    expect(screen.queryByRole('button', { name: 'Mesaj zamanla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uyarı ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
  });

  it('yeni uyarı: önce tür seçilir (bütün türler, 838/1 a), sonra kanal ve parametreyle kaydedilir', async () => {
    const s = ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Uyarı ekle' }));
    const secici = await screen.findByRole('dialog', { name: 'Otomatik uyarı ekle' });
    expect(within(secici).getByText('Yeni sipariş açılınca bildir')).toBeTruthy();
    fireEvent.click(within(secici).getByText('Teslim riskteyse uyar'));
    const form = await screen.findByRole('dialog', { name: 'Teslim riskteyse uyar' });
    expect((within(form).getByLabelText('Hangi kanala?') as HTMLSelectElement).value).toBe('uretim');
    fireEvent.change(within(form).getByLabelText('Teslime kaç gün kala'), { target: { value: '3' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Uyarıyı aç' }));
    await waitFor(() => {
      const yeni = [...s.belgeler.entries()].find(([y, b]) => y.startsWith('kurallar/') && b.veri['type'] === 'order_risk');
      expect(yeni?.[1].veri).toMatchObject({ type: 'order_risk', cid: 'uretim', params: { days: 3, pct: 80 }, on: true, by: BEN });
    });
    expect(await screen.findByText('Otomatik uyarı kaydedildi.')).toBeTruthy();
  });

  it('uyarı düzenlemesi yalnız kanalı ve parametreleri birleştirir', async () => {
    const s = ac();
    const kendi = await screen.findByText('Onay bekletilirse hatırlat').then((e) => e.closest('li') as HTMLElement);
    fireEvent.click(within(kendi).getByRole('button', { name: 'Düzenle' }));
    const form = await screen.findByRole('dialog', { name: 'Onay bekletilirse hatırlat' });
    fireEvent.change(within(form).getByLabelText('Kaç saat sonra'), { target: { value: '48' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(s.belgeler.get('kurallar/r2')?.veri).toMatchObject({ cid: 'uretim', params: { hours: 48 }, on: false }); });
    const yazma = s.yazmalar.find((y) => y.govde['yol'] === 'kurallar/r2');
    expect(yazma?.govde).toMatchObject({ kip: 'birlestir', veri: { cid: 'uretim', params: { hours: 48 } } });
  });

  it('sesli hatırlatma tercihi kişinin tercih belgesine yazılır', async () => {
    const s = ac();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sesli hatırlatma' }));
    await waitFor(() => { expect(s.belgeler.get(`data/users/${BEN}/prefs`)?.veri).toMatchObject({ notif: { sound: false } }); }, { timeout: 4000 });
  });

  it('dışa aktarma CSV dosyası indirir', async () => {
    const adres = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: adres, revokeObjectURL: vi.fn() }));
    const tik = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Görevleri dışa aktar/ }));
    expect(adres).toHaveBeenCalledTimes(1);
    expect(tik).toHaveBeenCalledTimes(1);
    tik.mockRestore();
  });
});

describe('takvim dosyası', () => {
  it('yaklaşan toplantı ve görevler hatırlatmalarıyla; aktarılacak yoksa null', () => {
    const simdi = Date.now();
    const metin = takvimimMetni({
      ben: BEN, ad: () => 'Örnek', simdi,
      toplantilar: [{ id: 'm1', surum: 1, title: 'Toplantı; özet', start: simdi + SAAT, dur: 30, remind: 10, by: KISI_A, attendees: [BEN], createdAt: 0 }],
      gorevler: [{ id: 't1', surum: 1, title: 'İş', to: BEN, by: KISI_A, status: 'todo', due: simdi + SAAT, createdAt: 0 }],
    });
    expect(metin).toContain('BEGIN:VCALENDAR');
    expect(metin).toContain('SUMMARY:Toplantı\\; özet');
    expect(metin).toContain('TRIGGER:-PT10M');
    expect(metin).toContain('UID:tt1@mesai');
    expect(takvimimMetni({ ben: BEN, ad: () => '', simdi, toplantilar: [], gorevler: [] })).toBeNull();
  });
});

describe('eski CSV biçimi (838/4 a)', () => {
  it('noktalı virgül, BOM, yalnız gerekince tırnak; sayı olduğu gibi; boş değer boş', async () => {
    const { eskiCsv } = await import('./csv.ts');
    expect(eskiCsv(['A', 'B'], [['x;y', 2.5], [null, 'a"b']])).toBe('﻿A;B\r\n"x;y";2.5\r\n;"a""b"');
  });
});
