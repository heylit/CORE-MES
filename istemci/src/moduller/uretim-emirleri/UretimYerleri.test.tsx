import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimliEmirAyrintisi, EmirAyrintiCevabi, IsEmri, IzlemeEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { UretimYerleri, degisimEngeli } from './UretimYerleri.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

// Emirde adımın iç ya da dış üretimi (UE-URY). Veriler uydurmadır.
const EMIR = {
  id: 3, emirNo: 'EM-3', parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: null, durum: 'planli', acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null, malzemeNo: 501,
} satisfies IzlemeEmri;
const adim = (opNo: number, ek: Partial<IsEmri> = {}): IsEmri => ({
  id: opNo, opNo, sira: opNo / 10, tip: { id: 1, ad: 'Tornalama', kod: 'TOR' }, ad: `Adım ${opNo}`, tur: 'rota', ekAciklama: null,
  kaynak: { tur: 'makine', id: 4, kod: 'M-1', ad: 'Tezgah' }, istasyon: { id: 2, kod: 'IS-1', ad: 'İstasyon 1' }, ayarSuresiDk: '10', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, durum: 'bekliyor', baslama: null, bitis: null, saglamAdet: null,
  bilesenler: [], adaylar: [], fason: null, uretimYeriDegisimi: null, ...ek,
});
const ayrinti = (isEmirleri: IsEmri[]): AdimliEmirAyrintisi => ({
  id: 3, emirNo: 'EM-3', urun: { id: 501, kod: 'DNM-001', ad: 'Deneme mil' }, adet: 10, oncelik: 3, baslangic: null, teslim: null, durum: 'planli', arsiv: false,
  kaynakRotaRevizyonId: 1, adimSayisi: isEmirleri.length, tamamAdim: 0, siradaki: null, aciklama: null, acilma: '2026-10-06T08:00:00+00:00', surum: 4,
  isEmirleri, eski: null,
});
const FASONDA = adim(20, {
  kaynak: { tur: 'fason', id: 41, kod: 'F-01', ad: 'Deneme kaplama' }, istasyon: null, ayarSuresiDk: null, birimSureDk: null, terminGun: 5,
  fason: { gonderilen: 0, donenSaglam: 0, donenHurda: 0, hareketler: [] },
});
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
// Emrin evi (Reçete ve Rota) bileşeni `duzenlenir` ile çizer (1391 a).
const ev = [{ yol: '/ev/:id', ekran: () => <UretimYerleri emir={{ id: 3, malzemeNo: 501 }} duzenlenir /> }];
const yollar = (isEmirleri: IsEmri[], ek: Record<string, (g: unknown) => Response> = {}) => ({
  'GET /uretim-emirleri/3': () => json(200, { emir: EMIR, kayitlar: [] } satisfies EmirAyrintiCevabi),
  'GET /adimli-emirler/3': () => json(200, { emir: ayrinti(isEmirleri) }),
  'GET /adimli-emirler/fason-firmalari': () => json(200, { firmalar: [{ id: 41, kod: 'F-01', ad: 'Deneme kaplama' }] }),
  ...ek,
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Emirde iç ve dış üretim', () => {
  it('her adımın nerede yapıldığı görünür; emri yazan başlamamış adımı fasona alır, firma ve termin gider', async () => {
    const istekler = sunucuKur(YAZAR, yollar([adim(10, { durum: 'calisiyor', baslama: '2026-10-06T09:00:00+00:00' }), adim(20)], {
      'POST /adimli-emirler/3/uretim-yeri': () => json(200, { emir: ayrinti([adim(10), FASONDA]) }),
    }));
    ac(ev, '/ev/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).getAllByText('İç üretim')).toHaveLength(2);
    expect(within(tablo).getByText('Başladı; değişmez.')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Fasona al' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Nerede yapılır'), { target: { value: 'fason' } });
    const kaydet = within(pencere).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    await waitFor(() => { expect(within(pencere).getAllByRole('option').map((o) => o.textContent)).toContain('F-01 Deneme kaplama'); });
    fireEvent.change(within(pencere).getByLabelText(/Fason firma/), { target: { value: '41' } });
    // Termin isteğe bağlı (kullanıcı kararı): boşken kaydedilebilir; girilirse 1-365 olmalı.
    expect(kaydet.disabled).toBe(false);
    fireEvent.change(within(pencere).getByLabelText(/Termin/), { target: { value: '0' } });
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Termin/), { target: { value: '5' } });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/adimli-emirler/3/uretim-yeri', govde: { opNo: 20, yer: 'fason', firmaId: 41, terminGun: 5, surum: 4 } });
  });

  it('1208: fasonun arkasına giren otomatik GKK adımı etiketiyle görünür; elle eklenen ek adım etiket almaz', async () => {
    const gkk = adim(25, { ad: 'GKK (otomatik)', tur: 'ek', ekAciklama: 'Otomatik GKK', tip: { id: 9, ad: 'Giriş kalite kontrol', kod: 'GKK' } });
    sunucuKur(OKUYUCU, yollar([adim(10), FASONDA, gkk, adim(30, { tur: 'ek', ekAciklama: 'Elle ek' })]));
    ac(ekran, '/uretim-emirleri/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).getAllByText('Otomatik GKK')).toHaveLength(1);
    expect(within(within(tablo).getByText('Otomatik GKK').closest('tr')!).getByText('GKK (otomatik)')).toBeTruthy();
  });

  it('fasondaki adım firmasıyla görünür ve içeri alınır; son değişikliği yapan kişi görünür', async () => {
    const istekler = sunucuKur(YAZAR, yollar([adim(10), { ...FASONDA, uretimYeriDegisimi: { yer: 'fason', kisi: { id: 7, ad: 'Deneme Planlamaci' }, zaman: '2026-10-07T08:00:00+00:00' } }], {
      'POST /adimli-emirler/3/uretim-yeri': () => json(200, { emir: ayrinti([adim(10), adim(20)]) }),
    }));
    ac(ev, '/ev/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).getByText('Dış üretim: F-01 Deneme kaplama')).toBeTruthy();
    expect(within(tablo).getByText(/Deneme Planlamaci ·/)).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Nerede yapılır'), { target: { value: 'ic' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ opNo: 20, yer: 'ic', firmaId: null, terminGun: null, surum: 4 }); });
  });

  it('3039: Reçete ve Rota\'yı okuyamayan kişinin emir sayfası salt okunurdur; yazma yetkisi olana da düğme çıkmaz', async () => {
    const istekler = sunucuKur(YAZAR, yollar([adim(10), FASONDA]));
    ac(ekran, '/uretim-emirleri/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).queryByRole('button')).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('yazma yetkisi olmayan emrin evinde de adımları görür ama değiştiremez', async () => {
    sunucuKur(OKUYUCU, yollar([adim(10), adim(20)]));
    ac(ev, '/ev/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).queryByRole('button', { name: 'Fasona al' })).toBeNull();
    expect(screen.queryByText("Üretim yeri Reçete ve Rota'daki emirde değiştirilir.")).toBeNull();
  });

  it('başlamış, bitmiş ya da fasona gönderilmiş adım değişmez; bekleyen değişir', () => {
    expect(degisimEngeli(adim(10))).toBeNull();
    expect(degisimEngeli(FASONDA)).toBeNull();
    expect(degisimEngeli(adim(10, { durum: 'calisiyor' }))).toBe('Başladı; değişmez.');
    expect(degisimEngeli(adim(10, { durum: 'tamam' }))).toBe('Bitti; değişmez.');
    expect(degisimEngeli({ ...FASONDA, fason: { gonderilen: 3, donenSaglam: 0, donenHurda: 0, hareketler: [] } })).toBe('Fasona gönderildi; değişmez.');
  });
});

describe('İzleme ayrıntısında adım durumu (1787c)', () => {
  it('izlemede her adımın durumu, sağlamı ve karar bekleyeni görünür; alt parça adımı dal etiketi taşır', async () => {
    sunucuKur(OKUYUCU, yollar([
      adim(1010, { durum: 'tamam', saglamAdet: 8, dal: { ad: 'K1', malzeme: { id: 77, kod: 'DNM-ALT', ad: 'Deneme burç' }, kaynakOpNo: 10 } }),
      adim(30, { durum: 'calisiyor', saglamAdet: null, kararBekliyor: 3, dal: null }),
      adim(40, { kararBekliyor: 0, dal: null }),
    ]));
    ac(ekran, '/uretim-emirleri/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[0]!).getByText('K1')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('DNM-ALT · rotada OP 10')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('8')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Çalışıyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('yok · karar bekleyen 3')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('Bekliyor')).toBeTruthy();
    expect(within(satirlar[2]!).queryByText(/karar bekleyen/)).toBeNull();
  });

  it('K21 a: alt parçası bitmemiş montaj adımı uyarı taşır; eksik yoksa uyarı yok', async () => {
    const alt = { ad: 'K1', malzeme: { id: 77, kod: 'DNM-ALT', ad: 'Deneme burç' } };
    sunucuKur(OKUYUCU, yollar([
      adim(1020, { dal: { ...alt, kaynakOpNo: 20 }, eksikAltParcalar: [] }),
      adim(40, { durum: 'calisiyor', eksikAltParcalar: [alt] }),
    ]));
    ac(ekran, '/uretim-emirleri/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[1]!).getByText('Alt parça bekleniyor: K1 DNM-ALT')).toBeTruthy();
    expect(within(satirlar[0]!).queryByText(/Alt parça bekleniyor/)).toBeNull();
  });

  it('emrin evinde (Reçete ve Rota) tablo değişmez: durum ve sağlam sütunu, dal etiketi yok', async () => {
    sunucuKur(YAZAR, yollar([adim(1010, { dal: { ad: 'K1', malzeme: { id: 77, kod: 'DNM-ALT', ad: 'Deneme burç' }, kaynakOpNo: 10 }, kararBekliyor: 2 })]));
    ac(ev, '/ev/3');
    const tablo = await screen.findByRole('table', { name: 'Operasyon adımları' });
    expect(within(tablo).queryByText('Durum')).toBeNull();
    expect(within(tablo).queryByText('Sağlam')).toBeNull();
    expect(within(tablo).queryByText('K1')).toBeNull();
  });
});
