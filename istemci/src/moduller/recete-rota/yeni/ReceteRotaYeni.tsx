import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu } from '../../../ortak/arayuz/index.ts';
import { useCerceveSayacYazici } from '../../../ortak/rota/cerceve-sayaclari.ts';
import { api } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { EmirProjeSecimi } from '../EmirProjeSecimi.tsx';
import { kopruKur, type EmirSecimi } from '../kopru.ts';
import { PlanSeridi } from './PlanSeridi.tsx';
import { EKRANLAR, SEKMELER, sekmeBul, type SekmeAnahtari } from './sekmeler.ts';
import { RrBaglamKaynagi, useRrVerisi, type RrBaglami, type RrDurumu } from './veri.ts';
import { useRrYetkisi } from './yetki.ts';
import './recete-rota-yeni.css';

const KOK = '/recete-rota';

export const MOTOR_OKUNAMADI = 'Plan motorunun yerleşimi okunamadı; emir tarihleri boş gösteriliyor.';
export const PLAN_VERISI_EKSIK = 'İstasyon, makine ya da iş merkezi listesi bu rolde okunamıyor; bu verilere dayanan alanlar boş kalır.';

// Eski ekranın bölüm başı (sec-head): başlık ve altında kısa açıklama. Metinler bugünkü bağlı ekranın davranışına göredir. Ürün ve rotalar'da
// eski ekranda başlık yoktur (şema araç çubuğuyla başlar); Kaynaklar'da açıklama yoktur.
export const BOLUM_ACIKLAMALARI: Readonly<Record<SekmeAnahtari, string | null>> = {
  orders: 'Planlı ve başlamış emirler birlikte planlanır: önce öncelik, sonra teslim tarihi sırasıyla istasyonlara yerleştirilir ve stok emirler '
    + 'arasında bu sırayla paylaştırılır. Taslak emirler plana girmez.',
  stock: 'Eldeki serbest stoktur; statülü miktar üretimdeki yarı parçadır ve aşağıda ayrıca görünür. Stok hareketleri Stok sayfasıyla ortaktır.',
  schema: null,
  ops: 'Operasyon kataloğu İstasyonlar\'ın operasyon tiplerinden okunur ve 13 grupla gruplanır; ekle ve değiştir İstasyonlar kaydına yazılır. '
    + 'Akış şemasında adım eklerken bu listeden seçersin; değerler adıma kopyalanır ve adımda ayrıca değiştirilebilir.',
  sureler: 'Her rota adımının teorik süresi ve gerçekleşen ölçümü. Çevrim = işlem + değişim; Değişim % = değişim ÷ işlem × 100 '
    + '(işlem boş ya da 0 ise boş). Plan teorik süreyle hesaplanır. Gerçekleşen değer elle girilir ya da terminalden gelir ve ölçüm olarak bekler; '
    + 'kabul edilince ürünün rota taslağına teorik süre olarak yazılır, taslak yürürlüğe girince plan onu kullanır.',
  items: 'Kalemler Malzemeler ve Hizmetler kartlarından okunur; kod, ad, birim ve kategori orada değişir. Stok miktarı salt '
    + 'okunurdur. Birim maliyet Finans\'ta tutulur: rotası olan yarı mamul ve mamullerin malzeme maliyeti adımlara giren malzemelerden toplanır.',
  res: null,
  sartnameler: null,
  kapanis: null,
};
// Şartname ve talimatlar (prototip) ve kapanış onayları kendi başlığını çizer.
const BASLIKSIZ: ReadonlySet<SekmeAnahtari> = new Set(['schema', 'sartnameler', 'kapanis']);
// Kütüphane ve kapanış sayfası planla ilgisizdir: plan şeridi çizilmez.
const PLANSIZ: ReadonlySet<SekmeAnahtari> = new Set(['sartnameler', 'kapanis']);

// İkinci menü sayıları, eski ekranın kuralıyla (Sayaclar.hesapla): aktif emir (serbest ve üretimde), minimumun altındaki kalem, onayda
// (yoksa taslak) rota revizyonu, operasyon ve malzeme sayısı. Okunamayan dilimin sayısı null'dır. Eski ekran boş stoğu 0 sayardı; burada
// stoğu ya da minimumu boş kalem sayılmaz (veri yoksa sıfır uydurulmaz).
export function menuSayaclari(d: Pick<RrDurumu, 'emirler' | 'items' | 'routeRevs' | 'opdefs'>): Partial<Record<SekmeAnahtari, number | null>> {
  const revler = d.routeRevs;
  const onayda = revler?.filter((r) => r.status === 'onay').length ?? 0;
  const taslak = revler?.filter((r) => r.status === 'taslak').length ?? 0;
  return {
    orders: d.emirler ? d.emirler.orders.filter((o) => o.status === 'serbest' || o.status === 'uretimde').length : null,
    stock: d.items ? d.items.filter((i) => i.min !== null && i.stock !== null && i.min > 0 && i.stock < i.min).length : null,
    schema: revler ? onayda || taslak : null,
    ops: d.opdefs ? d.opdefs.length : null,
    items: d.items ? d.items.length : null,
  };
}

// Eski adresine geçti (541, 527 1 a): Reçete ve Rota'yı gören herkes açar; bölümü sekmenin işlemi, veriyi rol açar (useRrYetkisi).
// Köprü oturumdaki işlemlerle kurulur: oturum gelmeden kurulmaz.
export function ReceteRotaYeni() {
  const yetki = useYetki();
  return (
    <div className="tc-rry">
      {yetki.hazir ? <VeriSaglayici /> : <div className="tc-rry-govde"><DurumKutusu durum="yukleniyor" /></div>}
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
  // Burada oturum hazırdır. Köprü bir kez kurulur (oturum yenilense de sürümler kaybolmasın).
  const [baglam] = useState<RrBaglami>(() => {
    const islemler = oturum.data?.islemler;
    return {
      kopru: kopruKur([], {
        ...(islemler ? { islemler } : {}),
        motorDurumu: setMotorOkunamadi,
        planVerisi: setPlanVerisiEksik,
        emirSecimi: (secenekler) => new Promise<EmirSecimi | null>((coz) => { setSecim({ secenekler, coz }); }),
      }),
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
  const { pathname, search } = useLocation();
  const [sorgu] = useSearchParams();
  const yonlen = useNavigate();
  const izin = useYetki();
  const yetki = useRrYetkisi();
  const veri = useRrVerisi(yetki.oku);
  const [kimlik, setKimlik] = useState<string | null>(null);
  // Sekme sayıları kabuğun şeridinde çizilir (çerçevedeki eski ekranın bildirdiği gibi); ekran kalkınca kabuk sayıları siler.
  const sayacYaz = useCerceveSayacYazici(KOK);
  const durum = veri.data?.durum;
  useEffect(() => { if (durum) sayacYaz(menuSayaclari(durum)); }, [sayacYaz, durum]);

  const sekme = sekmeBul(pathname);
  if (!sekme) return <div className="tc-rry-govde"><DurumKutusu durum="bos" mesaj="Bu bölüm bulunamadı." /></div>;
  if (!yetki.oku || !izin.var(sekme.islem as Islem)) {
    return <div className="tc-rry-govde"><DurumKutusu durum="bos" mesaj={`${sekme.baslik} için yetkiniz yok.`} /></div>;
  }

  const git = (anahtar: SekmeAnahtari, k?: string) => {
    setKimlik(k ?? null);
    const hedef = SEKMELER.find((s) => s.anahtar === anahtar);
    if (hedef) void yonlen(hedef.yol);
  };
  const Bolum = EKRANLAR[sekme.anahtar].ekran;

  return (
    <>
      {/* Bölümler kabuğun ikinci menü şeridindedir (553 1 a); eski ekranın sırası (497/1 a): şeridin altında kenardan kenara plan şeridi,
          sonra bölüm başı. */}
      {veri.data && !PLANSIZ.has(sekme.anahtar) && <PlanSeridi durum={veri.data.durum} yerlesimOkunamadi={motorOkunamadi} />}
      <div className="tc-rry-govde">
        <BolumBasi key={sekme.anahtar} baslik={BASLIKSIZ.has(sekme.anahtar) ? null : sekme.baslik} aciklama={BOLUM_ACIKLAMALARI[sekme.anahtar]} />
        {motorOkunamadi && !PLANSIZ.has(sekme.anahtar) && <p className="tc-rry-not" role="status">{MOTOR_OKUNAMADI}</p>}
        {planVerisiEksik && !PLANSIZ.has(sekme.anahtar) && <p className="tc-rry-not" role="status">{PLAN_VERISI_EKSIK}</p>}
        <section className="tc-rry-icerik" aria-label={sekme.baslik} data-bolum={sekme.anahtar}>
          {veri.isPending && <DurumKutusu durum="yukleniyor" />}
          {veri.isError && (
            <DurumKutusu durum="hata" mesaj={veri.error.message || 'Reçete ve Rota verisi alınamadı'} yenile={() => { void veri.refetch(); }} />
          )}
          {/* Genel arama ve komut bölümü adresle açar (kart #1241): `?kayit=` seçili kayıt, `?yeni=1` bölümün yeni kayıt penceresi. Adres
              değişince bölüm yeniden kurulur; aynı bölümdeyken açılan ikinci sonuç da kendi kaydını seçer. */}
          {veri.data && <Bolum key={search} veri={veri.data} yetki={yetki} git={git} kimlik={sorgu.get('kayit') ?? kimlik} />}
        </section>
      </div>
    </>
  );
}

// Eski ekranın bölüm başı: simgesiz büyük başlık, açıklama iki satıra kısalır ve dokununca açılır (eskide de böyleydi).
function BolumBasi({ baslik, aciklama }: { baslik: string | null; aciklama: string | null }) {
  const [acik, setAcik] = useState(false);
  if (baslik === null && aciklama === null) return null;
  return (
    <header className="tc-rry-bas">
      {baslik !== null && <h2>{baslik}</h2>}
      {aciklama !== null && (
        <button type="button" className="tc-rry-ipucu" data-acik={acik ? '' : undefined} aria-expanded={acik} onClick={() => { setAcik(!acik); }}>
          {aciklama}
        </button>
      )}
    </header>
  );
}
