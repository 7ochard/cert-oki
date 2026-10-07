#!/bin/bash
set -e

cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "这台电脑没有找到 Python 3，无法启动本地网页服务。" buttons {"好"} default button "好"'
  exit 1
fi

PORT="$(python3 - <<'PY'
import socket
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind(("127.0.0.1", 0))
    print(s.getsockname()[1])
PY
)"

URL="http://127.0.0.1:${PORT}/"
echo "Cert-oki 正在启动..."
echo "地址：${URL}"
echo "关闭这个窗口就会停止服务。"

open "${URL}"
cd app
python3 -m http.server "${PORT}" --bind 127.0.0.1
