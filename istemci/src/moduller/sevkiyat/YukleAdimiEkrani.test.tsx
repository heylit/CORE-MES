import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GunPlaniCevabi, Is, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { varsayilanAdim } from './SevkiyatPlani.tsx';
import { GUN_PLANI } from './test-verisi.ts';
import { YukleAdimi } from './YukleAdimi.tsx';

const DEPOCU: Kullanici = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.is-yaz', 'stok.cikis'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const kalem = (k: Partial<TumIsSatiri>): TumIsSatiri => ({
  anahtar: 'kalem:31', kalemId: 31, kaynak: 'urun', yon: 'gidis', asama: 'depoda', hazirTarihi: null, istenenTarih: null, uretimEmriId: null, emirNo: null,
  isEmriId: null, opNo: null, adim: null, ilerleme: null, siparisNo: null, malzemeNo: null, malzemeAd: 'Deneme mamul', adet: '3.0000', firmaId: null, firmaAd: null,
  noktaId: null, tasima: 'biz', elleTuru: null, aciklama: null, is: { id: 1, tarih: GUN_PLANI.tarih, durum: 'yolda', tetiklendi: '2026-10-08T08:00:00+03:00' },
  depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...k,
}) as TumIsSatiri;

function kur() {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: ayar?.method ?? 'GET', yol, govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: DEPOCU } satisfies OturumCevabi);
    if (yol === '/stok/depo-sevk/31/cikis') return json(200, { uyarilar: [] });
    if (yol === '/sevkiyat/isler/1/belge-no') return json(200, { is: GUN_PLANI.isler[0] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac(onayli: boolean, isDurumu: Is['durum'] = 'yolda') {
  const isler = new Map(GUN_PLANI.isler.map((x) => [x.id, { ...x, durum: x.id === 3 ? 'tamamlandi' as const : isDurumu }]));
  const veri = { ...GUN_PLANI, onaylandi: onayli ? '2026-10-08T07:00:00+03:00' : null } as GunPlaniCevabi;
  const noktalar = new Map(GUN_PLANI.noktalar.map((n) => [n.id, n]));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>
    <YukleAdimi veri={veri} isler={isler} noktalar={noktalar} kalemler={new Map([[1, [kalem({})]]])} aracsiz={[]} onayli={onayli} isYazabilir />
  </MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Yükle adımı ekranı (Test T6)', () => {
  it('onaysız planda yükleme başlamaz', () => {
    kur();
    ac(false);
    expect(screen.getByText(/Yükleme plan onaylanınca başlar/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Çıkış yap' })).toBeNull();
  });

  it('çıkış bekleyen durakta "Çıkış yap" depo çıkışını ister; tamamlanmış ve alım durağında irsaliye düğmesi yok; yoldaki durağın irsaliye no\'su sürümle yazılır', async () => {
    const istekler = kur();
    ac(true);
    const arac = await screen.findByRole('region', { name: 'Kamyonet 1' });
    const duraklar = within(arac).getAllByRole('listitem');
    // Rota sırası: iş 3 (aktarma, tamamlandı), iş 2 (alım), iş 1 (teslimat, çıkış bekliyor).
    expect(within(duraklar[0]!).queryByRole('button', { name: /İrsaliye no|Değiştir/ })).toBeNull();
    expect(within(duraklar[1]!).queryByRole('button', { name: /İrsaliye no|Değiştir/ })).toBeNull();
    fireEvent.click(await within(duraklar[2]!).findByRole('button', { name: 'Çıkış yap' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/stok/depo-sevk/31/cikis']));
    fireEvent.click(within(duraklar[2]!).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('İrsaliye no'), { target: { value: ' DENEME-IRS-9 ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').at(-1)).toMatchObject({ yol: '/sevkiyat/isler/1/belge-no', govde: { belgeNo: 'DENEME-IRS-9', surum: 1 } }));
  });
});

describe('varsayılan adım (Test T7)', () => {
  const yok = { cikis: 0, irsaliye: 0 };
  it('onaylı planda çıkış bekleyen varsa Yükle, yoksa Teslim; boş planda sevke hazır kayıt varsa Hazırla', () => {
    expect(varsayilanAdim({ veri: GUN_PLANI, onayli: true, yerlesen: 3, sevkeHazir: 0, yuk: { cikis: 1, irsaliye: 0 } })).toBe('yukle');
    expect(varsayilanAdim({ veri: GUN_PLANI, onayli: true, yerlesen: 3, sevkeHazir: 2, yuk: yok })).toBe('teslim');
    const bos = { ...GUN_PLANI, bekleyen: [] } as GunPlaniCevabi;
    expect(varsayilanAdim({ veri: bos, onayli: false, yerlesen: 0, sevkeHazir: 2, yuk: yok })).toBe('hazirla');
    expect(varsayilanAdim({ veri: bos, onayli: false, yerlesen: 0, sevkeHazir: 0, yuk: yok })).toBe('dagit');
  });
});
