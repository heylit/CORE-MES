import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Simge, type useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { degisken, HAZIRLANIYOR, MOTOR_NOTU } from '../ortak.tsx';
import { Kararlar } from './Bugun.tsx';
import {
  bitisFarklari, DONUK_SECENEKLERI, IZ_KARAR, IZ_ONAY, duruslar, gercekOku, grupAd, gs, gunAnahtari, gunKaydi, gunluk, nedenKisa, OLCEKLER, sabitMi, satirlar, sure, suzKoy,
  terminMetni, tz, zs,
} from './kurallar.ts';
import { bilgiAl, type Ortam } from './Pano.tsx';

// Kartlar (KART): seçilen iş, süzgeç, geri al, onaya gönder, diğer, donuk bölge, gün özeti, termin konuşması, tezgâh günlüğü. Kart tıklanan yerin
// yanında açılır, telefonda alttan; dışına dokunmak ve Esc kapatır. Panonun kabı konum kabı olduğundan kart sayfanın gövdesine çizilir.
export type AcikKart =
  | { tur: 'op'; id: string } | { tur: 'suz' } | { tur: 'geri' } | { tur: 'gonder' } | { tur: 'menu' } | { tur: 'dondurma' } | { tur: 'gun' }
  | { tur: 'termin'; j: string } | { tur: 'gunluk'; m: string };
export interface Ankraj { x: number; y: number }
type Bildir = ReturnType<typeof useBildirim>['bildir'];

export function KartKatmani({ ort, kart, ankraj, bildir }: { ort: Ortam; kart: AcikKart; ankraj: Ankraj | null; bildir: Bildir }) {
  const kok = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const k = kok.current; if (!k) return;
    for (const v of ['--kx', '--ky', '--kr']) k.style.removeProperty(v);
    if (window.innerWidth < 768) return;
    if (ankraj) {
      const kw = k.offsetWidth, kh = k.offsetHeight; let x = ankraj.x, y = ankraj.y + 8;
      if (x + kw > window.innerWidth - 16) x = window.innerWidth - 16 - kw;
      if (y + kh > window.innerHeight - 16) y = Math.max(64, ankraj.y - kh - 8);
      k.style.setProperty('--kx', `${Math.max(16, x)}px`); k.style.setProperty('--ky', `${Math.max(64, y)}px`);
    } else { k.style.setProperty('--kr', '16px'); k.style.setProperty('--ky', '72px'); }
    k.querySelector<HTMLElement>('[data-oto]')?.focus();
  }, [kart, ankraj]);
  const govde = kartGovdesi(ort, kart, bildir);
  if (!govde) return null;
  return createPortal(
    <div className="tc-pym-tp-katman">
      <div className="tc-pym-tp-perde" onClick={ort.kartKapat} />
      <div className="tc-pym-tp-kart" role="dialog" aria-label={govde.ad} ref={kok}>
        <h3><Simge ad={govde.simge} boyut="k" />{govde.ad}<span className="tc-pym-tp-bosluk" />
          <button type="button" className="tc-dugme tc-pym-hayalet tc-pym-kucuk" aria-label="Kapat" onClick={ort.kartKapat}><Simge ad="x" boyut="k" /></button>
        </h3>
        {govde.ic}
      </div>
    </div>,
    document.body,
  );
}

interface Govde { ad: string; simge: SimgeAdi; ic: ReactNode }
const Satir = ({ a, b, durum }: { a: ReactNode; b: ReactNode; durum?: 'gec' | 'iyi' | undefined }) => (
  <div className="tc-pym-tp-satir2"><span>{a}</span><b className={durum === 'gec' ? 'tc-pym-tp-kotu' : durum === 'iyi' ? 'tc-pym-tp-iyi' : undefined}>{b}</b></div>
);
const Not = ({ children, uyari }: { children: ReactNode; uyari?: boolean }) => <p className="tc-pym-tp-not" data-uyari={uyari ? '' : undefined}>{children}</p>;
const Etiket = ({ children }: { children: ReactNode }) => <span className="tc-pym-tp-etiket">{children}</span>;
const saatTr = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

function kartGovdesi(ort: Ortam, kart: AcikKart, bildir: Bildir): Govde | null {
  const { c, p, cx, now, donuk, o, yaz } = ort; const D = c.D; const komut = o.komut;
  switch (kart.tur) {
    case 'op': {
      const r = p.ops[kart.id]; const a = cx.byId[kart.id]; if (!r || !a) return null;
      const b = bilgiAl(ort, r.job); const k = kart.id.slice(r.job.length + 1);
      const lk = c.locks[kart.id] as { S?: unknown } | undefined; const sabit = sabitMi(r, now, donuk);
      const neden = nedenKisa(r); const g = gercekOku(c, kart.id); const sap = g ? g.S - (g.plan ?? g.S) : 0;
      const kilit = (ac: boolean) => komut?.degistir(ac ? 'Kilit açıldı' : 'İş kilitlendi', (t) => { if (ac) delete t.locks[kart.id]; else t.locks[kart.id] = { m: r.m, S: r.S }; }, { ayrinti: kart.id, planKoru: true });
      return {
        ad: `${r.job} · ${k}`, simge: 'cube', ic: (
          <>
            <Not>{`${a.ad} · ${b?.ad ?? ''}`}</Not>
            <Satir a="Tezgâh" b={r.fas ? r.m.slice(1) : r.m} />
            <Satir a="Başlangıç → bitiş" b={`${tz(D, r.S)} → ${tz(D, r.C)}`} />
            <Satir a="Neden bu saatte" b={neden} />
            {lk && typeof lk.S === 'number' && r.S > lk.S + 0.25 && <Not uyari><Simge ad="alert" boyut="k" />{` Kilit saati ${tz(D, lk.S)} tutmadı: ${neden}.`}</Not>}
            <Satir a="Sipariş bitişi / termin" b={`${tz(D, b?.C)} / ${tz(D, b?.due)}`} durum={b?.durum === 'gec' ? 'gec' : undefined} />
            {sabit && <Not><Simge ad="lock" boyut="k" /> Donuk bölgede ya da başlamış; taşınmaz.</Not>}
            {g && (
              <>
                <Satir a="Gerçek başlama" b={`${tz(D, g.S)}${Math.abs(sap) >= 0.25 ? ` (${sap > 0 ? '+' : '−'}${Math.round(Math.abs(sap) * 60)} dk)` : ''}`} />
                {sap > 0.5 && <Not uyari><Simge ad="alert" boyut="k" />{` Plandan ${Math.round(sap * 60)} dk sapma; ardındaki işler kaydı.`}</Not>}
              </>
            )}
            {!r.fas && (g || r.S <= now + donuk + 1e-6) && (
              <>
                <Etiket>{g ? `Sayım: işlenen adet (toplam ${cx.jobs[r.job]?.adet ?? '—'})` : 'Atölyeden: gerçek başlama'}</Etiket>
                <div className="tc-pym-tp-cipler">
                  {(g ? ['Kaydet'] : ['Planlı saatte', '+30 dk', '+1 sa', '+2 sa']).map((x) => (
                    <button key={x} type="button" className="tc-pym-tp-cip" aria-disabled="true" title={`${x}: ${MOTOR_NOTU}`}>{x}</button>
                  ))}
                </div>
              </>
            )}
            <div className="tc-pym-tp-eylem">
              {!sabit && yaz && (lk
                ? <button type="button" className="tc-dugme" onClick={() => kilit(true)}><Simge ad="lock" boyut="k" />Kilidi aç</button>
                : <button type="button" className="tc-dugme" title="Bu saat ve tezgâhta sabit kalır" onClick={() => kilit(false)}><Simge ad="lock" boyut="k" />Bu saatte kilitle</button>)}
              <button type="button" className="tc-dugme" onClick={() => ort.sipGoster(r.job)}><Simge ad="list" boyut="k" />Siparişi aç</button>
            </div>
            {!sabit && <Not>{`İpucu: çubuğu sürükleyerek başka saate ya da tezgâha taşımak: ${MOTOR_NOTU}`}</Not>}
          </>
        ),
      };
    }
    case 'suz': {
      const f = ort.suz; const R = satirlar(D, p); const G = [...new Set(R.map((x) => x.grup))];
      const koy = (k: 'g' | 'm' | 'j', v: string | null) => ort.suzSec(suzKoy(D, f, k, v));
      return {
        ad: 'Süz', simge: 'eye', ic: (
          <>
            <Not>Seçilene uymayan işler soluklaşır, sipariş listesi daralır; plan değişmez.</Not>
            <Etiket>İstasyon</Etiket>
            <div className="tc-pym-tp-cipler">{G.map((g) => <button key={g} type="button" className="tc-pym-tp-cip" aria-pressed={f?.g === g} onClick={() => koy('g', g)}>{grupAd(g)}</button>)}</div>
            <Etiket>Tezgâh</Etiket>
            <div className="tc-pym-tp-cipler">
              {R.filter((x) => !f?.g || x.grup === f.g).map((x) => (
                <button key={x.m} type="button" className="tc-pym-tp-cip" aria-pressed={f?.m === x.m} title={x.ad} onClick={() => koy('m', x.m)}>{x.fason ? x.m.slice(1) : x.m}</button>
              ))}
            </div>
            <label htmlFor="tc-pym-tp-suz-j">Üretim emri</label>
            <select id="tc-pym-tp-suz-j" value={f?.j ?? ''} onChange={(e) => ort.suzSec(suzKoy(D, f ? { ...f, j: null } : null, 'j', e.target.value || null))}>
              <option value="">Hepsi</option>
              {D.siparisler.map((x) => x.id).sort().map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme" aria-disabled={!f} onClick={() => { if (f) ort.suzSec(null); }}><Simge ad="x" boyut="k" />Temizle</button>
            </div>
          </>
        ),
      };
    }
    case 'geri':
      return {
        ad: 'Geri al', simge: 'back', ic: (
          <>
            <Kararlar ort={ort} n={10} bos="Bu panoda geri alınacak karar yok." />
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme" aria-disabled="true" title={`Yinele: ${MOTOR_NOTU}`}><Simge ad="next" boyut="k" />Yinele</button>
              <button type="button" className="tc-dugme" aria-disabled="true" title={`Taslağı sıfırla: ${MOTOR_NOTU}`}><Simge ad="rotate" boyut="k" />Taslağı sıfırla</button>
            </div>
            <Not>Sıfırlama tek adım değildir: çalışmayı canlı plana döndürür, onay ister.</Not>
          </>
        ),
      };
    case 'gonder': {
      const sv = o.depo.senaryolar; const canli = o.depo.planSurumu?.planSurumu ?? null;
      return {
        ad: 'Onaya gönder', simge: 'upload', ic: (
          <>
            <Not>Canlı plan onaylanana kadar değişmez. Çalışma planı kontrolden geçer ve onaya gider; sonucu Onay sekmesinde görürsün.</Not>
            {canli ? (
              <>
                <Satir a="Canlı sürüm" b={canli} />
                <Satir a="Geciken sipariş" b={`${sv ? sv.canli.geciken : '—'} → ${p.ozet.late}`} />
                <Satir a="Toplam gecikme" b={`— → ${sure(p.ozet.wT)}`} />
              </>
            ) : <Not>Henüz canlı plan yok; bu plan ilk canlı plan olarak onaya gider.</Not>}
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme tc-dugme-birincil" data-oto="" onClick={() => { ort.kartKapat(); ort.sekSec('onay'); }}><Simge ad="upload" boyut="k" />Gönder</button>
              <button type="button" className="tc-dugme" onClick={ort.kartKapat}>Vazgeç</button>
            </div>
          </>
        ),
      };
    }
    case 'menu':
      return {
        ad: 'Diğer', simge: 'more', ic: (
          <>
            <Etiket>Ölçek</Etiket>
            <div className="tc-pym-tp-cipler">{OLCEKLER.map(([z, a]) => <button key={z} type="button" className="tc-pym-tp-cip" aria-pressed={ort.olcek === z} onClick={() => ort.olcekSec(z)}>{a}</button>)}</div>
            <Etiket>Donuk bölge</Etiket>
            <Donuk ort={ort} />
            <Etiket>Görünüm</Etiket>
            <div className="tc-pym-tp-cipler">
              <button type="button" className="tc-pym-tp-cip" onClick={() => ort.kartAc({ tur: 'gun' })}><Simge ad="book" boyut="k" />Gün özeti</button>
              <button type="button" className="tc-pym-tp-cip" onClick={ort.brifAc}><Simge ad="sun" boyut="k" />Sabah brifingi</button>
              <button type="button" className="tc-pym-tp-cip" aria-disabled="true" title={`Atölye ekranı: ${HAZIRLANIYOR}`}><Simge ad="laptop" boyut="k" />Atölye ekranı</button>
            </div>
            <Etiket>Stüdyo</Etiket>
            <div className="tc-pym-tp-cipler">
              <button type="button" className="tc-pym-tp-cip" onClick={() => { ort.kartKapat(); ort.sekSec('onay'); }}><Simge ad="check" boyut="k" />Onay ve canlı</button>
              <button type="button" className="tc-pym-tp-cip" onClick={() => { ort.kartKapat(); ort.sekSec('pg'); }}><Simge ad="chart" boyut="k" />Plan ve gerçekleşen</button>
            </div>
            <Etiket>Kısayollar</Etiket>
            <Not>Ctrl+Z geri al · Esc kapat · 1-5 ölçek · / ara</Not>
            <Not>Her karar çalışma planına yazılır; canlı plan yalnız Onay sekmesinden değişir.</Not>
            <Not>Lejant: kırmızı geç, turuncu riskli (8 sa'ten az pay), çizgili baş ayar, kesikli çerçeve fason, mavi bölge donuk.</Not>
          </>
        ),
      };
    case 'dondurma':
      return {
        ad: 'Donuk bölge', simge: 'lock', ic: (
          <>
            <Not>Şimdiden itibaren bu kadar saatlik işler yerinde kalır; taşıma ve iyileştirme dokunmaz.</Not>
            <Donuk ort={ort} />
          </>
        ),
      };
    case 'gun': return gunOzeti(ort);
    case 'termin': {
      const s = bilgiAl(ort, kart.j); if (!s) return null; const metin = terminMetni(c, s);
      const kopyala = () => {
        const hata = () => bildir('hata', 'Kopyalanamadı; metni seçip kopyalayın.');
        if (typeof navigator.clipboard?.writeText !== 'function') { hata(); return; }
        navigator.clipboard.writeText(metin).then(() => bildir('tamam', 'Metin kopyalandı.'), hata);
      };
      return {
        ad: `${s.id} · termin konuş`, simge: 'clock', ic: (
          <>
            <div className="tc-pym-tp-karsi">
              <span>Termin</span><b>{tz(D, s.due)}</b><span />
              <span>Şimdiki plan</span><b>{tz(D, s.C)}</b><span />
              <span>En erken</span><b className={s.C != null && s.due != null && s.C > s.due ? 'tc-pym-tp-kotu' : 'tc-pym-tp-iyi'}>{tz(D, s.C)}</b><span />
            </div>
            <label htmlFor="tc-pym-tp-termin-m">Müşteriye gidecek metin (gönderilmez, kopyalanır)</label>
            <textarea id="tc-pym-tp-termin-m" rows={9} defaultValue={metin} />
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme tc-dugme-birincil" data-oto="" onClick={kopyala}><Simge ad="clipboard-check" boyut="k" />Kopyala</button>
              <button type="button" className="tc-dugme" onClick={ort.kartKapat}>Kapat</button>
            </div>
            <Not>{`Tarih şimdiki plandan; öne alarak kısaltmak: ${MOTOR_NOTU}`}</Not>
          </>
        ),
      };
    }
    case 'gunluk': {
      const G = gunluk(c, p, cx, kart.m); const t = D.tezgahlar.find((x) => x.id === kart.m);
      return {
        ad: `${kart.m} günlüğü`, simge: 'book', ic: (
          <>
            <Not>{`${t?.ad ?? ''} · 7 gün: açık saat, plan ve atölyeden girilen gerçekleşen.`}</Not>
            {G.map((g) => (
              <div key={g.d} className="tc-pym-tp-gunluk">
                <span>{gs(D, g.a)}</span>
                <span className="tc-pym-tp-gunluk-bar" title={`Plan ${sure(g.is)} / açık ${sure(g.ac)}`}>
                  <i data-dolu={g.o >= 0.85 ? '' : undefined} ref={degisken({ '--o': `${Math.round(g.o * 100)}%` })} />
                </span>
                <b>{g.ac ? `%${Math.round(g.o * 100)}` : 'kapalı'}</b>
                <small>
                  {`${g.n} iş · ${sure(g.is)} / ${sure(g.ac)}${g.ekMesai.length ? ` · ${g.ekMesai.map((e) => `ek mesai ${e}`).join(', ')}` : ''}`}
                  {g.gercek.length ? ` · gerçek: ${g.gercek.map((x) => `${x.job} ${x.sapma > 0.25 ? `+${Math.round(x.sapma * 60)} dk` : 'planda'}`).join(', ')}` : ''}
                  {g.ariza.length > 0 && <> · <span className="tc-pym-tp-kotu">{g.ariza.map(([a, b]) => `arıza ${zs(D, a)}–${zs(D, b)}`).join(', ')}</span></>}
                </small>
              </div>
            ))}
            <Not>Gerçekleşen atölyeden veri geldikçe dolar.</Not>
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme" onClick={() => { ort.suzSec(suzKoy(D, null, 'm', kart.m)); ort.kartKapat(); }}><Simge ad="eye" boyut="k" />Çizelgede süz</button>
              {yaz && <button type="button" className="tc-dugme" aria-disabled="true" title={`Arıza bildir: ${MOTOR_NOTU}`}><Simge ad="alert" boyut="k" />Arıza bildir</button>}
              {yaz && <button type="button" className="tc-dugme" aria-disabled="true" title={`Ek mesai: ${MOTOR_NOTU}`}><Simge ad="clock" boyut="k" />Ek mesai</button>}
            </div>
          </>
        ),
      };
    }
    default: return null;
  }
}

// Donuk bölge seçimi: çalışmanın ağırlığına (w.dondurma) yazılır; plan yeniden çözülünce etkir.
function Donuk({ ort }: { ort: Ortam }) {
  const komut = ort.o.komut;
  return (
    <div className="tc-pym-tp-cipler">
      {DONUK_SECENEKLERI.map((x) => (
        <button key={x} type="button" className="tc-pym-tp-cip" aria-pressed={ort.donuk === x} aria-disabled={!ort.yaz}
          onClick={() => { if (ort.yaz && ort.donuk !== x) komut?.degistir(`Donuk bölge ${x} sa`, (t) => { t.w = { ...t.w, dondurma: x }; }, { planKoru: true }); }}>
          {`${x} sa`}
        </button>
      ))}
    </div>
  );
}

// Gün özeti (KART.gun): gün başı ile şimdi, bugünkü kararlar ve onay hareketleri, bitişi değişen siparişler, arızalar, geçmiş günler.
function gunOzeti(ort: Ortam): Govde {
  const { c, p, o } = ort; const D = c.D;
  const g = gunKaydi(c); const bu = gunAnahtari(Date.now());
  const bugun = c.iz.filter((x) => gunAnahtari(x.t) === bu);
  const kar = bugun.filter((x) => IZ_KARAR.test(x.ne)); const ony = bugun.filter((x) => IZ_ONAY.test(x.ne));
  const basi = g.basi && g.basi.gun === bu ? g.basi : null;
  const fark = basi ? bitisFarklari(basi.e.J, p.J).slice(0, 10) : [];
  const canli = o.depo.planSurumu?.planSurumu ?? null; const dn = duruslar(c);
  return {
    ad: 'Gün özeti', simge: 'book', ic: (
      <>
        <div className="tc-pym-tp-karsi">
          <span /><b>Gün başı</b><b>Şimdi</b>
          <span>Geciken</span><b>{basi ? basi.e.late : '—'}</b><b>{p.ozet.late}</b>
          <span>Toplam gecikme</span><b>{basi ? sure(basi.e.wT) : '—'}</b><b>{sure(p.ozet.wT)}</b>
          <span>Canlı plan</span><b>{basi ? `sürüm ${basi.surum}` : '—'}</b><b>{`sürüm ${canli ?? 0}`}</b>
        </div>
        {!basi && <Not>Bugünün gün başı kaydı yok.</Not>}
        <Etiket>Kararlar</Etiket>
        {kar.length ? kar.map((z, i) => <Satir key={i} a={`${saatTr(z.t)} · ${z.ayrinti}`} b="" />) : <Not>Bugün karar yok.</Not>}
        <Etiket>Onay ve canlı</Etiket>
        {ony.length ? ony.map((z, i) => <Satir key={i} a={`${saatTr(z.t)} · ${z.ne}${z.ayrinti ? ` · ${z.ayrinti}` : ''}`} b="" />) : <Not>Onay hareketi yok.</Not>}
        <Etiket>Gün başına göre bitişi değişen</Etiket>
        {fark.length ? fark.map((q) => <Satir key={q.j} a={`${q.j}${q.gec ? ` · ${q.gec}` : ''}`} b={`${q.d > 0 ? '+' : '−'}${sure(q.d)}`} durum={q.d > 0 ? 'gec' : 'iyi'} />) : <Not>Bitişi değişen sipariş yok.</Not>}
        {dn.length > 0 && <><Etiket>Arızalar</Etiket>{dn.map((d) => <Satir key={`${d.m}-${d.from}`} a={d.m} b={`${tz(D, d.from)} → ${zs(D, d.to)}`} />)}</>}
        <Etiket>Geçmiş günler</Etiket>
        {g.gecmis.filter((x) => x.gun !== bu).slice(0, 30).map((x) => {
          const dw = x.son.wT - x.sabah.wT; const d = new Date(`${x.gun}T12:00:00`);
          return (
            <details key={x.gun} className="tc-pym-tp-gecmis">
              <summary>
                <b>{d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}</b>
                <span>{`gecikme ${sure(x.sabah.wT)} → ${sure(x.son.wT)} `}<span className={dw > 0.1 ? 'tc-pym-tp-kotu' : dw < -0.1 ? 'tc-pym-tp-iyi' : undefined}>{Math.abs(dw) < 0.1 ? '' : `${dw > 0 ? '+' : '−'}${sure(dw)}`}</span>{` · ${x.kararlar.length} karar`}</span>
              </summary>
              {x.kararlar.length ? x.kararlar.map((k, i) => <Satir key={i} a={`${saatTr(k.t)} · ${k.ad}`} b="" />) : <Not>Karar yok.</Not>}
              {x.onaylar.map((k, i) => <Satir key={`o${i}`} a={`${saatTr(k.t)} · ${k.ad}`} b="" />)}
            </details>
          );
        })}
        {!g.gecmis.some((x) => x.gun !== bu) && <Not>Henüz geçmiş gün yok. Her günün özeti çalışma kaydında saklanır, ertesi gün burada görünür.</Not>}
        <div className="tc-pym-tp-eylem">
          <button type="button" className="tc-dugme" onClick={ort.brifAc}><Simge ad="sun" boyut="k" />Sabah brifingi</button>
          <button type="button" className="tc-dugme" aria-disabled="true" title={`Atölye ekranı: ${HAZIRLANIYOR}`}><Simge ad="laptop" boyut="k" />Atölye ekranı</button>
        </div>
      </>
    ),
  };
}
