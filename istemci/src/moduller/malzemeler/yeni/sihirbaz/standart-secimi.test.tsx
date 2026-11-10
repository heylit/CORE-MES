import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, json, sunucuKur, yeniEkranAc, type Istek } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

// Ayardaki adlar sentetiktir (taban tablonun üstüne yazar); öteki değerler taban tablodan gelir.
const ESLI = { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, malzeme: { surum: 1, standartAdlari: { 'Islah (+QT)': { astm: 'QT-A', en: 'QT-E' } } } }) };
const SALT_OKUR = { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, rol: 'talep', ayarYazabilir: false }) };

async function durumAdiminiAc() {
  yeniEkranAc('/malzemeler/yeni?kart=mornek1');
  await screen.findByRole('heading', { name: 'Özet ve kayıt' });
  fireEvent.click(screen.getByRole('button', { name: /Durum ve işlem/ }));
  return screen.findByRole('searchbox', { name: 'Durum ve işlemde ara' });
}

describe('2117 EN / ASTM adları: kart açan ekran', () => {
  test('kartın başındaki seçim hangi adın önce geldiğini belirler; seçim kartın kaydındadır (2117-1 b)', async () => {
    sunucuKur(YAZAN, ESLI);
    await durumAdiminiAc();
    expect(screen.getByRole('radio', { name: 'QT-A (QT-E)' })).toBeTruthy();
    // Taban tablodan: ayarda olmayan değer de eşli adla görünür.
    expect(screen.getByRole('radio', { name: 'Normalized (+N)' })).toBeTruthy();
    const grup = screen.getByRole('group', { name: 'Bu kartta durum ve işlem adlarının standardı' });
    expect(within(grup).getByRole('button', { name: 'ASTM' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('radio', { name: 'QT-E (QT-A)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '+N (Normalized)' })).toBeTruthy();
    expect(localStorage.getItem('tmi-malzemeler-standart')).toBeNull();
  });

  test('yalnız standart değişen aktif kart talep olarak gider; ad, kod ve Logo alanları aynı kalır (izinli)', async () => {
    const istekler: Istek[] = sunucuKur(YAZAN, {
      ...ESLI, 'POST /malzeme-katalogu-kartlari/mornek1/kaydet': () => json(200, { id: 'mornek1', stok_kodu: 'HM-MET-C45-0001', surum: 2 }),
    });
    await durumAdiminiAc();
    fireEvent.click(within(screen.getByRole('group', { name: 'Bu kartta durum ve işlem adlarının standardı' })).getByRole('button', { name: 'EN' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Özet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText(/^Değişiklik talebi onaya gönderildi/)).toBeTruthy();
    const govde = istekler.find((i) => i.yontem === 'POST')?.govde as { kayit: Record<string, unknown> & { com: Record<string, unknown>; talep: { yeni: Record<string, unknown> & { com: Record<string, unknown> } } } };
    expect(govde.kayit.talep.yeni.standart).toBe('en');
    expect(govde.kayit.standart).toBeUndefined();
    // Kod aynı; adın standarttan bağımsız olduğu standart-adlari.test.ts'de (Logo ad güncellemesi yalnız ad değişince kuyruğa girer).
    expect(govde.kayit.talep.yeni.com['kod']).toBe(govde.kayit.com['kod']);
  });

  test('aynı standart yeniden seçilirse değişiklik yoktur, istek gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(YAZAN, ESLI);
    await durumAdiminiAc();
    fireEvent.click(within(screen.getByRole('group', { name: 'Bu kartta durum ve işlem adlarının standardı' })).getByRole('button', { name: 'ASTM' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Özet/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByText('Kartta değişiklik yok.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  test('2763: geçiş yalnız çipleri değil, föydeki durum satırını da değiştirir; kart değeri aynı kalır', async () => {
    const istekler: Istek[] = sunucuKur(YAZAN, {
      ...ESLI, 'POST /malzeme-katalogu-kartlari/mornek1/kaydet': () => json(200, { id: 'mornek1', stok_kodu: 'HM-MET-C45-0001', surum: 2 }),
    });
    await durumAdiminiAc();
    fireEvent.click(screen.getByRole('radio', { name: 'QT-A (QT-E)' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Bu kartta durum ve işlem adlarının standardı' })).getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('radio', { name: 'QT-E (QT-A)' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Özet/ }));
    await screen.findByRole('button', { name: 'Değişiklikleri kaydet' });
    expect(screen.getAllByText('QT-E (QT-A)').length).toBeGreaterThan(0);
    expect(screen.queryByText('QT-A (QT-E)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    const govde = istekler.find((i) => i.yontem === 'POST')?.govde as { kayit: { talep?: { yeni: { opts: Record<string, unknown> } }; opts: Record<string, unknown> } };
    expect((govde.kayit.talep?.yeni ?? govde.kayit).opts['durum']).toBe('Islah (+QT)');
  });

  test('arama kutusu durum ve işlem seçeneklerini eşli adla da süzer; uyan yoksa söyler', async () => {
    sunucuKur(YAZAN, ESLI);
    const ara = await durumAdiminiAc();
    fireEvent.change(ara, { target: { value: 'qt-e' } });
    expect(screen.getByRole('radio', { name: 'QT-A (QT-E)' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Normalized (+N)' })).toBeNull();
    fireEvent.change(ara, { target: { value: 'cold drawn' } });
    expect(screen.getByRole('radio', { name: 'Cold drawn (+C)' })).toBeTruthy();
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
