import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { zaman } from '../bicim.ts';
import { emirSayfasiAc, json, KAPI, OKUYAN, ornekDurum, rrAc, sunucuKur, yeniEmirAc, YONETICI, type Istek } from '../test-ortak.tsx';
import { durumAdi } from './kurallar.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Testler yer tutucu metnine değil, bölgeye, rol adına ve giden isteğe bakar. Veri uydurmadır (test-ortak ornekDurum).
const bolum = (ad: string) => screen.findByRole('region', { name: ad });
const emirAc = async () => {
  const b = await bolum('Üretim emirleri');
  fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
  return b;
};
// 3039: emir Üretim Emirleri'nde açılır ve yönetilir; açma penceresi ve emir sayfasının parçaları bu modülündür.
const sayfa = async (kayitNo = 61) => {
  emirSayfasiAc(kayitNo);
  const b = await screen.findByRole('region', { name: 'Emir sayfası' });
  await within(b).findByRole('button', { name: /işlemleri$/ });
  return b;
};
const pencere = async () => {
  yeniEmirAc();
  const p = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
  await within(p).findByRole('button', { name: 'Emri oluştur' });
  return p;
};
const yazmalar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem !== 'GET');
const kisi = (islemler: string[]): Kullanici => ({ id: 9, ad: 'Deneme 9', islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', ...islemler] as Kullanici['islemler'] });

describe('R3 emir durumu adı (1082 a)', () => {
  it('bitmiş emir onaylı kapanışa kadar "Üretimi bitti", sonra sahibinin kapanış sonucu; öbür durumlar değişmez', () => {
    expect(durumAdi({ status: 'tamam' })).toBe('Üretimi bitti');
    expect(durumAdi({ status: 'tamam', kapanisSonucu: null })).toBe('Üretimi bitti');
    expect(durumAdi({ status: 'tamam', kapanisSonucu: 'tamamlandi' })).toBe('Tamamlandı');
    expect(durumAdi({ status: 'tamam', kapanisSonucu: 'saglamsiz' })).toBe('Kapandı (sağlamsız)');
    expect(durumAdi({ status: 'uretimde', kapanisSonucu: 'tamamlandi' })).toBe('Başladı');
  });

  it('1389 a: adlar üretim emrinin tek sözlüğündendir; prototipin "Serbest" ve "Üretimde" adları kalmaz', () => {
    expect(['taslak', 'serbest', 'uretimde', 'iptal'].map((status) => durumAdi({ status: status as 'taslak' }))).toEqual(['Taslak', 'Planlı', 'Başladı', 'İptal']);
  });
});

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

  it("ayrıntı alan kutusu göstermez; yöneticide de yazılamaz, Üretim Emirleri'ne bağlantı verilir (812 a, 1100 B)", async () => {
    sunucuKur(YONETICI);
    rrAc();
    const b = await emirAc();
    const ayrinti = within(b).getByLabelText('UE-0001 ayrıntısı');
    expect(within(ayrinti).queryAllByRole('textbox')).toEqual([]);
    expect(within(ayrinti).getByRole('button', { name: "Üretim Emirleri'nde aç" })).toBeTruthy();
  });

  it('seçilen satır basılı görünür; kapatınca boş panel döner', async () => {
    sunucuKur(OKUYAN);
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = await within(b).findByRole('button', { name: /UE-0001/, pressed: false });
    expect(within(b).getByText('Ayrıntı için listeden bir emir seçin.')).toBeTruthy();
    fireEvent.click(satir);
    expect(satir.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(b).getByRole('button', { name: 'Ayrıntıyı kapat' }));
    expect(within(b).queryByLabelText('UE-0001 ayrıntısı')).toBeNull();
    expect(satir.getAttribute('aria-pressed')).toBe('false');
  });

  it('arama emir no, ürün ve notta arar; tür açılır listesinde yalnız emri olan türler (1101 a)', async () => {
    sunucuKur(OKUYAN);
    rrAc();
    const b = await bolum('Üretim emirleri');
    await within(b).findByRole('button', { name: /UE-0001/ });
    const tur = within(b).getByRole('combobox', { name: 'Tür' });
    expect([...tur.querySelectorAll('option')].map((x) => x.textContent)).toHaveLength(2);
    const ara = within(b).getByRole('searchbox', { name: 'Ara' });
    fireEvent.change(ara, { target: { value: 'yok-boyle-bir-sey' } });
    expect(within(b).queryByRole('button', { name: /UE-0001/ })).toBeNull();
    fireEvent.change(ara, { target: { value: 'ue-0001' } });
    expect(within(b).getByRole('button', { name: /UE-0001/ })).toBeTruthy();
  });

  it('süzgeç sayıları ve durum süzgeci: üretimi bitenlerde taslak emir yok', async () => {
    sunucuKur(OKUYAN);
    rrAc();
    const b = await bolum('Üretim emirleri');
    const durum = await within(b).findByRole('group', { name: 'Durum' });
    expect(within(durum).getByRole('button', { name: /Taslak/ }).textContent).toContain('1');
    fireEvent.click(within(durum).getByRole('button', { name: /Üretimi biten/ }));
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
    expect(within(within(b).getByLabelText('UE-0001 ayrıntısı')).getByText(/Taslak emirler plana girmez/)).toBeTruthy();
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

  const canliOzet = (isler: { anahtar: string; dondurulmus: boolean; sabit: boolean; baslangic?: string; bitis?: string }[]) => ({
    planSurumu: 3, sonCanliyaAlma: null, planlanacak: ['UE-0001|10'], kuyruklar: [{ makineId: 51, isler }],
  });
  it('adım canlı planda yoksa saati motorun önerisi olarak yazılır (B-2499-7)', async () => {
    sunucuKur(OKUYAN, { durum: { ...planli('2026-11-05'), planCanli: canliOzet([]) }, motorYerlesimi: motor });
    rrAc();
    const b = await emirAc();
    const ayrinti = within(b).getByLabelText('UE-0001 ayrıntısı');
    expect(await within(ayrinti).findByText(/öneri \(canlı planda yok\)/)).toBeTruthy();
    // Özetteki plan bitişi de motorun önerisidir (03.11) ve öyle etiketlenir.
    expect(within(ayrinti).getByText('03.11.2026')).toBeTruthy();
    expect(within(ayrinti).getByText('öneri, canlıda yok')).toBeTruthy();
  });

  it('adım canlı plandaysa saati canlı plandan okunur, öneri yazmaz (B-2499-7)', async () => {
    const canli = canliOzet([{ anahtar: 'UE-0001|10', dondurulmus: false, sabit: false, baslangic: '2026-11-04T07:00:00.000Z', bitis: '2026-11-04T09:00:00.000Z' }]);
    sunucuKur(OKUYAN, { durum: { ...planli('2026-11-05'), planCanli: canli }, motorYerlesimi: motor });
    rrAc();
    const b = await emirAc();
    const ayrinti = within(b).getByLabelText('UE-0001 ayrıntısı');
    const satir = await within(ayrinti).findByText(/· plan /);
    expect(satir.textContent).toContain(zaman('2026-11-04T07:00:00.000Z'));
    expect(within(ayrinti).queryByText(/öneri/)).toBeNull();
    // Bütün açık adımlar canlıda: özetteki plan bitişi canlı plandan (04.11), motorunki (03.11) değil.
    expect(within(ayrinti).getByText('04.11.2026')).toBeTruthy();
    expect(within(ayrinti).queryByText('03.11.2026')).toBeNull();
  });

  it('sütun "Plan bitiş": motorun adım bitişini gösterir, teslimden sonra biten emir gecikir', async () => {
    sunucuKur(OKUYAN, { durum: planli('2026-11-02'), motorYerlesimi: motor });
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = (await within(b).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    expect(satir.querySelector('[data-baslik="Plan bitiş"]')).not.toBeNull();
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
    expect(within(satir).getByText('OP 10: Uygun makine yok.')).toBeTruthy();
    expect(within(satir).queryByText(/Tampon|Gecikiyor/)).toBeNull();
    expect(satir.hasAttribute('data-gec')).toBe(true);
  });
});

describe('R3 Üretim emirleri: plana girmeyen çalışan adım (487/2 b)', () => {
  it('tarih kalır, altında uyarı tonunda "OP 10 çalışıyor, planda yok"; emir gecikmiş sayılmaz', async () => {
    const d = ornekDurum();
    const adim = (id: string, seq: number, opNo: number) => ({
      id, seq, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    });
    d.routes = { '11': { base: null, steps: [adim('s1', 1, 10), adim('s2', 2, 20)] } } as unknown as typeof d.routes;
    const o = d.emirler!.orders[0]!;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((x) => ({ ...x, status: 'uretimde' as const, due: '2026-11-05' })), opStatus: { [`${o.id}|root|1`]: 'calisiyor' } };
    sunucuKur(OKUYAN, { durum: d, motorYerlesimi: {
      ekranYerlesimi: { 'UE-0001|20': [{ makineId: 51, baslangic: '2026-11-02T06:00:00.000Z' }] },
      yerlesimler: [{ isEmriId: 2, uretimEmriId: 61, emirNo: 'UE-0001', opNo: 20, kaynak: { tur: 'makine', id: 51 }, kaynakAdi: null,
        baslangic: '2026-11-02T06:00:00.000Z', bitis: '2026-11-03T09:00:00.000Z', sabit: false }],
    } });
    rrAc();
    const b = await bolum('Üretim emirleri');
    const satir = (await within(b).findByRole('button', { name: /UE-0001/ })).closest('li')!;
    await waitFor(() => { expect(within(satir).getByText('03.11.2026')).toBeTruthy(); });
    const alt = within(satir).getByText('OP 10 çalışıyor, planda yok');
    expect(alt.getAttribute('data-ton')).toBe('uyari');
    expect(satir.hasAttribute('data-gec')).toBe(false);
  });
});

describe('R3 Üretim emirleri: adım sağlamı (B18)', () => {
  const kur = (emirler: (k: (sira: number) => string) => Partial<NonNullable<ReturnType<typeof ornekDurum>['emirler']>>) => {
    const d = ornekDurum();
    const adim = (id: string, seq: number, opNo: number) => ({
      id, seq, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    });
    d.routes = { '11': { base: null, steps: [adim('s1', 1, 10), adim('s2', 2, 20), adim('s3', 3, 30)] } } as unknown as typeof d.routes;
    const o = d.emirler!.orders[0]!;
    const k = (sira: number) => `${o.id}|root|${String(sira)}`;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((x) => ({ ...x, status: 'uretimde' as const })), ...emirler(k) };
    sunucuKur(OKUYAN, { durum: d });
    rrAc();
  };
  const saglamlar = async () => {
    await emirAc();
    const liste = await screen.findByRole('list', { name: 'UE-0001 operasyonları' });
    return within(liste).getAllByRole('listitem').map((li) => li.querySelector('.tc-rr3-adim-saglam b')?.textContent);
  };

  it('biten adım kayda geçen sağlamı, süren adım canlı sayacı gösterir; bekleyen adım boş kalır', async () => {
    kur((k) => ({ opStatus: { [k(1)]: 'tamam', [k(2)]: 'calisiyor' }, opProg: { [k(2)]: 4 }, opSaglam: { [k(1)]: 9 } }));
    expect(await saglamlar()).toEqual(['9', '4', '—']);
  });

  it('opSaglam gelmezse (eski sunucu ya da sağlamı yazılmamış adım) biten adım boş görünür, sayı uydurulmaz', async () => {
    kur((k) => ({ opStatus: { [k(1)]: 'tamam', [k(2)]: 'tamam' }, opProg: { [k(1)]: 5 } }));
    expect(await saglamlar()).toEqual(['—', '—', '—']);
  });
});

describe('R3 Üretim emirleri: komutlar', () => {
  it('yönetici taslağı plana alır: emrin ekrandaki sürümüyle gider (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /adimli-emirler/61/plana-al': () => json(200, {}) } });
    const b = await sayfa();
    fireEvent.click(within(b).getByRole('button', { name: 'Plana al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/61/plana-al')).toBe(true));
    expect(istekler.find((i) => i.yol === '/adimli-emirler/61/plana-al')?.govde).toEqual({ surum: 1 });
  });

  it('başkası değiştirdiyse (eski sürüm) uyarı satırı çıkar ve veri yeniden okunur', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'POST /adimli-emirler/61/plana-al': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka yerde değişti.', ayrinti: { neden: 'eski-surum' } }) },
    });
    const b = await sayfa();
    const okuma = istekler.filter((i) => i.yol === '/plan/planlama-kaynagi').length;
    fireEvent.click(within(b).getByRole('button', { name: 'Plana al' }));
    const uyari = await within(b).findByRole('alert');
    expect(uyari.textContent).toContain('Emir başka yerde değişti.');
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/plan/planlama-kaynagi').length).toBeGreaterThan(okuma));
  });

  it('iptal onay penceresinden sonra gider', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /adimli-emirler/61/iptal': () => json(200, {}) } });
    const b = await sayfa();
    expect(within(b).queryByRole('button', { name: 'İptal et' })).toBeNull();
    fireEvent.click(within(b).getByRole('button', { name: 'UE-0001 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'İptal et' }));
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
    const form = await pencere();
    expect(within(form).getByRole('combobox', { name: 'Ürün' }).textContent).toContain('(rotasız)');
    fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '25' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Emri oluştur' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/rotasiz')).toBe(true));
    expect(istekler.find((i) => i.yol === '/adimli-emirler/rotasiz')?.govde).toMatchObject({ malzemeNo: 11, adet: 25, emirTuru: 'seri' });
  });

  it('açık projesi olmayan üründe proje şartı form açılırken görünür, Emri oluştur kapalıdır; emir isteği gitmez (B-2502-3)', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: true, projeler: [] }) },
    });
    const form = await pencere();
    expect((await within(form).findByText(/Bu ürün için açık proje yok/)).closest('p')?.querySelector('a')?.getAttribute('href')).toBe('/projeler');
    const dugme = within(form).getByRole('button', { name: 'Emri oluştur' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.click(dugme);
    await new Promise((r) => { setTimeout(r, 50); });
    expect(istekler.filter((i) => i.yontem === 'POST' && i.yol.startsWith('/adimli-emirler'))).toEqual([]);
  });

  it('rotasız emir ayarı kapalıyken rotasız ürün seçilince form baştan söyler, Emri oluştur kapalıdır, Rotasını kur ürüne götürür (B-2500-6)', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [], rotasizAcik: false }) },
    });
    const form = await pencere();
    expect(await within(form).findByText(/rotasız üretim emri ayarlardan kapalı/)).toBeTruthy();
    const dugme = within(form).getByRole('button', { name: 'Emri oluştur' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.click(dugme);
    await new Promise((r) => { setTimeout(r, 50); });
    expect(istekler.filter((i) => i.yontem === 'POST' && i.yol.startsWith('/adimli-emirler'))).toEqual([]);
    fireEvent.click(within(form).getByRole('button', { name: 'Rotasını kur' }));
    expect(await screen.findByText(/^Gidilen adres: \/recete-rota\/schema/)).toBeTruthy();
  });

  it('rotasız emir ayarı açıkken uyarı çıkmaz (B-2500-6)', async () => {
    sunucuKur(YONETICI, { yazmalar: { 'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [], rotasizAcik: true }) } });
    const form = await pencere();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(within(form).queryByText(/ayarlardan kapalı/)).toBeNull();
    expect((within(form).getByRole('button', { name: 'Emri oluştur' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('proje gerekmeyen türde şart iletisi çıkmaz, Emri oluştur açıktır (B-2502-3, izinli)', async () => {
    sunucuKur(YONETICI, { yazmalar: { 'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }) } });
    const form = await pencere();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(within(form).queryByText(/açık proje yok/)).toBeNull();
    expect((within(form).getByRole('button', { name: 'Emri oluştur' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('çift tıklama tek emir açar: ikinci tık komut sürerken düşer (RR-2)', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: {
        'GET /adimli-emirler/acilis-secenekleri': () => json(200, { projeZorunlu: false, projeler: [] }),
        'POST /adimli-emirler/rotasiz': () => json(200, { uretimEmriId: 62 }),
      },
    });
    const form = await pencere();
    const dugme = within(form).getByRole('button', { name: 'Emri oluştur' });
    fireEvent.click(dugme);
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/rotasiz')).toBe(true));
    await new Promise((r) => { setTimeout(r, 50); });
    expect(istekler.filter((i) => i.yol === '/adimli-emirler/rotasiz')).toHaveLength(1);
  });

  it('Ürün ve rotalar\'daki "Üretim emri oluştur" yeni formu o ürünle açar; aynı numaralı emri açmaz (RR-1)', async () => {
    const d = ornekDurum();
    // Ürün kimliği ile emir kimliği çakışsın: eski hata ürün 11 için emir 11'i açıyordu.
    d.emirler!.orders[0]!.id = '11';
    sunucuKur(YONETICI, { durum: d });
    rrAc('/recete-rota/schema');
    fireEvent.click(await screen.findByRole('button', { name: 'Üretim emri oluştur' }));
    // 3039: emir Üretim Emirleri'nde açılır; pencere o ürünle gelir (emir 11 değil, ürün 11).
    expect(await screen.findByText('Gidilen adres: /uretim-emirleri?yeni=1&urun=11')).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    sunucuKur(YONETICI, { durum: d });
    yeniEmirAc('11');
    const form = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
    expect((await within(form).findByRole('combobox', { name: 'Ürün' }) as HTMLSelectElement).value).toBe('11');
  });

  it('rota.emre-kopyala olmayan rotalı ürüne emir açamaz (reddedilen)', async () => {
    const d = ornekDurum();
    d.routes = { 11: { base: null, steps: [] } };
    d.routes['11']!.steps = [{
      id: 'o10', seq: 10, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 30, proc: null,
      chg: null, cycle: 5, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
    }];
    sunucuKur(kisi(['uretim-emirleri.yaz']), { durum: d });
    yeniEmirAc();
    const b = await screen.findByRole('dialog', { name: 'Yeni üretim emri' });
    await within(b).findByText(/Emir açmak için mamul ya da yarı mamul gerekli/);
    expect(within(b).queryByRole('button', { name: 'Emri oluştur' })).toBeNull();
  });
});

describe('R3 Üretim emirleri: Diğer menüsü ve stok (1102 a, 1106 a)', () => {
  const adimli = (status: 'serbest' | 'tamam', kapanisSonucu: 'tamamlandi' | null = null) => {
    const d = ornekDurum();
    d.routes = { '11': { base: null, steps: [{
      id: 's1', seq: 1, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    }] } } as unknown as typeof d.routes;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((o) => ({ ...o, status, kapanisSonucu })) };
    return d;
  };

  it('Böl paneli kapalı gelir, İşlemler menüsünden açılır (3039)', async () => {
    sunucuKur(YONETICI, { durum: adimli('serbest') });
    const ayrinti = await sayfa();
    expect(within(ayrinti).queryByRole('group', { name: 'Bölme türü' })).toBeNull();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'UE-0001 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Böl (parti ya da kol)' }));
    expect(within(ayrinti).getByRole('group', { name: 'Bölme türü' })).toBeTruthy();
  });

  it('3099: partilere bölerken her partinin türü seçilir; seçilen tür bölme isteğine girer, seçilmeyen parti türsüz gider (ana emrinki)', async () => {
    const emir = {
      id: 61, parti: { ustEmirId: null, bolunmeSira: null, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null },
      isEmirleri: [{ id: 701, opNo: 10, sira: 1, durum: 'bekliyor' }], surum: 1,
    };
    const istekler = sunucuKur(YONETICI, {
      durum: adimli('serbest'),
      yazmalar: { 'GET /adimli-emirler/61': () => json(200, { emir }), 'POST /adimli-emirler/61/bol': () => json(200, { emir, altEmirId: 62 }) },
    });
    const ayrinti = await sayfa();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'UE-0001 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Böl (parti ya da kol)' }));
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Partilere böl' }));
    const p1 = within(ayrinti).getByRole('group', { name: 'Parti 1 ve türü' });
    const p2 = within(ayrinti).getByRole('group', { name: 'Parti 2 ve türü' });
    const tur1 = within(p1).getByRole('combobox', { name: 'Parti 1 emir türü' });
    expect((tur1 as HTMLSelectElement).value).toBe('');
    expect(within(p1).getByRole('option', { name: 'Ana emirle aynı (Seri)' })).toBeTruthy();
    fireEvent.change(within(p1).getByLabelText('Parti 1'), { target: { value: '2' } });
    fireEvent.change(tur1, { target: { value: 'numune' } });
    fireEvent.change(within(p2).getByLabelText('Parti 2'), { target: { value: '3' } });
    expect(within(ayrinti).getByRole('table', { name: 'Bölme önizlemesi' }).textContent).toContain('Numune');
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Partilere böl ve onaya gönder' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yol === '/adimli-emirler/61/bol')).toHaveLength(2); });
    const [ilk, ikinci] = istekler.filter((i) => i.yol === '/adimli-emirler/61/bol');
    expect(ilk?.govde).toMatchObject({ adet: 2, emirTuru: 'numune' });
    expect(ikinci?.govde).toMatchObject({ adet: 3 });
    expect(ikinci?.govde).not.toHaveProperty('emirTuru');
  });

  it('3099: çok partili bölmede bir parti reddedilirse ileti görünür, açılan parti formdan düşer ve yeniden gönderilmez', async () => {
    const emir = {
      id: 61, parti: { ustEmirId: null, bolunmeSira: null, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null },
      isEmirleri: [{ id: 701, opNo: 10, sira: 1, durum: 'bekliyor' }], surum: 1,
    };
    let n = 0;
    const istekler = sunucuKur(YONETICI, {
      durum: adimli('serbest'),
      yazmalar: {
        'GET /adimli-emirler/61': () => json(200, { emir }),
        'POST /adimli-emirler/61/bol': () => (++n === 1 ? json(200, { emir, altEmirId: 62 }) : json(409, { kod: 'CAKISMA', mesaj: 'Bu tür proje ister; projesiz emir bu türe geçmez.' })),
      },
    });
    const ayrinti = await sayfa();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'UE-0001 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Böl (parti ya da kol)' }));
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Partilere böl' }));
    fireEvent.change(within(ayrinti).getByLabelText('Parti 1'), { target: { value: '2' } });
    fireEvent.change(within(ayrinti).getByLabelText('Parti 2'), { target: { value: '3' } });
    fireEvent.change(within(ayrinti).getByRole('combobox', { name: 'Parti 2 emir türü' }), { target: { value: 'numune' } });
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Partilere böl ve onaya gönder' }));
    await waitFor(() => { expect(within(ayrinti).getAllByRole('alert').some((a) => a.textContent.includes('Bu tür proje ister'))).toBe(true); });
    await waitFor(() => { expect((within(ayrinti).getByLabelText('Parti 1') as HTMLInputElement).value).toBe(''); });
    expect((within(ayrinti).getByLabelText('Parti 2') as HTMLInputElement).value).toBe('3');
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Partilere böl ve onaya gönder' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yol === '/adimli-emirler/61/bol')).toHaveLength(3); });
    expect(istekler.filter((i) => i.yol === '/adimli-emirler/61/bol').map((i) => (i.govde as { adet: number }).adet)).toEqual([2, 3, 3]);
  });

  it('3099: emir türü yalnız alt emrin menüsünde değişir; ana emirde menü maddesi yok, seçilen tür sürümle gider', async () => {
    const d = adimli('serbest');
    const ana = d.emirler!.orders[0]!;
    d.emirler = { ...d.emirler!, orders: [...d.emirler!.orders, { ...ana, id: '62', kayitNo: 62, no: 'UE-0001/1', qty: 2, parentId: ana.id, surum: 4 }] };
    sunucuKur(YONETICI, { durum: d });
    const anaSayfa = await sayfa();
    fireEvent.click(within(anaSayfa).getByRole('button', { name: 'UE-0001 işlemleri' }));
    expect(screen.queryByRole('menuitem', { name: 'Emir türünü değiştir' })).toBeNull();
    cleanup();
    const istekler = sunucuKur(YONETICI, { durum: d, yazmalar: { 'POST /adimli-emirler/62/emir-turu': () => json(200, { emir: {} }) } });
    const alt = await sayfa(62);
    fireEvent.click(within(alt).getByRole('button', { name: 'UE-0001/1 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Emir türünü değiştir' }));
    const panel = await within(alt).findByRole('group', { name: 'Emir türünü değiştir' });
    expect((within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText('Emir türü'), { target: { value: 'stok' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.find((i) => i.yol === '/adimli-emirler/62/emir-turu')?.govde).toEqual({ emirTuru: 'stok', surum: 4 }); });
    cleanup();
    sunucuKur(YONETICI, { durum: d, yazmalar: { 'POST /adimli-emirler/62/emir-turu': () => json(409, { kod: 'CAKISMA', mesaj: 'Bu tür proje ister; projesiz emir bu türe geçmez.' }) } });
    const alt2 = await sayfa(62);
    fireEvent.click(within(alt2).getByRole('button', { name: 'UE-0001/1 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Emir türünü değiştir' }));
    const panel2 = await within(alt2).findByRole('group', { name: 'Emir türünü değiştir' });
    fireEvent.change(within(panel2).getByLabelText('Emir türü'), { target: { value: 'numune' } });
    fireEvent.click(within(panel2).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(within(alt2).getAllByRole('alert').some((a) => a.textContent.includes('Bu tür proje ister'))).toBe(true); });
    expect(within(alt2).getByRole('group', { name: 'Emir türünü değiştir' })).toBeTruthy();
  });

  it('stoktan düşme düğmesi yalnız stok tamamlama bölümündedir; üretimi biten emirde kapanış uyarısı, kapanınca yok (1391 a)', async () => {
    for (const [status, kapanis, uyari] of [['serbest', null, false], ['tamam', null, true], ['tamam', 'tamamlandi', false]] as const) {
      sunucuKur(YONETICI, { durum: adimli(status, kapanis) });
      rrAc();
      const b = await bolum('Üretim emirleri');
      fireEvent.click(within(await within(b).findByRole('group', { name: 'Durum' })).getByRole('button', { name: /Tümü/ }));
      fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
      const ayrinti = within(b).getByLabelText('UE-0001 ayrıntısı');
      expect(within(ayrinti).queryByRole('button', { name: /stoktan düş|Emri tamamla|Stoğa işle/ })).toBeNull();
      expect(within(ayrinti).queryByText(/Üretimi bitti: aşağıda stoğa işlenir/) !== null).toBe(uyari);
      expect(within(ayrinti).queryByRole('button', { name: 'Kapanış onayları' }) !== null).toBe(uyari);
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});

describe('R3 Üretim emirleri: malzeme ihtiyacı sunucudan (B-2484-3, 461 b)', () => {
  const planda = () => {
    const d = ornekDurum();
    d.emirler!.orders[0] = { ...d.emirler!.orders[0]!, status: 'serbest' };
    return d;
  };
  const satir = (alinacak: string) => ({ malzemeNo: 12, kod: 'HM-0001', ad: 'Örnek çubuk', birim: 'adet', brut: '105', verilen: '5', stoktan: '0', alinacak });
  const cevap = (stokGorunur: boolean, alinacak: string) => () => json(200, {
    stokGorunur,
    emirler: [{ emirId: ornekDurum().emirler!.orders[0]!.kayitNo, hammadde: [satir(alinacak)], yanUrun: [], eksikler: Number(alinacak) > 0 ? [satir(alinacak)] : [], uyarilar: ['Örnek uyarı.'] }],
  });

  it('emrin ihtiyacı sunucunun sayısıyla gelir: brüt, verilen, stoktan, alınacak ve eksik; tarayıcı hesaplamaz (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, { durum: planda(), yazmalar: { 'GET /recete-rota/malzeme-ihtiyaci': cevap(true, '100') } });
    rrAc();
    const b = await emirAc();
    const tablo = await within(b).findByRole('table', { name: /malzeme ihtiyacı/ });
    expect(tablo.textContent).toContain('HM-0001');
    expect(tablo.textContent).toContain('105');
    expect(within(b).getByText(/1 kalem eksik: HM-0001 100/)).toBeTruthy();
    expect(within(b).getByText('Örnek uyarı.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/recete-rota/malzeme-ihtiyaci')).toBe(true);
    const adres = vi.mocked(fetch).mock.calls.map((c) => String(c[0])).find((x) => x.includes('/recete-rota/malzeme-ihtiyaci'));
    expect(adres).toMatch(new RegExp(`\\?emir=${String(ornekDurum().emirler!.orders[0]!.kayitNo)}$`));
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
  });

  it('stok yetkisi yoksa sunucu söyler, ekran ara stoğun düşülmediğini yazar (reddedilen)', async () => {
    sunucuKur(OKUYAN, { durum: planda(), yazmalar: { 'GET /recete-rota/malzeme-ihtiyaci': cevap(false, '0') } });
    rrAc();
    const b = await emirAc();
    await within(b).findByText(/ara adım stoğu düşülmedi/);
    expect(within(b).queryByText(/kalem eksik/)).toBeNull();
  });

  it('okuma reddedilirse ileti çıkar, tablo uydurulmaz', async () => {
    sunucuKur(YONETICI, { durum: planda(), yazmalar: { 'GET /recete-rota/malzeme-ihtiyaci': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Emir okuma yetkiniz yok.' }) } });
    rrAc();
    const b = await emirAc();
    await within(b).findByText('Emir okuma yetkiniz yok.');
    expect(within(b).queryByRole('table', { name: /malzeme ihtiyacı/ })).toBeNull();
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
    const tablo = await within(b).findByRole('table', { name: 'Statülü stok ve süreçteki malzeme' });
    await waitFor(() => { expect(tablo.textContent).toContain('Torna çıktısı'); });
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
    // 2553 b/4: notsuz sayım gitmez.
    fireEvent.click(within(b).getByRole('button', { name: 'Sayımı yaz' }));
    expect((await screen.findAllByText('Sayım notu girin: farkın nedeni hareketle birlikte yazılır.')).length).toBeGreaterThan(0);
    expect(istekler.some((i) => i.yol === '/stok/sayim')).toBe(false);
    fireEvent.change(within(b).getByLabelText(/Sayım notu/), { target: { value: 'Raf sayımı' } });
    fireEvent.click(within(b).getByRole('button', { name: 'Sayımı yaz' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim')?.govde).toEqual({
      konumId: 3, satirlar: [{ malzemeId: 11, partiId: null, beklenenMiktar: '4', sayilanMiktar: '3' }], aciklama: 'Raf sayımı',
    }));
  });

  it('2553: statülü stok süreçteki malzemeyle ürün ve OP üzerinden tek satırdır (Depoda, Emirlere göre, Fark); sahipsiz statülü bağlantısı stok okuyana görünür', async () => {
    const d = ornekDurum();
    d.items = [...(d.items ?? []), { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk', type: 'ham', unit: 'adet', cost: null, stock: 0, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
    const adim = (opNo: number) => ({
      id: `o${String(opNo)}`, seq: opNo, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 30,
      proc: 2, chg: null, cycle: 5, dep: 'bagimli' as const, depQty: null, rejectPct: 0, split: 'tek' as const, minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    });
    d.routes = { 11: { base: null, steps: [adim(10), adim(20)] } };
    const o = d.emirler!.orders[0]!;
    d.emirler = { ...d.emirler!, orders: [{ ...o, status: 'uretimde' }], opStatus: { [`${o.id}|root|1`]: 'tamam' }, opProg: { [`${o.id}|root|2`]: 3 } };
    sunucuKur(YONETICI, {
      durum: d,
      yazmalar: {
        'GET /recete-rota/statuler': () => json(200, { statuler: [{ id: 7, malzemeNo: 'HM-0001', urunKodu: 'MM-0001', kaynakAdim: '11-o10', ad: 'OP 10 Tornalama' }] }),
        'GET /stok/malzemeler/11': () => json(200, { statuKirilimi: [{ statuId: null, miktar: '4' }], bakiyeler: [] }),
        'GET /stok/malzemeler/12': () => json(200, { statuKirilimi: [{ statuId: null, miktar: '0' }, { statuId: 7, miktar: '6' }], bakiyeler: [] }),
      },
    });
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    // Stok okununca bölüm formlarıyla yeniden kurulur; tablo her denemede yeniden aranır.
    const tablo = () => within(b).getByRole('table', { name: 'Statülü stok ve süreçteki malzeme' });
    await waitFor(() => { expect(tablo().textContent).toContain('OP 10 Tornalama'); });
    const t = tablo();
    const satir = [...t.querySelectorAll('tbody tr')].find((x) => x.textContent.includes('OP 10 Tornalama'))!;
    // Emir 10 adet; OP 10 bitti, OP 20 3 sağlam bildirdi: 7 bekliyor. Depoda 6: fark -1.
    // 2547 eki: sahipsiz listesi bu sunucuda yok (404); üç sütun boş kalır, sıfır yazılmaz.
    expect([...satir.querySelectorAll('td')].map((x) => x.textContent)).toEqual(['HM-0001 Örnek çubuk', 'OP 10 Tornalama MM-0001', '6', '7', '-1', 'adet', 'UE-0001: 7', '—', '—', '—']);
    expect(within(b).getByText(/Sahipsiz statülü stok okunamadı/)).toBeTruthy();
    expect(within(b).getByRole('link', { name: 'Sahipsiz statülü stok' }).getAttribute('href')).toBe('/stok/sahipsiz-statulu');
  });

  it('2547 eki ve 2561 a: Sahipsiz, Kaynak emir ve Son hareket stoktan okunur; tabloda olmayan sahipsiz statü kendi satırıdır', async () => {
    const d = ornekDurum();
    d.items = [...(d.items ?? []), { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk', type: 'ham', unit: 'adet', cost: null, stock: 0, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
    d.routes = { 11: { base: null, steps: [{ id: 'o10', seq: 10, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null,
      setup: 30, proc: 2, chg: null, cycle: 5, dep: 'bagimli' as const, depQty: null, rejectPct: 0, split: 'tek' as const, minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [] }] } };
    const istekler = sunucuKur(YONETICI, {
      durum: d,
      yazmalar: {
        'GET /recete-rota/statuler': () => json(200, { statuler: [{ id: 7, malzemeNo: 'HM-0001', urunKodu: 'MM-0001', kaynakAdim: '11-o10', ad: 'OP 10 Tornalama' },
          { id: 9, malzemeNo: 'YM-0009', urunKodu: 'MM-0009', kaynakAdim: '99-o20', ad: 'OP 20 Eski adım' }] }),
        'GET /stok/malzemeler/11': () => json(200, { statuKirilimi: [{ statuId: null, miktar: '4' }], bakiyeler: [] }),
        'GET /stok/malzemeler/12': () => json(200, { statuKirilimi: [{ statuId: 7, miktar: '6' }], bakiyeler: [] }),
        'GET /stok/sahipsiz-statulu': () => json(200, { satirlar: [
          { malzemeId: 12, malzemeKod: 'HM-0001', malzemeAd: 'Örnek çubuk', statuId: 7, kaliteDurumu: 'serbest', miktar: '6', ayrilan: '4', sahipsiz: '2', konumlar: ['A1'],
            kaynakEmirId: 61, kaynakEmirNo: 'UE-0061', sonHareket: '2026-11-08T09:30:00.000Z' },
          { malzemeId: 12, malzemeKod: 'HM-0001', malzemeAd: 'Örnek çubuk', statuId: 7, kaliteDurumu: 'karar_bekliyor', miktar: '1', ayrilan: '0', sahipsiz: '1', konumlar: ['A1'],
            kaynakEmirId: 60, kaynakEmirNo: 'UE-0060', sonHareket: '2026-11-07T09:30:00.000Z' },
          { malzemeId: 19, malzemeKod: 'YM-0009', malzemeAd: 'Örnek eski parça', statuId: 9, kaliteDurumu: 'serbest', miktar: '3', ayrilan: '0', sahipsiz: '3', konumlar: [],
            kaynakEmirId: null, kaynakEmirNo: null, sonHareket: null },
        ] }),
      },
    });
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    const tablo = () => within(b).getByRole('table', { name: 'Statülü stok ve süreçteki malzeme' });
    await waitFor(() => { expect(tablo().textContent).toContain('UE-0061'); });
    const satirlar = [...tablo().querySelectorAll('tbody tr')].map((x) => [...x.querySelectorAll('td')].map((y) => y.textContent));
    const tor = satirlar.find((x) => x[1]?.startsWith('OP 10 Tornalama'))!;
    // Veri koşulu: sahipsiz yalnız serbest ve şartlı; karar bekleyen altında ayrı.
    expect(tor.slice(7, 9)).toEqual(['2karar bekleyen 1', 'UE-0061']);
    expect(tor[9]).toMatch(/08\.11\.2026/);
    const eski = satirlar.find((x) => x[0] === 'YM-0009 Örnek eski parça')!;
    expect(eski.slice(1, 10)).toEqual(['OP 20 Eski adım', '—', '—', '—', '—', '—', '3', '—', '—']);
    // Atölye notu: Son hareket başlığıyla sıralanır (azalan ilk tıkta ya da ikincide); boş son harekette sonda.
    const basliklar = () => within(tablo()).getAllByRole('columnheader');
    const sirala = () => basliklar().find((x) => x.textContent.includes('Son hareket'))!.querySelector('button')!;
    fireEvent.click(sirala());
    const ilk = () => [...tablo().querySelectorAll('tbody tr')].map((x) => x.querySelector('td')?.textContent);
    const a1 = ilk();
    fireEvent.click(sirala());
    const a2 = ilk();
    // Tek son hareketli satır iki yönde de en üstte (boşlar her yönde sonda); başlık yönü değişir.
    expect([a1[0], a2[0]]).toEqual(['HM-0001 Örnek çubuk', 'HM-0001 Örnek çubuk']);
    expect(basliklar().find((x) => x.textContent.includes('Son hareket'))!.getAttribute('aria-sort')).toMatch(/ascending|descending/);
    expect(istekler.filter((i) => i.yontem !== 'GET')).toEqual([]);
  });

  it('2547 eki: stok okuyamayan sahipsiz listesini istemez', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc('/recete-rota/stock');
    await bolum('Stok');
    await within(await bolum('Stok')).findByText(/Stok verisine erişiminiz yok/);
    expect(istekler.some((i) => i.yol === '/stok/sahipsiz-statulu')).toBe(false);
  });

  it('B-2482-16 ve 2553: Stok değeri bilinmeyen maliyeti sıfır saymaz, sayısını yazar; Minimum kartı Malzeme ihtiyacına gider; stok okumayan bağlantıyı görmez', async () => {
    sunucuKur(OKUYAN);
    rrAc('/recete-rota/stock');
    const b = await bolum('Stok');
    expect(within(b).queryByRole('link', { name: 'Sahipsiz statülü stok' })).toBeNull();
    const minimum = await within(b).findByRole('link', { name: /Minimumun altında/ });
    expect(minimum.getAttribute('href')).toBe('/plan/mrp');
    // 2553-2: kart hedefini yazar; tablodaki "yalnız minimumun altındakiler" süzgeciyle karışmaz.
    expect(minimum.textContent).toContain('Planlama: malzeme ihtiyacına git');
    cleanup();
    vi.unstubAllGlobals();

    const d = ornekDurum();
    d.items = [...(d.items ?? []), { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk', type: 'ham', unit: 'adet', cost: null, stock: 5, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
    d.maliyet = { malzeme: { '11': { birimMaliyet: '10', paraBirimi: 'TRY', surum: 1 } }, yazabilir: false } as unknown as typeof d.maliyet;
    sunucuKur(YONETICI, { durum: d });
    rrAc('/recete-rota/stock');
    const kart = (await within(await bolum('Stok')).findByText('Stok değeri')).closest('[class]')!.parentElement!;
    // MM-0001: 4 adet x 10 = 40; HM-0001'in maliyeti yok, sıfır sayılmaz.
    await waitFor(() => { expect(kart.textContent).toContain('2 kalem, 1 kalemin değeri bilinmiyor'); });
    expect(kart.textContent).toContain('40');
  });
});

describe('R3 kolun devamı: ana kola katılır ya da ayrı ilerler (1827; 1825 a+b)', () => {
  const adim = (seq: number) => ({
    id: `s${String(seq)}`, seq, opNo: seq * 10, opId: '21', name: `Adım ${String(seq)}`, stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null,
    setup: 10, proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
    digerAdaylar: [], ins: [], outs: [],
  });
  // Ana emir 61 üç adımlı rotada; kol 62 birinci adımdan sonra ayrılır. m = 4 (rota uzunluğu + 1) sunucuda "ayrı ilerler"dir.
  const kollu = (m: number) => {
    const d = ornekDurum();
    d.routes = { '11': { base: null, steps: [adim(1), adim(2), adim(3)] } } as unknown as typeof d.routes;
    const ana = { ...d.emirler!.orders[0]!, status: 'serbest' as const };
    d.emirler = { ...d.emirler!, orders: [ana, { ...ana, id: '62', kayitNo: 62, no: 'UE-0002', qty: 2, parentId: '61', kol: { n: 1, m }, surum: 4 }] };
    return d;
  };
  const okuma = (id: number, ust: number | null) => () => json(200, { emir: {
    id, parti: { ustEmirId: ust, bolunmeSira: ust === null ? null : 2, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null },
    isEmirleri: [1, 2, 3].map((s) => ({
      id: 700 + s, sira: s, opNo: s * 10, durum: 'bekliyor', ad: `Adım ${String(s)}`, tip: { id: 21, ad: 'Tornalama', kod: 'TOR' }, kaynak: null, istasyon: null,
      ayarSuresiDk: '10', birimSureDk: '2', terminGun: null, bilesenler: [], adaylar: [], fason: null, saglamAdet: null, baslama: null, bitis: null,
    })),
  } });
  const kolAc = async () => {
    const ayrinti = await sayfa(62);
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'UE-0002 işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Katılma ya da ayrı ilerleme' }));
    return within(ayrinti).getByRole('group', { name: 'Kolun devamı' });
  };
  const yazmalar = {
    'GET /adimli-emirler/62': okuma(62, 61),
    'GET /adimli-emirler/61': okuma(61, null),
    'PUT /adimli-emirler/62/birlesme-plani': () => json(200, { id: 62, surum: 5 }),
    'POST /adimli-emirler/62/birlesme-plani': () => json(200, { id: 62, surum: 5 }),
  };
  const plan = (istekler: readonly Istek[]) => istekler.filter((i) => i.yol === '/adimli-emirler/62/birlesme-plani');

  it('katılan kolda "Ayrı ilerler" boş katılma adımıyla sahibine gider (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, { durum: kollu(3), yazmalar });
    const grup = await kolAc();
    expect(within(grup).getByRole('button', { name: 'Ana kola katılır' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: 'Ayrı ilerler' }));
    await waitFor(() => expect(plan(istekler)).toHaveLength(1));
    expect(plan(istekler)[0]?.govde).toEqual({ birlesmeOpNo: null, surum: 4 });
  });

  it('ayrı ilerleyen kol "Ana kola katılır" ile ayrıldığı adımın ardılında katılır (izinli)', async () => {
    const istekler = sunucuKur(YONETICI, { durum: kollu(4), yazmalar });
    const grup = await kolAc();
    expect(screen.getAllByText(/ana emre katılmaz/).length).toBeGreaterThan(0);
    expect(within(grup).getByRole('button', { name: 'Ayrı ilerler' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: 'Ana kola katılır' }));
    await waitFor(() => expect(plan(istekler)).toHaveLength(1));
    expect(plan(istekler)[0]?.govde).toEqual({ birlesmeOpNo: 20, surum: 4 });
  });

  it('emir yazma yetkisi olmayan kişi seçimi görmez (reddedilen)', async () => {
    const istekler = sunucuKur(kisi(['rota.emre-kopyala']), { durum: kollu(3), yazmalar });
    rrAc();
    const b = await bolum('Üretim emirleri');
    fireEvent.click(await within(b).findByRole('button', { name: /UE-0002/ }));
    const ayrinti = within(b).getByLabelText('UE-0002 ayrıntısı');
    expect(within(ayrinti).queryByRole('button', { name: 'UE-0002 için diğer işlemler' })).toBeNull();
    expect(within(ayrinti).queryByRole('group', { name: 'Kolun devamı' })).toBeNull();
    expect(plan(istekler)).toEqual([]);
  });
});

describe('R3 Üretim emirleri: adımın süre özeti (2571)', () => {
  it('başlamış adımın altında hazırlık, net ve brüt birim, sağlam ve hurda; ölçülemeyen süre "–" ve nedeniyle; bekleyen adımda yok', async () => {
    const d = ornekDurum();
    const adim = (id: string, seq: number, opNo: number) => ({
      id, seq, opNo, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10,
      proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
      digerAdaylar: [], ins: [], outs: [],
    });
    d.routes = { '11': { base: null, steps: [adim('s1', 1, 10), adim('s2', 2, 20), adim('s3', 3, 30)] } } as unknown as typeof d.routes;
    const o = d.emirler!.orders[0]!;
    d.emirler = { ...d.emirler!, orders: d.emirler!.orders.map((x) => ({ ...x, status: 'uretimde' as const })),
      opStatus: { [`${o.id}|root|1`]: 'tamam', [`${o.id}|root|2`]: 'calisiyor' } };
    const ie = (id: number, opNo: number, baslama: string | null) => ({ id, opNo, baslama, kaynak: { tur: 'makine' }, fason: null });
    const ozet = (isEmriId: number, ek: Record<string, unknown>) => ({
      isEmriId, baslama: null, bitis: null, saglam: 8, hurda: 1, hazirlikDk: 12.5, brutBirimDk: 2.4, netBirimDk: 2.1, tekliAraliklarDk: [], tekliOrtalamaDk: null, ...ek,
    });
    sunucuKur(OKUYAN, { durum: d, yazmalar: {
      [`GET /adimli-emirler/${String(o.kayitNo)}`]: () => json(200, { emir: { isEmirleri: [ie(101, 10, '2026-11-02T06:00:00.000Z'), ie(102, 20, '2026-11-03T06:00:00.000Z'), ie(103, 30, null)] } }),
      [`GET /adimli-emirler/${String(o.kayitNo)}/is-emirleri/101/sure-ozeti`]: () => json(200, ozet(101, {})),
      [`GET /adimli-emirler/${String(o.kayitNo)}/is-emirleri/102/sure-ozeti`]: () => json(200, ozet(102, { saglam: 0, hurda: 0, hazirlikDk: null, brutBirimDk: null, netBirimDk: null })),
    } });
    rrAc();
    const b = await emirAc();
    const liste = within(within(b).getByLabelText('UE-0001 ayrıntısı')).getByRole('list', { name: 'UE-0001 operasyonları' });
    const op = (n: number) => within(liste).getAllByRole('listitem').find((li) => li.querySelector('.tc-rr3-op')?.textContent === String(n))!;
    await waitFor(() => { expect(op(10).textContent).toContain('Hazırlık 12,5 dk'); });
    expect(op(10).textContent).toContain('Net 2,1 · brüt 2,4 dk/adet');
    expect(op(10).textContent).toContain('8 sağlam / 1 hurda');
    expect(op(20).textContent).toContain('Hazırlık — dk');
    expect(op(20).textContent).toContain('Ayar basılmadı: hazırlık ölçülmedi · Sayım yok: işlem süresi ölçülmedi');
    expect(op(30).textContent).not.toContain('Hazırlık');
  });
});
