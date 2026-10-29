import { Suspense, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { BenCevabi, KayitlarCevabi, TezgahlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { DurumKutusu, Dugme, Sekmeler, useBildirim } from '../../../ortak/arayuz/index.ts';
import { useEkranGorunur } from '../../../ortak/rota/kalici.tsx';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { kopruKur } from '../kopru.ts';
import { durumKur } from './depo.ts';
import { DURUM_ANAHTARI } from './durum.ts';
import { closeDefs, gorunumAdresi, openDefs, useGorunum, useTanimlar, type Gorunum } from './gorunum.ts';
import { KayitYazici } from './kayit.ts';
import { sahneAlaniKur } from './sahne/Sahne.tsx';
import { tezgahlariKur } from './secici.ts';
import { GORUNUM_KAYITLARI } from './sekmeler.ts';
import { TanimlarPenceresi } from './tanimlar/index.tsx';
import { baglantiKur, CncYetkiBaglami, EMIR, kayitYazildi, ONEK, yerelDegerler, yetkiKur, type CncYetkisi } from './veri.ts';
import './cnc-yeni.css';

// CNC Kurulum Motoru'nun TS ekranı (soru 199 b). Görünüm ve akış prototipteki gibidir; çerçeve ve köprü yoktur, veri aynı
// uçlardan ve aynı kayıttan gelir (eski ekranla yan yana çalışır). Alıma kadar ikinci yoldadır ve yalnız yöneticide açılır.
const OKUMA_ISLEMLERI = ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'];
// Görünüm şeridine dokunmak eylem sayılmaz (eski ekranda da öyle): yalnız bakan kişi kayıt yazmaz.
const SERIT = 'data-cnc-serit';

interface Acilis { yetki: CncYetkisi; kayitlar: KayitlarCevabi; tezgahlar: TezgahlarCevabi['tezgahlar'] | null }

export function CncYeni() {
  return <YeniEkranKapisi><CncEkrani /></YeniEkranKapisi>;
}

function CncEkrani() {
  const oturum = useOturum();
  const { bildir } = useBildirim();
  const { gorunum, burada, git } = useGorunum();
  const tanimlar = useTanimlar();
  const [acilis, setAcilis] = useState<Acilis | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const ekranGorunur = useEkranGorunur();
  const alan = useRef<HTMLDivElement>(null);
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;

  useEffect(() => {
    if (!kullanici || !girebilir) return undefined;
    let bitti = false;
    void (async () => {
      try {
        // Tezgâh listesi okunamazsa ekran gömülü listeyle açılır (secici.ts).
        const [ben, kayitlar, tezgahlar] = await Promise.all([
          api.get<BenCevabi>('/cnc-kurulum/ben'),
          api.get<KayitlarCevabi>('/cnc-kurulum/kayitlar'),
          api.get<TezgahlarCevabi>('/cnc-kurulum/tezgahlar').then((c) => c.tezgahlar, () => null),
        ]);
        if (!bitti) setAcilis({ yetki: yetkiKur(ben), kayitlar, tezgahlar });
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'CNC Kurulum Motoru açılamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [kullanici, girebilir, deneme]);

  // Kayıtlar yazma katmanına, durum depoya kurulur (görünümler ilk çizimde durumu okur, bu yüzden etkiden önce). Emir seçimi ve stok kartı bağı sunucudaki kaydı değiştirir: ekran yeni
  // kayıtlarla yeniden kurulur ve işin yapıldığı görünümde kalır.
  const yazici = useMemo(() => {
    if (acilis === null) return null;
    const { yetki, kayitlar } = acilis;
    const degerler = yerelDegerler(kayitlar);
    const yenidenKur = (hedef: Gorunum = 'setup'): void => {
      setAcilis(null); setDeneme((d) => d + 1); git(hedef);
    };
    const isle = kopruKur({}, yetki.saltOnay, degerler[DURUM_ANAHTARI]?.deger, (g) => { yenidenKur(g === 'lib' ? 'lib' : 'setup'); },
      yetki.takimDegistirebilir, yetki.stokDusebilir);
    const y = new KayitYazici({
      isle, yazabilir: yetki.yazabilir || yetki.hazirlikOnaylayabilir, onek: ONEK, emirAnahtari: EMIR,
      uyar: (ileti) => { bildir('hata', ileti); }, yazildi: kayitYazildi,
    }, degerler);
    baglantiKur({ yetki, isle, yazici: y });
    tezgahlariKur(acilis.tezgahlar);
    durumKur(y.deger(DURUM_ANAHTARI), (anahtar, metin) => { y.degistir(anahtar, metin); });
    return y;
    // Kurulum yalnız açılış kayıtlarıyla değişir; git ve bildir her çizimde yeni olabilir.
  }, [acilis]);

  useEffect(() => {
    if (yazici === null) return undefined;
    const kapaninca = (): void => { yazici.hepsiniYaz(); };
    window.addEventListener('pagehide', kapaninca);
    return () => { window.removeEventListener('pagehide', kapaninca); kapaninca(); baglantiKur(null); };
  }, [yazici]);

  // 3B görünümler tek çiziciyle çizilir (sahne/Sahne.tsx); görünüm alanı dışı kırpılır, ekran gizlenince çizim durur.
  const hazir = acilis !== null && yazici !== null;
  useEffect(() => {
    if (!hazir) return undefined;
    sahneAlaniKur(alan.current, ekranGorunur);
    return () => { sahneAlaniKur(null, false); };
  }, [hazir, ekranGorunur]);

  const eylem = (o: SyntheticEvent): void => {
    if (yazici === null) return;
    if (o.type === 'pointerdown' && o.target instanceof Element && o.target.closest(`[${SERIT}]`) !== null) return;
    yazici.eylem();
  };

  if (oturum.isPending) return <div className="tc-cy-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici) return <div className="tc-cy-durum"><DurumKutusu durum="hata" mesaj="Oturum bulunamadı." /></div>;
  if (!girebilir) return <div className="tc-cy-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (hata !== null) {
    return (
      <div className="tc-cy-durum">
        <DurumKutusu durum="hata" mesaj={hata} yenile={() => { setHata(null); setDeneme((d) => d + 1); }} />
      </div>
    );
  }
  if (acilis === null || yazici === null) return <div className="tc-cy-durum"><DurumKutusu durum="yukleniyor" /></div>;

  const { yetki } = acilis;
  // Yalnız hazırlık onayı olan kişi Hazırlık'ta açılır; öteki görünümler gizlidir (eski ekranla aynı).
  if (yetki.saltOnay && burada && gorunum !== 'prep') return <Navigate to={gorunumAdresi('prep')} replace />;
  const kayitlar = yetki.saltOnay ? GORUNUM_KAYITLARI.filter((k) => k.anahtar === 'prep') : GORUNUM_KAYITLARI;
  const etkin = GORUNUM_KAYITLARI.find((k) => k.anahtar === gorunum) ?? GORUNUM_KAYITLARI[0];
  const Bilesen = etkin?.bilesen;

  return (
    <CncYetkiBaglami.Provider value={yetki}>
      <div
        className="tc-cy" data-view={gorunum}
        onPointerDownCapture={eylem} onKeyDownCapture={eylem} onInputCapture={eylem} onChangeCapture={eylem} onPasteCapture={eylem} onDropCapture={eylem}
      >
        <div className="tc-cy-ust">
          <div className="tc-cy-serit" {...{ [SERIT]: '' }}>
            <Sekmeler etiket="CNC Kurulum görünümleri" sekmeler={kayitlar} secili={gorunum} sec={(g) => { git(g); }} />
          </div>
          {!yetki.saltOnay && (
            <Dugme simge="edit" onClick={() => { openDefs(); }} title="Tezgâh ve malzeme tanımları">Tanımlar</Dugme>
          )}
        </div>
        <div className="tc-cy-gorunum" ref={alan}>
          <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
            {Bilesen && <Bilesen />}
          </Suspense>
        </div>
        {tanimlar.acik && !yetki.saltOnay && <TanimlarPenceresi sekme={tanimlar.sekme} kapat={closeDefs} />}
      </div>
    </CncYetkiBaglami.Provider>
  );
}
