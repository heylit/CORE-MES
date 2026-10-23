import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { depoOku } from '../normalize.ts';
import { bosProfil } from '../kurallar/profil.ts';
import { kuralBaglami, puanHesapla, aktifSorular } from '../kurallar/puan.ts';
import { baglamlaAc, sahteSunucu } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { hizliTurSec, puanYazisi, raporMetni, HIZLI_TUR_SORU_SAYISI, haftaIcsSatirlari } from './hesaplar.ts';
import { Aksiyonlar, GenelBakis, HaftalikProgram, MulakatKartlari, OzDegerlendirme, Rehber, Simulasyon } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

const OKUR = { yazabilir: false, yonetici: false };
const sonYazilan = (s: ReturnType<typeof sahteSunucu>): Depo => {
  const y = s.yazilanlar.at(-1);
  if (!y) throw new Error('yazma yok');
  return depoOku(y.deger);
};
const aktif = (d: Depo) => d.data[d.active];

describe('P1 program görünümleri: yazma yetkisi', () => {
  it('Genel bakış: yazar hızlı turu ve tarih girişini görür; okur görmez', async () => {
    sahteSunucu();
    await baglamlaAc(<GenelBakis />, 'dash');
    expect(await screen.findByRole('button', { name: /10 soruluk hızlı tur/ })).toBeTruthy();
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<GenelBakis />, 'dash');
    expect(await screen.findByText('Sıradaki adımlar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /10 soruluk hızlı tur/ })).toBeNull();
  });

  it('Simülasyon: yazar puan verir ve kayda yazılır; okurda ölçek kapalı, sıfırlama yok', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<Simulasyon />, 'sim');
    const olcek = await screen.findByRole('group', { name: 'Puan' });
    const uc = within(olcek).getAllByRole('button')[3];
    if (!uc) throw new Error('ölçek yok');
    fireEvent.click(uc);
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    expect(Object.values(aktif(sonYazilan(s))?.pw.iso9001.ans ?? {})).toContain('3');
    expect(screen.getByRole('button', { name: /Simülasyonu sıfırla/ })).toBeTruthy();
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<Simulasyon />, 'sim');
    const kapali = await screen.findByRole('group', { name: 'Puan' });
    for (const b of within(kapali).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /sıfırla/ })).toBeNull();
  });

  it('Öz değerlendirme: yazar turu başlatır; okur başlatamaz', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<OzDegerlendirme />, 'kontrol');
    fireEvent.click(await screen.findByRole('button', { name: /Turu başlat/ }));
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    expect(aktif(sonYazilan(s))?.pw.iso9001.oz.cur).toBeTruthy();
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<OzDegerlendirme />, 'kontrol');
    expect(await screen.findByText(/Kapsama/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Turu başlat/ })).toBeNull();
  });

  it('Haftalık program: tarih yokken yazar tarih girer; okurda giriş yok', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<HaftalikProgram />, 'hazirlik');
    const girdi = (await screen.findAllByLabelText(/tarih/i)).find((x) => x instanceof HTMLInputElement);
    if (!girdi) throw new Error('tarih girişi yok');
    fireEvent.change(girdi, { target: { value: '2099-06-15' } });
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    expect(aktif(sonYazilan(s))?.audits.some((a) => a.date === '2099-06-15')).toBe(true);
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<HaftalikProgram />, 'hazirlik');
    await screen.findByRole('group', { name: /Görünüm/ });
    expect(screen.queryAllByLabelText(/tarih/i).filter((x) => x instanceof HTMLInputElement)).toHaveLength(0);
  });

  it('Mülakat kartları: kart çevrilir; yazar "hazırım" işaretler, okur işaretleyemez', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<MulakatKartlari />, 'sorular');
    fireEvent.click(await screen.findByRole('button', { name: 'Kartı cevaba çevir' }));
    expect(screen.getByRole('button', { name: 'Kartı soruya çevir' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bu soruya hazırım' }));
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    expect(Object.values(aktif(sonYazilan(s))?.pw.iso9001.cards ?? {})).toContain('ok');
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<MulakatKartlari />, 'sorular');
    await screen.findByRole('button', { name: 'Kartı cevaba çevir' });
    expect(screen.queryByRole('button', { name: 'Bu soruya hazırım' })).toBeNull();
  });

  it('Aksiyonlar: boşken yazar örnek raporu açar; okur yalnız simülasyona yönlenir', async () => {
    sahteSunucu();
    await baglamlaAc(<Aksiyonlar />, 'rapor');
    fireEvent.click(await screen.findByRole('button', { name: 'Örnek bir raporu göster' }));
    expect(await screen.findByRole('button', { name: 'Raporu kopyala' })).toBeTruthy();
    expect(screen.getByText('Aksiyon planı')).toBeTruthy();
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<Aksiyonlar />, 'rapor');
    expect(await screen.findByRole('button', { name: 'Simülasyona başla' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Örnek bir raporu göster' })).toBeNull();
  });

  it('Rehber: madde çarkı ve doküman araması; doküman işareti yazarda açık, okurda kapalı', async () => {
    sahteSunucu();
    await baglamlaAc(<Rehber />, 'rehber');
    const ara = await screen.findByRole('searchbox', { name: 'Doküman ara' });
    const once = screen.getAllByRole('checkbox').length;
    fireEvent.change(ara, { target: { value: 'kalibrasyon' } });
    const sonra = screen.getAllByRole('checkbox');
    expect(sonra.length).toBeLessThan(once);
    for (const k of sonra) expect((k as HTMLInputElement).disabled).toBe(false);
    cleanup();
    sahteSunucu(OKUR);
    await baglamlaAc(<Rehber />, 'rehber');
    await screen.findByRole('searchbox', { name: 'Doküman ara' });
    for (const k of screen.getAllByRole('checkbox')) expect((k as HTMLInputElement).disabled).toBe(true);
  });
});

describe('P1 program saf hesapları', () => {
  const kb = () => kuralBaglami(bosProfil(), 'iso9001');

  it('hızlı tur benzersiz on soru seçer; aynı rastgele kaynakla aynı seçim', () => {
    const sabit = () => 0.42;
    const a = hizliTurSec(kb(), sabit);
    expect(a).toHaveLength(HIZLI_TUR_SORU_SAYISI);
    expect(new Set(a).size).toBe(a.length);
    expect(hizliTurSec(kb(), sabit)).toEqual(a);
  });

  it('puan yazısı: veri yoksa tire, EYDEP yüzdesiz', () => {
    expect(puanYazisi({ program: 'iso9001' }, null)).toBe('–');
    expect(puanYazisi({ program: 'iso9001' }, 72)).toBe('%72');
    expect(puanYazisi({ program: 'eydep' }, 72)).toBe('72');
  });

  it('rapor metni program adını ve puanı taşır', () => {
    const k = kb();
    const r = puanHesapla(aktifSorular(k.pg, false), { [k.pg.Q[0]?.id ?? '']: '3' }, k.pg);
    const m = raporMetni(k, r, new Date(2026, 0, 2));
    expect(m).toContain(k.pg.n);
    expect(m).toContain(puanYazisi(k, r.pct));
  });

  it('haftalık takvim dosyası denetim tarihi yoksa üretilmez', () => {
    expect(haftaIcsSatirlari(kb(), 'p1')).toBeNull();
  });
});

