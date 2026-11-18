"""Запуск локального сервера игры без дополнительных библиотек."""
import errno
import functools
import http.server
import sys
import webbrowser
from pathlib import Path


class GameServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = False


def write_port_file(path, port):
    path.write_text(str(port), encoding='ascii')


def main():
    directory = Path(__file__).resolve().parent
    port_file = directory / '.server-port'
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    try:
        with GameServer(('127.0.0.1', 8000), handler) as server:
            port = server.server_port
            write_port_file(port_file, port)
            try:
                route = 'deer/' if '--deer' in sys.argv else ''
                address = f'http://127.0.0.1:{port}/{route}'
                print(f'Игра запущена: {address}', flush=True)
                print('Оставьте это окно открытым во время игры. Чтобы остановить сервер, закройте окно.', flush=True)
                if '--no-browser' not in sys.argv:
                    if not webbrowser.open(address):
                        print('Не удалось открыть браузер автоматически. Откройте адрес выше вручную.', flush=True)
                server.serve_forever()
            finally:
                # Do not remove the port of another instance started later.
                try:
                    if port_file.read_text(encoding='ascii').strip() == str(port):
                        port_file.unlink()
                except FileNotFoundError:
                    pass
    except KeyboardInterrupt:
        print('\nИгра остановлена.', flush=True)
    except OSError as error:
        if error.errno == errno.EADDRINUSE or getattr(error, 'winerror', None) == 10048:
            print('Порт 8000 уже занят. Закройте окно другого сервера и запустите игру снова.', flush=True)
        else:
            print(f'Не удалось запустить сервер: {error}', flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
