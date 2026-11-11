import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Simge, type useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { planGuncel } from '../../durum.ts';
import { bekleyenListesi } from '../../kayit.ts';
import type { AtolyeOlayi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { degisken } from '../ortak.tsx';
import { hamleYapisi, useHamleci } from '../hamle/hamle.ts';
import { elleSayilari, saatYazi, simdiSaati } from '../kurallar.ts';
import { mesaiAdaylari } from '../secim/kurallar.ts';
import { gunDondurmasiniKaldir, gunuDondur, sabitleriKaldir } from '../cizelge/kurallar.ts';
import { Kararlar } from './Bugun.tsx';
import { calismayiYolla, gonderHataIletisi, gonderIletisi } from './gonder.ts';
import {
  bitisFarklari, DONUK_SECENEKLERI, donukEtiketi, IZ_KARAR, IZ_ONAY, duruslar, GOSTERGE_GECIKEN_IPUCU, gostergeGecikenSay, gercekOku, grupAd, gs, gunAnahtari, gunKaydi, gunluk, kilitGunleri, nedenKisa, OLCEKLER, sabitMi, satirlar, sure, suzKoy,
  terminMetni, tz, zs,
} from './kurallar.ts';
import { bilgiAl, type Ortam } from './Pano.tsx';

// Kartlar (KART): seçilen iş, süzgeç, geri al, onaya gönder, diğer, donuk bölge, gün özeti, termin konuşması, tezgâh günlüğü. Kart tıklanan yerin
// yanında açılır, telefonda alttan; dışına dokunmak ve Esc kapatır. Panonun kabı konum kabı olduğundan kart sayfanın gövdesine çizilir.
export type AcikKart =
  | { tur: 'op'; id: string } | { tur: 'suz' } | { tur: 'geri' } | { tur: 'gonder' } | { tur: 'menu' } | { tur: 'dondurma' } | { tur: 'gun' }
  | { tur: 'termin'; j: string } | { tur: 'gunluk'; m: string } | { tur: 'olay'; m?: string; on?: OlayTuru } | { tur: 'mesai'; m: string };
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
        ad: `${ort.emirNo(r.job)} · ${k}`, simge: 'cube', ic: (
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
                    <button key={x} type="button" className="tc-pym-tp-cip" aria-disabled="true" title={`${x}: terminalden girilir.`}>{x}</button>
                  ))}
                </div>
              </>
            )}
            {!sabit && !r.fas && ort.tasi && <Tasi ort={ort} id={kart.id} m={r.m} S={r.S} adaylar={a.c.filter((m) => cx.M[m])} />}
            <div className="tc-pym-tp-eylem">
              {!sabit && yaz && (lk
                ? <button type="button" className="tc-dugme" onClick={() => kilit(true)}><Simge ad="lock" boyut="k" />Kilidi aç</button>
                : <button type="button" className="tc-dugme" title="Bu saat ve tezgâhta sabit kalır" onClick={() => kilit(false)}><Simge ad="lock" boyut="k" />Bu saatte kilitle</button>)}
              <button type="button" className="tc-dugme" onClick={() => ort.sipGoster(r.job)}><Simge ad="list" boyut="k" />Siparişi aç</button>
            </div>
            {!sabit && !r.fas && ort.tasi && <Not>İpucu: çubuğu sürükleyerek de başka saate ya da tezgâha taşıyabilirsiniz.</Not>}
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
              {D.siparisler.filter((x) => x.iptal !== true).map((x) => x.id).sort().map((j) => <option key={j} value={j}>{ort.emirNo(j)}</option>)}
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
            <GeriEylemleri ort={ort} />
          </>
        ),
      };
    case 'gonder': {
      const sv = o.depo.senaryolar; const canli = o.depo.planSurumu?.planSurumu ?? null;
      const engel = gonderEngeli(ort.c);
      return {
        ad: 'Onaya gönder', simge: 'upload', ic: (
          <>
            <Not>Canlı plan onaylanana kadar değişmez. Çalışma planı kontrolden geçer ve onaya gider; sonucu Onay sekmesinde görürsün.</Not>
            {canli ? (
              <>
                <Satir a="Canlı sürüm" b={canli} />
                <Satir a={<span title={GOSTERGE_GECIKEN_IPUCU}>Geciken emir</span>} b={`${sv ? sv.canli.geciken : '—'} → ${gostergeGecikenSay(ort.liste)}`} />
                <Satir a={<span title="Öncelik ağırlıklı gecikme: geciken saat, öncelik 1 için 4, öncelik 2 için 2 katıyla sayılır.">Ağırlıklı gecikme</span>} b={`— → ${saatYazi(p.ozet.wT)}`} />
              </>
            ) : <Not>Henüz canlı plan yok; bu plan ilk canlı plan olarak onaya gider.</Not>}
            {engel && <Not uyari>{engel}</Not>}
            <div className="tc-pym-tp-eylem">
              <GonderDugmesi ort={ort} bildir={bildir} engel={engel} />
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
              <button type="button" className="tc-pym-tp-cip" onClick={ort.atolyeAc}><Simge ad="laptop" boyut="k" />Atölye ekranı</button>
            </div>
            <Etiket>Stüdyo</Etiket>
            <div className="tc-pym-tp-cipler">
              <button type="button" className="tc-pym-tp-cip" onClick={() => { ort.kartKapat(); ort.sekSec('onay'); }}><Simge ad="check" boyut="k" />Onay ve canlı</button>
              <button type="button" className="tc-pym-tp-cip" onClick={() => { ort.kartKapat(); ort.sekSec('pg'); }}><Simge ad="chart" boyut="k" />Plan ve gerçekleşen</button>
            </div>
            <Etiket>Kısayollar</Etiket>
            <Not>Ctrl+Z geri al · Ctrl+Shift+Z yinele · E düzenle · Y yapılacaklar · Esc kapat · 1-5 ölçek · / ara</Not>
            <Not>Her karar çalışma planına yazılır; canlı plan yalnız Onay sekmesinden değişir.</Not>
            <Not>Lejant: kırmızı geç, turuncu riskli (8 sa'ten az pay), çizgili baş ayar, kesikli çerçeve fason, mavi bölge donuk.</Not>
          </>
        ),
      };
    case 'dondurma':
      return {
        ad: 'Kilit ve dondurma', simge: 'lock', ic: <KilitPaneli ort={ort} />,
      };
    case 'gun': return gunOzeti(ort);
    case 'olay': return ort.olayEkle ? { ad: 'Olay ekle', simge: 'plus', ic: <OlayFormu ort={ort} ekle={ort.olayEkle} m={kart.m} on={kart.on} /> } : null;
    case 'mesai': return ort.ekMesai ? { ad: `${kart.m} ek mesai`, simge: 'clock', ic: <EkMesai ort={ort} m={kart.m} ekle={ort.ekMesai} /> } : null;
    case 'termin': {
      const s = bilgiAl(ort, kart.j); if (!s) return null; const metin = terminMetni(c, s);
      const kopyala = () => {
        const hata = () => bildir('hata', 'Kopyalanamadı; metni seçip kopyalayın.');
        if (typeof navigator.clipboard?.writeText !== 'function') { hata(); return; }
        navigator.clipboard.writeText(metin).then(() => bildir('tamam', 'Metin kopyalandı.'), hata);
      };
      return {
        ad: `${ort.emirNo(s.id)} · termin konuş`, simge: 'clock', ic: (
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
            <TerminOneAl ort={ort} j={s.id} />
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
                  {g.gercek.length ? ` · gerçek: ${g.gercek.map((x) => `${ort.emirNo(x.job)} ${x.sapma > 0.25 ? `+${Math.round(x.sapma * 60)} dk` : 'planda'}`).join(', ')}` : ''}
                  {g.ariza.length > 0 && <> · <span className="tc-pym-tp-kotu">{g.ariza.map(([a, b]) => `arıza ${zs(D, a)}–${zs(D, b)}`).join(', ')}</span></>}
                </small>
              </div>
            ))}
            <Not>Gerçekleşen atölyeden veri geldikçe dolar.</Not>
            <div className="tc-pym-tp-eylem">
              <button type="button" className="tc-dugme" onClick={() => { ort.suzSec(suzKoy(D, null, 'm', kart.m)); ort.kartKapat(); }}><Simge ad="eye" boyut="k" />Çizelgede süz</button>
              {yaz && <button type="button" className="tc-dugme" aria-disabled={!ort.olayEkle} onClick={() => { if (ort.olayEkle) ort.kartAc({ tur: 'olay', m: kart.m }); }}><Simge ad="alert" boyut="k" />Arıza bildir</button>}
              {yaz && <button type="button" className="tc-dugme" aria-disabled={!ort.ekMesai} onClick={() => { if (ort.ekMesai) ort.kartAc({ tur: 'mesai', m: kart.m }); }}><Simge ad="clock" boyut="k" />Ek mesai</button>}
            </div>
          </>
        ),
      };
    }
    default: return null;
  }
}

// Donuk bölge seçimi: çalışmanın ağırlığına (w.dondurma) yazılır; plan yeniden çözülünce etkir.
// Taşı (1981 b): aynı saatte başka tezgâha ya da aynı tezgâhta başka saate. İş o yerde kilitlenir; uygun olmayan yeri motor kabul etmez.
const KAYDIR: [string, number][] = [['−1 sa', -1], ['+1 sa', 1], ['+4 sa', 4], ['+1 gün', 24]];
function Tasi({ ort, id, m, S, adaylar }: { ort: Ortam; id: string; m: string; S: number; adaylar: string[] }) {
  const tasi = ort.tasi; if (!tasi) return null;
  return (
    <>
      <Etiket>Taşı: tezgâh</Etiket>
      <div className="tc-pym-tp-cipler">
        {adaylar.map((x) => (
          <button key={x} type="button" className="tc-pym-tp-cip" aria-pressed={x === m} onClick={() => { if (x !== m) tasi(id, x, S); }}>{x}</button>
        ))}
      </div>
      <Etiket>Taşı: saat</Etiket>
      <div className="tc-pym-tp-cipler">
        {KAYDIR.map(([ad, h]) => {
          const yok = S + h < ort.now;
          return <button key={ad} type="button" className="tc-pym-tp-cip" aria-disabled={yok} title={yok ? 'Geçmiş saate taşınamaz' : undefined} onClick={() => { if (!yok) tasi(id, m, S + h); }}>{ad}</button>;
        })}
      </div>
    </>
  );
}

// Olay ekle (1982 a): arıza, acil sipariş, malzeme gecikmesi, personel eksikliği ya da fason gecikmesi. Olay sunucuda çalışmaya yazılır,
// motor planı kurarken uygular.
type OlayTuru = AtolyeOlayi['tip'];
type OlayAlani = 'm' | 'ofs' | 'saat' | 'urun' | 'adet' | 'termin' | 'kod' | 'gun' | 'vardiya' | 'grup' | 'n' | 'f' | 'tarih';
const OLAY_TURLERI: [OlayTuru, string][] = [['ariza', 'Arıza'], ['acil', 'Acil sipariş'], ['malzeme', 'Malzeme gecikmesi'], ['eksik', 'Personel eksik'], ['fason', 'Fason gecikmesi']];
const gunFarki = (bas: string | undefined, gun: string): number | null => {
  const a = Date.parse(`${(bas ?? '').slice(0, 10)}T00:00:00Z`), b = Date.parse(`${gun}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
};
// Ek mesai (2053): önümüzdeki beş günde tezgâhın çalışmadığı vardiyalar; seçilen sunucuda çalışmaya yazılır, plan kendiliğinden uygulanır.
// Bütçe onaya gönderirken denetlenir.
function EkMesai({ ort, m, ekle }: { ort: Ortam; m: string; ekle: (m: string, gun: number, vardiya: string) => void }) {
  const l = mesaiAdaylari(ort.c, ort.cx, m);
  const var_ = ort.c.ekMesai.flatMap((e) => (e.m === m && typeof e.gun === 'number' && e.gun >= Math.floor(ort.now / 24) ? [{ gun: e.gun, vardiya: String(e.vardiya) }] : []));
  return (
    <>
      {var_.length > 0 && <Not>{`Eklenmiş: ${var_.map((e) => `${gs(ort.c.D, e.gun * 24)} ${e.vardiya}`).join(', ')}`}</Not>}
      {l.length === 0 ? <Not>Önümüzdeki beş günde eklenecek vardiya yok.</Not> : (
        <div className="tc-pym-tp-cipler">
          {l.map((x) => <button key={`${String(x.gun)}/${x.vardiya}`} type="button" className="tc-pym-tp-cip" onClick={() => { ekle(m, x.gun, x.vardiya); ort.kartKapat(); }}>{x.ad}</button>)}
        </div>
      )}
      <Not>Ek mesai bütçesi onaya gönderirken denetlenir.</Not>
    </>
  );
}

function OlayFormu({ ort, ekle, m, on }: { ort: Ortam; ekle: (o: AtolyeOlayi) => Promise<boolean>; m?: string | undefined; on?: OlayTuru | undefined }) {
  const D = ort.c.D;
  const tezgahlar = D.tezgahlar; const urunler = D.urunler; const malzemeler = D.malzemeler ?? []; const fasoncular = D.fasoncular ?? [];
  const vardiyalar = (D.vardiyalar ?? []).flatMap((v) => (typeof v.id === 'string' ? [{ id: v.id, ad: typeof v.ad === 'string' ? v.ad : v.id }] : []));
  const gruplar = [...new Set(tezgahlar.map((t) => (typeof t.grup === 'string' ? t.grup : '')).filter(Boolean))];
  const [tur, setTur] = useState<OlayTuru>(on ?? 'ariza');
  const [f, setF] = useState<Record<OlayAlani, string>>({ m: m ?? tezgahlar[0]?.id ?? '', ofs: '0', saat: '8', urun: urunler[0]?.id ?? '', adet: '1', termin: '',
    kod: malzemeler[0]?.kod ?? '', gun: '1', vardiya: vardiyalar[0]?.id ?? '', grup: gruplar[0] ?? 'ayar', n: '1', f: fasoncular[0]?.id ?? '', tarih: '' });
  const [gidiyor, setGidiyor] = useState(false);
  const al = (k: OlayAlani) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sayi = (k: OlayAlani) => Number(f[k]);
  const olay = ((): AtolyeOlayi | null => {
    switch (tur) {
      case 'ariza': return f.m && sayi('saat') > 0 && sayi('ofs') >= 0 ? { tip: 'ariza', m: f.m, bas: ort.now + sayi('ofs'), saat: sayi('saat') } : null;
      case 'acil': return f.urun && Number.isInteger(sayi('adet')) && sayi('adet') > 0 && f.termin ? { tip: 'acil', urun: f.urun, adet: sayi('adet'), termin: f.termin.replace('T', ' ') } : null;
      case 'malzeme': return f.kod && Number.isInteger(sayi('gun')) && sayi('gun') >= 1 ? { tip: 'malzeme', kod: f.kod, gun: sayi('gun') } : null;
      case 'eksik': {
        const g = f.tarih ? gunFarki(D.meta?.baslangic, f.tarih) : null;
        return g !== null && g >= 0 && f.vardiya && Number.isInteger(sayi('n')) && sayi('n') >= 1 ? { tip: 'eksik', gun: g, vardiya: f.vardiya, grup: f.grup, n: sayi('n') } : null;
      }
      case 'fason': return f.f && Number.isInteger(sayi('gun')) && sayi('gun') >= 1 ? { tip: 'fason', f: f.f, gun: sayi('gun') } : null;
    }
  })();
  const gonder = async () => {
    if (!olay) return;
    setGidiyor(true);
    // Arızanın başlangıcı gönderme anının saatinden (2506 a): form uzun açık kalsa da olay geçmişe yazılmaz.
    const x = olay.tip === 'ariza' ? { ...olay, bas: simdiSaati(ort.c, Date.now()) + sayi('ofs') } : olay;
    if (await ekle(x)) ort.kartKapat(); else setGidiyor(false);
  };
  const alan = (k: OlayAlani, ad: string, ic: ReactNode) => <><label htmlFor={`tc-pym-tp-olay-${k}`}>{ad}</label>{ic}</>;
  const secim = (k: OlayAlani, l: { id: string; ad: string }[]) => (
    <select id={`tc-pym-tp-olay-${k}`} value={f[k]} onChange={al(k)}>{l.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}</select>
  );
  const giris = (k: OlayAlani, tip: 'number' | 'date' | 'datetime-local', min?: number) => (
    <input id={`tc-pym-tp-olay-${k}`} className="tc-pym-tp-girdi" type={tip} min={min} value={f[k]} onChange={al(k)} />
  );
  return (
    <>
      <div className="tc-pym-tp-cipler" role="group" aria-label="Olay türü">
        {OLAY_TURLERI.map(([t, ad]) => <button key={t} type="button" className="tc-pym-tp-cip" aria-pressed={tur === t} onClick={() => setTur(t)}>{ad}</button>)}
      </div>
      {tur === 'ariza' && <>
        {alan('m', 'Tezgâh', secim('m', tezgahlar.map((t) => ({ id: t.id, ad: t.ad ? `${t.id} · ${t.ad}` : t.id }))))}
        {alan('ofs', 'Kaç saat sonra başlar', giris('ofs', 'number', 0))}
        {alan('saat', 'Süre (saat)', giris('saat', 'number', 1))}
      </>}
      {tur === 'acil' && <>
        {alan('urun', 'Ürün', secim('urun', urunler.map((u) => ({ id: u.id, ad: u.ad ?? u.id }))))}
        {alan('adet', 'Adet', giris('adet', 'number', 1))}
        {alan('termin', 'Termin', giris('termin', 'datetime-local'))}
      </>}
      {tur === 'malzeme' && <>
        {alan('kod', 'Malzeme', secim('kod', malzemeler.map((x) => ({ id: x.kod, ad: x.ad ?? x.kod }))))}
        {alan('gun', 'Gecikme (gün)', giris('gun', 'number', 1))}
      </>}
      {tur === 'eksik' && <>
        {alan('tarih', 'Gün', giris('tarih', 'date'))}
        {alan('vardiya', 'Vardiya', secim('vardiya', vardiyalar))}
        {alan('grup', 'Kim eksik', secim('grup', [...gruplar.map((g) => ({ id: g, ad: `${grupAd(g)} personeli` })), { id: 'ayar', ad: 'Ayarcı' }]))}
        {alan('n', 'Kişi sayısı', giris('n', 'number', 1))}
      </>}
      {tur === 'fason' && <>
        {alan('f', 'Fasoncu', secim('f', fasoncular.map((x) => ({ id: x.id, ad: x.ad ?? x.id }))))}
        {alan('gun', 'Gecikme (gün)', giris('gun', 'number', 1))}
      </>}
      <div className="tc-pym-tp-eylem">
        <button type="button" className="tc-dugme tc-dugme-birincil" data-oto="" aria-disabled={!olay || gidiyor} onClick={() => void gonder()}>
          <Simge ad="plus" boyut="k" />{gidiyor ? 'Ekleniyor' : 'Olayı ekle'}
        </button>
        <button type="button" className="tc-dugme" onClick={ort.kartKapat}>Vazgeç</button>
      </div>
      <Not>Olay çalışmaya yazılır; plan bir sonraki uygulamada hesaba katar.</Not>
    </>
  );
}

function Donuk({ ort }: { ort: Ortam }) {
  const komut = ort.o.komut;
  return (
    <div className="tc-pym-tp-cipler">
      {DONUK_SECENEKLERI.map((x) => (
        <button key={x} type="button" className="tc-pym-tp-cip" aria-pressed={ort.donuk === x} aria-disabled={!ort.yaz}
          onClick={() => { if (ort.yaz && ort.donuk !== x) komut?.degistir(`Donuk bölge ${donukEtiketi(x)}`, (t) => { t.w = { ...t.w, dondurma: x }; }, { planKoru: true }); }}>
          {donukEtiketi(x)}
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
          <span title="Öncelik ağırlıklı gecikme: geciken saat, öncelik 1 için 4, öncelik 2 için 2 katıyla sayılır.">Ağırlıklı gecikme</span><b>{basi ? saatYazi(basi.e.wT) : '—'}</b><b>{saatYazi(p.ozet.wT)}</b>
          <span>Canlı plan</span><b>{basi ? `sürüm ${basi.surum}` : '—'}</b><b>{`sürüm ${canli ?? 0}`}</b>
        </div>
        {!basi && <Not>Bugünün gün başı kaydı yok.</Not>}
        <Etiket>Kararlar</Etiket>
        {kar.length ? kar.map((z, i) => <Satir key={i} a={`${saatTr(z.t)} · ${z.ayrinti}`} b="" />) : <Not>Bugün karar yok.</Not>}
        <Etiket>Onay ve canlı</Etiket>
        {ony.length ? ony.map((z, i) => <Satir key={i} a={`${saatTr(z.t)} · ${z.ne}${z.ayrinti ? ` · ${z.ayrinti}` : ''}`} b="" />) : <Not>Onay hareketi yok.</Not>}
        <Etiket>Gün başına göre bitişi değişen</Etiket>
        {fark.length ? fark.map((q) => <Satir key={q.j} a={`${ort.emirNo(q.j)}${q.gec ? ` · ${q.gec}` : ''}`} b={`${q.d > 0 ? '+' : '−'}${sure(q.d)}`} durum={q.d > 0 ? 'gec' : 'iyi'} />) : <Not>Bitişi değişen sipariş yok.</Not>}
        {dn.length > 0 && <><Etiket>Arızalar</Etiket>{dn.map((d) => <Satir key={`${d.m}-${d.from}`} a={d.m} b={`${tz(D, d.from)} → ${zs(D, d.to)}`} />)}</>}
        <Etiket>Geçmiş günler</Etiket>
        {g.gecmis.filter((x) => x.gun !== bu).slice(0, 30).map((x) => {
          const dw = x.son.wT - x.sabah.wT; const d = new Date(`${x.gun}T12:00:00`);
          return (
            <details key={x.gun} className="tc-pym-tp-gecmis">
              <summary>
                <b>{d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}</b>
                <span>{`ağırlıklı gecikme ${saatYazi(x.sabah.wT)} → ${saatYazi(x.son.wT)} `}<span className={dw > 0.1 ? 'tc-pym-tp-kotu' : dw < -0.1 ? 'tc-pym-tp-iyi' : undefined}>{Math.abs(dw) < 0.1 ? '' : `${dw > 0 ? '+' : '−'}${saatYazi(Math.abs(dw))}`}</span>{` · ${x.kararlar.length} karar`}</span>
              </summary>
              {x.kararlar.length ? x.kararlar.map((k, i) => <Satir key={i} a={`${saatTr(k.t)} · ${k.ad}`} b="" />) : <Not>Karar yok.</Not>}
              {x.onaylar.map((k, i) => <Satir key={`o${i}`} a={`${saatTr(k.t)} · ${k.ad}`} b="" />)}
            </details>
          );
        })}
        {!g.gecmis.some((x) => x.gun !== bu) && <Not>Henüz geçmiş gün yok. Her günün özeti çalışma kaydında saklanır, ertesi gün burada görünür.</Not>}
        <div className="tc-pym-tp-eylem">
          <button type="button" className="tc-dugme" onClick={ort.brifAc}><Simge ad="sun" boyut="k" />Sabah brifingi</button>
          <button type="button" className="tc-dugme" onClick={ort.atolyeAc}><Simge ad="laptop" boyut="k" />Atölye ekranı</button>
        </div>
      </>
    ),
  };
}

// Eski gonderOnay: kart doğrudan onaya gönderir (canlıya alma ayrı düğmedir, Onay sekmesinde). Eski veriyle çözülmüş plan gönderilmez, Onay
// sekmesindeki kontrole gidilir. Ret ve yarıda kalma sunucunun iletisiyle gösterilir; kart açık kalır.
// 1786 (PLN-1): plan veriden eskiyse gönderilmez; neden diyalogda önceden yazılır ve düğme kişiyi engelin kalktığı Onay sekmesine götürür
// (önceden Gönder açıktı, basınca sekme değişip kısa bir bildirim çıkıyordu; gönderilmediği fark edilmiyordu).
export function gonderEngeli(c: PlanlamaCalismasi): string | null {
  if (planGuncel(c)) return null;
  const n = bekleyenListesi(c).length;
  return n > 0
    ? `Gönderilemez: ${String(n)} bekleyen değişiklik plana uygulanmadı. Onay ve canlı sekmesinde uygulayın ya da reddedin, sonra gönderin.`
    : 'Gönderilemez: veri plandan sonra değişti. Önce planı yeniden çözün.';
}

function GonderDugmesi({ ort, bildir, engel }: { ort: Ortam; bildir: Bildir; engel: string | null }) {
  const [gidiyor, setGidiyor] = useState(false);
  if (engel !== null) {
    return <button type="button" className="tc-dugme tc-dugme-birincil" data-oto="" onClick={() => { ort.kartKapat(); ort.sekSec('onay'); }}><Simge ad="check" boyut="k" />Onay sekmesine git</button>;
  }
  const gonder = async () => {
    setGidiyor(true);
    try {
      const g = await calismayiYolla({ o: ort.o, c: ort.c, sen: ort.sen, hedef: 'onay', not: null });
      if (g.senaryolar) ort.senYaz(g.senaryolar);
      ort.kartKapat(); ort.sekSec('onay');
      bildir('tamam', gonderIletisi('onay', g));
    } catch (e) {
      setGidiyor(false);
      bildir('hata', gonderHataIletisi(e));
    }
  };
  return (
    <button type="button" className="tc-dugme tc-dugme-birincil" data-oto="" disabled={gidiyor} onClick={() => void gonder()}><Simge ad="upload" boyut="k" />{gidiyor ? 'Gönderiliyor' : 'Gönder'}</button>
  );
}

// Yinele ve taslağı sıfırla (2531 a). Sıfırlama bu oturumdaki bütün kararları birlikte geri alır; ikinci basışla onaylanır. Canlı plana dönüş
// sunucuda bir komut değildir; oturumdan önceki farklar Onaya gönder ve Onay sekmesinde kalır.
function GeriEylemleri({ ort }: { ort: Ortam }) {
  const komut = ort.o.komut;
  const [emin, setEmin] = useState(false);
  const n = komut?.geriAdimlari().length ?? 0;
  const yinele = ort.yaz && !!komut?.yinelenebilir?.();
  return (
    <>
      <div className="tc-pym-tp-eylem">
        <button type="button" className="tc-dugme" aria-disabled={yinele ? undefined : 'true'} title={yinele ? 'Yinele (Ctrl+Shift+Z)' : 'Yinelenecek karar yok.'}
          onClick={() => { if (yinele) komut?.yinele?.(); }}><Simge ad="next" boyut="k" />Yinele</button>
        {emin && n > 0 ? (
          <button type="button" className="tc-dugme tc-dugme-tehlike" data-oto="" onClick={() => { setEmin(false); if (ort.yaz) komut?.geriDon(n); }}>
            <Simge ad="rotate" boyut="k" />{`${n} kararı geri al`}
          </button>
        ) : (
          <button type="button" className="tc-dugme" aria-disabled={ort.yaz && n > 0 ? undefined : 'true'} title={n > 0 ? 'Bu oturumdaki bütün kararları birlikte geri alır.' : 'Bu oturumda karar yok.'}
            onClick={() => { if (ort.yaz && n > 0) setEmin(true); }}><Simge ad="rotate" boyut="k" />Taslağı sıfırla</button>
        )}
      </div>
      <Not>{emin ? 'Emin misiniz? Bu oturumdaki kararların hepsi geri alınır; canlı plan değişmez. Yinele ile dönülebilir.' : 'Sıfırlama bu oturumdaki kararları birlikte geri alır; canlı plan değişmez. Geri alma geçmişi ve plan kopyaları bu tarayıcıdadır, sayfa yenilenince silinir.'}</Not>
    </>
  );
}

// Termini kısaltmak: motor siparişi öne alan planı arar, sonuç panonun üstünde önizlenir (2531 a).
function TerminOneAl({ ort, j }: { ort: Ortam; j: string }) {
  const y = hamleYapisi(useHamleci(), (h) => { h.oneAl(j); });
  return (
    <>
      <div className="tc-pym-tp-eylem">
        <button type="button" className="tc-dugme" aria-disabled={y.yap ? undefined : 'true'} title={y.yap ? 'Motor bu siparişi öne alan planı arar; önizlersiniz.' : `Öne al: ${y.not}`}
          onClick={y.yap ? () => { ort.kartKapat(); y.yap?.(); } : undefined}><Simge ad="first" boyut="k" />Öne alarak kısalt</button>
      </div>
      <Not>Tarih şimdiki plandan; öne alınca yeni bitiş önizlemede görünür.</Not>
    </>
  );
}

// Kilit ve dondurma (2539 a): donuk bölge, elle sabitlenen işler ve dondurulmuş günler tek panelde. Komutlar Çizelge'dekilerle aynıdır
// (sabitleriKaldir, gunuDondur); oradaki yerler kısa yol olarak kalır. Başlamış iş bu ayarlardan bağımsızdır.
function KilitPaneli({ ort }: { ort: Ortam }) {
  const { c, p, now, yaz } = ort; const komut = ort.o.komut; const D = c.D;
  const [emin, setEmin] = useState(false);
  const e = elleSayilari(c);
  const gunler = kilitGunleri(c, p, now);
  const sabitKaldir = () => { setEmin(false); if (yaz) komut?.degistir('Sabitler kaldırıldı', sabitleriKaldir, { ayrinti: 'dondurulmuş günler korundu', planKoru: true }); };
  const gun = (g: (typeof gunler)[number]) => {
    if (!yaz) return;
    komut?.degistir(g.donuk ? 'Gün dondurması kaldırıldı' : 'Gün donduruldu', (x) => { if (g.donuk) gunDondurmasiniKaldir(x, g.gNo); else gunuDondur(x, p, g.gNo); },
      { ayrinti: gs(D, g.t), planKoru: true });
  };
  return (
    <>
      <Etiket>Donuk bölge</Etiket>
      <Not>Şimdiden itibaren bu kadar saatlik işler yerinde kalır; taşıma ve iyileştirme dokunmaz.</Not>
      <Donuk ort={ort} />
      <Etiket>{`Elle sabitlenen işler · ${e.sabit}`}</Etiket>
      <div className="tc-pym-tp-eylem">
        {emin && e.sabit > 0 ? (
          <button type="button" className="tc-dugme tc-dugme-tehlike" data-oto="" onClick={sabitKaldir}><Simge ad="x" boyut="k" />{`${e.sabit} sabiti kaldır`}</button>
        ) : (
          <button type="button" className="tc-dugme" aria-disabled={yaz && e.sabit > 0 ? undefined : 'true'} title={e.sabit ? 'Elle sabitlenen işlerin kilidi kalkar; dondurulmuş günler korunur.' : 'Elle sabitlenen iş yok.'}
            onClick={() => { if (yaz && e.sabit > 0) setEmin(true); }}><Simge ad="x" boyut="k" />Sabitleri kaldır</button>
        )}
      </div>
      {emin && <Not>Emin misiniz? Dondurulmuş günler korunur; geri al ile dönülebilir.</Not>}
      <Etiket>{`Dondurulmuş günler · ${e.gun}`}</Etiket>
      <ul className="tc-pym-tp-kilit-gun">
        {gunler.map((g) => (
          <li key={g.gNo} data-donuk={g.donuk ? '' : undefined}>
            <span><b>{gs(D, g.t)}</b><small>{`${g.n} iş başlıyor`}</small></span>
            <button type="button" className="tc-dugme" aria-disabled={yaz && (g.donuk || g.n > 0) ? undefined : 'true'} aria-pressed={g.donuk}
              title={g.donuk ? 'Bu günün kilitleri kalkar; elle sabitlere dokunulmaz.' : g.n ? 'O gün başlayan işler yerinde kilitlenir.' : 'O gün başlayan iş yok.'}
              onClick={() => { if (g.donuk || g.n > 0) gun(g); }}>
              <Simge ad="lock" boyut="k" />{g.donuk ? 'Dondurmayı kaldır' : 'Günü dondur'}
            </button>
          </li>
        ))}
      </ul>
      <Not>Başlamış iş bu ayarlardan bağımsızdır: yerinde kalır, kilidi kaldırılamaz.</Not>
    </>
  );
}
