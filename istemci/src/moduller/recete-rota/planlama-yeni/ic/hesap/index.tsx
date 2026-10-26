import { lazy, Suspense, useState } from 'react';
import { DurumKutusu, Rozet, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { sayiYaz, saatYazi } from '../../motor/kurallar.ts';
import { degisken, MOTOR_NOTU } from '../../motor/ortak.tsx';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { KucukDugme, Serit, VeriKarti } from '../veri/ortak.tsx';
import '../veri/veri.css';
import {
  alanYaz, EKIP_DURUM, EKIP_TON, KARAR_DURUM, KARAR_ROL, KARAR_SIMGE, SURELER, ekipAyari, ekipSonOku, ekipSuresi, farkYazisi, hariclar, kararAdi, kararDegeri,
  kararSirasi, mesaiButcesi, oran, selale, siparisEtkisi, yakinsama, zamanYazi, zincir, type EkipSonu,
} from './kurallar.ts';
import './hesap.css';

// "Nasıl hesaplandı" (bugünkü sayfa i-studyo.betik sStudyo; Başka menüsünün Sayfalar'ından açılır): karar masası, son sonuç, ekip adımları ve
// son ekip çözümünün grafikleri. Ekip çözümü ve kararın tek başına önizlenmesi motor ister (357 b), pasiftir; ayarlar çalışmaya komutla yazılır.

type Sekme = 'karar' | 'ag';
// Akış ağı (3B, tuval) yalnız sekmesi açılınca yüklenir.
const AkisAgi = lazy(async () => ({ default: (await import('../ag/index.tsx')).AkisAgi }));
const yuzde = (x: number) => `${(x * 100).toFixed(2)}%`;

function Fark({ yeni, eski, basamak = 1 }: { yeni: number | null; eski: number | null; basamak?: number }) {
  const f = farkYazisi(yeni, eski, basamak);
  return f ? <span className="tc-pyh-fark" data-iyi={f.iyi}>{f.m}</span> : <span className="tc-pyh-k">aynı</span>;
}

export function NasilHesaplandi(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const [sekme, setSekme] = useState<Sekme>('karar');
  if (!c) {
    return (
      <div className="tc-pyi" data-parca="hesap">
        <div className="tc-pyi-bos"><Simge ad="chart" /><strong>Planlama çalışması yok</strong><span>Çalışma kaydı açılınca çözümün nasıl hesaplandığı burada görünür.</span></div>
      </div>
    );
  }
  const son = ekipSonOku(c);
  const yaz = o.komut !== null && o.yetki.planYaz;
  const isGoster = (j: string) => { o.sec({ siparis: j, adim: null, tezgah: null }); o.git('plan'); };
  return (
    <div className="tc-pyi" data-parca="hesap">
      <div className="tc-pyh-ust">
        <VeriKarti baslik="Karar masası" simge="gauge"><KararMasasi o={o} c={c} son={son} yaz={yaz} /></VeriKarti>
        <VeriKarti baslik="Sonuç" simge="flag"><Sonuc c={c} son={son} /></VeriKarti>
      </div>
      <div className="tc-pyi-seg" role="tablist" aria-label="Stüdyo görünümü">
        {([['karar', 'Kararlar ve grafikler', 'chart'], ['ag', 'Akış ağı (3B)', 'cube']] as const).map(([id, ad, s]) => (
          <button key={id} type="button" role="tab" aria-selected={sekme === id} aria-pressed={sekme === id} onClick={() => setSekme(id)}><Simge ad={s} boyut="k" />{ad}</button>
        ))}
      </div>
      {sekme === 'ag' ? (
        <Suspense fallback={<DurumKutusu durum="yukleniyor" />}><AkisAgi o={o} c={c} /></Suspense>
      ) : (
        <>
          <VeriKarti baslik="Ekip adımları" simge="list" ek={son ? `${zamanYazi(son.zaman)} · ${sayiYaz(son.ms / 1000, 1)} sn` : undefined}><Zincir son={son} /></VeriKarti>
          {son && (
            <>
              <div className="tc-pyi-iki tc-pyi-iki-esit">
                <VeriKarti baslik="Kim ne kattı" simge="chart" ek="ağırlıklı gecikme, saat"><Selale son={son} /></VeriKarti>
                <VeriKarti baslik="Çözüm nasıl ilerledi" simge="gauge" ek="ağırlıklı gecikme, saat"><Yakinsama son={son} /></VeriKarti>
              </div>
              <div className="tc-pyi-iki tc-pyi-iki-esit">
                <VeriKarti baslik={`Değerlendirilen kararlar (${son.kararlar.length})`} simge="flag"><Kararlar o={o} c={c} son={son} yaz={yaz} /></VeriKarti>
                <VeriKarti baslik="Siparişlere etkisi" simge="list"><SiparisEtkisi son={son} sec={isGoster} /></VeriKarti>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function KararMasasi({ o, c, son, yaz }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; son: EkipSonu | null; yaz: boolean }) {
  const ayar = ekipAyari(c); const haric = hariclar(c); const sure = ekipSuresi(c);
  const [butce, setButce] = useState<string | null>(null);
  const { bildir } = useBildirim();
  const anahtar = (id: 'mesai' | 'sinir', ad: string, alt: string) => (
    <label className="tc-pyh-rol tc-pyi-anahtar" title={alt}>
      <input type="checkbox" role="switch" checked={ayar[id]} disabled={!yaz} onChange={(e) => {
        const ac = e.target.checked;
        o.komut?.degistir('Ekip ayarı', (t) => { alanYaz(t, 'ekipAyar', { ...(typeof t.ekipAyar === 'object' && t.ekipAyar ? t.ekipAyar : {}), [id]: ac }); }, { ayrinti: `${id}: ${ac ? 'açık' : 'kapalı'}`, planKoru: true });
      }} /><i aria-hidden="true" /><span><b>{ad}</b><small>{alt}</small></span>
    </label>
  );
  const butceYaz = () => {
    if (butce === null) return;
    const v = Number(butce); setButce(null);
    if (butce.trim() === '' || !Number.isFinite(v) || v < 0 || v > 60) { bildir('hata', 'Değer 0 ile 60 arasında olmalı.'); return; }
    if (v === mesaiButcesi(c)) return;
    o.komut?.degistir('Parametre değişti', (t) => { alanYaz(t.param, 'mesaiHafta', v); }, { ayrinti: `Haftalık mesai bütçesi: ${String(c.param.mesaiHafta ?? '—')} → ${String(v)}` });
  };
  return (
    <div className="tc-pyh-masa">
      <div className="tc-pyh-ekip" role="group" aria-label="Ekibe katılan çözücüler">
        <div className="tc-pyh-rol" data-tur="motor"><Simge ad="cpu" boyut="k" /><span><b>Motor</b><small>Her zaman: kurar ve hakemdir</small></span></div>
        {anahtar('mesai', 'HiGHS · ek mesai', 'Vardiya adayı önerir')}{anahtar('sinir', 'HiGHS · alt sınır', 'Planın en iyiye uzaklığını ölçer')}
      </div>
      <Serit simge="cpu">Ekip çözümü yeni ekranda koşmaz: plan sunucudaki motorla kurulur (Planı kur). Burada son ekip çözümünün kaydı görünür.</Serit>
      <div className="tc-pyh-param">
        <label className="tc-alan">
          <span className="tc-alan-etiket">Haftalık mesai bütçesi (sa)</span>
          <input className="tc-alan-kutu" type="number" min={0} max={60} step={1} disabled={!yaz} value={butce ?? String(mesaiButcesi(c))}
            onChange={(e) => setButce(e.target.value)} onBlur={butceYaz} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <label className="tc-alan">
          <span className="tc-alan-etiket">Süre</span>
          <select className="tc-alan-kutu" disabled={!yaz} value={sure != null && (SURELER as readonly number[]).includes(sure) ? String(sure) : ''}
            onChange={(e) => { const v = Number(e.target.value); o.komut?.degistir('Çözüm süresi', (t) => { t.w.sure = v; }, { planKoru: true, sessiz: true }); }}>
            {sure == null || !(SURELER as readonly number[]).includes(sure) ? <option value="" disabled>—</option> : null}
            {SURELER.map((s) => <option key={s} value={s}>{`${s} sn`}</option>)}
          </select>
        </label>
        {o.yetki.planYaz && (
          <button type="button" className="tc-dugme tc-dugme-birincil tc-pyh-coz" aria-disabled="true" title={`Ekip olarak çöz: ${MOTOR_NOTU}`}><Simge ad="play" boyut="k" />Ekip olarak çöz</button>
        )}
      </div>
      {haric.length > 0 && (
        <div className="tc-pyh-haric">
          <span className="tc-pyh-k">Hariç tutulan kararlar:</span>
          {haric.map((id) => (
            <button key={id} type="button" className="tc-pyh-fis" disabled={!yaz} title="Yeniden dahil et"
              onClick={() => { o.komut?.degistir('Karar yeniden dahil edildi', (t) => { alanYaz(t, 'ekipHaric', hariclar(t).filter((x) => x !== id)); }, { ayrinti: id, planKoru: true }); }}>
              {kararAdi(son, id)}<Simge ad="x" boyut="k" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sonuc({ c, son }: { c: PlanlamaCalismasi; son: EkipSonu | null }) {
  if (!son) {
    return (
      <div className="tc-pyh-sonuc" data-ton="bilgi">
        <div className="tc-pyh-sonuc-bas"><Simge ad="cpu" boyut="k" /><b>Henüz ekip çalışmadı</b></div>
        <p className="tc-pyh-k">"Ekip olarak çöz" ile motor ve HiGHS sırayla çalışır; her kararın etkisi burada grafikle görünür. Sonuç önizlenir, siz uygularsınız.</p>
      </div>
    );
  }
  const pl = c.plan as { kaynak?: unknown; ozet?: { wT?: unknown } } | null;
  const uyg = pl?.kaynak === 'ekip' && typeof pl.ozet?.wT === 'number' && Math.abs(pl.ozet.wT - son.wT) < 0.05;
  return (
    <div className="tc-pyh-sonuc" data-ton={son.gecti ? 'tamam' : 'hata'}>
      <div className="tc-pyh-sonuc-bas">
        <Simge ad={son.gecti ? 'check' : 'alert'} boyut="k" /><b>{son.gecti ? (uyg ? 'Ekip sonucu planda' : 'Son ekip sonucu') : 'Kontrolden geçmedi; mevcut plan kaldı'}</b>
        <span className="tc-pyh-k">{`${zamanYazi(son.zaman)} · ${sayiYaz(son.ms / 1000, 1)} sn`}</span>
      </div>
      <div className="tc-pyh-satir"><span>Ağırlıklı gecikme (sa)</span><b className="tc-pyh-mono">{sayiYaz(son.bas, 1)}</b><Simge ad="next" boyut="k" /><b className="tc-pyh-mono">{sayiYaz(son.wT, 1)}</b><Fark yeni={son.wT} eski={son.bas} /></div>
      <div className="tc-pyh-satir"><span>Alt sınır (sa)</span><b className="tc-pyh-mono">{sayiYaz(son.lb, 1)}</b><span className="tc-pyh-k">{`plan en çok ${saatYazi(Math.max(0, son.wT - son.lb))} uzakta`}</span></div>
    </div>
  );
}

function Zincir({ son }: { son: EkipSonu | null }) {
  return (
    <ol className="tc-pyh-zincir" aria-label="Ekip adımları">
      {zincir(son).map((a, i) => (
        <li key={a.id} className="tc-pyh-zincir-adim" data-durum={a.durum}>
          <span className="tc-pyh-zincir-no tc-pyh-mono">{i + 1}</span>
          <span className="tc-pyh-zincir-metin"><b>{a.rol}</b><small>{a.is}</small>{a.fark !== null && <em className="tc-pyh-mono">{`${a.fark > 0 ? '−' : '+'}${sayiYaz(Math.abs(a.fark), 1)} sa`}</em>}</span>
          <Rozet ton={EKIP_TON[a.durum] ?? 'pasif'}>{EKIP_DURUM[a.durum] ?? a.durum}</Rozet>
        </li>
      ))}
    </ol>
  );
}

function Selale({ son }: { son: EkipSonu }) {
  const { kol, max } = selale(son);
  const ozet = kol.map((k) => `${k.ad}: ${k.deger}`).join(', ');
  return (
    <div className="tc-pyh-selale" role="img" aria-label={`Kim ne kattı, ağırlıklı gecikme saat: ${ozet}; alt sınır ${sayiYaz(son.lb, 1)}`}>
      <div className="tc-pyh-selale-alan">
        <div className="tc-pyh-selale-lb" ref={degisken({ '--y': yuzde(oran(son.lb, max)) })}><span>{`Alt sınır ${sayiYaz(son.lb, 1)} sa`}</span></div>
        {kol.map((k, i) => (
          <div key={i} className="tc-pyh-selale-kol" title={`${k.ad}: ${k.tur === 'toplam' ? `${k.deger} sa` : `${k.deger} sa değişim`}`}>
            <div className="tc-pyh-selale-cubuk" data-tur={k.tur} ref={degisken({ '--alt': yuzde(oran(k.alt, max)), '--ust': yuzde(oran(k.ust, max)) })} />
            <span className="tc-pyh-selale-deger tc-pyh-mono" ref={degisken({ '--ust': yuzde(oran(k.ust, max)) })}>{k.deger}</span>
          </div>
        ))}
      </div>
      <div className="tc-pyh-selale-etiket">{kol.map((k, i) => <span key={i}>{k.ad}</span>)}</div>
      <div className="tc-pyh-lejant"><span><i data-tur="toplam" />Ağırlıklı gecikme</span><span><i data-tur="azal" />Azaltan karar</span><span><i data-tur="art" />Artıran karar</span><span><i data-tur="lb" />Alt sınır</span></div>
    </div>
  );
}

function Yakinsama({ son }: { son: EkipSonu }) {
  const y = yakinsama(son);
  if (!y) return <p className="tc-pyh-k">İz yok.</p>;
  return (
    <div className="tc-pyh-yak" role="img" aria-label={`Çalışma boyunca ağırlıklı gecikme: ${sayiYaz(y.bas, 1)} saatten ${sayiYaz(y.bit, 1)} saate, ${sayiYaz(y.T, 1)} saniyede`}>
      <div className="tc-pyh-yak-alan">
        {y.y.map((e, i) => <span key={i} className="tc-pyh-yak-y" ref={degisken({ '--y': yuzde(e.y) })}>{e.v}</span>)}
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
          {[0, 1, 2].map((i) => <line key={i} x1="0" x2="600" y1={5 + i * 95} y2={5 + i * 95} className="tc-pyh-yak-izgara" />)}
          {y.lb !== null && <line x1="0" x2="600" y1={y.lb.toFixed(1)} y2={y.lb.toFixed(1)} className="tc-pyh-yak-lb" />}
          {y.sinirlar.map((s, i) => <line key={i} x1={s.x.toFixed(1)} x2={s.x.toFixed(1)} y1="0" y2="200" className="tc-pyh-yak-adim" />)}
          <path d={y.yol} className="tc-pyh-yak-cizgi" />
          {y.dilimler.map((d, i) => <rect key={i} x={d.x.toFixed(1)} y="0" width={d.w.toFixed(1)} height="200" className="tc-pyh-yak-hit"><title>{d.ipucu}</title></rect>)}
        </svg>
        {y.sinirlar.map((s, i) => <span key={i} className="tc-pyh-yak-ad" data-sag={s.x > 540 || undefined} ref={degisken({ '--x': yuzde(s.x / 600) })}>{s.ad}</span>)}
        {y.lb !== null && <span className="tc-pyh-yak-lbad" ref={degisken({ '--y': yuzde(y.lb / 200) })}>{`Alt sınır ${sayiYaz(son.lb, 1)}`}</span>}
      </div>
      <div className="tc-pyh-yak-x tc-pyh-mono"><span>0 sn</span><span>{`${sayiYaz(y.T / 2, 1)} sn`}</span><span>{`${sayiYaz(y.T, 1)} sn`}</span></div>
    </div>
  );
}

function Kararlar({ o, c, son, yaz }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; son: EkipSonu; yaz: boolean }) {
  const haric = new Set(hariclar(c));
  const degis = (id: string) => {
    const var_ = haric.has(id);
    o.komut?.degistir(var_ ? 'Karar yeniden dahil edildi' : 'Karar hariç tutuldu', (t) => {
      const h = new Set(hariclar(t)); if (var_) h.delete(id); else h.add(id); alanYaz(t, 'ekipHaric', [...h]);
    }, { ayrinti: id, planKoru: true });
  };
  return (
    <>
      <ul className="tc-pyh-kararlar">
        {kararSirasi(son).map(({ k, w }) => {
          const [durumAd, ton] = KARAR_DURUM[k.durum];
          const d = k.dW;
          return (
            <li key={k.id} className="tc-pyh-karar" data-durum={k.durum}>
              <span className="tc-pyh-karar-ad"><Simge ad={KARAR_SIMGE[k.tur] ?? 'cpu'} boyut="k" /><span><b>{k.ad}</b><small>{`${KARAR_ROL[k.tur] ?? ''} · ${k.neden}`}</small></span></span>
              <Rozet ton={ton}>{durumAd}</Rozet>
              <span className="tc-pyh-karar-olcu" title={d == null ? k.neden : `Motorun ölçüsü: gecikme ${d >= 0 ? 'azalır' : 'artar'} ${sayiYaz(Math.abs(d), 1)} sa`}>
                {d == null ? <span className="tc-pyh-k">ölçülmedi</span> : (
                  <>
                    <span className="tc-pyh-karar-yol"><i className="tc-pyh-karar-orta" /><i className="tc-pyh-karar-cubuk" data-yon={d >= 0 ? 'iyi' : 'kotu'} data-alindi={k.durum === 'alindi'} ref={degisken({ '--w': yuzde(w) })} /></span>
                    <b className="tc-pyh-mono tc-pyh-karar-deger">{kararDegeri(d)}</b>
                  </>
                )}
              </span>
              {k.tur !== 'motor' && yaz && (
                <span className="tc-pyi-dugmeler">
                  {(k.tur === 'mesai' || (k.tur === 'cpsat' && k.durum !== 'yok')) && (
                    <button type="button" className="tc-dugme tc-pyi-kucuk tc-pyi-hayalet" aria-disabled="true" aria-label="Bu kararı tek başına önizle" title={`Bu kararı tek başına önizle: ${MOTOR_NOTU}`}><Simge ad="eye" boyut="k" /></button>
                  )}
                  <KucukDugme ad={haric.has(k.id) ? 'Yeniden dahil et' : 'Sonraki çözümlerde hariç tut'} simge={haric.has(k.id) ? 'plus' : 'x'} yap={() => degis(k.id)} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="tc-pyh-lejant"><span><i data-tur="azal" />Alınan kararın kazancı</span><span><i data-tur="aday" />Alınmayan adayın ölçüsü</span><span><i data-tur="art" />Gecikmeyi artıran</span></div>
    </>
  );
}

function SiparisEtkisi({ son, sec }: { son: EkipSonu; sec: (j: string) => void }) {
  const { l, max } = siparisEtkisi(son);
  if (!l.length) return <p className="tc-pyi-alt">Geciken sipariş yok.</p>;
  return (
    <>
      <ul className="tc-pyh-dambil" aria-label="Sipariş gecikmesi önce ve sonra">
        {l.map((x) => {
          const lo = Math.min(x.a, x.b), hi = Math.max(x.a, x.b);
          return (
            <li key={x.j} title={`${x.j}: ${sayiYaz(x.a, 1)} → ${sayiYaz(x.b, 1)} sa`}>
              <button type="button" className="tc-pyh-dambil-ad tc-pyh-mono" onClick={() => sec(x.j)}>{x.j}</button>
              <span className="tc-pyh-dambil-yol">
                <i className="tc-pyh-dambil-bag" ref={degisken({ '--a': yuzde(oran(lo, max)), '--b': yuzde(oran(hi, max)) })} />
                <i className="tc-pyh-dambil-once" ref={degisken({ '--x': yuzde(oran(x.a, max)) })} />
                <i className="tc-pyh-dambil-sonra" ref={degisken({ '--x': yuzde(oran(x.b, max)) })} />
              </span>
              <span className="tc-pyh-mono tc-pyh-dambil-deger">{`${sayiYaz(x.a, 1)} → `}<b>{sayiYaz(x.b, 1)}</b> <Fark yeni={x.b} eski={x.a} /></span>
            </li>
          );
        })}
      </ul>
      <div className="tc-pyh-lejant"><span><i data-tur="once" />Önce</span><span><i data-tur="sonra" />Ekip sonrası</span><span className="tc-pyh-k">En çok geciken 14 sipariş; saat.</span></div>
    </>
  );
}
