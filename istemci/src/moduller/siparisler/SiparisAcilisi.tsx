import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiparisAcilisiCevabi, SiparisAcilisiSatiri, SiparisAcilisiSonucu, SiparisAcilisiUyarisi } from '#paylasilan/sozlesme/siparis-acilisi.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { EMIR_DURUMU } from '#paylasilan/sozlesme/emir-durumu.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gorunum.ts';
import { surumCakismasiMi, yazmaIletisi } from './yazma.ts';

// 3272: onaylanan siparişin projesi ve her kalem partisinin emri kendiliğinden açılır. Bilgi Üretim Emirleri'nin cevabıdır; onay penceresi
// açılacakları, "Proje ve emirler" kartı açılmışları gösterir. Proje no sınırı Projeler sözleşmesindeki PROJE_KODU_EN_COK'tur.
const PROJE_KODU_EN_COK = 24;
const ATLAMA_METNI: Record<NonNullable<SiparisAcilisiSatiri['atlama']>, string> = {
  uretilmez: 'Üretilmez, emir açılmaz',
  'tam-sayi-degil': 'Adet tam sayı değil, emir açılmaz',
  stoktan: 'Stoktan karşılanır, emir açılmaz',
  'satin-alinir': 'Satın alınır, emir açılmaz',
};

export const useSiparisAcilisi = (siparisId: number, acik = true) => useQuery({
  queryKey: anahtarlar.siparisAcilisi(siparisId),
  queryFn: () => api.get<SiparisAcilisiCevabi>(`/uretim-emirleri/siparis-acilisi/${String(siparisId)}`),
  enabled: acik,
});

// Uzun emir numarası baştan kısaltılır: ayırt eden parça (malzeme, yıl, sıra) sondadır.
export const kisaEmirNo = (no: string, en = 22): string => (no.length <= en ? no : `…${no.slice(no.length - en + 1)}`);

const malzemeMetni = (s: SiparisAcilisiSatiri): string => [s.malzemeKodu ?? `Kart ${String(s.malzemeNo)}`, s.malzemeAdi].filter(Boolean).join(' · ');

function RotaRozeti({ s }: { s: SiparisAcilisiSatiri }) {
  if (s.atlama !== null) return <Rozet ton="pasif" gorunum="cizgi">{ATLAMA_METNI[s.atlama]}</Rozet>;
  if (s.emir?.rotaBekliyor === true || (s.emir === null && s.rota === null)) return <Rozet ton="uyari">Rota bekliyor</Rozet>;
  if (s.emir !== null) return <Rozet ton={EMIR_DURUMU[s.emir.durum].ton}>{EMIR_DURUMU[s.emir.durum].etiket}</Rozet>;
  // 3296-3 a: partide seçilen rota "elle"; seçilen rota yürürlükte değilse türün rotası gelir ve bu söylenir. 3411 a: türün yürürlükte
  // rotası yoksa Seri gelir ve bu da söylenir.
  const ek = s.rota!.elle === true ? ' · elle' : s.rota!.elleDustu === true ? ' · seçilen rota yürürlükte değil, türün rotası'
    : s.rota!.seriyeDustu === true ? ` · ${EMIR_TURU_ADLARI[s.emirTuru]} türünün yürürlükte rotası yok` : '';
  return <Rozet ton={s.rota!.elleDustu === true || s.rota!.seriyeDustu === true ? 'uyari' : 'tamam'}>{`${s.rota!.ad} · Rev ${s.rota!.harf}${ek}`}</Rozet>;
}

const sutunlar = (emirli: boolean): Sutun<SiparisAcilisiSatiri>[] => [
  ...(emirli ? [{ anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (s: SiparisAcilisiSatiri) => (s.emir === null ? '—' : <span title={s.emir.no}>{kisaEmirNo(s.emir.no)}</span>) }] : []),
  { anahtar: 'kalem', baslik: 'Kalem', mono: true, kirilmaz: true, hucre: (s) => s.kalemSira },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: malzemeMetni },
  { anahtar: 'tur', baslik: 'Tür', hucre: (s) => EMIR_TURU_ADLARI[s.emirTuru] },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', kirilmaz: true, hucre: (s) => (s.adet === null ? '—' : s.adet) },
  { anahtar: 'teslim', baslik: 'Teslim', mono: true, kirilmaz: true, hucre: (s) => (s.teslim === null ? '—' : tarihMetni(s.teslim)) },
  { anahtar: 'durum', baslik: emirli ? 'Durum' : 'Rota', kartTamSatir: true, hucre: (s) => <RotaRozeti s={s} /> },
];

export function AcilisTablosu({ satirlar, emirli }: { satirlar: readonly SiparisAcilisiSatiri[]; emirli: boolean }) {
  return (
    <Tablo
      etiket={emirli ? 'Siparişin emirleri' : 'Onaylayınca açılacak emirler'}
      sutunlar={sutunlar(emirli)}
      satirlar={[...satirlar]}
      satirAnahtari={(s) => `${String(s.kalemId)}-${String(s.partiId ?? 0)}`}
      bosMesaj="Kalem yok."
    />
  );
}

const acilacaklar = (c: SiparisAcilisiCevabi) => c.satirlar.filter((s) => s.atlama === null && s.emir === null);

// 3272 B: onay penceresi açılacak projeyi ve emirleri gösterir; proje no burada değişir. Yetki eksikse onay reddedilir (3272-1 b):
// pencere eksik yetkiyi söyler, düğme pasiftir. Bilgi alınamazsa onay yine gönderilir; kuralı sunucu uygular. Proje ve emirler onayla aynı işlemde açılır; biri açılamazsa onay da yazılmaz.
export function SiparisOnayPenceresi({ siparis, kapat }: { siparis: SiparisAyrintisi; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const acilis = useSiparisAcilisi(siparis.id);
  const [kod, kodYaz] = useState<string | null>(null);
  const c = acilis.data;
  const yeniProje = c !== undefined && c.acik && c.proje.id === null;
  const gonder = useMutation({
    mutationFn: () => api.post<SiparisAyrintisi>(`/siparisler/${String(siparis.id)}/onayla`, {
      surum: siparis.surum, ...(yeniProje && kod !== null && kod.trim() !== '' ? { projeKodu: kod.trim() } : {}),
    }),
    onSuccess: (cevap) => {
      istemci.setQueryData(anahtarlar.siparis(siparis.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisAcilisi(siparis.id) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisProjeleri(siparis.id) });
      bildir('tamam', c?.acik === true ? 'Sipariş onaylandı; proje ve emirler açıldı.' : 'Sipariş onaylandı.');
      kapat();
    },
    onError: (h) => { if (surumCakismasiMi(h)) void istemci.invalidateQueries({ queryKey: anahtarlar.siparis(siparis.id) }); },
  });
  const sayi = c === undefined ? 0 : acilacaklar(c).length;
  const bekleyen = c === undefined ? [] : acilacaklar(c).filter((s) => s.rota === null);
  const seriye = c === undefined ? 0 : acilacaklar(c).filter((s) => s.rota?.seriyeDustu === true).length;
  const eksik = c !== undefined && c.acik && c.eksikIslemler.length > 0;
  const onayMetni = c === undefined || !c.acik ? 'Onayla' : `Onayla${yeniProje ? ', proje' : ''}${sayi > 0 ? ` ve ${String(sayi)} emri` : ''}${yeniProje || sayi > 0 ? ' aç' : ''}`;

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Siparişi onayla"
      tur={c?.acik === true ? 'yan' : 'orta'}
      genis={c?.acik === true}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={gonder.isPending} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={acilis.isPending || eksik} yukleniyor={gonder.isPending} onClick={() => { gonder.mutate(); }}>{onayMetni}</Dugme>
        </>
      )}
    >
      <div className="tc-sp-yigin">
        <p>{`${siparis.no}: Onaylanınca satırlar ve tutarlar değişmez.`}</p>
        {acilis.isPending && <DurumKutusu durum="yukleniyor" />}
        {acilis.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(acilis.error, 'Açılacak proje ve emirler alınamadı')} yenile={() => { void acilis.refetch(); }} />}
        {c !== undefined && c.acik && (
          <>
            <div className="tc-sp-acilis-ozet">
              <Rozet ton="bilgi">{yeniProje ? '1 proje açılır' : `Proje ${c.proje.kod}`}</Rozet>
              <Rozet ton="tamam">{`${String(sayi - bekleyen.length)} emir dolu`}</Rozet>
              {bekleyen.length > 0 && <Rozet ton="uyari">{`${String(bekleyen.length)} emir rota bekliyor`}</Rozet>}
              {seriye > 0 && <Rozet ton="uyari">{`${String(seriye)} emir Seri rotasıyla açılır`}</Rozet>}
            </div>
            {yeniProje && (
              <div className="tc-form">
                <Girdi
                  etiket="Proje no" required className="tc-sp-mono" value={kod ?? c.proje.kod} maxLength={PROJE_KODU_EN_COK}
                  ipucu="Emir numarasına girer; açıldıktan sonra değişmez. Harf (A-Z), rakam, nokta ve alt çizgi."
                  onChange={(e) => { kodYaz(e.target.value.toUpperCase()); }}
                />
                <div className="tc-sp-acilis-ad">
                  <span className="tc-sp-soluk">Proje adı</span>
                  <b>{c.proje.ad}</b>
                  <span className="tc-sp-soluk">{c.proje.bitis === null ? 'Bitiş boş.' : `Bitiş sipariş terminine bağlı: ${tarihMetni(c.proje.bitis)}.`}</span>
                </div>
              </div>
            )}
            {bekleyen.length > 0 && (
              <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status">
                <strong>Rota bekliyor</strong>
                {`${[...new Set(bekleyen.map((s) => s.malzemeKodu ?? `Kart ${String(s.malzemeNo)}`))].join(', ')} için yürürlükte rota yok. Emir boş açılır, planlanmaz ve başlatılmaz; rota yürürlüğe girince kendiliğinden dolar.`}
              </p>
            )}
            {eksik && (
              <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="alert">
                <strong>Onaylayamazsınız</strong>
                {`Sipariş onaylanınca proje ve üretim emri açılır; bunun için şu yetkiler gerekir: ${c.eksikIslemler.join(', ')}. Yetkili biri onaylamalı.`}
              </p>
            )}
          </>
        )}
        {gonder.isError && <p className="tc-sp-hata" role="alert">{yazmaIletisi(gonder.error, 'Onaylanamadı.')}</p>}
      </div>
    </Pencere>
  );
}

// Onaylı siparişte eksik proje ve emir (ayar kapalıyken ya da ayardan önce onaylanmış sipariş) elle açılır; aynı kural, aynı ileti.
export function useEksikleriAc(siparisId: number) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: () => api.post<SiparisAcilisiSonucu>(`/uretim-emirleri/siparis-acilisi/${String(siparisId)}/ac`, {}, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (s) => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisAcilisi(siparisId) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisProjeleri(siparisId) });
      bildir('tamam', s.acilan + s.baglanan === 0 ? 'Açılacak emir kalmadı.' : `${String(s.acilan + s.baglanan)} emir açıldı.`);
    },
  });
}

export const eksikVar = (c: SiparisAcilisiCevabi | undefined): boolean => c !== undefined && (c.proje.id === null || acilacaklar(c).length > 0);

// 3272-2 (Atölye şartı): onay geri alma ve iptal dokunulmamış emri kilitlemez; talebi ya da tamamlanmış hazırlığı olan emir sessiz geçmez.
const UYARI_METNI: Record<SiparisAcilisiUyarisi, string> = { talep: 'malzeme talebi var', hazirlik: 'hazırlık maddesi tamamlanmış' };
export function GeriAlmaUyarisi({ siparisId, iptal }: { siparisId: number; iptal: boolean }) {
  const acilis = useSiparisAcilisi(siparisId);
  if (acilis.isError) return <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status">Bağlı talep ve hazırlık denetlenemedi.</p>;
  const uyarilar = acilis.data?.geriAlmaUyarilari ?? [];
  if (uyarilar.length === 0) return null;
  const emirler = uyarilar.map((u) => `${u.emirNo} (${u.nedenler.map((n) => UYARI_METNI[n]).join(', ')})`).join('; ');
  const talepVar = uyarilar.some((u) => u.nedenler.includes('talep'));
  const hazirlikVar = uyarilar.some((u) => u.nedenler.includes('hazirlik'));
  const duran = [talepVar ? 'talep' : null, hazirlikVar ? 'hazırlık' : null].filter(Boolean).join(' ve ');
  const ek = iptal
    ? (talepVar ? ' Malzeme talebi satın almada açık kalır; gerekmiyorsa satın almadan kapatın.' : '')
    : ` Emir taslak kalır; ${duran} emirde durur, yeniden onayda emir kaleme döner.${talepVar ? ' Adet değişirse talebi kontrol edin.' : ''}`;
  return (
    <p className="tc-sp-bildirim tc-sp-bildirim-uyari" role="status">
      <strong>{iptal ? 'Bu emirler iptal olur' : 'Bu emirler kalemden çözülür'}</strong>
      {`${emirler}.${ek}`}
    </p>
  );
}
