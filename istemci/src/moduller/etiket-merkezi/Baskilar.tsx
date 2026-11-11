import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { BaskilarCevabi, SablonlarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Kart, Rozet, Sekmeler, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { olcuYazisi } from './ozel-olcu.ts';
import './etiket-merkezi.css';

type Baski = BaskilarCevabi['baskilar'][number];
type Sonuc = Baski['sonuc'];

export const SONUC_ADLARI: Record<Sonuc, string> = { gonderildi: 'Gönderildi', indirildi: 'İndirildi', yazdirildi: 'Yazdırma açıldı', hata: 'Hata' };
export const SONUC_TONLARI: Record<Sonuc, RozetTonu> = { gonderildi: 'tamam', indirildi: 'bilgi', yazdirildi: 'bilgi', hata: 'hata' };
// Defter şablonu anahtarla tutar; kullanıcı ölçüyü ve adı tanır. Kalkmış şablon anahtarıyla görünür.
export function sablonAdi(liste: SablonlarCevabi | undefined, anahtar: string): string {
  const s = liste?.sablonlar.find((x) => x.anahtar === anahtar);
  return s ? `${s.ad} · ${olcuYazisi(s)}` : anahtar;
}

// Defter yalnız eklenir; "gönderildi" yazıcının kabul ettiğini, "indirildi" dosyanın indiğini, "yazdirildi" tarayıcının yazdırma penceresinin
// açıldığını gösterir; hiçbiri etiketin çıktığını göstermez.
export function Baskilar() {
  const [adres, adresYaz] = useSearchParams();
  const yalnizHata = adres.get('sonuc') === 'hata';
  const liste = useQuery({ queryKey: anahtarlar.baskilar, queryFn: () => api.get<BaskilarCevabi>('/etiket-merkezi/baskilar') });
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  if (liste.isPending) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  const hatali = liste.data.baskilar.filter((b) => b.sonuc === 'hata');
  const satirlar = yalnizHata ? hatali : liste.data.baskilar;
  const sutunlar: readonly Sutun<Baski>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (b) => tesisSaati(new Date(b.zaman)) },
    { anahtar: 'sablon', baslik: 'Etiket', hucre: (b) => sablonAdi(sablonlar.data, b.sablonAnahtar) },
    { anahtar: 'kayit', baslik: 'Kayıt x adet', hizala: 'sag', hucre: (b) => (b.kayitSayisi === 0 ? 'Deneme' : `${String(b.kayitSayisi)} x ${String(b.adet)}`) },
    { anahtar: 'yazici', baslik: 'Yazıcı', hucre: (b) => b.yazici ?? 'Bu bilgisayar (Windows)' },
    { anahtar: 'kisi', baslik: 'Basan', hucre: (b) => b.kisi ?? '-' },
    {
      anahtar: 'sonuc', baslik: 'Sonuç', csv: (b) => SONUC_ADLARI[b.sonuc],
      hucre: (b) => <span><Rozet ton={SONUC_TONLARI[b.sonuc]}>{SONUC_ADLARI[b.sonuc]}</Rozet>{b.hata ? ` ${b.hata}` : ''}</span>,
    },
  ];
  const sec = (s: string) => { const y = new URLSearchParams(adres); if (s === 'hata') y.set('sonuc', 'hata'); else y.delete('sonuc'); adresYaz(y, { replace: true }); };
  return (
    <Kart baslik="Baskı geçmişi">
      <Sekmeler etiket="Sonuç" secili={yalnizHata ? 'hata' : 'tumu'} sec={sec}
        sekmeler={[{ anahtar: 'tumu', baslik: `Tümü (${String(liste.data.baskilar.length)})` }, { anahtar: 'hata', baslik: `Hatalı (${String(hatali.length)})` }]} />
      <p className="tc-etk-not">"Gönderildi" komutun yazıcıya ulaştığını, "İndirildi" komut dosyasının indiğini, "Yazdırma açıldı" Windows yazdırma penceresinin açıldığını gösterir; etiketin çıktığını yazıcının başında kontrol edin.</p>
      <Tablo etiket="Baskı geçmişi" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(b) => b.id} bosMesaj={yalnizHata ? 'Hatalı baskı yok.' : 'Henüz baskı yok.'} />
    </Kart>
  );
}
