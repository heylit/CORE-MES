import { useEffect } from 'react';
import { CokSatir, FormPenceresi, Girdi, IsaretKutusu, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { gunEtiketi, isoTarihSaat, saatDakika } from '../bicim.ts';
import { useMesaj, type FormOzellikleri } from '../durum.tsx';
import { bahisleriAc, bahisleriKodla } from '../kurallar.ts';
import type { Tekrar } from '../tipler.ts';
import { bilinenAdlar, kanalSecenekleri, taslagiTemizle } from './ortak.ts';
import { TEKRARLAR, zamanKisayollari, zamanlamaHatasi } from './yardimci.ts';

interface Degerler { kanal: string; metin: string; zaman: string; tekrar: Tekrar; duyuru: boolean }

const H = 36e5;

// Mesajı zamanla ya da zamanlanmışı düzenle (openSchedForm). Gönderimi otomasyon yapar; bu form yalnız kaydı yazar.
export function ZamanlaFormu({ istek, kapat }: FormOzellikleri<'zamanla'>) {
  const { ben, ad, kisiHaritasi, veri, yetki, yaz } = useMesaj();
  const { bildir } = useBildirim();
  const z = istek.duzenle ? veri.zamanli.find((x) => x.id === istek.duzenle) : undefined;
  const kanal = z?.cid ?? istek.kanal ?? veri.kanallar[0]?.id ?? '';
  const simdi = Date.now();
  const acik = bahisleriAc(z?.text, ad);

  const form = useForm<Degerler, number>({
    ilk: {
      kanal,
      metin: z ? acik.metin : istek.metin ?? '',
      zaman: isoTarihSaat(z ? z.sendAt : simdi + H),
      tekrar: z?.repeat ?? 'none',
      duyuru: z?.ann ?? false,
    },
    dogrula: (d) => {
      const h: Record<string, string> = {};
      if (!d.metin.trim()) h['metin'] = 'Mesajı yaz.';
      const zh = zamanlamaHatasi(d.zaman, d.tekrar, Date.now());
      if (zh) h['zaman'] = zh;
      return h;
    },
    kaydet: async (d) => {
      const sendAt = new Date(d.zaman).getTime();
      const kayit = { cid: d.kanal, text: bahisleriKodla(d.metin.trim(), bilinenAdlar(kisiHaritasi, acik.eslesme)).out, sendAt, repeat: d.tekrar, ann: d.duyuru, status: 'bekliyor' as const };
      if (z) await yaz.guncelle(`zamanli/${z.id}`, kayit);
      else {
        await yaz.ekle('zamanli', { ...kayit, by: ben.id, createdAt: Date.now() });
        if (istek.yazmaAlanindan) taslagiTemizle(d.kanal);
      }
      return sendAt;
    },
    basarili: (ts) => { bildir('tamam', `Zamanlandı: ${gunEtiketi(ts)} ${saatDakika(ts)}`); kapat(); },
    hataIletisi: 'Mesaj zamanlanamadı.',
  });

  const yok = !yetki.yaz || !kanal || (istek.duzenle !== undefined && !z);
  useEffect(() => {
    if (!yetki.yaz) kapat();
    else if (!kanal) { bildir('bilgi', 'Önce bir kanal oluştur.'); kapat(); }
    else if (istek.duzenle !== undefined && !z) { bildir('bilgi', 'Bu zamanlanmış mesaj artık yok.'); kapat(); }
  }, []);
  if (yok) return null;

  const secili = form.degerler.zaman;
  return (
    <FormPenceresi acik kapat={kapat} baslik={z ? 'Zamanlanmış mesajı düzenle' : 'Mesajı zamanla'} form={form} kaydetMetni={z ? 'Kaydet' : 'Zamanla'}>
      <Secim etiket="Kanal" secenekler={kanalSecenekleri(veri.kanallar)} {...form.alan('kanal')} />
      <CokSatir etiket="Mesaj" rows={3} required maxLength={3000} {...form.alan('metin')} />
      <div className="tc-ms-zaman">
        <div className="tc-ms-kisayollar" role="group" aria-label="Hazır zamanlar">
          {zamanKisayollari(simdi).map((k) => {
            const deger = isoTarihSaat(k.ts);
            return (
              <button
                key={k.etiket} type="button" className="tc-ms-cip" aria-pressed={secili === deger}
                onClick={() => { form.degistir({ zaman: deger }); }}
              >{k.etiket}</button>
            );
          })}
        </div>
        <Girdi etiket="Ne zaman?" type="datetime-local" required {...form.alan('zaman')} />
      </div>
      <Secim
        etiket="Tekrar" secenekler={Object.entries(TEKRARLAR).map(([deger, baslik]) => ({ deger, baslik }))}
        value={form.degerler.tekrar} onChange={(o) => { form.degistir({ tekrar: o.target.value as Tekrar }); }}
      />
      <IsaretKutusu
        etiket="Duyuru olarak gönder (okundu onayı ister)" checked={form.degerler.duyuru}
        onChange={(o) => { form.degistir({ duyuru: o.target.checked }); }}
      />
      <p className="tc-ms-ipucu">Mesaj, o saatte Mesaj'ı açık tutan herhangi bir cihazdan senin adınla gönderilir. O an kimse açık değilse ilk açılışta gider.</p>
    </FormPenceresi>
  );
}
