import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriAnalizCevabi, GeometriModelListeCevabi, GeometriOzellikCevabi, GeometriYuzeyCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { ResimAl, YuzBoyasi, YuzDurumu } from './Goruntu3B.tsx';
import { rotalar } from './rotalar.tsx';

// Boya ve maske kartı (2144, prototip v3): fırça ile modelde boyama, hızlı başla, yüz grupları, geri al, hesap (şartnameden kalınlık ve
// yoğunluk, 2144-3 b), kayıt, çakışma, yalnız okuma, önceki revizyondan öneri, rota yok ve görüntünün yüz sırası denetimi. Görüntü
// sahtedir: denetim sonucunu ve yüz normallerini verir, renkleri yazar, modelde tıklamayı düğmeyle taklit eder.
const sahte = vi.hoisted(() => ({ durum: 'hazir' as YuzDurumu }));
const NORMALLER = [[0, 0, 1], [0, 0, -1], null, null] as const;
vi.mock('./Goruntu3B.tsx', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({ yuzBoyasi, arac, bilgi, resimAlici }: { yuzBoyasi?: YuzBoyasi | null; arac?: React.ReactNode; bilgi?: string | null; resimAlici?: (al: ResimAl | null) => void }) => {
      const durumYaz = yuzBoyasi?.durumYaz;
      useEffect(() => { durumYaz?.(sahte.durum, sahte.durum === 'hazir' ? [...NORMALLER] : null); }, [durumYaz]);
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
        <MemoryRouter initialEntries={['/geometri/yuzey?rev=41']}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [{ malzemeNo: 7, malzemeKodu: 'MLZ-0007', malzemeAdi: 'Deneme flanş', belgeId: 3, belgeAdi: 'Model flans.step', revizyonId: 41, harf: 'B', revKodu: '03', dosyaTuru: 'step', durum: 'bitti', hataMetni: null }],
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
    adimlar: [{
      opNo: 40, adimAdi: 'Boya', fason: true, talimatVar: true, sartname: { id: 5, kod: 'BYA-TOZ', ad: 'Toz boya', kategoriKodu: 'BYA' },
      parametreler: [
        { anahtar: 'renk', ad: 'Renk', birim: null, deger: 'RAL 9005' }, { anahtar: 'kalinlik', ad: 'Kalınlık', birim: 'µm', deger: 70 },
        { anahtar: 'toz', ad: 'Toz yoğunluğu', birim: 'g/cm³', deger: '1,5' },
      ],
    }],
  },
  isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false, rotadaVar: true }],
  alanlar: [{ islem: BOYA, yuzSayisi: 1, alanMm2: 800, oneriVar: false }],
  isaretsizMm2: 1700, toplamMm2: 2500,
  surum: 2, guncelleyen: { id: 9, ad: 'Deneme Kişi' }, guncelleme: '2026-11-05T14:10:00+03:00', tasima: null,
};
const OZELLIK: GeometriOzellikCevabi = {
  revizyonId: 41, motor: 'libcascade@3.1.0',
  ozellikler: [{
    sira: 1, tur: 'delik', ust: null, capMm: 8, yaricapMm: null, derinlikMm: 10, aciDerece: null, genislikMm: null, boyMm: null, gecis: true, dip: null, ic: null,
    eksen: [0, 0, -1], konum: [20, 10, 10], yuzler: [3],
  }],
};
const temel = (yuzey: () => Response, islemler: string[] = ['geometri.oku', 'geometri.yuzey-yaz'], ek: Record<string, () => Response> = {}) => ({
  'GET /geometri/modeller?sayfa=1': () => json(200, LISTE),
  'GET /geometri/analizler/41': () => json(200, ANALIZ),
  'GET /geometri/modeller/41/dosya': () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  'GET /geometri/yuzey/41': yuzey,
  'GET /geometri/ozellikler/41': () => json(200, OZELLIK),
  'GET /oturum': () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler } }),
  ...ek,
});
const kart = async () => {
  const baslik = await screen.findByRole('heading', { name: 'Boya ve maske' });
  return baslik.closest('section') as HTMLElement;
};
const kaydetDugmesi = (k: HTMLElement) => within(k).getByRole('button', { name: /^Kaydet/ });
const firca = (ad: RegExp) => within(screen.getByRole('group', { name: 'Fırça' })).getByRole('button', { name: ad });

describe('3D Atölyesi boya ve maske kartı (2144, prototip v3)', () => {
  it('fırça modelde tıklanan yüzü boyar, aynı yüze yeniden dokunmak kaldırır; hızlı başla, geri al ve Kaydet bütün işaretleri sürümle gönderir', async () => {
    const istekler = sunucuKur(temel(() => json(200, YUZEY), undefined, {
      'POST /geometri/yuzey/41/kaydet': () => json(200, { ...YUZEY, surum: 3 }),
    }));
    ac();
    const k = await kart();
    expect(await within(k).findByText('Son kayıt: 05.11.2026 14:10, Deneme Kişi')).toBeTruthy();
    // 2138-2: sayfada merkezin harfi değil revizyon kodu görünür.
    expect(document.body.textContent?.match(/Rev [^ ·]+/g)).toEqual(['Rev 03']);
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
    expect(await screen.findByText(/Fırça: Adım 40 · Toz boya\. Modelde yüze tıklayın/)).toBeTruthy();
    expect(kaydetDugmesi(k).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'modelde yüz 4' }));
    expect(await screen.findByText('renk 1=--grafik 4=--grafik')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'modelde yüz 4' }));
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
    // Delikler Özellikler'den: tek Ø8 delik, tapa ile.
    expect(within(k).getByText('1 delik: Ø8 × 1 (tapa)')).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: /Delikleri maskele/ }));
    expect(await screen.findByText('renk 1=--grafik 3=--sahne3b-tarama')).toBeTruthy();
    expect(within(k).getByText('1 tapa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Geri al/ }));
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
    // Gruba dokunmak seçili fırçayı uygular.
    fireEvent.click(firca(/Maske/));
    expect(firca(/Maske/).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(k).getByRole('button', { name: 'Delik Ø8: Maske' }));
    expect(within(k).getByText('Kaydedilmemiş değişiklik var.')).toBeTruthy();
    fireEvent.click(kaydetDugmesi(k));
    expect(await screen.findByText('Yüzey işaretleri kaydedildi.')).toBeTruthy();
    expect(istekler.find((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')?.govde).toEqual({
      surum: 2,
      isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false }, { yuzSira: 3, islem: { tur: 'maske' }, oneri: false }],
    });
  });

  it('2138-2: listeden seçilen modelde kart rozeti revizyon kodunu yazar, merkezin harfini değil', async () => {
    sunucuKur(temel(() => json(200, YUZEY)));
    ac();
    await kart();
    fireEvent.click(await screen.findByRole('button', { name: /MLZ-0007/ }));
    const k = await kart();
    expect(await within(k).findByText('Rev 03')).toBeTruthy();
    expect(within(k).queryByText(/Rev B/)).toBeNull();
  });

  it('gruplar yönden: üst ve alt (oturma) yüz ayrı; Oturma yüzünü maskele alt yüzü maskeler, Hepsini temizle hepsini kaldırır', async () => {
    sunucuKur(temel(() => json(200, YUZEY)));
    ac();
    const k = await kart();
    const gruplar = () => within(within(k).getByRole('region', { name: 'Yüz grupları' }).querySelector('ul') as HTMLElement).getAllByRole('listitem').map((l) => l.querySelector('strong')?.textContent);
    await waitFor(() => expect(gruplar()).toEqual(['Delik Ø8', 'Dış silindir', 'Üst yüz', 'Alt yüz (oturma)']));
    fireEvent.click(await within(k).findByRole('button', { name: /Oturma yüzünü maskele/ }));
    expect(await screen.findByText('renk 1=--grafik 2=--sahne3b-tarama')).toBeTruthy();
    expect(within(k).getByText(/1 bant yüzü/)).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: /Hepsini temizle/ }));
    expect(await screen.findByText('renk')).toBeTruthy();
    expect(within(k).getByText('4 yüz')).toBeTruthy();
  });

  it('hesap: kalınlık ve yoğunluk şartnameden gelir, verim yazılınca toz miktarı çıkar; adet alanı çarpar', async () => {
    sunucuKur(temel(() => json(200, YUZEY)));
    ac();
    const k = await kart();
    const kalinlik = await within(k).findByLabelText<HTMLInputElement>('Kalınlık (µm)');
    expect(kalinlik.value).toBe('70');
    expect(within(k).getByLabelText<HTMLInputElement>('Toz yoğunluğu (g/cm³)').value).toBe('1,5');
    expect(within(k).getAllByText('Şartnameden (BYA-TOZ)')).toHaveLength(2);
    expect(within(k).getByText('Toz miktarı için kalınlık, yoğunluk ve verimi yazın')).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: /Tamamını boya/ }));
    fireEvent.change(within(k).getByLabelText('Verim (%)'), { target: { value: '60' } });
    fireEvent.change(within(k).getByLabelText('Adet (parti)'), { target: { value: '1000' } });
    // 2500 mm² x 1000 adet = 2,5 m²; 2,5 x 70 x 1,5 / 1000 / 0,6 = 0,4375 kg.
    expect(within(k).getByText('2,5 m²')).toBeTruthy();
    expect(within(k).getByText('Toz ≈ 0,44 kg')).toBeTruthy();
    fireEvent.change(kalinlik, { target: { value: '' } });
    expect(within(k).getByText('Toz miktarı için kalınlık, yoğunluk ve verimi yazın')).toBeTruthy();
  });

  it('başkası değiştirdiyse (409) kaydedilmez, şerit çıkar; Günceli oku taslağı bırakıp yeniden okur', async () => {
    const istekler = sunucuKur(temel(() => json(200, YUZEY), undefined, {
      'POST /geometri/yuzey/41/kaydet': () => json(409, { kod: 'ESKI_SURUM', mesaj: 'Kayıt değişmiş.' }),
    }));
    ac();
    const k = await kart();
    fireEvent.click(await within(k).findByRole('button', { name: 'Dış silindir: Toz boya' }));
    fireEvent.click(kaydetDugmesi(k));
    expect(await within(k).findByText(/başka biri tarafından değiştirildi/)).toBeTruthy();
    expect(kaydetDugmesi(k).hasAttribute('disabled')).toBe(true);
    const once = istekler.filter((i) => i.anahtar === 'GET /geometri/yuzey/41').length;
    fireEvent.click(within(k).getByRole('button', { name: /Günceli oku/ }));
    await waitFor(() => expect(istekler.filter((i) => i.anahtar === 'GET /geometri/yuzey/41').length).toBe(once + 1));
    expect(within(k).queryByText(/başka biri tarafından değiştirildi/)).toBeNull();
    expect(await within(k).findByText('Son kayıt: 05.11.2026 14:10, Deneme Kişi')).toBeTruthy();
  });

  it('yalnız okuma: geometri.yuzey-yaz yoksa fırça, hızlı başla ve Kaydet yok; işaretler görünür', async () => {
    sunucuKur(temel(() => json(200, YUZEY), ['geometri.oku']));
    ac();
    const k = await kart();
    expect(await within(k).findByText(/Yalnız okuma: işaretleri değiştirme yetkiniz yok/)).toBeTruthy();
    expect(within(k).queryByRole('button', { name: /^Kaydet/ })).toBeNull();
    expect(within(k).queryByRole('button', { name: /Tamamını boya/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Fırça' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'modelde yüz 4' })).toBeNull();
    expect(await screen.findByText('renk 1=--grafik')).toBeTruthy();
  });

  it('önceki revizyondan öneri: şerit sayıları söyler, maske resmi onaya kadar kapalı; Onayla ilk kaydı sürümsüz açar', async () => {
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
    fireEvent.click(within(k).getByRole('button', { name: /^Onayla/ }));
    expect(within(k).getByText(/Getirilen öneriler onaylandı/)).toBeTruthy();
    expect(within(k).getByRole('button', { name: /Maske resmi/ }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(kaydetDugmesi(k));
    await waitFor(() => expect(istekler.some((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')).toBe(true));
    expect(istekler.find((i) => i.anahtar === 'POST /geometri/yuzey/41/kaydet')?.govde).toEqual({
      surum: null,
      isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false }, { yuzSira: 3, islem: { tur: 'maske' }, oneri: false }],
    });
  });

  it('rotada adım yoksa fırça yalnız maske ve silgidir; rotadan kalkan adımın işareti hesapta uyarıyla durur', async () => {
    sunucuKur(temel(() => json(200, { ...YUZEY, rota: { durum: 'bagli', adimlar: [] }, isaretler: [{ yuzSira: 1, islem: BOYA, oneri: false, rotadaVar: false }] })));
    ac();
    const k = await kart();
    expect(await within(k).findByText(/Önce rotaya adım ekleyin/)).toBeTruthy();
    expect(within(k).getAllByText('Adım 40 (rotada yok)')).not.toHaveLength(0);
    const fircalar = within(await screen.findByRole('group', { name: 'Fırça' })).getAllByRole('button').map((b) => b.textContent);
    expect(fircalar).toEqual(['Maske', 'Silgi']);
    expect(within(k).getByRole('button', { name: /Tamamını boya/ }).hasAttribute('disabled')).toBe(true);
  });

  it('görüntünün yüz sırası doğrulanmazsa modelde boyama ve tıklama kapalı; düzlemler tek grup, boyama gruplardan ve listeden sürer', async () => {
    sahte.durum = 'uyusmuyor';
    sunucuKur(temel(() => json(200, YUZEY)));
    ac();
    const k = await kart();
    expect(await screen.findByText(/yüz sırası hesapla doğrulanamadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'modelde yüz 4' })).toBeNull();
    expect(within(k).getByRole('button', { name: /Maske resmi/ }).hasAttribute('disabled')).toBe(true);
    expect(within(k).getByText('Düzlem × 2')).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: 'Yüz 2: Toz boya' }));
    expect(within(k).getByText('Kaydedilmemiş değişiklik var.')).toBeTruthy();
  });

  it('analiz yok, yüz yok ve yetkisiz okuma iletileri', async () => {
    sunucuKur(temel(() => json(200, { ...YUZEY, neden: 'analiz-yok', yuzler: [], isaretler: [], alanlar: [] })));
    ac();
    expect(await within(await kart()).findByText('Analiz bitince modelin yüzleri burada boyanabilir.')).toBeTruthy();
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
