/*
 * Sepette hediye çubuğu (shopify-hediye-cubugu)
 *
 * Sepet tutarı bir kademeye ulaşınca o kademenin hediyesini sepete ekler, tutar düşünce çıkarır.
 * Hediyenin 0 TL olmasını Shopify’ın otomatik “X alana Y” indirimi sağlar; bu dosya yalnızca
 * sepeti indirimin beklediği hâle getirir ve ziyaretçiye kalan tutarı gösterir.
 *
 * Üst kısım (hesap) saf fonksiyonlardır ve Node’da test edilir. Alt kısım tarayıcıda çalışır.
 * https://github.com/eroguls/shopify-hediye-cubugu · MIT
 */
;(function (root) {
  'use strict'

  var DEFAULT_PROPERTY = '_hediye'

  function isGiftLine(line, property) {
    return !!(line.properties && line.properties[property || DEFAULT_PROPERTY])
  }

  // Kademeye sayılan tutar: hediye satırları hariç, satır indirimleri düşülmüş fiyatlar.
  function eligibleSubtotal(cart, property) {
    return (cart.items || []).reduce(function (sum, line) {
      if (isGiftLine(line, property)) return sum
      var price = line.final_line_price != null ? line.final_line_price : line.line_price
      return sum + (price || 0)
    }, 0)
  }

  // Eşikler ana para biriminde kuruş; sepet ziyaretçinin para biriminde gelir.
  function scaleTiers(tiers, rate) {
    var r = Number(rate) > 0 ? Number(rate) : 1
    return tiers
      .map(function (tier) {
        return Object.assign({}, tier, { esik: Math.round(tier.esik * r) })
      })
      .sort(function (a, b) {
        return a.esik - b.esik
      })
  }

  function availableGifts(tier) {
    return (tier.hediyeler || []).filter(function (gift) {
      return gift.stokta !== false
    })
  }

  /**
   * Sepetin olması gereken hâlini ve oraya götüren işlemleri hesaplar.
   * @param cart   /cart.js yanıtı
   * @param config { kademeler: [{ esik, etiket, hediyeler: [{ id, baslik, stokta }] }], ozellik, kur }
   * @param choice Ziyaretçinin seçtiği hediye varyant kimliği (yoksa kademenin ilk hediyesi)
   */
  function plan(cart, config, choice) {
    var property = config.ozellik || DEFAULT_PROPERTY
    var tiers = scaleTiers(config.kademeler || [], config.kur)
    var subtotal = eligibleSubtotal(cart, property)

    var tier = null
    var next = null
    tiers.forEach(function (candidate) {
      if (candidate.esik <= subtotal) tier = candidate
      else if (!next) next = candidate
    })

    var gifts = tier ? availableGifts(tier) : []
    var wanted = null
    if (gifts.length) {
      wanted =
        gifts.find(function (gift) {
          return String(gift.id) === String(choice)
        }) || gifts[0]
    }

    var actions = []
    var kept = false
    ;(cart.items || []).forEach(function (line) {
      if (!isGiftLine(line, property)) return
      var matches = wanted && String(line.variant_id) === String(wanted.id) && line.properties[property] === tier.etiket
      if (matches && !kept) {
        kept = true
        if (line.quantity !== 1) actions.push({ tur: 'adet', anahtar: line.key, adet: 1 })
      } else {
        actions.push({ tur: 'adet', anahtar: line.key, adet: 0 })
      }
    })
    if (wanted && !kept) {
      var properties = {}
      properties[property] = tier.etiket
      actions.push({ tur: 'ekle', id: Number(wanted.id), adet: 1, ozellikler: properties })
    }

    var previous = tier ? tier.esik : 0
    return {
      tutar: subtotal,
      kademe: tier,
      sonraki: next,
      kalan: next ? next.esik - subtotal : 0,
      yuzde: next ? Math.max(0, Math.min(100, Math.floor(((subtotal - previous) / (next.esik - previous)) * 100))) : 100,
      secenekler: gifts,
      secili: wanted,
      islemler: actions,
    }
  }

  // Shopify money_format biçimleri: {{amount}}, {{amount_no_decimals}}, {{amount_with_comma_separator}} …
  function formatMoney(cents, format) {
    var value = Math.round(Number(cents) || 0)
    function group(amount, decimals, thousands, decimal) {
      var fixed = (amount / 100).toFixed(decimals)
      var parts = fixed.split('.')
      var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands)
      return parts[1] ? whole + decimal + parts[1] : whole
    }
    var template = format || '{{amount}}'
    return template.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, name) {
      switch (name) {
        case 'amount_no_decimals':
          return group(value, 0, ',', '.')
        case 'amount_with_comma_separator':
          return group(value, 2, '.', ',')
        case 'amount_no_decimals_with_comma_separator':
          return group(value, 0, '.', ',')
        case 'amount_with_apostrophe_separator':
          return group(value, 2, "'", '.')
        default:
          return group(value, 2, ',', '.')
      }
    })
  }

  function message(state, config) {
    var money = function (cents) {
      return formatMoney(cents, config.paraBicimi)
    }
    if (state.sonraki) {
      var text = (config.metinler && config.metinler.kalan) || '{tutar} daha ekleyin, {etiket} hediye.'
      return text.replace('{tutar}', money(state.kalan)).replace('{etiket}', state.sonraki.etiket)
    }
    if (state.kademe) {
      var done = (config.metinler && config.metinler.tamam) || '{etiket} hediyeniz sepette.'
      return done.replace('{etiket}', state.kademe.etiket)
    }
    return ''
  }

  var core = {
    plan: plan,
    eligibleSubtotal: eligibleSubtotal,
    formatMoney: formatMoney,
    message: message,
    isGiftLine: isGiftLine,
  }
  root.HediyeCubugu = core

  if (typeof document === 'undefined' || typeof fetch === 'undefined') return

  /* ---------------------------------------------------------------- tarayıcı */

  var configNode = document.querySelector('script[data-hediye-cubugu-ayar]')
  if (!configNode) return
  var config
  try {
    config = JSON.parse(configNode.textContent)
  } catch (error) {
    console.warn('[hediye-cubugu] Ayar okunamadı', error)
    return
  }
  if (!config.kademeler || !config.kademeler.length) return
  if (window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) config.kur = window.Shopify.currency.rate

  var root_ = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/'
  var STORAGE_KEY = 'hediyeCubuguSecim'
  var OWN = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Hediye-Cubugu': '1' }
  var busy = null
  var again = false

  function readChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (error) {
      return null
    }
  }

  function saveChoice(id) {
    try {
      localStorage.setItem(STORAGE_KEY, String(id))
    } catch (error) {
      /* gizli pencere: seçim yalnızca bu sayfada geçerli */
    }
  }

  var nativeFetch = window.fetch.bind(window)

  function request(path, body) {
    return nativeFetch(root_ + path, body ? { method: 'POST', headers: OWN, body: JSON.stringify(body) } : { headers: OWN }).then(
      function (response) {
        if (!response.ok) throw new Error(path + ' ' + response.status)
        return response.json()
      },
    )
  }

  function apply(actions) {
    return actions.reduce(function (chain, action) {
      return chain.then(function () {
        if (action.tur === 'ekle') {
          return request('cart/add.js', { items: [{ id: action.id, quantity: action.adet, properties: action.ozellikler }] })
        }
        return request('cart/change.js', { id: action.anahtar, quantity: action.adet })
      })
    }, Promise.resolve())
  }

  function render(state, cart) {
    var nodes = document.querySelectorAll('[data-hediye-cubugu]')
    Array.prototype.forEach.call(nodes, function (node) {
      var text = node.querySelector('[data-hediye-cubugu-mesaj]')
      var bar = node.querySelector('[data-hediye-cubugu-ilerleme]')
      var list = node.querySelector('[data-hediye-cubugu-secenekler]')
      node.hidden = !cart.item_count
      if (text) text.textContent = message(state, config)
      if (bar) {
        bar.value = state.yuzde
        bar.textContent = '%' + state.yuzde
      }
      if (list) {
        list.textContent = ''
        if (state.secenekler.length > 1) {
          state.secenekler.forEach(function (gift) {
            var button = document.createElement('button')
            button.type = 'button'
            button.className = 'hediye-cubugu__secenek'
            button.setAttribute('aria-pressed', String(state.secili && state.secili.id === gift.id))
            button.textContent = gift.baslik
            button.addEventListener('click', function () {
              saveChoice(gift.id)
              sync()
            })
            list.appendChild(button)
          })
        }
      }
    })
  }

  function sync() {
    if (busy) {
      again = true
      return busy
    }
    busy = request('cart.js')
      .then(function (cart) {
        var state = plan(cart, config, readChoice())
        if (!state.islemler.length) return { cart: cart, state: state, changed: false }
        return apply(state.islemler)
          .then(function () {
            return request('cart.js')
          })
          .then(function (updated) {
            return { cart: updated, state: plan(updated, config, readChoice()), changed: true }
          })
      })
      .then(function (result) {
        render(result.state, result.cart)
        document.dispatchEvent(
          new CustomEvent('hediye-cubugu:guncellendi', { detail: { sepet: result.cart, durum: result.state, degisti: result.changed } }),
        )
        if (result.changed && config.sepetSayfasindaYenile && /\/cart\/?$/.test(location.pathname)) location.reload()
      })
      .catch(function (error) {
        console.warn('[hediye-cubugu]', error)
      })
      .then(function () {
        busy = null
        if (again) {
          again = false
          sync()
        }
      })
    return busy
  }

  // Tema sepeti kendi isteğiyle değiştirdiğinde yeniden hesapla. Kendi isteklerimiz başlıkla ayrılır.
  var CART_WRITE = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/
  var timer = null
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(sync, 150)
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url
    var own = init && init.headers && init.headers['X-Hediye-Cubugu']
    var promise = nativeFetch(input, init)
    if (url && !own && CART_WRITE.test(url)) {
      promise.then(function (response) {
        if (response.ok) schedule()
      })
    }
    return promise
  }
  document.addEventListener('hediye-cubugu:yenile', schedule)
  window.addEventListener('pageshow', schedule)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync)
  else sync()
})(typeof globalThis !== 'undefined' ? globalThis : this)
