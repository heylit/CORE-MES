import { Suspense, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { DurumKutusu, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import { ACILIS, GORUNUM_KAYITLARI, gorunumAcik, gorunumAdresi, gorunumOku, type PlanlamaGorunumu } from './gorunumler.ts';
import { usePlanlamaDeposu } from './veri.ts';
import { yetkiKur } from './yetki.ts';
import './planlama-yeni.css';

// Planlama'nın TS ekranı (soru 199 b, 270 a). Eski çerçeve (cerceve/planlama-modulu.html) alıma kadar yerinde kalır; bu ekran ikinci yolda,
// yalnız yöneticide açılır. Veri eski ekranın okuduğu uçlardan gelir; plan motoru ve onay akışı sunucudadır (ADR 0018, H2, H3).
export function PlanlamaYeni() {
  return <YeniEkranKapisi><PlanlamaEkrani /></YeniEkranKapisi>;
}

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

  if (oturum.isPending) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Planlama sayfalarını görme yetkiniz yok." /></div>;
  if (durum.tur === 'hata') return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj={durum.ileti} yenile={yenile} /></div>;
  if (durum.tur === 'yukleniyor' || yetki === null) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;

  const gorunum = gorunumOku(parca);
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
            <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
              <etkin.bilesen depo={durum.depo} yetki={yetki} git={gec} yenile={yenile} />
            </Suspense>
          )}
      </div>
    </div>
  );
}
