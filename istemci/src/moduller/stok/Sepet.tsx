import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { CikisNedeni, FisCevabi, FislerCevabi, MalzemeAyrintiCevabi, SepetCevabi, SepetSatiri, SepetTeslimCevabi, StoktanDusGovdesi, TeslimGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { belirsizMiktarVar, CIKIS_NEDENI, CIKIS_NEDENLERI, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { EmirSecici } from './EmirSecici.tsx';
import { KonumSecici, type KonumSecimi } from './KonumSecici.tsx';
import { MalzemeSecici } from './MalzemeSecici.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import { SepeteEklePenceresi } from './SepeteEkle.tsx';
import './stok.css';
import { paneliAc } from './panel-olayi.ts';

function MiktarHucresi({ s }: { s: SepetSatiri }) {
  const [deger, setDeger] = useState(miktarMetni(s.miktar).replace(/\./g, ''));
  const { komut } = useStokKomutu((g: { miktar: string }) => api.post<SepetCevabi>(`/stok/sepet/satirlar/${s.id}/degistir`, g), 'Miktar güncellendi.');
  const kaydet = () => { const m = miktarGirdisi(deger); if (m !== s.miktar && (Number(m) > 0 || belirsizMiktarVar(m))) komut.mutate({ miktar: m }); };
  return <Girdi etiket={`Miktar ${s.malzemeAd ?? s.malzemeId}`} inputMode="decimal" value={deger} onChange={(e) => setDeger(e.target.value)} onBlur={kaydet} onKeyDown={(e) => { if (e.key === 'Enter') kaydet(); }} />;
}

// Okutmadan ekleme: kart katalogdan aranır, kaynak göz ve miktar sepete ekle penceresinde seçilir.
function MalzemeEkle() {
  const [kart, setKart] = useState('');
  const [acik, setAcik] = useState(false);
  const id = /^\d{1,9}$/.test(kart) ? Number(kart) : null;
  const a = useQuery({ queryKey: anahtarlar.ayrinti('malzeme', id ?? 0), queryFn: () => api.get<MalzemeAyrintiCevabi>(`/stok/malzemeler/${id}`), enabled: acik && id !== null });
  return (
    <div className="tc-stok-iki">
      <MalzemeSecici etiket="Malzeme ekle" deger={kart} degistir={setKart} />
      <div className="tc-stok-eylem"><Dugme tur="ikincil" simge="plus" disabled={id === null} yukleniyor={acik && a.isPending} onClick={() => setAcik(true)}>Ekle</Dugme></div>
      {acik && a.isError && <DurumKutusu durum="hata" mesaj={hataMetni(a.error)} />}
      {/* Statülü stok taşımaya kapalıdır (STK-S3). */}
      {acik && a.data && <SepeteEklePenceresi malzemeId={a.data.satir.malzemeId} ad={a.data.satir.ad ?? `Kart ${a.data.satir.malzemeId}`} bakiyeler={a.data.bakiyeler.filter((b) => b.statuId === null)}
        kapat={() => setAcik(false)} eklendi={() => setKart('')} />}
    </div>
  );
}

function StoktanDusPenceresi({ kapat }: { kapat: () => void }) {
  const yonlendir = useNavigate();
  const [neden, setNeden] = useState<CikisNedeni>('uretime_sarf');
  const [emir, setEmir] = useState('');
  const [aciklama, setAciklama] = useState('');
  const cikis = useStokKomutu((g: StoktanDusGovdesi) => korumaliPost<FisCevabi>('/stok/sepet/stoktan-dus', g).then((c) => { kapat(); void yonlendir(`/stok/fisler/${c.fis.id}`); return c; }), 'Stoktan düşüldü; fiş yazıldı.');
  return (
    <Pencere acik kapat={kapat} baslik="Stoktan düş" tur="yan"
      alt={<Dugme tur="birincil" yukleniyor={cikis.komut.isPending} disabled={neden === 'uretime_sarf' && !emir}
        onClick={() => cikis.komut.mutate({ cikisNedeni: neden, ...(emir ? { uretimEmriId: Number(emir) } : {}), aciklama })}>Stoktan düş</Dugme>}>
      <div className="tc-stok-form">
        <Secim etiket="Çıkış nedeni" value={neden} onChange={(e) => setNeden(e.target.value as CikisNedeni)} secenekler={CIKIS_NEDENLERI.map((n) => ({ deger: n, baslik: CIKIS_NEDENI[n] }))} />
        {neden === 'uretime_sarf' && <EmirSecici deger={emir} degistir={setEmir} zorunlu />}
        <Girdi etiket="Not" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        <p className="tc-stok-not">Bütün satırlar tek işlemde düşülür; biri karşılanamazsa hiçbiri yazılmaz.</p>
      </div>
      {cikis.onayPenceresi}
    </Pencere>
  );
}

// Depo sepeti (soru 95 a): Malzeme · Teslim panelinde Sepet altında, yalnız stok.transfer olana. Satırlar kaldırılır, hepsi tek yere
// taşınır; satır başına yer ve stoktan düşme Taşı ekranındadır.
export function DepoSepeti() {
  const [hepsi, setHepsi] = useState<KonumSecimi | null>(null);
  const s = useQuery({ queryKey: [...anahtarlar.hepsi, 'sepet'], queryFn: () => api.get<SepetCevabi>('/stok/sepet') });
  const sil = useStokKomutu((g: { id: number }) => api.post<SepetCevabi>(`/stok/sepet/satirlar/${g.id}/sil`, {}), 'Satır kaldırıldı.');
  const tasi = useStokKomutu((g: TeslimGovdesi) => korumaliPost<SepetTeslimCevabi>('/stok/sepet/teslim-et', g), 'Taşındı; fiş yazıldı.', () => setHepsi(null));
  const satirlar = s.data?.satirlar ?? [];
  if (s.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(s.error)} yenile={() => void s.refetch()} />;
  return (
    <div className="tc-stok-form">
      {satirlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Depo sepeti boş. Okutulan malzemeyi sonuçtan sepete ekleyin." /> : (
        <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Depo sepeti">
          {satirlar.map((x) => (
            <li key={x.id} className="tc-stok-is tc-stok-teslim-satir">
              <div>
                <strong>{x.malzemeAd ?? `Kart ${x.malzemeId}`} · {miktarMetni(x.miktar)}</strong>
                <span className="tc-stok-mono">{x.kaynakKonumKod ?? 'En eski giriş'}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span>
                {Number(x.miktar) > Number(x.mevcut) && <Rozet ton="hata">Yetersiz stok</Rozet>}
              </div>
              <Dugme tur="ikincil" simge="trash" onClick={() => sil.komut.mutate({ id: x.id })}>Kaldır</Dugme>
            </li>
          ))}
        </ul>
      )}
      {satirlar.length > 0 && (
        <>
          <KonumSecici etiket="Hepsi nereye" deger={hepsi} degistir={setHepsi} />
          <div className="tc-stok-eylem">
            <Dugme tur="birincil" simge="truck" disabled={hepsi === null} yukleniyor={tasi.komut.isPending}
              onClick={() => hepsi && tasi.komut.mutate({ hedefKonumId: hepsi.id, satirHedefleri: [], aciklama: '' })}>Hepsini taşı</Dugme>
          </div>
        </>
      )}
      {sil.onayPenceresi}{tasi.onayPenceresi}
    </div>
  );
}

// Taşı: malzemeyi okut ya da ara, her satıra nereye gideceğini seç (ya da hepsine tek yer), tek dokunuşla taşı.
// Satır hedefi sunucuya teslimde gider; her hedef için ayrı fiş yazılır.
export function Sepet() {
  const yonlendir = useNavigate();
  const cikabilir = useIslem('stok.cikis');
  const [dus, setDus] = useState(false);
  const [hepsi, setHepsi] = useState<KonumSecimi | null>(null);
  const [hedefler, setHedefler] = useState<Record<number, KonumSecimi>>({});
  const [aciklama, setAciklama] = useState('');
  const s = useQuery({ queryKey: [...anahtarlar.hepsi, 'sepet'], queryFn: () => api.get<SepetCevabi>('/stok/sepet') });
  const f = useQuery({ queryKey: anahtarlar.liste('fisler', {}), queryFn: () => api.get<FislerCevabi>('/stok/fisler?sayfaBoyu=8') });
  const sil = useStokKomutu((g: { id: number }) => api.post<SepetCevabi>(`/stok/sepet/satirlar/${g.id}/sil`, {}), 'Satır kaldırıldı.');
  const tasi = useStokKomutu((g: TeslimGovdesi) => korumaliPost<SepetTeslimCevabi>('/stok/sepet/teslim-et', g).then((c) => {
    setHedefler({}); setAciklama('');
    if (c.fisler.length === 1) void yonlendir(`/stok/fisler/${c.fis.id}`);
    return c;
  }), 'Taşındı; fiş yazıldı.');
  const satirlar = s.data?.satirlar ?? [];
  // Önizlemedeki "Son teslim yerleri": son fişlerin tekil hedef konumları, tek dokunuşla "Hepsi nereye" olur.
  const sonYerler: KonumSecimi[] = [];
  for (const x of f.data?.satirlar ?? []) if (x.hedefKonumId !== null && x.hedefKonumKod && !sonYerler.some((y) => y.id === x.hedefKonumId) && sonYerler.length < 5) sonYerler.push({ id: x.hedefKonumId, etiket: x.hedefKonumKod });
  const hedefsiz = satirlar.filter((x) => !hedefler[x.id]).length;
  const hazir = satirlar.length > 0 && (hepsi !== null || hedefsiz === 0);
  const satirHedefi = (id: number, k: KonumSecimi | null) => setHedefler((h) => { const y = { ...h }; if (k) y[id] = k; else delete y[id]; return y; });
  const gonder = () => tasi.komut.mutate({
    ...(hepsi ? { hedefKonumId: hepsi.id } : {}),
    satirHedefleri: satirlar.flatMap((x) => (hedefler[x.id] ? [{ satirId: x.id, hedefKonumId: hedefler[x.id]!.id }] : [])),
    aciklama,
  });
  const sutunlar: Sutun<SepetSatiri>[] = [
    { anahtar: 'm', baslik: 'Malzeme', hucre: (x) => <span className="tc-stok-ad"><strong>{x.malzemeAd ?? `Kart ${x.malzemeId}`}</strong><span className="tc-stok-mono">{x.malzemeKod ?? ''}</span></span> },
    { anahtar: 'k', baslik: 'Nereden', hucre: (x) => (x.kaynakKonumKod ? <span className="tc-stok-mono">{x.kaynakKonumKod}{x.partiEtiketi ? ` · ${x.partiEtiketi}` : ''}</span> : 'En eski giriş') },
    { anahtar: 'q', baslik: 'Miktar', hucre: (x) => <><MiktarHucresi s={x} />{Number(x.miktar) > Number(x.mevcut) && <Rozet ton="hata">Yetersiz stok</Rozet>}</> },
    { anahtar: 'h', baslik: 'Nereye', hucre: (x) => <KonumSecici etiket={`Nereye ${x.malzemeAd ?? x.malzemeId}`} deger={hedefler[x.id] ?? null} degistir={(k) => satirHedefi(x.id, k)}
      ipucu={hedefler[x.id] ? undefined : hepsi ? `Boş kalırsa ${hepsi.etiket}` : undefined} /> },
    { anahtar: 'e', baslik: '', hucre: (x) => <Dugme tur="ikincil" simge="trash" onClick={() => sil.komut.mutate({ id: x.id })}>Kaldır</Dugme> },
  ];
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Taşı" alt="Malzemeyi okut ya da ara, her satıra nereye gideceğini seç, tek dokunuşla taşı. Bir istasyonun ya da siparişin malzemesini toplu hazırlamak için Hazırlık."
        sag={<Dugme tur="birincil" simge="scan" onClick={() => paneliAc({ sekme: 'sepet', depoSepeti: true })}>Okutarak ekle</Dugme>} />
      {s.isError && <DurumKutusu durum="hata" mesaj={hataMetni(s.error)} yenile={() => void s.refetch()} />}
      <Kart baslik={`Taşınacaklar${satirlar.length ? ` (${satirlar.length})` : ''}`}>
        <div className="tc-stok-form">
          <MalzemeEkle />
          {s.isPending ? <DurumKutusu durum="yukleniyor" /> : satirlar.length === 0
            ? <DurumKutusu durum="bos" mesaj="Liste boş. Okut ya da yukarıdan malzeme ekle." />
            : <Tablo etiket="Taşınacaklar" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.id} />}
        </div>
      </Kart>
      {satirlar.length > 0 && (
        <Kart baslik="Nereye">
          <div className="tc-stok-form">
            <KonumSecici etiket="Hepsi nereye" deger={hepsi} degistir={setHepsi} ipucu="Satırda yer seçilmediyse buraya taşınır." />
            {sonYerler.length > 0 && <div className="tc-stok-eylem" role="group" aria-label="Son teslim yerleri">
              <span className="tc-stok-not">Son yerler</span>{sonYerler.map((y) => <Dugme key={y.id} tur="ikincil" onClick={() => setHepsi(y)}>{y.etiket}</Dugme>)}
            </div>}
            <Girdi etiket="Not" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
            <div className="tc-stok-eylem">
              <Dugme tur="birincil" simge="truck" disabled={!hazir} yukleniyor={tasi.komut.isPending} onClick={gonder}>Hepsini taşı</Dugme>
              {cikabilir && <Dugme tur="ikincil" onClick={() => setDus(true)}>Stoktan düş</Dugme>}
            </div>
            {!hazir && <p className="tc-stok-not">{hedefsiz} satırın yeri seçilmedi; satırda ya da "Hepsi nereye" alanında seçin.</p>}
            <p className="tc-stok-not">Bütün satırlar tek işlemde yazılır; biri karşılanamazsa hiçbiri yazılmaz. Her teslim yeri için ayrı fiş çıkar.</p>
          </div>
        </Kart>
      )}
      <Kart baslik="Son fişler">
        {f.data && f.data.satirlar.length === 0 && <p className="tc-stok-not">Henüz fiş yok.</p>}
        <ul className="tc-stok-satirlar">
          {f.data?.satirlar.map((x) => (
            <li key={x.id}><Link to={`/stok/fisler/${x.id}`}><strong className="tc-stok-mono">{x.no}</strong></Link>
              <span className="tc-stok-not">{zamanMetni(x.zaman)} · {x.satirSayisi} hareket · {x.hedefKonumKod ?? (x.cikisNedeni ? CIKIS_NEDENI[x.cikisNedeni] : '')}</span></li>
          ))}
        </ul>
      </Kart>
      {dus && <StoktanDusPenceresi kapat={() => setDus(false)} />}
      {sil.onayPenceresi}{tasi.onayPenceresi}
    </section>
  );
}
