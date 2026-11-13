import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { AparatKapasitesi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { json, KAPI, ornekDurum, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';

// 3199 (A + D): Kaynaklar > İkincil kaynaklar. Kayıt İstasyonlar'ın aparat kapasitesi uçlarıyla okunur ve yazılır. Veriler uydurmadır (ORN-).
beforeEach(() => { try { window.localStorage.clear(); } catch { /* depo kapalı */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KAYNAK: AparatKapasitesi = {
  id: 7, aparatKartiId: 11, istasyonId: null, adet: 2, tur: 'aparat', kisit: 'sert', omur: null, omurBirimi: null, degisimDk: null,
  kesintiler: [{ id: 1, neden: 'bakim', baslangic: '2099-01-05T08:00:00.000Z', bitis: '2099-01-05T11:00:00.000Z', adet: 1, aciklama: null }],
  degistiren: { id: 1, ad: null }, degisme: '2026-11-13T08:00:00.000Z', surum: 3,
};
const TAKIM: AparatKapasitesi = { ...KAYNAK, id: 8, aparatKartiId: 12, tur: 'ozel_takim', istasyonId: 31, adet: 1, omur: 600, omurBirimi: 'dk', degisimDk: 20, kesintiler: [], surum: 1 };
const YAZAN = { ...YONETICI, islemler: [...YONETICI.islemler, 'istasyonlar.aparat-yaz'] } as Kullanici;

function kur(k: Kullanici) {
  const okumalar = {
    'GET /istasyonlar/aparat-kapasiteleri': () => json(200, { kapasiteler: [KAYNAK, TAKIM] }),
    'GET /rota/aparat-kullanimi': () => json(200, { kullanim: [{ malzemeId: 11, adim: 3 }] }),
    'GET /plan/takim-omurleri': () => json(200, { takimlar: [{ kapasiteId: 8, kalan: 120 }] }),
    'POST /istasyonlar/aparat-kapasiteleri/7/guncelle': () => json(200, KAYNAK),
  };
  return sunucuKur(k, { durum: ornekDurum(), yazmalar: okumalar });
}
const ac = async () => {
  rrAc('/recete-rota/res');
  const bolge = await screen.findByRole('region', { name: 'Kaynaklar' });
  await waitFor(() => expect(bolge.querySelector('[data-parca="R2"]')).not.toBeNull());
  fireEvent.click(within(within(bolge).getByRole('tablist', { name: 'Kaynak türü' })).getByRole('tab', { name: 'İkincil kaynaklar' }));
  return bolge;
};
const yazmalar = (l: readonly Istek[]) => l.filter((i) => i.yontem !== 'GET');

describe('İkincil kaynaklar (3199)', () => {
  it('liste: kart, tür, adet, nerede, takvim, kısıt, ömür ve kullanan adım; kesinti takvimi ayrı tabloda', async () => {
    kur(YAZAN);
    const bolge = await ac();
    const tablo = await within(bolge).findByRole('table', { name: 'İkincil kaynaklar' });
    const satirlar = within(tablo).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(satirlar[0]).toMatch(/MM-0001.*Aparat.*Ortak.*Bakım · .*Sert.*3/);
    expect((within(tablo).getByRole('textbox', { name: 'MM-0001 adet' }) as HTMLInputElement).value).toBe('2');
    await waitFor(() => expect(within(tablo).getAllByRole('row')[2]!.textContent).toMatch(/Kart 12.*Özel takım.*TZ1.*Açık.*600 dk · kalan 120/));
    expect(within(bolge).getByRole('table', { name: 'Kesinti takvimi' }).textContent).toMatch(/Bakım/);
    expect(within(bolge).getByText(/“İzle”: plan sınırlamaz, aşımı uyarır/)).toBeTruthy();
    expect(within(bolge).getByRole('button', { name: 'Kaynak ekle' })).toBeTruthy();
  });

  it('adet satırda yazılır; öteki alanlar okunan kayıttaki gibi gider', async () => {
    const istekler = kur(YAZAN);
    const bolge = await ac();
    const kutu = await within(bolge).findByRole('textbox', { name: 'MM-0001 adet' });
    fireEvent.click(kutu);
    expect(screen.queryByRole('dialog', { name: 'İkincil kaynak' })).toBeNull();
    fireEvent.change(kutu, { target: { value: '3' } });
    fireEvent.blur(kutu);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]!.govde).toMatchObject({ surum: 3, adet: 3, kisit: 'sert', istasyonId: null, kesintiler: [{ neden: 'bakim', adet: 1 }] });
  });

  it('düzenleme satıra basınca panelde: kısıt İzle yapılır; gövde sürümle ve kesinti listesiyle gider', async () => {
    const istekler = kur(YAZAN);
    const bolge = await ac();
    const tablo = await within(bolge).findByRole('table', { name: 'İkincil kaynaklar' });
    fireEvent.click(within(tablo).getAllByRole('row')[1]!);
    const pencere = await screen.findByRole('dialog', { name: 'İkincil kaynak' });
    fireEvent.change(within(pencere).getByRole('combobox', { name: 'Kısıt' }), { target: { value: 'izle' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const g = yazmalar(istekler)[0]!;
    expect(g.yol).toBe('/istasyonlar/aparat-kapasiteleri/7/guncelle');
    expect(g.govde).toMatchObject({ surum: 3, kisit: 'izle', adet: 2, istasyonId: null, tur: 'aparat', omur: null, kesintiler: [{ neden: 'bakim', adet: 1 }] });
  });

  it('reddedilen: aparat yazma işlemi olmayan ekleme düğmesi ve form görmez; istasyon okuması yoksa liste istenmez', async () => {
    let istekler = kur(YONETICI);
    let bolge = await ac();
    await within(bolge).findByRole('table', { name: 'İkincil kaynaklar' });
    expect(within(bolge).queryByRole('button', { name: 'Kaynak ekle' })).toBeNull();
    fireEvent.click(within(within(bolge).getByRole('table', { name: 'İkincil kaynaklar' })).getAllByRole('row')[1]!);
    expect(screen.queryByRole('dialog', { name: 'İkincil kaynak' })).toBeNull();
    expect(within(bolge).queryAllByRole('textbox')).toEqual([]);
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();
    istekler = kur({ ...YONETICI, islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku'] } as Kullanici);
    bolge = await ac();
    expect(await within(bolge).findByText(/İstasyonlar okuma yetkisi gerekir/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/istasyonlar/aparat-kapasiteleri')).toBe(false);
  });
});
