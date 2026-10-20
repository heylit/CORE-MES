import { useQuery } from '@tanstack/react-query';
import type { BaskilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './etiket-merkezi.css';

type Baski = BaskilarCevabi['baskilar'][number];

const SUTUNLAR: readonly Sutun<Baski>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (b) => tesisSaati(new Date(b.zaman)) },
  { anahtar: 'yazici', baslik: 'Yazıcı', hucre: (b) => b.yazici },
  { anahtar: 'sablon', baslik: 'Şablon', mono: true, hucre: (b) => b.sablonAnahtar },
  { anahtar: 'kayit', baslik: 'Kayıt', hizala: 'sag', hucre: (b) => (b.kayitSayisi === 0 ? 'Deneme' : b.kayitSayisi) },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (b) => b.adet },
  { anahtar: 'kisi', baslik: 'Basan', hucre: (b) => b.kisi ?? '-' },
  {
    anahtar: 'sonuc', baslik: 'Sonuç',
    hucre: (b) => (b.sonuc === 'gonderildi' ? <Rozet ton="tamam">Gönderildi</Rozet>
      : b.sonuc === 'indirildi' ? <Rozet ton="bilgi">İndirildi</Rozet>
        : <span><Rozet ton="hata">Hata</Rozet> {b.hata}</span>),
  },
];

// Defter yalnız eklenir; "gönderildi" yazıcının kabul ettiğini, "indirildi" dosyanın indiğini gösterir, etiketin çıktığını göstermez.
export function Baskilar() {
  const liste = useQuery({ queryKey: anahtarlar.baskilar, queryFn: () => api.get<BaskilarCevabi>('/etiket-merkezi/baskilar') });
  if (liste.isPending) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  return (
    <Kart baslik="Baskı geçmişi">
      <p className="tc-etk-not">Son baskılar. "Gönderildi" komutun yazıcıya ulaştığını, "İndirildi" dosya yazıcısı için komut dosyasının indiğini gösterir; etiketin çıktığını yazıcının başında kontrol edin.</p>
      <Tablo etiket="Baskı geçmişi" sutunlar={SUTUNLAR} satirlar={liste.data.baskilar} satirAnahtari={(b) => b.id} bosMesaj="Henüz baskı yok." />
    </Kart>
  );
}
