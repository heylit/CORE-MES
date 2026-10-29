import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { json, ornekDurum } from '../test-ortak.tsx';
import type { RrDurumu } from '../veri.ts';
import type { KomutCevabi, useEmirKomutu } from './komut.ts';
import { parametreDegeri, ReworkAdimi, ReworkSatirlari } from './ReworkAdimi.tsx';

// Rework adımı penceresi (1034): komutların gövdesi ve sırası. Şartnameler ve kayıtlar uydurmadır.
const durum = (): RrDurumu => ({ ...ornekDurum(), fasonFirms: [{ id: '81', code: 'F1', name: 'Deneme kaplama' }], planYerlesim: null, planMotoru: null });
const surumu = { id: 91, surumNo: 1, durum: 'yururlukte', istenenBelgeler: [], terminalNotu: null, degisiklikNotu: null, acan: null, acilma: '2030-01-01T00:00:00Z',
  yayinlayan: null, yayin: null, atiflar: [], parametreler: [
    { sira: 1, anahtar: 'tork', ad: 'Tork', tur: 'sayi', birim: 'Nm', secenekler: null, varsayilan: null, ipucu: null, zorunlu: true, adimdaDegisir: true },
    { sira: 2, anahtar: 'yontem', ad: 'Yöntem', tur: 'metin', birim: null, secenekler: null, varsayilan: null, ipucu: null, zorunlu: false, adimdaDegisir: false },
  ] };
const ozet = { id: 31, kod: 'TKR-SOK', ad: 'Tekrar sökme', kategoriId: 7, kapsam: 'ikisi', kaynak: 'atolye', musteriFirma: null, musteriBelgeNo: null, aktif: true,
  surum: 1, yururlukteSurumNo: 1, taslakSurumNo: null, kullanim: 0 };

function kur(cevaplar: KomutCevabi[]) {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    if (adres.endsWith('/rota/sartnameler')) {
      return json(200, { kategoriler: [{ id: 7, kod: 'TKR', ad: 'Tekrar işleme', sira: 1 }], standartlar: [], sartnameler: [ozet, { ...ozet, id: 32, kod: 'TKR-ESKI', aktif: false }] });
    }
    if (adres.endsWith('/rota/sartnameler/31')) return json(200, { sartname: { ...ozet, surumler: [surumu] } });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const calistir = vi.fn<(ad: string, govde: Record<string, unknown>, basari?: string) => Promise<KomutCevabi>>();
  for (const c of cevaplar) calistir.mockResolvedValueOnce(c);
  const komut = { calistir, mesgul: false, uyari: null, uyariKapat: () => {}, bildir: () => {} } as unknown as ReturnType<typeof useEmirKomutu>;
  const kapat = vi.fn();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <ReworkAdimi acik kapat={kapat} durum={durum()} emir={{ id: '61', no: 'UE-0001', surum: 4 }} isEmriId={714} komut={komut} />
    </QueryClientProvider>,
  );
  return { calistir, kapat };
}
const yeniDurum = (surum: number): RrDurumu => {
  const d = durum();
  return { ...d, emirler: { ...d.emirler!, orders: d.emirler!.orders.map((o) => ({ ...o, surum })) } };
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Rework adımı penceresi', () => {
  it('şablon şartnameyi ve adını getirir; adım, sonra şartname yeni emir sürümüyle gider', async () => {
    const { calistir, kapat } = kur([{ tamam: true, sonuc: null, durum: yeniDurum(5) }, { tamam: true, sonuc: null, durum: null }]);
    fireEvent.click(await screen.findByRole('button', { name: 'TKR-SOK Tekrar sökme' }));
    expect(screen.queryByRole('button', { name: /TKR-ESKI/ })).toBeNull();
    expect((screen.getByLabelText(/^Adımın adı/) as HTMLInputElement).value).toBe('Tekrar sökme');
    fireEvent.change(screen.getByLabelText(/^Operasyon/), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Makine'), { target: { value: '51' } });
    fireEvent.change(screen.getByLabelText('Birim dk'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText(/^Tork \(Nm\)/), { target: { value: '12,5' } });
    expect(screen.queryByLabelText('Yöntem')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Adımı kaydet, plana gönder' }));
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
    expect(calistir.mock.calls[0]?.[0]).toBe('emir-rework-adimi');
    expect(calistir.mock.calls[0]?.[1]).toMatchObject({ id: '61', isEmriId: 714, ad: 'Tekrar sökme', operasyonTipiId: '21', kaynak: { tur: 'makine', id: '51' }, birimSureDk: '3', surum: 4 });
    expect(calistir.mock.calls[1]?.slice(0, 2)).toEqual(['emir-rework-sartname', { id: '61', isEmriId: 714, surum: 5, sartnameler: [{ sartnameId: 31, degerler: { tork: 12.5 } }] }]);
  });

  it('"Diğer" şartnamesiz tek komut gönderir; fasonda firma ve termin gider', async () => {
    const { calistir, kapat } = kur([{ tamam: true, sonuc: null, durum: null }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Diğer' }));
    fireEvent.change(screen.getByLabelText(/^Adımın adı/), { target: { value: 'Elle düzeltme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fason' }));
    fireEvent.change(screen.getByLabelText('Firma'), { target: { value: '81' } });
    fireEvent.change(screen.getByLabelText('Termin gün'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adımı kaydet, plana gönder' }));
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
    expect(calistir).toHaveBeenCalledTimes(1);
    expect(calistir.mock.calls[0]?.[1]).toMatchObject({ ad: 'Elle düzeltme', kaynak: { tur: 'fason', id: '81' }, terminGun: '10' });
  });

  it('şartname yazılamazsa pencere açık kalır; yeniden denemede adım ikinci kez gönderilmez', async () => {
    const { calistir, kapat } = kur([
      { tamam: true, sonuc: null, durum: yeniDurum(5) }, { tamam: false, sonuc: null, durum: null }, { tamam: true, sonuc: null, durum: null },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'TKR-SOK Tekrar sökme' }));
    fireEvent.change(await screen.findByLabelText(/^Tork \(Nm\)/), { target: { value: '12' } });
    const gonder = screen.getByRole('button', { name: 'Adımı kaydet, plana gönder' });
    fireEvent.click(gonder);
    await waitFor(() => { expect(calistir).toHaveBeenCalledTimes(2); });
    expect(kapat).not.toHaveBeenCalled();
    fireEvent.click(gonder);
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
    expect(calistir.mock.calls.map((c) => c[0])).toEqual(['emir-rework-adimi', 'emir-rework-sartname', 'emir-rework-sartname']);
  });

  it('okunamayan sayı gönderilmez', async () => {
    const { calistir } = kur([]);
    fireEvent.click(await screen.findByRole('button', { name: 'TKR-SOK Tekrar sökme' }));
    fireEvent.change(await screen.findByLabelText(/^Tork \(Nm\)/), { target: { value: 'on iki' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adımı kaydet, plana gönder' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Tork: sayı olarak girin.');
    expect(calistir).not.toHaveBeenCalled();
  });
});

describe('Emir ayrıntısındaki hatalı parça satırı', () => {
  const kayit = (id: number, ek: Record<string, unknown>) => ({
    id, uretimEmri: { id: 60, emirNo: 'UE-0000', parcaNo: 'P-1', parcaAd: 'Deneme' }, isEmri: { id: 700, opNo: 20, ad: 'Frezeleme' },
    hedefEmir: { id: 61, emirNo: 'UE-0001' }, kaliteIsEmriId: 713, reworkIsEmriId: 714, hurdaNedeni: { id: 1, kod: 'OLC', ad: 'Ölçü dışı' }, adet: 2,
    aciklama: null, kisi: { id: 1, ad: null }, zaman: '2030-01-01T00:00:00Z', karar: 'rework', kararKisi: null, kararZamani: null, kararNotu: null, ncrKimlik: null, ...ek,
  });
  it('yalnız bu emirdeki rework kararı satır olur; düğme pencereyi o rework adımıyla açar', async () => {
    const adresler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      adresler.push(adres);
      if (adres.includes('/hatali-parcalar')) {
        return json(200, { kayitlar: [kayit(1, {}), kayit(2, { karar: null, reworkIsEmriId: null }), kayit(3, { hedefEmir: { id: 99, emirNo: 'UE-0099' } })] });
      }
      return json(200, { kategoriler: [], standartlar: [], sartnameler: [] });
    }));
    const komut = { calistir: vi.fn(), mesgul: false } as unknown as ReturnType<typeof useEmirKomutu>;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReworkSatirlari durum={durum()} emir={{ id: '61', kayitNo: 61, no: 'UE-0001', surum: 4 }} komut={komut} />
      </QueryClientProvider>,
    );
    const dugmeler = await screen.findAllByRole('button', { name: 'Rework adımını doldur' });
    expect(dugmeler).toHaveLength(1);
    expect(adresler.some((a) => a.endsWith('/hatali-parcalar?emirId=61'))).toBe(true);
    fireEvent.click(dugmeler[0]!);
    expect(await screen.findByRole('dialog', { name: 'UE-0001 rework adımı' })).toBeTruthy();
  });
});

describe('Şartname alanının değeri', () => {
  it('boş alan null; aralık iki sayıdır; yarım aralık okunamaz', () => {
    expect(parametreDegeri({ tur: 'sayi' }, '')).toBeNull();
    expect(parametreDegeri({ tur: 'sayi' }, undefined)).toBeNull();
    expect(parametreDegeri({ tur: 'aralik' }, '1|2,5')).toEqual([1, 2.5]);
    expect(parametreDegeri({ tur: 'aralik' }, '|')).toBeNull();
    expect(parametreDegeri({ tur: 'aralik' }, '1|')).toBeUndefined();
    expect(parametreDegeri({ tur: 'evet' }, false)).toBe(false);
    expect(parametreDegeri({ tur: 'coklu' }, [])).toBeNull();
    expect(parametreDegeri({ tur: 'metin' }, ' a ')).toBe('a');
  });
});
