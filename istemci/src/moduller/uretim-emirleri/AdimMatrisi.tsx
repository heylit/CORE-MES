import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ATLAMA_METNI, TOPLU_EK_ONAY_ESIGI, ADIM_NOTU_EN_COK } from '#paylasilan/sozlesme/adim-matrisi-kurali.ts';
import type { AdimMatrisiCevabi, AdimStatusu, ElleYazilanStatu, HazirlikMaddesi, StatuTopluCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { ELLE_YAZILIR, STATU } from './adim-durumu.ts';
import {
  BOS_SUZGEC, adimMaddesi, adimSayisi, aralik, bul, gerekceIsteyenSayisi, maddeOku, tekDokunusEylemi, type MaddeEylemi, duzKalemler, elleSayisi, emirKapali, emirleriSuz, emrinKalemleri, geriAlGovdeleri, gecerliSecim, gorunenStatu,
  farkMetni, hazirlikOzeti, hazirlikOzetMetni, istekGovdeleri, kalemAnahtari, mercekOku, oncekiDefteri, opKalemleri, opSutunlari, secimiAcKapa, secimiSay, yazilacaklar, yazimOzeti,
  type Kalem, type MatrisEmri, type Mercek, type OncekiDefter, type Suzgec, type YazimOzeti,
} from './adim-matrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FarkRozeti, HazirlikCubugu } from './HazirlikCubugu.tsx';
import { HucrePaneli } from './HucrePaneli.tsx';
import { KimlikDefteri, topluGonder } from './kimlik-defteri.ts';
import { useMaddeYazimi } from './madde-yazimi.ts';
import { MaddeSeridi, MaddeSonSeridi, TekMaddeBari, TekMaddeHucresi } from './TekMadde.tsx';
import './adim-matrisi.css';

// Adım Durumu: tek matris (3604, 3738). Satır emir, sütun OP; hücreden ya da seçimden elle statü yazılır, "Otomatiğe dön" toplu da yapılır.
// Mercek: Durum hücrede statüyü, Hazırlık hücrede hazırlık özetini gösterir; hücre paneli statüyü ve hazırlık maddelerini düzenler.
// Elle statü yalnız görünümdür (terminal ilerlemesini, kilidi ve planı değiştirmez); operatör terminalde onu görür, bu yüzden yazmadan önce sayım
// gösterilir ve son yazım bir sonraki işleme kadar geri alınabilir durur.
type Genislik = 'dar' | 'orta' | 'genis';
function useGenislik(): Genislik {
  const oku = (): Genislik => {
    try {
      if (window.matchMedia('(max-width: 767px)').matches) return 'dar';
      if (window.matchMedia('(max-width: 1023px)').matches) return 'orta';
    } catch { /* eşleme yoksa geniş sayılır */ }
    return 'genis';
  };
  const [g, gYaz] = useState<Genislik>(oku);
  useEffect(() => {
    try {
      const sorgular = ['(max-width: 767px)', '(max-width: 1023px)'].map((s) => window.matchMedia(s));
      const degisti = () => { gYaz(oku()); };
      for (const s of sorgular) s.addEventListener('change', degisti);
      return () => { for (const s of sorgular) s.removeEventListener('change', degisti); };
    } catch { return undefined; }
  }, []);
  return g;
}

interface Plan { mod: 'yaz' | 'don'; kalemler: Kalem[]; statu: ElleYazilanStatu | null; not: string; tek: boolean; calisanOnay: boolean }
interface SonYazim { ozet: YazimOzeti; yazilanlar: Kalem[]; onceki: OncekiDefter; plan: Plan; tek: boolean; geriAlindi: boolean }

const statuAdi = (s: AdimStatusu): string => STATU[s].ad;
const hucreAdi = (e: MatrisEmri, a: MatrisEmri['adimlar'][number]): string => {
  const g = gorunenStatu(a);
  return `${e.emirNo}, OP ${String(a.opNo)} ${a.ad}: ${statuAdi(g)}, ${a.elle === null ? 'elle yazılmadı' : `elle yazıldı (${a.elle.kisiAdi ?? 'kişi'})`}`;
};
const nedenMetni = (n: keyof typeof ATLAMA_METNI): string => ATLAMA_METNI[n];

export function AdimMatrisi() {
  const istemci = useQueryClient();
  const [adres, adresYaz] = useSearchParams();
  const mercek = mercekOku(adres.get('mercek'));
  const mercekSec = (m: Mercek) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (m === 'durum') y.delete('mercek'); else y.set('mercek', m); return y; }, { replace: true });
    planYaz(null);
    maddeY.planYaz(null);
  };
  const madde = maddeOku(adres.get('madde'));
  const maddeSec = (m: HazirlikMaddesi) => {
    adresYaz((a) => { const y = new URLSearchParams(a); y.set('madde', m); return y; }, { replace: true });
  };
  const genislik = useGenislik();
  const [biten, bitenYaz] = useState(false);
  const veri = useQuery({
    queryKey: anahtarlar.adimMatrisi(biten),
    queryFn: () => api.get<AdimMatrisiCevabi>(`/adimli-emirler/adim-matrisi${biten ? '?biten=1' : ''}`),
  });
  const [suz, suzYaz] = useState<Suzgec>(BOS_SUZGEC);
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(new Set());
  const [aktif, aktifYaz] = useState<string | null>(null);
  const [coklu, cokluYaz] = useState(false);
  const [suzgecAcik, suzgecAcikYaz] = useState(false);
  const [statu, statuYaz] = useState<ElleYazilanStatu | ''>('');
  const [not, notYaz] = useState('');
  const [plan, planYaz] = useState<Plan | null>(null);
  const [ekOnay, ekOnayYaz] = useState(false);
  const [son, sonYaz] = useState<SonYazim | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const sonSayac = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tekrar korumalı komut: her parça isteği kendi kimliğini taşır; sonucu bilinmeyen hatadan sonraki basış parçaların kimliğini korur.
  const [defter] = useState(() => new KimlikDefteri());

  const emirler = useMemo(() => veri.data?.emirler ?? [], [veri.data]);
  const yazabilir = veri.data?.yazabilir === true;
  const gorunen = useMemo(() => emirleriSuz(emirler, suz, biten), [emirler, suz, biten]);
  const sutunlar = useMemo(() => opSutunlari(gorunen), [gorunen]);
  const duz = useMemo(() => duzKalemler(gorunen, suz), [gorunen, suz]);
  // Veri yenilenince ya da süzgeç değişince görünümde olmayan seçim düşer.
  const gecerli = useMemo(() => gecerliSecim(secili, gorunen), [secili, gorunen]);
  const seciliKalemler = useMemo(() => [...gecerli].flatMap((k) => { const b = bul(gorunen, k); return b === null ? [] : [b]; }), [gecerli, gorunen]);
  // Çoklu seçimde panel kapanır: tek adımın ayrıntısı seçimle ilgisizdir ve içerikten yer çalar.
  // Telefonda Çoklu seç açıkken de panel çıkmaz: alttaki yer tek çubuktur (toplu şerit).
  const aktifKalem = mercek === 'tek' || aktif === null || gecerli.size > 1 || (coklu && genislik === 'dar') ? null : bul(emirler, aktif);
  const sayim = statu === '' ? null : secimiSay(seciliKalemler, statu);

  useEffect(() => () => { if (sonSayac.current !== null) clearTimeout(sonSayac.current); }, []);

  const yenile = async () => {
    await Promise.all([
      istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'adim-matrisi'] }),
      istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'adim-durumu'] }),
    ]);
  };

  // 3738 dilim 2: Tek madde merceği yazımı. Yazımdan sonra yalnız bayat kalan kalemler seçili kalır.
  const maddeY = useMaddeYazimi(yenile, (kalanlar, cok) => { seciliYaz(new Set(kalanlar)); if (cok) aktifYaz(null); });
  const maddeAc = (kalemler: Kalem[], eylem: MaddeEylemi, tek: boolean) => {
    sonYaz(null);
    maddeY.baslat(kalemler, madde, eylem, tek, gerekceIsteyenSayisi(kalemler, madde, eylem) > 0);
  };
  const maddeTikla = (k: Kalem, o: MouseEvent | KeyboardEvent) => {
    if (o.ctrlKey || o.metaKey || o.shiftKey || coklu) { tikla(k, o); return; }
    const eylem = tekDokunusEylemi(adimMaddesi(k.adim, madde));
    if (!yazabilir || emirKapali(k.emir) || eylem === null) return;
    maddeAc([k], eylem, true);
  };
  const eksikKalemler = duz.filter((k) => !emirKapali(k.emir) && adimMaddesi(k.adim, madde)?.hal === 'eksik');
  const eksikleriSec = () => { planYaz(null); seciliYaz(new Set(eksikKalemler.map((k) => k.anahtar))); };
  const eksikleriOnayla = () => { eksikleriSec(); maddeAc(eksikKalemler, 'hazir', false); };
  const maddeYenidenDene = async () => {
    const son = maddeY.son;
    if (son === null) return;
    const yeni = await veri.refetch();
    const g = (yeni.data?.emirler ?? emirler);
    const kalemler = [...secili].flatMap((k) => { const b = bul(g, k); return b === null ? [] : [b]; });
    maddeY.planYaz({ madde: son.madde, eylem: son.eylem, gerekce: son.gerekce, kalemler, tek: false });
  };
  const kalemAdi = (anahtar: string): string => { const k = bul(emirler, anahtar); return k === null ? anahtar : `${k.emir.emirNo} OP ${String(k.adim.opNo)}`; };

  // ----- seçim -----
  const tikla = (k: Kalem, o: MouseEvent | KeyboardEvent) => {
    aktifYaz(k.anahtar);
    if (!yazabilir || emirKapali(k.emir)) return;
    planYaz(null);
    const ekle = o.ctrlKey || o.metaKey || o.shiftKey || coklu;
    if (o.shiftKey && aktif !== null) {
      const onceki = bul(gorunen, aktif);
      if (onceki !== null && onceki.emir.emirId === k.emir.emirId) {
        seciliYaz(new Set([...gecerli, ...aralik(k.emir, onceki.adim.opNo, k.adim.opNo).filter((x) => !emirKapali(x.emir)).map((x) => x.anahtar)]));
        return;
      }
    }
    if (ekle) seciliYaz(secimiAcKapa(gecerli, [k.anahtar]));
    else seciliYaz(gecerli.size === 1 && gecerli.has(k.anahtar) ? new Set() : new Set([k.anahtar]));
  };
  const topluSec = (kalemler: readonly Kalem[]) => {
    if (!yazabilir) return;
    planYaz(null);
    seciliYaz(secimiAcKapa(gecerli, kalemler.map((k) => k.anahtar)));
  };
  const hepsiniSec = () => {
    if (!yazabilir) return;
    planYaz(null);
    seciliYaz(new Set(duz.map((k) => k.anahtar)));
  };
  const temizle = () => { seciliYaz(new Set()); planYaz(null); ekOnayYaz(false); };

  // ----- yazma -----
  const gonder = async (kalemler: readonly Kalem[], mod: 'yaz' | 'don', hedef: ElleYazilanStatu | null, notMetni: string, calisanOnay: boolean): Promise<StatuTopluCevabi[]> => {
    return topluGonder(defter, istekGovdeleri(kalemler, mod === 'don' ? null : hedef, notMetni, calisanOnay), (govde, d) => api.post<StatuTopluCevabi>('/adimli-emirler/statu-toplu', govde, d));
  };
  const uygula = async (p: Plan) => {
    const yazilanlar = yazilacaklar(p.kalemler, p.mod === 'don' ? null : p.statu, p.calisanOnay);
    mesgulYaz(true);
    hataYaz(null);
    try {
      const cevaplar = await gonder(yazilanlar, p.mod, p.statu, p.not, p.calisanOnay);
      const ozet = yazimOzeti(cevaplar);
      const onceki = oncekiDefteri(yazilanlar);
      const basarisiz = new Set(ozet.basarisiz.map((b) => b.anahtar));
      seciliYaz(new Set([...basarisiz]));
      if (yazilanlar.length > 1) aktifYaz(null);
      planYaz(null);
      ekOnayYaz(false);
      notYaz('');
      sonYaz({ ozet, yazilanlar: yazilanlar.filter((k) => !basarisiz.has(k.anahtar)), onceki, plan: p, tek: p.tek, geriAlindi: false });
      if (sonSayac.current !== null) clearTimeout(sonSayac.current);
      // Tek hücreden yazımda sekiz saniye yeter (Arayüz Y5); toplu yazımda şerit bir sonraki işleme kadar durur.
      if (p.tek && ozet.basarisiz.length === 0) sonSayac.current = setTimeout(() => { sonYaz((s) => (s !== null && s.tek ? null : s)); }, 8000);
      mesgulYaz(false);
      void yenile();
    } catch (x) {
      hataYaz(hataIletisi(x, 'Statü yazılamadı.'));
    } finally {
      mesgulYaz(false);
    }
  };
  const geriAl = async () => {
    if (son === null) return;
    mesgulYaz(true);
    hataYaz(null);
    try {
      const cevaplar = await topluGonder(defter, geriAlGovdeleri(son.yazilanlar, son.onceki), (govde, d) => api.post<StatuTopluCevabi>('/adimli-emirler/statu-toplu', govde, d));
      const ozet = yazimOzeti(cevaplar);
      sonYaz({ ...son, geriAlindi: true, ozet: { ...ozet, yazildi: 0 }, yazilanlar: [] });
      void yenile();
    } catch (x) {
      hataYaz(hataIletisi(x, 'Geri alınamadı.'));
    } finally {
      mesgulYaz(false);
    }
  };
  // Bayat kalem: güncel veri alınır, aynı yazım seçili kalemler için yeniden sayılıp onaya sunulur.
  const yenidenDene = async () => {
    if (son === null) return;
    const yeni = await veri.refetch();
    const g = (yeni.data?.emirler ?? emirler);
    const kalemler = [...secili].flatMap((k) => { const b = bul(g, k); return b === null ? [] : [b]; });
    planYaz({ ...son.plan, kalemler, tek: false });
  };
  const planAc = (mod: 'yaz' | 'don') => {
    ekOnayYaz(false);
    sonYaz(null);
    planYaz({ mod, kalemler: seciliKalemler, statu: mod === 'don' || statu === '' ? null : statu, not, tek: false, calisanOnay: false });
  };
  // Hücre menüsü: tek adım. Çalışan adımda operatör canlı durum yerine elle statüyü göreceği için önce uyarı ve onay gelir.
  const hucreYaz = (k: Kalem, hedef: ElleYazilanStatu | null) => {
    const p: Plan = { mod: hedef === null ? 'don' : 'yaz', kalemler: [k], statu: hedef, not: '', tek: true, calisanOnay: true };
    sonYaz(null);
    if (hedef !== null && ['uretimde', 'duraklatildi', 'durdu'].includes(k.adim.sistemStatusu)) { planYaz(p); return; }
    void uygula(p);
  };

  // ----- görünüm parçaları -----
  const bos = gorunen.length === 0;
  const sayacMetni = `${String(gorunen.length)} emir, ${String(adimSayisi(gorunen))} adım, ${String(elleSayisi(gorunen))} elle`;
  const odakDon = (anahtar: string | null) => {
    if (anahtar === null) return;
    window.setTimeout(() => { document.querySelector<HTMLElement>(`[data-am-k="${anahtar}"]`)?.focus(); }, 0);
  };
  const panelKapat = () => { const a = aktif; aktifYaz(null); odakDon(a); };

  const hucre = (k: Kalem, kisa: boolean) => {
    const g = gorunenStatu(k.adim);
    const kapali = emirKapali(k.emir);
    const secildi = gecerli.has(k.anahtar);
    const hz = hazirlikOzeti(k.adim);
    const hazirlikMi = mercek === 'hazirlik';
    if (mercek === 'tek') {
      return <TekMaddeHucresi kalem={k} madde={madde} yazabilir={yazabilir} coklu={coklu} secildi={secildi} kisa={kisa} mesgul={maddeY.mesgul}
        tikla={(o) => { maddeTikla(k, o); }} geriAl={() => { maddeAc([k], 'geri', true); }} />;
    }
    const ton = hazirlikMi ? (hz.eksik > 0 ? 'hata' : hz.toplam > 0 && hz.tamam === hz.toplam ? 'tamam' : 'pasif') : STATU[g].ton;
    const ad = `${hazirlikMi ? `${k.emir.emirNo}, OP ${String(k.adim.opNo)} ${k.adim.ad}: ${hazirlikOzetMetni(hz)}` : hucreAdi(k.emir, k.adim)}${k.adim.sablondanFark > 0 ? `, ${farkMetni(k.adim.sablondanFark)}` : ''}`;
    return (
      <div className={`tc-am-hucre-kap${aktif === k.anahtar ? ' tc-am-aktif' : ''}`}>
        <button type="button" className={`tc-am-hucre tc-am-ton-${ton}${secildi ? ' tc-am-secili' : ''}${hazirlikMi ? ' tc-am-hucre-hz' : ''}`} data-am-k={k.anahtar}
          aria-pressed={secildi} aria-label={ad} title={kisa && !hazirlikMi ? `${statuAdi(g)}${kapali ? ' (emir bitti, seçilemez)' : ''}` : undefined}
          onClick={(o) => { tikla(k, o); }}>
          {hazirlikMi ? <HazirlikCubugu adim={k.adim} /> : (
            <>
              <Simge ad={STATU[g].simge} boyut="k" />
              {!kisa && <span className="tc-am-hucre-ad">{STATU[g].ad}</span>}
              {k.adim.elle !== null && <span className="tc-am-e" aria-hidden="true">E</span>}
              <FarkRozeti adim={k.adim} />
            </>
          )}
        </button>
      </div>
    );
  };

  const matris = (kisa: boolean) => (
    <div className="tc-am-kaydir" tabIndex={0} role="region" aria-label="Adım matrisi">
      <table className={`tc-am-tablo${kisa ? ' tc-am-kisa' : ''}`}>
        <caption className="tc-am-sadece-okuyucu">Satır emir, sütun OP numarasıdır.</caption>
        <thead>
          <tr>
            <th scope="col" className="tc-am-sabit">Emir</th>
            {sutunlar.map((c) => (
              <th scope="col" key={c.opNo}>
                <button type="button" className="tc-am-baslik" disabled={!yazabilir} onClick={() => { topluSec(opKalemleri(gorunen, c.opNo)); }}
                  aria-label={`OP ${String(c.opNo)} ${c.ad}: bu sütundaki adımları seç`}>
                  <b>OP {c.opNo}</b><span>{c.ad}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gorunen.map((e) => {
            const bitenSayi = e.adimlar.filter((a) => a.sistemStatusu === 'bitti').length;
            return (
              <tr key={e.emirId}>
                <th scope="row" className="tc-am-sabit">
                  <button type="button" className="tc-am-satir" disabled={!yazabilir} onClick={() => { topluSec(emrinKalemleri(e)); }}
                    aria-label={`${e.emirNo}: bu emrin adımlarını seç`}>
                    <span className="tc-emir-kod">{e.emirNo}</span>
                    <span className="tc-am-urun">{e.urun.ad}</span>
                    {emirKapali(e) && <span className="tc-am-etiket">Emir bitti</span>}
                    <span className="tc-am-ilerleme"><progress max={e.adimlar.length} value={bitenSayi} aria-hidden="true" /><span>{bitenSayi}/{e.adimlar.length}</span></span>
                    {e.teslim !== null && <span className="tc-am-termin">Termin {tarihMetni(e.teslim)}</span>}
                  </button>
                </th>
                {sutunlar.map((c) => {
                  const a = e.adimlar.find((x) => x.opNo === c.opNo);
                  return <td key={c.opNo}>{a === undefined ? <span className="tc-am-yok" aria-label="Bu emirde bu OP yok">-</span> : hucre({ anahtar: kalemAnahtari(e.emirId, a.isEmriId), emir: e, adim: a }, kisa)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ----- toplu şerit -----
  const serit = () => {
    if (!yazabilir) return <div className="tc-am-serit tc-am-serit-salt" role="note"><Simge ad="lock" boyut="k" />Statü yazma yetkiniz yok. Yalnız okuyabilirsiniz.</div>;
    if (mercek === 'tek') {
      return <MaddeSeridi madde={madde} secili={seciliKalemler} plan={maddeY.plan} mesgul={maddeY.mesgul} baslat={(e) => { maddeAc(seciliKalemler, e, false); }}
        temizle={temizle} planYaz={maddeY.planYaz} uygula={maddeY.uygula} />;
    }
    if (plan !== null) return planGorunumu(plan);
    // Telefonda tek dokunuş yalnız paneli açar; toplu şerit Çoklu seç açıkken (ya da satır ve OP başlığıyla çoklu seçimde) çıkar.
    if (genislik === 'dar' && !coklu && aktifKalem !== null) return null;
    if (gecerli.size === 0) return null;
    return (
      <div className="tc-am-serit" role="region" aria-label="Toplu statü yazma">
        <span className="tc-am-sayi-etiket">{gecerli.size} seçili</span>
        <Secim etiket="Elle statü" bosSecenek="Statü seç" value={statu} onChange={(o) => { statuYaz(o.target.value as ElleYazilanStatu | ''); }}
          secenekler={ELLE_YAZILIR.map((x) => ({ deger: x, baslik: STATU[x].ad }))} />
        <Girdi etiket="Not" maxLength={ADIM_NOTU_EN_COK} placeholder="İsteğe bağlı" value={not} onChange={(o) => { notYaz(o.target.value); }}
          ipucu="Operatör terminalde yalnız statüyü görür; not ve kişi terminale gitmez." />
        <div className="tc-am-serit-dugmeler">
          <Dugme tur="birincil" simge="check" disabled={statu === '' || sayim === null} onClick={() => { planAc('yaz'); }}>
            {statu === '' ? 'Yaz' : `${String(gecerli.size)} adıma ${statuAdi(statu)} yaz`}
          </Dugme>
          <Dugme simge="rotate" onClick={() => { planAc('don'); }}>Otomatiğe dön</Dugme>
          <Dugme simge="x" onClick={temizle}>Seçimi temizle</Dugme>
        </div>
      </div>
    );
  };
  const planGorunumu = (p: Plan) => {
    const s = secimiSay(p.kalemler, p.mod === 'don' ? null : p.statu, p.calisanOnay);
    const atlananlar = p.kalemler.filter((k) => !yazilacaklar([k], p.mod === 'don' ? null : p.statu, p.calisanOnay).length);
    const nedenler = s.nedenler.map((n) => `${String(n.sayi)} ${nedenMetni(n.neden)}`).join(', ');
    const ek = s.yazilir > TOPLU_EK_ONAY_ESIGI;
    const ad = p.mod === 'don' ? 'Otomatiğe dön' : p.statu === null ? '' : statuAdi(p.statu);
    return (
      <div className="tc-am-serit tc-am-plan" role="region" aria-label="Yazma onayı">
        <p className="tc-am-sayim"><b>{p.kalemler.length} seçili: {s.yazilir} yazılır{s.atlanir > 0 ? `, ${String(s.atlanir)} atlanır (${nedenler})` : ''}</b></p>
        <p className="tc-emir-not">{p.mod === 'don' ? 'Seçili adımların elle statüsü kalkar; sistem statüsü görünür.' : `Yazılacak statü: ${ad}.`}</p>
        {s.calisanUyarisi > 0 && (
          <p className="tc-am-uyari" role="alert"><Simge ad="alert" boyut="k" />{s.calisanUyarisi} adım şu an {statuAdi(p.kalemler[0]?.adim.sistemStatusu ?? 'uretimde')}: operatör terminalde “{ad}” görecek.</p>
        )}
        {atlananlar.length > 0 && (
          <ul className="tc-am-atlananlar" aria-label="Atlanacak adımlar">
            {atlananlar.slice(0, 5).map((k) => <li key={k.anahtar}>{k.emir.emirNo} OP {k.adim.opNo}: {nedenMetni(nedenOf(k, p))}</li>)}
            {atlananlar.length > 5 && <li>ve {atlananlar.length - 5} adım daha</li>}
          </ul>
        )}
        {ek && <IsaretKutusu etiket={`${String(s.yazilir)} adıma yazılacak; bu 50 adımdan çok. Onaylıyorum.`} checked={ekOnay} onChange={(o) => { ekOnayYaz(o.target.checked); }} />}
        <div className="tc-am-serit-dugmeler">
          <Dugme tur="birincil" simge="check" yukleniyor={mesgul} disabled={s.yazilir === 0 || (ek && !ekOnay)} onClick={() => { void uygula(p); }}>
            {p.mod === 'don' ? `${String(s.yazilir)} adımı otomatiğe döndür` : `${String(s.yazilir)} adıma yaz`}
          </Dugme>
          <Dugme disabled={mesgul} onClick={() => { planYaz(null); }}>Vazgeç</Dugme>
        </div>
      </div>
    );
  };
  const nedenOf = (k: Kalem, p: Plan) => {
    const s = secimiSay([k], p.mod === 'don' ? null : p.statu, p.calisanOnay);
    return s.nedenler[0]?.neden ?? 'emir-kapali';
  };

  // Kalıcı "son yazım" şeridi: sonuç eklenmeden önce de DOM'dadır (ekran okuyucu duyurur).
  const sonSerit = () => (
    <div className="tc-am-son" role="status" aria-live="polite">
      {son !== null && (
        <>
          <span>
            {son.geriAlindi
              ? 'Son yazım geri alındı.'
              : `Son yazım: ${String(son.ozet.yazildi + son.ozet.kaldirildi)} adım ${son.plan.mod === 'don' ? 'otomatiğe döndü' : 'yazıldı'}${son.ozet.atlandi > 0 ? `, ${String(son.ozet.atlandi)} atlandı` : ''}${son.ozet.basarisiz.length > 0 ? `, ${String(son.ozet.basarisiz.length)} durum değişti (yeniden deneyin)` : ''}.`}
          </span>
          {!son.geriAlindi && son.yazilanlar.length > 0 && <Dugme simge="back" disabled={mesgul} onClick={() => { void geriAl(); }}>Geri al</Dugme>}
          {son.ozet.basarisiz.length > 0 && <Dugme simge="rotate" disabled={mesgul} onClick={() => { void yenidenDene(); }}>Yeniden dene</Dugme>}
          <Dugme simge="x" onClick={() => { sonYaz(null); }} aria-label="Şeridi kapat" />
          {son.ozet.basarisiz.length > 0 && (
            <ul className="tc-am-atlananlar" aria-label="Yazılamayan adımlar">
              {son.ozet.basarisiz.map((b) => { const k = bul(emirler, b.anahtar); return <li key={b.anahtar}>{k === null ? b.anahtar : `${k.emir.emirNo} OP ${String(k.adim.opNo)}`}: durum değişti, yenilendi; {b.neden}</li>; })}
            </ul>
          )}
        </>
      )}
      {hata !== null && <span role="alert" className="tc-am-hata">{hata}</span>}
    </div>
  );

  // ----- hücre paneli -----
  // 360: panel alttaki yapışan şeridin içinde katlanır; ayrı bir panel şeridin altında kalırdı.
  const panel = () => aktifKalem === null ? null : (
    <HucrePaneli key={aktifKalem.anahtar} kalem={aktifKalem} yazabilir={yazabilir} katli={genislik === 'dar'} statuYaz={hucreYaz} mesgul={mesgul} kapat={panelKapat} yenile={yenile} />
  );

  const suzgecSayisi = [suz.statu !== '', suz.yalnizElle, suz.yalnizSorunlu, suz.yalnizHazirlikEksik].filter(Boolean).length;
  const suzgecEtiketi = suzgecSayisi > 0 ? `Filtre (${String(suzgecSayisi)})` : 'Filtre';
  const farkVar = emirler.some((e) => e.adimlar.some((a) => a.sablondanFark > 0));
  const lejant = [...new Set(emirler.flatMap((e) => e.adimlar.map((a) => gorunenStatu(a))))];
  return (
    <div className={`tc-am tc-am-${genislik}`}>
      <div className="tc-am-mercek" role="group" aria-label="Mercek">
        <span className="tc-am-mercek-ad">Mercek</span>
        <Dugme aria-pressed={mercek === 'durum'} simge="gauge" onClick={() => { mercekSec('durum'); }}>Durum</Dugme>
        <Dugme aria-pressed={mercek === 'hazirlik'} simge="clipboard-check" onClick={() => { mercekSec('hazirlik'); }}>Hazırlık</Dugme>
        <Dugme aria-pressed={mercek === 'tek'} simge="check" onClick={() => { mercekSec('tek'); }}>Tek madde</Dugme>
      </div>
      {mercek === 'tek' && <TekMaddeBari madde={madde} maddeSec={maddeSec} eksikSayisi={eksikKalemler.length} yazabilir={yazabilir} eksikleriOnayla={eksikleriOnayla} eksikleriSec={eksikleriSec} />}
      <div className="tc-am-ust">
        <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün" value={suz.arama} onChange={(o) => { suzYaz({ ...suz, arama: o.target.value }); }} />
        <div className="tc-am-suzgec" hidden={genislik === 'dar' && !suzgecAcik}>
        <Secim etiket="Statü" bosSecenek="Tüm statüler" value={suz.statu} onChange={(o) => { suzYaz({ ...suz, statu: o.target.value as AdimStatusu | '' }); }}
          secenekler={lejant.map((x) => ({ deger: x, baslik: statuAdi(x) }))} />
        <div className="tc-am-isaretler">
          <IsaretKutusu etiket="Yalnız elle yazılanlar" checked={suz.yalnizElle} onChange={(o) => { suzYaz({ ...suz, yalnizElle: o.target.checked }); }} />
          <IsaretKutusu etiket="Yalnız sorunlular" checked={suz.yalnizSorunlu} onChange={(o) => { suzYaz({ ...suz, yalnizSorunlu: o.target.checked }); }} />
          <IsaretKutusu etiket="Yalnız hazırlığı eksik olanlar" checked={suz.yalnizHazirlikEksik} onChange={(o) => { suzYaz({ ...suz, yalnizHazirlikEksik: o.target.checked }); }} />
          <IsaretKutusu etiket="Biteni göster" checked={biten} onChange={(o) => { bitenYaz(o.target.checked); }} />
        </div>
        </div>
        <div className="tc-am-ust-dugmeler">
          {genislik === 'dar' && <Dugme aria-expanded={suzgecAcik} onClick={() => { suzgecAcikYaz(!suzgecAcik); }}>{suzgecEtiketi}</Dugme>}
          <Dugme aria-pressed={coklu} disabled={!yazabilir} onClick={() => { cokluYaz(!coklu); }}>Çoklu seç</Dugme>
          <Dugme disabled={!yazabilir || duz.length === 0} onClick={hepsiniSec}>Tümünü seç</Dugme>
        </div>
        <p className="tc-am-sayac" role="status">{veri.isPending ? 'Yükleniyor' : sayacMetni}</p>
      </div>
      <p className="tc-emir-not tc-am-sabit-not"><Simge ad="alert" boyut="k" /> Elle statü, sistem statüsü değişince düşer.</p>
      <div className="tc-am-seritlar">
        {serit()}
        {sonSerit()}
        {(mercek === 'tek' || maddeY.son !== null || maddeY.hata !== null) && (
          <MaddeSonSeridi son={maddeY.son} hata={maddeY.hata} mesgul={maddeY.mesgul} kapat={() => { maddeY.sonYaz(null); }} geriAl={() => { void maddeY.geriAl(); }}
            yenidenDene={() => { void maddeYenidenDene(); }} adlandir={kalemAdi} />
        )}
        {genislik === 'dar' && panel()}
      </div>
      <div className={`tc-am-govde${aktifKalem === null ? '' : ' tc-am-panelli'}`}>
        <div className="tc-am-icerik">
          {veri.isPending && <DurumKutusu durum="yukleniyor" />}
          {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Adım matrisi alınamadı.')} yenile={() => { void veri.refetch(); }} />}
          {veri.data && (
            bos
              ? <DurumKutusu durum="bos" mesaj={emirler.length === 0 ? 'Açık emir yok.' : 'Süzgece uyan emir yok.'} />
              : matris(genislik !== 'genis' && mercek !== 'hazirlik')
          )}
          {veri.data && !bos && (mercek === 'durum' ? (
            <ul className="tc-am-lejant" aria-label="Statü simgeleri">
              {lejant.map((x) => <li key={x}><Simge ad={STATU[x].simge} boyut="k" />{statuAdi(x)}</li>)}
              <li><span className="tc-am-e" aria-hidden="true">E</span>Elle yazıldı</li>
              {farkVar && <li><Simge ad="edit" boyut="k" />şablondan N fark</li>}
            </ul>
          ) : mercek === 'tek' ? (
            <ul className="tc-am-lejant" aria-label="Madde simgeleri">
              <li><Simge ad="check" boyut="k" />Hazır</li>
              <li><Simge ad="x" boyut="k" />Eksik ya da hazır değil</li>
              <li><Simge ad="lock" boyut="k" />Muaf</li>
              <li><Simge ad="minus" boyut="k" />Gerekmez</li>
              <li><span className="tc-am-e" aria-hidden="true">E</span>Elle yazıldı</li>
            </ul>
          ) : (
            <ul className="tc-am-lejant" aria-label="Hazırlık kareleri">
              <li><i className="tc-am-kare tc-am-kare-tamam" />Tamam</li>
              <li><i className="tc-am-kare tc-am-kare-eksik" />Eksik</li>
              <li><i className="tc-am-kare tc-am-kare-muaf" />Muaf ya da elle onay</li>
              <li><i className="tc-am-kare tc-am-kare-bos" />Gerekmez ya da denetlenmiyor</li>
              <li><Simge ad="user" boyut="k" />Elle değer</li>
              {farkVar && <li><Simge ad="edit" boyut="k" />şablondan N fark</li>}
            </ul>
          ))}
        </div>
        {genislik !== 'dar' && panel()}
      </div>
    </div>
  );
}
