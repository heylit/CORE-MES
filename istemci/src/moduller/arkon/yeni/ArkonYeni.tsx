import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { ArkonBenCevabi, ArkonRolu, CalismaDevralGovdesi, MakineDevralGovdesi } from '#paylasilan/sozlesme/arkon.ts';
import { bekleyenKayitIletisi } from '../../../../../arkon/web/src/data/bekleyen-kayit.ts';
import { Dugme, DurumKutusu, Pencere, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { useCerceveSayacYazici } from '../../../ortak/rota/cerceve-sayaclari.ts';
import { useEkranGorunur } from '../../../ortak/rota/kalici.tsx';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useCikis, useOturum } from '../../../ortak/veri/oturum.ts';
import { useTema } from '../../../ortak/veri/tema.ts';
import { anahtarlar } from '../anahtarlar.ts';
import { EMIR_PARAMETRESI, KART_PARAMETRESI, TMI_HEDEFLERI, emirParametresiOku, emirSeciminiGonder, tmiRetMetni, type MakineDoluRedi } from '../baglanti.ts';
import { MakineDevralPenceresi, devralMetni } from '../MakineDevralPenceresi.tsx';
import { CagriBandi } from './ayarlar/index.tsx';
import { MalKabulPaneli } from './hazirlik/MalKabulPaneli.tsx';
import { YuklePaneli } from './hazirlik/YuklePaneli.tsx';
import { ArkonCizimOrtami } from './cizim/ortam.tsx';
import { ayarlariOku, ILK_AYARLAR, type ArkonAyarlari } from './cekirdek/ayarlar.ts';
import { olcekHesapla, TASARIM_GENISLIGI, TASARIM_YUKSEKLIGI } from './cekirdek/olcek.ts';
import type { Perm } from './cekirdek/tipler.ts';
import { yerel } from './cekirdek/yerel.ts';
import { IS_TURLERI, onayBekliyor } from './hazirlik/kurallar.ts';
import { ONIZLEME_SEKME_OLAYI } from './operator/onizleme-olay.ts';
import { sayfaGorunur, yetkiVar } from './cekirdek/yetki.ts';
import { ArkonBaglamiKaynagi, ArkonDarAlanKaynagi, useCakismaUyarisi, type ArkonBaglami, type TmiHedefi } from './veri/baglam.ts';
import { depoyuBaslat, type ArkonDeposu, type ArkonDurumu } from './veri/depo.ts';
import { tasiyiciYap } from './veri/tasiyici.ts';
import { KOK, SAYFALAR, SAYFA_DISI, arkonGirisSayfasi, sayfaAdresi, sayfaMi, sekmeMaddeleri, type ArkonSayfasi, type SayfaTanimi, type SekmeMaddesi } from './sayfalar.ts';
import './arkon-yeni.css';

// TS geçişinin Arkon ekranı (Soru 271 c): Üretim Terminali ve Üretim Hazırlık kabuğun içinde, çerçevesiz. Eski adresine geçti (541, 527 1 a):
// sayfayı gören herkes açar. Gezinme kabuğun ikinci menü şeridindedir; ekran kendi sekmesini çizmez (553 1 a).
export function ArkonYeni() {
  return <ArkonYeniEkrani />;
}

// Ayrı sayfa (Üretim Terminali, Kuyruk): eski sayfa gibi TMI sayfa işlemi ve Arkon sayfa yetkisiyle açılır.
export type TasinanSayfa = 'kuyruk' | 'operator';
export function ArkonAyriSayfa({ sayfa }: { sayfa: TasinanSayfa }) {
  const islemler = useOturum().data?.islemler;
  if (sayfa === 'operator' && islemler === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (sayfa === 'operator' && islemler !== undefined && yalnizMalKabul(islemler)) {
    return <section className="tc-ay-icerik" aria-label="Mal kabul" data-sayfa="mal-kabul"><MalKabulPaneli /></section>;
  }
  if (sayfa === 'operator' && islemler !== undefined && yalnizYukle(islemler)) {
    return <section className="tc-ay-icerik" aria-label="Yükleme" data-sayfa="yukle"><YuklePaneli /></section>;
  }
  return <ArkonYeniEkrani sabitSayfa={sayfa} />;
}

// 2039 a: Arkon rolü olmayan depo kullanıcısı terminalde yalnız mal kabulü görür; Arkon'un kişi kaydı (/arkon/ben) istenmez, çünkü
// Arkon rolü yoktur ve sunucu reddeder. Liste sunucunun rol sırasıdır (sunucu/moduller/arkon/kurallar.ts ROL_SIRASI).
const ARKON_ROL_ISLEMLERI: readonly string[] = ['arkon.yonetici', 'arkon.planlama', 'arkon.hazirlik', 'arkon.kalite', 'arkon.bakim', 'arkon.amir', 'arkon.operator'];
export const yalnizMalKabul = (islemler: readonly string[]): boolean =>
  islemler.includes('stok.giris') && !islemler.some((i) => ARKON_ROL_ISLEMLERI.includes(i));
// Sevkiyat çalışanı (22.11.2026): Arkon rolü ve mal kabul yetkisi yok, stok çıkışı var; terminalde yalnız Yükle bölümünü görür.
export const yalnizYukle = (islemler: readonly string[]): boolean =>
  islemler.includes('stok.cikis') && !islemler.includes('stok.giris') && !islemler.some((i) => ARKON_ROL_ISLEMLERI.includes(i));

// Sistem Ayarları'ndaki Arkon bölümü: Üretim Hazırlık > Ayarlar'ın kendisi, aynı görünürlük ve aynı kayıt. Adres Sistem Ayarları'nındır;
// sayfa açık değilse giriş sayfasına götürülmez, yerinde "açık değil" yazar.
export function ArkonAyarBolumu() {
  return <ArkonYeniEkrani sabitSayfa="ayarlar" />;
}

type SabitSayfa = TasinanSayfa | 'ayarlar';
const RET_BILDIRIMI_SINIRI = 20;

function ArkonYeniEkrani({ sabitSayfa }: { sabitSayfa?: SabitSayfa }) {
  const oturum = useOturum();
  const islemler = useMemo(() => oturum.data?.islemler ?? [], [oturum.data]);
  const ben = useQuery({ queryKey: anahtarlar.ben, queryFn: () => api.get<ArkonBenCevabi>('/arkon/ben') });
  const { tema } = useTema();
  const { bildir, kaldir } = useBildirim();
  const cikis = useCikis();
  const { sayfa: adresSayfasi } = useParams();
  const saltOkunur = (sabitSayfa ?? adresSayfasi) === 'onizle';
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
  // Köprünün ret bildirimleri metnine göre: ekran aynı reddi kendi iletisiyle söyleyince köprününki kaldırılır.
  const retBildirimleri = useRef(new Map<string, number>());
  const tmiRetiniUstlen = useCallback((ileti: string) => {
    const metin = tmiRetMetni(ileti);
    const no = retBildirimleri.current.get(metin);
    if (no === undefined) return;
    retBildirimleri.current.delete(metin);
    kaldir(no);
  }, [kaldir]);

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
      reddedildi: (ileti) => {
        const no = bildirRef.current('hata', `CORE: ${ileti}`);
        const retler = retBildirimleri.current;
        retler.delete(ileti);
        retler.set(ileti, no);
        // Üstlenilmeyen retler birikmesin: en eskisi düşer (bildirim yerinde kalır, yalnız kaldırılamaz).
        const eski = retler.keys().next().value;
        if (retler.size > RET_BILDIRIMI_SINIRI && eski !== undefined) retler.delete(eski);
      },
      uyari: (ileti) => bildirRef.current('bilgi', `CORE: ${ileti}`),
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
      sabitSayfa={sabitSayfa}
      islemler={islemler}
      arkonRolu={kisi.rol}
      saltOkunur={saltOkunur}
      onizleme={onizleme}
      onizlemeYaz={onizlemeYaz}
      devralmalar={devralmalar}
      siradakiniKapat={() => devralmalarYaz((l) => l.slice(1))}
      tmiRetiniUstlen={tmiRetiniUstlen}
    />
  );
}

interface AcikEkranOzellikleri {
  depo: ArkonDeposu;
  sabitSayfa: SabitSayfa | undefined;
  islemler: readonly string[];
  arkonRolu: ArkonRolu;
  saltOkunur: boolean;
  onizleme: string | null;
  onizlemeYaz: (paketId: string | null) => void;
  devralmalar: readonly MakineDoluRedi[];
  siradakiniKapat: () => void;
  tmiRetiniUstlen: (ileti: string) => void;
}

function AcikEkran({ depo, sabitSayfa, islemler, arkonRolu, saltOkunur, onizleme, onizlemeYaz, devralmalar, siradakiniKapat, tmiRetiniUstlen }: AcikEkranOzellikleri) {
  const parametreler = useParams();
  const adres = sabitSayfa ?? parametreler.sayfa;
  const kimlik = sabitSayfa === undefined ? parametreler.kimlik : undefined;
  const gezin = useNavigate();
  const { bildir } = useBildirim();
  const [arama, aramaYaz] = useSearchParams();

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
    mutationFn: (red: MakineDoluRedi) => (red.tur === 'calisma'
      ? api.post<{ tamam: true }>('/arkon/calisma-devral', {
        emirId: red.emirId, ...(red.isEmriId === null ? {} : { isEmriId: red.isEmriId }), cid: red.cid,
      } satisfies CalismaDevralGovdesi)
      : api.post<{ tamam: true }>('/arkon/makine-devral', {
        emirId: red.devralEmirId, kullanimId: red.doluOlan.kullanimId, cid: red.cid, durdurulanEmirId: red.doluOlan.emir.id,
      } satisfies MakineDevralGovdesi)),
    onSuccess: (_c, red) => {
      bildir('tamam', red.tur === 'calisma' ? 'İş devralındı; çalışma sizin adınıza sürüyor.' : `${red.doluOlan.emir.emirNo} durduruldu; işiniz başlatıldı.`);
      siradakiniKapat();
    },
    onError: (hata) => { bildir('hata', `CORE: ${hataIletisi(hata, 'Devralınamadı.')}`); siradakiniKapat(); },
  });
  const siradaki = devralmalar[0] ?? null;

  const maddeler = useMemo(() => sekmeMaddeleri(), []);
  const baglam = useMemo((): ArkonBaglami | null => {
    if (ayarlar === null) return null;
    return {
      depo, kisi, ayarlar, ayarlariYenile, saltOkunur,
      yetkiVar: (k: Perm) => yetkiVar(kisi, ayarlar.yetkiler, k),
      sayfaGorunur: (s: string) => sayfaGorunur(s, kisi, ayarlar.yetkiler),
      acilabilir: (s: string) => sayfaAcilabilir(s, maddeler, islemler, (x) => sayfaGorunur(x, kisi, ayarlar.yetkiler)),
      git: (s: string, k?: string) => { void gezin(sayfaAdresi(s, k)); },
      tmiyeGit: (h: TmiHedefi) => { const yol = TMI_HEDEFLERI[h]; if (yol !== undefined) void gezin(yol); },
      onizle: (paketId: string) => onizlemeYaz(paketId),
      tmiRetiniUstlen,
    };
  }, [depo, kisi, ayarlar, ayarlariYenile, saltOkunur, gezin, onizlemeYaz, maddeler, islemler, tmiRetiniUstlen]);
  const [kok, kokYaz] = useState<HTMLDivElement | null>(null);
  // Terminal dokunmatiktir: küçültülürse dokunma hedefi 44 pikselin altına iner; yalnız yüksekliği alana oturur. Dar düzeni de
  // pencere genişliğine bakar (705 b): 1024 tablette menü açıkken alan 900'ün altına düşse de geniş düzen kalır.
  const darAlan = useOlcek(kok, adres !== 'operator');
  const onayGorur = adres !== 'operator' && maddeler.some((m) => m.anahtar === 'kalite' && maddeGorunurMu(m, islemler));
  const onay = useOnaySayisi(depo, onayGorur);
  // Kalite onayları maddesi kalite onayı bekleyen paket sayısını taşır; sayı kabuğun şeridinde çizilir. Numune sayısı Kalite Merkezi'ndedir.
  const sayacYaz = useCerceveSayacYazici(KOK);
  useEffect(() => { sayacYaz({ kalite: onay > 0 ? onay : null }); }, [sayacYaz, onay]);
  // Ctrl K'nin ve Malzeme Teslim'in "İş emrini aç"ı Üretim Terminali'ne `?emir=&kart=` ile gelir (çerçevedeki gibi): istek operatör
  // ekranının okuduğu pencereye bırakılır ve adresten silinir, yenilemede yeniden seçmez. Terminal kalıcı rotadır: başka sayfadayken
  // gizli kurulu kalır ve o sayfanın adresini görür; Adım Durumu da `?emir=` taşır. Gizliyken okursa o sayfanın seçimini silerdi.
  const ekranGorunur = useEkranGorunur();
  const secilecekEmir = adres === 'operator' && ekranGorunur ? emirParametresiOku(arama.get(EMIR_PARAMETRESI)) : null;
  useEffect(() => {
    if (secilecekEmir === null) return;
    emirSeciminiGonder(window, secilecekEmir, emirParametresiOku(arama.get(KART_PARAMETRESI)));
    aramaYaz((a) => { const y = new URLSearchParams(a); y.delete(EMIR_PARAMETRESI); y.delete(KART_PARAMETRESI); return y; }, { replace: true });
  }, [secilecekEmir, arama, aramaYaz]);

  if (baglam === null) return <DurumKutusu durum="yukleniyor" />;

  // Madde hem TMI menüsünde (işlemle) hem Arkon'un sayfa yetkisinde görünür olmalı; TMI ekranı olan madde yalnız TMI işlemine bakar.
  const gorunur = (m: SekmeMaddesi): boolean =>
    maddeGorunurMu(m, islemler) && (Object.hasOwn(SAYFA_DISI, m.anahtar) || baglam.sayfaGorunur(m.anahtar));
  const sekmeler = maddeler.filter(gorunur);

  // Ayrı sayfa (Üretim Terminali, Kuyruk) sekmede değil; kuralı sayfaAcilabilir'dedir.
  const ayriAcik = (s: ArkonSayfasi): boolean => (SAYFALAR[s] as SayfaTanimi).ayri === true && baglam.acilabilir(s);

  // Rolün giriş sayfası: yalın adres ve göremediği sayfa buraya gider (eskisi göremediği sayfadan ilk açık sayfaya geçerdi: baslat.ts firstPage).
  const girisHedefi = (): string | null => {
    const giris = arkonGirisSayfasi(arkonRolu, islemler);
    if (sayfaMi(giris) && ayriAcik(giris)) return sayfaAdresi(giris);
    const hedef = sekmeler.find((m) => m.anahtar === giris) ?? sekmeler.find((m) => !Object.hasOwn(SAYFA_DISI, m.anahtar));
    return hedef === undefined ? null : sayfaAdresi(hedef.anahtar);
  };

  if (adres === undefined) {
    const hedef = girisHedefi();
    if (hedef === null) return <DurumKutusu durum="bos" mesaj="Üretim Hazırlık'ta size açık sayfa yok." />;
    return <Navigate replace to={hedef} />;
  }

  const sayfa: ArkonSayfasi | null = sayfaMi(adres) ? adres : null;
  const tanim: SayfaTanimi | null = sayfa === null ? null : SAYFALAR[sayfa];
  const secili: string | null = sayfa === null ? null : (tanim?.ust ?? sayfa);
  const ayri = sayfa !== null && tanim?.ayri === true;
  const acik = sayfa !== null && (ayri
    ? ayriAcik(sayfa)
    : secili !== null && sekmeler.some((m) => m.anahtar === secili) && baglam.sayfaGorunur(sayfa));
  const etiket = ayri ? tanim?.baslik : maddeler.find((m) => m.anahtar === secili)?.baslik;
  if (!acik && !ayri && sayfa !== null && sabitSayfa === undefined) {
    const hedef = girisHedefi();
    if (hedef !== null && hedef !== sayfaAdresi(sayfa)) return <Navigate replace to={hedef} />;
  }

  const Ekran = tanim?.ekran;
  return (
    <ArkonBaglamiKaynagi.Provider value={baglam}>
      <ArkonCizimOrtami>
      <ArkonDarAlanKaynagi.Provider value={darAlan}>
      <div className="tc-ay" ref={kokYaz}>
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
      </ArkonDarAlanKaynagi.Provider>
      {onizleme !== null && <OnizlemePenceresi paketId={onizleme} baglam={baglam} kapat={() => onizlemeYaz(null)} />}
      <MakineDevralPenceresi
        red={siradaki}
        yukleniyor={devral.isPending}
        onayla={() => { if (siradaki !== null) devral.mutate(siradaki); }}
        vazgec={() => {
          if (siradaki !== null) bildir('bilgi', `CORE: ${devralMetni(siradaki)} İşiniz başlatılmadı.`);
          siradakiniKapat();
        }}
      />
      </ArkonCizimOrtami>
    </ArkonBaglamiKaynagi.Provider>
  );
}

// Ekran ölçeği (eski useFit): sayfa 1600x900 tasarım alanına göre ölçeklenir. Ölçek ve ölçekli görünür yükseklik kökte değişken
// olarak durur (arkon-yeni.css zoom; tam yükseklikli düzenler --tc-ay-vh kullanır). Kabuk alanı değişince yeniden hesaplanır.
function useOlcek(kok: HTMLDivElement | null, olcekli: boolean): boolean | null {
  const [mobilMi, mobilYaz] = useState<boolean | null>(null);
  useEffect(() => {
    const alan = kutuluAta(kok);
    if (!kok || !alan) return undefined;
    const uygula = () => {
      const kutu = alan.getBoundingClientRect();
      const yukseklik = Math.max(0, window.innerHeight - Math.max(0, kutu.top));
      const genislik = scrollbarsizGenislik(alan);
      const olcek = olcekHesapla(genislik, yukseklik, yerel.oku<number>('scale'));
      const mobil = olcekli ? olcek.mobil : olcekHesapla(window.innerWidth, window.innerHeight).mobil;
      const z = olcekli ? olcek.z : 1;
      kok.style.setProperty('--tc-ay-olcek', String(z));
      kok.style.setProperty('--tc-ay-vh', `${Math.round(yukseklik / z)}px`);
      // Alanın altında kalan kabuk parçası (telefonda alt menü): tam ekran düzen onu da düşer, yoksa sayfa o kadar kayar.
      const alt = kutu.height > 0 ? Math.max(0, window.innerHeight - kutu.bottom) : 0;
      kok.style.setProperty('--tc-ay-alt', `${Math.round(alt / z)}px`);
      kok.toggleAttribute('data-mobil', mobil);
      // Ölçülemeyen alan (genişlik 0) ve terminal null verir; dar düzen kararı pencere genişliğine düşer (useDarEkran).
      mobilYaz(olcekli && genislik > 0 ? mobil : null);
    };
    uygula();
    const izleyici = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(uygula);
    izleyici?.observe(alan);
    window.addEventListener('resize', uygula);
    window.addEventListener('orientationchange', uygula);
    return () => { izleyici?.disconnect(); window.removeEventListener('resize', uygula); window.removeEventListener('orientationchange', uygula); };
  }, [kok, olcekli]);
  return mobilMi;
}

// Alanın dikey kaydırma çubuğu dahil genişliği. clientWidth çubuk çıkınca daralır; ölçek ve mobil kararı genişliğe bağlı,
// içerik yüksekliği ölçeğe bağlı olduğundan çubuğun çıkıp kaybolması sayfayı durmadan titretiyordu (çubuk genişliği ölçülmez).
function scrollbarsizGenislik(alan: HTMLElement): number {
  const stil = getComputedStyle(alan);
  const cubuk = alan.offsetWidth - alan.clientWidth - (parseFloat(stil.borderLeftWidth) || 0) - (parseFloat(stil.borderRightWidth) || 0);
  return alan.clientWidth + Math.max(0, cubuk);
}

// Ölçü, kutusu olan ilk atadan alınır: kalıcı rota sarmalayıcısı (Üretim Terminali) `display: contents` ya da gizliyken `none` olur;
// kutusuz atanın genişliği ve üstü 0 okunur; alan dar ve pencere boyunda sayılır, kök şeridin altından taşar.
function kutuluAta(kok: HTMLElement | null): HTMLElement | null {
  let e = kok?.parentElement ?? null;
  while (e !== null && e.parentElement !== null && /^(contents|none)$/.test(getComputedStyle(e).display)) e = e.parentElement;
  return e;
}

// Kalitede bekleyen ya da ölçülen numune sayısı (baslat.ts nWait): numune ve sonuç iletisinde ve 20 sn'de bir yeniden sayılır.
// Yalnız onay maddesini gören, terminal dışındaki ekranda sayar; terminal her paket iletisinde bütün paketleri okumasın.
function useOnaySayisi(depo: ArkonDeposu, acik: boolean): number {
  const [n, nYaz] = useState(0);
  useEffect(() => {
    if (!acik) { nYaz(0); return undefined; }
    let iptal = false;
    let bekleyen: ReturnType<typeof setTimeout> | null = null;
    const say = async () => {
      try {
        const ps = await depo.DB.all('pkgs') as Parameters<typeof onayBekliyor>[0][];
        if (!iptal) nYaz(ps.filter(onayBekliyor).length);
      } catch { /* okunamazsa son sayı kalır */ }
    };
    void say();
    const birak = depo.Bus.on((m) => { if (/^pkg-approv/.test(m.type)) { if (bekleyen) clearTimeout(bekleyen); bekleyen = setTimeout(() => { void say(); }, 300); } });
    const t = setInterval(() => { void say(); }, 20000);
    return () => { iptal = true; birak(); clearInterval(t); if (bekleyen) clearTimeout(bekleyen); };
  }, [depo, acik]);
  return n;
}

// "Operatör gözüyle" önizleme (operator-parcalar.ts PreviewOv): operatör ekranı 1600x900 cihaz alanında, pencereye sığacak
// ölçekte çizilir. Pencerenin içi salt okunurdur. 3614: aynı emrin öteki operasyonları şeritten seçilir; geniş pencerede
// en çok iki operasyon yan yana çizilir (her çerçeve kendi istasyonuyla), dar pencerede tek çerçeve ve tür seçici kalır.
const OnizlemeCercevesi = lazy(async () => ({ default: (await import('./operator/index.tsx')).OnizlemeCercevesi }));
// Pencere genişliği: ikiliden geniş yan yana ölçekli çerçeveler; altı tek çerçeve, ölçeksiz, pencere genişliğinde (telefon ve tablet düzeni).
const IKILI_EN = 1000;
const ORTAK_SEKMELER: readonly (readonly [string, string])[] = [['draw', 'Resim'], ['tl', 'Talimatlar'], ['steps', 'Adımlar']];
const IKILI_TASARIM = { en: 1100, boy: 800 };
interface OnizlemePaketi { id: string; no: string; op: string; machine: string; tur: string }
function OnizlemePenceresi({ paketId, baglam, kapat }: { paketId: string; baglam: ArkonBaglami; kapat: () => void }) {
  const [sahne, sahneYaz] = useState<HTMLDivElement | null>(null);
  const [cihaz, cihazYaz] = useState<HTMLDivElement | null>(null);
  const [adaylar, adaylarYaz] = useState<OnizlemePaketi[]>([]);
  const [secili, seciliYaz] = useState<string[]>([paketId]);
  const [kip, kipYaz] = useState<'iki' | 'dar'>('iki');
  const [buyuk, buyukYaz] = useState<string | null>(null);
  const dar = kip === 'dar';
  useEffect(() => {
    let canli = true;
    void baglam.depo.DB.all('pkgs').then((l) => {
      if (!canli) return;
      adaylarYaz((l as { id: string; no?: string; op?: string; machine?: string; opType?: string }[]).map((x) => ({
        id: x.id, no: x.no ?? '', op: x.op ?? '', machine: x.machine ?? '', tur: x.opType ?? 'cnc',
      })));
    }, () => undefined);
    return () => { canli = false; };
  }, [baglam.depo]);
  const kare = buyuk !== null && secili.includes(buyuk) ? [buyuk] : kip === 'iki' ? secili.slice(0, 2) : secili.slice(0, 1);
  useEffect(() => {
    if (!sahne || !cihaz) return undefined;
    const uygula = () => {
      const w = sahne.clientWidth;
      const yeniKip = w >= IKILI_EN ? 'iki' : 'dar';
      kipYaz(yeniKip);
      const n = yeniKip === 'iki' && buyuk === null ? Math.min(2, Math.max(1, secili.length)) : 1;
      // Dar pencerede ekran ölçeklenmez: pencere genişliğinde, operatör ekranının kendi dar düzeniyle çizilir.
      const tw = n === 2 ? IKILI_TASARIM.en : TASARIM_GENISLIGI;
      const th = n === 2 ? IKILI_TASARIM.boy : TASARIM_YUKSEKLIGI;
      const k = yeniKip !== 'dar' ? Math.max(0.1, Math.min((w - 40 - (n - 1) * 12) / (n * tw), (sahne.clientHeight - 80) / th)) : 1;
      const en = yeniKip !== 'dar' ? tw : Math.max(280, w - 8);
      const boy = yeniKip !== 'dar' ? th : Math.max(320, sahne.clientHeight - 8);
      cihaz.style.setProperty('--tc-ay-onizleme-olcek', String(k));
      cihaz.style.setProperty('--tc-ay-onizleme-en', `${en}px`);
      cihaz.style.setProperty('--tc-ay-onizleme-boy', `${boy}px`);
      cihaz.style.setProperty('--tc-ay-vh', `${boy}px`);
    };
    uygula();
    const izleyici = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(uygula);
    izleyici?.observe(sahne);
    window.addEventListener('resize', uygula);
    return () => { izleyici?.disconnect(); window.removeEventListener('resize', uygula); };
  }, [sahne, cihaz, secili.length, buyuk]);
  const salt = useMemo((): ArkonBaglami => ({ ...baglam, saltOkunur: true }), [baglam]);
  const bul = (id: string) => adaylar.find((x) => x.id === id) ?? null;
  const ilk = bul(paketId);
  const kardesler = adaylar.filter((x) => ilk !== null && x.no === ilk.no);
  const digerleri = adaylar.filter((x) => !kardesler.some((k) => k.id === x.id));
  const turAdi = (x: OnizlemePaketi) => (IS_TURLERI[x.tur as keyof typeof IS_TURLERI] ?? IS_TURLERI.cnc).l;
  const [ortakSekme, ortakSekmeYaz] = useState<string | null>(null);
  const sekmeGit = (id: string) => window.dispatchEvent(new CustomEvent(ONIZLEME_SEKME_OLAYI, { detail: id }));
  const degistir = (id: string) => seciliYaz((s) => {
    buyukYaz(null);
    if (kip !== 'iki') return [id];
    if (s.includes(id)) return s.length > 1 ? s.filter((x) => x !== id) : s;
    return s.length >= 2 ? [s[1] ?? id, id] : [...s, id];
  });
  const ust = (
    <header className="tc-ay-onizleme-ust">
      <span className="tc-ay-onizleme-baslik">Operatör gözüyle önizleme{kare.length > 1 ? ` · ${String(kare.length)} operasyon yan yana` : (bul(kare[0] ?? '')?.machine ?? yerel.oku<string>('pvStation') ?? '') ? ` · ${bul(kare[0] ?? '')?.machine ?? yerel.oku<string>('pvStation') ?? ''} ekranı` : ''} · kayıt yapılmaz</span>
      <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
    </header>
  );
  const chip = (x: OnizlemePaketi) => (
    <button key={x.id} type="button" className="tc-ay-onizleme-sec" aria-pressed={kare.includes(x.id)} onClick={() => degistir(x.id)} title={`${x.no} · ${x.op}`}>
      <Simge ad={kare.includes(x.id) ? 'check' : (IS_TURLERI[x.tur as keyof typeof IS_TURLERI]?.simge ?? 'gauge')} boyut="k" /><span>{x.op || x.no}</span><small>{turAdi(x)}</small>
    </button>
  );
  return (
    <Pencere acik kapat={kapat} baslik="Operatör gözüyle önizleme" tur="tam" ust={ust}>
      <div className="tc-ay-onizleme-govde">
        <div className="tc-ay-onizleme-seritlar">
        {kardesler.length + digerleri.length > 1 ? (
          <div className="tc-ay-onizleme-serit" role="group" aria-label="Operasyonlar">
            <span className="tc-ay-onizleme-etiket">{kip === 'iki' ? 'Yan yana (en çok 2)' : 'Operasyon'}</span>
            <span className="tc-ay-onizleme-cipler">{kardesler.map(chip)}</span>
            {digerleri.length > 0 ? (
              <select className="tc-ay-onizleme-baska" aria-label="Başka paket ekle" value="" onChange={(e) => { if (e.target.value) degistir(e.target.value); }}>
                <option value="">Başka paket…</option>
                {digerleri.map((x) => <option key={x.id} value={x.id}>{x.no} · {x.op}</option>)}
              </select>
            ) : null}
          </div>
        ) : null}
        {kare.length > 1 ? <div className="tc-ay-onizleme-serit" role="group" aria-label="Ortak sekme">
          <span className="tc-ay-onizleme-etiket">Çerçevelerde sekme</span>
          {ORTAK_SEKMELER.map(([id, ad]) => <button key={id} type="button" className="tc-ay-onizleme-sec" aria-pressed={ortakSekme === id} onClick={() => { ortakSekmeYaz(id); sekmeGit(id); }}>{ad}</button>)}
        </div> : null}
        </div>
        <div ref={sahneYaz} className="tc-ay-onizleme-sahne">
          <div ref={cihazYaz} className="tc-ay-onizleme-cihaz" data-adet={kare.length} data-dar={dar ? '' : undefined}>
            <ArkonBaglamiKaynagi.Provider value={salt}>
              {kare.map((id) => {
                const x = bul(id);
                return (
                  <figure key={id} className="tc-ay-onizleme-kare" aria-label={x ? `${x.op} · ${turAdi(x)}` : 'Operasyon'}>
                    {kare.length > 1 || buyuk !== null ? (
                      <figcaption>
                        <b>{x?.op || x?.no}</b>{x ? <small>{turAdi(x)} · {x.machine}</small> : null}
                        {secili.length > 1 && kip === 'iki' ? <button type="button" className="tc-ay-onizleme-sec" onClick={() => buyukYaz(buyuk === null ? id : null)}><Simge ad={buyuk === null ? 'expand' : 'down'} boyut="k" />{buyuk === null ? 'Büyüt' : 'Yan yana dön'}</button> : null}
                      </figcaption>
                    ) : null}
                    <div className="tc-ay-onizleme-ekran">
                      <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                        <OnizlemeCercevesi kimlik={id} istasyon={x?.machine ?? (yerel.oku<string>('pvStation') ?? '')} />
                      </Suspense>
                    </div>
                  </figure>
                );
              })}
            </ArkonBaglamiKaynagi.Provider>
          </div>
        </div>
      </div>
    </Pencere>
  );
}


// Sayfanın adresle açılıp açılmadığı, açılışın kuralıyla aynı: ayrı sayfa (Üretim Terminali, Kuyruk) kendi TMI işlemiyle, sekmedeki
// sayfa menü maddesinin işlemiyle; ikisi de Arkon sayfa yetkisi ister. Kuyruk salt okunurdur ve eskisi Arkon sayfa yetkisi istemiyordu
// (pano-planlama.ts KuyrukApp): Plan Kuyruğu yetkisi olmayan operatör de görür, TMI işlemi yeter.
export function sayfaAcilabilir(s: string, maddeler: readonly SekmeMaddesi[], islemler: readonly string[], arkonGorur: (s: string) => boolean): boolean {
  if (!sayfaMi(s)) return false;
  const t: SayfaTanimi = SAYFALAR[s];
  if (t.ayri === true) return t.islem !== undefined && islemler.includes(t.islem) && (s === 'kuyruk' || arkonGorur(s));
  const sekme = t.ust ?? s;
  const madde = maddeler.find((m) => m.anahtar === sekme);
  return madde !== undefined && maddeGorunurMu(madde, islemler) && arkonGorur(sekme) && arkonGorur(s);
}
