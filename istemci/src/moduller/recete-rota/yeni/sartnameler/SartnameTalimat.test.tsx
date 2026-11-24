import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { SartnameCevabi, SartnamelerCevabi, TalimatSablonlariCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Uydurma kütüphane: bir yürürlükte ve taslağı olan şartname, bir şablon.
const YAZAN: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'rota.sartname-yaz', 'rota.sartname-yayinla', 'rota.talimat-yaz'] };
const kisi = { id: 1, ad: 'Deneme 1' };
const surumu = (id: number, surumNo: number, durum: 'taslak' | 'yururlukte') => ({
  id, surumNo, durum, istenenBelgeler: ['Kalınlık raporu'], terminalNotu: null, degisiklikNotu: null, acan: kisi, acilma: '2026-10-28T08:00:00.000Z',
  yayinlayan: durum === 'yururlukte' ? kisi : null, yayin: durum === 'yururlukte' ? '2026-10-28T09:00:00.000Z' : null,
  parametreler: [{ sira: 1, anahtar: 'kalinlik', ad: 'En az kalınlık', tur: 'sayi' as const, birim: 'µm', secenekler: null, varsayilan: 8, ipucu: null, zorunlu: true, adimdaDegisir: false }],
  atiflar: [{ sira: 1, standart: { id: 5, numara: 'STD-0001', kisaAciklama: 'Örnek kaplama standardı' }, rol: 'yontem' as const, not: null }],
});
const ozet = {
  id: 7, kod: 'KPL-DNM', ad: 'Deneme kaplama', kategoriId: 1, kapsam: 'fason' as const, kaynak: 'varsayilan' as const, musteriFirma: null, musteriBelgeNo: null,
  aktif: true, surum: 4, yururlukteSurumNo: 1, taslakSurumNo: 2, kullanim: 3,
};
const LISTE: SartnamelerCevabi = {
  kategoriler: [{ id: 1, kod: 'KPL', ad: 'Metal kaplama', sira: 1 }, { id: 2, kod: 'BYA', ad: 'Boya', sira: 2 }],
  standartlar: [{ id: 5, numara: 'STD-0001', kisaAciklama: 'Örnek kaplama standardı' }],
  sartnameler: [ozet],
};
const AYRINTI: SartnameCevabi = { sartname: { ...ozet, surumler: [surumu(11, 1, 'yururlukte'), surumu(12, 2, 'taslak')] } };
const SABLON: TalimatSablonuCevabi = {
  sablon: {
    id: 3, kod: 'TS-DNM', ad: 'Deneme işleme', sartname: null, aktif: true, surum: 2, adimSayisi: 2, kontrolSayisi: 2, resimSayisi: 0, videoSayisi: 0, operasyonTipi: null, emreGelir: false,
    adimlar: [
      { sira: 1, baslik: 'Programı doğrula', metin: 'Revizyon iş emriyle aynı.', kontrol: { tur: 'onay' }, zorunlu: true, medya: [], asama: 'uretim', hedefSureDk: 5, sahneHareketi: null },
      { sira: 2, baslik: 'İlk parçayı ölç', metin: null, kontrol: { tur: 'olcum', ad: 'Çap', alt: 9.98, ust: 10.02, birim: 'mm' }, zorunlu: true, medya: [], asama: 'uretim', hedefSureDk: null, sahneHareketi: null },
    ],
  },
};
const SABLONLAR: TalimatSablonlariCevabi = { sablonlar: [{ id: 3, kod: 'TS-DNM', ad: 'Deneme işleme', sartname: null, aktif: true, surum: 2, adimSayisi: 2, kontrolSayisi: 2, resimSayisi: 0, videoSayisi: 0, operasyonTipi: null, emreGelir: false }] };

const okumalar = {
  'GET /rota/sartnameler': () => json(200, LISTE),
  'GET /rota/sartnameler/7': () => json(200, AYRINTI),
  'GET /rota/talimat-sablonlari': () => json(200, SABLONLAR),
  'GET /rota/talimat-sablonlari/3': () => json(200, SABLON),
};
const sayfaAc = async () => {
  rrAc('/recete-rota/sartnameler');
  await screen.findByRole('heading', { name: 'Şartname ve talimatlar', level: 2 });
  return screen.findByRole('region', { name: 'Şartname ayrıntısı' });
};

describe('Şartname ve talimatlar: okuyan', () => {
  it('şartname listesi ve yürürlükteki sürüm görünür; yazma düğmesi yoktur', async () => {
    sunucuKur(OKUYAN, { yazmalar: okumalar });
    const ayrinti = await sayfaAc();
    expect(await within(ayrinti).findByText('KPL-DNM · sürüm 1 · yürürlükte · fason')).toBeTruthy();
    expect(within(ayrinti).getByText('8 µm')).toBeTruthy();
    expect(within(ayrinti).getByText('STD-0001')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni şartname/ })).toBeNull();
    expect(within(ayrinti).queryByRole('button', { name: /yayınla/i })).toBeNull();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Taslak (s2)' }));
    expect(within(ayrinti).getByText('KPL-DNM · sürüm 2 · taslak · fason')).toBeTruthy();
  });

  it('talimat şablonu adım adım önizlenir', async () => {
    sunucuKur(OKUYAN, { yazmalar: okumalar });
    await sayfaAc();
    fireEvent.click(screen.getByRole('tab', { name: /Talimat şablonları/ }));
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    expect(await within(onizleme).findByText('Programı doğrula')).toBeTruthy();
    expect(within(onizleme).getByText('Ölçüm: Çap (9,98 – 10,02 mm) · zorunlu')).toBeTruthy();
    expect(within(onizleme).queryByRole('button', { name: 'Yeni sürüm' })).toBeNull();
  });
});

describe('3494-2 a: hazırlığın tek ekranından şablon açılışı', () => {
  it('?sablon=<id> talimat sekmesini o şablon seçili açar', async () => {
    const { adimlar, ...ilk } = SABLON.sablon;
    const ikinci = { ...ilk, id: 9, kod: 'TS-HZR', ad: 'Deneme hazırlık' };
    const hazirlikAdimi = { sira: 1, baslik: 'Aparatı hazırla', metin: null, kontrol: { tur: 'yok' as const }, zorunlu: false, medya: [], asama: 'on_hazirlik' as const, hedefSureDk: null, sahneHareketi: null };
    sunucuKur(OKUYAN, { yazmalar: {
      ...okumalar,
      'GET /rota/talimat-sablonlari': () => json(200, { sablonlar: [ilk, ikinci] } satisfies TalimatSablonlariCevabi),
      'GET /rota/talimat-sablonlari/9': () => json(200, { sablon: { ...ikinci, adimlar: [hazirlikAdimi] } } satisfies TalimatSablonuCevabi),
    } });
    rrAc('/recete-rota/sartnameler?sablon=9');
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    expect(await within(onizleme).findByText('Aparatı hazırla')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Talimat şablonları/ }).getAttribute('aria-selected')).toBe('true');
    expect(within(onizleme).queryByText(adimlar[0]?.baslik ?? '')).toBeNull();
  });
});

describe('Şartname ve talimatlar: yazan', () => {
  it('yeni şartname taslak olarak eklenir; taslak sürüm yayınlanır', async () => {
    const istekler = sunucuKur(YAZAN, {
      yazmalar: {
        ...okumalar,
        'POST /rota/sartnameler/ekle': () => json(200, { sartname: { ...ozet, id: 8, kod: 'BYA-DNM', yururlukteSurumNo: null, surumler: [surumu(13, 1, 'taslak')] } }),
        'POST /rota/sartnameler/7/yayinla': () => json(200, AYRINTI),
      },
    });
    const ayrinti = await sayfaAc();
    fireEvent.click(await within(ayrinti).findByRole('button', { name: 'Sürüm 2 yayınla' }));
    await waitFor(() => { expect(istekler.find((i) => i.yol === '/rota/sartnameler/7/yayinla')?.govde).toEqual({ surum: 4 }); });

    fireEvent.click(screen.getByRole('button', { name: /Yeni şartname/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni şartname' });
    const ekle = within(pencere).getByRole('button', { name: 'Taslak olarak ekle' }) as HTMLButtonElement;
    expect(ekle.disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Kod/), { target: { value: 'bya-dnm' } });
    fireEvent.change(within(pencere).getByLabelText(/^Ad/), { target: { value: 'Deneme boya' } });
    fireEvent.click(ekle);
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/sartnameler/ekle')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/sartnameler/ekle')?.govde).toEqual({
      kod: 'BYA-DNM', ad: 'Deneme boya', kategoriId: 1, kapsam: 'ikisi', musteriFirmaId: null, musteriBelgeNo: null,
    });
  });

  it('şablonun yeni sürümü adımlarıyla ve sürümüyle kaydedilir', async () => {
    const istekler = sunucuKur(YAZAN, {
      yazmalar: { ...okumalar, 'POST /rota/talimat-sablonlari/3/kaydet': () => json(200, { sablon: { ...SABLON.sablon, surum: 3 } }) },
    });
    await sayfaAc();
    fireEvent.click(screen.getByRole('tab', { name: /Talimat şablonları/ }));
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    fireEvent.click(await within(onizleme).findByRole('button', { name: 'Yeni sürüm' }));
    const pencere = await screen.findByRole('dialog', { name: 'TS-DNM · yeni sürüm' });
    fireEvent.change(within(pencere).getByLabelText(/^Başlık/), { target: { value: 'Programı ve sıfırı doğrula' } });
    // 2098-1 a: aşama adımla kaydedilir; listede üretim dışındaki aşama görünür.
    fireEvent.change(within(pencere).getByLabelText(/^Aşama/), { target: { value: 'hazirlik' } });
    expect(within(pencere).getByText(/Ayar başlayınca açılır/)).toBeTruthy();
    // 2098-8 a: hedef süre adımla gider; boş bırakılan hedef null'dır.
    const hedef = within(pencere).getByLabelText(/^Hedef süre/) as HTMLInputElement;
    expect(hedef.value).toBe('5');
    fireEvent.change(hedef, { target: { value: '8' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yeni sürümü kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')).toBe(true); });
    const govde = istekler.find((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')?.govde as { surum: number; adimlar: { baslik: string; asama: string; hedefSureDk: number | null }[] };
    expect(govde.surum).toBe(2);
    expect(govde.adimlar.map((a) => [a.baslik, a.asama, a.hedefSureDk])).toEqual([['Programı ve sıfırı doğrula', 'hazirlik', 8], ['İlk parçayı ölç', 'uretim', null]]);
  });

  it('3646: şablon adımına 3B hareket stüdyoda tanımlanır; hareketi olan adım kaydette korunur', async () => {
    const eskiHareket = { yon: '-X' as const, mesafeMm: 30, sureSn: 1, sirali: false, parcaSayisi: 2 };
    const sablon: TalimatSablonuCevabi = { sablon: { ...SABLON.sablon, adimlar: SABLON.sablon.adimlar.map((a, i) => (i === 1 ? { ...a, sahneHareketi: eskiHareket } : a)) } };
    const istekler = sunucuKur(YAZAN, {
      yazmalar: {
        ...okumalar, 'GET /rota/talimat-sablonlari/3': () => json(200, sablon), 'GET /geometri/modeller': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 100 }),
        'POST /rota/talimat-sablonlari/3/kaydet': () => json(200, { sablon: { ...sablon.sablon, surum: 3 } }),
      },
    });
    await sayfaAc();
    fireEvent.click(screen.getByRole('tab', { name: /Talimat şablonları/ }));
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    fireEvent.click(await within(onizleme).findByRole('button', { name: 'Yeni sürüm' }));
    const duzen = await screen.findByRole('dialog', { name: 'TS-DNM · yeni sürüm' });
    fireEvent.click(within(duzen).getByRole('button', { name: '3B hareketler (1)' }));
    const studyo = await screen.findByRole('dialog', { name: 'TS-DNM · 3B hareketler' });
    expect(await within(studyo).findByText("Yayında 3B model yok.")).toBeTruthy();
    expect(within(studyo).getByText('Hareketlerde kaydedilmemiş değişiklik yok.')).toBeTruthy();
    const kutu = within(studyo).getByRole('checkbox', { name: 'Bu adımın 3B hareketi var' });
    fireEvent.click(kutu);
    fireEvent.click(within(studyo).getByRole('button', { name: '+Y' }));
    fireEvent.change(within(studyo).getByLabelText(/^Beklenen parça sayısı/), { target: { value: '4' } });
    expect(within(studyo).getByText(/henüz kaydedilmedi/)).toBeTruthy();
    // Kutu kapatılıp açılınca değerler geri gelir (varsayılana dönmez).
    fireEvent.click(kutu);
    fireEvent.click(kutu);
    expect((within(studyo).getByLabelText(/^Beklenen parça sayısı/) as HTMLInputElement).value).toBe('4');
    expect(within(studyo).getByRole('button', { name: '+Y' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(studyo).getByRole('button', { name: 'Bitti' }));
    expect(within(duzen).getByRole('button', { name: '3B hareketler (2) · kaydedilmedi' })).toBeTruthy();
    fireEvent.click(within(duzen).getByRole('button', { name: '3B hareketler (2) · kaydedilmedi' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'TS-DNM · 3B hareketler' })).getByRole('button', { name: 'Bitti' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Yeni sürümü kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')).toBe(true); });
    const govde = istekler.find((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')?.govde as { adimlar: { sahneHareketi: unknown }[] };
    expect(govde.adimlar.map((a) => a.sahneHareketi)).toEqual([{ yon: '+Y', mesafeMm: 80, sureSn: 1.6, sirali: false, parcaSayisi: 4 }, eskiHareket]);
  });

  it('3249 b: şablon operasyon tipine bağlanır; tip seçilmeden emre gelme kapalıdır; ikisi kayıtla gider', async () => {
    const TIP = { id: 4, kod: 'TRN', ad: 'Torna', kisaltma: 'TRN', grup: 'TAL', grupAdi: 'Talaşlı', aktif: true, varsayilanAyarDk: null, varsayilanBirimDk: null, kullanim: 0 };
    const istekler = sunucuKur(YAZAN, {
      yazmalar: {
        ...okumalar,
        'GET /rota/secenekler': () => json(200, { operasyonTipleri: [TIP], istasyonlar: [], istasyonsuzKisiler: [], fasonFirmalar: [] }),
        'POST /rota/talimat-sablonlari/3/kaydet': () => json(200, { sablon: { ...SABLON.sablon, surum: 3 } }),
      },
    });
    await sayfaAc();
    fireEvent.click(screen.getByRole('tab', { name: /Talimat şablonları/ }));
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    expect(await within(onizleme).findByText(/Operasyon tipi: yok/)).toBeTruthy();
    fireEvent.click(await within(onizleme).findByRole('button', { name: 'Yeni sürüm' }));
    const pencere = await screen.findByRole('dialog', { name: 'TS-DNM · yeni sürüm' });
    const gelir = within(pencere).getByRole('checkbox', { name: 'Emre kendiliğinden gelsin' }) as HTMLInputElement;
    expect(gelir.disabled).toBe(true);
    await within(pencere).findByRole('option', { name: 'TRN · Torna' });
    fireEvent.change(within(pencere).getByLabelText(/^Operasyon tipi/), { target: { value: '4' } });
    expect(gelir.disabled).toBe(false);
    fireEvent.click(gelir);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yeni sürümü kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')).toBe(true); });
    const govde = istekler.find((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')?.govde as { operasyonTipiId: number | null; emreGelir: boolean };
    expect([govde.operasyonTipiId, govde.emreGelir]).toEqual([4, true]);
  });

  it('adım sürüklenip başlığa bırakılınca başa geçer (1186 b)', async () => {
    const istekler = sunucuKur(YAZAN, {
      yazmalar: { ...okumalar, 'POST /rota/talimat-sablonlari/3/kaydet': () => json(200, { sablon: { ...SABLON.sablon, surum: 3 } }) },
    });
    await sayfaAc();
    fireEvent.click(screen.getByRole('tab', { name: /Talimat şablonları/ }));
    const onizleme = await screen.findByRole('region', { name: 'Şablon önizlemesi' });
    fireEvent.click(await within(onizleme).findByRole('button', { name: 'Yeni sürüm' }));
    const liste = within(await screen.findByRole('dialog', { name: 'TS-DNM · yeni sürüm' })).getByRole('region', { name: 'Talimat adımları' });
    const veri: Record<string, string> = {};
    const aktarim = { dataTransfer: { effectAllowed: '', dropEffect: '', types: [] as string[],
      setData(k: string, v: string) { veri[k] = v; this.types.push(k); }, getData: (k: string) => veri[k] ?? '' } };
    fireEvent.dragStart(within(liste).getByRole('button', { name: /İlk parçayı ölç/ }), aktarim);
    const bas = within(liste).getByRole('heading', { name: 'Talimat · nasıl yapılır' }).parentElement!;
    fireEvent.dragOver(bas, aktarim);
    fireEvent.drop(bas, aktarim);
    expect(within(liste).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringMatching(/^1İlk parçayı ölç/), expect.stringMatching(/^2Programı doğrula/)]);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni sürümü kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')).toBe(true); });
    const govde = istekler.find((i) => i.yol === '/rota/talimat-sablonlari/3/kaydet')?.govde as { adimlar: { baslik: string }[] };
    expect(govde.adimlar.map((a) => a.baslik)).toEqual(['İlk parçayı ölç', 'Programı doğrula']);
  });
});
