import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KademeAyariCevabi, KademeAyariGovdesi, RolSecenekleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import './projeler.css';

// 3396 a: Projeler > Hazırlık > Kademeli takip. Yapılmayan hazırlık görevi beş kademede sertleşir; günler iş günüdür. Görev bitince ya da
// kontrole düşünce kademe bildirimleri kapanır. Kademe bildirimlerinin e-postası kişi tercihinden kapatılamaz.
export function HazirlikKademeAyari() {
  const d = useQuery({ queryKey: anahtarlar.kademeAyari, queryFn: () => api.get<KademeAyariCevabi>('/projeler/hazirlik-kademe-ayari') });
  if (d.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Kademe ayarı alınamadı')} yenile={() => { void d.refetch(); }} />;
  if (!d.data) return <DurumKutusu durum="yukleniyor" />;
  return <AyarFormu key={d.data.surum} ayar={d.data} />;
}

function AyarFormu({ ayar }: { ayar: KademeAyariCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [hatirlat, hatirlatYaz] = useState(String(ayar.hatirlatGun));
  const [yonetici, yoneticiYaz] = useState(String(ayar.yoneticiGun));
  const [devret, devretYaz] = useState(String(ayar.devretGun));
  const [rol, rolYaz] = useState(ayar.yoneticiRolId === null ? '' : String(ayar.yoneticiRolId));
  const roller = useQuery({
    queryKey: anahtarlar.roller, queryFn: () => api.get<RolSecenekleriCevabi>('/projeler/rol-secenekleri'), enabled: ayar.yazabilir,
  });
  const komut = useMutation({
    mutationFn: () => api.post<KademeAyariCevabi>('/projeler/hazirlik-kademe-ayari', {
      hatirlatGun: Number(hatirlat), yoneticiGun: Number(yonetici), devretGun: Number(devret), yoneticiRolId: rol === '' ? null : Number(rol), surum: ayar.surum,
    } satisfies KademeAyariGovdesi),
    onSuccess: (c) => { istemci.setQueryData(anahtarlar.kademeAyari, c); bildir('tamam', 'Kademe ayarı kaydedildi.'); },
  });
  const ilet = (o: FormEvent) => { o.preventDefault(); komut.mutate(); };
  const kilitli = !ayar.yazabilir;
  const gun = (etiket: string, deger: string, yaz: (v: string) => void, en: number) => (
    <Girdi etiket={etiket} type="number" inputMode="numeric" min={0} max={en} step={1} required value={deger} disabled={kilitli}
      onChange={(e) => { yaz(e.target.value); }} />
  );
  const rolAdi = roller.data?.roller.find((r) => String(r.id) === rol)?.ad;
  return (
    <Kart
      baslik="Hazırlık görevi kademesi"
      simge="bell"
      sag={ayar.yazabilir && <Dugme tur="birincil" type="submit" form="tc-prj-kademe-formu" yukleniyor={komut.isPending}>Kaydet</Dugme>}
    >
      <form id="tc-prj-kademe-formu" className="tc-prj-icerik" onSubmit={ilet} noValidate>
        <ol className="tc-prj-kademe">
          <li data-kademe="1">
            <b>Atanınca</b> <Rozet ton="bilgi">Zil</Rozet>
            <span className="tc-prj-soluk">Yapana; role atandıysa roldeki herkese.</span>
          </li>
          <li data-kademe="2">
            <b>Son günden önce</b> <Rozet ton="bilgi">Zil</Rozet> <Rozet ton="pasif">E-posta</Rozet>
            {gun('Kaç iş günü kala hatırlatılır', hatirlat, hatirlatYaz, 30)}
            <span className="tc-prj-soluk">Yapana.</span>
          </li>
          <li data-kademe="3">
            <b>Son gün geçince</b> <Rozet ton="uyari">Sert uyarı</Rozet> <Rozet ton="pasif">E-posta</Rozet>
            <span className="tc-prj-soluk">Yapana; kişisel oturumda bütün sayfaların üstünde kapanmayan kırmızı şerit (terminalde ve ortak cihazda yalnız zil).</span>
          </li>
          <li data-kademe="4">
            <b>Gecikince yöneticiye</b> <Rozet ton="hata">Yöneticiye</Rozet> <Rozet ton="pasif">E-posta</Rozet>
            {gun('Kaç iş günü gecikince yöneticiye', yonetici, yoneticiYaz, 30)}
            {ayar.yazabilir ? (
              <Secim
                etiket="Ayrıca bildirilen rol" value={rol} bosSecenek="Yalnız kontrol eden"
                secenekler={(roller.data?.roller ?? []).map((r) => ({ deger: String(r.id), baslik: r.ad }))} onChange={(e) => { rolYaz(e.target.value); }}
              />
            ) : <span>{ayar.yoneticiRolId === null ? 'Yalnız kontrol eden' : `Kontrol eden ve seçilen rol`}</span>}
            <span className="tc-prj-soluk">{`Kontrol eden${rolAdi ? ` ve ${rolAdi} rolü` : ''}; kontrol eden yoksa görev dağıtanlar.`}</span>
          </li>
          <li data-kademe="5">
            <b>Gecikince devret</b> <Rozet ton="hata">Devret</Rozet>
            {gun('Kaç iş günü gecikince devredilir', devret, devretYaz, 60)}
            <span className="tc-prj-soluk">Yedek kontrol edene devret önerisi; görev dağıtanlara her sabah tek günlük özet.</span>
          </li>
        </ol>
        <p className="tc-prj-soluk">
          Günler iş günüdür: hafta sonu ve İK'daki resmî tatiller sayılmaz. Görev bitince ya da kontrole düşünce açık kademe bildirimleri kapanır.
          Kesintiden sonra aynı kademe ikinci kez gitmez, atlanan kademeler yerine yalnız en yükseği bildirilir. Kademe bildirimlerinin e-postası
          kişi tercihinden kapatılamaz; e-posta Sistem Ayarları'nda açılana kadar yalnız zil ve şerit çalışır.
        </p>
        {ayar.degisti !== null && <p className="tc-prj-soluk">{`Son değişiklik: ${ayar.degistiren ?? 'Bilinmeyen kişi'} · ${zamanMetni(ayar.degisti) ?? ''}`}</p>}
        {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Kademe ayarı kaydedilemedi')}</p>}
      </form>
    </Kart>
  );
}
