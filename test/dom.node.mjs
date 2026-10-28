/**
 * 无浏览器自测：用最小 DOM 替身跑一遍 client.js 的 apply()。
 * 跑法：node test/dom.node.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

/** 解析我们用到的那几种属性选择器：[name]、[name="v"]、[name*="v"]、[name^="v"]。 */
function matches(el, selector) {
  /* 支持三种形状：tag、tag[attr...]、[attr...] */
  const m = /^([a-zA-Z][\w-]*)?(?:\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\])?$/.exec(selector)
  if (m === null || (m[1] === undefined && m[2] === undefined)) {
    throw new Error('unsupported selector: ' + selector)
  }
  const [, tag, name, op, value] = m
  if (tag !== undefined && el.tagName !== tag.toUpperCase()) return false
  if (name === undefined) return true
  const raw = name === 'class' ? el.className : el.getAttribute(name)
  if (name === 'class' && op === undefined) return el.className !== ''
  if (raw === null) return false
  if (op === undefined) return true
  if (op === '=') return raw === value
  if (op === '*=') return raw.includes(value)
  if (op === '^=') return raw.startsWith(value)
  if (op === '$=') return raw.endsWith(value)
  return false
}

class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase()
    this.attrs = new Map(Object.entries(attrs))
    this.children = []
    this.parent = null
    this.style = {}
    this.className = attrs.class ?? ''
    this.listeners = new Map()
    this.textContent = ''
    /* dataset: camelCase ↔ data-kebab-case */
    const keyOf = (prop) => 'data-' + String(prop).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    this.dataset = new Proxy({}, {
      get: (_, prop) => (this.attrs.has(keyOf(prop)) ? this.attrs.get(keyOf(prop)) : undefined),
      set: (_, prop, value) => { this.attrs.set(keyOf(prop), String(value)); return true },
      deleteProperty: (_, prop) => { this.attrs.delete(keyOf(prop)); return true },
    })
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)) }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null }
  hasAttribute(k) { return this.attrs.has(k) }
  removeAttribute(k) { this.attrs.delete(k) }
  toggleAttribute(k, force) {
    const want = force === undefined ? !this.attrs.has(k) : Boolean(force)
    if (want) this.attrs.set(k, '')
    else this.attrs.delete(k)
    return want
  }
  appendChild(child) { child.parent = this; this.children.push(child); return child }
  insertBefore(child, ref) {
    child.parent = this
    const at = ref === null || ref === undefined ? -1 : this.children.indexOf(ref)
    if (at < 0) this.children.push(child)
    else this.children.splice(at, 0, child)
    return child
  }
  removeChild(child) {
    const at = this.children.indexOf(child)
    if (at >= 0) this.children.splice(at, 1)
    child.parent = null
  }
  remove() { if (this.parent !== null) this.parent.removeChild(this) }
  get firstChild() { return this.children.length > 0 ? this.children[0] : null }
  get parentElement() { return this.parent }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }
  dispatch(type) {
    const event = {
      type,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() { this.propagationStopped = true },
    }
    for (const fn of this.listeners.get(type) ?? []) fn(event)
    return event
  }
  *walk() {
    for (const child of this.children) {
      yield child
      yield* child.walk()
    }
  }
  querySelectorAll(selector) { return [...this.walk()].filter((el) => matches(el, selector)) }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  closest(selector) {
    let node = this
    while (node !== null) {
      if (matches(node, selector)) return node
      node = node.parent
    }
    return null
  }
}

const body = new El('body')
const head = new El('head')
const raf = (fn) => { fn(0); return 1 }
const document = {
  body,
  head,
  /* 插件从 document.defaultView 取 localStorage / requestAnimationFrame */
  defaultView: { localStorage: null, requestAnimationFrame: raf },
  createElement: (tag) => new El(tag),
  querySelector: (selector) => (body.matches?.(selector) ? body : null) ?? body.querySelector(selector) ?? head.querySelector(selector),
  querySelectorAll: (selector) => [...body.querySelectorAll(selector), ...head.querySelectorAll(selector)],
}
function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}
const localStorage = makeStorage()
document.defaultView.localStorage = localStorage

let captured
const context = {
  window: { __ModuleLoader__: { load: (spec) => { captured = spec } } },
  document,
  localStorage,
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (fn) => { fn(0); return 1 },
  console,
  encodeURIComponent,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Boolean,
  Error,
  Number,
}
context.globalThis = context
context.window.document = document
context.window.localStorage = localStorage
context.window.requestAnimationFrame = context.requestAnimationFrame

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
vm.runInNewContext(source, context, { filename: 'client.js' })
assert.ok(captured, 'client.js 应该调用 __ModuleLoader__.load')
assert.equal(captured.id, '@ggxx/dsh-workspace-pin')

/* ---------- 搭一棵和侧栏同构的树 ---------- */

const tree = new El('div', { role: 'tree', class: 'cIzfCa_list' })
body.appendChild(tree)

function addWorkspace(id, label) {
  const section = new El('div', { class: 'cIzfCa_groupSection' })
  const row = new El('div', { class: 'qZBEgG_projectRow', 'data-row-key': 'workspace:' + id })
  const folder = new El('span', { class: 'qZBEgG_slot qZBEgG_folder' })
  folder.appendChild(new El('svg'))
  const text = new El('span', { class: 'qZBEgG_projectText' })
  text.textContent = label
  const actions = new El('span', { class: 'qZBEgG_rowActions' })
  actions.appendChild(new El('button', { class: 'qZBEgG_iconButton' }))
  actions.appendChild(new El('button', { class: 'qZBEgG_iconButton' }))
  row.appendChild(folder)
  row.appendChild(text)
  row.appendChild(actions)
  section.appendChild(row)
  tree.appendChild(section)
  return { section, row, actions }
}

const a = addWorkspace('w-a', '插件工坊')
const b = addWorkspace('w-b', 'deepseek 插件')
const c = addWorkspace('w-c', '临时目录')
const ungrouped = addWorkspace('', '未分组')

/* ---------- 装插件 ---------- */

const cleanups = []
const ctx = {
  effect(fn) { const disposer = fn(); if (typeof disposer === 'function') cleanups.push(disposer); return disposer },
  locale: { register() {}, bind: () => (key) => key },
}
const plugin = captured.factory(() => { throw new Error('不该 require 任何模块') })
assert.equal(typeof plugin.apply, 'function')
plugin.apply(ctx)

const pinOf = (row) => row.querySelector('[data-dsh-ws-pin]')

/* 每个真工作区都有图钉按钮，且排在动作区最前 */
for (const [name, ws] of [['a', a], ['b', b], ['c', c]]) {
  const btn = pinOf(ws.row)
  assert.ok(btn, name + ' 应该有图钉按钮')
  assert.equal(ws.actions.children[0], btn, name + ' 的图钉应该在动作区最前')
  assert.equal(btn.className, 'qZBEgG_iconButton', '应复用行内按钮的类名')
  assert.equal(btn.getAttribute('aria-label'), 'pin.add')
}
assert.equal(pinOf(ungrouped.row), null, '「未分组」不该有图钉')

/* 点 c 的图钉 → c 排最前 */
pinOf(c.row).dispatch('click')
assert.deepEqual(JSON.parse(localStorage.getItem('dsh.workspace-pin.v1')), ['w-c'])
assert.equal(c.section.style.order, '0')
assert.ok(Number(a.section.style.order) > 999, '未置顶的排在 1000 以后')
assert.ok(Number(ungrouped.section.style.order) > 999, '「未分组」也要参与编号，不能被默认 order:0 插到置顶中间')
assert.ok(Number(b.section.style.order) > Number(a.section.style.order), '未置顶的保持原 DOM 顺序')
assert.ok(tree.hasAttribute('data-dsh-ws-order'), '容器应标记成纵向 flex')
assert.ok(c.row.hasAttribute('data-dsh-ws-pinned'), 'c 行应带置顶标记')
assert.equal(pinOf(c.row).getAttribute('aria-label'), 'pin.remove')

/* 再点一次 → 取消置顶，order 清空 */
pinOf(c.row).dispatch('click')
assert.deepEqual(JSON.parse(localStorage.getItem('dsh.workspace-pin.v1')), [])
assert.equal(c.section.style.order, '')
assert.ok(!tree.hasAttribute('data-dsh-ws-order'))
assert.ok(!c.row.hasAttribute('data-dsh-ws-pinned'))

/* 先钉 b 再钉 a → 最近钉的 a 在最前 */
pinOf(b.row).dispatch('click')
pinOf(a.row).dispatch('click')
assert.deepEqual(JSON.parse(localStorage.getItem('dsh.workspace-pin.v1')), ['w-a', 'w-b'])
assert.equal(a.section.style.order, '0')
assert.equal(b.section.style.order, '1')
assert.ok(Number(c.section.style.order) > 999)

/* 重复 sync 幂等：按钮不重复、order 稳定 */
const before = tree.querySelectorAll('[data-dsh-ws-pin]').length
plugin.apply(ctx)
assert.equal(tree.querySelectorAll('[data-dsh-ws-pin]').length, before, '重复装配不应产生重复按钮')

/* 卸载：按钮与标记全部回收 */
for (const dispose of cleanups.reverse()) dispose()
assert.equal(tree.querySelectorAll('[data-dsh-ws-pin]').length, 0)
assert.equal(tree.querySelectorAll('[data-dsh-ws-pinned]').length, 0)
assert.equal(tree.querySelectorAll('[data-dsh-ws-order]').length, 0)

console.log('✓ workspace-pin 自测通过：按钮插入 / 置顶排序 / 取消置顶 / 幂等 / 卸载清理')
