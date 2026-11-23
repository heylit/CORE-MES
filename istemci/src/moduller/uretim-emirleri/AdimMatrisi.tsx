import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ATLAMA_METNI, TOPLU_EK_ONAY_ESIGI, ADIM_NOTU_EN_COK } from '#paylasilan/sozlesme/adim-matrisi-kurali.ts';
import type { AdimMatrisiCevabi, AdimStatusu, ElleYazilanStatu, StatuTopluCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Menu, Rozet, Secim, Simge, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { ELLE_YAZILIR, STATU, STATU_KAYNAGI } from './adim-durumu.ts';
import {
  BOS_SUZGEC, adimSayisi, aralik, bul, duzKalemler, elleSayisi, emirKapali, emirleriSuz, emrinKalemleri, geriAlGovdeleri, gecerliSecim, gorunenStatu,
  istekGovdeleri, kalemAnahtari, oncekiDefteri, opKalemleri, opSutunlari, secimiAcKapa, secimiSay, sirala, yazilacaklar, yazimOzeti,
  type Kalem, type MatrisEmri, type OncekiDefter, type Siralama, type Suzgec, type TabloSutunu, type YazimOzeti,
} from './adim-matrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import './adim-matrisi.css';

// Adım Durumu: Matris ve Tablo görünümleri (3604). Satır emir, sütun OP; hücreden ya da seçimden elle statü yazılır, "Otomatiğe dön" toplu da yapılır.
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

export function AdimMatrisi({ gorunum }: { gorunum: 'matris' | 'tablo' }) {
  const istemci = useQueryClient();
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
  const [sira, siraYaz] = useState<Siralama>({ sutun: 'emir', yon: 1 });
  const [statu, statuYaz] = useState<ElleYazilanStatu | ''>('');
  const [not, notYaz] = useState('');
  const [plan, planYaz] = useState<Plan | null>(null);
  const [ekOnay, ekOnayYaz] = useState(false);
  const [son, sonYaz] = useState<SonYazim | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const sonSayac = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emirler = useMemo(() => veri.data?.emirler ?? [], [veri.data]);
  const yazabilir = veri.data?.yazabilir === true;
  const gorunen = useMemo(() => emirleriSuz(emirler, suz, biten), [emirler, suz, biten]);
  const sutunlar = useMemo(() => opSutunlari(gorunen), [gorunen]);
  const duz = useMemo(() => duzKalemler(gorunen, suz), [gorunen, suz]);
  const tabloSatirlari = useMemo(() => sirala(duz, sira, statuAdi), [duz, sira]);
  // Veri yenilenince ya da süzgeç değişince görünümde olmayan seçim düşer.
  const gecerli = useMemo(() => gecerliSecim(secili, gorunen), [secili, gorunen]);
  const seciliKalemler = useMemo(() => [...gecerli].flatMap((k) => { const b = bul(gorunen, k); return b === null ? [] : [b]; }), [gecerli, gorunen]);
  // Çoklu seçimde panel kapanır: tek adımın ayrıntısı seçimle ilgisizdir ve içerikten yer çalar.
  const aktifKalem = aktif === null || gecerli.size > 1 ? null : bul(emirler, aktif);
  const sayim = statu === '' ? null : secimiSay(seciliKalemler, statu);

  useEffect(() => () => { if (sonSayac.current !== null) clearTimeout(sonSayac.current); }, []);

  const yenile = async () => {
    await Promise.all([
      istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'adim-matrisi'] }),
      istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'adim-durumu'] }),
    ]);
  };

  // ----- seçim -----
  const tikla = (k: Kalem, o: MouseEvent | KeyboardEvent) => {
    aktifYaz(k.anahtar);
    if (!yazabilir || emirKapali(k.emir)) return;
    planYaz(null);
    const ekle = o.ctrlKey || o.metaKey || o.shiftKey || coklu || genislik === 'dar';
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
    const cevaplar: StatuTopluCevabi[] = [];
    for (const govde of istekGovdeleri(kalemler, mod === 'don' ? null : hedef, notMetni, calisanOnay)) {
      cevaplar.push(await api.post<StatuTopluCevabi>('/adimli-emirler/statu-toplu', govde));
    }
    return cevaplar;
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
      const cevaplar: StatuTopluCevabi[] = [];
      for (const govde of geriAlGovdeleri(son.yazilanlar, son.onceki)) cevaplar.push(await api.post<StatuTopluCevabi>('/adimli-emirler/statu-toplu', govde));
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

  const hucreMenusu = (k: Kalem): MenuOgesi[] => [
    ...ELLE_YAZILIR.map((x) => ({ anahtar: x, baslik: STATU[x].ad, simge: STATU[x].simge, sec: () => { hucreYaz(k, x); } })),
    { anahtar: 'don', baslik: 'Otomatiğe dön', simge: 'rotate', sec: () => { hucreYaz(k, null); }, pasif: k.adim.elle === null, pasifNedeni: 'Elle yazılmış statü yok' },
  ];

  const hucre = (k: Kalem, kisa: boolean) => {
    const g = gorunenStatu(k.adim);
    const s = STATU[g];
    const kapali = emirKapali(k.emir);
    const secildi = gecerli.has(k.anahtar);
    return (
      <div className={`tc-am-hucre-kap${aktif === k.anahtar ? ' tc-am-aktif' : ''}`}>
        <button type="button" className={`tc-am-hucre tc-am-ton-${s.ton}${secildi ? ' tc-am-secili' : ''}`} data-am-k={k.anahtar}
          aria-pressed={secildi} aria-label={hucreAdi(k.emir, k.adim)} title={kisa ? `${statuAdi(g)}${kapali ? ' (emir bitti, seçilemez)' : ''}` : undefined}
          onClick={(o) => { tikla(k, o); }}>
          <Simge ad={s.simge} boyut="k" />
          {!kisa && <span className="tc-am-hucre-ad">{s.ad}</span>}
          {k.adim.elle !== null && <span className="tc-am-e" aria-hidden="true">E</span>}
        </button>
        {aktif === k.anahtar && yazabilir && !kapali && <Menu etiket={`${k.emir.emirNo} OP ${String(k.adim.opNo)} statü işlemleri`} ogeler={hucreMenusu(k)} />}
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

  const emirKartlari = () => (
    <ul className="tc-am-kartlar" aria-label="Emirler">
      {gorunen.map((e) => (
        <li key={e.emirId} className="tc-am-emir-karti">
          <div className="tc-am-emir-ust">
            <span className="tc-emir-kod">{e.emirNo}</span>
            {e.teslim !== null && <span className="tc-am-termin">Termin {tarihMetni(e.teslim)}</span>}
          </div>
          <span className="tc-am-urun">{e.urun.ad}{emirKapali(e) ? ' · Emir bitti' : ''}</span>
          <ul className="tc-am-cipler" aria-label={`${e.emirNo} adımları`}>
            {e.adimlar.map((a) => {
              const k = { anahtar: kalemAnahtari(e.emirId, a.isEmriId), emir: e, adim: a };
              const g = gorunenStatu(a);
              return (
                <li key={a.isEmriId}>
                  <button type="button" className={`tc-am-cip tc-am-ton-${STATU[g].ton}${gecerli.has(k.anahtar) ? ' tc-am-secili' : ''}${aktif === k.anahtar ? ' tc-am-aktif' : ''}`}
                    data-am-k={k.anahtar} aria-pressed={gecerli.has(k.anahtar)} aria-label={hucreAdi(e, a)} onClick={(o) => { tikla(k, o); }}>
                    <b>{a.opNo}</b><Simge ad={STATU[g].simge} boyut="k" />{a.elle !== null && <span className="tc-am-e" aria-hidden="true">E</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {yazabilir && <Dugme onClick={() => { topluSec(emrinKalemleri(e)); }}>Emrin adımlarını seç</Dugme>}
        </li>
      ))}
    </ul>
  );

  const siraDugmesi = (sutun: TabloSutunu, ad: string, sinif = '') => (
    <th scope="col" className={sinif} aria-sort={sira.sutun === sutun ? (sira.yon === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="tc-am-baslik tc-am-sira" onClick={() => { siraYaz({ sutun, yon: sira.sutun === sutun && sira.yon === 1 ? -1 : 1 }); }}>
        {ad}{sira.sutun === sutun && <Simge ad={sira.yon === 1 ? 'up' : 'down'} boyut="k" />}
      </button>
    </th>
  );
  const hepsiSecili = tabloSatirlari.length > 0 && tabloSatirlari.every((k) => gecerli.has(k.anahtar));
  const tablo = () => (
    <div className="tc-am-kaydir" tabIndex={0} role="region" aria-label="Adım tablosu">
      <table className="tc-am-tablo tc-am-duz">
        <thead>
          <tr>
            <th scope="col" className="tc-am-onay tc-am-s1">
              <label className="tc-am-onay-hedef">
                <input type="checkbox" aria-label="Görünen adımların hepsini seç" checked={hepsiSecili} disabled={!yazabilir}
                  onChange={() => { topluSec(tabloSatirlari); }} />
              </label>
            </th>
            {siraDugmesi('emir', 'Emir', 'tc-am-s2')}<th scope="col">Ürün</th><th scope="col">OP</th><th scope="col">Adım</th>
            {siraDugmesi('statu', 'Statü')}<th scope="col">Kaynak</th><th scope="col">İlerleme</th>{siraDugmesi('termin', 'Termin')}
          </tr>
        </thead>
        <tbody>
          {tabloSatirlari.map((k) => {
            const g = gorunenStatu(k.adim);
            const secildi = gecerli.has(k.anahtar);
            return (
              <tr key={k.anahtar} className={`${secildi ? 'tc-am-secili-satir' : ''}${aktif === k.anahtar ? ' tc-am-aktif-satir' : ''}`}>
                <td className="tc-am-onay tc-am-s1">
                  <label className="tc-am-onay-hedef">
                    <input type="checkbox" data-am-k={k.anahtar} aria-label={`${k.emir.emirNo} OP ${String(k.adim.opNo)} seç`} checked={secildi}
                      disabled={!yazabilir || emirKapali(k.emir)} onChange={(o) => { aktifYaz(k.anahtar); topluSec([k]); o.currentTarget.focus(); }} />
                  </label>
                </td>
                <td className="tc-am-s2"><button type="button" className="tc-am-baglanti" onClick={() => { aktifYaz(k.anahtar); }}><span className="tc-emir-kod">{k.emir.emirNo}</span></button></td>
                <td>{k.emir.urun.ad}</td>
                <td className="tc-am-sayi">{k.adim.opNo}</td>
                <td>{k.adim.ad}</td>
                <td><Rozet ton={STATU[g].ton}>{statuAdi(g)}</Rozet>{k.adim.elle !== null && <span className="tc-am-e" title="Elle yazıldı">E</span>}</td>
                <td>{k.adim.elle === null ? 'Sistem' : `Elle: ${k.adim.elle.kisiAdi ?? 'kişi'}`}</td>
                <td className="tc-am-sayi">{k.adim.yapilan}/{k.adim.hedef}</td>
                <td className="tc-am-sayi">{k.emir.teslim === null ? '—' : tarihMetni(k.emir.teslim)}{emirKapali(k.emir) ? ' · bitti' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const adimKartlari = () => (
    <ul className="tc-am-kartlar" aria-label="Adımlar">
      {tabloSatirlari.map((k) => {
        const g = gorunenStatu(k.adim);
        const secildi = gecerli.has(k.anahtar);
        return (
          <li key={k.anahtar} className={`tc-am-adim-karti${secildi ? ' tc-am-secili-kart' : ''}`}>
            <label className="tc-am-onay-hedef">
              <input type="checkbox" data-am-k={k.anahtar} aria-label={`${k.emir.emirNo} OP ${String(k.adim.opNo)} seç`} checked={secildi}
                disabled={!yazabilir || emirKapali(k.emir)} onChange={() => { aktifYaz(k.anahtar); topluSec([k]); }} />
            </label>
            <button type="button" className="tc-am-adim-govde" onClick={() => { aktifYaz(k.anahtar); }}>
              <span className="tc-am-emir-ust"><span className="tc-emir-kod">{k.emir.emirNo} · OP {k.adim.opNo}</span><span className="tc-am-termin">{k.emir.teslim === null ? '—' : tarihMetni(k.emir.teslim)}</span></span>
              <span className="tc-am-urun">{k.emir.urun.ad} · {k.adim.ad}</span>
              <span><Rozet ton={STATU[g].ton}>{statuAdi(g)}</Rozet>{k.adim.elle !== null && <span className="tc-am-e" title="Elle yazıldı">E</span>}</span>
              <span className="tc-am-termin">{k.adim.elle === null ? 'Sistem' : `Elle: ${k.adim.elle.kisiAdi ?? 'kişi'}`} · {k.adim.yapilan}/{k.adim.hedef}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  // ----- toplu şerit -----
  const serit = () => {
    if (!yazabilir) return <div className="tc-am-serit tc-am-serit-salt" role="note"><Simge ad="lock" boyut="k" />Statü yazma yetkiniz yok. Yalnız okuyabilirsiniz.</div>;
    if (plan !== null) return planGorunumu(plan);
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

  // ----- ayrıntı paneli -----
  // 360: ayrıntı alttaki yapışan şeridin içinde katlanır; ayrı bir panel şeridin altında kalırdı.
  const panel = () => {
    if (aktifKalem === null) return null;
    const { emir, adim } = aktifKalem;
    const g = gorunenStatu(adim);
    const katli = genislik === 'dar';
    const baslik = `${emir.emirNo} · OP ${String(adim.opNo)} ${adim.ad}`;
    const icerik = (
      <>
        <p className="tc-emir-not">{emir.urun.ad}{emir.teslim === null ? '' : ` · termin ${tarihMetni(emir.teslim)}`}</p>
        <dl className="tc-am-ayrinti">
          <dt>Görünen</dt><dd><Rozet ton={STATU[g].ton}>{statuAdi(g)}</Rozet></dd>
          <dt>Sistem</dt><dd>{statuAdi(adim.sistemStatusu)}<small>{STATU_KAYNAGI[adim.sistemStatusu]}</small></dd>
          <dt>İlerleme</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
          <dt>Elle</dt>
          <dd>{adim.elle === null ? 'Yok (otomatik)' : <>{statuAdi(adim.elle.statu)}<small>{adim.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(adim.elle.zaman)}{adim.elle.not === null || adim.elle.not === '' ? '' : ` · ${adim.elle.not}`}</small></>}</dd>
        </dl>
        {emirKapali(emir) && <p className="tc-emir-not">Emir bitti; elle statü yazılmaz.</p>}
        {!yazabilir && <p className="tc-emir-not"><Simge ad="lock" boyut="k" /> Statü yazma yetkiniz yok.</p>}
        <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={`/adim-durumu?emir=${String(emir.emirId)}`}>Emri aç</Link>
      </>
    );
    if (katli) {
      return (
        <aside className="tc-am-panel tc-am-panel-katli" aria-label="Adım ayrıntısı">
          <details open>
            <summary tabIndex={-1} data-ilk-odak>{baslik}</summary>
            {icerik}
          </details>
          <Dugme simge="x" aria-label="Ayrıntıyı kapat" onClick={panelKapat} />
        </aside>
      );
    }
    return (
      <aside className="tc-am-panel" aria-label="Adım ayrıntısı">
        <div className="tc-am-panel-ust">
          <h3 tabIndex={-1} data-ilk-odak>{baslik}</h3>
          <Dugme simge="x" aria-label="Ayrıntıyı kapat" onClick={panelKapat} />
        </div>
        {icerik}
      </aside>
    );
  };

  const lejant = [...new Set(emirler.flatMap((e) => e.adimlar.map((a) => gorunenStatu(a))))];
  return (
    <div className={`tc-am tc-am-${genislik}`}>
      <div className="tc-am-ust">
        <Girdi etiket="Ara" type="search" placeholder="Emir no, ürün" value={suz.arama} onChange={(o) => { suzYaz({ ...suz, arama: o.target.value }); }} />
        <Secim etiket="Statü" bosSecenek="Tüm statüler" value={suz.statu} onChange={(o) => { suzYaz({ ...suz, statu: o.target.value as AdimStatusu | '' }); }}
          secenekler={lejant.map((x) => ({ deger: x, baslik: statuAdi(x) }))} />
        <div className="tc-am-isaretler">
          <IsaretKutusu etiket="Yalnız elle yazılanlar" checked={suz.yalnizElle} onChange={(o) => { suzYaz({ ...suz, yalnizElle: o.target.checked }); }} />
          <IsaretKutusu etiket="Yalnız sorunlular" checked={suz.yalnizSorunlu} onChange={(o) => { suzYaz({ ...suz, yalnizSorunlu: o.target.checked }); }} />
          <IsaretKutusu etiket="Biteni göster" checked={biten} onChange={(o) => { bitenYaz(o.target.checked); }} />
        </div>
        <div className="tc-am-ust-dugmeler">
          {genislik !== 'dar' && <Dugme aria-pressed={coklu} disabled={!yazabilir} onClick={() => { cokluYaz(!coklu); }}>Çoklu seç</Dugme>}
          <Dugme disabled={!yazabilir || duz.length === 0} onClick={hepsiniSec}>Tümünü seç</Dugme>
        </div>
        <p className="tc-am-sayac" role="status">{veri.isPending ? 'Yükleniyor' : sayacMetni}</p>
      </div>
      <p className="tc-emir-not tc-am-sabit-not"><Simge ad="alert" boyut="k" /> Elle statü, sistem statüsü değişince düşer.</p>
      <div className="tc-am-seritlar">
        {serit()}
        {sonSerit()}
        {genislik === 'dar' && panel()}
      </div>
      <div className={`tc-am-govde${aktifKalem === null ? '' : ' tc-am-panelli'}`}>
        <div className="tc-am-icerik">
          {veri.isPending && <DurumKutusu durum="yukleniyor" />}
          {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Adım matrisi alınamadı.')} yenile={() => { void veri.refetch(); }} />}
          {veri.data && (
            bos
              ? <DurumKutusu durum="bos" mesaj={emirler.length === 0 ? 'Açık emir yok.' : 'Süzgece uyan emir yok.'} />
              : gorunum === 'matris' ? (genislik === 'dar' ? emirKartlari() : matris(genislik === 'orta')) : (genislik === 'dar' ? adimKartlari() : tablo())
          )}
          {veri.data && !bos && (
            <ul className="tc-am-lejant" aria-label="Statü simgeleri">
              {lejant.map((x) => <li key={x}><Simge ad={STATU[x].simge} boyut="k" />{statuAdi(x)}</li>)}
              <li><span className="tc-am-e" aria-hidden="true">E</span>Elle yazıldı</li>
            </ul>
          )}
        </div>
        {genislik !== 'dar' && panel()}
      </div>
    </div>
  );
}
