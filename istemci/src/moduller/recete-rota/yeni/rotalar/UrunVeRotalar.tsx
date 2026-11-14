import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dugme, Menu, OnayPenceresi, Simge, useBildirim, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import {
  kolaEkle, adimSil, ortalamaGunSaati, adimSurukle, agacKur, agacUrunleri, acikRevizyon, malzemeMaliyetiSonucu, rotaSahibiOlur, rotaSorunlari,
  sirali, statuNo, yeniAdim, yururlukteki, type Operasyon,
} from './kurallar.ts';
import { sayi, YOK } from '../bicim.ts';
import { tercihOku, tercihYaz, type RotaEkrani, type Secim } from './ortak.tsx';
import { useRotaDuzeni, yeniKimlik } from './useRotaDuzeni.ts';
import { duzenlemeAcar, yeniRotaAcar } from '../yetki.ts';
import { AkisSemasi, SURUKLE_TURU, surukleCoz } from './AkisSemasi.tsx';
import { YatayHat } from './YatayHat.tsx';
import { AkisTablosu } from './AkisTablosu.tsx';
import { PatlamisRota } from './PatlamisRota.tsx';
import { AdimPaneli, PaletSeridi } from './AdimPaneli.tsx';
import { DuzenlemePaneli, PanelSeridi } from './DuzenlemePaneli.tsx';
import { PanelTutamagi } from './PanelTutamagi.tsx';
import { RevizyonCubugu } from './RevizyonCubugu.tsx';
import { UrunListesi } from './UrunListesi.tsx';
import { RotaExcelPenceresi } from './ExcelGirisi.tsx';
import { useKalanBoy } from './kalanBoy.ts';

// Ürün ve rotalar: ürün listesi, akış şeması ya da akış tablosu, revizyon çubuğu ve düzenleme paneli. Açılışta yazma yoktur; rota
// değişikliği ilk düzenlemede taslağa yazılır.
export function UrunVeRotalar(o: EkranOzellikleri) {
  const { bildir } = useBildirim();
  const [sorgu] = useSearchParams();
  const [secim, setSecim] = useState<Secim | null>(() => (yeniRotaAcar(o.yetki) && sorgu.get('yeni') === '1' ? { tur: 'yeniRota' } : null));
  const tamDuzen = useRotaDuzeni(o.veri, o.yetki, (urunId, adimId) => { setSecim({ tur: 'adim', urunId, adimId, seq: 0, miktar: 1 }); });
  // 2558 b/5: sayfa görüntüleme kipinde açılır; "Düzenle" palet, ekleme düğmeleri ve sürüklemeyi açar. Taslak ilk değişiklikte açılır
  // (eskisi gibi). Kip ekrandadır: kapalıyken bütün düzenleme denetimleri duzenlenebilir() üzerinden kapanır.
  const [duzenKipi, setDuzenKipi] = useState(() => yeniRotaAcar(o.yetki) && sorgu.get('yeni') === '1');
  const duzen = duzenKipi ? tamDuzen : { ...tamDuzen, duzenlenebilir: () => false };
  const [araKartlar, setAraKartlar] = useState(() => tercihOku('ara-kartlar', '') === '1');
  const { h } = duzen;
  const urunler = useMemo(() => [...h.malzeme.values()]
    .filter((m) => rotaSahibiOlur(m, o.veri.durum.routes?.[m.id]?.steps.length ?? 0, (o.veri.durum.routeRevs ?? []).filter((r) => r.itemId === m.id).length))
    .sort((a, b) => a.code.localeCompare(b.code, 'tr')), [h, o.veri.durum]);
  const [kok, setKok] = useState<string | null>(() => (o.kimlik !== null && h.malzeme.has(o.kimlik) ? o.kimlik : tercihOku('kok', '') || null));
  const kokId = kok !== null && h.malzeme.has(kok) ? kok : urunler[0]?.id ?? null;
  const [revUrun, setRevUrun] = useState<string | null>(null);
  const [liste, setListe] = useState(false);
  const [excelAcik, setExcelAcik] = useState(false);
  const [gorunumTercihi, setGorunum] = useState(() => tercihOku('gorunum', 'hat'));
  // 3248: açılış yatay hattır; eski dikey şema 'dikey' adıyla seçilince açılır (eski 'sema' tercihi hatta düşer). Patlamış rota (1476-F)
  // emri açabilenindir; işlemi olmayanda kalmış tercih hatta düşer.
  const gorunum = (gorunumTercihi === 'patlamis' && !o.yetki.rotaEmreKopyala) || !['dikey', 'tablo', 'patlamis'].includes(gorunumTercihi) ? 'hat' : gorunumTercihi;
  const hatli = gorunum === 'hat';
  const [kip, setKip] = useState(() => tercihOku('miktar-kipi', 'siparis'));
  const [siparis, setSiparis] = useState(() => { const n = Number(tercihOku('siparis', '1')); return Number.isFinite(n) && n > 0 ? n : 1; });
  const [adimPaneli, setAdimPaneli] = useState(() => tercihOku('adim-paneli', '') === '1');
  const [kapali, setKapali] = useState<ReadonlySet<string>>(new Set());
  const [tamEkran, setTamEkran] = useState(false);
  // Tam ekrandan Esc ile her yerden çıkılır (B-2482-R3); açık pencere Esc'i kendisi kullanırsa (defaultPrevented) dokunulmaz.
  useEffect(() => {
    if (!tamEkran) return undefined;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setTamEkran(false); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); };
  }, [tamEkran]);
  // 2558 b/10: Düzenleme paneli yan çekmecedir, açılışta kapalıdır; tek tık seçer ama açmaz. Çift tık (odak), Enter, "Odakla", üst
  // çubuktaki düğme ve kapalı şerit açar. Girdi isteyen seçim (giren, yan ürün, adım ekleme, yeni rota) paneli kendisi açar; yoksa
  // dokunuşun karşılığı görünmezdi. Genişlik sürükleyerek değişir ve hatırlanır (B-2482-R5).
  const [panelAcik, setPanelAcik] = useState(false);
  const panelDar = !panelAcik;
  const [panelGenis, setPanelGenis] = useState<number | null>(() => { const n = Number(tercihOku('duzen-paneli-genis', '')); return n > 0 ? n : null; });
  const govdeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const g = govdeRef.current;
    if (!g) return;
    if (panelGenis === null) g.style.removeProperty('--tc-rr1-panel'); else g.style.setProperty('--tc-rr1-panel', `${String(panelGenis)}px`);
  });
  // Gövde sayfanın kalan boyunu alır; tam ekranda kaydıran kap değişir, ürün listesi ve patlamış rota gövdesizdir.
  // Yatay hatta gövde boy almaz: sayfa kayar, hat yalnız yana kayar, alttaki düzenleme alanı kendi boyundadır (3248).
  useKalanBoy(govdeRef, !liste && gorunum !== 'patlamis' && !hatli, `${gorunum}|${String(tamEkran)}|${kok ?? ''}`);
  // Kap 1200 px'ten darsa iki çekmece birlikte açılınca şema ya da tablo okunmaz: biri açılınca öteki kapanır. 1000'de menü açık
  // 1280 ekranda palet, şema ve panel birlikte kalıyor, ortadaki adım kartı taşıyordu (3095).
  const katmanli = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches;
  const darKap = () => (govdeRef.current?.clientWidth ?? 1280) < 1200;
  const [odak, setOdak] = useState<{ urunId: string; adimId: string } | null>(null);
  const seciliyeDon = () => {
    window.requestAnimationFrame(() => { govdeRef.current?.querySelector<HTMLElement>('.tc-rr1-secili')?.focus(); });
  };
  const panelAcYaz = (v: boolean) => {
    setPanelAcik(v);
    if (v && darKap()) setAdimPaneli(false);
    if (!v) { setOdak(null); seciliyeDon(); }
  };
  const paletYaz = (v: boolean) => {
    setAdimPaneli(v);
    tercihYaz('adim-paneli', v ? '1' : '');
    if (v && darKap()) setPanelAcik(false);
    if (!v) seciliyeDon();
  };
  const ACAN: ReadonlySet<Secim['tur']> = new Set(['girenEkle', 'yanEkle', 'adimEkle', 'yeniRota']);
  const secimYaz = (x: Secim | null) => {
    setSecim(x);
    if (x && ACAN.has(x.tur)) { panelAcYaz(true); if (o.yetki.rotaYaz) setDuzenKipi(true); }
    if (odak && !(x?.tur === 'adim' && x.adimId === odak.adimId)) setOdak(null);
  };
  const panelGenisYaz = (px: number | null, bitti: boolean) => { setPanelGenis(px); if (bitti) tercihYaz('duzen-paneli-genis', px === null ? '' : String(px)); };
  const [copUstunde, setCopUstunde] = useState(false);
  const [surukleniyor, setSurukleniyor] = useState(false);

  const miktar = kip === 'baz' ? 1 : siparis;
  const gunSaati = useMemo(() => {
    const dk = new Map((o.veri.durum.cal?.shifts ?? []).map((v) => [v.id, v.netDakika]));
    const hafta = o.veri.ek.takvim?.hafta;
    return (wcId: string | null) => ortalamaGunSaati(wcId === null ? undefined : hafta?.[wcId], (id) => dk.get(id) ?? 0);
  }, [o.veri.durum.cal, o.veri.ek.takvim]);
  const kokSec = (id: string) => { setKok(id); tercihYaz('kok', id); setRevUrun(null); setListe(false); setKapali(new Set()); setOdak(null); };
  const r: RotaEkrani = {
    duzen, yetki: o.yetki, secim, sec: secimYaz, git: o.git, kokSec, kapali, gunSaati, odak, araKartlar,
    odakla: (x) => {
      if (x === null) { panelAcYaz(false); return; }
      const a = duzen.adimlar(x.urunId).find((y) => y.id === x.adimId);
      if (!a) return;
      setSecim({ tur: 'adim', urunId: x.urunId, adimId: x.adimId, seq: a.seq, miktar });
      setOdak(x);
      // 1023 px altında panel şemanın üstüne binen çekmecedir; odakta açılırsa odaklanan adımı örter. Orada panel üst çubuktaki düğmeyle açılır.
      if (katmanli()) return;
      setPanelAcik(true);
      if (darKap()) setAdimPaneli(false);
    },
    kapaliDegistir: (nid) => { const y = new Set(kapali); if (y.has(nid)) y.delete(nid); else y.add(nid); setKapali(y); },
    // Açık kalma tercihi yalnız üst çubuktaki düğmeyle yazılır (1111 b); "Araya adım" paleti yalnız bu oturumda açar.
    paletAc: () => { setAdimPaneli(true); if (darKap()) setPanelAcik(false); },
    surukleniyor,
    // Sürükleme başlarken şema değişirse tarayıcı sürüklemeyi bırakabilir; şeritler bir sonraki turda açılır.
    surukleBasla: () => { window.setTimeout(() => { setSurukleniyor(true); }, 0); },
    surukleBitti: () => { setSurukleniyor(false); },
  };
  const malzeme = (id: string) => h.malzeme.get(id);
  const agac = kokId ? agacUrunleri(kokId, duzen.adimlar, malzeme, (id) => duzen.adimlar(id).length > 0 || acikRevizyon(duzen.revler(id)) !== null) : [];
  const revId = revUrun !== null && agac.includes(revUrun) ? revUrun : kokId;
  const dugum = kokId ? agacKur(kokId, miktar, duzen.adimlar, malzeme) : null;
  // Emir yalnız yürürlükteki revizyondan açılır; patlamış rota da ondan kurulur.
  const yururlukteRevizyon = ((y) => (y === null ? null : Number(y.id)))(kokId ? yururlukteki(duzen.revler(kokId)) : null);
  // Özet çubuğu motorsuzdur: birim malzeme maliyeti (prototipte matCost) ve şemadaki rotaların eksikleri. Bitiş ve darboğaz plan işidir.
  const birim = (id: string): number | null => {
    const g = duzen.durum.maliyet?.malzeme[id];
    const n = g ? Number(g.birimMaliyet) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const maliyetSonucu = kokId && duzen.durum.maliyet ? malzemeMaliyetiSonucu(kokId, duzen.adimlar, malzeme, birim) : null;
  const birimMaliyet = maliyetSonucu?.deger ?? null;
  // 2558 b/7: şemadaki bütün rotaların sorunları (giren, dal, ayar, süre, istasyon); seçilince adım seçilir ve ortalanır.
  const sorunlar = agac.flatMap((id) => {
    const kod = h.malzeme.get(id)?.code ?? id;
    return rotaSorunlari(duzen.adimlar(id), duzen.malzemeVar, duzen.opAdi).map((x) => ({ ...x, urunId: id, kod }));
  });
  const soruna = (urunId: string, adimId: string) => {
    const a = duzen.adimlar(urunId).find((x) => x.id === adimId);
    if (!a) return;
    if (gorunum === 'patlamis') tercih('gorunum', 'hat', setGorunum);
    setKapali(new Set());
    secimYaz({ tur: 'adim', urunId, adimId, seq: a.seq, miktar });
  };
  const taslakAcik = kokId !== null && agac.some((x) => acikRevizyon(duzen.revler(x)) !== null || duzen.taslakVar(x));
  const duzenKipiYaz = (v: boolean) => {
    setDuzenKipi(v);
    if (!v) { setAdimPaneli(false); setSurukleniyor(false); }
  };
  const tercihYazVeAyarla = (k: string, v: boolean, yaz: (v: boolean) => void) => { yaz(v); tercihYaz(k, v ? '1' : ''); };
  const digerIslemler: MenuOgesi[] = [
    { anahtar: 'liste', baslik: liste ? 'Şemaya dön' : 'Ürün listesi', simge: 'list', sec: () => { setListe(!liste); } },
    ...(yeniRotaAcar(o.yetki) ? [{ anahtar: 'yeni', baslik: 'Yeni rota', simge: 'plus' as const, sec: () => { setListe(false); secimYaz({ tur: 'yeniRota' }); } }] : []),
    ...(duzenlemeAcar(o.yetki, taslakAcik) ? [{ anahtar: 'excel', baslik: 'Excel ile rota adımları', simge: 'file' as const, sec: () => { setExcelAcik(true); } }] : []),
    ...(!liste && kokId ? [
      { anahtar: 'ara', baslik: araKartlar ? 'Ara kartları gizle' : 'Ara kartları göster', simge: 'box' as const,
        sec: () => { tercihYazVeAyarla('ara-kartlar', !araKartlar, setAraKartlar); } },
      { anahtar: 'tam', baslik: tamEkran ? 'Tam ekrandan çık' : 'Tam ekranda aç (F)', simge: (tamEkran ? 'x' : 'expand') as 'x' | 'expand', sec: () => { setTamEkran(!tamEkran); } },
    ] : []),
  ];

  const tercih = (k: string, v: string, yaz: (v: string) => void) => { yaz(v); tercihYaz(k, v); };

  // Paletten ekleme yeri: seçili adımın ardı; "Adım ekle" seçiminde onun yeri (null: başa); yoksa gösterilen rotanın sonu.
  const ekleYeri = (): { urunId: string; sonraId: string | null; dal?: string } | null => {
    const hedef = secim && 'urunId' in secim && duzen.duzenlenebilir(secim.urunId) ? secim.urunId : revId;
    if (!hedef) return null;
    if (secim?.tur === 'adimEkle' && secim.urunId === hedef) return { urunId: hedef, sonraId: secim.sonraId, ...(secim.dal ? { dal: secim.dal } : {}) };
    if (secim?.tur === 'adim' && secim.urunId === hedef) return { urunId: hedef, sonraId: secim.adimId };
    return { urunId: hedef, sonraId: sirali(duzen.adimlar(hedef)).at(-1)?.id ?? null };
  };
  const yer = adimPaneli ? ekleYeri() : null;
  const yerMetni = (() => {
    if (!yer) return null;
    const kod = h.malzeme.get(yer.urunId)?.code ?? '';
    const l = sirali(duzen.adimlar(yer.urunId));
    if (l.length === 0) return `${kod}: ilk adım`;
    const a = yer.sonraId === null ? undefined : l.find((x) => x.id === yer.sonraId);
    if (!a) return `${kod}: rotanın başına`;
    if (yer.dal) return `${kod}: yeni Dal ${yer.dal}, OP ${String(statuNo(a))} ${duzen.opAdi(a.opId) ?? ''} ardından çatallanır`;
    return `${kod}: OP ${String(statuNo(a))} ${duzen.opAdi(a.opId) ?? ''} ardına${a.id === l.at(-1)?.id ? ' (sona)' : ''}`;
  })();
  const panelEkle = (op: Operasyon) => {
    const y = ekleYeri();
    if (!y) return;
    const hedef = y.urunId;
    const l = sirali(duzen.adimlar(hedef));
    const sonra = y.sonraId;
    const yeni = yeniAdim(op, yeniKimlik());
    const l2 = kolaEkle(l, sonra, yeni, y.dal);
    if (duzen.degistir(hedef, () => l2, `${op.abbr ?? op.code} adımı eklendi`)) {
      setSecim({ tur: 'adim', urunId: hedef, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar });
    }
  };

  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    // Esc önce odaktan çıkar (şema kendisi), sonra açık çekmeceyi kapatır; tam ekran ancak ondan sonra kapanır.
    if (e.key === 'Escape' && !e.defaultPrevented && (odak || panelAcik || adimPaneli) && !(e.target as HTMLElement).closest('[role="dialog"]')) {
      e.preventDefault();
      if (odak || panelAcik) panelAcYaz(false); else paletYaz(false);
      return;
    }
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const k = e.key.toLocaleLowerCase('tr-TR');
    const hedef = secim && 'urunId' in secim ? secim.urunId : revId;
    // B-2482-2: F tam ekranı her görünümde açar ve kapatır (şema, tablo, patlamış rota); yalnız şema odaktayken değil.
    if (k === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && (tamEkran || (!liste && kokId))) {
      e.preventDefault();
      setTamEkran(!tamEkran);
      return;
    }
    if (!duzenKipi) return;
    if ((e.ctrlKey || e.metaKey) && hedef && (k === 'z' || k === 'y')) {
      e.preventDefault();
      duzen.geriAl(hedef, k === 'z' && !e.shiftKey ? 'geri' : 'ileri');
      return;
    }
    if (!e.altKey || secim?.tur !== 'adim' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const l = sirali(duzen.adimlar(secim.urunId));
    const i = l.findIndex((x) => x.id === secim.adimId);
    const komsu = l[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (!komsu) return;
    if (e.shiftKey) duzen.tasi(secim.urunId, (x) => adimSurukle(x, secim.adimId, komsu.id), 'Adım taşındı');
    else setSecim({ ...secim, adimId: komsu.id, seq: komsu.seq });
  };

  const copeBirak = (v: string) => {
    const s = surukleCoz(v);
    if (s?.tur !== 'adim') return;
    const a = duzen.adimlar(s.urunId).find((x) => x.id === s.adimId);
    if (!a || !duzen.degistir(s.urunId, (l) => adimSil(l, s.adimId), `OP ${String(statuNo(a))} silindi`)) return;
    if (secim?.tur === 'adim' && secim.adimId === s.adimId) secimYaz(null);
    bildir('bilgi', `OP ${String(statuNo(a))} ${duzen.opAdi(a.opId) ?? ''} silindi.`, { eylem: { etiket: 'Geri al', yap: () => { duzen.geriAl(s.urunId, 'geri'); } } });
  };
  // 2558 b/2: çöp alanı yalnız sürüklerken, şemanın üstüne bindirme olarak çıkar; yer açmaz, bırakma hedefi kaymaz.
  const cop = kokId && duzen.duzenlenebilir(kokId) && surukleniyor ? (
    <div className={`tc-rr1-copkutu${copUstunde ? ' tc-rr1-cop-ustunde' : ''}`} role="region" aria-label="Adımı silmek için buraya sürükle"
      onDragOver={(e) => { e.preventDefault(); setCopUstunde(true); }} onDragLeave={() => { setCopUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setCopUstunde(false); copeBirak(e.dataTransfer.getData(SURUKLE_TURU)); }}>
      <Simge ad="trash" boyut="k" /> Silmek için adımı buraya sürükle
    </div>
  ) : null;

  // 3095: Düzenle ve Panel, düzenlenen rotanın revizyon satırındadır (revizyonun hemen yanında, Geri al ve Yinele ile); üst çubuğun sağında
  // kaldığında kaydırınca görünmüyordu.
  const panelDugmesi = (
    <Dugme className="tc-rr1-kd" tur="ikincil" simge={panelDar ? 'chev-left' : 'chev-right'} aria-expanded={panelAcik} aria-controls="tc-rr1-duzen"
      aria-label="Düzenleme paneli"
      title={panelDar ? 'Düzenleme panelini aç' : 'Düzenleme panelini kapat; çalışma alanı genişler'} onClick={() => { panelAcYaz(!panelAcik); }}><span className="tc-rr1-dar-gizli">Panel</span></Dugme>
  );
  // Revizyon çubuğu yalnız seçili rota varken çizilir; yoksa (ilk rota) Panel üst çubukta kalır.
  const revSatiri = !liste && kokId !== null && revId !== null;
  const duzenDugmeleri = revSatiri && gorunum !== 'patlamis' ? (
    <span className="tc-rr1-duzen-grup" role="group" aria-label="Rota düzenleme">
      {duzenlemeAcar(o.yetki, taslakAcik) && <Dugme className="tc-rr1-kd" tur="ikincil" simge={duzenKipi ? 'check' : 'wrench'} aria-pressed={duzenKipi}
        title={duzenKipi ? 'Görüntülemeye dön; kayıtlar taslakta kalır' : 'Rotayı düzenle: ilk değişiklikte taslak açılır, yürürlükteki rota değişmez'}
        onClick={() => { duzenKipiYaz(!duzenKipi); }}>{duzenKipi ? 'Düzenlemeyi bitir' : 'Düzenle'}</Dugme>}
      {duzenlemeAcar(o.yetki, taslakAcik) && duzenKipi && (
        <Dugme className="tc-rr1-kd" tur="ikincil" simge="layers" aria-expanded={adimPaneli} aria-controls="tc-rr1-palet"
          aria-label="Operasyon paleti" title={adimPaneli ? 'Operasyon paletini kapat' : 'Operasyon paletini aç'} onClick={() => { paletYaz(!adimPaneli); }}><span className="tc-rr1-dar-gizli">Palet</span></Dugme>
      )}
      {!hatli && panelDugmesi}
      {o.yetki.rotaYaz && taslakAcik && <span className="tc-rr1-kipmetni" data-parca="taslak-acik"><Simge ad="clock" boyut="k" /> Taslak açık</span>}
    </span>
  ) : null;

  return (
    <div className={`tc-rr1${tamEkran ? ' tc-rr1-tam' : ''}`} data-parca="R1" onKeyDown={tus}>
      <div className="tc-rr1-top">
        {liste ? (
          <Dugme className="tc-rr1-kd" tur="ikincil" simge="chev-left" onClick={() => { setListe(false); }}>Şemaya dön</Dugme>
        ) : urunler.length > 0 && (
          <select className="tc-rr1-secim tc-rr1-kok" value={kokId ?? ''} aria-label="Şemadaki ürün" onChange={(e) => { kokSec(e.target.value); secimYaz(null); }}>
            {urunler.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
          </select>
        )}
        {!liste && (
          <>
            <span className="tc-rr1-seg" role="group" aria-label="Görünüm">
              <button type="button" aria-pressed={hatli} title="Rota soldan sağa; dallar kendi şeridinde, altta süre şeridi ve seçilen adımın ayrıntısı"
                onClick={() => { tercih('gorunum', 'hat', setGorunum); }}><Simge ad="route" boyut="k" /> Yatay hat</button>
              <button type="button" aria-pressed={gorunum === 'dikey'} title="Dikey akış şeması: yakınlaştırma ve sürükleyerek taşıma"
                onClick={() => { tercih('gorunum', 'dikey', setGorunum); }}><Simge ad="layers" boyut="k" /> Akış şeması</button>
              <button type="button" aria-pressed={gorunum === 'tablo'} onClick={() => { tercih('gorunum', 'tablo', setGorunum); }}><Simge ad="grid" boyut="k" /> Akış tablosu</button>
              {o.yetki.rotaEmreKopyala && (
                <button type="button" aria-pressed={gorunum === 'patlamis'} title="Çok katmanlı emrin açılış görüntüsü: bütün alt parçaların adımları emir numarasıyla"
                  onClick={() => { tercih('gorunum', 'patlamis', setGorunum); }}><Simge ad="layers" boyut="k" /> Patlamış rota</button>
              )}
            </span>
            <span className="tc-rr1-seg" role="group" aria-label="Gösterilen miktar">
              <button type="button" aria-pressed={kip === 'baz'} onClick={() => { tercih('miktar-kipi', 'baz', setKip); }}>Baz miktar</button>
              <button type="button" aria-pressed={kip !== 'baz'} onClick={() => { tercih('miktar-kipi', 'siparis', setKip); }}>Sipariş</button>
            </span>
            {kip !== 'baz' && (
              <input className="tc-rr1-sayi" inputMode="decimal" aria-label="Sipariş miktarı" value={String(siparis)}
                onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n > 0) { setSiparis(n); tercihYaz('siparis', String(n)); } }} />
            )}
          </>
        )}
        {!liste && kokId && (
          <span className="tc-rr1-ozetgrup" role="group" aria-label="Rota özeti">
            {o.yetki.maliyetOku && (
              <span className="tc-rr1-ozet" title={birimMaliyet === null ? maliyetSonucu?.neden ?? 'Maliyet okuma yetkiniz yok ya da maliyet okunamadı.' : 'Girenlerin birim maliyet toplamı; işçilik ve makine hariç'}>
                Birim malzeme <b>{birimMaliyet === null ? YOK : `${sayi(Math.round(birimMaliyet * 100) / 100)} ₺`}</b>
              </span>
            )}
            {sorunlar.length > 0 ? (
              <span className="tc-rr1-sorunlar">
                <Menu etiket={`Sorunlar: ${String(sorunlar.length)}`} simge="alert" metin={<>Sorunlar <b>{sorunlar.length}</b></>}
                  ipucu="Adıma gitmek için seç" ogeler={sorunlar.map((x, i) => ({
                    anahtar: `${x.urunId}|${x.adimId}|${String(i)}`, baslik: agac.length > 1 ? `${x.kod} · ${x.metin}` : x.metin, simge: 'alert',
                    sec: () => { soruna(x.urunId, x.adimId); },
                  }))} />
              </span>
            ) : <span className="tc-rr1-sorunyok"><Simge ad="check" boyut="k" /> Sorun yok</span>}
          </span>
        )}
        <span className="tc-rr1-grow" />
        {!liste && gorunum !== 'patlamis' && !hatli && !revSatiri && panelDugmesi}
        {/* Tam ekrandan çıkış kaydırmadan görünür kalır (B-2482-R3); girişi ⋯ menüsünde ve F tuşundadır. */}
        {tamEkran && (
          <Dugme className="tc-rr1-kd" simge="x" title="Tam ekrandan çık (Esc ya da F)" onClick={() => { setTamEkran(false); }}>Tam ekrandan çık</Dugme>
        )}
        {!liste && kokId && (o.yetki.emirRotasizAc || o.yetki.rotaEmreKopyala) && (
          <Dugme className="tc-rr1-kd" tur="birincil" simge="clipboard-check" onClick={() => { o.git('orders', `urun:${kokId}`); }}>Üretim emri oluştur</Dugme>
        )}
        <Menu etiket="Diğer rota işlemleri" ogeler={digerIslemler} />
        {excelAcik && <RotaExcelPenceresi durum={o.veri.durum} kapat={() => { setExcelAcik(false); }} />}
      </div>
      <OnayPenceresi
        acik={duzen.tasimaOnayi !== null} baslik="Dalın yeri değişsin mi?" onayMetni="Taşı" vazgec={() => { duzen.tasimaKarari(false); }}
        onayla={() => { duzen.tasimaKarari(true); }}
      >
        <p>Bu taşıma dalın çatallandığı ya da birleştiği adımı değiştirir:</p>
        <ul>{duzen.tasimaOnayi?.farklar.map((f) => <li key={f}>{f}</li>)}</ul>
      </OnayPenceresi>
      {liste ? <UrunListesi duzen={duzen} ac={(id) => { kokSec(id); secimYaz(null); }} /> : (
        <>
          {kokId && revId && <RevizyonCubugu r={r} agac={agac} urunId={revId} urunSec={setRevUrun} duzenDugmeleri={duzenDugmeleri} />}
          {gorunum === 'patlamis' && kokId ? (
            <PatlamisRota revizyonId={yururlukteRevizyon} miktar={miktar} baz={kip === 'baz'} />
          ) : hatli ? (
            // 3248: üstte süre şeridi ve yatay hat, altında operasyon paleti (açıksa) ve seçilen öğenin düzenleme alanı tam genişlikte.
            <div ref={govdeRef} className="tc-rr1-hatli">
              {dugum ? <YatayHat r={r} kok={dugum} /> : (
                <div className="tc-rr1-emptycv">
                  <h3>İlk rotanı kur</h3>
                  <p className="tc-rr1-ipucu">Bir mamul seç, sonra rotasına adım ekleyip her adıma giren ve çıkan malzemeleri bağla. Ürün kartı Malzemeler ve Hizmetler&apos;de açılır.</p>
                  {yeniRotaAcar(o.yetki) && <Dugme tur="birincil" simge="plus" onClick={() => { secimYaz({ tur: 'yeniRota' }); }}>Yeni rota</Dugme>}
                </div>
              )}
              {kokId && duzenKipi && adimPaneli && <AdimPaneli r={r} ekle={panelEkle} yer={yerMetni} urunId={yer?.urunId ?? null} kapat={() => { paletYaz(false); }} />}
              <DuzenlemePaneli r={r} acik kapat={() => { secimYaz(null); }} />
            </div>
          ) : (
          <div ref={govdeRef} className={`tc-rr1-body${kokId && duzenKipi ? ' tc-rr1-adimli' : ''}${adimPaneli ? '' : ' tc-rr1-palet-dar'}${gorunum === 'tablo' ? ' tc-rr1-tbl' : ''}${panelDar ? ' tc-rr1-dar' : ''}`}>
            {kokId && duzenKipi && (adimPaneli
              ? <AdimPaneli r={r} ekle={panelEkle} yer={yerMetni} urunId={yer?.urunId ?? null} kapat={() => { paletYaz(false); }} />
              : <PaletSeridi ac={() => { paletYaz(true); }} />)}
            {dugum ? (
              gorunum === 'tablo'
                ? <AkisTablosu r={r} urunler={agac} miktar={miktar} cop={cop} />
                : <AkisSemasi r={r} kok={dugum} cop={cop} />
            ) : (
              <div className="tc-rr1-emptycv">
                <h3>İlk rotanı kur</h3>
                <p className="tc-rr1-ipucu">Bir mamul seç, sonra rotasına adım ekleyip her adıma giren ve çıkan malzemeleri bağla. Ürün kartı Malzemeler ve Hizmetler&apos;de açılır.</p>
                {yeniRotaAcar(o.yetki) && <Dugme tur="birincil" simge="plus" onClick={() => { secimYaz({ tur: 'yeniRota' }); }}>Yeni rota</Dugme>}
              </div>
            )}
            <div className="tc-rr1-insp-kap">
              {!panelDar && <PanelTutamagi govde={() => govdeRef.current} genislik={panelGenis} yaz={panelGenisYaz} />}
              <DuzenlemePaneli r={r} acik={panelAcik} kapat={() => { panelAcYaz(false); }} />
              {panelDar && <PanelSeridi r={r} ac={() => { panelAcYaz(true); }} />}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
