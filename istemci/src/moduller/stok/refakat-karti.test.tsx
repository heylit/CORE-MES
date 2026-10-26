import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { RefakatIziCevabi, RefakatPartisi, RefakatPartisiKartiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { RefakatKartPenceresi, refakatPartisiBelgesi } from './RefakatKarti.tsx';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const KOL: RefakatPartisi = { ...KART, id: 13, qr: 'RP:13', etiket: 'UE-000001/1-P1', uretimEmriId: 2, emirNo: 'UE-000001/1', verilen: '0', ust: { id: 12, etiket: 'UE-000001-P1' } };
const BAS = { emirId: 1, qr: 'UE:1', emirNo: 'UE-000001', urun: { kod: 'P-1', ad: 'Deneme parça' }, adet: 10, teslim: null, parti: { ustEmirNo: null, bolunmeSira: null }, adimlar: [] };
const kartCevabi = (r: RefakatPartisi): RefakatPartisiKartiCevabi => ({ refakat: r, kart: { ...BAS, emirId: r.uretimEmriId, emirNo: r.emirNo ?? '' } });
const IZ: RefakatIziCevabi = {
  refakat: KART, ustler: [], altlar: [KOL], birlesenler: [], ayniLot: [KOL],
  ciktilar: [{ partiId: 70, lotNo: 'UP-000070', refakatPartisiId: 12, malzemeId: 801, malzemeKod: 'YM-1', malzemeAd: 'Deneme parça', birim: 'adet', eldeki: '4' }],
  sevkler: [],
};
const EMIR = (id: number, emirNo: string) => ({ id, emirNo, parcaNo: 'P-1', parcaAd: 'Deneme parça', adet: 4, durum: 'planli' });

function goster(id: number) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>
      <RefakatKartPenceresi id={id} kapat={() => undefined} />
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

describe('Refakat kartı: alt parti ve iz (kart #126)', () => {
  it('iz alt kartları ve üretilen partiyi gösterir; alt parti kartı yalnız bu emrin kolundan açılır, açılınca pencere yeni kartı gösterir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/refakat-partileri/12/kart': () => json(200, kartCevabi(KART)),
      'GET /stok/refakat-partileri/12/iz': () => json(200, IZ),
      'GET /stok/refakat-partileri/13/kart': () => json(200, kartCevabi(KOL)),
      'GET /stok/refakat-partileri/13/iz': () => json(200, { ...IZ, refakat: KOL, ustler: [KART], altlar: [], ayniLot: [KART], ciktilar: [] }),
      'GET /uretim-emirleri': () => json(200, { emirler: [EMIR(2, 'UE-000001/1'), EMIR(3, 'UE-000003'), EMIR(4, 'UE-000001/1/1')] }),
      'POST /stok/refakat-partileri/12/kol-ac': () => json(200, { refakat: KOL }),
    });
    goster(12);
    const iz = await screen.findByRole('region', { name: 'Kartın izi' });
    expect(await within(iz).findByText(/UP-000070/)).toBeTruthy();
    expect(within(iz).getAllByRole('button', { name: 'UE-000001/1-P1' })).toHaveLength(2);
    const alt = screen.getByRole('region', { name: 'Alt parti kartı' });
    const secim = within(alt).getByRole('combobox', { name: /Üretim emri/ });
    await waitFor(() => expect(within(secim).queryAllByRole('option').map((o) => o.textContent)).toEqual(['Seçin', expect.stringContaining('UE-000001/1 ')]));
    fireEvent.change(secim, { target: { value: '2' } });
    fireEvent.click(within(alt).getByRole('button', { name: 'Alt parti kartı aç' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ uretimEmriId: 2 }));
    expect(await screen.findByText('Üst kart UE-000001-P1')).toBeTruthy();
  });

  it('birleşmiş kart birleştiği kartı söyler; alt parti kartı açılmaz', async () => {
    const birlesmis = { ...KOL, birlestigi: { id: 12, etiket: 'UE-000001-P1' }, birlesmeZamani: '2026-10-22T12:00:00+03:00' };
    sunucuKur(DEPOCU, {
      'GET /stok/refakat-partileri/13/kart': () => json(200, kartCevabi(birlesmis)),
      'GET /stok/refakat-partileri/13/iz': () => json(200, { ...IZ, refakat: birlesmis, ustler: [KART], altlar: [], ayniLot: [], ciktilar: [] }),
    });
    goster(13);
    expect(await screen.findByText(/UE-000001-P1 kartına birleşti/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Alt parti kartı' })).toBeNull();
  });
});

describe('Refakat kartı: istisna kartı (kart #154)', () => {
  it('lotsuz kart lot bekliyor der; depocu lotu okutup bağlar, yetmeyen kalanı söyler; alt parti kartı ve Etiket Merkezi yok', async () => {
    const lotsuz: RefakatPartisi = { ...KART, partiId: null, lotNo: null, verilen: '0', surum: 3 };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/refakat-partileri/12/kart': () => json(200, kartCevabi(lotsuz)),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { ...IZ, refakat: lotsuz, altlar: [], ayniLot: [], ciktilar: [] }),
      'POST /stok/refakat-partileri/12/lota-bagla': () => json(200, { refakat: lotsuz, baglanan: '2', bekleyen: '4' }),
    });
    goster(12);
    expect(await screen.findByText(/Lot bekliyor \(istisna kartı\)/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Alt parti kartı' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Etiket Merkezi/ })).toBeNull();
    const bolum = screen.getByRole('region', { name: 'Lota bağla' });
    fireEvent.change(within(bolum).getByLabelText('Lot etiketi ya da refakat kartı'), { target: { value: ' LOT:LT-000041 ' } });
    fireEvent.click(within(bolum).getByRole('button', { name: 'Lota bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ kod: 'LOT:LT-000041', surum: 3 }));
    expect(await within(bolum).findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/bağlandı; lotta yetmeyen .*4.* bekliyor/));
  });

  it('lotlu kartta lota bağlama yok; bağlanmış istisna kartı bağlanma zamanını söyler', async () => {
    const bagli: RefakatPartisi = { ...KART, lotaBaglanmaZamani: '2026-10-23T09:00:00+03:00' };
    sunucuKur(DEPOCU, {
      'GET /stok/refakat-partileri/12/kart': () => json(200, kartCevabi(bagli)),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { ...IZ, refakat: bagli }),
    });
    goster(12);
    expect(await screen.findByText(/İstisna kartıydı; .* lota bağlandı\./)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Lota bağla' })).toBeNull();
  });
});

describe('Refakat kartı belgesi: rota şeridi (kart #707, etiket B)', () => {
  const adim = (opNo: number, ad: string, yer: string | null, fason = false) => ({ opNo, ad, yer, fason });
  const belge = (r: RefakatPartisi, adimlar: ReturnType<typeof adim>[]) => {
    const html = refakatPartisiBelgesi({ refakat: r, kart: { ...kartCevabi(r).kart, adet: 52, teslim: '2026-10-30', adimlar } }, new Date('2026-10-24T07:02:00+03:00'));
    return new DOMParser().parseFromString(html, 'text/html');
  };

  it('rota lottan başlar, adımlar sırayla gelir, mamul deposunda biter; QR dört modül sessiz bölgeli', () => {
    const d = belge({ ...KART, dokumNo: 'D-1', sertifikaNo: 'S-1' }, [adim(10, 'Torna', 'Torna 2'), adim(20, 'Kaplama', null, true)]);
    const satirlar = [...d.querySelectorAll('.rota > li')].map((l) => l.textContent);
    expect(satirlar).toEqual(['LOT LT-000040Deneme sac · HM-1Döküm D-1 · Sertifika S-1', '10TornaTorna 2', '20KaplamaFason', 'Mamul deposu / sevk']);
    expect(d.querySelectorAll('.rota .kutu')).toHaveLength(2);
    expect(d.querySelector('.bas')?.textContent).toBe('REFAKAT KARTIUE-000001-P1Deneme parçaP-1 · 52 adet · termin 30.10.2026');
    const qr = d.querySelector('.yan svg');
    expect(qr?.getAttribute('aria-label')).toBe('QR: RP:12');
    const [x, y, w] = (qr?.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect([x, y]).toEqual([-4, -4]);
    expect(w! - 8).toBeGreaterThanOrEqual(21);
    expect(d.querySelector('.rota')?.classList.contains('sik')).toBe(false);
    expect(d.querySelector('.bilgi')?.textContent).not.toContain('ÜST KART');
  });

  it('istisna kartı lot bekliyor der; kol kartı üst kartı yazar; çok adımda satırlar sıklaşır; metin kaçırılır', () => {
    const cok = Array.from({ length: 9 }, (_, i) => adim((i + 1) * 10, i === 0 ? '<b>Torna</b>' : `İş ${i}`, 'Yer'));
    const d = belge({ ...KOL, lotNo: null, partiId: null }, cok);
    expect(d.querySelector('.rota .lot strong')?.textContent).toBe('Lot bekliyor (istisna kartı)');
    expect(d.querySelector('.rota')?.classList.contains('sik')).toBe(true);
    expect(d.querySelector('.rota .op strong')?.textContent).toBe('<b>Torna</b>');
    expect(d.querySelector('.bilgi')?.textContent).toContain('ÜST KARTUE-000001-P1');
  });
});
