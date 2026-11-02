// Read only: rendered official form requirements, never reportValidity(),
// submission, private page stores, credentials, or guessed declaration values.
function publishValidation(input = {}, componentRoots = []) {
  const query = selector => [...new Set([document, ...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const parent = node => node.parentElement || node.getRootNode?.().host;
  const visible = node => {
    if (!node?.isConnected || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
    const bounds = node.getBoundingClientRect(); if (!(bounds.width > 0 && bounds.height > 0)) return false;
    for (let el = node; el; el = parent(el)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const normalize = text => String(text || '').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const label = el => normalize([el.getAttribute('aria-label'), ...[...(el.labels || [])].map(node => node.innerText),
    ...(el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => query('[id]').find(node => node.id === id)?.innerText),
    el.getAttribute('placeholder'), el.getAttribute('data-placeholder')].filter(Boolean).join(' ')).slice(0, 100);
  const safe = el => !/password|one-time-code|username|email|tel|token|secret|密码|验证码|手机号|邮箱|身份证|密钥/i.test([el.type, el.name, el.id, el.autocomplete, label(el)].join(' '));
  const textControl = el => el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'combobox';
  const read = el => normalize(el.isContentEditable ? el.innerText : el.value ?? el.getAttribute('aria-valuetext') ?? '');
  const controls = query('input,textarea,select,[contenteditable=true],[role=combobox]').filter(el => visible(el) && safe(el) && textControl(el));
  const errors = [];
  const add = (field, message, code, source) => {
    if (errors.length < 12 && !errors.some(error => error.field === field && error.message === message)) errors.push({field, message, code, source});
  };
  // After a click, an empty/reset form is not evidence of rejection. Only
  // explicit system errors in the SAME inspected document/task may be used.
  if (input.phase === 'after_submit') {
    const state = window.__matrixPageAction;
    if (!input.nonce || state?.nonce !== input.nonce || state.kind !== 'publish' || state.used !== true || state.url !== location.href) return {version:1, errors:[], inspected:false};
    if (input.expectedTitle && !controls.some(el => !el.readOnly && read(el) === input.expectedTitle)) return {version:1, errors:[], inspected:false};
  } else {
    for (const el of controls.slice(0, 80)) {
      if (['hidden', 'file', 'submit', 'button', 'reset'].includes(el.type)) continue;
      const name = label(el) || '官方必填项';
      const required = el.required || el.getAttribute('aria-required') === 'true';
      const empty = ['checkbox', 'radio'].includes(el.type) ? !el.checked : !read(el);
      if (required && empty) {
        if (el.type === 'radio' && el.name && controls.some(other => other.type === 'radio' && other.name === el.name && other.form === el.form && other.checked)) continue;
        add(name, `${name}：请补全官方必填项`, 'required', 'official_required_control');
      } else if (el.validity && !el.validity.valid && !el.validity.customError) add(name, `${name}：格式不符合官方要求`, 'invalid', 'official_control_validity');
    }
    if (location.hostname === 'member.bilibili.com' && /^\/platform\/upload\/video(?:\/|$)/.test(location.pathname)) {
      const declarations = controls.filter(el => el.placeholder === '请选择符合您视频内容的创作声明' || el.getAttribute('aria-label') === '创作声明');
      if (declarations.length !== 1) add('创作声明', '创作声明：未唯一识别官方控件，尚未提交', 'ambiguous_required_control', 'official_bilibili_form');
      else if (!read(declarations[0])) add('创作声明', '创作声明：请先选择符合实际内容的声明', 'required', 'official_bilibili_form');
    }
  }
  // Short, rendered system error nodes only. Never aggregate a whole form,
  // read authored descriptions, or include validationMessage with input data.
  const selectors = '[role=alert],.ant-form-item-explain-error,.el-form-item__error,.semi-form-field-error-message,.bcc-form-item__error,.bcc-form-item-error,.form-item-error,.form-error,.validate-error,[class*=message-error]';
  for (const el of query(selectors)) {
    if (!visible(el) || !safe(el) || el.matches('input,textarea,[contenteditable]') || el.closest('textarea,[contenteditable],article,[class*=comment]') || el.querySelector('input,textarea,[contenteditable]')) continue;
    const message = normalize(el.innerText || el.textContent);
    if (!message || message.length > 200 || !/请(?:填写|输入|选择|添加|上传|设置|补充|完善)|不能为空|必填|不支持|(?:发布|投稿|上传|转码|审核)失败|不符合|超过.{0,12}(?:限制|上限)/.test(message)) continue;
    add('官方表单', message, 'inline_error', 'official_inline_validation');
  }
  for (const el of controls.filter(el => el.getAttribute('aria-invalid') === 'true')) {
    const ids = (el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const name = label(el) || '官方表单';
    const descriptions = ids.flatMap(id => query('[id]').filter(node => node.id === id && visible(node) && safe(node) && !node.querySelector('input,textarea,[contenteditable]')));
    const messages = descriptions.map(node => normalize(node.innerText || node.textContent)).filter(value => value.length > 0 && value.length <= 200 && /请|不能为空|必填|不支持|失败|不符合|超过/.test(value));
    if (messages.length === 1) add(name, messages[0], 'inline_error', 'official_inline_validation');
    else add(name, `${name}：官方标记此项未通过校验`, 'invalid', 'official_aria_invalid');
  }
  return {version:1, errors, inspected:true};
}
module.exports = {publishValidation};
