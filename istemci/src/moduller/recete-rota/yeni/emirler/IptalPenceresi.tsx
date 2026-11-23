import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { IptalOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Pencere, Rozet, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { sayi } from '../bicim.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';
import type { useEmirKomutu } from './komut.ts';
import type { Emir } from './kurallar.ts';

// 3576: iptal penceresi. Alt emri olmayan emirde bugünkü onay (iptal, plandan ve terminalden kalkar). Alt emri olan emirde bütün açık alt
// emirler (torunlar dahil) listelenir ve hepsi birlikte iptal edilir; biri başlamışsa hiçbiri iptal edilmez. Listeyi ve engel metnini sunucu
// kurar (komutla aynı kural); pencerenin gördüğü liste komutla gider, sunucudaki ağaç farklıysa iptal olmaz.
export type IptalOnizlemesi = IptalOnizlemeCevabi;
type AltEmir = IptalOnizlemesi['altEmirler'][number];

const TALEP_GOSTER = 3;

export const turMetni = (a: Pick<AltEmir, 'tur' | 'baslangicOpNo' | 'birlesmeOpNo'>): string => {
  if (a.tur === 'parti') return 'Parti';
  const bas = a.baslangicOpNo === null ? null : `OP ${String(a.baslangicOpNo)}`;
  return bas === null ? 'Kol' : `Kol (${bas}→${a.birlesmeOpNo === null ? 'son' : String(a.birlesmeOpNo)})`;
};
const DURUM_METNI: Readonly<Record<AltEmir['durum'], string>> = { taslak: 'Taslak', planli: 'Planlı', basladi: 'Başladı' };

// Pencerenin bilgi satırları: yalnız verisi olan satır yazılır; sıfır uydurulmaz.
export function iptalBilgileri(o: IptalOnizlemesi): string[] {
  return [
    'Stok rezervleri kalkar, açık depo istekleri kapanır, emirler plandan ve terminalden çıkar.',
    ...(o.hazirlikGorevi > 0 ? [`Bu emirlerin ${sayi(o.hazirlikGorevi)} hazırlık görevi kapanır.`] : []),
  ];
}
type Talep = IptalOnizlemesi['satinAlmaTalepleri'][number];
// Uyarının cümlesi parçalara ayrılır: talep numarası bağlantı olur (yeni sekmede açılır; kullanıcı iptalden önce bakabilir).
export function talepUyarisi(talepler: readonly Talep[]): { gosterilen: Talep[]; fazla: number; sayi: number } | null {
  if (talepler.length === 0) return null;
  return { gosterilen: talepler.slice(0, TALEP_GOSTER) as Talep[], fazla: Math.max(0, talepler.length - TALEP_GOSTER), sayi: talepler.length };
}
export const talepMetni = (u: NonNullable<ReturnType<typeof talepUyarisi>>): string =>
  `Bu emre bağlı ${String(u.sayi)} açık satın alma talebi var (${u.gosterilen.map((x) => x.no).join(', ')}${u.fazla > 0 ? ` +${String(u.fazla)} talep` : ''}), siparişe dönmemiş. Talep iptal edilmez; satın alma karar verir.`;
function TalepUyarisi({ uyari: u }: { uyari: NonNullable<ReturnType<typeof talepUyarisi>> }) {
  return (
    <span>
      Bu emre bağlı {u.sayi} açık satın alma talebi var (
      {u.gosterilen.map((x, i) => (
        <span key={x.no}>
          {i > 0 && ', '}
          {x.id === null ? x.no : <Link to={`/satin-alma/talepler?talep=${encodeURIComponent(x.id)}`} target="_blank" rel="noopener noreferrer">{x.no}</Link>}
        </span>
      ))}
      {u.fazla > 0 ? ` +${String(u.fazla)} talep` : ''}), siparişe dönmemiş. Talep iptal edilmez; satın alma karar verir.
    </span>
  );
}

const SUTUNLAR: readonly Sutun<AltEmir>[] = [
  {
    anahtar: 'emirNo', baslik: 'Alt emir', mono: true,
    hucre: (a) => (a.ustEmirNo === null ? a.emirNo : <>{a.emirNo}<small className="tc-rr3-iptal-ust"> · {a.ustEmirNo} altında</small></>),
    csv: (a) => a.emirNo,
  },
  { anahtar: 'tur', baslik: 'Tür', hucre: (a) => turMetni(a) },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (a) => `${sayi(a.adet)} adet` },
  {
    anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
    hucre: (a) => (a.baslamis ? <Rozet ton="hata">Engel: başlamış</Rozet> : <Rozet ton={a.durum === 'planli' ? 'bilgi' : 'pasif'}>{DURUM_METNI[a.durum]}</Rozet>),
  },
];

export function IptalPenceresi({ emir: o, acik, kapat, komut }: {
  emir: Pick<Emir, 'id' | 'no' | 'surum'>; acik: boolean; kapat: () => void; komut: ReturnType<typeof useEmirKomutu>;
}) {
  const engelKimlik = useId();
  const [denendi, setDenendi] = useState(false);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: [...RR_ANAHTARI, 'iptal-onizleme', o.id],
    enabled: acik,
    staleTime: 0,
    queryFn: async () => {
      try { return await api.get<IptalOnizlemesi>(`/adimli-emirler/${encodeURIComponent(o.id)}/iptal-onizleme`); } catch (h) { throw new RrHatasi(h); }
    },
  });
  const { uyariKapat } = komut;
  useEffect(() => {
    if (acik) { setDenendi(false); uyariKapat(); }
  }, [acik, uyariKapat]);

  const hazir = acik && data !== undefined && !isFetching;
  const altlar = data?.altEmirler ?? [];
  const altli = altlar.length > 0;
  const engel = hazir ? data.engel : null;
  const kapali = !hazir || engel !== null || komut.mesgul;
  const iptalEt = () => {
    if (!hazir || engel !== null) return;
    const govde = { id: o.id, surum: data.surum, ...(altli ? { altlariyla: true, altEmirIdleri: altlar.map((a) => a.id) } : {}) };
    const basari = altli ? `${String(altlar.length + 1)} emir iptal edildi: ${o.no} ve ${String(altlar.length)} alt emri.` : 'Emir iptal edildi.';
    void komut.calistir('emir-iptal', govde, basari).then((c) => {
      if (c.tamam) { kapat(); return; }
      setDenendi(true);
      void refetch();
    });
  };
  const uyari = hazir ? talepUyarisi(data.satinAlmaTalepleri) : null;
  const baslik = engel !== null && altli ? `${o.no} iptal edilemez` : `${o.no} iptal edilsin mi?`;
  const eylem = altli ? `Alt emirleriyle iptal et (${String(altlar.length + 1)} emir)` : 'İptal et';

  return (
    <Pencere
      acik={acik} kapat={kapat} baslik={baslik}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.mesgul} data-ilk-odak>{engel !== null ? 'Kapat' : 'Vazgeç'}</Dugme>
          <Dugme
            tur="tehlike" simge="x" onClick={iptalEt} yukleniyor={komut.mesgul}
            disabled={!hazir || komut.mesgul} aria-disabled={kapali ? true : undefined} {...(engel !== null ? { 'aria-describedby': engelKimlik } : {})}
          >
            {komut.mesgul ? 'İptal ediliyor…' : eylem}
          </Dugme>
        </>
      )}
    >
      <div className="tc-rr3-arsiv">
        {error && <p className="tc-rr3-uyari-kutu" role="alert"><Simge ad="alert" /><span>Alt emirler okunamadı: {error.message} İptal etmeden önce yeniden deneyin.</span></p>}
        {acik && !data && !error && <p className="tc-rr3-meta" role="status">Alt emirler okunuyor…</p>}
        {hazir && (
          <>
            {!altli && <p>Emir iptal edilir; plandan ve terminalden kalkar.</p>}
            {altli && engel === null && <p>Bu emrin <b>{sayi(altlar.length)} alt emri</b> var. Ana emirle birlikte hepsi iptal edilir. İptal geri alınamaz.</p>}
            {altli && engel !== null && <p>Bu emrin {sayi(altlar.length)} alt emri var; biri başladığı için hiçbiri iptal edilmez.</p>}
            {altli && (
              <div className="tc-rr3-iptal-liste" role="region" aria-label="Alt emirler" tabIndex={0}>
                <Tablo etiket="Alt emirler" sutunlar={SUTUNLAR} satirlar={altlar} satirAnahtari={(a) => a.id} />
              </div>
            )}
            {engel === null && (
              <ul className="tc-rr3-mesajlar" aria-label="İptalin sonuçları">{iptalBilgileri(data).map((t) => <li key={t}>{t}</li>)}</ul>
            )}
            {uyari !== null && <p className="tc-rr3-uyari-kutu" data-ton="uyari" role="status"><Simge ad="alert" /><TalepUyarisi uyari={uyari} /></p>}
            {engel !== null && <p className="tc-rr3-uyari-kutu" data-ton="engel" id={engelKimlik}><Simge ad="x" /><span>{engel}</span></p>}
          </>
        )}
        {denendi && komut.uyari !== null && <p className="tc-rr3-uyari-kutu" data-ton="engel" role="alert"><Simge ad="x" /><span>İptal edilmedi: {komut.uyari.metin} Liste yenilendi; hiçbir emir iptal edilmedi.</span></p>}
      </div>
    </Pencere>
  );
}
