import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { YemekBildirGovdesi, YemekGunuCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SINIR, bugunTarihi, tarihMetni, zamanMetni } from './gorunum.ts';
import { useIslemVar, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

// Yemek sayısı (171 a): kadro, izinli ve fazla mesai sistemden; ziyaretçi ve gerekçeli düzeltme elle. "Bildirildi" kaydı kimin hangi
// sayıyı bildirdiğini tutar; sistem dışarıya göndermez.
export function Yemek() {
  const [tarih, tarihYaz] = useState(bugunTarihi);
  const gun = useQuery({
    queryKey: anahtarlar.yemek(tarih),
    queryFn: () => api.get<YemekGunuCevabi>(`/idari-isler/yemek?tarih=${encodeURIComponent(tarih)}`),
  });
  const d = gun.data;

  return (
    <section className="tc-ii">
      <Kart
        baslik="Yemek sayısı"
        sag={(
          <span className="tc-ii-dugmeler">
            {d !== undefined && (d.son === null
              ? <Rozet ton="uyari">Henüz bildirilmedi</Rozet>
              : <Rozet ton="tamam">{d.son.sayi} bildirildi, {zamanMetni(d.son.bildirim)}</Rozet>)}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void gun.refetch(); }} yukleniyor={gun.isFetching} />
          </span>
        )}
      >
        <div className="tc-ii-gun">
          <Girdi etiket="Gün" type="date" value={tarih} required onChange={(e) => { if (e.target.value !== '') tarihYaz(e.target.value); }} />
        </div>
        {gun.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(gun.error, 'Yemek sayısı alınamadı')} yenile={() => { void gun.refetch(); }} />
        ) : d === undefined ? (
          <DurumKutusu durum="yukleniyor" />
        ) : (
          <YemekHesabi key={`${d.tarih}-${d.son?.id ?? 0}`} gun={d} yenile={() => { void gun.refetch(); }} />
        )}
      </Kart>
    </section>
  );
}

const ADET = /^\d{1,3}$/;
const ISARETLI = /^-?\d{1,3}$/;

function YemekHesabi({ gun, yenile }: { gun: YemekGunuCevabi; yenile: () => void }) {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const { bildir } = useBildirim();
  const yazar = useIslemVar('idari-isler.yemek-yaz');
  const ilk = (n: number | undefined) => (n === undefined ? '' : String(n));
  const [ziyaretci, ziyaretciYaz] = useState(ilk(gun.son?.ziyaretci));
  const [duzeltme, duzeltmeYaz] = useState(gun.son === null || gun.son.duzeltme === 0 ? '' : String(gun.son.duzeltme));
  const [neden, nedenYaz] = useState(gun.son?.duzeltmeNedeni ?? '');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const duzeltmeSayi = duzeltme.trim() === '' ? 0 : ISARETLI.test(duzeltme.trim()) ? Number(duzeltme) : null;
  const eksik = [
    ...(ADET.test(ziyaretci.trim()) ? [] : ['ziyaretçi']),
    ...(duzeltmeSayi === null ? ['düzeltme sayısı'] : []),
    ...(duzeltmeSayi !== null && duzeltmeSayi !== 0 && neden.trim() === '' ? ['düzeltme gerekçesi'] : []),
  ];
  const sayi = eksik.length === 0 ? gun.kadro - gun.izinli + gun.fazlaMesai + Number(ziyaretci) + (duzeltmeSayi ?? 0) : null;
  const gecmisGun = gun.tarih < gun.bugun;

  const gonder = async () => {
    if (sayi === null || duzeltmeSayi === null) return;
    bekliyorYaz(true);
    hataYaz(null);
    const govde: YemekBildirGovdesi = {
      tarih: gun.tarih, kadro: gun.kadro, izinli: gun.izinli, fazlaMesai: gun.fazlaMesai, ziyaretci: Number(ziyaretci), duzeltme: duzeltmeSayi,
      ...(duzeltmeSayi === 0 ? {} : { duzeltmeNedeni: neden.trim() }),
    };
    try {
      const cevap = await gonderim<YemekGunuCevabi>('/idari-isler/yemek/bildir', govde);
      istemci.setQueryData(anahtarlar.yemek(gun.tarih), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      bildir('tamam', `${cevap.son?.sayi ?? sayi} bildirildi olarak kaydedildi`);
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Bildirim kaydedilemedi'));
      yenile();
    } finally {
      bekliyorYaz(false);
    }
  };

  return (
    <div className="tc-ii-yemek">
      <section className="tc-ii-yigin" aria-label="Hesap">
        <dl className="tc-ii-hesap">
          <div><dt>Günün vardiya kadrosu <span className="tc-ii-soluk">(Vardiya)</span></dt><dd className="mono">{gun.kadro}</dd></div>
          <div><dt>İzinli <span className="tc-ii-soluk">(İK)</span></dt><dd className="mono">− {gun.izinli}</dd></div>
          <div><dt>Fazla mesaiye kalan <span className="tc-ii-soluk">(İK)</span></dt><dd className="mono">+ {gun.fazlaMesai}</dd></div>
        </dl>
        <Girdi etiket="Yemeğe kalacak ziyaretçi" inputMode="numeric" value={ziyaretci} disabled={!yazar}
          onChange={(e) => ziyaretciYaz(e.target.value)} />
        <div className="tc-ii-duzeltme">
          <Girdi etiket="Elle düzeltme" inputMode="numeric" value={duzeltme} disabled={!yazar} onChange={(e) => duzeltmeYaz(e.target.value)} ipucu="Eksi olabilir" />
          <Girdi etiket="Düzeltme gerekçesi" value={neden} maxLength={SINIR.duzeltmeNedeni} disabled={!yazar}
            onChange={(e) => nedenYaz(e.target.value)} />
        </div>
        <p className="tc-ii-toplam">
          <span>Bildirilecek sayı</span>
          <span className="mono tc-ii-buyuk">{sayi ?? '—'}</span>
        </p>
        <p className="tc-ii-soluk">Tahmindir: personel giriş sistemi bağlanınca kadro yerine günün gerçek giriş sayısı kullanılır.</p>
      </section>

      <div className="tc-ii-yigin">
        <section className="tc-ii-yigin tc-ii-kutu" aria-label="Bildirim">
          <h3 className="tc-ii-ara-baslik">Bildirim</h3>
          <p className="tc-ii-soluk">Sayı yemek firmasına her zamanki yolla iletilir; sistem dışarıya göndermez. Kayıt kimin hangi sayıyı bildirdiğini tutar.</p>
          {gun.son !== null && (
            <p className="tc-ii-soluk">Son bildirim: {gun.son.sayi}, {gun.son.bildirenAd ?? '—'}, {zamanMetni(gun.son.bildirim)}</p>
          )}
          {gecmisGun ? (
            <p className="tc-ii-soluk">Geçmiş güne bildirim yazılmaz.</p>
          ) : yazar && (
            <>
              {eksik.length > 0 && <p className="tc-ii-soluk">Eksik: {eksik.join(', ')}</p>}
              {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
              <Dugme tur="birincil" simge="check" disabled={sayi === null || sayi < 0} yukleniyor={bekliyor} onClick={() => { void gonder(); }}>
                {sayi === null ? 'Bildirildi olarak kaydet' : `${sayi} bildirildi olarak kaydet`}
              </Dugme>
            </>
          )}
        </section>
        <section className="tc-ii-yigin tc-ii-kutu" aria-label="Son günler">
          <h3 className="tc-ii-ara-baslik">Son günler</h3>
          {gun.gecmis.length === 0 ? (
            <p className="tc-ii-soluk">Kayıt yok.</p>
          ) : (
            <table className="tc-ii-tablo">
              <thead><tr><th scope="col">Gün</th><th scope="col">Hesaplanan</th><th scope="col">Bildirilen</th></tr></thead>
              <tbody>
                {gun.gecmis.map((g) => (
                  <tr key={g.tarih}>
                    <td className="mono">{tarihMetni(g.tarih)}</td>
                    <td className="mono">{g.hesaplanan}</td>
                    <td className="mono">{g.sayi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
