import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { KaynakKlasoruCevabi, KayitTuru } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { api } from '../veri/api.ts';
import { useYetki } from '../veri/yetki.ts';
import { Simge } from './Simge.tsx';

// Kayıt ekranındaki "Klasör" bağlantısı (2067-4 a madde 6, kart 3288-2). Firma ve sipariş ekranları Ortak Dosyalar'ı ithal edemez
// (o üst kattadır, ADR 0006), bu yüzden bağlantı ortak arayüzdedir ve yalnız `GET /ortak-dosyalar/kayit/:tur/:id` cevabına dayanır.
// Klasör yoksa ya da kişiye görünmüyorsa sunucu `null` döner ve hiçbir şey çizilmez; Ortak Dosyalar sayfası olmayan kişide istek atılmaz.
// Anahtar Ortak Dosyalar'ın kök anahtarı altındadır: orada klasör değişince bağlantı da tazelenir.
export function KlasorBaglantisi({ tur, id }: { tur: KayitTuru; id: number }) {
  const sayfaVar = useYetki().var('sayfa.ortak-dosyalar');
  const q = useQuery({
    queryKey: ['ortak-dosyalar', 'kayit', tur, id],
    queryFn: () => api.get<KaynakKlasoruCevabi>(`/ortak-dosyalar/kayit/${tur}/${id}`),
    enabled: sayfaVar,
    retry: false,
  });
  if (!sayfaVar || q.data === undefined || q.data.klasorId === null) return null;
  return (
    <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={`/ortak-dosyalar?klasor=${q.data.klasorId}`}>
      <Simge ad="layers" />Klasör
    </Link>
  );
}
