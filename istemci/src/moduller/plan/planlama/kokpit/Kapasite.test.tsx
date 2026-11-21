import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { saatYaz } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Kapasite } from './Kapasite.tsx';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3282 2a-1: Kokpit'in kapasite bölümü. Çalışma uydurmadır (örnek başlangıç 2026-10-19); taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

const TEZGAHLAR = [{ id: 'ORN-T1', kod: 'T1', ad: 'Torna', fason: false }, { id: 'ORN-T2', kod: 'T2', ad: '', fason: false }, { id: '~fason', kod: 'Fason', ad: 'dış atölye', fason: true }];
const OTO = { m: 'ORN-T1', from: 30, to: 40, neden: 'bakım', oto: 1 };
const ELLE = { m: 'ORN-T1', from: 50, to: 58, neden: 'arıza' };
const GECMIS = { m: 'ORN-T1', from: 0, to: 4 };

function kur(yazabilir = true, down: unknown[] = [OTO, ELLE, GECMIS]) {
  const c = { ...ornekCalisma(), down } as unknown as PlanlamaCalismasi;
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  const ciz = (cc: PlanlamaCalismasi) => <Kapasite c={cc} m={{ tezgahlar: TEZGAHLAR, simdi: 10 }} taslak={t} yazabilir={yazabilir} zaman={(x) => saatYaz(c.D, x)} kapat={kapat} />;
  const { rerender } = render(ciz(c));
  return { c, t, yazilan, kapat, yenile: (down: unknown[]) => { rerender(ciz({ ...c, down } as unknown as PlanlamaCalismasi)); }, panel: screen.getByRole('complementary', { name: 'Duruş ve mesai' }) };
}

describe('Kokpit kapasite bölümü (3282 2a-1)', () => {
  it('Vardiya ekranından gelen planlı duruş başlığıyla yazar, kaynağını söyler ve buradan silinmez', () => {
    const v = kur();
    v.yenile([{ m: 'ORN-T1', from: 30, to: 40, neden: 'planlı duruş', baslik: 'ORN-Bakım', oto: 1, bakim: 'vd:1' }]);
    const vs = within(v.panel).getAllByRole('listitem');
    expect(vs.map((x) => x.textContent)).toEqual(['Planlı duruş (ORN-Bakım) 20.10 Sal 06:00 → 20.10 Sal 16:00 · Vardiya ekranından geldi; orada değişir']);
    expect(within(vs[0]!).queryByRole('button')).toBeNull();
  });

  it('tezgâhın önümüzdeki duruşlarını gösterir; kendiliğinden geleni silinmez, elle gireni adıyla silinir; fason seçilmez', () => {
    const { panel } = kur();
    expect(within(within(panel).getByLabelText('Tezgâh')).getAllByRole('option').map((o) => o.textContent)).toEqual(['T1 · Torna', 'T2']);
    const satirlar = within(panel).getAllByRole('listitem');
    expect(satirlar.map((s) => s.textContent)).toEqual(['Bakım 20.10 Sal 06:00 → 20.10 Sal 16:00 · kendiliğinden geldi', 'Arıza 21.10 Çar 02:00 → 21.10 Çar 10:00']);
    expect(within(satirlar[0]!).queryByRole('button')).toBeNull();
    expect(within(satirlar[1]!).getByRole('button', { name: 'T1 21.10 Çar 02:00 → 21.10 Çar 10:00 duruşunu sil' })).toBeTruthy();
    expect(within(panel).getByText(/kaynağında kapanınca kalkar/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Tezgâh'), { target: { value: 'ORN-T2' } });
    expect(within(panel).getByText('T2 için önümüzdeki duruş yok.')).toBeTruthy();
  });

  it('duruş ekle taslağa komut yazar (çeyrek saate yuvarlı), etkisini gösterir; Uygula dizmeyi yazar', async () => {
    const { t, yazilan, panel, yenile } = kur();
    fireEvent.change(within(panel).getByLabelText('Tür'), { target: { value: 'bakım' } });
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-20T08:10' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-20T12:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Duruşun etkisi' });
    expect(yazilan).toEqual([{ tur: 'durus', tezgah: 'ORN-T1', bas: 32.25, bit: 36, neden: 'bakım' }]);
    expect(t.yaz).toHaveBeenCalledWith(yazilan[0], false);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    // Uygula tek birincil düğmedir; ekleme formu etki varken yoktur.
    expect(within(etki).getByRole('button', { name: 'Uygula' }).className).toContain('tc-dugme-birincil');
    expect(within(panel).queryByRole('button', { name: 'Duruş ekle, etkisini gör' })).toBeNull();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
    // Uygula'dan sonra odak eklenen satıra gider (dar ekranda form listenin altındadır).
    yenile([OTO, ELLE, { m: 'ORN-T1', from: 32.25, to: 36, neden: 'bakım' }]);
    await vi.waitFor(() => { expect(document.activeElement?.textContent).toBe('Bakım 20.10 Sal 08:15 → 20.10 Sal 12:00'); });
  });

  // 3335 a: tezgâh adından gelinen istek. Etki gösterilirken bekleyen deneme o tezgâhındır; yeni istek tezgâhı değiştirmez.
  it('istenen tezgâhla açılır; yeni istek tezgâhı değiştirir, etki gösterilirken değiştirmez', async () => {
    const c = { ...ornekCalisma(), down: [] } as unknown as PlanlamaCalismasi;
    const { t } = sahteTaslak(c.dataVer);
    const ciz = (istenen: { tezgah: string; n: number } | null) => <Kapasite c={c} m={{ tezgahlar: TEZGAHLAR, simdi: 10 }} taslak={t} yazabilir zaman={(x) => saatYaz(c.D, x)} kapat={vi.fn()} istenen={istenen} />;
    const { rerender } = render(ciz({ tezgah: 'ORN-T2', n: 1 }));
    const panel = screen.getByRole('complementary', { name: 'Duruş ve mesai' });
    const tezgah = () => (within(panel).getByLabelText('Tezgâh') as HTMLSelectElement).value;
    expect(tezgah()).toBe('ORN-T2');
    expect(document.activeElement).toBe(within(panel).getByLabelText('Tür'));
    rerender(ciz({ tezgah: 'ORN-T1', n: 2 }));
    expect(tezgah()).toBe('ORN-T1');
    // Fason ya da bilinmeyen tezgâh isteği yok sayılır.
    rerender(ciz({ tezgah: '~fason', n: 3 }));
    expect(tezgah()).toBe('ORN-T1');
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-20T08:00' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-20T12:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    await screen.findByRole('region', { name: 'Duruşun etkisi' });
    rerender(ciz({ tezgah: 'ORN-T2', n: 4 }));
    expect(tezgah()).toBe('ORN-T1');
  });

  it('silme taslağa duruş-sil yazar; Vazgeç geri alır', async () => {
    const { t, yazilan, panel } = kur();
    fireEvent.click(within(panel).getByRole('button', { name: /duruşunu sil$/ }));
    const etki = await screen.findByRole('region', { name: 'Duruşun etkisi' });
    expect(yazilan).toEqual([{ tur: 'durus-sil', tezgah: 'ORN-T1', bas: 50, bit: 58 }]);
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    await vi.waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false, false); });
  });

  it('ters aralık ve geçmişte biten duruş yazılmaz, nedeni yazılır', () => {
    const { yazilan, panel } = kur();
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-20T12:00' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-20T08:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Bitiş başlangıçtan sonra olmalı.');
    fireEvent.change(within(panel).getByLabelText('Başlangıç'), { target: { value: '2026-10-19T02:00' } });
    fireEvent.change(within(panel).getByLabelText('Bitiş'), { target: { value: '2026-10-19T06:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Duruş ekle, etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Bitiş şimdiden sonra olmalı.');
    expect(yazilan).toEqual([]);
  });

  it('yazamayan kişi duruşları görür, ekleyemez ve silemez', () => {
    const { panel } = kur(false);
    expect(within(panel).getByText('Duruşu ve ek mesaiyi yalnız planı yazabilen kişi ekler ya da siler.')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /sil$/ })).toBeNull();
    expect(within(panel).queryByRole('form')).toBeNull();
  });
});

// 3282 2a-2: ek mesai operatörle. Örnek çalışmada tezgâh 1'in grubu 1; Operatör Bir'in kendi vardiyası 1 (08:00–16:00), 20.10 salı.
describe('Kokpit ek mesai (3282 2a-2)', () => {
  const T = [{ id: '1', kod: 'T1', ad: 'Torna', fason: false }];
  function kurMesai(ekMesai: unknown[] = [], yazabilir = true, degis: (c: PlanlamaCalismasi) => void = () => undefined) {
    const c = { ...ornekCalisma(), down: [], ekMesai } as unknown as PlanlamaCalismasi;
    degis(c);
    const { t, yazilan } = sahteTaslak(c.dataVer);
    const ciz = (cc: PlanlamaCalismasi) => <Kapasite c={cc} m={{ tezgahlar: T, simdi: 10 }} taslak={t} yazabilir={yazabilir} zaman={(x) => saatYaz(c.D, x)} kapat={vi.fn()} />;
    const { rerender } = render(ciz(c));
    return { t, yazilan, yenile: (l: unknown[]) => { rerender(ciz({ ...c, ekMesai: l } as unknown as PlanlamaCalismasi)); }, panel: screen.getByRole('complementary', { name: 'Duruş ve mesai' }) };
  }
  const form = (panel: HTMLElement) => within(panel).getByRole('form', { name: 'Ek mesai ekle' });
  const secenekler = (panel: HTMLElement) => within(form(panel)).getAllByRole('option').filter((o) => o.parentElement?.id === 'tc-pyq-mesai-kisi').map((o) => o.textContent);

  it('operatör listesinde yalnız o pencerede çalışabilenler durur; kendi vardiyasıyla kesişen çıkar', () => {
    const { panel } = kurMesai();
    expect(within(form(panel)).getByLabelText('Gün')).toHaveProperty('value', '2026-10-20');
    expect(secenekler(panel)).toEqual(['Örnek Müdür', 'Örnek Vardiya Sorumlusu']);
    fireEvent.change(within(form(panel)).getByLabelText('Vardiya'), { target: { value: '2' } });
    expect(secenekler(panel)).toEqual(['Örnek Müdür', 'Örnek Operatör Bir', 'Örnek Vardiya Sorumlusu']);
    expect(within(panel).getByText('Bu hafta ek mesai: 0 / 8 saat.')).toBeTruthy();
  });

  it('ekle taslağa operatörlü ek mesai yazar, etkisini gösterir; Uygula sonrası odak yeni satırda', async () => {
    const { t, yazilan, panel, yenile } = kurMesai();
    fireEvent.change(within(form(panel)).getByLabelText('Vardiya'), { target: { value: '2' } });
    fireEvent.change(within(form(panel)).getByLabelText('Operatör'), { target: { value: '4' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ek mesai ekle, etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Ek mesainin etkisi' });
    expect(yazilan).toEqual([{ tur: 'ek-mesai', tezgah: '1', gun: 1, vardiya: '2', personel: '4' }]);
    expect(within(panel).queryByRole('form', { name: 'Ek mesai ekle' })).toBeNull();
    expect(within(panel).queryByRole('form', { name: 'Arıza ya da bakım ekle' })).toBeNull();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalled(); });
    yenile([{ m: '1', gun: 1, vardiya: '2', personel: '4' }]);
    await vi.waitFor(() => { expect(document.activeElement?.textContent).toBe('20.10 Sal 16:00–00:00 · Örnek Operatör Bir'); });
  });

  it('satır adıyla silinir; bütçe dolunca ve aynı satır varken ekle kapalı, nedeni yazılı', async () => {
    const { yazilan, panel } = kurMesai([{ m: '1', gun: 2, vardiya: '1' }]);
    expect(within(panel).getAllByRole('listitem').map((x) => x.textContent)).toEqual(['21.10 Çar 08:00–16:00 · operatör seçilmedi']);
    expect(within(panel).getByText('Bu hafta ek mesai: 7.5 / 8 saat.')).toBeTruthy();
    const ekle = within(panel).getByRole('button', { name: 'Ek mesai ekle, etkisini gör' });
    expect(ekle).toHaveProperty('disabled', true);
    expect(within(panel).getByText('Haftalık ek mesai bütçesi doldu (7.5 / 8 saat).')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'T1 21.10 Çar 08:00–16:00 ek mesaisini sil' }));
    await screen.findByRole('region', { name: 'Ek mesainin etkisi' });
    expect(yazilan).toEqual([{ tur: 'ek-mesai-sil', tezgah: '1', gun: 2, vardiya: '1' }]);
  });

  it('uygun operatör yoksa ekle kapalı ve nedeni yazılı; geçmiş gün eklenmez', () => {
    const { panel } = kurMesai([], true, (c) => { c.D.personel = c.D.personel!.filter((p) => p.id === '4'); Object.assign(c, { param: { ...c.param, mesaiHafta: 0 } }); });
    expect(within(panel).getByText('Uygun operatör yok: ek vardiya operatörün kendi vardiyasıyla çakışıyor.')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Ek mesai ekle, etkisini gör' })).toHaveProperty('disabled', true);
    expect(within(panel).getByText('Bu hafta ek mesai: 0 saat (bütçe sınırsız).')).toBeTruthy();
    fireEvent.change(within(form(panel)).getByLabelText('Gün'), { target: { value: '2026-10-18' } });
    expect(within(panel).getByText('Geçmiş güne ek mesai eklenemez.')).toBeTruthy();
  });

  it('yazamayan kişi ek mesaiyi görür, ekleyemez ve silemez', () => {
    const { panel } = kurMesai([{ m: '1', gun: 2, vardiya: '1', personel: '2' }], false);
    expect(within(panel).getAllByRole('listitem').map((x) => x.textContent)).toEqual(['21.10 Çar 08:00–16:00 · Örnek Müdür']);
    expect(within(panel).queryByRole('button', { name: /ek mesaisini sil$/ })).toBeNull();
    expect(within(panel).queryByRole('form', { name: 'Ek mesai ekle' })).toBeNull();
  });
});

describe('Kokpit kapasite bölümü, Vardiya\'dan gelen uzak duruşlar kapalı durur (3521)', () => {
  // Şimdi 10; yakın sınırı 10 + 28 gün = 682. saat.
  const haftalik = (m: string, n: number, ilk = 30) => Array.from({ length: n }, (_, i) => ({ m, from: ilk + 168 * i, to: ilk + 10 + 168 * i, neden: 'planlı duruş', baslik: 'ORN-Bakım', oto: 1, bakim: `vd:1:${String(i)}` }));
  const UZAK_ELLE = { m: 'ORN-T1', from: 2000, to: 2008, neden: 'arıza' };
  const UZAK_ARIZA = { m: 'ORN-T1', from: 3000, to: 3010, neden: 'arıza', oto: 1 };
  const satirlar = (panel: HTMLElement) => within(panel).getAllByRole('listitem').map((x) => x.textContent ?? '');

  it('yakın dört hafta ile elle girilen ve arızadan gelen duruş açıktır; ötesi düğmeyle açılır ve kapanır', () => {
    const { panel } = kur(true, [...haftalik('ORN-T1', 52), UZAK_ELLE, UZAK_ARIZA]);
    const kapali = satirlar(panel);
    expect(kapali).toHaveLength(7);
    expect(kapali.slice(0, 4).every((x) => x.startsWith('Planlı duruş (ORN-Bakım)'))).toBe(true);
    expect(kapali.slice(4)).toEqual([expect.stringMatching(/^Arıza [^·]*$/), expect.stringMatching(/^Arıza .* · kendiliğinden geldi$/), 'Daha sonraki 48 duruşu göster']);
    const dugme = within(panel).getByRole('button', { name: 'Daha sonraki 48 duruşu göster' });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme);
    const acik = satirlar(panel);
    expect(acik).toHaveLength(55);
    // Açılan satırlar düğmenin altına gelir; üstteki satırlar yerinden oynamaz.
    expect(acik.slice(0, 6)).toEqual(kapali.slice(0, 6));
    expect(acik[6]).toBe('Daha sonraki 48 duruşu gizle');
    expect(acik.slice(7).every((x) => x.endsWith('· Vardiya ekranından geldi; orada değişir'))).toBe(true);
    expect(dugme.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(dugme);
    expect(satirlar(panel)).toEqual(kapali);
  });

  it('sınır şimdiden 28 gün sonradır; tek uzak duruş için düğme konmaz', () => {
    const tek = (from: number) => ({ m: 'ORN-T1', from, to: from + 4, neden: 'planlı duruş', baslik: 'ORN-Bakım', oto: 1 });
    const v = kur(true, [tek(681.75), tek(682), tek(700)]);
    expect(satirlar(v.panel)).toHaveLength(2);
    expect(within(v.panel).getByRole('button', { name: 'Daha sonraki 2 duruşu göster' })).toBeTruthy();
    v.yenile([tek(681.75), tek(700)]);
    expect(satirlar(v.panel)).toHaveLength(2);
    expect(within(v.panel).queryByRole('button', { name: /^Daha sonraki/ })).toBeNull();
  });

  it('açık liste tezgâha aittir: başka tezgâha geçince onun uzak duruşları kapalı gelir', () => {
    const { panel } = kur(true, [...haftalik('ORN-T1', 8), ...haftalik('ORN-T2', 9)]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Daha sonraki 4 duruşu göster' }));
    expect(satirlar(panel)).toHaveLength(9);
    fireEvent.change(within(panel).getByLabelText('Tezgâh'), { target: { value: 'ORN-T2' } });
    expect(within(panel).getByRole('button', { name: 'Daha sonraki 5 duruşu göster' }).getAttribute('aria-expanded')).toBe('false');
    expect(satirlar(panel)).toHaveLength(5);
  });
});
