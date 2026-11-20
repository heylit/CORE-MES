import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AlternatifTanimlariCevabi, GrupSinirlariCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { OKUYAN, YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';
import { sinirMetni } from './GrupSinirlari.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3463-1b: İkame ve alternatifler sayfasında grup sınırları sekmesi ve sınırla ezilen niteliğin işareti (örnek veri test-ortak'tan).
const ADRES = '/malzemeler/alternatifler';
const TANIMLAR: AlternatifTanimlariCevabi = { kurallar: [], kaliteMuadilleri: [], durumMuadilleri: [] };
const SINIRLAR: GrupSinirlariCevabi = {
  siniri: [
    { id: 4, kapsamTuru: 'kalite', kapsam: 'C45', nitelik: 'd', degerler: null, alt: 50, ust: 56, surum: 2 },
    { id: 5, kapsamTuru: 'sinif', kapsam: 'metal/celik', nitelik: 'kalite', degerler: [{ deger: 'C45', tur: 'tam' }, { deger: '42CrMo4', tur: 'ust' }], alt: null, ust: null, surum: 1 },
  ],
  kapsamlar: [
    { kapsamTuru: 'kalite', kapsam: 'C45', kart: 7 }, { kapsamTuru: 'sinif', kapsam: 'metal/celik', kart: 12 },
    { kapsamTuru: 'sinif', kapsam: 'metal/pirinc', kart: 0 },
  ],
};
const ZARF: KartZarfiCevabi = {
  kart: { no: 1, kod: 'HM-MET-C45-0001', ad: 'Örnek çubuk C45 Ø50', aile: 'metal', sinif: 'celik' },
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: 'C45', acik: true, secenekler: [{ deger: '42CrMo4', tur: 'ust', notu: null }], kaynak: { kapsamTuru: 'sinif', kapsam: 'metal/celik' }, sinir: true },
    durum: { istenen: null, acik: true, secenekler: [], kaynak: null, sinir: false },
    form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 56, sinirKaynak: { kapsamTuru: 'kalite', kapsam: 'C45' } }],
    pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
    boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: 2500, enCok: 3500, sinirKaynak: { kapsamTuru: 'kart', kapsam: '1' } },
    yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
  kartlar: [],
};
const yollar = (ek = {}) => ({
  'GET /malzeme-alternatifleri': () => json(200, TANIMLAR),
  'GET /malzeme-alternatifleri/siniri': () => json(200, SINIRLAR),
  'GET /malzeme-alternatifleri/zarf/1': () => json(200, ZARF),
  ...ek,
});

describe('Grup sınırları (3463-1b)', () => {
  test('sınır metni: liste türüyle, aralık mm', () => {
    expect(sinirMetni(SINIRLAR.siniri[1]!)).toBe('C45 (tam muadil), 42CrMo4 (üst muadil)');
    expect(sinirMetni({ degerler: null, alt: null, ust: 3.5 })).toBe('… – 3,5 mm');
  });

  test('okuyan grup sınırlarını görür, ekleyemez; zarfta sınırla ezilen nitelik kaynağıyla işaretli', async () => {
    sunucuKur(OKUYAN, yollar());
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Grup sınırları/ }));
    expect(await screen.findByText('50 – 56 mm')).toBeTruthy();
    expect(screen.getByText('metal/celik')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sınır ekle' })).toBeNull();
    fireEvent.click(screen.getByText('50 – 56 mm'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Kart zarfı/ }));
    fireEvent.click(await screen.findByRole('button', { name: /HM-MET-C45-0001/ }));
    const ayrinti = screen.getByRole('region', { name: 'Kartın zarfı' });
    expect(await within(ayrinti).findByText(/Sınıf sınırı: metal\/celik/)).toBeTruthy();
    expect(within(ayrinti).getByText(/Kalite sınırı: C45/)).toBeTruthy();
    expect(within(ayrinti).getByText(/Kartın sınırı/)).toBeTruthy();
    expect(within(ayrinti).getByText('d 50 – 56 mm')).toBeTruthy();
    expect(within(ayrinti).getByText('2.500 – 3.500 mm')).toBeTruthy();
    expect(within(ayrinti).getAllByText('Seçilen sınır')).toHaveLength(3);
  });

  test('tanım yazan sınıfı listeden seçer, etkilenen kart sayısını görür; kaldırma onayla ve sürümüyle', async () => {
    const istekler = sunucuKur(YONETICI, yollar({
      'POST /malzeme-alternatifleri/siniri/kaydet': () => json(200, { tamam: true }),
      'POST /malzeme-alternatifleri/siniri/4/kaldir': () => json(200, { tamam: true }),
    }));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Grup sınırları/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sınır ekle' }));
    const pencere = await screen.findByRole('dialog');
    const yer = within(pencere).getByLabelText('Uygulandığı yer');
    expect(within(yer).getAllByRole('option').map((o) => o.textContent)).toEqual(['Seçin', 'metal/celik (12 kart)', 'metal/pirinc (0 kart)']);
    expect((within(pencere).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(yer, { target: { value: 'metal/pirinc' } });
    expect(within(pencere).getByText('Bu kapsamda hammadde kartı yok')).toBeTruthy();
    fireEvent.change(yer, { target: { value: 'metal/celik' } });
    fireEvent.change(within(pencere).getByLabelText('Kapsam'), { target: { value: 'kalite' } });
    expect((within(pencere).getByLabelText('Uygulandığı yer') as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(pencere).getByLabelText('Kapsam'), { target: { value: 'sinif' } });
    fireEvent.change(yer, { target: { value: 'metal/celik' } });
    expect(within(pencere).getByText(/Sınıf metal\/celik: 12 hammadde kartı/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText('Nitelik'), { target: { value: 'd' } });
    fireEvent.change(within(pencere).getByLabelText('En az (mm)'), { target: { value: '49,5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/kaydet')?.govde).toEqual({
      kapsamTuru: 'sinif', kapsam: 'metal/celik', nitelik: 'd', degerler: null, alt: 49.5, ust: null,
    }));
    fireEvent.click(await screen.findByText('50 – 56 mm'));
    const ikinci = await screen.findByRole('dialog');
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Sınırı kaldır' }));
    const onay = await screen.findByRole('dialog', { name: 'Grup sınırı kaldırılsın mı?' });
    expect(within(onay).getByText(/Kalite C45: 7 hammadde kartı bu sınırı kaybeder/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/malzeme-alternatifleri/siniri/4/kaldir')).toBe(false);
    fireEvent.click(within(onay).getByRole('button', { name: 'Sınırı kaldır' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/4/kaldir')?.govde).toEqual({ surum: 2 }));
  });

  test('var olan grup sınırı sürümüyle güncellenir; kapsamı değişmez', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/siniri/kaydet': () => json(200, { tamam: true }) }));
    yeniEkranAc(ADRES);
    fireEvent.click(await screen.findByRole('tab', { name: /Grup sınırları/ }));
    fireEvent.click(await screen.findByText('50 – 56 mm'));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).queryByLabelText('Uygulandığı yer')).toBeNull();
    fireEvent.change(within(pencere).getByLabelText('En çok (mm)'), { target: { value: '58' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/kaydet')?.govde).toEqual({
      kapsamTuru: 'kalite', kapsam: 'C45', nitelik: 'd', degerler: null, alt: 50, ust: 58, surum: 2,
    }));
  });
});

