import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, SayfaBasligi, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { EmirProjeSecimi } from '../EmirProjeSecimi.tsx';
import { kopruKur, type EmirSecimi } from '../kopru.ts';
import { PlanSeridi } from './PlanSeridi.tsx';
import { EKRANLAR, SEKMELER, sekmeBul, type SekmeAnahtari } from './sekmeler.ts';
import { RrBaglamKaynagi, useRrVerisi, type RrBaglami } from './veri.ts';
import { useRrYetkisi } from './yetki.ts';
import './recete-rota-yeni.css';

export const MOTOR_OKUNAMADI = 'Plan motorunun yerleşimi okunamadı; emir tarihleri boş gösteriliyor.';
export const PLAN_VERISI_EKSIK = 'İstasyon, makine ya da iş merkezi listesi bu rolde okunamıyor; bu verilere dayanan alanlar boş kalır.';

// Yeni yol alıma kadar yalnız yöneticiye açıktır (ortak kapı); kullanıcılar bugünkü çerçevede çalışır.
export function ReceteRotaYeni() {
  return (
    <div className="tc-rry">
      <YeniEkranKapisi><VeriSaglayici /></YeniEkranKapisi>
    </div>
  );
}

interface Secim { secenekler: AcilisSecenekleri; coz: (s: EmirSecimi | null) => void }

// Köprü ekran başına bir kez kurulur: kaynak sürümleri onun içinde tutulur, komutlar sırayla gider. Proje seçimi (emir açılışı, 224)
// bugünkü ekrandaki pencereyle sorulur.
function VeriSaglayici() {
  const oturum = useOturum();
  const yetki = useYetki();
  const [motorOkunamadi, setMotorOkunamadi] = useState(false);
  const [planVerisiEksik, setPlanVerisiEksik] = useState(false);
  const [secim, setSecim] = useState<Secim | null>(null);
  // Kapı oturumu bekler: burada oturum hazırdır. Köprü bir kez kurulur (oturum yenilense de sürümler kaybolmasın).
  const [baglam] = useState<RrBaglami>(() => {
    const islemler = oturum.data?.islemler;
    let taslaklar: Promise<void> | null = null;
    return {
      kopru: kopruKur([], {
        ...(islemler ? { islemler } : {}),
        motorDurumu: setMotorOkunamadi,
        planVerisi: setPlanVerisiEksik,
        emirSecimi: (secenekler) => new Promise<EmirSecimi | null>((coz) => { setSecim({ secenekler, coz }); }),
      }),
      // Açılamazsa durum yine okunur; dakikalık tarama sonra açar (bugünkü ekranla aynı).
      ilkOkuma: () => (taslaklar ??= yetki.var('rota.yaz')
        ? api.post<unknown>('/rota/karttan-taslaklar').then(() => undefined, () => undefined)
        : Promise.resolve()),
    };
  });

  return (
    <RrBaglamKaynagi.Provider value={baglam}>
      <Ekran motorOkunamadi={motorOkunamadi} planVerisiEksik={planVerisiEksik} />
      {secim && <EmirProjeSecimi secenekler={secim.secenekler} bitir={(s) => { setSecim(null); secim.coz(s); }} />}
    </RrBaglamKaynagi.Provider>
  );
}

function Ekran({ motorOkunamadi, planVerisiEksik }: { motorOkunamadi: boolean; planVerisiEksik: boolean }) {
  const { bolum } = useParams();
  const yonlen = useNavigate();
  const izin = useYetki();
  const yetki = useRrYetkisi();
  const veri = useRrVerisi(yetki.oku);
  const [kimlik, setKimlik] = useState<string | null>(null);

  const sekme = sekmeBul(bolum);
  if (!sekme) return <DurumKutusu durum="bos" mesaj="Bu bölüm bulunamadı." />;
  if (!yetki.oku || !izin.var(sekme.islem as Islem)) return <DurumKutusu durum="bos" mesaj={`${sekme.baslik} için yetkiniz yok.`} />;

  const git = (anahtar: SekmeAnahtari, k?: string) => {
    setKimlik(k ?? null);
    const hedef = SEKMELER.find((s) => s.anahtar === anahtar);
    if (hedef) void yonlen(hedef.yol);
  };
  const Bolum = EKRANLAR[sekme.anahtar].ekran;

  return (
    <>
      {veri.data && <PlanSeridi durum={veri.data.durum} yerlesimOkunamadi={motorOkunamadi} />}
      <SayfaBasligi baslik={sekme.baslik} simge={sekme.simge} />
      <Sekmeler<SekmeAnahtari>
        etiket="Reçete ve Rota bölümleri"
        sekmeler={SEKMELER.map((s) => ({ anahtar: s.anahtar, baslik: s.baslik, simge: s.simge }))}
        secili={sekme.anahtar}
        sec={(a) => { git(a); }}
      />
      {motorOkunamadi && <p className="tc-rry-not" role="status">{MOTOR_OKUNAMADI}</p>}
      {planVerisiEksik && <p className="tc-rry-not" role="status">{PLAN_VERISI_EKSIK}</p>}
      <section className="tc-rry-icerik" aria-label={sekme.baslik} data-bolum={sekme.anahtar}>
        {veri.isPending && <DurumKutusu durum="yukleniyor" />}
        {veri.isError && (
          <DurumKutusu durum="hata" mesaj={veri.error.message || 'Reçete ve Rota verisi alınamadı'} yenile={() => { void veri.refetch(); }} />
        )}
        {veri.data && <Bolum veri={veri.data} yetki={yetki} git={git} kimlik={kimlik} />}
      </section>
    </>
  );
}
