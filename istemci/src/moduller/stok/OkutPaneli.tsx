import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HareketCevabi, OkutCozCevabi, OkutYeri, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, KodOkuyucu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import {
  ELDEN_NOTU, OKUT_BASI, kisiHedefiMi, okutYolu, panelOkutuldu, sepetEkleGovdesi, sepeteAtilir, sepetliOkutuldu, tasimaGovdesi, teslimGovdesi,
  type OkutDurumu, type OkutHedefi, type OkutKaynagi, type OkutulanHedef,
} from './okut-akisi.ts';
import { BaskaSepetler, Birakma, useSepeteAt, useTasimaSepeti } from './TasimaSepeti.tsx';
import { stokKodCozAnahtari } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

const yerMetni = (y: OkutYeri): string => `${y.ad ?? y.kod}${y.ad ? ` (${y.kod})` : ''} · ${KONUM_ETIKETI[y.tur]}`;
const hedefMetni = (h: OkutHedefi): string => (kisiHedefiMi(h) ? `${h.alici.ad ?? 'Okutulan kişi'} · ${h.istasyon.ad} (${h.istasyon.kod})` : yerMetni(h));
const hedefAdi = (h: OkutHedefi): string => (kisiHedefiMi(h) ? h.alici.ad ?? h.istasyon.ad : h.ad ?? h.kod);

// Malzeme penceresinin üstündeki okuyucu (372 a; eski ayrı QR tuşu, karar 91 a): pencere açılınca hazır bekler. Okutma yoksa altındaki
// bölüm görünür; okutulan kod akışı başlatınca onun yerini "ne, nereye, onay" alır. Kayıt yalnız bağlantı varken yapılır (karar 95 a).
// Soru 89: ilk okutmanın sonucu (`sonuc`) okuyucunun altında durur; oradan seçilen iş `sifir`ı artırıp akışı başa alır.
// `kamerali` (809): kamera açılışta kendiliğinden başlar, görüntü büyük durur; dokunmatikte kod alanı odak almaz ki ekran klavyesi kamerayı örtmesin.
// `sepetli` (1338 a): art arda okutulan statüsüz malzeme taşıma sepetine düşer; sepet doluyken okutulan yer ya da kişi bırakma ekranını açar.
export function OkutAlani({ teslimEteGec, okundu, sifir = 0, sonuc: sonucKarti, kamerali = false, sepetli = false, children }: {
  teslimEteGec: (h: OkutulanHedef) => void; okundu?: (kod: string, c: OkutCozCevabi) => void; sifir?: number; sonuc?: ReactNode; kamerali?: boolean; sepetli?: boolean; children: ReactNode;
}) {
  const [durum, setDurum] = useState<OkutDurumu>(OKUT_BASI);
  const [sonuc, setSonuc] = useState<string | null>(null);
  // Okutulan raf: gözleri düğme olur; seçilen göz kendi etiketi okutulmuş gibi çözülür.
  const [raf, setRaf] = useState<Extract<OkutCozCevabi, { tur: 'raf' }> | null>(null);
  const [birakHedefi, setBirakHedefi] = useState<OkutHedefi | null>(null);
  const [sonCevap, setSonCevap] = useState<OkutCozCevabi | null>(null);
  const sepet = useTasimaSepeti(sepetli);
  const sepetSatirlari = sepet.data?.satirlar ?? [];
  const sepeteAt = useSepeteAt();
  const at = (k: OkutKaynagi) => { sepeteAt.komut.mutate(sepetEkleGovdesi(k)); setDurum(OKUT_BASI); setSonuc(`${k.malzemeAd} · ${miktarMetni(k.miktar)} sepete atıldı. Sıradakini okut ya da bırakacağın yeri okut.`); };
  useEffect(() => { if (sifir > 0) { setDurum(OKUT_BASI); setSonuc(null); setRaf(null); setBirakHedefi(null); setSonCevap(null); } }, [sifir]);
  const sorgu = useQueryClient();
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c, kod) => {
      setSonuc(null);
      setSonCevap(c);
      setRaf(c.tur === 'raf' ? c : null);
      // Stok okuması olana tam çözüm aynı cevapla gelir; Mal kabul ve Sevk bölümleri ikinci kez istemez.
      if ((c.tur === 'malzeme' || c.tur === 'yer') && c.stok) sorgu.setQueryData(stokKodCozAnahtari(kod), c.stok);
      if (sepetli && durum.adim === 'ne') {
        const x = sepetliOkutuldu(durum, c, sepetSatirlari.length > 0);
        if (x.tur === 'birak') { setRaf(null); setBirakHedefi(x.hedef); return; }
        setBirakHedefi(null);
        okundu?.(kod, c);
        if (x.tur === 'sepete-at') { at(x.kaynak); return; }
      } else if (durum.adim === 'ne') okundu?.(kod, c);
      const p = panelOkutuldu(durum, c);
      if (p.tur === 'teslim-et') { setDurum(OKUT_BASI); teslimEteGec(p.hedef); } else setDurum(p.durum);
    },
  });
  const basaDon = (metin: string | null) => { setDurum(OKUT_BASI); setSonuc(metin); setRaf(null); };
  // Tek kart (614 1a): okutmanın sonuç kartı varken "nereye" adımı ayrı adım şeridi açmaz; sonraki okutma nereyedir.
  const tekKart = sonucKarti != null && durum.adim === 'nereye';
  const ipucu = durum.adim === 'ne' ? 'Kartı, malzemeyi, rafı ya da kişinin kodunu kameraya tut ya da el okuyucuyla okut.'
    : durum.adim === 'kaynak-sec' ? 'Ne: malzeme, lot ya da alacağın yerin etiketi.' : 'Nereye: istasyon, raf, harita kutusu ya da alacak kişinin kodu.';
  return (
    <>
      <div className="tc-stok-okut-ust">
        {sonuc && <p className="tc-stok-bilgi" role="status">{sonuc}</p>}
        {sepetli && sonCevap && sonCevap.tur !== 'raf' && <BaskaSepetler c={sonCevap} />}
        {durum.adim !== 'onay' && (kamerali
          ? <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={(kod) => coz.mutate(kod)} bekliyor={coz.isPending} ipucu={ipucu} />
          : <KodOkuyucu sik okundu={(kod) => coz.mutate(kod)} bekliyor={coz.isPending} ipucu={ipucu} />)}
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {'ileti' in durum && durum.ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{durum.ileti}</p>}
        {raf && raf.gozler.length > 0 && (sepetli
          ? <RafIcerigi raf={raf} gozSec={(kod) => coz.mutate(`LOC:${kod}`)} bekliyor={coz.isPending} at={at} />
          : (
            <ul className="tc-stok-okut-gozler" aria-label={`Raf ${raf.raf.kod} gözleri`}>
              {raf.gozler.map((g) => <li key={g.konumId}><Dugme simge="box" disabled={coz.isPending} onClick={() => coz.mutate(`LOC:${g.kod}`)}>{g.kod}</Dugme></li>)}
            </ul>
          ))}
        {sonucKarti}
      </div>
      {birakHedefi ? (
        <Birakma key={birakmaAnahtari(birakHedefi)} hedef={birakHedefi} satirlar={sepetSatirlari}
          bitti={(metin) => { setBirakHedefi(null); setSonuc(metin); }} vazgec={() => setBirakHedefi(null)} />
      ) : durum.adim === 'ne' ? children : (
        <div className="tc-stok-form tc-stok-okut-paneli">
          {!tekKart && <ol className="tc-stok-okut-adimlar" aria-label="Adımlar">
            <li aria-current={durum.adim === 'kaynak-sec' ? 'step' : undefined}>Ne</li>
            <li aria-current={durum.adim === 'nereye' ? 'step' : undefined}>Nereye</li>
            <li aria-current={durum.adim === 'onay' ? 'step' : undefined}>Onay</li>
          </ol>}
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
          <Dugme tur="birincil" simge={sepetli && sepeteAtilir(k) ? 'cart' : undefined} onClick={() => sec(k)}>{sepetli && sepeteAtilir(k) ? 'Sepete at' : 'Bunu al'}</Dugme>
        </li>
      ))}
    </ul>
  );
}

function KaynakOzeti({ kaynak }: { kaynak: OkutKaynagi }) {
  return <div className="tc-stok-is tc-stok-okut-kaynak"><div><span>Alınan</span><KaynakSatiri k={kaynak} /></div></div>;
}

function Onay({ kaynak, hedef, geri, bitti }: { kaynak: OkutKaynagi; hedef: OkutHedefi; geri: () => void; bitti: (metin: string) => void }) {
  const depocu = useIslem('stok.transfer');
  const yol = okutYolu(kaynak, hedef, depocu);
  const [miktar, setMiktar] = useState(miktarMetni(kaynak.miktar).replace(/\./g, ''));
  // Kaynak kimliği bu onay için bir kez üretilir: "Yeniden gönder" aynı kaydı gönderir, ikinci teslim açılmaz (karar 95 a).
  const [kimlik] = useState(yeniIstekKimligi);
  const cevrimdisi = typeof navigator !== 'undefined' && navigator.onLine === false;
  const tasima = useStokKomutu((g: ReturnType<typeof tasimaGovdesi>) => korumaliPost<HareketCevabi>('/stok/tasima', g)
    .then((c) => { bitti(`${kaynak.malzemeAd} ${hedefAdi(hedef)} yerine taşındı.`); return c; }), 'Taşındı.');
  const teslim = useStokKomutu((g: ReturnType<typeof teslimGovdesi>) => korumaliPost<TeslimCevabi>('/stok/teslimler/gonder', g)
    .then((c) => {
      bitti(c.teslim.durum !== 'teslim' ? `${c.teslim.no} yolda; ${hedefAdi(hedef)} teslim alınca kapanır.`
        : kisiHedefiMi(hedef) ? `${c.teslim.no}: ${hedefAdi(hedef)} kişisine elden teslim edildi.` : `${c.teslim.no}: ${hedefAdi(hedef)} yerine bırakıldı.`);
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
