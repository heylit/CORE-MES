import { useState } from 'react';
import { Girdi, Kart } from '../../../../ortak/arayuz/index.ts';
import { fmt, nf, pct } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { basabas, basabasEgrisi, kredi, sonUcAyAkisi, yatirim, type Araclar } from './hesap.ts';
import { Grafik, ortakSecenekler, saydam } from './Grafik.tsx';
import { Not, Satir } from './parcalar.tsx';
import { RaporAraclari } from './RaporAraclari.tsx';
import './raporlar.css';

type Grup = keyof Araclar;

// Karar araçları (prototip VIEWS.arac): başabaş, yatırım değerlendirme, kredi taşınabilirliği. Yalnız yerel hesap;
// girdiler kaydedilmez (prototipin gömülü kipinde de sayfa yenilenince başlangıç değerine döner).
export function KararAraclari({ finans }: EkranOzellikleri) {
  const [T, setT] = useState<Araclar | null>(() => (finans ? structuredClone(finans.motor.durum.tools) : null));
  if (!finans || !T) return null;
  const degistir = <G extends Grup>(g: G, k: keyof Araclar[G], v: string) =>
    setT((o) => (o ? { ...o, [g]: { ...o[g], [k]: Number(v) || 0 } } : o));
  // Sonuç prototipteki gibi değer kesinleşince (alan bırakılınca ya da Enter) yenilenir, her tuşta değil.
  const alan = <G extends Grup>(g: G, k: keyof Araclar[G] & string, ad: string, adim = 1) => (
    <Girdi
      etiket={ad} type="number" step={adim} inputMode="decimal" defaultValue={String(T[g][k])}
      onBlur={(e) => degistir(g, k, e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') degistir(g, k, e.currentTarget.value); }}
    />
  );

  const be = basabas(T.be), egri = basabasEgrisi(T.be);
  const yt = yatirim(T.inv);
  const akis = sonUcAyAkisi(finans.motor);
  const kr = kredi(T.loan, akis);

  return (
    <div className="tc-fr">
      <RaporAraclari />
      <Not>Üç sık karar için hesap makinesi: kaç adet satmalıyım, bu yatırım değer mi, bu krediyi taşıyabilir miyim?</Not>
      <div className="tc-fr-uclu">
        <Kart baslik="Başabaş noktası">
          <div className="tc-fr-form">
            {alan('be', 'fixed', 'Aylık sabit gider', 1000)}{alan('be', 'price', 'Birim satış fiyatı')}{alan('be', 'varCost', 'Birim değişken maliyet')}{alan('be', 'units', 'Aylık satış adedi')}
          </div>
          <Satir ad="Birim katkı payı">{fmt(be.katki)}</Satir>
          <Satir ad="Başabaş adedi">{be.adet ? `${nf(Math.ceil(be.adet))} adet` : 'Fiyat maliyetin altında'}</Satir>
          <Satir ad="Başabaş cirosu">{be.ciro === null ? '—' : fmt(be.ciro)}</Satir>
          <Satir ad="Güvenlik marjı" ton={be.guvenlik === null ? undefined : be.guvenlik < 0 ? 'durdu' : be.guvenlik < 0.15 ? 'durakli' : 'calisiyor'}>{be.guvenlik === null ? '—' : pct(be.guvenlik, 0)}</Satir>
          {be.guvenlik !== null && <Not>{be.guvenlik < 0 ? 'Mevcut satış başabaşın altında; her ay zarar ediliyor.' : be.guvenlik < 0.15 ? 'Satışlar başabaşa çok yakın.' : 'Satışlar başabaşın rahatça üzerinde.'}</Not>}
          <Grafik
            etiket="Başabaş grafiği" boy="kisa" anahtar={JSON.stringify(T.be)}
            kur={(r) => ({
              type: 'line',
              data: { labels: egri.xs.map((x) => nf(x)), datasets: [
                { label: 'Ciro', data: egri.ciro, borderColor: r.iyi, pointRadius: 0 },
                { label: 'Toplam maliyet', data: egri.maliyet, borderColor: r.risk, pointRadius: 0 },
              ] },
              options: ortakSecenekler(r),
            })}
          />
        </Kart>
        <Kart baslik="Yatırım değerlendirme">
          <div className="tc-fr-form">
            {alan('inv', 'cost', 'Yatırım tutarı', 10000)}{alan('inv', 'cash', 'Yıllık net nakit katkısı', 10000)}{alan('inv', 'years', 'Ekonomik ömür (yıl)')}{alan('inv', 'rate', 'İskonto oranı %')}{alan('inv', 'salvage', 'Hurda değeri', 10000)}
          </div>
          <Satir ad="Net bugünkü değer" ton={yt.nbd >= 0 ? 'calisiyor' : 'durdu'}>{fmt(yt.nbd)}</Satir>
          <Satir ad="İç verim oranı">{yt.iko === null ? '—' : pct(yt.iko)}</Satir>
          <Satir ad="Geri dönüş süresi">{yt.donus === null ? 'Ömür içinde dönmüyor' : `${nf(yt.donus, 1)} yıl`}</Satir>
          <Not>{yt.nbd >= 0 ? 'İskonto oranının üzerinde değer yaratıyor.' : 'İskonto oranında değer kaybettiriyor; nakit katkısı artmalı veya tutar düşmeli.'} Yüksek enflasyonda iskonto oranını enflasyon ve kredi faizinin üzerinde tutun.</Not>
          <Grafik
            etiket="Kümülatif bugünkü değer" boy="kisa" anahtar={JSON.stringify(T.inv)}
            kur={(r) => {
              const o = ortakSecenekler(r);
              return {
                type: 'bar',
                data: { labels: yt.bugunku.map((_, i) => `${i}. yıl`), datasets: [{ label: 'Kümülatif bugünkü değer', data: yt.bugunku, backgroundColor: yt.bugunku.map((v) => (v >= 0 ? saydam(r.iyi, 0.8) : saydam(r.risk, 0.7))), borderRadius: 4 }] },
                options: { ...o, plugins: { ...o.plugins, legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.y)}` } } } },
              };
            }}
          />
        </Kart>
        <Kart baslik="Kredi taşınabilirliği">
          <div className="tc-fr-form">
            {alan('loan', 'amount', 'Kredi tutarı', 10000)}{alan('loan', 'rate', 'Aylık faiz %', 0.01)}{alan('loan', 'months', 'Vade (ay)')}
          </div>
          <Satir ad="Aylık taksit">{fmt(kr.taksit)}</Satir>
          <Satir ad="Toplam faiz" ton="durdu">{fmt(kr.toplamFaiz)}</Satir>
          <Satir ad="Son 3 ay ort. net nakit akışı" ton={akis >= 0 ? undefined : 'durdu'}>{fmt(akis)}</Satir>
          <Satir ad="Taksitin bu akışa oranı" ton={kr.ton === 'risk' ? 'durdu' : kr.ton === 'warn' ? 'durakli' : 'calisiyor'}>{kr.oran === null ? 'Akış negatif' : pct(kr.oran, 0)}</Satir>
          <Not>
            {akis <= 0 ? 'Son aylarda nakit çıkışı girişten fazla; yeni taksit açığı büyütür.'
              : kr.oran !== null && kr.oran > 0.5 ? 'Taksit, aylık nakit fazlasının yarısından fazlası. Daha uzun vade veya daha düşük tutar düşünün.'
                : kr.oran !== null && kr.oran > 0.3 ? 'Taşınabilir ama tampon azalır.' : 'Mevcut nakit akışıyla rahat taşınabilir görünüyor.'} BSMV, KKDF ve masraflar dahil değildir.
          </Not>
        </Kart>
      </div>
    </div>
  );
}
