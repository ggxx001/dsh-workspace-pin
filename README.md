# 工作区置顶（dsh-workspace-pin）

侧栏「工作区」的每一行现在有三个按钮：**📌 置顶 · ⋯ 省略 · ＋ 新会话**。
点 📌 把该工作区钉到列表最前；再点一次取消。顺序记在本机，刷新、重启都还在。

## 是什么

DSH 原本只有 **会话** 能置顶（注册表里的 pinnedSessionIds），**工作区** 只有一条
拖拽排出来的 workspaceIds 顺序，没有置顶这回事；工作区行也没有可扩展的 slot
（ui-workspace 只给会话行留了 sidebar.workspaces.session.menu.item 和
.row.action）。

所以本插件在 DOM 层补这一块，底线和 dsh-pet 的设置页图标补丁一致：

- **不改写 React 管的节点** —— 只往行的动作区插入一个新 <button>，只往行和分组上打
  data-*，只给分组写 style.order；
- **排序靠 CSS** —— 把工作区列表容器临时变成纵向 flex（display:flex），置顶的分组
  order:0..n-1，其余 order:1000+。DOM 顺序、拖拽、React 的 key 全都不动。
- **失效也是静默的** —— DSH 改了 CSS Modules 类名后缀时按钮不出现，但不会弄坏界面。

## 装

前提：本目录已经在磁盘上：D:/deepseek/plugins/dsh-workspace-pin。

~~~powershell
pwsh -File D:/deepseek/plugins/dsh-workspace-pin/install.ps1
~~~

脚本做三件事，全部可回滚：

1. 在 %DSH_HOME%/profiles/desktop/node_modules/@ggxx/ 建一个指向本目录的 Junction；
2. 在 profile 的 package.json 里加上 dependencies 和 dsh.profile.bundles 两项
   （改之前备份成 package.json.bak-workspace-pin-<时间戳>）；
3. 打印「重启 App」。

然后 **退出并重启 DSH NEXT**（托盘菜单 / 设置里的「退出并重启」）。Client 插件随
Host 启动装配，不重启不会加载。

不想要了：

~~~powershell
pwsh -File D:/deepseek/plugins/dsh-workspace-pin/uninstall.ps1
~~~

## 用

1. 侧栏「工作区」下面任意一行，鼠标移上去 → 最左边出现 📌；
2. 点一下：该工作区跳到列表最前，行首的文件夹图标换成蓝色图钉；
3. 再点一下：取消置顶，回到原来的位置；
4. 多个置顶时，**最近钉的排最前**；
5. 置顶状态存在 localStorage 的 dsh.workspace-pin.v1（工作区 id 数组）。

## 自测

不需要浏览器，用最小 DOM 替身跑一遍逻辑：

~~~powershell
node test/dom.node.mjs
~~~

覆盖：按钮插入位置、复用行内按钮样式、「未分组」跳过、置顶排序、取消置顶、最近置顶
优先、重复装配幂等、卸载清理。

## 排序是怎么算的（v0.2）

每个工作区分组拿到一个整数 order：置顶的按「最近置顶在前」编号 0..n-1，其余（包括
「未分组」）按 DOM 顺序编号 1000+。**「未分组」也必须参与编号** —— 它的默认
order: 0 会插到置顶项中间，这就是 0.1 版「点了置顶却没跳到最高」的原因。

容器（div[role="tree"]）的 display:flex 直接写在元素内联样式上，不只靠样式表；
取消最后一个置顶时会把这些内联样式和 order 一起清空，恢复原状。

## 出问题怎么查

插件每次同步都会往 localStorage 的 dsh.workspace-pin.debug 写一份自检快照：

    {"v":2,"rows":3,"entries":3,"pins":["4e774442","dbf513a2"],
     "containers":[{"role":"tree","cls":"cIzfCa_list","n":3,"display":"flex"}],
     "orders":[["4e774442","0"],["dbf513a2","1"],["","1002"]]}

rows = 找到几个工作区行，entries = 参与排序的分组数，orders = 每个 id 拿到的 order。
改完 client.js 后在 App 里按 **Ctrl+R** 就会重新从磁盘加载，不用重启。

## 局限

- 只重排**顶层**工作区；「按工作区树」里被嵌套的子工作区即使置顶，也跟着父级走。
- 置顶是**纯前端**的：宿主注册表里 workspaceIds 的顺序没变，所以 ① 换机器/清缓存后
  置顶丢失；② 别的客户端（手机 Web）看到的仍是原顺序。
- 置顶只在**分组视图**（默认）里有意义；「在一条列表」里没有工作区行，按钮不出现。

## 文件

| 文件 | 作用 |
| --- | --- |
| client.js | 全部逻辑：注入 CSS、插入按钮、算 order、读写 localStorage |
| index.js | Host 半，空的（本插件只有前端） |
| cordis.patch.yml | bundle patch：把插件插进 loader |
| locale/*.json | 插件列表里显示的标题与说明 |
| install.ps1 / uninstall.ps1 | 装 / 卸 |
| test/dom.node.mjs | 无浏览器自测 |
