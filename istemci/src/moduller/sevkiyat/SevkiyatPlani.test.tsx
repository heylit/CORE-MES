import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GunPlaniCevabi, HaritaCevabi, KaydetGovdesi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { SevkiyatPlani } from './SevkiyatPlani.tsx';
import { saatMetni } from './bicim.ts';
import { GUN_PLANI } from './test-verisi.ts';

const TARIH = GUN_PLANI.tarih;
const PLANCI: Kullanici = { id: 3, ad: 'Deneme Planlayıcı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.plan-yaz', 'sevkiyat.is-yaz', 'sevkiyat.onayla'] };
const OKUYUCU: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku'] };

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, yazmaCevabi: (istek: Istek) => Response = () => json(200, GUN_PLANI), plan: GunPlaniCevabi = GUN_PLANI) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const istek = { yontem: ayar?.method ?? 'GET', yol: adres.replace('/api', ''), govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined };
    istekler.push(istek);
    if (istek.yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (istek.yol === '/sevkiyat/harita') return json(200, { harita: null } satisfies HaritaCevabi);
    if (istek.yol === `/sevkiyat/planlar/${TARIH}` && istek.yontem === 'GET') return json(200, plan);
    if (istek.yontem === 'POST') return yazmaCevabi(istek);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[`/sevkiyat?tarih=${TARIH}`]}><SevkiyatPlani /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const aracAc = (ad: string) => screen.findByRole('region', { name: ad });
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SevkiyatPlani', () => {
  it('sunucunun planını gösterir: araç rotası saatleriyle, bekleyen iş nedeniyle, yerleşen sayısı', async () => {
    sunucuKur(PLANCI);
    ac();
    const kamyon = await aracAc('Kamyonet 1');
    const duraklar = within(kamyon).getAllByRole('listitem').filter((li) => li.getAttribute('aria-label'));
    const hesap = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!.hesap!;
    expect(duraklar).toHaveLength(hesap.duraklar.length);
    expect(duraklar[0]!.getAttribute('aria-label')).toBe(`1. al Örnek Fason B ${saatMetni(hesap.duraklar[0]!.baslama)}`);
    fireEvent.click(within(kamyon).getByRole('button', { name: 'Sürücüye gönder' }));
    const pencere = screen.getByRole('dialog', { name: 'Kamyonet 1 · sürücüye gönder' });
    expect(within(pencere).getAllByRole('link', { name: "Google Haritalar'da aç" })[0]!.getAttribute('href')).toBe(hesap.seferler[0]!.google);
    fireEvent.keyDown(pencere, { key: 'Escape' });
    const bekleyen = screen.getByRole('region', { name: 'Sevkiyat havuzu' });
    expect(within(bekleyen).getByText('Hiçbir aracın kapasitesi yetmiyor')).toBeTruthy();
    expect(screen.getByText(/iş yerleşti/).textContent).toBe(`${GUN_PLANI.isler.length - GUN_PLANI.bekleyen.length}/${GUN_PLANI.isler.length} iş yerleşti`);
  });

  it('liste önce gelir: atanmamış iş satırındaki Araç seçimiyle araca verilir; akışta etkin adım dağıtmadır; tek birincil eylem onaydır', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Otomatik dağıt' });
    const liste = screen.getByRole('region', { name: 'Sevkiyat listesi' });
    const bekleyen = within(liste).getByRole('region', { name: 'Sevkiyat havuzu' });
    expect(screen.getByRole('region', { name: 'Sevkiyat adımları' }).querySelector('[aria-current="step"]')!.textContent).toContain('Araçlara dağıt');
    expect(screen.getByRole('button', { name: 'Planı onayla' }).className).toContain('tc-dugme-birincil');
    expect(screen.getByRole('button', { name: 'Otomatik dağıt' }).className).not.toContain('tc-dugme-birincil');
    const bekleyenIs = GUN_PLANI.isler.find((i) => i.id === GUN_PLANI.bekleyen[0])!;
    const secim = within(bekleyen).getByRole('combobox', { name: /işinin aracı$/ });
    fireEvent.change(secim, { target: { value: '2' } });
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as KaydetGovdesi;
    expect(govde.rotalar.find((r) => r.aracId === 2)!.ogeler.some((o) => 'isId' in o && o.isId === bekleyenIs.id)).toBe(true);
  });

  it('öncelik seçimi seçilmeyen seçeneğin farkını gösterir; değişince plan yeni öncelikle kaydedilir', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Otomatik dağıt' });
    const grup = screen.getByRole('group', { name: 'Rota önceliği' });
    const enKisa = within(grup).getByRole('button', { name: /En kısa yol/ });
    expect(enKisa.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(enKisa);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect((yazmalar(istekler)[0]!.govde as KaydetGovdesi).amac).toBe('mesafe');
  });

  it('otomatik dağıt seçili amaç, kilitli araçlar ve görülen sürümle istenir; özet yazılır', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('region', { name: 'Kamyonet 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Otomatik dağıt' }));
    await screen.findByText(/Otomatik dağıtıldı \(en hızlı\)/);
    expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/planlar/${TARIH}/dagit`, govde: { amac: 'sure', kilitliAraclar: [], surum: GUN_PLANI.surum } }]);
  });

  it('durağı bekleyenlere almak işin bütün uçlarını çıkararak kaydeder; geri al önceki rotayı kaydeder', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Otomatik dağıt' });
    const kamyon = await aracAc('Kamyonet 1');
    const aracSecimi = within(kamyon).getAllByRole('combobox', { name: 'Örnek Fason B işinin aracı' })[0]!;
    fireEvent.change(aracSecimi, { target: { value: 'yok' } });
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as KaydetGovdesi;
    expect(yazmalar(istekler)[0]!.yol).toBe(`/sevkiyat/planlar/${TARIH}/kaydet`);
    expect(govde.surum).toBe(GUN_PLANI.surum);
    const kamyonRotasi = govde.rotalar.find((r) => r.aracId === 1)!;
    const tasinan = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!.ogeler[0]!;
    expect(kamyonRotasi.ogeler.some((o) => !('araDonus' in o) && 'isId' in tasinan && o.isId === tasinan.isId)).toBe(false);

    await waitFor(() => expect((screen.getByRole('button', { name: 'Geri al' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect((yazmalar(istekler)[1]!.govde as KaydetGovdesi).rotalar).toEqual(GUN_PLANI.rotalar.map((r) => ({ aracId: r.aracId, kilitli: r.kilitli, ogeler: r.ogeler })));
  });

  it('sunucu reddederse sunucunun iletisi yazılır', async () => {
    const CAKISMA = { kod: 'CAKISMA', mesaj: 'Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.' } satisfies HataGovdesi;
    sunucuKur(PLANCI, () => json(409, CAKISMA));
    ac();
    await screen.findByRole('region', { name: 'Kamyonet 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Otomatik dağıt' }));
    expect((await screen.findByRole('alert')).textContent).toBe(CAKISMA.mesaj);
  });

  it('yalnız okuma yetkisinde plan değiştiren düğme ve taşıma menüsü yoktur; planlayıcıda vardır', async () => {
    const okuyucuIstekleri = sunucuKur(OKUYUCU);
    ac();
    const kamyon = await aracAc('Kamyonet 1');
    // Yokluk sınanmadan önce oturum (yetkiler) gelmiş olmalı.
    await waitFor(() => expect(okuyucuIstekleri.some((i) => i.yol === '/oturum')).toBe(true));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByRole('button', { name: 'Otomatik dağıt' })).toBeNull();
    expect(within(kamyon).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Planı onayla' })).toBeNull();
    cleanup();

    sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Otomatik dağıt' });
    const kamyon2 = await aracAc('Kamyonet 1');
    expect(within(kamyon2).getAllByRole('combobox').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Planı onayla' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('bekleyen işin iptali onay penceresinden geçer; Esc yazmadan kapatır, onay iptal komutunu gönderir', async () => {
    const istekler = sunucuKur(PLANCI, () => json(200, { is: GUN_PLANI.isler.find((i) => i.id === GUN_PLANI.bekleyen[0])! }));
    ac();
    const bekleyen = await screen.findByRole('region', { name: 'Sevkiyat havuzu' });
    const menu = () => within(bekleyen).getByRole('combobox', { name: /işi işlemleri$/ });
    fireEvent.change(menu(), { target: { value: 'iptal' } });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'İş iptal edilsin mi?' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(menu(), { target: { value: 'iptal' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/isler/${GUN_PLANI.bekleyen[0]}/iptal-et`, govde: undefined }]));
    expect(await screen.findByText('İş iptal edildi.')).toBeTruthy();
  });

  it('bekleyen iş varken onay uyarıyla sorulur; vazgeçince gönderilmez, onaylanınca gider; bekleyen yoksa doğrudan gider', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Planı onayla' }));
    const uyari = screen.getByRole('dialog', { name: 'Bekleyen işlerle onaylansın mı?' });
    expect(within(uyari).getByText('1 iş')).toBeTruthy();
    fireEvent.click(within(uyari).getByRole('button', { name: 'Vazgeç' }));
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Planı onayla' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yine de onayla' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/planlar/${TARIH}/onayla`, govde: { surum: GUN_PLANI.surum } }]));
    cleanup();

    const tamam = sunucuKur(PLANCI, undefined, { ...GUN_PLANI, bekleyen: [], yerlesemeyen: [] });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Planı onayla' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(yazmalar(tamam)).toHaveLength(1));
  });

  it('onay engeli varsa onay düğmesi kapalıdır ve engel listelenir', async () => {
    const engelli: GunPlaniCevabi = { ...GUN_PLANI, onayEngelleri: ['Kamyon 1 rotasında kural ihlali var.'] };
    sunucuKur(PLANCI, undefined, engelli);
    ac();
    await screen.findByText('Kamyon 1 rotasında kural ihlali var.');
    expect((screen.getByRole('button', { name: 'Planı onayla' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('fabrika noktası yokken sıradaki adım fabrikayı ister ve Noktalar’a götürür; harita paketi eksik denmez', async () => {
    const fabrikasiz: GunPlaniCevabi = {
      ...GUN_PLANI, fabrika: null, haritaVar: false, toplam: null,
      onayEngelleri: ['Aktif fabrika noktası tanımlı değil.', 'Harita paketi yüklü değil; varış saatleri hesaplanamıyor, plan onaylanamaz.'],
    };
    sunucuKur(PLANCI, undefined, fabrikasiz);
    ac();
    const adim = await screen.findByText(/^Fabrika noktası tanımlı değil/);
    expect(adim.closest('p')!.getAttribute('data-ton')).toBe('uyari');
    expect(screen.getByRole('link', { name: 'Noktalar’dan fabrikayı ekle' }).getAttribute('href')).toBe('/sevkiyat/noktalar');
    expect(screen.queryByText(/Harita paketi yüklü değil/)).toBeNull();
    expect(screen.getByText('Aktif fabrika noktası tanımlı değil.')).toBeTruthy();
  });

  it('fabrika varken harita paketi yoksa iletisi değişmez', async () => {
    sunucuKur(PLANCI, undefined, { ...GUN_PLANI, haritaVar: false, toplam: null });
    ac();
    expect(await screen.findByText(/^Harita paketi yüklü değil: işleri araçlara elle verebilirsiniz/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Noktalar’dan fabrikayı ekle' })).toBeNull();
  });
});

describe('SevkiyatPlani onaylı plan', () => {
  it('onaylı planda onayda kaydedilen saat gösterilir; düzenleme menüsü yoktur, onay kaldırılabilir', async () => {
    const rota = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!;
    const onaySaatleri = rota.ogeler.map((_, i) => ({ varis: 600 + i * 30, ayrilis: 610 + i * 30 }));
    const onayli: GunPlaniCevabi = { ...GUN_PLANI, onaylandi: '2026-10-08T07:00:00.000+03:00', rotalar: GUN_PLANI.rotalar.map((r) => (r.aracId === 1 ? { ...r, onaySaatleri } : r)) };
    sunucuKur(PLANCI, undefined, onayli);
    ac();
    await screen.findByRole('button', { name: 'Onayı kaldır' });
    const kamyon = await aracAc('Kamyonet 1');
    expect(within(kamyon).getAllByRole('listitem').filter((li) => li.getAttribute('aria-label'))[0]!.querySelector('time')!.textContent).toBe('10:00');
    expect(within(kamyon).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Otomatik dağıt' })).toBeNull();
  });

  it('yoldaki iş teslim edildi ya da yapılamadı olarak işaretlenir; yapılamadı nedeni sorulur ve iş havuza döner', async () => {
    const rota = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!;
    const yolda: GunPlaniCevabi = {
      ...GUN_PLANI, onaylandi: '2026-10-08T07:00:00.000+03:00',
      isler: GUN_PLANI.isler.map((i) => (rota.ogeler.some((o) => 'isId' in o && o.isId === i.id) ? { ...i, durum: 'yolda' as const } : i)),
    };
    const teslim = GUN_PLANI.isler.find((i) => i.tur === 'teslimat' && i.durum === 'planlandi')!;
    const alim = GUN_PLANI.isler.find((i) => i.tur === 'alim')!;
    const istekler = sunucuKur(PLANCI, () => json(200, { is: teslim }), yolda);
    ac();
    const kamyon = await screen.findByRole('region', { name: 'Kamyonet 1' });
    const teslimSatiri = within(kamyon).getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.includes('bırak Örnek Müşteri A'))!;
    fireEvent.click(within(teslimSatiri).getByRole('button', { name: 'Teslim edildi' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/isler/${teslim.id}/durum`, govde: { durum: 'tamamlandi', tarih: TARIH, not: null } }]));

    const alimSatiri = within(kamyon).getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.includes('al Örnek Tedarikçi C'))!;
    fireEvent.click(within(alimSatiri).getByRole('button', { name: 'Yapılamadı' }));
    const pencere = screen.getByRole('dialog', { name: 'Yapılamadı' });
    fireEvent.change(within(pencere).getByRole('textbox'), { target: { value: 'Yük hazır değil' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Havuza geri al' }));
    await waitFor(() => expect(yazmalar(istekler)[1]).toEqual({ yontem: 'POST', yol: `/sevkiyat/isler/${alim.id}/durum`, govde: { durum: 'yapilamadi', tarih: TARIH, not: 'Yük hazır değil' } }));
  });

  it('147 b: sevkin ve plan onayının stok uyarısı kapatılana kadar kalan bildirimle yazılır', async () => {
    const UYARI = 'Emir E-1: 2 adet red parça sevk edildi.';
    const plan: GunPlaniCevabi = { ...GUN_PLANI, bekleyen: [], yerlesemeyen: [] };
    sunucuKur(PLANCI, () => json(200, { ...plan, uyarilar: [UYARI] }), plan);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Planı onayla' }));
    expect((await screen.findByRole('alert')).textContent).toContain(UYARI);
    cleanup();

    const bekleyenIs = GUN_PLANI.isler.find((i) => i.id === GUN_PLANI.bekleyen[0])!;
    sunucuKur(PLANCI, () => json(200, { is: bekleyenIs, uyarilar: [UYARI] }));
    ac();
    const havuz = await screen.findByRole('region', { name: 'Sevkiyat havuzu' });
    fireEvent.change(within(havuz).getByRole('combobox', { name: /işi işlemleri$/ }), { target: { value: 'kapat' } });
    expect((await screen.findByRole('alert')).textContent).toContain(UYARI);
    expect(screen.getByText('İş tamamlandı.')).toBeTruthy();
  });

  it('havuzda geciken ve daha önce yapılamamış iş rozetle görünür; elle kapatılır', async () => {
    const bekleyenIs = GUN_PLANI.isler.find((i) => i.id === GUN_PLANI.bekleyen[0])!;
    const plan: GunPlaniCevabi = {
      ...GUN_PLANI,
      isler: GUN_PLANI.isler.map((i) => (i.id === bekleyenIs.id ? { ...i, istenenTarih: '2026-10-06', yapilamadiSayisi: 1, sonNot: 'Müşteri kapalı' } : i)),
    };
    const istekler = sunucuKur(PLANCI, () => json(200, { is: bekleyenIs }), plan);
    ac();
    const havuz = await screen.findByRole('region', { name: 'Sevkiyat havuzu' });
    expect(within(havuz).getByText('Gecikmiş · istenen 06.10.2026')).toBeTruthy();
    expect(within(havuz).getByText('Yapılamadı: Müşteri kapalı')).toBeTruthy();
    fireEvent.change(within(havuz).getByRole('combobox', { name: /işi işlemleri$/ }), { target: { value: 'kapat' } });
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/isler/${bekleyenIs.id}/durum`, govde: { durum: 'tamamlandi', tarih: TARIH, not: null } }]));
  });
});
