import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KartAlternatifleriCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { MalzemeMiktarlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import type { KatalogKarti } from '../tipler.ts';
import { YETKISIZ } from '../yetki.ts';
import { json, sunucuKur, yeniIstemci, type Yanit } from '../test-ortak.tsx';
import { KartAlternatifleri } from './KartAlternatifleri.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3582 B: Alternatifler sekmesinde stok miktarı (ORN- örnek veri). Tablodaki kartlar ve setlere uyan kartlar tek okumada; önerilmeyen
// kartın stoğu okunmaz; stok okuması olmayan kullanıcıda istek atılmaz, sütun çizilmez.
const STOKCU: Kullanici = { id: 3, ad: 'Deneme Depo', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.malzemeler', 'sayfa.stok'] };
const STOKSUZ: Kullanici = { id: 4, ad: 'Deneme Okuyan', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.malzemeler', 'stok.istek'] };

const ANA = {
  kimlik: 'k1', no: 1, surum: 1, kayit: { id: 'k1', tur: 'hammadde', form: 'cubuk', com: { kod: 'ORN-HM-0142', ad: 'ORN çubuk', birim: 'kg' } },
} as unknown as KatalogKarti;
const ZARF: KartZarfiCevabi = {
  kart: { no: 1, kod: 'ORN-HM-0142', ad: 'ORN çubuk', aile: 'metal', sinif: 'celik' },
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: 'C45', acik: true, secenekler: [], kaynak: null, sinir: false },
    durum: { istenen: null, acik: true, secenekler: [], kaynak: null, sinir: false },
    form: 'cubuk', olcu: [], pay: { tur: 'yuzde', deger: 15, enAzMm: 3, kaynak: null }, boy: null,
    yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
  kartlar: [6, 7].map((no) => ({
    no, kod: `ORN-HM-01${String(no)}0`, ad: `ORN aday ${String(no)}`, kalite: 'C45', durum: null, form: 'cubuk', olcu: { d: 52 }, sonuc: 'icinde' as const, nedenler: [],
  })),
};
const uyan = (no: number) => ({ no, kod: `ORN-HM-${String(no)}`, ad: `ORN aday ${String(no)}`, neden: 'd 52', yeni: false, durum: 'gecer' as const });
const SET: KartAlternatifleriCevabi['setler'][number] = {
  id: 7, ad: 'ORN Kalın çubuk', tur: 'tam', sira: 0, kullanimYerleri: ['talep', 'satin_alma', 'uretim'], notu: null, genisOnay: false,
  nitelikler: [{ nitelik: 'form', degerler: ['cubuk'], alt: null, ust: null }], uyanSayisi: 2, surum: 1, guncelleme: '2026-11-22T18:00:00Z',
  uyanlar: [uyan(3), uyan(4)],
};
const BOLUM: KartAlternatifleriCevabi = {
  siniri: [], setler: [SET], genisEsik: 50, hesap: '2026-11-22T18:00:00Z',
  secili: [
    { alternatifNo: 4, kod: 'ORN-HM-4', ad: 'ORN aday 4', iptal: false, onerilmez: false, tur: 'tam', sira: 1, kullanimYerleri: ['talep'], notu: null, setler: [7], kuraldan: false, surum: 1 },
    { alternatifNo: 5, kod: 'ORN-HM-5', ad: 'ORN aday 5', iptal: false, onerilmez: true, tur: null, sira: null, kullanimYerleri: null, notu: 'ORN', setler: [], kuraldan: true, surum: 1 },
  ],
  esdegerler: [{ no: 9, kod: 'ORN-HM-9', ad: 'ORN kopya' }],
};
const MIKTAR: MalzemeMiktarlariCevabi = {
  satirlar: [
    { malzemeId: 3, birim: 'kg', kullanilabilir: '312.5', statuler: [{ statuId: 2, ad: 'ORN OP 10', miktar: '80' }] },
    { malzemeId: 4, birim: 'kg', kullanilabilir: '0', statuler: [] },
    { malzemeId: 6, birim: null, kullanilabilir: null, statuler: [] },
    { malzemeId: 7, birim: 'kg', kullanilabilir: '1240', statuler: [] },
    { malzemeId: 9, birim: 'kg', kullanilabilir: '96', statuler: [] },
  ],
};
const yollar = (ek: Record<string, Yanit> = {}) => ({
  'GET /malzeme-alternatifleri/zarf/1': () => json(200, ZARF),
  'GET /malzeme-alternatifleri/kart/1': () => json(200, BOLUM),
  ...ek,
});
const ac = () => render(
  <QueryClientProvider client={yeniIstemci()}><BildirimSaglayici>
    <KartAlternatifleri kart={ANA} kartlar={[ANA]} yetki={{ ...YETKISIZ, oku: true }} ac={vi.fn()} />
  </BildirimSaglayici></QueryClientProvider>,
);
const stokIstekleri = (istekler: { yol: string }[]) => istekler.filter((i) => i.yol.startsWith('/stok/malzeme-miktarlari'));
const satir = (metin: string) => screen.getAllByRole('row').find((r) => within(r).queryAllByText(metin).length > 0)!;

describe('Alternatiflerde stok miktarı (3582)', () => {
  test('görünen kartlar tek istekte; miktar, stok yok, takip dışı ayrı; önerilmeyen okunmaz', async () => {
    const istekler = sunucuKur(STOKCU, yollar({ 'GET /stok/malzeme-miktarlari': () => json(200, MIKTAR) }));
    ac();
    expect(await screen.findByText('1.240 kg')).toBeTruthy();
    expect(stokIstekleri(istekler).map((i) => i.yol)).toEqual(['/stok/malzeme-miktarlari?idler=3,4,6,7,9']);
    expect(screen.getByRole('columnheader', { name: 'Stok' })).toBeTruthy();
    expect(within(satir('ORN-HM-4')).getByText('stok yok')).toBeTruthy();
    expect(within(satir('ORN-HM-0160')).getByText('stok takibinde değil')).toBeTruthy();
    expect(within(satir('ORN-HM-9')).getByText('96 kg')).toBeTruthy();
    expect(within(satir('ORN-HM-5')).queryByText(/kg|stok/)).toBeNull();
    // Set özeti bağlantının yanında (liste kapalıyken de) ve Stok sütununda: yalnız sayı, toplam yok.
    const set = satir('ORN Kalın çubuk');
    expect(within(set).getByText('· 1 kartta stok var')).toBeTruthy();
    expect(within(set).getByText('· 2 karttan')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^Stok okundu: \d\d:\d\d · Depodaki serbest ve şartlı miktar; açık emre ayrılan \(rezerve\) düşülmez\./);
    fireEvent.click(within(set).getByRole('button', { name: '2 kart uyuyor' }));
    expect(within(set).getByText('312,5 kg')).toBeTruthy();
    expect(within(set).getByText('+ 80 kg ORN OP 10 durumunda')).toBeTruthy();
  });

  test('stok okuması olmayan kullanıcıda istek atılmaz, sütun ve bilgi satırı çizilmez', async () => {
    const istekler = sunucuKur(STOKSUZ, yollar());
    ac();
    expect(await screen.findByText('ORN Kalın çubuk')).toBeTruthy();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(stokIstekleri(istekler)).toEqual([]);
    expect(screen.queryByRole('columnheader', { name: 'Stok' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('yüklenirken satırda "–" ve görünmez metin; hata tek iletide, Yenile yeniden okur, tablo çalışır', async () => {
    let cevap: () => Response = () => json(500, { kod: 'IC_HATA', mesaj: 'Hata' });
    const istekler = sunucuKur(STOKCU, yollar({ 'GET /stok/malzeme-miktarlari': () => cevap() }));
    ac();
    expect((await screen.findAllByText('Stok yükleniyor')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Stok okunamadı.')).toBeTruthy();
    expect(screen.getAllByText('Stok okunamadı.')).toHaveLength(1);
    expect(screen.queryByText('okunamadı')).toBeNull();
    expect(screen.getByText('ORN-HM-9')).toBeTruthy();
    cevap = () => json(200, MIKTAR);
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(await screen.findByText('1.240 kg')).toBeTruthy();
    expect(stokIstekleri(istekler)).toHaveLength(2);
  });

  test("50'den çok kart iki istekte okunur; sessizce eksik kalmaz", async () => {
    const coklu = { ...SET, uyanSayisi: 60, uyanlar: Array.from({ length: 60 }, (_, i) => uyan(100 + i)) };
    const istekler = sunucuKur(STOKCU, yollar({
      'GET /malzeme-alternatifleri/kart/1': () => json(200, { ...BOLUM, setler: [coklu], secili: [], esdegerler: [] }),
      'GET /stok/malzeme-miktarlari': (_g, yol) => json(200, {
        satirlar: (new URLSearchParams(yol.split('?')[1]).get('idler') ?? '').split(',').map((n) => ({ malzemeId: Number(n), birim: 'kg', kullanilabilir: '1', statuler: [] })),
      }),
    }));
    ac();
    expect(await screen.findByText('· 60 kartta stok var')).toBeTruthy();
    expect(stokIstekleri(istekler).map((i) => i.yol.split(',').length)).toEqual([50, 12]);
  });
});
