import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { KucukResimlerCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { BitenEmirlerCevabi, Emir, EmirAyrintiCevabi, EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

const ACAN = { id: 7, ad: 'Deneme Planlamaci' };
const IST = { id: 3, ad: 'Deneme Tezgah 1' };
const TEMEL = {
  parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: IST, acan: ACAN,
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
};
// Fikstürler sözleşme tipine uyar (satisfies).
const PLANLI = { ...TEMEL, id: 1, emirNo: 'EM-1', durum: 'planli' } satisfies Emir;
const BASLAMIS = { ...TEMEL, id: 2, emirNo: 'EM-2', durum: 'basladi', baslama: '2026-10-06T09:00:00+00:00' } satisfies Emir;
const BITMIS = {
  ...TEMEL, id: 3, emirNo: 'EM-3', durum: 'bitti', baslama: '2026-10-06T09:00:00+00:00', bitis: '2026-10-06T11:00:00+00:00', saglamAdet: 8,
} satisfies Emir;

const liste = (emirler: Emir[]) => ({ emirler }) satisfies EmirlerCevabi;
const ekran = [{ yol: '/uretim-emirleri', ekran: UretimEmirleri }, { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('UretimEmirleri liste', () => {
  it('emirleri gosterir; bitmemis emirde saglam adet "yok", bitmiste sayi', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI, BITMIS])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    const satirlar = screen.getAllByRole('row');
    const planli = satirlar.find((s) => within(s).queryByText('EM-1'))!;
    const bitmis = satirlar.find((s) => within(s).queryByText('EM-3'))!;
    expect(planli.querySelector('td[data-baslik="Sağlam adet"]')?.textContent).toBe('yok');
    expect(bitmis.querySelector('td[data-baslik="Sağlam adet"]')?.textContent).toBe('8');
    expect(within(bitmis).getByText('Üretimi bitti')).toBeTruthy();
    expect(within(planli).getByText('DNM-001')).toBeTruthy();
  });

  it('durum suzgeci sorguya girer', async () => {
    // Sunucu süzgeci uygular; sahte sunucu son isteğin yoluna bakarak aynısını yapar.
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste(istekler.at(-1)?.yol.endsWith('durum=basladi') ? [BASLAMIS] : [PLANLI, BASLAMIS])),
    });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'basladi' } });
    expect(await screen.findByText('EM-2')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    expect(istekler.some((i) => i.yol === '/uretim-emirleri?istasyonsuz=1&durum=basladi')).toBe(true);
  });

  it('bos liste ve sunucu hatasi gosterilir', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('Açık emir yok')).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(503, { kod: 'MESGUL', mesaj: 'Sunucu meşgul.' }) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('Sunucu meşgul.')).toBeTruthy();
  });

  it('#1185: salt okunur; yazma yetkisi olsa da emir aç ve iptal yok, Reçete ve Rota bağlantısı yalnız sayfa yetkisi olana; ?ara= listeyi süzer', async () => {
    const istekler = sunucuKur(YAZAR, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI, BITMIS])) });
    ac(ekran, '/uretim-emirleri?ara=EM-3');
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Emir aç' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reçete ve Rota/ })).toBeNull();
    cleanup();
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'sayfa.recete-rota'] }, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])) });
    const Yer = () => <p>Reçete ve Rota yeri</p>;
    ac([...ekran, { yol: '/recete-rota', ekran: Yer }], '/uretim-emirleri');
    fireEvent.click(await screen.findByRole('button', { name: "Reçete ve Rota'da emir aç" }));
    expect(await screen.findByText('Reçete ve Rota yeri')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem !== 'GET')).toHaveLength(0);
  });
});

describe('UretimEmirleri bitenler (kart #1323)', () => {
  const sayfa = (satirlar: Emir[], no: number, toplam: number) => ({ satirlar, toplam, sayfa: no, sayfaBoyu: 1 }) satisfies BitenEmirlerCevabi;

  it('Bitenler sekmesi biten emirleri sunucudan sayfa sayfa ister; durum süzgeci yalnız kapalı durumları sunar', async () => {
    const IPTAL = { ...TEMEL, id: 4, emirNo: 'EM-4', durum: 'iptal', iptal: '2026-10-06T10:00:00+00:00' } satisfies Emir;
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([PLANLI])),
      'GET /uretim-emirleri/bitenler': () => json(200, istekler.at(-1)?.yol.includes('sayfa=2') ? sayfa([IPTAL], 2, 2) : sayfa([BITMIS], 1, 2)),
    });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    const durumlar = () => [...(screen.getByLabelText('Durum') as HTMLSelectElement).options].map((o) => o.value);
    expect(durumlar()).toEqual(['', 'taslak', 'planli', 'basladi']);
    fireEvent.click(screen.getByRole('tab', { name: /Bitenler/ }));
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    expect(durumlar()).toEqual(['', 'bitti', 'iptal']);
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    expect(await screen.findByText('EM-4')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=2')).toBe(true);
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'bitti' } });
    await screen.findByText('EM-3');
    expect(istekler.at(-1)?.yol).toBe('/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1&durum=bitti');
  });

  it('?ara= açık emirlerde yoksa "Bitenlerde ara" aramayı sunucuya taşır', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([PLANLI])),
      'GET /uretim-emirleri/bitenler': () => json(200, sayfa([BITMIS], 1, 1)),
    });
    ac(ekran, '/uretim-emirleri?ara=EM-3');
    fireEvent.click(await screen.findByRole('button', { name: 'Bitenlerde ara' }));
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1&ara=EM-3')).toBe(true);
  });
});

describe('EmirAyrintisi', () => {
  const ayrinti = (emir: Emir, kayitlar: EmirAyrintiCevabi['kayitlar'] = []) => json(200, { emir, kayitlar } satisfies EmirAyrintiCevabi);

  it('bitmis emirde fark, ham zamanlar ve kayit defteri gorunur', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/3': () => ayrinti(BITMIS, [
        { id: 1, emirId: 3, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'baslat', saglamAdet: null, zaman: '2026-10-06T09:00:00+00:00' },
        { id: 2, emirId: 3, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'bitir', saglamAdet: 8, zaman: '2026-10-06T11:00:00+00:00' },
      ]),
    });
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByText('Emir adedinden 2 eksik')).toBeTruthy();
    const kayit = within(screen.getByRole('table', { name: 'Kayıt defteri' }));
    const baslat = kayit.getByText('Başlatıldı').closest('tr')!;
    expect(baslat.querySelector('td[data-baslik="Adet"]')?.textContent).toBe('yok');
    const bitir = kayit.getByText('Bitirildi').closest('tr')!;
    expect(bitir.querySelector('td[data-baslik="Adet"]')?.textContent).toBe('8');
    expect(within(bitir).getByText('Deneme Operator')).toBeTruthy();
  });

  it('bitmemis emirde fark yok, zamanlar "yok"; kayit yoksa bos mesaj', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/1');
    await screen.findByText('EM-1');
    expect(screen.queryByText('Fark')).toBeNull();
    expect(screen.getByText('Başlama').nextElementSibling?.textContent).toBe('yok');
    expect(screen.getByText('Bitiş').nextElementSibling?.textContent).toBe('yok');
    expect(screen.getByText('Sağlam adet', { selector: 'dt' }).nextElementSibling?.textContent).toBe('yok');
    expect(screen.getByText('Henüz kayıt yok')).toBeTruthy();
  });

  it('#1185: ayrıntıda iptal düğmesi yok; Reçete ve Rota bağlantısı sayfa yetkisine bağlı', async () => {
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'sayfa.recete-rota'] }, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/1');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İptal et' })).toBeNull();
    expect(screen.getByRole('button', { name: "Reçete ve Rota'da aç" })).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/1');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Reçete ve Rota'da aç" })).toBeNull();
  });

  it('bulunamayan emirde sunucu iletisi gosterilir', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/99': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' }) });
    ac(ekran, '/uretim-emirleri/99');
    expect(await screen.findByText('Emir bulunamadı.')).toBeTruthy();
  });
});

describe('malzeme resmi (kart #688)', () => {
  const KARTLI = { ...PLANLI, malzemeNo: 40 } satisfies Emir;
  const KARTSIZ = { ...BASLAMIS, malzemeNo: null } satisfies Emir;
  const resimler = (r: KucukResimlerCevabi['resimler']) => json(200, { resimler: r } satisfies KucukResimlerCevabi);

  it('liste kartli emirlerin resmini tek istekte alir; resim yoksa ya da cizim merkezi okunamazsa liste yine gorunur', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([KARTLI, KARTSIZ])),
      'GET /cizimler/kucuk-resimler': () => resimler([{ hedefId: 40, belgeId: 2, revizyonId: 6, harf: 'B', kareSayisi: 1, revUyumu: false }]),
    });
    ac(ekran, '/uretim-emirleri');
    const resim = await screen.findByRole('img', { name: 'Deneme mil' });
    expect(resim.getAttribute('src')).toBe('/api/cizimler/kucuk-resim/6/0');
    expect(screen.getByRole('img', { name: 'Revizyon uyuşmuyor' })).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/cizimler/')).map((i) => i.yol)).toEqual(['/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=40']);
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([KARTLI])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Deneme mil' })).toBeNull();
  });

  it('ayrinti kartli emirde malzeme resmini gosterir, kartsiz emirde satir yok ve istek atilmaz', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/1': () => json(200, { emir: KARTLI, kayitlar: [] } satisfies EmirAyrintiCevabi),
      'GET /cizimler/kucuk-resimler': () => resimler([{ hedefId: 40, belgeId: 2, revizyonId: 6, harf: 'A', kareSayisi: 8, revUyumu: true }]),
    });
    ac(ekran, '/uretim-emirleri/1');
    expect((await screen.findByRole('img', { name: 'Deneme mil' })).getAttribute('src')).toBe('/api/cizimler/kucuk-resim/6/0');
    expect(screen.getByText('Malzeme resmi')).toBeTruthy();
    cleanup();
    const istekler = sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/2': () => json(200, { emir: KARTSIZ, kayitlar: [] } satisfies EmirAyrintiCevabi) });
    ac(ekran, '/uretim-emirleri/2');
    expect(await screen.findByText('EM-2')).toBeTruthy();
    expect(screen.queryByText('Malzeme resmi')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/cizimler/'))).toBe(false);
  });
});
