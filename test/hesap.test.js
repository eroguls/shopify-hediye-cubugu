import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

// Tema dosyası klasik betik; Node’da tarayıcı nesneleri olmadan yalnızca hesap kısmı yüklenir.
const source = readFileSync(new URL('../assets/hediye-cubugu.js', import.meta.url), 'utf8')
const context = {}
vm.runInNewContext(source, context)
const { plan, formatMoney, message, eligibleSubtotal } = context.HediyeCubugu

const config = {
  kademeler: [
    { esik: 300000, etiket: 'Kolye', hediyeler: [{ id: 30, baslik: 'Kolye', stokta: true }] },
    {
      esik: 150000,
      etiket: 'Bileklik',
      hediyeler: [
        { id: 10, baslik: 'Bileklik – Gümüş', stokta: false },
        { id: 11, baslik: 'Bileklik – Altın', stokta: true },
        { id: 12, baslik: 'Bileklik – Rose', stokta: true },
      ],
    },
  ],
}

const line = (key, variant, price, quantity = 1, properties = {}) => ({
  key,
  variant_id: variant,
  quantity,
  final_line_price: price,
  line_price: price,
  properties,
})
const gift = (key, variant, label, quantity = 1) => line(key, variant, 0, quantity, { _hediye: label })
const plain = (value) => JSON.parse(JSON.stringify(value))

test('eşiğin altında hediye eklenmez, kalan tutar ve yüzde hesaplanır', () => {
  const state = plan({ items: [line('a', 1, 90000)] }, config)
  assert.equal(state.kademe, null)
  assert.equal(state.sonraki.etiket, 'Bileklik')
  assert.equal(state.kalan, 60000)
  assert.equal(state.yuzde, 60)
  assert.deepEqual(plain(state.islemler), [])
})

test('eşiğe ulaşınca stoktaki ilk hediye özellikle eklenir', () => {
  const state = plan({ items: [line('a', 1, 150000)] }, config)
  assert.equal(state.kademe.etiket, 'Bileklik')
  assert.equal(state.secili.id, 11, 'stokta olmayan varyant atlanır')
  assert.deepEqual(plain(state.islemler), [{ tur: 'ekle', id: 11, adet: 1, ozellikler: { _hediye: 'Bileklik' } }])
  assert.equal(state.sonraki.etiket, 'Kolye')
})

test('hediyenin kendisi eşiğe sayılmaz', () => {
  const cart = { items: [line('a', 1, 149000), line('b', 11, 2000, 1, { _hediye: 'Bileklik' })] }
  assert.equal(eligibleSubtotal(cart), 149000)
  assert.deepEqual(plain(plan(cart, config).islemler), [{ tur: 'adet', anahtar: 'b', adet: 0 }])
})

test('ziyaretçinin seçimi uygulanır, eski hediye çıkarılır', () => {
  const cart = { items: [line('a', 1, 160000), gift('g', 11, 'Bileklik')] }
  const state = plan(cart, config, '12')
  assert.equal(state.secili.id, 12)
  assert.deepEqual(plain(state.islemler), [
    { tur: 'adet', anahtar: 'g', adet: 0 },
    { tur: 'ekle', id: 12, adet: 1, ozellikler: { _hediye: 'Bileklik' } },
  ])
})

test('geçersiz seçim varsayılana döner; hediye adedi 1’e indirilir', () => {
  const cart = { items: [line('a', 1, 160000), gift('g', 11, 'Bileklik', 3)] }
  assert.deepEqual(plain(plan(cart, config, '999').islemler), [{ tur: 'adet', anahtar: 'g', adet: 1 }])
})

test('üst kademede tek hediye kalır', () => {
  const cart = { items: [line('a', 1, 320000), gift('g', 11, 'Bileklik')] }
  const state = plan(cart, config)
  assert.equal(state.kademe.etiket, 'Kolye')
  assert.equal(state.sonraki, null)
  assert.equal(state.yuzde, 100)
  assert.deepEqual(plain(state.islemler), [
    { tur: 'adet', anahtar: 'g', adet: 0 },
    { tur: 'ekle', id: 30, adet: 1, ozellikler: { _hediye: 'Kolye' } },
  ])
})

test('fazladan eklenen hediye satırları temizlenir', () => {
  const cart = { items: [line('a', 1, 160000), gift('g1', 11, 'Bileklik'), gift('g2', 11, 'Bileklik')] }
  assert.deepEqual(plain(plan(cart, config).islemler), [{ tur: 'adet', anahtar: 'g2', adet: 0 }])
})

test('elle eklenen aynı ürün hediye sayılmaz', () => {
  const cart = { items: [line('a', 1, 160000), line('m', 11, 2000)] }
  assert.equal(plan(cart, config).islemler[0].tur, 'ekle')
})

test('kur ile eşikler ölçeklenir', () => {
  const state = plan({ items: [line('a', 1, 4000)] }, { ...config, kur: '0.03' })
  assert.equal(state.sonraki.esik, 4500)
  assert.equal(state.kalan, 500)
})

test('hediyelerin hepsi tükenmişse işlem yapılmaz', () => {
  const soldOut = { kademeler: [{ esik: 100, etiket: 'X', hediyeler: [{ id: 1, stokta: false }] }] }
  const state = plan({ items: [line('a', 1, 500), gift('g', 1, 'X')] }, soldOut)
  assert.equal(state.secili, null)
  assert.deepEqual(plain(state.islemler), [{ tur: 'adet', anahtar: 'g', adet: 0 }])
})

test('para biçimleri', () => {
  assert.equal(formatMoney(124990, '{{amount_with_comma_separator}} TL'), '1.249,90 TL')
  assert.equal(formatMoney(124990, '{{amount_no_decimals_with_comma_separator}} TL'), '1.250 TL')
  assert.equal(formatMoney(124990, '${{amount}}'), '$1,249.90')
  assert.equal(formatMoney(5, '{{ amount }}'), '0.05')
})

test('mesajlar', () => {
  const settings = { ...config, paraBicimi: '{{amount_with_comma_separator}} TL' }
  assert.equal(message(plan({ items: [line('a', 1, 90000)] }, settings), settings), '600,00 TL daha ekleyin, Bileklik hediye.')
  assert.equal(message(plan({ items: [line('a', 1, 300000)] }, settings), settings), 'Kolye hediyeniz sepette.')
  assert.equal(message(plan({ items: [] }, settings), { ...settings, metinler: { kalan: 'Kalan {tutar}' } }), 'Kalan 1.500,00 TL')
})
