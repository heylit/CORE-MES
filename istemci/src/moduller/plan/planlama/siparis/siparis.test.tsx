import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Islem } from '#paylasilan/islemler.ts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import type { DegerlendirmeCevabi, Degerlendirici } from './degerlendirme.ts';
import { PartiBolmeKarti, PlanSecenekleriKarti, TerminUzatmaKarti } from './Degerlendirme.tsx';
import { kayitliPlan } from './kurallar.ts';
import { CALISMA_DEGERI, calismaKur } from './test-veri.ts';

// Ekran yer tutucu metnine değil parçanın kendi işaretlerine bakar: kap `data-parca`, kilitli kart `data-kapali`, hücre ve formun erişilebilir adı.
const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 9 }];
// Plan yazan, maliyet okumayan planlamacı (223 a). Ad uydurmadır.
const PLANLAMACI = { ...MALIYETSIZ, islemler: [...MALIYETSIZ.islemler, 'plan.yaz' as Islem] };
const BEKLE = { timeout: 10000 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const parca = async (ad: string) => { await waitFor(() => { expect(document.querySelector(`[data-parca="${ad}"]`)).toBeTruthy(); }, BEKLE); };
const s1Ac = () => { fireEvent.click(screen.getAllByRole('button', { name: /^S1, / })[0]!); };
const ONEM = 'Siparişi öne al ya da geri bırak';
const dugme = (ad: string | RegExp) => screen.getByRole('button', { name: ad }) as HTMLButtonElement;
const tumAc = () => { fireEvent.click(screen.getByText('Tüm satırlar')); };

describe('P2 Siparişler', () => {
  it('yönetici geç siparişi açar, sihirbazla fiyatı yazar; yazma sürüm denetimiyle yalnız planlama anahtarına gider (izinli)', async () => {
    const govdeler: unknown[] = [];
    const istekler = sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/plan/ysiparis');
    await parca('ysiparis');
    s1Ac();
    // İlk izinli form sipariş dolu, ikinci adımdan açılır; Geri başlangıç adımının altına inmez.
    const onem = screen.getByRole('form', { name: ONEM });
    expect(within(onem).getByLabelText(/^Önemi/)).toBeTruthy();
    expect(within(onem).queryByRole('button', { name: 'Geri' })).toBeNull();
    // Termin sahibinindir (222 a): yerinde, pasif (Soru 466/1 a).
    expect(dugme(/Termini değiştir/).disabled).toBe(true);
    fireEvent.click(dugme(/Fiyat ve ödeme vadesi/));
    const form = screen.getByRole('form', { name: 'Fiyat ve ödeme vadesi' });
    fireEvent.change(within(form).getByLabelText(/^Tutar \(TL\)/), { target: { value: '1500' } });
    fireEvent.click(within(form).getByRole('button', { name: 'İleri' }));
    expect(within(form).getByText(/Kontrol edin\. Kaydet dediğinizde/)).toBeTruthy();
    fireEvent.submit(form);
    expect(await screen.findByText('Sipariş fiyatı değişti. Plan yeniden çözülünce güncellenir.')).toBeTruthy();
    expect(screen.getByText('S1 fiyatı kaydedildi')).toBeTruthy();
    // Kayıt kartı ortak sade kabuğunun (eski sdSonKart): plan veri değişikliğini içermiyor, eski not ve pasif "Planı iyileştir".
    expect(screen.getByText(/Plan bu değişikliği henüz içermiyor/)).toBeTruthy();
    expect((within(document.querySelector<HTMLElement>('.tc-sade-son')!).getByRole('button', { name: 'Planı iyileştir' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dugme('Yeniden düzenle')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 9 });
    const g = govdeler[0] as { deger: typeof CALISMA_DEGERI };
    expect(g.deger.D.siparisler[0]).toMatchObject({ id: 'S1', gelir: 1500, termin: '2026-10-21 17:00', adet: 10 });
    expect(istekler.filter((i) => i.includes('planlama-degerlendirmesi'))).toEqual([]);
  }, 20000);

  it('açılımda odak formun ilk alanına gider, adım şeridi gizli sınıfla gelir; Esc açılımı kapatır, odak hücreye döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    ac('/plan/ysiparis');
    await parca('ysiparis');
    const hucre = screen.getAllByRole('button', { name: /^S1, / })[0]!;
    fireEvent.click(hucre);
    const form = screen.getByRole('form', { name: ONEM });
    await waitFor(() => { expect(document.activeElement).toBe(within(form).getByLabelText(/^Önemi/)); });
    expect(screen.getByRole('region', { name: /^S1 · / }).querySelector('.tc-pys-ac-ust svg')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.tc-pys-ac')).toBeNull();
    await waitFor(() => { expect(document.activeElement).toBe(hucre); });
  }, 20000);

  it('Kapat düğmesiyle kapanınca da odak hücreye döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    ac('/plan/ysiparis');
    await parca('ysiparis');
    const hucre = screen.getAllByRole('button', { name: /^S1, / })[0]!;
    fireEvent.click(hucre);
    const kapat = dugme('Kapat');
    kapat.focus();
    fireEvent.click(kapat);
    expect(document.querySelector('.tc-pys-ac')).toBeNull();
    await waitFor(() => { expect(document.activeElement).toBe(hucre); });
  }, 20000);

  it('maliyet okumayan planlamacı önemi en çok ×2 seçer, gerekçesiz kaydedemez, fiyat formunu görmez', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, KAYIT, { govdeler });
    ac('/plan/ysiparis');
    await parca('ysiparis');
    s1Ac();
    const form = screen.getByRole('form', { name: ONEM });
    const degerler = [...within(form).getByRole('combobox').querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    expect(degerler).toEqual(['0.5', '1', '1.5', '2']);
    fireEvent.click(within(form).getByRole('button', { name: 'İleri' }));
    expect(within(form).getByRole('alert').textContent).toContain('Gerekçe boş olamaz.');
    expect(govdeler).toEqual([]);
    expect(screen.queryByRole('button', { name: /Fiyat ve ödeme vadesi/ })).toBeNull();
  }, 20000);

  it('plan yazmayan kişi form açamaz: termin yerinde pasif, çizelgede seçeneği motoru açar; kâr kartı kilitli (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ac('/plan/ysiparis');
    await parca('ysiparis');
    s1Ac();
    expect(screen.queryByRole('form')).toBeNull();
    expect(dugme(/Termini değiştir/).disabled).toBe(true);
    expect(screen.getByText('Termin Üretim emirlerinde değiştirilir.')).toBeTruthy();
    expect(screen.getByText(/karar 180/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Partiyi böl' })).toBeNull();
    fireEvent.click(dugme(/S1 çizelgede/));
    // Yönlendirici adresi geçişle (startTransition) yazar; adres tembel yüklenen motor parçası gelince değişir, yük altında bir saniyeyi aşar.
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/plan'); }, BEKLE);
  }, 20000);

  it('sunucu kayıt yazmayı vermiyorsa (ben.yazabilir false) yönetici de form görmez', async () => {
    sunucuKur(YONETICI, KAYIT, { yazabilir: false });
    ac('/plan/ysiparis');
    await parca('ysiparis');
    s1Ac();
    expect(screen.queryByRole('form', { name: ONEM })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Fiyat ve ödeme vadesi' })).toBeNull();
  }, 20000);

  it('motor gereken araçlar yerinde pasif, değerlendirme düğmeyle istenir (açılışta istek gitmez); kâr tablosunda tutar yazılır, Uygula pasif', async () => {
    const govdeler: unknown[] = [];
    const istekler = sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/plan/ysiparis');
    await parca('ysiparis');
    tumAc();
    expect(document.querySelectorAll('[data-kapali="motor"]').length).toBe(4);
    expect(dugme('Örtüşmeyi dene').disabled).toBe(true);
    expect(screen.getByText('Örtüşebilir bağı olan geciken iş emri yok.')).toBeTruthy();
    for (const ad of ['Partiyi böl', 'Parti taraması', 'Örtüşme', 'Siparişler: maliyet ve kâr']) {
      expect(screen.getByRole('heading', { level: 2, name: ad }).querySelector('svg')).not.toBeNull();
    }
    // Partiyi böl değerlendirme ucuyla ölçülür (576): düğme açık, basılmadıkça istek gitmez.
    expect(dugme('Böl').disabled).toBe(false);
    expect(dugme('Tara').disabled).toBe(true);
    expect(dugme('Fiyatsızlara önerilen fiyatı yaz').disabled).toBe(true);
    expect(screen.queryAllByRole('button', { name: 'Uygula' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    const tutar = screen.getByLabelText('S2 tutar');
    fireEvent.change(tutar, { target: { value: '800' } });
    fireEvent.blur(tutar);
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as { deger: typeof CALISMA_DEGERI }).deger.D.siparisler[1]).toMatchObject({ id: 'S2', gelir: 800 });
    expect(istekler.filter((i) => i.includes('planlama-degerlendirmesi'))).toEqual([]);
  }, 20000);
});

describe('P2 kâr tablosu (486/1 a)', () => {
  it('maliyet Maliyetler hesabıyla dolu; önerilen fiyatı yazan düğmeler pasif', async () => {
    const deger = structuredClone(CALISMA_DEGERI);
    Object.assign(deger.D.tezgahlar[0]!, { ucret: 10 }); Object.assign(deger.D.fasoncular[0]!, { fiyat: 1 }); deger.plan.ops['S1.a2'].m = '@F1';
    sunucuKur(YONETICI, [{ ...KAYIT[0]!, deger }]);
    ac('/plan/ysiparis');
    await parca('ysiparis');
    tumAc();
    const tablo = screen.getByRole('table', { name: 'Siparişler: maliyet ve kâr' });
    expect(within(tablo).getAllByText(/^işleme \d/).length).toBeGreaterThan(0);
    // Tezgâh amortismanı girilmediği için genel gider bilinmez; sıfır yazılmaz.
    expect(within(tablo).getAllByText('genel gider —').length).toBeGreaterThan(0);
    const uygula = screen.getAllByRole('button', { name: 'Uygula' }) as HTMLButtonElement[];
    expect(uygula.length).toBeGreaterThan(0);
    expect(uygula.every((b) => b.disabled)).toBe(true);
    expect(dugme('Fiyatsızlara önerilen fiyatı yaz').disabled).toBe(true);
  }, 20000);
});

describe('P2 örtüşme kartı (486/2 a)', () => {
  it('örtüşmesi açık iş emri listelenir; Kapat ve Örtüşmeyi dene pasif, yazma gitmez', async () => {
    const deger = structuredClone(CALISMA_DEGERI);
    Object.assign(deger.D.siparisler[1]!, { ortus: true });
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, [{ ...KAYIT[0]!, deger }], { govdeler });
    ac('/plan/ysiparis');
    await parca('ysiparis');
    tumAc();
    const kapat = dugme('S2 örtüşmesini kapat');
    expect(kapat.disabled).toBe(true);
    fireEvent.click(kapat);
    expect(dugme('Örtüşmeyi dene').disabled).toBe(true);
    expect(govdeler).toEqual([]);
  }, 20000);
});

describe('P2 Terminler', () => {
  it('yönetici fason dönüş tarihini sihirbazla girer; 16:00 ve planın dönüşü referans olarak yazılır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/plan/terminler');
    await parca('terminler');
    fireEvent.click(screen.getAllByRole('button', { name: /^S1\.a2, / })[0]!);
    const form = screen.getByRole('form', { name: 'Fason dönüş tarihi gir' });
    fireEvent.change(within(form).getByLabelText(/^Dönüş tarihi/), { target: { value: '2026-10-22' } });
    fireEvent.click(within(form).getByRole('button', { name: 'İleri' }));
    fireEvent.submit(form);
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { fasonTermin: { 'S1.a2': '2026-10-22 16:00' }, fasonRef: { 'S1.a2': '2026-10-21 20:00' } } } });
  }, 20000);

  it('malzeme kalemleri satın alma planından gelir (518 a): haritada satırı, kartta termin bekleyeni; ekran yazmaz (izinli)', async () => {
    // S1'in malzemesi 20 kg, stok 5: 15 kg için sipariş verilmedi. Stok ucu cevap vermez; planın kendi kopyası kullanılır. Satın Alma termini
    // yok: malzeme olması gereken tarihte gelmiş sayılır (554 a); plan yazan malzeme başına termini girebilir (533 a).
    const deger = structuredClone(CALISMA_DEGERI);
    Object.assign(deger.D.siparisler[0]!, { malzeme: [{ kod: '7', miktar: 2 }] });
    Object.assign(deger.D, { malzemeler: [{ kod: '7', ad: 'Deneme cubuk', birim: 'kg', stok: 5, tedarikGun: 3, muayeneGun: 0 }] });
    const istekler = sunucuKur(YONETICI, [{ ...KAYIT[0]!, deger }], { ret: (y) => y.startsWith('/stok/') });
    ac('/plan/terminler');
    await parca('terminler');
    await waitFor(() => { expect(screen.getAllByRole('button', { name: /^7, / }).length).toBeGreaterThan(0); }, BEKLE);
    expect(document.querySelectorAll('.tc-pys-h[data-kapali]').length).toBe(0);
    expect(screen.getByText(/^En koyu satır 7: plan 19\.10 Pzt istiyor, geliş 19\.10 Pzt \(0 gün bekleme\)/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^7, / })[0]!);
    const acilim = screen.getByRole('region', { name: '7 · Sipariş geç kaldı' });
    expect(within(acilim).queryByRole('form')).toBeNull();
    tumAc();
    for (const ad of ['Varsayılan fason dönüşü', 'Fasoncu başına katsayı', 'Tedarik terminleri', 'Malzeme: termin bekleyenler', 'Fason dönüş terminleri']) {
      expect(screen.getByRole('heading', { level: 2, name: ad }).querySelector('svg')).not.toBeNull();
    }
    const kart = screen.getByRole('table', { name: 'Malzeme: termin bekleyenler' });
    expect(within(kart).getByText('Sipariş geç kaldı')).toBeTruthy();
    expect((within(kart).getByLabelText('7 termin') as HTMLInputElement).disabled).toBe(true);
    expect((within(screen.getByRole('table', { name: 'Tedarik terminleri' })).getByLabelText('7 tedarik termini') as HTMLInputElement).disabled).toBe(false);
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);

  it('malzemesi stoktan karşılanan planda malzeme satırı ve termin bekleyen yoktur (eski çerçeve gibi)', async () => {
    sunucuKur(YONETICI, KAYIT);
    ac('/plan/terminler');
    await parca('terminler');
    tumAc();
    await waitFor(() => { expect(screen.getByText('Termini beklenen malzeme yok.')).toBeTruthy(); }, BEKLE);
    expect(screen.queryByText('Satın alma listesi plan motoruyla gelir.')).toBeNull();
    expect(document.querySelectorAll('.tc-pys-h[data-kapali]').length).toBe(0);
  }, 20000);

  it('plan yazmayan kişi fason tarihi giremez (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ac('/plan/terminler');
    await parca('terminler');
    fireEvent.click(screen.getAllByRole('button', { name: /^S1\.a2, / })[0]!);
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByText('Bunu değiştirme yetkiniz yok.')).toBeTruthy();
  }, 20000);
});

describe('P2 Termin ve kâr', () => {
  it('yönetici plan dengesini değiştirir (izinli)', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/plan/denge');
    await parca('denge');
    const cubuk = screen.getByRole('slider', { name: /Plan dengesi/ });
    expect((cubuk as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(cubuk, { target: { value: '75' } });
    fireEvent.blur(cubuk);
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { planDenge: 75 } } });
  }, 20000);

  it('kâr sütunu ve uzatma araçları yerinde pasif; termin uzatma formu Üretim emirlerine yönlendirir', async () => {
    sunucuKur(YONETICI, KAYIT);
    ac('/plan/denge');
    await parca('denge');
    expect(screen.getByText('Kâr')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Uzatma etkisini motorla ölç' })[0]!.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: /^S1, / })[1]!);
    expect(dugme(/Termini 1 gün uzat/).disabled).toBe(true);
    expect(screen.getByText(/Termin Üretim emirlerinde değiştirilir; plan yeniden/)).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
  }, 20000);

  it('maliyet okumayan kişi görünümü açamaz (reddedilen)', async () => {
    sunucuKur(PLANLAMACI, KAYIT);
    ac('/plan/denge');
    expect(await screen.findByText('Bu sayfayı görme yetkiniz yok.', {}, BEKLE)).toBeTruthy();
    expect(document.querySelector('[data-parca="denge"]')).toBeNull();
  }, 20000);
});

describe('Değerlendirme kartı (uç açılınca)', () => {
  const cevap = (maliyetGorunur: boolean): DegerlendirmeCevabi<'plan-secenekleri'> => ({
    calismaSurumu: 9, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur,
    sonuc: { tur: 'plan-secenekleri', secenekler: [{ denge: 25, carpan: 4, ekMesai: [], ekMesaiTl: null, geciken: 1, isSayisi: 2, gecikmeSaat: 15, netKar: maliyetGorunur ? 500 : null, eksik: 0, plan: { dataVer: 3, ops: {}, J: {} } }] },
  });
  const ciz = (d: Degerlendirici | null, komut: CalismaKomutu | null, alabilir: boolean, yenile = vi.fn()) => render(
    <BildirimSaglayici>
      <PlanSecenekleriKarti degerlendir={d} yenile={yenile} komut={komut} alabilir={alabilir} kim="Deneme Kisi" simdikiDenge={50} />
    </BildirimSaglayici>,
  );
  const HESAPLA = 'Seçenekleri hesapla';

  it('kapalıyken kart eski gövdesiyle yerinde, hesap düğmesi pasif, not yazılır', () => {
    ciz(null, null, true);
    expect(document.querySelector('[data-kapali="motor"]')).toBeTruthy();
    expect(dugme(HESAPLA).disabled).toBe(true);
    expect(screen.getByText(/termin önce, dengeli ve kâr önce/)).toBeTruthy();
  });

  it('hesap düğmeyle istenir; plan yazan seçeneği alır, komut yalnız bir değişiklik yapar', async () => {
    const d = vi.fn(async () => cevap(true)) as unknown as Degerlendirici;
    const komut = { degistir: vi.fn(() => true), geriAl: vi.fn(), geriAlinabilir: vi.fn() } as unknown as CalismaKomutu;
    ciz(d, komut, true);
    expect(d).not.toHaveBeenCalled();
    fireEvent.click(dugme(HESAPLA));
    fireEvent.click(await screen.findByRole('button', { name: 'Bu planı al' }));
    expect(d).toHaveBeenCalledWith({ tur: 'plan-secenekleri' });
    expect(komut.degistir).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Net kâr')).toBeTruthy();
    expect(dugme('Yeniden hesapla')).toBeTruthy();
  });

  it('maliyet görünmeyen cevapta kâr sütunu yoktur; plan yazmayan seçeneği alamaz (reddedilen)', async () => {
    const d = vi.fn(async () => cevap(false)) as unknown as Degerlendirici;
    ciz(d, null, false);
    fireEvent.click(dugme(HESAPLA));
    expect(await screen.findByText('Termine yakın')).toBeTruthy();
    expect(screen.queryByText('Net kâr')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bu planı al' })).toBeNull();
  });

  it('409 cevabında yenile düğmesi çıkar', async () => {
    const yenile = vi.fn();
    const d = vi.fn(async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); }) as unknown as Degerlendirici;
    ciz(d, null, false, yenile);
    fireEvent.click(dugme(HESAPLA));
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));
    expect(yenile).toHaveBeenCalled();
  });

  it('termin uzatmada gün düğme grubuyla seçilir; plan yoksa hesap istenmez', () => {
    const d = vi.fn() as unknown as Degerlendirici;
    render(<BildirimSaglayici><TerminUzatmaKarti planVar={false} degerlendir={d} yenile={vi.fn()} /></BildirimSaglayici>);
    const grup = screen.getByRole('group', { name: 'Uzatma süresi' });
    expect(within(grup).getAllByRole('button').map((b) => b.textContent)).toEqual(['1 gün', '2 gün', '3 gün', '5 gün']);
    fireEvent.click(within(grup).getByRole('button', { name: '5 gün' }));
    expect(within(grup).getByRole('button', { name: '5 gün' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Önce planı çözün.')).toBeTruthy();
    expect(dugme('Önerileri hesapla').disabled).toBe(true);
  });
});

describe('Partiyi böl (uç açılınca)', () => {
  it('adetler eşit gelir, tek tek değişir; toplam tutmazsa hesap istenmez, tutunca elle adetler gider', async () => {
    const d = vi.fn(async () => ({ calismaSurumu: 9, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: true, sonuc: { siparisId: 'S1', darbogaz: null, sonuc: null } })) as unknown as Degerlendirici;
    const c = calismaKur();
    render(<BildirimSaglayici><PartiBolmeKarti c={c} p={kayitliPlan(c)} degerlendir={d} yenile={vi.fn()} /></BildirimSaglayici>);
    expect((screen.getByRole('combobox', { name: 'İş emri' }) as HTMLSelectElement).value).toBe('S1');
    const grup = screen.getByRole('group', { name: 'Parti adetleri' });
    const kutular = within(grup).getAllByRole('spinbutton') as HTMLInputElement[];
    expect(kutular.map((k) => k.value)).toEqual(['5', '5']);
    fireEvent.change(kutular[0]!, { target: { value: '4' } });
    expect(screen.getByRole('alert').textContent).toContain('toplamı 9');
    expect(dugme('Böl').disabled).toBe(true);
    fireEvent.change(kutular[1]!, { target: { value: '6' } });
    fireEvent.click(dugme('Böl'));
    await waitFor(() => { expect(d).toHaveBeenCalledWith({ tur: 'parti-bolme', siparisId: 'S1', dagitim: 'ayni', adetler: [4, 6] }); });
    fireEvent.click(dugme('Eşit dağıt'));
    expect((within(grup).getAllByRole('spinbutton') as HTMLInputElement[]).map((k) => k.value)).toEqual(['5', '5']);
  });

  it('darboğaz plandan yazılır, tezgâh dağılımı seçilir; en küçük partinin altında Böl kilitli', () => {
    const d = vi.fn() as unknown as Degerlendirici;
    const c = calismaKur((x) => {
      (x.D.urunler[0] as Record<string, unknown>).rota = [{ k: 'a1', minParti: 4, tezgahlar: [{ id: 'M1', cevrim: 6 }, { id: 'M2', cevrim: 3 }] }];
      (x.D.tezgahlar as Record<string, unknown>[]).push({ id: 'M2', ad: 'Deneme 2' });
      x.plan.ops = { 'S1.a1': { job: 'S1', m: 'M1', S: 8, C: 20 } } as typeof x.plan.ops;
    });
    render(<BildirimSaglayici><PartiBolmeKarti c={c} p={kayitliPlan(c)} degerlendir={d} yenile={vi.fn()} /></BildirimSaglayici>);
    expect(screen.getByText(/Darboğaz adımı a1 \(M1\)/)).toBeTruthy();
    expect(screen.getByText(/a1 adımında en küçük parti 4 adet/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Tezgâh' }), { target: { value: 'dag' } });
    expect(screen.getByText('M2')).toBeTruthy();
    const kutular = within(screen.getByRole('group', { name: 'Parti adetleri' })).getAllByRole('spinbutton');
    fireEvent.change(kutular[0]!, { target: { value: '3' } });
    fireEvent.change(kutular[1]!, { target: { value: '7' } });
    expect(screen.getByRole('alert').textContent).toContain('1. parti 3 adet; bu adımda en küçük parti 4.');
    expect(dugme('Böl').disabled).toBe(true);
  });
});
