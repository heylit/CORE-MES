import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { AcikEmirlerCevabi, MalzemeSecenekleriCevabi, OnTalep, OnTalepleriCevabi, Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { BELIRSIZ_MIKTAR } from '../../../ortak/veri/miktar.ts';
import { TalepAc } from './TalepAc.tsx';
import { Taleplerim } from './Taleplerim.tsx';
import { TaleplerimSayfasi } from './TaleplerimSayfasi.tsx';
import { anahtarlar, karsilikYaz, kartKarsiligi } from './ortak.ts';
import { rotalar } from '../rotalar.tsx';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{ no: 7, kod: 'HM-00007', ad: 'Deneme rulman', birim: 'adet', kategori: 'Rulman', katalogId: null, stokBirimi: 'adet', birimKg: 2.5 }] } satisfies MalzemeSecenekleriCevabi;
// 3100: kg stoklu çubuk (parça ağırlığı bilinir) ve kg stoklu levha (bilinmez); yalnız 3100 testlerinde listelenir.
const KG_KARTLAR = { malzemeler: [
  ...KARTLAR.malzemeler,
  { no: 21, kod: 'HM-00021', ad: 'Deneme çubuk', birim: 'kg', kategori: null, katalogId: null, stokBirimi: 'kg', birimKg: 2.466, hammadde: true },
  { no: 22, kod: 'HM-00022', ad: 'Deneme levha', birim: 'kg', kategori: null, katalogId: null, stokBirimi: 'kg', birimKg: null, hammadde: true },
] } satisfies MalzemeSecenekleriCevabi;
const HIZMETLER = { malzemeler: [{ no: 11, kod: 'HZ-00011', ad: 'Deneme kaplama', birim: 'saat', kategori: null, katalogId: null }] } satisfies MalzemeSecenekleriCevabi;
const EMIRLER = { emirler: [{ id: 31, emirNo: 'UE-000031', parcaNo: 'P-31', parcaAd: 'Deneme parça' }] } satisfies AcikEmirlerCevabi;
const talep = (n: number, ek: Partial<Talebim> = {}): Talebim => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, no: `ST-2026-${String(n).padStart(3, '0')}`, baslik: `Deneme talep ${n}`, durum: 'taslak',
  ihtiyacTarihi: null, olusturma: '2026-10-09T08:00:00Z', uretimEmriNo: null, kaynak: 'elle',
  kalemler: [{ ad: 'Deneme rulman', miktar: '3', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null }], ...ek,
});
const ON_TALEP: OnTalep = {
  kaynak: 'fason', isEmriId: 501, uretimEmriId: 31, emirNo: 'UE-000031', opNo: 30, adim: 'Deneme ısıl işlem', parca: { no: 9, kod: 'MM-00009', ad: 'Deneme flanş' },
  urun: 'Deneme flanş', miktar: 12, birim: 'adet', gerekenTarih: '2026-11-03', terminGun: 4, firmaAdi: 'Deneme Fason A',
};
const ON_TALEPLER = { onTalepler: [ON_TALEP], yoksayilanlar: [] } satisfies OnTalepleriCevabi;
const PLAN_TALEBI: OnTalep = {
  kaynak: 'plan', malzeme: { no: 7, kod: 'HM-00007', ad: 'Deneme rulman' }, miktar: 6.5, birim: 'adet', gerekenTarih: '2026-11-10',
  emirler: ['UE-000031', 'UE-000032'], stokBilinmiyor: true, hesap: { eksik: 10, siparis: 2, talep: 1.5, yoksayilan: 0 },
};
let onListe: OnTalepleriCevabi = ON_TALEPLER;
let kartListesi: MalzemeSecenekleriCevabi = KARTLAR;

interface Cagri { yol: string; govde: unknown; kimlik: string | undefined }
// ag.kopuk: hızlı açma isteği cevapsız kalır (sunucuya ulaşılamaz).
function sunucuKur(ag = { kopuk: false }): Cagri[] {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null, kimlik: (istek?.headers as Record<string, string> | undefined)?.['istek-kimligi'] });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, yol.includes('tur=hizmet') ? HIZMETLER : kartListesi);
    if (yol === '/satin-alma-acik-emirler') return json(200, EMIRLER);
    if (yol === '/satin-alma-on-talepleri') return json(200, onListe);
    if (yol === '/satin-alma-on-talepleri/yoksay') return json(200, { tamam: true });
    if (yol === '/satin-alma-talepleri/hizli-ac') {
      if (ag.kopuk) throw new TypeError('Failed to fetch');
      return json(200, talep(1, { no: 'ST-2026-042' }));
    }
    if (yol.startsWith('/satin-alma-taleplerim?')) {
      const sinir = Number(new URL(yol, 'http://x').searchParams.get('sinir'));
      const hepsi = Array.from({ length: 12 }, (_, i) => talep(i + 1, i === 0
        ? { durum: 'onayda', kaynak: 'fason', kalemler: [{ ad: 'Deneme serbest', miktar: '2', birim: 'adet', kartBekliyor: true, uygulanan: 'MM-00009 · Deneme flanş', fasonAdim: 'UE-000031 · Op 30' }] }
        : {}));
      return json(200, { talepler: hepsi.slice(0, sinir), toplam: hepsi.length } satisfies TaleplerimCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const sar = (cocuk: ReactNode, adres = '/taleplerim') => render(
  <MemoryRouter initialEntries={[adres]}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{cocuk}</BildirimSaglayici></QueryClientProvider>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); onListe = ON_TALEPLER; kartListesi = KARTLAR; });

describe('Ana sayfadan talep (#375)', () => {
  it('kartlı ve adıyla yazılan kalemle talep gönderir; gövdede kişi alanı yok, kartsız kalem kart bekler', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.change(screen.getByLabelText('Malzeme'), { target: { value: 'rulman' } });
    fireEvent.click(await screen.findByRole('option', { name: /HM-00007 Deneme rulman/ }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '3,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kalem ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    expect(screen.getByText('kart bekliyor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getAllByLabelText(/^Miktar/)[1]!, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect(g.kalemler).toEqual([
      { malzemeNo: 7, ad: '', birim: '', miktar: '3.5', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
      { malzemeNo: null, ad: 'Deneme serbest', birim: 'adet', miktar: '2', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
    ]);
    expect(Object.keys(g).sort()).toEqual(['aciklama', 'id', 'ihtiyacTarihi', 'kalemler', 'tur', 'uretimEmriId']);
    expect(g.uretimEmriId).toBeNull();
    expect(g.tur).toBe('malzeme');
  });

  it('isteğe bağlı üretim emri: açık emirler listelenir, seçilen emir gövdeye girer; seçilmezse null gider', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const secim = await screen.findByLabelText(/Üretim emri/);
    await screen.findByRole('option', { name: /UE-000031 · P-31 Deneme parça/ });
    expect((secim as HTMLSelectElement).value).toBe('');
    fireEvent.change(secim, { target: { value: '31' } });
    serbestKalem('2');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect((cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { uretimEmriId: number | null }).uretimEmriId).toBe(31);
    await waitFor(() => expect((screen.getByLabelText(/Üretim emri/) as HTMLSelectElement).value).toBe(''));
  });

  it('Taleplerim satırında emir no görünür', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { talepler: [talep(1, { uretimEmriNo: 'UE-000031' })], toplam: 1 } satisfies TaleplerimCevabi)));
    sar(<Taleplerim />);
    expect((await screen.findByText(/üretim emri UE-000031/)).textContent).toContain('UE-000031');
  });

  it('SAT-78 (2871): Taleplerim kalemi kg karşılığını gösterir; karşılığı olmayan kalemde gösterilmez', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { talepler: [talep(1, { kalemler: [
      { ad: 'Deneme çubuk', miktar: '4', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null, karsilik: { miktar: '10.25', birim: 'kg' } },
      { ad: 'Deneme levha', miktar: '3', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null, karsilik: null },
    ] })], toplam: 1 } satisfies TaleplerimCevabi)));
    sar(<Taleplerim />);
    const satir = await screen.findByText(/Deneme çubuk 4 adet/);
    expect(satir.textContent).toContain('Deneme çubuk 4 adet (≈ 10,25 kg), Deneme levha 3 adet');
    expect(satir.textContent).not.toContain('Deneme levha 3 adet (');
  });

  it('SAT-78 (2871): yeni talepte kartın birim ağırlığı ve girilen miktarın kg karşılığı görünür', async () => {
    sunucuKur();
    sar(<TalepAc />);
    const kutu = screen.getByRole('combobox', { name: 'Malzeme' });
    fireEvent.focus(kutu);
    fireEvent.click(await screen.findByRole('option', { name: /HM-00007/ }));
    expect(screen.getByText('1 adet ≈ 2,5 kg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '4' } });
    expect(screen.getByText('≈ 10 kg (1 adet ≈ 2,5 kg)')).toBeTruthy();
  });

  it('SAT-78 (2871): birim ağırlık parça başınadır; metre ya da alan stoklu kartta karşılık yok; 0,01 altı sıfır yazılmaz', () => {
    for (const b of ['m', 'M', 'mm', 'm²', 'm2']) expect(kartKarsiligi({ birim: b, stokBirimi: b, birimKg: 2.466 }, '1.5')).toBeNull();
    expect(kartKarsiligi({ birim: 'rulo', stokBirimi: 'rulo', birimKg: 12.5 }, '2')).toBe('≈ 25 kg (1 rulo ≈ 12,5 kg)');
    expect(karsilikYaz({ miktar: '0.004', birim: 'kg' })).toBe('< 0,01 kg');
    expect(karsilikYaz({ miktar: '0', birim: 'kg' })).toBe('≈ 0 kg');
  });

  it('SAT-79 (2871-1 a): taslak talepte Düzenle formu doldurur; kayıt sürümle düzenleme ucuna gider, var olan kalem kimliğiyle', async () => {
    const duzenlenen = talep(1, { surum: 3, aciklama: 'Eski not', duzenlenebilir: true, ihtiyacTarihi: '2026-12-01',
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000a1', aciklama: '', ad: 'Deneme rulman', miktar: '3', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null }] });
    const cagrilar: { yol: string; govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
      if (yol.startsWith('/satin-alma-taleplerim?')) return json(200, { talepler: [duzenlenen, talep(2, { durum: 'teklif_isteniyor', duzenlenebilir: false })], toplam: 2 } satisfies TaleplerimCevabi);
      if (yol.endsWith('/talebimi-duzenle')) return json(200, { ...duzenlenen, surum: 4 });
      if (yol === '/satin-alma-on-talepleri') return json(200, onListe);
      if (yol === '/satin-alma-acik-emirler') return json(200, EMIRLER);
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    sar(<TaleplerimSayfasi />, '/taleplerim?bolum=liste');
    fireEvent.click(await screen.findByText('Deneme talep 2'));
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    fireEvent.click(screen.getByText('Deneme talep 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
    expect(await screen.findByText(`Talebi düzenle: ${duzenlenen.no}`)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Talep türü' })).toBeNull();
    const miktar = screen.getByLabelText(/^Miktar \(adet\)/) as HTMLInputElement;
    expect(miktar.value).toBe('3');
    fireEvent.change(miktar, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === `/satin-alma-talepleri/${duzenlenen.id}/talebimi-duzenle`)).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/talebimi-duzenle'))!.govde).toEqual({
      surum: 3, ihtiyacTarihi: '2026-12-01', aciklama: 'Eski not',
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000a1', malzemeNo: null, ad: '', birim: '', miktar: '5', aciklama: '' }],
    });
  });

  it('SAT-80 (2876): teklif toplanırken "Güncelleme talebi aç" formu doldurur; yeni kimlikle güncelleme ucuna gider; grup satırda görünür', async () => {
    const kok = talep(1, { durum: 'teklif_isteniyor', surum: 5, aciklama: 'Eski not', guncellenebilir: true, ihtiyacTarihi: '2026-12-01',
      guncellemeGrubu: [{ id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-001', durum: 'teklif_isteniyor', kok: true }, { id: '00000000-0000-4000-8000-000000000009', no: 'ST-2026-009', durum: 'taslak', kok: false }],
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000a1', aciklama: '', ad: 'Deneme rulman', miktar: '3', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null }] });
    const cagrilar: { yol: string; govde: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
      if (yol.startsWith('/satin-alma-taleplerim?')) return json(200, { talepler: [kok], toplam: 1 } satisfies TaleplerimCevabi);
      if (yol.endsWith('/guncelleme-ac')) return json(200, talep(9, { durum: 'taslak' }));
      if (yol === '/satin-alma-on-talepleri') return json(200, onListe);
      if (yol === '/satin-alma-acik-emirler') return json(200, EMIRLER);
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    sar(<TaleplerimSayfasi />, '/taleplerim?bolum=liste');
    expect((await screen.findByText(/Güncellemeleri:/)).textContent).toContain('ST-2026-009 satın almada');
    fireEvent.click(screen.getByText('Deneme talep 1'));
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Güncelleme talebi aç' }));
    expect(await screen.findByText(`Güncelleme talebi: ${kok.no}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Miktar \(adet\)/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelleme talebini gönder' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === `/satin-alma-talepleri/${kok.id}/guncelleme-ac`)).toBe(true));
    const govde = cagrilar.find((c) => c.yol.endsWith('/guncelleme-ac'))!.govde as Record<string, unknown>;
    expect(typeof govde.id).toBe('string');
    expect({ ...govde, id: undefined }).toEqual({
      id: undefined, surum: 5, ihtiyacTarihi: '2026-12-01', aciklama: 'Eski not',
      kalemler: [{ id: '00000000-0000-4000-8000-0000000000a1', malzemeNo: null, ad: '', birim: '', miktar: '6', aciklama: '' }],
    });
  });

  it('#1192: kalem alanı odaklanınca açılır liste olur; ok ve Enter ile seçilir, satırda kategori ve birim görünür', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const kutu = screen.getByRole('combobox', { name: 'Malzeme' });
    fireEvent.focus(kutu);
    expect(kutu.getAttribute('aria-expanded')).toBe('true');
    expect((await screen.findByRole('option', { name: /HM-00007/ })).textContent).toContain('Rulman · adet');
    expect(cagrilar.some((c) => c.yol === '/satin-alma-malzeme-secenekleri?ara=&tur=malzeme')).toBe(true);
    fireEvent.keyDown(kutu, { key: 'ArrowDown' });
    fireEvent.keyDown(kutu, { key: 'Enter' });
    expect(screen.getByText('Deneme rulman')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Malzeme' })).toBeNull();
  });

  const kartSec = async (ad: string) => {
    fireEvent.focus(screen.getByRole('combobox', { name: 'Malzeme' }));
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(ad) }));
  };
  it('3100 izinli: kg stoklu çubukta adet yazınca kg dolar; kg yazınca yaklaşık adet görünür; talep kg ile gider', async () => {
    const cagrilar = sunucuKur();
    kartListesi = KG_KARTLAR;
    sar(<TalepAc />);
    await kartSec('Deneme çubuk');
    expect(screen.getByText('1 parça ≈ 2,47 kg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '20' } });
    expect((screen.getByLabelText(/^Miktar \(kg\)/) as HTMLInputElement).value).toBe('49,32');
    fireEvent.change(screen.getByLabelText(/^Miktar \(kg\)/), { target: { value: '50' } });
    expect((screen.getByLabelText('Adet') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Adet').getAttribute('placeholder')).toBe('≈ 20,3 adet');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(true));
    const govde = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { kalemler: Record<string, unknown>[] };
    expect(govde.kalemler[0]).toMatchObject({ malzemeNo: 21, miktar: '50' });
    expect(JSON.stringify(govde)).not.toContain('adet');
  });
  it('3100 yasak: kesirli adet kg uydurmaz (kg boşalır, alan hatalı); sıfır kg yaklaşık adet göstermez', async () => {
    sunucuKur();
    kartListesi = KG_KARTLAR;
    sar(<TalepAc />);
    await kartSec('Deneme çubuk');
    const adet = screen.getByLabelText('Adet');
    fireEvent.change(adet, { target: { value: '2' } });
    expect((screen.getByLabelText(/^Miktar \(kg\)/) as HTMLInputElement).value).toBe('4,932');
    fireEvent.change(adet, { target: { value: '2,5' } });
    expect((screen.getByLabelText(/^Miktar \(kg\)/) as HTMLInputElement).value).toBe('');
    expect(adet.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Adet tam sayı olur; kesirli miktarı kg olarak yazın.');
    fireEvent.change(adet, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^Miktar \(kg\)/), { target: { value: '0' } });
    expect(screen.getByLabelText('Adet').getAttribute('placeholder')).toBe('Kaç parça');
  });
  it('3100 yasak: parça ağırlığı olmayan kg kartta adet alanı yok, nedeni yazılır; adet stoklu kartta adet alanı yok', async () => {
    sunucuKur();
    kartListesi = KG_KARTLAR;
    sar(<TalepAc />);
    await kartSec('Deneme levha');
    expect(screen.queryByLabelText('Adet')).toBeNull();
    expect(screen.getByText('Kartta parça ağırlığı yok; adet karşılığı hesaplanamaz.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
    await kartSec('Deneme rulman');
    expect(screen.queryByLabelText('Adet')).toBeNull();
    expect(screen.queryByText(/parça ağırlığı yok/)).toBeNull();
  });
  it('3100: karşılık metni adet için bir ondalık yazar', () => {
    expect(karsilikYaz({ miktar: '20.27575', birim: 'adet' })).toBe('≈ 20,3 adet');
    expect(karsilikYaz({ miktar: '4', birim: 'adet' })).toBe('≈ 4 adet');
  });

  it('#1192: Hizmet seçilince liste yalnız hizmet kartlarını ister, kalemler sıfırlanır ve talep hizmet türüyle gider', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hizmet' }));
    expect(screen.getByRole('button', { name: 'Hizmet' }).getAttribute('aria-pressed')).toBe('true');
    const kutu = screen.getByRole('combobox', { name: 'Hizmet' });
    fireEvent.change(kutu, { target: { value: 'kaplama' } });
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/satin-alma-malzeme-secenekleri?ara=kaplama&tur=hizmet')).toBe(true));
    expect(cagrilar.filter((c) => c.yol.startsWith('/satin-alma-malzeme-secenekleri?')).every((c) => c.yol.endsWith('tur=hizmet'))).toBe(true);
    fireEvent.click(await screen.findByRole('option', { name: /HZ-00011/ }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { tur: string; kalemler: unknown[] };
    expect([g.tur, g.kalemler]).toEqual(['hizmet', [{ malzemeNo: 11, ad: '', birim: '', miktar: '8', aciklama: '', uygulananMalzemeNo: null, isEmriId: null }]]);
  });

  it('gönderilen talep ana sayfadaki satın alma sayılarını da yeniler', async () => {
    sunucuKur();
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const yenile = vi.spyOn(istemci, 'invalidateQueries');
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><TalepAc /></BildirimSaglayici></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect(yenile.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(anahtarlar.ozet);
  });

  it('eksik kalemle gönderilmez; kart sayfasına yeni sekmede bağlantı vardır', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/malzemeyi seçin/);
    expect(cagrilar.some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(false);
    const bag = screen.getByRole('link');
    expect([bag.getAttribute('target'), bag.getAttribute('rel')]).toEqual(['_blank', 'noopener']);
  });

  const serbestKalem = (miktar: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Adıyla yazın' }));
    fireEvent.change(screen.getByLabelText(/Kalem adı/), { target: { value: 'Deneme serbest' } });
    fireEvent.change(screen.getByLabelText(/Birim/), { target: { value: 'adet' } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: miktar } });
  };
  const gonderilenMiktar = (cagrilar: Cagri[]) =>
    (cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac').at(-1)!.govde as { kalemler: { miktar: string }[] }).kalemler[0]!.miktar;

  it('Y2, denetim #37: "12.5" ve "12,5" on iki buçuk, "1.250,5" bin iki yüz elli buçuk; virgülsüz "1.250" belirsiz, okunamayan miktar gönderilmez', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    const gonderilenler: string[] = [];
    for (const [i, girilen] of ['12.5', '12,5', '1.250,5'].entries()) {
      if (i > 0) await screen.findByRole('button', { name: 'Adıyla yazın' });
      serbestKalem(girilen);
      fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
      await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac').length).toBe(i + 1));
      gonderilenler.push(gonderilenMiktar(cagrilar));
    }
    expect(gonderilenler).toEqual(['12.5', '12.5', '1250.5']);
    await screen.findByRole('button', { name: 'Adıyla yazın' });
    const once = cagrilar.length;
    serbestKalem('1.250');
    for (const [yanlis, ileti] of [['1.250', BELIRSIZ_MIKTAR], ['iki', 'Miktarı sayı olarak yazın'], ['-3', 'Miktar sıfırdan büyük olmalı.']] as const) {
      fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: yanlis } });
      fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(ileti));
    }
    expect(cagrilar.slice(once).some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(false);
  });

  it('KD-010: ağ kopunca elle yeniden gönderim aynı kimlikle gider; form değişince kimlik yenilenir', async () => {
    const ag = { kopuk: true };
    const cagrilar = sunucuKur(ag);
    sar(<TalepAc />);
    serbestKalem('2');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByRole('alert', {}, { timeout: 8000 });
    const ac = () => cagrilar.filter((c) => c.yol === '/satin-alma-talepleri/hizli-ac');
    const ilk = ac()[0]!;
    expect(new Set(ac().map((c) => c.kimlik))).toEqual(new Set([ilk.kimlik]));
    expect(ilk.kimlik).toBe((ilk.govde as { id: string }).id);
    ag.kopuk = false;
    const dugme = screen.getByRole('button', { name: 'Talebi gönder' }) as HTMLButtonElement;
    await waitFor(() => expect(dugme.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    expect([ac().at(-1)!.kimlik, (ac().at(-1)!.govde as { id: string }).id]).toEqual([ilk.kimlik, ilk.kimlik]);
    serbestKalem('3');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => expect(gonderilenMiktar(cagrilar)).toBe('3'));
    expect(ac().at(-1)!.kimlik).not.toBe(ilk.kimlik);
  }, 15_000);

  it('Taleplerim son 10 talebi durumuyla gösterir, kart bekleyeni işaretler; "Tümü" hepsini açar', async () => {
    const cagrilar = sunucuKur();
    sar(<Taleplerim />);
    await screen.findByText('ST-2026-001');
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Onayda')).toBeTruthy();
    expect(screen.getByText('1 kalem kart bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tümü (12)' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(12));
    expect(cagrilar.map((c) => c.yol)).toContain('/satin-alma-taleplerim?sinir=500');
  });
});

describe('Planlama menüsünde Taleplerim sayfası (12.10.2026)', () => {
  it('menüde Planlama grubundadır; rotası ön talepleri, kişinin taleplerini ve talep formunu üç bölümde açar', async () => {
    expect(SAYFALAR.find((x) => x.yol === '/taleplerim')).toMatchObject({ islem: 'sayfa.taleplerim', grup: 'Planlama', baslik: 'Taleplerim' });
    expect(rotalar.find((r) => r.yol === '/taleplerim')?.ekran).toBe(TaleplerimSayfasi);
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    expect(await screen.findByText('UE-000031')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Taleplerim/ }));
    expect(await screen.findByText('ST-2026-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Yeni talep/ }));
    expect(screen.getByLabelText('Malzeme')).toBeTruthy();
  });

  it('1237: Ctrl K komutu adresle yeni talep bölümünü, arama sonucu talep listesini açar', async () => {
    sunucuKur();
    sar(<TaleplerimSayfasi />, '/taleplerim?bolum=yeni');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Yeni talep/ }).getAttribute('aria-selected')).toBe('true'));
    cleanup();
    sar(<TaleplerimSayfasi />, '/taleplerim?bolum=liste');
    expect(await screen.findByText('ST-2026-001')).toBeTruthy();
  });

  it('898 a: ön talep "Talebe çevir" formu hizmet, emir, parça ve fason bağıyla doldurur; gönderimde bağ gövdeye girer', async () => {
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Talebe çevir' }));
    expect(screen.getByRole('button', { name: 'Hizmet' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: 'Malzeme' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Deneme flanş')).toBeTruthy();
    expect((screen.getByLabelText(/Kalem adı/) as HTMLInputElement).value).toBe('Deneme ısıl işlem');
    expect((screen.getByLabelText('İstenen tarih') as HTMLInputElement).value).toBe('2026-11-03');
    await waitFor(() => expect((screen.getByLabelText(/Üretim emri/) as HTMLSelectElement).value).toBe('31'));
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect([g.tur, g.uretimEmriId, g.ihtiyacTarihi, g.kalemler]).toEqual(['hizmet', 31, '2026-11-03', [
      { malzemeNo: null, ad: 'Deneme ısıl işlem', birim: 'adet', miktar: '12', aciklama: '', uygulananMalzemeNo: 9, isEmriId: 501 },
    ]]);
    expect(screen.getByRole('tab', { name: /^Taleplerim/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('898 a: yoksayma nedenle gider; "Diğer" seçilince not zorunludur', async () => {
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yoksay' }));
    const pencere = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('Neden'), { target: { value: 'Diğer' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yoksay' }));
    expect(within(pencere).getByRole('alert').textContent).toBe('Nedeni yazın.');
    fireEvent.change(screen.getByLabelText('Neden'), { target: { value: 'Başka talepte var' } });
    fireEvent.change(screen.getByLabelText('Not'), { target: { value: 'ST-2026-009' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yoksay' }));
    await screen.findByText('Ön talep yoksayıldı.');
    expect(cagrilar.find((c) => c.yol === '/satin-alma-on-talepleri/yoksay')!.govde).toEqual({ kaynak: 'fason', isEmriId: 501, neden: 'Başka talepte var: ST-2026-009' });
  });

  it('898 a Dal 2: plan ihtiyacı hesabıyla görünür; talebe çevirince malzeme kartı ve kalan miktarla dolar; yoksayma malzemeyle gider', async () => {
    onListe = { onTalepler: [PLAN_TALEBI], yoksayilanlar: [] };
    const cagrilar = sunucuKur();
    sar(<TaleplerimSayfasi />);
    expect(await screen.findByText(/Eksik 10 − açık sipariş 2 − açık talep 1,5/)).toBeTruthy();
    expect(screen.getByText('Stok kaydı yok')).toBeTruthy();
    expect(screen.getByText('Bekleyen fason ön talep yok.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yoksay' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yoksay' }));
    await screen.findByText('Ön talep yoksayıldı.');
    expect(cagrilar.find((c) => c.yol === '/satin-alma-on-talepleri/yoksay')!.govde).toEqual({ kaynak: 'plan', malzemeNo: 7, neden: 'Stokta var, sayım güncel değil' });
    fireEvent.click(screen.getByRole('button', { name: 'Talebe çevir' }));
    expect(screen.getByRole('button', { name: 'Malzeme' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Plan ihtiyacı', { selector: '.sa-talep-kaynak *' })).toBeTruthy();
    expect((screen.getByLabelText('İstenen tarih') as HTMLInputElement).value).toBe('2026-11-10');
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    await screen.findByText('ST-2026-042 açıldı; satın almaya düştü.');
    const g = cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as Record<string, unknown>;
    expect([g.tur, g.uretimEmriId, g.kalemler]).toEqual(['malzeme', null, [
      { malzemeNo: 7, ad: '', birim: '', miktar: '6.5', aciklama: '', uygulananMalzemeNo: null, isEmriId: null },
    ]]);
  });

  it('898 a Dal 2: fason adım ve plan ihtiyacı birlikte seçilince birleştirme kapalıdır', async () => {
    onListe = { onTalepler: [ON_TALEP, PLAN_TALEBI], yoksayilanlar: [] };
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(await screen.findByLabelText('UE-000031 Op 30 Deneme ısıl işlem seç'));
    fireEvent.click(screen.getByLabelText('HM-00007 seç'));
    expect(screen.getByText(/fason adım ve plan ihtiyacı ayrı talep olur/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Tek talepte birleştir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('898 a: Taleplerim bölümü durumla süzer, arar; satır açılınca uygulanan parça ve fason adım görünür', async () => {
    sunucuKur();
    sar(<TaleplerimSayfasi />);
    fireEvent.click(screen.getByRole('tab', { name: /^Taleplerim/ }));
    await screen.findByText('ST-2026-012');
    fireEvent.click(screen.getByRole('button', { name: 'Onayda', pressed: false }));
    await waitFor(() => expect(screen.queryByText('ST-2026-012')).toBeNull());
    const satir = screen.getByRole('button', { name: /ST-2026-001/ });
    expect(screen.getByText('Fason adım')).toBeTruthy();
    fireEvent.click(satir);
    expect(screen.getByText('Uygulanacak malzeme: MM-00009 · Deneme flanş · Fason: UE-000031 · Op 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hepsi' }));
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'talep 12' } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /ST-2026-0/ })).toHaveLength(1));
  });
});
