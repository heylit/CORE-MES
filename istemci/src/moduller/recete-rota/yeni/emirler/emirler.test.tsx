import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, KAPI, OKUYAN, ornekDurum, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Testler yer tutucu metnine değil, bölgeye, rol adına ve giden isteğe bakar. Veri uydurmadır (test-ortak ornekDurum).
const bolum = (ad: string) => screen.findByRole('region', { name: ad });
const emirAc = async () => {
  const b = await bolum('Üretim emirleri');
  fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
  return b;
};
const yazmalar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem !== 'GET');
const kisi = (islemler: string[]): Kullanici => ({ id: 9, ad: 'Deneme 9', islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', ...islemler] as Kullanici['islemler'] });

describe('R3 Üretim emirleri: okuma', () => {
  it('okuyan liste ve ayrıntıyı görür; yazma düğmesi yok, yazma isteği gitmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc();
    const b = await emirAc();
    expect(within(b).getByLabelText('UE-0001 ayrıntısı')).toBeTruthy();
    for (const ad of ['Yeni üretim emri', 'Plana al', 'İptal et']) expect(within(b).queryByRole('button', { name: ad })).toBeNull();
    expect(within(b).getByRole('button', { name: 'Akışta aç' })).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('süzgeç sayıları ve durum süzgeci: tamamlananda taslak emir yok', async () => {
    sunucuKur(OKUYAN);
    rrAc();
    const b = await bolum('Üretim emirleri');
    const durum = await within(b).findByRole('group', { name: 'Durum' });
    expect(within(durum).getByRole('button', { name: /Taslak/ }).textContent).toContain('1');
    fireEvent.click(within(durum).getByRole('button', { name: /Tamamlanan/ }));
    await within(b).findByText('Bu süzgeçte emir yok.');
  });

  it('emir okuma yetkisi yoksa liste yerine açıklama', async () => {
    sunucuKur(OKUYAN, { durum: { ...ornekDurum(), emirler: null } });
    rrAc();
    const b = await bolum('Üretim emirleri');
    await within(b).findByText(/Üretim emirlerine erişiminiz yok/);
    expect(b.querySelector('[data-parca="R3"]')).not.toBeNull();
  });

  it('taslak emir plana girmez: plan bölümü yerine açıklama', async () => {
    sunucuKur(OKUYAN);
    rrAc();
    const b = await emirAc();
    const satir = within(b).getByRole('button', { name: /UE-0001/ }).closest('li')!;
    expect(within(satir).getByText(/Taslak emirler plana girmez/)).toBeTruthy();
  });
});

describe('R3 Üretim emirleri: plan bitiş', () => {
  const planli = (due: string | null) => {
    const d = ornekDurum();
    d.routes = { '11': { base: null, steps: [{
      id: 's1', seq: 1, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    }] } } as unknown as typeof d.routes;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((o) => ({ ...o, status: 'serbest' as const, due })) };
    return d;
  };
  const motor = {
    ekranYerlesimi: { 'UE-0001|10': [{ makineId: 51, baslangic: '2026-11-02T06:00:00.000Z' }] },
    yerlesimler: [{ isEmriId: 1, uretimEmriId: 61, emirNo: 'UE-0001', opNo: 10, kaynak: { tur: 'makine', id: 51 }, kaynakAdi: null,
      baslangic: '2026-11-02T06:00:00.000Z', bitis: '2026-11-03T09:00:00.000Z', sabit: false }],
  };

  it('sütun "Plan bitiş": motorun adım bitişini gösterir, teslimden sonra biten emir gecikir', async () => {
    sunucuKur(OKUYAN, { durum: planli('2026-11-02'), motorYerlesimi: motor });
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = (await within(b).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    expect(within(b).getByText('Plan bitiş')).toBeTruthy();
    await waitFor(() => { expect(within(satir).getByText('03.11.2026')).toBeTruthy(); });
    expect(within(satir).getByText(/^Gecikiyor, -/)).toBeTruthy();
    expect(satir.hasAttribute('data-gec')).toBe(true);
  });

  it('teslimden önce biten emir gecikmez, tampon rozeti görünür; teslimsiz emirde gecikme ve tampon rozeti yok', async () => {
    sunucuKur(OKUYAN, { durum: planli('2026-11-05'), motorYerlesimi: motor });
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = (await within(b).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    await waitFor(() => { expect(within(satir).getByText('03.11.2026')).toBeTruthy(); });
    expect(within(satir).queryByText(/Gecikiyor/)).toBeNull();
    expect(within(satir).getByText(/^Tampon (yeterli|azaldı|kritik), \+/)).toBeTruthy();
    cleanup();
    sunucuKur(OKUYAN, { durum: planli(null), motorYerlesimi: motor });
    rrAc();
    const b2 = await bolum('Üretim emirleri');
    const satir2 = (await within(b2).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    await waitFor(() => { expect(within(satir2).getByText('03.11.2026')).toBeTruthy(); });
    expect(within(satir2).queryByText(/Gecikiyor|Tampon/)).toBeNull();
  });
});

describe('R3 Üretim emirleri: planlanamayan emir', () => {
  it('motor açık bir adımı yerleştiremediyse "Planlanamıyor", nedeni ve gecikme şeridi; tarih ve tampon rozeti yok', async () => {
    const d = ornekDurum();
    d.routes = { '11': { base: null, steps: [{
      id: 's1', seq: 1, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    }] } } as unknown as typeof d.routes;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((o) => ({ ...o, status: 'serbest' as const })) };
    sunucuKur(OKUYAN, { durum: d, motorYerlesimi: { ekranYerlesimi: {}, yerlesimler: [], yerlesmeyen: [{ isEmriId: 1, emirNo: 'UE-0001', opNo: 10, neden: 'Uygun makine yok.' }] } });
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = (await within(b).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    await waitFor(() => { expect(within(satir).getByText('Planlanamıyor')).toBeTruthy(); });
    expect(within(satir).getByText('Uygun makine yok.')).toBeTruthy();
    expect(within(satir).queryByText(/Tampon|Gecikiyor/)).toBeNull();
    expect(satir.hasAttribute('data-gec')).toBe(true);
  });
});

describe('R3 Üretim emirleri: komutlar', () => {
  it('yönetici taslağı plana alır: emrin ekrandaki sürümüyle gider (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /adimli-emirler/61/plana-al': () => json(200, {}) } });
    rrAc();
    const b = await emirAc();
    fireEvent.click(within(b).getByRole('button', { name: 'Plana al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/61/plana-al')).toBe(true));
    expect(istekler.find((i) => i.yol === '/adimli-emirler/61/plana-al')?.govde).toEqual({ surum: 1 });
  });

  it('başkası değiştirdiyse (eski sürüm) uyarı satırı çıkar ve veri yeniden okunur', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'POST /adimli-emirler/61/plana-al': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka yerde değişti.', ayrinti: { neden: 'eski-surum' } }) },
    });
    rrAc();
    const b = await emirAc();
    const okuma = istekler.filter((i) => i.yol === '/recete-rota/durum').length;
    fireEvent.click(within(b).getByRole('button', { name: 'Plana al' }));
    const uyari = await within(b).findByRole('alert');
    expect(uyari.textContent).toContain('Emir başka yerde değişti.');
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/recete-rota/durum').length).toBeGreaterThan(okuma));
  });

  it('iptal onay penceresinden sonra gider', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /adimli-emirler/61/iptal': () => json(200, {}) } });
    rrAc();
    const b = await emirAc();
    fireEvent.click(within(b).getByRole('button', { name: 'İptal et' }));
    const pencere = await screen.findByRole('dialog', { name: 'UE-0001 iptal edilsin mi?' });
    expect(yazmalar(istekler).some((i) => i.yol.endsWith('/iptal'))).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/adimli-emirler/61/iptal')?.govde).toEqual({ surum: 1 }));
  });

  it('rotası olmayan ürüne rotasız emir açılır (uretim-emirleri.yaz)', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: {
        'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }),
        'POST /adimli-emirler/rotasiz': () => json(200, { uretimEmriId: 62 }),
      },
    });
    rrAc();
    const b = await bolum('Üretim emirleri');
    fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
    const form = within(b).getByRole('region', { name: 'Yeni üretim emri' });
    expect(within(form).getByRole('combobox', { name: 'Ürün' }).textContent).toContain('(rotasız)');
    fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '25' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/rotasiz')).toBe(true));
    expect(istekler.find((i) => i.yol === '/adimli-emirler/rotasiz')?.govde).toMatchObject({ malzemeNo: 11, adet: 25, emirTuru: 'seri' });
  });

  it('rota.emre-kopyala olmayan rotalı ürüne emir açamaz (reddedilen)', async () => {
    const d = ornekDurum();
    d.routes = { 11: { base: null, steps: [] } };
    d.routes['11']!.steps = [{
      id: 'o10', seq: 10, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 30, proc: null,
      chg: null, cycle: 5, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
    }];
    sunucuKur(kisi(['uretim-emirleri.yaz']), { durum: d });
    rrAc();
    const b = await bolum('Üretim emirleri');
    fireEvent.click(await within(b).findByRole('button', { name: 'Yeni üretim emri' }));
    await within(b).findByText(/Emir açmak için mamul ya da yarı mamul gerekli/);
    expect(within(b).queryByRole('button', { name: 'Emri oluştur' })).toBeNull();
  });
});

describe('R3 Üretim emirleri: eksik malzeme ve ara adım stoğu (461 b)', () => {
  // Mamulün iki adımlı rotası; adım 10 hammaddeden 1 adet ister. Hammaddenin serbest stoğu yok, OP 10 çıktısı olarak 10 adet bekliyor.
  const planda = () => {
    const d = ornekDurum();
    d.items = [...(d.items ?? []), { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk', type: 'ham', unit: 'adet', cost: null, stock: 0, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
    const adim = (opNo: number, ins: { itemId: string; qty: number; scrap: number }[]) => ({
      id: `o${String(opNo)}`, seq: opNo, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 30,
      proc: null, chg: null, cycle: 5, dep: 'bagimli' as const, depQty: null, rejectPct: 0, split: 'tek' as const, minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins, outs: [],
    });
    d.routes = { 11: { base: null, steps: [adim(10, [{ itemId: '12', qty: 1, scrap: 0 }]), adim(20, [])] } };
    d.emirler!.orders[0] = { ...d.emirler!.orders[0]!, status: 'serbest' };
    return d;
  };
  const statuler = () => json(200, { statuler: [{ id: 7, malzemeNo: 'HM-0001', kaynakAdim: '11-o10', ad: 'OP 10 Tornalama' }] });
  const stok = (id: number) => () => json(200, {
    statuKirilimi: id === 12 ? [{ statuId: null, miktar: '0' }, { statuId: 7, miktar: '10' }] : [{ statuId: null, miktar: '4' }], bakiyeler: [],
  });

  it('stok okuyan: OP 10 çıktısı adım 10 ihtiyacını karşılar, eksik kalmaz (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, {
      durum: planda(), yazmalar: { 'GET /recete-rota/statuler': statuler, 'GET /stok/malzemeler/11': stok(11), 'GET /stok/malzemeler/12': stok(12) },
    });
    rrAc();
    const b = await emirAc();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/malzemeler/12')).toBe(true));
    await waitFor(() => expect(within(b).queryByText(/kalem eksik/)).toBeNull());
    // Hesap stoğa yazmaz (açılışta rota taslağı eşitlemesi ayrı iştir).
    expect(yazmalar(istekler).filter((i) => i.yol.startsWith('/stok/'))).toEqual([]);
  });

  it('stok okumayan: stoğa istek gitmez, yalnız serbest stokla hesaplanır ve eksik görünür (reddedilen)', async () => {
    const istekler = sunucuKur(OKUYAN, { durum: planda() });
    rrAc();
    const b = await emirAc();
    await within(b).findByText(/1 kalem eksik: HM-0001/);
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
  });
});

describe('R3 Stok', () => {
  const statuler = () => json(200, { statuler: [{ id: 7, malzemeNo: 'MM-0001', kaynakAdim: '10', ad: 'Torna çıktısı' }] });
  const malzeme = () => json(200, {
    statuKirilimi: [{ statuId: null, miktar: '4' }, { statuId: 7, miktar: '2' }],
    bakiyeler: [{ konumId: 3, konumKod: 'A1', partiId: null, partiEtiketi: null, statuId: null, miktar: '4' }],
  });

  it('stok okuma yetkisi olmayan statülü stoğu görmez; stoğa istek gitmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    await within(b).findByText(/Stok verisine erişiminiz yok/);
    expect(within(b).getByRole('table', { name: 'Stok' }).textContent).toContain('MM-0001');
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
    expect(within(b).queryByRole('button', { name: 'Statü atlat' })).toBeNull();
  });

  it('statü atlatma stoğa yazılır: seçilen bakiye satırı ve hedef statü (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'GET /recete-rota/statuler': statuler, 'GET /stok/malzemeler/11': malzeme, 'POST /stok/statu-degistir': () => json(200, {}) },
    });
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    await within(b).findByRole('table', { name: 'Statülü stok' });
    expect(within(b).getByRole('table', { name: 'Statülü stok' }).textContent).toContain('Torna çıktısı');
    fireEvent.change(within(b).getByLabelText('Miktar'), { target: { value: '2' } });
    fireEvent.click(within(b).getByRole('button', { name: 'Statü atlat' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/statu-degistir')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/statu-degistir')?.govde).toEqual({
      malzemeId: 11, konumId: 3, partiId: null, kaynakStatuId: null, hedefStatuId: 7, miktar: '2', aciklama: null,
    });
  });

  it('sayım yalnız stok.sayim ile; statü atlatma işlemi olmayan atlatma düğmesini görmez', async () => {
    const istekler = sunucuKur(kisi(['stok.sayim']), {
      yazmalar: { 'GET /recete-rota/statuler': statuler, 'GET /stok/malzemeler/11': malzeme, 'POST /stok/sayim': () => json(200, {}) },
    });
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    fireEvent.change(await within(b).findByLabelText('Sayılan miktar'), { target: { value: '3' } });
    expect(within(b).queryByRole('button', { name: 'Statü atlat' })).toBeNull();
    fireEvent.click(within(b).getByRole('button', { name: 'Sayımı yaz' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim')?.govde).toEqual({
      konumId: 3, satirlar: [{ malzemeId: 11, partiId: null, beklenenMiktar: '4', sayilanMiktar: '3' }],
    }));
  });
});
