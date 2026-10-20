import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KisiSecenekleriCevabi, Talep } from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, Pencere, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ACILIYET, DURUM, KATEGORI, SINIR, zamanMetni } from './gorunum.ts';
import { useIslemVar, useTalepKomutu, yazmaIletisi, type TalepKomutu } from './yazma.ts';

type Kip = 'ana' | 'ata' | 'kapat' | 'reddet';

// Talep ayrıntısı ve idari işlerin işlemleri: üstlen, ata, bırak, kapat (not), reddet (neden zorunlu).
export function TalepPenceresi({ talep, kapat }: { talep: Talep | null; kapat: () => void }) {
  const yonetir = useIslemVar('idari-isler.talep-yonet');
  const komut = useTalepKomutu();
  const { bildir } = useBildirim();
  const [kip, kipYaz] = useState<Kip>('ana');
  const [metin, metinYaz] = useState('');
  const [kisi, kisiYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  const kisiler = useQuery({
    queryKey: anahtarlar.kisiler,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/idari-isler/kisi-secenekleri'),
    enabled: talep !== null && yonetir && kip === 'ata',
  });

  useEffect(() => { kipYaz('ana'); metinYaz(''); kisiYaz(''); hataYaz(null); }, [talep?.id]);

  if (talep === null) return null;
  const acik = talep.durum === 'yeni' || talep.durum === 'yapiliyor';

  const gonder = async (k: TalepKomutu, ek: object, basari: string) => {
    bekliyorYaz(true);
    hataYaz(null);
    try {
      await komut(talep, k, ek);
      bildir('tamam', basari);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'İşlem yapılamadı'));
    } finally {
      bekliyorYaz(false);
    }
  };

  const alt = !yonetir || !acik ? undefined : kip === 'ana' ? (
    <span className="tc-ii-dugmeler">
      {talep.durum === 'yeni' && <Dugme tur="birincil" simge="user" yukleniyor={bekliyor} onClick={() => void gonder('ustlen', {}, `${talep.no} üstlenildi`)}>Üstlen</Dugme>}
      {talep.durum === 'yeni' && <Dugme simge="users" onClick={() => kipYaz('ata')}>Ata</Dugme>}
      {talep.durum === 'yapiliyor' && <Dugme simge="back" yukleniyor={bekliyor} onClick={() => void gonder('birak', {}, `${talep.no} bırakıldı`)}>Bırak</Dugme>}
      <Dugme tur={talep.durum === 'yapiliyor' ? 'birincil' : 'ikincil'} simge="check" onClick={() => kipYaz('kapat')}>Kapat</Dugme>
      <Dugme tur="tehlike" simge="x" onClick={() => kipYaz('reddet')}>Reddet</Dugme>
    </span>
  ) : (
    <span className="tc-ii-dugmeler">
      <Dugme onClick={() => { kipYaz('ana'); hataYaz(null); }}>Vazgeç</Dugme>
      {kip === 'ata' && (
        <Dugme tur="birincil" simge="users" disabled={kisi === ''} yukleniyor={bekliyor}
          onClick={() => void gonder('ustlen', { kisiId: Number(kisi) }, `${talep.no} atandı`)}>Ata</Dugme>
      )}
      {kip === 'kapat' && (
        <Dugme tur="birincil" simge="check" yukleniyor={bekliyor}
          onClick={() => void gonder('kapat', metin.trim() === '' ? {} : { sonucNotu: metin.trim() }, `${talep.no} kapandı`)}>Kapat</Dugme>
      )}
      {kip === 'reddet' && (
        <Dugme tur="tehlike" simge="x" disabled={metin.trim() === ''} yukleniyor={bekliyor}
          onClick={() => void gonder('reddet', { neden: metin.trim() }, `${talep.no} reddedildi`)}>Reddet</Dugme>
      )}
    </span>
  );

  return (
    <Pencere acik kapat={kapat} baslik={`${KATEGORI[talep.kategori].etiket} · ${talep.no}`} tur="yan" {...(alt ? { alt } : {})}>
      <div className="tc-ii-yigin">
        <span className="tc-ii-satir">
          <Rozet ton={DURUM[talep.durum].ton}>{DURUM[talep.durum].etiket}</Rozet>
          {talep.aciliyet === 'acil' && <Rozet ton="hata">{ACILIYET.acil.etiket}</Rozet>}
        </span>
        <dl className="tc-ii-ozellikler">
          <div><dt>Yer</dt><dd>{talep.yer}</dd></div>
          <div><dt>Açan</dt><dd>{talep.acanAd ?? '—'}</dd></div>
          <div><dt>Açılma</dt><dd>{zamanMetni(talep.acilma)}</dd></div>
          <div><dt>Üstlenen</dt><dd>{talep.ustlenenAd ?? '—'}</dd></div>
          {talep.kapanma !== null && <div><dt>Kapanma</dt><dd>{zamanMetni(talep.kapanma)} · {talep.kapatanAd ?? '—'}</dd></div>}
        </dl>
        {talep.aciklama !== null && <p className="tc-ii-not">{talep.aciklama}</p>}
        {talep.sonucNotu !== null && <p className="tc-ii-not"><strong>{talep.durum === 'reddedildi' ? 'Red nedeni' : 'Sonuç'}:</strong> {talep.sonucNotu}</p>}
        {kip === 'ata' && (
          <Secim etiket="Kime atanacak" bosSecenek={kisiler.isPending ? 'Yükleniyor' : 'Kişi seç'} value={kisi} onChange={(o) => kisiYaz(o.target.value)}
            secenekler={(kisiler.data?.kisiler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }))} />
        )}
        {(kip === 'kapat' || kip === 'reddet') && (
          <CokSatir etiket={kip === 'kapat' ? 'Sonuç notu (isteğe bağlı)' : 'Red nedeni'} required={kip === 'reddet'} maxLength={SINIR.not}
            value={metin} onChange={(o) => metinYaz(o.target.value)} autoFocus />
        )}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
