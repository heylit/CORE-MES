import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimDurumuCevabi, AdimliListeCevabi, HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 5, emirNo: 'UE-0005', urun: { id: 1, kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, oncelik: 2, baslangic: null, teslim: null, durum: 'basladi', arsiv: false,
} as unknown as AdimliListeCevabi['emirler'][number];
const HAZIRLIK: HazirlikCevabi = { maddeler: [], muafiyetler: [], isEmirleri: [] };
const ADIM = {
  isEmriId: 51, opNo: 10, ad: 'Testere kesim', durum: 'tamam', calisma: null, bagimlilik: 'bekleyen', fason: false, hedef: 40, yapilan: 40, yuzde: 100,
  sistemStatusu: 'bitti', nedenler: [], maddeler: [{ madde: 'cnc', hal: 'gerekmez', ham: 'gerekmez' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }], elle: null, onaylar: [], gecmis: [], tedarik: [],
} satisfies AdimDurumuCevabi['adimlar'][number];
const CEVAP = {
  emirId: 5, emirNo: 'UE-0005', urun: { kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, teslim: null, durum: 'basladi', rotaYuzde: 45, hazirlik: HAZIRLIK,
  adimlar: [
    ADIM,
    {
      ...ADIM, isEmriId: 52, opNo: 20, ad: 'CNC freze', durum: 'bekliyor', yapilan: 0, yuzde: 0, sistemStatusu: 'program', nedenler: ['CNC kurulumu (NC) eksik'],
      maddeler: [{ madde: 'cnc', hal: 'eksik', ham: 'eksik' }, { madde: 'malzeme', hal: 'muaf', ham: 'eksik' }],
      tedarik: [
        { asama: 'siparis', fason: false, talepNo: 'ST-2099-002', siparisNo: 'SP-2099-001', termin: '2099-03-01' },
        { asama: 'siparis', fason: false, talepNo: 'ST-2099-005', siparisNo: 'SP-2099-002', termin: '2020-01-02' },
      ],
      elle: { statu: 'siparis', not: 'Tedarikçi bekleniyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' },
      onaylar: [{ madde: 'malzeme', gerekce: null, sistemHali: 'eksik', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }],
      gecmis: [{ olay: 'statu', deger: 'siparis', not: 'Tedarikçi bekleniyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }],
    },
  ],
} satisfies AdimDurumuCevabi;
const yollar = {
  'GET /adimli-emirler': () => json(200, { emirler: [EMIR] }),
  'GET /adimli-emirler/5/adim-durumu': () => json(200, CEVAP),
};
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Adım Durumu (2893, düzen 2955)', () => {
  it('Üretim Emirleri listesi önbellekteyken açılır; iki liste birbirinin cevabını okumaz', async () => {
    const IZLEME = {
      id: 9, emirNo: 'EM-9', durum: 'planli', parcaNo: 'DNM-009', parcaAd: 'Deneme burç', adet: 5, istasyon: null, acan: null,
      acilma: '2026-11-11T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
    };
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, { ...yollar, 'GET /uretim-emirleri': () => json(200, { emirler: [IZLEME] }) });
    const Ikisi = () => <><UretimEmirleri /><AdimDurumu /></>;
    ac([{ yol: '/ikisi', ekran: Ikisi }], '/ikisi');
    const liste = await screen.findByRole('list', { name: 'Açık emirler' });
    expect(within(liste).getByText('Deneme flanş')).toBeTruthy();
    expect(within(liste).queryByText('EM-9')).toBeNull();
    expect(await screen.findByText('EM-9')).toBeTruthy();
  });

  it('açık emirler listede; seçilen emrin adımları rota sırasıyla, sayaç, neden ve yalnız sorunlu maddelerle', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const liste = await screen.findByRole('list', { name: 'Açık emirler' });
    expect(within(liste).getByRole('button', { current: true }).textContent).toContain('UE-0005');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    const satirlar = within(adimlar).getAllByRole('listitem');
    expect(within(satirlar[0]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Hazırlık tamam')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Sipariş bekliyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Elle')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('CNC kurulumu (NC) eksik (+2)')).toBeTruthy();
    expect(within(satirlar[1]!).getByText(/CNC · eksik/)).toBeTruthy();
    expect(within(satirlar[1]!).getByText(/Malzeme · elle onay/)).toBeTruthy();
    const ozet = screen.getByRole('list', { name: 'Adım özeti' });
    expect(within(ozet).getByText('Bitti').closest('li')?.textContent).toContain('1');
    expect(within(ozet).getByText('Bekliyor').closest('li')?.textContent).toContain('1');
    // Başlayabilir, Bitti ile aynı yeşildir; çizgi görünümle ayrılır.
    expect(within(ozet).getByText('Başlayabilir').closest('.tc-rozet')?.className).toContain('tc-rozet-cizgi');
    expect(within(ozet).getByText('Bitti').closest('.tc-rozet')?.className).not.toContain('tc-rozet-cizgi');
  });

  it('adıma tıklayınca yan pencerede nedenler ve tedarik; okuyucu yazma alanı görmez', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    expect(within(pencere).getByText('CNC kurulumu (NC) eksik')).toBeTruthy();
    expect(within(pencere).getByText('Program hazır değil')).toBeTruthy();
    expect(within(pencere).getByText('Sipariş SP-2099-001 bekleniyor · termin 01.03.2099')).toBeTruthy();
    expect(within(pencere).getByText('Sipariş SP-2099-002 bekleniyor · termin 02.01.2020 · gecikti')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Yaz' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Onayı kaldır' })).toBeNull();
  });

  it('matris görünümünde her madde simge hücresi, adı ekran okuyucuda', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[1]!).getByText('Elle onay')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Eksik')).toBeTruthy();
  });

  it('matriste okuyucu hücreye tıklayamaz; yetkisiz notu görür', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(within(tablo).queryByRole('button', { name: /Elle onay/ })).toBeNull();
    expect(screen.getByText(/Hücreyi elle işaretleme müdür ve planlama rollerindedir/)).toBeTruthy();
  });

  it('yetkili eksik hücreye tıklar, gerekçeyle elle onaylar; satır penceresi açılmaz; istek kimlik taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    // Tamam ve gerekmez hücreleri düğme değildir; yalnız onaylanabilen ve onaylı hücre tıklanır.
    expect(within(tablo).queryByRole('button', { name: /OP 10/ })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: 'OP 20 CNC kurulumu: Eksik. Elle onayla' }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC kurulumu' });
    expect(screen.queryByRole('dialog', { name: 'OP 20 · CNC freze' })).toBeNull();
    const dugme = within(pencere).getByRole('button', { name: 'Elle onayla' });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const istek = istekler.find((i) => i.yontem === 'POST');
    expect(istek?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
    expect(istek?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'OP 20 · CNC kurulumu' })).toBeNull());
  });

  it('yetkili elle onaylı hücreye tıklar, kimin onayladığını görür ve onayı kaldırır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onay-kaldir': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    fireEvent.click(within(tablo).getByRole('button', { name: /OP 20 Malzeme .*: Elle onay\. Elle onayı aç/ }));
    const pencere = await screen.findByRole('dialog', { name: /OP 20 · Malzeme/ });
    expect(within(pencere).getByText(/Elle onaylandı: Deneme Müdür/)).toBeTruthy();
    // Sistemin dediği (ham) silinmez: malzeme uyaran maddedir, eksik hâli "Uyarı" görünür.
    expect(within(pencere).getByText('Uyarı')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayı kaldır' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const istek = istekler.find((i) => i.yontem === 'POST');
    expect(istek?.yol.endsWith('/is-emirleri/52/hazirlik-onay-kaldir')).toBe(true);
    expect(istek?.govde).toEqual({ madde: 'malzeme' });
    expect(istek?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aramaya uymayan emir listeden düşer', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu');
    await screen.findByRole('list', { name: 'Açık emirler' });
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'yok-boyle' } });
    expect(await screen.findByText('Aramaya uyan emir yok.')).toBeTruthy();
  });

  it('yetkili durduran maddeyi gerekçeyle onaylar; gerekçesiz düğme kapalı; istek gördüğü hâli taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    fireEvent.change(await screen.findByLabelText('Madde'), { target: { value: 'cnc' } });
    const onayla = screen.getByRole('button', { name: 'Onayla' });
    expect((onayla as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(onayla);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
    // Uç tekrar korumalıdır: kimliksiz istek 400 "Bu komut istek kimliği ister." alır.
    expect(istekler.find((i) => i.yontem === 'POST')?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('yetkili statüyü notla elle yazar; statü seçilmeden Yaz kapalı; elle statüyü kaldır kendi ucuna gider', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/statu-yaz': () => json(200, CEVAP),
      'POST /adimli-emirler/5/is-emirleri/52/statu-kaldir': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    const yaz = within(pencere).getByRole('button', { name: 'Yaz' });
    expect((yaz as HTMLButtonElement).disabled).toBe(true);
    // Pencerede tek birincil eylem: elle statü ikincildir, hazırlık onayı birincil.
    expect(yaz.className).not.toContain('tc-dugme-birincil');
    expect(pencere.querySelectorAll('.tc-dugme-birincil')).toHaveLength(1);
    fireEvent.change(within(pencere).getByLabelText('Statü'), { target: { value: 'malzeme' } });
    fireEvent.change(within(pencere).getByLabelText('Not'), { target: { value: ' Depo teyit etti ' } });
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/statu-yaz'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/statu-yaz'))?.govde).toEqual({ statu: 'malzeme', not: 'Depo teyit etti', sistemStatusu: 'program' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Elle statüyü kaldır' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/statu-kaldir'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/statu-kaldir'))?.govde).toEqual({});
    const kimlikler = istekler.filter((i) => i.yontem === 'POST').map((i) => i.kimlik);
    expect(kimlikler.every((k) => typeof k === 'string' && k.length === 36)).toBe(true);
    expect(new Set(kimlikler).size).toBe(kimlikler.length);
  });

  it('yetkili elle onayı kaldırır; istek yalnız maddeyi taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onay-kaldir': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayı kaldır' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const istek = istekler.find((i) => i.yontem === 'POST');
    expect(istek?.yol.endsWith('/is-emirleri/52/hazirlik-onay-kaldir')).toBe(true);
    expect(istek?.govde).toEqual({ madde: 'malzeme' });
    expect(istek?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('kapalı emirde yetkili de yazma alanı görmez', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'GET /adimli-emirler/5/adim-durumu': () => json(200, { ...CEVAP, durum: 'bitti' }),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    expect(within(pencere).getByText('CNC kurulumu (NC) eksik')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Yaz' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Elle statüyü kaldır' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Onayı kaldır' })).toBeNull();
  });

  it('kapalı emirde yetkilinin matris hücresi de düğme değildir', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'GET /adimli-emirler/5/adim-durumu': () => json(200, { ...CEVAP, durum: 'bitti' }),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(within(tablo).getByText('Eksik')).toBeTruthy();
    expect(within(tablo).queryByRole('button', { name: /Elle onayla|Elle onayı aç/ })).toBeNull();
  });
});
