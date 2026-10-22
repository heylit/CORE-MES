import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FasonGidisGovdesi, FasonHareketiCevabi, SiradakiFasonCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './uretim-emirleri.css';

// Malzeme · Teslim panelindeki "Fasona gönder" bölümü (kart #97, soru 92 b): okutulan emrin sıradaki fason iş emrine gidiş yazar.
// Gidiş Dış operasyonlardakiyle aynı komuttur (`uretim-emirleri.fason`); adet sınırını sunucu denetler, ekran iletisini gösterir.
// Teslimi sevkiyat işi yapar; parça bu komutla firmanın Yolda konumuna geçer.
const sayi = (m: string): number | null => (/^\d+$/.test(m.trim()) ? Number(m.trim()) : null);

function Gonderim({ f }: { f: NonNullable<SiradakiFasonCevabi['fason']> }) {
  const istemci = useQueryClient();
  const kalan = Math.max(f.gonderilebilir - f.gonderilen, 0);
  const [adet, setAdet] = useState(String(kalan));
  const [hata, setHata] = useState<string | null>(null);
  const [tamam, setTamam] = useState<string | null>(null);
  // Aynı gidişin yeniden gönderimi aynı kimlikle gider: ağ kopunca adet iki kez sayılmaz.
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const gonder = useMutation({
    mutationFn: (govde: FasonGidisGovdesi) => tekrarKorumaliGonder((deneme) => api.post<FasonHareketiCevabi>(
      `/adimli-emirler/${f.uretimEmriId}/is-emirleri/${f.isEmriId}/fason-gidis`, govde, deneme), { istekKimligi: kimlik }),
    onSuccess: (_c, g) => {
      setTamam(`${f.emirNo}: ${g.adet} adet fasona gönderildi.`);
      setKimlik(yeniIstekKimligi());
      void istemci.invalidateQueries({ queryKey: anahtarlar.siradakiFason(f.uretimEmriId) });
    },
    onError: (x) => setHata(hataIletisi(x, 'Kaydedilemedi; yeniden deneyin.')),
  });
  const kaydet = () => {
    setHata(null); setTamam(null);
    const a = sayi(adet);
    if (a === null || a === 0) { setHata('Gönderilen adedi sıfırdan büyük tam sayı olarak yazın.'); return; }
    gonder.mutate({ adet: a });
  };
  return (
    <form className="tc-emir-form" onSubmit={(e) => { e.preventDefault(); kaydet(); }} noValidate>
      <p className="tc-emir-not">
        {f.emirNo}, adım {f.opNo} {f.ad}{f.firma ? `, ${f.firma}` : ''}. Giden {f.gonderilen} / {f.gonderilebilir}, dönen {f.donenSaglam}, hurda {f.donenHurda}.
      </p>
      {kalan === 0 ? <p className="tc-emir-not">Gönderilebilecek adedin hepsi gönderildi.</p> : (
        <div className="tc-emir-ust">
          <Girdi etiket="Gönderilen adet" inputMode="numeric" value={adet} onChange={(e) => setAdet(e.target.value)} required />
          <Dugme tur="birincil" simge="truck" type="submit" yukleniyor={gonder.isPending}>Fasona gönder</Dugme>
        </div>
      )}
      {hata && <p className="tc-emir-hata" role="alert">{hata}</p>}
      {tamam && <p className="tc-emir-not" role="status">{tamam}</p>}
    </form>
  );
}

// Fason yetkisi olmayan kişide bölüm hiç görünmez ve sunucu sorulmaz.
export function FasonaGonder({ uretimEmriId }: { uretimEmriId: number }) {
  const yetkili = (useOturum().data?.islemler ?? []).includes('uretim-emirleri.fason');
  const q = useQuery({
    queryKey: anahtarlar.siradakiFason(uretimEmriId), enabled: yetkili,
    queryFn: () => api.get<SiradakiFasonCevabi>(`/adimli-emirler/${uretimEmriId}/siradaki-fason`),
  });
  if (!yetkili) return null;
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Fason adımı okunamadı.')} yenile={() => { void q.refetch(); }} />;
  if (q.data.fason === null) return <DurumKutusu durum="bos" mesaj="Bu emrin sıradaki adımı fason değil." />;
  return <Gonderim key={q.data.fason.isEmriId} f={q.data.fason} />;
}
