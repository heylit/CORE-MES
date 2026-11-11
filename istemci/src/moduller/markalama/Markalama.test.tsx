import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { HurdaNedenleriCevabi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
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
vi.mock('../belge-merkezi/disari.ts', () => ({ modelOku: vi.fn(() => new Promise(() => {})), birak: vi.fn() }));

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.markalama', 'markalama.tanim-yaz', 'markalama.seri-ver', 'markalama.durum-yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.markalama'] };

const TANIM: MarkalamaTanimi = {
  id: 7, malzemeId: 11, malzemeKodu: 'ORN-A', opNo: 40, seriSablonu: '{PARCA}-{SEQ:5}', sayacKapsami: 'malzeme', baslangicSirasi: 1, dogrulama: true, aktif: true,
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

const ISTASYONLAR: IstasyonSecimiCevabi = {
  gruplar: [{
    isMerkeziId: 1, isMerkeziKod: 'DNM', isMerkeziAd: 'Deneme Merkezi',
    istasyonlar: [
      { id: 21, kod: 'DNM-1', ad: 'Lazer 1', isMerkeziId: 1, tip: 'markalama', aktif: true },
      { id: 22, kod: 'DNM-2', ad: 'Eski Lazer', isMerkeziId: 1, tip: 'markalama', aktif: false },
      { id: 23, kod: 'DNM-3', ad: 'Torna 1', isMerkeziId: 1, tip: 'talasli', aktif: true },
    ],
  }],
};

function sunucuKur(
  kullanici: Kullanici, birimDurumu: MarkalamaBirimi['durum'] = 'saglam', istasyonlar: IstasyonSecimiCevabi = ISTASYONLAR,
  modelBelgeleri: MalzemeBelgeleriCevabi['belgeler'] = [],
) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const basliklar = new Headers(secenek?.headers);
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, kimlik: basliklar.get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/istasyonlar/secim') return json(200, istasyonlar);
    if (yol === '/markalama/tanimlar') return json(200, { tanimlar: [TANIM, { ...TANIM, id: 8, opNo: 50, seriSablonu: '{PARCA}-{SEQ:6}', aktif: false, model: { belgeId: 5, revizyon: 'A' } }] } satisfies TanimlarCevabi);
    if (yol === '/markalama/tanimlar/7/aktiflik') return json(200, { ...TANIM, aktif: false, surum: 4 });
    if (yol.startsWith('/markalama/tanimlar/7/onizleme')) return json(200, { numaralar: ['ORN-A-00005', 'ORN-A-00006'] } satisfies OnizlemeCevabi);
    if (yol === '/markalama/tanimlar/7/emirler') return json(200, { emirler: [{ id: 5, emirNo: 'UE-DNM-1', adet: 10, durum: 'acik' }] } satisfies TanimEmirleriCevabi);
    if (yol === '/markalama/tanimlar/7/kaydet') return json(200, { ...TANIM, surum: 4 });
    if (yol === '/markalama/emirler/5/ozet?tanimId=7') {
      return json(200, { uretimEmriId: 5, sayilar: { saglam: 4, red: 0, rework: 0, hurda: 1 }, dogrulanan: 3 } satisfies EmirOzetiCevabi);
    }
    if (yol.startsWith('/markalama/birimler?') || yol === '/markalama/birimler') return json(200, { birimler: [birim({ durum: birimDurumu })] } satisfies BirimlerCevabi);
    if (yol === '/markalama/birimler/markala') return json(200, birim());
    if (yol === '/markalama/birimler/31') {
      return json(200, {
        ...birim({ durum: birimDurumu }), emirNo: 'UE-DNM-1',
        olaylar: [
          { id: 1, olay: 'markalandi', hurdaNedeniId: null, hurdaNedeni: null, aciklama: null, kisiId: 1, kisiAd: 'Deneme Operatör', zaman: '2026-10-27T09:00:00Z' },
          { id: 2, olay: 'red', hurdaNedeniId: null, hurdaNedeni: null, aciklama: 'Deneme açıklama', kisiId: 2, kisiAd: 'Deneme Kalite', zaman: '2026-10-27T09:10:00Z' },
          ...(birimDurumu === 'hurda'
            ? [{ id: 3, olay: 'hurda' as const, hurdaNedeniId: 9, hurdaNedeni: 'H-01 · Deneme hurda', aciklama: null, kisiId: 2, kisiAd: 'Deneme Kalite', zaman: '2026-10-27T09:20:00Z' }]
            : []),
        ],
      } satisfies BirimAyrintisi);
    }
    if (yol === '/markalama/birimler/31/durum') return json(200, birim({ durum: 'hurda', surum: 2 }));
    if (yol.startsWith('/hurda-nedenleri')) {
      return json(200, { nedenler: [{ id: 9, kod: 'H-01', ad: 'Deneme hurda', aktif: true, sira: 1, surum: 1 }], onerilenKod: 'H-02' } satisfies HurdaNedenleriCevabi);
    }
    if (yol === '/cizimler/malzemeler/11/belgeler') return json(200, { belgeler: modelBelgeleri, oneriler: [], kucukResim: null } satisfies MalzemeBelgeleriCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: ReactNode, adres = '/markalama') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>
    </MemoryRouter>,
  );
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

  it('2138-2: model seçeneği merkezin harfini değil revizyon kodunu yazar; kodsuz revizyon adıyla', async () => {
    const rev = (id: number, sira: number, harf: string, revKodu: string | null, durum: 'yayinda' | 'taslak') => ({
      id, sira, harf, durum, ozet: 'a'.repeat(64), dosyaAdi: 'deneme.step', dosyaTuru: 'step' as const, boyut: 10, not: null, yukleyenAd: null,
      yuklendi: '2026-10-27T08:00:00Z', yayinlayanAd: null, yayinlandi: null, onizlemeKareSayisi: 0, antetRev: revKodu, revKodu,
    });
    sunucuKur(YONETICI, 'saglam', ISTASYONLAR, [{
      id: 5, ad: 'Deneme model', tur: '3b-model', resimNo: null, surum: 1, kapak: true,
      revizyonlar: [rev(52, 2, 'B', null, 'taslak'), rev(51, 1, 'A', '03', 'yayinda')],
    }]);
    ac(<Tanimlar />);
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    const secim = await screen.findByLabelText<HTMLSelectElement>('3B model');
    await waitFor(() => { expect(secim.options.length).toBe(3); });
    expect([...secim.options].map((o) => o.textContent)).toEqual(['Model yok', 'Deneme model · Kodsuz revizyon (taslak)', 'Deneme model · Rev 03']);
  });

  it('kayıtlı tanım pasif yapılır; listede durum rozeti görünür', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Tanimlar />);
    expect(await screen.findByText('Pasif')).toBeTruthy();
    // 2138-2: tanımdaki harf (merkezin iç sırası) listede görünmez.
    expect(screen.getByText('Model var')).toBeTruthy();
    expect(screen.queryByText('Rev A')).toBeNull();
    fireEvent.click(await screen.findByText('{PARCA}-{SEQ:5}'));
    fireEvent.click(await screen.findByRole('button', { name: /Pasif yap/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/markalama/tanimlar/7/aktiflik')).toBe(true));
    expect(cagrilar.find((c) => c.yol === '/markalama/tanimlar/7/aktiflik')!.govde).toEqual({ aktif: false, surum: 3 });
    expect(await screen.findByRole('button', { name: /Etkinleştir/ })).toBeTruthy();
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
    const istasyon = screen.getByLabelText('İstasyon');
    await screen.findByRole('option', { name: /Lazer 1/ });
    expect(screen.queryByRole('option', { name: /Eski Lazer/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /Torna 1/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Markalandı/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(istasyon, { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: /Markalandı/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/markalama/birimler/markala')).toBe(true));
    const c = cagrilar.find((x) => x.yol === '/markalama/birimler/markala')!;
    expect(c.govde).toEqual({ tanimId: 7, uretimEmriId: 5, istasyonId: 21, sonuc: 'iyi' });
    expect(c.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('option', { name: /Op 50/ })).toBeNull();
    expect(cagrilar.some((x) => x.yol === '/markalama/birimler?emirId=5&tanimId=7')).toBe(true);
    expect(await screen.findByText('4')).toBeTruthy();
    expect(await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-bolum .mono' })).toBeTruthy();
  });
});

describe('Çift dokunuş', () => {
  it('MRK-1: Markalandı çift dokunuşta tek istek, tek seri; sonraki parça yeni kimlikle', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Istasyon />);
    fireEvent.change(await screen.findByLabelText('Parça ve operasyon'), { target: { value: '7' } });
    const emir = await screen.findByLabelText('Üretim emri');
    await screen.findByRole('option', { name: /UE-DNM-1/ });
    fireEvent.change(emir, { target: { value: '5' } });
    await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-buyuk' });
    await screen.findByRole('option', { name: /Lazer 1/ });
    fireEvent.change(screen.getByLabelText('İstasyon'), { target: { value: '21' } });
    const markalar = () => cagrilar.filter((c) => c.yol === '/markalama/birimler/markala');
    const dugme = screen.getByRole('button', { name: /Markalandı/ });
    fireEvent.click(dugme);
    fireEvent.click(dugme);
    await waitFor(() => expect(screen.getByRole('button', { name: /Markalandı/ }).hasAttribute('disabled')).toBe(false));
    expect(markalar()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Markalandı/ }));
    await waitFor(() => expect(markalar()).toHaveLength(2));
    expect(markalar()[1]!.kimlik).not.toBe(markalar()[0]!.kimlik);
  });
});

describe('Markalama istasyonu, istasyon listesi boş', () => {
  it('2036: markalama istasyonu yoksa seri verilmez; düğmeler kapalı kalır', async () => {
    const cagrilar = sunucuKur(YONETICI, 'saglam', { gruplar: [] });
    ac(<Istasyon />);
    fireEvent.change(await screen.findByLabelText('Parça ve operasyon'), { target: { value: '7' } });
    const emir = await screen.findByLabelText('Üretim emri');
    await screen.findByRole('option', { name: /UE-DNM-1/ });
    fireEvent.change(emir, { target: { value: '5' } });
    await screen.findByText('ORN-A-00005', { selector: '.tc-mrk-buyuk' });
    await screen.findByRole('option', { name: 'Markalama istasyonu yok' });
    expect((screen.getByRole('button', { name: /Markalandı/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Hatalı markalama/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Seri vermek için markalama istasyonunu seçin.')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/markalama/birimler/markala')).toBe(false);
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
    await screen.findByRole('option', { name: /Lazer 1/ });
    fireEvent.change(screen.getByLabelText('İstasyon'), { target: { value: '21' } });
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
    expect(markalar()[0]!.govde).toEqual({ tanimId: 7, uretimEmriId: 5, istasyonId: 21, sonuc: 'hatali' });
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

  it('genel aramadan gelen seri adresle aranır ve tam eşleşme açılır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Izleme />, '/markalama/izleme?seri=ORN-A-00005');
    expect(await screen.findByText('UE-DNM-1')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/markalama/birimler?seriNo=ORN-A-00005')).toBe(true);
  });

  it('geçmişte kişi adı ve hurda nedeni görünür', async () => {
    sunucuKur(YONETICI, 'hurda');
    ac(<Izleme />);
    fireEvent.click(await screen.findByText('ORN-A-00005'));
    expect(await screen.findByText('Neden: H-01 · Deneme hurda')).toBeTruthy();
    expect(screen.getAllByText(/Deneme Kalite/).length).toBe(2);
    expect(screen.getByText(/Deneme Operatör/)).toBeTruthy();
  });

  it('durum yazma yetkisi yoksa komut düğmesi yoktur', async () => {
    sunucuKur(IZLEYICI, 'red');
    ac(<Izleme />);
    fireEvent.click(await screen.findByText('ORN-A-00005'));
    expect(await screen.findByText('UE-DNM-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rework$/ })).toBeNull();
  });
});
