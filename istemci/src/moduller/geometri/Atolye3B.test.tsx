import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TUM_IKINCI_MENU_TANIMLARI } from '../../ortak/rota/ikinci-menu.ts';
import type { GeometriAnalizCevabi, GeometriHamCevabi, GeometriModelListeCevabi, GeometriOzellik, GeometriOzellikCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { CALISMA_ADLARI, CALISMALAR, calismaYolu } from './calismalar.ts';
import { rotalar } from './rotalar.tsx';

const kurulum = vi.hoisted(() => ({ sayi: 0 }));
vi.mock('./Goruntu3B.tsx', async () => {
  const { useEffect: etki } = await import('react');
  return {
    default: function Sahte({ vurgu, onizleme }: { vurgu?: { capMm: number; konum: readonly number[] } | null; onizleme?: { etiket: string; delikler: readonly unknown[] } | null }) {
      // Görüntünün kaç kez kurulduğu: çalışma değişince yeniden kurulmamalı (2396).
      etki(() => { kurulum.sayi += 1; }, []);
      return (
        <>
          <div>görüntü</div>
          {vurgu ? <div>{`vurgu Ø${String(vurgu.capMm)} @ ${vurgu.konum.join(',')}`}</div> : null}
          {onizleme ? <div>{`önizleme: ${onizleme.etiket}`}</div> : null}
        </>
      );
    },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); kurulum.sayi = 0; });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown; basliklar: Record<string, string> }

const oturum = (islemler: string[]) => () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler } });
const TUM_ISLEMLER = ['sayfa.geometri', 'geometri.oku', 'geometri.hesapla', 'geometri.yuzey-yaz'];

// Oturum verilmezse kişi 3D Atölyesi'nin bütün işlemlerine sahiptir; yetki testi kendi oturumunu verir.
function sunucuKur(verilen: Record<string, (govde: unknown, yol: string) => Response>) {
  const yollar: Record<string, (govde: unknown, yol: string) => Response> = { 'GET /oturum': oturum(TUM_ISLEMLER), ...verilen };
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde, basliklar: Object.fromEntries(new Headers(secenek?.headers).entries()) });
    const isle = yollar[`${yontem} ${yol}`] ?? yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde, yol) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

const GEOMETRI_IKINCI_MENU = TUM_IKINCI_MENU_TANIMLARI.find((t) => t.kok === '/geometri')!;

// Kabuğun ikinci menüsü gibi: bağlantı yalnız maddenin yolunu açar, sorgu taşımaz.
function AltMenu() {
  return <nav aria-label="Alt menü">{GEOMETRI_IKINCI_MENU.gruplar.flatMap((g) => g.maddeler).map((m) => <Link key={m.anahtar} to={m.yol}>{m.baslik}</Link>)}</nav>;
}
const adresIzi = { son: '' };
function Adres() {
  const { pathname, search } = useLocation();
  useEffect(() => { adresIzi.son = `${pathname}${search}`; }, [pathname, search]);
  return null;
}

function ac(adres = '/geometri') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
          <AltMenu />
          <Adres />
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [
    { malzemeNo: 7, malzemeKodu: 'MLZ-0007', malzemeAdi: 'Deneme mil', belgeId: 3, belgeAdi: 'Model mil.step', revizyonId: 41, harf: 'B', revKodu: '03', dosyaTuru: 'step', durum: 'bitti', hataMetni: null },
    { malzemeNo: 8, malzemeKodu: 'MLZ-0008', malzemeAdi: null, belgeId: 4, belgeAdi: 'Model flanş.step', revizyonId: 42, harf: 'A', revKodu: null, dosyaTuru: 'step', durum: 'hata', hataMetni: 'Model okunamadı.' },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ: GeometriAnalizCevabi = {
  revizyonId: 41, belgeId: 3, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-10-31T20:00:00+03:00', baslama: '2026-10-31T20:00:01+03:00', bitis: '2026-10-31T20:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 40, y: 20, z: 10 }, obb: { a: 40, b: 20, c: 10, cap: 22.3607, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 8000, alanMm2: 2800, govdeSayisi: 1, kapali: true, ucgenSayisi: 12, hesapSuresiMs: 200, hesapZamani: '2026-10-31T20:00:02+03:00',
    yuzler: null,
  },
};
const HAM: GeometriHamCevabi = {
  revizyonId: 41, payMm: 2, payKaynagi: 'istek', enAz: { a: 44, b: 24, c: 14 }, kaliteler: ['C45', 'S235'], neden: null,
  oneriler: [{ malzemeNo: 9, kod: 'HM-0009', ad: 'Çubuk Ø25', kalite: 'C45', form: 'cubuk', olcu: { d: 25, l: 3000 }, aile: 'metal', kaliteKodu: 'C45', yogunluk: null, kesimBoyuMm: 44, hamHacimMm3: 21598.4 }],
};
const HAM_AYAR: GeometriHamCevabi = { ...HAM, payMm: 3, payKaynagi: 'ayar', enAz: { a: 46, b: 26, c: 16 } };
const oz = (o: Partial<GeometriOzellik> & Pick<GeometriOzellik, 'sira' | 'tur'>): GeometriOzellik => ({
  ust: null, capMm: null, yaricapMm: null, derinlikMm: null, aciDerece: null, genislikMm: null, boyMm: null, gecis: null, dip: null, ic: null,
  eksen: null, konum: null, yuzler: [1], ...o,
});
const OZELLIK: GeometriOzellikCevabi = {
  revizyonId: 41, motor: 'libcascade@3.1.0',
  ozellikler: [
    oz({ sira: 1, tur: 'delik', capMm: 10, derinlikMm: 20, gecis: true, eksen: [0, 0, -1], konum: [15, 15, 20] }),
    oz({ sira: 2, tur: 'havsa', ust: 1, capMm: 16, aciDerece: 90, derinlikMm: 3 }),
    oz({ sira: 3, tur: 'delik', capMm: 6, derinlikMm: 8, gecis: false, dip: 'matkap', aciDerece: 118, eksen: [0, 0, -1], konum: [40, 24, 20] }),
    oz({ sira: 4, tur: 'delik', capMm: 8, derinlikMm: 60, gecis: true, eksen: [1, 0, 0], konum: [0, 15, 8] }),
    oz({ sira: 5, tur: 'kademe', ust: 4, capMm: 11, derinlikMm: 4 }),
    oz({ sira: 6, tur: 'pah', genislikMm: 2.1213, aciDerece: 45, boyMm: 20 }),
    oz({ sira: 7, tur: 'radyus', yaricapMm: 2, ic: false, boyMm: 20 }),
  ],
};
const DOSYA = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe('3D Atölyesi', () => {
  it('listeyi durumlarıyla gösterir; seçilen modelin analizi ve ham önerisi gelir', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ham-onerisi/41': (_g, yol) => json(200, yol.includes('payMm') ? HAM : HAM_AYAR),
    });
    ac();
    expect(await screen.findByText('MLZ-0007')).toBeTruthy();
    expect(screen.getAllByText('Hesaplandı').length).toBeGreaterThan(0);
    expect(screen.getByText('Model flanş.step')).toBeTruthy();
    // Aynı malzemede birden çok model ayırt edilsin: malzeme adı varken belge adı da satırda.
    // 2138-2: merkezin harfi değil revizyon kodu; kodsuz modelde harf yazılmaz.
    expect(screen.getByText('Rev 03 · STEP · Model mil.step')).toBeTruthy();
    expect(screen.getByText('Kodsuz revizyon · STEP')).toBeTruthy();
    expect(screen.getByText(/STL, GLB ve GLTF yüzey ağıdır/)).toBeTruthy();
    expect(screen.getByText('Soldan bir model seçin.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /MLZ-0007/ }));
    expect(await screen.findAllByText('40 x 20 x 10 mm')).toHaveLength(2);
    expect(screen.getByText('8.000 mm³')).toBeTruthy();
    expect(screen.getByText('Ø 22,4 x 40 mm')).toBeTruthy();
    expect(await screen.findByText('görüntü')).toBeTruthy();
    expect(screen.getByText('önizleme: dış kutu ve döndürülmüş kutu')).toBeTruthy();
    // Ham önerisi kendi alt menüsündedir; Analiz sayfası ham okumaz.
    expect(screen.queryByLabelText(/İşleme payı/)).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Ham önerisi' }));
    expect(await screen.findByText('46 x 26 x 16 mm')).toBeTruthy();
    expect(screen.getByText('Boş bırakılırsa sistem ayarı: 3 mm')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/İşleme payı/), { target: { value: '2' } });
    expect(await screen.findByText('44 x 24 x 14 mm')).toBeTruthy();
    expect(screen.getByText('Ø 25 x 3.000 mm')).toBeTruthy();
    expect(screen.getByText('Kesim boyu 44 mm')).toBeTruthy();
    // Önizleme ilk öneridir; başka satır seçilince o önizlenir.
    expect(await screen.findByText(/^önizleme: Yuvarlak çubuk Ø 25 x 3.000 mm/)).toBeTruthy();
    expect(screen.getByText(/pay her yüzde eşit varsayılır/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kalite'), { target: { value: 'C45' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/geometri/ham-onerisi/41?payMm=2&kalite=C45')).toBe(true));
    expect(istekler.some((i) => i.yol === '/geometri/ham-onerisi/41')).toBe(true);
    // 1480: yoğunluk boşken önerinin kalitesinden (C45, Malzemeler tablosu 7,85); 1446 a: yazılan geçerlidir.
    expect(await screen.findByText('Boş bırakılırsa C45 kalitesinin yoğunluğu: 7,85 g/cm³', undefined, { timeout: 15000 })).toBeTruthy();
    expect(screen.getByText('≈ 0,063 kg')).toBeTruthy();
    expect(screen.getByText('Ham ağırlık ≈ 0,17 kg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Yoğunluk/), { target: { value: '2,7' } });
    expect(await screen.findByText('≈ 0,022 kg')).toBeTruthy();
    expect(screen.getByText('Ham ağırlık ≈ 0,058 kg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Yoğunluk/), { target: { value: '-1' } });
    expect(await screen.findByText('Pozitif bir sayı yazın.')).toBeTruthy();
  });

  it('2138-2: seçili model başlığı revizyon kodunu yazar; kodsuz modelde harf değil "Kodsuz revizyon"', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/analizler/42': () => json(200, { ...ANALIZ, revizyonId: 42 }),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/modeller/42/dosya': DOSYA,
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /MLZ-0007/ }));
    expect(await screen.findByText('Rev 03 · Model mil.step')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /MLZ-0008/ }));
    expect(await screen.findByText('Kodsuz revizyon · Model flanş.step')).toBeTruthy();
    expect(screen.queryByText(/Rev [AB]\b/)).toBeNull();
  });

  it('yeniden hesapla okunan sürümle ve istek kimliğiyle gider; kuyruğa alınınca durum değişir', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'POST /geometri/analizler/41/yeniden-hesapla': () => json(200, { ...ANALIZ, durum: 'bekliyor', is: { ...ANALIZ.is!, durum: 'bekliyor', surum: 4 } }),
    });
    ac('/geometri?rev=41');
    fireEvent.click(await screen.findByRole('button', { name: /Yeniden hesapla/ }));
    expect(await screen.findByText('Kuyrukta')).toBeTruthy();
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.govde).toEqual({ surum: 3 });
    expect(post?.basliklar['istek-kimligi']).toBeTruthy();
  });

  it('3030: "Yeniden hesapla" yalnız geometri.hesapla işlemi olana görünür; okuyan ölçüleri görür, düğmeyi görmez', async () => {
    sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku']),
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
    });
    ac('/geometri?rev=41');
    expect(await screen.findByText('Analiz (yaklaşık)')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Hacim')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Yeniden hesapla/ })).toBeNull();
  });

  it('GEO-1: ikinci "Yeniden hesapla" yeni kimlikle gider; çift tık tek istek', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'POST /geometri/analizler/41/yeniden-hesapla': () => json(200, ANALIZ),
    });
    ac('/geometri?rev=41');
    const dugme = await screen.findByRole('button', { name: /Yeniden hesapla/ });
    fireEvent.click(dugme);
    fireEvent.click(dugme);
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeniden hesapla/ }).hasAttribute('disabled')).toBe(false));
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Yeniden hesapla/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
    const [ilk, ikinci] = istekler.filter((i) => i.yontem === 'POST').map((i) => i.basliklar['istek-kimligi']);
    expect(ikinci).toBeTruthy();
    expect(ikinci).not.toBe(ilk);
  });

  it('yayından düşen revizyon bağlantısı aynı belgenin yayındaki revizyonuna gider; bulunamazsa açıklar', async () => {
    const istekler = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/40': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' }),
      'GET /geometri/modeller/40/dosya': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' }),
      'GET /geometri/modeller/40/guncel': () => json(200, { revizyonId: 41 }),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/analizler/39': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' }),
      'GET /geometri/modeller/39/dosya': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Yok.' }),
      'GET /geometri/modeller/39/guncel': () => json(200, { revizyonId: null }),
    });
    ac('/geometri?rev=40');
    expect(await screen.findByText(/aynı belgenin yayındaki revizyonu açıldı/)).toBeTruthy();
    expect(await screen.findByText('8.000 mm³')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/geometri/analizler/41')).toBe(true);
    cleanup();
    ac('/geometri?rev=39');
    expect(await screen.findByText(/Bu model artık listede değil/)).toBeTruthy();
  });

  it('yetkisiz kullanıcıya yetki iletisi, boş listede yol gösteren ileti', async () => {
    sunucuKur({ 'GET /geometri/modeller': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    ac();
    expect(await screen.findByText('3D Atölyesi için yetkiniz yok.')).toBeTruthy();
    cleanup();
    sunucuKur({ 'GET /geometri/modeller': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 }) });
    ac();
    expect(await screen.findByText(/3B modeli olan malzeme yok/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'yok' } });
    expect(await screen.findByText('Aramaya ya da süzgece uyan model yok.')).toBeTruthy();
    expect(screen.queryByText(/3B modeli olan malzeme yok/)).toBeNull();
  });

  it('hesaplanamayan modelde hata metni ve kapalı olmayan modelde hacim yerine açıklama', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, {
        ...ANALIZ, durum: 'hata', is: { ...ANALIZ.is!, durum: 'hata', hataMetni: 'Hesap 120 saniyede bitmedi.' },
        analiz: { ...ANALIZ.analiz!, kapali: false, hacimMm3: null },
      }),
      'GET /geometri/modeller/41/dosya': DOSYA,
    });
    ac('/geometri?rev=41');
    expect(await screen.findByText('Hesap 120 saniyede bitmedi.')).toBeTruthy();
    expect(screen.getByText('Model kapalı değil, hesaplanamadı')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeniden hesapla/ }).hasAttribute('disabled')).toBe(false));
  });
  it('2044-2: özellikler kartı delikleri bağlı havşa ve kademeyle, pah ve radyüsü listeler; delik satırı modelde vurgulanır, ikinci dokunuş kaldırır', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ozellikler/41': () => json(200, OZELLIK),
    });
    ac('/geometri/ozellikler?rev=41');
    expect(await screen.findByText('Özellikler (öneri)')).toBeTruthy();
    // Önizleme: konumu olan bütün delikler.
    expect(await screen.findByText(/^önizleme: \d+ delik$/)).toBeTruthy();
    expect(await screen.findByText('5 özellik')).toBeTruthy();
    expect(screen.getByText('3 delik')).toBeTruthy();
    expect(screen.getByText('Ø10 geçiş · 20 mm')).toBeTruthy();
    expect(screen.getByText('Havşa Ø16 x 90°')).toBeTruthy();
    expect(screen.getByText('Ø6 kör · 8 mm')).toBeTruthy();
    expect(screen.getByText('Üst yüz (Z) · matkap ucu 118°')).toBeTruthy();
    expect(screen.getByText('Yan yüz (X)')).toBeTruthy();
    expect(screen.getByText('Kademe Ø11 x 4 mm')).toBeTruthy();
    expect(screen.getByText('Pah 1,5 x 45°')).toBeTruthy();
    expect(screen.getByText('R2 dış kenar')).toBeTruthy();
    const satir = screen.getByRole('button', { name: /Ø10 geçiş/ });
    expect(satir.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(satir);
    expect(await screen.findByText('vurgu Ø10 @ 15,15,20')).toBeTruthy();
    expect(satir.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(satir);
    await waitFor(() => expect(screen.queryByText(/^vurgu/)).toBeNull());
    // Pah ve radyüsün konumu yok: seçilemez (düğme değildir).
    expect(screen.queryByRole('button', { name: /Pah/ })).toBeNull();
  });

  it('2044-2: yüzler okunamadıysa ve özellik yoksa ayrı ileti; hesap sürerken özellik okunmaz', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ozellikler/41': () => json(200, { revizyonId: 41, motor: null, ozellikler: null }),
    });
    ac('/geometri/ozellikler?rev=41');
    expect(await screen.findByText(/yüzleri okunamadı; özellik tanınamadı/)).toBeTruthy();
    cleanup();
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ozellikler/41': () => json(200, { revizyonId: 41, motor: 'libcascade@3.1.0', ozellikler: [] }),
    });
    ac('/geometri/ozellikler?rev=41');
    expect(await screen.findByText('Tanınan delik, pah ya da radyüs yok.')).toBeTruthy();
    cleanup();
    const ikinci = sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/42': () => json(200, { ...ANALIZ, revizyonId: 42, durum: 'calisiyor' }),
      'GET /geometri/modeller/42/dosya': DOSYA,
    });
    ac('/geometri/ozellikler?rev=42');
    // Özellikler ve montaj kartı (2113) hesap bitene kadar bekler.
    expect(await screen.findAllByText('Hesap sürüyor; sonuç gelince burada görünür.')).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: 'Montaj' }));
    expect(await screen.findAllByText('Hesap sürüyor; sonuç gelince burada görünür.')).toHaveLength(1);
    expect(ikinci.some((i) => i.yol.startsWith('/geometri/ozellikler') || i.yol.startsWith('/geometri/montaj'))).toBe(false);
  });

  it('2396: ikinci menü maddeleri çalışma listesiyle aynı sırada, hepsi sayfa.geometri', () => {
    const maddeler = GEOMETRI_IKINCI_MENU.gruplar.flatMap((g) => g.maddeler);
    expect(maddeler.map((m) => m.yol)).toEqual(CALISMA_ADLARI.map(calismaYolu));
    expect(maddeler.map((m) => m.baslik)).toEqual(CALISMA_ADLARI.map((a) => CALISMALAR[a].baslik));
    expect(new Set(maddeler.map((m) => m.islem))).toEqual(new Set(['sayfa.geometri']));
  });

  it('2396: alt menü geçişinde seçili model korunur, görüntü yeniden kurulmaz; tanınmayan çalışma köke döner', async () => {
    sunucuKur({
      'GET /geometri/modeller': () => json(200, LISTE),
      'GET /geometri/analizler/41': () => json(200, ANALIZ),
      'GET /geometri/modeller/41/dosya': DOSYA,
      'GET /geometri/ozellikler/41': () => json(200, OZELLIK),
      'GET /geometri/montaj/41': () => json(200, { revizyonId: 41, neden: 'montaj-yok', dugumler: null, bilesenler: [] }),
    });
    ac('/geometri?rev=41');
    expect(await screen.findByText('8.000 mm³')).toBeTruthy();
    await screen.findByText('görüntü');
    expect(kurulum.sayi).toBe(1);
    fireEvent.click(screen.getByRole('link', { name: 'Montaj' }));
    await waitFor(() => expect(adresIzi.son).toBe('/geometri/montaj?rev=41'));
    fireEvent.click(screen.getByRole('link', { name: 'Özellikler' }));
    expect(await screen.findByText('Özellikler (öneri)')).toBeTruthy();
    expect(adresIzi.son).toBe('/geometri/ozellikler?rev=41');
    expect(screen.queryByText('8.000 mm³')).toBeNull();
    expect(kurulum.sayi).toBe(1);
    cleanup();
    sessionStorage.clear();
    sunucuKur({ 'GET /geometri/modeller': () => json(200, LISTE) });
    ac('/geometri/yok?rev=41');
    await waitFor(() => expect(adresIzi.son).toBe('/geometri?rev=41'));
  });
});
