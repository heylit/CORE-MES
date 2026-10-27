import { useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, OnayPenceresi, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { SIMGELER, type SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { D, fmtN, invKey, num, pad2, state, wearRec } from './cekirdek.ts';
import { Baslik, Not, Uyari } from './parcalar.tsx';
import type { CarkSatiri } from './takip.ts';
import type { CarkKarti, OmurKarti, Takim } from './tipler.ts';
import { rnCaps, rnFactor, rnInsItem, rnState, rnTamamla, yeniTakim, yenile, type YenilemeEylemi } from './yenileme.ts';

interface Ozellikler {
  d: CarkSatiri | undefined;
  c: CarkKarti | null;
  takimDegistirebilir: boolean;
  kartSec: (k: number) => void;
  degisti: () => void;
}

function Cip({ simge, lbl, v }: { simge: SimgeAdi; lbl: string; v: string | null }) {
  return <span className={v ? 'tc-co-on' : 'tc-co-off'}><span><Simge ad={simge} boyut="k" /> {lbl}</span><em>{v || 'yok'}</em></span>;
}

function Olanaklar({ t }: { t: Takim }) {
  const caps = rnCaps(t);
  return (
    <>
      <div className="tc-co-olanak">
        <Cip simge="rotate" lbl="Çevirme" v={caps.index ? caps.index + ' kenar' : null} />
        <Cip simge="gear" lbl="Bileme" v={caps.regrind ? caps.regrind + ' kez' : null} />
        <Cip simge="edit" lbl="Düzeltme" v={caps.dress && caps.kind !== 'index' ? 'olur' : null} />
      </div>
      <Not>{caps.why}</Not>
    </>
  );
}

// Uç kenarları: kullanılmış, şu anki (aşınma payı koyu) ve yeni kenarlar.
function Kenarlar({ n, cur, wear }: { n: number; cur: number; wear: number }) {
  const W = 300, H = 74, step = Math.min(44, (W - 20) / n), w = Math.min(1, wear);
  return (
    <>
      <svg className="tc-co-kenarlar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kenar ${cur} / ${n}`}>
        {Array.from({ length: n }, (_, k) => {
          const i = k + 1, x = 10 + (i - 0.5) * step;
          const sinif = i < cur ? 'tc-co-kenar-bitti' : i === cur ? (wear > 0.8 ? 'tc-co-kenar-over' : wear > 0.5 ? 'tc-co-kenar-warn' : 'tc-co-kenar-ok') : 'tc-co-kenar-yeni';
          return (
            <g key={i}>
              <rect className={sinif} x={x - step * 0.38} y="12" width={step * 0.76} height="36" rx="5" />
              {i === cur && <rect className="tc-co-kenar-asinma" x={x - step * 0.38} y={12 + 36 * (1 - w)} width={step * 0.76} height={36 * w} rx="5" />}
              {i < cur
                ? <path className="tc-co-kenar-tik" d={SIMGELER.check} transform={`translate(${x - 6} 55) scale(0.5)`} />
                : <text className="tc-co-kenar-no" x={x} y="66" textAnchor="middle">{i}</text>}
            </g>
          );
        })}
      </svg>
      <div className="tc-co-lejant">
        <span><i className="tc-co-kenar-bitti" />kullanıldı</span><span><i className="tc-co-kenar-ok" />şu anki kenar</span><span><i className="tc-co-kenar-yeni" />yeni</span>
      </div>
    </>
  );
}

// Ömür yenileme paneli (prototipin rnRender'ı): uçlu takımlar çevrilir, karbür / HSS takımlar bilenir, kenarı hafif kırılan
// takım düzeltilir. Kayıt tezgâhtaki cebin aşınma kaydıdır; değişim ve düzeltme olayları çekirdekte durum farkından türetilir.
export function YenilemePaneli({ d, c, takimDegistirebilir, kartSec, degisti }: Ozellikler) {
  const [ucDus, ucDusYaz] = useState(true);
  const [kaplandi, kaplandiYaz] = useState(false);
  const [geriOran, geriOranYaz] = useState('0.5');
  const [yeniOnay, yeniOnayYaz] = useState(false);
  const ipucu = (
    <div className="tc-co-ipucu">
      <b>Ömür yenileme</b> · uçlu takımlar <u>çevrilir</u> (kenar sayısı uç kodundan), karbür / HSS takımlar <u>bilenir</u> (bileme hakkı takım
      tipinden), kenarı hafif kırılan takım <u>düzeltilir</u>. Çarktan takım seçin.
    </div>
  );
  if (!c || c.depot || !d || d.depot) {
    return (
      <div className="tc-co-panel">
        {ipucu}
        {c?.t && <><div className="tc-co-sonuc"><small>Depo</small><b>{c.t.name}</b><span>{c.t.code || ''}</span></div><Olanaklar t={c.t} /></>}
        <Not>Kullanım takibi tezgâhtaki takımlar için tutulur — çarkta bir tezgâh satırına geçin.</Not>
      </div>
    );
  }
  const t = c.t, r = rnTamamla(wearRec(c.m.id, c.p, t.id)), caps = rnCaps(t);
  const TRn = c.M.err === undefined ? c.M.TR : null, TR = TRn ? TRn * (r.lf || 1) : null, rem = TR != null ? Math.max(0, TR - r.used) : null;
  const uygula = (e: YenilemeEylemi, ek?: () => void): void => { if (yenile(t, r, e, Date.now())) { ek?.(); degisti(); } };
  const regrindAlanlari = (): { cap: number; boy: number } => {
    const capEl = document.getElementById(`tc-co-rn-cap-${c.m.id}-${c.p}`) as HTMLInputElement | null;
    const boyEl = document.getElementById(`tc-co-rn-boy-${c.m.id}-${c.p}`) as HTMLInputElement | null;
    return { cap: num(capEl?.value, (t.d || 0) - (r.dd || 0)), boy: Math.max(0, num(boyEl?.value, caps.dL ?? 0)) };
  };
  return (
    <div className="tc-co-panel">
      {ipucu}
      <div className="tc-co-sonuc"><small>{d.title} · T{pad2(c.p + 1)}</small><b>{t.name}</b><span>{t.code || ''}</span></div>
      <Olanaklar t={t} />
      <div className="tc-co-hucre tc-co-hucre-3">
        <div><small>Kalan ömür</small><b className={rem != null && rem <= 0 ? 'tc-co-kisa' : undefined}>{rem != null ? fmtN(rem, 0) : '—'}</b><i>{TR ? 'dk / ' + fmtN(TR, 0) + ' dk' : 'model yok'}</i></div>
        {caps.index
          ? <div><small>Kenar</small><b>{r.ed} / {caps.index}</b><i>{caps.index - r.ed} kenar kaldı</i></div>
          : <div><small>Bileme</small><b>{r.rg} / {caps.regrind || 0}</b><i>{caps.regrind ? (caps.regrind - r.rg) + ' hak kaldı' : 'bilenmez'}</i></div>}
        <div><small>Ömür katsayısı</small><b>{fmtN((r.lf || 1) * 100, 0)}%</b><i>yeni takıma göre</i></div>
      </div>
      {caps.index > 0 && caps.ins && (
        <>
          <Baslik>Uç kenarları <em>{caps.ins.code}</em></Baslik>
          <Kenarlar n={caps.index} cur={r.ed} wear={rem != null && TR ? 1 - rem / TR : 0} />
          <Not>
            {caps.ins.txt}. {TRn ? <>Bu uç setinden kalan toplam kesme ≈ <b>{fmtN((caps.index - r.ed) * TRn + (rem || 0), 0)} dk</b>
              {c.tp ? ' (≈' + fmtN(Math.floor(((caps.index - r.ed) * TRn + (rem || 0)) / c.tp)) + ' parça)' : ''}.</> : null}
          </Not>
          {r.ed < caps.index ? (
            <>
              {takimDegistirebilir && <div className="tc-co-dugmeler"><Dugme tur="birincil" simge="rotate" onClick={() => uygula({ a: 'index' })}>Uç çevrildi → kenar {r.ed + 1} / {caps.index}</Dugme></div>}
              <Not>Bütün kenarlar sıfır ömürle başlar; {caps.ins.n > 1 ? 'gövdedeki ' + caps.ins.n + ' uç birlikte çevrilir.' : 'uç vidasını yeniden sıkın, takım boyu değişmez.'}</Not>
            </>
          ) : <Uyari>Bütün kenarlar kullanıldı — yeni uç takılmalı.</Uyari>}
          {takimDegistirebilir && (
            <>
              <IsaretKutusu etiket={`Yeni uç setinde depodan ${caps.ins.n} uç düş`} checked={ucDus} onChange={(e) => ucDusYaz(e.target.checked)} />
              <div className="tc-co-dugmeler">
                <Dugme simge="rotate" onClick={() => uygula({ a: 'newins' }, () => {
                  if (!ucDus || !caps.ins) return;
                  const it = rnInsItem(t, D.INSERTS || []), iv = it ? state.inv[invKey(it)] : null;
                  if (iv && iv.qty != null) { iv.qty = Math.max(0, iv.qty - caps.ins.n); delete iv.demo; }
                })}>Yeni uç seti takıldı (kenar 1)</Dugme>
              </div>
            </>
          )}
        </>
      )}
      {caps.regrind > 0 && (
        <>
          <Baslik>Bileme <em>{r.rg} / {caps.regrind}</em></Baslik>
          {caps.regrind - r.rg > 0 ? (
            <>
              <div className="tc-co-izgara">
                <Girdi id={`tc-co-rn-cap-${c.m.id}-${c.p}`} key={'cap' + r.rg} etiket="Bileme sonrası çap (mm)" type="number" step="0.01" defaultValue={String(+((t.d || 0) - (r.dd || 0) - (caps.dD ?? 0)).toFixed(3))} />
                <Girdi id={`tc-co-rn-boy-${c.m.id}-${c.p}`} key={'boy' + r.rg} etiket="Boy kısalması (mm)" type="number" step="0.1" min="0" defaultValue={String(caps.dL ?? 0)} />
              </div>
              {caps.coated && (
                <IsaretKutusu
                  etiket={`Bilemeden sonra yeniden kaplandı (${fmtN(rnFactor(t, caps, r.rg + 1, true) * 100, 0)}% ömür, kaplamasız ${fmtN(rnFactor(t, caps, r.rg + 1, false) * 100, 0)}%)`}
                  checked={kaplandi} onChange={(e) => kaplandiYaz(e.target.checked)}
                />
              )}
              <Not>
                Bilemeden sonra ömür ≈ <b>{fmtN(rnFactor(t, caps, r.rg + 1, false) * 100, 0)}%</b>{TRn ? ' (' + fmtN(TRn * rnFactor(t, caps, r.rg + 1, false), 0) + ' dk)' : ''}.
                Takım boyu ve çapı tezgâhta yeniden ölçülmeli{caps.dD ? '; çap küçüldüğü için finişte yarıçap ofsetini güncelleyin' : ''}.
              </Not>
              {TRn != null && (() => {
                let tot = 1;
                for (let q = r.rg + 1; q <= caps.regrind; q++) tot += rnFactor(t, caps, q, false);
                return <Not>Kalan bileme haklarıyla bu takımdan toplam ≈ <b>{fmtN((rem || 0) + TRn * (tot - 1), 0)} dk</b> kesme alınır — yeni takıma göre ≈{fmtN(tot, 1)} kat.</Not>;
              })()}
              {takimDegistirebilir && (
                <div className="tc-co-dugmeler">
                  <Dugme tur="birincil" simge="gear" onClick={() => uygula({ a: 'regrind', ...regrindAlanlari(), kaplandi: !!caps.coated && kaplandi }, () => kaplandiYaz(false))}>Bilendi, yeniden takıldı</Dugme>
                </div>
              )}
            </>
          ) : <Uyari>Bileme hakkı doldu — takım değiştirilmeli.</Uyari>}
          {(r.dd ?? 0) > 0 && t.d && (r.dd ?? 0) / t.d > 0.02 && (
            <Uyari>Çap Ø{fmtN(t.d - (r.dd ?? 0), 2)} (−{fmtN(r.dd ?? 0, 2)} mm): ölçülü finiş işlerinde kullanmayın, kaba işe ayırın.</Uyari>
          )}
        </>
      )}
      {caps.dress && caps.kind !== 'index' && (
        <>
          <Baslik>Kenar düzeltme / honlama</Baslik>
          <div className="tc-co-izgara">
            <Secim
              etiket="Geri kazanılan ömür" value={geriOran} onChange={(e) => geriOranYaz(e.target.value)}
              secenekler={[{ deger: '0.3', baslik: '%30 · hafif çapak' }, { deger: '0.5', baslik: '%50 · küçük çentik' }, { deger: '0.7', baslik: '%70 · iyi düzeltme' }]}
            />
            {takimDegistirebilir && <div className="tc-co-alt-hiza"><Dugme simge="edit" onClick={() => uygula({ a: 'dress', oran: num(geriOran, 0.5) })}>Düzeltildi</Dugme></div>}
          </div>
          <Not>Kullanılmış ömrün seçilen kadarı geri kazanılır; her düzeltme kenar dayanımını %2 düşürür.</Not>
        </>
      )}
      {takimDegistirebilir && (
        <div className="tc-co-dugmeler">
          <Dugme simge="rotate" onClick={() => yeniOnayYaz(true)}>Yeni takım takıldı (sıfırla)</Dugme>
          {r.log.length > 0 && <Dugme simge="back" onClick={() => uygula({ a: 'undo' })}>Son işlemi geri al</Dugme>}
        </div>
      )}
      {r.log.length > 0 && (
        <>
          <Baslik>Geçmiş</Baslik>
          <div className="tc-co-gecmis">
            {r.log.map((x, i) => <div key={i}><b>{new Date(x.t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</b><span>{x.txt}</span></div>)}
          </div>
        </>
      )}
      <Baslik>Bu tezgâhta yenileme olanakları</Baslik>
      <div className="tc-co-yntablo">
        {d.cards.map((cc: OmurKarti, k) => {
          const s = rnState(cc);
          const simge: SimgeAdi | null = s.caps.kind === 'index' ? 'rotate' : s.caps.kind === 'regrind' ? 'gear' : s.caps.kind === 'dress' ? 'edit' : null;
          return (
            <button key={cc.p} type="button" className={`${cc === c ? 'tc-co-on ' : ''}tc-co-st-${cc.st}`} onClick={() => kartSec(k)}>
              <b>T{pad2(cc.p + 1)}</b><i>{simge ? <Simge ad={simge} boyut="k" /> : '—'}</i><span>{cc.t.name}</span><small>{s.txt}</small>
            </button>
          );
        })}
      </div>
      <OnayPenceresi
        acik={yeniOnay} baslik="Yeni takım"
        onayla={() => {
          const W0 = state.wear[c.m.id] || (state.wear[c.m.id] = {});
          W0[c.p] = yeniTakim(t, Date.now()); yeniOnayYaz(false); degisti();
        }}
        vazgec={() => yeniOnayYaz(false)}
      >
        <p>T{pad2(c.p + 1)} · {t.name} yenisiyle değiştirildi mi? Kenar / bileme sayaçları sıfırlanır.</p>
      </OnayPenceresi>
    </div>
  );
}
