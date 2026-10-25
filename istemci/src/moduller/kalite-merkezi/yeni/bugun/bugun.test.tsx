import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmIlkParcaBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { ayEkle, bugun, isoGun } from '../kurallar.ts';
import { KALIBRASYON_YOLU, STUDYO_YOLU } from '../sekmeler.ts';
import { kayitYazmalari, kmAc, MUAYENECI, MUHENDIS, OKUYAN, YONETICI, type TestKayitlari, type TestKullanicisi } from '../test-ortak.tsx';
import type { KmVerisi } from '../veri.ts';
import { BugunSayaci } from './index.tsx';
import { bugunGorevleri, gruplara } from './gorevler.ts';

// Kayıtlar ve adlar sentetiktir.
const gunSonra = (n: number): string => { const t = new Date(); t.setDate(t.getDate() + n); return isoGun(t); };
const veriKur = (ek: Partial<KmVerisi> = {}): KmVerisi => ({
  ncr: [], capa: [], insp: [], dev: [], sup: [], frm: [], lot: [], tpl: [], spc: [], cizim: [], parca: [], iz: [], belge: [], emir: [], bayrak: [],
  ayarlar: {}, kisi: 'Deneme Kişi', ...ek,
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const BEKLEYEN: KmIlkParcaBekleyenCevabi = { emirler: [{ uretimEmriId: 7, emirNo: 'UE-0007', parcaNo: 'DNM-01', parcaAd: 'Deneme mili', adet: 20, kararBekleyenAdet: 1 }] };

// Ortak sahte sunucunun üstüne ilk parça uçları: bekleyen liste ve karar (geçen adet döner).
function ac(k: TestKullanicisi, kayitlar: TestKayitlari = {}, bekleyen: KmIlkParcaBekleyenCevabi = { emirler: [] }) {
  const s = kmAc('', k, kayitlar);
  const asil = s.fetch.getMockImplementation();
  s.fetch.mockImplementation(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if (yol === '/kalite-merkezi/ilk-parca/bekleyenler') return json(200, bekleyen);
    if (yol === '/kalite-merkezi/ilk-parca/7/karar') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      return json(200, { adet: 1 });
    }
    return asil ? asil(adres, istek) : json(404, {});
  });
  return s;
}
const secili = (ad: RegExp) => screen.getAllByRole('tab', { name: ad }).find((t) => t.getAttribute('aria-selected') === 'true');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Bugün görev listesi', () => {
  it('termini geçen DÖF kırmızı öncelikte, 7 günden uzak ve kapalı termin listede yok', () => {
    const veri = veriKur({
      capa: [
        { _id: 'c1', no: 'DOF-001', baslik: 'Çapak', durum: 'Açık', termin: gunSonra(-2), sorumlu: 'Deneme Sorumlu' },
        { _id: 'c2', no: 'DOF-002', baslik: 'Uzak', durum: 'Açık', termin: gunSonra(30) },
        { _id: 'c3', no: 'DOF-003', baslik: 'Kapalı', durum: 'Kapalı', termin: gunSonra(-5) },
      ],
    });
    const g = bugunGorevleri(veri, true);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ oncelik: 0, grup: 'Düzeltici faaliyetler', baslik: 'DOF-001: Çapak', alt: 'Termin 2 gün geçti | Deneme Sorumlu' });
    expect(g[0]?.eylem).toEqual({ tur: 'gorunum', gorunum: 'dof', gecis: { ac: 'c1' } });
  });

  it('gruplar en acil görevlerine göre sıralanır; sayaç acil (0-1) işleri sayar', () => {
    const veri = veriKur({
      insp: [{ _id: 'i1', no: 'MU-1', tur: 'Final', parcaNo: 'DNM-01', adimli: true, sonuc: 'Devam ediyor', chars: [{ olcum: '1' }, { olcum: '' }] }],
      cizim: [{ _id: 'r1', parcaNo: 'DNM-02', dosyaAdi: 'resim.pdf', balonlar: [] }],
      frm: [{ _id: 'f1', kod: 'KF-05', ad: 'Deneme formu', durum: 'Onay bekliyor', tarih: bugun() }],
    });
    const g = bugunGorevleri(veri, true);
    expect(gruplara(g).map((x) => x.grup)).toEqual(['Yarım kalan ölçümler', 'Onay bekleyen formlar', 'Hazırlık']);
    expect(g[0]).toMatchObject({ alt: expect.stringMatching(/^1\/2 ölçüldü/), eylem: { tur: 'yol', yol: STUDYO_YOLU } });
    expect(BugunSayaci?.(veri)).toEqual({ n: 1, kotu: true });
    expect(BugunSayaci?.(veriKur())).toEqual({ n: 0, kotu: false });
  });

  it('karar bekleyen ürün karantina kaleminin hedefine gider', () => {
    const veri = veriKur({ ncr: [{ _id: 'n1', no: 'NCR-1', parcaNo: 'DNM-01', durum: 'Açık', ciddiyet: 'Kritik', miktar: 5, tarih: gunSonra(-3) }] });
    expect(bugunGorevleri(veri, false)[0]).toMatchObject({
      oncelik: 0, grup: 'Karar bekleyen ürünler', baslik: 'DNM-01: MRB kararı bekliyor', alt: 'NCR-1 | 5 adet | 3 gündür bekliyor',
      eylemMetni: 'Karar ver', eylem: { tur: 'gorunum', gorunum: 'uygunsuzluklar', gecis: { ac: 'n1' } },
    });
  });

  it('geçersiz kalibrasyonlu cihaz Kalibrasyon sayfasına gönderir; kullanım dışı cihaz listede yok', () => {
    const veri = veriKur({
      dev: [{ _id: 'd1', kod: 'CH-1', ad: 'Kumpas', sonKal: ayEkle(bugun(), -24), periyot: 12 }, { _id: 'd2', kod: 'CH-2', ad: 'Mikrometre', kullanimDisi: true }],
    });
    const g = bugunGorevleri(veri, false);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ oncelik: 1, eylemMetni: 'Kalibrasyon kaydet', eylem: { tur: 'yol', yol: KALIBRASYON_YOLU } });
  });

  it('form onayı yalnız onaylayabilene "Onayla" der ve onay penceresini açar; ötekine kaydı görüntületir', () => {
    const veri = veriKur({ frm: [{ _id: 'f1', kod: 'KF-05', ad: 'Form', durum: 'Onay bekliyor' }] });
    expect(bugunGorevleri(veri, true)[0]).toMatchObject({ eylemMetni: 'Onayla', eylem: { tur: 'formOnayi', kayit: { _id: 'f1' } } });
    expect(bugunGorevleri(veri, false)[0]).toMatchObject({ eylemMetni: 'Görüntüle', eylem: { tur: 'gorunum', gorunum: 'formlar', gecis: { ac: 'f1' } } });
  });
});

describe('Bugün ekranı', () => {
  it('bekleyen iş yokken boş durumu ve kişinin adını gösterir', async () => {
    ac(MUAYENECI);
    expect(await screen.findByRole('heading', { level: 2, name: 'Merhaba Deneme' })).toBeTruthy();
    expect(screen.getByText('Bekleyen iş yok')).toBeTruthy();
  });

  it('görev düğmesi ilgili görünümü açar', async () => {
    ac(MUAYENECI, { capa: [{ _id: 'c1', no: 'DOF-001', baslik: 'Çapak', durum: 'Açık', termin: gunSonra(-1) }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Aç' }));
    await waitFor(() => { expect(secili(/DÖF/)).toBeTruthy(); });
  });

  it('form "Onayla" onay penceresini açar; karar ve not onaylayan yazılmadan gider', async () => {
    const s = ac(MUHENDIS, { frm: [{ _id: 'f1', kod: 'KF-05', ad: 'Deneme formu', durum: 'Onay bekliyor', onaylayan: 'Eski' }] });
    const grup = await screen.findByRole('region', { name: 'Onay bekleyen formlar' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Onayla' }));
    const pencere = screen.getByRole('dialog', { name: 'KF-05 onayı' });
    fireEvent.change(within(pencere).getByLabelText('Karar'), { target: { value: 'Düzeltme için iade et' } });
    fireEvent.change(within(pencere).getByLabelText('Not'), { target: { value: 'Eksik imza' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(kayitYazmalari(s.yazmalar, 'frm')).toHaveLength(1); });
    const govde = (kayitYazmalari(s.yazmalar, 'frm')[0]?.govde as { govde: Record<string, unknown> }).govde;
    expect(govde).toMatchObject({ kod: 'KF-05', durum: 'Taslak', onayNot: 'Eksik imza' });
    expect(govde).not.toHaveProperty('onaylayan');
    expect(await screen.findByText('Form düzeltme için iade edildi')).toBeTruthy();
  });

  it('cihaz görevi Kalibrasyon sayfasına (eski ekrana) gider', async () => {
    ac(MUAYENECI, { dev: [{ _id: 'd1', kod: 'CH-1', ad: 'Kumpas', sonKal: ayEkle(bugun(), -24), periyot: 12 }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Kalibrasyon kaydet' }));
    expect(await screen.findByText('eski ekran')).toBeTruthy();
  });

  it('kısayollar yazabilene görünür ve yeni kayıt görünümünü açar; yalnız okuyan görmez', async () => {
    ac(MUAYENECI);
    fireEvent.click(await screen.findByRole('button', { name: /Uygunsuzluk bildir/ }));
    await waitFor(() => { expect(secili(/Uygunsuzluklar/)).toBeTruthy(); });
    cleanup();
    ac(OKUYAN);
    await screen.findByRole('heading', { level: 2, name: 'Merhaba Deneme' });
    expect(screen.queryByRole('region', { name: 'Hızlı işler' })).toBeNull();
  });

  it('ölçüm kısayolu stüdyoya (eski ekrana) gider', async () => {
    ac(MUAYENECI);
    fireEvent.click(await screen.findByRole('button', { name: /^Ölçüm yap/ }));
    expect(await screen.findByText('eski ekran')).toBeTruthy();
  });

  it('kabuktaki atölye modu özet şeridini gizler', async () => {
    ac(MUAYENECI);
    expect(await screen.findByRole('region', { name: 'Özet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atölye modu' }));
    expect(screen.queryByRole('region', { name: 'Özet' })).toBeNull();
  });
});

describe('İlk parça kararı', () => {
  it('onaylayabilen görür ve onaylar', async () => {
    const s = ac(MUHENDIS, {}, BEKLEYEN);
    const bolum = await screen.findByRole('region', { name: 'İlk parça kararı' });
    expect(within(bolum).getByText('UE-0007 | DNM-01')).toBeTruthy();
    fireEvent.click(within(bolum).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => { expect(s.yazmalar).toContainEqual({ yol: '/kalite-merkezi/ilk-parca/7/karar', govde: { karar: 'onay' } }); });
    expect(await screen.findByText('İlk parça onaylandı: 1 adet')).toBeTruthy();
    // Karar tekrar korumalıdır: istek kimliğiyle gider.
    const karar = s.fetch.mock.calls.find(([adres]) => String(adres).endsWith('/ilk-parca/7/karar'));
    expect(new Headers((karar?.[1] as RequestInit | undefined)?.headers).get('istek-kimligi')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ret onay penceresinden sonra gönderilir; Vazgeç göndermez', async () => {
    const s = ac(YONETICI, {}, BEKLEYEN);
    const bolum = await screen.findByRole('region', { name: 'İlk parça kararı' });
    fireEvent.click(within(bolum).getByRole('button', { name: 'Reddet' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'İlk parça reddi' })).getByRole('button', { name: 'Vazgeç' }));
    expect(s.yazmalar).toEqual([]);
    fireEvent.click(within(bolum).getByRole('button', { name: 'Reddet' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'İlk parça reddi' })).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => { expect(s.yazmalar).toContainEqual({ yol: '/kalite-merkezi/ilk-parca/7/karar', govde: { karar: 'ret' } }); });
  });

  it('onay yetkisi olmayan kişide liste istenmez ve bölüm çizilmez', async () => {
    const s = ac(MUAYENECI, {}, BEKLEYEN);
    await screen.findByRole('heading', { level: 2, name: 'Merhaba Deneme' });
    expect(screen.queryByRole('region', { name: 'İlk parça kararı' })).toBeNull();
    expect(s.fetch.mock.calls.some(([a]) => String(a).includes('ilk-parca'))).toBe(false);
  });
});
