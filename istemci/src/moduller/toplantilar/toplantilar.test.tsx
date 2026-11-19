import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Toplanti, ToplantiListesiCevabi } from '#paylasilan/sozlesme/toplantilar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ToplantiGorunumu } from './ToplantiAyrinti.tsx';
import { Toplantilar } from './Toplantilar.tsx';
import { anOlustur, zamanMetni } from './gosterim.ts';
import { rotalar } from './rotalar.tsx';
import { ustEylemler } from './ust-eylem.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const SAAT = 3_600_000;

function toplanti(t: Partial<Toplanti> = {}): Toplanti {
  return {
    id: 7, baslik: 'ORN-Haftalık termin', tur: 'proje', baslangic: new Date(Date.now() + SAAT).toISOString(), bitis: new Date(Date.now() + 2 * SAAT).toISOString(),
    yer: 'ORN-Salon 1', durum: 'planlandi', iptalNedeni: null, duzenleyen: { id: 1, ad: 'ORN-Düzenleyen' },
    konuTuru: 'proje', konu: { tur: 'proje', id: 3, no: 'ORN-PRJ-0042', ad: 'ORN-Proje', durum: 'aktif', tarih: null },
    katilimcilar: [{ kisiId: 2, ad: 'ORN-Şef', zorunlu: true }, { kisiId: 4, ad: 'ORN-Uzman', zorunlu: false }],
    gundem: ['Açık aksiyonlar'], kararlar: [],
    aksiyonlar: [{ id: 11, metin: 'Planı yayınla', sorumlu: { id: 2, ad: 'ORN-Şef' }, sonTarih: '2026-11-22', durum: 'acik', gorev: null, surum: 1 }],
    izinler: { yaz: true, gorevAc: true }, surum: 1, ...t,
  };
}

function ac(icerik: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{icerik}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Toplantılar (3448)', () => {
  it('katılımcı ekranı Profilim altındadır ve Hesap menüsünden açılır; rol matrisi değişmez', () => {
    expect(ustEylemler.map((e) => [e.anahtar, e.islem, e.yer])).toEqual([['toplantilarim', 'oturum', 'hesap']]);
    expect(rotalar.map((r) => r.yol)).toContain('/profil/toplantilarim/:id');
  });

  it('zaman tesis saatiyle yazılır; formun günü ve saati aynı ana döner', () => {
    const b = anOlustur('2026-11-21', '09:30');
    expect(b).toBe('2026-11-21T06:30:00.000Z');
    expect(zamanMetni(b, anOlustur('2026-11-21', '10:15'))).toBe('21.11.2026 Cumartesi 09:30-10:15');
  });

  it('liste satırı toplantıyı açar; yazma izni yoksa "Toplantı ekle" yoktur', async () => {
    const cevap: ToplantiListesiCevabi = {
      toplantilar: [{ id: 7, baslik: 'ORN-Haftalık termin', tur: 'uretim', baslangic: '2026-11-21T06:30:00Z', bitis: '2026-11-21T07:15:00Z', yer: null,
        durum: 'planlandi', duzenleyen: { id: 1, ad: 'ORN-Düzenleyen' }, konuTuru: 'serbest', katilimciSayisi: 3, acikAksiyon: 0 }],
      izinler: { yaz: false, eposta: false },
    };
    vi.stubGlobal('fetch', vi.fn(async () => json(200, cevap)));
    ac(<Toplantilar kok="/profil/toplantilarim" />);
    expect((await screen.findAllByText('ORN-Haftalık termin')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Toplantı ekle' })).toBeNull();
  });

  it('projeli toplantıda aksiyon göreve çevrilir; başlamadan "Yapıldı işaretle" yoktur', async () => {
    const gonderilen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
      const yol = new URL(adres, 'http://yerel').pathname.replace('/api', '');
      if (init?.method === 'POST') gonderilen.push(`${yol} ${String(init.body)}`);
      return json(200, toplanti({ aksiyonlar: [{ ...toplanti().aksiyonlar[0]!, gorev: { id: 68, durum: 'yapilacak' }, surum: 2 }] }));
    }));
    ac(<ToplantiGorunumu t={toplanti()} eposta={false} />);
    expect(screen.queryByRole('button', { name: /Yapıldı işaretle/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Göreve çevir/ }));
    await waitFor(() => expect(gonderilen).toEqual(['/toplantilar/7/aksiyonlar/11/gorev {"surum":1}']));
  });

  it('projeler.gorev-yaz yoksa (gorevAc false) "Göreve çevir" görünmez; Bitti ve İptal kalır', () => {
    ac(<ToplantiGorunumu t={toplanti({ izinler: { yaz: true, gorevAc: false } })} eposta={false} />);
    expect(screen.queryByRole('button', { name: /Göreve çevir/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Bitti/ })).toBeTruthy();
  });

  it('serbest konuda aksiyon toplantıda izlenir; başlamış toplantıda "Yapıldı işaretle" çıkar', () => {
    ac(<ToplantiGorunumu t={toplanti({ konuTuru: 'serbest', konu: null, baslangic: new Date(Date.now() - SAAT).toISOString() })} eposta={false} />);
    expect(screen.queryByRole('button', { name: /Göreve çevir/ })).toBeNull();
    expect(screen.getByText('Toplantıda izlenir')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yapıldı işaretle/ })).toBeTruthy();
  });

  it('yazma izni olmayan katılımcı düğme görmez', () => {
    ac(<ToplantiGorunumu t={toplanti({ izinler: { yaz: false, gorevAc: false } })} eposta={false} />);
    expect(screen.queryByRole('button', { name: /Değiştir|Karar ekle|Aksiyon ekle|Göreve çevir/ })).toBeNull();
    expect(screen.getByText('Zorunlu')).toBeTruthy();
    expect(screen.getByText('Bilgi için')).toBeTruthy();
  });
});
