import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { GUN_PLANI } from './test-verisi.ts';
import { CikisOnayi, DurakBitir, useYukDuraklari, useYukleSayisi, type YukDuragi } from './disari.ts';
import { kodaUyanKalem } from './TerminalYukle.tsx';

// 3389 a: depo terminalinde yükleme. Değerler uydurmadır; uçlar Sevkiyat sayfasının Yükle adımıyla aynıdır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const DEPOCU: Kullanici = { id: 5, ad: 'ORN Depocu', islemler: ['stok.cikis', 'sevkiyat.is-yaz'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const kalem = (k: Partial<TumIsSatiri>): TumIsSatiri => ({
  anahtar: 'kalem:31', kalemId: 31, kaynak: 'urun', yon: 'gidis', asama: 'depoda', hazirTarihi: null, istenenTarih: null, uretimEmriId: 7, emirNo: 'ORN-UE-1',
  isEmriId: null, opNo: null, adim: null, ilerleme: null, siparisNo: null, malzemeNo: null, malzemeAd: 'ORN mamul', adet: '25.0000', firmaId: null, firmaAd: null,
  noktaId: null, tasima: 'biz', elleTuru: null, aciklama: null, is: { id: 1, tarih: GUN_PLANI.tarih, durum: 'planlandi', tetiklendi: '2026-10-08T08:00:00+03:00' },
  depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...k,
}) as TumIsSatiri;

function kur(k: { kullanici?: Kullanici; onayli?: boolean; cikis?: () => Promise<Response> } = {}) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: ayar?.method ?? 'GET', yol, govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: k.kullanici ?? DEPOCU });
    if (yol.startsWith('/sevkiyat/planlar/')) return json(200, { ...GUN_PLANI, onaylandi: k.onayli === false ? null : '2026-10-08T07:00:00+03:00' });
    if (yol.startsWith('/sevkiyat/tum-isler')) return json(200, { satirlar: [kalem({})] });
    if (yol === '/stok/depo-sevk/31/cikis') return k.cikis ? k.cikis() : json(200, { uyarilar: [] });
    if (yol === '/sevkiyat/isler/3/belge-no') return json(200, { is: GUN_PLANI.isler[2] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
const sar = (oge: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{oge}</QueryClientProvider>);
function Sayi() { const n = useYukleSayisi(); return <output aria-label="sayı">{n === null ? 'yok' : String(n)}</output>; }

function Duraklar() {
  const v = useYukDuraklari();
  return <output aria-label="duraklar">{v.plansiz ?? (v.duraklar ?? []).map((d) => `${d.arac} ${String(d.sira)} ${d.baslik} ${String(d.cikan)}/${String(d.toplam)}${d.bitti ? ' bitti' : ''}${d.irsaliye ? ' irsaliye' : ''}`).join(' | ')}</output>;
}
const DURAK: YukDuragi = {
  is: GUN_PLANI.isler[2] as YukDuragi['is'], arac: 'Kamyonet 1', sira: 1, durakSayisi: 3, baslik: 'Örnek Fason B', kalemler: [], bekleyen: [], toplam: 0, cikan: 0, irsaliye: true, bitti: false,
};

describe('terminalde yükleme (3389 a)', () => {
  it('kod yalnız durağın çıkış bekleyen kalemiyle eşlenir', () => {
    expect(kodaUyanKalem([kalem({})], ' orn-ue-1 ')?.kalemId).toBe(31);
    expect(kodaUyanKalem([kalem({})], 'ORN-UE-2')).toBeNull();
    expect(kodaUyanKalem([kalem({})], '')).toBeNull();
  });

  it('duraklar aracın sırasıyla; kalemsiz alım durağı biter, irsaliyesi yazılmamış aktarma bitmez', async () => {
    kur();
    sar(<Duraklar />);
    await waitFor(() => expect(screen.getByLabelText('duraklar').textContent).not.toBe(''));
    expect(screen.getByLabelText('duraklar').textContent!.split(' | ')).toEqual([
      'Kamyonet 1 1 Örnek Fason B → Örnek Müşteri A 0/0 irsaliye', 'Kamyonet 1 2 Örnek Tedarikçi C 0/0 bitti', 'Kamyonet 1 3 Örnek Müşteri A 0/1 irsaliye',
    ]);
  });

  it('onaysız planda iş yoktur, neden söylenir', async () => {
    kur({ onayli: false });
    sar(<Duraklar />);
    expect(await screen.findByText(/Plan onaylanmadı/)).toBeTruthy();
  });

  it('çıkış onayla yazılır; çift dokunuş tek çıkıştır', async () => {
    let yanit: (r: Response) => void = () => {};
    const istekler = kur({ cikis: () => new Promise((r) => { yanit = r; }) });
    const yazildi = vi.fn();
    sar(<CikisOnayi kalem={kalem({})} vazgec={() => undefined} yazildi={yazildi} />);
    expect(screen.getByRole('group', { name: 'Çıkış onayı' }).textContent).toContain('ORN mamul 25 adet çıkış yazılsın mı?');
    const yaz = screen.getByRole('button', { name: /Çıkışı yaz/ });
    fireEvent.click(yaz);
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/stok/depo-sevk/31/cikis']));
    yanit(json(200, { uyarilar: [] }));
    await waitFor(() => expect(yazildi).toHaveBeenCalledWith('ORN mamul çıkış yazıldı.'));
  });

  it('Bitir: irsaliye no ekran klavyesiyle girilir, işin sürümüyle yazılır, sonra durak biter', async () => {
    const istekler = kur();
    const bitti = vi.fn();
    sar(<DurakBitir durak={DURAK} eksik={0} irsaliyeYazar vazgec={() => undefined} bitti={bitti} />);
    fireEvent.click(screen.getByRole('button', { name: /İrsaliyeyi yaz, bitir/ }));
    expect(screen.getByRole('alert').textContent).toContain('İrsaliye no girin.');
    for (const t of ['Q', '-', '1', '/', 'X']) fireEvent.click(within(screen.getByRole('group', { name: 'Klavye' })).getByRole('button', { name: t }));
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(screen.getByRole('button', { name: /İrsaliyeyi yaz, bitir/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/sevkiyat/isler/3/belge-no')?.govde).toEqual({ belgeNo: 'Q-1/', surum: 1 }));
    await waitFor(() => expect(bitti).toHaveBeenCalledWith('İrsaliye no yazıldı; 1. durak yüklendi.'));
  });

  it('irsaliye yetkisi olmayan irsaliyeli durağı bitiremez', () => {
    kur();
    sar(<DurakBitir durak={DURAK} eksik={0} irsaliyeYazar={false} vazgec={() => undefined} bitti={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toContain('yazma yetkisi');
    expect((screen.getByRole('button', { name: /İrsaliyeyi yaz, bitir/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sekme sayısı yüklemesi bitmemiş araçtır; stok.cikis olmayana istek gitmez', async () => {
    kur();
    sar(<Sayi />);
    expect((await screen.findByText('1')).textContent).toBe('1');
    cleanup();
    const istekler = kur({ kullanici: { id: 6, ad: 'ORN', islemler: ['stok.giris'] } });
    sar(<Sayi />);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.getByLabelText('sayı').textContent).toBe('yok');
    expect(istekler.some((i) => i.yol.startsWith('/sevkiyat/'))).toBe(false);
  });
});
