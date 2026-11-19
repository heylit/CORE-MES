import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ArsivCevabi, DosyalarCevabi, Klasor, KlasorlerCevabi, OrtakDosya, SecimCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OrtakDosyalar, type Gorunum } from './OrtakDosyalar.tsx';

// Kart 3443: yüklemede müşteri ve proje, Arşiv'de kalıcı silme ve dört göz. Örnek veri ORN-.
vi.mock('../belge-merkezi/disari.ts', () => ({ DosyaHatasi: class extends Error {}, dosyaYukle: vi.fn(async () => 'a'.repeat(64)) }));

const klasor = (k: Partial<Klasor> & { id: number; ad: string }): Klasor => ({ ustId: null, ozelYetki: false, duzey: 'yonetir', dosyaSayisi: 0, surum: 1, kaynak: null, ...k });
const ORTAK = klasor({ id: 1, ad: 'Ortak', ozelYetki: true });
const dosya = (d: Partial<OrtakDosya> & { id: number; ad: string }): OrtakDosya => ({
  klasorId: 1, klasorYolu: ['Ortak'], surumSirasi: 1, boyut: 2000, yukleyenAd: 'ORN-Kisi 1', zaman: '2026-11-19T08:00:00Z', arsiv: true, surum: 3,
  firma: null, proje: null, silmeIstegi: null, ...d,
});
const MUSTERI_A = { id: 7, kod: '', ad: 'ORN-Musteri A', aktif: true, ust: null };
const MUSTERI_B = { id: 8, kod: '', ad: 'ORN-Musteri B', aktif: true, ust: null };
const PROJE_A = { id: 14, kod: 'ORN-PRJ-014', ad: 'Govde ailesi', aktif: true, ust: { id: 7, kod: '', ad: 'ORN-Musteri A' } };
const json = (durum: number, govde: unknown) => new Response(durum === 204 ? null : JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(o: { arsiv?: OrtakDosya[]; dortGoz?: boolean } = {}) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const tam = adres.replace('/api', '');
    const [yol = '', arama = ''] = tam.split('?');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol: tam, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/ortak-dosyalar/klasorler') return json(200, { klasorler: [ORTAK], yonetici: false, arsivSayisi: 0 } satisfies KlasorlerCevabi);
    if (yol === '/ortak-dosyalar/klasorler/1/dosyalar') {
      return json(200, { klasor: ORTAK, altKlasorler: [], dosyalar: [], adOnerisi: null, kayitSecimi: null } satisfies DosyalarCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/1/yukle') return json(200, dosya({ id: 99, ad: 'yeni', arsiv: false }));
    if (yol === '/ortak-dosyalar/secim/musteriler') return json(200, { sonuclar: [MUSTERI_A, MUSTERI_B], dahaVar: false } satisfies SecimCevabi);
    if (yol === '/ortak-dosyalar/secim/projeler') {
      return json(200, { sonuclar: new URLSearchParams(arama).get('firmaId') === '8' ? [] : [PROJE_A], dahaVar: false } satisfies SecimCevabi);
    }
    if (yol === '/ortak-dosyalar/arsiv') {
      const hepsi = o.arsiv ?? [];
      const bekleyen = new URLSearchParams(arama).get('onayBekleyen') === 'true';
      return json(200, { dosyalar: bekleyen ? hepsi.filter((d) => d.silmeIstegi !== null) : hepsi, silmeDortGoz: o.dortGoz ?? false } satisfies ArsivCevabi);
    }
    if (yol.endsWith('/kalici-sil') || yol.endsWith('/silme-onayla')) return json(204, null);
    if (/\/(silme-iste|silme-reddet|silme-geri-cek|arsivden-cikar)$/.test(yol)) return json(200, (o.arsiv ?? [])[0]);
    return json(404, { kod: 'BULUNAMADI', mesaj: yol });
  }));
  return cagrilar;
}

function ciz(gorunum: Gorunum = 'klasorler') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter><OrtakDosyalar gorunum={gorunum} /></MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

// jsdom'un File'ı arrayBuffer vermez.
const dosyaAc = (ad: string): File => Object.assign(new File(['x'], ad), { arrayBuffer: async () => new ArrayBuffer(1) });
const dosyaSec = (dosyalar: File[]) => {
  const girdi = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  fireEvent.change(girdi, { target: { files: dosyalar } });
};
async function secimYap(etiket: RegExp, secenek: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: etiket }));
  fireEvent.click(await screen.findByRole('option', { name: secenek }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('yüklemede müşteri ve proje (kart 3443)', () => {
  it('tek dosyada pencere ad, müşteri ve proje sorar; seçim yükleme gövdesine gider', async () => {
    const cagrilar = sunucuKur();
    ciz();
    await screen.findByRole('button', { name: /Dosya yükle/ });
    dosyaSec([dosyaAc('ORN-resim.pdf')]);
    const pencere = await screen.findByRole('dialog', { name: /Dosya yükle · 1 dosya/ });
    expect((within(pencere).getByLabelText(/Dosya adı/) as HTMLInputElement).value).toBe('ORN-resim.pdf');
    await secimYap(/^Müşteri \(isteğe bağlı\)$/, /ORN-Musteri A/);
    await secimYap(/^Proje \(isteğe bağlı\)$/, /ORN-PRJ-014/);
    expect(cagrilar.some((c) => c.yol === '/ortak-dosyalar/secim/projeler?firmaId=7&sayfa=1')).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: /^Yükle$/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ ad: 'ORN-resim.pdf', ozet: 'a'.repeat(64), firmaId: 7, projeId: 14 });
  });

  it('müşteri değişince proje temizlenir ve yazılır; önce proje seçilirse müşteri dolar', async () => {
    sunucuKur();
    ciz();
    await screen.findByRole('button', { name: /Dosya yükle/ });
    dosyaSec([dosyaAc('ORN-resim.pdf')]);
    await screen.findByRole('dialog');
    await secimYap(/^Proje \(isteğe bağlı\)$/, /ORN-PRJ-014/);
    expect(screen.getByRole('button', { name: /^Müşteri \(isteğe bağlı\)$/ }).textContent).toContain('ORN-Musteri A');
    await secimYap(/^Müşteri \(isteğe bağlı\)$/, /ORN-Musteri B/);
    expect(screen.getByText(/Proje temizlendi/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Proje \(isteğe bağlı\)$/ }).textContent).toContain('Seçilmedi');
  });

  it('birden çok dosyada pencere ad sormaz; seçim her dosyaya uygulanır, dosyalar kendi adlarıyla gider', async () => {
    const cagrilar = sunucuKur();
    ciz();
    await screen.findByRole('button', { name: /Dosya yükle/ });
    dosyaSec([dosyaAc('ORN-a.pdf'), dosyaAc('ORN-b.pdf')]);
    const pencere = await screen.findByRole('dialog', { name: /Dosya yükle · 2 dosya/ });
    expect(within(pencere).queryByLabelText(/Dosya adı/)).toBeNull();
    await secimYap(/^Müşteri \(isteğe bağlı\)$/, /ORN-Musteri A/);
    fireEvent.click(within(pencere).getByRole('button', { name: /^Yükle$/ }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yontem === 'POST')).toHaveLength(2));
    expect(cagrilar.filter((c) => c.yontem === 'POST').map((c) => c.govde)).toEqual([
      { ad: 'ORN-a.pdf', ozet: 'a'.repeat(64), firmaId: 7 }, { ad: 'ORN-b.pdf', ozet: 'a'.repeat(64), firmaId: 7 },
    ]);
  });
});

describe('Arşiv: kalıcı silme ve dört göz (kart 3443)', () => {
  it('dört göz kapalı: "Kalıcı sil" adı yazılmadan basılmaz; ad yazılınca sürümle ve adla gider', async () => {
    const cagrilar = sunucuKur({ arsiv: [dosya({ id: 5, ad: 'ORN-eski-teklif.pdf', surumSirasi: 3 })] });
    ciz('arsiv');
    fireEvent.click(await screen.findByRole('button', { name: /Kalıcı sil/ }));
    const pencere = await screen.findByRole('dialog', { name: /ORN-eski-teklif.pdf kalıcı silinsin mi/ });
    expect(within(pencere).getByText(/Dosya ve 3 sürümü geri alınamaz/)).toBeTruthy();
    const sil = within(pencere).getByRole('button', { name: /^Kalıcı sil$/ }) as HTMLButtonElement;
    expect(sil.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/dosya adını yazın/), { target: { value: 'ORN-eski' } });
    expect(sil.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/dosya adını yazın/), { target: { value: ' orn-eskİ-teklİf.pdf ' } });
    expect(sil.disabled).toBe(false);
    fireEvent.click(sil);
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true));
    const post = cagrilar.find((c) => c.yontem === 'POST');
    expect(post?.yol).toBe('/ortak-dosyalar/klasorler/1/dosyalar/5/kalici-sil');
    expect(post?.govde).toEqual({ surum: 3, ad: ' orn-eskİ-teklİf.pdf ' });
    expect(screen.queryByRole('button', { name: /Silme iste/ })).toBeNull();
  });

  it('dört göz açık: istek yoksa "Silme iste"; kendi isteğinde yalnız geri çekme, başkasının isteğinde onay ve ret', async () => {
    const istek = (kendi: boolean) => ({ isteyenAd: kendi ? 'Deneme Kişi' : 'ORN-Kisi 1', zaman: '2026-11-19T09:12:00Z', kendi });
    const cagrilar = sunucuKur({
      dortGoz: true,
      arsiv: [
        dosya({ id: 5, ad: 'ORN-bos.pdf' }),
        dosya({ id: 6, ad: 'ORN-kendi.pdf', silmeIstegi: istek(true) }),
        dosya({ id: 7, ad: 'ORN-baskasi.pdf', silmeIstegi: istek(false) }),
      ],
    });
    ciz('arsiv');
    const satir = async (ad: string) => (await screen.findByText(ad)).closest('tr') as HTMLElement;
    const bos = await satir('ORN-bos.pdf');
    expect(within(bos).queryByRole('button', { name: /Kalıcı sil/ })).toBeNull();
    fireEvent.click(within(bos).getByRole('button', { name: /Silme iste/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/5/silme-iste'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/5/silme-iste'))?.govde).toEqual({ surum: 3 });

    const kendi = await satir('ORN-kendi.pdf');
    expect(within(kendi).getByText('Silme onayı bekliyor')).toBeTruthy();
    expect(within(kendi).getByText(/Kendi isteğiniz/)).toBeTruthy();
    expect(within(kendi).queryByRole('button', { name: /Onayla ve sil/ })).toBeNull();
    fireEvent.click(within(kendi).getByRole('button', { name: /İsteği geri çek/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/6/silme-geri-cek'))).toBe(true));

    const baskasi = await satir('ORN-baskasi.pdf');
    expect(within(baskasi).getByText(/ORN-Kisi 1 istedi/)).toBeTruthy();
    fireEvent.click(within(baskasi).getByRole('button', { name: /Reddet/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/7/silme-reddet'))).toBe(true));
    fireEvent.click(within(await satir('ORN-baskasi.pdf')).getByRole('button', { name: /Onayla ve sil/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Onaylamak için dosya adını yazın/), { target: { value: 'ORN-baskasi.pdf' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /^Onayla ve sil$/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/7/silme-onayla'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/7/silme-onayla'))?.govde).toEqual({ surum: 3, ad: 'ORN-baskasi.pdf' });
  });

  it('"Onay bekleyen" süzgeci sunucudan bekleyenleri ister ve sayısını gösterir', async () => {
    const cagrilar = sunucuKur({
      dortGoz: true,
      arsiv: [dosya({ id: 5, ad: 'ORN-bos.pdf' }), dosya({ id: 7, ad: 'ORN-baskasi.pdf', silmeIstegi: { isteyenAd: 'ORN-Kisi 1', zaman: '2026-11-19T09:12:00Z', kendi: false } })],
    });
    ciz('arsiv');
    fireEvent.click(await screen.findByRole('button', { name: 'Onay bekleyen · 1' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/ortak-dosyalar/arsiv?onayBekleyen=true')).toBe(true));
    expect(await screen.findByText('ORN-baskasi.pdf')).toBeTruthy();
    expect(screen.queryByText('ORN-bos.pdf')).toBeNull();
    expect(cagrilar.some((c) => c.yol === '/ortak-dosyalar/arsiv?onayBekleyen=true')).toBe(true);
  });
});
