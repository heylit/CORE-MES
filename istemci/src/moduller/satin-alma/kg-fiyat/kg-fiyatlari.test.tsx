import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FiyatsizKalite, GuncelKgFiyatiSatiri, KgFiyatlariCevabi, KgStokDegeri } from '#paylasilan/sozlesme/satin-alma.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { KgFiyatlari } from './KgFiyatlari.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Kalite kodları ve kişi uydurmadır.
const satir = (ek: Partial<GuncelKgFiyatiSatiri>): GuncelKgFiyatiSatiri => ({
  id: 1, kaynak: null, iptalEdildi: false, iptal: null, kartta: true, yasGun: 0, eskiMi: false, sonAlisKgFiyatiDoviz: null, sonAlisParaBirimi: null, sonAlisKgFiyati: null,
  sapmaYuzde: null, sapanMi: false,
  kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '125.5000', paraBirimi: 'TRY', tryKgFiyati: '125.5000', talasKgFiyati: null, tryTalasKgFiyati: null, gecerlilik: '2026-10-19', aciklama: '',
  kisiAdi: 'Deneme Alıcı', zaman: '2026-10-19T08:00:00.000Z', islemKatsayisi: null, araciKatsayisi: null, etkinKgFiyati: null, ...ek,
});

interface Istek { yontem: string; yol: string; govde: unknown; kimlik: string | null }
function ac(fiyatlar: GuncelKgFiyatiSatiri[], islemler: string[] = ['satin-alma.oku', 'satin-alma.yaz'], ekle: () => Response = () => json(200, { fiyatlar, fiyatsizKaliteler: [], stokDegeri: null }),
  fiyatsizKaliteler: FiyatsizKalite[] = [], stokDegeri: KgStokDegeri | null = null) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined, kimlik: new Headers(i?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-kg-fiyatlari') return json(200, { fiyatlar, fiyatsizKaliteler, stokDegeri } satisfies KgFiyatlariCevabi);
    if (yol.startsWith('/satin-alma-kg-fiyatlari/gecmis')) {
      return json(200, { girisler: [satir({}), satir({ id: 2, kgFiyati: '110.0000', tryKgFiyati: '110.0000', gecerlilik: '2026-10-01', iptalEdildi: true, iptal: { gerekce: 'Deneme: yanlış para birimi', kisiAdi: 'Deneme Yönetici', zaman: '2026-10-02T06:30:00.000Z' } })] });
    }
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

const satirDugmesi = (ad: string) => screen.findByRole('button', { name: ad });
const toplu = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Kg fiyatları: diğer işlemler' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Toplu giriş/ }));
};

describe('Malzeme kg fiyatları (SAT-77, 2455 Teslim A)', () => {
  it('satırda kalite ve form, güncel kg (dövizde ₺ karşılığı), son alış ve sapma, yaş, kaynak; formsuz satır "Bütün formlar"', async () => {
    ac([
      satir({ form: null, paraBirimi: 'USD', kgFiyati: '3.8500', tryKgFiyati: '136.2900', sonAlisKgFiyati: '145.2000', sonAlisKgFiyatiDoviz: '4.1000', sonAlisParaBirimi: 'USD',
        sapmaYuzde: '6.49', yasGun: 21, kaynak: 'tedarikci_teklifi' }),
      satir({ id: 2, yasGun: 35, eskiMi: true }),
    ]);
    expect(await screen.findByText('Bütün formlar')).toBeTruthy();
    expect(screen.getByText('3,85 USD')).toBeTruthy();
    expect(screen.getByText('136,29 ₺')).toBeTruthy();
    expect(screen.getByText('125,50 ₺')).toBeTruthy();
    expect(screen.getByText('145,20 ₺')).toBeTruthy();
    expect(screen.getByText('+%6,5')).toBeTruthy();
    expect(screen.getByText('listeye göre')).toBeTruthy();
    expect(screen.getByText('Tedarikçi teklifi')).toBeTruthy();
    expect(screen.getByText('alış yok')).toBeTruthy();
    expect(screen.getByText('Eskidi')).toBeTruthy();
    expect(screen.queryByText(/ TL/)).toBeNull();
  });

  it('süzgeç sekmeleri sayılarıyla: eskiyen, sapan, fiyatsız aynı tabloda, kartta yok; yetim satırda tek iş "İptal et"', async () => {
    ac([satir({ eskiMi: true, yasGun: 40 }), satir({ id: 2, kaliteKodu: 'DENEME-SP', sapmaYuzde: '-12.00', sapanMi: true, sonAlisKgFiyati: '110.0000' }),
      satir({ id: 3, kaliteKodu: 'DENEME-YT', kartta: false })], undefined, undefined, [{ kaliteKodu: 'DENEME-FY', aile: null, form: 'boru', kartSayisi: 3 }]);
    const tablo = await screen.findByRole('table', { name: 'Kg fiyatları' });
    expect(within(tablo).getByText('Fiyat yok')).toBeTruthy();
    expect(within(tablo).getByText('Boru · 3 kart')).toBeTruthy();
    expect(within(tablo).getByText('Kartta yok')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'DENEME-YT · Çubuk: İptal et' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'DENEME-YT · Çubuk: Fiyat gir' })).toBeNull();
    const sayi = (ad: RegExp) => screen.getByRole('tab', { name: ad }).querySelector('.tc-sekme-sayi')?.textContent;
    expect([sayi(/Eskiyen/), sayi(/Sapan/), sayi(/Fiyatsız/), sayi(/Kartta yok/)]).toEqual(['1', '1', '1', '1']);
    expect(screen.getByText('Eskiyen ya da sapan').closest('.tc-sayi-govde')?.querySelector('.tc-sayi-deger')?.textContent).toBe('2');
    fireEvent.click(screen.getByRole('tab', { name: /Sapan/ }));
    expect(within(tablo).getAllByRole('row').filter((r) => r.hasAttribute('data-satir')).map((r) => r.getAttribute('data-satir'))).toEqual(['DENEME-SP|cubuk']);
  });

  it('okuyan fiyat giremez ve iptal edemez: Fiyat gir, Toplu giriş, İptal et ve işlem menüsü yok (Güvenlik E1)', async () => {
    ac([satir({}), satir({ id: 3, kaliteKodu: 'DENEME-YT', kartta: false })], ['satin-alma.oku']);
    expect(await screen.findByText('DENEME-AL')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Fiyat gir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /diğer işlemler/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /İptal et/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /için işlemler/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'İşlem' })).toBeNull();
  });

  it('satırdan fiyat girilir: kalite ve form satırdan, kaynak seçilir, virgüllü fiyat noktaya çevrilir, tekrar kimliğiyle gider', async () => {
    const istekler = ac([satir({ kaynak: 'piyasa' })]);
    fireEvent.click(await satirDugmesi('DENEME-AL · Çubuk: Fiyat gir'));
    const p = screen.getByRole('dialog');
    expect(within(p).queryByLabelText('Kalite ve form')).toBeNull();
    expect((within(p).getByLabelText('Kaynak') as HTMLSelectElement).value).toBe('piyasa');
    fireEvent.change(within(p).getByLabelText('Kaynak'), { target: { value: 'tedarikci_teklifi' } });
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '130,25' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    const g = istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!;
    expect(g.kimlik).toBeTruthy();
    expect(g.govde).toMatchObject({ satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '130.25', talasKgFiyati: null, paraBirimi: 'TRY', kaynak: 'tedarikci_teklifi' }] });
  });

  it('2455-2 a: başlıktaki Fiyat gir kaliteyi yazdırmaz, kartlardaki kalite ve formlardan seçtirir; fiyatsızlar üstte, kartta olmayan seçilemez', async () => {
    const istekler = ac([satir({}), satir({ id: 3, kaliteKodu: 'DENEME-YT', kartta: false })], undefined, undefined, [{ kaliteKodu: 'DENEME-FY', aile: null, form: 'boru', kartSayisi: 3 }]);
    await screen.findByText('DENEME-AL');
    fireEvent.click(screen.getByRole('button', { name: 'Fiyat gir' }));
    const p = screen.getByRole('dialog');
    const secim = within(p).getByLabelText('Kalite ve form') as HTMLSelectElement;
    expect([...secim.options].map((o) => o.textContent)).toEqual(['DENEME-FY · Boru (fiyatı yok)', 'DENEME-AL · Çubuk']);
    expect((within(p).getByLabelText('Kaynak') as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '90' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toMatchObject({ satirlar: [{ kaliteKodu: 'DENEME-FY', form: 'boru', kgFiyati: '90', kaynak: null }] });
  });

  it('214 a ve 1352: talaş ve katsayılar pencerede kalır; satırdan açılınca güncel katsayılar hazır gelir, bozuk değer gönderilmez', async () => {
    const istekler = ac([satir({ islemKatsayisi: '1.15', araciKatsayisi: '1.05', etkinKgFiyati: '151.5388' })]);
    fireEvent.click(await satirDugmesi('DENEME-AL · Çubuk: Fiyat gir'));
    const p = screen.getByRole('dialog');
    expect((within(p).getByLabelText(/işlem katsayısı/i) as HTMLInputElement).value).toBe('1,15');
    fireEvent.change(within(p).getByLabelText(/Kg fiyatı/), { target: { value: '130' } });
    fireEvent.change(within(p).getByLabelText(/Talaş/), { target: { value: '0' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    expect(within(p).getByRole('alert').textContent).toContain('Talaş');
    fireEvent.change(within(p).getByLabelText(/Talaş/), { target: { value: '22,5' } });
    fireEvent.change(within(p).getByLabelText(/Aracı maliyeti/), { target: { value: '0' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    expect(within(p).getByRole('alert').textContent).toContain('Aracı katsayısını');
    fireEvent.change(within(p).getByLabelText(/Aracı maliyeti/), { target: { value: '' } });
    fireEvent.click(within(p).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toMatchObject({ satirlar: [{ kgFiyati: '130', talasKgFiyati: '22.5', islemKatsayisi: '1.15', araciKatsayisi: null }] });
  });

  it('iptal: gerekçe zorunlu; gerekçeyle tekrar kimliği taşıyan tek istek gider, cevap listeyi yeniler', async () => {
    const kalan = satir({ id: 1 });
    const istekler = ac([satir({ id: 7, kaliteKodu: 'DENEME-YT', kartta: false, kgFiyati: '3.9000', paraBirimi: 'USD', gecerlilik: '2026-09-07' })], undefined,
      () => json(200, { fiyatlar: [kalan], fiyatsizKaliteler: [], stokDegeri: null }));
    fireEvent.click(await satirDugmesi('DENEME-YT · Çubuk: İptal et'));
    const p = screen.getByRole('dialog');
    expect(p.textContent).toContain('3,90 USD/kg, 07.09.2026. Bu kalite hiçbir malzeme kartında yok.');
    fireEvent.click(within(p).getByRole('button', { name: /İptal et/ }));
    expect(within(p).getByRole('alert').textContent).toContain('gerekçe');
    expect(istekler.some((i) => i.yol.endsWith('/iptal'))).toBe(false);
    fireEvent.change(within(p).getByLabelText(/Gerekçe/), { target: { value: 'Deneme: kalite kodu yanlış' } });
    fireEvent.click(within(p).getByRole('button', { name: /İptal et/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/satin-alma-kg-fiyatlari/7/iptal')).toHaveLength(1));
    const g = istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/7/iptal')!;
    expect(g.govde).toEqual({ gerekce: 'Deneme: kalite kodu yanlış' });
    expect(g.kimlik).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('DENEME-YT')).toBeNull());
    expect(screen.getByText('DENEME-AL')).toBeTruthy();
  });

  it('kartta olan satırda son giriş "..." menüsünden iptal edilir; sunucu reddederse ileti pencerede kalır', async () => {
    const istekler = ac([satir({ id: 4 })], undefined, () => json(422, { hata: { kod: 'GECERSIZ', mesaj: 'Deneme ret iletisi' } }));
    fireEvent.click(await satirDugmesi('DENEME-AL · Çubuk için işlemler'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Son girişi iptal et/ }));
    const p = screen.getByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/Gerekçe/), { target: { value: 'Deneme gerekçe' } });
    fireEvent.click(within(p).getByRole('button', { name: /İptal et/ }));
    expect(await within(p).findByRole('alert')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/4/iptal')).toBe(true);
  });

  it('toplu yapıştırmada hatalı satır varken kaydedilmez; düzelince sayı düğmede görünür ve hepsi tek istekte gider', async () => {
    const istekler = ac([]);
    await toplu();
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

  it('toplu yüklemede sunucu kartta olmayan satırları numarasıyla reddeder; ileti metin olarak pencerede kalır', async () => {
    ac([], undefined, () => json(422, { kod: 'GECERSIZ', mesaj: 'Malzeme kartlarında olmayan kalite: 2. satır <b>DENEME-X</b>' }));
    await toplu();
    const p = screen.getByRole('dialog');
    fireEvent.change(within(p).getByLabelText(/Excel ya da CSV/), { target: { value: 'DENEME-1;cubuk;10\nDENEME-X;cubuk;12' } });
    fireEvent.click(within(p).getByRole('button', { name: '2 fiyatı kaydet' }));
    const uyari = await within(p).findByRole('alert');
    expect(uyari.textContent).toContain('2. satır <b>DENEME-X</b>');
    expect(uyari.querySelector('b')).toBeNull();
  });

  it('stok değeri gelirse iki özet ve satırda değer görünür, değere girmeyen gruplar notta; gelmezse stok özeti ve sütunu yok', async () => {
    ac([satir({})], undefined, undefined, [], {
      kgFiyatiyla: '1500.00', alisFiyatiyla: null, kgFiyatsizKalem: 2, alisFiyatsizKalem: 0,
      ayriToplam: { kgFiyatiyla: '300.00', alisFiyatiyla: '280.00' },
      ayriGruplar: [{ grup: 'kalite', kgFiyatiyla: null, alisFiyatiyla: null }, { grup: 'hurda', kgFiyatiyla: '100.00', alisFiyatiyla: null },
        { grup: 'fason', kgFiyatiyla: '200.00', alisFiyatiyla: null }, { grup: 'yolda', kgFiyatiyla: null, alisFiyatiyla: null }, { grup: 'diger', kgFiyatiyla: null, alisFiyatiyla: null }],
      satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', tutar: '1250.50' }],
    });
    expect(await screen.findByText('1.500 ₺')).toBeTruthy();
    expect(screen.getByText('Stok değerine dahil olmayan (kg fiyatıyla): Hurda 100,00 ₺ · Fason 200,00 ₺.')).toBeTruthy();
    expect(screen.getByText('2 stoklu malzemenin fiyatı yok, dahil değil')).toBeTruthy();
    expect(screen.getByText('Fiyatlı stok yok')).toBeTruthy();
    expect(screen.getByText('1.251 ₺')).toBeTruthy();
    cleanup();
    ac([satir({})]);
    expect(await screen.findByText('DENEME-AL')).toBeTruthy();
    expect(screen.queryByText(/stok değeri/i)).toBeNull();
    expect(screen.getByText('Eskiyen ya da sapan')).toBeTruthy();
  });

  it('satıra basınca geçmiş açılır: kaydeden, kaynak, kayıt zamanı (tesis saati), iptal edilen giriş gerekçe, kişi ve zamanla (Güvenlik E2); grafik iptal edileni çizmez', async () => {
    const istekler = ac([satir({})], ['satin-alma.oku']);
    fireEvent.click(await screen.findByText('DENEME-AL'));
    const p = await screen.findByRole('dialog');
    const tablo = await within(p).findByRole('table', { name: 'Fiyat geçmişi' });
    expect(within(tablo).getByText('01.10.2026')).toBeTruthy();
    expect(within(tablo).getByRole('columnheader', { name: 'Kaydeden' })).toBeTruthy();
    expect(within(tablo).getAllByText('19.10.2026 11:00')).toHaveLength(2);
    expect(within(tablo).getAllByText('İptal edildi')).toHaveLength(1);
    expect(within(tablo).getByText('Deneme: yanlış para birimi · Deneme Yönetici · 02.10.2026 09:30')).toBeTruthy();
    expect(within(p).getByText('Kg fiyatı, geçerlilik gününe göre', { selector: '.tc-grafik-baslik' })).toBeTruthy();
    expect(within(p).getByText('125,5 ₺', { selector: '.tc-grafik-son' })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-AL&form=cubuk')).toBe(true);
  });

  it('1351: şablon kalite listesiyle iner; seçilen dosya önizlenir, kg fiyatı boş satır atlanır, dolu satırlar tek istekte gider', async () => {
    const istekler = ac([satir({})], undefined, undefined, [{ kaliteKodu: 'DENEME-FY', aile: null, form: 'boru', kartSayisi: 2 }]);
    let indirilen: Blob | null = null;
    vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { indirilen = b; return 'blob:deneme'; }, revokeObjectURL: () => undefined }));
    const tikla = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await toplu();
    const p = screen.getByRole('dialog');
    fireEvent.click(within(p).getByRole('button', { name: /Şablonu indir/ }));
    expect(tikla).toHaveBeenCalled();
    const sablon = await new Promise<string>((coz) => { const r = new FileReader(); r.onload = () => coz(String(r.result)); r.readAsText(indirilen!); });
    expect(sablon).toContain('"DENEME-AL";"cubuk";"";"TRY";"";"";"";"";"";"125,5";"19.10.2026"');
    expect(sablon).toContain('"DENEME-FY";"boru"');
    const dolu = sablon.replace('"DENEME-AL";"cubuk";""', '"DENEME-AL";"cubuk";"131,75"');
    fireEvent.change(within(p).getByLabelText('Kg fiyatı dosyası'), { target: { files: [new File([dolu], 'kg.csv', { type: 'text/csv' })] } });
    const onizleme = await within(p).findByRole('table', { name: 'Kaydedilecek fiyatlar' });
    expect(within(onizleme).getByText('131,75 ₺')).toBeTruthy();
    expect(within(p).getByText('1 satırda kg fiyatı boş, atlanır.')).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: '1 fiyatı kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')).toHaveLength(1));
    expect(istekler.find((i) => i.yol === '/satin-alma-kg-fiyatlari/ekle')!.govde).toEqual({
      satirlar: [{ kaliteKodu: 'DENEME-AL', form: 'cubuk', kgFiyati: '131.75', talasKgFiyati: null, paraBirimi: 'TRY', gecerlilik: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), aciklama: '',
        islemKatsayisi: null, araciKatsayisi: null }],
    });
    tikla.mockRestore();
  });
});
