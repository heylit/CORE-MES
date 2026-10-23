import { useCallback } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { Kart, Rozet, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { kisaTarih, tarih, tl, YOK } from '../bicim.ts';
import { taxDay, ymAdd, ymLabel, ymLong, type FinansMotoru, type KdvAyi } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { Grafik, saydam, temelAyar, type Renkler } from './grafik.tsx';
import { OzetSeridi } from './parcalar.tsx';
import { kalanGun, kalanGunTonu, vergiOzeti } from './plan.ts';

// Vergi takvimi (prototip VIEWS.vergi): kayıtlardan hesaplanan KDV ve yaklaşan beyan tarihleri. Yalnız okuma.
export function VergiTakvimi({ finans }: EkranOzellikleri) {
  if (!finans) return null;
  const { motor } = finans;
  const v = vergiOzeti(motor);
  const sutunlar: Sutun<KdvAyi>[] = [
    { anahtar: 'donem', baslik: 'Dönem', hucre: (m) => ymLong(m.ym), csv: (m) => m.ym },
    { anahtar: 'h', baslik: 'Hesaplanan', hizala: 'sag', mono: true, hucre: (m) => tl(m.h), csv: (m) => m.h },
    { anahtar: 'i', baslik: 'İndirilecek', hizala: 'sag', mono: true, hucre: (m) => tl(m.i), csv: (m) => m.i },
    { anahtar: 'devir', baslik: 'Devreden', hizala: 'sag', mono: true, hucre: (m) => tl(m.carryOut), csv: (m) => m.carryOut },
    { anahtar: 'odenecek', baslik: 'Ödenecek', hizala: 'sag', mono: true, hucre: (m) => <b>{tl(m.payable)}</b>, csv: (m) => m.payable },
  ];
  return (
    <div className="tc-fy-bolum tc-fc">
      <p className="tc-fy-not">Kayıtlardan hesaplanan KDV ve yaklaşan beyan tarihleri. Kesin tutarlar için mali müşavirinizin hesabını esas alın.</p>
      {/* Ayın kaydı yoksa tutar bilinmez; sıfır yazılmaz (423/9 b). */}
      <OzetSeridi etiket="KDV özeti" hucreler={[
        {
          etiket: 'Geçen ay ödenecek KDV', deger: v.gecenAy ? tl(v.gecenAy.payable) : YOK,
          alt: v.gecenAy ? `${ymLong(v.gecenAy.ym)}, son gün ${kisaTarih(taxDay(ymAdd(v.gecenAy.ym, 1), 28))}` : '',
        },
        { etiket: 'Bu ay hesaplanan', deger: v.buAy ? tl(v.buAy.h) : YOK, alt: 'Satışlardan' },
        { etiket: 'Bu ay indirilecek', deger: v.buAy ? tl(v.buAy.i) : YOK, alt: 'Alışlardan' },
        { etiket: 'Bu ay için birikmiş', deger: v.buAy ? tl(v.buAy.payable) : YOK, alt: 'Gelecek ay ödenecek tahmini', ton: 'uyari' },
      ]} />
      <div className="tc-fc-iki">
        <Kart baslik="Yaklaşan beyan ve ödemeler" baslikEki={<span className="tc-fy-not">75 gün</span>}>
          <ul className="tc-fc-satirlar" aria-label="Yaklaşan beyan ve ödemeler">
            {v.takvim.map((e) => {
              const g = kalanGun(e.date, motor.bugun);
              return (
                <li key={`${e.date}-${e.name}`} className="tc-fc-satir">
                  <span className="tc-fc-yigin">
                    <b>{e.name}</b>
                    <small className="tc-fy-not">{tarih(e.date)} · Dönem: {e.per}{e.amount ? ` · Tahmini ${tl(e.amount)}` : ''}</small>
                  </span>
                  <Rozet ton={kalanGunTonu(g)}>{g} gün kaldı</Rozet>
                </li>
              );
            })}
          </ul>
          <p className="tc-fy-not">Tarihler genel kurala göre üretilir; hafta sonuna denk gelenler pazartesiye kaydırılır. Resmî tatiller ve Gelir İdaresi'nin süre uzatma sirkülerleri hesaba katılmaz.</p>
        </Kart>
        <Kart baslik="KDV hareketi" baslikEki={<span className="tc-fy-not">Son aylar</span>}>
          <KdvGrafigi motor={motor} />
        </Kart>
      </div>
      <Kart baslik="KDV dönem tablosu" baslikEki={<span className="tc-fy-not">Devreden KDV sonraki aya aktarılır</span>}>
        <Tablo<KdvAyi> etiket="KDV dönem tablosu" sutunlar={sutunlar} satirlar={v.aylar.slice().reverse()} satirAnahtari={(m) => m.ym} arac={{ csv: { ad: 'kdv-donemleri' } }} />
      </Kart>
    </div>
  );
}

function KdvGrafigi({ motor }: { motor: FinansMotoru }) {
  const kur = useCallback((r: Renkler): ChartConfiguration => {
    const aylar = vergiOzeti(motor).aylar;
    return {
      type: 'bar',
      data: {
        labels: aylar.map((m) => ymLabel(m.ym)),
        datasets: [
          { type: 'bar' as const, label: 'Hesaplanan', data: aylar.map((m) => m.h), backgroundColor: saydam(r.bakiye, 0.75), borderRadius: 4 },
          { type: 'bar' as const, label: 'İndirilecek', data: aylar.map((m) => m.i), backgroundColor: saydam(r.giris, 0.7), borderRadius: 4 },
          { type: 'line' as const, label: 'Ödenecek', data: aylar.map((m) => m.payable), borderColor: r.uyari, backgroundColor: r.uyari, tension: 0.3 },
        ],
      } as ChartConfiguration['data'],
      options: temelAyar(r),
    };
  }, [motor]);
  return <Grafik etiket="KDV hareketi: hesaplanan, indirilecek ve ödenecek" kur={kur} />;
}
