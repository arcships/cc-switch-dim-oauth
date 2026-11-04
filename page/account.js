const $ = id => document.getElementById(id)
const session = document.querySelector('meta[name="dim-session"]').content
let catalog = [], poll, generation = 0, reset
const site = () => $('site').value
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error) }
async function api(path, body = {}) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dim-session': session }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败，请刷新后重试')
  return data
}
function run(action) { return async event => { const button = event?.currentTarget; if (button?.tagName === 'BUTTON') button.disabled = true; try { await action() } catch (error) { message(error.message, true) } finally { if (button?.tagName === 'BUTTON') button.disabled = false } } }
function option(value, label) { const item = document.createElement('option'); item.value = value; item.textContent = label; return item }
function invalidate() { $('import').hidden = true; $('import').removeAttribute('href') }
async function state() {
  const data = await api('state')
  if (!$('site').options.length) $('site').replaceChildren(...data.sites.map(item => option(item.id, item.label)))
  const current = data.sites.find(item => item.id === site())
  $('identity').textContent = current.account ? `${current.account} (${new URL(current.issuer).host})` : '登录后查看套餐、选择模型'
  $('logout').hidden = !current.account
  const pending = data.login?.status === 'pending'
  $('login').disabled = pending
  $('cancel').hidden = !pending
  if (!pending) { clearInterval(poll); poll = undefined; $('authorize').hidden = true }
  return { account: current.account, login: data.login }
}
async function load() {
  const current = ++generation
  invalidate(); $('account').hidden = true
  const value = await state(), selected = site()
  if (!value.account) return
  const results = await Promise.allSettled([api('view', { site: selected }), api('models', { site: selected })])
  if (current !== generation) return
  const [view, models] = results
  $('account').hidden = false
  document.querySelectorAll('[data-reset]').forEach(button => { button.disabled = true })
  $('windows').replaceChildren(); $('remaining').textContent = ''; $('plan').textContent = '套餐与用量'; $('term').textContent = ''
  if (view.status === 'fulfilled') renderView(view.value)
  else message(`用量暂时无法读取：${view.reason.message}`, true)
  if (models.status === 'fulfilled') renderModels(models.value.models)
  else { renderModels([]); message(`模型目录暂时无法读取：${models.reason.message}`, true) }
}
function renderView(view) {
  $('plan').textContent = view.plan?.name || '套餐与用量'
  $('term').textContent = view.plan?.end ? `本期截至 ${new Date(view.plan.end).toLocaleString('zh-CN')}` : ''
  $('subscription').href = view.subscriptionUrl; $('pricing').href = view.pricingUrl
  const total = view.windows.find(item => item.source === 'account' && item.name === 'Credits')
  $('remaining').textContent = total ? `账户剩余 ${total.amount.toLocaleString('zh-CN')} ${total.unit}（包含套餐余额）` : ''
  $('windows').replaceChildren(...view.windows.filter(item => item !== total).map(item => {
    const cell = document.createElement('div'); cell.className = 'window'
    const name = document.createElement('div'); name.textContent = item.name === 'Subscription' ? '套餐额度' : item.span ? `${item.span / 3600} 小时窗口` : item.name
    const value = document.createElement('strong'); value.textContent = item.display || (item.amount !== undefined && item.limit !== undefined ? `${item.amount.toLocaleString('zh-CN')} / ${item.limit.toLocaleString('zh-CN')} ${item.unit || ''}` : '未提供额度信息')
    cell.append(name, value)
    if (item.used !== undefined) { const progress = document.createElement('progress'); progress.max = 100; progress.value = Math.min(100, item.used); progress.setAttribute('aria-label', `${name.textContent}已使用 ${item.used.toFixed(1)}%`); cell.append(progress) }
    if (item.resetsAt) { const date = document.createElement('small'); date.textContent = `截至 ${new Date(item.resetsAt).toLocaleString('zh-CN')}`; cell.append(date) }
    return cell
  }))
  document.querySelectorAll('[data-reset]').forEach(button => { const count = view.resets[button.dataset.reset].available; button.textContent = `${button.dataset.reset === 'window' ? '重置限流窗口' : '重置月度额度'}（剩余 ${count} 次）`; button.disabled = count === 0 })
}
function renderModels(models) {
  const previous = $('model').value; catalog = models
  $('model').replaceChildren(...models.map(model => option(model.id, model.name + (model.zdr ? ' · ZDR' : ''))))
  if (models.some(model => model.id === previous)) $('model').value = previous
  $('generate').disabled = !models.length
  selection()
}
function selection() {
  invalidate()
  const model = catalog.find(item => item.id === $('model').value)
  $('protocol').replaceChildren(...(model?.protocols || []).filter(value => value !== 'gemini' || $('app').value === 'opencode').map(value => option(value, { openai: 'OpenAI Chat Completions', 'openai-response': 'OpenAI Responses', anthropic: 'Anthropic Messages', gemini: 'Gemini' }[value])))
  efforts()
  $('capability').textContent = model ? `请求模型：${model.id}${model.zdr ? ' · 零留存 ZDR' : ''}${model.efforts.length ? ` · 支持推理强度：${model.efforts.join('、')}` : ''}` : '当前没有可用模型，请刷新目录。'
}
function efforts() {
  invalidate()
  const model = catalog.find(item => item.id === $('model').value)
  const supported = $('app').value === 'codex' && ['openai', 'openai-response'].includes($('protocol').value)
  $('effort').replaceChildren(option('', '使用客户端默认值'), ...(supported ? model?.efforts || [] : []).map(value => option(value, value)))
  $('effort').disabled = !supported
  $('generate').disabled = !$('protocol').value
}
$('site').onchange = run(load)
$('model').onchange = selection; $('app').onchange = selection; $('protocol').onchange = efforts; $('effort').onchange = invalidate
$('login').onclick = run(async () => {
  const result = await api('login', { site: site() })
  $('authorize').href = result.url; $('authorize').hidden = false
  message('点击“前往授权页面”完成登录，授权后返回此页。')
  await state()
  poll = setInterval(async () => { try { const value = await state(); if (value.login?.status !== 'pending') { message(value.login?.status === 'success' ? '登录成功' : value.login?.status || '登录已取消'); await load() } } catch (error) { clearInterval(poll); message(error.message, true) } }, 2000)
})
$('cancel').onclick = run(async () => { await api('login/cancel'); message('登录已取消'); await state() })
$('logout').onclick = run(async () => { await api('logout', { site: site() }); message('已退出登录'); await load() })
$('refresh').onclick = run(load)
$('reload-models').onclick = run(async () => { const selected = site(); const result = await api('models', { site: selected }); if (selected === site()) renderModels(result.models) })
$('generate').onclick = run(async () => {
  const selected = site(), model = $('model').value, app = $('app').value, protocol = $('protocol').value, effort = $('effort').value
  const result = await api('import', { site: selected, model, app, protocol, effort })
  if (selected !== site() || model !== $('model').value || app !== $('app').value || protocol !== $('protocol').value || effort !== $('effort').value) return
  $('import').href = result.url; $('import').hidden = false
  message('点击“打开 CC Switch 导入”，在确认框中核对地址与模型。')
})
document.querySelectorAll('[data-reset]').forEach(button => button.onclick = run(async () => {
  const selected = site(), kind = button.dataset.reset
  const value = await api('reset/prepare', { site: selected, kind })
  reset = { site: selected, confirmation: value.confirmation }
  $('reset-details').textContent = `账号：${value.account}\n站点：${value.issuer}\n套餐：${value.plan || '当前套餐'}（订阅 ${value.subscriptionId}）\n操作：${kind === 'window' ? '重置限流窗口' : '重置月度额度'}\n可用次数：${value.available}\n${value.detailsUnavailable ? '批次详情暂时无法读取，实际可用次数由服务端确认。' : value.batches.map(batch => `${batch.count} 次，截至 ${new Date(batch.expiresAt).toLocaleString('zh-CN')}`).join('\n')}`
  $('reset-message').textContent = ''; $('dismiss').disabled = false; $('confirmation').showModal()
}))
$('dismiss').onclick = () => $('confirmation').close()
$('apply').onclick = async () => {
  $('apply').disabled = true; $('dismiss').disabled = true
  try { await api('reset/apply', reset); $('confirmation').close(); message('额度已重置'); await load() }
  catch (error) { $('reset-message').textContent = `${error.message}。可以重试；本次确认会复用同一个幂等标识。` }
  finally { $('apply').disabled = false; $('dismiss').disabled = false }
}
$('confirmation').addEventListener('cancel', event => { if ($('apply').disabled) event.preventDefault() })
load().catch(error => message(error.message, true))
