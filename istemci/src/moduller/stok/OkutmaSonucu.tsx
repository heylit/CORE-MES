import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { KodCozCevabi, OkutCozCevabi, SepetCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Rozet, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONUM_ETIKETI, MALZEME_TURU, miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, useIslem, useStokOkur } from './ortak.tsx';
import { SepeteEklePenceresi } from './SepeteEkle.tsx';

// Panelde okutulan kod (soru 89): sonuç okuyucunun altında durur, iş buradan seçilir. Gözler, lotlar ve toplam yalnız stok okuması
// olana (soru 93 a); herkes alabileceği yerdeki serbest miktarı ve kapsamı dışındaki istasyonları görür.
export interface Okunan { kod: string; cevap: OkutCozCevabi }
export type SonucEylemi = 'kabul' | 'sevk' | 'okutarak-al';

// Tam stok çözümü (eski Okut sayfasının sorgusu); Mal kabul ve Sevk bölümleri aynı önbelleği okur.
export function useStokKodCoz(kod: string | null) {
  const okur = useStokOkur();
  return useQuery({
    queryKey: [...anahtarlar.hepsi, 'kod-coz', kod ?? ''],
    queryFn: () => api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod ?? '')}`),
    enabled: okur && kod !== null,
  });
}

const bakiyeMiktari = (m: string) => <strong className={m.startsWith('-') ? 'tc-stok-eksi' : ''}>{miktarMetni(m)}</strong>;

function StokAyrintisi({ c }: { c: KodCozCevabi }) {
  if (c.tur === 'bilinmiyor') return null;
  if (c.tur === 'konum') {
    return (
      <Tablo etiket="Konumdaki stok" satirlar={c.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Bu konum boş."
        sutunlar={[
          { anahtar: 'm', baslik: 'Malzeme', hucre: (b) => `Kart ${b.malzemeId}` },
          { anahtar: 'p', baslik: 'Parti', hucre: (b) => b.partiEtiketi ?? '—' },
          { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (b) => bakiyeMiktari(b.miktar) },
        ]} />
    );
  }
  return (
    <>
      <p className="tc-stok-not">
        <span className="tc-stok-mono">{c.ozet.kod}</span> · {MALZEME_TURU[c.ozet.tur]} · {c.tur === 'lot' ? 'lotta' : 'depoda'} <strong>{miktarMetni(c.toplam)}</strong>
        {c.ozet.kullanilabilir ? '' : ' · kart kullanılabilir değil'}
      </p>
      <Tablo etiket={c.tur === 'lot' ? 'Lotun gözleri' : 'Malzemenin gözleri'} satirlar={c.bakiyeler} satirAnahtari={(b) => b.id} bosMesaj="Stokta yok."
        sutunlar={[
          { anahtar: 'k', baslik: 'Konum', mono: true, hucre: (b) => b.konumKod },
          ...(c.tur === 'lot' ? [] : [{ anahtar: 'p', baslik: 'Parti', hucre: (b: (typeof c.bakiyeler)[number]) => b.partiEtiketi ?? '—' }]),
          { anahtar: 'g', baslik: 'Giriş', hucre: (b) => zamanMetni(b.ilkGiris) },
          { anahtar: 'q', baslik: 'Miktar', hizala: 'sag', hucre: (b) => bakiyeMiktari(b.miktar) },
        ]} />
    </>
  );
}

// Depo sepetine ekleme (soru 95 a, stok.transfer); son ekleme geri alınabilir: satır eski miktarına döner ya da silinir.
function DepoSepetineEkle({ c }: { c: Extract<KodCozCevabi, { tur: 'malzeme' | 'lot' }> }) {
  const [acik, setAcik] = useState(false);
  const [son, setSon] = useState<{ satirId: number; onceki: string | null; metin: string } | null>(null);
  const geriAl = useMutation({
    mutationFn: (x: NonNullable<typeof son>) => (x.onceki === null
      ? api.post<SepetCevabi>(`/stok/sepet/satirlar/${x.satirId}/sil`, {})
      : api.post<SepetCevabi>(`/stok/sepet/satirlar/${x.satirId}/degistir`, { miktar: x.onceki })),
    onSuccess: () => setSon(null),
  });
  const ad = c.tur === 'lot' ? `${c.ozet.ad ?? c.ozet.kod} · ${c.parti.lotNo}` : c.ozet.ad ?? c.ozet.kod;
  return (
    <>
      <Dugme simge="box" onClick={() => setAcik(true)}>Depo sepetine ekle</Dugme>
      {son && (
        <p className="tc-stok-bilgi" role="status"><span>Son işlem: {son.metin}</span>
          <Dugme tur="ikincil" yukleniyor={geriAl.isPending} onClick={() => geriAl.mutate(son)}>Geri al</Dugme>
        </p>
      )}
      {acik && (
        <SepeteEklePenceresi malzemeId={c.ozet.id} ad={ad} bakiyeler={c.bakiyeler} otomatikYok={c.tur === 'lot'} kapat={() => setAcik(false)}
          eklendi={(s, g) => {
            const st = s.satirlar.find((x) => x.malzemeId === g.malzemeId && x.kaynakKonumId === (g.kaynakKonumId ?? null) && (c.tur !== 'lot' || x.partiId === (g.partiId ?? null)));
            if (!st) return;
            const onceki = Number(st.miktar) - Number(g.miktar);
            setSon({ satirId: st.id, onceki: onceki > 0 ? String(Math.round(onceki * 1000) / 1000) : null, metin: `${ad} × ${miktarMetni(g.miktar)} sepete eklendi` });
          }} />
      )}
    </>
  );
}

export function OkutmaSonucu({ okunan, sec, kapat }: { okunan: Okunan; sec: (e: SonucEylemi) => void; kapat: () => void }) {
  const c = okunan.cevap;
  const stok = useStokKodCoz(okunan.kod);
  const giris = useIslem('stok.giris'), depocu = useIslem('stok.transfer');
  const cikis = useIslem('stok.cikis'), sevkOkur = useIslem('sevkiyat.oku'), fasoncu = useIslem('uretim-emirleri.fason');
  const sevkeder = cikis || sevkOkur || fasoncu;
  if (c.tur !== 'malzeme' && c.tur !== 'yer') return null;
  const malzeme = c.tur === 'malzeme' ? c : null;
  const digerleri = malzeme?.digerIstasyonlar ?? [];
  // Kapsam dışı istasyonun etiketi: oradan okutarak alınır (soru 96 b).
  const uzakIstasyon = c.tur === 'yer' && c.yer.tur === 'istasyon' && c.satirlar === null;
  const baslik = malzeme ? malzeme.malzeme.ad ?? malzeme.malzeme.kod ?? `Malzeme #${malzeme.malzeme.id}` : c.tur === 'yer' ? c.yer.ad ?? c.yer.kod : '';
  const stokCevabi = stok.data;
  return (
    <section className="tc-stok-is tc-stok-okut-sonuc" aria-label="Okutma sonucu">
      <div className="tc-stok-form">
        <div className="tc-stok-okut-sonuc-bas">
          <Rozet ton={malzeme ? 'tamam' : 'bilgi'}>{malzeme ? (malzeme.parti ? 'Lot' : 'Malzeme') : KONUM_ETIKETI[c.tur === 'yer' ? c.yer.tur : 'raf_gozu']}</Rozet>
          <strong>{baslik}</strong>
          {malzeme?.parti && <span className="tc-stok-mono">{malzeme.parti.etiket}</span>}
          <Dugme simge="x" aria-label="Okutma sonucunu kapat" onClick={kapat} />
        </div>
        {stok.isError && <DurumKutusu durum="hata" mesaj={hataMetni(stok.error)} />}
        {stokCevabi ? <StokAyrintisi c={stokCevabi} /> : malzeme && malzeme.yerler.length > 0 && (
          <ul className="tc-stok-satirlar" aria-label="Alabileceğin yerler">
            {malzeme.yerler.map((y) => <li key={`${y.konumId}-${y.partiId ?? 0}-${y.statuId ?? 0}`}><span>{y.ad ?? y.kod}</span><strong>{miktarMetni(y.miktar)}</strong></li>)}
          </ul>
        )}
        {digerleri.length > 0 && (
          <ul className="tc-stok-satirlar" aria-label="Başka istasyonlarda">
            {digerleri.map((d) => <li key={d.istasyonId}><span>{d.ad} ({d.kod})</span><strong>{miktarMetni(d.miktar)}</strong></li>)}
          </ul>
        )}
        <div className="tc-stok-eylem">
          {malzeme && giris && <Dugme tur="birincil" simge="download" onClick={() => sec('kabul')}>Mal kabul</Dugme>}
          {malzeme && sevkeder && <Dugme simge="truck" onClick={() => sec('sevk')}>Sevk</Dugme>}
          {(digerleri.length > 0 || uzakIstasyon) && <Dugme simge="scan" onClick={() => sec('okutarak-al')}>Okutarak al</Dugme>}
          {depocu && stokCevabi && (stokCevabi.tur === 'malzeme' || stokCevabi.tur === 'lot') && <DepoSepetineEkle key={okunan.kod} c={stokCevabi} />}
        </div>
      </div>
    </section>
  );
}
