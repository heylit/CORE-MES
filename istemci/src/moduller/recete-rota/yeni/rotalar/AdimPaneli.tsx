import { useState } from 'react';
import { kucuk, type Operasyon } from './kurallar.ts';
import { renkSinifi, type RotaEkrani } from './ortak.tsx';
import { SURUKLE_TURU, surukleOp } from './AkisSemasi.tsx';

// Operasyon kutucukları iş merkezine göre gruplanır; istasyonu olmayan "İstasyonsuz" grubundadır. Kutucuk dokununca seçilir ya da
// şemadaki bir adımın üstüne sürüklenince onun ardına eklenir. Yalnız katalogdaki aktif operasyonlar listelenir.
export function OperasyonKutuculari({ r, sec, aramaEtiketi = 'Operasyon ara' }: { r: RotaEkrani; sec: (op: Operasyon) => void; aramaEtiketi?: string }) {
  const [q, setQ] = useState('');
  const { h } = r.duzen;
  const s = kucuk(q.trim());
  const ops = [...h.op.values()].filter((o) => o.aktif);
  const uyar = (o: Operasyon) => {
    const ist = o.stationId ? h.istasyon.get(o.stationId) : undefined;
    return !s || kucuk(`${o.abbr ?? ''} ${o.code} ${o.name} ${ist?.name ?? ''}`).includes(s);
  };
  const gruplar = [...h.isMerkezi.values()].map((w) => ({
    w, ops: ops.filter((o) => { const ist = o.stationId ? h.istasyon.get(o.stationId) : undefined; return ist?.wcId === w.id && uyar(o); }),
  })).filter((g) => g.ops.length > 0);
  const yetim = ops.filter((o) => !(o.stationId && h.istasyon.get(o.stationId) && h.isMerkezi.get(h.istasyon.get(o.stationId)?.wcId ?? '')) && uyar(o));
  const kutu = (o: Operasyon) => {
    const ist = o.stationId ? h.istasyon.get(o.stationId) : undefined;
    return (
      <button key={o.id} type="button" className={`tc-rr1-tile ${ist ? renkSinifi(ist.id) : 'tc-rr1-renk-yok'}`} draggable
        onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleOp(o.id)); e.dataTransfer.effectAllowed = 'copy'; }}
        onClick={() => { sec(o); }}>
        <span className="tc-rr1-abbr">{o.abbr ?? o.code}</span><b>{o.name}</b><small>{o.code}{ist ? `, ${ist.code}` : ''}</small>
      </button>
    );
  };
  return (
    <div className="tc-rr1-tiles-kap">
      <input className="tc-rr1-metin" type="search" value={q} placeholder="Operasyon ara: kısaltma, kod, ad" aria-label={aramaEtiketi}
        onChange={(e) => { setQ(e.target.value); }} />
      {gruplar.map((g) => (
        <section key={g.w.id} className="tc-rr1-isec">
          <h4><span className={`tc-rr1-nokta ${renkSinifi(g.w.id)}`} />{g.w.code} {g.w.name}</h4>
          <div className="tc-rr1-tiles">{g.ops.map(kutu)}</div>
        </section>
      ))}
      {yetim.length > 0 && (
        <section className="tc-rr1-isec"><h4>İstasyonsuz</h4><div className="tc-rr1-tiles">{yetim.map(kutu)}</div></section>
      )}
      {ops.length === 0 && <p className="tc-rr1-ipucu">Katalogda operasyon yok. Operasyonlar bölümünden ilkini tanımla.</p>}
      {ops.length > 0 && gruplar.length === 0 && yetim.length === 0 && <p className="tc-rr1-ipucu">Aramaya uyan operasyon yok.</p>}
    </div>
  );
}

// Şemanın solundaki adım paneli: kutucuğa dokununca gösterilen rotanın seçili adımının ardına (yoksa sonuna) adım eklenir.
export function AdimPaneli({ r, ekle }: { r: RotaEkrani; ekle: (op: Operasyon) => void }) {
  return (
    <aside className="tc-rr1-adimpanel" aria-label="Adım ekle paneli">
      <h3>Adım ekle</h3>
      <p className="tc-rr1-ipucu">Operasyona dokun ya da şemadaki bir adımın üstüne sürükle; istasyon ve süreler katalogdan gelir.</p>
      <OperasyonKutuculari r={r} sec={ekle} aramaEtiketi="Adım panelinde operasyon ara" />
    </aside>
  );
}
