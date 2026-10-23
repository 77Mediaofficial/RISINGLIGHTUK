# Local preview that behaves like GitHub Pages for this project site:
#   http://127.0.0.1:4433/RISINGLIGHTUK/        -> index.html
#   /RISINGLIGHTUK/work                          -> work.html (clean address)
#   any missing address                          -> 404.html with status 404
# Run from the repo root:  py _src/tools/serve.py [port]
import http.server, os, socketserver, sys

PREFIX = '/RISINGLIGHTUK'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def send_head(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        if path in ('', '/'):
            self.send_response(302); self.send_header('Location', PREFIX + '/'); self.end_headers(); return None
        if not path.startswith(PREFIX + '/') and path != PREFIX:
            return self.not_found()
        rel = path[len(PREFIX):] or '/'
        fs = os.path.join(ROOT, rel.lstrip('/').replace('/', os.sep))
        if rel.endswith('/'):
            fs = os.path.join(fs, 'index.html')
        elif not os.path.exists(fs) and os.path.exists(fs + '.html'):
            fs = fs + '.html'
        top = rel.lstrip('/').split('/', 1)[0]
        if not os.path.isfile(fs) or top.startswith('_') or top.startswith('.'):
            return self.not_found()
        self.path = '/' + os.path.relpath(fs, ROOT).replace(os.sep, '/')
        return super().send_head()

    def not_found(self):
        body = open(os.path.join(ROOT, '404.html'), 'rb').read()
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4433
print('serving %s at http://127.0.0.1:%d%s/' % (ROOT, port, PREFIX), flush=True)
S(('127.0.0.1', port), H).serve_forever()
