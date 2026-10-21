# recete-rota: başka modül istekleri (teslim 20.10.2026)

Bu teslim başka modülün dosyasına dokunmaz. Aşama 1'de bağlantı gereken yer boş bırakıldı; aşağıdakiler Aşama 2'de, her biri ilgili modülün kartıyla ve o modülün `disari.ts`'iyle gelir.

| İsteyen yer | Gereken | Olası sahibi | Bugün |
|---|---|---|---|
| Fason planı, Kaynaklar > Fason ve aparat | Fason firma listesi: kod, ad (kapasite, süre, çıkış günü ve saati planlamada kalabilir) | musteri-tedarikci | Firma adı yok: çerçeve "Fason firma #FS-..." gösterir; liste bağlı sunucudan (`BAGLI.durum.fasonFirms`) gelirdi, Aşama 1'de boş. |
| Planlama motoru, ilk parça onayı (`fai` adımı) | Onay süresi ve onayın kendisi: planlama onayı bekleyen süre olarak koyar | Kalite Merkezi | Süre kayıttaki adım alanından (`fai`) ve atölye genelinden (`faiSaat`); onay olayı okunmaz. |
| Canlıya al | Canlı planın yazılacağı tablo (emir no, OP no -> makine, başlangıç) ve sürümü | uretim-emirleri (220 a canlı plan) | Yalnız kayda yazılır (`st.tmiCanli`); sunucu planı güncellenmez. Reçete ve Rota çerçevesi kaydı okur (`curPlan`). |
| Canlıya al, operatör ekranı | Terminalin okuduğu plan sırası (istasyon başına iş listesi) | Arkon MES / Üretim Terminali | Terminal güncellenmez; bu teslim Arkon'a dokunmaz. |
| Planlama motoru, gerçekleşen | Başlamış ve biten adımlar, gerçek başlangıç ve bitiş saatleri | uretim-emirleri / terminal | Kayıttaki `opStatus`, `opProg` okunur; terminal kaydı okunmaz. |
| Malzeme satın alma planı | Açık satın alma siparişleri ve geliş tarihleri | malzemeler / satın alma | Kayıttaki `item.plan.tedarikGun` ile hesaplanır; açık sipariş okunmaz. |
| Maliyetler, Genel gider | Saatlik ücretler ve genel gider kalemleri | kisiler / finans | Kayıttaki `ucret`, `ayarciUcret`, `mesaiUcret` ve planlamanın kendi gider tablosu. |

DOĞRULANDI: 1., 3. ve 4. satır (FARK "Fason adım ve canlı plan", `zz28-rr-canli.betik` başlık yorumu, t163). VARSAYIM: 2. satır ve son üç satırın "Bugün" sütunu alan adlarından çıkarıldı, motor kodunda satır satır izlenmedi.
Bugün hiçbirinde veri uydurulmaz: kaynak yoksa alan boştur.
