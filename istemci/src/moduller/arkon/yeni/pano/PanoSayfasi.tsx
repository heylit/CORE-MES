import { useCallback, useEffect, useState } from 'react';
import { kayitIlgili, seyrelt } from '../../../../../../arkon/web/src/data/log-tepki.ts';
import { yuzdeMetni } from '../../../../../../arkon/web/src/data/yuzde.ts';
import type { LogCall, LogCount, LogEvent, Maint, Pkg, Result } from '../../../../../../arkon/shared/model.ts';
import type { KucukResim } from '#paylasilan/sozlesme/cizimler.ts';
import { DurumKutusu, Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { KucukResimKutusu, useKucukResimler } from '../../../cizimler/disari.ts';
import { durusNedeni } from '../cekirdek/ayarlar.ts';
import { dakika, dakikaMetni, saat, sayi } from '../cekirdek/bicim.ts';
import { CAGRI_EKIPLERI } from '../cekirdek/sabitler.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import {
  anlikVardiyasi, cagrilariTopla, enCokUretim, enDusukOee, kapsamKisa, karoSinifi, karoSiniflari, panoOzeti,
  type PanoKarosu, type PanoOzeti, type PanoVerisi, type Renk,
} from './kurallar.ts';
import { GrafikKart, Halka, KisaSatir } from './Halka.tsx';
import { IsMerkeziSuzgeci, SayfaCercevesi, useYerelSecim } from './ortak.tsx';

// Fabrika panosu (pano-planlama.ts BoardApp): bütün istasyonlar canlı, vardiya OEE'si, açık çağrı ve arıza, yaklaşan planlı duruş; TV modu.
// Düzen CNC Kurulum ana sayfasının dilindedir (778 a): özet kartları, resimli istasyon kartları, altta halkalı grafik kartları.
// İstasyon resmi istasyona bağlı 3B modelin Çizim Merkezi'nde üretilmiş küçük resmidir; yoksa yer tutucu ikon.
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

  // TV modunda yalnız pano ekranı kaplar: kabuk (yan menü, üst bant), Arkon'un gezinmesi ve çağrı bandı panonun altında
  // kalır, yazılar büyür (eski html.tv). Tam ekran belgeye istenir ki gövdeye açılan bildirimler de görünsün; tarayıcı izin
  // vermezse katman yine ekranı kaplar. Tarayıcının kendi çıkışı (Escape, F11) TV modunu da kapatır.
  useEffect(() => {
    document.documentElement.classList.toggle('tc-ay-tv', tv);
    return () => document.documentElement.classList.remove('tc-ay-tv');
  }, [tv]);
  useEffect(() => {
    if (!tv) return undefined;
    const degisti = () => { if (!document.fullscreenElement) tvYaz(false); };
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape' && !document.fullscreenElement) tvYaz(false); };
    document.addEventListener('fullscreenchange', degisti);
    window.addEventListener('keydown', tus);
    return () => { document.removeEventListener('fullscreenchange', degisti); window.removeEventListener('keydown', tus); };
  }, [tv]);
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); }, []);

  const tvDegistir = () => {
    const ac = !tv;
    tvYaz(ac);
    const kok = document.documentElement;
    if (ac && typeof kok.requestFullscreen === 'function' && !document.fullscreenElement) void kok.requestFullscreen().catch(() => undefined);
    else if (!ac && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  const o = d ? panoOzeti(d, simdi, ayarlar, wc) : null;
  const tmiKimligi = new Map(ayarlar.tesis.sts.flatMap((s) => (s.tmi === undefined ? [] : [[s.id, s.tmi] as const])));
  const resimler = useKucukResimler('istasyonlar', o ? o.karolar.flatMap((k) => tmiKimligi.get(k.s.id) ?? []) : []);
  const ek = <Dugme simge="expand" onClick={tvDegistir}>{tv ? 'TV modundan çık' : 'TV modu'}</Dugme>;
  const plansizDk = o ? Math.round(o.toplam.stop / 60e3) : null;
  return (
    <div className="tc-ay-tv-kap" data-tv={tv || undefined}>
      <SayfaCercevesi simge="grid" baslik="Fabrika panosu" renk="run" ek={ek}>
        <div className="tc-ay3-arac"><IsMerkeziSuzgeci deger={wc} degistir={wcYaz} /></div>
        <div className="tc-ay3-ozet tc-ay3-pano-ozet">
          {d?.sh.tanimsiz
            ? <VardiyaTanimsiz />
            : <OzetKutu ust={`OEE · Vardiya ${d ? d.sh.name : ''}`} renk="hazard" deger={yuzdeMetni(o?.oee)} alt={`K ${yuzdeMetni(o?.A)} · P ${yuzdeMetni(o?.P)} · Q ${yuzdeMetni(o?.Q)}`} />}
          <OzetKutu ust="Çalışıyor" renk="run" deger={String(o?.calisan ?? 0)} alt={`/ ${o?.karolar.length ?? 0} istasyon`} />
          <OzetKutu ust="Plansız duruş" renk="stop" deger={String(o?.plansiz ?? 0)} alt={`${dakikaMetni(o?.toplam.stop)} bu vardiya`} />
          <OzetKutu ust="Planlı duruş" renk="done" deger={String(o?.planli ?? 0)} alt="takvim + planlı neden" />
          <OzetKutu ust="Üretim · vardiya" deger={sayi(o?.toplam.good ?? 0)} alt={`${sayi(o?.toplam.scrap ?? 0)} hurda`} />
          <OzetKutu ust="Açık çağrı" renk={o?.acikCagrilar.length ? 'stop' : undefined} deger={String(o?.acikCagrilar.length ?? 0)}
            alt={o?.yukseltilen ? `${o.yukseltilen} yükseltildi` : 'yükseltilen yok'} />
        </div>
        {!o ? <DurumKutusu durum="yukleniyor" />
          : !o.karolar.length ? <DurumKutusu durum="bos" mesaj={depo.status().mode === 'server' ? 'İstasyon yok. İstasyonlar TMI\'de İstasyonlar sayfasından eklenir.' : 'İstasyon yok. Ayarlar › Tesis yapısı\'ndan istasyon ekleyin.'} />
          : o.gruplar.map((g) => (
            <section key={g.wc} className="tc-ay3-grup" aria-label={g.ad}>
              <div className="tc-ay3-gkart-bas"><h3>İstasyonlar · {g.ad}</h3><span>{g.karolar.length} istasyon</span></div>
              <div className="tc-ay3-karolar">{g.karolar.map((k) => <Karo key={k.s.id} k={k} simdi={simdi} resim={resimAl(resimler, tmiKimligi.get(k.s.id))} />)}</div>
            </section>
          ))}
        {o && o.karolar.length > 0 && <Grafikler o={o} simdi={simdi} plansizDk={plansizDk} vardiya={d?.sh.tanimsiz ? null : d?.sh.name ?? null} />}
      </SayfaCercevesi>
    </div>
  );
}

const resimAl = (resimler: Map<number, KucukResim>, tmi: number | undefined): KucukResim | null => (tmi === undefined ? null : resimler.get(tmi) ?? null);

// Yükleme işlevi ayarlar değişince yeniden kurulmasın (abonelikler bozulmasın) diye son ayarlar ref'te tutulur.
function useAyarRef<T>(v: T): { current: T } {
  const [ref] = useState(() => ({ current: v }));
  ref.current = v;
  return ref;
}

function OzetKutu({ ust, deger, alt, renk }: { ust: string; deger: string; alt: string; renk?: Renk }) {
  return (
    <div className="tc-ay3-ozet-kutu" data-renk={renk}>
      <span className="tc-ay3-ozet-ust">{ust}</span><b>{deger}</b><small>{alt}</small>
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

function Karo({ k, simdi, resim }: { k: PanoKarosu; simdi: number; resim: KucukResim | null | undefined }) {
  const { ayarlar } = useArkon();
  const { s, pkg, res, c, look } = k;
  const iyi = res?.good || 0;
  const hurda = res?.scrap || 0;
  const hedef = pkg?.target || 0;
  const plansiz = k.state === 'stopped' && look.etiket !== 'Planlı duruş';
  const neden = k.state === 'stopped' ? (k.last?.reason ? durusNedeni(ayarlar, k.last.reason)?.l ?? k.last.reason : null) : null;
  return (
    <article className="tc-ay3-karo" data-durum={look.durum} data-plansiz={plansiz || undefined} aria-label={`${s.id} ${look.etiket}`}>
      <div className="tc-ay3-karo-ust">
        <KucukResimKutusu resim={resim} ad={`${s.id} · ${s.name}`} boy="orta" />
        <div className="tc-ay3-karo-ad">
          <b><span className="mono">{s.id}</span> · {s.name}</b>
          <small>{s.wcName}{s.mcs.length === 1 ? ` · ${s.mcs[0]?.name ?? ''}` : ''}</small>
          <span className="tc-ay3-karo-durum"><i aria-hidden="true" />{look.etiket}{k.since ? ` · ${dakikaMetni(simdi - k.since)}` : ''}</span>
        </div>
      </div>
      <IlerlemeCubugu iyi={iyi} hurda={hurda} hedef={hedef} />
      <div className="tc-ay3-karo-satir">
        <span>Üretim <b>{sayi(iyi)}/{hedef ? sayi(hedef) : '—'}</b></span>
        {k.tanimsiz
          ? <span title="Aktif vardiya tanımlı değil"><Simge ad="alert" boyut="k" /> Vardiya tanımsız</span>
          : <span title="Bu vardiyanın OEE'si ve hurdası">OEE <b>{yuzdeMetni(c.oee)}</b> · Hurda <b className={c.scrap ? 'tc-ay3-gec' : undefined}>{c.scrap}</b></span>}
      </div>
      <div className="tc-ay3-karo-is">
        {k.state === 'stopped'
          ? (neden ? <>Duruş: <b>{neden}</b></> : <span className="tc-ay3-uyari">Neden girilmedi</span>)
          : pkg ? <>İş: <b>{pkg.no} · {pkg.part}</b></> : 'İş yok'}
      </div>
      {k.bekleyen && <div className="tc-ay3-karo-is"><Simge ad="clock" boyut="k" /> {k.bekleyen}</div>}
      {k.calls.map((x) => (
        <div key={x.id} className="tc-ay3-bayrak" data-renk={x.esc ? 'stop' : 'hazard'}>
          <Simge ad="bell" boyut="k" />{ekipAdi(x.team)} çağrısı · {x.esc ? 'YÜKSELTİLDİ' : x.ack ? 'üstlenildi' : 'bekliyor'} · {dakika(simdi - (x.open ?? simdi))} dk
        </div>
      ))}
      {k.mts.length > 0 && <div className="tc-ay3-bayrak" data-renk="stop"><Simge ad="wrench" boyut="k" />Açık arıza · {k.mts[0]?.title ?? ''}</div>}
      {k.dn ? <div className="tc-ay3-bayrak" data-renk="done"><Simge ad="clock" boyut="k" />Planlı duruş → {saat(k.dn.e)}</div>
        : k.nx ? <div className="tc-ay3-bayrak" data-renk="done"><Simge ad="clock" boyut="k" />{saat(k.nx.s)} planlı duruş</div> : null}
    </article>
  );
}

// İş ilerlemesi: iyi, hurda ve kalan aynı çubukta (CNC kartlarının parçalı çubuğu). Hedef yoksa çubuk boş kalır.
function IlerlemeCubugu({ iyi, hurda, hedef }: { iyi: number; hurda: number; hedef: number }) {
  if (!hedef) return <svg className="tc-ay3-karo-cubuk" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" />;
  const iyiPay = Math.min(100, (iyi / hedef) * 100);
  const hurdaPay = Math.min(100 - iyiPay, (hurda / hedef) * 100);
  return (
    <svg className="tc-ay3-karo-cubuk" viewBox="0 0 100 8" preserveAspectRatio="none" role="img"
      aria-label={`İlerleme: ${sayi(iyi)} iyi, ${sayi(hurda)} hurda, hedef ${sayi(hedef)}`}>
      <rect data-renk="run" x="0" y="0" width={iyiPay} height="8" />
      <rect data-renk="stop" x={iyiPay} y="0" width={hurdaPay} height="8" />
    </svg>
  );
}

// Alt sıra: üç halkalı kart (OEE, istasyon durumu, vardiya üretimi, açık çağrılar) ve iki liste (arıza, planlı duruş).
function Grafikler({ o, simdi, plansizDk, vardiya }: { o: PanoOzeti; simdi: number; plansizDk: number | null; vardiya: string | null }) {
  const { ayarlar } = useArkon();
  const sinif = karoSiniflari(o.karolar);
  const dusuk = enDusukOee(o.karolar);
  const enCok = enCokUretim(o.karolar);
  const yukseltilen = o.acikCagrilar.filter((c) => c.esc).length;
  const ustlenilen = o.acikCagrilar.filter((c) => !c.esc && c.ack).length;
  const bekleyen = o.acikCagrilar.length - yukseltilen - ustlenilen;
  const iyi = o.toplam.good;
  const hurda = o.toplam.scrap;
  const hurdaOrani = iyi + hurda ? hurda / (iyi + hurda) : null;
  const plansizlar = o.karolar.filter((k) => karoSinifi(k) === 'plansiz');
  return (
    <div className="tc-ay3-grafikler">
      <GrafikKart baslik="Vardiya OEE" not={vardiya === null ? 'vardiya tanımsız' : 'en düşük istasyonlar'}>
        <Halka etiket={`Vardiya OEE ${yuzdeMetni(o.oee)}`} orta={yuzdeMetni(o.oee)} ortaAlt="OEE"
          dilimler={o.oee == null ? [] : [{ deger: o.oee, renk: 'hazard' }]} olcek={1}
          lejant={[
            { ad: 'Kullanılabilirlik', metin: yuzdeMetni(o.A), renk: 'done' },
            { ad: 'Performans', metin: yuzdeMetni(o.P), renk: 'hold' },
            { ad: 'Kalite', metin: yuzdeMetni(o.Q), renk: 'run' },
          ]} />
        <div className="tc-ay3-kliste">
          {dusuk.length ? dusuk.map((k) => (
            <KisaSatir key={k.s.id} sol={k.s.wcName} kod={k.s.id} ad={k.s.name} deger={yuzdeMetni(k.c.oee)} alt={k.look.etiket}
              renk={(k.c.oee ?? 1) < 0.6 ? 'stop' : undefined} />
          )) : <small className="tc-ay3-not">OEE verisi yok</small>}
        </div>
      </GrafikKart>
      <GrafikKart baslik="İstasyon durumu" not={`${o.karolar.length} istasyon`}>
        <Halka etiket={`${sinif.calisiyor} çalışıyor, ${sinif.plansiz} plansız duruş, ${sinif.planli} planlı duruş, ${sinif.diger} diğer`}
          orta={`${sinif.calisiyor}/${o.karolar.length}`} ortaAlt="çalışıyor"
          dilimler={[{ deger: sinif.calisiyor, renk: 'run' }, { deger: sinif.plansiz, renk: 'stop' }, { deger: sinif.planli, renk: 'done' }, { deger: sinif.diger, renk: 'idle' }]}
          lejant={[
            { ad: 'Çalışıyor', metin: String(sinif.calisiyor), renk: 'run' },
            { ad: 'Plansız duruş', metin: String(sinif.plansiz), renk: 'stop' },
            { ad: 'Planlı duruş', metin: String(sinif.planli), renk: 'done' },
            { ad: 'Boşta, ayar, veri yok', metin: String(sinif.diger), renk: 'idle' },
          ]} />
        <div className="tc-ay3-kliste">
          {plansizlar.length ? plansizlar.slice(0, 4).map((k) => (
            <KisaSatir key={k.s.id} sol={k.s.wcName} kod={k.s.id}
              ad={k.last?.reason ? durusNedeni(ayarlar, k.last.reason)?.l ?? k.last.reason : 'Neden girilmedi'}
              deger={k.since ? `${dakika(simdi - k.since)} dk` : '—'} alt="plansız duruş" renk="stop" />
          )) : <small className="tc-ay3-not">Plansız duruş yok{plansizDk ? ` · bu vardiya ${plansizDk} dk` : ''}</small>}
        </div>
      </GrafikKart>
      <GrafikKart baslik="Vardiya üretimi" not="iyi ve hurda">
        <Halka etiket={`${sayi(iyi)} iyi, ${sayi(hurda)} hurda`} orta={sayi(iyi)} ortaAlt="iyi adet"
          dilimler={[{ deger: iyi, renk: 'run' }, { deger: hurda, renk: 'stop' }]}
          lejant={[
            { ad: 'İyi', metin: sayi(iyi), renk: 'run' },
            { ad: 'Hurda', metin: sayi(hurda), renk: 'stop' },
            { ad: 'Hurda oranı', metin: yuzdeMetni(hurdaOrani) },
          ]} />
        <div className="tc-ay3-kliste">
          {enCok.length ? enCok.map((k) => (
            <KisaSatir key={k.s.id} sol={k.s.wcName} kod={k.s.id} ad={k.pkg?.part || k.s.name} deger={sayi(k.c.good)}
              alt={k.pkg?.target ? `hedef ${sayi(k.pkg.target)}` : 'hedefsiz'} renk="run" />
          )) : <small className="tc-ay3-not">Bu vardiya üretim yok</small>}
        </div>
      </GrafikKart>
      <GrafikKart baslik="Açık çağrılar" not="son 12 saat">
        <Halka etiket={`${o.acikCagrilar.length} açık çağrı`} orta={String(o.acikCagrilar.length)} ortaAlt="çağrı"
          dilimler={[{ deger: yukseltilen, renk: 'stop' }, { deger: ustlenilen, renk: 'done' }, { deger: bekleyen, renk: 'hazard' }]}
          lejant={[
            { ad: 'Yükseltildi', metin: String(yukseltilen), renk: 'stop' },
            { ad: 'Üstlenildi', metin: String(ustlenilen), renk: 'done' },
            { ad: 'Bekliyor', metin: String(bekleyen), renk: 'hazard' },
          ]} />
        <div className="tc-ay3-kliste">
          {o.acikCagrilar.length ? o.acikCagrilar.slice(0, 5).map((c) => (
            <KisaSatir key={c.id} sol={ekipAdi(c.team)} kod={c.machine} ad={c.ack ? `Üstlendi: ${c.ackBy || ''}` : c.esc ? 'YÜKSELTİLDİ' : 'Bekliyor'}
              deger={`${dakika(simdi - (c.open ?? simdi))} dk`} alt={c.note || '—'} renk={c.esc ? 'stop' : c.ack ? 'done' : 'hazard'} />
          )) : <small className="tc-ay3-not">Açık çağrı yok</small>}
        </div>
      </GrafikKart>
      <GrafikKart baslik="Açık arızalar" not={`${o.arizalar.length} kayıt`}>
        <div className="tc-ay3-kliste">
          {o.arizalar.length ? o.arizalar.map((m) => m.type === 'ariza' && (
            <KisaSatir key={m.id} sol={m.mc || ''} kod={m.st} ad={m.title} deger={`${dakika(simdi - m.openedAt)} dk`}
              alt={m.ackBy ? `üstlenen: ${m.ackBy}` : 'üstlenen yok'} renk="stop" />
          )) : <small className="tc-ay3-not">Açık arıza yok</small>}
        </div>
      </GrafikKart>
      <GrafikKart baslik="Planlı duruşlar" not="önümüzdeki 8 saat">
        <div className="tc-ay3-kliste">
          {o.yaklasanDuruslar.length ? o.yaklasanDuruslar.map((w) => (
            <KisaSatir key={w.d.id + String(w.s)} sol={`${saat(w.s)}–${saat(w.e)}`} kod={kapsamKisa(w.d, ayarlar)}
              ad={w.d.title || durusNedeni(ayarlar, w.d.reason)?.l || ''} deger={w.s <= simdi ? 'sürüyor' : `${dakika(w.s - simdi)} dk`}
              alt={durusNedeni(ayarlar, w.d.reason)?.l ?? ''} renk="done" />
          )) : <small className="tc-ay3-not">Yok</small>}
        </div>
      </GrafikKart>
    </div>
  );
}
