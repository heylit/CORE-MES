import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { finansAc, json, KAPI, sunucuKur, type Istek } from '../test-ortak.tsx';

// Ayarlar finans.yonet ister (menü işlemi); kur ve faiz girişi finans.kur-yaz. Kişiler uydurmadır.
const kisi = (id: number, islemler: string[]): Kullanici => ({ id, ad: `Deneme ${id}`, islemler: islemler as Kullanici['islemler'] });
const YONETICI = kisi(10, [KAPI, 'sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.yonet', 'finans.kur-yaz', 'musteri-tedarikci.oku']);
const KURSUZ = kisi(11, [KAPI, 'sayfa.finans', 'finans.oku', 'finans.yonet']);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T09:00:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const tamam = (govde: unknown = {}) => () => json(200, govde);
// Günlük skor kaydı açılışta kendiliğinden gider (F0); ayar yazmalarından ayrı sayılır.
const postlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol !== '/finans/skorlar/kaydet');
const ac = async (kullanici: Kullanici, sekme: string, yazmalar: Record<string, () => Response> = {}) => {
  const istekler = sunucuKur(kullanici, yazmalar);
  finansAc(`/finans/yeni/ayarlar?sekme=${sekme}`);
  await screen.findByRole('tablist', { name: 'Ayar bölümleri' });
  return istekler;
};

describe('F4 ayarlar', () => {
  it('dokuz sekme prototipteki sırayla; kurulum yapılmışsa Şirket açılır', async () => {
    sunucuKur(YONETICI);
    finansAc('/finans/yeni/ayarlar');
    const serit = await screen.findByRole('tablist', { name: 'Ayar bölümleri' });
    expect(within(serit).getAllByRole('tab').map((s) => s.textContent)).toEqual([
      'Şirket', 'Nakit ve düzenli ödemeler', 'Analiz ayarları', 'Veri aktarımı', 'Hesaplar', 'KDV oranları', 'Kurlar ve faiz', 'Sabit kıymetler', 'İlk kurulum',
    ]);
    expect(within(serit).getByRole('tab', { selected: true }).textContent).toBe('Şirket');
    // Şirket adının esası satın almadır: alan salt okunur.
    expect((screen.getByLabelText('Şirket adı') as HTMLInputElement).readOnly).toBe(true);
  });

  it('analiz ayarı değişince ayar ucuna sürümle tek istek gider', async () => {
    const istekler = await ac(YONETICI, 'danisman', { 'POST /finans/ayar/guncelle': tamam({ ayar: {} }) });
    fireEvent.change(screen.getByLabelText('Nakit risk toleransı'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Batık sayılma süresi'), { target: { value: '365' } });
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1), { timeout: 2000 });
    expect(postlar(istekler)[0]).toMatchObject({
      yol: '/finans/ayar/guncelle', govde: { riskToleransi: 10, batikGunu: 365, sirketAdi: 'Deneme Sirketi', surum: 3, kurulumTamam: true },
    });
  });

  it('düzenli ödeme kaldırılırken sorulur; onayda pasif olarak güncellenir', async () => {
    const istekler = await ac(YONETICI, 'nakit', { 'POST /finans/duzenli-odemeler/1/guncelle': tamam({ duzenli: {} }) });
    expect(screen.getAllByLabelText('Ad').map((x) => (x as HTMLInputElement).value)).toEqual(['Kira']);
    fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
    const onay = await screen.findByRole('dialog', { name: 'Düzenli ödemeyi kaldır' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
    expect(postlar(istekler)[0]!.govde).toMatchObject({ ad: 'Kira', kategori: 'kira', aktif: false, surum: 1 });
  });

  it('yeni hesap formu hesap ekleme ucuna gider', async () => {
    const istekler = await ac(YONETICI, 'hesaplar', { 'POST /finans/hesaplar/ekle': tamam({ hesap: {} }) });
    fireEvent.click(screen.getByRole('button', { name: 'Yeni hesap' }));
    const form = await screen.findByRole('dialog', { name: 'Yeni hesap' });
    fireEvent.change(within(form).getByLabelText(/^Ad/), { target: { value: 'Ikinci banka' } });
    fireEvent.change(within(form).getByLabelText('Açılış bakiyesi'), { target: { value: '250.5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
    expect(postlar(istekler)[0]!.govde).toEqual({
      ad: 'Ikinci banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 250.5, acilisTarihi: '2026-10-20', bankaAdi: null, logoKodu: null,
    });
  });

  it('aynı günün kuru düzeltme ucuna sürümle gider', async () => {
    const istekler = await ac(YONETICI, 'kurlar', { 'POST /finans/kurlar/guncelle': tamam({ anahtar: 'x' }) });
    const form = screen.getByRole('form', { name: 'Kur ekle' });
    fireEvent.change(within(form).getByLabelText(/^Tarih/), { target: { value: '2026-10-01' } });
    fireEvent.change(within(form).getByLabelText(/^Kur/), { target: { value: '36.5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kur ekle' }));
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
    expect(postlar(istekler)[0]).toMatchObject({ yol: '/finans/kurlar/guncelle', govde: { paraBirimi: 'EUR', tarih: '2026-10-01', kur: 36.5, surum: 1 } });
  });

  it('finans.kur-yaz yoksa kur ve faiz girişi gizli; çapraz kur payı yönetimde kalır', async () => {
    await ac(KURSUZ, 'kurlar');
    expect(screen.queryByRole('form', { name: 'Kur ekle' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Faiz ekle' })).toBeNull();
    expect(screen.getByRole('form', { name: 'Çapraz kur payı' })).toBeTruthy();
  });

  it('CSV dosyası önizlenir, onayla toplu aktarım ucuna gider', async () => {
    const istekler = await ac(YONETICI, 'veri', { 'POST /finans/toplu-ice-aktar': tamam({ eklenen: 1 }) });
    const dosya = new File(['Tarih;Tür;Cari;KDV hariç;KDV %\n01.10.2026;gelir;Deneme Musteri · M1;1000;20\nx;gelir;A;1;20'], 'a.csv', { type: 'text/csv' });
    await act(async () => { fireEvent.change(screen.getByLabelText('CSV dosyası seç'), { target: { files: [dosya] } }); });
    expect(await screen.findByText(/1 kayıt okunmaya hazır, 1 satır atlanacak/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1 kaydı içe aktar' }));
    await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
    expect(postlar(istekler)[0]!.govde).toEqual({ satirlar: [{
      belgeTarihi: '2026-10-01', yon: 'gelir', kategori: 'urun_satisi', firma: 'Deneme Musteri · M1', aciklama: 'Satış', tutar: 1000, kdvOrani: 20, vade: '2026-10-01',
    }] });
    expect((await screen.findAllByText('1 belge aktarıldı.')).length).toBeGreaterThan(0);
  });
});
