import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PlanlamaYazGovdesi } from '#paylasilan/sozlesme/planlama.ts';
import type { YazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { DurumKutusu, Dugme, useBildirim } from '../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import {
  ACILIS, ACILIS_OLCEGI, KOK, altEkranAdresi, altEkranOku, BOS_SECIM, GORUNUM_KAYITLARI, gorunumAcik, gorunumAdresi, gorunumOku, kapasiteBolumuMu, kapasiteBolumuOku, menuGorunumu, PlanSeridi, studyoAdresi,
  studyoIstegiOku, TAHTA, type DonemOlcegi, type PlanlamaAltEkrani, type PlanlamaGorunumu, type PlanlamaOlcegi, type PlanlamaSecimi, type StudyoIstegi,
} from './gorunumler.ts';
import { CalismaYazici } from './kayit.ts';
import { DegisiklikSeridi } from './ortak/degisiklik-seridi/DegisiklikSeridi.tsx';
import { kaynakSatiri } from './ortak/degisiklik-seridi/kurallar.ts';
import { DuzenleyenSeridi, useDuzenleyen } from './ortak/duzenleyen-seridi/DuzenleyenSeridi.tsx';
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
    () => (durum.tur === 'hazir' && kullanici ? yetkiKur(kullanici.islemler) : null),
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
  // Yeniden okumada geri alma geçmişi önceki yazıcıdan taşınır (aynı kişi); çatışmayla duran yazıcının geçmişi taşınmaz: başkasının
  // yazdığının üstüne geri alma yazılmasın.
  const oncekiYazici = useRef<{ yazici: CalismaYazici; kisi: unknown } | null>(null);
  const yazici = useMemo(() => {
    if (durum.tur !== 'hazir' || yetki === null || !yetki.calismaYazabilir || durum.depo.calisma === null || !kullanici) return null;
    const onceki = oncekiYazici.current;
    const gecmis = onceki && onceki.kisi === kullanici.id && !onceki.yazici.durdu ? onceki.yazici.gecmis() : undefined;
    const y = new CalismaYazici({
      ...(gecmis ? { gecmis } : {}),
      calisma: durum.depo.calisma, surum: durum.depo.calismaSurumu, kim: kullanici.ad,
      sayfa: () => GORUNUM_KAYITLARI.find((k) => k.anahtar === sonGorunum.deger)?.baslik ?? '',
      yaz: (g: PlanlamaYazGovdesi) => api.post<YazCevabi>('/plan/planlama-kayitlari/yaz', g),
      uyar: (ileti) => { bildir('hata', ileti); },
      catismadaYenile: tazele,
      bildir: (ileti, geriAl) => { bildir('tamam', ileti, geriAl ? { eylem: { etiket: 'Geri al', yap: geriAl } } : undefined); },
    });
    oncekiYazici.current = { yazici: y, kisi: kullanici.id };
    return y;
    // Yazıcı yalnız açılış okumasıyla yeniden kurulur; bildir ve kullanıcı nesnesi çizimler arasında değişebilir.
  }, [durum, yetki]);
  sonGorunum.deger = gorunum === null ? null : menuGorunumu(gorunum);
  const calisma = useSyncExternalStore(
    yazici?.abone ?? bosAbone,
    () => yazici?.calisma ?? (durum.tur === 'hazir' ? durum.depo.calisma : null),
  );
  // 1972: başka sayfadaki değişiklik bu açılışın birleşmesinden gelir; açılış başına bir satırdır, yazabilen kişide bekleyene yazılır.
  const disSatir = useMemo(() => {
    if (durum.tur !== 'hazir' || durum.depo.calisma === null || durum.depo.kaynakDegisikligi === null) return null;
    return kaynakSatiri(durum.depo.kaynakDegisikligi, Date.now(), durum.depo.calisma.dataVer);
  }, [durum]);
  const benimSurum = useCallback(() => yazici?.surum ?? (durum.tur === 'hazir' ? durum.depo.calismaSurumu : null), [yazici, durum]);
  const duzenleyen = useDuzenleyen(durum.tur === 'hazir' && kullanici ? kullanici.id : null, benimSurum);
  useEffect(() => {
    if (yazici !== null && disSatir !== null) yazici.kaynakDegisikliginiYaz(disSatir);
  }, [yazici, disSatir]);
  // Sekme kapanırken bekleyen yazma (2 sn) tarayıcının sürdüreceği garanti değildir: kirliyken tarayıcı çıkışı sorar, yazma o sırada başlar.
  // keepalive kullanılmaz: gövde sınırı (64 KB) çalışmanın boyutundan küçüktür.
  useEffect(() => {
    if (yazici === null) return undefined;
    const cik = (): void => { void yazici.hepsiniYaz(); };
    const sor = (e: BeforeUnloadEvent): void => {
      if (!yazici.bekleyenVar || yazici.durdu) return;
      cik();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', sor);
    window.addEventListener('pagehide', cik);
    return () => { window.removeEventListener('beforeunload', sor); window.removeEventListener('pagehide', cik); cik(); };
  }, [yazici]);
  // Yeniden okuma bekleyen yazmayı önce gönderir: yoksa okunan kayıt son değişikliği içermez, sonraki yazma kendi kendine 409 alırdı.
  // Görünümlerin yenilemesi sessizdir: komuttan sonra ekran yükleniyor kutusuna dönüp yeniden kurulursa çizelge yanıp söner,
  // kaydırma ve seçim kaybolur; eski veri yenisi gelene kadar görünür kalır.
  const yazTazele = useCallback((): void => {
    if (yazici === null) { tazele(); return; }
    void yazici.hepsiniYaz().then(tazele, tazele);
  }, [yazici, tazele]);
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
  // Eski Ek mesai, Fason, Ufuk ve Yıllık plan adresleri Kapasite'nin bölümüdür (3038).
  if (kapasiteBolumuMu(parca)) return <Navigate to={gorunumAdresi(parca)} replace />;
  const kayitlar = GORUNUM_KAYITLARI.filter((k) => gorunumAcik(k.anahtar, yetki));
  const etkin = kayitlar.find((k) => k.anahtar === menuGorunumu(gorunum));
  // Kapta görünümün kendi adı durur; Kapasite'de açık bölümün adı (eski sayfa testleri ve stilleri bölüm adını okur).
  const kapAdi = gorunum === 'kapasite' ? kapasiteBolumuOku(sorgu) : gorunum;
  const gec = (g: PlanlamaGorunumu): void => { void git(gorunumAdresi(g)); };
  const alt = gorunum === 'plan' ? altEkranOku(sorgu) : TAHTA;
  const istek = gorunum === 'studio' ? studyoIstegiOku(sorgu) : null;

  const calismaYok = durum.depo.calisma === null && yetki.calismaYazabilir;
  const serit = calisma !== null && calisma.plan !== null;
  // Üst alan tek satırdır (2320 S1 d): düzenleyen, değişiklik ve çalışma açma şeritleri aynı kapta alt alta.
  const ust = serit || calismaYok || duzenleyen !== null;

  return (
    <div className="tc-py" data-gorunum={kapAdi} data-calisma-yok={calismaYok ? '' : undefined} data-serit={ust ? '' : undefined}>
      {ust && (
        <div className="tc-py-ust">
          {duzenleyen && <DuzenleyenSeridi d={duzenleyen} yenile={yazTazele} />}
          {serit && <DegisiklikSeridi calisma={calisma} dis={disSatir} canli={((b) => (b?.sayilar && b.olaylar ? { ...b, sayilar: b.sayilar, olaylar: b.olaylar } : null))(durum.depo.planSurumu?.bayat)} />}
          {calismaYok && (
            <div className="tc-py-calisma-yok" role="status">
              <span>Planlama çalışması henüz açılmadı; sayfa salt okunur.</span>
              <Dugme tur="birincil" simge="plus" yukleniyor={kuruluyor} disabled={kuruluyor} onClick={calismaAc}>Planlama çalışmasını aç</Dugme>
            </div>
          )}
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
                    depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yazTazele}
                    olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec} alt={alt} altSec={altSec} istek={istek} studyoAc={studyoAc} gorunum={gorunum}
                  />
                </Suspense>
              )}
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <etkin.bilesen
                  depo={durum.depo} calisma={calisma} komut={yazici} yetki={yetki} git={gec} yenile={yazTazele}
                  olcek={olcek} olcekSec={olcekSec} kaydir={kaydir} secim={secim} sec={sec} alt={alt} altSec={altSec} istek={istek} studyoAc={studyoAc}
                />
              </Suspense>
            </>
          )}
      </div>
    </div>
  );
}
