import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HareketCevabi, OkutCozCevabi, OkutYeri, SepetCevabi, SonIslem, TeslimCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Girdi, KodOkuyucu, Rozet, useOkutmaGecmisi, type KomutIsleyici } from '../../ortak/arayuz/index.ts';
import { AdimSeridi, HedefListesi, SonucKarti, titret, type AkisAdimi, type IslemSonucu } from './OkutDuzeni.tsx';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import {
  ELDEN_NOTU, OKUT_BASI, kisiHedefiMi, okutYolu, panelOkutuldu, sepetEkleGovdesi, sepeteAtilir, sepetliOkutuldu, tasimaGovdesi, teslimGovdesi,
  type OkutDurumu, type OkutHedefi, type OkutKaynagi, type OkutulanHedef,
} from './okut-akisi.ts';
import { BaskaSepetler, Birakma, useSepeteAt, useTasimaSepeti } from './TasimaSepeti.tsx';
import { okutulanSatirlar } from './birakma-secimi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { OkutmaSonucu, stokKodCozAnahtari, type Okunan } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

const yerMetni = (y: OkutYeri): string => `${y.ad ?? y.kod}${y.ad ? ` (${y.kod})` : ''} · ${KONUM_ETIKETI[y.tur]}`;
const hedefMetni = (h: OkutHedefi): string => (kisiHedefiMi(h) ? `${h.alici.ad ?? 'Okutulan kişi'} · ${h.istasyon.ad} (${h.istasyon.kod})` : yerMetni(h));
// 1906: okuyucunun rengi ve son okutmalar şeridi için kısa ad; ayrıntı panelde kalır.
function okutmaAdi(c: OkutCozCevabi): string {
  switch (c.tur) {
    case 'yer': return c.yer.ad ?? c.yer.kod;
    case 'raf': return `Raf ${c.raf.kod}`;
    case 'malzeme': return c.malzeme.ad ?? c.malzeme.kod ?? `Malzeme #${c.malzeme.id}`;
    case 'kisi': return c.kisi.ad ?? 'Kişi kodu';
    // UE: kodu emir kartında, sevk kolisinde, hatalı parça ve fason belgesinde de durur; ortak olan emirdir.
    case 'eski-kart': return `Emir #${String(c.uretimEmriId)}`;
    case 'bilinmiyor': return 'Kod tanınmadı';
  }
}
const hedefAdi = (h: OkutHedefi): string => (kisiHedefiMi(h) ? h.alici.ad ?? h.istasyon.ad : h.ad ?? h.kod);

// Malzeme penceresinin üstündeki okuyucu (372 a; eski ayrı QR tuşu, karar 91 a): pencere açılınca hazır bekler. Okutma yoksa altındaki
// bölüm görünür; okutulan kod akışı başlatınca onun yerini "ne, nereye, onay" alır. Kayıt yalnız bağlantı varken yapılır (karar 95 a).
// Soru 89: ilk okutmanın sonucu (`sonuc`) okuyucunun altında durur; oradan seçilen iş `sifir`ı artırıp akışı başa alır.
// `kamerali` (809): kamera açılışta kendiliğinden başlar, görüntü büyük durur; dokunmatikte kod alanı odak almaz ki ekran klavyesi kamerayı örtmesin.
// `sepetli` (1338 a): art arda okutulan statüsüz malzeme taşıma sepetine düşer; sepet doluyken okutulan yer ya da kişi bırakma ekranını açar.
// `komut` (1909, 1912): okuyucunun komut barkodu işleyicisi (Okut panelinde mod seçimi).
// 3085: `sonuc` okutulan kartını çizer; `ust` (adım şeridi, sepet durumu, ana eylem) kartın başlığının altına girer, `sepette` kartın
// "Depo sepetine ekle"yi gizlemesi içindir. `kutu` Listeden seç'in yerleridir; `kayitlar` sonuç kartının Yolda -> Alındı dönüşünü okur.
export function OkutAlani({ teslimEteGec, okundu, sifir = 0, sonuc: sonucKarti, kamerali = false, sepetli = false, komut, kutu, kayitlar, children }: {
  teslimEteGec: (h: OkutulanHedef) => void; okundu?: (kod: string, c: OkutCozCevabi) => void; sifir?: number;
  sonuc?: ((ust: ReactNode, sepette: boolean) => ReactNode) | null; kamerali?: boolean; sepetli?: boolean;
  komut?: KomutIsleyici; kutu?: TeslimKutusuCevabi; kayitlar?: readonly SonIslem[]; children: ReactNode;
}) {
  const [durum, setDurum] = useState<OkutDurumu>(OKUT_BASI);
  const [sonuc, setSonucMetni] = useState<string | null>(null);
  const [islemSonucu, setIslemSonucuHam] = useState<IslemSonucu | null>(null);
  const setIslemSonucu = (x: IslemSonucu | null) => { setIslemSonucuHam(x); if (x) titret(x.ton); };
  const setSonuc = (x: string | IslemSonucu | null) => { if (x === null || typeof x === 'string') setSonucMetni(x); else { setSonucMetni(null); setIslemSonucu(x); } };
  // Son sepete atılan (1338 a korunur): kart bunu açıkça söyler ve geri alınabilir.
  const [sepeteAlinan, setSepeteAlinan] = useState<OkutKaynagi | null>(null);
  // Sepetteki kalem yeniden okutuldu: iş yapılmadı, kartta sarı satır (Kurgu 9).
  const [zatenSepette, setZatenSepette] = useState<{ ad: string; miktar: string } | null>(null);
  const [listeAcik, setListeAcik] = useState(false);
  // İlk okutmadan sonra kamera tek satıra iner ki sonuç ilk ekranda görünsün (ortak okuyucunun `sik` hâli).
  const [okuttu, setOkuttu] = useState(false);
  const okuyucuKutusu = useRef<HTMLDivElement>(null);
  // Okutulan raf: gözleri düğme olur; seçilen göz kendi etiketi okutulmuş gibi çözülür.
  const [raf, setRaf] = useState<Extract<OkutCozCevabi, { tur: 'raf' }> | null>(null);
  const [birakHedefi, setBirakHedefi] = useState<OkutHedefi | null>(null);
  // 1919 a: bırakma açıkken okutulan etiket o yere giden kalemleri seçer; Kaydet komutu bırakır.
  const [birakOkutma, setBirakOkutma] = useState<{ ids: number[]; sira: number } | null>(null);
  const [birakGonder, setBirakGonder] = useState(0);
  const birakAc = (h: OkutHedefi | null) => { setBirakHedefi(h); setBirakOkutma(null); };
  const [sonCevap, setSonCevap] = useState<OkutCozCevabi | null>(null);
  const sepet = useTasimaSepeti(sepetli);
  const sepetSatirlari = sepet.data?.satirlar ?? [];
  const sepeteAt = useSepeteAt();
  const at = (k: OkutKaynagi) => { sepeteAt.komut.mutate(sepetEkleGovdesi(k)); setDurum(OKUT_BASI); setSonuc(null); setSepeteAlinan(k); };
  const geriAl = useMutation({
    mutationFn: (k: OkutKaynagi) => {
      const s = sepetSatirlari.find((x) => x.malzemeId === k.malzemeId && x.partiId === k.partiId && x.kaynakKonumId === k.yer.konumId);
      return s ? api.post<SepetCevabi>(`/stok/sepet/satirlar/${s.id}/sil`, {}) : Promise.resolve(null);
    },
    onSuccess: () => { setSepeteAlinan(null); void sorgu.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
  });
  useEffect(() => { if (sifir > 0) { setDurum(OKUT_BASI); setSonuc(null); setIslemSonucuHam(null); setSepeteAlinan(null); setZatenSepette(null); setListeAcik(false); setRaf(null); setBirakHedefi(null); setBirakOkutma(null); setSonCevap(null); } }, [sifir]);
  const sorgu = useQueryClient();
  const gecmis = useOkutmaGecmisi();
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onError: (e, kod) => { titret('hata'); gecmis.bildir(kod, 'hata', hataMetni(e)); },
    onSuccess: (c, kod) => {
      setSonuc(null);
      setIslemSonucuHam(null);
      setListeAcik(false);
      setOkuttu(true);
      titret(c.tur === 'bilinmiyor' ? 'hata' : 'okundu');
      if (!birakHedefi) setSepeteAlinan(null);
      const ad = okutmaAdi(c);
      setSonCevap(c);
      setRaf(c.tur === 'raf' ? c : null);
      // Stok okuması olana tam çözüm aynı cevapla gelir; Mal kabul ve Sevk bölümleri ikinci kez istemez.
      if ((c.tur === 'malzeme' || c.tur === 'yer') && c.stok) sorgu.setQueryData(stokKodCozAnahtari(kod), c.stok);
      // Göz seçimi açıkken okutulan başka malzeme ya da lot yeni okutmadır (Arayüz v2 K1): seçim bırakılır, akış baştan.
      const d = sepetli && durum.adim === 'kaynak-sec' && c.tur === 'malzeme' ? OKUT_BASI : durum;
      if (d !== durum) setDurum(d);
      setZatenSepette(null);
      if (sepetli && d.adim === 'ne') {
        const x = sepetliOkutuldu(d, c, sepetSatirlari.length > 0);
        if (x.tur === 'birak') { gecmis.bildir(kod, 'tamam', ad); setRaf(null); birakAc(x.hedef); return; }
        if (birakHedefi) {
          const ids = okutulanSatirlar(sepetSatirlari, c);
          if (ids.length > 0) {
            gecmis.bildir(kod, 'tamam', `${ad} · bırakılacaklara eklendi`);
            setBirakOkutma((o) => ({ ids, sira: (o?.sira ?? 0) + 1 }));
          } else gecmis.bildir(kod, 'uyari', `${ad} sepette yok; önce sepete at ya da başka yer okut`);
          return;
        }
        birakAc(null);
        okundu?.(kod, c);
        if (x.tur === 'sepete-at') {
          // 3085 (kullanıcı 06:45Z): aynı lot ikinci kez okutulunca miktar yeniden eklenmez; sepette olduğu söylenir.
          const k = x.kaynak;
          const var_ = sepetSatirlari.find((s) => s.malzemeId === k.malzemeId && s.partiId === k.partiId && s.kaynakKonumId === k.yer.konumId);
          if (var_) {
            gecmis.bildir(kod, 'uyari', `${ad} zaten sepette`);
            titret('hata');
            setZatenSepette({ ad: k.malzemeAd, miktar: var_.miktar });
            return;
          }
          gecmis.bildir(kod, 'tamam', ad); at(k); return;
        }
      } else if (d.adim === 'ne') okundu?.(kod, c);
      const p = panelOkutuldu(d, c);
      const ileti = p.tur === 'akis' && 'ileti' in p.durum ? p.durum.ileti : null;
      // Raf okutması göz seçtirir: iletisi bir sonraki adımı söyler, yanlış değildir.
      gecmis.bildir(kod, c.tur === 'bilinmiyor' ? 'hata' : ileti && c.tur !== 'raf' ? 'uyari' : 'tamam', ileti ?? ad);
      if (p.tur === 'teslim-et') { setDurum(OKUT_BASI); teslimEteGec(p.hedef); } else setDurum(p.durum);
    },
  });
  const birakmaKomutu: KomutIsleyici = (k) => {
    if (birakHedefi && k.ad === 'KAYDET') { setBirakGonder((n) => n + 1); return { ton: 'tamam', metin: 'Bırakılıyor' }; }
    if (birakHedefi && (k.ad === 'VAZGEC' || k.ad === 'GERI-AL')) { birakAc(null); return { ton: 'tamam', metin: 'Bırakma kapandı' }; }
    return komut?.(k) ?? null;
  };
  const basaDon = (metin: string | IslemSonucu | null) => { setDurum(OKUT_BASI); setSonuc(metin); setRaf(null); };
  // El okuyucu klavye gibi odaktaki yere yazar ve Enter basar (ARASTIRMA K-A): fareli cihazda odak kod alanında kalır ki Enter bir düğmeye basmasın.
  // Dokunmatikte odak verilmez, ekran klavyesi açılmasın.
  const kodAlaninaOdak = () => {
    const k = okuyucuKutusu.current;
    const girdi = k?.querySelector<HTMLInputElement>('input:not([type=file])');
    if (girdi && window.matchMedia?.('(pointer: fine)').matches) girdi.focus({ preventScroll: true });
    else k?.querySelector<HTMLButtonElement>('.tc-kod-okuyucu button')?.focus({ preventScroll: true });
  };
  const okuyucuyaDon = () => { okuyucuKutusu.current?.scrollIntoView?.({ block: 'start' }); kodAlaninaOdak(); };
  useEffect(() => { if (!birakHedefi && durum.adim !== 'onay') kodAlaninaOdak(); }, [islemSonucu, sepeteAlinan, sonCevap, birakHedefi, durum.adim]);
  // Aynı kod 2 sn içinde ikinci kez gelirse yok sayılır (kameradaki kural el okuyucuya da; ARASTIRMA K-E); sunucuda sepet tavanı ayrıca korur.
  const sonKod = useRef<{ kod: string; an: number } | null>(null);
  const okut = (kod: string) => {
    const an = Date.now();
    if (sonKod.current && sonKod.current.kod === kod && an - sonKod.current.an < 2000) return;
    sonKod.current = { kod, an };
    coz.mutate(kod);
  };
  const sepetDolu = sepetSatirlari.length > 0 || sepeteAlinan !== null;
  const adim: AkisAdimi = birakHedefi || durum.adim === 'onay' ? 'onay' : islemSonucu ? 'sonuc'
    : durum.adim === 'nereye' || (durum.adim === 'ne' && sepetDolu) ? 'nereye' : 'ne';
  const birakmaAc = (h: OkutHedefi) => { setListeAcik(false); setSepeteAlinan(null); birakAc(h); };
  // Ana eylem (Kurgu 3): sepette kalem varken tek iş "nereye"dir; okutarak ya da listeden.
  // Arayüz K2: sepete hemen alınamayan da tek ana işle sürer. Lot birden çok gözdeyse önce "Hangi gözden?" (Ne adımı);
  // statülü parça sepete girmez, "Teslim et" onu doğrudan Onay'a götürür.
  const akis = !sepetli || birakHedefi || islemSonucu ? null : durum.adim === 'kaynak-sec' ? (
    <div className="tc-stok-akis" aria-label="Şimdi ne yapabilirsin">
      <AdimSeridi adim="ne" />
      <p className="tc-stok-teslim-baslik">Hangi gözden alınacak?</p>
      <KaynakSecimi secenekler={durum.secenekler} sepetli sec={(kaynak) => (sepeteAtilir(kaynak) ? at(kaynak) : setDurum({ adim: 'nereye', kaynak, ileti: null }))} />
    </div>
  ) : durum.adim === 'nereye' ? (
    <div className="tc-stok-akis" aria-label="Şimdi ne yapabilirsin">
      <AdimSeridi adim="nereye" />
      <div className="tc-stok-ana-eylem">
        <Dugme tur="birincil" simge="scan" onClick={okuyucuyaDon}>Teslim et: yeri ya da kişiyi okut</Dugme>
        {kutu && <Dugme simge="list" aria-expanded={listeAcik} onClick={() => setListeAcik((a) => !a)}>Listeden seç</Dugme>}
      </div>
      {listeAcik && kutu && <HedefListesi kutu={kutu} sec={(h) => { setListeAcik(false); setDurum({ adim: 'onay', kaynak: durum.kaynak, hedef: h }); }} kapat={() => setListeAcik(false)} />}
    </div>
  ) : !sepetDolu ? null : (
    <div className="tc-stok-akis" aria-label="Şimdi ne yapabilirsin">
      <AdimSeridi adim={adim} />
      {sepeteAlinan && (
        <p className="tc-stok-sepette">
          <Rozet ton="tamam">Sepete eklendi</Rozet>
          <span>{sepeteAlinan.malzemeAd} · {miktarMetni(sepeteAlinan.miktar)}{sepeteAlinan.birim ? ` ${sepeteAlinan.birim}` : ''}</span>
          <Dugme tur="ikincil" simge="back" yukleniyor={geriAl.isPending} onClick={() => geriAl.mutate(sepeteAlinan)}>Geri al</Dugme>
        </p>
      )}
      {zatenSepette && (
        <p className="tc-stok-sepette" role="status">
          <Rozet ton="uyari">Zaten sepette</Rozet>
          <span>{zatenSepette.ad} · {miktarMetni(zatenSepette.miktar)}; yeniden eklenmedi</span>
        </p>
      )}
      {!sepeteAlinan && !zatenSepette && <p className="tc-stok-not">Sepette {sepetSatirlari.length} kalem bırakılmayı bekliyor.</p>}
      <div className="tc-stok-ana-eylem">
        <Dugme tur="birincil" simge="scan" onClick={okuyucuyaDon}>Teslim et: yeri ya da kişiyi okut</Dugme>
        {kutu && <Dugme simge="list" aria-expanded={listeAcik} onClick={() => setListeAcik((a) => !a)}>Listeden seç</Dugme>}
      </div>
      {listeAcik && kutu && <HedefListesi kutu={kutu} sec={birakmaAc} kapat={() => setListeAcik(false)} />}
    </div>
  );
  const sonucAlani = islemSonucu ? <SonucKarti sonuc={islemSonucu} kayitlar={kayitlar ?? []} yeniOkut={() => { setIslemSonucuHam(null); okuyucuyaDon(); }} /> : null;
  // Tek kart (614 1a): okutmanın sonuç kartı varken "nereye" adımı ayrı adım şeridi açmaz; sonraki okutma nereyedir.
  const tekKart = sonucKarti != null && durum.adim === 'nereye';
  const ipucu = birakHedefi ? 'Bu yere giden etiketi ya da refakat kartını okut, yalnız okutulanlar bırakılır; bitince Kaydet okut. Başka yer okutursan hedef değişir.'
    : durum.adim === 'ne' ? 'Kartı, malzemeyi, rafı ya da kişinin kodunu kameraya tut ya da el okuyucuyla okut.'
    : durum.adim === 'kaynak-sec' ? 'Ne: malzeme, lot ya da alacağın yerin etiketi.' : 'Nereye: istasyon, raf, harita kutusu ya da alacak kişinin kodu.';
  return (
    <>
      <div className="tc-stok-okut-ust">
        {sonuc && <p className="tc-stok-bilgi" role="status">{sonuc}</p>}
        {sepetli && sonCevap && sonCevap.tur !== 'raf' && <BaskaSepetler c={sonCevap} />}
        {durum.adim !== 'onay' && <div ref={okuyucuKutusu} className="tc-stok-okuyucu-kutusu" {...(okuttu ? { 'data-okuttu': '' } : {})}>{(kamerali && !okuttu
          ? <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={okut} bekliyor={coz.isPending} {...(okuttu && !birakHedefi ? {} : { ipucu })} geribildirim={gecmis} {...(komut || birakHedefi ? { komut: birakmaKomutu } : {})} />
          : <KodOkuyucu sik okundu={okut} bekliyor={coz.isPending} {...(okuttu && !birakHedefi ? {} : { ipucu })} geribildirim={gecmis} {...(komut || birakHedefi ? { komut: birakmaKomutu } : {})} />)}</div>}
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {'ileti' in durum && durum.ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{durum.ileti}</p>}
        {raf && raf.gozler.length > 0 && (sepetli
          ? <RafIcerigi raf={raf} gozSec={(kod) => coz.mutate(`LOC:${kod}`)} bekliyor={coz.isPending} at={at} />
          : (
            <ul className="tc-stok-okut-gozler" aria-label={`Raf ${raf.raf.kod} gözleri`}>
              {raf.gozler.map((g) => <li key={g.konumId}><Dugme simge="box" disabled={coz.isPending} onClick={() => coz.mutate(`LOC:${g.kod}`)}>{g.kod}</Dugme></li>)}
            </ul>
          ))}
        {sonucAlani}
        {/* Bırakma açıkken okutulan kartı gizlenir: tek birincil "bırak" kalır (Arayüz K2). */}
        {!islemSonucu && !birakHedefi && sonucKarti ? sonucKarti(akis, sepetDolu) : !islemSonucu && akis && <section className="tc-stok-is tc-stok-okut-sonuc">{akis}</section>}
      </div>
      {birakHedefi ? (
        <Birakma key={birakmaAnahtari(birakHedefi)} hedef={birakHedefi} satirlar={sepetSatirlari} okutma={birakOkutma} gonder={birakGonder}
          bitti={(x) => { birakAc(null); setSonuc(x); }} vazgec={() => birakAc(null)} />
      ) : durum.adim === 'ne' || (akis !== null && (durum.adim === 'kaynak-sec' || durum.adim === 'nereye')) ? (durum.adim === 'ne' ? children : null) : (
        <div className="tc-stok-form tc-stok-okut-paneli">
          {!tekKart && <AdimSeridi adim={adim} />}
          {durum.adim === 'kaynak-sec' && <KaynakSecimi secenekler={durum.secenekler} sepetli={sepetli}
            sec={(kaynak) => (sepetli && sepeteAtilir(kaynak) ? at(kaynak) : setDurum({ adim: 'nereye', kaynak, ileti: null }))} />}
          {(durum.adim === 'nereye' || durum.adim === 'onay') && <KaynakOzeti kaynak={durum.kaynak} />}
          {durum.adim === 'onay' && <Onay kaynak={durum.kaynak} hedef={durum.hedef} geri={() => setDurum({ adim: 'nereye', kaynak: durum.kaynak, ileti: null })} bitti={basaDon} />}
          <div className="tc-stok-eylem"><Dugme simge="x" onClick={() => basaDon(null)}>Vazgeç</Dugme></div>
        </div>
      )}
    </>
  );
}

function KaynakSatiri({ k }: { k: OkutKaynagi }) {
  const statuAdi = useStatuAdi();
  return (
    <>
      <strong>{k.malzemeAd} · {miktarMetni(k.miktar)}{k.birim ? ` ${k.birim}` : ''}</strong>
      <span>{yerMetni(k.yer)} · {statuAdi(k.statuId)}{k.partiEtiketi ? ` · ${k.partiEtiketi}` : ''}</span>
    </>
  );
}

const birakmaAnahtari = (h: OkutHedefi): string => (kisiHedefiMi(h) ? `k:${h.alici.kod}` : `y:${h.konumId}`);

// Raf okutulunca (1338 a) gözler içerikleriyle gelir: alabileceği gözün serbest satırları (93 a), statüsüz satır sepete atılır.
// Göz düğmesi gözün etiketi okutulmuş gibidir: sepet doluysa bırakma hedefi olur.
function RafIcerigi({ raf, gozSec, bekliyor, at }: { raf: Extract<OkutCozCevabi, { tur: 'raf' }>; gozSec: (kod: string) => void; bekliyor: boolean; at: (k: OkutKaynagi) => void }) {
  const statuAdi = useStatuAdi();
  return (
    <div className="tc-stok-raf-icerik" aria-label={`Raf ${raf.raf.kod}`}>
      {raf.gozler.map(({ satirlar, ...goz }) => (
        <section key={goz.konumId} className="tc-stok-raf-goz" aria-label={`Göz ${goz.kod}`}>
          <div className="tc-stok-raf-goz-bas">
            <Dugme simge="box" disabled={bekliyor} onClick={() => gozSec(goz.kod)}>{goz.kod}</Dugme>
            <span className="tc-stok-not">{satirlar === null || satirlar === undefined ? 'İçerik açık değil' : satirlar.length === 0 ? 'Boş' : `${satirlar.length} kalem`}</span>
          </div>
          <BaskaSepetler c={raf} konumId={goz.konumId} />
          {satirlar && satirlar.length > 0 && (
            <ul className="tc-stok-satirlar">
              {satirlar.map((x) => {
                const k: OkutKaynagi = { malzemeId: x.malzemeId, malzemeAd: x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`, birim: null, yer: goz, partiId: x.partiId, partiEtiketi: x.partiEtiketi, statuId: x.statuId, miktar: x.miktar };
                return (
                  <li key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`}>
                    <span><strong>{k.malzemeAd}</strong> <span className="tc-stok-mono">{[x.partiEtiketi, statuAdi(x.statuId)].filter(Boolean).join(' · ')} · {miktarMetni(x.miktar)}</span></span>
                    {sepeteAtilir(k) && <Dugme simge="plus" onClick={() => at(k)}>Al</Dugme>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function KaynakSecimi({ secenekler, sec, sepetli = false }: { secenekler: OkutKaynagi[]; sec: (k: OkutKaynagi) => void; sepetli?: boolean }) {
  return (
    <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Nereden alınacak">
      {secenekler.map((k) => (
        <li key={`${k.yer.konumId}:${k.malzemeId}:${k.partiId ?? ''}:${k.statuId ?? ''}`} className="tc-stok-is">
          <div><KaynakSatiri k={k} /></div>
          <Dugme tur={sepetli ? 'ikincil' : 'birincil'} simge={sepetli && sepeteAtilir(k) ? 'cart' : undefined} onClick={() => sec(k)}>{sepetli && sepeteAtilir(k) ? 'Sepete at' : 'Bunu al'}</Dugme>
        </li>
      ))}
    </ul>
  );
}

function KaynakOzeti({ kaynak }: { kaynak: OkutKaynagi }) {
  return <div className="tc-stok-is tc-stok-okut-kaynak"><div><span>Alınan</span><KaynakSatiri k={kaynak} /></div></div>;
}

function Onay({ kaynak, hedef, geri, bitti }: { kaynak: OkutKaynagi; hedef: OkutHedefi; geri: () => void; bitti: (sonuc: IslemSonucu) => void }) {
  const depocu = useIslem('stok.transfer');
  const yol = okutYolu(kaynak, hedef, depocu);
  const [miktar, setMiktar] = useState(miktarMetni(kaynak.miktar).replace(/\./g, ''));
  // Kaynak kimliği bu onay için bir kez üretilir: "Yeniden gönder" aynı kaydı gönderir, ikinci teslim açılmaz (karar 95 a).
  const [kimlik] = useState(yeniIstekKimligi);
  const cevrimdisi = typeof navigator !== 'undefined' && navigator.onLine === false;
  const tasima = useStokKomutu((g: ReturnType<typeof tasimaGovdesi>) => korumaliPost<HareketCevabi>('/stok/tasima', g)
    .then((c) => { bitti({ ton: 'yapildi', baslik: `Taşındı: ${hedefAdi(hedef)}`, satirlar: [kaynak.malzemeAd], teslimNolari: [] }); return c; }), 'Taşındı.');
  const teslim = useStokKomutu((g: ReturnType<typeof teslimGovdesi>) => korumaliPost<TeslimCevabi>('/stok/teslimler/gonder', g)
    .then((c) => {
      bitti(c.teslim.durum !== 'teslim'
        ? { ton: 'yolda', baslik: `Teslim edildi: ${hedefAdi(hedef)}`, satirlar: [`${kaynak.malzemeAd} · ${c.teslim.no}`], teslimNolari: [c.teslim.no] }
        : { ton: 'yapildi', baslik: kisiHedefiMi(hedef) ? `Elden teslim edildi: ${hedefAdi(hedef)}` : `Bırakıldı: ${hedefAdi(hedef)}`, satirlar: [`${kaynak.malzemeAd} · ${c.teslim.no}`], teslimNolari: [c.teslim.no] });
      return c;
    }), 'Teslim kaydedildi.');
  // Bırakınca teslim (Soru 133): ayrı kimlik; aynı onayda Teslim et ile karışmaz.
  const [birakKimligi] = useState(yeniIstekKimligi);
  const komut = yol === 'tasima' ? tasima.komut : teslim.komut;
  const gonder = () => {
    const m = miktarGirdisi(miktar);
    if (yol === 'tasima' && !kisiHedefiMi(hedef)) tasima.komut.mutate(tasimaGovdesi(kaynak, hedef, m));
    else teslim.komut.mutate(teslimGovdesi(kaynak, hedef, m, kimlik));
  };
  return (
    <form className="tc-stok-form" onSubmit={(o) => { o.preventDefault(); gonder(); }}>
      <div className="tc-stok-is tc-stok-okut-kaynak"><div><span>Nereye</span><strong>{hedefMetni(hedef)}</strong></div></div>
      {kisiHedefiMi(hedef) && <p className="tc-stok-bilgi" role="status">{ELDEN_NOTU(hedef.alici.ad)}</p>}
      {yol === 'teslim' && !kisiHedefiMi(hedef) && <p className="tc-stok-not">Teslim et yolda açar, karşı taraf alır. Bıraktım teslimi hemen kapatır; karşı taraf vardiya sonuna kadar itiraz eder.</p>}
      <div className="tc-stok-iki"><Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required autoFocus /></div>
      {cevrimdisi && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">Bağlantı yok; kayıt yalnız bağlantı varken yapılır.</p>}
      {komut.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(komut.error)}</p>}
      <div className="tc-stok-eylem">
        <Dugme tur="birincil" type="submit" simge={yol === 'tasima' ? 'box' : 'upload'} yukleniyor={komut.isPending} disabled={cevrimdisi || miktar.trim() === ''}>
          {komut.isError ? 'Yeniden gönder' : yol === 'tasima' ? 'Yerleştir' : 'Teslim et'}
        </Dugme>
        {yol === 'teslim' && !kisiHedefiMi(hedef) && (
          <Dugme simge="check" disabled={cevrimdisi || miktar.trim() === '' || komut.isPending} onClick={() => teslim.komut.mutate(teslimGovdesi(kaynak, hedef, miktarGirdisi(miktar), birakKimligi, true))}>Bıraktım</Dugme>
        )}
        <Dugme simge="back" onClick={geri}>Başka yer okut</Dugme>
      </div>
      {tasima.onayPenceresi}
      {teslim.onayPenceresi}
    </form>
  );
}

// Bilgi modu (1912): okutulan kod çözülür ve gösterilir; akış başlamaz, hiçbir şey yazılmaz. Çözüm panelin okumasıdır (stok.istek);
// gözler ve lotlar yalnız stok okuması olana görünür (soru 93 a).
export function BilgiOkut({ komut }: { komut?: KomutIsleyici }) {
  const gecmis = useOkutmaGecmisi();
  const sorgu = useQueryClient();
  const [okunan, setOkunan] = useState<(Okunan & { sira: number }) | null>(null);
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onError: (e, kod) => gecmis.bildir(kod, 'hata', hataMetni(e)),
    onSuccess: (c, kod) => {
      gecmis.bildir(kod, c.tur === 'bilinmiyor' ? 'hata' : 'tamam', okutmaAdi(c));
      if ((c.tur === 'malzeme' || c.tur === 'yer') && c.stok) sorgu.setQueryData(stokKodCozAnahtari(kod), c.stok);
      setOkunan((o) => ({ kod, cevap: c, sira: (o?.sira ?? 0) + 1 }));
    },
  });
  const c = okunan?.cevap;
  return (
    <div className="tc-stok-okut-ust">
      <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={(kod) => coz.mutate(kod)} bekliyor={coz.isPending} geribildirim={gecmis}
        ipucu="Herhangi bir etiketi okut; ne olduğu ve nerede durduğu görünür, kayıt yapılmaz." {...(komut ? { komut } : {})} />
      {okunan && c && (c.tur === 'malzeme' || c.tur === 'yer')
        ? <OkutmaSonucu key={okunan.sira} okunan={okunan} salt sec={() => undefined} kapat={() => setOkunan(null)} />
        : c?.tur === 'raf' ? <p className="tc-stok-bilgi" role="status">Raf {c.raf.kod} · {c.gozler.length} göz: {c.gozler.map((g) => g.kod).join(', ')}</p>
        : c && c.tur !== 'bilinmiyor' ? <p className="tc-stok-bilgi" role="status">{okutmaAdi(c)}</p>
        : !okunan && <DurumKutusu durum="bos" mesaj="Bir etiket okut." />}
    </div>
  );
}
