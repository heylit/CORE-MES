import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { Emir, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { kisaZaman, konumDuraklari, sureKisa } from './iplik.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR: Emir = {
  id: 5, emirNo: 'UE-000005', parcaNo: 'DNM-005', parcaAd: 'Deneme flans', adet: 6, istasyon: { id: 3, ad: 'Deneme Tezgah 1' },
  durum: 'bitti', acan: { id: 7, ad: 'Deneme Planlamaci' }, acilma: '2026-10-06T07:00:00+00:00', baslama: '2026-10-06T08:00:00+00:00',
  bitis: '2026-10-06T12:00:00+00:00', iptal: null, saglamAdet: 6, canli: null, malzemeNo: 40,
};
const AYRINTI = { emir: EMIR, kayitlar: [], adimlar: [] } satisfies EmirAyrintiCevabi;

const olcu = { dk: null, acik: false };
const adimOlcusu = (isEmriId: number, opNo: number, istasyon: string | null, fason: boolean, saglamAdet: number) => ({
  isEmriId, opNo, istasyon, fason, beklemeDk: null, hazirlikDk: null, islemeDk: null, duraklamaDk: null, durusDk: null, fasonDk: null,
  saglamAdet, cevrimBirimDk: null, standartBirimDk: null, standartHazirlikDk: null, terminGun: null,
});
const AKIS = {
  emir: { id: 5, emirNo: 'UE-000005', adet: 6, durum: 'bitti', teslim: null },
  simdi: '2026-10-07T10:00:00.000Z',
  damgalar: { malKabul: '2026-10-05T07:42:00.000Z', uretimBasladi: '2026-10-06T08:00:00.000Z', uretimBitti: '2026-10-06T12:00:00.000Z', sevkeHazir: '2026-10-06T13:00:00.000Z', sevk: null },
  olculer: { uctanUca: olcu, hammaddeBekleme: olcu, uretimAkis: olcu, sevkBekleme: olcu, islemeToplamDk: null, akisVerimi: null },
  seritler: [
    { anahtar: 'adim-11', tur: 'adim', baslik: 'OP10', altBaslik: 'Deneme Torna', bolumler: [
      { tur: 'isleme', baslangic: '2026-10-06T08:00:00.000Z', bitis: '2026-10-06T09:30:00.000Z', acik: false },
    ] },
    { anahtar: 'adim-12', tur: 'adim', baslik: 'OP20', altBaslik: 'Fason', bolumler: [] },
    { anahtar: 'adim-13', tur: 'adim', baslik: 'OP30', altBaslik: 'Deneme Freze', bolumler: [
      { tur: 'bekleme', baslangic: '2026-10-06T09:30:00.000Z', bitis: '2026-10-06T10:00:00.000Z', acik: false },
      { tur: 'isleme', baslangic: '2026-10-06T10:00:00.000Z', bitis: '2026-10-06T12:00:00.000Z', acik: false },
    ] },
  ],
  adimlar: [adimOlcusu(11, 10, 'Deneme Torna', false, 6), adimOlcusu(12, 20, null, true, 0), adimOlcusu(13, 30, 'Deneme Freze', false, 6)],
  statuler: [],
  hammadde: [{ partiId: 77, lotNo: 'DNM-LOT-1', malKabul: '2026-10-05T07:42:00.000Z', kullanim: '2026-10-06T08:00:00.000Z', beklemeDk: null }],
} satisfies EmirAkisiCevabi;

const AKISLI: Kullanici = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.akis'] };
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
function AkisEkrani() { return <p>Akış ekranı {useParams().id}</p>; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const duraklar = () => within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem').map((d) => d.getAttribute('aria-label'));

describe('İzlenebilirlik ipliği', () => {
  it('düğmeyle açılır; duraklar mal kabul, rota adımları sırasıyla, kalite ve sevk', async () => {
    const istekler = sunucuKur(AKISLI, {
      'GET /uretim-emirleri/5': () => json(200, AYRINTI),
      'GET /akis/emirler/5': () => json(200, AKIS),
    });
    ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    expect(screen.queryByRole('img', { name: /izlenebilirlik ipliği/ })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/akis'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    expect(duraklar()).toEqual([
      `Mal kabul: Parti DNM-LOT-1, ${kisaZaman('2026-10-05T07:42:00.000Z')}`,
      `Deneme Torna: OP10 · 6 adet, ${kisaZaman('2026-10-06T08:00:00.000Z')} – ${kisaZaman('2026-10-06T09:30:00.000Z')}`,
      'Fason: OP20, kayıt yok',
      `Deneme Freze: OP30 · 6 adet, ${kisaZaman('2026-10-06T10:00:00.000Z')} – ${kisaZaman('2026-10-06T12:00:00.000Z')}`,
      'Kalite: kayıt yok',
      `Sevk: Hazır ${kisaZaman('2026-10-06T13:00:00.000Z')}`,
    ]);
    const yanan = within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem').map((d) => d.classList.contains('tc-iplik-yandi'));
    expect(yanan).toEqual([true, true, false, true, false, true]);

    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('img', { name: /izlenebilirlik ipliği/ })).toBeNull();
  });

  it('Akış Süresi yetkisi yoksa uç çağrılmaz; mal kabul, kalite, sevk soluk ve "kayıt yok"', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI) });
    ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    const ogeler = within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem');
    expect(ogeler.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Mal kabul: kayıt yok',
      `Deneme Tezgah 1: 6 / 6 adet, ${kisaZaman(EMIR.baslama!)} – ${kisaZaman(EMIR.bitis!)}`,
      'Kalite: kayıt yok',
      'Sevk: kayıt yok',
    ]);
    expect(ogeler.map((d) => d.classList.contains('tc-iplik-bos'))).toEqual([true, false, true, true]);
    expect(istekler.some((i) => i.yol.startsWith('/akis'))).toBe(false);
    expect(screen.getByText('Parti, rota saatleri ve sevk Akış Süresi yetkisiyle görünür.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Akış Süresi'nde aç" })).toBeNull();
  });

  it("Akış Süresi yetkisi olan emrin yolculuğunu Akış Süresi'nde açar", async () => {
    sunucuKur(AKISLI, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI), 'GET /akis/emirler/5': () => json(200, AKIS) });
    ac([...ekran, { yol: '/akis/:id', ekran: AkisEkrani }], '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    // 3039: başka ekranlara geçiş başlığın üstündeki "Bağlantılar" menüsündedir.
    fireEvent.click(screen.getByRole('button', { name: 'Emri başka ekranda aç' }));
    fireEvent.click(screen.getByRole('menuitem', { name: "Akış Süresi'nde aç" }));
    expect(await screen.findByText('Akış ekranı 5')).toBeTruthy();
  });

  it('emrin işaretli adımları durak olur; işaretsiz adım "kayıt yok"', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/5': () => json(200, {
      ...AYRINTI,
      adimlar: [
        { id: 1, sira: 1, ad: 'Kesim', aciklama: null, asama: 'uretim', tamam: true, tamamlayan: { id: 7, ad: 'Deneme Planlamaci' }, tamamlanma: '2026-10-06T08:30:00+00:00', kanit: null, gecenNot: null, buNot: null, talimat: null },
        { id: 2, sira: 2, ad: 'Çapak alma', aciklama: null, asama: 'uretim', tamam: false, tamamlayan: null, tamamlanma: null, kanit: null, gecenNot: null, buNot: null, talimat: null },
      ],
    } satisfies EmirAyrintiCevabi) });
    ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    expect(duraklar().slice(1, 3)).toEqual([
      `Kesim: Deneme Planlamaci, ${kisaZaman('2026-10-06T08:30:00+00:00')}`,
      'Çapak alma: kayıt yok',
    ]);
  });

  it('hareket açıkken iplik baştan çizilir; "sade" seçiminde tam çizili gelir', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const yanan = async () => {
      sunucuKur(AKISLI, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI), 'GET /akis/emirler/5': () => json(200, AKIS) });
      ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
      await screen.findByText('UE-000005');
      fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
      const ogeler = within(await screen.findByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem');
      return ogeler.filter((d) => d.classList.contains('tc-iplik-yandi')).length;
    };
    expect(await yanan()).toBeLessThan(4);
    cleanup();
    document.documentElement.dataset.hareket = 'sade';
    try {
      expect(await yanan()).toBe(4);
    } finally {
      delete document.documentElement.dataset.hareket;
    }
  });
});

// 2224-1 b: Parçayı izle konumdan konuma yolu çizer, istasyonda adım bilgisiyle; hareket yoksa adım ipliği kalır.
const konum = (id: number, kod: string, tur: string, istasyon: string | null = null, ad: string | null = null) => ({ id, kod, ad, tur, istasyon });
const H = (id: number, zaman: string, tur: 'giris' | 'cikis' | 'transfer' | 'geri_alma', malzemeId: number, kaynak: ReturnType<typeof konum> | null, hedef: ReturnType<typeof konum> | null,
  ek: { cikisNedeni?: string; geriAlinanId?: number } = {}) => ({
  id, zaman, tur, malzemeId, partiId: null, miktar: '6', cikisNedeni: ek.cikisNedeni ?? null, geriAlinanId: ek.geriAlinanId ?? null, kaynak, hedef,
});
const RAF = konum(1, 'A-01', 'raf_gozu');
const KABUL = konum(2, 'KABUL', 'kabul', null, 'Mal kabul alanı');
const TORNA = konum(3, 'IST-1', 'istasyon', 'Deneme Torna');
const FREZE = konum(4, 'IST-2', 'istasyon', 'Deneme Freze');
const KONUMLU = {
  ...AKIS,
  konumHareketleri: [
    H(1, '2026-10-05T07:42:00.000Z', 'giris', 99, null, KABUL),
    H(2, '2026-10-05T09:42:00.000Z', 'transfer', 99, KABUL, RAF),
    H(3, '2026-10-06T08:00:00.000Z', 'cikis', 99, RAF, null, { cikisNedeni: 'uretime_sarf' }),
    H(4, '2026-10-06T09:30:00.000Z', 'giris', 40, null, TORNA),
    H(5, '2026-10-06T09:40:00.000Z', 'transfer', 40, TORNA, KABUL),
    H(6, '2026-10-06T09:41:00.000Z', 'geri_alma', 40, KABUL, TORNA, { geriAlinanId: 5 }),
    H(7, '2026-10-06T10:00:00.000Z', 'transfer', 40, TORNA, FREZE),
    H(8, '2026-10-06T10:30:00.000Z', 'transfer', 40, FREZE, FREZE),
    H(9, '2026-10-06T13:00:00.000Z', 'cikis', 40, FREZE, null, { cikisNedeni: 'sevk' }),
  ],
} satisfies EmirAkisiCevabi;

describe('Parçanın konum akışı (2224)', () => {
  it('hammadde konumları, sonra ürünün konumları; istasyonda OP ve adet, durakta kalış süresi; geri alınan ve yerinde değişim yol sayılmaz', () => {
    const d = konumDuraklari(AYRINTI, KONUMLU);
    expect(d.map((x) => x.ad)).toEqual(['Mal kabul alanı', 'A-01', 'Deneme Torna', 'Deneme Freze', 'Sevk']);
    expect(d[0]!.satirlar).toEqual(['KABUL', kisaZaman('2026-10-05T07:42:00.000Z'), '2 sa kaldı']);
    expect(d[1]!.satirlar).toEqual([kisaZaman('2026-10-05T09:42:00.000Z'), '22 sa kaldı']);
    expect(d[2]!.satirlar).toEqual(['OP10 · 6 adet', kisaZaman('2026-10-06T09:30:00.000Z'), '30 dk kaldı']);
    expect(d[3]!.satirlar).toEqual(['OP30 · 6 adet', kisaZaman('2026-10-06T10:00:00.000Z'), '3 sa kaldı']);
    expect(d[4]!.tur).toBe('sevk');
  });

  it('sevk edilmemiş parçada son durak "burada" süresini akışın şimdisinden sayar', () => {
    const d = konumDuraklari(AYRINTI, { ...KONUMLU, konumHareketleri: KONUMLU.konumHareketleri.slice(3, 4) });
    expect(d.map((x) => x.satirlar.at(-1))).toEqual(['burada 1 gün']);
  });

  it('Parçayı izle konum akışını açar; konum hareketi yoksa adım ipliği ve not', async () => {
    sunucuKur(AKISLI, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI), 'GET /akis/emirler/5': () => json(200, KONUMLU) });
    ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    const img = await screen.findByRole('img', { name: 'UE-000005 konum akışı' });
    expect(within(img).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('heading', { name: 'Parçanın konum akışı' })).toBeTruthy();
    cleanup();
    sunucuKur(AKISLI, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI), 'GET /akis/emirler/5': () => json(200, { ...AKIS, konumHareketleri: [] }) });
    ac(ekran, '/uretim-emirleri/5?sekme=kayitlar');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    expect(screen.getByText('Bu emrin konum hareketi yok; rota adımları gösteriliyor.')).toBeTruthy();
  });

  it('süre metni gün, saat, dakika', () => {
    expect([sureKisa(3 * 86_400_000 + 5), sureKisa(4 * 3_600_000), sureKisa(59_999 * 10)]).toEqual(['3 gün', '4 sa', '9 dk']);
  });
});
