import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { grades, NOT_ADI, type Not as NotDerecesi } from '../gorunum.ts';
import { addDays, fmtD, fmtDY, fmtK, METHOD_NAMES, nf, pct, type Karne } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { DERECE_TONU } from './hesap.ts';
import { Grafik, ortakSecenekler, saydam } from './Grafik.tsx';
import { Modeller } from './Modeller.tsx';
import { Aciklama, Not } from './parcalar.tsx';
import { RaporAraclari } from './RaporAraclari.tsx';
import './raporlar.css';

const yontemAdi = (k: string): string => METHOD_NAMES[k as keyof typeof METHOD_NAMES] ?? k;

// Tahminler ve doğruluk (prototip VIEWS.karne + modeller): sistem kendi tahminlerini geçmişe dönük sınar; altında teknik ayrıntılar.
export function Tahminler({ finans }: EkranOzellikleri) {
  const { hash } = useLocation();
  // "Nasıl hesaplandı?" bağı model bölümüne iner (prototip toModel).
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  if (!finans) return null;
  const { motor } = finans;
  if (!motor.durum.tx.length) return <p className="tc-fr-bos">Sınama için kayıt gerekiyor.</p>;
  const B = motor.backtestAll(), G = grades(B), A = motor.runAnalysis();
  return (
    <div className="tc-fr">
      <RaporAraclari sol={<small className="tc-fr-soluk">Sınama {nf(B.ms)} ms sürdü</small>} />
      <Not>Sistem kendi tahminlerini sınar: geçmiş bir tarihe geri döner, o gün bilinenlerle tahmin yapar, sonra gerçekte olanla karşılaştırır. Sınama sizin verinizle yapılır ve her kayıtta yenilenir.</Not>
      <Karneler B={B} G={G} />
      {B.cash && <GeriSinama B={B} />}
      <Modeller motor={motor} A={A} />
    </div>
  );
}

function KarneKarti({ not, baslik, buyuk, alt, satirlar, ne }: { not: NotDerecesi; baslik: string; buyuk: string | null; alt: ReactNode; satirlar: ReactNode[]; ne: string }) {
  return (
    <Kart baslik={baslik} sag={<Rozet ton={DERECE_TONU[not]}>{NOT_ADI[not]}</Rozet>}>
      {buyuk !== null ? <><div className="tc-fr-buyuk">{buyuk}</div><p className="tc-fr-soluk">{alt}</p></> : <p className="tc-fr-soluk">{alt}</p>}
      {satirlar.length > 0 && <ul className="tc-fr-satirlar">{satirlar.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      <Aciklama baslik="Bu tahmin ne anlatır?"><p>{ne}</p></Aciklama>
    </Kart>
  );
}

function Karneler({ B, G }: { B: Karne; G: ReturnType<typeof grades> }) {
  const c = B.cash, s = B.sales, a = B.ar, u = B.cust;
  return (
    <div className="tc-fr-ikili">
      <KarneKarti
        not={G.cash} baslik="Nakit tahmini" buyuk={c ? pct(c.cov80, 0) : null}
        alt={c ? 'Gerçekleşen haftalık bakiyelerin, tahmin edilen olası aralık (%10–90) içinde kalma oranı. İdeal değer %80 civarıdır.' : 'En az 4 aylık kayıt gerektiğinden henüz sınanamadı.'}
        satirlar={c ? [
          <>Ortanca tahmin, gerçekleşenden ortalama <b>{pct(c.errMed, 0)}</b> saptı.</>,
          <>&quot;Nakit olduğu gibi kalır&quot; varsayımına göre <b>{pct(1 - c.errMed / c.errNaive, 0)}</b> daha isabetli.</>,
          <>{c.runs.length} farklı başlangıç tarihi, toplam {c.runs.length * 13} hafta sınandı.</>,
        ] : []}
        ne="Önümüzdeki 13 haftada kasadaki paranın hangi aralıkta seyredeceğini gösterir. Tek bir rakam vermez; müşterilerin geçmiş ödeme alışkanlıklarından binlerce olası senaryo üretip en olası seyri ve olası aralığı çizer. 'Eksiye düşme olasılığı %5' demek, 100 olası gelecekten 5'inde nakdin yetmediği anlamına gelir."
      />
      <KarneKarti
        not={G.sales} baslik="Satış tahmini" buyuk={s && s.mape[s.best] !== null ? pct(s.mape[s.best]!, 0) : null}
        alt={s ? 'Bir ay sonrasının satış tahmininin ortalama sapması.' : 'En az 5 aylık satış kaydı gerekiyor.'}
        satirlar={s ? [
          <>Kullanılan yöntem: <b>{yontemAdi(s.best)}</b>. Geçmişte en iyi tutan yöntem otomatik seçildi.</>,
          <>Karşılaştırma: {Object.entries(s.mape).filter(([, v]) => v !== null).map(([k, v]) => `${yontemAdi(k)} ${pct(v!, 0)}`).join(', ')}.</>,
          <>{s.n} ay için sınandı.</>,
        ] : []}
        ne="Gelecek ay ne kadar satış yapılacağını tahmin eder. Nakit simülasyonu yeni satışların büyüklüğünü buradan alır. Satışları dalgalı şirketlerde basit yöntemler (son 3 ayın ortalaması gibi) karmaşık yöntemlerden daha iyi tutabilir; sistem bu yüzden yöntemi her ay yeniden seçer."
      />
      <KarneKarti
        not={G.ar} baslik="Tahsilat ve alacak kaybı" buyuk={a ? pct(a.actualOpenPct, 1) : null}
        alt={a ? <>6 ay önce açık olan {fmtK(a.total)} alacağın bugün hâlâ tahsil edilemeyen kısmı. Model o gün <b>{pct(a.predLossPct, 1)}</b> öngörmüştü.</> : 'En az 10 aylık kayıt gerekiyor.'}
        satirlar={a ? [
          <>{a.count} fatura izlendi.</>,
          <>{a.predLossPct > a.actualOpenPct ? 'Model biraz temkinli: kaybı gerçekleşenden yüksek tahmin ediyor.' : 'Model biraz iyimser: kaybı gerçekleşenden düşük tahmin ediyor.'}</>,
        ] : []}
        ne="Bugün açık olan alacakların ne kadarının hiç tahsil edilemeyeceğini tahmin eder. Faturaların aydan aya hangi gecikme grubuna geçtiğini geçmişinizden öğrenir. Sonuç, şüpheli alacak karşılığı ayırmak ve geç ödeyen müşterilere ne kadar vade verileceğine karar vermek için kullanılır."
      />
      <KarneKarti
        not={G.cust} baslik="Müşteri risk notları" buyuk={u && u.rho !== null ? nf(u.rho, 2) : null}
        alt={u ? '6 ay önce verilen notların, müşterilerin sonraki gecikmeleriyle sıra uyumu (1 = kusursuz, 0 = ilişki yok).' : 'En az 3 müşteride yeterli ödeme geçmişi gerekiyor.'}
        satirlar={u ? u.rows.slice(0, 6).map((r) => <>{r.party}: o gün puan {r.score}, sonra ortalama {nf(r.laterDelay)} gün gecikme</>) : []}
        ne="Her müşteriye ödeme geçmişine göre A–D arası not verir. Yakın tarihli gecikmeler daha ağır sayılır. Not, yeni satışta vade ve teminat kararını desteklemek içindir; az sayıda müşteride uyum ölçüsü dalgalı olabilir."
      />
    </div>
  );
}

// 13 hafta önce yapılan nakit tahmini ve gerçekleşen (prototip cBack): gölge %10-90, çizgi ortanca, noktalar gerçekleşen.
function GeriSinama({ B }: { B: Karne }) {
  const r = B.cash!.runs[0]!;
  return (
    <Kart baslik="13 hafta önce yapılan nakit tahmini ve gerçekte olan" sag={<small className="tc-fr-soluk">{fmtDY(r.T)} tarihinde yapılmış olsaydı</small>}>
      <Grafik
        etiket="Geçmiş nakit tahmini ve gerçekleşen" boy="uzun" anahtar={`${r.T}|${r.actual.join(',')}`}
        kur={(k) => ({
          type: 'line',
          data: {
            labels: r.bands.map((_, i) => fmtD(addDays(r.T, i * 7 + 6))),
            datasets: [
              { label: '_p90', data: r.bands.map((b) => b.p90), borderWidth: 0, pointRadius: 0, fill: false },
              { label: 'Olası aralık (%10–90)', data: r.bands.map((b) => b.p10), borderWidth: 0, pointRadius: 0, backgroundColor: saydam(k.seri, 0.15), fill: '-1' },
              { label: 'Tahmin (en olası)', data: r.bands.map((b) => b.p50), borderColor: k.seri, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
              { label: 'Gerçekleşen', data: r.actual, borderColor: k.iyi, backgroundColor: k.iyi, borderWidth: 0, pointRadius: 5, showLine: false },
            ],
          },
          options: ortakSecenekler(k),
        })}
      />
      <Not>Gölge, o gün tahmin edilen olası aralık; koyu çizgi en olası seyir; yeşil noktalar gerçekleşen bakiye. Noktaların çoğu gölgenin içindeyse tahmin güvenilirdir.</Not>
    </Kart>
  );
}
