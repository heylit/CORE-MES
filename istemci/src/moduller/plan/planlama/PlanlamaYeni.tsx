import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { DurumKutusu, Dugme, useBildirim } from '../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import {
  ACILIS, ACILIS_OLCEGI, KOK, altEkranAdresi, altEkranOku, BOS_SECIM, GORUNUM_KAYITLARI, gorunumAcik, gorunumAdresi, gorunumOku, PlanSeridi, studyoAdresi,
  studyoIstegiOku, TAHTA, type DonemOlcegi, type PlanlamaAltEkrani, type PlanlamaGorunumu, type PlanlamaOlcegi, type PlanlamaSecimi, type StudyoIstegi,
} from './gorunumler.ts';
import { CalismaYazici } from './kayit.ts';
import { usePlanlamaDeposu } from './veri.ts';
import { yetkiKur } from './yetki.ts';
import './planlama-yeni.css';

// Planlama'nın ekranı (soru 199 b, 270 a; 658 b, 659 a): plan modülünün sayfasıdır, planlama rolleri bunu açar. Eski çerçeve bir süre
// /plan/eski adresinde yalnız yöneticide kalır. Görünüm şeridini kabuk çizer (ikinci menü). Veri Reçete ve Rota'dan okunur, plan motoru ve
// onay akışı sunucudadır (ADR 0018, H2, H3).
export function PlanlamaYeni() {
  return <PlanlamaEkrani />;
}

const bosAbone = (): (() => void) => () => {};
// İz satırının sayfa adı yazma anındaki görünümdür (yazıcı bir kez kurulur, görünüm değişir).
const sonGorunum: { deger: string | null } = { deger: null };

function PlanlamaEkrani() {
  const oturum = useOturum();
  const { gorunum: parca } = useParams<{ gorunum?: string }>();
  const git = useNavigate();
  const [sorgu] = useSearchParams();
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.includes(PLANLAMA_ISLEMI) ?? false;
  const { durum, yenile, tazele } = usePlanlamaDeposu(girebilir);
  const yetki = useMemo(
    () => (durum.tur === 'hazir' && kullanici ? yetkiKur(kullanici.islemler, durum.depo.ben) : null),
    [durum, kullanici],
  );
  const gorunum = parca === undefined ? ACILIS : gorunumOku(parca);
  const { bildir } = useBildirim();
  // 657 a, 1395 a: çalışma kaydı yoksa sayfa açılışta yazmaz; yazabilen kişi boş çalışmayı düğmeyle sunucuya kurdurur (Reçete ve Rota
  // kaydından) ve sayfa düzenlenebilir açılır. Yazamayan salt okunur boş görür.
  const [kuruluyor, setKuruluyor] = useState(false);
  const calismaAc = useCallback((): void => {
    setKuruluyor(true);
    tekrarKorumaliGonder((d) => api.post<PlanlamaCalismasiCevabi>('/plan/planlama-calismasi/olustur', undefined, d)).then(
      () => { setKuruluyor(false); tazele(); },
      (h: unknown) => { setKuruluyor(false); bildir('hata', hataIletisi(h, 'Planlama çalışması açılamadı; sayfa salt okunur.')); },
    );
  }, [tazele, bildir]);
  // Yazıcı açılıştaki çalışma ve sürümle kurulur; yazma yetkisi ya da çalışma kaydı yoksa ekran salt okunur (komut null).
  const yazici = useMemo(() => {
    if (durum.tur !== 'hazir' || yetki === null || !yetki.calismaYazabilir || durum.depo.calisma === null || !kullanici) return null;
    return new CalismaYazici({
      calisma: durum.depo.calisma, surum: durum.depo.calismaSurumu, kim: kullanici.ad,
      sayfa: () => GORUNUM_KAYITLARI.find((k) => k.anahtar === sonGorunum.deger)?.baslik ?? '',
      yaz: (g: YazGovdesi) => api.post<YazCevabi>('/plan/planlama-kayitlari/yaz', g),
      uyar: (ileti) => { bildir('hata', ileti); },
      catismadaYenile: tazele,
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
  const altSec = useCallback((a: PlanlamaAltEkrani): void => { void git(altEkranAdresi(a)); }, [git]);
  const studyoAc = useCallback((i: StudyoIstegi | null): void => { void git(studyoAdresi(i), { replace: i === null }); }, [git]);

  if (oturum.isPending) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Planlama sayfalarını görme yetkiniz yok." /></div>;
  if (durum.tur === 'hata') return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj={durum.ileti} yenile={yenile} /></div>;
  if (durum.tur === 'yukleniyor' || yetki === null) return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;

  if (gorunum === null) return <Navigate to={KOK} replace />;
  const kayitlar = GORUNUM_KAYITLARI.filter((k) => gorunumAcik(k.anahtar, yetki));
  const etkin = kayitlar.find((k) => k.anahtar === gorunum);
  const gec = (g: PlanlamaGorunumu): void => { void git(gorunumAdresi(g)); };
  const alt = gorunum === 'plan' ? altEkranOku(sorgu) : TAHTA;
  const istek = gorunum === 'studio' ? studyoIstegiOku(sorgu) : null;

  const calismaYok = durum.depo.calisma === null && yetki.calismaYazabilir;

  return (
    <div className="tc-py" data-gorunum={gorunum} data-calisma-yok={calismaYok ? '' : undefined}>
      {calismaYok && (
        <div className="tc-py-calisma-yok" role="status">
          <span>Planlama çalışması henüz açılmadı; sayfa salt okunur.</span>
          <Dugme tur="birincil" simge="plus" yukleniyor={kuruluyor} disabled={kuruluyor} onClick={calismaAc}>Planlama çalışmasını aç</Dugme>
        </div>
      )}
      <div className="tc-py-gorunum">
        {etkin === undefined
          ? <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj="Bu sayfayı görme yetkiniz yok." /></div>
          : (
            <>
              {gorunum !== 'plan' && (
                <Suspense fallback={null}>
                  <PlanSeridi
                    depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yenile}
                    olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec} alt={alt} altSec={altSec} istek={istek} studyoAc={studyoAc} gorunum={gorunum}
                  />
                </Suspense>
              )}
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <etkin.bilesen
                  depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yenile}
                  olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec} alt={alt} altSec={altSec} istek={istek} studyoAc={studyoAc}
                />
              </Suspense>
            </>
          )}
      </div>
    </div>
  );
}
