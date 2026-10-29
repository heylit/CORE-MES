import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { GorevlerimCevabi, ParcaAdaylariCevabi, TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { OKUR, YONETICI, ac, adres, json, sunucuKur, talep } from './test-ortak.tsx';

const GOREVLER: GorevlerimCevabi = {
  gorevler: [
    { tur: 'talep', id: 7, no: 'ECR-0007', baslik: 'Delik pahı', sinif: null, aciliyet: 'acil', adim: 'Talebi sınıflandır', islem: 'degisiklik-yonetimi.siniflandir', yasIsGunu: 3, hedefIsGunu: 1, gecikti: true },
    { tur: 'emir', id: 9, no: 'ECO-0009', baslik: 'Braket kalınlığı', sinif: 'D1', aciliyet: 'normal', adim: 'Geçerliliği belirle ve yayınla', islem: 'degisiklik-yonetimi.yayinla', yasIsGunu: 1, hedefIsGunu: 5, gecikti: false },
  ],
  benimSayisi: 2,
  ekipSayisi: 5,
  hat: [{ asama: 'talep', adet: 2 }, { asama: 'revizyon', adet: 1 }, { asama: 'karar', adet: 3 }],
  kapanan90Gun: 4,
  sonKayitlar: [{
    tur: 'emir', id: 9, kayitNo: 'ECO-0009', kisiId: 1, kisiAdi: 'Deneme Kalite', zaman: '2026-10-21T08:00:00Z', olay: 'yayinlandi',
    imzaAnlami: 'Yayın ve geçerliliği onaylıyorum', aciklama: null, ozet: 'Yayınlandı',
  }],
};
const EKIP: GorevlerimCevabi = {
  ...GOREVLER,
  gorevler: [...GOREVLER.gorevler, {
    tur: 'emir', id: 12, no: 'ECO-0012', baslik: 'Yüzey işlemi', sinif: 'P1', aciliyet: 'normal', adim: 'İlk parça onayı',
    islem: 'degisiklik-yonetimi.fai-onayla', yasIsGunu: 2, hedefIsGunu: 3, gecikti: false,
  }],
};
const ADAYLAR: ParcaAdaylariCevabi = { parcalar: [{ malzemeId: 11, kod: 'DNM-11', ad: 'Deneme flanş' }, { malzemeId: 12, kod: 'DNM-12', ad: null }] };

function kur(kullanici = YONETICI) {
  return sunucuKur(kullanici, (yol, yontem) => {
    if (yol === '/degisiklik-yonetimi/gorevlerim?kapsam=benim') return json(200, GOREVLER);
    if (yol === '/degisiklik-yonetimi/gorevlerim?kapsam=ekip') return json(200, EKIP);
    if (yol.startsWith('/degisiklik-yonetimi/parca-adaylari')) return json(200, ADAYLAR);
    if (yontem === 'POST' && yol === '/degisiklik-yonetimi/talepler/ac') return json(200, talep({ id: 21, no: 'ECR-0021' }) satisfies TalepCevabi);
    if (yol === '/degisiklik-yonetimi/talepler/21') return json(200, talep({ id: 21, no: 'ECR-0021' }));
    return undefined;
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Görevlerim', () => {
  it('kuyruğu en çok gecikenle, hedefi aşanı ve bağlı olmayan sayıları "veri yok" olarak gösterir', async () => {
    kur();
    ac('/degisiklik-yonetimi');
    const tablo = await screen.findByRole('table', { name: 'İş kuyruğu' });
    await within(tablo).findByText('Talebi sınıflandır');
    expect(screen.getByText('Deneme Yönetici. 2 iş sizi bekliyor, 1 tanesi hedef süreyi aştı.')).toBeTruthy();
    expect(within(tablo).getByText('3 / 1 iş günü')).toBeTruthy();
    // Karantina, frozen zone, ilk parça ve uyum sahibi modül bağlanınca gelir; sıfır uydurulmaz.
    expect(screen.getAllByText('Veri yok')).toHaveLength(4);
    const hat = screen.getByRole('list', { name: 'Değişiklik hattı' });
    expect(within(hat).getByText('Disposition').previousElementSibling?.textContent).toBe('3');
    expect(within(hat).getByText('Yayın onayı').previousElementSibling?.textContent).toBe('0');
    expect(within(hat).getByText('Kapandı (90 gün)').previousElementSibling?.textContent).toBe('4');
    expect(within(hat).getAllByRole('listitem')).toHaveLength(7);
    // 1141 c: seri şeridi ve bağlantısı Görevlerim'de yok.
    expect(screen.queryByRole('link', { name: 'Konfigürasyon' })).toBeNull();
  });

  it('"Tüm ekip" ekibin kuyruğunu Sorumlu sütunuyla gösterir ve adrese yazılır', async () => {
    const cagrilar = kur();
    ac('/degisiklik-yonetimi');
    const grup = await screen.findByRole('group', { name: 'Kuyruk kapsamı' });
    const benim = await within(grup).findByRole('button', { name: 'Benim işlerim (2)' });
    expect(benim.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('columnheader', { name: 'Sorumlu' })).toBeNull();
    fireEvent.click(within(grup).getByRole('button', { name: 'Tüm ekip (5)' }));
    await screen.findByText('İlk parça onayı');
    const tablo = screen.getByRole('table', { name: 'İş kuyruğu' });
    expect(adres()).toBe('/degisiklik-yonetimi?kapsam=ekip');
    expect(cagrilar.some((c) => c.yol === '/degisiklik-yonetimi/gorevlerim?kapsam=ekip')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Sorumlu' })).toBeTruthy();
    expect(within(tablo).getByText('Değişiklik ilk parça onayı')).toBeTruthy();
  });

  it('satır ve son kayıt kendi kaydını açar', async () => {
    kur();
    ac('/degisiklik-yonetimi');
    fireEvent.click(await screen.findByText('Geçerliliği belirle ve yayınla'));
    await waitFor(() => { expect(adres()).toBe('/degisiklik-yonetimi/emirler/9'); });
  });

  it('son kayıtta e-imza belirtilir ve kayda bağlanır', async () => {
    kur();
    ac('/degisiklik-yonetimi');
    const bag = await screen.findByRole('link', { name: /Yayınlandı/ });
    expect(bag.getAttribute('href')).toBe('/degisiklik-yonetimi/emirler/9');
    expect(within(bag).getByText(/e-imzalı/)).toBeTruthy();
  });

  it('talep açma işlemi olmayan kişi "Yeni değişiklik talebi" düğmesini görmez', async () => {
    kur(OKUR);
    ac('/degisiklik-yonetimi');
    await screen.findByText('Talebi sınıflandır');
    expect(screen.queryByRole('button', { name: 'Yeni değişiklik talebi' })).toBeNull();
  });
});

describe('Yeni değişiklik talebi', () => {
  it('yalnız süre ya da tezgâh tercihi seçilirse talep gönderilmez', async () => {
    const cagrilar = kur();
    ac('/degisiklik-yonetimi');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni değişiklik talebi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni değişiklik talebi' });
    fireEvent.change(within(pencere).getByLabelText('Ön tip'), { target: { value: 'planlama' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi gönder' }));
    expect(within(pencere).getByRole('alert').textContent).toMatch(/talep gerektirmez/);
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
  });

  it('seçilen parçalarla talebi gönderir ve talep detayına geçer', async () => {
    const cagrilar = kur();
    ac('/degisiklik-yonetimi');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni değişiklik talebi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni değişiklik talebi' });
    fireEvent.change(within(pencere).getByLabelText(/Başlık/), { target: { value: 'Pah ekle' } });
    fireEvent.click(await within(pencere).findByLabelText('DNM-11 · Deneme flanş'));
    fireEvent.change(within(pencere).getByLabelText('Ön tip'), { target: { value: 'P1' } });
    fireEvent.change(within(pencere).getByLabelText('Aciliyet'), { target: { value: 'yuksek' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => { expect(adres()).toBe('/degisiklik-yonetimi/talepler/21'); });
    const gonderim = cagrilar.find((c) => c.yontem === 'POST');
    expect(gonderim?.yol).toBe('/degisiklik-yonetimi/talepler/ac');
    expect(gonderim?.govde).toEqual({ baslik: 'Pah ekle', onSinif: 'P1', aciliyet: 'yuksek', malzemeIdleri: [11], aciklama: '' });
  });
});
