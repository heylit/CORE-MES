import { Fragment, useMemo, useState, type SyntheticEvent } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import { gunlukDagilim, KISI_BOS, matris, MATRIS_KIRILIM, type MatrisGorunumu, type MatrisSatiri } from './kurallar.ts';

// Matris merceği (k-gorunum sMatris; zz5-olcek-her-yer kırılımı): tezgâh, kişi ya da sipariş başına dönem dönem adet ve doluluk. Sütun dönemin
// kırılımıdır; günde 7 ya da 14 gün seçilir. Tezgâh adı o tezgâhın kuyruğunu, sipariş adı siparişi Siparişler merceğinde açar.
const GORUNUMLER: [MatrisGorunumu, string, SimgeAdi][] = [['tezgah', 'Tezgâh', 'cpu'], ['kisi', 'Personel', 'user'], ['siparis', 'Sipariş', 'list']];
const SUTUN: Record<MatrisGorunumu, string> = { tezgah: 'Tezgâh', kisi: 'Personel', siparis: 'Sipariş' };
const NOT: Record<MatrisGorunumu, string> = {
  tezgah: 'Hücre: o gün üretilen parça adedi (ayar hariç). Alttaki yüzde: tezgâhın o günkü çalışma süresinin ne kadarının dolu olduğu (ayar dahil). Renk koyulaştıkça tezgâh doludur.',
  kisi: 'Motor kişi seçmez; grup ve vardiya başına kişi sayar. Bu tablo bir atama önerisidir: her vardiyada tezgâh, yetkin ve en az yüklü kişiye verilir (tezgâhın operatör oranı elverdiği kadar bir kişi birden çok tezgâh bakar). Işıksız çalışan tezgâhın vardiya dışı üretimi kişiye yazılmaz.',
  siparis: 'Hücre: siparişin son adımında o gün biten parça adedi, yani teslime hazır parça. Kırmızı satır termini kaçan siparişi gösterir.',
};
const donemli = (s: string) => s.replace(/o gün üretilen/g, 'o dönemde üretilen').replace(/o günkü çalışma/g, 'o dönemki çalışma').replace(/o gün biten/g, 'o dönemde biten');

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi;
  gor: MatrisGorunumu; gorSec: (g: MatrisGorunumu) => void; gun: number; gunSec: (n: number) => void;
  kuyrukAc: (m: string) => void; sipSec: (j: string) => void;
}

export function MatrisCizelgesi(o: Ozellikler) {
  const { c, p, cx, olcek, gor, gun } = o;
  const v = useMemo(() => gunlukDagilim(c, p, cx), [c, p, cx]);
  const m = useMemo(() => matris(c, p, cx, v, gor, olcek, gun), [c, p, cx, v, gor, olcek, gun]);
  const n = m.sutunlar.length;
  // Hücre ipucu (b-kabuk ipucuGoster): fare ya da odakla hücrenin üstünde tek kutu; yer yoksa altında.
  const [ip, setIp] = useState<{ t: string; x: number; y: number; alt: boolean } | null>(null);
  const ipucu = (e: SyntheticEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ipucu]');
    if (!el?.dataset.ipucu) { setIp(null); return; }
    const r = el.getBoundingClientRect(); const alt = r.top < 96;
    setIp({ t: el.dataset.ipucu, x: r.left + r.width / 2, y: alt ? r.bottom : r.top, alt });
  };

  const ad = (s: MatrisSatiri) => {
    const ic = <><b className={gor === 'kisi' ? undefined : 'tc-pym-mono'}>{s.id === KISI_BOS && <Simge ad="alert" boyut="k" />}{s.ad}</b><span className="tc-pym-kucuk-yazi">{s.alt}</span></>;
    if (gor === 'tezgah') return <button type="button" className="tc-pym-m-ad" onClick={() => o.kuyrukAc(s.id)}>{ic}</button>;
    if (gor === 'siparis') return <button type="button" className="tc-pym-m-ad" onClick={() => o.sipSec(s.id)}>{ic}</button>;
    return <span className="tc-pym-m-ad">{ic}</span>;
  };
  const satir = (s: MatrisSatiri) => (
    <tr key={s.id} data-uyari={s.uyari ? '' : undefined}>
      <th scope="row">{ad(s)}</th>
      {s.hucreler.map((h, i) => {
        const k = m.sutunlar[i];
        if (!h) return <td key={k?.a ?? i} className="tc-pym-m-h" data-isi={0} data-kapali={k?.kapali ? '' : undefined} />;
        return (
          <td key={k?.a ?? i} className="tc-pym-m-h" data-isi={h.isi} data-ipucu={h.ipucu} tabIndex={0}>
            <b>{h.adet}</b>{h.oran != null && <span className="tc-pym-kucuk-yazi">%{Math.round(h.oran * 100)}</span>}
          </td>
        );
      })}
      <td className="tc-pym-num"><b>{s.toplam}</b></td>
    </tr>
  );

  return (
    <div className="tc-pym-tb-mercek" data-mercek="matris">
      <div className="tc-pym-sira">
        <div className="tc-pym-seg" role="tablist" aria-label="Matris">
          {GORUNUMLER.map(([id, a, sm]) => <button key={id} type="button" role="tab" aria-selected={gor === id} onClick={() => o.gorSec(id)}><Simge ad={sm} boyut="k" />{a}</button>)}
        </div>
        {olcek === 'gun' ? (
          <div className="tc-pym-seg" role="tablist" aria-label="Gün sayısı (günlük kırılım)">
            {[7, 14].map((x) => <button key={x} type="button" role="tab" aria-selected={gun === x} onClick={() => o.gunSec(x)}>{x} gün</button>)}
          </div>
        ) : <span className="tc-pym-kucuk-yazi">Kırılım: <b>{MATRIS_KIRILIM[olcek]}</b></span>}
        <span className="tc-pym-ara" />
        <div className="tc-pym-m-lejant" aria-hidden="true">
          <span className="tc-pym-kucuk-yazi">Doluluk</span>{[0, 1, 2, 3, 4].map((i) => <i key={i} data-isi={i} />)}<span className="tc-pym-kucuk-yazi">%0 → %100</span>
        </div>
      </div>
      <p className="tc-pym-alt">{olcek === 'gun' ? NOT[gor] : donemli(NOT[gor])}</p>
      <div className="tc-tablo-kap tc-pym-m-kap" onMouseOver={ipucu} onFocus={ipucu} onMouseLeave={() => setIp(null)} onBlur={() => setIp(null)}>
        <table className="tc-tablo tc-pym-matris">
          <thead>
            <tr>
              <th scope="col">{SUTUN[gor]}</th>
              {m.sutunlar.map((k) => (
                <th key={k.a} scope="col" className="tc-pym-num" data-kapali={k.kapali ? '' : undefined}><span className="tc-pym-m-gun">{k.gun}</span><span className="tc-pym-kucuk-yazi tc-pym-mono">{k.tarih}</span></th>
              ))}
              <th scope="col" className="tc-pym-num">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {m.gruplar.map((g) => (
              <Fragment key={g.ad ?? ''}>
                {g.ad != null && <tr className="tc-pym-m-grup"><th scope="rowgroup" colSpan={n + 2}>{g.ad}</th></tr>}
                {g.satirlar.map(satir)}
              </Fragment>
            ))}
            {m.bos && satir(m.bos)}
          </tbody>
          <tfoot>
            <tr className="tc-pym-m-top">
              <th scope="row">Toplam</th>
              {m.toplamlar.map((x, i) => <td key={m.sutunlar[i]?.a ?? i} className="tc-pym-num"><b>{x}</b></td>)}
              <td className="tc-pym-num"><b>{m.toplam}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {ip && <div className="tc-pym-ipucu" role="tooltip" data-alt={ip.alt ? '' : undefined} ref={degisken({ '--x': `${ip.x}px`, '--y': `${ip.y}px` })}>{ip.t}</div>}
    </div>
  );
}
