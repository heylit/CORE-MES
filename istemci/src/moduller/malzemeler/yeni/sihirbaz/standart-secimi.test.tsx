import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, json, sunucuKur, yeniEkranAc, type Istek } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

// Adlar sentetiktir: gerçek EN-ASTM listesi kullanıcıdan gelir (2117-2).
const ESLI = { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, malzeme: { surum: 1, standartAdlari: { 'Islah (+QT)': { astm: 'QT-A', en: 'QT-E' } } } }) };
const SALT_OKUR = { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, rol: 'talep', ayarYazabilir: false }) };

async function durumAdiminiAc() {
  yeniEkranAc('/malzemeler/yeni?kart=mornek1');
  await screen.findByRole('heading', { name: 'Özet ve kayıt' });
  fireEvent.click(screen.getByRole('button', { name: /Durum ve işlem/ }));
  return screen.findByRole('searchbox', { name: 'Durum ve işlemde ara' });
}

describe('2117 EN / ASTM adları: kart açan ekran', () => {
  test('üst baştaki seçim hangi adın önce geldiğini belirler; seçim kişide kalır', async () => {
    sunucuKur(YAZAN, ESLI);
    await durumAdiminiAc();
    expect(screen.getByRole('radio', { name: 'QT-A (QT-E)' })).toBeTruthy();
    const grup = screen.getByRole('group', { name: 'Durum ve işlem adlarında standart' });
    fireEvent.click(within(grup).getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('radio', { name: 'QT-E (QT-A)' })).toBeTruthy();
    expect(localStorage.getItem('tmi-malzemeler-standart')).toBe('"en"');
    fireEvent.click(within(grup).getByRole('button', { name: 'ASTM' }));
    expect(await screen.findByRole('radio', { name: 'QT-A (QT-E)' })).toBeTruthy();
  });

  test('arama kutusu durum ve işlem seçeneklerini eşli adla da süzer; uyan yoksa söyler', async () => {
    sunucuKur(YAZAN, ESLI);
    const ara = await durumAdiminiAc();
    expect(screen.getByRole('radio', { name: 'Normalize (+N)' })).toBeTruthy();
    fireEvent.change(ara, { target: { value: 'qt-e' } });
    expect(screen.getByRole('radio', { name: 'QT-A (QT-E)' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Normalize (+N)' })).toBeNull();
    fireEvent.change(ara, { target: { value: 'yok-boyle-bir-ad' } });
    expect(screen.getByText('Aramaya uyan seçenek yok.')).toBeTruthy();
  });
});

async function durumListesiniAc() {
  yeniEkranAc('/malzemeler/ayarlar');
  const menu = await screen.findByRole('navigation', { name: 'Malzeme ayarları bölümleri' });
  fireEvent.click(within(menu).getByRole('button', { name: 'Durum ve işlem seçenekleri' }));
  await screen.findByRole('heading', { name: 'Durum ve işlem seçenekleri' });
  fireEvent.click(screen.getByText('Isıl işlem / temper durumu'));
  return screen.findByRole('searchbox', { name: 'Isıl işlem / temper durumu: listede ara' });
}

describe('2117 EN / ASTM adları: Ayarlar', () => {
  test('yönetici değerin ASTM ve EN adını yazar; ayar kaydında gider, listede görünür ve aranır (izinli)', async () => {
    const istekler: Istek[] = sunucuKur(YONETICI, { 'POST /malzeme-katalogu-ayarlari/malzeme/kaydet': () => json(200, { surum: 4 }) });
    const ara = await durumListesiniAc();
    fireEvent.click(screen.getByRole('button', { name: 'Islah (+QT): ASTM ve EN adı' }));
    fireEvent.change(screen.getByLabelText('Islah (+QT): ASTM adı'), { target: { value: 'QT-A' } });
    fireEvent.change(screen.getByLabelText('Islah (+QT): EN adı'), { target: { value: 'QT-E' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/malzeme-katalogu-ayarlari/malzeme/kaydet')).toBe(true); });
    const kayit = istekler.find((i) => i.yol === '/malzeme-katalogu-ayarlari/malzeme/kaydet');
    expect((kayit?.govde as { deger: Record<string, unknown> }).deger['standartAdlari']).toEqual({ 'Islah (+QT)': { astm: 'QT-A', en: 'QT-E' } });
    expect(await screen.findByText(/ASTM QT-A · EN QT-E/)).toBeTruthy();
    fireEvent.change(ara, { target: { value: 'qt-e' } });
    expect(screen.getByText('Islah (+QT)')).toBeTruthy();
    expect(screen.queryByText('Normalize (+N)')).toBeNull();
  });

  test('ayar yazamayan eşli adı görür ama düzenleme düğmesi yoktur (reddedilen)', async () => {
    sunucuKur(OKUYAN, SALT_OKUR);
    await durumListesiniAc();
    expect(screen.queryByRole('button', { name: /ASTM ve EN adı/ })).toBeNull();
  });
});
