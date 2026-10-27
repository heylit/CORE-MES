import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { json, sunucuKur, YAZAN } from '../test-ortak.tsx';
import { Butce, NakitPlani, VergiTakvimi } from './index.tsx';
import { finansiKur } from '../veri.ts';
import { ekranAc, finansKur, OKUR, tuvalsiz, YAZAR, YONETICI } from './test-yardim.tsx';

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
  it('reddedilen: finans.yonet yoksa tutar girdisi ve doldur düğmesi yok (finans.yaz yetmez)', () => {
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

describe('Vergi takvimi', () => {
  it('özet, yaklaşan beyanlar ve KDV dönem tablosu; yazma düğmesi yok', () => {
    ekranAc(VergiTakvimi, YONETICI);
    expect(within(screen.getByLabelText('KDV özeti')).getByText('Geçen ay ödenecek KDV')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Yaklaşan beyan ve ödemeler' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('table', { name: 'KDV dönem tablosu' })).getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.queryAllByRole('button').filter((b) => b.textContent !== 'CSV')).toEqual([]);
  });

  it('ayın kaydı yoksa bu ayın tutarları "—" yazar, sıfır uydurmaz', () => {
    ekranAc(VergiTakvimi, OKUR, finansiKur(ornekHamVeri(), '2030-01-15'));
    const ozet = screen.getByLabelText('KDV özeti');
    expect(within(ozet).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(within(ozet).queryByText(/^₺0$/)).toBeNull();
  });
});
