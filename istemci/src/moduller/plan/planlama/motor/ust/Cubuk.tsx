import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { nabizFarki, sayiEki, type NabizGostergesi } from '../kurallar.ts';
import { KURULUYOR, type BekleyenUygulayici, type PlanKurucu } from '../coz.ts';
import { CALISMA_ACILINCA, YOK_NOTU } from '../ortak.tsx';
import { OLAY_YOK, useOlayAc } from '../../gorunumler.ts';
import { egriNoktalari, NABIZ_GOSTERGELERI, nabizDegeri, type NabizDurumu } from './nabiz.ts';
import type { SeritYuvaBaglari } from './yuva.ts';
import { HesapSuresi } from './HesapSuresi.tsx';

// Plan şeridi (3308-2 a): durum ışığı, üç nabız sayısı, olay sayısı, plan durumu ve tek eylem; tek satırdır, dokununca plan nabzı ve olaylar açılır.
interface Ozellikler {
  plan: boolean; guncel: boolean; planYaz: boolean;
  nabiz: NabizDurumu | null; nabizAcik: boolean; nabizAc: (ac: boolean) => void;
  // Nabızdaki gecikme sayısı Motor sayfasının özetine götürür.
  ozeteGit: () => void;
  refSec: ((v: 'onceki' | 'sabit') => void) | null; sabitle: (() => void) | null; sabitAd: string | null;
  // Planı kur sunucudaki motorla (576); verilmezse ya da plan varken (iyileştirme, 579 b) düğme pasif.
  planKur?: PlanKurucu | null;
  // Plan veriden eskiyse bekleyen değişiklikleri uygular (1786 PLN-2); verilmezse düğme eskisi gibi pasif.
  bekleyenUygula?: BekleyenUygulayici | null;
  // Çalışmanın olayları (arıza, acil sipariş, malzeme, eksik kişi, fason); açık şeritte listelenir.
  olaylar?: readonly Record<string, unknown>[];
  // Sayfanın şeride kendi içeriğini çizdiği yerler (3317, Kokpit): satırdaki yuva plan durumu rozetinin yerini alır (durumu sayfa söyler),
  // toplu düğme veri değişikliklerini adıyla söyler ve ikincildir (sayfanın tek birincili taslak çubuğundadır), nabzın olay sayısı satırda
  // çizilmez (şeritte tek sayı sayfanınkidir; olaylar açık nabızda listelenir).
  yuva?: SeritYuvaBaglari | null;
  // Sayfa şeridi kendi çiziyorsa (Motor, 3317-1b) aynı iki yere doğrudan verdiği içerik: satırda plan durumu rozetinin yerine özet, şeridin
  // altında liste. Toplu düğme birincil kalır (sayfanın tek birincili odur).
  ek?: { satir: ReactNode; alt: ReactNode } | null;
  // Planı kurmayan sayfa (3537 a: Malzeme satın alma planı, Sevk takvimi): plan Kokpit'te kurulur ve güncellenir (3282-1 a). Şerit birincil
  // taşımaz; Planı kur ya da güncelle yerine Kokpit'e götüren ikincil düğme çizer (sayfanın tek birincili kendi işidir).
  kokpiteGit?: (() => void) | null;
}

// Durum ışığı: geciken yoksa yeşil; bir iki geciken ya da darboğaz %95 üstündeyse sarı; daha çok gecikende kırmızı.
type Isik = 'yok' | 'iyi' | 'dikkat' | 'sorun';
const ISIK_ADI: Record<Isik, string> = { yok: 'plan yok', iyi: 'yolunda', dikkat: 'dikkat', sorun: 'sorun var' };
function isikOf(n: NabizDurumu | null): Isik {
  if (!n) return 'yok';
  const gec = n.cur.late ?? 0, dar = n.cur.dar ?? 0;
  return gec >= 3 ? 'sorun' : gec > 0 || dar >= 95 ? 'dikkat' : 'iyi';
}
const OLAY_ADI: Record<string, string> = { ariza: 'Arıza', acil: 'Acil sipariş', malzeme: 'Malzeme gecikmesi', eksik: 'Eksik kişi', fason: 'Fason gecikmesi' };
const olayOzeti = (x: Record<string, unknown>): string => {
  const y = (k: string) => (typeof x[k] === 'string' || typeof x[k] === 'number' ? String(x[k]) : '');
  return [y('m') || y('urun') || y('kod') || y('f') || y('grup'), y('saat') && `${y('saat')} sa`, y('gun') && `${y('gun')} gün`, y('adet') && `${y('adet')} adet`, y('neden')].filter(Boolean).join(' · ');
};
const KISA: [NabizGostergesi, string, boolean][] = [['late', '', false], ['wT', 'toplam gecikme', true], ['dar', 'darboğaz', true]];

export function Cubuk(o: Ozellikler) {
  const n = o.nabiz;
  const olaylar = o.olaylar ?? [];
  const kokpit = o.kokpiteGit ?? null;
  const isik = isikOf(n); const kur = !o.plan && !kokpit ? o.planKur ?? null : null; const uyg = o.plan && !o.guncel && !kokpit ? o.bekleyenUygula ?? null : null;
  // Düğme pasifse nedeni: plan yokken çalışma açılmamıştır (Planı kur çalışmayla açılır).
  const pasifNot = o.planYaz && !kokpit && !uyg && !kur && !o.plan ? 'Çalışma açılınca' : null;
  return (
    <div className="tc-pym-sb-kap">
      <div className="tc-pym-sb" role="toolbar" aria-label="Plan çubuğu">
        <button type="button" className="tc-pym-sb-isik" data-isik={isik} aria-expanded={o.nabizAcik} disabled={!n}
          title={`Plan durumu: ${ISIK_ADI[isik]}.${n ? ' Plan nabzını ve olayları aç ya da kapat.' : ''}`} onClick={() => o.nabizAc(!o.nabizAcik)}>
          <i aria-hidden="true" /><b>Plan nabzı</b><span className="tc-pym-sb-isik-ad">{ISIK_ADI[isik]}</span>
        </button>
        {n && (
          <div className="tc-pym-sb-nb" role="group" aria-label={`Plan nabzı, ${n.donemYazi}`}>
            {KISA.map(([id, ad, ikincil]) => {
              const v = n.cur[id]; const g = NABIZ_GOSTERGELERI.find((x) => x.id === id);
              const f = n.kar && g ? nabizFarki(id, v, n.kar[id], g.kucukIyi) : { ton: '' as const, m: '' };
              // 3050 a: geciken sayısı aynen kalır; bekletilen emir gecikiyorsa yanına "N'i beklemede" yazılır.
              const etiket = id === 'late' ? `geciken${n.gecBekleyen ? `, ${String(n.gecBekleyen)}${sayiEki(n.gecBekleyen, 'i')} beklemede` : ''} · ${n.etiket}` : ad;
              const d = id === 'late' ? (v == null ? '—' : String(v)) : nabizDegeri(id, v);
              return (
                <button key={id} type="button" className="tc-pym-sb-nb-k" data-ikincil={ikincil || undefined} data-ton={f.ton || undefined} aria-expanded={o.nabizAcik}
                  title={`${etiket}: ${n.ref.ad} referansına göre ${f.m || 'aynı'}. Ölçülen dönem: ${n.donemYazi}. Plan nabzını aç.`} onClick={() => o.nabizAc(!o.nabizAcik)}>
                  <b className="tc-pym-mono">{d}</b><span>{etiket}</span>{f.ton && <small>{f.ton === 'iyi' ? '▼' : '▲'}</small>}
                </button>
              );
            })}
{!o.yuva && !o.ek && (
                        <button type="button" className="tc-pym-sb-nb-k" data-ikincil="" data-olaylar="" aria-expanded={o.nabizAcik} title="Olaylar: arıza, acil sipariş, malzeme, eksik kişi, fason. Aç ya da kapat." onClick={() => o.nabizAc(!o.nabizAcik)}>
              <Simge ad="alert" boyut="k" /><b className="tc-pym-mono">{olaylar.length}</b><span>olay</span>
            </button>
            )}
          </div>
        )}
        {o.yuva && <span className="tc-pym-sb-yuva" ref={o.yuva.satir} />}
        {o.ek && <span className="tc-pym-sb-yuva">{o.ek.satir}</span>}
        <span className="tc-pym-sb-sag">
          {!o.plan ? <Rozet ton="pasif">Plan yok</Rozet> : o.yuva || o.ek ? null : o.guncel ? <Rozet ton="tamam">Güncel</Rozet> : <Rozet ton="uyari">Veri değişti</Rozet>}
          {/* Motor sunucuda açıktır (576): düğme ancak çalışma yokken pasiftir; nedeni yalnız ipucunda kalınca kullanıcı düğmeyi bozuk sanıyor. */}
          {pasifNot !== null && <small className="tc-pym-sb-not">{pasifNot}</small>}
          {o.planYaz && <HesapSuresi className="tc-pym-sb-sure" suruyor={uyg?.suruyor === true || kur?.suruyor === true} />}
          {o.planYaz && kokpit && (!o.plan || !o.guncel) ? (
            <button type="button" className="tc-dugme tc-dugme-ikincil tc-pym-kucuk tc-pym-sb-iyi" onClick={kokpit}
              title="Plan Kokpit'te kurulur ve güncellenir; bu sayfa son plana göre okur.">
              <Simge ad="target" boyut="k" /><span>{o.plan ? "Kokpit'te planı güncelle" : "Kokpit'te planı kur"}</span>
            </button>
          ) : o.planYaz && uyg ? (
            <button type="button" className={`tc-dugme tc-pym-kucuk tc-pym-sb-iyi${o.yuva ? '' : ' tc-dugme-birincil'}`} disabled={uyg.suruyor} aria-busy={uyg.suruyor || undefined}
              title={uyg.suruyor ? KURULUYOR : `Başka sayfalarda yapılan ${String(uyg.say)} değişiklik plana işlenir. Sıra korunur, saatler yeniden hesaplanır; başlamış ve elle kilitli iş yerinde kalır.`}
              aria-label="Planı güncelle" onClick={() => { uyg.uygula(); }}>
              {uyg.suruyor ? <span className="tc-dugme-doner" aria-hidden="true" /> : <Simge ad="rotate" boyut="k" />}
              <span>{uyg.suruyor ? 'Güncelleniyor' : `Planı güncelle (${String(uyg.say)})`}</span>
            </button>
          ) : o.planYaz && (kur ? (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-sb-iyi tc-dugme-birincil" disabled={kur.suruyor} aria-busy={kur.suruyor || undefined}
              title={kur.suruyor ? KURULUYOR : 'Planı kur: motor siparişleri sıfırdan yerleştirir.'} aria-label="Planı kur" onClick={kur.kur}>
              {kur.suruyor ? <span className="tc-dugme-doner" aria-hidden="true" /> : <Simge ad="play" boyut="k" />}<span>{kur.suruyor ? 'Kuruluyor' : 'Planı kur'}</span>
            </button>
          ) : o.plan ? null : (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-sb-iyi tc-dugme-birincil" aria-disabled="true" title={`Planı kur: ${CALISMA_ACILINCA}`} aria-label="Planı kur">
              <Simge ad="play" boyut="k" /><span>Planı kur</span>
            </button>
          ))}
          {o.plan && <NasilCalisir />}
        </span>
      </div>
      {o.plan && <UfukBilgisi />}
      {n && o.nabizAcik && <NabizPaneli {...o} n={n} />}
      {o.yuva && <div className="tc-pym-sb-alt-yuva" ref={o.yuva.alt} />}
      {o.ek && o.ek.alt !== null && <div className="tc-pym-sb-alt-yuva">{o.ek.alt}</div>}
    </div>
  );
}

function NabizPaneli(o: Ozellikler & { n: NabizDurumu }) {
  const olayAc = useOlayAc(); const olaylar = o.olaylar ?? [];
  const { n } = o; const kok = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') o.nabizAc(false); };
    const dokun = (e: PointerEvent) => { const h = e.target as Element | null; if (!kok.current?.contains(h) && !h?.closest?.('.tc-pym-sb-nb-k, .tc-pym-sb-isik')) o.nabizAc(false); };
    document.addEventListener('keydown', tus); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus); document.removeEventListener('pointerdown', dokun, true); };
  }, [o]);
  return (
    <div className="tc-pym-sk-nb" ref={kok}>
      <section className="tc-pym-nb" aria-label="Plan nabzı">
        <div className="tc-pym-nb-bas">
          <button type="button" className="tc-pym-nb-baslik" aria-expanded="true" title="Kapat (Esc)" onClick={() => o.nabizAc(false)}>
            <Simge ad="down" boyut="k" /><b>Plan nabzı</b> <small className="tc-pym-mono">{n.donemYazi}</small>
          </button>
          <span className="tc-pym-nb-ozet" data-ton={n.ozet.ton || undefined}>{n.ozet.metin}</span>
          <span className="tc-pym-nb-ref">
            <span className="tc-pym-nb-ref-ad" title={n.ref.ad}>{n.surum} sürüm · {n.ref.ad}</span>
            <select className="tc-alan-kutu" aria-label="Referans" value={n.ref.tur} disabled={!o.refSec} onChange={(e) => o.refSec?.(e.target.value === 'sabit' ? 'sabit' : 'onceki')}>
              <option value="canli" disabled>Canlı plan</option>
              <option value="onceki">Önceki sürüm</option>
              <option value="sabit" disabled={!o.sabitAd}>{o.sabitAd ? `Sabit: ${o.sabitAd}` : 'Sabitlenen yok'}</option>
            </select>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" disabled={!o.sabitle} onClick={() => o.sabitle?.()} title="Şu anki planı referans al" aria-label="Şu anki planı referans al">
              <Simge ad="flag" boyut="k" />
            </button>
          </span>
        </div>
        <div className="tc-pym-nb-l">
          {NABIZ_GOSTERGELERI.map((g) => {
            const v = n.cur[g.id]; const f = n.kar ? nabizFarki(g.id, v, n.kar[g.id], g.kucukIyi) : { ton: '' as const, m: '' };
            const egri = n.egri[g.id]; const e = egri ? egriNoktalari(egri) : null;
            const ici = (
              <>
                <span className="tc-pym-nb-ad"><Simge ad={g.simge} boyut="k" />{g.ad}</span>
                <b className="tc-pym-nb-d tc-pym-mono">{nabizDegeri(g.id, v)}</b>
                {e && <svg className="tc-pym-nb-egri" viewBox="0 0 64 18" aria-hidden="true"><polyline points={e.noktalar} /><circle cx="64" cy={e.son} r="2.2" /></svg>}
                <small className="tc-pym-nb-f">{n.kar ? <><b>{f.m}</b> <span>referansa göre</span></> : <span>referans yok</span>}</small>
              </>
            );
            // Gecikme tahtanın kendisine götürür; ötekilerin sayfası yeni ekranda yok (459/5 a).
            return g.sayfa === 'tahta'
              ? <button key={g.id} type="button" className="tc-pym-nb-k" data-ton={f.ton || undefined} title={`${g.ad}: ${g.ipucu} Dokununca ilgili sayfa açılır.`} onClick={() => { o.nabizAc(false); o.ozeteGit(); }}>{ici}</button>
              : <button key={g.id} type="button" className="tc-pym-nb-k" aria-disabled="true" data-ton={f.ton || undefined} title={`${g.ad}: ${g.ipucu} ${YOK_NOTU}`}>{ici}</button>;
          })}
        </div>
        <div className="tc-pym-nb-olay">
          <b><Simge ad="alert" boyut="k" />Olaylar ({olaylar.length})</b>
          {olaylar.length === 0 ? <span className="tc-pym-nb-olay-bos">Kayıtlı olay yok.</span> : (
            <ul>
              {olaylar.slice(-5).reverse().map((x, i) => (
                <li key={i}><b>{OLAY_ADI[String(x.tip)] ?? 'Olay'}</b><span>{olayOzeti(x)}</span></li>
              ))}
            </ul>
          )}
          {o.planYaz && o.plan && (
            <button type="button" className="tc-dugme tc-pym-kucuk" aria-disabled={olayAc ? undefined : 'true'} title={`Olay ekle: acil sipariş, arıza, malzeme gecikmesi.${olayAc ? '' : ` ${OLAY_YOK}`}`}
              onClick={olayAc ? () => { olayAc('ariza'); } : undefined}><Simge ad="plus" boyut="k" />Olay ekle</button>
          )}
        </div>
      </section>
    </div>
  );
}

// Takvim kendiliğinden uzayınca (3501 a, 3506) sığmayan adımlar plandan düşmüyor; gecikme sayıları bir anda artıyor ve kişi bunu
// "plan bozuldu" diye okuyor. Tek seferlik bilgi: kişi kapatınca bu tarayıcıda bir daha çıkmaz; depo kapalıysa her açılışta çıkar.
export const UFUK_BILGISI = 'Planlama süresine sığmayan adımlar artık plandan düşmüyor, gerçek tarihleriyle yerleşiyor; gecikme sayıları bu yüzden arttı.';
export const UFUK_BILGISI_ANAHTARI = 'tc-pym-bilgi-takvim-uzar';
function UfukBilgisi() {
  const [kapali, setKapali] = useState(() => { try { return localStorage.getItem(UFUK_BILGISI_ANAHTARI) !== null; } catch { return false; } });
  if (kapali) return null;
  const kapat = () => { setKapali(true); try { localStorage.setItem(UFUK_BILGISI_ANAHTARI, '1'); } catch { /* depo kapalı: yalnız bu açılışta kapanır */ } };
  return (
    <p className="tc-pym-sb-bilgi" role="note">
      <Simge ad="clock" boyut="k" /><span>{UFUK_BILGISI}</span>
      <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={kapat}>Anladım</button>
    </p>
  );
}

// Plan düğmelerinin ne yaptığı (3504 b): kişi düğmeye basmadan neyin yerinde kalıp neyin oynadığını okur.
const NASIL: [string, string][] = [
  ['Bir iş uzarsa ya da adet artarsa', 'Planı güncelle deyince arkasındaki işler aynı sırayla ileri kayar.'],
  ['Bir iş erken biterse', 'Bitiş girildikten sonra Planı güncelle ile arkadakiler aynı sırayla öne gelir. Önümüzdeki 24 saatin işleri yerinde tutulur (plan ayarına göre 72 saate kadar).'],
  ['Başladı, yerinde kalır', 'Başlamış iş tezgâhından ve saatinden oynamaz; yalnız bitişi kalan süreye göre değişir.'],
  ['Elle taşıdım ya da yerleştirdim', 'O iş elle kilitlenir; plan onu bir daha oynatmaz.'],
  ['Sıra da değişsin', 'Plan menüsündeki Baştan kur sırayı da yeniden dizer. Başlamış ve elle kilitli işler kalır.'],
];
function NasilCalisir() {
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!acik) return undefined;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    const dokun = (e: PointerEvent) => { if (!kok.current?.contains(e.target as Node | null)) setAcik(false); };
    document.addEventListener('keydown', tus); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus); document.removeEventListener('pointerdown', dokun, true); };
  }, [acik]);
  return (
    <span className="tc-pym-sb-nasil" ref={kok}>
      <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Plan nasıl çalışır" aria-expanded={acik} aria-controls="tc-pym-sb-nasil-kutu"
        title="Plan nasıl çalışır" onClick={() => { setAcik(!acik); }}>
        <Simge ad="help" boyut="k" />
      </button>
      {acik && (
        <section id="tc-pym-sb-nasil-kutu" className="tc-pym-sb-nasil-kutu" aria-label="Plan nasıl çalışır">
          <b>Plan nasıl çalışır</b>
          <dl>{NASIL.map(([s, c]) => <div key={s}><dt>{s}</dt><dd>{c}</dd></div>)}</dl>
        </section>
      )}
    </span>
  );
}
