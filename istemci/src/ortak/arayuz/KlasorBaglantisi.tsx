import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { KaynakKlasoruCevabi, KayitTuru } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { api } from '../veri/api.ts';
import { Simge } from './Simge.tsx';

// Kayıt ekranındaki "Klasör" bağlantısı (2067-4 a madde 6, kart 3288-2). Firma ve sipariş ekranları Ortak Dosyalar'ı ithal edemez
// (o üst kattadır, ADR 0006), bu yüzden bağlantı ortak arayüzdedir ve yalnız `GET /ortak-dosyalar/kayit/:tur/:id` cevabına dayanır.
// Klasör yoksa, kişiye görünmüyorsa ya da kişinin Ortak Dosyalar sayfası yoksa hiçbir şey çizilmez (sunucu 404/403 döner).
// Anahtar Ortak Dosyalar'ın kök anahtarı altındadır: orada klasör değişince bağlantı da tazelenir.
export function KlasorBaglantisi({ tur, id }: { tur: KayitTuru; id: number }) {
  const q = useQuery({
    queryKey: ['ortak-dosyalar', 'kayit', tur, id],
    queryFn: () => api.get<KaynakKlasoruCevabi>(`/ortak-dosyalar/kayit/${tur}/${id}`),
    retry: false,
  });
  if (q.data === undefined) return null;
  return (
    <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={`/ortak-dosyalar?klasor=${q.data.klasorId}`}>
      <Simge ad="layers" />Klasör
    </Link>
  );
}
