# -*- coding: utf-8 -*-
"""AHGS NOVA 本地启动脚本（仅标准库，无需安装任何依赖）。

用法:
    python server.py            # 默认 http://localhost:8000
    python server.py 8080       # 指定端口

说明:
  页面本身是纯静态文件；AHGS 平台后端已开启 CORS，因此页面会直接
  访问平台接口（默认地址见 js/utils.js 或页面右上角 ⚙ 设置）。
  静态响应带 Cache-Control: no-cache，改动文件后普通刷新即可生效。
"""
import http.server
import os
import sys
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"AHGS NOVA 已启动:  http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
