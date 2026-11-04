// Page-owned select control with a searchable model list and keyboard navigation.
class Dropdown {
  static opened
  constructor(root) {
    this.root = root
    this.items = []
    this.selected = ''
    this.blocked = false
    this.active = 0
    this.onchange = () => {}
    root.className = 'select-control'
    root.innerHTML = `<button type="button" class="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span class="select-value"></span><span class="select-chevron" aria-hidden="true"></span></button><div class="select-menu" hidden><input class="select-search" type="search" placeholder="搜索模型…" aria-label="搜索模型" autocomplete="off"><div class="select-options" role="listbox"></div><div class="select-empty" hidden>没有匹配的选项</div></div>`
    this.button = root.querySelector('button')
    this.valueText = root.querySelector('.select-value')
    this.menu = root.querySelector('.select-menu')
    this.search = root.querySelector('input')
    this.list = root.querySelector('[role="listbox"]')
    this.empty = root.querySelector('.select-empty')
    this.search.hidden = !root.hasAttribute('data-search')
    this.valueText.id = `${root.id}-value`
    this.list.id = `${root.id}-options`
    this.button.setAttribute('aria-labelledby', `${root.id}-label ${this.valueText.id}`)
    this.button.setAttribute('aria-controls', this.list.id)
    this.list.setAttribute('aria-labelledby', `${root.id}-label`)
    this.search.setAttribute('aria-controls', this.list.id)
    this.button.onclick = () => this.menu.hidden ? this.open() : this.close()
    this.search.oninput = () => { this.active = 0; this.renderOptions() }
    root.onkeydown = event => this.keydown(event)
    root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) this.close() })
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) this.close() })
    window.addEventListener('resize', () => this.close())
    this.update()
  }
  get options() { return this.items }
  get value() { return this.selected }
  set value(value) { this.selected = value; this.update() }
  set disabled(value) { this.blocked = value; this.update() }
  setOptions(items) {
    this.close()
    this.items = items
    this.selected = items[0]?.value ?? ''
    this.update()
  }
  update() {
    this.button.disabled = this.blocked || !this.items.length
    this.valueText.textContent = this.items.find(item => item.value === this.selected)?.label ?? '无可用选项'
    this.button.title = this.valueText.textContent
    if (this.button.disabled) this.close()
  }
  get filtered() {
    const query = this.search.value.trim().toLocaleLowerCase()
    return this.items.filter(item => item.label.toLocaleLowerCase().includes(query))
  }
  renderOptions() {
    const items = this.filtered
    this.active = Math.max(0, Math.min(this.active, items.length - 1))
    this.list.replaceChildren(...items.map((item, index) => {
      const row = document.createElement('div')
      row.className = 'select-option'
      row.id = `${this.root.id}-option-${index}`
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', String(item.value === this.selected))
      row.dataset.active = String(index === this.active)
      row.textContent = item.label
      row.title = item.label
      row.onpointerdown = event => event.preventDefault()
      row.onpointermove = () => this.highlight(index)
      row.onclick = () => this.choose(item.value)
      return row
    }))
    this.empty.hidden = items.length > 0
    this.highlight(this.active)
  }
  highlight(index) {
    this.active = index
    const rows = [...this.list.children]
    rows.forEach((row, i) => { row.dataset.active = String(i === index) })
    const active = rows[index]
    for (const field of [this.button, this.search]) {
      if (active) field.setAttribute('aria-activedescendant', active.id)
      else field.removeAttribute('aria-activedescendant')
    }
    active?.scrollIntoView({ block: 'nearest' })
  }
  open() {
    if (this.button.disabled) return
    Dropdown.opened?.close()
    Dropdown.opened = this
    this.search.value = ''
    this.active = Math.max(0, this.items.findIndex(item => item.value === this.selected))
    const rect = this.button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const upward = below < 280 && above > below
    this.root.dataset.side = upward ? 'above' : 'below'
    this.list.style.maxHeight = `${Math.max(60, Math.min(300, upward ? above : below) - (this.search.hidden ? 12 : 58))}px`
    this.menu.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    this.renderOptions()
    if (!this.search.hidden) this.search.focus()
  }
  close() {
    this.menu.hidden = true
    this.button.setAttribute('aria-expanded', 'false')
    this.button.removeAttribute('aria-activedescendant')
    this.search.removeAttribute('aria-activedescendant')
    if (Dropdown.opened === this) Dropdown.opened = undefined
  }
  choose(value) {
    const changed = this.selected !== value
    this.value = value
    this.close()
    this.button.focus()
    if (changed) this.onchange()
  }
  keydown(event) {
    const { key } = event
    if (key === 'Tab') { this.close(); return }
    if (key === 'Escape') {
      if (!this.menu.hidden) { event.preventDefault(); this.close(); this.button.focus() }
      return
    }
    if (key === ' ' && event.target === this.search) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) return
    event.preventDefault()
    if (this.menu.hidden) {
      this.open()
      if (key === 'Home') this.highlight(0)
      if (key === 'End') this.highlight(this.filtered.length - 1)
      return
    }
    const count = this.filtered.length
    if (!count) return
    if (key === 'ArrowDown') this.highlight(Math.min(count - 1, this.active + 1))
    if (key === 'ArrowUp') this.highlight(Math.max(0, this.active - 1))
    if (key === 'Home') this.highlight(0)
    if (key === 'End') this.highlight(count - 1)
    if (key === 'Enter' || key === ' ') this.choose(this.filtered[this.active].value)
  }
}
