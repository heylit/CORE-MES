import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type {
  BirimlerCevabi, EmirOzetiCevabi, EmirSecimi, IsTanimiCevabi, MarkalaGovdesi, MarkalamaBirimi, MarkalamaTanimi, OnizlemeCevabi,
  OperasyonlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import {
  Dugme, DurumKutusu, Kart, KodOkuyucu, OnayPenceresi, Qr, Rozet, Secim, Tablo, useBildirim, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { BIRIM_DURUMLARI, DURUM_ADLARI, DURUM_TONLARI, YONTEM_ADLARI } from './adlar.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EmirArama, OperasyonListesi } from './IsSecimi.tsx';
import { IS_TANIMI_YOK_ILETISI } from './TerminalMarkalama.ts';
import { ModelPaneli } from './ModelPaneli.tsx';
import { yaziOlculeri } from './taslak.ts';
import './markalama.css';

const SON_SERI_SAYISI = 8;

const SUTUNLAR: readonly Sutun<MarkalamaBirimi>[] = [
  { anahtar: 'seri', baslik: 'Seri no', mono: true, hucre: (b) => b.seriNo },
  { anahtar: 'durum', baslik: 'Durum', hucre: (b) => <Rozet ton={DURUM_TONLARI[b.durum]}>{DURUM_ADLARI[b.durum]}</Rozet> },
  { anahtar: 'dogrulama', baslik: 'Doğrulama', hucre: (b) => (b.dogrulamaZamani === null ? null : <Rozet ton="tamam">Okundu</Rozet>) },
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (b) => zamanMetni(b.zaman) },
];

// Seçilen istasyon birimin kaydına girer (hangi tezgâhta markalandı). Seri yalnız markalama istasyonunda verilir (2036): istasyon seçilmeden gönderilmez.
function Calisma({ tanim, emirId, istasyonId, yazabilir }: {
  tanim: MarkalamaTanimi; emirId: number; istasyonId: number | null; yazabilir: boolean;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [son, sonYaz] = useState<MarkalamaBirimi | null>(null);
  // Hatalı markalama numarayı geri dönüşsüz yakar; tek dokunuşla gitmesin diye onay sorulur.
  const [hataliOnayi, hataliOnayiYaz] = useState(false);
  const onizleme = useQuery({
    queryKey: anahtarlar.onizleme(tanim.id, emirId),
    queryFn: () => api.get<OnizlemeCevabi>(`/markalama/tanimlar/${tanim.id}/onizleme?emirId=${emirId}`),
  });
  // Sayılar ve son seriler yalnız bu tanımın markalarıdır: aynı emirde başka operasyonun markası karışmasın.
  const ozet = useQuery({
    queryKey: anahtarlar.emirOzeti(emirId, tanim.id),
    queryFn: () => api.get<EmirOzetiCevabi>(`/markalama/emirler/${emirId}/ozet?tanimId=${tanim.id}`),
  });
  const birimler = useQuery({
    queryKey: anahtarlar.birimler(`emir:${emirId}:tanim:${tanim.id}`),
    queryFn: () => api.get<BirimlerCevabi>(`/markalama/birimler?emirId=${emirId}&tanimId=${tanim.id}`),
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });

  // Seri sunucuda sayaçtan doğar; ağ koparsa aynı istek kimliğiyle yeniden gönderilir, çift dokunuş tek istek gönderir:
  // ikinci numara yanmaz.
  const markala = useKorumaliKomut<MarkalaGovdesi['sonuc'], MarkalamaBirimi>({
    gonder: (sonuc, deneme) => {
      const govde: MarkalaGovdesi = { tanimId: tanim.id, uretimEmriId: emirId, istasyonId, sonuc };
      return api.post<MarkalamaBirimi>('/markalama/birimler/markala', govde, deneme);
    },
    onSettled: () => hataliOnayiYaz(false),
    onSuccess: async (b) => {
      sonYaz(b);
      bildir(b.durum === 'hurda' ? 'bilgi' : 'tamam', b.durum === 'hurda' ? `${b.seriNo} hatalı, hurdaya ayrıldı` : `${b.seriNo} markalandı`);
      await yenile();
    },
  });
  const dogrula = useMutation({
    mutationFn: (seriNo: string) => api.post<MarkalamaBirimi>('/markalama/birimler/dogrula', { tanimId: tanim.id, seriNo }),
    onSuccess: async (b) => {
      sonYaz(b);
      bildir('tamam', `${b.seriNo} doğrulandı`);
      await yenile();
    },
  });

  const siradaki = onizleme.data?.numaralar[0] ?? null;
  const istasyonBekliyor = istasyonId === null;
  const kodVar = tanim.alanlar.some((a) => a.kodTuru !== 'yok');
  const beklenen = tanim.dogrulama && son !== null && son.durum !== 'hurda' && son.dogrulamaZamani === null ? son : null;
  const sahneMarkalari = tanim.alanlar.flatMap((a, i) => (a.yer === null ? [] : [{
    sira: i, yer: a.yer, metin: a.icerik === 'sabit' ? a.sabitMetin ?? '' : siradaki ?? tanim.seriSablonu,
  }]));

  return (
    <div className="tc-mrk-istasyon">
      <Kart baslik="Sıradaki seri" simge="tag">
        <div className="tc-mrk-siradaki">
          {kodVar && siradaki !== null && <Qr metin={siradaki} boyut={120} />}
          <div className="tc-mrk-siradaki-yazi">
            <span className="tc-mrk-buyuk mono" aria-live="polite">{onizleme.isPending ? '…' : siradaki ?? '—'}</span>
            <span className="tc-mrk-ipucu">Numara, Markalandı'ya basınca sunucuda verilir; ekranda görünen öngörüdür.</span>
          </div>
        </div>
        <ol className="tc-mrk-markalar">
          {tanim.alanlar.map((a, i) => (
            <li key={i} className="tc-mrk-marka">
              <span className="tc-mrk-sira">{i + 1}</span>
              <span>{a.ad}</span>
              <span className="tc-mrk-ipucu">{[YONTEM_ADLARI[a.yontem], ...yaziOlculeri(a), a.program, a.yuzey].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ol>
        {yazabilir ? (
          <div className="tc-mrk-eylemler">
            <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={markala.isPending && markala.variables === 'iyi'} disabled={markala.isPending || istasyonBekliyor} onClick={() => markala.mutate('iyi')}>
              Markalandı
            </Dugme>
            <Dugme tur="tehlike" boyut="ana" simge="alert" yukleniyor={markala.isPending && markala.variables === 'hatali'} disabled={markala.isPending || istasyonBekliyor} onClick={() => hataliOnayiYaz(true)}>
              Hatalı markalama
            </Dugme>
          </div>
        ) : <p className="tc-mrk-ipucu">Seri vermek için markalama yetkisi gerekir.</p>}
        {yazabilir && istasyonBekliyor && <p className="tc-mrk-ipucu">Seri vermek için markalama istasyonunu seçin.</p>}
        <OnayPenceresi
          acik={hataliOnayi} baslik="Hatalı markalama" onayMetni="Numarayı yak" tehlikeli
          yukleniyor={markala.isPending && markala.variables === 'hatali'}
          onayla={() => markala.mutate('hatali')} vazgec={() => hataliOnayiYaz(false)}
        >
          <p>Sıradaki numara yanar ve birim hurdaya ayrılır. Bu numara yeniden verilmez.</p>
        </OnayPenceresi>
        {markala.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(markala.error, 'Seri verilemedi')}</p>}
        {yazabilir && tanim.dogrulama && (
          <div className="tc-mrk-dogrula">
            <h3 className="tc-mrk-bolum">{beklenen ? <>Doğrula: <span className="mono">{beklenen.seriNo}</span></> : 'Markayı okutup doğrula'}</h3>
            <KodOkuyucu sik okundu={(kod) => dogrula.mutate(kod)} bekliyor={dogrula.isPending} ipucu="Markalanan parçadaki kodu okutun" dokunmatikteOdakYok />
            {dogrula.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(dogrula.error, 'Doğrulanamadı')}</p>}
          </div>
        )}
      </Kart>
      <Kart baslik="Bu emirde, bu operasyonda" simge="chart">
        {ozet.data ? (
          <div className="tc-mrk-sayilar">
            {BIRIM_DURUMLARI.map((d) => (
              <div key={d} className="tc-mrk-sayi"><Rozet ton={DURUM_TONLARI[d]}>{DURUM_ADLARI[d]}</Rozet><b>{ozet.data.sayilar[d]}</b></div>
            ))}
            <div className="tc-mrk-sayi"><Rozet ton="bilgi">Doğrulanan</Rozet><b>{ozet.data.dogrulanan}</b></div>
          </div>
        ) : <DurumKutusu durum={ozet.isError ? 'hata' : 'yukleniyor'} />}
        <Tablo
          etiket="Son seriler"
          sutunlar={SUTUNLAR}
          satirlar={(birimler.data?.birimler ?? []).slice(0, SON_SERI_SAYISI)}
          satirAnahtari={(b) => b.id}
          bosMesaj="Bu emirde henüz markalı parça yok"
        />
      </Kart>
      <Kart baslik="Markalama yeri" simge="cube">
        <ModelPaneli malzemeId={tanim.malzemeId} model={tanim.model} markalar={sahneMarkalari} secili={null} />
      </Kart>
    </div>
  );
}

const ISTASYON_ANAHTARI = 'markalama.terminal.istasyon';
// İstasyon cihaza bağlıdır: lazerin yanındaki bilgisayar her açılışta aynı istasyonu sorar olmasın. Saklama kapalıysa her açılışta seçilir.
function kayitliIstasyon(): number | null {
  try { const v = window.localStorage.getItem(ISTASYON_ANAHTARI); return v === null ? null : Number(v) || null; } catch { return null; }
}
function istasyonuSakla(id: number | null): void {
  try { if (id === null) window.localStorage.removeItem(ISTASYON_ANAHTARI); else window.localStorage.setItem(ISTASYON_ANAHTARI, String(id)); } catch { /* saklama kapalı */ }
}


// 3788: markalama terminali emirden başlar. Emir okutulur; emrin markalama istasyonundaki adımı tekse kendiliğinden seçilir, tanımı
// sunucu emre özel, emrin teknik resim revizyonu ve revizyonsuz genel sırasıyla bulur. Seri verilemeyen durum nedeniyle yazılır.
function EmirIsi({ emir, istasyonId, yazabilir, tanimYazabilir }: { emir: EmirSecimi; istasyonId: number | null; yazabilir: boolean; tanimYazabilir: boolean }) {
  const [opNo, opNoYaz] = useState<number | null>(null);
  const ops = useQuery({
    queryKey: anahtarlar.emirOperasyonlari(emir.id),
    queryFn: () => api.get<OperasyonlarCevabi>(`/markalama/emirler/${emir.id}/operasyonlar`),
  });
  const markalamadakiler = (ops.data?.operasyonlar ?? []).filter((o) => o.markalama === true);
  const [tekOp] = markalamadakiler;
  const seciliOp = opNo ?? (markalamadakiler.length === 1 && tekOp !== undefined ? tekOp.opNo : null);
  const is = useQuery({
    queryKey: anahtarlar.isTanimi(emir.id, seciliOp ?? 0),
    queryFn: () => api.get<IsTanimiCevabi>(`/markalama/emirler/${emir.id}/tanim?opNo=${seciliOp ?? 0}`),
    enabled: seciliOp !== null,
  });
  const op = ops.data?.operasyonlar.find((o) => o.opNo === seciliOp);
  return (
    <>
      <Kart baslik={`${emir.emirNo} · ${emir.malzemeKodu ?? `#${emir.malzemeId}`}`} simge="tag"
        sag={emir.cizimRevizyonKodu === null ? undefined : <Rozet ton="bilgi">Teknik resim Rev {emir.cizimRevizyonKodu}</Rozet>}
      >
        {ops.isPending && <p className="tc-mrk-ipucu">Emrin adımları okunuyor…</p>}
        {ops.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(ops.error, 'Emrin adımları okunamadı')}</p>}
        {ops.data && markalamadakiler.length === 0 && (
          <p className="tc-mrk-uyari" role="alert">Bu emirde markalama istasyonuna giden adım yok. Doğru emri okuttuğunuzu denetleyin ya da adımı aşağıdan seçin.</p>
        )}
        {ops.data && (markalamadakiler.length !== 1 || opNo !== null) && (
          <OperasyonListesi kaynak={{ emirId: emir.id }} secili={seciliOp} sec={(o) => opNoYaz(o.opNo)} adimsizNotu={false} />
        )}
        {op !== undefined && <p className="tc-mrk-ipucu"><b className="mono">OP{op.opNo}</b> {op.ad}{op.istasyonKodu === null ? '' : ` · ${op.istasyonKodu}`}</p>}
        {is.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(is.error, 'Markalama tanımı okunamadı')}</p>}
        {is.data && is.data.durum !== 'bulundu' && (
          <p className="tc-mrk-uyari" role="alert">
            {IS_TANIMI_YOK_ILETISI[is.data.durum]}{tanimYazabilir && <> <Link to="/markalama">Tanım yaz</Link></>}
          </p>
        )}
        {is.data?.tanim && is.data.tanim.uretimEmriId !== null && <p className="tc-mrk-ipucu">Bu emre özel tanım kullanılıyor.</p>}
      </Kart>
      {is.data?.tanim && seciliOp !== null && (
        <Calisma key={`${is.data.tanim.id}:${emir.id}`} tanim={is.data.tanim} emirId={emir.id} istasyonId={istasyonId} yazabilir={yazabilir} />
      )}
    </>
  );
}

export function Istasyon() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('markalama.seri-ver') === true;
  const tanimYazabilir = oturum.data?.islemler.includes('markalama.tanim-yaz') === true;
  const [emir, emirYaz] = useState<EmirSecimi | null>(null);
  const [istasyonId, istasyonIdYaz] = useState<number | null>(kayitliIstasyon);
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonlar, queryFn: () => api.get<IstasyonSecimiCevabi>('/istasyonlar/secim') });
  const istasyonSecenekleri = (istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.filter((i) => i.aktif && i.tip === 'markalama').map((i) => ({
    deger: String(i.id), baslik: `${g.isMerkeziAd} · ${i.ad}`,
  })));
  // Saklanan istasyon artık markalama istasyonu değilse (pasif ya da tipi değişti) seçili sayılmaz.
  const gecerliIstasyon = istasyonlar.data === undefined || istasyonSecenekleri.some((o) => o.deger === String(istasyonId)) ? istasyonId : null;
  return (
    <div className="tc-mrk-sayfa">
      <Kart baslik="Markalama terminali" simge="scan">
        {emir === null
          ? <EmirArama etiket="Emri ya da refakat kartını okut" sec={emirYaz} />
          : <Dugme simge="x" boyut="ana" onClick={() => emirYaz(null)}>Başka emir</Dugme>}
        <div className="tc-mrk-satir">
          <Secim
            etiket="Bu cihazın istasyonu"
            secenekler={istasyonSecenekleri}
            bosSecenek={istasyonlar.isPending ? 'İstasyonlar okunuyor' : istasyonSecenekleri.length === 0 ? 'Markalama istasyonu yok' : 'Seçin'}
            value={gecerliIstasyon === null ? '' : String(gecerliIstasyon)}
            onChange={(o) => { const id = o.target.value === '' ? null : Number(o.target.value); istasyonIdYaz(id); istasyonuSakla(id); }}
          />
        </div>
        {istasyonlar.isError && <p className="tc-mrk-hata" role="alert">{hataIletisi(istasyonlar.error, 'İstasyonlar okunamadı')}</p>}
      </Kart>
      {emir !== null && <EmirIsi key={emir.id} emir={emir} istasyonId={gecerliIstasyon} yazabilir={yazabilir} tanimYazabilir={tanimYazabilir} />}
    </div>
  );
}
