import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { DurumKutusu, Sekmeler, useBildirim } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import {
  ACILIS, ACILIS_OLCEGI, BOS_SECIM, GORUNUM_KAYITLARI, gorunumAcik, gorunumAdresi, gorunumOku, PlanSeridi,
  type DonemOlcegi, type PlanlamaGorunumu, type PlanlamaOlcegi, type PlanlamaSecimi,
} from './gorunumler.ts';
import { CalismaYazici } from './kayit.ts';
import { usePlanlamaDeposu } from './veri.ts';
import { yetkiKur } from './yetki.ts';
import './planlama-yeni.css';

// Planlama'nın TS ekranı (soru 199 b, 270 a). Eski çerçeve (cerceve/planlama-modulu.html) alıma kadar yerinde kalır; bu ekran ikinci yolda,
// yalnız yöneticide açılır. Veri eski ekranın okuduğu uçlardan gelir; plan motoru ve onay akışı sunucudadır (ADR 0018, H2, H3).
export function PlanlamaYeni() {
  return <YeniEkranKapisi><PlanlamaEkrani /></YeniEkranKapisi>;
}

const bosAbone = (): (() => void) => () => {};
// İz satırının sayfa adı yazma anındaki görünümdür (yazıcı bir kez kurulur, görünüm değişir).
const sonGorunum: { deger: string | null } = { deger: null };

function PlanlamaEkrani() {
  const oturum = useOturum();
  const { gorunum: parca } = useParams<{ gorunum?: string }>();
  const git = useNavigate();
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.includes(PLANLAMA_ISLEMI) ?? false;
  const { durum, yenile } = usePlanlamaDeposu(girebilir);
  const yetki = useMemo(
    () => (durum.tur === 'hazir' && kullanici ? yetkiKur(kullanici.islemler, durum.depo.ben) : null),
    [durum, kullanici],
  );
  const gorunum = gorunumOku(parca);
  const { bildir } = useBildirim();
  // Yazıcı açılıştaki çalışma ve sürümle kurulur; yazma yetkisi ya da çalışma kaydı yoksa ekran salt okunur (komut null).
  const yazici = useMemo(() => {
    if (durum.tur !== 'hazir' || yetki === null || !yetki.calismaYazabilir || durum.depo.calisma === null || !kullanici) return null;
    return new CalismaYazici({
      calisma: durum.depo.calisma, surum: durum.depo.calismaSurumu, kim: kullanici.ad,
      sayfa: () => GORUNUM_KAYITLARI.find((k) => k.anahtar === sonGorunum.deger)?.baslik ?? '',
      yaz: (g: YazGovdesi) => api.post<YazCevabi>('/recete-rota/kayitlar/yaz', g),
      uyar: (ileti) => { bildir('hata', ileti); },
      bildir: (ileti, geriAl) => { bildir('tamam', ileti, geriAl ? { eylem: { etiket: 'Geri al', yap: geriAl } } : undefined); },
    });
    // Yazıcı yalnız açılış okumasıyla yeniden kurulur; bildir ve kullanıcı nesnesi çizimler arasında değişebilir.
  }, [durum, yetki]);
  sonGorunum.deger = gorunum;
  const calisma = useSyncExternalStore(
    yazici?.abone ?? bosAbone,
    () => yazici?.calisma ?? (durum.tur === 'hazir' ? durum.depo.calisma : null),
  );
  useEffect(() => {
    if (yazici === null) return undefined;
    const cik = (): void => { void yazici.hepsiniYaz(); };
    window.addEventListener('pagehide', cik);
    return () => { window.removeEventListener('pagehide', cik); cik(); };
  }, [yazici]);
  // Ölçek ve seçim görünümler arasında taşınır (görünüm değişince bu bileşen kalır, adres parçası değişir).
  const [olcek, olcekKur] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, secimKur] = useState<PlanlamaSecimi>(BOS_SECIM);
  const olcekSec = useCallback((o: DonemOlcegi): void => { olcekKur({ olcek: o, kayma: 0 }); }, []);
  const kaydir = useCallback((n: number): void => { olcekKur((x) => ({ ...x, kayma: n === 0 ? 0 : x.kayma + n })); }, []);
  const sec = useCallback((s: Partial<PlanlamaSecimi>): void => { secimKur((x) => ({ ...x, ...s })); }, []);

  if (oturum.isPending) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Planlama sayfalarını görme yetkiniz yok." /></div>;
  if (durum.tur === 'hata') return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj={durum.ileti} yenile={yenile} /></div>;
  if (durum.tur === 'yukleniyor' || yetki === null) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;

  if (gorunum === null) return <Navigate to={gorunumAdresi(ACILIS)} replace />;
  const kayitlar = GORUNUM_KAYITLARI.filter((k) => gorunumAcik(k.anahtar, yetki));
  const etkin = kayitlar.find((k) => k.anahtar === gorunum);
  const gec = (g: PlanlamaGorunumu): void => { void git(gorunumAdresi(g)); };

  return (
    <div className="tc-py" data-gorunum={gorunum}>
      <div className="tc-py-ust">
        <Sekmeler etiket="Planlama görünümleri" sekmeler={kayitlar} secili={gorunum} sec={gec} />
      </div>
      <div className="tc-py-gorunum">
        {etkin === undefined
          ? <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Bu sayfayı görme yetkiniz yok." /></div>
          : (
            <>
              {gorunum !== 'plan' && (
                <Suspense fallback={null}>
                  <PlanSeridi
                    depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yenile}
                    olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec} gorunum={gorunum}
                  />
                </Suspense>
              )}
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <etkin.bilesen
                  depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yenile}
                  olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec}
                />
              </Suspense>
            </>
          )}
      </div>
    </div>
  );
}
