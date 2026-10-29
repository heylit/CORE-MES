import { useQuery } from '@tanstack/react-query';
import { KARAR_MODLARI, KARAR_MODU_ADLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { RaporCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu, Kart, SayfaBasligi, SayiKarti } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { analizAnahtarlari } from './analiz-anahtarlari.ts';
import { malzemeEtiketi, ondalikSayi, ondalikTopla, ortalamaIsGunu, tlMetni } from './analiz.ts';
import { KOK } from './Konfigurasyon.tsx';
import './analiz.css';

interface Cubuk { etiket: string; deger: number; yazi: string; alt?: string }

// Çizim alanı viewBox birimidir; SVG kartın genişliğine yayılır. Değer çubuğun üstünde, ad altında yazar.
const EN = 560;
const BOY = 240;
const SOL = 40;
const ALT = 48;
const UST = 16;

const sayi = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function CubukGrafik({ baslik, cubuklar }: { baslik: string; cubuklar: readonly Cubuk[] }) {
  if (cubuklar.length === 0) return <p className="tc-dy-bos">Bu dönemde veri yok.</p>;
  const tavan = Math.max(1, ...cubuklar.map((c) => c.deger)) * 1.15;
  const adim = (EN - SOL - 10) / cubuklar.length;
  const en = Math.max(2, Math.min(46, adim - 10));
  const y = (d: number): number => BOY - ALT - (Math.max(0, d) / tavan) * (BOY - ALT - UST);
  const cizgiler = [0, tavan / 2, tavan];
  return (
    <div className="tc-dy-grafik">
      <svg viewBox={`0 0 ${EN} ${BOY}`} role="img" aria-label={baslik}>
        {cizgiler.map((t) => (
          <g key={t}>
            <line className="tc-dy-grafik-izgara" x1={SOL} x2={EN - 6} y1={y(t)} y2={y(t)} />
            <text className="tc-dy-grafik-yazi" x={SOL - 6} y={y(t) + 4} textAnchor="end">{sayi(Math.round(t))}</text>
          </g>
        ))}
        <line className="tc-dy-grafik-eksen" x1={SOL} x2={EN - 6} y1={BOY - ALT} y2={BOY - ALT} />
        {cubuklar.map((c, i) => {
          const x = SOL + i * adim + (adim - en) / 2;
          const boy = Math.max(1, BOY - ALT - y(c.deger));
          return (
            <g key={`${c.etiket}-${i}`}>
              <title>{`${c.etiket}${c.alt ? ` (${c.alt})` : ''}: ${c.yazi}`}</title>
              <rect className="tc-dy-grafik-cubuk" x={x} y={BOY - ALT - boy} width={en} height={boy} rx={3} />
              {c.deger > 0 && <text className="tc-dy-grafik-deger" x={x + en / 2} y={y(c.deger) - 5} textAnchor="middle">{sayi(c.deger)}</text>}
              <text className="tc-dy-grafik-yazi" x={x + en / 2} y={BOY - ALT + 16} textAnchor="middle">{c.etiket}</text>
              {c.alt && <text className="tc-dy-grafik-yazi" x={x + en / 2} y={BOY - ALT + 30} textAnchor="middle">{c.alt}</text>}
            </g>
          );
        })}
      </svg>
      <details className="tc-dy-grafik-tablo">
        <summary>Tablo olarak göster</summary>
        <table>
          <caption className="tc-dy-gizli">{baslik}</caption>
          <tbody>
            {cubuklar.map((c, i) => <tr key={`${c.etiket}-${i}`}><th scope="row">{c.etiket}{c.alt ? ` (${c.alt})` : ''}</th><td className="mono">{c.yazi}</td></tr>)}
          </tbody>
        </table>
      </details>
    </div>
  );
}

type KararSatiri = RaporCevabi['kararDagilimi'][number];
const YIGIN_SOL = 120;
const YIGIN_SATIR = 26;

function YiginGrafik({ satirlar }: { satirlar: readonly KararSatiri[] }) {
  const dolu = satirlar.filter((s) => s.otomatik + s.onayli + s.mrb > 0);
  if (dolu.length === 0) return <p className="tc-dy-bos">Bu dönemde karar yok.</p>;
  const boy = dolu.length * YIGIN_SATIR + 10;
  return (
    <>
      <ul className="tc-dy-gosterge" aria-hidden="true">
        {KARAR_MODLARI.map((m) => <li key={m}><span className="tc-dy-ornek" data-mod={m} />{KARAR_MODU_ADLARI[m]}</li>)}
      </ul>
      <div className="tc-dy-grafik">
        <svg viewBox={`0 0 ${EN} ${boy}`} role="img" aria-label="Disposition modları">
          {dolu.map((s, i) => {
            const toplam = s.otomatik + s.onayli + s.mrb;
            const ust = i * YIGIN_SATIR + 4;
            let x = YIGIN_SOL;
            return (
              <g key={s.emirNo}>
                <text className="tc-dy-grafik-yazi" x={YIGIN_SOL - 8} y={ust + 14} textAnchor="end">{s.emirNo}</text>
                {KARAR_MODLARI.map((m) => {
                  const w = ((EN - YIGIN_SOL - 10) * s[m]) / toplam;
                  const bas = x;
                  x += w;
                  if (s[m] === 0) return null;
                  return (
                    <g key={m}>
                      <title>{`${s.emirNo}, ${KARAR_MODU_ADLARI[m]}: ${s[m]}`}</title>
                      <rect className="tc-dy-yigin" data-mod={m} x={bas} y={ust} width={Math.max(0, w - 2)} height={18} rx={2} />
                      {w > 22 && <text className="tc-dy-yigin-deger" x={bas + w / 2 - 1} y={ust + 13} textAnchor="middle">{s[m]}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <details className="tc-dy-grafik-tablo">
          <summary>Tablo olarak göster</summary>
          <table>
            <thead><tr><th scope="col">ECO</th>{KARAR_MODLARI.map((m) => <th key={m} scope="col">{KARAR_MODU_ADLARI[m]}</th>)}</tr></thead>
            <tbody>{dolu.map((s) => <tr key={s.emirNo}><th scope="row">{s.emirNo}</th>{KARAR_MODLARI.map((m) => <td key={m} className="mono">{s[m]}</td>)}</tr>)}</tbody>
          </table>
        </details>
      </div>
    </>
  );
}

// ECO numarasının sonu grafikte okunur; tam numara ipucunda ve tabloda.
const kisaNo = (no: string): string => no.slice(-3);

function Govde({ veri }: { veri: RaporCevabi }) {
  const ortalama = ortalamaIsGunu(veri.cevrim);
  const toplamMaliyet = ondalikTopla([veri.hurdaMaliyeti, veri.reworkMaliyeti]);
  const maliyet = veri.maliyetler.flatMap((m) => {
    const t = ondalikTopla([m.hurda, m.rework]);
    return t === null ? [] : [{ etiket: kisaNo(m.emirNo), deger: ondalikSayi(t), yazi: tlMetni(t) }];
  });
  return (
    <>
      <div className="tc-dy-sayilar">
        <SayiKarti baslik="Ortalama ECO çevrim süresi" simge="clock" metin={ortalama === null ? 'Veri yok' : `${sayi(ortalama)} iş günü`} />
        <SayiKarti baslik="Kapanan ECO" simge="check" sayi={veri.cevrim.length} />
        <SayiKarti baslik="Toplam değişiklik maliyeti" simge="lira" metin={toplamMaliyet === null ? 'Veri yok' : tlMetni(toplamMaliyet)} />
        <SayiKarti baslik="Engellenen NC denemesi" simge="lock" sayi={veri.engellenenNcDenemesi} />
      </div>
      <div className="tc-dy-bir-bir">
        <Kart baslik="ECO çevrim süresi (iş günü)" simge="chart">
          <CubukGrafik
            baslik="ECO çevrim süresi"
            cubuklar={veri.cevrim.map((c) => ({ etiket: kisaNo(c.emirNo), deger: c.isGunu, yazi: `${c.isGunu} iş günü`, alt: c.sinif }))}
          />
          <p className="tc-dy-soluk">Hedef: proses ve Class II için 10, Class I için 20 iş günü (müşteri onay süresi hariç).</p>
        </Kart>
        <Kart baslik="Rota revizyonu sayısı, son 180 gün" simge="route">
          {veri.rotaOlgunlugu === null ? <p className="tc-dy-bos">Rota revizyonları bağlı değil.</p> : (
            <CubukGrafik
              baslik="Rota revizyonu"
              cubuklar={veri.rotaOlgunlugu.map((r) => ({ etiket: r.malzeme.kod ?? malzemeEtiketi(r.malzeme), deger: r.rotaRevizyonu, yazi: `${r.rotaRevizyonu} revizyon` }))}
            />
          )}
          <p className="tc-dy-soluk">Sık revizyon alan parça, rotası oturmamış parçadır. Süre düzeltmeleri bu sayıya girmez (planlama parametresi).</p>
        </Kart>
        <Kart baslik="Disposition kararlarının modu" simge="layers">
          <YiginGrafik satirlar={veri.kararDagilimi} />
          <p className="tc-dy-soluk">Otomatik oranının yükselmesi, frozen zone ve kuralların doğru ayarlandığını gösterir.</p>
        </Kart>
        <Kart baslik="Değişiklik kaynaklı hurda ve rework (TL)" simge="lira">
          {veri.hurdaMaliyeti === null && veri.reworkMaliyeti === null && maliyet.length === 0
            ? <p className="tc-dy-bos">Maliyet bağlı değil.</p>
            : <CubukGrafik baslik="Maliyet" cubuklar={maliyet} />}
        </Kart>
      </div>
    </>
  );
}

export function Raporlar() {
  const sorgu = useQuery({ queryKey: analizAnahtarlari.raporlar({}), queryFn: () => api.get<RaporCevabi>(`${KOK}/raporlar`) });
  return (
    <div className="tc-dy">
      <SayfaBasligi baslik="Raporlar" simge="chart" alt="Değişiklik yönetiminin performansı: hız, rota olgunluğu, karar dağılımı ve maliyet. Son 12 ay." />
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Raporlar alınamadı')} yenile={() => { void sorgu.refetch(); }} />
          : <Govde veri={sorgu.data} />}
    </div>
  );
}
