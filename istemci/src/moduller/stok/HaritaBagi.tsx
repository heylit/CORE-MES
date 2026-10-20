import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { BolumDeposuGovdesi, HaritaEslemeCevabi, HaritaOzetiCevabi, KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Tablo, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONUM_ETIKETI } from './gorunum.ts';
import { hataMetni, useIslem, useStokKomutu } from './ortak.tsx';
import { KodDegisimPenceresi } from './Etiketler.tsx';

// Raf, göz ve zemin alanı Fabrika Haritası'nda tanımlanır (kart #686); stok ekranları oraya gönderir.
export function HaritaLinki({ metin = "Fabrika Haritası'nda düzenle" }: { metin?: string }) {
  return <Link to="/atolye"><Dugme tur="birincil" simge="layers">{metin}</Dugme></Link>;
}

// Haritada açılan göz ve stok alanını stok konumu yapar; atlanan adresler bildirimde sayılır.
export function HaritaEsleDugmesi() {
  const tanimlar = useIslem('stok.tanim');
  const { bildir } = useBildirim();
  const [degisenler, setDegisenler] = useState<KoduDegisenKonum[]>([]);
  const { komut } = useStokKomutu(async () => {
    const c = await api.post<HaritaEslemeCevabi>('/stok/konumlar/haritadan-esle', {});
    if (c.atlanan.length > 0) bildir('bilgi', `Eşlenemeyen yer: ${c.atlanan.slice(0, 5).join(', ')}${c.atlanan.length > 5 ? ` ve ${c.atlanan.length - 5} tane daha` : ''}.`);
    setDegisenler(c.koduDegisenler);
    return c;
  }, 'Konumlar Fabrika Haritası ile eşlendi.');
  if (!tanimlar) return null;
  return (
    <>
      <Dugme simge="rotate" yukleniyor={komut.isPending} onClick={() => komut.mutate({})}>Haritadan eşle</Dugme>
      {degisenler.length > 0 && <KodDegisimPenceresi degisenler={degisenler} kapat={() => setDegisenler([])} />}
    </>
  );
}

// Ayarlar'da eşleme özeti: hangi bölüm stok deposu (yalnız onun gözleri konum olur), bağlı göz ve alan sayısı, eşlenmemiş harita
// yeri, haritada karşılığı olmayan açık konumlar.
export function HaritaOzeti() {
  const tanimlar = useIslem('stok.tanim');
  const o = useQuery({ queryKey: [...anahtarlar.hepsi, 'harita-ozeti'], queryFn: () => api.get<HaritaOzetiCevabi>('/stok/harita-ozeti') });
  const [secili, setSecili] = useState<number | null>(null);
  const { komut } = useStokKomutu(({ salonId, ...g }: BolumDeposuGovdesi & { salonId: number }) => api.post<HaritaOzetiCevabi>(`/stok/harita-bolumleri/${salonId}/depo`, g), 'Bölüm güncellendi.', () => setSecili(null));
  return (
    <Kart baslik="Fabrika Haritası eşlemesi" sag={<HaritaEsleDugmesi />}>
      {o.isError && <DurumKutusu durum="hata" mesaj={hataMetni(o.error)} yenile={() => void o.refetch()} />}
      {o.isPending && <DurumKutusu durum="yukleniyor" />}
      {o.data && (
        <>
          <Tablo etiket="Harita bölümleri" satirlar={o.data.bolumler} satirAnahtari={(b) => b.salonId}
            sutunlar={[
              { anahtar: 'kod', baslik: 'Bölüm', mono: true, hucre: (b) => b.kod },
              { anahtar: 'goz', baslik: 'Raf gözü', hizala: 'sag', hucre: (b) => b.gozSayisi },
              { anahtar: 'depo', baslik: 'Stok deposu', hucre: (b) => b.depoKod ?? 'Değil' },
              ...(tanimlar ? [{ anahtar: 'eylem', baslik: '', hucre: (b: HaritaOzetiCevabi['bolumler'][number]) => (
                <Dugme simge={b.depoKod ? 'minus' : 'plus'} yukleniyor={komut.isPending && secili === b.salonId} aria-label={`${b.depoKod ? 'Depodan çıkar' : 'Depo yap'}: ${b.kod}`}
                  onClick={() => { setSecili(b.salonId); komut.mutate({ salonId: b.salonId, depo: b.depoKod === null }); }}>{b.depoKod ? 'Depodan çıkar' : 'Depo yap'}</Dugme>
              ) }] : []),
            ]} />
          <p className="tc-stok-not">Yalnız stok deposu olan bölümün raf gözleri ve kabul, üretim çıkışı, depo zemini, fason alanları stok konumu olur. {o.data.bolum} bölüm, {o.data.goz} raf gözü ve {o.data.alan} alan bağlı.{o.data.eslenmemis > 0 ? ` Haritada stok konumu olmayan ${o.data.eslenmemis} yer var; "Haritadan eşle" ile eklenir.` : ''}</p>
          {o.data.bagsizKonumlar.length > 0 && (
            <>
              <p className="tc-stok-not">Haritada karşılığı olmayan açık konumlar ({o.data.bagsizKonumlar.length}): bunları haritada çizin ya da stoğu taşıyıp kapatın.</p>
              <ul className="tc-stok-liste" aria-label="Haritada olmayan konumlar">
                {o.data.bagsizKonumlar.map((k) => <li key={k.id}><Link to={`/stok/konumlar/${k.id}`}>{k.kod}</Link> · {KONUM_ETIKETI[k.tur]}{k.satirSayisi ? ` · ${k.satirSayisi} kalem` : ''}</li>)}
              </ul>
            </>
          )}
        </>
      )}
    </Kart>
  );
}
