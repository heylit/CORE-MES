import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Firma, FirmaCevabi, LogoCariAramaCevabi, LogoCariSatiri, LogoyaBaglaGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { anahtarlar } from './anahtarlar.ts';
import { cevabiYaz } from './yazma.ts';

// Logo'dan cari arama (2118). Eşleşen firma varsa yeni kart açılmaz, bağlanır (2118-2 a); bağlama yalnız Logo kodunu ve kaydını yazar.
// Yeni firma formunda "Forma al" Logo'daki bilgileri forma koyar; firma ayrıntısında yalnız o firmaya bağlanır.
const ESLESME_NEDENI: Record<NonNullable<LogoCariSatiri['eslesme']>['neden'], string> = {
  'kayit-no': 'Logo kaydıyla bağlı',
  'cari-kodu': 'Aynı Logo cari kodu',
  kod: 'Aynı firma kodu',
  'vergi-no': 'Aynı vergi no',
};
const EN_AZ = 3;

interface Ozellikler {
  // null: yeni firma formu. Doluysa yalnız bu firmaya bağlanır.
  hedef: Firma | null;
  formaAl?: (cari: LogoCariSatiri) => void;
  baglandi: (firma: Firma) => void;
}

export function LogoCariArama({ hedef, formaAl, baglandi }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [metin, metinYaz] = useState('');
  const [aranan, arananYaz] = useState('');
  const sonuc = useQuery({
    queryKey: anahtarlar.logoCari(aranan),
    queryFn: () => api.get<LogoCariAramaCevabi>(`/musteri-tedarikci/logo-cari/ara?q=${encodeURIComponent(aranan)}`),
    enabled: aranan.length >= EN_AZ,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const bagla = useTekGonderim({
    mutationFn: (o: { firmaId: number; govde: LogoyaBaglaGovdesi }) =>
      api.post<FirmaCevabi>(`/musteri-tedarikci/firmalar/${o.firmaId}/logo-bagla`, o.govde),
    onSuccess: (cevap) => {
      cevabiYaz(istemci, cevap);
      void istemci.invalidateQueries({ queryKey: ['musteri-tedarikci', 'logo-cari'] });
      bildir('tamam', 'Firma Logo carisine bağlandı.');
      baglandi(cevap.firma);
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Bağlanamadı.')),
  });
  // Arama formu yeni firma formunun içinde durur; React'te submit olayı üst forma da kabarır ve firma formunu gönderirdi.
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    o.stopPropagation();
    const q = metin.trim();
    if (q.length >= EN_AZ) arananYaz(q);
  };

  const eylem = (c: LogoCariSatiri) => {
    if (c.alinamaz !== null) return <span className="tc-mt-yok">{c.alinamaz}</span>;
    const e = c.eslesme;
    if (hedef !== null) {
      if (e !== null && e.firmaId !== hedef.id) return <span className="tc-mt-yok">Başka firmada: {e.kod ?? e.ad}</span>;
      return (
        <Dugme simge="check" yukleniyor={bagla.isPending} onClick={() => bagla.mutate({ firmaId: hedef.id, govde: { logoKodu: c.kod, surum: hedef.surum } })}>
          Bağla
        </Dugme>
      );
    }
    if (e === null) return formaAl ? <Dugme simge="download" onClick={() => formaAl(c)}>Forma al</Dugme> : null;
    if (!e.baglanabilir) return null;
    return (
      <Dugme simge="check" yukleniyor={bagla.isPending} onClick={() => bagla.mutate({ firmaId: e.firmaId, govde: { logoKodu: c.kod, surum: e.surum } })}>
        {e.kod ?? e.ad} firmasına bağla
      </Dugme>
    );
  };
  const sutunlar: readonly Sutun<LogoCariSatiri>[] = [
    { anahtar: 'kod', baslik: 'Logo kodu', mono: true, kirilmaz: true, hucre: (c) => c.kod },
    { anahtar: 'ad', baslik: 'Ad', hucre: (c) => c.ad },
    { anahtar: 'vergiNo', baslik: 'Vergi no', mono: true, hucre: (c) => c.vergiNo },
    { anahtar: 'il', baslik: 'İl', hucre: (c) => c.il },
    {
      anahtar: 'durum', baslik: 'CORE', kirilmaz: true,
      hucre: (c) => (
        <span className="tc-mt-logo-durum">
          {c.eslesme === null
            ? <Rozet ton="bilgi"><Simge ad="plus" boyut="k" />Yok</Rozet>
            : <Rozet ton="uyari"><Simge ad="alert" boyut="k" />{ESLESME_NEDENI[c.eslesme.neden]}: {c.eslesme.kod ?? c.eslesme.ad}</Rozet>}
          {!c.aktif && <Rozet ton="pasif">Logo'da kullanım dışı</Rozet>}
        </span>
      ),
    },
    { anahtar: 'eylem', baslik: '', csv: false, hucre: eylem },
  ];

  return (
    <section className="tc-mt-bolum" aria-label="Logo'dan cari ara">
      <form className="tc-mt-logo-ara" onSubmit={gonder}>
        <Girdi
          etiket="Logo'da ara"
          ipucu={`Kod, ad ya da vergi no; en az ${EN_AZ} karakter.`}
          value={metin}
          maxLength={100}
          autoComplete="off"
          onChange={(o) => metinYaz(o.target.value)}
        />
        <Dugme simge="search" type="submit" yukleniyor={sonuc.isFetching} disabled={metin.trim().length < EN_AZ}>Ara</Dugme>
      </form>
      {sonuc.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sonuc.error, 'Logo\'da aranamadı.')} yenile={() => { void sonuc.refetch(); }} />}
      {sonuc.data && sonuc.data.durum !== 'tamam' && <p className="tc-mt-hata" role="alert">{sonuc.data.ileti}</p>}
      {sonuc.data?.durum === 'tamam' && (
        <>
          {sonuc.data.ileti !== null && <p className="tc-mt-yok">{sonuc.data.ileti}</p>}
          <Tablo etiket="Logo carileri" sutunlar={sutunlar} satirlar={sonuc.data.cariler} satirAnahtari={(c) => c.logoKayitNo} bosMesaj="Logo'da bu aramayla cari yok." />
        </>
      )}
    </section>
  );
}
