import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ayEkle, bugun } from '../kurallar.ts';
import { kayitYazmalari, kmAc, MUAYENECI, MUHENDIS, OKUYAN, YONETICI } from '../test-ortak.tsx';

// K4 ekranları: görünüm ve yetkiye göre gizleme (229 a, 260 a, 261 a). Veri uydurmadır.
// jsdom tuval çizmez; grafik kurulmaz, ekranın kendisi sınanır.
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

const BUGUN = bugun();
const TED = { _id: 's1', kod: 'TED-001', ad: 'Deneme Tedarik', kaliteSkor: 90, teslimatSkor: 80, onay: 'Onaylı' };
const CIHAZ = { _id: 'd1', kod: 'CHZ-001', ad: 'Deneme Kumpas', sonKal: ayEkle(BUGUN, -13), periyot: 12, gecmis: [{ tarih: ayEkle(BUGUN, -13), sonuc: 'Uygun', sertifika: 'S-1' }] };
const BELGE = { _id: 'b1', ad: 'sertifika.pdf', tur: 'Malzeme sertifikası', mime: 'application/pdf', assetId: 'fabc', tarih: BUGUN, bagli: { col: 'sup', id: 's1', no: 'TED-001' } };

describe('Ölçüm cihazları', () => {
  it('salt okunur: düzenleme yok, geçmiş açılır, Kalibrasyon sayfasına gider', async () => {
    kmAc('cihazlar', YONETICI, { dev: [CIHAZ] });
    expect(await screen.findByText('CHZ-001')).toBeTruthy();
    expect(screen.getAllByText('Süresi doldu').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Düzenle|Sil|Cihaz ekle/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Geçmiş/ }));
    const p = await screen.findByRole('dialog');
    expect(within(p).getByText('S-1')).toBeTruthy();
    fireEvent.click(within(p).getAllByRole('button').at(0)!);
    fireEvent.click(screen.getByText('CHZ-001'));
    expect(await screen.findByText('eski ekran')).toBeTruthy();
  });
});

describe('Tedarikçiler', () => {
  it('yönetici ekler, düzenler ve siler', async () => {
    const { yazmalar } = kmAc('tedarikciler', YONETICI, { sup: [TED] });
    expect(await screen.findByText('TED-001')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tedarikçi ekle/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Sil$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(yazmalar.some((y) => y.yol === '/kalite-merkezi/kayitlar/sup/s1/sil')).toBe(true));
  });

  it('mühendis yazar ama silemez; muayeneci ve okuyan yalnız görür', async () => {
    kmAc('tedarikciler', MUHENDIS, { sup: [TED] });
    expect(await screen.findByRole('button', { name: /Düzenle/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Sil$/ })).toBeNull();
    cleanup();
    for (const k of [MUAYENECI, OKUYAN]) {
      kmAc('tedarikciler', k, { sup: [TED] });
      await screen.findByText('TED-001');
      expect(screen.queryByRole('button', { name: /Tedarikçi ekle|Düzenle|^Sil$/ })).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('yeni tedarikçi formu kaydeder', async () => {
    const { yazmalar } = kmAc('tedarikciler', MUHENDIS, {});
    fireEvent.click(await screen.findByRole('button', { name: /Tedarikçi ekle/ }));
    fireEvent.change(await screen.findByLabelText(/Firma adı/), { target: { value: 'Deneme Yeni' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'sup')).toHaveLength(1));
    expect(kayitYazmalari(yazmalar, 'sup')[0]?.govde).toMatchObject({ govde: { kod: 'TED-001', ad: 'Deneme Yeni' } });
  });
});

describe('Belgeler', () => {
  it('yazan yükler; okuyan yükleyemez', async () => {
    kmAc('belgeler', MUAYENECI, { belge: [BELGE], sup: [TED] });
    expect((await screen.findAllByText('sertifika.pdf')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Belge yükle/ })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    kmAc('belgeler', OKUYAN, { belge: [BELGE], sup: [TED] });
    await screen.findAllByText('sertifika.pdf');
    expect(screen.queryByRole('button', { name: /Belge yükle/ })).toBeNull();
  });

  it('belge silme mühendiste var, muayenecide yok (260 a)', async () => {
    kmAc('belgeler', MUHENDIS, { belge: [BELGE], sup: [TED] });
    fireEvent.click((await screen.findAllByText('sertifika.pdf'))[0]!);
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: /Sil/ })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    kmAc('belgeler', MUAYENECI, { belge: [BELGE], sup: [TED] });
    fireEvent.click((await screen.findAllByText('sertifika.pdf'))[0]!);
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: /Sil/ })).toBeNull();
  });
});

describe('Kalite göstergeleri', () => {
  it('göstergeleri çizer; okuyana kayıt düğmesi çıkmaz', async () => {
    kmAc('gostergeler', OKUYAN, { ncr: [{ _id: 'n', tarih: BUGUN, durum: 'Açık', ciddiyet: 'Kritik', hataTipi: 'Boyutsal' }] });
    // Terim işaretlenince başlık metni bölünür; metin bütün olarak aranır.
    expect(await screen.findByText((_, el) => !!el?.matches('.tc-km4-kpi-baslik') && el.textContent === 'İlk geçiş oranı')).toBeTruthy();
    expect(screen.getByText('Açık uygunsuzluk')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Muayene kaydet/ })).toBeNull();
  });

  it('yazana Muayene kaydet muayene ekranına gider', async () => {
    kmAc('gostergeler', MUAYENECI, {});
    fireEvent.click(await screen.findByRole('button', { name: /Muayene kaydet/ }));
    expect(await screen.findByRole('tab', { name: /Muayeneler/, selected: true })).toBeTruthy();
  });
});

describe('Değişiklik izi', () => {
  it('kişiye göre süzer', async () => {
    kmAc('degisiklik-izi', YONETICI, { iz: [
      { _id: 'i1', t: `${BUGUN}T08:00:00Z`, kim: 'Deneme A', islem: 'oluşturma', col: 'ncr', no: 'NCR-1' },
      { _id: 'i2', t: `${BUGUN}T09:00:00Z`, kim: 'Deneme B', islem: 'silme', col: 'sup', no: 'TED-9' },
    ] });
    expect(await screen.findByText('2 iz')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kişi'), { target: { value: 'Deneme B' } });
    expect(screen.getByText('1 iz')).toBeTruthy();
    expect(screen.queryByText('NCR-1')).toBeNull();
  });
});

describe('Arşiv', () => {
  const ESKI = { _id: 'n1', no: 'NCR-1', durum: 'Kapalı', tarih: ayEkle(BUGUN, -30) };
  it('yönetici arşive alır', async () => {
    const { yazmalar } = kmAc('arsiv', YONETICI, { ncr: [ESKI] });
    fireEvent.click(await screen.findByRole('button', { name: '1 kaydı arşive al' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Arşivle' }));
    await waitFor(() => expect(kayitYazmalari(yazmalar, 'ncr')[0]?.govde).toMatchObject({ govde: { arsiv: true } }));
  });

  it('genel anahtar arşivlenmiş kaydı listelerde gösterir', async () => {
    kmAc('arsiv', MUHENDIS, { belge: [{ ...BELGE, arsiv: true }], sup: [TED] });
    fireEvent.click(await screen.findByLabelText('Listelerde arşivlenmiş kayıtları göster'));
    fireEvent.click(screen.getByRole('tab', { name: /Kaynaklar/ }));
    fireEvent.click(await screen.findByRole('tab', { name: /Belgeler/ }));
    expect((await screen.findAllByText('sertifika.pdf')).length).toBeGreaterThan(0);
  });

  it('mühendise arşiv düğmesi çıkmaz', async () => {
    kmAc('arsiv', MUHENDIS, { ncr: [ESKI] });
    await screen.findByText('Arşivlenebilecek kayıtlar');
    expect(screen.queryByRole('button', { name: /arşive al/ })).toBeNull();
  });
});

describe('Ayarlar ve yedek', () => {
  it('yönetici ayarı kaydeder ve geri yükleyebilir', async () => {
    const { yazmalar } = kmAc('ayarlar', YONETICI, { settings: [{ _id: 'genel', firma: 'Deneme Firma' }] });
    expect(await screen.findByDisplayValue('Deneme Firma')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yedekten geri yükle/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Adres/), { target: { value: 'Deneme adres' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(yazmalar.some((y) => y.yol === '/kalite-merkezi/kayitlar/settings/genel/yaz')).toBe(true));
    expect(yazmalar.find((y) => y.yol.endsWith('settings/genel/yaz'))?.govde).toMatchObject({ govde: { firma: 'Deneme Firma', adres: 'Deneme adres' } });
  });

  it('mühendise ayar penceresi açılmaz', async () => {
    kmAc('ayarlar', MUHENDIS, { settings: [{ _id: 'genel', firma: 'Deneme Firma' }] });
    expect(await screen.findByText(/Bu işlem için yetkiniz yok \(ayarları değiştirme\)/)).toBeTruthy();
    expect(screen.queryByDisplayValue('Deneme Firma')).toBeNull();
    expect(screen.queryByRole('button', { name: /Yedek/ })).toBeNull();
  });
});

describe('Kullanıcılar', () => {
  it('rol tablosunu ve oturumdaki rolü gösterir, kişi eklenmez', async () => {
    kmAc('kullanicilar', MUHENDIS, {});
    expect(await screen.findByText('Rollerin yetkileri')).toBeTruthy();
    expect(screen.getByText('Kalite mühendisi', { selector: 'b' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kullanıcı ekle/ })).toBeNull();
  });
});
