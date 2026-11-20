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
function ac(ek = '') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[`/sevkiyat?tarih=${TARIH}${ek}`]}><SevkiyatPlani /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const aracAc = (ad: string) => screen.findByRole('region', { name: ad });
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');
// Dağıtım ayarları (otomatik dağıt, öncelik, geri al, yinele, boşalt) tek menüdedir (3489 b).
const dagitimSec = async (ad: string | RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Dağıtım ayarları' }));
  fireEvent.click(screen.getByRole('menuitem', { name: ad }));
};

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
    expect(within(pencere).queryByRole('link', { name: /Haritalar'da aç|Yandex'te aç/ })).toBeNull();
    const yaz = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: yaz }, configurable: true });
    fireEvent.click(within(pencere).getAllByRole('button', { name: 'Google bağlantısını kopyala' })[0]!);
    expect(yaz).toHaveBeenCalledWith(hesap.seferler[0]!.google);
    await within(pencere).findByRole('button', { name: 'Kopyalandı' });
    Reflect.deleteProperty(navigator, 'clipboard');
    fireEvent.keyDown(pencere, { key: 'Escape' });
    const bekleyen = screen.getByRole('region', { name: 'Sevkiyat havuzu' });
    expect(within(bekleyen).getByText('Hiçbir aracın kapasitesi yetmiyor')).toBeTruthy();
    expect(screen.getByText(/iş yerleşti/).textContent).toBe(`${GUN_PLANI.isler.length - GUN_PLANI.bekleyen.length}/${GUN_PLANI.isler.length} iş yerleşti`);
  });

  it('boş günde tek birincil "İlk işi ekle"dir; dağıtılacak iş yokken dağıt düğmesi yoktur; okuyucuda birincil yok', async () => {
    const bos: GunPlaniCevabi = { ...GUN_PLANI, isler: [], bekleyen: [], rotalar: GUN_PLANI.rotalar.map((r) => ({ ...r, ogeler: [], hesap: null })) };
    sunucuKur(PLANCI, undefined, bos);
    ac();
    const ilk = await screen.findByRole('button', { name: 'İlk işi ekle' });
    expect(ilk.className).toContain('tc-dugme-birincil');
    expect(screen.queryByRole('button', { name: 'Otomatik dağıt' })).toBeNull();
    expect(document.querySelectorAll('.tc-dugme-birincil')).toHaveLength(1);
    cleanup();
    sunucuKur(OKUYUCU, undefined, bos);
    ac();
    await screen.findAllByText('Bu gün için sevkiyat yok.');
    expect(screen.queryByRole('button', { name: /İlk işi ekle|Otomatik dağıt/ })).toBeNull();
    expect(document.querySelectorAll('.tc-dugme-birincil')).toHaveLength(0);
  });

  it('havuz ve araçlar sütundur; havuzdaki iş Araç seçimiyle araca verilir; havuzda iş varken tek birincil "Havuzu yerleştir", onay ikincildir', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Dağıtım ayarları' });
    const liste = screen.getByRole('region', { name: 'Sevkiyat listesi' });
    const bekleyen = within(liste).getByRole('region', { name: 'Sevkiyat havuzu' });
    expect(screen.getByRole('region', { name: 'Sevkiyat adımları' }).querySelector('[aria-current="step"]')!.textContent).toContain('Araca ver');
    expect(screen.getByRole('button', { name: 'Havuzu yerleştir' }).className).toContain('tc-dugme-birincil');
    expect(screen.getByRole('button', { name: 'Planı onayla' }).className).not.toContain('tc-dugme-birincil');
    expect(document.querySelectorAll('.tc-dugme-birincil')).toHaveLength(1);
    expect(within(liste).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Sevkiyat havuzu', ...GUN_PLANI.araclar.map((a) => a.ad)]);
    const bekleyenIs = GUN_PLANI.isler.find((i) => i.id === GUN_PLANI.bekleyen[0])!;
    const secim = within(bekleyen).getByRole('combobox', { name: /işinin aracı$/ });
    fireEvent.change(secim, { target: { value: '2' } });
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as KaydetGovdesi;
    expect(govde.rotalar.find((r) => r.aracId === 2)!.ogeler.some((o) => 'isId' in o && o.isId === bekleyenIs.id)).toBe(true);
  });

  it('seçili öncelik Dağıtım düğmesinin yanında yazar; menüde seçilmeyenin farkı görünür; değişince plan yeni öncelikle kaydedilir', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Dağıtım ayarları' });
    expect(screen.getByText('Öncelik:').textContent).toBe('Öncelik: En hızlı');
    fireEvent.click(screen.getByRole('button', { name: 'Dağıtım ayarları' }));
    expect(screen.getByRole('menuitem', { name: 'Öncelik: En hızlı ✓' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Öncelik: En kısa yol \(/ }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect((yazmalar(istekler)[0]!.govde as KaydetGovdesi).amac).toBe('mesafe');
  });

  it('otomatik dağıt seçili amaç, kilitli araçlar ve görülen sürümle istenir; özet yazılır', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('region', { name: 'Kamyonet 1' });
    await dagitimSec('Otomatik dağıt (baştan)');
    await screen.findByText(/Otomatik dağıtıldı \(en hızlı\)/);
    expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/planlar/${TARIH}/dagit`, govde: { amac: 'sure', kilitliAraclar: [], surum: GUN_PLANI.surum } }]);
  });

  it('durağı bekleyenlere almak işin bütün uçlarını çıkararak kaydeder; geri al önceki rotayı kaydeder', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Dağıtım ayarları' });
    const kamyon = await aracAc('Kamyonet 1');
    expect(within(kamyon).queryByRole('combobox', { name: /işinin aracı$/ })).toBeNull();
    const durakMenusu = within(kamyon).getAllByRole('combobox', { name: 'Örnek Fason B durağı işlemleri' })[0]!;
    fireEvent.change(durakMenusu, { target: { value: 'havuz' } });
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as KaydetGovdesi;
    expect(yazmalar(istekler)[0]!.yol).toBe(`/sevkiyat/planlar/${TARIH}/kaydet`);
    expect(govde.surum).toBe(GUN_PLANI.surum);
    const kamyonRotasi = govde.rotalar.find((r) => r.aracId === 1)!;
    const tasinan = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!.ogeler[0]!;
    expect(kamyonRotasi.ogeler.some((o) => !('araDonus' in o) && 'isId' in tasinan && o.isId === tasinan.isId)).toBe(false);

    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    await dagitimSec(/^Geri al: /);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect((yazmalar(istekler)[1]!.govde as KaydetGovdesi).rotalar).toEqual(GUN_PLANI.rotalar.map((r) => ({ aracId: r.aracId, kilitli: r.kilitli, ogeler: r.ogeler })));
  });

  it('durak menüsü işi başka araca verir; kendi aracı listede yoktur', async () => {
    const istekler = sunucuKur(PLANCI);
    ac();
    const kamyonet = await aracAc('Kamyonet 1');
    const durakMenusu = within(kamyonet).getAllByRole('combobox', { name: 'Örnek Fason B durağı işlemleri' })[0]!;
    const secenekler = within(durakMenusu).getAllByRole('option').map((o) => o.textContent);
    expect(secenekler).toContain('Kamyon 1 aracına ver');
    expect(secenekler).not.toContain('Kamyonet 1 aracına ver');
    fireEvent.change(durakMenusu, { target: { value: 'arac:2' } });
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as KaydetGovdesi;
    const tasinan = GUN_PLANI.rotalar.find((r) => r.aracId === 1)!.ogeler[0]!;
    const isId = 'isId' in tasinan ? tasinan.isId : null;
    expect(govde.rotalar.find((r) => r.aracId === 2)!.ogeler.some((o) => 'isId' in o && o.isId === isId)).toBe(true);
    expect(govde.rotalar.find((r) => r.aracId === 1)!.ogeler.some((o) => 'isId' in o && o.isId === isId)).toBe(false);
  });

  it('dar ekranda sütun sekmesi tek sütunu açar: havuzda iş varken havuz, sekmeye basınca o araç', async () => {
    sunucuKur(PLANCI);
    ac();
    const sekmeler = await screen.findByRole('tablist', { name: 'Gösterilen sütun' });
    const sutun = (ad: string) => screen.getByRole('region', { name: ad }).closest('.tc-sevkiyat-sutun')!;
    expect(sutun('Sevkiyat havuzu').hasAttribute('data-gizli')).toBe(false);
    for (const a of GUN_PLANI.araclar) expect(sutun(a.ad).hasAttribute('data-gizli')).toBe(true);
    fireEvent.click(within(sekmeler).getByRole('tab', { name: /Kamyonet 1/ }));
    expect(sutun('Kamyonet 1').hasAttribute('data-gizli')).toBe(false);
    expect(sutun('Sevkiyat havuzu').hasAttribute('data-gizli')).toBe(true);
    expect(sutun('Kamyon 1').hasAttribute('data-gizli')).toBe(true);
  });

  it('onaylı planda havuz boşsa havuz sütunu yoktur; durağı olan ilk araç açılır', async () => {
    sunucuKur(PLANCI, undefined, { ...GUN_PLANI, bekleyen: [], yerlesemeyen: [], onaylandi: '2026-10-08T07:00:00.000+03:00' });
    ac('&adim=teslim');
    const sekmeler = await screen.findByRole('tablist', { name: 'Gösterilen sütun' });
    expect(within(sekmeler).queryByRole('tab', { name: /Havuz/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sevkiyat havuzu' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Kamyonet 1' }).closest('.tc-sevkiyat-sutun')!.hasAttribute('data-gizli')).toBe(false);
    expect(screen.getByRole('region', { name: 'Kamyon 1' }).closest('.tc-sevkiyat-sutun')!.hasAttribute('data-gizli')).toBe(true);
  });

  it('sunucu reddederse sunucunun iletisi yazılır', async () => {
    const CAKISMA = { kod: 'CAKISMA', mesaj: 'Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.' } satisfies HataGovdesi;
    sunucuKur(PLANCI, () => json(409, CAKISMA));
    ac();
    await screen.findByRole('region', { name: 'Kamyonet 1' });
    await dagitimSec('Otomatik dağıt (baştan)');
    expect((await screen.findByRole('alert')).textContent).toBe(CAKISMA.mesaj);
  });

  it('yalnız okuma yetkisinde plan değiştiren düğme ve taşıma menüsü yoktur; planlayıcıda vardır', async () => {
    const okuyucuIstekleri = sunucuKur(OKUYUCU);
    ac();
    const kamyon = await aracAc('Kamyonet 1');
    // Yokluk sınanmadan önce oturum (yetkiler) gelmiş olmalı.
    await waitFor(() => expect(okuyucuIstekleri.some((i) => i.yol === '/oturum')).toBe(true));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByRole('button', { name: /Dağıtım ayarları|Havuzu yerleştir/ })).toBeNull();
    expect(within(kamyon).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Planı onayla' })).toBeNull();
    cleanup();

    sunucuKur(PLANCI);
    ac();
    await screen.findByRole('button', { name: 'Dağıtım ayarları' });
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
    ac('&adim=teslim');
    await screen.findByRole('button', { name: 'Onayı kaldır' });
    const kamyon = await aracAc('Kamyonet 1');
    expect(within(kamyon).getAllByRole('listitem').filter((li) => li.getAttribute('aria-label'))[0]!.querySelector('time')!.textContent).toBe('10:00');
    expect(within(kamyon).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Dağıtım ayarları|Otomatik dağıt|Havuzu yerleştir/ })).toBeNull();
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
    ac('&adim=teslim');
    const kamyon = await screen.findByRole('region', { name: 'Kamyonet 1' });
    // Tek birincil sonucu girilecek ilk satırdadır (aktarmanın alış satırı atlanır, orada yalnız rozet).
    const birincil = [...kamyon.querySelectorAll('.tc-dugme-birincil')];
    expect(birincil.map((d) => d.closest('li')?.getAttribute('aria-label') ?? '')).toEqual([expect.stringContaining('al Örnek Tedarikçi C')]);
    const aktarmaAlisi = within(kamyon).getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.includes('al Örnek Fason B'))!;
    expect(within(aktarmaAlisi).getByText('Sonuç bırakışta')).toBeTruthy();
    expect(within(aktarmaAlisi).queryByRole('button', { name: 'Yapılamadı' })).toBeNull();
    const teslimSatiri = within(kamyon).getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.includes('bırak Örnek Müşteri A'))!;
    fireEvent.click(within(teslimSatiri).getByRole('button', { name: 'Teslim edildi' }));
    await waitFor(() => expect(yazmalar(istekler)).toEqual([{ yontem: 'POST', yol: `/sevkiyat/isler/${teslim.id}/durum`, govde: { durum: 'tamamlandi', tarih: TARIH, not: null } }]));

    const alimSatiri = within(kamyon).getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.includes('al Örnek Tedarikçi C'))!;
    fireEvent.click(within(alimSatiri).getByRole('button', { name: 'Yapılamadı' }));
    const pencere = screen.getByRole('dialog', { name: 'Yapılamadı' });
    fireEvent.change(within(pencere).getByRole('textbox'), { target: { value: 'Yük hazır değil' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yapılamadı olarak işaretle' }));
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

// 1239: Ctrl K komutu ve irsaliye araması formu açar; yazma yine formun ucundadır.
describe('SevkiyatPlani adresten açılan form', () => {
  it('izinli: ?is= o işin formunu belge numarasıyla dolu açar, ?yeni=1 boş yeni iş formunu açar', async () => {
    sunucuKur(PLANCI);
    ac('&is=1');
    const pencere = await screen.findByRole('dialog', { name: 'İşi düzenle' });
    expect(within(pencere).getByDisplayValue('DENEME-1')).toBeTruthy();
    cleanup();
    sunucuKur(PLANCI);
    ac('&yeni=1');
    expect(await screen.findByRole('dialog', { name: 'Yeni iş' })).toBeTruthy();
  });

  it('reddedilen: yalnız okuyana, onaylı planda ve yoldaki işte form açılmaz; gün planı görünür', async () => {
    sunucuKur(OKUYUCU);
    ac('&is=1');
    await aracAc('Kamyonet 1');
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    sunucuKur(PLANCI, undefined, { ...GUN_PLANI, onaylandi: '2026-10-08T06:00:00.000Z' });
    ac('&yeni=1');
    await aracAc('Kamyonet 1');
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    sunucuKur(PLANCI, undefined, { ...GUN_PLANI, isler: GUN_PLANI.isler.map((i) => (i.id === 1 ? { ...i, durum: 'yolda' as const } : i)) });
    ac('&is=1');
    await aracAc('Kamyonet 1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
