/**
 * 工作区置顶（Client 半）—— 给侧栏「工作区」的每一行加一个图钉按钮。
 *
 * ## 为什么是 DOM 层
 *
 * @deepseek-ai/dsh-client-ui-workspace 只给 **会话行** 留了扩展 slot
 * （sidebar.workspaces.session.menu.item / .row.action），**工作区行**没有：
 * 那一行的「…」和「新建会话」是 ProjectRowItem 里写死的两个 React 节点
 * （ui-workspace/lib/client.js 里 workspaceMenuItems + rowActions 一段），
 * 宿主也没有「工作区置顶」这回事（注册表只记 workspaceIds 的显示顺序，
 * 置顶/归档只是 **会话** 的集合）。
 *
 * 所以本插件只在 DOM 层做事，并且守着 dsh-pet/src/client/nav-icon.ts 同一条底线：
 * **不改写 React 管的节点**（replaceWith 会让 React 卸载时 removeChild 崩），
 * 只 ① 往 rowActions 里 **插一个新按钮**、② 打 data-* 标记、③ 给
 * groupSection 写一句 style.order。React 全程不 diff 这些东西。
 *
 * ## 排序为什么用 flex 的 order
 *
 * 工作区列表是 div[role="tree"]，默认 display:block，子节点就是每个工作区的
 * div[class*="groupSection"]（前面可能还有一个空状态块）。把容器改成纵向 flex，
 * 给每个 section 一个整数 order（置顶的 0..n-1，其余 1000+n），视觉顺序就变了，
 * 而 DOM 顺序、拖拽、React 的 key 全都不动 —— 比 insertBefore 搬节点安全得多。
 *
 * ## 局限
 *
 * · 只重排列表的 **顶层** 工作区；「按工作区树」里被嵌套的子工作区即使置顶，
 *   也不会飞跃到根级（它跟着父级走）。
 * · 顺序存在本机 localStorage（dsh.workspace-pin.v1），换机器/清缓存会丢。
 * · 选择器依赖 CSS Modules 的 **类名后缀**（groupSection / rowActions /
 *   folder），DSH 改样式名时会静默失效（按钮不出现），但绝不会弄坏界面。
 */

window.__ModuleLoader__.load({
  id: '@ggxx/dsh-workspace-pin',
  factory(require) {
    const PLUGIN_ID = '@ggxx/dsh-workspace-pin';
    const NS = 'workspacePin';
    const STORAGE_KEY = 'dsh.workspace-pin.v1';
    const DEBUG_KEY = 'dsh.workspace-pin.debug';

    /** 工作区行的行键前缀；行键就是 workspace:<workspaceId>（key === workspaceId）。 */
    const ROW_PREFIX = 'workspace:';
    const ROW_SELECTOR = '[data-row-key^="workspace:"]';
    /** CSS Modules 名：哈希前缀会随构建变，只匹配名字部分。 */
    const SECTION_SELECTOR = '[class*="groupSection"]';
    const ACTIONS_SELECTOR = '[class*="rowActions"]';
    const FOLDER_SELECTOR = '[class*="folder"]';
    const TITLE_SELECTOR = '[class*="title"]';
    /** 我们自己打的三类标记（React 从不 diff）。 */
    const PIN_ATTR = 'data-dsh-ws-pinned';
    const ORDER_ATTR = 'data-dsh-ws-order';
    const BTN_ATTR = 'data-dsh-ws-pin';
    const ID_ATTR = 'data-dsh-pin-id';

    const zh = {
      'pin.add': '置顶工作区',
      'pin.remove': '取消置顶',
    };
    const en = {
      'pin.add': 'Pin workspace',
      'pin.remove': 'Unpin workspace',
    };

    /** 图钉字形（24 网格、描边），按钮里当图标、置顶行的文件夹位当 mask 用。 */
    const PIN_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="M12 17v5"/>' +
      '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>' +
      '</svg>';

    /** 内联 SVG → 可作 CSS mask 的 data URI（补 xmlns、把 currentColor 定成不透明黑）。 */
    function svgMaskUri(svg) {
      const source = String(svg).trim();
      if (source === '') return '';
      const namespaced = /<svg[^>]*\sxmlns=/i.test(source)
        ? source
        : source.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      return 'url("data:image/svg+xml,' + encodeURIComponent(namespaced.split('currentColor').join('#000')) + '")';
    }

    const PIN_MASK = svgMaskUri(PIN_SVG);

    const CSS = [
      '/* 工作区置顶：图钉按钮 + 置顶标记 + flex 排序（见 dsh-workspace-pin/client.js 头部注释） */',
      '[' + BTN_ATTR + '] svg{width:14px;height:14px;display:block}',
      '[' + BTN_ATTR + '][data-active]{color:var(--dsw-alias-state-business-primary)}',
      '/* 置顶标记：标题前面一枚图钉（皮肤把文件夹图标换成了自己的图，不能只靠它） */',
      '[' + PIN_ATTR + '] ' + TITLE_SELECTOR + '::before{content:"";display:inline-block;width:12px;height:12px;',
      'margin-right:4px;vertical-align:-1px;background-color:var(--dsw-alias-state-business-primary);',
      '-webkit-mask:' + PIN_MASK + ' center/12px 12px no-repeat;mask:' + PIN_MASK + ' center/12px 12px no-repeat}',
      '/* 兜底：默认皮肤下把文件夹图标位也换成图钉 */',
      '[' + PIN_ATTR + '] ' + FOLDER_SELECTOR + '>svg{display:none}',
      '[' + PIN_ATTR + '] ' + FOLDER_SELECTOR + '::before{content:"";display:block;width:16px;height:16px;',
      'background-color:var(--dsw-alias-state-business-primary);',
      '-webkit-mask:' + PIN_MASK + ' center/16px 16px no-repeat;',
      'mask:' + PIN_MASK + ' center/16px 16px no-repeat}',
      '/* 排序：容器临时变纵向 flex，order 生效；子项不压缩，滚动与原来的块布局一致 */',
      '[' + ORDER_ATTR + ']{display:flex;flex-direction:column}',
      '[' + ORDER_ATTR + ']>*{flex:0 0 auto}',
    ].join('\n');

    /** 读置顶列表（最近置顶的在前）；坏数据当空。 */
    function readPins(storage) {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((id) => typeof id === 'string' && id !== '');
      } catch (error) {
        return [];
      }
    }

    function writePins(storage, list) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (error) {
        /* 存不进去（隐私模式 / 配额满）就只在本次会话里生效，不影响功能 */
      }
    }

    function injectCss(doc) {
      const selector = 'style[data-plugin-css="' + PLUGIN_ID + '"]';
      const previous = doc.querySelector(selector);
      if (previous !== null) previous.remove();
      const tag = doc.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = PLUGIN_ID;
      tag.textContent = CSS;
      doc.head.appendChild(tag);
      return tag;
    }

    function describe(error) {
      return error instanceof Error ? error.message : String(error);
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-pin: dictionaries');
        const t = ctx.locale.bind(NS);

        ctx.effect(() => {
          const doc = typeof document === 'undefined' ? undefined : document;
          const Observer = typeof MutationObserver === 'undefined' ? undefined : MutationObserver;
          if (doc === undefined || Observer === undefined || doc.body === null) {
            console.warn('[workspace-pin] 侧栏置顶不可用：缺少 document / body / MutationObserver');
            return () => {};
          }
          let storage;
          try {
            storage = doc.defaultView ? doc.defaultView.localStorage : undefined;
          } catch (error) {
            storage = undefined;
          }
          if (storage === undefined || storage === null) {
            console.warn('[workspace-pin] 侧栏置顶不可用：读不到 localStorage');
            return () => {};
          }

          const styleTag = injectCss(doc);
          const pins = { list: readPins(storage) };
          let frame = 0;
          let busy = false;
          let warned = false;
          let lastDebug = '';

          const debug = (payload) => {
            let text;
            try {
              text = JSON.stringify(payload);
            } catch (error) {
              return;
            }
            if (text === lastDebug) return;
            lastDebug = text;
            try {
              storage.setItem(DEBUG_KEY, text);
            } catch (error) {
              /* 诊断信息写不进去不影响功能 */
            }
          };

          const setOrder = (section, value) => {
            const text = String(value);
            if (section.style.order !== text) section.style.order = text;
          };

          /** 让一个容器按置顶顺序重排：置顶的 0..n-1，其余保持 DOM 顺序排 1000+。 */
          const applyOrder = (container, entries) => {
            if (entries.length === 0) return;
            if (pins.list.length === 0) {
              for (const entry of entries) setOrder(entry.section, '');
              if (container.hasAttribute(ORDER_ATTR)) container.removeAttribute(ORDER_ATTR);
              if (container.style.display !== '') container.style.display = '';
              if (container.style.flexDirection !== '') container.style.flexDirection = '';
              return;
            }
            const byId = new Map();
            for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
            const used = new Set();
            let next = 0;
            for (const id of pins.list) {
              const hit = byId.get(id);
              if (hit === undefined || used.has(hit)) continue;
              used.add(hit);
              setOrder(hit.section, next);
              next += 1;
            }
            for (const entry of entries) {
              if (used.has(entry)) continue;
              setOrder(entry.section, 1000 + next);
              next += 1;
            }
            if (!container.hasAttribute(ORDER_ATTR)) container.setAttribute(ORDER_ATTR, '');
            if (container.style.display !== 'flex') container.style.display = 'flex';
            if (container.style.flexDirection !== 'column') container.style.flexDirection = 'column';
          };

          /** 在工作区行的动作区里放一个图钉按钮；已存在就只刷新状态。 */
          const ensureButton = (actions, id, pinned) => {
            let button = actions.querySelector('[' + BTN_ATTR + ']');
            if (button === null) {
              button = doc.createElement('button');
              button.type = 'button';
              button.setAttribute(BTN_ATTR, '');
              const sample = actions.querySelector('button');
              if (sample !== null && sample.className !== '') button.className = sample.className;
              button.innerHTML = PIN_SVG;
              button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const target = button.getAttribute('data-dsh-pin-id') || '';
                if (target === '') return;
                toggle(target);
              });
              button.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
              });
              /* 放在「…」和「新建会话」左边：图钉 · 省略 · 新会话 */
              actions.insertBefore(button, actions.firstChild);
            }
            if (button.getAttribute('data-dsh-pin-id') !== id) button.setAttribute('data-dsh-pin-id', id);
            const label = t(pinned ? 'pin.remove' : 'pin.add');
            if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
            if (button.getAttribute('title') !== label) button.setAttribute('title', label);
            if (button.getAttribute('aria-pressed') !== String(pinned)) button.setAttribute('aria-pressed', String(pinned));
            if (button.hasAttribute('data-active') !== pinned) button.toggleAttribute('data-active', pinned);
          };

          const toggle = (id) => {
            const at = pins.list.indexOf(id);
            if (at === -1) pins.list.unshift(id);
            else pins.list.splice(at, 1);
            writePins(storage, pins.list);
            sync();
          };

          /** 一次同步：补按钮、打标记、按容器算 order。幂等。 */
          const sync = () => {
            if (busy) return;
            busy = true;
            try {
              const rows = Array.from(doc.querySelectorAll(ROW_SELECTOR));
              if (rows.length === 0) {
                debug({ v: 2, at: Date.now(), rows: 0 });
                return;
              }
              const entries = [];
              for (const row of rows) {
                const key = row.getAttribute('data-row-key') || '';
                const id = key.slice(ROW_PREFIX.length);
                const section = row.closest(SECTION_SELECTOR);
                if (section === null) continue;
                if (id !== '') {
                  const actions = row.querySelector(ACTIONS_SELECTOR);
                  if (actions === null) continue;
                  const pinned = pins.list.indexOf(id) !== -1;
                  ensureButton(actions, id, pinned);
                  if (row.hasAttribute(PIN_ATTR) !== pinned) row.toggleAttribute(PIN_ATTR, pinned);
                  if (section.getAttribute(ID_ATTR) !== id) section.setAttribute(ID_ATTR, id);
                }
                /* 「未分组」没有图钉按钮，但它也占一个位置，排序时必须一起编号，
                   否则默认 order:0 会插到置顶项中间。 */
                entries.push({ id, section });
              }
              /* 按「分组所在父容器」分组：侧栏可能同时存在 rail / 抽屉等多个列表 */
              const containers = new Map();
              for (const entry of entries) {
                const parent = entry.section.parentElement;
                if (parent === null) continue;
                const list = containers.get(parent);
                if (list === undefined) containers.set(parent, [entry]);
                else list.push(entry);
              }
              for (const [container, list] of containers) applyOrder(container, list);
              const report = [];
              for (const [container, list] of containers) {
                report.push({
                  role: container.getAttribute('role'),
                  cls: String(container.className).slice(0, 40),
                  n: list.length,
                  display: container.style.display || '',
                });
              }
              debug({
                v: 2,
                at: Date.now(),
                rows: rows.length,
                entries: entries.length,
                pins: pins.list.map((id) => id.slice(0, 8)),
                containers: report,
                orders: entries.map((entry) => [entry.id.slice(0, 8), entry.section.style.order]),
              });
            } catch (error) {
              debug({ v: 2, at: Date.now(), error: describe(error) });
              if (!warned) {
                warned = true;
                console.warn('[workspace-pin] 本次跳过（界面照旧）：' + describe(error));
              }
            } finally {
              busy = false;
            }
          };

          const schedule = () => {
            if (frame !== 0) return;
            const raf = doc.defaultView ? doc.defaultView.requestAnimationFrame : undefined;
            if (typeof raf === 'function') {
              frame = raf(() => {
                frame = 0;
                sync();
              });
            } else {
              frame = 1;
              sync();
              frame = 0;
            }
          };

          sync();
          const observer = new Observer(schedule);
          observer.observe(doc.body, { childList: true, subtree: true });

          return () => {
            observer.disconnect();
            for (const button of Array.from(doc.querySelectorAll('[' + BTN_ATTR + ']'))) button.remove();
            for (const row of Array.from(doc.querySelectorAll('[' + PIN_ATTR + ']'))) row.removeAttribute(PIN_ATTR);
            const containers = new Set();
            for (const section of Array.from(doc.querySelectorAll('[' + ID_ATTR + ']'))) {
              section.removeAttribute(ID_ATTR);
              section.style.order = '';
              if (section.parentElement !== null) containers.add(section.parentElement);
            }
            for (const container of containers) {
              container.removeAttribute(ORDER_ATTR);
              container.style.display = '';
              container.style.flexDirection = '';
            }
            styleTag.remove();
          };
        }, 'workspace-pin: sidebar');
      },
    };
  },
});
