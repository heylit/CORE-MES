import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AlternatifTanimlariCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { OKUYAN, YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';
import { kaynakMetni, payMetni } from './index.tsx';
import { kuralGovdesi } from './pencereler.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ADRES = '/malzemeler/alternatifler';
const TANIMLAR: AlternatifTanimlariCevabi = {
  kurallar: [{
    id: 3, kapsamTuru: 'kart', kapsam: '1', kapsamAdi: 'HM-MET-C45-0001 Örnek çubuk C45 Ø50', kaliteAcik: null, durumAcik: null, sartliAcik: null,
    boyUzunKesilir: null, yuzeySerbest: null, payTuru: null, payDeger: null, payEnAzMm: null, kapali: true, gerekce: 'Örnek müşteri şartı',
    surum: 2, guncelleyen: 'Deneme Yönetici', guncelleme: '2026-11-19T08:00:00.000+03:00',
  }],
  kaliteMuadilleri: [{ kalite: 'C45', muadil: '42CrMo4', tur: 'ust', notu: null, surum: 1 }],
  durumMuadilleri: [{ durum: 'T6', muadil: 'T651', tur: 'ust', notu: null, surum: 1 }],
};
const ZARF: KartZarfiCevabi = {
  kart: { no: 1, kod: 'HM-MET-C45-0001', ad: 'Örnek çubuk C45 Ø50', aile: 'metal', sinif: 'celik' },
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: 'C45', acik: true, secenekler: [{ deger: '42CrMo4', tur: 'ust', notu: null }, { deger: 'C40', tur: 'sartli', notu: null }], kaynak: null, sinir: false },
    durum: { istenen: null, acik: true, secenekler: [], kaynak: null, sinir: false },
    form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }],
    pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: { kapsamTuru: 'sinif', kapsam: 'metal/celik' } },
    boy: { anahtar: 'l', istenen: 1000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null },
    yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
  kartlar: [{
    no: 8, kod: 'HM-MET-42C-0001', ad: 'Örnek çubuk 42CrMo4 Ø52', kalite: '42CrMo4', durum: null, form: 'cubuk', olcu: { d: 52, l: 1000 },
    sonuc: 'icinde', nedenler: ['Üst muadil kalite'],
  }],
};
const yollar = (ek: Record<string, (g: unknown, yol: string) => Response> = {}) => ({
  'GET /malzeme-alternatifleri': () => json(200, TANIMLAR),
  'GET /malzeme-alternatifleri/zarf/1': () => json(200, ZARF),
  ...ek,
});

describe('İkame ve alternatifler (3437)', () => {
  test('kaynak ve pay metni', () => {
    expect(kaynakMetni(null)).toBe('Varsayılan');
    expect(kaynakMetni({ kapsamTuru: 'kart', kapsam: '4' })).toBe('Kartın kuralı');
    expect(kaynakMetni({ kapsamTuru: 'sinif', kapsam: 'metal/celik' })).toBe('Sınıf kuralı: metal/celik');
    expect(payMetni({ tur: 'yuzde', deger: 15, enAzMm: 3 })).toBe('En çok +%15 (en az 3 mm)');
    expect(payMetni({ tur: 'tam', deger: 0, enAzMm: 0 })).toBe('Yalnız aynı ölçü');
  });

  test('form gövdesi: boş alan null (miras), pay türüne göre değer, sürüm yalnız düzenlemede', () => {
    const bos = {
      kapsamTuru: 'aile', kapsam: ' metal ', kaliteAcik: '', durumAcik: 'hayir', sartliAcik: 'evet', boyUzunKesilir: '', yuzeySerbest: '',
      payTuru: 'mm', payDeger: '4,5', payEnAzMm: '3', kapali: '', gerekce: ' ',
    };
    expect(kuralGovdesi(bos, undefined)).toEqual({
      kapsamTuru: 'aile', kapsam: 'metal', kaliteAcik: null, durumAcik: false, sartliAcik: true, boyUzunKesilir: null, yuzeySerbest: null,
      payTuru: 'mm', payDeger: 4.5, payEnAzMm: null, kapali: null, gerekce: null,
    });
    expect(kuralGovdesi({ ...bos, payTuru: 'tam' }, 7)).toMatchObject({ payTuru: 'tam', payDeger: null, payEnAzMm: null, surum: 7 });
  });

  test('okuyan kartın zarfını kaynaklarıyla ve zarfa giren kartları görür; düzenleme düğmesi yok', async () => {
    sunucuKur(OKUYAN, yollar());
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('button', { name: /HM-MET-C45-0001/ }));
    const ayrinti = screen.getByRole('region', { name: 'Kartın zarfı' });
    expect(await within(ayrinti).findByText('Sınıf kuralı: metal/celik')).toBeTruthy();
    expect(within(ayrinti).getByText(/d 50 – 55 mm/)).toBeTruthy();
    expect(within(ayrinti).getByText('42CrMo4 · Üst muadil')).toBeTruthy();
    expect(within(ayrinti).getByText('C40 · Şartlı (kapalı)')).toBeTruthy();
    expect(within(ayrinti).getByText('HM-MET-42C-0001')).toBeTruthy();
    expect(within(ayrinti).getByText('Sınır içinde')).toBeTruthy();
    expect(within(ayrinti).queryByRole('button', { name: 'Bu kartın kuralı' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Kapalı kartlar/ }));
    expect(await screen.findByText('Örnek müşteri şartı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kural ekle' })).toBeNull();
  });

  test('tanım yazan aile kuralı ekler; gövde boş alanları null gönderir', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/kurallar/kaydet': () => json(200, { tamam: true }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Kurallar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kural ekle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Uygulandığı yer'), { target: { value: 'metal' } });
    fireEvent.change(within(pencere).getByLabelText('Ölçü payı'), { target: { value: 'mm' } });
    fireEvent.change(within(pencere).getByLabelText('Pay (mm)'), { target: { value: '5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-alternatifleri/kurallar/kaydet')).toBe(true));
    expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/kurallar/kaydet')?.govde).toEqual({
      kapsamTuru: 'aile', kapsam: 'metal', kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null,
      payTuru: 'mm', payDeger: 5, payEnAzMm: null, kapali: null, gerekce: null,
    });
  });

  test('yeni kart kuralında stok kodu yazılır, sunucuya kart numarası gider; bilinmeyen kod istek göndermez', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/kurallar/kaydet': () => json(200, { tamam: true }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Kurallar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kural ekle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Kapsam'), { target: { value: 'kart' } });
    const yer = within(pencere).getByLabelText('Uygulandığı yer');
    fireEvent.change(yer, { target: { value: 'HM-YOK-00001' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Bu stok koduyla kart yok.')).toBeTruthy();
    fireEvent.change(yer, { target: { value: 'HM-MET-C45-0001' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/kurallar/kaydet')?.govde).toMatchObject({ kapsamTuru: 'kart', kapsam: '1' }));
  });

  test('kural düzenleme ve kaldırma, muadil düzenleme gövdesi kaydın sürümünü taşır', async () => {
    const tamam = () => json(200, { tamam: true });
    const istekler = sunucuKur(YONETICI, yollar({
      'POST /malzeme-alternatifleri/kurallar/kaydet': tamam, 'POST /malzeme-alternatifleri/kurallar/3/kaldir': tamam,
      'POST /malzeme-alternatifleri/kalite-muadilleri/kaydet': tamam,
    }));
    const govde = (yol: string) => istekler.find((i) => i.yol === yol)?.govde;
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Kurallar/ }));
    fireEvent.click(await screen.findByText(TANIMLAR.kurallar[0]!.kapsamAdi!));
    let pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Gerekçe'), { target: { value: 'Örnek yeni gerekçe' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(govde('/malzeme-alternatifleri/kurallar/kaydet')).toMatchObject({ kapsamTuru: 'kart', kapsam: '1', gerekce: 'Örnek yeni gerekçe', surum: 2 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByText(TANIMLAR.kurallar[0]!.kapsamAdi!));
    pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kuralı kaldır' }));
    const onay = (await screen.findAllByRole('dialog')).at(-1)!;
    fireEvent.click(within(onay).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(govde('/malzeme-alternatifleri/kurallar/3/kaldir')).toEqual({ surum: 2 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('tab', { name: /muadilleri/ }));
    fireEvent.click(await screen.findByText('42CrMo4'));
    pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Tür'), { target: { value: 'tam' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(govde('/malzeme-alternatifleri/kalite-muadilleri/kaydet')).toEqual({ kalite: 'C45', muadil: '42CrMo4', tur: 'tam', notu: null, surum: 1 }));
  });

  test('alternatifi kapatırken gerekçe istenir, istek gitmez', async () => {
    const istekler = sunucuKur(YONETICI, yollar());
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Kurallar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kural ekle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Uygulandığı yer'), { target: { value: 'metal' } });
    fireEvent.change(within(pencere).getByLabelText('Alternatif'), { target: { value: 'evet' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Alternatifi kapatırken gerekçe yazın.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  test('kalite muadili onayla kaldırılır; gövde sürümü taşır', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/kalite-muadilleri/kaldir': () => json(200, { tamam: true }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /muadilleri/ }));
    fireEvent.click(screen.getByRole('button', { name: 'C45 42CrMo4 muadilini kaldır' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/kalite-muadilleri/kaldir')?.govde)
      .toEqual({ kalite: 'C45', muadil: '42CrMo4', surum: 1 }));
  });
});
