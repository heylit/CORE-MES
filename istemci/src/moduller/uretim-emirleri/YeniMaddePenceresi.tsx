import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HazirlikMaddeleriCevabi, HazirlikMaddesiEkleGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3739: şablon sekmesinden yeni (özel) hazırlık maddesi. Uç ve yetki Projeler'deki formla aynıdır (`/hazirlik-maddeleri/ozel-ekle`,
// uretim-emirleri.hazirlik-ayar); form oradan ithal edilemez (aynı kat, sınır kural g), bu yüzden burada ayrı ve küçüktür.
// Eklenen madde açık gelir ve yalnız uyarır; cevap madde listesinin önbelleğine yazılır, şablon listesinde hemen görünür.
export function YeniMaddePenceresi({ sonraki, kapat }: { sonraki: number; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istekKimligi = useRef<string | null>(null);
  const [ad, adYaz] = useState('');
  const [kisa, kisaYaz] = useState('');
  const [sira, siraYaz] = useState(String(sonraki));
  const komut = useMutation({
    mutationFn: () => {
      istekKimligi.current ??= yeniIstekKimligi();
      const govde: HazirlikMaddesiEkleGovdesi = { ad, kisa, sira: Number(sira), acik: true };
      return api.post<HazirlikMaddeleriCevabi>('/hazirlik-maddeleri/ozel-ekle', govde, { istekKimligi: istekKimligi.current });
    },
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.hazirlikMaddeleri, cevap);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      kapat();
    },
    // Sunucunun reddettiği gönderimden sonra kimlik yenilenir: düzeltilmiş gövde eski kimliğin saklı ret cevabına takılmaz.
    onError: (x) => { if (!yenidenDenenebilirMi(x)) istekKimligi.current = null; },
  });
  const ilet = (o: FormEvent) => { o.preventDefault(); komut.mutate(); };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Yeni hazırlık maddesi"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Madde adı" required value={ad} maxLength={60} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Girdi etiket="Kısa ad (sütun başlığı)" required value={kisa} maxLength={20} onChange={(e) => { kisaYaz(e.target.value); }} />
        <Girdi etiket="Sıra" type="number" inputMode="numeric" min={1} max={999} step={1} required value={sira} onChange={(e) => { siraYaz(e.target.value); }} />
        <p className="tc-form-tam tc-hs-not">Yeni madde her operasyonda görünür ve yalnız uyarır; başlatmayı durdurmaz.</p>
        {komut.isError && <p className="tc-form-tam tc-hs-uyari" role="alert">{hataIletisi(komut.error, 'Madde kaydedilemedi.')}</p>}
      </form>
    </Pencere>
  );
}
