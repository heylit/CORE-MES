import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiparisAyrintisi, SiparisDonusumCevabi, TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { fiyatMetni, miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';
import { uygulamaDegisiklikVar, uygulamaFarki, type UygulamaSatiri } from './teklif-uygula.ts';
import { surumCakismasiMi, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';

const GEREKCE_EN_AZ = 3;
const GEREKCE_EN_COK = 400;

// 3637: kabul edilen teklif sürümünün fiyatlarını onaylı siparişin yeni sürümü (Rev) olarak uygular. Para değiştiği için fark ve gerekçe görülür.
export function TeklifSiparisUygula({ teklif, surumNo, logoda, acik, kapat, yenile }: {
  teklif: TeklifAyrintiCevabi; surumNo: number; logoda: boolean; acik: boolean; kapat: () => void; yenile: (t: TeklifAyrintiCevabi) => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const gonder = useKorumaliGonderim();
  const [gerekce, gerekceYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const siparisId = teklif.siparisId;
  const siparis = useQuery({
    queryKey: anahtarlar.siparis(siparisId ?? 0),
    queryFn: () => api.get<SiparisAyrintisi>(`/siparisler/${siparisId ?? 0}`),
    enabled: acik && siparisId !== null,
  });
  const uygula = useMutation({
    mutationFn: (govde: object) => gonder<SiparisDonusumCevabi>(`/siparisler/teklifler/${teklif.id}/siparise-uygula`, govde),
    onSuccess: (cevap) => {
      yenile(cevap.teklif);
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparis(cevap.siparisId) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisSurumleri(cevap.siparisId) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisListeleri });
      bildir('tamam', `Sürüm ${surumNo} siparişe uygulandı.`);
      gerekceYaz('');
      hataYaz(null);
      kapat();
    },
    onError: (h) => {
      hataYaz(yazmaIletisi(h, 'Siparişe uygulanamadı.'));
      if (surumCakismasiMi(h)) {
        void istemci.invalidateQueries({ queryKey: anahtarlar.teklif(teklif.id) });
        void istemci.invalidateQueries({ queryKey: anahtarlar.siparis(siparisId ?? 0) });
      }
    },
  });

  const s = siparis.data;
  const fark = s === undefined ? null : uygulamaFarki(teklif, surumNo, s);
  const para = teklif.paraBirimi;
  const onayli = s?.durum === 'onayli';
  const degisiklik = fark !== null && uygulamaDegisiklikVar(fark);
  const gerekceTam = gerekce.trim().length >= GEREKCE_EN_AZ;
  const hazir = s !== undefined && fark !== null && onayli && !fark.eslesmeyen && degisiklik && gerekceTam;
  const kapatTemiz = () => { hataYaz(null); kapat(); };

  const sutunlar: Sutun<UygulamaSatiri>[] = [
    { anahtar: 'tanim', baslik: 'Kalem', hucre: (x) => x.tanim },
    { anahtar: 'eski', baslik: 'Sipariş', hizala: 'sag', kirilmaz: true, hucre: (x) => fiyatMetni(x.eski, para) },
    { anahtar: 'yeni', baslik: `Sürüm ${surumNo}`, hizala: 'sag', kirilmaz: true, hucre: (x) => (x.degisti ? <strong>{fiyatMetni(x.yeni, para)}</strong> : fiyatMetni(x.yeni, para)) },
  ];

  return (
    <Pencere
      acik={acik}
      kapat={kapatTemiz}
      baslik={`Siparişe uygula · sürüm ${surumNo}`}
      alt={(
        <>
          <Dugme onClick={kapatTemiz} disabled={uygula.isPending} data-ilk-odak>Vazgeç</Dugme>
          <Dugme
            tur="birincil"
            simge="check"
            disabled={!hazir}
            yukleniyor={uygula.isPending}
            onClick={() => {
              if (!hazir || s === undefined) return;
              uygula.mutate({ surum: teklif.surum, siparisSurum: s.surum, surumNo, gerekce: gerekce.trim() });
            }}
          >
            Siparişe uygula
          </Dugme>
        </>
      )}
    >
      <div className="tc-sp-yigin">
        {siparis.isPending && siparisId !== null && <DurumKutusu durum="yukleniyor" />}
        {siparis.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(siparis.error, 'Sipariş alınamadı')} yenile={() => { void siparis.refetch(); }} />}
        {s !== undefined && fark !== null && (
          <>
            <p>{`${teklif.no} sürüm ${surumNo} fiyatları ${s.no} siparişine yeni sürüm olarak yazılır.`} <Rozet ton="uyari">Para değişir</Rozet></p>
            {!onayli && <p className="tc-sp-bildirim" role="alert"><strong>Sipariş onaylı değil</strong> Yalnız onaylı sipariş yeni sürüm alır; önce siparişi onaylayın.</p>}
            {fark.eslesmeyen && <p className="tc-sp-bildirim" role="alert"><strong>Kalemler eşleşmiyor</strong> Siparişin kalemleri teklif satırlarıyla aynı değil; siparişi elle düzenleyin.</p>}
            {onayli && !fark.eslesmeyen && !degisiklik && <p className="tc-sp-bildirim" role="status"><strong>Fark yok</strong> Bu sürümün fiyatları ve koşulları siparişle aynı.</p>}
            <Tablo etiket="Sipariş ve sürüm fiyatları" sutunlar={sutunlar} satirlar={fark.satirlar} satirAnahtari={(x) => x.sira} bosMesaj="Kalem yok." />
            <dl className="tc-sp-toplamlar">
              <div><dt>Toplam (KDV hariç)</dt><dd>{`${paraMetni(fark.toplam.eski, para)} → ${paraMetni(fark.toplam.yeni, para)}`}</dd></div>
              {fark.genel !== null && <div className="tc-sp-genel"><dt>Genel toplam (KDV dahil)</dt><dd>{`${paraMetni(fark.genel.eski, para)} → ${paraMetni(fark.genel.yeni, para)}`}</dd></div>}
              {fark.kdv !== null && <div><dt>KDV oranı</dt><dd>{`%${miktarMetni(fark.kdv.eski)} → %${miktarMetni(fark.kdv.yeni)}`}</dd></div>}
              {fark.odeme !== null && <div><dt>Ödeme koşulu</dt><dd>{`${fark.odeme.eski ?? '—'} → ${fark.odeme.yeni}`}</dd></div>}
            </dl>
            {fark.terminFarki !== null && (
              <p className="tc-sp-ipucu">{`Sürümde termin ${tarihMetni(fark.terminFarki.surum)}, siparişte ${tarihMetni(fark.terminFarki.siparis)}. Termin siparişe geçmez; değiştirmek için siparişin "Düzenle" sürümünü kullanın.`}</p>
            )}
            <CokSatir
              etiket="Gerekçe"
              required
              value={gerekce}
              onChange={(o) => gerekceYaz(o.target.value)}
              maxLength={GEREKCE_EN_COK}
              ipucu="Örnek: müşteri yeni fiyatı telefonla kabul etti."
            />
            <p className="tc-sp-ipucu">Finans'taki beklenen tahsilat yeni toplama göre yenilenir. Geri almak ikinci bir sipariş sürümü gerektirir.</p>
            {logoda && <p className="tc-sp-bildirim" role="note">Sipariş Logo'ya gitti. CORE Logo'yu güncellemez; sürüm "Logo'da elle güncellenmeli" diye işaretlenir.</p>}
          </>
        )}
        {hata !== null && <p className="tc-sp-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
