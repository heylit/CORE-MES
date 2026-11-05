import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { EmirAdimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { TalimatAdimi } from '#paylasilan/sozlesme/rota.ts';

// Sunucu sahte api ile cevaplanır; değerler ve adlar uydurmadır.
const sunucu = vi.hoisted(() => ({
  adimlar: [] as unknown[], talimat: [] as unknown[], istekler: [] as { yol: string; govde: unknown; kimlikli?: boolean }[],
}));
vi.mock('../../../../ortak/veri/api.ts', async (asil) => ({
  ...(await asil<object>()),
  api: {
    get: (yol: string) => {
      if (yol.startsWith('/uretim-emirleri/')) return Promise.resolve({ emir: {}, kayitlar: [], adimlar: sunucu.adimlar });
      if (yol.startsWith('/rota/urunler/')) return Promise.resolve({ surumler: [{ surum: 3, adimlar: sunucu.talimat }], taslak: null });
      return Promise.reject(new Error(yol));
    },
    post: (yol: string, govde: unknown, secenek?: { istekKimligi?: string }) => {
      sunucu.istekler.push({ yol, govde, ...(secenek?.istekKimligi ? { kimlikli: true } : {}) });
      const id = Number(/adimlar\/(\d+)/.exec(yol)?.[1]);
      const g = govde as { tamam?: boolean; metin?: string };
      sunucu.adimlar = (sunucu.adimlar as EmirAdimi[]).map((a) => (a.id !== id ? a
        : g.metin ? { ...a, buNot: { metin: g.metin, yazan: { id: 3, ad: 'Deneme' }, zaman: '2026-11-05T08:00:00Z', emirId: 5 } } : { ...a, tamam: !!g.tamam }));
      return Promise.resolve({ emir: {}, adimlar: sunucu.adimlar });
    },
  },
}));
vi.mock('../../../belge-merkezi/disari.ts', () => ({ dosyaYukle: () => Promise.resolve('c'.repeat(64)) }));
const { HazirlikTalimati } = await import('./HazirlikTalimati.tsx');

afterEach(() => { cleanup(); sunucu.istekler = []; });

const KUNYE = { urunId: 7, opNo: 10, surum: 3 };
const adim = (id: number, sira: number, asama: EmirAdimi['asama'], ek: Partial<EmirAdimi> = {}): EmirAdimi => ({
  id, sira, ad: `Adım ${String(sira)}`, aciklama: null, asama, tamam: false, tamamlayan: null, tamamlanma: null,
  kanit: null, gecenNot: null, buNot: null, talimat: KUNYE, ...ek,
});
const talimat = (sira: number, ek: Partial<TalimatAdimi>): TalimatAdimi => ({
  sira, baslik: `Talimat ${String(sira)}`, metin: null, kontrol: { tur: 'onay' }, zorunlu: false, medya: [], asama: 'hazirlik', ...ek,
});
const kur = () => {
  sunucu.adimlar = [
    adim(11, 1, 'on_hazirlik'),
    adim(12, 2, 'hazirlik', { gecenNot: { metin: 'Mengeneyi iki tur fazla sık', yazan: { id: 4, ad: 'Deneme Usta' }, zaman: '2026-10-20T08:00:00Z', emirId: 2 } }),
    adim(13, 3, 'hazirlik'),
    adim(14, 4, 'uretim'),
  ];
  sunucu.talimat = [
    talimat(1, { baslik: 'Malzemeyi getir', asama: 'on_hazirlik' }),
    talimat(2, { baslik: 'Sıfırı ölç', metin: 'Probu tak\nSıfırı al', kontrol: { tur: 'olcum', ad: 'Sıfır', alt: -0.01, ust: 0.01, birim: 'mm' }, zorunlu: true,
      medya: [{ ozet: 'a'.repeat(64), ad: 'sifir.png', tur: 'resim', boyut: 10 }] }),
    talimat(3, { baslik: 'Kapağı kapat', zorunlu: true }),
    talimat(4, { baslik: 'İlk parça', asama: 'uretim' }),
  ];
};
const ac = (ek: { otomatik?: boolean; asama?: 'on_hazirlik' | 'hazirlik' } = {}) => {
  const kapat = vi.fn(); const baslat = vi.fn(); const bildir = vi.fn();
  render(<HazirlikTalimati emirId={5} asama={ek.asama ?? 'hazirlik'} baslik="UE-0001 · OP10" canli={null} otomatik={ek.otomatik ?? false} kapat={kapat} baslat={baslat} bildir={bildir} />);
  return { kapat, baslat, bildir };
};

describe('hazırlık talimatı ekranı (2098c, v5)', () => {
  it('yalnız aşamanın adımları gelir; ölçüm sınır içine girmeden Tamam açılmaz; kanıtla işaretlenince sonraki adıma geçer', async () => {
    kur();
    ac();
    expect(await screen.findByRole('heading', { name: 'Sıfırı ölç' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Adım \d/ })).toHaveLength(2);
    expect(screen.getByText('Probu tak')).toBeTruthy();
    expect((await screen.findByRole('img', { name: 'sifir.png' })).getAttribute('src')).toBe(`/api/rota/talimat-medyasi/${'a'.repeat(64)}`);
    const tamam = screen.getByRole('button', { name: /^Tamam/ }) as HTMLButtonElement;
    expect(tamam.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sıfır'), { target: { value: '0,05' } });
    expect(screen.getByText(/Sınır dışında/)).toBeTruthy();
    expect(tamam.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sıfır'), { target: { value: '0,005' } });
    fireEvent.click(tamam);
    await screen.findByRole('heading', { name: 'Kapağı kapat' });
    expect(sunucu.istekler).toEqual([{ yol: '/uretim-emirleri/5/adimlar/12/tamamla', govde: { tamam: true, kanit: { olcum: 0.005 } } }]);
  });

  it('eksik zorunluyla Başlat uyarır; "Yine de başlat" başlatır', async () => {
    kur();
    const { baslat } = ac();
    await screen.findByRole('heading', { name: 'Sıfırı ölç' });
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki adım' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki adım' }));
    expect(await screen.findByRole('heading', { name: '2 adım işaretlenmedi' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Başlat/ }));
    const uyari = screen.getByRole('alert');
    expect(within(uyari).getByText('2 zorunlu adım işaretlenmedi')).toBeTruthy();
    expect(baslat).not.toHaveBeenCalled();
    fireEvent.click(within(uyari).getByRole('button', { name: /Yine de başlat/ }));
    expect(baslat).toHaveBeenCalledTimes(1);
  });

  it('geçen seferin notu okunur; sonraki sefere not bırakılır; yanlış adım amire bildirilir', async () => {
    kur();
    const { bildir } = ac();
    fireEvent.click(await screen.findByRole('button', { name: /Geçen sefer/ }));
    expect(screen.getByText(/Deneme Usta/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sıfırı ölç' })).getByRole('button', { name: /Sonraki sefere not bırak/ }));
    fireEvent.change(screen.getByLabelText(/bir dahaki sefere/), { target: { value: ' Probu sil ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Notu kaydet' }));
    await waitFor(() => { expect(sunucu.istekler).toEqual([{ yol: '/uretim-emirleri/5/adimlar/12/not', govde: { metin: 'Probu sil' }, kimlikli: true }]); });
    fireEvent.click(screen.getByRole('button', { name: 'Bu adım yanlış ya da eksik' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sıra yanlış' }));
    expect(bildir).toHaveBeenCalledWith('Talimat · UE-0001 · OP10 · adım 1 Sıfırı ölç: Sıra yanlış');
    expect(screen.getByRole('heading', { name: 'Vardiya amirine iletildi' })).toBeTruthy();
  });

  it('ayar başlayınca kendiliğinden açılan liste adımı yoksa kapanır; elle açılanda boş durum görünür', async () => {
    sunucu.adimlar = [adim(14, 1, 'uretim')];
    sunucu.talimat = [talimat(1, { asama: 'uretim' })];
    const oto = ac({ otomatik: true });
    await waitFor(() => { expect(oto.kapat).toHaveBeenCalled(); });
    cleanup();
    ac({ asama: 'on_hazirlik' });
    expect(await screen.findByText('Bu iş emrinin rotasında ön hazırlık adımı yok')).toBeTruthy();
  });
});
