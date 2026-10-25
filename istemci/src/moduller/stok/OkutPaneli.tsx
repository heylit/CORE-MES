import { useEffect, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HareketCevabi, OkutCozCevabi, OkutYeri, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, KodOkuyucu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import {
  ELDEN_NOTU, OKUT_BASI, kisiHedefiMi, okutYolu, panelOkutuldu, tasimaGovdesi, teslimGovdesi, type OkutDurumu, type OkutHedefi, type OkutKaynagi, type OkutulanHedef,
} from './okut-akisi.ts';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

const yerMetni = (y: OkutYeri): string => `${y.ad ?? y.kod}${y.ad ? ` (${y.kod})` : ''} · ${KONUM_ETIKETI[y.tur]}`;
const hedefMetni = (h: OkutHedefi): string => (kisiHedefiMi(h) ? `${h.alici.ad ?? 'Okutulan kişi'} · ${h.istasyon.ad} (${h.istasyon.kod})` : yerMetni(h));
const hedefAdi = (h: OkutHedefi): string => (kisiHedefiMi(h) ? h.alici.ad ?? h.istasyon.ad : h.ad ?? h.kod);

// Malzeme penceresinin üstündeki okuyucu (372 a; eski ayrı QR tuşu, karar 91 a): pencere açılınca hazır bekler. Okutma yoksa altındaki
// sekmeler görünür; okutulan kod akışı başlatınca sekmelerin yerini "ne, nereye, onay" alır. Kayıt yalnız bağlantı varken yapılır (karar 95 a).
// Soru 89: ilk okutmanın sonucu (`sonuc`) okuyucunun altında durur; oradan seçilen iş `sifir`ı artırıp akışı başa alır.
export function OkutAlani({ teslimEteGec, okundu, sifir = 0, sonuc: sonucKarti, children }: {
  teslimEteGec: (h: OkutulanHedef) => void; okundu?: (kod: string, c: OkutCozCevabi) => void; sifir?: number; sonuc?: ReactNode; children: ReactNode;
}) {
  const [durum, setDurum] = useState<OkutDurumu>(OKUT_BASI);
  const [sonuc, setSonuc] = useState<string | null>(null);
  useEffect(() => { if (sifir > 0) { setDurum(OKUT_BASI); setSonuc(null); } }, [sifir]);
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c, kod) => {
      setSonuc(null);
      if (durum.adim === 'ne') okundu?.(kod, c);
      const p = panelOkutuldu(durum, c);
      if (p.tur === 'teslim-et') { setDurum(OKUT_BASI); teslimEteGec(p.hedef); } else setDurum(p.durum);
    },
  });
  const basaDon = (metin: string | null) => { setDurum(OKUT_BASI); setSonuc(metin); };
  const ipucu = durum.adim === 'ne' ? 'Malzeme, lot, raf ya da kişinin kodunu okut; okutmadan aşağıdaki sekmelerle de çalışılır.'
    : durum.adim === 'kaynak-sec' ? 'Ne: malzeme, lot ya da alacağın yerin etiketi.' : 'Nereye: istasyon, raf, harita kutusu ya da alacak kişinin kodu.';
  return (
    <>
      <div className="tc-stok-okut-ust">
        {sonuc && <p className="tc-stok-bilgi" role="status">{sonuc}</p>}
        {durum.adim !== 'onay' && <KodOkuyucu sik okundu={(kod) => coz.mutate(kod)} bekliyor={coz.isPending} ipucu={ipucu} />}
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {'ileti' in durum && durum.ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{durum.ileti}</p>}
        {sonucKarti}
      </div>
      {durum.adim === 'ne' ? children : (
        <div className="tc-stok-form tc-stok-okut-paneli">
          <ol className="tc-stok-okut-adimlar" aria-label="Adımlar">
            <li aria-current={durum.adim === 'kaynak-sec' ? 'step' : undefined}>Ne</li>
            <li aria-current={durum.adim === 'nereye' ? 'step' : undefined}>Nereye</li>
            <li aria-current={durum.adim === 'onay' ? 'step' : undefined}>Onay</li>
          </ol>
          {durum.adim === 'kaynak-sec' && <KaynakSecimi secenekler={durum.secenekler} sec={(kaynak) => setDurum({ adim: 'nereye', kaynak, ileti: null })} />}
          {(durum.adim === 'nereye' || durum.adim === 'onay') && <KaynakOzeti kaynak={durum.kaynak} />}
          {durum.adim === 'onay' && <Onay kaynak={durum.kaynak} hedef={durum.hedef} geri={() => setDurum({ adim: 'nereye', kaynak: durum.kaynak, ileti: null })} bitti={basaDon} />}
          <div className="tc-stok-eylem"><Dugme simge="x" onClick={() => basaDon(null)}>Vazgeç, sekmelere dön</Dugme></div>
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

function KaynakSecimi({ secenekler, sec }: { secenekler: OkutKaynagi[]; sec: (k: OkutKaynagi) => void }) {
  return (
    <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Nereden alınacak">
      {secenekler.map((k) => (
        <li key={`${k.yer.konumId}:${k.malzemeId}:${k.partiId ?? ''}:${k.statuId ?? ''}`} className="tc-stok-is">
          <div><KaynakSatiri k={k} /></div>
          <Dugme tur="birincil" onClick={() => sec(k)}>Bunu al</Dugme>
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
