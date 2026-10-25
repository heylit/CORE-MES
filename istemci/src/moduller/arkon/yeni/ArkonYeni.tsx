import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { ArkonBenCevabi, ArkonRolu, MakineDevralGovdesi } from '#paylasilan/sozlesme/arkon.ts';
import { bekleyenKayitIletisi } from '../../../../../arkon/web/src/data/bekleyen-kayit.ts';
import { Dugme, DurumKutusu, Pencere, Sekmeler, useBildirim } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useCikis, useOturum } from '../../../ortak/veri/oturum.ts';
import { useTema } from '../../../ortak/veri/tema.ts';
import { anahtarlar } from '../anahtarlar.ts';
import { arkonGirisSayfasi } from '../ArkonCercevesi.tsx';
import { TMI_HEDEFLERI, type MakineDoluRedi } from '../baglanti.ts';
import { MakineDevralPenceresi, devralMetni } from '../MakineDevralPenceresi.tsx';
import { CagriBandi } from './ayarlar/index.tsx';
import { ayarlariOku, ILK_AYARLAR, type ArkonAyarlari } from './cekirdek/ayarlar.ts';
import { olcekHesapla, TASARIM_GENISLIGI, TASARIM_YUKSEKLIGI } from './cekirdek/olcek.ts';
import type { Perm } from './cekirdek/tipler.ts';
import { yerel } from './cekirdek/yerel.ts';
import { sayfaGorunur, yetkiVar } from './cekirdek/yetki.ts';
import { ArkonBaglamiKaynagi, useCakismaUyarisi, type ArkonBaglami, type TmiHedefi } from './veri/baglam.ts';
import { depoyuBaslat, type ArkonDeposu, type ArkonDurumu } from './veri/depo.ts';
import { tasiyiciYap } from './veri/tasiyici.ts';
import { SAYFALAR, SAYFA_DISI, sayfaAdresi, sayfaMi, sekmeMaddeleri, type ArkonSayfasi, type SayfaTanimi, type SekmeMaddesi } from './sayfalar.ts';
import './arkon-yeni.css';

// TS geçişinin Arkon ekranı (Soru 271 c): Üretim Terminali ve Üretim Hazırlık kabuğun içinde, çerçevesiz. Alıma kadar eski çerçevenin
// yanında /arkon/yeni adresindedir ve yalnız yöneticide açılır; gezinme ikinci menünün maddeleriyle sekmelerdedir.
export function ArkonYeni() {
  return <YeniEkranKapisi><ArkonYeniEkrani /></YeniEkranKapisi>;
}

function ArkonYeniEkrani() {
  const oturum = useOturum();
  const islemler = useMemo(() => oturum.data?.islemler ?? [], [oturum.data]);
  const ben = useQuery({ queryKey: anahtarlar.ben, queryFn: () => api.get<ArkonBenCevabi>('/arkon/ben') });
  const { tema } = useTema();
  const { bildir } = useBildirim();
  const cikis = useCikis();
  const { sayfa: adresSayfasi } = useParams();
  const saltOkunur = adresSayfasi === 'onizle';
  // "Operatör gözüyle" penceresi açıkken de yazma TMI'ye gitmez (eskide önizleme ayrı çerçevede, kendi salt okunur açılışındaydı).
  const [onizleme, onizlemeYaz] = useState<string | null>(null);

  // Taşıyıcının çağırdıkları her açılışta yeniden kurulmasın diye son değerler ref'te tutulur.
  const bildirRef = useRef(bildir);
  bildirRef.current = bildir;
  const cikisRef = useRef(cikis.mutate);
  cikisRef.current = cikis.mutate;
  const saltOkunurRef = useRef(saltOkunur);
  saltOkunurRef.current = saltOkunur || onizleme !== null;
  const temaRef = useRef(tema);
  temaRef.current = tema;
  const benRef = useRef({ cevap: ben.data, zaman: ben.dataUpdatedAt });
  benRef.current = { cevap: ben.data, zaman: ben.dataUpdatedAt };

  // Makine başka işte doluyken reddedilen başlatmalar sırayla sorulur (çerçevedeki gibi).
  const [devralmalar, devralmalarYaz] = useState<MakineDoluRedi[]>([]);

  const kisi = ben.data?.kisi;
  const kisiAnahtari = kisi === undefined ? null : JSON.stringify(kisi);
  const [depo, depoYaz] = useState<ArkonDeposu | null>(null);
  const [depoHatasi, depoHatasiYaz] = useState<unknown>(null);
  useEffect(() => {
    if (kisi === undefined) return undefined;
    let iptal = false;
    const benVerisi = benRef.current;
    const tasiyici = tasiyiciYap({
      koken: window.location.origin,
      ...(benVerisi.cevap === undefined ? {} : { ben: { cevap: benVerisi.cevap, zaman: benVerisi.zaman } }),
      cikis: () => cikisRef.current(),
      reddedildi: (ileti) => bildirRef.current('hata', `TMI CORE: ${ileti}`),
      uyari: (ileti) => bildirRef.current('bilgi', `TMI CORE: ${ileti}`),
      makineDolu: (red) => devralmalarYaz((l) => [...l, red]),
      saltOkunur: () => saltOkunurRef.current,
    });
    depoyuBaslat({ kisi, tema: temaRef.current, tasiyici }).then(
      (d) => { if (!iptal) { depoHatasiYaz(null); depoYaz(d); } },
      (h: unknown) => { if (!iptal) depoHatasiYaz(h); },
    );
    return () => { iptal = true; tasiyici.kapat(); };
    // Kişi değişmedikçe veri katmanı yeniden bağlanmaz; ben cevabının yenilenmesi aynı kişiyi verir.
  }, [kisiAnahtari]);

  if (ben.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(ben.error, 'Üretim Hazırlık açılamadı.')} yenile={() => { void ben.refetch(); }} />;
  if (depoHatasi !== null) return <DurumKutusu durum="hata" mesaj={hataIletisi(depoHatasi, 'Üretim Hazırlık verisi açılamadı.')} />;
  if (kisi === undefined || depo === null) return <DurumKutusu durum="yukleniyor" />;
  return (
    <AcikEkran
      depo={depo}
      islemler={islemler}
      arkonRolu={kisi.rol}
      saltOkunur={saltOkunur}
      onizleme={onizleme}
      onizlemeYaz={onizlemeYaz}
      devralmalar={devralmalar}
      siradakiniKapat={() => devralmalarYaz((l) => l.slice(1))}
    />
  );
}

interface AcikEkranOzellikleri {
  depo: ArkonDeposu;
  islemler: readonly string[];
  arkonRolu: ArkonRolu;
  saltOkunur: boolean;
  onizleme: string | null;
  onizlemeYaz: (paketId: string | null) => void;
  devralmalar: readonly MakineDoluRedi[];
  siradakiniKapat: () => void;
}

function AcikEkran({ depo, islemler, arkonRolu, saltOkunur, onizleme, onizlemeYaz, devralmalar, siradakiniKapat }: AcikEkranOzellikleri) {
  const { sayfa: adres, kimlik } = useParams();
  const gezin = useNavigate();
  const { bildir } = useBildirim();

  const [durum, durumYaz] = useState<ArkonDurumu>(() => depo.status());
  useEffect(() => depo.onStatus(durumYaz), [depo]);
  const kisi = durum.user;

  // Ayarlar açılışta, kişi değişince ve başka cihazda değişince ('cfg' iletisi) yeniden okunur; ekran yeniden kurulmaz.
  const [ayarlar, ayarlarYaz] = useState<ArkonAyarlari | null>(null);
  const ayarlarRef = useRef<ArkonAyarlari | null>(null);
  const ayarlariYenile = useCallback(() => {
    void ayarlariOku(depo, ayarlarRef.current ?? ILK_AYARLAR).then((a) => { ayarlarRef.current = a; ayarlarYaz(a); });
  }, [depo]);
  useEffect(() => {
    ayarlariYenile();
    return depo.Bus.on((m) => { if (m.type === 'cfg') ayarlariYenile(); });
  }, [depo, ayarlariYenile, kisi?.id]);

  useCakismaUyarisi(useCallback((ileti: string) => bildir('bilgi', ileti), [bildir]));

  // Yönetici ve amir, tablette başkasının gönderilmemiş kaydı varsa bir kez bilgi alır (karar 103 a).
  const bildirilen = useRef(new Set<string>());
  useEffect(() => {
    if (!kisi || saltOkunur || bildirilen.current.has(kisi.id)) return;
    const ileti = bekleyenKayitIletisi(kisi.role, durum.baskasi);
    if (!ileti) return;
    bildirilen.current.add(kisi.id);
    bildir('bilgi', ileti);
  }, [kisi, durum.baskasi, saltOkunur, bildir]);

  const devral = useMutation({
    mutationFn: (red: MakineDoluRedi) => api.post<{ tamam: true }>('/arkon/makine-devral', {
      emirId: red.devralEmirId, kullanimId: red.doluOlan.kullanimId, cid: red.cid, durdurulanEmirId: red.doluOlan.emir.id,
    } satisfies MakineDevralGovdesi),
    onSuccess: (_c, red) => { bildir('tamam', `${red.doluOlan.emir.emirNo} durduruldu; işiniz başlatıldı.`); siradakiniKapat(); },
    onError: (hata) => { bildir('hata', `TMI CORE: ${hataIletisi(hata, 'Makine devralınamadı.')}`); siradakiniKapat(); },
  });
  const siradaki = devralmalar[0] ?? null;

  const maddeler = useMemo(() => sekmeMaddeleri(), []);
  const baglam = useMemo((): ArkonBaglami | null => {
    if (ayarlar === null) return null;
    return {
      depo, kisi, ayarlar, ayarlariYenile, saltOkunur,
      yetkiVar: (k: Perm) => yetkiVar(kisi, ayarlar.yetkiler, k),
      sayfaGorunur: (s: string) => sayfaGorunur(s, kisi, ayarlar.yetkiler),
      git: (s: string, k?: string) => { void gezin(sayfaAdresi(s, k)); },
      tmiyeGit: (h: TmiHedefi) => { const yol = TMI_HEDEFLERI[h]; if (yol !== undefined) void gezin(yol); },
      onizle: (paketId: string) => onizlemeYaz(paketId),
    };
  }, [depo, kisi, ayarlar, ayarlariYenile, saltOkunur, gezin, onizlemeYaz]);
  const [kok, kokYaz] = useState<HTMLDivElement | null>(null);
  useOlcek(kok);
  const numune = useNumuneSayisi(depo);

  if (baglam === null) return <DurumKutusu durum="yukleniyor" />;

  // Madde hem TMI menüsünde (işlemle) hem Arkon'un sayfa yetkisinde görünür olmalı; TMI ekranı olan madde yalnız TMI işlemine bakar.
  const gorunur = (m: SekmeMaddesi): boolean =>
    maddeGorunurMu(m, islemler) && (Object.hasOwn(SAYFA_DISI, m.anahtar) || baglam.sayfaGorunur(m.anahtar));
  // Kalite sekmesi bekleyen ve ölçülen numune sayısını taşır (eski sol menüdeki rozet); sayı parantezle yazılır (283.25).
  const sekmeler = maddeler.filter(gorunur).map((m) => (m.anahtar === 'kalite' && numune > 0 ? { ...m, baslik: `${m.baslik} (${numune})` } : m));

  // Ayrı sayfa (Üretim Terminali, Kuyruk) sekmede değil; TMI'deki kendi menü satırının işlemi ve Arkon sayfa yetkisiyle açılır.
  const ayriAcik = (s: ArkonSayfasi): boolean => {
    const t: SayfaTanimi = SAYFALAR[s];
    return t.ayri === true && t.islem !== undefined && islemler.includes(t.islem) && baglam.sayfaGorunur(s);
  };

  if (adres === undefined) {
    const giris = arkonGirisSayfasi(arkonRolu, islemler);
    if (sayfaMi(giris) && ayriAcik(giris)) return <Navigate replace to={sayfaAdresi(giris)} />;
    const hedef = sekmeler.find((m) => m.anahtar === giris) ?? sekmeler.find((m) => !Object.hasOwn(SAYFA_DISI, m.anahtar));
    if (hedef === undefined) return <DurumKutusu durum="bos" mesaj="Üretim Hazırlık'ta size açık sayfa yok." />;
    return <Navigate replace to={sayfaAdresi(hedef.anahtar)} />;
  }

  const sayfa: ArkonSayfasi | null = sayfaMi(adres) ? adres : null;
  const tanim: SayfaTanimi | null = sayfa === null ? null : SAYFALAR[sayfa];
  const secili: string | null = sayfa === null ? null : (tanim?.ust ?? sayfa);
  const ayri = sayfa !== null && tanim?.ayri === true;
  const acik = sayfa !== null && (ayri
    ? ayriAcik(sayfa)
    : secili !== null && sekmeler.some((m) => m.anahtar === secili) && baglam.sayfaGorunur(sayfa));
  const etiket = ayri ? tanim?.baslik : maddeler.find((m) => m.anahtar === secili)?.baslik;

  const sec = (anahtar: string) => {
    const disari = SAYFA_DISI[anahtar];
    void gezin(disari ?? sayfaAdresi(anahtar));
  };

  const Ekran = tanim?.ekran;
  return (
    <ArkonBaglamiKaynagi.Provider value={baglam}>
      <div className="tc-ay" ref={kokYaz}>
        {!ayri && sekmeler.length > 0 && (
          <Sekmeler etiket="Üretim Hazırlık" sekmeler={sekmeler} secili={secili ?? ''} sec={sec} />
        )}
        {!acik || Ekran === undefined || sayfa === null
          ? <DurumKutusu durum="bos" mesaj="Bu sayfa bulunamadı ya da size açık değil." />
          : (
            <section className="tc-ay-icerik" aria-label={etiket ?? 'Önizleme'} data-sayfa={sayfa}>
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <Ekran sayfa={sayfa} kimlik={kimlik ?? null} />
              </Suspense>
            </section>
          )}
        {acik && !saltOkunur && sayfa !== null && <CagriBandi sayfa={sayfa} />}
      </div>
      {onizleme !== null && <OnizlemePenceresi paketId={onizleme} baglam={baglam} kapat={() => onizlemeYaz(null)} />}
      <MakineDevralPenceresi
        red={siradaki}
        yukleniyor={devral.isPending}
        onayla={() => { if (siradaki !== null) devral.mutate(siradaki); }}
        vazgec={() => {
          if (siradaki !== null) bildir('bilgi', `TMI CORE: ${devralMetni(siradaki)} İşiniz başlatılmadı.`);
          siradakiniKapat();
        }}
      />
    </ArkonBaglamiKaynagi.Provider>
  );
}

// Ekran ölçeği (eski useFit): sayfa 1600x900 tasarım alanına göre ölçeklenir. Ölçek ve ölçekli görünür yükseklik kökte değişken
// olarak durur (arkon-yeni.css zoom; tam yükseklikli düzenler --tc-ay-vh kullanır). Kabuk alanı değişince yeniden hesaplanır.
function useOlcek(kok: HTMLDivElement | null): void {
  useEffect(() => {
    const alan = kok?.parentElement;
    if (!kok || !alan) return undefined;
    const uygula = () => {
      const yukseklik = Math.max(0, window.innerHeight - Math.max(0, alan.getBoundingClientRect().top));
      const { mobil, z } = olcekHesapla(alan.clientWidth, yukseklik, yerel.oku<number>('scale'));
      kok.style.setProperty('--tc-ay-olcek', String(z));
      kok.style.setProperty('--tc-ay-vh', `${Math.round(yukseklik / z)}px`);
      kok.toggleAttribute('data-mobil', mobil);
    };
    uygula();
    const izleyici = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(uygula);
    izleyici?.observe(alan);
    window.addEventListener('resize', uygula);
    window.addEventListener('orientationchange', uygula);
    return () => { izleyici?.disconnect(); window.removeEventListener('resize', uygula); window.removeEventListener('orientationchange', uygula); };
  }, [kok]);
}

// Kalitede bekleyen ya da ölçülen numune sayısı (baslat.ts nWait): numune ve sonuç iletisinde ve 20 sn'de bir yeniden sayılır.
function useNumuneSayisi(depo: ArkonDeposu): number {
  const [n, nYaz] = useState(0);
  useEffect(() => {
    let iptal = false;
    let bekleyen: ReturnType<typeof setTimeout> | null = null;
    const say = async () => {
      try {
        const rs = await depo.DB.all('requests') as { status?: string }[];
        if (!iptal) nYaz(rs.filter((r) => r.status === 'waiting' || r.status === 'measuring').length);
      } catch { /* okunamazsa son sayı kalır */ }
    };
    void say();
    const birak = depo.Bus.on((m) => { if (/sample|result/.test(m.type)) { if (bekleyen) clearTimeout(bekleyen); bekleyen = setTimeout(() => { void say(); }, 300); } });
    const t = setInterval(() => { void say(); }, 20000);
    return () => { iptal = true; birak(); clearInterval(t); if (bekleyen) clearTimeout(bekleyen); };
  }, [depo]);
  return n;
}

// "Operatör gözüyle" önizleme (operator-parcalar.ts PreviewOv): operatör ekranı 1600x900 cihaz alanında, pencereye sığacak
// ölçekte çizilir. Pencerenin içi salt okunurdur; istasyon cihazda hatırlanan önizleme istasyonudur (pvStation).
function OnizlemePenceresi({ paketId, baglam, kapat }: { paketId: string; baglam: ArkonBaglami; kapat: () => void }) {
  const [sahne, sahneYaz] = useState<HTMLDivElement | null>(null);
  const [cihaz, cihazYaz] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sahne || !cihaz) return undefined;
    const uygula = () => {
      const k = Math.max(0.1, Math.min((sahne.clientWidth - 40) / TASARIM_GENISLIGI, (sahne.clientHeight - 40) / TASARIM_YUKSEKLIGI));
      cihaz.style.setProperty('--tc-ay-onizleme-olcek', String(k));
      cihaz.style.setProperty('--tc-ay-onizleme-en', `${TASARIM_GENISLIGI}px`);
      cihaz.style.setProperty('--tc-ay-onizleme-boy', `${TASARIM_YUKSEKLIGI}px`);
      cihaz.style.setProperty('--tc-ay-vh', `${TASARIM_YUKSEKLIGI}px`);
    };
    uygula();
    const izleyici = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(uygula);
    izleyici?.observe(sahne);
    window.addEventListener('resize', uygula);
    return () => { izleyici?.disconnect(); window.removeEventListener('resize', uygula); };
  }, [sahne, cihaz]);
  const salt = useMemo((): ArkonBaglami => ({ ...baglam, saltOkunur: true }), [baglam]);
  const Ekran = SAYFALAR.onizle.ekran;
  const istasyon = yerel.oku<string>('pvStation') ?? '';
  const ust = (
    <header className="tc-ay-onizleme-ust">
      <span className="tc-ay-onizleme-baslik">Operatör gözüyle önizleme{istasyon ? ` · ${istasyon} ekranı` : ''} · kayıt yapılmaz</span>
      <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
    </header>
  );
  return (
    <Pencere acik kapat={kapat} baslik="Operatör gözüyle önizleme" tur="tam" ust={ust}>
      <div ref={sahneYaz} className="tc-ay-onizleme-sahne">
        <div ref={cihazYaz} className="tc-ay-onizleme-cihaz">
          <div className="tc-ay-onizleme-ekran">
            <ArkonBaglamiKaynagi.Provider value={salt}>
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <Ekran sayfa="onizle" kimlik={paketId} />
              </Suspense>
            </ArkonBaglamiKaynagi.Provider>
          </div>
        </div>
      </div>
    </Pencere>
  );
}

