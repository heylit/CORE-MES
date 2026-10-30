import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FiyatsizKalite, KgFiyatiSatiri, KgFiyatlariCevabi, KgStokDegeri } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { KgFiyatlari } from './KgFiyatlari.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Kalite kodları ve kişi uydurmadır.
const satir = (ek: Partial<KgFiyatiSatiri>): KgFiyatiSatiri => ({
  kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '125.5000', paraBirimi: 'TRY', tryKgFiyati: '125.5000', talasKgFiyati: null, tryTalasKgFiyati: null, gecerlilik: '2026-10-19', aciklama: '',
  kisiAdi: 'Deneme Alıcı', zaman: '2026-10-19T08:00:00.000Z', ...ek,
});

interface Istek { yontem: string; yol: string; govde: unknown; kimlik: string | null }
function ac(fiyatlar: KgFiyatiSatiri[], islemler: string[] = ['satin-alma.oku', 'satin-alma.yaz'], ekle: () => Response = () => json(200, { fiyatlar, fiyatsizKaliteler: [], stokDegeri: null }),
  fiyatsizKaliteler: FiyatsizKalite[] = [], stokDegeri: KgStokDegeri | null = null) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined, kimlik: new Headers(i?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-kg-fiyatlari') return json(200, { fiyatlar, fiyatsizKaliteler, stokDegeri } satisfies KgFiyatlariCevabi);
    if (yol.startsWith('/satin-alma-kg-fiyatlari/gecmis')) return json(200, { girisler: [satir({}), satir({ kgFiyati: '110.0000', tryKgFiyati: '110.0000', gecerlilik: '2026-10-01' })] });
    return ekle();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><BildirimSaglayici><KgFiyatlari /></BildirimSaglayici></MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzeme kg fiyatları (SAT-77)', () => {
  it('satırda kalite, form, fiyat, TL karşılığı ve giren görünür; formsuz satır "Bütün formlar", kursuz TL "—"', async () => {
    ac([satir({ form: null, paraBirimi: 'USD', kgFiyati: '3.2000', tryKgFiyati: null }), satir({})]);
    expect(await screen.findByText('Bütün formlar')).toBeTruthy();
    expect(screen.getByText('3,2 USD')).toBeTruthy();
    expect(screen.getAllByText('125,5 TL').length).toBe(1);
    expect(screen.getAllByText('Deneme Alıcı').length).toBe(2);
  });

  it('okuyan fiyat giremez: Yeni fiyat, Toplu giriş ve Fiyat gir düğmeleri yok', async () => {
    ac([satir({})], ['satin-alma.oku']);
    expect(await screen.findByText('cubuk')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni fiyat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Toplu giriş/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Fiyat gir/ })).toBeNull();
  });

  it('satırdan fiyat girilir: kalite ve form satırdan, virgüllü fiyat noktaya çevrilir, tekrar kimliğiyle gider', async () => {
    const istekler = ac([satir({})]);
    fireEvent.click(await screen.findByRole('button', { name: /Fiyat gir/ }));
    const p = screen.getByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '130,25' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    const g = istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!;
    expect(g.kimlik).toBeTruthy();
    expect(g.govde).toMatchObject({ satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '130.25', talasKgFiyati: null, paraBirimi: 'TRY' }] });
  });

  it('214 a: talaş fiyatı satırda kendi para birimiyle görünür; pencerede girilen talaş fiyatı gider, sıfır girilirse gitmez', async () => {
    const istekler = ac([satir({ talasKgFiyati: '20.0000', tryTalasKgFiyati: '20.0000' })]);
    expect(await screen.findByText('20 TRY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fiyat gir/ }));
    const p = screen.getByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '130' } });
    fireEvent.change(within(p).getByLabelText(/Talaş/), { target: { value: '0' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    expect(within(p).getByRole('alert').textContent).toContain('Talaş');
    fireEvent.change(within(p).getByLabelText(/Talaş/), { target: { value: '22,5' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toMatchObject({ satirlar: [{ kgFiyati: '130', talasKgFiyati: '22.5' }] });
  });

  it('fiyatı olmayan kalite ayrı listede uyarıyla görünür; oradan fiyat girilince kalite ve form hazır gelir', async () => {
    const istekler = ac([], undefined, undefined, [{ kaliteKodu: 'DENEME-FY', aile: 'metal', form: 'boru', kartSayisi: 3 }]);
    const liste = await screen.findByRole('table', { name: 'Fiyatı olmayan kaliteler' });
    expect(within(liste).getByText('DENEME-FY')).toBeTruthy();
    fireEvent.click(within(liste).getByRole('button', { name: /Fiyat gir/ }));
    const p = screen.getByRole('dialog');
    expect(within(p).queryByLabelText(/^Kalite/)).toBeNull();
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '90' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toMatchObject({ satirlar: [{ kaliteKodu: 'DENEME-FY', form: 'boru', kgFiyati: '90' }] });
  });

  it('toplu yapıştırmada hatalı satır varken kaydedilmez; düzelince sayı düğmede görünür ve hepsi tek istekte gider', async () => {
    const istekler = ac([]);
    fireEvent.click(await screen.findByRole('button', { name: /Toplu giriş/ }));
    const p = screen.getByRole('dialog');
    const alan = within(p).getByLabelText(/Excel ya da CSV/);
    fireEvent.change(alan, { target: { value: 'DENEME-1;cubuk;10\nDENEME-2;;sıfır' } });
    expect(within(p).getByRole('alert').textContent).toContain('2. satır');
    expect((within(p).getByRole('button', { name: /kaydet/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(alan, { target: { value: 'DENEME-1;cubuk;10\nDENEME-2;;12,5;EUR' } });
    fireEvent.click(within(p).getByRole('button', { name: '2 fiyatı kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toHaveLength(1));
    expect((istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde as { satirlar: unknown[] }).satirlar).toHaveLength(2);
  });

  it('stok değeri gelirse iki fiyatla kartta ve satırda görünür, fiyatsız kalem sayısı yazılır; gelmezse sütun ve kart yok', async () => {
    ac([satir({})], undefined, undefined, [], {
      kgFiyatiyla: '1500.00', alisFiyatiyla: null, kgFiyatsizKalem: 2, alisFiyatsizKalem: 0,
      ayriToplam: { kgFiyatiyla: '300.00', alisFiyatiyla: '280.00' },
      ayriGruplar: [{ grup: 'kalite', kgFiyatiyla: null, alisFiyatiyla: null }, { grup: 'hurda', kgFiyatiyla: '100.00', alisFiyatiyla: null },
        { grup: 'fason', kgFiyatiyla: '200.00', alisFiyatiyla: null }, { grup: 'yolda', kgFiyatiyla: null, alisFiyatiyla: null }, { grup: 'diger', kgFiyatiyla: null, alisFiyatiyla: null }],
      satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', tutar: '1250.50' }],
    });
    expect(await screen.findByText('1.500,00 TL')).toBeTruthy();
    // 228 a: kullanılabilir olmayan stok değere girmez; toplamı ve değeri olan grupları ayrı kartta görünür.
    expect(screen.getByText('300,00 TL')).toBeTruthy();
    expect(screen.getByText('Hurda 100,00 TL · Fason 200,00 TL')).toBeTruthy();
    expect(screen.getByText('2 stoklu malzemenin fiyatı yok, dahil değil')).toBeTruthy();
    expect(screen.getByText('Fiyatlı stok yok')).toBeTruthy();
    expect(screen.getByText('1.250,50 TL')).toBeTruthy();
    cleanup();
    ac([satir({})]);
    expect(await screen.findByText('cubuk')).toBeTruthy();
    expect(screen.queryByText(/Stok değeri/)).toBeNull();
  });

  it('satıra basınca o kalite ve formun geçmişi açılır: kaydeden, kayıt zamanı (tesis saati) ve fiyat grafiği görünür', async () => {
    const istekler = ac([satir({})], ['satin-alma.oku']);
    fireEvent.click(await screen.findByText('DENEME-AL'));
    const p = await screen.findByRole('dialog');
    const tablo = await within(p).findByRole('table', { name: 'Fiyat geçmişi' });
    expect(within(tablo).getByText('01.10.2026')).toBeTruthy();
    expect(within(tablo).getByRole('columnheader', { name: 'Kaydeden' })).toBeTruthy();
    expect(within(tablo).getAllByText('19.10.2026 11:00')).toHaveLength(2);
    expect(within(p).getByText('Kg fiyatı, geçerlilik gününe göre', { selector: '.tc-grafik-baslik' })).toBeTruthy();
    expect(within(p).getByText('125,5 TL', { selector: '.tc-grafik-son' })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-AL&form=cubuk')).toBe(true);
  });

  it('1351: şablon kalite listesiyle iner; seçilen dosya önizlenir, kg fiyatı boş satır atlanır, dolu satırlar tek istekte gider', async () => {
    const istekler = ac([satir({})], undefined, undefined, [{ kaliteKodu: 'DENEME-FY', aile: null, form: 'boru', kartSayisi: 2 }]);
    let indirilen: Blob | null = null;
    vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { indirilen = b; return 'blob:deneme'; }, revokeObjectURL: () => undefined }));
    const tikla = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: /Toplu giriş/ }));
    const p = screen.getByRole('dialog');
    fireEvent.click(within(p).getByRole('button', { name: /Şablonu indir/ }));
    expect(tikla).toHaveBeenCalled();
    const sablon = await new Promise<string>((coz) => { const r = new FileReader(); r.onload = () => coz(String(r.result)); r.readAsText(indirilen!); });
    expect(sablon).toContain('"DENEME-AL";"cubuk";"";"TRY"');
    expect(sablon).toContain('"DENEME-FY";"boru"');
    const dolu = sablon.replace('"DENEME-AL";"cubuk";""', '"DENEME-AL";"cubuk";"131,75"');
    fireEvent.change(within(p).getByLabelText('Kg fiyatı dosyası'), { target: { files: [new File([dolu], 'kg.csv', { type: 'text/csv' })] } });
    const onizleme = await within(p).findByRole('table', { name: 'Kaydedilecek fiyatlar' });
    expect(within(onizleme).getByText('131,75 TRY')).toBeTruthy();
    expect(within(p).getByText('1 satırda kg fiyatı boş, atlanır.')).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: '1 fiyatı kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toHaveLength(1));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toEqual({
      satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '131.75', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), aciklama: '' }],
    });
    tikla.mockRestore();
  });

  it('sunucu reddederse ileti pencerede kalır', async () => {
    ac([satir({})], undefined, () => json(422, { hata: { kod: 'GECERSIZ', mesaj: 'Deneme ret iletisi' } }));
    fireEvent.click(await screen.findByRole('button', { name: /Fiyat gir/ }));
    const p = screen.getByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '5' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    expect(await within(p).findByRole('alert')).toBeTruthy();
  });
});
