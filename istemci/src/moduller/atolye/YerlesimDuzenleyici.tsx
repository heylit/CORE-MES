import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FabrikaKayitCevabi, IhlalAyrintisi, KayitCevabi, MerkezModeli, SurumCakismasi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Istasyon, IstasyonTipi, IstasyonlarCevabi, Makine, MakinelerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  PALET_GRUPLARI, bulgulariEsle, dondur, duvarUcuTasi, eksenKutusu, fabrikaGovdesi, fabrikaTaslagiKur, gecmisKur, gecmiseYaz, gecmisiDegistir, geriAl,
  govdeyeCevir, guncelle, istasyonCiz, istasyonEkle, izgarayaOtur, kaldir, kapsamKutusu, konumu, makineCiz, makineEkle, ogeCiz, ogeEkle, taslakKur, tasi, yinele,
} from './duzenleyici-durumu.ts';
import { bolumeCevir, fabrikayaCevir, konumOku } from './fabrika.ts';
import type { EklenecekTur, Gecmis, Taslak } from './duzenleyici-durumu.ts';
import { ISTASYON_TIPI_ADI, MAKINE_CINSI_ADI, eklenebilirIstasyonlar, makineCinsi, ornekIstasyonMu, saatMetni } from './kurallar.ts';
import { useDepoYazimi } from './depo-yazimi.ts';
import { OgeSimgesi } from './plan-simgeleri.tsx';
import { OzellikPaneli } from './OzellikPaneli.tsx';
import { PlanCizimi } from './PlanCizimi.tsx';
import { fabrikaKaydet, krokiHizala, useKroki, useMerkezModelleri, useModeller } from './veri.ts';
import {
  dondur as krokiDondur, eksenOturt, hizalamaYuvarla, ilkHizalama, kutuyaYapis, metreMetni, noktayaTasi, noktayaYapis, olcekAyarla,
  tasi as krokiTasi, uzaklik, yapismaVerisiKur, yerelle, yerlestir,
} from './kroki.ts';
import type { Hizalama, Nokta, NoktaYapismasi } from './kroki.ts';
import { KrokiPaneli, useKrokiAltligi } from './KrokiPaneli.tsx';
import type { HizaAdimi } from './KrokiPaneli.tsx';
import { EkKroki, KrokiAltligi, StudyoUstu } from './KrokiKatmani.tsx';

// Model kütüphanesi three ve STEP çeviricisini getirir: yalnız açılınca iner.
const ModelKutuphanesi = lazy(() => import('./ModelKutuphanesi.tsx').then((m) => ({ default: m.ModelKutuphanesi })));
import type { GorunumKutusu } from './PlanCizimi.tsx';

// Depo kipinde palet yalnız rafları sunar.
const RAF_PALETI = PALET_GRUPLARI.flatMap((g) => {
  const ogeler = g.ogeler.filter((o) => o.tur.startsWith('raf_'));
  return ogeler.length > 0 ? [{ ...g, ogeler }] : [];
});

interface Ozellikler {
  // null: bütün fabrika (bölümler tek planda, toplu kayıt); dolu: tek bölüm.
  salonId: number | null;
  bolumler: readonly YerlesimCevabi[];
  kapat: () => void;
  kaydedildi: () => void;
}

const IZGARA_SECENEKLERI = [
  { deger: '0.1', baslik: '0,1 m' }, { deger: '0.25', baslik: '0,25 m' }, { deger: '0.5', baslik: '0,5 m' }, { deger: '1', baslik: '1 m' },
];
const ACI_SECENEKLERI = [{ deger: '5', baslik: '5°' }, { deger: '15', baslik: '15°' }, { deger: '45', baslik: '45°' }, { deger: '90', baslik: '90°' }];

type Surukleme =
  | { tur: 'oge'; anahtar: string; dx: number; dz: number; once: Taslak; kimlik: number }
  | { tur: 'ciz'; a: Nokta; kimlik: number }
  | { tur: 'kroki'; bas: Nokta; once: Hizalama; kimlik: number }
  | { tur: 'dondur'; anahtar: string; once: Taslak; kimlik: number; ilkAci: number; ilkDonus: number }
  | { tur: 'uc'; anahtar: string; uc: 'bas' | 'son'; once: Taslak; kimlik: number }
  | { tur: 'kaydir'; x: number; y: number; kutu: GorunumKutusu; kimlik: number };

interface Bulgular {
  ihlaller: { kural: string; mesaj: string; ogeler: string[] }[];
  uyarilar: { kural: string; mesaj: string; ogeler: string[] }[];
}

function sigdir(t: Taslak): GorunumKutusu {
  const k = kapsamKutusu(t);
  const pay = Math.max(2, Math.max(k.x1 - k.x0, k.z1 - k.z0) * 0.06) + (t.bolumler ? 3 : 0);
  return { x: k.x0 - pay, y: k.z0 - pay, g: k.x1 - k.x0 + pay * 2, d: k.z1 - k.z0 + pay * 2 };
}

// Stüdyo aracı: çizerek ekleme, ölçme ya da kroki hizalama adımı. Araç açıkken plana basmak seçmez, aracı kullanır.
type Arac =
  | { tur: 'ciz'; hedef: { oge: EklenecekTur } | { istasyon: Istasyon } | { makine: Makine; tip: IstasyonTipi | null }; ad: string }
  | { tur: 'olc' }
  | { tur: 'hiza'; adim: HizaAdimi };

const HIZA_SIRASI: HizaAdimi[] = ['olcek', 'yon', 'kose', 'salon'];
const YAPISMA_PIKSEL = 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

const donusAl = (t: Taslak, anahtar: string): number =>
  [...t.istasyonlar, ...t.makineler, ...t.raflar, ...t.alanlar].find((o) => o.anahtar === anahtar)?.donus ?? 0;

export function YerlesimDuzenleyici({ salonId, bolumler, kapat, kaydedildi }: Ozellikler) {
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const fabrikaMi = salonId === null;
  // Depo kipi (Stok Merkezi'nden, harita yetkisi olmadan): yalnız raflar eklenir, taşınır ve düzenlenir; kayıt yalnız rafları
  // gönderir, bölümün öbür öğeleri görünür ama dokunulmaz (kart #1304).
  const depo = useDepoYazimi();
  const yalnizRaf = depo !== null && salonId !== null;
  const dokunulur = (anahtar: string): boolean => !yalnizRaf || anahtar.startsWith('raf:');
  const yerlesim = salonId === null ? null : bolumler.find((b) => b.salon.id === salonId) ?? null;
  // Çizim Merkezi modeli yerleşim kaydına girmez: seçim hemen kaydedilir, panel burada izler.
  const [merkezModelleri, merkezModelleriYaz] = useState<ReadonlyMap<number, MerkezModeli | null>>(
    () => new Map(bolumler.flatMap((b) => b.istasyonYerleri.map((y) => [y.istasyonId, y.merkezModeli] as const))),
  );
  const [gecmis, gecmisYaz] = useState<Gecmis>(() => gecmisKur(yerlesim ? taslakKur(yerlesim) : fabrikaTaslagiKur(bolumler)));
  const t = gecmis.simdi;
  // Bölüm düzenlenirken fabrika krokisi (varsa) bölümün metresine getirilip altta gösterilir.
  const bolumYeri = useMemo(() => (yerlesim ? konumOku(yerlesim.salon) : null), [yerlesim]);
  const [ilkKutu] = useState(() => kapsamKutusu(gecmis.simdi));
  const [secili, seciliYaz] = useState<string | null>(null);
  const [paletAcik, paletAcikYaz] = useState(false);
  const [izgara, izgaraYaz] = useState(0.5);
  const [aci, aciYaz] = useState(15);
  const [kutu, kutuYaz] = useState<GorunumKutusu>(() => sigdir(t));
  const [bulgular, bulgularYaz] = useState<Bulgular>({ ihlaller: [], uyarilar: [] });
  const [bulguAcik, bulguAcikYaz] = useState(false);
  const [cakisma, cakismaYaz] = useState<SurumCakismasi | null>(null);
  const [vazgecOnayi, vazgecOnayiYaz] = useState(false);
  const [kutuphane, kutuphaneYaz] = useState(false);
  const modeller = useModeller();

  // ---------- kroki stüdyosu ----------
  const krokiSorgusu = useKroki(salonId);
  const kroki = krokiSorgusu.data?.kroki;
  const altlik = useKrokiAltligi(kroki);
  const [krokiAcik, krokiAcikYaz] = useState(false);
  const [krokiGorunur, krokiGorunurYaz] = useState(true);
  const [saydamlik, saydamlikYaz] = useState(0.7);
  const [yapis, yapisYaz] = useState(true);
  const [cizerekEkle, cizerekEkleYaz] = useState(true);
  const [arac, aracYaz] = useState<Arac | null>(null);
  const [noktalar, noktalarYaz] = useState<Nokta[]>([]);
  const [imlec, imlecYaz] = useState<NoktaYapismasi | null>(null);
  const [kilavuz, kilavuzYaz] = useState<{ x: number | null; z: number | null } | null>(null);
  const [cizim, cizimYaz] = useState<{ a: Nokta; b: Nokta } | null>(null);
  const [olcekGirdisi, olcekGirdisiYaz] = useState('');
  // Sürüklerken ve kayıt sürerken gösterilen hizalama (kayıt bitince sunucununki geçer).
  const [taslakHiza, taslakHizaYaz] = useState<Hizalama | null>(null);
  const sayfa = altlik.sayfa;
  const kh = kroki?.hizalama ?? null;
  const kayitliHiza = useMemo<Hizalama | null>(
    () => (kh ? { olcek: Number(kh.olcek), donus: Number(kh.donus), x: Number(kh.x), z: Number(kh.z) } : null),
    [kh?.olcek, kh?.donus, kh?.x, kh?.z],
  );
  const salonG = t.salon.genislik;
  const salonD = t.salon.derinlik;
  const geciciHiza = useMemo(() => {
    if (!sayfa) return null;
    const k = fabrikaMi ? ilkKutu : { x0: 0, z0: 0, x1: salonG, z1: salonD };
    const h = ilkHizalama({ g: sayfa.genislik, y: sayfa.yukseklik }, { g: k.x1 - k.x0, d: k.z1 - k.z0 });
    return { ...h, x: h.x + k.x0, z: h.z + k.z0 };
  }, [sayfa, salonG, salonD, fabrikaMi, ilkKutu]);
  const hiza = taslakHiza ?? kayitliHiza ?? geciciHiza;
  const yapismaVerisi = useMemo(() => (sayfa && hiza ? yapismaVerisiKur(sayfa.cizgiler, hiza) : null), [sayfa, hiza]);
  // Bir ekran pikselinin metresi (yapışma toleransı, işaret ve yazı boyu).
  const [pm, pmYaz] = useState(0.05);
  // getScreenCTM her ortamda yok (jsdom); yoksa ölçek eski değerinde kalır.
  const pmOlc = useCallback(() => {
    const el = svg.current;
    const m = el && typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
    if (m && m.a > 0) pmYaz(1 / m.a);
  }, []);
  useLayoutEffect(() => { pmOlc(); }, [kutu, pmOlc]);
  useEffect(() => {
    const yeniden = pmOlc;
    window.addEventListener('resize', yeniden);
    return () => window.removeEventListener('resize', yeniden);
  }, [pmOlc]);
  // İşaretçi olayları tek kez bağlanır; güncel değerler buradan okunur.
  const studyo = useRef({ veri: yapismaVerisi, yapis, pm, hiza });
  studyo.current = { veri: krokiGorunur ? yapismaVerisi : null, yapis, pm, hiza };

  const hizaKaydet = useMutation({
    mutationFn: (h: Hizalama) => {
      if (!kroki) throw new Error('Kroki yok.');
      return krokiHizala(salonId, { surum: kroki.surum, sayfa: kroki.sayfa, ...hizalamaYuvarla(h) });
    },
    onMutate: (h) => taslakHizaYaz(h),
    onSuccess: (yeni) => { istemci.setQueryData(anahtarlar.kroki(salonId), { kroki: yeni }); taslakHizaYaz(null); },
    onError: (hata) => {
      taslakHizaYaz(null);
      bildir('hata', hataIletisi(hata, 'Hizalama kaydedilemedi.'));
      void krokiSorgusu.refetch();
    },
  });

  // Noktayı krokiye (uç, sonra eksen) yapıştırır; olmazsa ızgaraya (çizimde) ya da serbest (hizalamada).
  const yakala = useCallback((n: Nokta, izgaraIle: boolean): NoktaYapismasi => {
    const s = studyo.current;
    if (s.yapis && s.veri) {
      const y = noktayaYapis(s.veri, n, YAPISMA_PIKSEL * s.pm);
      if (y.tur) return y;
    }
    return { nokta: izgaraIle ? { x: izgarayaOtur(n.x, izgara), z: izgarayaOtur(n.z, izgara) } : n, tur: null, kilavuzX: null, kilavuzZ: null };
  }, [izgara]);

  const aracBirak = useCallback(() => {
    aracYaz(null);
    noktalarYaz([]);
    imlecYaz(null);
    cizimYaz(null);
    olcekGirdisiYaz('');
  }, []);
  const adimBaslat = (a: HizaAdimi | null) => {
    noktalarYaz([]);
    olcekGirdisiYaz('');
    cizimYaz(null);
    aracYaz(a ? { tur: 'hiza', adim: a } : null);
    // Dar ekranda panel planı örter: adım başlayınca kapanır (adımlar araç çubuğundan sürer).
    if (a && window.matchMedia?.('(max-width: 1023px)').matches) krokiAcikYaz(false);
  };
  const sonrakiAdim = (a: HizaAdimi) => {
    const i = HIZA_SIRASI.indexOf(a);
    const s = HIZA_SIRASI[i + 1];
    adimBaslat(s ?? null);
  };
  const hizaUygula = (yeni: Hizalama, ileti: string, adim: HizaAdimi | null) => {
    hizaKaydet.mutate(yeni, { onSuccess: () => bildir('tamam', ileti) });
    if (adim) sonrakiAdim(adim); else aracBirak();
  };
  const svg = useRef<SVGSVGElement>(null);
  const surukleme = useRef<Surukleme | null>(null);
  const degisti = gecmis.onceki.length > 0;

  const istasyonlar = useQuery({
    queryKey: anahtarlar.istasyonlar,
    queryFn: () => api.get<IstasyonlarCevabi>('/istasyonlar'),
  });
  // Çizim Merkezi'nde makineyle eşleştirilen model (kart #1196): istasyon haritada yoksa "Ekle" listesinin başında modeliyle durur.
  const merkezListesi = useMerkezModelleri();
  const bekleyenModeller = useMemo(
    () => new Map((merkezListesi.data?.istasyonlar ?? []).map((i) => [i.istasyonId, i.merkezModeli] as const)),
    [merkezListesi.data],
  );
  // Çizimi henüz taslakta olan eşleşme (kart #1258): haritaya model gelmez, yayınlanınca görünür.
  const taslakModeller = useMemo(
    () => new Map((merkezListesi.data?.taslaklar ?? []).map((i) => [i.istasyonId, i.ad] as const)),
    [merkezListesi.data],
  );
  // Haritaya yalnız Çizim Merkezi'nde makineyle eşleşmiş istasyon eklenir; örnek istasyonlar "Örnek" etiketiyle eşleşmesiz de
  // eklenebilir. Daha önce yerleşmiş eşleşmesiz istasyon haritada kalır. Yerleşimi kullanıcı yapar (kart #1258).
  const { eklenecek, eslesmemis } = useMemo(() => {
    const yerlesik = new Set(t.istasyonlar.map((i) => i.istasyonId));
    const liste = (istasyonlar.data?.istasyonlar ?? []).filter((i) => !yerlesik.has(i.id));
    return eklenebilirIstasyonlar(liste, (id) => bekleyenModeller.has(id) || taslakModeller.has(id));
  }, [istasyonlar.data, t.istasyonlar, bekleyenModeller, taslakModeller]);
  const makineler = useQuery({
    queryKey: anahtarlar.makineler,
    queryFn: () => api.get<MakinelerCevabi>('/makineler'),
  });
  const istasyonTipi = useMemo(() => new Map((istasyonlar.data?.istasyonlar ?? []).map((i) => [i.id, i.tip] as const)), [istasyonlar.data]);
  const yerlesmemisMakineler = useMemo(() => {
    const yerlesik = new Set(t.makineler.map((m) => m.makineId));
    return (makineler.data?.makineler ?? []).filter((m) => m.aktif && !yerlesik.has(m.id));
  }, [makineler.data, t.makineler]);

  const yaz = useCallback((yeni: Taslak) => gecmisYaz((g) => gecmiseYaz(g, yeni)), []);
  // Eşleştirilmiş modeli olan istasyon yerleşince panel modeli hemen gösterir (bağ zaten Çizim Merkezi'nde).
  const bekleyenModeliAl = (istasyonId: number) => {
    const m = bekleyenModeller.get(istasyonId);
    if (m) merkezModelleriYaz((once) => (once.get(istasyonId) ? once : new Map(once).set(istasyonId, m)));
  };
  const istasyonDugmesi = (i: Istasyon) => {
    const model = bekleyenModeller.get(i.id);
    const taslak = model ? undefined : taslakModeller.get(i.id);
    const ornek = ornekIstasyonMu(i.kod);
    return (
      <Dugme
        key={i.id}
        className="tc-atolye-palet-oge"
        data-tur="istasyon"
        title={[i.ad, ornek ? 'Örnek makine' : null, ISTASYON_TIPI_ADI[i.tip], MAKINE_CINSI_ADI[makineCinsi(i.tip, i.ad)], model ? `3B model: ${model.ad} (Rev ${model.harf})` : null, taslak ? `3B model: ${taslak} (taslak)` : null].filter(Boolean).join(' · ')}
        onClick={() => {
          if (ciziliyor) {
            aracYaz({ tur: 'ciz', hedef: { istasyon: i }, ad: `${i.kod} · ${i.ad}` });
            seciliYaz(null);
            if (window.matchMedia?.('(max-width: 1023px)').matches) paletAcikYaz(false);
            return;
          }
          const m = merkez(); istasyonYerlestir(i, m.x, m.z);
        }}
      >
        <OgeSimgesi ad={makineCinsi(i.tip, i.ad)} />
        {i.kod} · {i.ad}
        {model && <span className="tc-atolye-palet-model" aria-label="3B modeli var"><Simge ad="cube" boyut="k" /></span>}
        {ornek && <span className="tc-atolye-palet-not">Örnek</span>}
        {taslak && <span className="tc-atolye-palet-not">Çizim yayınlanınca görünür</span>}
      </Dugme>
    );
  };
  const istasyonYerlestir = (i: Istasyon, x: number, z: number) => {
    const r = istasyonEkle(t, i, x, z); yaz(r.taslak); seciliYaz(r.anahtar);
    bekleyenModeliAl(i.id);
  };
  const isaretli = useMemo(() => new Set(bulgular.ihlaller.flatMap((b) => b.ogeler)), [bulgular]);

  // Bulgu anahtarları gönderilen gövdenin sırasına göredir; kayıt sürerken taslak değişse de o sırayla eşlenir.
  const gonderilenEslesme = useRef<Map<string, string>>(new Map());
  // Fabrikada her öğe ortasının düştüğü bölüme yazılır; hiçbir bölümün içinde olmayan öğe gönderilmeden işaretlenir.
  const kaydet = useMutation({
    mutationFn: async (): Promise<{ uyarilar: KayitCevabi['uyarilar']; eslesme: Map<string, string> } | null> => {
      if (salonId === null) {
        const h = fabrikaGovdesi(t);
        if (h.disarida.length > 0) {
          bulgularYaz({ ihlaller: [{ kural: 'Bölüm', mesaj: `${h.disarida.length} öğe hiçbir bölümün içinde değil; bir bölümün içine taşıyın.`, ogeler: h.disarida }], uyarilar: [] });
          bulguAcikYaz(true);
          return null;
        }
        gonderilenEslesme.current = h.eslesme;
        const c: FabrikaKayitCevabi = await fabrikaKaydet(h.govde);
        istemci.setQueryData(anahtarlar.fabrika, { bolumler: c.bolumler });
        return { uyarilar: c.uyarilar, eslesme: h.eslesme };
      }
      const { govde, eslesme } = govdeyeCevir(t);
      gonderilenEslesme.current = eslesme;
      const c = depo && yalnizRaf
        ? await depo.rafKaydet(salonId, { surum: govde.surum, raflar: govde.raflar })
        : await api.post<KayitCevabi>(`/atolye/salonlar/${salonId}/yerlesim-kaydet`, govde);
      istemci.setQueryData(anahtarlar.yerlesim(salonId), c);
      void istemci.invalidateQueries({ queryKey: anahtarlar.fabrika });
      return { uyarilar: c.uyarilar, eslesme };
    },
    onSuccess: (sonuc) => {
      if (!sonuc) { bildir('hata', 'Bölüm dışında kalan öğeler var; işaretli öğeleri bir bölüme taşıyın.'); return; }
      void istemci.invalidateQueries({ queryKey: anahtarlar.salonlar });
      void istemci.invalidateQueries({ queryKey: ['atolye', 'arama'] });
      void istemci.invalidateQueries({ queryKey: ['atolye', 'goz-kalemleri'] });
      const uyarilar = bulgulariEsle(sonuc.uyarilar, sonuc.eslesme);
      bildir('tamam', fabrikaMi ? 'Fabrika planı kaydedildi.' : 'Yerleşim kaydedildi.');
      // Uyarı kaydı engellemez (giriş noktası, yürüyüş yolu); kullanıcı hangi öğe olduğunu görür.
      for (const u of uyarilar) bildir('bilgi', `${u.kural}: ${u.mesaj}`);
      kaydedildi();
    },
    onError: (hata) => {
      if (hata instanceof ApiHatasi && hata.govde.kod === 'GECERSIZ' && hata.govde.ayrinti) {
        const ihlaller = bulgulariEsle((hata.govde.ayrinti as IhlalAyrintisi).ihlaller ?? [], gonderilenEslesme.current);
        bulgularYaz({ ihlaller, uyarilar: [] });
        bulguAcikYaz(true);
        bildir('hata', `${ihlaller.length} kural ihlali; işaretli öğeleri düzeltin.`);
        return;
      }
      if (hata instanceof ApiHatasi && hata.durum === 409 && hata.govde.ayrinti && typeof hata.govde.ayrinti === 'object' && 'guncelSurum' in hata.govde.ayrinti) {
        cakismaYaz(hata.govde.ayrinti as SurumCakismasi);
        return;
      }
      bildir('hata', hataIletisi(hata, 'Yerleşim kaydedilemedi.'));
    },
  });

  // ---------- işaretçi ----------

  const svgNoktasi = (o: { clientX: number; clientY: number }): { x: number; z: number } | null => {
    const el = svg.current;
    // getScreenCTM her ortamda yok (jsdom).
    const m = el && typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
    if (!el || !m) return null;
    const p = el.createSVGPoint();
    p.x = o.clientX;
    p.y = o.clientY;
    const s = p.matrixTransform(m.inverse());
    return { x: s.x, z: s.y };
  };

  // Araç açıkken plana basmak aracı kullanır (öğenin üstüne de çizilir).
  const aracBas = (o: ReactPointerEvent): boolean => {
    if (!arac) return false;
    const ham = svgNoktasi(o);
    if (!ham) return true;
    if (arac.tur === 'ciz') {
      const p = yakala(ham, true).nokta;
      surukleme.current = { tur: 'ciz', a: p, kimlik: o.pointerId };
      cizimYaz({ a: p, b: p });
      return true;
    }
    if (arac.tur === 'olc') {
      const p = yakala(ham, false).nokta;
      noktalarYaz((l) => (l.length === 1 ? [...l, p] : [p]));
      return true;
    }
    if (!hiza) return true;
    const p = yakala(ham, false).nokta;
    if (arac.adim === 'tasi') {
      surukleme.current = { tur: 'kroki', bas: ham, once: hiza, kimlik: o.pointerId };
      return true;
    }
    if (arac.adim === 'olcek') {
      const l = noktalar.length >= 2 ? [p] : [...noktalar, p];
      noktalarYaz(l);
      if (l.length === 2 && l[0]) olcekGirdisiYaz(r2(uzaklik(l[0], p)).toFixed(2));
      return true;
    }
    if (arac.adim === 'yon') {
      const a = noktalar[0];
      if (!a) { noktalarYaz([p]); return true; }
      hizaUygula(eksenOturt(hiza, a, p), 'Kroki eksene oturtuldu.', 'yon');
      return true;
    }
    // Fabrikada 3. ve 4. adım krokiyi değil seçili bölümü krokiye oturtur.
    if (t.bolumler) {
      const b = t.bolumler.find((o) => o.anahtar === secili);
      if (!b) { bildir('bilgi', 'Önce bölümü seçin (zeminine ya da başlığına dokunun), sonra krokide köşesine tıklayın.'); return true; }
      if (arac.adim === 'kose') {
        yaz(tasi(t, b.anahtar, r2(p.x), r2(p.z)));
        bildir('tamam', `${b.kod} bölümü krokideki köşesine taşındı; "Kaydet" ile saklanır.`);
        sonrakiAdim('kose');
        return true;
      }
      const y = bolumeCevir(b, p);
      const g = r2(y.x);
      const d = r2(y.z);
      if (g < 5 || d < 5 || g > 500 || d > 500) { bildir('hata', 'Bölüm ölçüsü 5 ile 500 m arasında olmalı; köşe sol üst köşenin sağında ve altında olmalı.'); return true; }
      yaz(guncelle(t, b.anahtar, { genislik: g, derinlik: d }));
      bildir('tamam', `${b.kod} ölçüsü ${metreMetni(g)} × ${metreMetni(d)}; "Kaydet" ile saklanır.`);
      aracBirak();
      return true;
    }
    if (arac.adim === 'kose') {
      hizaUygula(noktayaTasi(hiza, p), 'Kroki bölümün köşesine oturtuldu.', 'kose');
      return true;
    }
    // Bölüm ölçüsü: sağ alt iç köşe (yerleşim taslağına yazılır, "Kaydet" ile saklanır).
    const g = r2(p.x);
    const d = r2(p.z);
    if (g < 5 || d < 5 || g > 500 || d > 500) { bildir('hata', 'Bölüm ölçüsü 5 ile 500 m arasında olmalı; köşe sol üst köşenin sağında ve altında olmalı.'); return true; }
    if (g === t.salon.genislik && d === t.salon.derinlik) {
      bildir('tamam', `Bölüm ölçüsü krokiyle aynı (${metreMetni(g)} × ${metreMetni(d)}).`);
    } else {
      yaz({ ...t, salon: { ...t.salon, genislik: g, derinlik: d } });
      bildir('tamam', `Bölüm ölçüsü ${metreMetni(g)} × ${metreMetni(d)}; "Kaydet" ile saklanır.`);
    }
    aracBirak();
    return true;
  };

  const ogeBas = (anahtar: string, o: ReactPointerEvent) => {
    if (!dokunulur(anahtar)) { bosBas(o); return; }
    if (aracBas(o)) return;
    seciliYaz(anahtar);
    const n = svgNoktasi(o);
    const k = konumu(t, anahtar);
    if (!n || !k) return;
    surukleme.current = { tur: 'oge', anahtar, dx: n.x - k.x, dz: n.z - k.z, once: t, kimlik: o.pointerId };
  };
  const dondurBas = (anahtar: string, o: ReactPointerEvent) => {
    if (!dokunulur(anahtar)) return;
    const n = svgNoktasi(o);
    const k = konumu(t, anahtar);
    if (!n || !k) return;
    surukleme.current = { tur: 'dondur', anahtar, once: t, kimlik: o.pointerId, ilkAci: Math.atan2(n.z - k.z, n.x - k.x), ilkDonus: donusAl(t, anahtar) };
  };
  const ucBas = (anahtar: string, uc: 'bas' | 'son', o: ReactPointerEvent) => {
    if (!dokunulur(anahtar)) return;
    surukleme.current = { tur: 'uc', anahtar, uc, once: t, kimlik: o.pointerId };
  };
  const bosBas = (o: ReactPointerEvent) => {
    if (aracBas(o)) return;
    seciliYaz(null);
    surukleme.current = { tur: 'kaydir', x: o.clientX, y: o.clientY, kutu, kimlik: o.pointerId };
  };
  // Bölüm zemini: bölümü seçer, planı kaydırır (bölüm başlığından sürüklenir).
  const bolumBas = (anahtar: string, o: ReactPointerEvent) => {
    if (aracBas(o)) return;
    seciliYaz(anahtar);
    surukleme.current = { tur: 'kaydir', x: o.clientX, y: o.clientY, kutu, kimlik: o.pointerId };
  };

  // Sürükleme bitince: çizilen dikdörtgen öğe olur; sürüklenen kroki saklanır (güncel kapanışlar ref'ten).
  const cizimBitti = (a: Nokta, b: Nokta) => {
    if (arac?.tur !== 'ciz') return;
    const h = arac.hedef;
    const r = 'oge' in h ? ogeCiz(t, h.oge, a, b) : 'istasyon' in h ? istasyonCiz(t, h.istasyon, a, b) : makineCiz(t, h.makine, h.tip, a, b);
    if (!r) { bildir('bilgi', 'Çizim çok küçük: köşeden köşeye sürükleyin.'); return; }
    yaz(r.taslak);
    seciliYaz(r.anahtar);
    if ('istasyon' in h) bekleyenModeliAl(h.istasyon.id);
    // İstasyon ve makine bir kez yerleşir; tür (raf, bölge) art arda çizilebilir.
    if (!('oge' in h)) aracBirak();
  };
  const cizimBittiRef = useRef(cizimBitti);
  cizimBittiRef.current = cizimBitti;
  const hizaKaydetRef = useRef((h: Hizalama) => hizaKaydet.mutate(h));
  hizaKaydetRef.current = (h: Hizalama) => hizaKaydet.mutate(h);

  useEffect(() => {
    const hareket = (o: PointerEvent) => {
      const s = surukleme.current;
      if (!s || s.kimlik !== o.pointerId) return;
      if (s.tur === 'kaydir') {
        const el = svg.current;
        if (!el) return;
        const olcek = s.kutu.g / Math.max(1, el.clientWidth);
        kutuYaz({ ...s.kutu, x: s.kutu.x - (o.clientX - s.x) * olcek, y: s.kutu.y - (o.clientY - s.y) * olcek });
        return;
      }
      const n = svgNoktasi(o);
      if (!n) return;
      if (s.tur === 'ciz') {
        const b = yakala(n, true);
        imlecYaz(b);
        cizimYaz({ a: s.a, b: b.nokta });
        return;
      }
      if (s.tur === 'kroki') {
        taslakHizaYaz(krokiTasi(s.once, n.x - s.bas.x, n.z - s.bas.z));
        return;
      }
      const st = studyo.current;
      gecmisYaz((g) => {
        const temel = s.once;
        if (s.tur === 'oge') {
          const hx = n.x - s.dx;
          const hz = n.z - s.dz;
          let x = izgarayaOtur(hx, izgara);
          let z = izgarayaOtur(hz, izgara);
          // Krokiye yapışma: öğenin kenarı yakındaki paralel çizgiye kayar (ızgaranın önüne geçer).
          const kutu_ = st.yapis && st.veri ? eksenKutusu(tasi(temel, s.anahtar, hx, hz), s.anahtar) : null;
          if (kutu_ && st.veri) {
            const y = kutuyaYapis(st.veri, kutu_, YAPISMA_PIKSEL * st.pm);
            if (y.kilavuzX !== null) x = r2(hx + y.dx);
            if (y.kilavuzZ !== null) z = r2(hz + y.dz);
            kilavuzYaz(y.kilavuzX !== null || y.kilavuzZ !== null ? { x: y.kilavuzX, z: y.kilavuzZ } : null);
          }
          return gecmisiDegistir(g, tasi(temel, s.anahtar, x, z));
        }
        if (s.tur === 'uc') {
          const y = yakala(n, true).nokta;
          return gecmisiDegistir(g, duvarUcuTasi(temel, s.anahtar, s.uc, r2(y.x), r2(y.z)));
        }
        const k = konumu(temel, s.anahtar);
        if (!k) return g;
        const fark = ((Math.atan2(n.z - k.z, n.x - k.x) - s.ilkAci) * 180) / Math.PI;
        const hedef = Math.round((s.ilkDonus + fark) / aci) * aci;
        return gecmisiDegistir(g, dondur(temel, s.anahtar, hedef - s.ilkDonus));
      });
    };
    const birak = (o: PointerEvent) => {
      const s = surukleme.current;
      if (!s || s.kimlik !== o.pointerId) return;
      surukleme.current = null;
      kilavuzYaz(null);
      if (s.tur === 'kaydir') return;
      if (s.tur === 'kroki') {
        const n = svgNoktasi(o);
        if (n) hizaKaydetRef.current(krokiTasi(s.once, n.x - s.bas.x, n.z - s.bas.z));
        return;
      }
      if (s.tur === 'ciz') {
        const n = svgNoktasi(o);
        cizimYaz(null);
        if (n) cizimBittiRef.current(s.a, yakala(n, true).nokta);
        return;
      }
      // Sürüklemenin tamamı tek geri alma adımıdır.
      gecmisYaz((g) => (g.simdi === s.once ? g : gecmiseYaz({ ...g, simdi: s.once }, g.simdi)));
    };
    window.addEventListener('pointermove', hareket);
    window.addEventListener('pointerup', birak);
    window.addEventListener('pointercancel', birak);
    return () => {
      window.removeEventListener('pointermove', hareket);
      window.removeEventListener('pointerup', birak);
      window.removeEventListener('pointercancel', birak);
    };
  }, [izgara, aci, yakala]);

  const yakinlas = useCallback((carpan: number, merkez?: { x: number; z: number }) => {
    kutuYaz((k) => {
      const cx = merkez?.x ?? k.x + k.g / 2;
      const cz = merkez?.z ?? k.y + k.d / 2;
      const g = Math.min(Math.max(k.g * carpan, 4), 1200);
      const d = (k.d / k.g) * g;
      return { x: cx - ((cx - k.x) / k.g) * g, y: cz - ((cz - k.y) / k.d) * d, g, d };
    });
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const tekerlek = (o: WheelEvent) => {
      o.preventDefault();
      const n = svgNoktasi(o);
      yakinlas(o.deltaY > 0 ? 1.12 : 1 / 1.12, n ?? undefined);
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, [yakinlas]);

  // Klavye: sil, ok tuşlarıyla ızgara adımı kadar kaydır, R ile döndür, Ctrl+Z / Ctrl+Y.
  const tus = (o: ReactKeyboardEvent) => {
    if ((o.target as HTMLElement).closest('input, select, textarea')) return;
    if ((o.ctrlKey || o.metaKey) && o.key.toLowerCase() === 'z') { o.preventDefault(); gecmisYaz(o.shiftKey ? yinele : geriAl); return; }
    if ((o.ctrlKey || o.metaKey) && o.key.toLowerCase() === 'y') { o.preventDefault(); gecmisYaz(yinele); return; }
    if (!secili) return;
    if (o.key === 'Delete' || o.key === 'Backspace') { o.preventDefault(); yaz(kaldir(t, secili)); seciliYaz(null); return; }
    if (o.key.toLowerCase() === 'r') { o.preventDefault(); yaz(dondur(t, secili, o.shiftKey ? -aci : aci)); return; }
    const yon: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const y = yon[o.key];
    const k = konumu(t, secili);
    if (y && k) { o.preventDefault(); yaz(tasi(t, secili, izgarayaOtur(k.x + y[0] * izgara, izgara), izgarayaOtur(k.z + y[1] * izgara, izgara))); }
  };

  const merkez = () => {
    const k = kapsamKutusu(t);
    return { x: izgarayaOtur(Math.min(k.x1, Math.max(k.x0, kutu.x + kutu.g / 2)), izgara), z: izgarayaOtur(Math.min(k.z1, Math.max(k.z0, kutu.y + kutu.d / 2)), izgara) };
  };
  const ciziliyor = cizerekEkle && sayfa !== null && krokiGorunur;
  const ekle = (tur: EklenecekTur) => {
    if (ciziliyor) {
      const ad = PALET_GRUPLARI.flatMap((g) => g.ogeler).find((x) => x.tur === tur)?.ad ?? tur;
      aracYaz({ tur: 'ciz', hedef: { oge: tur }, ad });
      seciliYaz(null);
      if (window.matchMedia?.('(max-width: 1023px)').matches) paletAcikYaz(false);
      return;
    }
    const m = merkez();
    const { taslak, anahtar } = ogeEkle(t, tur, m.x, m.z);
    yaz(taslak);
    seciliYaz(anahtar);
    if (window.matchMedia?.('(max-width: 767px)').matches) paletAcikYaz(false);
  };

  const kapatIste = () => (degisti ? vazgecOnayiYaz(true) : kapat());
  // Pencere Esc'te bunu çağırır: önce seçili araç bırakılır, sonra (onay penceresi açık değilse) değişiklik varsa onay sorulur.
  const pencereKapat = () => {
    if (arac) { aracBirak(); return; }
    if (!vazgecOnayi && cakisma === null) kapatIste();
  };

  // Araç çubuğu: ne yapılacağını söyler; ölçek adımında gerçek uzunluk burada girilir.
  const aracCubugu = () => {
    if (!arac) return null;
    const bitir = <Dugme simge="x" onClick={aracBirak}>Bitir</Dugme>;
    if (arac.tur === 'ciz') {
      return <div className="tc-atolye-arac-ipucu" role="status"><span><b>{arac.ad}</b>: köşeden köşeye sürükleyin{'oge' in arac.hedef ? ' (art arda çizebilirsiniz)' : ''}.</span>{bitir}</div>;
    }
    if (arac.tur === 'olc') {
      const [a, b] = noktalar;
      return (
        <div className="tc-atolye-arac-ipucu" role="status">
          <span>{a && b ? <>Ölçü <b className="mono">{metreMetni(uzaklik(a, b))}</b>; yeni ölçü için tıklayın.</> : 'Ölçmek için iki noktaya tıklayın (krokiye yapışır).'}</span>
          {bitir}
        </div>
      );
    }
    const atla = <Dugme onClick={() => sonrakiAdim(arac.adim)}>Atla</Dugme>;
    if (arac.adim === 'olcek') {
      const [a, b] = noktalar;
      const gercek = Number(olcekGirdisi.replace(',', '.'));
      return (
        <div className="tc-atolye-arac-ipucu" role="status">
          {a && b && hiza ? (
            <form className="tc-atolye-satir-form" onSubmit={(e) => { e.preventDefault(); if (gercek > 0) hizaUygula(olcekAyarla(hiza, a, b, gercek), `Ölçek ayarlandı: iki nokta arası ${metreMetni(gercek)}.`, 'olcek'); }}>
              <span>Ölçek: krokide <b className="mono">{metreMetni(uzaklik(a, b))}</b> görünüyor; gerçekte</span>
              <Girdi etiket="Gerçek uzunluk (m)" inputMode="decimal" value={olcekGirdisi} onChange={(e) => olcekGirdisiYaz(e.target.value)} autoFocus />
              <Dugme type="submit" tur="birincil" simge="check" disabled={!(gercek > 0)}>Uygula</Dugme>
            </form>
          ) : (
            <span><b>1 · Ölçek:</b> ölçüsünü bildiğiniz iki noktaya tıklayın (ölçü çizgisinin uçları, iki kolon) {a ? '— ikinci nokta' : ''}.</span>
          )}
          {bitir}
        </div>
      );
    }
    const metin: Record<Exclude<HizaAdimi, 'olcek'>, string> = {
      yon: noktalar[0] ? '2 · Yön: duvarın öbür ucuna tıklayın.' : '2 · Yön: yatay ya da dikey olması gereken bir duvarın iki ucuna tıklayın.',
      kose: fabrikaMi ? '3 · Bölüm köşesi: bölümü seçin, krokide sol üst iç köşesine tıklayın.' : '3 · Köşe: bölümün sol üst iç köşesine tıklayın; kroki oraya oturur.',
      salon: fabrikaMi ? '4 · Bölüm ölçüsü: seçili bölümün sağ alt iç köşesine tıklayın.' : '4 · Bölüm ölçüsü: bölümün sağ alt iç köşesine tıklayın.',
      tasi: 'Krokiyi sürükleyerek kaydırın; bırakınca saklanır.',
    };
    return (
      <div className="tc-atolye-arac-ipucu" role="status">
        <span>{metin[arac.adim]}</span>
        {arac.adim !== 'tasi' && atla}
        {bitir}
      </div>
    );
  };

  const cubuk = (
      <div className="tc-atolye-duzen-cubuk" onKeyDown={tus}>
        <Dugme tur="birincil" simge="plus" aria-pressed={paletAcik} onClick={() => { paletAcikYaz((a) => !a); krokiAcikYaz(false); }}>Ekle</Dugme>
        {!yalnizRaf && <Dugme simge="layers" aria-pressed={krokiAcik} onClick={() => { krokiAcikYaz((a) => !a); paletAcikYaz(false); }}>Kroki</Dugme>}
        <Dugme simge="ruler" aria-pressed={arac?.tur === 'olc'} onClick={() => (arac?.tur === 'olc' ? aracBirak() : (aracBirak(), aracYaz({ tur: 'olc' })))}>Ölç</Dugme>
        <div className="tc-atolye-duzen-grup">
          <Dugme simge="back" aria-label="Geri al" disabled={gecmis.onceki.length === 0} onClick={() => gecmisYaz(geriAl)} />
          <Dugme simge="rotate" aria-label="Yinele" disabled={gecmis.sonraki.length === 0} onClick={() => gecmisYaz(yinele)} />
        </div>
        <div className="tc-atolye-duzen-secim">
          <Secim etiket="Izgara" secenekler={IZGARA_SECENEKLERI} value={String(izgara)} onChange={(o) => izgaraYaz(Number(o.target.value))} />
          <Secim etiket="Açı adımı" secenekler={ACI_SECENEKLERI} value={String(aci)} onChange={(o) => aciYaz(Number(o.target.value))} />
        </div>
        <div className="tc-atolye-duzen-grup">
          <Dugme simge="zout" aria-label="Uzaklaş" onClick={() => yakinlas(1.25)} />
          <Dugme simge="zin" aria-label="Yakınlaş" onClick={() => yakinlas(0.8)} />
          <Dugme simge="fit" aria-label="Sığdır" onClick={() => kutuYaz(sigdir(t))} />
        </div>
        {secili && !secili.startsWith('giris') && !secili.startsWith('gecis') && (
          <Dugme simge="rotate" onClick={() => yaz(dondur(t, secili, aci))}>{aci}°</Dugme>
        )}
        {!yalnizRaf && <Dugme simge="cube" onClick={() => kutuphaneYaz(true)}>3B modeller</Dugme>}
        <div className="tc-atolye-duzen-sag">
          {bulgular.ihlaller.length > 0 && (
            <Dugme tur="tehlike" simge="alert" aria-expanded={bulguAcik} onClick={() => bulguAcikYaz((a) => !a)}>{bulgular.ihlaller.length} kural ihlali</Dugme>
          )}
          <Dugme onClick={kapatIste}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={!degisti} onClick={() => kaydet.mutate()}>Kaydet</Dugme>
        </div>
      </div>
  );

  return (
    <Pencere acik kapat={pencereKapat} baslik={fabrikaMi ? 'Fabrika planını düzenle' : 'Yerleşimi düzenle'} tur="tam" ust={cubuk}>
      <div className="tc-atolye-duzen-kap" onKeyDown={tus}>
      <div className="tc-atolye-duzen-govde">
        {paletAcik && (
          <aside className="tc-atolye-palet" aria-label="Öğe ekle">
            <div className="tc-atolye-palet-ust">
              <strong>Ekle</strong>
              <Dugme simge="x" aria-label="Paleti kapat" onClick={() => paletAcikYaz(false)} />
            </div>
            {sayfa && krokiGorunur && (
              <IsaretKutusu etiket="Krokinin üstüne çizerek ekle" checked={cizerekEkle} onChange={(e) => cizerekEkleYaz(e.target.checked)} />
            )}
            <p className="tc-atolye-ipucu">
              {ciziliyor ? 'Öğeyi seçin, sonra krokide köşeden köşeye sürükleyin (duvarda uçtan uca). Ölçü çizimden alınır.' : 'Dokunun: öğe görünümün ortasına konur, sonra sürükleyin.'}
            </p>
            {(yalnizRaf ? RAF_PALETI : PALET_GRUPLARI).map((g) => (
              <section key={g.baslik} className="tc-atolye-palet-grup">
                <h4>{g.baslik}</h4>
                <div className="tc-atolye-palet-ogeler">
                  {g.ogeler.map((o) => (
                    <Dugme
                      key={o.tur}
                      className="tc-atolye-palet-oge"
                      data-tur={o.tur}
                      aria-pressed={arac?.tur === 'ciz' && 'oge' in arac.hedef && arac.hedef.oge === o.tur}
                      onClick={() => ekle(o.tur)}
                    >
                      <OgeSimgesi ad={o.tur} />{o.ad}
                    </Dugme>
                  ))}
                </div>
              </section>
            ))}
            <section className="tc-atolye-palet-grup" aria-label="Eklenecek makineler">
              <h4>Eklenecek makineler</h4>
              <p className="tc-atolye-ipucu">Çizim Merkezi'nde eşleşen makineler ve örnekler. Dokunup yerleştirin.</p>
              {istasyonlar.isError && <p className="tc-atolye-ipucu">Makine listesi alınamadı.</p>}
              {eklenecek.length === 0 && istasyonlar.isSuccess && <p className="tc-atolye-ipucu">Eklenecek eşleşmiş makine yok.</p>}
              <div className="tc-atolye-palet-ogeler">{eklenecek.map(istasyonDugmesi)}</div>
              {eslesmemis > 0 && (
                <p className="tc-atolye-ipucu" role="note">
                  Eşleşmemiş {eslesmemis} makine eklenemez; önce Çizim Merkezi'nde "CNC makineleri" bölümünde eşleştirin.
                </p>
              )}
            </section>
            <section className="tc-atolye-palet-grup">
              {/* Haritada istasyon kaydı "makine" adıyla görünür (kullanıcı kararı, kart #1196); istasyonun altındaki makine kayıtları ekipmandır. */}
              <h4>Ekipmanlar</h4>
              {makineler.isError && <p className="tc-atolye-ipucu">Ekipman listesi alınamadı.</p>}
              {yerlesmemisMakineler.length === 0 && makineler.isSuccess && <p className="tc-atolye-ipucu">Yerleştirilmemiş aktif ekipman yok.</p>}
              <div className="tc-atolye-palet-ogeler">
                {yerlesmemisMakineler.map((m) => {
                  const tip = m.istasyonId === null ? null : istasyonTipi.get(m.istasyonId) ?? null;
                  return (
                    <Dugme
                      key={m.id}
                      className="tc-atolye-palet-oge"
                      data-tur="makine"
                      title={[m.ad, m.markaModel, tip ? ISTASYON_TIPI_ADI[tip] : null].filter(Boolean).join(' · ')}
                      onClick={() => {
                        if (ciziliyor) {
                          aracYaz({ tur: 'ciz', hedef: { makine: m, tip }, ad: `${m.kod} · ${m.ad}` });
                          seciliYaz(null);
                          if (window.matchMedia?.('(max-width: 1023px)').matches) paletAcikYaz(false);
                          return;
                        }
                        const o = merkez(); const r = makineEkle(t, m, tip, o.x, o.z); yaz(r.taslak); seciliYaz(r.anahtar);
                      }}
                    >
                      <OgeSimgesi ad={makineCinsi(tip ?? 'talasli', m.ad)} />
                      {m.kod} · {m.ad}
                    </Dugme>
                  );
                })}
              </div>
            </section>
          </aside>
        )}

        {krokiAcik && (
          <KrokiPaneli
            kapsam={salonId}
            kroki={kroki}
            sayfa={sayfa}
            yukleniyor={altlik.yukleniyor}
            hata={altlik.hata}
            hizalama={hiza}
            gorunur={krokiGorunur}
            gorunurYaz={krokiGorunurYaz}
            saydamlik={saydamlik}
            saydamlikYaz={saydamlikYaz}
            yapis={yapis}
            yapisYaz={yapisYaz}
            adim={arac?.tur === 'hiza' ? arac.adim : null}
            adimBaslat={adimBaslat}
            dondur90={() => {
              const k = fabrikaMi ? ilkKutu : { x0: 0, z0: 0, x1: salonG, z1: salonD };
              if (hiza) hizaKaydet.mutate(krokiDondur(hiza, { x: (k.x0 + k.x1) / 2, z: (k.z0 + k.z1) / 2 }, 90));
            }}
            kapat={() => krokiAcikYaz(false)}
          />
        )}

        <div
          className="tc-atolye-duzen-plan"
          data-arac={arac?.tur ?? undefined}
          onPointerMove={(o) => {
            if (!arac || surukleme.current) return;
            const n = svgNoktasi(o);
            if (n) imlecYaz(yakala(n, arac.tur === 'ciz'));
          }}
          onPointerLeave={() => { if (!surukleme.current) imlecYaz(null); }}
        >
          {arac && aracCubugu()}
          <PlanCizimi
            taslak={t}
            sutunlar={yerlesim?.salon.sutunlar ?? []}
            satirlar={yerlesim?.salon.satirlar ?? []}
            secili={secili}
            isaretli={isaretli}
            kutu={kutu}
            duzenlenir
            etiket={fabrikaMi ? 'Fabrika planı (düzenleniyor)' : 'Yerleşim planı (düzenleniyor)'}
            svgRef={svg}
            ogeBas={ogeBas}
            bosBas={bosBas}
            bolumBas={bolumBas}
            dondurBas={dondurBas}
            ucBas={ucBas}
            altlik={krokiGorunur ? (
              <>
                {/* Öbür kapsamın krokileri (yalnız görüntü): bölümde fabrika krokisi, fabrikada bölümlerin krokileri. */}
                {bolumYeri && <EkKroki kapsam={null} donustur={(h) => yerelle(h, bolumYeri)} saydamlik={saydamlik * 0.6} />}
                {t.bolumler?.map((b) => <EkKroki key={b.anahtar} kapsam={b.salonId} donustur={(h) => yerlestir(h, b)} saydamlik={saydamlik} />)}
                {sayfa && hiza && <KrokiAltligi sayfa={sayfa} hizalama={hiza} saydamlik={saydamlik} parcalar={yapismaVerisi?.parcalar ?? null} />}
              </>
            ) : null}
            ust={(
              <StudyoUstu
                kutu={kutu}
                pm={pm}
                isaret={{
                  imlec: arac ? imlec : null,
                  kilavuz: kilavuz ?? (imlec && arac ? { x: imlec.kilavuzX, z: imlec.kilavuzZ } : null),
                  cizim: cizim ? { ...cizim, cizgi: arac?.tur === 'ciz' && 'oge' in arac.hedef && (arac.hedef.oge === 'duvar' || arac.hedef.oge === 'cam_duvar') } : null,
                  noktalar,
                  noktaRengi: arac?.tur === 'olc' ? 'olc' : 'hiza',
                }}
              />
            )}
          />
          {bulguAcik && bulgular.ihlaller.length > 0 && (
            <div className="tc-atolye-bulgular" role="alert">
              <div className="tc-atolye-palet-ust">
                <strong>Kayıt reddedildi</strong>
                <Dugme simge="x" aria-label="Listeyi kapat" onClick={() => bulguAcikYaz(false)} />
              </div>
              <ul>
                {bulgular.ihlaller.map((b, i) => (
                  <li key={i}>
                    <Dugme className="tc-atolye-bulgu" simge="target" onClick={() => { const ilk = b.ogeler[0]; if (ilk) seciliYaz(ilk); }}>
                      {b.kural} · {b.mesaj}
                    </Dugme>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="tc-atolye-duzen-yan" aria-label="Özellikler">
          {yalnizRaf && !(secili?.startsWith('raf:') ?? false) ? (
            <p className="tc-atolye-ipucu">Rafı seçip özelliklerini düzenleyin ya da Ekle'den yeni raf koyun. Makine, alan ve duvarlar Fabrika Haritası'nda düzenlenir.</p>
          ) : (
          <OzellikPaneli
            taslak={t}
            secili={secili}
            degistir={(anahtar, degisim) => yaz(guncelle(t, anahtar, degisim))}
            salonDegistir={(degisim) => yaz({ ...t, salon: { ...t.salon, ...degisim } })}
            kaldir={(anahtar) => { yaz(kaldir(t, anahtar)); seciliYaz(null); }}
            modeller={modeller.data?.modeller ?? []}
            kutuphaneAc={() => kutuphaneYaz(true)}
            merkezModelleri={merkezModelleri}
            merkezModeliDegisti={(id, m) => merkezModelleriYaz((once) => new Map(once).set(id, m))}
            girisKoy={(bolum) => {
              if (bolum) {
                const m = fabrikayaCevir(bolum, { x: r2(bolum.genislik / 2), z: r2(bolum.derinlik / 2) });
                yaz(guncelle(t, bolum.anahtar, { giris: { x: r2(m.x), z: r2(m.z) } }));
                seciliYaz(`giris:${bolum.salonId}`);
                return;
              }
              const m = merkez(); yaz({ ...t, salon: { ...t.salon, giris: m } }); seciliYaz('giris');
            }}
            sec={seciliYaz}
          />
          )}
        </aside>
      </div>

      <OnayPenceresi
        acik={vazgecOnayi}
        baslik="Değişiklikler kaydedilmedi"
        onayMetni="Kaydetmeden çık"
        tehlikeli
        onayla={() => { vazgecOnayiYaz(false); kapat(); }}
        vazgec={() => vazgecOnayiYaz(false)}
      >
        <p>Düzenleyicide yaptığınız değişiklikler silinecek.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={cakisma !== null}
        baslik="Yerleşimi başkası değiştirdi"
        onayMetni="Güncel yerleşimi aç"
        onayla={() => {
          cakismaYaz(null);
          void istemci.invalidateQueries({ queryKey: anahtarlar.fabrika });
          if (salonId !== null) void istemci.invalidateQueries({ queryKey: anahtarlar.yerlesim(salonId) });
          kapat();
        }}
        vazgec={() => cakismaYaz(null)}
      >
        <p>
          {cakisma?.kaydeden.ad || 'Başka bir kullanıcı'} yerleşimi {saatMetni(cakisma?.kaydedildi ?? null) ?? ''} kaydetti (sürüm {cakisma?.guncelSurum}).
          Değişikliğiniz kaydedilmedi; güncel yerleşimi açıp yeniden yapın.
        </p>
      </OnayPenceresi>
      {kutuphane && (
        <Suspense fallback={null}>
          <ModelKutuphanesi acik={kutuphane} kapat={() => kutuphaneYaz(false)} yazabilir />
        </Suspense>
      )}
      </div>
    </Pencere>
  );
}
