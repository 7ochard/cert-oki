# Third-party notices

Cert-oki uses HarmonyOS Sans SC, Stack Sans Headline and Raleway. The bundled font binaries are unchanged from the existing application.

| Bundled file | Copyright and license | License source |
| --- | --- | --- |
| HarmonyOS_Sans_SC_Regular.ttf | Copyright 2021 Huawei Device Co., Ltd. All Rights Reserved. HarmonyOS Sans Fonts License Agreement. | https://github.com/openharmony/global_system_resources/blob/master/LICENSE_Fonts |
| StackSansHeadline-Regular.ttf | Copyright 2025 The Stack Sans Project Authors. SIL Open Font License 1.1. | https://github.com/google/fonts/blob/main/ofl/stacksansheadline/OFL.txt |
| Raleway-Heavy.ttf | Copyright 2010–2012 Matt McInerney, Pablo Impallari, Rodrigo Fuenzalida; Reserved Font Name Raleway. SIL Open Font License 1.1. | https://github.com/google/fonts/blob/main/ofl/raleway/OFL.txt |

The Raleway copyright above comes from the bundled file's embedded name table. The accompanying upstream OFL file also contains the current Raleway Project Authors notice. Original font licenses are in `source/public/fonts/licenses/` in the repository and `app/fonts/licenses/` in the startup ZIP.

Runtime dependencies include React, React DOM, bwip-js, jsPDF, JSZip, Lucide and qrcode, plus their transitive dependencies. The exact versions are pinned in `source/package-lock.json`. Release attachments include copies of available dependency license/notice files under `third-party-licenses/`.

No new license is assigned to Cert-oki's own source code by this release. Third-party materials remain subject to their respective licenses.
