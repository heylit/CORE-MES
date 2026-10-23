import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansAc, json, OKUYAN, sunucuKur, YAZAN, type Istek } from '../test-ortak.tsx';

// Açılışta günlük skor kendiliğinden yazılabilir (F0); testler yalnız ekranın kendi yazmalarına bakar.
const kayitYazmasi = (i: Istek) => i.yontem === 'POST' && i.yol !== '/finans/skorlar/kaydet';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const YONETEN: Kullanici = { ...YAZAN, id: 9, islemler: [...YAZAN.islemler, 'finans.yonet'] as Kullanici['islemler'] };
const ADRES = '/finans/yeni/kayitlar';
// Belge 2 (Hammadde) mahsupla kapanan parça ve açık kalan olarak iki satırdır; açık kalan (gecikmiş) alınır.
const hammaddeSatiri = async () => (await screen.findAllByRole('row', { name: /Hammadde.*gecikti/ }))[0]!;

describe('Kayıtlar', () => {
  it('kayıtlar ay ay listelenir; süzgeç ve arama satırları daraltır', async () => {
    sunucuKur(OKUYAN);
    finansAc(ADRES);
    await hammaddeSatiri();
    expect(screen.getByRole('button', { name: /Excel'e aktar/ })).toBeTruthy();
    const suzgec = screen.getByRole('group', { name: 'Kayıt süzgeci' });
    fireEvent.click(within(suzgec).getByRole('button', { name: /^Satışlar/ }));
    await waitFor(() => expect(screen.queryAllByRole('row', { name: /Hammadde/ })).toHaveLength(0));
    fireEvent.click(within(suzgec).getByRole('button', { name: /^Tümü/ }));
    await hammaddeSatiri();
    fireEvent.change(screen.getByLabelText('Kayıtlarda ara'), { target: { value: 'yok böyle bir şey' } });
    await screen.findByText('Bu filtrede kayıt yok.');
  });

  it('yazma yetkisi olmayan satırı açar ama düzeltemez, iptal göremez', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc(ADRES);
    fireEvent.click(await hammaddeSatiri());
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/Düzeltme yetkiniz yok/)).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: /İptal et/ })).toBeNull();
    expect(istekler.some(kayitYazmasi)).toBe(false);
  });

  it('finans.yaz olan belgeyi düzeltir: tek uca, sürümle; iptal düğmesi yonet ister', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/belgeler/2/duzelt': () => json(200, { belge: ornekHamVeri().belgeler[1] }) });
    finansAc(ADRES);
    fireEvent.click(await hammaddeSatiri());
    const pencere = await screen.findByRole('dialog', { name: 'Kaydı düzenle' });
    expect(within(pencere).queryByRole('button', { name: /İptal et/ })).toBeNull();
    fireEvent.change(within(pencere).getByLabelText('Açıklama'), { target: { value: 'Duzeltilen not' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Değişiklikleri kaydet' }));
    await waitFor(() => expect(istekler.filter(kayitYazmasi)).toHaveLength(1));
    const yazma = istekler.find(kayitYazmasi)!;
    expect(yazma.yol).toBe('/finans/belgeler/2/duzelt');
    expect(yazma.govde).toMatchObject({ aciklama: 'Duzeltilen not', firmaId: 2, tutar: 1000, surum: 1 });
  });

  it('finans.yonet olan belgeyi onayla iptal eder', async () => {
    const istekler = sunucuKur(YONETEN, { 'POST /finans/belgeler/2/iptal': () => json(200, { belge: ornekHamVeri().belgeler[1] }) });
    finansAc(ADRES);
    fireEvent.click(await hammaddeSatiri());
    const pencere = await screen.findByRole('dialog', { name: 'Kaydı düzenle' });
    fireEvent.click(within(pencere).getByRole('button', { name: /İptal et/ }));
    const onay = await screen.findByRole('dialog', { name: /iptal edilsin mi/ });
    expect(istekler.some(kayitYazmasi)).toBe(false);
    fireEvent.click(within(onay).getByRole('button', { name: 'İptali onayla' }));
    await waitFor(() => expect(istekler.find(kayitYazmasi)?.yol).toBe('/finans/belgeler/2/iptal'));
    expect(istekler.find(kayitYazmasi)!.govde).toEqual({ surum: 1 });
  });

  it('cari adı firma kartına gider', async () => {
    const f = { ...ornekHamVeri().firmalar[1]!, ulkeKodu: 'TR', vergiDairesi: null, paraBirimi: 'TRY', vadeGunu: null, adres: null, ilce: null, postaKodu: null,
      enlem: null, boylam: null, telefon: null, ePosta: null, logoKayitNo: null, logoGonderimDurumu: null, olusturma: '2026-09-01T09:00:00.000Z', guncelleme: null, surum: 1 };
    sunucuKur(OKUYAN, { 'GET /musteri-tedarikci/firmalar/2': () => json(200, { firma: f, adresler: [] }) });
    finansAc(ADRES);
    const satir = await hammaddeSatiri();
    fireEvent.click(within(satir).getByRole('link', { name: 'Deneme Tedarik' }));
    await screen.findByRole('heading', { name: 'Deneme Tedarik' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
