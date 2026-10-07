# Cert-oki

**当前版本：0.1.0-alpha.1 · 开发预览版（Alpha）· 项目尚未完成。**

用于编辑、批量生成服装合格证与条码的本地网页工具，基于 React、TypeScript 和 Vite。

## 下载使用

在 [GitHub Releases](https://github.com/7ochard/cert-oki/releases/tag/v0.1.0-alpha.1) 下载 `Cert-oki-v0.1.0-alpha.1.zip`，完整解压后运行：

- Windows：双击 `启动 Windows.bat`，需要 Python 3 及其 `py` 启动器。
- Mac：运行 `双击启动.command`，需要 Python 3；如不能执行，在解压目录运行 `chmod +x 双击启动.command` 后重试。
- 启动脚本显示本地地址并尝试打开浏览器；若没有自动打开，手动访问终端显示的地址。关闭终端即可停止服务。

启动包无需安装 npm 依赖。源码仓库不包含构建产物，直接下载仓库 ZIP 不能替代 Release 启动包。

## 已有功能

- 合格证公共信息与逐张明细、批量编辑及预览。
- 条码与二维码生成、整批或单张输出范围。
- 合格证 SVG、JPG、PDF 导出；整批 JPG 为 ZIP。
- 条码 SVG 导出、SVG 与 Illustrator 复制入口。

## 开发

需要 Node.js 20 或更高版本及 npm。此次发布验证使用 Node.js 24.19.0、npm 11.19.0。

```sh
git clone https://github.com/7ochard/cert-oki.git
cd cert-oki/source
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

开发地址为 http://127.0.0.1:5173/ 。

```sh
npm test
npm run build
```

构建输出在 `source/dist`。`source/scripts/publish.ps1` 用于已有本地启动包的备份更新，需要先在 `Cert-oki-one-click/app` 放入已有网页；首次克隆后应先构建，使用 `dist` 或下载 Release 启动包。

## 已知限制与验证范围

- **刷新或关闭页面会丢失编辑内容**，目前没有草稿持久化；请先导出。
- 字段中的产品、企业、标准与条码数据是现有示例，使用前需替换并核对。
- Illustrator 桌面实际粘贴与各浏览器剪贴板授权组合尚未完整验收。
- 尚未完成全面移动端、扫码设备和无障碍检查。
- Mac 启动脚本随包提供，但尚未进行 Mac 实机验收。
- 构建存在较大 JavaScript 分块提示；本次未进行性能重构。
- 自动化测试通过只说明已覆盖的行为，不表示整个项目开发完成。

详细操作见 [开发与使用说明](开发与使用说明.md)，版本变化见 [CHANGELOG](CHANGELOG.md)。

## 字体与第三方声明

本应用使用 **HarmonyOS Sans SC、Stack Sans Headline 和 Raleway**。字体保持现有二进制不变，版权与原始许可见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) 和 `source/public/fonts/licenses/`；启动包包含同样声明。

本次仅公开发布项目，**未为项目源码新增开源许可证**。第三方组件和字体仍适用各自许可证。
