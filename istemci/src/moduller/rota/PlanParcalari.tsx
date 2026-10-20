import type { KeyboardEvent } from 'react';
import type { PlanCevabi, PlanEmri } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { dalla } from './gorunum.ts';
import { DURUM_ADI, GUN_MS, ONCELIK_ADI, emirDurumu, pencereKur, type Pencere } from './planGorunumu.ts';
import './kaynak.css';
import './plan.css';
import './rotalar.css';

// Canlı planın salt okunur sayfalarının (Çizelge, Matris) parçaları. Plan ekranı Reçete ve Rota'dadır (240 a).
const sayi = (n: number, h = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: h });
const kisaTarih = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;

export function Gostergeler({ p }: { p: PlanCevabi }) {
  const g = p.gostergeler;
  return (
    <div className="tc-kpi" aria-label="Plan göstergeleri">
      <div><small>Plandaki emir</small><b>{g.emirSayisi}</b><span>{g.isEmriSayisi} iş emri, {g.yerlesen} yerleşti</span></div>
      <div><small>Zamanında teslim</small><b className={g.geciken > 0 ? 'tc-kpi-kotu' : 'tc-kpi-iyi'}>{g.zamanindaYuzde === null ? '–' : `%${g.zamanindaYuzde}`}</b>
        <span>{g.zamanindaYuzde === null ? 'Teslim tarihli emir yok' : g.geciken > 0 ? `${g.geciken} emir gecikiyor` : 'Hepsi zamanında'}</span></div>
      <div><small>Ort. atölyede kalma</small><b>{g.ortAtolyeGun === null ? '–' : `${sayi(g.ortAtolyeGun)} gün`}</b><span>İlk operasyondan bitişe</span></div>
      <div><small>Darboğaz (davul)</small><b>{g.darbogaz ? g.darbogaz.ad : '–'}</b><span>{g.darbogaz ? `%${g.darbogaz.dolulukYuzde} doluluk, plan boyunca` : 'Yük yok'}</span></div>
      <div><small>En dolu makine / kişi</small><b>{g.enDoluKaynak ? g.enDoluKaynak.ad : '–'}</b><span>{g.enDoluKaynak ? `%${g.enDoluKaynak.dolulukYuzde} doluluk` : 'Yük yok'}</span></div>
      <div><small>Personelin sınırladığı gün</small><b className={(g.personelGun ?? 0) > 0 ? 'tc-kpi-uyari' : ''}>{g.personelGun === null ? '–' : `${g.personelGun} gün`}</b>
        <span>{g.personelGun === null ? 'Kişisi bağlı iş merkezi yok' : 'İş merkezinde boş kişi-saati kalmayan gün'}</span></div>
    </div>
  );
}

// Emir zaman çizelgesi: satır başına bir SVG (koordinat öznitelikleri; satır içi stil yok), emir etiketi HTML ve yatay kaydırmada solda sabit,
// böylece dar ekranda da hangi emrin çubuğuna bakıldığı görünür. Şimdi çizgisi kırmızı, teslim kesikli, sağda tampon.
// `pencere` günlük aralığı belirler (yoksa iki hafta); `sec` verilirse çubuk tıklanır ve klavyeyle açılır.
const ZE_CUBUK = 750;
const ZE_EN = 950;
const ZE_SATIR = 46;
const ZE_EKSEN = 24;
export function ZamanCizelgesi({ p, pencere, emirler: liste, sec, secili }: {
  p: PlanCevabi; pencere?: Pencere; emirler?: readonly PlanEmri[]; sec?: (uretimEmriId: number) => void; secili?: number | null;
}) {
  const w = pencere ?? pencereKur(p, 2, 0);
  const D = w.gun;
  const g = (iso: string) => (Date.parse(iso) - w.baslangic) / GUN_MS;
  const teslimG = (t: string) => (tesisGunBasi(t) + GUN_MS - w.baslangic) / GUN_MS;
  const kaynak = liste ?? p.emirler;
  // Alt parti üst emrin altında dal (kart #262); pencerenin dışında kalan tarihli emir satırı çizilmez.
  const tumu = dalla(kaynak, (e) => e.uretimEmriId, (e) => e.ustEmirId ?? null);
  const emirIsleri = (id: number) => p.yerlesimler.filter((y) => y.uretimEmriId === id);
  // Emrin çubuğu son yerleşen işin bitişinde biter; hiç yerleşen yoksa çubuk yoktur.
  const sonBitis = (e: PlanEmri): string | null => e.bitis ?? emirIsleri(e.uretimEmriId).reduce<string | null>((m, y) => (m === null || y.bitis > m ? y.bitis : m), null);
  const emirler = pencere ? tumu.filter(({ e }) => e.baslangic === null || (g(sonBitis(e) ?? e.baslangic) > 0 && g(e.baslangic) < D)) : tumu;
  const x = (t: number) => (Math.min(Math.max(t, 0), D) / D) * ZE_CUBUK;
  const simdi = g(p.simdi);
  const adim = D <= 7 ? 1 : D <= 14 ? 2 : 4;
  const ac = (id: number) => (sec ? { role: 'button' as const, tabIndex: 0, onClick: () => sec(id), onKeyDown: (o: KeyboardEvent<SVGGElement>) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(id); } } } : {});
  return (
    <div className="tc-panel">
      <h3>Emir zaman çizelgesi</h3>
      {kaynak.length === 0 ? <p className="tc-rota-ipucu">{p.emirler.length === 0 ? 'Planda emir yok. Serbest ve üretimdeki emirlerin iş emirleri burada görünür.' : 'Süzgece uyan emir yok.'}</p> : (
        <div className="tc-kc-kap" role={sec ? 'group' : 'img'} aria-label="Emir zaman çizelgesi">
          <div className="tc-kc-ic tc-ze">
            <div className="tc-kc-satir">
              <div className="tc-kc-etiket" />
              <svg className="tc-kc-iz" viewBox={`0 0 ${ZE_EN} ${ZE_EKSEN}`} aria-hidden="true">
                {simdi >= 0 && simdi <= D && <path className="tc-g-simdi-ok" d={`M${x(simdi) - 6},0 L${x(simdi) + 6},0 L${x(simdi)},8 z`} />}
                {w.gunler.map((t, i) => (i % adim === 0 ? <text key={t} className="tc-g-eksen" x={x(i) + 4} y={ZE_EKSEN - 8}>{kisaTarih(t)}</text> : null))}
              </svg>
            </div>
            {emirler.map(({ e, derinlik }) => {
              const gec = e.tamponGun !== null && e.tamponGun < 0;
              const isleri = emirIsleri(e.uretimEmriId);
              const durum = emirDurumu(e, isleri);
              const onc = e.oncelik ?? 3;
              const bitisIso = sonBitis(e);
              const bas = e.baslangic && bitisIso && !(e.engelli && e.yerlesen === 0) ? g(e.baslangic) : null;
              const bit = bitisIso ? g(bitisIso) : D;
              const gen = bas === null ? 0 : x(bit) - x(bas);
              const ad = `${derinlik > 0 ? 'Alt parti ' : ''}${e.emirNo} ${e.urunKodu}`;
              return (
                <div className="tc-kc-satir" key={e.uretimEmriId}>
                  <div className={`tc-kc-etiket tc-ze-etiket tc-ze-d${Math.min(derinlik, 3)}`} title={ad}>
                    <span className="tc-ze-no"><i className={`tc-g-nokta tc-onc-${onc}`} aria-hidden="true" />{derinlik > 0 ? '↳ ' : ''}{e.emirNo}</span>
                    <small>{e.urunKodu}</small>
                  </div>
                  <svg className="tc-kc-iz" viewBox={`0 0 ${ZE_EN} ${ZE_SATIR}`} role="presentation">
                    <g aria-label={ad} className={secili === e.uretimEmriId ? 'tc-secili' : undefined} {...ac(e.uretimEmriId)}>
                      <title>{`${ad}: ${DURUM_ADI[durum]}`}</title>
                      <rect className="tc-g-iz" x={0} y={6} width={ZE_EN} height={32} rx={4} />
                      {bas !== null && (
                        <>
                          <rect className={`tc-g-cubuk tc-onc-${onc} tc-g-durum-${durum}`} x={x(bas)} y={10} width={Math.max(4, gen)} height={24} rx={3} />
                          <text className={gen < 110 ? 'tc-g-etiket-dis' : 'tc-g-etiket'} x={gen < 110 ? x(bit) + 6 : x(bas) + 8} y={27}>{ONCELIK_ADI[onc] ?? 'Normal'}, {e.yerlesen}/{e.isSayisi}</text>
                        </>
                      )}
                      {e.teslim !== null && teslimG(e.teslim) >= 0 && teslimG(e.teslim) <= D && <line className="tc-g-teslim" x1={x(teslimG(e.teslim))} x2={x(teslimG(e.teslim))} y1={2} y2={42} />}
                      <text className={`tc-g-tampon${gec || e.engelli ? ' tc-g-gec' : durum === 'uyari' ? ' tc-g-uyari' : ''}`} x={ZE_EN - 4} y={27} textAnchor="end">
                        {e.engelli ? (e.yerlesen > 0 ? `Kısmen yerleşti ${e.yerlesen}/${e.isSayisi}` : 'Yerleşemedi') : e.tamponGun === null ? 'Teslim yok' : gec ? `Gecikme ${sayi(-e.tamponGun)} g` : durum === 'uyari' ? `Uyarılı iş var, tampon +${sayi(e.tamponGun)} g` : `Tampon yeterli, +${sayi(e.tamponGun)} g`}
                      </text>
                    </g>
                    {simdi >= 0 && simdi <= D && <line className="tc-g-simdi" x1={x(simdi)} x2={x(simdi)} y1={0} y2={ZE_SATIR} />}
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pencere && kaynak.length > 0 && tumu.length > emirler.length && <p className="tc-rota-ipucu">Bu aralığın dışında kalan {tumu.length - emirler.length} emir çizilmedi; aralığı gezdirerek görebilirsin.</p>}
    </div>
  );
}
