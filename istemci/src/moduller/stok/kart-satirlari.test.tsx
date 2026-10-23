import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { RefakatKartSatiri, RefakatPartisi, SepetCevabi, SepetSatiri, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IsEmriniAc, KartSatirlari } from './KartSatirlari.tsx';
import { DepoSepeti } from './Sepet.tsx';
import { teslimGovdesi } from './okut-akisi.ts';
import { json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const satir = (x: Partial<RefakatKartSatiri>): RefakatKartSatiri => ({
  konumId: 31, konumKod: 'IST-T1', konumAd: 'Torna 1', konumTur: 'istasyon', istasyonId: 3, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, partiEtiketi: 'LT-000040', statuId: null, kaliteDurumu: 'serbest', miktar: '6.000', yolda: '1.000', alinabilir: '5.000', ...x,
});
const KUTU = { gelenler: [], gonderdiklerim: [], isteklerim: [], istasyonlar: [{ id: 4, kod: 'F2', ad: 'Freze 2' }], hedefIstasyonlar: [], depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 4, harita: null, zemin: null } satisfies TeslimKutusuCevabi;

function Adres() { const l = useLocation(); return <p>Adres {l.pathname}{l.search}</p>; }
function ciz(icerik: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={icerik} /><Route path="/uretim-terminali" element={<Adres />} /></Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

describe('Kart satırları (kart #155, Soru 128, 133)', () => {
  it('satır seçilince kendi istasyonuna Serbest Al gider; yoldaki görünür; serbest olmayan satır seçilmez', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, KUTU),
      'POST /stok/refakat-partileri/12/serbest-al': () => json(200, {}),
    });
    ciz(<KartSatirlari r={KART} satirlar={[satir({}), satir({ konumId: 32, konumKod: 'IST-T2', konumAd: 'Torna 2', istasyonId: 5, kaliteDurumu: 'karar_bekliyor', alinabilir: '0' })]} />);
    const liste = screen.getByRole('list', { name: 'Kartın satırları listesi' });
    const [t1, t2] = within(liste).getAllByRole('listitem');
    expect(t1!.textContent).toMatch(/yolda 1/);
    expect(within(t2!).queryByRole('button', { name: 'Seç' })).toBeNull();
    fireEvent.click(within(t1!).getByRole('button', { name: 'Seç' }));
    const grup = screen.getByRole('group', { name: 'Seçilen satır' });
    fireEvent.change(within(grup).getByLabelText('Miktar'), { target: { value: '2' } });
    fireEvent.click(await within(grup).findByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ konumId: 31, partiId: 40, statuId: null, miktar: '2', istasyonId: 4 }));
  });

  it('Sepete ekle satırı kartla ekler; satır kendi istasyonumdaysa Teslim al yok', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, { ...KUTU, buradakiIstasyonId: 3, istasyonlar: [{ id: 3, kod: 'T1', ad: 'Torna 1' }] }),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] } satisfies SepetCevabi),
    });
    ciz(<KartSatirlari r={KART} satirlar={[satir({})]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seç' }));
    const grup = screen.getByRole('group', { name: 'Seçilen satır' });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu')).toBe(true));
    expect(within(grup).queryByRole('button', { name: 'Teslim al' })).toBeNull();
    fireEvent.click(within(grup).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, miktar: '5', kaynakKonumId: 31, partiId: 40, refakatPartisiId: 12 }));
  });

  it('İş emrini aç Üretim Terminali\'ni emir ve kartla açar; iptal kartta yok', () => {
    sunucuKur(OPERATOR, {});
    ciz(<IsEmriniAc r={KART} />);
    fireEvent.click(screen.getByRole('button', { name: 'İş emrini aç' }));
    expect(screen.getByText('Adres /uretim-terminali?emir=1&kart=12')).toBeTruthy();
    cleanup();
    ciz(<IsEmriniAc r={{ ...KART, durum: 'iptal' }} />);
    expect(screen.queryByRole('button', { name: 'İş emrini aç' })).toBeNull();
  });

  it('Bıraktım gövdesi birak taşır; Teslim et taşımaz', () => {
    const kaynak = { malzemeId: 901, malzemeAd: 'Deneme sac', birim: 'kg', yer: { konumId: 31, kod: 'IST-T1', ad: 'Torna 1', tur: 'istasyon' as const, istasyonId: 3 }, partiId: 40, partiEtiketi: null, statuId: null, miktar: '5' };
    const hedef = { konumId: 7, kod: 'KABUL', ad: 'Mal kabul', tur: 'kabul' as const, istasyonId: null };
    expect(teslimGovdesi(kaynak, hedef, '2', 'k-1', true)).toMatchObject({ birak: true, hedef: { konumId: 7 } });
    expect(teslimGovdesi(kaynak, hedef, '2', 'k-1')).not.toHaveProperty('birak');
  });
});

describe('Sepetim (Soru 133)', () => {
  const SATIR: SepetSatiri = {
    id: 3, malzemeId: 901, malzemeAd: 'Deneme sac', malzemeKod: 'HM-1', kaynakKonumId: 31, kaynakKonumKod: 'IST-T1', partiId: 40, partiEtiketi: 'LT-000040', miktar: '2', mevcut: '5',
    eklenme: '2026-10-23T09:00:00+03:00', refakat: { id: 12, etiket: 'UE-000001-P1' }, hedef: { konumId: 50, kod: 'IST-F2', ad: 'Freze 2', istasyonId: 4 },
  };
  it('operatör sepetini görür, Teslim et hedefli satırları gönderir; depo işleri (taşı, karta geç) yok', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR, { ...SATIR, id: 4, refakat: null, hedef: null }] }),
      'POST /stok/sepet/gonder': () => json(200, { teslimler: [{ satirId: 3, teslimNo: 'TS-000009' }], kalanlar: [] }),
    });
    ciz(<DepoSepeti />);
    const liste = await screen.findByRole('list', { name: 'Sepetim' });
    expect(within(liste).getAllByRole('listitem')[0]!.textContent).toMatch(/kart UE-000001-P1.*Hedef: Freze 2/);
    expect(screen.queryByRole('button', { name: 'Hepsini taşı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refakat kartına geç' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ satirlar: [{ satirId: 3 }] }));
  });
});
