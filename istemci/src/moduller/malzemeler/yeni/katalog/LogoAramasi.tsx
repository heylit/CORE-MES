import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LogoDurumuCevabi, LogoGecisCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import type { LogoMalzemeAramaCevabi, LogoMalzemeAramaDurumuCevabi, LogoMalzemeEkleCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, OnayPenceresi, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { useKorumaliKomut, useTekGonderim } from '../../../../ortak/veri/korumali-komut.ts';
import { zamanMetni } from '../../../../ortak/veri/zaman-metni.ts';
import { TUR_ADLARI as LOGO_TUR_ADLARI } from '../../LogoGonderimi.tsx';
import { LOGO_GECIS_ANAHTARI, logoTurMetni, TekAlmaPenceresi, type Satir } from '../../LogoMalzemeGecisi.tsx';
import { LOGO_GELEN_ANAHTARI } from '../../LogodanGelenler.tsx';
import { MALZEMELER_YENI } from '../veri.ts';

// 3319 a: katalogda "Logo'da da ara". Logo'ya istek yalnız düğmeyle gider (yardımcı tek lisans, cevap 60 sn'ye kadar); bulunan kartlar
// okunmuş kopyaya yazılır ve Logo geçişindeki satırla (tür, birim seti, CORE karşılığı) listenin üstündeki şeritte gösterilir.
// Alma ve bağlama Logo geçişindeki tek kart işlemleridir; Logo'ya yazılmaz.

// Sunucudaki sınırlarla aynı (paylasilan/sozlesme/logo.ts LOGO_MALZEME_ARAMA_EN_AZ ve _SONUCU); istemci zod taşıyan dosyayı değer olarak ithal etmez.
const LOGO_MALZEME_ARAMA_EN_AZ = 3;
const LOGO_MALZEME_ARAMA_SONUCU = 20;

type Sonuc =
  | { tur: 'bulundu'; metin: string; zaman: Date; kayitlar: readonly number[]; dolu: boolean }
  | { tur: 'yok'; metin: string; ileti: string }
  | { tur: 'hata'; metin: string; ileti: string };

const sureMetni = (sn: number): string => `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`;
// Köprünün sistem hata kodu (ECONNREFUSED gibi) kullanıcıya gösterilmez; neden metni kalır.
const kodsuz = (ileti: string): string => ileti.replace(/\s*\(([A-Z][A-Z0-9_]{2,})\)/g, '');

export function useKatalogLogoAramasi({ metin, yazabilir, kartAc }: { metin: string; yazabilir: boolean; kartAc: (kimlik: string) => void }): {
  dugme: ReactNode; serit: ReactNode;
} {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [sonuc, sonucYaz] = useState<Sonuc | null>(null);
  const [gizli, gizliYaz] = useState(false);
  const [baslangic, baslangicYaz] = useState<number | null>(null);
  const [gecen, gecenYaz] = useState(0);
  const [alinan, alinanYaz] = useState<Satir | null>(null);
  const [baglanan, baglananYaz] = useState<Satir | null>(null);
  const aranan = metin.trim();

  const durum = useQuery({
    queryKey: ['malzemeler', 'logo-arama-durumu'],
    enabled: yazabilir,
    queryFn: () => api.get<LogoMalzemeAramaDurumuCevabi>('/logo-gecisi/malzeme-arama-durumu'),
  });
  const logoDurumu = useQuery({
    queryKey: ['malzemeler', 'logo-durumu'],
    enabled: yazabilir && sonuc?.tur === 'bulundu',
    queryFn: () => api.get<LogoDurumuCevabi>('/malzeme-logo-durumu'),
  });
  const kayitlar = sonuc?.tur === 'bulundu' ? sonuc.kayitlar : [];
  const satirlar = useQuery({
    queryKey: [...LOGO_GECIS_ANAHTARI, 'katalog', kayitlar.join(',')],
    enabled: kayitlar.length > 0,
    queryFn: () => api.get<LogoGecisCevabi>(`/malzeme-logo-gecisi?${new URLSearchParams({ kayitlar: kayitlar.join(','), sayfa: '0' }).toString()}`),
  });

  const bitti = () => { baslangicYaz(null); gecenYaz(0); };
  const ekle = useKorumaliKomut({
    gonder: (o: { kartlar: number[]; metin: string }, deneme) => api.post<LogoMalzemeEkleCevabi>('/logo-gecisi/malzeme-ekle', { kartlar: o.kartlar }, deneme),
    onSuccess: (_c, o) => {
      bitti();
      sonucYaz({ tur: 'bulundu', metin: o.metin, zaman: new Date(), kayitlar: o.kartlar, dolu: o.kartlar.length >= LOGO_MALZEME_ARAMA_SONUCU });
      gizliYaz(false);
    },
    onError: (e, o) => { bitti(); sonucYaz({ tur: 'hata', metin: o.metin, ileti: hataIletisi(e, 'Logo\'da bulunan kartlar okunamadı') }); },
  });
  const ara = useTekGonderim({
    mutationFn: (q: string) => api.get<LogoMalzemeAramaCevabi>(`/logo-gecisi/malzeme-ara?${new URLSearchParams({ q }).toString()}`),
    onSuccess: (r, q) => {
      if (r.durum !== 'tamam') { bitti(); sonucYaz({ tur: 'hata', metin: q, ileti: r.ileti ?? 'Logo\'da aranamadı.' }); return; }
      if (r.kartlar.length === 0) { bitti(); sonucYaz({ tur: 'yok', metin: q, ileti: `"${q}" Logo'da da yok. Kod ya da adın bir parçasıyla deneyin.` }); return; }
      ekle.mutate({ kartlar: r.kartlar.map((k) => k.logoKayitNo), metin: q });
    },
    onError: (e, q) => { bitti(); sonucYaz({ tur: 'hata', metin: q, ileti: hataIletisi(e, 'Logo\'da aranamadı') }); },
  });
  const bekliyor = ara.isPending || ekle.isPending;
  useEffect(() => {
    if (baslangic === null) return undefined;
    const z = setInterval(() => gecenYaz(Math.floor((Date.now() - baslangic) / 1000)), 1000);
    return () => clearInterval(z);
  }, [baslangic]);
  const basla = (q: string) => {
    if (bekliyor) return;
    baslangicYaz(Date.now());
    gecenYaz(0);
    gizliYaz(false);
    ara.mutate(q);
  };

  const yenile = async () => {
    await istemci.invalidateQueries({ queryKey: LOGO_GECIS_ANAHTARI });
    await istemci.invalidateQueries({ queryKey: LOGO_GELEN_ANAHTARI });
    await istemci.invalidateQueries({ queryKey: MALZEMELER_YENI });
  };
  const bagla = useTekGonderim({
    mutationFn: (k: Satir) => api.post(`/malzeme-logo-kartlari/${k.logoKayitNo}/bagla`, { surum: k.tmi?.surum }),
    onSuccess: async (_c, k) => {
      baglananYaz(null);
      bildir('tamam', `${k.kod} Logo kaydı ${k.tmi?.stokKodu ?? ''} kartına bağlandı.`);
      await yenile();
    },
    onError: (e) => { baglananYaz(null); bildir('hata', hataIletisi(e, 'Bağlanamadı')); },
  });

  if (!yazabilir) return { dugme: null, serit: null };
  const neden = durum.data && !durum.data.acik ? durum.data.neden ?? 'Logo\'da arama kapalı.'
    : aranan.length < LOGO_MALZEME_ARAMA_EN_AZ ? `En az ${LOGO_MALZEME_ARAMA_EN_AZ} karakter yazın.` : null;

  const dugme = (
    <span className="tc-mk-logo-ara">
      <Dugme
        simge="search" disabled={neden !== null || durum.isPending} yukleniyor={bekliyor}
        onClick={() => basla(aranan)}
      >
        Logo'da da ara
      </Dugme>
      <span className="tc-mk-logo-not">{neden ?? `En çok ${LOGO_MALZEME_ARAMA_SONUCU} sonuç gösterilir.`}</span>
    </span>
  );

  const satirHucresi = (k: Satir) => {
    if (!k.aktif) return { rozet: <Rozet ton="pasif">Logo'da pasif</Rozet>, eylem: <span className="tc-mk-logo-not">Pasif kart alınmaz</span> };
    if (k.durum === 'bagli' && k.tmi) {
      return { rozet: <Rozet ton="tamam">CORE'da: {k.tmi.stokKodu}</Rozet>, eylem: <Dugme simge="next" onClick={() => kartAc(k.tmi!.kimlik)}>Kartı aç</Dugme> };
    }
    const baglanir = k.durum === 'bagsiz' && k.tmi !== null && k.tmi.onayDurumu !== 'iptal';
    return {
      rozet: <Rozet ton="uyari">Bağlı değil</Rozet>,
      eylem: (
        <span className="tc-mk-logo-eylemler">
          {k.durum === 'yeni' && <Dugme simge="download" aria-label={`${k.kod} CORE'a al`} onClick={() => alinanYaz(k)}>CORE'a al</Dugme>}
          {baglanir && (
            <Dugme simge="tag" aria-label={`${k.kod} var olan karta bağla`} title={`Aynı kodlu ${k.tmi!.stokKodu} kartına bağlar`} onClick={() => baglananYaz(k)}>
              Var olan karta bağla
            </Dugme>
          )}
        </span>
      ),
    };
  };

  let govde: ReactNode = null;
  if (bekliyor) {
    govde = (
      <>
        <div className="tc-mk-logo-bas"><strong>Logo'da aranıyor…</strong><Rozet ton="bilgi">Bekleniyor</Rozet></div>
        <p className="tc-mk-logo-not">Logo'dan cevap bekleniyor · <span aria-hidden="true">{sureMetni(gecen)}</span></p>
        <p className="tc-mk-logo-not">Logo yavaşsa 1 dakika sürebilir. Arama iptal edilemez; sayfada çalışmaya devam edebilirsiniz.</p>
      </>
    );
  } else if (sonuc?.tur === 'hata') {
    govde = (
      <>
        <div className="tc-mk-logo-bas"><strong>Aranamadı</strong><Rozet ton="hata">Hata</Rozet></div>
        <p className="tc-mk-logo-not" role="alert">{kodsuz(sonuc.ileti)}</p>
        <span className="tc-mk-logo-eylemler">
          <Dugme simge="rotate" onClick={() => basla(sonuc.metin)}>Tekrar dene</Dugme>
          <Dugme onClick={() => sonucYaz(null)}>Gizle</Dugme>
        </span>
        <p className="tc-mk-logo-not">Sürerse Sistem ve Güvenlik &gt; Bağlantı izleme'de Logo yardımcısını deneyin.</p>
      </>
    );
  } else if (sonuc?.tur === 'yok') {
    govde = (
      <>
        <div className="tc-mk-logo-bas"><strong>Logo'da da bulunamadı</strong><Rozet ton="pasif">0 kart</Rozet><Dugme onClick={() => sonucYaz(null)}>Gizle</Dugme></div>
        <p className="tc-mk-logo-not">{sonuc.ileti}</p>
      </>
    );
  } else if (sonuc?.tur === 'bulundu') {
    const liste = satirlar.data?.kartlar ?? [];
    govde = (
      <>
        <div className="tc-mk-logo-bas">
          <strong>Logo'da bulunanlar</strong>
          <span className="tc-mk-logo-not">{sonuc.dolu ? 'İlk 20 kart' : `${sonuc.kayitlar.length} kart`} · "{sonuc.metin}" için, {zamanMetni(sonuc.zaman.toISOString())}</span>
          <Dugme onClick={() => gizliYaz(true)}>Gizle</Dugme>
        </div>
        {sonuc.dolu && <p className="tc-mk-logo-not">Daha çok sonuç olabilir; aramayı daraltın.</p>}
        {satirlar.isError && <p className="tc-mk-logo-not" role="alert">{hataIletisi(satirlar.error, 'Bulunan kartlar okunamadı')}</p>}
        <ul className="tc-mk-logo-liste">
          {liste.map((k) => {
            const h = satirHucresi(k);
            return (
              <li key={k.logoKayitNo} className="tc-mk-logo-satir">
                <span className="tc-mk-logo-kod">{k.kod}<small>Logo kodu</small></span>
                <span>{k.ad ?? '—'}</span>
                <span>{k.birimSeti ?? '—'}<small>Birim seti</small></span>
                <span>{logoTurMetni(k.kartTuru, logoDurumu.data, LOGO_TUR_ADLARI) ?? '—'}</span>
                <span>{h.rozet}</span>
                <span>{h.eylem}</span>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const serit = (
    <>
      <div className="tc-mk-logo-durum" aria-live="polite">
        {bekliyor ? 'Logo\'da aranıyor.' : sonuc?.tur === 'bulundu' ? `Logo'da ${sonuc.kayitlar.length} kart bulundu.` : sonuc?.tur === 'yok' ? 'Logo\'da da bulunamadı.' : ''}
      </div>
      {govde !== null && (gizli && sonuc?.tur === 'bulundu' && !bekliyor
        ? <div className="tc-mk-logo-serit"><Dugme onClick={() => gizliYaz(false)}>Logo'da bulunanları göster ({sonuc.kayitlar.length})</Dugme></div>
        : <section className="tc-mk-logo-serit" aria-label="Logo'da bulunanlar" aria-busy={bekliyor}>{govde}</section>)}
      {alinan && (
        <TekAlmaPenceresi
          satir={alinan} turAdlari={LOGO_TUR_ADLARI} karsiliklar={logoDurumu.data?.karsiliklar ?? []}
          kapat={() => alinanYaz(null)} alindi={yenile}
        />
      )}
      <OnayPenceresi
        acik={baglanan !== null}
        baslik="Aynı malzeme: kart Logo kaydına bağlansın mı?"
        onayMetni="Bağla"
        yukleniyor={bagla.isPending}
        onayla={() => { if (baglanan) bagla.mutate(baglanan); }}
        vazgec={() => baglananYaz(null)}
      >
        {baglanan && `${baglanan.tmi?.stokKodu ?? ''} kartı Logo'daki ${baglanan.kod} kaydına bağlanır; kart kodu değişmez, Logo'ya yazılmaz.`}
      </OnayPenceresi>
    </>
  );
  return { dugme, serit };
}
