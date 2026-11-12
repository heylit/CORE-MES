import { useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { bolDenetle, bolDurumu, bolYaz, esitPaylar, ilkTezgahlar, payMetni, type BolPayi } from './kurallar.ts';
import { kaynakAdlariKur } from '../../kaynak-kodu.tsx';
import './bol.css';

// Böl penceresi (2524 b, ELLE-BOLME 3): pay sayısı, her payın adedi ve tezgâhı; toplam adımın adedine eşit olmalı. "Payları birleştir"
// tek tezgâh seçer, iş tek pay olur. Uygulama çalışmaya yazar; plan yeniden çözülünce paylar yerleşir (motorun önizlemesi yok).
export type BolKipi = 'bol' | 'birlestir';
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; id: string; kip: BolKipi; komut: CalismaKomutu | null; kapat: () => void;
}

export function BolPenceresi({ c, p, cx, id, kip, komut, kapat }: Ozellikler) {
  const r = Object.values(p.ops).find((x) => x.id === id);
  if (!r) {
    return (
      <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label="Böl">
        <header><b><Simge ad="grid" boyut="k" />Böl</b><Kapat kapat={kapat} /></header>
        <p>Bu iş planda yok; önce planı kurun.</p>
      </section>
    );
  }
  return <Form c={c} cx={cx} p={p} r={r} kip={kip} komut={komut} kapat={kapat} />;
}

function Kapat({ kapat }: { kapat: () => void }) {
  return <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={kapat}><Simge ad="x" boyut="k" /></button>;
}

function Form({ c, cx, p, r, kip, komut, kapat }: Omit<Ozellikler, 'id'> & { r: OkunanPlan['ops'][string] }) {
  const d = bolDurumu(c, cx, p, r);
  const kad = kaynakAdlariKur(c.D);
  const ilkN = Math.min(d.enCok, Math.max(2, d.elle && d.elle.length > 1 ? d.elle.length : d.paylar.length > 1 ? d.paylar.length : 2));
  const ilk = (n: number): BolPayi[] => {
    const m = ilkTezgahlar(d, n); const a = esitPaylar(d.adet, n);
    return a.map((adet, i) => ({ adet, m: m[i] ?? d.adaylar[0] ?? '' }));
  };
  const [paylar, setPaylar] = useState<BolPayi[]>(() => (d.elle && d.elle.length > 1 ? d.elle : ilk(ilkN)));
  const [tek, setTek] = useState(() => ilkTezgahlar(d, 1)[0] ?? d.adaylar[0] ?? '');
  const birlestir = kip === 'birlestir';
  const engel = birlestir ? d.engel : d.bolEngeli;
  const hata = engel ?? (birlestir ? (d.adaylar.includes(tek) ? null : 'Tezgâh işi yapabilen tezgâhlardan olmalı.') : bolDenetle(paylar, d));
  const toplam = paylar.reduce((t, x) => t + x.adet, 0);
  const yaz = (i: number, x: Partial<BolPayi>) => setPaylar((l) => l.map((y, k) => (k === i ? { ...y, ...x } : y)));
  const uygula = () => {
    if (!komut || hata) return;
    const yeni = birlestir ? [{ adet: d.adet, m: tek }] : paylar;
    komut.degistir(birlestir ? 'Paylar birleştirildi' : 'İş bölündü', (t) => { bolYaz(t, d.id, yeni); }, { ayrinti: `${d.id} · ${payMetni(yeni)}` });
    kapat();
  };
  const ad = birlestir ? 'Payları birleştir' : 'Böl';
  return (
    <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label={ad}>
      <header><b><Simge ad={birlestir ? 'layers' : 'grid'} boyut="k" />{ad}</b><span className="tc-pym-ara" /><Kapat kapat={kapat} /></header>
      <div className="tc-pym-kb-bas">
        <span className="tc-pym-kb-tur">İş adımı</span><b className="tc-pym-mono">{d.id}</b>
        <small>{`${String(d.adet)} adet · ${d.paylar.length > 1 ? `${String(d.paylar.length)} pay: ${d.paylar.map((x) => x.m).join(', ')}` : d.paylar[0]?.m ?? ''}`}</small>
      </div>
      {birlestir ? (
        <div className="tc-pym-bol-sayi">
          <label htmlFor="tc-pym-bol-tek">Tezgâh</label>
          <select id="tc-pym-bol-tek" value={tek} onChange={(e) => setTek(e.target.value)} disabled={!!engel}>{d.adaylar.map((m) => <option key={m} value={m}>{kad.kaynak(m)}</option>)}</select>
        </div>
      ) : (
        <>
          <div className="tc-pym-bol-sayi">
            <label htmlFor="tc-pym-bol-n">Pay sayısı</label>
            <select id="tc-pym-bol-n" value={paylar.length} disabled={!!engel} onChange={(e) => setPaylar(ilk(Number(e.target.value)))}>
              {Array.from({ length: Math.max(0, d.enCok - 1) }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <ol className="tc-pym-bol-paylar" aria-label="Paylar">
            {paylar.map((x, i) => (
              <li key={i} className="tc-pym-bol-pay">
                <b>{`Pay ${String(i + 1)}`}</b>
                <input type="number" min={1} step={1} aria-label={`Pay ${String(i + 1)} adedi`} className="tc-pym-tp-girdi" value={Number.isFinite(x.adet) ? x.adet : ''} disabled={!!engel}
                  onChange={(e) => yaz(i, { adet: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
                <select aria-label={`Pay ${String(i + 1)} tezgâhı`} value={x.m} disabled={!!engel} onChange={(e) => yaz(i, { m: e.target.value })}>
                  {d.adaylar.map((m) => <option key={m} value={m}>{kad.kaynak(m)}</option>)}
                </select>
              </li>
            ))}
          </ol>
          <p className="tc-pym-bol-ozet"><span>{`Toplam ${Number.isFinite(toplam) ? String(toplam) : '—'} / ${String(d.adet)} adet`}</span><span>{`En çok ${String(d.enCok)} pay`}</span></p>
        </>
      )}
      {hata && <p className="tc-pym-bol-ozet" data-hata="" role="alert">{hata}</p>}
      {!komut && <p className="tc-pym-bol-ozet">Plan yazma yetkiniz yok.</p>}
      <p className="tc-pym-kb-ip">Uygulanınca plan eskir; paylar plan yeniden kurulunca yerleşir. Sabitleme paylara ayrı ayrı uygulanır.</p>
      <div className="tc-pym-dugmeler">
        <button type="button" className="tc-dugme tc-dugme-birincil" aria-disabled={!komut || !!hata ? 'true' : undefined} onClick={uygula}><Simge ad="check" boyut="k" />Uygula</button>
        <button type="button" className="tc-dugme" onClick={kapat}>Vazgeç</button>
      </div>
    </section>
  );
}
