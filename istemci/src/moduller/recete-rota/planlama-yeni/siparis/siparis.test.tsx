import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Islem } from '#paylasilan/islemler.ts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import { DEGERLENDIRME_ACIK, type DegerlendirmeCevabi, type Degerlendirici } from './degerlendirme.ts';
import { DegerlendirmeKarti, PartiBolmeKarti, PlanSecenekleri } from './Degerlendirme.tsx';
import { CALISMA_DEGERI } from './test-veri.ts';

// Ekran yer tutucu metnine değil parçanın kendi işaretlerine bakar: kap `data-parca`, kilitli kart `data-kapali`, hücre ve formun erişilebilir adı.
const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 9 }];
// Plan yazan, maliyet okumayan planlamacı (223 a). Ad uydurmadır.
const PLANLAMACI = { ...MALIYETSIZ, islemler: [...MALIYETSIZ.islemler, 'plan.yaz' as Islem] };
const BEKLE = { timeout: 10000 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const parca = async (ad: string) => { await waitFor(() => { expect(document.querySelector(`[data-parca="${ad}"]`)).toBeTruthy(); }, BEKLE); };
const s1Ac = () => { fireEvent.click(screen.getAllByRole('button', { name: /^S1, / })[0]!); };

describe('P2 Siparişler', () => {
  it('yönetici geç siparişi açar, fiyatı yazar; yazma sürüm denetimiyle yalnız planlama anahtarına gider (izinli)', async () => {
    const govdeler: unknown[] = [];
    const istekler = sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/recete-rota/planlama-yeni/ysiparis');
    await parca('ysiparis');
    s1Ac();
    expect(screen.getByRole('form', { name: 'Öne al ya da geri bırak' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fiyat ve ödeme vadesi/ }));
    const form = screen.getByRole('form', { name: 'Fiyat ve ödeme vadesi' });
    fireEvent.change(within(form).getByLabelText(/^Tutar \(TL\)/), { target: { value: '1500' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Sipariş fiyatı değişti. Plan yeniden çözülünce güncellenir.')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 9 });
    const g = govdeler[0] as { deger: typeof CALISMA_DEGERI };
    expect(g.deger.D.siparisler[0]).toMatchObject({ id: 'S1', gelir: 1500, termin: '2026-10-21 17:00', adet: 10 });
    expect(istekler.filter((i) => i.includes('planlama-degerlendirmesi'))).toEqual([]);
    expect(screen.queryByText(/çizelgede/)).toBeNull();
  }, 20000);

  it('maliyet okumayan planlamacı önemi en çok ×2 seçer, fiyat formunu görmez', async () => {
    sunucuKur(PLANLAMACI, KAYIT);
    ac('/recete-rota/planlama-yeni/ysiparis');
    await parca('ysiparis');
    s1Ac();
    const form = screen.getByRole('form', { name: 'Öne al ya da geri bırak' });
    const degerler = [...within(form).getByRole('combobox').querySelectorAll('option')].map((o) => o.value);
    expect(degerler).toEqual(['0.5', '1', '1.5', '2']);
    expect(screen.queryByRole('button', { name: /Fiyat ve ödeme vadesi/ })).toBeNull();
  }, 20000);

  it('plan yazmayan kişi formu görmez, yetkisizlik yazılır; kâr kartı kilitli (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ac('/recete-rota/planlama-yeni/ysiparis');
    await parca('ysiparis');
    s1Ac();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByText('Bunu değiştirme yetkiniz yok.')).toBeTruthy();
    expect(screen.getByText(/karar 180/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Partiyi böl' })).toBeNull();
  }, 20000);

  it('sunucu kayıt yazmayı vermiyorsa (ben.yazabilir false) yönetici de form görmez', async () => {
    sunucuKur(YONETICI, KAYIT, { yazabilir: false });
    ac('/recete-rota/planlama-yeni/ysiparis');
    await parca('ysiparis');
    s1Ac();
    expect(screen.queryByRole('form')).toBeNull();
  }, 20000);

  it('motor gereken kartlar uç gelene kadar kilitli, istek gitmez', async () => {
    expect(DEGERLENDIRME_ACIK).toBe(false);
    const istekler = sunucuKur(YONETICI, KAYIT);
    ac('/recete-rota/planlama-yeni/ysiparis');
    await parca('ysiparis');
    expect(document.querySelectorAll('[data-kapali="motor"]').length).toBe(3);
    expect(istekler.filter((i) => i.includes('planlama-degerlendirmesi'))).toEqual([]);
  }, 20000);
});

describe('P2 Terminler', () => {
  it('yönetici fason dönüş tarihini girer; 16:00 ve planın dönüşü referans olarak yazılır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/recete-rota/planlama-yeni/terminler');
    await parca('terminler');
    fireEvent.click(screen.getAllByRole('button', { name: /^S1\.a2, / })[0]!);
    const form = screen.getByRole('form', { name: 'Fason dönüş tarihi' });
    fireEvent.change(within(form).getByLabelText('Dönüş tarihi'), { target: { value: '2026-10-22' } });
    fireEvent.submit(form);
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { fasonTermin: { 'S1.a2': '2026-10-22 16:00' }, fasonRef: { 'S1.a2': '2026-10-21 20:00' } } } });
  }, 20000);

  it('plan yazmayan kişi fason tarihi giremez (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ac('/recete-rota/planlama-yeni/terminler');
    await parca('terminler');
    fireEvent.click(screen.getAllByRole('button', { name: /^S1\.a2, / })[0]!);
    expect(screen.queryByRole('form', { name: 'Fason dönüş tarihi' })).toBeNull();
  }, 20000);
});

describe('P2 Termin ve kâr', () => {
  it('yönetici plan dengesini değiştirir (izinli)', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, KAYIT, { govdeler });
    ac('/recete-rota/planlama-yeni/denge');
    await parca('denge');
    const cubuk = screen.getByRole('slider', { name: /Plan dengesi/ });
    expect((cubuk as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(cubuk, { target: { value: '75' } });
    fireEvent.blur(cubuk);
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { planDenge: 75 } } });
  }, 20000);

  it('maliyet okumayan kişi görünümü açamaz (reddedilen)', async () => {
    sunucuKur(PLANLAMACI, KAYIT);
    ac('/recete-rota/planlama-yeni/denge');
    expect(await screen.findByText('Bu sayfayı görme yetkiniz yok.', {}, BEKLE)).toBeTruthy();
    expect(document.querySelector('[data-parca="denge"]')).toBeNull();
  }, 20000);
});

describe('Değerlendirme kartı (uç açılınca)', () => {
  const cevap = (maliyetGorunur: boolean): DegerlendirmeCevabi<'plan-secenekleri'> => ({
    calismaSurumu: 9, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur,
    sonuc: { secenekler: [{ denge: 25, carpan: 4, ekMesai: [], ekMesaiTl: null, geciken: 1, isSayisi: 2, gecikmeSaat: 15, netKar: maliyetGorunur ? 500 : null, eksik: 0, plan: { dataVer: 3, ops: {}, J: {} } }] },
  });
  const ciz = (d: Degerlendirici | null, komut: CalismaKomutu | null, alabilir: boolean, yenile = vi.fn()) => render(
    <BildirimSaglayici>
      <DegerlendirmeKarti baslik="Plan seçenekleri" ne="Deneme." istek={{ tur: 'plan-secenekleri' }} degerlendir={d} yenile={yenile}>
        {(c) => <PlanSecenekleri cevap={c} komut={komut} alabilir={alabilir} kim="Deneme Kisi" />}
      </DegerlendirmeKarti>
    </BildirimSaglayici>,
  );

  it('kapalıyken kilit kartı çizilir, hesap düğmesi yoktur', () => {
    ciz(null, null, true);
    expect(document.querySelector('[data-kapali="motor"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hesapla' })).toBeNull();
  });

  it('hesap düğmeyle istenir; plan yazan seçeneği alır, komut yalnız bir değişiklik yapar', async () => {
    const d = vi.fn(async () => cevap(true)) as unknown as Degerlendirici;
    const komut = { degistir: vi.fn(() => true), geriAl: vi.fn(), geriAlinabilir: vi.fn() } as unknown as CalismaKomutu;
    ciz(d, komut, true);
    expect(d).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bu planı al' }));
    expect(d).toHaveBeenCalledWith({ tur: 'plan-secenekleri' });
    expect(komut.degistir).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Net kâr')).toBeTruthy();
  });

  it('maliyet görünmeyen cevapta kâr sütunu yoktur; plan yazmayan seçeneği alamaz (reddedilen)', async () => {
    const d = vi.fn(async () => cevap(false)) as unknown as Degerlendirici;
    ciz(d, null, false);
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    expect(await screen.findByText('Termine yakın')).toBeTruthy();
    expect(screen.queryByText('Net kâr')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bu planı al' })).toBeNull();
  });

  it('409 cevabında yenile düğmesi çıkar', async () => {
    const yenile = vi.fn();
    const d = vi.fn(async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); }) as unknown as Degerlendirici;
    ciz(d, null, false, yenile);
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));
    expect(yenile).toHaveBeenCalled();
  });
});

describe('Partiyi böl (uç açılınca)', () => {
  it('adetler eşit gelir, tek tek değişir; toplam tutmazsa hesap istenmez, tutunca elle adetler gider', async () => {
    const d = vi.fn(async () => ({ calismaSurumu: 9, dataVer: 3, baslangic: '2026-10-19', simdi: 7, maliyetGorunur: true, sonuc: { siparisId: 'S1', darbogaz: null, sonuc: null } })) as unknown as Degerlendirici;
    render(<BildirimSaglayici><PartiBolmeKarti siparisler={[{ id: 'S1', ad: 'Deneme', adet: 10 }]} degerlendir={d} yenile={vi.fn()} /></BildirimSaglayici>);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sipariş' }), { target: { value: 'S1' } });
    const grup = screen.getByRole('group', { name: 'Parti adetleri' });
    const kutular = within(grup).getAllByRole('spinbutton') as HTMLInputElement[];
    expect(kutular.map((k) => k.value)).toEqual(['5', '5']);
    fireEvent.change(kutular[0]!, { target: { value: '4' } });
    expect(screen.getByRole('alert').textContent).toContain('toplamı 9');
    expect((screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(kutular[1]!, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
    expect(await screen.findByText('Darboğaz bulunamadı.')).toBeTruthy();
    expect(d).toHaveBeenCalledWith({ tur: 'parti-bolme', siparisId: 'S1', dagitim: 'ayni', adetler: [4, 6] });
    fireEvent.click(screen.getByRole('button', { name: 'Eşit dağıt' }));
    expect((within(grup).getAllByRole('spinbutton') as HTMLInputElement[]).map((k) => k.value)).toEqual(['5', '5']);
  });
});
