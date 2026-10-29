# Figma 合格证尺寸清单维护说明

## 1. 清单范围与文件关系

`certificate-sizes.json` 保存合格证尺寸、分页面数量和对象定位信息；本文件解释统计口径与维护方法。

统计来源是同一个 [Figma 设计文件](https://www.figma.com/design/JxmqUNYk2Gx5UZugvM5oV8)，文件标识为 `JxmqUNYk2Gx5UZugvM5oV8`。Figma 文件内含多个页面，页面内又含画板、组、矩形、文字等对象。JSON 中的 `pageName` 指 Figma 页面名称，不是另一个文件。

本次快照日期为 **2026-10-29**，时区为 **Asia/Shanghai**。共检查 **17 个页面**，得到 **8 种独立合格证尺寸、127 个独立成品外框、16 条按尺寸和页面拆分的记录**。16 条记录不代表 16 个不同页面，同一页面可出现在多种尺寸下。

另记录 **5 张雪服合格证拼版参考图片**。这些图片与独立成品外框分开统计，未计入上述 127 个对象。图片内部单张合格证没有独立图层，无法由现有图层精确读取其尺寸，因此 `singleCertificateSize` 为 `null`。

这是一次读取结果的静态快照。修改 Figma 后，JSON 不会自动同步；链接仍能打开，也不代表尺寸和数量已经刷新。

## 2. 尺寸与计数口径

- **单位与方向：** 使用 Figma 成品对象的 `width × height`，单位为 `px`，保留有意义的小数，展示精度为两位。旋转对象仍以其自身宽高记录，避免用旋转后的轴对齐包围盒替代成品尺寸。
- **统计单元：** 一个完整合格证成品外框计为一个画布对象。背景、文字、装饰、内部组件以及包住多张合格证的拼版容器不重复计数。外层组若被标注撑大，应定位实际成品外框。
- **数量含义：** `count` 是文件中的对象数量，不是印刷份数、产品件数或去重后的设计款数。重复设计、补打版本和参考对象，只要具有完整独立成品外框，均按实际对象计数。`includesPrintQuantitiesInNames: false` 表示图层名称里的“20 张”等印量说明不参与数量加总。
- **尺寸不跨比例合并：** `80 × 120` 与 `400 × 600` 即使长宽比相同，也保留为两个尺寸。这里只记录当前画布尺寸，不推断两者的制作比例或印刷用途。
- **历史标题不替代测量：** 页面或图层标题里的 `40 × 60 mm` 等文字可能是历史命名，不作为实际对象尺寸。`px` 不能直接换算为 `mm`；换算需要另行确认导出比例、分辨率或印刷规格。
- **拼版单独记录：** `montageImages` 中的宽高是整张图片的尺寸。图片内部的间距、缩放及裁切边界未分层，不能用整图宽高直接除以行列数，宣称得到精确的单张尺寸。

本次还排除了标题残片、拼版外层容器，以及不构成完整合格证的条码校对标签；具体分类见 `excludedCategories`。拼版容器内已识别的独立成品仍正常计入，不能因排除外层容器而一并漏计。

## 3. JSON 字段说明

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 数据结构版本；字段结构发生不兼容变化时更新。 |
| `snapshotDate`、`timezone` | 本次统计日期与日期解释所用时区。 |
| `source` | 来源文件的 key、名称、链接和本次检查的页面数。 |
| `unit` | 尺寸单位，本清单为 `px`。 |
| `measurement` | 测量字段、精度、宽高方向、计数单元、重复／补打对象是否纳入，以及名称中的印量是否参与计数的约定。 |
| `summary` | 尺寸种类数、独立成品外框总数、分页面记录数和拼版图片数。 |
| `sizes[]` | 一种宽高对应一条记录；`count` 为该尺寸所有页面的合计。 |
| `sizes[].occurrences[]` | 该尺寸在一个页面上的记录，含页面 ID、页面名和该页面数量。 |
| `sampleNodeId`、`sampleNodeName`、`sampleUrl` | 该页面该尺寸的一个代表对象及定位链接，便于快速抽查。 |
| `nodeIds` | 当前分页面记录所包含对象的完整 ID 名单，长度应等于该记录的 `count`。 |
| `montageImages[]` | 单独记录的拼版图片，包含所属页面、对象信息、整图宽高和链接；每张 `count` 为 1。 |
| `singleCertificateSize` | 拼版内部单张合格证尺寸；本次无法精确读取，使用 `null` 表示未知。 |
| `excludedCategories` | 未作为独立合格证统计的对象类别与原因。 |

**代表链接不包含全部对象。** `sampleUrl` 只定位到该页面中一个对应尺寸的代表对象；该行数量是该页面该尺寸的总数。需要逐个复核时，使用同条记录的完整 `nodeIds`，不要把代表对象链接当成完整名单。

独立对象的定位链接使用以下形式，节点 ID 中的冒号在 URL 参数中写成连字符：

```text
https://www.figma.com/design/<fileKey>?node-id=<nodeId>
```

例如，节点 ID `270:231` 对应参数 `node-id=270-231`。`pageId` 表示所属页面，不能代替成品对象的 ID。

## 4. 更新步骤

1. 打开 `source.fileUrl`，确认文件 key 与名称；枚举当前全部页面，记录本次实际检查的页面数。
2. 结合页面名、祖先层级、节点名和合格证正文查找对象；逐页检查，避免只搜索名为“合格证”的画板而漏掉未命名对象。
3. 根据第 2 节确定每张成品的外框，读取其自身 `width`、`height` 与节点 ID。对分组、拼版、旋转、参考图片及有外围标注的对象进行视觉核对。
4. 按宽高分组，再按页面分组，保存每组完整 `nodeIds`；从同组选择一个代表对象，填写其名称和链接。尺寸归并只能消除测量中的浮点噪声，不能擅自合并真实的小数差异或同比例对象。
5. 单独维护 `montageImages` 和 `excludedCategories`。未分层拼版内部的单张尺寸继续保留为未知，直到取得可精确测量的独立对象。
6. 从明细重新计算 `summary`，更新快照日期和来源信息。若口径改变，同时修改 `measurement` 和本说明，解释与旧快照不可直接比较的地方。
7. 执行下方检查，再在 Figma 中抽查每种尺寸的代表对象；核对所属页面、实际宽高和完整成品边界。JSON 内部一致性通过，不等于已经重新验证 Figma 实物内容。

## 5. PowerShell 一致性检查

在本目录打开 PowerShell 后执行。示例仅使用 PowerShell 内置命令，不创建文件，也不读取或修改 Figma。

```powershell
$inventoryPath = Join-Path (Get-Location) 'certificate-sizes.json'
$inventory = Get-Content -LiteralPath $inventoryPath -Raw -Encoding UTF8 |
    ConvertFrom-Json -ErrorAction Stop

$standaloneIds = @()
$pageBreakdownCount = 0

foreach ($size in $inventory.sizes) {
    $pageTotal = ($size.occurrences | Measure-Object -Property count -Sum).Sum
    if ($pageTotal -ne $size.count) {
        throw "尺寸 $($size.width) x $($size.height) 的页面数量加总不符"
    }

    foreach ($occurrence in $size.occurrences) {
        $pageBreakdownCount++
        $ids = @($occurrence.nodeIds)
        if ($ids.Count -ne $occurrence.count) {
            throw "页面 $($occurrence.pageName) 的 nodeIds 数量不符"
        }
        if ($occurrence.sampleNodeId -notin $ids) {
            throw "代表对象不在页面 $($occurrence.pageName) 的完整名单内"
        }
        $standaloneIds += $ids
    }
}

$standaloneTotal = ($inventory.sizes | Measure-Object -Property count -Sum).Sum
$montageTotal = ($inventory.montageImages | Measure-Object -Property count -Sum).Sum

if (@($inventory.sizes).Count -ne $inventory.summary.sizeVariantCount) {
    throw '尺寸种类数与 summary 不符'
}
if ($standaloneTotal -ne $inventory.summary.standaloneFrameCount) {
    throw '独立成品外框总数与 summary 不符'
}
if ($pageBreakdownCount -ne $inventory.summary.pageBreakdownCount) {
    throw '分页面记录数与 summary 不符'
}
if ($montageTotal -ne $inventory.summary.montageImageCount) {
    throw '拼版图片总数与 summary 不符'
}

$allObjectIds = @($standaloneIds) + @(
    $inventory.montageImages | ForEach-Object { $_.nodeId }
)
$duplicateIds = @($allObjectIds | Group-Object | Where-Object { $_.Count -gt 1 })
if ($duplicateIds.Count -gt 0) {
    throw "存在重复统计的对象 ID：$($duplicateIds.Name -join ', ')"
}

[pscustomobject]@{
    Check = 'PASS'
    SizeVariantCount = @($inventory.sizes).Count
    StandaloneFrameCount = $standaloneTotal
    PageBreakdownCount = $pageBreakdownCount
    MontageImageCount = $montageTotal
}
```

本次快照的预期结果为 `PASS / 8 / 127 / 16 / 5`。唯一性检查针对实际统计对象：各条 `nodeIds` 和拼版的 `nodeId` 不能重复；`sampleNodeId` 本来就应引用同组 `nodeIds` 中的对象，不作为第二次计数。页面 ID 可以在多个尺寸记录中重复。

检查失败时，应先核对明细及 Figma 来源，再修正数据；不要只修改 `summary` 让检查通过。
