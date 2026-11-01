import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, miktar as miktarMetni } from '../bicim.ts';
import {
  adimArkasinaTasi, adimBirlesen, adimCarpani, adimDali, adimOnculleri, adimSil, adimSurukle, adimEkle, akisKarti, adimSuresi, bagimlilikYaz, fasonMu, kartBasligi, kartBirimi, sirali, sonrakiBagimlilik, statuNo,
  tuketilenAdimlar, turKisa, yeniAdim, type Adim, type Dugum, type Malzeme,
} from './kurallar.ts';
import { bagMetni, fasonAdi, renkSinifi, type RotaEkrani } from './ortak.tsx';
import { yeniKimlik } from './useRotaDuzeni.ts';

export const YAKINLIK = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200] as const;
type Yakinlik = (typeof YAKINLIK)[number];
// Genişliğe sığdırmada rotanın kenar ve üst payı (ekran pikseli, eski sayfanın değerleri).
const KENAR = 20;
const UST_PAY = 16;
// Vardiya düzeni okunamadığı için gün, günlük 8 saatle hesaplanır (bugünkü ekranın varsayılanı).

const uc = (nid: string, adimId: string) => `${nid}|${adimId}`;
// Sürüklenen şey: şemadaki adım ya da adım panelindeki operasyon.
export const SURUKLE_TURU = 'text/plain';
export const surukleAdim = (urunId: string, adimId: string) => `adim|${urunId}|${adimId}`;
export const surukleOp = (opId: string) => `op|${opId}`;
export function surukleCoz(v: string): { tur: 'adim'; urunId: string; adimId: string } | { tur: 'op'; opId: string } | null {
  const [t, a, b] = v.split('|');
  if (t === 'adim' && a && b) return { tur: 'adim', urunId: a, adimId: b };
  if (t === 'op' && a) return { tur: 'op', opId: a };
  return null;
}

// Bırakma şeridi, rota başlığı ve boş rota: operasyon `sonraId`nin ardına (null: başa) eklenir, aynı rotanın adımı oraya taşınır.
export function yereBirak(r: RotaEkrani, urunId: string, sonraId: string | null, v: string, miktar: number): void {
  r.surukleBitti();
  const s = surukleCoz(v);
  if (!s) return;
  if (s.tur === 'adim' && s.urunId === urunId) {
    r.duzen.degistir(urunId, (l) => adimArkasinaTasi(l, s.adimId, sonraId), 'Adım taşındı');
  } else if (s.tur === 'op') {
    const yeni = yeniAdim(r.duzen.h.op.get(s.opId), yeniKimlik());
    const l2 = adimEkle(r.duzen.adimlar(urunId), sonraId, yeni);
    if (r.duzen.degistir(urunId, () => l2, 'Adım eklendi')) {
      r.sec({ tur: 'adim', urunId, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar });
    }
  }
}

function BirakSeridi({ metin, birak, ek }: { metin: string; birak: (v: string) => void; ek?: string }) {
  const [ustunde, setUstunde] = useState(false);
  return (
    <div className={`tc-rr1-serit${ek ? ` ${ek}` : ''}${ustunde ? ' tc-rr1-serit-ustunde' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setUstunde(true); }} onDragLeave={() => { setUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setUstunde(false); birak(e.dataTransfer.getData(SURUKLE_TURU)); }}>
      <Simge ad="plus" boyut="k" /> {metin}
    </div>
  );
}

function Cip({ m, tur, baslik, alt, miktar, rozet, secili, besler, cikan, sec, arahal, ek, birim }: {
  m: Malzeme; tur: 'giren' | 'onceki' | 'sonraki' | 'ana' | 'yan'; baslik: string; alt: string; miktar: number; rozet: ReactNode;
  secili: boolean; besler?: string | undefined; cikan?: string | undefined; sec: () => void; arahal?: boolean; ek?: ReactNode; birim?: string;
}) {
  const dusuk = (m.min ?? 0) > 0 && m.stock !== null && m.stock < (m.min ?? 0);
  return (
    <span className="tc-rr1-cipw">
      <button
        type="button" className={`tc-rr1-cip tc-rr1-cip-${tur}${arahal ? ' tc-rr1-cip-arahal' : ''}${secili ? ' tc-rr1-secili' : ''}`}
        data-besler={besler} data-cikan={cikan} onClick={sec}
      >
        {arahal ? (
          <span className="tc-rr1-slot tc-rr1-slot-statu"><em>{turKisa(m.type)}</em><i className="tc-rr1-stmark">S</i></span>
        ) : (
          <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>
            {turKisa(m.type)}
            {dusuk && <i className="tc-rr1-dusuk" title="Minimum stoğun altında" />}
          </span>
        )}
        <span className="tc-rr1-ci"><b>{baslik}</b><small>{alt}</small>{rozet}{arahal && <span className="tc-rr1-kb tc-rr1-kb-st">statülü kart</span>}</span>
        <span className="tc-rr1-cq">{sayi(miktar)}<small>{birim ?? m.unit ?? ''}</small></span>
      </button>
      {ek}
    </span>
  );
}

// Dallı rotada (1248 a) akış oku sıradaki adıma değil, adımın öncüllerinden adıma çizilir: kutu öncüllerinin uçlarını taşır.
function OpKutusu({ r, a, d, sonraki, secili, duzen, sahip, liste, i, onculler }: {
  r: RotaEkrani; a: Adim; d: Dugum; sonraki: Adim | undefined; secili: boolean; duzen: boolean; sahip: Malzeme; liste: readonly Adim[]; i: number;
  onculler: readonly Adim[] | null;
}) {
  const [ustunde, setUstunde] = useState(false);
  const { h } = r.duzen;
  const op = h.op.get(a.opId);
  const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
  const im = ist ? h.isMerkezi.get(ist.wcId) : undefined;
  const fason = fasonMu(a);
  const miktar = d.adimlar[i]?.miktar ?? d.miktar;
  // Dal adımı bir mamul için çarpan kadar parça işler (1257 a); sunucunun teorik süresiyle aynı.
  const t = adimSuresi(a, miktar * adimCarpani(a), ist, r.gunSaati(ist?.wcId ?? null));
  const son = i === liste.length - 1;
  const kart = akisKarti(sahip.id, liste, i, r.duzen.malzemeVar);
  const kartAdi = kartBasligi(h.malzeme.get(kart.itemId), kart.adim, r.duzen.opAdi);
  const birak = (v: string) => {
    r.surukleBitti();
    const s = surukleCoz(v);
    if (!s) return;
    if (s.tur === 'adim' && s.urunId === sahip.id && s.adimId !== a.id) {
      r.duzen.degistir(sahip.id, (l) => adimSurukle(l, s.adimId, a.id), 'Adım taşındı');
    } else if (s.tur === 'op') {
      const yeni = yeniAdim(h.op.get(s.opId), yeniKimlik());
      const l2 = adimEkle(r.duzen.adimlar(sahip.id), a.id, yeni);
      if (r.duzen.degistir(sahip.id, () => l2, 'Adım eklendi')) {
        r.sec({ tur: 'adim', urunId: sahip.id, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar });
      }
    }
  };
  return (
    <button
      type="button"
      className={`tc-rr1-opbox ${ist ? renkSinifi(ist.id) : 'tc-rr1-renk-yok'}${secili ? ' tc-rr1-secili' : ''}${ustunde ? ' tc-rr1-birak' : ''}`}
      data-uc={uc(d.nid, a.id)} data-sonraki={onculler === null && sonraki ? uc(d.nid, sonraki.id) : undefined} data-bag={onculler === null ? sonraki?.dep : a.dep}
      data-onculler={onculler === null ? undefined : onculler.map((o) => uc(d.nid, o.id)).join(' ')}
      draggable={duzen}
      onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleAdim(sahip.id, a.id)); e.dataTransfer.effectAllowed = 'move'; r.surukleBasla(); }}
      onDragEnd={r.surukleBitti}
      onDragOver={(e) => { if (duzen) { e.preventDefault(); setUstunde(true); } }}
      onDragLeave={() => { setUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setUstunde(false); if (duzen) birak(e.dataTransfer.getData(SURUKLE_TURU)); }}
      onClick={() => { r.sec({ tur: 'adim', urunId: sahip.id, adimId: a.id, seq: a.seq, miktar }); }}
      aria-label={`OP ${String(statuNo(a))} ${op?.name ?? 'Operasyon seç'}`}
    >
      <span className="tc-rr1-obar"><span className="tc-rr1-abbr">{op?.abbr ?? op?.code ?? '???'}</span><span className="tc-rr1-oseq">{statuNo(a)}</span></span>
      <b className="tc-rr1-oname">{op?.name ?? 'Operasyon seç'}</b>
      <span className="tc-rr1-ost">
        {fason ? `Dış üretim: ${fasonAdi(r.duzen.durum.fasonFirms, a.fasonId)}` : ist ? `${ist.code} ${ist.name}` : 'İstasyon seçilmedi'}
        {im && <em> {im.code}</em>}
      </span>
      <span className="tc-rr1-otime">
        {fason ? `Termin ${a.terminGun !== null && a.terminGun > 0 ? `${String(a.terminGun)} gün` : 'girilmedi'}`
          : t ? `${sayi(Math.round((t.dk / 60) * 10) / 10)} sa, ${sayi(Math.round(t.gun * 100) / 100)} gün` : 'Süre yok'}
        {a.rejectPct > 0 && `, ret %${sayi(a.rejectPct)}`}
      </span>
      <span className="tc-rr1-ostat2">→ <b className={son ? undefined : 'tc-rr1-stx'}>{son ? sahip.code : kartAdi}</b>{son ? ' (ürün)' : ' (statülü)'}</span>
      {a.alts.length > 0 && (
        <span className="tc-rr1-oalt">Alternatif: {[a.stationId, ...a.alts].map((x) => (x ? h.istasyon.get(x)?.code : undefined)).filter(Boolean).join(' / ')}</span>
      )}
    </button>
  );
}

function Kolon({ r, d, ust, kok }: { r: RotaEkrani; d: Dugum; ust: string | null; kok: boolean }) {
  const [basUstunde, setBasUstunde] = useState(false);
  const { h } = r.duzen;
  const m = h.malzeme.get(d.id);
  if (!m) return null;
  const duzen = r.duzen.duzenlenebilir(d.id);
  const V = r.duzen.gorulen(d.id);
  const liste = sirali(r.duzen.adimlar(d.id));
  const onculler = adimOnculleri(liste);
  // Şerit: ana hat 0, dallar ilk göründükleri sırayla 1, 2...; dallı olmayan rotada şerit yoktur.
  const dallar = [...new Set(liste.flatMap((x) => adimDali(x) ?? []))];
  const serit = (x: Adim): number => { const dl = adimDali(x); return dl === null ? 0 : dallar.indexOf(dl) + 1; };
  const s = r.secim;
  const basSecili = s?.tur === 'urun' && s.nid === d.nid;
  // Başa bırakma yalnız adımı olan düzenlenebilir rotada; boş rotanın kendi bırakma kutusu vardır.
  const basaBirak = duzen && r.surukleniyor && liste.length > 0;
  const anaCip = (besler: string | undefined, cikan: string | undefined) => (
    <Cip m={m} tur="ana" baslik={m.code} alt={m.name} miktar={d.miktar} secili={basSecili} besler={besler} cikan={cikan}
      rozet={<span className="tc-rr1-kb tc-rr1-kb-ana">{ust ? 'Çıktı, üst akışa' : 'Ana çıktı'}</span>}
      sec={() => { r.sec({ tur: 'urun', urunId: d.id, nid: d.nid, miktar: d.miktar }); }} />
  );
  return (
    <div className={`tc-rr1-rcol ${kok ? 'tc-rr1-rcol-kok' : 'tc-rr1-rcol-alt'}`}>
      <div className="tc-rr1-g3">
        <div className="tc-rr1-cin" />
        <div className="tc-rr1-cop">
          <div className="tc-rr1-rhd-wrap">
            {!kok && (
              <button type="button" className="tc-rr1-ib" onClick={() => { r.kapaliDegistir(d.nid); }} aria-label="Alt akışı gizle">
                <Simge ad="chev-left" boyut="k" />
              </button>
            )}
            <button type="button" className={`tc-rr1-rhd${basSecili ? ' tc-rr1-secili' : ''}${basaBirak && basUstunde ? ' tc-rr1-birak' : ''}`}
              onClick={() => { r.sec({ tur: 'urun', urunId: d.id, nid: d.nid, miktar: d.miktar }); }}
              onDragOver={(e) => { if (basaBirak) { e.preventDefault(); setBasUstunde(true); } }} onDragLeave={() => { setBasUstunde(false); }}
              onDrop={(e) => { e.preventDefault(); setBasUstunde(false); if (basaBirak) yereBirak(r, d.id, null, e.dataTransfer.getData(SURUKLE_TURU), d.miktar); }}>
              <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span>
              <span className="tc-rr1-ci">
                <b>{m.code} rotası {V && <span className={`tc-rr1-rvchip tc-rr1-rv-${V.status}`}>Rev {V.no}</span>}{r.duzen.taslakVar(d.id) && <span className="tc-rr1-rvchip tc-rr1-rv-taslak">kaydediliyor</span>}</b>
                <small>{basaBirak ? 'Başa eklemek için buraya bırak' : m.name}</small>
              </span>
              <span className="tc-rr1-cq">{miktarMetni(d.miktar, m.unit)}</span>
            </button>
          </div>
        </div>
        <div className="tc-rr1-cout" />
        {d.dongu && (
          <>
            <div className="tc-rr1-cin" />
            <div className="tc-rr1-cop"><div className="tc-rr1-noroute">Döngü: {m.code} kendi akışında tekrar geçiyor</div></div>
            <div className="tc-rr1-cout" />
          </>
        )}
        {d.adimlar.map((sn, i) => {
          const a = sn.a;
          const anahtar = uc(d.nid, a.id);
          const sonraki = d.adimlar[i + 1]?.a;
          const son = i === d.adimlar.length - 1;
          const kart = son ? null : akisKarti(d.id, liste, i, r.duzen.malzemeVar);
          const secili = (tur: 'adim' | 'giren' | 'yan', sira?: number) => s !== null && s.tur === tur && 'adimId' in s && s.adimId === a.id && s.urunId === d.id
            && (sira === undefined || ('sira' in s && s.sira === sira));
          const onceki = tuketilenAdimlar(liste, i);
          const oncul = onculler[liste.indexOf(a)] ?? null;
          return [
            <div key={`i${a.id}`} className="tc-rr1-cin">
              {onceki.map((p) => {
                const k = akisKarti(d.id, liste, liste.indexOf(p), r.duzen.malzemeVar);
                const km = h.malzeme.get(k.itemId);
                return km ? (
                  <Cip key={`f${p.id}`} m={km} tur="onceki" arahal birim={kartBirimi(km, k.adim)} baslik={kartBasligi(km, k.adim, r.duzen.opAdi)} alt={`${km.code} ${km.name}`} miktar={sn.miktar}
                    rozet={<span className="tc-rr1-kb tc-rr1-kb-in">önceki adımdan, tüketilir</span>} besler={anahtar} secili={false}
                    sec={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: p.id, seq: p.seq, miktar: sn.miktar }); }} />
                ) : null;
              })}
              {sn.girenler.map(({ x, sira, dugum }) => {
                const gm = h.malzeme.get(x.itemId);
                if (!gm) return null;
                const akisli = dugum.adimlar.length > 0 && !dugum.dongu;
                if (akisli && !r.kapali.has(dugum.nid)) {
                  return <div key={`g${String(sira)}`} className="tc-rr1-subwrap"><Kolon r={r} d={dugum} ust={anahtar} kok={false} /></div>;
                }
                return (
                  <Cip key={`g${String(sira)}`} m={gm} tur="giren" baslik={gm.code} alt={gm.name} miktar={dugum.miktar} besler={anahtar}
                    rozet={x.scrap > 0 ? <span className="tc-rr1-kb">fire %{sayi(x.scrap)}</span> : null} secili={secili('giren', sira)}
                    sec={() => { r.sec({ tur: 'giren', urunId: d.id, adimId: a.id, sira, nid: dugum.nid, miktar: dugum.miktar }); }}
                    ek={akisli ? (
                      <button type="button" className="tc-rr1-exp" onClick={() => { r.kapaliDegistir(dugum.nid); }} aria-label={`${gm.code} alt akışını göster`}>
                        <Simge ad="chev-right" boyut="k" /> akış
                      </button>
                    ) : null} />
                );
              })}
              {duzen && (
                <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'girenEkle', urunId: d.id, adimId: a.id, yerine: null }); }}>
                  <Simge ad="plus" boyut="k" /> Giren
                </button>
              )}
            </div>,
            <div key={`o${a.id}`} className={`tc-rr1-cop${oncul ? ` tc-rr1-dalserit tc-rr1-dalserit-${String(Math.min(serit(a), 7))}` : ''}`}>
              {oncul && (
                <span className="tc-rr1-daletiket">
                  <Simge ad={adimBirlesen(a).length > 0 ? 'layers' : 'route'} boyut="k" />
                  {adimDali(a) === null ? 'Ana hat' : `Dal ${adimDali(a) ?? ''}`}
                  {adimDali(a) !== null && adimCarpani(a) > 1 && <em> 1 mamul için {String(adimCarpani(a))} adet</em>}
                  {adimBirlesen(a).length > 0 && <em> birleşir: {adimBirlesen(a).join(', ')}</em>}
                </span>
              )}
              {i > 0 && oncul?.length !== 0 && (
                <button
                  type="button" className={`tc-rr1-deppill tc-rr1-dep-${a.dep}`} disabled={!duzen}
                  title="Önceki adımla ilişki: dokununca değişir (bağımlı → örtülü → bağımsız)"
                  onClick={() => { r.duzen.degistir(d.id, (l) => l.map((x) => (x.id === a.id ? bagimlilikYaz(x, sonrakiBagimlilik(x.dep)) : x)), 'Bağlılık değişti'); }}
                >{bagMetni(a)}</button>
              )}
              <OpKutusu r={r} a={a} d={d} sonraki={sonraki} secili={secili('adim')} duzen={duzen} sahip={m} liste={liste} i={i} onculler={oncul} />
              {duzen && r.surukleniyor && (
                <BirakSeridi metin={`Bırak: OP ${String(statuNo(a))} ardına`} birak={(v) => { yereBirak(r, d.id, a.id, v, sn.miktar); }} />
              )}
              {duzen && !r.surukleniyor && (
                <div className="tc-rr1-stepbar">
                  <button type="button" className="tc-rr1-ib" disabled={i === 0} title="Yukarı taşı (Alt+Shift+↑)" aria-label={`OP ${String(statuNo(a))} yukarı taşı`}
                    onClick={() => { const p = liste[i - 1]; if (p) r.duzen.degistir(d.id, (l) => adimSurukle(l, a.id, p.id), 'Adım yukarı taşındı'); }}>
                    <Simge ad="up" boyut="k" />
                  </button>
                  <button type="button" className="tc-rr1-ib" disabled={son} title="Aşağı taşı (Alt+Shift+↓)" aria-label={`OP ${String(statuNo(a))} aşağı taşı`}
                    onClick={() => { const n = liste[i + 1]; if (n) r.duzen.degistir(d.id, (l) => adimSurukle(l, a.id, n.id), 'Adım aşağı taşındı'); }}>
                    <Simge ad="down" boyut="k" />
                  </button>
                  <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: a.id, seq: a.seq, miktar: sn.miktar }); r.paletAc(); }}>
                    <Simge ad="plus" boyut="k" /> {son ? 'Adım ekle' : 'Araya adım'}
                  </button>
                  <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" title="Adımı sil" aria-label={`OP ${String(statuNo(a))} sil`}
                    onClick={() => { r.duzen.degistir(d.id, (l) => adimSil(l, a.id), `OP ${String(statuNo(a))} silindi`); }}>
                    <Simge ad="trash" boyut="k" />
                  </button>
                </div>
              )}
            </div>,
            <div key={`c${a.id}`} className="tc-rr1-cout">
              {son ? anaCip(ust ?? undefined, anahtar) : (() => {
                const km = kart ? h.malzeme.get(kart.itemId) : undefined;
                return km && kart ? (
                  <Cip m={km} tur="sonraki" arahal birim={kartBirimi(km, kart.adim)} baslik={kartBasligi(km, kart.adim, r.duzen.opAdi)} alt={`${km.code} ${km.name}`}
                    miktar={sn.miktar * (1 - Math.min(0.95, a.rejectPct / 100))} cikan={anahtar} secili={false}
                    rozet={<span className="tc-rr1-kb tc-rr1-kb-ana">sonraki adıma</span>}
                    sec={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: a.id, seq: a.seq, miktar: sn.miktar }); }} />
                ) : null;
              })()}
              {sn.yanlar.map(({ y, sira, miktar }) => {
                const ym = h.malzeme.get(y.itemId);
                return ym ? (
                  <Cip key={`y${String(sira)}`} m={ym} tur="yan" baslik={ym.code} alt={ym.name} miktar={miktar} cikan={anahtar}
                    rozet={<span className="tc-rr1-kb tc-rr1-kb-yan">yan ürün</span>} secili={secili('yan', sira)}
                    sec={() => { r.sec({ tur: 'yan', urunId: d.id, adimId: a.id, sira, nid: d.nid, miktar }); }} />
                ) : null;
              })}
              {duzen && (
                <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'yanEkle', urunId: d.id, adimId: a.id, yerine: null }); }}>
                  <Simge ad="plus" boyut="k" /> Yan ürün
                </button>
              )}
            </div>,
          ];
        })}
        {!d.dongu && d.adimlar.length === 0 && (
          <>
            <div className="tc-rr1-cin" />
            <div className="tc-rr1-cop">
              {duzen && r.surukleniyor
                ? <BirakSeridi ek="tc-rr1-serit-bos" metin="Operasyonu buraya bırak: ilk adım" birak={(v) => { yereBirak(r, d.id, null, v, d.miktar); }} />
                : <div className="tc-rr1-noroute">Rota yok. İlk adımı ekle{duzen ? ': paletten sürükle ya da dokun' : ''}.</div>}
              {duzen && !r.surukleniyor && (
                <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'adimEkle', urunId: d.id, sonraId: null }); r.paletAc(); }}>
                  <Simge ad="plus" boyut="k" /> Adım ekle
                </button>
              )}
            </div>
            <div className="tc-rr1-cout">{ust && anaCip(ust, undefined)}</div>
          </>
        )}
      </div>
    </div>
  );
}

interface Kenar { d: string; tur: 'ef' | 'ef-ortulu' | 'ef-bagimsiz' | 'ei' | 'eo' }

// Kenarlar kutuların gerçek yerinden ölçülür; koordinatlar yakınlaştırılmamış içerik birimindedir (SVG içerikle ölçeklenir).
function kenarlariOlc(ic: HTMLElement, olcek: number): { kenarlar: Kenar[]; en: number; boy: number } {
  const kok = ic.getBoundingClientRect();
  const kutu = (el: Element) => {
    const b = el.getBoundingClientRect();
    return { x: (b.left - kok.left) / olcek, y: (b.top - kok.top) / olcek, w: b.width / olcek, h: b.height / olcek };
  };
  const uclar = new Map<string, Element>();
  ic.querySelectorAll('[data-uc]').forEach((el) => { uclar.set(el.getAttribute('data-uc') ?? '', el); });
  const kenarlar: Kenar[] = [];
  const egri = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(24, (x2 - x1) / 2);
    return `M${String(x1)},${String(y1)} C${String(x1 + dx)},${String(y1)} ${String(x2 - dx)},${String(y2)} ${String(x2)},${String(y2)}`;
  };
  uclar.forEach((el) => {
    const hedef = uclar.get(el.getAttribute('data-sonraki') ?? '');
    if (!hedef) return;
    const a = kutu(el); const b = kutu(hedef);
    const bag = el.getAttribute('data-bag');
    kenarlar.push({
      d: `M${String(a.x + a.w / 2)},${String(a.y + a.h)} L${String(b.x + b.w / 2)},${String(b.y)}`,
      tur: bag === 'ortulu' ? 'ef-ortulu' : bag === 'bagimsiz' ? 'ef-bagimsiz' : 'ef',
    });
  });
  ic.querySelectorAll('[data-onculler]').forEach((el) => {
    const b = kutu(el);
    const bag = el.getAttribute('data-bag');
    const idler = (el.getAttribute('data-onculler') ?? '').split(' ');
    for (const id of idler) {
      const kaynak = uclar.get(id);
      if (!kaynak) continue;
      const a = kutu(kaynak);
      // Hemen üstteki öncül düz okla; aradaki kutuların üstünden geçmesin diye uzaktaki öncül kutuların solundan eğriyle bağlanır.
      const bitisik = kaynak.closest('.tc-rr1-cop')?.nextElementSibling?.nextElementSibling?.nextElementSibling === el.closest('.tc-rr1-cop');
      kenarlar.push({
        d: bitisik
          ? `M${String(a.x + a.w / 2)},${String(a.y + a.h)} L${String(b.x + b.w / 2)},${String(b.y)}`
          : `M${String(a.x + a.w / 4)},${String(a.y + a.h)} C${String(a.x - 40)},${String(a.y + a.h + 60)} ${String(b.x - 40)},${String(b.y - 60)} ${String(b.x + b.w / 4)},${String(b.y)}`,
        tur: bag === 'ortulu' ? 'ef-ortulu' : 'ef',
      });
    }
  });
  ic.querySelectorAll('[data-besler]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-besler') ?? '');
    if (!op) return;
    const a = kutu(el); const b = kutu(op);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'ei' });
  });
  ic.querySelectorAll('[data-cikan]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-cikan') ?? '');
    if (!op) return;
    const a = kutu(op); const b = kutu(el);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'eo' });
  });
  return { kenarlar, en: kok.width / olcek, boy: kok.height / olcek };
}

export function AkisSemasi({ r, kok, tamEkran, tamEkranDegistir, cop }: {
  r: RotaEkrani; kok: Dugum; tamEkran: boolean; tamEkranDegistir: () => void; cop: ReactNode;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const ic = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<Yakinlik>(100);
  const [yardim, setYardim] = useState(false);
  const [cizim, setCizim] = useState<{ kenarlar: Kenar[]; en: number; boy: number }>({ kenarlar: [], en: 0, boy: 0 });
  const capa = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const surukle = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const dokundu = useRef<string | null>(null);

  const sonCizim = useRef('');
  // Ölçü değişmediyse durum yazılmaz: her çizim yeni nesne üretir, koşulsuz yazmak sonsuz döngü olur.
  const olc = useCallback(() => {
    if (!ic.current) return;
    const yeni = kenarlariOlc(ic.current, z / 100);
    const imza = JSON.stringify(yeni);
    if (imza !== sonCizim.current) { sonCizim.current = imza; setCizim(yeni); }
  }, [z]);
  useLayoutEffect(() => {
    olc();
    const c = capa.current; const v = vp.current;
    if (c && v) { v.scrollLeft = c.cx * (z / 100) - c.x; v.scrollTop = c.cy * (z / 100) - c.y; capa.current = null; }
  });
  useEffect(() => {
    if (!ic.current || typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(() => { olc(); });
    g.observe(ic.current);
    return () => { g.disconnect(); };
  }, [olc]);

  const yakinlas = useCallback((yon: 1 | -1, nokta?: { x: number; y: number }) => {
    const v = vp.current; if (!v) return;
    dokundu.current = kok.id;
    const i = YAKINLIK.indexOf(z);
    const yeni = YAKINLIK[Math.min(YAKINLIK.length - 1, Math.max(0, i + yon))] ?? z;
    if (yeni === z) return;
    const p = nokta ?? { x: v.clientWidth / 2, y: v.clientHeight / 2 };
    capa.current = { x: p.x, y: p.y, cx: (v.scrollLeft + p.x) / (z / 100), cy: (v.scrollTop + p.y) / (z / 100) };
    setZ(yeni);
  }, [z, kok.id]);

  // Sığdır: tüm kipte kök rota görünür alana ortalanır. Genişlik kipi eski sayfanın açılışıdır: yakınlık genişliğe göre seçilir
  // ama okunurluk için %80'in altına inmez (dar ekranda daha da küçülür); rota sığarsa yatay ortalanır, sığmazsa soldan başlar; üstten başlar.
  const sigdir = useCallback((yalnizGenislik: boolean) => {
    const v = vp.current; const i = ic.current;
    const hedef = i?.querySelector('.tc-rr1-rcol-kok');
    if (!v || !i || !hedef) return;
    const olcek = z / 100;
    const ir = i.getBoundingClientRect(); const hr = hedef.getBoundingClientRect();
    const x = (hr.left - ir.left) / olcek; const y = (hr.top - ir.top) / olcek; const w = hr.width / olcek; const hh = hr.height / olcek;
    if (w === 0) return;
    const vr = v.getBoundingClientRect();
    const en = Math.max(100, vr.width); const boy = Math.max(100, vr.height);
    const oran = yalnizGenislik
      ? Math.max(Math.min(80, (en / 700) * 100), Math.min(100, ((en - KENAR * 2) / w) * 100))
      : Math.min(en / w, boy / hh, 1) * 95;
    const yeni = [...YAKINLIK].reverse().find((t) => t <= oran) ?? 30;
    const sigar = w * (yeni / 100) <= en - KENAR * 2;
    const nokta = { x: yalnizGenislik && !sigar ? KENAR : en / 2, y: yalnizGenislik ? UST_PAY : boy / 2 };
    const merkez = { cx: yalnizGenislik && !sigar ? x : x + w / 2, cy: yalnizGenislik ? y : y + hh / 2 };
    if (yeni === z) { v.scrollLeft = merkez.cx * olcek - nokta.x; v.scrollTop = merkez.cy * olcek - nokta.y; return; }
    capa.current = { ...nokta, ...merkez };
    setZ(yeni);
  }, [z]);

  // Açılışta ve kök değişince eski sayfadaki gibi genişliğe sığdırılır; kullanıcı yakınlaştırınca ya da gezinince görünüm korunur.
  useEffect(() => {
    if (cizim.en === 0 || dokundu.current === kok.id) return;
    sigdir(true);
  }, [kok.id, cizim.en, cizim.boy, sigdir]);
  const elle = () => { dokundu.current = kok.id; };

  useEffect(() => {
    const v = vp.current; if (!v) return undefined;
    let son = 0;
    const tekerlek = (o: WheelEvent) => {
      o.preventDefault();
      // Dokunmatik yüzey bir harekette çok olay yollar; kısa aralıklar yok sayılır.
      const simdi = performance.now();
      if (Math.abs(o.deltaY) < 1 || simdi - son < 70) return;
      son = simdi;
      const b = v.getBoundingClientRect();
      yakinlas(o.deltaY < 0 ? 1 : -1, { x: o.clientX - b.left, y: o.clientY - b.top });
    };
    v.addEventListener('wheel', tekerlek, { passive: false });
    return () => { v.removeEventListener('wheel', tekerlek); };
  }, [yakinlas]);

  const tus = (o: KeyboardEvent<HTMLDivElement>) => {
    const v = vp.current; if (!v || (o.target as HTMLElement).closest('input, select, textarea')) return;
    if (o.altKey || o.ctrlKey || o.metaKey) return;
    const adim = o.shiftKey ? 240 : 60;
    const harita: Record<string, () => void> = {
      ArrowLeft: () => { v.scrollLeft -= adim; }, ArrowRight: () => { v.scrollLeft += adim; },
      ArrowUp: () => { v.scrollTop -= adim; }, ArrowDown: () => { v.scrollTop += adim; },
      '+': () => { yakinlas(1); }, '=': () => { yakinlas(1); }, '-': () => { yakinlas(-1); }, '0': () => { sigdir(false); }, Home: () => { sigdir(true); },
      f: tamEkranDegistir, F: tamEkranDegistir,
    };
    const is = harita[o.key];
    if (is) { o.preventDefault(); elle(); is(); }
  };

  const basla = (o: PointerEvent<HTMLDivElement>) => {
    elle();
    if ((o.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    const v = vp.current; if (!v) return;
    surukle.current = { x: o.clientX, y: o.clientY, sl: v.scrollLeft, st: v.scrollTop };
    v.setPointerCapture(o.pointerId);
  };
  const tasima = (o: PointerEvent<HTMLDivElement>) => {
    const s = surukle.current; const v = vp.current; if (!s || !v) return;
    v.scrollLeft = s.sl - (o.clientX - s.x);
    v.scrollTop = s.st - (o.clientY - s.y);
  };
  const birak = () => { surukle.current = null; };

  return (
    <div className="tc-rr1-canvas-kap">
      <div
        ref={vp} className="tc-rr1-canvas" tabIndex={0} role="group"
        aria-label="Akış şeması. Tekerlek yakınlaştırır, sürükleyerek gezersin, ok tuşları kaydırır."
        onKeyDown={tus} onPointerDown={basla} onPointerMove={tasima} onPointerUp={birak} onPointerCancel={birak}
      >
        <div ref={ic} className={`tc-rr1-inner tc-rr1-z-${String(z)}`}>
          <svg className="tc-rr1-edges" width={cizim.en} height={cizim.boy} aria-hidden="true">
            <defs>
              <marker id="tc-rr1-ok-f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path className="tc-rr1-mf" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-rr1-ok-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-rr1-mi" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-rr1-ok-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-rr1-mo" d="M0,0 L10,5 L0,10 z" /></marker>
            </defs>
            {cizim.kenarlar.map((k, i) => (
              <path key={i} d={k.d} className={`tc-rr1-e-${k.tur}`}
                markerEnd={k.tur.startsWith('ef') ? 'url(#tc-rr1-ok-f)' : k.tur === 'ei' ? 'url(#tc-rr1-ok-i)' : 'url(#tc-rr1-ok-o)'} />
            ))}
          </svg>
          <Kolon r={r} d={kok} ust={null} kok />
        </div>
      </div>
      {cop}
      <div className="tc-rr1-cv-ctrl" role="group" aria-label="Görünüm">
        <button type="button" className="tc-rr1-ib" onClick={() => { yakinlas(1); }} title="Yakınlaştır (+)" aria-label="Yakınlaştır"><Simge ad="zin" boyut="k" /></button>
        <span className="tc-rr1-zl">{z}%</span>
        <button type="button" className="tc-rr1-ib" onClick={() => { yakinlas(-1); }} title="Uzaklaştır (−)" aria-label="Uzaklaştır"><Simge ad="zout" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" onClick={() => { elle(); sigdir(false); }} title="Tümünü sığdır (0)" aria-label="Tümünü sığdır"><Simge ad="fit" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" onClick={() => { elle(); sigdir(true); }} title="Genişliğe sığdır, başa git (Home)" aria-label="Genişliğe sığdır"><Simge ad="first" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" aria-pressed={tamEkran} onClick={tamEkranDegistir} title="Tam ekran (F)" aria-label="Tam ekran"><Simge ad="expand" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" aria-pressed={yardim} onClick={() => { setYardim(!yardim); }} title="Gezinme yardımı" aria-label="Gezinme yardımı"><Simge ad="help" boyut="k" /></button>
      </div>
      {yardim && (
        <div className="tc-rr1-cv-help">
          <b>Gezinme</b>
          <ul>
            <li><b>Tekerlek:</b> imlecin olduğu yere yakınlaştırır ya da uzaklaştırır.</li>
            <li><b>Sürükle:</b> boş alanı tutup çek. Dokunmatik yüzeyde iki parmak hareketi de yakınlaştırır.</li>
            <li><b>Klavye:</b> oklar kaydırır (Shift ile hızlı), + / − yakınlaştırır, 0 tümünü sığdırır, Home başa döner.</li>
            <li><b>Adım:</b> Alt+↑/↓ önceki/sonraki adım, Alt+Shift+↑/↓ adımı taşır, Ctrl+Z / Ctrl+Y geri al / yinele.</li>
            <li><b>Taşıma:</b> operasyon kutusunu başka bir adımın üstüne sürükle; aşağı taşırken onun altına, yukarı taşırken üstüne yerleşir.</li>
          </ul>
        </div>
      )}
      <div className="tc-rr1-cv-legend" aria-hidden="true">
        <span><i className="tc-rr1-lg tc-rr1-lg-in" />Giren</span>
        <span><i className="tc-rr1-lg tc-rr1-lg-st" />Statülü kart</span>
        <span><i className="tc-rr1-lg tc-rr1-lg-flow" />Rota akışı</span>
        <span><i className="tc-rr1-lg tc-rr1-lg-out" />Çıkan</span>
      </div>
    </div>
  );
}
