import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { CikisGovdesi, GozOnerisiCevabi, HareketCevabi, KodCozCevabi, MalKabulCevabi, SepetCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Sekmeler, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKamera } from '../../ortak/veri/kamera.ts';
import { BelirsizMiktarHatasi, belirsizMiktarVar, KONUM_ETIKETI, MALZEME_TURU, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { HizliMalKabul, kabulGovdesi, kopyaSayisi, type BekleyenGiris } from './HizliMalKabul.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem, useStokKomutu } from './ortak.tsx';
import { LotEtiketPenceresi } from './LotEtiketi.tsx';
import { SepeteEklePenceresi } from './SepeteEkle.tsx';
import './stok.css';

type Mod = 'sorgula' | 'kabul' | 'sevkiyat' | 'sepet';
const MODLAR = [{ anahtar: 'sorgula', baslik: 'Sorgula' }, { anahtar: 'kabul', baslik: 'Mal kabul' }, { anahtar: 'sevkiyat', baslik: 'Sevk çıkışı' }, { anahtar: 'sepet', baslik: 'Sepet' }] as const;
const IPUCU: Record<Mod, string> = {
  sorgula: 'Malzeme, lot ya da konum okut; stok ve yer bilgisi açılır.',
  kabul: 'Önce koyacağın konumu, sonra malzemeyi okut; miktarı girip teslim al. Konum okutmazsan mal kabul alanına girer.',
  sevkiyat: 'Malzemeyi okut; en eski girişli gözden stoktan düşülür. Lot etiketi okutursan o lottan, konum okuttuysan o gözden düşülür.',
  sepet: 'Okuttuğun her malzeme ya da lot için miktar sorulur ve sepete eklenir.',
};
interface Okutma { kod: string; zaman: string; sonuc: KodCozCevabi }

function SevkiyatFormu({ s, konumId, bitti }: { s: Extract<KodCozCevabi, { tur: 'malzeme' | 'lot' }>; konumId: number | null; bitti: (hareketId: number, miktar: string) => void }) {
  const [miktar, setMiktar] = useState('1');
  // Gözde birden çok lot olabilir: en eski girişli lot düşülür, etiketi gösterilir.
  const satir = [...s.bakiyeler].filter((b) => b.statuId === null && !b.miktar.startsWith('-') && (konumId === null || b.konumId === konumId)).sort((a, b) => Date.parse(a.ilkGiris) - Date.parse(b.ilkGiris))[0];
  const kaynak = konumId ?? satir?.konumId ?? null;
  const { komut, onayPenceresi } = useStokKomutu((g: CikisGovdesi) => korumaliPost<HareketCevabi>('/stok/cikis', g).then((c) => { if (c.hareketIdler[0]) bitti(c.hareketIdler[0], g.miktar); return c; }), `Stoktan düşüldü: ${s.ozet.ad ?? s.ozet.kod}`);
  if (kaynak === null) return <p className="tc-stok-not">Veri yetersiz: bu {s.tur === 'lot' ? 'lotun' : 'malzemenin'} kullanılabilir bakiyesi yok.</p>;
  // Okutulan lot en eski lot kuralını geçer: lot aktif gözde yoksa başka lottan düşülmez.
  if (s.tur === 'lot' && !satir) return <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Bu lot aktif konumda yok; konumu bırakıp yeniden dene.</p>;
  return (
    <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); komut.mutate({ malzemeId: s.ozet.id, konumId: kaynak, ...(satir ? { partiId: satir.partiId } : {}), miktar: miktarGirdisi(miktar), cikisNedeni: 'sevk' }); }}>
      <p className="tc-stok-not">Kaynak: <strong className="tc-stok-mono">{satir?.konumKod ?? '—'}</strong> {satir ? `· ${miktarMetni(satir.miktar)}${satir.partiEtiketi ? ` · ${satir.partiEtiketi}` : ''}` : ''}</p>
      <div className="tc-stok-iki"><Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required autoFocus /></div>
      <div className="tc-stok-eylem"><Dugme tur="birincil" type="submit" yukleniyor={komut.isPending}>Stoktan düş</Dugme></div>
      {onayPenceresi}
    </form>
  );
}

export function Okut() {
  const [adres] = useSearchParams();
  const [mod, setMod] = useState<Mod>((MODLAR.find((m) => m.anahtar === adres.get('mod'))?.anahtar ?? 'sorgula') as Mod);
  const [elle, setElle] = useState('');
  const [gecmis, setGecmis] = useState<Okutma[]>([]);
  const [aktifKonum, setAktifKonum] = useState<{ id: number; kod: string } | null>(null);
  const [sepetPenceresi, setSepetPenceresi] = useState(false);
  const [bekleyen, setBekleyen] = useState<BekleyenGiris | null>(null);
  const [etiketBelge, setEtiketBelge] = useState<{ id: number; kopya: number } | null>(null);
  type SonIslem = { tur: 'kabul'; belgeId: number; kopya: number; metin: string } | { tur: 'cikis'; hareketId: number; metin: string } | { tur: 'sepet'; satirId: number; onceki: string | null; metin: string };
  const [sonIslem, setSonIslem] = useState<SonIslem | null>(null);
  const geriAlYetkisi = useIslem('stok.geri-al');
  const bekleyenYaz = useMutation({
    mutationFn: ({ b, konumId }: { b: BekleyenGiris; konumId: number }) => {
      const govde = kabulGovdesi(b, konumId);
      return belirsizMiktarVar(govde) ? Promise.reject(new BelirsizMiktarHatasi()) : korumaliPost<MalKabulCevabi>('/stok/mal-kabul', govde);
    },
    onSuccess: (c, { b }) => { setBekleyen(null); setSonIslem({ tur: 'kabul', belgeId: c.belge.id, kopya: kopyaSayisi(b.ambalajSayisi), metin: `${b.ad} × ${b.miktar} rafa girdi (${c.belge.no})` }); void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
  });
  const oneri = useQuery({ queryKey: [...anahtarlar.hepsi, 'goz-onerisi', bekleyen?.malzemeId ?? 0], queryFn: () => api.get<GozOnerisiCevabi>(`/stok/malzemeler/${bekleyen!.malzemeId}/goz-onerisi`), enabled: bekleyen !== null });
  const geriAl = useStokKomutu(async (x: SonIslem) => {
    if (x.tur === 'sepet') return x.onceki === null ? api.post<SepetCevabi>(`/stok/sepet/satirlar/${x.satirId}/sil`, {}) : api.post<SepetCevabi>(`/stok/sepet/satirlar/${x.satirId}/degistir`, { miktar: x.onceki });
    if (x.tur === 'cikis') return api.post<HareketCevabi>(`/stok/hareketler/${x.hareketId}/geri-al`, {});
    return null;
  }, 'Son işlem geri alındı.', () => setSonIslem(null));
  const istemci = useQueryClient();
  const sepetYetkisi = useIslem('stok.transfer'), girisYetkisi = useIslem('stok.giris'), cikisYetkisi = useIslem('stok.cikis');
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (sonuc, kod) => {
      setGecmis((g) => [{ kod, zaman: new Date().toISOString(), sonuc }, ...g].slice(0, 20));
      if (sonuc.tur === 'konum' && bekleyen) { bekleyenYaz.mutate({ b: bekleyen, konumId: sonuc.konum.id }); return; }
      if (sonuc.tur === 'konum') setAktifKonum({ id: sonuc.konum.id, kod: sonuc.konum.kod });
      if ((sonuc.tur === 'malzeme' || sonuc.tur === 'lot') && mod === 'sepet') setSepetPenceresi(true);
    },
  });
  const okundu = useCallback((kod: string) => { coz.mutate(kod.trim()); }, [coz]);
  const kamera = useKamera(okundu);
  const dosya = useRef<HTMLInputElement | null>(null);
  const sonuc = gecmis[0]?.sonuc;
  const yenile = () => { void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); if (gecmis[0]) coz.mutate(gecmis[0].kod); };
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Okut" alt="Ürün ya da raf kodunu okut. Kamera, fotoğraf ya da el okuyucu (klavye gibi yazar) kullanılabilir." />
      <div className="tc-stok-okut">
        <div className="tc-stok-okut-sol">
          <Sekmeler etiket="Okutma modu" sekmeler={MODLAR} secili={mod} sec={(m) => setMod(m)} />
          <p className="tc-stok-not">{IPUCU[mod]}</p>
          {bekleyen && (
            <p className="tc-stok-bilgi tc-stok-bilgi-uyari"><span><strong>{bekleyen.ad}</strong> × {bekleyen.miktar} için rafı okut</span>
              {oneri.data?.oneri && <Dugme tur="ikincil" yukleniyor={bekleyenYaz.isPending} onClick={() => bekleyenYaz.mutate({ b: bekleyen, konumId: oneri.data!.oneri!.konumId })}>Önerilen: {oneri.data.oneri.kod}</Dugme>}
              <Dugme tur="ikincil" onClick={() => setBekleyen(null)}>Vazgeç</Dugme></p>
          )}
          {bekleyenYaz.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">{hataMetni(bekleyenYaz.error)}</p>}
          {sonIslem && (
            <p className="tc-stok-bilgi"><span>Son işlem: {sonIslem.metin}</span>
              {sonIslem.tur === 'sepet' && <Dugme tur="ikincil" yukleniyor={geriAl.komut.isPending} onClick={() => geriAl.komut.mutate(sonIslem)}>Geri al</Dugme>}
              {sonIslem.tur === 'cikis' && (geriAlYetkisi ? <Dugme tur="ikincil" yukleniyor={geriAl.komut.isPending} onClick={() => geriAl.komut.mutate(sonIslem)}>Geri al</Dugme> : <span className="tc-stok-not">Geri almak için müdüre haber ver.</span>)}
              {sonIslem.tur === 'kabul' && <Dugme tur="ikincil" simge="tag" onClick={() => setEtiketBelge({ id: sonIslem.belgeId, kopya: sonIslem.kopya })}>Etiket bas</Dugme>}
              {sonIslem.tur === 'kabul' && (geriAlYetkisi ? <Link to={`/stok/mal-kabul/${sonIslem.belgeId}`}><Dugme tur="ikincil">Belgeyi düzelt</Dugme></Link> : <span className="tc-stok-not">Yanlışsa belge müdür tarafından düzeltilir.</span>)}
            </p>
          )}
          {aktifKonum && <p className="tc-stok-bilgi">Aktif konum: <strong className="tc-stok-mono">{aktifKonum.kod}</strong> <Dugme tur="ikincil" onClick={() => setAktifKonum(null)}>Bırak</Dugme></p>}
          <div className={`tc-stok-kamera ${kamera.acik ? 'tc-stok-kamera-acik' : ''}`}>
            <video ref={kamera.video} muted playsInline aria-label="Kamera görüntüsü" />
            <canvas ref={kamera.tuval} hidden />
            {!kamera.acik && <Dugme tur="birincil" simge="scan" onClick={() => void kamera.ac()}>Kamerayı aç</Dugme>}
            {kamera.acik && <Dugme onClick={kamera.kapat}>Kamerayı kapat</Dugme>}
            <span className="tc-stok-kamera-cerceve" aria-hidden="true" />
          </div>
          {kamera.hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">{kamera.hata}</p>}
          <div className="tc-stok-eylem">
            <Dugme simge="upload" onClick={() => dosya.current?.click()}>Fotoğraftan oku</Dugme>
            <input ref={dosya} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void kamera.fotograftan(f); e.target.value = ''; }} />
          </div>
          <form className="tc-stok-elle" onSubmit={(e) => { e.preventDefault(); if (elle.trim()) { okundu(elle); setElle(''); } }}>
            <Girdi etiket="Kod" placeholder="Ürün ya da raf kodu yaz, el okuyucuyla okut" value={elle} onChange={(e) => setElle(e.target.value)} autoFocus />
            <Dugme tur="birincil" type="submit" yukleniyor={coz.isPending}>Bul</Dugme>
          </form>
        </div>
        <div className="tc-stok-okut-sag">
          <Kart baslik="Okutma sonucu">
            {coz.isError && <DurumKutusu durum="hata" mesaj={hataMetni(coz.error)} />}
            {!sonuc && !coz.isError && <p className="tc-stok-not">Bir ürün okutursan stoğu ve hangi gözlerde olduğu, bir konum okutursan içindekiler burada açılır.</p>}
            {sonuc?.tur === 'bilinmiyor' && <DurumKutusu durum="bos" mesaj={`"${sonuc.kod}" tanınmadı: konum kodu, kart numarası ya da kayıtlı lot no değil.`} />}
            {sonuc?.tur === 'konum' && (
              <div className="tc-stok-form">
                <div><Rozet ton="bilgi">Konum</Rozet> <strong className="tc-stok-buyuk-miktar tc-stok-mono">{sonuc.konum.kod}</strong> <span className="tc-stok-not">{KONUM_ETIKETI[sonuc.konum.tur]}{sonuc.konum.ad ? ` · ${sonuc.konum.ad}` : ''}</span></div>
                <Tablo etiket="Konumdaki stok" satirlar={sonuc.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Bu konum boş."
                  sutunlar={[
                    { anahtar: 'm', baslik: 'Malzeme', hucre: (b) => <Link to={`/stok/malzemeler/${b.malzemeId}`}>Kart {b.malzemeId}</Link> },
                    { anahtar: 'p', baslik: 'Parti', hucre: (b) => b.partiEtiketi ?? '—' },
                    { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (b) => <strong>{miktarMetni(b.miktar)}</strong> },
                  ]} />
                <div className="tc-stok-eylem"><Link to={`/stok/konumlar/${sonuc.konum.id}`}><Dugme>Konumu aç ve say</Dugme></Link></div>
              </div>
            )}
            {sonuc?.tur === 'lot' && (
              <div className="tc-stok-form">
                <div><Rozet ton="tamam">Lot</Rozet> <strong className="tc-stok-buyuk-miktar tc-stok-mono">{sonuc.parti.lotNo}</strong>
                  <p className="tc-stok-not">{sonuc.ozet.ad ?? sonuc.ozet.kod} · <span className="tc-stok-mono">{sonuc.ozet.kod}</span> · {sonuc.parti.etiket} · lotta <strong>{miktarMetni(sonuc.toplam)}</strong></p></div>
                <Tablo etiket="Lotun gözleri" satirlar={sonuc.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Bu lot stokta yok."
                  sutunlar={[
                    { anahtar: 'k', baslik: 'Konum', mono: true, hucre: (b) => b.konumKod },
                    { anahtar: 'g', baslik: 'Giriş', hucre: (b) => zamanMetni(b.ilkGiris) },
                    { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (b) => <strong className={b.miktar.startsWith('-') ? 'tc-stok-eksi' : ''}>{miktarMetni(b.miktar)}</strong> },
                  ]} />
                {mod === 'sevkiyat' && cikisYetkisi && <SevkiyatFormu key={sonuc.parti.id} s={sonuc} konumId={aktifKonum?.id ?? null} bitti={(hareketId, m) => { setSonIslem({ tur: 'cikis', hareketId, metin: `${sonuc.parti.lotNo} × ${miktarMetni(m)} stoktan düşüldü` }); yenile(); }} />}
                <div className="tc-stok-eylem">
                  {sepetYetkisi && <Dugme tur={mod === 'sepet' ? 'birincil' : 'ikincil'} onClick={() => setSepetPenceresi(true)}>Sepete ekle</Dugme>}
                  <Link to={`/stok/hareketler?partiId=${sonuc.parti.id}`}><Dugme>Lot hareketleri</Dugme></Link>
                  <Link to={`/stok/malzemeler/${sonuc.ozet.id}`}><Dugme>Malzemeyi aç</Dugme></Link>
                </div>
                {sepetPenceresi && <SepeteEklePenceresi malzemeId={sonuc.ozet.id} ad={`${sonuc.ozet.ad ?? sonuc.ozet.kod} · ${sonuc.parti.lotNo}`} bakiyeler={sonuc.bakiyeler} otomatikYok
                  eklendi={(c, g) => { const st = c.satirlar.find((x) => x.malzemeId === g.malzemeId && x.kaynakKonumId === (g.kaynakKonumId ?? null) && x.partiId === (g.partiId ?? null)); if (st) { const onceki = Number(st.miktar) - Number(g.miktar); setSonIslem({ tur: 'sepet', satirId: st.id, onceki: onceki > 0 ? String(Math.round(onceki * 1000) / 1000) : null, metin: `${sonuc.parti.lotNo} × ${miktarMetni(g.miktar)} sepete eklendi` }); } }}
                  {...(aktifKonum ? { kaynakKonumId: aktifKonum.id } : {})} kapat={() => setSepetPenceresi(false)} />}
              </div>
            )}
            {sonuc?.tur === 'malzeme' && (
              <div className="tc-stok-form">
                <div><Rozet ton="tamam">Malzeme</Rozet> <strong className="tc-stok-buyuk-miktar">{sonuc.ozet.ad ?? sonuc.ozet.kod}</strong>
                  <p className="tc-stok-not"><span className="tc-stok-mono">{sonuc.ozet.kod}</span> · {MALZEME_TURU[sonuc.ozet.tur]} · depoda <strong>{miktarMetni(sonuc.toplam)}</strong>{sonuc.ozet.kullanilabilir ? '' : ' · kart kullanılabilir değil'}</p></div>
                <Tablo etiket="Malzemenin gözleri" satirlar={sonuc.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Stokta yok."
                  sutunlar={[
                    { anahtar: 'k', baslik: 'Konum', mono: true, hucre: (b) => b.konumKod },
                    { anahtar: 'p', baslik: 'Parti', hucre: (b) => b.partiEtiketi ?? '—' },
                    { anahtar: 'g', baslik: 'Giriş', hucre: (b) => zamanMetni(b.ilkGiris) },
                    { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (b) => <strong className={b.miktar.startsWith('-') ? 'tc-stok-eksi' : ''}>{miktarMetni(b.miktar)}</strong> },
                  ]} />
                {mod === 'kabul' && girisYetkisi && <HizliMalKabul key={sonuc.ozet.id} malzeme={sonuc.ozet} konumId={aktifKonum?.id ?? null} bekleyenAc={setBekleyen} bitti={(belgeId, kopya) => { setSonIslem({ tur: 'kabul', belgeId, kopya, metin: `${sonuc.ozet.ad ?? sonuc.ozet.kod} teslim alındı` }); yenile(); }} />}
                {mod === 'sevkiyat' && cikisYetkisi && <SevkiyatFormu s={sonuc} konumId={aktifKonum?.id ?? null} bitti={(hareketId, m) => { setSonIslem({ tur: 'cikis', hareketId, metin: `${sonuc.ozet.ad ?? sonuc.ozet.kod} × ${miktarMetni(m)} stoktan düşüldü` }); yenile(); }} />}
                <div className="tc-stok-eylem">
                  {sepetYetkisi && <Dugme tur={mod === 'sepet' ? 'birincil' : 'ikincil'} onClick={() => setSepetPenceresi(true)}>Sepete ekle</Dugme>}
                  <Link to={`/stok/malzemeler/${sonuc.ozet.id}`}><Dugme>Malzemeyi aç</Dugme></Link>
                </div>
                {sepetPenceresi && <SepeteEklePenceresi malzemeId={sonuc.ozet.id} ad={sonuc.ozet.ad ?? sonuc.ozet.kod} bakiyeler={sonuc.bakiyeler}
                  eklendi={(c, g) => { const st = c.satirlar.find((x) => x.malzemeId === g.malzemeId && x.kaynakKonumId === (g.kaynakKonumId ?? null)); if (st) { const onceki = Number(st.miktar) - Number(g.miktar); setSonIslem({ tur: 'sepet', satirId: st.id, onceki: onceki > 0 ? String(Math.round(onceki * 1000) / 1000) : null, metin: `${sonuc.ozet.ad ?? sonuc.ozet.kod} × ${miktarMetni(g.miktar)} sepete eklendi` }); } }}
                  {...(aktifKonum ? { kaynakKonumId: aktifKonum.id } : {})} kapat={() => setSepetPenceresi(false)} />}
              </div>
            )}
          </Kart>
          {gecmis.length > 0 && (
            <Kart baslik="Bu oturumda okutulanlar" sag={<Link to="/stok/sepet">Sepete git</Link>}>
              <ul className="tc-stok-satirlar">
                {gecmis.map((g) => (
                  <li key={`${g.zaman}-${g.kod}`}><span className="tc-stok-mono">{g.kod}</span>
                    <span className="tc-stok-not">{g.sonuc.tur === 'konum' ? `Konum · ${g.sonuc.konum.kod}` : g.sonuc.tur === 'malzeme' ? `${g.sonuc.ozet.ad ?? g.sonuc.ozet.kod} · ${miktarMetni(g.sonuc.toplam)}` : g.sonuc.tur === 'lot' ? `Lot · ${g.sonuc.ozet.ad ?? g.sonuc.ozet.kod} · ${miktarMetni(g.sonuc.toplam)}` : 'Tanınmadı'}</span></li>
                ))}
              </ul>
            </Kart>
          )}
        </div>
      </div>
      {etiketBelge && <LotEtiketPenceresi baslik="Lot etiketi" yol={`/stok/mal-kabuller/${etiketBelge.id}/lot-etiketleri`} kopyalar={{ 1: etiketBelge.kopya }} kapat={() => setEtiketBelge(null)} />}
    </section>
  );
}
