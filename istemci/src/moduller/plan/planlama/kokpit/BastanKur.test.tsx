import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BastanKur, type BastanKurOzellikleri } from './BastanKur.tsx';
import type { KokpitEmri, KokpitIsi } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';

// Uydurma örnek (ORN-): şimdi 10. saat. ORN-UE-1: torna elle kilitli, freze başlamış, taşlama geride. ORN-UE-2 ve sonrası: serbest işler.
const is = (id: string, S: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${id}`, m: 'T1', S, C: S + 4, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string): KokpitEmri => ({ id, no: `ORN-UE-${id}`, urun: `ORN-Mil ${id}`, adet: 1, termin: 40, bitis: null, durum: 'iyi', gecikme: null, adimlar: [{ id: `${id}.10`, ad: 'Torna', adaylar: ['T1'] }] });
const kart = (e: KokpitEmri): SiraKarti => ({ kok: e.id, siparis: null, emirler: [e], termin: 40, adim: 1, yerlesen: 1, durum: 'iyi' } as SiraKarti);

function ciz(ek: Partial<BastanKurOzellikleri> = {}, kartSayisi = 3) {
  const emirler = Array.from({ length: kartSayisi }, (_, i) => emir(String(i + 1)));
  const isler: Record<string, KokpitIsi> = {};
  emirler.forEach((e, i) => { isler[`${e.id}.10`] = is(`${e.id}.10`, 20 + i, i === 0 ? { kilitli: true } : {}); });
  isler['1.20'] = is('1.20', 4, { basladi: true });
  const vazgec = vi.fn(), onayla = vi.fn();
  render(<BastanKur m={{ simdi: 10, emirler, isler }} kartlar={emirler.map(kart)} planYok={false} kilitYetkisi ilkKapsam="tum" ilkSecili={[]} vazgec={vazgec} onayla={onayla} {...ek} />);
  return { vazgec, onayla, pencere: screen.getByRole('dialog', { name: 'Planı baştan kur' }) };
}

afterEach(cleanup);

describe('BastanKur penceresi (3600)', () => {
  it('bütün planda kapsamı düğmede söyler; kilitli iş varsayılan dizilir, onayda kalkacak kilit sayısı yazar ve komuta kilitKaldir gider', () => {
    const { pencere, onayla } = ciz();
    expect(within(pencere).getByRole('radio', { name: /Bütün plan/ }).getAttribute('aria-checked')).toBe('true');
    expect(pencere.textContent).toContain('Onayda 1 elle kilit kalkar; Geri al ile döner.');
    expect(pencere.textContent).toContain('1 başlamış iş yerinde kalır');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bütün planı baştan kur' }));
    expect(onayla).toHaveBeenCalledWith({ isler: ['*'], kilitKaldir: true, ileti: 'Plan baştan kuruldu; 1 kilit kalktı.' });
  });

  it('kilit anahtarı kapatılınca kilit kalkmaz ve komut kilitKaldir taşımaz', () => {
    const { pencere, onayla } = ciz();
    fireEvent.click(within(pencere).getByRole('switch', { name: 'Kilitli işleri de diz' }));
    expect(pencere.textContent).toContain('1 kilitli iş yerinde kalır.');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bütün planı baştan kur' }));
    expect(onayla).toHaveBeenCalledWith({ isler: ['*'], kilitKaldir: false, ileti: 'Plan baştan kuruldu.' });
  });

  it('kilitleme yetkisi yoksa anahtar pasif ve kapalıdır, nedeni yazar; komut kilit kaldırmaz', () => {
    const { pencere, onayla } = ciz({ kilitYetkisi: false });
    const anahtar = within(pencere).getByRole('switch', { name: 'Kilitli işleri de diz' }) as HTMLButtonElement;
    expect(anahtar.disabled).toBe(true);
    expect(anahtar.getAttribute('aria-checked')).toBe('false');
    expect(pencere.textContent).toContain('Kilitleri kaldırmak plan kilitleme yetkisi ister');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bütün planı baştan kur' }));
    expect(onayla.mock.calls[0]?.[0]).toMatchObject({ kilitKaldir: false });
  });

  it('seçili siparişlerde seçim yokken düğme pasiftir ve nedenini yazar; seçince düğme sayıyı söyler ve yalnız seçilen emri yollar', () => {
    const { pencere, onayla } = ciz({ ilkKapsam: 'secili' });
    const dugme = (ad: string) => within(pencere).getByRole('button', { name: ad }) as HTMLButtonElement;
    expect(dugme('0 siparişi baştan kur').disabled).toBe(true);
    expect(pencere.textContent).toContain('Önce en az bir sipariş seçin.');
    fireEvent.click(within(pencere).getByRole('checkbox', { name: /ORN-UE-2/ }));
    expect(dugme('1 siparişi baştan kur').disabled).toBe(false);
    // Kilitli iş seçilmedi: kalkacak kilit yok.
    fireEvent.click(dugme('1 siparişi baştan kur'));
    expect(onayla).toHaveBeenCalledWith({ isler: ['2'], kilitKaldir: false, ileti: '1 sipariş baştan kuruldu.' });
  });

  it('menüden seçili sipariş işaretli açılır; kilitli siparişte kilit sayısı onay metnine girer', () => {
    const { pencere, onayla } = ciz({ ilkKapsam: 'secili', ilkSecili: ['1'] });
    expect((within(pencere).getByRole('checkbox', { name: /ORN-UE-1/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: '1 siparişi baştan kur' }));
    expect(onayla).toHaveBeenCalledWith({ isler: ['1'], kilitKaldir: true, ileti: '1 sipariş baştan kuruldu; 1 kilit kalktı.' });
  });

  it('arama listeyi daraltır; çok sipariş varsa ilk altısı gösterilir ve aramayı daraltmak söylenir; görünmeyen seçim çıkarılabilir', () => {
    const { pencere } = ciz({ ilkKapsam: 'secili', ilkSecili: ['9'] }, 12);
    expect(within(pencere).getAllByRole('checkbox')).toHaveLength(6);
    expect(pencere.textContent).toContain('12 sonuç, ilk 6 gösteriliyor. Aramayı daraltın.');
    expect(pencere.textContent).toContain('Listede görünmeyen 1 seçili sipariş var.');
    fireEvent.change(within(pencere).getByRole('searchbox'), { target: { value: 'ORN-UE-12' } });
    expect(within(pencere).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(within(pencere).getByRole('searchbox'), { target: { value: 'yok' } });
    expect(pencere.textContent).toContain('Eşleşen sipariş yok.');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Görünmeyenleri çıkar' }));
    expect(pencere.textContent).not.toContain('Listede görünmeyen');
  });

  it('geride kalan yoksa geride kapsamı pasiftir; plan yokken düğme pasif ve nedeni yazar', () => {
    const { pencere } = ciz({ planYok: true }, 2);
    expect(pencere.textContent).toContain('Henüz plan yok; önce planı kurun.');
    expect((within(pencere).getByRole('button', { name: 'Bütün planı baştan kur' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Vazgeç hiçbir komut vermez', () => {
    const { pencere, vazgec, onayla } = ciz();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    expect(vazgec).toHaveBeenCalled();
    expect(onayla).not.toHaveBeenCalled();
  });
});
