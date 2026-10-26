import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import type { OnizlemeCevabi, PlanCevabi, PlanGostergeleri, PlanYerlesimi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { Proje } from '#paylasilan/sozlesme/projeler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { AdimliEmirAyrintisi, AdimliEmirOzeti } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { PartiPaneli, birlesmeHedefleri, bolunebilirAdimlar, dalSirasi } from './PartiPaneli.tsx';
import type {
  AgacCevabi, KomutCevabi, RevizyonAyrintisi, RevizyonOzeti, RotaListesiCevabi, SablonlarCevabi, SeceneklerCevabi, TalimatlarCevabi, UrunOzeti, UrunRevizyonlariCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { TUM_BOLUMLER } from './bolumler.ts';
import { rotalar } from './rotalar.tsx';
import { ac, json, sunucuKur, type Istek } from './test-ortak.tsx';

const PLANLAMA: Kullanici = { id: 7, ad: 'Deneme Planlama', islemler: ['sayfa.rota', 'rota.yaz', 'rota.talimat-yaz'] };
const MUDUR: Kullanici = { id: 8, ad: 'Deneme Müdür', islemler: ['sayfa.rota', 'rota.onayla'] };
const OKUYUCU: Kullanici = { id: 9, ad: 'Deneme Okuyucu', islemler: ['sayfa.rota'] };

const URUN: UrunOzeti = { id: 501, stokKodu: 'MM-MAM-00001', ad: 'Deneme mil', tur: 'mamul', stokBirimi: 'adet', onayDurumu: 'aktif' };
const HAMMADDE: UrunOzeti = { id: 601, stokKodu: 'HM-AAA-00001', ad: 'Deneme çubuk', tur: 'hammadde', stokBirimi: 'adet', onayDurumu: 'aktif' };
const ISTASYON = { id: 3, kod: 'T-01', ad: 'Deneme torna', aktif: true };
const MAKINE = { tur: 'makine' as const, id: 9, kod: 'M-01', ad: 'Deneme makine', aktif: true, istasyon: ISTASYON };
const KISI = { tur: 'kisi' as const, id: 7, kod: null, ad: 'Deneme usta', aktif: true, istasyon: null };
const FASONCU = { tur: 'fason' as const, id: 21, kod: null, ad: 'Deneme Kaplama', aktif: true, istasyon: null };

const SECENEKLER: SeceneklerCevabi = {
  operasyonTipleri: [
    { id: 1, kod: 'uretim', ad: 'Üretim', kisaltma: 'ÜRE', grup: 'TAL', grupAdi: 'Talaşlı imalat', aktif: true, varsayilanAyarDk: '30.00', varsayilanBirimDk: '2.0000', kullanim: 1 },
    { id: 2, kod: 'muayene', ad: 'Muayene', kisaltma: 'MUA', grup: 'KAL', grupAdi: 'Kalite kontrol', aktif: true, varsayilanAyarDk: null, varsayilanBirimDk: null, kullanim: 1 },
  ],
  istasyonlar: [{ ...ISTASYON, makineler: [MAKINE], kisiler: [] }],
  istasyonsuzKisiler: [KISI],
  fasonFirmalar: [FASONCU],
};

const rev = (id: number, harf: string, durum: RevizyonOzeti['durum'], surum = 2): RevizyonOzeti => ({
  id, harf, durum, surum, aciklama: null, acilma: '2026-10-01T08:00:00Z', onaylama: null, yururlugeAlma: null,
});

const ADIMLAR: RevizyonAyrintisi['adimlar'] = [
  {
    id: 1, opNo: 10, sira: 1, operasyonTipi: { id: 1, kod: 'uretim', ad: 'Üretim', kisaltma: 'ÜRE', aktif: true }, ad: 'Tornalama', kaynak: MAKINE,
    ayarSuresiDk: '30.00', birimSureDk: '2.0000', islemSuresiDk: '2.0000', degisimSuresiDk: null, degisimOraniYuzde: null, terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: '0.00', makineKullanimi: 'tek',
    enKucukParca: null, yenidenAyar: true, adaylar: [],
    bilesenler: [{ malzeme: HAMMADDE, miktar: '1.2500', fireYuzde: '0.00', toplamMiktar: '1.25' }], yanUrunler: [],
    akis: { tuketir: [], cikti: { tur: 'ara-hal', opNo: 10 } }, adimMiktari: '1', teorikSureDk: '32', talimat: { surum: 2, metin: 'Deneme talimat metni' },
  },
  {
    id: 2, opNo: 20, sira: 2, operasyonTipi: { id: 2, kod: 'muayene', ad: 'Muayene', kisaltma: 'MUA', aktif: true }, ad: 'Son muayene', kaynak: null,
    ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: null, degisimSuresiDk: null, degisimOraniYuzde: null, terminGun: null, bagimlilik: 'akisli', devirAdedi: 5, firePayiYuzde: '0.00', makineKullanimi: 'tek', enKucukParca: null,
    yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [], akis: { tuketir: [10], cikti: { tur: 'urun' } }, adimMiktari: '1',
    teorikSureDk: null, talimat: null,
  },
];

const ayrinti = (r: RevizyonOzeti, komutlar: RevizyonAyrintisi['komutlar']): RevizyonAyrintisi => ({
  urun: URUN,
  revizyon: {
    ...r, kaynak: null, acan: { id: 7, ad: 'Deneme Planlama' }, gonderen: null, gonderme: null, onaylayan: null,
    dortGozsuzOnay: false, yururlugeAlan: null, iptalEden: null, iptalEtme: null, duzenleyenler: [],
  },
  adimlar: ADIMLAR,
  miktar: '1',
  ozet: { toplamTeorikSureDk: null, enUzunAdimOpNo: 10, adimSayisi: 2, fasonTerminGunu: null },
  komutlar,
});

const LISTE: RotaListesiCevabi = { rotalar: [{ urun: URUN, yururlukte: { id: 11, harf: 'A' }, acik: null, revizyonSayisi: 1 }] };
const TALIMATLAR: TalimatlarCevabi = {
  surumler: [{ surum: 2, metin: 'Deneme talimat metni', yazan: { id: 7, ad: 'Deneme Planlama' }, yazma: '2026-10-05T09:00:00Z' }],
};
const AGAC: AgacCevabi = {
  urun: URUN, miktar: '1',
  dugumler: [{ derinlik: 1, ust: null, malzeme: HAMMADDE, opNo: 10, birimMiktar: '1.25', fireYuzde: '0', toplamMiktar: '1.25', revizyon: null }],
  toplamlar: [{ malzeme: HAMMADDE, miktar: '1.25' }],
};
const sablonAdimi = (sira: number, ad: string) => ({ sira, ad, operasyonTipi: { id: 1, kod: 'TRN', ad: 'Tornalama', aktif: true } });
const SABLONLAR: SablonlarCevabi = {
  sablonlar: [
    { id: 7, ad: 'Standart rota', varsayilan: true, surum: 1, adimlar: [sablonAdimi(1, 'Tornalama'), sablonAdimi(2, 'Muayene')] },
    { id: 8, ad: 'Kısa rota', varsayilan: false, surum: 1, adimlar: [sablonAdimi(1, 'Tornalama')] },
  ],
};
const komut = (id: number, durum: KomutCevabi['durum'], surum = 3) => () => json(200, { id, durum, surum } satisfies KomutCevabi);

// Ürünün revizyonları ve gösterilen revizyonun ayrıntısı; açık taslak açılınca (13) o da sunulur.
function yollar(revizyonlar: RevizyonOzeti[], komutlar: RevizyonAyrintisi['komutlar'], ek: Record<string, (g: unknown) => Response> = {}) {
  const urunCevabi: UrunRevizyonlariCevabi = { urun: URUN, revizyonlar, taslakAcilabilir: true, kartOperasyonlari: null };
  const y: Record<string, (g: unknown) => Response> = {
    'GET /rota/urunler': () => json(200, LISTE),
    'GET /rota/secenekler': () => json(200, SECENEKLER),
    'GET /rota/sablonlar': () => json(200, SABLONLAR),
    'GET /rota/urunler/501': () => json(200, urunCevabi),
    'GET /rota/urunler/501/talimatlar/10': () => json(200, TALIMATLAR),
    'GET /rota/revizyonlar/11/agac': () => json(200, AGAC),
    'GET /rota/revizyonlar/12/agac': () => json(200, AGAC),
    'GET /rota/revizyonlar/12/fark': () => json(200, { karsilastirilan: { id: 11, harf: 'A' }, farklar: ['OP 20 eklendi: Son muayene'] }),
    ...ek,
  };
  for (const r of revizyonlar) y[`GET /rota/revizyonlar/${r.id}`] = () => json(200, ayrinti(r, r.durum === 'taslak' ? komutlar : komutlar.filter((k) => k !== 'kaydet')));
  y['GET /rota/revizyonlar/13'] = () => json(200, ayrinti(rev(13, 'B', 'taslak', 1), ['kaydet', 'onaya-gonder', 'iptal', 'kopyala']));
  return y;
}

// Stok mal kabul ekranının yeri: yalnız gelen emir parametresini gösterir.
function MalKabulYeri() { return <p>{`Mal kabul ${new URLSearchParams(useLocation().search).get('emir')}`}</p>; }
const postlar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Kaynaklar ve Rota revizyonları bölümleri', () => {
  const TAKVIM = {
    vardiyalar: [{ id: 5, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 3, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 }],
    matris: [{ isMerkeziId: 1, gun: 1, vardiyaId: 5 }], gunler: [], isMerkezleri: [{ id: 1, kod: 'IM-1', ad: 'Deneme merkez', aktif: true, haftalikDakika: 450 }],
    kadro: [], kisiVardiyalari: [], bugun: '2026-10-10',
  } satisfies TakvimCevabi;
  const KAYNAK = {
    'GET /is-merkezleri': () => json(200, { isMerkezleri: [{ id: 1, kod: 'IM-1', ad: 'Deneme merkez', aciklama: null, aktif: true, surum: 2 }] }),
    'GET /istasyonlar': () => json(200, { istasyonlar: [{
      id: 3, kod: 'T-01', ad: 'Deneme torna', isMerkeziId: 1, tip: 'talasli', aktif: true, surum: 4, sorumluKisiId: 7, sorumluAd: 'Deneme Sorumlu', kapasiteKaynagi: 'makine',
    }] }),
    'GET /makineler': () => json(200, { makineler: [{ id: 9, kod: 'M-1', ad: 'Deneme makine', tur: null, markaModel: null, seriNo: null, istasyonId: 3, baglantiTuru: null, baglantiAdresi: null, aktif: true }] }),
    'GET /istasyon-plan-ayarlari': () => json(200, { ayarlar: [] }),
    'GET /makine-durumlari': () => json(200, { durumlar: [] }),
    'GET /vardiya-takvimi': () => json(200, TAKVIM),
    'GET /operasyon-tipleri': () => json(200, { operasyonTipleri: [{
      id: 1, kod: 'TRN', ad: 'Üretim', grup: 'TAL', kisaltma: 'ÜRE', varsayilanAyarDk: null, varsayilanBirimDk: null, varsayilanIstasyonId: null, aktif: true, surum: 3,
    }] }),
    'GET /rota/secenekler': () => json(200, SECENEKLER),
    'GET /rota/urunler': () => json(200, LISTE),
  };
  const YONETEN: Kullanici = { id: 4, ad: 'Deneme Planlama', islemler: ['sayfa.rota', 'istasyonlar.yaz', 'vardiya.yaz'] };

  // Tek düzenleme yeri: vardiya ve kişi vardiyası Vardiya'da, istasyonun plan ayarı ve makine durumu İstasyonlar'da yazılır; Kaynaklar yalnız okur.
  it('VR-01, IS-05: Kaynaklar vardiya düzenini yalnız gösterir ve Vardiya sayfasına götürür; makine durumu İstasyonlar\'a götürür; hiçbir şey yazılmaz', async () => {
    const istekler = sunucuKur(YONETEN, {
      ...KAYNAK,
      'GET /makine-durumlari': () => json(200, { durumlar: [{
        makineId: 9, durum: 'ariza', aciklama: null, degistiren: { id: 4, ad: 'Deneme Planlama' }, degisme: '2026-10-10T08:00:00Z', surum: 2,
      }] }),
    });
    ac(rotalar, '/rota/kaynaklar');
    fireEvent.click(await screen.findByRole('button', { name: 'Vardiyalar' }));
    expect((await screen.findByRole('link', { name: 'Vardiya' })).getAttribute('href')).toBe('/vardiya');
    expect(screen.queryByRole('button', { name: 'Gündüz 12:00 molasını kaldır' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vardiya' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Makineler/ }));
    const durum = await screen.findByRole('link', { name: "M-1 durumu Arıza, İstasyonlar'da düzenlenir" });
    expect(durum.getAttribute('href')).toBe('/istasyonlar/makineler');
    expect(screen.queryByRole('group', { name: 'M-1 durumu' })).toBeNull();
    expect(postlar(istekler)).toEqual([]);
  });

  // Karar 102 a: Ctrl K yalnız kabuğun ortak paletidir; bölüm, emir, malzeme ve istasyon orada bulunur.
  it('Ctrl K modülde pencere açmaz ve tuşu kabuğa bırakır; başka tuş da pencere açmaz', async () => {
    sunucuKur(YONETEN, KAYNAK);
    ac(rotalar, '/rota/kaynaklar');
    await screen.findByRole('button', { name: 'Vardiyalar' });
    const ctrlK = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ctrlK);
    expect(ctrlK.defaultPrevented).toBe(false);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog', { name: 'Hızlı git' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Hızlı git' })).toBeNull();
  });

  it('#439, #441: plan ayarı ve kişinin vardiyası gösterilir, sahibinin sayfasına götürür; Personelde yetkinlik istasyon istasyon açılıp kapanır', async () => {
    let yetkin: { kisiId: number; istasyonIdleri: number[] }[] = [];
    const istekler = sunucuKur(YONETEN, {
      ...KAYNAK,
      'GET /istasyon-plan-ayarlari': () => json(200, { ayarlar: [{
        istasyonId: 3, verimYuzde: '90.00', operatorIhtiyaci: '1.00', degistiren: { id: 4, ad: 'Deneme Planlama' }, degisme: '2026-10-10T08:00:00Z', surum: 6,
      }] }),
      'GET /vardiya-takvimi': () => json(200, { ...TAKVIM, kisiVardiyalari: [{ kisiId: 7, vardiyaId: 5 }] }),
      'GET /kisiler': () => json(200, { kisiler: [{ id: 7, ad: 'Deneme usta', aktif: true, girisVar: false, sicilNo: null, gorev: null, roller: [], surum: 1 }] }),
      'GET /kisi-is-merkezleri/7': () => json(200, { isMerkeziIdleri: [] }),
      'GET /kisi-yetkinlikleri': () => json(200, { yetkinlikler: yetkin }),
      'POST /kisi-yetkinlikleri/7/belirle': () => json(200, { istasyonIdleri: [3] }),
    });
    ac(rotalar, '/rota/kaynaklar');
    fireEvent.click(await screen.findByRole('button', { name: 'İş merkezleri ve istasyonlar' }));
    const verim = await screen.findByRole('link', { name: "T-01 verim 90, İstasyonlar'da düzenlenir" });
    expect(verim.getAttribute('href')).toBe('/istasyonlar/is-merkezleri');
    expect(screen.getByRole('link', { name: "T-01 operatör: 1 operatör/makine, İstasyonlar'da düzenlenir" }).getAttribute('href')).toBe('/istasyonlar/is-merkezleri');
    expect(screen.queryByLabelText('T-01 verim')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Personel' }));
    const grup = await screen.findByRole('group', { name: 'Deneme usta yetkinliği' });
    expect(within(grup).getByText('tanımsız')).toBeTruthy();
    yetkin = [{ kisiId: 7, istasyonIdleri: [3] }];
    fireEvent.click(within(grup).getByRole('button', { name: 'T-01' }));
    await waitFor(() => expect(postlar(istekler)[0]).toMatchObject({ yol: '/kisi-yetkinlikleri/7/belirle', govde: { istasyonIdleri: [3] } }));
    await waitFor(() => expect(within(grup).getByRole('button', { name: 'T-01' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(within(grup).getByRole('button', { name: 'T-01' }));
    await waitFor(() => expect(postlar(istekler)[1]).toMatchObject({ yol: '/kisi-yetkinlikleri/7/belirle', govde: { istasyonIdleri: [] } }));
    const vardiya = screen.getByRole('link', { name: 'Deneme usta vardiyası, Vardiya başına personel sayfasında düzenlenir' });
    expect([vardiya.getAttribute('href'), vardiya.textContent?.trim()]).toEqual(['/vardiya/personel', 'Gündüz']);
    expect(postlar(istekler)).toHaveLength(2);
  });

  it('R11, 240 a: eski rota tanım adresleri "Ürün ve rotalar" görünümüne, eski plan, stüdyo ve kanban Reçete ve Rota\'daki karşılığına gider', async () => {
    function ReceteRotaYeri() { return <p>{`Reçete ve Rota ${useLocation().pathname}`}</p>; }
    const ekranlar = [...rotalar, ...['/recete-rota/schema', '/recete-rota/plan', '/recete-rota/studio', '/recete-rota/kanban'].map((yol) => ({ yol, ekran: ReceteRotaYeri }))];
    const hedefler: [string, string][] = [
      ['/rota', '/recete-rota/schema'], ['/rota/501', '/recete-rota/schema'], ['/rota/operasyonlar', '/recete-rota/schema'], ['/rota/sablonlar', '/recete-rota/schema'],
      ['/rota/plan', '/recete-rota/plan'], ['/rota/plan-studyosu', '/recete-rota/studio'], ['/rota/kanban', '/recete-rota/kanban'],
    ];
    for (const [adres, hedef] of hedefler) {
      sunucuKur(PLANLAMA, { ...KAYNAK, 'GET /rota/urunler': () => json(200, LISTE) });
      ac(ekranlar, adres);
      expect(await screen.findByText(`Reçete ve Rota ${hedef}`), adres).toBeTruthy();
      cleanup();
    }
  });

  it('IS-02: Kaynaklarda istasyon adı okunan sürümle ve sorumlusu, kapasite kaynağı korunarak güncellenir', async () => {
    const istekler = sunucuKur(YONETEN, { ...KAYNAK, 'POST /istasyonlar/3/guncelle': () => json(200, {}) });
    ac(rotalar, '/rota/kaynaklar');
    fireEvent.click(await screen.findByRole('button', { name: 'İş merkezleri ve istasyonlar' }));
    const ad = await screen.findByLabelText('T-01 adı');
    fireEvent.change(ad, { target: { value: 'Yeni torna' } });
    fireEvent.blur(ad);
    await waitFor(() => expect(postlar(istekler).length).toBe(1));
    expect(postlar(istekler)[0]).toEqual({
      yontem: 'POST', yol: '/istasyonlar/3/guncelle',
      govde: { kod: 'T-01', ad: 'Yeni torna', isMerkeziId: 1, tip: 'talasli', aktif: true, sorumluKisiId: 7, kapasiteKaynagi: 'makine', surum: 4 },
    });
  });
});

describe('Üretim emirleri bölümü', () => {
  const OZET: AdimliEmirOzeti = {
    id: 70, emirNo: 'UE-000070', urun: { id: 501, kod: 'MM-MAM-00001', ad: 'Deneme mil' }, adet: 5, oncelik: 2, baslangic: '2026-10-08', teslim: '2026-10-20',
    durum: 'basladi', arsiv: false, kaynakRotaRevizyonId: 11, adimSayisi: 2, tamamAdim: 1,
    siradaki: { id: 702, opNo: 20, ad: 'Son muayene', kaynak: null, istasyon: null, durum: 'bekliyor' }, aciklama: null, acilma: '2026-10-07T08:00:00Z', surum: 3,
  };
  const TASLAK_EMIR: AdimliEmirOzeti = { ...OZET, id: 69, emirNo: 'UE-000069', durum: 'taslak', tamamAdim: 0, surum: 1 };
  const isEmri = (id: number, opNo: number, ek: Partial<AdimliEmirAyrintisi['isEmirleri'][number]>): AdimliEmirAyrintisi['isEmirleri'][number] => ({
    id, opNo, sira: opNo / 10, tip: { id: 1, ad: 'Üretim', kod: 'uretim' }, ad: 'Tornalama', kaynak: null, istasyon: null, ayarSuresiDk: '30.00', birimSureDk: '2.0000',
    terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: 2, durum: 'bekliyor', baslama: null, bitis: null, saglamAdet: null, bilesenler: [], adaylar: [],
    fason: null, ...ek,
  });
  const AYRINTI: AdimliEmirAyrintisi = {
    ...OZET, eski: null,
    isEmirleri: [
      isEmri(701, 10, { kaynak: { tur: 'makine', id: 9, kod: 'M-01', ad: 'Deneme makine' }, istasyon: { id: 3, kod: 'T-01', ad: 'Deneme torna' }, durum: 'tamam', saglamAdet: 5 }),
      isEmri(702, 20, { ad: 'Son muayene', bagimlilik: 'akisli', devirAdedi: 5 }),
    ],
  };
  const YAZAN: Kullanici = { id: 4, ad: 'Deneme Planlama', islemler: ['sayfa.rota', 'uretim-emirleri.yaz', 'rota.emre-kopyala'] };

  it('185 a: Parti panelinde bölme formu yok; bölünebilen emirde plan motoruna götürür, birleştirme panelde kalır', async () => {
    sunucuKur(YAZAN, {});
    const Panel = () => <PartiPaneli d={AYRINTI} emirler={[OZET]} yaz ac={() => undefined} />;
    const Konum = () => <p>Konum {useLocation().pathname}</p>;
    ac([{ yol: '/plan', ekran: Panel }, { yol: '/recete-rota', ekran: Konum }], '/plan');
    const grup = await screen.findByRole('group', { name: 'Parti' });
    expect(within(grup).queryByRole('button', { name: /Partiyi böl/ })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Partiyi böl' })).toBeNull();
    fireEvent.click(within(grup).getByRole('button', { name: /Plan motorunda böl/ }));
    expect(await screen.findByText('Konum /recete-rota')).toBeTruthy();
  });

  it('#262, #689, Soru 121 a: bitmemiş ve sonrası başlamamış her adımdan bölünür; birleşme hedefi üst ya da aynı adımdan bölünmüş açık kardeştir, kaynağın ek adımı bitmiş olmalı', () => {
    const adim = (durum: 'bekliyor' | 'calisiyor' | 'tamam', sira: number) => isEmri(700 + sira, sira * 10, { durum });
    const d = (isEmirleri: AdimliEmirAyrintisi['isEmirleri'], ek: Partial<AdimliEmirAyrintisi> = {}): AdimliEmirAyrintisi => ({ ...AYRINTI, isEmirleri, ...ek });
    const siralar = (x: AdimliEmirAyrintisi) => bolunebilirAdimlar(x).map((a) => a.sira);
    expect(siralar(d([adim('tamam', 1), adim('bekliyor', 2), adim('bekliyor', 3)]))).toEqual([2, 3]);
    expect(siralar(d([adim('bekliyor', 2), adim('bekliyor', 1)]))).toEqual([1, 2]);
    // PB-K2: önceki adım çalışırken de sonraki başlamamış adımdan bölünür; çalışan adımın kendisi de (Soru 121 a).
    expect(siralar(d([adim('calisiyor', 1), adim('bekliyor', 2), adim('bekliyor', 3)]))).toEqual([1, 2, 3]);
    // Soru 121 a: çalışan adımın üretilmemiş adedi bölünür; arkasında başlamış adım varsa bölünmez.
    expect(siralar(d([adim('tamam', 1), adim('calisiyor', 2)]))).toEqual([2]);
    expect(siralar(d([adim('tamam', 1), adim('bekliyor', 2), adim('calisiyor', 3)]))).toEqual([3]);
    expect(siralar(d([adim('calisiyor', 1), adim('calisiyor', 2)]))).toEqual([2]);
    expect(siralar(d([adim('tamam', 1)]))).toEqual([]);
    expect(siralar(d([adim('bekliyor', 1)], { durum: 'bitti' }))).toEqual([]);
    expect(siralar(d([adim('bekliyor', 1)], { arsiv: true }))).toEqual([]);

    const p = (ustEmirId: number | null, bolunmeSira: number | null, altEmirIdleri: number[] = [], birlestigiEmirId: number | null = null) => ({ ustEmirId, bolunmeSira, altEmirIdleri, birlestigiEmirId });
    const o = (id: number, parti: AdimliEmirOzeti['parti'], ek: Partial<AdimliEmirOzeti> = {}): AdimliEmirOzeti => ({ ...OZET, id, parti, ...ek });
    const liste = [o(70, p(null, null, [71, 72, 73])), o(71, p(70, 2)), o(72, p(70, 2)), o(73, p(70, 3)), o(74, p(70, 2), { durum: 'iptal' }), o(75, p(71, 3)), o(76, p(70, 2), { arsiv: true })];
    const hedefler = (ek: Partial<AdimliEmirAyrintisi>, sira = 2) => birlesmeHedefleri(d([adim('bekliyor', sira)], ek), liste).map((e) => e.id);
    expect(hedefler({ id: 71, parti: p(70, 2) })).toEqual([70, 72]);
    // Üst OP 20'de bekliyor, OP 30'dan bölünen parti henüz birleşemez.
    expect(hedefler({ id: 73, parti: p(70, 3) }, 3)).toEqual([]);
    expect(hedefler({ id: 70, parti: p(null, null, [71]) })).toEqual([]);
    expect(hedefler({ id: 71, parti: p(70, 2, [75]) })).toEqual([]);
    expect(hedefler({ id: 71, parti: p(70, 2), durum: 'bitti' })).toEqual([]);
    expect(hedefler({ id: 71 })).toEqual([]);
    // Sunucunun reddedeceği hedef gösterilmez: üst başka adımda ya da adımı başlamış, taslaklık farklı, kaynak kendisi başlamış.
    const ileride = liste.map((e) => (e.id === 70 ? { ...e, siradaki: { ...OZET.siradaki!, durum: 'calisiyor' as const } } : e.id === 72 ? { ...e, siradaki: { ...OZET.siradaki!, opNo: 30 } } : e));
    expect(birlesmeHedefleri(d([adim('bekliyor', 2)], { id: 71, parti: p(70, 2) }), ileride)).toEqual([]);
    expect(hedefler({ id: 71, parti: p(70, 2), durum: 'taslak' })).toEqual([]);
    expect(birlesmeHedefleri(d([adim('calisiyor', 2)], { id: 71, parti: p(70, 2) }), liste)).toEqual([]);
    // Kaynağın bitmemiş rework, tamir ya da ek adımı varsa birleşmez; bitmişse kalan rota adımının op numarasıyla eşleşir.
    const ekli = (durum: 'bekliyor' | 'tamam') => d([isEmri(790, 15, { sira: 1, tur: 'rework', durum }), { ...adim('bekliyor', 2), sira: 2 }], { id: 71, parti: p(70, 2) });
    expect(birlesmeHedefleri(ekli('tamam'), liste).map((e) => e.id)).toEqual([70, 72]);
    // Sıradaki adım eşleşse de ardında bitmemiş ek adım varsa birleşmez.
    const ardinda = d([adim('bekliyor', 2), isEmri(791, 25, { sira: 3, tur: 'ek' })], { id: 71, parti: p(70, 2) });
    expect(birlesmeHedefleri(ardinda, liste)).toEqual([]);
    expect(birlesmeHedefleri(ekli('bekliyor'), liste)).toEqual([]);


    expect(dalSirasi(liste.slice(0, 6).reverse()).map(({ e, derinlik }) => `${e.id}:${derinlik}`)).toEqual(['70:0', '74:1', '73:1', '72:1', '71:1', '75:2']);
    expect(dalSirasi([o(75, p(71, 3)), o(80, undefined)]).map(({ e, derinlik }) => `${e.id}:${derinlik}`)).toEqual(['75:0', '80:0']);
  });
});
