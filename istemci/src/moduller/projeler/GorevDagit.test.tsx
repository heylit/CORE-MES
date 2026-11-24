import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { DagitimCevabi, DagitimSatiri } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GorevDagit } from './GorevDagit.tsx';

const PLANLAMA: Kullanici = { id: 3, ad: 'Deneme Planlama', islemler: ['sayfa.projeler', 'projeler.oku', 'projeler.gorev-yaz'] };

const satir = (ek: Partial<DagitimSatiri>): DagitimSatiri => ({
  kalemId: 1, ad: 'Başlangıç toplantısı', aciklama: null, asama: null, hazirlikMaddesi: null, hazirlikAd: null,
  yapanKisiId: null, yapanRolId: 5, kontrolKisiId: null, kontrolRolId: null, planBaslangic: '2026-12-01', planBitis: '2026-12-02',
  kanitZorunlu: false, adimlar: [], dogacak: 1, ...ek,
});
const cevap = (ek: Partial<DagitimCevabi> = {}): DagitimCevabi => ({
  proje: { id: 4, kod: 'ORN-PRJ-1', ad: 'Deneme projesi', aktif: true },
  sablonlar: [{ id: 2, ad: 'Deneme şablonu', varsayilan: true, dagitildi: false }, { id: 3, ad: 'Eski şablon', varsayilan: false, dagitildi: true }],
  sablonId: 2, dagitildi: false, emirSayisi: 2,
  satirlar: [
    satir({}),
    satir({ kalemId: 2, ad: 'Çizim incelemesi', adimlar: ['Ölçüleri oku', 'Toleransı işaretle'], kanitZorunlu: true }),
    satir({ kalemId: 3, ad: 'CNC programı', hazirlikMaddesi: 'cnc', hazirlikAd: 'CNC kurulumu', dogacak: 4 }),
  ],
  ...ek,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown; kimlik: string | null }

function sunucuKur(ilk: DagitimCevabi) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined, kimlik: new Headers(ayar?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: PLANLAMA } satisfies OturumCevabi);
    if (yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [{ id: 8, ad: 'Deneme Kalite' }] });
    if (yol === '/projeler/rol-secenekleri') return json(200, { roller: [{ id: 5, ad: 'Planlama' }] });
    if (yontem === 'GET' && yol.startsWith('/projeler/4/dagitim')) return json(200, ilk);
    if (yol === '/hazirlik-matrisi?projeId=4') {
      return json(200, { proje: { id: 4, kod: 'ORN-PRJ-1', ad: 'Deneme', durum: 'aktif' }, dagitir: true, gerekmezYazar: true, maddeler: [], gorevler: [], gerekmezler: [],
        emirler: [{ id: 1, emirNo: 'ORN-UE-1', parcaNo: 'ORN-P-1', adet: 1, acik: true, isEmirleri: [] }] });
    }
    if (yontem === 'POST' && yol === '/hazirlik-matrisi/dagit') {
      const deneme = (JSON.parse(String(ayar?.body)) as { deneme: boolean }).deneme;
      return json(200, { eklenen: deneme ? 0 : 2, gorevSayisi: 2, toplamKisi: 1, atanmamis: 0, alicilar: [] });
    }
    if (yontem === 'POST' && yol === '/projeler/4/dagit') return json(200, { projeGorevi: 2, hazirlikGorevi: 4 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(adres = '/projeler/4/gorev-dagit') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes>
            <Route path="/projeler/:id/gorev-dagit" element={<GorevDagit />} />
            <Route path="/projeler/:id" element={<p>Proje sayfası</p>} />
          </Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3458-2 a Görevleri dağıt', () => {
  it('şablon satırları düzenlenir, biri dışarıda bırakılır, özel görev eklenir; dağıt gövdesi ve sonra proje sayfası', async () => {
    const cagrilar = sunucuKur(cevap());
    ac();
    const liste = await screen.findByRole('list', { name: 'Şablonun görevleri' });
    expect(within(liste).getByText(/2 adım · 1 proje görevi/)).toBeTruthy();
    expect(within(liste).getByText(/4 emir görevi/)).toBeTruthy();
    expect(screen.getByText(/^2 proje görevi, 4 emir görevi açılacak; atananlara bildirim gider./)).toBeTruthy();

    fireEvent.click(within(liste).getByRole('checkbox', { name: 'Başlangıç toplantısı' }));
    expect(screen.getByText('2/3 dağıtılacak')).toBeTruthy();
    const ikinci = within(liste).getAllByRole('listitem')[1]!;
    await waitFor(() => { expect(within(ikinci).getAllByRole('option', { name: 'Kişi: Deneme Kalite' }).length).toBeGreaterThan(0); });
    fireEvent.change(within(ikinci).getByLabelText('Kontrol eden'), { target: { value: 'k:8' } });
    fireEvent.change(within(ikinci).getByLabelText(/^Bitiş/), { target: { value: '2026-12-10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Bu işe özel görev ekle' }));
    const dagit = screen.getByRole('button', { name: 'Dağıt' });
    expect((dagit as HTMLButtonElement).disabled).toBe(true);
    const ozel = within(screen.getByRole('list', { name: 'Bu işe özel görevler' })).getByRole('listitem');
    expect(within(ozel).getByText(/Yapan atanmadı: kimseye bildirim gitmez/)).toBeTruthy();
    expect(screen.getByText(/Şimdi değil: görevler açılmaz/)).toBeTruthy();
    fireEvent.change(within(ozel).getByLabelText(/Görev adı/), { target: { value: 'Müşteri ile ölçü teyidi' } });
    fireEvent.click(dagit);

    await screen.findByText('Proje sayfası');
    const post = cagrilar.find((x) => x.yontem === 'POST');
    expect(post?.govde).toMatchObject({
      sablonId: 2,
      satirlar: [
        { kalemId: 1, dahil: false },
        { kalemId: 2, dahil: true, yapanRolId: 5, kontrolKisiId: 8, kontrolRolId: null, planBitis: '2026-12-10', kanitZorunlu: true },
        { kalemId: 3, dahil: true, yapanRolId: 5 },
      ],
      ozel: [{ ad: 'Müşteri ile ölçü teyidi', yapanKisiId: null, yapanRolId: null, planBitis: '2026-12-02', kanitZorunlu: false }],
    });
  });

  it('şablon seçimi adrese yazılır ve önizleme o şablonla istenir; dağıtılmış şablonda satır yok, yalnız özel görev', async () => {
    const cagrilar = sunucuKur(cevap({ sablonId: 3, dagitildi: true, satirlar: [satir({})] }));
    ac('/projeler/4/gorev-dagit?sablon=3');
    expect(await screen.findByText('Bu şablon bu projede zaten dağıtıldı; satırları yeniden açılmaz.')).toBeTruthy();
    expect(cagrilar.some((x) => x.yol === '/projeler/4/dagitim?sablonId=3')).toBe(true);
    expect(screen.queryByRole('list', { name: 'Şablonun görevleri' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Dağıt' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Bu şablon dağıtıldı: Dağıt yalnız bu işe özel görev eklenince açılır.')).toBeTruthy();
    expect(screen.queryByText(/Şimdi değil: görevler açılmaz/)).toBeNull();
    // Risk N1 (3458-3): dağıtılmış şablonda sonradan doğan eksik emir görevleri buradan, önce denenip açılır.
    fireEvent.click(await screen.findByRole('button', { name: 'Eksik emir görevlerini aç' }));
    expect(screen.getByText(/açılmamış 2 emir görevi var/)).toBeTruthy();
    await waitFor(() => { expect(cagrilar.filter((x) => x.yol === '/hazirlik-matrisi/dagit').length).toBeGreaterThanOrEqual(2); });
    // Açınca deneme yeniden sorulur (eksik kalmadıysa şerit kalkar).
    const acma = cagrilar.filter((x) => x.yol === '/hazirlik-matrisi/dagit');
    expect(acma.slice(0, 2).map((x) => x.govde)).toEqual([{ projeId: 4, sablonId: 3, deneme: true }, { projeId: 4, sablonId: 3, deneme: false }]);
    expect(acma.every((x) => x.kimlik !== null && x.kimlik !== '')).toBe(true);
    fireEvent.change(screen.getByLabelText('Görev şablonu'), { target: { value: '2' } });
    await waitFor(() => { expect(cagrilar.some((x) => x.yol === '/projeler/4/dagitim?sablonId=2')).toBe(true); });
  });

  it('kapalı projede dağıtım yok', async () => {
    sunucuKur(cevap({ proje: { id: 4, kod: 'ORN-PRJ-1', ad: 'Deneme projesi', aktif: false } }));
    ac();
    expect(await screen.findByText('Proje kapalı: görev dağıtılmaz.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dağıt' })).toBeNull();
  });
});
