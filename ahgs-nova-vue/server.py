# -*- coding: utf-8 -*-
"""AHGS NOVA 本地启动脚本（仅用标准库，无需安装任何依赖）。

用法:
    python server.py            # 默认 http://localhost:8000
    python server.py 8080       # 指定端口

说明:
  页面本身是纯静态文件；AHGS 平台后端已开启 CORS，因此页面会直接
  访问平台接口（默认 http://10.201.186.15:8090，可在页面右上角 ⚙ 修改）。
"""
import http.server
import os
import sys
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"AHGS NOVA (Vue) 已启动:  http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
