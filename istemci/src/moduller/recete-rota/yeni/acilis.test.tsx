import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from './test-ortak.tsx';

// Genel arama ve komutların açtığı adresler (kart #1241, 1230 a): `?kayit=` seçili kaydı, `?yeni=` bölümün yeni kayıt penceresini açar.
// Pencere yalnız düğmesini gören kişiye açılır; yazma yine pencerenin ucundadır.
vi.mock('../../../ortak/rota/cerceve-sayaclari.ts', () => ({ useCerceveSayacYazici: () => () => undefined }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const YAZAN: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'rota.sartname-yaz', 'rota.talimat-yaz'] };
const KUTUPHANE = {
  'GET /rota/sartnameler': () => json(200, { sartnameler: [], kategoriler: [{ id: 1, kod: 'KPL', ad: 'Kaplama', aktif: true }] }),
  'GET /rota/talimat-sablonlari': () => json(200, { sablonlar: [] }),
};

describe('Reçete ve Rota adresle açılış: izinli', () => {
  it('?yeni=1 Ürün ve rotalarda yeni rota panelini açar', async () => {
    sunucuKur(YONETICI);
    rrAc('/recete-rota/schema?yeni=1');
    expect(await screen.findByRole('searchbox', { name: 'Ürün ara' })).toBeTruthy();
  });

  it('?yeni=1 Üretim emirlerinde yeni emir formunu açık getirir', async () => {
    sunucuKur(YONETICI);
    rrAc('/recete-rota?yeni=1');
    expect(await screen.findByRole('button', { name: 'Yeni emir formunu kapat' })).toBeTruthy();
  });

  it('?kayit= seçili emri açar', async () => {
    sunucuKur(YONETICI);
    rrAc('/recete-rota?kayit=61');
    const bolge = await screen.findByRole('region', { name: 'Üretim emirleri' });
    await waitFor(() => { expect(bolge.querySelector('[data-secili]')).not.toBeNull(); });
  });

  it('?yeni=sartname ve ?yeni=talimat kendi sekmesinin yeni penceresini açar', async () => {
    sunucuKur(YAZAN, { yazmalar: KUTUPHANE });
    rrAc('/recete-rota/sartnameler?yeni=sartname');
    expect(await screen.findByRole('dialog', { name: 'Yeni şartname' })).toBeTruthy();
    cleanup();
    sunucuKur(YAZAN, { yazmalar: KUTUPHANE });
    rrAc('/recete-rota/sartnameler?yeni=talimat');
    expect(await screen.findByRole('dialog', { name: 'Yeni talimat şablonu' })).toBeTruthy();
  });
});

describe('Reçete ve Rota adresle açılış: reddedilen', () => {
  it('düğmenin işlemi olmayana pencere açılmaz; bölüm salt okunur açılır', async () => {
    sunucuKur(OKUYAN, { yazmalar: KUTUPHANE });
    rrAc('/recete-rota/schema?yeni=1');
    await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    expect(screen.queryByRole('searchbox', { name: 'Ürün ara' })).toBeNull();
    cleanup();
    sunucuKur(OKUYAN);
    rrAc('/recete-rota?yeni=1');
    await screen.findByRole('region', { name: 'Üretim emirleri' });
    expect(screen.queryByRole('button', { name: /Yeni emir formunu kapat|Yeni üretim emri/ })).toBeNull();
    cleanup();
    sunucuKur(YONETICI, { yazmalar: KUTUPHANE });
    rrAc('/recete-rota/sartnameler?yeni=sartname');
    await screen.findByRole('heading', { name: 'Şartname ve talimatlar', level: 2 });
    expect(screen.queryByRole('dialog', { name: 'Yeni şartname' })).toBeNull();
  });
});
