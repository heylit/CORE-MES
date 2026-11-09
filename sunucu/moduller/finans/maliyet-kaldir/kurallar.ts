// FNS-75 (2574): kaldırma okunan sürümle yapılır; satır yoksa bulunamadı, sürüm tutmazsa çakışma. Kayıt sessizce silinmez.
export function maliyetKaldirimi(mevcutSurum: number | null, istenenSurum: number): 'kaldir' | 'cakisma' | 'bulunamadi' {
  if (mevcutSurum === null) return 'bulunamadi';
  return mevcutSurum === istenenSurum ? 'kaldir' : 'cakisma';
}
