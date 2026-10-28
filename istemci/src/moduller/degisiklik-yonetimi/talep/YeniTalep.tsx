import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ACILIYETLER, ACILIYET_ADLARI, SINIFLAR, SINIF_ADLARI, type Aciliyet, type Sinif } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { ParcaAdaylariCevabi, TalepAcGovdesi, TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { anahtarlar } from '../anahtarlar.ts';
import { useKomut } from '../komut.ts';
import { KOK, talepYolu } from '../gosterim.tsx';

// Prototipteki "Yalnızca süre veya tezgâh tercihi" seçeneği sınıf değildir: talep açılmaz, planlama parametresidir (1120 a).
const PLANLAMA = 'planlama';
type OnTip = Sinif | typeof PLANLAMA;

export function YeniTalep({ kapat }: { kapat: () => void }) {
  const gezin = useNavigate();
  const { bildir } = useBildirim();
  const [baslik, baslikYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [secili, seciliYaz] = useState<readonly number[]>([]);
  const [onTip, onTipYaz] = useState<OnTip>('D1');
  const [aciliyet, aciliyetYaz] = useState<Aciliyet>('normal');
  const [aciklama, aciklamaYaz] = useState('');
  const [yerelHata, yerelHataYaz] = useState<string | null>(null);
  const q = ara.trim();
  const adaylar = useQuery({
    queryKey: anahtarlar.parcaAdaylari(q),
    queryFn: () => api.get<ParcaAdaylariCevabi>(`${KOK}/parca-adaylari${q ? `?ara=${encodeURIComponent(q)}` : ''}`),
  });
  const komut = useKomut<TalepCevabi>(`${KOK}/talepler/ac`, (t) => {
    bildir('tamam', `${t.no} gönderildi.`);
    kapat();
    void gezin(talepYolu(t.id));
  }, 'Talep gönderilemedi');

  const degistir = (id: number, acik: boolean) => { seciliYaz((s) => (acik ? [...s, id] : s.filter((x) => x !== id))); };
  const gonder = () => {
    if (onTip === PLANLAMA) {
      yerelHataYaz('Süre veya tezgâh tercihi değişikliği talep gerektirmez. Planlama parametresi olarak ilgili modülde sürümlenir.');
      return;
    }
    yerelHataYaz(null);
    const govde: TalepAcGovdesi = { baslik, onSinif: onTip, aciliyet, malzemeIdleri: [...secili], aciklama };
    komut.gonder(govde);
  };
  const hata = yerelHata ?? komut.hata;

  return (
    <Pencere
      acik kapat={kapat} baslik="Yeni değişiklik talebi" tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={komut.yukleniyor} onClick={gonder}>Talebi gönder</Dugme>
        </>
      )}
    >
      <div className="tc-dy-form">
        <p className="tc-dy-soluk">Talep herkes tarafından açılabilir. Sınıflandırmayı proses mühendisi yapar.</p>
        <Girdi etiket="Başlık" value={baslik} onChange={(e) => { baslikYaz(e.target.value); }} maxLength={160} required />
        <fieldset className="tc-dy-parcalar">
          <legend>Etkilenen parçalar</legend>
          <Girdi etiket="Parça ara" type="search" value={ara} onChange={(e) => { araYaz(e.target.value); }} placeholder="Stok kodu ya da ad" autoComplete="off" />
          {adaylar.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(adaylar.error, 'Parçalar alınamadı')} yenile={() => { void adaylar.refetch(); }} />}
          {adaylar.isPending && <DurumKutusu durum="yukleniyor" />}
          {adaylar.data?.parcalar.length === 0 && <DurumKutusu durum="bos" mesaj="Parça bulunamadı." />}
          <ul className="tc-dy-secim-listesi">
            {adaylar.data?.parcalar.map((p) => (
              <li key={p.malzemeId}>
                <IsaretKutusu
                  etiket={[p.kod ?? `#${p.malzemeId}`, p.ad].filter((m) => m !== null).join(' · ')}
                  checked={secili.includes(p.malzemeId)} onChange={(e) => { degistir(p.malzemeId, e.target.checked); }}
                />
              </li>
            ))}
          </ul>
          {secili.length > 0 && <p className="tc-dy-kucuk">{secili.length} parça seçildi.</p>}
        </fieldset>
        <div className="tc-dy-satir">
          <Secim
            etiket="Ön tip" value={onTip} onChange={(e) => { onTipYaz(e.target.value as OnTip); }}
            secenekler={[...SINIFLAR.map((s) => ({ deger: s, baslik: SINIF_ADLARI[s] })), { deger: PLANLAMA, baslik: 'Yalnızca süre veya tezgâh tercihi' }]}
          />
          <Secim
            etiket="Aciliyet" value={aciliyet} onChange={(e) => { aciliyetYaz(e.target.value as Aciliyet); }}
            secenekler={ACILIYETLER.map((a) => ({ deger: a, baslik: ACILIYET_ADLARI[a] }))}
          />
        </div>
        <CokSatir
          etiket="Açıklama" value={aciklama} onChange={(e) => { aciklamaYaz(e.target.value); }} maxLength={1000}
          placeholder="Ne gözlemlendi, ne öneriliyor, hangi seriler etkileniyor?"
        />
        {hata && <p className="tc-dy-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
