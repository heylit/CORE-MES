import { useSearchParams } from 'react-router-dom';
import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dugme, DurumKutusu, OnayPenceresi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { calismaOku } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { gonderEngeli, isTasiOnizle, useOtomatikUygula } from '../motor/atolye/gonder.ts';
import { useBekleyenUygula } from '../motor/coz.ts';
import { useCanliPlan } from '../motor/fark.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz } from '../motor/kurallar.ts';
import { useAn } from '../motor/saat.ts';
import { SeritYuvasi } from '../motor/ust/yuva.ts';
import { girdiSaati, girdidenSaat } from '../ic/veri/kurallar.ts';
import { useEmirNo } from '../ortak/emir-no.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { AdimSorunu } from './AdimSorunu.tsx';
import { ElleBol } from './ElleBol.tsx';
import { Ayarlar } from './Ayarlar.tsx';
import { useBitinceBildir } from './bitince-bildir.ts';
import { emirYonu, planYonu } from './ayarlar.ts';
import { Kapasite } from './Kapasite.tsx';
import { Engeller } from './Engeller.tsx';
import { engelOzeti, engeller } from './engeller.ts';
import { ufukGunu } from '../ufuk-olcegi.ts';
import { DegisiklikOzeti, Degisiklikler } from './Degisiklikler.tsx';
import { useSatirEtkisi } from './satir-etkisi.ts';
import { bekleyenDegisiklikleri, degisiklikler, gerideEmirleri, gorunumdeBekleyenler, type Degisiklik } from './degisiklikler.ts';
import { onayIstegiAl, onayIstegiVar } from './istek.ts';
import {
  OLCEKLER, SAAT_ENI, YAKIN_EN_AZ, adimBeklemeleri, sigdirma, surguDegeri, surgudenEn, yakinOlcegi, yakinSinirla, adimEkleri, aramaUyar, firmaYazilari, kismiPlanli, modelKur, olcekKomsusu, onizlemeBitisi, sayim, sorunlular, suAndakiDurus, sureYaz, tasimaSaati, tasinabilir, fasonMu, uzakMi,
  type EmirDurumu, type KokpitOlcegi, type TurAdayi,
} from './kurallar.ts';
import { Matris, darEkran, type MatrisDuzeni } from './Matris.tsx';
import { ODAK_PAYI, Tahta, type OkKipi } from './Tahta.tsx';
import { Liste } from './Liste.tsx';
import { ListeDuzeni, satirBirincilIster } from './ListeDuzeni.tsx';
import { adimMalzemeAnlari, emirMalzemeleri } from './malzeme.ts';
import { planaAlOnizle } from './plana-al.ts';
import { sonDegisiklikleriGeriAl, taslakOzeti, useTaslak, type TaslakYazici } from './taslak.ts';
import { TaslakCubugu } from './TaslakCubugu.tsx';
import { EmirAdimlari, SiraSeridi, type GeriOzeti, type PlanlaDurumu, type PlanlaIstegi, type YerlestirmeHedefi } from './Yerlestirme.tsx';
import { ilkKart, kartAnahtari, kokCozucu, siparisAramasi, siraKartlari } from './yerlestirme.ts';
import { Tur, type TurDurumu } from './Tur.tsx';
import { Yol } from './Yol.tsx';
import { eksikPlanlanacaklar, yenidenPlanlanacaklar } from './yol.ts';
import './kokpit.css';

// Kokpit (kart 3151, 3282, 3297): planın tek yeri. Gövde yukarıdan aşağı akar (3297 a): 1 sipariş kartları sırasıyla (3297-5 a), 2 seçilen kartın emirleri
// ve operasyonları (seç-yerleştir), 3 tam genişlik tahta. Ayarlar tahtanın üstüne açılır; yanında yer tutmaz. Planlayanın kararları kişinin taslağına yazılır (3282 1d): taşıma, plana alma, ayar ve emrin
// yönü taslak komutudur, plan taslağın görünümünde yeniden dizilir, ortak çalışma "Plana yaz"a kadar değişmez. Geri son değişikliği taslaktan
// alır. Planı etkileyen değişiklikler plan şeridindeki listededir (3317 a); Canlıya al (yetkisi olmayanda Onaya gönder) onay sayfasını açar: onaya gönderme, müdür
// onayı ve canlıya alma yalnız buradadır (3282-4 a) ve ortak çalışmadandır; taslak varken kapalıdır.

type Goz = 'T' | 'S' | 'M' | 'B';
const GOZLER: readonly (readonly [Goz, string])[] = [['T', 'Tezgâh'], ['S', 'Sipariş'], ['M', 'Matris'], ['B', '3B']];
const BOLUM_ADI: Record<Goz, string> = { T: 'Tezgâhlar', S: 'Emirlere göre plan', M: 'Matris', B: '3B' };
// Matris ve 3B'de tahta yoktur: iş ok tuşuyla kaymaz; emrin neden geciktiği emrin satırında yazar.
const tahtasiz = (g: Goz): boolean => g === 'M' || g === 'B';
const DURUM_ADI: Record<Exclude<EmirDurumu, 'iyi'>, string> = { gec: 'Geç', risk: 'Riskli', plansiz: 'Plansız' };
const DURUMLAR = ['gec', 'risk', 'plansiz'] as const;
const yazimda = (): boolean => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
// Tahtada iş tutulurken ya da tutma menüsü açıkken ok tuşları iş kaydırmaz.
const tutuluyor = (): boolean => document.querySelector('.tc-pyq [data-tasinan], .tc-pyq-menu') !== null;
// 3B görünümü three'yi getirir; Planlama açılırken değil, 3B seçilince yüklenir.
const Kokpit3B = lazy(async () => ({ default: (await import('./Kokpit3B.tsx')).Kokpit3B }));
// Onay ve canlı bölümü Stüdyo'nun ekranını ve stillerini getirir; düğmeye basılınca yüklenir.
const KokpitOnay = lazy(async () => ({ default: (await import('./KokpitOnay.tsx')).KokpitOnay }));
const Sayi = ({ n }: { n: number }) => (n > 0 ? <b className="tc-pyq-rozet" aria-hidden="true">{n}</b> : null);
const YON_ADI = { ileri: 'İleriye', geri: 'Teslimden geriye' } as const;
// Sorun turu şimdilik kapalıdır (3304 a: üst şeritte benzer düğmeler azaltıldı); girişi bu değerle geri gelir.
const TUR_ACIK = false as boolean;
// Ctrl + tekerleğin bir adımı saat enini bu oranda büyütür ya da küçültür; sığdırmada tahta ölçülemezse (ilk çizim) bu genişlik alınır.
const TEKER_ORANI = 1.25, SIGDIRMA_ENI = 1000;
const YON_ACIKLAMASI = { ileri: 'Bütün planı ileriye diz: iş ilk boş saatte başlar', geri: 'Bütün planı teslimden geriye diz: iş termine yetişecek en geç saatte başlar' } as const;

// Menü düğmenin sağ kenarına yaslı açılır; düğme şeridin solundaysa menü sola taşıp kesilir. O zaman düğmenin sol kenarına yaslanır.
const solaYasla = (el: HTMLDivElement | null): void => {
  if (!el || el.hasAttribute('data-hiza')) return;
  const sinir = Math.max(0, el.closest('.tc-pyq')?.getBoundingClientRect().left ?? 0);
  if (el.getBoundingClientRect().left < sinir) el.setAttribute('data-hiza', 'sol');
};

// Üst şeritte açılır menü (3297): az kullanılan araçlar ve planın yönü tek düğmenin altında durur. Dışarı tıklamak, Esc ve seçim kapatır.
function Acilir({ ad, etiket, simge, sinif, etkin, disabled, children }: {
  ad: string; etiket: string; simge: SimgeAdi; sinif?: string; etkin?: boolean; disabled?: boolean; children: (kapat: () => void) => ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!acik) return undefined;
    const dis = (ev: PointerEvent): void => { if (!kok.current?.contains(ev.target as Node)) setAcik(false); };
    const tus = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.stopPropagation(); setAcik(false); kok.current?.querySelector('button')?.focus(); return; }
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      // Menüde ok tuşları açık seçenekler arasında dolaşır.
      const l = [...(kok.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)') ?? [])].filter((b) => !b.closest('[data-kapali]'));
      if (!l.length) return;
      ev.preventDefault(); ev.stopPropagation();
      const i = l.indexOf(document.activeElement as HTMLButtonElement);
      l[(i + (ev.key === 'ArrowDown' ? 1 : l.length - 1) + (i < 0 && ev.key === 'ArrowUp' ? 1 : 0)) % l.length]?.focus();
    };
    document.addEventListener('pointerdown', dis); document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('pointerdown', dis); document.removeEventListener('keydown', tus, true); };
  }, [acik]);
  return (
    <span className={`tc-pyq-acilir${sinif ? ` ${sinif}` : ''}`} ref={kok}>
      <button type="button" className="tc-pyq-ok" aria-haspopup="menu" aria-expanded={acik} data-etkin={etkin ? '' : undefined} disabled={disabled} title={etiket} onClick={() => { setAcik(!acik); }}>
        <Simge ad={simge} boyut="k" /><span>{ad}</span><Simge ad="down" boyut="k" />
      </button>
      {acik && <div className="tc-pyq-acilir-menu" role="menu" aria-label={etiket} ref={solaYasla}>{children(() => { setAcik(false); })}</div>}
    </span>
  );
}

export function Kokpit(o: PlanlamaEkranOzellikleri) {
  if (!o.calisma) return <div className="tc-pyq"><DurumKutusu durum="bos" mesaj="Henüz plan yok. Plan, Planlama motoru sayfasında kurulur." /></div>;
  return <Taslakli {...o} c={o.calisma} />;
}

// Taslak varken gösterilen çalışma taslağın görünümüdür; yoksa ortak çalışma. Yazamayan taslak açmaz.
function Taslakli(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { bildir } = useBildirim();
  const yazabilir = o.yetki.planYaz && o.komut !== null;
  const tk = useTaslak(yazabilir, (ileti) => { bildir('hata', ileti); });
  // Görünüm sunucunun kayıt biçimidir; ortak çalışma gibi okunur (eksik alan boş dizi ve varsayılan olur).
  const ham = tk.cevap?.taslak ? tk.cevap.calisma : null;
  const gorunum = useMemo(() => (ham === null ? null : calismaOku(ham)), [ham]) ?? o.c;
  return <Sayfa {...o} c={gorunum} taslak={yazabilir ? tk : null} />;
}

interface Onay { aday: TurAdayi; ileti: string; turda: boolean; baslik: string; dugme: string; yonGeri?: boolean }

const listedeSecimKalir = (): void => undefined;

function Sayfa(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi; taslak: TaslakYazici | null }) {
  const { c, komut, yetki, sec: ortakSec, taslak } = o;
  const { bildir } = useBildirim();
  const emirKaynagi = o.depo.durum?.emirler ?? null;
  const emirNo = useEmirNo(o.depo.receteRotaKaydi, emirKaynagi);
  const p = useMemo(() => planOku(c), [c]);
  const an = useAn();
  const bugun = tesisGunu(an);
  const firma = useMemo(() => (emirKaynagi ? firmaYazilari(c, emirKaynagi, bugun) : null), [c, emirKaynagi, bugun]);
  const cx = useMemo(() => derle(girdiKur(c, emirKaynagi ? bitenler(emirKaynagi, c.D) : plandanBitenler(c, p), an)), [c, p, emirKaynagi, an]);
  const m = useMemo(() => modelKur(c, p, cx, emirNo), [c, p, cx, emirNo]);
  const malzeme = useMemo(() => emirMalzemeleri(c, p, o.depo.acikSiparisler, cx.now), [c, p, o.depo.acikSiparisler, cx.now]);
  const malzemeAni = useMemo(() => adimMalzemeAnlari(malzeme, m.emirler), [malzeme, m.emirler]);
  const zaman = useCallback((t: number) => saatYaz(c.D, t), [c]);
  const saatGirdisi = useMemo(() => ({ yaz: (t: number) => girdiSaati(c.D, t), oku: (v: string) => girdidenSaat(c.D, v) }), [c]);
  const emir = useMemo(() => new Map(m.emirler.map((e) => [e.id, e])), [m]);

  const [goz, setGoz] = useState<Goz>('T');
  const [olcek, setOlcek] = useState<KokpitOlcegi>('3');
  const [odak, setOdak] = useState<number | null>(null);
  // Sürekli yakınlaştırma (3365): null ise ölçeğin sabit saat enidir.
  const [saatEni, setSaatEni] = useState<number | null>(null);
  // Telefonda gün gün tablo dardır; adım adım düzen açılır.
  const [duzen, setDuzen] = useState<MatrisDuzeni>(() => (darEkran() ? 'Y' : 'A'));
  const [ara, setAra] = useState('');
  const [suz, setSuz] = useState<Exclude<EmirDurumu, 'iyi'> | null>(null);
  const [onceAcik, setOnceAcik] = useState(false);
  const [goster, setGoster] = useState<string | null>(null);
  const [tur, setTur] = useState<TurDurumu | null>(null);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [oneri, setOneri] = useState<TurAdayi | null>(null);
  // Stüdyo'dan "Kokpit'te aç" ile gelindiyse Onay ve canlı açık başlar.
  // Onay sayfası Kokpit'in yerine açılır ve adrestedir (`?sayfa=onay`, 3335 a): tarayıcının geri düğmesi Kokpit'e döner.
  const [sorgu, sorguYaz] = useSearchParams();
  const onayAcik = sorgu.get('sayfa') === 'onay';
  // Kişi Canlıya al'a bastı (adresle açılan onay sayfası sayılmaz): bekleyen veri değişiklikleri o zaman kendiliğinden plana işlenir.
  const canliIstendi = useRef(false);
  const setOnayAcik = useCallback((acik: boolean): void => {
    canliIstendi.current = acik;
    sorguYaz((q) => { const y = new URLSearchParams(q); if (acik) y.set('sayfa', 'onay'); else y.delete('sayfa'); return y; });
  }, [sorguYaz]);
  // Kokpit tek görünümdür: liste ortada düzeni (3414 b). Bölümlü eski düzen ekrandan açılmaz; yalnız adresle (`?duzen=klasik`) açılır.
  const klasik = sorgu.get('duzen') === 'klasik';
  const duzenSec = useCallback((k: boolean): void => {
    sorguYaz((q) => { const y = new URLSearchParams(q); if (k) y.set('duzen', 'klasik'); else y.delete('duzen'); return y; });
  }, [sorguYaz]);
  const [butunTezgahlar, setButunTezgahlar] = useState(false);
  const onayIstendi = useRef(onayIstegiVar());
  // Bölüm taslak çubuğundan, taslak ortak plana yazıldıktan sonra açıldıysa Onay ve canlı bunu kalıcı bir satırla söyler.
  const [onayTaslaktan, setOnayTaslaktan] = useState(false);
  const [ayarAcik, setAyarAcik] = useState(false);
  // Duruş ve mesai bölümü (3282 2a-1, 2a-2): üst şeritteki düğmeyle açılır (ayrıntı sütunu boşken yer tutmaz: tahta dar kalmasın); açılınca seçim
  // kalkar, ayar paneli kapanır.
  const [kapasiteAcik, setKapasiteAcik] = useState(false);
  // Engeller paneli (3457-1 A): son planın engelleri; Ayarlar ve Duruş ve mesai ile aynı yerdedir, biri açılınca öteki kapanır.
  const [engelAcik, setEngelAcik] = useState(false);
  const [sorunTezgahi, setSorunTezgahi] = useState<{ tezgah: string; n: number } | null>(null);
  // Sorun bildirilen adım (3335-3b); paneli Ayarlar ve Duruş ve mesai ile aynı yerdedir, biri açılınca öteki kapanır.
  const [sorunAdimi, setSorunAdimi] = useState<string | null>(null);
  // Elle bölünen adım (3488 c); paneli öteki panellerle aynı yerdedir, onlar açıksa önce onlar görünür.
  const [bolAdimi, setBolAdimi] = useState<string | null>(null);
  // Üst şeritteki yön düğmesi paneli o yönle açar ve etkisini hesaplatır; geçerli yönün düğmesi paneli yön bölümüyle açar (ölü tıklama olmasın).
  const [ayarYon, setAyarYon] = useState<'ileri' | 'geri' | null>(null);
  // Ayarın etkisi Uygula ya da Vazgeç beklerken taslak çubuğundaki birincil düğme kapanır: ekranda tek birincil kalır.
  const [ayarEtkisi, setAyarEtkisi] = useState(false);
  // Sıra şeridinde seçili kart (kök emir); seçilmediyse yerleşmesi eksik ilk kart. Tahtadan ya da listeden emir seçilince kart onu izler.
  const [kart, setKart] = useState<string | null>(null);
  // 3330: kart açıkça seçilince tahtada vurgulanır; Esc, karta yeniden basma ve boş tahta alanı vurguyu kaldırır, kart bölümde kalır.
  const [vurgu, setVurgu] = useState(false);
  // Planı etkileyen değişiklikler (3317 a): plan şeridinin altında açılan liste; süzgeç seçili kartın satırlarını bırakır.
  const [degisiklikAcik, setDegisiklikAcik] = useState(false);
  const [degisiklikSuzgeci, setDegisiklikSuzgeci] = useState(false);
  const yuva = useContext(SeritYuvasi);
  // Seç-yerleştir: seçili adımın uygun tezgâhları ve boş yerleri (tahta işaretler).
  const [yerHedefi, setYerHedefi] = useState<YerlestirmeHedefi | null>(null);
  const [tasinacak, setTasinacak] = useState<string | null>(null);
  // "Planla" menüsü (3335-2): seçili kartın sıradaki plansız emrine giden istek ve o emrin menüye bildirdiği durum.
  const [planla, setPlanla] = useState<PlanlaIstegi | null>(null);
  const [planlaDurumu, setPlanlaDurumu] = useState<PlanlaDurumu | null>(null);
  const [digerAcik, setDigerAcik] = useState(false);
  // Görünüm ve ölçek seçenekleri bir düğmenin ardındadır (3414); tahta dışı bir görünüm seçiliyken açık durur.
  const [gorunumAcik, setGorunumAcik] = useState(false);
  useEffect(() => { onayIstegiAl(); if (onayIstendi.current) setOnayAcik(true); }, [setOnayAcik]);
  const kok = useRef<HTMLDivElement | null>(null);

  const yazabilir = yetki.planYaz && komut !== null && taslak !== null;
  const uyarYaz = useCallback((ileti: string) => { bildir('bilgi', ileti); }, [bildir]);
  const tOzet = taslakOzeti(taslak?.cevap?.taslak ?? null);
  const taslakVar = (taslak?.cevap?.taslak ?? null) !== null;
  // Taslak varken (ya da henüz okunmadıysa) ortak çalışma kendiliğinden yeniden dizilmez: taslağın dizmesi bayatlar, kişi kendi planını
  // görürken ortak plan oynar. Sürüm verilmez ki dizme isteği düşmesin; taslak kalkınca çalışır.
  const ortakBekler = taslakVar || (taslak !== null && taslak.cevap === null);
  const ortak = ortakBekler ? { ...o, komut: null, depo: { ...o.depo, calismaSurumu: null } } : o;
  useOtomatikUygula(ortak, uyarYaz);
  const bekleyenUygulayici = useBekleyenUygula(ortak, uyarYaz, uyarYaz);
  const diziliyor = bekleyenUygulayici?.suruyor === true;
  // 3414-5 a: Canlıya al bekleyen veri değişikliklerini kendisi plana işler (ayrı bir Uygula adımı yoktur). Kişinin değişiklikleri plana
  // yazılana kadar uygulayıcı yoktur (ortakBekler); yazılınca gelir ve bir kez çalışır.
  useEffect(() => {
    if (!onayAcik || !canliIstendi.current || !bekleyenUygulayici || bekleyenUygulayici.suruyor) return;
    canliIstendi.current = false;
    uyarYaz(`${String(bekleyenUygulayici.say)} bekleyen değişiklik plana işleniyor; bitince canlıya alabilirsiniz.`);
    bekleyenUygulayici.uygula();
  }, [onayAcik, bekleyenUygulayici, uyarYaz]);
  const mesgul = diziliyor || taslak?.mesgul === true || taslak?.diziliyor === true;
  // Planla düğmesinin sonucu: dizme bitince bir kez bildirilir.
  const planlaIletisi = useBitinceBildir(mesgul, bildir);

  const secEmir = o.secim.siparis !== null && emir.has(o.secim.siparis) ? o.secim.siparis : null;
  const secIs = o.secim.adim !== null && m.isler[o.secim.adim] ? o.secim.adim : null;
  const sec = useCallback((job: string | null, isId: string | null) => { ortakSec({ siparis: job, adim: isId }); }, [ortakSec]);

  const say = useMemo(() => sayim(m.emirler), [m]);
  const ufukSonu = ufukGunu() * 24;
  const engelGruplari = useMemo(() => engeller(p, m, cx, ufukSonu, zaman), [p, m, cx, ufukSonu, zaman]);
  const engelOzet = useMemo(() => engelOzeti(p, engelGruplari), [p, engelGruplari]);
  const engelAc = (): void => { if (!engelAcik) sec(null, null); setAyarAcik(false); setAyarYon(null); setKapasiteAcik(false); setSorunTezgahi(null); setSorunAdimi(null); setEngelAcik(!engelAcik); };
  const plansizlar = useMemo(() => m.emirler.filter((e) => e.durum === 'plansiz').map((e) => e.id), [m]);
  const geride = useMemo(() => gerideEmirleri(m), [m]);
  // Değişiklik çubuğu sayfanın açıldığı andaki sayılarla karşılaştırır.
  const ilk = useRef(say);
  // Sipariş bağı (3297-5 a): kartlar siparişe göre toplanır; arama sipariş no ve müşteriyle de bulur. Dilim okunamadıysa kart kök emirdir.
  const bag = o.depo.durum?.siparisBaglari ?? null;
  const kokBul = useMemo(() => kokCozucu(m.emirler), [m.emirler]);
  const gorunen = useMemo(() => m.emirler.filter((e) => (suz === null || e.durum === suz) && (aramaUyar(e, m, ara) || siparisAramasi(e.id, bag, ara))), [m, suz, ara, bag]);
  const gorunenKume = useMemo(() => new Set(gorunen.map((e) => e.id)), [gorunen]);
  const uyar = useCallback((job: string) => gorunenKume.has(job), [gorunenKume]);

  // --- yazma ---
  // Önizlemeler ortak çalışmanın sürümüyle sunucuda hesaplanır; komut taslağa yazılır, plan taslağın görünümünde yeniden dizilir.
  const surum = o.depo.calismaSurumu;
  const { yenile } = o;
  // yonGeri: teslimden geriye yerleştirme (3318). Emrin yönü zaten geriye değilse önce yön komutu yazılır; plana alma yazılamazsa yön geri alınır.
  // Çoklu kaydırmada her iş ayrı taşımadır; "taslağa yazıldı" bildirimi kümenin sonunda tek satırdır (ayrı ayrı çıksa tahtayı örter).
  const grup = useRef<{ bekleyen: Set<string>; yazilan: number } | null>(null);
  const yaz = useCallback(async (a: TurAdayi, yonGeri = false): Promise<boolean> => {
    if (!taslak || !yazabilir) return false;
    const yonYaz = yonGeri && a.planaAl !== undefined && (emirYonu(c, a.planaAl) === 'plan' ? planYonu(c) : emirYonu(c, a.planaAl)) !== 'geri';
    if (yonYaz && a.planaAl !== undefined && !(await taslak.yaz({ tur: 'yon', emirId: a.planaAl, yon: 'geri' }, false))) return false;
    const k: TaslakKomutu = a.planaAl === undefined ? { tur: 'tasi', isId: a.isId, tezgah: a.tezgah, baslangic: a.baslangic }
      : { tur: 'plana-al', emirId: a.planaAl, tezgah: a.tezgah, baslangic: a.baslangic, ...(a.adimlar && a.adimlar.length > 0 ? { adimlar: a.adimlar } : {}) };
    const tamam = await taslak.yaz(k);
    // Yön geri alınamazsa (araya başka değişiklik girdiyse) taslakta kalır; kişiye söylenir.
    if (!tamam && yonYaz && !(await taslak.geriAl(true, false))) bildir('hata', 'Emir yerleştirilemedi; yön değişikliği kaldı. Geri al ile alabilirsiniz.');
    if (tamam && a.planaAl === undefined && grup.current?.bekleyen.has(a.isId)) { grup.current.yazilan += 1; return tamam; }
    if (tamam) bildir('bilgi', a.planaAl === undefined ? (m.isler[a.isId] ? 'İş taşındı; Geri al ile alınır.' : 'Adım elle yerleştirildi ve o yerde kilitlendi; Geri al ile alınır.') : yonYaz ? 'Emir teslimden geriye planlandı (iki değişiklik: yön ve yerleşim); Geri al ile alınır.' : 'Emir planlandı; Geri al ile alınır.');
    return tamam;
  }, [taslak, yazabilir, bildir, c, m.isler]);
  // Yeniden planlama isteği taslağa kendi satırıyla yazılır (Geri onu ve dizmesini birlikte alır); plan taslağın görünümünde yeniden dizilir.
  const yenidenPlanla = useCallback(async (isler: readonly string[], ileti: string): Promise<void> => {
    if (!taslak || !yazabilir || isler.length === 0) return;
    // Sonuç dizme bitince söylenir: komut yazıldığında plan henüz yeniden dizilmemiştir (kişi düğmenin işe yaradığını bitişte görür).
    if (await taslak.yaz({ tur: 'yeniden-planla', isler: [...isler] })) planlaIletisi(`${ileti} Geri al ile alınır.`);
  }, [taslak, yazabilir, planlaIletisi]);
  const planlaIste = useCallback((t: PlanlaIstegi['tur']) => { setPlanla((p) => ({ n: (p?.n ?? 0) + 1, tur: t })); }, []);

  // Tahtadan bırakılan iş: önce sunucu önizlemesi. Geçersiz yer yazılmaz; emri terminden sonraya atan taşıma onay ister.
  // Önceki taşıma yazılırken gelen taşıma reddedilmez, sıraya girer (3365); aynı işin sıradaki taşıması sonuncusuyla değişir (art arda ok tuşu
  // tek taşıma olur). Sıra, yazma bitince ve onay penceresi kapanınca yürür.
  const kuyruk = useRef(new Map<string, { tezgah: string; S: number }>());
  const tasiyor = useRef(false);
  // Yazılmakta olan taşımanın hedefi: ok tuşuna art arda basınca sonraki basış buradan devam eder (plan henüz yenilenmedi).
  const suren = useRef<{ isId: string; tezgah: string; S: number } | null>(null);
  const [sirada, setSirada] = useState(0);
  const [tasimaBitti, setTasimaBitti] = useState(0);
  const tasiDene = useCallback((isId: string, tezgah: string, hedefS: number): void => {
    // 3488 a: yerleşmeyen adımın planda satırı yoktur; emri adımlarından bulunur, taşıma onu verilen yerde kilitler.
    const x = m.isler[isId], e = x ? emir.get(x.job) : m.emirler.find((y) => y.adimlar.some((a) => a.id === isId));
    if (!x && !e) return;
    if (mesgul || tasiyor.current || onay !== null) { kuyruk.current.set(isId, { tezgah, S: hedefS }); setSirada(kuyruk.current.size); return; }
    tasiyor.current = true; suren.current = { isId, tezgah, S: hedefS };
    const bitir = (): void => {
      tasiyor.current = false; suren.current = null; setTasimaBitti((n) => n + 1);
      const g = grup.current;
      if (g?.bekleyen.delete(isId) && g.bekleyen.size === 0) {
        grup.current = null;
        if (g.yazilan > 0) bildir('bilgi', `${String(g.yazilan)} iş birlikte taşındı; Geri al her birini ayrı alır.`);
      }
    };
    const S = tasimaSaati(hedefS, m.simdi);
    void isTasiOnizle({ isId, tezgah, baslangic: S }).then(async (oz) => {
      if (oz && !oz.gecerli) { bildir('hata', oz.ileti ?? 'Bu taşıma yapılamıyor.'); return; }
      const bitis = oz && e ? onizlemeBitisi(m, e, oz.isler.map((y) => ({ isId: y.isId, C: y.C }))) : null;
      if (e && bitis !== null && e.termin !== null && bitis > e.termin + 0.01 && e.durum !== 'gec') {
        setOnay({ aday: { isId, tezgah, baslangic: S }, turda: false, baslik: 'Bu taşıma emri geç bırakır', dugme: 'Yine de taşı', ileti: `${e.no} terminden ${sureYaz(bitis - e.termin)} sonra biter.` });
        return;
      }
      await yaz({ isId, tezgah, baslangic: S });
    }).finally(bitir);
  }, [m, emir, mesgul, onay, bildir, yaz]);
  useEffect(() => {
    if (mesgul || tasiyor.current || onay !== null) return;
    const ilk = kuyruk.current.entries().next();
    if (ilk.done) return;
    const [isId, h] = ilk.value;
    kuyruk.current.delete(isId); setSirada(kuyruk.current.size);
    tasiDene(isId, h.tezgah, h.S);
  }, [mesgul, onay, sirada, tasimaBitti, tasiDene]);
  const onizle = useMemo(() => (yazabilir ? (isId: string, tezgah: string, S: number) => isTasiOnizle({ isId, tezgah, baslangic: S }) : null), [yazabilir]);
  const [okKipi, setOkKipi] = useState<OkKipi>('is');

  // Tepsiden tahtaya bırakılan plansız emir: önce sunucu önizlemesi (ilk adımın oturacağı yer ve emrin bitişi), sonra plana alma komutu.
  const planaAlDene = useCallback((emirId: string, tezgah: string, hedefS: number): void => {
    const e = emir.get(emirId), ilk = e?.adimlar[0];
    if (!e || !ilk || mesgul || surum === null) { if (mesgul) bildir('bilgi', 'Önceki değişiklik yazılıyor; bitince yeniden deneyin.'); return; }
    const aday: TurAdayi = { isId: ilk.id, tezgah, baslangic: tasimaSaati(hedefS, m.simdi), planaAl: emirId };
    void planaAlOnizle({ emirId, tezgah, baslangic: aday.baslangic }, surum).then((oz) => {
      if (oz && !oz.gecerli) { bildir('hata', oz.ileti ?? 'Bu emir buraya alınamıyor.'); return; }
      if (oz?.bitis != null && e.termin !== null && oz.bitis > e.termin + 0.01) {
        setOnay({ aday, turda: false, baslik: 'Emir terminine yetişmiyor', dugme: 'Yine de planla', ileti: `${e.no} bu yerde terminden ${sureYaz(oz.bitis - e.termin)} sonra biter.` });
        return;
      }
      void yaz(aday);
    });
  }, [m, emir, mesgul, surum, bildir, yaz]);

  const turKarar = useCallback((uygulandi: boolean) => {
    setTur((t) => (t && t.i < t.idler.length ? { ...t, i: t.i + 1, gecmis: [...t.gecmis, { i: t.i, uygulandi }], ileri: [] } : t));
  }, []);
  const hamleUygula = useMemo(() => (yazabilir && !mesgul ? (a: TurAdayi, gecBirakir: boolean, geriOzeti?: GeriOzeti): void => {
    const al = a.planaAl !== undefined;
    const e = emir.get(a.planaAl ?? m.isler[a.isId]?.job ?? '');
    // Teslimden geriye yerleştirme emrin yönünü de değiştirir: her zaman onay sorulur (3318, Arayüz ön bakışı).
    if (geriOzeti && e) {
      const tz = m.tezgahlar.find((t) => t.id === geriOzeti.tezgah)?.kod ?? geriOzeti.tezgah;
      setOnay({
        aday: a, turda: false, yonGeri: true, baslik: 'Teslimden geriye yerleştir', dugme: 'Yerleştir',
        ileti: `${e.no} termine yetişecek en geç yere alınır: ilk operasyon ${tz} tezgâhında ${zaman(geriOzeti.S)} başlar${geriOzeti.bitis !== null ? `, öngörüye göre emir ${zaman(geriOzeti.bitis)} biter` : ''}${e.termin !== null ? ` (termin ${zaman(e.termin)})` : ''}. Emrin yönü "Teslimden geriye" olur.`,
      });
      return;
    }
    if (gecBirakir && e) {
      setOnay({
        aday: a, turda: tur !== null, baslik: al ? 'Emir terminine yetişmiyor' : 'Bu taşıma emri geç bırakır', dugme: al ? 'Yine de planla' : 'Yine de taşı',
        ileti: al ? `${e.no} bu yerde terminden sonra biter.` : `${e.no} bu hamleyle terminden sonra biter.`,
      });
      return;
    }
    void yaz(a).then((tamam) => { if (tamam && tur) turKarar(true); });
  } : null), [yazabilir, mesgul, emir, m, tur, yaz, turKarar, zaman]);

  // --- geri ---
  // Geri taslağın son değişikliğini (ve ardından gelen dizmeyi) alır; plan yeniden dizilir. İleri (3365) geri alınanı taslağa yeniden yazar.
  const adim = tOzet.n, ileriAdim = taslak?.ileriAdim ?? 0;
  const geri = useCallback((): boolean => {
    if (!taslak || mesgul || adim === 0) return false;
    void taslak.geriAl();
    return true;
  }, [taslak, mesgul, adim]);
  const ileri = useCallback((): boolean => {
    if (!taslak || mesgul || ileriAdim === 0) return false;
    void taslak.ileriAl();
    return true;
  }, [taslak, mesgul, ileriAdim]);

  // --- önce / sonra ---
  // 3B'nin Yük ve gecikme ile Önce / sonra bakışları da onaylı planı okur (kart 3208 a).
  const canli = useCanliPlan(onceAcik || goz === 'B', c, p, o.depo.planSurumu?.planSurumu ?? null);
  const canliHata = canli.tur === 'hata' ? canli.ileti : null;
  useEffect(() => { if (canliHata !== null) { bildir('hata', canliHata); setOnceAcik(false); } }, [canliHata, bildir]);
  const once = onceAcik && canli.tur === 'tamam' ? canli.canli : null;

  // --- ölçek ---
  const olcekSec = useCallback((x: KokpitOlcegi, saat: number | null = null) => { setOlcek(x); setOdak(saat); setSaatEni(null); }, []);
  const simdikiEn = uzakMi(olcek) ? SAAT_ENI[olcek] : saatEni ?? SAAT_ENI[olcek];
  // Yakınlaşırken görünümün ortasındaki saat yerinde kalır (tahta kaydırması ölçekle yeniden hesaplanır).
  const yakinlas = useCallback((px: number) => {
    const yeni = yakinSinirla(px), k = document.querySelector<HTMLElement>('.tc-pyq-tahta');
    const yarim = (k?.clientWidth ?? 0) / 2, ad = k?.querySelector<HTMLElement>('.tc-pyq-bas')?.offsetWidth ?? 0;
    // Ortadaki saat: içerikte ad sütunundan sonra gelen yer. Yeni ende aynı saat ortada kalsın diye tahtanın kaydırdığı odak buna göre seçilir.
    const orta = k && yarim > 0 ? m.bas + (k.scrollLeft + yarim - ad) / simdikiEn : null;
    setOdak(orta === null ? null : orta + (ad - yarim + ODAK_PAYI) / yeni);
    setSaatEni(yeni); setOlcek(yakinOlcegi(yeni));
  }, [m.bas, simdikiEn]);
  // Seçileni sığdır; işlev seçim ve kart okunduktan sonra kurulur (aşağıda), klavye buradan çağırır.
  const sigdirSon = useRef<() => void>(() => undefined);
  const tekerSon = useRef<(ev: WheelEvent) => void>(() => undefined);
  tekerSon.current = (ev: WheelEvent): void => {
    if (uzakMi(olcek)) { setOdak(null); setOlcek((x) => olcekKomsusu(x, ev.deltaY > 0 ? 1 : -1)); return; }
    const yeni = simdikiEn * (ev.deltaY > 0 ? 1 / TEKER_ORANI : TEKER_ORANI);
    // Hafta'nın da altına uzaklaşınca Ay'a geçilir (gün yük hücreleri).
    if (yeni < YAKIN_EN_AZ - 1e-6) { olcekSec('A'); return; }
    yakinlas(yeni);
  };
  const gunAc = useCallback((g: number) => {
    if (g >= Math.round((m.son - m.bas) / 24)) { bildir('bilgi', 'Bu gün planın ötesinde; emirler plana alınınca tahtada görünür.'); return; }
    // Yıl'dan haftaya (Ay ölçeği), öteki ölçeklerden güne inilir.
    setGoz('T'); olcekSec(olcek === 'Y' ? 'A' : 'G', m.bas + g * 24 + (olcek === 'Y' ? 0 : 6));
  }, [m, olcek, olcekSec, bildir]);
  useEffect(() => {
    const el = kok.current; if (!el) return undefined;
    const teker = (ev: WheelEvent): void => {
      if (!ev.ctrlKey || !(ev.target as Element).closest('.tc-pyq-tahta')) return;
      ev.preventDefault(); tekerSon.current(ev);
    };
    el.addEventListener('wheel', teker, { passive: false });
    return () => { el.removeEventListener('wheel', teker); };
  }, []);

  // --- sorun turu ---
  const turBaslat = (): void => {
    const idler = sorunlular(m.emirler).map((e) => e.id);
    if (!idler.length) { bildir('bilgi', 'Geç, riskli ya da plansız emir yok.'); return; }
    if (tahtasiz(goz)) setGoz('T');
    if (uzakMi(olcek)) olcekSec('3');
    setSuz(null); setAra(''); setOnceAcik(false);
    setTur({ idler, i: 0, gecmis: [], ileri: [] });
  };
  const turBitti = tur !== null && tur.i >= tur.idler.length;
  const [oynuyor, setOynuyor] = useState(false);
  useEffect(() => { if (!tur || turBitti) setOynuyor(false); }, [tur === null, turBitti]);
  const oynatKarar = useCallback((a: TurAdayi | null): void => {
    if (!a) { turKarar(false); return; }
    void yaz(a).then((tamam) => { if (tamam) turKarar(true); else setOynuyor(false); });
  }, [yaz, turKarar]);
  const turEmri = tur && tur.i < tur.idler.length ? emir.get(tur.idler[tur.i] ?? '') ?? null : null;
  const turEmirId = turEmri?.id ?? null;
  // Oynarken plandan düşmüş emir adımı kendiliğinden atlanır (hamle listesi çizilmediği için karar oradan gelmez).
  useEffect(() => { if (oynuyor && tur && !turBitti && turEmirId === null && !mesgul) turKarar(false); }, [oynuyor, tur, turBitti, turEmirId, mesgul, turKarar]);
  useEffect(() => {
    if (turEmirId === null) return;
    const ilkIs = emir.get(turEmirId)?.adimlar.find((a) => m.isler[a.id])?.id ?? null;
    sec(turEmirId, null); setGoster(ilkIs);
    // Yalnız adım değişince: plan yenilenince seçim ve kaydırma yerinde kalır.
  }, [turEmirId]);
  const turOnceki = (): void => {
    const k = tur?.gecmis.at(-1);
    if (!tur || !k || (k.uygulandi && !geri())) return;
    setTur({ ...tur, i: k.i, gecmis: tur.gecmis.slice(0, -1), ileri: [...tur.ileri, k] });
  };
  const turSonraki = (): void => {
    const k = tur?.ileri.at(-1);
    if (!tur || !k || k.uygulandi) return;
    setTur({ ...tur, i: k.i + 1, gecmis: [...tur.gecmis, k], ileri: tur.ileri.slice(0, -1) });
  };
  // Turdan vazgeçmek turda yazılan değişiklikleri taslaktan sırayla geri alır.
  const turVazgec = (): void => {
    const n = tur?.gecmis.filter((k) => k.uygulandi).length ?? 0;
    setTur(null);
    if (n > 0 && taslak) void sonDegisiklikleriGeriAl(taslak, n);
  };
  const turBitir = (): void => { setTur(null); };

  // --- klavye ---
  const turTusu = useRef({ onceki: turOnceki, sonraki: turSonraki });
  useEffect(() => { turTusu.current = { onceki: turOnceki, sonraki: turSonraki }; });
  const sorunSec = useCallback((yon: 1 | -1) => {
    const l = sorunlular(gorunen);
    if (!l.length) return;
    const i = l.findIndex((e) => e.id === secEmir), e = l[(i + yon + l.length) % l.length] ?? l[0];
    if (!e) return;
    sec(e.id, null); setGoster(e.adimlar.find((a) => m.isler[a.id])?.id ?? null);
  }, [gorunen, secEmir, sec, m]);
  // Çoklu seçim (3365): Ctrl, Cmd ya da Shift ile tıklanan işler. İlk ek tıklamada o an seçili iş de kümeye girer; seçim kümenin dışına çıkınca
  // (düz tıklama, Esc, boş alan) küme boşalır. Küme birlikte kayar: her iş kendi taşımasıdır, sıraya girer, Geri her birini ayrı alır.
  const [coklu, setCoklu] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { if (coklu.size > 0 && (secIs === null || !coklu.has(secIs))) setCoklu(new Set()); }, [secIs]);
  const cokluSec = useCallback((id: string) => {
    if (!m.isler[id]) return;
    const n = new Set(coklu.size === 0 && secIs !== null ? [secIs] : coklu);
    if (n.has(id)) n.delete(id); else n.add(id);
    const son = n.has(id) ? id : [...n].at(-1) ?? null;
    setCoklu(n);
    sec(son !== null ? m.isler[son]?.job ?? null : null, son);
  }, [coklu, secIs, m, sec]);
  // Kümeyi dS saat kaydırır. Sağa kayarken en geç başlayan, sola kayarken en erken başlayan önce taşınır: işler birbirini itmesin.
  const grupKaydir = useCallback((dS: number) => {
    const l = [...coklu].map((id) => m.isler[id]).filter((x) => x !== undefined);
    // Süren iş kümeyle kaymaz: taşımak onu durdurur, bu tek başına ve bilerek yapılır (3414-6 a).
    const kayar = (x: (typeof l)[number]) => tasinabilir(x) === null && !x.basladi;
    const engelli = l.filter((x) => !kayar(x));
    if (engelli.length > 0) bildir('bilgi', `${String(engelli.length)} iş kaymadı (süren, biten ya da fason); ötekiler kaydı. Süren işi tek başına taşıyın.`);
    const tasinan = l.filter(kayar);
    if (tasinan.length > 1) {
      const g = grup.current ?? { bekleyen: new Set<string>(), yazilan: 0 };
      for (const x of tasinan) g.bekleyen.add(x.id);
      grup.current = g;
    }
    for (const x of tasinan.sort((a, b) => (dS > 0 ? b.S - a.S : a.S - b.S))) {
      const h = kuyruk.current.get(x.id) ?? (suren.current?.isId === x.id ? suren.current : undefined);
      tasiDene(x.id, h?.tezgah ?? x.m, (h?.S ?? x.S) + dS);
    }
  }, [coklu, m, bildir, tasiDene]);
  // Seçili iş ok tuşlarıyla kayar: ← → yarım saat (Shift ile dört saat), ↑ ↓ adımın öteki aday tezgâhı. Her basış bir taşımadır.
  const okla = useCallback((tus: string, buyuk: boolean): boolean => {
    const x = secIs ? m.isler[secIs] : undefined;
    if (!x || !yazabilir || tahtasiz(goz)) return false;
    if (coklu.size > 1) {
      if (tus === 'arrowleft' || tus === 'arrowright') { grupKaydir((tus === 'arrowleft' ? -1 : 1) * (buyuk ? 4 : 0.5)); return true; }
      bildir('bilgi', 'Çoklu seçimde tezgâh değişmez; tek iş seçin.');
      return true;
    }
    const engel = tasinabilir(x) ?? (x.basladi ? 'Süren iş okla kaymaz; sürükleyip yeni yerine bırakın (iş durdurulur, kalanı taşınır)' : null);
    if (engel) { bildir('bilgi', engel); return true; }
    // Sırada bekleyen taşıması varsa yeni basış ondan devam eder.
    const sirali = kuyruk.current.get(x.id) ?? (suren.current?.isId === x.id ? suren.current : undefined), m0 = sirali?.tezgah ?? x.m, S0 = sirali?.S ?? x.S;
    if (tus === 'arrowleft' || tus === 'arrowright') { tasiDene(x.id, m0, S0 + (tus === 'arrowleft' ? -1 : 1) * (buyuk ? 4 : 0.5)); return true; }
    const l = (emir.get(x.job)?.adimlar.find((a) => a.id === x.id)?.adaylar ?? []).filter((t) => !fasonMu(t));
    const i = l.indexOf(m0), t = l[(i + (tus === 'arrowdown' ? 1 : l.length - 1)) % l.length];
    if (i < 0 || !t || t === m0) { bildir('bilgi', 'Bu adımın başka aday tezgâhı yok.'); return true; }
    tasiDene(x.id, t, S0);
    return true;
  }, [secIs, m, yazabilir, goz, emir, bildir, tasiDene, coklu, grupKaydir]);
  useEffect(() => {
    const tus = (ev: KeyboardEvent): void => {
      if (yazimda() || ev.altKey || document.querySelector('[role="dialog"]')) return;
      const k = ev.key.toLowerCase();
      if (ev.ctrlKey || ev.metaKey) {
        // Turda geri ve ileri turun kendi adımlarıdır (← →).
        if (tur) return;
        if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); geri(); }
        else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); ileri(); }
        return;
      }
      if (k === '+' || k === '=') { setOdak(null); setSaatEni(null); setOlcek((x) => olcekKomsusu(x, -1)); }
      else if (k === '-') { setOdak(null); setSaatEni(null); setOlcek((x) => olcekKomsusu(x, 1)); }
      else if (k === 'f' && !tur) sigdirSon.current();
      else if (k === 'b') setOnceAcik((x) => !x);
      else if (k === 'j') sorunSec(1);
      else if (k === 'k') sorunSec(-1);
      else if (k === 'arrowleft' && tur) turTusu.current.onceki();
      else if (k === 'arrowright' && tur) turTusu.current.sonraki();
      else if (k.startsWith('arrow') && !tur && !tutuluyor() && okla(k, ev.shiftKey)) ev.preventDefault();
      else if (k === 'escape' && !tur && secEmir) { sec(null, null); setVurgu(false); }
      else if (k === 'escape' && !tur && tasinacak !== null) setTasinacak(null);
      else if (k === 'escape' && !tur && vurgu) setVurgu(false);
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [geri, ileri, sorunSec, tur, secEmir, sec, okla, tasinacak, vurgu]);

  // --- canlıya al ---
  // Plan güncel değilken sayfanın birincil düğmesi plan çubuğundadır (Planı kur / Uygula); Canlıya al o zaman birincil değildir ve nedeni
  // ipucundadır.
  // Bölüm engel varken de açılır: müdür onaydaki planı onaylar, kontrol listesi engeli gösterir.
  const engel = gonderEngeli(c);
  const canliyaAlir = yetki.planCanliyaAl;
  const onayda = o.depo.senaryolar?.senaryolar.filter((x) => x.durum === 'onayda').length ?? 0;
  // Veri değişiklikleri ortak çalışmanın bekleyenleridir (taslak görünümünün değil): toplu düğme onları uygular.
  const ortakCalisma = o.calisma;
  // Kayıtlı bekleyenler ve bu açılışta gelen, henüz yazılmamış başka sayfa satırı (salt okunur kişide hiç yazılmaz; sayfa üstündeki satırın
  // gösterdiğiyle aynı liste).
  const disSatir = yuva.dis ?? null;
  const ortakBekleyen = useMemo(() => bekleyenDegisiklikleri(ortakCalisma, disSatir), [ortakCalisma, disSatir]);
  // Taslakta uygulanan satır listeden düşer (3317 a, 2. adım); toplu düğme ortak çalışmanın bekleyenlerini sayar.
  const bekleyenDegisiklikler = useMemo(() => gorunumdeBekleyenler(ortakBekleyen, c), [ortakBekleyen, c]);
  const satirEtkisi = useSatirEtkisi({ c, taslak: yazabilir ? taslak : null, liste: bekleyenDegisiklikler });
  const degisiklikListesi = useMemo(() => degisiklikler({
    m, zaman, an: (ms) => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }),
    bekleyen: bekleyenDegisiklikler,
    olaylar: o.depo.planSurumu?.bayat?.olaylar ?? [],
  }), [m, zaman, bekleyenDegisiklikler, o.depo.planSurumu]);
  const degisiklikGoster = useCallback((d: Degisiklik) => {
    if (d.emirId === null) return;
    setDegisiklikAcik(false);
    // Plansız emir kartında yerleştirilir (2. bölüm); planlı emirde kartı seçilir ve iş tahtada gösterilir.
    if (emir.get(d.emirId)?.durum === 'plansiz') { sec(null, null); setKart(kartAnahtari(d.emirId, bag, kokBul)); return; }
    sec(d.emirId, null); setGoster(d.isId ?? emir.get(d.emirId)?.adimlar.find((a) => m.isler[a.id])?.id ?? null);
  }, [sec, emir, m, bag, kokBul]);

  const arizali = useMemo(() => m.tezgahlar.filter((t) => !t.fason && suAndakiDurus(m, t.id) !== null).length, [m]);
  const kartlar = useMemo(() => siraKartlari(m, bag), [m, bag]);
  const seciliKart = kartlar.find((k) => k.kok === kart) ?? kartlar.find((k) => k.kok === ilkKart(kartlar)) ?? null;
  useEffect(() => { if (secEmir !== null) { setKart(kartAnahtari(secEmir, bag, kokBul)); setVurgu(true); } }, [secEmir]);
  // 3330: kart açıkça seçildiyse (ilk kart kendiliğinden gösterilirken değil) tahtada o siparişin emirleri yanar, ötekiler solar. Hiçbir adımı
  // planda olmayan kartta tahta solmaz: yerleştirirken dolu yerler olduğu gibi görünür.
  const yanan = useMemo(() => { const k = !vurgu || kart === null ? undefined : kartlar.find((x) => x.kok === kart); return k && k.yerlesen > 0 ? new Set(k.emirler.map((e) => e.id)) : null; }, [vurgu, kart, kartlar]);
  // Okların açıklaması tahtada ok olabilecekken görünür: seçili iş (Seçili iş) ya da seçili sipariş veya iş (Seçili sipariş).
  const okAcik = !tur && okKipi !== 'yok' && (okKipi === 'is' ? secIs !== null : yanan !== null || secIs !== null);
  // Seçileni sığdır (F): çoklu seçim, seçili iş, seçili sipariş ya da yanan kartın planlı işleri görünür genişliğe sığar.
  const sigdir = useCallback((): void => {
    const idler = coklu.size > 1 ? [...coklu] : secIs !== null ? [secIs]
      : Object.values(m.isler).filter((x) => (secEmir !== null ? x.job === secEmir : yanan?.has(x.job) ?? false)).map((x) => x.id);
    const l = idler.map((id) => m.isler[id]).filter((x) => x !== undefined);
    if (l.length === 0) { bildir('bilgi', 'Sığdırmak için bir iş ya da sipariş seçin.'); return; }
    // Görünen saat alanı: tahtanın genişliği eksi yapışık ad sütunu ve odağın sol payı.
    const k = document.querySelector<HTMLElement>('.tc-pyq-tahta'), ad = k?.querySelector<HTMLElement>('.tc-pyq-bas')?.offsetWidth ?? 0;
    const gorunen = (k?.clientWidth ?? 0) - ad - ODAK_PAYI;
    const r = sigdirma(Math.min(...l.map((x) => x.S)), Math.max(...l.map((x) => x.C)), gorunen > 0 ? gorunen : SIGDIRMA_ENI);
    if (tahtasiz(goz)) setGoz('T');
    setSaatEni(r.px); setOlcek(yakinOlcegi(r.px)); setOdak(r.odak);
  }, [coklu, secIs, secEmir, yanan, m, bildir, goz]);
  sigdirSon.current = sigdir;
  const secimiKaldir = useCallback(() => { sec(null, null); setVurgu(false); }, [sec]);
  const kartSec = useCallback((k: string) => { if (k === kart && vurgu) secimiKaldir(); else { setKart(k); setVurgu(true); } }, [kart, vurgu, secimiKaldir]);
  // Karta bağlı değişiklikler (saha olayı, geride kalan iş) kartta sayıyla görünür.
  const kartOlayi = useMemo(() => {
    const k = new Map<string, number>();
    for (const g of degisiklikListesi) if (g.emirId !== null) k.set(kartAnahtari(g.emirId, bag, kokBul), (k.get(kartAnahtari(g.emirId, bag, kokBul)) ?? 0) + 1);
    return k;
  }, [degisiklikListesi, bag, kokBul]);
  // Seç-yerleştir ile taşıma operasyon bölümünden başlar: tahtadan ya da Matristen seçilen iş bölümü büyütmez (bakılan yer kaymasın).
  // Başka iş ya da kart seçilince düşer.
  useEffect(() => { if (secIs !== null && secIs !== tasinacak) setTasinacak(null); }, [secIs]);
  useEffect(() => { setTasinacak(null); }, [seciliKart?.kok]);
  const adimAc = useCallback((emirId: string, isId: string) => {
    // Seçili operasyona yeniden basmak seçimi bırakır.
    if (tasinacak === isId) { setTasinacak(null); sec(null, null); return; }
    setTasinacak(isId); setGoster(isId); sec(emirId, isId);
  }, [sec, tasinacak, secIs]);
  const birak = useCallback(() => { setTasinacak(null); sec(null, null); }, [sec]);

  // Emir seçilince üstüne açılan paneller kapanır: seçilen emrin satırı görünür kalsın. Liste düzeninde panel kapanmaz: açık satırın
  // operasyonuna basmak yazılmakta olan ayarı düşürmesin.
  useEffect(() => { if (secEmir !== null && klasik) setAyarAcik(false); }, [secEmir]);
  const fark = (d: (typeof DURUMLAR)[number]): string => (say[d] === ilk.current[d] ? '' : ` (${say[d] > ilk.current[d] ? '+' : '−'}${String(Math.abs(say[d] - ilk.current[d]))})`);

  // Tezgâhta sorun bildir (3335 a): tezgâh adından Duruş ve mesai o tezgâhla açılır; aynı taslak komutu ve etki akışı.
  const sorunBildir = yazabilir && !tur
    ? (tezgah: string): void => { sec(null, null); setAyarAcik(false); setSorunAdimi(null); setSorunTezgahi((x) => ({ tezgah, n: (x?.n ?? 0) + 1 })); setEngelAcik(false); setKapasiteAcik(true); }
    : null;
  // Adıma sorun bildir (3335-3b): operasyon satırından açılır; seçim durur, satır görünür kalır.
  const adimSorunu = yazabilir && !tur
    ? (isId: string): void => { setAyarAcik(false); setAyarYon(null); setKapasiteAcik(false); setSorunTezgahi(null); setEngelAcik(false); setSorunAdimi(isId); }
    : null;
  // Elle böl (3488 c): yerleşmeyen adımın satırından açılır; öteki paneller kapanır.
  const elleBolAc = yazabilir && !tur
    ? (isId: string): void => { setAyarAcik(false); setAyarYon(null); setKapasiteAcik(false); setSorunTezgahi(null); setEngelAcik(false); setSorunAdimi(null); setBolAdimi(isId); }
    : null;
  const adimEk = useMemo(() => adimEkleri(c), [c]);
  const adimBekle = useMemo(() => adimBeklemeleri(c, m.simdi), [c, m.simdi]);
  const listeKartlari = useMemo(() => kartlar.filter((k) => k.emirler.some((e) => gorunenKume.has(e.id))), [kartlar, gorunenKume]);
  // Sayfada tek birincil düğme (2155-9 a): taslak varken çubuktaki Canlıya al; yoksa açık satırın düğmesi, o da yoksa araç çubuğundaki Canlıya al.
  const satirBirincil = !taslakVar && vurgu && satirBirincilIster(listeKartlari.find((k) => k.kok === kart));
  // Açık satırın adımına basınca iş seçilir ve tezgâhlarda görünüme gelir; seçili adıma yeniden basmak bırakır.
  const listeAdimSec = useCallback((emirId: string, isId: string): void => {
    if (secIs === isId) { sec(null, null); return; }
    sec(emirId, isId); setGoster(isId);
  }, [sec, secIs]);
  // Liste düzeninde boş tahta alanına basmak açık satırı kapatmaz; tezgâha sorun bildirme ayrıntılı Kokpit'tedir.
  const listeTahtasi = (
    <>
      <Tahta
        m={m} cx={cx} goz="T" olcek={olcek} emirler={gorunen} uyar={uyar} secEmir={secEmir} secIs={secIs} sec={sec} zaman={zaman}
        tasi={yazabilir && !tur ? tasiDene : null} planaAl={yazabilir && !tur ? planaAlDene : null} once={once} gunAc={gunAc} uyari={uyarYaz} goster={goster} odak={odak} oneri={tur ? oneri : null}
        yerlestirme={tur ? null : yerHedefi} yanan={tur ? null : yanan} secimiKaldir={listedeSecimKalir}
        sorunBildir={null} onizle={tur ? null : onizle} okKipi={tur ? 'yok' : okKipi}
        coklu={coklu.size > 1 ? coklu : undefined} saatEni={saatEni} cokluSec={yazabilir && !tur ? cokluSec : null} grupKaydir={yazabilir && !tur ? grupKaydir : null} malzeme={malzeme}
      />
      <Liste m={m} cx={cx} goz="T" emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} yanan={tur ? null : yanan} sorunBildir={null} />
    </>
  );
  return (
    <div className="tc-pyq" data-goz={goz} data-duzen={klasik ? 'klasik' : 'liste'} data-sayfa={onayAcik ? 'onay' : undefined} ref={kok}>
      {!onayAcik && !klasik && (
        <div className="tc-pyq-ust tc-pyq-ust-sade">
          {tahtasiz(goz) && <button type="button" className="tc-pyq-ok" title="Sipariş listesine dön" onClick={() => { setGoz('T'); }}><Simge ad="chev-left" boyut="k" /><span>Listeye dön</span></button>}
          <span className="tc-pyq-suzgec" role="group" aria-label="Durum süzgeci">
            {DURUMLAR.map((d) => (
              <button type="button" key={d} data-d={d} aria-pressed={suz === d} onClick={() => { setSuz(suz === d ? null : d); }}><b>{say[d]}</b>{DURUM_ADI[d]}</button>
            ))}
          </span>
          <button type="button" className="tc-pyq-ok tc-pyq-engel-dugme" aria-pressed={engelAcik} data-engel-var={engelOzet.toplam > 0 ? '' : undefined}
            title="Son planda plana girmeyen adımlar ve uyarılar; nedeni ve ne yapılacağı" disabled={tur !== null || onayAcik} onClick={engelAc}>
            <Simge ad="alert" boyut="k" /><b>{engelOzet.toplam}</b><span>Engeller</span>
          </button>
          <label className="tc-pyq-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Sipariş, emir, ürün, tezgâh" aria-label="Ara" onChange={(ev) => { setAra(ev.target.value); }} /></label>
          {yazabilir && adim > 0 && <button type="button" className="tc-pyq-ok" title="Geri al (Ctrl+Z): son değişikliğiniz" disabled={mesgul} onClick={() => { geri(); }}><Simge ad="chev-left" boyut="k" /><span>Geri al</span><Sayi n={adim} /></button>}
          <Acilir ad="Diğer" etiket="Diğer" simge="wrench">
            {(kapat) => (
              <>
                {yazabilir && <button type="button" role="menuitem" disabled={c.plan === null || plansizlar.length === 0 || mesgul} onClick={() => { kapat(); void yenidenPlanla(plansizlar, `${String(plansizlar.length)} plansız emre yer verildi.`); }}><Simge ad="play" boyut="k" /><span>Plansızların hepsini planla ({plansizlar.length})</span></button>}
                <button type="button" role="menuitemcheckbox" aria-checked={butunTezgahlar} onClick={() => { kapat(); setButunTezgahlar(!butunTezgahlar); }}><Simge ad="layers" boyut="k" /><span>Bütün tezgâhları göster</span></button>
                <button type="button" role="menuitem" onClick={() => { kapat(); setGoz('M'); }}><Simge ad="layers" boyut="k" /><span>Matris</span></button>
                <button type="button" role="menuitem" onClick={() => { kapat(); setGoz('B'); }}><Simge ad="layers" boyut="k" /><span>3B</span></button>
                <button type="button" role="menuitemcheckbox" aria-checked={onceAcik} onClick={() => { kapat(); setGoz('T'); setOnceAcik(!onceAcik); }}><Simge ad="layers" boyut="k" /><span>Önce / sonra<small>Tezgâhlarda onaylı planla karşılaştır</small></span></button>
                <button type="button" role="menuitem" onClick={() => { kapat(); sec(null, null); setAyarAcik(false); setSorunTezgahi(null); setSorunAdimi(null); setEngelAcik(false); setKapasiteAcik(true); }}><Simge ad="wrench" boyut="k" /><span>Duruş ve mesai</span></button>
                <button type="button" role="menuitem" onClick={() => { kapat(); setKapasiteAcik(false); setSorunTezgahi(null); setSorunAdimi(null); setAyarYon(null); setEngelAcik(false); setAyarAcik(true); }}><Simge ad="gear" boyut="k" /><span>Ayarlar</span></button>
              </>
            )}
          </Acilir>
          {(yazabilir || canliyaAlir) && !taslakVar && (
            <Dugme className="tc-pyq-gonder" tur={engel !== null || satirBirincil ? 'ikincil' : 'birincil'} simge={canliyaAlir ? 'check' : 'upload'} disabled={mesgul} title={engel ?? undefined} onClick={() => { setOnayTaslaktan(false); setOnayAcik(true); }}>
              {canliyaAlir ? 'Canlıya al' : 'Onaya gönder'}<Sayi n={onayda} />
            </Dugme>
          )}
        </div>
      )}
      {!onayAcik && klasik && (
      <div className="tc-pyq-ust">
        <button type="button" className="tc-pyq-ok tc-pyq-sade-don" title="Sade Kokpit'e dön" onClick={() => { duzenSec(false); }}><Simge ad="chev-left" boyut="k" /><span>Sade Kokpit</span></button>
        {yazabilir && (
          <Acilir ad="Planla" etiket="Planla" simge="play" sinif="tc-pyq-planla" disabled={mesgul || tur !== null}>
            {(kapat) => {
              const pd = seciliKart ? planlaDurumu : null;
              // Kısmen planlı emir de yeniden planlanır (plana alınamaz); eksik adımları böyle yerleşir.
              const planli = seciliKart ? yenidenPlanlanacaklar(m, seciliKart) : [];
              const kismiVar = seciliKart !== null && seciliKart !== undefined && seciliKart.emirler.some((e) => kismiPlanli(m, e));
              const kartAdi = seciliKart ? seciliKart.siparis?.no ?? seciliKart.emirler[0]?.no ?? '' : '';
              // Yeniden dizme kurulmuş planın üstünde çalışır; plan yokken satırlar pasiftir ve nedenini yazar.
              const planYok = c.plan === null, PLAN_YOK = 'Henüz plan yok; önce planı kurun';
              return (
                <>
                  <div className="tc-pyq-menu-secili" role="group" aria-label="Seçili siparişi planla" data-pasif={pd ? undefined : ''}>
                    <span>Seçili siparişi planla<small>{pd ? `${pd.emirNo} · ${String(pd.adim)} adım · yönü seçin` : kismiVar ? 'Kısmen planda; eksik adımları "Seçili siparişi yeniden planla" yerleştirir' : seciliKart ? 'Zaten planlı; yeniden planlayın' : 'Önce sıradan bir sipariş seçin'}</small></span>
                    <span className="tc-pyq-menu-yon">
                      <button type="button" role="menuitem" disabled={!pd || !pd.ileriHazir} title="İlk boş saate yerleştirir" onClick={() => { kapat(); planlaIste('ileri'); }}>İleriye</button>
                      <button type="button" role="menuitem" disabled={!pd || !pd.terminVar} title={pd && !pd.terminVar ? 'Emrin termini yok; geriye yerleştirilemez.' : 'Termine yetişecek en geç saate yerleştirir'} onClick={() => { kapat(); planlaIste('geri'); }}>Teslimden geriye</button>
                    </span>
                  </div>
                  <button type="button" role="menuitem" disabled={planYok || plansizlar.length === 0} onClick={() => { kapat(); void yenidenPlanla(plansizlar, `${String(plansizlar.length)} plansız emre yer verildi.`); }}>
                    <span>Plansızların hepsini planla ({plansizlar.length})<small>{plansizlar.length === 0 ? 'Yeri olmayan emir yok' : planYok ? PLAN_YOK : 'Yeri olmayan bütün emirlere sistem yer bulur; öteki işler yerinde kalır'}</small></span>
                  </button>
                  <button type="button" role="menuitem" disabled={planYok} onClick={() => { kapat(); void yenidenPlanla(['*'], 'Bütün plan baştan kuruldu.'); }}>
                    <span>Bütün planı baştan kur<small>{planYok ? PLAN_YOK : 'Sistem hepsini yeniden dizer, plansız emirlere de yer verir; elle kilitlediğiniz yerler ve başlamış işler kalır'}</small></span>
                  </button>
                  {/* Seyrek kullanılanlar bir basışla açılır (3414): menü ilk bakışta üç iş gösterir. */}
                  <button type="button" className="tc-pyq-menu-diger-dugme" aria-expanded={digerAcik} onClick={() => { setDigerAcik(!digerAcik); }}>
                    <Simge ad={digerAcik ? 'down' : 'chev-right'} boyut="k" /><span>Diğer seçenekler</span>
                  </button>
                  <div className="tc-pyq-menu-diger" data-kapali={digerAcik ? undefined : ''}>
                    <button type="button" role="menuitem" disabled={!pd || !pd.isaretliHazir} onClick={() => { kapat(); planlaIste('isaretli'); }}>
                      <span>İşaretli adımları planla ({pd?.isaretli ?? 0})<small>{pd && pd.isaretli > 0 ? 'Tabloda tezgâh ya da saat seçtiğiniz adımlar; boş bıraktığınızı sistem doldurur' : 'İşaretli adım yok; tabloda tezgâh ya da saat seçin'}</small></span>
                    </button>
                    <button type="button" role="menuitem" disabled={planYok || planli.length === 0} onClick={() => { kapat(); void yenidenPlanla(planli, `${kartAdi} yeniden planlandı${plansizlar.length > 0 ? `; plansız ${String(plansizlar.length)} emre de yer verildi` : ''}.`); }}>
                      <span>Seçili siparişi yeniden planla<small>{planYok ? PLAN_YOK : planli.length === 0 ? (seciliKart ? 'Seçili siparişin planda yeri yok; önce planlayın' : 'Önce sıradan bir sipariş seçin') : `Sistem bu siparişin işlerini yeniden dizer; başlamış ve kilitli iş yerinde kalır.${plansizlar.length > 0 ? ` Plansız ${String(plansizlar.length)} emre de yer verilir.` : ''}`}</small></span>
                    </button>
                    <button type="button" role="menuitem" data-geride="" disabled={planYok || geride.emirler.length === 0} onClick={() => { kapat(); void yenidenPlanla(geride.emirler, `Geride kalan ${String(geride.emirler.length)} emir yeniden planlandı.`); }}>
                      <span>Geride kalanları yeniden planla ({geride.emirler.length})<small>{planYok ? PLAN_YOK : geride.emirler.length === 0 ? (geride.kilitli > 0 ? `Geride kalan ${String(geride.kilitli)} iş elle kilitli; kilidi kaldırmadan taşınmaz` : 'Geride kalan iş yok') : `Başlaması gereken saati geçmiş, başlamamış işleri sistem şimdiden sonraya dizer; sonraki adımları da kayar.${geride.kilitli > 0 ? ` Elle kilitli ${String(geride.kilitli)} iş yerinde kalır.` : ''}`}</small></span>
                    </button>
                    {/* Planı değiştiren her seçim bu menüdedir; Araçlar yalnız görünüm ve ayar taşır (iki menüde "planla" durmasın). */}
                    <b className="tc-pyq-menu-baslik" role="presentation">Tüm planın yönü</b>
                    {(['ileri', 'geri'] as const).map((y) => (
                      <button type="button" key={y} role="menuitemradio" aria-checked={planYonu(c) === y} disabled={tur !== null || onayAcik}
                        onClick={() => { kapat(); if (planYonu(c) === y) return; sec(null, null); setKapasiteAcik(false); setSorunAdimi(null); setAyarYon(y); setEngelAcik(false); setAyarAcik(true); }}>
                        <Simge ad={y === 'geri' ? 'flag' : 'chev-right'} boyut="k" /><span>Tüm plan: {YON_ADI[y]}<small>{YON_ACIKLAMASI[y]}</small></span>
                      </button>
                    ))}
                  </div>
                </>
              );
            }}
          </Acilir>
        )}
        <span className="tc-pyq-suzgec" role="group" aria-label="Durum süzgeci">
          {DURUMLAR.map((d) => (
            <button type="button" key={d} data-d={d} aria-pressed={suz === d} onClick={() => { setSuz(suz === d ? null : d); }}><b>{say[d]}</b>{DURUM_ADI[d]}{fark(d)}</button>
          ))}
        </span>
        {arizali > 0 && (
          <button type="button" className="tc-pyq-ok tc-pyq-ariza" aria-pressed={kapasiteAcik} title="Şu anda arızada ya da bakımda olan tezgâhlar; Duruş ve mesai açılır" disabled={tur !== null || onayAcik}
            onClick={() => { if (!kapasiteAcik) sec(null, null); setAyarAcik(false); setSorunTezgahi(null); setSorunAdimi(null); setEngelAcik(false); setKapasiteAcik(!kapasiteAcik); }}>
            <Simge ad="wrench" boyut="k" /><b>{arizali}</b><span>Arıza</span>
          </button>
        )}
        <button type="button" className="tc-pyq-ok tc-pyq-engel-dugme" aria-pressed={engelAcik} data-engel-var={engelOzet.toplam > 0 ? '' : undefined}
          title="Son planda plana girmeyen adımlar ve uyarılar; nedeni ve ne yapılacağı" disabled={tur !== null || onayAcik} onClick={engelAc}>
          <Simge ad="alert" boyut="k" /><b>{engelOzet.toplam}</b><span>Engeller</span>
        </button>
        <label className="tc-pyq-ara"><Simge ad="search" boyut="k" /><input type="search" value={ara} placeholder="Emir, sipariş, ürün, tezgâh" aria-label="Ara" onChange={(ev) => { setAra(ev.target.value); }} /></label>
        <span className="tc-pyq-gorunum-satiri" id="tc-pyq-gorunum" data-kapali={gorunumAcik || goz !== 'T' ? undefined : ''}>
          <span className="tc-pyq-seg" role="group" aria-label="Görünüm">
            {GOZLER.map(([k, ad]) => <button type="button" key={k} data-goz={k} aria-pressed={goz === k} onClick={() => { setGoz(k); }}>{ad}</button>)}
          </span>
          <span className="tc-pyq-seg tc-pyq-olcek" role="group" aria-label="Ölçek">
            {OLCEKLER.map(([k, ad]) => <button type="button" key={k} aria-pressed={olcek === k} onClick={() => { olcekSec(k); }}>{ad}</button>)}
            <input
              type="range" className="tc-pyq-yakin" min={0} max={100} step={1} aria-label="Yakınlaştırma" title="Yakınlaştırma (Ctrl + tekerlek)"
              value={surguDegeri(simdikiEn)} disabled={uzakMi(olcek)} onChange={(ev) => { yakinlas(surgudenEn(Number(ev.target.value))); }}
            />
            <button type="button" aria-label="Seçileni sığdır" title="Seçileni sığdır (F)" onClick={sigdir}><Simge ad="fit" boyut="k" /></button>
          </span>
        </span>
        <span className="tc-pyq-gi" role="group" aria-label="Geri ve İleri">
          <button type="button" className="tc-pyq-ok" title="Geri al (Ctrl+Z): son değişikliğiniz" disabled={!yazabilir || mesgul || tur !== null || adim === 0} onClick={() => { geri(); }}><Simge ad="chev-left" boyut="k" /><span>Geri</span><Sayi n={adim} /></button>
          {/* İleri yalnız geri alınmış değişiklik varken görünür: araç satırı dar ekranda kalabalıklaşmasın. */}
          {ileriAdim > 0 && <button type="button" className="tc-pyq-ok" title="İleri (Ctrl+Y): geri alınan değişikliği yeniden yapar" disabled={!yazabilir || mesgul || tur !== null} onClick={() => { ileri(); }}><span>İleri</span><Simge ad="chev-right" boyut="k" /><Sayi n={ileriAdim} /></button>}
        </span>
        {sirada > 0 && <span className="tc-pyq-sirada" role="status">{sirada} taşıma sırada</span>}
        {coklu.size > 1 && <span className="tc-pyq-sirada" role="status">{coklu.size} iş seçili · birlikte kayar</span>}
        {TUR_ACIK && <Dugme simge="route" className="tc-pyq-tur-dugme" onClick={turBaslat} disabled={tur !== null}>Sorunları sırayla çöz</Dugme>}
        <button type="button" className="tc-pyq-ok tc-pyq-gorunum-dugme" aria-expanded={gorunumAcik || goz !== 'T'} aria-controls="tc-pyq-gorunum" title="Görünüm ve ölçek seçenekleri" disabled={goz !== 'T'} onClick={() => { setGorunumAcik(!gorunumAcik); }}>
          <Simge ad="layers" boyut="k" /><span>Görünüm</span>
        </button>
        <Acilir ad="Araçlar" etiket="Araçlar" simge="wrench" etkin={onceAcik || ayarAcik || kapasiteAcik}>
          {(kapat) => (
            <>
              <button type="button" role="menuitemcheckbox" aria-checked={onceAcik} title="Onaylı planla karşılaştır (B)" onClick={() => { kapat(); setOnceAcik(!onceAcik); }}><Simge ad="layers" boyut="k" /><span>Önce / sonra</span></button>
              {([['is', 'Oklar: seçili iş', 'Üstüne gelinen ya da seçili işin önceki ve sonraki adımı'], ['siparis', 'Oklar: seçili sipariş', 'Seçili siparişin bütün adımları'], ['yok', 'Oklar kapalı', 'Bağ oku çizilmez']] as const).map(([k, ad, aciklama]) => (
                <button type="button" key={k} role="menuitemradio" aria-checked={okKipi === k} onClick={() => { kapat(); setOkKipi(k); }}><Simge ad="route" boyut="k" /><span>{ad}<small>{aciklama}</small></span></button>
              ))}
              <button type="button" role="menuitemcheckbox" aria-checked={kapasiteAcik} title="Tezgâhın arıza, bakım ve ek mesaisi" disabled={tur !== null || onayAcik}
                onClick={() => { kapat(); if (!kapasiteAcik) sec(null, null); setAyarAcik(false); setSorunTezgahi(null); setSorunAdimi(null); setEngelAcik(false); setKapasiteAcik(!kapasiteAcik); }}><Simge ad="wrench" boyut="k" /><span>Duruş ve mesai</span></button>
              <button type="button" role="menuitemcheckbox" aria-checked={ayarAcik} title="Plan ayarları" disabled={tur !== null || onayAcik}
                onClick={() => { kapat(); if (!ayarAcik) sec(null, null); setKapasiteAcik(false); setSorunAdimi(null); setAyarYon(null); setEngelAcik(false); setAyarAcik(!ayarAcik); }}><Simge ad="gear" boyut="k" /><span>Ayarlar</span></button>
            </>
          )}
        </Acilir>
        {/* Taslak varken canlıya alma taslak çubuğundaki tek düğmeyle yapılır (3282-5 a); burada ikinci aynı adlı düğme durmaz. */}
        {(yazabilir || canliyaAlir) && !taslakVar && (
          <Dugme className="tc-pyq-gonder" tur={tur || engel !== null || ayarAcik || onayAcik ? 'ikincil' : 'birincil'} simge={canliyaAlir ? 'check' : 'upload'} aria-pressed={onayAcik}
            disabled={mesgul || tur !== null} title={tur ? 'Tur bitince açılır' : engel ?? undefined} onClick={() => { setOnayTaslaktan(false); setOnayAcik(!onayAcik); }}>
            {canliyaAlir ? 'Canlıya al' : 'Onaya gönder'}<Sayi n={onayda} />
          </Dugme>
        )}
      </div>
      )}
      {!onayAcik && klasik && yazabilir && !tur && (
        <Yol
          m={m} p={p} kart={seciliKart} vurgu={vurgu} zaman={zaman} pd={seciliKart ? planlaDurumu : null} plansiz={plansizlar.length} taslakVar={taslakVar} mesgul={mesgul}
          malzemeBekleyen={malzeme?.bekleyen} oner={(y) => { if (seciliKart) { setKart(seciliKart.kok); setVurgu(true); } planlaIste(y); }} hamle={hamleUygula} surum={surum}
          eksikPlanla={() => { if (seciliKart) void yenidenPlanla(eksikPlanlanacaklar(m, seciliKart), `${seciliKart.siparis?.no ?? seciliKart.emirler[0]?.no ?? ''}: eksik adımlar planlandı.`); }}
          hepsiniPlanla={() => { void yenidenPlanla(plansizlar, `${String(plansizlar.length)} plansız emre yer verildi.`); }}
          yenidenPlanla={() => { if (seciliKart) void yenidenPlanla(seciliKart.emirler.filter((e) => e.durum !== 'plansiz').map((e) => e.id), `${seciliKart.siparis?.no ?? seciliKart.emirler[0]?.no ?? ''} yeniden planlandı.`); }}
          onayaGec={() => { sec(null, null); setAyarAcik(false); setSorunAdimi(null); setOnayTaslaktan(true); setOnayAcik(true); }}
        />
      )}
      {taslak && !onayAcik && (
        <TaslakCubugu
          taslak={taslak} canliyaAlir={canliyaAlir} kilit={tur ? 'Tur bitince açılır' : ayarEtkisi ? 'Önce ayarı planlayın ya da vazgeçin.' : null} yazildi={(ileti) => { bildir('bilgi', ileti); yenile(); }}
          onayiAc={() => { sec(null, null); setAyarAcik(false); setSorunAdimi(null); setOnayTaslaktan(true); setOnayAcik(true); }}
          ozet={DURUMLAR.map((d) => <span key={d} data-d={d}>{DURUM_ADI[d]} {ilk.current[d]} → {say[d]}</span>)}
        />
      )}
      {onayAcik ? (
        <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
          <KokpitOnay o={o} c={c} p={p} taslakYazildi={onayTaslaktan} kapat={() => { setOnayTaslaktan(false); setOnayAcik(false); }} />
        </Suspense>
      ) : !klasik ? (
        <div className="tc-pyq-govde">
        <div className="tc-pyq-ana">
          {goz === 'B' ? (
            <section className="tc-pyq-bolum tc-pyq-bolum-plan" aria-label="3B">
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <Kokpit3B
                  m={m} cx={cx} once={canli.tur === 'tamam' ? canli.canli : null} onceDurumu={canli.tur === 'tamam' ? 'tamam' : canli.tur === 'hata' ? 'hata' : 'okunuyor'}
                  emirler={gorunen} secEmir={secEmir} zaman={zaman} sec={sec} matriseGec={() => { setGoz('M'); }}
                />
              </Suspense>
            </section>
          ) : goz === 'M' ? (
            <section className="tc-pyq-bolum tc-pyq-bolum-plan" aria-label="Matris">
              <Matris m={m} cx={cx} duzen={duzen} duzenSec={setDuzen} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} gecSuz={() => { setSuz('gec'); }} />
            </section>
          ) : (
            <>
          <ListeDuzeni
            m={m} p={p} kartlar={listeKartlari} acik={vurgu ? kart : null} zaman={zaman} mesgul={mesgul} hamle={yazabilir ? hamleUygula : null} surum={surum} malzemeBekleyen={malzeme?.bekleyen}
            ac={(k) => { if (k === null) secimiKaldir(); else { sec(null, null); setKart(k); setVurgu(true); } }}
            planla={yazabilir && c.plan !== null ? (k) => { void yenidenPlanla(k.emirler.filter((e) => e.durum === 'plansiz').map((e) => e.id), `${k.siparis?.no ?? k.emirler[0]?.no ?? ''} planlandı.`); } : null}
            yenidenPlanla={yazabilir && c.plan !== null ? (k) => { void yenidenPlanla(k.emirler.map((e) => e.id), `${k.siparis?.no ?? k.emirler[0]?.no ?? ''} yeniden planlandı.`); } : null}
            tahta={listeTahtasi} satirBirincil={satirBirincil} adimSec={listeAdimSec} seciliIs={secIs}
            tasi={yazabilir && !tur ? tasiDene : null} bol={elleBolAc} malzemeAni={malzemeAni} hedef={setYerHedefi} secimiBirak={() => { sec(null, null); }}
          />
          {butunTezgahlar && !vurgu && <section className="tc-pyq-bolum tc-pyq-bolum-plan" aria-label="Tezgâhlar"><h2>Tezgâhlar</h2>{listeTahtasi}</section>}
            </>
          )}
        </div>
        {sorunAdimi !== null ? null : ayarAcik ? (
          <Ayarlar key={ayarYon ?? ''} c={c} taslak={taslak} yazabilir={yazabilir} kim={o.depo.ben?.kisi.ad ?? ''} yon={ayarYon} etkiBekliyor={setAyarEtkisi} motorYazabilir={o.yetki.islemVar('plan.motor-ayari')} motorDegisti={o.yenile} kapat={() => { setAyarAcik(false); setAyarYon(null); }} />
        ) : kapasiteAcik ? (
          <Kapasite c={c} m={m} taslak={taslak} yazabilir={yazabilir} zaman={zaman} istenen={sorunTezgahi} kapat={() => { setKapasiteAcik(false); setSorunTezgahi(null); }} />
        ) : engelAcik ? (
          <Engeller gruplar={engelGruplari} ozet={engelOzet} ufukSonu={zaman(ufukSonu)} kapat={() => { setEngelAcik(false); }}
            emirGoster={(e) => { setEngelAcik(false); sec(e, null); }} mesaiAc={() => { setEngelAcik(false); setKapasiteAcik(true); }} acabilir={yetki.islemVar} />
        ) : bolAdimi !== null ? (
          <ElleBol key={bolAdimi} c={c} m={m} isId={bolAdimi} taslak={taslak} yazabilir={yazabilir} kapat={() => { setBolAdimi(null); }} />
        ) : null}
        </div>
      ) : (
      <div className="tc-pyq-govde">
        <div className="tc-pyq-ana">
          <SiraSeridi
            kartlar={kartlar} secili={seciliKart?.kok ?? null} sec={kartSec} zaman={zaman} olay={kartOlayi} bagVar={bag !== null}
          />
          {seciliKart && (
            <EmirAdimlari
              firma={firma} plan={p}
              key={seciliKart.kok} m={m} kart={seciliKart} zaman={zaman} uygula={tur ? null : hamleUygula} surum={surum} adimAc={adimAc}
              hedef={setYerHedefi} taslakVar={taslakVar} yon={{ c, taslak, yazabilir }} vurgu={secIs} neden={tahtasiz(goz)}
              secIs={tasinacak} tasi={yazabilir && !tur ? tasiDene : null} birak={birak}
              saatGirdisi={saatGirdisi} planla={planla} planlaDurumu={setPlanlaDurumu} adimSorunu={adimSorunu} adimEk={adimEk} adimBekle={adimBekle} malzeme={malzeme}
            />
          )}
          <section className="tc-pyq-bolum tc-pyq-bolum-plan" aria-label={BOLUM_ADI[goz]}>
            <h2><b className="tc-pyq-bolum-no">3</b>{BOLUM_ADI[goz]}</h2>
            {goz === 'B' ? (
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <Kokpit3B
                  m={m} cx={cx} once={canli.tur === 'tamam' ? canli.canli : null} onceDurumu={canli.tur === 'tamam' ? 'tamam' : canli.tur === 'hata' ? 'hata' : 'okunuyor'}
                  emirler={gorunen} secEmir={secEmir} zaman={zaman} sec={sec} matriseGec={() => { setGoz('M'); }}
                />
              </Suspense>
            ) : goz === 'M' ? (
              <Matris m={m} cx={cx} duzen={duzen} duzenSec={setDuzen} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} gecSuz={() => { setSuz('gec'); }} />
            ) : (
              <>
                <Tahta
                  m={m} cx={cx} goz={goz} olcek={olcek} emirler={gorunen} uyar={uyar} secEmir={secEmir} secIs={secIs} sec={sec} zaman={zaman}
                  tasi={yazabilir && !tur ? tasiDene : null} planaAl={yazabilir && !tur ? planaAlDene : null} once={once} gunAc={gunAc} uyari={uyarYaz} goster={goster} odak={odak} oneri={tur ? oneri : null}
                  yerlestirme={tur ? null : yerHedefi} yanan={tur ? null : yanan} secimiKaldir={secimiKaldir}
                  sorunBildir={sorunBildir} onizle={tur ? null : onizle} okKipi={tur ? 'yok' : okKipi}
                  coklu={coklu.size > 1 ? coklu : undefined} saatEni={saatEni} cokluSec={yazabilir && !tur ? cokluSec : null} grupKaydir={yazabilir && !tur ? grupKaydir : null} malzeme={malzeme}
                />
                <Liste m={m} cx={cx} goz={goz} emirler={gorunen} secEmir={secEmir} secIs={secIs} zaman={zaman} sec={sec} yanan={tur ? null : yanan} sorunBildir={sorunBildir} />
                <ul className="tc-pyq-aciklama" aria-label="Renk açıklaması">
                  <li><i />Planlı iş</li><li><i data-t="gec" />Geç emrin işi</li><li><i data-t="ilk" />En erken boş yer (basın)</li><li><i data-t="bos" />Boş yer (basın)</li><li><i data-t="kapali" />Kapalı saat, duruş</li><li data-aciklama="malzeme"><i data-t="malzeme" />Malzeme bekleniyor</li>
                  {okAcik && <><li data-ok-aciklama=""><i data-t="ok-b" />Önceki adım bitince başlar</li><li data-ok-aciklama=""><i data-t="ok-o" />Örtüşmeli: önceki bitmeden başlayabilir</li></>}
                </ul>
              </>
            )}
          </section>
        </div>
        {tur ? (
          <Tur
            m={m} tur={tur} e={turEmri} zaman={zaman} uygula={hamleUygula} oneri={setOneri} surum={surum} mesgul={mesgul}
            oynat={oynuyor ? oynatKarar : null} oynatAc={yazabilir ? () => { setOynuyor(true); } : null} oynatDur={() => { setOynuyor(false); }}
            atla={() => { turKarar(false); }} onceki={turOnceki} sonraki={turSonraki} bitir={turBitir} vazgec={turVazgec}
          />
        ) : sorunAdimi !== null ? (
          <AdimSorunu key={sorunAdimi} c={c} m={m} isId={sorunAdimi} taslak={taslak} yazabilir={yazabilir} zaman={zaman} kapat={() => { setSorunAdimi(null); }} />
        ) : ayarAcik ? (
          <Ayarlar key={ayarYon ?? ''} c={c} taslak={taslak} yazabilir={yazabilir} kim={o.depo.ben?.kisi.ad ?? ''} yon={ayarYon} etkiBekliyor={setAyarEtkisi} motorYazabilir={o.yetki.islemVar('plan.motor-ayari')} motorDegisti={o.yenile} kapat={() => { setAyarAcik(false); setAyarYon(null); }} />
        ) : kapasiteAcik ? (
          <Kapasite c={c} m={m} taslak={taslak} yazabilir={yazabilir} zaman={zaman} istenen={sorunTezgahi} kapat={() => { setKapasiteAcik(false); setSorunTezgahi(null); }} />
        ) : engelAcik ? (
          <Engeller gruplar={engelGruplari} ozet={engelOzet} ufukSonu={zaman(ufukSonu)} kapat={() => { setEngelAcik(false); }}
            emirGoster={(e) => { setEngelAcik(false); sec(e, null); }} mesaiAc={() => { setEngelAcik(false); setKapasiteAcik(true); }} acabilir={yetki.islemVar} />
        ) : bolAdimi !== null ? (
          <ElleBol key={bolAdimi} c={c} m={m} isId={bolAdimi} taslak={taslak} yazabilir={yazabilir} kapat={() => { setBolAdimi(null); }} />
        ) : null}
      </div>
      )}
      {yuva.satir && createPortal(<DegisiklikOzeti l={degisiklikListesi} acik={degisiklikAcik} ac={setDegisiklikAcik} />, yuva.satir)}
      {yuva.alt && degisiklikAcik && degisiklikListesi.length > 0 && createPortal(
        <Degisiklikler
          l={degisiklikListesi} goster={degisiklikGoster} suzgec={degisiklikSuzgeci} suzgecKoy={setDegisiklikSuzgeci}
          kart={seciliKart ? { ad: seciliKart.siparis?.no ?? seciliKart.emirler[0]?.no ?? seciliKart.kok, emirler: new Set(seciliKart.emirler.map((e) => e.id)) } : null}
          toplu={yetki.planYaz && komut !== null && ortakBekleyen.length > 0 ? ortakBekleyen.length : null}
          etki={satirEtkisi} taslakta={ortakBekleyen.length - bekleyenDegisiklikler.length}
        />, yuva.alt)}
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.dugme ?? ''}
        vazgec={() => { setOnay(null); }}
        onayla={() => { const x = onay; setOnay(null); if (x) void yaz(x.aday, x.yonGeri === true).then((tamam) => { if (tamam && x.turda) turKarar(true); }); }}
      >{onay?.ileti}</OnayPenceresi>
    </div>
  );
}
