import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BaskilarCevabi, SablonlarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { Simge } from '../../ortak/arayuz/Simge.tsx';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useCikmadi } from './cikmadi.tsx';
import { BAS_ISLEMI } from './HizliBas.tsx';
import { basAdresi } from './EtiketMerkezi.tsx';
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

// 3598: "Çıkmadı" işaretli baskı basılmış sayılmaz ve kayıt Basılacaklar'a döner; satırda sonuç yerine bu görünür.
export const dusumAdi = (b: Baski): string | null => (b.dusum === 'usb-hatasi' ? 'Çıkmadı (USB hatası)' : b.dusum === 'cikmadi' ? 'Çıkmadı' : null);
// Yeniden basma yalnız kaydı olan satırda anlamlıdır; nedeni satırda yazar (fare üstü, dokunma ve ekran okuyucu için görünür).
export function yenidenBasmaNedeni(b: Baski): string | null {
  if (b.kayitTuru !== null && b.kayitIdler.length > 0) return null;
  return b.kayitSayisi === 0 ? 'Deneme etiketi: yeniden basılamaz' : 'Eski kayıt (emir düzeyi): yeniden basılamaz';
}

// Defter yalnız eklenir; "gönderildi" yazıcının kabul ettiğini, "indirildi" dosyanın indiğini, "yazdirildi" tarayıcının yazdırma penceresinin
// açıldığını gösterir; hiçbiri etiketin çıktığını göstermez.
export function Baskilar() {
  const [adres, adresYaz] = useSearchParams();
  const basabilir = (useOturum().data?.islemler ?? []).includes(BAS_ISLEMI);
  const { isaretle } = useCikmadi();
  const [bekleyen, setBekleyen] = useState<number | null>(null);
  const [hata, setHata] = useState<{ id: number; metin: string } | null>(null);
  const kap = useRef<HTMLDivElement>(null);
  const yalnizHata = adres.get('sonuc') === 'hata';
  const liste = useQuery({ queryKey: anahtarlar.baskilar, queryFn: () => api.get<BaskilarCevabi>('/etiket-merkezi/baskilar') });
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  if (liste.isPending) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) return <Kart baslik="Baskı geçmişi"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} /></Kart>;
  const hatali = liste.data.baskilar.filter((b) => b.sonuc === 'hata' || b.dusum !== null);
  const satirlar = yalnizHata ? hatali : liste.data.baskilar;
  const sutunlar: readonly Sutun<Baski>[] = [
    { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, hucre: (b) => tesisSaati(new Date(b.zaman)) },
    { anahtar: 'sablon', baslik: 'Etiket', hucre: (b) => sablonAdi(sablonlar.data, b.sablonAnahtar) },
    { anahtar: 'kayit', baslik: 'Kayıt x adet', hizala: 'sag', hucre: (b) => (b.kayitSayisi === 0 ? 'Deneme' : `${String(b.kayitSayisi)} x ${String(b.adet)}`) },
    { anahtar: 'yazici', baslik: 'Yazıcı', hucre: (b) => b.yazici ?? 'Bu bilgisayar (Windows)' },
    { anahtar: 'kisi', baslik: 'Basan', hucre: (b) => b.kisi ?? '-' },
    {
      anahtar: 'sonuc', baslik: 'Sonuç', csv: (b) => SONUC_ADLARI[b.sonuc],
      hucre: (b) => {
        const d = dusumAdi(b);
        return d !== null
          ? <span><Rozet ton="hata">{d}</Rozet> <span className="tc-etk-not">{b.dusum === 'usb-hatasi' ? 'USB yazıcıya gidemedi; ' : 'Siz işaretlediniz; '}Basılacaklar'a döndü.</span></span>
          : <span><Rozet ton={SONUC_TONLARI[b.sonuc]}>{SONUC_ADLARI[b.sonuc]}</Rozet>{b.hata ? ` ${b.hata}` : ''}</span>;
      },
    },
    ...(basabilir ? [{
      anahtar: 'islem', baslik: 'İşlem', csv: false as const, kartTamSatir: true, hizala: 'sag' as const,
      hucre: (b: Baski) => {
        const ad = `${sablonAdi(sablonlar.data, b.sablonAnahtar)} ${tesisSaati(new Date(b.zaman))}`;
        const neden = yenidenBasmaNedeni(b);
        return (
          <div className="tc-etk-satir-islem">
            <div className="tc-etk-dugmeler">
              {neden === null
                ? <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" data-baski-yb={b.id} aria-label={`${ad} Yeniden bas`} to={yenidenBasAdresi(b)}><Simge ad="rotate" />Yeniden bas</Link>
                : <Dugme simge="rotate" aria-disabled="true" aria-describedby={`yb-neden-${String(b.id)}`} onClick={(e) => { e.preventDefault(); }}>Yeniden bas</Dugme>}
              {b.isaretlenebilir && (
                <Dugme simge="x" yukleniyor={bekleyen === b.id} aria-label={`${ad} Çıkmadı: ${String(b.kayitSayisi)} kayıt Basılacaklar'a döner`} onClick={() => cikmadiYap(b)}>
                  Çıkmadı ({String(b.kayitSayisi)})
                </Dugme>
              )}
            </div>
            {neden !== null && <span id={`yb-neden-${String(b.id)}`} className="tc-etk-not">{neden}</span>}
            {neden === null && b.dusum === null && !b.isaretlenebilir && b.kayitSayisi > 0 && (b.sonuc !== 'hata') && (
              <span className="tc-etk-not">Basılacaklar penceresinden eski: "Çıkmadı" işaretlenemez.</span>
            )}
            {hata?.id === b.id && <span className="tc-etk-hata" role="alert">{hata.metin}</span>}
          </div>
        );
      },
    }] : []),
  ];
  const cikmadiYap = (b: Baski) => {
    setBekleyen(b.id);
    setHata(null);
    isaretle(b.id, 'cikmadi').then(() => {
      setBekleyen(null);
      // Satır listede kalır; odak aynı satırın "Yeniden bas"ına gelir (çıkmadı diyen kişi çoğu kez hemen yeniden basar).
      setTimeout(() => { kap.current?.querySelector<HTMLElement>(`[data-baski-yb="${String(b.id)}"]`)?.focus(); }, 0);
    }, (h: unknown) => { setBekleyen(null); setHata({ id: b.id, metin: hataIletisi(h, 'İşaretlenemedi; yeniden deneyin.') }); });
  };
  const sec = (s: string) => { const y = new URLSearchParams(adres); if (s === 'hata') y.set('sonuc', 'hata'); else y.delete('sonuc'); adresYaz(y, { replace: true }); };
  return (
    <Kart baslik="Baskı geçmişi">
      <div ref={kap} className="tc-etk-gonder">
      <Sekmeler etiket="Sonuç" secili={yalnizHata ? 'hata' : 'tumu'} sec={sec}
        sekmeler={[{ anahtar: 'tumu', baslik: `Tümü (${String(liste.data.baskilar.length)})` }, { anahtar: 'hata', baslik: `Hatalı (${String(hatali.length)})` }]} />
      <p className="tc-etk-not">"Gönderildi" komutun yazıcıya ulaştığını, "İndirildi" komut dosyasının indiğini, "Yazdırma açıldı" Windows yazdırma penceresinin açıldığını gösterir; etiketin çıktığını yazıcının başında kontrol edin. {basabilir ? 'Çıkmadıysa "Çıkmadı" ile işaretleyin; kayıt Basılacaklar\'a döner. "Hata" yazıcıya ulaşılamadığını, "Çıkmadı" sizin işaretinizi gösterir.' : 'İşaretlemek ve yeniden basmak için basma yetkisi gerekir.'}</p>
      <Tablo etiket="Baskı geçmişi" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(b) => b.id} bosMesaj={yalnizHata ? 'Hatalı baskı yok.' : 'Henüz baskı yok.'} />
      </div>
    </Kart>
  );
}

// Etiket bas ekranı aynı kayıtlarla ve önceki adetle açılır (kayıt seçimi orada daraltılır, yazıcıyı kişi seçer); yeni defter satırı yazılır.
export const yenidenBasAdresi = (b: Baski): string => {
  const a = basAdresi(b.kayitTuru ?? 'lot', b.kayitIdler);
  return b.kayitTuru === 'refakat-partisi' ? a : `${a}&adet=${String(b.adet)}`;
};
