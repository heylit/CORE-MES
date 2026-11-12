import { useEffect, useRef } from 'react';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { nabizFarki, sayiEki, type NabizGostergesi } from '../kurallar.ts';
import { KURULUYOR, type BekleyenUygulayici, type PlanKurucu } from '../coz.ts';
import { CALISMA_ACILINCA, PLANDA_IYILESTIR, YOK_NOTU } from '../ortak.tsx';
import { hamleYapisi, type Hamleci } from '../hamle/hamle.ts';
import { OLAY_YOK, useOlayAc } from '../../gorunumler.ts';
import { egriNoktalari, NABIZ_GOSTERGELERI, nabizDegeri, type NabizDurumu } from './nabiz.ts';

// Plan çubuğu (zk-kabuk.betik sdCubuk, zr-agirlik sdNabiz): ekranlar, üç nabız sayısı, durum ve iki eylem. Arama (Ctrl K paleti) ve
// kullanıcı menüsü eski çerçevenindir (208 a). Nabız sayısı plan nabzını açar.
interface Ozellikler {
  plan: boolean; guncel: boolean; planYaz: boolean;
  nabiz: NabizDurumu | null; nabizAcik: boolean; nabizAc: (ac: boolean) => void;
  // Hangi ekran düğmesi seçili: motor "plan", atölye "studyo", Veri ve kısıtlar "veri", öteki sayfalarda hiçbiri (eski pm-sb-ekran). Plan düğmesi
  // motorun tahtasına gider; `veri` ve `gecmis` verilmezse o düğme pasiftir (iskeletsiz çizim).
  etkin: 'plan' | 'studyo' | 'veri' | 'gecmis' | null; planaGit: (() => void) | null; veri?: (() => void) | null; gecmis?: (() => void) | null;
  studyo: () => void; ozeteGit: () => void;
  refSec: ((v: 'onceki' | 'sabit') => void) | null; sabitle: (() => void) | null; sabitAd: string | null;
  // Planı kur sunucudaki motorla (576); verilmezse ya da plan varken (iyileştirme, 579 b) düğme pasif.
  planKur?: PlanKurucu | null;
  // Plan veriden eskiyse bekleyen değişiklikleri uygular (1786 PLN-2); verilmezse düğme eskisi gibi pasif.
  bekleyenUygula?: BekleyenUygulayici | null;
  // Plan güncelken kayıtlı planı iyileştirme araması, önizlemeli (2129-1 b); verilmezse düğme pasif.
  hamle?: Hamleci | null;
  // Stüdyo'da Olay ekle ve iyileştirme tahtanın kendi araç çubuğunda var; bantta tekrarlanmaz. Plan nabzı her ekranda kalır.
  studyoda?: boolean;
}

const KISA: [NabizGostergesi, string, boolean][] = [['late', '', false], ['wT', 'toplam gecikme', true], ['dar', 'darboğaz', true]];

export function Cubuk(o: Ozellikler) {
  const olayAc = useOlayAc();
  const n = o.nabiz; const kur = !o.plan ? o.planKur ?? null : null; const uyg = o.plan && !o.guncel ? o.bekleyenUygula ?? null : null;
  // Düğme pasifse nedeni: plan yokken çalışma açılmamıştır (Planı kur çalışmayla açılır); plan varken iyileştirme Plan sayfasındadır.
  const pasif = o.planYaz && !uyg && !kur && !(o.plan && (o.hamle || o.planaGit));
  const pasifNeden = o.plan ? PLANDA_IYILESTIR : CALISMA_ACILINCA;
  const pasifNot = pasif ? (o.plan ? 'Plan sayfasında' : 'Çalışma açılınca') : null;
  return (
    <div className="tc-pym-sb-kap">
      <div className="tc-pym-sb" role="toolbar" aria-label="Plan çubuğu">
        <nav className="tc-pym-sb-ekran" aria-label="Ekranlar">
          {/* Plan ekranının sayfalarında (Bugünün kararları, Nasıl hesaplandı) Plan seçilidir ve tahtaya döner; tahtada planaGit verilmez. */}
          <button type="button" aria-current={o.etkin === 'plan' ? 'page' : undefined} onClick={o.planaGit ?? undefined} title={o.planaGit ? 'Motor: planı anla' : undefined}><Simge ad="gantt" boyut="k" /><span>Motor</span></button>
          <button type="button" aria-current={o.etkin === 'studyo' ? 'page' : undefined} onClick={o.etkin === 'studyo' ? undefined : o.studyo} title="Stüdyo: planı düzenle ve yayınla"><Simge ad="layers" boyut="k" /><span>Stüdyo</span></button>
          {o.etkin === 'veri' || o.veri
            ? <button type="button" aria-current={o.etkin === 'veri' ? 'page' : undefined} onClick={o.etkin === 'veri' ? undefined : o.veri ?? undefined} title="Veri ve kısıtlar"><Simge ad="layers" boyut="k" /><span>Veri</span></button>
            : <button type="button" aria-disabled="true" title={`Veri: ${YOK_NOTU}`}><Simge ad="layers" boyut="k" /><span>Veri</span></button>}
          {o.etkin === 'gecmis' || o.gecmis
            ? <button type="button" aria-current={o.etkin === 'gecmis' ? 'page' : undefined} onClick={o.etkin === 'gecmis' ? undefined : o.gecmis ?? undefined} title="Geçmiş"><Simge ad="book" boyut="k" /><span>Geçmiş</span></button>
            : <button type="button" aria-disabled="true" title={`Geçmiş: ${YOK_NOTU}`}><Simge ad="book" boyut="k" /><span>Geçmiş</span></button>}
        </nav>
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
          </div>
        )}
        <span className="tc-pym-sb-sag">
          {!o.plan ? <Rozet ton="pasif">Plan yok</Rozet> : o.guncel ? <Rozet ton="tamam">Güncel</Rozet> : <Rozet ton="uyari">Veri değişti</Rozet>}
          {o.planYaz && o.plan && !o.studyoda && (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-sb-iyi" data-olay="" aria-disabled={olayAc ? undefined : 'true'}
              title={`Olay ekle: acil sipariş, arıza, malzeme gecikmesi.${olayAc ? '' : ` ${OLAY_YOK}`}`} aria-label="Olay ekle" onClick={olayAc ? () => { olayAc('ariza'); } : undefined}>
              <Simge ad="alert" boyut="k" /><span>Olay ekle</span>
            </button>
          )}
          {/* Motor sunucuda açıktır (576): düğme ancak çalışma yokken pasiftir; nedeni yalnız ipucunda kalınca kullanıcı düğmeyi bozuk sanıyor. */}
          {pasifNot !== null && !o.studyoda && <small className="tc-pym-sb-not">{pasifNot}</small>}
          {o.planYaz && uyg ? (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-sb-iyi tc-dugme-birincil" disabled={uyg.suruyor} aria-busy={uyg.suruyor || undefined}
              title={uyg.suruyor ? KURULUYOR : `Değişiklikleri uygula: ${String(uyg.say)} bekleyen değişikliğin etkilediği işler yeniden dizilir; öteki işler yerinde kalır.`}
              aria-label="Değişiklikleri uygula" onClick={() => { uyg.uygula(); }}>
              <Simge ad="play" boyut="k" /><span>{uyg.suruyor ? 'Uygulanıyor' : `Değişiklikleri uygula (${String(uyg.say)})`}</span>
            </button>
          ) : o.planYaz && (kur ? (
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-sb-iyi tc-dugme-birincil" disabled={kur.suruyor} aria-busy={kur.suruyor || undefined}
              title={kur.suruyor ? KURULUYOR : 'Planı kur: motor siparişleri sıfırdan yerleştirir.'} aria-label="Planı kur" onClick={kur.kur}>
              <Simge ad="play" boyut="k" /><span>{kur.suruyor ? 'Kuruluyor' : 'Planı kur'}</span>
            </button>
          ) : o.studyoda ? null : o.plan && o.hamle ? (
            <IyilestirDugmesi h={o.hamle} />
          ) : o.plan && o.planaGit ? (
            <button type="button" className={`tc-dugme tc-pym-kucuk tc-pym-sb-iyi${o.guncel ? '' : ' tc-dugme-birincil'}`}
              title="Plan iyileştirme ara: Plan sayfasında motor daha iyi bir plan arar; bulursa önizlersiniz." aria-label="Plan iyileştirme ara" onClick={o.planaGit}>
              <Simge ad="play" boyut="k" /><IyiAdi />
            </button>
          ) : (
            <button type="button" className={`tc-dugme tc-pym-kucuk tc-pym-sb-iyi${o.plan && o.guncel ? '' : ' tc-dugme-birincil'}`} aria-disabled="true"
              title={`${o.plan ? 'Plan iyileştirme ara' : 'Planı kur'}: ${pasifNeden}`} aria-label={o.plan ? 'Plan iyileştirme ara' : 'Planı kur'}>
              <Simge ad="play" boyut="k" />{o.plan ? <IyiAdi /> : <span>Planı kur</span>}
            </button>
          ))}
        </span>
      </div>
      {n && o.nabizAcik && <NabizPaneli {...o} n={n} />}
    </div>
  );
}

// Çubuk dar kaldığında (dört ekran adı yazılıyken) uzun ad sağ kenardan taşar; orada kısa ad görünür, düğmenin adı (aria-label) aynı kalır.
function IyiAdi() {
  return <span><span className="tc-pym-sb-uzun">Plan iyileştirme ara</span><span className="tc-pym-sb-kisa">İyileştir</span></span>;
}

function IyilestirDugmesi({ h }: { h: Hamleci }) {
  const y = hamleYapisi(h, (x) => { x.iyilestir(); });
  return (
    <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-sb-iyi" aria-disabled={y.yap ? undefined : 'true'} aria-busy={h.suruyor || undefined}
      title={y.yap ? 'Plan iyileştirme ara: motor daha iyi bir plan arar; bulursa önizlersiniz, siz uygularsınız.' : `Plan iyileştirme ara: ${y.not}`}
      aria-label="Plan iyileştirme ara" onClick={y.yap ?? undefined}>
      <Simge ad="play" boyut="k" />{h.suruyor ? <span>Aranıyor</span> : <IyiAdi />}
    </button>
  );
}
function NabizPaneli(o: Ozellikler & { n: NabizDurumu }) {
  const { n } = o; const kok = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') o.nabizAc(false); };
    const dokun = (e: PointerEvent) => { const h = e.target as Element | null; if (!kok.current?.contains(h) && !h?.closest?.('.tc-pym-sb-nb-k')) o.nabizAc(false); };
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
      </section>
    </div>
  );
}
