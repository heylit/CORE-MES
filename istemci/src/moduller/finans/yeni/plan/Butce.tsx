import { useCallback, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { Dugme, Kart, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { Komut } from '../akislar.ts';
import { sayiMetni, tl } from '../bicim.ts';
import { fmtK, pct, ymLabel, ymLong, type FinansMotoru } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useFinansKomutu } from '../veri.ts';
import { Grafik, saydam, temelAyar, type Renkler } from './grafik.tsx';
import { OzetSeridi, SecimSeridi } from './parcalar.tsx';
import {
  altiAyKomutlari, BUTCE_DURUM_ADI, butceAylari, butceKalemi, butceKomutu, butceTablosu, ilkButceAyi, type ButceDurumu, type ButceSatiri,
} from './plan.ts';

const DURUM_TONU: Record<ButceDurumu, RozetTonu> = { yok: 'pasif', asildi: 'hata', sinirda: 'uyari', hizli: 'uyari', plan: 'tamam' };
const kisaKalem = (k: string): string => k.replace(' (net maaş)', '').replace('Mal / hammadde alımı', 'Mal alımı');

// Bütçe (prototip VIEWS.butce). Tutar "bu aydan itibaren" geçerlidir; girişi finans.yonet yapar (uç), öteki rol yalnız okur.
export function Butce({ finans, yetki }: EkranOzellikleri) {
  const [ay, ayYaz] = useState<string>(() => ilkButceAyi(finans?.motor.bugun ?? new Date().toISOString().slice(0, 10)));
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  if (!finans) return null;
  const { motor } = finans;
  const T = butceTablosu(motor, ay);
  const A = motor.runAnalysis();
  const gonder = (komutlar: Komut[]) => {
    if (!komutlar.length) return;
    komut.mutate({ komutlar }, {
      onSuccess: () => bildir('tamam', komutlar[0]!.basari),
      onError: (h) => bildir('hata', hataIletisi(h, 'Bütçe kaydedilemedi.')),
    });
  };
  const tutarGirdisi = (etiket: string, deger: number, kalem: ReturnType<typeof butceKalemi>, adim: number) => {
    if (!yetki.yonet || !kalem) return deger ? tl(deger) : '—';
    return <ButceGirdisi key={deger} etiket={etiket} deger={deger} adim={adim} kaydet={(v) => gonder([butceKomutu(kalem, motor.bugun, v)])} />;
  };

  const sutunlar: Sutun<ButceSatiri>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (s) => s.kalem },
    { anahtar: 'butce', baslik: 'Aylık bütçe', hizala: 'sag', mono: true, hucre: (s) => tutarGirdisi(`${s.kalem} bütçesi`, s.butce, butceKalemi(s.kalem), 1000), csv: (s) => s.butce },
    { anahtar: 'gercek', baslik: 'Gerçekleşen', hizala: 'sag', mono: true, hucre: (s) => tl(s.gercek), csv: (s) => s.gercek },
    { anahtar: 'kalan', baslik: 'Kalan', hizala: 'sag', mono: true, hucre: (s) => <span className={s.kalan < 0 ? 'tc-fc-eksi' : ''}>{tl(s.kalan)}</span>, csv: (s) => s.kalan },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={DURUM_TONU[s.durum]}>{BUTCE_DURUM_ADI[s.durum]}</Rozet>, csv: (s) => BUTCE_DURUM_ADI[s.durum] },
    { anahtar: 'yil', baslik: 'Yıl ort.', hizala: 'sag', mono: true, hucre: (s) => <span className="tc-fy-not">{tl(s.yilOrt)}</span>, csv: (s) => s.yilOrt },
  ];

  return (
    <div className="tc-fy-bolum tc-fc">
      <p className="tc-fy-not">Her gider kalemi için aylık bütçe; gerçekleşenle fark anında görünür.{yetki.yonet ? ' Bütçe tutarını tabloda doğrudan değiştirebilirsiniz.' : ''}</p>
      <OzetSeridi etiket="Bütçe özeti" hucreler={[
        { etiket: 'Aylık gider bütçesi', deger: tl(T.toplamButce) },
        { etiket: 'Gerçekleşen gider', deger: tl(T.toplamGercek), alt: T.buAy ? `Ayın %${sayiMetni(T.ayOrani * 100)}'i geçti` : `${ymLong(T.ay)}, ay tamamlandı`, ton: T.toplamGercek > T.toplamButce ? 'eksi' : null },
        { etiket: 'Satış hedefi', deger: tl(T.hedef), alt: A.hf ? `Model tahmini: ${tl(A.hf.fc[0]!.v)}` : '' },
        { etiket: 'Satış (KDV hariç)', deger: tl(T.satis), alt: T.hedef ? `Hedefin ${pct(T.satis / T.hedef, 0)}'i` : 'Hedef girilmedi', ton: T.hedef && T.satis >= T.hedef * T.ayOrani ? 'arti' : 'uyari' },
      ]} />
      <div className="tc-fc-iki">
        <Kart baslik={`Bütçe ve gerçekleşen: ${ymLong(ay)}`}>
          <div className="tc-fc-arac">
            <SecimSeridi etiket="Ay" secenekler={butceAylari(motor.bugun).map((m) => [m, ymLabel(m)] as const)} secili={ay} sec={ayYaz} />
            {yetki.yonet && <Dugme simge="rotate" yukleniyor={komut.isPending} onClick={() => gonder(altiAyKomutlari(motor))}>Son 6 ay ortalamasıyla doldur</Dugme>}
          </div>
          <Tablo<ButceSatiri> etiket={`Bütçe ve gerçekleşen: ${ymLong(ay)}`} sutunlar={sutunlar} satirlar={T.satirlar} satirAnahtari={(s) => s.kalem} arac={{ csv: { ad: `butce-${ay}` } }} />
          <dl className="tc-fc-hedef">
            <dt>Aylık satış hedefi</dt>
            <dd>{tutarGirdisi('Satış hedefi', T.hedef, 'satis_hedefi', 10000)}</dd>
            <dt>Gerçekleşen</dt><dd className="tc-fc-tutar">{tl(T.satis)}</dd>
            <dt>Kalan</dt><dd className="tc-fc-tutar">{tl(T.hedef - T.satis)}</dd>
          </dl>
          <p className="tc-fy-not">"Hızlı gidiyor": harcama oranı ayın geçen kısmından belirgin yüksek. Maaş ve kira gibi ay başında ödenen kalemlerde bu normaldir.</p>
        </Kart>
        <Kart baslik="Görsel karşılaştırma" baslikEki={<span className="tc-fy-not">{ymLong(ay)}</span>}>
          <ButceGrafigi motor={motor} ay={ay} />
        </Kart>
      </div>
    </div>
  );
}

// Prototipte change olayıyla gönderilir (odak çıkınca ya da Enter); değişmeyen değer gönderilmez.
function ButceGirdisi({ etiket, deger, adim, kaydet }: { etiket: string; deger: number; adim: number; kaydet: (v: number) => void }) {
  const [metin, metinYaz] = useState(deger ? String(deger) : '');
  const bitir = () => { const v = Math.max(0, Number(metin) || 0); if (v !== deger) kaydet(v); };
  return (
    <input
      className="tc-alan-kutu tc-fc-butce-girdi" type="number" min={0} step={adim} inputMode="decimal" aria-label={etiket} value={metin}
      onChange={(e) => metinYaz(e.target.value)} onBlur={bitir} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bitir(); } }}
    />
  );
}

function ButceGrafigi({ motor, ay }: { motor: FinansMotoru; ay: string }) {
  const kur = useCallback((r: Renkler): ChartConfiguration => {
    const T = butceTablosu(motor, ay);
    const satirlar = T.satirlar.filter((s) => s.butce || s.gercek);
    return {
      type: 'bar',
      data: {
        labels: satirlar.map((s) => kisaKalem(s.kalem)),
        datasets: [
          { label: 'Bütçe', data: satirlar.map((s) => s.butce), backgroundColor: saydam(r.bakiye, 0.25), borderColor: r.bakiye, borderWidth: 1, borderRadius: 4 },
          { label: 'Gerçekleşen', data: satirlar.map((s) => s.gercek), backgroundColor: satirlar.map((s) => (s.gercek > (s.butce || Infinity) ? r.cikis : r.giris)), borderRadius: 4 },
        ],
      },
      options: temelAyar(r, {
        indexAxis: 'y',
        scales: { x: { grid: { color: r.izgara }, ticks: { color: r.soluk, callback: (v) => fmtK(Number(v)) } }, y: { grid: { display: false }, ticks: { color: r.soluk } } },
        plugins: {
          legend: { labels: { color: r.soluk } },
          tooltip: { backgroundColor: r.metin, titleColor: r.zemin, bodyColor: r.zemin, callbacks: { label: (c) => ` ${c.dataset.label ?? ''}: ${tl(Number((c.parsed as { x: number }).x))}` } },
        },
      }),
    };
  }, [motor, ay]);
  return <Grafik etiket={`Bütçe ve gerçekleşen karşılaştırması: ${ymLong(ay)}`} boy="uzun" kur={kur} />;
}
