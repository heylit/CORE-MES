import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { BeklemeNedeni, Bekletme, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, OnayPenceresi, Secim, Simge, useBildirim, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';

// 3050 a: emir neden ve zamanla bekletilir. Bekletme durum değil işarettir: emrin durumu, sayıları ve raporları değişmez; terminalde
// beklemedeki emrin adımı başlamaz. Bekletme ve kaldırma kendi eylemidir (3165 a).
export const BEKLETME_YETKISI = 'uretim-emirleri.beklet';
// Sözleşmedeki BEKLEME_NEDENI_ADLARI ile aynı sıra ve ad; istemci sözleşmeyi yalnız tip olarak ithal eder (zod pakete girmesin).
// Kayıt tipi eksik ya da fazla nedeni derlemede yakalar.
const BEKLEME_NEDENI_ADLARI = {
  malzeme: 'Malzeme bekleniyor', musteri: 'Müşteri onayı bekleniyor', fason: 'Fason dönüşü bekleniyor', kalite: 'Kalite kararı bekleniyor',
  takim: 'Takım ya da aparat bekleniyor', diger: 'Diğer',
} as const satisfies Record<BeklemeNedeni, string>;
const BEKLEME_NEDENLERI = Object.keys(BEKLEME_NEDENI_ADLARI) as BeklemeNedeni[];
const NEDEN_SECENEKLERI = BEKLEME_NEDENLERI.map((deger) => ({ deger, baslik: BEKLEME_NEDENI_ADLARI[deger] }));
export const beklemeNedeni = (b: Pick<Bekletme, 'neden'>): string => BEKLEME_NEDENI_ADLARI[b.neden];
const ACIK = new Set(['planli', 'basladi']);

export function useBekletmeYazar(): boolean {
  const oturum = useOturum();
  return ((oturum.data?.islemler ?? []) as readonly string[]).includes(BEKLETME_YETKISI);
}

function useBekletmeKomutu(emirId: number, bitti: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const m = useMutation({
    mutationFn: ({ yol, govde, istekKimligi }: { yol: 'beklet' | 'bekletme-kaldir'; govde: object; istekKimligi: string }) =>
      api.post<EmirAyrintiCevabi>(`/uretim-emirleri/${String(emirId)}/${yol}`, govde, { istekKimligi }),
    onSuccess: async (c, { yol }) => {
      istemci.setQueryData(anahtarlar.ayrinti(emirId), c);
      bildir('tamam', yol === 'beklet' ? 'Emir bekletildi.' : 'Emir devam ediyor.');
      bitti();
      // Liste, Adım Durumu ve terminal görünümü bekletmeyi okur.
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  return m;
}

// Beklemedeki emrin şeridi: neden, not, kim ve ne zaman; "Devam ettir" bekletmeyi kaldırır.
export function BeklemeSeridi({ emirId, bilgi }: { emirId: number; bilgi: Bekletme }) {
  const yazar = useBekletmeYazar();
  const komut = useBekletmeKomutu(emirId, () => undefined);
  return (
    <section className="tc-emir-bekleme" role="status" aria-label="Emir beklemede">
      <Simge ad="pause" />
      <div className="tc-emir-bekleme-metin">
        <b>Beklemede: {beklemeNedeni(bilgi)}</b>
        {bilgi.not && <span>{bilgi.not}</span>}
        <small>{bilgi.kisi.ad} · {zamanMetni(bilgi.zaman)} · Terminalde adım başlatılamaz.</small>
        {komut.isError && <small className="tc-emir-hurda">{hataIletisi(komut.error, 'Kaydedilemedi.')}</small>}
      </div>
      {yazar && (
        <Dugme tur="birincil" simge="play" yukleniyor={komut.isPending}
          onClick={() => { komut.mutate({ yol: 'bekletme-kaldir', govde: {}, istekKimligi: yeniIstekKimligi() }); }}>
          Devam ettir
        </Dugme>
      )}
    </section>
  );
}

// "İşlemler" menüsündeki "Beklet": yalnız açık ve beklemeyen emirde, emri düzenleyebilen kişide. Seçilen işlem adreste durur (?islem=beklet).
export function useBekletOgesi(emir: { durum: string; bekletme?: Bekletme | null } | undefined): MenuOgesi[] {
  const yazar = useBekletmeYazar();
  const [, yaz] = useSearchParams();
  if (!yazar || emir === undefined || !ACIK.has(emir.durum) || emir.bekletme) return [];
  return [{
    anahtar: 'beklet', baslik: 'Beklet', simge: 'pause',
    sec: () => { yaz((a) => { const n = new URLSearchParams(a); n.set('islem', 'beklet'); return n; }, { replace: true }); },
  }];
}

export function BekletPenceresi({ emirId, emirNo }: { emirId: number; emirNo: string }) {
  const [adres, yaz] = useSearchParams();
  const acik = adres.get('islem') === 'beklet';
  const [neden, setNeden] = useState<BeklemeNedeni | ''>('');
  const [not, setNot] = useState('');
  const [eksik, setEksik] = useState(false);
  const kapat = () => {
    yaz((a) => { const n = new URLSearchParams(a); n.delete('islem'); return n; }, { replace: true });
    setNeden(''); setNot(''); setEksik(false); komut.reset();
  };
  const komut = useBekletmeKomutu(emirId, kapat);
  const onayla = () => {
    if (neden === '') { setEksik(true); return; }
    const metin = not.trim();
    komut.mutate({ yol: 'beklet', govde: metin === '' ? { neden } : { neden, not: metin }, istekKimligi: yeniIstekKimligi() });
  };
  return (
    <OnayPenceresi acik={acik} baslik={`${emirNo} bekletilsin mi?`} onayMetni="Beklet" yukleniyor={komut.isPending} vazgec={kapat} onayla={onayla}>
      <p className="tc-emir-not">Emir beklemedeyken terminalde adım başlatılamaz; çalışan adım sürer. Emrin durumu ve sayıları değişmez. "Devam ettir" bekletmeyi kaldırır.</p>
      <Secim etiket="Neden" bosSecenek="Seçiniz" secenekler={NEDEN_SECENEKLERI} value={neden}
        hata={eksik && neden === '' ? 'Neden seçin.' : undefined}
        onChange={(e) => { setNeden(e.target.value as BeklemeNedeni | ''); }} />
      <CokSatir etiket="Not (isteğe bağlı)" maxLength={500} value={not} onChange={(e) => { setNot(e.target.value); }} />
      {komut.isError && <p className="tc-emir-hurda" role="alert">{hataIletisi(komut.error, 'Kaydedilemedi.')}</p>}
    </OnayPenceresi>
  );
}
