import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Islem } from '#paylasilan/islemler.ts';
import type { KapanisCevabi, KapanisListeCevabi, KapanisListeSatiri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { KapanisOnaylari } from './KapanisOnaylari.tsx';
import { beklemeGunu, defterMetni, kuyrukAsamasi, ustRozet } from './kapanis.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const SATIR = {
  uretimEmriId: 1, emirNo: 'UE-0001', urun: { kod: 'M-1', ad: 'Deneme mil' }, adet: 120, saglamAdet: 120, bitis: '2026-10-28T08:00:00.000Z',
  asama: 'onay', sonuc: null, bekleyenOnaylar: ['kalite', 'mudur'], eksikMadde: 0,
} satisfies KapanisListeSatiri;
const SADECE_MUDUR = { ...SATIR, uretimEmriId: 2, emirNo: 'UE-0002', urun: { kod: 'M-2', ad: 'Deneme flanş' }, bekleyenOnaylar: ['mudur'] } satisfies KapanisListeSatiri;
const liste = (satirlar: KapanisListeSatiri[]): KapanisListeCevabi => ({ satirlar, sayfa: 1, sayfaBoyu: 50, toplam: satirlar.length });
const MADDELER: KapanisCevabi['maddeler'] = [
  { madde: 'is-emirleri', durum: 'tamam', ayrinti: '6 / 6 adım tamam' },
  { madde: 'sevkiyat', durum: 'eksik', ayrinti: '80 / 120 çıktı' },
  { madde: 'ncr', durum: 'bilinmiyor', ayrinti: null },
];
const KAPANIS = {
  uretimEmriId: 1, emirNo: 'UE-0001', urun: { kod: 'M-1', ad: 'Deneme mil' }, emirTuru: 'seri', adet: 120, saglamAdet: 120,
  bitis: '2026-10-28T08:00:00.000Z', asama: 'onay', sonuc: null, eski: false, maddeler: MADDELER.map((m) => ({ ...m, durum: m.durum === 'eksik' ? 'muaf' : m.durum })),
  onaylar: { kalite: null, mudur: null }, muafiyetler: [{ madde: 'sevkiyat', gerekce: 'Müşteri teslim aldı', kisiId: 5, kisiAdi: 'Deneme Müdür', zaman: '2026-10-28T09:00:00.000Z' }],
  defter: [], surum: 3,
} satisfies KapanisCevabi;
const kullanici = (...ek: Islem[]) => ({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'uretim-emirleri.kapanis-oku' as const, ...ek] });
const ekran = [{ yol: '/uretim-emirleri/kapanis', ekran: KapanisOnaylari }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kapanış onayları', () => {
  it('onay yetkisi olmayan (planlama) açık kapanışları görür; seçilen emirde onay düğmesi yoktur', async () => {
    const istekler = sunucuKur(kullanici(), {
      'GET /kapanislar': () => json(200, liste([SATIR, SADECE_MUDUR])),
      'GET /adimli-emirler/1/kapanis': () => json(200, KAPANIS),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    expect(await screen.findByText('UE-0002')).toBeTruthy();
    expect(istekler.find((i) => i.yol.startsWith('/kapanislar'))?.yol).toBe('/kapanislar?sayfa=1');
    expect(await screen.findByText('Kapanışta: kalite ve müdür onayı')).toBeTruthy();
    expect(screen.getByText('Kalite rolündeki kişi onaylar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kaliteyi onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Geri gönder' })).toBeNull();
  });

  it('kalite açılışta yalnız kendi onayını bekleyenleri görür ve onayı sürümle gönderir', async () => {
    const istekler = sunucuKur(kullanici('uretim-emirleri.kapanis-kalite'), {
      'GET /kapanislar': () => json(200, liste([SATIR, SADECE_MUDUR])),
      'GET /adimli-emirler/1/kapanis': () => json(200, KAPANIS),
      'POST /adimli-emirler/1/kapanis/kalite-onay': () => json(200, { ...KAPANIS, surum: 4 }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    const tablo = await screen.findByRole('table', { name: 'Onay kuyruğu' });
    expect(within(tablo).getByText('UE-0001')).toBeTruthy();
    expect(within(tablo).queryByText('UE-0002')).toBeNull();
    expect(istekler.find((i) => i.yol.startsWith('/kapanislar'))?.yol).toBe('/kapanislar?sayfa=1&asama=onay');
    fireEvent.click(await screen.findByRole('button', { name: 'Kaliteyi onayla' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ not: null, surum: 3 });
    expect(screen.queryByRole('button', { name: 'Müdür olarak onayla' })).toBeNull();
  });

  it('geri gönderme gerekçe ister; boşken istek gitmez', async () => {
    const istekler = sunucuKur(kullanici('uretim-emirleri.kapanis-kalite'), {
      'GET /kapanislar': () => json(200, liste([SATIR])),
      'GET /adimli-emirler/1/kapanis': () => json(200, KAPANIS),
      'POST /adimli-emirler/1/kapanis/kalite-ret': () => json(200, { ...KAPANIS, asama: 'belge', surum: 4 }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Geri gönder' }));
    expect(await screen.findByText('Gerekçe yaz.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(screen.getByLabelText('Kalite onayı notu'), { target: { value: '  ölçü raporu eksik ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Geri gönder' }));
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ gerekce: 'ölçü raporu eksik', surum: 3 }); });
  });

  it('iki rolü olan kişi iki onayı da verebilir (1077 teyit)', async () => {
    sunucuKur(kullanici('uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-onay'), {
      'GET /kapanislar': () => json(200, liste([SATIR])),
      'GET /adimli-emirler/1/kapanis': () => json(200, { ...KAPANIS, onaylar: { kalite: { kisiId: 9, kisiAdi: 'Deneme Okuyucu', zaman: '2026-10-28T09:10:00.000Z' }, mudur: null } }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    expect(await screen.findByText(/Deneme Okuyucu onayladı/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Müdür olarak onayla' })).toBeTruthy();
  });

  it('belge aşamasında müdür eksik maddeyi gerekçeyle muaf tutar; kalite tutamaz', async () => {
    const belge = { ...KAPANIS, asama: 'belge', maddeler: MADDELER, muafiyetler: [] } satisfies KapanisCevabi;
    const istekler = sunucuKur(kullanici('uretim-emirleri.kapanis-onay'), {
      'GET /kapanislar': () => json(200, liste([{ ...SATIR, asama: 'belge', bekleyenOnaylar: [], eksikMadde: 1 }])),
      'GET /adimli-emirler/1/kapanis': () => json(200, belge),
      'POST /adimli-emirler/1/kapanis/muaf': () => json(200, { ...KAPANIS, surum: 4 }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    expect(await screen.findByText(/1 madde eksik: kapanış onaya açılmaz/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Müdür olarak onayla' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Muafiyet gerekçesi'), { target: { value: 'Müşteri teslim aldı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eksik maddeyi gerekçeyle muaf tut' }));
    await waitFor(() => {
      expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ gerekce: 'Müşteri teslim aldı', madde: 'sevkiyat', surum: 3 });
    });
    cleanup();
    sunucuKur(kullanici('uretim-emirleri.kapanis-kalite'), {
      'GET /kapanislar': () => json(200, liste([])), 'GET /adimli-emirler/1/kapanis': () => json(200, belge),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    expect(await screen.findByText('Onayınızı bekleyen kapanış yok.')).toBeTruthy();
    expect((await screen.findAllByText('Maddeler tamamlanınca onaya açılır.')).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Eksik maddeyi gerekçeyle muaf tut' })).toBeNull();
  });

  it('tamamlanan emri yalnız müdür gerekçeyle geri açar; sağlamsız sonuç kendi adıyla görünür', async () => {
    const tamam = {
      ...KAPANIS, asama: 'tamam', sonuc: 'saglamsiz', saglamAdet: 0,
      onaylar: { kalite: { kisiId: 3, kisiAdi: null, zaman: '2026-10-28T09:00:00.000Z' }, mudur: { kisiId: 5, kisiAdi: 'Deneme Müdür', zaman: '2026-10-28T09:30:00.000Z' } },
    } satisfies KapanisCevabi;
    const istekler = sunucuKur(kullanici('uretim-emirleri.kapanis-onay'), {
      'GET /kapanislar': () => json(200, liste([])), 'GET /adimli-emirler/1/kapanis': () => json(200, tamam),
      'POST /adimli-emirler/1/kapanis/geri-ac': () => json(200, { ...KAPANIS, surum: 4 }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    expect((await screen.findAllByText('Kapandı (sağlamsız)')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Kişi 3 onayladı/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Geri açma gerekçesi'), { target: { value: 'Ölçü yeniden alınacak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerekçeyle geri aç' }));
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ gerekce: 'Ölçü yeniden alınacak', surum: 3 }); });
  });

  it('sürüm çakışmasında hata bildirilir ve kapanış yeniden okunur', async () => {
    let okuma = 0;
    sunucuKur(kullanici('uretim-emirleri.kapanis-kalite'), {
      'GET /kapanislar': () => json(200, liste([SATIR])),
      'GET /adimli-emirler/1/kapanis': () => { okuma += 1; return json(200, KAPANIS); },
      'POST /adimli-emirler/1/kapanis/kalite-onay': () => json(409, { kod: 'SURUM_CAKISMASI', mesaj: 'Kayıt başkası tarafından değiştirildi.' }),
    });
    ac(ekran, '/uretim-emirleri/kapanis?emir=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Kaliteyi onayla' }));
    expect(await screen.findByText('Kayıt başkası tarafından değiştirildi.')).toBeTruthy();
    await waitFor(() => { expect(okuma).toBe(2); });
  });
});

describe('kapanış görünümü', () => {
  it('kuyruk aşaması, üst rozet, bekleme ve defter metinleri', () => {
    expect(kuyrukAsamasi(SATIR)).toBe('Kalite + Müdür bekliyor');
    expect(kuyrukAsamasi({ ...SATIR, asama: 'belge', bekleyenOnaylar: [], eksikMadde: 2 })).toBe('Belge kontrolü · 2 eksik');
    expect(kuyrukAsamasi({ ...SATIR, asama: 'tamam', sonuc: 'tamamlandi', bekleyenOnaylar: [] })).toBe('Tamamlandı');
    expect(ustRozet({ ...KAPANIS, onaylar: { kalite: { kisiId: 1, kisiAdi: null, zaman: KAPANIS.bitis }, mudur: null } }).metin).toBe('Kapanışta: müdür onayı');
    expect(ustRozet({ ...KAPANIS, asama: 'belge' })).toEqual({ metin: 'Kapanışta: belge kontrolü', ton: 'uyari' });
    expect(beklemeGunu('2026-10-26T08:00:00.000Z', new Date('2026-10-28T09:00:00.000Z'))).toBe(2);
    expect(beklemeGunu('2026-10-29T08:00:00.000Z', new Date('2026-10-28T09:00:00.000Z'))).toBe(0);
    const satir = { kisiId: 5, kisiAdi: null, zaman: KAPANIS.bitis, madde: null, gerekce: 'Fazla parça' };
    expect(defterMetni({ ...satir, olay: 'mudur_ret' })).toBe('Müdür geri gönderdi (Kişi 5): Fazla parça. Verilmiş onaylar düştü.');
    expect(defterMetni({ ...satir, olay: 'muaf', madde: 'sevkiyat' })).toBe('Müdür muaf tuttu (Sevkiyat: sipariş adedi depodan çıktı, Kişi 5): Fazla parça');
    expect(defterMetni({ ...satir, olay: 'kalite_onay', gerekce: null })).toBe('Kalite onayı: Kişi 5.');
  });
});
