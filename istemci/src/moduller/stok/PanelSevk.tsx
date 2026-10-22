import { useState } from 'react';
import type { CikisGovdesi, HareketCevabi, KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { FasonaGonder } from '../uretim-emirleri/disari.ts';
import { UrunSevkleri } from '../sevkiyat/disari.ts';
import { miktarGirdisi, miktarMetni } from './gorunum.ts';
import { useStokKodCoz, type Okunan } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';

// Teslim et altındaki Sevk (soru 89, 92 b, 97 a, 98 a). Mamul ve yarı mamulde sevk, sevkiyat işini ilerletir (bölüm sevkiyat modülünün)
// ve emrin sıradaki fason adımına gönderilir (bölüm üretim emirlerinin); stok yalnız ev sahibidir. Siparişsiz malzeme elle sevk
// çıkışıyla düşer (stok.cikis); sunucu mamulü ve yarı mamulü bu yoldan reddeder.
export function PanelSevk({ okunan }: { okunan: Okunan }) {
  const c = okunan.cevap;
  const stok = useStokKodCoz(c.tur === 'malzeme' ? okunan.kod : null);
  const cikis = useIslem('stok.cikis');
  if (c.tur !== 'malzeme') return null;
  const s = stok.data?.tur === 'malzeme' || stok.data?.tur === 'lot' ? stok.data : null;
  const tur = c.malzeme.tur ?? s?.ozet.tur;
  const emir = c.parti?.uretimEmriId ?? null;
  const urun = tur === 'mamul' || tur === 'yarimamul';
  return (
    <>
      <h3 className="tc-stok-teslim-baslik">Sevk · {c.malzeme.ad ?? c.malzeme.kod ?? `Malzeme #${c.malzeme.id}`}</h3>
      {urun ? (
        <>
          {emir !== null ? <UrunSevkleri uretimEmriId={emir} /> : <UrunSevkleri malzemeId={c.malzeme.id} />}
          {emir !== null && <FasonaGonder uretimEmriId={emir} />}
          <p className="tc-stok-not">Mamul ve yarı mamul stoktan elle sevk edilmez; sevkiyat işi teslim edilince düşer.</p>
        </>
      ) : !cikis ? <p className="tc-stok-not">Sevk çıkışı için stok çıkış yetkisi gerekir.</p>
        : stok.isPending ? <DurumKutusu durum="yukleniyor" />
        : stok.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(stok.error)} />
        : s && <SevkCikisi key={okunan.kod} s={s} />}
    </>
  );
}

function SevkCikisi({ s }: { s: Extract<KodCozCevabi, { tur: 'malzeme' | 'lot' }> }) {
  const geriAlYetkisi = useIslem('stok.geri-al');
  const [son, setSon] = useState<{ hareketId: number; metin: string } | null>(null);
  const geriAl = useStokKomutu((x: { hareketId: number }) => api.post<HareketCevabi>(`/stok/hareketler/${x.hareketId}/geri-al`, {}), 'Son işlem geri alındı.', () => setSon(null));
  const ad = s.tur === 'lot' ? s.parti.lotNo : s.ozet.ad ?? s.ozet.kod;
  return (
    <>
      {son && (
        <p className="tc-stok-bilgi" role="status"><span>Son işlem: {son.metin}</span>
          {geriAlYetkisi ? <Dugme tur="ikincil" yukleniyor={geriAl.komut.isPending} onClick={() => geriAl.komut.mutate(son)}>Geri al</Dugme>
            : <span className="tc-stok-not">Geri almak için müdüre haber ver.</span>}
        </p>
      )}
      <SevkiyatFormu s={s} bitti={(hareketId, m) => setSon({ hareketId, metin: `${ad} × ${miktarMetni(m)} stoktan düşüldü` })} />
      {geriAl.onayPenceresi}
    </>
  );
}

function SevkiyatFormu({ s, bitti }: { s: Extract<KodCozCevabi, { tur: 'malzeme' | 'lot' }>; bitti: (hareketId: number, miktar: string) => void }) {
  const [miktar, setMiktar] = useState('1');
  // Gözde birden çok lot olabilir: en eski girişli lot düşülür, etiketi gösterilir.
  const satir = [...s.bakiyeler].filter((b) => b.statuId === null && !b.miktar.startsWith('-')).sort((a, b) => Date.parse(a.ilkGiris) - Date.parse(b.ilkGiris))[0];
  const { komut, onayPenceresi } = useStokKomutu((g: CikisGovdesi) => korumaliPost<HareketCevabi>('/stok/cikis', g).then((c) => { if (c.hareketIdler[0]) bitti(c.hareketIdler[0], g.miktar); return c; }), `Stoktan düşüldü: ${s.ozet.ad ?? s.ozet.kod}`);
  if (!satir) return <p className="tc-stok-not">Veri yetersiz: bu {s.tur === 'lot' ? 'lotun' : 'malzemenin'} kullanılabilir bakiyesi yok.</p>;
  return (
    <form className="tc-stok-form" onSubmit={(e) => { e.preventDefault(); komut.mutate({ malzemeId: s.ozet.id, konumId: satir.konumId, partiId: satir.partiId, miktar: miktarGirdisi(miktar), cikisNedeni: 'sevk' }); }}>
      <p className="tc-stok-not">Kaynak: <strong className="tc-stok-mono">{satir.konumKod}</strong> · {miktarMetni(satir.miktar)}{satir.partiEtiketi ? ` · ${satir.partiEtiketi}` : ''}</p>
      <div className="tc-stok-iki"><Girdi etiket="Sevk miktarı" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} required /></div>
      <div className="tc-stok-eylem"><Dugme tur="birincil" simge="truck" type="submit" yukleniyor={komut.isPending}>Stoktan düş</Dugme></div>
      {onayPenceresi}
    </form>
  );
}
