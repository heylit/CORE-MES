import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { EmirCevabi, KararSatiri, OlayListeCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { EmirDetay } from './EmirDetay.tsx';

const HEPSI = [
  'degisiklik-yonetimi.revizyon-hazirla', 'degisiklik-yonetimi.yayinla', 'degisiklik-yonetimi.karar-ver', 'degisiklik-yonetimi.mrb-karar',
  'degisiklik-yonetimi.fai-onayla', 'degisiklik-yonetimi.kapat',
] as const;
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: [...HEPSI] };
const KARAR_VEREN: Kullanici = { id: 3, ad: 'Deneme Planlama', islemler: ['degisiklik-yonetimi.karar-ver'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['degisiklik-yonetimi.talep-ac'] };

const kisi = { kisiId: 1, kisiAdi: 'Deneme Proses', zaman: '2026-10-01T09:00:00+03:00' };
const KARAR_ONAYLI: KararSatiri = {
  id: 31, hedef: 'emir', hedefId: 501, hedefEtiketi: 'UE-501', onerilenKod: 'kalanlari_gecir', mod: 'onayli', gerekce: 'İlk operasyon bitti.',
  izinliKodlar: ['kalanlari_gecir', 'beklet', 'eskiyle_tamamla_sapma'], verilenKod: null, veren: null, sapmaReferansi: null, not: null,
};
const KARAR_MRB: KararSatiri = {
  ...KARAR_ONAYLI, id: 32, hedef: 'stok', hedefId: 77, hedefEtiketi: null, onerilenKod: 'hurda', mod: 'mrb', gerekce: 'Uyumsuz stok.',
  izinliKodlar: ['hurda', 'rework', 'beklet'],
};
const EMIR: EmirCevabi = {
  id: 7, no: 'ECO-0007', baslik: 'Delik çapı değişikliği', sinif: 'D2', durum: 'yayina_hazir', talep: { id: 3, no: 'ECR-0003' },
  musteriReferansi: null,
  kalemler: [{
    id: 11, malzeme: { malzemeId: 41, kod: 'PRC-001', ad: 'Örnek parça' },
    eskiCizimRevizyonu: { id: 5, etiket: 'B' }, yeniCizimRevizyonu: null, eskiRotaRevizyonu: { id: 6, etiket: 'R2' }, yeniRotaRevizyonu: null,
    eskiYeniyeUyar: 'evet', yeniEskiyeUyar: 'evet', yeniParcaNoGerekir: false, yeniParcaNo: null, yeniParcaAdi: null, ozet: 'Delik büyüdü.',
  }],
  gecerlilik: null, kararlar: [], fai: [], kapanisKosullari: [], hurdaMaliyeti: null, reworkMaliyeti: null,
  koordinator: kisi, kapanis: null,
  gecmis: [{ ...kisi, olay: 'emir_acildi', imzaAnlami: null, aciklama: null, ozet: 'ECO açıldı' }],
  surum: 4,
};
const OLAYLAR: OlayListeCevabi = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yol: string; yontem: string; govde: unknown }

function sunucuKur(emir: EmirCevabi, kullanici: Kullanici = YONETICI, komut: (yol: string) => Response = () => json(200, {})) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yol, yontem, govde: secenek?.body ? JSON.parse(String(secenek.body)) : null });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'POST') return komut(yol);
    if (yol === `/degisiklik-yonetimi/emirler/${emir.id}`) return json(200, emir);
    if (yol.startsWith('/degisiklik-yonetimi/olaylar')) return json(200, OLAYLAR);
    if (yol === '/degisiklik-yonetimi/talepler/3') return json(404, { kod: 'BULUNAMADI', mesaj: 'Talep bulunamadı.' });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac(adres = '/degisiklik-yonetimi/emirler/7') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes><Route path="/degisiklik-yonetimi/emirler/:id" element={<EmirDetay />} /></Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}
const komutlar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ECO detay', () => {
  it('künye, aşama şeridi ve yayın onayındaki sıradaki adım gösterilir', async () => {
    sunucuKur(EMIR);
    ac();
    const kunye = await screen.findByLabelText('Değişiklik emri künyesi');
    expect(within(kunye).getAllByText('ECO-0007').length).toBeGreaterThan(0);
    expect(within(kunye).getByText('D2 Tasarım, Class II')).toBeTruthy();
    expect(within(kunye).getByText('Belirlenmedi')).toBeTruthy();
    const asamalar = screen.getByRole('list', { name: 'Değişiklik emri aşamaları' });
    expect(within(asamalar).getByText('Yayın onayı').closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(within(asamalar).getByText('Deneme Proses, 01.10.2026')).toBeTruthy();
    expect(screen.getByText('Sıradaki adım: geçerliliği belirleyip yayınlayın')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ECR-0003' })).toBeTruthy();
  });

  it('seri geçerliliğiyle yayın imzalı gövdeyle gider; yayından sonra kararlar sekmesi açılır', async () => {
    const istekler = sunucuKur(EMIR);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Geçerlilik ve yayın' }));
    const pencere = await screen.findByRole('dialog', { name: 'Geçerlilik ve yayın: ECO-0007' });
    expect(within(pencere).getByText('Yayın ve geçerliliği onaylıyorum')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve yayınla' }));
    expect(await within(pencere).findByText('İlk seri numarasını yazın.')).toBeTruthy();
    expect(komutlar(istekler)).toHaveLength(0);
    fireEvent.change(within(pencere).getByLabelText('İlk seri numarası'), { target: { value: '34' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve yayınla' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(1));
    expect(komutlar(istekler)[0]).toEqual({
      yol: '/degisiklik-yonetimi/emirler/7/yayinla', yontem: 'POST',
      govde: { gecerlilik: { tur: 'seri', sonUrunMalzemeId: 41, ilkSeri: 34 }, aciklama: '', surum: 4 },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('tab', { name: /Etki ve kararlar/ }).getAttribute('aria-selected')).toBe('true'));
  });

  it('proses sınıfında seri geçerliliği sunulmaz', async () => {
    sunucuKur({ ...EMIR, sinif: 'P2' });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Geçerlilik ve yayın' }));
    const tip = within(await screen.findByRole('dialog')).getByLabelText('Geçerlilik tipi');
    expect(within(tip).queryByRole('option', { name: 'Seri numarasından itibaren' })).toBeNull();
    expect((tip as HTMLSelectElement).value).toBe('tum');
  });

  it('eski sürümde yayına gönderme hatası bildirilir ve emir yeniden okunur', async () => {
    const istekler = sunucuKur({ ...EMIR, durum: 'revizyon_hazirlaniyor' }, YONETICI,
      () => json(409, { kod: 'CAKISMA', mesaj: 'Bu kayıt siz açtıktan sonra değiştirildi.', ayrinti: { neden: 'eski-surum' } }));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yayın onayına gönder' }));
    expect(await screen.findByText('Bu kayıt siz açtıktan sonra değiştirildi.')).toBeTruthy();
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/degisiklik-yonetimi/emirler/7').length).toBeGreaterThan(1));
  });

  it('onaylı karar karar ucuna, MRB kararı mrb-karar ucuna imzayla gider; toplu onay yalnız MRB olmayanı sayar', async () => {
    const istekler = sunucuKur({ ...EMIR, durum: 'karar', kararlar: [KARAR_ONAYLI, KARAR_MRB] });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Disposition kararları' });
    expect(await screen.findByRole('button', { name: 'Yetkimdeki önerileri onayla (1)' })).toBeTruthy();
    const [, onayli, mrb] = within(tablo).getAllByRole('row');
    fireEvent.click(within(onayli!).getByRole('button', { name: 'Karar ver' }));
    let pencere = await screen.findByRole('dialog', { name: 'Disposition onayı: Emir UE-501' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve uygula' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(1));
    expect(komutlar(istekler)[0]).toMatchObject({ yol: '/degisiklik-yonetimi/emirler/7/karar', govde: { kararId: 31, kod: 'kalanlari_gecir', surum: 4 } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(within(mrb!).getByRole('button', { name: 'Karar ver' }));
    pencere = await screen.findByRole('dialog', { name: 'MRB kararı: Stok #77' });
    expect(within(pencere).getByText('MRB kararını onaylıyorum')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve uygula' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(2));
    expect(komutlar(istekler)[1]).toMatchObject({ yol: '/degisiklik-yonetimi/emirler/7/mrb-karar', govde: { kararId: 32, kod: 'hurda' } });
  });

  it('sapma referansı yazılmadan sapma kararı açılmaz; erteleme imzasız gider', async () => {
    const istekler = sunucuKur({ ...EMIR, durum: 'karar', kararlar: [KARAR_ONAYLI] });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Disposition kararları' });
    const secim = within(tablo).getByLabelText('Emir UE-501 kararı');
    fireEvent.change(secim, { target: { value: 'eskiyle_tamamla_sapma' } });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Karar ver' }));
    expect(await within(tablo).findByText('Sapma için onay referansını yazın.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(secim, { target: { value: 'beklet' } });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Karar ver' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(1));
    expect(komutlar(istekler)[0]).toMatchObject({ yol: '/degisiklik-yonetimi/emirler/7/karar', govde: { kod: 'beklet', aciklama: null } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('karar-ver yetkisi MRB kararını açmaz; yetkisiz kişi yalnız okur', async () => {
    sunucuKur({ ...EMIR, durum: 'karar', kararlar: [KARAR_ONAYLI, KARAR_MRB] }, KARAR_VEREN);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Disposition kararları' });
    const [, onayli, mrb] = within(tablo).getAllByRole('row');
    await within(onayli!).findByRole('button', { name: 'Karar ver' });
    expect(within(mrb!).queryByRole('button', { name: 'Karar ver' })).toBeNull();
    expect((within(mrb!).getByLabelText('Stok #77 kararı') as HTMLSelectElement).disabled).toBe(true);
    cleanup();

    const istekler = sunucuKur({ ...EMIR, durum: 'karar', kararlar: [KARAR_ONAYLI] }, OKUYUCU);
    ac();
    const okunan = await screen.findByRole('table', { name: 'Disposition kararları' });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    await screen.findByText('Kalanları yeni revizyona geçir');
    await new Promise((bitti) => { setTimeout(bitti, 0); });
    expect(within(okunan).queryByRole('button', { name: 'Karar ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yetkimdeki önerileri onayla/ })).toBeNull();
  });

  it('eksik kapanış koşulu kapatmayı kapatır; bağlı olmayan koşul kapatmaya izin verir', async () => {
    const kosullar = [{ kosul: 'kararlar', durum: 'tamam', ayrinti: null }, { kosul: 'fai', durum: 'eksik', ayrinti: '1 FAI bekliyor' }] as const;
    sunucuKur({ ...EMIR, durum: 'dogrulama', kapanisKosullari: [...kosullar] });
    ac();
    const dugmeler = await screen.findAllByRole('button', { name: 'ECO’yu kapat' });
    expect(dugmeler.every((d) => (d as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText('Açık')).toBeTruthy();
    cleanup();

    const istekler = sunucuKur({ ...EMIR, durum: 'dogrulama', kapanisKosullari: [{ kosul: 'kararlar', durum: 'tamam', ayrinti: null }, { kosul: 'uyumsuz_seri', durum: 'bilinmiyor', ayrinti: null }] });
    ac();
    const [ilk] = await screen.findAllByRole('button', { name: 'ECO’yu kapat' });
    expect((ilk as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ilk!);
    const pencere = await screen.findByRole('dialog', { name: 'Kapanış: ECO-0007' });
    expect(within(pencere).getByText('Bilinmiyor')).toBeTruthy();
    expect(within(pencere).getByText('Hurda —, rework —.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'İmzala ve kapat' }));
    await waitFor(() => expect(komutlar(istekler)).toEqual([{ yol: '/degisiklik-yonetimi/emirler/7/kapat', yontem: 'POST', govde: { aciklama: '', surum: 4 } }]));
  });

  it('revizyon hazırlığında değiştirilebilirlik hayır olunca yeni parça numarası alanları açılır ve kalem kaydedilir', async () => {
    const istekler = sunucuKur({ ...EMIR, durum: 'revizyon_hazirlaniyor' });
    ac();
    const kalem = await screen.findByRole('form', { name: 'PRC-001 kalemi' });
    expect(within(kalem).queryByLabelText('Yeni parça numarası')).toBeNull();
    fireEvent.change(within(kalem).getByLabelText('Yeni parça, eski ürün yapısında yerine takılabilir mi?'), { target: { value: 'hayir' } });
    fireEvent.change(within(kalem).getByLabelText('Yeni parça numarası'), { target: { value: 'PRC-002' } });
    fireEvent.click(within(kalem).getByRole('button', { name: 'Kalemi kaydet' }));
    await waitFor(() => expect(komutlar(istekler)).toHaveLength(1));
    expect(komutlar(istekler)[0]).toEqual({
      yol: '/degisiklik-yonetimi/emirler/7/kalem-kaydet', yontem: 'POST',
      govde: {
        kalemId: 11, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: null, eskiYeniyeUyar: 'evet', yeniEskiyeUyar: 'hayir',
        yeniParcaNo: 'PRC-002', yeniParcaAdi: '', ozet: 'Delik büyüdü.', surum: 4,
      },
    });
  });

  it('kayıt sekmesi geçmişi en yeni üstte ve yalnız bu emrin olaylarını gösterir', async () => {
    const olaylar: OlayListeCevabi = {
      ...OLAYLAR, satirlar: [
        { id: 1, zaman: '2026-10-02T10:00:00+03:00', tur: 'emir_acildi', ilgili: null, kayitNo: 'ECO-0007', alanlar: { kayit: 'ECO-0007' } },
        { id: 2, zaman: '2026-10-02T11:00:00+03:00', tur: 'emir_acildi', ilgili: null, kayitNo: 'ECO-0099', alanlar: { kayit: 'ECO-0099' } },
      ],
    };
    sunucuKur({ ...EMIR, gecmis: [...EMIR.gecmis, { ...kisi, zaman: '2026-10-03T09:00:00+03:00', olay: 'yayina_gonderildi', imzaAnlami: null, aciklama: null, ozet: 'Yayın onayına gönderildi' }] });
    const eski = globalThis.fetch as unknown as (adres: string, s?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => (adres.includes('/olaylar') ? json(200, olaylar) : eski(adres, s))));
    ac('/degisiklik-yonetimi/emirler/7?sekme=kayit');
    const iz = await screen.findByRole('list', { name: 'Denetim izi' });
    const satirlar = within(iz).getAllByRole('listitem');
    expect(satirlar[0]!.textContent).toContain('Yayın onayına gönderildi');
    const gunluk = await screen.findByRole('table', { name: 'Olay günlüğü' });
    await within(gunluk).findByText('kayit: ECO-0007');
    expect(within(gunluk).queryByText('kayit: ECO-0099')).toBeNull();
  });
});
