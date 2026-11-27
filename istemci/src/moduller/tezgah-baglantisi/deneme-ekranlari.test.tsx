import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GOLGE_NOTU } from './deneme-ortak.tsx';
import { Durus } from './Durus.tsx';
import { Esleme } from './Esleme.tsx';
import { GecisHazirligi } from './GecisHazirligi.tsx';
import { ORNEK_DURUS, ORNEK_ESLEME, ORNEK_GECIS, ORNEK_OEE, ORNEK_SAYIM } from './fikstur-deneme.ts';
import { Oee } from './Oee.tsx';
import { Sayim } from './Sayim.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const CEVAP: Record<string, () => unknown> = { esleme: ORNEK_ESLEME, sayim: ORNEK_SAYIM, durus: ORNEK_DURUS, oee: ORNEK_OEE, gecis: ORNEK_GECIS };

function sunucuKur() {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const bolum = /\/deneme\/([a-z]+)/.exec(adres)?.[1];
    const cevap = bolum === undefined ? undefined : CEVAP[bolum];
    return cevap ? json(200, cevap()) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
}

function ac(ekran: ReactNode) {
  sunucuKur();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

const kacis = (m: string) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tezgâh bağlantısı deneme ekranları (kart 3811)', () => {
  const EKRANLAR: [string, string, () => ReactNode][] = [
    ['Makine eşleme', 'ORNM002', () => <Esleme />],
    ['Sayım', 'ORN-IE-1042 · OP 20', () => <Sayim />],
    ['Duruş ve alarm', 'ORN Acil stop', () => <Durus />],
    ['OEE', 'ORN-M-001 · ORN-T01', () => <Oee />],
    ['Geçiş hazırlığı', 'ORN-M-001 · ORN-T01', () => <GecisHazirligi />],
  ];
  it.each(EKRANLAR)('%s fikstürle açılır, başlık tek kalıptadır ve gölge notu görünür', async (baslik, ornek, ekran) => {
    ac(ekran());
    expect((await screen.findAllByText(new RegExp(kacis(ornek)))).length).toBeGreaterThan(0);
    expect(screen.getByText(GOLGE_NOTU)).toBeTruthy();
    expect(screen.getAllByText(baslik).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\(deneme\)|denemesi/)).toBeNull();
  });

  it('Eşleme: Kaydet değişiklik olmadan pasif, öneri olan onaysız satırda "Öneriyi onayla" etkin; değer değişince Kaydet açılır', async () => {
    ac(<Esleme />);
    await screen.findByLabelText('ORN-T01 çevrimde parça');
    const kaydetler = screen.getAllByRole('button', { name: 'Kaydet' }) as HTMLButtonElement[];
    expect(kaydetler).toHaveLength(2);
    expect(kaydetler.every((d) => d.disabled)).toBe(true);
    expect((screen.getByRole('button', { name: 'Öneriyi onayla' }) as HTMLButtonElement).disabled).toBe(false);
    const satir = screen.getByLabelText('ORN-T01 çevrimde parça').closest('tr') as HTMLElement;
    fireEvent.change(within(satir).getByLabelText('ORN-T01 çevrimde parça'), { target: { value: '2' } });
    expect((within(satir).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(within(satir).getByLabelText('ORN-T01 çevrimde parça'), { target: { value: '1' } });
    expect((within(satir).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Eşleme: son değişiklik zamanı uygulamadaki nokta biçimindedir', async () => {
    ac(<Esleme />);
    await screen.findByLabelText('ORN-T01 çevrimde parça');
    expect(screen.getByText(/^\d{2}\.\d{2} \d{2}:\d{2} · ORN Yönetici$/)).toBeTruthy();
    expect(screen.queryByText(/\d{2}\/\d{2} \d{2}:\d{2}/)).toBeNull();
  });

  it('OEE: 5 puandan fazla fark "≠" ile ve erişilebilir adla işaretlenir; eşlenmemiş makinede veri yok notu tek kez yazılır', async () => {
    ac(<Oee />);
    await screen.findByText('ORN-M-001 · ORN-T01');
    // Fikstürde kullanılabilirlik ve performans 5 puandan fazla ayrışır, OEE ve kalite ayrışmaz.
    expect(screen.getAllByLabelText('OEE modülünden 5 puandan fazla farklı')).toHaveLength(2);
    expect(screen.queryAllByText(/OEE modülü veri yok/)).toHaveLength(0);
    expect(screen.getAllByText(/OEE modülü verisi yok/)).toHaveLength(1);
  });

  it('Geçiş: değeri olmayan ölçüt "değer yok" yazar', async () => {
    ac(<GecisHazirligi />);
    await screen.findAllByText(/öneri ORN-M-002, onay bekliyor/);
    expect(screen.getAllByText(/Eksik · değer yok/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Eksik · —/)).toBeNull();
  });

  it('Duruş: dosya adı ve kod görünmez; zaman çizgisi özetli, saat eksenli ve parça başına başlıklıdır', async () => {
    ac(<Durus />);
    const cizgi = await screen.findByRole('img', { name: /^ORN-T01 zaman çizgisi, .+ toplam duruş 53 dk$/ });
    expect(screen.getByText(/terminal duruşları bu sürümde okunamıyor/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/BASKA-MODUL|\.md|\(M1\)/);
    expect(cizgi.querySelectorAll('rect > title')).toHaveLength(9);
    expect(cizgi.querySelector('rect > title')?.textContent).toMatch(/^Vardiya dışı: \d{2}\.\d{2} \d{2}:\d{2} – \d{2}\.\d{2} \d{2}:\d{2}$/);
    const eksen = (cizgi.parentElement as HTMLElement).querySelector('ol') as HTMLElement;
    // Tesis saatiyle yazılır (sınama makinesinin dilimine bağlı değil): bir günlük pencerede 6 saatlik 5 işaret, ilk ve son aynı saat.
    const saatler = Array.from(eksen.querySelectorAll('li')).map((l) => l.textContent ?? '');
    expect(saatler).toHaveLength(5);
    expect(saatler.every((z) => /^\d{2}:00$/.test(z))).toBe(true);
    expect(saatler[0]).toBe(saatler[4]);
    expect((Number(saatler[1]!.slice(0, 2)) - Number(saatler[0]!.slice(0, 2)) + 24) % 24).toBe(6);
  });

  it('Sayım: sayaç sıfırlandı notu sayının altında tek satırdadır, kod ve süre kırılmaz', async () => {
    ac(<Sayim />);
    const not = await screen.findByText('sayaç sıfırlandı');
    expect(not.parentElement?.className).toContain('tc-tzb-not-satir');
    expect(not.parentElement?.querySelector('svg')).toBeTruthy();
    expect((screen.getByText('ORN-IE-1042 · OP 20') as HTMLElement).className).toContain('tc-tzb-kirilmaz');
  });
});
