import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LogoFisBilgisi, MalzemeFisiAyrintiCevabi, MalzemeFisiListeSatiri, MalzemeFisiOzeti, MalzemeFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const GONDEREN: Kullanici = { ...DEPOCU, islemler: [...DEPOCU.islemler, 'stok.malzeme-fisi-gonder'] };
const logo = (ek: Partial<LogoFisBilgisi> = {}): LogoFisBilgisi =>
  ({ durum: 'bekliyor', gonderimSekli: 'otomatik', neden: null, kayitNo: null, sonDeneme: null, sonrakiDeneme: null, denemeSayisi: 0, ardisikHata: 0, ...ek });
const FIS: MalzemeFisiOzeti = {
  id: 7, no: 'UE-2026-0012', tur: 'sarf', acilis: '2026-10-24T09:15:00+03:00', uretimEmriId: 12, emirNo: 'UE-2026-0012', satirSayisi: 2, gonderimIstegi: null,
  logo: logo(), gonderilebilir: false, surum: 3,
};
const liste = (satirlar: (MalzemeFisiOzeti | MalzemeFisiListeSatiri)[]) =>
  ({ satirlar: satirlar.map((f) => ({ irsaliyeNo: null, ...f })), toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 }) satisfies MalzemeFisleriCevabi;
const ayrinti = (fis: MalzemeFisiOzeti): MalzemeFisiAyrintiCevabi => ({
  fis,
  satirlar: [
    { malzemeId: 901, stokKodu: 'HM-001', malzemeAd: 'Deneme sac', birim: 'kg', miktar: '4.5', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null },
    { malzemeId: 902, stokKodu: null, malzemeAd: null, birim: null, miktar: '1', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null },
  ],
  hareketler: [],
});

describe('Malzeme fişleri', () => {
  it('listeler: tür, kaynak emir, satır, Logo durumu; tür sekmesi ve Logo süzgeci sorguya gider', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzeme-fisleri': () => json(200, liste([FIS, { ...FIS, id: 8, no: 'SE-000008', tur: 'sayim_eksigi', uretimEmriId: null, emirNo: null, satirSayisi: 0, logo: logo({ durum: 'gonderilmez', gonderimSekli: 'kapali' }) }])) });
    ac('/stok/malzeme-fisleri');
    expect(await screen.findByRole('link', { name: 'UE-2026-0012' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Emir UE-2026-0012' }).getAttribute('href')).toBe('/uretim-emirleri/12');
    expect(screen.getByText('SE-000008')).toBeTruthy();
    expect(screen.getAllByText('Bekliyor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gönderilmez').length).toBe(2);
    expect(screen.getByText('Boş')).toBeTruthy();
    for (const tablo of screen.getAllByRole('table', { name: 'Belgeler' })) {
      expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
      expect(within(tablo).getByRole('columnheader', { name: 'Belge no' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Fire' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('tur=fire'))).toBe(true));
    fireEvent.change(screen.getByRole('combobox', { name: /Logo durumu/ }), { target: { value: 'hata' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('logoDurumu=hata'))).toBe(true));
  });

  // 515 a: mal kabul belgesi listede ayrı türdür; ayrıntısı Mal kabul ekranında, Logo'ya gitmez.
  it('mal kabul satırı: no Mal kabul ayrıntısına gider, kaynak irsaliye no; Mal kabul sekmesi sorguya gider', async () => {
    const MK: MalzemeFisiListeSatiri = {
      ...FIS, id: 31, no: 'MK-000031', tur: 'mal_kabul', uretimEmriId: null, emirNo: null, satirSayisi: 1, irsaliyeNo: 'IRS-DNM-1', surum: 1,
      logo: logo({ durum: 'gonderilmez', gonderimSekli: null, neden: "Mal kabul Logo'ya fiş olarak gitmez." }),
    };
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzeme-fisleri': () => json(200, liste([MK, { ...FIS, id: 31 }])) });
    ac('/stok/malzeme-fisleri');
    expect((await screen.findByRole('link', { name: 'MK-000031' })).getAttribute('href')).toBe('/stok/mal-kabul/31');
    expect(screen.getByRole('link', { name: 'UE-2026-0012' }).getAttribute('href')).toBe('/stok/malzeme-fisleri/31');
    expect(screen.getByText('İrsaliye IRS-DNM-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Mal kabul' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('tur=mal_kabul'))).toBe(true));
  });

  // 2023 b: teslim fişi, toplama listesi ve hareket fişi aynı listede; her biri kendi ekranında açılır.
  it('teslim fişi, toplama ve hareket fişi kendi ekranına gider; Hareket fişi sekmesi sorguya gider', async () => {
    const yok = logo({ durum: 'gonderilmez', gonderimSekli: null, neden: "Logo'ya gitmez." });
    const ortak = { ...FIS, uretimEmriId: null, emirNo: null, satirSayisi: 1, irsaliyeNo: null, surum: 1, logo: yok };
    const satirlar: MalzemeFisiListeSatiri[] = [
      { ...ortak, id: 41, no: 'TF-000041', tur: 'teslim_fisi' },
      { ...ortak, id: 42, no: 'TL-000042', tur: 'toplama' },
      { ...ortak, id: 43, no: 'HF-000043', tur: 'hareket_fisi' },
    ];
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzeme-fisleri': () => json(200, liste(satirlar)) });
    ac('/stok/malzeme-fisleri');
    expect(await screen.findByRole('heading', { name: 'Belgeler' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'TF-000041' })).getAttribute('href')).toBe('/stok/fisler/41');
    expect(screen.getByRole('link', { name: 'TL-000042' }).getAttribute('href')).toBe('/stok/hazirlik/42');
    expect(screen.getByRole('link', { name: 'HF-000043' }).getAttribute('href')).toBe('/stok/hareketler?metin=HF-000043');
    expect(screen.getByText('Hazırlık')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Hareket fişi' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('tur=hareket_fisi'))).toBe(true));
  });

  it('boş listede uydurmaz, söyler', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-fisleri': () => json(200, liste([])) });
    ac('/stok/malzeme-fisleri');
    expect(await screen.findByText('Bu süzgece uyan belge yok.')).toBeTruthy();
  });

  it('ayrıntı: satırlar ve kartı ya da birimi olmayan satırın uyarısı; yetkisi olmayana Gönder görünmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzeme-fisleri/7': () => json(200, ayrinti({ ...FIS, gonderilebilir: true, logo: logo({ durum: 'hata', neden: 'Kart Logo\'da yok' }) })) });
    ac('/stok/malzeme-fisleri/7');
    expect(await screen.findByText('Sarf fişi UE-2026-0012')).toBeTruthy();
    expect(screen.getByText('HM-001')).toBeTruthy();
    expect(screen.getByText('Kart kodu yok')).toBeTruthy();
    expect(screen.getByText('Birim yok')).toBeTruthy();
    expect(screen.getByText('Kart Logo\'da yok')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /gönder/i })).toBeNull();
  });

  it('hatalı fişte Yeniden gönder onayla sürümü gönderir', async () => {
    const istekler = sunucuKur(GONDEREN, {
      'GET /stok/malzeme-fisleri/7': () => json(200, ayrinti({ ...FIS, gonderilebilir: true, logo: logo({ durum: 'hata', neden: 'Logo reddetti' }) })),
      'POST /stok/malzeme-fisleri/7/gonder': () => json(200, { ...FIS, gonderimIstegi: '2026-10-24T10:00:00+03:00', surum: 4 } satisfies MalzemeFisiOzeti),
    });
    ac('/stok/malzeme-fisleri/7');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeniden gönder' }));
    expect(screen.getByText(/iki kez açılabilir/)).toBeTruthy();
    const pencere = screen.getAllByRole('button', { name: 'Yeniden gönder' });
    fireEvent.click(pencere[pencere.length - 1]!);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ surum: 3 }));
  });

  it('gönderilemeyen fişte (Logo durumu izin vermiyor) yetkili de düğme görmez', async () => {
    sunucuKur(GONDEREN, { 'GET /stok/malzeme-fisleri/7': () => json(200, ayrinti({ ...FIS, logo: logo({ durum: 'gonderildi', kayitNo: '55' }) })) });
    ac('/stok/malzeme-fisleri/7');
    expect(await screen.findByText('Logo kayıt no:')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /gönder/i })).toBeNull();
  });
});
