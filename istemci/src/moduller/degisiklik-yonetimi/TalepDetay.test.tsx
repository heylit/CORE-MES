import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { EtkiAnalizi, TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { OKUR, YONETICI, ac, adres, json, sunucuKur, talep } from './test-ortak.tsx';

function kur(t: TalepCevabi, kullanici: Kullanici = YONETICI) {
  return sunucuKur(kullanici, (yol, yontem) => {
    if (yol === `/degisiklik-yonetimi/talepler/${t.id}` && yontem === 'GET') return json(200, t);
    if (yontem === 'POST' && yol.endsWith('/emir-ac')) return json(200, { id: 40, no: 'ECO-0040' });
    if (yontem === 'POST') return json(200, t);
    return undefined;
  });
}
const postlar = (c: ReturnType<typeof kur>) => c.filter((x) => x.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Talep detayı: sınıflandırma', () => {
  it('sorular cevaba göre açılır, önerilen sınıf seçilir ve gizli dalın cevabı boş gider', async () => {
    const cagrilar = kur(talep());
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    const soru1 = await screen.findByRole('radiogroup', { name: 'Çizim, model veya malzeme şartı değişiyor mu?' });
    expect(screen.queryByRole('radiogroup', { name: /Form, uyum/ })).toBeNull();
    fireEvent.click(within(soru1).getByLabelText('Evet'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Form, uyum/ })).getByLabelText('Hayır'));
    expect(screen.getByText('D2 Tasarım, Class II', { selector: 'strong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sınıflandır' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toEqual({
      yontem: 'POST', yol: '/degisiklik-yonetimi/talepler/7/siniflandir',
      govde: { sinif: 'D2', aciliyet: 'normal', cevaplar: { cizim: 'evet', fff: 'hayir', proses: null, sure: null }, not: '', surum: 4 },
    });
  });

  it('yalnız süre değişikliğinde planlama notu çıkar; sınıf açanın ön tipinde kalır', async () => {
    kur(talep());
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    fireEvent.click(within(await screen.findByRole('radiogroup', { name: /Çizim, model/ })).getByLabelText('Hayır'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /NC programı/ })).getByLabelText('Hayır'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /yalnızca süre/ })).getByLabelText('Evet'));
    expect(screen.getByText(/Bu bir planlama parametresi değişikliği/)).toBeTruthy();
    expect((screen.getByLabelText('Sınıf') as HTMLSelectElement).value).toBe('P1');
  });

  it('önerilenden farklı sınıf gerekçesiz gönderilmez; gerekçeyle gider', async () => {
    const cagrilar = kur(talep());
    ac('/degisiklik-yonetimi/talepler/7');
    fireEvent.click(within(await screen.findByRole('radiogroup', { name: /Çizim, model/ })).getByLabelText('Evet'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Form, uyum/ })).getByLabelText('Evet'));
    fireEvent.change(screen.getByLabelText('Sınıf'), { target: { value: 'D2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sınıflandır' }));
    expect(await screen.findByText(/Önerilen sınıftan farklı sınıf seçildi/)).toBeTruthy();
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: 'Uyum bozulmuyor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sınıflandır' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ govde: { sinif: 'D2', not: 'Uyum bozulmuyor' } });
  });

  it('işlemi olmayan kişi sınıflandırma formunu görmez', async () => {
    kur(talep(), OKUR);
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    await screen.findByText('Sıradaki adım: talebi sınıflandırın');
    expect(screen.queryByRole('button', { name: 'Sınıflandır' })).toBeNull();
  });
});

describe('Talep detayı: CCB ve müşteri onayı', () => {
  it('talebi açan kişi kendi talebine CCB kararı veremez; pencere açılmaz', async () => {
    const cagrilar = kur(talep({ durum: 'ccb_bekliyor', sinif: 'P1', acan: { kisiId: YONETICI.id, kisiAdi: YONETICI.ad, zaman: '2026-10-20T07:30:00Z' } }));
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText(/talebi açan kişi kendi talebine CCB kararı veremez/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(postlar(cagrilar)).toHaveLength(0);
  });

  it('ret gerekçe ister; imzayla gönderilir', async () => {
    const cagrilar = kur(talep({ durum: 'ccb_bekliyor', sinif: 'D1' }));
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    expect(await screen.findByText(/haftalık CCB toplantısında/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
    const pencere = await screen.findByRole('dialog', { name: 'CCB reddi: ECR-0007' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve reddet' }));
    expect(within(pencere).getByText('Ret gerekçesini yazın.')).toBeTruthy();
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Maliyet yüksek' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve reddet' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/degisiklik-yonetimi/talepler/7/ccb', govde: { karar: 'ret', aciklama: 'Maliyet yüksek', surum: 4 } });
  });

  it('reddedilen talep seritte durdu olarak görünür, gerekçe sıradaki adımda yazar', async () => {
    kur(talep({
      durum: 'reddedildi', sinif: 'P1',
      gecmis: [{ olay: 'ccb_ret', kisiId: 2, kisiAdi: 'Örnek Müdür', zaman: '2026-10-21T08:00:00Z', imzaAnlami: 'Reddediyorum', aciklama: 'Maliyet yüksek', ozet: 'CCB reddetti' }],
    }));
    ac('/degisiklik-yonetimi/talepler/7');
    const adim = await screen.findByRole('region', { name: 'Sıradaki adım' });
    expect(within(adim).getByText('Gerekçe: Maliyet yüksek')).toBeTruthy();
    expect(adim.className).toContain('dy-siradaki-durdu');
    const serit = screen.getByRole('list', { name: 'Talep aşamaları' });
    const [, , ccb, musteri] = within(serit).getAllByRole('listitem');
    expect(ccb?.className).toContain('dy-asama-durdu');
    expect(ccb?.getAttribute('aria-current')).toBe('step');
    expect(musteri?.textContent).toContain('Yapılmadı');
  });

  it('açan kişi kararsız talebi gerekçeyle geri çeker; başkası düğmeyi görmez', async () => {
    const acanin = talep({ durum: 'ccb_bekliyor', sinif: 'P1', acan: { kisiId: YONETICI.id, kisiAdi: YONETICI.ad, zaman: '2026-10-20T07:30:00Z' } });
    const cagrilar = kur(acanin);
    ac('/degisiklik-yonetimi/talepler/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Talebi geri çek' }));
    const pencere = await screen.findByRole('dialog', { name: 'Geri çek: ECR-0007' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi geri çek' }));
    expect(within(pencere).getByText('Geri çekme gerekçesini yazın.')).toBeTruthy();
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Yanlış parça' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi geri çek' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/degisiklik-yonetimi/talepler/7/geri-cek', govde: { aciklama: 'Yanlış parça', surum: 4 } });
    cleanup();

    kur(talep({ durum: 'ccb_bekliyor', sinif: 'P1' }));
    ac('/degisiklik-yonetimi/talepler/7');
    await screen.findByText('Sıradaki adım: CCB kararı');
    expect(screen.queryByRole('button', { name: 'Talebi geri çek' })).toBeNull();
  });

  it('geri çekilen talep durdu olarak görünür, kimin ve neden çektiği yazar', async () => {
    kur(talep({
      durum: 'geri_cekildi',
      gecmis: [{ olay: 'geri_cekildi', kisiId: 3, kisiAdi: 'Deneme Açan', zaman: '2026-10-21T08:00:00Z', imzaAnlami: null, aciklama: 'Yanlış parça', ozet: 'Talep geri çekildi' }],
    }));
    ac('/degisiklik-yonetimi/talepler/7');
    const adim = await screen.findByRole('region', { name: 'Sıradaki adım' });
    expect(within(adim).getByText('Talep geri çekildi')).toBeTruthy();
    expect(within(adim).getByText('Deneme Açan: Yanlış parça')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Talebi geri çek' })).toBeNull();
  });

  it('müşteri onayı numarasız açılmaz; numarayla imzalanıp kaydedilir', async () => {
    const cagrilar = kur(talep({ durum: 'musteri_onayi_bekliyor', sinif: 'D1' }));
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Onayı kaydet' }));
    expect(await screen.findByText('Müşteri onay numarasını yazın.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Onay numarası'), { target: { value: 'ONAY-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onayı kaydet' }));
    const pencere = await screen.findByRole('dialog', { name: 'Müşteri onayı: ECR-0007' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve kaydet' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/degisiklik-yonetimi/talepler/7/musteri-onayi', govde: { referans: 'ONAY-1', aciklama: '', surum: 4 } });
  });

  it('onaylanan talepte ECO açılır ve emre geçilir', async () => {
    kur(talep({ durum: 'onaylandi', sinif: 'P1' }));
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    fireEvent.click(await screen.findByRole('button', { name: 'ECO aç' }));
    await waitFor(() => { expect(adres()).toBe('/degisiklik-yonetimi/degisiklikler/emirler/40'); });
  });
});

describe('Talep detayı: etki analizi', () => {
  const ETKI: EtkiAnalizi = {
    zaman: '2026-10-21T09:00:00Z', ustParcalar: null,
    emirler: [{
      uretimEmriId: 5, emirNo: 'UE-0005', malzeme: { malzemeId: 11, kod: 'DNM-11', ad: null }, revizyon: 'B', durum: 'Üretimde', donmus: true,
      seriAraligi: null, adet: 10, onerilenKod: 'kalanlari_gecir', mod: 'onayli', gerekce: 'Biten adım eski rotada kalır',
    }],
    stok: null, sahada: [], ncProgramlari: null, fai: 'kismi', musteriOnayiGerekir: false, mrbAdayi: 0, stoktakiSeri: null,
  };

  it('bağlı olmayan bölüm "bilinmiyor" yazar; müşteri onayı gerekmezse aşama atlanır', async () => {
    kur(talep({ durum: 'ccb_bekliyor', sinif: 'P1', etki: ETKI }));
    ac('/degisiklik-yonetimi/degisiklikler/talepler/7');
    const tablo = await screen.findByRole('table', { name: 'Etkilenen emirler' });
    expect(within(tablo).getByText('Kalanları yeni revizyona geçir')).toBeTruthy();
    expect(within(tablo).getByText('Frozen')).toBeTruthy();
    expect(screen.getAllByText('Bilinmiyor (bağlı değil)')).toHaveLength(2);
    expect(screen.getByText('Değişen karakteristikler için kısmi FAI')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Talep aşamaları' })).getByText(/Gerekmedi/)).toBeTruthy();
  });
});
