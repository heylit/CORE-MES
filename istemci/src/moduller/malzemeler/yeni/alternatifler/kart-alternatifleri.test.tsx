import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { KartAlternatifleriCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { KatalogKarti } from '../tipler.ts';
import { YETKISIZ, type MalzemeYetkisi } from '../yetki.ts';
import { YONETICI, json, sunucuKur, yeniIstemci } from '../test-ortak.tsx';
import { KartAlternatifleri } from './KartAlternatifleri.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3463-1: kart föyündeki Alternatifler bölümü (ORN- örnek veri).
const kart = (no: number, kod: string): KatalogKarti => ({
  kimlik: `k${no}`, no, surum: 1, kayit: { id: `k${no}`, tur: 'hammadde', com: { kod, ad: `ORN çubuk ${kod}`, birim: 'm' } },
} as unknown as KatalogKarti);
const ANA = kart(1, 'ORN-HM-0142');
const KOPYA = kart(2, 'ORN-HM-0988');
const ZARF: KartZarfiCevabi = {
  kart: { no: 1, kod: 'ORN-HM-0142', ad: 'ORN çubuk C45 Ø50', aile: 'metal', sinif: 'celik' },
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: 'C45', acik: true, secenekler: [{ deger: '42CrMo4', tur: 'ust', notu: null }], kaynak: { kapsamTuru: 'kart', kapsam: '1' }, sinir: true },
    durum: { istenen: null, acik: true, secenekler: [], kaynak: null, sinir: false },
    form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: { kapsamTuru: 'kart', kapsam: '1' } }],
    pay: { tur: 'yuzde', deger: 15, enAzMm: 3, kaynak: null },
    boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null },
    yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
  kartlar: [3, 4, 5, 6, 7].map((no) => ({
    no, kod: `ORN-HM-01${String(no)}0`, ad: `ORN aday ${String(no)}`, kalite: 'C45', durum: null, form: 'cubuk', olcu: { d: 52, l: 3000 }, sonuc: 'icinde' as const, nedenler: [],
  })),
};
const BOLUM: KartAlternatifleriCevabi = {
  siniri: [
    { id: 11, kapsamTuru: 'kart', kapsam: '1', nitelik: 'kalite', degerler: [{ deger: 'C45', tur: 'tam' }, { deger: '42CrMo4', tur: 'ust' }], alt: null, ust: null, surum: 1 },
    { id: 12, kapsamTuru: 'kart', kapsam: '1', nitelik: 'd', degerler: null, alt: 50, ust: 55, surum: 3 },
  ],
  esdegerler: [],
};
const yollar = (ek = {}) => ({
  'GET /malzeme-alternatifleri/zarf/1': () => json(200, ZARF),
  'GET /malzeme-alternatifleri/kart/1': () => json(200, BOLUM),
  ...ek,
});
const ac = (yetki: MalzemeYetkisi) => render(
  <QueryClientProvider client={yeniIstemci()}><BildirimSaglayici>
    <KartAlternatifleri kart={ANA} kartlar={[ANA, KOPYA]} yetki={yetki} ac={vi.fn()} />
  </BildirimSaglayici></QueryClientProvider>,
);
const TANIM: MalzemeYetkisi = { ...YETKISIZ, oku: true, yaz: true, tanimYaz: true };

describe('Kart föyünde alternatifler (3463-1)', () => {
  test('okuyan sınırları kaynağıyla ve ilk dört uyan kartı görür; düzenleme düğmesi yok', async () => {
    sunucuKur(YONETICI, yollar());
    ac({ ...YETKISIZ, oku: true });
    // Kalite kodu harf büyüklüğüyle düz yazılır, tür ayrı rozette.
    expect(await screen.findByText('42CrMo4')).toBeTruthy();
    expect(screen.getByText('üst muadil')).toBeTruthy();
    expect(screen.getByText('50 – 55')).toBeTruthy();
    expect(screen.getAllByText('Kartın kuralı').length).toBeGreaterThan(0);
    expect(screen.getByText('Uyan kartlar (5)')).toBeTruthy();
    expect(screen.queryByText('ORN-HM-0170')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'İlk 4 · Hepsini göster (5)' }));
    expect(screen.getByText('ORN-HM-0170')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sınırını düzenle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kart bağla' })).toBeNull();
  });

  test('eşdeğer bağlı kart uyan kartlarda tekrar gösterilmez', async () => {
    sunucuKur(YONETICI, yollar({ 'GET /malzeme-alternatifleri/kart/1': () => json(200, { ...BOLUM, esdegerler: [{ no: 3, kod: 'ORN-HM-0130', ad: 'ORN aday 3' }] }) }));
    ac({ ...YETKISIZ, oku: true });
    expect(await screen.findByText('Uyan kartlar (4)')).toBeTruthy();
    expect(screen.getAllByText('ORN-HM-0130')).toHaveLength(1);
  });

  test('tanım yazan ölçü aralığını sürümüyle kaydeder', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/siniri/kaydet': () => json(200, { tamam: true }) }));
    ac(TANIM);
    fireEvent.click(await screen.findByRole('button', { name: 'd (mm) sınırını düzenle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('En çok (mm)'), { target: { value: '56,5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/kaydet')?.govde).toEqual({
      kapsamTuru: 'kart', kapsam: '1', nitelik: 'd', degerler: null, alt: 50, ust: 56.5, surum: 3,
    }));
  });

  test('kartın sınırı sürümüyle kaldırılır; şartlı kart rozetle, kapalı zarf notla görünür', async () => {
    const zarf = { ...ZARF, zarf: { ...ZARF.zarf!, kapali: true, gerekce: 'ORN gerekçe' }, kartlar: [{ ...ZARF.kartlar[0]!, sonuc: 'sartli' as const, nedenler: ['Kalite şartlı'] }] };
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/zarf/1': () => json(200, zarf),
      'POST /malzeme-alternatifleri/siniri/12/kaldir': () => json(200, { tamam: true }),
    }));
    ac(TANIM);
    expect(await screen.findByText(/Alternatif kapalı/)).toBeTruthy();
    expect(screen.getByText('Şartlı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'd (mm) sınırını düzenle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kartın sınırını kaldır' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/12/kaldir')?.govde).toEqual({ surum: 3 }));
  });

  test('eşdeğer kart onay penceresiyle bağlanır', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/esdeger/bagla': () => json(200, { tamam: true }) }));
    ac(TANIM);
    expect(await screen.findByText('Eşdeğer kart bağlı değil.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Eşdeğer kartın kodu'), { target: { value: 'ORN-HM-0988' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kart bağla' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/birbirinin yerine sınırsız kabul edilir/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/esdeger/bagla')?.govde).toEqual({ kartNo: 1, esdegerNo: 2 }));
  });
});
