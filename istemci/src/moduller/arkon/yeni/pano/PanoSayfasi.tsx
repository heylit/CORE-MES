import { useCallback, useEffect, useState } from 'react';
import { kayitIlgili, seyrelt } from '../../../../../../arkon/web/src/data/log-tepki.ts';
import { yuzdeMetni } from '../../../../../../arkon/web/src/data/yuzde.ts';
import type { LogCall, LogCount, LogEvent, Maint, Pkg, Result } from '../../../../../../arkon/shared/model.ts';
import { DurumKutusu, Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { durusNedeni } from '../cekirdek/ayarlar.ts';
import { dakika, dakikaMetni, saat, sayi } from '../cekirdek/bicim.ts';
import { CAGRI_EKIPLERI } from '../cekirdek/sabitler.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import {
  anlikVardiyasi, cagrilariTopla, kapsamKisa, panoOzeti, type PanoKarosu, type PanoVerisi,
} from './kurallar.ts';
import { IsMerkeziSuzgeci, SayfaCercevesi, useYerelSecim } from './ortak.tsx';

// Fabrika panosu (pano-planlama.ts BoardApp): bütün istasyonlar canlı, vardiya OEE'si, açık çağrı ve arıza, yaklaşan planlı duruş; TV modu.
const ekipAdi = (k: string): string => CAGRI_EKIPLERI.find((x) => x.k === k)?.l ?? k;

export function PanoSayfasi() {
  const { depo, ayarlar } = useArkon();
  const [wc, wcYaz] = useYerelSecim('boardWc', '');
  const [tv, tvYaz] = useState(false);
  const [d, dYaz] = useState<PanoVerisi | null>(null);
  const simdi = useSimdi(5000);

  const ayarlarRef = useAyarRef(ayarlar);
  const yukle = useCallback(async () => {
    const t = Date.now();
    const sh = anlikVardiyasi(ayarlarRef.current, t);
    try {
      const [ev, cn, calls, pk, rs, mt] = await Promise.all([
        depo.Log.query('events', { from: t - 3 * 864e5, limit: 20000 }), depo.Log.query('counts', { from: sh.s, limit: 20000 }),
        depo.Log.query('calls', { from: t - 12 * 3600e3, limit: 5000 }), depo.DB.all('pkgs'), depo.DB.all('results'), depo.DB.all('maint'),
      ]);
      dYaz({
        ev: ev as unknown as LogEvent[], cn: cn as unknown as LogCount[], calls: cagrilariTopla(calls as unknown as LogCall[]), pk: pk as Pkg[],
        rs: Object.fromEntries((rs as Result[]).map((r) => [r.id, r])), mt: mt as Maint[], sh, at: t,
      });
    } catch { /* okunamayan tur bir sonraki yenilemede tekrar denenir */ }
  }, [depo, ayarlarRef]);
  useEffect(() => {
    void yukle();
    const s = seyrelt(() => { void yukle(); }, 300);
    const birak1 = depo.Log.on((k) => { if (kayitIlgili(k, null, ['events', 'counts', 'calls'], null)) s.tetikle(); });
    const birak2 = depo.Bus.on((m) => { if (/^(call|progress|pkg|maint|downs|cfg)/.test(m.type) || m.type === '$log') s.tetikle(); });
    const t = setInterval(() => { void yukle(); }, 20000);
    return () => { birak1(); birak2(); s.birak(); clearInterval(t); };
  }, [depo, yukle]);

  // TV modunda Arkon'un gezinmesi ve çağrı bandı gizlenir, yazılar büyür (eski html.tv).
  useEffect(() => {
    document.documentElement.classList.toggle('tc-ay-tv', tv);
    return () => document.documentElement.classList.remove('tc-ay-tv');
  }, [tv]);

  const tvDegistir = async () => {
    const ac = !tv;
    tvYaz(ac);
    try {
      if (ac && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if (!ac && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* tam ekran izni yok: pano yerinde kalır */ }
  };

  const o = d ? panoOzeti(d, simdi, ayarlar, wc) : null;
  const ek = <Dugme simge="expand" onClick={() => { void tvDegistir(); }}>{tv ? 'TV modundan çık' : 'TV modu'}</Dugme>;
  return (
    <SayfaCercevesi simge="grid" baslik="Fabrika panosu" renk="run" ek={ek}>
      <div className="tc-ay3-arac"><IsMerkeziSuzgeci deger={wc} degistir={wcYaz} /></div>
      <div className="tc-ay3-ozet">
        {d?.sh.tanimsiz
          ? <VardiyaTanimsiz />
          : <OzetKutu ust={`OEE · Vardiya ${d ? d.sh.name : ''}`} deger={yuzdeMetni(o?.oee)} alt={`K ${yuzdeMetni(o?.A)} · P ${yuzdeMetni(o?.P)} · Q ${yuzdeMetni(o?.Q)}`} />}
        <OzetKutu ust="Çalışıyor" renk="run" deger={String(o?.calisan ?? 0)} alt={`/ ${o?.karolar.length ?? 0} istasyon`} />
        <OzetKutu ust="Plansız duruş" renk="stop" deger={String(o?.plansiz ?? 0)} alt={`${dakikaMetni(o?.toplam.stop)} bu vardiya`} />
        <OzetKutu ust="Planlı duruş" renk="done" deger={String(o?.planli ?? 0)} alt="takvim + planlı neden" />
        <OzetKutu ust="Üretim · vardiya" deger={sayi(o?.toplam.good ?? 0)} alt={`${sayi(o?.toplam.scrap ?? 0)} hurda`} />
        <OzetKutu ust="Açık çağrı" renk={o?.acikCagrilar.length ? 'hazard' : 'idle'} deger={String(o?.acikCagrilar.length ?? 0)}
          alt={o?.yukseltilen ? `${o.yukseltilen} yükseltildi` : 'yükseltilen yok'} />
      </div>
      <div className="tc-ay3-pano">
        <div>
          {!o ? <DurumKutusu durum="yukleniyor" />
            : !o.karolar.length ? <DurumKutusu durum="bos" mesaj={depo.status().mode === 'server' ? 'İstasyon yok. İstasyonlar TMI\'de İstasyonlar sayfasından eklenir.' : 'İstasyon yok. Ayarlar › Tesis yapısı\'ndan istasyon ekleyin.'} />
            : o.gruplar.map((g) => (
              <section key={g.wc} className="tc-ay3-grup" aria-label={g.ad}>
                <span className="tc-ay3-ust">{g.ad}</span>
                <div className="tc-ay3-karolar">{g.karolar.map((k) => <Karo key={k.s.id} k={k} simdi={simdi} />)}</div>
              </section>
            ))}
        </div>
        <aside className="tc-ay3-yan">
          <div className="tc-ay3-kutu" aria-label="Açık çağrılar">
            <span className="tc-ay3-ust">Açık çağrılar</span>
            {o?.acikCagrilar.length ? o.acikCagrilar.map((c) => (
              <div key={c.id} className="tc-ay3-satir" data-renk={c.esc ? 'stop' : c.ack ? 'done' : undefined}>
                <b>{c.machine} · {ekipAdi(c.team)}</b>
                <small>{c.ack ? `Üstlendi: ${c.ackBy || ''} · ` : c.esc ? 'YÜKSELTİLDİ · ' : 'Bekliyor · '}{dakika(simdi - (c.open ?? simdi))} dk{c.note ? ` · ${c.note}` : ''}</small>
              </div>
            )) : <small className="tc-ay3-not">Açık çağrı yok</small>}
          </div>
          <div className="tc-ay3-kutu" aria-label="Açık arızalar">
            <span className="tc-ay3-ust">Açık arızalar</span>
            {o?.arizalar.length ? o.arizalar.map((m) => m.type === 'ariza' && (
              <div key={m.id} className="tc-ay3-satir">
                <b>{m.st}{m.mc ? ` · ${m.mc}` : ''}</b>
                <small>{m.title} · {dakika(simdi - m.openedAt)} dk{m.ackBy ? ` · ${m.ackBy}` : ''}</small>
              </div>
            )) : <small className="tc-ay3-not">Açık arıza yok</small>}
          </div>
          <div className="tc-ay3-kutu" aria-label="Yaklaşan planlı duruşlar">
            <span className="tc-ay3-ust">Yaklaşan planlı duruşlar · 8 saat</span>
            {o?.yaklasanDuruslar.length ? o.yaklasanDuruslar.map((w) => (
              <div key={w.d.id + String(w.s)} className="tc-ay3-satir" data-renk="done">
                <b>{w.d.title || durusNedeni(ayarlar, w.d.reason)?.l}</b>
                <small>{saat(w.s)}–{saat(w.e)} · {kapsamKisa(w.d, ayarlar)}</small>
              </div>
            )) : <small className="tc-ay3-not">Yok</small>}
          </div>
        </aside>
      </div>
    </SayfaCercevesi>
  );
}

// Yükleme işlevi ayarlar değişince yeniden kurulmasın (abonelikler bozulmasın) diye son ayarlar ref'te tutulur.
function useAyarRef<T>(v: T): { current: T } {
  const [ref] = useState(() => ({ current: v }));
  ref.current = v;
  return ref;
}

function OzetKutu({ ust, deger, alt, renk }: { ust: string; deger: string; alt: string; renk?: 'run' | 'stop' | 'done' | 'hazard' | 'idle' }) {
  return (
    <div className="tc-ay3-ozet-kutu" data-renk={renk}>
      <span className="tc-ay3-ust">{ust}</span><b>{deger}</b><small>{alt}</small>
    </div>
  );
}

export function VardiyaTanimsiz() {
  return (
    <div className="tc-ay3-ozet-kutu" role="status">
      <span className="tc-ay3-uyari"><Simge ad="alert" /> Vardiya tanımsız</span>
      <small>Aktif vardiya tanımlanmadığı için OEE ve vardiya süresi gösterilmiyor. Yönetici Ayarlar › Vardiyalar&apos;dan tanımlar.</small>
    </div>
  );
}

function Karo({ k, simdi }: { k: PanoKarosu; simdi: number }) {
  const { ayarlar } = useArkon();
  const { s, pkg, res, c, look } = k;
  const iyi = res?.good || 0;
  const plansiz = k.state === 'stopped' && look.etiket !== 'Planlı duruş';
  return (
    <div className="tc-ay3-kutu tc-ay3-karo" data-durum={look.durum} data-plansiz={plansiz || undefined} aria-label={`${s.id} ${look.etiket}`}>
      <div className="tc-ay3-karo-ust"><b className="mono">{s.id}</b><span className="tc-ay3-karo-durum"><i aria-hidden="true" />{look.etiket}{k.since ? ` · ${dakikaMetni(simdi - k.since)}` : ''}</span></div>
      <small className="tc-ay3-not">{s.name}{s.mcs.length === 1 ? ` · ${s.mcs[0]?.name ?? ''}` : ''}</small>
      {k.state === 'stopped' && k.last?.reason
        ? <div>{durusNedeni(ayarlar, k.last.reason)?.l ?? k.last.reason}</div>
        : k.state === 'stopped' ? <div className="tc-ay3-uyari">Neden girilmedi</div> : null}
      {pkg ? (
        <div>
          <small className="tc-ay3-not">{pkg.no}</small> <b>{pkg.part}</b>
          {pkg.target ? (
            <>
              <progress className="tc-ay3-cubuk" max={pkg.target} value={Math.min(iyi, pkg.target)} aria-label="İlerleme" />
              <small className="tc-ay3-not">{sayi(iyi)} / {sayi(pkg.target)}</small>
            </>
          ) : null}
        </div>
      ) : <div className="tc-ay3-not">İş yok</div>}
      {k.bekleyen && <div className="tc-ay3-not"><Simge ad="clock" boyut="k" /> {k.bekleyen}</div>}
      <div className="tc-ay3-karo-alt">
        {k.tanimsiz
          ? <span title="Aktif vardiya tanımlı değil"><Simge ad="alert" boyut="k" /> Vardiya tanımsız</span>
          : <span title="Bu vardiyanın OEE'si">OEE <b>{yuzdeMetni(c.oee)}</b></span>}
        <span>İyi <b>{sayi(c.good)}</b></span>
        <span>Hurda <b className={c.scrap ? 'tc-ay3-gec' : undefined}>{c.scrap}</b></span>
      </div>
      {(k.calls.length > 0 || k.mts.length > 0 || k.dn || k.nx) && (
        <div className="tc-ay3-bayraklar">
          {k.calls.map((x) => <span key={x.id} data-renk={x.esc ? 'stop' : 'hazard'} className="tc-ay3-cip"><Simge ad="bell" boyut="k" />{ekipAdi(x.team)}{x.ack ? ' ✓' : ''}</span>)}
          {k.mts.length > 0 && <span data-renk="stop" className="tc-ay3-cip"><Simge ad="wrench" boyut="k" />Arıza</span>}
          {k.dn ? <span data-renk="done" className="tc-ay3-cip"><Simge ad="clock" boyut="k" />Planlı → {saat(k.dn.e)}</span>
            : k.nx ? <span data-renk="done" className="tc-ay3-cip"><Simge ad="clock" boyut="k" />{saat(k.nx.s)} planlı</span> : null}
        </div>
      )}
    </div>
  );
}
