import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../tipler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { KAYDEDILEMEDI } from './coz.ts';
import { PlanlamaMotoru } from './index.tsx';
import { YOK_NOTU } from './ortak.tsx';
import { SeritYuvasi } from './ust/yuva.ts';
import { ornekCalisma } from './ornek.ts';
import { ufukKur } from '../ufuk-olcegi.ts';

import { saatiSabitle } from '../test-saati.ts';

saatiSabitle(() => ornekCalisma());

afterEach(cleanup);

// İş emri durumu okunamamış depo: biten iş kayıtlı plandan çıkar.
const DEPO = { durum: null } as unknown as PlanlamaDeposu;
function ac(o: { c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null; depo?: PlanlamaDeposu; dis?: BekleyenDegisiklik | null } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const yenile = vi.fn();
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: o.depo ?? DEPO, calisma: o.c === undefined ? ornekCalisma() : o.c, komut: o.komut ?? null, git, yenile,
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])]),
  };
  render(<BildirimSaglayici><SeritYuvasi.Provider value={{ satir: null, alt: null, dis: o.dis ?? null }}><Iskelet {...oz} /></SeritYuvasi.Provider></BildirimSaglayici>);
  return { git, yenile };
}
// İskeletin ortak ölçek ve seçimi (PlanlamaYeni.tsx'teki gibi).
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return (
    <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={(n) => setOlcek((x) => ({ ...x, kayma: n === 0 ? 0 : x.kayma + n }))}
      secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />
  );
}

// Bu dosyanın beklenen değerleri 63 günlük ufukla kuruldu; testin konusu varsayılan ufuk değil (1681 b ile varsayılan 120 gün).
beforeEach(() => { ufukKur({ ufukGun: 63 }); });
afterEach(() => { ufukKur(null); });

describe('PlanlamaMotoru', () => {
  it('çalışma yoksa söyler: üç adım, pasif Planı kur ve Veri ve kısıtlar, sayı yok; plan çubuğu üstte (489/2 c, 497/10 a)', async () => {
    ac({ c: null });
    expect(await screen.findByRole('toolbar', { name: 'Plan çubuğu' })).toBeTruthy();
    const kart = screen.getByText('Planlama çalışması yok.').parentElement as HTMLElement;
    expect(within(kart).getAllByRole('listitem').map((x) => x.querySelector('span > b')?.textContent)).toEqual(['Planı kur', 'Sorunlara bak', 'Karar ver']);
    expect(within(kart).getByRole('button', { name: 'Planı kur' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(kart).getByRole('button', { name: 'Veri ve kısıtlar' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText(/tezgâh,/)).toBeNull();
  });

  it('çalışma var, plan yoksa eski kart: kaydın sayıları, üç adım; Planı kur ve Veri ve kısıtlar pasif; görünüm çubuğu yok', () => {
    ac({ c: { ...ornekCalisma(), plan: null } as PlanlamaCalismasi });
    expect(screen.getByText('Plan henüz kurulmadı')).toBeTruthy();
    expect(document.querySelector('.tc-pym-bos-genis > span')?.textContent).toBe('5 tezgâh, 3 sipariş, 8 işlem, 17 personel.');
    expect(screen.getAllByRole('listitem').map((x) => x.querySelector('b + span b')?.textContent ?? x.querySelector('span > b')?.textContent)).toEqual(['Planı kur', 'Sorunlara bak', 'Karar ver']);
    for (const b of screen.getAllByRole('button', { name: 'Planı kur' })) expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Veri ve kısıtlar' }).getAttribute('title')).toBe(`Veri ve kısıtlar: ${YOK_NOTU}`);
    expect(screen.queryByRole('toolbar', { name: 'Görünüm' })).toBeNull();
    // Plan yokken değişiklik özeti çizilmez (ölçülecek plan yok); çubuk "Plan yok" der.
    expect(document.querySelector('[data-degisiklik-ozeti]')).toBeNull();
    expect(within(screen.getByRole('toolbar', { name: 'Plan çubuğu' })).getByText('Plan yok')).toBeTruthy();
  });

  it('yazabilene Planı kur açık (576): çubuk ve kart sunucudaki motoru ister; çalışma kaydedilemezse iletisi gelir, plan değişmez', async () => {
    const c = { ...ornekCalisma(), plan: null } as PlanlamaCalismasi;
    const kaydet = vi.fn(async () => null);
    const degistir = vi.fn(() => true);
    ac({ c, komut: { kaydet, degistir } as unknown as CalismaKomutu });
    const dugmeler = screen.getAllByRole('button', { name: 'Planı kur' });
    expect(dugmeler).toHaveLength(2);
    for (const b of dugmeler) { expect(b.getAttribute('aria-disabled')).toBeNull(); expect((b as HTMLButtonElement).disabled).toBe(false); }
    expect(screen.queryByText('Motor kapalı')).toBeNull();
    await act(async () => { fireEvent.click(dugmeler[0] as HTMLElement); });
    expect(kaydet).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(KAYDEDILEMEDI)).toBeTruthy();
    expect(degistir).not.toHaveBeenCalled();
  });

  it('plan veriden eskiyse çubuk bekleyen değişiklikleri uygular; plan güncelse ya da yazamayana düğme yok (1786 PLN-2)', async () => {
    // Örnek çalışmanın planı bir veri sürümü geridir: bekleyen yok, kayıtsız eski değişiklik tek satırdır.
    const c = ornekCalisma();
    const kaydet = vi.fn(async () => null);
    ac({ c, komut: { kaydet, degistir: vi.fn(() => true) } as unknown as CalismaKomutu });
    const cubuk = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    const d = within(cubuk).getByRole('button', { name: 'Planı güncelle' });
    expect(d.textContent).toBe('Planı güncelle (1)');
    expect(within(cubuk).queryByText('Motor kapalı')).toBeNull();
    await act(async () => { fireEvent.click(d); });
    expect(kaydet).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(KAYDEDILEMEDI)).toBeTruthy();
    cleanup();
    ac({ c, yaz: false, komut: { kaydet, degistir: vi.fn() } as unknown as CalismaKomutu });
    expect(screen.queryByRole('button', { name: 'Planı güncelle' })).toBeNull();
    cleanup();
    const g = ornekCalisma(); g.dataVer = g.plan?.dataVer ?? 0;
    ac({ c: g, komut: { kaydet, degistir: vi.fn() } as unknown as CalismaKomutu });
    expect(screen.queryByRole('button', { name: 'Planı güncelle' })).toBeNull();
  });

  // 3317-1b: Kokpit'in şeridindeki değişiklik listesi Motor'da da aynı yerdedir; Motor yalnız gösterir, düzeltme Kokpit'tedir.
  it('planı etkileyen değişiklikler şeritte özetlenir; liste üç başlıkta açılır, satırda Göster yoktur; bağlantı Kokpit\'i açar; toplu düğme birincil kalır', () => {
    const bayat = { bayat: true, sonCanliyaAlma: '2026-10-20T06:00:00Z', olaylar: [
      { neden: 'durus', zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'ORN-T01' },
      { neden: 'satin-alma-termini', zaman: '2026-10-20T08:00:00Z', uretimEmriId: 3, emirNo: '3', makineId: null, makineKod: null },
    ] };
    const { git } = ac({ depo: { ...DEPO, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat } } as unknown as PlanlamaDeposu, komut: { kaydet: vi.fn(), degistir: vi.fn() } as unknown as CalismaKomutu });
    const cubuk = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    const ozet = cubuk.querySelector('[data-degisiklik-ozeti]') as HTMLElement;
    expect(ozet.textContent).toMatch(/^\d+ değişiklik1 veri · 2 saha/);
    // Plan durumu rozeti ve olay sayısı satırda ikinci kez yazılmaz; toplu düğme sayfanın birincilidir.
    expect(within(cubuk).queryByText('Veri değişti')).toBeNull();
    expect(cubuk.querySelector('[data-olaylar]')).toBeNull();
    expect(within(cubuk).getByRole('button', { name: 'Planı güncelle' }).className).toContain('tc-dugme-birincil');
    expect(screen.queryByRole('region', { name: 'Planı etkileyen değişiklikler' })).toBeNull();
    fireEvent.click(within(ozet).getByRole('button', { name: 'Değişiklikleri gör' }));
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect(within(within(liste).getByRole('region', { name: 'Veri değişti' })).getAllByRole('listitem').length).toBe(1);
    expect(within(within(liste).getByRole('region', { name: 'Sahada oldu' })).getAllByRole('listitem').map((x) => x.querySelector('b')?.textContent)).toEqual(['Duruş: ORN-T01', 'Malzemenin geliş tarihi değişti: 3']);
    expect(within(liste).queryByRole('button', { name: 'Göster' })).toBeNull();
    expect(liste.textContent).toContain('"Planı güncelle (1)" yalnız "Veri değişti" satırlarının');
    expect(liste.textContent).toContain('emre gitmek ve düzeltmek Kokpit\'tedir');
    fireEvent.click(within(liste).getByRole('button', { name: 'Kokpit\'te gör ve düzelt' }));
    expect(git).toHaveBeenCalledWith('kokpit');
    fireEvent.click(within(ozet).getByRole('button', { name: 'Değişiklikleri kapat' }));
    expect(screen.queryByRole('region', { name: 'Planı etkileyen değişiklikler' })).toBeNull();
  });

  it('bu açılışta gelen, kayda yazılmamış başka sayfa değişikliği plan güncelken de listede "Veri değişti" altındadır', () => {
    const g = ornekCalisma(); g.dataVer = g.plan?.dataVer ?? 0;
    ac({ c: g, yaz: false, dis: { id: 'ORN-dis', ne: 'Ürün rotası değişti', ayrinti: '', kim: '', t: 0, isler: ['*'], geri: null, dis: true } });
    const ozet = document.querySelector('[data-degisiklik-ozeti]') as HTMLElement;
    expect(ozet.textContent).toContain('1 veri');
    fireEvent.click(within(ozet).getByRole('button', { name: 'Değişiklikleri gör' }));
    const veri = within(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' })).getByRole('region', { name: 'Veri değişti' });
    expect(within(veri).getAllByRole('listitem').map((x) => x.querySelector('b')?.textContent)).toEqual(['Ürün rotası değişti']);
    expect(veri.textContent).toContain('Başka sayfa');
  });

  it('değişiklik yokken şeritte "Plan güncel" yazar, düğme yoktur; yazamayana toplu uygulama notu çıkmaz', () => {
    const g = ornekCalisma(); g.dataVer = g.plan?.dataVer ?? 0;
    ac({ c: g });
    const ozet = document.querySelector('[data-degisiklik-ozeti]') as HTMLElement;
    expect(ozet.textContent).toBe('Plan güncel');
    expect(within(ozet).queryByRole('button')).toBeNull();
    cleanup();
    ac({ yaz: false });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri gör' }));
    expect(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' }).textContent).not.toContain('Planı güncelle');
  });

  it('plan yazma yetkisi yoksa Planı kur görünmez ya da pasif kalır', () => {
    ac({ c: { ...ornekCalisma(), plan: null } as PlanlamaCalismasi, yaz: false, komut: { kaydet: vi.fn(), degistir: vi.fn() } as unknown as CalismaKomutu });
    for (const b of screen.getAllByRole('button', { name: 'Planı kur' })) expect(b.getAttribute('aria-disabled')).toBe('true');
  });

  it('Özet dört bölümdür: plan nasıl gidiyor, tezgâh haritası, teslime yarış ve tezgâh yükü; şeritte sekme ve iyileştirme yok (3308-2 a)', () => {
    ac();
    for (const ad of ['Plan nasıl gidiyor?', 'Tezgâh haritası', 'Siparişler zamanında bitiyor mu?', 'Hangi gün hangi tezgâh dolu?']) {
      expect(screen.getByRole('region', { name: ad })).toBeTruthy();
    }
    for (const ad of ['Siparişler nerede bekliyor?', 'Süre nereye gidiyor?', 'Ne yapmalıyım?']) expect(screen.queryByRole('region', { name: ad })).toBeNull();
    const ozet = screen.getByRole('region', { name: 'Plan nasıl gidiyor?' });
    expect(ozet.textContent).toContain('Son işin bitişi: 27.10 Sal 17:55.');
    expect(within(screen.getByRole('group', { name: /^Plan nabzı/ })).getByRole('button', { name: /geciken · bu hafta/ })).toBeTruthy();
    for (const ad of ['Plan iyileştirme ara', 'Stüdyo', 'Çizelge', 'Kartlar', 'Yapılacaklar']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    expect(within(screen.getByRole('toolbar', { name: 'Görünüm' })).getAllByRole('button').slice(0, 3).map((b) => b.textContent)).toEqual(['Özet', 'Harita', 'Keşfet']);
  });

  it('sipariş seçilince Özet vurgulanır ve seçim kartı açılır; kart yalnız okur, yazabilene Kokpit\'te düzenle gösterir', () => {
    const { git } = ac();
    const yaris = screen.getByRole('region', { name: 'Siparişler zamanında bitiyor mu?' });
    fireEvent.click(within(yaris).getByRole('button', { name: '3' }));
    expect(yaris.closest('.tc-pym-oz')?.hasAttribute('data-vurgu')).toBe(true);
    const kart = screen.getByRole('region', { name: 'Seçim kartı' });
    expect(within(kart).queryByRole('tablist')).toBeNull();
    for (const ad of ['Öne al', 'Taşı', 'Burada sabitle', 'Seçenek ara']) expect(within(kart).queryByRole('button', { name: ad })).toBeNull();
    fireEvent.click(within(kart).getByRole('button', { name: 'Kokpit\'te düzenle' }));
    expect(git).toHaveBeenCalledWith('kokpit');
    fireEvent.click(within(yaris).getByRole('button', { name: '3' }));
    expect(yaris.closest('.tc-pym-oz')?.hasAttribute('data-vurgu')).toBe(false);
    expect(screen.queryByRole('region', { name: 'Seçim kartı' })).toBeNull();
  });

  it('seçim kartı siparişin bitişini ve yolculuğunu okur; yolculuktaki adım iş kartını açar, Kapat seçimi bırakır', () => {
    ac();
    const yaris = screen.getByRole('region', { name: 'Siparişler zamanında bitiyor mu?' });
    fireEvent.click(within(yaris).getByRole('button', { name: '3' }));
    const panel = screen.getByRole('complementary', { name: 'Yan panel' });
    const kart = within(panel).getByRole('region', { name: 'Seçim kartı' });
    expect(kart.querySelector('[data-k="secim-siparis"]')).not.toBeNull();
    const durum = kart.querySelector('.tc-pym-km-durum');
    expect(durum?.textContent).toMatch(/^Bitiş \d{2}\.\d{2} .+ · (termine yetişiyor|.+ geç)/);
    expect(within(kart).getByText('Bitişi ne belirliyor')).toBeTruthy();
    const adim = kart.querySelector<HTMLButtonElement>('.tc-pym-at-yol .tc-pym-link');
    expect(adim).not.toBeNull();
    fireEvent.click(adim as HTMLButtonElement);
    expect(screen.getByRole('region', { name: 'Seçim kartı' }).querySelector('[data-k="secim-is"]')).not.toBeNull();
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Yan panel' })).getByRole('button', { name: 'Kapat (Esc)' }));
    expect(screen.queryByRole('complementary', { name: 'Yan panel' })).toBeNull();
    expect(yaris.closest('.tc-pym-oz')?.hasAttribute('data-vurgu')).toBe(false);
  });

  it('plan yazamayana seçim kartında Kokpit\'te düzenle yoktur (reddedilen)', () => {
    ac({ yaz: false });
    fireEvent.click(within(screen.getByRole('region', { name: 'Siparişler zamanında bitiyor mu?' })).getByRole('button', { name: '3' }));
    expect(within(screen.getByRole('region', { name: 'Seçim kartı' })).queryByRole('button', { name: 'Kokpit\'te düzenle' })).toBeNull();
  });

  it('açık şeritte Referans kutusu plan yazabilene açık (izinli), komutu olsa da yazamayana kapalıdır (reddedilen)', () => {
    const komut = { kaydet: vi.fn(), degistir: vi.fn() } as unknown as CalismaKomutu;
    const kutu = () => {
      fireEvent.click(within(screen.getByRole('group', { name: /^Plan nabzı/ })).getByRole('button', { name: /geciken · bu hafta/ }));
      return screen.getByLabelText('Referans') as HTMLSelectElement;
    };
    ac({ komut });
    expect(kutu().disabled).toBe(false);
    cleanup();
    ac({ yaz: false, komut });
    expect(kutu().disabled).toBe(true);
  });

  it('dönem değişince nabız ve Özet o dönemi ölçer', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Gün' }));
    expect(screen.getByRole('group', { name: /^Plan nabzı, 19\.10 Pzt$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki gün' }));
    expect(screen.getByRole('group', { name: /^Plan nabzı, 20\.10 Sal$/ })).toBeTruthy();
  });

  it('Harita görünümü: tuval, okuma, yakınlık, oynatıcı ve zaman şeridi; şerit siparişi seçer, H ve G görünüm değiştirir', () => {
    ac();
    fireEvent.keyDown(window, { key: 'h' });
    const h = screen.getByRole('region', { name: 'Tezgâh haritası' });
    expect(within(h).getByRole('img', { name: /Atölye haritası/ })).toBeTruthy();
    expect(within(h).getByRole('toolbar', { name: 'Görünüm' })).toBeTruthy();
    fireEvent.click(within(h).getByRole('button', { name: /Haritayı okuma/ }));
    expect(within(h).getByRole('list', { name: 'Haritanın açıklaması' })).toBeTruthy();
    expect(within(h).getByRole('group', { name: 'Yakınlık' })).toBeTruthy();
    expect(within(h).getByRole('button', { name: 'Oynat' })).toBeTruthy();
    expect(within(h).getByRole('button', { name: /4 sa\/sn/ })).toBeTruthy();
    fireEvent.click(within(h).getByRole('button', { name: /4 sa\/sn/ }));
    expect(within(h).getByRole('button', { name: /1 gün\/sn/ })).toBeTruthy();
    expect((within(h).getByRole('slider', { name: 'Zaman imleci' }) as HTMLInputElement).max).toBe('168');
    const bit = within(h).getByRole('button', { name: '3' });
    expect(bit.getAttribute('title')).toBe('3 bitiş 24.10 Cmt 11:38 · termine yetişiyor');
    fireEvent.click(bit);
    expect(bit.hasAttribute('data-secili')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bit.hasAttribute('data-secili')).toBe(false);
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByRole('region', { name: 'Plan nasıl gidiyor?' })).toBeTruthy();
  });

  it('Keşfet: pay şeridi ve hatlar siparişi seçer; hazırlık verisi yok; planı anlat kendiliğinden ilerler, ok ve adım durdurur', () => {
    vi.useFakeTimers();
    try {
      ac();
      fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
      const ks = screen.getByRole('region', { name: 'Pay şeridi' });
      expect(within(ks).getByRole('tab', { name: 'Pay şeridi' }).getAttribute('aria-selected')).toBe('true');
      expect([...ks.querySelectorAll('.tc-pym-ks-sayi')].map((x) => x.textContent)).toEqual(['1geç', '11 günden az pay', '0rahat']);
      const nokta = within(ks).getByRole('button', { name: '2: 3 gün geç' });
      fireEvent.click(nokta);
      expect(nokta.hasAttribute('data-secili')).toBe(true);
      fireEvent.click(within(ks).getByRole('tab', { name: 'Sipariş hatları' }));
      const hat = screen.getByRole('region', { name: 'Sipariş hatları' });
      expect(within(hat).getByRole('button', { name: /^2: / }).hasAttribute('data-secili')).toBe(true);
      fireEvent.keyDown(within(hat).getByRole('button', { name: /^3: / }), { key: 'Enter' });
      expect(within(hat).getByRole('button', { name: /^3: / }).hasAttribute('data-secili')).toBe(true);
      expect(within(hat).getByText('+73 sa geç')).toBeTruthy();
      fireEvent.click(within(hat).getByRole('tab', { name: 'Hazırlık' }));
      expect(within(screen.getByRole('region', { name: 'Hazırlık' })).getByText('Emir hazırlık verisi bu ekrana bağlı değil.')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Planı anlat' }));
      const adimlar = () => within(screen.getByRole('tablist', { name: 'Adımlar' })).getAllByRole('tab');
      expect(adimlar().map((x) => x.textContent)).toEqual(['Büyük resim', 'Ne bekletiyor', 'Süre nereye gidiyor', 'En yoğun gün', 'Doluluk', 'Ayarlar', 'Teslim', 'Hazırlık']);
      expect(screen.getByText('1 / 8')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(7000); });
      expect(screen.getByText('2 / 8')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Ne bekletiyor' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Durdur' })).toBeTruthy();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('3 / 8')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(14000); });
      expect(screen.getByText('3 / 8')).toBeTruthy();
      fireEvent.click(adimlar()[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Önceki (sol ok)' }));
      expect(screen.getByRole('heading', { name: 'Hazırlık' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Özet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
      expect(screen.getByText('8 / 8')).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

});
