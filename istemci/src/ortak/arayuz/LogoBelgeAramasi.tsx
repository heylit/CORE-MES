import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { LogoBelgeAramaCevabi, LogoBelgeAramaTuru, LogoBelgeBulgusu } from '#paylasilan/sozlesme/logo.ts';
import { api, hataIletisi } from '../veri/api.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Girdi } from './Alan.tsx';
import { Pencere } from './Pencere.tsx';
import { Rozet } from './Rozet.tsx';
import { Tablo, type Sutun } from './Tablo.tsx';
import './logo-rozeti.css';

// Sunucudaki sınırlarla aynı (paylasilan/sozlesme/logo.ts LOGO_BELGE_ARAMA_EN_AZ, _EN_COK); istemci zod taşıyan dosyayı değer olarak ithal etmez.
const LOGO_BELGE_ARAMA_EN_AZ = 3;
const LOGO_BELGE_ARAMA_EN_COK = 100;
// 3360 a: beş listede aynı "Logo'da ara" düğmesi; pencere o türde Logo'da genel arama yapar (başlık ve satır içeriği). Yalnız okur.
const TUR_ADI: Record<LogoBelgeAramaTuru, string> = {
  proje: 'proje', 'satis-siparisi': 'satış siparişi', teklif: 'teklif', talep: 'satın alma talebi', 'satin-alma-siparisi': 'satın alma siparişi',
};
// CORE'da ayrıntı sayfası olan türler; talep ve satın alma siparişi kendi listesinde açılır.
const CORE_YOLU: Partial<Record<LogoBelgeAramaTuru, (id: number) => string>> = {
  proje: (id) => `/projeler/${String(id)}`,
  'satis-siparisi': (id) => `/siparisler/${String(id)}`,
  teklif: (id) => `/siparisler/teklifler/${String(id)}`,
};
const TUTARSIZ: readonly LogoBelgeAramaTuru[] = ['proje', 'talep'];
// Logo TRCURR: 0 ya da boş yerel para (TL); bilinmeyen kod sayıyla yazılır.
const DOVIZ: Record<number, string> = { 1: 'USD', 17: 'GBP', 20: 'EUR' };

function tarihMetni(t: string | null): string {
  if (t === null) return '—';
  const [y, a, g] = t.split('-');
  return `${g ?? ''}.${a ?? ''}.${y ?? ''}`;
}
function tutarMetni(t: string, doviz: number | null): string {
  const [tam = '0', ondalik = ''] = t.replace(/^-/, '').split('.');
  const binlik = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${t.startsWith('-') ? '-' : ''}${binlik},${ondalik.padEnd(2, '0').slice(0, 2)} ${doviz === null ? 'TL' : (DOVIZ[doviz] ?? `döviz ${String(doviz)}`)}`;
}
function eslesenIcerik(b: LogoBelgeBulgusu): string | null {
  const x = b.satirlar[0];
  if (x === undefined) return b.aciklama !== null ? `Açıklama: "${b.aciklama}"` : null;
  const parca = [x.kod, x.ad, x.miktar !== null ? `${x.miktar}${x.birim !== null ? ` ${x.birim}` : ''}` : null, x.aciklama].filter((p) => p !== null);
  const fazla = b.satirSayisi > 1 ? ` (+${String(b.satirSayisi - 1)} satır)` : '';
  return `Satır: ${parca.join(' · ')}${fazla}`;
}

export function LogoBelgeAramasi({ tur }: { tur: LogoBelgeAramaTuru }) {
  const durum = useQuery({
    queryKey: ['logo', 'belge-arama-durumu'],
    queryFn: () => api.get<{ acik: boolean }>('/logo/belge-arama-durumu'),
    staleTime: 60_000,
    retry: false,
  });
  const [acik, acikYaz] = useState(false);
  const [metin, metinYaz] = useState('');
  const [aranan, arananYaz] = useState('');
  const sonuc = useQuery({
    queryKey: ['logo', 'belge-ara', tur, aranan],
    queryFn: () => api.get<LogoBelgeAramaCevabi>(`/logo/belge-ara?tur=${tur}&q=${encodeURIComponent(aranan)}`),
    enabled: acik && aranan.length >= LOGO_BELGE_ARAMA_EN_AZ,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    const q = metin.trim();
    if (q.length >= LOGO_BELGE_ARAMA_EN_AZ) {
      if (q === aranan) void sonuc.refetch();
      else arananYaz(q);
    }
  };
  const yol = CORE_YOLU[tur];
  const tutarVar = !TUTARSIZ.includes(tur) && sonuc.data?.fiyatGorunur === true;
  const sutunlar: Sutun<LogoBelgeBulgusu>[] = [
    {
      anahtar: 'no', baslik: 'Logo no / tarih', kirilmaz: true,
      hucre: (b) => (
        <span className="tc-logo-ara-no">
          <span className="mono">{b.no ?? `#${String(b.logoKayitNo)}`}</span>
          <span className="tc-logo-rozet-neden">{tarihMetni(b.tarih)}</span>
        </span>
      ),
    },
    {
      anahtar: 'icerik', baslik: tur === 'proje' || tur === 'talep' ? 'Proje / eşleşen içerik' : 'Cari / eşleşen içerik',
      hucre: (b) => {
        const ust = tur === 'proje'
          ? [b.projeKodu ?? b.no, b.projeAdi].filter((p) => p !== null).join(' · ')
          : [b.cariKodu, b.cariAdi].filter((p) => p !== null).join(' · ') || [b.projeKodu, b.projeAdi].filter((p) => p !== null).join(' · ');
        const alt = eslesenIcerik(b);
        return (
          <span className="tc-logo-ara-no">
            <span>{ust === '' ? '—' : ust}</span>
            {alt !== null && <span className="tc-logo-rozet-neden">{alt}</span>}
          </span>
        );
      },
    },
    ...(tutarVar ? [{ anahtar: 'tutar', baslik: 'Tutar', mono: true, kirilmaz: true, hucre: (b: LogoBelgeBulgusu) => (b.tutar === null ? '—' : tutarMetni(b.tutar, b.dovizTuru)) }] : []),
    { anahtar: 'durum', baslik: 'Logo durumu', kirilmaz: true, hucre: (b) => (b.iptal ? <Rozet ton="pasif">İptal</Rozet> : <Rozet ton="bilgi">Açık</Rozet>) },
    {
      anahtar: 'core', baslik: 'CORE karşılığı', kirilmaz: true,
      hucre: (b) => (b.core === null
        ? <span className="tc-logo-rozet-yok">CORE'dan gitmedi</span>
        : (
          <span className="tc-logo-ara-no">
            <Rozet ton="tamam">Bağlı</Rozet>
            {yol !== undefined && <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={yol(b.core.id)}>CORE'da aç</Link>}
          </span>
        )),
    },
  ];
  const ad = TUR_ADI[tur];
  // Arama kapalıyken ya da köprü tanımsızken düğme çizilmez (Sistem Ayarları'nda "Logo: belge araması").
  if (durum.data?.acik !== true) return null;
  return (
    <>
      <Dugme simge="search" onClick={() => acikYaz(true)}>Logo'da ara</Dugme>
      <Pencere acik={acik} kapat={() => acikYaz(false)} baslik={`Logo'da ${ad} ara`} tur="yan" genis>
        <form className="tc-logo-ara-form" onSubmit={gonder}>
          <Girdi
            etiket="Aranan"
            value={metin}
            maxLength={LOGO_BELGE_ARAMA_EN_COK}
            autoComplete="off"
            onChange={(o) => metinYaz(o.target.value)}
          />
          <Dugme simge="search" type="submit" yukleniyor={sonuc.isFetching} disabled={metin.trim().length < LOGO_BELGE_ARAMA_EN_AZ}>Ara</Dugme>
        </form>
        <p className="tc-logo-rozet-neden tc-logo-ara-ipucu">
          {`Genel arama: belge no, cari, proje, açıklama ya da satırdaki malzeme kodu ve adı; en az ${String(LOGO_BELGE_ARAMA_EN_AZ)} karakter; son 1 yıl, en çok 50.`}
        </p>
        {sonuc.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sonuc.error, 'Logo\'da aranamadı.')} yenile={() => { void sonuc.refetch(); }} />}
        {sonuc.data && sonuc.data.durum !== 'tamam' && <p className="tc-logo-ara-ileti" role="alert">{sonuc.data.ileti}</p>}
        {sonuc.data?.durum === 'tamam' && (
          <Tablo
            etiket={`Logo'da bulunan ${ad} belgeleri`}
            sutunlar={sutunlar}
            satirlar={sonuc.data.belgeler}
            satirAnahtari={(b) => b.logoKayitNo}
            bosMesaj={sonuc.data.ileti ?? 'Logo\'da bu aramayla belge yok.'}
          />
        )}
        <p className="tc-logo-rozet-neden">Yalnız okur; Logo'ya bir şey yazılmaz.</p>
      </Pencere>
    </>
  );
}
