import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react';
import { Dugme, Qr, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { YOK, sayi } from '../cekirdek/bicim.ts';
import { bip } from '../cekirdek/ses.ts';
import { useSimdi } from '../veri/baglam.ts';
import { Cip } from './denetimler.tsx';
import { etiketSvg, etiketYazdir } from './etiket.ts';
import {
  cigNoktasi, kalemBitti, kodaUyanKalem, olcuUygun, olcumYontemi, ondalik, seriNo, sinirYakin, toplamaSirasi, torkUygun,
  type DepoKalemi, type IstasyonAyari, type MontajKalemi, type TorkAdimi,
} from './kurallar.ts';
import type { IsKurallari, OpType, Order, PlanItem, Pkg, Ton } from './tipler.ts';

// Talaşlı dışı istasyonların operatör panelleri (istasyonlar.ts PANELS). Panel yalnız `api` ile çalışır; kayıt, geri alma
// ve bildirim operatör ekranının işidir. İstasyon kaydı sonucun `sr` alanındadır.

export interface IstasyonKaydi {
  picked?: Record<string, number>; short?: Record<string, { at: number; got: number }>;
  seq?: number; log?: { sn: string; ok: boolean; at: number }[]; verified?: Record<string, number>;
  env?: { t: number; rh: number; dp: number; ok: boolean; at: number }[]; rack?: { stage: 'load' | 'oven'; n?: number; t0?: number };
  racks?: { n: number; t0?: number; t1: number; early: boolean }[]; dft?: { v: number[]; avg: number; mn: number; mx: number; ok: boolean; at: number }[];
  cur?: { comps?: Record<string, string | true | undefined>; tq?: Record<string, number>; vals?: Record<string, number | string>; def?: string[] };
  units?: { sn: string; comps: Record<string, unknown>; tq: Record<string, number>; at: number }[];
  insp?: { i: number; vals: Record<string, number | string>; def: string[]; ok: boolean; at: number }[];
}
export type IsDegisikligi = (x: Order) => Partial<Order>;
export interface PanelArayuzu {
  is: Order; paket: Pkg; ayar: IstasyonAyari; kayit: IstasyonKaydi;
  // act: geri alınabilir kayıt ve bildirim; act0: sessiz kayıt.
  yap(etiket: string, simge: SimgeAdi, ton: Ton, f: IsDegisikligi): void;
  sessiz(f: IsDegisikligi): void;
  soyle(metin: string, ton: Ton): void;
  okut(o: { baslik: string; ipucu?: string; okundu: (kod: string) => void }): void;
}
export interface PanelOzellikleri { api: PanelArayuzu; kurallar?: IsKurallari | null }

const kayitOf = (x: Order): IstasyonKaydi => (x.sr || {}) as IstasyonKaydi;
const srYaz = (x: Order, ch: Partial<IstasyonKaydi>): Partial<Order> => ({ sr: { ...kayitOf(x), ...ch } });

export function Ilerleme({ v, n, etiket, ton }: { v: number; n: number; etiket: string; ton: Ton }) {
  const p = n ? Math.min(1, v / n) : 0;
  return (
    <div className="tc-ay2-ilerleme">
      <div className="tc-ay2-ilerleme-ust"><span className="tc-ay2-ust-yazi">{etiket}</span><b className="tc-ay2-mono">{v}<small> / {n}</small></b></div>
      <Cubuk yuzde={p * 100} ton={ton} etiket={etiket} />
    </div>
  );
}
export function Cubuk({ yuzde, ton, etiket }: { yuzde: number; ton: Ton; etiket: string }) {
  return (
    <svg className="tc-ay2-cubuk" data-ton={ton} viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={etiket + ' yüzde ' + Math.round(yuzde)}>
      <rect className="tc-ay2-cubuk-zemin" x="0" y="0" width="100" height="4" />
      <rect className="tc-ay2-cubuk-dolu" x="0" y="0" width={Math.max(0, Math.min(100, yuzde))} height="4" />
    </svg>
  );
}

// Kod giriş çubuğu (CodeBar): yaz ve Enter, ya da kamera.
export function KodCubugu({ okundu, kamera, yerTutucu }: { okundu: (kod: string) => void; kamera: () => void; yerTutucu?: string }) {
  const [v, vYaz] = useState('');
  const gonder = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { okundu(v.trim()); vYaz(''); } };
  return (
    <form className="tc-ay2-kodcubugu" onSubmit={gonder}>
      <span className="tc-ay2-kodcubugu-simge"><Simge ad="scan" /></span>
      <input value={v} onChange={(e) => vYaz(e.target.value)} placeholder={yerTutucu || 'Kod yaz veya okut'} aria-label="Kod" autoCapitalize="characters" />
      <Dugme type="button" tur="ikincil" simge="scan" onClick={kamera} title="Kamerayla QR okut">QR</Dugme>
    </form>
  );
}

export function DepoPaneli({ api }: PanelOzellikleri) {
  const { ayar, kayit } = api;
  const kalemler: DepoKalemi[] = ayar.items || [];
  const toplanan = kayit.picked || {};
  const eksik = kayit.short || {};
  const [secili, seciliYaz] = useState<string | null>(null);
  const [duzenlenen, duzenlenenYaz] = useState<string | null>(null);
  const bitti = (it: DepoKalemi) => kalemBitti(it, toplanan, eksik);
  const nBitti = kalemler.filter(bitti).length;
  const miktar = kalemler.reduce((a, it) => a + Math.min(it.qty, toplanan[it.id] || 0), 0);
  const miktarT = kalemler.reduce((a, it) => a + (+it.qty || 0), 0);
  const yenidenSay = (p: Record<string, number>, s: Record<string, unknown>) => kalemler.filter((i) => kalemBitti(i, p, s)).length;
  const topla = (it: DepoKalemi, v: number, etiket?: string) => api.yap(etiket || (it.code + ' · ' + v + '/' + it.qty + ' ' + (it.unit || 'adet')), 'truck', 'run', (x) => {
    const s = kayitOf(x); const p = { ...s.picked, [it.id]: Math.max(0, v) };
    return { ...srYaz(x, { picked: p }), good: yenidenSay(p, s.short || {}) };
  });
  const eksikYaz = (it: DepoKalemi, acik: boolean) => api.yap(acik ? it.code + ' eksik bildirildi' : it.code + ' eksik kaldırıldı', 'alert', acik ? 'hold' : 'idle', (x) => {
    const s = kayitOf(x); const sh = { ...s.short };
    if (acik) sh[it.id] = { at: Date.now(), got: (s.picked || {})[it.id] || 0 }; else delete sh[it.id];
    return { ...srYaz(x, { short: sh }), good: yenidenSay(s.picked || {}, sh) };
  });
  const kodGeldi = (kod: string) => {
    const it = kodaUyanKalem(kalemler, kod);
    if (!it) { bip('nok'); api.soyle('Listede yok: ' + kod, 'stop'); return; }
    seciliYaz(it.id);
    const simdiki = toplanan[it.id] || 0;
    if (simdiki >= it.qty) { bip('nok'); api.soyle(it.code + ' zaten tamam · fazla toplama yapma', 'hold'); return; }
    bip('ok'); topla(it, simdiki + 1);
  };
  const liste = toplamaSirasi(kalemler, bitti);
  const sonraki = liste.find((i) => !bitti(i));
  const nEksik = Object.keys(eksik).length;
  return (
    <div className="tc-ay2-panel tc-ay2-depo">
      <div className="tc-ay2-panel-ust">
        <Ilerleme v={nBitti} n={kalemler.length} etiket={ayar.mode === 'receive' ? 'Kabul edilen kalem' : 'Tamamlanan kalem'} ton="run" />
        <Ilerleme v={miktar} n={miktarT} etiket="Toplam miktar" ton="done" />
      </div>
      {sonraki ? (
        <div className="tc-ay2-siradaki">
          <span className="tc-ay2-ust-yazi">Sıradaki raf</span><b className="tc-ay2-mono">{sonraki.loc || YOK}</b>
          <span>{sonraki.code} · {sonraki.name} · <b>{sonraki.qty - (toplanan[sonraki.id] || 0)} {sonraki.unit || 'adet'}</b></span>
        </div>
      ) : (
        <div className="tc-ay2-siradaki" data-ton="run">
          <Simge ad="check" /><b>Liste tamamlandı</b><span>{nEksik ? nEksik + ' kalem eksik bildirildi' : 'Eksik yok'} · işi bitirebilirsin</span>
        </div>
      )}
      <KodCubugu
        okundu={kodGeldi} yerTutucu="Ürün kodu yaz veya okut"
        kamera={() => api.okut({ baslik: 'Ürün kodunu okut', ipucu: 'Kutunun ya da rafın üzerindeki QR kodu çerçeveye getir', okundu: kodGeldi })}
      />
      <div className="tc-ay2-depo-liste">
        {liste.map((it) => {
          const g = toplanan[it.id] || 0; const d = bitti(it); const sh = eksik[it.id];
          return (
            <div key={it.id} className="tc-ay2-depo-satir" data-durum={d ? (sh ? 'eksik' : 'tamam') : undefined} data-secili={secili === it.id ? '' : undefined} onClick={() => seciliYaz(it.id)}>
              <span className="tc-ay2-mono tc-ay2-raf">{it.loc || YOK}</span>
              <div className="tc-ay2-depo-ad">
                <b className="tc-ay2-mono">{it.code}</b><span>{it.name}</span>
                {sh ? <small className="tc-ay2-eksik">Eksik · {sh.got}/{it.qty}</small> : null}
              </div>
              <div className="tc-ay2-depo-miktar">
                {duzenlenen === it.id ? (
                  <input
                    type="number" inputMode="numeric" autoFocus defaultValue={g} aria-label={it.code + ' miktarı'}
                    onBlur={(e) => { duzenlenenYaz(null); const v = +e.target.value; if (!Number.isNaN(v) && v !== g) topla(it, v); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                ) : (
                  <button type="button" className="tc-ay2-mono" title="Miktarı düzelt" onClick={(e) => { e.stopPropagation(); duzenlenenYaz(it.id); }}>{g}<small>/{it.qty}</small></button>
                )}
                <small>{it.unit || 'adet'}</small>
              </div>
              <div className="tc-ay2-depo-eylem">
                <button type="button" className="tc-ay2-arac" disabled={g <= 0} aria-label="Bir eksilt" onClick={(e) => { e.stopPropagation(); topla(it, g - 1); }}><Simge ad="minus" /></button>
                <button type="button" className="tc-ay2-arac" aria-label="Bir ekle" onClick={(e) => { e.stopPropagation(); topla(it, g + 1); }}><Simge ad="plus" /></button>
                {!d ? <Dugme tur="ikincil" onClick={(e) => { e.stopPropagation(); topla(it, it.qty, it.code + ' tamamı toplandı'); }}>Tamamı</Dugme> : null}
                <button type="button" className="tc-ay2-onay" aria-pressed={!!sh} title="Rafta yok / eksik" onClick={(e) => { e.stopPropagation(); eksikYaz(it, !sh); }}>Eksik</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const YONTEMLER: Readonly<Record<string, string>> = { lazer: 'Lazer', damga: 'Damga / nokta vuruş', etiket: 'Etiket' };
export function MarkaPaneli({ api }: PanelOzellikleri) {
  const { ayar, kayit, paket } = api;
  const sira = kayit.seq != null ? kayit.seq : (+ayar.start || 1);
  const sn = seriNo(ayar.fmt, sira, paket);
  const gunluk = kayit.log || [];
  const sonIyi = gunluk.find((l) => l.ok);
  const markala = (ok: boolean) => api.yap((ok ? 'Markalandı · ' : 'Hatalı markalama · hurda · ') + sn, ok ? 'tag' : 'trash', ok ? 'run' : 'stop', (x) => {
    const s = kayitOf(x); const q = s.seq != null ? s.seq : (+ayar.start || 1);
    return { ...srYaz(x, { seq: q + 1, log: [{ sn: seriNo(ayar.fmt, q, paket), ok, at: Date.now() }, ...(s.log || [])].slice(0, 2000) }), ...(ok ? { good: x.good + 1 } : { scrap: x.scrap + 1 }) };
  });
  const dogrula = () => api.okut({
    baslik: 'Markayı doğrula', ipucu: 'Parçadaki QR kodu okut ya da seri numarasını yaz · son markalanan: ' + (sonIyi ? sonIyi.sn : YOK),
    okundu: (kod) => {
      const k = kod.trim(); const bulunan = gunluk.find((l) => l.sn === k);
      if (bulunan && bulunan.ok) {
        bip('ok'); api.soyle('Doğrulandı · ' + kod + (bulunan === sonIyi ? ' (son parça)' : ''), 'run');
        api.sessiz((x) => srYaz(x, { verified: { ...kayitOf(x).verified, [kod]: Date.now() } }));
      } else { bip('nok'); api.soyle('Eşleşmedi: ' + kod + ' · bu işte markalanmamış', 'stop'); }
    },
  });
  const nDogru = Object.keys(kayit.verified || {}).length;
  return (
    <div className="tc-ay2-panel tc-ay2-marka">
      <div className="tc-ay2-marka-ana">
        <div className="tc-ay2-marka-seri">
          <span className="tc-ay2-ust-yazi">Şimdi markalanacak</span><b className="tc-ay2-mono">{sn}</b>
          <small>Sonraki: <span className="tc-ay2-mono">{seriNo(ayar.fmt, sira + 1, paket)}</span></small>
          <div className="tc-ay2-marka-meta">
            <Cip ton="done">{YONTEMLER[ayar.method] || ayar.method}</Cip>
            {ayar.pos ? <span className="tc-ay2-marka-yer"><Simge ad="target" boyut="k" />{ayar.pos}</span> : null}
          </div>
        </div>
        <Qr metin={sn} boyut={150} />
      </div>
      <div className="tc-ay2-marka-eylem">
        <Dugme boyut="ana" simge="check" onClick={() => markala(true)}>Markalandı</Dugme>
        <Dugme boyut="ana" tur="tehlike" simge="trash" onClick={() => markala(false)}>Hatalı · hurda</Dugme>
        {ayar.verify ? <Dugme boyut="ana" tur="ikincil" simge="scan" onClick={dogrula}>Doğrula</Dugme> : null}
        <Dugme boyut="ana" tur="ikincil" simge="download" onClick={() => etiketYazdir([etiketSvg(sn, paket, ayar.pos)])}>Etiket</Dugme>
      </div>
      <div className="tc-ay2-marka-kayit">
        <div className="tc-ay2-kb">
          <b>Seri kaydı</b>
          <span className="tc-ay2-ust-yazi tc-ay2-sag">
            {gunluk.filter((l) => l.ok).length} iyi · {gunluk.filter((l) => !l.ok).length} hatalı{ayar.verify ? ' · ' + nDogru + ' doğrulandı' : ''}
          </span>
        </div>
        {gunluk.slice(0, 12).map((l, i) => (
          <div key={i} className="tc-ay2-marka-satir" data-ton={l.ok ? undefined : 'stop'}>
            <span className="tc-ay2-mono">{l.sn}</span>
            {(kayit.verified || {})[l.sn] ? <Cip ton="run">Doğrulandı</Cip> : null}
            {!l.ok ? <Cip ton="stop">Hurda</Cip> : null}
            <small>{new Date(l.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>
          </div>
        ))}
        {!gunluk.length ? <p className="tc-ay2-soluk">Henüz markalama yok. İlk seri: <b className="tc-ay2-mono">{sn}</b></p> : null}
      </div>
    </div>
  );
}

const dkSn = (s: number) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export function BoyaPaneli({ api }: PanelOzellikleri) {
  const { ayar, kayit } = api;
  const simdi = useSimdi(1000);
  const ortam = (kayit.env || [])[0];
  const aski = kayit.rack || { stage: 'load' as const };
  const dft = kayit.dft || [];
  const [t, tYaz] = useState('');
  const [rh, rhYaz] = useState('');
  const [degerler, degerlerYaz] = useState(['', '', '', '', '']);
  const [n, nYaz] = useState(String(ayar.rack || 20));
  const kalan = aski.stage === 'oven' ? Math.max(0, ayar.cureMin * 60 - (simdi - (aski.t0 || 0)) / 1000) : 0;
  const uyarilan = useRef<number | undefined>(0);
  const bitti = kalan <= 0;
  useEffect(() => {
    if (aski.stage === 'oven' && bitti && uyarilan.current !== aski.t0) { uyarilan.current = aski.t0; bip('due'); api.soyle('Fırın süresi doldu · askıyı çıkar', 'hazard'); }
  }, [bitti, aski.t0]); // eski davranış: yalnız süre dolunca bir kez
  const ortamKaydet = () => {
    const T = ondalik(t); const H = ondalik(rh);
    if (Number.isNaN(T) || Number.isNaN(H)) return;
    const dp = cigNoktasi(T, H); const ok = T >= ayar.envTmin && T <= ayar.envTmax && H <= ayar.rhMax;
    api.yap('Ortam kaydedildi · ' + T + '°C · %' + H + (ok ? '' : ' · LİMİT DIŞI'), 'drop', ok ? 'run' : 'stop', (x) => srYaz(x, { env: [{ t: T, rh: H, dp: +dp.toFixed(1), ok, at: Date.now() }, ...(kayitOf(x).env || [])].slice(0, 200) }));
    tYaz(''); rhYaz(''); if (!ok) bip('nok');
  };
  const firinaVer = () => {
    const k = Math.max(1, parseInt(n, 10) || ayar.rack);
    api.yap('Askı fırına girdi · ' + k + ' parça · ' + ayar.cureMin + ' dk', 'thermometer', 'hazard', (x) => srYaz(x, { rack: { stage: 'oven', n: k, t0: Date.now() } }));
  };
  const firindanAl = () => {
    const k = aski.n || 0; const erken = kalan > 0;
    api.yap((erken ? 'Erken çıkarıldı · ' : 'Askı çıktı · ') + k + ' parça boyandı', 'check', erken ? 'hold' : 'run', (x) => ({
      ...srYaz(x, { rack: { stage: 'load' }, racks: [{ n: k, t0: aski.t0, t1: Date.now(), early: erken }, ...(kayitOf(x).racks || [])].slice(0, 300) }), good: x.good + k,
    }));
  };
  const kalinlikKaydet = () => {
    const v = degerler.map(ondalik).filter((x) => !Number.isNaN(x));
    if (v.length < 3) { api.soyle('En az 3 nokta ölç', 'hold'); return; }
    const ort = v.reduce((a, b) => a + b, 0) / v.length; const mn = Math.min(...v); const mx = Math.max(...v); const ok = mn >= ayar.dftMin && mx <= ayar.dftMax;
    bip(ok ? 'ok' : 'nok');
    api.yap('Kalınlık ' + ort.toFixed(0) + ' µm · ' + (ok ? 'uygun' : 'TOLERANS DIŞI'), 'gauge', ok ? 'run' : 'stop', (x) => srYaz(x, { dft: [{ v, avg: +ort.toFixed(1), mn, mx, ok, at: Date.now() }, ...(kayitOf(x).dft || [])].slice(0, 300) }));
    degerlerYaz(['', '', '', '', '']);
  };
  const ortamYasi = ortam ? (simdi - ortam.at) / 60000 : 1e9;
  const alt = ayar.dftMin * 0.6; const ust = ayar.dftMax * 1.25;
  const y = (v: number) => 100 - Math.max(0, Math.min(100, ((v - alt) / (ust - alt)) * 100));
  const cizilen = dft.slice(0, 14).reverse();
  return (
    <div className="tc-ay2-panel tc-ay2-boya">
      <div className="tc-ay2-boya-renk">
        <svg className="tc-ay2-renk-ornegi" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={ayar.hex} /></svg>
        <div><span className="tc-ay2-ust-yazi">Renk</span><b>RAL {ayar.ral}</b><span>{ayar.name} · {ayar.type} boya · {ayar.layers} kat</span></div>
        <div className="tc-ay2-boya-ozellik">
          <div><span className="tc-ay2-ust-yazi">Kalınlık</span><b className="tc-ay2-mono">{ayar.dftMin}–{ayar.dftMax}<small> µm</small></b></div>
          <div><span className="tc-ay2-ust-yazi">Fırın</span><b className="tc-ay2-mono">{ayar.cureT}°<small>C · {ayar.cureMin} dk</small></b></div>
        </div>
      </div>
      <div className="tc-ay2-boya-izgara">
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb"><b><Simge ad="thermometer" boyut="k" /> Fırın</b><span className="tc-ay2-ust-yazi tc-ay2-sag">{(kayit.racks || []).length} askı tamam</span></div>
          {aski.stage === 'oven' ? (
            <>
              <div className="tc-ay2-firin" data-ton={bitti ? 'run' : 'hazard'}>
                <span className="tc-ay2-ust-yazi">{kalan > 0 ? 'Kür süresi' : 'Süre doldu'}</span><b className="tc-ay2-mono">{dkSn(kalan)}</b><small>{aski.n} parça · {ayar.cureT}°C</small>
                <Cubuk yuzde={100 - (kalan / (ayar.cureMin * 60)) * 100} ton={kalan > 0 ? 'hazard' : 'run'} etiket="Kür süresi" />
              </div>
              <Dugme boyut="ana" tur={bitti ? 'birincil' : 'ikincil'} simge="check" onClick={firindanAl}>{kalan > 0 ? 'Erken çıkar' : 'Askı çıktı · ' + aski.n + ' parça'}</Dugme>
            </>
          ) : (
            <>
              <label className="tc-ay2-alan"><span className="tc-ay2-ust-yazi">Askıdaki parça</span><input type="number" inputMode="numeric" value={n} onChange={(e) => nYaz(e.target.value)} /></label>
              <Dugme boyut="ana" simge="thermometer" onClick={firinaVer} disabled={ortamYasi > 240}>Fırına ver · {ayar.cureMin} dk</Dugme>
              {ortamYasi > 240 ? <small className="tc-ay2-soluk">Önce ortam ölçümünü kaydet (4 saatte bir)</small> : null}
            </>
          )}
        </div>
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb">
            <b><Simge ad="drop" boyut="k" /> Ortam</b>
            <span className="tc-ay2-sag">{ortam ? <Cip ton={ortam.ok ? 'run' : 'stop'}>{ortam.t}°C · %{ortam.rh} · çiğ {ortam.dp}°</Cip> : <Cip ton="hold">Ölçüm yok</Cip>}</span>
          </div>
          <div className="tc-ay2-iki">
            <label className="tc-ay2-alan"><span className="tc-ay2-ust-yazi">Sıcaklık °C · {ayar.envTmin}–{ayar.envTmax}</span><input inputMode="decimal" value={t} onChange={(e) => tYaz(e.target.value)} /></label>
            <label className="tc-ay2-alan"><span className="tc-ay2-ust-yazi">Nem % · en çok {ayar.rhMax}</span><input inputMode="decimal" value={rh} onChange={(e) => rhYaz(e.target.value)} /></label>
          </div>
          <Dugme tur="ikincil" simge="check" onClick={ortamKaydet} disabled={!t || !rh}>Ortamı kaydet</Dugme>
        </div>
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb"><b><Simge ad="gauge" boyut="k" /> Kaplama kalınlığı</b><span className="tc-ay2-ust-yazi tc-ay2-sag">{ayar.dftMin}–{ayar.dftMax} µm</span></div>
          <div className="tc-ay2-dft-giris">
            {degerler.map((v, i) => (
              <input
                key={i} inputMode="decimal" placeholder={'N' + (i + 1)} aria-label={'Nokta ' + (i + 1)} value={v}
                data-durum={v === '' ? undefined : (ondalik(v) >= ayar.dftMin && ondalik(v) <= ayar.dftMax) ? 'tamam' : 'red'}
                onChange={(e) => degerlerYaz(degerler.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => { if (e.key === 'Enter') kalinlikKaydet(); }}
              />
            ))}
          </div>
          <Dugme simge="check" onClick={kalinlikKaydet}>Ölçümü kaydet</Dugme>
          <svg className="tc-ay2-dft-grafik" viewBox="0 0 380 100" preserveAspectRatio="none" role="img" aria-label="Son kalınlık ölçümleri">
            <line className="tc-ay2-dft-sinir" data-ust="" x1="0" x2="380" y1={y(ayar.dftMax)} y2={y(ayar.dftMax)} />
            <line className="tc-ay2-dft-sinir" x1="0" x2="380" y1={y(ayar.dftMin)} y2={y(ayar.dftMin)} />
            {cizilen.map((d, i) => (
              <g key={i} className="tc-ay2-dft-cubuk" data-durum={d.ok ? 'tamam' : 'red'}>
                <title>{d.avg + ' µm'}</title>
                <rect x={10 + i * 26} y={y(d.mx)} width="10" height={Math.max(1, y(d.mn) - y(d.mx))} rx="2" />
                <line x1={8 + i * 26} x2={22 + i * 26} y1={y(d.avg)} y2={y(d.avg)} />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export function MontajPaneli({ api }: PanelOzellikleri) {
  const { ayar, kayit, paket } = api;
  const sira = kayit.seq != null ? kayit.seq : (+ayar.start || 1);
  const sn = seriNo(ayar.fmt, sira, paket);
  const simdiki = kayit.cur || {};
  const parcalar = simdiki.comps || {};
  const tork = simdiki.tq || {};
  const bom: MontajKalemi[] = ayar.bom || [];
  const torklar: TorkAdimi[] = ayar.torque || [];
  const uniteler = kayit.units || [];
  const [tv, tvYaz] = useState<Record<string, string>>({});
  const simdikiYaz = (ch: (c: NonNullable<IstasyonKaydi['cur']>) => NonNullable<IstasyonKaydi['cur']>, etiket: string, simge: SimgeAdi = 'check', ton: Ton = 'run') =>
    api.yap(etiket, simge, ton, (x) => { const s = kayitOf(x); return srYaz(x, { cur: { ...s.cur, ...ch(s.cur || {}) } }); });
  const takildi = (b: MontajKalemi) => !!parcalar[b.id];
  const torkTamam = (t: TorkAdimi) => torkUygun(t, tork[t.id]);
  const sec = (b: MontajKalemi) => {
    if (takildi(b)) { simdikiYaz((c) => ({ comps: { ...c.comps, [b.id]: undefined } }), b.name + ' geri alındı', 'rotate', 'idle'); return; }
    if (b.trace) {
      api.okut({
        baslik: b.name + ' · seri / lot', ipucu: b.code + ' parçasının üzerindeki QR kodu okut ya da seri/lot numarasını yaz',
        okundu: (kod) => simdikiYaz((c) => ({ comps: { ...c.comps, [b.id]: kod } }), b.name + ' · ' + kod),
      });
    } else simdikiYaz((c) => ({ comps: { ...c.comps, [b.id]: true } }), b.name + ' takıldı');
  };
  const torkKaydet = (t: TorkAdimi) => {
    const v = ondalik(tv[t.id] || ''); if (Number.isNaN(v)) return;
    const ok = torkUygun(t, v); bip(ok ? 'ok' : 'nok');
    simdikiYaz((c) => ({ tq: { ...c.tq, [t.id]: v } }), t.name + ' · ' + v + ' Nm' + (ok ? '' : ' · TOLERANS DIŞI'), 'wrench', ok ? 'run' : 'stop');
    tvYaz({ ...tv, [t.id]: '' });
  };
  const nP = bom.filter(takildi).length; const nT = torklar.filter(torkTamam).length; const hazir = nP === bom.length && nT === torklar.length;
  const bitir = () => api.yap('Ünite tamamlandı · ' + sn, 'box', 'run', (x) => {
    const s = kayitOf(x); const q = s.seq != null ? s.seq : (+ayar.start || 1);
    return { ...srYaz(x, { seq: q + 1, cur: {}, units: [{ sn: seriNo(ayar.fmt, q, paket), comps: (s.cur || {}).comps || {}, tq: (s.cur || {}).tq || {}, at: Date.now() }, ...(s.units || [])].slice(0, 2000) }), good: x.good + 1 };
  });
  return (
    <div className="tc-ay2-panel tc-ay2-montaj">
      <div className="tc-ay2-montaj-unite">
        <div>
          <span className="tc-ay2-ust-yazi">Monte edilen ünite</span><b className="tc-ay2-mono">{sn}</b>
          <small>{uniteler.length} ünite tamamlandı · son: <span className="tc-ay2-mono">{uniteler[0] ? uniteler[0].sn : YOK}</span></small>
        </div>
        <ol className="tc-ay2-montaj-adim">
          <li data-durum={nP === bom.length ? 'tamam' : 'simdi'}><i>1</i>Kit {nP}/{bom.length}</li>
          <li data-durum={nT === torklar.length && torklar.length ? 'tamam' : nP === bom.length ? 'simdi' : undefined}><i>2</i>Tork {nT}/{torklar.length}</li>
          <li data-durum={hazir ? 'simdi' : undefined}><i>3</i>Tamamla</li>
        </ol>
        <Dugme boyut="ana" simge="check" disabled={!hazir} onClick={bitir}>Ünite tamam</Dugme>
      </div>
      <div className="tc-ay2-montaj-izgara">
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb"><b>Parça listesi</b><span className="tc-ay2-ust-yazi tc-ay2-sag">dokun: takıldı · <Simge ad="scan" boyut="k" /> seri/lot okut</span></div>
          {bom.map((b) => {
            const v = parcalar[b.id];
            return (
              <button key={b.id} type="button" className="tc-ay2-kit-satir" aria-pressed={!!v} onClick={() => sec(b)}>
                <span className="tc-ay2-kit-isaret">{v ? <Simge ad="check" boyut="k" /> : b.trace ? <Simge ad="scan" boyut="k" /> : null}</span>
                <div>
                  <b>{b.name}</b><span className="tc-ay2-mono">{b.code}{b.trace ? ' · izlenebilir' : ''}</span>
                  {typeof v === 'string' ? <small className="tc-ay2-mono tc-ay2-lot">{v}</small> : null}
                </div>
                <em className="tc-ay2-mono">×{b.qty}</em>
              </button>
            );
          })}
        </div>
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb"><b>Tork değerleri</b><span className="tc-ay2-ust-yazi tc-ay2-sag">tork anahtarı okuması</span></div>
          {torklar.map((t) => {
            const v = tork[t.id]; const ok = torkTamam(t);
            return (
              <div key={t.id} className="tc-ay2-tork-satir" data-durum={v == null ? undefined : ok ? 'tamam' : 'red'}>
                <div><b>{t.name}</b><span className="tc-ay2-mono">{t.nm} ± {t.tol} Nm</span></div>
                {v != null ? <span className="tc-ay2-deger" data-durum={ok ? 'tamam' : 'red'}>{v}</span> : null}
                <input inputMode="decimal" placeholder="Nm" aria-label={t.name + ' tork'} value={tv[t.id] || ''} onChange={(e) => tvYaz({ ...tv, [t.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') torkKaydet(t); }} />
                <button type="button" className="tc-ay2-arac" aria-label="Kaydet" onClick={() => torkKaydet(t)}><Simge ad="check" /></button>
              </div>
            );
          })}
          {!torklar.length ? <p className="tc-ay2-soluk">Bu işte tork adımı yok.</p> : null}
        </div>
      </div>
    </div>
  );
}

export function KalitePaneli({ api, kurallar }: PanelOzellikleri) {
  const { ayar, kayit, paket } = api;
  const plan: PlanItem[] = (paket && paket.plan) || [];
  const muayeneler = kayit.insp || [];
  const simdiki = kayit.cur || {};
  const degerler = simdiki.vals || {};
  const kusurlar = simdiki.def || [];
  const [giris, girisYaz] = useState<Record<string, string>>({});
  const bant = kurallar ? kurallar.q.band : 0;
  const uygunMu = (b: PlanItem): boolean | null => {
    const v = degerler[b.id]; if (v == null) return null;
    if (b.gauge) return v === 'Geçer';
    return typeof v === 'number' && olcuUygun(b, v);
  };
  const degerYaz = (b: PlanItem, v: number | string) => api.sessiz((x) => { const s = kayitOf(x); const c = s.cur || {}; return srYaz(x, { cur: { ...c, vals: { ...c.vals, [b.id]: v } } }); });
  const sayiKaydet = (b: PlanItem) => {
    const v = ondalik(giris[b.id] || ''); if (Number.isNaN(v)) return;
    bip(olcuUygun(b, v) ? 'ok' : 'nok'); degerYaz(b, v); girisYaz({ ...giris, [b.id]: '' });
  };
  const kusurDegistir = (d: string) => api.sessiz((x) => {
    const s = kayitOf(x); const c = s.cur || {}; const L = c.def || [];
    return srYaz(x, { cur: { ...c, def: L.includes(d) ? L.filter((z) => z !== d) : [...L, d] } });
  });
  const olculen = plan.filter((b) => degerler[b.id] != null).length;
  const hepsiUygun = plan.every((b) => uygunMu(b) !== false) && !kusurlar.length;
  const red = muayeneler.filter((r) => !r.ok).length; const karar = muayeneler.length >= ayar.n; const lotUygun = red <= ayar.ac;
  const kaydet = () => {
    const ok = hepsiUygun && olculen === plan.length;
    api.yap('Parça ' + (muayeneler.length + 1) + ' · ' + (ok ? 'KABUL' : 'RED' + (kusurlar.length ? ' · ' + kusurlar.join(', ') : '')), ok ? 'check' : 'x', ok ? 'run' : 'stop', (x) => {
      const s = kayitOf(x); const L = s.insp || [];
      return { ...srYaz(x, { cur: {}, insp: [...L, { i: L.length + 1, vals: (s.cur || {}).vals || {}, def: (s.cur || {}).def || [], ok, at: Date.now() }] }), ...(ok ? { good: x.good + 1 } : { scrap: x.scrap + 1 }) };
    });
  };
  return (
    <div className="tc-ay2-panel tc-ay2-kalite">
      <div className="tc-ay2-kalite-ust">
        <div><span className="tc-ay2-ust-yazi">Lot {sayi(ayar.lot)} · numune {ayar.n} · kabul sayısı Ac {ayar.ac}</span><b>Parça {Math.min(muayeneler.length + 1, ayar.n)} / {ayar.n}</b></div>
        {karar ? (
          <span className="tc-ay2-lot-karar" data-durum={lotUygun ? 'tamam' : 'red'}>
            <Simge ad={lotUygun ? 'check' : 'x'} />LOT {lotUygun ? 'KABUL' : 'RED'}<small>{red} red / {muayeneler.length}</small>
          </span>
        ) : <span className="tc-ay2-lot-karar"><small>{muayeneler.length} muayene · {red} red</small></span>}
      </div>
      <div className="tc-ay2-kalite-izgara">
        <div className="tc-ay2-kart">
          <div className="tc-ay2-kb"><b>Ölçüler</b><span className="tc-ay2-ust-yazi tc-ay2-sag">{olculen}/{plan.length}</span></div>
          {plan.map((b) => {
            const v = degerler[b.id]; const ok = uygunMu(b); const e = ok && typeof v === 'number' ? sinirYakin(b, v, bant) : 0;
            const durum = ok == null ? undefined : ok ? (e ? 'sinir' : 'tamam') : 'red';
            const cmm = olcumYontemi(b) === 'cmm';
            return (
              <div key={b.id} className="tc-ay2-olcu" data-durum={durum}>
                <span className="tc-ay2-balon" data-cmm={cmm ? '' : undefined}>{b.id}</span>
                <div>
                  <b className="tc-ay2-mono">{b.nom}{cmm ? <span className="tc-ay2-cmm">CMM</span> : null}</b>
                  <small>{b.tol} · {b.tool}{b.crit ? ' · KRİTİK' : ''}</small>
                </div>
                {v != null ? <span className="tc-ay2-deger" data-durum={durum}>{v}{e ? <small>sınırda</small> : null}</span> : null}
                {b.gauge ? (
                  <div className="tc-ay2-olcu-giris">
                    <Dugme tur="ikincil" onClick={() => { bip('ok'); degerYaz(b, 'Geçer'); }}>Geçer</Dugme>
                    <Dugme tur="tehlike" onClick={() => { bip('nok'); degerYaz(b, 'Geçmez'); }}>Geçmez</Dugme>
                  </div>
                ) : (
                  <div className="tc-ay2-olcu-giris">
                    <input inputMode="decimal" placeholder={b.min + '–' + b.max} aria-label={b.nom + ' ölçüsü'} value={giris[b.id] || ''} onChange={(ev) => girisYaz({ ...giris, [b.id]: ev.target.value })} onKeyDown={(ev) => { if (ev.key === 'Enter') sayiKaydet(b); }} />
                    <button type="button" className="tc-ay2-arac" aria-label="Kaydet" onClick={() => sayiKaydet(b)}><Simge ad="check" /></button>
                  </div>
                )}
              </div>
            );
          })}
          {!plan.length ? <p className="tc-ay2-soluk">Kontrol planı boş · hazırlıkta ölçü noktası ekle.</p> : null}
        </div>
        <div className="tc-ay2-kalite-yan">
          <div className="tc-ay2-kart">
            <div className="tc-ay2-kb"><b>Görsel kusur</b><span className="tc-ay2-ust-yazi tc-ay2-sag">varsa işaretle</span></div>
            <div className="tc-ay2-hazirlar">
              {(ayar.defects || []).map((d) => (
                <button key={d} type="button" className="tc-ay2-hazir" data-ton="stop" aria-pressed={kusurlar.includes(d)} onClick={() => kusurDegistir(d)}><i aria-hidden="true" />{d}</button>
              ))}
            </div>
          </div>
          <div className="tc-ay2-kart">
            <div className="tc-ay2-kb"><b>Muayene kaydı</b></div>
            <div className="tc-ay2-muayeneler">
              {muayeneler.map((r) => <span key={r.i} data-durum={r.ok ? 'tamam' : 'red'} title={r.def.join(', ')}>{r.i}</span>)}
              {Array.from({ length: Math.max(0, ayar.n - muayeneler.length) }, (_, i) => <span key={'e' + i} />)}
            </div>
          </div>
        </div>
      </div>
      <div className="tc-ay2-kalite-kaydet">
        <Dugme
          boyut="ana" tur={!hepsiUygun ? 'tehlike' : olculen === plan.length ? 'birincil' : 'ikincil'} simge={hepsiUygun ? 'check' : 'x'}
          disabled={karar || (olculen < plan.length && !kusurlar.length)} onClick={kaydet}
        >{hepsiUygun ? 'Parça kabul' : 'Parça red'} · kaydet</Dugme>
      </div>
    </div>
  );
}

export const ISTASYON_PANELLERI: Readonly<Partial<Record<OpType, ComponentType<PanelOzellikleri>>>> = {
  kalite: KalitePaneli, depo: DepoPaneli, mark: MarkaPaneli, boya: BoyaPaneli, montaj: MontajPaneli,
};
