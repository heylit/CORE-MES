import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PlanCevabi, PlanEmri, PlanYerlesimi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, DurumKutusu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { BolumHatasi } from './BolumHatasi.tsx';
import { KaynakCizelgesi } from './KaynakCizelgesi.tsx';
import { Gostergeler, ZamanCizelgesi } from './PlanParcalari.tsx';
import { PlanMatrisTablosu } from './PlanMatrisTablosu.tsx';
import {
  ARALIK_HAFTALARI, BOS_SUZGEC, DURUM_ADI, ONCELIK_ADI, YUK_EFSANESI, emirDurumu, gezinebilir, gorunenEmirler, istasyonSecenekleri, kaydir, pencereKur, yerlesimDurumu, yerlesmeyenDisindakiUyarilar,
  type AralikHaftasi, type Suzgec,
} from './planGorunumu.ts';
import { kaynakAnahtari, kaynakEtiketi, kisaZaman, planAnahtari } from './usePlan.ts';
import './kaynak.css';
import './plan.css';
import './rotalar.css';

// Menüdeki plan sayfaları herkesin ortak gördüğü canlı planı gösterir; taslak ve düzenleme Reçete ve Rota > Plan'dadır.
function useCanliPlan() {
  return useQuery({ queryKey: planAnahtari(null), queryFn: () => api.get<PlanCevabi>('/plan') });
}

const kisaTarih = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;

// Bağlantı yalnız Reçete ve Rota sayfasını açabilene verilir: menüdeki plan sayfaları ondan bağımsız bir yetkidir, açamayana ölü bağlantı gösterilmez.
function PlanBaglantisi() {
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  return islemler.includes('sayfa.recete-rota') ? <Link className="tc-baglanti" to="/recete-rota/plan">Reçete ve Rota &gt; Plan</Link> : <>Reçete ve Rota &gt; Plan</>;
}

function PlanUyarilari({ veri }: { veri: PlanCevabi }) {
  const uyarilar = yerlesmeyenDisindakiUyarilar(veri);
  return (
    <>
      {uyarilar.length > 0 && (
        <div className="tc-panel tc-plan-uyari" role="region" aria-label="Plan uyarıları">
          <div className="tc-satir"><Simge ad="alert" boyut="k" /><b>Uyarılar ({uyarilar.length})</b></div>
          <ul className="tc-rota-farklar">{uyarilar.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      )}
      {veri.yerlesmemis.length > 0 && (
        <div className="tc-panel tc-plan-uyari" role="region" aria-label="Yerleşmemiş iş emirleri">
          <div className="tc-satir"><Simge ad="alert" boyut="k" /><b>Yerleşmemiş iş emirleri ({veri.yerlesmemis.length})</b></div>
          <ul className="tc-rota-farklar">{veri.yerlesmemis.map((x) => <li key={x.isEmriId}>{x.emirNo} OP {x.opNo} {x.ad}: {x.neden}</li>)}</ul>
        </div>
      )}
    </>
  );
}

function SaltSayfa({ baslik, ipucu, children }: { baslik: string; ipucu: string; children: (p: PlanCevabi) => ReactNode }) {
  const p = useCanliPlan();
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label={baslik}>
        <div className="tc-sec-head">
          <h2>{baslik}</h2>
          <p className="tc-rota-ipucu">{ipucu}</p>
        </div>
        {p.isPending && <DurumKutusu durum="yukleniyor" />}
        {p.isError && <BolumHatasi hata={p.error} modul="Plan" yenile={() => { void p.refetch(); }} />}
        {p.data && (
          <>
            <div className="tc-panel tc-taslak-serit"><Rozet ton="tamam">Canlı plan</Rozet><small>Salt okunur; planı değiştirmek için <PlanBaglantisi />.</small></div>
            <PlanUyarilari veri={p.data} />
            {children(p.data)}
          </>
        )}
      </section>
    </div>
  );
}

// Aralık, gezinti ve süzgeç durumu iki sayfada aynıdır.
function useGorunum(veri: PlanCevabi) {
  const [suzgec, suzgecYaz] = useState<Suzgec>(BOS_SUZGEC);
  const [hafta, haftaYaz] = useState<AralikHaftasi>(2);
  const [kaydirma, kaydirmaYaz] = useState(0);
  const konum = kaydir(veri, hafta, kaydirma, 0);
  const pencere = useMemo(() => pencereKur(veri, hafta, konum), [veri, hafta, konum]);
  const sinir = gezinebilir(veri, hafta, konum);
  return {
    suzgec, suzgecYaz, hafta, pencere, sinir,
    haftaSec: (h: AralikHaftasi) => { haftaYaz(h); kaydirmaYaz(kaydir(veri, h, konum, 0)); },
    gez: (yon: -1 | 1) => kaydirmaYaz(kaydir(veri, hafta, konum, yon)),
    bugun: () => kaydirmaYaz(0),
    bugunde: konum === 0,
  };
}

function Araclar({ veri, g }: { veri: PlanCevabi; g: ReturnType<typeof useGorunum> }) {
  const { suzgec, suzgecYaz, pencere } = g;
  const istasyonlar = istasyonSecenekleri(veri);
  const sonGun = pencere.gunler[pencere.gunler.length - 1] ?? '';
  return (
    <div className="tc-panel tc-plan-arac" role="search" aria-label="Plan süzgeçleri">
      <label className="tc-ara">
        <Simge ad="search" boyut="k" />
        <input className="tc-inp" type="search" aria-label="Emir ve ürün ara" placeholder="Emir no, ürün kodu ya da adı" value={suzgec.arama} onChange={(e) => suzgecYaz({ ...suzgec, arama: e.target.value })} />
      </label>
      <select className="tc-inp tc-inp-orta" aria-label="İstasyon" value={suzgec.istasyonId === null ? '' : String(suzgec.istasyonId)}
        onChange={(e) => suzgecYaz({ ...suzgec, istasyonId: e.target.value === '' ? null : Number(e.target.value) })}>
        <option value="">Tüm istasyonlar</option>
        {istasyonlar.map((i) => <option key={i.id} value={i.id}>{i.etiket}</option>)}
      </select>
      <span className="tc-seg" role="group" aria-label="Aralık">
        {ARALIK_HAFTALARI.map((h) => <button key={h} type="button" aria-pressed={g.hafta === h} onClick={() => g.haftaSec(h)}>{h} hafta</button>)}
      </span>
      <span className="tc-gezinti" role="group" aria-label="Aralık gezintisi">
        <Dugme simge="chev-left" aria-label="Önceki aralık" title="Önceki aralık" disabled={!g.sinir.geri} onClick={() => g.gez(-1)} />
        <output aria-live="polite">{kisaTarih(pencere.gunler[0] ?? '')} – {kisaTarih(sonGun)}</output>
        <Dugme simge="chev-right" aria-label="Sonraki aralık" title="Sonraki aralık" disabled={!g.sinir.ileri} onClick={() => g.gez(1)} />
        <Dugme disabled={g.bugunde} onClick={g.bugun}>Bugün</Dugme>
      </span>
    </div>
  );
}

function Efsane({ ad, ogeler }: { ad: string; ogeler: readonly { sinif: string; metin: string }[] }) {
  return (
    <ul className="tc-efsane" aria-label={ad}>
      {ogeler.map((o) => <li key={o.metin}><i className={`tc-efsane-renk ${o.sinif}`} aria-hidden="true" />{o.metin}</li>)}
    </ul>
  );
}

const CIZELGE_EFSANESI = [
  ...[1, 2, 3, 4].map((n) => ({ sinif: `tc-onc-${n}`, metin: `Öncelik: ${ONCELIK_ADI[n]}` })),
  { sinif: 'tc-efsane-gec', metin: `${DURUM_ADI.gec} (teslimden sonra bitiyor)` },
  { sinif: 'tc-efsane-uyari', metin: `${DURUM_ADI.uyari} (plan uyarısı var)` },
];
const MATRIS_EFSANESI = [
  ...YUK_EFSANESI.map((e) => ({ sinif: `tc-yuk-${e.sinif}`, metin: `${e.ad} ${e.aralik}` })),
  { sinif: 'tc-kapali', metin: 'Kapasite yok' },
  { sinif: 'tc-veri-yok', metin: 'Plan bu günü kapsamıyor' },
];

type Secim = { tur: 'is' | 'emir'; id: number };

function YerlesimAyrintisi({ veri, y }: { veri: PlanCevabi; y: PlanYerlesimi }) {
  const k = veri.kaynaklar.find((x) => kaynakAnahtari(x) === kaynakAnahtari(y.kaynak));
  const d = yerlesimDurumu(y);
  return (
    <>
      <div className="tc-satir"><b>{y.emirNo} · OP {y.opNo} {y.ad}</b>{d !== 'normal' && <Rozet ton={d === 'gec' ? 'hata' : 'uyari'}>{DURUM_ADI[d]}</Rozet>}</div>
      <p className="tc-rota-ipucu">
        {y.urunKodu} {y.urunAdi} · {y.adet} adet · {k ? `${kaynakEtiketi(k)} · ` : ''}{kisaZaman(y.baslangic)} → {kisaZaman(y.bitis)}{y.teslim ? ` · teslim ${y.teslim}` : ''}{y.durum !== 'planli' ? ' · başladı' : ''}
      </p>
      {(y.kilitli || y.dondurulmus) && <p className="tc-satir">{y.kilitli && <Rozet ton="uyari">Kilitli</Rozet>}{y.dondurulmus && <Rozet ton="bilgi">Dondurulmuş bölgede</Rozet>}</p>}
      {y.uyarilar.length > 0 && <ul className="tc-rota-farklar">{y.uyarilar.map((u) => <li key={u}>{u}</li>)}</ul>}
    </>
  );
}

// Çubuğa dokununca yalnız bilgi: taşıma, kilit ve kaldırma Reçete ve Rota > Plan'dadır.
function YerlesimBilgisi({ veri, isEmriId, kapat }: { veri: PlanCevabi; isEmriId: number; kapat: () => void }) {
  const y = veri.yerlesimler.find((x) => x.isEmriId === isEmriId);
  if (!y) return null;
  return (
    <div className="tc-panel" role="dialog" aria-label={`${y.emirNo} OP ${y.opNo} yerleşimi`}>
      <div className="tc-satir tc-ust-hiza"><div className="tc-grow"><YerlesimAyrintisi veri={veri} y={y} /></div><button type="button" className="tc-ib" aria-label="Kapat" onClick={kapat}>✕</button></div>
    </div>
  );
}

// Zaman çizelgesindeki çubuk bir emirdir: emrin bütün iş emirleri aynı ayrıntı biçiminde, yerleşemeyenler nedeniyle.
function EmirBilgisi({ veri, emir, kapat }: { veri: PlanCevabi; emir: PlanEmri; kapat: () => void }) {
  const isler = veri.yerlesimler.filter((y) => y.uretimEmriId === emir.uretimEmriId);
  const yerlesmeyen = veri.yerlesmemis.filter((y) => y.uretimEmriId === emir.uretimEmriId);
  const d = emirDurumu(emir, isler);
  return (
    <div className="tc-panel" role="dialog" aria-label={`${emir.emirNo} emri`}>
      <div className="tc-satir">
        <b>{emir.emirNo} · {emir.urunKodu} {emir.urunAdi}</b>{d !== 'normal' && <Rozet ton={d === 'gec' ? 'hata' : 'uyari'}>{DURUM_ADI[d]}</Rozet>}
        <span className="tc-grow" /><button type="button" className="tc-ib" aria-label="Kapat" onClick={kapat}>✕</button>
      </div>
      <p className="tc-rota-ipucu">
        {emir.adet} adet · {emir.oncelik !== null ? ONCELIK_ADI[emir.oncelik] ?? 'Normal' : 'Öncelik yok'} · {emir.yerlesen}/{emir.isSayisi} iş yerleşti
        {emir.teslim ? ` · teslim ${emir.teslim}` : ''}{emir.tamponGun !== null ? ` · ${emir.tamponGun < 0 ? `${-emir.tamponGun} gün gecikme` : `${emir.tamponGun} gün tampon`}` : ''}
      </p>
      {isler.map((y) => <div key={y.isEmriId} className="tc-emir-is"><YerlesimAyrintisi veri={veri} y={y} /></div>)}
      {yerlesmeyen.length > 0 && <ul className="tc-rota-farklar">{yerlesmeyen.map((x) => <li key={x.isEmriId}>{x.emirNo} OP {x.opNo} {x.ad} yerleşmedi: {x.neden}</li>)}</ul>}
    </div>
  );
}

function CizelgeGovdesi({ veri }: { veri: PlanCevabi }) {
  const g = useGorunum(veri);
  const [secim, secimYaz] = useState<Secim | null>(null);
  const emirler = gorunenEmirler(veri, g.suzgec);
  const emir = secim?.tur === 'emir' ? veri.emirler.find((e) => e.uretimEmriId === secim.id) : undefined;
  return (
    <>
      <Gostergeler p={veri} />
      <Araclar veri={veri} g={g} />
      <Efsane ad="Çizelge efsanesi" ogeler={CIZELGE_EFSANESI} />
      <ZamanCizelgesi p={veri} pencere={g.pencere} emirler={emirler} sec={(id) => secimYaz({ tur: 'emir', id })} secili={emir?.uretimEmriId ?? null} />
      {emir && <EmirBilgisi veri={veri} emir={emir} kapat={() => secimYaz(null)} />}
      <div className="tc-panel">
        <h3>Makine ve kişi çizelgesi</h3>
        <KaynakCizelgesi veri={veri} pencere={g.pencere} suzgec={g.suzgec} sec={(id) => secimYaz({ tur: 'is', id })} secili={secim?.tur === 'is' ? secim.id : null} />
      </div>
      {secim?.tur === 'is' && <YerlesimBilgisi veri={veri} isEmriId={secim.id} kapat={() => secimYaz(null)} />}
    </>
  );
}

export function PlanCizelgesiEkrani() {
  return (
    <SaltSayfa baslik="Plan Çizelgesi" ipucu="Canlı planın emir zaman çizelgesi ile istasyona göre makine ve kişi çizelgesi. Bir çubuğa dokununca işin ayrıntısı görünür.">
      {(veri) => <CizelgeGovdesi veri={veri} />}
    </SaltSayfa>
  );
}

function MatrisGovdesi({ veri }: { veri: PlanCevabi }) {
  const g = useGorunum(veri);
  return (
    <>
      <Araclar veri={veri} g={g} />
      <Efsane ad="Doluluk efsanesi" ogeler={MATRIS_EFSANESI} />
      <PlanMatrisTablosu veri={veri} pencere={g.pencere} suzgec={g.suzgec} />
    </>
  );
}

export function PlanMatrisiEkrani() {
  return (
    <SaltSayfa baslik="Plan Matrisi" ipucu="Canlı planın istasyon, personel, makine ve kişi doluluğu ile emir planı; satır ve gün toplamları, hücreye dokununca o günün işleri.">
      {(veri) => <MatrisGovdesi veri={veri} />}
    </SaltSayfa>
  );
}
