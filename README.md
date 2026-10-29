# shopify-hediye-cubugu

Shopify sepeti için kademeli hediye çubuğu. Sepet tutarı bir eşiğe ulaşınca o kademenin
hediyesini sepete ekler, tutar düşünce çıkarır, kademede birden fazla hediye varsa ziyaretçiye
seçtirir ve sıradaki hediyeye ne kadar kaldığını gösterir.

```
700,00 TL daha ekleyin, Bileklik hediye.   [■■■■■■□□□□□]
```

Uygulama değildir: temaya eklenen bir betik, iki Liquid parçası ve bir ayar grubu. Aylık ücret,
dış sunucu ya da ek izin yoktur.

## Nasıl çalışır

İş iki parçaya bölünür:

1. **Fiyat Shopify’da kalır.** Her kademe için Shopify yöneticisinde otomatik bir
   **“X alana Y” (Buy X get Y)** indirimi açılır: en az tutar = kademenin eşiği, Y = hediye
   ürünü, indirim = %100 (ücretsiz), sipariş başına 1 kullanım. Hediyeyi 0 TL yapan bu indirimdir;
   biri betiği atlayıp sepete hediyeyi elle eklese bile indirim koşulu sağlanmadıkça ücret ödenir.
2. **Sepet düzeni betikte.** `hediye-cubugu.js` sepeti okur, hediye satırları dışındaki
   ürünlerin tutarını hesaplar ve sepeti indirimin beklediği hâle getirir:
   - ulaşılan en yüksek kademenin hediyesini `_hediye` satır özelliğiyle ekler,
   - alt kademenin hediyesini, fazladan eklenen hediye satırlarını ve 1’den fazla adedi temizler,
   - eşiğin altına düşülünce hediyeyi çıkarır,
   - ziyaretçinin seçimini tarayıcıda hatırlar; tükenmiş varyantı atlar.

Hediyenin kendi fiyatı eşiğe sayılmaz. Tema sepeti `fetch` ile (`/cart/add.js`, `/cart/change.js`
…) değiştirdiğinde betik bunu fark edip yeniden hesaplar.

## Kurulum

Önce temanın bir kopyasında deneyin.

1. `assets/hediye-cubugu.js` dosyasını temanın `assets/` klasörüne,
   `snippets/` altındaki iki dosyayı `snippets/` klasörüne kopyalayın.
2. [`config/settings_schema.json`](config/settings_schema.json) içindeki **“Hediye çubuğu”**
   grubunu (ikinci nesne) temanızın `config/settings_schema.json` dizisinin sonuna ekleyin.
   `theme_info` nesnesini kopyalamayın.
3. `layout/theme.liquid` içinde `</body>` etiketinden hemen önce:
   ```liquid
   {% render 'hediye-cubugu-ayar' %}
   ```
4. Çubuğun görüneceği yere, ör. sepet sayfası ve sepet çekmecesi şablonuna:
   ```liquid
   {% render 'hediye-cubugu' %}
   ```
5. Tema düzenleyicide **Tema ayarları › Hediye çubuğu**: eşikleri (ana para biriminde, ör.
   `1500`), kademe adlarını ve hediye ürünlerini girin, çubuğu açın.
6. Shopify yöneticisinde **İndirimler**’den her kademe için bir “X alana Y” indirimi açın. Eşik
   ve hediye ürünleri ayarlardakiyle **aynı** olmalı.

## Tema ile uyum

- Sepet çekmecesi hediye eklendikten sonra kendini yenilemiyorsa, betiğin attığı olayı dinleyin:
  ```js
  document.addEventListener('hediye-cubugu:guncellendi', (event) => {
    if (event.detail.degisti) {
      // temanızın çekmeceyi yeniden çizen fonksiyonu
    }
  })
  ```
- Tema sepeti `fetch` yerine eski `XMLHttpRequest` ile değiştiriyorsa, değişiklikten sonra
  `document.dispatchEvent(new Event('hediye-cubugu:yenile'))` çağırın.
- Sepet sayfası yalnızca yenilenince güncelleniyorsa **“Hediye değişince sepet sayfasını
  yenile”** ayarını açık bırakın.
- Hediye satırlarında adet ve sil düğmelerini gizlemek için satırda
  `item.properties._hediye` olup olmadığına bakın. Alt çizgiyle başlayan özellikler ödeme
  sayfasında müşteriye gösterilmez.

## Dikkat edilecekler

- **Eşik hesabı:** Betik satır indirimlerinden sonraki ürün tutarına bakar; sepet geneli
  indirimleri (ör. %10 sipariş kodu) düşmez. Shopify’ın indirim koşulu ise mağaza ayarına göre
  farklı hesaplanabilir. Sınırdaki tutarları test edin.
- **Tek hediye:** Aynı anda yalnızca ulaşılan en yüksek kademenin hediyesi sepette kalır.
  Shopify’da kademelerin indirimleri birleşebiliyorsa, birden fazla hediyenin ücretsiz olmasını
  indirimlerde “sipariş başına 1 kullanım” ve birleştirme ayarlarıyla engelleyin.
- **Stok:** Hediye ürününün stoğu bittiğinde varyant seçeneklerden düşer. Hediyenin stok takibini
  açık tutun.
- **Çoklu para birimi:** Eşikler ana para biriminde girilir, ziyaretçi başka bir para biriminde
  geziyorsa betik Shopify’ın `Shopify.currency.rate` değeriyle ölçekler. Yuvarlama farkları
  olabilir.
- **İade:** Hediye siparişte 0 TL’lik bir satırdır. Ana ürün iade edildiğinde hediyenin ne olacağını
  iade politikanızda yazın.

## Geliştirme

```bash
npm install
npm test        # kademe, seçim, temizlik ve para biçimi hesapları
npm run check   # Shopify Theme Check
```

Betiğin hesap kısmı tarayıcı nesnesi kullanmaz; testler aynı dosyayı Node’da çalıştırır.

## Lisans

MIT · [Salih Eroğul](https://saliherogul.com), bağımsız Shopify geliştiricisi.
