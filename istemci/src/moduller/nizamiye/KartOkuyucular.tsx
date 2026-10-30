import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PdksCihaz, PdksCihazAnahtarCevabi, PdksCihazlarCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKomut } from './komut.ts';
import { tarihSaat } from './gorunum.ts';
import { PersonelKartlari } from './PersonelKartlari.tsx';
import './nizamiye.css';

// Anahtar sunucuda saklanmaz (ADR 0016): açılışta ve yenilemede bir kez gösterilir, cihaza o an girilir.
function AnahtarGoster({ sonuc, bitti }: { sonuc: PdksCihazAnahtarCevabi; bitti: () => void }) {
  const { bildir } = useBildirim();
  const adres = `${window.location.origin}/api/nizamiye/pdks/cihaz-hareketi`;
  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(sonuc.anahtar);
      bildir('tamam', 'Anahtar kopyalandı.');
    } catch {
      bildir('hata', 'Panoya kopyalanamadı; anahtarı elle seçip kopyalayın.');
    }
  };
  return (
    <div className="tc-nz-panel-form" role="status">
      <p className="tc-nz-panel-baslik"><Simge ad="lock" /> {`${sonuc.cihaz.ad}: cihaz anahtarı`}</p>
      <p className="tc-nz-uyari"><Simge ad="alert" boyut="k" /> Bu anahtar bir daha gösterilmez. Kapatmadan önce kart okuyucuya girin.</p>
      <code className="tc-nz-anahtar">{sonuc.anahtar}</code>
      <p className="tc-nz-soluk">{`Gönderim adresi: ${adres}`}</p>
      <div className="tc-nz-panel-alt">
        <Dugme simge="edit" onClick={() => { void kopyala(); }}>Kopyala</Dugme>
        <Dugme tur="birincil" simge="check" onClick={bitti}>Cihaza girdim</Dugme>
      </div>
    </div>
  );
}

function OkuyucuEkle({ eklendi, vazgec }: { eklendi: (s: PdksCihazAnahtarCevabi) => void; vazgec: () => void }) {
  const [ad, adYaz] = useState('');
  const [ip, ipYaz] = useState('');
  const ekle = useKomut<{ ad: string; ip: string }, PdksCihazAnahtarCevabi>('Kart okuyucu eklenemedi.');
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    ekle.mutate({ yol: '/nizamiye/pdks/cihazlar', govde: { ad, ip } }, { onSuccess: eklendi });
  };
  return (
    <form className="tc-nz-panel-form" onSubmit={gonder}>
      <Girdi etiket="Ad" required maxLength={100} value={ad} onChange={(o) => adYaz(o.target.value)} ipucu="Örnek: Ana kapı turnikesi." />
      <Girdi etiket="IP adresi" required maxLength={45} inputMode="decimal" value={ip} onChange={(o) => ipYaz(o.target.value)}
        ipucu="Kart okuyucunun kurum ağındaki sabit adresi (örnek 10.0.7.21)." />
      <div className="tc-nz-panel-alt">
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
        <Dugme tur="birincil" type="submit" simge="plus" disabled={ad.trim() === '' || ip.trim() === ''} yukleniyor={ekle.isPending}>Ekle</Dugme>
      </div>
    </form>
  );
}

function OkuyucuSatiri({ cihaz, anahtarGeldi }: { cihaz: PdksCihaz; anahtarGeldi: (s: PdksCihazAnahtarCevabi) => void }) {
  const [yenileSor, yenileSorYaz] = useState(false);
  const yenile = useKomut<{ surum: number }, PdksCihazAnahtarCevabi>('Anahtar yenilenemedi.');
  const durum = useKomut<{ surum: number; aktif: boolean }, PdksCihaz>('Kart okuyucu güncellenemedi.');
  return (
    <article className="tc-nz-satir tc-nz-okuyucu">
      <span className="tc-nz-satir-simge"><Simge ad="cpu" /></span>
      <span className="tc-nz-satir-ad">
        <strong>{cihaz.ad}</strong>
        <span className="tc-nz-soluk tc-nz-kartno">{cihaz.ip}</span>
      </span>
      <span className="tc-nz-satir-zaman">
        <Rozet ton={cihaz.aktif ? 'tamam' : 'pasif'}>{cihaz.aktif ? 'Etkin' : 'Durduruldu'}</Rozet>
        <span className="tc-nz-soluk">{cihaz.sonGonderim === null ? 'Gönderim yok' : `Son gönderim ${tarihSaat(cihaz.sonGonderim)}`}</span>
      </span>
      {yenileSor ? (
        <div className="tc-nz-panel-alt">
          <span className="tc-nz-uyari"><Simge ad="alert" boyut="k" /> Eski anahtar hemen geçersiz olur.</span>
          <Dugme onClick={() => yenileSorYaz(false)}>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="rotate" yukleniyor={yenile.isPending}
            onClick={() => yenile.mutate({ yol: `/nizamiye/pdks/cihazlar/${cihaz.id}/anahtar`, govde: { surum: cihaz.surum } }, { onSuccess: anahtarGeldi })}>
            Yenile
          </Dugme>
        </div>
      ) : (
        <div className="tc-nz-panel-alt">
          <Dugme simge="rotate" onClick={() => yenileSorYaz(true)}>Anahtarı yenile</Dugme>
          <Dugme simge={cihaz.aktif ? 'pause' : 'play'} yukleniyor={durum.isPending}
            onClick={() => durum.mutate({ yol: `/nizamiye/pdks/cihazlar/${cihaz.id}/durum`, govde: { surum: cihaz.surum, aktif: !cihaz.aktif } })}>
            {cihaz.aktif ? 'Durdur' : 'Etkinleştir'}
          </Dugme>
        </div>
      )}
    </article>
  );
}

// 289 b: kart okuyucu hareketi kendisi gönderir; kayıt PDKS aktarma yetkisiyle burada tutulur. Sunucu tarafı ayar ve ağ aralığı ister.
export function KartOkuyucular() {
  const veri = useQuery({ queryKey: anahtarlar.pdksCihazlar, queryFn: () => api.get<PdksCihazlarCevabi>('/nizamiye/pdks/cihazlar') });
  const [ekleAcik, ekleAcikYaz] = useState(false);
  const [anahtar, anahtarYaz] = useState<PdksCihazAnahtarCevabi | null>(null);

  if (anahtar) return <AnahtarGoster sonuc={anahtar} bitti={() => anahtarYaz(null)} />;
  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />;
  const { cihazlar } = veri.data;

  return (
    <div className="tc-nz-liste">
      <p className="tc-nz-soluk">Kart okuyucu yalnız kayıtlı adresinden ve anahtarıyla, Sistem Ayarları'nda "Kart okuyucudan PDKS kaydı" açıkken yazar.</p>
      {cihazlar.length === 0 && !ekleAcik && <p className="tc-nz-bos">Kayıtlı kart okuyucu yok.</p>}
      {cihazlar.map((c) => <OkuyucuSatiri key={c.id} cihaz={c} anahtarGeldi={anahtarYaz} />)}
      {ekleAcik
        ? <OkuyucuEkle eklendi={(s) => { ekleAcikYaz(false); anahtarYaz(s); }} vazgec={() => ekleAcikYaz(false)} />
        : <div className="tc-nz-panel-alt"><Dugme tur="birincil" simge="plus" onClick={() => ekleAcikYaz(true)}>Kart okuyucu ekle</Dugme></div>}
      <PersonelKartlari />
    </div>
  );
}
