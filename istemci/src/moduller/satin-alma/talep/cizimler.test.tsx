import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  CizimSeciciCevabi, MalzemeSecenekleriCevabi, SeciciDosyalariCevabi, SeciciKlasorlerCevabi, TalepCizimi, TalepCizimleriCevabi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { CizimSecici, TalepCizimleri, cizimAdresi } from './Cizimler.tsx';
import { TalepAc } from './TalepAc.tsx';

const ID = '00000000-0000-4000-8000-000000000001';
const OZET = 'a'.repeat(64);
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{
  no: 7, kod: 'HM-00007', ad: 'ORN- çubuk', birim: 'kg', kategori: null, katalogId: null,
  ayrinti: [{ ad: 'Kalite', deger: 'ORN-K1' }, { ad: 'Ölçü', deger: 'Ø50×3000 mm' }],
}] } satisfies MalzemeSecenekleriCevabi;
const YUKLENEN: TalepCizimi = {
  ozet: OZET, ad: 'ORN-cizim.pdf', boyut: 2048, zaman: '2026-11-19T10:00:00Z', kaynak: { tur: 'yuklendi' },
  talepten: true, kaynakTalepNo: null, ekleyenAd: 'ORN-Talep Eden', kaldirmaReddi: null,
};
const MERKEZDEN: TalepCizimi = {
  ozet: 'b'.repeat(64), ad: 'ORN-flans.pdf', boyut: 4096, zaman: '2026-11-19T11:00:00Z',
  kaynak: { tur: 'cizim-merkezi', belgeId: 3, revizyonId: 30, revKodu: 'A', yeniRevizyon: { revizyonId: 31, revKodu: 'B' } },
  talepten: true, kaynakTalepNo: 'ORN-T-2', ekleyenAd: 'ORN-Talep Eden', kaldirmaReddi: 'Teklif isteği gönderildi; talepten gelen çizim kaldırılamaz.',
};
const CIZIMLER = { cizimler: [YUKLENEN], kaldirilanlar: [] } satisfies TalepCizimleriCevabi;
const SECICI = {
  oneriler: [{ belgeId: 3, revizyonId: 31, ad: 'ORN-flans', revKodu: 'B', pdf: true, malzemeNo: 7, kullanim: null }],
  bulunan: [],
} satisfies CizimSeciciCevabi;
const KLASORLER = { klasorler: [{ id: 1, ustId: null, ad: 'ORN-Kalite', dar: false }, { id: 2, ustId: 1, ad: 'ORN-Gizli', dar: true }] } satisfies SeciciKlasorlerCevabi;
const DOSYALAR = { dosyalar: [
  { dosyaId: 9, ad: 'ORN-olcu.pdf', surumSirasi: 2, boyut: 1024, pdf: true, dar: true },
  { dosyaId: 10, ad: 'ORN-not.docx', surumSirasi: 1, boyut: 1024, pdf: false, dar: true },
] } satisfies SeciciDosyalariCevabi;
const KISI = (islemler: Kullanici['islemler']): Kullanici => ({ id: 5, ad: 'ORN-Kisi', islemler });

interface Istek { yol: string; yontem: string; govde: unknown }
function sunucu(o: { kisi?: Kullanici | null; cizimler?: TalepCizimleriCevabi } = {}): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const govde: unknown = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : null;
    istekler.push({ yol, yontem: secenek?.method ?? 'GET', govde });
    if (yol === '/oturum') return json(200, { kullanici: o.kisi ?? KISI(['satin-alma.talep-ac']) } satisfies OturumCevabi);
    if (yol === `/satin-alma-talepleri/${ID}/cizimler`) return json(200, o.cizimler ?? CIZIMLER);
    if (yol.startsWith('/satin-alma-cizim-secici/cizimler')) {
      const islemler = o.kisi?.islemler ?? [];
      return islemler.includes('sayfa.cizimler') ? json(200, SECICI) : json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
    }
    if (yol === '/satin-alma-cizim-secici/klasorler') return json(200, KLASORLER);
    if (yol.startsWith('/satin-alma-cizim-secici/klasorler/2/dosyalar')) return json(200, DOSYALAR);
    if (yol.endsWith('/cizim-sec') || yol.endsWith('/guncelle')) return json(200, o.cizimler ?? CIZIMLER);
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, { emirler: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return istekler;
}
const sar = (c: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{c}</BildirimSaglayici></QueryClientProvider>,
);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3442-2 talebin çizimi', () => {
  it('liste dosyayı talebin ucundan indirir; yazamayan ekleyemez ve kaldıramaz', async () => {
    sunucu();
    sar(<TalepCizimleri talepId={ID} yazabilir={false} />);
    const bag = await screen.findByRole('link', { name: 'ORN-cizim.pdf' });
    expect(bag.getAttribute('href')).toBe(cizimAdresi(ID, OZET));
    expect(bag.getAttribute('href')).toBe(`/api/satin-alma-talepleri/${ID}/cizimler/${OZET}/dosya`);
    expect(screen.queryByRole('button', { name: /Çizim ekle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /kaldır/ })).toBeNull();
  });

  it('yazan ekler; kaldırma onay ister, vazgeçince istek gitmez', async () => {
    const yollar = sunucu();
    sar(<TalepCizimleri talepId={ID} yazabilir />);
    expect(screen.getByRole('button', { name: /Çizim ekle/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-cizim.pdf: kaldır' }));
    expect(await screen.findByText('ORN-cizim.pdf talepten kaldırılsın mı?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByText('ORN-cizim.pdf talepten kaldırılsın mı?')).toBeNull());
    expect(yollar.some((y) => y.yol.endsWith('/kaldir'))).toBe(false);
  });

  it('yasak: PDF olmayan dosya yüklenmez, iletiyle reddedilir; depoya istek gitmez', async () => {
    const yollar = sunucu();
    const degistir = vi.fn();
    sar(<CizimSecici secilen={[]} degistir={degistir} />);
    const girdi = screen.getByLabelText('Çizim dosyası (PDF)') as HTMLInputElement;
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'ORN-resim.png', { type: 'image/png' })] } });
    expect((await screen.findByRole('alert')).textContent).toBe('Çizim PDF olmalı.');
    await waitFor(() => expect(degistir).toHaveBeenCalledWith([]));
    expect(yollar.some((y) => y.yol.startsWith('/dosyalar'))).toBe(false);
  });

  it('birden çok dosyada her reddedilen dosya adıyla yazılır', async () => {
    sunucu();
    sar(<CizimSecici secilen={[]} degistir={vi.fn()} />);
    const girdi = screen.getByLabelText('Çizim dosyası (PDF)') as HTMLInputElement;
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'ORN-a.png', { type: 'image/png' }), new File(['x'], 'ORN-b.png', { type: 'image/png' })] } });
    expect((await screen.findByRole('alert')).textContent).toBe('2 dosyadan 2 tanesi eklenemedi. ORN-a.png: Çizim PDF olmalı. ORN-b.png: Çizim PDF olmalı.');
  });

  it('talep formunda seçilen kartın ayrıntısı açık görünür', async () => {
    sunucu();
    sar(<TalepAc />);
    const kutu = screen.getByRole('combobox', { name: 'Malzeme' });
    fireEvent.focus(kutu);
    await screen.findByRole('option', { name: /HM-00007/ });
    fireEvent.keyDown(kutu, { key: 'ArrowDown' });
    fireEvent.keyDown(kutu, { key: 'Enter' });
    // 3695: föyün her alanı kalemin altındaki "Seçilen malzeme" şeridinde ayrı etiketli hücredir; tabloda sütun yoktur.
    const serit = await screen.findByRole('region', { name: 'Seçilen malzeme' });
    expect(within(serit).getByText('Kalite').nextElementSibling?.textContent).toBe('ORN-K1');
    expect(within(serit).getByText('Ölçü').nextElementSibling?.textContent).toBe('Ø50×3000 mm');
    expect(screen.getAllByRole('columnheader').map((x) => x.textContent)).not.toContain('Kalite');
  });
});

describe('3571 çizimi Çizim Merkezi ve Ortak Dosyalar\'dan seçmek', () => {
  it('kaynağı göremeyen kişide menü yok, öneri şeridi çizilmez: yalnız bilgisayardan', async () => {
    const istekler = sunucu({ kisi: KISI(['satin-alma.talep-ac']) });
    sar(<TalepCizimleri talepId={ID} yazabilir />);
    expect(await screen.findByRole('link', { name: 'ORN-cizim.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Çizim ekle (PDF)' })).toBeTruthy();
    // Çizim Merkezi'ni okuyamayan kişide öneri isteği hiç gitmez (eskiden her açılışta 404).
    expect(istekler.some((i) => i.yol.startsWith('/satin-alma-cizim-secici/cizimler'))).toBe(false);
    expect(screen.queryByRole('group', { name: /Çizim Merkezi'ndeki çizimleri/ })).toBeNull();
    expect(screen.queryByText('ORN-flans')).toBeNull();
  });

  it('öneri şeridinden ekleme kaynağın kimliğini gönderir, özet göndermez', async () => {
    const istekler = sunucu({ kisi: KISI(['satin-alma.talep-ac', 'sayfa.cizimler']) });
    sar(<TalepCizimleri talepId={ID} yazabilir />);
    const serit = await screen.findByRole('group', { name: /Çizim Merkezi'ndeki çizimleri/ });
    expect(within(serit).getByText('ORN-flans')).toBeTruthy();
    fireEvent.click(within(serit).getByRole('button', { name: 'ORN-flans: ekle' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.endsWith('/cizim-sec'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/cizim-sec'))?.govde).toEqual({ kaynak: 'cizim-merkezi', belgeId: 3, revizyonId: 31 });
  });

  it('Ortak Dosyalar seçicisi: klasör, PDF olmayan seçilemez, dar klasör uyarısı, seçilen eklenir', async () => {
    const degistir = vi.fn();
    sunucu({ kisi: KISI(['satin-alma.talep-ac', 'sayfa.ortak-dosyalar']) });
    sar(<CizimSecici secilen={[]} degistir={degistir} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Çizim ekle' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: "Ortak Dosyalar'dan" }));
    expect(await screen.findByText("Çizim Merkezi'ni görme yetkiniz yok; yalnız Ortak Dosyalar'dan ya da bilgisayardan eklersiniz.")).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /ORN-Gizli/ }));
    const pdf = await screen.findByRole('checkbox', { name: /ORN-olcu\.pdf/ });
    expect((screen.getByRole('checkbox', { name: /ORN-not\.docx/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Dar klasör: talebi gören herkes görür/)).toBeTruthy();
    fireEvent.click(pdf);
    // Seçilen alt çubukta adıyla görünür (iki kaynakta sekme sayacı da).
    expect(screen.getByText(/1 çizim seçildi: ORN-olcu\.pdf/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1 çizim ekle' }));
    expect(degistir).toHaveBeenCalledWith([{ tur: 'ortak-dosyalar', dosyaId: 9, surumSirasi: 2, ad: 'ORN-olcu.pdf', klasorYolu: ['ORN-Kalite', 'ORN-Gizli'], dar: true }]);
  });

  it('satın alma görünümü: Talep eden ekledi rozeti, kaldırma kapalı ve nedeni yazılı; yeni revizyonda Güncelle', async () => {
    const istekler = sunucu({ kisi: KISI(['satin-alma.yaz', 'sayfa.cizimler']), cizimler: { cizimler: [MERKEZDEN], kaldirilanlar: [] } });
    sar(<TalepCizimleri talepId={ID} yazabilir gorunum="satin-alma" />);
    expect(await screen.findByText('Talep eden ekledi · ORN-T-2')).toBeTruthy();
    expect(screen.getByText('Çizim Merkezi · Rev A')).toBeTruthy();
    expect(screen.getByText(/Yeni revizyon var: Rev B/)).toBeTruthy();
    const kaldir = screen.getByRole('button', { name: 'ORN-flans.pdf: kaldır' });
    expect(kaldir.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(MERKEZDEN.kaldirmaReddi!)).toBeTruthy();
    fireEvent.click(kaldir);
    expect(screen.queryByText('ORN-flans.pdf talepten kaldırılsın mı?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === `/satin-alma-talepleri/${ID}/cizimler/${MERKEZDEN.ozet}/guncelle`)).toBe(true));
  });

  it('talep görünümünde satın almanın kaldırdığı çizimin notu durur', async () => {
    sunucu({ cizimler: { cizimler: [], kaldirilanlar: [{ ad: 'ORN-eski.pdf', kaldiranAd: 'ORN-Satin Alma', zaman: '2026-11-20T09:00:00Z' }] } });
    sar(<TalepCizimleri talepId={ID} yazabilir={false} />);
    expect(await screen.findByText(/Satın alma kaldırdı: ORN-eski\.pdf · ORN-Satin Alma/)).toBeTruthy();
  });
});
