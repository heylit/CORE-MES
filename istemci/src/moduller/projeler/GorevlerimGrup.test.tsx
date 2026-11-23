import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { GorevlerimCevabi, GorevlerimSatiri } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { hazirlikEmriNo } from './gosterim.ts';
import { ProjeGorevlerim } from './ProjeGorevlerim.tsx';

const satir = (id: number, ad: string, ek: Partial<GorevlerimSatiri> = {}): GorevlerimSatiri => ({
  id, kilometreTasiId: null, ad, aciklama: null, sorumluKisiId: null, sorumluAd: null, planBaslangic: '2026-11-01', planBitis: '2099-12-31',
  gercekBaslangic: null, gercekBitis: null, ilerleme: 0, durum: 'yapilacak', oncekiGorevId: null, asama: null, yapanRolId: 1, yapanRolAd: 'ORN-Rol-Depo',
  kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: null, kontrolRolAd: null, yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null,
  yedekKontrolRolAd: null, onaylandi: false, hazirlikMaddesi: 'malzeme', kanitZorunlu: false, adimToplam: 5, adimYapilan: 0, surum: 1,
  tur: 'rolume', projeId: 1, projeKod: 'ORN-PRJ-1', projeAd: 'ORN', izinler: { gorevi: false, kontrol: false } as unknown as GorevlerimSatiri['izinler'], kademe: null, ...ek,
});

function ac(gorevler: GorevlerimSatiri[]) {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    const govde = yol === '/oturum' ? { kullanici: { id: 1, ad: 'ORN-Kisi', islemler: ['sayfa.proje-gorevlerim'] } } : { gorevler } satisfies GorevlerimCevabi;
    return new Response(JSON.stringify(govde), { status: 200 });
  }));
  render(
    <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><ProjeGorevlerim /></BildirimSaglayici></QueryClientProvider></MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe('hazirlikEmriNo (3611)', () => {
  it('yeni ve eski biçim adından emir no okunur; hazırlık dışı ve biçimsiz ad null', () => {
    expect(hazirlikEmriNo({ hazirlikMaddesi: 'cnc', ad: 'CNC kurulumu · ORN-EMIR-001' })).toBe('ORN-EMIR-001');
    expect(hazirlikEmriNo({ hazirlikMaddesi: 'cnc', ad: 'CNC kurulumu · ORN-EMIR-001 / 10' })).toBe('ORN-EMIR-001');
    expect(hazirlikEmriNo({ hazirlikMaddesi: null, ad: 'Toplantı · ORN-EMIR-001' })).toBeNull();
    expect(hazirlikEmriNo({ hazirlikMaddesi: 'cnc', ad: 'Biçimsiz' })).toBeNull();
  });
});

describe('Görevlerim emre göre gruplama (3611)', () => {
  const liste = () => [
    satir(1, 'Malzeme · ORN-EMIR-001'), satir(2, 'Aparat · ORN-EMIR-001', { planBitis: '2020-01-01' }),
    satir(3, 'Malzeme · ORN-EMIR-002', { durum: 'kontrolde' }), satir(4, 'Proje toplantısı', { hazirlikMaddesi: null, adimToplam: 0 }),
  ];

  it('her emir bir başlık: görev sayısı etiketli, sıfır sayaçlar gizli; hazırlık dışı görev grupsuz', async () => {
    ac(liste());
    expect((await screen.findAllByText(/ORN-EMIR-001/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 görev · 5 iş emri · 1 geciken/)).toBeTruthy();
    expect(screen.getByText(/1 görev · 5 iş emri · 1 kontrol bekliyor/)).toBeTruthy();
    expect(screen.queryByText(/0 geciken/)).toBeNull();
    expect(screen.getAllByRole('button', { expanded: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Proje toplantısı/)).toBeTruthy();
    // Karışık listede sade düzen korunur: sütun kümesi değişmez, hazırlık dışı görevde proje kodu görev hücresindedir.
    expect(screen.queryByRole('columnheader', { name: 'Proje' })).toBeNull();
    expect(screen.getByText(/Proje toplantısı/).textContent).toContain('ORN-PRJ-1');
    expect(screen.getAllByText('Yapan · kontrol').length).toBeGreaterThan(0);
  });

  it('bütün adımları işaretli görev "Adımlar tamam" rozetini alır', async () => {
    ac([satir(1, 'Malzeme · ORN-EMIR-001', { adimYapilan: 5, ilerleme: 100, durum: 'suruyor' })]);
    expect(await screen.findByText('Adımlar tamam')).toBeTruthy();
  });

  it('birden çok emir varken seçim çıkar, kapatınca başlık kalkar ve seçim hatırlanır; tek emirde seçim yok', async () => {
    ac(liste());
    const kutu = await screen.findByLabelText('Emre göre grupla');
    fireEvent.click(kutu);
    expect(screen.queryByText(/2 görev · 5 iş emri/)).toBeNull();
    expect(window.localStorage.getItem('tmi.gorevlerim.emre-grupla')).toBe('0');
    cleanup();
    ac([satir(1, 'Malzeme · ORN-EMIR-001'), satir(2, 'Aparat · ORN-EMIR-001')]);
    expect(await screen.findByText(/2 görev · 5 iş emri/)).toBeTruthy();
    expect(screen.queryByLabelText('Emre göre grupla')).toBeNull();
  });
});
