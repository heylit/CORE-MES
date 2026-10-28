import { lazy, Suspense, useState } from 'react';
import { CokSatir, Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { onerileriSuz } from '../../../../../../arkon/web/src/app/neden-kaynagi.ts';
import type { HataliGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { hurdaNedeniYokIletisi } from '../../../../../../arkon/web/src/data/hurda-nedeni.ts';
import { tmiEmirId, type TmiPaketi } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { sure } from '../cekirdek/bicim.ts';
import type { DurusNedeni } from '../cekirdek/ayarlar.ts';
import { CAGRI_EKIPLERI } from '../cekirdek/sabitler.ts';
import type { ScrapReason } from '../cekirdek/tipler.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { useSimdi } from '../veri/baglam.ts';
import { Cubuk } from '../hazirlik/index.tsx';
import type { NumuneIstegi } from '../kalite/index.tsx';
import { CAGRI_ASAMALARI, HAZIRLIK_MADDELERI, HIZLI_YANITLAR, cagriTonu, hazirlikSayisi, simgeSec, tonDurumu, type VardiyaOzeti } from './kurallar.ts';
import { MiniHalka } from './Parcalar.tsx';
import type { Cagri, Is } from './tipler.ts';

// Operatör ekranının pencereleri (operator-parcalar.ts ScrapOv, ReasonOv, CallOv, CallTrackOv, NextPrepOv, ShiftOv).

const saatSaniye = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const saatDakika = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/* ── hurda nedeni: dokununca kaydedilir; son seçilen işaretlidir ── */
export function HurdaPenceresi({ nedenler, kapat, sec }: { nedenler: readonly ScrapReason[]; kapat: () => void; sec: (kod: string) => void }) {
  const son = yerel.oku<string>('lastScrap');
  const L = nedenler.filter((r) => r.active !== false);
  const bos = hurdaNedeniYokIletisi(L);
  return (
    <Pencere acik kapat={kapat} baslik="Hurda nedeni?" alt={<Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>}>
      <p className="tc-ay1-soluk">Hurda +1 · dokun, kaydedilsin. Nedenler raporda hurda analizine gider.</p>
      {bos ? <p className="tc-ay1-soluk">{bos}</p> : null}
      <div className="tc-ay1-nedenler">
        {L.map((r) => (
          <button key={r.code} type="button" className="tc-ay1-neden" data-durum="durdu" data-onerilen={r.code === son || undefined} onClick={() => { yerel.yaz('lastScrap', r.code); sec(r.code); }}>
            <span className="tc-ay1-neden-simge"><Simge ad="trash" /></span><b>{r.l}</b><code>{r.code === son ? 'son seçilen' : r.code}</code>
          </button>
        ))}
      </div>
    </Pencere>
  );
}

export interface HataliGirdisi { kod: string; adet: number; aciklama: string | null }

// 1034: TMI işinde "Hatalı" parçayı kaliteye ayırır; iş emri paketinde (tmi-ie-<n>) adım paketin kendisidir, emir paketinde adımı TMI
// seçer (çalışan adım). TMI'den gelmeyen işte istek yoktur (eski hurda sayımı kalır).
export function hataliIstegi(pkg: TmiPaketi | null | undefined, g: HataliGirdisi): { emirId: number; govde: HataliGovdesi } | null {
  const emirId = tmiEmirId(pkg);
  if (emirId === null || !Number.isSafeInteger(g.adet) || g.adet < 1) return null;
  const m = typeof pkg?.id === 'string' ? /^tmi-ie-([1-9]\d*)$/.exec(pkg.id) : null;
  const isEmriId = m ? Number(m[1]) : null;
  const aciklama = g.aciklama?.trim() || null;
  return {
    emirId,
    govde: { ...(isEmriId !== null && Number.isSafeInteger(isEmriId) ? { isEmriId } : {}), hurdaNedeniKodu: g.kod, adet: g.adet, aciklama },
  };
}

/* ── hatalı parça (1034): operatör yalnız nedeni ve adedi seçer; rework, hurda ya da red kararını kalite verir ── */
export function HataliPenceresi({ nedenler, yukleniyor, kapat, kaydet }: {
  nedenler: readonly ScrapReason[]; yukleniyor: boolean; kapat: () => void; kaydet: (g: HataliGirdisi) => void;
}) {
  const son = yerel.oku<string>('lastScrap');
  const L = nedenler.filter((r) => r.active !== false);
  const bos = hurdaNedeniYokIletisi(L);
  const [kod, kodYaz] = useState<string | null>(() => (L.some((r) => r.code === son) ? son : null));
  const [adetMetni, adetYaz] = useState('1');
  const [not, notYaz] = useState('');
  const adet = /^\s*\d+\s*$/.test(adetMetni) ? Number(adetMetni) : Number.NaN;
  const adetGecersiz = !Number.isSafeInteger(adet) || adet < 1;
  const gonder = () => {
    if (kod === null || adetGecersiz || yukleniyor) return;
    yerel.yaz('lastScrap', kod);
    kaydet({ kod, adet, aciklama: not.trim() || null });
  };
  return (
    <Pencere
      acik kapat={kapat} baslik="Hatalı parça"
      alt={<>
        <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
        <Dugme simge="alert" disabled={kod === null || adetGecersiz || yukleniyor} onClick={gonder}>Kaliteye ayır</Dugme>
      </>}
    >
      <p className="tc-ay1-soluk">Parça işten ayrılır ve kalite istasyonuna gider; rework, hurda ya da red kararını kalite verir.</p>
      {bos ? <p className="tc-ay1-soluk">{bos}</p> : null}
      <div className="tc-ay1-nedenler" role="radiogroup" aria-label="Hata nedeni">
        {L.map((r) => (
          <button key={r.code} type="button" role="radio" aria-checked={kod === r.code} className="tc-ay1-neden" data-durum="durdu"
            data-onerilen={kod === r.code || undefined} onClick={() => kodYaz(r.code)}>
            <span className="tc-ay1-neden-simge"><Simge ad="alert" /></span><b>{r.l}</b><code>{r.code === son ? 'son seçilen' : r.code}</code>
          </button>
        ))}
      </div>
      <div className="tc-ay1-toplu-satir">
        <label className="tc-ay1-toplu-alan" data-tur="hurda">
          <span className="tc-ay1-ust-yazi">Adet</span>
          <input className="tc-ay1-mono" inputMode="numeric" pattern="[0-9]*" value={adetMetni} aria-label="Hatalı adet"
            onChange={(e) => adetYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gonder(); }} />
        </label>
      </div>
      {adetGecersiz ? <small className="tc-ay1-hata">Adet tam sayı ve en az 1 olmalı.</small> : null}
      <CokSatir etiket="Not" value={not} maxLength={300} onChange={(e) => notYaz(e.target.value)} />
    </Pencere>
  );
}

/* ── duruş nedeni: dokununca kaydedilir (yanlış dokunuş bildirimden geri alınır); önce duruma göre önerilenler ── */
export function DurusPenceresi({ istasyon, nedenler, oneriler, otomatikCagri, kapat, kaydet }: {
  istasyon: string; nedenler: readonly DurusNedeni[]; oneriler: readonly { code: string; why: string }[]; otomatikCagri: boolean;
  kapat: () => void; kaydet: (r: DurusNedeni) => void;
}) {
  const one = onerileriSuz(oneriler, nedenler).filter((s, i, a) => a.findIndex((x) => x.code === s.code) === i).slice(0, 3);
  const karo = (r: DurusNedeni, neden?: string) => {
    const ekip = r.team && otomatikCagri ? CAGRI_EKIPLERI.find((c) => c.k === r.team) : null;
    return (
      <button key={r.code + (neden ? 's' : '')} type="button" className="tc-ay1-neden" data-durum={r.durum}
        data-onerilen={neden ? true : undefined} onClick={() => kaydet(r)}>
        <span className="tc-ay1-neden-simge"><Simge ad={simgeSec(r.i, 'stop')} boyut="k" /></span>
        <span className="tc-ay1-neden-yazi"><b>{r.l}</b>
          {neden ? <span className="tc-ay1-neden-neden"><Simge ad="bolt" boyut="k" />{neden}</span>
            : <code data-yalniz-kod={ekip ? undefined : true}>{r.code}{ekip ? ` · ${ekip.l} ${r.after ? `${r.after} dk sonra` : 'hemen'} çağrılır` : ''}</code>}
        </span>
      </button>
    );
  };
  return (
    <Pencere acik kapat={kapat} baslik="Neden durdu?" alt={<Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>}>
      <p className="tc-ay1-soluk">Duruş kaydı · {istasyon} · nedene dokun, kaydedilsin; yanlışsa bildirimden geri al.</p>
      {one.length ? (
        <>
          <span className="tc-ay1-ust-yazi">Duruma göre önerilen</span>
          <div className="tc-ay1-nedenler tc-ay1-nedenler-kucuk tc-ay1-nedenler-durus" role="group" aria-label="Önerilen nedenler">
            {one.map((s) => { const r = nedenler.find((x) => x.code === s.code); return r ? karo(r, s.why) : null; })}
          </div>
          <span className="tc-ay1-ust-yazi">Tüm nedenler</span>
        </>
      ) : null}
      {([['u', 'Plansız duruş · OEE kaybı'], ['p', 'Planlı duruş · OEE dışı']] as const).map(([kat, l]) => {
        const L = nedenler.filter((r) => r.active !== false && (r.cat || 'u') === kat && !one.some((s) => s.code === r.code));
        return L.length ? (
          <div key={kat} className="tc-ay1-neden-grubu">
            <span className="tc-ay1-ust-yazi" data-durum={kat === 'p' ? 'bitti' : undefined}>{l}</span>
            <div className="tc-ay1-nedenler tc-ay1-nedenler-kucuk tc-ay1-nedenler-durus" role="group" aria-label={l}>{L.map((r) => karo(r))}</div>
          </div>
        ) : null;
      })}
    </Pencere>
  );
}

/* ── Andon çağrısı ── */
export function CagriPenceresi({ kapat, cagir }: { kapat: () => void; cagir: (k: (typeof CAGRI_EKIPLERI)[number]) => void }) {
  return (
    <Pencere acik kapat={kapat} baslik="Kimi çağıralım?">
      <p className="tc-ay1-soluk">Andon çağrısı · çağrı ilgili ekibin ekranına ve telefonuna düşer.</p>
      <div className="tc-ay1-nedenler">
        {CAGRI_EKIPLERI.map((c) => (
          <button key={c.k} type="button" className="tc-ay1-neden" data-durum={tonDurumu(cagriTonu(c.k))} onClick={() => cagir(c)}>
            <span className="tc-ay1-neden-simge"><Simge ad={c.simge} /></span><b>{c.l}</b><code>{c.d} · ~{c.eta} dk</code>
          </button>
        ))}
      </div>
    </Pencere>
  );
}

export function CagriTakibi({ cagri, kapat, yanitla, bitir }: {
  cagri: Cagri; kapat: () => void; yanitla: (q: (typeof HIZLI_YANITLAR)[number]) => void; bitir: () => void;
}) {
  const simdi = useSimdi(1000);
  return (
    <Pencere acik kapat={kapat} baslik={`${cagri.l}${cagri.who ? ` · ${cagri.who}` : ''}`} alt={<>
      <Dugme tur="ikincil" onClick={kapat}>Küçült</Dugme>
      <Dugme simge="check" onClick={bitir}>Çözüldü · kapat</Dugme>
    </>}>
      <p className="tc-ay1-soluk">Çağrı takibi · {sure((simdi - cagri.t0) / 1000).slice(3)} · {cagri.d}</p>
      <ol className="tc-ay1-asamalar" data-durum={tonDurumu(cagriTonu(cagri.k))}>
        {CAGRI_ASAMALARI.map((s, i) => (
          <li key={s} data-yapildi={i <= cagri.stage || undefined} aria-current={i === cagri.stage ? 'step' : undefined}>
            <span>{i < cagri.stage ? <Simge ad="check" boyut="k" /> : i + 1}</span><b>{s}</b><small>{cagri.times[i] ? saatSaniye(cagri.times[i]!) : '—'}</small>
          </li>
        ))}
      </ol>
      <div className="tc-ay1-sohbet">
        {cagri.msgs.map((m, i) => <div key={i} className="tc-ay1-balon" data-kimden={m.from}><span>{m.text}</span><small>{saatDakika(m.at)}</small></div>)}
      </div>
      <div className="tc-ay1-hizli">{HIZLI_YANITLAR.map((q) => <Dugme key={q.t} tur="ikincil" onClick={() => yanitla(q)}>{q.t}</Dugme>)}</div>
    </Pencere>
  );
}

/* ── sonraki işe ön hazırlık ── */
export function SonrakiHazirlik({ is, kapat, degistir }: { is: Is; kapat: () => void; degistir: (k: string) => void }) {
  const r = (is.ready || {}) as Record<string, boolean>;
  const n = hazirlikSayisi(is);
  return (
    <Pencere acik kapat={kapat} baslik={is.no} alt={<Dugme onClick={kapat}>Tamam</Dugme>}>
      <p className="tc-ay1-soluk">Sonraki iş · ön hazırlık · {is.part} · {is.op}{is.pkg ? ` · Rev ${is.pkg.rev}` : ''} · Termin {is.due}</p>
      <div className="tc-ay1-hazirlik-ozet">
        <MiniHalka oran={n / 4} />
        <div><b>{n === 4 ? 'Her şey hazır · iş bitince hemen başlayabilirsin' : 'Mevcut iş sürerken hazırla, hazırlık süresi kısalsın'}</b><small>{n}/4 tamamlandı</small></div>
      </div>
      <div className="tc-ay1-hazirlik">
        {HAZIRLIK_MADDELERI.map((x) => (
          <button key={x.k} type="button" role="checkbox" aria-checked={!!r[x.k]} className="tc-ay1-hazirlik-madde" onClick={() => degistir(x.k)}>
            <span className="tc-ay1-kutu" aria-hidden="true"><Simge ad="check" /></span><Simge ad={x.simge} /><span><b>{x.l}</b><small>{x.d}</small></span>
          </button>
        ))}
      </div>
      {is.pkg ? (
        <div className="tc-ay1-dosyalar">
          <span className="tc-ay1-ust-yazi">Paketteki dokümanlar</span>
          {is.pkg.files.map((f) => <span key={f.name} className="tc-ay1-cip" data-durum={f.kind === 'pdf' ? 'durdu' : 'calisiyor'}><i aria-hidden="true" />{f.name}</span>)}
          <span className="tc-ay1-cip" data-durum="bitti"><i aria-hidden="true" />{is.pkg.plan.length} kontrol · {is.pkg.steps.length} adım</span>
        </div>
      ) : null}
    </Pencere>
  );
}

/* ── vardiya özeti ve devir notu ── */
export function VardiyaPenceresi({ ozet, vardiyaEtiketi, kapat, devret }: {
  ozet: VardiyaOzeti; vardiyaEtiketi: string; kapat: () => void; devret: (not: string) => void;
}) {
  const [not, notYaz] = useState('');
  const q = ozet.good + ozet.scrap ? (100 * ozet.good / (ozet.good + ozet.scrap)) : null;
  const yuzde = ozet.goal > 0 ? Math.min(100, Math.round(ozet.good / ozet.goal * 100)) : null;
  const olcum = ozet.mOk + ozet.mNok;
  return (
    <Pencere acik kapat={kapat} baslik={ozet.title || 'Vardiya özeti'} alt={<>
      <Dugme tur="ikincil" onClick={kapat}>Kapat</Dugme>
      <Dugme simge="check" onClick={() => devret(not)}>Vardiyayı devret</Dugme>
    </>}>
      <p className="tc-ay1-soluk">{vardiyaEtiketi} · {ozet.machine} · {ozet.headline}</p>
      <div className="tc-ay1-vardiya">
        <div className="tc-ay1-vardiya-kutu tc-ay1-vardiya-buyuk"><span className="tc-ay1-ust-yazi">Üretilen</span><b>{ozet.good.toLocaleString('tr-TR')}</b><small>iyi parça</small></div>
        <div className="tc-ay1-vardiya-kutu"><span className="tc-ay1-ust-yazi">Kalite</span><b>{q === null ? '—' : `%${q.toFixed(1)}`}</b><small>{ozet.scrap} hurda</small></div>
        <div className="tc-ay1-vardiya-kutu"><span className="tc-ay1-ust-yazi">En iyi çevrim</span><b>{typeof ozet.best === 'number' ? `${ozet.best} sn` : ozet.best}</b><small>standart {ozet.std} sn</small></div>
        <div className="tc-ay1-vardiya-kutu"><span className="tc-ay1-ust-yazi">Ölçüm</span><b>{olcum ? `${ozet.mOk}/${olcum}` : '—'}</b><small>{ozet.mNok ? `${ozet.mNok} red · kaliteye iletildi` : olcum ? 'hepsi uygun' : 'ölçüm yok'}</small></div>
        <div className="tc-ay1-vardiya-kutu"><span className="tc-ay1-ust-yazi">Duruş</span><b>{ozet.stopMin} dk</b><small>{ozet.stops} olay{ozet.topReason ? ` · en çok ${ozet.topReason}` : ''}</small></div>
        <div className="tc-ay1-vardiya-kutu"><span className="tc-ay1-ust-yazi">Çağrı</span><b>{ozet.calls}</b><small>{ozet.calls ? (ozet.callAvg ? `ortalama varış ${ozet.callAvg}` : 'devam ediyor') : 'çağrı yok'}</small></div>
      </div>
      <div className="tc-ay1-ekip">
        <div><span className="tc-ay1-ust-yazi">Ekip hedefi</span><b>{yuzde === null ? '—' : `%${yuzde}`}</b></div>
        {yuzde === null ? null : <Cubuk yuzde={yuzde} ton="run" etiket="Ekip hedefi" />}
        <small className="tc-ay1-soluk">Bireysel sıralama yok · hücre birlikte değerlendirilir</small>
      </div>
      <CokSatir etiket="Sonraki vardiyaya not (isteğe bağlı)" rows={3} value={not} onChange={(e) => notYaz(e.target.value)} />
    </Pencere>
  );
}

/* ── kaliteye numune (A4 NumunePenceresi; operator.ts NumuneOv) ── */
const KaliteNumunesi = lazy(async () => ({ default: (await import('../kalite/index.tsx')).NumunePenceresi }));
export function NumunePenceresi({ istasyon, numune, kapat }: { istasyon: string; numune: NumuneIstegi; kapat: () => void }) {
  return <Suspense fallback={null}><KaliteNumunesi st={istasyon} numune={numune} kapat={kapat} /></Suspense>;
}

// 684: başka işe geçerken çalışan iş kendiliğinden duraklatılmaz, operatöre sorulur. Devam ederse istasyonda birden çok iş açık
// kalır; sayaç ve eylemler ekrandaki işe gider.
export function GecisPenceresi({ calisanlar, hedef, kapat, devam, duraklat }: {
  calisanlar: readonly string[]; hedef: string; kapat: () => void; devam: () => void; duraklat: () => void;
}) {
  return (
    <Pencere
      acik kapat={kapat} baslik="Çalışan iş ne olsun?"
      alt={(
        <>
          <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="ikincil" simge="pause" onClick={duraklat}>Duraklat ve geç</Dugme>
          <Dugme simge="play" onClick={devam}>Devam etsin, geç</Dugme>
        </>
      )}
    >
      <p>{calisanlar.join(', ')} çalışıyor; {hedef} işine geçiyorsun.</p>
      <p className="tc-ay1-soluk">Devam ederse iki iş birlikte açık kalır. Sayaç ve düğmeler ekrandaki işe gider; öteki işe çarktan ya da İşler'den dönülür.</p>
    </Pencere>
  );
}
