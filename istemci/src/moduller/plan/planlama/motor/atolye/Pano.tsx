import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AtolyeOlayi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { planGuncel } from '../../durum.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { bitenler, derle, girdiKur, malzemeHazir, plandanBitenler, saatYazi, simdiSaati, sorunlar, type Derleme, type OkunanPlan } from '../kurallar.ts';
import type { KbPanel } from '../Duzenle.tsx';
import { Yapilacaklar } from '../Yapilacaklar.tsx';
import type { AtolyeSekmesi } from './Atolye.tsx';
import { AtolyeEkrani } from './AtolyeEkrani.tsx';
import { Brif, BRIF_SERIDI, brifOgeleri, Bugun } from './Bugun.tsx';
import { useAtolyeKomutlari, useOtomatikUygula } from './gonder.ts';
import { Izgara } from './Izgara.tsx';
import { KartKatmani, type AcikKart, type Ankraj } from './Kartlar.tsx';
import {
  emirNoOkuyucu, gecikenIpucu, gecikenSay, kilitOzeti, secKacis, gunAnahtari, gunYeni, ilkOlcek, OLCEKLER, sipBilgi, siparisler, suzKoy, suzSayisi, type AtolyeOlcegi, type CanliFark, type EmirNo, type SiparisBilgisi, type Suzgec,
} from './kurallar.ts';
import { Ray } from './Ray.tsx';
import { HamleOnizlemesi } from '../hamle/Onizleme.tsx';
import { HamleBaglami, hamleYapisi, useHamle } from '../hamle/hamle.ts';
import { useAn } from '../saat.ts';

// Tezgâh panosu (zz36 TP): üst çubuk, sipariş rayı, tezgâh çizelgesi, Bugün ve kartlar. Plan sunucuda çözülür (357 b); motor hamleleri (iyileştir,
// öne al, kuyruk sırası) sunucuda aranır, önizlenir, kişi uygular (2129-1 b). Düzenle ve Yapılacaklar tahtadakiyle aynıdır (2531 a); taşı, olay
// ve ek mesai sunucu komutudur (1982 a), ardından plan kendiliğinden uygulanır (2053-1 a). Kilit, donuk bölge, elle sıra ve brifing tercihi
// çalışmaya yalnız `komut.degistir`le yazılır (221 c); seçim iskeletin ortak seçimidir. Denemeler Geçmiş > Senaryolar'dadır.

export interface Ortam {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; now: number; donuk: number; hazir: Record<string, number>;
  bilgi: Map<string, SiparisBilgisi>; liste: SiparisBilgisi[];
  // Sipariş kimliğinin ekrandaki adı: iş emri no.
  emirNo: EmirNo;
  suz: Suzgec | null; suzSec: (f: Suzgec | null) => void;
  secJob: string | null; secOp: string | null;
  yaz: boolean; o: PlanlamaEkranOzellikleri;
  opSec: (id: string, a?: Ankraj) => void; sipSec: (j: string) => void; sipGoster: (j: string) => void; opGit: (id: string) => void;
  kartAc: (k: AcikKart, a?: Ankraj) => void; kartKapat: () => void;
  olcek: AtolyeOlcegi; olcekSec: (z: AtolyeOlcegi) => void; sekSec: (s: AtolyeSekmesi) => void;
  bugunAc: (x: boolean) => void; brifAc: () => void; atolyeAc: () => void;
  sen: SenaryolarCevabi | null; senYaz: (s: SenaryolarCevabi) => void;
  // 1982 a: sunucu komutları; yazamayan için null. `isleniyor` komut sürerken ikinci komutu engeller.
  tasi: ((id: string, m: string, S: number) => void) | null; olayEkle: ((olay: AtolyeOlayi) => Promise<boolean>) | null; isleniyor: boolean;
  ekMesai: ((m: string, gun: number, vardiya: string) => void) | null;
}

interface Ozellikler {
  o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan; sekSec: (s: AtolyeSekmesi) => void; onayda: number;
  // Canlı planla fark (sunucudan; okunmadıysa null).
  cf: CanliFark | null;
  sen: SenaryolarCevabi | null; senYaz: (s: SenaryolarCevabi) => void;
}

// Kabı dikey kaydıran en yakın ata kutu (sayfanın kaydırıcısı); yoksa null (pencere kayar).
export function kaydirici(k: HTMLElement): HTMLElement | null {
  for (let e = k.parentElement; e; e = e.parentElement) {
    const y = getComputedStyle(e).overflowY;
    if ((y === 'auto' || y === 'scroll') && e.scrollHeight > e.clientHeight) return e;
  }
  return null;
}

export function Pano({ o, c, p, cf: fark, sekSec, onayda, sen, senYaz }: Ozellikler) {
  const { komut, yetki, secim, sec } = o;
  const emirler = o.depo.durum?.emirler ?? null;
  const an = useAn();
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p), an)), [c, p, emirler, an]);
  const hazir = useMemo(() => malzemeHazir(cx), [cx]);
  const liste = useMemo(() => siparisler(c, p, cx, hazir), [c, p, cx, hazir]);
  const bilgi = useMemo(() => new Map(liste.map((s) => [s.id, s])), [liste]);
  const emirNo = useMemo(() => emirNoOkuyucu(o.depo.receteRotaKaydi), [o.depo.receteRotaKaydi]);
  const now = simdiSaati(c, an);
  const donuk = Number(c.w.dondurma) || 0;
  const [olcek, setOlcek] = useState<AtolyeOlcegi>(() => ilkOlcek(typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [suz, suzSec] = useState<Suzgec | null>(null);
  const [rayAcik, setRayAcik] = useState(false);
  const [bugunAcik, setBugunAcik] = useState(false);
  const bugun = gunAnahtari(Date.now());
  // Brifing katlı başlar (2729 b); günün ilk açılışında üst çubuktaki düğmesi vurgulanır, açılınca o gün sönük kalır. Gün bu tarayıcıda
  // tutulur: ortak çalışmaya yazılsa ilk açan herkesin vurgusunu söndürürdü.
  const [brif, setBrif] = useState(false);
  const [brifYeni, setBrifYeni] = useState(() => brifGunu() !== bugun);
  useEffect(() => { if (brif) { brifGunuYaz(bugun); setBrifYeni(false); } }, [brif, bugun]);
  const [kart, setKart] = useState<{ k: AcikKart; a: Ankraj | null } | null>(null);
  const [parla, setParla] = useState<string | null>(null);
  const [atolye, setAtolye] = useState(false);
  // Düzenle, Böl, tezgâh sırası ve kısayollar ile Yapılacaklar aynı köşede, aynı anda tek pencere (Tahta ile aynı).
  const [ypAcik, setYpAcik] = useState(false);
  const [pan, setPan] = useState<KbPanel | null>(null);
  const ypAc = useCallback((x: boolean) => { setYpAcik(x); if (x) { setPan(null); setKart(null); } }, []);
  const panAc = useCallback((x: KbPanel | null) => { setPan(x); if (x) { setYpAcik(false); setKart(null); } }, []);
  const kap = useRef<HTMLDivElement | null>(null);
  const pano = useRef<HTMLDivElement | null>(null);
  const yaz = komut !== null && yetki.planYaz;
  const { bildir } = useBildirim();
  // Taşı, olay ve ek mesai sunucuda yazılır (1982 a); cevaptan sonra sayfa çalışmayı yeniden okur ve plan kendiliğinden uygulanır (2053-1 a).
  const uyar = useCallback((ileti: string) => { bildir('hata', ileti); }, [bildir]);
  useOtomatikUygula(o, uyar);
  const { tasi, olayEkle, ekMesai, isleniyor } = useAtolyeKomutlari(o, c);
  // 2129-1 b: iyileştirme ara; sonuç önizlenir, kişi uygular.
  const hamle = useHamle(o, uyar);
  const iyiY = hamleYapisi(hamle, (h) => { h.iyilestir(); });
  const guncel = planGuncel(c);
  const sor = useMemo(() => sorunlar(c, p, cx, guncel), [c, p, cx, guncel]);
  const { altSec } = o;
  const senaryolar = altSec ? () => altSec({ ekran: 'gecmis', bolum: 'senaryolar' }) : null;
  const veriAc = altSec ? (bolum: string) => altSec({ ekran: 'veri', bolum }) : null;
  const studyo = useCallback(() => o.git('studio'), [o]);

  // Seçili adımın siparişi seçili sipariş sayılır.
  const secOp = secim.adim && p.ops[secim.adim] ? secim.adim : null;
  const secJob = secOp ? p.ops[secOp]?.job ?? null : secim.siparis && cx.jobs[secim.siparis] ? secim.siparis : null;

  const kartAc = useCallback((k: AcikKart, a?: Ankraj) => setKart({ k, a: a ?? null }), []);
  const kartKapat = useCallback(() => setKart(null), []);
  const opSec = useCallback((id: string, a?: Ankraj) => { sec({ adim: id, siparis: null, tezgah: null }); setKart({ k: { tur: 'op', id }, a: a ?? null }); }, [sec]);
  const sipSec = useCallback((j: string) => { sec({ siparis: secJob === j ? null : j, adim: null, tezgah: null }); }, [sec, secJob]);
  // Bugün, brifing ve kartlardan siparişe gidiş: ray açılır, sipariş seçilir.
  const sipGoster = useCallback((j: string) => { sec({ siparis: j, adim: null, tezgah: null }); setKart(null); setRayAcik(true); }, [sec]);
  // Akıştaki adım çizelgede gösterilir: pano ona kayar, çubuk bir an parlar.
  const opGit = useCallback((id: string) => {
    const r = p.ops[id]; if (!r) return;
    sec({ adim: id, siparis: null, tezgah: null }); setRayAcik(false); setParla(id);
    requestAnimationFrame(() => {
      const pn = pano.current; const el = pn?.querySelector<HTMLElement>(`[data-id="${secKacis(id)}"]`); if (!pn || !el) return;
      const sat = el.closest<HTMLElement>('[data-m]');
      const az = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      pn.scrollTo?.({ left: Math.max(0, el.offsetLeft - pn.clientWidth / 3), top: Math.max(0, (sat?.offsetTop ?? 0) - pn.clientHeight / 3), behavior: az ? 'auto' : 'smooth' });
    });
  }, [p, sec]);
  useEffect(() => { if (!parla) return undefined; const z = setTimeout(() => setParla(null), 1600); return () => clearTimeout(z); }, [parla]);
  // Başka ekrandan gelen istek (zz36 istekIsle): tezgâhta süzgeç ve tezgâh günlüğü, siparişte ray ve sipariş, olayda olay formu (yazamayana
  // kart açılmaz); işlenince adresten silinir.
  const istek = useRef({ i: o.istek ?? null, c, cx, sipGoster, studyoAc: o.studyoAc });
  istek.current = { i: o.istek ?? null, c, cx, sipGoster, studyoAc: o.studyoAc };
  const istekAnahtari = o.istek ? `${o.istek.tur}|${o.istek.v}` : null;
  useEffect(() => {
    const x = istek.current; const i = x.i; if (!i) return;
    if (i.tur === 'tez' && x.cx.M[i.v]) { suzSec(suzKoy(x.c.D, null, 'm', i.v)); setKart({ k: { tur: 'gunluk', m: i.v }, a: null }); }
    else if (i.tur === 'sip' && x.cx.jobs[i.v]) x.sipGoster(i.v);
    else if (i.tur === 'olay') setKart({ k: { tur: 'olay', on: i.v }, a: null });
    x.studyoAc?.(null);
  }, [istekAnahtari]);
  const brifKapat = useCallback(() => setBrif(false), []);
  // Gün başı ve bugünün özeti çalışmaya sessiz yazılır (eski gunBasla, gunKaydet; iz, bildirim ve geri alma yok).
  useEffect(() => {
    if (!yaz) return;
    const g = gunYeni(c, p, bugun);
    if (g) komut.degistir('Gün özeti', (t) => { (t as Record<string, unknown>).tpGun = g; }, { sessiz: true });
  }, [yaz, komut, c, p, bugun]);

  // Pano yüksekliği kaydırma alanının görünen boyudur: üstteki şeritler kaydırınca gider, pano ekranı doldurur (2693 a).
  // Altta telefonda alt menü düşülür.
  useLayoutEffect(() => {
    const olc = () => {
      const k = kap.current; if (!k) return;
      const alt = document.querySelector<HTMLElement>('.tc-kabuk-alt');
      const altH = alt && alt.offsetParent ? alt.offsetHeight : 0;
      // Kaydırıcının alt iç boşluğu düşülür: sonuna kaydırınca pano üst çubuğu kesilmeden tam görünür.
      const e = kaydirici(k);
      const ust = e ? Math.max(0, e.getBoundingClientRect().top) : 0;
      const son = e ? Math.min(e.getBoundingClientRect().top + e.clientHeight - (parseFloat(getComputedStyle(e).paddingBottom) || 0), window.innerHeight - altH)
        : window.innerHeight - altH - 8;
      k.style.setProperty('--tc-pym-tp-yuk', `${Math.max(320, son - ust)}px`);
    };
    olc(); window.addEventListener('resize', olc);
    return () => window.removeEventListener('resize', olc);
  }, []);

  // Düzenle ve Yapılacaklar köşesi Bugün şeridinin hemen üstünde durur; şerit açılınca köşe de yükselir (şeridin satır düğmelerini örtmez).
  useLayoutEffect(() => {
    const k = kap.current; const b = k?.querySelector<HTMLElement>('.tc-pym-tp-bugun');
    if (!k || !b || typeof ResizeObserver === 'undefined') return undefined;
    const o = new ResizeObserver(() => { k.style.setProperty('--tc-pym-tp-bugun-yuk', `${b.offsetHeight}px`); });
    o.observe(b);
    return () => o.disconnect();
  }, []);

  // Klavye: Esc kartı ya da seçimi kapatır, 1-5 ölçek, / arama, Ctrl+Z geri al, Ctrl+Shift+Z yinele, E Düzenle, Y Yapılacaklar. Yazı alanında
  // çalışmaz. Düzenle açıkken rakamlar ve oklar menünündür (Yapilacaklar yakalar).
  const tuslar = useRef({ kart, brif, secJob, secOp, sec, komut, yaz, ypAcik, pan, panAc, ypAc });
  tuslar.current = { kart, brif, secJob, secOp, sec, komut, yaz, ypAcik, pan, panAc, ypAc };
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null; const yazi = !!t?.closest?.('input, textarea, select, [contenteditable]');
      const x = tuslar.current;
      if (e.key === 'Escape') {
        if (x.kart) { e.preventDefault(); setKart(null); return; }
        if (x.brif) { e.preventDefault(); setBrif(false); return; }
        if (!yazi && (x.secJob || x.secOp)) { e.preventDefault(); x.sec({ siparis: null, adim: null, tezgah: null }); }
        return;
      }
      if (yazi || e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase('tr-TR') === 'z') {
        if (!e.shiftKey && x.yaz && x.komut?.geriAlinabilir()) { e.preventDefault(); x.komut.geriAl(); }
        if (e.shiftKey && x.yaz && x.komut?.yinelenebilir?.()) { e.preventDefault(); x.komut.yinele?.(); }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const h = e.key.toLocaleLowerCase('tr-TR');
      if (x.yaz && h === 'e') { e.preventDefault(); x.panAc(x.pan === 'dz' ? null : 'dz'); return; }
      if (x.yaz && h === 'y') { e.preventDefault(); x.ypAc(!x.ypAcik); return; }
      const i = '12345'.indexOf(e.key);
      if (i >= 0 && e.key.length === 1) { e.preventDefault(); setOlcek(OLCEKLER[i]?.[0] ?? 72); return; }
      if (e.key === '/') { const a = kap.current?.querySelector<HTMLInputElement>('input[type="search"]'); if (a) { e.preventDefault(); setRayAcik(true); a.focus(); } }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);

  const ort: Ortam = {
    c, p, cx, now, donuk, hazir, bilgi, liste, emirNo, suz, suzSec, secJob, secOp, yaz, o, opSec, sipSec, sipGoster, opGit, kartAc, kartKapat,
    olcek, olcekSec: setOlcek, sekSec, bugunAc: setBugunAcik, brifAc: () => { setBrif(true); setKart(null); }, atolyeAc: () => { setAtolye(true); setKart(null); }, sen, senYaz,
    tasi, olayEkle, isleniyor, ekMesai,
  };
  const brifL = useMemo(() => brifOgeleri({ c, p, cx, now, liste, emirNo }), [c, p, cx, now, liste, emirNo]);
  const ozet = p.ozet;
  const farkli = !fark || fark.farkli || !planGuncel(c);
  const ns = suzSayisi(suz);
  const geriVar = yaz && !!komut?.geriAlinabilir();
  const ust = (
    <header className="tc-pym-tp-ust">
      <button type="button" className="tc-dugme tc-pym-hayalet tc-pym-tp-dar" aria-label="Siparişler" aria-expanded={rayAcik} onClick={() => setRayAcik((x) => !x)}>
        <Simge ad="list" boyut="k" /><span data-metin="">{`Siparişler · ${liste.length}`}</span>
      </button>
      {!fark ? (
        <span className="tc-pym-tp-durum" title="Canlı planla fark okunuyor"><Simge ad="edit" boyut="k" />Çalışma</span>
      ) : !fark.var ? (
        <span className="tc-pym-tp-durum" title="Henüz canlıya alınmış plan yok"><Simge ad="edit" boyut="k" />Çalışma<span data-ikincil=""> · canlı yok</span></span>
      ) : fark.say ? (
        <span className="tc-pym-tp-durum" title="Canlı plandan farklı"><Simge ad="edit" boyut="k" />{`Taslak · ${fark.say}`}<span data-ikincil=""> değişiklik</span></span>
      ) : (
        <span className="tc-pym-tp-durum" data-ton="ayni" title="Çalışma planı canlı planla aynı"><Simge ad="check" boyut="k" />Canlı planla aynı</span>
      )}
      {onayda > 0 && (
        <button type="button" className="tc-pym-tp-durum" data-ton="onayda" title="Onay sekmesini aç" onClick={() => sekSec('onay')}><Simge ad="clock" boyut="k" />{`${onayda} onayda`}</button>
      )}
      <div className="tc-pym-tp-olc">
        <span title={gecikenIpucu(liste)}><b data-ton={gecikenSay(liste) ? 'kotu' : 'iyi'}>{gecikenSay(liste)}</b> <span data-ad="">geciken</span></span>
        <span title="Öncelik ağırlıklı gecikme: geciken saat, öncelik 1 için 4, öncelik 2 için 2 katıyla sayılır."><b>{saatYazi(ozet.wT)}</b> <span data-ad="">ağırlıklı gecikme</span></span>
        {yetki.maliyetOku && <span data-kar="" title="Kâr kayıtlı planda yok"><b>—</b> <span data-ad="">kâr</span></span>}
        {brifL.length > 0 && (
          <button type="button" className="tc-pym-tp-brif-ac" aria-expanded={brif} aria-controls={brif ? BRIF_SERIDI : undefined} data-yeni={brifYeni && !brif ? '' : undefined}
            title={brifL.map((x) => x.ana).join(' · ')} onClick={() => setBrif((x) => !x)}>
            <Simge ad="sun" boyut="k" /><b>{brifL.length}</b> <span data-ad="">brifing</span><Simge ad={brif ? 'up' : 'down'} boyut="k" />
          </button>
        )}
      </div>
      <span className="tc-pym-tp-bosluk" />
      <div className="tc-pym-tp-grup" role="group" aria-label="Ölçek">
        {OLCEKLER.map(([z, a]) => <button key={z} type="button" aria-pressed={olcek === z} onClick={() => setOlcek(z)}>{a}</button>)}
      </div>
      <button type="button" className="tc-dugme tc-pym-hayalet" aria-label={`Kilit ve dondurma: ${kilitOzeti(c, donuk)}`} title={`Kilit ve dondurma: ${kilitOzeti(c, donuk)}`}
        onClick={(e) => kartAc({ tur: 'dondurma' }, ankraj(e))}>
        <Simge ad="lock" boyut="k" /><span data-ikincil="" data-metin="">{kilitOzeti(c, donuk)}</span>
      </button>
      <button type="button" className="tc-dugme tc-pym-hayalet" data-suz={ns ? '' : undefined} aria-label="Süz: tezgâh, istasyon, üretim emri" title="Süz"
        onClick={(e) => kartAc({ tur: 'suz' }, ankraj(e))}>
        <Simge ad="eye" boyut="k" />{ns > 0 && <span className="tc-pym-tp-tsay">{ns}</span>}
      </button>
      <div className="tc-pym-tp-grup" data-geri="" role="group" aria-label="Geri al">
        <button type="button" aria-label="Geri al" title="Geri al (Ctrl+Z)" aria-disabled={!geriVar} onClick={() => { if (geriVar) komut?.geriAl(); }}><Simge ad="back" boyut="k" /></button>
        <button type="button" aria-label="Karar geçmişi ve taslağı sıfırla" title="Karar geçmişi, taslağı sıfırla" onClick={(e) => kartAc({ tur: 'geri' }, ankraj(e))}><Simge ad="down" boyut="k" /></button>
      </div>
      <button type="button" className="tc-dugme" aria-disabled={senaryolar ? undefined : 'true'} aria-label="Şu olursa: denemeler"
        title="Şu olursa: çalışma planını bozmadan senaryo kur, karşılaştır (Geçmiş > Senaryolar)" onClick={senaryolar ?? undefined}>
        <Simge ad="lab" boyut="k" /><span data-ikincil="" data-metin="">Dene</span>
      </button>
      <button type="button" className="tc-dugme" aria-disabled={!olayEkle} aria-label="Olay: arıza, acil sipariş, malzeme, personel ya da fason"
        title={olayEkle ? 'Olay: arıza, acil sipariş, malzeme, personel ya da fason' : 'Olay eklemek plan yazma yetkisi ister.'} onClick={(e) => { if (olayEkle) kartAc({ tur: 'olay' }, ankraj(e)); }}>
        <Simge ad="plus" boyut="k" /><span data-ikincil="" data-metin="">Olay</span>
      </button>
      <button type="button" className="tc-dugme" aria-disabled={iyiY.yap ? undefined : 'true'} aria-busy={hamle?.suruyor || undefined} aria-label="İyileştirme ara"
        title={iyiY.yap ? 'Motor daha iyi bir plan arar; bulursa önizlersiniz.' : `İyileştirme ara: ${iyiY.not}`} onClick={iyiY.yap ?? undefined}>
        <Simge ad="bolt" boyut="k" /><span data-ikincil="" data-metin="">{hamle?.suruyor ? 'Aranıyor' : 'İyileştir'}</span>
      </button>
      {farkli && yaz && yetki.planStudyo && (
        <button type="button" className="tc-dugme tc-dugme-birincil" aria-label="Onaya gönder" onClick={(e) => kartAc({ tur: 'gonder' }, ankraj(e))}>
          <Simge ad="upload" boyut="k" /><span data-metin="">Onaya gönder</span>{fark && fark.say > 0 && <span className="tc-pym-tp-tsay">{fark.say}</span>}
        </button>
      )}
      <button type="button" className="tc-dugme tc-pym-hayalet" aria-label="Diğer" onClick={(e) => kartAc({ tur: 'menu' }, ankraj(e))}><Simge ad="more" boyut="k" /></button>
    </header>
  );

  return (
    <HamleBaglami.Provider value={hamle}>
    <div className="tc-pym-tp-kap" ref={kap}>
      {ust}
      {brif && <Brif ort={ort} l={brifL} kapat={brifKapat} />}
      <HamleOnizlemesi h={hamle} D={c.D} ad={(j) => c.D.siparisler.find((x) => x.id === j)?.ad ?? j} />
      <div className="tc-pym-tp-govde" data-ray={rayAcik ? '' : undefined}>
        <Ray ort={ort} />
        <Izgara ort={ort} pano={pano} parla={parla} />
        <Bugun ort={ort} acik={bugunAcik} />
      </div>
      {kart && <KartKatmani ort={ort} kart={kart.k} ankraj={kart.a} bildir={bildir} />}
      {atolye && <AtolyeEkrani c={c} p={p} cx={cx} now={now} emirNo={emirNo} canliSurum={sen?.canliSurum ?? o.depo.planSurumu?.planSurumu ?? null} kapat={() => setAtolye(false)} />}
      {yaz && (
        <Yapilacaklar c={c} p={p} cx={cx} l={sor} acik={ypAcik} ac={ypAc} komut={komut} sipSec={sipGoster} secim={secim} pan={pan} panAc={panAc} studyo={studyo}
          veriAc={veriAc} tasi={tasi} />
      )}
    </div>
    </HamleBaglami.Provider>
  );
}

const BRIF_ANAHTARI = 'tmi:planlama:brif';
function brifGunu(): string | null { try { return localStorage.getItem(BRIF_ANAHTARI); } catch { return null; } }
function brifGunuYaz(g: string): void { try { localStorage.setItem(BRIF_ANAHTARI, g); } catch { /* depo kapalıysa brifing yeniden açılışta da görünür */ } }

export const ankraj = (e: { clientX: number; clientY: number }): Ankraj => ({ x: e.clientX, y: e.clientY });
// Ortamdan siparişin bilgisi (ray, kart ve brifing aynı hesabı kullanır).
export const bilgiAl = (ort: Ortam, j: string): SiparisBilgisi | null => ort.bilgi.get(j) ?? sipBilgi(ort.c, ort.p, ort.cx, ort.hazir, j);
