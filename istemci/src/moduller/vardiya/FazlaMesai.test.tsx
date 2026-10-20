import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { FazlaMesai, FazlaMesaiListeCevabi, TakvimCevabi, VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { FazlaMesaiEkrani, haftaBasi } from './FazlaMesai.tsx';

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.vardiya', 'vardiya.yaz'] };
const IZLEYEN: Kullanici = { id: 2, ad: 'Deneme İzleyen', islemler: ['sayfa.vardiya'] };

const TAKVIM: TakvimCevabi = {
  vardiyalar: [], matris: [], gunler: [], kadro: [], kisiVardiyalari: [], bugun: '2026-10-14',
  isMerkezleri: [{ id: 10, kod: 'IM-A', ad: 'Deneme A', aktif: true, haftalikDakika: 0 }, { id: 11, kod: 'IM-B', ad: 'Deneme B', aktif: true, haftalikDakika: 0 }],
};
const PERSONEL: VardiyaPersoneliCevabi = {
  personel: [
    { kisiId: 31, ad: 'Deneme Bir', istasyonId: 1, isMerkeziId: 10, vardiyaId: null },
    { kisiId: 32, ad: 'Deneme İki', istasyonId: 1, isMerkeziId: 10, vardiyaId: null },
    { kisiId: 33, ad: 'Deneme Üç', istasyonId: 2, isMerkeziId: 11, vardiyaId: null },
  ],
};
const MESAI: FazlaMesai = {
  id: 5, tarih: '2026-10-15', baslangic: '17:00', bitis: '20:00', kapsam: 'is-merkezi', isMerkeziId: 10, istasyonId: null, kisiIdleri: [31],
  aciklama: 'Acil sipariş', iptal: false, dakika: 180, surum: 2, yazan: 'Deneme Planlama', yazildi: '2026-10-14T08:00:00.000Z',
};
const IPTAL: FazlaMesai = { ...MESAI, id: 6, tarih: '2026-10-16', iptal: true, kisiIdleri: [], aciklama: null };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici) {
  const postlar: { yol: string; govde: unknown }[] = [];
  const getler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '').split('?')[0] ?? '';
    if (secenek?.method === 'POST') {
      postlar.push({ yol, govde: typeof secenek.body === 'string' ? JSON.parse(secenek.body) : undefined });
      return json(200, { fazlaMesai: MESAI });
    }
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/vardiya-takvimi') return json(200, TAKVIM);
    if (yol === '/vardiya-personeli') return json(200, PERSONEL);
    if (yol === '/fazla-mesai') { getler.push(adres.split('?')[1] ?? ''); return json(200, { fazlaMesailer: [MESAI, IPTAL] } satisfies FazlaMesaiListeCevabi); }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return { postlar, getler };
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><FazlaMesaiEkrani /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Fazla mesai', () => {
  it('hafta pazartesiden başlar', () => {
    expect(haftaBasi('2026-10-14')).toBe('2026-10-12');
    expect(haftaBasi('2026-10-12')).toBe('2026-10-12');
    expect(haftaBasi('2026-10-18')).toBe('2026-10-12');
  });

  it('bu haftanın kayıtlarını hedef, personel ve iptal durumuyla listeler; yetkisiz kişi ekleme ve iptal görmez', async () => {
    const { getler } = sunucuKur(IZLEYEN);
    ac();
    const tablo = await screen.findByRole('table');
    expect(getler[0]).toBe('baslangic=2026-10-12&bitis=2026-10-18');
    expect(within(tablo).getAllByText('İş merkezi · IM-A Deneme A')).toHaveLength(2);
    expect(within(tablo).getByText('1 kişi: Deneme Bir')).toBeTruthy();
    expect(within(tablo).getByText('İptal')).toBeTruthy();
    expect(screen.getByText('Planlı toplam 3 saat')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fazla mesai ekle' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki hafta' }));
    await waitFor(() => expect(getler).toContain('baslangic=2026-10-19&bitis=2026-10-25'));
  });

  it('düzenleme formu hedefin personelini gösterir, seçimi ve sürümü gönderir', async () => {
    const { postlar } = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: '15.10.2026 17:00 düzenle' }));
    const kisiler = await screen.findByRole('group', { name: /Çalışacak personel/ });
    expect(within(kisiler).getByLabelText(/Deneme Bir/)).toHaveProperty('checked', true);
    expect(within(kisiler).queryByLabelText(/Deneme Üç/)).toBeNull();
    fireEvent.click(within(kisiler).getByLabelText(/Görünenlerin hepsi/));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(postlar).toHaveLength(1));
    expect(postlar[0]).toEqual({
      yol: '/fazla-mesai/5/guncelle',
      govde: { tarih: '2026-10-15', baslangic: '17:00', bitis: '20:00', kapsam: 'is-merkezi', isMerkeziId: 10, istasyonId: null, kisiIdleri: [31, 32], aciklama: 'Acil sipariş', surum: 2 },
    });
  });

  it('başka istasyondakiler istenince görünür; iptal onaydan sonra sürümle gider; iptal edilen satırda işlem yok', async () => {
    const { postlar } = sunucuKur(YAZAN);
    ac();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: '16.10.2026 17:00 iptal et' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '15.10.2026 17:00 düzenle' }));
    const kisiler = await screen.findByRole('group', { name: /Çalışacak personel/ });
    fireEvent.click(within(kisiler).getByLabelText('Başka istasyondakileri de göster'));
    expect(within(kisiler).getByLabelText(/Deneme Üç/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: '15.10.2026 17:00 iptal et' }));
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(postlar).toEqual([{ yol: '/fazla-mesai/5/iptal', govde: { surum: 2 } }]));
  });
});
