import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, miktar as miktarMetni } from '../bicim.ts';
import {
  adimArkasinaTasi, adimBirlesen, adimCarpani, adimDali, adimOnculleri, adimSil, adimSurukle, kolaEkle, akisKarti, adimSuresi, bagimlilikYaz, fasonMu, kartBasligi, kartBirimi, sirali, sonrakiBagimlilik, statuNo, adimAdi,
  tuketilenAdimlar, turKisa, yeniAdim, type Adim, type Dugum, type Malzeme,
} from './kurallar.ts';
import { dalBilgileri, dalCarpaniYaz, dalYerlesimi, islemSuresiBos, kolaTasi, type DalBilgisi } from './kurallar.ts';
import { bagMetni, fasonAdi, renkSinifi, SayiAlani, type RotaEkrani } from './ortak.tsx';
import { yeniKimlik } from './useRotaDuzeni.ts';

export const YAKINLIK = [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200] as const;
type Yakinlik = (typeof YAKINLIK)[number];
// Genişliğe sığdırmada rotanın kenar ve üst payı (ekran pikseli, eski sayfanın değerleri).
const KENAR = 20;
const UST_PAY = 16;
// Dal çizgisinin yatay rayı satır aralığının içindedir: satır kenarından uzaklığı ve köşe yuvarlaması (içerik birimi).
const RAY = 14;
const BANT = 10;
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
    r.duzen.tasi(urunId, (l) => adimArkasinaTasi(l, s.adimId, sonraId), 'Adım taşındı');
  } else if (s.tur === 'op') {
    const yeni = yeniAdim(r.duzen.h.op.get(s.opId), yeniKimlik());
    const l2 = kolaEkle(r.duzen.adimlar(urunId), sonraId, yeni);
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
function OpKutusu({ r, a, d, sonraki, secili, duzen, sahip, liste, i, onculler, catal, serit }: {
  r: RotaEkrani; a: Adim; d: Dugum; sonraki: Adim | undefined; secili: boolean; duzen: boolean; sahip: Malzeme; liste: readonly Adim[]; i: number;
  onculler: readonly Adim[] | null; catal: boolean; serit: number;
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
      r.duzen.tasi(sahip.id, (l) => adimSurukle(l, s.adimId, a.id), 'Adım taşındı');
    } else if (s.tur === 'op') {
      const yeni = yeniAdim(h.op.get(s.opId), yeniKimlik());
      const l2 = kolaEkle(r.duzen.adimlar(sahip.id), a.id, yeni);
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
      data-onculler={onculler === null ? undefined : onculler.map((o) => uc(d.nid, o.id)).join(' ')} data-catal={catal ? '' : undefined} data-serit={serit > 0 ? String(Math.min(serit, 7)) : undefined} data-dal={adimDali(a) ?? undefined}
      draggable={duzen}
      onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleAdim(sahip.id, a.id)); e.dataTransfer.effectAllowed = 'move'; r.surukleBasla(); }}
      onDragEnd={r.surukleBitti}
      onDragOver={(e) => { if (duzen) { e.preventDefault(); setUstunde(true); } }}
      onDragLeave={() => { setUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setUstunde(false); if (duzen) birak(e.dataTransfer.getData(SURUKLE_TURU)); }}
      onClick={() => { r.sec({ tur: 'adim', urunId: sahip.id, adimId: a.id, seq: a.seq, miktar }); }}
      onDoubleClick={() => { r.odakla({ urunId: sahip.id, adimId: a.id }); }}
      aria-label={`${adimAdi(a)} ${op?.name ?? 'Operasyon seç'}`}
    >
      <span className="tc-rr1-obar"><span className="tc-rr1-abbr">{op?.abbr ?? op?.code ?? '???'}</span><span className="tc-rr1-oseq" title={a.opNo === null ? 'Yeni adım; numarayı sistem kayıtta verir' : undefined}>{a.opNo ?? 'yeni'}</span></span>
      <b className="tc-rr1-oname">{op?.name ?? 'Operasyon seç'}</b>
      <span className="tc-rr1-ost">
        {fason ? <>Dış üretim: {a.fasonId ? fasonAdi(r.duzen.durum.fasonFirms, a.fasonId) : <b>firma seçilmedi</b>}</> : ist ? `${ist.code} ${ist.name}` : 'İstasyon seçilmedi'}
        {im && <em> {im.code}</em>}
      </span>
      <span className="tc-rr1-otime">
        {fason ? `Termin ${a.terminGun !== null && a.terminGun > 0 ? `${String(a.terminGun)} gün` : 'girilmedi'}`
          : t ? `${sayi(Math.round((t.dk / 60) * 10) / 10)} sa, ${sayi(Math.round(t.gun * 100) / 100)} gün` : islemSuresiBos(a) ? 'Süre yok' : 'Süre hesaplanmadı: istasyon yok'}
        {a.rejectPct > 0 && `, ret %${sayi(a.rejectPct)}`}
      </span>
      <span className="tc-rr1-ostat2">→ <b className={son ? undefined : 'tc-rr1-stx'}>{son ? sahip.code : kartAdi}</b>{son ? ' (ürün)' : <>{' '}<span className="tc-rr1-kb tc-rr1-kb-st">Statülü</span></>}</span>
      {a.alts.length > 0 && (
        <span className="tc-rr1-oalt">Alternatif: {[a.stationId, ...a.alts].map((x) => (x ? h.istasyon.get(x)?.code : undefined)).filter(Boolean).join(' / ')}</span>
      )}
    </button>
  );
}

// 3188: dalın başlığı ilk adımının üstünde kısa etikettir: dalın adı, çarpanı (D) ve bırakma yeri. Sürüklenen adım o dala geçer, paletten
// bırakılan operasyon dalın sonuna eklenir. Dalın nereden ayrılıp nerede birleştiğini çizgi gösterir.
function DalBasligi({ r, d, b, duzen, saat, enUzun }: { r: RotaEkrani; d: Dugum; b: DalBilgisi; duzen: boolean; saat: number | null; enUzun: boolean }) {
  const [ustunde, setUstunde] = useState(false);
  const sonId = b.adimlar.at(-1)?.id ?? '';
  const birak = (v: string) => {
    r.surukleBitti();
    const c = surukleCoz(v);
    if (!c) return;
    if (c.tur === 'adim' && c.urunId === d.id) {
      r.duzen.tasi(d.id, (l) => kolaTasi(l, c.adimId, b.dal, sonId), `Adım Dal ${b.dal} koluna taşındı`);
    } else if (c.tur === 'op') {
      const yeni = yeniAdim(r.duzen.h.op.get(c.opId), yeniKimlik());
      const l2 = kolaEkle(r.duzen.adimlar(d.id), sonId, yeni, b.dal);
      if (r.duzen.degistir(d.id, () => l2, `Adım Dal ${b.dal} koluna eklendi`)) {
        r.sec({ tur: 'adim', urunId: d.id, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar: d.miktar });
      }
    }
  };
  return (
    <div className={`tc-rr1-kolbas${ustunde ? ' tc-rr1-birak' : ''}`} role="group" aria-label={`Dal ${b.dal} kolu`}
      onDragOver={(e) => { if (duzen && r.surukleniyor) { e.preventDefault(); setUstunde(true); } }} onDragLeave={() => { setUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setUstunde(false); if (duzen) birak(e.dataTransfer.getData(SURUKLE_TURU)); }}>
      <span className="tc-rr1-koletiket"><Simge ad="route" boyut="k" />Dal {b.dal}</span>
      <small className="tc-rr1-kolozet">{String(b.adimlar.length)} adım{saat !== null && `, ${sayi(Math.round(saat * 10) / 10)} sa`}</small>
      {enUzun && <small className="tc-rr1-kolenuzun" title="Birleşen dallar içinde en uzun süren; birleştiren adım bu dalı bekler"><Simge ad="clock" boyut="k" />en uzun</small>}
      {duzen ? (
        <div className="tc-rr1-kolcarpan">
          <small aria-hidden="true">1 mamul için</small>
          <SayiAlani etiket={`Dal ${b.dal}: 1 mamul için adet`} deger={b.carpan ?? adimCarpani(b.adimlar[0] ?? { adetCarpani: null })} birim="adet"
            yaz={(v) => { r.duzen.degistir(d.id, (l) => dalCarpaniYaz(l, b.dal, v), `Dal ${b.dal} çarpanı değişti`); }} />
        </div>
      ) : b.carpan !== null && b.carpan > 1 && <small>1 mamul için {String(b.carpan)} adet</small>}
      {duzen && r.surukleniyor && <small>Bu kola bırak</small>}
    </div>
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
  // 2550 a: dallı rotada sütunlar daralır (giren ve çıkan kartlar adımın üstünde ve altında), dallar ve ana hat açılışta yan yana sığar.
  const dalli = onculler.some((o) => o !== null);
  const yerlesim = dalli ? dalYerlesimi(liste) : null;
  const bilgiler = dalli ? dalBilgileri(liste) : [];
  // Dalın toplam süresi (adım kutusundaki hesapla aynı); bir adımı hesaplanamayan dalın toplamı yazılmaz. Aynı adımda birleşen dallardan en uzunu işaretlenir.
  const dalSaati = new Map(bilgiler.map((b) => {
    const sureler = b.adimlar.map((a) => {
      const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
      return fasonMu(a) ? null : adimSuresi(a, d.miktar * adimCarpani(a), ist, r.gunSaati(ist?.wcId ?? null))?.dk ?? null;
    });
    return [b.dal, sureler.some((x) => x === null) ? null : sureler.reduce<number>((t, x) => t + (x ?? 0), 0) / 60] as const;
  }));
  const enUzunlar = new Set(bilgiler.filter((b) => {
    const es = bilgiler.filter((x) => x.birlesme !== null && x.birlesme.id === b.birlesme?.id);
    const kendi = dalSaati.get(b.dal) ?? null;
    return es.length > 1 && kendi !== null && es.every((x) => (dalSaati.get(x.dal) ?? null) !== null && (x.dal === b.dal || (dalSaati.get(x.dal) ?? 0) < kendi));
  }).map((b) => b.dal));
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
  const adimHucreleri = (sn: Dugum['adimlar'][number], i: number) => {
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
        {r.araKartlar && onceki.map((p) => {
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
        {adimBirlesen(a).length > 0 && (
          <span className="tc-rr1-daletiket"><Simge ad="layers" boyut="k" />birleşir: {adimBirlesen(a).join(', ')}</span>
        )}
        {i > 0 && oncul?.length !== 0 && (
          <button
            type="button" className={`tc-rr1-deppill tc-rr1-dep-${a.dep}`} disabled={!duzen}
            title="Önceki adımla ilişki: dokununca değişir (bağımlı → örtülü → bağımsız)"
            onClick={() => { r.duzen.degistir(d.id, (l) => l.map((x) => (x.id === a.id ? bagimlilikYaz(x, sonrakiBagimlilik(x.dep)) : x)), 'Bağlılık değişti'); }}
          >{bagMetni(a)}</button>
        )}
        <OpKutusu r={r} a={a} d={d} sonraki={sonraki} secili={secili('adim')} duzen={duzen} sahip={m} liste={liste} i={i} onculler={oncul} catal={yerlesim?.ilkAdimlar.has(a.id) === true} serit={serit(a)} />
        {duzen && r.surukleniyor && (
          <BirakSeridi metin={`Bırak: OP ${String(statuNo(a))} ardına`} birak={(v) => { yereBirak(r, d.id, a.id, v, sn.miktar); }} />
        )}
        {duzen && !r.surukleniyor && (
          <div className="tc-rr1-stepbar">
            <button type="button" className="tc-rr1-ib" disabled={i === 0} title="Yukarı taşı (Alt+Shift+↑)" aria-label={`${adimAdi(a)} yukarı taşı`}
              onClick={() => { const p = liste[i - 1]; if (p) r.duzen.tasi(d.id, (l) => adimSurukle(l, a.id, p.id), 'Adım yukarı taşındı'); }}>
              <Simge ad="up" boyut="k" />
            </button>
            <button type="button" className="tc-rr1-ib" disabled={son} title="Aşağı taşı (Alt+Shift+↓)" aria-label={`${adimAdi(a)} aşağı taşı`}
              onClick={() => { const n = liste[i + 1]; if (n) r.duzen.tasi(d.id, (l) => adimSurukle(l, a.id, n.id), 'Adım aşağı taşındı'); }}>
              <Simge ad="down" boyut="k" />
            </button>
            <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: a.id, seq: a.seq, miktar: sn.miktar }); r.paletAc(); }}>
              <Simge ad="plus" boyut="k" /> {son ? 'Adım ekle' : 'Araya adım'}
            </button>
            <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" title="Adımı sil" aria-label={`${adimAdi(a)} sil`}
              onClick={() => { r.duzen.degistir(d.id, (l) => adimSil(l, a.id), `OP ${String(statuNo(a))} silindi`); }}>
              <Simge ad="trash" boyut="k" />
            </button>
          </div>
        )}
        {yerlesim?.acikUclar.has(a.id) === true && <span className="tc-rr1-dalacik" role="note"><Simge ad="alert" boyut="k" />Birleşmiyor</span>}
      </div>,
      <div key={`c${a.id}`} className="tc-rr1-cout">
        {son ? anaCip(ust ?? undefined, anahtar) : r.araKartlar && (() => {
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
  };
  const baslik = (
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
  );
  if (yerlesim) {
    const bos = (k: string) => <div key={k} className="tc-rr1-dh tc-rr1-dh-bos" />;
    const ana = yerlesim.seritler.indexOf(0);
    return (
      <div className={`tc-rr1-rcol ${kok ? 'tc-rr1-rcol-kok' : 'tc-rr1-rcol-alt'}`}>
        <div className={`tc-rr1-dallar tc-rr1-dallar-${String(Math.min(yerlesim.seritler.length, 9))}`}>
          {yerlesim.seritler.map((sr, j) => (j === ana ? <div key="b" className="tc-rr1-dh tc-rr1-dh-bas">{baslik}</div> : bos(`b${String(sr)}`)))}
          {yerlesim.satirlar.flatMap((satir, si) => satir.map((id, j) => {
            const i = id === null ? -1 : d.adimlar.findIndex((x) => x.a.id === id);
            const sn = d.adimlar[i];
            if (!sn) return bos(`${String(si)}-${String(j)}`);
            const dal = yerlesim.ilkAdimlar.get(sn.a.id);
            const b = dal === undefined ? undefined : bilgiler.find((x) => x.dal === dal);
            return (
              <div key={sn.a.id} className={`tc-rr1-dh tc-rr1-dalserit tc-rr1-dalserit-${String(Math.min(serit(sn.a), 7))}`}>
                {b && <DalBasligi r={r} d={d} b={b} duzen={duzen} saat={dalSaati.get(b.dal) ?? null} enUzun={enUzunlar.has(b.dal)} />}
                <div className="tc-rr1-g3">{adimHucreleri(sn, i)}</div>
              </div>
            );
          }))}
        </div>
      </div>
    );
  }
  return (
    <div className={`tc-rr1-rcol ${kok ? 'tc-rr1-rcol-kok' : 'tc-rr1-rcol-alt'}`}>
      <div className="tc-rr1-g3">
        <div className="tc-rr1-cin" />
        <div className="tc-rr1-cop">
          {baslik}
        </div>
        <div className="tc-rr1-cout" />
        {d.dongu && (
          <>
            <div className="tc-rr1-cin" />
            <div className="tc-rr1-cop"><div className="tc-rr1-noroute">Döngü: {m.code} kendi akışında tekrar geçiyor</div></div>
            <div className="tc-rr1-cout" />
          </>
        )}
        {d.adimlar.map((sn, i) => adimHucreleri(sn, i))}
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

interface Kenar { d: string; tur: 'ef' | 'ef-ortulu' | 'ef-bagimsiz' | 'ei' | 'eo'; dal?: string; dalli?: boolean }
interface Nokta { x: number; y: number }
interface Bant { x: number; y: number; w: number; h: number; dal: string }
interface Cizim { kenarlar: Kenar[]; noktalar: Nokta[]; bantlar: Bant[]; en: number; boy: number }

// Kenarlar kutuların gerçek yerinden ölçülür; koordinatlar yakınlaştırılmamış içerik birimindedir (SVG içerikle ölçeklenir).
function kenarlariOlc(ic: HTMLElement, olcek: number): Cizim {
  const kok = ic.getBoundingClientRect();
  const kutu = (el: Element) => {
    const b = el.getBoundingClientRect();
    return { x: (b.left - kok.left) / olcek, y: (b.top - kok.top) / olcek, w: b.width / olcek, h: b.height / olcek };
  };
  const uclar = new Map<string, Element>();
  ic.querySelectorAll('[data-uc]').forEach((el) => { uclar.set(el.getAttribute('data-uc') ?? '', el); });
  // Okun ucu adımın bağlılık balonuna varır: kutunun üstüne çizilen ok balonun içinden geçip onu keserdi.
  const giris = (el: Element) => kutu(el.closest('.tc-rr1-cop')?.querySelector(':scope > .tc-rr1-deppill') ?? el);
  // Dar sütunda (kol ve kollu rota) giren ve çıkan kartlar adımın üstünde ve altındadır; yandan çizilen eğri kutunun üstünden dolanırdı, ok çizilmez.
  const kolda = (el: Element) => {
    const g = el.closest('.tc-rr1-g3');
    return g !== null && g.parentElement?.classList.contains('tc-rr1-dh') === true;
  };
  const kenarlar: Kenar[] = [];
  const egri = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(24, (x2 - x1) / 2);
    return `M${String(x1)},${String(y1)} C${String(x1 + dx)},${String(y1)} ${String(x2 - dx)},${String(y2)} ${String(x2)},${String(y2)}`;
  };
  uclar.forEach((el) => {
    const hedef = uclar.get(el.getAttribute('data-sonraki') ?? '');
    if (!hedef) return;
    const a = kutu(el); const b = giris(hedef);
    const bag = el.getAttribute('data-bag');
    kenarlar.push({
      d: `M${String(a.x + a.w / 2)},${String(a.y + a.h)} L${String(b.x + b.w / 2)},${String(b.y)}`,
      tur: bag === 'ortulu' ? 'ef-ortulu' : bag === 'bagimsiz' ? 'ef-bagimsiz' : 'ef',
    });
  });
  // 3188: aynı şeritteki öncül düz inen okla; başka şeritteki öncül dik açılı çizgiyle bağlanır. Dal ayrılırken yatay ray ayrıldığı adımın
  // satırının hemen altından, birleşirken birleştiren adımın satırının hemen üstünden geçer; dikey parça dalın kendi şeridindedir. Çizgi yalnız
  // satır ve şerit aralığından geçer; başka bir bağlantının dikey parçasını kesen ray orada küçük köprüyle atlar.
  interface Baglanti { ax: number; ay: number; bx: number; by: number; ray: number | null; grup: string; tur: Kenar['tur']; dal: string | undefined }
  const baglantilar: Baglanti[] = [];
  ic.querySelectorAll('[data-onculler]').forEach((el) => {
    const b = giris(el);
    const tur = el.getAttribute('data-bag') === 'ortulu' ? 'ef-ortulu' : 'ef';
    const hh = el.closest('.tc-rr1-dh');
    for (const id of (el.getAttribute('data-onculler') ?? '').split(' ')) {
      const kaynak = uclar.get(id);
      if (!kaynak) continue;
      const a = kutu(kaynak);
      const hk = kaynak.closest('.tc-rr1-dh');
      const ax = a.x + a.w / 2; const bx = b.x + b.w / 2;
      const catal = el.hasAttribute('data-catal');
      const capraz = Math.abs(ax - bx) > 2 && hk !== null && hh !== null;
      baglantilar.push({
        ax, ay: a.y + a.h, bx, by: b.y, tur, dal: el.getAttribute('data-serit') ?? kaynak.getAttribute('data-serit') ?? undefined,
        ray: !capraz ? null : catal ? kutu(hk).y + kutu(hk).h + RAY : kutu(hh).y - RAY,
        grup: !capraz ? `d${id}>${el.getAttribute('data-uc') ?? ''}` : catal ? `c${id}` : `m${el.getAttribute('data-uc') ?? ''}`,
      });
    }
  });
  const noktalar: Nokta[] = [];
  const bantlar: Bant[] = [];
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const hucreler = [...ic.querySelectorAll('.tc-rr1-dh')].map(kutu);
  // Hücrenin üstündeki satır aralığı: bir üst satırın alt kenarı ile bu hücrenin üst kenarı arası.
  const ustAralik = (y: number) => y - Math.max(0, ...hucreler.map((k) => k.y + k.h).filter((alt) => alt <= y + 1));
  for (const g of baglantilar) {
    const ek = { tur: g.tur, dalli: true, ...(g.dal ? { dal: g.dal } : {}) };
    if (g.ray === null) { kenarlar.push({ d: `M${n(g.ax)},${n(g.ay)} L${n(g.bx)},${n(g.by)}`, ...ek }); continue; }
    const catal = g.grup.startsWith('c');
    // Eğri satır aralığının içinde kalır: ayrılırken kaynağın satırının altından, birleşirken hedefin satırının üstünden. Bağlantı noktası
    // ayrılmada eğrinin başında, birleşmede sonunda (eksenin üstünde) durur.
    const alt = catal ? g.ray - RAY : g.ray + RAY;
    const aralik = catal ? ustAralik(Math.min(...hucreler.map((k) => k.y).filter((y) => y > alt + 1), g.by)) : ustAralik(alt);
    const y0 = catal ? alt : alt - aralik; const y1 = y0 + aralik;
    kenarlar.push({ d: `M${n(g.ax)},${n(g.ay)} L${n(g.ax)},${n(y0)} C${n(g.ax)},${n(y0 + aralik * 0.7)} ${n(g.bx)},${n(y0 + aralik * 0.3)} ${n(g.bx)},${n(y1)} L${n(g.bx)},${n(g.by)}`, ...ek });
    noktalar.push(catal ? { x: g.ax, y: y0 } : { x: g.bx, y: y1 });
  }
  // Dal bandı: dalın ilk hücresinin üstünden son hücresinin altına, şerit genişliğinde.
  const dalHucreleri = new Map<string, { serit: string; kutular: ReturnType<typeof kutu>[] }>();
  ic.querySelectorAll('.tc-rr1-opbox[data-dal]').forEach((el) => {
    const h = el.closest('.tc-rr1-dh'); if (!h || el.closest('.tc-rr1-rcol') !== ic.querySelector('.tc-rr1-rcol-kok')) return;
    const anahtar = el.getAttribute('data-dal') ?? '';
    const kayit = dalHucreleri.get(anahtar) ?? { serit: el.getAttribute('data-serit') ?? '7', kutular: [] };
    kayit.kutular.push(kutu(h)); dalHucreleri.set(anahtar, kayit);
  });
  dalHucreleri.forEach((v) => {
    const x = Math.min(...v.kutular.map((k) => k.x)) - BANT; const y = Math.min(...v.kutular.map((k) => k.y)) - BANT;
    bantlar.push({ x, y, w: Math.max(...v.kutular.map((k) => k.x + k.w)) + BANT - x, h: Math.max(...v.kutular.map((k) => k.y + k.h)) + BANT - y, dal: v.serit });
  });
  ic.querySelectorAll('[data-besler]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-besler') ?? '');
    if (!op || kolda(el)) return;
    const a = kutu(el); const b = kutu(op);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'ei' });
  });
  ic.querySelectorAll('[data-cikan]').forEach((el) => {
    const op = uclar.get(el.getAttribute('data-cikan') ?? '');
    if (!op || kolda(el)) return;
    const a = kutu(op); const b = kutu(el);
    kenarlar.push({ d: egri(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2), tur: 'eo' });
  });
  return { kenarlar, noktalar, bantlar, en: kok.width / olcek, boy: kok.height / olcek };
}

export function AkisSemasi({ r, kok, cop }: {
  r: RotaEkrani; kok: Dugum; cop: ReactNode;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const ic = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<Yakinlik>(100);
  // Akış çizgisi her karede ana iş parçacığında yeniden hesaplanır; sekme gizliyken ya da tuval ekran dışındayken durur (görünüşü değişmez).
  const [akar, setAkar] = useState(true);
  useEffect(() => {
    const v = vp.current;
    let gorunur = true;
    const yaz = () => { setAkar(gorunur && document.visibilityState !== 'hidden'); };
    const g = v && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((e) => { gorunur = e.some((x) => x.isIntersecting); yaz(); })
      : null;
    if (v && g) g.observe(v);
    document.addEventListener('visibilitychange', yaz);
    return () => { g?.disconnect(); document.removeEventListener('visibilitychange', yaz); };
  }, []);
  const [yardim, setYardim] = useState(false);
  const [cizim, setCizim] = useState<Cizim>({ kenarlar: [], noktalar: [], bantlar: [], en: 0, boy: 0 });
  const capa = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const surukle = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const dokundu = useRef<string | null>(null);
  const oncekiZ = useRef<Yakinlik | null>(null);
  const sonOdak = useRef<string | null>(null);

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
    // Görünüm düğmeleri tuvalin sağ kenarında durur; sığdırma onların solunda kalan genişliğe yapılır ki açılışta kutunun üstüne binmesinler.
    // Okunurluk tabanı tuvalin tam genişliğinden hesaplanır: düğmeler için yakınlık düşmez.
    const arac = v.parentElement?.querySelector('.tc-rr1-cv-ctrl')?.getBoundingClientRect().width ?? 0;
    // Çöp kutusu tuvalin sol üstündedir; rota ortalanınca başlığı onun altında başlar.
    const copKutu = v.parentElement?.querySelector('.tc-rr1-copkutu')?.getBoundingClientRect();
    const ust = Math.max(UST_PAY, copKutu ? copKutu.bottom - v.getBoundingClientRect().top + UST_PAY / 2 : 0);
    const en = Math.max(100, vr.width - arac); const boy = Math.max(100, vr.height);
    const oran = yalnizGenislik
      ? Math.max(Math.min(80, (vr.width / 700) * 100), Math.min(100, ((en - KENAR * 2) / w) * 100))
      : Math.min(en / w, boy / hh, 1) * 95;
    const yeni = [...YAKINLIK].reverse().find((t) => t <= oran) ?? 30;
    const sigar = w * (yeni / 100) <= en - KENAR * 2;
    const nokta = { x: yalnizGenislik && !sigar ? KENAR : en / 2, y: yalnizGenislik ? ust : boy / 2 };
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

  // 2558 b/8: seçilen kutu tuvalin ortasına kayar; yakınlık değişmez. Az hareket tercihinde kayma anlıktır.
  // Görünüm düğmeleri tuvalin sağına biner; ortalama onların solunda kalan genişliğe yapılır ki seçili kutunun düğmelerini örtmesinler.
  const kullanilir = useCallback((vr: DOMRect): number => {
    const arac = vp.current?.parentElement?.querySelector('.tc-rr1-cv-ctrl')?.getBoundingClientRect().width ?? 0;
    return Math.max(vr.width / 2, vr.width - (arac > 0 ? arac + KENAR : 0));
  }, []);
  const ortala = useCallback((yumusak: boolean) => {
    const v = vp.current; const el = ic.current?.querySelector<HTMLElement>('.tc-rr1-secili');
    if (!v || !el) return;
    const vr = v.getBoundingClientRect(); const er = el.getBoundingClientRect();
    const left = v.scrollLeft + er.left - vr.left + er.width / 2 - kullanilir(vr) / 2;
    const top = v.scrollTop + er.top - vr.top + er.height / 2 - vr.height / 2;
    const azHareket = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof v.scrollTo === 'function') v.scrollTo({ left, top, behavior: yumusak && !azHareket ? 'smooth' : 'auto' });
    else { v.scrollLeft = left; v.scrollTop = top; }
  }, [kullanilir]);
  const secimAnahtari = r.secim ? JSON.stringify([r.secim.tur, 'urunId' in r.secim ? r.secim.urunId : null, 'adimId' in r.secim ? r.secim.adimId : null]) : null;
  const odakAnahtari = r.odak ? `${r.odak.urunId}|${r.odak.adimId}` : null;
  // 2558 b/9: odağa girince kutu ortalanarak yakınlaşır (en az %125); çıkınca önceki yakınlığa döner. Odak değişmediyse yalnız ortalanır.
  useEffect(() => {
    const v = vp.current; const el = ic.current?.querySelector<HTMLElement>('.tc-rr1-secili');
    if (odakAnahtari === sonOdak.current) { if (secimAnahtari) { elle(); ortala(true); } return; }
    sonOdak.current = odakAnahtari;
    if (!v || !el) return;
    elle();
    // Tuval sayfanın altında kalmışsa odakta bütünüyle görünür olsun.
    if (odakAnahtari && typeof v.scrollIntoView === 'function') v.scrollIntoView({ block: 'nearest' });
    const vr = v.getBoundingClientRect(); const er = el.getBoundingClientRect();
    const en = kullanilir(vr);
    // Odak yakınlığı kutunun kullanılabilir genişliğe sığdığı en büyük basamakla sınırlıdır (dar ekranda kutu düğmelerin altına girmesin).
    const sigan = er.width > 0 ? z * ((en - KENAR * 2) / er.width) : 200;
    const istenen = YAKINLIK.find((t) => t >= Math.max(125, z + 25)) ?? 200;
    const hedef: Yakinlik = odakAnahtari
      ? Math.max(z, [...YAKINLIK].reverse().find((t) => t <= Math.min(istenen, sigan)) ?? z) as Yakinlik
      : (oncekiZ.current ?? z);
    if (odakAnahtari) oncekiZ.current ??= z; else oncekiZ.current = null;
    if (hedef === z) { ortala(true); return; }
    const olcek = z / 100;
    capa.current = {
      x: en / 2, y: vr.height / 2,
      cx: (v.scrollLeft + er.left - vr.left + er.width / 2) / olcek, cy: (v.scrollTop + er.top - vr.top + er.height / 2) / olcek,
    };
    setZ(hedef);
    // Yalnız seçim ya da odak değişince çalışır; yakınlık değişimi bu etkiyi yeniden tetiklememeli.
  }, [secimAnahtari, odakAnahtari]);
  // Çekmece açılıp kapanınca tuval daralır ya da genişler: seçili kutu görünür kalsın diye anında yeniden ortalanır.
  useEffect(() => {
    const v = vp.current;
    if (!v || typeof ResizeObserver === 'undefined') return undefined;
    let ilk = true;
    const g = new ResizeObserver(() => { if (ilk) { ilk = false; return; } ortala(false); });
    g.observe(v);
    return () => { g.disconnect(); };
  }, [ortala]);
  // Odakta adım tam görünür; öncülü ve ardılı az, ötekiler çok solar. Sınıflar DOM'dan okunur: kenar çizimi de aynı veriyi kullanır.
  useLayoutEffect(() => {
    const i = ic.current; if (!i) return;
    const hepsi = i.querySelectorAll<HTMLElement>('.tc-rr1-opbox, .tc-rr1-cip');
    const oge = odakAnahtari ? i.querySelector<HTMLElement>('.tc-rr1-opbox.tc-rr1-secili') : null;
    const u = oge?.getAttribute('data-uc') ?? null;
    if (!u || !oge) { hepsi.forEach((e) => { e.removeAttribute('data-odak-hucre'); }); return; }
    const komsu = new Set([oge.getAttribute('data-sonraki'), ...(oge.getAttribute('data-onculler') ?? '').split(' ')].filter((x): x is string => !!x));
    hepsi.forEach((e) => {
      const eu = e.getAttribute('data-uc');
      const kendi = e === oge || e.getAttribute('data-besler') === u || e.getAttribute('data-cikan') === u;
      const yakin = (eu !== null && komsu.has(eu)) || e.getAttribute('data-sonraki') === u || (e.getAttribute('data-onculler') ?? '').split(' ').includes(u);
      e.setAttribute('data-odak-hucre', kendi ? 'oge' : yakin ? 'komsu' : 'diger');
    });
  });
  const odakMetni = (() => {
    if (!r.odak) return '';
    const a = r.duzen.adimlar(r.odak.urunId).find((x) => x.id === r.odak?.adimId);
    return a ? `Odak: OP ${String(statuNo(a))} ${r.duzen.h.op.get(a.opId)?.name ?? ''}`.trim() : '';
  })();
  const seciliAdim = r.secim?.tur === 'adim' ? r.secim : null;

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
    };
    const is = harita[o.key];
    if (is) { o.preventDefault(); elle(); is(); return; }
    // Enter: seçili kutuda ya da tuvalin kendisinde odaklar; seçili olmayan kutuda düğmenin kendi tıklaması seçer.
    const hedef = o.target as HTMLElement;
    if (o.key === 'Enter' && seciliAdim && !r.odak && (hedef === v || hedef.matches('.tc-rr1-opbox.tc-rr1-secili'))) {
      o.preventDefault();
      r.odakla({ urunId: seciliAdim.urunId, adimId: seciliAdim.adimId });
    }
  };

  const basla = (o: PointerEvent<HTMLDivElement>) => {
    elle();
    if ((o.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    const v = vp.current; if (!v) return;
    surukle.current = { x: o.clientX, y: o.clientY, sl: v.scrollLeft, st: v.scrollTop };
    if (typeof v.setPointerCapture === 'function') v.setPointerCapture(o.pointerId);
  };
  const tasima = (o: PointerEvent<HTMLDivElement>) => {
    const s = surukle.current; const v = vp.current; if (!s || !v) return;
    v.scrollLeft = s.sl - (o.clientX - s.x);
    v.scrollTop = s.st - (o.clientY - s.y);
  };
  // Boş alana kaydırmadan dokunmak odaktan çıkarır; sürükleyerek gezinmek çıkarmaz.
  const birak = (o: PointerEvent<HTMLDivElement>) => {
    const s = surukle.current; surukle.current = null;
    if (s && r.odak && Math.abs(o.clientX - s.x) < 4 && Math.abs(o.clientY - s.y) < 4) r.odakla(null);
  };

  return (
    <div className="tc-rr1-canvas-kap">
      <div
        ref={vp} className="tc-rr1-canvas" tabIndex={0} role="group"
        aria-label="Akış şeması. Tekerlek yakınlaştırır, sürükleyerek gezersin, ok tuşları kaydırır."
        onKeyDown={tus} onPointerDown={basla} onPointerMove={tasima} onPointerUp={birak} onPointerCancel={birak}
      >
        <div ref={ic} className={`tc-rr1-inner tc-rr1-z-${String(z)}${r.odak ? ' tc-rr1-odakta' : ''}`}>
          <svg className={`tc-rr1-edges${akar ? '' : ' tc-rr1-edges-dur'}`} width={cizim.en} height={cizim.boy} aria-hidden="true">
            <defs>
              <marker id="tc-rr1-ok-f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path className="tc-rr1-mf" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-rr1-ok-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-rr1-mi" d="M0,0 L10,5 L0,10 z" /></marker>
              <marker id="tc-rr1-ok-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className="tc-rr1-mo" d="M0,0 L10,5 L0,10 z" /></marker>
            </defs>
            {cizim.bantlar.map((b, i) => <rect key={`b${String(i)}`} className={`tc-rr1-bant tc-rr1-bant-${b.dal}`} x={b.x} y={b.y} width={b.w} height={b.h} rx="14" />)}
            {cizim.kenarlar.map((k, i) => (
              <path key={i} d={k.d} className={`tc-rr1-e-${k.tur}${k.dalli ? ' tc-rr1-e-dalli' : ''}${k.dal ? ` tc-rr1-e-dal-${k.dal}` : ''}`}
                markerEnd={k.tur.startsWith('ef') ? 'url(#tc-rr1-ok-f)' : k.tur === 'ei' ? 'url(#tc-rr1-ok-i)' : 'url(#tc-rr1-ok-o)'} />
            ))}
            {cizim.kenarlar.filter((k) => k.dalli).map((k, i) => <path key={`a${String(i)}`} d={k.d} className="tc-rr1-e-akis" />)}
            {cizim.noktalar.map((p, i) => <circle key={`n${String(i)}`} className="tc-rr1-dugum" cx={p.x} cy={p.y} r="6" />)}
          </svg>
          <Kolon r={r} d={kok} ust={null} kok />
        </div>
      </div>
      {cop}
      <p className="tc-gizli-etiket" aria-live="polite">{odakMetni}</p>
      {seciliAdim && (
        <button type="button" className="tc-rr1-odak-dugme" aria-pressed={r.odak !== null}
          title={r.odak ? 'Odaktan çık (Esc ya da boş alana dokun)' : 'Seçili adıma odaklan: ortalar, yakınlaştırır, ötekileri soldurur (Enter ya da çift tık)'}
          onClick={() => { r.odakla(r.odak ? null : { urunId: seciliAdim.urunId, adimId: seciliAdim.adimId }); }}>
          <Simge ad={r.odak ? 'x' : 'target'} boyut="k" />{r.odak ? 'Odaktan çık' : 'Odakla'}
        </button>
      )}
      <div className="tc-rr1-cv-ctrl" role="group" aria-label="Görünüm">
        <button type="button" className="tc-rr1-ib" onClick={() => { yakinlas(1); }} title="Yakınlaştır (+)" aria-label="Yakınlaştır"><Simge ad="zin" boyut="k" /></button>
        <span className="tc-rr1-zl">{z}%</span>
        <button type="button" className="tc-rr1-ib" onClick={() => { yakinlas(-1); }} title="Uzaklaştır (−)" aria-label="Uzaklaştır"><Simge ad="zout" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" onClick={() => { elle(); sigdir(false); }} title="Tümünü sığdır (0)" aria-label="Tümünü sığdır"><Simge ad="fit" boyut="k" /></button>
        <button type="button" className="tc-rr1-ib" onClick={() => { elle(); sigdir(true); }} title="Genişliğe sığdır, başa git (Home)" aria-label="Genişliğe sığdır"><Simge ad="first" boyut="k" /></button>
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
            <li><b>Odak:</b> adıma çift tıkla ya da seçip Enter&apos;a bas; ortalanır, yakınlaşır, ötekiler solar. Esc ya da boş alana dokunmak çıkarır.</li>
            <li><b>Ara kartlar:</b> statülü kartlar kutuda rozettir; ⋯ menüsündeki &quot;Ara kartları göster&quot; kutu olarak açar.</li>
            <li><b>Taşıma:</b> operasyon kutusunu başka bir adımın üstüne sürükle; aşağı taşırken onun altına, yukarı taşırken üstüne yerleşir.</li>
          </ul>
          <div className="tc-rr1-cv-legend">
            <span><i className="tc-rr1-lg tc-rr1-lg-in" />Giren</span>
            <span><i className="tc-rr1-lg tc-rr1-lg-st" />Statülü kart</span>
            <span><i className="tc-rr1-lg tc-rr1-lg-flow" />Rota akışı</span>
            <span><i className="tc-rr1-lg tc-rr1-lg-out" />Çıkan</span>
          </div>
        </div>
      )}

    </div>
  );
}
