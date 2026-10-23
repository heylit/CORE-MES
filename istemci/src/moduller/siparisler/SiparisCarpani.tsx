import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PlanCevabi, SiparisBandiCevabi, SiparisCarpaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';
import { ELLE_CARPAN, useBantGorur, useCarpanGorur, useCarpanSiniri, useKorumaliGonderim } from './yazma.ts';

type Kayit = SiparisCarpaniCevabi['gecmis'][number];
type Bant = NonNullable<SiparisBandiCevabi['bant']>;

const SINIF_ADI = { yuksek: 'Yüksek', normal: 'Normal', dusuk: 'Düşük' } as const;
const tlMetni = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const emirlerMetni = (b: Bant): string => b.emirler.map((e) => `${e.emirNo} ${SINIF_ADI[e.sinif]} (${tlMetni(e.bedel)} TL/saat)`).join(', ');

// 306 a: canlı bant ile çarpanın yazıldığı taslağın bandı karşılaştırılır; çarpan sınırı aşmadıysa kullanıcı neden sıranın değişmediğini görür.
function bantFarki(once: Bant, sonra: Bant): string {
  const onceki = new Map(once.emirler.map((e) => [e.uretimEmriId, e.sinif]));
  const degisen = sonra.emirler.filter((e) => onceki.has(e.uretimEmriId) && onceki.get(e.uretimEmriId) !== e.sinif);
  if (degisen.length === 0) {
    return `Taslakta bant değişmez: ${emirlerMetni(sonra)}. Yüksek için bedel ${tlMetni(sonra.yuksekSiniri)} TL/saat ve üstü, Düşük için ${tlMetni(sonra.dusukSiniri)} TL/saat ve altı olmalı.`;
  }
  return `Taslakta bant değişir: ${degisen.map((e) => `${e.emirNo} ${SINIF_ADI[onceki.get(e.uretimEmriId)!]} → ${SINIF_ADI[e.sinif]}`).join(', ')}.`;
}

const carpanMetni = (c: number): string => `×${c.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

const SUTUNLAR: Sutun<Kayit>[] = [
  { anahtar: 'carpan', baslik: 'Çarpan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => carpanMetni(k.carpan) },
  { anahtar: 'gerekce', baslik: 'Gerekçe', hucre: (k) => k.gerekce },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (k) => k.kisiAdi ?? `Kişi ${k.kisiId}` },
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, kirilmaz: true, hucre: (k) => zamanMetni(k.zaman) },
];

// Elle çarpan (195 a): siparişin gecikme bedelini plan için çarpar. Veri Plan uçlarındadır; kayıt yalnız eklenir, geçmiş silinmez.
// 148 a: çarpan önce plan taslağına yazılır; geçmiş ve geçerli çarpan canlıdır, taslak onaylanıp canlıya alınınca değişir.
export function SiparisCarpani({ siparis }: { siparis: SiparisAyrintisi }) {
  const gorur = useCarpanGorur();
  const sinir = useCarpanSiniri();
  const [form, formYaz] = useState(false);
  const sorgu = useQuery({
    queryKey: anahtarlar.siparisCarpani(siparis.id),
    queryFn: () => api.get<SiparisCarpaniCevabi>(`/plan/siparisler/${siparis.id}/carpan`),
    enabled: gorur,
  });
  const bantGorur = useBantGorur();
  const istemci = useQueryClient();
  const bantSorgu = useQuery({
    queryKey: anahtarlar.siparisBandi(siparis.id),
    queryFn: () => api.get<SiparisBandiCevabi>(`/plan/siparisler/${siparis.id}/bant`),
    enabled: gorur && bantGorur,
  });
  const [taslak, taslakYaz] = useState<number | null>(null);
  const taslakBantSorgu = useQuery({
    queryKey: [...anahtarlar.siparisBandi(siparis.id), 'taslak', taslak],
    queryFn: () => api.get<SiparisBandiCevabi>(`/plan/siparisler/${siparis.id}/bant?taslak=${String(taslak)}`),
    enabled: gorur && bantGorur && taslak !== null,
  });
  const acik = siparis.durum === 'taslak' || siparis.durum === 'onayli';
  const gecerli = sorgu.data?.gecerli ?? null;
  const bant = bantSorgu.data?.bant ?? null;
  const taslakBant = taslakBantSorgu.data?.bant ?? null;
  const fark = bant !== null && taslakBant !== null ? bantFarki(bant, taslakBant) : null;
  if (!gorur) return null;

  const kaydedildi = (id: number) => {
    taslakYaz(id);
    void istemci.invalidateQueries({ queryKey: anahtarlar.siparisBandi(siparis.id) });
  };

  return (
    <Kart
      baslik="Öncelik çarpanı"
      sag={sinir !== null && acik ? <Dugme simge="edit" onClick={() => formYaz(true)}>Çarpan ver</Dugme> : undefined}
    >
      {sorgu.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Çarpan alınamadı')} yenile={() => { void sorgu.refetch(); }} />
        : (
          <>
            {sorgu.isSuccess && (gecerli === null
              ? <p className="tc-sp-ipucu">Elle çarpan verilmedi; plan çarpanı 1 sayar.</p>
              : <p className="tc-sp-ipucu"><strong>{carpanMetni(gecerli.carpan)}</strong>{` ${gecerli.gerekce}`}</p>)}
            {taslak !== null && (
              <p className="tc-sp-ipucu" role="status">
                Yeni çarpan plan taslağında; taslak onaylanıp canlıya alınınca geçerli olur. <Link to="/recete-rota/studio">Plan stüdyosu</Link>
              </p>
            )}
            {fark !== null
              ? <p className="tc-sp-ipucu" role="status">{fark}</p>
              : bantSorgu.isSuccess && (bant === null
                ? <p className="tc-sp-ipucu">Planda bu siparişin emri yok; bant hesaplanmadı.</p>
                : <p className="tc-sp-ipucu">{`Bant: ${emirlerMetni(bant)}.`}</p>)}
            {(sorgu.data?.gecmis.length ?? 0) > 0 && (
              <Tablo
                etiket="Çarpan geçmişi"
                sutunlar={SUTUNLAR}
                satirlar={sorgu.data?.gecmis ?? []}
                satirAnahtari={(k) => `${k.zaman}-${k.kisiId}`}
              />
            )}
          </>
        )}
      {form && sinir !== null && <CarpanFormu siparis={siparis} sinir={sinir} kapat={() => formYaz(false)} kaydedildi={kaydedildi} />}
    </Kart>
  );
}

function carpanHatasi(metin: string): string | null {
  const t = metin.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return 'Çarpanı sayı olarak yazın.';
  const c = Number(t);
  if (c < ELLE_CARPAN.enAz || c > ELLE_CARPAN.enCok) return 'Çarpan 0,5-3 olmalı.';
  if (Math.round(c * 100) !== c * 100) return 'Çarpan en çok iki ondalık olmalı.';
  return null;
}

function CarpanFormu({ siparis, sinir, kapat, kaydedildi }: { siparis: SiparisAyrintisi; sinir: number; kapat: () => void; kaydedildi: (taslak: number) => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const gonder = useKorumaliGonderim();
  const [carpan, carpanYaz] = useState('');
  const [gerekce, gerekceYaz] = useState('');
  const [hatalar, hatalarYaz] = useState<{ carpan?: string; gerekce?: string }>({});
  const komut = useMutation({
    mutationFn: (govde: { carpan: number; gerekce: string }) =>
      gonder<PlanCevabi>(`/plan/siparisler/${siparis.id}/carpan`, { ...govde, taslak: null }),
    onSuccess: (cevap) => {
      bildir('tamam', 'Çarpan plan taslağına yazıldı; onaydan sonra geçerli olur.');
      if (cevap.taslak !== null) kaydedildi(cevap.taslak.id);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisCarpani(siparis.id) });
      kapat();
    },
  });
  const sayi = Number(carpan.trim().replace(',', '.'));
  const sinirUstu = carpanHatasi(carpan) === null && sayi > sinir;

  const ilet = (o: FormEvent) => {
    o.preventDefault();
    const yeni = {
      carpan: carpanHatasi(carpan) ?? undefined,
      gerekce: gerekce.trim() === '' ? 'Gerekçe yaz.' : undefined,
    };
    hatalarYaz(yeni);
    if (yeni.carpan || yeni.gerekce) return;
    komut.mutate({ carpan: sayi, gerekce: gerekce.trim() });
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Öncelik çarpanı ver"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <Girdi
          etiket="Çarpan" required inputMode="decimal" autoComplete="off" value={carpan}
          hata={hatalar.carpan}
          ipucu={sinirUstu ? `Planlama en çok ${sinir} verebilir; üstü müdür onayıyla girer.` : `${siparis.no} siparişinin gecikme bedelini çarpar; 1 etkisizdir.`}
          onChange={(e) => { carpanYaz(e.target.value); }}
        />
        <div className="tc-form-tam">
          <CokSatir etiket="Gerekçe" required value={gerekce} maxLength={500} hata={hatalar.gerekce} onChange={(e) => { gerekceYaz(e.target.value); }} />
        </div>
        {komut.isError && <p className="tc-form-tam tc-sp-hata" role="alert">{hataIletisi(komut.error, 'Çarpan kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
