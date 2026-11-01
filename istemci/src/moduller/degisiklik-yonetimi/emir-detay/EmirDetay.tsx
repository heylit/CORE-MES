import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { EmirCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { EMIR_DURUM_ADLARI, SINIF_ADLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import { DurumKutusu, Dugme, SayfaBasligi, Sekmeler, useBildirim, type Sekme } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { tarihMetni } from '../../../ortak/veri/zaman-metni.ts';
import { AsamaSeridi } from '../ortak/AsamaSeridi.tsx';
import { Kunye } from '../ortak/Kunye.tsx';
import { SiradakiAdim } from '../ortak/SiradakiAdim.tsx';
import {
  ASAMALAR, asamaBilgileri, asamaSirasi, bekleyenKararlar, gecerlilikMetni, kapatilabilir, sekmeMi, tutarMetni, varsayilanSekme, yayinOncesi,
  type EmirSekmesi,
} from './emir-adimlari.ts';
import { useEmir, useEmirKomutu } from './emir-veri.ts';
import { FaiSekmesi } from './FaiSekmesi.tsx';
import { KararSekmesi } from './KararSekmesi.tsx';
import { KayitSekmesi } from './KayitSekmesi.tsx';
import { GeriGonderPenceresi, KapatPenceresi, YayinPenceresi } from './pencereler.tsx';
import { RevizyonSekmesi } from './RevizyonSekmesi.tsx';
import './emir-detay.css';

// Yollar P2'nin rotalarıyla aynı olmalı (DEVIR isteği).
export const DEGISIKLIKLER_YOLU = '/degisiklik-yonetimi/degisiklikler';
export const talepYolu = (id: number) => `/degisiklik-yonetimi/talepler/${id}`;

type Pencere = 'yayin' | 'geri' | 'kapat' | null;

// Prototipin pEco ekranı: künye, aşama şeridi, sıradaki adım ve dört sekme.
export function EmirDetay() {
  const id = Number(useParams().id);
  const sorgu = useEmir(id);
  if (!Number.isInteger(id) || id < 1) return <DurumKutusu durum="hata" mesaj="Kayıt bulunamadı." />;
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Değişiklik emri okunamadı.')} yenile={() => void sorgu.refetch()} />;
  return <Emir emir={sorgu.data} />;
}

function Emir({ emir }: { emir: EmirCevabi }) {
  const [arama, aramaYaz] = useSearchParams();
  const istenen = arama.get('sekme');
  const sekme: EmirSekmesi = sekmeMi(istenen) ? istenen : varsayilanSekme(emir.durum);
  const sec = (s: EmirSekmesi) => aramaYaz((o) => { o.set('sekme', s); return o; }, { replace: true });
  const [pencere, pencereYaz] = useState<Pencere>(null);
  const kapat = () => pencereYaz(null);

  const bekleyen = bekleyenKararlar(emir.kararlar).length;
  const bekleyenFai = emir.fai.filter((f) => f.durum === 'bekliyor').length;
  const sekmeler: Sekme<EmirSekmesi>[] = [
    { anahtar: 'rev', baslik: 'Revizyonlar', simge: 'layers' },
    { anahtar: 'karar', baslik: 'Etki ve kararlar', simge: 'route', sayi: bekleyen },
    { anahtar: 'fai', baslik: 'İlk parça ve kapanış', simge: 'clipboard-check', sayi: bekleyenFai },
    { anahtar: 'kayit', baslik: 'Kayıt', simge: 'list' },
  ];

  return (
    <div className="dy-emir">
      <nav className="dy-emir-iz" aria-label="Konum">
        <Link to={DEGISIKLIKLER_YOLU}>Değişiklikler</Link> / Değişiklik emirleri / <span className="dy-kod">{emir.no}</span>
      </nav>
      <div className="dy-emir-ust">
        <SayfaBasligi baslik={emir.baslik} simge="layers"
          alt={emir.talep ? <>Kaynak talep <Link className="dy-kod" to={talepYolu(emir.talep.id)}>{emir.talep.no}</Link></> : null} />
        <Kunye etiket="Değişiklik emri künyesi" alanlar={[
          ['Kayıt no', <span className="dy-kod">{emir.no}</span>],
          ['Sınıf', SINIF_ADLARI[emir.sinif]],
          ['Müşteri onayı', emir.musteriReferansi ? <span className="dy-kod">{emir.musteriReferansi}</span> : 'Gerekmedi'],
          ['Geçerlilik', yayinOncesi(emir.durum) ? 'Belirlenmedi' : gecerlilikMetni(emir, tarihMetni)],
          ['Koordinatör', emir.koordinator.kisiAdi ?? '—'],
          ['Durum', EMIR_DURUM_ADLARI[emir.durum]],
        ]} />
      </div>
      <AsamaSeridi etiket="Değişiklik emri aşamaları" asamalar={ASAMALAR} sira={asamaSirasi(emir.durum)} bilgi={asamaBilgileri(emir, tarihMetniZamandan)} />
      <Siradaki emir={emir} sec={sec} ac={pencereYaz} />
      <Sekmeler etiket="ECO bölümleri" sekmeler={sekmeler} secili={sekme} sec={sec} />
      <div role="tabpanel" aria-label={sekmeler.find((s) => s.anahtar === sekme)?.baslik}>
        {sekme === 'rev' && <RevizyonSekmesi emir={emir} />}
        {sekme === 'karar' && <KararSekmesi emir={emir} />}
        {sekme === 'fai' && <FaiSekmesi emir={emir} kapatAc={() => pencereYaz('kapat')} />}
        {sekme === 'kayit' && <KayitSekmesi emir={emir} />}
      </div>
      {pencere === 'yayin' && <YayinPenceresi emir={emir} kapat={kapat} yayinlandi={() => { kapat(); sec('karar'); }} />}
      {pencere === 'geri' && <GeriGonderPenceresi emir={emir} kapat={kapat} />}
      {pencere === 'kapat' && <KapatPenceresi emir={emir} kapat={kapat} />}
    </div>
  );
}

// Geçmiş zamanı timestamptz; aşama satırında yalnız gün görünür.
const tarihMetniZamandan = (zaman: string) => tarihMetni(zaman.slice(0, 10));

function Siradaki({ emir, sec, ac }: { emir: EmirCevabi; sec: (s: EmirSekmesi) => void; ac: (p: Pencere) => void }) {
  const yetki = useYetki();
  const { bildir } = useBildirim();
  const taslakAc = useEmirKomutu(emir.id, 'taslakAc');
  const yayinaGonder = useEmirKomutu(emir.id, 'yayinaGonder');
  const hata = (ileti: string) => (h: unknown) => bildir('hata', hataIletisi(h, ileti));
  const hazirlayan = yetki.var('degisiklik-yonetimi.revizyon-hazirla');
  const yayinlayan = yetki.var('degisiklik-yonetimi.yayinla');

  switch (emir.durum) {
    case 'acik':
      return (
        <SiradakiAdim baslik="Sıradaki adım: revizyon hazırlığını başlatın"
          aciklama="Proses mühendisi veya tasarım. Yeni çizim ve rota revizyonu sahibi modülde açılır; burada kaleme yalnız kimliği yazılır, yayın üretimi henüz değiştirmez.">
          {hazirlayan && (
            <Dugme tur="birincil" simge="edit" yukleniyor={taslakAc.isPending}
              onClick={() => taslakAc.mutate({ surum: emir.surum }, { onSuccess: () => bildir('tamam', 'Revizyon hazırlığı başladı.'), onError: hata('Hazırlık başlatılamadı.') })}>
              Hazırlığı başlat
            </Dugme>
          )}
        </SiradakiAdim>
      );
    case 'revizyon_hazirlaniyor':
      return (
        <SiradakiAdim baslik="Sıradaki adım: yeni revizyonları hazırlayın"
          aciklama="Değiştirilebilirlik sorularını yanıtlayın, kalemleri kaydedin, sonra yayın onayına gönderin.">
          {hazirlayan && (
            <Dugme tur="birincil" simge="next" yukleniyor={yayinaGonder.isPending}
              onClick={() => yayinaGonder.mutate({ surum: emir.surum }, { onSuccess: () => bildir('tamam', 'Yayın onayına gönderildi.'), onError: hata('Yayın onayına gönderilemedi.') })}>
              Yayın onayına gönder
            </Dugme>
          )}
        </SiradakiAdim>
      );
    case 'yayina_hazir':
      return (
        <SiradakiAdim baslik="Sıradaki adım: geçerliliği belirleyip yayınlayın"
          aciklama="Kalite. Yayın sonrası revizyonlar kilitlenir, etkilenen emirler için karar önerileri üretilir.">
          {yayinlayan && <Dugme tur="ikincil" simge="back" onClick={() => ac('geri')}>Hazırlığa geri gönder</Dugme>}
          {yayinlayan && <Dugme tur="birincil" simge="upload" onClick={() => ac('yayin')}>Geçerlilik ve yayın</Dugme>}
        </SiradakiAdim>
      );
    case 'karar': {
      const n = bekleyenKararlar(emir.kararlar).length;
      return (
        <SiradakiAdim tur="bekliyor" baslik={`Sıradaki adım: ${n} disposition kararı`}
          aciklama="Kararı bekleyen emirler karantinada tutulur; atölyede başlatılamaz.">
          <Dugme tur="birincil" simge="next" onClick={() => sec('karar')}>Kararlara git</Dugme>
        </SiradakiAdim>
      );
    }
    case 'uygulamada':
      return (
        <SiradakiAdim tur="bekliyor" baslik="Sıradaki adım: ilk parça kontrolü"
          aciklama="Yeni rota ile ilk operasyon tamamlanınca Kalite FAI’yi onaylar.">
          <Dugme tur="birincil" simge="clipboard-check" onClick={() => sec('fai')}>İlk parça kontrolü</Dugme>
        </SiradakiAdim>
      );
    case 'dogrulama': {
      const hazir = kapatilabilir(emir);
      return (
        <SiradakiAdim tur={hazir ? 'sirada' : 'bekliyor'} baslik={hazir ? 'Sıradaki adım: ECO’yu kapatın' : 'Doğrulama sürüyor'}
          aciklama={hazir ? 'Eksik kapanış koşulu yok.' : 'Kapanış koşulları için İlk parça ve kapanış sekmesine bakın.'}>
          {yetki.var('degisiklik-yonetimi.kapat') && <Dugme tur="birincil" simge="check" disabled={!hazir} onClick={() => ac('kapat')}>ECO’yu kapat</Dugme>}
        </SiradakiAdim>
      );
    }
    case 'kapandi': {
      const son = emir.gecmis.filter((g) => g.olay === 'kapandi').sort((a, b) => b.zaman.localeCompare(a.zaman))[0];
      const kim = son ? `${son.kisiAdi ?? 'Bilinmeyen kişi'}, ${tarihMetniZamandan(son.zaman)}. ` : '';
      return (
        <SiradakiAdim tur="bitti" baslik="Değişiklik kapandı"
          aciklama={`${kim}Hurda ${tutarMetni(emir.hurdaMaliyeti)}, rework ${tutarMetni(emir.reworkMaliyeti)}.`} />
      );
    }
  }
}
