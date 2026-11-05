import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriAnalizCevabi, GeometriModelListeCevabi, GeometriYuzeyCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { ResimAl, YuzBoyasi, YuzDurumu } from './Goruntu3B.tsx';
import { rotalar } from './rotalar.tsx';

// Yüzey işlemleri kartı (2144, prototip v2): rotadan gelen işlemler, kural ve tablo seçimi, atama ve kayıt, çakışma, yalnız okuma,
// önceki revizyondan öneri, rota yok ve görüntünün yüz sırası denetimi. Görüntü sahtedir: denetim sonucunu verir, renkleri yazar,
// modelde tıklamayı düğmeyle taklit eder.
const sahte = vi.hoisted(() => ({ durum: 'hazir' as YuzDurumu }));
vi.mock('./Goruntu3B.tsx', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ yuzBoyasi, arac, bilgi, resimAlici }: { yuzBoyasi?: YuzBoyasi | null; arac?: React.ReactNode; bilgi?: string | null; resimAlici?: (al: ResimAl | null) => void }) => {
      const durumYaz = yuzBoyasi?.durumYaz;
      useEffect(() => { durumYaz?.(sahte.durum); }, [durumYaz]);
      useEffect(() => { resimAlici?.(async () => new Blob()); return () => resimAlici?.(null); }, [resimAlici]);
      return (
        <>
          <div>görüntü</div>
          {arac}
          {bilgi ? <p>{bilgi}</p> : null}
          {yuzBoyasi ? <div>{`renk ${[...yuzBoyasi.renkler].map(([s, r]) => `${String(s)}=${r}`).join(' ')}`}</div> : null}
          {yuzBoyasi?.sec ? <button type="button" onClick={() => yuzBoyasi.sec?.(4)}>modelde yüz 4</button> : null}
        </>
      );
    },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sahte.durum = 'hazir'; });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { anahtar: string; govde: unknown }
function sunucuKur(yollar: Record<string, () => Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const anahtar = `${secenek?.method ?? 'GET'} ${yol}`;
    istekler.push({ anahtar, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : null });
    const isle = yollar[anahtar];
    return isle ? isle() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/geometri?rev=41']}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [{ malzemeNo: 7, malzemeKodu: 'MLZ-0007', malzemeAdi: 'Deneme flanş', belgeId: 3, belgeAdi: 'Model flans.step', revizyonId: 41, harf: 'B', dosyaTuru: 'step', durum: 'bitti', hataMetni: null }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ: GeometriAnalizCevabi = {
  revizyonId: 41, belgeId: 3, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-11-05T10:00:00+03:00', baslama: '2026-11-05T10:00:01+03:00', bitis: '2026-11-05T10:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 40, y: 20, z: 10 }, obb: { a: 40, b: 20, c: 10, cap: 45, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 8000, alanMm2: 2800, govdeSayisi: 1, kapali: true, ucgenSayisi: 12, hesapSuresiMs: 20, hesapZamani: '2026-11-05T10:00:02+03:00', yuzler: null,
  },
};
const BOYA = { tur: 'rota' as const, opNo: 40, sartnameId: 5 };
const YUZEY: GeometriYuzeyCevabi = {
  revizyonId: 41, oneri: true, neden: null,
  yuzler: [
    { sira: 1, tur: 'duzlem', ters: false, alanMm2: 800 },
    { sira: 2, tur: 'duzlem', ters: false, alanMm2: 800 },
    { sira: 3, tur: 'silindir', ters: true, alanMm2: 300 },
    { sira: 4, tur: 'silindir', ters: false, alanMm2: 600 },
  ],
  rota: {
    durum: 'bagli',
    adimlar: [{ opNo: 40, adimAdi: 'Boya', fason: true, talimatVar: true, sartname: { id: 5, kod: 'BYA-TOZ', ad: 'Toz boya', kategoriKodu: 'BYA' } }],
  },
  isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false, rotadaVar: true }],
  alanlar: [{ islem: BOYA, yuzSayisi: 1, alanMm2: 800, oneriVar: false }],
  isaretsizMm2: 1700, toplamMm2: 2500,
  surum: 2, guncelleyen: { id: 9, ad: 'Deneme Kişi' }, guncelleme: '2026-11-05T14:10:00+03:00', tasima: null,
};
const temel = (yuzey: () => Response, islemler: string[] = ['geometri.oku', 'geometri.yuzey-yaz'], ek: Record<string, () => Response> = {}) => ({
  'GET /geometri/modeller?sayfa=1': () => json(200, LISTE),
  'GET /geometri/analizler/41': () => json(200, ANALIZ),
  'GET /geometri/modeller/41/dosya': () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  'GET /geometri/yuzey/41': yuzey,
  'GET /oturum': () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler } }),
  ...ek,
});
const kart = async () => {
  const baslik = await screen.findByRole('heading', { name: 'Yüzey işlemleri' });
  return baslik.closest('section') as HTMLElement;
};
const kaydetDugmesi = (k: HTMLElement) => within(k).getByRole('button', { name: /^Kaydet/ });

describe('3D Atölyesi yüzey işlemleri kartı (2144)', () => {
  it('işlemler rotadan gelir; kuralla seçilen yüzlere maske atanır, Kaydet bütün işaretleri sürümle gönderir', async () => {
    const istekler = sunucuKur(temel(() => json(200, YUZEY), undefined, {
      'POST /geometri/yuzey/41/kaydet': () => json(200, { ...YUZEY, surum: 3, isaretler: [...YUZEY.isaretler, { yuzSira: 3, islem: { tur: 'maske' }, oneri: false, rotadaVar: true }] }),
    }));
    ac();
    const k = await kart();
    expect(await within(k).findAllByText('Adım 40 · Toz boya')).not.toHaveLength(0);
    expect(within(k).getByText(/BYA-TOZ · Fason · talimat var · 1 yüz/)).toBeTruthy();
    expect(within(k).getByText('Son kayıt: 05.11.2026 14:10, Deneme Kişi')).toBeTruthy();
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
    expect(kaydetDugmesi(k).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(k).getByRole('button', { name: /Delik içleri/ }));
    expect(within(k).getByText('1 yüz')).toBeTruthy();
    // Satırdaki işlem adına dokunmak onu atanacak işlem yapar (prototip v2).
    fireEvent.click(within(k).getByRole('button', { name: 'Maske' }));
    expect(within(k).getByLabelText<HTMLSelectElement>('Atanacak işlem').value).toBe('maske');
    expect(within(k).getByRole('button', { name: 'Maske' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(k).getByRole('button', { name: /^Ata$/ }));
    expect(await screen.findByText('renk 1=--grafik 3=--sahne3b-tarama')).toBeTruthy();
    expect(within(k).getByText('Kaydedilmemiş değişiklik var.')).toBeTruthy();
    fireEvent.click(kaydetDugmesi(k));
    expect(await screen.findByText('Yüzey işaretleri kaydedildi.')).toBeTruthy();
    const gonderilen = istekler.find((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet');
    expect(gonderilen?.govde).toEqual({
      surum: 2,
      isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false }, { yuzSira: 3, islem: { tur: 'maske' }, oneri: false }],
    });
  });

  it('modelde yüz seçimi açılınca tıklanan yüz seçime girer; tablodan kaldırılan işaret de gönderilir', async () => {
    const istekler = sunucuKur(temel(() => json(200, YUZEY), undefined, { 'POST /geometri/yuzey/41/kaydet': () => json(200, { ...YUZEY, surum: 3 }) }));
    ac();
    const k = await kart();
    expect(screen.queryByRole('button', { name: 'modelde yüz 4' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Yüz seç/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'modelde yüz 4' }));
    expect(within(k).getByLabelText<HTMLInputElement>('Yüz 4').checked).toBe(true);
    expect(screen.getByText(/1 yüz seçili/)).toBeTruthy();
    fireEvent.click(within(k).getByLabelText('Yüz 4'));
    fireEvent.click(within(k).getByLabelText('Yüz 1'));
    fireEvent.change(within(k).getByLabelText('Atanacak işlem'), { target: { value: 'kaldir' } });
    fireEvent.click(within(k).getByRole('button', { name: /^Ata$/ }));
    fireEvent.click(kaydetDugmesi(k));
    await waitFor(() => expect(istekler.some((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')).toBe(true));
    expect(istekler.find((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')?.govde).toEqual({ surum: 2, isaretler: [] });
  });

  it('başkası değiştirdiyse (409) kaydedilmez, şerit çıkar; Günceli oku taslağı bırakıp yeniden okur', async () => {
    const istekler = sunucuKur(temel(() => json(200, YUZEY), undefined, {
      'POST /geometri/yuzey/41/kaydet': () => json(409, { kod: 'ESKI_SURUM', mesaj: 'Kayıt değişmiş.' }),
    }));
    ac();
    const k = await kart();
    fireEvent.click(await within(k).findByRole('button', { name: /Düzlemler/ }));
    fireEvent.click(within(k).getByRole('button', { name: /^Ata$/ }));
    fireEvent.click(kaydetDugmesi(k));
    expect(await within(k).findByText(/başka biri tarafından değiştirildi/)).toBeTruthy();
    expect(kaydetDugmesi(k).hasAttribute('disabled')).toBe(true);
    const once = istekler.filter((i) => i.anahtar === 'GET /geometri/yuzey/41').length;
    fireEvent.click(within(k).getByRole('button', { name: /Günceli oku/ }));
    await waitFor(() => expect(istekler.filter((i) => i.anahtar === 'GET /geometri/yuzey/41').length).toBe(once + 1));
    expect(within(k).queryByText(/başka biri tarafından değiştirildi/)).toBeNull();
    expect(await within(k).findByText('Son kayıt: 05.11.2026 14:10, Deneme Kişi')).toBeTruthy();
  });

  it('yalnız okuma: geometri.yuzey-yaz yoksa seçim, atama ve Kaydet yok; işaretler görünür', async () => {
    sunucuKur(temel(() => json(200, YUZEY), ['geometri.oku']));
    ac();
    const k = await kart();
    expect(await within(k).findByText(/Yalnız okuma/)).toBeTruthy();
    expect(within(k).queryByRole('button', { name: /^Kaydet/ })).toBeNull();
    expect(within(k).queryByRole('button', { name: /^Ata$/ })).toBeNull();
    expect(within(k).queryByLabelText('Yüz 1')).toBeNull();
    expect(screen.queryByRole('button', { name: /Yüz seç/ })).toBeNull();
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
  });

  it('önceki revizyondan öneri: şerit sayıları söyler, maske resmi onaya kadar kapalı; Tümünü onayla ilk kaydı sürümsüz açar', async () => {
    const tasinan: GeometriYuzeyCevabi = {
      ...YUZEY, surum: null, guncelleyen: null, guncelleme: null, tasima: { kaynakRevizyonId: 40, eslesen: 3, eslesmeyen: 1 },
      isaretler: [{ yuzSira: 1, islem: BOYA, oneri: true, rotadaVar: true }, { yuzSira: 3, islem: { tur: 'maske' }, oneri: true, rotadaVar: true }],
    };
    const istekler = sunucuKur(temel(() => json(200, tasinan), undefined, { 'POST /geometri/yuzey/41/kaydet': () => json(200, { ...YUZEY, surum: 1 }) }));
    ac();
    const k = await kart();
    expect(await within(k).findByText(/3 yüz eşleşti, 1 yüz eşleşmedi/)).toBeTruthy();
    expect(within(k).getByRole('button', { name: /Maske resmi/ }).hasAttribute('disabled')).toBe(true);
    expect(within(k).getByText('Henüz kaydedilmedi.')).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: /Tümünü onayla/ }));
    expect(within(k).getByText(/Taşınan öneriler onaylandı/)).toBeTruthy();
    expect(within(k).getByRole('button', { name: /Maske resmi/ }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(kaydetDugmesi(k));
    await waitFor(() => expect(istekler.some((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')).toBe(true));
    expect(istekler.find((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')?.govde).toEqual({
      surum: null,
      isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false }, { yuzSira: 3, islem: { tur: 'maske' }, oneri: false }],
    });
  });

  it('rotada adım yoksa yalnız maske atanır; rotadan kalkan adımın işareti uyarıyla durur', async () => {
    sunucuKur(temel(() => json(200, { ...YUZEY, rota: { durum: 'bagli', adimlar: [] }, isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false, rotadaVar: false }] })));
    ac();
    const k = await kart();
    expect(await within(k).findByText(/Önce rotaya adım ekleyin/)).toBeTruthy();
    expect(within(k).getAllByText('Adım 40 (rotada yok)')).not.toHaveLength(0);
    const secenekler = within(within(k).getByLabelText('Atanacak işlem')).getAllByRole('option').map((o) => o.textContent);
    expect(secenekler).toEqual(['Maske', 'İşlemi kaldır']);
  });

  it('görüntünün yüz sırası doğrulanmazsa modelde boyama ve tıklama kapalı, seçim tablodan sürer', async () => {
    sahte.durum = 'uyusmuyor';
    sunucuKur(temel(() => json(200, YUZEY)));
    ac();
    const k = await kart();
    expect(await screen.findByText(/yüz sırası hesapla doğrulanamadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yüz seç/ })).toBeNull();
    expect(within(k).getByRole('button', { name: /Maske resmi/ }).hasAttribute('disabled')).toBe(true);
    expect(within(k).getByLabelText('Yüz 2')).toBeTruthy();
  });

  it('analiz yok, yüz yok ve yetkisiz okuma iletileri', async () => {
    sunucuKur(temel(() => json(200, { ...YUZEY, neden: 'analiz-yok', yuzler: [], isaretler: [], alanlar: [] })));
    ac();
    expect(await within(await kart()).findByText('Analiz bitince modelin yüzleri burada seçilebilir.')).toBeTruthy();
    cleanup();
    sunucuKur(temel(() => json(200, { ...YUZEY, neden: 'yuz-yok', yuzler: [], isaretler: [], alanlar: [] })));
    ac();
    expect(await within(await kart()).findByText(/Bu modelin yüzleri okunamadı/)).toBeTruthy();
    cleanup();
    sunucuKur(temel(() => json(403, { kod: 'YETKISIZ', mesaj: 'Yetkiniz yok.' })));
    ac();
    expect(await within(await kart()).findByText('Yüzey işaretleri için yetkiniz yok.')).toBeTruthy();
  });
});
