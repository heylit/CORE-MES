import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DurumKutusu, HataSiniri, Sekmeler, type Sekme } from '../../../ortak/arayuz/index.ts';
import { useKurumAdi } from '../../../ortak/veri/kurum.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { menuSayaclari } from './is-merkezi/yapilacaklar.ts';
import { altAcik, bolumunu, gorunurBolumler, izinKur, TASINAN_GORUNUMLER, UST_GORUNUM, type Bolum } from './izinler.ts';
import { degerler } from './kurallar.ts';
import { SahibindeAc } from './sahibinde.tsx';
import { gorunumEkrani } from './sekmeler.ts';
import type { KoleksiyonAdi } from './tipler.ts';
import {
  kisiKimligi, PortalBaglamiIcerigi, useDegisiklikIzle, usePortalAcilis, usePortalDeposu, type PortalBaglami,
} from './veri.ts';
import './portal-yeni.css';

// Müşteri ve Tedarikçi Portalı, firma tarafı, TS ekranı (soru 199 b). Eski çerçevenin yanında ikinci yolda açılır; alıma kadar
// yalnız yeni ekran kapısından geçen kişide görünür. Bölüm ve alt görünüm düzeni prototipin v4 kabuğudur; arama, bildirim
// paneli, tanıtım ve kılavuz TMI kabuğundadır (203 a).

export const KOK = '/portal/yeni';
// Çerçeveyle aynı giriş koşulu (PortalCercevesi OKUMA_ISLEMLERI).
const OKUMA_ISLEMLERI = ['sayfa.portal', 'portal.oku', 'portal.yaz'];
// Bölüm sayaçlarının okuduğu koleksiyonlar. Okunamayan koleksiyonu sunucu boş döner; sayaç sıfır kalır.
const MENU_KOLEKSIYONLARI: readonly KoleksiyonAdi[] = [
  'users', 'parties', 'approvals', 'requests', 'orders', 'rfqs', 'priceReqs', 'contracts', 'docs', 'ncrs', 'payments', 'recons',
];
export const KURUM_ADI = 'TMI';
const DAKIKA_MS = 60_000;

export function PortalYeni() {
  return (
    <YeniEkranKapisi>
      <PortalGirisi />
    </YeniEkranKapisi>
  );
}

function PortalGirisi() {
  const oturum = useOturum();
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  const girebilir = oturum.data?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;
  if (!girebilir) return <DurumKutusu durum="bos" mesaj="Müşteri ve Tedarikçi Portalı'nı görme yetkiniz yok." />;
  return <PortalKabugu />;
}

// Göreli süreler ve vade hesapları dakikada bir yenilenir.
function useSimdi(): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const z = window.setInterval(() => setSimdi(Date.now()), DAKIKA_MS);
    return () => window.clearInterval(z);
  }, []);
  return simdi;
}

// Görünümün bağlı olduğu alt sekme. Sipariş ayrıntısı ve yeni sipariş türüne göre satış ya da satın alma altındadır.
export function ustGorunum(gorunum: string, id: string | null, tur: string | null): string {
  if (gorunum === 'neworder') return id === 'sales' ? 'sorders' : 'porders';
  if (gorunum === 'order') return tur === 'sales' ? 'sorders' : 'porders';
  return UST_GORUNUM[gorunum] ?? gorunum;
}

export function adres(gorunum: string, id?: string | null, ek?: Readonly<Record<string, string>>): string {
  const p = new URLSearchParams(ek);
  if (id) p.set('id', id);
  const sorgu = p.toString();
  return `${KOK}${gorunum === 'home' ? '' : `/${gorunum}`}${sorgu ? `?${sorgu}` : ''}`;
}

function PortalKabugu() {
  const acilis = usePortalAcilis(true);
  const hazir = acilis.isSuccess;
  useDegisiklikIzle(hazir);
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(MENU_KOLEKSIYONLARI, hazir);
  const kurumAdi = useKurumAdi() ?? KURUM_ADI;
  const simdi = useSimdi();
  const git = useNavigate();
  const params = useParams();
  const [arama] = useSearchParams();
  const gorunum = params['gorunum'] ?? 'home';
  const id = arama.get('id');

  const ben = acilis.data;
  const kimlik = ben ? kisiKimligi(ben.kisi.id) : '';
  const kullanici = depo.users[kimlik] ?? null;
  const izin = useMemo(() => izinKur(kullanici), [kullanici]);
  const onaylayan = useMemo(
    () => ({ id: kimlik, role: kullanici?.role ?? '', tmiRoller: kullanici?.tmiRoller ?? [] }),
    [kimlik, kullanici],
  );
  const kendiOnayiVar = degerler(depo.approvals).some((a) => a.requestedBy === kimlik);
  const bolumler = useMemo(() => gorunurBolumler(izin, kendiOnayiVar), [izin, kendiOnayiVar]);
  const sayac = useMemo(() => menuSayaclari(depo, simdi, onaylayan), [depo, simdi, onaylayan]);

  const baglam = useMemo<PortalBaglami | null>(() => (ben ? {
    ben, kullanici, kisiKimligi: kimlik, izin, onaylayan, kurumAdi, simdi,
    yol: adres,
    git: (g, k, ek) => { void git(adres(g, k, ek)); },
  } : null), [ben, kullanici, kimlik, izin, onaylayan, kurumAdi, simdi, git]);

  if (acilis.isError) {
    return <DurumKutusu durum="hata" mesaj="Müşteri ve Tedarikçi Portalı açılamadı." yenile={() => { void acilis.refetch(); }} />;
  }
  if (!baglam || (yukleniyor && kullanici === null)) return <DurumKutusu durum="yukleniyor" mesaj="Portal verileri yükleniyor…" />;
  if (hata && kullanici === null) return <DurumKutusu durum="hata" mesaj="Portal verileri okunamadı." yenile={yenile} />;

  const ust = ustGorunum(gorunum, id, arama.get('tur'));
  const bolum = bolumunu(bolumler, ust);
  const tasinan = TASINAN_GORUNUMLER.has(gorunum);
  const acik = altAcik(izin, gorunum);
  const Ekran = gorunumEkrani(gorunum);

  return (
    <PortalBaglamiIcerigi.Provider value={baglam}>
      <div className="tc-pt">
        <BolumSekmeleri bolumler={bolumler} secili={bolum} ust={ust} sayac={sayac} sec={(g) => baglam.git(g)} />
        <div className="tc-pt-icerik">
          <HataSiniri sifirla={`${gorunum}:${id ?? ''}`} mesaj="Bu görünüm açılamadı.">
            {!tasinan ? <SahibindeAc gorunum={gorunum} tur={gorunum === 'neworder' ? id : arama.get('tur')} />
              : !acik ? <DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkiniz yok." />
              : Ekran ? <Ekran id={id} />
              : <DurumKutusu durum="bos" mesaj="Bu bölüm hazırlanıyor." />}
          </HataSiniri>
        </div>
      </div>
    </PortalBaglamiIcerigi.Provider>
  );
}

const sayili = (baslik: string, n: number | undefined): string => (n ? `${baslik} (${String(n)})` : baslik);

interface BolumSekmeleriOzellikleri {
  bolumler: readonly Bolum[];
  secili: Bolum | undefined;
  ust: string;
  sayac: Readonly<Record<string, number>>;
  sec: (gorunum: string) => void;
}

// Prototipte sol menü bölümleri ve üstte alt sekmeler vardı; TMI kabuğunda sol menü kabuğundur, bölümler iki sekme
// satırına iner. Sayılar adın yanında yazılır.
function BolumSekmeleri({ bolumler, secili, ust, sayac, sec }: BolumSekmeleriOzellikleri) {
  const bolumSekmeleri: Sekme<string>[] = bolumler.map((b) => ({
    anahtar: b.anahtar, simge: b.simge,
    baslik: sayili(b.baslik, b.anahtar === 'approvals' ? sayac['approvals'] : b.altlar.reduce((t, a) => t + (sayac[a.anahtar] ?? 0), 0)),
  }));
  const altlar = secili && secili.altlar.length > 1 ? secili.altlar : [];
  return (
    <nav className="tc-pt-gezinme" aria-label="Portal bölümleri">
      <Sekmeler
        etiket="Bölümler"
        sekmeler={bolumSekmeleri}
        secili={secili?.anahtar ?? 'home'}
        sec={(a) => { const b = bolumler.find((x) => x.anahtar === a); if (b?.altlar[0]) sec(b.altlar[0].anahtar); }}
      />
      {altlar.length > 0 && (
        <Sekmeler
          etiket={secili?.baslik ?? ''}
          sekmeler={altlar.map((a) => ({ anahtar: a.anahtar, baslik: sayili(a.baslik, sayac[a.anahtar]) }))}
          secili={altlar.some((a) => a.anahtar === ust) ? ust : (altlar[0]?.anahtar ?? '')}
          sec={sec}
        />
      )}
    </nav>
  );
}
