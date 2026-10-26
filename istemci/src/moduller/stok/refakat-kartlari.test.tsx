import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KartAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { RefakatKartlariSatiri, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { sureMetni } from './RefakatKartlari.tsx';
import { ac, json, OKUYUCU, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const satir = (r: RefakatPartisi, urun = { kod: 'P-1', ad: 'Deneme mil' }): RefakatKartlariSatiri => ({ refakat: r, urun, adet: 10, teslim: '2026-10-30', adimSayisi: 3 });
const LISTE = [
  satir(KART),
  satir({ ...KART, id: 13, qr: 'RP:13', etiket: 'UE-000002-P1', uretimEmriId: 2, emirNo: 'UE-000002', lotNo: null, partiId: null, verilen: '0' }, { kod: 'P-2', ad: 'Deneme flanş' }),
  satir({ ...KART, id: 14, qr: 'RP:14', etiket: 'UE-000001-P2', sira: 2, birlestigi: { id: 12, etiket: 'UE-000001-P1' } }),
];
const BAS = { emirId: 1, qr: 'UE:1', emirNo: 'UE-000001', urun: { kod: 'P-1', ad: 'Deneme mil' }, adet: 10, teslim: null, parti: { ustEmirNo: null, bolunmeSira: null }, adimlar: [] };

describe('Refakat kartları sayfası (kart #708)', () => {
  it('menüden açılır; kartları durumuyla listeler, aramada süzer, tümü süzgeci iptali de ister, kart adı kartın penceresini açar', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    const tablo = await screen.findByRole('table', { name: 'Refakat kartları' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((s) => within(s).getAllByRole('cell').at(-1)?.textContent)).toEqual(['Açık', 'Lot bekliyor', 'UE-000001-P1 kartına birleşti']);
    expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=acik')).toBe(true);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'FLANŞ' } });
    await waitFor(() => expect(within(tablo).getAllByRole('row')).toHaveLength(2));
    expect(within(tablo).getByRole('button', { name: 'UE-000002-P1' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'LT-000040' } });
    await waitFor(() => expect(within(tablo).getAllByRole('row')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=tumu')).toBe(true));

    fireEvent.click(await screen.findByRole('button', { name: 'UE-000001-P1' }));
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });

  it('liste sınıra dayanınca söyler; kart yoksa boş der', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/refakat-kartlari': () => json(200, { kartlar: [], sinirda: true }) });
    ac('/stok/refakat-kartlari');
    expect(await screen.findByText(/Yalnız en yeni kartlar gösteriliyor/)).toBeTruthy();
    expect(screen.getByText('Kart yok.')).toBeTruthy();
  });

  it('Akış Süresi okuyan kartın akışını görür: özet, anlar arası süre ve gün başlığı, tablo; kart penceresi akıştan açılır', async () => {
    const t = (dk: number) => new Date(Date.UTC(2026, 9, 22, 7, 0) + dk * 60_000).toISOString();
    const olcu = (dk: number | null, acik = false) => ({ dk, acik });
    const AKIS: KartAkisiCevabi = {
      emir: { id: 1, emirNo: 'UE-000001', adet: 10, durum: 'calisiyor', teslim: null },
      simdi: t(2000),
      damgalar: { malKabul: t(0), uretimBasladi: t(90), uretimBitti: null, sevkeHazir: null, sevk: null },
      olculer: { uctanUca: olcu(2000, true), hammaddeBekleme: olcu(90), uretimAkis: olcu(1910, true), sevkBekleme: olcu(null), islemeToplamDk: 50, akisVerimi: 0.026 },
      seritler: [],
      adimlar: [{
        isEmriId: 7, opNo: 10, istasyon: 'Torna 1', fason: false, beklemeDk: null, hazirlikDk: 12, islemeDk: 50, duraklamaDk: 0, durusDk: 0, fasonDk: null,
        saglamAdet: 8, cevrimBirimDk: 6.25, standartBirimDk: 5, standartHazirlikDk: 10, terminGun: null,
      }],
      statuler: [], hammadde: [],
      kart: {
        id: 12, etiket: 'UE-000001-P1', durum: 'acik', lotNo: 'LT-000040', acilis: t(30), malzeme: 'HM-1 Deneme sac', birim: 'kg',
        tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', sarf: null,
      },
      konum: { durum: 'uretimde', isEmriId: 7, opNo: 10, yer: 'Torna 1', beri: t(90) },
      rota: [{ isEmriId: 7, opNo: 10, durum: 'simdi', baslama: t(90), bitis: null, hurdaAdet: 0 }],
      lead: olcu(1970, true),
      teslimler: [],
      sureOzetleri: [],
      olaylarEmrin: true,
      anlar: [
        { zaman: t(0), tur: 'mal_kabul', isEmriId: null, opNo: null, yer: 'LT-000040', miktar: null, kim: null, neden: null },
        { zaman: t(30), tur: 'kart_acildi', isEmriId: null, opNo: null, yer: null, miktar: null, kim: null, neden: null },
        { zaman: t(90), tur: 'baslat', isEmriId: 7, opNo: 10, yer: 'Torna 1', miktar: null, kim: null, neden: null },
        { zaman: t(1530), tur: 'saglam', isEmriId: 7, opNo: 10, yer: 'Torna 1', miktar: '8', kim: null, neden: null },
      ],
    };
    sunucuKur({ ...OKUYUCU, islemler: ['sayfa.stok', 'sayfa.akis'] }, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /akis/refakat-kartlari/12': () => json(200, AKIS),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    fireEvent.click(await screen.findByRole('button', { name: 'UE-000001-P1' }));
    const akis = await screen.findByRole('list', { name: 'Kartın akışı' });
    const anlar = within(akis).getAllByRole('listitem');
    expect(anlar.map((a) => a.querySelector('strong')?.textContent)).toEqual(['Hammadde kabul edildi', 'Kart açıldı, lot yüklendi', 'OP10 · Üretim başladı', 'OP10 · Sağlam sayıldı']);
    expect(anlar.map((a) => a.querySelector('.tc-stok-akis-fark')?.textContent)).toEqual(['', '+30 dk', '+1 sa 0 dk', '+1 g 0 sa 0 dk']);
    expect(anlar[3]?.querySelector('.tc-stok-akis-gun')).toBeTruthy();
    expect(screen.getByText('1 g 7 sa 50 dk (sürüyor)')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Tablo' }));
    const adimlar = await screen.findByRole('table', { name: 'Adımlar: gerçek ve plan' });
    expect(within(adimlar).getByText('6,25 dk (5 dk) (+25%)')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Anlar' })).getByText('+1 g 0 sa 0 dk')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Kart penceresi' }));
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });

  it('süre metni gün, saat ve dakikadır; ölçülemeyen süre tire', () => {
    expect([sureMetni(null), sureMetni(0), sureMetni(59.6), sureMetni(61), sureMetni(1500)]).toEqual(['—', '0 dk', '1 sa 0 dk', '1 sa 1 dk', '1 g 1 sa 0 dk']);
  });
});
