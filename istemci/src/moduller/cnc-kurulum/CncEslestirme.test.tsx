import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { MakineOzeti } from './cerceve-kopru.ts';
import { onerilenIstasyon } from './CncEslestirme.tsx';
import { rotalar } from './rotalar.tsx';

// Sahne testte model üretmez (model-uret.test.ts sınar): liste ve hata testten verilir, üretilen GLB tek bayttır.
const sahne = vi.hoisted(() => ({
  liste: [] as MakineOzeti[], hatalar: new Map<string, string>(), metinler: [] as (string | undefined)[], uretilen: [] as string[],
}));
vi.mock('./yeni/sahne/model-uret.ts', () => ({
  makineListesi: (metin: string | undefined) => { sahne.metinler.push(metin); return sahne.liste; },
  modelUret: (id: string, metin: string | undefined) => {
    sahne.uretilen.push(id); sahne.metinler.push(metin);
    const h = sahne.hatalar.get(id);
    if (h !== undefined) throw new Error(h);
    const m = sahne.liste.find((x) => x.makineId === id);
    if (!m) throw new Error('Makine modeli bulunamadı.');
    return { ...m, glb: new Uint8Array([1]) };
  },
}));
const cizimler = vi.hoisted(() => ({ onizlemeGonder: vi.fn(async (_r: unknown, _g: unknown) => {}) }));
vi.mock('../cizimler/disari.ts', () => ({ dosyaYukle: vi.fn(async () => 'a'.repeat(64)), onizlemeGonder: cizimler.onizlemeGonder }));

// Kişi ve makine adları uydurmadır.
const YAZAR: Kullanici = { id: 5, ad: 'Deneme Yazar', islemler: ['sayfa.cnc-kurulum', 'cizimler.yaz', 'cizimler.yayinla'] };
const OZET = 'a'.repeat(64);
const GRUPLAR: IstasyonSecimiCevabi['gruplar'] = [
  { isMerkeziId: 1, isMerkeziKod: 'IM1', isMerkeziAd: 'Talaşlı', istasyonlar: [
    { id: 5, kod: 'F-01', ad: 'Deneme freze', tip: 'talasli', aktif: true, isMerkeziId: 1 },
    { id: 6, kod: 'T-01', ad: 'Deneme torna', tip: 'talasli', aktif: true, isMerkeziId: 1 },
  ] },
];
// Ekranın kaydı; sayfa onu yalnız sahneye verir.
const KAYIT_ANAHTARI = 'cnc-kurulum-motoru.v1';
const KAYIT = JSON.stringify({ customMachines: [{ id: 'ozel', name: 'Elle' }] });
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown }

// mevcut: Çizim Merkezi'nde zaten duran belgeler (liste satırı ve ayrıntısı).
interface MevcutBelge { id: number; ad: string; yayinda: boolean; istasyonId: number | null }

function sunucuKur(kullanici: Kullanici, gruplar: IstasyonSecimiCevabi['gruplar'] = GRUPLAR, mevcut: MevcutBelge[] = []): Istek[] {
  const istekler: Istek[] = [];
  let belge = { id: 12, surum: 1, revizyonlar: [{ id: 30, ozet: OZET, durum: 'taslak', onizlemeKareSayisi: 0 }], baglar: [] as { hedefModul: string; hedefId: number }[] };
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/cnc-kurulum/ben') return json(200, { kisi: { id: 5, ad: 'Deneme Yazar' }, yazabilir: false, hazirlikOnaylayabilir: false, takimDegistirebilir: false });
    if (yol === '/cnc-kurulum/kayitlar') return json(200, { kayitlar: [{ anahtar: KAYIT_ANAHTARI, bicim: 'metin', deger: KAYIT, surum: 3 }] });
    if (yol === '/istasyonlar/secim') return json(200, { gruplar } satisfies IstasyonSecimiCevabi);
    if (yontem === 'GET' && yol.startsWith('/cizimler?')) {
      const ara = new URLSearchParams(yol.slice(yol.indexOf('?') + 1)).get('ara');
      const satirlar = mevcut.filter((b) => ara === null || b.ad === ara).map((b) => ({
        id: b.id, ad: b.ad, tur: '3b-model', aktif: true, yayindakiHarf: b.yayinda ? 'A' : null, sonHarf: 'A', dosyaTuru: 'glb',
        bagSayisi: b.istasyonId === null ? 0 : 1, guncellendi: '2026-10-15T08:00:00Z', surum: 1,
      }));
      return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 200 });
    }
    const varolan = mevcut.find((b) => yontem === 'GET' && yol === `/cizimler/${b.id}`);
    if (varolan) return json(200, { id: varolan.id, surum: 1, revizyonlar: [], baglar: varolan.istasyonId === null ? [] : [{ hedefModul: 'istasyonlar', hedefId: varolan.istasyonId }] });
    if (yontem === 'POST' && yol === '/cizimler') return json(200, { id: 12 });
    if (yontem === 'POST' && yol === '/cizimler/12/revizyonlar/30/yayinla') belge = { ...belge, surum: 2, revizyonlar: [{ id: 30, ozet: OZET, durum: 'yayinda', onizlemeKareSayisi: 0 }] };
    if (yontem === 'POST' && yol === '/cizimler/12/bag-ekle') belge = { ...belge, surum: 3, baglar: [{ hedefModul: 'istasyonlar', hedefId: 5 }] };
    if (yol.startsWith('/cizimler/12')) return json(200, belge);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(yol = '/cizimler/cnc-makineleri') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[yol]}>
      <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

const makineler = (...l: MakineOzeti[]) => { sahne.liste = l; };
const F01: MakineOzeti = { makineId: 'f5a', no: 'F-01', ad: 'Beş eksen' };

afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); cizimler.onizlemeGonder.mockReset();
  sahne.liste = []; sahne.hatalar.clear(); sahne.metinler = []; sahne.uretilen = [];
});

describe('Çizim Merkezi CNC makineleri eşleştirmesi (kart #1196, #1238)', () => {
  it('TA-01: makine numarası istasyon koduyla eşleşirse o istasyon önerilir', () => {
    expect(onerilenIstasyon('f-01 ', GRUPLAR)).toBe(5);
    expect(onerilenIstasyon('F-99', GRUPLAR)).toBeNull();
    expect(onerilenIstasyon(null, GRUPLAR)).toBeNull();
  });

  it('TA-02: işaretlenen makine Çizim Merkezi\'ne yazılır, yayınlanır ve seçilen istasyona bağlanır; sayfa kayıt yazmaz', async () => {
    const istekler = sunucuKur(YAZAR);
    makineler(F01, { makineId: 'ozel', no: null, ad: 'Elle' });
    ac();
    const satir = (await screen.findByText('F-01 · Beş eksen')).closest('li') as HTMLElement;
    const secim = within(satir).getByLabelText('Sistemdeki makine') as HTMLSelectElement;
    await waitFor(() => { expect(secim.value).toBe('5'); });
    const ozel = screen.getByText('Elle').closest('li') as HTMLElement;
    expect((within(ozel).getByLabelText('Sistemdeki makine') as HTMLSelectElement).value).toBe('');

    fireEvent.click(within(satir).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '1 makineyi eşleştir' }));
    expect(await within(satir).findByText('Yeni belge, eşleşti, haritanın Ekle listesinde; küçük resim hazır.')).toBeTruthy();
    // 1135 a: model sahneden, ekranın kaydıyla (elle eklenen makineler ve düzeltmeler) üretilir.
    expect(sahne.uretilen).toEqual(['f5a']);
    expect(sahne.metinler.every((m) => m === KAYIT)).toBe(true);
    // 780 a: küçük resim yayındaki revizyonun önizlemesidir; kareler elde olan GLB'den üretilir, dosya yeniden indirilmez.
    expect(cizimler.onizlemeGonder).toHaveBeenCalledTimes(1);
    expect(cizimler.onizlemeGonder.mock.calls[0]?.[0]).toMatchObject({ id: 30, durum: 'yayinda' });
    expect(cizimler.onizlemeGonder.mock.calls[0]?.[1]).toEqual({ dosyaYolu: '/cizimler/12/revizyonlar/30/dosya', yazmaYolu: '/cizimler/12/revizyonlar/30/onizleme', veri: new Uint8Array([1]) });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/cizimler', { ad: 'F-01 · Beş eksen', tur: '3b-model', aciklama: 'CNC Kurulum Motoru makine modeli (glTF, metre, Y yukarı).', ozet: OZET, dosyaAdi: 'cnc-f5a.glb' }],
      ['/cizimler/12/revizyonlar/30/yayinla', { surum: 1 }],
      ['/cizimler/12/bag-ekle', { hedefModul: 'istasyonlar', hedefId: 5, surum: 2 }],
    ]);
    expect(istekler.some((i) => i.yol.startsWith('/cnc-kurulum/kayitlar/'))).toBe(false);
  });

  it('TA-03: modeli üretilemeyen makinede hata satırda görünür, öbür işlem yapılmaz', async () => {
    const istekler = sunucuKur(YAZAR);
    makineler({ makineId: 'ozel', no: null, ad: 'Elle' });
    sahne.hatalar.set('ozel', 'Makine modeli bulunamadı.');
    ac();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Elle' }));
    fireEvent.click(screen.getByRole('button', { name: '1 makineyi eşleştir' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Makine modeli bulunamadı.');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('TA-04: Çizim Merkezi\'ne yazamayan kişiye yetki iletisi gösterilir, kayıtlar okunmaz', async () => {
    const istekler = sunucuKur({ ...YAZAR, islemler: ['sayfa.cnc-kurulum'] });
    makineler(F01);
    ac();
    expect(await screen.findByText('Çizim Merkezi\'nde eşleştirme yetkiniz yok.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/cnc-kurulum/kayitlar')).toBe(false);
    expect(sahne.metinler).toEqual([]);
  });

  it('TA-05: ana sayfadan gelen makine işaretli gelir; eşleşmeyen işaretli satır istasyonun nasıl açılacağını ve İstasyonlar bağlantısını gösterir', async () => {
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'sayfa.istasyonlar'] });
    makineler(F01, { makineId: 'ozel', no: 'F-77', ad: 'Elle' });
    ac('/cizimler/cnc-makineleri?makine=ozel');
    const ozel = (await screen.findByText('F-77 · Elle')).closest('li') as HTMLElement;
    const dmu = screen.getByText('F-01 · Beş eksen').closest('li') as HTMLElement;
    await waitFor(() => { expect((within(ozel).getByRole('checkbox') as HTMLInputElement).checked).toBe(true); });
    expect((within(dmu).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: '1 makineyi eşleştir' })).toBeTruthy();
    const not = await within(ozel).findByRole('note');
    expect(not.textContent).toContain('İstasyonlar ekranında F-77 koduyla açın');
    expect(within(not).getByRole('link', { name: 'İstasyonlar' }).getAttribute('href')).toBe('/istasyonlar/is-merkezleri');
    // Eşleşen satırda açıklama yoktur.
    fireEvent.click(within(dmu).getByRole('checkbox'));
    expect(within(dmu).queryByRole('note')).toBeNull();
  });

  it('TA-06: İstasyonlar sayfasını göremeyen kişiye bağlantı konmaz; sistemde istasyon yoksa uyarı görünür', async () => {
    sunucuKur(YAZAR, []);
    makineler(F01);
    ac('/cnc-kurulum/aktar?makine=f5a');
    const satir = (await screen.findByText('F-01 · Beş eksen')).closest('li') as HTMLElement;
    expect((await within(satir).findByRole('note')).textContent).toContain('F-01 koduyla açın');
    expect(screen.getByRole('alert').textContent).toContain('Sistemde istasyon kaydı yok');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('TA-07: makinenin Çizim Merkezi\'ndeki durumu satırda görünür; var olan eşleşme seçili gelir, önerinin önüne geçer', async () => {
    sunucuKur(YAZAR, GRUPLAR, [
      { id: 40, ad: 'F-01 · Beş eksen', yayinda: true, istasyonId: 6 },
      { id: 41, ad: 'T-09 · Taslak torna', yayinda: false, istasyonId: null },
    ]);
    makineler(F01, { makineId: 't9', no: 'T-09', ad: 'Taslak torna' }, { makineId: 'yeni', no: null, ad: 'Yeni' });
    ac();
    const dmu = (await screen.findByText('F-01 · Beş eksen')).closest('li') as HTMLElement;
    expect(await within(dmu).findByText('Eşleşti: T-01 - Deneme torna. Haritaya eklenebilir.')).toBeTruthy();
    // Kod F-01 istasyonunu önerirdi; Çizim Merkezi'ndeki bağ (T-01) önce gelir.
    expect((within(dmu).getByLabelText('Sistemdeki makine') as HTMLSelectElement).value).toBe('6');
    const t9 = screen.getByText('T-09 · Taslak torna').closest('li') as HTMLElement;
    expect(within(t9).getByText('Çizim Merkezi\'nde modeli var, eşleşmedi; haritaya eklenemez.')).toBeTruthy();
    const yeni = screen.getByText('Yeni').closest('li') as HTMLElement;
    expect(within(yeni).getByText('Çizim Merkezi\'nde modeli yok, eşleşmedi.')).toBeTruthy();
  });

  it('TA-08: eski aktarım adresi Çizim Merkezi\'ndeki sayfaya seçili makineyle düşer', async () => {
    sunucuKur(YAZAR);
    makineler(F01);
    ac('/cnc-kurulum/aktar?makine=f5a');
    expect(await screen.findByRole('region', { name: 'CNC makineleri' })).toBeTruthy();
    await waitFor(() => { expect((screen.getByRole('checkbox', { name: 'F-01 · Beş eksen' }) as HTMLInputElement).checked).toBe(true); });
  });

  // 780 a: küçük resim eşleşmenin parçası değildir; üretilemezse bağ ve yayın kalır, neden satırda yazar.
  const eslestir = async () => {
    const satir = (await screen.findByText('F-01 · Beş eksen')).closest('li') as HTMLElement;
    await waitFor(() => { expect((within(satir).getByLabelText('Sistemdeki makine') as HTMLSelectElement).value).toBe('5'); });
    fireEvent.click(within(satir).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '1 makineyi eşleştir' }));
    return satir;
  };

  it('TA-09: küçük resim üretilemezse eşleşme ve yayın geri alınmaz, neden satırda yazar', async () => {
    cizimler.onizlemeGonder.mockRejectedValueOnce(new Error('Bu cihazda üç boyutlu çizim yok; önizleme üretilmedi.'));
    const istekler = sunucuKur(YAZAR);
    makineler(F01);
    ac();
    const satir = await eslestir();
    expect(await within(satir).findByText('Yeni belge, eşleşti, haritanın Ekle listesinde; küçük resim üretilemedi (Bu cihazda üç boyutlu çizim yok; önizleme üretilmedi.).')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/cizimler/12/bag-ekle')).toBe(true);
  });

  it('TA-10: yayınlama yetkisi yoksa revizyon taslak kalır ve küçük resim üretilmez (reddedilen)', async () => {
    sunucuKur({ ...YAZAR, islemler: ['sayfa.cnc-kurulum', 'cizimler.yaz'] });
    makineler(F01);
    ac();
    const satir = await eslestir();
    expect(await within(satir).findByText('Yeni belge, eşleşti; çizim yayınlanınca haritaya eklenir.')).toBeTruthy();
    expect(cizimler.onizlemeGonder).not.toHaveBeenCalled();
  });
});
