# Cert-oki 团队开发启动说明

## 1. 项目说明

`Cert-oki` 是一个基于 Vite + React + TypeScript 的合格证 / EAN 条码编辑工具。

主要能力：
- 合格证字段编辑、批量生成、单张不同内容预览。
- EAN-13 条码生成与 SVG / JPG / PDF / ZIP 导出。
- 后续可把 `src/core` 内的纯生成逻辑继续拆给 Figma 插件复用。

## 2. 环境要求

推荐环境：
- Node.js：`20.x` 或更高版本。
- npm：`10.x` 或更高版本。

当前打包机器已验证版本：

```powershell
node -v
# v22.14.0

npm -v
# 11.14.1
```

首次打开项目前，请先安装 Node.js。Windows 团队成员建议安装 Node.js LTS 版本。

## 3. 首次安装

解压项目后进入项目目录：

```powershell
cd "cert-oki\source"
npm install
```

如果需要严格按锁定版本安装，可以使用：

```powershell
npm ci
```

## 4. 本机启动

只给自己电脑浏览器使用：

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

打开：

```text
http://127.0.0.1:5173/
```

如果 `5173` 被占用，换一个端口：

```powershell
npm run dev -- --host 127.0.0.1 --port 5174
```

## 5. 局域网启动

需要给同一个局域网内其他成员访问时，用：

```powershell
npm run dev -- --host 0.0.0.0 --port 5173
```

查看当前电脑局域网 IP：

```powershell
ipconfig | findstr /i "IPv4"
```

团队成员访问：

```text
http://你的局域网IP:5173/
```

例如：

```text
http://192.168.1.20:5173/
```

如果 Windows 防火墙弹窗，允许 Node.js / Vite 访问专用网络。

## 6. 测试与构建

运行单元测试：

```powershell
npm test
```

如果机器内存较小，先设置 Node 内存：

```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm test
```

生产构建：

```powershell
npm run build
```

预览生产构建：

```powershell
npm run preview -- --host 0.0.0.0 --port 4173
```

## 7. 常用目录

```text
src/main.tsx              主界面与交互逻辑
src/styles.css            界面样式
src/core/certificate.ts   合格证 SVG / JPG / PDF / ZIP 生成逻辑
src/core/generator.ts     条码 / 二维码生成逻辑
src/core/batch.ts         批量递增与校验位逻辑
src/core/types.ts         公共类型
src/test/generator.test.ts 单元测试
public/fonts              项目内置字体
```

## 8. 字体配置

当前项目字体放在：

```text
public/fonts
```

团队开发时不需要额外安装这些字体到系统，浏览器会从项目目录加载。

如果新增字体：
1. 把 `.ttf` / `.otf` 放入 `public/fonts`。
2. 在 `src/styles.css` 添加 `@font-face`。
3. 在 `src/main.tsx` 的字体选项中追加对应名称和值。

## 9. 常见问题

### 端口启动失败

如果提示端口占用，换端口：

```powershell
npm run dev -- --host 0.0.0.0 --port 5174
```

### 局域网成员打不开

检查三点：
- 启动命令必须使用 `--host 0.0.0.0`。
- 访问地址必须是启动电脑的局域网 IP，不是 `127.0.0.1`。
- Windows 防火墙需要允许 Node.js 访问专用网络。

### 复制画板失败

浏览器剪贴板 API 通常只在 `localhost`、`127.0.0.1` 或 HTTPS 下稳定可用。局域网 IP 页面可能被部分浏览器限制。

如果局域网成员复制失败，先用导出 SVG / ZIP 文件；后续如果要稳定跨设备复制，需要把页面部署到 HTTPS 或增加专门的 Figma 插件插入逻辑。

### 修改字段后预览没有变化

优先检查：
- 当前选中的合格证是否正确。
- 左侧字段是否被小眼睛隐藏。
- 自定义字段是否已加入合格证布局顺序。

## 10. 开发建议

- UI 改动优先改 `src/main.tsx` 和 `src/styles.css`。
- 合格证输出版式优先改 `src/core/certificate.ts`。
- 条码能力优先改 `src/core/generator.ts`。
- 每次交付前至少运行：

```powershell
npm test
npm run build
```
