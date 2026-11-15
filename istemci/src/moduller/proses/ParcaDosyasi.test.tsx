import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { ParcaDosyasi } from './ParcaDosyasi.tsx';

// Biçim sunucunun cevabından (proses.test.ts); örnek veri uydurmadır.
const cevap: ProsesParcaCevabi = {
  malzeme: { no: 7, kod: 'ORN-PRC-1042', ad: 'Gövde flanşı' },
  parcaRevizyonu: 'C',
  rota: { revizyon: 'B', acikTaslak: false },
  halkalar: [
    { anahtar: 'cizim', durum: 'tamam', ozet: 'Rev C alındı', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' },
    { anahtar: 'rota', durum: 'tamam', ozet: 'Rev B yürürlükte · 2 op', sahip: 'Reçete ve Rota', yol: '/recete-rota/schema' },
    { anahtar: 'nc', durum: 'kaynak-yok', ozet: null, sahip: 'Sahibi belli değil', yol: null },
    { anahtar: 'takim', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
    { anahtar: 'baglama', durum: 'kaynak-yok', ozet: null, sahip: 'Rota', yol: null },
    { anahtar: 'kurulum', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
    { anahtar: 'kontrol', durum: 'eksik', ozet: '4 karakteristik · numune planı yok: OP 20', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' },
    { anahtar: 'ilk-parca', durum: 'gerekmez', ozet: 'Açık emir yok', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi' },
  ],
  operasyonlar: [
    { opNo: 10, ad: 'Torna', fason: false, tezgah: 'ORN-T1', ayarSuresiDk: '30.00', birimSureDk: '6.5000', gercek: { ortancaDk: '7.2', n: 4 }, karakteristik: 3, talimat: true, numunePlani: true },
    { opNo: 20, ad: 'Freze', fason: false, tezgah: null, ayarSuresiDk: null, birimSureDk: '11.0000', gercek: null, karakteristik: null, talimat: false, numunePlani: false },
  ],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur() {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/malzemeler/secim-ara')) {
      return json(200, { sonuclar: [{ id: 7, kod: 'ORN-PRC-1042', ad: 'Gövde flanşı', aktif: true, ust: null }], dahaVar: false });
    }
    if (yol.startsWith('/proses/parca?')) return json(200, cevap);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function cizdir(adres = '/proses') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[adres]}><QueryClientProvider client={istemci}><ParcaDosyasi /></QueryClientProvider></MemoryRouter>);
}

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
    expect(within(halkalar[2]!).getByText('Kaynak yok')).toBeTruthy();
    expect(within(halkalar[0]!).getByRole('link', { name: 'Kalite Merkezi' }).getAttribute('href')).toBe('/kalite-merkezi/parcalar');
    expect(within(halkalar[2]!).queryByRole('link')).toBeNull();
    expect(screen.getByText('1 halka eksik')).toBeTruthy();
    expect(yollar).toContain('/proses/parca?malzemeNo=7');
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
});
