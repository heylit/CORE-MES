import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { VergiBeyaniSatiri } from '#paylasilan/sozlesme/finans.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { json, sunucuKur, YAZAN } from '../test-ortak.tsx';
import { Butce, NakitPlani, VergiTakvimi } from './index.tsx';
import { finansiKur } from '../veri.ts';
import { BUGUN, ekranAc, finansKur, OKUR, tuvalsiz, YAZAR, YONETICI } from './test-yardim.tsx';

beforeEach(tuvalsiz);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const beklenenli = () => {
  const ham = ornekHamVeri();
  ham.beklenenOdemeler = [{
    id: 9, talepId: 't', teklifId: 'k', siparisNo: 'SA-1', sira: 1, tur: 'vade', vade: '2026-10-29', yontem: 'banka', firmaId: 2, firmaAdi: 'Deneme Tedarik',
    paraBirimi: 'TRY', tutar: '1000.00', tutarTl: '1000.00', tahminTl: '800.00', avansDusulenTl: '200.00', gecikmis: false, bagsizFatura: true,
  }];
  return finansKur(ham);
};

describe('Nakit planı', () => {
  it('genel görünüm: risk özeti, yelpaze ve köprü; beklenen ödemeler paneli', () => {
    ekranAc(NakitPlani, OKUR, beklenenli());
    expect(within(screen.getByLabelText('Nakit riski')).getByText('Eksiye düşme olasılığı')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Olası nakit seyri/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nakit nereden gelip nereye gidiyor?' })).toBeTruthy();
    const panel = screen.getByRole('table', { name: 'Siparişten beklenen ödemeler' });
    expect(within(panel).getByText('Bağlanmamış fatura var')).toBeTruthy();
    expect(within(panel).getByText(/Ödenmiş avans düşüldü/)).toBeTruthy();
  });

  it('2132c: satış siparişinden beklenen tahsilatlar paneli sunucudan okunur; gecikmiş, kısmi faturalı ve başka para birimli satır işaretlenir', async () => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      if (adres.includes('/finans/beklenen-tahsilatlar')) {
        return json(200, { tahsilatlar: [{
          id: 1, siparisId: 7, siparisNo: 'SS-2026-001', firmaId: 3, firmaAdi: 'Deneme Musteri', paraBirimi: 'TRY', tutar: '1500.00', faturalanan: '600.00', kalan: '900.00',
          kalanTl: '900.00', sevkTarihi: '2026-10-01', sevkKaynagi: 'termin', vadeGun: 10, vade: '2026-10-11', gecikmis: true, baskaParaBirimi: true,
        }] });
      }
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    ekranAc(NakitPlani, OKUR, beklenenli());
    const panel = await screen.findByRole('table', { name: 'Siparişten beklenen tahsilatlar' });
    expect(within(panel).getByText('SS-2026-001')).toBeTruthy();
    expect(within(panel).getByText('Gecikmiş, kontrol edin')).toBeTruthy();
    expect(within(panel).getByText('Başka para biriminde fatura var')).toBeTruthy();
    expect(within(panel).getByText(/faturalanan/)).toBeTruthy();
    expect(within(panel).getByText(/Termine göre · 10 gün vade/)).toBeTruthy();
  });

  it('2132c: beklenen tahsilatlar okunamazsa panel hata gösterir, öteki bölümler çalışır', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' })));
    ekranAc(NakitPlani, OKUR, beklenenli());
    expect(await screen.findByText('Beklenen tahsilatlar okunamadı.')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Siparişten beklenen ödemeler' })).toBeTruthy();
  });

  it('hafta hafta: 13 hafta, siparişten sütunu; varsayım değişince plan yeniden hesaplanır; satır kalemleri açar', () => {
    ekranAc(NakitPlani, OKUR, beklenenli());
    fireEvent.click(screen.getByRole('button', { name: 'Hafta hafta plan' }));
    const tablo = screen.getByRole('table', { name: 'Hafta hafta nakit planı' });
    expect(within(tablo).getAllByRole('row').slice(1)).toHaveLength(13);
    expect(within(tablo).getByRole('columnheader', { name: 'Siparişten (tahmin)' })).toBeTruthy();
    const ozet = screen.getByLabelText('13 haftalık plan');
    const once = within(ozet).getByText('13 hafta giriş').parentElement!.textContent;
    fireEvent.change(screen.getByRole('slider', { name: /Gecikmiş alacakların tahsili/ }), { target: { value: '0' } });
    expect(within(ozet).getByText('13 hafta giriş').parentElement!.textContent).not.toBe(once);
    fireEvent.click(within(tablo).getAllByRole('row')[1]!);
    // Kalemler prototipteki gibi satırın altında açılır; ikinci tık kapatır.
    expect(screen.getByRole('list', { name: '1. hafta kalemleri' })).toBeTruthy();
    fireEvent.click(within(tablo).getAllByRole('row')[1]!);
    expect(screen.queryByRole('list', { name: '1. hafta kalemleri' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Varsayılana dön' }));
    expect(within(ozet).getByText('13 hafta giriş').parentElement!.textContent).toBe(once);
  });

  it('kayıt yoksa tahmin yerine bilgi', () => {
    const ham = ornekHamVeri();
    ham.belgeler = []; ham.odemeler = []; ham.dagitimlar = []; ham.mahsuplar = [];
    ekranAc(NakitPlani, OKUR, finansKur(ham));
    expect(screen.getByText('Tahmin için kayıt gerekiyor.')).toBeTruthy();
  });
});

describe('Bütçe', () => {
  it('3165 a: bütçe yalnız ayar eylemiyle yazılır; öteki yedi yönetim eylemi tutar girdisini açmaz', () => {
    ekranAc(Butce, { ...YONETICI, ayar: false });
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Son 6 ay ortalamasıyla doldur' })).toBeNull();
    cleanup();
    ekranAc(Butce, { ...YAZAR, ayar: true });
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Son 6 ay ortalamasıyla doldur' })).toBeTruthy();
  });

  it('reddedilen: finans.ayar yoksa tutar girdisi ve doldur düğmesi yok (finans.yaz yetmez)', () => {
    ekranAc(Butce, YAZAR);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Son 6 ay ortalamasıyla doldur' })).toBeNull();
    expect(screen.getByRole('table', { name: /Bütçe ve gerçekleşen/ })).toBeTruthy();
  });

  it('izinli: tutar değişip odak çıkınca butce/belirle ucuna bu aydan gider; değişmeyen gönderilmez', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/butce/belirle': () => json(200, { anahtar: 'x' }) });
    ekranAc(Butce, YONETICI);
    const kira = screen.getByRole('spinbutton', { name: 'Kira bütçesi' });
    fireEvent.blur(kira);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(kira, { target: { value: '9500' } });
    fireEvent.blur(kira);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/finans/butce/belirle', govde: { kategori: 'kira', baslangicAyi: '2026-10-01', aylikTutar: 9500 } },
    ]));
  });

  it('satış hedefi ve son 6 ay ortalaması', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/butce/belirle': () => json(200, { anahtar: 'x' }) });
    ekranAc(Butce, YONETICI);
    const hedef = screen.getByRole('spinbutton', { name: 'Satış hedefi' });
    fireEvent.change(hedef, { target: { value: '60000' } });
    fireEvent.keyDown(hedef, { key: 'Enter' });
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(istekler.find((i) => i.yontem === 'POST')!.govde).toEqual({ kategori: 'satis_hedefi', baslangicAyi: '2026-10-01', aylikTutar: 60000 });
    fireEvent.click(screen.getByRole('button', { name: 'Son 6 ay ortalamasıyla doldur' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(3));
  });

  it('ay seçimi tabloyu değiştirir', () => {
    ekranAc(Butce, OKUR);
    fireEvent.click(within(screen.getByRole('group', { name: 'Ay' })).getByRole('button', { name: 'Eyl 26' }));
    expect(screen.getByRole('heading', { name: 'Bütçe ve gerçekleşen: Eylül 2026' })).toBeTruthy();
    const kira = within(screen.getByRole('table', { name: 'Bütçe ve gerçekleşen: Eylül 2026' })).getByText('Kira').closest('tr')!;
    expect(within(kira).getByText('Plan dahilinde')).toBeTruthy();
  });
});

// Geçmiş beyanlar (1846): biri verilmiş, biri işaretsiz; bugün son günü olan liste dışıdır.
const beyanSunucusu = () => {
  let satirlar: VergiBeyaniSatiri[] = [
    { sonGun: '2026-09-26', kod: 'muhtasar', ad: 'Muhtasar ve Prim Hizmet', donem: 'Ağustos 2026', verildi: true, isaretleyen: 'Deneme Muhasebe', isaretleme: '2026-09-25T10:00:00.000Z' },
    { sonGun: '2026-09-28', kod: 'kdv', ad: 'KDV beyannamesi', donem: 'Ağustos 2026', verildi: false, isaretleyen: null, isaretleme: null },
    { sonGun: BUGUN, kod: 'kdv-tevkifat', ad: 'KDV tevkifat', donem: 'Eylül 2026', verildi: false, isaretleyen: null, isaretleme: null },
  ];
  return sunucuKur(YAZAN, {
    'GET /finans/vergi-beyanlari': () => json(200, { satirlar }),
    'POST /finans/vergi-beyani/isaretle': (g) => {
      const { sonGun, kod, verildi } = g as Pick<VergiBeyaniSatiri, 'sonGun' | 'kod' | 'verildi'>;
      satirlar = satirlar.map((s) => (s.sonGun === sonGun && s.kod === kod ? { ...s, verildi, isaretleyen: verildi ? 'Deneme Yönetici' : null } : s));
      return json(200, { tamam: true });
    },
  });
};

describe('Vergi takvimi', () => {
  it('geçmiş beyanlar: verilmemiş "Kaçırıldı", işaretlenince "Verildi" (finans.beyan-yaz)', async () => {
    const istekler = beyanSunucusu();
    ekranAc(VergiTakvimi, YONETICI);
    const liste = await screen.findByRole('list', { name: 'Geçmiş beyanlar' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
    expect(within(liste).getByText('Kaçırıldı')).toBeTruthy();
    expect(within(liste).getByText(/İşaretleyen: Deneme Muhasebe/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/finans/vergi-beyanlari')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /KDV beyannamesi.*verildi/ }));
    await waitFor(() => expect(within(liste).queryByText('Kaçırıldı')).toBeNull());
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ sonGun: '2026-09-28', kod: 'kdv', verildi: true });
  });

  it('reddedilen: finans.beyan-yaz yoksa işaret kutusu kapalı, istek gitmez', async () => {
    const istekler = beyanSunucusu();
    ekranAc(VergiTakvimi, YAZAR);
    await screen.findByRole('list', { name: 'Geçmiş beyanlar' });
    const kutu = screen.getByRole<HTMLInputElement>('checkbox', { name: /KDV beyannamesi.*verildi/ });
    expect(kutu.disabled).toBe(true);
    fireEvent.click(kutu);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('özet, yaklaşan beyanlar ve KDV dönem tablosu; yazma düğmesi yok', () => {
    beyanSunucusu();
    ekranAc(VergiTakvimi, YONETICI);
    expect(within(screen.getByLabelText('KDV özeti')).getByText('Geçen ay ödenecek KDV')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Yaklaşan beyan ve ödemeler' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('table', { name: 'KDV dönem tablosu' })).getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.queryAllByRole('button').filter((b) => b.textContent !== 'CSV')).toEqual([]);
  });

  it('ayın kaydı yoksa bu ayın tutarları "—" yazar, sıfır uydurmaz', () => {
    beyanSunucusu();
    ekranAc(VergiTakvimi, OKUR, finansiKur(ornekHamVeri(), '2030-01-15'));
    const ozet = screen.getByLabelText('KDV özeti');
    expect(within(ozet).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(within(ozet).queryByText(/^₺0$/)).toBeNull();
  });
});
