import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { ArkonBenCevabi, ArkonRolu, MakineDevralGovdesi } from '#paylasilan/sozlesme/arkon.ts';
import { bekleyenKayitIletisi } from '../../../../../arkon/web/src/data/bekleyen-kayit.ts';
import { DurumKutusu, Rozet, Sekmeler, useBildirim, type RozetTonu } from '../../../ortak/arayuz/index.ts';
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
import type { Perm } from './cekirdek/tipler.ts';
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

  // Taşıyıcının çağırdıkları her açılışta yeniden kurulmasın diye son değerler ref'te tutulur.
  const bildirRef = useRef(bildir);
  bildirRef.current = bildir;
  const cikisRef = useRef(cikis.mutate);
  cikisRef.current = cikis.mutate;
  const saltOkunurRef = useRef(saltOkunur);
  saltOkunurRef.current = saltOkunur;
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
  devralmalar: readonly MakineDoluRedi[];
  siradakiniKapat: () => void;
}

function AcikEkran({ depo, islemler, arkonRolu, saltOkunur, devralmalar, siradakiniKapat }: AcikEkranOzellikleri) {
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
    };
  }, [depo, kisi, ayarlar, ayarlariYenile, saltOkunur, gezin]);

  if (baglam === null) return <DurumKutusu durum="yukleniyor" />;

  // Madde hem TMI menüsünde (işlemle) hem Arkon'un sayfa yetkisinde görünür olmalı; TMI ekranı olan madde yalnız TMI işlemine bakar.
  const gorunur = (m: SekmeMaddesi): boolean =>
    maddeGorunurMu(m, islemler) && (Object.hasOwn(SAYFA_DISI, m.anahtar) || baglam.sayfaGorunur(m.anahtar));
  const sekmeler = maddeler.filter(gorunur);

  if (adres === undefined) {
    const giris = arkonGirisSayfasi(arkonRolu, islemler);
    const hedef = sekmeler.find((m) => m.anahtar === giris) ?? sekmeler.find((m) => !Object.hasOwn(SAYFA_DISI, m.anahtar));
    if (hedef === undefined) return <DurumKutusu durum="bos" mesaj="Üretim Hazırlık'ta size açık sayfa yok." />;
    return <Navigate replace to={sayfaAdresi(hedef.anahtar)} />;
  }

  const sayfa: ArkonSayfasi | null = sayfaMi(adres) ? adres : null;
  const tanim: SayfaTanimi | null = sayfa === null ? null : SAYFALAR[sayfa];
  const secili: string | null = sayfa === null ? null : (tanim?.ust ?? sayfa);
  const acik = sayfa !== null && secili !== null && sekmeler.some((m) => m.anahtar === secili) && baglam.sayfaGorunur(sayfa);
  const madde = maddeler.find((m) => m.anahtar === secili);

  const sec = (anahtar: string) => {
    const disari = SAYFA_DISI[anahtar];
    void gezin(disari ?? sayfaAdresi(anahtar));
  };

  const Ekran = tanim?.ekran;
  return (
    <ArkonBaglamiKaynagi.Provider value={baglam}>
      <div className="tc-ay">
        {sekmeler.length > 0 && (
          <Sekmeler etiket="Üretim Hazırlık" sekmeler={sekmeler} secili={secili ?? ''} sec={sec} />
        )}
        <div className="tc-ay-serit">
          <BaglantiDurumu durum={durum} />
          {saltOkunur && <span role="status">Önizleme: kayıt yapılmaz.</span>}
        </div>
        {!acik || Ekran === undefined || sayfa === null
          ? <DurumKutusu durum="bos" mesaj="Bu sayfa bulunamadı ya da size açık değil." />
          : (
            <section className="tc-ay-icerik" aria-label={madde?.baslik ?? 'Önizleme'} data-sayfa={sayfa}>
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <Ekran sayfa={sayfa} kimlik={kimlik ?? null} />
              </Suspense>
            </section>
          )}
        {acik && !saltOkunur && sayfa !== null && <CagriBandi sayfa={sayfa} />}
      </div>
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

// Bağlantı ve gönderim kuyruğu (eski şeritteki RailStatus): renk tek başına anlam taşımaz, durum metniyle yazılır.
export function baglantiOzeti(d: Pick<ArkonDurumu, 'memory' | 'mode' | 'online' | 'pending' | 'base'>): { ton: RozetTonu; metin: string; aciklama: string } {
  if (d.memory) return { ton: 'hata', metin: 'Kayıt riski', aciklama: 'Cihaz deposu açılamadı · gönderilmemiş kayıtlar sekme kapanınca kaybolur' };
  if (d.mode !== 'server') return { ton: 'pasif', metin: 'Yerel', aciklama: 'Yerel mod · veriler bu cihazda' };
  if (!d.online) return { ton: 'hata', metin: 'Kopuk', aciklama: `Sunucuya ulaşılamıyor · ${d.pending || 0} kayıt bekliyor (bağlantı gelince gönderilir)` };
  if (d.pending) return { ton: 'uyari', metin: `${d.pending} gönderiliyor`, aciklama: `${d.pending} kayıt gönderiliyor` };
  return { ton: 'tamam', metin: 'Bağlı', aciklama: 'Sunucuya bağlı' };
}

function BaglantiDurumu({ durum }: { durum: ArkonDurumu }) {
  const o = baglantiOzeti(durum);
  return <span className="tc-ay-baglanti" title={o.aciklama} role="status" aria-label={o.aciklama}><Rozet ton={o.ton}>{o.metin}</Rozet></span>;
}
