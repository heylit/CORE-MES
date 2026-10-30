import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/cizimler.ts';
import type { HurdaNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type {
  BirimAyrintisi, BirimlerCevabi, EmirOzetiCevabi, MarkalamaBirimi, MarkalamaTanimi, OnizlemeCevabi, TanimEmirleriCevabi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '../../ortak/veri/api.ts';
import { Istasyon } from './Istasyon.tsx';
import { Izleme } from './Izleme.tsx';
import { Tanimlar } from './Tanimlar.tsx';

// Model okuyucu Web Worker ve WASM ister; ekran testinde sahne kurulmaz.
vi.mock('../cizimler/disari.ts', () => ({ modelOku: vi.fn(() => new Promise(() => {})), birak: vi.fn() }));

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.markalama', 'markalama.tanim-yaz', 'markalama.seri-ver', 'markalama.durum-yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.markalama'] };

const TANIM: MarkalamaTanimi = {
  id: 7, malzemeId: 11, malzemeKodu: 'ORN-A', opNo: 40, seriSablonu: '{PARCA}-{SEQ:5}', sayacKapsami: 'malzeme', baslangicSirasi: 1, dogrulama: true,
  model: null, surum: 3, degismeZamani: '2026-10-27T08:00:00Z',
  alanlar: [{
    sira: 1, ad: 'Seri no', icerik: 'seri', sabitMetin: null, kodTuru: 'datamatrix', yontem: 'lazer', yaziYuksekligiMm: 2, yaziDerinligiMm: null, yaziTipi: null, program: null, yuzey: 'Flanş yüzü', yer: null,
  }],
};

const birim = (b: Partial<MarkalamaBirimi> = {}): MarkalamaBirimi => ({
  id: 31, seriNo: 'ORN-A-00005', tanimId: 7, malzemeId: 11, uretimEmriId: 5, istasyonId: null, durum: 'saglam', dogrulamaZamani: null, surum: 1,
  zaman: '2026-10-27T09:00:00Z', ...b,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown; kimlik: string | null }

function sunucuKur(kullanici: Kullanici, birimDurumu: MarkalamaBirimi['durum'] = 'saglam') {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const basliklar = new Headers(secenek?.headers);
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, kimlik: basliklar.get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/markalama/tanimlar') return json(200, { tanimlar: [TANIM] } satisfies TanimlarCevabi);
    if (yol.startsWith('/markalama/tanimlar/7/onizleme')) return json(200, { numaralar: ['ORN-A-00005', 'ORN-A-00006'] } satisfies OnizlemeCevabi);
    if (yol === '/markalama/tanimlar/7/emirler') return json(200, { emirler: [{ id: 5, emirNo: 'UE-DNM-1', adet: 10, durum: 'acik' }] } satisfies TanimEmirleriCevabi);
    if (yol === '/markalama/tanimlar/7/kaydet') return json(200, { ...TANIM, surum: 4 });
    if (yol === '/markalama/emirler/5/ozet') {
      return json(200, { uretimEmriId: 5, sayilar: { saglam: 4, red: 0, rework: 0, hurda: 1 }, dogrulanan: 3 } satisfies EmirOzetiCevabi);
    }
    if (yol.startsWith('/markalama/birimler?') || yol === '/markalama/birimler') return json(200, { birimler: [birim({ durum: birimDurumu })] } satisfies BirimlerCevabi);
    if (yol === '/markalama/birimler/markala') return json(200, birim());
    if (yol === '/markalama/birimler/31') {
      return json(200, {
        ...birim({ durum: birimDurumu }), emirNo: 'UE-DNM-1',
        olaylar: [{ id: 1, olay: 'markalandi', hurdaNedeniId: null, aciklama: null, kisiId: 1, zaman: '2026-10-27T09:00:00Z' }],
      } satisfies BirimAyrintisi);
    }
    if (yol === '/markalama/birimler/31/durum') return json(200, birim({ durum: 'hurda', surum: 2 }));
    if (yol.startsWith('/hurda-nedenleri')) {
      return json(200, { nedenler: [{ id: 9, kod: 'H-01', ad: 'Deneme hurda', aktif: true, sira: 1, surum: 1 }], onerilenKod: 'H-02' } satisfies HurdaNedenleriCevabi);
    }
    if (yol === '/cizimler/malzemeler/11/belgeler') return json(200, { belgeler: [], oneriler: [], kucukResim: null } satisfies MalzemeBelgeleriCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Markalama tanımları', () => {
  it('tanım seçilince düzenleyici açılır; marka eklenip kaydedilince sürümle ve sıralı markalarla gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Tanimlar />);
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    expect(await screen.findByText('ORN-A-00006')).toBeTruthy();
    expect(await screen.findByText('Bu malzemeye bağlı model yok; Çizim Merkezi\'nden STEP ya da STL ekleyin.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Marka ekle/ }));
    fireEvent.change(screen.getByLabelText('Sabit metin'), { target: { value: 'C' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Nokta vuruş' }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/markalama/tanimlar/7/kaydet')).toBe(true));
    const govde = cagrilar.find((c) => c.yol === '/markalama/tanimlar/7/kaydet')!.govde as { surum: number; alanlar: { icerik: string; yontem: string; sabitMetin: string | null }[] };
    expect(govde.surum).toBe(3);
    expect(govde.alanlar.map((a) => [a.icerik, a.yontem, a.sabitMetin])).toEqual([['seri', 'lazer', null], ['sabit', 'nokta_vurus', 'C']]);
  });

  it('yükseklik ve derinlik virgülle ondalık girilir, yazı tipi seçilir ve kayda gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Tanimlar />);
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    const yukseklik = await screen.findByLabelText(/Yazı yüksekliği/);
    for (const v of ['0', '0,', '0,5']) fireEvent.change(yukseklik, { target: { value: v } });
    expect((yukseklik as HTMLInputElement).value).toBe('0,5');
    const derinlik = screen.getByLabelText(/Yazı derinliği/);
    for (const v of ['0', '0,', '0,0', '0,05']) fireEvent.change(derinlik, { target: { value: v } });
    expect((derinlik as HTMLInputElement).value).toBe('0,05');
    fireEvent.change(screen.getByLabelText('Yazı tipi'), { target: { value: 'gotik' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/markalama/tanimlar/7/kaydet')).toBe(true));
    const govde = cagrilar.find((c) => c.yol === '/markalama/tanimlar/7/kaydet')!.govde as { alanlar: Record<string, unknown>[] };
    expect(govde.alanlar[0]).toMatchObject({ yaziYuksekligiMm: 0.5, yaziDerinligiMm: 0.05, yaziTipi: 'gotik' });
  });

  it('0 yükseklik istek gönderilmeden markanın sırası ve alan adıyla söylenir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Tanimlar />);
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    fireEvent.change(await screen.findByLabelText(/Yazı yüksekliği/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('1. marka (Seri no): Yazı yüksekliği 0\'dan büyük olmalı.');
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
  });

  it('düzenleme yetkisi olmayan kişi tanımı görür, kaydedemez', async () => {
    sunucuKur(IZLEYICI);
    ac(<Tanimlar />);
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    expect(await screen.findByText('Markalar ve sırası')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni tanım/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kaydet/ })).toBeNull();
  });
});

describe('Markalama istasyonu', () => {
  it('parça ve emir seçilince sıradaki seri görünür; Markalandı istek kimliğiyle gider ve doğrulama bekler', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Istasyon />);
    fireEvent.change(await screen.findByLabelText('Parça ve operasyon'), { target: { value: '7' } });
    const emir = await screen.findByLabelText('Üretim emri');
    await screen.findByRole('option', { name: /UE-DNM-1/ });
    fireEvent.change(emir, { target: { value: '5' } });
    expect(await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-buyuk' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Markalandı/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/markalama/birimler/markala')).toBe(true));
    const c = cagrilar.find((x) => x.yol === '/markalama/birimler/markala')!;
    expect(c.govde).toEqual({ tanimId: 7, uretimEmriId: 5, istasyonId: null, sonuc: 'iyi' });
    expect(c.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-bolum .mono' })).toBeTruthy();
  });
});

describe('Hatalı markalama', () => {
  it('onay sormadan numara yakmaz; Vazgeç istek göndermez, onayla hatalı sonuçla gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Istasyon />);
    fireEvent.change(await screen.findByLabelText('Parça ve operasyon'), { target: { value: '7' } });
    const emir = await screen.findByLabelText('Üretim emri');
    await screen.findByRole('option', { name: /UE-DNM-1/ });
    fireEvent.change(emir, { target: { value: '5' } });
    await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-buyuk' });
    const markalar = () => cagrilar.filter((c) => c.yol === '/markalama/birimler/markala');
    fireEvent.click(screen.getByRole('button', { name: /Hatalı markalama/ }));
    const pencere = await screen.findByRole('dialog');
    expect(markalar()).toHaveLength(0);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(markalar()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Hatalı markalama/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Numarayı yak/ }));
    await waitFor(() => expect(markalar()).toHaveLength(1));
    expect(markalar()[0]!.govde).toEqual({ tanimId: 7, uretimEmriId: 5, istasyonId: null, sonuc: 'hatali' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Seri izleme', () => {
  it('birim seçilince geçmiş görünür; hurda nedensiz gönderilemez, nedenle sürümüyle gider', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Izleme />);
    fireEvent.click(await screen.findByText('ORN-A-00005'));
    expect(await screen.findByText('UE-DNM-1')).toBeTruthy();
    expect(screen.getAllByText('Markalandı').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Rework$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Hurda$/ }));
    const pencere = await screen.findByRole('dialog');
    const gonder = within(pencere).getAllByRole('button', { name: /Hurda/ }).at(-1)!;
    expect((gonder as HTMLButtonElement).disabled).toBe(true);
    await within(pencere).findByRole('option', { name: /H-01/ });
    fireEvent.change(within(pencere).getByLabelText(/Hurda nedeni/), { target: { value: '9' } });
    fireEvent.click(gonder);
    await waitFor(() => expect(cagrilar.some((x) => x.yol === '/markalama/birimler/31/durum')).toBe(true));
    expect(cagrilar.find((x) => x.yol === '/markalama/birimler/31/durum')!.govde).toEqual({ komut: 'hurda', hurdaNedeniId: 9, aciklama: null, surum: 1 });
  });

  it('durum yazma yetkisi yoksa komut düğmesi yoktur', async () => {
    sunucuKur(IZLEYICI, 'red');
    ac(<Izleme />);
    fireEvent.click(await screen.findByText('ORN-A-00005'));
    expect(await screen.findByText('UE-DNM-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rework$/ })).toBeNull();
  });
});
