import type { RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Cip, DEP_METNI, OpKutusu } from './AkisSemasi.tsx';
import { araya, bagimlilikDegistir, kaydir, sil, tasi, yeniAdim } from './duzenleme.ts';
import { DURUM_ETIKETI, araHalAdi, birimMetni, sayiMetni, sureMetni } from './gorunum.ts';
import type { Secim } from './secim.ts';
import type { Degisiklik, Dugum } from './useRotaCalisma.ts';

interface Ozellikler {
  dugumler: readonly Dugum[];
  ayrintilar: ReadonlyMap<string, RevizyonAyrintisi>;
  secenekler: SeceneklerCevabi;
  duzenlenebilir: (urunId: number) => boolean;
  secim: Secim | null;
  sec: (s: Secim) => void;
  degistir: (urunId: number, d: Degisiklik) => void;
  bilesenEkleAc: (urunId: number, opNo: number, tur: 'bilesen' | 'yan') => void;
}

// Prototipin akış tablosu: her rota bir bölüm, her adım bir satır (girenler | adım | çıkanlar). Kartlar şemadakiyle aynı
// görünümdedir; düzenleme yandaki sabit panelde yapılır.
function Bolum({ d, a, o }: { d: Dugum; a: RevizyonAyrintisi; o: Ozellikler }) {
  const duzen = o.duzenlenebilir(d.urunId);
  const tip = o.secenekler.operasyonTipleri.find((t) => t.aktif && t.kod === 'uretim') ?? o.secenekler.operasyonTipleri.find((t) => t.aktif);
  const urun = a.urun;
  const degistir = (x: Degisiklik) => o.degistir(d.urunId, x);
  const sec = (s: Secim) => o.sec(s);
  return (
    <section className="tc-rtab" aria-label={`${urun.stokKodu ?? urun.ad} rotası`}>
      <header className="tc-rtab-hd">
        <span className="tc-slot tc-slot-mamul">MM</span>
        <b>{urun.stokKodu ?? urun.ad} rotası</b>
        <span className={`tc-rvchip tc-rv-${a.revizyon.durum}`}>Rev {a.revizyon.harf} {DURUM_ETIKETI[a.revizyon.durum].toLocaleLowerCase('tr-TR')}</span>
        <small>{urun.ad} · {sayiMetni(a.miktar)} {birimMetni(urun.stokBirimi)} · {a.ozet.adimSayisi} adım · {sureMetni(a.ozet.toplamTeorikSureDk)}</small>
      </header>
      <div className="tc-rflow tc-rflow-bas" aria-hidden="true"><span>Girenler</span><span>Adım</span><span>Çıkanlar</span></div>
      {a.adimlar.map((adim, i) => {
        const op = adim.opNo;
        const sonraki = a.adimlar[i + 1];
        const seciliMi = (t: Secim['tur'], m?: number) => o.secim !== null && o.secim.tur === t && o.secim.nid === d.nid && o.secim.opNo === op
          && (m === undefined || ('malzemeId' in o.secim && o.secim.malzemeId === m));
        const kartBurada = o.secim && o.secim.tur !== 'urun' && o.secim.nid === d.nid && o.secim.opNo === op;
        return (
          <div key={op} className={`tc-rflow${kartBurada ? ' tc-rflow-secili' : ''}`}>
            <div className="tc-rflow-in">
              {adim.akis.tuketir.map((t) => {
                const k = a.adimlar.find((x) => x.opNo === t);
                return (
                  <Cip key={`f${t}`} tur="onceki" arahal urun={urun} baslik={k ? araHalAdi(urun, k) : `OP ${t}`} alt="önceki adımdan"
                    miktar={adim.adimMiktari} birim={birimMetni(urun.stokBirimi)} rozet={null} secili={false} sec={() => sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: t })} />
                );
              })}
              {adim.bilesenler.map((b) => (
                <Cip key={b.malzeme.id} tur="giren" urun={b.malzeme} baslik={b.malzeme.stokKodu ?? b.malzeme.ad} alt={b.malzeme.ad} miktar={b.toplamMiktar}
                  birim={birimMetni(b.malzeme.stokBirimi)} rozet={b.fireYuzde !== '0.00' ? <span className="tc-kb">fire %{sayiMetni(b.fireYuzde)}</span> : null}
                  secili={seciliMi('bilesen', b.malzeme.id)} sec={() => sec({ tur: 'bilesen', nid: d.nid, urunId: d.urunId, opNo: op, malzemeId: b.malzeme.id })} />
              ))}
              {duzen && <button type="button" className="tc-add" onClick={() => o.bilesenEkleAc(d.urunId, op, 'bilesen')}>+ Giren</button>}
            </div>
            <div className="tc-rflow-op">
              {i > 0 && (
                <button type="button" className={`tc-deppill tc-dep-${adim.bagimlilik}`} disabled={!duzen}
                  title="Önceki adımla ilişki: dokununca değişir" onClick={() => degistir(bagimlilikDegistir(op))}>{DEP_METNI(adim)}</button>
              )}
              <OpKutusu a={adim} d={d} urun={urun} sonraki={sonraki} duzen={duzen} secili={seciliMi('adim')}
                sec={() => sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: op })}
                birakildi={(kaynak) => { const [u, k] = kaynak.split('|').map(Number); if (u === d.urunId && k !== undefined && k !== op) degistir(tasi(k, op)); }} />
              {duzen && (
                <div className="tc-stepbar">
                  <button type="button" className="tc-ib" disabled={i === 0} onClick={() => degistir(kaydir(op, -1))} aria-label={`OP ${op} yukarı taşı`}>↑</button>
                  <button type="button" className="tc-ib" disabled={i === a.adimlar.length - 1} onClick={() => degistir(kaydir(op, 1))} aria-label={`OP ${op} aşağı taşı`}>↓</button>
                  <button type="button" className="tc-add tc-add-between" disabled={!tip} onClick={() => { if (tip) degistir(araya(op, yeniAdim(tip))); }}>+ Araya adım</button>
                  <button type="button" className="tc-ib tc-ib-sil" onClick={() => degistir(sil(op))} aria-label={`OP ${op} sil`}>✕</button>
                </div>
              )}
            </div>
            <div className="tc-rflow-out">
              {adim.akis.cikti.tur === 'urun'
                ? <Cip tur="ana" urun={urun} baslik={urun.stokKodu ?? urun.ad} alt={urun.ad} miktar={a.miktar} birim={birimMetni(urun.stokBirimi)}
                    rozet={<span className="tc-kb tc-kb-ana">ana çıktı</span>} secili={false} sec={() => sec({ tur: 'urun', nid: d.nid, urunId: d.urunId })} />
                : <Cip tur="sonraki" arahal urun={urun} baslik={araHalAdi(urun, adim)} alt="sonraki adıma" miktar={sonraki?.adimMiktari ?? adim.adimMiktari}
                    birim={birimMetni(urun.stokBirimi)} rozet={null} secili={false} sec={() => sec({ tur: 'adim', nid: d.nid, urunId: d.urunId, opNo: op })} />}
              {adim.yanUrunler.map((y) => (
                <Cip key={y.malzeme.id} tur="yan" urun={y.malzeme} baslik={y.malzeme.stokKodu ?? y.malzeme.ad} alt={y.malzeme.ad} miktar={y.miktar}
                  birim={birimMetni(y.malzeme.stokBirimi)} rozet={<span className="tc-kb tc-kb-yan">yan ürün</span>} secili={seciliMi('yan', y.malzeme.id)}
                  sec={() => sec({ tur: 'yan', nid: d.nid, urunId: d.urunId, opNo: op, malzemeId: y.malzeme.id })} />
              ))}
              {duzen && <button type="button" className="tc-add" onClick={() => o.bilesenEkleAc(d.urunId, op, 'yan')}>+ Yan ürün</button>}
            </div>
          </div>
        );
      })}
      {duzen && (
        <div className="tc-rota-dugmeler">
          <button type="button" className="tc-add" disabled={!tip} onClick={() => { if (tip) degistir(araya(a.adimlar.at(-1)?.opNo ?? null, yeniAdim(tip))); }}>+ Adım ekle</button>
        </div>
      )}
    </section>
  );
}

// Her rota ayrı bölümdür; alt montajlar önce, kök en sonda (üretim sırası).
export function AkisTablosu(o: Ozellikler) {
  const sirali = [...o.dugumler].sort((x, y) => y.derinlik - x.derinlik);
  return (
    <div className="tc-rtab-wrap">
      {sirali.map((d) => {
        const a = o.ayrintilar.get(d.nid);
        return a ? <Bolum key={d.nid} d={d} a={a} o={o} /> : null;
      })}
    </div>
  );
}
