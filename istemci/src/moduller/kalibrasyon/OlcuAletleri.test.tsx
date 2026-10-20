import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Alet, AletAyrintiCevabi, ListeCevabi, Tur, TurListesiCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { AletTurleri, OlcuAletleri } from './OlcuAletleri.tsx';
import { aletlerCsv } from './gosterim.ts';

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Kalite', islemler: ['kalibrasyon.oku', 'kalibrasyon.yaz'] };
const OKUR: Kullanici = { id: 2, ad: 'Deneme Müdür', islemler: ['kalibrasyon.oku'] };

const alet = (ek: Partial<Alet> & Pick<Alet, 'id' | 'no'>): Alet => ({
  turId: 2, tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 365, kullanimDisi: false, kullanimDisiNedeni: null,
  sonKalibrasyon: null, vade: null, kalanGun: null, durum: 'kayit-yok', surum: 1, ...ek,
});

const GECMIS = alet({
  id: 1, no: 'DNM-1', ad: 'Dış çap', olcmeAraligi: '0-25', yer: 'Dolap A', sonKalibrasyon: '2025-01-10', vade: '2026-01-10', kalanGun: -270, durum: 'gecmis', surum: 2,
});
const KAYITSIZ = alet({ id: 2, no: 'DNM-2' });
const YAKLASAN = alet({ id: 3, no: 'DNM-3', sonKalibrasyon: '2025-10-20', vade: '2026-10-20', kalanGun: 14, durum: 'yaklasan' });

const LISTE = {
  aletler: [GECMIS, YAKLASAN, KAYITSIZ],
  ozet: { vadesiGecen: 1, yaklasan: 1 },
} satisfies ListeCevabi;

const TURLER: Tur[] = [
  { id: 1, ad: 'Mikrometre', aktif: true, aletSayisi: 0, surum: 1 },
  { id: 2, ad: 'Kumpas', aktif: true, aletSayisi: 3, surum: 4 },
  { id: 3, ad: 'Eski tür', aktif: false, aletSayisi: 0, surum: 1 },
];

const AYRINTI_KAYITLI = {
  ...GECMIS,
  sonKayitlar: [{ id: 9, tarih: '2025-01-10', sonuc: 'uygun', sertifikaNo: 'C-1', aciklama: null, kisiAd: 'Deneme Kalite' }],
  kayitSayisi: 1,
} satisfies AletAyrintiCevabi;
const AYRINTI_BOS = { ...KAYITSIZ, sonKayitlar: [], kayitSayisi: 0 } satisfies AletAyrintiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yontem: string; yol: string; govde: unknown; istekKimligi: string | undefined }

function sunucuKur(kullanici: Kullanici, liste: ListeCevabi = LISTE, kayitCevabi: () => Response = () => json(200, AYRINTI_KAYITLI)) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const istekKimligi = (ayar?.headers as Record<string, string> | undefined)?.[ISTEK_KIMLIGI_BASLIGI];
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined, istekKimligi });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol.startsWith('/olcu-aletleri?ara=')) {
      const ara = decodeURIComponent(yol.split('=')[1] ?? '').toLowerCase();
      const aletler = LISTE.aletler.filter((a) => a.no.toLowerCase().includes(ara));
      return json(200, { ...LISTE, aletler } satisfies ListeCevabi);
    }
    if (yol === '/olcu-aletleri' && yontem === 'GET') return json(200, liste);
    if (yol === '/olcu-aletleri/1') return json(200, AYRINTI_KAYITLI);
    if (yol === '/olcu-aletleri/2') return json(200, AYRINTI_BOS);
    if (yol === '/olcu-aleti-turleri' && yontem === 'GET') return json(200, { turler: TURLER } satisfies TurListesiCevabi);
    if (yontem === 'POST' && yol === '/olcu-aletleri') return json(200, AYRINTI_BOS);
    if (yontem === 'POST' && yol === '/olcu-aletleri/1/kalibrasyon-kaydet') return kayitCevabi();
    if (yontem === 'POST' && yol === '/olcu-aleti-turleri/2/guncelle') return json(200, { turler: TURLER } satisfies TurListesiCevabi);
    if (yontem === 'POST' && yol === '/olcu-aleti-turleri') {
      return json(409, { kod: 'CAKISMA', mesaj: 'Bu tür adı kullanılıyor.' });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(bolum: 'aletler' | 'turler' = 'aletler') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ekran = bolum === 'aletler' ? <OlcuAletleri /> : <AletTurleri />;
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satirlar = () => within(screen.getByRole('table', { name: 'Ölçü aletleri' })).getAllByRole('row').slice(1);
const listeBekle = () => screen.findByRole('table', { name: 'Ölçü aletleri' });

describe('Ölçü aletleri listesi', () => {
  it('aletleri, durumlarını ve özet sayılarını gösterir; kaydı olmayanın vadesi "yok" yazar', async () => {
    sunucuKur(OKUR);
    ac();
    await listeBekle();
    const hucre = (satir: HTMLElement, baslik: string) => within(satir).getAllByRole('cell').find((h) => h.getAttribute('data-baslik') === baslik)?.textContent;
    const [gecmis, yaklasan, kayitsiz] = satirlar() as [HTMLElement, HTMLElement, HTMLElement];
    expect(hucre(gecmis, 'Durum')).toBe('Kalibrasyonu geçmiş');
    expect(hucre(gecmis, 'Vade')).toBe('10.01.2026');
    expect(hucre(yaklasan, 'Durum')).toBe('14 gün kaldı');
    expect(hucre(kayitsiz, 'Durum')).toBe('Kalibrasyon kaydı yok');
    expect(hucre(kayitsiz, 'Vade')).toBe('yok');
    expect(screen.getByText('Kalibrasyonu geçmiş: 1')).toBeTruthy();
    expect(screen.getByText('30 gün içinde: 1')).toBeTruthy();
  });

  it('kalan günü bilinmeyen yaklaşan alette gün sayısı uydurulmaz', async () => {
    const sayisiz = alet({ id: 4, no: 'DNM-4', sonKalibrasyon: '2025-10-20', vade: '2026-10-20', kalanGun: null, durum: 'yaklasan' });
    sunucuKur(OKUR, { aletler: [sayisiz], ozet: { vadesiGecen: 0, yaklasan: 1 } });
    ac();
    await listeBekle();
    const [satir] = satirlar() as [HTMLElement];
    const hucre = (baslik: string) => within(satir).getAllByRole('cell').find((h) => h.getAttribute('data-baslik') === baslik)?.textContent;
    expect(hucre('Vade')).toBe('20.10.2026');
    expect(hucre('Durum')).toBe('Vadesi yaklaşıyor');
    expect(satir.textContent).not.toMatch(/\d+ gün/);
  });

  it('arama sunucuya gider ve listeyi daraltır', async () => {
    const cagrilar = sunucuKur(OKUR);
    ac();
    await listeBekle();
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'dnm-2' } });
    await waitFor(() => expect(satirlar().length).toBe(1));
    expect(cagrilar.some((c) => c.yol === '/olcu-aletleri?ara=dnm-2')).toBe(true);
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'yok-yok' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Aramaya uyan alet yok'));
  });
});

describe('CSV dışa aktarma', () => {
  it('sütunlar Arkon karşılığıyla aynı; tarih ve durum ekrandaki gibi, boş alan boş kalır, tırnak kaçar', () => {
    const tirnakli = alet({ id: 5, no: 'DNM-5', ad: 'İç "çap"' });
    const csv = aletlerCsv([GECMIS, tirnakli]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [baslik, gecmis, ikinci] = csv.slice(1).split('\r\n');
    expect(baslik).toBe('"Alet no";"Tür";"Ad";"Ölçme aralığı";"Yer";"Periyot (gün)";"Son kalibrasyon";"Vade";"Durum"');
    expect(gecmis).toBe('"DNM-1";"Kumpas";"Dış çap";"0-25";"Dolap A";"365";"10.01.2025";"10.01.2026";"Kalibrasyonu geçmiş"');
    expect(ikinci).toBe('"DNM-5";"Kumpas";"İç ""çap""";"";"";"365";"";"";"Kalibrasyon kaydı yok"');
  });

  it('okuma yetkisi olan ekrandaki satırları indirir; liste boşken düğme kapalı', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    const tikla = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    sunucuKur(OKUR);
    ac();
    await listeBekle();
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    expect(tikla).toHaveBeenCalledTimes(1);
    const metin = await new Promise<string>((coz) => { const r = new FileReader(); r.onload = () => coz(r.result as string); r.readAsText(blobs[0]!); });
    expect(metin.split('\r\n')).toHaveLength(4);
    tikla.mockRestore();
    cleanup();
    sunucuKur(OKUR, { aletler: [], ozet: { vadesiGecen: 0, yaklasan: 0 } });
    ac();
    await screen.findByText('Henüz ölçü aleti yok');
    expect((screen.getByRole('button', { name: /CSV/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('yetki', () => {
  it('yalnız okuma yetkisi olan yazma düğmesi görmez', async () => {
    sunucuKur(OKUR);
    ac();
    await listeBekle();
    expect(screen.queryByRole('button', { name: 'Alet ekle' })).toBeNull();
    fireEvent.click(satirlar()[0] as HTMLElement);
    await screen.findByText('Son kalibrasyon kayıtları');
    expect(screen.queryByRole('button', { name: 'Kalibrasyon kaydet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
  });

  it('yazma yetkisi olan alet ekleyebilir; tür listesinde pasif tür seçilemez', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac();
    await listeBekle();
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/olcu-aleti-turleri')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Alet ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Alet ekle' });
    const secenekler = within(pencere).getAllByRole('option').map((o) => o.textContent);
    expect(secenekler).toEqual(['Seçiniz', 'Mikrometre', 'Kumpas']);
    fireEvent.change(within(pencere).getByLabelText(/Alet no/), { target: { value: 'yeni-1' } });
    fireEvent.change(within(pencere).getByLabelText(/Tür/), { target: { value: '1' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yontem === 'POST' && c.yol === '/olcu-aletleri')?.govde).toEqual({
      no: 'yeni-1', turId: 1, ad: '', olcmeAraligi: '', yer: '', periyotGun: 365,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('alet ayrıntısı', () => {
  it('kaydı olan aletin son kayıtlarını gösterir ve silme düğmesi vermez; kalibrasyon kaydı gönderir', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac();
    await listeBekle();
    fireEvent.click(satirlar()[0] as HTMLElement);
    await screen.findByText('Son kalibrasyon kayıtları');
    expect(screen.getByText(/C-1/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Kalibrasyon kaydet' }));
    const form = await screen.findByRole('dialog', { name: 'Kalibrasyon kaydet: DNM-1' });
    fireEvent.change(within(form).getByLabelText(/Sertifika no/), { target: { value: 'C-2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/olcu-aletleri/1/kalibrasyon-kaydet')?.govde).toEqual({
      sonuc: 'uygun', sertifikaNo: 'C-2', aciklama: '',
    }));
  });

  it('kalibrasyon kaydı istek kimliğiyle gider; hatadan sonra yeniden kaydetme aynı kimliği kullanır', async () => {
    let ilk = true;
    const cagrilar = sunucuKur(YAZAR, LISTE, () => {
      if (!ilk) return json(200, AYRINTI_KAYITLI);
      ilk = false;
      return json(400, { kod: 'DOGRULAMA', mesaj: 'Deneme reddi.' });
    });
    ac();
    await listeBekle();
    fireEvent.click(satirlar()[0] as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Kalibrasyon kaydet' }));
    const form = await screen.findByRole('dialog', { name: 'Kalibrasyon kaydet: DNM-1' });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Deneme reddi.');
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kalibrasyon kaydet: DNM-1' })).toBeNull());
    const kimlikler = cagrilar.filter((c) => c.yol === '/olcu-aletleri/1/kalibrasyon-kaydet').map((c) => c.istekKimligi);
    expect(kimlikler).toHaveLength(2);
    expect(kimlikler[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(kimlikler[1]).toBe(kimlikler[0]);
  });

  it('kaydı olmayan alet silinebilir', async () => {
    sunucuKur(YAZAR);
    ac();
    await listeBekle();
    fireEvent.click(satirlar()[2] as HTMLElement);
    await screen.findByRole('button', { name: 'Sil' });
    expect(screen.getAllByText('yok').length).toBeGreaterThan(0);
  });
});

describe('türler', () => {
  it('tür listesi aktif ve pasif türleri alet sayısıyla gösterir; çakışma iletisi formda kalır', async () => {
    sunucuKur(YAZAR);
    ac('turler');
    const tablo = await screen.findByRole('table', { name: 'Alet türleri' });
    expect(within(tablo).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      'Mikrometre0Aktif', 'Kumpas3Aktif', 'Eski tür0Pasif',
    ]);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('table', { name: 'Ölçü aletleri' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alet ekle' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tür ekle' }));
    const form = await screen.findByRole('dialog', { name: 'Tür ekle' });
    fireEvent.change(within(form).getByLabelText(/Tür adı/), { target: { value: 'Kumpas' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Bu tür adı kullanılıyor.');
  });

  it('tür düzenlemesi okunan sürümü gönderir', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac('turler');
    const tablo = await screen.findByRole('table', { name: 'Alet türleri' });
    fireEvent.click(within(tablo).getByText('Kumpas'));
    const form = await screen.findByRole('dialog', { name: 'Türü düzenle' });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/olcu-aleti-turleri/2/guncelle')?.govde)
      .toEqual({ ad: 'Kumpas', aktif: true, surum: 4 }));
  });
});

describe('alet düzenleme', () => {
  it('düzenleme okunan sürümü gönderir', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac();
    await listeBekle();
    fireEvent.click(satirlar()[0] as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    const form = await screen.findByRole('dialog', { name: /Aleti düzenle/ });
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/olcu-aletleri/1/guncelle')?.govde).toMatchObject({ no: 'DNM-1', surum: 2 }));
  });
});
