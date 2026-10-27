import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { ProjePlaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import { ProjePlani } from '../disari.ts';
import { kaymaMetni } from './ProjePlani.tsx';

// Biçim sunucunun cevabından (proje-plani.test.ts); veriler uydurmadır.
const cevap = (o: Partial<ProjePlaniCevabi['ozet']> = {}): ProjePlaniCevabi => ({
  ozet: {
    isSayisi: 2, bitenSayisi: 1, plansizSayisi: 0, tabanBitis: '2026-03-02T10:00:00Z', canliBitis: '2026-03-03T10:00:00Z',
    beklenenBitis: '2026-03-05T09:00:00Z', beklenenKaymaGun: 3, ...o,
  },
  isler: [
    {
      isEmriId: 11, uretimEmriId: 5, emirNo: 'UE-1', opNo: 10, istasyonAd: 'Torna', durum: 'tamam',
      taban: { baslangic: '2026-03-01T06:00:00Z', bitis: '2026-03-01T08:00:00Z' }, canli: { baslangic: '2026-03-01T06:00:00Z', bitis: '2026-03-01T08:00:00Z' },
      gercekBaslama: '2026-03-01T06:00:00Z', gercekBitis: '2026-03-01T09:20:00Z', tahminiBitis: null, bitisKaymasiDk: 80, tabanBitisKaymasiDk: 80,
    },
    {
      isEmriId: 12, uretimEmriId: 5, emirNo: 'UE-1', opNo: 20, istasyonAd: null, durum: 'calisiyor',
      taban: null, canli: { baslangic: '2026-03-02T06:00:00Z', bitis: '2026-03-03T10:00:00Z' },
      gercekBaslama: '2026-03-02T07:00:00Z', gercekBitis: null, tahminiBitis: '2026-03-05T09:00:00Z', bitisKaymasiDk: 120, tabanBitisKaymasiDk: null,
    },
  ],
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    if (adres.replace('/api', '') === '/plan/projeler/7/plan-gerceklesen') return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
}

const cizdir = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProjePlani projeId={7} /></QueryClientProvider>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ProjePlani (933 a)', () => {
  it('kayma net dakikayı saat ve dakikayla yazar; bilinmeyen tire', () => {
    expect([kaymaMetni(null), kaymaMetni(0), kaymaMetni(45), kaymaMetni(-120), kaymaMetni(80)]).toEqual(['—', '0 dk', '+45 dk', '-2 sa', '+1 sa 20 dk']);
  });

  it('özet kartları ve iş satırları; çalışan işin bitişi tahmin işaretli, tabanı yoksa tire', async () => {
    sunucuKur(() => json(200, cevap()));
    cizdir();
    const tablo = await screen.findByRole('table', { name: 'Projenin iş emirleri: plan ve gerçekleşen' });
    expect(screen.getByText('+3 gün')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    const satirlar = within(tablo).getAllByRole('row');
    expect(within(satirlar[1]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[1]!).getAllByText('+1 sa 20 dk')).toHaveLength(2);
    expect(within(satirlar[2]!).getByText(/^~/)).toBeTruthy();
    expect(within(satirlar[2]!).getByText('+2 sa')).toBeTruthy();
  });

  it('bitişi bilinmeyen iş varsa beklenen bitiş boş, plansız iş uyarısı; sıfır gün uydurulmaz', async () => {
    sunucuKur(() => json(200, cevap({ beklenenBitis: null, beklenenKaymaGun: null, plansizSayisi: 1 })));
    cizdir();
    expect(await screen.findByText('Bir işin bitişi bilinmiyor')).toBeTruthy();
    expect(screen.getByText('1 iş planda yok')).toBeTruthy();
    expect(screen.queryByText('Tabanla aynı gün')).toBeNull();
  });

  it('iş emri yoksa özet kartı yok, boş tablo iletisi', async () => {
    sunucuKur(() => json(200, { ...cevap({ isSayisi: 0, bitenSayisi: 0, tabanBitis: null, canliBitis: null, beklenenBitis: null, beklenenKaymaGun: null }), isler: [] }));
    cizdir();
    expect(await screen.findByText('Bu projeye bağlı iş emri yok')).toBeTruthy();
    expect(screen.queryByText('Beklenen bitiş')).toBeNull();
  });

  it('yetkisiz okumada hata kutusu', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } satisfies HataGovdesi));
    cizdir();
    expect(await screen.findByText(/yetkiniz yok/)).toBeTruthy();
  });
});
