import { useState } from 'react';
import { Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { dakika, sayi } from '../bicim.ts';
import { adimSil, adimSurukle, fasonMu, sirali, statuNo, type Adim } from './kurallar.ts';
import { BAG_ADI, fasonAdi, type RotaEkrani } from './ortak.tsx';
import { SURUKLE_TURU, surukleAdim, surukleCoz } from './AkisSemasi.tsx';

// Akış tablosu: şemadaki her rota ayrı tablo. Satır OP numarasından seçilir; tutamaktan sürüklenerek ya da oklarla taşınır.
function RotaTablosu({ r, urunId, miktar }: { r: RotaEkrani; urunId: string; miktar: number }) {
  const { h } = r.duzen;
  const m = h.malzeme.get(urunId);
  const [ustunde, setUstunde] = useState<string | null>(null);
  if (!m) return null;
  const duzen = r.duzen.duzenlenebilir(urunId);
  const liste = sirali(r.duzen.adimlar(urunId));
  const V = r.duzen.gorulen(urunId);
  const malzemeAdi = (id: string) => h.malzeme.get(id)?.code ?? '?';
  const birak = (hedef: Adim, v: string) => {
    const s = surukleCoz(v);
    if (s?.tur === 'adim' && s.urunId === urunId && s.adimId !== hedef.id) r.duzen.degistir(urunId, (l) => adimSurukle(l, s.adimId, hedef.id), 'Adım taşındı');
  };
  const sutunlar: Sutun<Adim>[] = [
    {
      anahtar: 'op', baslik: 'OP', kirilmaz: true, csv: (a) => statuNo(a),
      hucre: (a) => (
        <span
          className={`tc-rr1-tsurukle${ustunde === a.id ? ' tc-rr1-birak' : ''}`}
          draggable={duzen}
          onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleAdim(urunId, a.id)); }}
          onDragOver={(e) => { if (duzen) { e.preventDefault(); setUstunde(a.id); } }}
          onDragLeave={() => { setUstunde(null); }}
          onDrop={(e) => { e.preventDefault(); setUstunde(null); birak(a, e.dataTransfer.getData(SURUKLE_TURU)); }}
        >
          {duzen && <Simge ad="more" boyut="k" />}<b>{statuNo(a)}</b>
        </span>
      ),
    },
    { anahtar: 'operasyon', baslik: 'Operasyon', hucre: (a) => h.op.get(a.opId)?.name ?? 'Operasyon seç' },
    {
      anahtar: 'kaynak', baslik: 'İstasyon',
      hucre: (a) => (fasonMu(a) ? `Dış üretim: ${fasonAdi(r.duzen.durum.fasonFirms, a.fasonId)}`
        : a.stationId ? `${h.istasyon.get(a.stationId)?.code ?? '?'} ${h.istasyon.get(a.stationId)?.name ?? ''}` : 'İstasyon seçilmedi'),
    },
    { anahtar: 'hazirlik', baslik: 'Hazırlık', hizala: 'sag', hucre: (a) => (fasonMu(a) ? '—' : dakika(a.setup)) },
    { anahtar: 'islem', baslik: 'İşlem', hizala: 'sag', hucre: (a) => (fasonMu(a) ? '—' : dakika(a.proc)) },
    { anahtar: 'degisim', baslik: 'Değişim', hizala: 'sag', hucre: (a) => (fasonMu(a) ? '—' : dakika(a.chg)) },
    { anahtar: 'bag', baslik: 'Bağlılık', hucre: (a) => (a.dep === 'ortulu' ? `${BAG_ADI.ortulu} (${sayi(a.depQty ?? 1)})` : BAG_ADI[a.dep]) },
    { anahtar: 'girenler', baslik: 'Girenler', hucre: (a) => a.ins.map((x) => `${malzemeAdi(x.itemId)} × ${sayi(x.qty)}`).join(', ') || '—' },
    { anahtar: 'yanlar', baslik: 'Yan ürünler', hucre: (a) => a.outs.map((x) => `${malzemeAdi(x.itemId)} × ${sayi(x.qty)}`).join(', ') || '—' },
  ];
  if (duzen) {
    sutunlar.push({
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (a) => {
        const i = liste.indexOf(a);
        return (
          <span className="tc-rr1-teylem">
            <button type="button" className="tc-rr1-ib" disabled={i === 0} aria-label={`OP ${String(statuNo(a))} yukarı taşı`}
              onClick={(e) => { e.stopPropagation(); const p = liste[i - 1]; if (p) r.duzen.degistir(urunId, (l) => adimSurukle(l, a.id, p.id), 'Adım yukarı taşındı'); }}>
              <Simge ad="up" boyut="k" />
            </button>
            <button type="button" className="tc-rr1-ib" disabled={i === liste.length - 1} aria-label={`OP ${String(statuNo(a))} aşağı taşı`}
              onClick={(e) => { e.stopPropagation(); const n = liste[i + 1]; if (n) r.duzen.degistir(urunId, (l) => adimSurukle(l, a.id, n.id), 'Adım aşağı taşındı'); }}>
              <Simge ad="down" boyut="k" />
            </button>
            <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" aria-label={`OP ${String(statuNo(a))} sil`}
              onClick={(e) => { e.stopPropagation(); r.duzen.degistir(urunId, (l) => adimSil(l, a.id), `OP ${String(statuNo(a))} silindi`); }}>
              <Simge ad="trash" boyut="k" />
            </button>
          </span>
        );
      },
    });
  }
  return (
    <div className="tc-rr1-rtab">
      <h4>{m.code} rotası {V && <span className={`tc-rr1-rvchip tc-rr1-rv-${V.status}`}>Rev {V.no}</span>} <small>{m.name}</small></h4>
      <Tablo
        etiket={`${m.code} rota adımları`} sutunlar={sutunlar} satirlar={liste} satirAnahtari={(a) => a.id}
        satirSec={(a) => { r.sec({ tur: 'adim', urunId, adimId: a.id, seq: a.seq, miktar }); }}
        bosMesaj="Rota yok. İlk adımı ekle."
      />
      {duzen && (
        <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'adimEkle', urunId, sonraId: liste.at(-1)?.id ?? null }); }}>
          <Simge ad="plus" boyut="k" /> Adım ekle
        </button>
      )}
    </div>
  );
}

export function AkisTablosu({ r, urunler, miktar }: { r: RotaEkrani; urunler: readonly string[]; miktar: number }) {
  return (
    <div className="tc-rr1-rtab-wrap">
      {urunler.map((id) => <RotaTablosu key={id} r={r} urunId={id} miktar={miktar} />)}
    </div>
  );
}
