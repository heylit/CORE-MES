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
  sistemStatusu: 'bitti', nedenler: [], maddeler: [{ madde: 'cnc', hal: 'gerekmez', ham: 'gerekmez' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }], elle: null, onaylar: [], elleEksikler: [], gecmis: [], tedarik: [], liste: [], sablon: null,
} satisfies AdimDurumuCevabi['adimlar'][number];
const CEVAP = {
  emirId: 5, emirNo: 'UE-0005', urun: { kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, teslim: null, durum: 'basladi', rotaYuzde: 45, hazirlik: HAZIRLIK, yetki: { sablon: false },
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

  it('açık emirler listede; seçilen emrin adımları rota sırasıyla, sayaç, neden, kaynak ve yalnız sorunlu maddelerle', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const liste = await screen.findByRole('list', { name: 'Açık emirler' });
    expect(within(liste).getByRole('button', { current: true }).textContent).toContain('UE-0005');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    const satirlar = within(adimlar).getAllByRole('listitem');
    expect(within(satirlar[0]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Hazırlık tamam')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Kaynak: Terminal kaydı')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Sipariş bekliyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Elle')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Elle: Deneme Müdür')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('CNC kurulumu (NC) eksik (+2)')).toBeTruthy();
    // 3322: madde çipi düğmedir; otomatik eksik düz, elle hazır mor kesik çerçeve ve "E" ile ayrılır.
    const cnc = within(satirlar[1]!).getByRole('button', { name: /OP 20 CNC kurulumu: Eksik, otomatik/ });
    expect(cnc.className).not.toContain('tc-ad-elle');
    const malzeme = within(satirlar[1]!).getByRole('button', { name: /OP 20 Malzeme.*: Hazır, elle, Deneme Müdür/ });
    expect(malzeme.className).toContain('tc-ad-elle');
    expect(malzeme.textContent).toContain('E');
    const ozet = screen.getByRole('list', { name: 'Adım özeti' });
    expect(within(ozet).getByText('Bitti').closest('li')?.textContent).toContain('1');
    expect(within(ozet).getByText('Bekliyor').closest('li')?.textContent).toContain('1');
    // Başlayabilir, Bitti ile aynı yeşildir; çizgi görünümle ayrılır.
    expect(within(ozet).getByText('Başlayabilir').closest('.tc-rozet')?.className).toContain('tc-rozet-cizgi');
    expect(within(ozet).getByText('Bitti').closest('.tc-rozet')?.className).not.toContain('tc-rozet-cizgi');
  });

  it('adıma tıklayınca yan pencerede nedenler, tedarik ve elle değiştirilenler; okuyucu yazma alanı görmez', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    expect(within(pencere).getByText('CNC kurulumu (NC) eksik')).toBeTruthy();
    expect(within(pencere).getByText(/Program hazır değil · kaynak: CNC Kurulum/)).toBeTruthy();
    expect(within(pencere).getByText('Sipariş SP-2099-001 bekleniyor · termin 01.03.2099')).toBeTruthy();
    expect(within(pencere).getByText('Sipariş SP-2099-002 bekleniyor · termin 02.01.2020 · gecikti')).toBeTruthy();
    expect(within(pencere).getByText(/Kaynak \(Stok Merkezi\) şimdi: Uyarı/)).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Yaz' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Otomatiğe dön' })).toBeNull();
  });

  it('matris görünümünde her madde simge hücresi, adı ekran okuyucuda; elle hücre işaretli', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[1]!).getByText('Hazır')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Hazır').closest('button')?.className).toContain('tc-ad-elle');
    expect(within(satirlar[1]!).getByText('Eksik')).toBeTruthy();
  });

  it('matriste okuyucu hücreye tıklayıp kaynağı görür, elle değiştiremez; çift tık komut göndermez', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(screen.getByText(/Maddeyi elle değiştirme müdür ve planlama rollerindedir/)).toBeTruthy();
    const hucre = within(tablo).getByRole('button', { name: /^OP 20 CNC kurulumu: Eksik, otomatik/ });
    fireEvent.click(hucre);
    const cubuk = await screen.findByRole('region', { name: /OP 20 CNC kurulumu: kaynak/ });
    expect(within(cubuk).getByText('Kaynak: CNC Kurulum · Eksik')).toBeTruthy();
    expect(within(cubuk).queryByRole('button', { name: 'Elle hazır yap' })).toBeNull();
    fireEvent.doubleClick(hucre);
    await new Promise((r) => { setTimeout(r, 20); });
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('3322: durduran hücreye çift tık onay ister; elle hazır gerekçe ister; istek gördüğü hâli ve kimliği taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    // Gerekmeyen madde çevrilmez: tık kaynağı açar, çift tık komut göndermez.
    fireEvent.doubleClick(within(tablo).getByRole('button', { name: /^OP 10 CNC kurulumu: Gerekmez/ }));
    fireEvent.doubleClick(within(tablo).getByRole('button', { name: /^OP 20 CNC kurulumu: Eksik, otomatik/ }));
    expect(screen.queryByRole('dialog', { name: 'OP 20 · CNC freze' })).toBeNull();
    const cubuk = await screen.findByRole('region', { name: /OP 20 CNC kurulumu: kaynak/ });
    expect(within(cubuk).getByText(/elle hazır sayılacak/)).toBeTruthy();
    const dugme = within(cubuk).getByRole('button', { name: 'Elle hazır yap' });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(cubuk).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const post = istekler.filter((i) => i.yontem === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0]?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
    expect(post[0]?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('3322: elle hazır uyaran maddeye çift tık: hedef hâl otomatik eksik olduğundan elle değer kaldırılır; Geri al onayı yeniden yazar', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onay-kaldir': () => json(200, CEVAP),
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    fireEvent.doubleClick(within(adimlar).getByRole('button', { name: /OP 20 Malzeme.*: Hazır, elle/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    const ilk = istekler.find((i) => i.yontem === 'POST');
    expect(ilk?.yol.endsWith('/is-emirleri/52/hazirlik-onay-kaldir')).toBe(true);
    expect(ilk?.govde).toEqual({ madde: 'malzeme' });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
    const geri = istekler.filter((i) => i.yontem === 'POST')[1];
    expect(geri?.yol.endsWith('/hazirlik-onayla')).toBe(true);
    expect(geri?.govde).toEqual({ madde: 'malzeme', gerekce: null, sistemHali: 'eksik' });
  });

  it('3322: otomatik tamam uyaran maddeye çift tık elle hazır değil yazar (onaysız); Boşluk hücreyi çevirmez', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/51/hazirlik-elle-eksik': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    const hucre = within(tablo).getByRole('button', { name: /^OP 10 Malzeme.*: Tamam, otomatik/ });
    fireEvent.mouseOver(hucre);
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(hucre, { key: ' ' });
    await new Promise((r) => { setTimeout(r, 20); });
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.doubleClick(hucre);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    const istek = istekler.find((i) => i.yontem === 'POST');
    expect(istek?.yol.endsWith('/is-emirleri/51/hazirlik-elle-eksik')).toBe(true);
    expect(istek?.govde).toEqual({ madde: 'malzeme', gerekce: null, sistemHali: 'tamam' });
  });

  it('3322: elle hazır değil maddede çubuk kimi ve kaynağı yazar; Otomatiğe dön elle değeri kaldırır', async () => {
    const ELLE_EKSIK = {
      ...CEVAP,
      adimlar: [{ ...CEVAP.adimlar[0]!, maddeler: [{ madde: 'cnc', hal: 'eksik', ham: 'tamam' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }],
        elleEksikler: [{ madde: 'cnc', gerekce: 'Program yeniden denenecek', sistemHali: 'tamam', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }] }, CEVAP.adimlar[1]!],
    } satisfies AdimDurumuCevabi;
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, ELLE_EKSIK),
      'POST /adimli-emirler/5/is-emirleri/51/hazirlik-onay-kaldir': () => json(200, ELLE_EKSIK),
      'POST /adimli-emirler/5/is-emirleri/51/hazirlik-elle-eksik': () => json(200, ELLE_EKSIK),
    });
    ac(ekran, '/adim-durumu?emir=5');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    fireEvent.click(within(adimlar).getByRole('button', { name: /OP 10 CNC kurulumu: Hazır değil, elle, Deneme Müdür/ }));
    const cubuk = await screen.findByRole('region', { name: /OP 10 CNC kurulumu: kaynak/ });
    expect(within(cubuk).getByText('Kaynak: CNC Kurulum · Tamam')).toBeTruthy();
    expect(within(cubuk).getByText(/Elle hazır değil: Deneme Müdür .* Program yeniden denenecek/)).toBeTruthy();
    expect(within(cubuk).getByText('Hazır değilse iş başlamaz')).toBeTruthy();
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Otomatiğe dön' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'cnc' });
    // Geri al elle "hazır değil"i eski gerekçesiyle ve dönüşten sonraki hâlle (kaynağın dediği) yeniden yazar.
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
    const geri = istekler.filter((i) => i.yontem === 'POST')[1];
    expect(geri?.yol.endsWith('/is-emirleri/51/hazirlik-elle-eksik')).toBe(true);
    expect(geri?.govde).toEqual({ madde: 'cnc', gerekce: 'Program yeniden denenecek', sistemHali: 'tamam' });
  });

  it('3322: çubukta durduran maddeye "Elle hazır yap" tek tıkta yazmaz, gerekçe alanı açar', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar, 'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    fireEvent.click(within(adimlar).getByRole('button', { name: /OP 20 CNC kurulumu: Eksik, otomatik/ }));
    const cubuk = await screen.findByRole('region', { name: /OP 20 CNC kurulumu: kaynak/ });
    expect(within(cubuk).queryByLabelText('Gerekçe')).toBeNull();
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Elle hazır yap' }));
    expect(within(cubuk).getByLabelText('Gerekçe')).toBeTruthy();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('3322: elle hazır değil, kaynağı bilinmeyen maddeyi elle hazır yapmak ekrandaki hâli (eksik) gönderir', async () => {
    const BILINMEYEN = {
      ...CEVAP,
      adimlar: [{ ...CEVAP.adimlar[0]!, maddeler: [{ madde: 'cnc', hal: 'eksik', ham: 'bilinmiyor' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }],
        elleEksikler: [{ madde: 'cnc', gerekce: null, sistemHali: 'bilinmiyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }] }, CEVAP.adimlar[1]!],
    } satisfies AdimDurumuCevabi;
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, BILINMEYEN),
      'POST /adimli-emirler/5/is-emirleri/51/hazirlik-onayla': () => json(200, BILINMEYEN),
    });
    ac(ekran, '/adim-durumu?emir=5');
    const adimlar = await screen.findByRole('list', { name: 'Adımlar' });
    fireEvent.click(within(adimlar).getByRole('button', { name: /OP 10 CNC kurulumu: Hazır değil, elle/ }));
    const cubuk = await screen.findByRole('region', { name: /OP 10 CNC kurulumu: kaynak/ });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Elle hazır yap' }));
    fireEvent.change(within(cubuk).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(within(cubuk).getAllByRole('button', { name: 'Elle hazır yap' }).at(-1)!);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const istek = istekler.find((i) => i.yontem === 'POST');
    expect(istek?.yol.endsWith('/is-emirleri/51/hazirlik-onayla')).toBe(true);
    expect(istek?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
  });

  it('aramaya uymayan emir listeden düşer', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu');
    await screen.findByRole('list', { name: 'Açık emirler' });
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'yok-boyle' } });
    expect(await screen.findByText('Aramaya uyan emir yok.')).toBeTruthy();
  });

  it('yetkili statüyü notla elle yazar; statü seçilmeden Yaz kapalı; elle statü otomatiğe döner', async () => {
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
    expect(yaz.className).not.toContain('tc-dugme-birincil');
    fireEvent.change(within(pencere).getByLabelText('Statüyü elle yaz'), { target: { value: 'malzeme' } });
    fireEvent.change(within(pencere).getByLabelText('Not'), { target: { value: ' Depo teyit etti ' } });
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/statu-yaz'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/statu-yaz'))?.govde).toEqual({ statu: 'malzeme', not: 'Depo teyit etti', sistemStatusu: 'program' });
    const elle = within(pencere).getByText(/Sistem statüsü değişince düşer/).closest('li')!;
    fireEvent.click(within(elle).getByRole('button', { name: 'Otomatiğe dön' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/statu-kaldir'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/statu-kaldir'))?.govde).toEqual({});
    const kimlikler = istekler.filter((i) => i.yontem === 'POST').map((i) => i.kimlik);
    expect(kimlikler.every((k) => typeof k === 'string' && k.length === 36)).toBe(true);
    expect(new Set(kimlikler).size).toBe(kimlikler.length);
  });

  it('yetkili ayrıntıdan elle onayı otomatiğe döndürür; istek yalnız maddeyi taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onay-kaldir': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze/ }));
    const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
    const satir = within(pencere).getByText(/Kaynak \(Stok Merkezi\)/).closest('li')!;
    fireEvent.click(within(satir).getByRole('button', { name: 'Otomatiğe dön' }));
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
    expect(within(pencere).queryByRole('button', { name: 'Otomatiğe dön' })).toBeNull();
  });

  it('kapalı emirde yetkilinin matris hücresi çevrilmez', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'GET /adimli-emirler/5/adim-durumu': () => json(200, { ...CEVAP, durum: 'bitti' }),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    fireEvent.doubleClick(within(tablo).getByRole('button', { name: /^OP 20 CNC kurulumu: Eksik/ }));
    await new Promise((r) => { setTimeout(r, 20); });
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Elle hazır yap' })).toBeNull();
  });
  describe('3249 b: açılan satırlar, tik, Boşluk, Geri al, madde ekleme', () => {
    const MADDE_A = {
      adimId: 701, ad: 'Bağlama aparatı hazır', aciklama: null, asama: 'on_hazirlik', tamam: false, kisiAdi: null, zaman: null, kaynak: null, kanit: null, ekleyenAdi: null, eklenme: null,
      kontrol: null, olcum: null, secim: null, fotoOzet: null, sinirDisi: null,
    } as const;
    const MADDE_B = {
      ...MADDE_A, adimId: 702, ad: 'Takım ölçüldü', asama: 'hazirlik', tamam: true, kisiAdi: 'Deneme Operatör', zaman: '2026-11-11T07:00:00.000Z', kaynak: 'terminal',
    } as const;
    const LISTELI = { ...CEVAP, adimlar: [CEVAP.adimlar[0]!, { ...CEVAP.adimlar[1]!, liste: [MADDE_A, MADDE_B] }] } satisfies AdimDurumuCevabi;
    const YAZAR: Parameters<typeof sunucuKur>[0] = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] };
    const matrisAc = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
      const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
      fireEvent.click(within(tablo).getByRole('button', { name: 'OP 20 maddeleri' }));
      return tablo;
    };

    it('satır açılır; maddeler aşama ve işaret kaydıyla görünür; tik tıklanınca işaretler, Geri al tersini gönderir', async () => {
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, LISTELI),
        'POST /adimli-emirler/5/is-emirleri/52/liste-isaretle': () => json(200, LISTELI),
      });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      expect(within(tablo).getAllByRole('button', { name: /OP 20 liste 1 \/ 2/ }).length).toBeGreaterThan(0);
      expect(within(tablo).getByText(/Deneme Operatör · .* · terminalden/)).toBeTruthy();
      expect(within(tablo).getByText('Ön hazırlık')).toBeTruthy();
      const kutu = within(tablo).getByRole('checkbox', { name: 'OP 20 Bağlama aparatı hazır' });
      expect((kutu as HTMLInputElement).checked).toBe(false);
      fireEvent.click(kutu);
      await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
      expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ adimId: 701, tamam: true });
      fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
      await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
      const geri = istekler.filter((i) => i.yontem === 'POST')[1];
      expect(geri?.govde).toEqual({ adimId: 701, tamam: false });
      expect(geri?.kimlik).not.toBe(istekler.filter((i) => i.yontem === 'POST')[0]?.kimlik);
    });

    it('Boşluk fare üstündeki maddeyi işaretler ya da kaldırır; yazı alanında Boşluk komut göndermez', async () => {
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, LISTELI),
        'POST /adimli-emirler/5/is-emirleri/52/liste-isaretle': () => json(200, LISTELI),
      });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      const satir = within(tablo).getByRole('checkbox', { name: 'OP 20 Takım ölçüldü' }).closest('tr')!;
      fireEvent.mouseOver(satir);
      fireEvent.keyDown(document.body, { key: ' ' });
      await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
      expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ adimId: 702, tamam: false });
      fireEvent.keyDown(screen.getByLabelText('Ara'), { key: ' ' });
      await new Promise((r) => { setTimeout(r, 20); });
      expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1);
    });

    it('çift tık adımın ayrıntısını açar; ayrıntıda liste tik kutusuyla durur', async () => {
      sunucuKur(YAZAR, { ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, LISTELI) });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      fireEvent.doubleClick(within(tablo).getAllByRole('row')[2]!.querySelector('td')!);
      const pencere = await screen.findByRole('dialog', { name: 'OP 20 · CNC freze' });
      expect(within(within(pencere).getByRole('list', { name: 'Hazırlık listesi' })).getAllByRole('checkbox')).toHaveLength(2);
    });

    it('okuyucu maddeleri görür, tik kutusu kapalı; ekleme düğmesi yok', async () => {
      sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, { ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, LISTELI) });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      expect((within(tablo).getByRole('checkbox', { name: 'OP 20 Bağlama aparatı hazır' }) as HTMLInputElement).disabled).toBe(true);
      expect(within(tablo).queryByRole('button', { name: 'Madde' })).toBeNull();
    });

    it('yetkili kontrol adımı ekler: aşama hazırlık, ad kırpılır, istek kimlik taşır', async () => {
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, LISTELI),
        'POST /adimli-emirler/5/is-emirleri/52/liste-ekle': () => json(200, LISTELI),
      });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      fireEvent.click(within(tablo).getAllByRole('button', { name: 'Kontrol adımı' })[0]!);
      const pencere = await screen.findByRole('dialog', { name: 'OP 20 · Kontrol adımı ekle' });
      const ekle = within(pencere).getByRole('button', { name: 'Ekle' });
      expect((ekle as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(within(pencere).getByLabelText('Kontrol adımı'), { target: { value: '  İlk parça ölçüldü ' } });
      fireEvent.click(ekle);
      await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
      const istek = istekler.find((i) => i.yontem === 'POST');
      expect(istek?.govde).toEqual({ ad: 'İlk parça ölçüldü', asama: 'hazirlik', kontrol: { tur: 'onay' }, sablonaEkle: false });
      expect(istek?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
  describe('3249-2 a: türlü kontrol, kanıt, elle maddeyi kaldır, Şablona da ekle', () => {
    type Madde = AdimDurumuCevabi['adimlar'][number]['liste'][number];
    const TABAN = {
      aciklama: null, asama: 'hazirlik', tamam: false, kisiAdi: null, zaman: null, kaynak: null, kanit: null, ekleyenAdi: null, eklenme: null,
      olcum: null, secim: null, fotoOzet: null, sinirDisi: null,
    } as const;
    const OLCUM: Madde = { ...TABAN, adimId: 801, ad: 'Delik çapı', kontrol: { tur: 'olcum', ad: 'Delik çapı', alt: 12, ust: 12.018, birim: 'mm' } };
    const OLCULMUS: Madde = {
      ...TABAN, adimId: 802, ad: 'Toplam boy', tamam: true, kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z', kaynak: 'adim-durumu',
      kontrol: { tur: 'olcum', ad: 'Toplam boy', alt: 24.95, ust: 25.05, birim: 'mm' }, olcum: 25.07, sinirDisi: true,
    };
    const SECIM: Madde = { ...TABAN, adimId: 803, ad: 'Çapak durumu', kontrol: { tur: 'secim', secenekler: ['Çapaksız', 'Hafif', 'Çapaklı'] } };
    const FOTO: Madde = { ...TABAN, adimId: 804, ad: 'Bağlama fotoğrafı', kontrol: { tur: 'foto', aciklama: 'Ayna görünsün' } };
    const FOTOLU: Madde = { ...TABAN, adimId: 805, ad: 'Ayna temizliği', tamam: true, kontrol: { tur: 'foto', aciklama: null }, fotoOzet: 'a'.repeat(64) };
    // 3494-3 a: Üretim Hazırlık'ın eklediği madde de listededir (elle eklenmiş, kontrolsüz).
    const EK: Madde = { ...TABAN, adimId: 806, ad: 'Özel pabuç alındı', kontrol: null, ekleyenAdi: 'Deneme Hazırlık', eklenme: '2026-11-11T06:00:00.000Z' };
    const EK_TAMAM: Madde = { ...EK, adimId: 807, ad: 'Bağlama aparatı geldi', tamam: true, kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z', kaynak: 'adim-durumu' };
    const turlu = (yetki: AdimDurumuCevabi['yetki']) => ({
      ...CEVAP, yetki,
      adimlar: [CEVAP.adimlar[0]!, { ...CEVAP.adimlar[1]!, liste: [OLCUM, OLCULMUS, SECIM, FOTO, FOTOLU, EK, EK_TAMAM], sablon: { id: 4, kod: 'TOR-HAZ', ad: 'Torna hazırlık' } }],
    }) satisfies AdimDurumuCevabi;
    const YAZAR: Parameters<typeof sunucuKur>[0] = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] };
    const matrisAc = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Matris' }));
      const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
      fireEvent.click(within(tablo).getByRole('button', { name: 'OP 20 maddeleri' }));
      return tablo;
    };
    const postlar = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');

    it('sınır dışı ölçüm simge ve metinle görünür; işaretsiz ölçüm tiki pencere açar, değer virgülle girilir, uyarı verir, kanıtla gider', async () => {
      const V = turlu({ sablon: false });
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, V), 'POST /adimli-emirler/5/is-emirleri/52/liste-isaretle': () => json(200, V),
      });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      expect(within(tablo).getAllByText(/25,07 mm · sınır dışı \(\+0,02\)/).length).toBeGreaterThan(0);
      fireEvent.click(within(tablo).getByRole('checkbox', { name: 'OP 20 Delik çapı' }));
      const pencere = await screen.findByRole('dialog', { name: 'Delik çapı' });
      expect(postlar(istekler)).toHaveLength(0);
      fireEvent.change(within(pencere).getByLabelText('Ölçülen değer (mm)'), { target: { value: '12,024' } });
      expect(within(pencere).getByRole('status').textContent).toContain('Sınır dışı.');
      fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet ve işaretle' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
      expect(postlar(istekler)[0]?.govde).toEqual({ adimId: 801, tamam: true, kanit: { olcum: 12.024 } });
      fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(2));
      expect(postlar(istekler)[1]?.govde).toEqual({ adimId: 801, tamam: false });
    });

    it('kanıtlı işaret kaldırılınca Geri al eski kanıtı yeniden gönderir; seçim düğmesi seçimle işaretler', async () => {
      const V = turlu({ sablon: false });
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, V), 'POST /adimli-emirler/5/is-emirleri/52/liste-isaretle': () => json(200, V),
      });
      ac(ekran, '/adim-durumu?emir=5');
      const tablo = await matrisAc();
      fireEvent.click(within(tablo).getByRole('checkbox', { name: 'OP 20 Toplam boy' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
      expect(postlar(istekler)[0]?.govde).toEqual({ adimId: 802, tamam: false });
      fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(2));
      expect(postlar(istekler)[1]?.govde).toEqual({ adimId: 802, tamam: true, kanit: { olcum: 25.07 } });
      const grup = within(tablo).getAllByRole('radiogroup', { name: 'Çapak durumu' })[0]!;
      fireEvent.click(within(grup).getByRole('radio', { name: 'Hafif' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(3));
      expect(postlar(istekler)[2]?.govde).toEqual({ adimId: 803, tamam: true, kanit: { secim: 'Hafif' } });
      expect(within(tablo).getAllByRole('button', { name: 'Fotoğraf ekle' }).length).toBeGreaterThan(0);
      const resim = within(tablo).getAllByRole('img', { name: 'Ayna temizliği fotoğrafı' })[0] as HTMLImageElement;
      expect(resim.getAttribute('src')).toBe(`/api/adimli-emirler/5/liste-fotografi/805/${'a'.repeat(64)}`);
      expect(within(tablo).getAllByRole('link', { name: 'Görüntüle' }).length).toBeGreaterThan(0);
    });

    it('elle eklenmiş işaretsiz madde sorularak kaldırılır, Geri al sunulmaz; talimat maddesinde, işaretli maddede ve okuyucuda düğme yok', async () => {
      const V = turlu({ sablon: false });
      sunucuKur(OKUYUCU, { ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, V) });
      ac(ekran, '/adim-durumu?emir=5');
      let tablo = await matrisAc();
      expect(within(tablo).getByRole('checkbox', { name: 'OP 20 Özel pabuç alındı' })).toBeTruthy();
      expect(within(tablo).queryByRole('button', { name: /^Kaldır/ })).toBeNull();
      cleanup();
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, V), 'POST /adimli-emirler/5/is-emirleri/52/liste-kaldir': () => json(200, V),
      });
      ac(ekran, '/adim-durumu?emir=5');
      tablo = await matrisAc();
      expect(within(tablo).getAllByRole('button', { name: /^Kaldır: / }).map((d) => d.getAttribute('aria-label'))).toEqual(['Kaldır: Özel pabuç alındı']);
      fireEvent.click(within(tablo).getByRole('button', { name: 'Kaldır: Özel pabuç alındı' }));
      let soru = within(tablo).getByRole('group', { name: 'Özel pabuç alındı kaldırılsın mı?' });
      fireEvent.click(within(soru).getByRole('button', { name: 'Vazgeç' }));
      expect(postlar(istekler)).toHaveLength(0);
      fireEvent.click(within(tablo).getByRole('button', { name: 'Kaldır: Özel pabuç alındı' }));
      soru = within(tablo).getByRole('group', { name: 'Özel pabuç alındı kaldırılsın mı?' });
      fireEvent.click(within(soru).getByRole('button', { name: 'Kaldır' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
      expect(postlar(istekler)[0]?.govde).toEqual({ adimId: 806 });
      expect(postlar(istekler)[0]?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
      expect(await screen.findByText('Kaldırıldı: Özel pabuç alındı')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
    });

    it('kontrol adımı türlü eklenir; Şablona da ekle yalnız talimat yetkisiyle görünür, varsayılan kapalı', async () => {
      const yetkisiz = turlu({ sablon: false });
      sunucuKur(YAZAR, { ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, yetkisiz) });
      ac(ekran, '/adim-durumu?emir=5');
      let tablo = await matrisAc();
      fireEvent.click(within(tablo).getAllByRole('button', { name: 'Kontrol adımı' })[0]!);
      expect(within(await screen.findByRole('dialog', { name: 'OP 20 · Kontrol adımı ekle' })).queryByLabelText('Şablona da ekle')).toBeNull();
      cleanup();
      const V = turlu({ sablon: true });
      const istekler = sunucuKur(YAZAR, {
        ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(200, V), 'POST /adimli-emirler/5/is-emirleri/52/liste-ekle': () => json(200, V),
      });
      ac(ekran, '/adim-durumu?emir=5');
      tablo = await matrisAc();
      fireEvent.click(within(tablo).getAllByRole('button', { name: 'Kontrol adımı' })[0]!);
      const pencere = await screen.findByRole('dialog', { name: 'OP 20 · Kontrol adımı ekle' });
      const sablon = within(pencere).getByLabelText('Şablona da ekle') as HTMLInputElement;
      expect(sablon.checked).toBe(false);
      fireEvent.change(within(pencere).getByLabelText('Kontrol adımı'), { target: { value: 'Delik çapı' } });
      fireEvent.click(within(pencere).getByRole('radio', { name: 'Ölçüm' }));
      fireEvent.change(within(pencere).getByLabelText('Alt sınır'), { target: { value: '12,02' } });
      fireEvent.change(within(pencere).getByLabelText('Üst sınır'), { target: { value: '12' } });
      fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
      expect(within(pencere).getByRole('alert').textContent).toContain('Alt sınır üst sınırdan büyük.');
      expect(postlar(istekler)).toHaveLength(0);
      fireEvent.change(within(pencere).getByLabelText('Alt sınır'), { target: { value: '12' } });
      fireEvent.change(within(pencere).getByLabelText('Üst sınır'), { target: { value: '12,018' } });
      fireEvent.click(sablon);
      fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
      await waitFor(() => expect(postlar(istekler)).toHaveLength(1));
      expect(postlar(istekler)[0]?.govde).toEqual({
        ad: 'Delik çapı', asama: 'hazirlik', kontrol: { tur: 'olcum', ad: 'Delik çapı', alt: 12, ust: 12.018, birim: 'mm' }, sablonaEkle: true,
      });
    });
  });
});
