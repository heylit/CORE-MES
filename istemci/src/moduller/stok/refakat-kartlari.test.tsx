import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RefakatKartlariSatiri, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { ORNEK_AKIS, ORNEK_OZET } from './test-refakat.ts';
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
  it('satırın herhangi bir yerine basmak kartı açar (yalnız Kart düğmesi değil)', async () => {
    sunucuKur(OKUYUCU, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    const tablo = await screen.findByRole('table', { name: 'Kart listesi' });
    fireEvent.click(within(tablo).getAllByRole('row')[1]!.querySelector('td[data-baslik="Ürün"]')!);
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });

  it('menüden açılır; kartları durumuyla listeler, okutma alanında süzer, tümü iptali de ister; Akış Süresi yetkisi yoksa kart penceresi açılır', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    const liste = await screen.findByRole('region', { name: 'Kartlar' });
    expect(within(liste).getAllByRole('row').slice(1).map((s) => s.textContent)).toEqual([
      expect.stringContaining('Açık'), expect.stringContaining('Lot bekliyor'), expect.stringContaining('UE-000001-P1 kartına birleşti'),
    ]);
    expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=acik')).toBe(true);
    expect(istekler.some((i) => i.yol.startsWith('/akis/'))).toBe(false);

    const okut = screen.getByRole('searchbox', { name: 'Kart, emir ya da lot okutun' });
    fireEvent.change(okut, { target: { value: 'FLANŞ' } });
    await waitFor(() => expect(within(liste).getAllByRole('row').slice(1)).toHaveLength(1));
    fireEvent.change(okut, { target: { value: 'LT-000040' } });
    await waitFor(() => expect(within(liste).getAllByRole('row').slice(1)).toHaveLength(2));

    fireEvent.click(within(liste).getByRole('button', { name: 'Tümü' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=tumu')).toBe(true));

    fireEvent.change(okut, { target: { value: 'RP:12' } });
    fireEvent.keyDown(okut, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });

  it('liste sınıra dayanınca söyler; kart yoksa boş der', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/refakat-kartlari': () => json(200, { kartlar: [], sinirda: true }) });
    ac('/stok/refakat-kartlari');
    expect(await screen.findByText(/Yalnız en yeni kartlar gösteriliyor/)).toBeTruthy();
    expect(screen.getByText('Kart yok.')).toBeTruthy();
  });

  it('yalnız kartın akışını gören (akis.kart-oku, 1870): listede kartın akışı da okunur', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: ['sayfa.stok', 'akis.kart-oku'] }, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: [satir(KART, { kod: 'P-1', ad: 'Mil 40 (örnek)' })], sinirda: false }),
      'GET /akis/refakat-kartlari': () => json(200, { kartlar: [ORNEK_OZET] }),
    });
    ac('/stok/refakat-kartlari');
    const liste = await screen.findByRole('region', { name: 'Kartlar' });
    expect(await within(liste).findByText('Stokta · yolda')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/akis/refakat-kartlari?idler=12')).toBe(true);
  });

  it('Akış Süresi okuyan (2907): listede yer, son an ve sıradaki adım, yere göre süzgeç; panelde işlemler ve rota adımları; süre analizi ve iz istenince açılır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: ['sayfa.stok', 'sayfa.akis'] }, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: [satir(KART, { kod: 'P-1', ad: 'Mil 40 (örnek)' })], sinirda: false }),
      'GET /akis/refakat-kartlari': () => json(200, { kartlar: [ORNEK_OZET] }),
      'GET /akis/refakat-kartlari/12': () => json(200, ORNEK_AKIS),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    const liste = await screen.findByRole('region', { name: 'Kartlar' });
    expect(await within(liste).findByText('Stokta · yolda')).toBeTruthy();
    expect(within(liste).getByText('Torna 2 → Freze 1 yolunda')).toBeTruthy();
    expect(liste.querySelector('td[data-baslik="Sıradaki"]')?.textContent).toBe('OP20');
    const tablo = within(liste).getByRole('table', { name: 'Kart listesi' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Kart' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    // Dar sol panelde Kart'tan hemen sonra kartın yeri ve sıradaki adımı gelir.
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Kart', 'Şimdi', 'Sıradaki', 'Ürün', 'Üretim emri', 'Son an']);
    expect(within(liste).queryByText(/^lead /)).toBeNull();
    expect(istekler.some((i) => i.yol === '/akis/refakat-kartlari?idler=12')).toBe(true);
    const kumeler = within(liste).getByRole('group', { name: 'Yere göre süz' });
    expect(within(kumeler).getByRole('button', { name: 'Yolda 1' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(kumeler).getByRole('button', { name: 'Fasonda 0' }));
    expect(await within(liste).findByText('Kart yok.')).toBeTruthy();
    fireEvent.click(within(kumeler).getByRole('button', { name: 'Yolda 1' }));
    expect(await within(liste).findByText('Stokta · yolda')).toBeTruthy();

    const ayrinti = await screen.findByRole('article', { name: 'Kart ayrıntısı' });
    expect(within(ayrinti).getByRole('heading', { name: 'UE-000001-P1' })).toBeTruthy();
    expect(await within(ayrinti).findByRole('button', { name: 'Alt parti kartı' })).toBeTruthy();
    expect(within(ayrinti).queryByRole('button', { name: 'Kart penceresi' })).toBeNull();
    const rota = await within(ayrinti).findByRole('list', { name: 'Kartın rotası' });
    const adimlar0 = within(rota).getAllByRole('listitem');
    expect(adimlar0.map((a) => a.getAttribute('data-durum'))).toEqual(['gecti', 'gecti', 'simdi', 'sirada', 'sirada', 'sirada', 'sirada']);
    expect(within(adimlar0[2]!).getByText('Torna 2 → Freze 1')).toBeTruthy();
    expect(within(ayrinti).queryByRole('img', { name: /Lead time dağılımı/ })).toBeNull();

    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Bağlı kartlar ve sevkler' }));
    expect(await within(ayrinti).findByText('Bu kartla henüz üretim, sevk ya da bağlı kart yok.')).toBeTruthy();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Süre analizi' }));
    expect(await within(ayrinti).findByText('8 sa 08 dk (sürüyor)')).toBeTruthy();
    expect(within(ayrinti).getByText('plan 1 g 8 sa · 1 g 0 sa kaldı')).toBeTruthy();
    expect(within(ayrinti).getByRole('img', { name: /Lead time dağılımı/ })).toBeTruthy();
    expect(within(ayrinti).getByText('OP10 süre özeti · üretim emrinden')).toBeTruthy();
    expect(within(ayrinti).getByRole('img', { name: 'Parça başına cycle süreleri' })).toBeTruthy();

    const akis = within(ayrinti).getByRole('list', { name: 'Kartın rotası ve anları' });
    const asamalar = within(akis).getAllByRole('listitem');
    expect(asamalar.map((a) => a.getAttribute('data-durum'))).toEqual(['gecti', 'gecti', 'gecti', 'simdi', 'sirada', 'sirada', 'sirada', 'sirada']);
    expect(within(asamalar[2]!).getByText('Takım değişimi')).toBeTruthy();
    expect(within(asamalar[3]!).getByText('Torna 2 → Freze 1')).toBeTruthy();
    expect(within(akis).getByText('Çarşamba 21.10.2026')).toBeTruthy();
    expect(within(asamalar[1]!).getByText('30 dk geç başladı')).toBeTruthy();
    expect(within(asamalar[2]!).getByText('bitiş 54 dk geç')).toBeTruthy();
    expect(within(asamalar[2]!).getByText(/^taban /)).toBeTruthy();
    expect(within(asamalar[4]!).getByText('plana göre 56 dk gecikmede')).toBeTruthy();
    expect(within(asamalar[7]!).getByText('termin 30.10.2026')).toBeTruthy();
    expect(within(asamalar[5]!).getByText(/^Pazar 25\.10\.2026 · plan$/)).toBeTruthy();

    fireEvent.click(within(ayrinti).getByRole('tab', { name: 'Tablo' }));
    const adimlar = await within(ayrinti).findByRole('table', { name: 'Adımlar: plan ve gerçek' });
    expect(within(adimlar).getByText('5,5 / 5,8 dk')).toBeTruthy();
    const anlar = within(ayrinti).getByRole('table', { name: 'Anlar' });
    expect(within(anlar).getAllByRole('row')).toHaveLength(12);
    expect(within(anlar).getByText('OP10 durdu · Takım değişimi')).toBeTruthy();

    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Alt parti kartı' }));
    expect(await within(ayrinti).findByRole('region', { name: 'Alt parti kartı' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('?kart= ile gelinince (emir ayrıntısından) kart seçili açılır; akış yetkisi yoksa kart penceresi açılır', async () => {
    sunucuKur(OKUYUCU, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari?kart=12');
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });
});
