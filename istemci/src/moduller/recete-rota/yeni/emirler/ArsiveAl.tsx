import { useQuery } from '@tanstack/react-query';
import type { ArsivOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { sayi } from '../bicim.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';
import type { useEmirKomutu } from './komut.ts';
import type { Emir } from './kurallar.ts';

// 2721: başlamış emir silinmez, uyarı ve durdurmayla arşive alınır; sayılanlar ve tüketim kalır, kapanış açık kalır.
// Biçim üretim emrinin sözleşmesindedir. İlk uyarı iptal ile arşivin farkını anlatan sabit giriştir;
// `engel` doluysa arşive alma kapalıdır. Metinlerin hepsi sunucudan gelir.
export type ArsivOnizlemesi = ArsivOnizlemeCevabi;

// Özet satırları: yalnız verisi olan satır yazılır; bilinmeyen değer sıfır diye yazılmaz.
export function arsivOzeti(o: ArsivOnizlemesi): string[] {
  const sayiMetni = (v: number | null) => (v === null ? null : sayi(v));
  return [
    ...o.calisan.map((c) => `${c.opNo === null ? 'İş' : `OP ${String(c.opNo)}${c.ad ? ` ${c.ad}` : ''}`} çalışıyor${c.operator ? ` (${c.operator})` : ''}: durdurulur.`),
    ...(o.saglam !== null || o.hurda !== null ? [`Sayılan: ${sayiMetni(o.saglam) ?? '—'} sağlam, ${sayiMetni(o.hurda) ?? '—'} hurda; kalır.`] : []),
    ...(o.kararBekleyen !== null && o.kararBekleyen > 0 ? [`${sayi(o.kararBekleyen)} adet kalite kararı bekliyor; karar kapanışta verilir.`] : []),
    ...o.fasonda.map((f) => `OP ${String(f.opNo)}: fasonda ${sayi(f.adet)} parça.`),
    ...(o.hataliAcik > 0 ? [`${String(o.hataliAcik)} açık hatalı parça kaydı var.`] : []),
  ];
}

export function ArsivPenceresi({ emir: o, acik, kapat, komut }: {
  emir: Pick<Emir, 'id' | 'no' | 'surum'>; acik: boolean; kapat: () => void; komut: ReturnType<typeof useEmirKomutu>;
}) {
  const { data, error, isFetching } = useQuery({
    queryKey: [...RR_ANAHTARI, 'arsiv-onizleme', o.id, o.surum],
    enabled: acik,
    staleTime: 0,
    queryFn: async () => {
      try { return await api.get<ArsivOnizlemesi>(`/adimli-emirler/${encodeURIComponent(o.id)}/arsiv-onizleme`); } catch (h) { throw new RrHatasi(h); }
    },
  });
  const hazir = acik && data !== undefined && !isFetching;
  const kapali = !hazir || data.engel !== null || komut.mesgul;
  const arsivle = () => {
    if (!data) return;
    void komut.calistir('emir-arsive-al', { id: o.id, surum: data.surum }, `${o.no} arşive alındı; kapanış açık.`).then((c) => { if (c.tamam) kapat(); });
  };
  return (
    <Pencere
      acik={acik} kapat={kapat} baslik={`${o.no} arşive alınsın mı?`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.mesgul} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="box" onClick={arsivle} disabled={kapali} yukleniyor={komut.mesgul}>Durdur ve arşive al</Dugme>
        </>
      )}
    >
      <div className="tc-rr3-arsiv">
        {error && <p className="tc-rr3-uyari-kutu" role="alert"><Simge ad="alert" /><span>Özet okunamadı: {error.message} Arşive almadan önce yeniden deneyin.</span></p>}
        {acik && !data && !error && <p className="tc-rr3-meta">Özet okunuyor…</p>}
        {data && (
          <>
            {data.uyarilar[0] !== undefined && <p>{data.uyarilar[0]}</p>}
            {arsivOzeti(data).length > 0 && <ul className="tc-rr3-mesajlar">{arsivOzeti(data).map((t) => <li key={t}>{t}</li>)}</ul>}
            {data.uyarilar.length > 1 && (
              <div className="tc-rr3-uyari-kutu" role="status">
                <Simge ad="alert" />
                <ul className="tc-rr3-arsiv-uyari">{data.uyarilar.slice(1).map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {data.engel !== null && <p className="tc-rr3-uyari-kutu" data-ton="engel" role="alert"><Simge ad="x" /><span>{data.engel}</span></p>}
          </>
        )}
      </div>
    </Pencere>
  );
}

// Arşivdeki (iptal durumundaki) emrin kapanışı: başlamış emir arşive alınınca kapanış açılır; hiç başlamamış iptal emrin kapanışı
// yoktur (404). Durumdaki kapanisSonucu ikisini ayırmaz; bu yüzden sahibinin kapanış okuması sorulur.
export function useArsivKapanisi(o: Pick<Emir, 'kayitNo' | 'status'>) {
  return useQuery({
    queryKey: [...RR_ANAHTARI, 'arsiv-kapanisi', o.kayitNo],
    enabled: o.status === 'iptal',
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      try {
        return await api.get<{ asama: 'belge' | 'onay' | 'tamam' }>(`/adimli-emirler/${String(o.kayitNo)}/kapanis`);
      } catch (h) {
        if (h instanceof ApiHatasi && h.durum === 404) return null;
        throw new RrHatasi(h);
      }
    },
  });
}
