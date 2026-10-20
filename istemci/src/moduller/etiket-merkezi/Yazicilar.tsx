import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BaglantiTuru, SablonlarCevabi, Yazici, YaziciDili, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { hataIletisi, api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './etiket-merkezi.css';

const BAGLANTI_ADLARI: Record<BaglantiTuru, string> = { ag: 'Ağ (sunucu doğrudan gönderir)', dosya: 'Dosya (USB ya da Windows yazıcısı)' };

interface Taslak { ad: string; dil: YaziciDili; dpi: string; baglanti: BaglantiTuru; adres: string; sade: boolean; aktif: boolean }
const BOS: Taslak = { ad: '', dil: 'zpl', dpi: '203', baglanti: 'ag', adres: '', sade: false, aktif: true };
const taslagaCevir = (y: Yazici): Taslak => ({ ad: y.ad, dil: y.dil, dpi: String(y.dpi), baglanti: y.baglanti, adres: y.adres ?? '', sade: y.sade, aktif: y.aktif });

function YaziciFormu({ yazici, secenekler, kapat }: { yazici: Yazici | null; secenekler: SablonlarCevabi['secenekler']; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [t, setT] = useState<Taslak>(yazici ? taslagaCevir(yazici) : BOS);
  const [hata, setHata] = useState<string | null>(null);
  const degistir = (d: Partial<Taslak>) => setT((o) => ({ ...o, ...d }));
  const kaydet = useMutation({
    mutationFn: () => {
      const govde = { ad: t.ad, dil: t.dil, dpi: Number(t.dpi), baglanti: t.baglanti, adres: t.baglanti === 'ag' ? t.adres : null, sade: t.sade };
      return yazici
        ? api.post<Yazici>(`/etiket-merkezi/yazicilar/${yazici.id}/guncelle`, { ...govde, aktif: t.aktif, surum: yazici.surum })
        : api.post<Yazici>('/etiket-merkezi/yazicilar/ac', govde);
    },
    onSuccess: (y) => {
      bildir('tamam', `${y.ad} kaydedildi.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.yazicilar });
      kapat();
    },
    onError: (h) => setHata(hataIletisi(h, 'Yazıcı kaydedilemedi; yeniden deneyin.')),
  });
  return (
    <form className="tc-etk-form" onSubmit={(e) => { e.preventDefault(); setHata(null); kaydet.mutate(); }}>
      <div className="tc-etk-secimler">
        <Girdi etiket="Ad" required maxLength={80} value={t.ad} onChange={(e) => degistir({ ad: e.target.value })} />
        <Secim etiket="Yazıcı dili" value={t.dil} onChange={(e) => degistir({ dil: e.target.value as YaziciDili })}
          secenekler={secenekler.diller.map((d) => ({ deger: d.deger, baslik: d.ad }))} />
        <Secim etiket="Çözünürlük" value={t.dpi} onChange={(e) => degistir({ dpi: e.target.value })}
          secenekler={secenekler.cozunurlukler.map((d) => ({ deger: String(d), baslik: `${d} dpi` }))} />
        <Secim etiket="Bağlantı" value={t.baglanti} onChange={(e) => degistir({ baglanti: e.target.value as BaglantiTuru })}
          secenekler={(Object.keys(BAGLANTI_ADLARI) as BaglantiTuru[]).map((b) => ({ deger: b, baslik: BAGLANTI_ADLARI[b] }))} />
        {t.baglanti === 'ag' && (
          <Girdi etiket="IP adresi" required inputMode="decimal" maxLength={45} value={t.adres} onChange={(e) => degistir({ adres: e.target.value })}
            ipucu="Yalnız izin verilen kurum içi aralıktaki adres kabul edilir; kapı 9100." />
        )}
        <IsaretKutusu etiket="Türkçe harfleri sadeleştir" checked={t.sade} onChange={(e) => degistir({ sade: e.target.checked })} />
        {yazici && <IsaretKutusu etiket="Kullanımda" checked={t.aktif} onChange={(e) => degistir({ aktif: e.target.checked })} />}
      </div>
      {hata && <p className="tc-etk-hata" role="alert">{hata}</p>}
      <div className="tc-etk-dugmeler">
        <Dugme tur="birincil" type="submit" simge="check" yukleniyor={kaydet.isPending}>Kaydet</Dugme>
        <Dugme type="button" onClick={kapat}>Vazgeç</Dugme>
      </div>
    </form>
  );
}

export function Yazicilar() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('etiket-merkezi.yazici-yaz') ?? false;
  const liste = useQuery({ queryKey: anahtarlar.yazicilar, queryFn: () => api.get<YazicilarCevabi>('/etiket-merkezi/yazicilar') });
  const secenekler = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const [form, setForm] = useState<Yazici | 'yeni' | null>(null);
  if (liste.isPending || secenekler.isPending) return <Kart baslik="Yazıcılar"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError || secenekler.isError) {
    return <Kart baslik="Yazıcılar"><DurumKutusu durum="hata" yenile={() => { void liste.refetch(); void secenekler.refetch(); }} /></Kart>;
  }
  const dilAdi = (d: YaziciDili) => secenekler.data.secenekler.diller.find((x) => x.deger === d)?.ad ?? d;
  const sutunlar: Sutun<Yazici>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (y) => <strong>{y.ad}</strong> },
    { anahtar: 'dil', baslik: 'Dil', hucre: (y) => `${dilAdi(y.dil)} · ${y.dpi} dpi${y.sade ? ' · sade' : ''}` },
    { anahtar: 'baglanti', baslik: 'Bağlantı', hucre: (y) => (y.baglanti === 'ag' ? 'Ağ' : 'Dosya') },
    { anahtar: 'adres', baslik: 'Adres', mono: true, kirilmaz: true, hucre: (y) => y.adres ?? '-' },
    { anahtar: 'aktif', baslik: 'Durum', hucre: (y) => <Rozet ton={y.aktif ? 'tamam' : 'pasif'}>{y.aktif ? 'Kullanımda' : 'Kapalı'}</Rozet> },
    ...(yazabilir ? [{ anahtar: 'duzenle', baslik: '', hucre: (y: Yazici) => <Dugme simge="edit" onClick={() => setForm(y)}>Düzenle</Dugme> }] : []),
  ];
  const { dogrudanBaski } = liste.data;
  return (
    <Kart baslik="Yazıcılar">
      <p className="tc-etk-not">
        <Rozet ton={dogrudanBaski.acik ? 'tamam' : 'pasif'}>{dogrudanBaski.acik ? 'Doğrudan baskı açık' : 'Doğrudan baskı kapalı'}</Rozet>{' '}
        {dogrudanBaski.neden ?? 'Ağ yazıcısına sunucu doğrudan gönderir; dosya yazıcısında komut dosyası indirilir.'}
      </p>
      {form !== null && (
        <YaziciFormu key={form === 'yeni' ? 'yeni' : form.id} yazici={form === 'yeni' ? null : form} secenekler={secenekler.data.secenekler} kapat={() => setForm(null)} />
      )}
      {yazabilir && form === null && (
        <div className="tc-etk-dugmeler"><Dugme tur="birincil" simge="plus" onClick={() => setForm('yeni')}>Yazıcı ekle</Dugme></div>
      )}
      <Tablo etiket="Yazıcılar" sutunlar={sutunlar} satirlar={liste.data.yazicilar} satirAnahtari={(y) => y.id} bosMesaj="Tanımlı yazıcı yok." />
    </Kart>
  );
}
