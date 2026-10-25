import { useState, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, miktar as miktarMetni } from '../bicim.ts';
import {
  adimEkle, adimGuncelle, adimSil, adimSuresi, adimSurukle, agacKur, akisKarti, bagimlilikYaz, degisimOrani, fasonMu, istasyonYaz, kartBasligi,
  operasyonYaz, sirali, sonrakiBagimlilik, statuNo, sureYaz, tuketilenAdimlar, turKisa, yeniAdim, type Adim, type Dugum, type Malzeme,
} from './kurallar.ts';
import { bagMetni, fasonAdi, renkSinifi, SayiAlani, SecimAlani, type RotaEkrani } from './ortak.tsx';
import { SURUKLE_TURU, surukleAdim, surukleCoz } from './AkisSemasi.tsx';
import { yeniKimlik } from './useRotaDuzeni.ts';

// Akış tablosu (eski sayfanın düzeni): her rota ayrı bölüm, satırlar "Girenler | Rota adımları | Çıkanlar"; alt montajlar önce, kök en sonda.
// Adım kartında operasyon, istasyon, makine ve süreler yerinde düzenlenir; yazma şemayla ve düzenleme paneliyle aynı yoldan (duzen.degistir) gider.

interface Sira { id: string; miktar: number; tuketen: { urunId: string; adim: Adim } | null }

// Rotalar alt montajdan köke sıralanır; her rotanın miktarı ağaçtaki bütün geçişlerinin toplamıdır.
function rotaSirasi(kok: Dugum, malzeme: (id: string) => Malzeme | undefined, rotaVar: (id: string) => boolean): Sira[] {
  const miktar = new Map<string, number>();
  const topla = (d: Dugum) => {
    miktar.set(d.id, (miktar.get(d.id) ?? 0) + d.miktar);
    for (const s of d.adimlar) for (const g of s.girenler) topla(g.dugum);
  };
  topla(kok);
  const sira: Sira[] = []; const gorulen = new Set<string>(); const tuketen = new Map<string, { urunId: string; adim: Adim }>();
  const gez = (d: Dugum) => {
    if (gorulen.has(d.id) || d.dongu) return;
    gorulen.add(d.id);
    for (const s of d.adimlar) {
      for (const g of s.girenler) {
        if (!rotaVar(g.x.itemId)) continue;
        if (!tuketen.has(g.x.itemId)) tuketen.set(g.x.itemId, { urunId: d.id, adim: s.a });
        gez(g.dugum);
      }
    }
    const m = malzeme(d.id);
    if (m && m.type !== 'ham') sira.push({ id: d.id, miktar: miktar.get(d.id) ?? d.miktar, tuketen: null });
  };
  gez(kok);
  return sira.map((s) => ({ ...s, tuketen: tuketen.get(s.id) ?? null }));
}

function Kart({ m, ek, baslik, alt, sag, children }: {
  m: Malzeme | undefined; ek: string; baslik: string; alt: string; sag?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={`tc-rr1-fcard ${ek}`}>
      {children ?? (
        <>
          <span className={`tc-rr1-slot tc-rr1-slot-${m?.type ?? 'yok'}`}>{turKisa(m?.type ?? '')}</span>
          <span className="tc-rr1-fct"><b>{baslik}</b><small>{alt}</small></span>
          {sag}
        </>
      )}
    </div>
  );
}

function RotaBolumu({ r, s, kokMu, sira }: { r: RotaEkrani; s: Sira; kokMu: boolean; sira: Sira[] }) {
  const { h } = r.duzen;
  const [ustunde, setUstunde] = useState<string | null>(null);
  const m = h.malzeme.get(s.id);
  if (!m) return null;
  const urunId = s.id;
  const q = s.miktar;
  const duzen = r.duzen.duzenlenebilir(urunId);
  const liste = sirali(r.duzen.adimlar(urunId));
  const V = r.duzen.gorulen(urunId);
  const sec = r.secim;
  const yaz = (a: Adim, f: (x: Adim) => Adim, metin: string) => { r.duzen.degistir(urunId, (l) => adimGuncelle(l, a.id, f), metin); };
  const tuketen = s.tuketen;
  const tuketenKod = tuketen ? h.malzeme.get(tuketen.urunId)?.code ?? '?' : null;
  const birak = (hedef: Adim, v: string) => {
    const c = surukleCoz(v);
    if (!c) return;
    if (c.tur === 'adim' && c.urunId === urunId && c.adimId !== hedef.id) {
      r.duzen.degistir(urunId, (l) => adimSurukle(l, c.adimId, hedef.id), 'Adım taşındı');
    } else if (c.tur === 'op') {
      const yeni = yeniAdim(h.op.get(c.opId), yeniKimlik());
      const l2 = adimEkle(r.duzen.adimlar(urunId), hedef.id, yeni);
      if (r.duzen.degistir(urunId, () => l2, 'Adım eklendi')) {
        r.sec({ tur: 'adim', urunId, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar: q });
      }
    }
  };
  const adimEkleDugmesi = (sonraId: string | null, son: boolean) => duzen && (
    <button type="button" className="tc-rr1-add tc-rr1-farada" onClick={() => { r.sec({ tur: 'adimEkle', urunId, sonraId }); }}>
      <Simge ad="plus" boyut="k" /> {son ? 'Adım ekle' : 'Araya adım'}
    </button>
  );

  const satirlar = liste.map((a, j) => {
    const op = h.op.get(a.opId);
    const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
    const fason = fasonMu(a);
    const t = adimSuresi(a, q, ist, r.gunSaati(ist?.wcId ?? null));
    const son = j === liste.length - 1;
    const secili = sec?.tur === 'adim' && sec.urunId === urunId && sec.adimId === a.id;
    const istasyonlar = [...h.istasyon.values()].filter((x) => x.aktif || x.id === a.stationId);
    const makineler = h.makineler(a.stationId).filter((x) => x.status === 'aktif' || x.id === a.machineId);
    const opSecenek = [...h.op.values()].filter((o) => o.aktif || o.id === a.opId).map((o) => ({ deger: o.id, baslik: `${o.abbr ?? o.code} ${o.name}` }));
    const oran = degisimOrani(a.proc, a.chg);
    const kart = son ? null : akisKarti(urunId, liste, j, r.duzen.malzemeVar);

    const sol = (
      <div className="tc-rr1-fcol">
        {tuketilenAdimlar(liste, j).map((p) => {
          const k = akisKarti(urunId, liste, liste.indexOf(p), r.duzen.malzemeVar);
          const km = h.malzeme.get(k.itemId);
          return <Kart key={`f${p.id}`} m={km} ek="tc-rr1-fc-akis tc-rr1-fc-ara" baslik={kartBasligi(km, k.adim, r.duzen.opAdi)} alt="önceki adımdan, tüketilir"
            sag={<span className="tc-rr1-fcq">{sayi(Math.round(q * 100) / 100)}</span>} />;
        })}
        {a.ins.map((x, sira2) => {
          const gm = h.malzeme.get(x.itemId);
          if (!gm) return null;
          const toplam = q * (x.qty || 0) * (1 + (x.scrap || 0) / 100);
          const yukarida = sira.some((y) => y.id === x.itemId);
          const gSecili = sec?.tur === 'giren' && sec.urunId === urunId && sec.adimId === a.id && sec.sira === sira2;
          return (
            <Kart key={`g${String(sira2)}`} m={gm} ek={`tc-rr1-fc-in${gSecili ? ' tc-rr1-secili' : ''}`} baslik={gm.code} alt="">
              <button type="button" className="tc-rr1-fcsec"
                onClick={() => { r.sec({ tur: 'giren', urunId, adimId: a.id, sira: sira2, nid: `${urunId}>${a.id}.${String(sira2)}`, miktar: toplam }); }}>
                <span className={`tc-rr1-slot tc-rr1-slot-${gm.type}`}>{turKisa(gm.type)}</span>
                <span className="tc-rr1-fct"><b>{gm.code}</b><small>{gm.name}{yukarida ? ' ↑ yukarıdaki akıştan' : ''}</small></span>
              </button>
              <span className="tc-rr1-fcin">
                <SayiAlani etiket={`${gm.code} miktarı (1 ${m.unit ?? ''} başına)`} deger={x.qty} birim={`${gm.unit ?? ''}/1`} kapali={!duzen}
                  yaz={(v) => { yaz(a, (y) => ({ ...y, ins: y.ins.map((g, i) => (i === sira2 ? { ...g, qty: v ?? 0 } : g)) }), 'Giren miktarı değişti'); }} />
              </span>
              <span className="tc-rr1-fcq" title="Bu siparişte toplam">{sayi(Math.round(toplam * 100) / 100)}</span>
              {duzen && (
                <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" aria-label={`${gm.code} girenini kaldır`}
                  onClick={() => { yaz(a, (y) => ({ ...y, ins: y.ins.filter((_, i) => i !== sira2) }), 'Giren kaldırıldı'); }}>
                  <Simge ad="x" boyut="k" />
                </button>
              )}
            </Kart>
          );
        })}
        {duzen && (
          <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'girenEkle', urunId, adimId: a.id, yerine: null }); }}>
            <Simge ad="plus" boyut="k" /> Giren
          </button>
        )}
      </div>
    );

    const orta = (
      <div className="tc-rr1-fcol tc-rr1-fmid">
        <div className={`tc-rr1-fstep ${ist ? renkSinifi(ist.id) : 'tc-rr1-renk-yok'}${secili ? ' tc-rr1-secili' : ''}`}>
          <div className="tc-rr1-fshd">
            {duzen && (
              <span className="tc-rr1-ftutamak" draggable title="Sürükleyerek taşı"
                onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, surukleAdim(urunId, a.id)); e.dataTransfer.effectAllowed = 'move'; }}>
                <Simge ad="more" boyut="k" />
              </span>
            )}
            <button type="button" className="tc-rr1-fsop" aria-label={`OP ${String(statuNo(a))} ${op?.name ?? 'Operasyon seç'}`}
              onClick={() => { r.sec({ tur: 'adim', urunId, adimId: a.id, seq: a.seq, miktar: q }); }}>
              <b>{op?.abbr ?? op?.code ?? '???'}</b><span>OP {statuNo(a)}</span>
            </button>
            <span className="tc-rr1-fst">
              {fason ? `Termin ${a.terminGun !== null && a.terminGun > 0 ? `${String(a.terminGun)} gün` : 'girilmedi'}`
                : t ? `${sayi(Math.round((t.dk / 60) * 10) / 10)} sa, ${sayi(Math.round(t.gun * 100) / 100)} gün` : 'süre yok'}
            </span>
            {duzen && (
              <span className="tc-rr1-fsacts">
                <button type="button" className="tc-rr1-ib" disabled={j === 0} aria-label={`OP ${String(statuNo(a))} yukarı taşı`}
                  onClick={() => { const p = liste[j - 1]; if (p) r.duzen.degistir(urunId, (l) => adimSurukle(l, a.id, p.id), 'Adım yukarı taşındı'); }}>
                  <Simge ad="up" boyut="k" />
                </button>
                <button type="button" className="tc-rr1-ib" disabled={son} aria-label={`OP ${String(statuNo(a))} aşağı taşı`}
                  onClick={() => { const n = liste[j + 1]; if (n) r.duzen.degistir(urunId, (l) => adimSurukle(l, a.id, n.id), 'Adım aşağı taşındı'); }}>
                  <Simge ad="down" boyut="k" />
                </button>
                <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" aria-label={`OP ${String(statuNo(a))} sil`}
                  onClick={() => { r.duzen.degistir(urunId, (l) => adimSil(l, a.id), `OP ${String(statuNo(a))} silindi`); }}>
                  <Simge ad="x" boyut="k" />
                </button>
              </span>
            )}
          </div>
          <div className="tc-rr1-fsbody">
            <SecimAlani etiket="Operasyon" deger={a.opId} secenekler={opSecenek} kapali={!duzen} bos={op ? undefined : 'Operasyon seç…'}
              yaz={(v) => { yaz(a, (x) => operasyonYaz(x, h.op.get(v)), 'Operasyon değişti'); }} />
            {fason ? (
              <span className="tc-rr1-ipucu"><span className="tc-rr1-tag">Dış üretim</span> {fasonAdi(r.duzen.durum.fasonFirms, a.fasonId)}</span>
            ) : (
              <>
                <SecimAlani etiket="İstasyon" deger={a.stationId ?? ''} kapali={!duzen} bos="İstasyon seç…"
                  secenekler={istasyonlar.map((x) => ({ deger: x.id, baslik: `${x.code} ${x.name}` }))}
                  yaz={(v) => { yaz(a, (x) => istasyonYaz(x, v || null), 'İstasyon değişti'); }} />
                <SecimAlani etiket="Makine" deger={a.machineId ?? ''} kapali={!duzen || makineler.length === 0} bos="Planlayıcı seçer"
                  secenekler={makineler.map((x) => ({ deger: x.id, baslik: `${x.code} ${x.name}` }))}
                  yaz={(v) => { yaz(a, (x) => ({ ...x, machineId: v || null }), 'Makine değişti'); }} />
                <div className="tc-rr1-fsnums">
                  <SayiAlani etiket="Hazırlık dk" deger={a.setup} kapali={!duzen} yaz={(v) => { yaz(a, (x) => sureYaz(x, 'setup', v), 'Hazırlık süresi değişti'); }} />
                  <SayiAlani etiket="İşlem dk" deger={a.proc} kapali={!duzen} yaz={(v) => { yaz(a, (x) => sureYaz(x, 'proc', v), 'İşlem süresi değişti'); }} />
                  <SayiAlani etiket="Değişim dk" deger={a.chg} kapali={!duzen} yaz={(v) => { yaz(a, (x) => sureYaz(x, 'chg', v), 'Değişim süresi değişti'); }} />
                </div>
                <small className="tc-rr1-fsoran">Değişim {oran === null ? '—' : `%${sayi(Math.round(oran * 10) / 10)}`}</small>
              </>
            )}
          </div>
        </div>
        {adimEkleDugmesi(a.id, son)}
      </div>
    );

    const km = kart ? h.malzeme.get(kart.itemId) : undefined;
    const sag = (
      <div className="tc-rr1-fcol">
        {son ? (
          <Kart m={m} ek={`tc-rr1-fc-ana${tuketen ? '' : ' tc-rr1-fc-son'}`} baslik={m.code}
            alt={tuketen ? `↓ ${tuketenKod ?? '?'} OP ${String(statuNo(tuketen.adim))} ${h.op.get(tuketen.adim.opId)?.abbr ?? ''} adımına girer` : 'ürün, stoğa girer'}
            sag={<span className="tc-rr1-fcq">{sayi(Math.round(q * 100) / 100)}</span>} />
        ) : kart && (
          <Kart m={km} ek="tc-rr1-fc-akis tc-rr1-fc-ara" baslik={kartBasligi(km, kart.adim, r.duzen.opAdi)} alt="statülü kart, sonraki adıma"
            sag={<span className="tc-rr1-fcq">{sayi(Math.round(q * 100) / 100)}</span>} />
        )}
        {a.outs.map((o, sira2) => {
          const om = h.malzeme.get(o.itemId);
          if (!om) return null;
          const ySecili = sec?.tur === 'yan' && sec.urunId === urunId && sec.adimId === a.id && sec.sira === sira2;
          return (
            <Kart key={`y${String(sira2)}`} m={om} ek={`tc-rr1-fc-out${ySecili ? ' tc-rr1-secili' : ''}`} baslik={om.code} alt="">
              <button type="button" className="tc-rr1-fcsec"
                onClick={() => { r.sec({ tur: 'yan', urunId, adimId: a.id, sira: sira2, nid: `${urunId}>${a.id}.y${String(sira2)}`, miktar: q * (o.qty || 0) }); }}>
                <span className={`tc-rr1-slot tc-rr1-slot-${om.type}`}>{turKisa(om.type)}</span>
                <span className="tc-rr1-fct"><b>{om.code}</b><small>yan ürün</small></span>
              </button>
              <span className="tc-rr1-fcin">
                <SayiAlani etiket={`${om.code} yan ürün miktarı`} deger={o.qty} birim={om.unit ?? ''} kapali={!duzen}
                  yaz={(v) => { yaz(a, (y) => ({ ...y, outs: y.outs.map((g, i) => (i === sira2 ? { ...g, qty: v ?? 0 } : g)) }), 'Yan ürün miktarı değişti'); }} />
              </span>
              {duzen && (
                <button type="button" className="tc-rr1-ib tc-rr1-ib-sil" aria-label={`${om.code} yan ürününü kaldır`}
                  onClick={() => { yaz(a, (y) => ({ ...y, outs: y.outs.filter((_, i) => i !== sira2) }), 'Yan ürün kaldırıldı'); }}>
                  <Simge ad="x" boyut="k" />
                </button>
              )}
            </Kart>
          );
        })}
        {duzen && (
          <button type="button" className="tc-rr1-add" onClick={() => { r.sec({ tur: 'yanEkle', urunId, adimId: a.id, yerine: null }); }}>
            <Simge ad="plus" boyut="k" /> Yan ürün
          </button>
        )}
      </div>
    );

    return [
      j > 0 && (
        <div key={`c${a.id}`} className="tc-rr1-frow tc-rr1-fconnrow">
          <div />
          <div className={`tc-rr1-fconn tc-rr1-fconn-${a.dep}`}>
            <button type="button" className={`tc-rr1-deppill tc-rr1-dep-${a.dep}`} disabled={!duzen} title="Önceki adımla ilişki: dokununca değişir"
              onClick={() => { yaz(a, (x) => bagimlilikYaz(x, sonrakiBagimlilik(x.dep)), 'Bağlılık değişti'); }}>{bagMetni(a)}</button>
          </div>
          <div />
        </div>
      ),
      <div key={`s${a.id}`} className={`tc-rr1-frow${ustunde === a.id ? ' tc-rr1-birak' : ''}`}
        onDragOver={(e) => { if (duzen) { e.preventDefault(); setUstunde(a.id); } }}
        onDragLeave={() => { setUstunde(null); }}
        onDrop={(e) => { e.preventDefault(); setUstunde(null); if (duzen) birak(a, e.dataTransfer.getData(SURUKLE_TURU)); }}>
        {sol}{orta}{sag}
      </div>,
    ];
  });

  return (
    <section className={`tc-rr1-ftab${kokMu ? ' tc-rr1-ftab-kok' : ''}`} aria-label={`${m.code} rotası`}>
      <div className="tc-rr1-ftab-hd">
        <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span>
        <b>{m.code} {m.name}</b>
        {V && <span className={`tc-rr1-rvchip tc-rr1-rv-${V.status}`}>Rev {V.no}</span>}
        <span className="tc-rr1-ipucu">{miktarMetni(q, m.unit)}{tuketen ? `, ${tuketenKod ?? '?'} için alt montaj` : ', ana ürün'}</span>
      </div>
      <div className="tc-rr1-frow tc-rr1-fhead" aria-hidden="true"><div>Girenler</div><div>Rota adımları</div><div>Çıkanlar</div></div>
      {liste.length > 0 ? satirlar : (
        <div className="tc-rr1-frow">
          <div />
          <div className="tc-rr1-fcol tc-rr1-fmid"><p className="tc-rr1-ipucu">Rota yok.</p>{adimEkleDugmesi(null, true)}</div>
          <div />
        </div>
      )}
    </section>
  );
}

// urunler şemanın rota listesidir; ilki kök üründür.
export function AkisTablosu({ r, urunler, miktar }: { r: RotaEkrani; urunler: readonly string[]; miktar: number }) {
  const dz = r.duzen;
  const kok = urunler[0];
  if (kok === undefined) return null;
  const agac = agacKur(kok, miktar, dz.adimlar, (id) => dz.h.malzeme.get(id));
  const sira = rotaSirasi(agac, (id) => dz.h.malzeme.get(id), (id) => dz.adimlar(id).length > 0 || dz.revler(id).some((x) => x.status === 'taslak' || x.status === 'onay'));
  return (
    <div className="tc-rr1-rtab-wrap">
      {sira.map((s, i) => {
        const sonraki = i < sira.length - 1;
        return [
          <RotaBolumu key={s.id} r={r} s={s} kokMu={s.id === kok} sira={sira} />,
          sonraki && (
            <div key={`l${s.id}`} className="tc-rr1-ftlink">
              ↓ {dz.h.malzeme.get(s.id)?.code ?? '?'}{s.tuketen ? ` ${dz.h.malzeme.get(s.tuketen.urunId)?.code ?? '?'} akışına girer` : ''}
            </div>
          ),
        ];
      })}
    </div>
  );
}
