import { useEffect, useRef } from 'react';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { nabizFarki, type NabizGostergesi } from '../kurallar.ts';
import { MOTOR_NOTU, YOK_NOTU } from '../ortak.tsx';
import { egriNoktalari, NABIZ_GOSTERGELERI, nabizDegeri, type NabizDurumu } from './nabiz.ts';

// Plan çubuğu (zk-kabuk.betik sdCubuk, zr-agirlik sdNabiz): ekranlar, üç nabız sayısı, durum ve iki eylem. Arama (Ctrl K paleti) ve
// kullanıcı menüsü eski çerçevenindir (208 a). Nabız sayısı plan nabzını açar.
interface Ozellikler {
  plan: boolean; guncel: boolean; planYaz: boolean;
  nabiz: NabizDurumu | null; nabizAcik: boolean; nabizAc: (ac: boolean) => void;
  studyo: () => void; ozeteGit: () => void;
  refSec: ((v: 'onceki' | 'sabit') => void) | null; sabitle: (() => void) | null; sabitAd: string | null;
}

const KISA: [NabizGostergesi, string, boolean][] = [['late', '', false], ['wT', 'gecikme', true], ['dar', 'darboğaz', true]];

export function Cubuk(o: Ozellikler) {
  const n = o.nabiz;
  return (
    <div className="tc-pym-sb-kap">
      <div className="tc-pym-sb" role="toolbar" aria-label="Plan çubuğu">
        <nav className="tc-pym-sb-ekran" aria-label="Ekranlar">
          <button type="button" aria-current="page"><Simge ad="gantt" boyut="k" /><span>Plan</span></button>
          <button type="button" onClick={o.studyo} title="Planlama stüdyosu"><Simge ad="layers" boyut="k" /><span>Stüdyo</span></button>
          <button type="button" aria-disabled="true" title={`Veri: ${YOK_NOTU}`}><Simge ad="layers" boyut="k" /><span>Veri</span></button>
          <button type="button" aria-disabled="true" title={`Geçmiş: ${YOK_NOTU}`}><Simge ad="book" boyut="k" /><span>Geçmiş</span></button>
        </nav>
        {n && (
          <div className="tc-pym-sb-nb" role="group" aria-label={`Plan nabzı, ${n.donemYazi}`}>
            {KISA.map(([id, ad, ikincil]) => {
              const v = n.cur[id]; const g = NABIZ_GOSTERGELERI.find((x) => x.id === id);
              const f = n.kar && g ? nabizFarki(id, v, n.kar[id], g.kucukIyi) : { ton: '' as const, m: '' };
              const etiket = id === 'late' ? `geciken · ${n.etiket}` : ad;
              const d = id === 'late' ? (v == null ? '—' : String(v)) : nabizDegeri(id, v);
              return (
                <button key={id} type="button" className="tc-pym-sb-nb-k" data-ikincil={ikincil || undefined} data-ton={f.ton || undefined} aria-expanded={o.nabizAcik}
                  title={`${etiket}: ${n.ref.ad} referansına göre ${f.m || 'aynı'}. Ölçülen dönem: ${n.donemYazi}. Plan nabzını aç.`} onClick={() => o.nabizAc(!o.nabizAcik)}>
                  <b className="tc-pym-mono">{d}</b><span>{etiket}</span>{f.ton && <small>{f.ton === 'iyi' ? '▼' : '▲'}</small>}
                </button>
              );
            })}
          </div>
        )}
        <span className="tc-pym-sb-sag">
          {!o.plan ? <Rozet ton="pasif">Plan yok</Rozet> : o.guncel ? <Rozet ton="tamam">Güncel</Rozet> : <Rozet ton="uyari">Veri değişti</Rozet>}
          {o.planYaz && o.plan && (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-sb-iyi" data-olay="" aria-disabled="true" title={`Olay ekle: acil sipariş, arıza, malzeme gecikmesi. ${MOTOR_NOTU}`} aria-label="Olay ekle">
              <Simge ad="alert" boyut="k" /><span>Olay ekle</span>
            </button>
          )}
          {o.planYaz && (
            <button type="button" className={`tc-dugme tc-pym-kucuk tc-pym-sb-iyi${o.plan && o.guncel ? '' : ' tc-dugme-birincil'}`} aria-disabled="true"
              title={`${o.plan ? 'Planı iyileştir' : 'Planı kur'}. ${MOTOR_NOTU}`} aria-label={o.plan ? 'Planı iyileştir' : 'Planı kur'}>
              <Simge ad="play" boyut="k" /><span>{o.plan ? 'Planı iyileştir' : 'Planı kur'}</span>
            </button>
          )}
        </span>
      </div>
      {n && o.nabizAcik && <NabizPaneli {...o} n={n} />}
    </div>
  );
}

function NabizPaneli(o: Ozellikler & { n: NabizDurumu }) {
  const { n } = o; const kok = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') o.nabizAc(false); };
    const dokun = (e: PointerEvent) => { const h = e.target as Element | null; if (!kok.current?.contains(h) && !h?.closest?.('.tc-pym-sb-nb-k')) o.nabizAc(false); };
    document.addEventListener('keydown', tus); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus); document.removeEventListener('pointerdown', dokun, true); };
  }, [o]);
  return (
    <div className="tc-pym-sk-nb" ref={kok}>
      <section className="tc-pym-nb" aria-label="Plan nabzı">
        <div className="tc-pym-nb-bas">
          <button type="button" className="tc-pym-nb-baslik" aria-expanded="true" title="Kapat (Esc)" onClick={() => o.nabizAc(false)}>
            <Simge ad="down" boyut="k" /><b>Plan nabzı</b> <small className="tc-pym-mono">{n.donemYazi}</small>
          </button>
          <span className="tc-pym-nb-ozet" data-ton={n.ozet.ton || undefined}>{n.ozet.metin}</span>
          <span className="tc-pym-nb-ref">
            <span className="tc-pym-nb-ref-ad" title={n.ref.ad}>{n.surum} sürüm · {n.ref.ad}</span>
            <select className="tc-alan-kutu" aria-label="Referans" value={n.ref.tur} disabled={!o.refSec} onChange={(e) => o.refSec?.(e.target.value === 'sabit' ? 'sabit' : 'onceki')}>
              <option value="canli" disabled>Canlı plan</option>
              <option value="onceki">Önceki sürüm</option>
              <option value="sabit" disabled={!o.sabitAd}>{o.sabitAd ? `Sabit: ${o.sabitAd}` : 'Sabitlenen yok'}</option>
            </select>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" disabled={!o.sabitle} onClick={() => o.sabitle?.()} title="Şu anki planı referans al" aria-label="Şu anki planı referans al">
              <Simge ad="flag" boyut="k" />
            </button>
          </span>
        </div>
        <div className="tc-pym-nb-l">
          {NABIZ_GOSTERGELERI.map((g) => {
            const v = n.cur[g.id]; const f = n.kar ? nabizFarki(g.id, v, n.kar[g.id], g.kucukIyi) : { ton: '' as const, m: '' };
            const egri = n.egri[g.id]; const e = egri ? egriNoktalari(egri) : null;
            const ici = (
              <>
                <span className="tc-pym-nb-ad"><Simge ad={g.simge} boyut="k" />{g.ad}</span>
                <b className="tc-pym-nb-d tc-pym-mono">{nabizDegeri(g.id, v)}</b>
                {e && <svg className="tc-pym-nb-egri" viewBox="0 0 64 18" aria-hidden="true"><polyline points={e.noktalar} /><circle cx="64" cy={e.son} r="2.2" /></svg>}
                <small className="tc-pym-nb-f">{n.kar ? <><b>{f.m}</b> <span>referansa göre</span></> : <span>referans yok</span>}</small>
              </>
            );
            // Gecikme tahtanın kendisine götürür; ötekilerin sayfası yeni ekranda yok (459/5 a).
            return g.sayfa === 'tahta'
              ? <button key={g.id} type="button" className="tc-pym-nb-k" data-ton={f.ton || undefined} title={`${g.ad}: ${g.ipucu} Dokununca ilgili sayfa açılır.`} onClick={() => { o.nabizAc(false); o.ozeteGit(); }}>{ici}</button>
              : <button key={g.id} type="button" className="tc-pym-nb-k" aria-disabled="true" data-ton={f.ton || undefined} title={`${g.ad}: ${g.ipucu} ${YOK_NOTU}`}>{ici}</button>;
          })}
        </div>
      </section>
    </div>
  );
}
