import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { CalismaKomutu, DegisiklikSecenegi } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { MOTOR_NOTU } from '../../motor/ortak.tsx';
import { yetkiKur } from '../../yetki.ts';
import { MALIYETSIZ, YONETICI, ac as ortakAc, sunucuKur } from '../../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { CALISMA_DEGERI, calismaKur, OKUYAN, PLANCI } from '../veri/test-veri.tsx';
import { NasilHesaplandi } from './index.tsx';
import { ekipAyari, ekipSonOku, hariclar, kararSirasi, mesaiButcesi, selale, siparisEtkisi, yakinsama, zincir } from './kurallar.ts';

afterEach(cleanup);

// Uydurma son ekip çözümü: motor 12 → 10, ek mesai 10 → 7, son adım değiştirmez; alt sınır 4.
const EKIP_SON = {
  adim: { motor: { durum: 'tamam' }, mesai: { durum: 'alindi' }, son: { durum: 'tamam' }, sinir: { durum: 'tamam' }, kontrol: { durum: 'tamam' } },
  lb: 4, ms: 5200, zaman: Date.UTC(2026, 9, 19, 8), bas: 12, wT: 7, gecti: true,
  kararlar: [
    { id: 'mesai:T1|6|V2', ad: 'Ek mesai T1 6 V2', tur: 'mesai', durum: 'alinmadi', dW: -0.5, neden: 'gecikmeyi artırır' },
    { id: 'cpsat', ad: 'CP-SAT önerisi', tur: 'cpsat', durum: 'yok', dW: null, neden: 'kapalı' },
    { id: 'mesai:T2|5|V2', ad: 'Ek mesai T2 5 V2', tur: 'mesai', durum: 'alindi', dW: 3, neden: 'darboğaz' },
  ],
  basamak: [{ id: 'motor', ad: 'Motor', wT: 10 }, { id: 'mesai', ad: 'Ek mesai', wT: 7 }, { id: 'son', ad: 'Son', wT: 7 }],
  iz: [{ t: 0, wT: 12 }, { t: 1, wT: 10, adim: 'motor' }, { t: 3, wT: 7, adim: 'mesai' }, { t: 5, wT: 7, adim: 'son' }],
  J: { S1: [5, 2], S2: [0, 0], S3: [1, 0] },
};
const ekipli = (degis: (c: Record<string, unknown>) => void = () => undefined) => calismaKur((c) => { const x = c as unknown as Record<string, unknown>; x.ekipSon = structuredClone(EKIP_SON); degis(x); });

describe('Nasıl hesaplandı hesapları', () => {
  it('son ekip kaydı okunur; bozuk ya da eksik kayıt yok sayılır', () => {
    const s = ekipSonOku(ekipli());
    expect([s?.wT, s?.bas, s?.lb, s?.kararlar.length, s?.basamak.length, s?.iz.length, s?.gecti]).toEqual([7, 12, 4, 3, 3, 4, true]);
    expect(ekipSonOku(calismaKur())).toBeNull();
    expect(ekipSonOku(ekipli((c) => { (c.ekipSon as Record<string, unknown>).wT = 'x'; }))).toBeNull();
  });

  it('zincir, şelale, yakınsama, karar sırası ve sipariş etkisi', () => {
    const s = ekipSonOku(ekipli()); if (!s) throw new Error('kayıt');
    expect(zincir(s).map((a) => [a.id, a.durum, a.fark])).toEqual([['motor', 'tamam', null], ['mesai', 'alindi', 3], ['son', 'tamam', null], ['sinir', 'tamam', null], ['kontrol', 'tamam', null]]);
    expect(zincir(null).every((a) => a.durum === 'bekliyor')).toBe(true);
    const { kol, max } = selale(s);
    expect(kol.map((k) => [k.ad, k.tur, k.deger])).toEqual([['Motor', 'toplam', '10'], ['Ek mesai', 'azal', '−3'], ['Son', 'sifir', '0'], ['Sonuç', 'toplam', '7']]);
    expect(max).toBeCloseTo(11);
    const y = yakinsama(s);
    expect([y?.T, y?.sinirlar.map((x) => x.ad), y?.yol.startsWith('M0.0,')]).toEqual([5, ['Motor', 'Ek mesai', 'Sonuç'], true]);
    expect(kararSirasi(s).map(({ k, w }) => [k.id, w])).toEqual([['mesai:T2|5|V2', 0.5], ['mesai:T1|6|V2', 0.5 / 6], ['cpsat', 0]]);
    expect(siparisEtkisi(s).l).toEqual([{ j: 'S1', a: 5, b: 2 }, { j: 'S3', a: 1, b: 0 }]);
  });

  it('ayarlar: ek mesai ve alt sınır varsayılan açık, bütçe yoksa 8, hariç listesi', () => {
    const c = calismaKur();
    expect([ekipAyari(c), mesaiButcesi(c), hariclar(c)]).toEqual([{ mesai: true, sinir: true }, 8, []]);
    const d = ekipli((x) => { x.ekipAyar = { mesai: false }; x.ekipHaric = ['cpsat', 3]; (x.param as Record<string, unknown>) = { mesaiHafta: 12 }; });
    expect([ekipAyari(d), mesaiButcesi(d), hariclar(d)]).toEqual([{ mesai: false, sinir: true }, 12, ['cpsat']]);
  });
});

interface Degisiklik { ne: string; secenek: DegisiklikSecenegi | undefined; sonra: PlanlamaCalismasi }
function ac(c: PlanlamaCalismasi | null, islemler = PLANCI) {
  const degisiklikler: Degisiklik[] = []; const git = vi.fn(); const sec = vi.fn();
  const yetki = yetkiKur(islemler, { yazabilir: true });
  function Kap() {
    const [x, setX] = useState(c);
    const komut: CalismaKomutu | null = x && yetki.calismaYazabilir ? {
      degistir: (ne, fn, s) => { const t = structuredClone(x); if (fn(t) === false) return false; degisiklikler.push({ ne, secenek: s, sonra: t }); setX(t); return true; },
      geriAl: () => false, geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => false, kaydet: () => Promise.resolve(null),
    } : null;
    const o: PlanlamaEkranOzellikleri = {
      depo: { durum: null } as unknown as PlanlamaDeposu, calisma: x, komut, yetki, git, yenile: () => undefined, olcek: ACILIS_OLCEGI, olcekSec: () => undefined,
      kaydir: () => undefined, secim: BOS_SECIM, sec,
    };
    return <NasilHesaplandi {...o} />;
  }
  render(<BildirimSaglayici><Kap /></BildirimSaglayici>);
  return { degisiklikler, git, sec };
}

describe('Nasıl hesaplandı ekranı', () => {
  it('kayıt yoksa: karar masası, boş sonuç, bekleyen beş adım; grafik yok; Ekip olarak çöz motor ister', () => {
    ac(calismaKur());
    expect(screen.getByText('Henüz ekip çalışmadı')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Ekip adımları' })).getAllByRole('listitem').map((l) => l.textContent?.endsWith('bekliyor'))).toEqual([true, true, true, true, true]);
    expect(screen.queryByRole('img', { name: /Kim ne kattı/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ekip olarak çöz' }).getAttribute('title')).toBe(`Ekip olarak çöz: ${MOTOR_NOTU}`);
  });

  it('son kayıt: sonuç, şelale, yakınsama, kararlar ve sipariş etkisi; sipariş adı tahtada seçer', () => {
    const { git, sec } = ac(ekipli());
    expect(screen.getByText('Son ekip sonucu')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Kim ne kattı.*Ek mesai: −3/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /12 saatten 7 saate, 5 saniyede/ })).toBeTruthy();
    const kararlar = screen.getAllByRole('listitem').filter((l) => l.classList.contains('tc-pyh-karar'));
    expect(kararlar.map((l) => l.querySelector('b')?.textContent)).toEqual(['Ek mesai T2 5 V2', 'Ek mesai T1 6 V2', 'CP-SAT önerisi']);
    expect(within(kararlar[0] as HTMLElement).getByRole('button', { name: 'Bu kararı tek başına önizle' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'S1' }));
    expect(sec).toHaveBeenCalledWith({ siparis: 'S1', adim: null, tezgah: null });
    expect(git).toHaveBeenCalledWith('plan');
  });

  it('planlamacı yazar: ekip anahtarı, süre, bütçe ve hariç tutma çalışmaya komutla; bütçe sınır dışı yazılmaz', () => {
    const { degisiklikler } = ac(ekipli());
    fireEvent.click(screen.getByRole('switch', { name: /HiGHS · ek mesai/ }));
    expect([degisiklikler.at(-1)?.ne, degisiklikler.at(-1)?.secenek, (degisiklikler.at(-1)?.sonra.ekipAyar as Record<string, unknown>).mesai])
      .toEqual(['Ekip ayarı', { ayrinti: 'mesai: kapalı', planKoru: true }, false]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Süre' }), { target: { value: '20' } });
    expect([degisiklikler.at(-1)?.ne, degisiklikler.at(-1)?.sonra.w.sure]).toEqual(['Çözüm süresi', 20]);
    const butce = screen.getByRole('spinbutton', { name: 'Haftalık mesai bütçesi (sa)' });
    fireEvent.change(butce, { target: { value: '99' } }); fireEvent.blur(butce);
    expect(degisiklikler).toHaveLength(2);
    fireEvent.change(butce, { target: { value: '12' } }); fireEvent.blur(butce);
    expect([degisiklikler.at(-1)?.ne, degisiklikler.at(-1)?.sonra.param.mesaiHafta]).toEqual(['Parametre değişti', 12]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sonraki çözümlerde hariç tut' })[0] as HTMLElement);
    expect(degisiklikler.at(-1)?.sonra.ekipHaric).toEqual(['mesai:T2|5|V2']);
    fireEvent.click(screen.getByRole('button', { name: /Ek mesai T2 5 V2/ }));
    expect(degisiklikler.at(-1)?.sonra.ekipHaric).toEqual([]);
  });

  it('okuyan planlamacı: aynı bölümler, ayarlar kapalı, karar düğmeleri yok', () => {
    ac(ekipli(), OKUYAN);
    expect(screen.getByRole('switch', { name: /HiGHS · ek mesai/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('combobox', { name: 'Süre' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Ekip olarak çöz' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sonraki çözümlerde hariç tut' })).toBeNull();
    expect(screen.getByRole('img', { name: /Kim ne kattı/ })).toBeTruthy();
  });

  it('Akış ağı sekmesi; çalışma yoksa boş ekran', async () => {
    ac(ekipli());
    fireEvent.click(screen.getByRole('tab', { name: /Akış ağı/ }));
    expect(await screen.findByRole('tablist', { name: 'Ağ görünümü' })).toBeTruthy();
    expect(screen.queryByText('Ekip adımları')).toBeNull();
    cleanup();
    ac(null);
    expect(screen.getByText('Planlama çalışması yok')).toBeTruthy();
  });
});

describe('Nasıl hesaplandı sayfası planlama ekranında', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 4 }];
  it('Başka menüsünün Sayfalar\'ından açılır, adresle doğrudan açılır; Plan tahtaya döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    ortakAc('/plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Başka' }, { timeout: 10000 }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Nasıl hesaplandı/ }));
    await waitFor(() => { expect(document.querySelector('[data-parca="hesap"]')).not.toBeNull(); }, { timeout: 10000 });
    const cubuk = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    expect(within(cubuk).getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(document.querySelector('[data-parca="hesap"]')).toBeNull(); });
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(MALIYETSIZ, KAYIT);
    ortakAc('/plan?ekran=hesap');
    await waitFor(() => { expect(document.querySelector('[data-parca="hesap"]')).not.toBeNull(); }, { timeout: 10000 });
  }, 30000);
});
