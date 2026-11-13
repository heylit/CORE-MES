import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Bekletme, Emir, EmirAyrintiCevabi, EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Menu, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { EmirAyrintisi, type EmirParcalari } from './EmirAyrintisi.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

// 3050 a: bekletme durum değil işarettir. Liste ayrı "Beklemede" süzgeci ve rozet yanında işaret gösterir; emir sayfası şerit,
// "Devam ettir", "Beklet" penceresi ve kayıt defteri satırları.
const IST = { id: 3, ad: 'Deneme Tezgah 1' };
const TEMEL = {
  parcaNo: 'ORN-001', parcaAd: 'Deneme mil', adet: 10, istasyon: IST, acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
};
const BEKLETME: Bekletme = { neden: 'musteri', not: 'Deneme notu', kisi: { id: 7, ad: 'Deneme Planlamaci' }, zaman: '2026-10-06T09:30:00+00:00' };
const PLANLI = { ...TEMEL, id: 1, emirNo: 'ORN-1', durum: 'planli' } satisfies Emir;
const BEKLEYEN = { ...TEMEL, id: 2, emirNo: 'ORN-2', durum: 'planli', bekletme: BEKLETME } satisfies Emir;
const URETIMDE = { ...TEMEL, id: 4, emirNo: 'ORN-4', durum: 'basladi', baslama: '2026-10-06T09:00:00+00:00' } satisfies Emir;

// "İşlemler" menüsü sahibin (Reçete ve Rota) parçasıdır; burada yalnız bu modülün verdiği öğeleri çizer.
const parcalar: EmirParcalari = {
  sar: (i) => i,
  islemler: (_id, ek: readonly MenuOgesi[]) => (ek.length > 0 ? <Menu etiket="Emir işlemleri" metin="İşlemler" ogeler={[...ek]} /> : <p>Ek işlem yok</p>),
  adimlar: () => null,
  malzeme: () => null,
};
const AyrintiR = () => <EmirAyrintisi parcalar={parcalar} />;
const ekran = [{ yol: '/uretim-emirleri', ekran: UretimEmirleri }, { yol: '/uretim-emirleri/:id', ekran: AyrintiR }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3050 bekletme: liste', () => {
  it('"Beklemede" ayrı süzgeçtir; bekleyen emir Planlı sayısında kalır; rozet yanında işaret, "Şu an"da neden', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, { emirler: [PLANLI, BEKLEYEN, URETIMDE] } satisfies EmirlerCevabi) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('ORN-2');
    const cipler = screen.getByRole('group', { name: 'Duruma göre süz' });
    expect(within(cipler).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Tümü 3', 'Taslak 0', 'Planlı 2', 'Üretimde 1', 'Duran 0', 'Beklemede 1']);
    const satir = screen.getByText('ORN-2').closest('tr')!;
    expect(satir.querySelector('td[data-baslik="Durum"]')?.textContent).toBe('Planlı Beklemede');
    expect(satir.querySelector('td[data-baslik="Şu an"]')?.textContent).toBe('Beklemede: Müşteri onayı bekleniyorDeneme Planlamaci');
    expect(screen.getByText('ORN-1').closest('tr')!.querySelector('td[data-baslik="Durum"]')?.textContent).toBe('Planlı');
    fireEvent.click(within(cipler).getByRole('button', { name: 'Beklemede 1' }));
    expect(screen.getByText('ORN-2')).toBeTruthy();
    expect(screen.queryByText('ORN-1')).toBeNull();
    expect(screen.queryByText('ORN-4')).toBeNull();
  });
});

describe('3050 bekletme: emir sayfası', () => {
  const ayrinti = (emir: Emir, ek: Partial<EmirAyrintiCevabi> = {}) => json(200, { emir, kayitlar: [], ...ek } satisfies EmirAyrintiCevabi);

  it('bekleyen emirde şerit, rozet yanında işaret, "Şu an" Beklemede; "Devam ettir" bekletmeyi kaldırır; menüde "Beklet" yok', async () => {
    let emir: Emir = BEKLEYEN;
    const istekler = sunucuKur(YAZAR, {
      'GET /uretim-emirleri/2': () => ayrinti(emir),
      'POST /uretim-emirleri/2/bekletme-kaldir': () => { emir = { ...BEKLEYEN, bekletme: null }; return ayrinti(emir); },
    });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', { name: 'Emir beklemede' });
    expect(within(serit).getByText('Beklemede: Müşteri onayı bekleniyor')).toBeTruthy();
    expect(within(serit).getByText('Deneme notu')).toBeTruthy();
    expect(screen.getAllByText('Beklemede').length).toBeGreaterThan(0);
    expect(screen.getByText('Ek işlem yok')).toBeTruthy();
    fireEvent.click(within(serit).getByRole('button', { name: 'Devam ettir' }));
    await waitFor(() => { expect(screen.queryByRole('status', { name: 'Emir beklemede' })).toBeNull(); });
    const komut = istekler.find((i) => i.yontem === 'POST')!;
    expect(komut.yol).toBe('/uretim-emirleri/2/bekletme-kaldir');
    expect(komut.kimlik).toBeTruthy();
  });

  it('emri düzenleyemeyen kişi "Devam ettir" ve "Beklet" görmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/2': () => ayrinti(BEKLEYEN), 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/2');
    const serit = await screen.findByRole('status', { name: 'Emir beklemede' });
    expect(within(serit).queryByRole('button', { name: 'Devam ettir' })).toBeNull();
    cleanup();
    ac(ekran, '/uretim-emirleri/1');
    await screen.findByRole('list', { name: 'Emrin yaşam döngüsü' });
    expect(screen.getByText('Ek işlem yok')).toBeTruthy();
  });

  it('3207 a: "Devam ettir" yalnız bekletme eylemine bakar; öbür yedi eylemi olan görmez', async () => {
    const tek = (islem: string) => ({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, islem] }) as typeof OKUYUCU;
    for (const [islem, gorur] of [
      ['uretim-emirleri.beklet', true], ['uretim-emirleri.duzenle', false], ['uretim-emirleri.iptal', false], ['uretim-emirleri.plana-al', false],
    ] as const) {
      sunucuKur(tek(islem), { 'GET /uretim-emirleri/2': () => ayrinti(BEKLEYEN) });
      ac(ekran, '/uretim-emirleri/2');
      const serit = await screen.findByRole('status', { name: 'Emir beklemede' });
      expect(within(serit).queryByRole('button', { name: 'Devam ettir' }) !== null, islem).toBe(gorur);
      cleanup();
    }
  });

  it('"Beklet" neden ister; gönderilen gövde neden ve isteğe bağlı nottur', async () => {
    let emir: Emir = PLANLI;
    const istekler = sunucuKur(YAZAR, {
      'GET /uretim-emirleri/1': () => ayrinti(emir),
      'POST /uretim-emirleri/1/beklet': () => { emir = { ...PLANLI, bekletme: { ...BEKLETME, neden: 'malzeme', not: null } }; return ayrinti(emir); },
    });
    ac(ekran, '/uretim-emirleri/1');
    await screen.findByRole('list', { name: 'Emrin yaşam döngüsü' });
    expect(screen.queryByRole('status', { name: 'Emir beklemede' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Emir işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Beklet' }));
    const pencere = await screen.findByRole('dialog', { name: 'ORN-1 bekletilsin mi?' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Beklet' }));
    expect(await within(pencere).findByText('Neden seçin.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText('Neden'), { target: { value: 'malzeme' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Beklet' }));
    expect(await screen.findByRole('status', { name: 'Emir beklemede' })).toBeTruthy();
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ neden: 'malzeme' });
  });

  it('üretimi bitmiş emirde "Beklet" yok', async () => {
    const BITMIS = { ...TEMEL, id: 3, emirNo: 'ORN-3', durum: 'bitti', bitis: '2026-10-06T11:00:00+00:00', saglamAdet: 10 } satisfies Emir;
    sunucuKur(YAZAR, { 'GET /uretim-emirleri/3': () => ayrinti(BITMIS) });
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByText('Ek işlem yok')).toBeTruthy();
  });

  it('kayıt defteri "Bekletildi" ve "Devam etti" satırlarını zamanına göre üretim kayıtlarıyla birlikte gösterir', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/4': () => ayrinti(URETIMDE, {
        kayitlar: [
          { id: 1, emirId: 4, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'baslat', saglamAdet: null, zaman: '2026-10-06T09:00:00+00:00' },
          { id: 2, emirId: 4, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'duraklat', saglamAdet: null, zaman: '2026-10-06T10:00:00+00:00' },
        ],
        bekletmeler: [
          { id: 1, olay: 'beklet', neden: 'kalite', not: 'Deneme notu', kisi: { id: 7, ad: 'Deneme Planlamaci' }, zaman: '2026-10-06T09:30:00+00:00' },
          { id: 2, olay: 'devam', neden: null, not: null, kisi: { id: 7, ad: 'Deneme Planlamaci' }, zaman: '2026-10-06T10:30:00+00:00' },
        ],
      }),
    });
    ac(ekran, '/uretim-emirleri/4?sekme=kayitlar');
    const defter = await screen.findByRole('table', { name: 'Kayıt defteri' });
    const olaylar = within(defter).getAllByRole('row').slice(1).map((r) => r.querySelector('td[data-baslik="Olay"]')?.textContent);
    expect(olaylar).toEqual(['Başlatıldı', 'Bekletildi', 'Duraklatıldı', 'Devam etti']);
    const beklet = within(defter).getByText('Bekletildi').closest('tr')!;
    expect(beklet.querySelector('td[data-baslik="Neden"]')?.textContent).toBe('Kalite kararı bekleniyor · Deneme notu');
    expect(within(beklet).getByText('Deneme Planlamaci')).toBeTruthy();
  });
});
