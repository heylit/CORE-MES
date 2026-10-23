import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { useDenetim } from './baglam.tsx';
import { depoOku } from './normalize.ts';
import { baglamlaAc, ekraniAc, ornekDepo, sahteSunucu, YONETICI } from './test-ortak.tsx';
import { CATISMA_ILETISI, YAZMA_GECIKMESI_MS } from './veri.ts';
import { yikiciIzinli } from './yonetim.ts';
import { YER_TUTUCU_ILETISI } from './YerTutucu.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

const YAZAR: Kullanici = { id: 7, ad: 'Deneme Yazar', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim-hazirlik.yonet'] };

describe('DenetimYeni kapı ve kabuk', () => {
  it('kapı işlemi olmayan kişide (modülün bütün işlemleri olsa da) açılmaz', async () => {
    sahteSunucu({ kullanici: YAZAR });
    ekraniAc();
    expect(await screen.findByText(YENI_EKRAN_ILETISI)).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Bölümler' })).toBeNull();
  });

  it('yöneticide bölümleri, kayıt durumunu ve görünümü açar; kök adres Bugün\'e gider', async () => {
    sahteSunucu();
    ekraniAc('/denetim-hazirlik/yeni');
    expect(await screen.findByRole('tablist', { name: 'Bölümler' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bugün' })).toBeTruthy();
    expect(screen.getByText('Kaydedildi')).toBeTruthy();
    expect(screen.getByText(YER_TUTUCU_ILETISI)).toBeTruthy();
    expect(screen.getByRole('button', { name: /diğer işlemler/ })).toBeTruthy();
  });

  it('Denetimler bölümünde program ve program sekmeleri; alt sekme yalnız iki görünümlü sekmede', async () => {
    sahteSunucu();
    ekraniAc('/denetim-hazirlik/yeni/simulasyon');
    expect(await screen.findByRole('tablist', { name: 'Program' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Değerlendirme', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Simülasyon', selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'AS9100' }));
    expect(await screen.findByRole('heading', { name: /AS9100D: Simülasyon/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Rehber' }));
    expect(await screen.findByRole('heading', { name: /Denetim rehberi/ })).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Alt sekmeler' })).toBeNull();
  });

  it('bilinmeyen görünüm adresi Bugün\'e döner', async () => {
    sahteSunucu();
    ekraniAc('/denetim-hazirlik/yeni/yok-boyle');
    expect(await screen.findByRole('heading', { name: 'Bugün' })).toBeTruthy();
  });
});

function Yazici({ etiket }: { etiket: string | null }) {
  const d = useDenetim();
  return (
    <>
      <p>{d.profil.profile.firma || 'adsız'}</p>
      <p>{d.kayit}</p>
      <p>{d.yetki.yazabilir ? 'yazar' : 'okur'}</p>
      <p>{yikiciIzinli(d.yetki) ? 'yikici' : 'yikici-yok'}</p>
      <button type="button" onClick={() => { d.degistir(etiket, (t) => { t.profile.firma = 'Yeni Ad'; }); }}>yaz</button>
      <button type="button" onClick={d.geriAl}>geri</button>
    </>
  );
}

describe('veri katmanı', () => {
  it('değişiklik gecikmeyle, sürüm denetimiyle yazılır; geri al önceki hâli yazar', async () => {
    const depo = ornekDepo();
    const sunucu = sahteSunucu({ depo });
    await baglamlaAc(<Yazici etiket="Firma adı değişti" />);
    expect(await screen.findByText('adsız')).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('yaz'));
    expect(screen.getByText('Yeni Ad')).toBeTruthy();
    expect(screen.getByText('bekliyor')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS + 10); });
    expect(sunucu.yazilanlar).toHaveLength(1);
    expect(sunucu.yazilanlar[0]?.beklenenSurum).toBe(1);
    expect(depoOku(sunucu.yazilanlar[0]?.deger ?? null).data[depo.active]?.profile.firma).toBe('Yeni Ad');
    expect(screen.getByText('kayitli')).toBeTruthy();
    expect(screen.getByText('Firma adı değişti')).toBeTruthy();
    fireEvent.click(screen.getByText('geri'));
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS + 10); });
    expect(screen.getByText('adsız')).toBeTruthy();
    expect(sunucu.yazilanlar[1]?.beklenenSurum).toBe(2);
  });

  it('başkası yazdıysa yazma durur ve kişiye söylenir', async () => {
    const sunucu = sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<Yazici etiket={null} />);
    await screen.findByText('adsız');
    sunucu.disaridanYaz(ornekDepo());
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('yaz'));
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS + 10); });
    expect(screen.getByText('catisma')).toBeTruthy();
    expect(screen.getByText(CATISMA_ILETISI)).toBeTruthy();
    fireEvent.click(screen.getByText('yaz'));
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS * 3); });
    expect(sunucu.yazilanlar).toHaveLength(1);
  });

  it('sunucu yetkiyi reddederse değişiklik kaydedilmedi denir, döngüye girmez', async () => {
    const sunucu = sahteSunucu({ depo: ornekDepo(), yazmaDurumu: 403 });
    await baglamlaAc(<Yazici etiket={null} />);
    await screen.findByText('adsız');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('yaz'));
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS * 4); });
    expect(screen.getByText('yetkisiz')).toBeTruthy();
    expect(sunucu.yazilanlar).toHaveLength(1);
  });
});

describe('yetki (izinli ve reddedilen)', () => {
  it('yazma yetkisi olmayan kişide değişiklik yapılmaz, istek gitmez; Geri al menüsü yok', async () => {
    const sunucu = sahteSunucu({ depo: ornekDepo(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Yazici etiket={null} />);
    expect(await screen.findByText('okur')).toBeTruthy();
    expect(screen.getByText('yikici-yok')).toBeTruthy();
    fireEvent.click(screen.getByText('yaz'));
    expect(screen.getByText('adsız')).toBeTruthy();
    await waitFor(() => { expect(sunucu.yazilanlar).toHaveLength(0); });
    cleanup();
    sahteSunucu({ yazabilir: false, yonetici: false });
    ekraniAc();
    await screen.findByRole('tablist', { name: 'Bölümler' });
    expect(screen.queryByRole('button', { name: /diğer işlemler/ })).toBeNull();
  });

  it('yöneticide yıkıcı işlemler izinli, yazarda değil', async () => {
    sahteSunucu({ depo: ornekDepo(), yazabilir: true, yonetici: false, kullanici: YONETICI });
    await baglamlaAc(<Yazici etiket={null} />);
    expect(await screen.findByText('yazar')).toBeTruthy();
    expect(screen.getByText('yikici-yok')).toBeTruthy();
    cleanup();
    sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<Yazici etiket={null} />);
    expect(await screen.findByText('yikici')).toBeTruthy();
  });
});
