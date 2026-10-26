import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, KAPI, OKUYAN, ornekDurum, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';

// R2 bölümleri (Süreler, Malzemeler, Kaynaklar): her yazma kuralı için izinli ve reddedilen. Veriler uydurmadır.
beforeEach(() => { try { window.localStorage.clear(); } catch { /* depo kapalı */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const yazmalar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem !== 'GET' && i.yol !== '/rota/karttan-taslaklar');
const bolumAc = async (ad: string) => {
  const bolge = await screen.findByRole('region', { name: ad });
  await waitFor(() => expect(bolge.querySelector('[data-parca="R2"]')).not.toBeNull());
  return bolge;
};
const yaz = (el: HTMLElement, deger: string) => { fireEvent.change(el, { target: { value: deger } }); fireEvent.blur(el); };

/* ---------------- Süreler ---------------- */

function rotaliDurum(): DurumCevabi {
  const d = ornekDurum();
  d.routes = { 11: { base: null, steps: [] } };
  d.routeRevs = [{ id: '7', itemId: '11', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }];
  return d;
}
const SURELER: SurelerCevabi = {
  revizyon: { id: 7, harf: 'A', durum: 'yururlukte', malzemeId: 11 },
  makineId: null,
  adimlar: [{
    adimId: 41, opNo: 10, sira: 1, ad: 'Tornalama', operasyonTipi: { id: 21, kod: 'TOR', ad: 'Tornalama' },
    kaynak: { tur: 'makine', id: 5, kod: 'M-1', ad: 'Torna makinesi', aktif: true, istasyon: { id: 3, kod: 'IST-1', ad: 'Torna istasyonu', aktif: true } },
    teorik: { hazirlikDk: '30', islemDk: '5', degisimDk: '1', degisimOraniYuzde: '20' },
    sonKayit: { hazirlik: null, islem: 9, degisim: null },
    olcum: {
      hazirlik: null, degisim: null,
      islem: { id: 9, sureDk: '4.5', kaynak: 'terminal', isEmriId: null, makineId: null, yazan: { id: 1, ad: null }, zaman: '2026-10-23T08:00:00.000Z' },
    },
    etkin: { hazirlikDk: '30', birimSureDk: '6', islemDk: '5', degisimDk: '1', degisimOraniYuzde: '20' },
    fason: false,
  }],
};
const sureSunucusu = (k: Kullanici) => sunucuKur(k, {
  durum: rotaliDurum(),
  yazmalar: {
    'GET /rota/revizyonlar/7/sureler': () => json(200, SURELER),
    'POST /rota/adimlar/41/gerceklesen-sure': () => json(200, {}),
    'POST /rota/adimlar/41/gerceklesen-sure/kabul': () => json(200, {}),
  },
});

describe('R2 Süreler', () => {
  it('izinli: rota.yaz olan elle ölçüm yazar ve bekleyen ölçümü kabul eder; okunan son satır gider, süreler yeniden okunur', async () => {
    const istekler = sureSunucusu(YONETICI);
    rrAc('/recete-rota/sureler');
    const bolge = await bolumAc('Süreler');
    const hazirlik = await within(bolge).findByRole('textbox', { name: 'Gerçekleşen hazırlık dakika, MM-0001 OP 10' });
    const kart = within(bolge).getByRole('article', { name: 'MM-0001 OP 10 süreleri' });
    expect(within(kart).getByText('Revizyon').nextElementSibling?.textContent).toBe('A');
    // Eski düzen: kaynak istasyon koduyla, altında istasyon adı ve makine kodu; operasyon yalnız adıyla.
    expect(within(kart).getByText('Kaynak').nextElementSibling?.textContent).toBe('IST-1Torna istasyonu · M-1');
    expect(within(kart).getByText('Operasyon').nextElementSibling?.textContent).toBe('Tornalama');
    yaz(hazirlik, '3,5');
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/rota/adimlar/41/gerceklesen-sure', govde: { tur: 'hazirlik', sureDk: 3.5, makineId: null, okunanId: null } });

    fireEvent.click(within(bolge).getByRole('button', { name: 'İşlem ölçümünü kabul et, MM-0001 OP 10' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler)[1]).toMatchObject({ yol: '/rota/adimlar/41/gerceklesen-sure/kabul', govde: { tur: 'islem', olcumId: 9, okunanId: 9, makineId: null } });
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/rota/revizyonlar/7/sureler').length).toBeGreaterThanOrEqual(3));
  });

  it('reddedilen: geçersiz sayı istek atmaz; rota.yaz olmayan girdi ve kabul düğmesi görmez, ölçüm metin olarak görünür', async () => {
    const istekler = sureSunucusu(YONETICI);
    rrAc('/recete-rota/sureler');
    const bolge = await bolumAc('Süreler');
    yaz(await within(bolge).findByRole('textbox', { name: 'Gerçekleşen değişim dakika, MM-0001 OP 10' }), '-2');
    await screen.findByText('Sıfır ya da sıfırdan büyük bir sayı girin.');
    expect(yazmalar(istekler)).toEqual([]);
    cleanup();

    const okuyan = sureSunucusu(OKUYAN);
    rrAc('/recete-rota/sureler');
    const b2 = await bolumAc('Süreler');
    await within(b2).findByText('4,5');
    expect(within(b2).queryAllByRole('textbox')).toEqual([]);
    expect(within(b2).queryByRole('button', { name: /kabul et/ })).toBeNull();
    expect(yazmalar(okuyan)).toEqual([]);
  });

  it('rota okuma yetkisi yoksa bölüm boş ve iletili; süre okunmaz', async () => {
    const d = ornekDurum();
    d.routes = null;
    const istekler = sunucuKur(OKUYAN, { durum: d });
    rrAc('/recete-rota/sureler');
    const bolge = await bolumAc('Süreler');
    expect(within(bolge).getByText(/rota okuma yetkiniz yok/)).toBeTruthy();
    expect(istekler.some((i) => i.yol.includes('/sureler'))).toBe(false);
  });
});

/* ---------------- Malzemeler ---------------- */

const MALIYETCI = { ...YONETICI, id: 9, islemler: [...YONETICI.islemler, 'finans.yonet'] } as Kullanici;
function statuluDurum(): DurumCevabi {
  const d = ornekDurum();
  d.statuses = [{ id: 'S1', code: 'KAR', name: 'Karantina', kind: 'kalite', color: '#336699', surum: 3 }];
  d.maliyet = { yazabilir: true, malzeme: {}, istasyon: {}, kisi: {} };
  return d;
}
const BELGE = [{ anahtar: 'recete-rota-motoru-v1', bicim: 'json' as const, deger: { items: [{ id: 'i9', code: 'ESK-9', name: 'Eski kalem', type: 'ham' }] }, surum: 1 }];

describe('R2 Malzemeler', () => {
  it('kartlar türüne göre gruplanır; eski kalemler belgeden yalnız okunur, belgeye yazılmaz', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: statuluDurum(), kayitlar: BELGE });
    rrAc('/recete-rota/items');
    const bolge = await bolumAc('Malzemeler');
    expect(within(within(bolge).getByRole('region', { name: 'Mamul' })).getByText('MM-0001')).toBeTruthy();
    const eski = await within(bolge).findByRole('region', { name: 'Kartı olmayan eski kayıtlar' });
    expect(within(eski).getByText('ESK-9')).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: /Hammadde/ }));
    expect(within(bolge).queryByRole('region', { name: 'Mamul' })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('izinli: recete-rota.yaz statü tanımını sürümüyle yazar; finans.yonet birim maliyeti yazar', async () => {
    const istekler = sunucuKur(MALIYETCI, {
      durum: statuluDurum(),
      yazmalar: {
        'POST /recete-rota/statu-tanimlari/S1/kaydet': () => json(200, { statuses: [] }),
        'POST /finans/maliyetler/malzeme/yaz': () => json(200, {}),
      },
    });
    rrAc('/recete-rota/items');
    const bolge = await bolumAc('Malzemeler');
    yaz(await within(bolge).findByRole('textbox', { name: 'Statü adı' }), 'Karantinada');
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({
      yol: '/recete-rota/statu-tanimlari/S1/kaydet', govde: { code: 'KAR', name: 'Karantinada', kind: 'kalite', color: '#336699', beklenenSurum: 3 },
    });
    yaz(within(bolge).getByRole('textbox', { name: 'MM-0001 birim maliyet' }), '12,5');
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler)[1]).toMatchObject({ yol: '/finans/maliyetler/malzeme/yaz', govde: { anahtar: 11, birimMaliyet: 12.5, paraBirimi: 'TRY', surum: null } });
  });

  it('reddedilen: yazma işlemi olmayan statü ve maliyet girdisi görmez; kart okuma yetkisi yoksa bölüm boştur', async () => {
    sunucuKur(OKUYAN, { durum: statuluDurum() });
    rrAc('/recete-rota/items');
    const bolge = await bolumAc('Malzemeler');
    expect(within(bolge).getByText('Karantina')).toBeTruthy();
    expect(within(bolge).queryAllByRole('textbox')).toEqual([]);
    expect(within(bolge).queryByRole('button', { name: /Statü$/ })).toBeNull();
    cleanup();

    const d = ornekDurum();
    d.items = null;
    sunucuKur(YONETICI, { durum: d });
    rrAc('/recete-rota/items');
    const b2 = await bolumAc('Malzemeler');
    expect(within(b2).getByText(/okuma yetkiniz yok/)).toBeTruthy();
  });
});

/* ---------------- Kaynaklar ---------------- */

function kaynakDurumu(): DurumCevabi {
  const d = ornekDurum();
  d.cal = { shifts: [{ id: '1', name: '1. vardiya', start: '08:00', end: '16:30', breaks: [{ start: '12:00', end: '12:30' }], netDakika: 480 }], holidays: ['2026-10-29'] };
  return d;
}
// Sahiplerin okumaları: sürüm buradan gelir (durum sürüm taşımaz).
const SAHIP_OKUMALARI = {
  'GET /is-merkezleri': () => json(200, { isMerkezleri: [{ id: 41, surum: 2, kod: 'IM1', ad: 'Talaşlı imalat', aciklama: null, aktif: true }] }),
  'GET /istasyonlar': () => json(200, { istasyonlar: [{ id: 31, surum: 4, kod: 'TZ1', ad: 'Torna 1', isMerkeziId: 41, tip: 'talasli', kapasiteKaynagi: null, aktif: true }] }),
  'GET /vardiya-takvimi': () => json(200, { vardiyalar: [{ id: 1, surum: 1 }], matris: [{ isMerkeziId: 41, gun: 1, vardiyaId: 1 }], kisiVardiyalari: [] }),
};
const altSekme = (bolge: HTMLElement, ad: RegExp) => { fireEvent.click(within(within(bolge).getByRole('tablist', { name: 'Kaynak türü' })).getByRole('tab', { name: ad })); };

describe('R2 Kaynaklar', () => {
  it('izinli: istasyonlar.yaz istasyon adını okunmuş kaydın sürümüyle yazar, iş merkezi ekler ve onayla siler', async () => {
    const istekler = sunucuKur(YONETICI, {
      durum: kaynakDurumu(),
      yazmalar: {
        ...SAHIP_OKUMALARI,
        'POST /istasyonlar/31/guncelle': () => json(200, {}),
        'POST /is-merkezleri': () => json(200, {}),
        'POST /is-merkezleri/41/sil': () => json(200, {}),
      },
    });
    rrAc('/recete-rota/res');
    const bolge = await bolumAc('Kaynaklar');
    // Genel bakış: plan teorik süreyi kullanır (Soru 490/1 a; eski cümle 468/4 a ile geçersizdi).
    expect(within(bolge).getByText(/kabul edilen ölçüm teorik süreye yazılır, plan teorik süreyi kullanır/)).toBeTruthy();
    altSekme(bolge, /İş merkezleri/);
    yaz(await within(bolge).findByRole('textbox', { name: 'TZ1 istasyon adı' }), 'Torna A');
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/istasyonlar/31/guncelle', govde: { kod: 'TZ1', ad: 'Torna A', isMerkeziId: 41, surum: 4 } });
    // Verim ve operatör ihtiyacı sahibinde düzenlenir: girdi yoktur.
    expect(within(bolge).queryByRole('textbox', { name: /verim/i })).toBeNull();

    fireEvent.click(within(bolge).getByRole('button', { name: 'İş merkezi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni iş merkezi' });
    fireEvent.change(within(pencere).getByLabelText(/İş merkezi adı/), { target: { value: 'Montaj' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler)[1]).toMatchObject({ yol: '/is-merkezleri', govde: { kod: 'IM-10', ad: 'Montaj' } });

    fireEvent.click(within(bolge).getByRole('button', { name: 'IM1 iş merkezini sil' }));
    expect(yazmalar(istekler)).toHaveLength(2);
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Kayıt silinsin mi?' })).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(3));
    expect(yazmalar(istekler)[2]).toMatchObject({ yol: '/is-merkezleri/41/sil', govde: {} });
  });

  it('reddedilen: istasyonlar.yaz olmayan ekleme, silme ve girdi görmez; istek gitmez', async () => {
    const istekler = sunucuKur({ ...OKUYAN, islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku'] } as Kullanici, { durum: kaynakDurumu(), yazmalar: SAHIP_OKUMALARI });
    rrAc('/recete-rota/res');
    const bolge = await bolumAc('Kaynaklar');
    altSekme(bolge, /İş merkezleri/);
    await within(bolge).findByText('TZ1');
    expect(within(bolge).queryAllByRole('textbox')).toEqual([]);
    expect(within(bolge).queryByRole('button', { name: 'İş merkezi' })).toBeNull();
    expect(within(bolge).queryByRole('button', { name: /sil$/ })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('vardiya matrisi takvimden yalnız okunur; takvim yoksa uyarı; düğme Vardiya sayfasını açar; alt sekme cihazda kalır', async () => {
    sunucuKur(YONETICI, { durum: kaynakDurumu(), yazmalar: SAHIP_OKUMALARI });
    rrAc('/recete-rota/res');
    const bolge = await bolumAc('Kaynaklar');
    altSekme(bolge, /Vardiyalar/);
    const matris = await within(bolge).findByRole('table', { name: 'Haftalık vardiya matrisi' });
    expect(within(matris).getByLabelText('IM1 Pazartesi 1. vardiya: açık').textContent).toBe('8');
    expect(within(matris).getByLabelText('IM1 Salı 1. vardiya: kapalı').textContent).toBe('');
    expect(within(bolge).getByText('29.10.2026')).toBeTruthy();
    expect(window.localStorage.getItem('tmi.recete-rota.yeni.kaynak-sekmesi')).toBe('shifts');
    fireEvent.click(within(bolge).getAllByRole('button', { name: "Vardiya'da düzenle" })[0]!);
    await screen.findByText('Başka sayfa');
    cleanup();

    sunucuKur(YONETICI, { durum: kaynakDurumu() });
    rrAc('/recete-rota/res');
    const b2 = await bolumAc('Kaynaklar');
    expect(within(b2).getByRole('tab', { name: 'Vardiyalar', selected: true })).toBeTruthy();
    await within(b2).findByText(/Vardiya takvimi okunamadı/);
  });

  it('istasyon verisi okunamazsa erişim iletisi; liste uydurulmaz', async () => {
    const d = kaynakDurumu();
    d.stations = null;
    sunucuKur(YONETICI, { durum: d });
    rrAc('/recete-rota/res');
    const bolge = await bolumAc('Kaynaklar');
    expect(within(bolge).getByText(/İstasyonlar verisine erişimin yok/)).toBeTruthy();
  });
});
