import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ornekProfil } from '../kurallar/profil.ts';
import { gunEkle, bugunTarihi } from '../tarih.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { Takvim } from './index.tsx';

// jsdom kaydırmayı ve indirmeyi uygulamaz.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  URL.createObjectURL = vi.fn(() => 'blob:deneme');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });

const dolu = (): Depo => {
  const d = ornekDepo();
  d.data[d.active] = ornekProfil();
  return d;
};

describe('Takvim (izinli)', () => {
  it('yaklaşan, geçmiş ve öz değerlendirme turları listelenir; yeni denetim formdan eklenir', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<Takvim />, 'takvim');
    const yakin = await screen.findByRole('heading', { name: 'Yaklaşan' });
    expect(screen.getByRole('heading', { name: 'Geçmiş' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Öz değerlendirme turları' })).toBeTruthy();
    expect(screen.getAllByText('2. gözetim').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni denetim' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Tarih girin')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Başlangıç tarihi/), { target: { value: gunEkle(bugunTarihi(), 200) } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Takvime kaydedildi')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(yakin).toBeTruthy();
  });

  it('biten denetimde sonraki denetim önerilir ve tek tıkla eklenir; silme onay ister', async () => {
    const depo = dolu();
    const p = depo.data[depo.active];
    if (!p) throw new Error('profil yok');
    p.audits = p.audits.filter((a) => a.status === 'done');
    sahteSunucu({ depo });
    await baglamlaAc(<Takvim />, 'takvim');
    await screen.findByRole('heading', { name: 'Geçmiş' });
    const oncekiSayi = screen.queryAllByRole('button', { name: 'Takvime ekle' }).length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Sonrakini planla' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Sonraki denetim önerisi' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bu tarihle ekle' }));
    expect(await screen.findByText('Sonraki denetim takvime eklendi')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Takvime ekle' }).length).toBe(oncekiSayi + 1);
    fireEvent.click(screen.getAllByRole('button', { name: /sil$/ })[0] as HTMLElement);
    const onay = await screen.findByRole('dialog', { name: 'Silinsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    expect(screen.queryAllByRole('button', { name: 'Takvime ekle' }).length).toBe(oncekiSayi);
  });

  it('sonuç formu bulgulardan sayıları hesaplar', async () => {
    const depo = dolu();
    const p = depo.data[depo.active];
    if (!p) throw new Error('profil yok');
    const plan = p.audits.find((a) => a.type === '2. gözetim');
    if (!plan) throw new Error('denetim yok');
    plan.date = gunEkle(bugunTarihi(), -2);
    plan.end = '';
    sahteSunucu({ depo });
    await baglamlaAc(<Takvim />, 'takvim');
    fireEvent.click(await screen.findByRole('button', { name: 'Sonucu gir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bulgu ekle' }));
    fireEvent.change(within(pencere).getByLabelText('Bulgunun kısa tanımı'), { target: { value: 'Etiketsiz ürün' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Sonuç kaydedildi')).toBeTruthy();
    expect(screen.getAllByText('1 minör').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DÖF planı teslimi/).length).toBeGreaterThan(0);
  });
});

describe('Takvim (reddedilen: yazma yetkisi yok)', () => {
  it('yazma düğmeleri gizli, takvime ekleme açık', async () => {
    sahteSunucu({ depo: dolu(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Takvim />, 'takvim');
    expect((await screen.findAllByRole('button', { name: 'Takvime ekle' })).length).toBeGreaterThan(0);
    for (const ad of ['Yeni denetim', 'Düzenle', 'Sonrakini planla', 'Sonucu düzenle', 'Sonucu gir']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /sil$/ })).toHaveLength(0);
  });
});
