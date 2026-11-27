import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { ParcaDosyasi } from './ParcaDosyasi.tsx';

const islemler = vi.hoisted(() => ({ liste: ['proses.oku'] as string[] }));
vi.mock('../../ortak/veri/yetki.ts', async (asil) => ({
  ...await asil<object>(),
  useYetki: () => ({ hazir: true, var: (i: string) => islemler.liste.includes(i), herhangi: (...l: string[]) => l.some((i) => islemler.liste.includes(i)) }),
}));

// Biçim sunucunun cevabından (proses.test.ts); örnek veri uydurmadır.
const cevap: ProsesParcaCevabi = {
  malzeme: { no: 7, kod: 'ORN-PRC-1042', ad: 'Gövde flanşı' },
  parcaRevizyonu: 'C',
  rota: { revizyon: 'B', acikTaslak: false },
  halkalar: [
    { anahtar: 'cizim', durum: 'tamam', ozet: 'Rev C alındı', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' },
    { anahtar: 'rota', durum: 'tamam', ozet: 'Rev B yürürlükte · 2 op', sahip: 'Reçete ve Rota', yol: '/recete-rota/schema' },
    { anahtar: 'nc', durum: 'eksik', ozet: '1 program · 1 onaysız', sahip: 'Proses', yol: null },
    { anahtar: 'takim', durum: 'tamam', ozet: '2 takım satırı', sahip: 'Proses', yol: null },
    { anahtar: 'baglama', durum: 'tamam', ozet: '1 aparat satırı', sahip: 'Proses', yol: null },
    { anahtar: 'kurulum', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
    { anahtar: 'kontrol', durum: 'eksik', ozet: '4 karakteristik · numune planı yok: OP 20', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' },
    { anahtar: 'ilk-parca', durum: 'gerekmez', ozet: 'Açık emir yok', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi' },
  ],
  operasyonlar: [
    { opNo: 10, ad: 'Torna', fason: false, tezgah: 'ORN-T1', ayarSuresiDk: '30.00', birimSureDk: '6.5000', gercek: { ortancaDk: '7.2', n: 4 }, karakteristik: 3, talimat: true, numunePlani: true },
    { opNo: 20, ad: 'Freze', fason: false, tezgah: null, ayarSuresiDk: null, birimSureDk: '11.0000', gercek: null, karakteristik: null, talimat: false, numunePlani: false },
  ],
  revizyonlar: [{ kod: 'C', durum: 'yururlukte' }, { kod: 'B', durum: 'eski' }],
  seciliRevizyon: 'C',
  ncProgramlari: [{
    id: 41, opNo: 20, revizyonKodu: null, ad: 'ORN-1042-OP20', kontrol: 'heidenhain', makine: { id: 3, kod: 'ORN-F2' },
    camYazilimi: 'ORN-CAM', camDosyasi: 'ornek/op20.cam', sifirNoktasi: 'Üst yüzey merkezi', cevrimSuresiDk: '11.70', durum: 'taslak',
    aciklama: null, surum: 4, guncelleme: '2026-11-27T08:00:00.000Z',
    takimlar: [
      { tNo: 'T1', kart: { id: 81, kod: 'ORN-TK-10', ad: 'Parmak freze Ø10' }, tutucu: 'SK40', cikintiMm: '35.00', islem: 'Kaba' },
      { tNo: 'T7', kart: { id: 82, kod: 'ORN-TK-M8', ad: null }, tutucu: null, cikintiMm: null, islem: 'Kılavuz' },
    ],
    aparatlar: [{ kart: { id: 91, kod: 'ORN-APR-3', ad: 'Mengene' }, aciklama: 'Ağız 120 mm' }],
    genelYerine: true,
  }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur() {
  const yollar: string[] = [];
  const govdeler: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/proses/nc-programlari/')) { govdeler.push(JSON.parse(String(istek?.body))); return json(200, { id: 41, surum: 5 }); }
    if (yol.startsWith('/malzemeler/secim-ara')) {
      return json(200, { sonuclar: [{ id: 7, kod: 'ORN-PRC-1042', ad: 'Gövde flanşı', aktif: true, ust: null }], dahaVar: false });
    }
    if (yol.startsWith('/proses/parca?')) return json(200, cevap);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return Object.assign(yollar, { govdeler });
}

function cizdir(adres = '/proses') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[adres]}><QueryClientProvider client={istemci}><BildirimSaglayici><ParcaDosyasi /></BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => { islemler.liste = ['proses.oku']; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proses parça dosyası (3290)', () => {
  it('parça seçilmeden sunucuya gitmez ve seçim ister', () => {
    const yollar = sunucuKur();
    cizdir();
    expect(screen.getByText('Proses zincirini görmek için parça seçin.')).toBeTruthy();
    expect(yollar.some((y) => y.startsWith('/proses'))).toBe(false);
  });

  it('seçilen parçanın zincirini sırayla, durumunu ve sahibine bağlantıyı; operasyonları talimat ve numune planıyla gösterir', async () => {
    const yollar = sunucuKur();
    cizdir();
    fireEvent.click(screen.getByRole('button', { name: 'Parça' }));
    fireEvent.click(await screen.findByRole('option', { name: /ORN-PRC-1042/ }));
    const zincir = await screen.findByRole('list', { name: 'Proses zinciri' });
    const halkalar = within(zincir).getAllByRole('listitem');
    expect(halkalar.map((h) => h.textContent?.split(/Tamam|Eksik|Yok|Kaynak yok|Henüz gerekmez/)[0])).toEqual([
      'Çizim', 'Rota', 'NC program', 'Takım listesi', 'Bağlama, aparat', 'Kurulum sayfası', 'Kontrol planı', 'İlk parça',
    ]);
    expect(within(halkalar[6]!).getByText('Eksik')).toBeTruthy();
    expect(within(halkalar[2]!).getByText('Eksik')).toBeTruthy();
    expect(within(halkalar[5]!).getByText('Kaynak yok')).toBeTruthy();
    expect(within(halkalar[0]!).getByRole('link', { name: 'Kalite Merkezi' }).getAttribute('href')).toBe('/kalite-merkezi/parcalar');
    expect(within(halkalar[2]!).queryByRole('link')).toBeNull();
    expect(screen.getByText('2 halka eksik')).toBeTruthy();
    expect(yollar).toContain('/proses/parca?malzemeNo=7');
    fireEvent.click(screen.getByRole('tab', { name: /Operasyonlar/ }));
    const tablo = screen.getByRole('table', { name: 'Operasyonlar' });
    expect(within(tablo).getByText('Freze')).toBeTruthy();
    expect(within(tablo).getByText('ORN-T1')).toBeTruthy();
    expect(within(tablo).getByText('6,5 dk / 7,2 dk (4)')).toBeTruthy();
    expect(within(tablo).getByText('11 dk / —')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ORN-PRC-1042 · Gövde flanşı' })).toBeTruthy();
  });

  it('adresteki parçayı seçmeden açar (?malzemeNo=); başlıkta parça kodu', async () => {
    const yollar = sunucuKur();
    cizdir('/proses?malzemeNo=7');
    expect(await screen.findByRole('heading', { name: 'ORN-PRC-1042 · Gövde flanşı' })).toBeTruthy();
    expect(yollar).toContain('/proses/parca?malzemeNo=7');
    expect(screen.getByRole('list', { name: 'Proses zinciri' })).toBeTruthy();
  });

  it('teknik resim revizyonu seçilince adrese ve sunucu isteğine yazılır; sekme korunur', async () => {
    const yollar = sunucuKur();
    cizdir('/proses?malzemeNo=7');
    fireEvent.click(await screen.findByRole('tab', { name: /NC\/CAM/ }));
    const grup = screen.getByRole('group', { name: 'Teknik resim revizyonu' });
    expect(within(grup).getByRole('button', { name: /Rev C/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: /Rev B/ }));
    await screen.findByRole('region', { name: 'ORN-1042-OP20 programı' });
    expect(yollar).toContain('/proses/parca?malzemeNo=7&rev=B');
    expect(screen.getByRole('tab', { name: /NC\/CAM/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('NC/CAM: operasyona göre program listesi, kartta takım ve aparat; genel kayıt notu; yazma yetkisi yoksa düzenleme yok', async () => {
    sunucuKur();
    cizdir('/proses?malzemeNo=7');
    fireEvent.click(await screen.findByRole('tab', { name: /NC\/CAM/ }));
    expect(screen.getByRole('heading', { name: 'OP 10 · Torna' })).toBeTruthy();
    expect(screen.getByText('Program yok.')).toBeTruthy();
    const kart = screen.getByRole('region', { name: 'ORN-1042-OP20 programı' });
    expect(within(kart).getByText(/Rev C'ye özel OP 20 kaydı yok/)).toBeTruthy();
    expect(within(kart).getByText('+0,7 dk')).toBeTruthy();
    const takimlar = within(kart).getByRole('list', { name: 'Takım listesi' });
    expect(within(takimlar).getAllByRole('listitem').map((l) => l.querySelector('b')?.textContent)).toEqual(['T1', 'T7']);
    expect(within(takimlar).getByText('35 mm')).toBeTruthy();
    expect(within(within(kart).getByRole('list', { name: 'Aparatlar' })).getByText('ORN-APR-3')).toBeTruthy();
    expect(within(kart).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Program ekle/ })).toBeNull();
  });

  it('NC/CAM yazma yetkisiyle: programsız operasyona ekleme açılır; eski olarak işaretleme bütün kaydı durum eski ile gönderir', async () => {
    islemler.liste = ['proses.oku', 'proses.nc-yaz'];
    const yollar = sunucuKur();
    cizdir('/proses?malzemeNo=7');
    fireEvent.click(await screen.findByRole('tab', { name: /NC\/CAM/ }));
    fireEvent.click(screen.getByRole('button', { name: /Program ekle.*OP 10 için program yok/ }));
    expect(await screen.findByRole('dialog', { name: /OP 10 için NC programı/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: 'ORN-1042-OP20 için diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Eski olarak işaretle/ }));
    await vi.waitFor(() => { expect(yollar).toContain('/proses/nc-programlari/41/kaydet'); });
    expect(yollar.govdeler[0]).toMatchObject({
      surum: 4, durum: 'eski', revizyonKodu: null, ad: 'ORN-1042-OP20', makineId: 3, cevrimSuresiDk: 11.7,
      takimlar: [{ tNo: 'T1', malzemeId: 81, cikintiMm: 35 }, { tNo: 'T7', malzemeId: 82, cikintiMm: null }], aparatlar: [{ malzemeId: 91 }],
    });
  });
});
