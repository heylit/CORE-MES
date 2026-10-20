import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HareketCevabi, OkutCozCevabi, OkutYeri, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, KodOkuyucu, Pencere, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import { OKUT_BASI, okutuldu, okutYolu, tasimaGovdesi, teslimGovdesi, type OkutDurumu, type OkutKaynagi } from './okut-akisi.ts';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import './stok.css';

// Üst çubuğun solundaki QR tuşu (karar 91 a): her sayfada aynı yerde. Kayıt yalnız bağlantı varken yapılır (karar 95 a).
// Yalnız simge: yazılı ad 1280'de sayfa başlığını kesiyordu; ad ipucu ve erişilebilir ad olarak kalır.
export function OkutDugmesi() {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <button type="button" className="tc-kabuk-tema" onClick={() => setAcik(true)} aria-haspopup="dialog" aria-label="QR okut" title="QR okut">
        <Simge ad="scan" />
      </button>
      {acik && <OkutPaneli kapat={() => setAcik(false)} />}
    </>
  );
}

const yerMetni = (y: OkutYeri): string => `${y.ad ?? y.kod}${y.ad ? ` (${y.kod})` : ''} · ${KONUM_ETIKETI[y.tur]}`;

export function OkutPaneli({ kapat }: { kapat: () => void }) {
  const [durum, setDurum] = useState<OkutDurumu>(OKUT_BASI);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c) => { setSonuc(null); setDurum((d) => okutuldu(d, c)); },
  });
  const basaDon = (metin: string | null) => { setDurum(OKUT_BASI); setSonuc(metin); };
  const ipucu = durum.adim === 'ne' || durum.adim === 'kaynak-sec' ? 'Ne: malzeme, lot ya da alacağın yerin etiketi.' : 'Nereye: istasyon, raf ya da harita kutusunun etiketi.';
  return (
    <Pencere acik kapat={kapat} baslik="QR okut" tur="yan">
      <div className="tc-stok-form tc-stok-okut-paneli">
        <ol className="tc-stok-okut-adimlar" aria-label="Adımlar">
          <li aria-current={durum.adim === 'ne' || durum.adim === 'kaynak-sec' ? 'step' : undefined}>Ne</li>
          <li aria-current={durum.adim === 'nereye' ? 'step' : undefined}>Nereye</li>
          <li aria-current={durum.adim === 'onay' ? 'step' : undefined}>Onay</li>
        </ol>
        {sonuc && <p className="tc-stok-bilgi" role="status">{sonuc}</p>}
        {durum.adim !== 'onay' && <KodOkuyucu okundu={(kod) => coz.mutate(kod)} bekliyor={coz.isPending} ipucu={ipucu} />}
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {'ileti' in durum && durum.ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{durum.ileti}</p>}
        {durum.adim === 'kaynak-sec' && <KaynakSecimi secenekler={durum.secenekler} sec={(kaynak) => setDurum({ adim: 'nereye', kaynak, ileti: null })} />}
        {(durum.adim === 'nereye' || durum.adim === 'onay') && <KaynakOzeti kaynak={durum.kaynak} />}
        {durum.adim === 'onay' && <Onay kaynak={durum.kaynak} hedef={durum.hedef} geri={() => setDurum({ adim: 'nereye', kaynak: durum.kaynak, ileti: null })} bitti={basaDon} />}
        {durum.adim !== 'ne' && <div className="tc-stok-eylem"><Dugme simge="x" onClick={() => basaDon(null)}>Baştan başla</Dugme></div>}
      </div>
    </Pencere>
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

function Onay({ kaynak, hedef, geri, bitti }: { kaynak: OkutKaynagi; hedef: OkutYeri; geri: () => void; bitti: (metin: string) => void }) {
  const depocu = useIslem('stok.transfer');
  const yol = okutYolu(kaynak, hedef, depocu);
  const [miktar, setMiktar] = useState(miktarMetni(kaynak.miktar).replace(/\./g, ''));
  // Kaynak kimliği bu onay için bir kez üretilir: "Yeniden gönder" aynı kaydı gönderir, ikinci teslim açılmaz (karar 95 a).
  const [kimlik] = useState(yeniIstekKimligi);
  const cevrimdisi = typeof navigator !== 'undefined' && navigator.onLine === false;
  const tasima = useStokKomutu((g: ReturnType<typeof tasimaGovdesi>) => korumaliPost<HareketCevabi>('/stok/tasima', g)
    .then((c) => { bitti(`${kaynak.malzemeAd} ${hedef.ad ?? hedef.kod} yerine taşındı.`); return c; }), 'Taşındı.');
  const teslim = useStokKomutu((g: ReturnType<typeof teslimGovdesi>) => korumaliPost<TeslimCevabi>('/stok/teslimler/gonder', g)
    .then((c) => { bitti(c.teslim.durum === 'teslim' ? `${c.teslim.no}: ${hedef.ad ?? hedef.kod} yerine bırakıldı.` : `${c.teslim.no} yolda; ${hedef.ad ?? hedef.kod} teslim alınca kapanır.`); return c; }), 'Teslim kaydedildi.');
  const komut = yol === 'tasima' ? tasima.komut : teslim.komut;
  const gonder = () => {
    const m = miktarGirdisi(miktar);
    if (yol === 'tasima') tasima.komut.mutate(tasimaGovdesi(kaynak, hedef, m));
    else teslim.komut.mutate(teslimGovdesi(kaynak, hedef, m, kimlik));
  };
  return (
    <form className="tc-stok-form" onSubmit={(o) => { o.preventDefault(); gonder(); }}>
      <div className="tc-stok-is tc-stok-okut-kaynak"><div><span>Nereye</span><strong>{yerMetni(hedef)}</strong></div></div>
      <div className="tc-stok-iki"><Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required autoFocus /></div>
      {cevrimdisi && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">Bağlantı yok; kayıt yalnız bağlantı varken yapılır.</p>}
      {komut.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(komut.error)}</p>}
      <div className="tc-stok-eylem">
        <Dugme tur="birincil" type="submit" simge={yol === 'tasima' ? 'box' : 'upload'} yukleniyor={komut.isPending} disabled={cevrimdisi || miktar.trim() === ''}>
          {komut.isError ? 'Yeniden gönder' : yol === 'tasima' ? 'Yerleştir' : 'Teslim et'}
        </Dugme>
        <Dugme simge="back" onClick={geri}>Başka yer okut</Dugme>
      </div>
      {tasima.onayPenceresi}
      {teslim.onayPenceresi}
    </form>
  );
}
