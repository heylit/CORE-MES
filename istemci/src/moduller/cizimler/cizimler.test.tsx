import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BelgeAyrintisi, BelgeListesiCevabi, BelgeSatiri } from '#paylasilan/sozlesme/cizimler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Belgeler } from './Belgeler.tsx';
import { BelgeSayfasi } from './BelgeSayfasi.tsx';
import { base64Yaz, dosyaYukle, PARCA_BAYT, sha256Yazilim } from './dosya-aktarimi.ts';
import { Box3, Color, Vector3 } from 'three';
import { modelOku } from './goruntu/model.ts';
import { IZINLI_DOSYA_TURLERI, dosyaTuruBul, gorunumTuru, kabulMetni, modelBicimi } from './gosterim.ts';
import { COZUNURLUKLER, KARE_BAYT_SINIRI, KARE_SAYISI, OnizlemeAtlandi, kareAcisi, sinirdaKareler } from './onizleme-kurallari.ts';

// Çizim (three, occt) tarayıcı ister; üretimin kendisi taklit edilir, akış gerçektir.
const { onizlemeKareleri } = vi.hoisted(() => ({ onizlemeKareleri: vi.fn() }));
vi.mock('./goruntu/onizleme.ts', () => ({ onizlemeKareleri }));

// Görüntüleyici (pdf.js, three, occt) tarayıcı ister; ekran testinde yer tutucuyla değişir.
vi.mock('./goruntu/Goruntuleyici.tsx', () => ({ default: ({ revizyonId }: { revizyonId: number }) => <p>Görüntü {revizyonId}</p> }));

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Teknik', islemler: ['sayfa.cizimler', 'cizimler.oku', 'cizimler.yaz'] };
const YAYINCI: Kullanici = { id: 2, ad: 'Deneme Şef', islemler: ['sayfa.cizimler', 'cizimler.oku', 'cizimler.yaz', 'cizimler.yayinla'] };
const OKUR: Kullanici = { id: 3, ad: 'Deneme Operatör', islemler: ['sayfa.cizimler'] };

const SATIR: BelgeSatiri = {
  id: 7, ad: 'Deneme flanş', tur: 'teknik-resim', aktif: true, yayindakiHarf: 'A', sonHarf: 'B', dosyaTuru: 'pdf', bagSayisi: 1,
  guncellendi: '2026-10-01T08:00:00.000Z', surum: 3,
};
const LISTE: BelgeListesiCevabi = { satirlar: [SATIR], toplam: 1, sayfa: 1, sayfaBoyu: 50 };
const OZET_A = 'a'.repeat(64);
const OZET_B = 'b'.repeat(64);
const AYRINTI: BelgeAyrintisi = {
  id: 7, ad: 'Deneme flanş', tur: 'teknik-resim', aciklama: null, aktif: true, olusturanAd: 'Deneme Teknik',
  olusturuldu: '2026-09-01T08:00:00.000Z', guncellendi: '2026-10-01T08:00:00.000Z', surum: 3,
  revizyonlar: [
    {
      id: 12, sira: 2, harf: 'B', durum: 'taslak', ozet: OZET_B, dosyaAdi: 'flans-b.pdf', dosyaTuru: 'pdf', boyut: 2048, not: 'Delik çapı',
      yukleyenAd: 'Deneme Teknik', yuklendi: '2026-10-01T08:00:00.000Z', yayinlayanAd: null, yayinlandi: null, onizlemeKareSayisi: 0,
    },
    {
      id: 11, sira: 1, harf: 'A', durum: 'yayinda', ozet: OZET_A, dosyaAdi: 'flans-a.pdf', dosyaTuru: 'pdf', boyut: 1024, not: null,
      yukleyenAd: 'Deneme Teknik', yuklendi: '2026-09-01T08:00:00.000Z', yayinlayanAd: 'Deneme Şef', yayinlandi: '2026-09-02T08:00:00.000Z', onizlemeKareSayisi: 0,
    },
  ],
  baglar: [
    { hedefModul: 'malzemeler', hedefId: 41, hedefAdi: 'MM-DNM-00001 Deneme mil', ekleyenAd: 'Deneme Teknik', eklendi: '2026-09-03T08:00:00.000Z' },
    { hedefModul: 'malzemeler', hedefId: 42, hedefAdi: null, ekleyenAd: 'Deneme Teknik', eklendi: '2026-09-03T08:00:00.000Z' },
  ],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function sunucuKur(kullanici: Kullanici) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol.startsWith('/cizimler?')) return json(200, LISTE);
    if (yontem === 'GET' && yol === '/cizimler/7') return json(200, AYRINTI);
    if (yontem === 'POST' && yol.startsWith('/cizimler/7/')) return json(200, AYRINTI);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            <Route path="/cizimler" element={<Belgeler />} />
            <Route path="/cizimler/arsiv" element={<Belgeler arsiv />} />
            <Route path="/cizimler/teknik-resim" element={<Belgeler tur="teknik-resim" />} />
            <Route path="/cizimler/3b-model" element={<Belgeler tur="3b-model" />} />
            <Route path="/cizimler/belge/:id" element={<BelgeSayfasi />} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('cizimler gösterim kuralları', () => {
  it('uzantıdan dosya türü: stp ve igs eş adlarıyla, bilinmeyen null', () => {
    expect(dosyaTuruBul('Parca.STP')).toBe('step');
    expect(dosyaTuruBul('a.igs')).toBe('iges');
    expect(dosyaTuruBul('a.jpg')).toBe('jpeg');
    expect(dosyaTuruBul('a.dwg')).toBeNull();
    expect(dosyaTuruBul('uzantisiz')).toBeNull();
  });

  it('CZ-03: 3B model STEP, STL, IGES, GLB ve glTF alır; teknik resim modeli almaz', () => {
    expect(IZINLI_DOSYA_TURLERI['3b-model']).toEqual(['step', 'stl', 'iges', 'glb', 'gltf']);
    expect(IZINLI_DOSYA_TURLERI['teknik-resim']).not.toContain('step');
    expect(IZINLI_DOSYA_TURLERI['teknik-resim']).not.toContain('glb');
    expect(IZINLI_DOSYA_TURLERI.rapor).toEqual(['pdf', 'png', 'jpeg', 'webp']);
    expect(kabulMetni('3b-model')).toBe('.step,.stp,.stl,.iges,.igs,.glb,.gltf');
  });

  it('GLB ve glTF model görüntüsünde açılır; resim ve PDF modele gitmez', () => {
    expect(gorunumTuru('glb')).toBe('model');
    expect(gorunumTuru('gltf')).toBe('model');
    expect(modelBicimi('glb')).toBe('glb');
    expect(modelBicimi('png')).toBeNull();
    expect(modelBicimi('pdf')).toBeNull();
  });
});

// Tek üçgenli, bir metre enli sentetik GLB (glTF 2.0: JSON parçası + ikili parça, 4 bayta hizalı).
function ucgenGlb(): Uint8Array {
  const konum = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: konum.byteLength }],
    buffers: [{ byteLength: konum.byteLength }],
  });
  const jsonBayt = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const ikili = new Uint8Array(konum.buffer);
  const toplam = 12 + 8 + jsonBayt.length + 8 + ikili.length;
  const cikti = new Uint8Array(toplam);
  const g = new DataView(cikti.buffer);
  g.setUint32(0, 0x46546c67, true);
  g.setUint32(4, 2, true);
  g.setUint32(8, toplam, true);
  g.setUint32(12, jsonBayt.length, true);
  g.setUint32(16, 0x4e4f534a, true);
  cikti.set(jsonBayt, 20);
  const b = 20 + jsonBayt.length;
  g.setUint32(b, ikili.length, true);
  g.setUint32(b + 4, 0x004e4942, true);
  cikti.set(ikili, b + 8);
  return cikti;
}

describe('cizimler model okuma', () => {
  it('GLB metre ve Y yukarı okunur, görüntüde milimetre olur', async () => {
    const m = await modelOku(ucgenGlb(), 'glb', new Color());
    const olcu = new Box3().setFromObject(m).getSize(new Vector3());
    expect(olcu.x).toBeCloseTo(1000);
    expect(olcu.y).toBeCloseTo(1000);
    expect(olcu.z).toBeCloseTo(0);
  });

  it('bozuk GLB hata verir', async () => {
    await expect(modelOku(new TextEncoder().encode('glTF bozuk'), 'glb', new Color())).rejects.toThrow();
  });
});

describe('cizimler dosya aktarımı', () => {
  it('yazılım SHA-256 bilinen değeri verir (güvenli bağlam olmayan http)', () => {
    expect(sha256Yazilim(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Yazilim(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('base64 tarayıcınınkiyle aynı', () => {
    for (const metin of ['', 'a', 'ab', 'abc', 'abcd']) expect(base64Yaz(new TextEncoder().encode(metin))).toBe(btoa(metin));
  });

  it('eksik dosya parça parça gider; daha önce yüklenmiş dosya yeniden gönderilmez', async () => {
    const veri = new Uint8Array(PARCA_BAYT * 2 + 5).fill(7);
    const cagrilar: Cagri[] = [];
    let eksik = true;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      const yol = adres.replace('/api', '');
      const govde = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) as { ozetler?: string[] } : undefined;
      cagrilar.push({ yontem: ayar?.method ?? 'GET', yol, govde });
      if (yol === '/dosyalar/eksikler') return json(200, { eksikler: eksik ? govde?.ozetler ?? [] : [] });
      return json(200, { tamam: true });
    }));
    const oranlar: number[] = [];
    const ozet = await dosyaYukle(veri, (o) => { oranlar.push(o); });
    expect(ozet).toMatch(/^[0-9a-f]{64}$/);
    const parcalar = cagrilar.filter((c) => c.yol === `/dosyalar/${ozet}/parca`);
    expect(parcalar.map((c) => (c.govde as { sira: number; toplam: number }).sira)).toEqual([0, 1, 2]);
    expect(parcalar.every((c) => (c.govde as { toplam: number }).toplam === 3)).toBe(true);
    expect(oranlar.at(-1)).toBe(1);

    cagrilar.length = 0;
    eksik = false;
    await dosyaYukle(veri, () => {});
    expect(cagrilar.map((c) => c.yol)).toEqual(['/dosyalar/eksikler']);
  });

  it('boş ve 200 MB üstü dosya gönderilmeden reddedilir', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(dosyaYukle(new Uint8Array(0), () => {})).rejects.toThrow('Dosya boş.');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('cizimler ekranları', () => {
  it('liste satırı yayındaki ve taslak revizyonu gösterir; okur yeni belge açamaz', async () => {
    sunucuKur(OKUR);
    ac('/cizimler');
    expect(await screen.findByText('Deneme flanş')).toBeTruthy();
    expect(screen.getByText('Taslak B')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni belge/ })).toBeNull();
  });

  it('tür bölümü sorguya türü, arşiv bölümü arşivi yazar', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac('/cizimler/teknik-resim');
    expect(await screen.findByRole('button', { name: /Yeni belge/ })).toBeTruthy();
    expect(cagrilar.some((c) => c.yol.startsWith('/cizimler?') && c.yol.includes('tur=teknik-resim') && c.yol.includes('arsiv=hayir'))).toBe(true);
    cleanup();
    const ikinci = sunucuKur(YAZAR);
    ac('/cizimler/arsiv');
    await screen.findByText('Deneme flanş');
    expect(ikinci.some((c) => c.yol.includes('arsiv=evet'))).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni belge/ })).toBeNull();
  });

  it('CZ-16: 3B bölümü Makineler 3B ve Malzemeler 3B sekmeleriyle açılır; sekme sorguya makine süzgecini yazar, öbür bölümlerde sekme yok', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac('/cizimler/3b-model');
    const makine = await screen.findByRole('tab', { name: /Makineler 3B/ });
    expect(makine.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => { expect(cagrilar.some((c) => c.yol.includes('tur=3b-model') && c.yol.includes('makine=evet'))).toBe(true); });
    fireEvent.click(screen.getByRole('tab', { name: /Malzemeler 3B/ }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol.includes('tur=3b-model') && c.yol.includes('makine=hayir'))).toBe(true); });
    cleanup();
    const ikinci = sunucuKur(YAZAR);
    ac('/cizimler/teknik-resim');
    await screen.findByRole('button', { name: /Yeni belge/ });
    expect(screen.queryByRole('tab', { name: /Makineler 3B/ })).toBeNull();
    expect(ikinci.some((c) => c.yol.includes('makine='))).toBe(false);
  });

  it('ayrıntı yayındaki revizyonu gösterir; yayınlama yalnız yayınlama yetkisiyle', async () => {
    sunucuKur(YAZAR);
    ac('/cizimler/belge/7');
    expect(await screen.findByText('Görüntü 11')).toBeTruthy();
    expect(screen.getByText('Delik çapı')).toBeTruthy();
    // Bağlı kayıt okunur adıyla görünür; adı gelmeyen kayıtta kimlik kalır (ad uydurulmaz).
    expect(screen.getByText('MM-DNM-00001 Deneme mil')).toBeTruthy();
    expect(screen.queryByText('#41')).toBeNull();
    expect(screen.getByText('#42')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yayınla' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sil' })).toBeTruthy();
  });

  it('yayınlama onayla gider ve belgenin sürümünü taşır', async () => {
    const cagrilar = sunucuKur(YAYINCI);
    ac('/cizimler/belge/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Yayınla' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(Array.from(pencere.querySelectorAll('button')).find((b) => b.textContent === 'Yayınla')!);
    await waitFor(() => {
      expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({ yontem: 'POST', yol: '/cizimler/7/revizyonlar/12/yayinla', govde: { surum: 3 } });
    });
  });

  it('CZ-14: 3B model sistemdeki istasyonla eşleştirilir; teknik resimde eşleştirme düğmesi yok', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac('/cizimler/belge/7');
    await screen.findByText('Görüntü 11');
    expect(screen.queryByRole('button', { name: 'Makineyle eşleştir' })).toBeNull();
    cleanup();

    const MODEL: BelgeAyrintisi = { ...AYRINTI, tur: '3b-model', revizyonlar: AYRINTI.revizyonlar.map((r) => ({ ...r, dosyaTuru: 'glb' as const })) };
    const temel = vi.mocked(fetch);
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol === '/istasyonlar/secim') {
        cagrilar.push({ yontem: 'GET', yol, govde: undefined });
        return json(200, { gruplar: [{ isMerkeziId: 1, isMerkeziKod: 'IM1', isMerkeziAd: 'Talaşlı', istasyonlar: [{ id: 5, kod: 'F-01', ad: 'Deneme freze' }] }] });
      }
      if ((ayar?.method ?? 'GET') === 'GET' && yol === '/cizimler/7') return json(200, MODEL);
      return temel(adres, ayar);
    }));
    ac('/cizimler/belge/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Makineyle eşleştir' }));
    const pencere = await screen.findByRole('dialog');
    const secim = within(pencere).getByLabelText('Sistemdeki makine') as HTMLSelectElement;
    await waitFor(() => { expect(secim.disabled).toBe(false); });
    fireEvent.change(secim, { target: { value: '5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Eşleştir' }));
    await waitFor(() => {
      expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
        yontem: 'POST', yol: '/cizimler/7/bag-ekle', govde: { hedefModul: 'istasyonlar', hedefId: 5, surum: 3 },
      });
    });
  });

  it('kart #1258: seçilen makine haritada yoksa ve çizim taslaktaysa eşleştir penceresi uyarır; haritadaysa uyarı yok', async () => {
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'sayfa.atolye'] });
    const MODEL: BelgeAyrintisi = { ...AYRINTI, tur: '3b-model', revizyonlar: AYRINTI.revizyonlar.map((r) => ({ ...r, durum: 'taslak' as const, dosyaTuru: 'glb' as const })) };
    const temel = vi.mocked(fetch);
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol === '/istasyonlar/secim') {
        return json(200, { gruplar: [{ isMerkeziId: 1, isMerkeziKod: 'IM1', isMerkeziAd: 'Talaşlı', istasyonlar: [{ id: 5, kod: 'F-01', ad: 'Deneme freze' }, { id: 6, kod: 'F-02', ad: 'İkinci freze' }] }] });
      }
      if (yol === '/atolye/fabrika') return json(200, { bolumler: [{ istasyonYerleri: [{ istasyonId: 6 }] }] });
      if ((ayar?.method ?? 'GET') === 'GET' && yol === '/cizimler/7') return json(200, MODEL);
      return temel(adres, ayar);
    }));
    ac('/cizimler/belge/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Makineyle eşleştir' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/Çizim taslakta/)).toBeTruthy();
    const secim = within(pencere).getByLabelText('Sistemdeki makine') as HTMLSelectElement;
    await waitFor(() => { expect(secim.disabled).toBe(false); });
    fireEvent.change(secim, { target: { value: '5' } });
    expect(await within(pencere).findByText(/Bu makine fabrika haritasında yok/)).toBeTruthy();
    fireEvent.change(secim, { target: { value: '6' } });
    await waitFor(() => { expect(within(pencere).queryByText(/Bu makine fabrika haritasında yok/)).toBeNull(); });
  });

  it('malzemeye bağla: stok kodu ya da adla aranır, aktif kart seçilir ve kart no gönderilir', async () => {
    const cagrilar = sunucuKur(YAZAR);
    const temel = vi.mocked(fetch);
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol.startsWith('/cizimler/malzeme-secimi?')) {
        cagrilar.push({ yontem: 'GET', yol, govde: undefined });
        const ara = new URLSearchParams(yol.split('?')[1]).get('ara') ?? '';
        const hepsi = [{ id: 8, kod: 'HM-DNM-00002', ad: 'Deneme çubuk', birim: 'KG' }, { id: 9, kod: 'MM-DNM-00001', ad: 'Deneme flanş', birim: 'AD' }];
        return json(200, { malzemeler: hepsi.filter((m) => `${m.kod} ${m.ad}`.toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr'))) });
      }
      return temel(adres, ayar);
    }));
    ac('/cizimler/belge/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Malzemeye bağla' }));
    const pencere = await screen.findByRole('dialog');
    const bagla = within(pencere).getByRole('button', { name: 'Bağla' }) as HTMLButtonElement;
    expect(bagla.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Malzeme ara'), { target: { value: 'HM-DNM' } });
    const secim = within(pencere).getByLabelText('Malzeme kartı') as HTMLSelectElement;
    await waitFor(() => { expect([...secim.options].map((o) => o.text)).toEqual(['Seçiniz', 'HM-DNM-00002 - Deneme çubuk (KG)']); });
    fireEvent.change(secim, { target: { value: '8' } });
    expect(bagla.disabled).toBe(false);
    fireEvent.click(bagla);
    await waitFor(() => {
      expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
        yontem: 'POST', yol: '/cizimler/7/bag-ekle', govde: { hedefModul: 'malzemeler', hedefId: 8, surum: 3 },
      });
    });
  });

  it('okur ayrıntıda yazma düğmesi görmez', async () => {
    sunucuKur(OKUR);
    ac('/cizimler/belge/7');
    await screen.findByText('Görüntü 11');
    for (const ad of ['Düzenle', 'Yeni revizyon', 'Arşivle', 'Sil', 'Yayınla', 'Malzemeye bağla', 'Makineyle eşleştir']) {
      expect(screen.queryByRole('button', { name: ad })).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: /dosyasını indir/ })).toHaveLength(2);
  });
});

describe('cizimler önizleme kareleri', () => {
  it('sekiz kare Y ekseni çevresinde eşit aralıklı döner', () => {
    expect(KARE_SAYISI).toBe(8);
    const acilar = Array.from({ length: KARE_SAYISI }, (_, i) => kareAcisi(i));
    expect(acilar[0]).toBe(0);
    for (let i = 1; i < acilar.length; i++) expect((acilar[i] ?? 0) - (acilar[i - 1] ?? 0)).toBeCloseTo(Math.PI / 4);
    expect(acilar.at(-1)).toBeLessThan(2 * Math.PI);
  });

  it('kare 64 KiB sınırını aşarsa çözünürlük 384 -> 320 -> 256 düşer; sınırı tutturan ilk çözünürlük döner; hiçbiri tutturmazsa üretilmez', async () => {
    expect(COZUNURLUKLER).toEqual([384, 320, 256]);
    const denenen: number[] = [];
    const kareler = await sinirdaKareler(async (c) => {
      denenen.push(c);
      return [{ boyut: c === 256 ? KARE_BAYT_SINIRI : KARE_BAYT_SINIRI + 1 }, { boyut: 10 }];
    });
    expect(denenen).toEqual([384, 320, 256]);
    expect(kareler).toEqual([{ boyut: KARE_BAYT_SINIRI }, { boyut: 10 }]);

    const ilk: number[] = [];
    await sinirdaKareler(async (c) => { ilk.push(c); return [{ boyut: 1 }]; });
    expect(ilk).toEqual([384]);

    const hepsi: number[] = [];
    await expect(sinirdaKareler(async (c) => { hepsi.push(c); return [{ boyut: KARE_BAYT_SINIRI + 1 }]; })).rejects.toBeInstanceOf(OnizlemeAtlandi);
    expect(hepsi).toEqual([384, 320, 256]);
  });
});

describe('cizimler önizleme akışı', () => {
  const R12 = AYRINTI.revizyonlar[0]!;
  const R11 = AYRINTI.revizyonlar[1]!;
  const TASLAK: BelgeAyrintisi = {
    ...AYRINTI, tur: '3b-model',
    revizyonlar: [{ ...R12, dosyaTuru: 'step', dosyaAdi: 'mil-b.step' }, { ...R11, dosyaTuru: 'step', dosyaAdi: 'mil-a.step', onizlemeKareSayisi: 3 }],
  };
  const yayinda = (kareSayisi: number, tur: 'step' | 'pdf' = 'step'): BelgeAyrintisi => ({
    ...TASLAK,
    revizyonlar: [
      { ...R12, durum: 'yayinda', dosyaTuru: tur, dosyaAdi: 'mil-b', yayinlayanAd: 'Deneme Şef', yayinlandi: '2026-10-02T08:00:00.000Z', onizlemeKareSayisi: kareSayisi },
      { ...R11, durum: 'eski', dosyaTuru: tur, dosyaAdi: 'mil-a', onizlemeKareSayisi: 3 },
    ],
  });
  const KARELER = [0, 1, 2].map((i) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, i]));

  // Belgenin durumu sunucuda tutulur: yayınlama revizyonu yayına alır, önizleme yazısı kare sayısını yükler.
  function sunucu(kullanici: Kullanici, baslangic: BelgeAyrintisi, tur: 'step' | 'pdf' = 'step') {
    const cagrilar: Cagri[] = [];
    let guncel = baslangic;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      const yol = adres.replace('/api', '');
      const yontem = ayar?.method ?? 'GET';
      const govde = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) as { ozetler?: string[]; kareler?: unknown[] } : undefined;
      cagrilar.push({ yontem, yol, govde });
      if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
      if (yontem === 'GET' && yol === '/cizimler/7') return json(200, guncel);
      if (yontem === 'GET' && yol === '/cizimler/7/revizyonlar/12/dosya') return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      if (yol === '/cizimler/7/revizyonlar/12/yayinla') { guncel = yayinda(0, tur); return json(200, guncel); }
      if (yol === '/cizimler/7/revizyonlar/12/onizleme') { guncel = yayinda(govde?.kareler?.length ?? 0, tur); return json(200, guncel); }
      if (yol === '/dosyalar/eksikler') return json(200, { eksikler: govde?.ozetler ?? [] });
      if (yol.startsWith('/dosyalar/')) return json(200, { tamam: true });
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    const yazilar = () => cagrilar.filter((c) => c.yontem === 'POST').map((c) => c.yol.replace(/\/dosyalar\/[0-9a-f]{64}\//, '/dosyalar/<ozet>/'));
    return { cagrilar, yazilar };
  }

  async function yayinla() {
    fireEvent.click(await screen.findByRole('button', { name: 'Yayınla' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(Array.from(pencere.querySelectorAll('button')).find((b) => b.textContent === 'Yayınla')!);
  }

  beforeEach(() => {
    onizlemeKareleri.mockReset();
    vi.stubGlobal('WebGLRenderingContext', class {});
  });

  it('STEP revizyon yayınlanınca model okunur, kareler yüklenir ve sırayla önizleme ucuna bildirilir', async () => {
    onizlemeKareleri.mockResolvedValue(KARELER);
    const { cagrilar, yazilar } = sunucu(YAYINCI, TASLAK);
    ac('/cizimler/belge/7');
    await yayinla();

    expect(await screen.findByText('Revizyon B önizlemesi hazır.')).toBeTruthy();
    expect(onizlemeKareleri).toHaveBeenCalledTimes(1);
    expect(Array.from(onizlemeKareleri.mock.calls[0]![0] as Uint8Array)).toEqual([1, 2, 3]);
    expect(onizlemeKareleri.mock.calls[0]![1]).toBe('step');
    expect(yazilar()).toEqual([
      '/cizimler/7/revizyonlar/12/yayinla',
      '/dosyalar/eksikler', '/dosyalar/<ozet>/parca', '/dosyalar/eksikler', '/dosyalar/<ozet>/parca', '/dosyalar/eksikler', '/dosyalar/<ozet>/parca',
      '/cizimler/7/revizyonlar/12/onizleme',
    ]);
    const govde = cagrilar.find((c) => c.yol.endsWith('/onizleme'))?.govde as { kareler: { kare: number; ozet: string }[] };
    expect(govde.kareler.map((k) => k.kare)).toEqual([0, 1, 2]);
    expect(new Set(govde.kareler.map((k) => k.ozet)).size).toBe(3);
    for (const k of govde.kareler) expect(k.ozet).toMatch(/^[0-9a-f]{64}$/);
    // Kare sayısı geldi: "Önizleme üret" düğmesi çıkmaz.
    await waitFor(() => { expect(screen.queryByRole('button', { name: /önizleme üret/ })).toBeNull(); });
  });

  it('üretim başarısızsa yayın bozulmaz: revizyon yayında kalır, uyarı çıkar, önizleme ucuna gidilmez; düğme yeniden denemeye izin verir', async () => {
    onizlemeKareleri.mockRejectedValueOnce(new OnizlemeAtlandi('Model 25 MB sınırından büyük; önizleme üretilmedi.'));
    const { yazilar } = sunucu(YAYINCI, TASLAK);
    ac('/cizimler/belge/7');
    await yayinla();

    expect((await screen.findByRole('alert')).textContent).toContain('Model 25 MB sınırından büyük');
    expect(yazilar()).toEqual(['/cizimler/7/revizyonlar/12/yayinla']);
    const dugme = await screen.findByRole('button', { name: 'Revizyon B için önizleme üret' });

    onizlemeKareleri.mockResolvedValueOnce(KARELER);
    fireEvent.click(dugme);
    expect(await screen.findByText('Revizyon B önizlemesi hazır.')).toBeTruthy();
    expect(yazilar().at(-1)).toBe('/cizimler/7/revizyonlar/12/onizleme');
  });

  it('WebGL yoksa üretim sessizce atlanır: dosya indirilmez, çizim çağrılmaz, uyarı çıkar, yayın tamamdır', async () => {
    vi.stubGlobal('WebGLRenderingContext', undefined);
    const { cagrilar, yazilar } = sunucu(YAYINCI, TASLAK);
    ac('/cizimler/belge/7');
    await yayinla();

    expect(await screen.findByText(/önizleme üretilmedi/)).toBeTruthy();
    expect(onizlemeKareleri).not.toHaveBeenCalled();
    expect(yazilar()).toEqual(['/cizimler/7/revizyonlar/12/yayinla']);
    expect(cagrilar.some((c) => c.yol.endsWith('/dosya'))).toBe(false);
  });

  it('PDF revizyon yayınlanınca önizleme denenmez', async () => {
    const { yazilar } = sunucu(YAYINCI, AYRINTI, 'pdf');
    ac('/cizimler/belge/7');
    await yayinla();
    await waitFor(() => { expect(yazilar()).toEqual(['/cizimler/7/revizyonlar/12/yayinla']); });
    expect(onizlemeKareleri).not.toHaveBeenCalled();
  });

  it('yayındaki STEP revizyonda karesi yoksa "Önizleme üret" yalnız yayınlayabilene görünür; karesi varsa görünmez', async () => {
    sunucu(YAZAR, yayinda(0));
    ac('/cizimler/belge/7');
    await screen.findByText('Görüntü 12');
    expect(screen.queryByRole('button', { name: /önizleme üret/ })).toBeNull();
    cleanup();

    sunucu(YAYINCI, yayinda(3));
    ac('/cizimler/belge/7');
    await screen.findByText('Görüntü 12');
    expect(screen.queryByRole('button', { name: /önizleme üret/ })).toBeNull();
    cleanup();

    sunucu(YAYINCI, yayinda(0));
    ac('/cizimler/belge/7');
    expect(await screen.findByRole('button', { name: 'Revizyon B için önizleme üret' })).toBeTruthy();
  });
});
