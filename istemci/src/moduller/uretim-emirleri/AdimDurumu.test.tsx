import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimDurumuCevabi, AdimliListeCevabi, HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 5, emirNo: 'UE-0005', urun: { id: 1, kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, oncelik: 2, baslangic: null, teslim: null, durum: 'basladi', arsiv: false,
} as unknown as AdimliListeCevabi['emirler'][number];
const HAZIRLIK: HazirlikCevabi = { maddeler: [], muafiyetler: [], isEmirleri: [] };
const ADIM = {
  isEmriId: 51, opNo: 10, ad: 'Testere kesim', durum: 'tamam', calisma: null, bagimlilik: 'bekleyen', fason: false, hedef: 40, yapilan: 40, yuzde: 100,
  sistemStatusu: 'bitti', nedenler: [], maddeler: [{ madde: 'cnc', hal: 'gerekmez', ham: 'gerekmez' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }], elle: null, onaylar: [], elleEksikler: [], gecmis: [], tedarik: [], liste: [], sablon: null, sablonFarklari: [],
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

const YAZAR = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const, 'uretim-emirleri.adim-durumu-yaz' as const] };
const OKU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] };

describe('Adım Durumu (2893, 3581): tek tablo', () => {
  it('3738: açılış tek matristir (Adımlar); Emir, Matris ve Tablo sekmeleri yok, Hazırlık şablonu ayrı sekmedir', async () => {
    sunucuKur({ ...OKU }, { ...yollar, 'GET /adimli-emirler/adim-matrisi': () => json(200, { yazabilir: false, emirler: [] }) });
    ac(ekran, '/adim-durumu');
    expect(await screen.findByText('Açık emir yok.')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Adımlar', 'Hazırlık şablonu']);
    expect(screen.getByRole('tab', { name: 'Adımlar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('list', { name: 'Açık emirler' })).toBeNull();
  });

  it('eski ?gorunum=emir adresi Adımlar\'a düşer; ?emir= tek emrin ayrıntısını açar, Matris geri götürür', async () => {
    sunucuKur({ ...OKU }, { ...yollar, 'GET /adimli-emirler/adim-matrisi': () => json(200, { yazabilir: false, emirler: [] }) });
    ac(ekran, '/adim-durumu?gorunum=emir&emir=5');
    expect(await screen.findByRole('table')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Matris' }));
    expect(await screen.findByText('Açık emir yok.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('seçilen emrin adımları tek tabloda: durum, hazırlık çipleri, sayaçlar', async () => {
    sunucuKur({ ...OKU }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const tablo = await screen.findByRole('table');
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar).toHaveLength(2);
    expect(within(satirlar[0]!).getByText('Testere kesim')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Sipariş bekliyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByRole('button', { name: /^OP 20 CNC kurulumu.*Eksik/ })).toBeTruthy();
    // 3688: aynı satırda 12 maddelik matris; hücre madde adıyla okunur.
    expect(within(satirlar[1]!).getByRole('group', { name: 'OP 20 hazırlık matrisi' })).toBeTruthy();
    expect(within(satirlar[1]!).getByRole('button', { name: /^OP 20 CNC kurulumu.*Eksik/ })).toBeTruthy();
    const ozet = screen.getByRole('list', { name: 'Adım özeti' });
    expect(within(ozet).getByText('Bitti').closest('li')?.textContent).toContain('1');
  });

  it('3688: matris hücresine basınca ayrıntı paneli o maddeye odaklı açılır', async () => {
    sunucuKur({ ...OKU }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const hucre = await screen.findByRole('button', { name: /^OP 20 CNC kurulumu.*Eksik/ });
    expect(hucre.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(hucre);
    expect(hucre.getAttribute('aria-expanded')).toBe('true');
    const bolge = await screen.findByRole('region', { name: /OP 20 .* ayrıntısı/ });
    // Panel açılınca odak panele geçer (dar ekranda panel satırın altında kalır).
    await waitFor(() => { expect(document.activeElement).toBe(bolge); });
    expect(screen.getByText(/^Matris sırası:/).textContent).toMatch(/CNC/);
  });

  it('çipe basınca alt satır açılır: kaynak, neden, tedarik; okuyucu yazma düğmesi görmez', async () => {
    sunucuKur({ ...OKU }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const cip = await screen.findByRole('button', { name: /OP 20 CNC kurulumu.*Ayrıntıyı aç/ });
    expect(cip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(cip);
    expect(cip.getAttribute('aria-expanded')).toBe('true');
    const bolge = await screen.findByRole('region', { name: /OP 20 CNC freze ayrıntısı/ });
    expect(within(bolge).getByText(/CNC kurulumu \(NC\) eksik/)).toBeTruthy();
    expect(within(bolge).getByText(/Sipariş SP-2099-001 bekleniyor/)).toBeTruthy();
    expect(within(bolge).queryByRole('button', { name: /^Elle değiştir…/ })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Yaz' })).toBeNull();
  });

  it('elle hazır yapmak gerekçe ister; istek gördüğü hâli ve kimliği taşır', async () => {
    const istekler = sunucuKur(YAZAR, { ...yollar, 'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP) });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC kurulumu.*Ayrıntıyı aç/ }));
    const bolge = await screen.findByRole('region', { name: /OP 20 CNC freze ayrıntısı/ });
    fireEvent.click(within(bolge).getAllByRole('button', { name: /^Elle değiştir…/ })[0]!);
    const kutu = await within(bolge).findByRole('group', { name: /elle değiştir/ });
    const dugme = within(kutu).getByRole('button', { name: 'Elle hazır yap' });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(kutu).getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const post = istekler.filter((i) => i.yontem === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0]?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
    expect(post[0]?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('elle hazır maddeyi karşı hâle çevirmek elle değeri kaldırır; Geri al onayı yeniden yazar', async () => {
    const istekler = sunucuKur(YAZAR, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onay-kaldir': () => json(200, CEVAP),
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 Malzeme.*Ayrıntıyı aç/ }));
    const bolge = await screen.findByRole('region', { name: /OP 20 CNC freze ayrıntısı/ });
    const elleDugmeleri = within(bolge).getAllByRole('button', { name: /^Elle değiştir…/ });
    fireEvent.click(elleDugmeleri[0]!);
    const kutu = await within(bolge).findByRole('group', { name: /elle değiştir/ });
    fireEvent.click(within(kutu).getByRole('button', { name: 'Otomatiğe dön' }));
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

  it('elle değiştir: düğme adı maddeyi söyler ve kutuyu bağlar; açılınca gerekçeye odaklanır, Vazgeç düğmeye döner', async () => {
    sunucuKur(YAZAR, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC kurulumu.*Ayrıntıyı aç/ }));
    const bolge = await screen.findByRole('region', { name: /OP 20 CNC freze ayrıntısı/ });
    const dugme = within(bolge).getAllByRole('button', { name: /^Elle değiştir… .+/ })[0]!;
    fireEvent.click(dugme);
    const kutu = await within(bolge).findByRole('group', { name: /elle değiştir$/ });
    expect(dugme.getAttribute('aria-controls')).toBe(kutu.id);
    await waitFor(() => expect(document.activeElement).toBe(within(kutu).getByLabelText('Gerekçe')));
    fireEvent.click(within(kutu).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(document.activeElement).toBe(dugme));
  });

  it('statüyü elle yazma ve otomatiğe dönme alt satırdadır', async () => {
    const istekler = sunucuKur(YAZAR, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/statu-yaz': () => json(200, CEVAP),
      'POST /adimli-emirler/5/is-emirleri/52/statu-kaldir': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    fireEvent.click(await screen.findByRole('button', { name: /OP 20 CNC freze ayrıntısı/ }));
    const durum = await screen.findByRole('region', { name: 'OP 20 durum' });
    fireEvent.click(within(durum).getByRole('button', { name: 'Otomatiğe dön' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(istekler.find((i) => i.yontem === 'POST')?.yol.endsWith('/statu-kaldir')).toBe(true);
    fireEvent.click(within(durum).getByRole('button', { name: 'Statüyü elle yaz' }));
    fireEvent.change(within(durum).getByLabelText('Statüyü elle yaz'), { target: { value: 'program' } });
    fireEvent.click(within(durum).getByRole('button', { name: 'Yaz' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
    expect(istekler.filter((i) => i.yontem === 'POST')[1]?.govde).toMatchObject({ statu: 'program', sistemStatusu: 'program' });
  });

  it('süzgeç sayacı satırları süzer, "Süzgeci kaldır" geri getirir', async () => {
    sunucuKur({ ...OKU }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const tablo = await screen.findByRole('table');
    const ozet = screen.getByRole('list', { name: 'Adım özeti' });
    fireEvent.click(within(ozet).getByText('Bitti').closest('button')!);
    expect(within(tablo).getAllByRole('row').slice(1)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci kaldır' }));
    expect(within(tablo).getAllByRole('row').slice(1)).toHaveLength(2);
  });

  it('adım durumu okunamazsa hata kutusu; emir listesi yüklenirken durum kutusu', async () => {
    sunucuKur({ ...OKU }, { ...yollar, 'GET /adimli-emirler/5/adim-durumu': () => json(500, { hata: 'x' }) });
    ac(ekran, '/adim-durumu?emir=5');
    expect(await screen.findByText(/Adım durumu alınamadı|x/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
