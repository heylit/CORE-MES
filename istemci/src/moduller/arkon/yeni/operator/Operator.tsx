import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dugme, KodOkuyucu, OzetKatmani, Pencere, Rozet, Sekmeler, Simge, TusTakimi, useBildirim, type BildirimTonu,
} from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useTema } from '../../../../ortak/veri/tema.ts';
import { CAGRI_GERIYE_MS, acikCagri, cagriyiKur, type CagriSatiri } from '../../../../../../arkon/web/src/data/acik-cagri.ts';
import { baslatmaUyarisi, uyariliBaslatmaIletisi } from '../../../../../../arkon/web/src/data/baslatma-uyarisi.ts';
import {
  baslatmaGeriAlma, baslatmaGeriUygula, durumEsitle, durumEsitleme, durumIletisi, geriAlinacakIs, sayimGeriAlma, sayimGeriUygula, sayimKapaliNedeni,
  type DurumEsitleme,
} from '../../../../../../arkon/web/src/data/biten-is.ts';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../../../../../../arkon/web/src/data/cakisma.ts';
import { eskiCizim, eskiCizimGorevi, type MerkezDosyasi } from '../../../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import { hazirlikUyarisi } from '../../../../../../arkon/web/src/data/cnc-hazirlik.ts';
import { durumBaslangici, durumKaydiGerekir } from '../../../../../../arkon/web/src/data/durum-kaydi.ts';
import { IS_DEGISIMI, nedenAdi as nedenAdiYaz } from '../../../../../../arkon/web/src/data/durus-nedeni.ts';
import { EMIR_SEC_OLAYI, emirSeciminiAl, emirSirasi, kartSeciminiAl, type EmirSecimiPenceresi } from '../../../../../../arkon/web/src/data/emir-secimi.ts';
import { ILETI_GITMEDI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import {
  ILK_PARCA_ONCE_SAY_ILETISI, ilkParcaKarari, ilkParcaSayimReddi, kaliteMerkeziNumuneYamasi, kararBekleyenSayisi, yenidenIlkParcaAcik, yenidenIlkParcaTabani,
} from '../../../../../../arkon/web/src/data/ilk-parca.ts';
import { gecisteDuraklatilacaklar, oneAlinanSuruyor, siraAnahtari, yeniOneAlinan } from '../../../../../../arkon/web/src/data/is-gecisi.ts';
import { ilkAcilis, secilebilirIstasyonlar } from '../../../../../../arkon/web/src/data/istasyon-sec.ts';
import { elleNumuneOlculeri } from '../../../../../../arkon/web/src/data/kontrol-plani.ts';
import { saatMetni } from '../../../../../../arkon/web/src/data/buyuk-ekran.ts';
import {
  AYRIM_YENILEME_MS, ayrimAciklamasi, kayittakiMakineler, kilitsizSecim, makineAyrimi, makineSecimiGorunur, seciliMakineler, secimOzeti, secimiDegistir,
  type MakineAyrimlari,
} from '../../../../../../arkon/web/src/data/makine-secimi.ts';
import { retGerekcesiMetni, sonNumuneDurumu, yeniNumuneYamasi } from '../../../../../../arkon/web/src/data/numune.ts';
import { kalanMetni, vardiyaKalanDk, vardiyaUretimi } from '../../../../../../arkon/web/src/data/operator-ozeti.ts';
import { otomatikNumuneOlculeri } from '../../../../../../arkon/web/src/data/otomatik-numune.ts';
import { KART_YENILEME_MS, kartEmirleri, refakatIsi, sayimKartAlani, type RefakatKarti } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import type { HataliCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { hataliAdet } from '../../../../../../arkon/web/src/data/hatali-adet.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { operatoreAcik } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { durusNedeni, planliNedenMi } from '../cekirdek/ayarlar.ts';
import { GUN_ADLARI, basHarfler, iki, sayi } from '../cekirdek/bicim.ts';
import { CAGRI_EKIPLERI, YETKI_ADLARI } from '../cekirdek/sabitler.ts';
import { bip } from '../cekirdek/ses.ts';
import { istasyonBul, istasyonListesi, tabletIstasyonu } from '../cekirdek/tesis.ts';
import type { Perm } from '../cekirdek/tipler.ts';
import { isMerkezinde } from '../cekirdek/yetki.ts';
import { anlikVardiya, durusPencereleri, siradakiDurus, suankiDurus } from '../cekirdek/vardiya.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { BaglantiDurumu } from '../ortak/BaglantiDurumu.tsx';
import type { ResimNotu, TeknikResimKontrolu } from '../cizim/index.tsx';
import type { ArkonEkranOzellikleri, ArkonSayfasi } from '../sayfalar.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import type { Ileti } from '../veri/depo.ts';
import {
  IS_TURLERI, ISTASYON_PANELLERI, IstasyonSecici, SEVIYELER, TakimKarti, UyariPenceresi, isKurallari, istasyonAyari, isTuru,
  OLCENLER, numuneEtiketi, numuneOlculeri, numunePlani, sinirYakin, type IstasyonKaydi, type PanelArayuzu, type Uyari,
} from '../hazirlik/index.tsx';
import { Adimlar } from './Adimlar.tsx';
import { Analiz } from './Analiz.tsx';
import { useDarEkran, useMerkezUyarilari, useVardiyaKaydi } from './kancalar.ts';
import { KART_DEGIL_ILETISI, KART_YOK_ILETISI, terminalOkutmasi, useElOkuyucu } from './el-okuyucu.ts';
import {
  DURUM_ILETISI, DURUM_SIMGESI, EYLEM_DURUMU, URETIM_EYLEMLERI, baslangicUyarilari, bosIs, durusOnerileri, eksikTakimTabanlari, hazirlikSayisi,
  ilkParcaKalemleri, ilkParcaKapisi, isSekmeleri, kararOzeti, kontrolTakvimi, mobilGorunumler, numuneAraligi, paketleriBirlestir, siradakiGorev, simgeSec,
  sonucBelgesi, takimUyarilari, tonAdi, uyariAnahtari, vardiyaHesabi, vardiyaOzeti, zamaniGelenUyarilar, hurdaUyarisi, kaliteYuzdesi,
  type EkranSekmesi,
} from './kurallar.ts';
import {
  CagriCipi, DurumDugmeleri, EtkinKart, GorevKarti, IsAlanlari, IsEtiketleri, IsOzeti, IsKuyrugu, Konfeti, NumuneSeridi, PlanBandi, SayacKadrani, SayimTuslari,
  TopluGiris, type CevrimOlcer, type SayimTusu,
} from './Parcalar.tsx';
import {
  IsEylemi, IsOnizKarti, IstasyonEylemi, IstasyonKarti, MakineEylemi, MakineKarti, TerminalCarki, type CarkMakinesi, type CarkSeridi,
} from './Cark.tsx';
import { DurumSuresi } from './DurumSuresi.tsx';
import {
  CagriPenceresi, CagriTakibi, DurusPenceresi, GecisPenceresi, HataliPenceresi, HurdaPenceresi, NumunePenceresi, SonrakiHazirlik, VardiyaPenceresi, hataliIstegi,
  type HataliGirdisi,
} from './Pencereler.tsx';
import { KaliteGorunumu } from './KaliteGorunumu.tsx';
import { Ozetim, ozetimGorunur } from './Ozetim.tsx';
import { EylemCubugu } from './EylemCubugu.tsx';
import { MalzemeCipi } from './MalzemeCipi.tsx';
import { Sepetler, cikanSepetiniAc } from './Sepetler.tsx';
import { UzakMod } from './UzakMod.tsx';
import { baytiVar, useCozulmus } from '../veri/dosyalar.ts';
import type { Cagri, DurumParcasi, Gorev, GorevEylemi, Is, KontrolTakvimi, Meas, Pkg, Result, SampleRequest, Ton } from './tipler.ts';
import './operator.css';

// Teknik resim (A5) ve ölçü aleti seçimi (A4) ağırdır; resim sekmesi açılınca yüklenir.
const TeknikResim = lazy(async () => ({ default: (await import('../cizim/index.tsx')).TeknikResim }));
const AletSecici = lazy(async () => {
  const { AletSecimi } = await import('../kalite/index.tsx');
  return { default: function AletSecici({ aletler, tool }: { aletler: Parameters<typeof AletSecimi>[0]['aletler']; tool: string | undefined }) { return <AletSecimi aletler={aletler} tool={tool} />; } };
});
// Baytı gelmemiş dosya kaydı resimde açılamaz; görüntüleyici onu atlar.
const baytli = (l: readonly NonNullable<Is['pkg']>['files'][number][]): TeknikResimKontrolu['dosyalar'] =>
  l.filter((f): f is TeknikResimKontrolu['dosyalar'][number] => baytiVar(f.bytes));

// Üretim Terminali (operator.ts App) ve "Operatör gözüyle" önizleme. Davranış eski ekranın aynısıdır; farklar DEVIR'dedir.
// Açılışta kayıt yazılmaz: sonuç ve durum kaydı yalnız operatörün ya da makinenin değiştirdiği işte gider. Önizlemede yazma düğmesi yoktur.

type Pencereler = 'station' | 'numune' | 'scrap' | 'reason' | 'num' | 'call' | 'calltrack' | 'prepnext' | 'shift' | 'ozetim' | 'done' | 'menu' | 'gecis' | 'toplu' | 'isler';
type Gorunum = EkranSekmesi['id'];
interface UyariGosterimi { list: Uyari[]; title?: string; then?: () => void }
interface Okutma { baslik: string; ipucu?: string; okundu: (kod: string) => void }
interface Devir { note: string; by: string; at: number }
interface Ek { undo?: () => void; action?: { l: string; fn: () => void } }

const BOS_TAKVIM: KontrolTakvimi = { due: [], next: null, who: {}, why: {} };
const YAZAN: ReadonlySet<GorevEylemi> = new Set<GorevEylemi>(['start', 'resume', 'restart', 'pause', 'setup', 'stop', 'finish', 'tool', 'sample', 'next', 'call']);

export function Operator(_o: ArkonEkranOzellikleri) { return <IstasyonluEkran onizleme={null} />; }
export function Onizleme({ kimlik }: ArkonEkranOzellikleri) { return <IstasyonluEkran onizleme={kimlik ?? ''} />; }

// İstasyon değişince ekran baştan kurulur (eski ekran sayfayı yeniden yüklüyordu).
function IstasyonluEkran({ onizleme }: { onizleme: string | null }) {
  const [surum, surumYaz] = useState(0);
  return <OperatorEkrani key={surum} onizleme={onizleme} yenidenKur={() => surumYaz((s) => s + 1)} />;
}

function OperatorEkrani({ onizleme, yenidenKur }: { onizleme: string | null; yenidenKur: () => void }) {
  const { depo, kisi, ayarlar, yetkiVar, git, acilabilir } = useArkon();
  const { tema, degistir: temaDegistir } = useTema();
  const { bildir } = useBildirim();
  const dar = useDarEkran();
  const pv = onizleme !== null;
  const tesis = ayarlar.tesis;
  const POLICY = ayarlar.kurallar;
  const ME = kisi?.name ?? '';
  const MACHINE = pv ? (yerel.oku<string>('pvStation') || tabletIstasyonu(tesis, yerel.oku<string>('station'), kisi)) : tabletIstasyonu(tesis, yerel.oku<string>('station'), kisi);
  const ist = istasyonBul(tesis, MACHINE);
  const uretir = !pv && yetkiVar('prod.run');
  const duzeltir = !pv && yetkiVar('prod.fix');
  const istasyonTableti = () => !!yerel.oku<string>('station') && yetkiVar('prod.run');
  const ozetVar = !pv && ozetimGorunur(kisi);
  const nedenAdiOku = useCallback((k: string) => durusNedeni(ayarlar, k)?.l ?? null, [ayarlar]);
  const planliMi = useCallback((k: string | null | undefined) => planliNedenMi(ayarlar, k), [ayarlar]);

  // Telefonda terminal işle açılır (618); Özetim alt gezinmede bir dokunuşta.
  const [mv, mvYaz] = useState<Gorunum>(() => (ozetVar && !dar ? 'ozet' : 'prod'));
  const [isAcik, isAcikYaz] = useState(false);
  const [isler, islerYaz] = useState<Is[]>([]);
  const [ai, aiYaz] = useState(0);
  const aiRef = useRef(0);
  aiRef.current = ai;
  const o: Is = isler[ai] || isler[0] || bosIs(ist);
  // 790: çarkta bakılan iş (önizleme). Yalnız ekranı gösterir; sayaç, eylem ve kayıt ekrandaki işe (o) yazılır.
  const [bakilan, bakilanYaz] = useState<string | null>(null);
  const [makBak, makBakYaz] = useState(0);
  const [istBak, istBakYaz] = useState<number | null>(null);
  useEffect(() => { bakilanYaz(null); }, [ai, MACHINE]);
  const bi = bakilan === null ? -1 : isler.findIndex((x) => siraAnahtari(x) === bakilan);
  const b: Is | null = bi >= 0 && bi !== ai ? isler[bi]! : null;
  const bakYaz = (i: number) => { const x = isler[i]; bakilanYaz(!x || i === ai ? null : siraAnahtari(x)); };
  const curMc = () => (o.pkg && o.pkg.mc) || (ist.mcs.length === 1 ? ist.mcs[0]!.id : null);
  const [mcSel, mcSelYaz] = useState<string[]>([]);
  // Bu durumda geçen sürenin başlangıcı; null: bilinmiyor ("—"). Yereldeki kayıt yalnız aynı işin aynı durumu içinse ön değerdir.
  const [since, sinceYaz] = useState<number | null>(() => {
    const l = yerel.oku<{ no?: string; anahtar?: string; state?: string; at?: number | null }>(`lastState:${MACHINE}`);
    return l && typeof l.at === 'number' && (l.anahtar ?? l.no) === siraAnahtari(o) && l.state === o.state ? l.at : null;
  });
  const [tab, tabYaz] = useState<Gorunum>('draw');
  const [odak, odakYaz] = useState<{ id: number; n: number } | null>(null);
  const [odakKipi, odakKipiYaz] = useState(false);
  const [ov, ovYaz] = useState<Pencereler | null>(null);
  const [segs, segsYaz] = useState<DurumParcasi[]>([]);
  const [away, awayYaz] = useState(false);
  const [call, callYaz] = useState<Cagri | null>(null);
  const [callLog, callLogYaz] = useState<{ k: string; ms: number }[]>([]);
  const [handover, handoverYaz] = useState<Devir | null>(null);
  const [snooze, snoozeYaz] = useState<Record<string, number>>({});
  const [warnShow, warnShowYaz] = useState<UyariGosterimi | null>(null);
  const [scan, scanYaz] = useState<Okutma | null>(null);
  const shiftRef = useRef({ good: 0, scrap: 0, mOk: 0, mNok: 0, hatali: 0 });
  const scrapLog = useRef<number[]>([]);
  const lastAct = useRef(Date.now());
  const simdi = useSimdi(1000);
  const SL = useVardiyaKaydi(MACHINE, pv);
  const ortam = useMemo(() => ({ planliMi, durusPencereleri: (f: number, t: number) => durusPencereleri(MACHINE, f, t, ayarlar.planliDuruslar, tesis) }), [planliMi, MACHINE, ayarlar.planliDuruslar, tesis]);
  const ceyrek = Math.floor(simdi / 15000);
  // eslint olmayan bağımlılık: hesap 15 saniyede bir tazelenir (eski ekran gibi).
  const SC = useMemo(() => vardiyaHesabi(SL, Date.now(), ortam), [SL, ortam, ceyrek]);
  const shiftNow = Math.min(480, 312 + (simdi - (since ?? simdi)) / 60000);
  const vardiya = anlikVardiya(simdi, ayarlar.vardiyalar, ayarlar.tatiller);

  /* bildirimler: tek bildirim düzeninde en son bildirimin "Geri al"ı geçerlidir (eskisi gibi yeni ileti eskisinin yerini alır) */
  const sonBildirim = useRef(0);
  const say = useCallback((m: string, _simge: SimgeAdi = 'check', ton: Ton = 'run', ek?: Ek) => {
    const no = ++sonBildirim.current;
    const tur: BildirimTonu = ek?.undo ? (ton === 'run' ? 'tamam' : 'bilgi') : ton === 'stop' ? 'hata' : ton === 'run' ? 'tamam' : 'bilgi';
    if (ek?.undo) {
      const geri = ek.undo;
      bildir(tur, m, { eylem: { etiket: 'Geri al', yap: () => { if (no === sonBildirim.current) geri(); else bildir('bilgi', 'Bu işlem artık geri alınamaz; sonraki işlem kaydedildi.'); } } });
    } else if (ek?.action) {
      const a = ek.action;
      bildir(tur, m, { eylem: { etiket: a.l, yap: a.fn } });
    } else bildir(tur, m);
  }, [bildir]);
  const sayRef = useRef(say);
  sayRef.current = say;
  useEffect(() => {
    const f = (e: Event) => sayRef.current((e as CustomEvent<{ msg?: string }>).detail?.msg || CAKISMA_ILETISI, 'alert', 'hold');
    window.addEventListener(CAKISMA_OLAYI, f);
    return () => window.removeEventListener(CAKISMA_OLAYI, f);
  }, []);

  // İlk açılış: bu tablet hangi istasyonda? Kayıtlı değilse ve kişinin istasyonu yoksa sorulur.
  useEffect(() => {
    if (pv || !istasyonListesi(tesis).length) return;
    const k = ilkAcilis(yerel.oku<string>('station'), kisi?.st, MACHINE, yetkiVar('prod.run'));
    if (k === 'kaydet') yerel.yaz('station', MACHINE);
    else if (k === 'sor') ovYaz('station');
  }, []); // eslint olmayan bağımlılık: yalnız ilk açılışta

  /* 393 d: seçici açıkken emrin makine ayrımları sunucudan okunur; okunamazsa null ve seçici bugünkü gibidir (son söz başlatmada) */
  const [ayrim, ayrimYaz] = useState<MakineAyrimlari | null>(null);
  const ayrimEmri = tmiEmirId(o.pkg);
  const seciciAcik = !pv && !o.empty && yetkiVar('prod.run') && ist.mcs.length >= 2 && o.state !== 'running';
  useEffect(() => {
    ayrimYaz(null);
    if (!seciciAcik || ayrimEmri === null) return;
    let bitti = false;
    const oku = () => depo.Server.makineAyrimlari(ayrimEmri).then((c) => { if (!bitti) ayrimYaz(c || null); }, () => { if (!bitti) ayrimYaz(null); });
    void oku();
    const t = setInterval(() => { void oku(); }, AYRIM_YENILEME_MS);
    return () => { bitti = true; clearInterval(t); };
  }, [ayrimEmri, seciciAcik, MACHINE, depo]);

  /* paketler */
  const pkgsRef = useRef<Record<string, Pkg>>({});
  const live = useRef<{ o?: Is; call?: Cagri | null; sendSample?: (auto?: boolean) => Promise<void>; startCall?: (c: (typeof CAGRI_EKIPLERI)[number], note?: string) => void; mcData?: (m: Ileti) => void }>({});
  const loadPkgs = async (msg?: Ileti) => {
    const pk = (await depo.DB.all('pkgs')) as Pkg[];
    pkgsRef.current = Object.fromEntries(pk.map((p) => [p.id, p]));
    const rs = Object.fromEntries(((await depo.DB.all('results')) as Result[]).map((r) => [r.id, r]));
    const rq = pv ? [] : ((await depo.DB.all('requests').catch(() => [])) as SampleRequest[]);
    // Kalitede bekleyen numune ve son ret yenilemede de görünür; ekranda canlı numune durumu varsa ona dokunulmaz.
    const numuneli = (l: Is[]) => l.map((x) => {
      if (!x.pkg || x.pendingReq || x.lastDecision) return x;
      const d = sonNumuneDurumu(rq, x.pkg.id, x.pkg.plan);
      return d ? ({ ...x, ...d } as Is) : x;
    });
    // Kalite Merkezi'nin ilk parça kararı kalitede bekleyen ilk parça numunesini terminalde kapatır (Arkon numune kaydı açık kalsa da).
    const kmKararli = (l: Is[]) => l.map((x) => {
      const y = x.pkg ? kaliteMerkeziNumuneYamasi(x, x.pkg, ilkParcaKalemleri(x).map((b) => b.id)) : null;
      return y ? ({ ...x, ...y } as Is) : x;
    });
    // Sayacı olmayan takımlar işin şimdiki sayısının ömre göre tabanıyla başlar (kayda değişiklik olarak yazılmaz).
    const takimli = (l: Is[]) => l.map((x) => { if (!x.pkg || pv) return x; const t = eksikTakimTabanlari(x, isKurallari(x.pkg).prod.tools); return t ? { ...x, toolsAt: t } : x; });
    islerYaz((prev) => {
      const etkin = prev[aiRef.current];
      const etkinAnahtar = etkin ? siraAnahtari(etkin) : null;
      const nx = takimli(kmKararli(numuneli(paketleriBirlestir(prev, pk, rs, MACHINE, onizleme))));
      const idx = pv ? 0 : nx.findIndex((x) => siraAnahtari(x) === etkinAnahtar);
      if (idx >= 0 && idx !== aiRef.current) setTimeout(() => aiYaz(idx), 0);
      return nx;
    });
    if (msg && msg.type === 'pkg' && msg['machine'] === MACHINE && !operatoreAcik(pkgsRef.current[String(msg['id'])] as Parameters<typeof operatoreAcik>[0])) return;
    if (msg && msg.type === 'pkg') {
      bip('call');
      if (msg['machine'] === MACHINE) say(`${Number(msg['version']) > 1 ? 'Paket güncellendi: ' : 'Yeni iş paketi: '}${String(msg['no'])} · Rev ${String(msg['rev'])}`, 'layers', 'hazard');
      else say(`${String(msg['machine'])} için paket yayınlandı · bu makine değil`, 'layers', 'idle');
    }
    if (msg && msg.type === 'pin-resolved') say(`Hazırlık notunu yanıtladı: ${String(msg['reply'] || 'çözüldü')}`, 'check', 'run');
  };
  const loadRef = useRef(loadPkgs);
  loadRef.current = loadPkgs;
  // Bu istasyonun işlerinin dosyaları arka planda cihaza iner (karar 726 a): açık iş önce, sonra kuyruk. Öteki istasyonların paketi
  // indirilmez: cihaz sınırı aşılınca silinip yeniden inmesin.
  const indirmeAnahtari = ai + '|' + isler.map((x) => (x.pkg ? x.pkg.id + ':' + x.pkg.version : '')).join(',');
  useEffect(() => {
    if (pv) return;
    depo.dosyalariIndir([isler[ai], ...isler.filter((_, i) => i !== ai)].flatMap((x) => (x && x.pkg ? [x.pkg] : [])));
  }, [indirmeAnahtari]);

  useEffect(() => {
    void (async () => {
      await loadRef.current().catch(() => undefined);
      if (!pv) {
        const h = await depo.DB.get('kv', 'handover').catch(() => null) as Devir | null;
        if (h && Date.now() - h.at < 12 * 3600e3) handoverYaz(h);
      }
    })();
    if (pv) return;
    return depo.Bus.on((m) => {
      if (m.type === 'pkg' || m.type === 'pkg-removed' || m.type === 'pin-resolved') void loadRef.current(m);
      if (m.type === 'pkg-order' && m['machine'] === MACHINE) void loadRef.current();
      if (m.type === '$merged' && (m.store === 'results' || m.store === 'pkgs')) void loadRef.current();
      if (m.type === 'mc' && m['st'] === MACHINE) live.current.mcData?.(m);
      if (m.type === 'call-ack' && m['machine'] === MACHINE) {
        bip('call');
        callYaz((x) => (x && x.t0 === m['t0']
          ? { ...x, stage: Math.max(x.stage, 1), who: String(m['who']), times: [...x.times, Date.now()], msgs: [...x.msgs, { from: 'them', text: `${String(m['who'])} çağrıyı aldı · geliyor`, at: Date.now() }] }
          : x));
      }
      if (m.type === 'sample-result' && m['machine'] === MACHINE) void onSampleRef.current(m);
      const ds = durumIletisi(m, MACHINE);
      if (ds) onTmiDurumRef.current(ds);
    });
  }, []); // eslint olmayan bağımlılık: abonelik ekran ömrünce bir kez kurulur

  // Makine devralındı: TMI'deki hâl gelir, ekran ona eşitlenir; eşitleme yeni durum kaydı yazmaz.
  const onTmiDurum = (ds: DurumEsitleme) => {
    const a = live.current.o;
    if (a && a.no === ds.orderNo && (!ds.pkgId || !a.pkg || a.pkg.id === ds.pkgId) && a.state !== ds.state) {
      autoRef.current.state = true;
      if (a.state === 'running' && ds.state === 'paused') say('Makine başka işe devredildi · iş duraklatıldı', 'alert', 'hazard');
    }
    islerYaz((l) => durumEsitle(l, ds));
  };
  const onTmiDurumRef = useRef(onTmiDurum);
  onTmiDurumRef.current = onTmiDurum;

  const onSampleResult = async (m: Ileti) => {
    const rq = await depo.DB.get('requests', String(m['reqId'])) as SampleRequest | null;
    if (!rq) return;
    const paket = Object.values(pkgsRef.current).find((p) => p.id === rq.pkgId);
    const plan = paket?.plan || [];
    const { kotuMetni, olcumler } = kararOzeti(rq, plan);
    islerYaz((l) => l.map((x) => (x.pkg && x.pkg.id === rq.pkgId
      ? { ...x, meas: { ...x.meas, ...olcumler }, pendingReq: null, pendingItems: null, lastDecision: { status: rq.status, bad: kotuMetni, note: rq.note ?? '', at: Date.now() } }
      : x)));
    const QR = isKurallari(paket).q;
    const L = live.current;
    if (rq.status === 'rejected') {
      bip('nok');
      // 564 7 a: kalite reddi makineyi durdurmaz; durdurmak operatörün kararıdır (eski 'stop' kuralı uyarı olur).
      if (QR.nok === 'call') {
        const k = CAGRI_EKIPLERI.find((c) => c.k === 'kalite');
        if (k) L.startCall?.(k);
        say(`Kalite RED · kalite çağrıldı · ${kotuMetni}`, 'x', 'stop');
      } else say(`Kalite RED · ${kotuMetni}`, 'x', 'stop', { action: { l: 'Durdur', fn: () => ovYaz('reason') } });
    } else {
      bip('ok');
      say(rq.status === 'deviation' ? 'Sapma izni ile onaylandı' : `Kalite onayladı · ${rq.items.length} ölçü uygun`, 'check', 'run');
      const kenar = rq.items.map((id) => ({ b: plan.find((q) => q.id === id), r: rq.results[id] }))
        .filter((x) => x.b && x.r && x.r.ok && sinirYakin(x.b, x.r.v, QR.band));
      if (kenar.length) {
        setTimeout(() => say(`Sınıra yakın: ${kenar.map((x) => `${x.b!.nom} = ${String(x.r!.v)} (%${sinirYakin(x.b, x.r!.v, QR.band)})`).join(', ')} · takımı kontrol et`, 'alert', 'hazard'), 3000);
      }
    }
  };
  const onSampleRef = useRef(onSampleResult);
  onSampleRef.current = onSampleResult;

  /* sonuç kaydı: işin tabletteki son durumu paket başına yazılır; ilk görülen hali (açılış, yenileme) yazılmaz */
  // Bekleyen kayıt ekrandan çıkınca hemen gider: sonradan açılan önizleme sayfası onu reddetmesin, kayıt da kaybolmasın.
  const bekleyenKayit = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; yap: () => void }>());
  const saveT = useRef((anahtar: string, yap: () => void, ms: number) => {
    const b = bekleyenKayit.current;
    const once = b.get(anahtar);
    if (once) clearTimeout(once.t);
    b.set(anahtar, { t: setTimeout(() => { b.delete(anahtar); yap(); }, ms), yap });
  });
  useEffect(() => () => {
    const b = bekleyenKayit.current;
    for (const x of b.values()) { clearTimeout(x.t); x.yap(); }
    b.clear();
  }, []);
  const kayitIzi = useRef(new Map<string, string>());
  const izOf = (x: Is) => JSON.stringify([x.state, x.good, x.scrap, x.acks || {}, x.toolsAt || {}, x.sr || {}, x.kart ?? null]);
  const saveResult = (x: Is | undefined, ping?: string) => {
    if (pv || !x || !x.pkg || !istasyonTableti()) return;
    kayitIzi.current.set(x.pkg.id, izOf(x));
    const pkg = x.pkg;
    saveT.current(pkg.id, () => {
      void depo.DB.put('results', sonucBelgesi(x)).then(() => depo.Bus.send({ type: ping || 'progress', id: pkg.id, no: x.no }));
    }, ping ? 50 : 1500);
  };
  useEffect(() => {
    if (!o.pkg) return;
    const iz = izOf(o);
    const onceki = kayitIzi.current.get(o.pkg.id);
    if (onceki === undefined) { kayitIzi.current.set(o.pkg.id, iz); return; }
    if (onceki !== iz) saveResult(o);
  }, [o.good, o.scrap, o.state, o.acks, o.toolsAt, o.sr, o.kart, o.pkg]);

  /* iş değiştirme (684): çalışan iş yalnız operatör "duraklat" derse duraklatılır ve olayı yeni işin olaylarından önce gönderilir;
     "devam" derse istasyonda birden çok iş açık kalır. */
  const isGec = (i: number, duraklatilsin = false) => {
    const duraklat = duraklatilsin ? gecisteDuraklatilacaklar(isler, i) : [];
    for (const j of duraklat) {
      const x = isler[j]!;
      const eski: Is = { ...x, state: 'paused' };
      if (!pv && istasyonTableti()) {
        void depo.Log.add('events', { machine: MACHINE, wc: ist.wc || null, mc: (x.pkg && x.pkg.mc) || curMc(), orderNo: x.no, pkgId: x.pkg ? x.pkg.id : null, state: 'paused', reason: IS_DEGISIMI, planned: null });
      }
      saveResult(eski, 'result');
    }
    if (duraklat.length) islerYaz((l) => l.map((x, j) => (duraklat.includes(j) ? { ...x, state: 'paused' } : x)));
    aiYaz(i);
  };

  const [gecis, gecisYaz] = useState<{ i: number; sonra?: () => void } | null>(null);
  // Başka işe geçiş: başka çalışan iş varsa sorulur (684), yoksa doğrudan geçilir.
  const isGecIste = (i: number, sonra?: () => void) => {
    if (i === ai) { sonra?.(); return; }
    if (!pv && gecisteDuraklatilacaklar(isler, i).length) { gecisYaz({ i, ...(sonra ? { sonra } : {}) }); ovYaz('gecis'); return; }
    isGec(i); sinceYaz(null); sonra?.();
  };
  const gecisiBitir = (duraklatilsin: boolean) => {
    const g = gecis;
    ovYaz(null); gecisYaz(null);
    if (!g) return;
    isGec(g.i, duraklatilsin); sinceYaz(null); g.sonra?.();
  };

  // Ctrl K'den gelen emir listede varsa seçilir; çalışan başka iş varsa seçim yapılmaz ve operatöre söylenir.
  // Malzeme Teslim'in "İş emrini aç"ı kartla gelir: emrin bu istasyondaki bitmemiş işi o kartla açılır; işi yoksa sıradaki adım söylenir.
  const emirIstegi = useRef<number | null>(null);
  const kartIstegi = useRef<number | null>(null);
  const emirSec = () => {
    const id = emirIstegi.current;
    if (id === null || pv) return;
    const kart = kartIstegi.current;
    if (kart !== null) {
      const r = refakatIsi(id, isler, Object.values(pkgsRef.current));
      if (r.tur !== 'ac' && !isler.some((x) => x.pkg)) return;
      emirIstegi.current = null;
      kartIstegi.current = null;
      if (r.tur !== 'ac') { bip('nok'); say(`Bu emrin bu istasyonda işi yok${r.tur === 'baska-istasyon' && r.istasyon ? `, sıradaki adım: ${r.istasyon}` : ''}`, 'alert', 'stop'); return; }
      isGecIste(r.sira, () => {
        mvYaz('prod');
        islerYaz((l) => l.map((x, j) => (j === r.sira ? { ...x, kart, fresh: false } : x)));
        say(`İş emri açıldı: ${isler[r.sira]!.no} · refakat kartıyla`, 'check', 'run');
      });
      return;
    }
    const i = emirSirasi(isler, id);
    if (i < 0) { if (isler.some((x) => x.pkg)) emirIstegi.current = null; return; }
    emirIstegi.current = null;
    if (i === ai) return;
    isGecIste(i);
  };
  const emirSecRef = useRef(emirSec);
  emirSecRef.current = emirSec;
  useEffect(() => {
    const al = () => {
      const w = window as unknown as EmirSecimiPenceresi;
      const id = emirSeciminiAl(w);
      const kart = kartSeciminiAl(w);
      if (id !== null) { emirIstegi.current = id; kartIstegi.current = kart; emirSecRef.current(); }
    };
    al();
    window.addEventListener(EMIR_SEC_OLAYI, al);
    return () => window.removeEventListener(EMIR_SEC_OLAYI, al);
  }, []);
  useEffect(() => { emirSecRef.current(); }, [isler]);
  // Etkin iş ya da durumu değişince süre işin sunucudaki son durum kaydından (sunucu saati) okunur; önizleme de okur. Paketi olmayan iş
  // emir numarasıyla aranır. Kayıt bugünkü durumu tutmuyorsa elde olan kalır: bu cihazdaki durum değişikliği ya da "bilinmiyor".
  const pkgId = o.pkg ? o.pkg.id : null;
  const etkinAnahtar = siraAnahtari(o);
  useEffect(() => {
    if (o.empty || (!pkgId && !o.no)) return;
    let bitti = false;
    const durum = o.state;
    depo.Log.query('events', { ...(pkgId ? { pkg: pkgId } : { order: o.no }), limit: 200 }).then((k) => {
      const at = durumBaslangici(k, durum);
      if (!bitti && at !== null) sinceYaz(at);
    }, () => undefined);
    return () => { bitti = true; };
  }, [etkinAnahtar, o.state, pkgId, depo]);

  /* refakat kartları: bitmemiş işlerin kartları okunur; okunamazsa liste olduğu gibi kalır, iş kartsız da açılır */
  const [kartlar, kartlarYaz] = useState<RefakatKarti[]>([]);
  const kartAnahtari = pv ? '' : kartEmirleri(isler.map((x) => ({ state: x.state, emirId: tmiEmirId(x.pkg) }))).join(',');
  useEffect(() => {
    if (!kartAnahtari) { kartlarYaz([]); return; }
    let bitti = false;
    const oku = () => depo.Server.refakatKartlari(MACHINE, kartAnahtari.split(',').map(Number)).then((l) => { if (!bitti) kartlarYaz(l); }, () => undefined);
    void oku();
    const t = setInterval(() => { void oku(); }, KART_YENILEME_MS);
    return () => { bitti = true; clearInterval(t); };
  }, [kartAnahtari, MACHINE, depo]);
  // "Aç": iş o kartla açılır (başlatılmaz); aynı işte başka kart seçilirse iş o kartla sürer.
  const kartlaAc = (i: number, k: RefakatKarti) => {
    isGecIste(i, () => {
      islerYaz((l) => l.map((x, j) => (j === i ? { ...x, kart: k.id, fresh: false } : x)));
      mvYaz('prod');
      say(`İş emri açıldı: ${isler[i]!.no} · ${k.etiket}`, 'check', 'run');
    });
  };
  // 1337 a: el okuyucuyla okutulan refakat kartı işi o kartla açar, başlatmaz (1062). Özet açıksa kapanır; başka pencere açıkken dinlenmez.
  const kartOkutuldu = (kod: string) => {
    awayYaz(false);
    const t = terminalOkutmasi(kod);
    if (t.tur !== 'kart') { bip('nok'); say(KART_DEGIL_ILETISI, 'alert', 'hold'); return; }
    const k = kartlar.find((x) => x.id === t.kartId);
    if (!k) { bip('nok'); say(KART_YOK_ILETISI, 'alert', 'stop'); return; }
    const r = refakatIsi(k.uretimEmriId, isler, Object.values(pkgsRef.current));
    if (r.tur !== 'ac') { bip('nok'); say(`Bu emrin bu istasyonda işi yok${r.tur === 'baska-istasyon' && r.istasyon ? `, sıradaki adım: ${r.istasyon}` : ''}`, 'alert', 'stop'); return; }
    bip('ok');
    if (ov === 'done') ovYaz(null);
    kartlaAc(r.sira, k);
  };
  useElOkuyucu(!pv && scan === null && (ov === null || ov === 'done'), kartOkutuldu);

  /* iş kuralları ve istasyon türü (hazırlıktan) */
  const RL = useMemo(() => isKurallari(o.pkg), [o.pkg]);
  const opT = isTuru(o.pkg);
  const OT = IS_TURLERI[opT];
  const Panel = ISTASYON_PANELLERI[opT];
  useEffect(() => { tabYaz(Panel ? 'st' : 'draw'); if (dar) mvYaz((v) => (v === 'ozet' ? v : 'prod')); }, [o.no]);
  const stUpd = (f: (x: Is) => Partial<Is>) => islerYaz((l) => l.map((x, i) => (i === aiRef.current ? { ...x, ...f(x) } : x)));
  const stApi: PanelArayuzu = {
    is: o, paket: (o.pkg || {}) as Pkg, ayar: istasyonAyari(o.pkg), kayit: (o.sr || {}) as IstasyonKaydi,
    yap: (etiket, simge, ton, f) => undoable(etiket, simge, ton, () => stUpd(f)), sessiz: (f) => stUpd(f),
    soyle: (m, ton) => say(m, 'alert', ton), okut: (x) => scanYaz(x),
  };

  /* uyarılar */
  const ackWarns = (list: readonly Uyari[]) => {
    const at = Date.now();
    islerYaz((l) => l.map((x, i) => {
      if (i !== aiRef.current) return x;
      const a = { ...x.acks };
      list.forEach((w) => { a[w.id] = { at, by: ME, cnt: x.good, k: uyariAnahtari(w, x), v: x.pkg && x.pkg.version }; });
      return { ...x, acks: a };
    }));
  };
  const bes = Math.floor(simdi / 5000);
  useEffect(() => {
    if (pv || warnShow || ov) return;
    // Süre bilinmiyorsa süreye bağlı uyarı gelmez (geçen süre sıfır sayılır), sayıya ve vardiyaya bağlı olanlar gelir.
    const due = zamaniGelenUyarilar(RL.warns, o, Date.now(), since ?? Date.now(), vardiya.s);
    if (!due.length) return;
    const loud = due.filter((w) => w.ack || w.lvl === 'crit');
    const quiet = due.filter((w) => !(w.ack || w.lvl === 'crit'));
    if (quiet.length) { ackWarns(quiet); bip('due'); say(quiet[0]!.t, SEVIYELER[quiet[0]!.lvl].simge, SEVIYELER[quiet[0]!.lvl].ton); }
    if (loud.length) { awayYaz(false); bip('call'); warnShowYaz({ list: loud }); }
  }, [bes, o.good, o.state, o.toolEvt, !!warnShow, !!ov, o.no]);
  /* takım ömrü uyarıları */
  const toolSeen = useRef(new Set<string>());
  useEffect(() => {
    for (const u of takimUyarilari(o, RL.prod.tools)) {
      if (toolSeen.current.has(u.anahtar)) continue;
      toolSeen.current.add(u.anahtar);
      say(u.metin, 'tool', 'hazard');
    }
  }, [o.good, RL]);
  const changeTool = (t: { id: string; name: string }) => undoable(`${t.name} değiştirildi · sayaç sıfırlandı`, 'tool', 'run', () => patch({ toolsAt: { ...o.toolsAt, [t.id]: o.good }, toolEvt: Date.now() }));
  /* uzun duruş */
  const pauseSeen = useRef(0);
  const on = Math.floor(simdi / 10000);
  useEffect(() => {
    if (pv || since === null || !RL.prod.maxPauseMin || !(o.state === 'paused' || o.state === 'stopped')) return;
    if (Date.now() - since >= RL.prod.maxPauseMin * 60000 && pauseSeen.current !== since) {
      pauseSeen.current = since;
      bip('nok');
      say(`${o.state === 'paused' ? 'Duraklatma ' : 'Duruş '}${RL.prod.maxPauseMin} dk’yı geçti`, 'clock', 'stop', { action: { l: 'Amiri çağır', fn: () => startCall(CAGRI_EKIPLERI.find((c) => c.k === 'amir')!) } });
    }
  }, [on, o.state]);

  /* kontrol takvimi */
  const D = useMemo(() => (opT === 'cnc' ? kontrolTakvimi(o, Date.now(), anlikVardiya(Date.now(), ayarlar.vardiyalar, ayarlar.tatiller).s) : BOS_TAKVIM), [o, bes, opT, ayarlar.vardiyalar, ayarlar.tatiller]);
  const dueKey = D.due.map((b) => b.id).join(',');
  const prevDue = useRef('');
  useEffect(() => {
    const once = new Set(prevDue.current.split(',').filter(Boolean));
    prevDue.current = dueKey;
    const taze = D.due.filter((b) => !once.has(String(b.id)));
    const tazeQ = taze.filter((b) => D.who[b.id] !== 'op');
    const tazeO = taze.filter((b) => D.who[b.id] === 'op');
    if (otomatikNumuneOlculeri(tazeQ, D.why, o.lastDecision).length && o.pkg && RL.q.autoSend && !o.pendingReq && !pv) {
      setTimeout(() => { void live.current.sendSample?.(true); }, 400);
    } else if (taze.length && o.pkg && !(o.lastDecision && o.lastDecision.status === 'rejected' && !tazeO.length)) {
      // Ret kartı ekrandayken kalite ölçüsü için ayrıca uyarı verilmez: RED iletisi ve kart operatöre düzeltip göndermesini zaten söyler.
      const b = tazeQ[0] || tazeO[0]!;
      awayYaz(false); tabYaz('draw'); mvYaz('prod'); odakYaz({ id: b.id, n: Date.now() });
      bip('due');
      say(tazeQ.length ? `Numune zamanı · ${b.nom} (${D.why[b.id] || ''}) · kaliteye gönder` : `Ölçüm sırası sende · ${b.nom} (${D.why[b.id] || ''})`,
        tazeQ.length ? 'target' : 'ruler', b.crit ? 'stop' : tazeQ.length ? 'hazard' : 'run');
    }
  }, [dueKey]);
  const nextOrder = isler.find((x, i) => i !== ai && x.state === 'queued');
  const siraRef = useRef<string[]>([]);
  const [ondeNo, ondeNoYaz] = useState<string | null>(null);
  const siraDamgasi = isler.map((x) => `${siraAnahtari(x)}:${x.state}`).join(',');
  useEffect(() => {
    if (pv) return;
    const yeni = yeniOneAlinan(siraRef.current, isler);
    siraRef.current = isler.map(siraAnahtari);
    ondeNoYaz((n) => yeni ?? (n && oneAlinanSuruyor(n, isler) ? n : null));
  }, [siraDamgasi]);
  useEffect(() => {
    const onde = ondeNo ? isler.find((x) => siraAnahtari(x) === ondeNo) : null;
    if (onde) say(`Sıradaki iş öne alındı: ${[onde.no, onde.op].filter(Boolean).join(' · ')} · geçince çalışan iş duraklatılır`, 'alert', 'hazard');
  }, [ondeNo]);

  // İlk parça kapısı (129, 131 b, denetim #12): Kalite Merkezi onaylayana dek ilk parçadan sonraki sağlam parça karar bekler; yeniden ilk
  // parça açıkken ikinci sağlam sayılmaz. Yeniden ilk parçanın tabanı hazırlık kararının damgasıdır.
  const yenidenAcik = !!o.pkg && POLICY.fpRestart !== false && ilkParcaKalemleri(o).length > 0 && yenidenIlkParcaAcik(o.pkg);
  const ilkKarari = ilkParcaKarari(o.pkg);
  const ilkAcik = !!o.pkg && !pv && ilkParcaKalemleri(o).length > 0 && ilkKarari !== 'onay';
  const ilkSayilan = o.good - (o.baseGood ?? 0) - (ilkAcik ? 0 : yenidenIlkParcaTabani(o.pkg));
  const ilk = {
    acik: ilkAcik || (!pv && yenidenAcik), yeniden: !ilkAcik && !pv && yenidenAcik, sayilan: ilkSayilan,
    kararBekleyen: kararBekleyenSayisi(ilkAcik, ilkSayilan, ilkAcik && ilkKarari === 'ret'),
  };
  // 19.1: paketin merkez çizimi eskiyse başlatma görevi uyarıya döner.
  const mUyari = useMerkezUyarilari((o.pkg ? o.pkg.files : null) as MerkezDosyasi[] | null);
  const cizimEski = eskiCizim((o.pkg && o.pkg.files) as MerkezDosyasi[] | undefined, mUyari);

  /* teknik resim (operator.ts ctl): salt okunur; operatör yalnız kendisine düşen ölçüyü girer, ölçü aleti zorunlu (önizlemede değil) */
  const opIds = useMemo(() => {
    if (!o.pkg) return [];
    const ids = new Set(D.due.filter((b) => D.who[b.id] === 'op').map((b) => b.id));
    for (const r of numunePlani(o.pkg)) if ((r.who || ['q']).every((w) => w === 'op')) for (const b of numuneOlculeri(o.pkg, r)) ids.add(b.id);
    return Array.from(ids);
  }, [o.pkg, dueKey]);
  // Eski ekranda olduğu gibi tek bildirim: görüntüleyicinin ölçüm iletisi "Geri al" ile birlikte verilir.
  const olcumGeri = useRef<(() => void) | null>(null);
  const olcumYaz = (m: Record<number, Meas>) => {
    const pkg = o.pkg;
    if (!pkg) return;
    const nm: Record<string, Meas> = { ...m };
    for (const k of Object.keys(nm)) {
      const x = nm[k];
      if (!x || x.cnt != null) continue;
      nm[k] = { ...x, cnt: o.good, who: 'op', by: ME };
      shiftRef.current[x.ok ? 'mOk' : 'mNok']++;
      const b = pkg.plan.find((p) => String(p.id) === k);
      if (!pv && b) {
        const kayit = { v: x.v, ok: x.ok, cnt: o.good }, wc = ist.wc || null;
        void import('../kalite/index.tsx').then(({ olcumKaydi }) => depo.Log.add('meas', olcumKaydi(pkg, b, kayit, wc, { src: 'op', orderNo: o.no, machine: MACHINE })));
      }
    }
    const once = o.meas || {};
    const yaz = (meas: Record<string, Meas>) => {
      islerYaz((l) => l.map((x, i) => (i === aiRef.current ? { ...x, meas } : x)));
      saveResult({ ...o, meas }, 'result');
    };
    yaz(nm);
    olcumGeri.current = () => { yaz(once); say('Ölçüm geri alındı', 'rotate', 'idle'); };
  };
  const olcumBildir = (mesaj: string, uygun: boolean) => {
    const geri = olcumGeri.current;
    olcumGeri.current = null;
    say(mesaj, 'ruler', uygun ? 'run' : 'stop', geri ? { undo: geri } : undefined);
  };
  const notBirak = (n: { x: number; y: number; text: string }) => {
    const pin = { id: 'p' + Date.now(), by: ME + ' · ' + MACHINE, at: Date.now(), status: 'open' as const, ...n };
    const pins = [...(o.pins || []), pin];
    islerYaz((l) => l.map((x, i) => (i === aiRef.current ? { ...x, pins } : x)));
    saveResult({ ...o, pins }, 'feedback');
    say('Not hazırlığa gönderildi', 'flag', 'hazard');
  };
  const aletler = ayarlar.olcuAletleri;
  // Paket listesi dosyasız gelir (kart #731): açık işin dosyaları ve hazır verisi burada baytlanır; gelene kadar resim boş açılır.
  const pkgAnahtari = o.pkg ? o.pkg.id + ':' + o.pkg.version : '';
  const acikDosyalar = useCozulmus(depo, o.pkg ? { files: o.pkg.files, derived: o.pkg.derived } : null, pkgAnahtari);
  const resimKontrolu = useMemo((): TeknikResimKontrolu => (o.pkg ? {
    anahtar: pkgAnahtari + (acikDosyalar ? '' : ':bekliyor'), dosyalar: acikDosyalar ? baytli(acikDosyalar.files) : [], anaResim: o.pkg.primary,
    hazirVeri: acikDosyalar?.derived ?? null, ayar: o.pkg.readCfg,
    balonlar: o.pkg.plan as TeknikResimKontrolu['balonlar'], balonlarYaz: () => undefined, saltOkunur: true, eskiCizim: cizimEski, olcumYok: true,
    aletZorunlu: !pv, aletSecimi: (tool) => <Suspense fallback={null}><AletSecici aletler={aletler} tool={tool} /></Suspense>,
    operatorOlcer: opIds, odakKipi: odakKipiYaz, olcumler: (o.meas || {}) as unknown as TeknikResimKontrolu['olcumler'],
    retGerekcesi: retGerekcesiMetni(o.lastDecision), odak, siradaki: D.due.map((b) => b.id), notlar: (o.pins || []) as unknown as ResimNotu[],
    olcumlerYaz: (m) => olcumYaz(m as unknown as Record<number, Meas>), olcumBildir, notBirak: pv ? undefined : notBirak,
  } : {
    anahtar: 'bos:' + o.no, dosyalar: [], anaResim: null, balonlar: [], balonlarYaz: () => undefined, olcumler: {}, olcumlerYaz: () => undefined, saltOkunur: true,
  }), [o.pkg?.id, o.pkg?.version, acikDosyalar, o.meas, o.lastDecision, o.pins, o.no, odak, dueKey, RL, opIds.join(','), cizimEski, aletler]);
  // 790: önizlenen işin resmi salt okunurdur; ölçüm, not ve odak ekrandaki işindir.
  const bakPkgAnahtari = b && b.pkg ? b.pkg.id + ':' + b.pkg.version : '';
  const bakDosyalar = useCozulmus(depo, b && b.pkg ? { files: b.pkg.files, derived: b.pkg.derived } : null, bakPkgAnahtari);
  const onizResimKontrolu = useMemo((): TeknikResimKontrolu | null => (!b ? null : b.pkg ? {
    anahtar: 'oniz:' + bakPkgAnahtari + (bakDosyalar ? '' : ':bekliyor'), dosyalar: bakDosyalar ? baytli(bakDosyalar.files) : [], anaResim: b.pkg.primary,
    hazirVeri: bakDosyalar?.derived ?? null, ayar: b.pkg.readCfg, balonlar: b.pkg.plan as TeknikResimKontrolu['balonlar'], balonlarYaz: () => undefined,
    saltOkunur: true, olcumYok: true, olcumler: {}, olcumlerYaz: () => undefined,
  } : {
    anahtar: 'oniz-bos:' + b.no, dosyalar: [], anaResim: null, balonlar: [], balonlarYaz: () => undefined, olcumler: {}, olcumlerYaz: () => undefined, saltOkunur: true,
  }), [b && siraAnahtari(b), bakPkgAnahtari, bakDosyalar]);
  const task0 = siradakiGorev(o, D, nextOrder, ilk, simdi);
  const ertelenmis = task0 && task0.key && (snooze[task0.key] ?? 0) > simdi ? siradakiGorev({ ...o, _skip: true }, D, null, ilk, simdi) : task0;
  const eskiG = eskiCizimGorevi(ertelenmis, cizimEski);
  const task: Gorev | null = eskiG && eskiG !== ertelenmis
    ? { ...(eskiG as unknown as Gorev), tone: tonAdi((eskiG as { tone: string }).tone), icon: simgeSec((eskiG as { icon: string }).icon) }
    : ertelenmis;

  /* çevrim ölçümü: son parçadan bu yana geçen çalışma süresi (duraklamalar sayılmaz); çizimden önce eşitlenir */
  const cycRef = useRef({ acc: 0, since: null as number | null, good: null as number | null, scrap: null as number | null, no: null as string | null, state: null as string | null, last: 0, n: 0 });
  {
    const c = cycRef.current;
    const t = Date.now();
    if (c.no !== siraAnahtari(o)) Object.assign(c, { no: siraAnahtari(o), good: o.good, scrap: o.scrap, state: o.state, acc: 0, since: o.state === 'running' ? t : null, last: 0, n: c.n + 1 });
    else {
      if (c.state !== o.state) {
        if (o.state === 'running') { if (!c.since) c.since = t; } else if (c.since) { c.acc += t - c.since; c.since = null; }
        c.state = o.state;
      }
      if (o.good > (c.good ?? 0) || o.scrap > (c.scrap ?? 0)) {
        const el = c.acc + (c.since ? t - c.since : 0);
        if (el > 500) c.last = el;
        Object.assign(c, { acc: 0, since: o.state === 'running' ? t : null, n: c.n + 1 });
      }
      c.good = o.good; c.scrap = o.scrap;
    }
  }
  const cevrim = useMemo((): CevrimOlcer => ({
    gecen: () => { const c = cycRef.current; return c.acc + (c.since ? Date.now() - c.since : 0); },
    son: () => cycRef.current.last,
    sayac: () => cycRef.current.n,
  }), []);

  /* üretim kayıtları: durum değişimi ve sayımlar (OEE, vardiya özeti); her kaynaktan gelen değişiklik yakalanır */
  const autoCallT = useRef<ReturnType<typeof setTimeout>>();
  const autoRef = useRef({ state: false, cnt: false });
  const scrapWhy = useRef<string | null>(null);
  const [hataliGidiyor, hataliGidiyorYaz] = useState(false);
  const [hataliEk, hataliEkYaz] = useState({ anahtar: '', adet: 0 });
  const topluRef = useRef(false);
  const lastNoteRef = useRef<string | null>(null);
  const prevCnt = useRef<{ no: string; good: number; scrap: number } | null>(null);
  const gorulenIs = useRef(new Set<string>());
  useEffect(() => {
    if (pv || o.empty || !istasyonTableti()) return;
    const k = `lastState:${MACHINE}`;
    const anahtar = siraAnahtari(o);
    const kayitli = yerel.oku<{ no: string; anahtar?: string; state: string; at: number }>(k);
    const l = kayitli ? { ...kayitli, no: kayitli.anahtar ?? kayitli.no } : null;
    // Açılışta ve yenilemede ilk görülen işin durumu kayda gitmez: durum bu tablette değişmedi.
    const ilkGorus = !gorulenIs.current.has(anahtar);
    gorulenIs.current.add(anahtar);
    if (l && l.no === anahtar && l.state === o.state) return;
    // İlk görüşte durum bu cihazda değişmedi: başlangıç anı bilinmez, kayda uydurulmaz.
    yerel.yaz(k, { no: o.no, anahtar, state: o.state, at: ilkGorus ? null : Date.now() });
    if (ilkGorus) { autoRef.current.state = false; lastNoteRef.current = null; return; }
    const why = o.state === 'stopped' ? lastNoteRef.current : null;
    if (!autoRef.current.state && durumKaydiGerekir(l, { no: anahtar, state: o.state })) {
      void depo.Log.add('events', {
        machine: MACHINE, wc: ist.wc || null, mc: curMc(), mcs: kayittakiMakineler(kilitsizSecim(mcSel, ayrim), ist.mcs, o.state),
        orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, state: o.state, reason: why, planned: why ? planliMi(why) : null,
      });
    }
    autoRef.current.state = false;
    lastNoteRef.current = null;
    schedAutoCall(why);
  }, [o.state, o.no]);
  // Nedeni bir ekibe bağlıysa (ör. mekanik arıza → bakım) belirlenen süre sonra kendiliğinden çağrılır.
  const schedAutoCall = (why: string | null) => {
    clearTimeout(autoCallT.current);
    const r = why ? durusNedeni(ayarlar, why) : null;
    if (r && r.team && POLICY.autoCall) {
      const c0 = CAGRI_EKIPLERI.find((c) => c.k === r.team);
      if (c0) {
        autoCallT.current = setTimeout(() => {
          const L = live.current;
          if (L.o && L.o.state === 'stopped' && !L.call) L.startCall?.(c0, `Otomatik · ${r.l}`);
        }, (r.after || 0) * 60e3 + 400);
      }
    }
  };
  // Zaten durmuş makineye (ör. makine verisiyle durdu) neden girilince.
  const noteStop = (code: string) => {
    void depo.Log.add('events', { machine: MACHINE, wc: ist.wc || null, mc: curMc(), orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, state: 'stopped', reason: code, planned: planliMi(code) });
    segsYaz((sg) => (sg.length ? sg.map((x, i) => (i === sg.length - 1 ? { ...x, n: code } : x)) : sg));
    schedAutoCall(code);
    say(`Duruş nedeni kaydedildi · ${nedenAdiOku(code) || code}`, 'stop', 'stop', { action: { l: 'Değiştir', fn: () => ovYaz('reason') } });
  };
  useEffect(() => () => clearTimeout(autoCallT.current), []);
  useEffect(() => {
    // Toplu girişin parça süresi yoktur: son çevrim süresi topluya yazılırsa birim süre ortalaması bozulur.
    const toplu = topluRef.current;
    topluRef.current = false;
    if (pv || o.empty || !istasyonTableti()) return;
    const p = prevCnt.current;
    prevCnt.current = { no: siraAnahtari(o), good: o.good, scrap: o.scrap };
    if (!p || p.no !== siraAnahtari(o)) return;
    const base = {
      machine: MACHINE, wc: ist.wc || null, mc: curMc(), orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, planMs: o.cycle > 0 ? Math.round(o.cycle * 1000) : null,
      state: o.state, ...sayimKartAlani(o.kart),
    };
    const cyc = cycRef.current.last ? Math.round(cycRef.current.last) : null;
    // 784 a: toplu giriş işaretlenir; sunucu adedin son girişten beri geçen net süreye sığıp sığmadığını denetler (yalnız anomali sayfası).
    const isaret = toplu ? { toplu: true } : {};
    if (autoRef.current.cnt) { autoRef.current.cnt = false; return; } // makine verisinden gelen sayım sunucuda zaten kayıtlı
    if (o.good !== p.good) void depo.Log.add('counts', { kind: 'good', delta: o.good - p.good, cycleMs: o.good > p.good && !toplu ? cyc : null, ...isaret, ...base });
    if (o.scrap !== p.scrap) {
      void depo.Log.add('counts', { kind: 'scrap', delta: o.scrap - p.scrap, cycleMs: o.scrap > p.scrap && !toplu ? cyc : null, reason: o.scrap > p.scrap ? scrapWhy.current : null, ...isaret, ...base });
      scrapWhy.current = null;
    }
  }, [o.good, o.scrap, o.no]);
  /* sunucu sayımı ya da başlatmayı reddetti: sayı ya da durum geri döner, ret metni gösterilir; geri alma yeni kayıt yazmaz */
  useEffect(() => {
    const f = (e: Event) => {
      const detay = (e as CustomEvent<{ msg?: string }>).detail;
      // TMI işin hâlini bildirdiyse ekran ona eşitlenir (tek kaynak TMI). Yoksa başlatma geri alınır.
      const es = durumEsitleme(detay);
      if (es) {
        const a = live.current.o;
        if (a && a.state !== es.state && geriAlinacakIs(a, { ...es, pkgId: es.pkgId ?? null, alan: 'good', fark: 0 })) autoRef.current.state = true;
        islerYaz((l) => durumEsitle(l, es));
        bip('nok'); sayRef.current(`TMI kabul etmedi · ${detay?.msg || ''}`, 'alert', 'stop');
        return;
      }
      const b = baslatmaGeriAlma(detay);
      if (b) {
        // Başlatma yazılmadı: iş geri döner; geri dönüş yeni durum kaydı yazmaz (TMI'de değişen bir şey yok).
        const a = live.current.o;
        if (a && a.state === 'running' && geriAlinacakIs(a, { ...b, alan: 'good', fark: 0 })) autoRef.current.state = true;
        islerYaz((l) => baslatmaGeriUygula(l, b));
        bip('nok'); sayRef.current(`İş başlamadı · ${detay?.msg || 'TMI kabul etmedi'}`, 'alert', 'stop');
        return;
      }
      const g = sayimGeriAlma(detay);
      if (!g) return;
      const a = live.current.o;
      if (a && geriAlinacakIs(a, g) && Math.max(0, a[g.alan] + g.fark) !== a[g.alan]) autoRef.current.cnt = true;
      islerYaz((l) => sayimGeriUygula(l, g));
      bip('nok'); sayRef.current(`Sayım işlenmedi, sayı geri alındı · ${detay?.msg || ''}`, 'alert', 'stop');
    };
    window.addEventListener('arkon-rejected', f);
    return () => window.removeEventListener('arkon-rejected', f);
  }, []);
  useEffect(() => {
    const f = (e: Event) => sayRef.current(`${ILETI_GITMEDI} · ${(e as CustomEvent<{ msg?: string }>).detail?.msg || ''}`, 'alert', 'hold');
    window.addEventListener('arkon-ileti-gitmedi', f);
    return () => window.removeEventListener('arkon-ileti-gitmedi', f);
  }, []);
  const dakika = Math.floor(shiftNow);
  useEffect(() => { segsYaz((s) => { const L = s[s.length - 1]; if (!L) return s; return s.map((x, i) => (i === s.length - 1 ? { ...x, t: Math.max(x.t, shiftNow) } : x)); }); }, [dakika]);
  /* uzak mod: 45 sn dokunulmazsa */
  useEffect(() => {
    const f = () => { lastAct.current = Date.now(); };
    window.addEventListener('pointerdown', f, true);
    window.addEventListener('keydown', f, true);
    return () => { window.removeEventListener('pointerdown', f, true); window.removeEventListener('keydown', f, true); };
  }, []);
  useEffect(() => { if (!pv && !away && !ov && !odakKipi && Date.now() - lastAct.current > 45000) awayYaz(true); }, [simdi]);

  const patch = (p: Partial<Is>) => islerYaz((l) => l.map((x, i) => (i === ai ? { ...x, ...p } : x)));
  const undoable = (label: string, icon: SimgeAdi, ton: Ton, f: () => void) => {
    const s = { isler, since, segs };
    f();
    say(label, icon, ton, { undo: () => { islerYaz(s.isler); sinceYaz(s.since); segsYaz(s.segs); say('Geri alındı', 'rotate', 'idle'); } });
  };
  const go = (st: Is['state'], note?: string | null) => {
    lastNoteRef.current = note || null;
    patch({ state: st, ...(st === 'running' && !o.startedAt ? { startedAt: Date.now() } : null) });
    sinceYaz(Date.now());
    segsYaz((s) => { const t = s.length ? s[s.length - 1]!.t : 0; return [...s, { f: t, t: t + 0.5, s: st === 'done' || st === 'queued' ? 'paused' : st, n: note }]; });
  };
  const retZamani = useRef(0);
  const ok = (k: Perm) => {
    if (pv) return false;
    if (yetkiVar(k)) return true;
    if (Date.now() - retZamani.current > 1500) { retZamani.current = Date.now(); bip('nok'); say(`Yetkin yok: ${YETKI_ADLARI[k] || k}`, 'lock', 'stop'); }
    return false;
  };
  const kapaliNedeni = sayimKapaliNedeni(o);
  const kapali = kapaliNedeni !== null;
  const iyiKapaliNedeni = sayimKapaliNedeni(o, 'good');
  const iyiKapali = iyiKapaliNedeni !== null;
  const iyiArtiNedeni = (n: number) => iyiKapaliNedeni ?? ilkParcaSayimReddi(ilk.yeniden, ilk.sayilan, n);
  const iyiArtiKapali = iyiArtiNedeni(1) !== null;
  const sayimOk = (k: Perm, neden: string | null = kapaliNedeni) => { if (neden !== null) { bip('nok'); say(neden, 'alert', 'idle'); return false; } return ok(k); };
  const iyiSayimOk = (k: Perm) => sayimOk(k, iyiKapaliNedeni);
  // 1034: TMI işinde hurdayı operatör yazmaz; "Hatalı" parçayı kaliteye ayırır (kol ya da emre ek adım TMI'de açılır), sayaç değişmez.
  const hataliTmi = !pv && tmiEmirId(o.pkg) !== null && depo.status().mode === 'server';
  // 1188: hatalı parça adımda üretimdir; sayısı sunucunun adım toplamıdır. Gönderilen, paket yenilenene kadar üstüne eklenir; sunucu
  // toplamı değişince (ya da iş değişince) ek düşer. Toplam bilinmiyorsa sayı yoktur (null), ek de uydurulmaz.
  const sunucuHatali = hataliAdet(o.pkg);
  const hataliAnahtari = `${siraAnahtari(o)}|${String(sunucuHatali)}`;
  const hataliSayisi = !hataliTmi ? undefined : sunucuHatali === null ? null : sunucuHatali + (hataliEk.anahtar === hataliAnahtari ? hataliEk.adet : 0);
  const topluKaydet = (g: { saglam: number; hurda: number; neden: string | null }) => {
    if (!sayimOk('prod.run', g.saglam > 0 ? iyiArtiNedeni(g.saglam) ?? kapaliNedeni : kapaliNedeni)) return false;
    if (hataliTmi && g.hurda > 0 && g.neden) {
      if (g.saglam > 0) doToplu({ saglam: g.saglam, hurda: 0, neden: null });
      hataliGonder({ kod: g.neden, adet: g.hurda, aciklama: null });
      return true;
    }
    doToplu(g);
    return true;
  };
  const hazirlikta = useRef(false);
  const act = (a: GorevEylemi, t?: Gorev, warned?: boolean, hazir?: boolean, ekUyari?: string | null) => {
    if (URETIM_EYLEMLERI.includes(a) && (o.empty || !ok('prod.run'))) return;
    if (a === 'tool') { const tl = RL.prod.tools.find((x) => x.id === (t && t.toolId)); if (tl) changeTool(tl); return; }
    if (a === 'warns') { warnShowYaz({ list: RL.warns.filter((w) => w.t), title: 'Bu işin uyarıları' }); return; }
    if (a === 'stop') { ovYaz('reason'); return; }
    if (a === 'drawing') { tabYaz('draw'); return; }
    if (a === 'st') { tabYaz('st'); mvYaz('st'); return; }
    if (a === 'measure') { tabYaz('draw'); if (t && t.id !== undefined) odakYaz({ id: t.id, n: Date.now() }); return; }
    if (a === 'call') { ovYaz('call'); return; }
    if (a === 'prepnext') { ovYaz('prepnext'); return; }
    if (a === 'ack') { patch({ lastDecision: { ...o.lastDecision!, ack: true } }); return; }
    if (a === 'sample') { ovYaz('numune'); return; } // hatırlatmadan Kaliteye numune penceresi (kart #1083)
    if (a === 'finish') { sonBildirim.current++; cikanSepetiniAc(tmiEmirId(o.pkg)); go('done'); ovYaz('done'); return; } // açık "Geri al" bitmiş işi yeniden açmasın
    if (a === 'next') {
      const n = isler.findIndex((x, i) => i !== ai && x.state === 'queued');
      ovYaz(null);
      if (n >= 0) {
        isGecIste(n, () => {
          islerYaz((l) => l.map((x, j) => (j === n ? { ...x, fresh: false } : x)));
          say(`Yüklendi: ${isler[n]!.no} · hazırlık ${hazirlikSayisi(isler[n]!)}/4`, 'next', 'hazard');
        });
      } else say('Kuyrukta iş kalmadı', 'check');
      return;
    }
    const m = EYLEM_DURUMU[a];
    if (!m) return;
    // Başlat ilk parça onayını beklemez (129, 130 a): ilk parça Başlat'tan sonra üretilip sayılır ve kaliteye gider.
    if ((a === 'start' || a === 'resume' || a === 'restart') && ilk.acik) {
      say(`Dikkat: ilk parçayı say ve kaliteye gönder · ${ilk.yeniden ? 'karar gelene kadar sonraki sağlam parçalar sayılmaz' : 'Kalite Merkezi kararı gelene kadar sağlam parçalar karar bekler'}`, 'alert', 'hold');
    }
    if ((a === 'start' || a === 'setup') && !warned && !pv) {
      const sw = baslangicUyarilari(RL.warns, o);
      if (sw.length) { warnShowYaz({ list: sw, title: 'Başlamadan önce oku', then: () => act(a, t, true) }); return; }
    }
    // Üretim Terminali gibi: TMI emrinde başlatmadan önce girdiler istasyonda mı sorulur; eksikse istek açılır ve iş uyarıyla başlar
    // (karar 110 b). Sorulamazsa (ağ yok) başlatma gider, son sözü TMI'nin başlat denetimi söyler.
    const tmiEmir = tmiEmirId(o.pkg);
    if (a === 'start' && !hazir && !pv && tmiEmir !== null && depo.status().mode === 'server') {
      if (hazirlikta.current) return;
      hazirlikta.current = true;
      const anahtar = siraAnahtari(o);
      const devam = (uyari: string | null) => { if (live.current.o && siraAnahtari(live.current.o) === anahtar) actRef.current(a, t, true, true, uyari); };
      depo.Server.uretimHazirligi(tmiEmir, MACHINE)
        .then((c) => { const uyari = baslatmaUyarisi(c); if (uyari) bip('nok'); devam(uyari); }, () => devam(null))
        .finally(() => { hazirlikta.current = false; });
      return;
    }
    const ileti = DURUM_ILETISI[a] ?? '';
    undoable(ekUyari ? uyariliBaslatmaIletisi(ileti, ekUyari) : ileti, ekUyari ? 'alert' : DURUM_SIMGESI[a] || 'play', ekUyari ? 'hold' : m === 'running' ? 'run' : m === 'paused' ? 'hold' : 'hazard', () => go(m));
  };
  const actRef = useRef(act);
  actRef.current = act;
  const sendSample = async (auto?: boolean) => {
    if (!o.pkg) { say('Bu iş için kontrol planı yok', 'alert', 'hold'); return; }
    let items = D.due.filter((b) => D.who[b.id] !== 'op');
    // Numune stoktan teslim edilir (115 a): ilk parça önce sağlam sayılmış olmalı, hazırlıkta yapılan parça stokta yoktur (129).
    if (ilk.acik && (o.state !== 'running' || ilk.sayilan < 1) && items.some((b) => ilkParcaKapisi(o).some((f) => f.id === b.id))) {
      if (auto !== true) say(o.state === 'running' ? ILK_PARCA_ONCE_SAY_ILETISI : 'İlk parça Başlat\'tan sonra üretilir · önce başlat', 'alert', 'hold');
      return;
    }
    if (auto === true) items = otomatikNumuneOlculeri(items, D.why, o.lastDecision);
    // Zamanı gelen ölçü yokken operatör yine de numune gönderebilir (şüphe, takım değişimi): planın bütün ölçüleri gider.
    const elle = !items.length && auto !== true;
    if (elle && o.pendingReq) { say('Önceki numune kalitede · sonuç bekleniyor', 'clock', 'idle'); return; }
    if (elle) items = elleNumuneOlculeri(o.pkg.plan || []);
    if (!items.length) { say('Kontrol planında ölçü yok', 'check'); return; }
    if (pv) { say('Önizlemede gönderilmez', 'eye', 'idle'); return; }
    const reason = elle ? 'Operatör isteği' : Array.from(new Set(items.map((b) => D.why[b.id] || b.freq || 'İlk parça'))).join(' + ');
    const req: SampleRequest = {
      id: `rq${Date.now()}`, pkgId: o.pkg.id, no: o.no, part: o.part, rev: o.pkg.rev, machine: MACHINE, by: ME, at: Date.now(), reason,
      items: items.map((b) => b.id), crit: items.some((b) => b.crit), cnt: o.good, status: 'waiting', results: {},
    };
    await depo.DB.put('requests', req);
    depo.Bus.send({ type: 'sample', reqId: req.id, no: o.no, machine: MACHINE, reason });
    patch(yeniNumuneYamasi(req));
    bip('call');
    say(`${auto === true ? 'Otomatik numune isteği · ' : 'Numune isteği kalitede · onay bekleniyor · '}${items.length} ölçü · etiketle: ${o.no} #${sayi(o.good)}`, 'target', 'hold');
  };
  // Hurda yalnız nedenle yazılır (116 a).
  const addScrap = () => { if (!sayimOk('prod.run')) return; ovYaz('scrap'); };
  // Hatalı kaydı tekrar korumalıdır: cevabı kaybolan gönderim aynı kimlikle yinelenir, ikinci kol açılmaz. Ret metni TMI'nindir.
  const hataliGonder = (g: HataliGirdisi) => {
    const istek = hataliIstegi(o.pkg, g);
    if (istek === null || hataliGidiyor) return;
    hataliGidiyorYaz(true);
    void tekrarKorumaliGonder((d) => api.post<HataliCevabi>(`/uretim-emirleri/${String(istek.emirId)}/hatali`, istek.govde, {
      istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}),
    }))
      .then((c) => {
        ovYaz(null);
        bip('call');
        hataliEkYaz((e) => ({ anahtar: hataliAnahtari, adet: (e.anahtar === hataliAnahtari ? e.adet : 0) + g.adet }));
        shiftRef.current.hatali += g.adet;
        const yer = c.kolAcildi ? ` · kol ${c.hedefEmir.emirNo}` : ' · adımlar emre eklendi';
        say(`Hatalı · ${sayi(g.adet)} adet kaliteye ayrıldı${yer} · karar kalitede${c.uyari ? ` · ${c.uyari}` : ''}`, 'alert', 'hold',
          { action: { l: 'Kaliteyi çağır', fn: () => startCall(CAGRI_EKIPLERI.find((x) => x.k === 'kalite')!) } });
      }, (h: unknown) => { bip('nok'); say(`TMI kabul etmedi · ${hataIletisi(h, 'Hatalı kaydedilemedi.')}`, 'alert', 'stop'); })
      .finally(() => { hataliGidiyorYaz(false); });
  };
  const doScrap = (why: string) => {
    scrapWhy.current = why || null;
    scrapLog.current = [...scrapLog.current, o.good].slice(-5);
    shiftRef.current.scrap++;
    const u = hurdaUyarisi(o, RL.prod, scrapLog.current);
    undoable(`Hurda kaydedildi · toplam ${o.scrap + 1}`, 'trash', 'stop', () => patch({ scrap: o.scrap + 1 }));
    if (u && u.tur === 'oran') {
      setTimeout(() => { bip('nok'); say(`Hurda oranı %${u.oran.toFixed(1)} · limit %${RL.prod.scrapPct}`, 'alert', 'stop', { action: { l: 'Amiri çağır', fn: () => startCall(CAGRI_EKIPLERI.find((c) => c.k === 'amir')!) } }); }, 400);
    } else if (u && u.tur === 'artis') {
      setTimeout(() => say(`Hurda artıyor: son 20 parçada ${u.adet} hurda`, 'alert', 'stop', { action: { l: 'Kaliteyi çağır', fn: () => startCall(CAGRI_EKIPLERI.find((c) => c.k === 'kalite')!) } }), 400);
    }
  };
  const doToplu = (g: { saglam: number; hurda: number; neden: string | null }) => {
    shiftRef.current.good += g.saglam;
    shiftRef.current.scrap += g.hurda;
    scrapWhy.current = g.hurda > 0 ? g.neden : null;
    topluRef.current = true;
    undoable(`Toplu giriş · ${sayi(g.saglam)} sağlam${g.hurda ? ` · ${sayi(g.hurda)} hurda` : ''}`, 'check', 'run', () => patch({ good: o.good + g.saglam, scrap: o.scrap + g.hurda }));
  };
  /* duruş nedeni önerileri */
  const reasonSuggest = () => {
    const t = Date.now();
    const dw = suankiDurus(MACHINE, t, ayarlar.planliDuruslar, tesis);
    const molada = (anlikVardiya(t, ayarlar.vardiyalar, ayarlar.tatiller).breaks || []).some((b) => t >= b.s - 10 * 60e3 && t <= b.e);
    const son = segs.slice().reverse().find((s) => s.s === 'stopped' && s.n);
    return durusOnerileri({ o, D, takimlar: RL.prod.tools, planliDurus: dw ? dw.d : null, molada, sonDurusNedeni: son?.n ?? null, siradaki: nextOrder });
  };

  /* çağrı */
  // 15.4: bu istasyonun açık çağrısı kayıttan geri gelir (ekranda yeni çağrı açılmışsa ona dokunulmaz).
  useEffect(() => {
    if (pv) return;
    let canli = true;
    depo.Log.query('calls', { machine: MACHINE, from: Date.now() - CAGRI_GERIYE_MS }).then((rows) => {
      const a = canli ? acikCagri((rows || []) as CagriSatiri[], MACHINE, Date.now()) : null;
      const ekip = a && CAGRI_EKIPLERI.find((c) => c.k === a.ekip);
      if (a && ekip) callYaz((x) => x || (cagriyiKur(ekip, a) as unknown as Cagri));
    }).catch(() => undefined);
    return () => { canli = false; };
  }, []);
  const startCall = (c: (typeof CAGRI_EKIPLERI)[number], note?: string) => {
    bip('call');
    const t0 = Date.now();
    const sonSeg = segs[segs.length - 1];
    const why = note || (o.state === 'stopped' && yerel.oku(`lastState:${MACHINE}`) && sonSeg?.n ? nedenAdiOku(sonSeg.n) : null) || null;
    callYaz({ ...c, t0, stage: 0, who: null, note: why, times: [t0], msgs: [{ from: 'sys', text: `${c.l} ekibine iletildi${why ? ` · ${why}` : ''}`, at: t0 }] });
    if (!pv) {
      depo.Bus.send({ type: 'call', k: c.k, l: c.l, machine: MACHINE, wc: ist.wc || null, mc: curMc(), by: ME, t0, note: why, orderNo: o.no });
      void depo.Log.add('calls', { machine: MACHINE, wc: ist.wc || null, mc: curMc(), callId: String(t0), team: c.k, phase: 'open', note: why });
    }
  };
  // Hızlı yanıt operatörün iletisidir; karşı tarafın yanıtı yalnız çağrıyı alan ekrandan gelir.
  const replyCall = (q: { t: string; close?: boolean }) => {
    const at = Date.now();
    callYaz((x) => x && ({ ...x, msgs: [...x.msgs, { from: 'me', text: q.t, at }] }));
    if (q.close) setTimeout(() => endCall(), 2600);
  };
  const endCall = () => {
    callYaz((x) => {
      if (x) {
        callLogYaz((l) => [...l, { k: x.k, ms: (x.times[2] || Date.now()) - x.t0 }]);
        if (!pv) {
          void depo.Log.add('calls', { machine: MACHINE, wc: ist.wc || null, callId: String(x.t0), team: x.k, phase: 'done' });
          depo.Bus.send({ type: 'call-done', machine: MACHINE, t0: x.t0, k: x.k });
        }
      }
      return null;
    });
    ovYaz((o2) => (o2 === 'calltrack' ? null : o2));
    say('Çağrı kapatıldı', 'check', 'run');
  };
  live.current = {
    sendSample, startCall, o, call,
    // Makine veri toplayıcısından (sunucu) gelen sayım ve durum: sunucuda src 'auto' olarak zaten kaydedildi.
    mcData: (m) => {
      const delta = Number(m['delta']) || 0;
      // 684: istasyonda birden çok iş açıkken başka makinenin sayımı ekrandaki işe yazılmaz; o makinedeki açık işin satırı güncellenir.
      const mc = m['mc'] == null ? null : String(m['mc']);
      const ekrandakiMc = curMc();
      if (mc && ekrandakiMc && mc !== String(ekrandakiMc)) {
        if (m['kind'] === 'count' && delta) {
          islerYaz((l) => l.map((x) => (!x.empty && x.state !== 'done' && x.pkg && String(x.pkg.mc) === mc
            ? (m['ck'] === 'scrap' ? { ...x, scrap: x.scrap + delta } : { ...x, good: x.good + delta }) : x)));
        }
        return;
      }
      if (o.empty || o.state === 'done') return;
      if (m['kind'] === 'count' && delta) {
        autoRef.current.cnt = true;
        if (m['ck'] === 'scrap') patch({ scrap: o.scrap + delta });
        else if (delta < 0 || iyiArtiNedeni(delta) === null) { shiftRef.current.good += delta; patch({ good: o.good + delta }); }
      }
      const st = m['state'] as Is['state'] | undefined;
      if (m['kind'] === 'state' && st && st !== o.state) {
        autoRef.current.state = true;
        go(st, null);
        if (st === 'stopped') { ovYaz('reason'); say('Makine durdu · nedeni seç', 'stop', 'stop'); } else if (st === 'running') say('Makine çalışıyor (makine verisi)', 'play', 'run');
      }
    },
  };
  /* çağrı yükseltme: belirlenen sürede kimse üstlenmezse vardiya amirine */
  useEffect(() => {
    if (!call || pv || call.stage > 0 || call.esc || !(POLICY.callEsc > 0)) return;
    const t = setTimeout(() => {
      callYaz((x) => (x && x.t0 === call.t0 && x.stage === 0 ? { ...x, esc: true, msgs: [...x.msgs, { from: 'sys', text: `${POLICY.callEsc} dk yanıt yok · vardiya amirine yükseltildi`, at: Date.now() }] } : x));
      depo.Bus.send({ type: 'call', esc: true, k: call.k, l: call.l, machine: MACHINE, wc: ist.wc || null, by: ME, t0: call.t0, note: call.note, orderNo: o.no });
      void depo.Log.add('calls', { machine: MACHINE, wc: ist.wc || null, callId: String(call.t0), team: call.k, phase: 'esc' });
      bip('call');
      say(`${call.l} çağrısına ${POLICY.callEsc} dk yanıt yok · amire yükseltildi`, 'bell', 'stop');
    }, Math.max(500, call.t0 + POLICY.callEsc * 60e3 - Date.now()));
    return () => clearTimeout(t);
  }, [call && call.t0, call && call.stage, call && call.esc]);

  /* vardiya özeti */
  const ustOzet = SL.ok && !SC.sh.tanimsiz ? vardiyaUretimi(SC.good, SC.expected) : null;
  const shiftStats = () => vardiyaOzeti(vardiyaHesabi(SL, Date.now(), ortam), {
    kisi: ME, istasyon: MACHINE, cevrim: o.cycle, olcumUygun: shiftRef.current.mOk, olcumRed: shiftRef.current.mNok,
    cagriSureleri: callLog.map((x) => x.ms), cagriAcik: !!call, nedenAdi: (k) => nedenAdiYaz(k, nedenAdiOku),
    // 1190: TMI işindeyken ya da vardiyada hatalı girildiyse kutu "hatalı" der; TMI dışı istasyonda hurda kalır.
    ...(hataliTmi || shiftRef.current.hatali > 0 ? { hatali: shiftRef.current.hatali } : {}),
  });
  const setReady = (k: string) => islerYaz((l) => l.map((x) => (nextOrder && siraAnahtari(x) === siraAnahtari(nextOrder) ? { ...x, ready: { ...(x.ready as Record<string, boolean> | undefined), [k]: !((x.ready as Record<string, boolean> | undefined) || {})[k] } } : x)));
  const isSec = (i: number, sonra?: () => void) => isGecIste(i, () => { islerYaz((l) => l.map((x, j) => (j === i ? { ...x, fresh: false } : x))); sonra?.(); });
  const ertele = (g: Gorev) => { if (!g.key) return; snoozeYaz((s) => ({ ...s, [g.key!]: Date.now() + 600000 })); say('10 dakika sonra tekrar hatırlatılacak', 'clock', 'idle'); };
  const izinli = (a: GorevEylemi) => !YAZAN.has(a) || (uretir && (a !== 'call' || !pv));
  const planliGec = uretir ? (code: string) => undoable(`Planlı duruş · ${nedenAdiOku(code) || ''}`, 'stop', 'done', () => go('stopped', code)) : null;
  const pdSimdi = suankiDurus(MACHINE, simdi, ayarlar.planliDuruslar, tesis);
  const pdSonra = pdSimdi ? null : siradakiDurus(MACHINE, simdi, ayarlar.planliDuruslar, tesis, 30 * 60e3);

  /* ekran parçaları */
  const uyarili = RL.warns.some((w) => w.t);
  const panelSimgesi = OT.simge;
  const sekmeler = isSekmeleri(o, !!Panel, OT.tab || OT.short, panelSimgesi, D);
  // 600 a: kalite istasyonunda sayaç, toplu giriş, numune şeridi ve takım kartı yerine gelen numunelerin ve lotun Kabul/Red'i.
  const kaliteIstasyonu = ist.t === 'kalite';
  const takimKarti = kaliteIstasyonu ? null : <TakimKarti takimlar={RL.prod.tools} is={o} degisti={changeTool} kilitli={!uretir} />;
  const analiz = <Analiz c={SC} simdi={simdi} duruslar={durusPencereleri(MACHINE, SC.sh.s, SC.sh.e, ayarlar.planliDuruslar, tesis)} nedenAdiOku={nedenAdiOku} planliMi={planliMi} />;
  const resim = <div className="tc-ay1-resim"><Suspense fallback={null}><TeknikResim kontrol={onizResimKontrolu ?? resimKontrolu} /></Suspense></div>;
  const panel = Panel ? <Panel key={siraAnahtari(o)} api={stApi} kurallar={RL} /> : null;
  const adimlar = b
    ? <Adimlar key={'oniz:' + siraAnahtari(b)} adimlar={b.pkg && b.pkg.steps} emirId={tmiEmirId(b.pkg)} onizleme />
    : <Adimlar key={siraAnahtari(o)} adimlar={o.pkg && o.pkg.steps} emirId={tmiEmirId(o.pkg)} onizleme={pv} />;
  const onizBandi = b ? (
    <div className="tc-ay1-onizleme-bandi" role="status">
      <Simge ad="eye" boyut="k" /><span>Önizleme · {b.no} · teknik resim ve adımlar salt okunur</span>
      <Dugme onClick={() => bakilanYaz(null)}>Ekrandakine dön</Dugme>
    </div>
  ) : null;
  const notlar = (
    <>
      {hazirlikUyarisi(o.pkg) ? <div className="tc-ay1-not" role="status"><Simge ad="alert" boyut="k" /><span>{hazirlikUyarisi(o.pkg)}</span></div> : null}
      {o.pkg && o.pkg.note ? <div className="tc-ay1-not"><Simge ad="alert" boyut="k" /><span>{o.pkg.note}</span></div> : null}
    </>
  );
  const bantlar = (
    <>
      {!o.empty ? <PlanBandi simdiki={pdSimdi} siradaki={pdSonra} simdi={simdi} nedenAdi={nedenAdiOku} durduruldu={o.state === 'stopped'} gec={planliGec} /> : null}
      {handover ? (
        <div className="tc-ay1-bant" data-durum="ayar">
          <Simge ad="alert" />
          <div><span className="tc-ay1-ust-yazi">Önceki vardiyadan not{dar ? '' : ` · ${handover.by}`}</span><b>{handover.note}</b></div>
          <button type="button" className="tc-ay1-kapat" onClick={() => handoverYaz(null)} aria-label="Kapat"><Simge ad="x" boyut="k" /></button>
        </div>
      ) : null}
    </>
  );
  // 790: makine seçici çarkın Makineler şerididir; kural aynıdır (iki makineden azsa seçim yok, çalışan işte değişmez, ayrılmış makine kilitli).
  const makineler = ist.mcs.length >= 2 ? ist.mcs : [];
  const seciliMak = kilitsizSecim(seciliMakineler(mcSel, ist.mcs), ayrim);
  const atananMak = (ayrim && ayrim.planMakinesi) || (o.pkg && o.pkg.mc);
  const makEngel = pv ? 'Önizlemede makine seçilmez' : o.empty ? 'Açık iş yok' : !yetkiVar('prod.run') ? 'Bu rol makine seçemez'
    : makineSecimiGorunur(makineler, o.state) ? null : 'Çalışan işte makine değişmez; başka makine için önce durdur';
  const carkMakinesi = (m: (typeof makineler)[number]): CarkMakinesi => {
    const a = makineAyrimi(ayrim, m.id);
    return { id: m.id, ad: m.name, secili: seciliMak.includes(m.id), plan: m.id === atananMak, kilit: a ? ayrimAciklamasi(a, saatMetni) : null };
  };
  const tuslar: SayimTusu[] = [];
  // 1046 a: geniş düzende sayım tuşları üstte iki büyük tuş, düzeltme (−1) tuşları altlarında tek kısa sıra; sıra bu dizinin sırasıdır.
  if (uretir) tuslar.push({ etiket: 'İyi +1', simge: 'plus', ton: 'iyi', kapali: iyiArtiKapali || o.good >= o.target, bas: () => { if (!sayimOk('prod.run', iyiArtiNedeni(1))) return; shiftRef.current.good++; undoable(`İyi parça +1 · ${sayi(o.good + 1)}`, 'plus', 'run', () => patch({ good: o.good + 1 })); } });
  if (uretir) tuslar.push(hataliTmi ? { etiket: 'Hatalı', simge: 'trash', ton: 'hurda', kapali: kapali || hataliGidiyor, bas: addScrap } : { etiket: 'Hurda +1', simge: 'trash', ton: 'hurda', kapali, bas: addScrap });
  if (duzeltir) tuslar.push({ etiket: 'İyi −1', simge: 'minus', ton: 'duz', aria: 'İyi parça eksi bir', kapali: iyiKapali || o.good <= 0, bas: () => { if (iyiSayimOk('prod.fix')) undoable(`İyi parça −1 · ${sayi(o.good - 1)}`, 'minus', 'idle', () => patch({ good: o.good - 1 })); } });
  if (duzeltir) tuslar.push({ etiket: 'Hurda −1', simge: 'minus', ton: 'hurda', aria: 'Hurda eksi bir', kapali: kapali || o.scrap <= 0, bas: () => { if (sayimOk('prod.fix')) undoable(`Hurda −1 · toplam ${sayi(o.scrap - 1)}`, 'minus', 'idle', () => patch({ scrap: o.scrap - 1 })); } });
  // 702: toplu giriş ekranda yer kaplamasın diye tuştan açılan pencerededir.
  if (uretir) tuslar.push({ etiket: 'Toplu giriş', simge: 'layers', ton: 'duz', kapali, bas: () => ovYaz('toplu') });
  const sayac = (
    <div className="tc-ay1-sayac">
      <SayacKadrani is={o} etiket={OT.cnt} birim={OT.unit} cevrim={cevrim} {...(hataliSayisi === undefined ? {} : { hatali: hataliSayisi })} duzelt={duzeltir ? () => { if (iyiSayimOk('prod.fix')) ovYaz('num'); } : null} />
      {/* 693: telefonda İyi +1 ve Hurda +1 alttaki eylem çubuğunda; sayacın altında yalnız düzeltme (−1) tuşları kalır. */}
      <SayimTuslari tuslar={dar && uretir ? tuslar.filter((t) => t.simge === 'minus' || t.simge === 'layers') : tuslar} />
    </div>
  );
  const toplu = uretir ? (
    <TopluGiris key={siraAnahtari(o)} kalan={o.target - o.good} kapali={kapali} nedenler={ayarlar.hurdaNedenleri} hurdaEtiketi={hataliTmi ? 'Hatalı' : 'Hurda'}
      kaydet={(g) => { const tamam = topluKaydet(g); if (tamam) ovYaz(null); return tamam; }} />
  ) : null;
  const kaliteGorunumu = kaliteIstasyonu && !pv ? (
    <KaliteGorunumu istasyon={MACHINE} is={o} izinli={yetkiVar('q.decide')} olcebilir={yetkiVar('q.meas')} soyle={(m, t) => say(m, t === 'ok' ? 'check' : 'alert', t === 'ok' ? 'run' : 'stop')} />
  ) : null;
  const gorev = (mobil: boolean, ek?: ReactNode) => (
    <GorevKarti gorev={task} izinli={izinli} ertele={ertele} ek={ek}
      eylem={(a, g) => { if (mobil && (a === 'measure' || a === 'drawing')) mvYaz('draw'); act(a, g); }} />
  );
  // 566: numune planı paketten (Hazırlık), ilerleme terminalin ölçümleri, kontrol takvimi ve kalitedeki numuneden.
  const serit = o.pkg ? (
    <NumuneSeridi girdi={{
      kurallar: numunePlani(o.pkg).map((r) => ({
        id: r.id, etiket: numuneEtiketi(r), olcen: (r.who && r.who.length ? r.who : ['q' as const]).map((w) => OLCENLER[w].l).join('→'),
        ilk: r.when === 'first', olculer: numuneOlculeri(o.pkg!, r).map((b) => b.id), aralik: numuneAraligi(r, o, simdi),
      })),
      meas: o.meas || {}, bekleyen: o.pendingReq ? o.pendingItems || [] : [], zamani: D.due.map((b) => b.id),
      siradaki: D.next ? { olcu: D.next.b.id, v: D.next.v, u: D.next.u } : null, ilkKarar: ilkKarari,
    }} />
  ) : null;
  const durumDugmeleri = (mobil: boolean) => (uretir ? (
    <DurumDugmeleri durum={o.state} pasif={!!o.empty} erken={(e) => say(`${e} için 1,2 sn basılı tut`, 'alert', 'hold')}
      eylem={(d) => { if (mobil && d.eylem === 'drawing') { mvYaz('draw'); return; } act(d.eylem); }} />
  ) : !pv ? <p className="tc-ay1-soluk tc-ay1-izin">Bu rol üretim kaydı yapamaz</p> : null);
  // 702: Şimdi kartı ve numune şeridi tek şeritte (şerit görevin başlığının altında); ikisi de yoksa şerit çizilmez.
  const simdiSeridi = (mobil: boolean) => {
    const sr = kaliteGorunumu ? null : serit;
    return task || sr ? <div className="tc-ay1-simdi">{task ? gorev(mobil, sr) : sr}</div> : null;
  };
  // 790: tek çark, iki şerit. Çarkta her iş kısa kartladır; ekrandaki işin tam kartı çarkın altındadır (828 a, prototip). Başka işe
  // bakmak önizlemedir, geçiş "Bu işe geç" ile ve bugünkü geçiş sorusuyla olur. Geçiş işi başlatmaz.
  const siradakiAnahtar = nextOrder ? siraAnahtari(nextOrder) : undefined;
  // 793 b: istasyon da çarktadır; liste ve geçiş istasyon seçicininkidir (yetkili istasyonlar, cihaz kaydı, ekran baştan kurulur).
  const carkIstasyonlari = secilebilirIstasyonlar(istasyonListesi(tesis).filter((m) => isMerkezinde(kisi, m.wc)), yetkiVar('prod.station'), kisi && kisi.sts);
  const istSira = carkIstasyonlari.findIndex((m) => m.id === MACHINE);
  const istasyonaGec = (id: string) => { if (pv) yerel.yaz('pvStation', id); else yerel.yaz('station', id); yenidenKur(); };
  const carki = (ekranda: ReactNode) => {
    if (isler.length < 2 && !makineler.length && carkIstasyonlari.length < 2) return ekranda;
    const isSeridi: CarkSeridi = {
      anahtar: 'is', ad: 'İşler', simge: 'list', sayi: isler.length, etkin: ai, bak: b ? bi : ai, bakYaz,
      ciz: (i) => {
        const x = isler[i] ?? o;
        return <IsOnizKarti is={x} siradaki={siraAnahtari(x) === siradakiAnahtar} ekranda={i === ai} makine={i === ai ? curMc() : (x.pkg && x.pkg.mc) || null} />;
      },
      eylem: (i) => <IsEylemi ekranda={i === ai || !isler[i]} don={() => bakilanYaz(null)} gec={() => isSec(i)} />,
    };
    const seritler: CarkSeridi[] = [isSeridi];
    if (makineler.length) {
      seritler.push({
        anahtar: 'mak', ad: 'Makineler', simge: 'cpu', sayi: makineler.length, etkin: -1, bak: Math.min(makBak, makineler.length - 1), bakYaz: makBakYaz,
        ciz: (i) => <MakineKarti makine={carkMakinesi(makineler[i]!)} />,
        eylem: (i) => {
          const m = carkMakinesi(makineler[i]!);
          return <MakineEylemi makine={m} engel={makEngel} ozet={secimOzeti(seciliMak, atananMak)} degistir={() => mcSelYaz(secimiDegistir(seciliMak, m.id))} />;
        },
      });
    }
    if (carkIstasyonlari.length >= 2) {
      seritler.push({
        anahtar: 'ist', ad: 'İstasyonlar', simge: 'layers', sayi: carkIstasyonlari.length, etkin: istSira,
        bak: Math.min(istBak ?? Math.max(istSira, 0), carkIstasyonlari.length - 1), bakYaz: istBakYaz,
        ciz: (i) => { const m = carkIstasyonlari[i]!; return <IstasyonKarti istasyon={{ id: m.id, ad: m.name, merkez: m.wcName, bu: m.id === MACHINE }} />; },
        eylem: (i) => { const m = carkIstasyonlari[i]!; return <IstasyonEylemi bu={m.id === MACHINE} gec={() => istasyonaGec(m.id)} />; },
      });
    }
    return <><TerminalCarki seritler={seritler} />{ekranda}</>;
  };
  const kuyruk = <IsKuyrugu isler={isler} aktif={ai} siradaki={nextOrder ? siraAnahtari(nextOrder) : undefined} onde={ondeNo} kartlar={kartlar} kartla={pv ? null : kartlaAc} sec={(i) => { bakYaz(i); if (dar) mvYaz('prod'); }} />;
  const uyariCipi = (dur: boolean) => (uyarili ? (
    <button type="button" className="tc-ay1-uyari-cip" onClick={(e) => { if (dur) e.stopPropagation(); act('warns'); }} aria-label="Bu işin uyarıları" title="Bu işin uyarıları">
      <Simge ad="bell" boyut="k" />{RL.warns.filter((w) => w.t).length}
    </button>
  ) : null);
  const vardiyaMetni = vardiya.tanimsiz ? 'Vardiya tanımsız' : `Vardiya ${vardiya.name}`;

  const pencereler = (
    <>
      {ov === 'toplu' && toplu ? <Pencere acik kapat={() => ovYaz(null)} baslik="Toplu giriş">{toplu}</Pencere> : null}
      {ov === 'isler' ? (
        <Pencere acik kapat={() => ovYaz(null)} baslik="İş emirleri">
          <IsKuyrugu isler={isler} aktif={ai} siradaki={nextOrder ? siraAnahtari(nextOrder) : undefined} onde={ondeNo} kartlar={kartlar}
            kartla={pv ? null : (i, k) => { ovYaz(null); kartlaAc(i, k); }} sec={(i) => { ovYaz(null); bakYaz(i); }} />
        </Pencere>
      ) : null}
      {scan ? (
        <Pencere acik kapat={() => scanYaz(null)} baslik={scan.baslik}>
          <KodOkuyucu kendiliginden dokunmatikteOdakYok {...(scan.ipucu ? { ipucu: scan.ipucu } : {})} okundu={(c) => { const f = scan.okundu; scanYaz(null); bip('ok'); f(c); }} />
        </Pencere>
      ) : null}
      {ov === 'station' ? <IstasyonSecici simdiki={MACHINE} kapat={() => ovYaz(null)} sec={(id) => { if (pv) yerel.yaz('pvStation', id); else yerel.yaz('station', id); yenidenKur(); }} /> : null}
      {warnShow ? <UyariPenceresi liste={warnShow.list} {...(warnShow.title ? { baslik: warnShow.title } : {})} okudum={() => { const w = warnShow; ackWarns(w.list); warnShowYaz(null); bip('ok'); if (w.then) setTimeout(w.then, 50); }} /> : null}
      {ov === 'numune' ? <NumunePenceresi istasyon={MACHINE} numune={{ hazir: !!o.pkg, bekliyor: !!o.pendingReq, gonder: () => { void sendSample(); } }} kapat={() => ovYaz(null)} /> : null}
      {ov === 'scrap' && hataliTmi ? <HataliPenceresi nedenler={ayarlar.hurdaNedenleri} yukleniyor={hataliGidiyor} kapat={() => ovYaz(null)} kaydet={hataliGonder} /> : null}
      {ov === 'scrap' && !hataliTmi ? <HurdaPenceresi nedenler={ayarlar.hurdaNedenleri} kapat={() => ovYaz(null)} sec={(code) => { ovYaz(null); doScrap(code); }} /> : null}
      {ov === 'reason' ? (
        <DurusPenceresi istasyon={MACHINE} nedenler={ayarlar.durusNedenleri} oneriler={reasonSuggest()} otomatikCagri={POLICY.autoCall} kapat={() => ovYaz(null)}
          kaydet={(r) => { ovYaz(null); if (o.state === 'stopped') noteStop(r.code); else undoable(`Duruş kaydedildi · ${r.l}`, 'stop', 'stop', () => go('stopped', r.code)); }} />
      ) : null}
      <TusTakimi acik={ov === 'num'} baslik="İyi parça sayısını düzelt" birim="adet" ilkDeger={o.good} enCok={o.target} enCokHane={6}
        buyukDegisim={(v) => (Math.abs(v - o.good) > Math.max(20, o.good * 0.1) ? `Büyük değişiklik: ${sayi(o.good)} → ${sayi(v)} · doğruysa yeniden onayla` : null)}
        kapat={() => ovYaz(null)}
        onayla={(v) => { if (v > o.good && !sayimOk('prod.fix', iyiArtiNedeni(v - o.good))) return; ovYaz(null); undoable(`Sayaç güncellendi · ${sayi(v)}`, 'check', 'run', () => patch({ good: v })); }} />
      {ov === 'gecis' && gecis ? (
        <GecisPenceresi calisanlar={gecisteDuraklatilacaklar(isler, gecis.i).map((j) => isler[j]!.no)} hedef={isler[gecis.i]?.no ?? ''}
          kapat={() => { ovYaz(null); gecisYaz(null); }} devam={() => gecisiBitir(false)} duraklat={() => gecisiBitir(true)} />
      ) : null}
      {ov === 'call' ? <CagriPenceresi kapat={() => ovYaz(null)} cagir={(c) => { ovYaz(null); startCall(c); }} /> : null}
      {ov === 'calltrack' && call ? <CagriTakibi cagri={call} kapat={() => ovYaz(null)} yanitla={replyCall} bitir={endCall} /> : null}
      {ov === 'prepnext' && nextOrder ? <SonrakiHazirlik is={nextOrder} kapat={() => ovYaz(null)} degistir={setReady} /> : null}
      {ov === 'shift' ? (
        <VardiyaPenceresi ozet={shiftStats()} vardiyaEtiketi={vardiya.label} kapat={() => ovYaz(null)}
          devret={(not) => { ovYaz(null); if (not && !pv) void depo.DB.put('kv', { note: not, by: `${ME} · ${vardiyaMetni}`, at: Date.now() }, 'handover'); say(`Vardiya devredildi${not ? ' · not sonraki vardiyaya iletildi' : ''}`, 'check', 'run'); }} />
      ) : null}
      {ov === 'ozetim' ? <Pencere acik kapat={() => ovYaz(null)} baslik="Özetim" tur="tam"><Ozetim /></Pencere> : null}
      {ov === 'done' ? <Konfeti /> : null}
      <OzetKatmani acik={ov === 'done'} ustYazi={`${o.no} · TMI'ye bildirildi`} baslik="İş emri tamamlandı" kapat={() => ovYaz(null)}
        satirlar={[{ etiket: 'İyi parça', deger: sayi(o.good) }, { etiket: 'Hurda', deger: String(o.scrap), ton: 'durdu' }, { etiket: 'Kalite', deger: `%${kaliteYuzdesi(o)}` }]}
        {...(uretir ? { birincil: { metin: 'Sıradaki işe geç', simge: 'next' as SimgeAdi, tikla: () => act('next') } } : {})} />
      {away ? <UzakMod is={o} gorev={task} D={D} since={since} istasyon={MACHINE} {...(hataliSayisi === undefined ? {} : { hatali: hataliSayisi })} uyan={() => { lastAct.current = Date.now(); awayYaz(false); }} /> : null}
    </>
  );

  const gecisSatirlari = pv ? [] : GECISLER.filter((g) => acilabilir(g.sayfa)).map((g) => (
    <MenuSatiri key={g.sayfa} simge={g.simge} baslik={g.baslik} alt={g.alt} tikla={() => { ovYaz(null); git(g.sayfa); }} />
  ));

  if (dar) {
    const MV = mobilGorunumler(o, ozetVar, !!Panel, OT.short, panelSimgesi, D, isler.filter((x) => x.fresh).length);
    const gor = MV.some((x) => x.id === mv) ? mv : 'prod';
    const cubuk = gor === 'prod' && uretir && !kaliteGorunumu
      ? <EylemCubugu durum={o.state} pasif={!!o.empty} eylem={(d) => act(d.eylem)} tuslar={tuslar.filter((t) => t.simge !== 'minus' && t.simge !== 'layers')} />
      : null;
    return (
      <div className="tc-ay1 tc-ay1-dar" data-durum={IS_DURUM_RENGI(o.state)} data-dokunmatik="" data-cubuk={cubuk ? '' : undefined}>
        <header className="tc-ay1-mobil-ust">
          <span className="tc-ay1-istasyon" title="İstasyon · çarkın İstasyonlar şeridinden değişir"><b>{MACHINE}</b><DurumSuresi durum={o.state} since={since} /></span>
          <CagriCipi cagri={call} ac={() => ovYaz('calltrack')} />
          {/* Darda saat yok; kopukluk ve kayıt riski operatörden saklanmasın diye durum üst çubukta kalır. */}
          <BaglantiDurumu />
          {!call && !pv ? <button type="button" className="tc-ay1-simge-dugme" onClick={() => ovYaz('call')} aria-label="Çağrı"><Simge ad="bell" /></button> : null}
          <button type="button" className="tc-ay1-simge-dugme" onClick={() => ovYaz('menu')} aria-label="Menü"><Simge ad="list" /></button>
        </header>
        <div className="tc-ay1-gorunum">
          {gor === 'ozet' ? <Ozetim /> : null}
          {gor === 'prod' ? (
            <div className="tc-ay1-uretim">
              {bantlar}
              {carki(<IsOzeti is={o} acik={isAcik} degistir={() => isAcikYaz((x) => !x)} />)}
              {uyariCipi(false)}
              {/* 685, 702: sayaç ilk ekrandadır; üstünde yalnız tek satırlık Şimdi ve numune şeridi. */}
              {simdiSeridi(true)}
              {kaliteGorunumu ?? sayac}
              <IsEtiketleri is={o} />
              {pv ? null : <MalzemeCipi istasyon={MACHINE} emirId={tmiEmirId(o.pkg)} />}
              {pv ? null : <Sepetler istasyon={MACHINE} emirId={tmiEmirId(o.pkg)} />}
              <EtkinKart is={o} kartlar={kartlar} />
              {notlar}
              {durumDugmeleri(true)}
            </div>
          ) : null}
          {gor === 'st' && panel ? <div className="tc-ay1-bolme">{panel}</div> : null}
          {gor === 'draw' ? <>{onizBandi}{resim}</> : null}
          {gor === 'queue' ? kuyruk : null}
          {gor === 'steps' ? <>{onizBandi}{adimlar}</> : null}
          {gor === 'ana' ? <div className="tc-ay1-bolme">{takimKarti}{analiz}</div> : null}
        </div>
        <div className="tc-ay1-alt">
          {cubuk}
          <nav className="tc-ay1-alt-gezinme" aria-label="Terminal görünümleri">
            {MV.map((t) => (
              <button key={t.id} type="button" aria-current={gor === t.id ? 'page' : undefined} onClick={() => mvYaz(t.id)}>
                <span className="tc-ay1-alt-simge"><Simge ad={t.simge} />{t.n ? <em data-durum={t.id === 'draw' ? 'ayar' : undefined}>{t.n}</em> : null}</span>{t.l}
              </button>
            ))}
          </nav>
        </div>
        {ov === 'menu' ? (
          <Pencere acik kapat={() => ovYaz(null)} baslik="Menü" tur="yan">
            <p className="tc-ay1-soluk">{ME} · {MACHINE}</p>
            <MenuSatiri simge="chart" baslik="Vardiya özeti ve devir" alt="Üretim, kalite, not bırak" tikla={() => ovYaz('shift')} />
            <MenuSatiri simge="expand" baslik="Uzak mod" alt="Uzaktan okunur dev sayaç" tikla={() => { ovYaz(null); awayYaz(true); }} />
            <MenuSatiri simge="ruler" baslik="Teknik resim · 3B" alt="Odak modu resim panelinde" tikla={() => { ovYaz(null); mvYaz('draw'); }} />
            {gecisSatirlari}
          </Pencere>
        ) : null}
        {pencereler}
      </div>
    );
  }

  const gecerliSekme = sekmeler.some((s) => s.id === tab) ? tab : sekmeler[0]!.id;
  const saat = new Date(simdi);
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return (
    <div className="tc-ay1 tc-ay1-genis" data-durum={IS_DURUM_RENGI(o.state)} data-dokunmatik="">
      <header className="tc-ay1-ust">
        <span className="tc-ay1-istasyon" title="İstasyon · çarkın İstasyonlar şeridinden değişir">
          <b>{ist.id}</b><small>{ist.l.split(' · ').slice(1).join(' · ')}</small>
        </span>
        <DurumSuresi durum={o.state} since={since} />
        {pv ? <Rozet ton="uyari">Önizleme · kayıt yapılmaz</Rozet> : null}
        <span className="tc-ay1-bosluk" />
        <CagriCipi cagri={call} ac={() => ovYaz('calltrack')} />
        {ozetVar ? <button type="button" className="tc-ay1-simge-dugme" onClick={() => ovYaz('ozetim')} title="Özetim" aria-label="Özetim"><Simge ad="user" /></button> : null}
        <button type="button" className="tc-ay1-simge-dugme" onClick={() => awayYaz(true)} title="Uzak mod" aria-label="Uzak mod"><Simge ad="expand" /></button>
        <span className="tc-ay1-isler-dugme"><Dugme tur="ikincil" simge="list" onClick={() => ovYaz('isler')}>İşler · {isler.filter((x) => !x.empty && x.state !== 'done').length}</Dugme></span>
        {!pv ? <Dugme tur="ikincil" simge="bell" onClick={() => ovYaz('call')}>Çağrı</Dugme> : null}
        <BaglantiDurumu />
        <span className="tc-ay1-saat"><b>{iki(saat.getHours())}:{iki(saat.getMinutes())}</b><small>{GUN_ADLARI[saat.getDay()]} {saat.getDate()} {AYLAR[saat.getMonth()]} · {vardiyaMetni}</small></span>
        <button type="button" className="tc-ay1-simge-dugme" onClick={temaDegistir} title="Tema değiştir" aria-label="Tema değiştir"><Simge ad={tema === 'dark' ? 'sun' : 'moon'} /></button>
        {/* 848 a: genişte Menü yalnız geçiş varsa; öteki satırlar (vardiya özeti, uzak mod, resim) başlıkta zaten var. */}
        {gecisSatirlari.length > 0 ? <button type="button" className="tc-ay1-simge-dugme" onClick={() => ovYaz('menu')} title="Menü" aria-label="Menü"><Simge ad="list" /></button> : null}
        <button type="button" className="tc-ay1-kisi" onClick={() => ovYaz('shift')} title="Vardiya özeti ve devir">
          <span className="tc-ay1-avatar">{basHarfler(ME)}</span>
          <span><b>{ME}</b><small>{[ustOzet && ustOzet.metin, kalanMetni(vardiyaKalanDk(vardiya, simdi))].filter(Boolean).join(' · ') || 'Vardiya özeti'} ›</small></span>
        </button>
      </header>
      {/* 791 b: iki sütun (üretim, ayrıntı); iş listesi "İşler" düğmesinden açılır. Sütunlar ekran yüksekliğine sığar, taşan sütun kendi içinde kayar. */}
      <div className="tc-ay1-izgara">
        <div className="tc-ay1-orta tc-ay1-sutun">
          {bantlar}
          {carki(
          <section className="tc-ay1-aktif" aria-label="Aktif iş emri">
            <div>
              <span className="tc-ay1-ust-yazi">Aktif iş emri {o.urgent ? <span className="tc-ay1-etiket" data-durum="durdu">Acil</span> : null}</span>
              <IsAlanlari is={o} baslik />
              <IsEtiketleri is={o} />
              {pv ? null : <MalzemeCipi istasyon={MACHINE} emirId={tmiEmirId(o.pkg)} />}
              {pv ? null : <Sepetler istasyon={MACHINE} emirId={tmiEmirId(o.pkg)} />}
              {notlar}
            </div>
            <div className="tc-ay1-olgular">
              {uyariCipi(false)}
            </div>
          </section>,
          )}
          <EtkinKart is={o} kartlar={kartlar} />
          <section className="tc-ay1-sahne" aria-label="Üretim">
            {simdiSeridi(false)}
            {kaliteGorunumu ?? sayac}
            {durumDugmeleri(false)}
          </section>
        </div>
        <div className="tc-ay1-sag tc-ay1-sutun">
          <Sekmeler etiket="İş ayrıntısı" secili={gecerliSekme} sec={(a) => tabYaz(a)}
            sekmeler={sekmeler.map((s) => ({ anahtar: s.id, baslik: s.n ? `${s.l} (${s.n})` : s.l, simge: s.simge }))} />
          {gecerliSekme === 'draw' || gecerliSekme === 'steps' ? onizBandi : null}
          <div className="tc-ay1-bolme" role="tabpanel">
            {gecerliSekme === 'st' ? panel : null}
            {gecerliSekme === 'draw' ? resim : null}
            {gecerliSekme === 'steps' ? adimlar : null}
            {gecerliSekme === 'ana' ? <>{takimKarti}{analiz}</> : null}
          </div>
        </div>
      </div>
      {ov === 'menu' ? (
        <Pencere acik kapat={() => ovYaz(null)} baslik="Menü" tur="yan">
          <p className="tc-ay1-soluk">{ME} · {MACHINE}</p>
          {gecisSatirlari}
        </Pencere>
      ) : null}
      {pencereler}
    </div>
  );
}

const IS_DURUM_RENGI = (s: string) => ({ queued: 'sirada', setup: 'ayar', running: 'calisiyor', paused: 'durakli', stopped: 'durdu', done: 'bitti' } as const)[s as 'queued'] ?? 'sirada';

// Terminalden öteki Arkon sayfalarına geçiş (820 b); her satır yalnız o sayfayı açabilene görünür, yetki genişlemez. İlk ikisi eski
// menünün satırlarıdır.
const GECISLER: readonly { sayfa: ArkonSayfasi; simge: SimgeAdi; baslik: string; alt: string }[] = [
  { sayfa: 'kalite', simge: 'target', baslik: 'Kalite istasyonu', alt: 'Numune ölçümü' },
  { sayfa: 'hazirlik', simge: 'layers', baslik: 'Üretim Terminali Hazırlık', alt: 'İş paketi hazırla' },
  { sayfa: 'cizim', simge: 'lab', baslik: 'Çizim', alt: 'PDF ve 3B okuma ayarları' },
  { sayfa: 'kuyruk', simge: 'list', baslik: 'Kuyruk', alt: 'Plan kuyruğu, salt okunur' },
];

function MenuSatiri({ simge, baslik, alt, tikla }: { simge: SimgeAdi; baslik: string; alt: string; tikla: () => void }): ReactNode {
  return <button type="button" className="tc-ay1-menu-satir" onClick={tikla}><Simge ad={simge} /><span><b>{baslik}</b><small>{alt}</small></span></button>;
}

