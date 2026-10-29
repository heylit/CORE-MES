import { useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { kucuk, type Operasyon } from './kurallar.ts';
import { renkSinifi, tercihOku, tercihYaz, type RotaEkrani } from './ortak.tsx';
import { SURUKLE_TURU, surukleOp } from './AkisSemasi.tsx';

type Gruplama = 'grup' | 'merkez';
interface Grup { anahtar: string; baslik: string; renk: string | null; ops: Operasyon[] }

// Operasyon kutucukları varsayılan olarak operasyon grubuna, istenirse iş merkezine göre gruplanır (1110 a); iş merkezi
// gruplamasında istasyonu olmayan "İstasyonsuz" grubundadır. Kutucuk dokununca eklenir ya da şemaya sürüklenir.
// Yalnız katalogdaki aktif operasyonlar listelenir.
export function OperasyonKutuculari({ r, sec, aramaEtiketi = 'Operasyon ara' }: { r: RotaEkrani; sec: (op: Operasyon) => void; aramaEtiketi?: string }) {
  const [q, setQ] = useState('');
  const [kip, setKip] = useState<Gruplama>(() => (tercihOku('palet-gruplama', 'grup') === 'merkez' ? 'merkez' : 'grup'));
  const [kapali, setKapali] = useState<ReadonlySet<string>>(new Set());
  const { h } = r.duzen;
  const s = kucuk(q.trim());
  const ops = [...h.op.values()].filter((o) => o.aktif);
  const istasyonu = (o: Operasyon) => (o.stationId ? h.istasyon.get(o.stationId) : undefined);
  const uyan = ops.filter((o) => !s || kucuk(`${o.abbr ?? ''} ${o.code} ${o.name} ${istasyonu(o)?.name ?? ''}`).includes(s));
  const gruplar: Grup[] = (() => {
    if (kip === 'merkez') {
      const l: Grup[] = [...h.isMerkezi.values()].map((w) => ({
        anahtar: `w${w.id}`, baslik: `${w.code} ${w.name}`, renk: renkSinifi(w.id), ops: uyan.filter((o) => istasyonu(o)?.wcId === w.id),
      }));
      const yetim = uyan.filter((o) => !h.isMerkezi.get(istasyonu(o)?.wcId ?? ''));
      return [...l, { anahtar: 'w-yok', baslik: 'İstasyonsuz', renk: null, ops: yetim }].filter((g) => g.ops.length > 0);
    }
    const m = new Map<string, Grup>();
    for (const o of uyan) {
      const g = m.get(o.group) ?? { anahtar: `g${o.group}`, baslik: o.groupName || o.group || 'Grupsuz', renk: null, ops: [] };
      g.ops.push(o);
      m.set(o.group, g);
    }
    return [...m.values()].sort((a, b) => a.baslik.localeCompare(b.baslik, 'tr'));
  })();
  const kipSec = (k: Gruplama) => { setKip(k); tercihYaz('palet-gruplama', k); };
  const degistir = (k: string) => { const y = new Set(kapali); if (y.has(k)) y.delete(k); else y.add(k); setKapali(y); };
  const kutu = (o: Operasyon) => {
    const ist = istasyonu(o);
    return (
      <button key={o.id} type="button" className={`tc-rr1-tile ${ist ? renkSinifi(ist.id) : 'tc-rr1-renk-yok'}`} draggable
        onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleOp(o.id)); e.dataTransfer.effectAllowed = 'copy'; r.surukleBasla(); }}
        onDragEnd={r.surukleBitti}
        onClick={() => { sec(o); }}>
        <span className="tc-rr1-abbr">{o.abbr ?? o.code}</span><b>{o.name}</b><small>{o.code}{ist ? `, ${ist.code}` : ''}</small>
      </button>
    );
  };
  return (
    <div className="tc-rr1-tiles-kap">
      <input className="tc-rr1-metin" type="search" value={q} placeholder="Operasyon ara: kısaltma, kod, ad" aria-label={aramaEtiketi}
        onChange={(e) => { setQ(e.target.value); }} />
      <span className="tc-rr1-seg" role="group" aria-label="Gruplama">
        <button type="button" aria-pressed={kip === 'grup'} onClick={() => { kipSec('grup'); }}>Operasyon grubu</button>
        <button type="button" aria-pressed={kip === 'merkez'} onClick={() => { kipSec('merkez'); }}>İş merkezi</button>
      </span>
      {gruplar.map((g) => {
        // Arama sürerken bütün gruplar açıktır; aranan kutucuk kapalı başlığın altında kalmaz.
        const acik = s !== '' || !kapali.has(g.anahtar);
        return (
          <section key={g.anahtar} className="tc-rr1-isec">
            <h4>
              <button type="button" className="tc-rr1-grupbas" aria-expanded={acik} onClick={() => { degistir(g.anahtar); }}>
                <Simge ad={acik ? 'down' : 'chev-right'} boyut="k" />
                {g.renk && <span className={`tc-rr1-nokta ${g.renk}`} />}
                <span>{g.baslik}</span><small>{g.ops.length}</small>
              </button>
            </h4>
            {acik && <div className="tc-rr1-tiles">{g.ops.map(kutu)}</div>}
          </section>
        );
      })}
      {ops.length === 0 && <p className="tc-rr1-ipucu">Katalogda operasyon yok. Operasyonlar bölümünden ilkini tanımla.</p>}
      {ops.length > 0 && gruplar.length === 0 && <p className="tc-rr1-ipucu">Aramaya uyan operasyon yok.</p>}
    </div>
  );
}

// Şemanın solundaki operasyon paleti: kutucuğa dokununca (ya da Enter) "Eklenecek yer"e eklenir; şemaya sürüklenince bırakılan yere.
export function AdimPaneli({ r, ekle, yer }: { r: RotaEkrani; ekle: (op: Operasyon) => void; yer: string | null }) {
  return (
    <aside className="tc-rr1-adimpanel" aria-label="Operasyon paleti">
      <h3>Operasyon paleti</h3>
      {yer && (
        <p className="tc-rr1-hedef" aria-live="polite">
          <span>Dokununca eklenecek yer</span><b>{yer}</b><small>Şemada bir adım seçerek değiştir.</small>
        </p>
      )}
      <p className="tc-rr1-ipucu">Operasyonu şemaya sürükle: adımın üstüne ya da altındaki şeride bırakınca ardına, rota başlığına bırakınca başa girer.</p>
      <OperasyonKutuculari r={r} sec={ekle} aramaEtiketi="Palette operasyon ara" />
    </aside>
  );
}
