import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { HazirlikListesi, satirDurur, uyariSayisi } from './HazirlikListesi.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Emir ayrıntısındaki hazırlık matrisi (2060 a). Veriler uydurmadır.
const MUDUR: Kullanici = { id: 5, ad: 'Deneme Mudur', islemler: ['sayfa.uretim-emirleri', 'uretim-emirleri.hazirlik-muaf', 'sayfa.cnc-kurulum'] };
const cevap = (cnc20: 'eksik' | 'muaf' | 'tamam', ek: Partial<HazirlikCevabi> = {}): HazirlikCevabi => ({
  maddeler: [
    { madde: 'cnc', durum: cnc20 === 'eksik' ? 'eksik' : cnc20, muafTutulur: true, isEmriDuzeyi: true },
    { madde: 'cizim', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'rota', durum: 'bilinmiyor', muafTutulur: false, isEmriDuzeyi: false },
  ],
  muafiyetler: [],
  isEmirleri: [
    { isEmriId: 11, opNo: 10, ad: 'Torna', bitti: true, maddeler: [{ madde: 'cnc', durum: 'tamam' }] },
    { isEmriId: 12, opNo: 20, ad: 'Freze', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc20 }] },
    { isEmriId: 13, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [{ madde: 'cnc', durum: 'gerekmez' }] },
  ],
  ...ek,
});
const ekran = (durum = 'basladi') => [{ yol: '/e/:id', ekran: () => <HazirlikListesi emir={{ id: 3, malzemeNo: 501, durum }} /> }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Emir hazırlık matrisi', () => {
  it('satırlar iş emirleri, sütunlar maddeler; emir geneli madde tek hücredir, eksik madde satırı durdurur', async () => {
    sunucuKur(OKUYUCU, { 'GET /adimli-emirler/3/hazirlik': () => json(200, cevap('eksik')) });
    ac(ekran(), '/e/3');
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(within(tablo).getAllByRole('row')).toHaveLength(4);
    expect(within(tablo).getAllByRole('button', { name: /^Çizim revizyonu: / })).toHaveLength(1);
    expect(within(tablo).getAllByRole('button', { name: /^CNC kurulumu, OP / })).toHaveLength(3);
    expect(within(tablo).getByRole('button', { name: 'CNC kurulumu, OP 20: Eksik' })).toBeTruthy();
    expect(within(tablo).getAllByText('Durur')).toHaveLength(2);
    expect(within(tablo).getByText('Bitti')).toBeTruthy();
    expect(screen.getByText('2/2 iş emri durur')).toBeTruthy();
  });

  it('hücre ayrıntısı muaf tutulamayan maddede muafiyet açmaz; okuyucu muaf tutamaz', async () => {
    sunucuKur(OKUYUCU, { 'GET /adimli-emirler/3/hazirlik': () => json(200, cevap('eksik')) });
    ac(ekran(), '/e/3');
    fireEvent.click(await screen.findByRole('button', { name: 'Çizim revizyonu: Eksik' }));
    expect(screen.getByText('Bu madde muaf tutulamaz.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'CNC kurulumu, OP 20: Eksik' }));
    expect(screen.queryByRole('button', { name: 'Gerekçeyle muaf tut' })).toBeNull();
    expect(screen.queryByRole('button', { name: "CNC Kurulum'da aç" })).toBeNull();
  });

  it('müdür iş emri düzeyindeki eksik maddeyi gerekçeyle muaf tutar; gerekçesiz gönderilmez', async () => {
    let hal: 'eksik' | 'muaf' = 'eksik';
    const istekler = sunucuKur(MUDUR, {
      'GET /adimli-emirler/3/hazirlik': () => json(200, cevap(hal)),
      'POST /adimli-emirler/3/hazirlik-muafiyeti': () => { hal = 'muaf'; return json(200, cevap('muaf')); },
    });
    ac(ekran(), '/e/3');
    fireEvent.click(await screen.findByRole('button', { name: 'CNC kurulumu, OP 20: Eksik' }));
    expect(screen.getByRole('button', { name: "CNC Kurulum'da aç" })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerekçeyle muaf tut' }));
    const pencere = await screen.findByRole('dialog');
    const kaydet = within(pencere).getByRole('button', { name: 'Muaf tut' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Program tezgahta denendi' } });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'cnc', isEmriId: 12, gerekce: 'Program tezgahta denendi' }); });
    expect(await screen.findByRole('button', { name: 'CNC kurulumu, OP 20: Muaf' })).toBeTruthy();
  });

  it('bitmiş emirde müdüre de muafiyet açılmaz; iş emri düzeyi olmayan veride satır emir geneline bakar', async () => {
    sunucuKur(MUDUR, { 'GET /adimli-emirler/3/hazirlik': () => json(200, cevap('eksik')) });
    ac(ekran('bitti'), '/e/3');
    fireEvent.click(await screen.findByRole('button', { name: 'CNC kurulumu, OP 20: Eksik' }));
    expect(screen.queryByRole('button', { name: 'Gerekçeyle muaf tut' })).toBeNull();
    const v = cevap('tamam');
    expect(satirDurur(v, v.isEmirleri[1]!)).toBe(true);
    expect(satirDurur({ ...v, maddeler: v.maddeler.map((m) => ({ ...m, durum: m.madde === 'cizim' ? 'tamam' : m.durum })) }, v.isEmirleri[1]!)).toBe(false);
  });

  // 2146-1 a: uyaran madde (rota, malzeme, takım ömrü, makine) eksikken satır durmaz; hücre "Uyarı" der, sahibine bağlantı verir.
  it('uyaran maddenin eksiği satırı durdurmaz, Uyarı görünür ve sahibine bağlantı verir; muafiyet açılmaz', async () => {
    const uyarili = cevap('tamam', {
      maddeler: [
        { madde: 'cnc', durum: 'tamam', muafTutulur: true, isEmriDuzeyi: true },
        { madde: 'cizim', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: false },
        { madde: 'rota', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: false },
        { madde: 'makine', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true },
      ],
      isEmirleri: [
        { isEmriId: 12, opNo: 20, ad: 'Freze', bitti: false, maddeler: [{ madde: 'cnc', durum: 'tamam' }, { madde: 'makine', durum: 'eksik' }] },
        { isEmriId: 13, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [{ madde: 'cnc', durum: 'tamam' }, { madde: 'makine', durum: 'tamam' }] },
      ],
    });
    expect(uyarili.isEmirleri.map((i) => satirDurur(uyarili, i))).toEqual([false, false]);
    expect(uyariSayisi(uyarili)).toBe(2);
    sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'sayfa.istasyonlar'] }, { 'GET /adimli-emirler/3/hazirlik': () => json(200, uyarili) });
    ac(ekran(), '/e/3');
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(within(tablo).queryByText('Durur')).toBeNull();
    expect(screen.getByText('Hazır, 2 uyarı')).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: 'Rota yürürlükte: Uyarı' })).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Makine durumu, OP 20: Uyarı' }));
    expect(screen.getByText(/başlatmayı durdurmaz/)).toBeTruthy();
    expect(screen.getByRole('button', { name: "İstasyonlar'da aç" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gerekçeyle muaf tut' })).toBeNull();
    expect(screen.queryByText('Bu madde muaf tutulamaz.')).toBeNull();
  });

  it('malzemesiz emirde ya da okuma yetkisi olmayanda bölüm çizilmez, sunucu sorulmaz', async () => {
    const istekler = sunucuKur({ id: 1, ad: 'Deneme', islemler: ['terminal.uret'] }, {});
    ac(ekran(), '/e/3');
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/oturum')).toBe(true); });
    expect(screen.queryByRole('region', { name: 'Hazırlık' })).toBeNull();
    expect(istekler.some((i) => i.yol.includes('/hazirlik'))).toBe(false);
  });
});
