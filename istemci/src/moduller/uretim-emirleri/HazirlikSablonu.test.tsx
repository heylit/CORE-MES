import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HazirlikMaddeleriCevabi, HazirlikSablonuCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { EmreOzelSablon } from './EmreOzelSablon.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3688: Adım Durumu › Şablon. Adlar uydurmadır (ORN).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const madde = (kod: string, ad: string, sira: number) => ({ kod, ad, kisa: ad, sira, acik: true, sistem: true, durduran: kod === 'cnc', sahip: 'ORN', isEmriDuzeyi: true, surum: 1 });
const MADDELER: HazirlikMaddeleriCevabi = { maddeler: [madde('cnc', 'CNC kurulumu', 1), madde('aparat', 'Aparat', 2)], yazabilir: false };
const sablon = (yazar: boolean, durduranAcabilir = false): HazirlikSablonuCevabi => ({
  yazar, durduranAcabilir,
  turler: [
    { operasyonTipiId: null, ad: 'Varsayılan (türü olmayan adım)', surum: null, kisiAdi: null, an: null, gerekce: null, satirlar: [] },
    { operasyonTipiId: 7, ad: 'ORN freze', surum: 2, kisiAdi: 'ORN Müdür', an: '2026-11-25T08:00:00.000Z', gerekce: 'ilk', satirlar: [
      { madde: 'cnc', gerekli: true, rolId: null, gun: 1, rolAdi: null }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0, rolAdi: null },
    ] },
  ],
});
const kur = (yazar: boolean) => {
  const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] }, {
    'GET /adimli-emirler': () => json(200, { emirler: [] }),
    'GET /hazirlik-maddeleri': () => json(200, MADDELER),
    'GET /hazirlik-sablonu': () => json(200, sablon(yazar)),
    'PUT /hazirlik-sablonu/7': () => json(200, { surum: 3 }),
  });
  ac([{ yol: '/adim-durumu', ekran: AdimDurumu }], '/adim-durumu?gorunum=sablon');
  return istekler;
};

describe('3688 hazırlık şablonu sayfası', () => {
  it('yetkisiz kişi okur, değiştiremez', async () => {
    kur(false);
    expect(await screen.findByText('Şablonu yalnız yetkili kişiler değiştirebilir.')).toBeTruthy();
    expect((await screen.findByRole('checkbox', { name: /CNC kurulumu/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /kaydet|oluştur/i })).toBeNull();
  });

  it('yazar türü seçer, maddeyi değiştirir; kaydet beklenen sürümle PUT yapar', async () => {
    const istekler = kur(true);
    fireEvent.change(await screen.findByLabelText('Operasyon türü'), { target: { value: '7' } });
    const aparat = await screen.findByRole('checkbox', { name: /Aparat/ }) as HTMLInputElement;
    expect(aparat.checked).toBe(false);
    const kaydet = screen.getByRole('button', { name: 'Yeni sürüm kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    expect(screen.getByText('Değişiklik yok.')).toBeTruthy();
    fireEvent.click(aparat);
    expect(within(aparat.closest('li')!).getByText('Gerekli')).toBeTruthy();
    expect((screen.getByLabelText('Operasyon türü') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'PUT' && i.yol === '/hazirlik-sablonu/7')).toBe(true); });
    const put = istekler.find((i) => i.yontem === 'PUT')!.govde as { beklenenSurum: number; satirlar: { madde: string; gerekli: boolean }[] };
    expect(put.beklenenSurum).toBe(2);
    expect(put.satirlar).toEqual([expect.objectContaining({ madde: 'cnc', gerekli: true }), expect.objectContaining({ madde: 'aparat', gerekli: true })]);
  });

  it('başlatmayı durduran madde rozetli ve kilitli: şablonda kapatılamaz', async () => {
    kur(true);
    fireEvent.change(await screen.findByLabelText('Operasyon türü'), { target: { value: '7' } });
    const cnc = await screen.findByRole('checkbox', { name: /CNC kurulumu/ }) as HTMLInputElement;
    expect(within(cnc.closest('li')!).getByText('Başlatmayı durdurur')).toBeTruthy();
    expect(within(cnc.closest('li')!).getByText('Her zaman gerekli')).toBeTruthy();
    expect(cnc.checked).toBe(true);
    expect(cnc.disabled).toBe(true);
  });

  it('3740 müdür: durduran maddenin kutusu açılır, kaldırınca uyarı çıkar ve gerekçe zorunlu olur; PUT gerekçeyle gider', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] }, {
      'GET /adimli-emirler': () => json(200, { emirler: [] }),
      'GET /hazirlik-maddeleri': () => json(200, MADDELER),
      'GET /hazirlik-sablonu': () => json(200, sablon(true, true)),
      'PUT /hazirlik-sablonu/7': () => json(200, { surum: 3 }),
    });
    ac([{ yol: '/adim-durumu', ekran: AdimDurumu }], '/adim-durumu?gorunum=sablon');
    fireEvent.change(await screen.findByLabelText('Operasyon türü'), { target: { value: '7' } });
    const cnc = await screen.findByRole('checkbox', { name: /CNC kurulumu/ }) as HTMLInputElement;
    expect(cnc.disabled).toBe(false);
    expect(screen.queryByText('Bu türdeki adımlar bu madde olmadan başlatılabilir.')).toBeNull();
    fireEvent.click(cnc);
    expect(screen.getByText('Bu türdeki adımlar bu madde olmadan başlatılabilir.')).toBeTruthy();
    const kaydet = screen.getByRole('button', { name: 'Yeni sürüm kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    expect(screen.getByText('Başlatmayı durduran maddeyi kapatmak için gerekçe yazın.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: 'Bu tür programsız çalışır' } });
    expect(kaydet.disabled).toBe(false);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'PUT')).toBe(true); });
    const put = istekler.find((i) => i.yontem === 'PUT')!.govde as { gerekce: string; satirlar: { madde: string; gerekli: boolean }[] };
    expect(put.gerekce).toBe('Bu tür programsız çalışır');
    expect(put.satirlar.find((s) => s.madde === 'cnc')?.gerekli).toBe(false);
  });

  it('3739 yeni madde: yetkisi olanda düğme görünür, form açılır, eklenen madde listede hemen görünür; yetkisizde düğme yok', async () => {
    const eklenmis: HazirlikMaddeleriCevabi = { yazabilir: true, maddeler: [...MADDELER.maddeler, { ...madde('ozel-a', 'Boya onayı', 3), sistem: false, isEmriDuzeyi: true }] };
    let eklendi = false;
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const, 'uretim-emirleri.hazirlik-ayar' as const] }, {
      'GET /adimli-emirler': () => json(200, { emirler: [] }),
      'GET /hazirlik-maddeleri': () => json(200, eklendi ? eklenmis : MADDELER),
      'GET /hazirlik-sablonu': () => json(200, sablon(true)),
      'POST /hazirlik-maddeleri/ozel-ekle': () => { eklendi = true; return json(200, eklenmis); },
    });
    ac([{ yol: '/adim-durumu', ekran: AdimDurumu }], '/adim-durumu?gorunum=sablon');
    expect(screen.queryByRole('checkbox', { name: /Boya onayı/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni madde' }));
    fireEvent.change(await screen.findByLabelText(/Madde adı/), { target: { value: 'Boya onayı' } });
    fireEvent.change(screen.getByLabelText(/Kısa ad/), { target: { value: 'Boya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/hazirlik-maddeleri/ozel-ekle')).toBe(true); });
    expect(await screen.findByRole('checkbox', { name: /Boya onayı/ })).toBeTruthy();
  });

  it('3739 yeni madde düğmesi hazirlik-ayar yetkisi olmayana görünmez', async () => {
    kur(true);
    await screen.findByRole('checkbox', { name: /CNC kurulumu/ });
    expect(screen.queryByRole('button', { name: 'Yeni madde' })).toBeNull();
  });

  it('409 çakışmasında işaretler silinmez; güncel şablonu kişi kendisi yükler', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] }, {
      'GET /adimli-emirler': () => json(200, { emirler: [] }),
      'GET /hazirlik-maddeleri': () => json(200, MADDELER),
      'GET /hazirlik-sablonu': () => json(200, sablon(true)),
      'PUT /hazirlik-sablonu/7': () => json(409, { kod: 'CAKISMA', mesaj: 'Şablon başkası tarafından değiştirildi; sayfayı yenileyip tekrar deneyin.' }),
    });
    ac([{ yol: '/adim-durumu', ekran: AdimDurumu }], '/adim-durumu?gorunum=sablon');
    fireEvent.change(await screen.findByLabelText('Operasyon türü'), { target: { value: '7' } });
    const aparat = await screen.findByRole('checkbox', { name: /Aparat/ }) as HTMLInputElement;
    fireEvent.click(aparat);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni sürüm kaydet' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /Aparat/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('emre özel: farklar listelenir, gerekçeyle yazılır, "Şablona dön" farkı kaldırır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu' as const] }, {
      'GET /hazirlik-maddeleri': () => json(200, MADDELER),
      'GET /hazirlik-sablonu': () => json(200, sablon(true)),
      'GET /adimli-emirler/5/hazirlik-sablonu-ozel': () => json(200, { farklar: [{ madde: 'aparat', gerekli: true, kisiAdi: 'ORN Müdür', an: '2026-11-25T08:00:00.000Z', gerekce: 'Bu emirde aparat şart' }] }),
      'PUT /adimli-emirler/5/hazirlik-sablonu-ozel/cnc': () => json(200, { farklar: [] }),
      'POST /adimli-emirler/5/hazirlik-sablonu-ozel/aparat/sil': () => json(200, { farklar: [] }),
    });
    ac([{ yol: '/e', ekran: () => <EmreOzelSablon emirId={5} /> }], '/e');
    const liste = await screen.findByRole('list', { name: 'Emre özel farklar' });
    expect(within(liste).getByText(/bu emirde gerekli/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Şablona dön' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol.endsWith('/aparat/sil'))).toBe(true); });
    fireEvent.change(screen.getByLabelText('Madde'), { target: { value: 'cnc' } });
    const uygula = screen.getByRole('button', { name: 'Bu emirde uygula' }) as HTMLButtonElement;
    expect(uygula.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: 'Bu emirde CNC yok' } });
    fireEvent.click(uygula);
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'PUT' && i.yol.endsWith('/cnc'))).toBe(true); });
    expect((istekler.find((i) => i.yontem === 'PUT')!.govde as { gerekli: boolean }).gerekli).toBe(false);
  });
});
