import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  GelecekSepetCevabi, IsMalzemeleriCevabi, IsMalzemesiIsteGovdesi, IstasyonSepetiCevabi, IstasyonSepetiSatiri, IstekAcGovdesi, SepettenCekGovdesi, SepettenKullanGovdesi, IstekMalzemeleriCevabi, KisiKoduCevabi, OkutCozCevabi, Teslim, TeslimAlGovdesi, TeslimGonderGovdesi, TeslimKutusuCevabi, TeslimReddetGovdesi, TeslimYeri, YerdekiStokCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Girdi, KodOkuyucu, Pencere, Rozet, Secim, Sekmeler, Simge, type Secenek, type Sekme } from '../../ortak/arayuz/index.ts';
import type { UstEylem } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { teslimAlIstasyonu } from './teslim-yeri.ts';
import { OkutAlani } from './OkutPaneli.tsx';
import { okutulanHedef, type OkutulanHedef } from './okut-akisi.ts';
import { Qr } from './Qr.tsx';
import { MALZEME_TESLIM_AC, type MalzemeTeslimOdagi } from './disari.ts';
import { birimliMiktar, istekDurumu, miktarGirdisi, miktarMetni, TESLIM_DURUMU, zamanMetni } from './gorunum.ts';
import { hataMetni, KaliteRozeti, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import { TasimaYolu, tasimaYolu } from './TasimaYolu.tsx';
import { sutunAdi } from './yerlesim.ts';
import './stok.css';

// Malzeme · Teslim (kart #1208): her sayfanın üst çubuğunda; teslim et, teslim al, malzeme iste. 372 a: ayrı QR tuşu yok; okuyucu bu
// pencerenin üstündedir. Okuma yalnız stok.istek ister; tam stok okuması (sayfa.stok) açılmaz.
const KUTU = ['stok', 'teslim-kutusu'] as const;
const yeniKimlik = yeniIstekKimligi;

type SekmeAnahtari = 'al' | 'sepet' | 'et' | 'iste';
const SEKMELER: readonly Sekme<SekmeAnahtari>[] = [
  { anahtar: 'al', baslik: 'Teslim al', simge: 'download' },
  { anahtar: 'sepet', baslik: 'Sepet', simge: 'box' },
  { anahtar: 'et', baslik: 'Teslim et', simge: 'upload' },
  { anahtar: 'iste', baslik: 'Malzeme iste', simge: 'plus' },
];

// Seçim değeri "i:<id>" istasyon, "k:<id>" stok konumu.
const yerDegeri = (y: TeslimYeri): string => ('istasyonId' in y ? `i:${y.istasyonId}` : `k:${y.konumId}`);
function yerCoz(deger: string): TeslimYeri | null {
  const [tur, id] = deger.split(':');
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return tur === 'i' ? { istasyonId: n } : tur === 'k' ? { konumId: n } : null;
}
const yerSorgusu = (y: TeslimYeri | null): Record<string, string> =>
  (y === null ? {} : 'istasyonId' in y ? { istasyonId: String(y.istasyonId) } : { konumId: String(y.konumId) });
const ucMetni = (u: Teslim['kaynak']): string => (u.ad ? `${u.ad} (${u.kod})` : u.kod);
function yerAdi(kutu: TeslimKutusuCevabi, y: TeslimYeri): string {
  if ('istasyonId' in y) return [...kutu.istasyonlar, ...kutu.hedefIstasyonlar].find((i) => i.id === y.istasyonId)?.ad ?? `İstasyon #${y.istasyonId}`;
  const k = [...kutu.depoKonumlari, ...kutu.araAlanlar].find((x) => x.id === y.konumId);
  return k ? k.ad ?? k.kod : `Konum #${y.konumId}`;
}

function TeslimDugmesi() {
  const [acik, setAcik] = useState(false);
  const [odak, setOdak] = useState<MalzemeTeslimOdagi | null>(null);
  // Terminal başlatırken girdi eksikse panel Teslim al'da o malzemeyle açılır (kart #1289).
  useEffect(() => {
    const ac = (o: Event) => { setOdak((o as CustomEvent<MalzemeTeslimOdagi>).detail); setAcik(true); };
    window.addEventListener(MALZEME_TESLIM_AC, ac);
    return () => window.removeEventListener(MALZEME_TESLIM_AC, ac);
  }, []);
  const sayac = useQuery({
    queryKey: [...KUTU, 'sayac'],
    queryFn: () => api.get<{ gelen: number }>('/stok/teslim-kutusu/sayac'),
    refetchInterval: 60_000,
    retry: false,
  });
  const gelen = sayac.data?.gelen ?? 0;
  const etiket = gelen > 0 ? `Malzeme ve teslim, ${gelen} gelen teslim` : 'Malzeme ve teslim';
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-stok-teslim-dugme" onClick={() => setAcik(true)} aria-haspopup="dialog" aria-label={etiket} title={etiket}>
        <Simge ad="scan" />
        <span className="tc-kabuk-dugme-ad" aria-hidden="true">Malzeme</span>
        {gelen > 0 && <span className="tc-stok-teslim-sayac" aria-hidden="true">{gelen > 99 ? '99+' : gelen}</span>}
      </button>
      {acik && <TeslimPaneli odak={odak} kapat={() => { setAcik(false); setOdak(null); }} />}
    </>
  );
}

function TeslimPaneli({ odak, kapat }: { odak: MalzemeTeslimOdagi | null; kapat: () => void }) {
  const [sekme, setSekme] = useState<SekmeAnahtari>('al');
  // Okuyucuda ilk okutulan kişi kodu Teslim et'i o kişiye hedefli açar; her okutma formu yeniden kurar.
  const [kisiHedefi, setKisiHedefi] = useState<{ hedef: OkutulanHedef; sira: number } | null>(null);
  const kutu = useQuery({ queryKey: KUTU, queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu') });
  return (
    <Pencere acik kapat={kapat} baslik="Malzeme · Teslim" tur="yan">
      <div className="tc-stok-form">
        <OkutAlani teslimEteGec={(hedef) => { setSekme('et'); setKisiHedefi((k) => ({ hedef, sira: (k?.sira ?? 0) + 1 })); }}>
          <div className="tc-stok-sekmeler-sar"><Sekmeler etiket="Malzeme ve teslim" sekmeler={SEKMELER} secili={sekme} sec={(s) => { setSekme(s); setKisiHedefi(null); }} /></div>
          {kutu.isPending ? <DurumKutusu durum="yukleniyor" />
            : kutu.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(kutu.error)} yenile={() => { void kutu.refetch(); }} />
            : sekme === 'al' ? <TeslimAl kutu={kutu.data} odak={odak} />
            : sekme === 'sepet' ? <Sepet kutu={kutu.data} />
            : sekme === 'et' ? <TeslimEt key={kisiHedefi?.sira ?? 0} kutu={kutu.data} baslangic={kisiHedefi?.hedef ?? null} />
            : <MalzemeIste kutu={kutu.data} />}
        </OkutAlani>
      </div>
    </Pencere>
  );
}

function TeslimSatiri({ t, children }: { t: Teslim; children?: ReactNode }) {
  const statuAdi = useStatuAdi();
  const d = TESLIM_DURUMU[t.durum];
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{t.malzemeAd ?? `Malzeme #${t.malzemeId}`} · {miktarMetni(t.miktar)}</strong>
        <span>{ucMetni(t.kaynak)} → {ucMetni(t.hedef)} · {statuAdi(t.statuId)} <KaliteRozeti durum={t.kaliteDurumu} /></span>
        <span className="tc-stok-mono">{t.no} · {t.gonderenAd ?? '—'} · {zamanMetni(t.gonderim)}</span>
        {t.aliciAd && <span>Alıcı: {t.aliciAd}</span>}
        {t.aciklama && <span>{t.aciklama}</span>}
        {t.redNedeni && <span>Red: {t.redNedeni}</span>}
        {children}
      </div>
      <Rozet ton={d.ton}>{d.etiket}</Rozet>
    </li>
  );
}

function GelenTeslim({ t }: { t: Teslim }) {
  const [alinan, setAlinan] = useState(miktarMetni(t.miktar).replace(/\./g, ''));
  const [redAcik, setRedAcik] = useState(false);
  const [neden, setNeden] = useState('');
  const al = useStokKomutu((g: TeslimAlGovdesi) => api.post(`/stok/teslimler/${t.id}/teslim-al`, g), `${t.no} teslim alındı.`);
  const red = useStokKomutu((g: TeslimReddetGovdesi) => api.post(`/stok/teslimler/${t.id}/reddet`, g), `${t.no} reddedildi.`);
  return (
    <TeslimSatiri t={t}>
      <div className="tc-stok-dugmeler">
        <Girdi etiket="Alınan miktar" inputMode="decimal" value={alinan} onChange={(o) => setAlinan(o.target.value)} />
        <Dugme tur="birincil" simge="check" yukleniyor={al.komut.isPending} onClick={() => al.komut.mutate({ surum: t.surum, alinan: miktarGirdisi(alinan) })}>Teslim al</Dugme>
        <Dugme simge="x" onClick={() => setRedAcik((a) => !a)} aria-expanded={redAcik}>Reddet</Dugme>
      </div>
      {redAcik && (
        <div className="tc-stok-dugmeler">
          <Girdi etiket="Red nedeni" maxLength={200} value={neden} onChange={(o) => setNeden(o.target.value)} />
          <Dugme tur="tehlike" yukleniyor={red.komut.isPending} disabled={neden.trim() === ''} onClick={() => red.komut.mutate({ surum: t.surum, neden })}>Reddi gönder</Dugme>
        </div>
      )}
      {al.onayPenceresi}
    </TeslimSatiri>
  );
}

function GonderilenTeslim({ t }: { t: Teslim }) {
  const iptal = useStokKomutu((g: { surum: number }) => api.post(`/stok/teslimler/${t.id}/iptal-et`, g), `${t.no} geri çekildi.`);
  return (
    <TeslimSatiri t={t}>
      {t.durum === 'yolda' && (
        <div className="tc-stok-dugmeler">
          <Dugme simge="back" yukleniyor={iptal.komut.isPending} onClick={() => iptal.komut.mutate({ surum: t.surum })}>Geri çek</Dugme>
        </div>
      )}
    </TeslimSatiri>
  );
}

// Akış A provası D2: kişinin bulunduğu istasyon bilinmiyorsa panel ilk istasyonu değil, aynı kişinin bu sekmede son seçtiğini ya da
// gelen teslimin istasyonunu açar. Yalnız bellekte durur; sayfa yenilenince sıfırlanır.
let sonSecilen: { kisiId: number; istasyonId: number } | null = null;
function TeslimAl({ kutu, odak }: { kutu: TeslimKutusuCevabi; odak: MalzemeTeslimOdagi | null }) {
  const kisiId = useOturum().data?.id ?? null;
  const son = sonSecilen !== null && sonSecilen.kisiId === kisiId ? sonSecilen.istasyonId : null;
  const [istasyon, setIstasyon] = useState(() => String(teslimAlIstasyonu(kutu, odak?.istasyonId ?? null, son) ?? ''));
  const istasyonSec = (deger: string) => { setIstasyon(deger); sonSecilen = kisiId === null || deger === '' ? null : { kisiId, istasyonId: Number(deger) }; };
  useEffect(() => { if (odak) setIstasyon(String(odak.istasyonId)); }, [odak]);
  const istasyonId = Number(istasyon);
  return (
    <>
      <KisiKodum />
      {kutu.istasyonlar.length > 1 && (
        <Secim etiket="İstasyon" secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} value={istasyon}
          onChange={(o) => istasyonSec(o.target.value)} />
      )}
      {istasyonId > 0 && <IsMalzemeleri istasyonId={istasyonId} odak={odak?.istasyonId === istasyonId ? odak : null} />}
      <h3 className="tc-stok-teslim-baslik">Bana gelenler</h3>
      {kutu.gelenler.length === 0 ? <DurumKutusu durum="bos" mesaj="Teslim almanızı bekleyen malzeme yok" />
        : <ul className="tc-stok-isler tc-stok-teslim-liste">{kutu.gelenler.map((t) => <GelenTeslim key={t.id} t={t} />)}</ul>}
      {istasyonId > 0 && <OncekiSepetler istasyonId={istasyonId} />}
      <h3 className="tc-stok-teslim-baslik">Gönderdiklerim</h3>
      {kutu.gonderdiklerim.length === 0 ? <p className="tc-stok-not">Son gönderiminiz yok.</p>
        : <ul className="tc-stok-isler tc-stok-teslim-liste">{kutu.gonderdiklerim.map((t) => <GonderilenTeslim key={t.id} t={t} />)}</ul>}
    </>
  );
}

// Kişiye teslim (299 b): teslim edecek kişi bu kodu okutur. Kod sunucuda imzalanır ve kısa sürelidir; ekran süresi dolmadan yenisini alır.
function KisiKodum() {
  const kod = useQuery({
    queryKey: [...KUTU, 'kisi-kodu'],
    queryFn: () => api.get<KisiKoduCevabi>('/stok/teslim-kutusu/kisi-kodu'),
    refetchInterval: 30_000,
    gcTime: 0,
  });
  return (
    <div className="tc-stok-kisi-kodu">
      {kod.isPending ? <DurumKutusu durum="yukleniyor" />
        : kod.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(kod.error)} yenile={() => { void kod.refetch(); }} />
        : <Qr metin={kod.data.kod} boyut={160} />}
      <p className="tc-stok-not">Teslim edecek kişi bu kodu okutsun; teslim size yazılır. Kod kendiliğinden yenilenir.</p>
    </div>
  );
}

// İstasyondaki işlerin malzemeleri (kart #1289): bitmemiş her adımın girdisi, kalan iş için gereken, istasyondaki ve bulunduğu yer; adım
// bitene kadar durur. Terminalden gelinince eksik malzeme işaretlenir ve görünür alana kaydırılır.
function IsMalzemeleri({ istasyonId, odak }: { istasyonId: number; odak: MalzemeTeslimOdagi | null }) {
  const liste = useQuery({
    queryKey: [...KUTU, 'is-malzemeleri', istasyonId],
    queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`),
  });
  const odakSatiri = useRef<HTMLLIElement | null>(null);
  useEffect(() => { odakSatiri.current?.scrollIntoView?.({ block: 'center' }); }, [liste.data, odak]);
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">İşlerin malzemeleri</h3>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(liste.error)} yenile={() => { void liste.refetch(); }} />
        : liste.data.isler.length === 0 ? <p className="tc-stok-not">Bu istasyondaki işlerin stoklanan girdisi yok.</p>
        : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="İşlerin malzemeleri">
            {liste.data.isler.flatMap((is) => is.malzemeler.map((m) => {
              const secili = odak !== null && odak.uretimEmriId === is.uretimEmriId && odak.malzemeId === m.malzemeId;
              const yer = m.yerler.slice(0, 4).map((y) => `${y.konum} ${y.istasyonId === null ? 'depo' : 'istasyon'} · ${y.buEmrin ? 'bu emrin' : 'emirsiz'} (${miktarMetni(y.miktar)})`).join(', ');
              return (
                <li key={`${is.uretimEmriId}-${is.opNo}-${m.malzemeId}`} className="tc-stok-is tc-stok-teslim-satir" aria-current={secili ? 'true' : undefined} ref={secili ? odakSatiri : undefined}>
                  <div>
                    <strong>{m.ad ?? m.kod ?? `Malzeme #${m.malzemeId}`}</strong>
                    <span className="tc-stok-mono">{is.emirNo} · OP {is.opNo} · {is.adimAd}{is.calisiyor ? ' · çalışıyor' : ''}</span>
                    <span>Kalan {is.kalanAdet} adet için {birimliMiktar(m.gereken, m.birim)} · istasyonda {birimliMiktar(m.istasyonda, m.birim)}</span>
                    <span>{yer === '' ? 'Başka yerde yok' : `Bulunduğu yer: ${yer}`}</span>
                    {m.istek && <span>İstek {m.istek.no} · {istekDurumu(m.istek).etiket}</span>}
                    <IsMalzemesiIste istasyonId={istasyonId} is={is} m={m} />
                  </div>
                  {m.eksik ? <Rozet ton="hata">Eksik</Rozet> : <Rozet ton="tamam">İstasyonda</Rozet>}
                </li>
              );
            }))}
          </ul>
        )}
    </>
  );
}

// Eksik malzemeyi tek dokunuşla iste (kart #1418): depodaysa eksik miktarla istek açılır, emrin rotasındaki başka istasyondaysa oradan alınır.
function IsMalzemesiIste({ istasyonId, is, m }: { istasyonId: number; is: IsMalzemeleriCevabi['isler'][number]; m: IsMalzemeleriCevabi['isler'][number]['malzemeler'][number] }) {
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const iste = useStokKomutu((g: IsMalzemesiIsteGovdesi) => korumaliPost('/stok/teslim-kutusu/is-malzemeleri/iste', g), 'Malzeme istendi.', () => setKimlik(yeniKimlik()));
  if (Number(m.gereken) <= Number(m.istasyonda)) return null;
  const istekAcik = m.istek !== null && m.istek.durum !== 'teslim' && m.istek.durum !== 'iptal';
  const depo = m.yerler.find((y) => y.istasyonId === null) ?? null;
  const istasyonlar = m.yerler.filter((y) => y.istasyonId !== null).slice(0, 4);
  const gonder = (kaynakKonumId: number | null, buEmrin: boolean | null) =>
    iste.komut.mutate({ istasyonId, uretimEmriId: is.uretimEmriId, opNo: is.opNo, malzemeId: m.malzemeId, kaynakKonumId, buEmrin, kaynakKimligi: kimlik });
  return (
    <span className="tc-stok-eylem" role="group" aria-label="Malzemeyi iste">
      {!istekAcik && <Dugme tur="birincil" simge="download" yukleniyor={iste.komut.isPending} onClick={() => gonder(depo?.konumId ?? null, null)}>Depodan iste</Dugme>}
      {istasyonlar.map((y) => (
        <Dugme key={`${y.konumId}-${y.buEmrin}`} tur="ikincil" simge="download" yukleniyor={iste.komut.isPending} onClick={() => gonder(y.konumId, y.buEmrin)}>
          {y.konum} istasyonundan al · {y.buEmrin ? 'bu emrin' : 'emirsiz'}
        </Dugme>
      ))}
    </span>
  );
}

// Teslim edilmeyen parça (kart #1289): rotada sonraki adımı bu istasyon olan, önceki istasyonun sepetinde bekleyen satırlar; "Teslim al" çeker.
function OncekiSepetler({ istasyonId }: { istasyonId: number }) {
  const gelecek = useQuery({
    queryKey: [...KUTU, 'gelecek', istasyonId],
    queryFn: () => api.get<GelecekSepetCevabi>(`/stok/teslim-kutusu/sepet/gelecek?istasyonId=${istasyonId}`),
  });
  if (!gelecek.data || gelecek.data.satirlar.length === 0) return null;
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">Önceki istasyonda bekleyenler</h3>
      <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Önceki istasyonda bekleyenler">
        {gelecek.data.satirlar.map((x) => <OncekiSepetSatiri key={`${x.kaynak.id}-${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} />)}
      </ul>
    </>
  );
}

function OncekiSepetSatiri({ istasyonId, x }: { istasyonId: number; x: GelecekSepetCevabi['satirlar'][number] }) {
  const statuAdi = useStatuAdi();
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [miktar, setMiktar] = useState(() => miktarMetni(x.miktar).replace(/\./g, ''));
  const cek = useStokKomutu((g: SepettenCekGovdesi) => korumaliPost('/stok/teslim-kutusu/sepet/cek', g), 'Teslim alındı; malzeme istasyonunuza geçti.', () => setKimlik(yeniKimlik()));
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`} · {miktarMetni(x.miktar)}</strong>
        <span>{x.kaynak.ad} ({x.kaynak.kod}) · {statuAdi(x.statuId)}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span>
        {x.getiren && <span>{x.getiren}{x.gelis ? ` · ${zamanMetni(x.gelis)}` : ''}</span>}
        <div className="tc-stok-dugmeler">
          <Girdi etiket="Alınan miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} />
          <Dugme tur="birincil" simge="download" yukleniyor={cek.komut.isPending} disabled={miktar.trim() === ''} onClick={() => cek.komut.mutate({
            istasyonId, kaynakIstasyonId: x.kaynak.id, malzemeId: x.malzemeId, partiId: x.partiId, statuId: x.statuId, miktar: miktarGirdisi(miktar), kaynakKimligi: kimlik,
          })}>Teslim al</Dugme>
        </div>
      </div>
      {cek.onayPenceresi}
    </li>
  );
}

function TeslimEt({ kutu, baslangic }: { kutu: TeslimKutusuCevabi; baslangic: OkutulanHedef | null }) {
  const statuAdi = useStatuAdi();
  // Depodan gönderim depo işlemidir (stok.transfer); sunucu da denetler.
  const depocu = useIslem('stok.transfer');
  const [kaynak, setKaynak] = useState(() => { const b = kutu.buradakiIstasyonId; return b === null ? '' : yerDegeri({ istasyonId: b }); });
  const [hedef, setHedef] = useState(() => (baslangic === null ? '' : yerDegeri(baslangic.yer)));
  const [satir, setSatir] = useState('');
  const [miktar, setMiktar] = useState('');
  const [not, setNot] = useState('');
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [haritaAcik, setHaritaAcik] = useState(false);
  const [okutAcik, setOkutAcik] = useState(false);
  // Okutulan kişi kodu (299 b): hedef elle değişince düşer; gönderimde sunucu kodu yeniden doğrular.
  const [alici, setAlici] = useState<OkutulanHedef['alici']>(() => baslangic?.alici ?? null);
  const hedefSec = (deger: string) => { setHedef(deger); setAlici(null); };
  // Son gönderimin yeri ve sırası: aynı yere yeni gönderim taşıma yolunu yeniden oynatır.
  const [gonderilen, setGonderilen] = useState<{ yer: string; sira: number } | null>(null);
  const kaynakYeri = yerCoz(kaynak);
  // İstasyondan gönderimde sepet okunur: satır, emrin rotasındaki sonraki istasyonu da taşır.
  const istasyondan = kaynakYeri !== null && 'istasyonId' in kaynakYeri;
  const yerdeki = useQuery<{ satirlar: (YerdekiStokCevabi['satirlar'][number] & Partial<Pick<IstasyonSepetiSatiri, 'sonraki'>>)[] }>({
    queryKey: istasyondan ? sepetAnahtari(kaynakYeri.istasyonId) : [...KUTU, 'yerdeki', kaynak],
    queryFn: () => (istasyondan
      ? api.get<IstasyonSepetiCevabi>(`/stok/teslim-kutusu/sepet?istasyonId=${kaynakYeri.istasyonId}`)
      : api.get<YerdekiStokCevabi>(`/stok/teslim-kutusu/yerdeki-stok?${new URLSearchParams(yerSorgusu(kaynakYeri))}`)),
    enabled: kaynakYeri !== null,
  });
  const araAlanaMi = kutu.araAlanlar.some((a) => yerDegeri({ konumId: a.id }) === hedef);
  const gonder = useStokKomutu((g: TeslimGonderGovdesi) => korumaliPost('/stok/teslimler/gonder', g),
    araAlanaMi ? 'Ara alana bırakıldı; stok oraya taşındı.' : 'Teslim gönderildi; alan taraf onaylayınca stok taşınır.', () => {
    setSatir(''); setMiktar(''); setNot(''); setKimlik(yeniKimlik()); setAlici(null);
    setGonderilen((g) => ({ yer: `${kaynak}>${hedef}`, sira: (g?.sira ?? 0) + 1 }));
  });
  const satirlar = yerdeki.data?.satirlar ?? [];
  const secili = satirlar.find((s, i) => String(i) === satir);
  const depoSecenekleri: Secenek[] = kutu.depoKonumlari.map((k) => ({ deger: yerDegeri({ konumId: k.id }), baslik: `Depo · ${k.ad ? `${k.ad} (${k.kod})` : k.kod}` }));
  const araAlanSecenekleri: Secenek[] = kutu.araAlanlar.map((k) => ({ deger: yerDegeri({ konumId: k.id }), baslik: `Ara alan · ${k.ad ? `${k.ad} (${k.kod})` : k.kod}` }));
  const kaynaklar: Secenek[] = [
    ...kutu.istasyonlar.map((i) => ({ deger: yerDegeri({ istasyonId: i.id }), baslik: `İstasyon · ${i.ad} (${i.kod})` })),
    ...araAlanSecenekleri,
    ...(depocu ? depoSecenekleri : []),
  ];
  const hedefler: Secenek[] = [
    ...kutu.hedefIstasyonlar.map((i) => ({ deger: yerDegeri({ istasyonId: i.id }), baslik: `İstasyon · ${i.ad} (${i.kod})` })),
    ...araAlanSecenekleri,
    ...depoSecenekleri,
  ].filter((s) => s.deger !== kaynak);
  const hedefYeri = yerCoz(hedef);
  const yol = tasimaYolu(kutu.zemin, kaynakYeri, hedefYeri);
  const gitti = gonderilen?.yer === `${kaynak}>${hedef}`;
  // Okutulan kişinin istasyonu buradan gönderilebilecek yerlerde değilse hedef boş sayılır; gerisini sunucu yine denetler.
  const hedefGecerli = hedefler.some((h) => h.deger === hedef);
  const gonderilebilir = kaynakYeri !== null && hedefYeri !== null && hedefGecerli && secili !== undefined && miktar.trim() !== '';
  const gonderiliyor = (o: FormEvent) => {
    o.preventDefault();
    if (!gonderilebilir) return;
    gonder.komut.mutate({
      malzemeId: secili.malzemeId, miktar: miktarGirdisi(miktar), partiId: secili.partiId, statuId: secili.statuId,
      kaynak: kaynakYeri, hedef: hedefYeri, not: not.trim() === '' ? null : not, kaynakKimligi: kimlik, aliciKodu: alici?.kod ?? null,
    });
  };
  if (kaynaklar.length === 0) {
    return <DurumKutusu durum="bos" mesaj="Gönderebileceğiniz istasyon yok. Depodan malzeme için Malzeme iste sekmesini kullanın." />;
  }
  return (
    <form className="tc-stok-form" onSubmit={gonderiliyor}>
      <Secim etiket="Nereden" bosSecenek="Yer seçin" secenekler={kaynaklar} value={kaynak} onChange={(o) => { setKaynak(o.target.value); setSatir(''); }} required />
      {kaynakYeri !== null && (
        yerdeki.isPending ? <DurumKutusu durum="yukleniyor" />
          : yerdeki.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(yerdeki.error)} />
          : satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu yerde stok görünmüyor" />
          : (
            <Secim
              etiket="Malzeme"
              bosSecenek="Malzeme seçin"
              secenekler={satirlar.map((s, i) => ({
                deger: String(i),
                baslik: `${s.ad ?? s.kod ?? `#${s.malzemeId}`} · ${miktarMetni(s.miktar)} · ${statuAdi(s.statuId)}${s.partiEtiketi ? ` · ${s.partiEtiketi}` : ''}`,
              }))}
              value={satir}
              onChange={(o) => {
                setSatir(o.target.value); setMiktar('');
                // En kolay yol: rotadaki sonraki istasyon hedefe kendiliğinden yazılır; kişi isterse değiştirir.
                const s = satirlar[Number(o.target.value)]?.sonraki;
                if (s) hedefSec(yerDegeri({ istasyonId: s.istasyonId }));
              }}
              required
            />
          )
      )}
      <div className="tc-stok-iki">
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required
          ipucu={secili ? `Burada ${miktarMetni(secili.miktar)} var; statü değişmez.` : undefined} />
        <Secim etiket="Nereye" bosSecenek="Hedef seçin" secenekler={hedefler} value={hedef} onChange={(o) => hedefSec(o.target.value)} required
          ipucu={secili?.sonraki ? `Rotada sonraki: ${secili.sonraki.ad} (OP ${secili.sonraki.opNo})` : undefined} />
      </div>
      {alici && hedefGecerli && <p className="tc-stok-bilgi" role="status">Alıcı: {alici.ad ?? 'okutulan kişi'}; teslimi yalnız o alır.</p>}
      {alici && hedef !== '' && !hedefGecerli && (
        <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{alici.ad ?? 'Okutulan kişi'} buradan teslim edilebilecek bir istasyonda değil; listeden bir hedef seçin.</p>
      )}
      {yol && kaynakYeri && hedefYeri && (
        <TasimaYolu key={`${kaynak}>${hedef}>${gitti ? gonderilen?.sira : 0}`} yol={yol} kaynakAd={yerAdi(kutu, kaynakYeri)} hedefAd={yerAdi(kutu, hedefYeri)}
          etiket={!gitti ? 'taşıma yolu' : araAlanaMi ? 'bırakıldı' : 'gönderildi; teslim alınınca sepette görünür'} />
      )}
      <div className="tc-stok-eylem">
        <Dugme simge="scan" onClick={() => setOkutAcik(true)}>Nereye: QR okut</Dugme>
        {kutu.harita && <Dugme simge="grid" onClick={() => setHaritaAcik(true)}>Haritadan seç</Dugme>}
      </div>
      {okutAcik && <HedefOkutucu hedefler={hedefler} kapat={() => setOkutAcik(false)} sec={(d, a) => { setHedef(d); setAlici(a); setOkutAcik(false); }} />}
      {haritaAcik && kutu.harita && (
        <HaritaSecici kutu={kutu} haritasi={kutu.harita} kapat={() => setHaritaAcik(false)} sec={(konumId) => { hedefSec(yerDegeri({ konumId })); setHaritaAcik(false); }} />
      )}
      <Girdi etiket="Not" maxLength={200} value={not} onChange={(o) => setNot(o.target.value)} />
      <div className="tc-stok-sag">
        <Dugme tur="birincil" simge="upload" type="submit" disabled={!gonderilebilir} yukleniyor={gonder.komut.isPending}>Teslim et</Dugme>
      </div>
      {gonder.onayPenceresi}
    </form>
  );
}

const sepetAnahtari = (istasyonId: number) => [...KUTU, 'sepet', istasyonId] as const;
const SONRAKI_YOK: Record<NonNullable<IstasyonSepetiSatiri['sonrakiYok']>, string | null> = {
  'son-adim': 'Rotanın son adımı: depoya ya da sevke teslim edin.',
  fason: 'Sonraki adım fason: Teslim et ile gönderin.',
  'rota-disi': null,
};

// İstasyon sepeti (kart #1353): istasyona teslim alınan ve orada üretilen malzeme, getiren ya da üreten kişiyle. Kapsamdaki
// herkes görür ve gönderebilir; sayımla statü dönüşümü de burada görünür (stok aynı istasyon konumundadır).
function Sepet({ kutu }: { kutu: TeslimKutusuCevabi }) {
  const [istasyon, setIstasyon] = useState(() => String(kutu.buradakiIstasyonId ?? kutu.istasyonlar[0]?.id ?? ''));
  const istasyonId = Number(istasyon);
  const sepet = useQuery({
    queryKey: sepetAnahtari(istasyonId),
    queryFn: () => api.get<IstasyonSepetiCevabi>(`/stok/teslim-kutusu/sepet?istasyonId=${istasyonId}`),
    enabled: istasyonId > 0,
  });
  if (kutu.istasyonlar.length === 0) return <DurumKutusu durum="bos" mesaj="Kapsamınızda istasyon yok; sepet istasyona bağlıdır." />;
  return (
    <>
      {kutu.istasyonlar.length > 1 && (
        <Secim etiket="İstasyon" secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))} value={istasyon}
          onChange={(o) => setIstasyon(o.target.value)} />
      )}
      {sepet.isPending ? <DurumKutusu durum="yukleniyor" />
        : sepet.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(sepet.error)} yenile={() => { void sepet.refetch(); }} />
        : sepet.data.satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj={`${sepet.data.istasyon.ad} sepeti boş`} />
        : (
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label={`${sepet.data.istasyon.ad} sepeti`}>
            {sepet.data.satirlar.map((x) => <SepetSatiri key={`${x.malzemeId}-${x.partiId ?? 0}-${x.statuId ?? 0}`} istasyonId={istasyonId} x={x} emirler={sepet.data.emirler} />)}
          </ul>
        )}
    </>
  );
}

function SepetSatiri({ istasyonId, x, emirler }: { istasyonId: number; x: IstasyonSepetiSatiri; emirler: IstasyonSepetiCevabi['emirler'] }) {
  const statuAdi = useStatuAdi();
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [kullanAcik, setKullanAcik] = useState(false);
  const [emir, setEmir] = useState(() => String(emirler[0]?.id ?? ''));
  const [miktar, setMiktar] = useState(() => miktarMetni(x.miktar).replace(/\./g, ''));
  const kullan = useStokKomutu((g: SepettenKullanGovdesi) => korumaliPost('/stok/teslim-kutusu/sepet/kullan', g), 'Üretimde kullanıldı; sepetten düşüldü.', () => setKullanAcik(false));
  const gonder = useStokKomutu((g: TeslimGonderGovdesi) => korumaliPost('/stok/teslimler/gonder', g),
    x.sonraki ? `${x.sonraki.ad} istasyonuna gönderildi; alan taraf onaylayınca stok taşınır.` : 'Gönderildi.', () => setKimlik(yeniKimlik()));
  const not = x.sonrakiYok ? SONRAKI_YOK[x.sonrakiYok] : null;
  const serbestVar = Number(x.miktar) > 0;
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{x.ad ?? x.kod ?? `Malzeme #${x.malzemeId}`} · {miktarMetni(x.miktar)}</strong>
        <span>{statuAdi(x.statuId)}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span>
        {Number(x.yolda) > 0 && <span>{miktarMetni(x.yolda)} yolda; alan onaylayınca düşer</span>}
        {x.getiren && <span>{x.getiren}{x.gelis ? ` · ${zamanMetni(x.gelis)}` : ''}</span>}
        {x.sonraki && serbestVar && (
          <div className="tc-stok-dugmeler">
            <Dugme tur="birincil" simge="upload" yukleniyor={gonder.komut.isPending} onClick={() => gonder.komut.mutate({
              malzemeId: x.malzemeId, miktar: x.miktar, partiId: x.partiId, statuId: x.statuId, kaynak: { istasyonId }, hedef: { istasyonId: x.sonraki!.istasyonId },
              not: null, kaynakKimligi: kimlik,
            })}>Sonraki istasyona: {x.sonraki.ad} (OP {x.sonraki.opNo})</Dugme>
          </div>
        )}
        {not && <span className="tc-stok-not">{not}</span>}
        {emirler.length > 0 && serbestVar && (
          <div className="tc-stok-dugmeler">
            <Dugme simge="wrench" onClick={() => setKullanAcik((a) => !a)} aria-expanded={kullanAcik}>Üretimde kullan</Dugme>
          </div>
        )}
        {kullanAcik && (
          <div className="tc-stok-dugmeler">
            <Secim etiket="Emir" secenekler={emirler.map((e) => ({ deger: String(e.id), baslik: e.emirNo }))} value={emir} onChange={(o) => setEmir(o.target.value)} />
            <Girdi etiket="Kullanılan miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} />
            <Dugme tur="birincil" simge="check" yukleniyor={kullan.komut.isPending} disabled={emir === '' || miktar.trim() === ''} onClick={() => kullan.komut.mutate({
              istasyonId, malzemeId: x.malzemeId, partiId: x.partiId, statuId: x.statuId, miktar: miktarGirdisi(miktar), uretimEmriId: Number(emir),
            })}>Kullan</Dugme>
          </div>
        )}
      </div>
      {gonder.onayPenceresi}
      {kullan.onayPenceresi}
    </li>
  );
}

// Teslim et'te hedef seçimi için depo zemini dama tahtası: konum olarak açılmış kare seçilir.
// Teslim yerinin etiketi okutulur; yalnız buradan gönderilebilecek hedeflerden biri seçilir, gerisini sunucu yine denetler.
function HedefOkutucu({ hedefler, kapat, sec }: { hedefler: Secenek[]; kapat: () => void; sec: (deger: string, alici: OkutulanHedef['alici']) => void }) {
  const [ileti, setIleti] = useState<string | null>(null);
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c) => {
      const y = okutulanHedef(c);
      if (typeof y === 'string') { setIleti(y); return; }
      const deger = yerDegeri(y.yer);
      if (hedefler.some((h) => h.deger === deger)) { sec(deger, y.alici); return; }
      setIleti(`${c.tur === 'yer' ? c.yer.ad ?? c.yer.kod : c.tur === 'kisi' ? c.istasyon.ad : 'Bu yer'} buradan teslim edilebilecek yerlerde yok; listeden bir hedef seçin.`);
    },
  });
  return (
    <Pencere acik kapat={kapat} baslik="Nereye: QR okut">
      <div className="tc-stok-form">
        <KodOkuyucu okundu={(kod) => { setIleti(null); coz.mutate(kod); }} bekliyor={coz.isPending} ipucu="Teslim yerinin etiketi (istasyon, raf, alan) ya da alacak kişinin ekrandaki kodu." />
        {coz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(coz.error)}</p>}
        {ileti && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{ileti}</p>}
      </div>
    </Pencere>
  );
}

function HaritaSecici({ kutu, haritasi, kapat, sec }: { kutu: TeslimKutusuCevabi; haritasi: NonNullable<TeslimKutusuCevabi['harita']>; kapat: () => void; sec: (konumId: number) => void }) {
  const { bina, kareBoyu } = haritasi;
  const nSut = Math.ceil((bina.x1 - bina.x0) / kareBoyu - 0.01), nSat = Math.ceil((bina.z1 - bina.z0) / kareBoyu - 0.01);
  const konumlar = new Map(kutu.depoKonumlari.map((k) => [k.kod, k]));
  return (
    <Pencere acik kapat={kapat} baslik="Haritadan seç">
      <div className="tc-stok-kaydir">
        <table className="tc-stok-dama">
          <tbody>
            {Array.from({ length: nSat }, (_, jj) => nSat - 1 - jj).map((j) => (
              <tr key={j}>
                <th scope="row">{j + 1}</th>
                {Array.from({ length: nSut }, (_, i) => {
                  const kare = `${sutunAdi(i)}${j + 1}`, kn = konumlar.get(`D-${kare}`);
                  return (
                    <td key={i}>
                      <button type="button" className={`tc-stok-kare ${kn ? 'tc-stok-kare-konum' : ''}`} disabled={!kn} onClick={() => kn && sec(kn.id)}
                        aria-label={`Kare ${kare}${kn ? '' : ', konum değil'}`}>
                        <span className="tc-stok-mono">{kare}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr><th />{Array.from({ length: nSut }, (_, i) => <th key={i} scope="col">{sutunAdi(i)}</th>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="tc-stok-not">Harfler giriş kenarı boyunca, numaralar içeri. Yalnız konum olarak açılmış kare seçilir.</p>
    </Pencere>
  );
}

function MalzemeIste({ kutu }: { kutu: TeslimKutusuCevabi }) {
  const statuAdi = useStatuAdi();
  const [ara, setAra] = useState('');
  const [malzemeId, setMalzemeId] = useState<number | null>(null);
  const [miktar, setMiktar] = useState('');
  const [istasyon, setIstasyon] = useState(() => String(kutu.buradakiIstasyonId ?? ''));
  const [not, setNot] = useState('');
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const aranan = ara.trim();
  const malzemeler = useQuery({
    queryKey: [...KUTU, 'malzemeler', aranan],
    queryFn: () => api.get<IstekMalzemeleriCevabi>(`/stok/istek-malzemeleri?${new URLSearchParams({ ara: aranan })}`),
    enabled: aranan.length >= 2,
  });
  const iste = useStokKomutu((g: IstekAcGovdesi) => korumaliPost('/stok/malzeme-istekleri/ac', g), 'İstek depoya gönderildi.', () => {
    setMalzemeId(null); setMiktar(''); setNot(''); setKimlik(yeniKimlik());
  });
  const secili = malzemeler.data?.malzemeler.find((m) => m.id === malzemeId);
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (secili === undefined || miktar.trim() === '') return;
    iste.komut.mutate({
      malzemeId: secili.id, miktar: miktarGirdisi(miktar), istasyonId: istasyon === '' ? null : Number(istasyon),
      not: not.trim() === '' ? null : not, kaynakKimligi: kimlik,
    });
  };
  return (
    <>
      <form className="tc-stok-form" onSubmit={gonder}>
        <Girdi etiket="Malzeme ara" type="search" placeholder="Kod ya da ad (en az 2 harf)" value={ara} onChange={(o) => { setAra(o.target.value); setMalzemeId(null); }} />
        {aranan.length >= 2 && (
          malzemeler.isPending ? <DurumKutusu durum="yukleniyor" />
            : malzemeler.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(malzemeler.error)} />
            : malzemeler.data.malzemeler.length === 0 ? <DurumKutusu durum="bos" mesaj="Katalogda eşleşen malzeme yok" />
            : (
              <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Malzemeler">
                {/* Seçilince yalnız seçilen kalır; "Değiştir" listeyi geri açar. */}
                {malzemeler.data.malzemeler.filter((m) => malzemeId === null || m.id === malzemeId).map((m) => {
                  const yok = Number(m.kullanilabilir) <= 0;
                  return (
                    <li key={m.id}>
                      <button type="button" className="tc-stok-is tc-stok-teslim-secim" aria-pressed={m.id === malzemeId} onClick={() => setMalzemeId(m.id)}>
                        <div>
                          <strong>{m.ad ?? m.kod}</strong>
                          <span className="tc-stok-mono">{m.kod}</span>
                          {m.statuler.map((s) => <span key={s.statuId}>{statuAdi(s.statuId)}: {birimliMiktar(s.miktar, m.birim)}</span>)}
                        </div>
                        {yok ? <Rozet ton="hata">Stokta yok</Rozet> : <Rozet ton="tamam">{birimliMiktar(m.kullanilabilir, m.birim)}</Rozet>}
                      </button>
                      {m.id === malzemeId && <Dugme simge="edit" onClick={() => setMalzemeId(null)}>Değiştir</Dugme>}
                    </li>
                  );
                })}
              </ul>
            )
        )}
        {secili !== undefined && (
          <>
            {Number(secili.kullanilabilir) <= 0 && <p className="tc-stok-not">Stokta yok: istek açılır, depo ve satın alma görür.</p>}
            <div className="tc-stok-iki">
              <Girdi etiket={`Miktar${secili.birim ? ` (${secili.birim})` : ''}`} inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} required />
              <Secim
                etiket="Teslim yeri"
                bosSecenek="Bana (istasyonsuz)"
                secenekler={kutu.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.ad} (${i.kod})` }))}
                value={istasyon}
                onChange={(o) => setIstasyon(o.target.value)}
              />
            </div>
            <Girdi etiket="Not" maxLength={200} value={not} onChange={(o) => setNot(o.target.value)} />
            <div className="tc-stok-sag">
              <Dugme tur="birincil" simge="plus" type="submit" disabled={miktar.trim() === ''} yukleniyor={iste.komut.isPending}>İste</Dugme>
            </div>
          </>
        )}
      </form>
      <h3 className="tc-stok-teslim-baslik">İsteklerim</h3>
      {kutu.isteklerim.length === 0 ? <p className="tc-stok-not">Açık isteğiniz yok.</p> : (
        <ul className="tc-stok-isler tc-stok-teslim-liste tc-stok-isteklerim">
          {kutu.isteklerim.map((i) => (
            <li key={i.id} className="tc-stok-is">
              <div>
                <strong>{i.malzemeAd ?? `Malzeme #${i.malzemeId}`} · {i.durum === 'teslim' && i.karsilanan !== null ? `${miktarMetni(i.karsilanan)} / ${miktarMetni(i.miktar)} teslim` : miktarMetni(i.miktar)}</strong>
                <span>{i.istasyonAd ?? 'Bana'} · {zamanMetni(i.acilis)}</span>
                <span className="tc-stok-mono">{i.no}</span>
              </div>
              <Rozet ton={istekDurumu(i).ton}>{istekDurumu(i).etiket}</Rozet>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export const ustEylemler: readonly UstEylem[] = [
  { anahtar: 'malzeme-teslim', sira: 100, islem: 'stok.istek', dugme: TeslimDugmesi },
];
