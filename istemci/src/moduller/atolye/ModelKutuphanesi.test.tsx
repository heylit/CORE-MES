import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { ModellerCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { ModelKutuphanesi } from './ModelKutuphanesi.tsx';

// Ön izleme WebGL ister; burada ölçülen yalnız düğmelerin hangi eyleme baktığıdır.
vi.mock('./ModelOnizleme.tsx', () => ({ ModelOnizleme: () => null }));

// 3165 a: model yazımı ve kalem bağları ayrı eylemlerdir; tek eylemli kişi yalnız kendi düğmelerini görür.
const MODELLER = { modeller: [{
  id: 3, ad: 'Deneme tezgah modeli', kaynakBicim: 'step', boyutBayt: 2048, parcaSayisi: 1, ozet: 'a'.repeat(64), ucgenSayisi: 1200,
  birim: 'mm', yukari: 'z', donus: '0.0', sigdir: true, tamam: true, surum: 1,
  kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-11-01T08:00:00.000Z', kullanim: 0, kalemKodlari: ['DENEME-1'],
}] } as unknown as ModellerCevabi;

function ac(islemler: Kullanici['islemler']) {
  const kullanici: Kullanici = { id: 4, ad: 'Deneme Tek Eylem', islemler };
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    const cevap = (govde: unknown, durum = 200) => Promise.resolve(new Response(JSON.stringify(govde), { status: durum }));
    if (yol === '/oturum') return cevap({ kullanici } satisfies OturumCevabi);
    if (yol === '/atolye/modeller') return cevap(MODELLER);
    if (yol === '/atolye/kalem-gorunumleri') return cevap({ kalemler: [] });
    return cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData(anahtarlar.oturum, kullanici);
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><ModelKutuphanesi acik kapat={() => {}} /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3B model kütüphanesi eylemleri (3165 a)', () => {
  it.each([
    ['atolye.model-yaz', { yukle: true, sil: true, bagla: false }],
    ['atolye.kalem-yaz', { yukle: false, sil: false, bagla: true }],
    ['atolye.salon-yaz', { yukle: false, sil: false, bagla: false }],
  ] as const)('yalnız %s taşıyan kişi yalnız kendi düğmelerini görür', async (eylem, beklenen) => {
    ac(['sayfa.atolye', eylem]);
    const tablo = await screen.findByRole('table', { name: 'Yüklenmiş modeller' });
    fireEvent.click(await within(tablo).findByText('Deneme tezgah modeli'));
    const kart = await screen.findByRole('region', { name: 'Deneme tezgah modeli' });
    const varMi = (ad: string): boolean => screen.queryByRole('button', { name: ad }) !== null;
    expect(within(kart).getByText('DENEME-1')).toBeTruthy();
    expect({ yukle: varMi('Model yükle'), sil: varMi('Sil'), bagla: varMi('Koda bağla') }).toEqual(beklenen);
    expect(varMi('DENEME-1 bağını kaldır')).toBe(beklenen.bagla);
    expect(varMi('Ayarı kaydet')).toBe(beklenen.yukle);
  });
});
