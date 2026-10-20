import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { PlanliDurus, PlanliDurusListeCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { PlanliDuruslarEkrani } from './PlanliDuruslar.tsx';

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.vardiya', 'vardiya.durus-yaz'] };
const IZLEYEN: Kullanici = { id: 2, ad: 'Deneme İzleyen', islemler: ['sayfa.vardiya'] };

const TAKVIM: TakvimCevabi = {
  vardiyalar: [], matris: [], gunler: [], kadro: [], kisiVardiyalari: [], bugun: '2026-10-10',
  isMerkezleri: [{ id: 10, kod: 'IM-A', ad: 'Deneme A', aktif: true, haftalikDakika: 0 }],
};
const DURUS: PlanliDurus = {
  id: 5, surum: 3, baslik: 'Deneme bakım', durusNedeniId: null, kapsam: 'is-merkezi', isMerkeziId: 10, istasyonId: null,
  baslangic: '2026-10-12T05:00:00.000Z', bitis: '2026-10-12T07:00:00.000Z', tekrar: 'haftalik', gunler: [1, 3], tekrarBitis: null,
  aciklama: null, aktif: true, yazan: 'Deneme Planlama', yazildi: '2026-10-10T08:00:00.000Z',
};
const LISTE: PlanliDurusListeCevabi = { satirlar: [DURUS], sayfa: 1, sayfaBoyu: 50, toplam: 1 };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici) {
  const postlar: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '').split('?')[0] ?? '';
    if (secenek?.method === 'POST') {
      postlar.push({ yol, govde: typeof secenek.body === 'string' ? JSON.parse(secenek.body) : undefined });
      return json(200, yol.endsWith('/kaldir') ? { kaldirildi: true } : { durus: DURUS });
    }
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/vardiya-takvimi') return json(200, TAKVIM);
    if (yol === '/planli-duruslar') return json(200, LISTE);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return postlar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><PlanliDuruslarEkrani /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Planlı duruşlar', () => {
  it('kaydı kapsam ve haftalık günleriyle listeler; yetkisiz kişi ekleme ve silme görmez', async () => {
    sunucuKur(IZLEYEN);
    ac();
    const tablo = await screen.findByRole('table');
    expect(within(tablo).getByText('Deneme bakım')).toBeTruthy();
    expect(within(tablo).getByText('İş merkezi · IM-A Deneme A')).toBeTruthy();
    expect(within(tablo).getByText(/Pzt, Çar/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Planlı duruş ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deneme bakım sil' })).toBeNull();
  });

  it('7 günlük şerit: gün başlıkları, gerçekleşme çubuğu ve bir daha gerçekleşmeyecek duruşa geçmiş etiketi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 9, 12, 12, 0) });
    try {
      sunucuKur(IZLEYEN);
      ac();
      const serit = await screen.findByRole('group', { name: '7 günlük planlı duruş şeridi' });
      expect(serit.textContent).toContain('Pzt 12.10');
      expect(serit.textContent).toContain('Paz 18.10');
      // DURUS haftalık pazartesi ve çarşamba, süresiz: bu hafta iki gerçekleşme, geçmiş değil.
      expect(within(serit).getByRole('img', { name: 'Deneme bakım: bu hafta 2 gerçekleşme' })).toBeTruthy();
      expect(serit.textContent).not.toContain('geçmiş');
    } finally {
      vi.useRealTimers();
    }
  });

  it('silme onaydan sonra kayıt sürümüyle gider', async () => {
    const postlar = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme bakım sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(postlar).toEqual([{ yol: '/planli-duruslar/5/kaldir', govde: { surum: 3 } }]));
  });

  it('düzenleme formu kaydı sürümüyle ve ISO günleriyle günceller', async () => {
    const postlar = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme bakım düzenle' }));
    fireEvent.change(await screen.findByLabelText(/Başlık/), { target: { value: 'Deneme bakım 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(postlar).toHaveLength(1));
    expect(postlar[0]).toMatchObject({
      yol: '/planli-duruslar/5/guncelle',
      govde: { baslik: 'Deneme bakım 2', kapsam: 'is-merkezi', isMerkeziId: 10, istasyonId: null, tekrar: 'haftalik', gunler: [1, 3], surum: 3,
        baslangic: DURUS.baslangic, bitis: DURUS.bitis },
    });
  });

  it('süre alanına yazılan tamamlanmış değer Enter ve odak çıkışında uygulanır; gönderim görünen değeri yollar, geçersizse eskisi kalır', async () => {
    const postlar = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme bakım düzenle' }));
    const bas = await screen.findByLabelText(/Başlangıç/) as HTMLInputElement;
    const eski = bas.value;
    fireEvent.change(bas, { target: { value: '29.10.2026 0:00' } });
    expect(bas.value).toBe('29.10.2026 0:00');
    fireEvent.change(bas, { target: { value: '31.02.2026 08:00' } });
    fireEvent.blur(bas);
    expect(bas.value).toBe(eski);
    fireEvent.change(bas, { target: { value: '29.10.2026 0:00' } });
    fireEvent.keyDown(bas, { key: 'Enter' });
    expect(bas.value).toBe('29.10.2026 00:00');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(postlar).toHaveLength(1));
    expect((postlar[0]!.govde as { baslangic: string }).baslangic).toBe(new Date(2026, 9, 29, 0, 0).toISOString());
  });
});
