import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IstasyonSecimiCevabi, MakinelerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { CalismaTakvimiCevabi, TakvimCevabi, VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { PersonelEkrani, TakvimEkrani, VardiyaEkrani } from './Vardiya.tsx';

const PLANLAMA: Kullanici = { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.vardiya', 'vardiya.yaz'] };
const ISTASYON_OKUR: Kullanici = { ...PLANLAMA, islemler: [...PLANLAMA.islemler, 'sayfa.istasyonlar'] };
const IZLEYEN: Kullanici = { id: 2, ad: 'Deneme İzleyen', islemler: ['sayfa.vardiya'] };

const TAKVIM: TakvimCevabi = {
  vardiyalar: [
    { id: 1, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 4, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 },
    { id: 2, ad: 'Akşam', baslangic: '16:00', bitis: '00:00', aktif: true, surum: 1, molalar: [], netDakika: 480 },
  ],
  matris: [{ isMerkeziId: 10, gun: 1, vardiyaId: 1 }, { isMerkeziId: 10, gun: 1, vardiyaId: 2 }, { isMerkeziId: 11, gun: 2, vardiyaId: 2 }],
  gunler: [
    { tarih: '2026-01-01', tur: 'tatil', ad: 'Yılbaşı', kaynak: 'ik' }, { tarih: '2026-10-29', tur: 'tatil', ad: 'Cumhuriyet Bayramı', kaynak: 'ik' },
    { tarih: '2026-11-02', tur: 'kapali', ad: 'Bakım' }, { tarih: '2026-11-03', tur: 'tatil', ad: 'Eski' },
  ],
  isMerkezleri: [
    { id: 10, kod: 'IM-A', ad: 'Deneme A', aktif: true, haftalikDakika: 450 },
    { id: 11, kod: 'IM-B', ad: 'Deneme B', aktif: true, haftalikDakika: 480 },
    { id: 12, kod: 'IM-P', ad: 'Deneme pasif', aktif: false, haftalikDakika: 0 },
  ],
  kadro: [
    { isMerkeziId: 10, vardiyaId: 1, kisiIdleri: [7] },
    { isMerkeziId: 11, vardiyaId: null, kisiIdleri: [8] },
    { isMerkeziId: 11, vardiyaId: 2, kisiIdleri: [8] },
  ],
  kisiVardiyalari: [{ kisiId: 7, vardiyaId: 1 }],
  bugun: '2026-10-10',
};
const PERSONEL: VardiyaPersoneliCevabi = {
  personel: [
    { kisiId: 7, ad: 'Deneme Kişi', istasyonId: 3, isMerkeziId: 10, vardiyaId: 1 },
    { kisiId: 8, ad: 'Deneme Öteki', istasyonId: 4, isMerkeziId: 11, vardiyaId: null },
  ],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown; baslik: Record<string, string> }

function sunucuKur(kullanici: Kullanici, ek: Record<string, () => Response> = {}) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const baslik = Object.fromEntries(new Headers(secenek?.headers).entries());
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, baslik });
    const ozel = ek[`${yontem} ${yol.split('?')[0] ?? ''}`];
    if (ozel) return ozel();
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/vardiya-takvimi') return json(200, TAKVIM);
    if (yol === '/vardiya-personeli') return json(200, PERSONEL);
    if (yontem === 'POST') return json(200, TAKVIM);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: 'duzen' | 'personel' | 'takvim' = 'duzen') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const E = ekran === 'duzen' ? VardiyaEkrani : ekran === 'personel' ? PersonelEkrani : TakvimEkrani;
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><E /></BildirimSaglayici></QueryClientProvider>);
}

const postlar = (c: Cagri[]) => c.filter((x) => x.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Vardiya', () => {
  it('matris aktif iş merkezlerini gösterir; hücreye dokunmak o gün o vardiyayı açar ya da kapatır', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    const hucre = await screen.findByRole('button', { name: 'IM-A Pzt Gündüz' });
    expect(hucre.getAttribute('aria-pressed')).toBe('true');
    expect(hucre.textContent).toBe('G');
    expect(screen.queryByText('IM-P')).toBeNull();
    expect(screen.getByText('7,5 sa')).toBeTruthy();
    fireEvent.click(hucre);
    fireEvent.click(screen.getByRole('button', { name: 'IM-B Sal Gündüz' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar).map((p) => [p.yol, p.govde])).toEqual([
      ['/vardiya-matrisi/degistir', { isMerkeziId: 10, gun: 1, vardiyaId: 1, acik: false }],
      ['/vardiya-matrisi/degistir', { isMerkeziId: 11, gun: 2, vardiyaId: 1, acik: true }],
    ]);
  });

  it('haftayı uygula ve kapalı günleri temizle iki adımlıdır: ilk dokunuş sorar, ikincisi gönderir', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    const kopya = (await screen.findAllByRole('button', { name: 'Bu düzeni diğerlerine kopyala' }))[0]!;
    fireEvent.click(kopya);
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Emin misin? Tüm iş merkezlerine uygula' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiya-matrisi/hafta-uygula', govde: { kaynakIsMerkeziId: 10 } });
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü temizle' }));
    expect(postlar(cagrilar)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Emin misin? Buradaki günlerin hepsini sil' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[1]!.yol).toBe('/takvim-gunleri/temizle');
  });

  it('soru 142 b, 160 a: resmî tatil İK\'dan gelir, burada silinmez; Vardiya kapalı gün ekler, kendi günlerini (eski tatil dahil) kaldırır', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    await screen.findByText('29.10.2026 · Resmî tatil · Cumhuriyet Bayramı');
    expect(screen.queryByRole('button', { name: 'Resmî tatilleri ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: '2026-10-29 gününü kaldır' })).toBeNull();
    expect(screen.getByText('03.11.2026 · Tatil · Eski')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2026-11-03 gününü kaldır' })).toBeTruthy();
    expect(screen.getByText('Resmî tatiller İK ayarlarından girilir; burada yalnız kapalı gün eklenir. Geçmiş tarihli günler ayrı yetkiyle değişir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2026-11-02 gününü kaldır' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]!.yol).toBe('/takvim-gunleri/2026-11-02/kaldir');
    fireEvent.change(screen.getByLabelText('Kapalı gün tarihi'), { target: { value: '04.11.2026' } });
    fireEvent.blur(screen.getByLabelText('Kapalı gün tarihi'));
    fireEvent.change(screen.getByLabelText('Kapalı gün adı'), { target: { value: 'Sayım' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tarih ekle' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[1]).toMatchObject({ yol: '/takvim-gunleri', govde: { tarih: '2026-11-04', tur: 'kapali', ad: 'Sayım' } });
  });

  it('yeni vardiya istek kimliğiyle gider; güncelleme okunan sürümü ve bütün alanları taşır', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Vardiya' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]!.yol).toBe('/vardiyalar');
    expect(postlar(cagrilar)[0]!.baslik['istek-kimligi']).toMatch(/^[0-9a-f-]{36}$/);
    const kart = screen.getByLabelText('Gündüz vardiyası');
    fireEvent.click(within(kart).getByRole('button', { name: 'Gündüz 12:00 molasını kaldır' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[1]).toMatchObject({
      yol: '/vardiyalar/1/guncelle', govde: { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [], aktif: true, surum: 4 },
    });
    expect(postlar(cagrilar)[1]!.baslik['istek-kimligi']).toBeUndefined();
  });

  it('eski sürüm 409 hatasında takvim yeniden okunur ve kullanıcıya bildirilir', async () => {
    const cagrilar = sunucuKur(PLANLAMA, {
      'POST /vardiyalar/1/guncelle': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt değişti.', ayrinti: { neden: 'eski-surum' } } satisfies HataGovdesi),
    });
    ac();
    const kart = await screen.findByLabelText('Gündüz vardiyası');
    const anahtar = within(kart).getByRole('switch', { name: 'Gündüz kullanımda' });
    expect(anahtar.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(anahtar);
    expect(await screen.findByText('Vardiya başka biri tarafından değiştirildi; güncel hali yüklendi.')).toBeTruthy();
    expect(cagrilar.filter((c) => c.yol === '/vardiya-takvimi').length).toBeGreaterThan(1);
  });

  it('yazma yetkisi olmayan kişi düzeni görür, değiştiremez; geçmiş tatil soluk gösterilir', async () => {
    sunucuKur(IZLEYEN);
    ac();
    const hucre = await screen.findByRole('button', { name: 'IM-A Pzt Gündüz' });
    expect((hucre as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Vardiya' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tümünü temizle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bu düzeni diğerlerine kopyala' })).toBeNull();
    expect((screen.getByRole('switch', { name: 'Gündüz kullanımda' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('01.01.2026 · Resmî tatil · Yılbaşı').closest('li')?.className).toContain('tc-vr-gecmis');
    expect(screen.getByText('29.10.2026 · Resmî tatil · Cumhuriyet Bayramı').closest('li')?.className).not.toContain('tc-vr-gecmis');
    expect(screen.queryByRole('button', { name: '2026-11-02 gününü kaldır' })).toBeNull();
  });

  it('vardiya başına personel: çalışan ama kimsesiz vardiya işaretlenir, vardiyası seçilmeyen kişi o vardiyada sayılır; vardiya seçimi kişinin vardiyasını yazar', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac('personel');
    const tablo = (await screen.findByText('Vardiya başına personel')).closest('section')!;
    const satirA = within(tablo).getByText('IM-A').closest('tr')!;
    expect(within(satirA).getAllByRole('cell')[1]!.className).toBe('tc-vr-eksik');
    const satirB = within(tablo).getByText('IM-B').closest('tr')!;
    expect(within(satirB).getAllByRole('cell')[1]!.className).toBe('');
    expect(within(satirB).getAllByRole('cell')[2]!.textContent).toBe('1');
    expect(screen.queryByText('Deneme Öteki vardiyası')).toBeNull();
    fireEvent.change(screen.getByLabelText('Deneme Öteki vardiyası'), { target: { value: '2' } });
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/kisi-vardiyalari/8/belirle', govde: { vardiyaId: 2 } });
    fireEvent.change(screen.getByLabelText('Deneme Kişi vardiyası'), { target: { value: '' } });
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[1]!.govde).toEqual({ vardiyaId: null });
  });

  // Tek tanım: aynı veride İstasyonlar sayfası (Istasyonlar.test.tsx) da aynı sayıyı gösterir.
  it('vardiya başına personel: vardiyası seçilmeyen kişi iş merkezinin her açık vardiyasında sayılır', async () => {
    const takvim: TakvimCevabi = {
      ...TAKVIM,
      matris: [{ isMerkeziId: 10, gun: 1, vardiyaId: 1 }, { isMerkeziId: 10, gun: 1, vardiyaId: 2 }],
      kadro: [
        { isMerkeziId: 10, vardiyaId: null, kisiIdleri: [8, 9] },
        { isMerkeziId: 10, vardiyaId: 1, kisiIdleri: [7, 8, 9] },
        { isMerkeziId: 10, vardiyaId: 2, kisiIdleri: [8, 9] },
      ],
    };
    const personel: VardiyaPersoneliCevabi = {
      personel: [
        { kisiId: 7, ad: 'Deneme Kişi', istasyonId: 3, isMerkeziId: 10, vardiyaId: 1 },
        { kisiId: 8, ad: 'Deneme Bir', istasyonId: 3, isMerkeziId: 10, vardiyaId: null },
        { kisiId: 9, ad: 'Deneme İki', istasyonId: 3, isMerkeziId: 10, vardiyaId: null },
      ],
    };
    sunucuKur(PLANLAMA, { 'GET /vardiya-takvimi': () => json(200, takvim), 'GET /vardiya-personeli': () => json(200, personel) });
    ac('personel');
    const tablo = (await screen.findByText('Vardiya başına personel')).closest('section')!;
    const satir = within(tablo).getByText('IM-A').closest('tr')!;
    expect(within(satir).getAllByRole('cell').map((h) => h.textContent)).toEqual(['3', '2', '2']);
    // Sayıya dokununca liste o hücrenin kişilerine süzülür.
    fireEvent.click(within(satir).getByRole('button', { name: 'IM-A Akşam: 2 kişiyi listele' }));
    expect(screen.queryByLabelText('Deneme Kişi vardiyası')).toBeNull();
    expect(screen.getByLabelText('Deneme Bir vardiyası')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    expect(screen.getByLabelText('Deneme Kişi vardiyası')).toBeTruthy();
  });

  it('toplu matris: seçilen iş merkezlerine seçilen gün ve vardiya tek komutla eklenir; "yalnız bunlar" ve kopyalama iki adımlıdır', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    fireEvent.click(await screen.findByLabelText('IM-A seç'));
    fireEvent.click(screen.getByLabelText('IM-B seç'));
    const cubuk = screen.getByRole('region', { name: 'Toplu düzenleme' });
    expect(within(cubuk).getByText('2 iş merkezi seçili')).toBeTruthy();
    const ekle = within(cubuk).getByRole('button', { name: 'Ekle' }) as HTMLButtonElement;
    expect(ekle.disabled).toBe(true);
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Hafta sonu' }));
    fireEvent.click(within(cubuk).getByRole('button', { name: /^Akşam/ }));
    fireEvent.click(ekle);
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiya-matrisi/toplu-yaz', govde: { isMerkeziIdleri: [10, 11], gunler: [6, 7], vardiyaIdleri: [2], kip: 'ekle' } });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Yalnız bunlar olsun' }));
    expect(postlar(cagrilar)).toHaveLength(1);
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Emin misin? Seçili günler yeniden yazılır' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[1]!.govde).toMatchObject({ kip: 'ayarla' });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Seçimi bırak' }));
    expect(screen.queryByRole('region', { name: 'Toplu düzenleme' })).toBeNull();
  });

  it('toplu matris: kapsam dışı iş merkezi satırında yazılır; arama satırları süzer, "hepsini seç" yalnız görünenleri seçer', async () => {
    const cagrilar = sunucuKur(PLANLAMA, {
      'POST /vardiya-matrisi/kopyala': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.', ayrinti: { isMerkeziIdleri: [11] } } satisfies HataGovdesi),
    });
    ac();
    fireEvent.change(await screen.findByLabelText('İş merkezi ara'), { target: { value: 'im-b' } });
    expect(screen.queryByLabelText('IM-A seç')).toBeNull();
    fireEvent.click(screen.getByLabelText('Görünen iş merkezlerinin hepsini seç'));
    const cubuk = screen.getByRole('region', { name: 'Toplu düzenleme' });
    expect(within(cubuk).getByText('1 iş merkezi seçili')).toBeTruthy();
    fireEvent.change(within(cubuk).getByLabelText('Haftasını kopyala'), { target: { value: '10' } });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Seçilenlere kopyala' }));
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Emin misin? Seçilenlerin haftası değişir' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiya-matrisi/kopyala', govde: { kaynakIsMerkeziId: 10, hedefIsMerkeziIdleri: [11] } });
    const satir = (await screen.findByText('Yetkin yok, değişmedi')).closest('tr')!;
    expect(within(satir).getByText('IM-B')).toBeTruthy();
  });

  it('yazma yetkisi olmayan kişide seçim kutusu ve toplu düzenleme yoktur', async () => {
    sunucuKur(IZLEYEN);
    ac();
    await screen.findByRole('button', { name: 'IM-A Pzt Gündüz' });
    expect(screen.queryByLabelText('IM-A seç')).toBeNull();
    cleanup();
    sunucuKur(IZLEYEN);
    ac('personel');
    await screen.findByLabelText('Deneme Kişi vardiyası');
    expect(screen.queryByLabelText('Deneme Kişi seç')).toBeNull();
    expect(screen.queryByText(/Görünenlerin hepsini seç/)).toBeNull();
  });

  it('personel: süzgeç ve arama listeyi daraltır; özetteki sayı listeyi süzer; seçilenlere toplu vardiya tek komuttur', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac('personel');
    await screen.findByLabelText('Deneme Kişi vardiyası');
    fireEvent.change(screen.getByLabelText('Vardiya'), { target: { value: 'yok' } });
    expect(screen.queryByLabelText('Deneme Kişi vardiyası')).toBeNull();
    expect(screen.getByLabelText('Deneme Öteki vardiyası')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    fireEvent.change(screen.getByLabelText('Personel ara'), { target: { value: 'öteki' } });
    expect(screen.queryByLabelText('Deneme Kişi vardiyası')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    fireEvent.click(screen.getByRole('button', { name: 'IM-A Gündüz: 1 kişiyi listele' }));
    expect(screen.getByLabelText('Deneme Kişi vardiyası')).toBeTruthy();
    expect(screen.queryByLabelText('Deneme Öteki vardiyası')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));

    fireEvent.click(screen.getByLabelText(/Görünenlerin hepsini seç/));
    const cubuk = screen.getByRole('region', { name: 'Toplu vardiya atama' });
    expect(within(cubuk).getByText('2 kişi seçili')).toBeTruthy();
    fireEvent.change(within(cubuk).getByLabelText('Seçilenlerin vardiyası'), { target: { value: '2' } });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/kisi-vardiyalari/toplu-belirle', govde: { kisiIdleri: [7, 8], vardiyaId: 2 } });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Toplu vardiya atama' })).toBeNull());
  });

  it('personel: toplu atamada kapsam dışı kişi satırında yazılır, seçim kalır; "Seçilmedi" vardiyayı kaldırır', async () => {
    const cagrilar = sunucuKur(PLANLAMA, {
      'POST /kisi-vardiyalari/toplu-belirle': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.', ayrinti: { kisiIdleri: [8] } } satisfies HataGovdesi),
    });
    ac('personel');
    fireEvent.click(await screen.findByLabelText('Deneme Kişi seç'));
    fireEvent.click(screen.getByLabelText('Deneme Öteki seç'));
    const cubuk = screen.getByRole('region', { name: 'Toplu vardiya atama' });
    fireEvent.change(within(cubuk).getByLabelText('Seçilenlerin vardiyası'), { target: { value: 'yok' } });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]!.govde).toEqual({ kisiIdleri: [7, 8], vardiyaId: null });
    const rozet = await screen.findByText('Yetkin yok, değişmedi');
    expect(rozet.closest('.tc-vr-ad')?.textContent).toContain('Deneme Öteki');
    expect(within(cubuk).getByText('2 kişi seçili')).toBeTruthy();
  });

  it('çalışma takvimi seçilen kaynağın günlerini ve aralıklarını gösterir; bağlı olmayan kaynakta takvim yoktur', async () => {
    const tarihler = Array.from({ length: 14 }, (_, i) => `2026-10-${String(10 + i).padStart(2, '0')}`);
    const dolu: CalismaTakvimiCevabi = {
      takvim: {
        isMerkeziId: 10, vardiyaId: null,
        gunler: tarihler.map((tarih) => ({ tarih, dakika: tarih === '2026-10-12' ? 450 : 0, kapali: tarih === '2026-10-13' ? { tur: 'kapali', ad: null } : null })),
        araliklar: [{ baslangic: new Date(2026, 9, 12, 8, 0).toISOString(), bitis: new Date(2026, 9, 12, 12, 0).toISOString() }],
      },
    };
    let cevap: CalismaTakvimiCevabi = dolu;
    const cagrilar = sunucuKur(PLANLAMA, { 'GET /calisma-takvimi': () => json(200, cevap) });
    ac('takvim');
    const secim = await screen.findByLabelText('Kaynak') as HTMLSelectElement;
    expect(secim.value).toBe('is-merkezi:10');
    expect(await screen.findByText('08:00–12:00')).toBeTruthy();
    expect(screen.getByRole('table').closest('.tc-vr-matris-kap')).toBeTruthy();
    expect(screen.getByText('7,5 sa')).toBeTruthy();
    expect(screen.getByText('Kapalı')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/calisma-takvimi?tur=is-merkezi&id=10&baslangic=2026-10-10&bitis=2026-10-23')).toBe(true);
    cevap = { takvim: null };
    fireEvent.change(secim, { target: { value: 'kisi:8' } });
    expect(await screen.findByText('Bu kaynak bir iş merkezine bağlı değil; takvimi yok.')).toBeTruthy();
  });

  it('saat alanı 24 saatlik metindir: odak çıkınca normalleşip kaydedilir, geçersiz metin kaydedilmez ve eski değere döner', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    const alan = await screen.findByLabelText('Gündüz başlangıç') as HTMLInputElement;
    expect(alan.type).toBe('text');
    expect(alan.value).toBe('08:00');
    fireEvent.change(alan, { target: { value: '04:00 PM' } });
    fireEvent.blur(alan);
    expect(alan.value).toBe('08:00');
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.change(alan, { target: { value: '9:30' } });
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.blur(alan);
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiyalar/1/guncelle', govde: { baslangic: '09:30', bitis: '16:00', surum: 4 } });
  });

  it('art arda iki saat değişikliği sırayla gider: ikincisi ilkinin yanıtındaki sürüm ve değerle kurulur', async () => {
    const cagrilar = sunucuKur(PLANLAMA, {
      'POST /vardiyalar/1/guncelle': () => {
        const govde = postlar(cagrilar).at(-1)?.govde as { baslangic: string; bitis: string; surum: number };
        const [ilk, ...diger] = TAKVIM.vardiyalar;
        return json(200, { ...TAKVIM, vardiyalar: [{ ...ilk!, baslangic: govde.baslangic, bitis: govde.bitis, surum: govde.surum + 1 }, ...diger] } satisfies TakvimCevabi);
      },
    });
    ac();
    const bas = await screen.findByLabelText('Gündüz başlangıç');
    const bit = screen.getByLabelText('Gündüz bitiş');
    fireEvent.change(bas, { target: { value: '22:00' } });
    fireEvent.blur(bas);
    fireEvent.change(bit, { target: { value: '06:00' } });
    fireEvent.blur(bit);
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar)[0]).toMatchObject({ govde: { baslangic: '22:00', bitis: '16:00', surum: 4 } });
    expect(postlar(cagrilar)[1]).toMatchObject({ govde: { baslangic: '22:00', bitis: '06:00', surum: 5 } });
  });

  it('mola satırı düğmeyle açılır; eklenince gövdeye girer, vazgeçilince kapanır', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    const kart = await screen.findByLabelText('Akşam vardiyası');
    expect(within(kart).queryByLabelText('Mola başlangıç')).toBeNull();
    fireEvent.click(within(kart).getByRole('button', { name: 'Mola ekle' }));
    fireEvent.click(within(kart).getByRole('button', { name: 'Vazgeç' }));
    expect(within(kart).queryByLabelText('Mola başlangıç')).toBeNull();
    fireEvent.click(within(kart).getByRole('button', { name: 'Mola ekle' }));
    fireEvent.click(within(kart).getByRole('button', { name: 'Ekle' }));
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.change(within(kart).getByLabelText('Mola başlangıç'), { target: { value: '20:00' } });
    fireEvent.blur(within(kart).getByLabelText('Mola başlangıç'));
    fireEvent.change(within(kart).getByLabelText('Mola bitiş'), { target: { value: '20:30' } });
    fireEvent.blur(within(kart).getByLabelText('Mola bitiş'));
    fireEvent.click(within(kart).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiyalar/2/guncelle', govde: { molalar: [{ baslangic: '20:00', bitis: '20:30' }], surum: 1 } });
    expect(within(kart).queryByLabelText('Mola başlangıç')).toBeNull();
  });

  it('çalışma takvimi başlangıcı GG.AA.YYYY yazılır ve ISO olarak sorgulanır', async () => {
    const cagrilar = sunucuKur(PLANLAMA, { 'GET /calisma-takvimi': () => json(200, { takvim: null }) });
    ac('takvim');
    const alan = await screen.findByDisplayValue('10.10.2026');
    fireEvent.change(alan, { target: { value: '20.10.2026' } });
    fireEvent.blur(alan);
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/calisma-takvimi?tur=is-merkezi&id=10&baslangic=2026-10-20&bitis=2026-11-02')).toBe(true));
  });

  it('tarih alanı yazarken uygulanmaz; Enter ve odak çıkışı tamamlanmış değeri uygular, boşaltılan alan eski değere döner', async () => {
    const cagrilar = sunucuKur(PLANLAMA, { 'GET /calisma-takvimi': () => json(200, { takvim: null }) });
    ac('takvim');
    const alan = await screen.findByDisplayValue('10.10.2026') as HTMLInputElement;
    const okunan = () => cagrilar.filter((c) => c.yol.startsWith('/calisma-takvimi')).length;
    await waitFor(() => expect(okunan()).toBeGreaterThan(0));
    const once = okunan();
    fireEvent.change(alan, { target: { value: '2.1.2026' } });
    expect(okunan()).toBe(once);
    fireEvent.keyDown(alan, { key: 'Enter' });
    await waitFor(() => expect(cagrilar.some((c) => c.yol.includes('baslangic=2026-01-02'))).toBe(true));
    expect(alan.value).toBe('02.01.2026');
    fireEvent.change(alan, { target: { value: '' } });
    fireEvent.blur(alan);
    expect(alan.value).toBe('02.01.2026');
  });

  it('vardiya saatinde bir hane silip düzeltmek değeri kaydırmaz; boşaltılan saat eski değere döner', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac();
    const alan = await screen.findByLabelText('Gündüz bitiş') as HTMLInputElement;
    fireEvent.change(alan, { target: { value: '16:0' } });
    fireEvent.change(alan, { target: { value: '16:00' } });
    fireEvent.change(alan, { target: { value: '' } });
    fireEvent.blur(alan);
    expect(alan.value).toBe('16:00');
    expect(postlar(cagrilar)).toHaveLength(0);
  });

  it('makine listesi yalnız istasyon sayfasını görene ya da istasyon yazana istenir', async () => {
    const yetkisiz = sunucuKur(PLANLAMA);
    ac('takvim');
    await screen.findByLabelText('Kaynak');
    await waitFor(() => expect(yetkisiz.some((c) => c.yol === '/istasyonlar/secim')).toBe(true));
    expect(yetkisiz.some((c) => c.yol === '/makineler')).toBe(false);
    cleanup();
    const yetkili = sunucuKur({ ...PLANLAMA, islemler: [...PLANLAMA.islemler, 'sayfa.istasyonlar'] });
    ac('takvim');
    await waitFor(() => expect(yetkili.some((c) => c.yol === '/makineler')).toBe(true));
  });

  describe('çalışma takvimi: istasyon ve makine', () => {
    const SECIM: IstasyonSecimiCevabi = {
      gruplar: [{ isMerkeziId: 10, isMerkeziKod: 'IM-A', isMerkeziAd: 'Deneme A', istasyonlar: [{ id: 3, kod: 'IS-1', ad: 'Deneme istasyon', isMerkeziId: 10, tip: 'talasli', aktif: true }] }],
    };
    const MAKINELER: MakinelerCevabi = {
      makineler: [
        { id: 5, kod: 'MK-1', ad: 'Deneme makine', tur: null, markaModel: null, seriNo: null, istasyonId: 3, baglantiTuru: null, baglantiAdresi: null, aktif: true, surum: 1 },
        { id: 6, kod: 'MK-P', ad: 'Deneme pasif makine', tur: null, markaModel: null, seriNo: null, istasyonId: null, baglantiTuru: null, baglantiAdresi: null, aktif: false, surum: 1 },
      ],
    };
    const takvimCevabi: CalismaTakvimiCevabi = { takvim: null };

    it('istasyonlar ve aktif makineler kaynak listesine girer; seçilince tür ve kimlikle okunur', async () => {
      const cagrilar = sunucuKur(ISTASYON_OKUR, {
        'GET /istasyonlar/secim': () => json(200, SECIM),
        'GET /makineler': () => json(200, MAKINELER),
        'GET /calisma-takvimi': () => json(200, takvimCevabi),
      });
      ac('takvim');
      const secim = await screen.findByLabelText('Kaynak') as HTMLSelectElement;
      await screen.findByRole('option', { name: 'İstasyon: IS-1 Deneme istasyon' });
      await screen.findByRole('option', { name: 'Makine: MK-1 Deneme makine' });
      expect(screen.queryByRole('option', { name: /MK-P/ })).toBeNull();
      fireEvent.change(secim, { target: { value: 'istasyon:3' } });
      await waitFor(() => expect(cagrilar.some((c) => c.yol === '/calisma-takvimi?tur=istasyon&id=3&baslangic=2026-10-10&bitis=2026-10-23')).toBe(true));
      fireEvent.change(secim, { target: { value: 'makine:5' } });
      await waitFor(() => expect(cagrilar.some((c) => c.yol === '/calisma-takvimi?tur=makine&id=5&baslangic=2026-10-10&bitis=2026-10-23')).toBe(true));
      expect(await screen.findByText('Bu kaynak bir iş merkezine bağlı değil; takvimi yok.')).toBeTruthy();
    });

    it('makine listesi okunamazsa (yetki) istasyonlar ve iş merkezleri seçilebilir kalır', async () => {
      sunucuKur(ISTASYON_OKUR, {
        'GET /istasyonlar/secim': () => json(200, SECIM),
        'GET /makineler': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' } satisfies HataGovdesi),
      });
      ac('takvim');
      await screen.findByRole('option', { name: 'İstasyon: IS-1 Deneme istasyon' });
      expect(screen.getByRole('option', { name: 'İş merkezi: IM-A Deneme A' })).toBeTruthy();
      expect(screen.queryByRole('option', { name: /Makine:/ })).toBeNull();
    });
  });
});
