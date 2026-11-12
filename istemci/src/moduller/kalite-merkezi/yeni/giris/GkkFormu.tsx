import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmGirisCevabi, KmGirisGkkGovdesi, KmGirisKaydi, KmGirisKararGovdesi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, OnayPenceresi, Rozet, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { YOK, zamanKisa } from '../bicim.ts';
import { siradakiNo, yeniKimlik } from '../veri.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import { DURUM_ADI, DURUM_TONU, GIRIS_KAYITLARI_ANAHTARI, KARAR_ADI, girisKaydiAnahtari, miktarMetni, sonucMetni } from './ortak.ts';

type Karar = KmGirisKararGovdesi['karar'];
type Ciddiyet = KmGirisKararGovdesi['ciddiyet'];

const KARARLAR: { deger: Karar; baslik: string }[] = [
  { deger: 'red', baslik: 'Red (tedarikçiye iade)' }, { deger: 'kabul', baslik: 'Kabul (olduğu gibi)' }, { deger: 'sartli_kabul', baslik: 'Şartlı kabul' },
];
const KARAR_SONUCU: Record<Karar, string> = { kabul: 'kabul edildi', sartli_kabul: 'şartlı kabul edildi', red: 'tedarikçiye iade edildi' };
// Sözleşmedeki KM_CIDDIYETLER ile aynı sıra; istemci paylaşılanı yalnız tip olarak ithal eder (zod istemci paketine girmesin).
const CIDDIYETLER: readonly Ciddiyet[] = ['Kritik', 'Majör', 'Minör'];
const MIKTAR = /^\d+(?:[.,]\d{1,3})?$/;
const sade = (m: string): string => m.trim().replace(',', '.');
const sayiMi = (m: string): boolean => MIKTAR.test(m.trim());
// Binde birlik toplam: kayan nokta toplamı 0,1 + 0,2 gibi değerlerde lot miktarını tutturamaz.
const binde = (m: string): number => Math.round(Number(sade(m)) * 1000);

interface Ozellikler {
  id: number;
  ncrler: readonly { no?: unknown }[];
  // Ölçümlü muayene yalnız muayene yazabilen kişide açılır; GKK kaydına bağlanmaz, yalnız alanları dolu gelir.
  muayeneAc: ((k: KmGirisKaydi) => void) | null;
  kapat: () => void;
}

// 3117: GKK mal kabul satırına bağlı tam formdur. GKK (kabul, hatalı, not) ve hatalının kararı (NCR açar) birer kezdir, tekrar
// korumalıdır ve sunucuda denetlenir; kapanan kayıt aynı formda salt okunur açılır. Bir kez kuralına takılan (başkası ya da Üretim
// Terminali önce yazdı) gönderim formu yeniler.
export function GkkFormu({ id, ncrler, muayeneAc, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const anahtar = girisKaydiAnahtari(id);
  const kayit = useQuery({ queryKey: anahtar, queryFn: () => api.get<KmGirisCevabi>(`/kalite-merkezi/giris/${String(id)}`) });
  const [kabul, kabulYaz] = useState<string | null>(null);
  const [hatali, hataliYaz] = useState('0');
  const [gkkNotu, gkkNotuYaz] = useState('');
  const [onay, onayYaz] = useState(false);
  // 2754 a/a: karar seçimsiz açılır; seçilmeden yazılmaz (yanlış varsayılan dalgınlıkla onaylanmasın).
  const [karar, kararYaz] = useState<Karar | ''>('');
  const [kararEksik, kararEksikYaz] = useState(false);
  const [ciddiyet, ciddiyetYaz] = useState<Ciddiyet>('Majör');
  const [gerekce, gerekceYaz] = useState('');

  const yenile = () => {
    void istemci.invalidateQueries({ queryKey: GIRIS_ANAHTARI });
    void istemci.invalidateQueries({ queryKey: GIRIS_KAYITLARI_ANAHTARI });
  };
  const cevapla = (c: KmGirisCevabi) => { istemci.setQueryData<KmGirisCevabi>(anahtar, c); yenile(); };
  const hata = (h: unknown, varsayilan: string) => {
    if (h instanceof ApiHatasi && h.durum === 409) {
      bildir('hata', 'Bu GKK az önce yazıldı; form yenilendi.');
      void istemci.invalidateQueries({ queryKey: anahtar });
      yenile();
      return;
    }
    bildir('hata', hataIletisi(h, varsayilan));
  };
  const gonder = <G,>(yol: string, govde: G) => tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(
    yol, govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
  ));
  const gkk = useMutation({
    mutationFn: (g: KmGirisGkkGovdesi) => gonder(`/kalite-merkezi/giris/${String(id)}/gkk`, g),
    onSuccess: (c) => {
      onayYaz(false);
      bildir('tamam', `${c.kayit.malKabulNo}: ${miktarMetni(c.kayit.kabulMiktar)} kabul, ${miktarMetni(c.kayit.hataliMiktar)} hatalı`);
      cevapla(c);
    },
    onError: (h) => { onayYaz(false); hata(h, 'Giriş kontrolü yazılamadı.'); },
  });
  const kararVer = useMutation({
    mutationFn: (g: KmGirisKararGovdesi) => gonder(`/kalite-merkezi/giris/${String(id)}/karar`, g),
    onSuccess: (c, g) => {
      bildir('tamam', `${c.kayit.malKabulNo}: ${miktarMetni(c.kayit.hataliMiktar)} hatalı ${KARAR_SONUCU[g.karar]}, ${g.ncrNo} açıldı`);
      cevapla(c);
    },
    onError: (h) => { hata(h, 'Karar verilemedi.'); },
  });

  if (kayit.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kayit.isError) return <DurumKutusu durum="hata" hata={kayit.error} yenile={() => { void kayit.refetch(); }} />;
  const k = kayit.data.kayit;
  const lotMiktari = miktarMetni(k.miktar);
  const bekliyor = gkk.isPending || kararVer.isPending;
  // Kabul, kişi kendisi yazana kadar lot miktarından hatalıyı düşen kalandır.
  const otomatikKabul = sayiMi(hatali) && kabul === null ? miktarMetni(String(Math.max(0, binde(k.miktar) - binde(hatali)) / 1000)) : (kabul ?? lotMiktari);
  const toplamTutmuyor = sayiMi(otomatikKabul) && sayiMi(hatali) && binde(otomatikKabul) + binde(hatali) !== binde(k.miktar);
  const gkkKaydet = () => {
    if (!sayiMi(otomatikKabul) || !sayiMi(hatali)) { bildir('hata', 'Kabul ve hatalı miktarı sayı olmalı.'); return; }
    if (binde(otomatikKabul) + binde(hatali) !== binde(k.miktar)) { bildir('hata', `Kabul ve hatalı toplamı lot miktarına (${lotMiktari}) eşit olmalı.`); return; }
    onayYaz(true);
  };
  const kararYazdir = () => {
    if (karar === '') { kararEksikYaz(true); return; }
    const n = gerekce.trim() || null;
    if (karar === 'sartli_kabul' && n === null) { bildir('hata', 'Şartlı kabulde şart yazılır.'); return; }
    kararVer.mutate({ karar, ciddiyet, not: n, ncrKimlik: yeniKimlik('ncr'), ncrNo: siradakiNo(ncrler, 'NCR') });
  };

  return (
    <div className="tc-km-gkk-form">
      <div className="tc-km-gkk-form-ust">
        <Dugme tur="ikincil" simge="chev-left" onClick={kapat}>Listeye dön</Dugme>
        <Rozet ton={DURUM_TONU[k.durum]}>{DURUM_ADI[k.durum]}</Rozet>
      </div>
      <Kart baslik={`${k.malKabulNo} · ${k.malzemeKod ?? `#${String(k.malzemeId)}`}`} simge="box">
        <dl className="tc-km-gkk-bilgi">
          <div><dt>Malzeme</dt><dd>{k.malzemeAd ?? YOK}</dd></div>
          <div><dt>Lot</dt><dd className="tc-km-gkk-mono">{k.partiEtiketi ?? YOK}</dd></div>
          <div><dt>Miktar</dt><dd>{lotMiktari} {k.birim ?? ''}</dd></div>
          <div><dt>Tedarikçi</dt><dd>{k.tedarikciAdi ?? YOK}</dd></div>
          <div><dt>Sipariş</dt><dd className="tc-km-gkk-mono">{k.siparisNo ?? YOK}</dd></div>
          <div><dt>Mal kabul</dt><dd>{zamanKisa(k.zaman)}</dd></div>
        </dl>
      </Kart>

      <Kart baslik="Belge kontrolü" simge="file">
        {k.sertifikaVar
          ? <p className="tc-km-gkk-satir"><Rozet ton="tamam">Sertifika var</Rozet> Lotun sertifikası mal kabulde eklenmiş.</p>
          : <p className="tc-km-gkk-satir"><Rozet ton="uyari">Sertifika yok</Rozet> Sertifika eklenmemiş; GKK yine yazılabilir.</p>}
        {muayeneAc && (
          <div className="tc-km-gkk-satir">
            <Dugme tur="ikincil" simge="ruler" onClick={() => { muayeneAc(k); }}>Ölçümlü giriş muayenesi aç</Dugme>
            <small className="tc-km-gkk-soluk">Parça, lot, tedarikçi ve miktar dolu gelir; muayene GKK'yı kapatmaz.</small>
          </div>
        )}
      </Kart>

      <Kart baslik="Sonuç" simge="clipboard-check">
        {k.durum === 'gkk_bekliyor'
          ? (
            <div className="tc-km-gkk-alanlar">
              <Girdi
                etiket="Hatalı" inputMode="decimal" value={hatali} onChange={(e) => { hataliYaz(e.target.value); }}
                ipucu="Hatalı adet karantinada kalır ve kalite kararını bekler."
              />
              <Girdi
                etiket="Kabul" inputMode="decimal" value={otomatikKabul} onChange={(e) => { kabulYaz(e.target.value); }}
                hata={toplamTutmuyor ? `Kabul ve hatalı toplamı lot miktarı (${lotMiktari}) olmalı.` : undefined}
                ipucu="Kabul serbest olur ve mal kabul alanına geçer."
              />
              <CokSatir etiket="Not" value={gkkNotu} maxLength={500} onChange={(e) => { gkkNotuYaz(e.target.value); }} />
              <div className="tc-km-gkk-eylem">
                <Dugme tur="birincil" simge="check" disabled={bekliyor} yukleniyor={gkk.isPending} onClick={gkkKaydet}>GKK'yı kaydet</Dugme>
              </div>
            </div>
          )
          : (
            <dl className="tc-km-gkk-bilgi">
              <div><dt>Kabul</dt><dd>{miktarMetni(k.kabulMiktar)} {k.birim ?? ''}</dd></div>
              <div><dt>Hatalı</dt><dd>{miktarMetni(k.hataliMiktar)} {k.birim ?? ''}</dd></div>
              <div><dt>GKK</dt><dd>{k.gkkKisiAd ?? YOK}, {zamanKisa(k.gkkZaman)}</dd></div>
              {k.karar === null && k.not && <div><dt>Not</dt><dd>{k.not}</dd></div>}
            </dl>
          )}
      </Kart>

      {k.durum === 'karar_bekliyor' && (
        <Kart baslik="Hatalı için kalite kararı" simge="alert">
          <div className="tc-km-gkk-alanlar">
            <p className="tc-km-gkk-soluk">
              {miktarMetni(k.hataliMiktar)} {k.birim ?? ''} hatalı. Karar geri alınamaz; aynı işlemde NCR açılır. Şimdi ya da sonra
              (Karar bekleyen sekmesinden) verilebilir.
            </p>
            <Secim
              etiket="Karar" value={karar} required bosSecenek="Seçiniz" hata={kararEksik && karar === '' ? 'Karar seçin.' : undefined}
              onChange={(e) => { kararYaz(e.target.value as Karar | ''); }} secenekler={KARARLAR}
            />
            <Secim etiket="Ciddiyet" value={ciddiyet} onChange={(e) => { ciddiyetYaz(e.target.value as Ciddiyet); }} secenekler={CIDDIYETLER.map((c) => ({ deger: c, baslik: c }))} />
            <CokSatir
              etiket={karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'} value={gerekce} maxLength={500} required={karar === 'sartli_kabul'}
              onChange={(e) => { gerekceYaz(e.target.value); }}
            />
            {karar === 'red' && <p className="tc-km-gkk-soluk">Red, hatalı miktarı tedarikçiye iade çıkışıyla stoktan düşer.</p>}
            <div className="tc-km-gkk-eylem">
              <Dugme tur={karar === 'red' ? 'tehlike' : 'birincil'} disabled={bekliyor} yukleniyor={kararVer.isPending} onClick={kararYazdir}>Kararı yaz</Dugme>
            </div>
          </div>
        </Kart>
      )}

      {k.durum === 'kapandi' && k.karar !== null && (
        <Kart baslik="Kalite kararı" simge="alert">
          <dl className="tc-km-gkk-bilgi">
            <div><dt>Karar</dt><dd>{KARAR_ADI[k.karar]}</dd></div>
            <div><dt>NCR</dt><dd className="tc-km-gkk-mono">{k.ncrNo ?? YOK}</dd></div>
            <div><dt>Veren</dt><dd>{k.kararKisiAd ?? YOK}, {zamanKisa(k.kararZaman)}</dd></div>
            {k.not && <div><dt>{k.karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'}</dt><dd>{k.not}</dd></div>}
          </dl>
        </Kart>
      )}
      {k.durum === 'kapandi' && <p className="tc-km-gkk-soluk">Sonuç: {sonucMetni(k)}</p>}

      <OnayPenceresi
        acik={onay} baslik="GKK'yı kaydet" onayMetni="Kaydet" yukleniyor={gkk.isPending}
        onayla={() => { gkk.mutate({ kabul: sade(otomatikKabul), hatali: sade(hatali), not: gkkNotu.trim() || null }); }}
        vazgec={() => { onayYaz(false); }}
      >
        <p>{k.malKabulNo}, lot {k.partiEtiketi ?? YOK}: {miktarMetni(otomatikKabul)} kabul, {miktarMetni(hatali)} hatalı. GKK bir kez yazılır, geri alınmaz.</p>
      </OnayPenceresi>
    </div>
  );
}
