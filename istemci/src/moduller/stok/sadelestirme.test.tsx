import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IsKutusuCevabi, IstasyonSepetiSatiri, IstasyonSepetleriCevabi, RefakatPartisi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { isler } from './IsKutusu.tsx';
import { KartRotasi } from './KartRotasi.tsx';
import { teslimRozeti } from './TeslimSatiri.tsx';
import { json, sunucuKur } from './test-ortak.tsx';

// Malzeme · Teslim sadeleştirmesi (751-753 b): iki rozet, kart okutunca rotadaki sonraki adım ve İş kutusunun tek sıralı listesi.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const uc = (konumId: number, kod: string, ad: string, istasyonId: number | null) => ({ konumId, kod, ad, istasyonId });
const TESLIM: Teslim = {
  id: 41, no: 'TS-000041', malzemeId: 901, malzemeAd: 'Deneme mil', miktar: '3.000', partiId: 4, statuId: 7,
  kaynak: uc(20, 'IST-1', 'Torna 1', 1), hedef: uc(21, 'IST-2', 'Freze 2', 2), uretimEmriId: 30, istekId: null, aciklama: null,
  durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme Kişi', kapatanAd: null, aliciAd: null, gonderim: '2026-10-14T08:00:00+03:00', kapanis: null, surum: 1,
};

describe('iki kural, iki etiket (752 b)', () => {
  const simdi = Date.parse('2026-10-14T10:00:00+03:00');
  it('yoldaki onay bekler; okutarak geçen süresi içinde itiraz edilebilir; süre bitince ya da itirazdan sonra teslim alındı', () => {
    expect(teslimRozeti(TESLIM, simdi).etiket).toBe('Onay bekliyor');
    const hemen: Teslim = { ...TESLIM, durum: 'teslim', okutarak: true, itirazSonu: '2026-10-14T16:00:00+03:00', itiraz: null };
    expect(teslimRozeti(hemen, simdi).etiket).toBe('Hemen geçti, itiraz edilebilir');
    expect(teslimRozeti({ ...hemen, itirazSonu: '2026-10-14T09:00:00+03:00' }, simdi).etiket).toBe('Teslim alındı');
    expect(teslimRozeti({ ...hemen, itiraz: { neden: 'yanlış', kisiAd: null, zaman: '2026-10-14T09:30:00+03:00', iadeTeslimId: null } }, simdi).etiket).toBe('Teslim alındı');
    expect(teslimRozeti({ ...TESLIM, durum: 'teslim' }, simdi).etiket).toBe('Teslim alındı');
  });
});

describe('İş kutusu tek sıralı liste (753 b)', () => {
  const k: IsKutusuCevabi = { kabuldeBekleyen: 2, eksiBakiye: 1, kritik: 1, sayimBekleyen: null, logoFarki: 0, logoHatasi: 0, fasondaEksik: 0, fasonEksikGonderimi: 0, teslimBekleyenIstek: 3, depoyaGelenTeslim: 2 };
  it('depoya gelen teslim paneli Bana gelen\'de açan satırdır; hata önce, uyarı sonra, sıradaki iş en sonda', () => {
    const l = isler(k);
    expect(l.map((i) => i.ton)).toEqual(['hata', 'uyari', 'bilgi', 'bilgi', 'bilgi']);
    const gelen = l.find((i) => i.baslik === '2 teslim depoya geliyor');
    expect(gelen?.panel).toEqual({ sekme: 'al' });
    expect(isler({ ...k, depoyaGelenTeslim: null }).some((i) => i.panel)).toBe(false);
  });
});

describe('kart okutunca rotadaki adım (752 b)', () => {
  const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
  const KUTU: TeslimKutusuCevabi = {
    gelenler: [], gonderdiklerim: [], isteklerim: [], bendenIstenenler: [], okutarakAlinanlar: [],
    istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }], hedefIstasyonlar: [], depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 2, harita: null, zemin: null,
  };
  const KART = { id: 5, qr: 'RP:5', etiket: 'UE-000030-P1', uretimEmriId: 30, emirNo: 'UE-000030', sira: 1, malzemeId: 800, partiId: 4 } as unknown as RefakatPartisi;
  const SATIR: IstasyonSepetiSatiri = {
    malzemeId: 901, kod: 'YM-1', ad: 'Deneme mil', partiId: 4, partiEtiketi: 'EM-30', statuId: 7, miktar: '2.000', yolda: '0.000', uretimEmriId: 30,
    getiren: null, gelis: null, koken: 'uretim', sonraki: { istasyonId: 3, kod: 'TS3', ad: 'Taşlama 3', opNo: 30 }, sonrakiYok: null,
  };
  const ac = () => {
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><KartRotasi r={KART} /></BildirimSaglayici></QueryClientProvider>);
  };

  it('kartın parçası buradaysa sonraki istasyona tek düğme; önceki istasyondaysa Teslim al; başka partinin satırı görünmez', async () => {
    const cevap: IstasyonSepetleriCevabi = {
      istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' },
      gelen: { bekleyen: [{ ...SATIR, kaynak: { id: 1, kod: 'T1', ad: 'Torna 1' }, sonraki: { istasyonId: 2, kod: 'F2', ad: 'Freze 2', opNo: 20 } }], yolda: [] },
      cikan: [SATIR, { ...SATIR, partiId: 99, malzemeId: 902, ad: 'Başka parça' }],
    };
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, KUTU),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, cevap),
      'GET /stok/statuler': () => json(200, { statuler: [] }),
    });
    ac();
    const liste = await screen.findByRole('list', { name: 'Kartın parçası' });
    expect(within(liste).getByRole('button', { name: 'Sonraki istasyona: Taşlama 3 (OP 30)' })).toBeTruthy();
    expect(within(liste).getByRole('button', { name: /^Teslim al, / })).toBeTruthy();
    expect(within(liste).queryByText(/Başka parça/)).toBeNull();
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/istasyon-sepetleri?istasyonId=2&uretimEmriId=30')).toBe(true);
  });

  it('istasyonda değilken (kapsamda birden çok istasyon, açık oturum yok) sepet okunmaz, bir şey çizilmez', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, { ...KUTU, buradakiIstasyonId: null, istasyonlar: [...KUTU.istasyonlar, { id: 3, kod: 'TS3', ad: 'Taşlama 3' }] }),
    });
    ac();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu')).toBe(true));
    expect(screen.queryByRole('list', { name: 'Kartın parçası' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/stok/teslim-kutusu/istasyon-sepetleri'))).toBe(false);
  });
});
