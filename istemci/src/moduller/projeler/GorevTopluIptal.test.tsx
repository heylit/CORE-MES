import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Gorev, GorevlerimCevabi, Proje, ProjeYonetimiCevabi, TopluGorevIptalGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Gorevler } from './Gorevler.tsx';

const YAZAR: Kullanici = { id: 3, ad: 'Deneme Planlamacı', islemler: ['sayfa.proje-gorevlerim', 'sayfa.projeler', 'projeler.gorev-yaz'] };
const OKUYAN: Kullanici = { id: 4, ad: 'Deneme Okuyan', islemler: ['sayfa.proje-gorevlerim', 'sayfa.projeler'] };

const proje: Proje = {
  id: 1, kod: 'ORN-P-1', ad: 'Deneme proje', durum: 'aktif', firmaId: null, firmaAd: null, firmaKodu: null, siparisId: null, baslangic: null, bitis: null, bitisBagli: false,
  aciklama: null, olusturma: '2026-10-12T09:00:00+03:00', guncelleme: null, surum: 1, statu: null, ilerleme: null,
};
const gorev = (id: number, ad: string, durum: Gorev['durum'], ek: Partial<Gorev> = {}): Gorev => ({
  id, kilometreTasiId: null, ad, aciklama: null, sorumluKisiId: null, sorumluAd: null, planBaslangic: '2026-10-01', planBitis: '2026-10-10',
  gercekBaslangic: null, gercekBitis: null, ilerleme: 0, durum, oncekiGorevId: null, asama: null, yapanRolId: null, yapanRolAd: null, kontrolKisiId: null,
  kontrolKisiAd: null, kontrolRolId: null, kontrolRolAd: null, yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null, yedekKontrolRolAd: null,
  onaylandi: false, hazirlikMaddesi: null, kanitZorunlu: false, adimToplam: 0, adimYapilan: 0, surum: 1, ...ek,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Sunucu durumu: toplu iptal gövdeleri kaydedilir; ikinci görevin ilk denemesi sürüm çakışmasıdır.
function sunucuKur(kullanici: Kullanici, baslangic: Gorev[]) {
  let gorevler = baslangic;
  const gonderilen: TopluGorevIptalGovdesi[] = [];
  let cakisma = true;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/projeler/gorevlerim/liste') return json(200, { gorevler: [] } satisfies GorevlerimCevabi);
    if (yol === '/projeler/dagitim/bekleyenler') return json(200, { projeler: [] });
    if (yol.startsWith('/projeler?')) return json(200, { satirlar: [proje], toplam: 1, sayfa: 1, sayfaBoyu: 200 });
    if (yol === '/projeler/1') return json(200, proje);
    if (yol === '/projeler/1/yonetim') {
      return json(200, { statu: null, statuGecmisi: [], kilometreTaslari: [], ilerleme: null, statuler: [], serbestStatu: false, gorevler } satisfies ProjeYonetimiCevabi);
    }
    if (yol === '/projeler/gorevler/toplu-iptal' && init?.method === 'POST') {
      const govde = JSON.parse(String(init.body)) as TopluGorevIptalGovdesi;
      gonderilen.push(govde);
      const sonuclar = govde.gorevler.map((g) => {
        const m = gorevler.find((x) => x.id === g.id);
        if (m === undefined || m.durum === 'bitti') return { id: g.id, tamam: false, ileti: 'Bitmiş ya da zaten iptal edilmiş görev iptal edilemez.', yenidenDenenir: false };
        if (g.id === 12 && cakisma) { cakisma = false; gorevler = gorevler.map((x) => (x.id === 12 ? { ...x, surum: 2 } : x)); return { id: g.id, tamam: false, ileti: 'Kayıt başkası tarafından değiştirildi; yenileyin.', yenidenDenenir: true }; }
        gorevler = gorevler.map((x) => (x.id === g.id ? { ...x, durum: 'iptal' as const, surum: x.surum + 1 } : x));
        return { id: g.id, tamam: true, ileti: null, yenidenDenenir: false };
      });
      return json(200, { sonuclar });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return gonderilen;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/proje-gorevlerim?proje=1']}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes><Route path="/proje-gorevlerim" element={<Gorevler />} /></Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const GOREVLER = [
  gorev(11, 'ORN çizim hazırla', 'yapilacak'), gorev(12, 'ORN fikstür', 'suruyor'), gorev(13, 'ORN bitmiş iş', 'bitti'),
  gorev(14, 'ORN eski iptal', 'iptal'), gorev(15, 'ORN kontrolde iş', 'kontrolde'),
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Görevlerde toplu iptal (3580)', () => {
  it('iptaller varsayılan gizli; anahtar sayıyı taşır ve açılınca iptal satırı görünür', async () => {
    sunucuKur(YAZAR, GOREVLER);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Projenin görevleri' });
    expect(within(tablo).queryByText(/ORN eski iptal/)).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'İptalleri göster (1)' }));
    expect(await within(tablo).findByText(/ORN eski iptal/)).toBeTruthy();
  });

  it('bitmiş seçilince pencere yalnız iptal edilecekleri sayar, atlananı ayrı yazar; gerekçe yokken düğme pasif ve nedeni görünür', async () => {
    const gonderilen = sunucuKur(YAZAR, GOREVLER);
    ac();
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tümünü seç' }));
    expect(screen.getByRole('status').textContent).toBe('4 seçili');
    fireEvent.click(screen.getByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: '3 görev iptal edilecek' });
    expect(document.activeElement).toBe(within(pencere).getByLabelText(/Gerekçe/));
    expect(within(pencere).getByText(/Atlanacak \(1\)/)).toBeTruthy();
    expect(within(pencere).getByText(/Kontrolde bekleyen: 1/)).toBeTruthy();
    const dugme = within(pencere).getByRole('button', { name: '3 görevi iptal et' });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    expect(within(pencere).getByText(/en az 3 karakter/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'ab' } });
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Plan değişti' } });
    expect((dugme as HTMLButtonElement).disabled).toBe(false);
    expect(gonderilen).toHaveLength(0);
  });

  it('sonuç: kaç iptal edildi, hangisi edilemedi ve nedeni; yeniden iptal tehlike tonunda, yalnız çakışanı taze sürümle yollar', async () => {
    const gonderilen = sunucuKur(YAZAR, GOREVLER);
    ac();
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tümünü seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Plan değişti' } });
    fireEvent.click(within(pencere).getByRole('button', { name: '3 görevi iptal et' }));
    const sonuc = await screen.findByRole('dialog', { name: 'İptal sonucu' });
    await within(sonuc).findByText('2 iptal edildi');
    expect(sonuc.contains(document.activeElement)).toBe(true);
    expect(within(sonuc).getByText('1 iptal edilemedi')).toBeTruthy();
    expect(within(sonuc).getByText(/ORN fikstür/)).toBeTruthy();
    expect(gonderilen[0]?.gerekce).toBe('Plan değişti');
    expect(gonderilen[0]?.gorevler.map((g) => g.id).sort()).toEqual([11, 12, 15]);
    const yeniden = await within(sonuc).findByRole('button', { name: '1 görevi yeniden iptal et' });
    expect(yeniden.className).toContain('tehlike');
    fireEvent.click(yeniden);
    await within(await screen.findByRole('dialog', { name: 'İptal sonucu' })).findByText('3 iptal edildi');
    expect(gonderilen[1]?.gorevler).toEqual([{ id: 12, surum: 2 }]);
    expect(gonderilen[1]?.gerekce).toBe('Plan değişti');
  });

  it('görev yazmayan seçim ve toplu çubuk görmez', async () => {
    sunucuKur(OKUYAN, GOREVLER);
    ac();
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    expect(screen.queryByRole('checkbox', { name: 'Tümünü seç' })).toBeNull();
  });

  it('yalnız bitmiş seçilince başlık sıfır saymaz; düğme pasif', async () => {
    sunucuKur(YAZAR, GOREVLER);
    ac();
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    const kutular = screen.getAllByRole('checkbox');
    fireEvent.click(kutular[3] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'İptal edilecek görev yok' });
    expect((within(pencere).getByRole('button', { name: 'İptal et' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
