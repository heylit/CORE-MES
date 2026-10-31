import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { eskiAdresHedefi } from './DenetimYeni.tsx';
import { useDenetim } from './baglam.tsx';
import { depoOku, yeniDenetim } from './normalize.ts';
import { bugunTarihi, gunEkle } from './tarih.ts';
import { baglamlaAc, ekraniAc, ornekDepo, sahteSunucu, YONETICI } from './test-ortak.tsx';
import { CATISMA_ILETISI, YAZMA_GECIKMESI_MS } from './veri.ts';
import { yikiciIzinli } from './yonetim.ts';

// Kabuk testi parçaların içeriğinden bağımsızdır: parça ekranları kendi adını yazan sahte bileşenle değiştirilir; parça dosyasını
// doldurunca bu test kırılmaz.
vi.mock('./bugun/index.tsx', () => ({ Bugun: () => <p>parca:Bugun</p> }));
vi.mock('./program/index.tsx', () => Object.fromEntries(
  ['GenelBakis', 'Simulasyon', 'OzDegerlendirme', 'HaftalikProgram', 'MulakatKartlari', 'Aksiyonlar', 'Rehber'].map((ad) => [ad, () => <p>{`parca:${ad}`}</p>]),
));
vi.mock('./kys/index.tsx', () => ({ Kys: () => <p>parca:Kys</p> }));
vi.mock('./ic-denetim/index.tsx', () => ({ IcDenetim: () => <p>parca:IcDenetim</p> }));
vi.mock('./takvim/index.tsx', () => ({ Takvim: () => <p>parca:Takvim</p> }));
vi.mock('./performans/index.tsx', () => ({ Performans: () => <p>parca:Performans</p> }));
vi.mock('./kalibrasyon/index.tsx', () => ({ Kalibrasyon: () => <p>parca:Kalibrasyon</p> }));
vi.mock('./ayarlar/index.tsx', () => ({ Ayarlar: () => <p>parca:Ayarlar</p> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

const YAZAR: Kullanici = { id: 7, ad: 'Deneme Yazar', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim-hazirlik.yonet'] };

const OKUR: Kullanici = { id: 8, ad: 'Deneme Okur', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku'] };
const YETKISIZ: Kullanici = { id: 9, ad: 'Deneme Yetkisiz', islemler: ['sayfa.kalibrasyon'] };

describe('DenetimYeni giriş ve kabuk', () => {
  it('yeni ekran kapısı istemez: sayfa yetkisi olan yönetici olmayan kişide de açılır (1392 a)', async () => {
    sahteSunucu({ kullanici: YAZAR, yonetici: false });
    ekraniAc();
    expect(await screen.findByRole('tablist', { name: 'Bölümler' })).toBeTruthy();
    expect(screen.queryByText(YENI_EKRAN_ILETISI)).toBeNull();
  });

  it('okuma yetkisi olan kişide de açılır; giriş işlemi olmayana yetki iletisi, uca istek gitmez', async () => {
    sahteSunucu({ kullanici: OKUR, yazabilir: false, yonetici: false });
    ekraniAc('/denetim-hazirlik');
    expect(await screen.findByRole('tablist', { name: 'Bölümler' })).toBeTruthy();
    cleanup();
    const sunucu = sahteSunucu({ kullanici: YETKISIZ });
    ekraniAc('/denetim-hazirlik');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    expect(sunucu.istekler.some((i) => i.includes('/denetim-hazirlik/'))).toBe(false);
  });

  it('menünün kökü yönlenmeden Bugün\'ü açar; görünüme geçince ekran yeniden yüklenmez', async () => {
    const sunucu = sahteSunucu();
    ekraniAc('/denetim-hazirlik');
    expect(await screen.findByText('parca:Bugun')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Bugün', selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Takvim' }));
    expect(await screen.findByText('parca:Takvim')).toBeTruthy();
    expect(sunucu.istekler.filter((i) => i === 'GET /denetim-hazirlik/ben')).toHaveLength(1);
  });

  it('eski adresin görünüm parçası (#kalib) yeni görünüm adresine gider', async () => {
    expect(eskiAdresHedefi('/denetim-hazirlik', '#kalib')).toBe('/denetim-hazirlik/yeni/kalibrasyon');
    expect(eskiAdresHedefi('/denetim-hazirlik/', '#home')).toBe('/denetim-hazirlik/yeni/bugun');
    expect(eskiAdresHedefi('/denetim-hazirlik', '#yok')).toBeNull();
    expect(eskiAdresHedefi('/denetim-hazirlik/yeni/kys', '#kalib')).toBeNull();
    sahteSunucu();
    ekraniAc('/denetim-hazirlik#perf');
    expect(await screen.findByText('parca:Performans')).toBeTruthy();
  });

  it('yöneticide bölümleri, kayıt durumunu ve görünümü açar; kök adres Bugün\'e gider', async () => {
    sahteSunucu();
    ekraniAc('/denetim-hazirlik/yeni');
    expect(await screen.findByRole('tablist', { name: 'Bölümler' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bugün' })).toBeTruthy();
    expect(screen.getByText('Kaydedildi')).toBeTruthy();
    expect(screen.getByText('parca:Bugun')).toBeTruthy();
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
    expect(screen.getByText('parca:Simulasyon')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Rehber' }));
    expect(await screen.findByRole('heading', { name: /Denetim rehberi/ })).toBeTruthy();
    expect(screen.getByText('parca:Rehber')).toBeTruthy();
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

  it('açılış kendiliğinden yazmaz; haftalık programın çapası kişinin ilk değişikliğiyle aynı yazmada kaydedilir', async () => {
    const depo = ornekDepo();
    const tarih = gunEkle(bugunTarihi(), 45);
    const profil = depo.data[depo.active];
    profil?.audits.push(yeniDenetim({ prog: profil.prog, type: '1. gözetim', date: tarih, status: 'plan' }));
    const sunucu = sahteSunucu({ depo });
    await baglamlaAc(<Yazici etiket={null} />);
    await screen.findByText('adsız');
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS * 3); });
    expect(sunucu.yazilanlar).toHaveLength(0);
    expect(screen.getByText('kayitli')).toBeTruthy();
    fireEvent.click(screen.getByText('yaz'));
    await act(async () => { await vi.advanceTimersByTimeAsync(YAZMA_GECIKMESI_MS + 10); });
    expect(sunucu.yazilanlar).toHaveLength(1);
    const yazilan = depoOku(sunucu.yazilanlar[0]?.deger ?? null).data[depo.active];
    expect(yazilan?.profile.firma).toBe('Yeni Ad');
    expect(yazilan?.pw[profil?.prog ?? 'iso9001'].wkAnchor.ad).toBe(tarih);
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

function Secenekli() {
  const d = useDenetim();
  return (
    <>
      <p>{d.profil.profile.firma || 'adsız'}</p>
      <p>{`dok:${d.ekran.kys.dok ?? ''} yeni:${String(d.ekran.takvim?.yeniDenetim ?? false)} sekme:${d.ekran.kys.tab}`}</p>
      <p>{d.geriAlinabilir ? 'geri-alinabilir' : 'geri-yok'}</p>
      <button type="button" onClick={() => { d.degistir('Puan', (t) => { t.profile.firma = 'Sessiz'; }, { sessiz: true }); }}>sessiz</button>
      <button type="button" onClick={() => { d.degistir('Firma', (t) => { t.profile.firma = 'Metinli'; }, { bildirim: 'Firma adı kaydedildi' }); }}>metinli</button>
      <button type="button" onClick={() => { d.git('kys', { kys: 'uret', dokuman: 'd1' }); }}>dokuman</button>
      <button type="button" onClick={() => { d.git('takvim', { yeniDenetim: true }); }}>takvim</button>
    </>
  );
}

describe('bağlam seçenekleri (P1 R1-R2, P2 F19, P1 F5)', () => {
  it('sessiz değişiklik bildirim çıkarmaz ama geri alınabilir; bildirim metni etiketten ayrı verilebilir', async () => {
    sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<Secenekli />);
    await screen.findByText('adsız');
    fireEvent.click(screen.getByText('sessiz'));
    expect(screen.getByText('Sessiz')).toBeTruthy();
    expect(screen.queryByText('Puan')).toBeNull();
    expect(screen.getByText('geri-alinabilir')).toBeTruthy();
    fireEvent.click(screen.getByText('metinli'));
    expect(screen.getByText('Firma adı kaydedildi')).toBeTruthy();
    expect(screen.queryByText('Firma')).toBeNull();
  });

  it('git belirli dokümanı ve yeni denetim formunu ekran durumuna yazar', async () => {
    sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<Secenekli />);
    expect(await screen.findByText('dok: yeni:false sekme:nedir')).toBeTruthy();
    fireEvent.click(screen.getByText('dokuman'));
    expect(screen.getByText('dok:d1 yeni:false sekme:uret')).toBeTruthy();
    fireEvent.click(screen.getByText('takvim'));
    expect(screen.getByText('dok:d1 yeni:true sekme:uret')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /diğer işlemler/ }));
    expect(screen.getByRole('menuitem', { name: /Yardım/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Geri al/ })).toBeNull();
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
